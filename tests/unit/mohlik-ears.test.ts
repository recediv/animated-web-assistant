import { beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { mohlikBody, mohlikDefs, poseFor } from '../../assets/source/mohlik.mjs';

type Side = 'left' | 'right';
interface EarSample {
  side: Side;
  fold: number;
  solid: Uint8Array;
  area: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const sides: Side[] = ['left', 'right'];
const folds = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
const size = 256;
let samples: EarSample[];

function ear(side: Side, fold: number) {
  const pose = {
    ...poseFor('idle', 0),
    earFoldLeft: side === 'left' ? fold : 0,
    earFoldRight: side === 'right' ? fold : 0,
  };
  const document = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${mohlikBody(pose)}</svg>`,
    'image/svg+xml',
  );
  return document.querySelector(`[data-part="leaf-ear-${side}"]`)!;
}

beforeAll(async () => {
  samples = await Promise.all(
    sides.flatMap((side) =>
      folds.map(async (fold) => {
        // Expanded rendering detects a tip that escaped the cell instead of
        // letting the nominal SVG viewport silently clip it away.
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="-32 -32 256 256">${mohlikDefs()}<g fill="url(#mohlik-fur)" stroke="#55714b" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">${ear(side, fold).outerHTML}</g></svg>`;
        const { data, info } = await sharp(Buffer.from(svg))
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const solid = new Uint8Array(size * size);
        let area = 0;
        let left = size;
        let top = size;
        let right = -1;
        let bottom = -1;
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            if (data[(y * size + x) * info.channels + 3]! <= 8) continue;
            solid[y * size + x] = 1;
            area++;
            left = Math.min(left, x - 32);
            top = Math.min(top, y - 32);
            right = Math.max(right, x - 32);
            bottom = Math.max(bottom, y - 32);
          }
        }
        return { side, fold, solid, area, left, top, right, bottom };
      }),
    ),
  );
});

describe('Mohlik leaf ear folds', () => {
  it('preserves the accepted upright contours and omits fold seams at zero bend', () => {
    const upright = {
      left: 'M55 74 Q39 48 47 14 Q67 24 76 58 L75 74Z',
      right: 'M116 72 Q119 31 143 14 Q157 43 137 74Z',
    };
    for (const side of sides) {
      const group = ear(side, 0);
      expect(group.querySelector(':scope > path')?.getAttribute('d')).toBe(upright[side]);
      expect(group.querySelector('[data-part^="ear-bend-"]')).toBeNull();
    }
  });

  it.each(sides)('keeps the %s leaf filled through every intermediate bend', (side) => {
    for (const sample of samples.filter((entry) => entry.side === side)) {
      const seen = new Uint8Array(size * size);
      const queue: number[] = [];
      for (let x = 0; x < size; x++) queue.push(x, (size - 1) * size + x);
      for (let y = 0; y < size; y++) queue.push(y * size, y * size + size - 1);
      // Flood-fill only transparent pixels connected to the outer background.
      // A self-crossing outline can enclose an otherwise invisible alpha hole.
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const pixel = queue[cursor]!;
        if (sample.solid[pixel] || seen[pixel]) continue;
        seen[pixel] = 1;
        const x = pixel % size;
        const y = Math.floor(pixel / size);
        if (x > 0) queue.push(pixel - 1);
        if (x < size - 1) queue.push(pixel + 1);
        if (y > 0) queue.push(pixel - size);
        if (y < size - 1) queue.push(pixel + size);
      }
      let holes = 0;
      for (let pixel = 0; pixel < sample.solid.length; pixel++) {
        if (!sample.solid[pixel] && !seen[pixel]) holes++;
      }
      expect(holes, `${side}/${sample.fold}`).toBe(0);
    }
  });

  it('retains a broad attached base and full leaf volume inside the cell', () => {
    for (const sample of samples) {
      const neutral = samples.find((entry) => entry.side === sample.side && entry.fold === 0)!;
      expect(sample.area / neutral.area, `${sample.side}/${sample.fold}`).toBeGreaterThan(0.85);
      expect(sample.area / neutral.area).toBeLessThan(1.2);
      expect(sample.left).toBeGreaterThanOrEqual(3);
      expect(sample.top).toBeGreaterThanOrEqual(3);
      expect(sample.right).toBeLessThanOrEqual(188);
      expect(sample.bottom).toBeLessThanOrEqual(188);
      const rootX = sample.side === 'left' ? 64 : 126;
      for (let y = 66; y <= 71; y++) {
        for (let x = rootX - 3; x <= rootX + 3; x++) {
          expect(sample.solid[(y + 32) * size + x + 32], `${sample.side} root at ${x},${y}`).toBe(
            1,
          );
        }
      }
    }
  });
});
