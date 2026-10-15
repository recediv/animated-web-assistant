import type { AssistantAnalyticsEvent, PageType, ShopAdapter, ShopContext, ShopEvent } from '../config/types';
import { createHistoryOverlayAdapter } from './history';

export type DemoContextPatch = Partial<Omit<ShopContext, 'revision' | 'ui' | 'permissions'>> & {
  ui?: Partial<ShopContext['ui']>;
  permissions?: Partial<ShopContext['permissions']>;
};

export interface DemoAdapterOptions {
  navigate?: ShopAdapter['navigate'];
  openCart?: ShopAdapter['openCart'];
  track?: (event: AssistantAnalyticsEvent) => void;
  window?: Window;
  context?: DemoContextPatch;
}

export interface DemoAdapter extends ShopAdapter {
  update(patch: DemoContextPatch): ShopContext;
  setPage(pageType: PageType, pageKey: string): ShopContext;
  confirmCartAdd(id: string, quantity?: number): void;
  emit(event: ShopEvent): void;
  readonly subscriberCount: number;
}

function clone(context: ShopContext): ShopContext {
  return { ...context, ui: { ...context.ui, blockers: [...context.ui.blockers] }, permissions: { ...context.permissions } };
}

export function createDemoAdapter(options: DemoAdapterOptions = {}): DemoAdapter {
  const target = options.window ?? window;
  const history = createHistoryOverlayAdapter(target);
  const initial = options.context;
  let context: ShopContext = {
    revision: 0,
    pageKey: initial?.pageKey ?? target.location.pathname,
    pageType: initial?.pageType ?? 'home',
    cartCount: initial?.cartCount === undefined ? 0 : initial.cartCount,
    ui: { floatingAllowed: true, bottomReservedPx: 0, blockers: [], ...initial?.ui },
    permissions: { persistentSettings: true, analytics: false, ...initial?.permissions },
  };
  const listeners = new Set<(event: ShopEvent) => void>();
  const emit = (event: ShopEvent) => {
    for (const listener of [...listeners]) {
      try { listener(event); } catch { /* The demo store keeps operating when a subscriber fails. */ }
    }
  };
  const update = (patch: DemoContextPatch): ShopContext => {
    context = {
      ...context, ...patch, revision: context.revision + 1,
      ui: { ...context.ui, ...patch.ui },
      permissions: { ...context.permissions, ...patch.permissions },
    };
    context = clone(context);
    emit({ type: 'context', context: clone(context) });
    return clone(context);
  };
  return {
    getContext() { return clone(context); },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    navigate(href) {
      if (options.navigate) return options.navigate(href);
      target.location.assign(href);
    },
    openCart() {
      if (options.openCart) return options.openCart();
      target.location.assign('/cart');
    },
    enterOverlay: history.enterOverlay,
    track: options.track,
    update,
    setPage(pageType, pageKey) { return update({ pageType, pageKey }); },
    confirmCartAdd(id, quantity = 1) {
      if (!id || !Number.isSafeInteger(quantity) || quantity <= 0) return;
      update({ cartCount: context.cartCount === null ? null : context.cartCount + quantity });
      emit({ type: 'cart:added', id, quantity, occurredAt: Date.now() });
    },
    emit,
    get subscriberCount() { return listeners.size; },
  };
}
