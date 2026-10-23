// The outer-column landmarks: 小鎮銀行總行 (kind 'bank' on a lot), 星空影城 (kind 'cinema') and
// 鎮安宮 (kind 'temple', a Matsu temple in a walled court).
//
// All three are laid out in the site's local frame (+x out of the front, z along it) from the
// plot (`area`), footprint and door/gate, so they adapt to any lot and any front.
// Layering rule (no z-fighting): bands, trims and signs always stand proud of the wall they
// wrap; ground pads sit at distinct heights.

import { unit } from '../../core/random.js';
import { Atlas, Builder, GLOW, GROUND, UNIT_SHAPES, flagROC } from './a-kit.js';
import { FLOOR, bush, fbox, planter, tree, windowGrid } from './a-parts.js';

const G = GROUND;
const BOX = UNIT_SHAPES.box();

export function create({ world, quality = 'full' }) {
  const b = new Builder({ world, quality, atlas: new Atlas(2048, 2048) });
  for (const site of world.siteList) {
    if (site.kind === 'bank' && site.place === 'lot') drawBank(b.site(site), site);
    else if (site.kind === 'cinema') drawCinema(b.site(site), site);
    else if (site.kind === 'temple') drawTemple(b.site(site), site);
  }
  return b.finish('downtown');
}
export const preview = ctx => create(ctx);

const doorZ = p => (p.f.point(p.site.door) || { z: 0 }).z;

// A small glowing part on a channel; `phase` makes 'beacon' parts chase one another.
function bulb(p, x, y, z, s, color, emit, channel = 'sign', phase = 0, power = 2.4) {
  return p.box(x, y, z, s, s, s, color, 0, 'glow', { glow: [GLOW[channel], p.slot, phase], emit, power });
}
// A glowing unit shape (lanterns, flames).
function glowShape(p, u, x, y, z, sx, sy, sz, color, emit, channel = 'sign', power = 1.1, phase = 0) {
  return p.put(u, x, y, z, null, [sx, sy, sz], color, 'glow', { glow: [GLOW[channel], p.slot, phase], emit, power });
}

// ====================================================================== the bank
const STONE = '#e8e0cf', STONE_D = '#d2c8b2', PLINTH = '#a39b8a', TEAL = '#25504d', TEAL_L = '#2f6560', GOLD = '#d8b350', BRONZE = '#5a4430';

function drawBank(p, site) {
  const F = p.f.foot, A = p.f.area, top = G + site.floors * FLOOR, dz = doorZ(p), fx = F.x1, atlas = p.b.atlas;
  const hs = Math.min(16.5, F.d * 0.29), cx = fx + 3.3;
  atlas.text('bank-roof', '小鎮銀行', { color: GOLD, background: TEAL, size: 120, weight: 900, pad: 0.35, border: GOLD, radius: 0.1 });
  atlas.text('bank-frieze', '小鎮銀行總行  ◆  存款 匯兌 理財 信託', { color: '#f3dd9a', background: TEAL, size: 64, weight: 800, pad: 0.3 });
  atlas.text('bank-atm', '24H 自動櫃員機', { color: '#ffffff', background: '#2b8a5e', size: 80, weight: 900, pad: 0.3, radius: 0.15 });
  atlas.text('bank-pylon', 'ATM', { color: '#ffffff', background: '#2b8a5e', size: 130, weight: 900, pad: 0.3, border: '#d9f3e4', radius: 0.12 });
  atlas.text('bank-drive', '車道提款', { color: '#ffffff', background: '#2b6aa0', size: 80, weight: 900, pad: 0.3, radius: 0.15 });
  atlas.text('bank-flag', '小鎮銀行', { color: GOLD, background: TEAL, size: 90, weight: 900, pad: 0.3, border: GOLD });
  flagROC(atlas);

  // body: plinth, stone block, floor courses, a cornice that doubles as the roof slab
  p.span(F.x0 - 0.4, fx + 0.3, G, G + 0.9, F.z0 - 0.4, F.z1 + 0.4, PLINTH);
  p.span(F.x0, fx, G + 0.5, top, F.z0, F.z1, STONE);
  for (let k = 1; k < site.floors; k++) {
    const y = G + FLOOR * k;
    p.span(F.x0 - 0.14, fx + 0.14, y - 0.25, y + 0.25, F.z0 - 0.14, F.z0 + 0.2, STONE_D);
    p.span(F.x0 - 0.14, fx + 0.14, y - 0.25, y + 0.25, F.z1 - 0.2, F.z1 + 0.14, STONE_D);
    p.span(F.x0 - 0.14, F.x0 + 0.2, y - 0.25, y + 0.25, F.z0 + 0.2, F.z1 - 0.2, STONE_D);
    p.span(fx - 0.2, fx + 0.14, y - 0.25, y + 0.25, F.z0 + 0.2, dz - hs - 1.0, STONE_D);
    p.span(fx - 0.2, fx + 0.14, y - 0.25, y + 0.25, dz + hs + 1.0, F.z1 - 0.2, STONE_D);
  }
  p.span(F.x0 - 0.7, F.x1 + 0.7, top - 0.7, top + 0.3, F.z0 - 0.7, F.z1 + 0.7, STONE_D);
  for (const sx of [F.x0, fx]) for (const sz of [F.z0, F.z1]) p.box(sx, G + 0.95, sz, 1.1, top - G - 0.85, 1.1, STONE_D);
  // parapet on the roof, plant and mast
  const roofY = top + 0.3;
  p.span(F.x0 - 0.35, fx + 0.35, roofY, roofY + 0.9, F.z0 - 0.35, F.z0 + 0.15, STONE);
  p.span(F.x0 - 0.35, fx + 0.35, roofY, roofY + 0.9, F.z1 - 0.15, F.z1 + 0.35, STONE);
  p.span(F.x0 - 0.35, F.x0 + 0.15, roofY, roofY + 0.9, F.z0 + 0.15, F.z1 - 0.15, STONE);
  p.span(fx - 0.15, fx + 0.35, roofY, roofY + 0.9, F.z0 + 0.15, dz - hs - 1.7, STONE);
  p.span(fx - 0.15, fx + 0.35, roofY, roofY + 0.9, dz + hs + 1.7, F.z1 - 0.15, STONE);
  roofPlant(p, F.x0 + 5, F.z0 + 6, roofY);
  roofPlant(p, F.x0 + 5, F.z1 - 12, roofY);
  p.cyl(F.x0 + 14, roofY, dz, 0.25, 12, '#8c949b', 6, 'body', undefined, 0.5);
  p.glowBox(F.x0 + 14, roofY + 12, dz, 0.7, 0.7, 0.7, '#a02620', '#ff3b30', 'beacon', 1.6);

  // windows with stone surrounds; the front wings, both sides and the back
  const winOpts = { floor0: 0, floor1: site.floors, pitch: 5.2, w: 2.7, h: 3.4, sill: 1.7, margin: 2.0, panes: 2, glass: ['#8fb3c0', '#9ab9c4'], light: ['#ffd9a0', '#ffc978', '#fff0c8'] };
  const surround = (face, plane) => i => {
    fbox(p, face, plane, i.a, i.yc + i.h / 2, i.w + 1.0, 0.4, 0.4, STONE_D);
    fbox(p, face, plane, i.a, i.yc - i.h / 2 - 0.3, i.w + 0.9, 0.3, 0.5, STONE_D);
    for (const s of [-1, 1]) fbox(p, face, plane, i.a + s * (i.w / 2 + 0.28), i.yc - i.h / 2, 0.4, i.h, 0.25, STONE_D);
  };
  windowGrid(p, F, 'f', { ...winOpts, from: F.z0, to: dz - hs - 1.0, each: surround('f', fx) });
  windowGrid(p, F, 'f', { ...winOpts, from: dz + hs + 1.0, to: F.z1, each: surround('f', fx) });
  windowGrid(p, F, 'b', { ...winOpts, each: surround('b', F.x0) });
  windowGrid(p, F, 'p', { ...winOpts, each: surround('p', F.z1) });
  windowGrid(p, F, 'n', { ...winOpts, skip: i => i.f === 0 && i.a > 4 && i.a < 17, each: surround('n', F.z0) });

  // the portico: a platform and two steps, eight columns, an entablature and a lit frieze
  p.span(fx - 0.2, fx + 4.9, G, G + 1.35, dz - hs - 0.9, dz + hs + 0.9, STONE_D);
  p.span(fx - 0.5, fx + 6.2, G, G + 0.45, dz - hs - 2.0, dz + hs + 2.0, PLINTH);
  p.span(fx - 0.35, fx + 5.6, G, G + 1.0, dz - hs - 1.4, dz + hs + 1.4, '#c8bfaa');
  for (let i = 0; i < 8; i++) {
    const z = dz - hs + (2 * hs * i) / 7;
    p.box(cx, G + 1.35, z, 2.4, 0.5, 2.4, STONE_D);
    p.cyl(cx, G + 1.85, z, 0.85, 19.15, '#f2ecdc', 12, 'body', undefined, 0.92);
    p.box(cx, G + 21.0, z, 2.5, 0.6, 2.5, STONE_D);
  }
  p.span(fx - 0.2, fx + 4.7, G + 21.6, G + 24.55, dz - hs - 0.9, dz + hs + 0.9, STONE);
  p.span(fx + 4.7, fx + 4.85, G + 22.4, G + 23.7, dz - hs - 0.7, dz + hs + 0.7, TEAL);
  const fr = atlas.items.get('bank-frieze'), fh = 1.0;
  p.sign('bank-frieze', 'f', fx + 4.85, G + 23.05, dz, Math.min(2 * hs + 1.2, fh * fr.aspect), { h: fh });
  p.span(fx - 0.35, fx + 5.3, G + 24.3, G + 24.85, dz - hs - 1.5, dz + hs + 1.5, STONE_D);
  // roof sign on two posts
  const rs = atlas.items.get('bank-roof'), rh = 5.0, rw = rh * rs.aspect, sy = G + 24.85 + 2.2;
  for (const s of [-1, 1]) p.box(fx + 2.4, G + 24.85, dz + s * (rw / 2 - 1.5), 0.6, 2.4, 0.6, '#3b4045');
  p.box(fx + 2.4, sy, dz, 0.8, rh + 0.7, rw + 0.7, '#233c3a');
  p.sign('bank-roof', 'f', fx + 2.8, sy + (rh + 0.7) / 2, dz, rw, { h: rh });
  p.sign('bank-roof', 'b', fx + 2.0, sy + (rh + 0.7) / 2, dz, rw, { h: rh });
  // the banking hall: tall lit glass between the columns, dark mullions, bronze doors at site.door
  const gy0 = G + 1.35, gy1 = G + 21.0, gz = hs - 0.8;
  p.glowQuad(fx + 0.15, (gy0 + gy1) / 2, dz, gz * 2, gy1 - gy0, 'f', '#9fc0cc', '#ffe1b0', 'entry', 0.55);
  for (let k = 0; k <= 10; k++) {
    const z = dz - gz + (2 * gz * k) / 10;
    if (Math.abs(z - dz) < 3.9) continue;
    p.span(fx - 0.1, fx + 0.5, gy0, gy1, z - 0.17, z + 0.17, '#33403f');
  }
  for (const y of [G + 6.4, G + 12.4, G + 18.4]) p.span(fx - 0.15, fx + 0.5, y - 0.15, y + 0.15, dz - gz - 0.17, dz + gz + 0.17, '#33403f');
  p.span(fx - 0.25, fx + 0.6, gy0, G + 6.3, dz - 3.3, dz + 3.3, BRONZE);
  p.glowQuad(fx + 0.72, G + 3.9, dz, 5.6, 4.7, 'f', '#8fb2bf', '#ffe2b0', 'entry', 1.0);
  for (const k of [-2.4, 0, 2.4]) p.span(fx + 0.5, fx + 0.95, G + 1.5, G + 6.0, dz + k - 0.15, dz + k + 0.15, '#7a5a38');
  p.span(fx + 0.45, fx + 0.95, G + 3.6, G + 3.9, dz - 2.7, dz + 2.7, '#7a5a38');
  for (const k of [-0.5, 0.5]) p.span(fx + 0.95, fx + 1.15, G + 3.0, G + 4.3, dz + k * 1.2 - 0.07, dz + k * 1.2 + 0.07, GOLD);
  p.span(fx - 0.3, fx + 0.9, G + 6.3, G + 6.9, dz - 3.6, dz + 3.6, '#7a5a38');

  // forecourt: paving, a path, planters, trees, flags
  p.pad(fx + 0.3, A.x1 - 0.3, dz - A.d / 2 + 0.5, dz + A.d / 2 - 0.5, '#d9d1c0', 0.2);
  p.pad(fx + 6.2, A.x1 - 0.5, dz - 3, dz + 3, '#c3b698', 0.25);
  for (const z of [-9, -13.5, 9, 13.5]) planter(p, A.x1 - 1.2, dz + z, 1.6, 4.2, G, { color: '#9a7a5e' });
  for (const z of [-8, 8]) p.box(A.x1 - 1.2, G, dz + z, 1.6, 0.45, 1.6, '#9a7a5e');
  for (let i = 0; i < 6; i++) tree(p, F.x0 - 5.5, F.z0 + 4 + i * (F.d - 8) / 5, 7.5);
  for (let i = 0; i < 3; i++) tree(p, F.x0 + 8 + i * 12, F.z1 + 3.2, 6.5);
  const flag = (z, key, w, h) => {
    p.cyl(fx + 7.4, G, dz + z, 0.17, 17, '#c9ccd0', 6);
    p.blob(fx + 7.4, G + 17.2, dz + z, 0.35, GOLD);
    p.sign(key, 'p', fx + 7.4 + w / 2 + 0.15, G + 15.6 - h / 2 + 0.2, dz + z, w, { h, channel: null, power: 0.55 });
  };
  flag(-21, 'flag-roc', 5.4, 3.6);
  flag(-25.5, 'bank-flag', 5.4, 3.0);

  // the 24h ATM lobby: its own little glass pavilion with a lit sign, a pylon beside it
  const lx0 = fx + 1.8, lx1 = fx + 7.4, lz0 = dz + 19.8, lz1 = dz + 27.6, lh = 4.4;
  p.span(lx0 - 0.4, lx1 + 0.4, G, G + 0.4, lz0 - 0.4, lz1 + 0.4, '#b8b09e');
  p.span(lx0, lx0 + 0.3, G + 0.4, G + lh, lz0, lz1, STONE);
  for (const x of [lx0, lx1]) for (const z of [lz0, lz1]) p.box(x, G + 0.4, z, 0.5, lh, 0.5, TEAL);
  p.span(lx0 - 0.5, lx1 + 0.5, G + lh, G + lh + 1.2, lz0 - 0.5, lz1 + 0.5, TEAL_L);
  for (const [face, x, z, w] of [['f', lx1, (lz0 + lz1) / 2, lz1 - lz0 - 0.5], ['p', (lx0 + lx1) / 2, lz1, lx1 - lx0 - 0.5], ['n', (lx0 + lx1) / 2, lz0, lx1 - lx0 - 0.5]]) {
    p.quad(x, G + 0.4 + (lh - 0.4) / 2, z, w, lh - 0.4, face, '#9fd0e0', 'clear');
  }
  p.glowBox((lx0 + lx1) / 2, G + lh - 0.2, (lz0 + lz1) / 2, lx1 - lx0 - 0.8, 0.2, lz1 - lz0 - 0.8, '#ffffff', '#d8f4ff', 'always', 1.1);
  const at = atlas.items.get('bank-atm'), aw = Math.min(lz1 - lz0, 0.95 * at.aspect);
  p.sign('bank-atm', 'f', lx1 + 0.5, G + lh + 0.6, (lz0 + lz1) / 2, aw, { h: aw / at.aspect, channel: 'always', power: 0.9 });
  for (const k of [0.3, 0.7]) {
    const z = lz0 + (lz1 - lz0) * k;
    p.box(lx0 + 0.95, G + 0.4, z, 1.2, 3.0, 1.5, '#3b4248');
    p.glowQuad(lx0 + 1.57, G + 2.6, z, 1.1, 0.8, 'f', '#2a5a70', '#9fe0ff', 'always', 1.2);
    p.box(lx0 + 1.4, G + 1.5, z, 0.7, 0.14, 1.2, '#59606a');
  }
  p.box(lx1 + 2.0, G, lz0 - 1.5, 0.5, 8.5, 0.5, '#3b4045');
  const py = atlas.items.get('bank-pylon');
  p.box(lx1 + 2.0, G + 8.5, lz0 - 1.5, 0.7, 3.0, 3.6, '#1f4d3a');
  p.sign('bank-pylon', 'f', lx1 + 2.38, G + 10.0, lz0 - 1.5, 3.2, { h: 3.2 / py.aspect * 1.2 > 2.6 ? 2.6 : 3.2 / py.aspect, channel: 'always' });
  p.sign('bank-pylon', 'b', lx1 + 1.62, G + 10.0, lz0 - 1.5, 3.2, { h: 3.2 / py.aspect > 2.6 ? 2.6 : 3.2 / py.aspect, channel: 'always' });

  // the drive-up ATM lane along the near side wall: asphalt, a canopy, a kiosk against the wall
  const lane = { x0: F.x0 + 6, x1: A.x1 - 0.4, z0: F.z0 - 5.4, z1: F.z0 - 0.7 };
  p.pad(lane.x0, lane.x1, lane.z0, lane.z1, '#4d5156', 0.24);
  p.pad(lane.x0 + 1, lane.x1 - 1, lane.z0 + 0.4, lane.z0 + 0.6, '#f1eee4', 0.28);
  p.pad(lane.x0 + 1, lane.x1 - 1, lane.z1 - 0.6, lane.z1 - 0.4, '#f1eee4', 0.28);
  for (let i = 0; i < 4; i++) p.pad(lane.x0 + 3 + i * 5, lane.x0 + 5.5 + i * 5, (lane.z0 + lane.z1) / 2 - 0.15, (lane.z0 + lane.z1) / 2 + 0.15, '#f1eee4', 0.28);
  const kx = 10.5;
  p.box(kx, G, F.z0 - 0.6, 4.2, 4.2, 1.5, '#3b4248');
  p.box(kx, G + 4.2, F.z0 - 0.6, 4.8, 0.3, 2.0, TEAL);
  p.glowQuad(kx, G + 2.9, F.z0 - 1.46, 1.8, 1.0, 'n', '#2a5a70', '#9fe0ff', 'always', 1.2);
  p.box(kx, G, F.z0 - 1.4, 3.2, 1.4, 0.2, '#59606a');
  const cz0 = lane.z0 - 0.2, cz1 = F.z0 + 0.0, cy = G + 5.6;
  p.span(kx - 6.2, kx + 6.2, cy, cy + 0.9, cz0, cz1, TEAL_L);
  for (const x of [kx - 5.6, kx + 5.6]) p.box(x, G, lane.z0 + 0.5, 0.5, cy - G, 0.5, '#3b4045');
  p.glowBox(kx, cy - 0.12, (cz0 + cz1) / 2, 11.0, 0.12, 3.2, '#ffffff', '#fff2d6', 'always', 1.0);
  const dr = atlas.items.get('bank-drive'), dw = 0.85 * dr.aspect;
  p.sign('bank-drive', 'n', kx, cy + 0.45, cz0, dw, { h: 0.85, channel: 'always' });
  p.sign('bank-drive', 'f', kx + 6.2, cy + 0.45, (cz0 + cz1) / 2, dw, { h: 0.85, channel: 'always' });

  // light
  p.light(fx + 5, 5, dz, 16, '#ffe2b8', 0.9, 'facade', 'entrance');
  p.light(fx + 4.5, 4, lz0 + 4, 10, '#d8f4ff', 0.7, 'facade', 'atm');
  p.light(kx, 4, lane.z0 + 2, 9, '#d8f4ff', 0.55, 'facade', 'atm-lane');
  p.light(fx + 5, 14, dz, 18, '#ffd9a0', 0.8, 'sign', 'roof-sign');
  p.light(fx + 5, 4, F.z0 + 4, 10, '#ffe4b8', 0.4, 'facade', 'floodlight');
}

// A roof plant block: unit casing and a stair house.
function roofPlant(p, x, z, y) {
  p.box(x, y, z, 6, 3.2, 8, '#d6d0c4');
  p.box(x, y + 3.2, z, 6.6, 0.3, 8.6, '#8e8a82');
  for (let i = 0; i < 2; i++) {
    p.box(x + 9, y, z - 2 + i * 4, 2.4, 1.7, 1.8, '#c9cdd0');
    p.disc(x + 9, y + 1.72, z - 2 + i * 4, 0.7, '#5b6168', 8, 'u');
  }
}

// ====================================================================== the cinema
const NAVY = '#2a3152', NAVY_D = '#1b2038', PLUM = '#5b2d62', GOLDY = '#f0b93a', CREAM = '#f6ecd6', MAGENTA = '#d8434a';
const POSTERS = [
  ['銀河小郵差', '#5b3a9a', '#f7c35a', 'moon'], ['午夜糖果店', '#b0306a', '#ffe08a', 'candy'], ['雲端上的家', '#2f78b8', '#ffffff', 'cloud'],
  ['旋風小廚神', '#d9622b', '#fff0c0', 'pan'], ['月光下的約定', '#26385f', '#f3e3a0', 'crescent'], ['勇者與鎮長', '#3f8f5a', '#fff3b8', 'shield']
];

function drawPoster(c, x, y, w, h, [title, bg, ink, shape]) {
  const grad = c.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, bg); grad.addColorStop(1, '#10122a');
  c.fillStyle = grad; c.fillRect(x, y, w, h);
  c.fillStyle = ink; c.strokeStyle = ink;
  const cx = x + w / 2, cy = y + h * 0.36;
  for (let i = 0; i < 26; i++) { c.globalAlpha = 0.5 + 0.5 * unit(title + i); c.fillRect(x + unit(title + 'x' + i) * w, y + unit(title + 'y' + i) * h * 0.6, 3, 3); }
  c.globalAlpha = 1;
  if (shape === 'moon' || shape === 'crescent') {
    c.beginPath(); c.arc(cx, cy, w * 0.26, 0, Math.PI * 2); c.fill();
    if (shape === 'crescent') { c.fillStyle = bg; c.beginPath(); c.arc(cx + w * 0.12, cy - w * 0.05, w * 0.24, 0, Math.PI * 2); c.fill(); }
    else { c.fillStyle = '#1a1a3a'; c.beginPath(); c.arc(cx, cy + w * 0.2, w * 0.1, 0, Math.PI * 2); c.fill(); c.fillRect(cx - w * 0.02, cy + w * 0.2, w * 0.04, w * 0.22); }
  } else if (shape === 'candy') {
    for (let i = 0; i < 5; i++) { c.fillStyle = ['#ffd24a', '#ff7aa8', '#7ad7ff', '#9cff8a', '#ffffff'][i]; c.beginPath(); c.arc(x + w * (0.2 + 0.15 * i), cy + Math.sin(i * 1.7) * w * 0.12, w * 0.085, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = ink; c.fillRect(cx - w * 0.3, cy + w * 0.2, w * 0.6, w * 0.05);
  } else if (shape === 'cloud') {
    for (const [dx, dy, r] of [[-0.18, 0.04, 0.16], [0, -0.06, 0.2], [0.2, 0.04, 0.15], [0, 0.08, 0.2]]) { c.beginPath(); c.arc(cx + w * dx, cy + w * dy, w * r, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#d9622b'; c.fillRect(cx - w * 0.07, cy - w * 0.18, w * 0.14, w * 0.12);
    c.beginPath(); c.moveTo(cx - w * 0.1, cy - w * 0.18); c.lineTo(cx, cy - w * 0.3); c.lineTo(cx + w * 0.1, cy - w * 0.18); c.fill();
  } else if (shape === 'pan') {
    c.beginPath(); c.arc(cx - w * 0.05, cy, w * 0.22, 0, Math.PI * 2); c.fill();
    c.fillRect(cx + w * 0.15, cy - w * 0.03, w * 0.3, w * 0.06);
    c.fillStyle = '#ff5a2a'; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(cx - w * 0.2 + i * w * 0.15, cy - w * 0.22); c.lineTo(cx - w * 0.14 + i * w * 0.15, cy - w * 0.42); c.lineTo(cx - w * 0.08 + i * w * 0.15, cy - w * 0.22); c.fill(); }
  } else {
    c.beginPath(); c.moveTo(cx - w * 0.22, cy - w * 0.22); c.lineTo(cx + w * 0.22, cy - w * 0.22); c.lineTo(cx + w * 0.22, cy + w * 0.05); c.lineTo(cx, cy + w * 0.3); c.lineTo(cx - w * 0.22, cy + w * 0.05); c.closePath(); c.fill();
    c.fillStyle = bg; c.fillRect(cx - w * 0.04, cy - w * 0.14, w * 0.08, w * 0.34); c.fillRect(cx - w * 0.14, cy - w * 0.04, w * 0.28, w * 0.07);
  }
  c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const chars = [...title], size = Math.min(w * 0.17, h * 0.62 / Math.ceil(chars.length / 2));
  c.font = `900 ${size}px "Microsoft JhengHei", "Noto Sans TC", "PingFang TC", sans-serif`;
  const half = Math.ceil(chars.length / 2), rows = [chars.slice(0, half).join(''), chars.slice(half).join('')];
  rows.forEach((r, i) => c.fillText(r, cx, y + h * 0.7 + (i - 0.5) * size * 1.15));
  c.strokeStyle = ink; c.lineWidth = 4; c.strokeRect(x + 4, y + 4, w - 8, h - 8);
}

function drawSky(c, x, y, w, h) {
  const grad = c.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, '#171b3d'); grad.addColorStop(0.55, '#2a2a63'); grad.addColorStop(1, '#43306b');
  c.fillStyle = grad; c.fillRect(x, y, w, h);
  c.fillStyle = 'rgba(140,110,220,0.22)';
  c.beginPath(); c.ellipse(x + w * 0.65, y + h * 0.55, w * 0.32, h * 0.14, -0.25, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(90,150,230,0.18)';
  c.beginPath(); c.ellipse(x + w * 0.3, y + h * 0.35, w * 0.25, h * 0.1, 0.2, 0, Math.PI * 2); c.fill();
  for (let i = 0; i < 150; i++) {
    const sx = x + unit('sk' + i) * w, sy = y + unit('sy' + i) * h, r = 1.2 + unit('sr' + i) * 2.4;
    c.fillStyle = ['#ffffff', '#ffe9a8', '#bfd8ff'][i % 3]; c.globalAlpha = 0.55 + 0.45 * unit('sa' + i);
    if (i % 11 === 0) {
      c.beginPath(); c.moveTo(sx, sy - r * 3); c.lineTo(sx + r * 0.8, sy - r * 0.8); c.lineTo(sx + r * 3, sy); c.lineTo(sx + r * 0.8, sy + r * 0.8);
      c.lineTo(sx, sy + r * 3); c.lineTo(sx - r * 0.8, sy + r * 0.8); c.lineTo(sx - r * 3, sy); c.lineTo(sx - r * 0.8, sy - r * 0.8); c.closePath(); c.fill();
    } else { c.beginPath(); c.arc(sx, sy, r, 0, Math.PI * 2); c.fill(); }
  }
  c.globalAlpha = 1;
  c.fillStyle = '#ffe9a8'; c.beginPath(); c.arc(x + w * 0.86, y + h * 0.2, h * 0.11, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#2a2a63'; c.beginPath(); c.arc(x + w * 0.86 + h * 0.05, y + h * 0.2 - h * 0.03, h * 0.1, 0, Math.PI * 2); c.fill();
}

function drawCinema(p, site) {
  const F = p.f.foot, A = p.f.area, top = G + site.floors * FLOOR, dz = doorZ(p), fx = F.x1, atlas = p.b.atlas;
  atlas.add('cinema-sky', 768, 256, drawSky);
  POSTERS.forEach((spec, i) => atlas.add('poster' + i, 190, 285, (c, x, y, w, h) => drawPoster(c, x, y, w, h, spec)));
  atlas.text('cinema-roof', '星空影城', { color: '#fff3c4', background: '#2a2a63', size: 120, weight: 900, pad: 0.35, border: GOLDY, radius: 0.12 });
  atlas.text('cinema-blade', '星空影城', { color: '#ffffff', background: '#5b2d62', size: 84, vertical: true, pad: 0.3, border: GOLDY });
  atlas.text('cinema-marquee', '今日熱映  ★  星空影城', { color: '#fff3c4', background: null, size: 76, weight: 900, pad: 0.1 });
  atlas.text('cinema-star', '★', { color: GOLDY, background: null, size: 150, weight: 700, pad: 0.1 });
  atlas.text('cinema-ticket', '售票處', { color: '#fff3c4', background: MAGENTA, size: 70, weight: 900, pad: 0.3, radius: 0.15 });
  atlas.text('cinema-popcorn', '爆米花', { color: MAGENTA, background: '#fff6e0', size: 80, weight: 900, pad: 0.25, radius: 0.12 });
  atlas.text('cinema-exit', '太平門', { color: '#ffffff', background: '#2b8a5e', size: 60, weight: 900, pad: 0.25 });

  // body: plinth, the navy box, a plum cornice, a gold trim line, stepped auditorium volumes
  p.span(F.x0 - 0.3, fx + 0.2, G, G + 0.7, F.z0 - 0.3, F.z1 + 0.3, NAVY_D);
  p.span(F.x0, fx, G + 0.3, top, F.z0, F.z1, NAVY);
  p.span(F.x0 - 0.5, fx + 0.5, top - 0.5, top + 0.3, F.z0 - 0.5, F.z1 + 0.5, PLUM);
  p.span(F.x0 - 0.15, fx + 0.15, top - 1.4, top - 1.0, F.z0 - 0.15, F.z0 + 0.1, GOLDY);
  p.span(F.x0 - 0.15, fx + 0.15, top - 1.4, top - 1.0, F.z1 - 0.1, F.z1 + 0.15, GOLDY);
  p.span(F.x0 - 0.15, F.x0 + 0.1, top - 1.4, top - 1.0, F.z0 + 0.1, F.z1 - 0.1, GOLDY);
  p.span(fx - 0.1, fx + 0.15, top - 1.4, top - 1.0, F.z0 + 0.1, F.z1 - 0.1, GOLDY);
  p.span(F.x0 + 0.5, F.x0 + 17, top, top + 5, F.z0 + 0.5, dz - 1.0, '#343c66');
  p.span(F.x0 + 0.5, F.x0 + 17, top, top + 8, dz + 1.0, F.z1 - 0.5, '#343c66');
  p.span(F.x0 + 0.3, F.x0 + 17.2, top + 5, top + 5.3, F.z0 + 0.3, dz - 0.8, PLUM);
  p.span(F.x0 + 0.3, F.x0 + 17.2, top + 8, top + 8.3, dz + 0.8, F.z1 - 0.3, PLUM);
  p.span(F.x0 + 20, F.x0 + 30, top + 0.3, top + 2.4, dz - 12, dz + 12, '#3a4270');
  for (let i = 0; i < 4; i++) p.box(F.x0 + 27, top + 2.4, dz - 8 + i * 5, 2.4, 1.7, 1.8, '#c9cdd0');

  // the starry walls: side, back and the upper front, with the lit sky texture
  const sky = (face, plane, a0, a1, y0, y1, off) => {
    const w = a1 - a0, h = y1 - y0;
    if (face === 'f' || face === 'b') p.sign('cinema-sky', face, plane + off, (y0 + y1) / 2, (a0 + a1) / 2, w, { h, power: 0.75 });
    else p.sign('cinema-sky', face, (a0 + a1) / 2, (y0 + y1) / 2, plane + off, w, { h, power: 0.75 });
  };
  sky('n', F.z0, F.x0 + 0.6, fx - 0.6, G + 0.9, top - 1.7, 0);
  sky('p', F.z1, F.x0 + 0.6, fx - 0.6, G + 0.9, top - 1.7, 0);
  sky('b', F.x0, F.z0 + 0.6, F.z1 - 0.6, G + 0.9, top - 1.7, 0);
  sky('f', fx, F.z0 + 0.6, F.z1 - 0.6, G + 10.4, top - 1.7, 0);
  for (const [face, plane, a] of [['n', F.z0, 0], ['p', F.z1, 0]]) {
    for (const x of [F.x0 + 5, fx - 5]) {
      const door = [x, a];
      fbox(p, face, plane, door[0], G + 0.3, 3.2, 4.6, 0.5, '#3b4045');
      p.glowQuad(face === 'n' ? door[0] : door[0], G + 2.6, plane + (face === 'p' ? 0.4 : -0.4), 2.6, 4.0, face, '#8fe0b0', '#aaffcc', 'entry', 0.8);
      p.sign('cinema-exit', face, door[0], G + 5.6, plane, 2.6, { channel: 'entry' });
    }
  }
  // foyer windows at both ends of the front
  const fw = { floor0: 0, floor1: 2, pitch: 3.6, w: 2.2, h: 2.2, sill: 1.8, margin: 1.4, panes: 2, glass: '#7fa0b8', light: ['#ffd9a0', '#ffc978'] };
  windowGrid(p, F, 'f', { ...fw, from: F.z0, to: dz - 21.5 });
  windowGrid(p, F, 'f', { ...fw, from: dz + 21.5, to: F.z1 });
  // lobby: a long lit glass front, dark mullions and the doors at site.door
  const ly1 = G + 8.0, lz = 21;
  p.glowQuad(fx + 0.3, (G + 0.3 + ly1) / 2, dz, lz * 2, ly1 - G - 0.3, 'f', '#b6d2dd', '#ffd89a', 'entry', 0.7);
  for (let k = 0; k <= 12; k++) {
    const z = dz - lz + (2 * lz * k) / 12;
    if (Math.abs(z - dz) < 6.0) continue;
    p.span(fx - 0.1, fx + 0.7, G + 0.3, ly1 - 0.06, z - 0.2, z + 0.2, NAVY_D);
  }
  p.span(fx - 0.15, fx + 0.7, G + 4.4, G + 4.7, dz - lz - 0.2, dz + lz + 0.2, NAVY_D);
  p.span(fx - 0.2, fx + 0.7, G + 7.3, G + 7.65, dz - lz - 0.2, dz + lz + 0.2, NAVY_D);
  p.span(fx - 0.3, fx + 0.9, G + 0.3, G + 6.6, dz - 5.2, dz + 5.2, GOLDY);
  p.glowQuad(fx + 1.0, G + 3.4, dz, 4.5 * 2, 6.0, 'f', '#d8e8ef', '#fff0c8', 'entry', 1.3);
  for (const k of [-4.5, -2.25, 0, 2.25, 4.5]) p.span(fx + 0.9, fx + 1.15, G + 0.4, G + 6.4, dz + k - 0.12, dz + k + 0.12, '#a8761e');
  // red carpet and forecourt paving
  p.pad(fx + 0.3, A.x1 - 0.3, dz - A.d / 2 + 0.5, dz + A.d / 2 - 0.5, '#cfc8bb', 0.2);
  p.pad(fx + 1.2, A.x1 - 0.5, dz - 3.2, dz + 3.2, MAGENTA, 0.25);
  p.pad(fx + 1.5, A.x1 - 0.7, dz - 3.0, dz - 2.6, GOLDY, 0.29);
  p.pad(fx + 1.5, A.x1 - 0.7, dz + 2.6, dz + 3.0, GOLDY, 0.29);

  // the marquee: a deep canopy edged in chasing bulbs, tie rods to the wall, supports
  const my0 = G + 8.0, my1 = G + 10.4, md = 7.0, mz = 16;
  p.span(fx, fx + md, my0, my1, dz - mz, dz + mz, PLUM);
  p.span(fx - 0.1, fx + md + 0.25, my1, my1 + 0.4, dz - mz - 0.25, dz + mz + 0.25, GOLDY);
  p.span(fx + 0.4, fx + md - 0.4, my0 - 0.15, my0, dz - mz + 0.4, dz + mz - 0.4, '#3a1d40');
  const mq = atlas.items.get('cinema-marquee'), mh = 1.3;
  p.sign('cinema-marquee', 'f', fx + md, (my0 + my1) / 2, dz, Math.min(2 * mz - 4, mh * mq.aspect), { h: mh, power: 1.2 });
  const nF = Math.round((2 * mz) / 1.3), nS = 5;
  for (let i = 0; i <= nF; i++) {
    const z = dz - mz + (2 * mz * i) / nF, ph = i / nF;
    bulb(p, fx + md + 0.12, my0 + 0.22, z, 0.4, '#fff0c0', '#ffc845', 'beacon', ph * 2);
    bulb(p, fx + md + 0.12, my1 - 0.22, z, 0.4, '#fff0c0', '#ffc845', 'beacon', ph * 2 + 0.5);
  }
  for (const s of [-1, 1]) for (let i = 1; i <= nS; i++) {
    const x = fx + md - (md * i) / (nS + 0.4);
    bulb(p, x, my0 + 0.22, dz + s * (mz + 0.12), 0.4, '#fff0c0', '#ffc845', 'beacon', i / nS);
    bulb(p, x, my1 - 0.22, dz + s * (mz + 0.12), 0.4, '#fff0c0', '#ffc845', 'beacon', i / nS + 0.5);
  }
  p.glowBox(fx + md / 2, my0 - 0.45, dz, md - 1.0, 0.15, 2 * mz - 1.5, '#fff2d6', '#ffe6b8', 'entry', 1.2);
  for (const z of [-mz + 0.8, -5.6, 5.6, mz - 0.8]) p.box(fx + md - 0.6, G, dz + z, 0.5, my0 - G - 0.15, 0.5, GOLDY);
  for (const z of [-mz + 3, mz - 3]) p.beam(fx, dz + z, fx + md - 0.6, dz + z, my0 + 0.8, 0.14, 0.14, '#8c949b');

  // framed posters across the wall above, stars between them
  const pw = 3.7, ph2 = 5.55, py = G + 13.7;
  for (let i = 0; i < 6; i++) {
    const z = dz - 21.5 + i * 8.6;
    p.span(fx, fx + 0.35, py - ph2 / 2 - 0.35, py + ph2 / 2 + 0.35, z - pw / 2 - 0.35, z + pw / 2 + 0.35, '#7a5a1e');
    p.sign('poster' + i, 'f', fx + 0.35, py, z, pw, { h: ph2, power: 0.95 });
    if (i < 5) p.sign('cinema-star', 'f', fx + 0.05, py, z + 4.3, 2.2, { h: 2.2, power: 1.2 });
  }
  // blade sign at the near front corner, with a bracket
  const bl = atlas.items.get('cinema-blade'), bh = 13.5, bw = bh * bl.aspect, bz = F.z1 - 1.0, bx = fx + bw / 2 + 0.5;
  p.span(fx, bx + bw / 2 + 0.2, G + 5.0 + bh + 0.3, G + 5.0 + bh + 0.6, bz - 0.2, bz + 0.2, '#2b3036');
  p.span(fx, bx + bw / 2 + 0.2, G + 4.7, G + 5.0, bz - 0.2, bz + 0.2, '#2b3036');
  p.box(bx, G + 5.0, bz, bw + 0.4, bh, 0.4, '#1b1830');
  p.sign('cinema-blade', 'p', bx, G + 5.0 + bh / 2, bz + 0.2, bw, { h: bh });
  p.sign('cinema-blade', 'n', bx, G + 5.0 + bh / 2, bz - 0.2, bw, { h: bh });
  // roof sign: a board on posts, a star at each end
  const rs = atlas.items.get('cinema-roof'), rh = 5.2, rw = rh * rs.aspect, ry = top + 0.3 + 2.0;
  for (const s of [-1, 1]) p.box(fx - 3, top + 0.3, dz + s * (rw / 2 - 1.5), 0.6, 2.2, 0.6, '#3b4045');
  p.box(fx - 3, ry, dz, 0.8, rh + 0.7, rw + 0.7, '#14173a');
  p.sign('cinema-roof', 'f', fx - 2.6, ry + (rh + 0.7) / 2, dz, rw, { h: rh });
  p.sign('cinema-roof', 'b', fx - 3.4, ry + (rh + 0.7) / 2, dz, rw, { h: rh });
  for (const s of [-1, 1]) {
    p.sign('cinema-star', 'f', fx - 2.6, ry + (rh + 0.7) / 2, dz + s * (rw / 2 + 3.2), 5.0, { h: 5.0, power: 1.3 });
    p.sign('cinema-star', 'b', fx - 3.4, ry + (rh + 0.7) / 2, dz + s * (rw / 2 + 3.2), 5.0, { h: 5.0, power: 1.3 });
  }
  // the ticket booth
  const tz = dz - 22.5, tx = fx + 4.2;
  p.box(tx, G, tz, 4.2, 3.2, 5.6, PLUM);
  p.glowQuad(tx + 2.15, G + 2.0, tz, 3.6, 1.5, 'f', '#a8c4d0', '#ffd89a', 'entry', 1.0);
  p.box(tx, G + 3.2, tz, 5.2, 0.35, 6.6, MAGENTA);
  p.box(tx + 2.5, G + 1.3, tz, 0.6, 0.18, 4.0, '#e8d8a8');
  const tk = atlas.items.get('cinema-ticket');
  p.sign('cinema-ticket', 'f', tx + 2.6, G + 4.4, tz, 0.95 * tk.aspect, { h: 0.95 });
  p.box(tx, G + 3.55, tz, 4.4, 1.9, 0.3, NAVY_D);
  // popcorn: a striped box on a pole, popcorn on top
  const px = fx + 5, pz = dz + 22, py0 = G + 4.4;
  p.box(px, G, pz, 0.45, py0, 0.45, '#3b4045');
  p.box(px, py0, pz, 3.0, 3.4, 3.0, '#fff6e0');
  for (let i = 0; i < 5; i++) {
    p.span(px - 1.62, px + 1.62, py0 + 0.05, py0 + 3.3, pz - 1.2 + i * 0.6 - 0.15, pz - 1.2 + i * 0.6 + 0.15, MAGENTA);
  }
  const pc = atlas.items.get('cinema-popcorn');
  p.sign('cinema-popcorn', 'f', px + 1.62, py0 + 1.7, pz, 2.4, { h: 2.4 / pc.aspect });
  p.sign('cinema-popcorn', 'b', px - 1.62, py0 + 1.7, pz, 2.4, { h: 2.4 / pc.aspect });
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4, r = 0.9 + 0.3 * unit('pop' + i);
    glowShape(p, UNIT_SHAPES.ico(), px + Math.cos(a) * 0.9, py0 + 3.5 + 0.45 * (i % 3), pz + Math.sin(a) * 0.9, r, r * 0.9, r, '#f7e3a0', '#ffd870', 'sign', 0.7);
  }
  for (let i = 0; i < 3; i++) tree(p, F.x0 - 5, F.z0 + 6 + i * (F.d - 12) / 2, 7);
  for (const z of [-27, 27]) planter(p, A.x1 - 1.2, dz + z - 2, 1.6, 5, G, { color: '#6b4a72' });

  p.light(fx + md + 1, 7, dz, 18, '#ffd5a0', 0.95, 'sign', 'marquee');
  p.light(fx + 4, 4, dz, 14, '#ffe2b8', 0.8, 'facade', 'entrance');
  p.light(fx + 2, 12, bz, 14, '#c8a0ff', 0.7, 'sign', 'blade');
  p.light(tx + 3, 4, tz, 9, '#ffd5a0', 0.6, 'facade', 'ticket');
  p.light(fx - 2, top + 5, dz, 18, '#c8b0ff', 0.7, 'sign', 'roof-sign');
}

// ====================================================================== the temple
const RED = '#b3382a', RED_D = '#8f2a20', RED_W = '#b8412f', TEMPLE_GOLD = '#e0b040', T_STONE = '#cfc8b6', T_STONE_D = '#a9a290', WOOD = '#4d392b';
const TILE = '#d9782d', TILE_D = '#b9582a', JADE = '#2f8f66', CYAN = '#2a7f8f', INK = '#2a2220';

function drawGods(c, x, y, w, h, flip) {
  c.fillStyle = '#6e1f16'; c.fillRect(x, y, w, h);
  c.strokeStyle = '#e0b040'; c.lineWidth = 5; c.strokeRect(x + 4, y + 4, w - 8, h - 8);
  const robes = flip ? ['#2f8f66', '#d8a02a'] : ['#c43a2a', '#2a6aa8'], faces = flip ? ['#e9c08a', '#3a2a24'] : ['#d9774a', '#e9c08a'];
  for (let i = 0; i < 2; i++) {
    const gx = x + w * (0.25 + 0.5 * i), gw = w * 0.4, top = y + h * 0.06;
    c.fillStyle = flip ? '#8a2a1c' : '#7e2418'; c.fillRect(gx - gw / 2 - 4, top, gw + 8, h * 0.88);
    c.fillStyle = '#e0b040'; c.beginPath(); c.moveTo(gx - gw * 0.4, top + h * 0.17); c.lineTo(gx - gw * 0.55, top + h * 0.04); c.lineTo(gx - gw * 0.2, top + h * 0.1);
    c.lineTo(gx, top); c.lineTo(gx + gw * 0.2, top + h * 0.1); c.lineTo(gx + gw * 0.55, top + h * 0.04); c.lineTo(gx + gw * 0.4, top + h * 0.17); c.closePath(); c.fill();
    c.fillStyle = faces[i]; c.beginPath(); c.ellipse(gx, top + h * 0.2, gw * 0.3, h * 0.085, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = INK; c.fillRect(gx - gw * 0.22, top + h * 0.17, gw * 0.15, 4); c.fillRect(gx + gw * 0.07, top + h * 0.17, gw * 0.15, 4);
    c.beginPath(); c.moveTo(gx - gw * 0.2, top + h * 0.24); c.quadraticCurveTo(gx, top + h * 0.34, gx + gw * 0.2, top + h * 0.24); c.quadraticCurveTo(gx, top + h * 0.29, gx - gw * 0.2, top + h * 0.24); c.fill();
    c.fillStyle = robes[i]; c.beginPath(); c.moveTo(gx - gw * 0.5, top + h * 0.3); c.lineTo(gx + gw * 0.5, top + h * 0.3); c.lineTo(gx + gw * 0.58, top + h * 0.62); c.lineTo(gx - gw * 0.58, top + h * 0.62); c.closePath(); c.fill();
    c.fillStyle = '#e0b040'; c.fillRect(gx - gw * 0.5, top + h * 0.5, gw, h * 0.03);
    c.beginPath(); c.arc(gx, top + h * 0.42, gw * 0.1, 0, Math.PI * 2); c.fill();
    c.fillStyle = flip ? '#d8a02a' : '#2a6aa8'; c.fillRect(gx - gw * 0.45, top + h * 0.62, gw * 0.9, h * 0.22);
    c.fillStyle = INK; c.fillRect(gx - gw * 0.4, top + h * 0.84, gw * 0.32, h * 0.04); c.fillRect(gx + gw * 0.08, top + h * 0.84, gw * 0.32, h * 0.04);
    c.strokeStyle = '#d9d9d9'; c.lineWidth = 6; c.beginPath(); c.moveTo(gx + (i ? -1 : 1) * gw * 0.62, top + h * 0.9); c.lineTo(gx + (i ? -1 : 1) * gw * 0.62, top + h * 0.12); c.stroke();
    c.fillStyle = '#e0b040'; c.beginPath(); c.arc(gx + (i ? -1 : 1) * gw * 0.62, top + h * 0.1, 7, 0, Math.PI * 2); c.fill();
  }
  c.fillStyle = '#e0b040';
  for (let r = 0; r < 3; r++) for (let k = 0; k < 8; k++) c.fillRect(x + w * (0.06 + 0.125 * k), y + h * (0.93 + 0.0 * r), 4, 4);
}

// A slab along a roof's cross-section: from (a0,y0) to (a1,y1) over ridge extent b0..b1.
// `lift` is how far its centre stands above the line, along the normal.
function slab(p, axis, cx, cz, a0, y0, a1, y1, b0, b1, t, lift, color, ext = 0) {
  if (ext) {
    const l = Math.hypot(a1 - a0, y1 - y0), ux = ((a1 - a0) / l) * ext, uy = ((y1 - y0) / l) * ext;
    a0 -= ux; y0 -= uy; a1 += ux; y1 += uy;
  }
  const phi = Math.atan2(y1 - y0, a1 - a0), L = Math.hypot(a1 - a0, y1 - y0);
  const ma = (a0 + a1) / 2 - Math.sin(phi) * lift, my = (y0 + y1) / 2 + Math.cos(phi) * lift, mb = (b0 + b1) / 2, w = b1 - b0;
  if (axis === 'z') p.put(BOX, cx + ma, my, cz + mb, [0, 0, phi], [L, t, w], color);
  else p.put(BOX, cx + mb, my, cz + ma, [-phi, 0, 0], [w, t, L], color);
}
// A tilted bar in the ridge's own plane (b along the ridge, y up): swallowtail pieces.
function tilt(p, axis, cx, cz, aOff, b0, y0, b1, y1, w, t, color) {
  if (b1 < b0) [b0, y0, b1, y1] = [b1, y1, b0, y0];
  const phi = Math.atan2(y1 - y0, b1 - b0), L = Math.hypot(b1 - b0, y1 - y0), mb = (b0 + b1) / 2, my = (y0 + y1) / 2;
  if (axis === 'z') p.put(BOX, cx + aOff, my, cz + mb, [-phi, 0, 0], [w, t, L], color);
  else p.put(BOX, cx + mb, my, cz + aOff, [0, 0, phi], [L, t, w], color);
}
const at2 = (axis, cx, cz, a, b) => (axis === 'z' ? [cx + a, cz + b] : [cx + b, cz + a]);

// A gable-end infill: the wall triangle between the wall top and the roof, in plane b = bPlane.
function gableCap(p, axis, cx, cz, bPlane, sgn, yW, d, prof, color) {
  const half = d / 2;
  const yAt = a => {
    for (let i = 0; i + 1 < prof.length; i++) if (a <= prof[i + 1][0]) return prof[i][1] + ((a - prof[i][0]) / (prof[i + 1][0] - prof[i][0])) * (prof[i + 1][1] - prof[i][1]);
    return prof[prof.length - 1][1];
  };
  const cut = prof.filter(q => q[0] > 0 && q[0] < half), edge = yAt(half) - 0.3;
  const poly = [[-half, yW], [-half, edge], ...[...cut].reverse().map(q => [-q[0], q[1] - 0.3]), [0, prof[0][1] - 0.3],
    ...cut.map(q => [q[0], q[1] - 0.3]), [half, edge], [half, yW]];
  const nor = axis === 'z' ? [0, 0, sgn] : [sgn, 0, 0], pos = [], nrm = [], C = [0, yW];
  const P3 = q => (axis === 'z' ? [cx + q[0], q[1], bPlane] : [bPlane, q[1], cz + q[0]]);
  for (let i = 0; i + 1 < poly.length; i++) {
    const v = [C, poly[i], poly[i + 1]].map(P3);
    const e1 = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]], e2 = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (n[0] * nor[0] + n[1] * nor[1] + n[2] * nor[2] < 0) [v[1], v[2]] = [v[2], v[1]];
    for (const q of v) { pos.push(...q); nrm.push(...nor); }
  }
  // positions are already in the site's local frame: put them with an identity transform
  p.put({ pos, nor: nrm, uv: null }, 0, 0, 0, null, [1, 1, 1], color);
}

// A curved (concave) tile roof with a ridge, swallowtail ends and gable infills.
// o: {axis ('z' ridge along z, 'x' along x), cx, cz, Lr (ridge length), d (wall depth across),
//     yW (wall top), yE (eave), yR (ridge), over (eave overhang), tail (swallowtail size)}
function tileRoof(p, o) {
  const { axis, cx, cz, Lr, d, yW, yE, yR, over = 2.0, tail = 1, gable = RED_W, lite = false } = o;
  const H = d / 2 + over, r = yR - yE, bo0 = Lr / 2 + 1.0;
  const prof = [[0, yR], [0.5 * H, yR - 0.66 * r], [H, yE], [H + 1.4, yE + 0.8]];
  const colorOf = i => (i === 2 ? JADE : TILE);
  for (let i = 0; i < 3; i++) {
    // each segment's gable end sits a hair further out than the last, so no two end faces are coplanar
    const [a0, y0] = prof[i], [a1, y1] = prof[i + 1], t = i === 2 ? 0.62 : 0.5, lift = t / 2, bo = bo0 + 0.05 * i;
    slab(p, axis, cx, cz, a0, y0, a1, y1, -bo, bo, t, lift, colorOf(i));
    slab(p, axis, cx, cz, -a1, y1, -a0, y0, -bo, bo, t, lift, colorOf(i));
    // the hanging ridges (垂脊) down both gable edges, standing proud of the slope
    for (const sg of [-1, 1]) {
      const e0 = sg * (Lr / 2 - 0.4 - 0.05 * i), e1 = sg * (bo + 0.15), col = i === 2 ? TEMPLE_GOLD : TILE_D;
      slab(p, axis, cx, cz, a0, y0, a1, y1, Math.min(e0, e1), Math.max(e0, e1), 0.95, 0.3, col, 0.12);
      slab(p, axis, cx, cz, -a1, y1, -a0, y0, Math.min(e0, e1), Math.max(e0, e1), 0.95, 0.3, col, 0.12);
    }
  }
  // tile ribs on the two long slopes
  const step = lite ? 2.4 : 1.7, n = Math.floor((2 * bo0 - 1.6) / step);
  for (let i = 0; i <= n; i++) {
    const b = -bo0 + 0.8 + i * step;
    if (Math.abs(Math.abs(b) - Lr / 2) < 0.9) continue;
    for (let k = 0; k < 2; k++) {
      slab(p, axis, cx, cz, prof[k][0], prof[k][1], prof[k + 1][0], prof[k + 1][1], b - 0.14, b + 0.14, 0.14, 0.57, TILE_D);
      slab(p, axis, cx, cz, -prof[k + 1][0], prof[k + 1][1], -prof[k][0], prof[k][1], b - 0.14, b + 0.14, 0.14, 0.57, TILE_D);
    }
  }
  // the ridge, a gold line along it, and the swallowtail ends
  const rl = Lr / 2 + 0.6, [rx, rz] = at2(axis, cx, cz, 0, 0);
  if (axis === 'z') {
    p.span(rx - 1.0, rx + 1.0, yR - 0.35, yR + 1.0, rz - rl, rz + rl, TILE_D);
    p.span(rx - 0.5, rx + 0.5, yR + 1.0, yR + 1.2, rz - rl, rz + rl, TEMPLE_GOLD);
  } else {
    p.span(rx - rl, rx + rl, yR - 0.35, yR + 1.0, rz - 1.0, rz + 1.0, TILE_D);
    p.span(rx - rl, rx + rl, yR + 1.0, yR + 1.2, rz - 0.5, rz + 0.5, TEMPLE_GOLD);
  }
  const k = tail;
  for (const s of [-1, 1]) {
    const e = s * (Lr / 2 + 0.4);
    const seg = [[e - s * 0.2, yR + 0.5], [e + s * 1.8 * k, yR + 0.8 * k + 0.1], [e + s * 3.2 * k, yR + 1.8 * k + 0.1]];
    tilt(p, axis, cx, cz, 0, seg[0][0], seg[0][1], seg[1][0], seg[1][1], 1.6, 0.9, TILE_D);
    tilt(p, axis, cx, cz, 0, seg[1][0], seg[1][1], seg[2][0], seg[2][1], 1.3, 0.8, TILE_D);
    for (const q of [-1, 1]) {
      tilt(p, axis, cx, cz, q * 0.5, seg[2][0], seg[2][1], seg[2][0] + s * 0.9 * k, yR + 3.1 * k, 0.55, 0.6, TEMPLE_GOLD);
    }
  }
  // gable infills (a medallion in each)
  for (const s of [-1, 1]) {
    const bp = s * Lr / 2;
    gableCap(p, axis, cx, cz, (axis === 'z' ? cz : cx) + bp, s, yW, d, prof, gable);
    const [mx, mz] = at2(axis, cx, cz, 0, bp + s * 0.06);
    const my = yW + (yR - yW) * 0.4;
    if (axis === 'z') p.disc(mx, my, mz, Math.min(1.5, (yR - yW) * 0.22), TEMPLE_GOLD, 12, s > 0 ? 'p' : 'n');
    else p.disc(mx, my, mz, Math.min(1.5, (yR - yW) * 0.22), TEMPLE_GOLD, 12, s > 0 ? 'f' : 'b');
  }
}

// Dragons facing a pearl along the ridge (stylised blobs), a lotus under the pearl.
function ridgeDecor(p, axis, cx, cz, yR, Lr, scale = 1) {
  const y0 = yR + 1.2, put = (a, y, b, r, color, sy = 1) => { const [x, z] = at2(axis, cx, cz, a, b); p.blob(x, y, z, r, color, sy); };
  const [px, pz] = at2(axis, cx, cz, 0, 0);
  p.cone(px, y0, pz, 1.1 * scale, 0.9 * scale, '#e8923a', 8);
  put(0, y0 + 1.9 * scale, 0, 0.95 * scale, '#ffd860');
  put(0, y0 + 1.9 * scale, 0, 1.25 * scale, '#ffb030', 0.15);
  for (const s of [-1, 1]) {
    const n = 8, from = 2.6 * scale, to = Lr / 2 - 1.6;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), b = s * (from + (to - from) * t), y = y0 + 0.55 * scale + Math.sin(t * 5.6) * 0.45 * scale;
      put(0, y, b, (1.0 - 0.5 * t) * scale, JADE, 0.8);
      const [x, z] = at2(axis, cx, cz, 0, b);
      p.cone(x, y + 0.7 * scale * (1 - 0.4 * t), z, 0.28 * scale, 0.8 * scale, TEMPLE_GOLD, 5);
    }
    const hb = s * 2.9 * scale;
    put(0, y0 + 1.5 * scale, hb, 1.15 * scale, JADE, 0.9);
    put(0, y0 + 1.1 * scale, s * 2.1 * scale, 0.7 * scale, '#e8923a', 0.7);
    for (const q of [-1, 1]) {
      const [x, z] = at2(axis, cx, cz, q * 0.55 * scale, hb + s * 0.2);
      p.cone(x, y0 + 2.3 * scale, z, 0.2 * scale, 0.9 * scale, TEMPLE_GOLD, 5);
    }
  }
}

// A 斗拱-style painted beam band under the eaves: alternating colour blocks.
function paintedBeam(p, face, plane, a0, a1, y, h, out, sgn = 1) {
  const n = Math.max(2, Math.round((a1 - a0) / 2.2)), w = (a1 - a0) / n, cols = [CYAN, TEMPLE_GOLD, JADE, '#c43a2a'];
  for (let i = 0; i < n; i++) {
    const a = a0 + w * (i + 0.5);
    if (face === 'f') {
      p.box(plane + sgn * out / 2, y, a, out, h, w - 0.1, i % 2 ? '#7a2a20' : '#5a2a22');
      p.box(plane + sgn * (out + 0.1), y + h * 0.2, a, 0.2, h * 0.6, w - 0.7, cols[i % 4]);
    }
  }
}

function banyan(p, x, z, s = 1) {
  p.cyl(x, G, z, 1.3 * s, 7.5 * s, '#6b5238', 8, 'body', undefined, 0.75);
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05 + unit('by' + x + i), r = (3.2 + 2.6 * unit('bz' + z + i)) * s;
    p.cyl(x + Math.cos(a) * r, G, z + Math.sin(a) * r, 0.2 * s, 9 * s, '#7a5e44', 5, 'body', undefined, 0.8);
  }
  const greens = ['#43733a', '#4f8040', '#3d6b36', '#5a8a45'];
  p.blob(x, G + 11 * s, z, 7.2 * s, greens[0], 0.62);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26 + 0.4;
    p.blob(x + Math.cos(a) * 5 * s, G + (9.2 + (i % 2) * 1.6) * s, z + Math.sin(a) * 5 * s, 4.4 * s, greens[1 + (i % 3)], 0.68);
  }
  p.blob(x, G + 14.2 * s, z, 4.4 * s, greens[3], 0.7);
}

function lantern(p, x, y, z, r, phase = 0) {
  glowShape(p, UNIT_SHAPES.ico(), x, y, z, r, r * 1.2, r, '#d83a2a', '#ff7a3a', 'sign', 1.1, phase);
  p.box(x, y + r * 1.15, z, r * 0.7, 0.18, r * 0.7, TEMPLE_GOLD);
  p.box(x, y - r * 1.15 - 0.18, z, r * 0.6, 0.18, r * 0.6, TEMPLE_GOLD);
  p.box(x, y - r * 1.15 - 0.9, z, 0.1, 0.72, 0.1, '#e8b830');
  p.box(x, y + r * 1.33, z, 0.12, 0.6, 0.12, '#3b3430');
}

function stoneLion(p, x, z) {
  p.box(x, G, z, 2.4, 1.5, 2.4, T_STONE_D);
  p.box(x, G + 1.5, z, 2.0, 0.25, 2.0, T_STONE);
  const y = G + 1.75, c = '#bdb59f';
  p.box(x - 0.2, y + 0.35, z, 1.7, 1.3, 1.2, c);
  p.blob(x + 0.5, y + 1.55, z, 0.85, c, 1.0);
  p.blob(x + 0.45, y + 1.5, z, 1.05, '#a89f88', 0.9);
  p.box(x + 1.0, y + 1.0, z, 0.8, 0.6, 0.8, c);
  for (const q of [-1, 1]) {
    p.box(x + 0.7, y, z + q * 0.4, 0.4, 0.8, 0.35, c);
    p.box(x - 0.9, y, z + q * 0.4, 0.45, 0.8, 0.4, c);
  }
  p.blob(x - 1.1, y + 1.0, z, 0.35, '#a89f88');
  p.blob(x + 0.6, y + 0.1, z + 0.55, 0.28, '#e0b040');
}

function drawTemple(p, site) {
  const F = p.f.foot, A = p.f.area, atlas = p.b.atlas, gate = p.f.point(site.gate) || { x: A.x1, z: 0 }, lite = p.lite;
  const gz = gate.z, xFront = A.x1 - 3.0, hallFront = F.x1;
  atlas.text('temple-plaque', site.name, { color: TEMPLE_GOLD, background: '#1c1512', size: 120, weight: 900, pad: 0.3, border: TEMPLE_GOLD, radius: 0.05 });
  atlas.text('temple-hall', '天上聖母', { color: TEMPLE_GOLD, background: '#1c1512', size: 100, weight: 900, pad: 0.3, border: TEMPLE_GOLD, radius: 0.05 });
  atlas.text('couplet-a', '海上慈航庇萬民', { color: TEMPLE_GOLD, background: RED_D, size: 62, weight: 900, vertical: true, pad: 0.3, border: TEMPLE_GOLD });
  atlas.text('couplet-b', '湄洲聖德佑四方', { color: TEMPLE_GOLD, background: RED_D, size: 62, weight: 900, vertical: true, pad: 0.3, border: TEMPLE_GOLD });
  atlas.add('gods-a', 320, 400, (c, x, y, w, h) => drawGods(c, x, y, w, h, false));
  atlas.add('gods-b', 320, 400, (c, x, y, w, h) => drawGods(c, x, y, w, h, true));

  // ---- the courtyard floor: stone, a lighter spirit way along the axis, a round under the burner
  const X0 = A.x0 + 0.8, X1 = xFront - 0.5, Z0 = A.z0 + 0.8, Z1 = A.z1 - 0.8;
  p.pad(X0, X1, Z0, Z1, '#cdc4b0', 0.2);
  p.pad(F.x1 + 3.4, X1 - 0.2, gz - 3.2, gz + 3.2, '#e2d9c6', 0.26);
  p.pad(xFront + 0.5, A.x1 - 0.2, Z0, Z1, '#cdc4b0', 0.2);
  p.pad(xFront - 6, A.x1 - 0.2, gz - 4.2, gz + 4.2, '#e6dcc8', 0.3);

  // ---- the compound wall: plinth, red plaster, tile cap, pilasters, lattice windows, corner piers
  const wh = 4.2, t = 1.0, cxW0 = A.x0 + 0.3 + t / 2, cxW1 = xFront - t / 2, czW0 = A.z0 + 0.3 + t / 2, czW1 = A.z1 - 0.3 - t / 2;
  const gateHalf = 14.0;
  // walls built from axis-aligned spans so every layer clearly stands proud of the one below
  const wallRun = (alongX, c, a0, a1) => {
    const sp = (lo, hi, y0, y1, ext, color) => (alongX
      ? p.span(a0 - 0.0, a1 + 0.0, y0, y1, c - t / 2 - ext, c + t / 2 + ext, color)
      : p.span(c - t / 2 - ext, c + t / 2 + ext, y0, y1, a0, a1, color));
    sp(0, 0, G, G + 0.6, 0.25, T_STONE_D);
    sp(0, 0, G + 0.6, G + wh, 0, RED_W);
    sp(0, 0, G + wh, G + wh + 0.5, 0.35, TILE);
    sp(0, 0, G + wh + 0.5, G + wh + 0.78, 0.05, TILE_D);
    const len = a1 - a0, n = Math.max(1, Math.round(len / 9));
    for (let i = 0; i < n; i++) {
      const m = a0 + (len * (i + 0.5)) / n;
      // pilaster pair at the bay edges and a lattice window in the bay
      const wv = (lo, hi, y0, y1, ext, color) => (alongX
        ? p.span(m + lo, m + hi, y0, y1, c - t / 2 - ext, c + t / 2 + ext, color)
        : p.span(c - t / 2 - ext, c + t / 2 + ext, m + lo, m + hi, y0, y1, color)); // (not used)
      void wv;
      const frame = (hw, hh, ext, color) => (alongX
        ? p.span(m - hw, m + hw, G + 2.2 - hh, G + 2.2 + hh, c - t / 2 - ext, c + t / 2 + ext, color)
        : p.span(c - t / 2 - ext, c + t / 2 + ext, G + 2.2 - hh, G + 2.2 + hh, m - hw, m + hw, color));
      frame(1.4, 1.1, 0.1, TEMPLE_GOLD);
      frame(1.15, 0.85, 0.18, INK);
      for (let k = -1; k <= 1; k++) (alongX
        ? p.span(m + k * 0.7 - 0.07, m + k * 0.7 + 0.07, G + 1.4, G + 3.0, c - t / 2 - 0.26, c + t / 2 + 0.26, TEMPLE_GOLD)
        : p.span(c - t / 2 - 0.26, c + t / 2 + 0.26, G + 1.4, G + 3.0, m + k * 0.7 - 0.07, m + k * 0.7 + 0.07, TEMPLE_GOLD));
      const pe = a0 + (len * i) / n;
      if (i > 0) (alongX
        ? p.span(pe - 0.45, pe + 0.45, G + 0.7, G + wh - 0.1, c - t / 2 - 0.15, c + t / 2 + 0.15, T_STONE)
        : p.span(c - t / 2 - 0.15, c + t / 2 + 0.15, G + 0.7, G + wh - 0.1, pe - 0.45, pe + 0.45, T_STONE));
    }
  };
  const pier = (x, z) => {
    p.box(x, G, z, t + 1.3, 0.8, t + 1.3, T_STONE_D);
    p.box(x, G + 0.8, z, t + 0.7, wh + 0.4, t + 0.7, RED_D);
    p.pyramid(x, G + wh + 1.2, z, t + 1.8, t + 1.8, 1.4, TILE);
    p.blob(x, G + wh + 2.8, z, 0.3, TEMPLE_GOLD);
  };
  wallRun(true, czW0, cxW0 + 1.0, cxW1 - 1.0);
  wallRun(true, czW1, cxW0 + 1.0, cxW1 - 1.0);
  wallRun(false, cxW0, czW0 + 1.0, czW1 - 1.0);
  wallRun(false, cxW1, gz + gateHalf, czW1 - 1.0);
  wallRun(false, cxW1, czW0 + 1.0, gz - gateHalf);
  for (const x of [cxW0, cxW1]) for (const z of [czW0, czW1]) pier(x, z);

  // ---- 三川門, the front gate hall, standing in the wall line
  const gx1 = xFront, gx0 = xFront - 5.8, gy = G + 7.0, pr = 0.75;
  const gw = gateHalf, door = 4.2;
  for (const s of [-1, 1]) {
    p.span(gx0 - 0.4, gx1 + 0.5, G, G + 0.9, Math.min(gz + s * (door - 0.3), gz + s * (gw + 0.5)), Math.max(gz + s * (door - 0.3), gz + s * (gw + 0.5)), T_STONE_D);
    const z0 = gz + s * door, z1 = gz + s * gw;
    p.span(gx0, gx1, G + 0.6, gy + 0.8, Math.min(z0, z1), Math.max(z0, z1), RED_W);
    p.sign(s > 0 ? 'gods-a' : 'gods-b', 'f', gx1 + 0.32, G + 4.0, gz + s * (door + gw) / 2, 7.4, { h: 6.3, power: 0.55, channel: 'entry' });
    p.span(gx1, gx1 + 0.26, G + 1.0, G + 7.2, Math.min(z0, z1) + 0.9, Math.max(z0, z1) - 0.9, WOOD);
  }
  // passage lintel board and the plaque over the gate
  p.span(gx0 - 0.1, gx1 + 0.3, gy, gy + 0.9, gz - door - 0.6, gz + door + 0.6, '#5a2a22');
  const pq = atlas.items.get('temple-plaque'), ph = 1.7;
  p.box(gx1 + 0.12, gy + 0.9, gz, 0.35, 2.1, ph * pq.aspect + 0.7, '#3a2418');
  p.sign('temple-plaque', 'f', gx1 + 0.3, gy + 0.9 + 1.05, gz, ph * pq.aspect, { h: ph, power: 1.0 });
  p.sign('temple-plaque', 'b', gx0 - 0.1, gy + 0.9 + 1.05, gz, ph * pq.aspect, { h: ph, power: 1.0 });
  for (const s of [-1, 1]) for (const e of [door, gw]) {
    const z = gz + s * e;
    p.box(gx1 + 0.4, G + 0.9, z, 1.9, 0.45, 1.9, T_STONE);
    p.cyl(gx1 + 0.4, G + 1.35, z, pr, 6.3, RED, 12, 'body', undefined, 0.92);
    p.box(gx1 + 0.4, G + 7.35, z, 1.3, 0.4, 1.3, TEMPLE_GOLD);
  }
  paintedBeam(p, 'f', gx1 + 0.4, gz - gw - 0.5, gz + gw + 0.5, G + 7.0, 1.0, 1.1);
  tileRoof(p, { axis: 'z', cx: (gx0 + gx1) / 2, cz: gz, Lr: gw * 2 + 0.6, d: gx1 - gx0, yW: gy + 0.8, yE: G + 9.6, yR: G + 14.6, over: 2.0, tail: 1.25, lite });
  ridgeDecor(p, 'z', (gx0 + gx1) / 2, gz, G + 14.6, gw * 2 + 0.6, 0.85);
  for (const s of [-1, 1]) stoneLion(p, A.x1 - 1.2, gz + s * 7.2);
  // a pair of lanterns each side under the gate eaves
  for (const s of [-1, 1]) {
    lantern(p, gx1 + 1.0, G + 5.6, gz + s * 2.3, 0.9, 0.0);
    for (const e of [6.4, 9.4, 12.2]) lantern(p, gx1 + 1.2, G + 6.0, gz + s * e, 0.75, e / 14);
  }

  // ---- the main hall on its platform: walls, painted doors, dragon pillars, two low wings
  const hx0 = F.x0 + 0.6, hx1 = hallFront - 0.6 - 2.6, hw = Math.min(14.0, F.d * 0.26), yWall = G + 8.7;
  p.span(F.x0 - 0.4, hallFront + 1.0, G, G + 1.15, F.z0 - 0.4, F.z1 + 0.4, T_STONE);
  p.span(hallFront + 1.0, hallFront + 2.8, G, G + 0.6, gz - 5.5, gz + 5.5, T_STONE_D);
  p.span(hx0, hx1, G + 1.0, yWall, gz - hw, gz + hw, RED_D);
  // front: doors, side windows, dragon pillars, couplets, hall plaque
  p.glowQuad(hx1 + 0.12, G + 4.4, gz, 6.6, 6.2, 'f', '#a02a1e', '#ffb468', 'entry', 0.9);
  p.span(hx1, hx1 + 0.3, G + 1.15, G + 7.7, gz - 3.8, gz + 3.8, '#4a2a1e');
  p.span(hx1 + 0.3, hx1 + 0.5, G + 1.4, G + 7.4, gz - 0.12, gz + 0.12, TEMPLE_GOLD);
  for (let r = 0; r < 5; r++) for (const s of [-1, 1]) for (let k = 1; k <= 2; k++) p.span(hx1 + 0.3, hx1 + 0.55, G + 1.9 + r * 1.1, G + 2.2 + r * 1.1, gz + s * (k * 1.45) - 0.15, gz + s * (k * 1.45) + 0.15, TEMPLE_GOLD);
  for (const s of [-1, 1]) {
    for (const off of [6.2, 10.0]) {
      p.span(hx1, hx1 + 0.25, G + 2.6, G + 6.0, gz + s * off - 1.5, gz + s * off + 1.5, TEMPLE_GOLD);
      p.window('f', hx1 + 0.4, G + 4.3, gz + s * off, 2.6, 3.2, { glass: '#6a3a24', light: '#ffc27a', panes: 3, power: 1.0 });
    }
  }
  const ct = atlas.items.get('couplet-a'), cth = 6.4, ctw = cth * ct.aspect;
  for (const [i, s] of [[0, -1], [1, 1]]) p.sign(i ? 'couplet-b' : 'couplet-a', 'f', hallFront - 0.5 + 0.0 + 0.05, G + 4.7, gz + s * (4.2 + 1.4), ctw, { h: cth, power: 0.9 });
  for (const s of [-1, 1]) for (const e of [4.2, hw - 1.0]) {
    const z = gz + s * e, x = hallFront - 0.9, st = e === 4.2;
    p.box(x, G + 1.15, z, 1.9, 0.5, 1.9, T_STONE_D);
    p.cyl(x, G + 1.65, z, st ? 0.9 : 0.68, 7.0, st ? '#ddd3bc' : RED, st ? 8 : 12, 'body', undefined, 0.95);
    p.box(x, G + 8.65, z, 1.3, 0.35, 1.3, TEMPLE_GOLD);
    if (st) for (let i = 0; i < 12; i++) {
      const a = i * 0.9, yy = G + 2.3 + i * 0.5;
      p.blob(x + Math.cos(a) * 0.95, yy, z + Math.sin(a) * 0.95, 0.38, i === 11 ? '#e0b040' : '#c8bda0', 1.0);
    }
  }
  paintedBeam(p, 'f', hallFront - 0.9, gz - hw - 0.3, gz + hw + 0.3, G + 8.7, 1.1, 1.3);
  const hp = atlas.items.get('temple-hall'), hh = 1.6;
  p.box(hallFront - 0.2, G + 10.4, gz, 0.4, hh + 0.5, hh * hp.aspect + 0.6, '#3a2418');
  p.sign('temple-hall', 'f', hallFront, G + 10.4 + (hh + 0.5) / 2, gz, hh * hp.aspect, { h: hh, power: 1.0 });
  // the two low wings (護龍), ridge along x
  for (const s of [-1, 1]) {
    const z0 = gz + s * (hw - 0.4), z1 = gz + s * (hw + 11.5), wx0 = hx0 + 2, wx1 = hx1 - 1.8;
    p.span(wx0, wx1, G + 1.0, G + 5.4, Math.min(z0, z1), Math.max(z0, z1), RED_D);
    p.window('f', wx1 + 0.1, G + 3.4, gz + s * (hw + 5.8), 3.2, 2.4, { glass: '#6a3a24', light: '#ffc27a', panes: 2, power: 1.0 });
    for (let i = 0; i < 3; i++) p.window(s > 0 ? 'p' : 'n', wx0 + 4 + i * 4.4, G + 3.3, (s > 0 ? z1 : z1) + (s > 0 ? 0.1 : -0.1), 2.4, 2.2, { glass: '#6a3a24', light: '#ffc27a', panes: 2, power: 1.0 });
    tileRoof(p, { axis: 'x', cx: (wx0 + wx1) / 2, cz: (z0 + z1) / 2, Lr: wx1 - wx0, d: 11.9, yW: G + 5.4, yE: G + 5.9, yR: G + 10.4, over: 1.7, tail: 0.95, lite });
    ridgeDecor(p, 'x', (wx0 + wx1) / 2, (z0 + z1) / 2, G + 10.4, wx1 - wx0, 0.6);
    lantern(p, wx1 + 1.2, G + 4.0, (z0 + z1) / 2, 0.7, 0.3);
  }
  tileRoof(p, { axis: 'z', cx: (hx0 + hallFront + 0.2) / 2 - 1.0, cz: gz, Lr: hw * 2, d: hallFront + 0.2 - hx0 + 0.0, yW: yWall, yE: G + 9.8, yR: G + 15.8, over: 2.2, tail: 1.6, lite });
  ridgeDecor(p, 'z', (hx0 + hallFront + 0.2) / 2 - 1.0, gz, G + 15.8, hw * 2, 1.0);
  for (let i = 0; i < 7; i++) lantern(p, hallFront + 1.6, G + 6.2, gz - 12.6 + i * 4.2, 0.8, i / 7);
  lantern(p, hallFront + 1.6, G + 5.6, gz - 1.6, 1.0, 0.1);
  lantern(p, hallFront + 1.6, G + 5.6, gz + 1.6, 1.0, 0.6);

  // ---- 天公爐: the big incense burner under a small roof, on the axis
  const bx = F.x1 + 11, bz = gz;
  p.cyl(bx, G, bz, 3.8, 0.5, T_STONE_D, 8);
  p.cyl(bx, G + 0.5, bz, 3.1, 0.5, T_STONE, 8);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    p.cyl(bx + sx * 2.5, G + 1.0, bz + sz * 2.5, 0.28, 5.4, RED, 8);
  }
  p.span(bx - 3.0, bx + 3.0, G + 6.4, G + 6.9, bz - 3.0, bz + 3.0, '#5a2a22');
  p.pyramid(bx, G + 6.9, bz, 8.6, 8.6, 2.6, TILE);
  p.pyramid(bx, G + 6.8, bz, 9.2, 9.2, 0.25, JADE);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) tilt(p, 'x', bx + sx * 4.1, bz + sz * 4.1, 0, -0.1, G + 6.9, 0.7, G + 7.9, 0.5, 0.4, TEMPLE_GOLD);
  p.blob(bx, G + 9.8, bz, 0.55, TEMPLE_GOLD);
  p.cyl(bx, G + 1.0, bz, 1.7, 1.6, '#8a6a30', 12, 'body', undefined, 1.25);
  p.cyl(bx, G + 2.6, bz, 2.25, 0.3, '#c9a24a', 12);
  p.cyl(bx, G + 2.9, bz, 1.9, 0.18, '#3b2a20', 12);
  for (const s of [-1, 1]) p.box(bx, G + 2.2, bz + s * 2.75, 0.4, 1.4, 0.5, '#c9a24a');
  for (let i = 0; i < 9; i++) {
    const a = i * 0.7, rr = 0.45 + 0.9 * unit('inc' + i);
    p.box(bx + Math.cos(a) * rr, G + 3.0, bz + Math.sin(a) * rr, 0.1, 1.5, 0.1, '#7a2a1c');
    glowShape(p, BOX, bx + Math.cos(a) * rr, G + 4.55, bz + Math.sin(a) * rr, 0.16, 0.16, 0.16, '#ff7a3a', '#ff7a3a', 'sign', 1.5);
  }
  // ---- 金爐: the golden furnace for paper offerings, a small pagoda with a glowing mouth
  const fx2 = F.x1 + 10, fz2 = gz - 20;
  p.box(fx2, G, fz2, 5.0, 1.0, 5.0, T_STONE_D);
  p.box(fx2, G + 1.0, fz2, 4.2, 4.0, 4.2, RED);
  p.box(fx2, G + 5.0, fz2, 4.9, 0.4, 4.9, TEMPLE_GOLD);
  for (const s of [-1, 1]) p.box(fx2 + s * 2.0, G + 1.1, fz2 + 2.12, 0.3, 3.8, 0.2, TEMPLE_GOLD);
  p.span(fx2 + 2.1, fx2 + 2.3, G + 1.6, G + 3.8, fz2 - 1.2, fz2 + 1.2, INK);
  glowShape(p, BOX, fx2 + 2.4, G + 2.4, fz2, 0.12, 1.4, 1.8, '#ff9a3a', '#ff7a1a', 'sign', 1.8);
  p.pyramid(fx2, G + 5.4, fz2, 6.6, 6.6, 2.4, TILE);
  p.cyl(fx2, G + 7.7, fz2, 0.45, 1.6, TEMPLE_GOLD, 8);
  p.blob(fx2, G + 9.5, fz2, 0.5, '#e0b040');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) tilt(p, 'x', fx2 + sx * 3.3, fz2 + sz * 3.3, 0, -0.1, G + 5.5, 0.7, G + 6.4, 0.5, 0.35, JADE);

  // ---- old banyans
  banyan(p, F.x1 + 20, gz + 24, 1.0);
  banyan(p, F.x1 + 15, gz - 28, 0.8);
  void bush;

  // ---- rows of red lanterns strung across the court on poles
  const poleZ = A.d / 2 - 2.4;
  for (const x of [F.x1 + 8, F.x1 + 22]) {
    for (const s of [-1, 1]) {
      p.cyl(x, G, gz + s * poleZ, 0.28, 9.6, RED_D, 6);
      p.blob(x, G + 9.8, gz + s * poleZ, 0.4, TEMPLE_GOLD);
    }
    p.beam(x, gz - poleZ, x, gz + poleZ, G + 9.4, 0.12, 0.12, '#3b3430');
    const n = Math.floor((2 * poleZ) / 3.6);
    for (let i = 1; i < n; i++) lantern(p, x, G + 8.2, gz - poleZ + (2 * poleZ * i) / n, 0.85, i / n);
  }
  // lights: the pools of red light, the doors, the furnace fire
  p.light(gx1 + 1.5, 6, gz, 16, '#ff8a4a', 0.9, 'sign', 'gate-lanterns');
  p.light(hallFront + 3, 6, gz, 18, '#ff9a5a', 1.0, 'sign', 'hall-lanterns');
  p.light(F.x1 + 8, 8, gz - 14, 14, '#ff8a4a', 0.7, 'sign', 'court-lanterns');
  p.light(F.x1 + 8, 8, gz + 14, 14, '#ff8a4a', 0.7, 'sign', 'court-lanterns');
  p.light(F.x1 + 22, 8, gz - 14, 14, '#ff8a4a', 0.7, 'sign', 'court-lanterns');
  p.light(F.x1 + 22, 8, gz + 14, 14, '#ff8a4a', 0.7, 'sign', 'court-lanterns');
  p.light(fx2 + 3, 3, fz2, 9, '#ff7a2a', 0.8, 'sign', 'furnace');
  p.light(bx, 5, bz, 11, '#ffb060', 0.6, 'sign', 'burner');
}

void FLOOR;
