// Roadside services on the widened outer columns: the two gas stations (a big flat canopy
// over pump islands, a price pylon, a convenience kiosk, an automatic car wash, an air and
// water point; the customers' cars at the pumps are one instanced mesh) and the fire
// station (three apparatus bays, a hose-drying tower, a lit sign, the engines and an
// ambulance on a hatched apron). Everything is laid out in the site's local frame
// (+x out of the front, z along it), so it fits a lot of any size and any front.

import * as THREE from 'three';
import { unit } from '../../core/random.js';
import { ShapeBuilder } from '../kit.js';
import { Builder, Atlas, GROUND as G, flagROC, UNIT_SHAPES as U } from './b-kit.js';
import { COL, tree, bed, lamp, bin, bench, flagpole, roofPlant } from './b-parts.js';

const KINDS = ['gas', 'fire'];
const FONT = '"Microsoft JhengHei", "Noto Sans TC", "PingFang TC", "Heiti TC", sans-serif';

// Per-station look and prices (pump prices in NT$ per litre; invented, generic).
const SCHEMES = {
  'g-gas-w': { main: '#2a62a8', accent: '#f0c03a', prices: [31.9, 33.9, 29.6] },
  'g-gas-e': { main: '#2f8a5a', accent: '#f08a2a', prices: [31.8, 33.8, 29.5] },
  default: { main: '#2a62a8', accent: '#f0c03a', prices: [31.9, 33.9, 29.6] }
};
const GRADES = [['95無鉛', '#3d9a5f'], ['98無鉛', '#d9962a'], ['超級柴油', '#5a6672']];
const CAR_COLORS = ['#c9483b', '#3e6fa8', '#e9e6df', '#2f3135', '#d9b43a', '#4b9a74', '#8a8f96', '#b85c8a', '#e6e2d8', '#5f4ba8'];
const OPEN_ISLAND = { pitch: 13, bayOffset: 4.0 };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const WHEEL = '#1d2023';

export function create({ world, quality = 'full' }) {
  const b = new Builder({ world, quality, atlas: new Atlas(2048, 2048) });
  flagROC(b.atlas);
  const sites = world.siteList.filter(s => KINDS.includes(s.kind));
  const stations = [];
  for (const site of sites) {
    if (site.kind === 'gas') {
      const sch = SCHEMES[site.id] || SCHEMES.default;
      b.atlas.text('name:' + site.id, site.name, { background: sch.main, color: '#ffffff', size: 96, pad: 0.22, border: sch.accent });
      b.atlas.text('store:' + site.id, '加油站便利店', { background: '#fffaf0', color: sch.main, size: 84, pad: 0.24, border: sch.main });
      b.atlas.text('wash:' + site.id, '自動洗車', { background: '#ffffff', color: sch.main, size: 88, pad: 0.24, border: sch.main });
      b.atlas.text('air:' + site.id, '打氣・加水', { background: sch.main, color: '#ffffff', size: 70, pad: 0.24 });
      priceBoard(b.atlas, 'price:' + site.id, site, sch);
      stations.push(gasStation(b, site, sch));
    } else {
      fireSigns(b.atlas);
      fireStation(b, site);
    }
  }
  const out = b.finish('roadside');
  const group = new THREE.Group();
  group.name = 'roadside';
  group.add(out.group);
  const cars = parkedCars(stations);
  if (cars) group.add(cars.mesh);

  return {
    group, lights: out.lights,
    update(frame) {
      out.update(frame);
      if (cars) cars.update((frame.lighting && frame.lighting.buildings) || {});
    },
    dispose() {
      out.dispose();
      if (cars) cars.dispose();
      group.clear();
    },
    info() { const i = out.info(); return { meshes: i.meshes + (cars ? 1 : 0), triangles: i.triangles, bays: stations.reduce((n, s) => n + s.bays.length, 0), carsShown: cars ? cars.shown() : 0 }; }
  };
}

export const preview = ctx => create(ctx);

// ------------------------------------------------------------------ shared pieces
function priceBoard(atlas, key, site, sch) {
  const hours = site.hours || { open: 360, close: 1410 };
  const hm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  return atlas.add(key, 360, 520, (c, x, y, w, h) => {
    c.fillStyle = '#16202c'; c.fillRect(x, y, w, h);
    c.fillStyle = sch.main; c.fillRect(x, y, w, 120);
    c.fillStyle = sch.accent; c.fillRect(x, y + 120, w, 10);
    c.textBaseline = 'middle'; c.textAlign = 'center'; c.fillStyle = '#ffffff';
    c.font = `800 58px ${FONT}`;
    c.fillText(site.name, x + w / 2, y + 62);
    GRADES.forEach(([label, col], i) => {
      const ry = y + 142 + i * 116;
      c.fillStyle = col; c.fillRect(x + 12, ry + 6, 150, 100);
      c.fillStyle = '#ffffff'; c.font = `800 38px ${FONT}`; c.textAlign = 'center';
      c.fillText(label, x + 12 + 75, ry + 56);
      c.fillStyle = '#ffd64a'; c.font = `800 76px ${FONT}`; c.textAlign = 'right';
      c.fillText(sch.prices[i].toFixed(1), x + w - 20, ry + 60);
    });
    c.fillStyle = '#9fb2c3'; c.font = `600 26px ${FONT}`; c.textAlign = 'center';
    c.fillText(`營業 ${hm(hours.open)}–${hm(hours.close)}`, x + w / 2, y + h - 22);
  });
}

function fireSigns(atlas) {
  atlas.text('fire', '小鎮消防隊', { background: '#8f1f1a', color: '#ffffff', size: 100, pad: 0.26, border: '#ffffff' });
  atlas.text('fire-119', '119', { background: '#ffffff', color: '#c8362d', size: 110, pad: 0.3, border: '#c8362d' });
  atlas.text('fire-v', '消防隊', { background: '#c8362d', color: '#ffffff', size: 84, vertical: true, pad: 0.22, border: '#ffffff' });
  atlas.text('fire-lane', '車庫前禁止停車', { background: '#ffd23a', color: '#1d2023', size: 64, pad: 0.24, border: '#1d2023' });
}

// A floor arrow pointing along +x (dir 1) or -x (dir -1), centred on x.
function arrow(p, x, z, dir) {
  const stem0 = dir > 0 ? x - 2.2 : x - 0.4, stem1 = dir > 0 ? x + 0.4 : x + 2.2;
  p.pad(stem0, stem1, z - 0.35, z + 0.35, '#f4f1e6', G + 0.1);
  p.put(U.disc(3), x + dir * 1.0, G + 0.15, z, [-Math.PI / 2, 0, dir > 0 ? 0 : Math.PI], [1.25, 1.25, 1], '#f4f1e6');
}

function wheelSet(q, pts, r = 0.95, w = 0.8) {
  for (const [x, z] of pts) {
    q.tube(x, r, z, r, w, WHEEL, 'z', 12);
    q.tube(x, r, z + Math.sign(z) * w * 0.52, r * 0.55, 0.08, '#aab0b6', 'z', 10);
  }
}

// ------------------------------------------------------------------ gas station
function gasStation(b, site, sch) {
  const p = b.site(site), f = p.f, a = f.area;
  const D = a.w, Wd = a.d, T = 2.2;
  const nIsl = clamp(Math.floor((Wd - 24) / 12) + 1, 2, 4), PITCH = OPEN_ISLAND.pitch;
  const canD = clamp(D * 0.46, 18, 26), hd = canD / 2, cx = a.x1 - 6 - hd;
  const islL = canD - 4, hl = islL / 2, unitOff = islL / 4;
  const zc = a.z, islZ = i => zc + (i - (nIsl - 1) / 2) * PITCH;
  const hw = (nIsl - 1) * PITCH / 2 + 1.6 + 3.6;
  const yB = G + 6.4, yT = G + 9;
  const x0c = cx - hd, x1c = cx + hd, zc0 = zc - hw, zc1 = zc + hw;
  const white = '#f3f1ea', concrete = '#d8d3c8';

  // Ground: the forecourt, and a lighter slab under the canopy.
  p.pad(a.x0, a.x1, a.z0, a.z1, '#a29f98', G + 0.05);
  p.pad(x0c - 1, x1c + 1, zc0 - 1, zc1 + 1, '#c5c1b7', G + 0.1);

  // Planting and kerbs on the three sides that are not the road, and along the front
  // with the two driveways left open (in on the side the traffic comes from, out the other).
  const zE = a.z0 + 14, zX = a.z1 - 14, gw = 7;
  bed(p, a.x0 + 0.6, a.x0 + 0.6 + T, a.z0 + 0.6, a.z1 - 0.6);
  for (const [za, zb] of [[a.z0 + 0.6, a.z0 + 0.6 + T], [a.z1 - 0.6 - T, a.z1 - 0.6]]) bed(p, a.x0 + 0.6 + T + 0.8, a.x1 - 0.6 - T - 0.8, za, zb);
  const fx0 = a.x1 - 0.6 - T, fx1 = a.x1 - 0.6;
  const frontBeds = [[a.z0 + 0.6, zE - gw - 0.6], [zE + gw + 0.6, zX - gw - 0.6], [zX + gw + 0.6, a.z1 - 0.6]];
  for (const [za, zb] of frontBeds) if (zb - za > 1) bed(p, fx0, fx1, za, zb);
  for (let z = a.z0 + 7; z < a.z1 - 4; z += 11.5) tree(p, a.x0 + 0.6 + T / 2, z, 0.95, Math.floor(unit(site.id + z) * 2));
  for (const zz of [a.z0 + 0.6 + T / 2, a.z1 - 0.6 - T / 2]) for (let x = a.x0 + 10; x < a.x1 - 8; x += 13) tree(p, x, zz, 0.9);
  tree(p, fx0 + T / 2, (zE + zX) / 2 - 8, 0.85); tree(p, fx0 + T / 2, (zE + zX) / 2 + 8, 0.85);
  tree(p, fx0 + T / 2, a.z0 + 3.5, 0.8); tree(p, fx0 + T / 2, a.z1 - 3.5, 0.8);
  arrow(p, a.x1 - 2.0, zE, -1);
  arrow(p, a.x1 - 2.0, zX, 1);

  // Pump islands, columns, pumps.
  for (let i = 0; i < nIsl; i++) {
    const zi = islZ(i);
    p.box(cx, G, zi, islL, 0.55, 3.2, concrete);
    for (const s of [-1, 1]) p.cyl(cx + s * (hl - 0.7), G + 0.55, zi, 0.28, 1.5, '#f0c03a', 8);
    p.box(cx, G + 0.5, zi, 1.8, yB - G - 0.5, 1.8, white);
    p.box(cx, G + 0.55, zi, 2.0, 1.2, 2.0, sch.main);
    for (const u of [-1, 1]) pump(p, cx + u * unitOff, zi, sch);
  }

  // The canopy: a white fascia box with a colour band and the name on all four faces,
  // strip lights under it, and strong light pools on the lanes.
  p.span(x0c, x1c, yB, yT, zc0, zc1, white);
  p.span(x0c - 0.08, x1c + 0.08, yB + 0.2, yT - 0.2, zc0 - 0.08, zc1 + 0.08, sch.main);
  p.span(x0c - 0.16, x1c + 0.16, yB + 0.05, yB + 0.45, zc0 - 0.16, zc1 + 0.16, sch.accent);
  const key = 'name:' + site.id, sy = G + 7.95;
  const nameW = 1.5 * b.atlas.items.get(key).aspect;
  p.sign(key, 'f', x1c + 0.08, sy, zc, nameW, { h: 1.5 });
  p.sign(key, 'b', x0c - 0.08, sy, zc, nameW, { h: 1.5 });
  p.sign(key, 'p', cx, sy, zc1 + 0.08, nameW, { h: 1.5 });
  p.sign(key, 'n', cx, sy, zc0 - 0.08, nameW, { h: 1.5 });
  const lanes = [];
  for (let i = 0; i <= nIsl; i++) lanes.push(zc + (i - nIsl / 2) * PITCH);
  for (const zl of lanes) for (const u of [-1, 1]) {
    const lx = cx + u * unitOff;
    p.glowBox(lx, yB - 0.12, zl, 3.4, 0.12, 1.5, '#fff7e0', '#fff1c8', 'lamps', 2.4);
    p.light(lx, yB - 0.3, zl, 15, '#ffeccb', 0.85, 'facade', 'canopy');
  }
  for (let i = 0; i < nIsl; i++) for (const u of [-1, 1]) p.glowBox(cx + u * unitOff, yB - 0.12, islZ(i), 3.4, 0.12, 1.2, '#fff7e0', '#fff1c8', 'lamps', 2.4);

  // Price pylon in the middle front bed, panel facing along the road (±z).
  const px = fx0 + T / 2, pz = zc, pw = 6.6, ph = pw * 520 / 360, py = G + 9.5;
  p.box(px, G, pz, 1.5, 9.6, 1.1, '#444b52');
  p.box(px, G + 0.55, pz, 2.0, 1.0, 1.8, sch.main);
  p.box(px, py, pz, pw, ph, 1.2, '#2a3038');
  p.box(px, py + ph, pz, pw + 0.4, 0.5, 1.5, sch.accent);
  const pk = 'price:' + site.id;
  p.sign(pk, 'p', px, py + ph / 2, pz + 0.6, pw, { h: ph });
  p.sign(pk, 'n', px, py + ph / 2, pz - 0.6, pw, { h: ph });
  p.light(px - 2, G + 12, pz, 16, '#ffe9b0', 0.55, 'sign', 'pylon');

  // Convenience kiosk at the back with a glazed front onto the forecourt.
  const bx0 = a.x0 + 3.8, bx1 = bx0 + 11, sw = clamp(Wd - 34, 12, 30);
  const sz0 = a.z0 + 6.5, sz1 = sz0 + sw, szc = (sz0 + sz1) / 2;
  const wall = '#efe6d2', trim = sch.main;
  p.span(bx0, bx1, G, G + 6.4, sz0, sz1, wall);
  p.span(bx0 - 0.1, bx1 + 0.1, G, G + 0.8, sz0 - 0.1, sz1 + 0.1, '#b9b3a6');
  p.span(bx0 - 0.4, bx1 + 1.2, G + 6.4, G + 6.9, sz0 - 0.4, sz1 + 0.4, '#d9d4c8');
  p.span(bx1, bx1 + 0.4, G + 4.7, G + 6.4, sz0 - 0.1, sz1 + 0.1, trim);
  const np = Math.max(2, Math.round((sw - 2) / 5.2)), pwid = (sw - 2) / np;
  for (let i = 0; i < np; i++) {
    const zz = sz0 + 1 + pwid * (i + 0.5);
    p.glowQuad(bx1 + 0.06, G + 2.75, zz, pwid - 0.7, 3.7, 'f', '#6fa5ba', '#fff0cf', 'entry', 1.2);
  }
  for (let i = 0; i <= np; i++) p.span(bx1, bx1 + 0.3, G + 0.8, G + 4.7, sz0 + 1 + pwid * i - 0.3, sz0 + 1 + pwid * i + 0.3, '#eeeae0');
  const sk = 'store:' + site.id, sa = b.atlas.items.get(sk).aspect;
  p.sign(sk, 'f', bx1 + 0.4, G + 5.55, szc, Math.min(sw - 3, 1.4 * sa), { h: 1.4 });
  p.windows('p', sz1, bx0 + 1.5, bx1 - 1.5, { floors: 1, sill: 1.8, h: 2.2, w: 2.4, pitch: 4, panes: 1 });
  p.windows('n', sz0, bx0 + 1.5, bx1 - 1.5, { floors: 1, sill: 1.8, h: 2.2, w: 2.4, pitch: 4, panes: 1 });
  for (const k of [0.25, 0.7]) p.box(bx0 + 4, G + 6.9, sz0 + sw * k, 3.2, 1.2, 2.4, '#9aa1a8');
  bin(p, bx1 + 1.4, sz1 - 1.2, '#2f7a4a'); bin(p, bx1 + 1.4, sz1 - 3.0, '#2f62a8');
  bench(p, bx1 + 2.5, sz0 + 2.8, 0);
  p.light(bx1 + 4, G + 5, szc, 17, '#fff0cf', 0.7, 'facade', 'store');

  // Automatic car wash: an open tunnel along x entered from the forecourt side.
  const wz1 = a.z1 - 6.5, wz0 = wz1 - 11, wx0 = bx0, wx1 = bx0 + 17;
  p.span(wx0, wx1, G, G + 6.2, wz0, wz0 + 1.6, '#eeece6');
  p.span(wx0, wx1, G, G + 6.2, wz1 - 1.6, wz1, '#eeece6');
  for (const [za, zb] of [[wz0 - 0.06, wz0 + 1.66], [wz1 - 1.66, wz1 + 0.06]]) p.span(wx0 - 0.05, wx1 + 0.05, G + 2.2, G + 3.2, za, zb, sch.main);
  p.span(wx0 - 0.5, wx1 + 0.8, G + 6.2, G + 6.9, wz0 - 0.5, wz1 + 0.5, '#d9d4c8');
  p.span(wx1, wx1 + 0.4, G + 4.9, G + 6.2, wz0, wz1, white);
  const wk = 'wash:' + site.id, wa = b.atlas.items.get(wk).aspect;
  p.sign(wk, 'f', wx1 + 0.4, G + 5.55, (wz0 + wz1) / 2, Math.min(8.5, 1.1 * wa), { h: 1.1 });
  p.pad(wx0 + 0.2, wx1 + 0.6, wz0 + 1.6, wz1 - 1.6, '#474c52', G + 0.12);
  // Brushes, the gantry and lights inside.
  const gx = (wx0 + wx1) / 2;
  for (const s of [-1, 1]) {
    p.cyl(gx - 3, G + 0.12, (wz0 + wz1) / 2 + s * 2.2, 0.85, 4.2, '#3e79c4', 8);
    p.box(gx + 2, G + 0.12, wz0 + 2.1 + (s > 0 ? 6.2 : 0), 0.6, 4.7, 0.6, '#9aa1a8');
  }
  p.box(gx + 2, G + 4.5, (wz0 + wz1) / 2, 0.7, 0.6, 7.0, '#9aa1a8');
  for (let i = 0; i < 3; i++) p.glowBox(wx0 + 3 + i * 5, G + 6.05, (wz0 + wz1) / 2, 2.4, 0.15, 3.6, '#ffffff', '#cfeaff', 'entry', 2.2);
  // The pay post at the entrance.
  p.box(wx1 + 1.6, G, wz0 - 1.8, 1.4, 3.0, 1.2, '#4b5560');
  p.glowQuad(wx1 + 1.6 + 0.76, G + 2.2, wz0 - 1.8, 0.9, 0.7, 'f', '#223', '#9fe8ff', 'lamps', 1.4);
  p.light(wx1 + 3, G + 5, (wz0 + wz1) / 2, 14, '#dff0ff', 0.6, 'facade', 'wash');

  // The air and water point on a small island between the kiosk and the car wash.
  const az = (sz1 + wz0) / 2, ax = bx1 + 5;
  p.box(ax, G, az, 4.6, 0.4, 3.0, concrete);
  for (const s of [-1, 1]) {
    p.box(ax, G + 0.4, az + s * 0.9, 1.0, 3.0, 0.9, s > 0 ? '#3e79c4' : '#3f9a6b');
    p.glowQuad(ax + 0.56, G + 2.4, az + s * 0.9, 0.7, 0.6, 'f', '#223', '#9fe8ff', 'lamps', 1.3);
    p.box(ax + 0.2, G + 0.6, az + s * 1.7 + (s > 0 ? 0.05 : -0.05), 0.15, 1.6, 0.15, '#202428');
  }
  p.box(ax, G + 3.4, az, 0.4, 1.9, 0.4, '#555');
  const ak = 'air:' + site.id, aa = b.atlas.items.get(ak).aspect;
  p.sign(ak, 'f', ax + 0.2, G + 5.4, az, 1.1 * aa, { h: 1.1 });
  p.sign(ak, 'b', ax - 0.2, G + 5.4, az, 1.1 * aa, { h: 1.1 });

  // Tank covers, lamps.
  for (let i = 0; i < 3; i++) p.disc(cx - 8 + i * 8, G + 0.16, zc0 - 5, 0.9, ['#3d9a5f', '#d9962a', '#5a6672'][i], 12);
  lamp(p, a.x1 - 3.4, a.z0 + 4.5, { h: 9 }); lamp(p, a.x1 - 3.4, a.z1 - 4.5, { h: 9 });
  lamp(p, a.x0 + 3.5, a.z0 + 3.5, { h: 8 }); lamp(p, a.x0 + 3.5, a.z1 - 3.5, { h: 8 });

  // Parking bays at the pumps: where a customer's car stands, nose in or out.
  const bays = [];
  const rot = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < nIsl; i++) for (const u of [-1, 1]) for (const s of [-1, 1]) {
    const k = bays.length, ry = unit(site.id + ':nose' + k) < 0.2 ? 0 : Math.PI;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(cx + u * unitOff, G + 0.1, islZ(i) + s * OPEN_ISLAND.bayOffset), rot.setFromAxisAngle(up, ry), one);
    bays.push({ matrix: new THREE.Matrix4().multiplyMatrices(f.base, m), color: CAR_COLORS[Math.floor(unit(site.id + ':col' + k) * CAR_COLORS.length)], rank: unit(site.id + ':rank' + k) });
  }
  bays.sort((m, n) => m.rank - n.rank);
  return { id: site.id, bays };
}

function pump(p, x, z, sch) {
  const top = G + 0.55;
  p.box(x, top, z, 1.9, 3.3, 1.5, '#e9e6df');
  p.box(x, top + 3.3, z, 2.0, 0.55, 1.6, sch.main);
  p.box(x, top + 1.0, z, 1.96, 0.4, 1.56, sch.accent);
  for (const s of [-1, 1]) {
    p.glowQuad(x, top + 2.55, z + s * 0.81, 1.2, 0.8, s > 0 ? 'p' : 'n', '#223', '#9fe8ff', 'lamps', 1.3);
    // Nozzle holster, nozzle and hose on each end.
    p.box(x + s * 1.15, top + 1.8, z, 0.4, 1.0, 0.7, '#2a2d31');
    p.box(x + s * 1.3, top + 2.0, z, 0.22, 0.7, 0.28, ['#3d9a5f', '#d9962a'][s > 0 ? 0 : 1]);
    p.box(x + s * 1.5, top + 0.7, z, 0.12, 1.4, 0.12, '#202428');
  }
}

// ------------------------------------------------------------------ the cars at the pumps
function carGeometry() {
  const s = new ShapeBuilder(), dark = '#1d2023', glass = '#35566a', white = '#ffffff';
  for (const [x, z] of [[2.7, 1.5], [2.7, -1.5], [-2.7, 1.5], [-2.7, -1.5]]) {
    s.cylinder(x, 0.85, z, 0.85, 0.85, 0.7, dark, 12, [Math.PI / 2, 0, 0]);
    s.cylinder(x, 0.85, z + Math.sign(z) * 0.36, 0.47, 0.47, 0.1, '#8c9298', 10, [Math.PI / 2, 0, 0]);
  }
  s.block(0, 0.55, 0, 8.6, 1.55, 3.4, white);
  s.block(0, 0.35, 0, 8.7, 0.35, 3.5, '#2a2d31');
  s.block(-0.5, 2.1, 0, 4.8, 1.05, 3.0, glass);
  s.block(-0.5, 2.1, 0, 3.6, 1.07, 3.1, white);
  s.block(-0.5, 3.1, 0, 4.5, 0.25, 3.1, white);
  s.box(2.3, 2.55, 0, 1.6, 0.12, 3.0, glass, [0, 0, -0.75]);
  for (const z of [1.1, -1.1]) { s.block(4.31, 1.2, z, 0.12, 0.45, 0.8, '#f5f0d8'); s.block(-4.31, 1.2, z, 0.12, 0.45, 0.8, '#b33a33'); }
  return s.build();
}

function parkedCars(stations) {
  const total = stations.reduce((n, s) => n + s.bays.length, 0);
  if (!total) return null;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1 });
  const geometry = carGeometry();
  const mesh = new THREE.InstancedMesh(geometry, mat, total);
  mesh.name = 'roadside:cars';
  mesh.count = 0; mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  const counts = new Map(stations.map(s => [s.id, -1]));
  const color = new THREE.Color();
  mesh.setColorAt(0, color.set('#ffffff'));            // allocates the colour buffer
  let shown = 0;
  return {
    mesh,
    shown: () => shown,
    update(lit) {
      let changed = false;
      const want = stations.map(s => {
        const n = clamp(Math.round((lit[s.id] && lit[s.id].visitors) || 0), 0, s.bays.length);
        if (counts.get(s.id) !== n) { counts.set(s.id, n); changed = true; }
        return n;
      });
      if (!changed) return;
      let k = 0;
      stations.forEach((s, i) => {
        for (let j = 0; j < want[i]; j++, k++) { mesh.setMatrixAt(k, s.bays[j].matrix); mesh.setColorAt(k, color.set(s.bays[j].color)); }
      });
      shown = k; mesh.count = k;
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    },
    dispose() { geometry.dispose(); mat.dispose(); mesh.dispose(); }
  };
}

// ------------------------------------------------------------------ fire station
function fireStation(b, site) {
  const p = b.site(site), f = p.f, a = f.area, foot = f.foot;
  const red = '#c8362d', white = '#f3f0e8', wallCol = '#f1eee6', cornice = '#d8d4ca', glassCol = '#5f8ea3';
  const x0 = foot.x0, x1 = foot.x1, z0 = foot.z0, z1 = foot.z1;
  const hd = Math.min(17, x1 - x0 - 8), hallH = 6.8, H = site.floors * 6, yR = G + H;
  const nUp = Math.max(1, site.floors - 1), upH = (H - hallH) / nUp;
  const towerW = 10.5, zR = z1 - towerW, zEnd = z1 - 4, TH = H + 12, yTT = G + TH;
  const tx0 = x1 - 10.2, tx1 = x1 + 0.8, tzc = (zR + z1) / 2;

  // Ground: paving everywhere, a darker apron in front, the hall floor inside.
  p.pad(a.x0, a.x1, a.z0, a.z1, '#cfcabd', G + 0.05);
  p.pad(x1, a.x1 - 0.3, a.z0 + 0.5, a.z1 - 0.5, '#a3a19b', G + 0.1);
  p.pad(x1 - hd + 0.8, x1 - 0.1, z0 + 0.95, zR - 0.95, '#7d7f82', G + 0.1);

  // Walls: rear block, hall end walls, upper floors.
  p.span(x0, x1 - hd, G, G + hallH, z0, zEnd, wallCol);
  p.span(x1 - hd, x1, G, G + hallH, z0, z0 + 0.9, wallCol);
  p.span(x1 - hd, x1, G, G + hallH, zR - 0.9, zEnd, wallCol);
  p.span(x0, x1, G + hallH, yR, z0, zEnd, wallCol);

  // Three bays: door openings between piers; the first is shut, the other two stand open.
  const bz0 = z0 + 0.9 + 1.0, bz1 = zR - 0.9 - 1.0, pier = 1.8;
  const bw = (bz1 - bz0 - 2 * pier) / 3, doorH = 5.6;
  const doors = [0, 1, 2].map(i => ({ z0: bz0 + i * (bw + pier), z1: bz0 + i * (bw + pier) + bw, zc: bz0 + i * (bw + pier) + bw / 2 }));
  const cuts = [z0 + 0.9, ...doors.flatMap(d => [d.z0, d.z1]), zR - 0.9];
  for (let i = 0; i < cuts.length; i += 2) p.span(x1 - 0.8, x1, G, G + hallH, cuts[i], cuts[i + 1], wallCol);
  p.span(x1 - 0.85, x1 + 0.2, G + doorH, G + hallH + 0.05, z0 - 0.1, zR, red);
  for (const d of doors) {
    p.span(x1 - 0.85, x1 + 0.15, G, G + doorH + 0.05, d.z0 - 0.5, d.z0 + 0.15, red);
    p.span(x1 - 0.85, x1 + 0.15, G, G + doorH + 0.05, d.z1 - 0.15, d.z1 + 0.5, red);
  }
  // Closed door: a slatted roller shutter.
  const cd = doors[0];
  p.span(x1 - 0.6, x1 - 0.3, G, G + doorH, cd.z0, cd.z1, '#c4c8cc');
  for (let k = 0; k < 6; k++) p.span(x1 - 0.3, x1 - 0.22, G + 0.5 + k * 0.85, G + 0.62 + k * 0.85, cd.z0, cd.z1, '#8a9096');
  p.span(x1 - 0.35, x1 - 0.14, G + doorH - 1.6, G + doorH - 0.7, cd.z0 + 1.0, cd.z1 - 1.0, '#8fb4c4');
  // Open doors: the rolled-up shutter, a stripe on the back wall, ceiling lights.
  for (const d of doors.slice(1)) p.span(x1 - 0.7, x1 - 0.1, G + doorH - 0.5, G + doorH, d.z0, d.z1, '#8a9096');
  p.span(x1 - hd, x1 - hd + 0.1, G + 3.0, G + 3.7, z0 + 0.9, zR - 0.9, red);
  for (const d of doors) for (const xx of [x1 - 4, x1 - 11]) p.glowBox(xx, G + hallH - 0.15, d.zc, 3.4, 0.15, 1.4, '#ffffff', '#fff3d6', 'entry', 2.0);
  // Red lintel/belt carries the lit sign on the upper floor line.
  const parapetH = 4.0;
  p.span(x0 - 0.5, x1 + 0.5, yR, yR + 0.6, z0 - 0.5, zEnd, cornice);
  p.span(x1 - 0.4, x1 + 0.3, yR + 0.6, yR + parapetH, z0 - 0.5, zR, red);
  p.span(x0 - 0.5, x1 - 0.4, yR + 0.6, yR + 1.5, z0 - 0.5, z0 - 0.1, white);
  p.span(x0 - 0.5, x0 - 0.1, yR + 0.6, yR + 1.5, z0 + 0.0, zEnd, white);
  const fk = b.atlas.items.get('fire');
  const parZ = (z0 + zR) / 2, parH = 2.5;
  p.sign('fire', 'f', x1 + 0.3, yR + 2.3, parZ, Math.min(zR - z0 - 4, parH * fk.aspect), { h: parH });

  // Windows: offices above the bays, both ends, the rear.
  const wopt = { y0: G + hallH, floors: nUp, floorH: upH, sill: 1.5, h: 2.6, w: 3.2, pitch: 5, panes: 2, frame: '#d7d3c8' };
  p.windows('f', x1, z0 + 1.5, zR - 1.5, wopt);
  p.windows('n', z0, x0 + 3, x1 - 3, { ...wopt, w: 2.6 });
  p.windows('n', z0, x0 + 3, x1 - hd, { y0: G, floors: 1, sill: 1.8, h: 2.4, w: 2.4, pitch: 4.5, panes: 1 });
  p.windows('b', x0, z0 + 2, zEnd - 2, { y0: G, floors: site.floors, floorH: 6, sill: 1.8, h: 2.6, w: 2.8, pitch: 5, panes: 2, frame: '#d7d3c8' });

  // The hose-drying tower: slit windows, a red band with the lit 119, a lookout and a mast.
  p.span(tx0, tx1, G, G + TH, zR, z1, white);
  p.span(tx0 - 0.12, tx1 + 0.12, yTT - 3.6, yTT - 0.8, zR - 0.12, z1 + 0.12, red);
  p.span(tx0 - 0.12, tx1 + 0.12, G + H + 0.0 - 0.0 + 0.6, G + H + 1.2, zR - 0.12, z1 + 0.12, red);
  const slit = { floors: 5, floorH: 6, sill: 1.2, h: 3.4, w: 1.4, pitch: 5, panes: 1, glass: glassCol };
  p.windows('f', tx1, zR + 1.5, z1 - 1.5, { ...slit, first: 1 });
  p.windows('p', z1, tx0 + 1.5, tx1 - 1.5, { ...slit, first: 0 });
  p.windows('n', zR, tx0 + 1.5, tx1 - 1.5, { ...slit, first: 3 });
  p.windows('b', tx0, zR + 1.5, z1 - 1.5, { ...slit, first: 3 });
  p.glowQuad(tx1 + 0.06, G + 2.0, tzc, 3.0, 4.0, 'f', '#4f7f94', '#fff0cf', 'entry', 1.15);
  p.span(tx1 - 0.1, tx1 + 0.3, G, G + 4.4, tzc - 1.9, tzc - 1.5, red); p.span(tx1 - 0.1, tx1 + 0.3, G, G + 4.4, tzc + 1.5, tzc + 1.9, red);
  p.span(tx1 - 0.1, tx1 + 0.3, G + 4.1, G + 4.5, tzc - 1.9, tzc + 1.9, red);
  const k119 = b.atlas.items.get('fire-119');
  p.sign('fire-119', 'f', tx1 + 0.12, yTT - 2.2, tzc, Math.min(towerW - 2, 2.2 * k119.aspect), { h: 2.2 });
  const kv = b.atlas.items.get('fire-v');
  p.sign('fire-v', 'p', tx0 + 5.2, G + 21.5, z1 + 0.12, 6.6 * kv.aspect, { h: 6.6 });
  p.span(tx0 - 0.7, tx1 + 0.7, yTT, yTT + 0.7, zR - 0.7, z1 + 0.7, cornice);
  for (const [xa, xb, za, zb] of [[tx0 - 0.7, tx1 + 0.7, zR - 0.7, zR - 0.4], [tx0 - 0.7, tx1 + 0.7, z1 + 0.4, z1 + 0.7], [tx0 - 0.7, tx0 - 0.4, zR, z1], [tx1 + 0.4, tx1 + 0.7, zR, z1]]) p.span(xa, xb, yTT + 0.7, yTT + 1.6, za, zb, white);
  const cabX0 = tx0 + 1.6, cabX1 = tx1 - 1.6, cabZ0 = zR + 1.6, cabZ1 = z1 - 1.6;
  p.span(cabX0, cabX1, yTT + 0.7, yTT + 4.0, cabZ0, cabZ1, white);
  p.span(cabX0 - 0.4, cabX1 + 0.4, yTT + 4.0, yTT + 4.5, cabZ0 - 0.4, cabZ1 + 0.4, red);
  const look = { y0: yTT + 0.7, floors: 1, sill: 0.7, h: 1.8, w: 1.8, pitch: 3, panes: 1 };
  p.windows('f', cabX1, cabZ0 + 0.6, cabZ1 - 0.6, look); p.windows('b', cabX0, cabZ0 + 0.6, cabZ1 - 0.6, look);
  p.windows('p', cabZ1, cabX0 + 0.6, cabX1 - 0.6, look); p.windows('n', cabZ0, cabX0 + 0.6, cabX1 - 0.6, look);
  p.cyl((cabX0 + cabX1) / 2, yTT + 4.5, (cabZ0 + cabZ1) / 2, 0.14, 7, '#9aa1a8', 6);
  p.glowBox((cabX0 + cabX1) / 2, yTT + 11.5, (cabZ0 + cabZ1) / 2, 0.7, 0.7, 0.7, '#c33', '#ff3b30', 'beacon', 2.2);
  roofPlant(p, { x0: x0 + 2, w: 18, z0: z0 + 3, d: zR - z0 - 8, z1: zR - 5 }, yR + 0.6, { tanks: 2, stair: false, seed: 'fire' });

  // Apparatus: an engine and a ladder truck standing in the open bays, noses just out.
  p.at(0, 0.1, 0, 0, q => {
    fireTruck(q, x1 + 1.0 - 5.5, doors[1].zc, 0, { len: 11, ladder: false });
    fireTruck(q, x1 + 1.0 - 6.5, doors[2].zc, 0, { len: 13, ladder: true });
    rescueVan(q, x1 + 10.2, a.z0 + 6.2, 0);
  });
  const ay = G + 0.17;
  for (const [xa, xb, za, zb] of [[x1 + 5.4, x1 + 14.9, a.z0 + 2.2, a.z0 + 2.5], [x1 + 5.4, x1 + 14.9, a.z0 + 9.9, a.z0 + 10.2], [x1 + 5.4, x1 + 5.7, a.z0 + 2.2, a.z0 + 10.2], [x1 + 14.6, x1 + 14.9, a.z0 + 2.2, a.z0 + 10.2]]) p.pad(xa, xb, za, zb, '#f4f1e6', ay);

  // Yellow hatching across the apron in front of the bays, with white borders.
  const hx0 = x1 + 1.6, hx1 = x1 + 5.0, hz0 = z0 + 0.9, hz1 = zR - 0.9;
  for (let zs = hz0 + 0.4; zs + (hx1 - hx0) < hz1; zs += 2.4) p.beam(hx0 + 0.3, zs, hx1 - 0.3, zs + (hx1 - hx0 - 0.6), G + 0.1, 0.8, 0.12, '#f2c230');
  p.pad(hx0, hx0 + 0.3, hz0, hz1, '#f4f1e6', G + 0.22);
  p.pad(hx1 - 0.3, hx1, hz0, hz1, '#f4f1e6', G + 0.22);
  p.pad(hx0, hx1, hz0, hz0 + 0.3, '#f4f1e6', G + 0.22);
  p.pad(hx0, hx1, hz1 - 0.3, hz1, '#f4f1e6', G + 0.22);

  // Planting: hedge behind, beds beside the building, flag and lamps out front.
  p.span(a.x0 + 0.5, x0 - 0.9, G, G + 1.3, a.z0 + 0.6, a.z1 - 0.6, COL.greenDark);
  const sideEnd = x1 + 1.0;
  bed(p, x0 - 0.3, sideEnd, a.z0 + 0.6, a.z0 + 3.4);
  bed(p, x0 - 0.3, sideEnd, a.z1 - 3.4, a.z1 - 0.6);
  for (let x = x0 + 3; x < sideEnd - 2; x += 12) { tree(p, x, a.z0 + 2.0, 0.85); tree(p, x, a.z1 - 2.0, 0.85); }
  flagpole(p, a.x1 - 6, a.z1 - 7, 20);
  lamp(p, a.x1 - 3, a.z0 + 3, { h: 9 }); lamp(p, a.x1 - 3, a.z1 - 3, { h: 9 }); lamp(p, a.x1 - 3, (a.z0 + a.z1) / 2, { h: 9 });
  bench(p, x1 + 3, a.z1 - 5, Math.PI / 2);
  const lk = b.atlas.items.get('fire-lane');
  p.box(x1 + 6.6, G, a.z1 - 14, 0.3, 3.0, 0.3, '#555');
  p.sign('fire-lane', 'f', x1 + 6.75, G + 3.6, a.z1 - 14, 3.4, { h: 3.4 / lk.aspect });
  p.sign('fire-lane', 'b', x1 + 6.45, G + 3.6, a.z1 - 14, 3.4, { h: 3.4 / lk.aspect });
  for (const d of doors) p.light(x1 + 6, G + 6, d.zc, 15, '#fff1d0', 0.8, 'facade', 'bay');
  p.light(x1 + 5, G + 20, tzc, 16, '#ffb8a8', 0.5, 'sign', '119');
  p.light(x1 + 4, G + 14, parZ, 18, '#ffc8b8', 0.5, 'sign', 'fire-sign');
}

// A fire engine (len 11) or ladder truck (len 13), centred at (x, z), forward +x.
function fireTruck(q, x, z, ry, { len = 11, ladder = false } = {}) {
  const red = '#c8362d', dark = '#2a2d31', glass = '#35566a';
  q.at(x, 0, z, ry, t => {
    const half = len / 2, cabL = 3.0, cabX = half - cabL / 2, bBack = -half, bFront = half - cabL, bc = (bBack + bFront) / 2, bl = bFront - bBack;
    wheelSet(t, [[half - 1.6, 1.6], [half - 1.6, -1.6], [bBack + 1.8, 1.6], [bBack + 1.8, -1.6], ...(ladder ? [[bBack + 4.0, 1.6], [bBack + 4.0, -1.6]] : [])]);
    t.box(0, 0.8, 0, len - 0.4, 0.7, 3.2, dark);
    t.box(bc, 1.0, 0, bl, 3.1, 3.6, red);
    t.box(cabX, 1.0, 0, cabL, 3.4, 3.6, red);
    t.box(half - 1.05, 1.95, 0, 2.2, 1.3, 3.72, glass);
    t.box(half + 0.2, 0.55, 0, 0.5, 0.8, 3.5, '#d9dde0');
    // White stripe, compartment lines and roller panels along the body.
    t.box(bc, 2.05, 0, bl + 0.12, 0.5, 3.72, '#f3f0e8');
    const nc = Math.max(2, Math.floor(bl / 2.4)), cw = bl / nc;
    for (let i = 0; i < nc; i++) {
      const xa = bBack + i * cw + cw / 2;
      t.box(xa, 1.2, 0, cw - 0.3, 0.75, 3.7, '#bfc4c9');
      t.box(xa, 2.65, 0, cw - 0.3, 1.15, 3.7, '#bfc4c9');
      if (i) t.box(bBack + i * cw, 1.15, 0, 0.14, 2.75, 3.84, '#6b1f1b');
    }
    // Roof: hose bed, light bar, ladders.
    t.box(bc, 4.1, 0, bl - 0.6, 0.3, 3.0, '#a82b24');
    t.glowBox(half - 0.7, 4.4, -0.7, 0.7, 0.3, 1.4, '#d33', '#ff3b30', 'beacon', 2.2);
    t.glowBox(half - 0.7, 4.4, 0.7, 0.7, 0.3, 1.4, '#36c', '#3b6bff', 'beacon', 2.0);
    for (const s of [-1, 1]) {
      t.glowBox(half + 0.02, 1.35, s * 1.25, 0.1, 0.45, 0.9, '#f5f0d8', '#fff2c0', 'lamps', 0.8);
      t.glowBox(bBack - 0.03, 1.4, s * 1.25, 0.1, 0.45, 0.9, '#b33a33', '#ff4a3a', 'lamps', 0.7);
    }
    if (ladder) {
      const yl = 4.95, l0 = bBack + 0.6, l1 = half - 0.3, lc = (l0 + l1) / 2;
      t.box(bBack + 2.6, 4.4, 0, 3.2, 0.7, 2.8, '#cfd3d6');
      for (const s of [-1, 1]) { t.box(lc, yl, s * 0.95, l1 - l0, 0.3, 0.3, '#e1e4e6'); t.box(cabX - 0.6, 4.4, s * 0.95, 0.5, yl - 4.4, 0.5, '#9aa1a8'); }
      for (let r = l0 + 0.5; r < l1; r += 0.9) t.box(r, yl + 0.04, 0, 0.14, 0.2, 1.9, '#e1e4e6');
    } else {
      for (const s of [-1, 1]) t.box(bc, 4.4, s * 1.0, 6, 0.22, 0.22, '#e1e4e6');
    }
  });
}

// An ambulance (8.6 x 3.6), forward +x.
function rescueVan(q, x, z, ry) {
  q.at(x, 0, z, ry, t => {
    wheelSet(t, [[2.9, 1.65], [2.9, -1.65], [-2.7, 1.65], [-2.7, -1.65]], 0.9, 0.8);
    t.box(-0.4, 0.8, 0, 8.6, 4.2, 3.6, COL.white);
    t.box(3.2, 3.2, 0, 2.2, 1.5, 3.72, COL.glassDark);
    t.box(-0.4, 2.1, 0, 8.72, 0.6, 3.72, COL.red);
    t.box(-0.4, 0.5, 0, 8.7, 0.4, 3.4, '#2a2d31');
    t.glowBox(2.2, 5.0, 0, 0.7, 0.4, 2.8, '#c33', '#ff3b30', 'beacon', 1.8);
    t.glowBox(1.5, 5.0, 0, 0.5, 0.4, 2.4, '#36c', '#3b6bff', 'beacon', 1.6);
    for (const s of [-1, 1]) t.glowBox(4.72, 1.4, s * 1.2, 0.1, 0.5, 0.8, '#f5f0d8', '#fff2c0', 'lamps', 0.8);
  });
}
