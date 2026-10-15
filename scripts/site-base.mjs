// One setting for Vite, generated HTML and the separately copied mascot config.
export function normalizeSiteBase(value = '/') {
  const base = value || '/';
  if (
    !/^\/(?:[a-zA-Z0-9._-]+\/)*[a-zA-Z0-9._-]*$/u.test(base) ||
    base.split('/').some((segment) => segment === '.' || segment === '..')
  )
    throw new Error('SITE_BASE_PATH must be a local path such as / or /repository/.');
  return base.endsWith('/') ? base : `${base}/`;
}

export const siteBase = normalizeSiteBase(process.env.SITE_BASE_PATH);

export function siteUrl(path) {
  if (!path.startsWith('/') || path.startsWith('//') || siteBase === '/') return path;
  return `${siteBase}${path.slice(1)}`;
}
