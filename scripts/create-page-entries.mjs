import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Pages serves directories, without the SPA fallback supplied by a dev server.
// Use actual HTML entries so shared links and reloads return HTTP 200.
export async function createPageEntries(directory, products) {
  const html = await readFile(resolve(directory, 'index.html'), 'utf8');
  const routes = [
    'catalog',
    'new',
    'cart',
    'checkout',
    'delivery',
    'contacts',
    'payment',
    'account',
    ...products.map((product) => `product/${product.id}`),
  ];
  for (const route of routes) {
    if (!/^(?:[a-z0-9-]+\/)*[a-z0-9-]+$/u.test(route))
      throw new Error(`Unsafe static page route: ${route}`);
    const destination = resolve(directory, route);
    await mkdir(destination, { recursive: true });
    await writeFile(resolve(destination, 'index.html'), html, 'utf8');
  }
  // Unknown URLs still show the shop's missing-story page with working assets.
  await writeFile(resolve(directory, '404.html'), html, 'utf8');
  await writeFile(resolve(directory, '.nojekyll'), '', 'utf8');
  console.log(`Static page entries generated: ${routes.length + 1} routes and 404.html.`);
}
