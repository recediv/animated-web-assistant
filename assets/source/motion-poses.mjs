/** Shared finite joint poses and clip contracts used by Mohlik artwork. */
export const CLIPS = {
  idle: { count: 12, fps: 12, end: 'neutral' },
  wave: { count: 24, fps: 16, end: 'neutral' },
  happy: { count: 24, fps: 16, end: 'neutral' },
  sleep: { count: 12, fps: 12, end: 'hold' },
  wake: { count: 12, fps: 16, end: 'neutral' },
};

export const LOOK_POSES = ['left', 'right', 'up', 'down', 'curious', 'sympathetic'];

export const EXTRA_CLIPS = {
  walk: { count: 4, fps: 10, end: 'neutral', sequence: [0, 1, 2, 3, 2, 1] },
  wiggle: { count: 3, fps: 10, end: 'neutral', sequence: [-1, 0, 1, 2, 1, 0, -1] },
  climb: { count: 3, fps: 8, end: 'neutral', sequence: [0, 1, 2, 1] },
};

const round = (number) => {
  const rounded = Number(number.toFixed(3));
  return Object.is(rounded, -0) ? 0 : rounded;
};

const smooth = (t) => t * t * (3 - 2 * t);

export function poseFor(clip, frame) {
  const t = frame / (CLIPS[clip].count - 1);
  const envelope = Math.sin(Math.PI * t);
  const tau = Math.PI * 2;
  const pose = {
    earLeft: 0,
    earRight: 0,
    tail: 0,
    rightArm: 0,
    leftArm: 0,
    eyes: 1,
    joy: 0,
    headTilt: 0,
    headX: 0,
    headY: 0,
    bodyScale: 1,
    gazeX: 0,
    gazeY: 0,
    hipX: 0,
    footLeftX: 0,
    footLeftY: 0,
    footRightX: 0,
    footRightY: 0,
    footLeftAngle: 0,
    footRightAngle: 0,
    backView: 0,
    climbHands: 0,
    climbHandY: 0,
  };
  if (clip === 'idle') {
    pose.earLeft = envelope * Math.sin(t * tau * 1.5) * 10;
    pose.earRight = -envelope * Math.sin(t * tau * 1.5 + 0.4) * 10;
    pose.tail = envelope * Math.sin(t * tau) * 5;
    pose.headTilt = envelope * Math.sin(t * tau) * 3;
    pose.headY = -envelope * Math.sin(t * tau * 2) * 0.8;
    pose.leftArm = envelope * Math.sin(t * tau * 2) * 10;
    pose.rightArm = -envelope * Math.sin(t * tau * 2) * 10;
    const firstBlink = Math.max(0, 1 - Math.abs(t - 0.28) / 0.12);
    const secondBlink = Math.max(0, 1 - Math.abs(t - 0.72) / 0.12);
    pose.eyes = 1 - Math.max(firstBlink, secondBlink);
  } else if (clip === 'wave') {
    pose.rightArm = envelope * (-96 + Math.sin(t * tau * 3) * 15);
    pose.leftArm = envelope * 7;
    pose.earLeft = envelope * Math.sin(t * tau * 2) * 5;
    pose.earRight = -envelope * 5;
    pose.tail = envelope * Math.sin(t * tau * 2) * 5;
    pose.headTilt = envelope * -3;
    pose.joy = envelope * 0.75;
  } else if (clip === 'happy') {
    const pulse = Math.sin(t * tau * 2);
    pose.rightArm = envelope * (-38 + pulse * 10);
    pose.leftArm = envelope * (36 - pulse * 10);
    pose.earLeft = envelope * (-5 + pulse * 7);
    pose.earRight = envelope * (5 - pulse * 7);
    pose.tail = envelope * pulse * 6;
    pose.headY = envelope * (-2 - pulse);
    pose.bodyScale = 1 - envelope * (0.025 + pulse * 0.015);
    pose.eyes = 1 - envelope * 0.91;
    pose.joy = envelope;
  } else if (clip === 'sleep') {
    const progress = smooth(t);
    pose.eyes = 1 - progress;
    pose.earLeft = -progress * 13;
    pose.earRight = progress * 15;
    pose.headTilt = progress * 5;
    pose.headY = progress * 3;
    pose.tail = progress * 7;
    pose.rightArm = progress * 9;
    pose.leftArm = -progress * 9;
    pose.bodyScale = 1 - progress * 0.035;
  } else if (clip === 'wake') {
    const remaining = 1 - smooth(t);
    pose.eyes = Math.min(1, smooth(t) * 1.75);
    pose.earLeft = -remaining * 13 + envelope * 6;
    pose.earRight = remaining * 15 - envelope * 5;
    pose.headTilt = remaining * 5;
    pose.headY = remaining * 3;
    pose.tail = remaining * 7 - envelope * 4;
    pose.rightArm = remaining * 9 - envelope * 21;
    pose.leftArm = -remaining * 9 + envelope * 21;
    pose.bodyScale = 1 - remaining * 0.035;
    pose.joy = envelope * 0.5;
  }
  return Object.fromEntries(Object.entries(pose).map(([key, value]) => [key, round(value)]));
}

export function poseForLook(name) {
  const neutral = poseFor('idle', 0);
  const poses = {
    left: { gazeX: -2.5, headTilt: -2, earLeft: -3, earRight: 2 },
    right: { gazeX: 2.5, headTilt: 2, earLeft: 3, earRight: -2 },
    up: { gazeY: -2, headY: -1.5, earLeft: 3, earRight: -3 },
    down: { gazeY: 2, headY: 1.3, headTilt: 1, eyes: 0.92, earLeft: -3, earRight: 4 },
    curious: { gazeX: -1, gazeY: -1, headTilt: -5, earLeft: 3, earRight: -7 },
    sympathetic: { eyes: 0.55, headTilt: 5, headY: 1.2, earLeft: -5, earRight: 6 },
  };
  if (!poses[name]) throw new Error(`Unknown look pose: ${name}`);
  return { ...neutral, ...poses[name] };
}

export function poseForExtra(name, frame) {
  const neutral = poseFor('idle', 0);
  const poses = {
    walk: [
      {
        footLeftX: -5,
        footLeftY: -1,
        footRightX: 5,
        footLeftAngle: -8,
        footRightAngle: 8,
        leftArm: 9,
        rightArm: -9,
        headTilt: -2,
        earLeft: 2,
        earRight: -3,
        tail: -4,
      },
      {
        footLeftY: -4,
        footLeftAngle: 4,
        leftArm: 4,
        rightArm: -4,
        headY: -0.5,
        earLeft: -2,
        earRight: 1,
        tail: 1,
        bodyScale: 0.99,
      },
      {
        footLeftX: 5,
        footRightX: -5,
        footRightY: -1,
        footLeftAngle: 8,
        footRightAngle: -8,
        leftArm: -9,
        rightArm: 9,
        headTilt: 2,
        earLeft: -3,
        earRight: 2,
        tail: 4,
      },
      {
        footRightY: -4,
        footRightAngle: -4,
        leftArm: -4,
        rightArm: 4,
        headY: 0.5,
        earLeft: 1,
        earRight: -2,
        tail: -1,
        bodyScale: 0.99,
      },
    ],
    wiggle: [
      {
        backView: 1,
        hipX: -3,
        headX: -1,
        headTilt: -3,
        leftArm: -10,
        rightArm: 10,
        tail: -7,
        footLeftX: -1,
        footRightX: 1,
        footLeftAngle: -8,
        footRightAngle: 4,
        earLeft: -2,
        earRight: 3,
      },
      { backView: 1, tail: 3, leftArm: -4, rightArm: 4, earLeft: -2, earRight: 2 },
      {
        backView: 1,
        hipX: 3,
        headX: 1,
        headTilt: 3,
        leftArm: 5,
        rightArm: -5,
        tail: 7,
        footLeftAngle: 4,
        footRightAngle: -8,
        earLeft: 3,
        earRight: -2,
      },
    ],
    climb: [
      {
        backView: 1,
        climbHands: 1,
        climbHandY: -4,
        footRightY: -9,
        footLeftX: -1,
        footRightX: 2,
        footLeftAngle: 4,
        footRightAngle: -14,
        headTilt: -1,
        tail: -3,
        earLeft: 1,
        earRight: -1,
      },
      {
        backView: 1,
        climbHands: 1,
        climbHandY: 0,
        footLeftY: -4,
        footRightY: -4,
        footLeftX: -2,
        footRightX: 2,
        footLeftAngle: -2,
        footRightAngle: 2,
        tail: 0,
      },
      {
        backView: 1,
        climbHands: 1,
        climbHandY: 4,
        footLeftY: -9,
        footLeftX: -2,
        footRightX: 1,
        footLeftAngle: 14,
        footRightAngle: -4,
        headTilt: 1,
        tail: 3,
        earLeft: -1,
        earRight: 1,
      },
    ],
  };
  if (!poses[name]?.[frame]) throw new Error(`Unknown extra clip/frame: ${name}/${frame}`);
  return { ...neutral, ...poses[name][frame] };
}

export const PERSONALITY_FRAMES = [
  ...Array.from({ length: 6 }, (_, frame) => ({ kind: 'profile-walk', frame })),
  ...Array.from({ length: 8 }, (_, frame) => ({ kind: 'turn', frame })),
  ...Array.from({ length: 6 }, (_, frame) => ({ kind: 'somersault', frame })),
  ...Array.from({ length: 2 }, (_, frame) => ({ kind: 'wink', frame })),
  ...Array.from({ length: 3 }, (_, frame) => ({ kind: 'held', frame })),
  ...Array.from({ length: 3 }, (_, frame) => ({ kind: 'fall', frame })),
  ...Array.from({ length: 3 }, (_, frame) => ({ kind: 'parachute', frame })),
  ...Array.from({ length: 3 }, (_, frame) => ({ kind: 'land', frame })),
  ...Array.from({ length: 2 }, (_, frame) => ({ kind: 'profile-climb', frame })),
];

export const PERSONALITY_CLIPS = {
  walk: { frames: [0, 1, 2, 3, 4, 5], fps: 10, end: 'neutral' },
  wiggle: {
    frames: [6, 7, 8, 9, 10, 11, 12, 11, 10, 11, 12, 11, 10, 11, 12, 11, 9, 9, 8, 7, 6, 20, 21, 21],
    fps: 8,
    end: 'neutral',
  },
  climb: { frames: [34, 35, 34, 35], fps: 8, end: 'neutral' },
  flip: {
    frames: [31, 31, 32, 14, 15, 16, 17, 18, 19, 19, 31, 31, 32, 33, 20, 21, 21, 21, 20, 20],
    fps: 8,
    end: 'neutral',
  },
  wink: { frames: [20, 20, 21, 21, 21, 21, 21, 21, 20, 20], fps: 8, end: 'neutral' },
  held: { frames: [22, 23, 24, 23], fps: 8, end: 'hold' },
  fall: { frames: [25, 26, 27, 26], fps: 8, end: 'hold' },
  parachute: { frames: [28, 29, 30, 29], fps: 8, end: 'hold' },
  land: { frames: [31, 32, 33, 33], fps: 8, end: 'neutral' },
};

export function personalityPose(index) {
  const descriptor = PERSONALITY_FRAMES[index];
  if (!descriptor) throw new Error(`Unknown personality frame: ${index}`);
  const { kind, frame } = descriptor;
  const pose = {
    ...poseFor('idle', 0),
    eyeLeft: 1,
    eyeRight: 1,
    surprise: 0,
    turn: 0,
    rotation: 0,
    tuck: 0,
  };
  if (kind === 'profile-walk') {
    // A planted paw travels backwards relative to the body; only its forward
    // recovery lifts off the floor. The far paw is half a cycle behind.
    const positions = [16, 16 / 3, -16 / 3, -16, -16 / 3, 16 / 3];
    const lift = [0, 0, 0, 0, -7, -7];
    const far = (frame + 3) % 6;
    const stride = positions[frame] / 16;
    Object.assign(pose, {
      turn: 1,
      footLeftX: positions[frame],
      footRightX: positions[far],
      footLeftY: lift[frame],
      footRightY: lift[far],
      footLeftAngle: frame === 4 ? -12 : frame === 5 ? 8 : 0,
      footRightAngle: far === 4 ? -12 : far === 5 ? 8 : 0,
      leftArm: -stride * 18,
      rightArm: stride * 22,
      earLeft: -stride * 3,
      earRight: stride * 3,
      tail: stride * 4,
      headY: frame % 3 === 1 ? -1 : 0,
    });
  } else if (kind === 'turn') {
    if (frame === 1 || frame === 7)
      Object.assign(pose, {
        turn: 0.55,
        headTilt: frame === 1 ? -3 : 2,
        gazeX: 2,
        earRight: frame === 1 ? -2 : 4,
      });
    else if (frame === 2) Object.assign(pose, { turn: 1, tail: -5, earLeft: -4 });
    else if (frame >= 3) {
      const sway = [0, -1, 0.15, 1][frame - 3];
      Object.assign(pose, {
        backView: 1,
        hipX: sway * 5,
        headX: sway * 2,
        headTilt: sway * 5,
        tail: sway * 15,
        leftArm: -9 + sway * 7,
        rightArm: 9 + sway * 7,
        earLeft: sway * 6,
        earRight: -sway * 5,
        footLeftAngle: sway * 5,
        footRightAngle: -sway * 5,
      });
    }
  } else if (kind === 'somersault') {
    Object.assign(pose, {
      rotation: frame * 60,
      tuck: 1,
      leftArm: 70 - frame * 3,
      rightArm: -70 + frame * 3,
      earLeft: -12,
      earRight: 12,
      footLeftY: -11,
      footRightY: -11,
      footLeftAngle: 20,
      footRightAngle: -20,
      eyes: frame > 0 && frame < 5 ? 0.1 : 1,
      eyeLeft: frame > 0 && frame < 5 ? 0.1 : 1,
      eyeRight: frame > 0 && frame < 5 ? 0.1 : 1,
      joy: 0.5,
      tail: -12 + frame * 4,
    });
  } else if (kind === 'wink') {
    Object.assign(pose, {
      eyeRight: frame ? 0 : 1,
      joy: 0.6,
      headTilt: -4,
      rightArm: frame ? -68 : -48,
      leftArm: 6,
      earLeft: -3,
      earRight: frame ? 7 : 3,
      tail: frame ? -5 : 3,
    });
  } else if (kind === 'held') {
    const sway = frame - 1;
    Object.assign(pose, {
      surprise: 1,
      leftArm: 116 + sway * 7,
      rightArm: -116 + sway * 7,
      headTilt: sway * 4,
      earLeft: -10 + sway * 4,
      earRight: 10 + sway * 3,
      footLeftX: -4,
      footRightX: 4,
      footLeftY: -3 + sway * 2,
      footRightY: -3 - sway * 2,
      footLeftAngle: -16 + sway * 5,
      footRightAngle: 16 + sway * 5,
      tail: sway * 8,
    });
  } else if (kind === 'fall') {
    const kick = frame - 1;
    Object.assign(pose, {
      surprise: 1,
      leftArm: 48 + kick * 9,
      rightArm: -48 - kick * 9,
      earLeft: 9 + kick * 3,
      earRight: -9 + kick * 3,
      footLeftX: -7,
      footRightX: 7,
      footLeftY: kick * 3,
      footRightY: -kick * 3,
      footLeftAngle: -18,
      footRightAngle: 18,
      tail: kick * 8,
      headTilt: kick * 3,
    });
  } else if (kind === 'parachute') {
    const sway = frame - 1;
    Object.assign(pose, {
      leftArm: 94,
      rightArm: -94,
      headTilt: sway * 4,
      footLeftY: -sway * 3,
      footRightY: sway * 3,
      tail: sway * 8,
      joy: 0.4,
    });
  } else if (kind === 'land') {
    const squashes = [0.74, 0.86, 0.98];
    Object.assign(pose, {
      bodyScale: squashes[frame],
      headY: [20, 10, 2][frame],
      earLeft: [-17, -10, -2][frame],
      earRight: [18, 11, 2][frame],
      leftArm: [28, 13, 2][frame],
      rightArm: [-28, -13, -2][frame],
      footLeftX: [-8, -4, -1][frame],
      footRightX: [8, 4, 1][frame],
      eyes: frame === 0 ? 0.1 : 1,
      eyeLeft: frame === 0 ? 0.1 : 1,
      eyeRight: frame === 0 ? 0.1 : 1,
      joy: 0.4,
      tail: [-8, 5, 1][frame],
    });
  } else if (kind === 'profile-climb') {
    // Keep the public frame indices, but face the page: each higher grip is
    // paired with the opposite lifted foot, and both hands remain visible.
    Object.assign(pose, {
      backView: 1,
      climbHands: 1,
      climbHandY: frame ? 5 : -5,
      footLeftY: frame ? -11 : 0,
      footRightY: frame ? 0 : -11,
      footLeftX: frame ? -2 : -1,
      footRightX: frame ? 1 : 2,
      footLeftAngle: frame ? 14 : 4,
      footRightAngle: frame ? -4 : -14,
      tail: frame ? 3 : -3,
      headTilt: frame ? 1 : -1,
      earLeft: frame ? -1 : 1,
      earRight: frame ? 1 : -1,
    });
  }
  return pose;
}
