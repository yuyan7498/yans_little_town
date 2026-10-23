// Body proportions and the joint layout every figure shares. Pure numbers: the figure
// builder places geometry around these joints and the pose solver moves them.
//
// Bones (one rigid part each; vertices are baked in their bone's local space):
//   0 pelvis (origin at the hip joints' centre)   1 torso (origin at the waist)   2 head (origin at the neck top)
//   3/4 upper arm / forearm+hand, left (−z)       5/6 the same, right (+z)
//   7/8/9 thigh / shin / foot, left               10/11/12 the same, right
//   13 prop (cane, drip stand, bag)  14 helmet (riding a scooter)  15 hat (not when helmeted)
//   16 hem (skirt, coat tails, apron: hangs from the hips, follows the thighs when seated)
// Model forward is +x, up +y, right +z; the figure stands on y = 0.

import { ADULT_HEIGHT } from './appearance.js';

export const BONE = { pelvis: 0, torso: 1, head: 2, upperL: 3, foreL: 4, upperR: 5, foreR: 6,
  thighL: 7, shinL: 8, footL: 9, thighR: 10, shinR: 11, footR: 12, prop: 13, helmet: 14, hat: 15, hem: 16 };
export const BONES = 17;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = t => Math.max(0, Math.min(1, t));
const TODDLER = 2.2;

export function bodyOf(a) {
  const H = a.height;
  const t = clamp01((H - TODDLER) / (ADULT_HEIGHT - TODDLER));   // 0 toddler … 1 adult
  const k = H / ADULT_HEIGHT;
  const w = lerp(0.7, 1, t) * a.build;                          // width scale
  const hipY = H * lerp(0.35, 0.43, t);                         // adult: 1.85 = HIP_HEIGHT
  const footH = 0.17 * hipY / 1.85;
  const legLen = hipY - footH;
  const thigh = legLen * 0.505, shin = legLen - thigh;
  const headH = lerp(0.68, 0.84, t) * Math.sqrt(H / lerp(TODDLER, ADULT_HEIGHT, t));
  const hairTop = 0.07 * headH;
  const neckTop = H - headH - hairTop;
  const neck = lerp(0.06, 0.13, t) * Math.max(0.8, k);
  const shoulderTop = neckTop - neck;
  const span = shoulderTop - hipY;
  const waist = span * 0.2;                                     // hip joint → waist (torso origin)
  const torsoLen = span - waist;
  const torsoHW = 0.46 * w, torsoHD = lerp(0.3, 0.27, t) * w;
  const shoulderY = torsoLen - 0.14 * k;                         // shoulder joint, torso space
  const fingertipY = hipY - lerp(0.02, 0.13, t);
  const armTotal = waist + shoulderY + hipY - fingertipY;
  return {
    H, k, t, w, hipY, footH, legLen, thigh, shin,
    footLen: 0.5 * Math.pow(k, 0.85), footW: 0.25 * w,
    hipZ: 0.19 * w, thighR: 0.165 * w, shinR: 0.125 * w,
    waist, torsoLen, torsoHW, torsoHD, neck, neckR: 0.13 * w * lerp(0.9, 1, t), neckTop: torsoLen + neck,
    headH, headHW: 0.4 * headH, headHD: 0.43 * headH, headCX: 0.04 * headH, hairTop,
    shoulderY, shoulderZ: torsoHW + 0.03 * w,
    upper: armTotal * 0.44, fore: armTotal * 0.4, hand: armTotal * 0.16, armR: 0.115 * w
  };
}
