import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '../..');
const server = await createServer({
  root,
  configFile: resolve(root, 'vite.config.ts'),
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { host: '127.0.0.1', port: 0, strictPort: false },
});

try {
  await server.listen();
  const address = server.httpServer.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  const loadAsset = async (filename, type, source) => {
    const response = await fetch(`${origin}/assistant/1.0.0/${filename}?v=review`);
    const body = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200, `${filename} is available over HTTP`);
    assert.ok(
      response.headers.get('content-type')?.startsWith(type),
      `${filename} has ${type} MIME type`,
    );
    assert.deepEqual(
      body,
      await readFile(resolve(root, source)),
      `${filename} serves the actual asset bytes`,
    );
    return body;
  };

  const manifest = JSON.parse(
    await loadAsset('atlas.json', 'application/json', 'assets/exported/atlas.json'),
  );
  const atlases = new Set([
    'atlas.webp',
    ...Object.values(manifest.atlases ?? {}).map((sheet) => sheet.file),
  ]);
  for (const filename of ['poster.webp', ...atlases]) {
    const body = await loadAsset(filename, 'image/webp', `assets/exported/${filename}`);
    assert.equal(body.subarray(0, 4).toString(), 'RIFF', `${filename} has a WebP container`);
    assert.equal(body.subarray(8, 12).toString(), 'WEBP', `${filename} has a WebP signature`);
  }
  await loadAsset('assistant.css', 'text/css', 'src/ui/assistant.css');
  console.log(
    `PASS Vite assets: manifest, poster, ${atlases.size} atlases and stylesheet have correct MIME types and exact file bytes over HTTP.`,
  );
} finally {
  await server.close();
}
