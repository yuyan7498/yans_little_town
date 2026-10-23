// Office towers (kind 'tower'): four facade styles by `style`, a lobby with canopy at the
// door, shopfronts round the base, rooftop plant, and the bank (`c-bank`) as the lowest
// three floors of its host tower. The `helipad` tower keeps a clear flat deck at
// `site.roof` for the helicopter (drawn by the landmarks module).

import { unit } from '../../core/random.js';
import { Builder, GROUND } from './a-kit.js';
import { FACES, FLOOR, acUnit, balcony, bush, entrance, fbox, normalOf, parapet, planeOf, planter, railing, roofKit, shopOf, shopfront, spanOf, tree, win, windowGrid, WARM } from './a-parts.js';


export function create({ world, quality = 'full' }) {
  const b = new Builder({ world, quality });
  for (const site of world.siteList) {
    if (site.kind !== 'tower') continue;
    const bankSite = site.annexes.map(id => world.site(id)).find(a => a && a.placement === 'podium');
    const p = b.site(site), bp = bankSite ? b.site(bankSite) : null;
    (STYLES[site.style] || STYLES.fins)(p, site, bp, bankSite);
  }
  return b.finish('towers');
}
export const preview = ctx => create(ctx);

// ------------------------------------------------------------------ shared pieces
const topOf = site => GROUND + site.floors * FLOOR;
const doorZ = p => p.f.point(p.site.door).z;

// A thin antenna with a red beacon.
function mast(p, x, y, z, h = 9) {
  p.cyl(x, y, z, 0.22, h, '#8c949b', 6, 'body', undefined, 0.5);
  p.glowBox(x, y + h, z, 0.7, 0.7, 0.7, '#a02620', '#ff3b30', 'beacon', 1.6);
}

// Horizontal louvres over a plant floor, the mechanical storey under a roof.
function louvres(p, r, y0, y1, color = '#7d858c', skipFront = false) {
  for (const face of FACES) {
    if (skipFront && face === 'f') continue;
    const plane = planeOf(r, face), [s0, s1] = spanOf(r, face), mid = (s0 + s1) / 2;
    for (let y = y0 + 0.9; y < y1 - 0.6; y += 0.85) fbox(p, face, plane, mid, y, s1 - s0 - 3.2, 0.22, 0.28, color);
  }
}

// The tower's parapet + roof plant, on a roof rect at height y.
function roofTop(p, r, y, o = {}) {
  parapet(p, r, y, 1.2, 0.5, o.wall || '#d8d2c6', { top: o.cap || '#8e8a82' });
  roofKit(p, { x0: r.x0 + 1, x1: r.x1 - 1, z0: r.z0 + 1, z1: r.z1 - 1, w: r.w - 2, d: r.d - 2, x: r.x, z: r.z }, y, { tanks: o.tanks ?? 0, acs: o.acs ?? 4, solar: o.solar ?? 0, salt: o.salt });
  mast(p, r.x - r.w * 0.2, y, r.z + r.d * 0.2, o.mast ?? 9);
}

// The ground floor: stone base with shopfronts on every side, the lobby with canopy at
// the door, a name plate over it, corner piers and a cornice.
function groundFloor(p, site, F, o = {}) {
  const dz = doorZ(p), y1 = GROUND + FLOOR, wall = o.wall || '#59606a';
  p.span(F.x0, F.x1, GROUND, y1, F.z0, F.z1, wall);
  const lobby = [dz - 5.2, dz + 5.2];
  let k = 0;
  for (const face of FACES) {
    const plane = planeOf(F, face), [s0, s1] = spanOf(F, face);
    let gaps = face === 'f' ? [lobby] : [];
    if (o.skipFace && o.skipFace(face)) continue;
    let from = s0 + 1.5;
    const runs = [];
    for (const [g0, g1] of gaps.concat([[s1 + 1.5, s1 + 2]])) { if (g0 - from >= 6) runs.push([from, g0 - 0.4]); from = g1 + 0.4; }
    for (const [a0, a1] of runs) {
      const n = Math.ceil((a1 - a0) / 13), w = (a1 - a0) / n;
      for (let i = 0; i < n; i++) shopfront(p, face, plane, a0 + i * w, a0 + (i + 1) * w - (i < n - 1 ? 0.3 : 0), shopOf(site, k++), { y0: GROUND });
    }
    // cornice over the shops
    fbox(p, face, plane, (s0 + s1) / 2, y1 - 0.25, s1 - s0 + 0.6, 0.5, 0.6, o.trim || '#e6dfd2', 'body', undefined, -0.05);
  }
  const pier = o.pier || '#cfc8bb';
  for (const sx of [F.x0, F.x1]) for (const sz of [F.z0, F.z1]) p.box(sx, GROUND, sz, 1.6, FLOOR - 0.1, 1.6, pier);
  entrance(p, 'f', F.x1, dz, { w: 9.5, y: 4.9, trim: o.canopyTrim, slab: o.canopy });
  // name plate above the canopy
  const key = 'name:' + site.id;
  const item = p.b.atlas.text(key, site.name, { color: o.nameInk || '#ffffff', background: o.nameBg || '#2f4558', size: 60, pad: 0.4, radius: 0.3 });
  const w = Math.min(14, 1.6 * item.aspect);
  p.sign(key, 'f', F.x1 + 0.05, y1 + 1.9, dz, w, { h: w / item.aspect });
  // floodlights at the two front corners, shining up the facade
  for (const z of [F.z0 + 2, F.z1 - 2]) p.light(F.x1 + 3, 3, z, 13, '#ffe4b8', 0.5, 'facade', 'floodlight');
  return { dz, lobbyW: 7, signHalf: w / 2 + 0.8 };
}

// Windows must keep clear of the name plate on the floor above the lobby.
const clearOfPlate = (dz, half) => info => info.face === 'f' && info.f === 1 && Math.abs(info.a - dz) < half;

// ------------------------------------------------------------------ 'fins': glass and vertical fins
function fins(p, site) {
  const F = p.f.foot, top = topOf(site), y1 = GROUND + FLOOR;
  const g = groundFloor(p, site, F, { wall: '#4b5560', nameBg: '#294b60' });
  p.span(F.x0, F.x1, y1, top, F.z0, F.z1, '#4b6c7c');
  const last = site.floors - 1;
  for (const face of FACES) {
    const plane = planeOf(F, face);
    const grid = windowGrid(p, F, face, { floor0: 1, floor1: last, pitch: 3.2, w: 2.75, h: 3.8, sill: 1.0, margin: 1.7, panes: 2,
      glass: ['#78aec6', '#84b9ce', '#6ba2ba'], light: WARM, skip: clearOfPlate(g.dz, g.signHalf) });
    for (let i = 0; i <= grid.n; i++) fbox(p, face, plane, grid.a0 + i * grid.step, y1, 0.36, top - y1 + 1.6, 0.95, '#e9eef0');
  }
  louvres(p, F, GROUND + last * FLOOR, top);
  for (const sx of [F.x0, F.x1]) for (const sz of [F.z0, F.z1]) p.box(sx, y1, sz, 1.9, top - y1 + 1.6, 1.9, '#cfd8dc');
  if (site.helipad) {
    // Clear flat deck for the helicopter, level with `site.roof`.
    const y = site.roof.y, d = 1.3;
    p.span(F.x0 + 0.3, F.x1 - 0.3, top, y, F.z0 + 0.3, F.z1 - 0.3, '#c9ced2');
    p.span(F.x0 - 0.2, F.x1 + 0.2, top - 0.2, top + 0.25, F.z0 - 0.2, F.z1 + 0.2, '#e9eef0');
    for (const sx of [F.x0 + 1.2, F.x1 - 1.2]) for (const sz of [F.z0 + 1.2, F.z1 - 1.2]) p.glowBox(sx, y, sz, 0.5, 0.35, 0.5, '#e8e0c0', '#fff0b0', 'beacon', 1.8);
    void d;
  } else roofTop(p, F, top, { wall: '#d9dee0' });
}

// ------------------------------------------------------------------ 'bands': warm stone bands (and the bank podium)
const BANK_FLOORS = 3;
function bands(p, site, bp, bankSite) {
  const F = p.f.foot, top = topOf(site);
  const podium = bp ? GROUND + BANK_FLOORS * FLOOR : GROUND + FLOOR;
  let g = { dz: doorZ(p), signHalf: 7 };
  if (bp) {
    bankPodium(p, bp, site, bankSite);
  } else g = groundFloor(p, site, F, { wall: '#8c7d62' });
  const T = bp ? { x0: F.x0 + 1.4, x1: F.x1 - 1.4, z0: F.z0 + 1.4, z1: F.z1 - 1.4 } : F;
  T.x = (T.x0 + T.x1) / 2; T.z = (T.z0 + T.z1) / 2; T.w = T.x1 - T.x0; T.d = T.z1 - T.z0;
  const first = bp ? BANK_FLOORS : 1, last = site.floors - 1;
  p.span(T.x0, T.x1, podium, top, T.z0, T.z1, '#d9ccab');
  for (const face of FACES) {
    const plane = planeOf(T, face), [s0, s1] = spanOf(T, face), mid = (s0 + s1) / 2;
    windowGrid(p, T, face, { floor0: first, floor1: last, pitch: 5.0, w: 4.1, h: 2.9, sill: 1.6, margin: 2.2, panes: 3,
      glass: ['#9bbab6', '#a4c2bd', '#93b2ae'], light: WARM, skip: bp ? null : clearOfPlate(g.dz, g.signHalf) });
    for (let f = first; f <= site.floors; f++) fbox(p, face, plane, mid, GROUND + f * FLOOR - 0.5, s1 - s0 + 0.4, 0.55, 0.55, f === site.floors ? '#f0e6cd' : '#ede2c8', 'body', undefined, -0.05);
  }
  louvres(p, T, GROUND + last * FLOOR, top, '#a79a7a');
  for (const sx of [T.x0, T.x1]) for (const sz of [T.z0, T.z1]) p.box(sx, podium, sz, 1.9, top - podium, 1.9, '#c7b88f');
  // heavier cornice and a stepped crown
  p.span(T.x0 - 0.7, T.x1 + 0.7, top, top + 1.0, T.z0 - 0.7, T.z1 + 0.7, '#f0e6cd');
  roofTop(p, { x0: T.x0, x1: T.x1, z0: T.z0, z1: T.z1, x: T.x, z: T.z, w: T.w, d: T.d }, top + 1.0, { wall: '#d9ccab', mast: 11 });
}

// The bank: the host's lowest three floors, heavy stone, tall banking-hall glazing,
// a portal at its own door with a gilded coin and the name 鎮北銀行.
function bankPodium(host, bp, site, bankSite) {
  const F = bp.f.foot, y1 = GROUND + BANK_FLOORS * FLOOR, STONE = '#cdbd98', LIGHT = '#eadfc4';
  const dz = bp.f.point(bankSite.door).z, hostZ = bp.f.point(site.door).z;
  bp.span(F.x0, F.x1, GROUND, y1, F.z0, F.z1, STONE);
  bp.span(F.x0 - 0.2, F.x1 + 0.2, GROUND, GROUND + 0.9, F.z0 - 0.2, F.z1 + 0.2, '#6b6458');
  // front: pilasters and bays
  const [s0, s1] = [F.z0, F.z1], n = Math.max(3, Math.round((s1 - s0) / 5.4)), step = (s1 - s0) / n;
  for (let i = 0; i <= n; i++) {
    const a = s0 + i * step;
    fbox(bp, 'f', F.x1, a, GROUND, 1.5, y1 - GROUND, 0.9, LIGHT);
  }
  for (let i = 0; i < n; i++) {
    const a = s0 + step * (i + 0.5);
    if (Math.abs(a - dz) < step * 0.75 + 0.6 || Math.abs(a - hostZ) < step * 0.5 + 4.6) continue;
    const ww = step - 2.2;
    win(bp, 'f', F.x1, a, GROUND + 5.9, ww, 9.6, { glass: '#9dbcc2', light: '#ffe2b0', panes: 2 });
    fbox(bp, 'f', F.x1, a, GROUND + 6.2, ww + 0.2, 0.3, 0.35, '#6b6458', 'body', undefined, 0.02);
    win(bp, 'f', F.x1, a, GROUND + 14.4, ww, 3.0, { glass: '#9dbcc2', light: '#ffe2b0', panes: 2 });
    fbox(bp, 'f', F.x1, a, GROUND + 12.2, ww + 0.8, 0.5, 0.5, LIGHT, 'body', undefined, 0.05);
  }
  // sides: ordinary stone windows between pilasters
  for (const face of ['p', 'n', 'b']) {
    const plane = planeOf(F, face), [a0, a1] = spanOf(F, face), mid = (a0 + a1) / 2;
    windowGrid(bp, F, face, { floor0: 0, floor1: BANK_FLOORS, pitch: 4.6, w: 2.6, h: 3.4, sill: 1.5, margin: 2.4, glass: '#9dbcc2', light: WARM, panes: 2,
      each: info => fbox(bp, face, plane, info.a, info.yc - info.h / 2 - 0.3, info.w + 1, 0.3, 0.5, LIGHT) });
    for (const e of [a0, a1]) fbox(bp, face, plane, e, GROUND, 1.5, y1 - GROUND, 0.9, LIGHT);
    void mid;
  }
  // the heavy cornice and a balustraded edge of the podium roof
  for (const face of FACES) {
    const plane = planeOf(F, face), [a0, a1] = spanOf(F, face);
    fbox(bp, face, plane, (a0 + a1) / 2, y1 - 0.9, a1 - a0 + 1.2, 0.96, 1.1, LIGHT, 'body', undefined, -0.1);
    fbox(bp, face, plane, (a0 + a1) / 2, y1, a1 - a0 + 0.8, 0.5, 0.8, '#b9a981', 'body', undefined, -0.1);
  }
  // the portal: gilded frame, lit glass, deep canopy, coin and name
  const portalW = 6.4;
  fbox(bp, 'f', F.x1, dz, GROUND, portalW + 1.4, 8.2, 1.0, '#8e7a3c', 'body', undefined, -0.05);
  bp.glowQuad(F.x1 + 1.0, GROUND + 3.0, dz, portalW - 0.2, 5.8, 'f', '#9fbcc4', '#ffe9bd', 'entry', 1.0);
  fbox(bp, 'f', F.x1, dz, GROUND + 6.0, portalW + 3.0, 0.7, 3.4, '#e8dcc2', 'body', undefined, 0);
  fbox(bp, 'f', F.x1, dz, GROUND + 6.7, portalW + 3.2, 0.2, 3.5, '#8e7a3c', 'body', undefined, -0.05);
  for (const s of [-1, 1]) fbox(bp, 'f', F.x1, dz + s * (portalW / 2 + 0.9), GROUND, 0.7, 6.0, 0.7, '#f0e6cd', 'body', undefined, 2.5);
  fbox(bp, 'f', F.x1, dz, GROUND, portalW + 3, 0.25, 3.8, '#b9b2a6', 'body', undefined, 0);
  bp.b.atlas.text('bank-name', '鎮北銀行', { color: '#f3dca0', background: '#1f4d3f', size: 84, pad: 0.45, border: '#d8bd6a', radius: 0.12 });
  const item = bp.b.atlas.items.get('bank-name'), sw = Math.min(14, 2.6 * item.aspect);
  bp.sign('bank-name', 'f', F.x1 + 0.95, GROUND + 9.9, dz, sw, { h: sw / item.aspect });
  bp.tube(F.x1 + 1.1, GROUND + 12.4, dz, 1.6, 0.4, '#e0b84a', 'x', 16);
  bp.tube(F.x1 + 1.35, GROUND + 12.4, dz, 1.1, 0.2, '#f3d77a', 'x', 16);
  bp.light(F.x1 + 3, 8.6, dz, 12, '#ffe6b8', 0.8, 'sign', 'bank');
  // the host's own lobby, between the bank's windows
  entrance(host, 'f', host.f.foot.x1, doorZ(host), { w: 9.5, y: 5.0, slab: '#e8dcc2', trim: '#8e7a3c' });
  host.b.atlas.text('name:' + site.id, site.name, { color: '#f4ead0', background: '#4b4636', size: 60, pad: 0.4, radius: 0.3 });
  const it2 = host.b.atlas.items.get('name:' + site.id), w2 = Math.min(14, 1.6 * it2.aspect);
  host.sign('name:' + site.id, 'f', host.f.foot.x1 + 0.95, GROUND + 8.4, doorZ(host), w2, { h: w2 / it2.aspect });
  for (const z of [F.z0 + 2, F.z1 - 2]) bp.light(F.x1 + 3, 3, z, 13, '#ffe4b8', 0.5, 'facade', 'floodlight');
}

// ------------------------------------------------------------------ 'ribs': deep blue ribs
function ribs(p, site) {
  const F = p.f.foot, top = topOf(site), y1 = GROUND + FLOOR, last = site.floors - 1;
  const g = groundFloor(p, site, F, { wall: '#3f4d5e', nameBg: '#1f4a82', trim: '#d9e2ec', canopyTrim: '#2e5f9a' });
  const T = { x0: F.x0 + 0.5, x1: F.x1 - 0.5, z0: F.z0 + 0.5, z1: F.z1 - 0.5 };
  p.span(T.x0, T.x1, y1, top, T.z0, T.z1, '#2d4b6b');
  for (const face of FACES) {
    const plane = planeOf(T, face);
    const grid = windowGrid(p, T, face, { floor0: 1, floor1: last, pitch: 3.0, w: 1.95, h: 3.9, sill: 1.0, margin: 1.5, panes: 1,
      glass: ['#4a7fae', '#5489b6', '#427299'], light: WARM, skip: clearOfPlate(g.dz, g.signHalf) });
    for (let i = 0; i <= grid.n; i++) fbox(p, face, plane, grid.a0 + i * grid.step, y1, 0.8, top - y1 + 4.2, 1.5, '#2f66a6');
  }
  louvres(p, T, GROUND + last * FLOOR, top, '#4a6a8c');
  // a crown: the ribs rise past the roof, tied by a ring beam with a light strip
  const ringY = top + 3.6;
  for (const face of FACES) {
    const plane = planeOf(T, face), [s0, s1] = spanOf(T, face);
    fbox(p, face, plane, (s0 + s1) / 2, ringY, s1 - s0, 0.5, 1.6, '#d9e2ec');
    const strip = (face === 'f' || face === 'b');
    p.glowBox(strip ? plane + normalOf(face) * 1.65 : (s0 + s1) / 2, ringY + 0.1, strip ? (s0 + s1) / 2 : plane + normalOf(face) * 1.65, strip ? 0.14 : s1 - s0 - 1, 0.28, strip ? s1 - s0 - 1 : 0.14, '#cfe8ff', '#7fd0ff', 'sign', 1.5);
  }
  p.span(T.x0, T.x1, top, top + 0.5, T.z0, T.z1, '#d9e2ec');
  roofKit(p, { x0: T.x0 + 1, x1: T.x1 - 1, z0: T.z0 + 1, z1: T.z1 - 1, w: T.x1 - T.x0 - 2, d: T.z1 - T.z0 - 2, x: (T.x0 + T.x1) / 2, z: (T.z0 + T.z1) / 2 }, top + 0.5, { tanks: 0, acs: 3 });
  mast(p, F.x - 2, top + 0.5, F.z + 3, 12);
}

// ------------------------------------------------------------------ 'terraces': stepped, with greenery
const TIERS = [
  { f0: 1, f1: 5, front: 0, back: 0, side: 0 },
  { f0: 5, f1: 9, front: 4.5, back: 0, side: 1.6 },
  { f0: 9, f1: 13, front: 9, back: 2.5, side: 3.4 },
  { f0: 13, f1: 16, front: 13, back: 5, side: 5.6 },
  { f0: 16, f1: 99, front: 16.5, back: 8, side: 8 }
];
function terraces(p, site) {
  const F = p.f.foot, top = topOf(site), y1 = GROUND + FLOOR;
  const g = groundFloor(p, site, F, { wall: '#7a6b57', nameBg: '#3d6a52', trim: '#efe9dc', canopyTrim: '#4f7d45' });
  const depth = F.x1 - F.x0, rects = [];
  const tiers = TIERS.map(t => ({ ...t, f1: Math.min(t.f1, site.floors) })).filter(t => t.f0 < t.f1);
  // never let the stepping eat more than 80% of the plan, whatever the plot
  const scale = Math.min(1, depth * 0.55 / Math.max(...tiers.map(t => t.front + t.back)));
  rects.push({ x0: F.x0, x1: F.x1, z0: F.z0, z1: F.z1 });
  tiers.forEach((t, i) => {
    const r = { x0: F.x0 + t.back * scale, x1: F.x1 - t.front * scale, z0: F.z0 + t.side * scale, z1: F.z1 - t.side * scale };
    r.x = (r.x0 + r.x1) / 2; r.z = (r.z0 + r.z1) / 2; r.w = r.x1 - r.x0; r.d = r.z1 - r.z0;
    const yA = GROUND + t.f0 * FLOOR, yB = GROUND + t.f1 * FLOOR;
    p.span(r.x0, r.x1, yA, yB, r.z0, r.z1, i % 2 ? '#e7dfcf' : '#eee8dc');
    const prev = rects[i];
    for (const face of FACES) {
      const plane = planeOf(r, face), [s0, s1] = spanOf(r, face), mid = (s0 + s1) / 2;
      windowGrid(p, r, face, { floor0: t.f0, floor1: t.f1, y0: GROUND, pitch: 4.0, w: 3.0, h: 3.2, sill: 1.1, margin: 2.0, panes: 2, glass: ['#a2c6c0', '#98bdb7', '#abcbc3'], light: WARM,
        skip: i === 0 ? clearOfPlate(g.dz, g.signHalf) : null });
      // floor ledges, planted on the front and the sides
      for (let f = t.f0; f < t.f1; f++) {
        const y = GROUND + f * FLOOR;
        fbox(p, face, plane, mid, y - 0.3, s1 - s0 + 0.2, 0.35, face === 'b' ? 0.5 : 1.3, '#f6f1e6', 'body', undefined, -0.05);
        if (face !== 'b' && (f - t.f0) % 2 === 0) fbox(p, face, plane, mid, y + 0.05, s1 - s0 - 1.2, 0.62, 0.7, '#5f8a47', 'body', undefined, 0.45);
      }
    }
    // terrace on the roof of the tier below, outside this tier's walls
    const q = rects[i];
    if (i >= 0) {
      const y = yA;
      const strips = [
        [q.x0, r.x0, q.z0, q.z1], [r.x1, q.x1, q.z0, q.z1], [r.x0, r.x1, q.z0, r.z0], [r.x0, r.x1, r.z1, q.z1]
      ];
      for (const [x0, x1, z0, z1] of strips) {
        if (x1 - x0 < 1.2 || z1 - z0 < 1.2) continue;
        p.span(x0, x1, y, y + 0.12, z0, z1, '#d9d1c1');
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        if (z1 - z0 > 4 && x1 - x0 > 3) {
          // outer-edge planters and a few small trees on the lawn
          const edgeFront = x1 > r.x1 && x0 >= r.x1 - 0.1;
          planter(p, cx, edgeFront ? z0 + 1.0 : cz, edgeFront ? x1 - x0 - 1.4 : x1 - x0 - 0.8, 1.1, y);
          void prev;
        }
      }
      // railing round the whole lower roof, except where the tier stands
      railing(p, { x0: q.x0 + 0.3, x1: q.x1 - 0.3, z0: q.z0 + 0.3, z1: q.z1 - 0.3 }, y, 1.1, '#6b7a70', 3.2);
      // trees and bushes on the broad strips
      for (let k = 0; k < 4; k++) {
        const tx = q.x0 + 2.5 + unit(site.id + i + 'tx' + k) * (q.x1 - q.x0 - 5), tz = q.z0 + 2.5 + unit(site.id + i + 'tz' + k) * (q.z1 - q.z0 - 5);
        if (tx > r.x0 - 1.6 && tx < r.x1 + 1.6 && tz > r.z0 - 1.6 && tz < r.z1 + 1.6) continue;
        tree(p, tx, tz, 5.2 + unit(site.id + i + k) * 2, undefined, y + 0.12);
      }
    }
    rects.push(r);
  });
  const R = rects[rects.length - 1];
  p.span(R.x0 - 0.3, R.x1 + 0.3, top, top + 0.35, R.z0 - 0.3, R.z1 + 0.3, '#f6f1e6');
  // green roof, a pergola and the plant
  p.span(R.x0 + 0.8, R.x1 - 0.8, top + 0.35, top + 0.65, R.z0 + 0.8, R.z1 - 0.8, '#6f9a52');
  roofKit(p, { x0: R.x0 + 1, x1: R.x1 - 1, z0: R.z0 + 1, z1: R.z1 - 1, w: R.w - 2, d: R.d - 2, x: R.x, z: R.z }, top + 0.65, { tanks: 1, acs: 2, solar: 3 });
  mast(p, R.x1 - 1.5, top + 0.65, R.z0 + 1.5, 8);
  for (const sx of [R.x0 + 1.5, R.x1 - 1.5]) bush(p, sx, top + 1.2, R.z1 - 2, 1.0);
}

const STYLES = { fins, bands, ribs, terraces };
void acUnit; void balcony;
