// 轉運站, the bus and taxi interchange: an open plot with a waiting hall at the back, bus
// bays with canopies in front of it, a taxi lane along the street side, and empty for
// the simulated buses and taxis. The plot edges stay open: the world puts a
// door at the middle of each of the four sides, and people walk in there.

import { Builder, GROUND as G, lrect } from './b-kit.js';
import { COL, tree, lamp, bench, bus, car, bikes, bed } from './b-parts.js';

const KINDS = ['station'];
const TEAL = '#2f8f88';

export function create({ world, quality = 'full' }) {
  const b = new Builder({ world, quality });
  b.atlas.text('station-name', '轉運站', { background: '#1f6f78', color: '#ffffff', size: 110, pad: 0.22, border: '#ffffff' });
  b.atlas.text('taxi', '計程車', { background: '#f0c03a', color: '#27231a', size: 70, pad: 0.22 });
  b.atlas.text('board', '發車資訊', { background: '#101820', color: '#8ee6a0', size: 60, pad: 0.2 });
  for (const site of world.siteList) if (KINDS.includes(site.kind)) drawStation(b, site);
  const out = b.finish('station');
  return { group: out.group, update: out.update, dispose: out.dispose, lights: out.lights, info: out.info };
}

export const preview = ctx => create(ctx);

function drawStation(b, site) {
  const p = b.site(site), f = p.f, a = f.area;
  const doors = (site.doors || [site.door]).map(d => f.point(d));
  const hx0 = a.x0 + 5, hd = Math.min(15, a.w * 0.26), hx1 = hx0 + hd;               // the hall
  const hz = Math.min(a.d / 2 - 7, 21);
  const platX0 = hx1, platX1 = hx1 + 5.5;
  // Paving, then the bus lane and taxi lane in asphalt.
  p.pad(a.x0 + 0.4, a.x1 - 0.4, a.z0 + 0.4, a.z1 - 0.4, '#d3cdbf', G + 0.05);
  const laneX0 = platX1 + 17, taxiX0 = a.x1 - 11.5;
  p.pad(platX1, laneX0, -hz - 4, hz + 4, '#555a61', G + 0.08);
  p.pad(laneX0, taxiX0, -hz - 4, hz + 4, '#4d5258', G + 0.08);
  p.pad(taxiX0, a.x1 - 0.4, a.z0 + 3, a.z1 - 3, '#4d5258', G + 0.08);
  p.pad(taxiX0, taxiX0 + 0.35, a.z0 + 3, a.z1 - 3, '#e8b531', G + 0.11);
  // The hall: a glazed waiting room under a deep canopy, a tall name tower, a roof of vents.
  const H = 8;
  p.span(hx0, hx1, G, G + H, -hz, hz, '#ece7da');
  p.span(hx0 - 0.4, hx1 + 0.4, G + H, G + H + 0.3, -hz - 0.4, hz + 0.4, '#cfc9ba');
  for (const [x0_, x1_, z0_, z1_] of [[hx0 - 0.4, hx1 + 0.4, -hz - 0.4, -hz - 0.0], [hx0 - 0.4, hx1 + 0.4, hz, hz + 0.4], [hx0 - 0.4, hx0, -hz, hz], [hx1, hx1 + 0.4, -hz, hz]]) p.span(x0_, x1_, G + H + 0.3, G + H + 1.1, z0_, z1_, '#ece7da');
  for (let i = 0; i < 4; i++) { const zz = -hz + 5 + i * (hz * 2 - 10) / 3.01; p.span(hx0 + 3, hx0 + 9, G + H + 0.3, G + H + 1.2, zz - 2, zz + 2, '#8fb8c8'); p.box(hx0 + 11.5, G + H + 0.3, zz, 2.2, 1.6, 2.6, '#bfc4c8'); }
  p.span(hx0 - 0.4, hx1 + 0.4, G + H - 1.6, G + H - 0.9, -hz - 0.4, hz + 0.4, TEAL);
  p.span(hx0 - 0.2, hx1 + 0.2, G, G + 1.0, -hz - 0.2, hz + 0.2, '#a6a195');
  const gl = { floors: 1, sill: 0.5, h: 5.2, w: 4.6, pitch: 5.4, panes: 2, glass: '#6fa5ba' };
  p.windows('f', hx1, -hz + 1.5, hz - 1.5, gl);
  p.windows('p', hz, hx0 + 2, hx1 - 2, { ...gl, h: 3.2, sill: 2, pitch: 6 }); p.windows('n', -hz, hx0 + 2, hx1 - 2, { ...gl, h: 3.2, sill: 2, pitch: 6 });
  p.windows('b', hx0, -hz + 2, hz - 2, { ...gl, h: 3.2, sill: 2, pitch: 6 });
  p.glowQuad(hx1 + 0.08, G + 2.6, 0, 7, 5.0, 'f', '#4f7f94', '#fff0cf', 'entry', 1.2);
  // Canopy over the platform, on columns, with a teal edge.
  p.span(hx1, platX1 + 1.5, G + 7.2, G + 7.8, -hz, hz, '#f3f0e6');
  p.span(platX1 + 1.5, platX1 + 1.8, G + 7.0, G + 8.0, -hz, hz, TEAL);
  const cn = Math.round(hz * 2 / 9);
  for (let i = 0; i <= cn; i++) p.cyl(platX1 + 0.8, G, -hz + 2 * hz * i / cn, 0.45, 7.2, '#e6e2d8', 8);
  p.span(platX0, platX1, G, G + 0.5, -hz, hz, '#c4beb0');
  p.glowBox((hx1 + platX1) / 2, G + 6.84, 0, platX1 - hx1, 0.2, hz * 1.6, '#fff4d8', '#fff0cf', 'entry', 1.2);
  // The name tower over the entrance: lit sign on three faces.
  const tz = 7;
  p.span(hx1 - 5, hx1 + 0.4, G + H + 0.9, G + H + 7.5, -tz, tz, '#e9e5d8');
  p.span(hx1 - 5.3, hx1 + 0.7, G + H + 7.5, G + H + 8.1, -tz - 0.3, tz + 0.3, TEAL);
  p.sign('station-name', 'f', hx1 + 0.45, G + H + 4.4, 0, tz * 2 - 1.4, { h: 4.0, channel: 'sign', power: 0.95 });
  p.sign('station-name', 'p', hx1 - 2.6, G + H + 4.4, tz + 0.05, 7, { h: 3.3, channel: 'sign', power: 0.95 });
  p.sign('station-name', 'n', hx1 - 2.6, G + H + 4.4, -tz - 0.05, 7, { h: 3.3, channel: 'sign', power: 0.95 });
  p.light(hx1 + 6, G + 7, 0, 22, '#fff0cf', 0.7, 'facade', 'entrance');
  // Bus bays: stripes, a bay sign pole each, and canopy shelters over the bays' near halves.
  const pitch = 6.6, nb = Math.max(2, Math.min(5, Math.floor((hz * 2 - 2) / pitch)));
  const bayX0 = platX1 + 0.5, bayX1 = laneX0;
  const bz = i => (i - (nb - 1) / 2) * pitch;
  for (let i = 0; i <= nb; i++) { const z = (i - nb / 2) * pitch; p.pad(bayX0, bayX1 - 1, z - 0.15, z + 0.15, '#f0ece0', G + 0.11); }
  for (let i = 0; i < nb; i++) {
    p.span(bayX0 + 0.5, bayX0 + 7.5, G + 6.4, G + 6.9, bz(i) - pitch / 2 + 0.3, bz(i) + pitch / 2 - 0.3, '#eceae2');
    for (const s of [-1, 1]) p.box(bayX0 + 7.2, G + 0.1, bz(i) + s * (pitch / 2 - 0.5), 0.35, 6.3, 0.35, '#9ca3a9');
    p.glowBox(bayX0 + 3, G + 6.2, bz(i), 4, 0.2, 0.7, '#fff4d8', '#fff0cf', 'entry', 1.2);
    p.span(bayX0 + 0.5, bayX0 + 7.5, G + 6.9, G + 7.2, bz(i) - pitch / 2 + 0.3, bz(i) - pitch / 2 + 0.7, TEAL);
  }
  p.sign('board', 'f', hx1 + 0.12, G + 4.6, -hz + 4, 5.2, { h: 1.5, channel: 'sign', power: 0.8 });
  // Buses and taxis are driven by the street simulation; the bays and lane stay empty.
  const taxiX = taxiX0 + 5.5; void taxiX;
  p.sign('taxi', 'f', taxiX0 + 1.6, G + 7.6, 14, 5.0, { h: 1.6, channel: 'sign', power: 0.9 });
  p.cyl(taxiX0 + 1.6, G, 14, 0.2, 7.6, COL.dark, 6);
  // The front walkway across the lanes to the door in the middle of the street side.
  p.pad(laneX0 - 1, a.x1 - 0.4, -4.2, 4.2, '#efe8d6', G + 0.1);
  for (let k = 0; k < 6; k++) p.pad(taxiX0 + 0.8, a.x1 - 0.4, -3.7 + k * 1.4, -3.7 + k * 1.4 + 0.7, '#f4f1e8', G + 0.12);
  // Plazas either side: beds, trees, benches, bicycles, lamps.
  for (const s of [-1, 1]) {
    const z = s * (hz + 8.5);
    if (Math.abs(z) < a.d / 2 - 2) {
      bed(p, platX1 + 4, platX1 + 16, z - 1.4, z + 1.4, '#7fae5f');
      tree(p, platX1 + 7, z, 1.0); tree(p, platX1 + 13, z, 0.95);
      bench(p, platX1 + 2, z + s * 3.6, 0);
    }
    tree(p, a.x0 + 3.2, s * (hz - 1), 1.1);
    lamp(p, platX1 + 18, s * (hz + 1.5), { h: 9, radius: 20 });
  }
  bikes(p, hx0 + 3, hz + 6.2, 6, 0);
  for (const z of [-9, 9]) lamp(p, laneX0 + 2, z, { h: 9, radius: 20, intensity: 0.65 });
  lamp(p, a.x1 - 2.5, 0 - 7, { h: 9, radius: 18 }); lamp(p, a.x1 - 2.5, 7, { h: 9, radius: 18 });
  void doors; void lrect;
}
