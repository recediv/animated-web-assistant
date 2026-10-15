import { describe, expect, it, vi } from 'vitest';
import { createDemoAdapter } from '../../src/adapters/demo';
import type { ShopEvent } from '../../src/config/types';

describe('demo adapter', () => {
  it('publishes the authoritative context before confirmed addition', () => {
    const adapter = createDemoAdapter();
    const events: ShopEvent[] = [];
    const unsubscribe = adapter.subscribe((event) => events.push(event));
    adapter.confirmCartAdd('operation-1', 2);
    expect(events[0]).toMatchObject({ type: 'context', context: { cartCount: 2, revision: 1 } });
    expect(events[1]).toMatchObject({ type: 'cart:added', id: 'operation-1', quantity: 2 });
    expect(adapter.subscriberCount).toBe(1);
    unsubscribe();
    unsubscribe();
    expect(adapter.subscriberCount).toBe(0);
  });

  it('does not fabricate a count when cart state is unknown', () => {
    const adapter = createDemoAdapter({ context: { cartCount: null } });
    adapter.confirmCartAdd('operation-1', 1);
    expect(adapter.getContext().cartCount).toBeNull();
  });

  it('merges complete blocker state without sharing mutable snapshots', () => {
    const adapter = createDemoAdapter();
    adapter.update({ ui: { bottomReservedPx: 80, blockers: ['search', 'cookie-modal'] } });
    adapter.update({ ui: { blockers: ['cookie-modal'] } });
    const snapshot = adapter.getContext();
    snapshot.ui.blockers.length = 0;
    expect(adapter.getContext().ui.blockers).toEqual(['cookie-modal']);
    expect(adapter.getContext().ui.bottomReservedPx).toBe(80);
    adapter.setPage('product', '/product/1');
    expect(adapter.getContext()).toMatchObject({ revision: 3, pageType: 'product', pageKey: '/product/1' });
  });

  it('delegates navigation and cart opening to the demo store', () => {
    const navigate = vi.fn();
    const openCart = vi.fn();
    const adapter = createDemoAdapter({ navigate, openCart });
    adapter.navigate('/catalog');
    adapter.openCart();
    expect(navigate).toHaveBeenCalledWith('/catalog');
    expect(openCart).toHaveBeenCalledOnce();
  });
});
