import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { siteUrl } from './site-base.mjs';

const root = resolve(import.meta.dirname, '..');
const destination = resolve(root, 'dist/assistant/1.0.0');
await mkdir(destination, { recursive: true });
await mkdir(resolve(root, 'dist/demo'), { recursive: true });
const manifest = JSON.parse(await readFile(resolve(root, 'assets/exported/atlas.json'), 'utf8'));
for (const filename of [
  'poster.webp',
  'atlas.webp',
  'atlas.json',
  ...Object.values(manifest.atlases ?? {}).map((sheet) => sheet.file),
]) {
  await copyFile(resolve(root, 'assets/exported', filename), resolve(destination, filename));
}
await copyFile(resolve(root, 'src/ui/assistant.css'), resolve(destination, 'assistant.css'));
const config = JSON.parse(await readFile(resolve(root, 'demo/assistant.config.json'), 'utf8'));
for (const [name, path] of Object.entries(config.routes)) config.routes[name] = siteUrl(path);
for (const category of config.categories) category.href = siteUrl(category.href);
for (const [name, path] of Object.entries(config.assets)) config.assets[name] = siteUrl(path);
await writeFile(
  resolve(root, 'dist/demo/assistant.config.json'),
  `${JSON.stringify(config, null, 2)}\n`,
  'utf8',
);
await mkdir(resolve(root, 'dist/fonts'), { recursive: true });
for (const filename of ['Neucha-OFL.txt', 'Nunito-OFL.txt']) {
  await copyFile(resolve(root, 'assets/fonts', filename), resolve(root, 'dist/fonts', filename));
}
await copyFile(resolve(root, 'LICENSE'), resolve(root, 'dist/LICENSE'));
await copyFile(resolve(root, 'LICENSE'), resolve(destination, 'LICENSE'));
console.log('Versioned assistant assets and demo configuration copied.');
