import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoAdapter } from '../../src/adapters/demo';
import { validateShopContext } from '../../src/config/validate';
import type { AssistantInstance, ShopContext } from '../../src/config/types';
import config from '../../demo/assistant.config.json';
import manifest from '../../assets/exported/atlas.json';

type Resource = 'poster' | 'atlas';
type Stall =
  | 'configuration JSON'
  | 'manifest fetch'
  | 'manifest JSON'
  | 'poster load'
  | 'atlas load'
  | 'poster decode'
  | 'atlas decode';
let instance: AssistantInstance | undefined;
let automaticImages = true;
let imageError: Resource | undefined;
let decodeError: Resource | undefined;
let wrongDimensions: Resource | undefined;
let stalled: Stall | undefined;
let manifestValue: unknown;
let manifestHttp = true;
let manifestError = false;
const imports = vi.fn();
const construct = vi.fn();
const receive = vi.fn();
const attach = vi.fn(async () => true);
const raf = vi.fn();
const pathOf = (url: string | URL | Request) => new URL(String(url), location.href).pathname;
const pending = () => new Promise<never>(() => {});

class GraphicsImage {
  static created: GraphicsImage[] = [];
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  decoding = '';
  fetchPriority = '';
  private source = '';
  get resource(): Resource {
    return this.source.endsWith('poster.webp') ? 'poster' : 'atlas';
  }
  get naturalWidth(): number {
    if (wrongDimensions === this.resource)
      return this.resource === 'poster' ? 0 : manifest.atlas.width - 1;
    return this.resource === 'poster' ? 192 : manifest.atlas.width;
  }
  get naturalHeight(): number {
    return this.resource === 'poster' ? 192 : manifest.atlas.height;
  }
  get src(): string {
    return this.source;
  }
  set src(value: string) {
    this.source = value;
    if (!value || !automaticImages || stalled === `${this.resource} load`) return;
    queueMicrotask(() => {
      if (this.source !== value) return;
      if (imageError === this.resource) this.onerror?.(new Event('error'));
      else this.succeed();
    });
  }
  decode = vi.fn(async () => {
    if (stalled === `${this.resource} decode`) await pending();
    if (decodeError === this.resource) throw new Error('Image decoding failed');
  });
  constructor() {
    GraphicsImage.created.push(this);
  }
  removeAttribute(name: string): void {
    if (name === 'src') this.src = '';
  }
  succeed(): void {
    this.onload?.(new Event('load'));
  }
}

async function flush(): Promise<void> {
  // Dynamic imports and the genuine fetch/load/decode chain, without moving the deadline.
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
}

async function initialize(adapter = createDemoAdapter()): Promise<AssistantInstance> {
  const { init } = await import('../../src/index');
  instance = await init({ configUrl: '/demo/assistant.config.json', adapter });
  return instance;
}

function expectDisabled(adapter: ReturnType<typeof createDemoAdapter>, originalDom: string): void {
  expect(imports).not.toHaveBeenCalled();
  expect(construct).not.toHaveBeenCalled();
  expect(adapter.subscriberCount).toBe(0);
  expect(document.documentElement.innerHTML).toBe(originalDom);
  expect(raf).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  document.body.innerHTML = '<main id="shop">Shop</main>';
  document.head.innerHTML = '';
  instance = undefined;
  automaticImages = true;
  imageError = decodeError = wrongDimensions = undefined;
  stalled = undefined;
  manifestValue = structuredClone(manifest);
  manifestHttp = true;
  manifestError = false;
  GraphicsImage.created = [];
  for (const mock of [imports, construct, receive, attach, raf]) mock.mockClear();
  vi.stubGlobal('Image', GraphicsImage);
  vi.stubGlobal('requestAnimationFrame', raf);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: vi.fn(),
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
      if (pathOf(url).endsWith('assistant.config.json'))
        return {
          ok: true,
          json: async () => (stalled === 'configuration JSON' ? pending() : config),
        };
      if (!pathOf(url).endsWith('atlas.json'))
        throw new Error(`Unexpected graphics request: ${String(url)}`);
      if (manifestError) throw new Error('Manifest network failure');
      if (stalled === 'manifest fetch')
        return new Promise((_resolve, reject) => {
          const fail = () => reject(new DOMException('Aborted', 'AbortError'));
          if (options?.signal?.aborted) fail();
          else options?.signal?.addEventListener('abort', fail, { once: true });
        });
      return {
        ok: manifestHttp,
        json: async () => (stalled === 'manifest JSON' ? pending() : manifestValue),
      };
    }),
  );
  vi.doMock('../../src/core/runtime', () => {
    imports();
    return {
      validInitialContext: validateShopContext,
      AssistantRuntime: class {
        private unsubscribe: () => void;
        constructor(...args: unknown[]) {
          construct(...args);
          this.unsubscribe = args[3] as () => void;
        }
        attach = attach;
        receive = receive;
        open = async () => {};
        close = async () => {};
        hide = async () => {};
        restore = async () => {};
        destroy = async () => {
          this.unsubscribe();
        };
      },
    };
  });
});

afterEach(async () => {
  await instance?.destroy();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.doUnmock('../../src/core/runtime');
});

describe('mandatory graphics before runtime initialization', () => {
  it('rejects an unavailable 2D canvas before any graphics request or runtime import', async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    const adapter = createDemoAdapter();
    const originalDom = document.documentElement.innerHTML;
    await initialize(adapter);
    expect(vi.mocked(fetch).mock.calls.map(([url]) => pathOf(url))).toEqual([
      '/demo/assistant.config.json',
    ]);
    expect(GraphicsImage.created).toHaveLength(0);
    expectDisabled(adapter, originalDom);
  });

  it.each([
    'manifest HTTP',
    'manifest network',
    'invalid manifest',
    'poster image',
    'atlas image',
    'poster size',
    'atlas size',
    'poster decode',
    'atlas decode',
  ] as const)('leaves the storefront untouched after %s failure', async (failure) => {
    if (failure === 'manifest HTTP') manifestHttp = false;
    if (failure === 'manifest network') manifestError = true;
    if (failure === 'invalid manifest') manifestValue = { ...manifest, neutralFrame: 1e9 };
    if (failure === 'poster image') imageError = 'poster';
    if (failure === 'atlas image') imageError = 'atlas';
    if (failure === 'poster size') wrongDimensions = 'poster';
    if (failure === 'atlas size') wrongDimensions = 'atlas';
    if (failure === 'poster decode') decodeError = 'poster';
    if (failure === 'atlas decode') decodeError = 'atlas';
    const adapter = createDemoAdapter();
    const originalDom = document.documentElement.innerHTML;
    await initialize(adapter);
    expectDisabled(adapter, originalDom);
    await instance!.open();
    expectDisabled(adapter, originalDom);
  });

  it.each<Stall>([
    'configuration JSON',
    'manifest fetch',
    'manifest JSON',
    'poster load',
    'atlas load',
    'poster decode',
    'atlas decode',
  ])(
    'bounds a stalled %s with the shared initialization deadline and ignores late image events',
    async (stage) => {
      stalled = stage;
      const adapter = createDemoAdapter();
      const originalDom = document.documentElement.innerHTML;
      const { init } = await import('../../src/index');
      let completed = false;
      const initializing = init({ configUrl: '/demo/assistant.config.json', adapter }).then(
        (value) => {
          instance = value;
          completed = true;
        },
      );
      await flush();
      expect(completed).toBe(false);
      await vi.advanceTimersByTimeAsync(10000);
      expect(completed).toBe(true);
      await initializing;
      expectDisabled(adapter, originalDom);
      for (const image of GraphicsImage.created) image.succeed();
      await flush();
      expectDisabled(adapter, originalDom);
    },
  );

  it('rejects a context that became invalid while mandatory images were loading without importing the runtime', async () => {
    automaticImages = false;
    const adapter = createDemoAdapter();
    const context = vi.spyOn(adapter, 'getContext');
    const originalDom = document.documentElement.innerHTML;
    const { init } = await import('../../src/index');
    const initializing = init({ configUrl: '/demo/assistant.config.json', adapter });
    await flush();
    context.mockReturnValue(undefined as unknown as ShopContext);
    for (const image of GraphicsImage.created) image.succeed();
    instance = await initializing;
    expectDisabled(adapter, originalDom);
  });

  it('does not revive initialization when configuration JSON arrives after the deadline', async () => {
    let resolveJson!: (value: unknown) => void;
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () =>
        new Promise((resolve) => {
          resolveJson = resolve;
        }),
    } as unknown as Response);
    const adapter = createDemoAdapter();
    const originalDom = document.documentElement.innerHTML;
    const { init } = await import('../../src/index');
    const initializing = init({ configUrl: '/demo/assistant.config.json', adapter });
    await flush();
    await vi.advanceTimersByTimeAsync(10000);
    instance = await initializing;
    expectDisabled(adapter, originalDom);
    expect(GraphicsImage.created).toHaveLength(0);
    resolveJson(config);
    await flush();
    expectDisabled(adapter, originalDom);
    expect(GraphicsImage.created).toHaveLength(0);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('bounds runtime module loading and ignores a module that arrives after initialization has expired', async () => {
    type RuntimeModule = Pick<typeof import('../../src/core/runtime'), 'AssistantRuntime'>;
    let resolveModule!: (value: RuntimeModule) => void;
    const loadRuntime = vi.fn(
      () =>
        new Promise<RuntimeModule>((resolve) => {
          resolveModule = resolve;
        }),
    );
    const { createInitializer } = await import('../../src/initialize');
    const init = createInitializer(loadRuntime);
    const adapter = createDemoAdapter();
    const originalDom = document.documentElement.innerHTML;
    const initializing = init({ configUrl: '/demo/assistant.config.json', adapter });
    await flush();
    expect(loadRuntime).toHaveBeenCalledTimes(1);
    expect(GraphicsImage.created).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(10000);
    instance = await initializing;
    expectDisabled(adapter, originalDom);
    const lateConstructor = vi.fn();
    resolveModule({
      AssistantRuntime: lateConstructor as unknown as RuntimeModule['AssistantRuntime'],
    });
    await flush();
    expect(lateConstructor).not.toHaveBeenCalled();
    expectDisabled(adapter, originalDom);
  });

  it('destroys a runtime whose attachment exceeds the remaining deadline and ignores late attachment', async () => {
    let completeAttachment!: (available: boolean) => void;
    attach.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          completeAttachment = resolve;
        }),
    );
    const adapter = createDemoAdapter();
    const originalDom = document.documentElement.innerHTML;
    const { init } = await import('../../src/index');
    const initializing = init({ configUrl: '/demo/assistant.config.json', adapter });
    await vi.waitFor(() => expect(attach).toHaveBeenCalledTimes(1), { interval: 1, timeout: 1000 });
    expect(adapter.subscriberCount).toBe(1);
    await vi.advanceTimersByTimeAsync(10000);
    instance = await initializing;
    expect(adapter.subscriberCount).toBe(0);
    expect(document.documentElement.innerHTML).toBe(originalDom);
    expect(vi.getTimerCount()).toBe(0);
    completeAttachment(true);
    await flush();
    await instance.open();
    expect(construct).toHaveBeenCalledTimes(1);
    expect(adapter.subscriberCount).toBe(0);
    expect(document.documentElement.innerHTML).toBe(originalDom);
    expect(raf).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shares one preload, reuses the decoded images, reads the latest context and merges a synchronous subscription update', async () => {
    automaticImages = false;
    const adapter = createDemoAdapter();
    const originalSubscribe = adapter.subscribe.bind(adapter);
    const subscribe = vi.spyOn(adapter, 'subscribe').mockImplementation((listener) => {
      const unsubscribe = originalSubscribe(listener);
      adapter.setPage('catalog', '/during-subscription');
      return unsubscribe;
    });
    const { init } = await import('../../src/index');
    const first = init({ configUrl: '/demo/assistant.config.json', adapter });
    const second = init({ configUrl: '/demo/assistant.config.json', adapter });
    expect(second).toBe(first);
    await flush();
    expect(imports).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
    adapter.update({ pageType: 'product', pageKey: '/latest-while-loading', cartCount: 2 });
    expect(GraphicsImage.created).toHaveLength(2);
    const poster = GraphicsImage.created.find((image) => image.resource === 'poster')!;
    const image = GraphicsImage.created.find((value) => value.resource === 'atlas')!;
    poster.succeed();
    image.succeed();
    instance = await first;
    expect(imports).toHaveBeenCalledTimes(1);
    expect(construct).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledTimes(1);
    const [, , context, , prepared] = construct.mock.calls[0]!;
    expect(context as ShopContext).toMatchObject({
      pageType: 'catalog',
      pageKey: '/during-subscription',
      cartCount: 2,
      revision: adapter.getContext().revision,
    });
    expect(prepared).toMatchObject({ manifest, image, poster });
    expect((prepared as { image: unknown }).image).toBe(image);
    expect((prepared as { poster: unknown }).poster).toBe(poster);
    expect(image.decode).toHaveBeenCalledTimes(1);
    expect(poster.decode).toHaveBeenCalledTimes(1);
    expect(GraphicsImage.created).toHaveLength(2);
    expect(vi.mocked(fetch).mock.calls.map(([url]) => pathOf(url))).toEqual([
      '/demo/assistant.config.json',
      '/assistant/1.0.0/atlas.json',
    ]);
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(adapter.subscriberCount).toBe(1);
    expect(raf).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    await instance.destroy();
    expect(adapter.subscriberCount).toBe(0);
  });
});
