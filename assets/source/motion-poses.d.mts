export type MotionClip = 'idle' | 'wave' | 'happy' | 'sleep' | 'wake';
export type MotionLook = 'left' | 'right' | 'up' | 'down' | 'curious' | 'sympathetic';
export type ExtraMotionClip = 'walk' | 'wiggle' | 'climb';
export interface MotionPose {
  earLeft: number;
  earRight: number;
  tail: number;
  rightArm: number;
  leftArm: number;
  eyes: number;
  joy: number;
  headTilt: number;
  headX: number;
  headY: number;
  bodyScale: number;
  gazeX: number;
  gazeY: number;
  hipX: number;
  footLeftX: number;
  footLeftY: number;
  footRightX: number;
  footRightY: number;
  footLeftAngle: number;
  footRightAngle: number;
  backView: number;
  climbHands: number;
  climbHandY: number;
}
export const CLIPS: Record<MotionClip, { count: number; fps: number; end: 'neutral' | 'hold' }>;
export const LOOK_POSES: MotionLook[];
export const EXTRA_CLIPS: Record<
  ExtraMotionClip,
  { count: number; fps: number; end: 'neutral'; sequence: number[] }
>;
export function poseFor(clip: MotionClip, frame: number): MotionPose;
export function poseForLook(name: MotionLook): MotionPose;
export function poseForExtra(name: ExtraMotionClip, frame: number): MotionPose;
export type PersonalityClip =
  | ExtraMotionClip
  | 'held'
  | 'fall'
  | 'parachute'
  | 'land'
  | 'wink'
  | 'flip';
export interface PersonalityPose extends MotionPose {
  eyeLeft: number;
  eyeRight: number;
  surprise: number;
  turn: number;
  rotation: number;
  tuck: number;
}
export const PERSONALITY_FRAMES: { kind: string; frame: number }[];
export const PERSONALITY_CLIPS: Record<
  PersonalityClip,
  { frames: number[]; fps: number; end: 'neutral' | 'hold' }
>;
export function personalityPose(index: number): PersonalityPose;
