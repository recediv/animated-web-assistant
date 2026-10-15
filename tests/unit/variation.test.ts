import { beforeEach, describe, expect, it } from 'vitest';
import { PersonalityVariation, PERSONALITY_SESSION_KEY, REPLIES } from '../../src/core/variation';

beforeEach(() => sessionStorage.clear());

describe('session personality variety', () => {
  it('shows each entrance and autonomous scene before repeating, without a repeat at the deck boundary', () => {
    const variety = new PersonalityVariation({ random: () => .4 });
    const arrivals = Array.from({ length: 8 }, () => variety.arrival());
    const scenes = Array.from({ length: 8 }, () => variety.scene());
    expect(new Set(arrivals.slice(0, 4)).size).toBe(4);
    expect(new Set(scenes.slice(0, 4)).size).toBe(4);
    expect(arrivals[3]).not.toBe(arrivals[4]);
    expect(scenes[3]).not.toBe(scenes[4]);
  });

  it('uses different starting scenes and sides with different random seeds', () => {
    const first = new PersonalityVariation({ random: () => 0 });
    const second = new PersonalityVariation({ random: () => .99 });
    expect(first.arrival()).not.toBe(second.arrival());
    expect(first.scene()).not.toBe(second.scene());
  });

  it('continues entrance and reply decks after a full reload when session preferences are allowed', () => {
    const first = new PersonalityVariation({ permission: true, random: () => .99 });
    const arrival = first.arrival();
    const reply = first.reply('pet');
    const reloaded = new PersonalityVariation({ permission: true, random: () => .99 });
    expect(reloaded.arrival()).not.toBe(arrival);
    expect(reloaded.reply('pet')).not.toBe(reply);
    expect(sessionStorage.getItem(PERSONALITY_SESSION_KEY)).not.toBeNull();
  });

  it('varies responses to the same action through the whole deck', () => {
    const variety = new PersonalityVariation({ random: () => .2 });
    for (const kind of Object.keys(REPLIES) as Array<keyof typeof REPLIES>) {
      const replies = Array.from({ length: REPLIES[kind].length }, () => variety.reply(kind));
      expect(new Set(replies).size).toBe(REPLIES[kind].length);
      expect(variety.reply(kind)).not.toBe(replies.at(-1));
    }
  });

  it('does not persist without permission and removes only its own session record on withdrawal', () => {
    sessionStorage.setItem('shop-session', 'keep');
    const memory = new PersonalityVariation(); memory.arrival();
    expect(sessionStorage.getItem(PERSONALITY_SESSION_KEY)).toBeNull();
    memory.setPermission(true); memory.reply('drag');
    expect(sessionStorage.getItem(PERSONALITY_SESSION_KEY)).not.toBeNull();
    memory.setPermission(false);
    expect(sessionStorage.getItem(PERSONALITY_SESSION_KEY)).toBeNull();
    expect(sessionStorage.getItem('shop-session')).toBe('keep');
  });

  it('recovers from corrupt session decks and a storage exception', () => {
    sessionStorage.setItem(PERSONALITY_SESSION_KEY, JSON.stringify({ schema: 1, decks: { arrival: { remaining: ['bogus'], last: 'bogus' } } }));
    const corrupted = new PersonalityVariation({ permission: true });
    expect(['left', 'right', 'top', 'bottom']).toContain(corrupted.arrival());
    const broken = { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Blocked'); }, removeItem() { throw new Error('Blocked'); } } as unknown as Storage;
    const memory = new PersonalityVariation({ permission: true, storage: broken });
    expect(() => { memory.arrival(); memory.reply('pet'); memory.setPermission(false); }).not.toThrow();
  });
});
