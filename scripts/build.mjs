import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { prepareCompiledTree } from './transpile.mjs';
import { siteBase } from './site-base.mjs';
import { createPageEntries } from './create-page-entries.mjs';

const workspace = resolve(import.meta.dirname, '..');
const root = await prepareCompiledTree('build', [
  'src',
  'demo',
  'assets/exported/art',
  'assets/fonts',
]);
const html = (await readFile(resolve(workspace, 'index.html'), 'utf8'))
  .replace('/demo/main.ts', '/demo/main.js')
  .replace('name="site-base" content="/"', `name="site-base" content="${siteBase}"`);
await writeFile(resolve(root, 'index.html'), html, 'utf8');

const common = {
  root,
  configFile: false,
  publicDir: false,
  base: siteBase,
  esbuild: false,
  resolve: { preserveSymlinks: true },
};
const buildOptions = {
  emptyOutDir: true,
  // Source is already ES2022. Avoid child-process transpilers in restricted environments.
  target: 'esnext',
  minify: false,
  cssMinify: false,
  assetsInlineLimit: 0,
};
await build({ ...common, build: { ...buildOptions, outDir: resolve(workspace, 'dist') } });
const { products } = await import(pathToFileURL(resolve(root, 'demo/products.js')).href);
await createPageEntries(resolve(workspace, 'dist'), products);
await build({
  ...common,
  build: {
    ...buildOptions,
    outDir: resolve(workspace, 'dist/assistant/1.0.0'),
    lib: {
      entry: {
        assistant: resolve(root, 'src/index.js'),
        runtime: resolve(root, 'src/core/runtime.js'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: { output: { exports: 'named' } },
  },
});
await build({
  ...common,
  build: {
    ...buildOptions,
    emptyOutDir: false,
    outDir: resolve(workspace, 'dist/assistant/1.0.0'),
    lib: {
      entry: resolve(root, 'src/browser.js'),
      name: 'AnimeShopAssistant',
      formats: ['iife'],
      fileName: () => 'assistant.iife.js',
    },
    rollupOptions: { output: { exports: 'named' } },
  },
});
await build({
  ...common,
  build: {
    ...buildOptions,
    emptyOutDir: false,
    outDir: resolve(workspace, 'dist/assistant/1.0.0'),
    lib: {
      entry: resolve(root, 'src/adapters/demo.js'),
      formats: ['es'],
      fileName: () => 'demo-adapter.js',
    },
    rollupOptions: { output: { exports: 'named' } },
  },
});
