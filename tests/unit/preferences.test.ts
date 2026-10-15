import { describe, expect, it, vi } from 'vitest';
import { createPreferencesStore, PREFERENCES_KEY } from '../../src/storage/preferences';

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  fail = false;
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { if (this.fail) throw new Error('Storage disabled'); return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.fail) throw new Error('Storage disabled'); this.values.set(key, value); }
  removeItem(key: string) { if (this.fail) throw new Error('Storage disabled'); this.values.delete(key); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
}

describe('preferences store', () => {
  it('persists only preferences and reads them on the next page', () => {
    const storage = new MemoryStorage();
    const first = createPreferencesStore({ persistentSettings: true, storage });
    first.update({ hidden: true, motion: 'off', lastGreetingAt: 1234 });
    first.destroy();
    const second = createPreferencesStore({ persistentSettings: true, storage });
    expect(second.get()).toEqual({ schemaVersion: 1, hidden: true, motion: 'off', lastGreetingAt: 1234 });
    expect(Object.keys(JSON.parse(storage.getItem(PREFERENCES_KEY)!))).toEqual(['schemaVersion', 'hidden', 'motion', 'lastGreetingAt']);
    second.destroy();
  });

  it('uses page memory without permission and never writes foreign keys', () => {
    const storage = new MemoryStorage();
    storage.setItem('shop:cart', 'private');
    const store = createPreferencesStore({ persistentSettings: false, storage });
    store.update({ hidden: true });
    expect(store.persistent).toBe(false);
    expect(store.get().hidden).toBe(true);
    expect(storage.getItem(PREFERENCES_KEY)).toBeNull();
    expect(storage.getItem('shop:cart')).toBe('private');
    store.destroy();
  });

  it('survives denied reads and writes', () => {
    const storage = new MemoryStorage();
    storage.fail = true;
    const store = createPreferencesStore({ persistentSettings: true, storage });
    expect(store.persistent).toBe(false);
    expect(() => store.update({ motion: 'off' })).not.toThrow();
    expect(store.get().motion).toBe('off');
    store.destroy();
  });

  it('ignores a nonserializable update without throwing or losing existing settings', () => {
    const store = createPreferencesStore({ persistentSettings: false, storage: null });
    store.update({ hidden: true });
    expect(() => store.update({ lastGreetingAt: BigInt(1) as unknown as number })).not.toThrow();
    expect(store.get()).toEqual({ schemaVersion: 1, hidden: true, motion: 'system', lastGreetingAt: null });
    store.destroy();
  });

  it('removes a corrupted own record', () => {
    const storage = new MemoryStorage();
    storage.setItem(PREFERENCES_KEY, '{bad json');
    const store = createPreferencesStore({ persistentSettings: true, storage });
    expect(store.get().hidden).toBe(false);
    expect(storage.getItem(PREFERENCES_KEY)).toBeNull();
    store.destroy();
  });

  it('removes its own persistent record on consent withdrawal and retains memory', () => {
    const storage = new MemoryStorage();
    const store = createPreferencesStore({ persistentSettings: true, storage });
    store.update({ hidden: true });
    store.setPermission(false);
    expect(storage.getItem(PREFERENCES_KEY)).toBeNull();
    expect(store.get().hidden).toBe(true);
    expect(store.persistent).toBe(false);
    store.setPermission(true);
    expect(JSON.parse(storage.getItem(PREFERENCES_KEY)!).hidden).toBe(true);
    store.destroy();
  });

  it('responds to only its storage key and removes the event listener on destroy', () => {
    const storage = new MemoryStorage();
    const onChange = vi.fn();
    const store = createPreferencesStore({ persistentSettings: true, storage, onChange });
    const send = (key: string, newValue: string) => {
      const event = new Event('storage');
      Object.assign(event, { key, newValue, storageArea: null });
      window.dispatchEvent(event);
    };
    send('shop:cart', '{}');
    expect(onChange).not.toHaveBeenCalled();
    send(PREFERENCES_KEY, JSON.stringify({ schemaVersion: 1, hidden: true, motion: 'off', lastGreetingAt: null }));
    expect(store.get().hidden).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    store.destroy();
    send(PREFERENCES_KEY, '{}');
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
