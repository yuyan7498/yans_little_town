// Shopping: 星河百貨 (kind 'mall', a department store with a glazed atrium, a roof sign
// and an LED screen cycling short messages) and 南巷商場 (kind 'annex-mall', a smaller
// brick arcade building with a covered walkway, hanging shop signs and a clock tower).

import * as THREE from 'three';
import { Builder, GROUND } from './a-kit.js';
import { FACES, FLOOR, WARM, entrance, fbox, normalOf, parapet, planeOf, planter, roofKit, shopfront, spanOf, tree, win, windowGrid } from './a-parts.js';
import { unit } from '../../core/random.js';

// Messages on the mall's LED screen, and how long each stays.
const SCREEN_MESSAGES = ['歡迎光臨', '彥彥的小鎮', 'By 彥彥', '星河百貨', '夏日大特賣'];
const SCREEN_SECONDS = 4.5;
// How far a band stands proud of the wall it wraps (equal faces flicker as the camera moves).
const BAND = 0.08;

const MALL_SHOPS = [
  ['服飾', '#c9483b', '#ffffff'], ['3C 電器', '#3e6fa8', '#ffffff'], ['美妝', '#c2577a', '#fff3f6'], ['運動用品', '#2e8b57', '#ffffff'],
  ['書局', '#7a4e36', '#f4ead8'], ['童裝', '#e0a82e', '#3a2a1a'], ['珠寶', '#4a4f55', '#f3dca0'], ['玩具', '#4f8fa0', '#ffffff']
];
const ARCADE_SHOPS = [
  ['茶行', '#6f5a2a', '#f7ecc8'], ['麵店', '#c9483b', '#fff1d0'], ['雜貨', '#2e8b57', '#ffffff'], ['裁縫', '#7a4e8c', '#ffffff'],
  ['中藥行', '#3f6a52', '#f4ead8'], ['文具', '#3e6fa8', '#ffffff'], ['珠寶', '#4a4f55', '#f3dca0'], ['鐘錶', '#7a4e36', '#f4ead8']
];

export function create({ world, quality = 'full' }) {
  const b = new Builder({ world, quality });
  const extras = [];
  for (const site of world.siteList) {
    if (site.kind === 'mall') extras.push(drawMall(b.site(site), site));
    else if (site.kind === 'annex-mall') drawArcade(b.site(site), site);
  }
  const built = b.finish('commercial');
  const screens = extras.filter(Boolean);
  for (const s of screens) built.group.add(s.mesh);
  return {
    ...built,
    update(frame) {
      built.update(frame);
      for (const s of screens) s.update(frame);
    },
    dispose() { for (const s of screens) s.dispose(); built.dispose(); }
  };
}
export const preview = ctx => create(ctx);

const doorZ = p => p.f.point(p.site.door).z;
const rectOf = (x0, x1, z0, z1) => ({ x0, x1, z0, z1, x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 });

// ------------------------------------------------------------------ the department store
function drawMall(p, site) {
  const F = p.f.foot, dz = doorZ(p), top = GROUND + site.floors * FLOOR, y1 = GROUND + FLOOR, y2 = GROUND + 2 * FLOOR;
  const BLUSH = '#ecd3c8', CORAL = '#d8675c', DARK = '#35566a', CREAM = '#f6efe6';
  const pav = 8, M = rectOf(F.x0, F.x1 - pav, F.z0, F.z1);
  // main body: two glazed shopping floors under a blush box with louvre fins
  p.span(M.x0, M.x1, GROUND, top, M.z0, M.z1, BLUSH);
  p.span(M.x0 - 0.2, M.x1 + 0.2, GROUND, GROUND + 0.8, M.z0 - 0.2, M.z1 + 0.2, '#8f8479');
  p.span(M.x0 - BAND, M.x1 + BAND, y2 - 0.4, y2 + 0.4, M.z0 - BAND, M.z1 + BAND, CORAL);
  let k = 0;
  const shop = () => MALL_SHOPS[(k++ + Math.floor(unit(site.id) * 8)) % MALL_SHOPS.length];
  for (const face of FACES) {
    const plane = planeOf(M, face), [s0, s1] = spanOf(M, face), mid = (s0 + s1) / 2;
    // ground floor shopfronts (the front keeps clear of the atrium pavilion)
    const a0 = s0 + 1.2, a1 = s1 - 1.2;
    const gaps = face === 'f' ? [[dz - 12.5, dz + 12.5]] : [];
    let from = a0;
    for (const [g0, g1] of gaps.concat([[a1 + 1, a1 + 2]])) {
      if (g0 - from >= 5) { const n = Math.ceil((g0 - from) / 11), w = (g0 - from) / n; for (let i = 0; i < n; i++) shopfront(p, face, plane, from + i * w, from + (i + 1) * w - 0.2, shop(), { y0: GROUND }); }
      from = g1 + 0.2;
    }
    // first floor: tall glazed bays, lit like shop floors
    windowGrid(p, M, face, { floor0: 1, floor1: 2, pitch: 5.4, w: 4.6, h: 3.9, sill: 0.9, margin: 2.4, panes: 2, glass: '#a9c4cf', light: WARM, skip: face === 'f' ? i => Math.abs(i.a - dz) < 9 : null });
    // upper floors: ribbon slits between vertical fins
    windowGrid(p, M, face, { floor0: 2, floor1: site.floors, pitch: 6.2, w: 5.0, h: 1.7, sill: 2.2, margin: 2.6, panes: 3, glass: ['#6f93a6', '#7a9bad'], light: WARM, skip: face === 'f' ? i => Math.abs(i.a - dz) < 9 && i.f < 4 : null });
    const finN = Math.round((s1 - s0) / 1.8);
    for (let i = 0; i <= finN; i++) fbox(p, face, plane, s0 + ((s1 - s0) * i) / finN, y2 + 0.4, 0.3, top - y2 - 0.4, 0.5, CREAM);
    fbox(p, face, plane, mid, top - 0.2, s1 - s0 + 0.6, 0.9, 0.7, CREAM, 'body', undefined, -0.05);
  }
  for (const sx of [M.x0, M.x1]) for (const sz of [M.z0, M.z1]) p.box(sx, GROUND, sz, 1.4, top - GROUND + 0.06, 1.4, CREAM);
  // the glazed atrium pavilion across the front: lit glass, dark mullions, a tall entrance
  const P = rectOf(M.x1, F.x1, dz - 12, dz + 12), ph = 3 * FLOOR;
  p.span(P.x0, P.x1, GROUND, GROUND + ph, P.z0 - 0.1, P.z1 + 0.1, '#e9e1d6');
  p.glowQuad(P.x1 + 0.12, GROUND + ph / 2 + 0.2, dz, P.d - 2.2, ph - 1.6, 'f', '#98b9c6', '#ffd28a', 'entry', 0.6);
  for (let i = 0; i <= 8; i++) fbox(p, 'f', P.x1, P.z0 + 0.8 + ((P.d - 1.6) * i) / 8, GROUND, 0.35, ph, 0.4, DARK, 'body', undefined, 0.02);
  for (const y of [GROUND + FLOOR, GROUND + 2 * FLOOR]) fbox(p, 'f', P.x1, dz, y - 0.15, P.d, 0.3, 0.45, DARK, 'body', undefined, 0.02);
  for (const s of [P.z0, P.z1]) for (const f of FACES.slice(1, 4)) void f;
  for (const side of ['p', 'n']) {
    const pl = planeOf(P, side);
    p.glowQuad(side === 'p' ? P.x + 0.3 : P.x + 0.3, GROUND + ph / 2, pl + normalOf(side) * 0.17, P.w - 1.4, ph - 1.2, side, '#98b9c6', '#ffd28a', 'entry', 0.6);
  }
  p.span(P.x0 - 0.3, P.x1 + 0.3, GROUND + ph, GROUND + ph + 0.8, P.z0 - 0.3, P.z1 + 0.3, CORAL);
  // entrance: wide doors and a deep canopy
  entrance(p, 'f', P.x1 + 0.6, dz, { w: 14, y: 5.4, depth: 4.2, doorW: 9, doorH: 4.4, slab: CREAM, trim: CORAL, frame: DARK, column: CREAM });
  // the LED screen housing on the blush wall above the pavilion, standing proud of the fins
  const sw = 24, sh = 6.4, sx = M.x1 + 0.75, sy = GROUND + ph + 1.4 + sh / 2 + 0.6;
  p.box(sx - 0.2, sy - sh / 2 - 0.5, dz, 0.5, sh + 1.0, sw + 1.0, '#2b3036');
  // roof sign: a board on a frame, the store's name lit
  p.b.atlas.text('mall-name', site.name, { color: '#fff7e6', background: '#c64a40', size: 110, weight: 900, pad: 0.35, radius: 0.12, border: '#ffe7b8' });
  const item = p.b.atlas.items.get('mall-name'), nw = Math.min(30, 5.6 * item.aspect), nh = nw / item.aspect;
  for (const s of [-1, 1]) p.box(M.x1 - 5, top, dz + s * (nw / 2 - 2), 0.5, 1.8, 0.5, '#4a4f55');
  p.box(M.x1 - 5, top + 1.6, dz, 0.8, nh + 0.8, nw + 0.8, '#2b3036');
  p.sign('mall-name', 'f', M.x1 - 4.58, top + 1.6 + nh / 2 + 0.4, dz, nw, { h: nh });
  p.sign('mall-name', 'b', M.x1 - 5.42, top + 1.6 + nh / 2 + 0.4, dz, nw, { h: nh });
  // blade signs at both front corners (vertical, two-sided) with a star
  p.b.atlas.text('mall-blade', '星河百貨', { color: '#ffffff', background: '#2d5f73', size: 84, vertical: true, pad: 0.3, border: '#f0c03a' });
  p.b.atlas.text('mall-star', '★', { color: '#ffd35a', background: null, size: 150, weight: 700, pad: 0.1 });
  const bl = p.b.atlas.items.get('mall-blade'), bh = 12.5, bw = bh * bl.aspect;
  for (const z of [M.z0 + 0.7, M.z1 - 0.7]) {
    p.box(M.x1 + 1.3, GROUND + 14.5, z, 0.3, 0.3, 0.3, '#2b3036');
    p.sign('mall-blade', 'p', M.x1 + 0.25, GROUND + 13.2, z + 0.15, bw, { h: bh });
    p.sign('mall-blade', 'n', M.x1 + 0.25, GROUND + 13.2, z - 0.15, bw, { h: bh });
    fbox(p, 'f', M.x1, z, GROUND + 6.9, 0.7, bh + 0.6, 0.5, '#2b3036', 'body', undefined, 0.02);
  }
  for (const s of [-1, 1]) p.sign('mall-star', 'f', M.x1 + 0.6, GROUND + 22.6, dz + s * 18.5, 5.2, { h: 5.2, power: 1.1 });
  // roof plant and mast, parapet, a car-park gate shed
  parapet(p, M, top, 1.0, 0.5, '#e4d6cc', { top: '#9a8f86' });
  roofKit(p, { x0: M.x0 + 1, x1: M.x1 - 8, z0: M.z0 + 1, z1: M.z1 - 1, w: M.w - 9, d: M.d - 2, x: M.x - 3.5, z: M.z }, top, { tanks: 1, acs: 6, solar: 0 });
  p.cyl(M.x0 + 6, top, M.z0 + 6, 0.22, 11, '#8c949b', 6, 'body', undefined, 0.5);
  p.glowBox(M.x0 + 6, top + 11, M.z0 + 6, 0.7, 0.7, 0.7, '#a02620', '#ff3b30', 'beacon', 1.6);
  p.light(P.x1 + 3, 6, dz, 15, '#ffe4b8', 0.9, 'facade', 'atrium');
  for (const z of [F.z0 + 1.5, F.z1 - 1.5]) p.light(F.x1 + 2.5, 3, z, 13, '#ffe4b8', 0.5, 'facade', 'floodlight');
  p.light(M.x1 + 3, 22, dz, 16, '#ffd5a0', 0.9, 'sign', 'led-screen');
  return makeScreen(p, sx + 0.13, sy, dz, sw, sh);
}

// The LED screen: a canvas of dots with the current message, brighter at night.
function makeScreen(p, x, y, z, w, h) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 170;
  const c = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.name = 'mall-screen';
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(p.f.base).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(x, y, z));
  mesh.matrixWorldNeedsUpdate = true;
  const colours = ['#ffe9a8', '#9fe8ff', '#ffb0c0', '#c8ffc0', '#ffd28a'];
  let shown = -1;
  function draw(index) {
    const text = SCREEN_MESSAGES[index % SCREEN_MESSAGES.length], ink = colours[index % colours.length];
    const g = c.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, '#1a1030'); g.addColorStop(1, '#0a0a18');
    c.fillStyle = g; c.fillRect(0, 0, canvas.width, canvas.height);
    c.font = '900 108px "Microsoft JhengHei", "Noto Sans TC", "PingFang TC", sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = ink; c.shadowBlur = 18; c.fillStyle = ink;
    c.fillText(text, canvas.width / 2, canvas.height / 2 + 6);
    c.shadowBlur = 0;
    // LED dot grid
    c.fillStyle = 'rgba(0,0,0,0.42)';
    for (let i = 0; i < canvas.width; i += 5) c.fillRect(i, 0, 1.4, canvas.height);
    for (let j = 0; j < canvas.height; j += 5) c.fillRect(0, j, canvas.width, 1.4);
    texture.needsUpdate = true;
  }
  return {
    mesh,
    update(frame) {
      const index = Math.floor((frame.time || 0) / SCREEN_SECONDS);
      if (index !== shown) { shown = index; draw(index); }
      material.color.setScalar(0.5 + 0.5 * (1 - frame.daylight));
    },
    dispose() { texture.dispose(); material.dispose(); mesh.geometry.dispose(); }
  };
}

// ------------------------------------------------------------------ the arcade building
function drawArcade(p, site) {
  const F = p.f.foot, dz = doorZ(p), y1 = GROUND + FLOOR, top = GROUND + site.floors * FLOOR;
  const BRICK = '#b8664a', CREAM = '#f3e8d6', TILE = '#8f4a36', STONE = '#e0d3bd';
  const depth = 3.6;
  // upper floors over the whole footprint, ground floor set back behind the colonnade
  p.span(F.x0, F.x1, y1, top, F.z0, F.z1, BRICK);
  const G = rectOf(F.x0, F.x1 - depth, F.z0 + depth, F.z1 - depth);
  p.span(G.x0, G.x1, GROUND, y1, G.z0, G.z1, '#d9cdb8');
  p.span(F.x0 - BAND, F.x1 + BAND, y1 - 0.1, y1 + 0.1, F.z0 - BAND, F.z1 + BAND, '#6b5a4a');
  let k = 0;
  const shop = () => ARCADE_SHOPS[(k++ + Math.floor(unit(site.id) * 8)) % ARCADE_SHOPS.length];
  // the arcade: pillars along the front and the two sides, shops behind
  for (const face of ['f', 'p', 'n']) {
    const [s0, s1] = spanOf(F, face), recess = planeOf(G, face);
    const [g0, g1] = spanOf(G, face);
    const lo = face === 'f' ? F.z0 : F.x0, hi = face === 'f' ? F.z1 : G.x1;
    const n = Math.max(3, Math.round((hi - lo) / 5.4)), step = (hi - lo) / n;
    for (let i = 0; i <= n; i++) {
      const a = lo + i * step;
      if (face !== 'f' && (a < F.x0 + 0.3)) continue;
      fbox(p, face, planeOf(F, face), a, GROUND, 1.0, FLOOR, 1.0, CREAM, 'body', undefined, -1.3);
    }
    // shops behind the colonnade
    const a0 = (face === 'f' ? g0 : g0) + 1, a1 = g1 - 1;
    const gap = face === 'f' ? [dz - 3.4, dz + 3.4] : null;
    const runs = gap ? [[a0, gap[0]], [gap[1], a1]] : [[a0, a1]];
    for (const [r0, r1] of runs) if (r1 - r0 > 5) {
      const m = Math.ceil((r1 - r0) / 10), w = (r1 - r0) / m;
      for (let i = 0; i < m; i++) shopfront(p, face, recess, r0 + i * w, r0 + (i + 1) * w - 0.2, shop(), { y0: GROUND, h: FLOOR - 0.2 });
    }
    // a soffit light under the arcade roof, and hanging blade signs at some pillars
    fbox(p, face, planeOf(F, face), (s0 + s1) / 2, y1 - 0.3, s1 - s0 - 2, 0.2, 0.5, '#fff2d6', 'body', undefined, 0.2);
  }
  // blade signs hanging off pillars toward the walkway
  for (let i = 0; i < 6; i++) {
    const name = ARCADE_SHOPS[(i * 3 + 1) % ARCADE_SHOPS.length], key = 'blade:' + name[0];
    p.b.atlas.text(key, name[0], { color: name[2], background: name[1], size: 70, vertical: name[0].length > 2 || true, pad: 0.25, border: '#f3e8d6' });
    const it = p.b.atlas.items.get(key), bh = 4.4, bw = bh * it.aspect;
    const z = F.z0 + 4 + ((F.z1 - F.z0 - 8) * (i + 0.5)) / 6;
    p.box(F.x1 + 0.1, y1 - 0.6, z - 0.6, 0.12, 0.12, 0.12, '#3b4045');
    p.sign(key, 'p', F.x1 - 0.2, y1 - 3.0, z - 0.05, bw, { h: bh, power: 0.8 }); p.sign(key, 'n', F.x1 - 0.2, y1 - 3.0, z - 0.1, bw, { h: bh, power: 0.8 });
  }
  // upper floors: framed windows, flower boxes, shutters
  for (const face of FACES) {
    const plane = planeOf(F, face), [s0, s1] = spanOf(F, face), mid = (s0 + s1) / 2;
    windowGrid(p, F, face, { floor0: 1, floor1: site.floors, pitch: 4.8, w: 2.4, h: 3.0, sill: 1.4, margin: 2.6, panes: 2, glass: ['#a9c9d3', '#9fc0cc'], light: WARM,
      skip: face === 'f' ? i => i.f === site.floors - 1 && Math.abs(i.a - dz) < 7 : null,
      each: i => {
        fbox(p, face, plane, i.a, i.yc - 1.8, 3.2, 0.3, 0.9, CREAM);
        fbox(p, face, plane, i.a, i.yc + 1.5, 3.0, 0.25, 0.4, CREAM);
        for (const s of [-1, 1]) fbox(p, face, plane, i.a + s * 1.8, i.yc - 1.5, 0.9, 3.0, 0.2, '#4f8f88', 'body', undefined, 0.04);
        if (unit(site.id + face + i.f + i.i) < 0.55) fbox(p, face, plane, i.a, i.yc - 1.5, 2.6, 0.55, 0.55, '#6f9a52', 'body', undefined, 0.38);
      } });
    fbox(p, face, plane, mid, top - 0.5, s1 - s0 + 1.0, 1.0, 0.9, STONE, 'body', undefined, -0.1);
    fbox(p, face, plane, mid, y1 + 0.1, s1 - s0, 0.5, 0.5, STONE, 'body', undefined, -0.05);
  }
  // roof: clay-tile hips on the front and back, a flat middle with plant, and the clock tower
  p.wedge(F.x1 - 5.5, top + 0.5, F.z, 11, 3.2, F.d + 1.2, TILE, 0);
  p.wedge(F.x0 + 5.5, top + 0.5, F.z, 11, 3.2, F.d + 1.2, TILE, 0);
  p.span(F.x0 + 10.5, F.x1 - 10.5, top, top + 0.6, F.z0 + 1, F.z1 - 1, '#8a8378');
  roofKit(p, rectOf(F.x0 + 11, F.x1 - 11, F.z0 + 2, F.z1 - 2), top + 0.6, { tanks: 1, acs: 3, solar: 3 });
  // the clock tower over the entrance bay
  const tx = F.x1 - 4.2, tw = 6.2, ty0 = top + 0.44, th = 8.46;
  p.box(tx, ty0, dz, tw, th, tw, '#c98a62');
  p.span(tx - tw / 2 - 0.4, tx + tw / 2 + 0.4, ty0 + th, ty0 + th + 0.6, dz - tw / 2 - 0.4, dz + tw / 2 + 0.4, STONE);
  p.pyramid(tx, ty0 + th + 0.6, dz, tw + 1, tw + 1, 4.6, TILE);
  p.cyl(tx, ty0 + th + 5.2, dz, 0.15, 2.4, '#59606a', 6);
  for (const face of ['f', 'b', 'p', 'n']) {
    const pl = face === 'f' ? tx + tw / 2 + 0.08 : face === 'b' ? tx - tw / 2 - 0.08 : tx;
    const zl = face === 'p' ? dz + tw / 2 + 0.08 : face === 'n' ? dz - tw / 2 - 0.08 : dz;
    p.disc(pl, ty0 + th * 0.55, zl, 2.2, '#f7f1e3', 16, face, 'glow', { glow: [5, p.slot, 0], emit: '#fff2c8', power: 0.45 });
    p.disc(pl + normalOf(face) * (face === 'f' || face === 'b' ? 0.04 : 0), ty0 + th * 0.55, zl + normalOf(face) * (face === 'p' || face === 'n' ? 0.04 : 0), 0.35, '#3b4045', 8, face);
  }
  // the pediment sign over the entrance bay
  p.b.atlas.text('arcade-name', site.name, { color: '#f7ecc8', background: '#6b3b2c', size: 100, weight: 900, pad: 0.4, border: '#e0b84a', radius: 0.15 });
  const item = p.b.atlas.items.get('arcade-name'), nw = Math.min(14, 2.8 * item.aspect);
  p.box(F.x1 + 0.2, y1 + 0.7, dz, 0.6, 4.4, nw + 1.2, '#4a2f25');
  p.sign('arcade-name', 'f', F.x1 + 0.55, y1 + 2.9, dz, nw, { h: nw / item.aspect });
  // entrance lights, and the lantern on each of the centre pillars
  for (const s of [-1, 1]) p.glowBox(F.x1 + 0.5, GROUND + 4.6, dz + s * 3.9, 0.6, 0.9, 0.6, '#f4efe0', '#ffd79c', 'entry', 1.5);
  p.light(F.x1 + 2, 5, dz, 14, '#ffe2b8', 0.85, 'facade', 'entrance');
  for (const z of [F.z0 + 3, F.z1 - 3]) p.light(F.x1 + 1.5, 4, z, 11, '#ffe4b8', 0.45, 'facade', 'arcade');
  // planters and trees in the forecourt
  const area = p.f.area;
  for (const s of [-1, 1]) planter(p, F.x1 + 2.0, dz + s * 12, 1.4, 6);
  void area; void tree; void win;
}
