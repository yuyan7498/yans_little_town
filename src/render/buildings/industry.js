// Industry: 工匠工坊 (a workshop with roll-up doors and a car on a lift), 鎮北物流中心 (a
// warehouse with loading docks and box trucks) and 果菜批發市場 (a large open market shed).
// The workshop and the depot are walled compounds with a gate; the market is an open plot.
// Everything is laid out from the plot, footprint, gate and annex rectangles.

import { Builder, GROUND as G, lrect, grow, UNIT_SHAPES as U } from './b-kit.js';
import { COL, compoundWall, gateway, tree, lamp, bench, car, boxTruck, bin } from './b-parts.js';
import { unit } from '../../core/random.js';

const KINDS = ['workshop', 'depot', 'market'];
const STEEL = '#7f8d99', CONCRETE = '#c9c3b6', PRODUCE = ['#e8892b', '#c9483b', '#6aa84f', '#f0c03a', '#8d5aa6', '#e9e2cf'];

export function create({ world, quality = 'full' }) {
  const b = new Builder({ world, quality });
  for (const site of world.siteList) {
    if (!KINDS.includes(site.kind)) continue;
    const board = { workshop: '#c9692f', depot: '#1f4f8f', market: '#2f7a4a' }[site.kind];
    b.atlas.text('name:' + site.id, site.name, { background: board, color: '#ffffff', size: 96, pad: 0.22, border: '#ffffff' });
    ({ workshop, depot, market })[site.kind](b, site, board);
  }
  const out = b.finish('industry');
  return { group: out.group, update: out.update, dispose: out.dispose, lights: out.lights, info: out.info };
}

export const preview = ctx => create(ctx);

const entranceOf = (f, site) => f.point(site.entrance) || f.point(site.door) || { x: f.foot.x1, z: f.foot.z };
const clear = (obstacles, x, z, r) => obstacles.every(o => x + r < o.x0 || x - r > o.x1 || z + r < o.z0 || z - r > o.z1);

// A roll-up door: slatted panel in a frame (closed), or rolled up leaving the opening.
function rollUp(p, x, z, w, h, color = '#aeb4b9', frame = '#e0762c') {
  p.span(x - 0.1, x + 0.4, G, G + h + 0.5, z - w / 2 - 0.5, z - w / 2, frame).span(x - 0.1, x + 0.4, G, G + h + 0.5, z + w / 2, z + w / 2 + 0.5, frame);
  p.span(x - 0.1, x + 0.4, G + h, G + h + 0.5, z - w / 2, z + w / 2, frame);
  p.span(x, x + 0.14, G, G + h, z - w / 2, z + w / 2, color);
  for (let k = 1; k < 6; k++) p.span(x + 0.1, x + 0.2, G + k * h / 6 - 0.07, G + k * h / 6 + 0.07, z - w / 2, z + w / 2, '#8b9298');
}

// A stack of produce crates.
function crates(p, x, z, nx, nz, levels, seed) {
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const lv = Math.max(1, levels - Math.floor(unit(seed + i + ':' + j) * 2));
    const c = PRODUCE[Math.floor(unit(seed + 'c' + i + j) * PRODUCE.length)];
    for (let k = 0; k < lv; k++) {
      const cx = x + i * 2.5, cz = z + j * 2.0;
      p.box(cx, G + k * 1.45, cz, 2.3, 1.3, 1.8, '#c8a06a');
      p.box(cx, G + k * 1.45 + 1.0, cz, 2.1, 0.5, 1.6, c);
    }
  }
}

function pallets(p, x, z, n, ry = 0) {
  p.at(x, G, z, ry, q => {
    for (let i = 0; i < n; i++) {
      q.box(0, 0, i * 3.2, 2.8, 0.45, 2.8, '#b88a55');
      q.box(0, 0.45, i * 3.2, 2.5, 2.6 + (i % 2) * 0.8, 2.5, i % 2 ? '#d9b36a' : '#e9e2cf');
    }
  });
}

function drum(p, x, z, color = '#2f62a8') { return p.cyl(x, G, z, 0.8, 2.3, color, 10).cyl(x, G + 2.3, z, 0.82, 0.12, '#222', 10); }

// ------------------------------------------------------------------ workshop
function workshop(b, site, board) {
  const p = b.site(site), f = p.f, a = f.area, foot = f.foot, ent = entranceOf(f, site);
  const gate = f.point(site.gate) || { x: a.x1, z: ent.z };
  const x0 = foot.x0, x1 = foot.x1, z0 = foot.z0, z1 = foot.z1, zc = ent.z, orange = '#e0762c';
  const hall = '#dcd8cc', HH = 9, bayD = Math.min(9, (x1 - x0) * 0.4), gateW = Math.min(14, a.d * 0.3);
  p.pad(a.x0 + 0.4, a.x1 - 0.4, a.z0 + 0.4, a.z1 - 0.4, '#a29f97', G + 0.05);
  compoundWall(p, { style: 'solid', color: '#c4beb2', cap: '#e0dcd0', h: 3.8, gaps: [[gate.z - gateW / 2 - 0.9, gate.z + gateW / 2 + 0.9, true]] });
  gateway(p, { z: gate.z, w: gateW, key: 'name:' + site.id, pier: '#c4beb2', board, leaf: '#6f777e' });

  // The hall, with a hollow service bay on the right of the entrance (a car on a lift) and a
  // closed roll-up door on the left.
  const bw = 6.6, bg = 5.8;                                   // bay width, gap from centre
  const bz0 = Math.min(z1 - 2, zc + bg), bz1 = Math.min(z1 - 0.8, bz0 + bw);
  p.span(x0, x1 - bayD, G, G + HH, z0, z1, hall);
  p.span(x1 - bayD, x1, G, G + HH, z0, bz0, hall);
  p.span(x1 - bayD, x1, G, G + HH, bz1, z1, hall);
  p.span(x1 - bayD, x1, G + 6.6, G + HH, bz0, bz1, hall);
  p.span(x0 - 0.2, x1 + 0.2, G, G + 1.0, z0 - 0.2, z1 + 0.2, '#a6a195');
  p.span(x0 - 0.2, x1 + 0.2, G + HH - 1.4, G + HH - 0.7, z0 - 0.2, z1 + 0.2, orange);
  p.span(x0 - 0.5, x1 + 0.5, G + HH, G + HH + 0.5, z0 - 0.5, z1 + 0.5, '#cfcabd');
  p.wedge((x0 + x1) / 2, G + HH + 0.5, (z0 + z1) / 2, x1 - x0 + 0.6, 3.4, z1 - z0 + 0.6, STEEL, 0, 'body');
  for (let i = 0; i < 5; i++) p.box(x0 + (x1 - x0) * (0.2 + 0.13 * i), G + HH + 0.5 + 3.3 - Math.abs(0.5 - (0.2 + 0.13 * i)) * 6.4, z0 + 5, 1.6, 0.35, 5, '#b9d3e0');
  // The bay: lit interior, a lift with a car raised on it.
  p.span(x1 - bayD + 0.05, x1 - bayD + 0.2, G, G + 6.6, bz0, bz1, '#40454a');
  p.glowQuad(x1 - bayD + 0.25, G + 3.4, (bz0 + bz1) / 2, bz1 - bz0 - 0.4, 6.4, 'f', '#4a5258', '#ffe8c0', 'entry', 0.9);
  p.glowBox(x1 - bayD / 2, G + 6.35, (bz0 + bz1) / 2, bayD - 2, 0.25, 0.6, '#fff4d8', '#fff0cf', 'entry', 1.6);
  p.span(x1 - bayD, x1, G, G + 0.12, bz0, bz1, '#7d7b75');
  const lz = (bz0 + bz1) / 2, lx = x1 - bayD / 2 - 0.2;
  for (const s of [-1, 1]) p.box(lx - 1.2, G + 0.1, lz + s * 2.5, 0.5, 5.4, 0.5, orange).box(lx + 1.2, G + 0.1, lz + s * 2.5, 0.5, 5.4, 0.5, orange);
  p.at(0, 2.7, 0, 0, q => car(q, lx, lz, 0, '#3e6fa8'));
  p.span(x1 - 0.1, x1 + 0.4, G + 6.6, G + 7.2, bz0 - 0.5, bz1 + 0.5, orange);
  p.span(x1, x1 + 0.4, G, G + 6.6, bz0 - 0.5, bz0, orange); p.span(x1, x1 + 0.4, G, G + 6.6, bz1, bz1 + 0.5, orange);
  p.span(x1 - 0.1, x1 + 0.3, G + 6.0, G + 6.6, bz0, bz1, '#8b9298');
  const cz0 = Math.max(z0 + 1.5, zc - bg - bw);
  rollUp(p, x1 + 0.05, (cz0 + (zc - bg)) / 2, zc - bg - cz0, 6.2, '#aeb4b9', orange);
  // The office on top of the entrance: glazed band, name sign, canopy, personnel door.
  const tw = 11;
  p.span(x1 - bayD, x1 + 0.05, G + HH, G + HH + 4.2, zc - tw / 2, zc + tw / 2, '#e8e4da');
  p.span(x1 - bayD - 0.4, x1 + 0.4, G + HH + 4.2, G + HH + 4.8, zc - tw / 2 - 0.4, zc + tw / 2 + 0.4, '#cfcabd');
  p.sign('name:' + site.id, 'f', x1 + 0.1, G + HH + 2.2, zc, tw - 1.4, { h: 2.1, channel: 'sign', power: 0.9 });
  p.span(x1, x1 + 0.45, G + 7.2, G + 7.6, zc - 3.6, zc + 3.6, orange);
  p.glowQuad(x1 + 0.06, G + 2.4, zc, 3.4, 4.4, 'f', '#4f7f94', '#fff0cf', 'entry', 1.15);
  p.span(x1, x1 + 3.2, G + 5.6, G + 6.0, zc - 3, zc + 3, '#8b9298');
  p.windows('f', x1 + 0.45, zc - 4.6, zc - 1.2, { y0: G + 5.4, floors: 1, sill: 0.4, h: 1.4, w: 2.4, pitch: 3.4, panes: 1 });
  p.windows('p', z1, x0 + 2, x1 - 2, { y0: G + 5.2, floors: 1, sill: 0, h: 1.8, w: 3.4, pitch: 5, panes: 2 });
  p.windows('n', z0, x0 + 2, x1 - 2, { y0: G + 5.2, floors: 1, sill: 0, h: 1.8, w: 3.4, pitch: 5, panes: 2 });
  p.windows('b', x0, z0 + 2, z1 - 2, { y0: G + 5.2, floors: 1, sill: 0, h: 1.8, w: 3.4, pitch: 5, panes: 2 });
  // Roof stack and vents.
  p.cyl(x0 + 5, G + HH + 0.5, z1 - 6, 0.9, 9, '#a6a195', 8); p.cyl(x0 + 10, G + HH + 3.8, z0 + 7, 1.3, 1.2, '#8b9298', 8);
  // The yard: a lean-to with a car, parked cars, drums, tyres, pallets.
  const obs = f.annexes.map(r => grow(r, 2));
  const side = (a.z1 - z1) >= (z0 - a.z0) ? 1 : -1, sz = side > 0 ? z1 + 5.5 : z0 - 5.5;
  const yx = (x1 + a.x1) / 2;
  if (Math.abs(a.z1 - z1) > 8 || Math.abs(z0 - a.z0) > 8) {
    p.span(x0 + 3, x0 + 20, G + 5.6, G + 6.1, sz - 4.2, sz + 4.2, '#8b9298');
    for (const xx of [x0 + 3.4, x0 + 19.6]) for (const zz of [sz - 3.8, sz + 3.8]) p.box(xx, G, zz, 0.4, 5.6, 0.4, orange);
    car(p, x0 + 11, sz, Math.PI / 2, '#c9483b');
  }
  const park = [['#e9e6df', 0], ['#3e6fa8', 1], ['#38393d', 2]];
  for (const [col, i] of park) { const z = zc - 13 + i * 5; if (clear(obs, x1 + 8, z, 5)) car(p, x1 + 8.5, z, Math.PI, col); }
  for (const [x, z] of [[x1 + 5, zc + 15], [x1 + 6.4, zc + 15.8], [x1 + 5.4, zc + 17.2]]) if (clear(obs, x, z, 2)) drum(p, x, z, ['#2f62a8', '#c9483b', '#d6b02a'][Math.floor(x * 7) % 3]);
  if (clear(obs, x1 + 12, zc + 16, 4)) pallets(p, x1 + 12, zc + 14, 2, Math.PI / 2);
  lamp(p, x1 + 3, zc + 8.5, { h: 9, radius: 18 }); lamp(p, a.x1 - 5, gate.z - 8, { h: 8 }); lamp(p, a.x1 - 5, gate.z + 8, { h: 8 });
  p.light(x1 + 3, G + 7, zc, 16, '#fff0cf', 0.6, 'facade', 'entrance');
  void tree; void bench; void bin; void yx; void lrect;
}

// ------------------------------------------------------------------ depot
function depot(b, site, board) {
  const p = b.site(site), f = p.f, a = f.area, foot = f.foot, ent = entranceOf(f, site);
  const gate = f.point(site.gate) || { x: a.x1, z: ent.z };
  const x0 = foot.x0, x1 = foot.x1, z0 = foot.z0, z1 = foot.z1, zc = ent.z, HH = 12, blue = '#1f4f8f';
  const dockX = x1 - 6, gateW = Math.min(14, a.d * 0.3);
  const obs = f.annexes.map(r => grow(r, 2.5));
  p.pad(a.x0 + 0.4, a.x1 - 0.4, a.z0 + 0.4, a.z1 - 0.4, '#8e8c86', G + 0.05);
  compoundWall(p, { style: 'solid', color: '#c4beb2', cap: '#e0dcd0', h: 3.8, gaps: [[gate.z - gateW / 2 - 0.9, gate.z + gateW / 2 + 0.9, true], ...(site.annexes || []).map(id => { const d = b.world.site(id) && b.world.site(id).door; const q = d && f.point(d); return q ? [q.z - 3, q.z + 3, false] : null; }).filter(Boolean)] });
  gateway(p, { z: gate.z, w: gateW, key: 'name:' + site.id, pier: '#c4beb2', board, leaf: '#6f777e' });
  // The warehouse: a long hall with a shallow roof, docks on its recessed front.
  p.span(x0, dockX, G, G + HH, z0, z1, '#e4e1d8');
  p.span(x0 - 0.2, dockX + 0.2, G, G + 1.2, z0 - 0.2, z1 + 0.2, '#a6a195');
  p.span(x0 - 0.3, dockX + 0.3, G + HH, G + HH + 0.9, z0 - 0.3, z1 + 0.3, '#bfc4c8');
  p.span(x0 + 1, dockX - 1, G + HH + 0.9, G + HH + 1.1, z0 + 1, z1 - 1, '#9aa1a8');
  for (let i = 0; i < 4; i++) p.box(x0 + 5 + i * 4.5, G + HH + 1.1, (z0 + z1) / 2 + (i % 2 ? 6 : -6), 2.6, 1.2, 2.6, '#c8ccd0');
  p.span(x0 - 0.3, dockX + 0.3, G + HH - 3.2, G + HH - 2.4, z0 - 0.3, z1 + 0.3, blue);
  // Dock doors with bumpers and a canopy, either side of the office.
  const ow = 14;
  p.span(dockX, x1, G, G + HH + 2.0, zc - ow / 2, zc + ow / 2, '#ebe7dc');
  p.span(dockX - 0.3, x1 + 0.3, G + HH + 2.0, G + HH + 2.7, zc - ow / 2 - 0.3, zc + ow / 2 + 0.3, '#bfc4c8');
  p.span(dockX - 0.3, x1 + 0.3, G + 7.0, G + 7.5, zc - ow / 2 - 0.3, zc + ow / 2 + 0.3, blue);
  p.glowQuad(x1 + 0.06, G + 2.4, zc, 3.8, 4.4, 'f', '#4f7f94', '#fff0cf', 'entry', 1.15);
  p.span(x1, x1 + 3.4, G + 5.6, G + 6.0, zc - 3.4, zc + 3.4, '#8b9298');
  p.windows('f', x1, zc - 6, zc + 6, { y0: G + 7.5, floors: 1, sill: 0.6, h: 3.0, w: 3, pitch: 4, panes: 2 });
  p.sign('name:' + site.id, 'f', x1 + 0.1, G + HH - 0.1, zc, ow - 1.2, { h: 2.4, channel: 'sign', power: 0.9 });
  const docks = [];
  for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
    const z = zc + s * (ow / 2 + 5 + i * 6);
    if (z + 2.7 > z1 - 0.5 || z - 2.7 < z0 + 0.5) continue;
    docks.push(z);
    p.span(dockX, dockX + 0.2, G + 0.6, G + 5.8, z - 2.5, z + 2.5, '#9ca3a9');
    for (let k = 1; k < 5; k++) p.span(dockX + 0.15, dockX + 0.25, G + 0.6 + k * 1.04, G + 0.65 + k * 1.04, z - 2.45, z + 2.45, '#7f868c');
    p.span(dockX, dockX + 0.5, G, G + 6.2, z - 2.9, z - 2.5, '#f0c03a'); p.span(dockX, dockX + 0.5, G, G + 6.2, z + 2.5, z + 2.9, '#f0c03a');
    p.box(dockX + 0.45, G + 1.2, z - 2, 0.4, 1.4, 0.8, '#222').box(dockX + 0.45, G + 1.2, z + 2, 0.4, 1.4, 0.8, '#222');
    p.glowBox(dockX + 0.2, G + 6.8, z, 0.5, 0.4, 3.2, '#e9e5da', '#ffe2b0', 'entry', 1.3);
  }
  p.windows('p', z1, x0 + 2, dockX - 2, { y0: G + 6, floors: 1, sill: 0, h: 2, w: 3.4, pitch: 5, panes: 2 });
  p.windows('n', z0, x0 + 2, dockX - 2, { y0: G + 6, floors: 1, sill: 0, h: 2, w: 3.4, pitch: 5, panes: 2 });
  // Box trucks backed onto the docks, a guard booth, container stacks, pallets, yard masts.
  const cols = [['#f3f1ea', '#3e6fa8'], ['#f3f1ea', '#c9483b'], ['#d6e1ea', '#2f7a4a'], ['#f3f1ea', '#e0762c']];
  docks.forEach((z, i) => { if (i % 3 !== 2 && clear(obs, dockX + 9, z, 5)) boxTruck(p, dockX + 7.3, z, 0, cols[i % 4][0], { cab: cols[i % 4][1], stripe: cols[i % 4][1], len: 8.6 }); });
  const bx = a.x1 - 4, bzs = gate.z + gateW / 2 + 4;
  if (clear(obs, bx, bzs, 3) && bzs < a.z1 - 2) { p.span(bx - 1.6, bx + 1.6, G, G + 4.4, bzs - 1.6, bzs + 1.6, '#f0ece0').span(bx - 2, bx + 2, G + 4.4, G + 4.9, bzs - 2, bzs + 2, blue); p.windows('f', bx + 1.6, bzs - 1, bzs + 1, { floors: 1, sill: 1.4, h: 1.8, w: 1.8, pitch: 2, panes: 1 }); }
  if (clear(obs, x1 + 14, zc - 14, 6)) { container(p, x1 + 12, zc - 15, '#c9483b'); container(p, x1 + 12, zc - 19.5, '#2f62a8'); }
  if (clear(obs, x1 + 12, zc + 15, 6)) pallets(p, x1 + 12, zc + 14, 3, Math.PI / 2);
  for (const [x, z] of [[x1 + 3, zc - 10], [x1 + 3, zc + 10], [a.x1 - 3.5, gate.z - 9]]) lamp(p, x, z, { h: 10, radius: 20, intensity: 0.65 });
  p.light(x1 + 3, G + 7, zc, 16, '#fff0cf', 0.6, 'facade', 'entrance');
  void tree; void car; void bin; void bench; void lrect;
}

function container(p, x, z, color) {
  p.box(x, G, z, 3.6, 3.6, 12, color);
  for (let i = 0; i < 9; i++) p.box(x + 1.82, G + 0.2, z - 5.4 + i * 1.35, 0.1, 3.2, 0.25, '#5c5c5c');
  p.box(x, G + 3.6, z, 3.7, 0.15, 12.1, '#e9e5da');
}

// ------------------------------------------------------------------ market
function market(b, site, board) {
  const p = b.site(site), f = p.f, a = f.area, foot = f.foot, ent = entranceOf(f, site);
  const x0 = foot.x0, x1 = foot.x1, z0 = foot.z0, z1 = foot.z1, zc = (z0 + z1) / 2, RH = 8.4;
  const green = '#2f7a4a', obs = f.annexes.map(r => grow(r, 2));
  p.pad(a.x0 + 0.4, a.x1 - 0.4, a.z0 + 0.4, a.z1 - 0.4, '#b9b3a6', G + 0.05);
  p.pad(x0, x1, z0, z1, '#cbc5b8', G + 0.1);
  // The cold store and office block at the back.
  const bd = Math.min(8, (x1 - x0) * 0.28);
  p.span(x0, x0 + bd, G, G + 12, z0, z1, '#e6e2d6');
  p.span(x0 - 0.3, x0 + bd + 0.3, G + 12, G + 12.8, z0 - 0.3, z1 + 0.3, '#bfc4c8');
  p.span(x0 - 0.1, x0 + bd + 0.1, G + 8.6, G + 9.4, z0 - 0.1, z1 + 0.1, green);
  const nb = Math.max(2, Math.round((z1 - z0) / 7));
  for (let i = 0; i < nb; i++) {
    const zz = z0 + (z1 - z0) * (i + 0.5) / nb;
    p.span(x0 + bd, x0 + bd + 0.12, G + 0.1, G + 5.4, zz - 2.3, zz + 2.3, '#aeb4b9');
    for (let k = 1; k < 5; k++) p.span(x0 + bd + 0.1, x0 + bd + 0.18, G + 0.1 + k * 1.06, G + 0.15 + k * 1.06, zz - 2.25, zz + 2.25, '#8a9096');
    p.span(x0 + bd, x0 + bd + 0.3, G + 5.4, G + 5.8, zz - 2.8, zz + 2.8, green);
  }
  p.windows('p', z1, x0 + 1.5, x0 + bd - 1.5, { y0: G + 6, floors: 1, sill: 0.8, h: 2.2, w: 2.4, pitch: 3, panes: 1 });
  p.windows('n', z0, x0 + 1.5, x0 + bd - 1.5, { y0: G + 6, floors: 1, sill: 0.8, h: 2.2, w: 2.4, pitch: 3, panes: 1 });
  // The open shed: rows of slim columns, a deep fascia carrying the name, a pale gable roof.
  const sx0 = x0 + bd, sx1 = x1 + 1.5;
  const cn = Math.max(3, Math.round((z1 - z0) / 6.5)), rows = Math.max(2, Math.round((sx1 - sx0) / 8));
  for (let i = 0; i <= cn; i++) for (let r = 1; r <= rows; r++) {
    p.box(sx0 + (sx1 - sx0) * r / rows, G + 0.1, z0 + (z1 - z0) * i / cn, 0.7, RH, 0.7, '#9ca3a9');
  }
  p.span(sx0, sx1 + 0.5, G + RH, G + RH + 0.8, z0 - 0.5, z1 + 0.5, '#d8d6cd');
  p.wedge((sx0 + sx1) / 2 + 0.2, G + RH + 0.8, zc, sx1 - sx0 + 1.8, 3.6, z1 - z0 + 1.2, '#eceae2', 0, 'body');
  for (let i = 0; i < cn * 2; i++) p.box((sx0 + sx1) / 2 + 0.2, G + RH + 4.2 - 0.0, z0 + (z1 - z0) * (i + 0.5) / (cn * 2), 1.2, 0.3, 2.6, '#bcd9e6');
  p.span(sx1 - 0.1, sx1 + 0.6, G + RH - 2.4, G + RH, z0 - 0.5, z1 + 0.5, green);
  p.sign('name:' + site.id, 'f', sx1 + 0.65, G + RH - 1.2, zc, Math.min(26, z1 - z0 - 2), { h: 2.0, channel: 'sign', power: 0.9 });
  // Under the roof: stalls with striped awnings, produce crates, a weighing scale, hanging lamps.
  const lanes = 3, stallX0 = sx0 + 3.2, stallX1 = sx1 - 3.2;
  for (let l = 0; l < lanes; l++) {
    const z = z0 + (z1 - z0) * (l + 0.5) / lanes;
    if (Math.abs(z - zc) < 0.1 && false) continue;
    const nstall = Math.max(1, Math.floor((stallX1 - stallX0) / 8));
    for (let i = 0; i < nstall; i++) {
      const x = stallX0 + (i + 0.5) * (stallX1 - stallX0) / nstall;
      if (Math.abs(z - ent.z) < 3.6) continue;                                   // keep the walk-in aisle clear
      const col = ['#e8892b', '#c9483b', '#3f8f88', '#f0c03a'][(l + i) % 4];
      p.box(x, G + 0.1, z, 5.6, 1.6, 2.6, '#a7774f').box(x, G + 1.7, z, 5.8, 0.25, 2.8, '#d9b36a');
      crates(p, x - 2.2, z - 0.7, 2, 1, 2, site.id + l + ':' + i);
      for (const s of [-1, 1]) p.box(x + s * 2.7, G + 0.1, z - 1.2, 0.2, 5, 0.2, '#8b9298');
      p.span(x - 3, x + 3, G + 5, G + 5.3, z - 1.9, z + 1.1, col);
      p.span(x - 3, x + 3, G + 5.3, G + 6.2, z - 1.9, z - 1.6, '#f3f0e6');
      p.glowBox(x, G + RH - 1.0, z, 0.6, 0.6, 0.6, '#f5f0e0', '#ffe2b0', 'lamps', 1.5);
    }
  }
  p.light((sx0 + sx1) / 2, G + RH - 1, zc, 24, '#ffe2b0', 0.6, 'lamps', 'shed');
  // The forecourt: crate stacks, pallets, trucks being loaded, a lamp or two.
  const ya = x1 + 6;
  if (clear(obs, ya + 4, zc - 12, 8)) { crates(p, ya, zc - 16, 3, 2, 3, 'f1'); }
  if (clear(obs, ya + 4, zc + 12, 8)) { crates(p, ya, zc + 11, 3, 2, 3, 'f2'); }
  const tz = z1 + 4.5 < a.z1 - 3 ? z1 + 4.5 : z0 - 4.5;
  if (Math.abs(tz) < 1000 && clear(obs, x1 - 4, tz, 5)) boxTruck(p, x1 - 3, tz, Math.PI / 2 * 1, '#f3f1ea', { cab: '#6aa84f', len: 8.6 });
  const tz2 = tz === z1 + 4.5 ? z0 - 4.5 : z1 + 4.5;
  if (tz2 > a.z0 + 3 && tz2 < a.z1 - 3 && clear(obs, x1 - 4, tz2, 5)) boxTruck(p, x1 - 3, tz2, -Math.PI / 2, '#f3f1ea', { cab: '#e0762c', len: 8.6 });
  pallets(p, ya + 2, zc + 3, 2, Math.PI / 2);
  for (const [x, z] of [[x1 + 4, zc - 9], [x1 + 4, zc + 9], [a.x1 - 6, zc - 12], [a.x1 - 6, zc + 12]]) lamp(p, x, z, { h: 9, radius: 20, intensity: 0.65 });
  p.light(x1 + 2, G + 7, ent.z, 16, '#ffe2b0', 0.55, 'facade', 'entrance');
  for (const s of [-1, 1]) tree(p, a.x0 + 3.5, zc + s * (z1 - z0) / 2 - s * 1, 1.0);
  void bin; void car; void bench; void lrect; void U; void COL;
}
