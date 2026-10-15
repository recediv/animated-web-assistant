import { readFile, readdir, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';

const directory = resolve(import.meta.dirname, '../dist/assistant/1.0.0');
const js = await readFile(resolve(directory, 'assistant.iife.js'));
await stat(resolve(directory, 'runtime.js'));
const runtimeFiles = (await readdir(directory, { recursive: true })).filter((name) =>
  name.endsWith('.js') && !['assistant.iife.js', 'assistant.js', 'demo-adapter.js'].includes(name));
const runtimeGzip = (await Promise.all(runtimeFiles.map(async (name) =>
  gzipSync(await readFile(resolve(directory, name))).length))).reduce((total, bytes) => total + bytes, 0);
const css = await readFile(resolve(directory, 'assistant.css'));
const adapter = await readFile(resolve(directory, 'demo-adapter.js'));
const poster = await stat(resolve(directory, 'poster.webp'));
const atlas = await stat(resolve(directory, 'atlas.webp'));
const manifestFile = await readFile(resolve(directory, 'atlas.json'));
const manifest = JSON.parse(manifestFile.toString('utf8'));
const sheets = Object.values(manifest.atlases ?? {});
const supplementalBytes = (await Promise.all(sheets.map(async (sheet) => {
  if (!/^[a-z0-9-]+\.webp$/.test(sheet.file)) throw new Error('Invalid supplemental atlas filename');
  return (await stat(resolve(directory, sheet.file))).size;
}))).reduce((total, bytes) => total + bytes, 0);
const checks = [
  { name: 'Assistant loader + runtime + demo adapter + CSS gzip', value: gzipSync(js).length + runtimeGzip + gzipSync(adapter).length + gzipSync(css).length, limit: 120 * 1024 },
  { name: 'Poster', value: poster.size, limit: 40 * 1024 },
  { name: 'Atlases + manifest', value: atlas.size + supplementalBytes + manifestFile.length, limit: 1.5 * 1024 * 1024 },
];
let failed = false;
for (const check of checks) {
  const ok = check.value <= check.limit;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${check.name}: ${(check.value / 1024).toFixed(2)} / ${(check.limit / 1024).toFixed(2)} KiB`);
  failed ||= !ok;
}
const dimensionOk = [manifest.atlas, ...sheets].every((sheet) => sheet?.width > 0 && sheet?.height > 0 && sheet.width <= 2048 && sheet.height <= 2048);
console.log(`${dimensionOk ? 'PASS' : 'FAIL'} Atlas dimensions: ${manifest.atlas?.width} × ${manifest.atlas?.height}`);
if (failed || !dimensionOk) process.exitCode = 1;
