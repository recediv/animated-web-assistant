import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, unlink, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { verifyDistribution } from '../../scripts/check-distribution.mjs';

const workspace = resolve(import.meta.dirname, '../..');
const local = resolve(workspace, '.local/verification');
await mkdir(local, { recursive: true });
const prefix = resolve(local, '.tmp-distribution-assets-');
const directory = await mkdtemp(prefix);
assert.ok(directory.startsWith(prefix) && directory.startsWith(`${workspace}${sep}`));
const fixture = {
  'index.html':
    '<link rel="stylesheet" href="/assets/site.css"><script type="module" src="/assets/main.js"></script>',
  'assets/site.css':
    '@import "./theme.css";@font-face{font-family:Reader;src:url("./reader.woff2?v=1#font")}body{background-image:url("./cover.svg")}i{filter:url(#local);background:url(data:image/svg+xml,test)}',
  'assets/theme.css': 'body{color:#293f55}',
  'assets/reader.woff2': 'wOF2 fixture',
  'assets/cover.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
  'assets/main.js':
    'const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/lazy.js","assets/deferred.css"])))=>i.map(i=>d[i]);export {value} from "./shared.js";export const load=()=>import("./lazy.js");export const cover=new URL("./cover.svg",import.meta.url);const text="import(\'./not-a-real-import.js\')";',
  'assets/shared.js': 'export const value=1;',
  'assets/lazy.js': 'export const loaded=true;',
  'assets/deferred.css': '.deferred {color:#334455}',
};
try {
  await mkdir(resolve(directory, 'assets'));
  for (const [path, content] of Object.entries(fixture))
    await writeFile(resolve(directory, path), content);
  const success = await verifyDistribution(directory);
  assert.equal(
    success.cssUrls,
    4,
    'CSS URL parser handles fonts, images and local/data exclusions',
  );
  assert.equal(success.moduleImports, 2, 'AST finds static exports and dynamic literal imports');
  assert.equal(
    success.resources,
    8,
    'HTML entry, CSS imports, lazy CSS and query/hash references resolve',
  );
  for (const path of [
    'assets/reader.woff2',
    'assets/cover.svg',
    'assets/shared.js',
    'assets/lazy.js',
    'assets/theme.css',
    'assets/main.js',
    'assets/deferred.css',
  ]) {
    await unlink(resolve(directory, path));
    await assert.rejects(
      verifyDistribution(directory),
      (error) =>
        error.message.includes('missing distribution resource') &&
        error.message.includes(path.split('/').at(-1)),
      `missing ${path} must fail the production check`,
    );
    await writeFile(resolve(directory, path), fixture[path]);
  }
  await writeFile(resolve(directory, 'assets/main.js'), 'import "unbundled-runtime";');
  await assert.rejects(verifyDistribution(directory), /unresolved bare module/u);
  await writeFile(resolve(directory, 'assets/main.js'), fixture['assets/main.js']);
  for (const base of ['/shelf/', '/nested/shelf/']) {
    const html = `<meta content="${base}" name="site-base">${fixture['index.html'].replaceAll('/assets/', `${base}assets/`)}`;
    await writeFile(resolve(directory, 'index.html'), html);
    const prefixed = await verifyDistribution(directory);
    assert.equal(prefixed.base, base, 'published base is detected from generated HTML');
    assert.equal(
      prefixed.resources,
      success.resources,
      'relative CSS and ESM imports keep the published base',
    );
    assert.deepEqual(await verifyDistribution(directory, base.slice(0, -1)), prefixed);
    await assert.rejects(verifyDistribution(directory, '/another/'), /requested base differs/u);
    await writeFile(
      resolve(directory, 'index.html'),
      html.replace(`${base}assets/main.js`, '/assets/main.js'),
    );
    await assert.rejects(verifyDistribution(directory), /reference escapes published base/u);
    await writeFile(resolve(directory, 'index.html'), html);
    await writeFile(resolve(directory, 'assets/main.js'), 'import "../../outside.js";');
    await assert.rejects(verifyDistribution(directory), /reference escapes published base/u);
    await writeFile(resolve(directory, 'assets/main.js'), fixture['assets/main.js']);
  }
  for (const invalid of [
    '../shelf/',
    '//external/',
    '/shelf/?query=1',
    '/shelf/#fragment',
    '/shelf/../',
    '/%2e%2e/',
  ]) {
    await writeFile(
      resolve(directory, 'index.html'),
      `<meta name="site-base" content="${invalid}">`,
    );
    await assert.rejects(verifyDistribution(directory), /distribution base/u);
  }
  console.log(
    'PASS distribution assets: root and nested published bases, CSS/ESM dependencies, missing resources, invalid bases, escaped resources and parser exclusions.',
  );
} finally {
  // Only this verified workspace-local temporary fixture is removed.
  assert.ok(directory.startsWith(prefix) && directory.startsWith(`${workspace}${sep}`));
  await rm(directory, { recursive: true, force: true });
}
