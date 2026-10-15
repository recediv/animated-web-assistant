import { describe, expect, it } from 'vitest';
import { createSitePaths } from '../../demo/site-paths';

describe('GitHub Pages site paths', () => {
  it('keeps local and domain-root URLs unchanged', () => {
    const paths = createSitePaths('/');
    expect(paths.siteBase).toBe('/');
    expect(paths.siteUrl('/')).toBe('/');
    expect(paths.siteUrl('/catalog?category=lunara#collection')).toBe(
      '/catalog?category=lunara#collection',
    );
    expect(paths.routePath('/catalog/')).toBe('/catalog');
  });

  it('prefixes logical project routes and assets', () => {
    const paths = createSitePaths('/storybook/');
    expect(paths.siteBase).toBe('/storybook/');
    expect(paths.siteUrl('/')).toBe('/storybook/');
    expect(paths.siteUrl('/catalog?category=lunara#collection')).toBe(
      '/storybook/catalog?category=lunara#collection',
    );
    expect(paths.siteUrl('/demo/assistant.config.json')).toBe(
      '/storybook/demo/assistant.config.json',
    );
    expect(paths.siteUrl('/storybook/catalog')).toBe('/storybook/storybook/catalog');
    expect(paths.siteUrl('/storybook-other/catalog')).toBe('/storybook/storybook-other/catalog');
  });

  it.each(['catalog', 'new', 'cart', 'checkout', 'delivery'])(
    'keeps a logical route distinct from a same-named repository: %s',
    (name) => {
      const paths = createSitePaths(`/${name}/`);
      expect(paths.siteUrl(`/${name}`)).toBe(`/${name}/${name}`);
      expect(paths.siteUrl('/')).toBe(`/${name}/`);
      expect(paths.routePath(`/${name}/${name}`)).toBe(`/${name}`);
      expect(paths.routePath(`/${name}/`)).toBe('/');
    },
  );

  it('recognizes project entry pages and rejects adjacent sites on the same origin', () => {
    const paths = createSitePaths('/storybook/');
    expect(paths.routePath('/storybook')).toBe('/');
    expect(paths.routePath('/storybook/')).toBe('/');
    expect(paths.routePath('/storybook/product/sky-dragon/')).toBe('/product/sky-dragon');
    expect(paths.routePath('/storybook-other/catalog')).toBeNull();
    expect(paths.routePath('/catalog')).toBeNull();
    expect(paths.routePath('/')).toBeNull();
  });

  it.each([
    'https://example.com/catalog',
    'https://lumoli.example/outside',
    '//example.com/catalog',
    'mailto:hello@example.com',
    'data:text/plain,hello',
    '#main',
    '?category=lunara',
  ])('leaves standalone URLs and local references intact: %s', (url) => {
    expect(createSitePaths('/storybook/').siteUrl(url)).toBe(url);
  });

  it('normalizes configured slash boundaries', () => {
    const paths = createSitePaths(' /storybook//chapter/ ');
    expect(paths.siteBase).toBe('/storybook/chapter/');
    expect(paths.siteUrl('catalog')).toBe('/storybook/chapter/catalog');
    expect(paths.routePath('/storybook/chapter/catalog/')).toBe('/catalog');
  });
});
