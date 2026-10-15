export const CLIPS = ['idle', 'wave', 'happy', 'sleep', 'wake'] as const;
export type ClipName = (typeof CLIPS)[number];
export const EXTRA_CLIPS = ['walk', 'wiggle', 'climb', 'held', 'fall', 'parachute', 'land', 'wink', 'flip', 'head-peek', 'sit', 'scratch', 'ears', 'stretch', 'nose', 'guitar', 'push-left', 'push-right'] as const;
export type MotionClipName = ClipName | (typeof EXTRA_CLIPS)[number];
export type AnimationState = MotionClipName | 'static';
export const POSES = ['left', 'right', 'up', 'down', 'curious', 'sympathetic'] as const;
export const EXTRA_POSES = ['up-left', 'up-right', 'push-left', 'push-right'] as const;
export type PoseName = (typeof POSES)[number] | (typeof EXTRA_POSES)[number];

export interface AtlasGeometry { width: number; height: number; columns: number; rows: number }
export interface SpriteClip {
  frames: number[];
  fps: number;
  end: 'neutral' | 'hold';
  sheet?: string;
  /** Legacy main-sheet artwork remains usable if the optional sheet fails. */
  fallbackFrames?: number[];
}
export interface AtlasManifest {
  schemaVersion: 1;
  cell: { width: number; height: number };
  atlas: AtlasGeometry;
  atlases?: Record<string, AtlasGeometry & { file: string }>;
  neutralFrame: number;
  clips: Record<ClipName, SpriteClip> & Partial<Record<(typeof EXTRA_CLIPS)[number], SpriteClip>>;
  poses?: Record<(typeof POSES)[number], number> & Partial<Record<(typeof EXTRA_POSES)[number], number>>;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateManifest(value: unknown): value is AtlasManifest {
  if (!record(value) || value.schemaVersion !== 1) return false;
  const { cell, atlas, clips, neutralFrame } = value;
  if (!record(cell) || !record(atlas) || !record(clips)) return false;
  const positive = (n: unknown): n is number => Number.isInteger(n) && Number(n) > 0;
  if (cell.width !== 192 || cell.height !== 192) return false;
  const geometry = (sheet: Record<string, unknown>) => positive(sheet.width) && positive(sheet.height) && positive(sheet.columns) && positive(sheet.rows) && sheet.width <= 2048 && sheet.height <= 2048 && sheet.width === 192 * sheet.columns && sheet.height === 192 * sheet.rows;
  if (!geometry(atlas)) return false;
  const count = Number(atlas.columns) * Number(atlas.rows);
  const index = (n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) < count;
  const sheetCounts = new Map<string, number>();
  if (value.atlases !== undefined) {
    if (!record(value.atlases)) return false;
    for (const [name, sheet] of Object.entries(value.atlases)) {
      if (!/^[a-z][a-z0-9-]*$/.test(name) || name === 'main' || !record(sheet) || !geometry(sheet) ||
          typeof sheet.file !== 'string' || !/^[a-z0-9][a-z0-9._-]*\.webp$/i.test(sheet.file)) return false;
      sheetCounts.set(name, Number(sheet.columns) * Number(sheet.rows));
    }
  }
  const clipIndex = (clip: Record<string, unknown>) => {
    if (clip.sheet === undefined) return index;
    const sheetCount = typeof clip.sheet === 'string' ? sheetCounts.get(clip.sheet) : undefined;
    return sheetCount === undefined ? () => false : (n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) < sheetCount;
  };
  const fallbackValid = (clip: Record<string, unknown>, maximumFrames = 32) => clip.fallbackFrames === undefined ||
    (clip.sheet !== undefined && Array.isArray(clip.fallbackFrames) && clip.fallbackFrames.length >= 4 &&
      clip.fallbackFrames.length <= maximumFrames && clip.fallbackFrames.every(index));
  if (!index(neutralFrame)) return false;
  const poses = value.poses;
  if (poses !== undefined && (!record(poses) || !POSES.every((name) => index(poses[name])))) return false;
  if (record(poses) && !EXTRA_POSES.every((name) => poses[name] === undefined || index(poses[name]))) return false;
  if (!EXTRA_CLIPS.every((name) => {
    const clip = clips[name];
    if (clip === undefined) return true;
    if (!record(clip)) return false;
    const frameIndex = clipIndex(clip);
    const holds = ['held', 'fall', 'parachute', 'head-peek', 'push-left', 'push-right'].includes(name);
    const uniqueMinimum = ['wink', 'climb', 'head-peek'].includes(name) ? 2 : 3;
    const maximumFrames = name === 'guitar' ? 96 : 32;
    const endValid = name === 'climb' ? clip.end === 'hold' || clip.end === 'neutral' : clip.end === (holds ? 'hold' : 'neutral');
    return Array.isArray(clip.frames) && clip.frames.length >= 4 && clip.frames.length <= maximumFrames && clip.frames.every(frameIndex) && new Set(clip.frames).size >= uniqueMinimum && Number.isFinite(clip.fps) && Number(clip.fps) >= 8 && Number(clip.fps) <= 16 && endValid &&
      fallbackValid(clip, maximumFrames);
  })) return false;
  const expected = { idle: [12, 12], wave: [24, 16], happy: [24, 16], sleep: [12, 12], wake: [12, 16] };
  return CLIPS.every((name) => {
    const clip = clips[name];
    if (!record(clip) || !Array.isArray(clip.frames)) return false;
    if ((name === 'idle' || name === 'wave') && clip.sheet !== undefined) return false;
    return fallbackValid(clip) && clip.frames.length === expected[name][0] && clip.frames.every(clipIndex(clip)) && new Set(clip.frames).size === clip.frames.length &&
      clip.fps === expected[name][1] && clip.end === (name === 'sleep' ? 'hold' : 'neutral');
  });
}
