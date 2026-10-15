import { beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { GUITAR_CLIP, renderGuitarFrame } from '../../assets/source/guitar.mjs';
import { mohlikBody, personalityPose, renderFrame } from '../../assets/source/mohlik.mjs';

const xml = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml');
const frames = Array.from({ length: GUITAR_CLIP.count }, (_, frame) => renderGuitarFrame(frame));
let samples: { hash: string; left: number; right: number; top: number; bottom: number }[];

beforeAll(async () => {
  samples = await Promise.all(frames.map(async (svg) => {
    const expanded = svg.replace('width="192" height="192" viewBox="0 0 192 192"',
      'width="256" height="256" viewBox="-32 -32 256 256"');
    const { data, info } = await sharp(Buffer.from(expanded)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let left = 256, top = 256, right = -1, bottom = -1;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      if (data[(y*info.width+x)*4+3]! <= 8) continue;
      left = Math.min(left,x-32); right = Math.max(right,x-32);
      top = Math.min(top,y-32); bottom = Math.max(bottom,y-32);
    }
    return { hash: createHash('sha256').update(data).digest('hex'), left, right, top, bottom };
  }));
}, 15000);

describe('electric guitar performance', () => {
  it('finishes at neutral after front playing, a turn, the existing rear wag, and stowing', () => {
    expect(frames[0]).toBe(renderFrame());
    expect(frames.at(-1)).toBe(renderFrame());
    expect(GUITAR_CLIP.count/GUITAR_CLIP.fps).toBe(9.5);
    const phases = frames.flatMap((frame) => {
      const phase = xml(frame).querySelector('[data-phase]')?.getAttribute('data-phase');
      return phase ? [phase] : [];
    });
    expect([...new Set(phases)]).toEqual(['reach','draw','settle','play','turn-back','play-back','turn-front','finish','stow','return']);
    expect(new Set(samples.map((sample) => sample.hash)).size).toBeGreaterThanOrEqual(60);
  });

  it('keeps the guitar, paws, notes and ears within the cell without hidden clipping', () => {
    samples.forEach((sample, frame) => {
      expect(sample.left, String(frame)).toBeGreaterThanOrEqual(3);
      expect(sample.top, String(frame)).toBeGreaterThanOrEqual(3);
      expect(sample.right, String(frame)).toBeLessThanOrEqual(188);
      expect(sample.bottom, String(frame)).toBeLessThanOrEqual(188);
      expect(xml(frames[frame]!).querySelector('parsererror'),String(frame)).toBeNull();
    });
  });

  it('draws six strings, six tuners, pickups and a bridge, with separate fretting and strumming paws', () => {
    const playing = xml(renderGuitarFrame(25));
    expect(playing.querySelectorAll('[data-part="guitar-strings"] path')).toHaveLength(6);
    expect(playing.querySelectorAll('[data-part="guitar-tuners"] rect')).toHaveLength(6);
    expect(playing.querySelectorAll('[data-part="guitar-pickups"] rect')).toHaveLength(3);
    expect(playing.querySelector('[data-part="guitar-bridge"]')).not.toBeNull();
    const neutral = xml(renderFrame());
    for (const [gesture,side] of [['guitar-fret','right'],['guitar-strum','left']]) {
      expect(playing.querySelector(`[data-gesture="${gesture}"] [data-part="arm-${side}"] path`)!.getAttribute('d'))
        .toBe(neutral.querySelector(`[data-part="arm-${side}"] path`)!.getAttribute('d'));
    }
    expect(playing.querySelector('[data-part="guitar-pick"]')).not.toBeNull();
  });

  it('reuses the original rear poses and keeps the guitar behind the back and tail', () => {
    for (let frame = 46; frame <= 53; frame++) {
      const saved = [10,11,12,11][(frame-45)%4]!;
      const original = xml(`<svg xmlns="http://www.w3.org/2000/svg">${mohlikBody(personalityPose(saved))}</svg>`);
      const scene = xml(renderGuitarFrame(frame));
      for (const part of ['continuous-silhouette','back-leaf-tail','foot-left','foot-right','head']) {
        const oldPart = original.querySelector(`[data-part="${part}"]`);
        expect(oldPart,part).not.toBeNull();
        expect(scene.querySelector(`[data-part="${part}"]`)!.outerHTML).toBe(oldPart!.outerHTML);
      }
      expect(scene.querySelector('[data-part="face"]')).toBeNull();
      const actor = scene.querySelector('[data-character="mohlik"]')!;
      expect(actor.previousElementSibling?.querySelector('[data-prop="electric-guitar"]')).not.toBeNull();
    }
  });

  it('rejects frames outside the finite scene', () => {
    for (const frame of [-1,.5,GUITAR_CLIP.count,NaN]) expect(() => renderGuitarFrame(frame)).toThrow('Unknown guitar frame');
  });
});
