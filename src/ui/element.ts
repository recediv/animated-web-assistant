import type { AssistantConfig, AssistantPreferences } from '../config/types';
import type { PanelScreen, ScenarioSnapshot } from '../core/scenarios';
import { calculatePlacement, visibleViewport, type Placement } from '../positioning/viewport';
import { calculateSpeechPlacement, type SpeechExclusion } from '../positioning/speech';

const paths: Record<string, string> = {
  close: 'M6 6l12 12M18 6L6 18', back: 'M15 5l-7 7 7 7', chevron: 'M9 5l7 7-7 7',
  cards: 'M7 3h12v16H7zM3 7v14h12M11 8h4M11 12h4', new: 'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
  cart: 'M4 7h16l-1 14H5zM8 7V5a4 4 0 018 0v2', delivery: 'M2 5h12v12H2zM14 9h4l4 4v4h-8M5 17a2 2 0 104 0M16 17a2 2 0 104 0',
  contacts: 'M4 17a9 9 0 1116 0M4 13h3v7H4zM17 13h3v7h-3zM17 20h-5',
  settings: 'M12 8a4 4 0 100 8 4 4 0 000-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  moon: 'M20 15A9 9 0 019 4a9 9 0 1011 11', hide: 'M3 3l18 18M9 5a12 12 0 0112 7 14 14 0 01-4 5M6 6a14 14 0 00-3 6 12 12 0 0013 7M9 9a4 4 0 006 6',
};
function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}
function icon(name: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `pika-a-icon${name === 'chevron' ? ' pika-a-chevron' : ''}`);
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', paths[name] ?? paths.cards!);
  svg.append(path);
  return svg;
}
function parachute(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 192 216');
  svg.setAttribute('class', 'pika-a-parachute');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const shapes: [string, string][] = [
    ['M6 60 L48 190 M62 60 L48 190 M128 60 L144 190 M186 60 L144 190', 'none'],
    ['M4 60 Q15 6 96 6 Q177 6 188 60 Q170 48 155 60 Q140 48 125 60 Q110 48 96 60 Q81 48 66 60 Q49 48 34 60 Q18 48 4 60Z', '#ffe67b'],
    ['M4 60 Q15 6 96 6 Q55 16 34 60 Q18 48 4 60Z', '#f18770'],
    ['M66 60 Q71 21 96 6 Q121 21 125 60 Q110 48 96 60 Q81 48 66 60Z', '#fff8db'],
    ['M96 6 Q177 6 188 60 Q170 48 155 60 Q140 16 96 6Z', '#f18770'],
  ];
  for (const [d, fill] of shapes) {
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', fill);
    svg.append(path);
  }
  return svg;
}
function button(label: string, className = ''): HTMLButtonElement {
  const result = node('button', `pika-a-button ${className}`);
  result.type = 'button';
  result.setAttribute('aria-label', label);
  return result;
}

export interface ViewActions {
  toggle(): void;
  close(returnFocus: boolean): void;
  screen(screen: PanelScreen): void;
  navigate(href: string, id: string): void;
  cart(): void;
  motion(): void;
  hide(): void;
  holdGreeting(hold: boolean): void;
  graphicsFailed?(): void;
}

export class AssistantElement extends HTMLElement {
  readonly shadow: ShadowRoot;
  readonly launcher = button('Открыть помощника магазина', 'pika-a-launcher');
  readonly canvas = node('canvas');
  poster = node('img');
  readonly dialog = node('dialog', 'pika-a-dialog');
  private root = node('div', 'pika-a-root');
  private header = node('header', 'pika-a-header');
  private body = node('div', 'pika-a-body');
  private heading = node('h2', 'pika-a-title');
  private back = button('Назад', 'pika-a-icon-button');
  private closeButton = button('Закрыть помощника', 'pika-a-icon-button');
  private grip = button('Потяните вниз, чтобы закрыть', 'pika-a-grip');
  private greeting = button('Открыть помощника', 'pika-a-greeting');
  private safe = node('span', 'pika-a-safe');
  private screen: PanelScreen | null = null;
  private cartCount: number | null = null;
  private motion: string | null = null;
  private compact = false;
  private greetingHeight = 96;
  private speechExclusion: SpeechExclusion | null = null;
  private bottomReserved = 0;
  private actions: ViewActions | null = null;
  private config: AssistantConfig | null = null;
  private abort = new AbortController();
  private dragStart: number | null = null;
  private dragDistance = 0;
  private cartButton: HTMLButtonElement | null = null;
  private motionButton: HTMLButtonElement | null = null;
  private hitSurface = node('canvas');
  private hitContext: CanvasRenderingContext2D | null = null;
  private hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
    this.dialog.id = 'pika-assistant-panel';
    this.heading.id = 'pika-assistant-heading';
    this.dialog.setAttribute('aria-labelledby', this.heading.id);
    this.launcher.setAttribute('aria-controls', this.dialog.id);
    this.launcher.setAttribute('aria-expanded', 'false');
    this.canvas.setAttribute('aria-hidden', 'true');
    this.poster.alt = '';
    this.poster.draggable = false;
    this.poster.setAttribute('aria-hidden', 'true');
    this.back.append(icon('back'));
    this.closeButton.append(icon('close'));
    const titleBox = node('div');
    titleBox.append(node('span', 'pika-a-eyebrow', 'МОХЛИК · СПУТНИК'), this.heading);
    this.header.append(this.back, titleBox, this.closeButton);
    const hitArea = document.createElementNS(this.hitPath.namespaceURI, 'svg');
    hitArea.setAttribute('viewBox', '0 0 96 96');
    hitArea.setAttribute('class', 'pika-a-hit-area');
    hitArea.setAttribute('aria-hidden', 'true');
    hitArea.setAttribute('focusable', 'false');
    // A small torso target remains usable before the first draw, or if the
    // browser cannot read pixels. Transparent sprite margins stay outside it.
    this.hitPath.setAttribute('d', 'M48 43a14 16 0 1 0 0 32a14 16 0 1 0 0 -32Z');
    hitArea.append(this.hitPath);
    this.launcher.append(parachute(), this.poster, this.canvas, hitArea);
    this.dialog.append(this.grip, this.header, this.body);
    this.root.append(this.launcher, this.dialog, this.greeting, this.safe);
    this.shadow.append(this.root);
    this.launcher.hidden = true;
    this.greeting.hidden = true;
  }

  updateHitRegion(): void {
    // Only this invisible input surface follows the opaque sprite pixels. The
    // artwork stays unclipped, including the ears, tail and airborne poses.
    try {
      if (!this.hitContext) {
        this.hitSurface.width = this.hitSurface.height = 96;
        this.hitContext = this.hitSurface.getContext('2d', { willReadFrequently: true });
      }
      const context = this.hitContext;
      if (!context?.getImageData) return;
      context.clearRect(0, 0, 96, 96);
      context.drawImage(this.canvas, 0, 0, 96, 96);
      const { data } = context.getImageData(0, 0, 96, 96);
      if (data.length !== 96 * 96 * 4) return;
      let path = '';
      for (let y = 0; y < 96; y++) {
        for (let x = 0; x < 96;) {
          if (data[(y * 96 + x) * 4 + 3]! < 32) { x++; continue; }
          const start = x++;
          while (x < 96 && data[(y * 96 + x) * 4 + 3]! >= 32) x++;
          path += `M${start} ${y}H${x}V${y + 1}H${start}Z`;
        }
      }
      if (path && this.hitPath.getAttribute('d') !== path) this.hitPath.setAttribute('d', path);
    } catch { /* Keep the last readable outline or the initial torso target. */ }
  }

  async setup(config: AssistantConfig, actions: ViewActions): Promise<boolean> {
    if (this.abort.signal.aborted) return false;
    this.config = config;
    this.actions = actions;
    this.launcher.setAttribute('aria-label', config.texts.launcher);
    if (config.behavior === 'lively') {
      this.launcher.setAttribute('aria-label', 'Погладить или перетащить Мохлика');
      this.launcher.removeAttribute('aria-controls');
      this.launcher.removeAttribute('aria-expanded');
      this.greeting.removeAttribute('aria-label');
      this.greeting.setAttribute('aria-live', 'polite');
    }
    this.closeButton.setAttribute('aria-label', config.texts.close);
    this.back.setAttribute('aria-label', config.texts.back);
    this.greeting.textContent = config.texts.greeting;
    this.poster.addEventListener('error', () => {
      this.root.hidden = true;
      this.launcher.hidden = true;
      this.greeting.hidden = true;
      this.close();
      actions.graphicsFailed?.();
    }, { signal: this.abort.signal });
    this.poster.addEventListener('load', () => {
      if (this.canvas.hidden) this.poster.hidden = false;
    }, { signal: this.abort.signal });
    this.poster.fetchPriority = 'low';
    this.poster.decoding = 'async';
    if (this.poster.src !== new URL(config.assets.poster, document.baseURI).href) this.poster.src = config.assets.poster;
    const options = { signal: this.abort.signal };
    this.launcher.addEventListener('click', () => actions.toggle(), options);
    this.greeting.addEventListener('click', () => actions.toggle(), options);
    this.closeButton.addEventListener('click', () => actions.close(true), options);
    this.back.addEventListener('click', () => actions.screen('home'), options);
    this.dialog.addEventListener('cancel', (event) => { event.preventDefault(); actions.close(true); }, options);
    this.dialog.addEventListener('click', (event) => {
      if (!this.compact || event.target !== this.dialog) return;
      const rect = this.dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) actions.close(true);
    }, options);
    let greetingHovered = false;
    let greetingFocused = false;
    const updateGreetingHold = () => actions.holdGreeting(greetingHovered || greetingFocused);
    this.greeting.addEventListener('pointerenter', () => {
      greetingHovered = true;
      updateGreetingHold();
    }, options);
    this.greeting.addEventListener('pointerleave', () => {
      greetingHovered = false;
      updateGreetingHold();
    }, options);
    this.greeting.addEventListener('focus', () => {
      greetingFocused = true;
      updateGreetingHold();
    }, options);
    this.greeting.addEventListener('blur', () => {
      greetingFocused = false;
      updateGreetingHold();
    }, options);
    this.grip.addEventListener('pointerdown', (event) => {
      if (!this.compact) return;
      this.dragStart = event.clientY; this.dragDistance = 0;
      this.grip.setPointerCapture(event.pointerId);
    }, options);
    this.grip.addEventListener('pointermove', (event) => {
      if (this.dragStart === null) return;
      this.dragDistance = Math.max(0, event.clientY - this.dragStart);
      this.dialog.style.transform = `translateY(calc(-100% + ${this.dragDistance}px))`;
    }, options);
    const finish = (cancel: boolean) => {
      if (this.dragStart === null) return;
      this.dragStart = null;
      this.dialog.style.transform = '';
      if (!cancel && this.dragDistance >= 80) actions.close(true);
    };
    this.grip.addEventListener('pointerup', () => finish(false), options);
    this.grip.addEventListener('pointercancel', () => finish(true), options);
    const link = node('link');
    link.rel = 'stylesheet'; link.href = config.assets.cssUrl;
    const ready = new Promise<boolean>((resolve) => {
      const cancelled = () => finish(false);
      const finish = (available: boolean) => {
        clearTimeout(timer);
        link.onload = null;
        link.onerror = null;
        this.abort.signal.removeEventListener('abort', cancelled);
        resolve(available);
      };
      const timer = setTimeout(() => finish(false), 10000);
      link.onload = () => finish(true);
      link.onerror = () => finish(false);
      this.abort.signal.addEventListener('abort', cancelled, { once: true });
      if (this.abort.signal.aborted) cancelled();
    });
    this.shadow.prepend(link);
    return ready;
  }

  render(snapshot: ScenarioSnapshot, preferences: AssistantPreferences, reduced: boolean): void {
    if (!this.config || !this.actions) return;
    const visible = snapshot.state === 'closed' || snapshot.state === 'open';
    if (this.launcher.hidden !== !visible) this.launcher.hidden = !visible;
    const greetingHidden = !snapshot.greetingVisible || !visible || (this.compact && this.config.behavior === 'calm');
    if (this.greeting.hidden !== greetingHidden) this.greeting.hidden = greetingHidden;
    const greetingText = snapshot.greetingText || this.config.texts.greeting;
    if (this.greeting.textContent !== greetingText) this.greeting.textContent = greetingText;
    if (!this.greeting.hidden) this.greetingHeight = this.greeting.offsetHeight || 96;
    if (this.config.behavior === 'calm') {
      const expanded = String(snapshot.state === 'open');
      if (this.launcher.getAttribute('aria-expanded') !== expanded) this.launcher.setAttribute('aria-expanded', expanded);
    }
    if (this.dataset.state !== snapshot.state) this.dataset.state = snapshot.state;
    if (this.dataset.animation !== snapshot.animation) this.dataset.animation = snapshot.animation;
    this.dialog.classList.toggle('motion-off', reduced || preferences.motion === 'off');
    const screenChanged = this.screen !== snapshot.screen;
    if (screenChanged) { this.screen = snapshot.screen; this.renderScreen(snapshot.screen, snapshot.context?.cartCount ?? null, preferences, reduced); }
    const count = snapshot.context?.cartCount ?? null;
    if (this.cartButton && this.cartCount !== count) this.setCartLabel(count);
    const motion = `${preferences.motion}:${reduced}`;
    if (this.motionButton && this.motion !== motion) this.setMotionLabel(preferences, reduced);
  }

  setCompact(compact: boolean): void {
    this.compact = compact;
    this.launcher.classList.toggle('compact', compact);
    this.dialog.classList.toggle('compact', compact);
    this.dialog.setAttribute('aria-modal', String(compact));
  }

  position(reserved: number, side: 'left' | 'right'): Placement {
    this.bottomReserved = reserved;
    const computed = getComputedStyle(this.safe);
    const safe = {
      top: parseFloat(computed.paddingTop) || 0, right: parseFloat(computed.paddingRight) || 0,
      bottom: parseFloat(computed.paddingBottom) || 0, left: parseFloat(computed.paddingLeft) || 0,
    };
    const result = calculatePlacement(visibleViewport(), safe, reserved, this.compact, side);
    this.launcher.style.left = `${result.launcherLeft}px`;
    this.launcher.style.top = `${result.launcherTop}px`;
    this.dialog.style.left = `${result.panelLeft}px`;
    this.dialog.style.top = `${result.panelTop}px`;
    this.dialog.style.width = `${result.panelWidth}px`;
    this.dialog.style.maxHeight = `${result.panelHeight}px`;
    this.greeting.style.width = `${Math.min(252, Math.max(0, visibleViewport().width - 48))}px`;
    if (!this.greeting.hidden) this.greetingHeight = this.greeting.offsetHeight || 96;
    this.greeting.style.left = `${side === 'right' ? Math.max(24, result.launcherLeft + (this.compact ? 64 : 96) - 252) : result.launcherLeft}px`;
    this.greeting.style.top = `${result.launcherTop - 12}px`;
    return result;
  }

  show(): void {
    if (this.dialog.open) return;
    if (this.compact) this.dialog.showModal();
    else this.dialog.show();
    this.focusFirst();
  }
  close(): void { if (this.dialog.open) this.dialog.close(); this.dialog.style.transform = ''; }
  focusFirst(): void {
    const first = this.body.querySelector<HTMLElement>('a,button');
    (first ?? this.closeButton).focus({ preventScroll: true });
  }
  destroy(): void { this.abort.abort(); this.close(); this.remove(); }

  setSpeechExclusion(region: SpeechExclusion | null): void { this.speechExclusion = region; }

  setMotionOffset(offset: Readonly<{ x: number; y: number }>): boolean {
    // Runtime repositions speech when shown; skip layout while hidden.
    if (this.greeting.hidden) return true;
    const viewport = visibleViewport();
    viewport.height = Math.max(0, viewport.height - this.bottomReserved);
    const left = parseFloat(this.greeting.style.left) || 0;
    const top = parseFloat(this.greeting.style.top) || 0;
    const width = Math.min(252, Math.max(0, viewport.width - 48));
    const placement = calculateSpeechPlacement(viewport, {
      left: (parseFloat(this.launcher.style.left) || 0) + offset.x,
      top: (parseFloat(this.launcher.style.top) || 0) + offset.y,
      size: this.compact ? 64 : 96,
    }, { width, height: this.greetingHeight }, this.launcher.dataset.motion === 'parachute', left + offset.x, this.speechExclusion);
    this.greeting.style.visibility = placement.visible ? '' : 'hidden';
    this.greeting.style.transform = `translate3d(${placement.left - left}px, ${placement.top + this.greetingHeight - top}px, 0) translateY(-100%)`;
    return placement.visible;
  }

  private renderScreen(screen: PanelScreen, count: number | null, preferences: AssistantPreferences, reduced: boolean): void {
    const config = this.config!;
    this.body.replaceChildren();
    this.cartButton = null; this.motionButton = null;
    this.back.hidden = screen === 'home';
    this.header.classList.toggle('has-back', screen !== 'home');
    const list = node('div', 'pika-a-list');
    if (screen === 'home') {
      this.heading.textContent = config.title;
      this.body.append(node('p', 'pika-a-intro', 'Привет! Помогу найти карточки и информацию о магазине'));
      const find = this.row('cards', config.texts.findCards, 'primary');
      find.addEventListener('click', () => config.categories.length ? this.actions!.screen('categories') : this.actions!.navigate(config.routes.catalog, 'catalog'));
      list.append(find, this.link('new', config.texts.newArrivals, config.routes.newArrivals, 'newArrivals'));
      this.cartButton = this.row('cart', config.texts.cart);
      this.setCartLabel(count);
      this.cartButton.addEventListener('click', () => this.actions!.cart());
      list.append(this.cartButton, this.link('delivery', config.texts.delivery, config.routes.delivery, 'delivery'),
        this.link('contacts', config.texts.contacts, config.routes.contacts, 'contacts'));
      const settings = this.row('settings', config.texts.settings);
      settings.addEventListener('click', () => this.actions!.screen('settings'));
      list.append(settings);
    } else if (screen === 'categories') {
      this.heading.textContent = config.texts.categoriesTitle;
      config.categories.forEach((category) => list.append(this.link('cards', category.label, category.href, 'category')));
      list.append(this.link('new', config.texts.allCatalog, config.routes.catalog, 'catalog'));
    } else {
      this.heading.textContent = config.texts.settings;
      this.body.append(node('p', 'pika-a-intro', 'Выбери, как будет вести себя помощник. Меню работает и без движения.'));
      this.motionButton = this.row('moon', config.texts.motion);
      this.motionButton.setAttribute('role', 'switch');
      this.motionButton.querySelector('.pika-a-chevron')?.remove();
      this.motionButton.append(node('span', 'pika-a-switch'));
      this.setMotionLabel(preferences, reduced);
      this.motionButton.addEventListener('click', () => this.actions!.motion());
      const hide = this.row('hide', config.texts.hide, 'pika-a-hide');
      hide.addEventListener('click', () => this.actions!.hide());
      list.append(this.motionButton, hide);
    }
    this.body.append(list);
    if (screen === 'settings') this.body.append(node('p', 'pika-a-note', reduced ? 'Система уже отключила движение. Это предпочтение соблюдается автоматически.' : 'Вернуть помощника можно через ссылку «Помощник» внизу сайта.'));
  }

  private row(iconName: string, label: string, extra = ''): HTMLButtonElement {
    const result = button(label, `pika-a-row ${extra}`);
    result.append(icon(iconName), node('span', 'pika-a-row-text', label), icon('chevron'));
    return result;
  }
  private link(iconName: string, label: string, href: string, actionId: string): HTMLAnchorElement {
    const result = node('a', 'pika-a-row');
    result.href = href;
    result.append(icon(iconName), node('span', 'pika-a-row-text', label), icon('chevron'));
    result.addEventListener('click', (event) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); this.actions!.navigate(href, actionId);
    });
    return result;
  }
  private setCartLabel(count: number | null): void {
    this.cartCount = count;
    const label = `${this.config!.texts.cart}${count === null ? '' : ` · ${count}`}`;
    this.cartButton!.querySelector('.pika-a-row-text')!.textContent = label;
    this.cartButton!.setAttribute('aria-label', label);
  }
  private setMotionLabel(preferences: AssistantPreferences, reduced: boolean): void {
    this.motion = `${preferences.motion}:${reduced}`;
    this.motionButton!.setAttribute('aria-checked', String(preferences.motion === 'off'));
  }
}

export function createAssistantElement(poster?: HTMLImageElement): AssistantElement {
  if (!customElements.get('anime-shop-assistant')) customElements.define('anime-shop-assistant', AssistantElement);
  const element = document.createElement('anime-shop-assistant') as AssistantElement;
  if (poster) {
    poster.alt = '';
    poster.draggable = false;
    poster.setAttribute('aria-hidden', 'true');
    element.poster.replaceWith(poster);
    element.poster = poster;
  }
  return element;
}
