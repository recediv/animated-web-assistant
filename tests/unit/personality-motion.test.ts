import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { renderHeadPeekFrame } from '../../assets/source/mohlik.mjs';
import { PersonalityMotion } from '../../src/positioning/personality';

let time = 0;
let sequence = 0;
let frames: Map<number, FrameRequestCallback>;
const drivers: PersonalityMotion[] = [];
const paintedHeads = new Map<string, { left: number; right: number }>();

beforeAll(async () => {
  for (const size of [96, 64]) for (const side of ['left', 'right']) for (const headFrame of [0, 1] as const) {
    // The SVG already rotates the accepted head; the player only mirrors the
    // right-edge view. Measure actual painted pixels, not the transparent cell.
    let image = sharp(Buffer.from(renderHeadPeekFrame(headFrame))).resize(size, size);
    if (side === 'right') image = image.flop();
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let left = size, right = -1;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++)
      if (data[(y * size + x) * info.channels + 3]! > 8) {
        left = Math.min(left, x); right = Math.max(right, x);
      }
    paintedHeads.set(`${size}/${side}/${headFrame}`, { left, right: right + 1 });
  }
});

function expectPaintedHeadAtEdge(size: number, side: 'left' | 'right', launcherLeft: number,
  viewport: { left: number; width: number }) {
  for (const headFrame of [0, 1]) {
    const painted = paintedHeads.get(`${size}/${side}/${headFrame}`)!;
    const gap = side === 'left'
      ? launcherLeft + painted.left - viewport.left
      : viewport.left + viewport.width - launcherLeft - painted.right;
    expect(Math.abs(gap), `${size}px ${side}, painted head frame ${headFrame}`).toBeLessThanOrEqual(1.1);
    expect(painted.right - painted.left).toBeGreaterThan(size * .5);
  }
}

function frame(at: number) {
  const elapsed = at - time;
  time = at;
  vi.advanceTimersByTime(Math.max(0, elapsed));
  const callbacks = [...frames.values()];
  frames.clear();
  for (const callback of callbacks) callback(at);
}

function create(size = 96, side: 'left' | 'right' = 'right', random: () => number = () => 1) {
  const button = document.createElement('button');
  const moving = vi.fn();
  const motion = new PersonalityMotion(button, moving, undefined, random);
  const left = side === 'right' ? 1000 - size - 24 : 24;
  motion.updateBase({ launcherLeft: left, launcherTop: 700 - size * 11 / 12 }, { left: 0, top: 0, width: 1000, height: 700 }, size, side);
  frame(0);
  drivers.push(motion);
  return { button, moving, motion };
}

beforeEach(() => {
  vi.useFakeTimers();
  time = 0;
  sequence = 0;
  frames = new Map();
  vi.spyOn(performance, 'now').mockImplementation(() => time);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { const id = ++sequence; frames.set(id, callback); return id; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});
afterEach(() => {
  for (const driver of drivers.splice(0)) driver.destroy();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('finite character movement', () => {
  it.each([96, 64])('reaches paw contact without jumping when page movement starts at %ipx', async (size) => {
    const { motion, moving } = create(size);
    const initial = motion.offset;
    const preparing = motion.approachPagePush('left');
    expect(motion.offset).toEqual(initial); expect(frames.size).toBe(1);
    const base = 1000 - size - 24;
    let previousX = initial.x;
    for (const at of [425, 750, 800, 825, 849, 850]) {
      frame(at);
      expect(motion.offset.x).toBeLessThan(previousX);
      previousX = motion.offset.x;
    }
    await preparing;
    expect(base + motion.offset.x + size * 170 / 192).toBeCloseTo(0); expect(motion.offset.y).toBe(0);
    expect(moving).toHaveBeenCalledWith('page-push', expect.objectContaining({ facing: -1, activity: 'walk', durationMs: 850 }));
    expect(frames.size).toBe(0);
    const leftContact = motion.offset;
    motion.pagePushProgress('left', 0); expect(motion.offset).toEqual(leftContact);
    motion.pagePushProgress('left', .5); expect(base + motion.offset.x + size * 170 / 192).toBeCloseTo(500);
    motion.pagePushProgress('left', 2); expect(base + motion.offset.x + size * 170 / 192).toBeCloseTo(1000);
    expect(frames.size).toBe(0);
    motion.finishPagePush(); expect(base + motion.offset.x).toBeCloseTo(1000 - size - 4);
    const right = motion.approachPagePush('right');
    frame(1019); expect(motion.moving).toBe(true); frame(1020); await right;
    expect(base + motion.offset.x + size * 22 / 192).toBeCloseTo(1000);
    const rightContact = motion.offset;
    motion.pagePushProgress('right', 0); expect(motion.offset).toEqual(rightContact);
    motion.pagePushProgress('right', .5); expect(base + motion.offset.x + size * 22 / 192).toBeCloseTo(500);
    motion.pagePushProgress('right', 1); expect(base + motion.offset.x + size * 22 / 192).toBeCloseTo(0);
    const current = motion.offset; motion.pagePushProgress('left', NaN); expect(motion.offset).toEqual(current);
    motion.finishPagePush(); expect(base + motion.offset.x).toBeCloseTo(4);
    expect(frames.size).toBe(0);
  });
  it('contacts the exact page boundary in an offset visual viewport without detaching or adding frames', async () => {
    const { motion } = create(64);
    motion.updateBase({ launcherLeft: 800, launcherTop: 530 }, { left: 31, top: 17, width: 900, height: 600 }, 64, 'right');
    frame(0); motion.place({ x: 0, y: 617 - 64 * 11 / 12 - 530 });
    const prepared = motion.approachPagePush('right'); frame(850); await prepared;
    for (const progress of [0, .1, .5, .9, 1]) {
      motion.pagePushProgress('right', progress);
      expect(800 + motion.offset.x + 64 * 22 / 192).toBeCloseTo(31 + (1 - progress) * 900);
      expect(530 + motion.offset.y + 64 * 11 / 12).toBeCloseTo(617);
      expect(frames.size).toBe(0);
    }
    motion.finishPagePush(); expect(800 + motion.offset.x).toBeCloseTo(35);
  });
  it('rejects an airborne or dragged page push and resolves a cancelled approach at the pixel already drawn', async () => {
    const { motion } = create();
    motion.place({ x: 0, y: -100 }); expect(motion.canPagePush).toBe(false);
    await motion.approachPagePush('left'); expect(frames.size).toBe(0);
    motion.place({ x: 0, y: 0 }); motion.beginDrag(); expect(motion.canPagePush).toBe(false);
    motion.cancel(); const preparing = motion.approachPagePush('left'); frame(200);
    const current = motion.offset; motion.cancel(); await preparing;
    expect(motion.offset).toEqual(current); expect(frames.size).toBe(0);
  });
  it.each([[96, 84], [64, 144]])('leaves a %ipx character\'s %ipx store panel with a finite fall and landing before the page approach', async (size, reserved) => {
    const { motion, moving } = create(size);
    const base = 1000 - size - 24;
    const top = 700 - size * 11 / 12;
    motion.updateBase({ launcherLeft: base, launcherTop: top }, { left: 0, top: 0, width: 1000, height: 700 - reserved }, size, 'right');
    motion.place({ x: 0, y: -reserved }); expect(motion.canPagePush).toBe(true);
    motion.updateBase({ launcherLeft: base, launcherTop: top }, { left: 0, top: 0, width: 1000, height: 700 }, size, 'right');
    const from = motion.offset;
    moving.mockClear();
    const preparing = motion.approachPagePush('left', { settleToGround: true });
    expect(motion.offset).toEqual(from);
    const fallMs = Math.min(400, Math.max(120, Math.sqrt(2 * reserved / 1800) * 1000));
    frame(fallMs / 2);
    expect(motion.offset.x).toBe(from.x); expect(motion.offset.y).toBeCloseTo(-reserved * .75);
    frame(fallMs);
    expect(motion.offset.y).toBeCloseTo(0); expect(frames.size).toBe(0);
    frame(fallMs + 500);
    expect(motion.offset.x).toBeCloseTo(from.x); expect(frames.size).toBe(1);
    frame(fallMs + 925); expect(motion.offset.x).toBeLessThan(from.x); expect(motion.offset.y).toBe(0);
    frame(fallMs + 1350); await preparing;
    expect(base + motion.offset.x + size * 170 / 192).toBeCloseTo(0);
    expect(moving.mock.calls.map(([phase]) => phase)).toEqual(['fall', 'land', 'page-push', null]);
    expect(frames.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels page preparation during the descent without snapping to either floor or starting the later approach', async () => {
    const { motion, moving } = create();
    motion.place({ x: -50, y: -84 });
    const preparing = motion.approachPagePush('left', { settleToGround: true }); frame(120);
    const drawn = motion.offset;
    motion.finishPagePush(); await preparing;
    expect(motion.offset).toEqual(drawn); expect(frames.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
    frame(5000);
    expect(motion.offset).toEqual(drawn);
    expect(moving.mock.calls.some(([phase]) => phase === 'page-push')).toBe(false);
  });
  it('walks by elapsed time, allows only one route and stops rendering at the endpoint', async () => {
    const { motion, moving } = create();
    const first = motion.run('stroll');
    expect(motion.run('climb')).toBe(first);
    expect(frames.size).toBe(1);
    frame(1200);
    expect(motion.offset.x).toBeCloseTo(-63.36);
    expect(motion.offset.y).toBe(0);
    frame(2400);
    await first;
    expect(motion.offset.x).toBeCloseTo(-126.72);
    expect(motion.moving).toBe(false);
    expect(frames.size).toBe(0);
    expect(moving.mock.calls.map(([phase]) => phase)).toEqual(['stroll', null]);
    expect(moving).toHaveBeenCalledWith('stroll', { facing: -1 });
  });

  it('alternates walking direction and uses a shorter compact path', async () => {
    const { motion } = create(64);
    const first = motion.run('stroll');
    frame(2400); await first;
    expect(motion.offset.x).toBeCloseTo(-84.48);
    const second = motion.run('stroll');
    frame(4800); await second;
    expect(motion.offset.x).toBe(0);
  });

  it('freezes the current position on cancellation and resolves the route without jumping', async () => {
    const { motion, button } = create();
    const running = motion.run('stroll');
    frame(800);
    const offset = motion.offset;
    const transform = button.style.transform;
    motion.cancel();
    await running;
    expect(motion.offset).toEqual(offset);
    expect(button.style.transform).toBe(transform);
    expect(frames.size).toBe(0);
    frame(5000);
    expect(motion.offset).toEqual(offset);
  });

  it('starts a new route from its frozen offset and can explicitly return to baseline', async () => {
    const { motion, button } = create();
    const first = motion.run('stroll'); frame(800); motion.cancel(); await first;
    const frozen = motion.offset;
    const second = motion.run('stroll');
    frame(800);
    expect(motion.offset).toEqual(frozen);
    frame(3200); await second;
    motion.reset();
    expect(motion.offset).toEqual({ x: 0, y: 0 });
    expect(button.style.transform).toBe('');
  });

  it('holds a cancelled partially visible peek through context updates and starts walking from that same position', async () => {
    const { motion, button } = create();
    const peeking = motion.run('peek'); frame(4500); motion.cancel(); await peeking;
    const frozen = motion.offset;
    const transform = button.style.transform;
    motion.updateBase({ launcherLeft: 880, launcherTop: 612 }, { left: 0, top: 0, width: 1000, height: 700 }, 96, 'right');
    frame(4500);
    expect(motion.offset).toEqual(frozen);
    expect(button.style.transform).toBe(transform);
    const walking = motion.run('stroll'); frame(4500);
    expect(motion.offset).toEqual(frozen);
    frame(6900); await walking;
    expect(motion.offset.x).toBeCloseTo(-54.72);
    expect(frames.size).toBe(0);
  });

  it.each([[96, 'right'], [96, 'left'], [64, 'right'], [64, 'left']] as const)(
    'climbs vertically in two readable pulls with finite grip pauses, %spx %s wall', async (size, side) => {
      const { motion, moving } = create(size, side);
      const wall = side === 'right' ? 20 : -20;
      motion.place({ x: wall, y: 0 });
      const height = Math.min(160, size * 1.35);
      const climbing = motion.run('climb');
      frame(375);
      expect(motion.offset.x).toBe(wall);
      expect(motion.offset.y).toBeCloseTo(-height * .2);
      frame(750);
      expect(motion.offset.y).toBeCloseTo(-height * .4);
      expect(moving).toHaveBeenLastCalledWith('climb', { activity: 'grip', durationMs: 150 });
      expect(frames.size).toBe(0);
      expect(vi.getTimerCount()).toBe(1);
      frame(850);
      expect(motion.offset.y).toBeCloseTo(-height * .4);
      expect(frames.size).toBe(0);
      frame(1275);
      expect(motion.offset.y).toBeCloseTo(-height * .7);
      expect(motion.offset.x).toBe(wall);
      frame(1650);
      expect(motion.offset.y).toBeCloseTo(-height);
      expect(moving).toHaveBeenLastCalledWith('climb', { activity: 'grip', durationMs: 200 });
      expect(frames.size).toBe(0);
      frame(1750);
      expect(motion.offset.y).toBeCloseTo(-height);
      frame(2325);
      expect(motion.offset.y).toBeCloseTo(-height * .5);
      expect(motion.offset.x).toBe(wall);
      expect(moving).toHaveBeenLastCalledWith('climb', { activity: 'climb', durationMs: 950 });
      frame(2800); await climbing;
      expect(motion.offset).toEqual({ x: wall, y: 0 });
      expect(frames.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
      expect(moving.mock.calls.map(([, metadata]) => metadata?.activity)).toEqual(['climb', 'grip', 'climb', 'grip', 'climb', undefined]);
    },
  );

  it('walks to the nearby wall on the floor before climbing rather than flying diagonally to the configured side', async () => {
    const { motion, moving } = create();
    motion.place({ x: 180 - 880, y: 0 });
    const climbing = motion.run('climb');
    expect(moving).toHaveBeenLastCalledWith('stroll', expect.objectContaining({ activity: 'walk', facing: -1 }));
    frame(1000);
    expect(880 + motion.offset.x).toBeCloseTo(180 - 52.8);
    expect(motion.offset.y).toBe(0);
    const approach = 176 / 52.8 * 1000;
    frame(approach + 375);
    expect(880 + motion.offset.x).toBe(4);
    expect(motion.offset.y).toBeLessThan(0);
    frame(approach + 2800); await climbing;
    expect(880 + motion.offset.x).toBe(4);
    expect(motion.offset.y).toBe(0);
    expect(frames.size).toBe(0);
  });

  it('cancels a grip without a jump or later resurrection from its finite timer', async () => {
    const { motion, moving } = create();
    motion.place({ x: 20, y: 0 });
    const climbing = motion.run('climb'); frame(800);
    expect(vi.getTimerCount()).toBe(1);
    const frozen = motion.offset;
    motion.cancel(); await climbing;
    const calls = moving.mock.calls.length;
    frame(10000);
    expect(motion.offset).toEqual(frozen);
    expect(moving).toHaveBeenCalledTimes(calls);
    expect(vi.getTimerCount()).toBe(0);
    expect(frames.size).toBe(0);
  });

  it('keeps a gripping character at the same absolute position across a base change and finishes on the floor', async () => {
    const { motion } = create();
    motion.place({ x: 20, y: 0 });
    const climbing = motion.run('climb'); frame(800);
    const absolute = { x: 880 + motion.offset.x, y: 612 + motion.offset.y };
    motion.updateBase({ launcherLeft: 780, launcherTop: 612 }, { left: 0, top: 0, width: 1000, height: 700 }, 96, 'right');
    expect(780 + motion.offset.x).toBe(absolute.x);
    expect(612 + motion.offset.y).toBe(absolute.y);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(1);
    frame(2800); await climbing;
    expect(motion.offset).toEqual({ x: 120, y: 0 });
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['right', 'left'] as const)('peeks at the %s edge with a visible 48-pixel target and returns fully onscreen', async (side) => {
    const { motion } = create(96, side);
    const promise = motion.run('peek');
    frame(2500);
    expect(side === 'right' ? 880 + motion.offset.x : 24 + motion.offset.x + 96).toBe(side === 'right' ? 1008 : -8);
    expect(frames.size).toBe(0);
    frame(4500);
    expect(motion.offset.x).toBe(side === 'right' ? 72 : -72);
    expect(frames.size).toBe(0);
    frame(6500); await promise;
    expect(motion.offset).toEqual({ x: side === 'right' ? 20 : -20, y: 0 });
    expect(frames.size).toBe(0);
  });

  it.each(['right', 'left'] as const)('faces its actual direction on both legs of a %s peek', async (side) => {
    const { motion, moving } = create(96, side);
    const promise = motion.run('peek');
    const outward = side === 'right' ? 1 : -1;
    expect(moving).toHaveBeenLastCalledWith('peek', expect.objectContaining({ facing: outward, activity: 'walk' }));
    frame(3500);
    expect(moving).toHaveBeenLastCalledWith('peek', expect.objectContaining({ facing: -outward, activity: 'walk' }));
    const calls = moving.mock.calls.length;
    frame(4000);
    expect(moving).toHaveBeenCalledTimes(calls);
    frame(6500); await promise;
    expect(motion.offset).toEqual({ x: side === 'right' ? 20 : -20, y: 0 });
    expect(frames.size).toBe(0);
  });

  it.each([[96, 'right'], [96, 'left'], [64, 'right'], [64, 'left']] as const)(
    'reveals only a head at the %spx %s edge, retracts it fully, then walks its body back', async (size, side) => {
      const { motion, moving } = create(size, side);
      const base = side === 'right' ? 1000 - size - 24 : 24;
      const peeking = motion.run('peek', { headOnly: true });
      const approach = moving.mock.calls[0]![1]!.durationMs!;
      const inward = side === 'left' ? 1 : -1;
      frame(approach + 100);
      expect(side === 'right' ? base + motion.offset.x : base + motion.offset.x + size)
        .toBe(side === 'right' ? 1008 : -8);
      expect(moving).toHaveBeenLastCalledWith('hide', expect.objectContaining({ activity: 'hide' }));
      frame(approach + 1000);
      expect(moving).toHaveBeenLastCalledWith('peek', expect.objectContaining({ activity: 'head-look', facing: inward }));
      frame(approach + 1500);
      expectPaintedHeadAtEdge(size, side, base + motion.offset.x, { left: 0, width: 1000 });
      expect(frames.size).toBe(0);
      expect(vi.getTimerCount()).toBe(1);
      frame(approach + 2700);
      expect(moving.mock.calls.filter(([, metadata]) => metadata?.activity === 'head-look')).toHaveLength(1);
      expect(moving.mock.calls.filter(([, metadata]) => metadata?.activity === 'head-look')[0]![1]!.facing).toBe(inward);
      frame(approach + 3100);
      expect(side === 'right' ? base + motion.offset.x : base + motion.offset.x + size)
        .toBe(side === 'right' ? 1008 : -8);
      expect(moving).toHaveBeenLastCalledWith('hide', expect.objectContaining({ activity: 'hide', durationMs: 300 }));
      expect(frames.size).toBe(0);
      frame(approach + 6000);
      await peeking;
      expect(base + motion.offset.x).toBe(side === 'right' ? 1000 - size - 4 : 4);
      expect(motion.offset.y).toBe(0);
      expect(moving).toHaveBeenCalledWith('return', expect.objectContaining({ activity: 'walk', facing: inward }));
      expect(frames.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([[96, 'right'], [96, 'left'], [64, 'right'], [64, 'left']] as const)(
    'keeps the painted head flush to a resized, offset viewport during its %spx %s hold', async (size, side) => {
      const { motion, moving } = create(size, side);
      const peeking = motion.run('peek', { headOnly: true });
      const approach = moving.mock.calls[0]![1]!.durationMs!;
      frame(approach + 1700);
      const viewport = { left: 37, top: 19, width: 440, height: 681 };
      const placement = {
        launcherLeft: side === 'right' ? viewport.left + viewport.width - size - 24 : viewport.left + 24,
        launcherTop: viewport.top + viewport.height - size * 11 / 12,
      };
      motion.updateBase(placement, viewport, size, side);
      expectPaintedHeadAtEdge(size, side, placement.launcherLeft + motion.offset.x, viewport);
      expect(frames.size).toBe(0);
      expect(vi.getTimerCount()).toBe(1);
      frame(approach + 2000);
      expectPaintedHeadAtEdge(size, side, placement.launcherLeft + motion.offset.x, viewport);
      expect(moving.mock.calls.filter(([, metadata]) => metadata?.activity === 'head-look')).toHaveLength(1);
      frame(approach + 6000); await peeking;
      expect(placement.launcherLeft + motion.offset.x).toBeCloseTo(
        side === 'right' ? viewport.left + viewport.width - size - 4 : viewport.left + 4,
      );
      expect(frames.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('cancels a head hold at its drawn position and never restarts the body from the old timer', async () => {
    const { motion, moving, button } = create();
    const peeking = motion.run('peek', { headOnly: true });
    const approach = moving.mock.calls[0]![1]!.durationMs!;
    frame(approach + 1700);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(1);
    const offset = motion.offset;
    const transform = button.style.transform;
    motion.cancel();
    await peeking;
    const calls = moving.mock.calls.length;
    frame(20000);
    expect(motion.offset).toEqual(offset);
    expect(button.style.transform).toBe(transform);
    expect(moving).toHaveBeenCalledTimes(calls);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rebases a stationary head continuously and retains the later full-body exit', async () => {
    const { motion, moving } = create();
    const peeking = motion.run('peek', { headOnly: true });
    const approach = moving.mock.calls[0]![1]!.durationMs!;
    frame(approach + 1700);
    const absolute = 880 + motion.offset.x;
    motion.updateBase({ launcherLeft: 720, launcherTop: 612 }, { left: 0, top: 0, width: 1000, height: 700 }, 96, 'right');
    expect(720 + motion.offset.x).toBe(absolute);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(1);
    frame(approach + 2700);
    expect(moving.mock.calls.filter(([, metadata]) => metadata?.activity === 'head-look')).toHaveLength(1);
    frame(approach + 6000);
    await peeking;
    expect(720 + motion.offset.x + 96).toBe(996);
    expect(motion.offset.y).toBe(0);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([96, 64])('walks linearly at the sprite foot speed for a %spx actor', async (size) => {
    const { motion } = create(size);
    const walking = motion.run('stroll');
    frame(400); const first = motion.offset.x;
    frame(800); const second = motion.offset.x;
    frame(1200); const third = motion.offset.x;
    expect(first).toBeCloseTo(-size * .55 * .4);
    expect(second - first).toBeCloseTo(first);
    expect(third - second).toBeCloseTo(first);
    frame(2400); await walking;
    expect(motion.offset.x).toBeCloseTo(-size * 1.32);
  });

  it.each([96, 64])('chooses the nearby left edge instead of crossing a wide viewport, size=%s', async (size) => {
    const { motion, moving } = create(size, 'right');
    const base = 1000 - size - 24;
    motion.place({ x: 180 - base, y: 0 });
    const initial = motion.offset;
    const peeking = motion.run('peek');
    expect(motion.offset).toEqual(initial);
    expect(moving).toHaveBeenLastCalledWith('peek', expect.objectContaining({ facing: -1, activity: 'walk' }));
    frame(1000);
    expect(initial.x - motion.offset.x).toBeCloseTo(size * .55);
    frame(2000);
    expect(initial.x - motion.offset.x).toBeCloseTo(size * 1.1);
    frame(20000); await peeking;
    expect(base + motion.offset.x).toBe(4);
    expect(motion.offset.y).toBe(0);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits wholly outside the screen with one finite timer and no rendering loop', async () => {
    const { motion, moving } = create();
    const peeking = motion.run('peek'); frame(2500);
    expect(880 + motion.offset.x).toBeGreaterThan(1000);
    expect(moving).toHaveBeenLastCalledWith('hide', { activity: 'hide', durationMs: 1000 });
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(1);
    const frozen = motion.offset;
    for (let index = 0; index < 25; index++) motion.updateBase({ launcherLeft: 880, launcherTop: 612 },
      { left: 0, top: 0, width: 1000, height: 700 }, 96, 'right');
    frame(3000);
    expect(motion.offset).toEqual(frozen);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(1);
    frame(6500); await peeking;
    expect(motion.moving).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([['hidden', 2500], ['curious', 4500]] as const)('cancels a %s hold without snapping or leaking its timer', async (_stage, at) => {
    const { motion, button } = create();
    const peeking = motion.run('peek'); frame(at);
    expect(frames.size).toBe(0);
    const frozen = motion.offset;
    const transform = button.style.transform;
    motion.cancel(); await peeking;
    expect(motion.offset).toEqual(frozen);
    expect(button.style.transform).toBe(transform);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    frame(20000);
    expect(motion.offset).toEqual(frozen);
  });

  it('may retreat once more after looking, then returns nearby without restoring an old drop point', async () => {
    const { motion, moving } = create(96, 'right', () => 0);
    motion.beginDrag(); motion.dragTo({ x: -200, y: -100 });
    const dropping = motion.release(); frame(1000); await dropping;
    motion.place({ x: 0, y: 0 });
    const peeking = motion.run('peek');
    frame(7200);
    expect(moving).toHaveBeenLastCalledWith('hide', { activity: 'hide', durationMs: 400 });
    expect(frames.size).toBe(0);
    frame(11000); await peeking;
    expect(moving.mock.calls.filter(([phase]) => phase === 'hide')).toHaveLength(2);
    expect(motion.offset).toEqual({ x: 20, y: 0 });
    motion.reset();
    expect(motion.offset).toEqual({ x: -200, y: 0 });
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rebases a peek approach continuously and retains the walking speed toward the new edge', async () => {
    const { motion } = create();
    const peeking = motion.run('peek'); frame(1000);
    const absolute = 880 + motion.offset.x;
    motion.updateBase({ launcherLeft: 680, launcherTop: 612 }, { left: 0, top: 0, width: 800, height: 700 }, 96, 'right');
    expect(680 + motion.offset.x).toBeCloseTo(absolute);
    frame(1500);
    expect(absolute - (680 + motion.offset.x)).toBeCloseTo(26.4);
    expect(motion.offset.y).toBe(0);
    frame(20000); await peeking;
    expect(680 + motion.offset.x + 96).toBe(796);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('destroys an offscreen hold without resurrection from its remaining timeout', async () => {
    const { motion, moving, button } = create();
    const peeking = motion.run('peek'); frame(2500);
    motion.destroy(); await peeking;
    expect(button.style.transform).toBe('');
    const calls = moving.mock.calls.length;
    frame(20000);
    expect(moving).toHaveBeenCalledTimes(calls);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('wiggles through the sprite callback while button coordinates remain unchanged', async () => {
    const { motion, button, moving } = create();
    const promise = motion.run('wiggle');
    frame(350);
    expect(motion.offset).toEqual({ x: 0, y: 0 });
    expect(button.style.transform).toBe('');
    expect(frames.size).toBe(0);
    frame(3200); await promise;
    expect(moving.mock.calls).toEqual([['wiggle'], [null]]);
    expect(frames.size).toBe(0);
  });

  it('coalesces viewport changes without snapping an unsupported character or scrolling the document', () => {
    const { motion } = create();
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const placement = { launcherLeft: 300, launcherTop: 400 };
    motion.updateBase(placement, { left: 0, top: 0, width: 360, height: 500 }, 64, 'right');
    motion.updateBase(placement, { left: 0, top: 0, width: 320, height: 480 }, 64, 'right');
    expect(frames.size).toBe(1);
    frame(10);
    expect(motion.offset.x).toBe(580);
    expect(motion.offset.y).toBe(212);
    expect(motion.needsRecovery).toBe(true);
    expect(scroll).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it('destroy releases the only frame and restores preexisting inline transforms', async () => {
    const button = document.createElement('button');
    button.style.transform = 'scale(1.1)';
    const motion = new PersonalityMotion(button, () => {});
    drivers.push(motion);
    motion.updateBase({ launcherLeft: 880, launcherTop: 612 }, { left: 0, top: 0, width: 1000, height: 700 }, 96, 'right');
    const promise = motion.run('stroll'); frame(400);
    motion.destroy(); await promise;
    expect(frames.size).toBe(0);
    expect(button.style.transform).toBe('scale(1.1)');
    await motion.run('climb');
    expect(frames.size).toBe(0);
  });

  it('isolates callback errors and malformed viewport data', async () => {
    const button = document.createElement('button');
    const motion = new PersonalityMotion(button, () => { throw new Error('Optional sprite unavailable'); });
    drivers.push(motion);
    motion.updateBase({ launcherLeft: 0, launcherTop: 0 }, { left: 0, top: 0, width: Number.NaN, height: 700 }, 96, 'right');
    await motion.run('stroll');
    expect(frames.size).toBe(0);
    motion.updateBase({ launcherLeft: 880, launcherTop: 612 }, { left: 0, top: 0, width: 1000, height: 700 }, 96, 'right');
    const promise = motion.run('wiggle'); frame(3200); await promise;
    expect(frames.size).toBe(0);
  });

  it('reports each drawn offset for a following speech bubble and reports baseline on reset', async () => {
    const button = document.createElement('button');
    const position = vi.fn();
    const motion = new PersonalityMotion(button, () => {}, position, () => 1);
    drivers.push(motion);
    motion.updateBase({ launcherLeft: 880, launcherTop: 612 }, { left: 0, top: 0, width: 1000, height: 700 }, 96, 'right');
    frame(0);
    const promise = motion.run('stroll');
    frame(1200);
    expect(position).toHaveBeenLastCalledWith({ x: expect.closeTo(-63.36), y: 0 });
    motion.cancel(); await promise;
    expect(position).toHaveBeenLastCalledWith(motion.offset);
    motion.reset();
    expect(position).toHaveBeenLastCalledWith({ x: 0, y: 0 });
    position.mockImplementation(() => { throw new Error('Bubble unavailable'); });
    const next = motion.run('wiggle'); frame(4400); await next;
    expect(frames.size).toBe(0);
  });
});

describe('dragging, finite physics and varied entrances', () => {
  it('requires geometry, interrupts a route once and moves manually without animation frames', async () => {
    const fresh = new PersonalityMotion(document.createElement('button'), () => {});
    drivers.push(fresh);
    expect(fresh.beginDrag()).toBe(false);
    const { motion, moving } = create();
    const walking = motion.run('stroll'); frame(800);
    expect(motion.beginDrag()).toBe(true);
    await walking;
    expect(motion.beginDrag()).toBe(true);
    expect(motion.dragging).toBe(true);
    expect(motion.moving).toBe(true);
    motion.dragTo({ x: -300, y: -200 });
    expect(motion.offset).toEqual({ x: -300, y: -200 });
    motion.dragTo({ x: Number.NaN, y: -100 });
    expect(motion.offset).toEqual({ x: -300, y: -200 });
    expect(frames.size).toBe(0);
    expect(moving.mock.calls.map(([phase]) => phase)).toEqual(['stroll', null, 'drag']);
    await motion.run('climb');
    expect(frames.size).toBe(0);
  });

  it('keeps the entire canvas visible during manual dragging, including its transparent foot margin', () => {
    const { motion } = create();
    motion.beginDrag(); motion.dragTo({ x: 9999, y: 9999 });
    expect(motion.offset).toEqual({ x: 20, y: -12 });
    motion.dragTo({ x: -9999, y: -9999 });
    expect(motion.offset).toEqual({ x: -876, y: -608 });
    expect(frames.size).toBe(0);
  });

  it('grabs a partially visible peek at its exact drawn offset before applying manual drag bounds', async () => {
    const { motion } = create();
    const peek = motion.run('peek'); frame(4500);
    const drawn = motion.offset;
    expect(motion.beginDrag()).toBe(true);
    await peek;
    expect(motion.offset).toEqual(drawn);
    expect(frames.size).toBe(0);
    motion.dragTo({ x: 9999, y: -100 });
    expect(motion.offset.x).toBe(20);
  });

  it('falls by elapsed gravity, holds landing without a frame loop and stays at the release point', async () => {
    const { motion, moving } = create();
    motion.beginDrag(); motion.dragTo({ x: -100, y: -180 });
    const dropping = motion.release();
    expect(motion.release()).toBe(dropping);
    frame(224);
    expect(motion.offset.y).toBeCloseTo(-134.8416, 2);
    frame(450);
    expect(motion.offset).toEqual({ x: -100, y: 0 });
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(1);
    frame(950);
    expect(frames.size).toBe(0);
    frame(2500); await dropping;
    expect(motion.offset).toEqual({ x: -100, y: 0 });
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(moving.mock.calls.map(([phase]) => phase)).toEqual(['drag', 'fall', 'land', null]);
  });

  it('deploys a readable parachute only for a sufficiently high release', async () => {
    const { motion, moving } = create();
    motion.beginDrag(); motion.dragTo({ x: -200, y: -480 });
    const dropping = motion.release({ parachute: true });
    expect(moving.mock.calls.map(([phase]) => phase)).toEqual(['drag', 'parachute']);
    frame(1100);
    expect(motion.offset.y).toBe(-240);
    frame(2200);
    expect(motion.offset.y).toBe(0);
    expect(frames.size).toBe(0);
    frame(4000); await dropping;
    expect(moving.mock.calls.map(([phase]) => phase)).toEqual(['drag', 'parachute', 'land', null]);
    expect(motion.offset).toEqual({ x: -200, y: 0 });
  });

  it.each([64, 96])('chooses the descent immediately at the four-height boundary for a %spx actor', async (size) => {
    const { motion, moving } = create(size);
    for (const extra of [-1, 0, 1]) {
      moving.mockClear();
      motion.beginDrag(); motion.dragTo({ x: -200, y: -(size * 4 + extra) });
      const dropping = motion.release({ parachute: true });
      const descent = extra > 0 ? 'parachute' : 'fall';
      expect(moving.mock.calls.map(([phase]) => phase)).toEqual(['drag', descent]);
      frame(time + 4000); await dropping;
      expect(moving.mock.calls.map(([phase]) => phase)).toEqual(['drag', descent, 'land', null]);
      expect(motion.offset.y).toBe(0);
      expect(frames.size).toBe(0);
    }
  });

  it('uses a short ordinary landing for a release near the ground', async () => {
    const { motion, moving } = create();
    motion.beginDrag(); motion.dragTo({ x: 0, y: -20 });
    const dropping = motion.release({ parachute: true });
    frame(180);
    expect(motion.offset.y).toBe(0);
    expect(frames.size).toBe(0);
    frame(680); await dropping;
    expect(moving.mock.calls.map(([phase]) => phase)).toEqual(['drag', 'fall', 'land', null]);
  });

  it('does not pull a resting actor upward by its transparent margin on release', async () => {
    const { motion } = create();
    motion.beginDrag();
    const dropping = motion.release();
    frame(90);
    expect(motion.offset.y).toBe(0);
    frame(680); await dropping;
    expect(motion.offset.y).toBe(0);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the moved resting point across suppression and a placement baseline change', async () => {
    const { motion, moving } = create();
    motion.beginDrag(); motion.dragTo({ x: -500, y: -100 });
    const dropping = motion.release();
    frame(5000); await dropping;
    expect(motion.offset).toEqual({ x: -500, y: 0 });
    motion.reset();
    expect(motion.offset).toEqual({ x: -500, y: 0 });
    motion.updateBase({ launcherLeft: 780, launcherTop: 580 }, { left: 0, top: 0, width: 1000, height: 700 }, 96, 'right');
    motion.reset();
    expect(780 + motion.offset.x).toBe(380);
    expect(moving.mock.calls.filter(([phase]) => phase === 'hide' || phase === 'return')).toHaveLength(0);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['fall', 100, {}], ['parachute', 300, { parachute: true }],
    ['land', 650, {}],
  ] as const)('cancels during %s, resolving the promise and preserving the drawn coordinates', async (phase, at, options) => {
    const { motion, moving } = create();
    motion.beginDrag(); motion.dragTo({ x: -200, y: phase === 'parachute' ? -480 : -320 });
    const dropping = motion.release(options);
    frame(at);
    expect(moving.mock.calls.at(-1)?.[0]).toBe(phase);
    const frozen = motion.offset;
    motion.cancel(); await dropping;
    expect(motion.offset).toEqual(frozen);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    frame(7000);
    expect(motion.offset).toEqual(frozen);
  });

  it('releases immediately under the moved point with reduced motion and leaves no timer', async () => {
    const { motion, moving } = create();
    motion.beginDrag(); motion.dragTo({ x: -200, y: -320 });
    await motion.release({ reducedMotion: true, parachute: true });
    expect(motion.offset).toEqual({ x: -200, y: 0 });
    expect(moving.mock.calls.map(([phase]) => phase)).toEqual(['drag', null]);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves absolute dragged coordinates as the placement baseline changes', () => {
    const { motion } = create();
    motion.beginDrag(); motion.dragTo({ x: -300, y: -200 });
    motion.updateBase({ launcherLeft: 780, launcherTop: 480 }, { left: 0, top: 0, width: 1000, height: 700 }, 96, 'right');
    expect(motion.offset).toEqual({ x: -200, y: -68 });
    expect(780 + motion.offset.x).toBe(580);
    expect(480 + motion.offset.y).toBe(412);
    expect(frames.size).toBe(0);
  });

  it('keeps each newly chosen release point after a varied spawn, including reduced motion', async () => {
    const { motion } = create();
    motion.place({ x: -320, y: 0 });
    motion.beginDrag(); motion.dragTo({ x: -500, y: -180 });
    const dropping = motion.release(); frame(3000); await dropping;
    expect(motion.offset).toEqual({ x: -500, y: 0 });
    motion.beginDrag(); motion.dragTo({ x: -200, y: -250 });
    await motion.release({ reducedMotion: true });
    expect(motion.offset).toEqual({ x: -200, y: 0 });
  });

  it('rebases an active fall without reversing its direction and keeps the release location', async () => {
    const { motion } = create();
    motion.beginDrag(); motion.dragTo({ x: -200, y: -180 });
    const dropping = motion.release(); frame(200);
    const absolute = { x: 880 + motion.offset.x, y: 612 + motion.offset.y };
    motion.updateBase({ launcherLeft: 780, launcherTop: 480 }, { left: 0, top: 0, width: 1000, height: 700 }, 96, 'right');
    expect(780 + motion.offset.x).toBeCloseTo(absolute.x);
    expect(480 + motion.offset.y).toBeCloseTo(absolute.y);
    const y = motion.offset.y;
    frame(250);
    expect(motion.offset.y).toBeGreaterThan(y);
    frame(4000); await dropping;
    expect(motion.offset).toEqual({ x: -100, y: 132 });
  });

  it.each(['left', 'right', 'bottom', 'top'] as const)('enters from the %s edge, reports its source and ends at a varied safe ground point', async (arrival) => {
    const { motion, moving } = create();
    const entering = motion.enter(arrival);
    const start = motion.offset;
    if (arrival === 'left') expect(880 + start.x + 96).toBeLessThan(0);
    if (arrival === 'right') expect(880 + start.x).toBeGreaterThan(1000);
    if (arrival === 'top') expect(612 + start.y + 96).toBeLessThan(0);
    if (arrival === 'bottom') expect(612 + start.y).toBeGreaterThan(700);
    expect(moving.mock.calls[0]?.[1]).toMatchObject({ arrival });
    frame(5000); await entering;
    expect(motion.offset.y).toBe(0);
    expect(motion.offset.x).toBeGreaterThanOrEqual(-876);
    expect(motion.offset.x).toBeLessThanOrEqual(20);
    expect(motion.offset.x).not.toBe(0);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    if (arrival === 'left') expect(moving.mock.calls[0]?.[1]).toMatchObject({ facing: 1 });
    if (arrival === 'right') expect(moving.mock.calls[0]?.[1]).toMatchObject({ facing: -1 });
  });

  it.each([['left', 96], ['right', 96], ['left', 64], ['right', 64]] as const)('walks in from %s without traversing the screen, size=%s', async (arrival, size) => {
    const { motion, moving } = create(size);
    const entering = motion.enter(arrival);
    const initial = motion.offset;
    frame(500); const first = motion.offset;
    frame(1000); const second = motion.offset;
    expect(Math.abs(first.x - initial.x)).toBeCloseTo(size * .55 * .5);
    expect(Math.abs(second.x - first.x)).toBeCloseTo(size * .55 * .5);
    expect(moving.mock.calls[0]?.[1]).toMatchObject({ activity: 'walk', arrival });
    frame(6000); await entering;
    const left = 1000 - size - 24 + motion.offset.x;
    const gap = arrival === 'left' ? left : 1000 - (left + size);
    expect(gap).toBeGreaterThanOrEqual(40);
    expect(gap).toBeLessThanOrEqual(124);
    expect(motion.offset.y).toBe(0);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('varies bounded spawn locations and walk distances with its injectable random source', async () => {
    const random = vi.fn().mockReturnValueOnce(0.1).mockReturnValueOnce(0.9).mockReturnValue(0);
    const { motion } = create(96, 'right', random);
    motion.spawn(); const first = motion.offset.x;
    motion.spawn(); const second = motion.offset.x;
    expect(second).toBeGreaterThan(first);
    motion.place({ x: 0, y: 0 });
    const walking = motion.run('stroll'); frame(2400); await walking;
    expect(motion.offset.x).toBeCloseTo(-101.376);
  });

  it('performs one readable flip with a bounded jump and stops all frames at 2.5 seconds', async () => {
    const { motion, moving } = create();
    const flipping = motion.run('flip');
    frame(1250);
    expect(motion.offset).toEqual({ x: 0, y: -90 });
    frame(2500); await flipping;
    expect(motion.offset).toEqual({ x: 0, y: 0 });
    expect(moving.mock.calls.map(([phase]) => phase)).toEqual(['flip', null]);
    expect(frames.size).toBe(0);
  });

  it('destroy during landing clears its finite hold timer and resolves the release', async () => {
    const { motion } = create();
    motion.beginDrag(); motion.dragTo({ x: -200, y: -180 });
    const dropping = motion.release(); frame(500);
    expect(vi.getTimerCount()).toBe(1);
    motion.destroy(); await dropping;
    expect(vi.getTimerCount()).toBe(0);
    expect(frames.size).toBe(0);
    expect(motion.beginDrag()).toBe(false);
  });

  it('prevents callbacks from starting a fresh route during destruction', async () => {
    const button = document.createElement('button');
    const callbacks = vi.fn();
    const grabAttempts: boolean[] = [];
    let destroying = false;
    const motion = new PersonalityMotion(button, (phase) => {
      callbacks(phase);
      if (phase === null) void motion.run('stroll');
    }, () => {
      if (!destroying) return;
      void motion.enter('top');
      void motion.recover();
      motion.spawn();
      grabAttempts.push(motion.beginDrag());
    });
    drivers.push(motion);
    motion.updateBase({ launcherLeft: 880, launcherTop: 612 }, { left: 0, top: 0, width: 1000, height: 700 }, 96, 'right');
    frame(0);
    const scene = motion.run('stroll'); frame(400);
    destroying = true;
    motion.destroy(); await scene;
    expect(callbacks.mock.calls).toEqual([['stroll'], [null]]);
    expect(grabAttempts).toEqual([false]);
    expect(motion.moving).toBe(false);
    expect(motion.needsRecovery).toBe(false);
    expect(button.style.transform).toBe('');
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('visible viewport floor and recovery', () => {
  it.each([96, 64])('keeps one tail scene through browser-bar and viewport-offset changes at %spx', async (size) => {
    const { motion, moving } = create(size);
    const scene = motion.run('wiggle');
    let finished = false;
    void scene.then(() => { finished = true; });
    frame(1000);
    for (const [index, [top, height]] of [[0, 699], [0, 700], [20, 650], [0, 750], [0, 700]].entries()) {
      motion.updateBase({ launcherLeft: 1000 - size - 24, launcherTop: top! + height! - size * 11 / 12 },
        { left: 0, top: top!, width: 1000, height: height! }, size, 'right', { followGround: true });
      expect(moving.mock.calls.map(([phase]) => phase)).toEqual(['wiggle']);
      expect(motion.offset.y).toBeCloseTo(0);
      expect(motion.needsRecovery).toBe(false);
      expect(frames.size).toBe(0);
      expect(vi.getTimerCount()).toBe(1);
      frame(1200 + index * 200);
    }
    frame(3199);
    await Promise.resolve();
    expect(finished).toBe(false);
    frame(3200); await scene;
    expect(moving.mock.calls.map(([phase]) => phase)).toEqual(['wiggle', null]);
    expect(motion.offset).toEqual({ x: 0, y: 0 });
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['stroll', 'peek'] as const)('follows the browser edge during %s without introducing a vertical stage', async (kind) => {
    const { motion, moving } = create();
    const scene = motion.run(kind);
    frame(300);
    const x = motion.offset.x;
    motion.updateBase({ launcherLeft: 880, launcherTop: 562 },
      { left: 0, top: 0, width: 1000, height: 650 }, 96, 'right', { followGround: true });
    expect(motion.offset.x).toBeCloseTo(x);
    expect(motion.offset.y).toBeCloseTo(0);
    expect(moving.mock.calls.every(([phase]) => phase === kind)).toBe(true);
    frame(600);
    expect(Math.abs(motion.offset.x - x)).toBeCloseTo(52.8 * .3);
    expect(motion.offset.y).toBeCloseTo(0);
    motion.cancel(); await scene;
    expect(frames.size).toBe(0);
  });

  it('keeps a resting or quiet actor on the changing browser edge without a recovery loop', () => {
    const { motion, moving } = create();
    motion.place({ x: -200, y: 0 });
    motion.updateBase({ launcherLeft: 880, launcherTop: 712 },
      { left: 0, top: 0, width: 1000, height: 800 }, 96, 'right', { followGround: true });
    expect(motion.offset).toEqual({ x: -200, y: 0 });
    expect(motion.needsRecovery).toBe(false);
    expect(moving).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves an airborne drag and its drop instead of moving it with the browser edge', async () => {
    const { motion, moving } = create();
    motion.beginDrag(); motion.dragTo({ x: -200, y: -150 });
    motion.updateBase({ launcherLeft: 880, launcherTop: 662 },
      { left: 0, top: 0, width: 1000, height: 750 }, 96, 'right', { followGround: true });
    expect(662 + motion.offset.y).toBe(612 - 150);
    const dropping = motion.release(); frame(100);
    const drawn = 662 + motion.offset.y;
    motion.updateBase({ launcherLeft: 880, launcherTop: 712 },
      { left: 0, top: 0, width: 1000, height: 800 }, 96, 'right', { followGround: true });
    expect(712 + motion.offset.y).toBeCloseTo(drawn);
    expect(moving.mock.lastCall?.[0]).toBe('fall');
    motion.cancel(); await dropping;
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('compensates a changed base in the same paint while a climbing frame is paused', async () => {
    const { motion, button } = create();
    const climbing = motion.run('climb'); frame(600);
    motion.cancel(); await climbing;
    const drawn = motion.offset;
    motion.updateBase({ launcherLeft: 780, launcherTop: 528 }, { left: 0, top: 0, width: 1000, height: 616 }, 96, 'right');
    const match = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(button.style.transform)!;
    expect(780 + Number(match[1])).toBeCloseTo(880 + drawn.x);
    expect(528 + Number(match[2])).toBeCloseTo(612 + drawn.y);
    expect(frames.size).toBe(0);
    expect(motion.needsRecovery).toBe(true);
  });

  it.each(['left', 'right'] as const)('recovers a cancelled offscreen %s arrival without snapping or restarting its entrance', async (arrival) => {
    const { motion, moving } = create();
    const entering = motion.enter(arrival);
    const absolute = { x: 880 + motion.offset.x, y: 612 + motion.offset.y };
    motion.cancel(); await entering;
    moving.mockClear();
    motion.updateBase({ launcherLeft: 780, launcherTop: 580 }, { left: 0, top: 0, width: 1000, height: 700 }, 96, 'right');
    frame(0);
    expect(780 + motion.offset.x).toBe(absolute.x);
    expect(580 + motion.offset.y).toBe(absolute.y);
    expect(motion.needsRecovery).toBe(true);
    const frozen = motion.offset;
    const recovering = motion.recover();
    expect(motion.offset).toEqual(frozen);
    expect(motion.recover()).toBe(recovering);
    frame(90);
    expect(Math.abs(motion.offset.x - frozen.x)).toBeGreaterThan(0);
    expect(Math.abs(motion.offset.x - frozen.x)).toBeLessThan(104);
    expect(motion.offset.y).toBe(frozen.y);
    frame(600); await recovering;
    expect(780 + motion.offset.x).toBeGreaterThanOrEqual(4);
    expect(780 + motion.offset.x + 96).toBeLessThanOrEqual(996);
    expect(580 + motion.offset.y + 88).toBe(700);
    expect(moving.mock.calls.map(([phase]) => phase)).toEqual(['return', null]);
    expect(moving).toHaveBeenCalledWith('return', { facing: arrival === 'left' ? 1 : -1 });
    expect(motion.needsRecovery).toBe(false);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps a deliberately cancelled 48px peek at the same place instead of treating it as an offscreen arrival', async () => {
    const { motion, moving } = create();
    const peeking = motion.run('peek'); frame(4500);
    motion.cancel(); await peeking;
    const frozen = motion.offset;
    expect(1000 - (880 + frozen.x)).toBeGreaterThanOrEqual(48);
    expect(motion.needsRecovery).toBe(false);
    moving.mockClear();
    await motion.recover();
    expect(motion.offset).toEqual(frozen);
    expect(moving).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it('returns a cancelled entrance to view before a new scene within one promise', async () => {
    const { motion, moving } = create();
    const entering = motion.enter('right');
    motion.cancel(); await entering;
    moving.mockClear();
    const frozen = motion.offset;
    const scene = motion.run('wiggle');
    expect(motion.offset).toEqual(frozen);
    expect(motion.run('stroll')).toBe(scene);
    frame(600);
    expect(motion.offset).toEqual({ x: 20, y: 0 });
    frame(3800); await scene;
    expect(moving.mock.calls.map(([phase]) => phase)).toEqual(['return', 'wiggle', null]);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('restores an offscreen entrance immediately with reduced motion and signals completion', async () => {
    const { motion, moving } = create();
    const entering = motion.enter('left');
    motion.cancel(); await entering;
    moving.mockClear();
    await motion.recover({ reducedMotion: true });
    expect(880 + motion.offset.x).toBe(4);
    expect(motion.needsRecovery).toBe(false);
    expect(moving.mock.calls).toEqual([[null]]);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('can freeze a horizontal recovery and destroy it without another frame or entrance', async () => {
    const { motion } = create();
    const entering = motion.enter('left');
    motion.cancel(); await entering;
    const recovering = motion.recover(); frame(90);
    const frozen = motion.offset;
    motion.cancel(); await recovering;
    frame(2000);
    expect(motion.offset).toEqual(frozen);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    const second = motion.recover();
    motion.destroy(); await second;
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('puts the drawn feet on the viewport bottom despite the store placement gap', () => {
    const { motion } = create();
    motion.updateBase({ launcherLeft: 880, launcherTop: 580 }, { left: 0, top: 0, width: 1000, height: 700 }, 96, 'right');
    frame(0);
    expect(motion.offset.y).toBe(32);
    expect(580 + motion.offset.y + 88).toBe(700);
    expect(580 + motion.offset.y + 96).toBeGreaterThan(700);
    expect(motion.needsRecovery).toBe(false);
    expect(motion.moving).toBe(false);
  });

  it('uses the offset visual viewport for a compact actor without reading document scroll', async () => {
    const { motion } = create(64);
    motion.updateBase({ launcherLeft: 240, launcherTop: 480 }, { left: 20, top: 60, width: 320, height: 568 }, 64, 'right');
    frame(0);
    await motion.recover({ reducedMotion: true });
    expect(480 + motion.offset.y + 64 * 11 / 12).toBeCloseTo(628);
    expect(motion.needsRecovery).toBe(false);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['stroll', 'wiggle', 'peek', 'flip'] as const)('lands before %s rather than moving diagonally or hovering', async (kind) => {
    const { motion, moving } = create();
    motion.place({ x: -200, y: -180 });
    const initial = motion.offset;
    const scene = motion.run(kind);
    expect(motion.offset).toEqual(initial);
    expect(motion.run('stroll')).toBe(scene);
    expect(moving.mock.calls.map(([phase]) => phase)).toEqual(['fall']);
    frame(400);
    expect(motion.offset).toEqual({ x: -200, y: 0 });
    expect(frames.size).toBe(0);
    expect(moving.mock.calls.map(([phase]) => phase)).toEqual(['fall', 'land']);
    frame(900);
    expect(moving.mock.calls.map(([phase]) => phase)).toEqual(['fall', 'land', kind]);
    const duration = { stroll: 2400, wiggle: 3200, peek: 15000, flip: 2500 }[kind];
    frame(900 + duration); await scene;
    expect(motion.offset.y).toBe(0);
    const phases = moving.mock.calls.map(([phase]) => phase);
    expect(phases.slice(0, 3)).toEqual(['fall', 'land', kind]);
    expect(phases.at(-1)).toBeNull();
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not snap on a taller viewport, then recovers once within 900ms', async () => {
    const { motion, moving } = create();
    motion.updateBase({ launcherLeft: 880, launcherTop: 612 }, { left: 0, top: 0, width: 1000, height: 900 }, 96, 'right');
    frame(0);
    expect(motion.offset.y).toBe(0);
    expect(motion.needsRecovery).toBe(true);
    expect(moving).not.toHaveBeenCalled();
    const recovering = motion.recover();
    expect(motion.recover()).toBe(recovering);
    frame(200);
    expect(motion.offset.y).toBeCloseTo(50);
    frame(400);
    expect(motion.offset.y).toBe(200);
    expect(frames.size).toBe(0);
    frame(900); await recovering;
    expect(612 + motion.offset.y + 88).toBe(900);
    expect(moving.mock.calls.map(([phase]) => phase)).toEqual(['fall', 'land', null]);
    expect(motion.needsRecovery).toBe(false);
    await motion.recover();
    expect(moving).toHaveBeenCalledTimes(3);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('climbs smoothly from below a shorter viewport and stops within 700ms', async () => {
    const { motion, moving } = create();
    motion.updateBase({ launcherLeft: 880, launcherTop: 612 }, { left: 0, top: 0, width: 1000, height: 400 }, 96, 'right');
    frame(0);
    expect(motion.offset.y).toBe(0);
    const recovering = motion.recover();
    frame(300);
    expect(motion.offset.y).toBeCloseTo(-150);
    expect(612 + motion.offset.y).toBeGreaterThan(400);
    frame(700); await recovering;
    expect(motion.offset.y).toBe(-300);
    expect(612 + motion.offset.y + 88).toBe(400);
    expect(moving.mock.calls.map(([phase]) => phase)).toEqual(['climb', null]);
    expect(motion.needsRecovery).toBe(false);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('inserts a climb before a requested ground scene after the floor rises', async () => {
    const { motion, moving } = create();
    motion.updateBase({ launcherLeft: 880, launcherTop: 612 }, { left: 0, top: 0, width: 1000, height: 600 }, 96, 'right');
    frame(0);
    const scene = motion.run('wiggle');
    frame(100);
    expect(motion.offset.y).toBeCloseTo(-50);
    frame(200);
    expect(motion.offset.y).toBe(-100);
    expect(frames.size).toBe(0);
    frame(3400); await scene;
    expect(moving.mock.calls.map(([phase]) => phase)).toEqual(['climb', 'wiggle', null]);
  });

  it('uses an actual reserved bottom panel as support and falls when that support disappears', async () => {
    const { motion, moving } = create();
    // Runtime removes the 100px sticky panel from the usable viewport, without an artificial gap.
    motion.updateBase({ launcherLeft: 880, launcherTop: 612 }, { left: 0, top: 0, width: 1000, height: 600 }, 96, 'right');
    frame(0);
    expect(motion.offset.y).toBe(0);
    const climbing = motion.recover(); frame(200); await climbing;
    expect(612 + motion.offset.y + 88).toBe(600);
    expect(motion.offset.x).toBe(0);
    motion.updateBase({ launcherLeft: 880, launcherTop: 612 }, { left: 0, top: 0, width: 1000, height: 700 }, 96, 'right');
    frame(200);
    expect(612 + motion.offset.y + 88).toBe(600);
    const falling = motion.recover(); frame(600);
    expect(612 + motion.offset.y + 88).toBe(700);
    frame(1100); await falling;
    expect(motion.offset.x).toBe(0);
    expect(moving.mock.calls.map(([phase]) => phase)).toEqual(['climb', null, 'fall', 'land', null]);
    expect(motion.needsRecovery).toBe(false);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('recovers after a cancelled jump and preserves cancellation without a background fall loop', async () => {
    const { motion } = create();
    const flip = motion.run('flip'); frame(1250);
    motion.cancel(); await flip;
    expect(motion.offset.y).toBe(-90);
    expect(motion.needsRecovery).toBe(true);
    frame(5000);
    expect(motion.offset.y).toBe(-90);
    expect(frames.size).toBe(0);
    const recovering = motion.recover();
    frame(5100);
    const frozen = motion.offset;
    motion.cancel(); await recovering;
    frame(10000);
    expect(motion.offset).toEqual(frozen);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('completes reduced recovery without sprites, frames or timers and signals physical completion', async () => {
    const { motion, moving } = create();
    motion.place({ x: -200, y: -180 });
    expect(motion.needsRecovery).toBe(true);
    await motion.recover({ reducedMotion: true });
    expect(motion.offset).toEqual({ x: -200, y: 0 });
    expect(moving.mock.calls).toEqual([[null]]);
    expect(motion.needsRecovery).toBe(false);
    await motion.recover({ reducedMotion: true });
    expect(moving).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores a large document scroll burst and schedules no repeated physics for unchanged viewport geometry', () => {
    const { motion, moving } = create();
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    for (let index = 0; index < 100; index++) {
      vi.stubGlobal('scrollY', index % 2 ? 100000 : 0);
      window.dispatchEvent(new Event('scroll'));
      motion.updateBase({ launcherLeft: 880, launcherTop: 612 }, { left: 0, top: 0, width: 1000, height: 700 }, 96, 'right');
    }
    expect(frames.size).toBe(1);
    frame(10000);
    expect(motion.offset).toEqual({ x: 0, y: 0 });
    expect(motion.needsRecovery).toBe(false);
    expect(moving).not.toHaveBeenCalled();
    expect(scroll).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('recovers a running scene when the physical floor changes, then continues along a horizontal floor', async () => {
    const { motion, moving } = create();
    const walking = motion.run('stroll'); frame(600);
    const frozen = motion.offset;
    motion.updateBase({ launcherLeft: 880, launcherTop: 612 }, { left: 0, top: 0, width: 1000, height: 800 }, 96, 'right');
    expect(motion.offset).toEqual(frozen);
    expect(motion.run('peek')).toBe(walking);
    frame(1000);
    expect(motion.offset.x).toBe(frozen.x);
    expect(motion.offset.y).toBe(100);
    frame(1500);
    const landedX = motion.offset.x;
    frame(1800);
    expect(motion.offset.x).toBeLessThan(landedX);
    expect(motion.offset.y).toBe(100);
    frame(3500); await walking;
    expect(moving.mock.calls.map(([phase]) => phase)).toEqual(['stroll', 'fall', 'land', 'stroll', null]);
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
