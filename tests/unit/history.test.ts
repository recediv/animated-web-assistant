import { describe, expect, it, vi } from 'vitest';
import { createHistoryOverlayAdapter } from '../../src/adapters/history';

function sandbox() {
  const events = new EventTarget();
  const entries: unknown[] = [{ router: { route: '/catalog', scroll: 150 }, arbitrary: 42 }];
  let index = 0;
  let listeners = 0;
  const history = {
    get state() { return entries[index]; },
    pushState(state: unknown) { entries.splice(index + 1); entries.push(state); index++; },
    replaceState(state: unknown) { entries[index] = state; },
    back() { if (index > 0) { index--; queueMicrotask(() => events.dispatchEvent(new Event('popstate'))); } },
    forward() { if (index < entries.length - 1) { index++; queueMicrotask(() => events.dispatchEvent(new Event('popstate'))); } },
  };
  const target = {
    history,
    location: { href: 'https://shop.example/catalog' },
    addEventListener(type: string, listener: EventListener) { listeners++; events.addEventListener(type, listener); },
    removeEventListener(type: string, listener: EventListener) { listeners--; events.removeEventListener(type, listener); },
  } as unknown as Window;
  return { target, history, entries, get index() { return index; }, get listeners() { return listeners; } };
}

describe('mobile history sessions', () => {
  it.each([null, 17, ['catalog'], new Date('2026-10-12T12:00:00Z')])('preserves non-object router state %s when closing', async (previousState) => {
    const env = sandbox();
    env.history.replaceState(previousState);
    const session = await createHistoryOverlayAdapter(env.target).enterOverlay(vi.fn());
    expect(env.history.state).toMatchObject({ __animeShopAssistantPreviousState: previousState });
    await session.close();
    expect(env.history.state).toBe(previousState);
  });

  it('preserves router state and closes idempotently only after popstate', async () => {
    const env = sandbox();
    const onBack = vi.fn();
    const session = await createHistoryOverlayAdapter(env.target).enterOverlay(onBack);
    expect(env.history.state).toMatchObject({ router: { route: '/catalog', scroll: 150 }, arbitrary: 42 });
    const first = session.close();
    expect(session.close()).toBe(first);
    await first;
    expect(env.index).toBe(0);
    expect(env.listeners).toBe(0);
    expect(onBack).not.toHaveBeenCalled();
    await session.close();
    expect(env.index).toBe(0);
  });

  it('system Back ends the session and Forward never reopens the panel', async () => {
    const env = sandbox();
    const onBack = vi.fn();
    const session = await createHistoryOverlayAdapter(env.target).enterOverlay(onBack);
    env.history.back();
    await Promise.resolve();
    expect(onBack).toHaveBeenCalledTimes(1);
    await session.close();
    env.history.forward();
    await Promise.resolve();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(env.listeners).toBe(0);
  });

  it('does not roll back a route that the shop pushed while open', async () => {
    const env = sandbox();
    const session = await createHistoryOverlayAdapter(env.target).enterOverlay(vi.fn());
    env.history.pushState({ router: { route: '/product/pikachu' } });
    await session.close();
    expect(env.index).toBe(2);
    expect(env.history.state).toEqual({ router: { route: '/product/pikachu' } });
    expect(env.listeners).toBe(0);
  });

  it('does not treat a copied marker on another URL as its own overlay', async () => {
    const env = sandbox();
    const session = await createHistoryOverlayAdapter(env.target).enterOverlay(vi.fn());
    const copied = { ...(env.history.state as Record<string, unknown>), route: '/product/pikachu' };
    env.history.pushState(copied);
    env.target.location.href = 'https://shop.example/product/pikachu';
    await session.close();
    expect(env.index).toBe(2);
    expect(env.history.state).toEqual(copied);
    expect(env.listeners).toBe(0);
  });

  it('twenty open/close cycles do not accumulate intermediate history entries', async () => {
    const env = sandbox();
    const adapter = createHistoryOverlayAdapter(env.target);
    for (let i = 0; i < 20; i++) {
      const session = await adapter.enterOverlay(vi.fn());
      await session.close();
    }
    expect(env.index).toBe(0);
    expect(env.entries).toHaveLength(2);
    env.history.pushState({ route: '/product' });
    expect(env.entries).toHaveLength(2);
    expect(env.listeners).toBe(0);
  });
});
