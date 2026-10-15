import { describe, expect, it } from 'vitest';
import { CLIPS, EXTRA_CLIPS, validateManifest } from '../../src/animation/manifest';
import exportedManifest from '../../assets/exported/atlas.json';

const fresh = () => structuredClone(exportedManifest);

describe('animation manifest boundary validation', () => {
  it('accepts all 84 base animation frames and resolves each against its own sheet', () => {
    expect(validateManifest(exportedManifest)).toBe(true);
    const manifest = fresh();
    const allFrames = CLIPS.flatMap((clip) => manifest.clips[clip].frames);
    expect(allFrames).toHaveLength(84);
    const keys = CLIPS.flatMap((name) =>
      manifest.clips[name].frames.map(
        (frame) =>
          `${'sheet' in manifest.clips[name] ? manifest.clips[name].sheet : 'main'}/${frame}`,
      ),
    );
    expect(new Set(keys).size).toBe(84);
    for (const name of CLIPS) {
      const clip = manifest.clips[name];
      const sheet =
        'sheet' in clip
          ? manifest.atlases[clip.sheet as keyof typeof manifest.atlases]
          : manifest.atlas;
      for (const frame of clip.frames) {
        const x = (frame % sheet.columns) * manifest.cell.width;
        const y = Math.floor(frame / sheet.columns) * manifest.cell.height;
        expect(x + manifest.cell.width).toBeLessThanOrEqual(sheet.width);
        expect(y + manifest.cell.height).toBeLessThanOrEqual(sheet.height);
      }
    }
  });

  it.each([null, undefined, [], 'manifest', 1, {}, { schemaVersion: 2 }])(
    'fails safely for malformed input %s',
    (input) => {
      expect(() => validateManifest(input)).not.toThrow();
      expect(validateManifest(input)).toBe(false);
    },
  );

  it('rejects oversized atlases and geometry not matching the declared cell grid', () => {
    const huge = fresh();
    huge.atlas.width = 2304;
    huge.atlas.columns = 12;
    expect(validateManifest(huge)).toBe(false);
    const mismatch = fresh();
    mismatch.atlas.width -= 1;
    expect(validateManifest(mismatch)).toBe(false);
    const fraction = fresh();
    fraction.atlas.columns = 10.5;
    expect(validateManifest(fraction)).toBe(false);
    const zero = fresh();
    zero.cell.height = 0;
    expect(validateManifest(zero)).toBe(false);
    const impossible = fresh();
    impossible.atlas.height = Infinity;
    expect(validateManifest(impossible)).toBe(false);
  });

  it.each([-1, 100, 0.5, NaN, Infinity])(
    'rejects out-of-grid neutral and animation index %s',
    (index) => {
      const neutral = fresh();
      neutral.neutralFrame = index;
      expect(validateManifest(neutral)).toBe(false);
      const clip = fresh();
      clip.clips.happy.frames[3] = index;
      expect(validateManifest(clip)).toBe(false);
    },
  );

  it.each(CLIPS)(
    'requires the complete %s clip with its specified frame count, FPS and end rule',
    (name) => {
      const missing = fresh() as { clips: Partial<typeof exportedManifest.clips> };
      delete missing.clips[name];
      expect(validateManifest(missing)).toBe(false);
      const short = fresh();
      short.clips[name].frames.pop();
      expect(validateManifest(short)).toBe(false);
      const fps = fresh();
      fps.clips[name].fps += 1;
      expect(validateManifest(fps)).toBe(false);
      const ending = fresh();
      ending.clips[name].end = name === 'sleep' ? 'neutral' : 'hold';
      expect(validateManifest(ending)).toBe(false);
    },
  );

  it('rejects an array or absent clips object without throwing', () => {
    expect(validateManifest({ ...fresh(), clips: [] })).toBe(false);
    expect(validateManifest({ ...fresh(), clips: null })).toBe(false);
    expect(validateManifest({ ...fresh(), cell: null })).toBe(false);
    expect(validateManifest({ ...fresh(), atlas: {} })).toBe(false);
  });

  it('requires the agreed 192-pixel cell rather than a differently scaled grid', () => {
    const scaled = fresh();
    scaled.cell = { width: 96, height: 96 };
    scaled.atlas.width = 960;
    scaled.atlas.height = 864;
    expect(validateManifest(scaled)).toBe(false);
  });

  it('rejects a degenerate static clip made by repeating one frame index', () => {
    const staticClip = fresh();
    staticClip.clips.wave.frames.fill(staticClip.clips.wave.frames[0]);
    expect(validateManifest(staticClip)).toBe(false);
  });

  it('accepts optional six look poses and the legacy animation-only format', () => {
    expect(fresh().poses).toEqual(expect.objectContaining({
      left: 36,
      right: 37,
      up: 38,
      down: 39,
      curious: 40,
      sympathetic: 41,
    }));
    expect(validateManifest(fresh())).toBe(true);
    const legacy = fresh();
    Reflect.deleteProperty(legacy, 'poses');
    expect(validateManifest(legacy)).toBe(true);
  });
  it('accepts optional diagonal looks alongside the six required poses and retains legacy six-pose compatibility', () => {
    const legacy = fresh(); Reflect.deleteProperty(legacy.poses, 'up-left'); Reflect.deleteProperty(legacy.poses, 'up-right');
    expect(validateManifest(legacy)).toBe(true);
    const diagonal = { ...legacy, poses: { ...legacy.poses, 'up-left': 42, 'up-right': 43 } };
    expect(validateManifest(diagonal)).toBe(true);
    for (const index of [-1, 56, .5, NaN]) expect(validateManifest({ ...diagonal, poses: { ...diagonal.poses, 'up-left': index } })).toBe(false);
  });

  it.each([-1, 100, 0.5, NaN])('rejects invalid optional look pose index %s', (index) => {
    const invalid = fresh();
    invalid.poses.curious = index;
    expect(validateManifest(invalid)).toBe(false);
  });

  it('requires a complete poses object when the optional poses field is provided', () => {
    expect(validateManifest({ ...fresh(), poses: [] })).toBe(false);
    expect(validateManifest({ ...fresh(), poses: null })).toBe(false);
    expect(validateManifest({ ...fresh(), poses: { left: 84 } })).toBe(false);
  });

  it('keeps a compact first sheet and supplementary motion clips with safe core fallbacks', () => {
    const manifest = fresh();
    expect(manifest.atlas).toEqual({ width: 1536, height: 1344, columns: 8, rows: 7 });
    expect(manifest.clips.walk).toEqual({
      frames: [0, 1, 2, 3, 4, 5],
      fps: 10,
      end: 'neutral',
      sheet: 'personality',
      fallbackFrames: [42, 43, 44, 45, 44, 43],
    });
    expect(manifest.clips.wiggle.frames).toHaveLength(24);
    expect(manifest.clips.wiggle.fps).toBe(8);
    expect(manifest.clips.wiggle.fallbackFrames).toEqual([0, 46, 47, 48, 47, 46, 0]);
    expect(manifest.clips.climb).toEqual({
      frames: [34, 35, 36, 37, 38, 39],
      fps: 8,
      end: 'hold',
      sheet: 'personality',
      fallbackFrames: [49, 50, 51, 50],
    });
    expect(validateManifest(manifest)).toBe(true);
    const baseOnly = fresh();
    for (const name of EXTRA_CLIPS) Reflect.deleteProperty(baseOnly.clips, name);
    for (const sheet of ['personality', 'leisure']) Reflect.deleteProperty(baseOnly.atlases, sheet);
    expect(validateManifest(baseOnly)).toBe(true);
  });

  it.each(['walk', 'wiggle', 'climb'] as const)(
    'rejects malformed optional %s clips rather than treating them as unavailable',
    (name) => {
      const frame = fresh();
      frame.clips[name].frames[1] = 100;
      expect(validateManifest(frame)).toBe(false);
      const staticClip = fresh();
      staticClip.clips[name].frames.fill(90);
      expect(validateManifest(staticClip)).toBe(false);
      const fps = fresh();
      fps.clips[name].fps = Infinity;
      expect(validateManifest(fps)).toBe(false);
      const end = fresh();
      end.clips[name].end = 'invalid';
      expect(validateManifest(end)).toBe(false);
    },
  );

  it('validates supplemental clip indices against their own grid rather than the primary grid', () => {
    const manifest = fresh();
    expect(manifest.atlases.personality).toEqual({
      file: 'personality.webp',
      width: 1152,
      height: 1344,
      columns: 6,
      rows: 7,
    });
    const outside = fresh();
    outside.clips.walk.frames[1] = 42;
    expect(validateManifest(outside)).toBe(false);
    const missing = fresh();
    Reflect.deleteProperty(missing, 'atlases');
    expect(validateManifest(missing)).toBe(false);
    const mismatch = fresh();
    mismatch.atlases.personality.width = 1153;
    expect(validateManifest(mismatch)).toBe(false);
    const huge = fresh();
    huge.atlases.personality.width = 2304;
    huge.atlases.personality.columns = 12;
    expect(validateManifest(huge)).toBe(false);
  });

  it.each([
    '../secret.webp',
    'https://example.com/file.webp',
    '/elsewhere.webp',
    'data:image/webp,abc',
    'sprite.svg',
  ])('rejects a supplemental file outside the manifest folder: %s', (file) => {
    const manifest = fresh();
    manifest.atlases.personality.file = file;
    expect(validateManifest(manifest)).toBe(false);
  });

  it('keeps idle/wave in the core sheet and checks supplementary references and fallbacks', () => {
    expect(
      validateManifest({
        ...fresh(),
        clips: { ...fresh().clips, idle: { ...fresh().clips.idle, sheet: 'personality' } },
      }),
    ).toBe(false);
    const fallback = fresh();
    fallback.clips.walk.fallbackFrames[2] = 100;
    expect(validateManifest(fallback)).toBe(false);
    expect(
      validateManifest({
        ...fresh(),
        clips: { ...fresh().clips, walk: { ...fresh().clips.walk, sheet: 'unknown' } },
      }),
    ).toBe(false);
  });

  it('provides independently loadable reactions and leisure, plus a held head-only peek', () => {
    const manifest = fresh();
    for (const name of ['happy', 'sleep', 'wake'] as const)
      expect(manifest.clips[name].sheet).toBe('reactions');
    for (const name of ['sit', 'scratch', 'ears', 'stretch', 'nose'] as const) {
      expect(manifest.clips[name].sheet).toBe('leisure');
      expect((manifest.clips[name].frames.length * 1000) / manifest.clips[name].fps).toBe(
        name === 'sit' ? 4000 : name === 'stretch' ? 2500 : name === 'nose' ? 1000 : 1500,
      );
    }
    expect(manifest.clips['head-peek']).toEqual({
      frames: [40, 41, 40, 41],
      fps: 8,
      end: 'hold',
      sheet: 'personality',
      fallbackFrames: [40, 40, 40, 40],
    });
    const outside = fresh();
    outside.clips.sit.frames[1] = 64;
    expect(validateManifest(outside)).toBe(false);
    const missing = fresh();
    Reflect.deleteProperty(missing.atlases, 'reactions');
    expect(validateManifest(missing)).toBe(false);
    const reserved = fresh();
    Object.assign(reserved.atlases, { main: reserved.atlases.personality });
    expect(validateManifest(reserved)).toBe(false);
    const still = fresh();
    still.clips['head-peek'].frames.fill(40);
    expect(validateManifest(still)).toBe(false);
  });

  it('holds carried/falling/parachute poses and gives the readable turn and somersault finite durations', () => {
    const manifest = fresh();
    for (const name of ['held', 'fall', 'parachute'] as const) {
      expect(manifest.clips[name].end).toBe('hold');
      const invalid = fresh();
      invalid.clips[name].end = 'neutral';
      expect(validateManifest(invalid)).toBe(false);
    }
    expect((manifest.clips.wiggle.frames.length * 1000) / manifest.clips.wiggle.fps).toBe(3000);
    expect((manifest.clips.flip.frames.length * 1000) / manifest.clips.flip.fps).toBe(2500);
    expect((manifest.clips.land.frames.length * 1000) / manifest.clips.land.fps).toBe(500);
  });

  it('keeps the longer guitar scene optional with a bounded sequence and neutral fallback', () => {
    const manifest = fresh();
    expect(manifest.clips.guitar.sheet).toBe('guitar');
    expect(manifest.clips.guitar.frames).toHaveLength(76);
    expect(manifest.clips.guitar.fps).toBe(8);
    expect(manifest.clips.guitar.end).toBe('neutral');
    expect(manifest.clips.guitar.fallbackFrames).toEqual(Array(76).fill(manifest.neutralFrame));
    expect(validateManifest(manifest)).toBe(true);
    const outside = fresh(); outside.clips.guitar.frames[10] = 80;
    expect(validateManifest(outside)).toBe(false);
    const tooLong = fresh(); tooLong.clips.guitar.frames.push(...Array(97-tooLong.clips.guitar.frames.length).fill(0));
    expect(validateManifest(tooLong)).toBe(false);
    const tooLongFallback = fresh(); tooLongFallback.clips.guitar.fallbackFrames.push(...Array(97-tooLongFallback.clips.guitar.fallbackFrames.length).fill(0));
    expect(validateManifest(tooLongFallback)).toBe(false);
    const missing = fresh(); Reflect.deleteProperty(missing.clips, 'guitar'); Reflect.deleteProperty(missing.atlases, 'guitar');
    expect(validateManifest(missing)).toBe(true);
  });
});
