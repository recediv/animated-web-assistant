import { describe, expect, it } from 'vitest';
import {
  CLIPS,
  LOOK_POSES,
  EXTRA_CLIPS,
  PERSONALITY_FRAMES,
  PERSONALITY_CLIPS,
  personalityPose,
  renderPersonalityFrame,
  poseFor,
  poseForLook,
  poseForExtra,
  renderFrame,
  renderPose,
  renderExtraFrame,
} from '../../assets/source/mohlik.mjs';
import type { MotionClip, ExtraMotionClip, MotionPose } from '../../assets/source/motion-poses.mjs';

const clipNames = Object.keys(CLIPS) as MotionClip[];
const xml = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml');

describe('active Mohlik vector animation source', () => {
  it('keeps the five-clip 84-frame contract', () => {
    expect(clipNames).toEqual(['idle', 'wave', 'happy', 'sleep', 'wake']);
    expect(Object.values(CLIPS).reduce((sum, clip) => sum + clip.count, 0)).toBe(84);
    expect(Object.values(CLIPS).map((clip) => [clip.count, clip.fps])).toEqual([
      [12, 12],
      [24, 16],
      [24, 16],
      [12, 12],
      [12, 16],
    ]);
  });

  it.each(clipNames)(
    'provides distinct SVG drawings for %s with the neutral/sleep transition',
    (name) => {
      const definition = CLIPS[name];
      const drawings = Array.from({ length: definition.count }, (_, frame) =>
        renderFrame(name, frame),
      );
      expect(new Set(drawings).size).toBeGreaterThanOrEqual(definition.count - 1);
      if (definition.end === 'neutral') expect(drawings.at(-1)).toBe(renderFrame());
      if (name === 'wake') expect(drawings[0]).toBe(renderFrame('sleep', CLIPS.sleep.count - 1));
    },
  );

  it('makes idle expressive through two blinks and separate ear/head/arm/tail motion', () => {
    const poses = Array.from({ length: CLIPS.idle.count }, (_, frame) => poseFor('idle', frame));
    const range = (joint: keyof MotionPose) =>
      Math.max(...poses.map((pose) => pose[joint])) - Math.min(...poses.map((pose) => pose[joint]));
    const closedEyes = poses
      .map((pose, frame) => ({ openness: pose.eyes, frame }))
      .filter(({ openness }) => openness < 0.22);
    expect(closedEyes.map(({ frame }) => frame)).toEqual([3, 8]);
    expect(range('earLeft')).toBeGreaterThan(12);
    expect(range('earRight')).toBeGreaterThan(12);
    expect(range('headTilt')).toBeGreaterThan(3.5);
    expect(range('leftArm')).toBeGreaterThan(12);
    expect(range('rightArm')).toBeGreaterThan(12);
    expect(range('tail')).toBeGreaterThan(6);
    expect(poses.every((pose) => pose.bodyScale === 1)).toBe(true);
    expect(poses[0]).toEqual(poses.at(-1));
  });

  it('provides all ten pointer/reaction/push poses without changing the body scale', () => {
    expect(LOOK_POSES).toEqual([
      'left',
      'right',
      'up',
      'down',
      'curious',
      'sympathetic',
      'up-left',
      'up-right',
      'push-left',
      'push-right',
    ]);
    expect(new Set(LOOK_POSES.map((name) => renderPose(name))).size).toBe(10);
    expect(poseForLook('left').gazeX).toBeLessThan(0);
    expect(poseForLook('right').gazeX).toBeGreaterThan(0);
    expect(poseForLook('up').gazeY).toBeLessThan(0);
    expect(poseForLook('down').gazeY).toBeGreaterThan(0);
    expect(Math.abs(poseForLook('curious').headTilt)).toBeGreaterThan(3);
    expect(poseForLook('sympathetic').eyes).toBeLessThan(1);
    expect(LOOK_POSES.every((name) => poseForLook(name).bodyScale === 1)).toBe(true);
  });

  it.each(Object.keys(EXTRA_CLIPS) as ExtraMotionClip[])(
    'provides distinct artwork for every unique %s frame',
    (name) => {
      const drawings = Array.from({ length: EXTRA_CLIPS[name].count }, (_, frame) =>
        renderExtraFrame(name, frame),
      );
      expect(new Set(drawings).size).toBe(EXTRA_CLIPS[name].count);
      expect(drawings.every((drawing) => drawing.includes('viewBox="0 0 192 192"'))).toBe(true);
    },
  );

  it('walks through opposite foot strides rather than moving an unchanged picture', () => {
    const first = poseForExtra('walk', 0);
    const opposite = poseForExtra('walk', 2);
    expect(first.footLeftX).toBeLessThan(0);
    expect(first.footRightX).toBeGreaterThan(0);
    expect(opposite.footLeftX).toBeGreaterThan(0);
    expect(opposite.footRightX).toBeLessThan(0);
    expect(poseForExtra('walk', 1).footLeftY).toBe(-4);
    expect(poseForExtra('walk', 3).footRightY).toBe(-4);
    expect(first.leftArm).toBe(-first.rightArm);
  });

  it('turns its back and wiggles hips and tail through distinct positions', () => {
    const poses = [0, 1, 2].map((frame) => poseForExtra('wiggle', frame));
    expect(poses.every((pose) => pose.backView === 1)).toBe(true);
    expect(poses.map((pose) => pose.hipX)).toEqual([-3, 0, 3]);
    expect(new Set(poses.map((pose) => pose.tail)).size).toBe(3);
    const drawing = xml(renderExtraFrame('wiggle', 1));
    expect(drawing.querySelector('[data-part="back-leaf-tail"]')).not.toBeNull();
    expect(drawing.querySelector('[data-part="face"]')).toBeNull();
  });

  it('climbs towards the page with rear handholds and opposite raised feet', () => {
    const poses = [0, 1, 2].map((frame) => poseForExtra('climb', frame));
    expect(
      poses.every((pose) => pose.climbHands === 1 && pose.backView === 1 && pose.bodyScale === 1),
    ).toBe(true);
    expect(poses.map((pose) => pose.climbHandY)).toEqual([-4, 0, 4]);
    expect(poses[0]!.footLeftY).toBe(0);
    expect(poses[0]!.footRightY).toBe(-9);
    expect(poses[1]!.footLeftY).toBe(poses[1]!.footRightY);
    expect(poses[2]!.footRightY).toBe(0);
    expect(poses[2]!.footLeftY).toBe(-9);
  });

  it('provides 40 distinct supplemental SVG frames within the unchanged 192px coordinate system', () => {
    expect(PERSONALITY_FRAMES).toHaveLength(40);
    const artwork = PERSONALITY_FRAMES.map((_, index) => renderPersonalityFrame(index));
    expect(new Set(artwork).size).toBe(40);
    expect(artwork.every((frame) => frame.includes('viewBox="0 0 192 192"'))).toBe(true);
  });

  it('uses a drawn side silhouette with different near/far strides and arm positions', () => {
    const poses = Array.from({ length: 6 }, (_, index) => personalityPose(index));
    expect(poses.every((pose) => pose.turn === 1)).toBe(true);
    expect(poses[0]!.footLeftX).toBe(-poses[3]!.footLeftX);
    expect(poses[0]!.footRightX).toBe(-poses[0]!.footLeftX);
    expect(poses[4]!.footLeftY).toBeLessThan(0);
    expect(poses[1]!.footRightY).toBeLessThan(0);
    expect(new Set(poses.map((pose) => pose.rightArm)).size).toBeGreaterThanOrEqual(4);
    expect(xml(renderPersonalityFrame(0)).querySelector('[data-view="profile"]')).not.toBeNull();
  });

  it('holds the drawn back through a readable turn, then winks with one eye', () => {
    const clip = PERSONALITY_CLIPS.wiggle;
    const backs = clip.frames.filter((frame) => personalityPose(frame).backView === 1);
    expect((clip.frames.length * 1000) / clip.fps).toBe(3000);
    expect(backs.length / clip.fps).toBeGreaterThanOrEqual(1.5);
    expect(personalityPose(10).hipX).toBeLessThan(0);
    expect(personalityPose(12).hipX).toBeGreaterThan(0);
    expect(personalityPose(21).eyeRight).toBe(0);
    expect(personalityPose(21).eyeLeft).toBe(1);
    expect(clip.frames.at(-1)).toBe(21);
  });

  it('draws a complete somersault with anticipation, landing and a held wink', () => {
    expect([14, 15, 16, 17, 18, 19].map((index) => personalityPose(index).rotation)).toEqual([
      0, 60, 120, 180, 240, 300,
    ]);
    expect((PERSONALITY_CLIPS.flip.frames.length * 1000) / PERSONALITY_CLIPS.flip.fps).toBe(2500);
    expect(PERSONALITY_CLIPS.flip.frames.slice(0, 3)).toEqual([31, 31, 32]);
    expect(personalityPose(31).bodyScale).toBeLessThan(0.8);
    expect(personalityPose(33).bodyScale).toBeGreaterThan(0.95);
    expect(PERSONALITY_CLIPS.flip.frames.filter((index) => index === 21)).toHaveLength(3);
    expect(renderPersonalityFrame(17)).toContain('rotate(180)');
  });

  it('moves planted paws backwards and lifts only the recovery of each step', () => {
    const poses = Array.from({ length: 6 }, (_, index) => personalityPose(index));
    for (let frame = 0; frame < 3; frame++) {
      expect(poses[frame + 1]!.footLeftX).toBeLessThan(poses[frame]!.footLeftX);
      expect(poses[frame]!.footLeftY).toBe(0);
    }
    for (const frame of [4, 5]) {
      expect(poses[frame]!.footLeftX).toBeGreaterThan(poses[frame - 1]!.footLeftX);
      expect(poses[frame]!.footLeftY).toBeLessThan(0);
    }
    for (let frame = 0; frame < 6; frame++) {
      const far = poses[(frame + 3) % 6]!;
      expect(poses[frame]!.footRightX).toBe(far.footLeftX);
      expect(poses[frame]!.footRightY).toBe(far.footLeftY);
    }
  });

  it('draws carried surprise, raised parachute paws and alternating short rear climbing grips', () => {
    expect([22, 23, 24].every((index) => personalityPose(index).surprise === 1)).toBe(true);
    expect(personalityPose(22).rightArm).toBeLessThan(-90);
    expect(personalityPose(22).footLeftAngle).not.toBe(personalityPose(24).footLeftAngle);
    expect(personalityPose(28).rightArm).toBeLessThan(-90);
    expect(
      xml(renderPersonalityFrame(28)).querySelector('[data-part="raised-arms"]'),
    ).not.toBeNull();
    const climbs = [34, 35, 36, 37, 38, 39].map(personalityPose);
    expect(
      climbs.every((pose) => pose.climbHands === 1 && pose.backView === 1 && pose.turn === 0),
    ).toBe(true);
    expect(climbs[0]!.footRightY).toBeLessThan(climbs[0]!.footLeftY);
    expect(climbs[3]!.footLeftY).toBeLessThan(climbs[3]!.footRightY);
    expect(new Set(climbs.map((pose) => pose.climbHandY)).size).toBeGreaterThan(3);
  });

  it('keeps both short climbing paws above one rear tail without facial features', () => {
    const frames = [
      ...[0, 1, 2].map((frame) => ({
        pose: poseForExtra('climb', frame),
        svg: renderExtraFrame('climb', frame),
      })),
      ...[34, 35, 36, 37, 38, 39].map((index) => ({
        pose: personalityPose(index),
        svg: renderPersonalityFrame(index),
      })),
    ];
    for (const { pose, svg } of frames) {
      const document = xml(svg);
      const pawY = (side: string) =>
        Number(document.querySelector(`[data-part="climb-paw-${side}"]`)?.getAttribute('cy'));
      const left = pawY('left'),
        right = pawY('right');
      expect(Math.min(left, right)).toBeGreaterThanOrEqual(96);
      expect(Math.max(left, right)).toBeLessThanOrEqual(113);
      if (left < right) expect(pose.footRightY).toBeLessThan(pose.footLeftY);
      if (right < left) expect(pose.footLeftY).toBeLessThan(pose.footRightY);
      expect(document.querySelectorAll('[data-part="back-leaf-tail"]')).toHaveLength(1);
      expect(
        document.querySelector(
          '[data-part="side-leaf-tail"], [data-part="face"], [data-part="eye"]',
        ),
      ).toBeNull();
      expect(svg.indexOf('data-part="back-leaf-tail"')).toBeLessThan(
        svg.indexOf('data-part="back-climb-left"'),
      );
      expect(pose.bodyScale).toBe(1);
    }
  });

  it('keeps pickup/drop eye geometry full size without a baked canopy or halo', () => {
    const eyeWidths = (svg: string) =>
      [...xml(svg).querySelectorAll('g[data-part="eye"]')].map((eye) =>
        [...eye.querySelectorAll('ellipse')].map((ellipse) => ellipse.getAttribute('rx')),
      );
    const neutralEyes = eyeWidths(renderFrame());
    expect(neutralEyes).toHaveLength(2);
    for (let index = 22; index <= 33; index++) {
      const frame = renderPersonalityFrame(index);
      expect(frame).not.toMatch(/scale\(\.\d+\)/);
      if (index === 31)
        expect(xml(frame).querySelectorAll('path[data-part="eye"]')).toHaveLength(2);
      else expect(eyeWidths(frame)).toEqual(neutralEyes);
      expect(frame).not.toMatch(/<filter|canopy/);
    }
    expect(personalityPose(26).bodyScale).toBe(1);
    expect(personalityPose(29).bodyScale).toBe(1);
  });
});
