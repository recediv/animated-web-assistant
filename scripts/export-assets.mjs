import { copyFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { CLIPS, LOOK_POSES, EXTRA_CLIPS, PERSONALITY_FRAMES, PERSONALITY_CLIPS, CALM_CLIPS, PUSH_CLIPS, personalityPose, renderFrame, renderPose, renderExtraFrame, renderPersonalityFrame, renderHeadPeekFrame, renderCalmFrame, renderPushFrame } from '../assets/source/mohlik.mjs';
import { exportBookCovers } from '../assets/source/book-covers.mjs';
import { GUITAR_CLIP, renderGuitarFrame } from '../assets/source/guitar.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'assets/exported');
const source = path.join(root, 'assets/source');
const local = path.join(root, '.local');
const frameSource = path.join(local, 'frames');
const cell = 192;
const columns = 8;
const rows = 7;
await mkdir(output, { recursive: true });
await mkdir(path.join(output, 'art'), { recursive: true });
await mkdir(frameSource, { recursive: true });

const manifest = {
  schemaVersion: 1,
  cell: { width: cell, height: cell },
  atlas: { width: cell * columns, height: cell * rows, columns, rows },
  neutralFrame: 0,
  clips: {},
  poses: {},
  atlases: {
    reactions: { file: 'reactions.webp', width: 1152, height: 1536, columns: 6, rows: 8 },
    personality: { file: 'personality.webp', width: 1152, height: 1344, columns: 6, rows: 7 },
    leisure: { file: 'leisure.webp', width: 1536, height: 1536, columns: 8, rows: 8 },
    push: { file: 'push.webp', width: 768, height: 1152, columns: 4, rows: 6 },
    guitar: { file: 'guitar.webp', width: 1920, height: 1536, columns: 10, rows: 8 },
  },
};
const layers = [];
const sheetLayers = { reactions: [], personality: [], leisure: [], push: [], guitar: [] };
const sheetIndices = { reactions: 0, personality: 0, leisure: 0, push: 0, guitar: 0 };
const bounds = [];
const uniqueFrames = {};
let neutralEyeSpan = 0;
const dropEyeSpans = [];
let neutralPixelCount = 0;
const flipPixelCounts = [];
let index = 0;
async function exportCell(svg, clip, frame, sheet = 'main') {
  await writeFile(path.join(frameSource, `${clip}-${String(frame).padStart(2, '0')}.svg`), svg);
  const raster = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const hash = createHash('sha256').update(raster.data).digest('hex');
  const boundary = { sheet, clip, frame, left: cell, top: cell, right: -1, bottom: -1 };
  let eyeLeft = cell;
  let eyeRight = -1;
  let pixelCount = 0;
  const isDrop = /^personality-(held|fall|parachute|land)$/.test(clip);
  const headY = isDrop ? personalityPose(sheetIndices.personality).headY : 0;
  for (let y = 0; y < cell; y += 1) {
    for (let x = 0; x < cell; x += 1) {
      if (raster.data[(y * cell + x) * raster.info.channels + 3] > 8) {
        pixelCount++;
        boundary.left = Math.min(boundary.left, x);
        boundary.top = Math.min(boundary.top, y);
        boundary.right = Math.max(boundary.right, x);
        boundary.bottom = Math.max(boundary.bottom, y);
        const channel = (y * cell + x) * raster.info.channels;
        // Dark eyes remain unobstructed by raised paws. Cheek-color bounds are
        // unsuitable: paws naturally cover the outer cheeks during pickup.
        if (y >= 78 + headY && y <= 103 + headY && raster.data[channel] < 65 && raster.data[channel + 1] < 50 && raster.data[channel + 2] < 60) {
          eyeLeft = Math.min(eyeLeft, x);
          eyeRight = Math.max(eyeRight, x);
        }
      }
    }
  }
  const eyeSpan = eyeRight - eyeLeft + 1;
  if (clip === 'idle' && frame === 0) neutralEyeSpan = eyeSpan;
  if (clip === 'idle' && frame === 0) neutralPixelCount = pixelCount;
  if (clip === 'personality-somersault') {
    const relativeArea = pixelCount / neutralPixelCount;
    if (relativeArea < .9 || relativeArea > 1.1) throw new Error(`Somersault changes character scale: ${frame}, area ${relativeArea.toFixed(3)} of neutral`);
    flipPixelCounts.push({ frame, pixelCount, relativeArea });
  }
  if (isDrop) {
    if (eyeSpan < neutralEyeSpan * 0.93 || eyeSpan > neutralEyeSpan * 1.08) throw new Error(`Drop phase changes character scale: ${clip}/${frame}, eyes ${eyeSpan}px vs neutral ${neutralEyeSpan}px`);
    dropEyeSpans.push({ clip, frame, eyeSpan });
  }
  if (boundary.left < 3 || boundary.top < 3 || boundary.right > 188 || boundary.bottom > 188) throw new Error(`Frame touches safety margin: ${JSON.stringify(boundary)}`);
  bounds.push(boundary);
  const sheetIndex = sheet === 'main' ? index++ : sheetIndices[sheet]++;
  const sheetColumns = sheet === 'main' ? columns : manifest.atlases[sheet].columns;
  (sheet === 'main' ? layers : sheetLayers[sheet]).push({ input: await sharp(Buffer.from(svg)).png().toBuffer(), left: (sheetIndex % sheetColumns) * cell, top: Math.floor(sheetIndex / sheetColumns) * cell });
  return { hash, index: sheetIndex };
}

for (const [clip, definition] of Object.entries(CLIPS)) {
  const sheet = clip === 'idle' || clip === 'wave' ? 'main' : 'reactions';
  const frames = [];
  const hashes = new Set();
  for (let frame = 0; frame < definition.count; frame += 1) {
    const exported = await exportCell(renderFrame(clip, frame), clip, frame, sheet);
    hashes.add(exported.hash);
    frames.push(exported.index);
  }
  if (hashes.size < definition.count - 2) throw new Error(`Too few unique frames for ${clip}: ${hashes.size}`);
  uniqueFrames[clip] = hashes.size;
  manifest.clips[clip] = { frames, fps: definition.fps, end: definition.end, ...(sheet === 'main' ? {} : { sheet, fallbackFrames: Array(definition.count).fill(manifest.neutralFrame) }) };
}

if (index !== 36 || sheetIndices.reactions !== 48) throw new Error('Expected 36 core and 48 optional reaction frames');
const animatedFrames = index + sheetIndices.reactions;
const poseHashes = new Set();
const legacyLooks = LOOK_POSES.filter((name) => !['up-left', 'up-right', 'push-left', 'push-right'].includes(name));
for (const name of legacyLooks) {
  const exported = await exportCell(renderPose(name), `look-${name}`, 0);
  manifest.poses[name] = exported.index;
  poseHashes.add(exported.hash);
}
if (poseHashes.size !== 6 || index !== 42) throw new Error('Expected six distinct look poses and 42 core cells');
for (const [name, definition] of Object.entries(EXTRA_CLIPS)) {
  const extraFrames = [];
  const hashes = new Set();
  for (let frame = 0; frame < definition.count; frame += 1) {
    const exported = await exportCell(renderExtraFrame(name, frame), name, frame);
    extraFrames.push(exported.index);
    hashes.add(exported.hash);
  }
  if (hashes.size !== definition.count) throw new Error(`Extra clip ${name} has duplicate artwork`);
  uniqueFrames[name] = hashes.size;
  manifest.clips[name] = { frames: definition.sequence.map((frame) => frame === -1 ? manifest.neutralFrame : extraFrames[frame]), fps: definition.fps, end: definition.end };
}
if (index !== 52) throw new Error('Expected 52 core atlas cells after extra motion clips');
// Append attention/push poses to the spare cells, preserving every existing
// animation/pose index and the original 1536x1344 core-sheet dimensions.
for (const name of LOOK_POSES.filter((name) => !legacyLooks.includes(name))) {
  const exported = await exportCell(renderPose(name), `look-${name}`, 0);
  manifest.poses[name] = exported.index;
  poseHashes.add(exported.hash);
}
if (poseHashes.size !== 10 || index !== 56) throw new Error('Expected ten distinct look/push poses and 56 core cells');
const personalityHashes = new Set();
for (let frame = 0; frame < PERSONALITY_FRAMES.length; frame += 1) {
  const descriptor = PERSONALITY_FRAMES[frame];
  const exported = await exportCell(renderPersonalityFrame(frame), `personality-${descriptor.kind}`, descriptor.frame, 'personality');
  personalityHashes.add(exported.hash);
}
if (sheetIndices.personality !== 40 || personalityHashes.size !== 40) throw new Error(`Expected 40 unique personality frames, got ${personalityHashes.size}`);
const headFrames = [];
for (let frame = 0; frame < 2; frame++) {
  const exported = await exportCell(renderHeadPeekFrame(frame), 'personality-head-peek', frame, 'personality');
  headFrames.push(exported.index);
  personalityHashes.add(exported.hash);
}
if (sheetIndices.personality !== 42 || personalityHashes.size !== 42) throw new Error('Expected 42 distinct personality/head cells');
uniqueFrames.personality = personalityHashes.size;
for (const [name, definition] of Object.entries(PERSONALITY_CLIPS)) {
  const fallback = manifest.clips[name]?.frames;
  manifest.clips[name] = { ...definition, sheet: 'personality', ...(fallback ? { fallbackFrames: fallback } : {}) };
}
manifest.clips['head-peek'] = { frames: [headFrames[0], headFrames[1], headFrames[0], headFrames[1]], fps: 8, end: 'hold', sheet: 'personality', fallbackFrames: Array(4).fill(manifest.poses.curious) };
for (const [name, definition] of Object.entries(CALM_CLIPS)) {
  const frames = [];
  const hashes = new Set();
  for (let frame = 0; frame < definition.count; frame++) {
    const exported = await exportCell(renderCalmFrame(name, frame), `leisure-${name}`, frame, 'leisure');
    frames.push(exported.index);
    hashes.add(exported.hash);
  }
  if (hashes.size < definition.count - 4) throw new Error(`Too few distinct leisure frames for ${name}: ${hashes.size}`);
  uniqueFrames[name] = hashes.size;
  const sequence = name === 'sit' ? [0, 1, 2, 3, ...Array.from({ length: 5 }, () => [4, 5, 6, 7, 8]).flat(), 9, 10, 11] : Array.from({ length: definition.count }, (_, index) => index);
  manifest.clips[name] = { frames: sequence.map((index) => frames[index]), fps: definition.fps, end: definition.end, sheet: 'leisure', fallbackFrames: Array(sequence.length).fill(manifest.neutralFrame) };
}
if (sheetIndices.leisure !== 64) throw new Error('Expected 64 leisure cells');
const guitarFrames = [];
const guitarHashes = new Set();
for (let frame = 0; frame < GUITAR_CLIP.count; frame++) {
  const exported = await exportCell(renderGuitarFrame(frame), 'guitar', frame, 'guitar');
  guitarFrames.push(exported.index);
  guitarHashes.add(exported.hash);
}
if (guitarHashes.size < 60) throw new Error('Guitar scene is missing distinct performance/turn drawings');
if (renderGuitarFrame(0) !== renderFrame() || renderGuitarFrame(GUITAR_CLIP.count-1) !== renderFrame()) throw new Error('Guitar scene must begin and end at neutral');
uniqueFrames.guitar = guitarHashes.size;
manifest.clips.guitar = { frames: guitarFrames, fps: GUITAR_CLIP.fps, end: GUITAR_CLIP.end, sheet: 'guitar', fallbackFrames: Array(GUITAR_CLIP.count).fill(manifest.neutralFrame) };
for (const [name, definition] of Object.entries(PUSH_CLIPS)) {
  const frames = [];
  const hashes = new Set();
  for (let frame = 0; frame < definition.count; frame++) {
    const exported = await exportCell(renderPushFrame(name, frame), name, frame, 'push');
    frames.push(exported.index);
    hashes.add(exported.hash);
  }
  if (hashes.size !== definition.count) throw new Error(`Push clip ${name} has duplicate stepping artwork`);
  uniqueFrames[name] = hashes.size;
  manifest.clips[name] = { frames, fps: definition.fps, end: definition.end, sheet: 'push', fallbackFrames: Array(definition.count).fill(manifest.poses[name]) };
}
if (sheetIndices.push !== 24) throw new Error('Expected twenty-four push cells');
for (const [clip, definition] of Object.entries(CLIPS)) {
  if (definition.end === 'neutral' && renderFrame(clip, definition.count - 1) !== renderFrame()) {
    throw new Error(`${clip} does not return to neutral pose`);
  }
}
if (renderFrame('sleep', 11) !== renderFrame('wake', 0)) throw new Error('Wake must begin in final sleep pose');
await sharp({ create: { width: cell * columns, height: cell * rows, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(layers).webp({ quality: 72, alphaQuality: 100, effort: 6 }).toFile(path.join(output, 'atlas.webp'));
for (const [name, geometry] of Object.entries(manifest.atlases)) {
  await sharp({ create: { width: geometry.width, height: geometry.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(sheetLayers[name]).webp({ quality: 72, alphaQuality: 100, effort: 6 }).toFile(path.join(output, geometry.file));
}
await sharp(Buffer.from(renderFrame())).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(path.join(output, 'poster.webp'));
await writeFile(path.join(local, 'poster.svg'), renderFrame());
await writeFile(path.join(output, 'atlas.json'), `${JSON.stringify(manifest, null, 2)}\n`);

await exportBookCovers(source, path.join(output, 'art'));
await copyFile(path.join(source, 'storybook-book-background.svg'), path.join(output, 'art', 'storybook-book-background.svg'));
const sizes = Object.fromEntries(await Promise.all(['poster.webp', 'atlas.webp', ...Object.values(manifest.atlases).map((sheet) => sheet.file), 'atlas.json'].map(async (name) => [name, (await stat(path.join(output, name))).size])));
if (sizes['poster.webp'] > 40 * 1024) throw new Error(`Poster exceeds 40 KiB: ${sizes['poster.webp']}`);
const totalAtlasBytes = sizes['atlas.webp'] + sizes['atlas.json'] + Object.values(manifest.atlases).reduce((total, sheet) => total + sizes[sheet.file], 0);
if (totalAtlasBytes > 1.5 * 1024 * 1024) throw new Error('Atlases and manifest exceed 1.5 MiB');
const metadata = await sharp(path.join(output, 'atlas.webp')).metadata();
if (!metadata.hasAlpha || metadata.width !== manifest.atlas.width || metadata.height !== manifest.atlas.height) throw new Error('Invalid atlas dimensions or missing transparency');
for (const geometry of Object.values(manifest.atlases)) {
  const sheetMetadata = await sharp(path.join(output, geometry.file)).metadata();
  if (!sheetMetadata.hasAlpha || sheetMetadata.width !== geometry.width || sheetMetadata.height !== geometry.height) throw new Error(`Invalid optional atlas ${geometry.file}`);
}
const decoded = await sharp(path.join(output, 'atlas.webp')).ensureAlpha().raw().toBuffer();
for (let unused = index; unused < columns * rows; unused += 1) {
  for (let y = 0; y < cell; y += 1) {
    for (let x = 0; x < cell; x += 1) {
      const atlasX = (unused % columns) * cell + x;
      const atlasY = Math.floor(unused / columns) * cell + y;
      if (decoded[(atlasY * metadata.width + atlasX) * 4 + 3] !== 0) throw new Error(`Unused cell ${unused} is not transparent`);
    }
  }
}
await writeFile(path.join(local, 'export-report.json'), `${JSON.stringify({
  frames: index + Object.values(sheetIndices).reduce((sum, count) => sum + count, 0), mainFrames: index, personalityFrames: sheetIndices.personality, reactionFrames: sheetIndices.reactions, leisureFrames: sheetIndices.leisure, pushFrames: sheetIndices.push,
  guitarFrames: sheetIndices.guitar, animatedFrames, poseFrames: LOOK_POSES.length,
  extraMotionFrames: Object.values(EXTRA_CLIPS).reduce((sum, clip) => sum + clip.count, 0),
  uniqueFrames, cell, atlas: manifest.atlas, atlases: manifest.atlases, sizes, totalAtlasBytes,
  encoding: { quality: 72, alphaQuality: 100 },
  hasAlpha: metadata.hasAlpha,
  unusedCells: columns * rows - index, unusedCellsTransparent: true,
  neutralEyeSpan, dropEyeSpans, neutralPixelCount, flipPixelCounts,
  safetyBounds: {
    left: Math.min(...bounds.map((entry) => entry.left)),
    top: Math.min(...bounds.map((entry) => entry.top)),
    right: Math.max(...bounds.map((entry) => entry.right)),
    bottom: Math.max(...bounds.map((entry) => entry.bottom)),
  },
  source: 'Parametric original vector demonstration artwork.',
}, null, 2)}\n`);
console.log(`Exported ${index + Object.values(sheetIndices).reduce((sum, count) => sum + count, 0)} transparent frames; poster ${(sizes['poster.webp'] / 1024).toFixed(1)} KiB, core atlas ${(sizes['atlas.webp'] / 1024).toFixed(1)} KiB, all atlases+manifest ${(totalAtlasBytes / 1024).toFixed(1)} KiB.`);
