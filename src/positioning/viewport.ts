export interface Viewport { left: number; top: number; width: number; height: number }
export interface SafeArea { left: number; right: number; bottom: number; top: number }
export interface Placement {
  /** Movement uses the same safe edges and bottom support as the positioned view. */
  motionViewport: Viewport;
  launcherLeft: number;
  launcherTop: number;
  panelLeft: number;
  panelTop: number;
  panelWidth: number;
  panelHeight: number;
  room: boolean;
}

export function calculatePlacement(viewport: Viewport, safe: SafeArea, reserved: number,
  compact: boolean, side: 'left' | 'right'): Placement {
  const gap = compact ? 12 : 24;
  const size = compact ? 64 : 96;
  const bottom = Math.max(safe.bottom, reserved) + gap;
  const width = Math.max(0, viewport.width - safe.left - safe.right - gap * 2);
  const height = Math.max(0, viewport.height - safe.top - bottom - gap);
  const panelWidth = Math.min(compact ? 560 : 360, compact ? viewport.width - safe.left - safe.right : width);
  const panelHeight = compact ? (viewport.height < 480 ? viewport.height - safe.top - safe.bottom : viewport.height * .8) : Math.min(560, height - size - 12);
  const launcherLeft = side === 'right' ? viewport.left + viewport.width - safe.right - gap - size : viewport.left + safe.left + gap;
  const launcherTop = viewport.top + viewport.height - bottom - size;
  return {
    motionViewport: {
      left: viewport.left + safe.left, top: viewport.top + safe.top,
      width: Math.max(1, viewport.width - safe.left - safe.right),
      height: Math.max(1, viewport.height - safe.top - Math.max(safe.bottom, reserved)),
    },
    launcherLeft, launcherTop,
    panelLeft: compact ? viewport.left + safe.left + (viewport.width - safe.left - safe.right - panelWidth) / 2 :
      side === 'right' ? viewport.left + viewport.width - safe.right - gap - panelWidth : viewport.left + safe.left + gap,
    panelTop: compact ? viewport.top + viewport.height - safe.bottom : launcherTop - 12,
    panelWidth: Math.max(0, panelWidth), panelHeight: Math.max(48, panelHeight),
    room: width >= size && height >= size,
  };
}

export function visibleViewport(): Viewport {
  const viewport = window.visualViewport;
  return viewport ? { left: viewport.offsetLeft, top: viewport.offsetTop, width: viewport.width, height: viewport.height } :
    { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
}

/** A single queued layout pass handles rotation, zoom, safe areas and registered store panels. */
export class ViewportObserver {
  private pending = 0;
  private destroyed = false;
  private abort = new AbortController();
  constructor(private onChange: () => void) {
    const options = { passive: true, signal: this.abort.signal };
    window.addEventListener('resize', this.queue, options);
    window.visualViewport?.addEventListener('resize', this.queue, options);
    window.visualViewport?.addEventListener('scroll', this.queue, options);
  }
  queue = (): void => {
    if (this.destroyed) return;
    if (!this.pending) this.pending = requestAnimationFrame(() => {
      this.pending = 0;
      if (!this.destroyed) this.onChange();
    });
  };
  destroy(): void {
    this.destroyed = true;
    this.abort.abort();
    if (this.pending) cancelAnimationFrame(this.pending);
    this.pending = 0;
  }
}
