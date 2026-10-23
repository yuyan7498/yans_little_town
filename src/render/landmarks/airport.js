// 小鎮機場: the airport on its two merged lots and 小鎮航空's two planes.
// The plot is built in its own frame (as src/render/buildings/a-kit.js: +x out of the
// front, z along it) from airportOf(world); planes are placed in world space from
// planesAt(). Static geometry is merged per material; the planes, the windsock and the
// tower's beacon move by transforms only.

import * as THREE from 'three';
import { airportOf, planesAt } from '../../core/world/flights.js';
import { ShapeBuilder, material } from '../kit.js';
import { Glows, mesh, litMaterial, setLevel, pointScale, moduleBase, lightSource, clamp01 } from './common.js';
import { sharedGeometry, createPlane } from './plane.js';

const C = {
  grass: '#7aa35b', grassLight: '#86ad64', asphalt: '#41454a', apron: '#c5bfb3', joint: '#a8a194', white: '#f4f1ea', yellow: '#eebd2d',
  paver: '#d8d2c6', cream: '#ebe4d5', concrete: '#c9c3b8', teal: '#2f8f88', tealDark: '#256f6a', orange: '#ee8a2e', steel: '#8fa3ad',
  glass: '#4d7f95', glassDark: '#35566a', dark: '#3b4045', metal: '#8c949b', rail: '#e6e0d2', red: '#d6403a',
  lamp: '#fff1c8', blue: '#5ab4ff', green: '#46ff8a', redLamp: '#ff4a3a', fence: '#9aa3a8'
};
const CARS = ['#e8574a', '#f0c03a', '#3f8f88', '#3e6fa8', '#e9e2d4', '#2e3a4a', '#8a5fb0'];
// Heights of the layers on the ground (each at least 0.05 above the one under it).
const Y = { grass: 0.22, mow: 0.27, pave: 0.34, joint: 0.38, paint: 0.4, lamp: 0.2 };
const TOWER = { shaft: 28.8, flare: 31, cab: 34.2, roof: 34.8 };

// ------------------------------------------------------------------ flat paint
// An up-facing rectangle (no thickness) at height y.
function flat(sb, cx, cz, w, d, y, color) {
  return sb.add(new THREE.PlaneGeometry(w, d), sb.transform(cx, y, cz, [-Math.PI / 2, 0, 0]), color);
}
const _id = new THREE.Matrix4();
// A ribbon of constant width along a polyline (flat, facing up).
function ribbon(sb, pts, width, y, color) {
  const left = [], right = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1, nx = -dz / len * width / 2, nz = dx / len * width / 2;
    left.push([p[0] + nx, p[1] + nz]); right.push([p[0] - nx, p[1] - nz]);
  });
  const pos = [], nor = [];
  const tri = (p, q, r) => {
    const ux = q[0] - p[0], uz = q[1] - p[1], vx = r[0] - p[0], vz = r[1] - p[1];
    const [a, b, c] = uz * vx - ux * vz >= 0 ? [p, q, r] : [p, r, q];
    for (const v of [a, b, c]) { pos.push(v[0], y, v[1]); nor.push(0, 1, 0); }
  };
  for (let i = 0; i < pts.length - 1; i++) { tri(left[i], right[i], left[i + 1]); tri(right[i], right[i + 1], left[i + 1]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return sb.add(g, _id, color);
}
const bezier = (p, c, q, n = 8) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, m = 1 - t; return [m * m * p[0] + 2 * m * t * c[0] + t * t * q[0], m * m * p[1] + 2 * m * t * c[1] + t * t * q[1]]; });

// Seven-segment digits, painted flat. (dr, du) are the text's right and up directions on
// the ground as [x, z], so a number can be read from the way it is approached.
const SEGMENTS = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
function number(sb, text, cx, cz, dr, du, W, H, t, gap, y, color) {
  const total = text.length * W + (text.length - 1) * gap;
  const rect = (u, v, su, sv) => {
    const x = cx + dr[0] * u + du[0] * v, z = cz + dr[1] * u + du[1] * v;
    flat(sb, x, z, Math.abs(dr[0]) * su + Math.abs(du[0]) * sv, Math.abs(dr[1]) * su + Math.abs(du[1]) * sv, y, color);
  };
  [...text].forEach((ch, i) => {
    const u0 = -total / 2 + i * (W + gap), seg = SEGMENTS[ch] || '', uc = u0 + W / 2, top = H / 2, hi = [t / 2, top - t], lo = [-top + t, -t / 2];
    const vertical = (u, [a, b]) => rect(u, (a + b) / 2, t, b - a);
    if (seg.includes('a')) rect(uc, top - t / 2, W, t);
    if (seg.includes('g')) rect(uc, 0, W, t);
    if (seg.includes('d')) rect(uc, -top + t / 2, W, t);
    if (seg.includes('f')) vertical(u0 + t / 2, hi);
    if (seg.includes('b')) vertical(u0 + W - t / 2, hi);
    if (seg.includes('e')) vertical(u0 + t / 2, lo);
    if (seg.includes('c')) vertical(u0 + W - t / 2, lo);
  });
}

// ------------------------------------------------------------------ canvas textures
function airportSign() {
  const c = document.createElement('canvas'); c.width = 1400; c.height = 240;
  const g = c.getContext('2d');
  g.fillStyle = '#1f4f5a'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#ffe9b0'; g.lineWidth = 8; g.strokeRect(10, 10, c.width - 20, c.height - 20);
  g.fillStyle = '#fffaf0'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 128px "Noto Sans TC","Microsoft JhengHei","PingFang TC",sans-serif';
  g.fillText('小鎮機場', 700, 98);
  g.font = '700 44px "Noto Sans TC","Microsoft JhengHei",sans-serif';
  g.fillStyle = '#ffd27a'; g.fillText('T O W N   A I R P O R T', 700, 190);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { texture: t, aspect: c.width / c.height };
}

// ------------------------------------------------------------------ pieces of the plot
// The apron stops where the car park starts.
const apronZ0 = L => Math.max(L.apron.z0, L.carpark.z1);

function grassAndPaving(b, A) {
  const L = A.local, { area, runway, taxiway, apron } = L;
  b.ground.block(-0.05, 0.1, 0, area.w - 0.1, Y.grass - 0.1, area.d, C.grass);
  // Mown stripes beside the runway and between the runway and the taxiway.
  for (const [x0, x1] of [[area.x0 + 0.5, runway.x0], [runway.x1, taxiway.x0]]) {
    for (let z = -area.d / 2 + 4, i = 0; z < area.d / 2 - 4; z += 6, i++) if (i % 2 === 0) flat(b.ground, (x0 + x1) / 2, z + 3, x1 - x0, 6, Y.mow, C.grassLight);
  }
  const slab = (r, color, x0 = r.x0, x1 = r.x1, z0 = r.z0, z1 = r.z1) => b.ground.block((x0 + x1) / 2, 0.1, (z0 + z1) / 2, x1 - x0, Y.pave - 0.1, z1 - z0, color);
  slab(runway, C.asphalt);
  slab(taxiway, C.asphalt);
  for (const link of L.links) slab(link, C.asphalt, runway.x1, taxiway.x0);
  // The apron reaches the taxiway and the hangar's open front.
  slab(apron, C.apron, taxiway.x1, L.terminal.x0 - 0.2, apronZ0(L), L.hangar.z0);
  // Landside: the forecourt in front of the terminal, the car park and its lane.
  const front = area.x1, fx0 = L.terminal.x1 - 0.2;
  slab(L.terminal, C.paver, fx0, front, -L.terminal.d / 2 - 2, L.terminal.d / 2 + 2);
  slab(L.carpark, C.asphalt, L.carpark.x0, front, L.carpark.z0, L.carpark.z1);
  slab(L.terminal, C.asphalt, front - 3, front, L.carpark.z1, -L.terminal.d / 2 - 2);
  // The hangar's floor.
  slab(L.hangar, C.concrete);
}

function runwayPaint(b, A) {
  const L = A.local, rw = L.runway, cx = rw.x, g = b.ground, y = Y.paint;
  const half = rw.d / 2;
  // Edge lines, centre dashes, threshold piano keys at both ends.
  // Edge lines stop short of the links, where the yellow lead-on lines cross the runway.
  const gap = 3.4;
  for (const s of [-1, 1]) for (const [z0, z1] of [[-half + 0.1, -A.link - gap], [-A.link + gap, A.link - gap], [A.link + gap, half - 0.1]]) flat(g, cx + s * 4.1, (z0 + z1) / 2, 0.3, z1 - z0, y, C.white);
  for (let z = -42; z < 42; z += 12) flat(g, cx, z + 3, 0.35, 6, y, C.white);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 8; i++) flat(g, cx - 3.5 + i, s * (half - 3.0), 0.6, 4.5, y, C.white);
    // Touchdown bars.
    for (const k of [-1, 1]) { flat(g, cx + k * 2.2, s * 38, 0.8, 4, y, C.white); flat(g, cx + k * 2.2, s * 30, 0.6, 3, y, C.white); }
  }
  // Numbers, upright for a pilot looking down the runway: 36 at the south end, 18 at the north.
  number(g, '36', cx, half - 12.5, [1, 0], [0, -1], 2.6, 7, 0.7, 1, y, C.white);
  number(g, '18', cx, -(half - 12.5), [-1, 0], [0, 1], 2.6, 7, 0.7, 1, y, C.white);
}

function taxiwayPaint(b, A) {
  const L = A.local, g = b.ground, y = Y.paint, tx = L.taxiway.x, rx = L.runway.x, y0 = A.link;
  const line = pts => ribbon(g, pts, 0.28, y, C.yellow);
  // Down the taxiway from link to link, round both corners and out to the runway's centre.
  line([[rx, -y0], ...bezier([tx - 6, -y0], [tx, -y0], [tx, -y0 + 6]), ...bezier([tx, y0 - 6], [tx, y0], [tx - 6, y0]), [rx, y0]]);
  // Stands: a lead-in curve from the taxiway, a stop bar and the number in front of the nose.
  for (const st of A.stands) {
    const { x, z } = st.local;
    line([...bezier([tx, z + 6], [tx, z], [tx + 6, z]).slice(2), [x + 9, z]]);
    flat(g, x + 9.6, z, 0.4, 4.4, y, C.yellow);
    number(g, String(st.index + 1), x + 11.2, z, [0, 1], [1, 0], 1.3, 2.2, 0.34, 0.5, y, C.yellow);
  }
}

// Concrete joints on the apron.
function apronJoints(b, A) {
  const x0 = A.local.taxiway.x1, x1 = A.local.terminal.x0 - 0.2, z0 = apronZ0(A.local), z1 = A.local.hangar.z0;
  for (let z = z0 + 8; z < z1 - 2; z += 8) flat(b.ground, (x0 + x1) / 2, z, x1 - x0, 0.16, Y.joint, C.joint);
  for (let x = x0 + 8; x < x1 - 2; x += 8) flat(b.ground, x, (z0 + z1) / 2, 0.16, z1 - z0, Y.joint, C.joint);
}

// Runway, taxiway and approach lights: lamp heads in `lit`, their halos in `glows`.
function airfieldLights(b, A) {
  const L = A.local, rw = L.runway, tx = L.taxiway.x, half = rw.d / 2;
  const lamp = (x, z, color, size = 2.4, h = 0.34, y = Y.lamp) => { b.lit.block(x, y, z, 0.42, h, 0.42, color); b.glows.add(x, y + h + 0.1, z, color, size); };
  for (let z = -half + 4; z <= half - 3.9; z += 8) for (const s of [-1, 1]) lamp(rw.x + s * 5.0, z, C.lamp, 2.6);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 7; i++) { lamp(rw.x - 3.6 + i * 1.2, s * (half - 0.7), C.green, 2.2, 0.2, Y.pave); lamp(rw.x - 3.6 + i * 1.2, s * (half + 0.9), C.redLamp, 2.2); }
  }
  for (let z = -A.link + 1; z <= A.link; z += 8) for (const x of [tx - 3.0, tx + 3.0]) lamp(x, z, C.blue, 1.8, 0.26, x > tx ? Y.pave : Y.lamp);
  // Approach lights south of the runway end: a crossbar with lamps on short posts.
  const zb = half + 3.3;
  b.solid.block(rw.x, 0.2, zb, 13, 0.14, 0.3, C.white);
  for (let i = -4; i <= 4; i++) { b.solid.block(rw.x + i * 1.5, 0.2, zb, 0.2, 0.9, 0.2, C.white); lamp(rw.x + i * 1.5, zb, '#fffbe8', 3, 0.3, 1.1); }
  b.solid.block(rw.x, 0.2, zb - 1.6, 0.2, 0.9, 0.2, C.white);
  lamp(rw.x, zb - 1.6, '#fffbe8', 3, 0.3, 1.1);
}

function fence(b, A) {
  const a = A.local.area, sb = b.solid, hgt = 3.4, step = 6;
  const run = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / step)), ux = (x1 - x0) / len, uz = (z1 - z0) / len;
    const alongX = Math.abs(ux) > 0.5;
    for (let i = 0; i <= n; i++) sb.block(x0 + ux * len * i / n, Y.grass, z0 + uz * len * i / n, 0.34, hgt + 0.3, 0.34, C.fence);
    for (let i = 0; i < n; i++) {
      const cx = x0 + ux * len * (i + 0.5) / n, cz = z0 + uz * len * (i + 0.5) / n, seg = len / n - 0.34;
      sb.block(cx, Y.grass, cz, alongX ? seg : 0.16, 0.2, alongX ? 0.16 : seg, C.metal);
      sb.block(cx, hgt - 0.1, cz, alongX ? seg : 0.16, 0.16, alongX ? 0.16 : seg, C.metal);
      sb.block(cx, Y.grass + 0.2, cz, alongX ? seg : 0.05, hgt - 0.5, alongX ? 0.05 : seg, '#b9c1c5');
    }
  };
  const e = 0.3;
  run(a.x0 + e, a.z0 + e, a.x0 + e, a.z1 - e);
  run(a.x0 + e, a.z0 + e, a.x1 - e, a.z0 + e);
  run(a.x0 + e, a.z1 - e, a.x1 - e, a.z1 - e);
}

// ------------------------------------------------------------------ terminal
function terminal(b, A, windowLevel) {
  const T = A.local.terminal, sb = b.solid, gl = b.glass;
  const cx = T.x, x0 = T.x0, x1 = T.x1, z1 = T.z1, depth = T.w, len = T.d;
  const top = 12.9, roof = 13.0;
  sb.block(cx, 0.2, 0, depth + 0.8, 0.6, len + 0.8, C.concrete);             // plinth, top 0.8
  gl.block(cx, 0.7, 0, depth, top - 0.7, len - 0.8, C.glass);              // glazed hall
  for (const s of [-1, 1]) sb.block(cx, 0.75, s * (z1 - 0.3), depth + 0.1, roof - 0.75, 0.6, C.cream);   // solid end walls
  // Mullions and a floor band round both long faces, bigger than the glass behind.
  sb.block(cx, 6.6, 0, depth + 0.24, 0.4, len + 0.24, C.white);
  for (const face of [x0, x1]) {
    for (let z = -z1 + 4; z <= z1 - 4 + 0.01; z += 4) {
      if (face === x1 && Math.abs(z) < 6) continue;
      sb.block(face, 0.8, z, 0.4, roof - 0.8, 0.4, C.white);
    }
  }
  // Roof slab with a teal fascia, and plant on top.
  sb.block(cx, roof, 0, depth + 2.8, 0.8, len + 1.4, C.white);
  sb.block(cx, roof + 0.2, 0, depth + 3.2, 0.4, len + 1.8, C.teal);
  sb.block(cx - 2, roof + 0.8, -14, 4, 1.3, 7, C.concrete); sb.block(cx + 1, roof + 0.8, 8, 3, 1.0, 5, C.concrete);
  sb.block(cx - 2, roof + 0.8, 22, 4.5, 1.4, 6, C.concrete);
  // Entrance: a glazed vestibule, its roof, and a canopy over the drop-off lane.
  gl.block(x1 + 0.9, 0.65, 0, 2.2, 5.75, 9.6, C.glassDark);
  sb.block(x1 + 0.9, 6.4, 0, 2.6, 0.4, 10, C.white);
  for (const s of [-1, 1]) sb.block(x1 + 2.0, 0.8, s * 4.9, 0.3, 5.6, 0.3, C.white);
  const cw = 3.5, cx2 = x1 + cw / 2 + 0.1;
  sb.block(cx2, 7.6, 0, cw, 0.5, 44, C.white);
  sb.block(x1 + cw + 0.05, 7.5, 0, 0.3, 0.9, 44.4, C.teal);
  for (let z = -22; z <= 22; z += 5.5) sb.cylinder(x1 + cw - 0.2, 0.34 + 3.6, z, 0.24, 0.24, 7.2, C.white, 8);
  for (let z = -19.25; z <= 19.25; z += 5.5) { b.lit.block(x1 + 1.8, 7.5, z, 0.8, 0.1, 0.8, '#fff1c8'); b.glows.add(x1 + 1.8, 7.3, z, '#ffe2a8', 4.2); }
  // The sign above the canopy: a teal board carrying the lit panel.
  sb.block(x1 + 0.55, 8.9, 0, 0.9, 3.7, 23.2, C.tealDark);
  const sign = airportSign(), sh = 3.1, sw = sh * sign.aspect;
  b.sign = { texture: sign.texture, x: x1 + 1.02, y: 8.9 + 3.7 / 2, z: 0, w: sw, h: sh };
  void windowLevel;
}

// ------------------------------------------------------------------ control tower
function tower(b, A) {
  const T = A.local.tower, sb = b.solid, gl = b.glass, cx = T.x, cz = T.z;
  sb.block(cx, 0.2, cz, T.w, 4.0, T.d, C.cream);                            // base building
  sb.block(cx, 4.2, cz, T.w + 0.5, 0.4, T.d + 0.5, C.teal);
  for (const s of [-1, 1]) gl.block(cx + s * 0.0, 1.6, cz + s * (T.d / 2 + 0.04), 4.2, 1.6, 0.1, C.glassDark);
  sb.cylinder(cx, 4.6 + (TOWER.shaft - 4.6) / 2, cz, 2.0, 2.4, TOWER.shaft - 4.6, C.white, 8);
  for (const y of [9, 15, 21]) sb.cylinder(cx, y, cz, 2.3 - (y - 4.6) * 0.0125 + 0.12, 2.3 - (y - 4.6) * 0.0125 + 0.12, 1.6, C.orange, 8);
  sb.cylinder(cx, (TOWER.shaft + TOWER.flare) / 2, cz, 3.5, 2.0, TOWER.flare - TOWER.shaft, C.white, 8);
  sb.cylinder(cx, TOWER.flare + 0.1, cz, 3.9, 3.9, 0.2, C.tealDark, 8);
  const cabH = TOWER.cab - TOWER.flare - 0.2;
  gl.cylinder(cx, TOWER.flare + 0.2 + cabH / 2, cz, 3.2, 3.2, cabH, C.glass, 10);
  for (let i = 0; i < 10; i++) { const a = (i + 0.5) / 10 * Math.PI * 2; sb.block(cx + Math.cos(a) * 3.3, TOWER.flare + 0.2, cz + Math.sin(a) * 3.3, 0.3, cabH, 0.3, C.white); }
  sb.cylinder(cx, TOWER.cab + 0.3, cz, 3.9, 3.9, 0.6, C.white, 10);
  sb.cylinder(cx, TOWER.cab + 0.64, cz, 0.0, 0.0, 0.0, C.white, 3);
  // Antenna mast beside the beacon.
  sb.cylinder(cx + 2.4, TOWER.roof + 1.6, cz, 0.08, 0.1, 3.4, C.metal, 5);
  for (const dz of [-2, 2]) sb.block(cx + dz * 0.5, TOWER.roof, cz + dz * 0.7, 0.5, 0.5, 0.5, C.dark);
  // Fire stairs / railing on the base roof.
  sb.block(cx + T.w / 2 - 0.2, 4.6, cz, 0.12, 0.8, T.d, C.rail);
}

// ------------------------------------------------------------------ hangar
function archBand(outer, inner, steps = 14) {
  const pts = [];
  for (let i = 0; i <= steps; i++) { const t = Math.PI * i / steps; pts.push([outer[0] * Math.cos(t), outer[1] * Math.sin(t)]); }
  for (let i = steps; i >= 0; i--) { const t = Math.PI * i / steps; pts.push([inner[0] * Math.cos(t), inner[1] * Math.sin(t)]); }
  return pts;
}
function extrude(sb, pts, depth, x, y, z, color, holes = []) {
  const shape = new THREE.Shape(pts.map(([a, c]) => new THREE.Vector2(a, c)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([a, c]) => new THREE.Vector2(a, c))));
  sb.add(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }), sb.transform(x, y, z), color);
}
function hangar(b, A) {
  const H = A.local.hangar, sb = b.solid, cx = H.x, hw = H.w / 2, wall = 9, rise = 5, D = H.d;
  const z0 = H.z0, z1 = H.z1, thick = 0.6;
  const arc = (rx, ry, dx = 0, dy = 0) => Array.from({ length: 19 }, (_, i) => { const t = Math.PI * (1 - i / 18); return [dx + rx * Math.cos(t), dy + ry * Math.sin(t)]; });
  // End walls follow the roof; the front one has the wide opening.
  const gable = [[-hw, Y.pave], [hw, Y.pave], [hw, wall], ...arc(hw, rise, 0, wall).slice(1, -1).reverse(), [-hw, wall]];
  const door = [[-hw + 3, Y.pave + 0.06], [hw - 3, Y.pave + 0.06], [hw - 3, 8.4], [-hw + 3, 8.4]].reverse();
  extrude(sb, gable, thick, cx, 0, z0, C.cream, [door]);
  extrude(sb, gable, thick, cx, 0, z1 - thick, C.cream);
  for (const s of [-1, 1]) sb.block(cx + s * (hw - thick / 2), Y.pave, (z0 + z1) / 2, thick, wall - Y.pave, D - 2 * thick, C.cream);
  // The barrel roof: a thin steel shell with ribs, overlapping the walls a little.
  extrude(sb, archBand([hw + 0.3, rise + 0.3], [hw - 0.1, rise - 0.1]), D + 0.4, cx, wall, z0 - 0.2, C.steel);
  for (let z = z0 + 3; z < z1; z += 6) extrude(sb, archBand([hw + 0.5, rise + 0.7], [hw - 0.4, rise - 0.2]), 0.5, cx, wall - 0.2, z - 0.25, C.concrete);
  // A teal band over the opening and the door leaves parked across its west half.
  sb.block(cx, 9.2, z0 - 0.1, 28, 1.3, 0.2, C.teal);
  const leaf = { x0: H.x0 + 0.1, x1: cx + 1.0 };
  const lw = leaf.x1 - leaf.x0, lx = (leaf.x0 + leaf.x1) / 2;
  sb.block(lx, Y.pave, z0 - 0.5, lw, 8.4, 0.4, C.tealDark);
  for (const y of [1.6, 4.2, 6.8]) sb.block(lx, y, z0 - 0.7, lw + 0.2, 0.5, 0.5, C.white);
  sb.block(lx, 8.4, z0 - 0.5, lw + 0.2, 0.5, 0.5, C.dark);
  // Inside: a back-lit floor mark and a few lamps, a tug and a stair.
  for (let z = z0 + 4; z < z1 - 3; z += 6) for (const x of [cx - 8, cx + 8]) { b.lit.block(x, 11.6, z, 1.6, 0.14, 0.5, '#fff6d8'); b.glows.add(x, 11.4, z, '#ffe9b8', 5); }
  sb.block(cx + 8, Y.pave, z1 - 5, 3.2, 1.2, 2.0, C.orange); sb.block(cx + 8.3, Y.pave + 1.2, z1 - 5, 1.4, 1.0, 1.8, C.teal);
  sb.block(cx - 6, Y.pave, z1 - 4, 2.0, 3.0, 4.5, C.metal);
}

// ------------------------------------------------------------------ cars, masts, small things
function car(sb, x, z, color) {
  const y = Y.pave;
  sb.block(x, y + 0.45, z, 3.4, 1.4, 8.6, color);
  sb.block(x, y + 1.85, z - 0.5, 3.0, 1.1, 4.6, color);
  sb.block(x, y + 2.0, z - 0.5, 3.16, 0.8, 4.76, '#2a3d4c');
  sb.block(x, y + 1.85, z - 0.5, 3.0, 0.14, 4.6, color);
  for (const [dx, dz] of [[-1, -2.7], [1, -2.7], [-1, 2.7], [1, 2.7]]) sb.cylinder(x + dx * 1.62, y + 0.55, z + dz, 0.55, 0.55, 0.4, '#1f2327', 8, [0, 0, Math.PI / 2]);
}

function carPark(b, A) {
  const P = A.local.carpark, sb = b.solid, g = b.ground;
  const rows = [P.z0 + 4.55, P.z1 - 4.55], xs = [P.x0 + 2.2, P.x0 + 6.2, P.x0 + 10.2, P.x0 + 14.2];
  for (const z of rows) for (let i = 0; i <= 4; i++) flat(g, P.x0 + 0.2 + i * 4, z, 0.16, 8.8, Y.paint, C.white);
  const taken = [[0, 0], [1, 0], [3, 0], [0, 1], [2, 1], [3, 1]];
  taken.forEach(([i, r], k) => car(sb, xs[i], rows[r], CARS[(k * 3 + 1) % CARS.length]));
  // Two lamp posts.
  for (const [x, z] of [[P.x0 + 8, 0.5 * (rows[0] + rows[1])], [P.x1 - 3, P.z0 + 1.5]]) lampPost(b, x, z, 9);
}

function lampPost(b, x, z, h) {
  b.solid.block(x, 0.2, z, 0.8, 0.5, 0.8, C.concrete);
  b.solid.cylinder(x, 0.3 + h / 2, z, 0.14, 0.2, h, C.dark, 6);
  b.solid.block(x - 0.4, h, z, 1.4, 0.2, 0.5, C.dark);
  b.lit.block(x - 0.7, h - 0.12, z, 0.7, 0.12, 0.4, '#fff1c8');
  b.glows.add(x - 0.7, h - 0.3, z, '#ffe9b8', 5);
}

function floodlights(b, A) {
  const out = [], T = A.local.terminal;
  for (const z of [-36.5, -11, 15, 40.5]) {
    const x = T.x0 - 1.8;
    b.solid.block(x, 0.2, z, 1.4, 0.6, 1.4, C.concrete);
    b.solid.cylinder(x, 0.5 + 8, z, 0.22, 0.36, 16, C.metal, 8);
    b.solid.block(x - 0.8, 16.4, z, 2.2, 0.5, 4.0, C.dark);
    for (let i = -1; i <= 1; i++) { b.lit.block(x - 1.9, 16.1, z + i * 1.2, 0.3, 0.3, 0.9, '#fff6dc'); b.glows.add(x - 2.1, 16.2, z + i * 1.2, '#fff0c8', 6); }
    out.push([x - 3, z]);
  }
  return out;
}

function windsock(b, A) {
  const x = A.local.runway.x1 + 3.2, z = 20;
  b.solid.block(x, 0.2, z, 1.2, 0.4, 1.2, C.concrete);
  b.solid.cylinder(x, 3.6, z, 0.12, 0.18, 6.4, C.rail, 6);
  b.solid.sphere(x, 6.8, z, 0.25, C.red, 8, 6);
  const sock = new ShapeBuilder();
  for (let i = 0; i < 5; i++) {
    const r0 = 0.62 - i * 0.09, r1 = r0 - 0.09;
    sock.add(new THREE.CylinderGeometry(r1, r0, 0.72, 8, 1, true), sock.transform(0.5 + i * 0.7, 0, 0, [0, 0, Math.PI / 2]), i % 2 ? C.white : C.orange);
  }
  return { x, y: 6.8, z, geometry: sock.build() };
}

// A rotating beacon and radar on the tower roof (their own group).
function towerTop(A) {
  const T = A.local.tower, sb = new ShapeBuilder(), g = new Glows();
  sb.cylinder(0, 0.6, 0, 0.12, 0.16, 1.2, C.metal, 6);
  sb.block(0, 0.9, 0, 0.3, 0.25, 2.8, C.dark);
  sb.block(0, 0.5, 1.4, 0.36, 0.36, 0.36, C.white); sb.block(0, 0.5, -1.4, 0.36, 0.36, 0.36, '#46ff8a');
  sb.cylinder(0, 2.0, 0, 0.1, 0.1, 1.6, C.metal, 6);
  sb.block(0, 3.0, 0, 0.18, 1.0, 3.6, C.rail);
  sb.block(0.35, 3.0, 0, 0.5, 0.3, 0.3, C.dark);
  g.add(0, 1.05, 1.5, '#ffffff', 6).add(0, 1.05, -1.5, '#46ff8a', 6);
  return { geometry: sb.build(), points: g.build(), x: T.x, y: TOWER.roof + 0.6, z: T.z };
}

// ------------------------------------------------------------------ module
export function create({ world, quality = 'full' } = {}) {
  const base = moduleBase('airport');
  const { group } = base;
  const A = airportOf(world);
  if (!A) return { group, update() {}, dispose: base.dispose, lights: [], info: () => ({}) };
  const id = A.site.id;
  const b = { ground: new ShapeBuilder(), solid: new ShapeBuilder(), glass: new ShapeBuilder(), lit: new ShapeBuilder(), glows: new Glows(), sign: null };

  grassAndPaving(b, A); apronJoints(b, A); runwayPaint(b, A); taxiwayPaint(b, A);
  airfieldLights(b, A); fence(b, A);
  terminal(b, A); tower(b, A); hangar(b, A); carPark(b, A);
  const masts = floodlights(b, A);
  const sock = windsock(b, A);
  const top = towerTop(A);

  const F = A.frame;
  const root = new THREE.Group();
  root.position.set(F.ox, 0, F.oz); root.rotation.y = F.rotY;
  group.add(root);

  root.add(mesh(b.ground.build(), material({ roughness: 0.92 }), { receive: true, shadow: false }));
  root.add(mesh(b.solid.build(), material({ roughness: 0.8 }), { receive: true, shadow: true }));
  const glassMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.3, emissive: new THREE.Color('#ffd49a'), emissiveIntensity: 0 });
  glassMaterial.name = 'airport:glass';
  root.add(mesh(b.glass.build(), glassMaterial, { receive: true, shadow: true }));
  const litMat = litMaterial();
  root.add(mesh(b.lit.build(), litMat));
  const glowPoints = b.glows.build({ opacity: 0.85 });
  root.add(glowPoints);

  const signMaterial = new THREE.MeshStandardMaterial({ map: b.sign.texture, emissiveMap: b.sign.texture, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, roughness: 0.6 });
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(b.sign.w, b.sign.h), signMaterial);
  signMesh.position.set(b.sign.x, b.sign.y, b.sign.z); signMesh.rotation.y = Math.PI / 2;
  signMesh.matrixAutoUpdate = false; signMesh.updateMatrix();
  root.add(signMesh);

  // Windsock: the sock swings about the pole top.
  const sockPivot = new THREE.Group();
  sockPivot.position.set(sock.x, sock.y, sock.z);
  sockPivot.add(mesh(sock.geometry, material({ roughness: 0.9, side: THREE.DoubleSide }), { isStatic: false }));
  root.add(sockPivot);

  // Tower beacon and radar.
  const beacon = new THREE.Group();
  beacon.position.set(top.x, top.y, top.z);
  beacon.add(mesh(top.geometry, material({ roughness: 0.6 }), { isStatic: false, shadow: true }), top.points);
  top.points.userData.level(1);
  root.add(beacon);
  const beaconColors = top.points.geometry.attributes.color, beaconBase = Float32Array.from(beaconColors.array);

  // The planes, in world space.
  const shared = sharedGeometry();
  const airline = A.config.airline || '小鎮航空';
  const planes = A.planes.map(p => createPlane({ id: p.id, name: p.name, airline }, shared));
  planes.forEach(p => group.add(p.group));

  // Night lights (world space).
  const lights = [];
  const w = (lx, lz) => F.toWorld(lx, lz);
  const T = A.local.terminal;
  for (const [lx, lz] of masts) { const p = w(lx, lz); lights.push(lightSource(p.x, 15, p.z, 26, '#ffeccc', 0.8, 'lamps', 'airport-flood')); }
  for (const lz of [-18, 18]) { const p = w(T.x1 + 2, lz); lights.push(lightSource(p.x, 6, p.z, 20, '#ffe2b0', 0.7, 'facade', 'airport-terminal')); }
  { const p = w(A.local.tower.x, A.local.tower.z); lights.push(lightSource(p.x, 31, p.z, 16, '#cfe8ff', 0.5, 'sign', 'airport-tower')); }
  for (const lz of [-40, 0, 40]) { const p = w(A.local.runway.x, lz); lights.push(lightSource(p.x, 1, p.z, 12, '#fff1c8', 0.3, 'lamps', 'airport-runway')); }
  { const p = w(A.local.hangar.x, A.local.hangar.z0 + 8); lights.push(lightSource(p.x, 10, p.z, 18, '#ffe9b8', 0.5, 'lamps', 'airport-hangar')); }

  const state = { poses: [] };
  const camVec = new THREE.Vector3();
  function update(frame) {
    const night = frame.lamps;
    const lit = (frame.lighting && frame.lighting.buildings && frame.lighting.buildings[id]) || { windows: 1 - frame.daylight, sign: night };
    setLevel(litMat, night, 0.3);
    glowPoints.userData.level(night);
    glowPoints.material.uniforms.scale.value = pointScale(frame, 1);
    glassMaterial.emissiveIntensity = clamp01(lit.windows) * (0.25 + 0.75 * night) * 1.1;
    signMaterial.emissiveIntensity = 0.4 + 0.6 * clamp01(lit.sign);

    const wind = 1.2 + 0.5 * Math.sin(frame.time * 0.11) + 0.12 * Math.sin(frame.time * 0.7);
    sockPivot.rotation.set(0, wind, 0.18 + 0.1 * Math.sin(frame.time * 1.9));

    // Beacon: turns at 1.6 rev/min-ish; each lamp flashes when it points at the camera.
    beacon.rotation.y = frame.time * 2.2;
    top.points.userData.level(night > 0.02 ? 1 : 0);
    if (frame.camera && night > 0.02) {
      const cam = frame.camera.position;
      camVec.set(cam.x - (F.ox + top.x), 0, cam.z - (F.oz + top.z)).normalize();
      const a = beacon.rotation.y;
      const facing = Math.sin(a) * camVec.x + Math.cos(a) * camVec.z;
      const flash = k => 0.15 + 0.85 * Math.max(0, k) ** 6;
      const v0 = flash(facing), v1 = flash(-facing);
      for (let c = 0; c < 3; c++) { beaconColors.array[c] = beaconBase[c] * v0; beaconColors.array[3 + c] = beaconBase[3 + c] * v1; }
      beaconColors.needsUpdate = true;
    }
    top.points.material.uniforms.scale.value = pointScale(frame, 1);

    state.poses = planesAt(world, frame.daySeconds);
    planes.forEach((p, i) => {
      const pose = state.poses[i];
      if (!pose) { p.group.visible = false; return; }
      p.update(pose, frame, i * 0.37);
    });
  }
  return { group, update, dispose() { base.dispose(); planes.forEach(p => p.dispose()); }, lights, info: () => ({ planes: state.poses.map(p => `${p.id}:${p.phase}:${p.fade.toFixed(2)}`) }) };
}

export function preview(ctx) {
  return create({ world: ctx.world, quality: ctx.quality });
}
