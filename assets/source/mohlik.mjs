/** Mohlik artwork with shared poses for finite animation clips. */
import {
  CLIPS, LOOK_POSES as savedLookPoses, EXTRA_CLIPS,
  PERSONALITY_FRAMES as savedPersonalityFrames, PERSONALITY_CLIPS as savedPersonalityClips,
  poseFor, poseForLook as savedPoseForLook, poseForExtra, personalityPose as savedPersonalityPose,
} from './motion-poses.mjs';

export {
  CLIPS, EXTRA_CLIPS, poseFor, poseForExtra,
};

export const LOOK_POSES = [...savedLookPoses, 'up-left', 'up-right', 'push-left', 'push-right'];

// Directional attention moves only the pupils. The head, leaf ears and body
// keep their neutral position; the two expressive reaction poses stay intact.
export function poseForLook(name) {
  if (name === 'push-left' || name === 'push-right') {
    return {...poseFor('idle',0),turn:1,eyeLeft:1,eyeRight:1,headTilt:4,
      footLeftX:-8,footRightX:5,footLeftAngle:-4,footRightAngle:4,tail:3,gazeX:2.5};
  }
  const gaze = {
    left: [-4, 0], right: [4, 0], up: [0, -4], down: [0, 3.5],
    'up-left': [-3.5, -4], 'up-right': [3.5, -4],
  }[name];
  if (gaze) return {...poseFor('idle', 0), gazeX:gaze[0], gazeY:gaze[1]};
  return savedPoseForLook(name);
}

// Keep every existing action index through 33. Only Mohlik's climb gets a
// six-drawing grip/pull/reach cycle, played deliberately at 8fps (750ms).
export const PERSONALITY_FRAMES = [
  ...savedPersonalityFrames.slice(0,34),
  ...Array.from({length:6},(_,frame) => ({kind:'profile-climb',frame})),
];
export const PERSONALITY_CLIPS = {
  ...savedPersonalityClips,
  climb: {frames:[34,35,36,37,38,39],fps:8,end:'hold'},
};

// Leisure drawings live on their own optional sheet; route timings and the
// existing personality indices remain independent of these quiet gestures.
export const CALM_CLIPS = {
  sit: {count:12,fps:8,end:'neutral'},
  scratch: {count:12,fps:8,end:'neutral'},
  ears: {count:12,fps:8,end:'neutral'},
  stretch: {count:20,fps:8,end:'neutral'},
  nose: {count:8,fps:8,end:'neutral'},
};

export function personalityPose(index) {
  if (!Number.isInteger(index) || index < 0 || index >= PERSONALITY_FRAMES.length) throw new Error(`Unknown personality frame: ${index}`);
  if (index < 34) return savedPersonalityPose(index);
  const frame = index-34;
  const handY = [-5,-3,0,5,3,0][frame];
  const pull = [0,3,5,0,3,5][frame];
  return {
    ...savedPersonalityPose(34),
    climbHandY:handY,
    // A short paw grips beside the cheek while the body pulls up underneath.
    // The opposite paw takes one small step; neither arm grows past the head.
    climbLeftHandY:[97,97,97,112,105,99][frame],
    climbRightHandY:[112,105,99,97,97,97][frame],
    climbLeftElbow:[0,5,8,8,3,0][frame],
    climbRightElbow:[8,3,0,0,5,8][frame],
    climbPull:pull,headY:-pull,
    footLeftY:[0,-2,-4,-3,-8,-12][frame],
    footRightY:[-3,-8,-12,0,-2,-4][frame],
    footLeftX:[-18,-19,-21,-22,-21,-18][frame],
    footRightX:[22,21,18,18,19,21][frame],
    footLeftAngle:[2,0,-2,-4,-6,-8][frame],
    footRightAngle:[-4,-6,-8,2,0,-2][frame],
    headTilt:[-.5,-.5,0,.5,.5,0][frame],
    earLeft:[0,.25,.5,0,-.25,-.5][frame],
    earRight:[0,-.25,-.5,0,.25,.5][frame],
    tail:[-2,-1,0,2,1,0][frame],
  };
}

const round = (number) => {
  const value = Number(number.toFixed(3));
  return Object.is(value, -0) ? 0 : value;
};
const ink = '#55714b';
const cream = '#eff2cf';

export function mohlikDefs(prefix = 'mohlik') {
  return `<defs>
    <linearGradient id="${prefix}-fur" gradientUnits="userSpaceOnUse" x1="45" y1="25" x2="130" y2="176"><stop stop-color="#d4e4b8"/><stop offset=".6" stop-color="#c6ddb0"/><stop offset="1" stop-color="#afca96"/></linearGradient>
    <linearGradient id="${prefix}-body" gradientUnits="userSpaceOnUse" x1="45" y1="25" x2="130" y2="176"><stop stop-color="#b7d099"/><stop offset="1" stop-color="#a3c086"/></linearGradient>
    <linearGradient id="${prefix}-leaf" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#8eb878"/><stop offset="1" stop-color="#5f8c58"/></linearGradient>
  </defs>`;
}

function eye(x, y, openness, joy, inward = 0, gazeX = 0, gazeY = 0) {
  const pupilX = x + inward + gazeX;
  const pupilY = y + .8 + gazeY;
  if (openness < .22) {
    const lidX = x + inward;
    return `<path data-part="eye" d="M${round(lidX-4.8)} ${round(y)} Q${round(lidX)} ${round(y+(joy>.3?-4:3))} ${round(lidX+4.8)} ${round(y)}" fill="none" stroke="#302829" stroke-width="2.1"/>`;
  }
  const pupilHeight = round(7.1 * Math.max(.25, openness));
  return `<g data-part="eye">
    <ellipse cx="${round(x)}" cy="${round(y)}" rx="11" ry="${round(12.8*Math.max(.35,openness))}" fill="#f9f8e5" stroke="#769267" stroke-width="1.4"/>
    <ellipse cx="${round(pupilX)}" cy="${round(pupilY)}" rx="4.8" ry="${pupilHeight}" fill="#302829" stroke="none"/>
    <ellipse cx="${round(pupilX-1.4)}" cy="${round(pupilY-pupilHeight*.38)}" rx="1.8" ry="${round(Math.min(2,pupilHeight*.32))}" fill="#fffef5" stroke="none"/>
  </g>`;
}

function crown(prefix) {
  return `<g data-part="crown-leaf">
    <path d="M80 59 Q84 39 109 37 Q122 37 132 46 Q110 66 80 59Z" fill="url(#${prefix}-leaf)"/>
    <path d="M84 58 Q102 53 122 45 M104 51 L108 43" fill="none" stroke="#c0dca0" stroke-width="1.6"/>
  </g>`;
}

function ears(pose, prefix) {
  const leftFold = pose.earFoldLeft ?? 0;
  const rightFold = pose.earFoldRight ?? 0;
  const bend = (pivotX,pivotY,angle) => (x,y) => {
    const radians = angle*Math.PI/180;
    return `${round(pivotX+(x-pivotX)*Math.cos(radians)-(y-pivotY)*Math.sin(radians))} ${round(pivotY+(x-pivotX)*Math.sin(radians)+(y-pivotY)*Math.cos(radians))}`;
  };
  const left = bend(58,44.5,-70*leftFold);
  const right = bend(136,41,70*rightFold);
  // Split the original leaf curves at the joint. The upper leaf rotates as a
  // full-sized piece; lower curves flex to it while keeping the base anchored.
  // One closed outline fills the entire joint, rather than overlapping leaves
  // or squeezing their control points into a thin, self-crossing shape.
  const leftOuter = leftFold ? `M55 74 Q47 61 ${left(45,46)} Q${left(43,31)} ${left(47,14)} Q${left(62,21.5)} ${left(70.813,42.5)} Q73.75 49.5 76 58 L75 74Z` : 'M55 74 Q39 48 47 14 Q67 24 76 58 L75 74Z';
  const leftInner = leftFold ? `<path d="M54 59 Q${left(48,40)} ${left(52,27)} Q${left(64,38)} 67 63Z" fill="#d7e4b5" stroke="none"/>` : '<path d="M54 59 Q48 40 52 27 Q64 38 67 63Z" fill="#e3ebc2" stroke="none"/>';
  const rightOuter = rightFold ? `M116 72 Q117.5 51.5 ${right(123.25,37)} Q${right(131,22.5)} ${right(143,14)} Q${right(150,28.5)} ${right(148.5,43.5)} Q147 58.5 137 74Z` : 'M116 72 Q119 31 143 14 Q157 43 137 74Z';
  const rightInner = rightFold ? `M126 63 Q${right(129,42)} ${right(140,27)} Q${right(145,45)} 135 66Z` : 'M126 63 Q129 42 140 27 Q145 45 135 66Z';
  const leftVein = leftFold ? `M${left(53,33)} Q${left(57,47)} 61 59` : 'M53 33 Q57 47 61 59';
  const rightVein = rightFold ? `M${right(139,33)} Q${right(136,47)} 131 59` : 'M139 33 Q136 47 131 59';
  const leftCrease = leftFold ? `<path data-part="ear-bend-left" d="M${left(48.6,45.6)} Q${left(60,46)} ${left(67.225,43.06)}" fill="none" stroke="#78936c" stroke-width="1.2" opacity="${round(leftFold*.55)}"/>` : '';
  const rightCrease = rightFold ? `<path data-part="ear-bend-right" d="M${right(126.82,38.12)} Q${right(138,42)} ${right(145,42.8)}" fill="none" stroke="#78936c" stroke-width="1.2" opacity="${round(rightFold*.55)}"/>` : '';
  return `<g data-part="leaf-ear-left" transform="rotate(${pose.earLeft} 65 67)">
    <defs><clipPath id="${prefix}-ear-left-clip"><path d="${leftOuter}"/></clipPath></defs>
    <path d="${leftOuter}" fill="url(#${prefix}-body)"/>
    <g clip-path="url(#${prefix}-ear-left-clip)">${leftInner}
    <path d="${leftVein}" fill="none" stroke="#b9cf98" stroke-width="1.2"/>${leftCrease}</g>
  </g><g data-part="leaf-ear-right" transform="rotate(${pose.earRight} 125 67)">
    <defs><clipPath id="${prefix}-ear-right-clip"><path d="${rightOuter}"/></clipPath></defs>
    <path d="${rightOuter}" fill="url(#${prefix}-body)"/>
    <g clip-path="url(#${prefix}-ear-right-clip)"><path d="${rightInner}" fill="${rightFold ? '#d7e4b5' : '#e3ebc2'}" stroke="none"/>
    <path d="${rightVein}" fill="none" stroke="#b9cf98" stroke-width="1.2"/>${rightCrease}</g>
  </g>`;
}

function leafTail(pose, prefix, rear = false) {
  if (rear) {
    // The rear leaf grows from the spine and swings in front of the hips.
    // External climbing palms remain above it; resting paws stay behind it.
    return `<g data-part="back-leaf-tail" transform="translate(${pose.hipX} 0) rotate(${pose.tail} 98 153)">
      <path d="M97 155 Q111 140 120 132" fill="none" stroke="#5f814c" stroke-width="5"/>
      <path d="M105 151 Q112 122 150 106 Q168 128 149 148 Q132 162 105 151Z" fill="url(#${prefix}-leaf)"/>
      <path d="M109 150 Q130 137 150 114 M128 137 L128 123 M138 128 L151 131" fill="none" stroke="#bad697" stroke-width="1.8"/>
    </g>`;
  }
  return `<g data-part="side-leaf-tail" transform="rotate(${pose.tail} 132 145)">
    <path d="M125 151 Q137 143 143 132" fill="none" stroke="#5f814c" stroke-width="5"/>
    <path d="M137 142 Q139 117 168 98 Q186 115 171 132 Q156 147 137 142Z" fill="url(#${prefix}-leaf)"/>
    <path d="M141 139 L170 106 M153 124 L153 113 M162 116 L174 119" fill="none" stroke="#bad697" stroke-width="1.8"/>
  </g>`;
}

function foot(side, pose, prefix) {
  const left = side === 'left';
  const x = left ? 72 : 120;
  if (pose.legDrop) {
    const hip = left ? 75 : 117;
    const fx = (offset) => round(hip+(left ? offset : -offset));
    const fy = (y) => round(160+(y-160)*pose.legDrop);
    const angle = left ? 4 : -4;
    // The belly hides the thighs on the ground. Lifting reveals relaxed legs
    // with rounded toes, rather than stretching the ordinary standing soles.
    return `<g data-part="foot-${side}" transform="rotate(${angle} ${hip} 160)">
      <path d="M${fx(-8)} 158 Q${fx(-10)} ${fy(174)} ${fx(-7)} ${fy(185)} L${fx(-6)} ${fy(190)} Q${fx(-6)} ${fy(197)} ${fx(1)} ${fy(197)} Q${fx(9)} ${fy(197)} ${fx(7)} ${fy(190)} Q${fx(4)} ${fy(181)} ${fx(7)} ${fy(170)} L${fx(8)} 158Z" fill="url(#${prefix}-body)"/>
      <path d="M${fx(-2)} ${fy(192)} L${fx(-1)} ${fy(195)} M${fx(3)} ${fy(192)} L${fx(4)} ${fy(194)}" fill="none" stroke-width="1.2" opacity=".65"/>
    </g>`;
  }
  // Reveal a little more of the unchanged soles below the belly. This small
  // anatomy offset preserves their size, short legs and every pose's motion.
  const moveX = (left ? pose.footLeftX : pose.footRightX)+(left ? -1 : 1);
  const moveY = (left ? pose.footLeftY : pose.footRightY)+2;
  const angle = left ? pose.footLeftAngle : pose.footRightAngle;
  const fx = (offset) => round(x+offset);
  const sit = pose.sit ?? 0;
  const fy = (standing,seated) => round(standing+(seated-standing)*sit);
  // The soles turn towards the viewer only while sitting. Their small warm
  // pads fade in with the existing pose without changing either foot outline.
  const pads = sit > 0 ? `<g data-part="paw-pads-${side}" opacity="${round(sit)}" fill="#d7aaa3" stroke="#9c8071" stroke-width=".65">
    <path d="M${fx(-6)} ${fy(169,166)} C${fx(-6)} ${fy(166,162)} ${fx(-2)} ${fy(166,162)} ${x} ${fy(167,163.5)} C${fx(2)} ${fy(166,162)} ${fx(6)} ${fy(166,162)} ${fx(6)} ${fy(169,166)} C${fx(6)} ${fy(172,170)} ${fx(-6)} ${fy(172,170)} ${fx(-6)} ${fy(169,166)}Z"/>
    <ellipse cx="${fx(-6)}" cy="${fy(165,158)}" rx="2.1" ry="2.2"/>
    <ellipse cx="${x}" cy="${fy(164,156.5)}" rx="2.1" ry="2.2"/>
    <ellipse cx="${fx(6)}" cy="${fy(165,158)}" rx="2.1" ry="2.2"/>
  </g>` : '';
  return `<g data-part="foot-${side}" transform="translate(${moveX} ${moveY}) rotate(${angle} ${x} 166)">
    <path d="M${fx(-12)} ${fy(164,158)} Q${fx(-4)} ${fy(159,146)} ${fx(5)} ${fy(163,155)} Q${fx(19)} ${fy(163,163)} ${fx(14)} 171 Q${x} 177 ${fx(-13)} 171 Q${fx(-18)} ${fy(168,161)} ${fx(-12)} ${fy(164,158)}Z" fill="url(#${prefix}-body)"/>
    <path d="M${fx(-6)} 167 L${fx(-4)} 170 M${x} 166 L${fx(1)} 169" fill="none" stroke-width="1.2" opacity=".65"/>${pads}
  </g>`;
}

export function mohlikArm(side, pose) {
  const left = side === 'left';
  if (!left && pose.waveReach > 0) {
    const reach = pose.waveReach;
    // Rotate the unchanged plush paw as one piece. Its outline never grows
    // fingers or a long forearm; the soft underside turns towards the viewer.
    const angle = round(-154*reach+pose.waveWrist*.75);
    return `<g data-part="arm-right" data-gesture="wave" transform="rotate(${angle} 136 126)">
      <path d="M137 122 Q147 128 145 142 Q145 152 137 153 Q128 154 127 146 Q126 134 131 126" stroke-width="1.8"/>
      <g data-part="wave-paw-pads" opacity="${round(reach)}" fill="#d4ada3" stroke="none">
        <ellipse cx="137" cy="140.6" rx="3.5" ry="3"/>
        <ellipse cx="131.6" cy="147.5" rx="1.45" ry="1.65"/>
        <ellipse cx="137.4" cy="148.6" rx="1.45" ry="1.65"/>
        <ellipse cx="142.7" cy="146.5" rx="1.35" ry="1.55"/>
      </g>
      <g data-part="wave-paw-claws" opacity="${round(reach)}" fill="#faf4e2" stroke="#8c9978" stroke-width=".45">
        <path d="M130.8 151.7 Q130.3 153.2 131.6 154.2 Q132.6 153.4 132.5 152.3Z"/>
        <path d="M136.1 152.6 Q136.1 154.4 137.4 155.1 Q138.4 153.8 138.1 152.5Z"/>
        <path d="M141.8 151.1 Q142.3 153 143.8 153.1 Q144.3 151.8 143.6 150.7Z"/>
      </g>
    </g>`;
  }
  // Quiet actions rotate the original short paw at its shoulder. Scratching
  // brings the head to the paw instead of lengthening the arm.
  const gesture = left && pose.scratch > 0 ? ' data-gesture="scratch"' :
    pose.stretchSide === side ? ' data-gesture="stretch-paw"' : '';
  const shoulderLift = pose.stretchSide === side ?
    `translate(0 ${round(-5*Math.abs(left ? pose.leftArm : pose.rightArm)/174)}) ` : '';
  const scratchStroke = left && pose.scratch > 0 ? `translate(0 ${pose.scratchStroke??0}) ` : '';
  return `<g data-part="arm-${side}"${gesture} transform="${shoulderLift}${scratchStroke}rotate(${left ? pose.leftArm : pose.rightArm} ${left ? 56 : 136} 126)">
    <path d="${left ? 'M55 122 Q45 128 47 142 Q47 152 55 153 Q64 154 65 146 Q66 134 61 126' : 'M137 122 Q147 128 145 142 Q145 152 137 153 Q128 154 127 146 Q126 134 131 126'}" stroke-width="1.8"/>
  </g>`;
}

function climbingArm(side, y, bend = 0, pull = 0) {
  const transform = side === 'right' ? ' transform="translate(192 0) scale(-1 1)"' : '';
  const flex = Math.max(0,Math.min(1,bend/8));
  // Legacy fallback poses use a 66px grip origin. Bring that small movement
  // beside the cheek too, rather than stretching their arms up to the ears.
  const gripY = Math.max(96,Math.min(113,y < 90 ? 105+(y-66)*.8 : y));
  const shoulder = {x:60,y:121-pull};
  const elbow = {x:49-3*flex,y:Math.max(gripY+5,shoulder.y-6+3*flex)};
  const wrist = {x:43,y:gripY+5};
  const normal = (from,to) => {
    const length = Math.hypot(to.x-from.x,to.y-from.y);
    return {x:-(to.y-from.y)/length*5,y:(to.x-from.x)/length*5};
  };
  const upper = normal(shoulder,elbow);
  const lower = normal(elbow,wrist);
  const jointLength = Math.hypot(upper.x+lower.x,upper.y+lower.y);
  const joint = {x:(upper.x+lower.x)/jointLength*5,y:(upper.y+lower.y)/jointLength*5};
  const point = (base,offset,sign=1) => `${round(base.x+offset.x*sign)} ${round(base.y+offset.y*sign)}`;
  // The rounded forearm stays close to the body. A plain mitten has no fingers
  // or hooks; its outline matches the companion's ordinary little paws.
  const armPath = `M${point(shoulder,upper)} Q${point(elbow,upper)} ${point(elbow,joint)} Q${point(elbow,lower)} ${point(wrist,lower)} L${point(wrist,lower,-1)} Q${point(elbow,lower,-1)} ${point(elbow,joint,-1)} Q${point(elbow,upper,-1)} ${point(shoulder,upper,-1)} Q${round(shoulder.x+8)} ${round(shoulder.y)} ${point(shoulder,upper)}Z`;
  return `<g data-part="back-climb-${side}"${transform}>
    <path data-part="climb-elbow-${side}" d="${armPath}"/>
    <ellipse data-part="climb-paw-${side}" cx="43" cy="${round(gripY)}" rx="8" ry="9"/>
  </g>`;
}

function raisedArms(pose) {
  // The same short paws turn up to grip the cords beside the cheeks.
  // Keep the palms fixed while the head sways so the cords stay in the grip.
  const grip = {...pose,leftArm:155,rightArm:-155};
  return `<g data-part="raised-arms">
    ${mohlikArm('left',grip)}${mohlikArm('right',grip)}
    <path d="M44 107 Q48 110 51 107 M141 107 Q145 110 148 107" fill="none" stroke-width="1.2" opacity=".65"/>
  </g>`;
}

function face(pose) {
  const surprise = pose.surprise;
  const mouth = surprise
    ? '<ellipse cx="96" cy="112" rx="4" ry="5" fill="#617249" stroke-width="1.5"/>'
    : pose.curious
      ? '<path d="M88 111 Q96 118 105 110" fill="none" stroke-width="1.7"/>'
      : pose.joy > .25
      ? `<path d="M88 111 Q96 ${round(117+pose.joy*2)} 104 111 Q96 113 88 111Z" fill="#617249" stroke-width="1.4"/><path d="M92 116 Q96 114 100 116" fill="none" stroke="#c6ad8b" stroke-width="1.8"/>`
      : '<path d="M85 111 Q96 116 107 111" fill="none" stroke-width="1.7"/>';
  return `<g data-part="face">
    <ellipse cx="96" cy="109" rx="20" ry="9" fill="${cream}" stroke="none" opacity=".48"/>
    ${pose.curious ? '<path data-part="curious-brows" d="M64 73 Q72 70 80 73 M112 71 Q120 66 128 70" fill="none" stroke-width="1.5" opacity=".8"/>' : ''}
    ${eye(72, 90, pose.eyeLeft ?? pose.eyes, pose.joy, 1.2, pose.gazeX, pose.gazeY)}
    ${eye(120, 90, pose.eyeRight ?? pose.eyes, pose.joy, -1.2, pose.gazeX, pose.gazeY)}
    <g data-part="nose" transform="translate(${pose.noseTwitch??0} ${pose.noseLift??0})${pose.noseTilt ? ` rotate(${pose.noseTilt} 96 103)` : ''}"><path d="M90 103 Q96 98 102 103 Q96 109 90 103Z" fill="#52674b" stroke="none"/></g>
    ${mouth}
    <path d="M60 107 L44 104 M60 112 L43 113 M132 107 L148 104 M132 112 L149 113" fill="none" stroke="#789469" stroke-width="1.2"/>
  </g>`;
}

function headPoint(pose, x, y, pivotX = 96, pivotY = 99) {
  const angle = pose.headTilt * Math.PI / 180;
  return `${round(pivotX+(x-pivotX)*Math.cos(angle)-(y-pivotY)*Math.sin(angle)+pose.headX)} ${round(pivotY+(x-pivotX)*Math.sin(angle)+(y-pivotY)*Math.cos(angle)+pose.headY)}`;
}

function bodyPoint(pose, x, y) {
  return `${round(96+(x-96)*1.1+pose.hipX)} ${round(164+(y-164)*pose.bodyScale-(pose.climbPull??0))}`;
}

export function mohlikBody(pose = poseFor('idle', 0), raised = false, prefix = 'mohlik') {
  const rear = pose.backView === 1;
  const h = (x,y) => headPoint(pose,x,y);
  const b = (x,y) => bodyPoint(pose,x,y);
  // One pear-shaped outline blends the head into the soft, wider body. Only
  // the upper control points follow the head; lower points follow the hips.
  // A shared user-space fur gradient prevents a colour seam between them.
  const silhouette = `M${h(96,61)} C${h(72,56)} ${h(53,67)} ${h(52,87)} Q${h(51,100)} ${h(55,107)} C${b(43,120)} ${b(38,143)} ${b(52,160)} C${b(66,178)} ${b(125,178)} ${b(140,159)} C${b(155,141)} ${b(151,120)} ${h(137,106)} Q${h(143,87)} ${h(134,73)} Q${h(121,59)} ${h(96,61)}Z`;
  return `<g data-character="mohlik" fill="url(#${prefix}-fur)" stroke="${ink}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
    ${rear ? '' : leafTail(pose,prefix)}
    ${pose.sit || pose.climbHands ? '' : `${foot('left',pose,prefix)}${foot('right',pose,prefix)}`}
    <g data-part="head" transform="translate(${pose.headX} ${pose.headY}) rotate(${pose.headTilt} 96 99)">${ears(pose,prefix)}</g>
    <g data-part="body">
      <path data-part="continuous-silhouette" d="${silhouette}"/>
      ${rear ? '' : `<g transform="translate(${pose.hipX} ${round(164*(1-pose.bodyScale))}) scale(1 ${pose.bodyScale})"><path data-part="cream-belly" d="M59 120 Q96 104 134 120 Q151 144 130 163 Q100 177 67 163 Q44 144 59 120Z" fill="${cream}" stroke="none"/></g>`}
    </g>
    ${pose.sit || pose.climbHands ? `${foot('left',pose,prefix)}${foot('right',pose,prefix)}` : ''}
    <g transform="translate(${pose.headX} ${pose.headY}) rotate(${pose.headTilt} 96 99)">
      <path d="M59 75 Q70 67 80 67" fill="none" stroke="#e3edc8" stroke-width="3" opacity=".75"/>
      ${crown(prefix)}${rear ? '' : face(pose)}
    </g>
    ${rear && pose.climbHands ? leafTail(pose,prefix,true) : ''}
    ${pose.hideArms ? '' : pose.climbHands ? `${climbingArm('left',pose.climbLeftHandY??round(66+pose.climbHandY*2.4),pose.climbLeftElbow??0,pose.climbPull??0)}${climbingArm('right',pose.climbRightHandY??round(66-pose.climbHandY*2.4),pose.climbRightElbow??0,pose.climbPull??0)}` : raised ? raisedArms(pose) : `${mohlikArm('left',pose)}${mohlikArm('right',pose)}`}
    ${rear && !pose.climbHands ? leafTail(pose,prefix,true) : ''}
  </g>`;
}

/** Keep the ordinary short foot contours for both walking and page pushing. */
function profileFoot(side, pose, prefix = 'mohlik') {
  if (side === 'right') return `<g data-part="foot-right" transform="translate(${pose.footRightX} ${pose.footRightY}) rotate(${pose.footRightAngle} 94 164)"><path d="M84 155 Q92 151 102 161 L114 165 Q121 172 112 174 L91 171 Q81 166 84 155Z" fill="#8faf73"/></g>`;
  return `<g data-part="foot-left" transform="translate(${pose.footLeftX} ${pose.footLeftY}) rotate(${pose.footLeftAngle} 118 164)"><path d="M106 155 Q118 150 128 161 L141 166 Q148 173 138 175 L112 172 Q102 168 106 155Z" fill="url(#${prefix}-body)"/><path d="M130 167 L132 170 M138 167 L139 170" fill="none" stroke-width="1.2"/></g>`;
}

/** Canonical profile faces right; the runtime mirrors it for leftward travel. */
export function mohlikProfileBody(pose, prefix = 'mohlik', pushing = false) {
  const h = (x,y) => headPoint(pose,x,y,108,98);
  const b = (x,y) => {
    if (!pushing || !pose.pushLegBend) return bodyPoint(pose,x,y);
    // Tuck only the lowest fur above the short legs when crouching. The head
    // and cream belly are neither scaled nor compressed, and feet stay planted.
    const [bx,by] = bodyPoint(pose,x,y).split(' ').map(Number);
    return `${bx} ${round(by-pose.pushLegBend*Math.min(1,Math.max(0,(y-149)/22)))}`;
  };
  const silhouette = `M${h(103,61)} C${h(80,60)} ${h(66,78)} ${h(70,98)} Q${h(70,108)} ${b(78,115)} Q${b(65,132)} ${b(70,150)} Q${b(76,171)} ${b(103,172)} Q${b(133,174)} ${b(142,153)} Q${b(149,136)} ${b(139,115)} Q${h(150,111)} ${h(154,101)} Q${h(163,98)} ${h(157,92)} L${h(149,87)} Q${h(144,66)} ${h(123,62)} Q${h(114,58)} ${h(103,61)}Z`;
  return `<g data-character="mohlik" data-view="profile" fill="url(#${prefix}-fur)" stroke="${ink}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
    <g data-part="side-leaf-tail" transform="rotate(${pose.tail} 74 147)"><path d="M75 149 Q59 138 50 129" fill="none" stroke="#5f814c" stroke-width="5"/><path d="M58 142 Q33 142 21 118 Q42 98 61 116 Q70 128 58 142Z" fill="url(#${prefix}-leaf)"/><path d="M60 140 L28 119 M43 129 L40 116" fill="none" stroke="#bad697" stroke-width="1.7"/></g>
    ${pushing ? '' : profileFoot('right',pose,prefix)}
    ${pushing || pose.hideArms ? '' : `<g transform="rotate(${pose.leftArm} 83 128)"><path d="M82 123 Q72 132 76 147 Q80 156 89 152 Q95 145 88 131Z" fill="#a9c58e"/></g>`}
    <g data-part="head" transform="translate(0 ${pose.headY}) rotate(${pose.headTilt} 108 98)">
      <g transform="rotate(${pose.earLeft} 91 67)"><path d="M82 73 Q62 47 69 17 Q88 27 98 60 L97 73Z" fill="#a7c48a"/><path d="M76 30 Q86 43 91 62" fill="none" stroke="#dde8bc" stroke-width="4"/></g>
      <g transform="rotate(${pose.earRight} 123 67)"><path d="M113 70 Q117 35 139 15 Q153 42 134 75Z"/><path d="M139 28 Q135 48 127 62" fill="none" stroke="#e3ebc2" stroke-width="4"/></g>
    </g>
    <path data-part="continuous-silhouette" d="${silhouette}"/>
    <path data-part="cream-belly" d="M117 120 Q138 123 137 145 Q134 164 114 165 Q102 148 117 120Z" fill="${cream}" stroke="none"/>
    ${pushing ? '' : profileFoot('left',pose,prefix)}
    <g transform="translate(0 ${pose.headY}) rotate(${pose.headTilt} 108 98)">
      <ellipse cx="140" cy="108" rx="13" ry="9" fill="${cream}" stroke="none" opacity=".48"/>
      <g transform="translate(12 0)">${crown(prefix)}</g>
      ${eye(130,88,pose.eyeRight,pose.joy,0,pose.gazeX,pose.gazeY)}
      <path d="M151 97 Q160 93 159 99 L153 102Z" fill="#52674b" stroke="none"/>
      ${pushing && pose.pushEffort > .3 ? '<ellipse data-part="push-effort-mouth" cx="146" cy="111" rx="1.8" ry="2.1" fill="#52674b" stroke="none"/><path d="M139 107 L157 105 M139 113 L157 117" fill="none" stroke-width="1.3"/>' : '<path d="M140 111 Q147 114 152 110 M139 107 L157 105 M139 113 L157 117" fill="none" stroke-width="1.3"/>'}
      ${pose.turn < 1 ? '<path d="M89 91 Q94 84 98 91" fill="none" stroke="#302829" stroke-width="2"/>' : ''}
    </g>
    ${pushing || pose.hideArms ? '' : `<g transform="rotate(${pose.rightArm} 135 128)"><path d="M133 123 Q145 130 147 143 Q148 154 138 157 Q128 159 127 148 Q125 136 133 123" stroke-width="1.8"/></g>`}
  </g>`;
}

function wrap(content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">${mohlikDefs()}${content}</svg>`;
}

export function renderFrame(clip = 'idle', frame = 0) {
  const pose = {...poseFor(clip,frame)};
  if (clip === 'wave' && frame > 0 && frame < 23) {
    // Raise the paw quickly, give three broad wrist waves, then lower it.
    // The original 24-frame / 16fps contract stays exactly the same.
    const reach = Math.min(1,frame/3,(23-frame)/3);
    pose.waveReach = Math.max(0,reach);
    pose.waveWrist = Math.sin(frame/23*Math.PI*6)*25*reach;
    pose.headTilt = Math.sin(frame/23*Math.PI*2)*2;
    pose.joy = .35+.2*reach;
  }
  return wrap(mohlikBody(pose));
}

export const PUSH_CLIPS = {
  'push-left': { count: 12, fps: 8, end: 'hold' },
  'push-right': { count: 12, fps: 8, end: 'hold' },
};

// These drawings share the optional page-push sheet. Their playback is driven
// by the approach path, so a ball cannot spin while its position is stopped.
export const ROLL_CLIPS = {
  curl: { count: 8, fps: 16, end: 'hold' },
  roll: { count: 16, fps: 16, end: 'hold' },
  'unroll-left': { count: 8, fps: 16, end: 'hold' },
  'unroll-right': { count: 8, fps: 16, end: 'hold' },
};

function curledBody(tuck) {
  const mix = (from,to) => round(from+(to-from)*tuck);
  const point = (x,y,bx,by) => `${mix(x,bx)} ${mix(y,by)}`;
  const pose = {...poseFor('idle',0),leftArm:-105*tuck,rightArm:105*tuck,
    earLeft:135*tuck,earRight:-135*tuck,tail:-135*tuck,eyes:1-tuck,joy:.35};
  const visible = round(Math.max(0,1-tuck*1.25));
  // The head lowers into the belly while the pear-shaped back rounds out.
  // Keep the floor at y=176 instead of scaling the complete standing drawing.
  const outline = `M${point(96,61,96,65)} C${point(72,56,76,65)} ${point(53,67,53,76)} ${point(52,87,46,96)} Q${point(51,100,40,109)} ${point(55,107,41,120)} C${point(37.7,120,41,141)} ${point(32.2,143,55,161)} ${point(47.6,160,74,171)} C${point(63,178,87,177)} ${point(127.9,178,112,177)} ${point(144.4,159,128,165)} C${point(160.9,141,144,152)} ${point(156.5,120,153,132)} ${point(137,106,151,112)} Q${point(143,87,150,90)} ${point(134,73,134,78)} Q${point(121,59,116,65)} ${point(96,61,96,65)}Z`;
  return `<g data-character="mohlik" data-view="curled" fill="url(#mohlik-fur)" stroke="${ink}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
    <defs><clipPath id="mohlik-tucking-face"><path d="M20 0H174V${round(119-24*tuck)}Q96 ${round(134-28*tuck)} 20 ${round(119-24*tuck)}Z"/></clipPath></defs>
    ${tuck < .8 ? leafTail(pose,'mohlik') : ''}
    ${tuck < .8 ? `<g transform="translate(0 ${round(-12*tuck)})">${foot('left',pose,'mohlik')}${foot('right',pose,'mohlik')}</g>` : ''}
    <g transform="translate(0 ${round(25*tuck)})">${ears(pose,'mohlik')}</g>
    <path data-part="curled-silhouette" d="${outline}"/>
    <g opacity="${visible}" transform="translate(0 ${round(21*tuck)})">
      <path d="M59 120 Q96 104 134 120 Q151 144 130 163 Q100 177 67 163 Q44 144 59 120Z" fill="${cream}" stroke="none"/>
    </g>
    <g clip-path="url(#mohlik-tucking-face)"><g transform="translate(0 ${round(34*tuck)}) rotate(${round(12*tuck)} 96 99)"><g opacity="${visible}">${crown('mohlik')}</g>${face(pose)}</g></g>
    ${tuck < .8 ? `${mohlikArm('left',pose)}${mohlikArm('right',pose)}` : ''}
    <g data-part="folded-leaves" opacity="${round(tuck*tuck)}">
      <path d="M66 84 Q72 67 97 67 Q101 86 82 94 Q72 95 66 84Z" fill="url(#mohlik-leaf)"/>
      <path d="M70 84 Q80 77 92 73" fill="none" stroke="#bad697" stroke-width="1.5"/>
      <path d="M110 80 C141 91 147 125 125 144 Q110 155 94 143 Q126 148 131 121 Q135 98 110 80Z" fill="${cream}" stroke="none" opacity=".65"/>
      <path d="M67 112 Q60 129 78 139 Q94 147 111 135" fill="none" stroke="#92b17a" stroke-width="1.5"/>
      <path data-part="wrapped-leaf-tail" d="M62 149 Q100 166 146 124 Q145 158 116 171 Q81 177 62 149Z" fill="url(#mohlik-leaf)"/>
      <path d="M68 152 Q111 170 139 137 M105 161 L107 150 M121 154 L132 155" fill="none" stroke="#bad697" stroke-width="1.5"/>
    </g>
  </g>`;
}

export function renderRollFrame(name, frame = 0) {
  const clip = ROLL_CLIPS[name];
  if (!clip || !Number.isInteger(frame) || frame < 0 || frame >= clip.count) throw new Error(`Unknown page-roll frame: ${name}/${frame}`);
  if (name === 'curl') {
    if (frame === 0) return renderFrame();
    return wrap(curledBody([0,.04,.16,.38,.65,.84,.96,1][frame]));
  }
  if (name === 'roll') return wrap(`<g transform="rotate(${frame*360/clip.count} 96 120)">${curledBody(1)}</g>`);
  if (frame < 4) return wrap(curledBody([1,.91,.66,.32][frame]));
  const push = name === 'unroll-left' ? 'push-left' : 'push-right';
  if (frame >= 5) return renderPushFrame(push,7-frame);
  const pose = {...poseForLook(push),turn:.55,headTilt:2,leftArm:-25,rightArm:25,joy:.35};
  const profile = mohlikProfileBody(pose);
  return wrap(name === 'unroll-left' ? `<g transform="translate(192 0) scale(-1 1)">${profile}</g>` : profile);
}

export function renderPushFrame(name = 'push-right', frame = 0) {
  if (!(name in PUSH_CLIPS) || !Number.isInteger(frame) || frame < 0 || frame >= 12) throw new Error(`Unknown page-push frame: ${name}/${frame}`);
  const pose = {...poseForLook(name)};
  // Sink gently into the short legs, lean into the page, then recover for the
  // next effort. Head and belly retain their original full-size geometry.
  const effort = [0, .03, .35, .65, .9, 1, .95, .8, .65, .4, .15, .02][frame];
  const lean = [3, 2.6, -1.5, 3.5, 7.5, 10.5, 9.7, 9.1, 8, 6, 4.2, 3.1][frame];
  const crouch = [0, .5, 4, 1.5, -1.4, -3, -2.4, -2.1, -1.7, -.8, -.2, 0][frame];
  const bodyX = [-4, -4, -4, -4.2, -5.5, -7, -6.6, -6.2, -5.8, -5, -4.4, -4][frame];
  pose.pushLegBend = [0, .4, 3.6, 1, 0, 0, 0, 0, 0, 0, 0, 0][frame];
  pose.pushEffort = effort;
  pose.eyeRight = 1 - effort*.45;
  pose.joy = .35;
  // The same short sole shapes take visibly separate steps: one foot lifts
  // 6px and lands in front while the other braces behind the plush torso.
  // The brief first two drawings let him gather himself between two efforts.
  pose.footLeftX = [-2, -2.5, -4, -7, -3, 4, 7, 2, -5, -1, -2, -2.2][frame];
  pose.footLeftY = [0, -.15, 0, -2, -6, -5, 0, 0, -4, -5, -1, -.1][frame];
  pose.footRightX = [-15, -15.2, -13, -4, -6, -11, -16, -14, -7, -6, -12, -14.8][frame];
  pose.footRightY = [0, -.1, 0, 0, 0, 0, -6, -5, 0, 0, -5, -.15][frame];
  const brace = 'translate(-4 0) rotate(3 108 173)';
  // Paws live outside the moving torso group: their page contacts stay fixed
  // at x≈170/22 throughout the preparation, steps and return. Both contours
  // are the normal short paws, never elongated hands or new finger shapes.
  const farPaw = '<g data-part="push-paw-far" transform="translate(64 -20) rotate(-72 83 128)"><path d="M82 123 Q72 132 76 147 Q80 156 89 152 Q95 145 88 131Z" fill="#a9c58e"/></g>';
  const nearPaw = '<g data-part="push-paw-near" transform="translate(8 -4) rotate(-72 135 128)"><path d="M133 123 Q145 130 147 143 Q148 154 138 157 Q128 159 127 148 Q125 136 133 123" stroke-width="1.8"/></g>';
  return wrap(`<g data-view="page-push" data-side="${name === 'push-left' ? 'left' : 'right'}"${name === 'push-left' ? ' transform="translate(192 0) scale(-1 1)"' : ''}><g fill="url(#mohlik-fur)" stroke="${ink}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
    <g data-gesture="push-contact" transform="${brace}">${farPaw}</g>
    <g data-gesture="push-effort" data-effort="${effort}" transform="translate(${bodyX} ${crouch}) rotate(${lean} 108 173)">${mohlikProfileBody(pose,'mohlik',true)}</g>
    <g data-gesture="push-support" transform="${brace}">${profileFoot('right',pose)}</g>
    <g data-gesture="push-support" transform="${brace}">${profileFoot('left',pose)}</g>
    <g data-gesture="push-contact" transform="${brace}">${nearPaw}</g>
  </g></g>`);
}

export function renderPose(name) {
  if (name === 'push-left' || name === 'push-right') return renderPushFrame(name, 0);
  return wrap(mohlikBody(poseForLook(name)));
}

export function renderExtraFrame(name, frame) {
  return wrap(mohlikBody(poseForExtra(name,frame)));
}

export function renderPersonalityFrame(index) {
  const pose = personalityPose(index);
  const {kind,frame} = PERSONALITY_FRAMES[index];
  const airborne = kind === 'held' || kind === 'fall' || kind === 'parachute';
  // Keep one relaxed leg pose throughout a drop, including canopy deployment.
  if (airborne) {
    pose.legDrop = kind === 'held' ? [.72,1,1][frame] : 1;
    // Settle the full-size head closer to the lifted torso so even the highest
    // ear tips keep their margin, with room below for the dangling legs.
    pose.headY += 8;
  }
  if (kind === 'held') {
    pose.surprise = 0;
    pose.curious = true;
    pose.joy = .18;
    pose.gazeY = -2.8;
    pose.eyeLeft = .94;
    // The ordinary short paws spread on pickup, then settle by the belly.
    pose.leftArm = [34,18,22][frame];
    pose.rightArm = [-30,-20,-16][frame];
  }
  let content = pose.turn ? mohlikProfileBody(pose) : mohlikBody(pose,kind === 'parachute');
  // Lift the full-size torso to leave space for the revealed legs in the cell.
  if (airborne) content = `<g transform="translate(0 -12)">${content}</g>`;
  if (pose.turn === .55) content = `<g transform="translate(10 0) scale(.92 1)">${content}</g>`;
  // Preserve body/head size while rotating the tucked drawing around its centre.
  if (kind === 'somersault') {
    const fitX = round(Math.sin(pose.rotation*Math.PI/180)*2.5);
    content = `<g transform="translate(${round(96+fitX)} 96) rotate(${pose.rotation}) translate(-99 -83)">${content}</g>`;
  }
  return wrap(content);
}

/** Two sideways heads for the left vertical edge; the right edge mirrors them. */
export function renderHeadPeekFrame(frame = 0) {
  if (frame !== 0 && frame !== 1) throw new Error(`Unknown head peek frame: ${frame}`);
  const pose = {...poseFor('idle',0),gazeX:frame?-1.6:-.8,gazeY:frame?-.7:0,headTilt:frame?92:88,earLeft:frame?-2:1,earRight:frame?2:-1};
  // Reuse the standing face, crown and full-length ears at their original
  // coordinates. Only the neck is cut off; the head is never scaled down.
  return wrap(`<g data-character="mohlik" data-view="head-peek" fill="url(#mohlik-fur)" stroke="${ink}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" transform="translate(5 7) rotate(${pose.headTilt} 96 96)">
    ${ears(pose,'mohlik')}
    <path data-part="head-only" d="M96 61 C72 56 53 67 52 87 Q51 100 55 107 Q66 124 96 125 Q125 125 137 106 Q143 87 134 73 Q121 59 96 61Z"/>
    ${crown('mohlik')}${face(pose)}
  </g>`);
}

/** Quiet, finite gestures, rendered independently of the travelling sheet. */
export function renderCalmFrame(name, frame = 0) {
  const clip = CALM_CLIPS[name];
  if (!clip || !Number.isInteger(frame) || frame < 0 || frame >= clip.count) throw new Error(`Unknown calm frame: ${name}/${frame}`);
  const pose = {...poseFor('idle',0)};
  let stretchAngle = 0;
  if (name === 'sit') {
    const sit = [0,.2,.55,.85,1,1,1,1,1,.7,.25,0][frame];
    pose.sit = sit;
    pose.headY = round(7*sit);
    pose.headTilt = [0,.5,1,1.5,1,.5,0,-.5,-1,-.5,0,0][frame];
    pose.bodyScale = 1-.11*sit;
    pose.footLeftX = -5*sit;
    pose.footRightX = 5*sit;
    pose.leftArm = -5*sit;
    pose.rightArm = 5*sit;
    pose.eyeLeft = pose.eyeRight = frame === 6 ? .3 : 1;
    pose.earLeft = .6*sit;
    pose.earRight = -.6*sit;
    pose.tail = -3*sit;
  } else if (name === 'scratch') {
    pose.scratch = [0,.35,.8,1,1,1,1,1,1,.8,.35,0][frame];
    pose.leftArm = [0,60,135,168,168,168,168,168,168,133,57,0][frame];
    pose.scratchStroke = [0,0,4,9,5,9.3,5.3,9.6,5.6,3,0,0][frame];
    pose.headX = round(-9*pose.scratch);
    pose.headY = round(5*pose.scratch);
    pose.headTilt = [0,-2,-7,-10,-10.6,-9.5,-10.3,-9.7,-10.1,-6.5,-1.8,0][frame];
    pose.gazeX = -2*pose.scratch;
    pose.eyeLeft = .35+.65*(1-pose.scratch);
    pose.eyeRight = .85+.15*(1-pose.scratch);
    pose.earLeft = pose.scratch*2;
    pose.earRight = -pose.scratch*.5;
  } else if (name === 'ears') {
    pose.earFoldLeft = [0,.5,1,.5,0,0,0,0,.55,1,.55,0][frame];
    pose.earFoldRight = [0,0,0,0,.5,1,.5,0,.55,1,.55,0][frame];
    pose.headTilt = [0,-.7,-1,-.4,.7,1,.4,0,-.3,.3,0,0][frame];
    pose.gazeX = [0,-1,-2,-1,1,2,1,0,0,.5,0,0][frame];
    pose.eyeLeft = pose.eyeRight = frame === 9 ? .35 : 1;
  } else if (name === 'stretch') {
    const half = frame < 10 ? 0 : 1;
    const step = frame % 10;
    const lean = [0,0,2,5,8,10,8,5,1,0][step];
    const lift = [0,65,150,168,171,174,168,155,65,0][step];
    stretchAngle = (half ? 1 : -1)*lean;
    pose.stretchSide = lift ? half ? 'left' : 'right' : null;
    pose.leftArm = half ? lift : 0;
    pose.rightArm = half ? 0 : -lift;
    pose.headTilt = round(stretchAngle*-.15);
    pose.gazeX = round(stretchAngle/5);
    pose.eyeLeft = pose.eyeRight = lean >= 8 ? .8 : 1;
    pose.tail = round(-stretchAngle*.3);
  } else if (name === 'nose') {
    pose.noseTwitch = [0,-1,-3,1,3,-2,1,0][frame];
    pose.noseLift = [0,-.3,-.65,-.2,.4,-.5,-.15,0][frame];
    pose.noseTilt = [0,-6,-10,5,8,-8,3,0][frame];
  }
  const content = mohlikBody(pose);
  return wrap(stretchAngle ? `<g data-gesture="stretch" transform="rotate(${stretchAngle} 96 173)">${content}</g>` : content);
}
