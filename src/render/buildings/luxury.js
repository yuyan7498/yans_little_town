// The two luxury homes (kind 'housing'):
//   villa   雲頂別墅  a gated estate of detached modern villas round a private road loop,
//           guard booth and boom barrier at the gate, stone name sign, estate wall and hedge
//   luxury  天璽豪宅  a landmark residential tower: stone-and-glass facade with vertical fins,
//           deep glass-railed balconies, a sky-garden floor, setbacks, a lit crown and spire,
//           a double-height lobby with porte-cochere over a landscaped pool podium
// All drawn in the site's local frame (+x out of the front, door at the front edge).

import { unit } from '../../core/random.js';
import { Builder, GROUND, GLOW, UNIT_SHAPES, lrect } from './a-kit.js';
import { FACES, FLOOR, bush, fbox, planeOf, spanOf, tree, win, windowGrid, WARM } from './a-parts.js';

export function create({ world, quality = 'full' }) {
  const b = new Builder({ world, quality });
  for (const site of world.siteList) {
    if (site.kind !== 'housing') continue;
    if (site.type === 'villa') villaEstate(b.site(site), site);
    else if (site.type === 'luxury') tower(b.site(site), site);
  }
  return b.finish('luxury');
}
export const preview = ctx => create(ctx);

// ------------------------------------------------------------------ shared pieces
const STONE = ['#b9ae9b', '#a79e8d', '#c3b8a3'], WOOD = ['#a9774a', '#b98a5c', '#8f6a48'];
const WHITE = ['#f1ede4', '#e8e2d6', '#f4f0e8'], DARK = '#454a50', LAWN = '#7aa35b', HEDGE = '#5a8545';
const GLASSV = ['#7fa9b8', '#88b2c0', '#7099aa'], CAR = ['#f2f2ee', '#2b2f35', '#a3a9ae', '#8a2a2e', '#27476b', '#c9c2b0'];
const WATER = '#4fb8d6', ROAD = '#8d9096', PAVE = '#d9d2c3', CURB = '#bdb6a8', PATH = '#cfc8b8';

// A slab whose top is at y (bottom well inside whatever it lies on).
const slab = (p, x0, x1, z0, z1, y, color, th = 0.3) => p.span(x0, x1, y - th, y, z0, z1, color);
const glassBox = (p, x0, x1, y0, y1, z0, z1) => p.span(x0, x1, y0, y1, z0, z1, '#bfe3ee', 'clear');
const lamp = (p, x, z, y0 = GROUND, h = 4.4) => {
  p.cyl(x, y0, z, 0.13, h, '#4a4f55', 6);
  p.glowBox(x, y0 + h, z, 0.7, 0.45, 0.7, '#f4efe0', '#ffe2b0', 'lamps', 1.4);
};
const dpt = p => p.f.point(p.site.door) || { x: p.f.foot.x1, z: 0 };

// A parked car (8.6 x 3.4), body along x (alongX) or z, y0 = the surface it stands on.
function car(p, x, z, alongX, color, y0 = 0.33) {
  const sw = (a, b) => (alongX ? [a, b] : [b, a]);
  const [bx, bz] = sw(8.6, 3.4), [cx, cz] = sw(4.7, 3.0), [rx, rz] = sw(5.0, 3.2), [hx, hz] = sw(0.5, 3.0);
  const sx = alongX ? 1 : 0, sz = alongX ? 0 : 1;
  p.box(x, y0 + 0.7, z, bx, 1.5, bz, color);
  p.box(x - 0.5 * sx, y0 + 2.2, z - 0.5 * sz, cx, 1.2, cz, '#2f3f49');
  p.box(x - 0.5 * sx, y0 + 3.4, z - 0.5 * sz, rx, 0.22, rz, color);
  p.box(x + 3.9 * sx, y0 + 1.0, z + 3.9 * sz, hx, 0.4, hz, '#e8f0f4');            // nose lamps
  for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
    const wx = alongX ? x + sa * 2.7 : x + sb * 1.65, wz = alongX ? z + sb * 1.65 : z + sa * 2.7;
    p.tube(wx, y0 + 0.9, wz, 0.9, 0.55, '#2a2d31', alongX ? 'z' : 'x', 8);
  }
}
// A standing person (4.3 tall).
function person(p, x, z, y0, coat, hat = '#2d3338') {
  p.box(x, y0, z, 1.0, 1.9, 0.9, '#33383d');
  p.box(x, y0 + 1.9, z, 1.4, 1.7, 1.0, coat);
  p.blob(x, y0 + 4.0, z, 0.5, '#e6bf9b', 1);
  p.box(x, y0 + 4.2, z, 1.0, 0.18, 1.0, hat);
}
function lounger(p, x, z, y0, alongX = false) {
  const [sx, sz] = alongX ? [2.6, 0.95] : [0.95, 2.6];
  p.box(x, y0, z, sx - 0.1, 0.45, sz - 0.1, '#8f8678');
  p.box(x, y0 + 0.45, z, sx, 0.3, sz, '#f4f0e6');
}
function parasol(p, x, z, y0, color = '#f0e6cc') {
  p.cyl(x, y0, z, 0.1, 3.4, '#8c949b', 6);
  p.cone(x, y0 + 3.2, z, 2.4, 0.7, color, 8);
}

// A pool: water hole rect (x0..x1, z0..z1) ringed by a deck. Water sits slightly below the
// deck, glows at night, with pool lights at the rim.
function pool(p, x0, x1, z0, z1, deckTop, waterTop, dw = 1.3) {
  const D = '#e2dccd';
  slab(p, x0 - dw, x1 + dw, z0 - dw, z0, deckTop, D, 0.4);
  slab(p, x0 - dw, x1 + dw, z1, z1 + dw, deckTop, D, 0.4);
  slab(p, x0 - dw, x0, z0, z1, deckTop, D, 0.4);
  slab(p, x1, x1 + dw, z0, z1, deckTop, D, 0.4);
  p.span(x0 - 0.3, x1 + 0.3, waterTop - 0.3, waterTop, z0 - 0.3, z1 + 0.3, WATER, 'glow', { glow: [GLOW.lamps, p.slot, 0], emit: '#2fc4ff', power: 0.55 });
  const L = (x, z) => p.glowBox(x, deckTop, z, 0.5, 0.14, 0.5, '#d8f8ff', '#7aeaff', 'lamps', 1.8);
  L(x0 - 0.1, z0 - 0.1); L(x1 - 0.4, z0 - 0.1); L(x0 - 0.1, z1 - 0.4); L(x1 - 0.4, z1 - 0.4);
  if (x1 - x0 > 9) { L((x0 + x1) / 2, z0 - 0.1); L((x0 + x1) / 2, z1 - 0.4); }
}

// A solid run of wall (stone + cap) between two ground points.
function wallRun(p, ax, az, bx, bz, h = 2.4, color = '#b4a893') {
  if (Math.hypot(bx - ax, bz - az) < 0.5) return;
  p.beam(ax, az, bx, bz, GROUND + h / 2 - 0.05, 0.7, h + 0.1, color);
  const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len * 0.12, uz = (bz - az) / len * 0.12;
  p.beam(ax - ux, az - uz, bx + ux, bz + uz, GROUND + h - 0.05, 1.0, 0.4, '#d6ccb8');
}
function hedgeRun(p, ax, az, bx, bz, h = 2.6) {
  if (Math.hypot(bx - ax, bz - az) < 0.5) return;
  p.beam(ax, az, bx, bz, GROUND + h / 2, 1.6, h, HEDGE);
}

// ================================================================== the villa estate
function villaEstate(p, site) {
  const F = p.f.foot, dz = dpt(p).z;
  // ground: lawn over the lot; roads and paving above it at distinct heights
  p.pad(F.x0, F.x1, F.z0, F.z1, LAWN, 0.21);
  const lane = 5, med = 1.6, laneEnd = F.x1 - 12, backX = F.x0 + 2.2;
  for (const [a, b] of [[med, med + lane], [-med - lane, -med]]) p.pad(backX + 5, laneEnd, dz + a, dz + b, ROAD, 0.27);
  p.pad(backX, backX + 5, dz - med - lane, dz + med + lane, ROAD, 0.27);           // the back turn joins the lanes
  p.pad(laneEnd, F.x1 - 0.1, dz - med - lane, dz + med + lane, ROAD, 0.27);              // gate apron
  for (const s of [-1, 1]) {
    p.pad(backX + 5, laneEnd, dz + s * (med - 0.45), dz + s * med, CURB, 0.38);
    p.pad(backX, laneEnd, dz + s * (med + lane), dz + s * (med + lane + 0.45), CURB, 0.38);
  }
  // estate wall and hedge round the lot; the gate gap and the sign wall stay open
  const wx0 = F.x0 + 0.55, wx1 = F.x1 - 0.55, wz0 = F.z0 + 0.55, wz1 = F.z1 - 0.55, gate = 5.4, signZ = [dz - 14.6, dz - 5.6];
  wallRun(p, wx0 - 0.5, wz0, wx1 + 0.5, wz0); wallRun(p, wx0 - 0.5, wz1, wx1 + 0.5, wz1);
  wallRun(p, wx0, wz0 + 0.5, wx0, wz1 - 0.5);
  wallRun(p, wx1, wz0 + 0.5, wx1, signZ[0] + 0.2); wallRun(p, wx1, dz + gate + 0.8, wx1, wz1 - 0.5);
  hedgeRun(p, wx0 + 0.5, wz0 + 1.5, wx1 - 0.5, wz0 + 1.5); hedgeRun(p, wx0 + 0.5, wz1 - 1.5, wx1 - 0.5, wz1 - 1.5);
  hedgeRun(p, wx0 + 1.5, wz0 + 2.3, wx0 + 1.5, wz1 - 2.3);
  hedgeRun(p, wx1 - 1.5, wz0 + 2.3, wx1 - 1.5, signZ[0] - 0.3); hedgeRun(p, wx1 - 1.5, dz + gate + 1.0, wx1 - 1.5, wz1 - 2.3);

  // the gate: two stone piers with lanterns, the sign wall, a guard booth and a raised boom
  const gx = F.x1 - 0.5, szc = (signZ[0] + signZ[1]) / 2;
  for (const s of [-1, 1]) {
    p.box(gx, GROUND, dz + s * gate, 1.6, 4.8, 1.6, '#c6baa3');
    p.box(gx, GROUND + 4.6, dz + s * gate, 2.0, 0.4, 2.0, '#8e8473');
    p.glowBox(gx, GROUND + 5.0, dz + s * gate, 0.7, 1.0, 0.7, '#f4efe0', '#ffd79c', 'entry', 1.5);
    p.light(gx - 1.5, 4, dz + s * gate, 10, '#ffe2b8', 0.8, 'facade', 'gate');
  }
  p.box(gx, GROUND, szc, 1.8, 3.2, signZ[1] - signZ[0], '#a79d89');
  p.box(gx, GROUND + 3.0, szc, 2.2, 0.45, signZ[1] - signZ[0] + 0.5, '#d6ccb8');
  const key = 'name:' + site.id;
  const item = p.b.atlas.text(key, site.name, { color: '#f4e6bc', background: '#2f3b37', size: 64, pad: 0.4, radius: 0.18, border: '#d8bd6a' });
  const sw = Math.min(signZ[1] - signZ[0] - 0.8, 1.9 * item.aspect);
  p.sign(key, 'f', gx + 0.9, GROUND + 1.7, szc, sw, { h: sw / item.aspect });
  p.light(gx - 2, 3.4, szc, 9, '#ffe9bd', 0.6, 'sign', 'estate-sign');
  const bx = gx - 3.5, bz = dz + 8.6;
  p.box(bx, GROUND, bz, 3.8, 3.8, 3.2, '#e9e4d8');
  p.box(bx, GROUND + 3.55, bz, 4.6, 0.4, 4.0, DARK);
  win(p, 'f', bx + 1.9, bz, GROUND + 2.2, 2.6, 1.7, { glass: '#7fa9b8', light: '#ffe2b0', panes: 2 });
  win(p, 'n', bz - 1.6, bx, GROUND + 2.2, 2.4, 1.7, { glass: '#7fa9b8', light: '#ffe2b0', panes: 2 });
  p.glowBox(bx, GROUND + 3.95, bz, 1.4, 0.18, 0.5, '#ffffff', '#fff2cf', 'entry', 1.2);
  person(p, bx + 1.2, bz - 2.5, GROUND, '#2c3e58', '#1f2a3a');
  const px = bx - 0.6, pz = dz + gate - 1.0;
  p.box(px, GROUND, pz + 1.4, 0.7, 2.2, 0.7, '#d9453b');
  p.put(UNIT_SHAPES.box(), px, GROUND + 4.3, pz + 2.3, [-1.15, 0, 0], [0.22, 0.22, 4.4], '#f4f4f0');   // the boom, raised
  p.glowBox(px, GROUND + 2.2, pz + 1.4, 0.3, 0.3, 0.3, '#ffd0c8', '#ff5a40', 'beacon', 1.4);
  p.light(bx, 4.4, bz, 9, '#ffe2b8', 0.7, 'facade', 'guard-booth');
  p.light(gx - 4, 5.5, dz, 11, '#ffe2b8', 0.6, 'lamps', 'gate-road');

  // median: trees and lamp posts between the two lanes
  for (let x = backX + 8; x < laneEnd - 3; x += 7.5) {
    tree(p, x, dz + (unit(site.id + 'mt' + x) - 0.5) * 1.0, 6 + unit(site.id + 'mh' + x) * 2.5, undefined, 0.21);
    if (Math.round(x / 7.5) % 2) lamp(p, x + 3.5, dz, 0.21, 4.6);
  }
  for (const s of [-1, 1]) lamp(p, laneEnd + 2, dz + s * 8.4, GROUND, 4.4);

  // the villas: lots on both sides of the lanes, mirrored garages, one house style in three
  const lx0 = F.x0 + 2.6, lx1 = F.x1 - 6.4;
  const lotsX = Math.max(2, Math.round((lx1 - lx0) / 16.5)), lotW = (lx1 - lx0 - (lotsX - 1) * 2) / lotsX;
  const zN = dz + med + lane + 0.5, zNEnd = F.z1 - 2.6, zS = dz - med - lane - 0.5, zSEnd = F.z0 + 2.6;
  let vi = 0;
  for (const side of [1, -1]) {
    for (let k = 0; k < lotsX; k++) {
      const x1 = lx1 - k * (lotW + 2), x0 = x1 - lotW;
      const lot = side > 0 ? lrect(x0, x1, zN, zNEnd) : lrect(x0, x1, zSEnd, zS);
      villa(p, vi++, lot, side > 0 ? 'n' : 'p');
      if (k < lotsX - 1) p.beam(x0 - 1, lot.z0, x0 - 1, lot.z1, GROUND + 0.7, 1.0, 1.4, HEDGE);   // hedge between lots
    }
  }
}

// ------------------------------------------------------------------ one villa
// Lot frame (u across, v from the back of the lot to the street), canonical garage on the
// high-u side; odd villas are mirrored. Walls are spoken of as front/back/left/right.
function makeV(p, lot, front, mirror) {
  const Lu = lot.w, Lv = lot.d;
  const raw = (u, v) => (front === 'n' ? { x: lot.x0 + u, z: lot.z1 - v } : { x: lot.x0 + u, z: lot.z0 + v });
  const pt = (u, v) => raw(mirror ? Lu - u : u, v);
  const faceOf = side => {
    if (side === 'front') return front;
    if (side === 'back') return front === 'n' ? 'p' : 'n';
    return (side === 'right') !== mirror ? 'f' : 'b';
  };
  const V = {
    Lu, Lv, pt,
    span(u0, u1, v0, v1, y0, y1, color, layer, extra) {
      const a = pt(u0, v0), b = pt(u1, v1);
      p.span(Math.min(a.x, b.x), Math.max(a.x, b.x), y0, y1, Math.min(a.z, b.z), Math.max(a.z, b.z), color, layer, extra);
    },
    pad(u0, u1, v0, v1, ytop, color, th = 0.3) { V.span(u0, u1, v0, v1, ytop - th, ytop, color); },
    // The wall point: side, wv = v (front/back) or u (left/right), t = along-the-wall coordinate.
    at(side, wv, t) {
      const q = side === 'front' || side === 'back' ? pt(t, wv) : pt(wv, t), face = faceOf(side);
      return face === 'f' || face === 'b' ? { face, plane: q.x, a: q.z } : { face, plane: q.z, a: q.x };
    },
    win(side, wv, t, yc, w, h, o) { const q = V.at(side, wv, t); win(p, q.face, q.plane, q.a, yc, w, h, o); },
    fb(side, wv, t, y0, along, h, out, color, start = 0, layer = 'body', extra) { const q = V.at(side, wv, t); fbox(p, q.face, q.plane, q.a, y0, along, h, out, color, layer, extra, start); },
    glowQuad(side, wv, t, yc, w, h, color, emit, channel, power) {
      const q = V.at(side, wv, t), d = q.face === 'f' || q.face === 'p' ? 0.12 : -0.12;
      if (q.face === 'f' || q.face === 'b') p.glowQuad(q.plane + d, yc, q.a, w, h, q.face, color, emit, channel, power);
      else p.glowQuad(q.a, yc, q.plane + d, w, h, q.face, color, emit, channel, power);
    },
    glowBox(u, v, y0, sx, sy, sz, color, emit, channel, power) { const q = pt(u, v); p.glowBox(q.x, y0, q.z, sx, sy, sz, color, emit, channel, power); },
    tree(u, v, h, y0) { const q = pt(u, v); tree(p, q.x, q.z, h, undefined, y0); },
    bush(u, v, y, r, c) { const q = pt(u, v); bush(p, q.x, y, q.z, r, c); }
  };
  return V;
}

// A big glazed wall: lit glass in a dark frame (head, sill and end posts).
function glassWall(V, side, wv, t, y0, w, h, o = {}) {
  V.win(side, wv, t, y0 + h / 2, w, h, { glass: o.glass, light: o.light, panes: o.panes ?? 3, out: 0.07 });
  V.fb(side, wv, t, y0 + h, w + 0.5, 0.3, 0.3, DARK, -0.04);
  V.fb(side, wv, t, y0 - 0.3, w + 0.5, 0.3, 0.45, DARK, -0.04);
  for (const s of [-1, 1]) V.fb(side, wv, t + s * (w / 2 + 0.1), y0, 0.25, h, 0.3, DARK, -0.04);
}

function villa(p, vi, lot, front) {
  const mirror = vi % 2 === 1, variant = vi % 3, hasPool = vi === 0 || vi === 3 || vi === 4;
  const V = makeV(p, lot, front, mirror), Lu = V.Lu, Lv = V.Lv;
  const key = 'villa' + vi, R = k => unit(key + k);
  const stone = STONE[vi % 3], wood = WOOD[(vi + 1) % 3], white = WHITE[vi % 3], glass = GLASSV[vi % 3], light = WARM[vi % WARM.length];
  const ro = '#4a4f55';
  const y0 = GROUND, h1 = 5.0, h2 = 4.5, yF = y0 + h1, yT = yF + 0.3 + h2;
  // plan, canonical (garage towards high u)
  const gu1 = Lu - 0.4, gu0 = gu1 - 4.6, mu0 = 1.6, mu1 = gu0 + 1.2;
  const v1 = Lv - 7.0, v0 = v1 - 8.5, cant = 1.9;
  const U = { u0: 1.0, u1: 8.4, v0: v0 + 0.8, v1: v1 + cant };
  const wallG = variant === 1 ? '#8c8579' : stone;

  // --- ground floor: stone box with a roof slab, glass living room, entrance under the overhang
  V.span(mu0, mu1, v0, v1, y0, yF, wallG);
  V.span(mu0 - 0.5, mu1 + 0.5, v0 - 0.5, v1 + 0.5, yF - 0.15, yF + 0.3, ro);
  glassWall(V, 'front', v1, 7.1, y0 + 0.35, 4.6, 3.9, { glass, light, panes: 3 });
  glassWall(V, 'back', v0, 6.5, y0 + 0.35, 7.0, 3.9, { glass, light, panes: 4 });
  V.win('left', mu0, v0 + 3.2, y0 + 2.5, 2.6, 2.2, { glass, light, panes: 2 });
  V.win('left', mu0, v1 - 3.2, y0 + 2.5, 2.6, 2.2, { glass, light, panes: 2 });
  // wooden front door in a deep frame, with a sconce
  const du = 3.1;
  V.fb('front', v1, du, y0, 2.6, 4.6, 0.35, wood, -0.05);
  V.glowQuad('front', v1, du, y0 + 2.2, 2.0, 4.1, '#a9c4cd', '#ffdca4', 'entry', 1.0);
  V.glowBox(du + 1.9, v1 + 0.2, y0 + 3.0, 0.3, 0.6, 0.3, '#fff2d6', '#ffd79c', 'entry', 1.6);
  // --- garage wing, door with slats, roof slab
  const gh = 3.9, gv1 = v1 + 0.8;
  V.span(gu0, gu1, v0 + 2.5, gv1, y0, y0 + gh, '#6c7075');
  V.span(gu0 - 0.4, gu1 + 0.4, v0 + 2.2, gv1 + 0.5, y0 + gh - 0.15, y0 + gh + 0.3, ro);
  V.fb('front', gv1, (gu0 + gu1) / 2, y0, 3.9, 3.2, 0.15, '#9aa0a5', -0.05);
  for (let i = 0; i < 4; i++) V.fb('front', gv1, (gu0 + gu1) / 2, y0 + 0.5 + i * 0.75, 3.9, 0.12, 0.1, '#7d8388', 0.08);
  // --- upper floor: cantilevered box, strip glazing, wood or white cladding
  const wallU = variant === 0 ? white : variant === 1 ? wood : stone;
  V.span(U.u0, U.u1, U.v0, U.v1, yF + 0.3, yT, wallU);
  glassWall(V, 'front', U.v1, (U.u0 + U.u1) / 2 + 0.2, yF + 0.9, 5.0, 3.2, { glass, light, panes: 3 });
  V.fb('front', U.v1, U.u0 + 0.5, yF + 0.4, 0.9, h2 - 0.2, 0.3, variant === 0 ? wood : white, -0.05);
  V.win('left', U.u0, (U.v0 + U.v1) / 2, yF + 2.6, 5.4, 2.4, { glass, light, panes: 3 });
  V.win('back', U.v0, 4.6, yF + 2.6, 4.2, 2.4, { glass, light, panes: 2 });
  glassWall(V, 'right', U.u1, (U.v0 + U.v1) / 2 - 0.4, yF + 0.9, 5.4, 3.2, { glass, light, panes: 3 });
  V.span(U.u0 - 0.6, U.u1 + 0.6, U.v0 - 0.6, U.v1 + 0.6, yT - 0.15, yT + 0.5, variant === 2 ? white : ro);
  if (variant === 2) {
    // third level: a glass pavilion on the roof with a wide overhanging slab
    const T = { u0: 1.8, u1: 6.2, v0: U.v0 + 2.2, v1: U.v0 + 7.8 }, yR = yT + 0.5;
    V.span(T.u0, T.u1, T.v0, T.v1, yR - 0.1, yR + 3.3, '#d8d2c4');
    V.win('front', T.v1, 4.0, yR + 1.8, 3.6, 2.4, { glass, light, panes: 2 });
    V.win('right', T.u1, (T.v0 + T.v1) / 2, yR + 1.8, 4.0, 2.4, { glass, light, panes: 2 });
    V.span(T.u0 - 0.5, T.u1 + 0.5, T.v0 - 0.5, T.v1 + 0.5, yR + 3.1, yR + 3.55, ro);
  } else {
    V.span(U.u0 + 1.0, U.u1 - 1.0, U.v0 + 0.3, U.v0 + 1.4, yT + 0.5, yT + 0.95, '#6f9a52');   // planted roof strip
  }
  // --- roof terrace on the ground-floor slab beside the upper box: glass rail, pergola
  const t0 = U.u1 + 0.5, t1 = mu1 + 0.4, tv0 = v0 - 0.3, tv1 = v1 + 0.3, yS = yF + 0.3;
  if (t1 - t0 > 1.2) {
    const t = 0.1;
    V.span(t0, t1, tv1 - t, tv1, yS, yS + 1.2, '#bfe3ee', 'clear');
    V.span(t1 - t, t1, tv0 + t, tv1 - t, yS, yS + 1.2, '#bfe3ee', 'clear');
    V.span(t0, t1, tv0, tv0 + t, yS, yS + 1.2, '#bfe3ee', 'clear');
    V.span(t0, t1, tv1 - 0.2, tv1 + 0.02, yS + 1.2, yS + 1.36, '#8d9298');
    if (variant !== 2) {
      for (const s of [t0 + 0.4, t1 - 0.5]) for (const v of [tv0 + 0.9, tv1 - 0.9]) V.span(s, s + 0.2, v, v + 0.2, yS, yS + 2.8, wood);
      for (let i = 0; i < 5; i++) { const v = tv0 + 0.9 + i * ((tv1 - tv0 - 1.8) / 4); V.span(t0 + 0.3, t1 - 0.3, v, v + 0.3, yS + 2.8, yS + 3.0, wood); }
    }
    V.bush((t0 + t1) / 2, tv0 + 1.6, yS + 0.5, 0.7); V.bush((t0 + t1) / 2, tv1 - 2.6, yS + 0.5, 0.7);
  }
  // --- garden: forecourt, path, car, trees, pool
  const curbV = Lv + 0.55;
  V.pad(gu1 - 10, gu1 - 0.3, v1 + 0.2, curbV, 0.31, PAVE, 0.3);
  V.pad(du - 0.9, du + 0.9, v1 + 0.1, curbV - 0.15, 0.34, PATH, 0.35);
  const cuv = V.pt(gu1 - 4.7, (v1 + 0.8 + curbV) / 2 + 0.5);
  car(p, cuv.x, cuv.z, true, CAR[(vi * 2 + 1) % CAR.length], 0.31);
  V.tree(1.0, Lv - 1.2, 7.5, 0.21); V.tree(Lu - 0.8, v0 - 0.8, 6.5, 0.21);
  V.tree(mu0 + 0.2, v0 - 1.8, 8 + R('t') * 2, 0.21);
  V.bush(1.3, v1 + 1.0, 0.9, 0.85); V.bush(1.9, v1 + 3.2, 0.9, 0.7, '#5f8a47');
  if (hasPool) {
    const pu0 = 2.8, pu1 = Math.min(Lu - 3.2, 11.3), pv0 = 1.4, pv1 = Math.min(v0 - 2.3, 5.2);
    const q0 = V.pt(pu0, pv0), q1 = V.pt(pu1, pv1);
    pool(p, Math.min(q0.x, q1.x), Math.max(q0.x, q1.x), Math.min(q0.z, q1.z), Math.max(q0.z, q1.z), 0.33, 0.27, 1.1);
    const L1 = V.pt(pu0 + 1.6, pv1 + 0.6), L2 = V.pt(pu0 + 4.4, pv1 + 0.6);
    lounger(p, L1.x, L1.z, 0.33, true); lounger(p, L2.x, L2.z, 0.33, true);
    const pa = V.pt(pu1 - 1.0, pv1 + 0.6); parasol(p, pa.x, pa.z, 0.33, ['#f0e6cc', '#c9e0d6', '#f2d6b8'][vi % 3]);
    const pl = V.pt((pu0 + pu1) / 2, (pv0 + pv1) / 2);
    p.light(pl.x, 2.2, pl.z, 9, '#8fe6ff', 0.5, 'lamps', 'pool');
  } else {
    // a paved terrace with a round table and shrubs
    V.pad(3.0, 10.0, 1.2, 4.6, 0.31, '#d2cab8', 0.3);
    const tb = V.pt(6.5, 2.9); p.cyl(tb.x, 0.31, tb.z, 1.1, 0.7, '#6b6f73', 10); p.cyl(tb.x, 1.0, tb.z, 1.3, 0.14, wood, 10);
    for (let i = 0; i < 3; i++) V.bush(2.0 + i * 5, 0.8, 0.8, 0.9);
  }
  const ent = V.pt(du, v1 + 3);
  p.light(ent.x, 4.2, ent.z, 9, '#ffe2b8', 0.7, 'facade', 'villa-entrance');
}

// ================================================================== the tower
const BAY = 6.4;

function tower(p, site) {
  const F = p.f.foot, door = dpt(p), dz = door.z;
  const P = lrect(F.x0 + 2, F.x1 - 12, F.z0 + 4, F.z1 - 4);
  const T1 = lrect(P.x0 + 7, P.x1 - 9, P.z0 + 13, P.z1 - 13);
  const shrink = (r, front, back, side) => lrect(r.x0 + back, r.x1 - front, r.z0 + side, r.z1 - side);
  const T2 = shrink(T1, 2.6, 2.2, 2.4), T3 = shrink(T2, 2.4, 1.8, 2.6);
  const b = k => GROUND + k * FLOOR;
  const PY = GROUND + 12, D0 = PY + 0.4;                 // podium wall top, podium roof deck
  const nFloors = site.floors;
  const kSky = Math.max(4, Math.round(nFloors * 2 / 3)), kT3 = nFloors - 3;
  const STONEW = '#e2d3b8', FIN = '#f4efe5', BAND = '#cdbb98', PIER = '#c3b08a';

  // ---- ground: lawn, forecourt paving, drive
  p.pad(F.x0, F.x1, F.z0, F.z1, LAWN, 0.21);
  p.pad(P.x1 - 1, F.x1 - 0.05, dz - 14, dz + 14, PAVE, 0.27);
  p.pad(P.x1 + 0.5, F.x1 - 0.12, dz - 5.6, dz + 5.6, ROAD, 0.31);
  for (const s of [-1, 1]) p.pad(P.x1 + 0.5, F.x1 - 0.2, dz + s * 5.6, dz + s * 6.0, CURB, 0.36);

  // ---- fence, gate, sign wall, doorman
  const gate = 5.4, signZ = [dz - 16, dz - 6.4], gx = F.x1 - 0.5;
  const fenceRun = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az); if (len < 1) return;
    p.beam(ax, az, bx, bz, GROUND + 0.4, 0.6, 0.9, '#b4a893');
    const n = Math.max(1, Math.round(len / 2.6));
    for (let i = 0; i <= n; i++) p.box(ax + ((bx - ax) * i) / n, GROUND + 0.8, az + ((bz - az) * i) / n, 0.26, 2.2, 0.26, '#3c4248');
    p.beam(ax, az, bx, bz, GROUND + 2.9, 0.18, 0.18, '#3c4248'); p.beam(ax, az, bx, bz, GROUND + 1.9, 0.12, 0.12, '#3c4248');
  };
  const e = 0.7;
  fenceRun(F.x0 + e, F.z0 + e, F.x1 - e, F.z0 + e); fenceRun(F.x0 + e, F.z1 - e, F.x1 - e, F.z1 - e);
  fenceRun(F.x0 + e, F.z0 + e + 0.5, F.x0 + e, F.z1 - e - 0.5);
  fenceRun(gx - 0.2, F.z0 + e + 0.5, gx - 0.2, signZ[0] + 0.4);
  fenceRun(gx - 0.2, dz + gate + 5.0, gx - 0.2, F.z1 - e - 0.5);
  hedgeRun(p, F.x0 + 1.5, F.z0 + 1.9, F.x1 - 2.2, F.z0 + 1.9, 2.0); hedgeRun(p, F.x0 + 1.5, F.z1 - 1.9, F.x1 - 2.2, F.z1 - 1.9, 2.0);
  hedgeRun(p, F.x0 + 2.0, F.z0 + 3.4, F.x0 + 2.0, F.z1 - 3.4, 2.0);
  hedgeRun(p, gx - 1.8, F.z0 + 3.4, gx - 1.8, signZ[0] - 0.3, 2.0); hedgeRun(p, gx - 1.8, dz + gate + 5.0, gx - 1.8, F.z1 - 3.4, 2.0);
  for (const s of [-1, 1]) {
    p.box(gx, GROUND, dz + s * gate, 1.7, 5.2, 1.7, '#c6baa3');
    p.box(gx, GROUND + 5.0, dz + s * gate, 2.2, 0.4, 2.2, '#8e8473');
    p.glowBox(gx, GROUND + 5.4, dz + s * gate, 0.75, 1.1, 0.75, '#f4efe0', '#ffd79c', 'entry', 1.5);
    p.light(gx - 1.6, 4, dz + s * gate, 10, '#ffe2b8', 0.8, 'facade', 'gate');
  }
  // the sliding gate leaf, parked open beside the right pier
  p.box(gx - 0.3, GROUND + 0.1, dz + gate + 2.9, 0.3, 3.6, 4.2, '#3c4248');
  for (let i = 0; i < 6; i++) p.box(gx - 0.1, GROUND + 0.6 + i * 0.55, dz + gate + 2.9, 0.1, 0.16, 4.0, '#6b7178');
  // sign wall
  const szc = (signZ[0] + signZ[1]) / 2;
  p.box(gx, GROUND, szc, 1.8, 3.4, signZ[1] - signZ[0], '#a79d89');
  p.box(gx, GROUND + 3.2, szc, 2.2, 0.45, signZ[1] - signZ[0] + 0.5, '#d6ccb8');
  const nameKey = 'name:' + site.id;
  const nameItem = p.b.atlas.text(nameKey, site.name, { color: '#f4e6bc', background: '#2b2a2c', size: 70, pad: 0.4, radius: 0.15, border: '#d8bd6a' });
  const nw = Math.min(signZ[1] - signZ[0] - 0.8, 2.0 * nameItem.aspect);
  p.sign(nameKey, 'f', gx + 0.9, GROUND + 1.8, szc, nw, { h: nw / nameItem.aspect });
  p.light(gx - 2, 3.4, szc, 9, '#ffe9bd', 0.6, 'sign', 'estate-sign');
  person(p, gx - 1.5, dz + 3.4, GROUND, '#1f2f4a', '#1f2a3a');                 // the doorman at the gate
  p.light(gx - 6, 5.2, dz, 12, '#ffe2b8', 0.6, 'lamps', 'drive');
  for (const s of [-1, 1]) lamp(p, P.x1 + 3, dz + s * 12.6, 0.27, 4.6);
  car(p, P.x1 + 5.2, dz + 8.0, true, CAR[1], 0.27); car(p, P.x1 + 5.6, dz - 8.0, true, CAR[3], 0.27);

  // ---- podium: stone base, pilasters, windows, cornice slab
  p.span(P.x0, P.x1, GROUND, PY + 0.15, P.z0, P.z1, '#cfc3ab');
  slab(p, P.x0 - 0.5, P.x1 + 0.5, P.z0 - 0.5, P.z1 + 0.5, D0, '#efe7d6', 0.85);
  p.span(P.x0 - 0.25, P.x1 + 0.25, GROUND, GROUND + 0.9, P.z0 - 0.25, P.z1 + 0.25, '#8e8470');
  for (const face of FACES) {
    const plane = planeOf(P, face), [s0, s1] = spanOf(P, face), mid = (s0 + s1) / 2;
    const g = windowGrid(p, P, face, { floor0: 0, floor1: 2, pitch: 4.4, w: 2.5, h: 3.7, sill: 1.1, margin: 2.4, panes: 2,
      glass: ['#7fa9b8', '#8ab3c0', '#759fb0'], light: WARM, skip: i => face === 'f' && Math.abs(i.a - dz) < 12.5 });
    for (let i = 0; i <= g.n; i++) {
      const a = g.a0 + i * g.step;
      if (face === 'f' && Math.abs(a - dz) < 11.8) continue;
      fbox(p, face, plane, a, GROUND, 0.9, 11.7, 0.45, '#e6dcc6', 'body', undefined, -0.05);
    }
    fbox(p, face, plane, mid, GROUND + (face === 'f' || face === 'b' ? 5.4 : 5.35), s1 - s0 + 0.5, 0.7, 0.6, '#e6dcc6', 'body', undefined, -0.1);
  }
  // lobby: tall lit glass in a stone portal, mullions, doors, name above, porte-cochere
  const lobbyW = 20, lx = P.x1;
  p.glowQuad(lx + 0.1, GROUND + 4.4, dz, lobbyW, 8.5, 'f', '#8fb2bf', '#ffe2b0', 'entry', 0.95);
  for (let i = 0; i <= 8; i++) fbox(p, 'f', lx, dz - lobbyW / 2 + (lobbyW * i) / 8, GROUND, 0.3, 8.8, 0.4, '#3b4045', 'body', undefined, 0.02);
  fbox(p, 'f', lx, dz, GROUND + 8.6, lobbyW + 0.4, 0.4, 0.4, '#3b4045', 'body', undefined, 0.02);
  p.glowQuad(lx + 0.22, GROUND + 2.2, dz, 4.2, 4.2, 'f', '#d9eef2', '#fff4d8', 'entry', 1.5);
  for (const s of [-1, 1]) fbox(p, 'f', lx, dz + s * (lobbyW / 2 + 1.0), GROUND, 1.5, 8.9, 1.0, '#dccfb2', 'body', undefined, -0.05);
  p.sign(nameKey, 'f', lx, GROUND + 10.65, dz, Math.min(lobbyW - 2, 1.7 * nameItem.aspect), { h: 1.7 });
  const cx1 = P.x1 + 9.6, cw = 22;
  p.span(lx - 0.1, cx1, GROUND + 8.9, GROUND + 9.6, dz - cw / 2, dz + cw / 2, '#efe7d6');
  p.span(lx + 0.4, cx1 + 0.4, GROUND + 9.4, GROUND + 9.8, dz - cw / 2 - 0.4, dz + cw / 2 + 0.4, '#8e8470');
  for (const sz of [-1, 1]) p.box(cx1 - 1.0, GROUND, dz + sz * (cw / 2 - 0.6), 0.9, 8.9, 0.9, '#dccfb2');
  for (let i = 0; i < 4; i++) p.glowBox(lx + 2.3 + i * 2.1, GROUND + 8.82, dz, 0.5, 0.1, 17, '#fff2d6', '#ffe6b8', 'entry', 1.1);
  p.light(lx + 5, 8.8, dz - 6, 13, '#ffe2b8', 0.85, 'facade', 'porte-cochere');
  p.light(lx + 5, 8.8, dz + 6, 13, '#ffe2b8', 0.85, 'facade', 'porte-cochere');

  // ---- podium roof: deck, lawn garden, pool, pergola, glass balustrade
  slab(p, P.x0 + 0.4, P.x1 - 0.4, P.z0 + 0.4, P.z1 - 0.4, D0 + 0.06, '#d8d0bf');
  const gardenZ = [P.z0 + 1.2, T1.z0 - 3.6];
  slab(p, P.x0 + 1.2, P.x1 - 1.2, gardenZ[0], gardenZ[1], D0 + 0.12, LAWN, 0.2);
  for (let i = 0; i < 6; i++) tree(p, P.x0 + 4 + i * ((P.x1 - P.x0 - 8) / 5), gardenZ[0] + 2.4 + (i % 2) * 2.8, 6 + unit('pt' + i) * 3, undefined, D0 + 0.12);
  for (let i = 0; i < 5; i++) bush(p, P.x0 + 6 + i * 7.6, D0 + 0.5, gardenZ[1] - 0.8, 0.9);
  for (const sx of [P.x1 - 12, P.x1 - 3]) for (const sz of [gardenZ[1] - 2.8, gardenZ[1] - 0.6]) p.box(sx, D0 + 0.12, sz, 0.3, 3.2, 0.3, '#a9774a');
  for (let i = 0; i < 6; i++) p.box(P.x1 - 12 + i * 1.8, D0 + 3.3, gardenZ[1] - 1.7, 0.4, 0.2, 3.2, '#b98a5c');
  const px0 = P.x0 + 4.6, px1 = T1.x1 + 0.4, pz0 = T1.z1 + 3.9, pz1 = P.z1 - 2.5;
  pool(p, px0, px1, pz0, pz1, D0 + 0.34, D0 + 0.27, 1.5);
  for (let i = 0; i < 4; i++) lounger(p, px0 + 4 + i * 4.2, pz1 + 0.75, D0 + 0.34, true);
  parasol(p, px0 + 9, pz0 - 0.75, D0 + 0.34); parasol(p, px0 + 17, pz0 - 0.75, D0 + 0.34, '#c9e0d6');
  p.light((px0 + px1) / 2, D0 + 2.6, (pz0 + pz1) / 2, 12, '#8fe6ff', 0.55, 'lamps', 'sky-pool');
  for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
    const z = dz + s * (6 + i * 7);
    p.box(P.x1 - 1.6, D0 + 0.06, z, 1.4, 0.9, 4.0, '#8f6a52'); bush(p, P.x1 - 1.6, D0 + 1.5, z - 1, 0.8); bush(p, P.x1 - 1.6, D0 + 1.5, z + 1, 0.8);
  }
  balustrade(p, lrect(P.x0 - 0.1, P.x1 + 0.1, P.z0 - 0.1, P.z1 + 0.1), D0, 1.4);

  // ---- the shaft: three tiers round a sky-garden floor
  tier(p, T1, 2, kSky, { wall: STONEW, fin: FIN, band: BAND, pier: PIER, balcony: true });
  skyFloor(p, T1, kSky, b);
  tier(p, T2, kSky + 1, kT3, { wall: '#e9dfc9', fin: FIN, band: BAND, pier: PIER, balcony: true });
  tier(p, T3, kT3, nFloors, { wall: STONEW, fin: FIN, band: BAND, pier: PIER, balcony: false });
  const sl = (r, k) => p.span(r.x0 - 0.4, r.x1 + 0.4, b(k) - 0.3, b(k) + 0.4, r.z0 - 0.4, r.z1 + 0.4, '#f1ebdd');
  sl(T1, kSky); sl(T1, kSky + 1); sl(T2, kT3);
  ring(p, T1, T2, b(kSky + 1) + 0.4);
  ring(p, T2, T3, b(kT3) + 0.4);
  // roof: slab with a lit edge, the crown pavilion, spire
  const yTop = b(nFloors);
  p.span(T3.x0 - 0.8, T3.x1 + 0.8, yTop - 0.2, yTop + 0.6, T3.z0 - 0.8, T3.z1 + 0.8, '#f1ebdd');
  const ledY = yTop + 0.6, ex = 0.8;
  p.glowBox(T3.x, ledY, T3.z1 + ex - 0.25, T3.w + 1.1, 0.3, 0.3, '#fff4dc', '#ffd9a0', 'sign', 1.6);
  p.glowBox(T3.x, ledY, T3.z0 - ex + 0.25, T3.w + 1.1, 0.3, 0.3, '#fff4dc', '#ffd9a0', 'sign', 1.6);
  p.glowBox(T3.x1 + ex - 0.25, ledY, T3.z, 0.3, 0.3, T3.d + 1.1, '#fff4dc', '#ffd9a0', 'sign', 1.6);
  p.glowBox(T3.x0 - ex + 0.25, ledY, T3.z, 0.3, 0.3, T3.d + 1.1, '#fff4dc', '#ffd9a0', 'sign', 1.6);
  const cw2 = Math.min(11, T3.d - 6), cd2 = Math.min(10, T3.w - 5), ch = 9;
  const C = lrect(T3.x - 1 - cd2 / 2, T3.x - 1 + cd2 / 2, T3.z - cw2 / 2, T3.z + cw2 / 2);
  const cb = yTop + 0.6, capTop = cb + ch + 0.9;
  p.span(C.x0, C.x1, cb - 0.1, cb + ch, C.z0, C.z1, '#fff0c8', 'glow', { glow: [GLOW.sign, p.slot, 0], emit: '#ffd9a0', power: 0.8 });
  for (const sx of [C.x0, C.x1]) for (const sz of [C.z0, C.z1]) p.box(sx, cb, sz, 1.0, ch + 0.6, 1.0, '#e6dcc6');
  p.span(C.x0 - 1.2, C.x1 + 1.2, cb + ch - 0.2, capTop, C.z0 - 1.2, C.z1 + 1.2, '#f6f0e2');
  p.span(C.x0 - 1.0, C.x1 + 1.0, capTop - 0.1, capTop + 0.35, C.z0 - 1.0, C.z1 + 1.0, '#d8bd6a');
  p.cyl(C.x, capTop, C.z, 0.9, 5, '#e6dcc6', 8, 'body', undefined, 0.35);
  p.cyl(C.x, capTop + 4.8, C.z, 0.18, 14, '#d8bd6a', 6, 'body', undefined, 0.5);
  p.glowBox(C.x, capTop + 18.8, C.z, 0.8, 0.8, 0.8, '#fff0b0', '#ffd870', 'beacon', 2.0);
  for (const face of ['p', 'n', 'b']) {
    const plane = face === 'b' ? C.x0 : face === 'p' ? C.z1 : C.z0, [s0, s1] = face === 'b' ? [C.z0, C.z1] : [C.x0, C.x1];
    for (let a = s0 + 1.6; a < s1 - 1; a += 2.0) fbox(p, face, plane, a, cb + 0.1, 0.35, ch - 0.35, 0.35, '#e6dcc6', 'body', undefined, -0.05);
  }
  const crownKey = 'crown:' + site.id;
  const crownItem = p.b.atlas.text(crownKey, '天璽', { color: '#f4e6bc', background: '#2b2a2c', size: 80, pad: 0.4, radius: 0.12, border: '#d8bd6a' });
  const cw3 = Math.min(cw2 - 1.8, 3.4 * crownItem.aspect);
  p.sign(crownKey, 'f', C.x1, cb + ch / 2, C.z, cw3, { h: cw3 / crownItem.aspect });
  p.light(T3.x1 + 6, yTop - 6, T3.z, 24, '#ffe3b0', 0.7, 'sign', 'crown');
  p.light(C.x, capTop, C.z, 16, '#ffd9a0', 0.55, 'sign', 'crown-top');
}

// A glass balustrade round a rect at height y (runs shortened at the corners so nothing overlaps).
function balustrade(p, r, y, h) {
  const t = 0.12;
  glassBox(p, r.x0 + t, r.x1 - t, y, y + h, r.z1 - t, r.z1);
  glassBox(p, r.x0 + t, r.x1 - t, y, y + h, r.z0, r.z0 + t);
  glassBox(p, r.x1 - t, r.x1, y, y + h, r.z0 + t, r.z1 - t);
  glassBox(p, r.x0, r.x0 + t, y, y + h, r.z0 + t, r.z1 - t);
  const rail = '#8d9298', rh = 0.16;
  p.span(r.x0 - 0.04, r.x1 + 0.04, y + h, y + h + rh, r.z1 - 0.2, r.z1 + 0.04, rail);
  p.span(r.x0 - 0.04, r.x1 + 0.04, y + h, y + h + rh, r.z0 - 0.04, r.z0 + 0.2, rail);
  p.span(r.x1 - 0.2, r.x1 + 0.04, y + h, y + h + rh, r.z0 + 0.2, r.z1 - 0.2, rail);
  p.span(r.x0 - 0.04, r.x0 + 0.2, y + h, y + h + rh, r.z0 + 0.2, r.z1 - 0.2, rail);
}

// The planted terrace on top of a slab, between the slab edge and the next tier.
function ring(p, outer, inner, y) {
  const o = lrect(outer.x0 - 0.4, outer.x1 + 0.4, outer.z0 - 0.4, outer.z1 + 0.4);
  balustrade(p, lrect(o.x0 + 0.1, o.x1 - 0.1, o.z0 + 0.1, o.z1 - 0.1), y, 1.3);
  const strips = [[o.x0 + 0.6, inner.x0 - 0.5, o.z0 + 0.6, o.z1 - 0.6], [inner.x1 + 0.9, o.x1 - 0.6, o.z0 + 0.6, o.z1 - 0.6]];
  for (const [x0, x1, z0, z1] of strips) {
    if (x1 - x0 < 1 || z1 - z0 < 1) continue;
    p.span(x0, x1, y, y + 0.55, z0, z1, '#6f9a52');
    const n = Math.max(1, Math.round((z1 - z0) / 3.2));
    for (let i = 0; i < n; i++) bush(p, (x0 + x1) / 2, y + 0.9, z0 + (z1 - z0) * (i + 0.5) / n, 0.85, i % 2 ? '#5f8a47' : '#7aa35b');
  }
}

// One shaft tier: walls, corner piers, vertical fins, spandrel bands, windows, balconies.
function tier(p, r, k0, k1, o) {
  const yb = GROUND + k0 * FLOOR, yt = GROUND + k1 * FLOOR;
  p.span(r.x0, r.x1, yb - 0.2, yt + 0.1, r.z0, r.z1, o.wall);
  for (const face of FACES) {
    const plane = planeOf(r, face), [s0, s1] = spanOf(r, face), mid = (s0 + s1) / 2, m = 2.5;
    const n = Math.max(1, Math.round((s1 - s0 - 2 * m) / BAY)), step = (s1 - s0 - 2 * m) / n, a0 = s0 + m;
    const frontBack = face === 'f' || face === 'b';
    for (let i = 0; i <= n; i++) fbox(p, face, plane, a0 + i * step, yb - 0.1, 0.45, yt - yb + 0.25, 1.0, o.fin, 'body', undefined, -0.14);
    for (let k = k0; k < k1; k++) {
      const y = GROUND + k * FLOOR;
      if (k > k0) fbox(p, face, plane, mid, y - (frontBack ? 0.45 : 0.4), s1 - s0 + (frontBack ? 0.9 : 0.1), 0.6, 0.3, o.band, 'body', undefined, -0.05);
      for (let i = 0; i < n; i++) {
        const a = a0 + (i + 0.5) * step, seed = p.site.id + face + k + ':' + i;
        const glass = ['#6f97a6', '#7aa3b1', '#678fa0'][Math.floor(unit(seed + 'g') * 3)], light = WARM[Math.floor(unit(seed + 'L') * WARM.length)];
        if (o.balcony && k > k0 && (k + i) % 2 === 0) {
          const L = step - 0.5, depth = 2.0;
          win(p, face, plane, a, y + 2.7, step - 1.5, 4.6, { glass, light, panes: 3, out: 0.07 });
          fbox(p, face, plane, a, y - 0.1, L, 0.4, depth, '#f1ebdd', 'body', undefined, -0.22);
          fbox(p, face, plane, a, y + 0.3, L - 0.2, 1.2, 0.08, '#bfe3ee', 'clear', undefined, depth - 0.2);
          fbox(p, face, plane, a, y + 1.5, L - 0.1, 0.12, 0.14, '#8d9298', 'body', undefined, depth - 0.24);
          for (const s of [-1, 1]) fbox(p, face, plane, a + s * (L / 2 - 0.08), y + 0.3, 0.08, 1.2, depth - 0.3, '#bfe3ee', 'clear', undefined, 0.05);
        } else {
          for (const s of [-1, 1]) win(p, face, plane, a + s * step * 0.26, y + 2.9, step / 2 - 1.1, 3.8, { glass, light, panes: 2, out: 0.07 });
        }
      }
    }
  }
  for (const sx of [r.x0, r.x1]) for (const sz of [r.z0, r.z1]) p.box(sx, yb - 0.25, sz, 1.3, yt - yb + 0.45, 1.3, o.pier);
}

// The sky-garden floor: a glazed core behind a planted ring of columns.
function skyFloor(p, T1, k, b) {
  const y = b(k), yc1 = y + FLOOR - 0.1;
  const core = lrect(T1.x0 + 3.2, T1.x1 - 3.2, T1.z0 + 3.2, T1.z1 - 3.2);
  p.span(core.x0, core.x1, y + 0.2, yc1, core.z0, core.z1, '#e2d3b8');
  for (const face of FACES) {
    const [s0, s1] = spanOf(core, face), plane = planeOf(core, face);
    win(p, face, plane, (s0 + s1) / 2, y + 3.2, s1 - s0 - 3.2, 4.6, { glass: '#a8cdd2', light: '#fff0c8', panes: 4, power: 1.1, out: 0.07 });
  }
  for (const face of FACES) {
    const plane = planeOf(T1, face), [s0, s1] = spanOf(T1, face), m = 2.5;
    const n = Math.max(1, Math.round((s1 - s0 - 2 * m) / BAY)), step = (s1 - s0 - 2 * m) / n;
    for (let i = 0; i <= n; i++) fbox(p, face, plane, s0 + m + i * step, y + 0.2, 0.7, FLOOR - 0.2, 0.7, '#f4efe5', 'body', undefined, -0.9);
  }
  const top = y + 0.4;
  p.span(T1.x0 + 0.6, T1.x1 - 0.6, top - 0.1, top + 0.3, T1.z0 + 0.6, T1.z1 - 0.6, '#6f9a52');   // planted floor
  const W = T1.w - 3.8, D = T1.d - 3.8, per = 2 * (W + D);
  for (let i = 0; i < 14; i++) {
    let s = (i / 14) * per, x, z;
    if (s < W) { x = T1.x0 + 1.9 + s; z = T1.z0 + 1.9; }
    else if ((s -= W) < D) { x = T1.x1 - 1.9; z = T1.z0 + 1.9 + s; }
    else if ((s -= D) < W) { x = T1.x1 - 1.9 - s; z = T1.z1 - 1.9; }
    else { s -= W; x = T1.x0 + 1.9; z = T1.z1 - 1.9 - s; }
    tree(p, x, z, 4.2, undefined, top + 0.3);
  }
}
