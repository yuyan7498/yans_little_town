// Housing estates (kind 'housing', by `type`) and the clinics on their ground floors.
//   courtyard  low-rise wings round a garden court, entered through a gate arch
//   slab       two parallel slab blocks with a garden between
//   terrace    stepped blocks with planted roof terraces
//   point      two point towers over a shared forecourt and lobby pavilion
// Taiwanese apartment character: balconies (some caged), 鐵窗 window grilles, air
// conditioners, rooftop water tanks, planters, a lobby at the door. Annex footprints
// (the clinics) are kept free; each clinic is drawn here as a small storefront.

import { unit } from '../../core/random.js';
import { Builder, GROUND } from './a-kit.js';
import { FACES, FLOOR, acUnit, balcony, bush, clearOfAnnexes, entrance, fbox, grille, normalOf, parapet, planeOf, planter, railing, roofKit, spanOf, tree, win, WARM } from './a-parts.js';

const GLASS = ['#9fc0cc', '#a9c9d3', '#93b6c4'];
const LUXURY = new Set(['villa', 'luxury']);
const THEMES = {
  courtyard: { wall: '#e3b595', trim: '#f6ecd9', accent: '#a8553e', plinth: '#8e6a55', name: '#8a4a36' },
  slab: { wall: '#efe8d8', trim: '#fffaf0', accent: '#3f8f88', plinth: '#9a9486', name: '#2f7a74' },
  terrace: { wall: '#ded4c1', trim: '#f7f1e5', accent: '#a7774f', plinth: '#8f8574', name: '#7a5a3a' },
  point: { wall: '#f0e1d9', trim: '#fffaf3', accent: '#6f94ad', plinth: '#9a9088', name: '#4f7590' }
};

export function create({ world, quality = 'full' }) {
  const b = new Builder({ world, quality });
  for (const site of world.siteList) {
    // The luxury types (villa, luxury) are drawn by luxury.js.
    if (site.kind === 'housing' && !LUXURY.has(site.type)) {
      const p = b.site(site);
      (LAYOUTS[site.type] || LAYOUTS.slab)(p, site, THEMES[site.type] || THEMES.slab);
      forecourt(p, site);
    } else if (site.kind === 'clinic') clinic(b.site(site), site);
  }
  return b.finish('housing');
}
export const preview = ctx => create(ctx);

const doorZ = p => p.f.point(p.site.door).z;

// ------------------------------------------------------------------ a block of flats
// o: floors, y0, wall, balcony: faces with balconies, faces: {f: {from, to}|false ...},
// roof: 'plant'|'terrace'|'none'. Draws walls, windows, balconies, grilles, ACs, belts.
function block(p, site, r, t, o) {
  const y0 = o.y0 ?? GROUND, top = y0 + o.floors * FLOOR, wall = o.wall || t.wall;
  p.span(r.x0, r.x1, y0, top, r.z0, r.z1, wall);
  for (const face of FACES) {
    const fo = o.faces && o.faces[face] !== undefined ? o.faces[face] : {};
    if (fo === false) continue;
    flats(p, site, r, face, t, { ...o, ...fo, y0, top, balcony: (o.balcony || []).includes(face) });
  }
  // plinth and corner strips
  if (o.plinth !== false) p.span(r.x0 - 0.1, r.x1 + 0.1, y0, y0 + 0.9, r.z0 - 0.1, r.z1 + 0.1, t.plinth);
  if (o.corners !== false) for (const sx of [r.x0, r.x1]) for (const sz of [r.z0, r.z1]) p.box(sx, y0 + 0.9, sz, 0.9, top - y0 - 0.84, 0.9, t.trim);
  const R = { x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, x: r.x, z: r.z, w: r.x1 - r.x0, d: r.z1 - r.z0, x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 };
  if (o.roof === 'terrace') terraceTop(p, site, R, top, t);
  else if (o.roof !== 'none') plantTop(p, site, R, top, t, o);
  return R;
}

function flats(p, site, r, face, t, o) {
  const plane = planeOf(r, face), [s0, s1] = spanOf(r, face), pitch = o.pitch ?? 3.4;
  const a0 = (o.from ?? s0) + 1.6, a1 = (o.to ?? s1) - 1.6;
  if (a1 - a0 < pitch * 0.9) return;
  const n = Math.max(1, Math.floor((a1 - a0) / pitch)), step = (a1 - a0) / n, y0 = o.y0, floors = Math.round((o.top - y0) / FLOOR);
  const mid = (Math.max(s0, o.from ?? s0) + Math.min(s1, o.to ?? s1)) / 2, len = Math.min(s1, o.to ?? s1) - Math.max(s0, o.from ?? s0);
  for (let f = 0; f < floors; f++) {
    const y = y0 + f * FLOOR;
    if (f > 0) fbox(p, face, plane, mid, y - 0.12, len + 0.1, 0.24, 0.16, t.trim, 'body', undefined, -0.02);
    for (let i = 0; i < n; i++) {
      const a = a0 + step * (i + 0.5), key = site.id + face + f + ':' + i, k = unit(key);
      if (o.skip && o.skip(a, f)) continue;
      const light = WARM[Math.floor(unit(key + 'L') * WARM.length)], glass = GLASS[Math.floor(unit(key + 'G') * GLASS.length)];
      const withBalcony = o.balcony && f > 0 && i % 2 === 0;
      if (withBalcony) {
        const bw = step - 0.5, style = k < 0.25 ? 'cage' : k < 0.5 ? 'bars' : 'solid';
        win(p, face, plane, a, y + 2.0, bw - 0.5, 2.7, { glass, light, panes: 2, out: 0.06 });
        balcony(p, face, plane, a, y + 0.1, bw, { depth: 1.9, color: t.trim, rail: t.wall, style, ac: unit(key + 'ac') < 0.5, plant: unit(key + 'pl') < 0.3 ? '#6f9a52' : null });
      } else {
        const w = Math.min(2.6, step - 0.9), h = f === 0 ? 1.9 : 2.0, yc = y + (f === 0 ? 2.3 : 2.1) + h / 2 - 0.2;
        win(p, face, plane, a, yc, w, h, { glass, light, panes: 2, out: 0.06 });
        fbox(p, face, plane, a, yc - h / 2 - 0.26, w + 0.6, 0.26, 0.45, t.trim);
        if (f === 0 || k < 0.22) grille(p, face, plane, a, yc, w, h);
        else if (!p.lite && k > 0.62) acUnit(p, face, plane, a + w * 0.3, yc - h / 2 - 0.9, { w: 1.4, h: 1.0 });
      }
    }
  }
}

// Roof plant: parapet, stair house, tanks, condensers, sometimes a sheet-metal 頂加.
function plantTop(p, site, R, y, t, o) {
  parapet(p, R, y, 1.0, 0.4, t.trim, { top: '#a39d90' });
  const inner = { x0: R.x0 + 0.8, x1: R.x1 - 0.8, z0: R.z0 + 0.8, z1: R.z1 - 0.8, w: R.w - 1.6, d: R.d - 1.6, x: R.x, z: R.z };
  if (inner.w < 6 || inner.d < 6) return;
  roofKit(p, inner, y, { tanks: o.tanks ?? (R.w * R.d > 300 ? 2 : 1), acs: 2, solar: o.solar ?? 0, salt: o.salt || '', wall: t.trim });
  if (o.shed && inner.w > 10 && inner.d > 10) {
    const sx = R.x0 + R.w * 0.62, sz = R.z + R.d * 0.12;
    p.box(sx, y, sz, 6, 2.6, 5, '#e8e4da');
    p.wedge(sx, y + 2.6, sz, 6.6, 1.6, 5.6, '#6f93ab', Math.PI / 2);
  }
}

// A planted roof terrace on a lower roof: deck, railing, planters, small trees, a pergola.
function terraceTop(p, site, R, y, t) {
  p.span(R.x0 + 0.3, R.x1 - 0.3, y, y + 0.14, R.z0 + 0.3, R.z1 - 0.3, '#d6cdbb');
  railing(p, { x0: R.x0 + 0.5, x1: R.x1 - 0.5, z0: R.z0 + 0.5, z1: R.z1 - 0.5 }, y + 0.14, 1.1, '#6b7a70', 3.3);
  for (const s of [-1, 1]) if (R.d > 10) planter(p, R.x + s * Math.max(1, R.w / 2 - 2.2), R.z, 1.3, Math.min(10, R.d - 5), y + 0.14);
  for (let k = 0; k < 3; k++) {
    const tx = R.x0 + 3 + unit(site.id + y + 'tx' + k) * (R.w - 6), tz = R.z0 + 3 + unit(site.id + y + 'tz' + k) * (R.d - 6);
    tree(p, tx, tz, 4.6, undefined, y + 0.14);
  }
  if (R.w > 8 && R.d > 12) {
    // a pergola with benches
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(R.x + sx * 2.2, y + 0.14, R.z + sz * 3, 0.25, 2.8, 0.25, '#a7774f');
    for (let i = -2; i <= 2; i++) p.box(R.x, y + 2.9, R.z + i * 1.4, 5.2, 0.16, 0.3, '#b98a5c');
    p.box(R.x, y + 0.14, R.z, 3.2, 0.5, 1.0, '#a7774f');
  }
}

// ------------------------------------------------------------------ garden pieces
function lawn(p, r, y = 0.2) { p.pad(r.x0, r.x1, r.z0, r.z1, '#7aa35b', y); }
function path(p, x0, x1, z0, z1, y = 0.24) { p.pad(x0, x1, z0, z1, '#ddd5c4', y); }
function lampPost(p, x, z, y0 = GROUND) {
  p.cyl(x, y0, z, 0.14, 3.6, '#4a4f55', 6);
  p.glowBox(x, y0 + 3.6, z, 0.7, 0.45, 0.7, '#f4efe0', '#ffe2b0', 'lamps', 1.4);
}
function bench(p, x, z, along = 'z') {
  const [sx, sz] = along === 'z' ? [0.7, 2.2] : [2.2, 0.7];
  p.box(x, GROUND + 0.5, z, sx, 0.2, sz, '#a7774f');
  p.box(x, GROUND, z, sx * 0.8, 0.5, sz * 0.9, '#6b6f73');
}
// A round fountain: stone rim, water, a small spout.
function fountain(p, x, z, r = 3.2) {
  p.cyl(x, GROUND, z, r, 0.7, '#d9d4ca', 14);
  p.cyl(x, GROUND + 0.55, z, r - 0.5, 0.2, '#7fc0cf', 14);
  p.cyl(x, GROUND + 0.6, z, 0.4, 1.8, '#d9d4ca', 8);
  p.blob(x, GROUND + 2.5, z, 0.6, '#bfe3ea', 0.8);
}
// Scatter small trees on a rect, keeping out of the given keep-clear rects.
function trees(p, site, r, count, avoid = [], salt = '') {
  for (let k = 0, placed = 0; k < count * 6 && placed < count; k++) {
    const x = r.x0 + 1.8 + unit(site.id + salt + 'x' + k) * Math.max(0.1, r.x1 - r.x0 - 3.6), z = r.z0 + 1.8 + unit(site.id + salt + 'z' + k) * Math.max(0.1, r.z1 - r.z0 - 3.6);
    if (avoid.some(a => x > a.x0 - 1.8 && x < a.x1 + 1.8 && z > a.z0 - 1.8 && z < a.z1 + 1.8)) continue;
    tree(p, x, z, 6 + unit(site.id + salt + 'h' + k) * 3);
    placed++;
  }
}

// The margin of the lot round the buildings: lawn, a low hedge on the street edges
// (open at the door) and a few trees.
function forecourt(p, site) {
  const A = p.f.area, F = p.f.foot, dz = doorZ(p);
  const strips = [[A.x0, F.x0, A.z0, A.z1], [F.x1, A.x1, A.z0, A.z1], [F.x0, F.x1, A.z0, F.z0], [F.x0, F.x1, F.z1, A.z1]];
  for (const [x0, x1, z0, z1] of strips) if (x1 - x0 > 0.3 && z1 - z0 > 0.3) lawn(p, { x0, x1, z0, z1 });
  path(p, F.x1 - 0.5, A.x1, dz - 2.2, dz + 2.2, 0.26);
  const h = 1.0, t = 1.1;
  const hedge = (x0, z0, x1, z1) => { const len = Math.hypot(x1 - x0, z1 - z0); if (len > 1) { const e = 0.05, ux = (x1 - x0) / len, uz = (z1 - z0) / len; p.beam(x0 - ux * e, z0 - uz * e, x1 + ux * e, z1 + uz * e, GROUND + h / 2, t + 2 * e, h, '#5f8a47'); } };
  hedge(A.x1 - t / 2, A.z0, A.x1 - t / 2, dz - 5); hedge(A.x1 - t / 2, dz + 5, A.x1 - t / 2, A.z1);
  hedge(A.x0 + t / 2, A.z0, A.x0 + t / 2, A.z1);
  hedge(A.x0, A.z0 + t / 2, A.x1, A.z0 + t / 2); hedge(A.x0, A.z1 - t / 2, A.x1, A.z1 - t / 2);
  void site;
}

// A name plate above an entrance.
function namePlate(p, site, t, x, y, z, face = 'f', maxW = 13) {
  const key = 'name:' + site.id;
  const item = p.b.atlas.text(key, site.name, { color: '#ffffff', background: t.name, size: 60, pad: 0.4, radius: 0.3 });
  const w = Math.min(maxW, 1.55 * item.aspect);
  p.sign(key, face, x, y, z, w, { h: w / item.aspect });
}

// ------------------------------------------------------------------ the four layouts
const LAYOUTS = { courtyard, slab, terrace, point };

function courtyard(p, site, t) {
  const F = p.f.foot, dz = doorZ(p), W = F.z1 - F.z0, T = Math.min(11, W * 0.22), P = 9;
  const fl = site.floors, gate = 4.6;
  const wing = (r, extra) => block(p, site, r, t, { floors: fl, salt: r.x0 + ':' + r.z0, ...extra });
  const rect = (x0, x1, z0, z1) => ({ x0, x1, z0, z1, x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 });
  // back wing (balconies onto the court and outwards), then the two side wings
  wing(rect(F.x0, F.x0 + T, F.z0, F.z1), { balcony: ['f', 'b'], faces: { f: { from: F.z0 + T, to: F.z1 - T } } });
  wing(rect(F.x0 + T, F.x1, F.z0, F.z0 + T), { balcony: ['n', 'p'], faces: { b: false }, tanks: 1 });
  wing(rect(F.x0 + T, F.x1, F.z1 - T, F.z1), { balcony: ['n', 'p'], faces: { b: false }, tanks: 1 });
  // low front wing with a gate arch at the door
  const inner0 = F.z0 + T, inner1 = F.z1 - T, fx0 = F.x1 - P;
  const low = 4;
  block(p, site, rect(fx0, F.x1, inner0, dz - gate), t, { floors: low, roof: 'terrace', balcony: ['b'], faces: { n: false, p: {} } });
  block(p, site, rect(fx0, F.x1, dz + gate, inner1), t, { floors: low, roof: 'terrace', balcony: ['b'], faces: { p: false, n: {} } });
  // the gatehouse over the arch
  const gy = GROUND + 5.4;
  p.span(fx0, F.x1, gy, GROUND + low * FLOOR, dz - gate, dz + gate, t.wall);
  p.span(fx0 - 0.2, F.x1 + 0.2, GROUND + low * FLOOR, GROUND + low * FLOOR + 0.5, dz - gate - 0.2, dz + gate + 0.2, t.trim);
  p.span(fx0, F.x1, gy - 0.4, gy, dz - gate, dz + gate, t.accent);
  for (const f of [1, 2]) win(p, 'b', fx0, dz, GROUND + f * FLOOR + 3.1, 5.4, 2.2, { glass: GLASS[f], light: WARM[f], panes: 3 });
  namePlate(p, site, t, F.x1 + 0.1, GROUND + 9.6, dz, 'f', 2 * gate);
  p.box(F.x1 - 0.2, GROUND, dz - gate - 0.4, 0.6, 5.4, 0.9, t.trim); p.box(F.x1 - 0.2, GROUND, dz + gate + 0.4, 0.6, 5.4, 0.9, t.trim);
  for (const s of [-1, 1]) p.glowBox(F.x1 + 0.3, GROUND + 4.0, dz + s * (gate - 0.2), 0.5, 0.9, 0.5, '#f4efe0', '#ffd79c', 'entry', 1.5);
  p.light(F.x1 + 3, 4, dz, 12, '#ffe2b8', 0.8, 'facade', 'entrance');
  // the court: lawn, cross paths, a fountain, trees, benches, lamps
  const C = rect(F.x0 + T, fx0, inner0, inner1);
  lawn(p, C, 0.21);
  path(p, C.x0, C.x1 + P, dz - 1.9, dz + 1.9, 0.25);
  path(p, C.x - 1.9, C.x + 1.9, C.z0, C.z1, 0.25);
  p.cyl(C.x, 0.2, C.z, 6.2, 0.1, '#ddd5c4', 18);
  fountain(p, C.x, C.z, 3.6);
  trees(p, site, C, 7, [{ x0: C.x - 6, x1: C.x + 6, z0: C.z - 6, z1: C.z + 6 }, { x0: C.x0, x1: C.x1 + P, z0: dz - 2.2, z1: dz + 2.2 }, { x0: C.x - 2.2, x1: C.x + 2.2, z0: C.z0, z1: C.z1 }]);
  for (const s of [-1, 1]) { bench(p, C.x + s * 8, C.z + 4, 'z'); lampPost(p, C.x + s * 6.5, C.z - 6.5); }
  // lobbies on the court faces
  entrance(p, 'f', F.x0 + T, C.z - 8, { w: 6, y: 4.6, doorW: 3.4, doorH: 3.6, depth: 3.0 });
  entrance(p, 'p', F.z0 + T, C.x + 2, { w: 6, y: 4.6, doorW: 3.4, doorH: 3.6, depth: 3.0 });
  entrance(p, 'n', F.z1 - T, C.x + 2, { w: 6, y: 4.6, doorW: 3.4, doorH: 3.6, depth: 3.0 });
  for (const s of [-1, 1]) planter(p, F.x0 + T + 1.0, C.z + s * 13, 1.3, 5, GROUND + 0.05);
}

function slab(p, site, t) {
  const F = p.f.foot, dz = doorZ(p), W = F.z1 - F.z0, fl = site.floors;
  const B = Math.min(13, W * 0.3), gap = W - 2 * B;
  const rect = (x0, x1, z0, z1) => ({ x0, x1, z0, z1, x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 });
  const slabA = clearOfAnnexes(p, rect(F.x0, F.x1, F.z0, F.z0 + B)), slabB = clearOfAnnexes(p, rect(F.x0, F.x1, F.z1 - B, F.z1));
  // slabs: balconies on the garden faces, plain ends
  for (const [r, garden] of [[slabA, 'p'], [slabB, 'n']]) {
    const outer = garden === 'p' ? 'n' : 'p';
    block(p, site, r, t, { floors: fl, balcony: [garden, outer], salt: r.z + '', shed: r === slabA, solar: 3 });
    // stairwell: an accent strip up the garden face
    fbox(p, garden, planeOf(r, garden), r.x0 + 4, GROUND + 0.9, 1.4, fl * FLOOR - 0.9, 0.3, t.accent, 'body', undefined, 0.02);
    fbox(p, garden, planeOf(r, garden), r.x1 - 4, GROUND + 0.9, 1.4, fl * FLOOR - 0.9, 0.3, t.accent, 'body', undefined, 0.02);
  }
  // the low link block closing the garden at the back
  const link = rect(F.x0, F.x0 + 9, F.z0 + B, F.z1 - B);
  block(p, site, link, t, { floors: 3, roof: 'terrace', balcony: ['f'], faces: { p: false, n: false, b: {} }, corners: false });
  // garden between the slabs
  const G = rect(F.x0 + 9, F.x1, F.z0 + B, F.z1 - B);
  lawn(p, G, 0.21);
  path(p, G.x0, G.x1 + 3, dz - 2.0, dz + 2.0, 0.25);
  for (let k = 0; k < 3; k++) path(p, G.x0 + 8 + k * 14, G.x0 + 10 + k * 14, G.z0, G.z1, 0.25);
  trees(p, site, G, 6, [{ x0: G.x0, x1: G.x1 + 4, z0: dz - 2.2, z1: dz + 2.2 }]);
  if (gap > 8) for (let k = 0; k < 2; k++) { bench(p, G.x0 + 14 + k * 14, dz - 3.4, 'z'); lampPost(p, G.x0 + 12 + k * 14, dz + 3.2); }
  // lobbies on the garden faces
  for (const [r, garden] of [[slabA, 'p'], [slabB, 'n']]) entrance(p, garden, planeOf(r, garden), r.x0 + r.w * 0.55, { w: 7, y: 4.6, doorW: 3.8, doorH: 3.7, depth: 3.2 });
  // estate gate: two posts, a beam, name plate, lanterns
  const gx = F.x1 - 1.5;
  for (const s of [-1, 1]) p.box(gx, GROUND, dz + s * 3.6, 0.9, 4.4, 0.9, t.trim);
  p.box(gx, GROUND + 4.4, dz, 1.4, 0.7, 8.8, t.accent);
  namePlate(p, site, t, gx + 0.75, GROUND + 4.75, dz, 'f', 7.6);
  for (const s of [-1, 1]) p.glowBox(gx, GROUND + 4.5, dz + s * 3.6, 0.5, 0.7, 0.5, '#f4efe0', '#ffd79c', 'entry', 1.5);
  p.light(gx + 3, 4, dz, 12, '#ffe2b8', 0.8, 'facade', 'entrance');
}

function terrace(p, site, t) {
  const F = p.f.foot, dz = doorZ(p), D = F.x1 - F.x0, W = F.z1 - F.z0;
  const rect = (x0, x1, z0, z1) => ({ x0, x1, z0, z1, x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 });
  const dA = D * 0.28, dB = D * 0.28;
  const A = clearOfAnnexes(p, rect(F.x1 - dA, F.x1, F.z0, F.z1)), Bk = rect(F.x1 - dA - dB, F.x1 - dA, F.z0 + 2.5, F.z1 - 2.5), C = rect(F.x0, F.x1 - dA - dB, F.z0 + 5, F.z1 - 5);
  const fl = site.floors;
  const flA = Math.max(3, fl - 5), flB = Math.max(4, fl - 3), inA = a => a > A.z0 - 1 && a < A.z1 + 1;
  block(p, site, C, t, { floors: fl, balcony: ['n', 'p', 'b', 'f'], faces: { f: { skip: (a, f) => f < flB } }, salt: 'c', shed: true, solar: 3 });
  block(p, site, Bk, t, { floors: flB, balcony: ['f', 'n', 'p'], faces: { b: false, f: { skip: (a, f) => f < flA && inA(a) } }, roof: 'terrace', salt: 'b' });
  block(p, site, A, t, { floors: flA, balcony: ['f', 'n', 'p'], faces: { b: false, f: { skip: (a, f) => f === 1 && Math.abs(a - dz) < 5.2 } }, roof: 'terrace', salt: 'a', plinth: true });
  // wooden trellis fins on the terraces' fronts add warmth
  for (const r of [A, Bk]) {
    const y = r === A ? GROUND + Math.max(3, fl - 5) * FLOOR : GROUND + Math.max(4, fl - 3) * FLOOR;
    for (let i = 0; i < 6; i++) p.box(r.x1 - 0.2, y - 5, r.z0 + (r.d * (i + 0.5)) / 6, 0.2, 5, 0.4, t.accent);
  }
  // lobby at the door, canopy and name
  if (dz > A.z0 + 5 && dz < A.z1 - 5) entrance(p, 'f', A.x1, dz, { w: 9, y: 4.8, canopyTrim: t.accent });
  else entrance(p, 'f', F.x1, dz, { w: 9, y: 4.8 });
  namePlate(p, site, t, F.x1 + 0.05, GROUND + 7.2, dz, 'f', 10);
  p.light(F.x1 + 3, 4, dz, 12, '#ffe2b8', 0.8, 'facade', 'entrance');
}

function point(p, site, t) {
  const F = p.f.foot, dz = doorZ(p), D = F.x1 - F.x0, W = F.z1 - F.z0, fl = site.floors;
  const s = Math.min(W * 0.38, D * 0.4, 22);
  const rect = (x0, x1, z0, z1) => ({ x0, x1, z0, z1, x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 });
  const cx = F.x0 + s / 2 + 3, off = W / 2 - s / 2 - 1.5;
  const towers = [-1, 1].map(sg => rect(cx - s / 2, cx + s / 2, F.z + sg * off - s / 2, F.z + sg * off + s / 2));
  towers.forEach((r, i) => {
    block(p, site, r, t, { floors: fl, balcony: ['f', 'b', 'n', 'p'], pitch: 3.6, salt: 'tw' + i, shed: i === 0, solar: 2 });
    // bay bumps on each face give the plan its cross
    for (const face of FACES) {
      const plane = planeOf(r, face), [s0, s1] = spanOf(r, face), mid = (s0 + s1) / 2;
      fbox(p, face, plane, mid, GROUND + 0.9, 2.6, fl * FLOOR - 0.9, 0.5, t.accent, 'body', undefined, 0.02);
    }
    // crown: a light ring beam with an LED strip
    const top = GROUND + fl * FLOOR;
    p.span(r.x0 - 0.5, r.x1 + 0.5, top, top + 0.6, r.z0 - 0.5, r.z1 + 0.5, t.trim);
    p.glowBox(r.x1 + 0.52, top + 0.1, r.z, 0.12, 0.3, r.d, '#cfe8ff', '#8ad8ff', 'sign', 1.3);
  });
  // forecourt between and in front of the towers; a two-storey lobby pavilion at the door
  const pav = clearOfAnnexes(p, rect(F.x1 - 14, F.x1, dz - 7.5, dz + 7.5));
  block(p, site, pav, t, { floors: 2, roof: 'terrace', balcony: [], faces: { b: {}, p: {}, n: {}, f: false }, corners: false });
  // glazed lobby front
  entrance(p, 'f', pav.x1, dz, { w: 10, y: 5.2, doorW: 7, doorH: 4.3, depth: 4.6, canopyTrim: t.accent });
  namePlate(p, site, t, pav.x1 + 0.05, GROUND + 8.4, dz, 'f', 9);
  p.light(F.x1 + 3, 4, dz, 12, '#ffe2b8', 0.8, 'facade', 'entrance');
  // plaza: paving, fountain, trees, benches
  const plaza = rect(F.x0 + s + 7, F.x1 - 14.5, F.z0 + 1, F.z1 - 1);
  if (plaza.w > 6) {
    p.pad(plaza.x0, plaza.x1, plaza.z0, plaza.z1, '#e1dacb', 0.22);
    lawn(p, rect(plaza.x0 + 1, plaza.x1 - 1, plaza.z0 + 1, plaza.z0 + 5), 0.27); lawn(p, rect(plaza.x0 + 1, plaza.x1 - 1, plaza.z1 - 5, plaza.z1 - 1), 0.27);
    fountain(p, plaza.x, plaza.z, Math.min(3.2, plaza.w / 3));
    for (const sg of [-1, 1]) { tree(p, plaza.x, plaza.z + sg * (plaza.d / 2 - 3), 6.5, undefined, 0.2); bench(p, plaza.x + 3, plaza.z + sg * 6, 'z'); }
  }
  // garden behind: lawn and trees on the side strips by the pavilion
  trees(p, site, rect(pav.x0 - 8, pav.x0, F.z0, F.z1), 3, [], 'g');
}

// ------------------------------------------------------------------ clinics
// A small ground-floor storefront: white walls, a green stripe, big lit windows and a
// green cross sign, the clinic's name on the fascia.
function clinic(p, site) {
  const F = p.f.foot, G = '#2e9b6a', y1 = GROUND + 6;
  p.span(F.x0, F.x1, GROUND, y1, F.z0, F.z1, '#f3f5f0');
  p.span(F.x0 - 0.1, F.x1 + 0.1, GROUND, GROUND + 0.7, F.z0 - 0.1, F.z1 + 0.1, '#8d9590');
  p.span(F.x0 - 0.2, F.x1 + 0.2, y1 - 0.5, y1 + 0.35, F.z0 - 0.2, F.z1 + 0.2, '#e3e8e2');
  const key = 'clinic:' + site.id;
  const item = p.b.atlas.text(key, site.name, { color: '#ffffff', background: G, size: 56, pad: 0.35, radius: 0.25 });
  const sw = Math.min(F.d - 3.2, 1.25 * item.aspect);
  p.sign(key, 'f', F.x1 + 0.2, y1 - 1.4, F.z + 1.3, sw, { h: sw / item.aspect });
  // the green cross, lit
  for (const [w, h] of [[1.9, 0.6], [0.6, 1.9]]) p.glowBox(F.x1 + 0.12, y1 - 2.35 + (h > w ? 0 : 0.65), F.z0 + 1.9, 0.14, h, w, '#e8fff0', '#35d880', 'sign', 1.4);
  // storefront: glass either side of a door, green awning
  const mid = F.z + 1.0;
  p.glowQuad(F.x1 + 0.1, GROUND + 2.1, F.z + 0.0 - 1.9, 3.0, 2.6, 'f', '#8fb7b4', '#e9ffe9', 'entry', 0.9);
  p.glowQuad(F.x1 + 0.1, GROUND + 2.1, F.z + 0.0 + 3.7, 3.0, 2.6, 'f', '#8fb7b4', '#e9ffe9', 'entry', 0.9);
  p.glowQuad(F.x1 + 0.1, GROUND + 1.9, F.z + 0.9, 1.9, 3.1, 'f', '#9fc2c4', '#fffbe8', 'entry', 1.1);
  fbox(p, 'f', F.x1, mid - 0.1, GROUND + 0.7, 0.2, 3.5, 0.3, '#4a4f55', 'body', undefined, 0.02);
  for (let i = 0; i < 8; i++) fbox(p, 'f', F.x1, F.z0 + 0.7 + i * 1.3, GROUND + 3.55, 1.3, 0.2, 1.3, i % 2 ? '#f4f6f2' : G, 'body', undefined, 0.3);
  roofBits(p, F, y1 + 0.35);
  p.light(F.x1 + 2, 4, F.z, 7, '#9ff0c0', 0.55, 'sign', 'clinic');
}
function roofBits(p, F, y) {
  p.box(F.x0 + 2, y, F.z0 + 2, 1.8, 1.0, 1.4, '#c9cdd0');
  waterTankLite(p, F.x0 + 2.2, y, F.z1 - 2.2);
}
function waterTankLite(p, x, y, z) { p.cyl(x, y, z, 1.0, 1.6, '#f1f1ec', 8); }

void bush; void unit;
