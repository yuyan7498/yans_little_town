// The zoo's animals. Every animal is a small tree of parts (boxes, ellipsoids, cylinders,
// cones). All parts of every animal are instances of four unit shapes, so the whole
// menagerie is four draw calls. Each frame only matrices are rewritten (no allocation):
// animals wander slow closed loops, slow down and turn, bob heads, swing trunks, and at
// night (or when napping) walk to their bed spot and lie down.
//
// Local frame: an animal faces +x, y up. Joints rotate about x (0), y (1) or z (2).

import * as THREE from 'three';

const SHAPES = { box: 0, sph: 1, cyl: 2, con: 3 };
const TAU = Math.PI * 2;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

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

const leg = (add, x, z, y, len, w, color, ph, amp, fold, par = -1) =>
  add({ shape: 'cyl', pos: [x, y, z], off: [0, -len / 2, 0], size: [w, len, w], color, kind: 'leg', amp, ph, sl: fold, par });
const eye = (add, par, x, y, z, s = 0.2) => add({ shape: 'sph', par, pos: [x, y, z], size: [s, s, s], color: '#1d1a18' });

function elephant(k = 1) {
  const { parts, add } = builder(k);
  const grey = '#9ba4ac', dark = '#838c94';
  add({ shape: 'sph', pos: [0, 4.3, 0], size: [8, 5.2, 5.2], color: grey });
  for (const [x, z, ph, f] of [[2.4, 1.7, 0, 1.5], [2.4, -1.7, Math.PI, 1.5], [-2.4, 1.7, Math.PI, -1.5], [-2.4, -1.7, 0, -1.5]]) leg(add, x, z, 3.3, 3.4, 1.7, dark, ph, 0.4, f);
  const head = add({ pos: [3.9, 5.3, 0], kind: 'neck', amp: 0.05, freq: 0.7, ga: -0.3, sl: -0.45 });
  add({ shape: 'sph', par: head, off: [0.9, -0.1, 0], size: [3.6, 3.6, 3.3], color: grey });
  for (const s of [1, -1]) {
    add({ shape: 'sph', par: head, pos: [-0.3, 0.7, s * 1.6], off: [-0.3, -0.3, s * 1.0], size: [0.45, 3.2, 3.0], color: '#b4a9ab', ax: 1, kind: 'osc', base: -s * 0.35, amp: s * 0.2, freq: 1.7, ph: s });
    add({ shape: 'con', par: head, pos: [1.7, -0.9, s * 0.95], off: [0, 0.8, 0], size: [0.38, 1.7, 0.38], color: '#f4eee0', base: -1.15 });
    eye(add, head, 1.9, 0.5, s * 1.45, 0.34);
  }
  const t1 = add({ par: head, pos: [2.2, -0.4, 0], kind: 'osc', base: 0.2, amp: 0.35, freq: 1.1 });
  add({ shape: 'cyl', par: t1, off: [0, -1.0, 0], size: [1.35, 2.2, 1.35], color: grey });
  const t2 = add({ par: t1, pos: [0, -2.1, 0], kind: 'osc', base: 0.35, amp: 0.4, freq: 1.1, ph: 0.8 });
  add({ shape: 'cyl', par: t2, off: [0, -0.9, 0], size: [1.0, 1.9, 1.0], color: grey });
  const t3 = add({ par: t2, pos: [0, -1.8, 0], kind: 'osc', base: 0.5, amp: 0.3, freq: 1.1, ph: 1.6 });
  add({ shape: 'cyl', par: t3, off: [0, -0.5, 0], size: [0.75, 1.2, 0.75], color: '#8b9097' });
  const tail = add({ pos: [-3.9, 5.2, 0], ax: 0, kind: 'osc', amp: 0.4, freq: 2.2 });
  add({ shape: 'cyl', par: tail, off: [0, -0.9, 0], size: [0.38, 1.8, 0.38], color: dark });
  return { parts, lie: 1.6 * k };
}

function giraffe(k = 1) {
  const { parts, add } = builder(k);
  const tan = '#e6b04e', spot = '#9a5d2c';
  add({ shape: 'sph', pos: [0, 6.2, 0], size: [5, 2.8, 2.4], color: tan });
  for (const [x, z, ph, f] of [[1.6, 0.8, 0, 1.5], [1.6, -0.8, Math.PI, 1.5], [-1.6, 0.8, Math.PI, -1.5], [-1.6, -0.8, 0, -1.5]]) {
    const l = leg(add, x, z, 5.2, 5.2, 0.72, '#eac27c', ph, 0.35, f);
    add({ shape: 'cyl', par: l, pos: [0, -5.1, 0], size: [0.8, 0.5, 0.8], color: '#6a4a30' });
  }
  // Patches sitting on the body's surface.
  const patches = [[-1.5, 0.3], [-0.6, 0.6], [0.3, 0.1], [1.1, 0.6], [-0.9, -0.4], [0, -0.55], [1.7, -0.2]];
  for (const [x, dy] of patches) for (const s of [1, -1]) {
    const e = 1 - (x / 2.5) ** 2 - (dy / 1.4) ** 2;
    if (e <= 0.05) continue;
    add({ shape: 'sph', pos: [x, 6.2 + dy, s * 1.2 * Math.sqrt(e)], size: [0.95, 0.8, 0.3], color: spot });
  }
  const neck = add({ pos: [1.8, 7.0, 0], kind: 'neck', base: -0.35, amp: 0.07, freq: 0.6, ga: -0.4, sl: -0.7 });
  add({ shape: 'box', par: neck, off: [0, 2.5, 0], size: [0.95, 5.2, 1.0], color: tan });
  add({ shape: 'box', par: neck, off: [-0.55, 2.5, 0], size: [0.2, 4.8, 0.45], color: '#8a5a2b' });
  for (const [y, s] of [[1.0, 1], [2.2, -1], [3.4, 1], [4.4, -1]]) add({ shape: 'box', par: neck, off: [0.05, y, s * 0.52], size: [0.6, 0.55, 0.14], color: spot });
  const head = add({ par: neck, pos: [0, 5.2, 0], kind: 'osc', base: 0.55, amp: 0.08, freq: 1.3, sl: 0.9 });
  add({ shape: 'box', par: head, off: [0.7, 0.15, 0], size: [1.7, 0.8, 0.8], color: tan });
  add({ shape: 'box', par: head, off: [1.55, 0, 0], size: [0.7, 0.6, 0.68], color: '#c98d4a' });
  for (const s of [1, -1]) {
    add({ shape: 'cyl', par: head, pos: [0.1, 0.4, s * 0.25], off: [0, 0.4, 0], size: [0.14, 0.8, 0.14], color: tan });
    add({ shape: 'sph', par: head, pos: [0.1, 1.25, s * 0.25], size: [0.3, 0.3, 0.3], color: '#6a4a30' });
    add({ shape: 'box', par: head, pos: [-0.2, 0.25, s * 0.5], off: [0, 0.1, s * 0.25], size: [0.5, 0.2, 0.4], color: '#c98d4a', ax: 0, kind: 'osc', amp: 0.3, freq: 2.4, ph: s });
    eye(add, head, 0.55, 0.3, s * 0.4, 0.2);
  }
  const tail = add({ pos: [-2.5, 6.9, 0], ax: 0, kind: 'osc', amp: 0.3, freq: 1.8 });
  add({ shape: 'cyl', par: tail, off: [0, -1.2, 0], size: [0.2, 2.4, 0.2], color: tan });
  add({ shape: 'sph', par: tail, pos: [0, -2.5, 0], size: [0.4, 0.6, 0.4], color: '#4a3524' });
  return { parts, lie: 4.2 * k };
}

function lion(k = 1, { mane = true } = {}) {
  const { parts, add } = builder(k);
  const fur = mane ? '#d9a548' : '#e0b663';
  add({ shape: 'sph', pos: [0, 2.1, 0], size: [3.4, 1.7, 1.4], color: fur });
  add({ shape: 'sph', pos: [-1.0, 2.1, 0], size: [1.8, 1.9, 1.5], color: fur });
  for (const [x, z, ph, f] of [[1.1, 0.5, 0, 1.4], [1.1, -0.5, Math.PI, 1.4], [-1.2, 0.5, Math.PI, -1.4], [-1.2, -0.5, 0, -1.4]]) leg(add, x, z, 1.6, 1.6, 0.55, '#cf9a40', ph, 0.5, f);
  const head = add({ pos: [1.8, 2.75, 0], kind: 'neck', amp: 0.05, freq: 0.9, ga: -0.5, sl: -0.55 });
  if (mane) add({ shape: 'sph', par: head, off: [-0.35, -0.05, 0], size: [2.1, 2.2, 2.3], color: '#7a4a22' });
  add({ shape: 'sph', par: head, off: [0.25, 0, 0], size: [1.25, 1.15, 1.15], color: fur });
  add({ shape: 'box', par: head, off: [0.95, -0.2, 0], size: [0.6, 0.45, 0.62], color: '#ecd09a' });
  add({ shape: 'box', par: head, off: [1.28, -0.02, 0], size: [0.12, 0.2, 0.3], color: '#3a2a26' });
  for (const s of [1, -1]) { add({ shape: 'sph', par: head, pos: [0.1, 0.65, s * 0.5], size: [0.35, 0.35, 0.3], color: '#7a4a22' }); eye(add, head, 0.75, 0.2, s * 0.4, 0.16); }
  const tail = add({ pos: [-1.9, 2.5, 0], ax: 0, kind: 'osc', amp: 0.3, freq: 1.5, base: 0.1 });
  add({ shape: 'cyl', par: tail, off: [0, -0.9, 0], size: [0.2, 1.8, 0.2], color: fur });
  add({ shape: 'sph', par: tail, pos: [0, -1.9, 0], size: [0.45, 0.6, 0.45], color: '#5a3a1e' });
  return { parts, lie: 1.05 * k };
}

function zebra(k = 1) {
  const { parts, add } = builder(k);
  const white = '#f4f1ea', dark = '#2a2d33';
  add({ shape: 'sph', pos: [0, 2.6, 0], size: [3.6, 1.8, 1.4], color: white });
  for (const x of [-1.2, -0.65, -0.1, 0.45, 1.0]) {
    const r = Math.sqrt(1 - (x / 1.8) ** 2);
    add({ shape: 'sph', pos: [x, 2.6, 0], size: [0.3, 1.8 * r * 1.1, 1.4 * r * 1.1], color: dark });
  }
  for (const [x, z, ph, f] of [[1.1, 0.45, 0, 1.4], [1.1, -0.45, Math.PI, 1.4], [-1.1, 0.45, Math.PI, -1.4], [-1.1, -0.45, 0, -1.4]]) {
    const l = leg(add, x, z, 2.05, 2.05, 0.38, white, ph, 0.5, f);
    add({ shape: 'cyl', par: l, pos: [0, -1.9, 0], size: [0.44, 0.34, 0.44], color: dark });
  }
  const neck = add({ pos: [1.55, 3.1, 0], kind: 'neck', base: -0.7, amp: 0.05, freq: 0.8, ga: -1.2, sl: -2.0 });
  add({ shape: 'box', par: neck, off: [0, 0.9, 0], size: [0.75, 1.8, 0.6], color: white });
  add({ shape: 'box', par: neck, off: [-0.45, 0.9, 0], size: [0.2, 1.6, 0.3], color: dark });
  add({ shape: 'box', par: neck, off: [0.05, 0.7, 0], size: [0.82, 0.22, 0.66], color: dark });
  const head = add({ par: neck, pos: [0, 1.8, 0], kind: 'osc', base: 0.75, amp: 0.06, freq: 1.2 });
  add({ shape: 'box', par: head, off: [0.55, -0.1, 0], size: [1.2, 0.55, 0.5], color: white });
  add({ shape: 'box', par: head, off: [1.2, -0.15, 0], size: [0.42, 0.45, 0.46], color: dark });
  for (const s of [1, -1]) {
    add({ shape: 'box', par: head, pos: [-0.1, 0.25, s * 0.2], off: [0, 0.25, 0], size: [0.18, 0.5, 0.2], color: dark, ax: 0, kind: 'osc', amp: 0.25, freq: 2.6, ph: s });
    eye(add, head, 0.35, 0.1, s * 0.27, 0.14);
  }
  const tail = add({ pos: [-1.8, 2.9, 0], ax: 0, kind: 'osc', amp: 0.35, freq: 2 });
  add({ shape: 'cyl', par: tail, off: [0, -0.7, 0], size: [0.16, 1.4, 0.16], color: dark });
  return { parts, lie: 1.45 * k };
}

function penguin(k = 1) {
  const { parts, add } = builder(k);
  const black = '#232a33';
  add({ shape: 'sph', pos: [0, 0.85, 0], size: [0.95, 1.35, 0.85], color: black });
  add({ shape: 'sph', pos: [0.2, 0.8, 0], size: [0.72, 1.1, 0.7], color: '#f6f6f2' });
  const head = add({ pos: [0.05, 1.5, 0], kind: 'neck', amp: 0.1, freq: 1.4, ga: 0.2, sl: -0.5 });
  add({ shape: 'sph', par: head, off: [0.05, 0.12, 0], size: [0.62, 0.6, 0.6], color: black });
  add({ shape: 'con', par: head, pos: [0.3, 0.1, 0], off: [0, 0.15, 0], size: [0.2, 0.42, 0.2], color: '#f0a02a', base: -1.5708 });
  for (const s of [1, -1]) {
    add({ shape: 'box', par: -1, pos: [0, 1.15, s * 0.46], off: [0, -0.35, s * 0.04], size: [0.28, 0.8, 0.08], color: black, ax: 0, kind: 'flap', base: s * 0.35, amp: s * -0.4, freq: 1.4, ph: s });
    add({ shape: 'box', pos: [0.12, 0.12, s * 0.2], off: [0.1, -0.05, 0], size: [0.42, 0.12, 0.2], color: '#f0a02a', kind: 'leg', amp: 0.5, ph: s > 0 ? 0 : Math.PI });
    eye(add, head, 0.28, 0.2, s * 0.22, 0.1);
  }
  return { parts, lie: 0 };
}

function flamingo(k = 1, { oneLeg = false } = {}) {
  const { parts, add } = builder(k);
  const pink = '#f293aa', deep = '#e8758f';
  add({ shape: 'sph', pos: [0, 2.8, 0], size: [2.0, 1.3, 1.1], color: pink });
  add({ shape: 'sph', pos: [-0.9, 2.75, 0], size: [1.2, 0.7, 0.5], color: '#f7b7c4' });
  add({ shape: 'cyl', pos: [0.1, 2.4, 0.18], off: [0, -1.2, 0], size: [0.14, 2.4, 0.14], color: deep, kind: 'leg', amp: oneLeg ? 0 : 0.18 });
  add({ shape: 'cyl', pos: [0.1, 2.4, -0.18], off: [0, -1.2, 0], size: [0.14, 2.4, 0.14], color: deep, kind: oneLeg ? '' : 'leg', amp: 0.18, ph: Math.PI, base: oneLeg ? -1.4 : 0 });
  const n1 = add({ pos: [0.9, 3.0, 0], base: -0.5, kind: 'neck', amp: 0.1, freq: 0.8, ga: -1.7, sl: -1.3 });
  add({ shape: 'box', par: n1, off: [0, 0.7, 0], size: [0.28, 1.4, 0.28], color: pink });
  const n2 = add({ par: n1, pos: [0, 1.4, 0], base: 1.1, kind: 'osc', amp: 0.1, freq: 0.9, ph: 1, sl: 1.5 });
  add({ shape: 'box', par: n2, off: [0, 0.7, 0], size: [0.26, 1.4, 0.26], color: pink });
  const head = add({ par: n2, pos: [0, 1.4, 0], base: -0.8, kind: 'osc', amp: 0.1, freq: 1.1 });
  add({ shape: 'sph', par: head, off: [0.15, 0.05, 0], size: [0.5, 0.42, 0.42], color: pink });
  add({ shape: 'box', par: head, off: [0.5, -0.1, 0], size: [0.46, 0.16, 0.2], color: '#f7d0d6' });
  add({ shape: 'box', par: head, off: [0.82, -0.18, 0], size: [0.3, 0.14, 0.2], color: '#2a2a2a', ax: 2 });
  eye(add, head, 0.28, 0.1, 0.2, 0.1);
  eye(add, head, 0.28, 0.1, -0.2, 0.1);
  return { parts, lie: 0 };
}

function monkey(k = 1) {
  const { parts, add } = builder(k);
  const fur = '#8a5a36';
  add({ shape: 'sph', pos: [0, 1.5, 0], size: [1.0, 1.2, 0.8], color: fur });
  add({ shape: 'sph', pos: [0.12, 1.45, 0], size: [0.7, 0.9, 0.7], color: '#c9a07a' });
  const head = add({ pos: [0.4, 2.2, 0], kind: 'neck', amp: 0.12, freq: 1.6, ga: -0.3, sl: -0.5 });
  add({ shape: 'sph', par: head, size: [0.72, 0.68, 0.68], color: fur });
  add({ shape: 'sph', par: head, off: [0.25, -0.05, 0], size: [0.42, 0.42, 0.5], color: '#e8c9a0' });
  for (const s of [1, -1]) {
    add({ shape: 'sph', par: head, pos: [-0.05, 0.1, s * 0.38], size: [0.3, 0.3, 0.12], color: '#e8c9a0' });
    eye(add, head, 0.42, 0.1, s * 0.15, 0.1);
    add({ shape: 'cyl', pos: [0.15, 1.95, s * 0.52], off: [0, -0.5, 0], size: [0.22, 1.0, 0.22], color: fur, kind: 'leg', amp: 0.7, ph: s > 0 ? 0 : Math.PI, sl: 0.3 });
    add({ shape: 'cyl', pos: [-0.05, 1.0, s * 0.25], off: [0, -0.5, 0], size: [0.28, 1.0, 0.28], color: fur, kind: 'leg', amp: 0.7, ph: s > 0 ? Math.PI : 0, sl: 1.3 * s * 0 + 1.2 });
  }
  const tail = add({ pos: [-0.5, 1.2, 0], base: 0.8, kind: 'osc', amp: 0.25, freq: 2.4 });
  add({ shape: 'cyl', par: tail, off: [0, 0.7, 0], size: [0.12, 1.4, 0.12], color: fur });
  return { parts, lie: 0.7 * k };
}

function hippo(k = 1) {
  const { parts, add } = builder(k);
  const skin = '#8f7f93';
  add({ shape: 'sph', pos: [0, 1.6, 0], size: [5, 3, 3.2], color: skin });
  for (const [x, z, ph] of [[1.6, 1.1, 0], [1.6, -1.1, Math.PI], [-1.6, 1.1, Math.PI], [-1.6, -1.1, 0]]) leg(add, x, z, 1.0, 1.0, 1.0, '#85758a', ph, 0.3, null);
  const head = add({ pos: [2.4, 1.9, 0], kind: 'neck', amp: 0.06, freq: 0.7, ga: 0, sl: -0.35 });
  add({ shape: 'sph', par: head, off: [0.8, 0, 0], size: [2.3, 1.5, 2.1], color: skin });
  const jaw = add({ par: head, pos: [0.2, -0.5, 0], kind: 'osc', base: -0.22, amp: 0.2, freq: 0.5 });
  add({ shape: 'box', par: jaw, off: [0.9, -0.05, 0], size: [1.9, 0.5, 1.7], color: '#a48ea6' });
  add({ shape: 'box', par: head, off: [1.85, 0.05, 0], size: [0.5, 0.9, 1.9], color: '#a48ea6' });
  for (const s of [1, -1]) {
    add({ shape: 'sph', par: head, pos: [0.4, 0.75, s * 0.7], size: [0.55, 0.5, 0.5], color: skin });
    eye(add, head, 0.5, 0.95, s * 0.72, 0.22);
    add({ shape: 'sph', par: head, pos: [-0.2, 0.7, s * 0.9], size: [0.4, 0.5, 0.3], color: '#7a6a7e', ax: 0, kind: 'osc', amp: 0.3, freq: 3, ph: s });
    add({ shape: 'sph', par: head, pos: [1.95, 0.55, s * 0.45], size: [0.3, 0.3, 0.3], color: '#6e5e72' });
  }
  const tail = add({ pos: [-2.5, 2.2, 0], ax: 0, kind: 'osc', amp: 0.4, freq: 2 });
  add({ shape: 'cyl', par: tail, off: [0, -0.4, 0], size: [0.3, 0.8, 0.3], color: skin });
  return { parts, lie: 0.5 * k };
}

export const TEMPLATES = { elephant, giraffe, lion, zebra, penguin, flamingo, monkey, hippo };

// ------------------------------------------------------------------ the herd
// spec: { tpl, k, opts, cx, cz, rx, rz, w, w2, a, k2, phase, dir, y0, nap, step, hop, waddle,
//         swim, graze, seed, yaw (static facing), bed: {x, z, yaw}? }
export function createAnimals(specs, { open = 540, close = 1020 } = {}) {
  const animals = [];
  const counts = [0, 0, 0, 0];
  for (const [i, s] of specs.entries()) {
    const tpl = TEMPLATES[s.tpl](s.k || 1, s.opts || {});
    const an = {
      s, tpl, seed: s.seed !== undefined ? s.seed : i * 1.7 + 0.3,
      w: s.w || 0.15, w2: s.w2 || 0.3, a: s.a !== undefined ? s.a : 0.9, k2: s.k2 || 1,
      dir: s.dir || 1, phase: s.phase || 0, moves: (s.rx || 0) + (s.rz || 0) > 0,
      rx: s.rx || 0, rz: s.rz || 0, y0: s.y0 || 0, nap: s.nap || 0, hop: s.hop || 0, waddle: s.waddle || 0,
      swim: s.swim ? -1.25 : 0, graze: s.graze === undefined ? 1 : s.graze, yaw: s.yaw || 0,
      N: tpl.parts.map(() => new THREE.Matrix4()), idx: tpl.parts.map(() => -1)
    };
    an.wa = an.w * an.a / an.w2;
    an.lpk = (TAU * Math.max(1, Math.sqrt((an.rx * an.rx + an.rz * an.rz) / 2))) / (s.step || 1.6);
    const th = an.dir * an.phase, c = Math.cos(th), sn = Math.sin(th);
    const bx = s.cx + an.rx * c, bz = s.cz + an.rz * Math.sin(an.k2 * th);
    const dx = -an.rx * sn, dz = an.rz * an.k2 * Math.cos(an.k2 * th);
    an.bed = s.bed || { x: bx, z: bz, yaw: an.moves ? Math.atan2(-dz * an.dir, dx * an.dir) : an.yaw };
    tpl.parts.forEach((p, j) => { if (p.shape >= 0) an.idx[j] = counts[p.shape]++; });
    animals.push(an);
  }

  const geos = [new THREE.BoxGeometry(1, 1, 1), new THREE.SphereGeometry(0.5, 7, 5), new THREE.CylinderGeometry(0.5, 0.5, 1, 6), new THREE.ConeGeometry(0.5, 1, 6)];
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0 });
  const meshes = geos.map((g, si) => {
    const m = new THREE.InstancedMesh(g, mat, Math.max(1, counts[si]));
    m.count = counts[si]; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    m.name = 'zoo-animals-' + ['box', 'sphere', 'cylinder', 'cone'][si];
    return m;
  });
  const col = new THREE.Color();
  for (const an of animals) an.tpl.parts.forEach((p, j) => { if (p.shape >= 0) meshes[p.shape].setColorAt(an.idx[j], col.set(p.color)); });
  for (const m of meshes) if (m.instanceColor) m.instanceColor.needsUpdate = true;

  const root = new THREE.Matrix4(), T = new THREE.Matrix4(), R = new THREE.Matrix4(), D = new THREE.Matrix4();
  const Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), V = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);

  function update(frame) {
    const t = frame.time, m = frame.minute;
    const night = 1 - smooth(open - 40, open + 5, m) * (1 - smooth(close - 10, close + 30, m));
    for (let ai = 0; ai < animals.length; ai++) {
      const an = animals[ai], parts = an.tpl.parts, s = an.s;
      let nap = 0;
      if (an.nap > 0) { const th = 1 - 1.2 * an.nap, v = Math.sin(t * 0.045 + an.seed * 5.3); nap = smooth(th - 0.15, th + 0.15, v); }
      const sl = Math.max(night, nap), sPos = smooth(0, 0.8, sl), sFold = smooth(0.8, 1, sl);
      // The wander loop; speed breathes so animals slow down and turn.
      const th0 = an.w * t - an.wa * Math.cos(an.w2 * t) + an.phase, th = an.dir * th0;
      let x = s.cx, z = s.cz, yaw = an.yaw, mvPath = 0;
      if (an.moves) {
        x += an.rx * Math.cos(th); z += an.rz * Math.sin(an.k2 * th);
        yaw = Math.atan2(-an.rz * an.k2 * Math.cos(an.k2 * th) * an.dir, -an.rx * Math.sin(th) * an.dir);
        mvPath = (1 + an.a * Math.sin(an.w2 * t)) / (1 + an.a);
      } else yaw += 0.35 * Math.sin(t * 0.3 + an.seed * 2) * (1 - sPos);
      let dy = an.bed.yaw - yaw; dy -= TAU * Math.round(dy / TAU);
      yaw += dy * sPos; x += (an.bed.x - x) * sPos; z += (an.bed.z - z) * sPos;
      const mv = an.moves ? mvPath * (1 - sPos) + 3.4 * sPos * (1 - sPos) : 0;
      const gr = an.graze * (1 - smooth(0.12, 0.4, mvPath)) * (1 - sPos) * (0.5 + 0.5 * Math.sin(t * 0.4 + an.seed * 3));
      const lp = Math.abs(th0) * an.lpk + an.seed;
      const y = an.y0 + an.hop * Math.abs(Math.sin(lp)) * mv - an.tpl.lie * sFold + (an.swim ? 0.06 * Math.sin(t * 1.3 + an.seed) : 0);
      E.set(an.waddle * Math.sin(lp) * mv, yaw, an.swim, 'YZX');
      root.compose(P.set(x, y, z), Q.setFromEuler(E), ONE);

      for (let j = 0; j < parts.length; j++) {
        const p = parts[j], N = an.N[j];
        N.copy(p.par < 0 ? root : an.N[p.par]);
        if (p.pos[0] !== 0 || p.pos[1] !== 0 || p.pos[2] !== 0) N.multiply(T.makeTranslation(p.pos[0], p.pos[1], p.pos[2]));
        let a = p.base;
        switch (p.kind) {
          case 'leg': a += p.amp * Math.sin(lp + p.ph) * mv; break;
          case 'osc': a += p.amp * Math.sin(t * p.freq + p.ph); break;
          case 'neck': a += p.amp * Math.sin(t * p.freq + p.ph) + p.ga * gr; break;
          case 'flap': a += p.amp * (0.4 * Math.sin(t * p.freq * 2 + p.ph) + Math.sin(lp * 2 + p.ph) * mv); break;
          default: break;
        }
        if (p.sl !== null) a += (p.sl - a) * sFold;
        if (a !== 0) { N.multiply(p.ax === 0 ? R.makeRotationX(a) : p.ax === 1 ? R.makeRotationY(a) : R.makeRotationZ(a)); }
        if (p.shape >= 0) {
          D.copy(N);
          if (p.off[0] !== 0 || p.off[1] !== 0 || p.off[2] !== 0) D.multiply(T.makeTranslation(p.off[0], p.off[1], p.off[2]));
          D.scale(V.set(p.size[0], p.size[1], p.size[2]));
          meshes[p.shape].setMatrixAt(an.idx[j], D);
        }
      }
    }
    for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
  }

  return { meshes, update, count: animals.length, dispose() { for (const g of geos) g.dispose(); mat.dispose(); for (const m of meshes) m.dispose(); } };
}
