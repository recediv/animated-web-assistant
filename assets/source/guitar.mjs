/** A finite, hand-drawn electric-guitar scene. All coordinates use Mohlik's 192px cell. */
import { mohlikArm, mohlikBody, mohlikProfileBody, mohlikDefs, personalityPose, poseFor, renderFrame } from './mohlik.mjs';

export const GUITAR_CLIP = { count: 76, fps: 8, end: 'neutral' };

const round = (value) => Number(value.toFixed(3)) || 0;
const ease = (value) => {
  const t = Math.max(0, Math.min(1, value));
  return t*t*(3-2*t);
};
const mix = (from, to, t) => from+(to-from)*t;

// The neck clears the right shoulder before the body crosses to the front.
// Reverse the same route to put it away; the instrument never shrinks or fades.
const drawRoute = [
  { x: 107, y: 142, angle: -94 },
  { x: 122, y: 144, angle: -96 },
  { x: 141, y: 145, angle: -100 },
  { x: 157, y: 145, angle: -100 },
  { x: 150, y: 145, angle: -83 },
  { x: 133, y: 145, angle: -67 },
  { x: 113, y: 145, angle: -49 },
  { x: 94, y: 144, angle: -29 },
  { x: 79, y: 143, angle: -18 },
];

function instrumentPoint(state, x, y) {
  const radians = state.angle*Math.PI/180;
  return { x: round(state.x+x*Math.cos(radians)-y*Math.sin(radians)),
    y: round(state.y+x*Math.sin(radians)+y*Math.cos(radians)) };
}

function electricGuitar(state) {
  const frets = [25,32,38.5,44.5,50,55,59.5,63.5,67];
  return `<g data-prop="electric-guitar" transform="translate(${state.x} ${state.y}) rotate(${state.angle})" stroke="#684535" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path data-part="guitar-body" d="M14-4 C14-10 23-17 23-23 C22-28 14-23 8-17 Q4-14-1-18 C-10-24-21-21-25-11 C-29-3-28 10-21 18 C-15 25-3 26 6 21 Q13 18 10 13 Q7 7 12 6 C17 6 19 14 23 11 Q26 7 15 4Z" fill="#cc6550"/>
    <path d="M-22-9 C-20-18-10-20-3-16" fill="none" stroke="#f39a78" stroke-width="2.3"/>
    <path data-part="guitar-pickguard" d="M14-4 Q13-9 17-15 Q10-10 5-13 C-4-18-15-16-17-7 Q-20 0-14 9 L-4 17 Q4 19 8 13 Q4 4 14 4Z" fill="#fff0cc" stroke-width="1.1"/>
    <path data-part="guitar-neck" d="M13-4.6 72-3.4 72 3.4 13 4.6Z" fill="#78513b"/>
    <path data-part="guitar-headstock" d="M71-3.5 Q75-3 77-7 L96-6 Q101-5 99 0 Q99 4 93 4 L88 2.6 Q78 5 71 3.5Z" fill="#e0b678"/>
    <g data-part="guitar-tuners" fill="#b9c7bb" stroke-width=".8">${Array.from({length:6},(_,i) => `<path d="M${77+i*3.6}-6 v-2.8"/><rect x="${75.8+i*3.6}" y="-11" width="2.7" height="3.2" rx=".9"/>`).join('')}</g>
    <path d="M71-3.5v7" stroke="#f6e0ae" stroke-width="1.7"/>
    <g data-part="guitar-frets" stroke="#d9bc95" stroke-width=".7">${frets.map((x) => `<path d="M${x}-3.6v7.2"/>`).join('')}</g>
    <g fill="#f1d6a8" stroke="none"><circle cx="35" cy="0" r="1"/><circle cx="47" cy="0" r="1"/><circle cx="57" cy="0" r="1"/><circle cx="65" cy="-1.6" r=".75"/><circle cx="65" cy="1.6" r=".75"/></g>
    <g data-part="guitar-pickups" fill="#4c4c40" stroke="#4c4c40" stroke-width=".7"><rect x="-10" y="-6.7" width="3" height="13.4" rx="1" transform="rotate(-9 -8 0)"/><rect x="0" y="-6.7" width="3" height="13.4" rx="1"/><rect x="9" y="-6.7" width="3" height="13.4" rx="1"/></g>
    <rect data-part="guitar-bridge" x="-19" y="-6.5" width="5.2" height="13" rx="1" fill="#aeb9ab" stroke-width="1"/>
    <g data-part="guitar-strings" stroke="#f9deb0" stroke-width=".45" opacity=".9">${Array.from({length:6},(_,i) => `<path d="M-17 ${round(-2.5+i)} 73 ${round(-2+i*.8)} ${79+i*3.4} -4"/>`).join('')}</g>
    <path d="M-16 4-11 10 0 11" fill="none" stroke="#aab7a7" stroke-width="1.4"/>
    <g data-part="guitar-controls" fill="#f9e9c6" stroke-width=".8"><circle cx="-3" cy="17" r="2.1"/><circle cx="5" cy="14" r="1.8"/><path d="M8 9l3 2"/><ellipse cx="-18" cy="13" rx="3.3" ry="1.8" transform="rotate(46 -18 13)" fill="#aeb9ab"/></g>
  </g>`;
}

/** Rotate and place the ordinary paw, keeping its contour and length intact. */
function pawAt(side, point, gesture) {
  const shoulderX = side === 'left' ? 56 : 136;
  const dx = point.x-shoulderX, dy = point.y-126;
  const angle = round((Math.atan2(dy,dx)-Math.atan2(18,side === 'left' ? -1 : 1))*180/Math.PI);
  const radians = angle*Math.PI/180;
  const originalX = side === 'left' ? -1 : 1;
  const tx = round(dx-(originalX*Math.cos(radians)-18*Math.sin(radians)));
  const ty = round(dy-(originalX*Math.sin(radians)+18*Math.cos(radians)));
  const pose = {...poseFor('idle',0),leftArm:angle,rightArm:angle};
  return `<g data-gesture="${gesture}" transform="translate(${tx} ${ty})">${mohlikArm(side,pose)}</g>`;
}

function musicNotes(frame, continuous = false) {
  const progress = ((frame-17)%26)/26;
  const fade = continuous ? 1 : Math.min(1,(frame-16)/3,(43-frame)/3);
  return `<g data-part="guitar-notes" fill="#a77745" stroke="#a77745" stroke-width="1.6" stroke-linecap="round" opacity="${round(Math.max(0,fade)*.85)}">
    <g transform="translate(27 ${round(112-16*progress)}) rotate(-12)"><ellipse cx="0" cy="0" rx="3.2" ry="2.2" stroke="none"/><path d="M3 0v-11q6 1 5 5" fill="none"/></g>
    <g transform="translate(162 ${round(87-11*progress)}) rotate(9)"><ellipse cx="0" cy="0" rx="3" ry="2" stroke="none"/><ellipse cx="10" cy="-2" rx="3" ry="2" stroke="none"/><path d="M3 0v-11l10-2v11M3-8l10-2" fill="none"/></g>
  </g>`;
}

function wrapScene(content, phase) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">${mohlikDefs()}<g data-scene="guitar" data-phase="${phase}">${content}</g></svg>`;
}

function playingBack(frame) {
  const turningBack = frame < 46, turningFront = frame > 53;
  const step = turningBack ? frame-41 : turningFront ? 58-frame : 4;
  const rear = step >= 3;
  const saved = step === 0 ? 6 : step === 1 ? 7 : step === 2 ? 8 : step === 3 ? 9 :
    [10,11,12,11][Math.max(0,frame-45)%4];
  // Use exactly the existing turn/wag poses: the same hips, feet, ears and tail.
  const pose = {...personalityPose(saved),hideArms:true};
  const state = {x:round(79+pose.hipX*.3),y:143,angle:round(-18+pose.headTilt*.25)};
  const cosine = [1,.65,.2,-.65,-1][step];
  const offset = [0,28,48,28,0][step];
  const project = (svg) => `<g data-part="guitar-perspective" transform="translate(${96+offset} 0) scale(${cosine} 1) translate(-96 0)">${svg}</g>`;
  let actor = pose.turn ? mohlikProfileBody(pose) : mohlikBody(pose);
  if (pose.turn === .55) actor = `<g transform="translate(10 0) scale(.92 1)">${actor}</g>`;
  if (step === 3) actor = `<g transform="translate(6 0) scale(.94 1)">${actor}</g>`;
  const fret = instrumentPoint(state,rear ? 66 : 48,2);
  const strum = instrumentPoint(state,-1,Math.sin((frame-17)*Math.PI/2)*3.7);
  const hands = `<g fill="url(#mohlik-fur)" stroke="#55714b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${pawAt('right',fret,'guitar-fret')}${pawAt('left',strum,'guitar-strum')}</g>`;
  const prop = project(electricGuitar(state)+hands);
  const phase = turningBack ? 'turn-back' : turningFront ? 'turn-front' : 'play-back';
  return wrapScene((rear ? prop : '')+actor+(rear ? '' : prop)+musicNotes(frame,true),phase);
}

export function renderGuitarFrame(frame = 0) {
  if (!Number.isInteger(frame) || frame < 0 || frame >= GUITAR_CLIP.count) throw new Error(`Unknown guitar frame: ${frame}`);
  if (frame === 0 || frame === GUITAR_CLIP.count-1) return renderFrame();
  if (frame >= 41 && frame <= 58) return playingBack(frame);
  if (frame > 58) frame -= 18;
  const pose = {...poseFor('idle',0),hideArms:true};
  let state = null, rear = false, notes = '', frontPaws = '', backPaws = '';
  let phase;
  if (frame < 6 || frame > 52) {
    phase = frame < 6 ? 'reach' : 'return';
    const reach = ease((frame < 6 ? frame : 57-frame)/5);
    pose.headTilt = round(4*reach); pose.gazeX = round(3*reach); pose.tail = round(-3*reach);
    pose.headX = round(-1.5*reach);
    pose.rightArm = round(-150*reach);
    const reaching = `<g transform="translate(${round(4*reach)} ${round(-2*reach)})">${mohlikArm('right',pose)}</g>`;
    backPaws = reach > .45 ? reaching : '';
    frontPaws = mohlikArm('left',pose)+(reach <= .45 ? reaching : '');
  } else {
    if (frame <= 14 || frame >= 44) {
      phase = frame <= 14 ? 'draw' : 'stow';
      const routeIndex = frame <= 14 ? frame-6 : 52-frame;
      state = {...drawRoute[routeIndex]};
      rear = routeIndex < 3;
      const settled = ease((routeIndex-5)/3);
      pose.headTilt = round(4*(1-settled)); pose.gazeX = round(3*(1-settled)); pose.gazeY = round(2*settled);
      pose.tail = round(-3*(1-settled));
      const grip = instrumentPoint(state,mix(22,48,settled),2);
      const holding = pawAt('right',grip,'guitar-fret');
      if (rear) backPaws = holding; else frontPaws = holding;
      const waiting = {x:mix(55,79,settled),y:mix(144,143,settled)};
      frontPaws += pawAt('left',waiting,'guitar-support');
    } else {
      phase = frame < 17 ? 'settle' : frame <= 40 ? 'play' : 'finish';
      const playing = frame >= 17 && frame <= 40;
      const beat = playing ? (frame-17)*Math.PI/2 : 0;
      const sway = playing ? Math.sin((frame-17)*Math.PI/6) : 0;
      const strum = playing ? Math.sin(beat) : frame === 41 ? 1 : 0;
      state = {x:round(79+sway*1.6),y:round(143+Math.sin(beat/2)*.65),angle:round(-18-sway*1.7)};
      pose.headTilt = round(sway*3); pose.headY = round(playing ? -1.2+Math.cos(beat)*1.2 : 0);
      pose.hipX = round(sway*1.5); pose.joy = frame >= 17 ? .65 : .3;
      pose.eyes = playing && (frame-17)%8 >= 4 ? .18 : frame >= 41 ? .7 : 1;
      pose.gazeX = 1; pose.gazeY = 2;
      pose.earLeft = round(sway*1.3); pose.earRight = round(-sway); pose.tail = round(-sway*3);
      pose.footLeftY = playing ? -Math.max(0,Math.sin(beat/2))*2.7 : 0;
      const chord = playing ? [0,0,4,4,7,7,3,3][(frame-17)%8] : 0;
      const fret = instrumentPoint(state,48+chord,2);
      const pick = instrumentPoint(state,-1,3.7*strum);
      frontPaws = pawAt('right',fret,'guitar-fret')+pawAt('left',pick,'guitar-strum');
      const tip = instrumentPoint(state,3,3.7*strum+2);
      frontPaws += `<path data-part="guitar-pick" d="M${tip.x-1.4} ${tip.y-1}q3-1 3.5 1l-2.6 2.6Z" fill="#edc777" stroke="#795738" stroke-width=".7"/>`;
      if (frame >= 17 && frame <= 42) notes = musicNotes(frame);
    }
  }
  const instrument = state ? electricGuitar(state) : '';
  return wrapScene(`${rear ? instrument : ''}<g fill="url(#mohlik-fur)" stroke="#55714b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${backPaws}</g>${mohlikBody(pose)}${rear ? '' : instrument}<g fill="url(#mohlik-fur)" stroke="#55714b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${frontPaws}</g>${notes}`,phase);
}
