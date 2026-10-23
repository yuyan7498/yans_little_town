// 鎮公所 (kind 'civic'): a two-storey civic pavilion on the market strip facing the
// promenade. Pale stone wings, a two-storey colonnade with a pediment at the door, the
// name in gilt on green, and a roof terrace with railing, planters and a pergola.
// The site is shallow (about 9 deep), so the portico is recessed instead of projecting.

import { unit } from '../../core/random.js';
import { Builder, GROUND } from './a-kit.js';
import { FLOOR, WARM, acUnit, fbox, planeOf, planter, railing, roofKit, spanOf, windowGrid } from './a-parts.js';

const STONE = '#e9e1cf', TRIM = '#f7f2e6', TEAL = '#3f8f88', DEEP = '#2e6b66', GOLD = '#e6c46a';

export function create({ world, quality = 'full' }) {
  const b = new Builder({ world, quality });
  for (const site of world.siteList) if (site.kind === 'civic') draw(b.site(site), site);
  return b.finish('civic');
}
export const preview = ctx => create(ctx);

function draw(p, site) {
  const F = p.f.foot, dz = p.f.point(site.door).z, top = GROUND + site.floors * FLOOR;
  const recess = Math.min(3.4, (F.x1 - F.x0) * 0.4), core = F.x1 - recess, half = Math.min(8.5, (F.z1 - F.z0) * 0.22);
  const L = { x0: F.x0, x1: F.x1, z0: F.z0, z1: dz - half }, R = { x0: F.x0, x1: F.x1, z0: dz + half, z1: F.z1 };
  const C = { x0: F.x0, x1: core, z0: dz - half, z1: dz + half };
  for (const r of [L, R, C]) p.span(r.x0, r.x1, GROUND, top, r.z0, r.z1, STONE);
  p.span(F.x0 - 0.2, F.x1 + 0.2, GROUND, GROUND + 0.8, F.z0 - 0.2, F.z1 + 0.2, '#9a9486');
  const winOpts = { floor0: 0, floor1: site.floors, pitch: 4.6, w: 2.5, h: 3.4, sill: 1.5, margin: 2.0, panes: 2, glass: ['#9dbcc2', '#a6c4c8'], light: WARM };
  for (const [r, faces] of [[L, ['f', 'b', 'n']], [R, ['f', 'b', 'p']]]) for (const face of faces) {
    const plane = planeOf(r, face);
    windowGrid(p, r, face, { ...winOpts, each: i => {
      fbox(p, face, plane, i.a, i.yc + i.h / 2, i.w + 0.9, 0.35, 0.4, TRIM);
      fbox(p, face, plane, i.a, i.yc - i.h / 2 - 0.3, i.w + 0.9, 0.3, 0.5, TRIM);
      if (i.f === 1 && face === 'b' && unit(site.id + i.a) > 0.7) acUnit(p, face, plane, i.a + 1.7, i.yc - 1.0, { w: 1.3, h: 0.9 });
    } });
  }
  windowGrid(p, C, 'b', { ...winOpts, margin: 2.2 });
  for (const r of [L, R]) for (const face of ['f', 'b', 'p', 'n']) {
    if ((face === 'p' && r === L) || (face === 'n' && r === R)) continue;
    const [s0, s1] = spanOf(r, face), plane = planeOf(r, face);
    fbox(p, face, plane, (s0 + s1) / 2, GROUND + FLOOR - 0.25, s1 - s0 + 0.2, 0.5, 0.3, TEAL, 'body', undefined, -0.02);
    fbox(p, face, plane, (s0 + s1) / 2, top - 0.5, s1 - s0 + 0.6, 0.8, 0.6, TRIM, 'body', undefined, -0.1);
  }
  for (const sx of [F.x0, F.x1]) for (const sz of [F.z0, F.z1]) p.box(sx, GROUND + 0.8, sz, 1.1, top - GROUND - 0.8, 1.1, TRIM);
  // the portico: a double-height colonnade in front of the recessed doors
  const xc = F.x1 - 0.9, n = 6, span = half * 2 - 0.6;
  for (let i = 0; i < n; i++) {
    const z = dz - span / 2 + (span * i) / (n - 1);
    p.cyl(xc, GROUND + 0.4, z, 0.62, top - GROUND - 1.8, TRIM, 10);
    p.box(xc, GROUND, z, 1.8, 0.5, 1.8, '#cfc8bb'); p.box(xc, top - 1.5, z, 1.7, 0.35, 1.7, '#cfc8bb');
  }
  p.span(xc - 1.0, xc + 0.7, top - 1.6, top, dz - half - 0.3, dz + half + 0.3, STONE);
  p.span(xc - 1.1, xc + 0.8, top - 0.2, top + 0.3, dz - half - 0.5, dz + half + 0.5, TRIM);
  p.wedge(xc - 0.1, top + 0.3, dz, half * 2 + 1.0, 2.8, 1.8, STONE, Math.PI / 2);
  p.b.atlas.text('civic-name', site.name, { color: GOLD, background: DEEP, size: 100, weight: 900, pad: 0.4, border: GOLD, radius: 0.1 });
  const it = p.b.atlas.items.get('civic-name'), w = Math.min(half * 2 - 1, 1.6 * it.aspect), h = w / it.aspect;
  p.sign('civic-name', 'f', xc + 0.72, top - 0.8, dz, w, { h });
  // doors in the recessed wall, porch floor and steps
  p.span(core, F.x1 - 0.2, GROUND, GROUND + 0.3, dz - half, dz + half, '#cfc8bb');
  p.glowQuad(core + 0.1, GROUND + 2.9, dz, half * 1.5, 5.3, 'f', '#9fbcc4', '#ffe2b0', 'entry', 0.8);
  for (let i = -3; i <= 3; i++) fbox(p, 'f', core, dz + (i * half * 1.5) / 6, GROUND + 0.3, 0.3, 5.5, 0.2, '#3b4045', 'body', undefined, 0.12);
  windowGrid(p, C, 'f', { ...winOpts, floor0: 1, floor1: 2, margin: 2.4, w: 2.8, plane: core });
  for (const [i, o] of [[0, 0.2], [1, 0.45]]) p.span(F.x1 - 1.1 - i * 0.4, F.x1 - 0.1 - i * 0.4, GROUND, GROUND + o + 0.14, dz - half + 0.5 + i, dz + half - 0.5 - i, '#d7d0c3');
  for (const s of [-1, 1]) {
    planter(p, xc - 0.1, dz + s * (half + 0.9), 1.2, 1.6, GROUND + 0.1);
    p.glowBox(core + 0.6, GROUND + 6.2, dz + s * (half - 1.0), 0.4, 0.7, 0.4, '#f4efe0', '#ffd79c', 'entry', 1.5);
  }
  p.glowBox(xc + 0.2, top - 1.9, dz, 0.2, 0.18, span, '#fff2d6', '#ffe2b0', 'entry', 1.3);
  p.light(F.x1 + 2.2, 5, dz, 12, '#ffe2b8', 0.85, 'facade', 'entrance');
  p.light(F.x1 + 2.2, 4, F.z0 + 4, 9, '#ffe4b8', 0.4, 'facade', 'floodlight');
  p.light(F.x1 + 2.2, 4, F.z1 - 4, 9, '#ffe4b8', 0.4, 'facade', 'floodlight');
  // roof terrace
  p.span(F.x0, F.x1, top, top + 0.18, F.z0, F.z1, '#d3cbb9');
  railing(p, { x0: F.x0 + 0.4, x1: core - 0.2, z0: F.z0 + 0.4, z1: F.z1 - 0.4 }, top + 0.18, 1.2, '#59606a', 2.4);
  const pz = F.z0 + (F.z1 - F.z0) * 0.22, qz = F.z1 - (F.z1 - F.z0) * 0.22, px = F.x0 + 3.2;
  for (const z of [pz, qz]) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(px + sx * 1.6, top + 0.18, z + sz * 3.4, 0.22, 2.7, 0.22, '#a7774f');
    for (let i = -3; i <= 3; i++) p.box(px, top + 2.9, z + i * 1.0, 4.0, 0.14, 0.3, '#b98a5c');
    p.box(px - 1.0, top + 0.18, z, 0.9, 0.5, 4.8, '#a7774f');
  }
  for (let i = 0; i < 4; i++) planter(p, core - 1.6, F.z0 + 5 + i * 4.5 + (i > 1 ? F.z1 - F.z0 - 28 : 0), 1.1, 2.4, top + 0.18);
  // glazed stair house, lit
  p.box(px, top + 0.18, dz, 4.0, 3.4, 6.0, TRIM);
  p.window('f', px + 2.05, top + 2.0, dz, 5.2, 2.0, { glass: '#9dbcc2', light: '#ffd9a0', panes: 3 });
  p.box(px, top + 3.58, dz, 4.6, 0.3, 6.6, '#9a9486');
  roofKit(p, { x0: F.x0 + 6, x1: F.x0 + 7, z0: F.z0 + 2, z1: F.z0 + 3, w: 1, d: 1, x: F.x0 + 6.5, z: F.z0 + 2.5 }, top + 0.18, { tanks: 0, acs: 0 });
}
