import './storybook-sky.css';

export interface AnimatedSky {
  ready: Promise<boolean>;
  destroy(): void;
}

let currentSky: AnimatedSky | undefined;

/** Inline the existing landscape so its original shapes can move independently. */
export function mountAnimatedSky(): AnimatedSky {
  if (currentSky) return currentSky;
  const container = document.createElement('div');
  container.className = 'storybook-sky';
  container.setAttribute('aria-hidden', 'true');
  container.setAttribute('inert', '');
  const abort = new window.AbortController();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let destroyed = false;
  let pageSuspended = false;
  const updatePause = () => {
    container.dataset.paused = String(document.hidden || pageSuspended || reduced.matches);
  };
  const suspend = () => {
    pageSuspended = true;
    updatePause();
  };
  const resume = () => {
    pageSuspended = false;
    updatePause();
  };
  document.addEventListener('visibilitychange', updatePause);
  window.addEventListener('pagehide', suspend);
  window.addEventListener('pageshow', resume);
  reduced.addEventListener('change', updatePause);
  updatePause();

  const handle: AnimatedSky = {
    ready: Promise.resolve(false),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      abort.abort();
      document.removeEventListener('visibilitychange', updatePause);
      window.removeEventListener('pagehide', suspend);
      window.removeEventListener('pageshow', resume);
      reduced.removeEventListener('change', updatePause);
      container.remove();
      if (currentSky === handle) {
        document.documentElement.removeAttribute('data-storybook-sky');
        currentSky = undefined;
      }
    },
  };
  currentSky = handle;
  handle.ready = (async () => {
    try {
      const asset = new URL(
        '../assets/exported/art/storybook-book-background.svg',
        import.meta.url,
      );
      const response = await fetch(asset, { signal: abort.signal, cache: 'force-cache' });
      if (!response.ok) return false;
      const source = await response.text();
      if (destroyed) return false;
      const parsed = new window.DOMParser().parseFromString(source, 'image/svg+xml');
      const svg = parsed.documentElement;
      if (
        svg.localName !== 'svg' ||
        parsed.querySelector('parsererror') ||
        svg.getAttribute('viewBox') !== '0 0 1600 1000' ||
        !svg.querySelector('.storybook-cloud') ||
        !svg.querySelector('.storybook-lantern')
      )
        return false;
      const drawing = document.importNode(svg, true);
      drawing.removeAttribute('role');
      drawing.removeAttribute('aria-labelledby');
      drawing.setAttribute('focusable', 'false');
      container.append(drawing);
      updatePause();
      document.body.prepend(container);
      document.documentElement.setAttribute('data-storybook-sky', 'mounted');
      return true;
    } catch {
      // The original CSS image remains available if the inline drawing cannot load.
      return false;
    }
  })();
  return handle;
}
