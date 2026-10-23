// 小鎮綜合醫院: a walled compound with a tall ward tower rising out of a three-storey
// podium, a glazed main hall under a drop-off canopy, an emergency bay with a parked
// ambulance on one side, a red-cross sign, and a plant-covered roof (no helipad here).

import { Builder, GROUND as G, lrect } from './b-kit.js';
import { COL, compoundWall, gateway, tree, lamp, bench, car, ambulance, roofPlant, bed } from './b-parts.js';

const KINDS = ['hospital'];
const TEAL = '#2f8f88', WALL = '#f3f1ea';

export function create({ world, quality = 'full' }) {
  const b = new Builder({ world, quality });
  b.atlas.add('cross', 128, 128, (c, x, y, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(x, y, w, h);
    c.fillStyle = '#d63b34'; c.fillRect(x + w * 0.38, y + h * 0.12, w * 0.24, h * 0.76); c.fillRect(x + w * 0.12, y + h * 0.38, w * 0.76, h * 0.24);
  });
  b.atlas.text('er', '急診', { background: '#c9483b', color: '#ffffff', size: 84, pad: 0.25, border: '#ffffff' });
  for (const site of world.siteList) {
    if (!KINDS.includes(site.kind)) continue;
    b.atlas.text('name:' + site.id, site.name, { background: TEAL, color: '#ffffff', size: 96, pad: 0.22 });
    drawHospital(b, site);
  }
  const out = b.finish('hospital');
  return { group: out.group, update: out.update, dispose: out.dispose, lights: out.lights, info: out.info };
}

export const preview = ctx => create(ctx);

function drawHospital(b, site) {
  const p = b.site(site), f = p.f, a = f.area, foot = f.foot;
  const ent = f.point(site.entrance) || { x: foot.x1, z: foot.z };
  const gate = f.point(site.gate) || { x: a.x1, z: ent.z };
  const F = site.floors, H = F * 6;
  const gateW = Math.min(14, a.d * 0.3);
  p.pad(a.x0 + 0.4, a.x1 - 0.4, a.z0 + 0.4, a.z1 - 0.4, '#d6d0c2', G + 0.05);
  compoundWall(p, { style: 'fence', color: '#f4f1ea', gaps: [[gate.z - gateW / 2 - 0.9, gate.z + gateW / 2 + 0.9, true]] });
  gateway(p, { z: gate.z, w: gateW, key: 'name:' + site.id, pier: '#f4f1ea', board: TEAL });

  const W = foot.w, D = foot.d, x1 = foot.x1;
  const Dp = Math.min(20, D * 0.56), podH = 18;
  const tw = Math.min(30, W * 0.7), tx1 = foot.x0 + Math.min(D - Dp + 6, D * 0.65);
  // The ward tower.
  p.span(foot.x0, tx1, G, G + H, foot.z - tw / 2, foot.z + tw / 2, WALL);
  for (let fl = 1; fl <= F; fl++) p.span(foot.x0 - 0.25, tx1 + 0.25, G + fl * 6 - 0.35, G + fl * 6 + 0.1, foot.z - tw / 2 - 0.25, foot.z + tw / 2 + 0.25, '#d3d0c8');
  p.span(foot.x0 - 0.5, tx1 + 0.5, G + H, G + H + 0.9, foot.z - tw / 2 - 0.5, foot.z + tw / 2 + 0.5, '#e4e1d8');
  const tw1 = { y0: G + podH, floors: F - 3, sill: 1.7, h: 2.8, w: 2.6, pitch: 3.9, panes: 2, glass: '#5f8ea3' };
  p.windows('f', tx1, foot.z - tw / 2 + 2, foot.z + tw / 2 - 7.5, tw1);
  p.windows('b', foot.x0, foot.z - tw / 2 + 2, foot.z + tw / 2 - 2, tw1);
  p.windows('p', foot.z + tw / 2, foot.x0 + 2, tx1 - 2, { ...tw1, y0: G + 6, floors: F - 1, pitch: 4.2 });
  p.windows('n', foot.z - tw / 2, foot.x0 + 2, tx1 - 2, { ...tw1, y0: G + 6, floors: F - 1, pitch: 4.2 });
  // A teal stair/lift core up one corner of the tower face.
  p.span(tx1, tx1 + 0.7, G + podH, G + H, foot.z + tw / 2 - 6, foot.z + tw / 2, TEAL);
  for (let fl = 3; fl < F; fl++) p.glowQuad(tx1 + 0.75, G + fl * 6 + 3, foot.z + tw / 2 - 3, 2.0, 3.2, 'f', '#4b8794', '#ffe2b0', 'sign', 0.9);
  // The red cross high on the tower.
  p.sign('cross', 'f', tx1 + 0.1, G + H - 6.5, foot.z - tw / 2 + 7, 8, { h: 8, channel: 'sign', power: 0.9 });
  p.sign('cross', 'p', foot.x0 + (tx1 - foot.x0) / 2, G + H - 6.5, foot.z + tw / 2 + 0.1, 8, { h: 8, channel: 'sign', power: 0.9 });
  p.sign('cross', 'n', foot.x0 + (tx1 - foot.x0) / 2, G + H - 6.5, foot.z - tw / 2 - 0.1, 8, { h: 8, channel: 'sign', power: 0.9 });
  roofPlant(p, lrect(foot.x0 + 1, tx1 - 1, foot.z - tw / 2 + 1, foot.z + tw / 2 - 1), G + H + 0.9, { tanks: 3, stair: true });
  p.box(foot.x0 + 7, G + H + 0.9, foot.z - 6, 6, 2.4, 4, '#bfc4c8').box(foot.x0 + 7, G + H + 0.9, foot.z + 3, 6, 2.4, 4, '#bfc4c8');
  p.cyl(foot.x0 + 4, G + H + 0.9, foot.z, 0.9, 7, '#c8ccd0', 8);

  // The podium: full width, three storeys, windows on the wings and a glazed hall in the middle.
  const px0 = x1 - Dp;
  p.span(px0, x1, G, G + podH, foot.z0, foot.z1, WALL);
  p.span(px0 - 0.4, x1 + 0.4, G + podH, G + podH + 0.9, foot.z0 - 0.4, foot.z1 + 0.4, '#e4e1d8');
  for (let fl = 1; fl < 3; fl++) p.span(px0 - 0.2, x1 + 0.3, G + fl * 6 - 0.3, G + fl * 6 + 0.1, foot.z0 - 0.2, foot.z1 + 0.2, '#d3d0c8');
  p.span(px0 - 0.2, x1 + 0.3, G, G + 1.0, foot.z0 - 0.2, foot.z1 + 0.2, '#b8b3a8');
  const hallW = Math.min(16, W * 0.38), hz = ent.z;
  const wingKw = { floors: 3, sill: 1.7, h: 2.8, w: 2.6, pitch: 4, panes: 2, glass: '#5f8ea3' };
  const wing = (z0, z1) => { if (z1 - z0 > 4) p.windows('f', x1, z0 + 0.5, z1 - 0.5, wingKw); };
  wing(foot.z0 + 1, hz - hallW / 2 - 1); wing(hz + hallW / 2 + 1, foot.z1 - 1);
  p.windows('p', foot.z1, px0 + 2, x1 - 2, wingKw); p.windows('n', foot.z0, px0 + 2, x1 - 2, wingKw);
  // Glazed hall: two storeys of curtain glass with a canopy, projecting a little.
  p.span(x1, x1 + 1.6, G, G + 12.4, hz - hallW / 2, hz + hallW / 2, '#aec7cf');
  p.span(x1 - 0.1, x1 + 1.9, G + 12.4, G + 13.2, hz - hallW / 2 - 0.4, hz + hallW / 2 + 0.4, TEAL);
  const panes = Math.round(hallW / 3.4);
  for (let fl = 0; fl < 2; fl++) p.window('f', x1 + 1.65, G + fl * 6 + 3.5 + (fl ? 0.4 : 0), hz, hallW - 1.2, 4.6, { glass: '#5f98ad', panes, mullion: 0.25 });
  p.glowQuad(x1 + 1.7, G + 2.5, hz, 6.4, 4.5, 'f', '#4f7f94', '#fff0cf', 'entry', 1.2);
  p.sign('name:' + site.id, 'f', x1 + 2.0, G + podH + 0.2 - 1.9, hz, hallW + 6, { h: 2.6, channel: 'sign', power: 0.9 });
  p.sign('cross', 'f', x1 + 2.0, G + podH + 5.4, hz, 7, { h: 7, channel: 'sign', power: 0.9 });
  p.span(x1 + 2.0, x1 + 2.1, G + podH + 0.9, G + podH + 2, hz - 3.3, hz + 3.3, TEAL);
  // The drop-off canopy over the drive.
  const cw = hallW + 8, cx1 = x1 + 9.5;
  p.span(x1, cx1, G + 8.6, G + 9.4, hz - cw / 2, hz + cw / 2, WALL);
  p.span(x1, cx1 + 0.2, G + 9.4, G + 9.9, hz - cw / 2 - 0.2, hz + cw / 2 + 0.2, TEAL);
  for (const s of [-1, 1]) for (const xx of [cx1 - 0.8]) p.cyl(xx, G, hz + s * (cw / 2 - 0.9), 0.6, 8.6, '#e8e5dc', 8);
  p.glowBox((x1 + cx1) / 2, G + 8.3, hz, 2, 0.25, cw - 2, '#fff4d8', '#fff0cf', 'entry', 1.4);
  p.light(cx1 - 2, G + 8, hz, 20, '#fff0cf', 0.75, 'facade', 'canopy');
  // Emergency bay at the far end, with its own canopy and an ambulance.
  const erSide = (foot.z1 - hz) >= (hz - foot.z0) ? 1 : -1;
  const ez = erSide > 0 ? foot.z1 - 8.5 : foot.z0 + 8.5;
  p.pad(x1 + 0.3, x1 + 13, ez - 7, ez + 7, '#5d6269', G + 0.08);
  p.pad(x1 + 0.3, x1 + 13, ez - 7, ez - 6.7, '#e8e4d8', G + 0.1); p.pad(x1 + 0.3, x1 + 13, ez + 6.7, ez + 7, '#e8e4d8', G + 0.1);
  p.span(x1, x1 + 11, G + 8.2, G + 8.9, ez - 7.5, ez + 7.5, '#f0ece0');
  p.span(x1, x1 + 11, G + 8.9, G + 9.46, ez - 7.6, ez + 7.6, '#c9483b');
  for (const s of [-1, 1]) p.cyl(x1 + 10.2, G, ez + s * 6.8, 0.5, 8.2, '#e8e5dc', 8);
  p.glowQuad(x1 + 0.35, G + 3.0, ez, 7, 5, 'f', '#4f7f94', '#fff0cf', 'entry', 1.1);
  p.sign('er', 'f', x1 + 11.15, G + 8.65, ez, 6, { h: 2.4, channel: 'sign', power: 0.9 });
  p.glowBox(x1 + 5.5, G + 7.9, ez, 6, 0.25, 10, '#fff4d8', '#ffe8c4', 'entry', 1.3);
  ambulance(p, x1 + 6, ez, 0);
  p.light(x1 + 6, G + 8, ez, 18, '#ffeccc', 0.7, 'facade', 'er');
  // Parking on the other side of the drive.
  const pz = erSide > 0 ? foot.z0 + 3.2 : foot.z1 - 3.2, step = erSide > 0 ? 4.5 : -4.5;
  p.pad(x1 + 2.5, x1 + 13, Math.min(pz - 2.2, pz + 2 * step + 2.2), Math.max(pz + 2.2, pz + 2 * step + 2.2) + 1.5 * 0, '#5d6269', G + 0.08);
  const cols = ['#c9483b', '#e9e6df', '#3e6fa8', '#38393d'];
  for (let i = 0; i < 3; i++) car(p, x1 + 8, pz + i * step, Math.PI, cols[(i + 1) % cols.length]);
  // The drive from the gate and the planting along the walls.
  p.pad(x1 + 9, a.x1 - 0.4, gate.z - 7, gate.z + 7, '#5d6269', G + 0.08);
  for (const s of [-1, 1]) {
    const zz = s < 0 ? a.z0 + 3 : a.z1 - 3;
    bed(p, x1 + 14, a.x1 - 3, zz - 1.3, zz + 1.3, '#7fae5f');
    tree(p, x1 + 16, zz, 1.0); tree(p, a.x1 - 6, zz, 0.95);
  }
  tree(p, foot.x0 - 4 > a.x0 + 2 ? foot.x0 - 4 : a.x0 + 3, foot.z - 14, 1.1); tree(p, foot.x0 - 4 > a.x0 + 2 ? foot.x0 - 4 : a.x0 + 3, foot.z + 14, 1.1);
  lamp(p, x1 + 13, hz - 11, { h: 8 }); lamp(p, a.x1 - 5, gate.z - 8.5, { h: 8 }); lamp(p, a.x1 - 5, gate.z + 8.5, { h: 8 });
  bench(p, x1 + 4, hz + (erSide > 0 ? -1 : 1) * 13, Math.PI / 2);
}
