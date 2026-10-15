import type { Viewport } from './viewport';

interface Actor { left: number; top: number; size: number }
interface Bubble { width: number; height: number }
export interface SpeechPlacement { left: number; top: number; visible: boolean }

/** Keep speech inside the visible window and clear of the character and canopy. */
export function calculateSpeechPlacement(viewport: Viewport, actor: Actor, bubble: Bubble,
  canopy: boolean, preferredLeft = actor.left): SpeechPlacement {
  const gap = 12;
  const minimumLeft = viewport.left + gap;
  const minimumTop = viewport.top + gap;
  const maximumLeft = viewport.left + viewport.width - gap - bubble.width;
  const maximumTop = viewport.top + viewport.height - gap - bubble.height;
  const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(value, maximum));
  const left = clamp(preferredLeft, minimumLeft, maximumLeft);
  const top = actor.top - (canopy ? actor.size * .5 : 0);
  const right = actor.left + actor.size;
  const bottom = actor.top + actor.size;
  const sideTop = clamp(actor.top - bubble.height / 2, minimumTop, maximumTop);
  const sides = [
    { left: right + gap, top: sideTop },
    { left: actor.left - gap - bubble.width, top: sideTop },
  ];
  if (actor.left + actor.size / 2 > viewport.left + viewport.width / 2) sides.reverse();
  const candidates = [
    { left, top: top - gap - bubble.height },
    ...sides,
    { left, top: bottom + gap },
  ];
  for (const candidate of candidates) {
    const inside = candidate.left >= minimumLeft && candidate.left <= maximumLeft &&
      candidate.top >= minimumTop && candidate.top <= maximumTop;
    const separated = candidate.left + bubble.width <= actor.left - gap || candidate.left >= right + gap ||
      candidate.top + bubble.height <= top - gap || candidate.top >= bottom + gap;
    if (inside && separated) return { ...candidate, visible: true };
  }
  return { left, top: minimumTop, visible: false };
}
