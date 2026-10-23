// The town's animals: the stray cat 橘子 and the stray dog 黑輪, a dozen pet dogs on
// leashes, and the strays' nests. Same style and same skinned-batch trick as the crowd:
// every animal is one set of rigid parts baked into a slot, posed by writing bone
// matrices into a texture; nests are merged static meshes.
//
//   createAnimals({ nests, quality }) → { object, update(list, frame), dispose(), info() }
//     list entries: { id, species: 'cat'|'dog', x, y, z, heading, pose, stride }
//                   pose 'walk' | 'stand' | 'sit' | 'lie' | 'eat'
//     pet dogs:     { id: ownerId + ':dog', species: 'dog', pet: true, x, y, z, heading, stride }
//                   (x, y, z is the owner's point; the dog goes 1.2 ahead and 0.7 to the right
//                   and a leash runs from the owner's right hand to its collar)
//     nests: spots { id, kind: 'nest', animal: 'cat'|'dog', x, z, heading }
//   createAnimalFigure(resident) → { object, update(stride, pose), dispose() }
//   preview(ctx) for tools/preview.html?m=src/render/people/animals.js
// Model space: forward +x, up +y, width z, feet on y = 0.

import * as THREE from 'three';
import { hash } from '../../core/random.js';
import { FigureMesh, shade, linearRGB } from './shapes.js';
import { pack } from './build.js';
import { skinned } from './crowd.js';
import { put, point, L, V, finish } from './pose.js';

const BODY = 0, HEAD = 1, TAIL = 2, TAIL2 = 3, FL = 4, FR = 5, BL = 6, BR = 7, LEASH = 8;
const AB = 9;                       // bones per animal
const ROW = AB * 3;
const VMAX = 700, TMAX = 700;
const EYE = '#241a16', NOSE = '#1b1514', TONGUE = '#d9737a';

// --- breeds -------------------------------------------------------------------------

const BREEDS = {
  tudog: { species: 'dog', Ln: 1.15, B: 1.05, bh: 0.42, hs: 0.58, snout: 0.9, ears: 'perk', tail: 'curl', coat: '#2d2926', belly: '#37322e', muzzle: '#54483f', paw: '#2d2926', brow: '#a07a45', gait: 0.55 },
  shiba: { species: 'dog', Ln: 1.0, B: 0.92, bh: 0.38, hs: 0.54, snout: 0.75, ears: 'perk', tail: 'curl', coat: '#d98f45', belly: '#f5e8d2', muzzle: '#f5e8d2', paw: '#f5e8d2', chest: '#f5e8d2', gait: 0.55 },
  mixwhite: { species: 'dog', Ln: 1.1, B: 1.0, bh: 0.4, hs: 0.54, snout: 0.9, ears: 'semi', tail: 'otter', coat: '#f1ece2', belly: '#f1ece2', muzzle: '#f1ece2', paw: '#f1ece2', patch: '#c9a77c', gait: 0.55 },
  lab: { species: 'dog', Ln: 1.3, B: 1.15, bh: 0.46, hs: 0.6, snout: 1.0, ears: 'drop', tail: 'otter', coat: '#2d2926', belly: '#2d2926', muzzle: '#3f3832', paw: '#2d2926', gait: 0.5 },
  corgi: { species: 'dog', Ln: 1.15, B: 0.62, bh: 0.32, hs: 0.56, snout: 0.95, ears: 'big', tail: 'stub', coat: '#dc8a3c', belly: '#faf3e6', muzzle: '#faf3e6', paw: '#faf3e6', chest: '#faf3e6', gait: 0.6 },
  poodle: { species: 'dog', Ln: 0.85, B: 0.95, bh: 0.36, hs: 0.42, snout: 1.0, ears: 'puff', tail: 'pom', coat: '#ead5b3', belly: '#ead5b3', muzzle: '#ead5b3', paw: '#ead5b3', puffy: true, gait: 0.5 },
  brownmix: { species: 'dog', Ln: 1.0, B: 0.85, bh: 0.38, hs: 0.52, snout: 0.9, ears: 'semi', tail: 'otter', coat: '#8a5a37', belly: '#c9a47a', muzzle: '#c9a47a', paw: '#c9a47a', gait: 0.55 },
  tabby: { species: 'cat', Ln: 0.64, B: 0.6, bh: 0.34, hs: 0.37, snout: 0.35, ears: 'cat', tail: 'cat', coat: '#e8892f', belly: '#f6d9a8', muzzle: '#f6d9a8', paw: '#f6d9a8', stripe: '#bf5f1c', chest: '#f6d9a8', gait: 0.6, chubby: 1.18 }
};
const PET_BREEDS = ['shiba', 'mixwhite', 'lab', 'corgi', 'poodle', 'brownmix', 'tudog'];
const STRAY = { dog: 'tudog', cat: 'tabby' };

export function breedFor(entry) {
  if (entry.breed && BREEDS[entry.breed]) return entry.breed;
  if (entry.pet) return PET_BREEDS[hash(String(entry.id).replace(/:dog$/, '') + '|breed') % PET_BREEDS.length];
  return STRAY[entry.species] || 'tudog';
}

// --- geometry ------------------------------------------------------------------------

function buildAnimal(name, lite) {
  const sp = BREEDS[name], m = new FigureMesh(lite);
  const { Ln, B, hs } = sp, bh = sp.bh, ch = sp.chubby || 1;
  const bw = bh * 0.92 * ch, legOY = -0.3 * bh, legLen = B - 0.8 * bh;
  const lr = bh * 0.24 * (sp.species === 'cat' ? 0.85 : 1), R = bh / 2, W = bw / 2;
  const headX = Ln * 0.5, headY = 0.32 * bh;

  // body: a lathe along x
  const body = [[-0.5 * Ln, 0.62 * R, 0.62 * W], [-0.38 * Ln, 0.92 * R, 0.95 * W], [-0.1 * Ln, 1.0 * R, 1.02 * W], [0.2 * Ln, 1.04 * R, 1.0 * W], [0.4 * Ln, 0.98 * R, 0.92 * W], [0.5 * Ln, 0.8 * R, 0.76 * W]];
  m.lathe(BODY, sp.coat, body.map(([y, a, b]) => [y, a, b]), { n: 8, bottom: -0.5 * Ln - 0.06 * Ln, top: 0.5 * Ln + 0.04 * Ln, rot: [0, 0, -Math.PI / 2] });
  // pale belly strip under it
  if (sp.belly !== sp.coat) m.box(BODY, sp.belly, 0.05 * Ln, -0.42 * bh, 0, 0.62 * Ln, 0.14 * bh, 0.5 * bw);
  if (sp.chest) m.ball(BODY, sp.chest, 0.44 * Ln, -0.12 * bh, 0, 0.12 * Ln, 0.3 * bh, 0.34 * bw, { n: 6, m: 4 });
  if (sp.patch) { m.ball(BODY, sp.patch, 0.0, 0.28 * bh, 0.32 * bw, 0.22 * Ln, 0.16 * bh, 0.12 * bw, { n: 6, m: 3 }); }
  if (sp.puffy) { m.ball(BODY, sp.coat, 0.4 * Ln, 0.1 * bh, 0, 0.18 * Ln, 0.42 * bh, 0.5 * bw, { n: 6, m: 4 }); m.ball(BODY, sp.coat, -0.42 * Ln, 0.1 * bh, 0, 0.14 * Ln, 0.36 * bh, 0.46 * bw, { n: 6, m: 4 }); }
  if (sp.stripe) {
    for (const x of [-0.3, -0.05, 0.2]) m.box(BODY, sp.stripe, x * Ln, 0.43 * bh, 0, 0.07 * Ln, 0.06 * bh, 0.5 * bw);
    for (const s of [-1, 1]) for (const x of [-0.25, 0.08]) m.box(BODY, sp.stripe, x * Ln, 0.12 * bh, s * 0.47 * bw, 0.06 * Ln, 0.36 * bh, 0.03 * bw);
  }
  // legs: lathe hanging down from the joint + a paw
  const pawH = 0.07 * B + 0.02;
  for (const [bone, x, z, front] of [[FL, 0.36, -1, 1], [FR, 0.36, 1, 1], [BL, -0.33, -1, 0], [BR, -0.33, 1, 0]]) {
    const r = lr * (front ? 1 : 1.06);
    m.lathe(bone, sp.coat, [[0, 1.0 * r, 1.0 * r], [-legLen * 0.5, 0.78 * r, 0.78 * r], [-legLen + pawH, 0.66 * r, 0.66 * r]], { n: 6, bottom: null, top: 'flat' });
    m.box(bone, sp.paw, 0.1 * r, -legLen + pawH / 2, 0, 2.1 * r, pawH, 1.35 * r);
    if (sp.puffy && !front) m.ball(bone, sp.coat, 0, -0.15 * legLen, 0, 1.3 * r, 0.2 * legLen, 1.3 * r, { n: 5, m: 3 });
    void x; void z;
  }
  // head
  const hh = sp.species === 'cat' ? hs * 1.05 : hs;
  m.ball(HEAD, sp.coat, 0.16 * hh, 0.22 * hh, 0, 0.5 * hh, 0.46 * hh, 0.5 * hh, { n: 7, m: 4 });
  m.ball(HEAD, sp.coat, -0.12 * hh, -0.05 * hh, 0, 0.42 * hh, 0.4 * hh, 0.34 * hh, { n: 6, m: 3 });         // neck
  const sl = 0.5 * hh * sp.snout;
  m.box(HEAD, sp.muzzle, 0.5 * hh + sl / 2 - 0.02 * hh, 0.1 * hh, 0, sl, 0.26 * hh, 0.3 * hh);
  m.box(HEAD, NOSE, 0.5 * hh + sl - 0.02 * hh + 0.015, 0.19 * hh, 0, 0.07 * hh, 0.1 * hh, 0.15 * hh);
  if (sp.species === 'dog') m.box(HEAD, sp.coat === '#2d2926' ? '#2a2420' : shade(sp.coat, -0.1), 0.5 * hh + sl / 2, 0.0, 0, sl * 0.9, 0.04 * hh, 0.3 * hh);
  const ex = 0.43 * hh, ez = 0.2 * hh;
  for (const s of [-1, 1]) {
    m.box(HEAD, EYE, ex + 0.1 * hh, 0.36 * hh, s * ez, 0.06 * hh, 0.09 * hh, 0.08 * hh, null, [0, 4]);
    if (sp.brow) m.box(HEAD, sp.brow, ex + 0.06 * hh, 0.5 * hh, s * ez, 0.05 * hh, 0.05 * hh, 0.07 * hh, null, [0]);
    if (sp.species === 'cat') m.box(HEAD, '#7fb35a', ex + 0.09 * hh, 0.36 * hh, s * ez, 0.05 * hh, 0.1 * hh, 0.1 * hh, null, [0]);
  }
  if (sp.species === 'cat') {
    for (const s of [-1, 1]) m.box(HEAD, '#f1a0a8', 0.5 * hh + sl * 0.2, 0.0, s * 0.02, 0.01, 0.01, 0.01);
    for (const s of [-1, 1]) for (const y of [0.34, 0.22]) m.box(HEAD, '#f4f1ea', 0.5 * hh + 0.05 * hh, y * hh * 0.7, s * 0.3 * hh, 0.02 * hh, 0.012 * hh, 0.34 * hh, [0, s * 0.3, 0]);
    m.box(HEAD, sp.stripe, 0.4 * hh, 0.6 * hh, 0, 0.12 * hh, 0.02 * hh, 0.05 * hh);
    m.box(HEAD, sp.stripe, 0.28 * hh, 0.62 * hh, 0, 0.12 * hh, 0.02 * hh, 0.05 * hh);
  }
  for (const s of [-1, 1]) {
    const tilt = [s * 0.28, 0, -0.1];
    switch (sp.ears) {
      case 'perk': m.lathe(HEAD, sp.coat, [[0, 0.17 * hh, 0.13 * hh]], { n: 4, bottom: null, top: 0.34 * hh, at: [0.02 * hh, 0.56 * hh, s * 0.27 * hh], rot: tilt }); break;
      case 'cat': m.lathe(HEAD, sp.coat, [[0, 0.17 * hh, 0.13 * hh]], { n: 4, bottom: null, top: 0.3 * hh, at: [0.0, 0.56 * hh, s * 0.25 * hh], rot: [s * 0.2, 0, -0.1] }); m.lathe(HEAD, '#f1a0a8', [[0, 0.1 * hh, 0.07 * hh]], { n: 4, bottom: null, top: 0.22 * hh, at: [0.03 * hh, 0.56 * hh, s * 0.25 * hh], rot: [s * 0.2, 0, -0.1] }); break;
      case 'big': m.lathe(HEAD, sp.coat, [[0, 0.24 * hh, 0.16 * hh]], { n: 4, bottom: null, top: 0.5 * hh, at: [0.0, 0.5 * hh, s * 0.28 * hh], rot: [s * 0.3, 0, -0.1] }); break;
      case 'drop': m.box(HEAD, sp.coat, 0.08 * hh, 0.3 * hh, s * 0.44 * hh, 0.22 * hh, 0.38 * hh, 0.07 * hh, [s * 0.18, 0, 0.1]); break;
      case 'semi': m.lathe(HEAD, sp.coat, [[0, 0.17 * hh, 0.13 * hh]], { n: 4, bottom: null, top: 0.22 * hh, at: [0.04 * hh, 0.56 * hh, s * 0.3 * hh], rot: [s * 0.7, 0, -0.5] }); break;
      case 'puff': m.ball(HEAD, sp.coat, 0.0, 0.2 * hh, s * 0.5 * hh, 0.2 * hh, 0.3 * hh, 0.15 * hh, { n: 5, m: 3 }); break;
      default: break;
    }
  }
  if (sp.puffy) m.ball(HEAD, sp.coat, 0.1 * hh, 0.62 * hh, 0, 0.3 * hh, 0.22 * hh, 0.3 * hh, { n: 6, m: 3 });
  // collar (the leash clips to it)
  m.lathe(HEAD, sp.species === 'cat' ? '#3a7ec0' : '#c6372f', [[-0.06 * hh, 0.4 * hh, 0.38 * hh, -0.12 * hh], [0.0 * hh, 0.4 * hh, 0.38 * hh, -0.12 * hh]], { n: 8, bottom: null, top: null, at: [0, -0.05 * hh, 0], rot: [0, 0, 0] });
  if (sp.species === 'dog' && !sp.puffy) m.box(HEAD, TONGUE, 0.5 * hh + sl * 0.7, -0.08 * hh, 0, 0.1 * hh, 0.02 * hh, 0.1 * hh);

  // tail: two segments pointing up in their own frames
  const tail = TAILS[sp.tail];
  m.lathe(TAIL, sp.tail === 'cat' ? sp.coat : sp.coat, [[0, tail.r, tail.r], [tail.l1, tail.r * 0.8, tail.r * 0.8]], { n: 5, bottom: 'flat', top: null });
  if (tail.l2) {
    m.lathe(TAIL2, sp.stripe || sp.coat, [[0, tail.r * 0.8, tail.r * 0.8], [tail.l2, tail.r2, tail.r2]], { n: 5, bottom: null, top: tail.l2 + tail.r2 });
    if (sp.stripe) m.lathe(TAIL2, '#f6d9a8', [[tail.l2 * 0.78, tail.r2 * 1.02, tail.r2 * 1.02], [tail.l2 * 0.95, tail.r2 * 1.02, tail.r2 * 1.02]], { n: 5, bottom: null, top: null });
  }
  if (sp.tail === 'pom') m.ball(TAIL2, sp.coat, 0, 0.0, 0, 0.13, 0.13, 0.13, { n: 6, m: 3 });
  if (sp.tail === 'otter' && name === 'mixwhite') m.lathe(TAIL2, sp.patch, [[0, 0.05, 0.05], [0.2, 0.04, 0.04]], { n: 5, top: 0.22 });
  // leash
  m.box(LEASH, '#c9372c', 0.5, 0, 0, 1, 0.035, 0.035);

  const mesh = pack(m);
  const rig = { name, species: sp.species, Ln, B, bh, bw, hs: hh, legLen, legOY, headX, headY, tail, gait: sp.gait, sitAngle: sp.species === 'cat' ? 0.95 : 0.85,
    frontX: Ln * 0.36, rearX: -Ln * 0.33, legZ: bw * 0.3, collar: [0.0, -0.1 * hh, 0] };
  return { mesh, rig };
}

const TAILS = {
  curl: { base: 0.8, curl: -1.5, l1: 0.26, r: 0.065, l2: 0.22, r2: 0.04 },
  otter: { base: 1.15, curl: -0.25, l1: 0.35, r: 0.085, l2: 0.25, r2: 0.045 },
  stub: { base: 0.7, curl: 0, l1: 0.13, r: 0.07, l2: 0, r2: 0 },
  pom: { base: 0.55, curl: 0, l1: 0.22, r: 0.04, l2: 0.0001, r2: 0.04 },
  cat: { base: 0.45, curl: -0.5, l1: 0.3, r: 0.055, l2: 0.27, r2: 0.04 }
};

// --- poses ---------------------------------------------------------------------------

function solveAnimal(r, p, t, out, o) {
  const kind = p.pose || 'walk', ph = p.stride || 0, cat = r.species === 'cat', dog = !cat;
  const bh = r.bh, tail = r.tail;
  let by = r.legLen - r.legOY, bx = 0, bpitch = 0;
  let fl = 0, fr = 0, bl = 0, br = 0, hz = 0, hy = 0, hdy = 0, tz = tail.base, ty = 0, t2z = tail.curl, t2y = 0;
  switch (kind) {
    case 'walk': {
      const A = r.gait, s = Math.sin(ph);
      fl = br = A * s; fr = bl = -A * s;
      by = r.legLen * Math.max(Math.cos(fl), Math.cos(fr)) - r.legOY + 0.005;
      bpitch = 0.03 * Math.sin(ph * 2);
      hz = -0.04 + 0.05 * Math.sin(ph * 2 + 0.6);
      ty = dog ? 0.6 * Math.sin(t * 13 + ph * 0) : 0.18 * Math.sin(ph);
      if (cat) { tz = 0.25; t2z = -0.35; }
      break;
    }
    case 'sit': {
      const a = r.sitAngle, s = Math.sin(a), c = Math.cos(a);
      by = r.Ln / 2 * s + bh / 2 * c + 0.02; bx = -(-r.Ln / 2 * c + bh / 2 * s) - r.Ln * 0.35;
      bpitch = a; fl = fr = -a; bl = br = 1.55 - a; hz = -a * 0.85 + 0.05 * Math.sin(t * 0.8);
      hy = 0.35 * Math.sin(t * 0.5);
      tz = 1.75; t2z = -0.2; ty = dog ? 0.3 * Math.sin(t * 6) : 0.12 * Math.sin(t * 1.5);
      by += 0.004 * Math.sin(t * 2.2);
      break;
    }
    case 'lie': {
      by = bh * 0.47 + 0.004 * Math.sin(t * 2); fl = fr = 1.5; bl = br = cat ? 1.35 : 1.15;
      if (cat) { hz = -0.7; hy = 0.95; hdy = -0.22 * bh; fl = fr = 1.35; tz = 1.55; ty = 2.5; t2z = 0; t2y = 0.9; }
      else { hz = -0.38; hdy = -0.2 * bh; tz = 1.5; t2z = -0.2; ty = 0.1 * Math.sin(t * 0.7); }
      break;
    }
    case 'eat': {
      bpitch = -0.1; fl = fr = 0.05; hz = -1.0 - 0.08 * Math.sin(t * 5); hdy = -0.05 * bh;
      by = r.legLen - r.legOY - 0.01; ty = dog ? 0.35 * Math.sin(t * 9) : 0.1 * Math.sin(t * 2); if (cat) { tz = 0.7; }
      break;
    }
    default: // stand
      hy = 0.3 * Math.sin(t * 0.6); hz = 0.04 * Math.sin(t * 0.9);
      ty = dog ? 0.25 * Math.sin(t * 4.5) : 0.12 * Math.sin(t * 1.3); if (cat) { tz = 0.35; t2z = -0.4; }
      by += 0.004 * Math.sin(t * 2);
  }
  put(BODY, -1, bx, by, 0, 0, 0, bpitch);
  put(HEAD, BODY, r.headX, r.headY + hdy, 0, 0, hy, hz);
  put(TAIL, BODY, -r.Ln * 0.5, 0.18 * bh, 0, 0, ty, tz);
  if (tail.l2) put(TAIL2, TAIL, 0, tail.l1, 0, 0, t2y, t2z); else L.fill(0, TAIL2 * 12, TAIL2 * 12 + 12);
  put(FL, BODY, r.frontX, r.legOY, -r.legZ, 0, 0, fl);
  put(FR, BODY, r.frontX, r.legOY, r.legZ, 0, 0, fr);
  put(BL, BODY, r.rearX, r.legOY, -r.legZ, 0, 0, bl);
  put(BR, BODY, r.rearX, r.legOY, r.legZ, 0, 0, br);
  // leash: from the owner's hand (world, in p.lx/ly/lz) to the collar
  if (p.leash) {
    point(HEAD, r.collar[0], r.collar[1], r.collar[2]);
    const bx2 = V[0], by2 = V[1], bz2 = V[2];
    const yaw = -(p.heading || 0), c = Math.cos(yaw), s = Math.sin(yaw);
    const dx = p.lx - p.x, dy = p.ly - (p.y || 0), dz = p.lz - p.z;
    const ax = c * dx - s * dz, ay = dy, az = s * dx + c * dz;
    let ex = bx2 - ax, ey = by2 - ay, ez = bz2 - az;
    const len = Math.hypot(ex, ey, ez) || 1e-3;
    const ux = ex / len, uy = ey / len, uz = ez / len;
    // a perpendicular pair
    let px = uy * 0 - uz * 1, py = uz * 0 - ux * 0, pz = ux * 1 - uy * 0;       // u × (0,1,0) = (−uz, 0, ux)
    px = -uz; py = 0; pz = ux;
    const pl = Math.hypot(px, pz) || 1; px /= pl; pz /= pl;
    const qx = uy * pz - uz * py, qy = uz * px - ux * pz, qz = ux * py - uy * px;
    const o9 = LEASH * 12;
    L[o9] = ex; L[o9 + 1] = qx; L[o9 + 2] = px; L[o9 + 3] = ax;
    L[o9 + 4] = ey; L[o9 + 5] = qy; L[o9 + 6] = py; L[o9 + 7] = ay;
    L[o9 + 8] = ez; L[o9 + 9] = qz; L[o9 + 10] = pz; L[o9 + 11] = az;
  } else L.fill(0, LEASH * 12, LEASH * 12 + 12);
  finish(out, o, p, AB);
}

// --- the animal batch -------------------------------------------------------------------

function createBatch(capacity, lite) {
  const V0 = capacity * VMAX;
  const position = new Float32Array(V0 * 3), normal = new Int8Array(V0 * 3), color = new Uint16Array(V0 * 3), skin = new Uint16Array(V0);
  const slotIndex = new Uint32Array(capacity * TMAX * 3), drawIndex = new Uint32Array(capacity * TMAX * 3);
  const bones = new Float32Array(capacity * ROW * 4);
  const geometry = new THREE.BufferGeometry();
  const attrs = {
    position: new THREE.BufferAttribute(position, 3), normal: new THREE.BufferAttribute(normal, 3, true),
    color: new THREE.BufferAttribute(color, 3, true), aSkin: new THREE.BufferAttribute(skin, 1)
  };
  for (const [k, a] of Object.entries(attrs)) { a.setUsage(THREE.DynamicDrawUsage); geometry.setAttribute(k, a); }
  const index = new THREE.BufferAttribute(drawIndex, 1);
  index.setUsage(THREE.DynamicDrawUsage);
  geometry.setIndex(index); geometry.setDrawRange(0, 0);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const texture = new THREE.DataTexture(bones, ROW, capacity, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = texture.magFilter = THREE.NearestFilter; texture.generateMipmaps = false; texture.needsUpdate = true;
  const uniforms = { uBones: { value: texture } };
  const material = skinned(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }), uniforms, AB);
  const depth = skinned(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), uniforms, AB);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'animals'; mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true; mesh.customDepthMaterial = depth;

  const slots = Array.from({ length: capacity }, () => ({ breed: null, rig: null, indices: 0 }));
  const cache = new Map();
  let lastKey = '', drawn = 0, tris = 0;
  const figure = name => { let f = cache.get(name); if (!f) cache.set(name, f = buildAnimal(name, lite)); return f; };

  function assign(s, name) {
    const slot = slots[s];
    if (slot.breed === name) return;
    const f = figure(name), m = f.mesh;
    const base = s * VMAX, n = m.vertexCount;
    position.set(m.positions, base * 3); normal.set(m.normals, base * 3); color.set(m.colors, base * 3);
    for (let i = 0; i < n; i++) skin[base + i] = s * AB + m.bones[i];
    const at = s * TMAX * 3;
    for (let i = 0; i < m.indices.length; i++) slotIndex[at + i] = m.indices[i] + base;
    slot.breed = name; slot.rig = f.rig; slot.indices = m.indices.length;
    for (const a of Object.values(attrs)) { a.addUpdateRange(base * a.itemSize, n * a.itemSize); a.needsUpdate = true; }
    lastKey = '';
  }
  function pose(s, p, t = 0) {
    const slot = slots[s];
    if (!slot.rig) return;
    solveAnimal(slot.rig, p, t, bones, s * ROW * 4);
    texture.needsUpdate = true;
  }
  function show(list) {
    const key = list.join(',');
    if (key === lastKey) return;
    lastKey = key;
    let n = 0; drawn = 0; tris = 0;
    for (const s of list) {
      const slot = slots[s];
      if (!slot.rig) continue;
      const at = s * TMAX * 3;
      drawIndex.set(slotIndex.subarray(at, at + slot.indices), n);
      n += slot.indices; drawn++; tris += slot.indices / 3;
    }
    geometry.setDrawRange(0, n);
    index.clearUpdateRanges(); index.addUpdateRange(0, n); index.needsUpdate = true;
    mesh.visible = n > 0;
  }
  const stats = () => ({ shown: drawn, triangles: tris });
  function dispose() { geometry.dispose(); texture.dispose(); material.dispose(); depth.dispose(); mesh.removeFromParent(); }
  return { object: mesh, assign, pose, show, dispose, stats, rigOf: s => slots[s].rig };
}

// --- nests --------------------------------------------------------------------------------

const NAMES = { cat: '橘子', dog: '黑輪' };

function buildNest(spot, lite) {
  const m = new FigureMesh(lite), glow = new FigureMesh(lite);
  const B0 = 0;
  const box = (c, x, y, z, sx, sy, sz, rot) => m.box(B0, c, x, y, z, sx, sy, sz, rot);
  const bowl = (x, z, food) => {
    m.lathe(B0, '#cfd4d8', [[0, 0.26, 0.26], [0.12, 0.34, 0.34]], { n: 8, bottom: 'flat', top: null, at: [x, 0, z] });
    m.lathe(B0, food ? '#7a4a2a' : '#7fb8e0', [[0.1, 0.3, 0.3]], { n: 8, bottom: null, top: 'flat', at: [x, 0, z] });
  };
  if (spot.animal === 'cat') {
    // a cardboard box on its side, open towards +x, with a towel
    const c = '#b88a56', d = shade(c, -0.12);
    box(c, 0, 0.0 + 0.05, 0, 1.3, 0.1, 1.5);                          // floor
    box(c, 0, 1.0, 0, 1.3, 0.08, 1.5);                                 // top
    box(d, -0.62, 0.52, 0, 0.08, 0.96, 1.5);                           // back
    box(c, 0, 0.52, -0.71, 1.3, 0.96, 0.08); box(c, 0, 0.52, 0.71, 1.3, 0.96, 0.08);   // sides
    box('#d9c9a0', 0, 1.045, 0, 0.18, 0.02, 1.5);                      // tape
    box('#e9d27a', 0.0, 0.14, 0, 1.0, 0.1, 1.2); box('#7ab0cf', 0.1, 0.19, 0, 0.5, 0.06, 1.2);   // towel
    box('#e8c88a', 0.66, 0.1, 0.5, 0.1, 0.1, 0.4, [0, 0, 0.2]);        // a flap of the towel hanging out
    bowl(1.35, -0.35, true); bowl(1.35, 0.35, false);
    glow.box(B0, '#ffffff', 0.8, 0.5, 0.9, 0.12, 0.16, 0.12);          // a little lantern beside it
    m.box(B0, '#3a3430', 0.8, 0.04, 0.9, 0.2, 0.08, 0.2);
    m.box(B0, '#3a3430', 0.8, 0.28, 0.9, 0.18, 0.04, 0.18);
  } else {
    // a small wooden kennel with a red gabled roof, open towards +x
    const wood = '#b4814f', dark = shade(wood, -0.18);
    box(wood, 0, 0.08, 0, 2.3, 0.16, 1.7);
    box(wood, -1.05, 0.95, 0, 0.14, 1.5, 1.7);
    box(wood, 0, 0.95, -0.78, 2.3, 1.5, 0.14); box(wood, 0, 0.95, 0.78, 2.3, 1.5, 0.14);
    box(wood, 1.1, 1.25, -0.5, 0.14, 0.9, 0.7); box(wood, 1.1, 1.25, 0.5, 0.14, 0.9, 0.7);   // front, either side of the doorway
    box(wood, 1.1, 1.55, 0, 0.14, 0.4, 0.4);
    box(dark, 1.14, 0.55, 0, 0.04, 0.8, 0.5);
    box('#6b8fb5', 1.0, 0.22, 0, 0.8, 0.07, 0.6); box('#9db8d4', 1.45, 0.17, 0.0, 0.5, 0.05, 0.55);   // blanket, trailing out of the door
    for (const s of [-1, 1]) box('#b8322a', 0, 2.1, s * 0.5, 2.5, 0.12, 1.15, [s * 0.62, 0, 0]);       // red roof
    box('#8f241f', 0, 2.62, 0, 2.5, 0.1, 0.18);                                                          // ridge
    for (const s of [-1, 1]) box(wood, 1.12, 1.95, s * 0.33, 0.14, 0.55, 0.14, [s * 0.1, 0, 0]);          // gable ends
    bowl(1.9, -0.6, true); bowl(1.9, 0.5, false);
    box('#7a5a38', 1.65, 0.45, 1.25, 0.1, 0.9, 0.1);                                                     // sign post
    glow.box(B0, '#ffffff', -0.85, 1.4, 0.9, 0.14, 0.2, 0.14);                                           // lantern on the wall
    m.box(B0, '#3a3430', -0.85, 1.25, 0.9, 0.2, 0.04, 0.2);
    m.box(B0, '#3a3430', -0.85, 1.55, 0.9, 0.2, 0.04, 0.2);
  }
  return { m, glow };
}

function toWorld(fm, spot, into) {
  const th = -(spot.heading || 0), c = Math.cos(th), s = Math.sin(th);
  const n = fm.vertexCount;
  for (let i = 0; i < n; i++) {
    const x = fm.pos[i * 3], z = fm.pos[i * 3 + 2], nx = fm.nrm[i * 3], nz = fm.nrm[i * 3 + 2];
    into.pos.push(c * x + s * z + spot.x, fm.pos[i * 3 + 1], -s * x + c * z + spot.z);
    into.nrm.push(c * nx + s * nz, fm.nrm[i * 3 + 1], -s * nx + c * nz);
    into.col.push(fm.col[i * 3], fm.col[i * 3 + 1], fm.col[i * 3 + 2]);
  }
  const base = into.pos.length / 3 - n;
  for (const k of fm.idx) into.idx.push(k + base);
}
const geo = acc => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(acc.nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(acc.col, 3));
  g.setIndex(acc.idx);
  return g;
};

function nameSign(text) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 64;
  const g = canvas.getContext('2d');
  g.fillStyle = '#f2e6c8'; g.fillRect(0, 0, 128, 64);
  g.strokeStyle = '#7a5a38'; g.lineWidth = 6; g.strokeRect(3, 3, 122, 58);
  g.fillStyle = '#4a3322'; g.font = '700 36px "Noto Sans TC", "Microsoft JhengHei", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 34);
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- the module ------------------------------------------------------------------------------

export function createAnimals({ nests = [], quality = 'full' } = {}) {
  const lite = quality === 'lite';
  const root = new THREE.Group(); root.name = 'animals';
  const batch = createBatch(40, lite);
  root.add(batch.object);

  // nests
  const acc = { pos: [], nrm: [], col: [], idx: [] }, glowAcc = { pos: [], nrm: [], col: [], idx: [] };
  const spots = nests.filter(n => n.kind === 'nest' && (n.animal === 'cat' || n.animal === 'dog'));
  const textures = [];
  for (const spot of spots) {
    const { m, glow } = buildNest(spot, lite);
    toWorld(m, spot, acc); toWorld(glow, spot, glowAcc);
  }
  const lamp = new THREE.MeshBasicMaterial({ color: '#ffd9a0', vertexColors: false });
  let nestMesh = null, glowMesh = null;
  if (spots.length) {
    nestMesh = new THREE.Mesh(geo(acc), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    nestMesh.castShadow = nestMesh.receiveShadow = true; nestMesh.name = 'nests';
    glowMesh = new THREE.Mesh(geo(glowAcc), lamp); glowMesh.name = 'nest-lanterns';
    root.add(nestMesh, glowMesh);
    for (const spot of spots.filter(s => s.animal === 'dog')) {
      const tex = nameSign(NAMES.dog);
      if (!tex) continue;
      textures.push(tex);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
      const th = -(spot.heading || 0), c = Math.cos(th), s = Math.sin(th), lx = 1.72, lz = 1.25;
      sign.position.set(c * lx + s * lz + spot.x, 0.95, -s * lx + c * lz + spot.z);
      sign.rotation.y = th + Math.PI / 2;
      sign.castShadow = true;
      root.add(sign);
    }
  }

  const bySlot = new Map(), slotOf = new Map(), free = [];
  for (let i = batch.object ? 39 : 0; i >= 0; i--) free.push(i);
  const p = { x: 0, y: 0, z: 0, heading: 0, stride: 0, pose: 'walk', leash: false, lx: 0, ly: 0, lz: 0 };
  const used = [], seen = new Set();
  const warm = new THREE.Color(), cool = new THREE.Color('#6a5f4a'), hot = new THREE.Color('#ffd9a0');
  let nests_ = spots.length;

  function update(list, frame = {}) {
    const t = frame.time || 0;
    used.length = 0; seen.clear();
    for (const e of list) {
      if (used.length >= 40) break;
      let slot = slotOf.get(e.id);
      if (slot === undefined) {
        slot = free.pop();
        if (slot === undefined) continue;
        slotOf.set(e.id, slot); bySlot.set(slot, e.id);
      }
      batch.assign(slot, breedFor(e));
      seen.add(e.id); used.push(slot);
      const h = e.heading || 0;
      p.pose = e.pose || 'walk'; p.stride = e.stride || 0; p.heading = h; p.y = e.y || 0;
      if (e.pet) {
        const fx = Math.cos(h), fz = Math.sin(h), rx = -Math.sin(h), rz = Math.cos(h);
        p.x = e.x + 1.2 * fx + 0.7 * rx; p.z = e.z + 1.2 * fz + 0.7 * rz;
        p.leash = true; p.lx = e.x + 0.42 * rx; p.lz = e.z + 0.42 * rz; p.ly = (e.y || 0) + 1.95;
        if (!e.pose) p.pose = (e.stride || 0) === 0 ? 'stand' : 'walk';
      } else { p.x = e.x; p.z = e.z; p.leash = false; }
      batch.pose(slot, p, t + slot * 1.7);
    }
    for (const [id, slot] of slotOf) if (!seen.has(id)) { slotOf.delete(id); bySlot.delete(slot); free.push(slot); }
    batch.show(used);
    const lamps = frame.lamps !== undefined ? frame.lamps : frame.lighting && frame.lighting.lamps !== undefined ? frame.lighting.lamps : 0;
    warm.copy(cool).lerp(hot, Math.max(0, Math.min(1, lamps)));
    lamp.color.copy(warm);
  }
  function dispose() {
    batch.dispose();
    for (const o of [nestMesh, glowMesh]) if (o) { o.geometry.dispose(); o.material.dispose(); }
    lamp.dispose(); textures.forEach(tx => tx.dispose());
    root.traverse(o => { if (o.isMesh && o.material && o.material.map) { o.geometry.dispose(); o.material.dispose(); } });
    root.removeFromParent();
  }
  function info() { const s = batch.stats(); return { animals: s.shown, nests: nests_, triangles: s.triangles, drawCalls: 2 + (nestMesh ? 2 : 0) + textures.length }; }
  return { object: root, update, dispose, info };
}

// One animal on its own (the follow marker). `resident.species`, optionally `resident.breed`.
export function createAnimalFigure(resident) {
  const batch = createBatch(1, false);
  batch.assign(0, breedFor({ id: resident.id, species: resident.species, breed: resident.breed, pet: false }));
  batch.show([0]);
  const p = { x: 0, y: 0, z: 0, heading: 0, stride: 0, pose: 'walk', leash: false };
  let t = 0;
  return {
    object: batch.object,
    update(stride = 0, pose = 'walk') { p.stride = stride; p.pose = pose; t += 0.016; batch.pose(0, p, t); },
    dispose: batch.dispose
  };
}

// --- preview ----------------------------------------------------------------------------------

export function preview(ctx) {
  const { world } = ctx, q = new URLSearchParams(location.search);
  const site = world.site('c-plaza'), cx = site.area.x, cz = site.area.z;
  const nests = [{ id: 'nest:cat', kind: 'nest', animal: 'cat', x: cx - 12, z: cz - 6, heading: 0.4 }, { id: 'nest:dog', kind: 'nest', animal: 'dog', x: cx + 12, z: cz - 6, heading: -0.4 }];
  const animals = createAnimals({ nests, quality: ctx.quality });
  const poses = ['walk', 'stand', 'sit', 'lie', 'eat'];
  const list = [];
  poses.forEach((pose, i) => {
    list.push({ id: 'cat' + i, species: 'cat', x: cx - 6 + i * 3.2, y: 0, z: cz + 4, heading: 0.3, pose, stride: 0 });
    list.push({ id: 'dog' + i, species: 'dog', x: cx - 6 + i * 3.2, y: 0, z: cz + 9, heading: 0.3, pose, stride: 0 });
  });
  // pet dogs with stand-in owners (a pole and a ball for the head)
  const group = new THREE.Group();
  const ownerMat = new THREE.MeshStandardMaterial({ color: '#5a7ea6' }), headMat = new THREE.MeshStandardMaterial({ color: '#e8bf9a' });
  const owners = [];
  for (let i = 0; i < 7; i++) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.6, 0.9), ownerMat), head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), headMat);
    body.position.y = 2.6 / 2 + 1.1; head.position.y = 4.4; body.add(head); head.position.y = 1.8; group.add(body);
    owners.push({ id: 'owner-' + i, mesh: body, x: cx - 10 + i * 3.4, z: cz - 14 });
  }
  const pets = owners.map(o => ({ id: o.id + ':dog', species: 'dog', pet: true, x: 0, y: 0, z: 0, heading: 0, stride: 0 }));
  let t0 = null;
  return {
    group: (group.add(animals.object), group),
    update(frame) {
      const now = performance.now();
      if (t0 === null) t0 = now;
      const t = q.has('t') ? Number(q.get('t')) : (now - t0) / 1000;
      owners.forEach((o, i) => {
        const e = pets[i];
        e.x = o.x; e.z = o.z + (q.has('t') ? 0 : 0); e.heading = 0.4 + (i % 2 ? 0.0 : 0.0); e.stride = i === 3 ? 0 : t * 6 + i;
        o.mesh.position.set(e.x, 1.3, e.z);
      });
      for (const e of list) if (e.pose === 'walk') e.stride = t * 6; else e.stride = 0;
      animals.update([...list, ...pets], { time: t, lamps: frame && frame.lamps !== undefined ? frame.lamps : 0 });
    }
  };
}
