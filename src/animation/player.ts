import type { AssistantConfig } from '../config/types';
import { validateManifest, type AtlasManifest, type MotionClipName, type PoseName } from './manifest';
import type { PreparedGraphics } from './preflight';

export type PlaybackResult = 'completed' | 'unavailable';

export class SpritePlayer {
  private manifest: AtlasManifest | null = null;
  private image: HTMLImageElement | null = null;
  private loading: Promise<boolean> | null = null;
  private sheetImages = new Map<string, HTMLImageElement>();
  private sheetLoading = new Map<string, Promise<boolean>>();
  private abort = new AbortController();
  private raf = 0;
  private generation = 0;
  private lastFrame = -1;
  private lastSheet = 'main';
  private facing: -1 | 1 = 1;
  private playing = false;
  private destroyed = false;
  private failed = false;
  private size = 96;
  private enabled = true;
  private requestedPose: PoseName | null = null;
  private transition: { previous: HTMLCanvasElement; startedAt: number; duration: number } | null = null;
  private blendedFrame = false;
  private context: CanvasRenderingContext2D | null;

  constructor(private canvas: HTMLCanvasElement, private poster: HTMLImageElement,
    private assets: AssistantConfig['assets'], private onEnd: (result: PlaybackResult) => void, graphics?: PreparedGraphics,
    private onDraw?: () => void) {
    this.context = canvas.getContext('2d');
    if (graphics) {
      this.manifest = graphics.manifest;
      this.image = graphics.image;
      this.loading = Promise.resolve(true);
    }
    this.canvas.hidden = true;
    this.resize(96);
  }

  resize(size: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixels = Math.round(size * dpr);
    this.size = size;
    if (this.canvas.width === pixels && this.canvas.height === pixels) return;
    this.canvas.width = pixels;
    this.canvas.height = pixels;
    const frame = this.lastFrame;
    this.lastFrame = -1;
    if (frame >= 0) this.draw(frame, this.lastSheet);
  }

  setFacing(facing: -1 | 1): void {
    if (this.destroyed || this.facing === facing) return;
    this.facing = facing;
    this.poster.style.transform = facing === -1 ? 'scaleX(-1)' : '';
    const frame = this.lastFrame;
    this.lastFrame = -1;
    if (frame >= 0) this.draw(frame, this.lastSheet);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  play(clipName: MotionClipName, repetitions = 1, transitionMs = 0): boolean {
    if (!this.enabled || this.destroyed || this.failed || !this.context) return false;
    this.cancel();
    this.playing = true;
    this.requestedPose = null;
    const generation = this.generation;
    // Only the current request may report failure from shared loading.
    const finishUnavailable = () => {
      if (!this.enabled || this.destroyed || generation !== this.generation) return;
      this.stop();
      this.onEnd('unavailable');
    };
    void this.load().then(async (ready) => {
      if (!this.enabled || this.destroyed || generation !== this.generation) return;
      if (!ready || !this.manifest) { finishUnavailable(); return; }
      const clip = this.manifest.clips[clipName];
      if (!clip) { finishUnavailable(); return; }
      let sheet = clip.sheet ?? 'main';
      let frames = clip.frames;
      if (sheet !== 'main' && !(await this.loadSheet(sheet))) {
        if (generation !== this.generation || this.destroyed || !this.enabled) return;
        if (!clip.fallbackFrames) { finishUnavailable(); return; }
        sheet = 'main';
        frames = clip.fallbackFrames;
      }
      if (generation !== this.generation || this.destroyed || !this.enabled) return;
      const started = performance.now();
      this.beginTransition(transitionMs, started);
      const cycleDuration = frames.length * 1000 / clip.fps;
      const repeatCount = Number.isFinite(repetitions) ? Math.max(1, Math.min(8, Math.floor(repetitions))) : 1;
      const duration = cycleDuration * repeatCount;
      const tick = (now: number) => {
        if (generation !== this.generation || this.destroyed || !this.enabled) return;
        // Shared frame timestamps can precede work that started this clip.
        const elapsed = Math.max(0, now - started);
        if (elapsed >= duration) {
          this.raf = 0;
          this.playing = false;
          if (clip.end === 'hold') this.draw(frames[frames.length - 1]!, sheet);
          else this.draw(this.manifest!.neutralFrame);
          this.onEnd('completed');
          return;
        }
        this.draw(frames[Math.floor(elapsed * clip.fps / 1000) % frames.length]!, sheet, now);
        this.raf = requestAnimationFrame(tick);
      };
      this.draw(frames[0]!, sheet, started);
      this.raf = requestAnimationFrame(tick);
    }).catch(() => {
      if (!this.enabled || this.destroyed || generation !== this.generation) return;
      this.failed = true;
      finishUnavailable();
    });
    return true;
  }

  look(pose: PoseName): Promise<boolean> {
    if (!this.enabled || this.destroyed || this.failed || this.playing) return Promise.resolve(false);
    this.requestedPose = pose;
    const generation = this.generation;
    return this.load().then((ready) => {
      if (!ready || !this.enabled || this.destroyed || this.raf || generation !== this.generation || !this.requestedPose || this.requestedPose !== pose) return false;
      const poses = this.manifest?.poses;
      const frame = poses?.[this.requestedPose] ??
        (pose === 'up-left' || pose === 'up-right' ? poses?.up :
          pose === 'push-left' ? poses?.left : pose === 'push-right' ? poses?.right : undefined);
      if (frame === undefined) return false;
      this.draw(frame);
      return !this.failed && this.lastFrame === frame && this.lastSheet === 'main';
    }).catch(() => false);
  }

  /** Load a clip without starting playback or changing the pose. */
  async prepareClip(clipName: MotionClipName): Promise<boolean> {
    if (!this.enabled || this.destroyed || this.failed) return false;
    const generation = this.generation;
    try {
      if (!(await this.load()) || !this.enabled || this.destroyed || generation !== this.generation) return false;
      const clip = this.manifest?.clips[clipName];
      if (!clip) return false;
      const ready = !clip.sheet || await this.loadSheet(clip.sheet) || !!clip.fallbackFrames;
      return ready && this.enabled && !this.destroyed && generation === this.generation;
    } catch { return false; }
  }

  /** Draw an already prepared clip from an external finite path, without a RAF. */
  sample(clipName: MotionClipName, progress: number, loop = false): boolean {
    if (!this.enabled || this.destroyed || this.failed || this.playing || !this.context || !Number.isFinite(progress)) return false;
    const clip = this.manifest?.clips[clipName];
    if (!clip) return false;
    let sheet = clip.sheet ?? 'main';
    let frames = clip.frames;
    if (sheet !== 'main' && !this.sheetImages.has(sheet)) {
      if (!clip.fallbackFrames) return false;
      sheet = 'main'; frames = clip.fallbackFrames;
    }
    const position = loop ? ((progress % 1) + 1) % 1 : Math.max(0, Math.min(1, progress));
    const frame = frames[Math.min(frames.length - 1, Math.floor(position * frames.length))]!;
    this.draw(frame, sheet);
    return this.lastFrame === frame && this.lastSheet === sheet;
  }

  stop(): void {
    this.cancel();
    if (this.manifest && this.image) this.draw(this.manifest.neutralFrame);
    else { this.canvas.hidden = true; this.poster.hidden = this.poster.complete && this.poster.naturalWidth === 0; }
  }

  pause(): void { this.cancel(); }

  destroy(): void {
    this.destroyed = true;
    this.cancel();
    this.abort.abort();
    this.image = null;
    this.sheetImages.clear();
    this.sheetLoading.clear();
    this.manifest = null;
    this.loading = null;
  }

  private cancel(): void {
    this.generation++;
    this.requestedPose = null;
    this.playing = false;
    this.transition = null;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private async loadWithinDeadline<T>(load: (signal: AbortSignal) => Promise<T>, cleanup: (cancelled: boolean) => void): Promise<T> {
    const abort = new AbortController();
    let rejectDeadline: ((error: Error) => void) | undefined;
    const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject; });
    const cancel = () => {
      abort.abort();
      rejectDeadline?.(new Error('Atlas loading cancelled or timed out'));
    };
    const timeout = setTimeout(cancel, 10000);
    this.abort.signal.addEventListener('abort', cancel, { once: true });
    if (this.abort.signal.aborted) cancel();
    try {
      // An image-only timer cannot bound fetch, JSON or decode once onload has
      // resolved. Keep one deadline around the complete shared loading request.
      return await Promise.race([load(abort.signal), deadline]);
    } catch (error) {
      abort.abort();
      throw error;
    } finally {
      clearTimeout(timeout);
      this.abort.signal.removeEventListener('abort', cancel);
      cleanup(abort.signal.aborted);
    }
  }

  private loadSheet(name: string): Promise<boolean> {
    if (this.destroyed || this.abort.signal.aborted) return Promise.resolve(false);
    const cached = this.sheetLoading.get(name);
    if (cached) return cached;
    const geometry = this.manifest?.atlases?.[name];
    if (!geometry) return Promise.resolve(false);
    const loading = (async () => {
      const image = new Image();
      image.fetchPriority = 'low';
      const imageReady = new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Optional atlas unavailable'));
        image.src = new URL(geometry.file, new URL(this.assets.manifest, document.baseURI)).href;
      });
      try {
        return await this.loadWithinDeadline(async (signal) => {
          await imageReady;
          if (signal.aborted || this.destroyed) return false;
          if (image.naturalWidth !== geometry.width || image.naturalHeight !== geometry.height) throw new Error('Invalid optional atlas');
          await image.decode();
          // decode may settle after the deadline; it must not fill the cache.
          if (signal.aborted || this.destroyed) return false;
          this.sheetImages.set(name, image);
          return true;
        }, (cancelled) => {
          image.onload = null; image.onerror = null;
          if (cancelled) image.src = '';
        });
      } catch { return false; }
    })();
    this.sheetLoading.set(name, loading);
    return loading;
  }

  private load(): Promise<boolean> {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const image = new Image();
      image.fetchPriority = 'low';
      const imageReady = new Promise<HTMLImageElement>((resolve, reject) => {
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Atlas unavailable'));
        image.src = this.assets.atlas;
      });
      try {
        return await this.loadWithinDeadline(async (signal) => {
          const [response, decoded] = await Promise.all([
            fetch(this.assets.manifest, { signal, credentials: 'same-origin' }), imageReady,
          ]);
          if (signal.aborted || this.destroyed) return false;
          if (!response.ok) throw new Error('Manifest unavailable');
          const manifest: unknown = await response.json();
          if (signal.aborted || this.destroyed) return false;
          if (!validateManifest(manifest) || decoded.naturalWidth !== manifest.atlas.width || decoded.naturalHeight !== manifest.atlas.height) throw new Error('Invalid atlas');
          await decoded.decode();
          if (signal.aborted || this.destroyed) return false;
          this.manifest = manifest;
          this.image = decoded;
          this.resize(this.size);
          return true;
        }, (cancelled) => {
          image.onload = null; image.onerror = null;
          if (cancelled) image.src = '';
        });
      } catch {
        this.failed = true;
        if (!this.destroyed) {
          this.canvas.hidden = true;
          this.poster.hidden = this.poster.complete && this.poster.naturalWidth === 0;
        }
        return false;
      }
    })();
    return this.loading;
  }

  private beginTransition(duration: number, startedAt: number): void {
    if (!Number.isFinite(duration) || duration <= 0 || this.canvas.hidden || this.lastFrame < 0) return;
    const previous = document.createElement('canvas');
    previous.width = this.canvas.width;
    previous.height = this.canvas.height;
    try {
      const context = previous.getContext('2d');
      if (!context) return;
      context.drawImage(this.canvas, 0, 0);
      this.transition = { previous, startedAt, duration: Math.min(duration, 200) };
    } catch { /* A transition is optional; the requested clip can still play. */ }
  }

  private draw(frame: number, sheet = 'main', now = performance.now()): void {
    if (this.destroyed || (!this.transition && !this.blendedFrame && frame === this.lastFrame && sheet === this.lastSheet) || !this.manifest || !this.context) return;
    const { cell } = this.manifest;
    const atlas = sheet === 'main' ? this.manifest.atlas : this.manifest.atlases?.[sheet];
    const image = sheet === 'main' ? this.image : this.sheetImages.get(sheet);
    if (!atlas || !image) return;
    const sx = (frame % atlas.columns) * cell.width;
    const sy = Math.floor(frame / atlas.columns) * cell.height;
    const composition = this.context.globalCompositeOperation;
    const alpha = this.context.globalAlpha;
    const transition = this.transition;
    const progress = transition ? Math.max(0, Math.min(1, (now - transition.startedAt) / transition.duration)) : 1;
    const weight = progress * progress * (3 - 2 * progress);
    if (this.facing === -1) {
      this.context.save();
      this.context.translate(this.canvas.width, 0);
      this.context.scale(-1, 1);
    }
    // Replace the complete cell, including transparency, without erasing the
    // displayed frame first. A failed draw leaves that frame available to retry.
    this.context.globalCompositeOperation = 'copy';
    this.context.globalAlpha = weight;
    try {
      this.context.drawImage(image, sx, sy, cell.width, cell.height, 0, 0, this.canvas.width, this.canvas.height);
    } catch { return; }
    finally {
      if (this.facing === -1) this.context.restore();
      this.context.globalCompositeOperation = composition;
      this.context.globalAlpha = alpha;
    }
    if (transition && progress < 1) {
      // Blend premultiplied pixels so the overlapping body stays opaque.
      this.context.globalCompositeOperation = 'lighter';
      this.context.globalAlpha = 1 - weight;
      try {
        this.context.drawImage(transition.previous, 0, 0, this.canvas.width, this.canvas.height);
      } catch {
        this.transition = null;
        this.lastFrame = -1;
        this.draw(frame, sheet, now);
        return;
      } finally {
        this.context.globalCompositeOperation = composition;
        this.context.globalAlpha = alpha;
      }
    } else this.transition = null;
    this.blendedFrame = !!transition && progress < 1;
    this.lastFrame = frame;
    this.lastSheet = sheet;
    this.canvas.dataset.frame = String(frame);
    this.canvas.dataset.sheet = sheet;
    this.canvas.hidden = false;
    this.poster.hidden = true;
    try { this.onDraw?.(); } catch { /* Input geometry cannot stop sprite playback. */ }
  }
}
