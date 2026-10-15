import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateSkillsPlacement, mountCompanionSkills } from '../../demo/companion-skills';

const scenes = ['wiggle', 'sit', 'ears', 'scratch', 'stretch', 'nose'].map((name) => ({
  name, title: name, description: 'Description', glyph: '✦',
}));
let controller: ReturnType<typeof mountCompanionSkills> | undefined;
afterEach(() => {
  controller?.destroy(); controller = undefined;
  document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

function setup(compact = false, isInteractionBlocked?: () => boolean) {
  const host = document.createElement('anime-shop-assistant');
  const shadow = host.attachShadow({ mode: 'open' });
  const launcher = document.createElement('button');
  launcher.className = `pika-a-launcher${compact ? ' compact' : ''}`;
  launcher.style.left = '180px'; launcher.style.top = '500px';
  launcher.style.transform = 'translate3d(0px, 0px, 0)';
  const dialog = document.createElement('dialog'); dialog.className = 'pika-a-dialog';
  host.dataset.state = 'closed'; shadow.append(launcher, dialog); document.body.append(host);
  const runScene = vi.fn();
  const setInteractionHold = vi.fn();
  const lookAt = vi.fn();
  controller = mountCompanionSkills({ getHost: () => host, runScene, setInteractionHold, isInteractionBlocked, lookAt, scenes });
  const palette = document.querySelector<HTMLElement>('.companion-skills')!;
  const buttons = [...palette.querySelectorAll<HTMLButtonElement>('button')];
  return { host, launcher, palette, buttons, runScene, setInteractionHold, lookAt };
}
function pointer(target: Element, type: string, options: {
  pointerType?: string; relatedTarget?: EventTarget; x?: number; y?: number; prevented?: boolean;
} = {}) {
  const event = new MouseEvent(type, { bubbles: true, composed: true, cancelable: true,
    relatedTarget: options.relatedTarget ?? null, clientX: options.x ?? 0, clientY: options.y ?? 0 });
  Object.defineProperty(event, 'pointerType', { value: options.pointerType ?? 'mouse' });
  if (options.prevented) event.preventDefault();
  target.dispatchEvent(event);
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

describe('companion skill placement', () => {
  it.each([320, 390, 1920])('keeps six nonoverlapping targets in a column directly above either edge at %ipx', (width) => {
    for (const left of [0, width - 64]) {
      const value = calculateSkillsPlacement({ left, top: 490, size: 64 }, { left: 0, top: 0, width, height: 568 });
      expect(value.visible).toBe(true);
      expect(value.left).toBeGreaterThanOrEqual(12);
      expect(value.left + value.width).toBeLessThanOrEqual(width - 12);
      expect(value.top).toBeGreaterThanOrEqual(12);
      expect(value.top + value.height).toBeLessThanOrEqual(556);
      expect(value.columns).toBe(1);
      expect(value.layout).toBe('column');
      expect(value.left + 20).toBeCloseTo(left + 32);
      expect(value.top + value.height).toBeLessThan(490);
      expect(value.points).toHaveLength(6);
      for (const point of value.points) {
        expect(point.left).toBeGreaterThanOrEqual(0);
        expect(point.top).toBeGreaterThanOrEqual(0);
        expect(point.left + 40).toBeLessThanOrEqual(value.width + .01);
        expect(point.top + 40).toBeLessThanOrEqual(value.height + .01);
      }
      for (let index = 1; index < value.points.length; index++) {
        const a = value.points[index - 1]!, b = value.points[index]!;
        expect(Math.hypot(a.left - b.left, a.top - b.top)).toBeGreaterThan(40);
      }
      expect(value.points[3]!.top).toBeGreaterThan(value.points[0]!.top);
    }
  });
  it('keeps a nonoverlapping arc in the middle of a wide viewport', () => {
    const value = calculateSkillsPlacement({ left: 640, top: 700, size: 96 }, { left: 0, top: 0, width: 1440, height: 800 });
    expect(value.layout).toBe('arc'); expect(value.columns).toBe(6);
    expect(value.points[3]!.top).toBeLessThan(value.points[0]!.top);
    expect(value.top + value.height).toBeLessThan(710);
  });
  it('includes the canopy and visual viewport offset; hides controls when they cannot fit', () => {
    const value = calculateSkillsPlacement({ left: 120, top: 530, size: 96, canopy: true },
      { left: 30, top: 60, width: 390, height: 600 });
    expect(value.top + value.height).toBeLessThanOrEqual(530 - 48 + 7);
    expect(value.left).toBeGreaterThanOrEqual(42);
    expect(calculateSkillsPlacement({ left: 0, top: 20, size: 64 },
      { left: 0, top: 0, width: 120, height: 60 }).visible).toBe(false);
  });
});

describe('companion skills interaction and lifetime', () => {
  it.each(['arrival', 'climb', 'fall', 'parachute', 'return', 'peek', 'hide', 'land', 'drag', 'page-push'])('opens after %s ends under the same stationary pointer without another pointerover', async (phase) => {
    const requestFrame = vi.fn(); vi.stubGlobal('requestAnimationFrame', requestFrame);
    const { host, launcher, palette, setInteractionHold } = setup();
    host.dataset.motion = phase; launcher.dataset.motion = phase;
    pointer(launcher, 'pointerover', { x: 225, y: 540 });
    expect(palette.hidden).toBe(true);
    host.dataset.motion = ''; launcher.dataset.motion = '';
    await flush();
    expect(palette.hidden).toBe(false);
    expect(setInteractionHold).toHaveBeenCalledExactlyOnceWith(true);
    expect(requestFrame).not.toHaveBeenCalled();
  });
  it('retries a closed palette on a genuine pointermove over the now usable character', () => {
    const { host, launcher, palette } = setup();
    host.dataset.motion = 'arrival'; launcher.dataset.motion = 'arrival';
    pointer(launcher, 'pointerover', { x: 225, y: 540 });
    host.dataset.motion = ''; launcher.dataset.motion = '';
    pointer(launcher, 'pointermove', { x: 225, y: 540 });
    expect(palette.hidden).toBe(false);
  });
  it('recovers a keyboard focus made during arrival, but Escape stays dismissed through later mutations', async () => {
    const { host, launcher, palette } = setup();
    host.dataset.motion = 'arrival'; launcher.dataset.motion = 'arrival';
    launcher.focus(); expect(palette.hidden).toBe(true);
    host.dataset.motion = ''; launcher.dataset.motion = ''; await flush();
    expect(palette.hidden).toBe(false);
    launcher.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true }));
    launcher.style.transform = 'translate3d(1px, 0px, 0)'; await flush();
    expect(palette.hidden).toBe(true);
    expect(host.shadowRoot!.activeElement).toBe(launcher);
  });
  it('does not reopen from a former hover when the pointer leaves or the actor finishes elsewhere', async () => {
    const { host, launcher, palette, setInteractionHold } = setup();
    host.dataset.motion = 'arrival'; launcher.dataset.motion = 'arrival';
    pointer(launcher, 'pointerover', { x: 225, y: 540 });
    pointer(document.body, 'pointermove', { x: 780, y: 40 });
    host.dataset.motion = ''; launcher.dataset.motion = ''; await flush();
    expect(palette.hidden).toBe(true);
    host.dataset.motion = 'climb'; launcher.dataset.motion = 'climb';
    pointer(launcher, 'pointerover', { x: 225, y: 540 });
    launcher.style.transform = 'translate3d(250px, 0px, 0)';
    host.dataset.motion = ''; launcher.dataset.motion = ''; await flush();
    expect(palette.hidden).toBe(true);
    expect(setInteractionHold).not.toHaveBeenCalled();
  });
  it('recovers a real hover after transition blocking is released, without queuing a selected scene', async () => {
    let blocked = true;
    const { launcher, palette, runScene, setInteractionHold } = setup(false, () => blocked);
    pointer(launcher, 'pointerover', { x: 225, y: 540 });
    expect(palette.hidden).toBe(true);
    blocked = false; controller!.refresh(); await flush();
    expect(palette.hidden).toBe(false);
    expect(runScene).not.toHaveBeenCalled();
    expect(setInteractionHold).toHaveBeenCalledExactlyOnceWith(true);
  });
  it('waits for both page push and its block to finish, and never opens a distant former hover', async () => {
    let blocked = true;
    const { host, launcher, palette, setInteractionHold } = setup(false, () => blocked);
    host.dataset.motion = 'page-push'; launcher.dataset.motion = 'page-push';
    pointer(launcher, 'pointerover', { x: 225, y: 540 });
    host.dataset.motion = ''; launcher.dataset.motion = ''; await flush();
    expect(palette.hidden).toBe(true);
    expect(setInteractionHold).not.toHaveBeenCalled();
    blocked = false; controller!.refresh();
    expect(palette.hidden).toBe(false);
    blocked = true; controller!.refresh();
    pointer(document.body, 'pointermove', { x: 900, y: 20 });
    blocked = false; launcher.style.transform = 'translate3d(1px, 0px, 0)';
    controller!.refresh(); await flush();
    expect(palette.hidden).toBe(true);
    expect(setInteractionHold.mock.calls).toEqual([[true], [false]]);
  });
  it('clears a pending hover on an outside press and a pending keyboard focus on Escape', async () => {
    const { host, launcher, palette, setInteractionHold } = setup();
    host.dataset.motion = 'arrival'; launcher.dataset.motion = 'arrival';
    pointer(launcher, 'pointerover', { x: 225, y: 540 });
    pointer(document.body, 'pointerdown', { x: 900, y: 20 });
    host.dataset.motion = ''; launcher.dataset.motion = ''; await flush();
    expect(palette.hidden).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    host.dataset.motion = 'climb'; launcher.dataset.motion = 'climb'; launcher.focus();
    launcher.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true }));
    host.dataset.motion = ''; launcher.dataset.motion = ''; await flush();
    expect(palette.hidden).toBe(true);
    expect(setInteractionHold).not.toHaveBeenCalled();
    launcher.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true, cancelable: true }));
    expect(palette.hidden).toBe(false);
    expect(document.activeElement).toBe(palette.querySelector('button'));
  });
  it('clears a lost mouse capture so movement over the landed actor can open the choices', async () => {
    const { host, launcher, palette } = setup();
    pointer(launcher, 'pointerdown', { x: 225, y: 540 });
    host.dataset.motion = 'drag'; launcher.dataset.motion = 'drag';
    pointer(launcher, 'pointermove', { x: 225, y: 540 });
    expect(palette.hidden).toBe(true);
    launcher.dispatchEvent(new Event('lostpointercapture', { bubbles: true, composed: true }));
    host.dataset.motion = 'fall'; launcher.dataset.motion = 'fall';
    pointer(launcher, 'pointermove', { x: 225, y: 540 });
    expect(palette.hidden).toBe(true);
    host.dataset.motion = ''; launcher.dataset.motion = ''; await flush();
    expect(palette.hidden).toBe(false);
  });
  it('checks the current hit surface before restoring a hover below an unrelated overlay', async () => {
    const { host, launcher, palette, setInteractionHold } = setup();
    const hitProperty = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
    const cover = document.createElement('div'); document.body.append(cover);
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => cover });
    try {
      host.dataset.motion = 'arrival'; launcher.dataset.motion = 'arrival';
      pointer(launcher, 'pointerover', { x: 225, y: 540 });
      host.dataset.motion = ''; launcher.dataset.motion = ''; await flush();
      expect(palette.hidden).toBe(true);
      expect(setInteractionHold).not.toHaveBeenCalled();
    } finally {
      if (hitProperty) Object.defineProperty(document, 'elementFromPoint', hitProperty);
      else Reflect.deleteProperty(document, 'elementFromPoint');
    }
  });
  it('shows only six cute gestures, crosses the hover bridge and closes after a focused character is left', () => {
    const { host, launcher, palette, buttons } = setup();
    expect(palette.hidden).toBe(true);
    expect(buttons).toHaveLength(6);
    expect(buttons.map((button) => button.dataset.companionSkill)).toEqual(scenes.map((scene) => scene.name));
    expect(palette.querySelector('[data-scenario]')).toBeNull();
    expect(palette.querySelector('.companion-skills-caption')).toBeNull();
    expect(buttons.every((button) => !!button.querySelector('svg[viewBox="0 0 24 24"] path'))).toBe(true);
    expect(new Set(buttons.map((button) => button.querySelector('svg')!.innerHTML)).size).toBe(6);
    pointer(launcher, 'pointerover');
    expect(palette.hidden).toBe(false);
    pointer(launcher, 'pointerdown'); launcher.focus(); pointer(launcher, 'pointerup');
    pointer(launcher, 'pointerover');
    pointer(launcher, 'pointerout', { relatedTarget: palette.querySelector('.companion-skills-bridge')! });
    expect(palette.hidden).toBe(false);
    pointer(buttons[0]!, 'pointerout', { relatedTarget: host });
    expect(palette.hidden).toBe(false);
    pointer(launcher, 'pointerout', { relatedTarget: document.body });
    expect(host.shadowRoot!.activeElement).toBe(launcher);
    expect(palette.hidden).toBe(true);
  });
  it('shows an immediate tooltip on icon hover and keyboard focus without a shared caption panel', () => {
    const { launcher, buttons } = setup(); pointer(launcher, 'pointerover');
    pointer(buttons[5]!, 'pointerover');
    const tooltip = document.querySelector<HTMLElement>('.companion-skills-tooltip')!;
    expect(tooltip.hidden).toBe(false); expect(tooltip.textContent).toBe('nose');
    pointer(buttons[5]!, 'pointerout', { relatedTarget: buttons[1] }); expect(tooltip.hidden).toBe(true);
    buttons[1]!.focus(); expect(tooltip.hidden).toBe(false); expect(tooltip.textContent).toBe('sit');
    controller!.close(); expect(tooltip.hidden).toBe(true);
  });
  it('sends the exact hovered or keyboard-focused control centre as one finite gaze update without a frame loop', () => {
    const requestFrame = vi.fn(); vi.stubGlobal('requestAnimationFrame', requestFrame);
    const { launcher, palette, buttons, lookAt } = setup(); pointer(launcher, 'pointerover');
    pointer(buttons[0]!, 'pointerover'); buttons[5]!.focus();
    expect(lookAt.mock.calls).toEqual([0, 5].map((index) => [{
      x: parseFloat(palette.style.left) + parseFloat(buttons[index]!.style.left) + 20,
      y: parseFloat(palette.style.top) + parseFloat(buttons[index]!.style.top) + 20,
    }]));
    expect(requestFrame).not.toHaveBeenCalled();
    controller!.close(); pointer(buttons[0]!, 'pointerover');
    expect(lookAt).toHaveBeenCalledTimes(2);
  });
  it('closes keyboard-opened controls and releases hold when the pointer moves onto another element', () => {
    const { launcher, palette, buttons, setInteractionHold } = setup();
    launcher.focus(); expect(palette.hidden).toBe(false);
    pointer(launcher, 'pointerout', { relatedTarget: document.body });
    expect(palette.hidden).toBe(false);
    pointer(buttons[0]!, 'pointerover'); expect(palette.hidden).toBe(false);
    const product = document.createElement('article'); document.body.append(product);
    pointer(product, 'pointerover');
    expect(palette.hidden).toBe(true);
    expect(setInteractionHold.mock.calls).toEqual([[true], [false]]);
  });
  it('runs one scene without a second global click handler and keeps the selection session open', async () => {
    const { launcher, palette, buttons, runScene } = setup();
    const globalClick = vi.fn(); document.addEventListener('click', globalClick, { once: true });
    pointer(launcher, 'pointerover'); buttons[5]!.focus(); buttons[5]!.click();
    await flush();
    expect(runScene).toHaveBeenCalledExactlyOnceWith('nose');
    expect(globalClick).not.toHaveBeenCalled();
    expect(palette.hidden).toBe(false);
    document.removeEventListener('click', globalClick);
  });
  it('supports keyboard arrows and Escape, while keeping focus navigation inside the palette', async () => {
    const { launcher, palette, buttons } = setup();
    launcher.focus(); expect(palette.hidden).toBe(false);
    launcher.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true }));
    expect(document.activeElement).toBe(buttons[0]);
    buttons[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(buttons[5]);
    buttons[5]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await flush(); expect(palette.hidden).toBe(true);
    expect(launcher.getRootNode() instanceof ShadowRoot && (launcher.getRootNode() as ShadowRoot).activeElement).toBe(launcher);
  });
  it('does not open on programmatic route focus after mouse input, but opens with Tab keyboard intent', () => {
    const { launcher, palette } = setup();
    pointer(document.body, 'pointerdown'); launcher.focus();
    expect(palette.hidden).toBe(true);
    launcher.blur(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    launcher.focus(); expect(palette.hidden).toBe(false);
  });
  it('refuses transition focus/hover and releases a current hold when transition blocking starts', () => {
    let blocked = true;
    const { launcher, palette, setInteractionHold } = setup(false, () => blocked);
    launcher.focus(); pointer(launcher, 'pointerover'); expect(palette.hidden).toBe(true);
    expect(setInteractionHold).not.toHaveBeenCalled();
    blocked = false; pointer(launcher, 'pointerover'); expect(palette.hidden).toBe(false);
    blocked = true; controller!.refresh(); expect(palette.hidden).toBe(true);
    expect(setInteractionHold).toHaveBeenLastCalledWith(false);
  });
  it('opens on a touch tap, closes outside, and ignores drag or captured/prevented release', () => {
    const { launcher, palette } = setup(true);
    pointer(launcher, 'pointerdown', { pointerType: 'touch', x: 20, y: 30 });
    pointer(launcher, 'pointerup', { pointerType: 'touch', x: 23, y: 31 });
    expect(palette.hidden).toBe(false);
    pointer(document.body, 'pointerdown', { pointerType: 'touch' });
    expect(palette.hidden).toBe(true);
    pointer(launcher, 'pointerdown', { pointerType: 'touch', x: 20, y: 30 });
    pointer(launcher, 'pointerup', { pointerType: 'touch', x: 90, y: 30 });
    expect(palette.hidden).toBe(true);
    pointer(launcher, 'pointerdown', { pointerType: 'touch' });
    pointer(launcher, 'pointerup', { pointerType: 'touch', prevented: true });
    expect(palette.hidden).toBe(true);
  });
  it('follows the existing motion transform and modal parent only while open, without a frame loop', async () => {
    const requestFrame = vi.fn(); vi.stubGlobal('requestAnimationFrame', requestFrame);
    const { host, launcher, palette } = setup(); pointer(launcher, 'pointerover');
    const oldLeft = palette.style.left;
    launcher.style.transform = 'translate3d(100px, -80px, 0)';
    await flush(); expect(palette.style.left).not.toBe(oldLeft);
    const modal = document.createElement('dialog'); modal.open = true; document.body.append(modal); modal.append(host);
    await flush(); expect(palette.parentNode).toBe(modal);
    controller!.close(); const closedTop = palette.style.top;
    launcher.style.transform = 'translate3d(100px, -160px, 0)';
    await flush(); expect(palette.style.top).toBe(closedTop);
    expect(requestFrame).not.toHaveBeenCalled();
  });
  it('closes for suppressed/hidden characters and removes observers and listeners on destroy', async () => {
    const { host, launcher, palette } = setup(); pointer(launcher, 'pointerover');
    host.dataset.state = 'suppressed'; await flush(); expect(palette.hidden).toBe(true);
    host.dataset.state = 'closed'; launcher.hidden = true; pointer(launcher, 'pointerover');
    expect(palette.hidden).toBe(true);
    launcher.hidden = false; pointer(launcher, 'pointerover'); expect(palette.hidden).toBe(false);
    controller!.destroy(); pointer(launcher, 'pointerover');
    expect(document.querySelector('.companion-skills')).toBeNull();
  });
  it('closes at pointerdown before drag starts, rejects drag hover/focus, and never reopens on dragged touch release', async () => {
    const { host, launcher, palette } = setup(); pointer(launcher, 'pointerover');
    pointer(launcher, 'pointerdown'); expect(palette.hidden).toBe(true);
    launcher.focus(); pointer(launcher, 'pointerover'); expect(palette.hidden).toBe(true);
    launcher.dataset.motion = 'drag'; host.dataset.motion = 'drag';
    await flush(); pointer(launcher, 'pointerup', { pointerType: 'touch', prevented: true });
    pointer(launcher, 'pointerover'); expect(palette.hidden).toBe(true);
    launcher.dataset.motion = ''; host.dataset.motion = '';
    pointer(launcher, 'pointerover'); expect(palette.hidden).toBe(false);
    host.dataset.motion = 'drag'; await flush(); expect(palette.hidden).toBe(true);
  });
  it('keeps a hold through the first async handoff instead of letting a pending route erase the selected emotion', async () => {
    const { host, launcher, palette, buttons, runScene, setInteractionHold } = setup();
    launcher.dataset.motion = 'stroll'; host.dataset.motion = 'stroll';
    launcher.style.transform = 'translate3d(20px, 0px, 0)';
    pointer(launcher, 'pointerover'); pointer(launcher, 'pointerover');
    expect(setInteractionHold.mock.calls).toEqual([[true]]);
    expect(launcher.style.transform).toBe('translate3d(20px, 0px, 0)');
    buttons[5]!.click();
    expect(palette.hidden).toBe(false);
    expect(setInteractionHold.mock.calls).toEqual([[true]]);
    expect(runScene).toHaveBeenCalledExactlyOnceWith('nose');
    await flush();
    expect(setInteractionHold.mock.calls).toEqual([[true]]);
    controller!.close(); expect(setInteractionHold.mock.calls).toEqual([[true], [false]]);
  });
  it.each(scenes)('the first complete pointer/focus/click sequence activates $name once and keeps controls available', async (scene) => {
    const { launcher, palette, buttons, runScene } = setup();
    let finish!: () => void;
    runScene.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    pointer(launcher, 'pointerover');
    const button = buttons.find((value) => value.dataset.companionSkill === scene.name)!;
    pointer(launcher, 'pointerout', { relatedTarget: palette.querySelector('.companion-skills-bridge')! });
    pointer(button, 'pointerover'); pointer(button, 'pointerdown'); button.focus(); await flush();
    expect(palette.hidden).toBe(false);
    pointer(button, 'pointerup'); button.click();
    expect(runScene).toHaveBeenCalledExactlyOnceWith(scene.name);
    finish(); await flush(); expect(palette.hidden).toBe(false);
  });
  it('does not release hover or let a pending automatic peek erase a selected emotion', async () => {
    const { host, launcher, buttons, runScene, setInteractionHold } = setup();
    setInteractionHold.mockImplementation((hold) => { if (!hold) host.dataset.motion = 'peek'; });
    pointer(launcher, 'pointerover'); buttons[5]!.click();
    expect(runScene).toHaveBeenCalledExactlyOnceWith('nose');
    expect(host.dataset.motion).toBeUndefined();
    await flush(); expect(host.dataset.motion).toBeUndefined();
    expect(runScene).toHaveBeenCalledOnce();
  });
  it('keeps all six choices available across replaced promises without reopening or releasing hold', async () => {
    const { launcher, palette, buttons, runScene, setInteractionHold } = setup();
    const finishes: (() => void)[] = [];
    runScene.mockImplementation(() => new Promise<void>((resolve) => { finishes.push(resolve); }));
    pointer(launcher, 'pointerover');
    buttons[5]!.click(); finishes[0]!(); await flush();
    buttons[1]!.click(); buttons[3]!.click(); finishes[1]!(); await flush();
    expect(palette.hidden).toBe(false);
    finishes[2]!(); await flush();
    for (const button of buttons) {
      button.click(); finishes.at(-1)!(); await flush();
      expect(palette.hidden).toBe(false);
    }
    expect(runScene.mock.calls.map(([scene]) => scene)).toEqual(['nose', 'sit', 'scratch', ...scenes.map((scene) => scene.name)]);
    expect(setInteractionHold.mock.calls).toEqual([[true]]);
    controller!.close(); expect(setInteractionHold).toHaveBeenLastCalledWith(false);
  });
  it('keeps the gaps around the actor and controls usable, then releases on a real departure with no frame loop', () => {
    const requestFrame = vi.fn(); vi.stubGlobal('requestAnimationFrame', requestFrame);
    const { launcher, palette, setInteractionHold } = setup(); pointer(launcher, 'pointerover');
    const x = parseFloat(palette.style.left) - 30;
    const y = parseFloat(palette.style.top) + 20;
    pointer(palette, 'pointerout', { x, y, relatedTarget: document.body });
    pointer(document.body, 'pointermove', { x, y });
    expect(palette.hidden).toBe(false); expect(setInteractionHold.mock.calls).toEqual([[true]]);
    pointer(document.body, 'pointermove', { x: x - 100, y });
    expect(palette.hidden).toBe(true); expect(setInteractionHold).toHaveBeenLastCalledWith(false);
    expect(requestFrame).not.toHaveBeenCalled();
  });
  it('passes a touch first press in the cart top layer and closes controls on hide', async () => {
    const { host, launcher, palette, buttons, runScene } = setup(true);
    const cart = document.createElement('dialog'); cart.open = true; document.body.append(cart); cart.append(host);
    runScene.mockImplementation(() => new Promise<void>(() => {}));
    pointer(launcher, 'pointerdown', { pointerType: 'touch' });
    pointer(launcher, 'pointerup', { pointerType: 'touch' });
    expect(palette.hidden).toBe(false); expect(palette.parentNode).toBe(cart);
    pointer(buttons[5]!, 'pointerdown', { pointerType: 'touch' }); buttons[5]!.focus(); await flush();
    pointer(buttons[5]!, 'pointerup', { pointerType: 'touch' }); buttons[5]!.click();
    expect(runScene).toHaveBeenCalledExactlyOnceWith('nose');
    launcher.hidden = true; await flush();
    expect(palette.hidden).toBe(true);
  });
  it.each(['sit', 'scratch', 'ears', 'stretch', 'nose', 'wave', 'happy', 'wake'])('a user selection immediately replaces %s instead of waiting', async (animation) => {
    const { host, launcher, buttons, runScene } = setup(); host.dataset.animation = animation;
    pointer(launcher, 'pointerover'); buttons[1]!.click();
    expect(runScene).toHaveBeenCalledExactlyOnceWith('sit');
    host.dataset.animation = 'idle'; await flush();
    expect(runScene).toHaveBeenCalledExactlyOnceWith('sit');
  });
  it.each(['drag', 'hidden', 'suppressed', 'off', 'disconnect', 'destroy'])('releases the interaction hold on %s without queuing a choice', async (reason) => {
    const { host, launcher, runScene, setInteractionHold } = setup(); host.dataset.motion = 'stroll';
    pointer(launcher, 'pointerover'); expect(setInteractionHold).toHaveBeenLastCalledWith(true);
    if (reason === 'drag') host.dataset.motion = 'drag';
    if (reason === 'hidden') launcher.hidden = true;
    if (reason === 'suppressed') host.dataset.state = 'suppressed';
    if (reason === 'off') host.shadowRoot!.querySelector('dialog')!.classList.add('motion-off');
    if (reason === 'disconnect') host.remove();
    if (reason === 'destroy') controller!.destroy();
    await flush(); host.dataset.motion = ''; launcher.hidden = false; host.dataset.state = 'closed';
    await flush(); expect(runScene).not.toHaveBeenCalled();
    expect(setInteractionHold).toHaveBeenLastCalledWith(false);
  });
  it('keeps controls and hold on the same live host when it joins the cart modal', async () => {
    const { host, launcher, palette, buttons, runScene, setInteractionHold } = setup();
    pointer(launcher, 'pointerover');
    const cart = document.createElement('dialog'); cart.open = true;
    document.body.append(cart); cart.append(host); await flush();
    expect(palette.parentNode).toBe(cart);
    expect(runScene).not.toHaveBeenCalled();
    expect(setInteractionHold.mock.calls).toEqual([[true]]);
    buttons[0]!.click();
    expect(runScene).toHaveBeenCalledExactlyOnceWith('wiggle');
  });
  it.each(['peek', 'arrival', 'hide', 'fall', 'parachute', 'climb', 'drag'])('never displays buttons during %s, including partial or head-only peeking', async (phase) => {
    const { host, launcher, palette, setInteractionHold } = setup();
    host.dataset.motion = phase; launcher.dataset.motion = phase;
    pointer(launcher, 'pointerover'); expect(palette.hidden).toBe(true);
    expect(setInteractionHold).not.toHaveBeenCalled();
    host.dataset.motion = ''; launcher.dataset.motion = ''; pointer(launcher, 'pointerover');
    expect(palette.hidden).toBe(false);
    launcher.dataset.motion = phase; await flush();
    expect(palette.hidden).toBe(true); expect(setInteractionHold).toHaveBeenLastCalledWith(false);
  });
  it('does not open on an unselected automatic flip', () => {
    const { host, launcher, palette, setInteractionHold } = setup();
    host.dataset.motion = 'flip'; launcher.dataset.motion = 'flip';
    pointer(launcher, 'pointerover'); expect(palette.hidden).toBe(true);
    expect(setInteractionHold).not.toHaveBeenCalled();
  });
  it('explains disabled/reduced motion instead of silently accepting a scene', async () => {
    const { host, launcher, buttons, runScene } = setup();
    pointer(launcher, 'pointerover');
    host.shadowRoot!.querySelector('dialog')!.classList.add('motion-off'); await flush();
    expect(buttons[5]!.getAttribute('aria-disabled')).toBe('true');
    buttons[5]!.click();
    expect(runScene).not.toHaveBeenCalled();
    const tooltip = document.querySelector<HTMLElement>('.companion-skills-tooltip')!;
    expect(tooltip.hidden).toBe(false); expect(tooltip.textContent).toContain('Движения выключены');
  });
});
