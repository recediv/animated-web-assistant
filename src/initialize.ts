import type { AssistantInstance, InitOptions, ShopEvent } from './config/types';
import { validateConfig, validateShopContext } from './config/validate';
import { prepareGraphics } from './animation/preflight';
import type { AssistantRuntime } from './core/runtime';

type RuntimeModule = Pick<typeof import('./core/runtime'), 'AssistantRuntime'>;

function disabled(): AssistantInstance {
  const nothing = () => Promise.resolve();
  return { open: nothing, close: nothing, hide: nothing, restore: nothing, destroy: nothing };
}

async function initialize(
  options: InitOptions,
  loadRuntime: () => Promise<RuntimeModule>,
): Promise<AssistantInstance> {
  if (
    typeof document === 'undefined' ||
    !document.body ||
    typeof customElements === 'undefined' ||
    typeof HTMLDialogElement === 'undefined' ||
    !('showModal' in HTMLDialogElement.prototype) ||
    !options?.adapter
  )
    return disabled();
  const adapter = options.adapter;
  if (
    !['getContext', 'subscribe', 'navigate', 'openCart', 'enterOverlay'].every(
      (key) => typeof adapter[key as keyof typeof adapter] === 'function',
    )
  )
    return disabled();
  const abort = new AbortController();
  const cancel = () => abort.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const timeout = setTimeout(() => abort.abort(), 10000);
  const beforeDeadline = async <T>(request: () => Promise<T>): Promise<T> => {
    if (abort.signal.aborted) throw new Error('Character initialization cancelled');
    let cancel = () => {};
    const cancelled = new Promise<never>((_, reject) => {
      cancel = () => reject(new Error('Character initialization cancelled'));
      abort.signal.addEventListener('abort', cancel, { once: true });
    });
    try {
      return await Promise.race([request(), cancelled]);
    } finally {
      abort.signal.removeEventListener('abort', cancel);
    }
  };
  let unsubscribe: (() => void) | null = null;
  let runtime: AssistantRuntime | null = null;
  try {
    const configUrl = new URL(options.configUrl, window.location.href);
    if (configUrl.origin !== window.location.origin) return disabled();
    const response = await beforeDeadline(() =>
      fetch(configUrl, { signal: abort.signal, credentials: 'same-origin' }),
    );
    if (!response.ok) return disabled();
    const validated = validateConfig(
      await beforeDeadline(() => response.json()),
      window.location.href,
    );
    if (!validated.config || !validated.config.enabled) return disabled();
    if (!validateShopContext(adapter.getContext())) return disabled();
    const graphics = await beforeDeadline(() =>
      prepareGraphics(validated.config!.assets, abort.signal),
    );
    if (abort.signal.aborted || !validateShopContext(adapter.getContext())) return disabled();
    const { AssistantRuntime } = await beforeDeadline(loadRuntime);
    if (abort.signal.aborted) return disabled();
    const buffered: ShopEvent[] = [];
    unsubscribe = adapter.subscribe((event) => {
      try {
        if (runtime) runtime.receive(event);
        else buffered.push(event);
      } catch {
        void runtime?.destroy();
      }
    });
    const initial = adapter.getContext();
    if (!validateShopContext(initial)) {
      unsubscribe();
      unsubscribe = null;
      return disabled();
    }
    const latest = buffered.reduce(
      (context, event) =>
        event.type === 'context' &&
        validateShopContext(event.context) &&
        event.context.revision > context.revision
          ? event.context
          : context,
      initial,
    );
    runtime = new AssistantRuntime(validated.config, adapter, latest, unsubscribe, graphics);
    if (!(await beforeDeadline(() => runtime!.attach()))) return disabled();
    // Buffered cart events are intentionally not replayed as historical reactions.
    return runtime;
  } catch {
    if (runtime) await runtime.destroy();
    else {
      try {
        unsubscribe?.();
      } catch {
        /* Failed adapters remain isolated. */
      }
    }
    return disabled();
  } finally {
    options.signal?.removeEventListener('abort', cancel);
    clearTimeout(timeout);
    abort.abort();
  }
}

/** Each entry point owns one instance until its destroy() completes. */
export function createInitializer(
  loadRuntime: () => Promise<RuntimeModule>,
): (options: InitOptions) => Promise<AssistantInstance> {
  let singleton: Promise<AssistantInstance> | null = null;
  return function init(options: InitOptions): Promise<AssistantInstance> {
    if (singleton) return singleton;
    const promise = initialize(options, loadRuntime).then((instance): AssistantInstance => {
      let destruction: Promise<void> | null = null;
      return {
        open: () => instance.open(),
        close: () => instance.close(),
        hide: () => instance.hide(),
        restore: () => instance.restore(),
        setMotion: (motion) => instance.setMotion?.(motion) ?? Promise.resolve(),
        setInteractionHold: (hold) => instance.setInteractionHold?.(hold),
        lookAt: (point) => instance.lookAt?.(point),
        preparePagePush: (side) => instance.preparePagePush?.(side) ?? Promise.resolve(false),
        setPagePushProgress: (progress) => instance.setPagePushProgress?.(progress),
        finishPagePush: () => instance.finishPagePush?.(),
        perform: (scene) => instance.perform?.(scene) ?? Promise.resolve(),
        destroy: () => {
          destruction ??= instance.destroy().finally(() => {
            if (singleton === promise) singleton = null;
          });
          return destruction;
        },
      };
    });
    singleton = promise;
    return promise;
  };
}
