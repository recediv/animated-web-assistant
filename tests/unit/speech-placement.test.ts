import { describe, expect, it } from 'vitest';
import { calculateSpeechPlacement } from '../../src/positioning/speech';
import type { Viewport } from '../../src/positioning/viewport';

interface Actor {
  left: number;
  top: number;
  size: number;
}
interface Bubble {
  width: number;
  height: number;
}

function expectSafe(
  viewport: Viewport,
  actor: Actor,
  bubble: Bubble,
  canopy = true,
  preferredLeft?: number,
) {
  const result = calculateSpeechPlacement(viewport, actor, bubble, canopy, preferredLeft);
  expect(result.visible).toBe(true);
  expect(result.left).toBeGreaterThanOrEqual(viewport.left + 12);
  expect(result.top).toBeGreaterThanOrEqual(viewport.top + 12);
  expect(result.left + bubble.width).toBeLessThanOrEqual(viewport.left + viewport.width - 12);
  expect(result.top + bubble.height).toBeLessThanOrEqual(viewport.top + viewport.height - 12);
  // Compare complete rectangles, including the canopy above the body.
  const footprint = {
    left: actor.left,
    top: actor.top - (canopy ? actor.size * 0.5 : 0),
    right: actor.left + actor.size,
    bottom: actor.top + actor.size,
  };
  const separated =
    result.left + bubble.width <= footprint.left - 12 ||
    result.left >= footprint.right + 12 ||
    result.top + bubble.height <= footprint.top - 12 ||
    result.top >= footprint.bottom + 12;
  expect(separated).toBe(true);
  return result;
}

describe('speech placement around a parachute', () => {
  it('prefers the space above the entire canopy when it fits', () => {
    const actor = { left: 640, top: 480, size: 96 };
    const bubble = { width: 252, height: 80 };
    const result = expectSafe({ left: 0, top: 0, width: 1200, height: 800 }, actor, bubble);
    expect(result.top + bubble.height).toBe(actor.top - actor.size * 0.5 - 12);
  });

  it('uses a side when the canopy touches the top and horizontal space remains', () => {
    const actor = { left: 240, top: 12, size: 96 };
    const bubble = { width: 252, height: 80 };
    const result = expectSafe({ left: 0, top: 0, width: 1200, height: 800 }, actor, bubble);
    expect(
      result.left >= actor.left + actor.size + 12 || result.left + bubble.width <= actor.left - 12,
    ).toBe(true);
  });

  it('puts a wide compact bubble below the character when neither side fits', () => {
    const actor = { left: 128, top: 12, size: 64 };
    const bubble = { width: 252, height: 80 };
    const result = expectSafe({ left: 0, top: 0, width: 320, height: 568 }, actor, bubble);
    expect(result.top).toBeGreaterThanOrEqual(actor.top + actor.size + 12);
  });

  for (const [profile, viewport, size] of [
    ['desktop', { left: 0, top: 0, width: 1024, height: 768 }, 96],
    ['compact 320px', { left: 0, top: 0, width: 320, height: 568 }, 64],
  ] as const) {
    for (const edge of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const) {
      it(`keeps the bubble and complete canopy separate at ${edge} on ${profile}`, () => {
        expectSafe(
          viewport,
          {
            left: edge.endsWith('right') ? viewport.width - size - 12 : 12,
            top: edge.startsWith('bottom') ? viewport.height - size - 12 : 12,
            size,
          },
          { width: 252, height: 80 },
        );
      });
    }
  }

  it('uses visualViewport offsets rather than treating its origin as zero', () => {
    const viewport = { left: 240, top: 180, width: 560, height: 420 };
    const actor = { left: 692, top: 192, size: 96 };
    const bubble = { width: 252, height: 80 };
    const result = expectSafe(viewport, actor, bubble);
    expect(result.left + bubble.width).toBeLessThanOrEqual(actor.left - 12);
  });

  it('keeps a moving canopy unobstructed throughout a compact descent', () => {
    const viewport = { left: 40, top: 80, width: 320, height: 568 };
    for (const top of [70, 92, 120, 160, 240, 400, 560]) {
      expectSafe(viewport, { left: 168, top, size: 64 }, { width: 252, height: 80 });
    }
  });

  it('hides the bubble when no non-overlapping viewport region can contain it', () => {
    const result = calculateSpeechPlacement(
      { left: 0, top: 0, width: 160, height: 150 },
      { left: 32, top: 50, size: 96 },
      { width: 136, height: 60 },
      true,
    );
    expect(result.visible).toBe(false);
    expect(Number.isFinite(result.left)).toBe(true);
    expect(Number.isFinite(result.top)).toBe(true);
  });

  it('hides an oversized bubble even when the actor itself fits', () => {
    const result = calculateSpeechPlacement(
      { left: 20, top: 30, width: 320, height: 568 },
      { left: 160, top: 400, size: 64 },
      { width: 310, height: 80 },
      true,
    );
    expect(result.visible).toBe(false);
  });

  it('preserves the ordinary above position and avoids the body near the top', () => {
    const viewport = { left: 40, top: 80, width: 320, height: 568 };
    const bubble = { width: 252, height: 80 };
    const normal = expectSafe(viewport, { left: 168, top: 400, size: 64 }, bubble, false);
    expect(normal.top).toBe(400 - 12 - bubble.height);
    const atTop = expectSafe(viewport, { left: 168, top: 92, size: 64 }, bubble, false);
    expect(atTop.top).toBeGreaterThanOrEqual(92 + 64 + 12);
  });

  it('uses safe horizontal space for the ordinary character near the top', () => {
    const actor = { left: 420, top: 12, size: 96 };
    const bubble = { width: 252, height: 80 };
    const result = expectSafe({ left: 0, top: 0, width: 1200, height: 800 }, actor, bubble, false);
    expect(
      result.left >= actor.left + actor.size + 12 || result.left + bubble.width <= actor.left - 12,
    ).toBe(true);
  });

  it('retains a preferred horizontal position when the above region can contain it', () => {
    const result = expectSafe(
      { left: 40, top: 80, width: 800, height: 568 },
      { left: 420, top: 400, size: 96 },
      { width: 252, height: 80 },
      true,
      100,
    );
    expect(result.left).toBe(100);
  });

  it('clamps an off-screen preferred position without sacrificing actor separation', () => {
    const viewport = { left: 40, top: 80, width: 320, height: 568 };
    const actor = { left: 168, top: 400, size: 64 };
    const bubble = { width: 252, height: 80 };
    expect(expectSafe(viewport, actor, bubble, true, -1000).left).toBe(viewport.left + 12);
    expect(expectSafe(viewport, actor, bubble, true, 1000).left + bubble.width).toBe(
      viewport.left + viewport.width - 12,
    );
  });
});
