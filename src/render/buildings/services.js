// Public services: 鎮立圖書館 (modern, glazed), 鎮東派出所 (a Taiwanese police station:
// white with blue trim, a lit 派出所 sign and a blue light) and the 清潔隊 yard. The police
// station and the sanitation depot are annexes standing in a corner of another site's
// plot: each is drawn exactly inside its own footprint.

import { Builder, GROUND as G, lrect, flagROC, UNIT_SHAPES as U } from './b-kit.js';
import { COL, tree, bush, bed, lamp, bench, bikes, garbageTruck, bin, flagpole, roofPlant, car } from './b-parts.js';

const KINDS = ['library', 'precinct', 'waste'];

export function create({ world, quality = 'full' }) {
  const b = new Builder({ world, quality });
  flagROC(b.atlas);
  b.atlas.text('police', '派出所', { background: '#1f56a8', color: '#ffffff', size: 92, pad: 0.24, border: '#ffffff' });
  b.atlas.text('police-v', '派出所', { background: '#1f56a8', color: '#ffffff', size: 80, vertical: true, pad: 0.22, border: '#ffffff' });
  b.atlas.text('waste', '清潔隊', { background: '#2f7a4a', color: '#ffffff', size: 88, pad: 0.24, border: '#ffffff' });
  for (const site of world.siteList) {
    if (!KINDS.includes(site.kind)) continue;
    if (site.kind === 'library') b.atlas.text('name:' + site.id, site.name, { background: '#5b3f2c', color: '#fff2dc', size: 96, pad: 0.22 });
    ({ library, precinct, waste })[site.kind](b, site);
  }
  const out = b.finish('services');
  return { group: out.group, update: out.update, dispose: out.dispose, lights: out.lights, info: out.info };
}

export const preview = ctx => create(ctx);

const entranceOf = (f, site) => f.point(site.entrance) || f.point(site.door) || { x: f.foot.x1, z: f.foot.z };

// ------------------------------------------------------------------ library
function library(b, site) {
  const p = b.site(site), f = p.f, a = f.area, foot = f.foot, ent = entranceOf(f, site);
  const x0 = foot.x0, x1 = foot.x1, z0 = foot.z0, z1 = foot.z1, H = site.floors * 6, rec = 4;
  const wood = '#b98a57', wall = '#e6dcc8';
  p.pad(a.x0 + 0.4, a.x1 - 0.4, a.z0 + 0.4, a.z1 - 0.4, '#dcd5c5', G + 0.05);
  // Ground floor: a glazed pavilion set back under the cantilevered upper floors.
  p.span(x0, x1 - rec, G, G + 6, z0, z1, '#46525a');
  p.windows('f', x1 - rec, z0 + 1.2, z1 - 1.2, { floors: 1, sill: 0.4, h: 5.2, w: 5.1, pitch: 6, panes: 2, glass: '#6fa5ba' });
  const nc = Math.max(2, Math.round((z1 - z0) / 6));
  for (let i = 0; i <= nc; i++) p.span(x1 - rec - 0.15, x1 - rec + 0.35, G, G + 6, z0 + (z1 - z0) * i / nc - 0.25, z0 + (z1 - z0) * i / nc + 0.25, '#eeeae0');
  p.glowQuad(x1 - rec + 0.1, G + 2.7, ent.z, 7, 5.2, 'f', '#5f98ad', '#fff0cf', 'entry', 1.15);
  p.span(x1 - rec - 0.2, x1, G + 5.9, G + 6.3, z0 - 0.4, z1 + 0.4, wood);
  // Upper floors: a warm solid volume with a ribbon of glass behind timber fins.
  p.span(x0, x1, G + 6.3, G + H, z0, z1, wall);
  p.windows('f', x1, z0 + 1.2, z1 - 1.2, { y0: G + 6.3, floors: 1, sill: 0.8, h: 4.4, w: 5.1, pitch: 6, panes: 2, glass: '#6fa5ba' });
  p.windows('f', x1, z0 + 1.2, z1 - 1.2, { y0: G + 12.3, floors: 1, sill: 0.6, h: 2.5, w: 5.1, pitch: 6, panes: 2, glass: '#6fa5ba' });
  p.span(x1 - 0.05, x1 + 0.2, G + 15.3, G + H, z0, z1, '#5b3f2c');
  const fins = Math.round((z1 - z0) / 1.5);
  for (let i = 0; i <= fins; i++) p.span(x1, x1 + 0.55, G + 6.3, G + 15.3, z0 + (z1 - z0) * i / fins - 0.17, z0 + (z1 - z0) * i / fins + 0.17, wood);
  p.sign('name:' + site.id, 'f', x1 + 0.3, G + 16.7, ent.z, Math.min(24, (z1 - z0) - 4), { h: 2.3, channel: 'sign', power: 0.85 });
  const sideKw = { floors: 3, y0: G, first: 1, sill: 1.2, h: 3.6, w: 1.8, pitch: 5, panes: 1, glass: '#6fa5ba' };
  p.windows('p', z1, x0 + 2, x1 - 2, { ...sideKw, y0: G + 0.3, first: 0, floors: 3 });
  p.windows('n', z0, x0 + 2, x1 - 2, { ...sideKw, y0: G + 0.3, first: 0, floors: 3 });
  p.windows('b', x0, z0 + 2, z1 - 2, { ...sideKw, w: 2.4, pitch: 4.5, panes: 2 });
  // Roof: parapet, green roof, solar panels, lift core.
  p.span(x0 - 0.3, x1 + 0.3, G + H, G + H + 0.25, z0 - 0.3, z1 + 0.3, '#d9d2c2');
  for (const [a0, a1, c0, c1] of [[x0 - 0.3, x1 + 0.3, z0 - 0.3, z0 + 0.2], [x0 - 0.3, x1 + 0.3, z1 - 0.2, z1 + 0.3], [x0 - 0.3, x0 + 0.2, z0, z1], [x1 - 0.2, x1 + 0.3, z0, z1]]) p.span(a0, a1, G + H + 0.25, G + H + 1.2, c0, c1, '#f1ece0');
  p.span(x0 + 0.9, x1 - 0.9, G + H + 0.2, G + H + 0.45, z0 + 0.9, z1 - 0.9, '#9bb87a');
  for (let i = 0; i < 4; i++) p.put(U.box(), x0 + 7 + i * 4.4, G + H + 1.7, (z0 + z1) / 2 - 8, [0, 0, 0.5], [3.8, 0.2, 7], '#27384d');
  p.box(x1 - 7, G + H, z1 - 7, 6, 3.6, 6, wall).box(x1 - 7, G + H + 3.6, z1 - 7, 6.5, 0.4, 6.5, '#d6cfc0');
  // The plaza in front: planters with benches, trees, bicycles, lamps.
  const yz0 = a.z0 + 2, yz1 = a.z1 - 2, yx0 = x1 + 1.5, yx1 = a.x1 - 1;
  if (yx1 - yx0 > 4) {
    for (const s of [-1, 1]) {
      const zc = ent.z + s * 12;
      if (zc - 3 > yz0 && zc + 3 < yz1) { bed(p, yx0 + 0.5, yx1 - 1.5, zc - 2.2, zc + 2.2, '#82b062'); tree(p, (yx0 + yx1) / 2, zc, 0.9); }
    }
    bench(p, yx0 + 1.5, ent.z - 6, 0); bench(p, yx0 + 1.5, ent.z + 6, 0);
    bikes(p, yx1 - 2.4, yz1 - 6, 5, Math.PI / 2);
  }
  for (const s of [-1, 1]) { tree(p, a.x0 + 3, s * (z1 - z0) / 2 * 0.7 + (z0 + z1) / 2, 1.0); tree(p, x0 + 12, z1 + 3 * 1, 0.9); }
  lamp(p, x1 + 3, ent.z - 6, { h: 7 }); lamp(p, x1 + 3, ent.z + 6, { h: 7 }); lamp(p, a.x1 - 2.5, ent.z - 10, { h: 7 });
  p.light(x1 - rec + 3, G + 5.5, ent.z, 18, '#fff0cf', 0.7, 'facade', 'entrance');
  void bush; void car; void flagpole; void roofPlant; void lrect;
}

// ------------------------------------------------------------------ police station
function precinct(b, site) {
  const p = b.site(site), f = p.f, foot = f.foot, ent = entranceOf(f, site);
  const x0 = foot.x0 + 0.3, x1 = foot.x1 - 0.2, z0 = foot.z0 + 0.4, z1 = foot.z1 - 0.4, H = site.floors * 6;
  const zc = (z0 + z1) / 2, blue = '#1f56a8', white = '#f5f3ec';
  p.pad(foot.x0, foot.x1, foot.z0, foot.z1, '#cfc9bb', G + 0.05);
  p.span(x0, x1, G, G + H, z0, z1, white);
  p.span(x0 - 0.2, x1 + 0.2, G, G + 0.9, z0 - 0.2, z1 + 0.2, '#a9a79f');
  p.span(x0 - 0.3, x1 + 0.4, G + 5.7, G + 6.4, z0 - 0.3, z1 + 0.3, blue);             // blue band over the ground floor
  p.span(x0 - 0.3, x1 + 0.3, G + H - 1.2, G + H, z0 - 0.3, z1 + 0.3, blue);          // blue cornice
  p.span(x0 - 0.5, x1 + 0.6, G + H, G + H + 0.7, z0 - 0.5, z1 + 0.5, '#e6e3da');
  p.span(x0 - 0.2, x1 + 0.2, G + H + 0.7, G + H + 1.6, z0 - 0.2, z0 + 0.2, white);
  p.span(x0 - 0.2, x1 + 0.2, G + H + 0.7, G + H + 1.6, z1 - 0.2, z1 + 0.2, white);
  p.span(x1 - 0.2, x1 + 0.2, G + H + 0.7, G + H + 1.6, z0, z1, white);
  // Ground floor: glass door in the middle, a window each side; first floor: three windows.
  p.glowQuad(x1 + 0.06, G + 2.4, ent.z, 3.6, 4.2, 'f', '#4f7f94', '#fff0cf', 'entry', 1.15);
  p.span(x1 - 0.1, x1 + 0.35, G, G + 4.8, ent.z - 2.2, ent.z - 1.85, blue); p.span(x1 - 0.1, x1 + 0.35, G, G + 4.8, ent.z + 1.85, ent.z + 2.2, blue);
  p.span(x1 - 0.1, x1 + 0.35, G + 4.5, G + 4.9, ent.z - 2.2, ent.z + 2.2, blue);
  p.windows('f', x1, z0 + 1, ent.z - 3, { floors: 1, sill: 1.6, h: 2.6, w: 2.8, pitch: 3.2, panes: 1, frame: '#d7d4cb' });
  p.windows('f', x1, ent.z + 3, z1 - 1, { floors: 1, sill: 1.6, h: 2.6, w: 2.8, pitch: 3.2, panes: 1, frame: '#d7d4cb' });
  p.windows('f', x1, z0 + 1, z1 - 1, { y0: G + 6.4, floors: 1, sill: 0.9, h: 2.6, w: 2.6, pitch: 3.4, panes: 2, frame: '#d7d4cb' });
  p.windows('p', z1, x0 + 1.2, x1 - 1.2, { floors: 2, sill: 1.6, h: 2.6, w: 2.4, pitch: 4, panes: 1 });
  p.windows('n', z0, x0 + 1.2, x1 - 1.2, { floors: 2, sill: 1.6, h: 2.6, w: 2.4, pitch: 4, panes: 1 });
  // The sign over the door and a blade sign at the corner, both lit.
  p.span(x1, x1 + 0.5, G + 6.4, G + 9.6, ent.z - 4.4, ent.z + 4.4, white);
  p.sign('police', 'f', x1 + 0.55, G + 8.0, ent.z, 7.6, { h: 2.4, channel: 'sign', power: 0.95 });
  p.sign('police-v', 'p', x1 + 0.7, G + 7.6, z1 + 0.35, 1.6, { h: 6.4, channel: 'sign', power: 0.95 });
  p.span(x1 + 0.5, x1 + 0.9, G + 10.8, G + 11, z1 - 0.2, z1 + 0.4, '#555');
  // The blue light on a bracket above the door, and a small flag on the roof corner.
  p.cyl(x1 + 0.6, G + 9.6, ent.z, 0.12, 1.4, '#555', 6).glowBox(x1 + 0.6, G + 11, ent.z, 1.2, 1.1, 1.2, '#2f6fe0', '#3b8bff', 'beacon', 2.2);
  p.cyl(x0 + 1.2, G + H + 0.7, z0 + 1.2, 0.12, 5.2, '#dfe3e6', 6);
  p.sign('flag-roc', 'f', x0 + 1.25, G + H + 4.6, z0 + 2.2, 3.2, { h: 2.1, channel: null, power: 0 });
  p.light(x1 + 3, G + 7, zc, 12, '#bcd7ff', 0.6, 'sign', 'police');
  p.light(x1 + 3, G + 5, ent.z, 10, '#fff0cf', 0.5, 'facade', 'entrance');
  void bin;
}

// ------------------------------------------------------------------ sanitation yard
function waste(b, site) {
  const p = b.site(site), f = p.f, foot = f.foot, ent = entranceOf(f, site);
  const x0 = foot.x0, x1 = foot.x1, z0 = foot.z0, z1 = foot.z1, green = '#2f7a4a';
  p.pad(x0, x1, z0, z1, '#9c9a94', G + 0.05);
  // The shed: a steel hall with roll-up doors facing the yard and a light shallow gable.
  const sd = Math.min(5.8, (x1 - x0) * 0.45);
  p.span(x0 + 0.2, x0 + sd, G, G + 6, z0 + 0.2, z1 - 0.2, '#d9d6cc');
  p.span(x0 + 0.2, x0 + sd, G + 5, G + 5.8, z0 + 0.15, z1 - 0.15, green);
  p.wedge(x0 + sd / 2 + 0.1, G + 6, (z0 + z1) / 2, sd + 0.8, 1.6, z1 - z0 - 0.2, '#8f98a0', 0, 'body');
  const nd = Math.max(2, Math.round((z1 - z0) / 5));
  for (let i = 0; i < nd; i++) {
    const zz = z0 + (z1 - z0) * (i + 0.5) / nd;
    p.span(x0 + sd, x0 + sd + 0.12, G, G + 4.6, zz - 1.9, zz + 1.9, '#aab0b5');
    for (let k = 0; k < 4; k++) p.span(x0 + sd + 0.1, x0 + sd + 0.16, G + 0.5 + k * 1.1, G + 0.55 + k * 1.1, zz - 1.85, zz + 1.85, '#8a9096');
  }
  // The staff room at the front, with the door the staff use.
  const oz = ent.z;
  p.span(x1 - 3.2, x1, G, G + 4.8, oz - 3, oz + 3, '#f0ece0');
  p.span(x1 - 3.4, x1 + 0.2, G + 4.8, G + 5.4, oz - 3.2, oz + 3.2, green);
  p.glowQuad(x1 + 0.06, G + 2.2, oz, 2.2, 3.8, 'f', '#4f7f94', '#fff0cf', 'entry', 1.1);
  p.windows('p', oz + 3, x1 - 2.8, x1 - 0.4, { floors: 1, sill: 1.5, h: 1.8, w: 1.6, pitch: 3, panes: 1 });
  p.sign('waste', 'f', x1 + 0.12, G + 6.5, oz, 5.2, { h: 1.8, channel: 'sign', power: 0.9 });
  // A yellow compactor truck parked along the shed, bins in the corners.
  garbageTruck(p, x0 + sd + 2.4, (z0 + z1) / 2 - 1.2, Math.PI / 2 * -1 + Math.PI);
  const cols = ['#2f7a4a', '#2f62a8', '#d6b02a', '#8b8f95'];
  for (let i = 0; i < 4; i++) bin(p, x1 - 1.3, z0 + 1.4 + i * 1.8, cols[i], 0);
  bin(p, x1 - 1.3, z1 - 1.4, cols[1], 0); bin(p, x1 - 1.3, z1 - 3.2, cols[2], 0);
  p.light(x1 - 2, G + 7, oz, 12, '#fff0cf', 0.55, 'facade', 'entrance');
  void tree; void bed; void bench; void lamp;
}
