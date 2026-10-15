import type {
  MotionClip,
  ExtraMotionClip,
  MotionLook,
  MotionPose,
  PersonalityClip,
  PersonalityPose,
} from './motion-poses.mjs';
export { CLIPS, EXTRA_CLIPS, poseFor, poseForExtra } from './motion-poses.mjs';
export type MohlikLook = MotionLook | 'up-left' | 'up-right' | 'push-left' | 'push-right';
export const LOOK_POSES: MohlikLook[];
export function poseForLook(name: MohlikLook): MotionPose;
export interface MohlikPersonalityPose extends PersonalityPose {
  climbLeftHandY?: number;
  climbRightHandY?: number;
  climbLeftElbow?: number;
  climbRightElbow?: number;
  climbPull?: number;
}
export const PERSONALITY_FRAMES: { kind: string; frame: number }[];
export const PERSONALITY_CLIPS: Record<
  PersonalityClip,
  { frames: number[]; fps: number; end: 'neutral' | 'hold' }
>;
export type MohlikCalmClip = 'sit' | 'scratch' | 'ears' | 'stretch' | 'nose';
export const CALM_CLIPS: Record<MohlikCalmClip, { count: number; fps: number; end: 'neutral' }>;
export function personalityPose(index: number): MohlikPersonalityPose;
export function mohlikDefs(prefix?: string): string;
/** Original short paw, shared with prop animations. */
export function mohlikArm(side: 'left' | 'right', pose: MotionPose): string;
export function mohlikProfileBody(pose: MohlikPersonalityPose, prefix?: string, pushing?: boolean): string;
export function mohlikBody(pose?: MotionPose, raised?: boolean, prefix?: string): string;
export function renderFrame(clip?: MotionClip, frame?: number): string;
export function renderPose(name: MohlikLook): string;
export type MohlikPushClip = 'push-left' | 'push-right';
export const PUSH_CLIPS: Record<MohlikPushClip, { count: number; fps: number; end: 'hold' }>;
export type MohlikRollClip = 'curl' | 'roll' | 'unroll-left' | 'unroll-right';
export const ROLL_CLIPS: Record<MohlikRollClip, { count: number; fps: number; end: 'hold' }>;
export function renderRollFrame(name: MohlikRollClip, frame?: number): string;
/** Twelve full-size effort frames; page-contact paws stay fixed throughout. */
export function renderPushFrame(name?: MohlikPushClip, frame?: number): string;
export function renderExtraFrame(name: ExtraMotionClip, frame: number): string;
export function renderPersonalityFrame(index: number): string;
export function renderHeadPeekFrame(frame?: 0 | 1): string;
export function renderCalmFrame(name: MohlikCalmClip, frame?: number): string;
