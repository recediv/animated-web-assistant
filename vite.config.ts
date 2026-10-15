import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  const library = mode === 'library';
  return {
    base: '/',
    publicDir: false,
    server: { port: 5173, strictPort: true },
    preview: { port: 4173, strictPort: true },
    build: library
      ? {
          outDir: 'dist/assistant/1.0.0',
          emptyOutDir: true,
          target: ['chrome111', 'edge111', 'firefox114', 'safari16.4'],
          lib: {
            entry: { assistant: resolve(import.meta.dirname, 'src/index.ts'), runtime: resolve(import.meta.dirname, 'src/core/runtime.ts') },
            formats: ['es'],
            fileName: (_format, entryName) => `${entryName}.js`,
          },
          rollupOptions: { output: { exports: 'named' } },
        }
      : {
          outDir: 'dist',
          emptyOutDir: true,
          target: ['chrome111', 'edge111', 'firefox114', 'safari16.4'],
        },
    plugins: [
      {
        name: 'assistant-development-assets',
        configureServer(server) {
          server.middlewares.use(async (request, response, next) => {
            const path = request.url?.split('?')[0];
            const asset = path?.startsWith('/assistant/1.0.0/') ? path.slice('/assistant/1.0.0/'.length) : null;
            if (!asset || !['poster.webp', 'atlas.webp', 'reactions.webp', 'personality.webp', 'leisure.webp', 'guitar.webp', 'push.webp', 'atlas.json', 'assistant.css'].includes(asset)) { next(); return; }
            try {
              const { readFile } = await import('node:fs/promises');
              const source = asset === 'assistant.css' ? 'src/ui/assistant.css' : `assets/exported/${asset}`;
              response.setHeader('Content-Type', asset.endsWith('.webp') ? 'image/webp' : asset.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/json');
              response.end(await readFile(resolve(import.meta.dirname, source)));
            } catch { response.statusCode = 404; response.end('Asset not found'); }
          });
        },
      },
    ],
  };
});
