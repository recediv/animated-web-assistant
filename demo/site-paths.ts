/** Resolve the same routes for local development and a GitHub Pages project site. */
export function createSitePaths(base = '/') {
  const segments = base.trim().split('/').filter(Boolean);
  const prefix = segments.length ? `/${segments.join('/')}` : '';
  const siteBase = `${prefix}/`;

  function routePath(pathname: string): string | null {
    if (prefix && pathname !== prefix && !pathname.startsWith(siteBase)) return null;
    const path = prefix ? pathname.slice(prefix.length) : pathname;
    return path.replace(/\/+$/, '') || '/';
  }

  // Accept logical routes so a deployment at /catalog/ can still serve /catalog.
  function siteUrl(path: string): string {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|[?#])/i.test(path)) return path;
    const absolutePath = path.startsWith('/') ? path : `/${path}`;
    return `${prefix}${absolutePath}`;
  }

  return { siteBase, siteUrl, routePath };
}

const configuredBase =
  typeof document === 'undefined'
    ? '/'
    : document.querySelector<HTMLMetaElement>('meta[name="site-base"]')?.content || '/';

export const { siteBase, siteUrl, routePath } = createSitePaths(configuredBase);
