import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, relative, sep, extname } from 'node:path';
import ts from 'typescript';
import * as cssTree from 'css-tree';

export function normalizeDistributionBase(value) {
  assert.equal(typeof value, 'string', 'distribution base must be a path');
  assert.ok(
    value.startsWith('/') && !value.startsWith('//'),
    'distribution base must start with /',
  );
  assert.ok(!/[?#\\]/u.test(value), 'distribution base cannot contain a query, hash or backslash');
  const base = value.endsWith('/') ? value : `${value}/`;
  const url = new URL(base, 'https://distribution.invalid');
  assert.equal(url.pathname, base, 'distribution base cannot contain relative path segments');
  for (const part of base.split('/').filter(Boolean)) {
    const decoded = decodeURIComponent(part);
    assert.ok(
      !['.', '..'].includes(decoded) && !/[/\\]/u.test(decoded),
      'invalid distribution base segment',
    );
  }
  return base;
}

export function distributionBaseFromHtml(html) {
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/giu)) {
    if (!/\bname=["']site-base["']/iu.test(tag)) continue;
    const value = tag.match(/\bcontent=["']([^"']*)["']/iu)?.[1];
    assert.ok(value, 'site-base meta requires a content path');
    return normalizeDistributionBase(value);
  }
  return '/';
}

// Resolve references as a browser would below the published base. This checks
// generated files, so an unresolved source URL cannot silently survive a build.
export async function verifyDistribution(directory, requestedBase) {
  const root = resolve(directory);
  const declaredBase = distributionBaseFromHtml(
    await readFile(resolve(root, 'index.html'), 'utf8'),
  );
  const base =
    requestedBase === undefined ? declaredBase : normalizeDistributionBase(requestedBase);
  assert.equal(base, declaredBase, 'requested base differs from the generated site-base meta');
  const files = [];
  async function list(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = resolve(path, entry.name);
      if (entry.isDirectory()) await list(file);
      else files.push(file);
    }
  }
  await list(root);
  const references = [];
  const assetTargets = new Set();
  let cssUrls = 0;
  let moduleImports = 0;
  function reference(value, file, kind) {
    if (!value || value.startsWith('#') || /^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(value)) return;
    if (kind === 'module') {
      assert.ok(
        value.startsWith('.') || value.startsWith('/'),
        `${relative(root, file)}: unresolved bare module ${value}`,
      );
      moduleImports += 1;
    }
    const pathname = relative(root, file).split(sep).join('/');
    const url = new URL(value, `https://distribution.invalid${base}${pathname}`);
    assert.ok(
      url.pathname.startsWith(base),
      `${pathname}: reference escapes published base ${base}: ${value}`,
    );
    const target = resolve(root, decodeURIComponent(url.pathname.slice(base.length)));
    assert.ok(
      target.startsWith(`${root}${sep}`),
      `${pathname}: reference escapes distribution: ${value}`,
    );
    references.push({ file, value, target });
    assetTargets.add(target);
  }
  for (const file of files) {
    const extension = extname(file);
    if (!['.css', '.js', '.html'].includes(extension)) continue;
    const source = await readFile(file, 'utf8');
    if (extension === '.css') {
      cssTree.walk(cssTree.parse(source), {
        enter(node) {
          if (node.type === 'Url') {
            cssUrls += 1;
            reference(node.value, file, 'asset');
          } else if (node.type === 'Atrule' && node.name === 'import') {
            const first = node.prelude?.children?.first;
            if (first?.type === 'String') reference(first.value, file, 'asset');
          }
        },
      });
    } else if (extension === '.js') {
      const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      function visitPreloadAssets(node) {
        if (ts.isArrayLiteralExpression(node)) {
          for (const item of node.elements) {
            if (ts.isStringLiteralLike(item) && item.text.startsWith('assets/'))
              reference(`${base}${item.text}`, file, 'asset');
          }
        }
        ts.forEachChild(node, visitPreloadAssets);
      }
      function visit(node) {
        // Vite's dependency map includes CSS loaded only with lazy modules;
        // these files otherwise have no static HTML/ESM reference to inspect.
        if (
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.name.text === '__vite__mapDeps' &&
          node.initializer
        )
          visitPreloadAssets(node.initializer);
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier)
        )
          reference(node.moduleSpecifier.text, file, 'module');
        if (
          ts.isCallExpression(node) &&
          node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          node.arguments[0] &&
          ts.isStringLiteralLike(node.arguments[0])
        )
          reference(node.arguments[0].text, file, 'module');
        if (
          ts.isNewExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'URL' &&
          node.arguments?.[0] &&
          ts.isStringLiteralLike(node.arguments[0]) &&
          node.arguments[1]?.getText(ast) === 'import.meta.url'
        )
          reference(node.arguments[0].text, file, 'asset');
        ts.forEachChild(node, visit);
      }
      visit(ast);
    } else {
      for (const tag of source.matchAll(/<(?:script|link|img)\b[^>]*>/giu)) {
        if (
          /^<link\b/iu.test(tag[0]) &&
          !/\brel=["'](?:stylesheet|modulepreload)["']/iu.test(tag[0])
        )
          continue;
        const value = tag[0].match(/\b(?:src|href)=["']([^"']+)["']/iu)?.[1];
        if (value) reference(value, file, 'asset');
      }
    }
  }
  for (const { file, value, target } of references) {
    let exists = false;
    try {
      exists = (await stat(target)).isFile();
    } catch {
      /* Report the referring file and URL below. */
    }
    assert.ok(
      exists,
      `${relative(root, file)}: missing distribution resource ${value} -> ${relative(root, target)}`,
    );
  }
  return { base, files: files.length, cssUrls, moduleImports, resources: assetTargets.size };
}
