// Parts shared by the public-building modules: walls and gates, trees and lamps, static
// vehicles, courts, and the corridor-fronted classroom block. All of them draw through a
// Painter (b-kit.js) in the site's local frame (+x out of the front, z along the front).

import { unit } from '../../core/random.js';
import { GROUND as G, lrect, freeRect, UNIT_SHAPES as U } from './b-kit.js';

export const COL = {
  cream: '#efe6d2', white: '#f5f2ea', grey: '#d9d6cf', concrete: '#bdb7ad', dark: '#3b4045', steel: '#8c949b',
  glass: '#5f8ea3', glassDark: '#35566a', roof: '#59606a', brick: '#b8664a', tile: '#c8553d', wood: '#a7774f',
  red: '#c9483b', teal: '#3f8f88', yellow: '#f0c03a', blue: '#3e6fa8', navy: '#27466f', green: '#7aa35b',
  greenDark: '#5f8a47', asphalt: '#4a4f55', paving: '#d4cdbf', warm: '#ffd79c'
};

// ------------------------------------------------------------------ walls and gates
// A wall along the plot edge, inset from it, with openings (gaps) on the front side.
// gaps: [[z0, z1, noPiers]] in local z. style 'fence' (low masonry + bars) or 'solid'.
export function compoundWall(p, { inset = 0.8, style = 'fence', h = 3.8, base = 1.4, color = COL.cream, bars = COL.steel, cap = COL.white, gaps = [], sides = true } = {}) {
  const a = p.f.area, xf = a.x1 - inset, xb = a.x0 + inset, zl = a.z0 + inset, zr = a.z1 - inset;
  const runs = [];
  const front = [...gaps].sort((u, v) => u[0] - v[0]);
  let z = zl;
  for (const [g0, g1] of front) { if (g0 > z) runs.push([xf, z, xf, g0]); z = Math.max(z, g1); }
  if (z < zr) runs.push([xf, z, xf, zr]);
  if (sides) runs.push([xb, zl, xb, zr], [xb, zl, xf, zl], [xb, zr, xf, zr]);
  for (const [ax, az, bx, bz] of runs) wallRun(p, ax, az, bx, bz, { style, h, base, color, bars, cap });
  // A pier at every corner and at the ends of the front openings.
  for (const [x, zz] of [[xf, zl], [xf, zr], [xb, zl], [xb, zr]]) pier(p, x, zz, h + 0.8, cap, color);
  for (const [g0, g1, bare] of front) { if (bare) continue; pier(p, xf, g0, h + 0.8, cap, color); pier(p, xf, g1, h + 0.8, cap, color); }
}

function pier(p, x, z, h, capColor, color) {
  p.box(x, G, z, 1.5, h - 0.4, 1.5, color).box(x, G + h - 0.4, z, 1.9, 0.4, 1.9, capColor);
}

function wallRun(p, ax, az, bx, bz, { style, h, base, color, bars, cap }) {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 0.5) return;
  if (style === 'solid') {
    p.beam(ax, az, bx, bz, G + h / 2, 0.9, h, color);
    p.beam(ax, az, bx, bz, G + h + 0.15, 1.3, 0.3, cap);
    return;
  }
  p.beam(ax, az, bx, bz, G + base / 2, 0.9, base, color);
  p.beam(ax, az, bx, bz, G + base + 0.1, 1.15, 0.2, cap);
  p.beam(ax, az, bx, bz, G + h - 0.12, 0.28, 0.24, bars);
  const n = Math.max(1, Math.round(len / (p.lite ? 2.4 : 1.5)));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    p.box(ax + (bx - ax) * t, G + base + 0.2, az + (bz - az) * t, 0.2, h - base - 0.3, 0.2, bars);
  }
}

// A school-style gate: two piers, a name board over them (sign key), a half-drawn sliding gate.
export function gateway(p, { z, w = 12, key = null, inset = 0.8, pier: pierColor = COL.cream, board = COL.navy, leaf = COL.steel, tall = 6.6, light = true } = {}) {
  const x = p.f.area.x1 - inset, hw = w / 2;
  for (const s of [-1, 1]) {
    const pz = z + s * (hw + 0.9);
    p.box(x, G, pz, 1.8, tall, 1.8, pierColor).box(x, G + tall, pz, 2.4, 0.5, 2.4, COL.white);
    p.glowBox(x + 0.2, G + tall + 0.5, pz, 0.9, 0.9, 0.9, '#f5ead0', '#ffd79c', 'lamps', 1.2);
  }
  const bw = w + 3.6;
  p.box(x, G + tall, z, 1.3, 2.7, bw, board);
  p.box(x, G + tall + 2.7, z, 1.7, 0.3, bw + 0.4, COL.white);
  if (key) { p.sign(key, 'f', x + 0.65, G + tall + 1.35, z, bw - 0.8, { h: 2.1 }); p.sign(key, 'b', x - 0.65, G + tall + 1.35, z, bw - 0.8, { h: 2.1 }); }
  // The sliding gate stands drawn back against the left pier.
  const lw = w * 0.42, lz = z - hw + lw / 2;
  p.box(x + 0.5, G + 0.3, lz, 0.3, 0.3, lw, leaf).box(x + 0.5, G + 3.6, lz, 0.3, 0.3, lw, leaf);
  for (let i = 0; i <= 7; i++) p.box(x + 0.5, G + 0.5, lz - lw / 2 + 0.15 + (lw - 0.3) * i / 7, 0.2, 3.2, 0.2, leaf);
  if (light) p.light(x - 3, G + 7, z, 16, '#ffe2b0', 0.55, 'facade', 'gate');
}

// ------------------------------------------------------------------ plants and lamps
export function tree(p, x, z, s = 1, kind = 0) {
  const u = unit('tree:' + p.site.id + x.toFixed(1) + z.toFixed(1));
  const greens = [COL.green, COL.greenDark, '#6b9a50', '#88ad62'];
  const col = greens[Math.floor(u * greens.length) % greens.length];
  p.cyl(x, G, z, 0.45 * s, 3.4 * s, '#7a5a3e', 6, 'body', null, 0.7);
  if (kind === 1) { p.cone(x, G + 2.2 * s, z, 2.4 * s, 7.5 * s, col, 7); return p; }
  p.blob(x, G + 5.2 * s, z, 2.9 * s, col, 0.9);
  p.blob(x + 1.2 * s, G + 6.2 * s, z - 0.6 * s, 2.0 * s, greens[(Math.floor(u * 7) + 1) % 4], 0.9);
  return p;
}

export function bush(p, x, z, r = 1.2, color = COL.greenDark) { return p.blob(x, G + r * 0.6, z, r, color, 0.7); }

export function hedge(p, x0, x1, z0, z1, h = 1.3, color = COL.greenDark) { return p.span(x0, x1, G, G + h, z0, z1, color); }

// A planter bed: kerb plus soil-and-leaf top.
export function bed(p, x0, x1, z0, z1, color = COL.green) {
  p.span(x0 - 0.3, x1 + 0.3, G, G + 0.7, z0 - 0.3, z1 + 0.3, COL.concrete);
  p.span(x0, x1, G + 0.6, G + 0.95, z0, z1, color);
}

export function lamp(p, x, z, { h = 8, lit = true, group = 'lamps', radius = 15, intensity = 0.55 } = {}) {
  p.cyl(x, G, z, 0.22, h, COL.dark, 6);
  p.glowBox(x, G + h, z, 1.3, 0.35, 1.3, '#f2eee4', '#ffe0a8', 'lamps', 1.4);
  if (lit) p.light(x, G + h - 0.5, z, radius, '#ffd9a0', intensity, group, 'lamp');
}

export function bench(p, x, z, ry = 0) {
  p.at(x, G, z, ry, q => {
    q.box(0, 1.2, 0, 1.6, 0.25, 4.2, COL.wood).box(-0.55, 1.45, 0, 0.3, 1.3, 4.2, COL.wood);
    q.box(0, 0, 1.7, 1.2, 1.2, 0.3, COL.dark).box(0, 0, -1.7, 1.2, 1.2, 0.3, COL.dark);
  });
}

export function bikes(p, x, z, count = 6, ry = 0) {
  p.at(x, G, z, ry, q => {
    q.box(0, 0, 0, 2.2, 0.25, count * 1.4 + 0.8, COL.concrete);
    q.box(0, 3.4, 0, 3.6, 0.3, count * 1.4 + 1.4, COL.teal).box(-1.5, 0.25, -count * 0.7 - 0.5, 0.25, 3.15, 0.25, COL.steel).box(-1.5, 0.25, count * 0.7 + 0.5, 0.25, 3.15, 0.25, COL.steel).box(1.5, 0.25, -count * 0.7 - 0.5, 0.25, 3.15, 0.25, COL.steel).box(1.5, 0.25, count * 0.7 + 0.5, 0.25, 3.15, 0.25, COL.steel);
    for (let i = 0; i < count; i++) {
      const zz = (i - (count - 1) / 2) * 1.4, c = ['#d9d4ce', '#c9483b', '#3e6fa8', '#f0c03a'][i % 4];
      q.tube(0.9, 0.9, zz, 0.9, 0.22, '#222', 'z', 8).tube(-0.9, 0.9, zz, 0.9, 0.22, '#222', 'z', 8).box(0, 1.3, zz, 2.2, 0.2, 0.3, c);
    }
  });
}

// ------------------------------------------------------------------ flag, court
export function flagpole(p, x, z, height = 20, flagKey = 'flag-roc') {
  p.cyl(x, G, z, 0.9, 0.7, COL.concrete, 8).cyl(x, G + 0.7, z, 0.28, height - 0.7, '#dfe3e6', 6);
  p.blob(x, G + height + 0.2, z, 0.45, '#e8c14c', 1);
  if (flagKey) p.sign(flagKey, 'f', x + 0.05, G + height - 2.0, z + 2.9, 5.8, { channel: null, power: 0 });
}

// A basketball court (long side along z unless alongX), with two hoops.
export function court(p, cx, cz, len, wid, { color = '#3f7d6e', zone = '#c9573f', alongX = false } = {}) {
  const lx = alongX ? len : wid, lz = alongX ? wid : len;
  const y = G + 0.07;
  p.pad(cx - lx / 2 - 1.4, cx + lx / 2 + 1.4, cz - lz / 2 - 1.4, cz + lz / 2 + 1.4, '#9a9a96', G + 0.1);
  p.pad(cx - lx / 2, cx + lx / 2, cz - lz / 2, cz + lz / 2, color, G + 0.17);
  const line = (x0, x1, z0, z1) => p.pad(x0, x1, z0, z1, '#f4f1e8', G + 0.25);
  const t = 0.28;
  line(cx - lx / 2, cx + lx / 2, cz - lz / 2, cz - lz / 2 + t); line(cx - lx / 2, cx + lx / 2, cz + lz / 2 - t, cz + lz / 2);
  line(cx - lx / 2, cx - lx / 2 + t, cz - lz / 2, cz + lz / 2); line(cx + lx / 2 - t, cx + lx / 2, cz - lz / 2, cz + lz / 2);
  if (alongX) line(cx - t / 2, cx + t / 2, cz - lz / 2, cz + lz / 2); else line(cx - lx / 2, cx + lx / 2, cz - t / 2, cz + t / 2);
  p.ring(cx, G + 0.27, cz, Math.min(lx, lz) * 0.16, Math.min(lx, lz) * 0.16 - t, '#f4f1e8', 20);
  for (const s of [-1, 1]) {
    // Painted key under each hoop.
    const kw = Math.min(lx, lz) * 0.34, kd = len * 0.2;
    if (alongX) p.pad(s > 0 ? cx + lx / 2 - kd : cx - lx / 2, s > 0 ? cx + lx / 2 : cx - lx / 2 + kd, cz - kw / 2, cz + kw / 2, zone, G + 0.21);
    else p.pad(cx - kw / 2, cx + kw / 2, s > 0 ? cz + lz / 2 - kd : cz - lz / 2, s > 0 ? cz + lz / 2 : cz - lz / 2 + kd, zone, G + 0.21);
    const hx = alongX ? cx + s * (lx / 2 + 0.6) : cx, hz = alongX ? cz : cz + s * (lz / 2 + 0.6);
    p.cyl(hx, G, hz, 0.22, 9.2, COL.dark, 6);
    if (alongX) p.box(hx - s * 0.7, G + 8.2, hz, 0.2, 2.6, 3.6, COL.white).ring(hx - s * 1.5, G + 8.4, hz, 0.9, 0.7, '#e0522e', 10);
    else p.box(hx, G + 8.2, hz - s * 0.7, 3.6, 2.6, 0.2, COL.white).ring(hx, G + 8.4, hz - s * 1.5, 0.9, 0.7, '#e0522e', 10);
  }
}

// ------------------------------------------------------------------ vehicles
const WHEEL = '#1d2023';
function wheels(q, pts, r = 0.85, w = 0.7) {
  for (const [x, z] of pts) { q.tube(x, r, z, r, w, WHEEL, 'z', 12); q.tube(x, r, z + Math.sign(z) * w * 0.52, r * 0.55, 0.08, '#aab0b6', 'z', 10); }
}

// A passenger car, 8.6 x 3.4. heading: local +x forward at ry = 0.
export function car(p, x, z, ry, color = '#c9483b', { taxi = false, police = false, van = false } = {}) {
  p.at(x, G, z, ry, q => {
    wheels(q, [[2.7, 1.5], [2.7, -1.5], [-2.7, 1.5], [-2.7, -1.5]]);
    q.box(0, 0.55, 0, 8.6, 1.55, 3.4, police ? COL.white : color).box(0, 0.35, 0, 8.7, 0.35, 3.45, '#2a2d31');
    const cab = van ? 6.6 : 4.8, cx = van ? -0.8 : -0.5;
    q.box(cx, 2.1, 0, cab, 1.05, 3.0, COL.glassDark).box(cx, 3.1, 0, cab - 0.3, 0.25, 3.1, police ? COL.white : color);
    q.box(cx, 2.1, 0, cab - 1.2, 1.07, 3.08, police ? COL.white : color); // pillars
    q.put(U.box(), cx + cab / 2 + 0.2, 2.55, 0, [0, 0, -0.75], [1.6, 0.12, 3.0], COL.glassDark);
    if (police) { q.box(0, 1.2, 0, 8.7, 0.45, 3.45, COL.blue); q.glowBox(cx, 3.35, 0, 0.8, 0.4, 2.2, '#c33', '#ff3b30', 'beacon', 1.6); }
    if (taxi) q.box(cx, 3.35, 0, 1.4, 0.55, 0.9, '#fff1a8');
    q.glowBox(4.34, 1.2, 1.1, 0.12, 0.45, 0.8, '#f5f0d8', '#fff2c0', 'lamps', 0.8).glowBox(4.34, 1.2, -1.1, 0.12, 0.45, 0.8, '#f5f0d8', '#fff2c0', 'lamps', 0.8);
  });
}

// A single-deck bus, 12.6 x 3.8.
export function bus(p, x, z, ry, color = '#2f7f8f', stripe = '#f2efe6') {
  p.at(x, G, z, ry, q => {
    wheels(q, [[3.9, 1.7], [3.9, -1.7], [-3.6, 1.7], [-3.6, -1.7]], 0.95, 0.8);
    q.box(0, 0.7, 0, 12.6, 4.0, 3.8, color);
    q.box(-0.2, 2.2, 0, 11.6, 1.5, 3.86, COL.glassDark);
    q.box(0, 3.05, 0, 12.6, 0.1, 3.84, stripe).box(0, 1.7, 0, 12.64, 0.35, 3.84, stripe);
    q.box(0, 4.7, 0, 12.3, 0.3, 3.5, '#e8e4da').box(-3, 5.0, 0, 3, 0.4, 2.2, '#cfd3d6');
    q.quad(6.35, 3.0, 0, 3.5, 1.9, 'f', COL.glassDark);
    q.glowBox(6.32, 1.0, 1.3, 0.1, 0.5, 0.8, '#f5f0d8', '#fff2c0', 'lamps', 0.8).glowBox(6.32, 1.0, -1.3, 0.1, 0.5, 0.8, '#f5f0d8', '#fff2c0', 'lamps', 0.8);
    q.box(6.31, 4.1, 0, 0.1, 0.45, 2.6, '#222').glowBox(6.33, 4.12, 0, 0.1, 0.4, 2.3, '#222', '#ffb347', 'lamps', 1.2);
  });
}

// A box truck: cab and cargo box, 12.4 long.
export function boxTruck(p, x, z, ry, color = '#f3f1ea', { cab = '#3e6fa8', stripe = null, len = 8.6 } = {}) {
  p.at(x, G, z, ry, q => {
    const total = len + 4.2, x0 = -total / 2;
    wheels(q, [[total / 2 - 2, 1.65], [total / 2 - 2, -1.65], [x0 + 2.2, 1.65], [x0 + 2.2, -1.65], [x0 + 4, 1.65], [x0 + 4, -1.65]], 0.95, 0.8);
    q.box(x0 + len / 2, 1.5, 0, len, 5.4, 3.7, color);
    if (stripe) q.box(x0 + len / 2, 2.6, 0, len + 0.04, 0.9, 3.74, stripe);
    q.box(x0 + len + 2.1, 0.9, 0, 4.0, 3.4, 3.6, cab).box(x0 + len + 3.0, 3.1, 0, 2.3, 1.5, 3.55, COL.glassDark);
    q.box(x0 + 1.5, 0.9, 0, total - 1, 0.8, 3.3, '#2a2d31');
    q.glowBox(total / 2 + 0.05, 1.5, 1.2, 0.1, 0.5, 0.8, '#f5f0d8', '#fff2c0', 'lamps', 0.8).glowBox(total / 2 + 0.05, 1.5, -1.2, 0.1, 0.5, 0.8, '#f5f0d8', '#fff2c0', 'lamps', 0.8);
  });
}

// A garbage truck: yellow cab, rear hopper, packing drum.
export function garbageTruck(p, x, z, ry, color = '#f0b32a') {
  p.at(x, G, z, ry, q => {
    wheels(q, [[3.6, 1.65], [3.6, -1.65], [-3, 1.65], [-3, -1.65], [-1.4, 1.65], [-1.4, -1.65]], 0.95, 0.8);
    q.box(-0.6, 0.9, 0, 8.4, 0.8, 3.3, '#2a2d31');
    q.box(-1.2, 1.7, 0, 7.4, 4.0, 3.7, color).box(-4.6, 1.7, 0, 0.8, 4.4, 3.7, '#e09a1a');
    q.box(-1.2, 5.6, 0, 7.4, 0.5, 3.4, '#e09a1a').box(-1.2, 3.1, 0, 7.5, 0.5, 3.74, '#2f7a4a');
    q.box(3.9, 0.9, 0, 3.6, 3.4, 3.6, color).box(4.4, 3.1, 0, 2.4, 1.5, 3.55, COL.glassDark);
    q.glowBox(5.75, 1.3, 1.2, 0.1, 0.5, 0.8, '#f5f0d8', '#fff2c0', 'lamps', 0.8).glowBox(5.75, 1.3, -1.2, 0.1, 0.5, 0.8, '#f5f0d8', '#fff2c0', 'lamps', 0.8);
    q.glowBox(4.2, 4.65, 0, 0.5, 0.35, 1.4, '#e6a000', '#ffb347', 'beacon', 1.2);
  });
}

export function ambulance(p, x, z, ry) {
  p.at(x, G, z, ry, q => {
    wheels(q, [[2.9, 1.65], [2.9, -1.65], [-2.7, 1.65], [-2.7, -1.65]], 0.9);
    q.box(-0.4, 0.8, 0, 8.6, 4.2, 3.6, COL.white).box(3.2, 3.2, 0, 2.2, 1.5, 3.55, COL.glassDark);
    q.box(-0.4, 2.1, 0, 8.64, 0.6, 3.64, COL.red).box(-0.4, 0.5, 0, 8.7, 0.4, 3.5, '#2a2d31');
    q.glowBox(2.2, 5.0, 0, 0.7, 0.4, 2.8, '#c33', '#ff3b30', 'beacon', 1.8).glowBox(1.5, 5.0, 0, 0.5, 0.4, 2.4, '#36c', '#3b6bff', 'beacon', 1.6);
    q.glowBox(4.72, 1.4, 1.2, 0.1, 0.5, 0.8, '#f5f0d8', '#fff2c0', 'lamps', 0.8).glowBox(4.72, 1.4, -1.2, 0.1, 0.5, 0.8, '#f5f0d8', '#fff2c0', 'lamps', 0.8);
  });
}

// A wheeled bin, standing on its own.
export function bin(p, x, z, color = '#2f7a4a', ry = 0) {
  p.at(x, G, z, ry, q => { q.box(0, 0, 0, 1.5, 2.4, 1.3, color).box(0, 2.4, 0, 1.7, 0.25, 1.5, '#222'); });
}

// ------------------------------------------------------------------ the classroom block
// A long block with its corridor on the +x side. Drawn around (cx, cz), turned ry; len runs
// along its z, depth along its x (corridor included). accent: colours of the parapet bands.
export function corridorBlock(p, o) {
  const { cx, cz, ry = 0, len, depth, floors, cor = 3, wall = COL.cream, accents = [COL.yellow, COL.teal, COL.red], rail = COL.white,
    slab = COL.white, column = COL.white, roof = COL.grey, glass = COL.glass, backSkip = null, endWindows = true, pitch = 4.2, ground = true } = o;
  const H = floors * 6;
  p.at(cx, 0, cz, ry, q => {
    const xf = depth / 2, xm = xf - cor, xb = -depth / 2;
    q.span(xb, xm, G, G + H, -len / 2, len / 2, wall);
    q.span(xb - 0.5, xf + 0.5, G + H, G + H + 0.7, -len / 2 - 0.5, len / 2 + 0.5, roof);
    // Roof parapet.
    const rp = G + H + 0.7;
    q.span(xb - 0.5, xf + 0.5, rp, rp + 0.9, -len / 2 - 0.5, -len / 2 - 0.1, slab).span(xb - 0.5, xf + 0.5, rp, rp + 0.9, len / 2 + 0.1, len / 2 + 0.5, slab);
    q.span(xb - 0.5, xb - 0.1, rp, rp + 0.9, -len / 2, len / 2, slab).span(xf + 0.1, xf + 0.5, rp, rp + 0.9, -len / 2, len / 2, slab);
    for (let f = 0; f < floors; f++) {
      const y = G + f * 6;
      if (f > 0) q.span(xm, xf, y - 0.45, y + 0.05, -len / 2, len / 2, slab);
      // The corridor parapet, with a band of colour.
      q.span(xf - 0.3, xf, y + 0.05, y + 2.2, -len / 2, len / 2, rail);
      q.span(xf - 0.32, xf + 0.04, y + 0.9, y + 1.5, -len / 2, len / 2, accents[f % accents.length]);
    }
    const nc = Math.max(2, Math.round(len / 5));
    for (let i = 0; i <= nc; i++) q.span(xf - 0.55, xf - 0.05, G, G + H, -len / 2 + len * i / nc - 0.25, -len / 2 + len * i / nc + 0.25, column);
    const kw = { floors, pitch, w: 2.7, h: 2.7, sill: 1.9, panes: 2, glass };
    q.windows('f', xm, -len / 2 + 1.6, len / 2 - 1.6, kw);
    q.windows('b', xb, -len / 2 + 1.6, len / 2 - 1.6, { ...kw, skip: backSkip });
    if (endWindows) {
      const ew = { ...kw, pitch: 4.5, w: 2.4 };
      q.windows('p', len / 2, xb + 1.6, xm - 1.6, ew);
      q.windows('n', -len / 2, xb + 1.6, xm - 1.6, ew);
    }
    // Classroom doors at ground level and a plinth.
    q.span(xb - 0.2, xm + 0.2, G, G + 0.6, -len / 2 - 0.2, len / 2 + 0.2, COL.concrete);
    void ground;
  });
}

// Rooftop clutter: water tanks and a stair head, deterministic from the site.
export function roofPlant(p, rect, y, { tanks = 2, stair = true, seed = '' } = {}) {
  const u = k => unit(p.site.id + seed + k);
  for (let i = 0; i < tanks; i++) {
    const x = rect.x0 + (rect.w) * (0.25 + 0.5 * u('t' + i)), z = rect.z0 + rect.d * (0.2 + 0.6 * u('tz' + i));
    p.cyl(x, y + 0.8, z, 1.5, 3.2, '#dfe3e6', 10).cyl(x, y, z, 1.7, 0.8, COL.steel, 8).cone(x, y + 4, z, 1.6, 0.8, '#c8ccd0', 10);
  }
  if (stair) p.box(rect.x0 + rect.w * 0.2, y, rect.z1 - rect.d * 0.18, 4.4, 3.6, 5, COL.cream).box(rect.x0 + rect.w * 0.2, y + 3.6, rect.z1 - rect.d * 0.18, 4.8, 0.4, 5.4, COL.grey);
}

export { lrect, freeRect, G };
