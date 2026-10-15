import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import * as cssTree from 'css-tree';

const widths = [320, 390, 760, 768, 1440];
function forWidth(source, width) {
  const ast = cssTree.parse(source);
  cssTree.walk(ast, {
    visit: 'Atrule',
    enter(node, item, list) {
      if (node.name !== 'media') return;
      const query = cssTree.generate(node.prelude);
      const max = query.match(/max-width:\s*(\d+)px/u);
      const min = query.match(/min-width:\s*(\d+)px/u);
      const active =
        (!max || width <= Number(max[1])) &&
        (!min || width >= Number(min[1])) &&
        !query.includes('prefers-reduced-motion:no-preference');
      if (active) list.replace(item, node.block.children);
      else list.remove(item);
      return this.skip;
    },
  });
  // cssstyle cannot combine a variable-valued border shorthand and a later
  // border longhand. Resolve only these fixed :root tokens to their actual
  // values, identically in both sheets; source and other variables stay intact.
  const rootTokens = new Map();
  cssTree.walk(ast, {
    visit: 'Rule',
    enter(node) {
      if (node.prelude.type !== 'SelectorList' || cssTree.generate(node.prelude) !== ':root')
        return;
      for (const declaration of node.block.children)
        if (declaration.type === 'Declaration' && declaration.property.startsWith('--'))
          rootTokens.set(declaration.property, cssTree.generate(declaration.value));
    },
  });
  cssTree.walk(ast, {
    visit: 'Declaration',
    enter(node) {
      if (!node.property.startsWith('border')) return;
      const value = cssTree
        .generate(node.value)
        .replace(/var\((--[\w-]+)(?:,[^)]*)?\)/gu, (match, name) => rootTokens.get(name) ?? match);
      node.value = cssTree.parse(value, { context: 'value' });
    },
  });
  return cssTree
    .generate(ast)
    .replaceAll(':hover', '[data-css-hover]')
    .replaceAll(':focus-visible', '[data-css-focus]')
    .replaceAll(':focus-within', '[data-css-focus-within]')
    .replaceAll(':focus', '[data-css-focus]');
}

function signature(element) {
  const path = [];
  for (let node = element; node; node = node.parentElement) {
    path.push(
      `${node.tagName}:${JSON.stringify([...node.attributes].map(({ name, value }) => [name, value]))}:${node.parentElement ? [...node.parentElement.children].indexOf(node) : 0}`,
    );
    if (node.id === 'app') break;
  }
  return path.join('/');
}

function snapshot(window, element) {
  const computed = window.getComputedStyle(element);
  return Object.fromEntries(
    Array.from({ length: computed.length }, (_, index) => computed[index])
      .sort()
      .map((property) => [property, computed.getPropertyValue(property)]),
  );
}

// Optional before/after proof used for conservative CSS cleanup. It reads the
// actual router DOM, including hidden dialogs, and compares every computed
// property of touched elements and descendants. It does not claim native layout.
export async function createCssComparison(path, currentSheets) {
  if (!path) return undefined;
  const baseline = await readFile(path, 'utf8');
  // The baseline is the imported CSS concatenated in its original order. It can
  // be generated from any Git revision outside the repository; no copied CSS
  // fixture is needed. Compare selectors whose authored rules changed.
  function rulesBySelector(source) {
    const rules = new Map();
    const context = [];
    let order = 0;
    cssTree.walk(cssTree.parse(source), {
      enter(node) {
        if (node.type === 'Atrule')
          context.push(`${node.name}:${node.prelude ? cssTree.generate(node.prelude) : ''}`);
        if (node.type !== 'Rule' || node.prelude.type !== 'SelectorList') return;
        order += 1;
        for (const selector of node.prelude.children) {
          const name = cssTree.generate(selector);
          const entries = rules.get(name) ?? [];
          entries.push(`${order}|${context.join('|')}|${cssTree.generate(node.block)}`);
          rules.set(name, entries);
        }
      },
      leave(node) {
        if (node.type === 'Atrule') context.pop();
      },
    });
    return rules;
  }
  const beforeRules = rulesBySelector(baseline);
  const afterRules = rulesBySelector(currentSheets.join('\n'));
  const touchedSelectors = [...new Set([...beforeRules.keys(), ...afterRules.keys()])]
    .filter(
      (selector) =>
        JSON.stringify(beforeRules.get(selector)) !== JSON.stringify(afterRules.get(selector)),
    )
    .map((selector) => selector.replace(/:(?:hover|focus-visible|focus-within|focus)\b/gu, ''));
  const comparison = { before: [baseline], after: currentSheets, touchedSelectors };
  const sheets = new Map(
    widths.map((width) => [
      width,
      {
        before: forWidth(comparison.before.join('\n'), width),
        after: forWidth(comparison.after.join('\n'), width),
      },
    ]),
  );
  const checked = new Set();
  let properties = 0;
  let cases = 0;
  return {
    check(document, label) {
      const candidates = new Set();
      const addCandidate = (element) => {
        if (!element.closest('head') && !element.matches('script,style,link'))
          candidates.add(element);
      };
      for (const selector of comparison.touchedSelectors) {
        for (const element of document.querySelectorAll(selector)) {
          addCandidate(element);
          for (const descendant of element.querySelectorAll('*')) addCandidate(descendant);
        }
      }
      const fresh = [...candidates].filter((element) => {
        const key = signature(element);
        if (checked.has(key)) return false;
        checked.add(key);
        return true;
      });
      if (!fresh.length) return;
      const originalElements = [...document.querySelectorAll('*')];
      const indexes = fresh.map((element) => originalElements.indexOf(element));
      const dom = new JSDOM(document.documentElement.outerHTML, { pretendToBeVisual: true });
      try {
        const copy = dom.window.document;
        for (const style of copy.querySelectorAll('style,link[rel="stylesheet"]')) style.remove();
        const copiedElements = [...copy.querySelectorAll('*')];
        // Removing head style nodes shifts indexes. Match by the same structural path.
        const bySignature = new Map(copiedElements.map((element) => [signature(element), element]));
        const targets = indexes.map((index) => bySignature.get(signature(originalElements[index])));
        assert.ok(targets.every(Boolean), `${label}: actual DOM elements survive comparison clone`);
        const style = copy.createElement('style');
        copy.head.append(style);
        for (const state of ['normal', 'hover', 'focus']) {
          for (const target of targets) {
            if (state === 'hover') {
              for (let node = target; node; node = node.parentElement)
                node.dataset.cssHover = 'true';
            } else if (state === 'focus') {
              target.dataset.cssFocus = 'true';
              for (let node = target; node; node = node.parentElement)
                node.dataset.cssFocusWithin = 'true';
            }
          }
          for (const [width, css] of sheets) {
            style.textContent = css.before;
            const before = targets.map((target) => snapshot(dom.window, target));
            style.textContent = css.after;
            targets.forEach((target, index) => {
              assert.deepEqual(
                snapshot(dom.window, target),
                before[index],
                `${label}: ${width}px ${state} ${signature(fresh[index])}`,
              );
              cases += 1;
              properties += Object.keys(before[index]).length;
            });
          }
          for (const node of copy.querySelectorAll(
            '[data-css-hover],[data-css-focus],[data-css-focus-within]',
          )) {
            delete node.dataset.cssHover;
            delete node.dataset.cssFocus;
            delete node.dataset.cssFocusWithin;
          }
        }
      } finally {
        dom.window.close();
      }
    },
    report() {
      return {
        elements: checked.size,
        cases,
        properties,
        widths,
        states: ['normal', 'hover', 'focus'],
        touchedSelectors: touchedSelectors.length,
      };
    },
  };
}
