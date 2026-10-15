import { beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import * as mohlik from '../../assets/source/mohlik.mjs';
import * as sharedMotion from '../../assets/source/motion-poses.mjs';
import type { MotionClip, ExtraMotionClip } from '../../assets/source/motion-poses.mjs';

interface Drawing {
  name: string;
  svg: string;
  personality?: number;
  headOnly?: boolean;
}

interface Sample extends Drawing {
  left: number;
  top: number;
  right: number;
  bottom: number;
  paintedPixels: number;
  eyeSpan: number;
  hash: string;
}

const basicNames = Object.keys(mohlik.CLIPS) as MotionClip[];
const extraNames = Object.keys(mohlik.EXTRA_CLIPS) as ExtraMotionClip[];
const drawings: Drawing[] = [
  ...basicNames.flatMap((clip) =>
    Array.from({ length: mohlik.CLIPS[clip].count }, (_, frame) => ({
      name: `${clip}/${frame}`,
      svg: mohlik.renderFrame(clip, frame),
    })),
  ),
  ...mohlik.LOOK_POSES.map((name) => ({ name: `look/${name}`, svg: mohlik.renderPose(name) })),
  ...extraNames.flatMap((clip) =>
    Array.from({ length: mohlik.EXTRA_CLIPS[clip].count }, (_, frame) => ({
      name: `extra/${clip}/${frame}`,
      svg: mohlik.renderExtraFrame(clip, frame),
    })),
  ),
  ...mohlik.PERSONALITY_FRAMES.map((_, index) => ({
    name: `personality/${index}`,
    svg: mohlik.renderPersonalityFrame(index),
    personality: index,
  })),
  ...([0, 1] as const).map((frame) => ({
    name: `head-peek/${frame}`,
    svg: mohlik.renderHeadPeekFrame(frame),
    headOnly: true,
  })),
  ...(Object.keys(mohlik.CALM_CLIPS) as mohlik.MohlikCalmClip[]).flatMap((name) =>
    Array.from({ length: mohlik.CALM_CLIPS[name].count }, (_, frame) => ({
      name: `leisure/${name}/${frame}`,
      svg: mohlik.renderCalmFrame(name, frame),
    })),
  ),
  ...(Object.keys(mohlik.PUSH_CLIPS) as mohlik.MohlikPushClip[]).flatMap((name) =>
    Array.from({ length: mohlik.PUSH_CLIPS[name].count }, (_, frame) => ({
      name: `push/${name}/${frame}`,
      svg: mohlik.renderPushFrame(name, frame),
    })),
  ),
];
let samples: Sample[];

beforeAll(async () => {
  samples = await Promise.all(
    drawings.map(async (drawing) => {
      // Render outside the nominal cell too: a clipped SVG could otherwise hide
      // an escaping ear or paw and falsely pass a 192px-only boundary check.
      const expanded = drawing.svg.replace(
        'width="192" height="192" viewBox="0 0 192 192"',
        'width="256" height="256" viewBox="-32 -32 256 256"',
      );
      const { data, info } = await sharp(Buffer.from(expanded))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      let left = 256;
      let top = 256;
      let right = -1;
      let bottom = -1;
      let paintedPixels = 0;
      let eyeLeft = 256;
      let eyeRight = -1;
      const headY =
        drawing.personality === undefined ? 0 : mohlik.personalityPose(drawing.personality).headY;
      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
          const channel = (y * info.width + x) * info.channels;
          if (data[channel + 3]! <= 8) continue;
          paintedPixels++;
          left = Math.min(left, x - 32);
          top = Math.min(top, y - 32);
          right = Math.max(right, x - 32);
          bottom = Math.max(bottom, y - 32);
          if (
            y - 32 >= 78 + headY &&
            y - 32 <= 103 + headY &&
            data[channel]! < 65 &&
            data[channel + 1]! < 50 &&
            data[channel + 2]! < 60
          ) {
            eyeLeft = Math.min(eyeLeft, x);
            eyeRight = Math.max(eyeRight, x);
          }
        }
      }
      return {
        ...drawing,
        left,
        top,
        right,
        bottom,
        paintedPixels,
        eyeSpan: eyeRight - eyeLeft + 1,
        hash: createHash('sha256').update(data).digest('hex'),
      };
    }),
  );
}, 15_000);

const xml = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml');

describe('Mohlik Tropnik vector artwork', () => {
  it('preserves saved basic poses and motions while adding a six-frame rear climb and leisure gestures', () => {
    for (const name of ['CLIPS', 'EXTRA_CLIPS', 'poseFor', 'poseForExtra'] as const) {
      expect(mohlik[name]).toBe(sharedMotion[name]);
    }
    expect(mohlik.LOOK_POSES).toEqual([
      ...sharedMotion.LOOK_POSES,
      'up-left',
      'up-right',
      'push-left',
      'push-right',
    ]);
    expect(drawings).toHaveLength(234);
    expect(mohlik.PERSONALITY_FRAMES).toHaveLength(40);
    for (let frame = 0; frame < 34; frame++)
      expect(mohlik.personalityPose(frame)).toEqual(sharedMotion.personalityPose(frame));
    for (const name of Object.keys(
      sharedMotion.PERSONALITY_CLIPS,
    ) as sharedMotion.PersonalityClip[]) {
      if (name !== 'climb')
        expect(mohlik.PERSONALITY_CLIPS[name]).toEqual(sharedMotion.PERSONALITY_CLIPS[name]);
    }
    expect(mohlik.PERSONALITY_CLIPS.climb).toEqual({
      frames: [34, 35, 36, 37, 38, 39],
      fps: 8,
      end: 'hold',
    });
  });

  it('draws its own forest silhouette, cream face/belly, round eyes and veined leaves', () => {
    const svg = mohlik.renderFrame();
    const document = xml(svg);
    expect(document.querySelector('[data-character="mohlik"]')).not.toBeNull();
    expect(document.querySelector('[data-part="cream-belly"]')).not.toBeNull();
    expect(document.querySelector('[data-part="face"]')).not.toBeNull();
    expect(document.querySelector('[data-part="crown-leaf"]')).not.toBeNull();
    expect(document.querySelector('[data-part="side-leaf-tail"]')).not.toBeNull();
    expect(document.querySelectorAll('g[data-part="eye"]')).toHaveLength(2);
    expect(svg).not.toMatch(/#fa6d58|#ed5349|#4b3b31|#ffdf54|front-tail|back-tail/);
    expect(svg).toContain('#eff2cf');
  });

  it.each(basicNames)(
    'animates actual distinct %s artwork with compatible neutral/sleep transitions',
    (clip) => {
      const definition = mohlik.CLIPS[clip];
      const clipSamples = samples.filter((sample) => sample.name.startsWith(`${clip}/`));
      expect(new Set(clipSamples.map((sample) => sample.hash)).size).toBeGreaterThanOrEqual(
        definition.count - 2,
      );
      if (definition.end === 'neutral')
        expect(mohlik.renderFrame(clip, definition.count - 1)).toBe(mohlik.renderFrame());
      if (clip === 'wake')
        expect(mohlik.renderFrame(clip, 0)).toBe(mohlik.renderFrame('sleep', 11));
    },
  );

  it('blinks both eyes in idle and independently closes one eye in its held wink', () => {
    expect(
      xml(mohlik.renderFrame('idle', 3)).querySelectorAll('path[data-part="eye"]'),
    ).toHaveLength(2);
    expect(
      xml(mohlik.renderFrame('idle', 8)).querySelectorAll('path[data-part="eye"]'),
    ).toHaveLength(2);
    const wink = xml(mohlik.renderPersonalityFrame(21));
    expect(wink.querySelectorAll('path[data-part="eye"]')).toHaveLength(1);
    expect(wink.querySelectorAll('g[data-part="eye"]')).toHaveLength(1);
    expect(
      new Set(
        samples.filter((sample) => sample.name.startsWith('look/')).map((sample) => sample.hash),
      ).size,
    ).toBe(10);
  });

  it('keeps directional gaze geometry fixed and moves only pupils and their highlights', () => {
    const neutral = xml(mohlik.renderFrame());
    const withoutPupils = (document: Document) => {
      for (const eye of document.querySelectorAll('g[data-part="eye"]')) {
        const ellipses = eye.querySelectorAll('ellipse');
        ellipses[1]?.remove();
        ellipses[2]?.remove();
      }
      return document.documentElement.outerHTML;
    };
    const baseline = withoutPupils(neutral);
    for (const name of ['left', 'right', 'up', 'down', 'up-left', 'up-right'] as const) {
      const pose = mohlik.poseForLook(name);
      const document = xml(mohlik.renderPose(name));
      const eyes = [...document.querySelectorAll('g[data-part="eye"]')];
      expect(eyes).toHaveLength(2);
      eyes.forEach((eye, index) => {
        const [white, pupil, highlight] = [...eye.querySelectorAll('ellipse')];
        const x = index === 0 ? 72 : 120;
        const inward = index === 0 ? 1.2 : -1.2;
        expect([Number(white!.getAttribute('cx')), Number(white!.getAttribute('cy'))]).toEqual([
          x,
          90,
        ]);
        expect(Number(pupil!.getAttribute('cx'))).toBeCloseTo(x + inward + pose.gazeX);
        expect(Number(pupil!.getAttribute('cy'))).toBeCloseTo(90.8 + pose.gazeY);
        expect(Number(highlight!.getAttribute('cx'))).toBeCloseTo(x + inward + pose.gazeX - 1.4);
        // Sample the actual pupil contour against its white ellipse. Looking
        // diagonally must not let a dark pupil spill onto the green face.
        for (let step = 0; step < 64; step++) {
          const angle = (step / 64) * Math.PI * 2;
          const px =
            Number(pupil!.getAttribute('cx')) + Number(pupil!.getAttribute('rx')) * Math.cos(angle);
          const py =
            Number(pupil!.getAttribute('cy')) + Number(pupil!.getAttribute('ry')) * Math.sin(angle);
          expect(((px - x) / 11) ** 2 + ((py - 90) / 12.8) ** 2).toBeLessThan(1);
        }
      });
      expect(withoutPupils(document), name).toBe(baseline);
    }
  });

  it('provides distinct fallback walk, wiggle and climb drawings for every main-sheet cell', () => {
    for (const clip of extraNames) {
      const frames = samples.filter((sample) => sample.name.startsWith(`extra/${clip}/`));
      expect(new Set(frames.map((sample) => sample.hash)).size).toBe(
        mohlik.EXTRA_CLIPS[clip].count,
      );
    }
  });

  it('takes twelve visible pushing steps while its unchanged short paws stay anchored to the page', () => {
    const walking = xml(mohlik.renderPersonalityFrame(0));
    const ordinaryPaws = [...walking.querySelectorAll('path')].map((path) =>
      path.getAttribute('d'),
    );
    for (const name of ['push-left', 'push-right'] as const) {
      const frames = Array.from({ length: 12 }, (_, frame) =>
        xml(mohlik.renderPushFrame(name, frame)),
      );
      expect(mohlik.renderPose(name)).toBe(mohlik.renderPushFrame(name, 0));
      expect(mohlik.PUSH_CLIPS[name]).toEqual({ count: 12, fps: 8, end: 'hold' });
      const first = frames[0]!;
      expect(first.querySelectorAll('[data-part="eye"]')).toHaveLength(1);
      const contactGroups = [...first.querySelectorAll('[data-gesture="push-contact"]')].map(
        (part) => part.outerHTML,
      );
      for (const document of frames) {
        for (const part of ['push-paw-near', 'push-paw-far']) {
          const paw = document.querySelector(`[data-part="${part}"]`)!;
          expect(paw.querySelectorAll('path')).toHaveLength(1);
          expect(ordinaryPaws).toContain(paw.querySelector('path')!.getAttribute('d'));
          expect(paw.outerHTML).toBe(first.querySelector(`[data-part="${part}"]`)!.outerHTML);
          expect(paw.closest('[data-gesture="push-effort"]')).toBeNull();
        }
        // Check the whole contact group, not only a local paw transform: a
        // parent rotation must not pull those paw tips away from the page.
        expect(
          [...document.querySelectorAll('[data-gesture="push-contact"]')].map(
            (part) => part.outerHTML,
          ),
        ).toEqual(contactGroups);
        for (const part of ['cream-belly'])
          expect(document.querySelector(`[data-part="${part}"]`)!.getAttribute('d')).toBe(
            first.querySelector(`[data-part="${part}"]`)!.getAttribute('d'),
          );
        expect(document.querySelector('[data-part="head"]')!.innerHTML).toBe(
          first.querySelector('[data-part="head"]')!.innerHTML,
        );
        expect(
          document.querySelector('[data-gesture="push-effort"]')!.getAttribute('transform'),
        ).not.toContain('scale');
      }
      const bodyTransforms = frames.map(
        (document) =>
          document.querySelector('[data-gesture="push-effort"]')!.getAttribute('transform')!,
      );
      const crouch = bodyTransforms.map((transform) =>
        Number(transform.match(/translate\([^ ]+ ([^)]+)/)![1]),
      );
      const lean = bodyTransforms.map((transform) =>
        Number(transform.match(/rotate\(([^ ]+)/)![1]),
      );
      expect(crouch[2]).toBe(4);
      expect(lean[5]).toBeGreaterThan(lean[0]!);
      expect(lean[5]).toBeGreaterThanOrEqual(9);
      expect(lean[11]).toBeLessThan(lean[5]!);
      expect(new Set(bodyTransforms).size).toBe(12);
      for (const side of ['left', 'right']) {
        expect(
          new Set(
            frames.map((document) =>
              document.querySelector(`[data-part="foot-${side}"]`)!.getAttribute('transform'),
            ),
          ).size,
        ).toBeGreaterThanOrEqual(6);
        const transforms = frames.map((document) => {
          const foot = document.querySelector(`[data-part="foot-${side}"]`)!;
          expect(foot.querySelector('path')!.getAttribute('d')).toBe(
            walking.querySelector(`[data-part="foot-${side}"] > path`)!.getAttribute('d'),
          );
          return foot.getAttribute('transform')!.match(/translate\(([^ ]+) ([^)]+)/)!;
        });
        const xs = transforms.map((match) => Number(match[1]));
        const ys = transforms.map((match) => Number(match[2]));
        // At 96px these displacements become a 6px tread and a 3px lift.
        // Visibility comes from separate steps, not from longer sole shapes.
        expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(12);
        expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThanOrEqual(6);
      }
      expect(frames[0]!.querySelector('[data-part="push-effort-mouth"]')).toBeNull();
      expect(frames[4]!.querySelector('[data-part="push-effort-mouth"]')).not.toBeNull();
      const eyeOpenings = frames.map(
        (document) =>
          Number(document.querySelector('[data-part="eye"] > ellipse')!.getAttribute('ry')) / 12.8,
      );
      expect(Math.min(...eyeOpenings)).toBeLessThanOrEqual(0.6);
      expect(eyeOpenings[0]).toBe(1);
      expect(
        new Set(
          samples
            .filter((sample) => sample.name.startsWith(`push/${name}/`))
            .map((sample) => sample.hash),
        ).size,
      ).toBe(12);
    }
  });

  it('mirrors the complete pushing profile while preserving its perceived size', async () => {
    const walking = samples.find((sample) => sample.name === 'personality/0')!;
    for (let frame = 0; frame < 12; frame++) {
      const left = await sharp(Buffer.from(mohlik.renderPushFrame('push-left', frame)))
        .ensureAlpha()
        .raw()
        .toBuffer();
      const mirroredRight = await sharp(Buffer.from(mohlik.renderPushFrame('push-right', frame)))
        .flop()
        .ensureAlpha()
        .raw()
        .toBuffer();
      let difference = 0;
      for (let channel = 0; channel < left.length; channel++)
        difference += Math.abs(left[channel]! - mirroredRight[channel]!);
      // SVG reflection has subpixel antialias differences from raster flop.
      // Their total remains below one tenth of a byte per RGBA channel.
      expect(difference / left.length).toBeLessThan(0.15);
      for (const side of ['left', 'right']) {
        const sample = samples.find((item) => item.name === `push/push-${side}/${frame}`)!;
        expect(sample.paintedPixels / walking.paintedPixels).toBeGreaterThan(0.98);
        expect(sample.paintedPixels / walking.paintedPixels).toBeLessThan(1.05);
        expect(sample.bottom).toBeGreaterThanOrEqual(175);
        expect(sample.bottom).toBeLessThanOrEqual(176);
      }
    }
  });

  it('keeps a single visible spine-mounted leaf tail through rear wiggles and climbing', () => {
    const frames = [
      ...[9, 10, 11, 12, 34, 35, 36, 37, 38, 39].map((index) =>
        mohlik.renderPersonalityFrame(index),
      ),
      ...[0, 1, 2].map((frame) => mohlik.renderExtraFrame('wiggle', frame)),
      ...[0, 1, 2].map((frame) => mohlik.renderExtraFrame('climb', frame)),
    ];
    for (const svg of frames) {
      const document = xml(svg);
      expect(document.querySelectorAll('[data-part="back-leaf-tail"]')).toHaveLength(1);
      expect(document.querySelector('[data-part="side-leaf-tail"]')).toBeNull();
      expect(document.querySelector('[data-part="face"]')).toBeNull();
      expect(document.querySelector('[data-part="eye"]')).toBeNull();
      expect(svg.indexOf('data-part="back-leaf-tail"')).toBeGreaterThan(
        svg.indexOf('data-part="head"'),
      );
    }
  });

  it('climbs with compact rounded paws, alternating a fixed grip and the opposite step', async () => {
    const paintedBounds = async (part: Element, transform = '') => {
      const isolated = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="-32 -32 256 256"><g fill="#c6ddb0" stroke="#55714b" stroke-width="2" stroke-linejoin="round" transform="${transform}">${part.outerHTML}</g></svg>`;
      const { data, info } = await sharp(Buffer.from(isolated))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const bounds = { left: 256, top: 256, right: -1, bottom: -1, pixels: 0 };
      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
          if (data[(y * info.width + x) * info.channels + 3]! <= 8) continue;
          bounds.pixels++;
          bounds.left = Math.min(bounds.left, x - 32);
          bounds.top = Math.min(bounds.top, y - 32);
          bounds.right = Math.max(bounds.right, x - 32);
          bounds.bottom = Math.max(bounds.bottom, y - 32);
        }
      }
      return bounds;
    };
    const frames = [
      ...[34, 35, 36, 37, 38, 39].map((index) => ({
        pose: mohlik.personalityPose(index),
        svg: mohlik.renderPersonalityFrame(index),
      })),
      ...[0, 1, 2].map((frame) => ({
        pose: mohlik.poseForExtra('climb', frame),
        svg: mohlik.renderExtraFrame('climb', frame),
      })),
    ];
    const grips: Array<{ left: number; right: number }> = [];
    for (const { pose, svg } of frames) {
      const document = xml(svg);
      const centers: number[] = [];
      for (const side of ['left', 'right']) {
        const arm = document.querySelector(`[data-part="back-climb-${side}"]`)!;
        const paw = arm.querySelector(`[data-part="climb-paw-${side}"]`)!;
        const limb = await paintedBounds(arm);
        const mitten = await paintedBounds(paw, arm.getAttribute('transform') ?? '');
        const width = mitten.right - mitten.left + 1;
        const height = mitten.bottom - mitten.top + 1;
        expect(width).toBeGreaterThanOrEqual(16);
        expect(width).toBeLessThanOrEqual(21);
        expect(height).toBeGreaterThanOrEqual(18);
        expect(height).toBeLessThanOrEqual(23);
        expect(mitten.pixels / (width * height)).toBeGreaterThan(0.7);
        expect(limb.right - limb.left + 1).toBeLessThanOrEqual(36);
        expect(limb.bottom - limb.top + 1).toBeLessThanOrEqual(42);
        expect(limb.top).toBeGreaterThanOrEqual(86);
        expect(limb.bottom).toBeLessThanOrEqual(129);
        centers.push((mitten.top + mitten.bottom) / 2);
      }
      const [left, right] = centers as [number, number];
      grips.push({ left, right });
      if (left < right) expect(pose.footRightY).toBeLessThan(pose.footLeftY);
      if (right < left) expect(pose.footLeftY).toBeLessThan(pose.footRightY);
      expect(svg.indexOf('data-part="back-leaf-tail"')).toBeLessThan(
        svg.indexOf('data-part="back-climb-left"'),
      );
      expect(pose.backView).toBe(1);
      expect(document.querySelector('[data-part="face"]')).toBeNull();
    }
    // The gripping paw remains anchored while the torso pulls up; the free
    // paw approaches it, then the next three drawings swap their roles.
    expect(new Set(grips.slice(0, 3).map((grip) => grip.left)).size).toBe(1);
    expect(grips[0]!.right).toBeGreaterThan(grips[1]!.right);
    expect(grips[1]!.right).toBeGreaterThan(grips[2]!.right);
    expect(new Set(grips.slice(3, 6).map((grip) => grip.right)).size).toBe(1);
    expect(grips[3]!.left).toBeGreaterThan(grips[4]!.left);
    expect(grips[4]!.left).toBeGreaterThan(grips[5]!.left);
    expect(mohlik.personalityPose(36).climbPull).toBeGreaterThan(
      mohlik.personalityPose(34).climbPull!,
    );
  });

  it('renders a distinct side profile with both stepping legs rather than narrowing the front drawing', () => {
    const frames = Array.from({ length: 6 }, (_, index) =>
      xml(mohlik.renderPersonalityFrame(index)),
    );
    expect(frames.every((document) => document.querySelector('[data-view="profile"]'))).toBe(true);
    expect(
      frames.every((document) => document.querySelectorAll('[data-part="eye"]').length === 1),
    ).toBe(true);
    expect(
      frames.every(
        (document) =>
          document.querySelector('[data-part="foot-left"]') &&
          document.querySelector('[data-part="foot-right"]'),
      ),
    ).toBe(true);
    expect(
      new Set(
        frames.map((document) =>
          document.querySelector('[data-part="foot-left"]')?.getAttribute('transform'),
        ),
      ).size,
    ).toBe(6);
  });

  it('keeps face size throughout pickup/fall/parachute/landing and raises actual parachute paws', () => {
    const neutral = samples.find((sample) => sample.name === 'idle/0')!;
    expect(neutral.eyeSpan).toBeGreaterThan(45);
    for (const sample of samples.filter(
      (entry) =>
        entry.personality !== undefined && entry.personality >= 22 && entry.personality <= 33,
    )) {
      expect(sample.eyeSpan, sample.name).toBeGreaterThanOrEqual(neutral.eyeSpan * 0.93);
      expect(sample.eyeSpan, sample.name).toBeLessThanOrEqual(neutral.eyeSpan * 1.08);
      expect(sample.svg).not.toMatch(/scale\(\.\d+\)/);
    }
    expect(
      xml(mohlik.renderPersonalityFrame(29)).querySelector('[data-part="raised-arms"]'),
    ).not.toBeNull();
    expect(mohlik.renderPersonalityFrame(29)).not.toMatch(/canopy|<filter/);
  });

  it('keeps the whole character full size in every angle of the complete somersault', () => {
    const neutral = samples.find((sample) => sample.name === 'idle/0')!;
    for (const sample of samples.filter(
      (entry) =>
        entry.personality !== undefined && entry.personality >= 14 && entry.personality <= 19,
    )) {
      const ratio = sample.paintedPixels / neutral.paintedPixels;
      expect(ratio, sample.name).toBeGreaterThanOrEqual(0.9);
      expect(ratio, sample.name).toBeLessThanOrEqual(1.1);
      expect(sample.svg).not.toMatch(/scale\(\.\d+\)/);
    }
    expect(mohlik.renderPersonalityFrame(17)).toContain('rotate(180)');
  });

  it('shows only a curious face in both head-only cells, without stray body parts', () => {
    const headSamples = samples.filter((sample) => sample.headOnly);
    const standing = xml(mohlik.renderFrame());
    const eyeSizes = (document: Document) =>
      [...document.querySelectorAll('g[data-part="eye"] > ellipse')].map((eye) => [
        eye.getAttribute('rx'),
        eye.getAttribute('ry'),
      ]);
    expect(new Set(headSamples.map((sample) => sample.hash)).size).toBe(2);
    for (const sample of headSamples) {
      const document = xml(sample.svg);
      expect(document.querySelector('[data-part="face"]')).not.toBeNull();
      expect(eyeSizes(document)).toEqual(eyeSizes(standing));
      expect(document.querySelector('[data-part="crown-leaf"]')?.innerHTML).toBe(
        standing.querySelector('[data-part="crown-leaf"]')?.innerHTML,
      );
      expect(
        document.querySelector('[data-view="head-peek"]')?.getAttribute('transform'),
      ).not.toMatch(/scale/);
      expect(
        document.querySelectorAll(
          '[data-part="cream-belly"], [data-part^="foot-"], [data-part$="leaf-tail"], [data-part^="arm-"]',
        ),
      ).toHaveLength(0);
      expect(sample.left).toBeGreaterThan(65);
      expect(sample.right - sample.left).toBeGreaterThan(80);
    }
  });

  it.each(['sit', 'scratch', 'ears', 'stretch', 'nose'] as const)(
    'keeps %s finite, distinct and returns to the neutral drawing',
    (name) => {
      const frames = samples.filter((sample) => sample.name.startsWith(`leisure/${name}/`));
      expect(frames).toHaveLength(mohlik.CALM_CLIPS[name].count);
      expect(new Set(frames.map((sample) => sample.hash)).size).toBeGreaterThanOrEqual(
        name === 'nose' ? 7 : 8,
      );
      expect(mohlik.renderCalmFrame(name, 0)).toBe(mohlik.renderFrame());
      expect(mohlik.renderCalmFrame(name, mohlik.CALM_CLIPS[name].count - 1)).toBe(
        mohlik.renderFrame(),
      );
    },
  );

  it('scratches the cheek with the unchanged short paw rather than a new hand or longer arm', () => {
    const neutral = xml(mohlik.renderFrame());
    const path = neutral.querySelector('[data-part="arm-left"] path')!.getAttribute('d');
    const poses = Array.from({ length: 12 }, (_, frame) =>
      xml(mohlik.renderCalmFrame('scratch', frame)),
    );
    for (const document of poses) {
      const arm = document.querySelector('[data-part="arm-left"]')!;
      expect(arm.querySelectorAll('path')).toHaveLength(1);
      expect(arm.querySelector('path')!.getAttribute('d')).toBe(path);
      expect(document.querySelector('[data-part="scratch-mitten"]')).toBeNull();
    }
    const contact = poses.slice(3, 9);
    expect(
      new Set(
        contact.map((document) =>
          document.querySelector('[data-gesture="scratch"]')!.getAttribute('transform'),
        ),
      ).size,
    ).toBe(6);
    expect(
      contact.every((document) =>
        document
          .querySelector('[data-part="head"]')!
          .getAttribute('transform')!
          .startsWith('translate(-9 5)'),
      ),
    ).toBe(true);
    const strokes = contact.map((document) => {
      const transform = document
        .querySelector('[data-gesture="scratch"]')!
        .getAttribute('transform')!;
      expect(transform).toMatch(/rotate\(168 56 126\)/);
      return Number(transform.match(/translate\(0 ([^)]+)/)![1]);
    });
    expect(strokes[0]! - strokes[1]!).toBeGreaterThan(3);
    expect(strokes[2]! - strokes[3]!).toBeGreaterThan(3);
    expect(strokes[4]! - strokes[5]!).toBeGreaterThan(3);
  });

  it('lifts one original short paw and leans towards the opposite side during each stretch', () => {
    const neutral = xml(mohlik.renderFrame());
    const liftedSides = new Set<string>();
    for (let frame = 0; frame < mohlik.CALM_CLIPS.stretch.count; frame++) {
      const document = xml(mohlik.renderCalmFrame('stretch', frame));
      const lifted = document.querySelectorAll('[data-gesture="stretch-paw"]');
      expect(lifted.length).toBeLessThanOrEqual(1);
      for (const arm of lifted) {
        const side = arm.getAttribute('data-part')!.split('-')[1]!;
        liftedSides.add(side);
        expect(arm.querySelector('path')!.getAttribute('d')).toBe(
          neutral.querySelector(`[data-part="arm-${side}"] path`)!.getAttribute('d'),
        );
        const body = document.querySelector('[data-gesture="stretch"]');
        if (body) {
          const angle = Number(body.getAttribute('transform')!.match(/rotate\(([^ ]+)/)![1]);
          expect(side === 'right' ? angle < 0 : angle > 0).toBe(true);
        }
        const other = side === 'left' ? 'right' : 'left';
        expect(
          document.querySelector(`[data-part="arm-${other}"]`)!.getAttribute('transform'),
        ).toMatch(/^rotate\(0 /);
      }
    }
    expect([...liftedSides].sort()).toEqual(['left', 'right']);
  });

  it('keeps sitting separate from ear folds and makes the nose twitch visible even at 64px', async () => {
    const neutral = xml(mohlik.renderFrame());
    for (let frame = 0; frame < mohlik.CALM_CLIPS.sit.count; frame++) {
      const document = xml(mohlik.renderCalmFrame('sit', frame));
      expect(
        document.querySelector('[data-part="ear-bend-left"], [data-part="ear-bend-right"]'),
      ).toBeNull();
      for (const side of ['left', 'right']) {
        const selector = `[data-part="leaf-ear-${side}"] > path`;
        expect(document.querySelector(selector)!.getAttribute('d')).toBe(
          neutral.querySelector(selector)!.getAttribute('d'),
        );
      }
    }
    const centroids: number[] = [];
    for (let frame = 0; frame < mohlik.CALM_CLIPS.nose.count; frame++) {
      const document = xml(mohlik.renderCalmFrame('nose', frame));
      expect(
        [...document.querySelectorAll('[data-part="eye"]')].map((eye) => eye.outerHTML),
      ).toEqual([...neutral.querySelectorAll('[data-part="eye"]')].map((eye) => eye.outerHTML));
      const nose = document.querySelector('[data-part="nose"]')!.outerHTML;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 192 192">${nose}</svg>`;
      const { data, info } = await sharp(Buffer.from(svg))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      let weight = 0,
        weightedX = 0;
      for (let y = 0; y < info.height; y++)
        for (let x = 0; x < info.width; x++) {
          const alpha = data[(y * info.width + x) * info.channels + 3]!;
          weight += alpha;
          weightedX += x * alpha;
        }
      expect(weight).toBeGreaterThan(0);
      centroids.push(weightedX / weight);
    }
    expect(Math.max(...centroids) - Math.min(...centroids)).toBeGreaterThan(1.8);
  });

  it('keeps all drawings inside the 3px safety margin without hidden clipping', () => {
    for (const sample of samples) {
      expect(sample.svg).toContain('width="192" height="192" viewBox="0 0 192 192"');
      expect(sample.paintedPixels, sample.name).toBeGreaterThan(sample.headOnly ? 2_000 : 8_000);
      expect(sample.paintedPixels, sample.name).toBeLessThan(192 * 192);
      expect(sample.left, sample.name).toBeGreaterThanOrEqual(3);
      expect(sample.top, sample.name).toBeGreaterThanOrEqual(3);
      expect(sample.right, sample.name).toBeLessThanOrEqual(188);
      expect(sample.bottom, sample.name).toBeLessThanOrEqual(188);
    }
    expect(
      new Set(
        samples.filter((sample) => sample.personality !== undefined).map((sample) => sample.hash),
      ).size,
    ).toBe(40);
  });
});
