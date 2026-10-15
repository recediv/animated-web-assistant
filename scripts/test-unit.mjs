import { startVitest } from 'vitest/node';
import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prepareCompiledTree } from './transpile.mjs';

const root = await prepareCompiledTree('unit');
await mkdir(resolve(root, 'assets/exported'), { recursive: true });
await copyFile(
  resolve(import.meta.dirname, '../assets/exported/atlas.json'),
  resolve(root, 'assets/exported/atlas.json'),
);
await mkdir(resolve(root, 'assets/source'), { recursive: true });
for (const source of ['motion-poses.mjs', 'mohlik.mjs']) {
  await copyFile(
    resolve(import.meta.dirname, '../assets/source', source),
    resolve(root, 'assets/source', source),
  );
}
const filter = process.argv
  .slice(2)
  .filter((argument) => !argument.startsWith('-'))
  .map((argument) => argument.replace(/\.ts$/, '.js'));
const instance = await startVitest(
  'test',
  filter,
  {
    root,
    config: false,
    run: true,
    include: ['tests/unit/**/*.test.js'],
    environment: 'jsdom',
    pool: 'threads',
    maxWorkers: 1,
    minWorkers: 1,
    restoreMocks: true,
    clearMocks: true,
  },
  { configFile: false, esbuild: false, resolve: { preserveSymlinks: true } },
);
await instance?.close();
