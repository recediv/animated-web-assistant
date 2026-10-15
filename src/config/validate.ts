import type { AssistantConfig, AssistantTexts, PageType, ShopContext, ShopEvent } from './types';

const PAGE_TYPES: PageType[] = [
  'home', 'catalog', 'product', 'cart', 'checkout', 'payment', 'account', 'other',
];

export const DEFAULT_TEXTS: AssistantTexts = {
  greeting: 'Привет! Помогу найти карточки и информацию о магазине',
  findCards: 'Найти карточки',
  newArrivals: 'Новинки',
  cart: 'Корзина',
  delivery: 'Доставка и оплата',
  contacts: 'Связаться с магазином',
  settings: 'Настройки',
  categoriesTitle: 'Какие карточки ищешь?',
  back: 'Назад',
  allCatalog: 'Открыть весь каталог',
  motion: 'Отключить анимацию',
  hide: 'Скрыть помощника',
  launcher: 'Помощник магазина',
  close: 'Закрыть помощника',
  restore: 'Помощник',
};

export const DEFAULT_TIMINGS: AssistantConfig['timings'] = {
  greetingDelayMs: 5000,
  greetingRepeatDays: 30,
  sleepAfterMs: 60000,
  cartReactionCooldownMs: 5000,
  idleDesktopMs: 16000,
  idleCompactMs: 24000,
  attentionDelayMs: 18000,
};

export interface ConfigValidationResult {
  config: AssistantConfig | null;
  errors: string[];
  warnings: string[];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && [...value].length <= maximum;
}

function isPageType(value: unknown): value is PageType {
  return typeof value === 'string' && PAGE_TYPES.includes(value as PageType);
}

export function normalizeInternalUrl(value: unknown, baseUrl: string): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const base = new URL(baseUrl);
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== base.origin) return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function validateConfig(
  input: unknown,
  baseUrl = typeof location === 'undefined' ? 'http://localhost/' : location.href,
): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isRecord(input)) return { config: null, errors: ['Configuration must be an object.'], warnings };
  if (input.schemaVersion !== 1) errors.push('schemaVersion must be 1.');
  if (typeof input.enabled !== 'boolean') errors.push('enabled must be a boolean.');
  if (!isText(input.locale, 80)) errors.push('locale must contain 1–80 characters.');
  if (!isText(input.title, 80)) errors.push('title must contain 1–80 characters.');

  const routes = {} as AssistantConfig['routes'];
  for (const key of ['catalog', 'newArrivals', 'cart', 'delivery', 'contacts'] as const) {
    const url = normalizeInternalUrl(isRecord(input.routes) ? input.routes[key] : null, baseUrl);
    if (!url) errors.push(`routes.${key}: a same-origin HTTP(S) URL is required.`);
    else routes[key] = url;
  }
  const assets = {} as AssistantConfig['assets'];
  for (const key of ['poster', 'atlas', 'manifest', 'cssUrl'] as const) {
    const raw = isRecord(input.assets) ? input.assets[key] : null;
    // External CSS supports strict style-src policies.
    const fallback = key === 'cssUrl' && raw === undefined ? '/assistant/1.0.0/assistant.css' : raw;
    const url = normalizeInternalUrl(fallback, baseUrl);
    if (!url) errors.push(`assets.${key}: a same-origin HTTP(S) URL is required.`);
    else assets[key] = url;
  }
  const texts = { ...DEFAULT_TEXTS };
  if (input.texts !== undefined && !isRecord(input.texts)) warnings.push('texts reset to defaults.');
  if (isRecord(input.texts)) {
    for (const key of Object.keys(DEFAULT_TEXTS) as (keyof AssistantTexts)[]) {
      const value = input.texts[key];
      if (value === undefined) continue;
      if (isText(value, key === 'greeting' ? 120 : 80)) texts[key] = value;
      else warnings.push(`texts.${key} reset to default.`);
    }
  }
  const categories: AssistantConfig['categories'] = [];
  const ids = new Set<string>();
  if (input.categories !== undefined && !Array.isArray(input.categories)) warnings.push('categories must be an array.');
  if (Array.isArray(input.categories)) {
    input.categories.forEach((category: unknown, index: number) => {
      const href = isRecord(category) ? normalizeInternalUrl(category.href, baseUrl) : null;
      if (!isRecord(category) || !isText(category.id, 80) || !/^[a-z0-9_-]+$/i.test(category.id) ||
          !isText(category.label, 80) || !href || ids.has(category.id) || categories.length >= 8) {
        warnings.push(`categories[${index}] skipped: invalid, duplicate or exceeds the limit of 8.`);
        return;
      }
      ids.add(category.id);
      categories.push({ id: category.id, label: category.label, href });
    });
  }
  const timings = { ...DEFAULT_TIMINGS };
  if (input.timings !== undefined && !isRecord(input.timings)) warnings.push('timings reset to defaults.');
  if (isRecord(input.timings)) {
    for (const key of Object.keys(DEFAULT_TIMINGS) as (keyof typeof DEFAULT_TIMINGS)[]) {
      const value = input.timings[key];
      if (value === undefined) continue;
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 2147483647) timings[key] = value;
      else warnings.push(`timings.${key} reset to default.`);
    }
  }
  const disabledPageTypes: PageType[] = ['payment', 'account'];
  if (Array.isArray(input.disabledPageTypes)) {
    for (const item of input.disabledPageTypes) {
      if (isPageType(item) && !disabledPageTypes.includes(item)) disabledPageTypes.push(item);
      else if (!isPageType(item)) warnings.push('Unknown disabledPageType skipped.');
    }
  } else if (input.disabledPageTypes !== undefined) warnings.push('disabledPageTypes reset to defaults.');
  if (input.position !== undefined && !['right', 'left'].includes(String(input.position))) warnings.push('position reset to right.');
  if (input.behavior !== undefined && !['calm', 'lively'].includes(String(input.behavior))) warnings.push('behavior reset to calm.');
  if (input.analyticsEnabled !== undefined && typeof input.analyticsEnabled !== 'boolean') warnings.push('analyticsEnabled reset to false.');
  if (errors.length) return { config: null, errors, warnings };
  return {
    config: {
      schemaVersion: 1,
      enabled: input.enabled as boolean,
      locale: input.locale as string,
      title: input.title as string,
      position: input.position === 'left' ? 'left' : 'right',
      behavior: input.behavior === 'lively' ? 'lively' : 'calm',
      disabledPageTypes,
      routes,
      categories,
      assets,
      timings,
      texts,
      analyticsEnabled: input.analyticsEnabled === true,
    },
    errors,
    warnings,
  };
}

export function validateShopContext(value: unknown): value is ShopContext {
  if (!isRecord(value) || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 ||
      !isText(value.pageKey, 1024) || !isPageType(value.pageType) ||
      !(value.cartCount === null || (Number.isSafeInteger(value.cartCount) && (value.cartCount as number) >= 0)) ||
      !isRecord(value.ui) || !isRecord(value.permissions)) return false;
  return typeof value.ui.floatingAllowed === 'boolean' && typeof value.ui.bottomReservedPx === 'number' &&
    Number.isFinite(value.ui.bottomReservedPx) && value.ui.bottomReservedPx >= 0 &&
    Array.isArray(value.ui.blockers) && value.ui.blockers.every((item: unknown) => isText(item, 80)) &&
    typeof value.permissions.persistentSettings === 'boolean' && typeof value.permissions.analytics === 'boolean';
}

export function validateShopEvent(value: unknown): value is ShopEvent {
  if (!isRecord(value)) return false;
  if (value.type === 'context') return validateShopContext(value.context);
  if (value.type === 'interaction') return ['product:enter', 'product:leave', 'cart:error'].includes(String(value.kind));
  return value.type === 'cart:added' && isText(value.id, 256) &&
    typeof value.occurredAt === 'number' && Number.isFinite(value.occurredAt) && value.occurredAt >= 0 &&
    Number.isSafeInteger(value.quantity) && (value.quantity as number) > 0;
}
