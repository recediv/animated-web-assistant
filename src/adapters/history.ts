import type { OverlaySession } from '../config/types';

const MARKER = '__animeShopAssistantOverlay_v1';
let sequence = 0;

export function createHistoryOverlayAdapter(target: Window = window): {
  enterOverlay(onBack: () => void): Promise<OverlaySession>;
} {
  let active: OverlaySession | null = null;
  return {
    async enterOverlay(onBack) {
      await active?.close();
      const id = `assistant-${Date.now()}-${++sequence}`;
      const overlayUrl = target.location.href;
      const previousState: unknown = target.history.state;
      const state = Object.prototype.toString.call(previousState) === '[object Object]'
        ? { ...(previousState as Record<string, unknown>), [MARKER]: id }
        : { __animeShopAssistantPreviousState: previousState, [MARKER]: id };
      target.history.pushState(state, '', target.location.href);
      let ended = false;
      let closing = false;
      let closePromise: Promise<void> | null = null;
      let resolveClose: (() => void) | null = null;
      const ownCurrent = () => {
        const current: unknown = target.history.state;
        return typeof current === 'object' && current !== null &&
          (current as Record<string, unknown>)[MARKER] === id && target.location.href === overlayUrl;
      };
      const finish = (back: boolean) => {
        if (ended) return;
        ended = true;
        target.removeEventListener('popstate', onPop);
        if (active === session) active = null;
        resolveClose?.();
        if (back) {
          try { onBack(); } catch { /* The adapter never propagates UI callback failures. */ }
        }
      };
      const onPop = () => {
        if (!ownCurrent()) finish(!closing);
      };
      const session: OverlaySession = {
        close() {
          if (closePromise) return closePromise;
          if (ended || !ownCurrent()) {
            finish(false);
            closePromise = Promise.resolve();
            return closePromise;
          }
          closing = true;
          closePromise = new Promise<void>((resolve) => { resolveClose = resolve; });
          try { target.history.back(); } catch { finish(false); }
          return closePromise;
        },
      };
      target.addEventListener('popstate', onPop);
      active = session;
      return session;
    },
  };
}
