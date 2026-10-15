import type { AssistantPreferences } from '../config/types';
import { isRecord } from '../config/validate';

export const PREFERENCES_KEY = 'animeShopAssistant:v1:preferences';

function defaults(): AssistantPreferences {
  return { schemaVersion: 1, hidden: false, motion: 'system', lastGreetingAt: null };
}

function decode(value: string | null): AssistantPreferences | null {
  if (value === null) return defaults();
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || parsed.schemaVersion !== 1 || typeof parsed.hidden !== 'boolean' ||
        !['system', 'off'].includes(String(parsed.motion)) ||
        !(parsed.lastGreetingAt === null || (typeof parsed.lastGreetingAt === 'number' &&
          Number.isFinite(parsed.lastGreetingAt) && parsed.lastGreetingAt >= 0))) return null;
    return { schemaVersion: 1, hidden: parsed.hidden, motion: parsed.motion as 'system' | 'off', lastGreetingAt: parsed.lastGreetingAt as number | null };
  } catch { return null; }
}

export interface PreferencesStoreOptions {
  persistentSettings: boolean;
  storage?: Storage | null;
  eventTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  onChange?: (preferences: AssistantPreferences) => void;
}

export interface PreferencesStore {
  readonly persistent: boolean;
  get(): AssistantPreferences;
  update(patch: Partial<Omit<AssistantPreferences, 'schemaVersion'>>): AssistantPreferences;
  setPermission(allowed: boolean): void;
  destroy(): void;
}

export function createPreferencesStore(options: PreferencesStoreOptions): PreferencesStore {
  let storage: Storage | null = options.storage ?? null;
  if (options.storage === undefined) {
    try { storage = typeof window !== 'undefined' ? window.localStorage : null; } catch { storage = null; }
  }
  let allowed = options.persistentSettings;
  let persistent = allowed && storage !== null;
  let current = defaults();
  let destroyed = false;
  const target = options.eventTarget ?? (typeof window !== 'undefined' ? window : undefined);
  const notify = () => {
    if (destroyed) return;
    try { options.onChange?.({ ...current }); } catch { /* Consumer failures cannot break storage. */ }
  };
  const removeOwn = () => { try { storage?.removeItem(PREFERENCES_KEY); } catch { /* Best effort. */ } };
  const read = () => {
    if (!persistent || !storage) return;
    try {
      const parsed = decode(storage.getItem(PREFERENCES_KEY));
      current = parsed ?? defaults();
      if (!parsed) removeOwn();
    } catch { persistent = false; }
  };
  read();
  const onStorage = (event: StorageEvent) => {
    if (destroyed || !persistent || event.key !== PREFERENCES_KEY ||
        (event.storageArea !== null && event.storageArea !== storage)) return;
    const parsed = decode(event.newValue);
    current = parsed ?? defaults();
    if (!parsed) removeOwn();
    notify();
  };
  target?.addEventListener('storage', onStorage);
  return {
    get persistent() { return !destroyed && persistent; },
    get() { return { ...current }; },
    update(patch) {
      if (destroyed) return { ...current };
      let candidate: AssistantPreferences | null;
      try { candidate = decode(JSON.stringify({ ...current, ...patch, schemaVersion: 1 })); }
      catch { return { ...current }; }
      if (!candidate) return { ...current };
      current = candidate;
      if (persistent && storage) {
        try { storage.setItem(PREFERENCES_KEY, JSON.stringify(current)); } catch { persistent = false; }
      }
      notify();
      return { ...current };
    },
    setPermission(next) {
      if (destroyed || next === allowed) return;
      allowed = next;
      if (!next) {
        removeOwn();
        persistent = false;
      } else {
        persistent = storage !== null;
        if (persistent && storage) {
          try { storage.setItem(PREFERENCES_KEY, JSON.stringify(current)); } catch { persistent = false; }
        }
      }
      notify();
    },
    destroy() {
      destroyed = true;
      target?.removeEventListener('storage', onStorage);
    },
  };
}
