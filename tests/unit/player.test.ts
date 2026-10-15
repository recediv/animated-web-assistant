import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpritePlayer } from '../../src/animation/player';
import atlasManifest from './fixtures/atlas-legacy.json';
import type { AtlasManifest, MotionClipName } from '../../src/animation/manifest';
import type { PreparedGraphics } from '../../src/animation/preflight';

const assets = { poster: '/assistant/poster.webp', atlas: '/assistant/atlas.webp', manifest: '/assistant/atlas.json', cssUrl: '/assistant/assistant.css' };
let automaticImageLoad = true;
let imageWidth = atlasManifest.atlas.width;
let imageHeight = atlasManifest.atlas.height;
let decodeFailure = false;
let servedManifest: AtlasManifest;
let now = 0;
let nextFrame = 0;
const frameCallbacks = new Map<number, FrameRequestCallback>();
const players: SpritePlayer[] = [];

class FakeImage {
  static created: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = imageWidth;
  naturalHeight = imageHeight;
  complete = false;
  fetchPriority = 'auto';
  requested: string[] = [];
  private currentSource = '';
  decode = vi.fn(async () => { if (decodeFailure) throw new Error('Decode failed'); });
  constructor() { FakeImage.created.push(this); }
  get src() { return this.currentSource; }
  set src(value: string) {
    this.currentSource = value;
    this.requested.push(value);
    const sheet = Object.values(servedManifest.atlases ?? {}).find((geometry) => value.endsWith('/' + geometry.file));
    if (sheet) {
      this.naturalWidth = sheet.width;
      this.naturalHeight = sheet.height;
    }
    if (value && automaticImageLoad) queueMicrotask(() => { this.complete = true; this.onload?.(); });
  }
  succeed() { this.complete = true; this.onload?.(); }
  fail() { this.complete = true; this.onerror?.(); }
}

const fetchManifest = vi.fn();

function setup(withContext = true, graphics?: Omit<PreparedGraphics, 'poster'>, onDraw?: () => void) {
  const canvas = document.createElement('canvas');
  const poster = document.createElement('img');
  Object.defineProperties(poster, { complete: { value: true, configurable: true }, naturalWidth: { value: 192, configurable: true } });
  const context = { globalCompositeOperation: 'source-over', clearRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn() };
  vi.spyOn(canvas, 'getContext').mockReturnValue(withContext ? context as unknown as CanvasRenderingContext2D : null);
  const onEnd = vi.fn();
  const player = new SpritePlayer(canvas, poster, assets, onEnd, graphics ? { ...graphics, poster } : undefined, onDraw);
  players.push(player);
  return { canvas, poster, context, onEnd, player };
}

async function ready() {
  // Flush browser load/JSON/decode promise continuations without advancing clip time.
  for (let step = 0; step < 24; step += 1) await Promise.resolve();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => { resolve = settle; });
  return { promise, resolve };
}

function stallMainLoad(stage: 'fetch' | 'json' | 'decode') {
  const pending = deferred<unknown>();
  if (stage === 'fetch') fetchManifest.mockReturnValue(pending.promise);
  if (stage === 'json') fetchManifest.mockResolvedValue({ ok: true, json: () => pending.promise });
  return {
    attachDecode() {
      if (stage === 'decode') FakeImage.created[0]!.decode.mockImplementation(async () => { await pending.promise; });
    },
    settle() {
      pending.resolve(stage === 'fetch' ? { ok: true, json: async () => structuredClone(servedManifest) }
        : stage === 'json' ? structuredClone(servedManifest) : undefined);
    },
  };
}

function renderAt(timestamp: number) {
  now = timestamp;
  const callbacks = [...frameCallbacks.values()];
  frameCallbacks.clear();
  for (const callback of callbacks) callback(timestamp);
}

function useSplitSheets() {
  servedManifest.atlases = {
    ...servedManifest.atlases,
    reactions: { file: 'reactions.webp', width: 1152, height: 1536, columns: 6, rows: 8 },
    leisure: { file: 'leisure.webp', width: 1152, height: 1728, columns: 6, rows: 9 },
  };
  for (const [name, first, count] of [['happy', 0, 24], ['sleep', 24, 12], ['wake', 36, 12]] as const) {
    servedManifest.clips[name] = { ...servedManifest.clips[name], sheet: 'reactions', frames: Array.from({ length: count }, (_, index) => first + index) };
  }
  for (const [index, name] of ['sit', 'scratch', 'ears'].entries()) {
    servedManifest.clips[name as MotionClipName] = { sheet: 'leisure', frames: Array.from({ length: 12 }, (_, frame) => index * 12 + frame), fps: 8, end: 'neutral' };
  }
  servedManifest.clips.sit = { sheet: 'leisure', frames: [0, 1, 2, 3, ...Array.from({ length: 5 }, () => [4, 5, 6, 7, 8]).flat(), 9, 10, 11], fps: 8, end: 'neutral' };
  servedManifest.clips.stretch = { sheet: 'leisure', frames: Array.from({ length: 16 }, (_, index) => 36 + index), fps: 8, end: 'neutral' };
}

it('continues drawing and completes the clip when an input-geometry callback throws', async () => {
  const onDraw = vi.fn(() => { throw new DOMException('Pixels unreadable', 'SecurityError'); });
  const { player, canvas, onEnd } = setup(true, undefined, onDraw);
  expect(player.play('wave')).toBe(true); await ready();
  expect(canvas.hidden).toBe(false);
  renderAt(250);
  expect(onDraw.mock.calls.length).toBeGreaterThan(1);
  renderAt(atlasManifest.clips.wave.frames.length * 1000 / atlasManifest.clips.wave.fps);
  expect(onEnd).toHaveBeenCalledExactlyOnceWith('completed');
  expect(canvas.dataset.frame).toBe(String(atlasManifest.neutralFrame));
  expect(frameCallbacks.size).toBe(0);
});

beforeEach(() => {
  vi.useFakeTimers();
  servedManifest = structuredClone(atlasManifest) as AtlasManifest;
  automaticImageLoad = true; imageWidth = atlasManifest.atlas.width; imageHeight = atlasManifest.atlas.height; decodeFailure = false;
  now = 0; nextFrame = 0; frameCallbacks.clear(); FakeImage.created = [];
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { const id = ++nextFrame; frameCallbacks.set(id, callback); return id; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => frameCallbacks.delete(id)));
  fetchManifest.mockReset();
  fetchManifest.mockResolvedValue({ ok: true, json: async () => structuredClone(servedManifest) });
  vi.stubGlobal('fetch', fetchManifest);
});

afterEach(() => {
  for (const player of players.splice(0)) player.destroy();
  frameCallbacks.clear();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('finite canvas sprite playback', () => {
  it.each(['wave', 'walk', 'wiggle'] as const)('keeps the first %s frame when the shared rAF timestamp precedes playback start', async (clipName) => {
    const { player, canvas, context, onEnd } = setup();
    now = 100.5;
    player.play(clipName, 2);
    await ready();
    const clip = servedManifest.clips[clipName]!;
    const first = String(clip.frames[0]);
    expect(canvas.dataset.frame).toBe(first);
    const initialDraws = context.drawImage.mock.calls.length;
    const callbacks = [...frameCallbacks.values()];
    frameCallbacks.clear();
    // A browser frame timestamp is shared by callbacks; performance.now()
    // already includes work done before this clip started during that frame.
    for (const callback of callbacks) callback(100);
    expect(canvas.dataset.frame).toBe(first);
    expect(context.drawImage).toHaveBeenCalledTimes(initialDraws);
    renderAt(101);
    expect(canvas.dataset.frame).toBe(first);
    expect(context.drawImage).toHaveBeenCalledTimes(initialDraws);
    renderAt(100.5 + 1000 / clip.fps + 1);
    expect(canvas.dataset.frame).toBe(String(clip.frames[1]));
    const cycle = clip.frames.length * 1000 / clip.fps;
    renderAt(100.5 + cycle + 1);
    expect(canvas.dataset.frame).toBe(first);
    expect(onEnd).not.toHaveBeenCalled();
    expect(context.drawImage.mock.calls.every((call) => call.slice(1).every(Number.isFinite))).toBe(true);
    renderAt(100.5 + cycle * 2);
    expect(canvas.dataset.frame).toBe(String(servedManifest.neutralFrame));
    expect(canvas.dataset.sheet).toBe('main');
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(frameCallbacks.size).toBe(0);
  });

  it('reuses preflight graphics for playback, poses and resizing without fetching or decoding again', async () => {
    const image = new FakeImage();
    image.src = assets.atlas;
    await ready();
    await image.decode();
    const { player, canvas, poster, context, onEnd } = setup(true, {
      manifest: servedManifest,
      image: image as unknown as HTMLImageElement,
    });
    expect(player.play('idle')).toBe(true);
    await ready();
    expect(context.drawImage).toHaveBeenCalled();
    expect(context.drawImage.mock.calls.every((call) => call[0] === image)).toBe(true);
    expect(canvas.hidden).toBe(false);
    expect(poster.hidden).toBe(true);
    renderAt(1000);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(frameCallbacks.size).toBe(0);
    await expect(player.look('up')).resolves.toBe(true);
    player.resize(64);
    player.stop();
    expect(context.drawImage.mock.calls.every((call) => call[0] === image)).toBe(true);
    expect(fetchManifest).not.toHaveBeenCalled();
    expect(FakeImage.created).toEqual([image]);
    expect(image.requested).toEqual([assets.atlas]);
    expect(image.decode).toHaveBeenCalledTimes(1);
    expect(frameCallbacks.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('replaces complete cells without clearing the displayed model between frames or sheets', async () => {
    const { player, canvas, poster, context } = setup();
    let painted = false;
    const previousPixels: boolean[] = [];
    const compositions: string[] = [];
    context.clearRect.mockImplementation(() => { painted = false; });
    context.drawImage.mockImplementation(() => {
      previousPixels.push(painted);
      compositions.push(context.globalCompositeOperation);
      painted = true;
    });
    player.play('idle'); await ready();
    renderAt(84);
    player.setFacing(-1);
    automaticImageLoad = false;
    player.play('walk'); await ready();
    expect(canvas.hidden).toBe(false);
    expect(poster.hidden).toBe(true);
    expect(painted).toBe(true);
    FakeImage.created[1]!.succeed(); await ready();
    expect(canvas.dataset.sheet).toBe('personality');
    player.stop();
    expect(canvas.dataset.sheet).toBe('main');
    expect(previousPixels[0]).toBe(false);
    expect(previousPixels.slice(1).every(Boolean)).toBe(true);
    expect(compositions.every((composition) => composition === 'copy')).toBe(true);
    expect(context.clearRect).not.toHaveBeenCalled();
    expect(context.globalCompositeOperation).toBe('source-over');
  });

  it('keeps the last visible frame and retries after a failed canvas draw', async () => {
    const { player, canvas, poster, context, onEnd } = setup();
    player.play('idle'); await ready();
    player.setFacing(-1);
    const previous = canvas.dataset.frame;
    const saves = context.save.mock.calls.length;
    context.drawImage.mockImplementationOnce(() => { throw new Error('Image temporarily unavailable'); });
    expect(() => renderAt(84)).not.toThrow();
    expect(canvas.dataset.frame).toBe(previous);
    expect(canvas.hidden).toBe(false);
    expect(poster.hidden).toBe(true);
    expect(context.clearRect).not.toHaveBeenCalled();
    expect(context.save).toHaveBeenCalledTimes(saves + 1);
    expect(context.restore).toHaveBeenCalledTimes(saves + 1);
    expect(context.globalCompositeOperation).toBe('source-over');
    expect(frameCallbacks.size).toBe(1);
    renderAt(100);
    expect(canvas.dataset.frame).toBe('1');
    renderAt(1000);
    expect(canvas.dataset.frame).toBe('0');
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(frameCallbacks.size).toBe(0);
  });

  it('keeps the poster while loading and loads/decode the atlas only once for multiple clips', async () => {
    automaticImageLoad = false;
    const { player, canvas, poster, context } = setup();
    player.play('wave');
    expect(canvas.hidden).toBe(true);
    expect(poster.hidden).toBe(false);
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(fetchManifest).toHaveBeenCalledTimes(1);
    expect(FakeImage.created).toHaveLength(1);
    FakeImage.created[0]!.succeed();
    await ready();
    expect(canvas.hidden).toBe(false);
    expect(poster.hidden).toBe(true);
    expect(canvas.dataset.frame).toBe('12');
    renderAt(1500);
    player.play('happy');
    await ready();
    expect(fetchManifest).toHaveBeenCalledTimes(1);
    expect(FakeImage.created).toHaveLength(1);
    expect(FakeImage.created[0]!.decode).toHaveBeenCalledTimes(1);
    expect(canvas.dataset.frame).toBe('36');
  });

  it('advances using elapsed time, skips unchanged frames, ends on neutral and stops requesting frames', async () => {
    const { player, canvas, context, onEnd } = setup();
    player.play('idle'); await ready();
    expect(context.drawImage).toHaveBeenCalledTimes(1);
    expect(frameCallbacks.size).toBe(1);
    renderAt(10);
    renderAt(40);
    expect(context.drawImage).toHaveBeenCalledTimes(1);
    renderAt(84);
    expect(canvas.dataset.frame).toBe('1');
    expect(context.drawImage.mock.lastCall?.slice(1, 5)).toEqual([192, 0, 192, 192]);
    renderAt(950);
    expect(canvas.dataset.frame).toBe('11');
    expect(context.drawImage.mock.lastCall?.slice(1, 5)).toEqual([192, 192, 192, 192]);
    renderAt(1000);
    expect(canvas.dataset.frame).toBe('0');
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(frameCallbacks.size).toBe(0);
    const rendered = context.drawImage.mock.calls.length;
    renderAt(60_000);
    expect(context.drawImage).toHaveBeenCalledTimes(rendered);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('jumps to the correct current wave frame after a delayed callback rather than replaying missed frames', async () => {
    const { player, canvas, context } = setup();
    player.play('wave'); await ready();
    expect(canvas.dataset.frame).toBe('12');
    renderAt(550);
    expect(canvas.dataset.frame).toBe('20');
    expect(context.drawImage.mock.lastCall?.slice(1, 5)).toEqual([0, 384, 192, 192]);
    expect(context.drawImage).toHaveBeenCalledTimes(2);
  });

  it('holds the final sleep frame with no ongoing render loop', async () => {
    const { player, canvas, onEnd } = setup();
    player.play('sleep'); await ready();
    renderAt(1000);
    expect(canvas.dataset.frame).toBe('71');
    expect(frameCallbacks.size).toBe(0);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('cancels the previous clip when a higher-priority clip starts', async () => {
    const { player, canvas, onEnd } = setup();
    player.play('wave'); await ready();
    renderAt(300);
    player.play('happy'); await ready();
    expect(frameCallbacks.size).toBe(1);
    expect(canvas.dataset.frame).toBe('36');
    renderAt(800);
    expect(canvas.dataset.frame).toBe('44');
    expect(onEnd).not.toHaveBeenCalled();
    renderAt(1800);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(frameCallbacks.size).toBe(0);
  });

  it('sizes the drawing buffer for compact layout and caps devicePixelRatio at two', async () => {
    vi.stubGlobal('devicePixelRatio', 3);
    const { player, canvas, context } = setup();
    player.resize(64);
    expect(canvas.width).toBe(128);
    expect(canvas.height).toBe(128);
    player.play('idle'); await ready();
    expect(context.drawImage.mock.lastCall?.slice(5)).toEqual([0, 0, 128, 128]);
    const calls = context.drawImage.mock.calls.length;
    player.resize(96);
    expect(canvas.width).toBe(192);
    expect(context.drawImage).toHaveBeenCalledTimes(calls + 1);
    expect(canvas.dataset.frame).toBe('0');
  });
});

describe('motion setting, failures and cancellation', () => {
  it('does not make graphics requests when motion is disabled before first playback', async () => {
    const { player, canvas, poster, context } = setup();
    player.setEnabled(false);
    player.play('wave'); await ready();
    expect(fetchManifest).not.toHaveBeenCalled();
    expect(FakeImage.created).toHaveLength(0);
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(frameCallbacks.size).toBe(0);
    expect(canvas.hidden).toBe(true);
    expect(poster.hidden).toBe(false);
  });

  it('does not start a late clip after motion is disabled while graphics load', async () => {
    automaticImageLoad = false;
    const { player, canvas, poster, context, onEnd } = setup();
    player.play('wave');
    player.setEnabled(false);
    FakeImage.created[0]!.succeed(); await ready();
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(frameCallbacks.size).toBe(0);
    expect(canvas.hidden).toBe(true);
    expect(poster.hidden).toBe(false);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('stops an active clip immediately when motion is disabled and keeps a neutral frame', async () => {
    const { player, canvas, onEnd } = setup();
    player.play('happy'); await ready();
    renderAt(300);
    expect(canvas.dataset.frame).not.toBe('0');
    player.setEnabled(false);
    expect(canvas.dataset.frame).toBe('0');
    expect(frameCallbacks.size).toBe(0);
    renderAt(5000);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it.each(['manifest HTTP', 'manifest invalid', 'image dimensions', 'image decode', 'image error'] as const)('falls back to the poster after %s failure without retry loops', async (failure) => {
    if (failure === 'manifest HTTP') fetchManifest.mockResolvedValue({ ok: false, json: async () => atlasManifest });
    if (failure === 'manifest invalid') fetchManifest.mockResolvedValue({ ok: true, json: async () => ({ schemaVersion: 99 }) });
    if (failure === 'image dimensions') imageWidth = 100;
    if (failure === 'image decode') decodeFailure = true;
    if (failure === 'image error') automaticImageLoad = false;
    const { player, canvas, poster, onEnd } = setup();
    expect(player.play('wave')).toBe(true);
    if (failure === 'image error') FakeImage.created[0]!.fail();
    await ready();
    expect(canvas.hidden).toBe(true);
    expect(poster.hidden).toBe(false);
    expect(frameCallbacks.size).toBe(0);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenLastCalledWith('unavailable');
    expect(player.play('idle')).toBe(false); await ready();
    expect(fetchManifest).toHaveBeenCalledTimes(1);
    expect(FakeImage.created).toHaveLength(1);
  });

  it('hides a failed poster so the enclosing text launcher remains available', async () => {
    fetchManifest.mockRejectedValue(new Error('Offline'));
    const { player, canvas, poster } = setup();
    Object.defineProperty(poster, 'naturalWidth', { value: 0 });
    player.play('wave'); await ready();
    expect(canvas.hidden).toBe(true);
    expect(poster.hidden).toBe(true);
    expect(frameCallbacks.size).toBe(0);
  });

  it('uses an image load timeout instead of holding pending playback forever', async () => {
    automaticImageLoad = false;
    const { player, poster, canvas, onEnd } = setup();
    player.play('wave');
    vi.advanceTimersByTime(10_000); await ready();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(canvas.hidden).toBe(true);
    expect(poster.hidden).toBe(false);
    expect(frameCallbacks.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('destroys active playback without a late completion callback', async () => {
    const { player, context, onEnd } = setup();
    player.play('happy'); await ready();
    player.destroy();
    const rendered = context.drawImage.mock.calls.length;
    expect(frameCallbacks.size).toBe(0);
    renderAt(5000);
    player.play('wave'); await ready();
    expect(context.drawImage).toHaveBeenCalledTimes(rendered);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('releases the graphics timeout when destroyed during loading', async () => {
    automaticImageLoad = false;
    const { player, context, onEnd } = setup();
    player.play('wave');
    expect(vi.getTimerCount()).toBe(1);
    player.destroy(); await ready();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000); await ready();
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });
});

describe('accepted playback completion contract', () => {
  it.each(['disabled', 'destroyed', 'no context'] as const)('declines %s playback synchronously without loading or reporting completion', async (reason) => {
    const { player, onEnd } = setup(reason !== 'no context');
    if (reason === 'disabled') player.setEnabled(false);
    if (reason === 'destroyed') player.destroy();
    expect(player.play('idle')).toBe(false);
    await ready();
    expect(fetchManifest).not.toHaveBeenCalled();
    expect(FakeImage.created).toHaveLength(0);
    expect(onEnd).not.toHaveBeenCalled();
    expect(frameCallbacks.size).toBe(0);
  });

  it('accepts both first and cached finite clips and completes each once', async () => {
    const { player, onEnd } = setup();
    expect(player.play('idle')).toBe(true); await ready();
    expect(onEnd).not.toHaveBeenCalled();
    renderAt(1000);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenLastCalledWith('completed');
    expect(player.play('wave')).toBe(true); await ready();
    renderAt(2500);
    expect(onEnd).toHaveBeenCalledTimes(2);
    expect(onEnd).toHaveBeenLastCalledWith('completed');
    expect(fetchManifest).toHaveBeenCalledTimes(1);
    expect(frameCallbacks.size).toBe(0);
  });

  it.each(['stop', 'pause', 'disable', 'destroy'] as const)('does not report a late main-image failure after %s cancels its request', async (cancel) => {
    automaticImageLoad = false;
    const { player, onEnd } = setup();
    expect(player.play('wave')).toBe(true);
    const image = FakeImage.created[0]!;
    if (cancel === 'stop') player.stop();
    if (cancel === 'pause') player.pause();
    if (cancel === 'disable') player.setEnabled(false);
    if (cancel === 'destroy') player.destroy();
    image.fail(); await ready();
    expect(onEnd).not.toHaveBeenCalled();
    expect(frameCallbacks.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('settles only the newest request when multiple clips share a failing main load', async () => {
    automaticImageLoad = false;
    const { player, onEnd } = setup();
    const stop = vi.spyOn(player, 'stop');
    expect(player.play('wave')).toBe(true);
    expect(player.play('happy')).toBe(true);
    expect(FakeImage.created).toHaveLength(1);
    FakeImage.created[0]!.fail(); await ready();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(player.play('idle')).toBe(false);
    expect(frameCallbacks.size).toBe(0);
  });

  it('does not report a failed pointer pose as a completed animation', async () => {
    automaticImageLoad = false;
    const { player, onEnd } = setup();
    player.look('left');
    FakeImage.created[0]!.fail(); await ready();
    expect(onEnd).not.toHaveBeenCalled();
    expect(player.play('idle')).toBe(false);
  });

  it.each(['sit', 'walk', 'guitar'] as const)('reports an absent optional %s clip as unavailable without disabling the cached core', async (clip) => {
    delete servedManifest.clips[clip];
    const { player, canvas, onEnd } = setup();
    expect(player.play(clip)).toBe(true); await ready();
    expect(canvas.dataset.frame).toBe('0');
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenLastCalledWith('unavailable');
    expect(frameCallbacks.size).toBe(0);
    expect(player.play('idle')).toBe(true); await ready();
    renderAt(1000);
    expect(onEnd).toHaveBeenCalledTimes(2);
    expect(onEnd).toHaveBeenLastCalledWith('completed');
  });

  it('settles an unexpected asynchronous loading exception exactly once', async () => {
    const { player, canvas, onEnd } = setup();
    player.play('idle'); await ready(); renderAt(1000);
    onEnd.mockClear();
    vi.stubGlobal('Image', class { constructor() { throw new Error('Image allocation failed'); } });
    expect(player.play('wink')).toBe(true); await ready();
    expect(canvas.dataset.sheet).toBe('main');
    expect(canvas.dataset.frame).toBe('0');
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(frameCallbacks.size).toBe(0);
    expect(player.play('idle')).toBe(false);
  });

  it('ignores a superseded asynchronous exception while the replacement keeps playing', async () => {
    const { player, canvas, onEnd } = setup();
    player.play('idle'); await ready(); renderAt(1000);
    onEnd.mockClear();
    vi.stubGlobal('Image', class { constructor() { throw new Error('Image allocation failed'); } });
    expect(player.play('wink')).toBe(true);
    await Promise.resolve();
    expect(player.play('idle')).toBe(true); await ready();
    expect(canvas.dataset.sheet).toBe('main');
    expect(onEnd).not.toHaveBeenCalled();
    expect(frameCallbacks.size).toBe(1);
    renderAt(2000);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(player.play('wave')).toBe(true);
  });
});

describe('bounded complete atlas loading', () => {
  it.each(['fetch', 'json', 'decode'] as const)('settles a stalled main %s after ten seconds, aborts resources, and rejects late cache writes', async (stage) => {
    const pending = stallMainLoad(stage);
    const { player, canvas, poster, context, onEnd } = setup();
    expect(player.play('sit')).toBe(true);
    pending.attachDecode(); await ready();
    const image = FakeImage.created[0]!;
    const signal = fetchManifest.mock.calls[0]![1].signal as AbortSignal;
    expect(image.complete).toBe(true);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(9999); await ready();
    expect(onEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); await ready();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(signal.aborted).toBe(true);
    expect(image.src).toBe('');
    expect(image.onload).toBeNull();
    expect(image.onerror).toBeNull();
    expect(canvas.hidden).toBe(true);
    expect(poster.hidden).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    pending.settle(); await ready();
    player.stop();
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(frameCallbacks.size).toBe(0);
    expect(player.play('idle')).toBe(false);
  });

  it('uses one deadline for image, response and decode instead of restarting it per stage', async () => {
    automaticImageLoad = false;
    const response = deferred<{ ok: boolean; json(): Promise<AtlasManifest> }>();
    const json = deferred<AtlasManifest>();
    const decoded = deferred<void>();
    fetchManifest.mockReturnValue(response.promise);
    const { player, onEnd } = setup();
    player.play('wave');
    const image = FakeImage.created[0]!;
    image.decode.mockReturnValue(decoded.promise);
    vi.advanceTimersByTime(4000);
    image.succeed(); response.resolve({ ok: true, json: () => json.promise }); await ready();
    vi.advanceTimersByTime(4000);
    json.resolve(structuredClone(servedManifest)); await ready();
    vi.advanceTimersByTime(1999); await ready();
    expect(onEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); await ready();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    decoded.resolve(); await ready();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(frameCallbacks.size).toBe(0);
  });

  it.each(['fetch', 'json', 'decode'] as const)('ends only the newest playback when a shared main %s hits its deadline', async (stage) => {
    const pending = stallMainLoad(stage);
    const { player, onEnd } = setup();
    expect(player.play('wave')).toBe(true);
    pending.attachDecode(); await ready();
    expect(player.play('happy')).toBe(true);
    vi.advanceTimersByTime(10_000); await ready();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(fetchManifest).toHaveBeenCalledTimes(1);
    expect(FakeImage.created).toHaveLength(1);
    pending.settle(); await ready();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(frameCallbacks.size).toBe(0);
  });

  it.each([
    ['fetch', 'stop'], ['json', 'stop'], ['decode', 'stop'],
    ['fetch', 'destroy'], ['json', 'destroy'], ['decode', 'destroy'],
  ] as const)('does not finish a cancelled %s load after %s or a late response', async (stage, cancel) => {
    const pending = stallMainLoad(stage);
    const { player, context, onEnd } = setup();
    player.play('wave'); pending.attachDecode(); await ready();
    const signal = fetchManifest.mock.calls[0]![1].signal as AbortSignal;
    if (cancel === 'destroy') {
      player.destroy(); await ready();
      expect(signal.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } else player.stop();
    vi.advanceTimersByTime(10_000); await ready();
    pending.settle(); await ready();
    player.stop();
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
    expect(frameCallbacks.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['walk', 'wink'] as const)('bounds optional %s decode and preserves its fallback or finite neutral completion', async (clip) => {
    const { player, canvas, onEnd, context } = setup();
    player.play('idle'); await ready(); renderAt(1000);
    onEnd.mockClear();
    automaticImageLoad = false;
    const decoded = deferred<void>();
    player.play(clip); await ready();
    const image = FakeImage.created[1]!;
    image.decode.mockReturnValue(decoded.promise);
    image.succeed(); await ready();
    vi.advanceTimersByTime(9999); await ready();
    expect(onEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); await ready();
    expect(image.src).toBe('');
    expect(image.onload).toBeNull();
    expect(image.onerror).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(canvas.dataset.sheet).toBe('main');
    if (clip === 'walk') {
      expect(canvas.dataset.frame).toBe('90');
      expect(onEnd).not.toHaveBeenCalled();
      renderAt(1600);
    }
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(canvas.dataset.frame).toBe('0');
    decoded.resolve(); await ready();
    const calls = context.drawImage.mock.calls.length;
    player.play('wink'); await ready();
    expect(canvas.dataset.sheet).toBe('main');
    expect(context.drawImage).toHaveBeenCalledTimes(calls);
    expect(onEnd).toHaveBeenCalledTimes(2);
    expect(FakeImage.created).toHaveLength(2);
    expect(frameCallbacks.size).toBe(0);
    player.play('idle'); await ready(); renderAt(2600);
    expect(onEnd).toHaveBeenCalledTimes(3);
  });

  it.each(['replace', 'destroy'] as const)('does not let stalled optional decode finish a %s request or populate its late cache', async (cancel) => {
    const { player, canvas, onEnd, context } = setup();
    player.play('idle'); await ready(); renderAt(1000);
    onEnd.mockClear();
    automaticImageLoad = false;
    const decoded = deferred<void>();
    player.play('wink'); await ready();
    const image = FakeImage.created[1]!;
    image.decode.mockReturnValue(decoded.promise);
    image.succeed(); await ready();
    if (cancel === 'destroy') player.destroy();
    else { player.play('idle'); await ready(); renderAt(2000); }
    const draws = context.drawImage.mock.calls.length;
    vi.advanceTimersByTime(10_000); await ready();
    decoded.resolve(); await ready();
    expect(context.drawImage).toHaveBeenCalledTimes(draws);
    expect(onEnd).toHaveBeenCalledTimes(cancel === 'replace' ? 1 : 0);
    expect(frameCallbacks.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(image.src).toBe('');
    if (cancel === 'replace') {
      player.play('wink'); await ready();
      expect(canvas.dataset.sheet).toBe('main');
      expect(onEnd).toHaveBeenCalledTimes(2);
      expect(FakeImage.created).toHaveLength(2);
    }
  });
});

describe('pointer look poses', () => {
  it.each([4, 8, 12])('warms a %i-frame push sheet without a frame loop, preserves the brace and then draws finite footsteps', async (count) => {
    servedManifest.poses = { ...servedManifest.poses!, 'push-right': 93 };
    servedManifest.atlases = { ...servedManifest.atlases, push: { width: 768, height: count * 96, columns: 4, rows: count / 2, file: 'push.webp' } };
    const frames = Array.from({ length: count }, (_, index) => count + index);
    servedManifest.clips['push-right'] = { frames, fps: 8, end: 'hold', sheet: 'push', fallbackFrames: frames.map(() => 93) };
    const { player, canvas, onEnd } = setup();
    expect(await player.look('push-right')).toBe(true);
    expect(await player.prepareClip('push-right')).toBe(true);
    expect(canvas.dataset.frame).toBe('93'); expect(frameCallbacks.size).toBe(0);
    expect(FakeImage.created).toHaveLength(2); expect(onEnd).not.toHaveBeenCalled();
    expect(player.play('push-right', 2)).toBe(true); await ready();
    expect(canvas.dataset.frame).toBe(String(count)); expect(canvas.dataset.sheet).toBe('push');
    renderAt(count * 125 + 125); expect(canvas.dataset.frame).toBe(String(count + 1));
    renderAt(count * 250); expect(canvas.dataset.frame).toBe(String(count * 2 - 1));
    expect(onEnd).toHaveBeenCalledTimes(1); expect(frameCallbacks.size).toBe(0);
    expect(FakeImage.created).toHaveLength(2);
  });
  it('keeps the legacy static brace when an optional push sheet fails and rejects a cancelled warm request', async () => {
    servedManifest.poses = { ...servedManifest.poses!, 'push-right': 93 };
    servedManifest.atlases = { ...servedManifest.atlases, push: { width: 768, height: 384, columns: 4, rows: 2, file: 'push.webp' } };
    servedManifest.clips['push-right'] = { frames: [4, 5, 6, 7], fps: 8, end: 'hold', sheet: 'push', fallbackFrames: [93, 93, 93, 93] };
    const { player, canvas, onEnd } = setup(); await player.look('push-right');
    automaticImageLoad = false;
    const warming = player.prepareClip('push-right'); await ready(); FakeImage.created[1]!.fail();
    expect(await warming).toBe(true); expect(canvas.dataset.frame).toBe('93'); expect(frameCallbacks.size).toBe(0);
    expect(onEnd).not.toHaveBeenCalled();
    expect(await player.prepareClip('push-left')).toBe(false);
    automaticImageLoad = true;
    const next = setup(); await next.player.look('push-right'); automaticImageLoad = false;
    const cancelled = next.player.prepareClip('push-right'); await ready();
    next.player.stop(); FakeImage.created.at(-1)!.succeed();
    expect(await cancelled).toBe(false); expect(frameCallbacks.size).toBe(0); expect(next.onEnd).not.toHaveBeenCalled();
  });
  it('waits for an actual braced pose draw and keeps legacy page-push looks on the matching side', async () => {
    automaticImageLoad = false;
    servedManifest.poses = { ...servedManifest.poses!, 'push-left': 92, 'push-right': 93 };
    const { player, canvas } = setup();
    let settled = false; const pending = player.look('push-left').then((result) => { settled = true; return result; });
    await ready(); expect(settled).toBe(false);
    FakeImage.created[0]!.succeed(); expect(await pending).toBe(true); expect(canvas.dataset.frame).toBe('92');
    expect(await player.look('push-right')).toBe(true); expect(canvas.dataset.frame).toBe('93');
    automaticImageLoad = true;
    const legacy = structuredClone(atlasManifest); fetchManifest.mockResolvedValue({ ok: true, json: async () => legacy });
    const fallback = setup(); expect(await fallback.player.look('push-left')).toBe(true);
    expect(fallback.canvas.dataset.frame).toBe(String(legacy.poses.left));
    expect(await fallback.player.look('push-right')).toBe(true); expect(fallback.canvas.dataset.frame).toBe(String(legacy.poses.right));
    expect(frameCallbacks.size).toBe(0); expect(fallback.onEnd).not.toHaveBeenCalled();
  });
  it('resolves an unavailable or superseded pose as false without reviving a cancelled scene', async () => {
    automaticImageLoad = false;
    const { player, context } = setup(); const cancelled = player.look('push-left'); player.stop();
    FakeImage.created[0]!.succeed(); expect(await cancelled).toBe(false);
    expect(context.drawImage).not.toHaveBeenCalled();
    player.setEnabled(false); expect(await player.look('push-left')).toBe(false);
    expect(frameCallbacks.size).toBe(0);
  });
  it('does not claim a brace is ready when its actual canvas draw fails', async () => {
    const { player, context, canvas } = setup();
    expect(await player.look('left')).toBe(true);
    context.drawImage.mockImplementationOnce(() => { throw new Error('Canvas temporarily unavailable'); });
    expect(await player.look('push-right')).toBe(false);
    expect(canvas.dataset.frame).toBe(String(atlasManifest.poses.left));
    expect(await player.look('push-right')).toBe(true);
    expect(frameCallbacks.size).toBe(0);
  });
  it('draws optional upward diagonals once and falls back to up for legacy six-pose atlases', async () => {
    servedManifest.poses = { ...servedManifest.poses!, 'up-left': 90, 'up-right': 91 };
    const { player, canvas } = setup();
    player.look('up-left'); await ready(); expect(canvas.dataset.frame).toBe('90');
    player.look('up-right'); await ready(); expect(canvas.dataset.frame).toBe('91');
    expect(frameCallbacks.size).toBe(0);
    const legacy = structuredClone(atlasManifest);
    fetchManifest.mockResolvedValue({ ok: true, json: async () => legacy });
    const fallback = setup(); fallback.player.look('up-left'); await ready();
    expect(fallback.canvas.dataset.frame).toBe(String(legacy.poses.up));
    fallback.player.look('up-right'); await ready();
    expect(fallback.canvas.dataset.frame).toBe(String(legacy.poses.up));
    expect(frameCallbacks.size).toBe(0); expect(fallback.onEnd).not.toHaveBeenCalled();
  });
  it('draws a requested pose once without starting rAF and shares the existing atlas cache', async () => {
    const { player, canvas, context } = setup();
    player.look('left'); await ready();
    expect(canvas.dataset.frame).toBe('84');
    expect(frameCallbacks.size).toBe(0);
    expect(context.drawImage).toHaveBeenCalledTimes(1);
    player.look('left'); await ready();
    expect(context.drawImage).toHaveBeenCalledTimes(1);
    player.look('right'); await ready();
    expect(canvas.dataset.frame).toBe('85');
    expect(context.drawImage).toHaveBeenCalledTimes(2);
    expect(frameCallbacks.size).toBe(0);
    expect(fetchManifest).toHaveBeenCalledTimes(1);
    expect(FakeImage.created[0]!.decode).toHaveBeenCalledTimes(1);
  });

  it('coalesces pointer changes received during loading to the latest pose', async () => {
    automaticImageLoad = false;
    const { player, canvas, context } = setup();
    player.look('left');
    player.look('up');
    player.look('right');
    FakeImage.created[0]!.succeed(); await ready();
    expect(canvas.dataset.frame).toBe('85');
    expect(context.drawImage).toHaveBeenCalledTimes(1);
    expect(frameCallbacks.size).toBe(0);
  });

  it('does not interrupt an active clip for a pointer pose', async () => {
    const { player, canvas } = setup();
    player.play('wave'); await ready();
    player.look('right'); await ready();
    expect(canvas.dataset.frame).toBe('12');
    expect(frameCallbacks.size).toBe(1);
    renderAt(1000);
    expect(canvas.dataset.frame).toBe('28');
    renderAt(1500);
    expect(canvas.dataset.frame).toBe('0');
    expect(frameCallbacks.size).toBe(0);
  });

  it('gives a newer animation priority over a pose pending image loading', async () => {
    automaticImageLoad = false;
    const { player, canvas } = setup();
    player.look('left');
    player.play('happy');
    FakeImage.created[0]!.succeed(); await ready();
    expect(canvas.dataset.frame).toBe('36');
    expect(frameCallbacks.size).toBe(1);
  });

  it('keeps legacy manifests without poses usable for normal animations', async () => {
    const legacy = structuredClone(atlasManifest);
    Reflect.deleteProperty(legacy, 'poses');
    fetchManifest.mockResolvedValue({ ok: true, json: async () => legacy });
    const { player, canvas, poster, context } = setup();
    player.look('left'); await ready();
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(canvas.hidden).toBe(true);
    expect(poster.hidden).toBe(false);
    player.play('idle'); await ready();
    expect(canvas.dataset.frame).toBe('0');
    expect(fetchManifest).toHaveBeenCalledTimes(1);
  });

  it('does not load or draw pointer poses while motion is disabled', async () => {
    const { player, context } = setup();
    player.setEnabled(false);
    player.look('left'); await ready();
    expect(fetchManifest).not.toHaveBeenCalled();
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(frameCallbacks.size).toBe(0);
  });
});

describe('extra physical motion clips', () => {
  it.each([
    ['walk', 0, 100, 1, 600],
    ['wiggle', 6, 125, 7, 3000],
    ['climb', 34, 125, 35, 500],
    ['flip', 31, 500, 15, 2500],
    ['wink', 20, 250, 21, 1250],
    ['land', 31, 125, 32, 500],
  ] as const)('plays %s through its actual sprite cycle and stops on neutral', async (name, first, frameTime, second, duration) => {
    const { player, canvas, onEnd } = setup();
    player.play(name); await ready();
    expect(canvas.dataset.sheet).toBe('personality');
    expect(canvas.dataset.frame).toBe(String(first));
    renderAt(frameTime);
    expect(canvas.dataset.frame).toBe(String(second));
    renderAt(duration);
    expect(canvas.dataset.frame).toBe('0');
    expect(canvas.dataset.sheet).toBe('main');
    expect(frameCallbacks.size).toBe(0);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('supports explicit finite repetitions for walking, with one completion callback', async () => {
    const { player, canvas, onEnd } = setup();
    player.play('walk', 2); await ready();
    renderAt(650);
    expect(canvas.dataset.frame).toBe('0');
    expect(canvas.dataset.sheet).toBe('personality');
    expect(onEnd).not.toHaveBeenCalled();
    renderAt(1200);
    expect(canvas.dataset.frame).toBe('0');
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(frameCallbacks.size).toBe(0);
  });

  it('loads the optional sheet lazily once and keeps the rendered neutral visible while loading', async () => {
    const { player, canvas, context } = setup();
    player.play('idle'); await ready(); renderAt(1000);
    expect(FakeImage.created).toHaveLength(1);
    automaticImageLoad = false;
    player.play('walk'); await ready();
    expect(FakeImage.created).toHaveLength(2);
    expect(FakeImage.created[1]!.src).toBe(new URL('/assistant/personality.webp', document.baseURI).href);
    expect(canvas.hidden).toBe(false);
    expect(canvas.dataset.sheet).toBe('main');
    const calls = context.drawImage.mock.calls.length;
    player.look('right'); await ready();
    expect(context.drawImage).toHaveBeenCalledTimes(calls);
    FakeImage.created[1]!.succeed(); await ready();
    expect(canvas.dataset.sheet).toBe('personality');
    renderAt(1600);
    player.play('climb'); await ready();
    expect(FakeImage.created).toHaveLength(2);
    expect(fetchManifest).toHaveBeenCalledTimes(1);
    expect(FakeImage.created[1]!.decode).toHaveBeenCalledTimes(1);
  });

  it.each(['held', 'fall', 'parachute'] as const)('keeps the last %s pose after 500ms with no ongoing rAF until release', async (name) => {
    const { player, canvas, context, onEnd } = setup();
    player.play(name); await ready(); renderAt(500);
    expect(canvas.dataset.sheet).toBe('personality');
    expect(canvas.dataset.frame).toBe(String(atlasManifest.clips[name].frames.at(-1)));
    expect(frameCallbacks.size).toBe(0);
    const calls = context.drawImage.mock.calls.length;
    renderAt(60_000);
    expect(context.drawImage).toHaveBeenCalledTimes(calls);
    expect(onEnd).toHaveBeenCalledTimes(1);
    player.play('land'); await ready();
    expect(canvas.dataset.frame).toBe('31');
    renderAt(60_500);
    expect(canvas.dataset.sheet).toBe('main');
  });

  it('keeps a six-cycle walk moving for the full 3.6s and clamps invalid/excessive repetitions finitely', async () => {
    const { player, canvas, onEnd } = setup();
    player.play('walk', 6); await ready(); renderAt(3500);
    expect(canvas.dataset.sheet).toBe('personality');
    expect(onEnd).not.toHaveBeenCalled();
    renderAt(3600);
    expect(onEnd).toHaveBeenCalledTimes(1);
    player.play('walk', 99); await ready(); renderAt(8399);
    expect(onEnd).toHaveBeenCalledTimes(1);
    renderAt(8400);
    expect(onEnd).toHaveBeenCalledTimes(2);
    player.play('walk', NaN); await ready(); renderAt(9000);
    expect(onEnd).toHaveBeenCalledTimes(3);
    expect(frameCallbacks.size).toBe(0);
  });

  it('mirrors the actual canvas joints only when direction changes and redraws the current sheet after resize', async () => {
    const { player, canvas, poster, context } = setup();
    player.setFacing(-1);
    expect(poster.style.transform).toBe('scaleX(-1)');
    player.play('walk'); await ready();
    expect(context.translate).toHaveBeenLastCalledWith(canvas.width, 0);
    expect(context.scale).toHaveBeenLastCalledWith(-1, 1);
    expect(context.save).toHaveBeenCalledTimes(context.restore.mock.calls.length);
    const calls = context.drawImage.mock.calls.length;
    player.setFacing(-1);
    expect(context.drawImage).toHaveBeenCalledTimes(calls);
    player.setFacing(1);
    expect(context.drawImage).toHaveBeenCalledTimes(calls + 1);
    expect(poster.style.transform).toBe('');
    player.resize(64);
    expect(canvas.dataset.sheet).toBe('personality');
    expect(context.drawImage.mock.lastCall?.[0]).toBe(FakeImage.created[1]);
  });

  it('uses legacy motion artwork when the optional atlas fails and retains the mandatory animation cache', async () => {
    const { player, canvas, onEnd } = setup();
    player.play('idle'); await ready(); renderAt(1000);
    automaticImageLoad = false;
    player.play('walk'); await ready(); FakeImage.created[1]!.fail(); await ready();
    expect(canvas.dataset.sheet).toBe('main');
    expect(canvas.dataset.frame).toBe('90');
    renderAt(1600);
    expect(onEnd).toHaveBeenCalledTimes(2);
    expect(onEnd).toHaveBeenLastCalledWith('completed');
    player.play('wink'); await ready();
    expect(onEnd).toHaveBeenCalledTimes(3);
    expect(onEnd).toHaveBeenLastCalledWith('unavailable');
    expect(frameCallbacks.size).toBe(0);
    player.play('happy'); await ready();
    expect(canvas.dataset.frame).toBe('36');
    expect(FakeImage.created).toHaveLength(2);
  });

  it('prevents a cancelled optional image load from resurrecting a clip after disable or destroy', async () => {
    const { player, canvas, onEnd } = setup();
    player.play('idle'); await ready(); renderAt(1000);
    automaticImageLoad = false;
    player.play('held'); await ready();
    player.setEnabled(false);
    FakeImage.created[1]!.succeed(); await ready();
    expect(canvas.dataset.sheet).toBe('main');
    expect(frameCallbacks.size).toBe(0);
    expect(onEnd).toHaveBeenCalledTimes(1);
    player.setEnabled(true);
    player.play('held'); await ready();
    expect(canvas.dataset.sheet).toBe('personality');
    player.destroy();
    expect(frameCallbacks.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts an optional image pending during destroy and clears its timeout without a late completion', async () => {
    const { player, context, onEnd } = setup();
    player.play('idle'); await ready(); renderAt(1000);
    automaticImageLoad = false;
    player.play('held'); await ready();
    expect(vi.getTimerCount()).toBe(1);
    const image = FakeImage.created[1]!;
    const draws = context.drawImage.mock.calls.length;
    player.destroy(); await ready();
    expect(image.src).toBe('');
    expect(image.onload).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    image.succeed(); vi.advanceTimersByTime(10_000); await ready();
    expect(context.drawImage).toHaveBeenCalledTimes(draws);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(frameCallbacks.size).toBe(0);
  });
});

describe('independent lazy atlas sheets', () => {
  it('plays the seated ear motion for four seconds on one lazy leisure image, then returns to the core', async () => {
    useSplitSheets();
    const { player, canvas, onEnd, context } = setup();
    player.play('sit'); await ready();
    expect(FakeImage.created).toHaveLength(2);
    expect(canvas.dataset.sheet).toBe('leisure');
    for (let timestamp = 125; timestamp < 4000; timestamp += 125) renderAt(timestamp);
    expect(onEnd).not.toHaveBeenCalled();
    expect(frameCallbacks.size).toBe(1);
    const earCells = context.drawImage.mock.calls.filter((call) => call[0] === FakeImage.created[1] && call[1] === 768 && call[2] === 0);
    expect(earCells).toHaveLength(5);
    renderAt(4000);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(canvas.dataset.sheet).toBe('main');
    expect(frameCallbacks.size).toBe(0);
    expect(FakeImage.created).toHaveLength(2);
  });

  it('crops all sixteen stretch cells from the extended leisure geometry and stops after two seconds', async () => {
    useSplitSheets();
    const { player, canvas, onEnd } = setup();
    player.play('stretch'); await ready();
    const frames = new Set([Number(canvas.dataset.frame)]);
    for (let timestamp = 125; timestamp < 2000; timestamp += 125) {
      renderAt(timestamp);
      expect(canvas.dataset.sheet).toBe('leisure');
      frames.add(Number(canvas.dataset.frame));
    }
    expect(frames).toEqual(new Set(Array.from({ length: 16 }, (_, index) => 36 + index)));
    expect(onEnd).not.toHaveBeenCalled();
    renderAt(2000);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(frameCallbacks.size).toBe(0);
    expect(canvas.dataset.sheet).toBe('main');
    expect(FakeImage.created).toHaveLength(2);
  });
  it('keeps core idle, waving and pointer poses on the main image without fetching optional sheets', async () => {
    useSplitSheets();
    const { player, canvas } = setup();
    player.play('idle'); await ready(); renderAt(1000);
    player.play('wave'); await ready(); renderAt(2500);
    player.look('curious'); await ready();
    expect(canvas.dataset.sheet).toBe('main');
    expect(FakeImage.created).toHaveLength(1);
    expect(FakeImage.created[0]!.src).toBe(assets.atlas);
    expect(FakeImage.created[0]!.fetchPriority).toBe('low');
    expect(fetchManifest).toHaveBeenCalledTimes(1);
  });

  it('loads only the selected named sheet and uses its own geometry, caching it for later clips', async () => {
    useSplitSheets();
    const { player, canvas, context } = setup();
    player.play('idle'); await ready(); renderAt(1000);
    player.play('happy'); await ready();
    expect(FakeImage.created).toHaveLength(2);
    expect(FakeImage.created[1]!.src).toBe(new URL('/assistant/reactions.webp', document.baseURI).href);
    expect(canvas.dataset.sheet).toBe('reactions');
    expect(canvas.dataset.frame).toBe('0');
    renderAt(1550);
    expect(context.drawImage.mock.lastCall?.slice(1, 5)).toEqual([384, 192, 192, 192]);
    renderAt(2500);
    player.play('sleep'); await ready(); renderAt(3500);
    expect(canvas.dataset.frame).toBe('35');
    expect(canvas.dataset.sheet).toBe('reactions');
    player.play('scratch'); await ready();
    expect(FakeImage.created).toHaveLength(3);
    expect(FakeImage.created[2]!.src).toBe(new URL('/assistant/leisure.webp', document.baseURI).href);
    expect(canvas.dataset.sheet).toBe('leisure');
    expect(context.drawImage.mock.lastCall?.slice(1, 5)).toEqual([0, 384, 192, 192]);
    renderAt(5000);
    expect(canvas.dataset.sheet).toBe('main');
    player.play('ears'); await ready();
    expect(FakeImage.created).toHaveLength(3);
    expect(FakeImage.created.every((image) => image.fetchPriority === 'low')).toBe(true);
    expect(FakeImage.created.slice(1).every((image) => image.decode.mock.calls.length === 1)).toBe(true);
    expect(fetchManifest).toHaveBeenCalledTimes(1);
  });

  it('shares one pending image among multiple reaction clips and plays only the latest requested clip', async () => {
    useSplitSheets();
    const { player, canvas, onEnd } = setup();
    player.play('idle'); await ready(); renderAt(1000);
    onEnd.mockClear();
    automaticImageLoad = false;
    player.play('happy'); await ready();
    player.play('sleep'); await ready();
    player.play('wake'); await ready();
    expect(FakeImage.created).toHaveLength(2);
    expect(frameCallbacks.size).toBe(0);
    FakeImage.created[1]!.succeed(); await ready();
    expect(canvas.dataset.sheet).toBe('reactions');
    expect(canvas.dataset.frame).toBe('36');
    expect(frameCallbacks.size).toBe(1);
    renderAt(1750);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(canvas.dataset.sheet).toBe('main');
  });

  it('does not resurrect a superseded reaction when a different optional sheet finishes later', async () => {
    useSplitSheets();
    const { player, canvas, onEnd } = setup();
    player.play('idle'); await ready(); renderAt(1000);
    onEnd.mockClear();
    automaticImageLoad = false;
    player.play('happy'); await ready();
    player.play('scratch'); await ready();
    expect(FakeImage.created).toHaveLength(3);
    FakeImage.created[1]!.succeed(); await ready();
    expect(canvas.dataset.sheet).toBe('main');
    expect(frameCallbacks.size).toBe(0);
    expect(onEnd).not.toHaveBeenCalled();
    FakeImage.created[2]!.succeed(); await ready();
    expect(canvas.dataset.sheet).toBe('leisure');
    expect(canvas.dataset.frame).toBe('12');
    renderAt(2500);
    expect(frameCallbacks.size).toBe(0);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it.each(['image error', 'dimensions', 'decode', 'timeout'] as const)('limits optional %s failure to that sheet and retains core and other sheets', async (failure) => {
    useSplitSheets();
    const { player, canvas, onEnd } = setup();
    player.play('idle'); await ready(); renderAt(1000);
    onEnd.mockClear();
    automaticImageLoad = false;
    player.play('happy'); await ready();
    const optional = FakeImage.created[1]!;
    if (failure === 'image error') optional.fail();
    if (failure === 'dimensions') { optional.naturalWidth = 12; optional.succeed(); }
    if (failure === 'decode') { optional.decode.mockRejectedValue(new Error('Optional decode failure')); optional.succeed(); }
    if (failure === 'timeout') vi.advanceTimersByTime(10_000);
    await ready();
    expect(canvas.dataset.sheet).toBe('main');
    expect(canvas.dataset.frame).toBe('0');
    expect(frameCallbacks.size).toBe(0);
    expect(onEnd).toHaveBeenCalledTimes(1);
    player.play('sleep'); await ready();
    expect(FakeImage.created).toHaveLength(2);
    expect(onEnd).toHaveBeenCalledTimes(2);
    player.play('wave'); await ready();
    expect(canvas.dataset.sheet).toBe('main');
    expect(frameCallbacks.size).toBe(1);
    automaticImageLoad = true;
    player.play('ears'); await ready();
    expect(canvas.dataset.sheet).toBe('leisure');
    expect(FakeImage.created).toHaveLength(3);
    renderAt(2500);
    expect(frameCallbacks.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not download a clip sheet if its request was cancelled before main finished loading', async () => {
    useSplitSheets();
    automaticImageLoad = false;
    const { player, canvas, onEnd } = setup();
    player.play('happy');
    player.stop();
    FakeImage.created[0]!.succeed(); await ready();
    expect(FakeImage.created).toHaveLength(1);
    expect(canvas.hidden).toBe(true);
    expect(frameCallbacks.size).toBe(0);
    expect(onEnd).not.toHaveBeenCalled();
    player.play('idle'); await ready();
    expect(canvas.dataset.sheet).toBe('main');
    expect(FakeImage.created).toHaveLength(1);
  });

  it('aborts all pending named sheets and clears their handlers, timeouts and late callbacks on destroy', async () => {
    useSplitSheets();
    const { player, context, onEnd } = setup();
    player.play('idle'); await ready(); renderAt(1000);
    onEnd.mockClear();
    automaticImageLoad = false;
    player.play('happy'); await ready();
    player.play('sit'); await ready();
    expect(vi.getTimerCount()).toBe(2);
    const optional = FakeImage.created.slice(1);
    const draws = context.drawImage.mock.calls.length;
    player.destroy(); await ready();
    expect(optional.every((image) => image.src === '' && !image.onload && !image.onerror)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    optional.forEach((image) => image.succeed());
    vi.advanceTimersByTime(20_000); await ready();
    expect(context.drawImage).toHaveBeenCalledTimes(draws);
    expect(onEnd).not.toHaveBeenCalled();
    expect(frameCallbacks.size).toBe(0);
  });
});
