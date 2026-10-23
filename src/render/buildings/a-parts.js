// Building parts shared by towers, housing, commercial and civic modules: windows on
// faces, balconies, grilles, air-conditioners, roof plant, planters, shopfronts, lobbies.
//
// Everything is drawn through an a-kit Painter in the site's local frame (+x out of the
// front). A *face* names the side of a block: 'f' front (+x), 'b' back (-x), 'p' (+z),
// 'n' (-z). `plane` is the face's coordinate (x for f/b, z for p/n), `a` the position
// along it (z for f/b, x for p/n), `out` the distance away from the wall.

import { unit } from '../../core/random.js';
import { PALETTE } from '../kit.js';
import { GROUND, freeRect, grow, UNIT_SHAPES } from './a-kit.js';

export const FLOOR = 6;
export const FACES = ['f', 'p', 'b', 'n'];

export const planeOf = (r, face) => (face === 'f' ? r.x1 : face === 'b' ? r.x0 : face === 'p' ? r.z1 : r.z0);
export const spanOf = (r, face) => (face === 'f' || face === 'b' ? [r.z0, r.z1] : [r.x0, r.x1]);
export const normalOf = face => (face === 'f' || face === 'p' ? 1 : -1);
// The other face on the same axis, and a face turned a quarter.
export const opposite = { f: 'b', b: 'f', p: 'n', n: 'p' };

// A box on a face: `along` wide, `h` tall from y0, `out` deep starting `start` off the wall.
export function fbox(p, face, plane, a, y0, along, h, out, color, layer = 'body', extra, start = 0) {
  const c = normalOf(face) * (start + out / 2);
  if (face === 'f' || face === 'b') return p.box(plane + c, y0, a, out, h, along, color, 0, layer, extra);
  return p.box(a, y0, plane + c, along, h, out, color, 0, layer, extra);
}

// One window (glowing glass) centred at height yc on a face.
export const WARM = ['#ffc978', '#ffd9a0', '#ffb866', '#fff0c8', '#ffd08a'];
export function win(p, face, plane, a, yc, w, h, o = {}) {
  if (o.power === undefined) o = { ...o, power: 0.8 };
  const off = normalOf(face) * (o.out === undefined ? 0.07 : o.out);
  if (face === 'f' || face === 'b') p.window(face, plane + off, yc, a, w, h, o);
  else p.window(face, a, yc, plane + off, w, h, o);
}

// Windows in rows and columns along a face of rect r. `each(info)` is called for every
// window (decorations: sills, grilles, balconies); `skip(info)` leaves one out.
// info = { face, plane, a, f, i, y (floor base), yc, w, h }
export function windowGrid(p, r, face, o = {}) {
  const { floor0 = 0, floor1 = 1, y0 = GROUND, floorH = FLOOR, pitch = 3.6, w = 2.2, h = 2.5, sill = 1.8, margin = 2,
    glass = '#5f8ea3', light, panes = 2, skip = null, each = null, panesGap, power, from = null, to = null, plane = planeOf(r, face), mullion } = o;
  const [s0, s1] = spanOf(r, face);
  const a0 = (from === null ? s0 : from) + margin, a1 = (to === null ? s1 : to) - margin;
  const n = Math.max(1, Math.floor((a1 - a0) / pitch + 0.0001)), step = (a1 - a0) / n;
  for (let f = floor0; f < floor1; f++) {
    for (let i = 0; i < n; i++) {
      const a = a0 + step * (i + 0.5), y = y0 + f * floorH, yc = y + sill + h / 2;
      const info = { face, plane, a, f, i, y, yc, w, h, n };
      if (skip && skip(info)) continue;
      const g = Array.isArray(glass) ? glass[Math.floor(unit(p.site.id + face + f + ':' + i) * glass.length)] : glass;
      const lt = Array.isArray(light) ? light[Math.floor(unit(p.site.id + face + f + ':L' + i) * light.length)] : light;
      win(p, face, plane, a, yc, w, h, { glass: g, light: lt, panes, power, mullion });
      if (each) each(info);
    }
  }
  return { n, step, a0 };
}

// A projecting sill under a window.
export function sill(p, info, color, o = {}) {
  fbox(p, info.face, info.plane, info.a, info.yc - info.h / 2 - 0.3, info.w + (o.extra ?? 0.7), 0.3, o.out ?? 0.55, color);
}

// 鐵窗: an iron grille standing off a window: frame, two rails, bars.
export function grille(p, face, plane, a, yc, w, h, color = '#6b7178') {
  const t = 0.16, y0 = yc - h / 2;
  fbox(p, face, plane, a, y0, w + 0.5, t, 0.5, color, 'body', undefined, 0.12);
  fbox(p, face, plane, a, y0 + h, w + 0.5, t, 0.5, color, 'body', undefined, 0.12);
  fbox(p, face, plane, a, y0 + h * 0.5, w + 0.3, t * 0.8, 0.4, color, 'body', undefined, 0.16);
  for (const k of [-1, 0, 1]) fbox(p, face, plane, a + k * (w / 2), y0, t, h, 0.4, color, 'body', undefined, 0.16);
}

export function acUnit(p, face, plane, a, y0, o = {}) {
  const w = o.w ?? 1.5, h = o.h ?? 1.1;
  fbox(p, face, plane, a, y0, w, h, 0.8, '#dcdedc', 'body', undefined, o.start ?? 0.1);
  const n = normalOf(face), fx = (o.start ?? 0.1) + 0.86;
  if (face === 'f' || face === 'b') p.disc(plane + n * fx, y0 + h / 2, a, h * 0.36, '#6b7075', 8, face);
  else p.disc(a, y0 + h / 2, plane + n * fx, h * 0.36, '#6b7075', 8, face);
}

// A balcony: slab, rails by style ('solid' parapet, 'bars', 'cage' = enclosed with iron
// grille), optionally an air-conditioner on it. y0 = floor level.
export function balcony(p, face, plane, a, y0, w, o = {}) {
  const depth = o.depth ?? 1.9, style = o.style || 'solid', color = o.color || '#e9e2d4', rail = o.rail || color, top = o.top || '#9a958c';
  fbox(p, face, plane, a, y0 - 0.05, w, 0.4, depth, color);
  const n = normalOf(face);
  if (style === 'solid') {
    fbox(p, face, plane, a, y0 + 0.35, w, 1.05, 0.25, rail, 'body', undefined, depth - 0.25);
    fbox(p, face, plane, a, y0 + 1.4, w + 0.1, 0.14, 0.4, top, 'body', undefined, depth - 0.32);
    for (const s of [-1, 1]) fbox(p, face, plane, a + s * (w / 2 - 0.1), y0 + 0.35, 0.2, 1.05, depth - 0.3, rail);
  } else if (style === 'bars') {
    const k = Math.max(3, Math.round(w / 0.9));
    for (let i = 0; i <= k; i++) fbox(p, face, plane, a - w / 2 + (w * i) / k, y0 + 0.35, 0.14, 1.1, 0.14, '#5b6168', 'body', undefined, depth - 0.2);
    fbox(p, face, plane, a, y0 + 1.4, w + 0.1, 0.16, 0.3, '#5b6168', 'body', undefined, depth - 0.3);
  } else {
    // Enclosed by a metal cage: roof plate, posts, a mid rail.
    const hh = o.cageHeight ?? 2.6, bar = '#8a9299';
    fbox(p, face, plane, a, y0 + hh, w + 0.2, 0.18, depth + 0.1, bar, 'body', undefined, -0.05);
    for (const s of [-1, 0, 1]) fbox(p, face, plane, a + s * (w / 2 - 0.08), y0 + 0.35, 0.16, hh - 0.2, 0.16, bar, 'body', undefined, depth - 0.2);
    fbox(p, face, plane, a, y0 + 1.5, w, 0.12, 0.14, bar, 'body', undefined, depth - 0.2);
    fbox(p, face, plane, a, y0 + 0.35, w, 0.9, 0.06, '#cfd5d6', 'body', undefined, depth - 0.16);
  }
  if (o.ac) acUnit(p, face, plane, a + w * 0.2, y0 + 0.4, { start: depth - 1.0, w: 1.3, h: 1.0 });
  if (o.plant) bush(p, face === 'f' || face === 'b' ? plane + n * (depth * 0.5) : a - w * 0.25, y0 + 1.1, face === 'f' || face === 'b' ? a - w * 0.25 : plane + n * (depth * 0.5), 0.55, o.plant);
  void n;
}

export const GREENS = ['#6f9a52', '#5f8a47', '#7aa35b', '#4f7d45'];
export function bush(p, x, y, z, r, color) {
  p.blob(x, y, z, r, color || GREENS[Math.floor(unit(x + ':' + z) * GREENS.length)], 0.8);
}
export function tree(p, x, z, h = 7, color, y0 = GROUND) {
  const g = color || GREENS[Math.floor(unit('t' + x.toFixed(1) + ':' + z.toFixed(1)) * GREENS.length)];
  p.cyl(x, y0, z, 0.35, h * 0.45, '#7a5a3e', 6, 'body', undefined, 0.7);
  p.blob(x, y0 + h * 0.62, z, h * 0.34, g, 0.9);
  p.blob(x + h * 0.12, y0 + h * 0.8, z - h * 0.06, h * 0.24, g, 0.9);
}
export function planter(p, x, z, w, d, y0 = GROUND, o = {}) {
  p.box(x, y0, z, w, 0.9, d, o.color || '#8f6a52');
  p.box(x, y0 + 0.88, z, w - 0.3, 0.14, d - 0.3, '#5a4638');
  const n = Math.max(1, Math.round(Math.max(w, d) / 1.6));
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5;
    bush(p, w >= d ? x + t * (w - 1) : x, y0 + 1.3, w >= d ? z : z + t * (d - 1), Math.min(w, d) * 0.42 + 0.15);
  }
}

// A white plastic water tank on a short stand, the Taiwanese roof signature.
export function waterTank(p, x, y0, z, r = 1.7) {
  p.box(x, y0, z, r * 2.3, 0.5, r * 2.3, '#a8a8a2');
  p.cyl(x, y0 + 0.5, z, r, r * 2.1, '#f1f1ec', 10);
  p.cyl(x, y0 + 0.5 + r * 2.1, z, r * 0.78, r * 0.35, '#e6e6e0', 10, 'body', undefined, 0.8);
  p.cyl(x, y0 + 0.5 + r * 1.0, z, r * 1.04, 0.2, '#c9cdd0', 10);
}

// Rooftop clutter on rect r at roof level y: a stair house, water tanks, condensers.
export function roofKit(p, r, y, o = {}) {
  const key = p.site.id + ':roof' + (o.salt || '');
  const sx = Math.min(5.5, r.w * 0.3), sz = Math.min(6, r.d * 0.28);
  const cx = r.x0 + sx / 2 + 1.6 + unit(key + 'sx') * Math.max(0, r.w * 0.3), cz = r.z0 + sz / 2 + 1.6 + unit(key + 'sz') * Math.max(0, r.d * 0.35);
  p.box(cx, y, cz, sx, 3.4, sz, o.wall || '#d6d0c4');
  p.box(cx, y + 3.4, cz, sx + 0.7, 0.35, sz + 0.7, '#8e8a82');
  p.box(cx + sx / 2 + 0.03, y, cz, 0.2, 2.3, 1.6, '#59606a');
  const tanks = o.tanks ?? 2;
  for (let i = 0; i < tanks; i++) {
    const tx = Math.min(r.x1 - 3, cx + sx / 2 + 3.4 + i * 3.8), tz = Math.max(r.z0 + 2.4, Math.min(r.z1 - 2.4, cz + (i % 2 ? 0.8 : -0.8)));
    if (tx > r.x1 - 2.4) break;
    waterTank(p, tx, y, tz, 1.5);
  }
  const acs = o.acs ?? 3;
  for (let i = 0; i < acs; i++) {
    const ax = r.x1 - 3 - i * 3.0, az = r.z1 - 2.2;
    if (ax < r.x0 + 2) break;
    p.box(ax, y, az, 2.4, 1.7, 1.8, '#c9cdd0');
    p.disc(ax, y + 1.7 + 0.02, az, 0.7, '#5b6168', 8, 'u');
  }
  if (o.solar) for (let i = 0; i < o.solar; i++) {
    const px = r.x0 + 3 + i * 3.1, pz = r.z1 - 6.5;
    if (px > r.x1 - 3) break;
    p.put(UNIT_SHAPES.box(), px, y + 1.2, pz, [0.5, 0, 0], [2.7, 0.15, 4.6], '#2f4b66');
    p.box(px, y, pz, 0.3, 1.0, 0.3, '#8c949b');
  }
}

// A parapet round a rect at height y (thin walls, h tall), leaving gaps (rects) open.
export function parapet(p, r, y, h, t, color, o = {}) {
  const top = o.top;
  p.box(r.x1 - t / 2, y, r.z, t, h, r.d, color); p.box(r.x0 + t / 2, y, r.z, t, h, r.d, color);
  p.box(r.x, y, r.z1 - t / 2, r.w - 2 * t, h, t, color); p.box(r.x, y, r.z0 + t / 2, r.w - 2 * t, h, t, color);
  if (top) {
    p.box(r.x, y + h, r.z1 - t / 2, r.w, 0.14, t + 0.3, top); p.box(r.x, y + h, r.z0 + t / 2, r.w, 0.14, t + 0.3, top);
    p.box(r.x1 - t / 2, y + h, r.z, t + 0.3, 0.14, r.d - 2 * t, top); p.box(r.x0 + t / 2, y + h, r.z, t + 0.3, 0.14, r.d - 2 * t, top);
  }
}
// A light railing (posts + a rail) round a rect.
export function railing(p, r, y, h = 1.3, color = '#59606a', step = 2.6) {
  const edge = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / step));
    for (let i = 0; i <= n; i++) p.box(x0 + ((x1 - x0) * i) / n, y, z0 + ((z1 - z0) * i) / n, 0.14, h, 0.14, color);
    p.beam(x0, z0, x1, z1, y + h, 0.14, 0.14, color);
    p.beam(x0, z0, x1, z1, y + h * 0.5, 0.1, 0.1, color);
  };
  edge(r.x0, r.z0, r.x1, r.z0); edge(r.x1, r.z0, r.x1, r.z1); edge(r.x1, r.z1, r.x0, r.z1); edge(r.x0, r.z1, r.x0, r.z0);
}

// Clip a rect so it keeps `gap` away from the annex footprints reserved on the plot.
export function clearOfAnnexes(p, r, gap = 0.8) {
  return freeRect(r, p.f.annexes.map(a => grow(a, gap)));
}

// ---------------------------------------------------------------- shops and entrances
export const SHOPS = [
  ['咖啡館', '#7a4e36', '#f4ead8'], ['便利商店', '#2e8b57', '#ffffff'], ['麵包坊', '#c9703a', '#fff4e0'], ['藥妝店', '#2b8aa6', '#ffffff'],
  ['花店', '#c2577a', '#fff3f6'], ['書店', '#3e6fa8', '#ffffff'], ['小吃店', '#c9483b', '#fff1d0'], ['眼鏡行', '#4a4f55', '#ffffff'],
  ['手搖飲', '#e0a82e', '#3a2a1a'], ['洗衣店', '#4f8fa0', '#ffffff'], ['水果行', '#6f9a52', '#fffbe8'], ['早餐店', '#d9873a', '#fff6e4']
];
export function shopOf(site, i) {
  const k = Math.floor(unit(site.id + ':shop' + i) * SHOPS.length);
  return SHOPS[(k + i * 5) % SHOPS.length];
}

// A shopfront from a0 to a1 along a face: dark plinth, lit glass with mullions and a
// door, a striped awning, and a fascia sign. y0 is the floor.
export function shopfront(p, face, plane, a0, a1, shop, o = {}) {
  const y0 = o.y0 ?? GROUND, h = o.h ?? FLOOR, w = a1 - a0, mid = (a0 + a1) / 2;
  if (w < 3) return;
  const [name, tone, ink] = shop, key = 'shop:' + name;
  p.b.atlas.text(key, name, { color: ink, background: tone, size: 64, pad: 0.3 });
  const glassH = h - 2.6, glassY = y0 + 0.7;
  fbox(p, face, plane, mid, y0, w, 0.7, 0.4, '#454a50', 'body', undefined, -0.05);
  const n = normalOf(face);
  const gx = (face === 'f' || face === 'b') ? plane + n * 0.1 : mid, gz = (face === 'f' || face === 'b') ? mid : plane + n * 0.1;
  p.glowQuad(gx, glassY + glassH / 2, gz, w - 0.6, glassH, face, '#7fa3b3', '#ffd9a3', 'entry', 0.85);
  const k = Math.max(2, Math.round(w / 3.4));
  for (let i = 0; i <= k; i++) fbox(p, face, plane, a0 + 0.3 + ((w - 0.6) * i) / k, y0 + 0.4, 0.28, glassH + 0.4, 0.4, '#3b4045', 'body', undefined, 0.02);
  // The door: a pale slab with a handle bar, near the end, standing clear of the kick plate and mullions.
  const da = a0 + w * (o.doorAt ?? 0.72);
  fbox(p, face, plane, da, y0 + 0.4, 2.0, glassH - 0.3, 0.3, '#e8eef0', 'body', undefined, 0.2);
  // Awning: alternating strips.
  const strips = Math.max(4, Math.round(w / 1.3)), sw = (w - 0.4) / strips;
  for (let i = 0; i < strips; i++) fbox(p, face, plane, a0 + 0.2 + sw * (i + 0.5), y0 + glassY - y0 + glassH + 0.05, sw, 0.22, 1.6, i % 2 ? '#f2eee4' : tone, 'body', undefined, 0.35);
  // Fascia sign.
  const item = p.b.atlas.items.get(key), sh = 1.15, sw2 = Math.min(w - 0.8, sh * item.aspect);
  const sy = y0 + h - 0.95;
  fbox(p, face, plane, mid, sy - sh / 2 - 0.1, w, sh + 0.2, 0.3, '#4a4f55', 'body', undefined, -0.04);
  if (face === 'f' || face === 'b') p.sign(key, face, plane + n * 0.28, sy, mid, sw2, { h: sh });
  else p.sign(key, face, mid, sy, plane + n * 0.28, sw2, { h: sh });
}

// The tower/estate entrance: lit glass door, a canopy on two columns and a step.
// a = position along the face; w the canopy width; y the canopy height.
export function entrance(p, face, plane, a, o = {}) {
  const w = o.w ?? 9, depth = o.depth ?? 4.2, y = o.y ?? 5.0, n = normalOf(face), dw = o.doorW ?? 5.2, dh = o.doorH ?? 4.1;
  const frame = o.frame || '#3b4045', slab = o.slab || '#e6dfd2';
  const gx = (face === 'f' || face === 'b') ? plane + n * 0.1 : a, gz = (face === 'f' || face === 'b') ? a : plane + n * 0.1;
  fbox(p, face, plane, a, GROUND, dw + 0.8, dh + 0.4, 0.36, frame, 'body', undefined, -0.1);
  p.glowQuad(gx + (face === 'f' || face === 'b' ? n * 0.22 : 0), GROUND + dh / 2 + 0.05, gz + (face === 'f' || face === 'b' ? 0 : n * 0.22), dw, dh, face, '#8fb2bf', o.emit || '#ffe2b0', 'entry', 1.0);
  fbox(p, face, plane, a, GROUND + 0.1, 0.25, dh, 0.3, frame, 'body', undefined, 0.2);
  // canopy
  fbox(p, face, plane, a, y, w, 0.55, depth, slab, 'body', undefined, 0);
  fbox(p, face, plane, a, y + 0.55, w, 0.18, depth + 0.2, o.trim || '#59606a', 'body', undefined, -0.1);
  // light strip under the canopy edge
  const ex = (face === 'f' || face === 'b') ? plane + n * (depth - 0.4) : a, ez = (face === 'f' || face === 'b') ? a : plane + n * (depth - 0.4);
  p.glowBox(ex, y - 0.1, ez, face === 'f' || face === 'b' ? 0.3 : w - 0.8, 0.12, face === 'f' || face === 'b' ? w - 0.8 : 0.3, '#fff2d6', '#ffe6b8', 'entry', 1.2);
  for (const s of [-1, 1]) fbox(p, face, plane, a + s * (w / 2 - 0.6), GROUND, 0.6, y - GROUND, 0.6, o.column || '#cfc8bb', 'body', undefined, depth - 0.8);
  fbox(p, face, plane, a, GROUND, w - 0.4, 0.22, depth + 0.6, '#b9b2a6', 'body', undefined, 0);
  const lx = (face === 'f' || face === 'b') ? plane + n * (depth - 1) : a, lz = (face === 'f' || face === 'b') ? a : plane + n * (depth - 1);
  p.light(lx, y - 0.4, lz, 11, '#ffe2b8', 0.75, 'facade', 'entrance');
}

export { PALETTE, GROUND };
