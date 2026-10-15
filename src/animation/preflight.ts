import type { AssistantConfig } from '../config/types';
import { validateManifest, type AtlasManifest } from './manifest';

export interface PreparedGraphics {
  manifest: AtlasManifest;
  image: HTMLImageElement;
  poster: HTMLImageElement;
}

/** Check only essential artwork before importing the character runtime. */
export async function prepareGraphics(
  assets: AssistantConfig['assets'],
  signal: AbortSignal,
): Promise<PreparedGraphics> {
  if (signal.aborted || !document.createElement('canvas').getContext('2d'))
    throw new Error('Character graphics unavailable');
  const abort = new AbortController();
  const cancel = () => abort.abort();
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  let rejectCancellation: (error: Error) => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    rejectCancellation = reject;
  });
  const rejectAborted = () => rejectCancellation(new Error('Character graphics loading cancelled'));
  abort.signal.addEventListener('abort', rejectAborted, { once: true });
  if (abort.signal.aborted) rejectAborted();
  const images: HTMLImageElement[] = [];
  const loadImage = (url: string): Promise<HTMLImageElement> => {
    const image = new Image();
    images.push(image);
    image.fetchPriority = 'low';
    image.decoding = 'async';
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        image.onload = null;
        image.onerror = null;
        abort.signal.removeEventListener('abort', cancelled);
        if (error) {
          image.removeAttribute('src');
          reject(error);
        } else resolve(image);
      };
      const cancelled = () => finish(new Error('Character graphics loading cancelled'));
      image.onerror = () => finish(new Error('Character image unavailable'));
      image.onload = () => {
        void Promise.resolve()
          .then(() => image.decode())
          .then(() => {
            if (abort.signal.aborted) return;
            if (!image.naturalWidth || !image.naturalHeight)
              finish(new Error('Empty character image'));
            else finish();
          })
          .catch(() => finish(new Error('Character image cannot be decoded')));
      };
      abort.signal.addEventListener('abort', cancelled, { once: true });
      if (abort.signal.aborted) cancelled();
      else image.src = url;
    });
  };
  let ready = false;
  try {
    const manifestRequest = (async () => {
      const response = await fetch(assets.manifest, {
        signal: abort.signal,
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Character manifest unavailable');
      const manifest: unknown = await response.json();
      if (!validateManifest(manifest)) throw new Error('Invalid character manifest');
      return manifest;
    })();
    const [manifest, image, poster] = await Promise.race([
      Promise.all([manifestRequest, loadImage(assets.atlas), loadImage(assets.poster)]),
      cancelled,
    ]);
    if (
      abort.signal.aborted ||
      image.naturalWidth !== manifest.atlas.width ||
      image.naturalHeight !== manifest.atlas.height
    )
      throw new Error('Invalid character atlas');
    ready = true;
    return { manifest, image, poster };
  } finally {
    if (!ready) {
      abort.abort();
      for (const image of images) image.removeAttribute('src');
    }
    signal.removeEventListener('abort', cancel);
    abort.signal.removeEventListener('abort', rejectAborted);
  }
}
