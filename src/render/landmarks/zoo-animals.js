// The zoo's animals as part trees (zoo-herd.js moves them). Every animal is a small tree
// of parts, each an instance of one of the unit shapes below, scaled and placed; joints
// swing, oscillate, graze or fold when the animal lies down.
//
// Local frame: an animal faces +x, y up, feet on y = 0. Joints rotate about x (0), y (1)
// or z (2). A template returns { parts, lie (how far the body sinks lying down) }.
//
// Rules the shapes are used by (no z-fighting): stripes, patches, spots and toes are curved
// or round-edged pieces that cut through the surface at an angle and stand proud of it.

import * as THREE from 'three';

// The unit shapes, all centred, radius 0.5 and height 1 (the y axis) unless noted:
//   box   1×1×1                      sph   low-poly sphere      sph2  smoother sphere
//   cyl   cylinder                   con   cone, apex up        tap   cylinder, top 0.5 → bottom 0.35
//   frus  cylinder, top 0.35 → bottom 0.5 (wide at the foot)    ring  finer cylinder (stripes, bands)
//   discx finer cylinder lying along x: size is [thickness along x, diameter y, diameter z]
export const SHAPES = { box: 0, sph: 1, cyl: 2, con: 3, sph2: 4, tap: 5, frus: 6, ring: 7, discx: 8 };
// quality 'lite' uses fewer segments for the smooth ones (same sizes).
export function shapeGeometries(quality = 'full') {
  const fine = quality === 'lite' ? 8 : 12, [w, h] = quality === 'lite' ? [7, 5] : [10, 7];
  return [
    new THREE.BoxGeometry(1, 1, 1), new THREE.SphereGeometry(0.5, 7, 5), new THREE.CylinderGeometry(0.5, 0.5, 1, 8), new THREE.ConeGeometry(0.5, 1, 8),
    new THREE.SphereGeometry(0.5, w, h), new THREE.CylinderGeometry(0.5, 0.35, 1, 8), new THREE.CylinderGeometry(0.35, 0.5, 1, 8),
    new THREE.CylinderGeometry(0.5, 0.5, 1, fine), new THREE.CylinderGeometry(0.5, 0.5, 1, fine).rotateZ(Math.PI / 2)
  ];
}

// ------------------------------------------------------------------ templates
function builder(k) {
  const parts = [];
  const add = o => {
    const p = { shape: null, pos: [0, 0, 0], off: [0, 0, 0], size: [1, 1, 1], color: '#ffffff', par: -1, ax: 2, kind: '', base: 0, amp: 0, ph: 0, freq: 1, sl: null, ga: 0, ...o };
    p.shape = o.shape ? SHAPES[o.shape] : -1;
    p.pos = p.pos.map(v => v * k); p.off = p.off.map(v => v * k); p.size = p.size.map(v => v * k);
    parts.push(p);
    return parts.length - 1;
  };
  return { parts, add };
}

// A dark eye with a bright catch-light (z = 0 → no catch-light).
const eye = (add, par, x, y, z, s = 0.2) => {
  add({ shape: 'sph', par, pos: [x, y, z], size: [s, s, s], color: '#1d1a18' });
  if (z) add({ shape: 'sph', par, pos: [x + 0.26 * s, y + 0.26 * s, z + Math.sign(z) * 0.12 * s], size: [s * 0.36, s * 0.36, s * 0.36], color: '#fbfbf6' });
};

// A leg of two joints: the hip swings when walking, the knee folds when lying (hs, ks).
// Returns the joint indices (an = the ankle) so feet and hooves can hang off it.
function leg2(add, { x, y, z, lu, ll, wu, wl, color, ph, amp, hs, ks, lowShape = 'tap', upShape = 'tap', ball = 'sph', level = true, par = -1 }) {
  const hip = add({ par, pos: [x, y, z], kind: 'leg', amp, ph, sl: hs });
  add({ shape: 'sph', par: hip, size: [wu * 1.02, wu * 1.02, wu * 1.02], color });                       // hip ball hides the thigh's top edge
  add({ shape: upShape, par: hip, off: [0, -lu / 2, 0], size: [wu, lu, wu], color });
  add({ shape: ball, par: hip, pos: [0, -lu, 0], size: [Math.max(wu * 0.7, wl) * 1.08, Math.max(wu * 0.7, wl) * 1.08, Math.max(wu * 0.7, wl) * 1.08], color });
  const kn = add({ par: hip, pos: [0, -lu, 0], sl: ks });
  add({ shape: lowShape, par: kn, off: [0, -ll / 2, 0], size: [wl, ll, wl], color });
  // The ankle keeps the foot level when the leg folds; feet and hooves hang off it.
  const an = add({ par: kn, pos: [0, -ll, 0], sl: level ? -(hs + ks) : null });
  return { hip, kn, an };
}

function elephant(k = 1) {
  const { parts, add } = builder(k);
  const grey = '#9ba4ac', dark = '#838c94', band = '#7a838b', inner = '#d9a9b2', ivory = '#f4eee0', nail = '#ebe3cf';
  add({ shape: 'sph2', pos: [0, 4.3, 0], size: [7.8, 5.1, 5.0], color: grey });
  for (const [x, z, ph] of [[2.4, 1.35, 0], [2.4, -1.35, Math.PI], [-2.5, 1.35, Math.PI], [-2.5, -1.35, 0]]) {
    const L = leg2(add, { x, y: 4.0, z, lu: 2.4, ll: 1.2, wu: 1.8, wl: 1.45, color: '#8f98a0', ph, amp: 0.4, hs: 0.95, ks: x > 0 ? 0.5 : -2.25, lowShape: 'ring', ball: 'sph2' });
    add({ shape: 'sph', par: L.an, pos: [0.05, 0.05, 0], size: [2.1, 0.9, 2.2], color: dark });
    for (const nz of [-0.62, 0, 0.62]) add({ shape: 'sph', par: L.an, pos: [0.95, 0.05, nz], size: [0.5, 0.5, 0.46], color: nail });
  }
  const head = add({ pos: [3.7, 5.3, 0], kind: 'neck', amp: 0.05, freq: 0.7, ga: -0.2, sl: -0.2 });
  add({ shape: 'sph2', par: head, off: [0.5, -0.1, 0], size: [3.5, 3.7, 3.4], color: grey });
  add({ shape: 'sph2', par: head, off: [0.1, 0.75, 0], size: [3.0, 2.6, 3.0], color: grey });         // domed forehead
  add({ shape: 'sph2', par: head, pos: [2.05, -0.5, 0], size: [1.9, 2.0, 1.8], color: grey });        // trunk root
  for (const s of [1, -1]) {
    const ear = add({ par: head, pos: [-0.3, 0.7, s * 1.5], ax: 1, kind: 'osc', base: -s * 0.35, amp: s * 0.2, freq: 1.7, ph: s });
    add({ shape: 'sph2', par: ear, off: [-0.1, -0.3, s * 1.1], size: [0.45, 3.3, 3.0], color: '#aab1b8' });
    add({ shape: 'sph', par: ear, off: [0.04, -0.35, s * 1.15], size: [0.3, 2.5, 2.2], color: inner });
    // Tusks curve out and then up.
    const tu = add({ par: head, pos: [1.5, -1.0, s * 1.0], base: -1.9 });
    add({ shape: 'frus', par: tu, off: [0, 0.7, 0], size: [0.52, 1.4, 0.52], color: ivory });
    const tu2 = add({ par: tu, pos: [0, 1.4, 0], base: 0.9 });
    add({ shape: 'con', par: tu2, off: [0, 0.5, 0], size: [0.34, 1.05, 0.34], color: ivory });
    eye(add, head, 1.5, 0.45, s * 1.22, 0.34);
  }
  // The trunk: four tapering segments with wrinkle bands, curling at the tip.
  const seg = [[1.8, 1.5, 0.3, 0.12, 0, 0.1], [1.5, 1.05, 0.55, 0.16, 0.8, 1.4], [1.2, 0.75, 0.65, 0.16, 1.6, 0.7], [0.9, 0.52, 0.75, 0.16, 2.4, 0.7]];
  let pp = head, prev = 0;
  seg.forEach(([len, w, base, amp, ph, sl], i) => {
    const j = add({ par: pp, pos: i ? [0, -prev, 0] : [2.05, -0.5, 0], kind: 'osc', base, amp, freq: 1.1, ph, sl });
    add({ shape: 'sph', par: j, size: [w * 1.04, w * 1.04, w * 1.04], color: grey });
    add({ shape: 'tap', par: j, off: [0, -len / 2, 0], size: [w, len, w * 0.95], color: grey });
    if (i < 3) for (const f of [0.35, 0.7]) add({ shape: 'ring', par: j, off: [0, -len * f, 0], size: [w * (1 - 0.3 * f) + 0.13, 0.09, w * 0.95 * (1 - 0.3 * f) + 0.13], color: band });
    if (i === 3) add({ shape: 'sph', par: j, pos: [0, -len, 0], size: [0.5, 0.42, 0.5], color: '#8a9096' });
    pp = j; prev = len;
  });
  const tail = add({ pos: [-4.0, 4.8, 0], ax: 0, kind: 'osc', amp: 0.4, freq: 2.2, sl: 0.9 });
  add({ shape: 'tap', par: tail, off: [0, -1.1, 0], size: [0.42, 2.2, 0.42], color: dark });
  add({ shape: 'sph', par: tail, pos: [0, -2.3, 0], size: [0.7, 1.0, 0.7], color: band });
  return { parts, lie: 1.7 * k };
}

function giraffe(k = 1) {
  const { parts, add } = builder(k);
  const tan = '#e6b04e', cream = '#f0d9a6', pale = '#eac27c', spot = '#9c5d2c', spot2 = '#b0702f', dk = '#6a4a30', mane = '#7a4a24';
  add({ shape: 'sph2', pos: [0, 6.2, 0], size: [5.2, 2.9, 2.5], color: tan });
  add({ shape: 'sph2', pos: [1.4, 6.4, 0], size: [2.6, 2.6, 2.3], color: tan });
  add({ shape: 'sph2', pos: [-1.6, 6.2, 0], size: [2.4, 2.5, 2.3], color: tan });
  add({ shape: 'sph2', pos: [0, 5.65, 0], size: [4.2, 1.3, 2.62], color: cream });                  // pale belly band
  // Patches sit on the body surface, cutting it at an angle.
  const patches = [[-1.7, 0.5, 0.8], [-0.9, 0.7, 0.7], [-0.2, 0.3, 0.9], [0.6, 0.65, 0.75], [1.3, 0.3, 0.8], [-1.3, -0.1, 0.8], [-0.5, -0.15, 0.85], [0.25, -0.2, 0.7], [1.0, -0.1, 0.7], [1.8, 0.7, 0.6]];
  for (const s of [1, -1]) for (const [x0, dy, sz] of patches) {
    const x = x0 + (s < 0 ? 0.35 : 0), e = 1 - (x / 2.6) ** 2 - (dy / 1.45) ** 2;
    if (e <= 0.1) continue;
    add({ shape: 'sph', pos: [x, 6.2 + dy, s * 1.25 * Math.sqrt(e)], size: [sz, sz * 0.85, 0.32], color: s > 0 ? spot : spot2 });
  }
  for (const [x, z, ph, hs, ks] of [[1.55, 0.75, 0, 1.45, -2.9], [1.55, -0.75, Math.PI, 1.45, -2.9], [-1.55, 0.75, Math.PI, 1.45, -2.9], [-1.55, -0.75, 0, 1.45, -2.9]]) {
    const L = leg2(add, { x, y: 5.1, z, lu: 2.5, ll: 2.35, wu: 0.8, wl: 0.52, color: pale, ph, amp: 0.35, hs, ks, level: false });
    add({ shape: 'sph', par: L.an, pos: [0, 0.05, 0], size: [0.56, 0.5, 0.56], color: pale });
    add({ shape: 'cyl', par: L.an, pos: [0.04, -0.08, 0], size: [0.64, 0.32, 0.68], color: dk });   // hoof
  }
  const neck = add({ pos: [1.9, 7.0, 0], kind: 'neck', base: -0.35, amp: 0.07, freq: 0.6, ga: -0.4, sl: -0.15 });
  add({ shape: 'frus', par: neck, off: [0, 2.7, 0], size: [1.45, 5.4, 1.2], color: tan });
  const fw = h => 1 - 0.36 * h / 5.4;                                                                  // neck width factor at height h
  [0.7, 1.6, 2.5, 3.4, 4.3].forEach((h, i) => {
    for (const s of [1, -1]) add({ shape: 'sph', par: neck, pos: [(i % 2 ? 0.12 : -0.1) * s, h + (s < 0 ? 0.35 : 0), s * 0.6 * fw(h)], size: [0.62, 0.66, 0.3], color: s > 0 ? spot : spot2 });
  });
  for (let h = 0.3; h < 5.2; h += 0.55) add({ shape: 'sph', par: neck, pos: [-0.74 * fw(h), h, 0], size: [0.3, 0.55, 0.22], color: mane });   // mane
  const head = add({ par: neck, pos: [0, 5.4, 0], kind: 'osc', base: 0.55, amp: 0.08, freq: 1.3, sl: 0.55 });
  add({ shape: 'sph', par: head, size: [0.95, 0.9, 0.82], color: tan });                                   // covers the top of the neck
  add({ shape: 'sph2', par: head, off: [0.45, 0.05, 0], size: [1.35, 0.95, 0.85], color: tan });
  add({ shape: 'sph2', par: head, off: [1.15, -0.12, 0], size: [0.95, 0.72, 0.72], color: '#d9a85a' });
  add({ shape: 'sph', par: head, off: [1.58, -0.08, 0], size: [0.3, 0.26, 0.46], color: '#4a3524' });
  for (const s of [1, -1]) {
    const oss = add({ par: head, pos: [0.1, 0.4, s * 0.27], base: -0.1 });
    add({ shape: 'frus', par: oss, off: [0, 0.4, 0], size: [0.17, 0.8, 0.17], color: tan });
    add({ shape: 'sph', par: oss, pos: [0, 0.85, 0], size: [0.34, 0.38, 0.34], color: dk });
    const ear = add({ par: head, pos: [-0.12, 0.3, s * 0.5], ax: 0, kind: 'osc', amp: 0.3, freq: 2.4, ph: s });
    add({ shape: 'sph', par: ear, off: [0, 0.04, s * 0.3], size: [0.32, 0.2, 0.7], color: '#c98d4a' });
    eye(add, head, 0.7, 0.28, s * 0.34, 0.27);
  }
  const tail = add({ pos: [-2.6, 6.9, 0], ax: 0, kind: 'osc', amp: 0.3, freq: 1.8, sl: 1.2 });
  add({ shape: 'tap', par: tail, off: [0, -1.3, 0], size: [0.24, 2.6, 0.24], color: tan });
  add({ shape: 'sph', par: tail, pos: [0, -2.8, 0], size: [0.46, 0.9, 0.46], color: '#4a3524' });
  return { parts, lie: 4.2 * k };
}

function lion(k = 1, { mane = true } = {}) {
  const { parts, add } = builder(k);
  const fur = mane ? '#d9a548' : '#e0b663', cream = '#efd9a4', dkm = '#7a4a22', paw = mane ? '#cf9a40' : '#d6a850';
  add({ shape: 'sph2', pos: [-0.1, 2.1, 0], size: [3.0, 1.5, 1.3], color: fur });
  add({ shape: 'sph2', pos: [0.7, 2.15, 0], size: [1.8, 1.7, 1.35], color: fur });
  add({ shape: 'sph2', pos: [-1.0, 2.1, 0], size: [1.9, 1.65, 1.4], color: fur });
  add({ shape: 'sph', pos: [0.2, 1.62, 0], size: [2.6, 0.7, 1.2], color: cream });                   // pale belly
  for (const [x, z, ph, front] of [[1.0, 0.46, 0, true], [1.0, -0.46, Math.PI, true], [-1.15, 0.46, Math.PI, false], [-1.15, -0.46, 0, false]]) {
    const L = leg2(add, { x, y: 1.75, z, lu: 0.9, ll: 0.7, wu: front ? 0.62 : 0.78, wl: 0.44, color: paw, ph, amp: 0.5, hs: front ? 1.25 : 1.45, ks: front ? 0.3 : -2.9 });
    add({ shape: 'sph2', par: L.an, pos: [0.08, 0.08, 0], size: [0.66, 0.4, 0.54], color: paw });
    add({ shape: 'sph', par: L.an, pos: [0.4, 0.05, 0], size: [0.2, 0.18, 0.34], color: '#a9772f' });
  }
  const head = add({ pos: [1.75, 2.8, 0], kind: 'neck', amp: 0.05, freq: 0.9, ga: -0.5, sl: -0.2 });
  if (mane) {
    add({ shape: 'sph2', par: head, off: [-0.4, -0.05, 0], size: [1.9, 2.1, 2.2], color: dkm });
    add({ shape: 'sph2', par: head, off: [-0.2, -0.75, 0], size: [1.1, 1.3, 1.5], color: '#8a5426' });
    for (let i = 0; i < 8; i++) {                                                                       // outer ring of tufts
      const a = i * Math.PI / 4 + 0.15;
      add({ shape: 'sph', par: head, pos: [-0.5, 0.84 * Math.cos(a), 0.78 * Math.sin(a)], size: [0.8, 0.78, 0.74], color: i % 2 ? '#6b3e1b' : '#8a5426' });
    }
    for (let i = 0; i < 6; i++) {                                                                       // inner ring framing the face
      const a = i * Math.PI / 3;
      add({ shape: 'sph', par: head, pos: [-0.12, 0.6 * Math.cos(a), 0.58 * Math.sin(a)], size: [0.55, 0.6, 0.56], color: i % 2 ? '#9a6230' : '#a8702f' });
    }
  }
  add({ shape: 'sph2', par: head, off: [0.3, 0, 0], size: [1.2, 1.1, 1.15], color: fur });
  add({ shape: 'sph2', par: head, off: [0.9, -0.2, 0], size: [0.72, 0.56, 0.72], color: cream });
  add({ shape: 'sph', par: head, off: [1.22, -0.05, 0], size: [0.24, 0.18, 0.32], color: '#3a2a26' });
  add({ shape: 'sph', par: head, off: [1.05, -0.4, 0], size: [0.3, 0.1, 0.34], color: '#3a2a26' });    // mouth line
  for (const s of [1, -1]) {
    add({ shape: 'sph', par: head, pos: [0.1, 0.66, s * 0.5], size: [0.4, 0.42, 0.2], color: mane ? dkm : fur });
    add({ shape: 'sph', par: head, pos: [0.17, 0.66, s * 0.5], size: [0.24, 0.26, 0.2], color: '#e8b8a0' });
    eye(add, head, 0.78, 0.18, s * 0.34, 0.17);
  }
  const t1 = add({ pos: [-1.9, 2.4, 0], base: 0.1, sl: -0.6 });
  const t1w = add({ par: t1, ax: 0, kind: 'osc', amp: 0.3, freq: 1.5 });
  add({ shape: 'tap', par: t1w, off: [0, -0.5, 0], size: [0.2, 1.0, 0.2], color: fur });
  const t2 = add({ par: t1w, pos: [0, -1.0, 0], base: -0.1, sl: -0.9 });
  add({ shape: 'tap', par: t2, off: [0, -0.5, 0], size: [0.18, 1.0, 0.18], color: fur });
  add({ shape: 'sph', par: t2, pos: [0, -1.1, 0], size: [0.46, 0.7, 0.46], color: '#5a3a1e' });
  return { parts, lie: 1.2 * k };
}

function zebra(k = 1) {
  const { parts, add } = builder(k);
  const white = '#f4f1ea', dark = '#2a2d33';
  add({ shape: 'sph2', pos: [0, 2.6, 0], size: [3.6, 1.85, 1.5], color: white });
  // Body stripes: discs across the barrel, a hair larger than the body there.
  for (const x of [-1.45, -1.05, -0.65, -0.25, 0.15, 0.55, 0.95, 1.35]) {
    const r = Math.sqrt(1 - (x / 1.8) ** 2);
    add({ shape: 'discx', pos: [x, 2.6, 0], size: [x % 0.8 ? 0.11 : 0.15, 2 * (0.925 * r + 0.046), 2 * (0.75 * r + 0.046)], color: dark });
  }
  for (const [x, z, ph] of [[1.1, 0.42, 0], [1.1, -0.42, Math.PI], [-1.1, 0.42, Math.PI], [-1.1, -0.42, 0]]) {
    const L = leg2(add, { x, y: 2.0, z, lu: 0.95, ll: 0.8, wu: 0.5, wl: 0.3, color: white, ph, amp: 0.5, hs: 1.45, ks: -2.9, level: false });
    add({ shape: 'cyl', par: L.an, pos: [0.03, -0.1, 0], size: [0.38, 0.3, 0.42], color: dark });
    for (const d of [0.3, 0.7]) add({ shape: 'ring', par: L.hip, pos: [0, -d, 0], size: [0.5 * (1 - 0.3 * d / 0.95) + 0.09, 0.07, 0.5 * (1 - 0.3 * d / 0.95) + 0.09], color: dark });
    for (const d of [0.4]) add({ shape: 'ring', par: L.kn, pos: [0, -d, 0], size: [0.3 * (1 - 0.3 * d / 0.8) + 0.09, 0.07, 0.3 * (1 - 0.3 * d / 0.8) + 0.09], color: dark });
  }
  const neck = add({ pos: [1.5, 3.1, 0], kind: 'neck', base: -0.7, amp: 0.05, freq: 0.8, ga: -1.2, sl: -0.5 });
  add({ shape: 'frus', par: neck, off: [0, 1.0, 0], size: [0.95, 2.0, 0.66], color: white });
  const nw = h => 1 - 0.36 * h / 2.0;
  for (const h of [0.2, 0.55, 0.9, 1.25, 1.6]) add({ shape: 'ring', par: neck, pos: [0, h, 0], size: [0.95 * nw(h) + 0.1, 0.1, 0.66 * nw(h) + 0.1], color: dark });
  for (let i = 0, h = 0.15; h < 2.0; h += 0.26, i++) add({ shape: 'sph', par: neck, pos: [-0.5 * nw(h), h, 0], size: [0.16, 0.34, 0.2], color: i % 2 ? white : dark });   // upright mane
  const head = add({ par: neck, pos: [0, 2.0, 0], kind: 'osc', base: 0.45, amp: 0.06, freq: 1.2 });
  add({ shape: 'sph', par: head, size: [0.78, 0.6, 0.52], color: white });                                  // covers the top of the neck
  add({ shape: 'sph2', par: head, off: [0.45, -0.02, 0], size: [1.1, 0.72, 0.62], color: white });
  add({ shape: 'sph2', par: head, off: [1.03, -0.14, 0], size: [0.7, 0.55, 0.52], color: '#33353b' });
  for (const [x, w] of [[0.05, 0.1], [0.4, 0.1], [0.75, 0.09]]) {
    const r = Math.sqrt(1 - ((x - 0.45) / 0.55) ** 2);
    add({ shape: 'discx', par: head, pos: [x, -0.02, 0], size: [w, 0.72 * r + 0.08, 0.62 * r + 0.08], color: dark });
  }
  for (const s of [1, -1]) {
    const ear = add({ par: head, pos: [0.0, 0.3, s * 0.2], ax: 0, kind: 'osc', base: s * 0.2, amp: 0.25, freq: 2.6, ph: s });
    add({ shape: 'sph', par: ear, off: [0, 0.25, 0], size: [0.2, 0.58, 0.17], color: dark });
    add({ shape: 'sph', par: ear, off: [0.04, 0.2, 0], size: [0.1, 0.34, 0.12], color: '#e9c9c0' });
    eye(add, head, 0.5, 0.14, s * 0.27, 0.15);
    add({ shape: 'sph', par: head, pos: [1.3, -0.1, s * 0.12], size: [0.06, 0.1, 0.1], color: '#15161a' });   // nostril
  }
  const tail = add({ pos: [-1.8, 2.9, 0], ax: 0, kind: 'osc', amp: 0.35, freq: 2, sl: 1.2 });
  add({ shape: 'tap', par: tail, off: [0, -0.6, 0], size: [0.16, 1.2, 0.16], color: white });
  add({ shape: 'sph', par: tail, pos: [0, -1.4, 0], size: [0.3, 0.8, 0.3], color: dark });
  return { parts, lie: 1.5 * k };
}

function capybara(k = 1, { yuzu = false } = {}) {
  const { parts, add } = builder(k);
  const back = '#9c6b3c', side = '#ad7a45', belly = '#c59a63', face = '#8f6034', dkf = '#4a3224';
  // A long barrel, a little higher at the rump, with a darker saddle on top.
  add({ shape: 'sph2', pos: [-0.2, 0.88, 0], size: [2.6, 1.5, 1.5], color: side });
  add({ shape: 'sph2', pos: [-0.75, 0.93, 0], size: [1.5, 1.6, 1.46], color: side });
  add({ shape: 'sph2', pos: [-0.35, 1.38, 0], size: [2.3, 0.62, 1.1], color: back });
  add({ shape: 'sph2', pos: [-0.1, 0.5, 0], size: [2.3, 0.8, 1.56], color: belly });                  // lighter belly band
  for (const [x, z, ph] of [[0.6, 0.42, 0], [0.6, -0.42, Math.PI], [-0.9, 0.42, Math.PI], [-0.9, -0.42, 0]]) {
    const L = leg2(add, { x, y: 0.45, z, lu: 0.22, ll: 0.18, wu: 0.4, wl: 0.4, color: face, ph, amp: 0.35, hs: 1.4, ks: -2.8, lowShape: 'cyl', upShape: 'cyl' });
    add({ shape: 'sph', par: L.an, pos: [0.05, 0.03, 0], size: [0.46, 0.16, 0.38], color: dkf });
  }
  // A long, boxy head: flat on top, with a deep square muzzle.
  const head = add({ pos: [0.4, 1.0, 0], kind: 'neck', amp: 0.04, freq: 0.8, ga: -0.4, sl: -0.3 });
  add({ shape: 'sph2', par: head, off: [0.35, 0, 0], size: [0.95, 0.8, 0.95], color: face });
  add({ shape: 'box', par: head, off: [0.85, -0.08, 0], size: [0.9, 0.62, 0.8], color: face });
  add({ shape: 'sph', par: head, off: [1.3, -0.06, 0], size: [0.14, 0.4, 0.62], color: dkf });          // blunt dark nose
  for (const s of [1, -1]) {
    add({ shape: 'sph', par: head, pos: [1.08, 0.235, s * 0.15], size: [0.15, 0.05, 0.07], color: '#1d1512' });   // nostril slits, top front
    eye(add, head, 0.58, 0.18, s * 0.38, 0.1);
    add({ shape: 'sph', par: head, pos: [0.58, 0.24, s * 0.37], size: [0.19, 0.09, 0.17], color: face });       // heavy lid, sleepy
    add({ shape: 'sph', par: head, pos: [0.06, 0.34, s * 0.3], size: [0.2, 0.24, 0.18], color: '#7a5028' });   // tiny round ears, high and back
  }
  if (yuzu) {
    add({ shape: 'sph', par: head, pos: [0.4, 0.5, 0], size: [0.36, 0.3, 0.36], color: '#f29a1c' });
    add({ shape: 'sph', par: head, pos: [0.4, 0.66, 0], size: [0.1, 0.06, 0.1], color: '#5f8f3a' });
  }
  return { parts, lie: 0.1 * k };
}

function flamingo(k = 1, { oneLeg = false } = {}) {
  const { parts, add } = builder(k);
  const pink = '#f293aa', deep = '#e8758f', pale = '#f7b7c4', blk = '#2a2a2a';
  add({ shape: 'sph2', pos: [0, 2.85, 0], size: [2.0, 1.35, 1.15], color: pink });
  add({ shape: 'sph2', pos: [-0.9, 2.78, 0], size: [1.3, 0.8, 0.7], color: pale });
  for (const s of [1, -1]) {
    add({ shape: 'sph', pos: [-0.15, 2.9, s * 0.5], size: [1.5, 0.8, 0.26], color: '#f7a3b6' });         // folded wing
    add({ shape: 'sph', pos: [-0.9, 2.78, s * 0.45], size: [0.7, 0.36, 0.2], color: blk });               // dark flight feathers
  }
  const flLeg = (z, ph, tuck) => {
    const hip = add({ pos: [0.1, 2.45, z], kind: tuck ? '' : 'leg', amp: tuck ? 0 : 0.16, ph, base: tuck ? 1.2 : 0.12 });
    add({ shape: 'cyl', par: hip, off: [0, -0.6, 0], size: [0.16, 1.2, 0.16], color: deep });
    add({ shape: 'sph', par: hip, pos: [0, -1.2, 0], size: [0.25, 0.25, 0.25], color: deep });
    const kn = add({ par: hip, pos: [0, -1.2, 0], base: tuck ? -2.7 : -0.28 });
    add({ shape: 'cyl', par: kn, off: [0, -0.62, 0], size: [0.13, 1.24, 0.13], color: deep });
    add({ shape: 'sph', par: kn, pos: [0.06, -1.22, 0], size: [0.52, 0.09, 0.3], color: deep });
  };
  flLeg(0.18, 0, false);
  flLeg(-0.18, Math.PI, oneLeg);
  // An S-curved neck of four joints.
  const ns = [[-0.6, 0.3, 0.1, -1.0], [0.35, 0.28, 0.1, -0.9], [0.45, 0.26, 0.1, -0.5], [0.35, 0.24, 0.1, -0.4]];
  const nsl = [0.9, 0.5, 0.3, 0.3];
  let pp = -1;
  ns.forEach(([base, w, amp, ga], i) => {
    const j = add({ par: pp, pos: i ? [0, 0.72, 0] : [0.9, 3.05, 0], base, kind: 'neck', amp, freq: 0.8 + i * 0.1, ph: i * 0.8, ga, sl: nsl[i] });
    add({ shape: 'sph', par: j, size: [w * 1.05, w * 1.05, w * 1.05], color: pink });
    add({ shape: 'frus', par: j, off: [0, 0.36, 0], size: [w, 0.74, w], color: pink });
    pp = j;
  });
  const head = add({ par: pp, pos: [0, 0.72, 0], base: -0.75, kind: 'osc', amp: 0.08, freq: 1.1, sl: -1.8 });
  add({ shape: 'sph2', par: head, off: [0.12, 0.04, 0], size: [0.52, 0.44, 0.44], color: pink });
  const b1 = add({ par: head, pos: [0.32, 0.0, 0], base: -1.75 });
  add({ shape: 'frus', par: b1, off: [0, 0.26, 0], size: [0.3, 0.52, 0.22], color: '#f7d0d6' });         // pale base of the bill
  const b2 = add({ par: b1, pos: [0, 0.5, 0], base: -0.75 });
  add({ shape: 'frus', par: b2, off: [0, 0.17, 0], size: [0.2, 0.36, 0.15], color: blk });             // black tip, bent down
  eye(add, head, 0.22, 0.1, 0.2, 0.12);
  eye(add, head, 0.22, 0.1, -0.2, 0.12);
  return { parts, lie: 0 };
}

function monkey(k = 1) {
  const { parts, add } = builder(k);
  const fur = '#8a5a36', skin = '#e8c9a0', belly = '#c9a07a', dk = '#6e4528';
  add({ shape: 'sph2', pos: [0, 1.55, 0], size: [1.0, 1.25, 0.85], color: fur });
  add({ shape: 'sph2', pos: [0.2, 1.45, 0], size: [0.7, 0.95, 0.6], color: belly });
  const head = add({ pos: [0.4, 2.2, 0], kind: 'neck', amp: 0.12, freq: 1.6, ga: -0.3, sl: -0.4 });
  add({ shape: 'sph2', par: head, size: [0.74, 0.7, 0.7], color: fur });
  add({ shape: 'sph2', par: head, off: [0.1, 0.2, 0], size: [0.56, 0.36, 0.6], color: dk });             // brow tuft
  for (const s of [1, -1]) {
    add({ shape: 'sph', par: head, pos: [0.28, 0.0, s * 0.14], size: [0.3, 0.34, 0.3], color: skin });    // face mask, two lobes
    add({ shape: 'sph', par: head, pos: [-0.03, 0.1, s * 0.4], size: [0.3, 0.3, 0.14], color: dk });      // ear
    add({ shape: 'sph', par: head, pos: [0.0, 0.1, s * 0.45], size: [0.18, 0.18, 0.1], color: '#e8a8a0' });
    eye(add, head, 0.42, 0.08, s * 0.13, 0.1);
    const sh = add({ pos: [0.12, 1.95, s * 0.5], kind: 'leg', amp: 0.7, ph: s > 0 ? 0 : Math.PI, sl: 0.5 });
    add({ shape: 'sph', par: sh, size: [0.34, 0.34, 0.34], color: fur });
    add({ shape: 'tap', par: sh, off: [0, -0.28, 0], size: [0.3, 0.56, 0.3], color: fur });
    const el = add({ par: sh, pos: [0, -0.56, 0], sl: 0.9 });
    add({ shape: 'sph', par: sh, pos: [0, -0.56, 0], size: [0.26, 0.26, 0.26], color: fur });
    add({ shape: 'tap', par: el, off: [0, -0.24, 0], size: [0.24, 0.48, 0.24], color: fur });
    add({ shape: 'sph', par: el, pos: [0, -0.52, 0], size: [0.28, 0.28, 0.26], color: skin });         // hand
    const L = leg2(add, { x: -0.05, y: 1.0, z: s * 0.25, lu: 0.5, ll: 0.4, wu: 0.32, wl: 0.26, color: fur, ph: s > 0 ? Math.PI : 0, amp: 0.7, hs: 1.35, ks: 0.1, lowShape: 'cyl' });
    add({ shape: 'sph', par: L.an, pos: [0.12, 0, 0], size: [0.5, 0.2, 0.3], color: skin });         // foot
  }
  add({ shape: 'sph', par: head, pos: [0.4, -0.12, 0], size: [0.3, 0.26, 0.4], color: skin });          // muzzle
  add({ shape: 'sph', par: head, pos: [0.54, -0.04, 0], size: [0.1, 0.08, 0.16], color: '#2a1d18' });   // nose
  // A long tail that curls up at the end.
  let pp = -1;
  [0.4, 0.4, 0.4, 0.4, 0.4].forEach((len, i) => {
    const j = add({ par: pp, pos: i ? [0, len, 0] : [-0.45, 1.15, 0], base: i ? -0.5 : 1.9, kind: 'osc', amp: 0.14, freq: 2.2, ph: i * 0.7 });
    add({ shape: 'tap', par: j, off: [0, len / 2, 0], size: [0.16 - i * 0.012, len, 0.16 - i * 0.012], color: fur });
    pp = j;
  });
  return { parts, lie: 0.7 * k };
}

function hippo(k = 1) {
  const { parts, add } = builder(k);
  const skin = '#8f7f93', lilac = '#a48ea6', toe = '#b7a3b8', dkp = '#6e5e72';
  add({ shape: 'sph2', pos: [0, 2.05, 0], size: [5.2, 2.6, 3.2], color: skin });
  add({ shape: 'sph2', pos: [1.5, 2.0, 0], size: [2.6, 2.4, 3.0], color: skin });
  add({ shape: 'sph2', pos: [-1.6, 2.05, 0], size: [2.6, 2.4, 3.0], color: skin });
  add({ shape: 'sph2', pos: [0, 1.45, 0], size: [4.4, 1.2, 3.02], color: '#a3919f' });                   // pale belly
  for (const [x, z, ph] of [[1.7, 1.05, 0], [1.7, -1.05, Math.PI], [-1.7, 1.05, Math.PI], [-1.7, -1.05, 0]]) {
    const hip0 = add({ pos: [x, 1.5, z], kind: 'leg', amp: 0.3, ph });
    const hip = add({ par: hip0, ax: 0, sl: z > 0 ? 1.3 : -1.3 });          // lying: legs fold in under the belly
    add({ shape: 'sph', par: hip, size: [1.18, 1.18, 1.18], color: '#85758a' });
    add({ shape: 'tap', par: hip, off: [0, -0.75, 0], size: [1.15, 1.5, 1.15], color: '#85758a' });
    for (const tz of [-0.34, 0, 0.34]) add({ shape: 'sph', par: hip, pos: [0.42, -1.35, tz], size: [0.38, 0.3, 0.34], color: toe });
  }
  const head = add({ pos: [2.35, 2.05, 0], kind: 'neck', amp: 0.06, freq: 0.7, ga: 0, sl: -0.15 });
  add({ shape: 'sph2', par: head, off: [0.5, 0.05, 0], size: [2.3, 1.9, 2.2], color: skin });
  add({ shape: 'sph2', par: head, off: [1.45, -0.1, 0], size: [1.8, 1.25, 2.3], color: lilac });
  const jaw = add({ par: head, pos: [0.3, -0.55, 0], kind: 'osc', base: -0.2, amp: 0.18, freq: 0.5, sl: -0.05 });
  add({ shape: 'sph2', par: jaw, off: [1.0, -0.12, 0], size: [2.0, 0.6, 1.9], color: lilac });
  add({ shape: 'sph', par: jaw, off: [1.0, 0.2, 0], size: [1.5, 0.14, 1.2], color: '#c0707e' });         // tongue
  for (const [tz, big] of [[-0.7, 1], [-0.35, 0], [0, 0], [0.35, 0], [0.7, 1]]) add({ shape: 'con', par: jaw, off: [1.85, 0.3, tz], size: big ? [0.22, 0.6, 0.22] : [0.17, 0.3, 0.17], color: '#f4eee0' });
  for (const s of [1, -1]) {
    add({ shape: 'sph', par: head, pos: [1.85, 0.5, s * 0.6], size: [0.55, 0.42, 0.55], color: lilac });  // nostril bumps
    add({ shape: 'sph', par: head, pos: [1.95, 0.66, s * 0.6], size: [0.3, 0.18, 0.26], color: dkp });
    add({ shape: 'sph', par: head, pos: [0.4, 0.95, s * 0.72], size: [0.62, 0.52, 0.56], color: skin });  // eye bumps
    eye(add, head, 0.55, 1.1, s * 0.82, 0.26);
    const ear = add({ par: head, pos: [-0.1, 0.6, s * 0.92], ax: 0, kind: 'osc', amp: 0.3, freq: 3, ph: s });
    add({ shape: 'sph', par: ear, off: [0, 0.2, 0], size: [0.4, 0.56, 0.3], color: '#7a6a7e' });
    add({ shape: 'sph', par: ear, off: [0.04, 0.18, s * 0.06], size: [0.22, 0.34, 0.26], color: '#c79aa8' });
  }
  const tail = add({ pos: [-2.5, 2.4, 0], ax: 0, kind: 'osc', amp: 0.4, freq: 2 });
  add({ shape: 'tap', par: tail, off: [0, -0.4, 0], size: [0.34, 0.8, 0.34], color: skin });
  add({ shape: 'sph', par: tail, pos: [0, -0.85, 0], size: [0.3, 0.3, 0.3], color: dkp });
  return { parts, lie: 0.7 * k };
}

export const TEMPLATES = { elephant, giraffe, lion, zebra, capybara, flamingo, monkey, hippo };
