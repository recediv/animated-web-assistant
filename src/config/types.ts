export type PageType =
  | 'home'
  | 'catalog'
  | 'product'
  | 'cart'
  | 'checkout'
  | 'payment'
  | 'account'
  | 'other';

export interface ShopContext {
  revision: number;
  pageKey: string;
  pageType: PageType;
  cartCount: number | null;
  ui: {
    floatingAllowed: boolean;
    bottomReservedPx: number;
    blockers: string[];
  };
  permissions: {
    persistentSettings: boolean;
    analytics: boolean;
  };
}

export type ShopEvent =
  | { type: 'context'; context: ShopContext }
  | { type: 'cart:added'; id: string; occurredAt: number; quantity: number }
  | { type: 'interaction'; kind: 'product:enter' | 'product:leave' | 'cart:error' };

export interface OverlaySession {
  close(): Promise<void>;
}

export interface AssistantAnalyticsEvent {
  name: 'shown' | 'opened' | 'action' | 'hidden' | 'restored' | 'motion_changed';
  widgetVersion: string;
  layout: 'desktop' | 'compact';
  actionId?: string;
}

export interface ShopAdapter {
  getContext(): ShopContext;
  subscribe(listener: (event: ShopEvent) => void): () => void;
  navigate(href: string): void | Promise<void>;
  openCart(): void | Promise<void>;
  enterOverlay(onBack: () => void): Promise<OverlaySession>;
  track?(event: AssistantAnalyticsEvent): void;
}

export type QuietScene = 'sit' | 'scratch' | 'ears' | 'stretch' | 'nose';
export type AssistantScene = 'stroll' | 'climb' | 'peek' | 'wiggle' | 'flip' | 'arrival' | QuietScene;

export interface AssistantInstance {
  open(): Promise<void>;
  close(): Promise<void>;
  hide(): Promise<void>;
  restore(): Promise<void>;
  setMotion?(motion: 'system' | 'off'): Promise<void>;
  /** Keep automatic movement still while a companion control is being used. */
  setInteractionHold?(hold: boolean): void;
  /** One finite eye direction update while companion controls hold the actor still. */
  lookAt?(point: { x: number; y: number }): void;
  preparePagePush?(side: 'left' | 'right'): Promise<boolean>;
  setPagePushProgress?(progress: number): void;
  finishPagePush?(): void;
  perform?(scene: AssistantScene): Promise<void>;
  destroy(): Promise<void>;
}

export interface InitOptions {
  configUrl: string;
  adapter: ShopAdapter;
  /** Cancel initialization before the runtime is ready. */
  signal?: AbortSignal;
}

export interface AssistantLibrary {
  init(options: InitOptions): Promise<AssistantInstance>;
}

export interface AssistantTexts {
  greeting: string;
  findCards: string;
  newArrivals: string;
  cart: string;
  delivery: string;
  contacts: string;
  settings: string;
  categoriesTitle: string;
  back: string;
  allCatalog: string;
  motion: string;
  hide: string;
  launcher: string;
  close: string;
  restore: string;
}

export interface AssistantConfig {
  schemaVersion: 1;
  enabled: boolean;
  locale: string;
  title: string;
  position: 'right' | 'left';
  behavior: 'calm' | 'lively';
  disabledPageTypes: PageType[];
  routes: {
    catalog: string;
    newArrivals: string;
    cart: string;
    delivery: string;
    contacts: string;
  };
  categories: { id: string; label: string; href: string }[];
  assets: { poster: string; atlas: string; manifest: string; cssUrl: string };
  timings: {
    greetingDelayMs: number;
    greetingRepeatDays: number;
    sleepAfterMs: number;
    cartReactionCooldownMs: number;
    idleDesktopMs: number;
    idleCompactMs: number;
    attentionDelayMs: number;
  };
  analyticsEnabled: boolean;
  texts: AssistantTexts;
}

export interface AssistantPreferences {
  schemaVersion: 1;
  hidden: boolean;
  motion: 'system' | 'off';
  lastGreetingAt: number | null;
}
