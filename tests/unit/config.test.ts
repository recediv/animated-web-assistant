import { describe, expect, it } from 'vitest';
import { DEFAULT_TEXTS, normalizeInternalUrl, validateConfig, validateShopContext, validateShopEvent } from '../../src/config/validate';
import configFixture from '../../demo/assistant.config.json';

const base = 'https://shop.example/catalog';

describe('configuration validation', () => {
  it('normalizes demo routes and applies safe defaults', () => {
    const result = validateConfig(configFixture, base);
    expect(result.errors).toEqual([]);
    expect(result.config?.routes.catalog).toBe('https://shop.example/catalog');
    expect(result.config?.texts).toEqual({ ...DEFAULT_TEXTS, ...configFixture.texts });
    expect(validateConfig({ ...configFixture, texts: undefined }, base).config?.texts).toEqual(DEFAULT_TEXTS);
    expect(result.config?.assets.cssUrl).toBe('https://shop.example/assistant/1.0.0/assistant.css');
  });

  it('allows checkout and retains payment/account exclusions and configured disabled pages', () => {
    const result = validateConfig({ ...configFixture, disabledPageTypes: ['other'] }, base);
    expect(result.config?.disabledPageTypes).toEqual(['payment', 'account', 'other']);
    expect(validateConfig({ ...configFixture, disabledPageTypes: ['checkout'] }, base).config?.disabledPageTypes).toContain('checkout');
  });

  it('keeps calm defaults while allowing an explicitly lively demo profile', () => {
    const calm = validateConfig({ ...configFixture, behavior: undefined, timings: undefined }, base);
    expect(calm.config?.behavior).toBe('calm');
    expect(calm.config?.timings).toMatchObject({ greetingDelayMs: 5000, idleDesktopMs: 16000, idleCompactMs: 24000, attentionDelayMs: 18000 });
    const lively = validateConfig(configFixture, base);
    expect(lively.config?.behavior).toBe('lively');
    expect(lively.config?.timings).toMatchObject({ greetingDelayMs: 1500, idleDesktopMs: 3500, idleCompactMs: 5000, sleepAfterMs: 90000 });
    const invalid = validateConfig({ ...configFixture, behavior: 'hyperactive' }, base);
    expect(invalid.config?.behavior).toBe('calm');
    expect(invalid.warnings).toContain('behavior reset to calm.');
  });

  it.each(['javascript:alert(1)', 'data:text/html,unsafe', 'https://foreign.example/path', '//foreign.example/path', 'https://user:password@shop.example/path'])('rejects unsafe or external route %s', (route) => {
    const result = validateConfig({ ...configFixture, routes: { ...configFixture.routes, cart: route } }, base);
    expect(result.config).toBeNull();
    expect(result.errors.some((error) => error.includes('routes.cart'))).toBe(true);
  });

  it('removes invalid, duplicate and excess categories without disabling the widget', () => {
    const categories = Array.from({ length: 10 }, (_, index) => ({ id: `category-${index}`, label: `Category ${index}`, href: `/catalog/${index}` }));
    categories.unshift({ id: 'bad', label: 'External route', href: 'https://foreign.example/' });
    categories.push({ id: 'category-0', label: 'Duplicate', href: '/catalog' });
    const result = validateConfig({ ...configFixture, categories }, base);
    expect(result.config?.categories).toHaveLength(8);
    expect(result.warnings).toHaveLength(4);
  });

  it('enforces text limits and recovers from invalid optional values', () => {
    const result = validateConfig({ ...configFixture, texts: { greeting: 'x'.repeat(121), cart: 'x'.repeat(81) }, timings: { greetingDelayMs: Number.NaN }, position: 'center' }, base);
    expect(result.config?.texts.greeting).toBe(DEFAULT_TEXTS.greeting);
    expect(result.config?.texts.cart).toBe(DEFAULT_TEXTS.cart);
    expect(result.config?.position).toBe('right');
    expect(result.config?.timings.greetingDelayMs).toBe(5000);
    expect(validateConfig({ ...configFixture, title: 'x'.repeat(81) }, base).config).toBeNull();
  });

  it('does not throw for malformed shapes or invalid base URLs', () => {
    for (const value of [null, [], 1, 'config', {}, { enabled: true }]) expect(() => validateConfig(value, base)).not.toThrow();
    expect(normalizeInternalUrl('/catalog', 'invalid base')).toBeNull();
  });
});

describe('shop contract validation', () => {
  const context = { revision: 0, pageKey: 'home-1', pageType: 'home', cartCount: null, ui: { floatingAllowed: true, bottomReservedPx: 64, blockers: ['search'] }, permissions: { persistentSettings: true, analytics: false } };
  it('preserves unknown cart state and validates complete blocker snapshots', () => {
    expect(validateShopContext(context)).toBe(true);
    expect(validateShopContext({ ...context, revision: -1 })).toBe(false);
    expect(validateShopContext({ ...context, cartCount: -1 })).toBe(false);
    expect(validateShopContext({ ...context, ui: { ...context.ui, blockers: [null] } })).toBe(false);
    expect(validateShopContext({ ...context, ui: { ...context.ui, bottomReservedPx: Infinity } })).toBe(false);
  });
  it('rejects malformed cart additions', () => {
    expect(validateShopEvent({ type: 'context', context })).toBe(true);
    expect(validateShopEvent({ type: 'cart:added', id: 'operation-1', occurredAt: Date.now(), quantity: 1 })).toBe(true);
    expect(validateShopEvent({ type: 'cart:added', id: 'operation-1', occurredAt: Date.now(), quantity: 0 })).toBe(false);
    expect(validateShopEvent({ type: 'cart:added', id: '', occurredAt: Date.now(), quantity: 1 })).toBe(false);
    expect(validateShopEvent({ type: 'cart:added', id: 'operation-1', occurredAt: Infinity, quantity: 1 })).toBe(false);
  });

  it('accepts only registered personality interaction kinds', () => {
    for (const kind of ['product:enter', 'product:leave', 'cart:error']) expect(validateShopEvent({ type: 'interaction', kind })).toBe(true);
    expect(validateShopEvent({ type: 'interaction', kind: 'arbitrary:message' })).toBe(false);
    expect(validateShopEvent({ type: 'interaction', kind: null })).toBe(false);
  });
});
