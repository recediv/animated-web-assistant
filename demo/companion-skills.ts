import './companion-skills.css';

export interface CompanionSkill {
  name: string;
  title: string;
  description: string;
  glyph: string;
}
interface SkillsViewport { left: number; top: number; width: number; height: number }
interface SkillsActor { left: number; top: number; size: number; canopy?: boolean }
interface SkillsPlacement {
  left: number; top: number; width: number; height: number; columns: number;
  below: boolean; visible: boolean;
  layout: 'arc' | 'column';
  points: { left: number; top: number }[];
}

/** Keep all controls inside the visible browser area, including narrow touch screens. */
export function calculateSkillsPlacement(actor: SkillsActor, viewport: SkillsViewport, count = 6): SkillsPlacement {
  const margin = 12, cell = 40;
  const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(value, maximum));
  const center = actor.left + actor.size / 2;
  const nearEdge = center < viewport.left + 132 || center > viewport.left + viewport.width - 132;
  if (nearEdge) {
    const gap = 12;
    const height = count * cell + Math.max(0, count - 1) * 4;
    const actorTop = actor.top - (actor.canopy ? actor.size * .5 : 0);
    const aboveTop = actorTop - height - gap;
    const belowTop = actor.top + actor.size + gap;
    const fitsAbove = aboveTop >= viewport.top + margin &&
      aboveTop + height <= viewport.top + viewport.height - margin;
    const fitsBelow = belowTop >= viewport.top + margin &&
      belowTop + height <= viewport.top + viewport.height - margin;
    const below = !fitsAbove;
    const preferredTop = below ? belowTop : aboveTop;
    return {
      left: clamp(center - cell / 2, viewport.left + margin, viewport.left + viewport.width - cell - margin),
      top: clamp(preferredTop, viewport.top + margin, viewport.top + viewport.height - height - margin),
      width: cell, height, columns: 1, below, layout: 'column',
      visible: count > 0 && (fitsAbove || fitsBelow) && cell <= viewport.width - 2 * margin &&
        actor.left + actor.size > viewport.left && actor.left < viewport.left + viewport.width &&
        actor.top + actor.size > viewport.top && actorTop < viewport.top + viewport.height,
      points: Array.from({ length: count }, (_, index) => ({ left: 0, top: index * (cell + 4) })),
    };
  }
  const radius = Math.max(0, Math.min(100, (viewport.width - margin * 2 - cell) / (2 * Math.cos(Math.PI / 12))));
  const curve = Array.from({ length: Math.max(1, count) }, (_, index) => {
    const angle = count <= 1 ? -Math.PI / 2 : (-165 + index * 150 / (count - 1)) * Math.PI / 180;
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  });
  const minX = Math.min(...curve.map((point) => point.x)), maxX = Math.max(...curve.map((point) => point.x));
  const minY = Math.min(...curve.map((point) => point.y)), maxY = Math.max(...curve.map((point) => point.y));
  const width = maxX - minX + cell, height = maxY - minY + cell;
  const actorTop = actor.top - (actor.canopy ? actor.size * .5 : 0);
  const above = actorTop + 12 + minY - cell / 2;
  const below = above < viewport.top + margin;
  const preferredTop = below ? actor.top + actor.size - 6 : above;
  const visible = count > 0 && width <= viewport.width - margin * 2 + .01 && height <= viewport.height - margin * 2 &&
    actor.left + actor.size > viewport.left && actor.left < viewport.left + viewport.width &&
    actor.top + actor.size > viewport.top && actorTop < viewport.top + viewport.height;
  return {
    left: clamp(actor.left + actor.size / 2 - width / 2, viewport.left + margin, viewport.left + viewport.width - width - margin),
    top: clamp(preferredTop, viewport.top + margin, viewport.top + viewport.height - height - margin),
    width, height, columns: count, below, visible, layout: 'arc',
    points: curve.map((point) => ({ left: point.x - minX,
      top: below ? height - cell - (point.y - minY) : point.y - minY })),
  };
}

export function mountCompanionSkills(options: {
  getHost(): HTMLElement | null;
  getBottomReservedPx?(): number;
  runScene(name: string): void | Promise<void>;
  setInteractionHold?(hold: boolean): void;
  isInteractionBlocked?(): boolean;
  lookAt?(point: { x: number; y: number }): void;
  scenes: readonly CompanionSkill[];
}): { refresh(): void; close(): void; destroy(): void } {
  const palette = document.createElement('div');
  palette.className = 'companion-skills';
  palette.hidden = true;
  palette.setAttribute('role', 'group');
  palette.setAttribute('aria-label', 'Сценки Мохлика');
  const grid = document.createElement('div');
  grid.className = 'companion-skills-grid';
  const bridge = document.createElement('div');
  bridge.className = 'companion-skills-bridge';
  bridge.setAttribute('aria-hidden', 'true');
  const tooltip = document.createElement('span');
  tooltip.className = 'companion-skills-tooltip';
  tooltip.hidden = true;
  tooltip.setAttribute('role', 'tooltip');
  const abort = new window.AbortController();
  const observer = new window.MutationObserver(() => refresh());
  let host: HTMLElement | null = null;
  let launcher: HTMLButtonElement | null = null;
  let destroyed = false;
  let restoringFocus = false;
  let inputMode: 'keyboard' | 'mouse' | 'touch' = 'keyboard';
  let touchStart: { x: number; y: number } | null = null;
  let pressedOnHost = false;
  let openRequested = false;
  let pointerPoint: { x: number; y: number } | null = null;
  let hoveredHost: HTMLElement | null = null;
  let holding = false;
  let commandSequence = 0;
  let selectionRegion: { left: number; top: number; right: number; bottom: number } | null = null;
  const iconPaths: Record<string, string> = {
    wiggle: '<path d="M6 17c8 3 14-3 11-9-2-4-7-3-7 1 0 3 5 3 5 0M5 14l-2 3 3 3"/>',
    sit: '<path d="M8 5c-2 3-2 6 0 9h8c2-3 2-6 0-9M8 11h8"/><ellipse cx="7" cy="17" rx="3" ry="4"/><ellipse cx="17" cy="17" rx="3" ry="4"/>',
    ears: '<path d="M7 15C0 4 8 0 10 12M14 12C16 0 24 4 17 15M6 17c3-4 9-4 12 0"/>',
    scratch: '<path d="M5 14c-3-4 1-8 5-6 3 1 3 4 1 6l-3 3zM16 5l3-2M17 9h4M16 13l3 2M10 19l3 2"/>',
    stretch: '<path d="M7 12V4M7 12l5 3 6-3M12 15l-3 6M12 15l6 6M18 12V7"/><circle cx="12" cy="9" r="3"/>',
    nose: '<path d="M8 10c2-2 6-2 8 0l-4 4zM12 14v3M8 18c2 2 6 2 8 0M4 6l-2 2M20 6l2 2"/>',
  };
  const buttons = options.scenes.map((scene) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'companion-skill';
    button.dataset.companionSkill = scene.name;
    button.setAttribute('aria-label', scene.title);
    button.title = `${scene.title}. ${scene.description}`;
    const glyph = document.createElement('span');
    if (iconPaths[scene.name]) glyph.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${iconPaths[scene.name]}</svg>`;
    else glyph.textContent = scene.glyph;
    glyph.setAttribute('aria-hidden', 'true');
    button.append(glyph);
    const label = () => motionOff() ? 'Движения выключены — сценки сейчас отдыхают.' : scene.title;
    button.addEventListener('pointerover', () => { showTooltip(button, label()); lookAtButton(button); }, { signal: abort.signal });
    button.addEventListener('focus', () => { showTooltip(button, label()); lookAtButton(button); }, { signal: abort.signal });
    button.addEventListener('pointerout', () => { tooltip.hidden = true; }, { signal: abort.signal });
    button.addEventListener('blur', () => { tooltip.hidden = true; }, { signal: abort.signal });
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (motionOff()) { showTooltip(button, label()); return; }
      // Keep the selection session held across async initialization and playback.
      // A following choice must never race an automatic departure between clips.
      if (!usable()) return;
      tooltip.hidden = true;
      run(scene);
    }, { signal: abort.signal });
    return button;
  });
  grid.append(...buttons);
  palette.append(bridge, grid);
  document.body.append(palette, tooltip);

  function showTooltip(button: HTMLButtonElement, text: string): void {
    if (palette.hidden) return;
    tooltip.textContent = text; tooltip.hidden = false;
    const area = viewport(), width = Math.min(180, area.width - 24);
    const x = parseFloat(palette.style.left) + parseFloat(button.style.left) + 20;
    const y = parseFloat(palette.style.top) + parseFloat(button.style.top);
    tooltip.style.width = `${width}px`;
    tooltip.style.left = `${Math.max(area.left + 12, Math.min(x - width / 2, area.left + area.width - width - 12))}px`;
    tooltip.style.top = `${Math.max(area.top + 4, y - 30)}px`;
  }
  function lookAtButton(button: HTMLButtonElement): void {
    if (palette.hidden || motionOff()) return;
    options.lookAt?.({
      x: parseFloat(palette.style.left) + parseFloat(button.style.left) + 20,
      y: parseFloat(palette.style.top) + parseFloat(button.style.top) + 20,
    });
  }

  function inRegion(target: EventTarget | null): boolean {
    return target instanceof Node && (!!host?.contains(target) || !!host?.shadowRoot?.contains(target) || palette.contains(target));
  }
  function focusInside(): boolean {
    return inRegion(document.activeElement) || inRegion(host?.shadowRoot?.activeElement ?? null);
  }
  function nearRegion(point: { x: number; y: number }): boolean {
    if (palette.hidden) return false;
    const value = actor();
    if (!value) return false;
    const left = parseFloat(palette.style.left), top = parseFloat(palette.style.top);
    const right = left + parseFloat(palette.style.width), bottom = top + parseFloat(palette.style.height);
    const grace = 56;
    return point.x >= Math.min(left, value.left, selectionRegion?.left ?? left) - grace &&
      point.x <= Math.max(right, value.left + value.size, selectionRegion?.right ?? right) + grace &&
      point.y >= Math.min(top, value.top, selectionRegion?.top ?? top) - grace &&
      point.y <= Math.max(bottom, value.top + value.size, selectionRegion?.bottom ?? bottom) + grace;
  }
  function viewport(): SkillsViewport {
    const value = window.visualViewport;
    const area = value ? { left: value.offsetLeft, top: value.offsetTop, width: value.width, height: value.height } :
      { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    return { ...area, height: Math.max(0, area.height - (options.getBottomReservedPx?.() ?? 0)) };
  }
  function actor(): SkillsActor | null {
    if (!launcher) return null;
    const transform = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px/.exec(launcher.style.transform);
    let left = parseFloat(launcher.style.left), top = parseFloat(launcher.style.top);
    if (!Number.isFinite(left) || !Number.isFinite(top)) {
      const rect = launcher.getBoundingClientRect();
      left = rect.left; top = rect.top;
    } else {
      left += Number(transform?.[1] ?? 0); top += Number(transform?.[2] ?? 0);
    }
    return { left, top,
      size: launcher.classList.contains('compact') ? 64 : 96,
      canopy: launcher.dataset.motion === 'parachute' };
  }
  function dragging(): boolean {
    return launcher?.dataset.motion === 'drag' || host?.dataset.motion === 'drag';
  }
  function motionOff(): boolean {
    return !!host?.shadowRoot?.querySelector('.pika-a-dialog.motion-off');
  }
  function usable(): boolean {
    const motion = launcher?.dataset.motion || host?.dataset.motion || '';
    return !options.isInteractionBlocked?.() && !!host?.isConnected && !!launcher && !launcher.hidden && !dragging() &&
      !['arrival', 'peek', 'hide', 'fall', 'parachute', 'climb', 'land', 'return', 'page-push'].includes(motion) &&
      (motion !== 'flip' || (!palette.hidden && holding)) &&
      !['suppressed', 'hiddenByUser'].includes(host.dataset.state ?? '');
  }
  function hold(value: boolean): void {
    if (holding === value) return;
    holding = value;
    options.setInteractionHold?.(value);
  }
  function run(scene: CompanionSkill): void {
    const sequence = ++commandSequence;
    const value = actor();
    if (value) selectionRegion = { left: Math.min(value.left, parseFloat(palette.style.left)),
      top: Math.min(value.top, parseFloat(palette.style.top)),
      right: Math.max(value.left + value.size, parseFloat(palette.style.left) + parseFloat(palette.style.width)),
      bottom: Math.max(value.top + value.size, parseFloat(palette.style.top) + parseFloat(palette.style.height)) };
    const finish = () => {
      if (destroyed || sequence !== commandSequence) return;
      selectionRegion = null;
      if (palette.hidden) hold(false);
    };
    try {
      void Promise.resolve(options.runScene(scene.name)).then(finish, finish);
    } catch { finish(); }
  }
  function position(): void {
    if (!launcher || !host) return;
    const placement = calculateSkillsPlacement(actor()!, viewport(), buttons.length);
    if (!placement.visible) { close(); return; }
    const surface = host.closest('dialog[open]') ?? document.body;
    if (palette.parentNode !== surface) surface.append(palette);
    if (tooltip.parentNode !== surface) surface.append(tooltip);
    palette.style.left = `${placement.left}px`;
    palette.style.top = `${placement.top}px`;
    palette.style.width = `${placement.width}px`;
    palette.style.height = `${placement.height}px`;
    buttons.forEach((button, index) => {
      button.style.left = `${placement.points[index]!.left}px`;
      button.style.top = `${placement.points[index]!.top}px`;
    });
    palette.classList.toggle('companion-skills-below', placement.below);
    palette.classList.toggle('companion-skills-column', placement.layout === 'column');
  }
  function currentOpenIntent(): boolean {
    if (pressedOnHost || !host || !launcher) return false;
    if (inputMode === 'keyboard') return host.shadowRoot?.activeElement === launcher;
    if (inputMode !== 'mouse' || hoveredHost !== host || !pointerPoint) return false;
    const value = actor()!;
    if (pointerPoint.x < value.left || pointerPoint.x > value.left + value.size ||
      pointerPoint.y < value.top || pointerPoint.y > value.top + value.size) return false;
    // A dialog or another surface may now cover the old pointer position.
    const hit = document.elementFromPoint?.(pointerPoint.x, pointerPoint.y);
    return !hit || hit === host || host.contains(hit) || !!host.shadowRoot?.contains(hit);
  }
  function observeInteraction(): void {
    observer.disconnect();
    if (!host || !launcher || (palette.hidden && !openRequested)) return;
    observer.observe(host, { attributes: true, attributeFilter: ['data-state', 'data-motion'] });
    observer.observe(launcher, { attributes: true, attributeFilter: ['style', 'class', 'hidden', 'data-motion'] });
    const dialog = host.shadowRoot?.querySelector('.pika-a-dialog');
    if (dialog) observer.observe(dialog, { attributes: true, attributeFilter: ['class'] });
    if (host.parentNode) observer.observe(host.parentNode, { childList: true });
  }
  function refresh(): void {
    if (destroyed) return;
    const next = options.getHost();
    if (host && next !== host) { openRequested = false; hoveredHost = null; }
    host = next;
    launcher = next?.shadowRoot?.querySelector<HTMLButtonElement>('.pika-a-launcher') ?? null;
    if (!usable()) {
      close(false, openRequested); return;
    }
    for (const button of buttons) button.setAttribute('aria-disabled', String(motionOff()));
    if (palette.hidden) {
      if (!openRequested || !currentOpenIntent()) {
        openRequested = false; observeInteraction(); return;
      }
      palette.hidden = false;
    }
    hold(!motionOff());
    position();
    observeInteraction();
  }
  function open(): void {
    openRequested = true;
    refresh();
    if (!usable()) return;
    openRequested = true;
    palette.hidden = false;
    hold(!motionOff());
    refresh();
  }
  function close(returnFocus = false, preserveIntent = false): void {
    palette.hidden = true;
    if (!preserveIntent) openRequested = false;
    selectionRegion = null;
    tooltip.hidden = true;
    hold(false);
    observeInteraction();
    if (returnFocus && launcher?.isConnected && !launcher.hidden) {
      restoringFocus = true;
      launcher.focus({ preventScroll: true });
      restoringFocus = false;
    }
  }
  const listenerOptions = { signal: abort.signal };
  document.addEventListener('pointerover', (event) => {
    if (event.pointerType === 'touch' || pressedOnHost) return;
    inputMode = 'mouse';
    const target = options.getHost();
    pointerPoint = { x: event.clientX, y: event.clientY };
    hoveredHost = target && event.composedPath().includes(target) ? target : null;
    if (target && event.composedPath().includes(target)) open();
    else if (!inRegion(event.target) && !nearRegion({ x: event.clientX, y: event.clientY })) close();
  }, listenerOptions);
  document.addEventListener('pointerout', (event) => {
    if (event.pointerType === 'touch') return;
    if (!event.relatedTarget || (hoveredHost && !(event.relatedTarget instanceof Node &&
      (hoveredHost.contains(event.relatedTarget) || hoveredHost.shadowRoot?.contains(event.relatedTarget))))) {
      hoveredHost = null;
      if (palette.hidden && inputMode !== 'keyboard') close();
    }
    if (!palette.hidden && inRegion(event.target) && !inRegion(event.relatedTarget) && !nearRegion({ x: event.clientX, y: event.clientY }) &&
      !(inputMode === 'keyboard' && focusInside())) close();
  }, listenerOptions);
  document.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    inputMode = 'mouse';
    const target = options.getHost();
    pointerPoint = { x: event.clientX, y: event.clientY };
    hoveredHost = target && event.composedPath().includes(target) ? target : null;
    if (pressedOnHost) return;
    if (palette.hidden) {
      if (hoveredHost) open();
      else if (openRequested) close();
      return;
    }
    if (!nearRegion({ x: event.clientX, y: event.clientY }) && !inRegion(event.target)) close();
  }, listenerOptions);
  document.addEventListener('focusin', (event) => {
    if (restoringFocus || pressedOnHost) return;
    const target = options.getHost();
    if (inputMode === 'keyboard' && target && event.composedPath().includes(target)) open();
    else if (!inRegion(event.target)) close();
  }, listenerOptions);
  document.addEventListener('focusout', () => {
    queueMicrotask(() => { if (!destroyed && inputMode === 'keyboard' && !focusInside()) close(); });
  }, listenerOptions);
  document.addEventListener('pointerdown', (event) => {
    inputMode = event.pointerType === 'touch' ? 'touch' : 'mouse';
    const target = options.getHost();
    pressedOnHost = !!target && event.composedPath().includes(target);
    pointerPoint = inputMode === 'mouse' ? { x: event.clientX, y: event.clientY } : null;
    hoveredHost = inputMode === 'mouse' && pressedOnHost ? target : null;
    if (pressedOnHost) close();
    if (event.pointerType === 'touch' && target && event.composedPath().includes(target))
      touchStart = { x: event.clientX, y: event.clientY };
    else touchStart = null;
    if (!inRegion(event.target)) close();
  }, listenerOptions);
  document.addEventListener('pointerup', (event) => {
    pressedOnHost = false;
    const target = options.getHost();
    if (event.pointerType === 'touch' && touchStart && target && event.composedPath().includes(target) &&
      !event.defaultPrevented && Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y) < 6) open();
    else if (event.pointerType !== 'touch' && target && event.composedPath().includes(target) && !event.defaultPrevented) {
      pointerPoint = { x: event.clientX, y: event.clientY }; hoveredHost = target; open();
    }
    touchStart = null;
  }, listenerOptions);
  document.addEventListener('pointercancel', () => { touchStart = null; pressedOnHost = false; hoveredHost = null; close(); }, listenerOptions);
  document.addEventListener('lostpointercapture', () => { touchStart = null; pressedOnHost = false; }, listenerOptions);
  document.addEventListener('keydown', (event) => {
    inputMode = 'keyboard';
    if (event.key === 'Escape' && (openRequested || !palette.hidden)) {
      event.preventDefault(); event.stopPropagation(); close(!palette.hidden); return;
    }
    if (palette.hidden && event.composedPath().includes(launcher!) &&
      ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) open();
    if (palette.hidden) return;
    const index = buttons.findIndex((button) => button === event.target);
    const movement: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 };
    if (event.target === host || event.composedPath().includes(launcher!) || index >= 0) {
      let next: number | undefined;
      if (event.key in movement) next = index < 0 ? 0 : (index + movement[event.key]! + buttons.length) % buttons.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = buttons.length - 1;
      if (next !== undefined) { event.preventDefault(); buttons[next]?.focus(); }
    }
  }, { ...listenerOptions, capture: true });
  window.addEventListener('resize', () => { if (!palette.hidden) refresh(); }, listenerOptions);
  window.visualViewport?.addEventListener('resize', () => { if (!palette.hidden) refresh(); }, listenerOptions);
  window.visualViewport?.addEventListener('scroll', () => { if (!palette.hidden) refresh(); }, listenerOptions);
  window.addEventListener('pagehide', () => close(), listenerOptions);
  refresh();
  return { refresh, close: () => close(), destroy() {
    if (destroyed) return;
    destroyed = true;
    commandSequence++; selectionRegion = null; hold(false); abort.abort(); observer.disconnect();
    palette.remove(); tooltip.remove();
  } };
}
