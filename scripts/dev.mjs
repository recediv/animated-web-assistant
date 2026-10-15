import { createServer } from 'node:http';
import { watch } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const liveReload = !args.includes('--no-live-reload');
const valueAfter = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] ?? fallback : fallback;
const port = Number(valueAfter('--port', process.env.PORT ?? '5173'));
const host = valueAfter('--host', '127.0.0.1');
const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clients = new Set();
let reloadTimer;
const reloadScript = liveReload ? `<script>(()=>{let pending=false;const events=new EventSource('/__demo_events');const reload=()=>{if(document.hidden)pending=true;else location.reload();};events.addEventListener('reload',reload);events.addEventListener('ready',event=>{if(event.data!==${JSON.stringify(sessionId)})reload();});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&pending)location.reload();});})();</script>` : '';
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

async function findFile(path) {
  for (const candidate of [path, `${path}.ts`, `${path}.js`, resolve(path, 'index.ts')]) {
    try { if ((await stat(candidate)).isFile()) return candidate; } catch { /* Try next extension. */ }
  }
  return null;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${host}:${port}`);
    if (url.pathname === '/__demo_events') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      response.write(`event: ready\ndata: ${sessionId}\n\n`);
      clients.add(response);
      response.on('close', () => clients.delete(response));
      return;
    }
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.startsWith('/assistant/1.0.0/')) {
      const name = pathname.slice('/assistant/1.0.0/'.length);
      if (!['poster.webp', 'atlas.webp', 'reactions.webp', 'personality.webp', 'leisure.webp', 'push.webp', 'atlas.json', 'assistant.css'].includes(name)) {
        response.writeHead(404); response.end('Not found'); return;
      }
      pathname = name === 'assistant.css' ? '/src/ui/assistant.css' : `/assets/exported/${name}`;
    }
    const target = resolve(root, `.${pathname}`);
    if (target !== root && !target.startsWith(`${root}${sep}`)) {
      response.writeHead(403); response.end('Forbidden'); return;
    }
    let filename = await findFile(target);
    if (!filename && !extname(pathname)) filename = resolve(root, 'index.html');
    if (!filename) { response.writeHead(404); response.end('Not found'); return; }
    const extension = extname(filename);
    const source = await readFile(filename);
    response.setHeader('Cache-Control', 'no-store');
    if (extension === '.ts') {
      const output = ts.transpileModule(source.toString('utf8'), {
        fileName: filename,
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, useDefineForClassFields: true, isolatedModules: true },
      }).outputText.replace(/(\bimport\s*(?:[^'";]*?\sfrom\s*)?)(['"])([^'"]+\.css)\2/g, '$1$2$3?import$2');
      response.setHeader('Content-Type', mime['.js']);
      response.end(output);
    } else if (extension === '.css' && url.searchParams.has('import')) {
      response.setHeader('Content-Type', mime['.js']);
      response.end(`const href=${JSON.stringify(url.pathname)};const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link);export default href;`);
    } else if (extension === '.html') {
      response.setHeader('Content-Type', mime['.html']);
      response.end(source.toString('utf8').replace('</body>', `${reloadScript}</body>`));
    } else {
      response.setHeader('Content-Type', mime[extension] ?? 'application/octet-stream');
      response.end(source);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    response.writeHead(500); response.end('Development server error');
  }
});
const watchers = [];
for (const directory of liveReload ? ['src', 'demo', 'assets/exported'] : []) {
  try {
    watchers.push(watch(resolve(root, directory), { recursive: true }, () => {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => { for (const response of clients) response.write('event: reload\ndata: updated\n\n'); }, directory === 'assets/exported' ? 1500 : 180);
    }));
  } catch (error) { console.warn(`Live reload could not watch ${directory}: ${error.message}`); }
}
if (liveReload) watchers.push(watch(resolve(root, 'index.html'), () => {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => { for (const response of clients) response.write('event: reload\ndata: updated\n\n'); }, 180);
}));
server.on('close', () => { for (const watcher of watchers) watcher.close(); clearTimeout(reloadTimer); });
server.listen(port, host, () => console.log(`Demo: http://${host}:${port}/\nTypeScript is transformed in memory; live reload ${liveReload ? 'enabled' : 'disabled'}; production build uses Vite.`));
