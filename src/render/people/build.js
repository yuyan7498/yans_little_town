// Turns an appearance (appearance.js) into one figure's geometry: rigid low-poly parts
// on the bones of body.js, flat vertex colours, faceted. Pure JavaScript; the result is
// typed arrays the crowd batch copies into a slot. Budget: under 1000 triangles.

import { FigureMesh, shade, mixHex } from './shapes.js';
import { BONE, bodyOf } from './body.js';
import { EYES, MOUTH, BLUSH, SILVER } from './palette.js';

const { pelvis: PELVIS, torso: TORSO, head: HEAD, prop: PROP, helmet: HELMET, hat: HAT, hem: HEM } = BONE;
const APO = Math.cos(Math.PI / 8);   // an 8-sided lathe's flat front sits at r·cos(π/8)
const TAU = Math.PI * 2;
const clamp01 = t => Math.max(0, Math.min(1, t));

// How far each hair style stands off the head (hats and helmets sit over it).
const HAIR_SCALE = { crop: 1.05, buzz: 1.03, short: 1.08, side: 1.09, curtain: 1.08, spiky: 1.07, bowl: 1.1, tuft: 1.04,
  bob: 1.1, long: 1.08, pony: 1.05, bun: 1.05, twin: 1.06, perm: 1.12, thin: 1.04, bald: 1.0 };

export function buildFigure(a, { lite = false } = {}) {
  const d = bodyOf(a);
  const m = new FigureMesh(lite);
  const c = { a, d, m, torso: torsoRings(d), outerFront: null };
  pelvisPart(c);
  torsoPart(c);
  headPart(c);
  hairPart(c);
  hatPart(c);
  helmetPart(c);
  armPart(c, -1); armPart(c, 1);
  legPart(c, -1); legPart(c, 1);
  hemPart(c);
  bagPart(c);
  if (!lite) extrasPart(c);
  propPart(c);
  return { mesh: pack(m), rig: rigOf(a, d), body: d };
}

export function pack(m) {
  const n = m.vertexCount;
  const normals = new Int8Array(n * 3), colors = new Uint16Array(n * 3);
  for (let i = 0; i < n * 3; i++) { normals[i] = Math.round(m.nrm[i] * 127); colors[i] = Math.round(clamp01(m.col[i]) * 65535); }
  return { positions: new Float32Array(m.pos), normals, colors, bones: new Uint8Array(m.bone), indices: new Uint16Array(m.idx),
    vertexCount: n, triangleCount: m.triangleCount };
}

// What the pose solver needs to know about this figure.
function rigOf(a, d) {
  const prop = a.prop ? a.prop.kind : null;
  const bagSide = a.bag && (a.bag.kind === 'tote' || a.bag.kind === 'satchel');
  return {
    ...d,
    stoop: a.stoop, step: a.gait.step, swing: a.gait.swing, idle: a.idle, prop,
    swingRight: prop === 'briefcase' || prop === 'nylon' ? 0.35 : bagSide ? 0.55 : 1,
    caneLen: d.hipY * 1.0,
    propDrop: prop === 'briefcase' ? 0.6 * d.k : prop === 'nylon' ? 0.78 * d.k : 0
  };
}

// --- helpers ----------------------------------------------------------------

function torsoRings(d, s = 1) {
  const L = d.torsoLen, hd = d.torsoHD * s, hw = d.torsoHW * s;
  return [[-0.03 * d.k, 0.92 * hd, 0.86 * hw], [0.42 * L, hd, 0.95 * hw], [0.78 * L, 1.02 * hd, hw], [L, 0.74 * hd, 0.76 * hw]];
}

// x of an 8-sided lathe's flat front at height y.
function frontAt(rings, y) {
  let i = 0;
  while (i < rings.length - 2 && y > rings[i + 1][0]) i++;
  const r0 = rings[i], r1 = rings[i + 1];
  const t = clamp01((y - r0[0]) / (r1[0] - r0[0]));
  return (r0[1] + (r1[1] - r0[1]) * t) * APO + (r0[3] || 0) + ((r1[3] || 0) - (r0[3] || 0)) * t;
}

// A flat strip lying on the front of a lathe from y0 to y1 (a placket, tie, strap, apron
// bib), following the surface's slope ring by ring. `out` is how far it stands proud.
function frontStrip(m, bone, color, rings, y0, y1, width, { out = 0.012, z = 0, thick = 0.05 } = {}) {
  if (m.lite && width < 0.13) return;
  const cuts = [y0];
  for (const r of rings) if (r[0] > y0 && r[0] < y1) cuts.push(r[0]);
  cuts.push(y1);
  for (let i = 0; i < cuts.length - 1; i++) {
    const ya = cuts[i], yb = cuts[i + 1];
    if (yb - ya < 1e-3) continue;
    const xa = frontAt(rings, ya), xb = frontAt(rings, yb);
    const len = Math.hypot(xb - xa, yb - ya), phi = -Math.atan2(xb - xa, yb - ya);
    m.box(bone, color, (xa + xb) / 2 + out - thick / 2 * Math.cos(phi), (ya + yb) / 2, z, thick, len + 0.004, width, [0, 0, phi]);
  }
}

const isLayer = o => o && o.kind !== 'gown';
function sleeveColour(a) { return a.outer ? a.outer.color : a.top.color; }
function sleevesLong(a) { return a.outer ? a.outer.kind !== 'gown' : a.top.sleeves === 'long'; }

// --- body -------------------------------------------------------------------

function pelvisPart({ a, d, m }) {
  const k = d.k, hd = d.torsoHD, hw = d.torsoHW, top = d.waist + 0.06 * k;
  m.lathe(PELVIS, a.bottom.color, [[-0.55 * d.thighR, 0.86 * hd, 0.84 * hw], [0.15 * d.waist, 0.97 * hd, 0.9 * hw], [top, 0.93 * hd, 0.87 * hw]]);
  if (a.bottom.belt && !isLayer(a.outer)) {
    m.lathe(PELVIS, a.bottom.belt, [[d.waist - 0.06 * k, 0.965 * hd, 0.905 * hw], [d.waist + 0.01 * k, 0.955 * hd, 0.895 * hw]], { bottom: null, top: null });
  }
  if (a.bag && a.bag.kind === 'fanny') {
    m.box(PELVIS, a.bag.color, 0.93 * hd * APO + 0.07 * k, d.waist - 0.07 * k, 0.12 * hw, 0.15 * k, 0.2 * k, 0.48 * k);
    m.lathe(PELVIS, shade(a.bag.color, -0.2), [[d.waist - 0.04 * k, 0.975 * hd, 0.915 * hw], [d.waist + 0.0 * k, 0.97 * hd, 0.91 * hw]], { bottom: null, top: null });
  }
}

function torsoPart(c) {
  const { a, d, m } = c;
  const k = d.k, L = d.torsoLen, hd = d.torsoHD, hw = d.torsoHW;
  const outer = isLayer(a.outer) ? a.outer : null;
  const shell = torsoRings(d);
  if (outer && outer.kind !== 'track') shell[0] = [-0.75 * d.waist, 0.985 * hd, 0.93 * hw];   // jackets hang over the hips
  m.lathe(TORSO, outer ? outer.color : a.top.color, shell);
  c.torso = shell;
  let front = shell;

  // What shows down the front of an open layer, and the tie on top of it.
  if (outer) {
    if (outer.kind === 'blazer' || outer.kind === 'coat') {
      frontStrip(m, TORSO, a.top.color, shell, 0.36 * L, 0.64 * L, 0.2 * hw);
      frontStrip(m, TORSO, a.top.color, shell, 0.62 * L, 1.0 * L, 0.46 * hw);
      if (outer.trim) frontStrip(m, TORSO, outer.trim, shell, 0.2 * L, 0.62 * L, 0.035 * k, { out: 0.016 });
    } else if (outer.kind === 'track') {
      frontStrip(m, TORSO, outer.trim, shell, 0.02 * L, 0.97 * L, 0.04 * k);
      m.lathe(TORSO, outer.trim, [[L - 0.02 * k, d.neckR * 1.55, d.neckR * 1.55], [L + 0.08 * k, d.neckR * 1.4, d.neckR * 1.4]], { n: 8, bottom: null, top: null });
    } else {
      frontStrip(m, TORSO, a.top.color, shell, 0.0, L, (outer.kind === 'cardigan' ? 0.2 : 0.26) * hw);
    }
  }
  if (a.top.tie) frontStrip(m, TORSO, a.top.tie, shell, 0.36 * L, 0.98 * L, 0.09 * k, { out: 0.03 });
  if (a.top.collar && !(outer && outer.kind === 'track')) {
    const col = a.top.collar === 'self' ? a.top.color : a.top.collar;
    m.lathe(TORSO, col, [[L - 0.03 * k, d.neckR * 1.5, d.neckR * 1.5], [L + 0.075 * k, d.neckR * 1.32, d.neckR * 1.32]], { n: 8, bottom: null, top: null });
  }
  if (a.top.stripe && !outer) {
    const band = torsoRings(d, 1.03);
    m.lathe(TORSO, a.top.stripe, [[0.56 * L, ...ringAt(band, 0.56 * L)], [0.63 * L, ...ringAt(band, 0.63 * L)]], { bottom: null, top: null });
  }
  if (outer && outer.kind === 'track') {
    const band = torsoRings(d, 1.03);
    m.lathe(TORSO, outer.trim, [[0.55 * L, ...ringAt(band, 0.55 * L)], [0.6 * L, ...ringAt(band, 0.6 * L)]], { bottom: null, top: null });
  }

  // A vest over it all (police, sanitation, bank, convenience store, seniors).
  if (a.vest) {
    const v = torsoRings(d, 1.06);
    v[0] = [0.04 * L, ...ringAt(v, 0.04 * L)];
    v[3] = [0.97 * L, 0.8 * hd * 1.06, 0.8 * hw * 1.06];
    m.lathe(TORSO, a.vest.color, v);
    if (a.vest.open) frontStrip(m, TORSO, a.top.color, v, 0.04 * L, 0.97 * L, 0.22 * hw);
    if (a.vest.strip) {
      const s = torsoRings(d, 1.09);
      for (const y of [0.3 * L, 0.56 * L]) m.lathe(TORSO, a.vest.strip, [[y, ...ringAt(s, y)], [y + 0.075 * k, ...ringAt(s, y + 0.075 * k)]], { bottom: null, top: null });
    }
    front = v;
  }
  if (a.apron) {
    if (a.apron.bib) {
      frontStrip(m, TORSO, a.apron.color, front, 0.0, 0.8 * L, 1.25 * hw, { out: 0.02 });
      frontStrip(m, TORSO, a.apron.color, front, 0.8 * L, L + 0.04 * k, 0.07 * k, { out: 0.02 });
    }
    const band = torsoRings(d, 1.05);
    m.lathe(TORSO, a.apron.color, [[0.0, ...ringAt(band, 0)], [0.06 * k, ...ringAt(band, 0.06 * k)]], { bottom: null, top: null });
  }
  c.outerFront = front;

  // Small chest details.
  if (a.top.logo && !outer && !a.vest && !(a.apron && a.apron.bib)) m.box(TORSO, a.top.logo, frontAt(shell, 0.72 * L), 0.72 * L, -0.26 * hw, 0.03, 0.09 * k, 0.12 * k);
  if (a.top.pocket && !outer && !a.vest && !(a.apron && a.apron.bib)) {
    if (a.top.hood) frontStrip(m, TORSO, shade(a.top.color, -0.1), shell, 0.06 * L, 0.32 * L, 1.0 * hw);
    else m.box(TORSO, shade(a.top.color, -0.12), frontAt(shell, 0.64 * L), 0.64 * L, 0.27 * hw, 0.03, 0.16 * k, 0.17 * k);
  }
  if (a.top.hood) {
    const col = outer ? a.top.color : a.top.color;
    m.box(TORSO, col, -0.62 * hd, L + 0.0 * k, 0, 0.26 * k, 0.24 * k, 1.05 * hw);
    if (!outer && !a.vest) for (const s of [-1, 1]) frontStrip(m, TORSO, '#f2f0ea', shell, 0.66 * L, 0.98 * L, 0.03 * k, { z: s * 0.16 * hw });
  }
  // Neck.
  m.lathe(TORSO, a.skin, [[L - 0.08 * k, d.neckR, d.neckR], [d.neckTop + 0.05 * k, 0.95 * d.neckR, 0.95 * d.neckR]], { n: 6, bottom: null, top: null });
}

function ringAt(rings, y) {
  let i = 0;
  while (i < rings.length - 2 && y > rings[i + 1][0]) i++;
  const r0 = rings[i], r1 = rings[i + 1], t = clamp01((y - r0[0]) / (r1[0] - r0[0]));
  return [r0[1] + (r1[1] - r0[1]) * t, r0[2] + (r1[2] - r0[2]) * t];
}

function headRings(d) {
  const h = d.headH, hw = d.headHW, hd = d.headHD, cx = d.headCX;
  return [[0, 0.62 * hd, 0.62 * hw, cx + 0.05 * h], [0.2 * h, 0.93 * hd, 0.93 * hw, cx + 0.02 * h], [0.5 * h, hd, hw, cx],
    [0.8 * h, 0.96 * hd, 0.97 * hw, cx - 0.01 * h], [0.97 * h, 0.6 * hd, 0.62 * hw, cx - 0.03 * h]];
}

function headPart({ a, d, m }) {
  const h = d.headH, hw = d.headHW, hd = d.headHD, cx = d.headCX, k = d.k;
  const rings = headRings(d);
  m.lathe(HEAD, a.skin, rings);
  const face = y => frontAt(rings, y);
  const big = 1 + 0.3 * (1 - d.t);            // children's eyes are bigger
  const ey = 0.45 * h, ez = 0.26 * hw;
  for (const s of [-1, 1]) m.box(HEAD, EYES, face(ey) + 0.006, ey, s * ez, 0.04 * h, 0.12 * h * big, 0.07 * h * big, null, [0]);
  if (!m.lite) m.box(HEAD, shade(a.skin, -0.1), face(0.35 * h) + 0.018 * h, 0.35 * h, 0, 0.06 * h, 0.09 * h, 0.07 * h);   // nose
  m.box(HEAD, a.blush ? '#c8645a' : MOUTH, face(0.24 * h) + 0.004, 0.24 * h, 0, 0.03 * h, 0.03 * h, 0.13 * h);
  if (a.blush && !m.lite) {
    for (const s of [-1, 1]) {
      const ang = s * Math.PI / 4;
      m.box(HEAD, BLUSH, cx + 0.94 * hd * APO * Math.cos(ang) + 0.005, 0.31 * h, 0.94 * hw * APO * Math.sin(ang), 0.02 * h, 0.06 * h, 0.13 * h, [0, -ang, 0]);
    }
  }
  if (!m.lite) for (const s of [-1, 1]) m.box(HEAD, shade(a.skin, -0.06), cx - 0.06 * h, 0.44 * h, s * 0.95 * hw, 0.13 * h, 0.2 * h, 0.08 * h);   // ears
  if (a.glasses && !m.lite) {
    const g = a.glasses, fx = face(0.5 * h) + 0.03 * h;
    m.box(HEAD, g, fx, 0.54 * h, 0, 0.025 * h, 0.035 * h, 0.86 * hw);
    m.box(HEAD, g, fx, 0.37 * h, 0, 0.025 * h, 0.03 * h, 0.86 * hw);
    for (const s of [-1, 1]) m.box(HEAD, g, fx, 0.455 * h, s * 0.415 * hw, 0.025 * h, 0.2 * h, 0.035 * h);
    m.box(HEAD, g, cx + 0.2 * h, 0.53 * h, 0, hd * 1.2, 0.03 * h, 1.92 * hw);   // temples (hidden inside the head but at the sides)
  }
  void k;
}

function hairCap(m, a, d, s, front, back, color = a.hair.color, crown = 1) {
  const h = d.headH, hw = d.headHW, hd = d.headHD, cx = d.headCX;
  const mid = (front + back) / 2 * h, tilt = (front - back) / 2 * h;
  m.lathe(HEAD, color, [
    [mid, s * hd, s * hw, cx, 0, tilt],
    [0.8 * h, s * 0.97 * hd, s * 0.98 * hw, cx - 0.01 * h, 0, tilt * 0.3],
    [0.97 * h + d.hairTop * 0.4 * crown, s * 0.72 * hd, s * 0.74 * hw, cx - 0.03 * h, 0, tilt * 0.1]
  ], { bottom: null, top: h + d.hairTop * crown });
}

function hairPart({ a, d, m }) {
  const h = d.headH, hw = d.headHW, hd = d.headHD, cx = d.headCX;
  const style = a.hair.style, col = a.hair.color, s = HAIR_SCALE[style] || 1.07;
  const fx = cx + s * hd * APO;   // front of the hair
  const fringe = (z, rx, w, hgt = 0.17) => !m.lite && m.box(HEAD, col, fx - 0.02 * h, 0.77 * h, z, 0.1 * h, hgt * h, w, [rx, 0, 0]);
  switch (style) {
    case 'crop': hairCap(m, a, d, s, 0.74, 0.26); break;
    case 'buzz': hairCap(m, a, d, s, 0.78, 0.3, mixHex(col, a.skin, 0.3)); break;
    case 'short': hairCap(m, a, d, s, 0.72, 0.24); fringe(0.08 * hw, 0.18, 1.35 * hw); break;
    case 'side': hairCap(m, a, d, s, 0.7, 0.24); fringe(0.2 * hw, 0.38, 1.3 * hw, 0.2); break;
    case 'curtain': hairCap(m, a, d, s, 0.74, 0.26); for (const z of [-1, 1]) fringe(z * 0.36 * hw, z * 0.5, 0.62 * hw, 0.22); break;
    case 'spiky':
      hairCap(m, a, d, s, 0.76, 0.26);
      for (const [x, z, tilt] of [[0.18, 0, -0.2], [-0.08, -0.22, 0.3], [-0.08, 0.22, 0.3], [-0.32, 0, 0.7]]) {
        m.lathe(HEAD, col, [[0, 0.09 * h, 0.09 * h]], { n: 4, bottom: 'flat', top: 0.2 * h, at: [cx + x * h, 0.97 * h, z * h], rot: [z * -1.2, 0, tilt] });
      }
      break;
    case 'bowl': hairCap(m, a, d, s, 0.6, 0.42); break;
    case 'tuft':
      hairCap(m, a, d, s, 0.72, 0.3);
      m.lathe(HEAD, col, [[0, 0.07 * h, 0.07 * h]], { n: 4, top: 0.16 * h, at: [cx + 0.05 * h, h + d.hairTop * 0.6, 0], rot: [0, 0, 0.5] });
      break;
    case 'bob':
      hairCap(m, a, d, s, 0.64, 0.3);
      m.shell(HEAD, col, { y0: 0.1 * h, y1: 0.68 * h, r0: [1.14 * hd, 1.13 * hw], r1: [1.08 * hd, 1.07 * hw], a0: 0.8, a1: TAU - 0.8, thick: 0.12 * h, n: 6, cx });
      break;
    case 'long':
      hairCap(m, a, d, s, 0.68, 0.3);
      m.shell(HEAD, col, { y0: 0.06 * h, y1: 0.68 * h, r0: [1.1 * hd, 1.1 * hw], r1: [1.07 * hd, 1.06 * hw], a0: 0.95, a1: TAU - 0.95, thick: 0.1 * h, n: 6, cx });
      m.shell(HEAD, col, { y0: -0.62 * h, y1: 0.3 * h, r0: [1.18 * hd, 1.08 * hw], r1: [1.1 * hd, 1.05 * hw], a0: 2.05, a1: TAU - 2.05, thick: 0.13 * h, n: 4, cx: cx - 0.02 * h });
      break;
    case 'pony':
      hairCap(m, a, d, s, 0.74, 0.3);
      m.lathe(HEAD, col, [[0, 0.1 * h, 0.1 * h], [-0.3 * h, 0.12 * h, 0.11 * h], [-0.62 * h, 0.05 * h, 0.05 * h]], { n: 5, at: [cx - s * hd - 0.02 * h, 0.62 * h, 0], rot: [0, 0, -0.42] });
      break;
    case 'bun':
      hairCap(m, a, d, s, 0.74, 0.3);
      m.ball(HEAD, col, cx - 0.62 * hd, 0.95 * h, 0, 0.24 * h, 0.22 * h, 0.24 * h);
      break;
    case 'twin':
      hairCap(m, a, d, s, 0.66, 0.3);
      for (const z of [-1, 1]) {
        m.lathe(HEAD, col, [[0, 0.1 * h, 0.1 * h], [-0.42 * h, 0.05 * h, 0.05 * h]], { n: 5, top: 0.06 * h, at: [cx - 0.3 * hd, 0.62 * h, z * 1.04 * hw], rot: [-z * 0.35, 0, 0] });
      }
      break;
    case 'perm': {
      if (m.lite) { hairCap(m, a, d, 1.15, 0.7, 0.14); break; }
      hairCap(m, a, d, s, 0.72, 0.3);
      const lumps = [[0, 1.0, 0], [0.55, 0.84, 0.92], [-0.55, 0.84, 0.92], [1.6, 0.8, 0.95], [-1.6, 0.8, 0.95], [2.6, 0.78, 0.95], [-2.6, 0.78, 0.95], [Math.PI, 0.55, 0.95]];
      for (const [ang, y, r] of lumps) {
        const x = cx + r * s * hd * Math.cos(ang), z = r * s * hw * Math.sin(ang);
        m.box(HEAD, col, r ? x : cx - 0.05 * h, y * h + (r ? 0 : d.hairTop), r ? z : 0, 0.22 * h, 0.22 * h, 0.22 * h, [0.7, ang + 0.4, 0.6]);
      }
      break;
    }
    case 'thin':
      hairCap(m, a, d, s, 0.66, 0.28, col, 0.5);
      m.lathe(HEAD, a.skin, [[h + d.hairTop * 0.42, 0.44 * hd, 0.44 * hw, cx - 0.03 * h]], { n: 6, bottom: null, top: 'flat' });
      break;
    case 'bald':
      m.shell(HEAD, col, { y0: 0.3 * h, y1: 0.64 * h, r0: [1.04 * hd, 1.04 * hw], r1: [1.03 * hd, 1.03 * hw], a0: 1.0, a1: TAU - 1.0, thick: 0.06 * h, n: 6, cx });
      break;
    default: hairCap(m, a, d, s, 0.72, 0.26);
  }
  for (const e of a.extras) {
    if (e.kind !== 'headphones' || m.lite) continue;
    const top = h + d.hairTop * 1.05;
    m.box(HEAD, e.color, cx - 0.04 * h, top + 0.02 * h, 0, 0.1 * h, 0.06 * h, 2.0 * hw);
    for (const z of [-1, 1]) {
      m.box(HEAD, e.color, cx - 0.04 * h, 0.72 * h, z * (s * hw + 0.03 * h), 0.08 * h, 0.55 * h, 0.05 * h);
      m.box(HEAD, shade(e.color, -0.3), cx - 0.04 * h, 0.46 * h, z * (s * hw + 0.05 * h), 0.24 * h, 0.28 * h, 0.1 * h);
    }
  }
}

function hatPart({ a, d, m }) {
  if (!a.hat) return;
  const h = d.headH, hw = d.headHW, hd = d.headHD, cx = d.headCX, top = h + d.hairTop;
  const s = (HAIR_SCALE[a.hair.style] || 1.07) + 0.04, c = a.hat.color;
  const fx = cx + s * hd * APO;
  const crown = (y0, rTop, yTop, tip = null, tilt = 0.04 * h) => m.lathe(HAT, c, [
    [y0, s * hd, s * hw, cx, 0, tilt], [0.9 * h, 0.97 * s * hd, 0.97 * s * hw, cx - 0.01 * h, 0, tilt * 0.3], [yTop, rTop * s * hd, rTop * s * hw, cx - 0.03 * h]
  ], { bottom: null, top: tip === null ? 'flat' : tip });
  const brim = (y, r0, r1, dy, col = c, dx = 0) => m.lathe(HAT, col, [[y - dy, r1 * s * hd, r1 * s * hw, cx + dx], [y, r0 * s * hd, r0 * s * hw, cx + dx]]);
  switch (a.hat.kind) {
    case 'cap':
      crown(0.64 * h, 0.62, top + 0.02 * h, top + 0.08 * h);
      m.box(HAT, c, fx + 0.16 * h, 0.67 * h, 0, 0.4 * h, 0.04 * h, 1.3 * hw, [0, 0, -0.12]);
      break;
    case 'safety': case 'kinder':
      crown(0.62 * h, 0.64, top + 0.03 * h, top + 0.07 * h, 0.02 * h);
      brim(0.64 * h, 1.02, a.hat.kind === 'safety' ? 1.4 : 1.55, 0.09 * h, c, a.hat.kind === 'safety' ? 0.06 * h : 0);
      break;
    case 'bucket': case 'sun':
      crown(0.62 * h, 0.86, top + 0.08 * h, null, 0.02 * h);
      brim(0.66 * h, 1.02, a.hat.kind === 'sun' ? 1.95 : 1.62, 0.13 * h);
      if (a.hat.kind === 'sun') m.lathe(HAT, shade(c, -0.25), [[0.66 * h, 1.0 * s * hd, 1.0 * s * hw, cx], [0.74 * h, 0.99 * s * hd, 0.99 * s * hw, cx]], { bottom: null, top: null });
      break;
    case 'visor':
      m.lathe(HAT, c, [[0.64 * h, 1.0 * s * hd, 1.0 * s * hw, cx, 0, 0.05 * h], [0.76 * h, 0.99 * s * hd, 0.99 * s * hw, cx, 0, 0.05 * h]], { bottom: null, top: null });
      m.box(HAT, c, fx + 0.18 * h, 0.7 * h, 0, 0.42 * h, 0.035 * h, 1.4 * hw, [0, 0, -0.2]);
      break;
    case 'police': case 'peaked': {
      m.lathe(HAT, c, [[0.64 * h, s * hd, s * hw, cx], [0.86 * h, 1.04 * s * hd, 1.02 * s * hw, cx], [top + 0.14 * h, 1.22 * s * hd, 1.16 * s * hw, cx - 0.02 * h]], { bottom: null });
      const band = a.hat.kind === 'police' ? '#111215' : a.hat.trim;
      m.lathe(HAT, band, [[0.63 * h, 1.02 * s * hd, 1.02 * s * hw, cx], [0.77 * h, 1.04 * s * hd, 1.03 * s * hw, cx]], { bottom: null, top: null });
      m.box(HAT, '#121316', fx + 0.12 * h, 0.66 * h, 0, 0.32 * h, 0.035 * h, 1.25 * hw, [0, 0, -0.32]);
      m.box(HAT, a.hat.trim || '#d8b54a', cx + 1.1 * s * hd * APO, 0.88 * h, 0, 0.04 * h, 0.15 * h, 0.13 * h);
      break;
    }
    case 'flat':
      m.lathe(HAT, c, [[0.66 * h, s * hd, s * hw, cx], [0.86 * h, 1.03 * s * hd, 1.0 * s * hw, cx + 0.05 * h, 0, -0.04 * h], [top - 0.02 * h, 0.82 * s * hd, 0.8 * s * hw, cx + 0.05 * h]], { bottom: null });
      m.box(HAT, shade(c, -0.1), fx + 0.12 * h, 0.68 * h, 0, 0.24 * h, 0.04 * h, 1.2 * hw, [0, 0, -0.28]);
      break;
    case 'beanie':
      crown(0.58 * h, 0.6, top + 0.04 * h, top + 0.12 * h, 0.06 * h);
      m.lathe(HAT, shade(c, -0.12), [[0.56 * h, 1.03 * s * hd, 1.03 * s * hw, cx, 0, 0.06 * h], [0.7 * h, 1.03 * s * hd, 1.03 * s * hw, cx, 0, 0.06 * h]], { bottom: null, top: null });
      break;
    case 'chef':
      m.lathe(HAT, c, [[0.64 * h, s * hd, s * hw, cx], [0.82 * h, 1.02 * s * hd, 1.02 * s * hw, cx], [top + 0.55 * h, 1.28 * s * hd, 1.28 * s * hw, cx - 0.03 * h]], { bottom: null });
      break;
    case 'band':
      m.lathe(HAT, c, [[0.66 * h, 1.01 * s * hd, 1.01 * s * hw, cx, 0, 0.04 * h], [0.78 * h, 1.0 * s * hd, 1.0 * s * hw, cx, 0, 0.04 * h]], { bottom: null, top: null });
      break;
    default: break;
  }
}

// A half helmet, shown only when riding a scooter (the pose solver hides the hat then).
function helmetPart({ a, d, m }) {
  const h = d.headH, hw = d.headHW, hd = d.headHD, cx = d.headCX, top = h + d.hairTop;
  const s = Math.max(1.08, HAIR_SCALE[a.hair.style] || 1.07) + 0.1, c = a.helmet;
  m.lathe(HELMET, c, [[0.52 * h, s * hd, s * hw, cx, 0, 0.12 * h], [0.86 * h, 0.96 * s * hd, 0.96 * s * hw, cx - 0.01 * h, 0, 0.04 * h],
    [top + 0.06 * h, 0.64 * s * hd, 0.64 * s * hw, cx - 0.03 * h]], { bottom: null, top: top + 0.15 * h });
  m.box(HELMET, shade(c, -0.35), cx + s * hd * APO + 0.06 * h, 0.66 * h, 0, 0.2 * h, 0.035 * h, 1.15 * hw, [0, 0, -0.3]);
  m.lathe(HELMET, shade(c, -0.18), [[0.46 * h, 1.01 * s * hd, 1.01 * s * hw, cx, 0, 0.12 * h], [0.53 * h, 1.01 * s * hd, 1.01 * s * hw, cx, 0, 0.12 * h]], { bottom: null, top: null });
}

function armPart({ a, d, m }, side) {
  const up = side < 0 ? BONE.upperL : BONE.upperR, fo = side < 0 ? BONE.foreL : BONE.foreR;
  const k = d.k, r = d.armR, U = d.upper, F = d.fore, Hn = d.hand;
  const sleeve = sleeveColour(a), long = sleevesLong(a);
  if (long) {
    m.lathe(up, sleeve, [[0, 1.06 * r, 1.06 * r], [-U - 0.03 * k, 0.9 * r, 0.9 * r]], { n: 6, top: 0.1 * k });
    m.lathe(fo, sleeve, [[0.05 * k, 0.88 * r, 0.88 * r], [-F, 0.74 * r, 0.74 * r]], { n: 6, top: null });
    if (isLayer(a.outer) && a.top.sleeves === 'long' && a.outer.kind !== 'track') {
      m.lathe(fo, a.top.color, [[-F + 0.06 * k, 0.78 * r, 0.78 * r], [-F - 0.005, 0.76 * r, 0.76 * r]], { n: 6, bottom: null, top: null });
    }
  } else {
    m.lathe(up, sleeve, [[0, 1.14 * r, 1.14 * r], [-0.5 * U, 1.08 * r, 1.08 * r]], { n: 6, top: 0.11 * k });
    m.lathe(up, a.skin, [[-0.45 * U, 0.88 * r, 0.88 * r], [-U - 0.03 * k, 0.82 * r, 0.82 * r]], { n: 6, bottom: null, top: null });
    m.lathe(fo, a.skin, [[0.05 * k, 0.8 * r, 0.8 * r], [-F, 0.68 * r, 0.68 * r]], { n: 6, top: null });
  }
  m.box(fo, a.gloves || a.skin, 0, -F - Hn * 0.45, 0, 1.35 * r, Hn, 0.95 * r);
  const stripe = (a.outer && a.outer.kind === 'track' ? a.outer.trim : null) || (long && a.top.stripe && !a.outer ? a.top.stripe : null);
  if (stripe) {
    m.box(up, stripe, 0, -U / 2, side * 1.0 * r, 0.05 * k, U * 0.95, 0.04 * k);
    m.box(fo, stripe, 0, -F / 2, side * 0.83 * r, 0.05 * k, F * 0.9, 0.04 * k);
  }
  if (side < 0 && a.extras.some(e => e.kind === 'wristband')) {
    m.lathe(fo, '#f4f4f0', [[-0.86 * F, 0.76 * r, 0.76 * r], [-0.94 * F, 0.75 * r, 0.75 * r]], { n: 6, bottom: null, top: null });
  }
}

function legPart({ a, d, m }, side) {
  const th = side < 0 ? BONE.thighL : BONE.thighR, sh = side < 0 ? BONE.shinL : BONE.shinR, ft = side < 0 ? BONE.footL : BONE.footR;
  const k = d.k, R = d.thighR, T = d.thigh, S = d.shin, b = a.bottom;
  const trousers = b.kind === 'trousers';
  if (trousers) m.lathe(th, b.color, [[0.1 * k, 0.95 * R, 0.95 * R], [-0.1 * k, R, R], [-T - 0.03 * k, 0.8 * R, 0.8 * R]], { n: 6 });
  else if (b.kind === 'shorts') {
    m.lathe(th, b.color, [[0.1 * k, 1.0 * R, 1.0 * R], [-0.1 * k, 1.06 * R, 1.06 * R], [-0.55 * T, 1.02 * R, 1.02 * R]], { n: 6 });
    m.lathe(th, a.skin, [[-0.5 * T, 0.9 * R, 0.9 * R], [-T - 0.03 * k, 0.78 * R, 0.78 * R]], { n: 6, top: null });
  } else m.lathe(th, a.skin, [[0.1 * k, 0.92 * R, 0.92 * R], [-T - 0.03 * k, 0.76 * R, 0.76 * R]], { n: 6 });

  const shoe = a.shoes, boots = shoe.kind === 'boots';
  const shinColour = trousers ? b.color : a.skin;
  m.lathe(sh, shinColour, [[0.05 * k, 0.8 * R, 0.8 * R], [-0.45 * S, 0.75 * R, 0.75 * R], [-S - 0.02 * k, 0.6 * R, 0.6 * R]], { n: 6, top: null });
  if (boots) m.lathe(sh, shoe.color, [[-0.48 * S, 0.84 * R, 0.84 * R], [-S - 0.03 * k, 0.7 * R, 0.7 * R]], { n: 6, bottom: null });
  else if (a.socks && !trousers) m.lathe(sh, a.socks, [[-0.6 * S, 0.7 * R, 0.7 * R], [-S - 0.025 * k, 0.64 * R, 0.64 * R]], { n: 6, bottom: null, top: null });
  if (b.stripe && trousers) {
    m.box(th, b.stripe, 0, -T / 2, side * 0.93 * R, 0.05 * k, T * 0.9, 0.04 * k);
    m.box(sh, b.stripe, 0, -S / 2, side * 0.72 * R, 0.05 * k, S * 0.9, 0.04 * k);
  }

  // Feet: origin at the ankle, toes along +x.
  const fl = d.footLen, fh = d.footH, fw = d.footW, x0 = -0.26 * fl, x1 = 0.74 * fl;
  if (m.lite) { m.box(ft, shoe.color, (x0 + x1) / 2, -fh / 2, 0, x1 - x0, fh, fw); return; }
  if (shoe.kind === 'slippers') {
    const sole = 0.06 * k;
    m.box(ft, shoe.sole, (x0 + x1) / 2, -fh + sole / 2, 0, x1 - x0, sole, fw * 1.05);
    m.box(ft, a.skin, 0.05 * fl, -fh + sole + (fh - sole + 0.03 * k) / 2, 0, 0.62 * fl, fh - sole + 0.03 * k, fw * 0.85);
    m.box(ft, a.skin, 0.52 * fl, -fh + sole + 0.04 * k, 0, 0.4 * fl, 0.08 * k, fw * 0.85);
    m.box(ft, shoe.color, 0.42 * fl, -fh + sole + 0.06 * k, 0, 0.24 * fl, 0.11 * k, fw * 1.04);
  } else {
    const sole = shoe.kind === 'sneakers' ? 0.06 * k : 0.04 * k;
    m.box(ft, shoe.sole, (x0 + x1) / 2, -fh + sole / 2, 0, x1 - x0 + 0.02, sole, fw + 0.02);
    const top = boots ? 0.06 * k : 0.04 * k;
    m.box(ft, shoe.color, (x0 + 0.36 * fl) / 2, (-fh + sole + top) / 2, 0, 0.36 * fl - x0, fh - sole + top, fw);
    m.box(ft, shoe.color, (0.32 * fl + x1) / 2, -fh + sole + (fh - sole) * 0.32, 0, x1 - 0.32 * fl, (fh - sole) * 0.64, fw * 0.96);
  }
}

// Skirts, coat tails, gowns and the lower apron hang from the hips on their own bone.
function hemPart({ a, d, m }) {
  const k = d.k, hd = d.torsoHD, hw = d.torsoHW, top = d.waist + 0.03 * k;
  if (a.bottom.kind === 'skirt' && !(a.outer && a.outer.long)) {
    const len = (d.t < 0.75 ? 0.62 : 0.8) * d.thigh;
    m.lathe(HEM, a.bottom.color, [[top, 0.99 * hd, 0.93 * hw], [-len, 1.3 * hd, 1.2 * hw]], { bottom: null, top: null });
  }
  if (a.outer && a.outer.long) {
    const len = d.thigh + 0.12 * d.shin;
    if (a.outer.kind === 'gown') {
      m.lathe(HEM, a.outer.color, [[top, 1.0 * hd, 0.94 * hw], [-len, 1.3 * hd, 1.2 * hw]], { bottom: null, top: null });
    } else {
      m.shell(HEM, a.outer.color, { y0: -len, y1: top, r0: [1.3 * hd, 1.2 * hw], r1: [1.0 * hd, 0.95 * hw], a0: 0.42, a1: TAU - 0.42, thick: 0.05 * k, n: 7 });
    }
  }
  if (a.apron) {
    const len = a.apron.long ? d.thigh + 0.62 * d.shin : 0.72 * d.thigh;
    const x = 0.97 * hd * APO + 0.03 * k;
    m.box(HEM, a.apron.color, x, (top - len) / 2, 0, 0.04 * k, top + len, 1.55 * hw);
  }
}

function bagPart({ a, d, m, torso }) {
  if (!a.bag) return;
  const k = d.k, L = d.torsoLen, hd = d.torsoHD, hw = d.torsoHW, b = a.bag;
  const strapCol = shade(b.color, -0.25);
  const straps = (y0 = 0.42 * L) => { for (const z of [-1, 1]) frontStrip(m, TORSO, strapCol, torso, y0, L, 0.07 * k, { z: z * 0.32 * hw, out: 0.02 }); };
  const back = x => -(hd * 0.98 * APO + x / 2 - 0.02);
  switch (b.kind) {
    case 'backpack': {
      const bd = 0.3 * k;
      m.box(TORSO, b.color, back(bd), 0.57 * L, 0, bd, 0.66 * L, 1.45 * hw);
      m.box(TORSO, shade(b.color, -0.12), back(bd) - bd / 2 - 0.02 * k, 0.4 * L, 0, 0.07 * k, 0.26 * L, 1.0 * hw);
      straps();
      break;
    }
    case 'randoseru': {
      const bd = 0.42 * k, x = back(bd);
      m.box(TORSO, b.color, x, 0.56 * L, 0, bd, 0.8 * L, 1.62 * hw);
      m.box(TORSO, shade(b.color, -0.12), x - bd / 2 - 0.015 * k, 0.66 * L, 0, 0.05 * k, 0.62 * L, 1.66 * hw);
      m.box(TORSO, b.trim || '#e8e2d4', x - bd / 2 - 0.035 * k, 0.4 * L, 0, 0.03 * k, 0.07 * k, 0.16 * k);
      m.box(TORSO, shade(b.color, -0.12), x, 0.97 * L, 0, bd + 0.04 * k, 0.05 * k, 1.66 * hw);
      straps(0.4 * L);
      break;
    }
    case 'kidpack': {
      const bd = 0.28 * k, x = back(bd);
      m.box(TORSO, b.color, x, 0.56 * L, 0, bd, 0.52 * L, 1.25 * hw);
      for (const z of [-1, 1]) m.box(TORSO, b.color, x, 0.56 * L + 0.26 * L + 0.05 * k, z * 0.45 * hw, 0.1 * k, 0.14 * k, 0.14 * k, [0, 0, 0]);
      m.box(TORSO, b.trim || '#f7f6f2', x - bd / 2 - 0.01, 0.52 * L, 0, 0.03 * k, 0.16 * L, 0.5 * hw);
      straps(0.46 * L);
      break;
    }
    case 'tote': {
      const z = hw + 0.06 * k;
      m.box(TORSO, b.color, -0.2 * k, -0.22 * L, z, 0.5 * k, 0.55 * L, 0.1 * k);
      m.box(TORSO, shade(b.color, -0.2), -0.12 * k, 0.4 * L, hw * 0.92, 0.05 * k, 1.15 * L, 0.04 * k, [0.12, 0, 0]);
      break;
    }
    case 'satchel': {
      const ang = Math.atan2(-1.8 * hw, L);
      m.box(TORSO, strapCol, frontAt(torso, 0.5 * L) + 0.015, 0.5 * L, 0.0, 0.03 * k, Math.hypot(L, 1.8 * hw), 0.07 * k, [ang, 0, 0]);
      m.box(TORSO, strapCol, -hd * 0.92, 0.5 * L, 0.0, 0.03 * k, Math.hypot(L, 1.8 * hw), 0.07 * k, [ang, 0, 0]);
      m.box(TORSO, b.color, -0.05 * k, -0.15 * L, hw + 0.07 * k, 0.5 * k, 0.4 * L, 0.12 * k);
      break;
    }
    default: break;
  }
}

function extrasPart(c) {
  const { a, d, m } = c;
  const k = d.k, L = d.torsoLen, hw = d.torsoHW, front = c.outerFront;
  for (const e of a.extras) {
    switch (e.kind) {
      case 'lanyard':
        frontStrip(m, TORSO, e.color, front, 0.5 * L, L, 0.045 * k, { out: 0.032 });
        m.box(TORSO, '#f7f7f4', frontAt(front, 0.42 * L) + 0.03, 0.42 * L, 0, 0.03, 0.17 * k, 0.13 * k);
        m.box(TORSO, e.color, frontAt(front, 0.47 * L) + 0.034, 0.47 * L, 0, 0.03, 0.05 * k, 0.13 * k);
        break;
      case 'badge':
        m.box(TORSO, e.color, frontAt(front, 0.68 * L) + 0.012, 0.68 * L, -0.28 * hw, 0.03, 0.1 * k, 0.08 * k);
        break;
      case 'stethoscope':
        for (const z of [-1, 1]) frontStrip(m, TORSO, e.color, front, 0.56 * L, 0.98 * L, 0.035 * k, { z: z * 0.2 * hw, out: 0.03 });
        m.box(TORSO, SILVER, frontAt(front, 0.53 * L) + 0.04, 0.53 * L, 0.2 * hw, 0.04, 0.08 * k, 0.08 * k);
        break;
      case 'whistle':
        frontStrip(m, TORSO, e.color, front, 0.6 * L, L, 0.03 * k, { z: 0.08 * hw, out: 0.025 });
        m.box(TORSO, SILVER, frontAt(front, 0.58 * L) + 0.04, 0.58 * L, 0.08 * hw, 0.05, 0.07 * k, 0.1 * k);
        break;
      case 'towel':
        m.lathe(TORSO, e.color, [[L - 0.05 * k, d.neckR * 2.1, d.neckR * 2.5], [L + 0.07 * k, d.neckR * 1.75, d.neckR * 2.0]], { n: 8, bottom: null, top: null });
        for (const z of [-1, 1]) frontStrip(m, TORSO, e.color, front, 0.6 * L, L, 0.13 * k, { z: z * 0.2 * hw, out: 0.025 });
        break;
      case 'scarf':
        m.box(TORSO, e.color, frontAt(front, L - 0.04 * k) + 0.04, L - 0.04 * k, 0, 0.06 * k, 0.1 * k, 0.24 * k);
        m.box(TORSO, shade(e.color, -0.15), frontAt(front, L - 0.14 * k) + 0.03, L - 0.14 * k, 0.03 * k, 0.04 * k, 0.16 * k, 0.07 * k, [0.3, 0, 0]);
        break;
      case 'pin':
        m.box(TORSO, e.color, frontAt(front, 0.8 * L) + 0.02, 0.8 * L, -0.3 * hw, 0.04, 0.1 * k, 0.1 * k, [0.785, 0, 0]);
        break;
      case 'flagpin':
        m.box(TORSO, e.color, frontAt(front, 0.8 * L) + 0.015, 0.8 * L, -0.3 * hw, 0.03, 0.065 * k, 0.095 * k);
        m.box(TORSO, '#1f3a8a', frontAt(front, 0.8 * L) + 0.025, 0.8 * L + 0.016 * k, -0.3 * hw - 0.024 * k, 0.02, 0.035 * k, 0.048 * k);
        break;
      case 'epaulettes':
        for (const z of [-1, 1]) m.box(TORSO, shade(e.color, -0.15), 0, 0.93 * L, z * 0.74 * hw, 0.3 * k, 0.05 * k, 0.24 * k, [z * 0.35, 0, 0]);
        break;
      case 'radio':
        m.box(TORSO, e.color, frontAt(front, 0.84 * L) + 0.04, 0.84 * L, -0.33 * hw, 0.08 * k, 0.17 * k, 0.09 * k);
        break;
      default: break;
    }
  }
}

function propPart({ a, d, m }) {
  if (!a.prop) return;
  const k = d.k, c = a.prop.color;
  switch (a.prop.kind) {
    case 'cane': {
      const len = d.hipY;
      m.lathe(PROP, c, [[-len, 0.03 * k, 0.03 * k], [0, 0.035 * k, 0.035 * k]], { n: 5 });
      m.box(PROP, c, 0.1 * k, 0.03 * k, 0, 0.26 * k, 0.06 * k, 0.06 * k);
      m.box(PROP, '#202020', 0, -len + 0.04 * k, 0, 0.08 * k, 0.08 * k, 0.08 * k);
      break;
    }
    case 'iv': {
      const H = d.H * 1.02;
      m.lathe(PROP, c, [[0.08 * k, 0.035 * k, 0.035 * k], [H, 0.03 * k, 0.03 * k]], { n: 5 });
      for (const r of [0.785, -0.785]) m.box(PROP, '#8c949b', 0, 0.06 * k, 0, 0.75 * k, 0.07 * k, 0.08 * k, [0, r, 0]);
      m.box(PROP, c, 0, H, 0, 0.04 * k, 0.04 * k, 0.4 * k);
      m.box(PROP, '#e6f0f4', 0, H - 0.3 * k, 0.17 * k, 0.07 * k, 0.32 * k, 0.18 * k);
      break;
    }
    case 'briefcase':
      m.box(PROP, c, 0, -0.33 * k, 0, 0.62 * k, 0.46 * k, 0.15 * k);
      m.box(PROP, shade(c, -0.3), 0, -0.07 * k, 0, 0.22 * k, 0.07 * k, 0.05 * k);
      break;
    case 'nylon': {
      // 茄芷袋: the red-white-blue striped market bag.
      const cols = ['#c6372f', '#f4f1ea', '#2f5fa8'];
      for (let i = 0; i < 3; i++) m.box(PROP, cols[i], 0, -0.3 * k - i * 0.16 * k, 0, 0.6 * k, 0.165 * k, 0.28 * k);
      for (const x of [-1, 1]) m.box(PROP, '#c6372f', x * 0.14 * k, -0.11 * k, 0, 0.04 * k, 0.24 * k, 0.04 * k, [0, 0, x * 0.5]);
      break;
    }
    default: break;
  }
}
