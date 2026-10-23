// 星光樂園: a Ferris wheel (cabins stay upright), a carousel with bobbing horses, a
// chair-swing ride, a small roller coaster with a train, balloon carts and an entrance
// arch with the park's name. Everything moving is a transform (instances or groups).

import * as THREE from 'three';
import { ShapeBuilder, material, signTexture } from '../kit.js';
import { Glows, beam, mesh, litMaterial, setLevel, pointScale, moduleBase, lightSource, noise } from './common.js';
import { tree, shrub, lampPost, groundDisc, groundRing } from './props.js';

const POP = ['#e8574a', '#f0c03a', '#3f8f88', '#e8749a', '#3e6fa8', '#ee8a2e', '#8a5fb0', '#5a9a4a'];
const WHEEL = { r: 15, hubY: 17.5, gap: 4.4, cabins: 16, period: 150 };
const CAROUSEL = { r: 8.4, period: 22, horses: 16 };
const SWING = { height: 15, r: 6.6, chain: 6, period: 9, chairs: 12 };
const COASTER = { period: 42, cars: 3 };

// ---------------------------------------------------------------- Ferris wheel
function wheelStatic(sb, hx, hz) {
  const y0 = 0.2, legs = '#2f8f88';
  for (const s of [-1, 1]) {
    const z = hz + s * (WHEEL.gap / 2 + 0.9);
    for (const dx of [-1, 1]) beam(sb, [hx + dx * 9.5, y0, z + s * 1.0], [hx, WHEEL.hubY, z], 0.55, legs, 6);
    sb.block(hx, y0, z + s * 1.0, 20.5, 0.5, 1.4, '#8c949b');
    beam(sb, [hx - 5.2, 5.5, z + s * 0.5], [hx + 5.2, 5.5, z + s * 0.5], 0.3, legs, 5);
    sb.cylinder(hx, WHEEL.hubY, z, 1.2, 1.2, 0.7, '#e8574a', 10, [Math.PI / 2, 0, 0]);
  }
  sb.block(hx, y0, hz, 22, 0.35, WHEEL.gap + 5.2, '#c9c2b5');
  // Boarding platform and stairs on the north side.
  sb.block(hx, y0, hz - WHEEL.gap / 2 - 3.8, 7, 0.9, 3, '#e9e2d4');
}

function wheelBody(sb, lit) {
  const R = WHEEL.r, half = WHEEL.gap / 2;
  for (const z of [-half, half]) {
    sb.add(new THREE.TorusGeometry(R, 0.4, 6, 48), sb.transform(0, 0, z), '#f6f1e6');
    sb.add(new THREE.TorusGeometry(R * 0.55, 0.22, 5, 32), sb.transform(0, 0, z), '#d7dde0');
    sb.cylinder(0, 0, z, 1.5, 1.5, 0.6, '#e8574a', 12, [Math.PI / 2, 0, 0]);
  }
  sb.cylinder(0, 0, 0, 0.7, 0.7, WHEEL.gap + 2, '#8c949b', 8, [Math.PI / 2, 0, 0]);
  const n = WHEEL.cabins * 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, x = Math.cos(a) * R, y = Math.sin(a) * R;
    for (const z of [-half, half]) beam(sb, [0, 0, z], [x, y, z], 0.16, '#e6e2d6', 4);
    beam(sb, [x, y, -half], [x, y, half], 0.12, '#e6e2d6', 4);
    const col = POP[i % POP.length];
    for (const z of [-half, half]) lit.sphere(x, y, z, 0.42, col, 6, 4);
  }
  for (const z of [-half, half]) for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    lit.sphere(Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55, z, 0.3, POP[i % POP.length], 5, 4);
  }
}

function cabinGeometry() {
  const sb = new ShapeBuilder();
  const w = 3.6, d = 3.4;
  beam(sb, [0, 0, 0], [0, -0.7, 0], 0.12, '#8c949b', 4);
  sb.block(0, -4.0, 0, w, 0.3, d, '#e9e2d4');
  sb.block(0, -3.7, -d / 2 + 0.1, w, 1.0, 0.2, '#ffffff'); sb.block(0, -3.7, d / 2 - 0.1, w, 1.0, 0.2, '#ffffff');
  sb.block(-w / 2 + 0.1, -3.7, 0, 0.2, 1.0, d, '#ffffff'); sb.block(w / 2 - 0.1, -3.7, 0, 0.2, 1.0, d, '#ffffff');
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) sb.block(x * (w / 2 - 0.1), -2.7, z * (d / 2 - 0.1), 0.18, 1.8, 0.18, '#ffffff');
  sb.cylinder(0, -0.75, 0, 0.3, 2.2, 0.9, '#ffffff', 4, [0, Math.PI / 4, 0]);
  sb.cone(0, -0.85, 0, 2.5, 1.0, '#ffffff', 4, [0, Math.PI / 4, 0]);
  const lit = new ShapeBuilder();
  lit.block(0, -3.1, 0, w - 0.5, 0.15, d - 0.5, '#fff0c0');
  return { body: sb.build(), lit: lit.build() };
}

// ---------------------------------------------------------------- carousel
function carouselStatic(sb, px, pz) {
  sb.cylinder(px, 0.7, pz, CAROUSEL.r + 0.6, CAROUSEL.r + 1.0, 1.0, '#e9e2d4', 16);
  sb.cylinder(px, 1.25, pz, CAROUSEL.r + 0.2, CAROUSEL.r + 0.2, 0.2, '#3f8f88', 16);
}

function carouselTop(sb, lit, glows) {
  const R = CAROUSEL.r, y = 1.4;
  sb.cylinder(0, y + 0.1, 0, R, R, 0.2, '#d9b36a', 16);
  sb.cylinder(0, y + 4.8, 0, 1.4, 1.6, 9.6, '#e8574a', 10);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    for (const r of [R - 1.1]) beam(sb, [Math.cos(a) * r, y, Math.sin(a) * r], [Math.cos(a) * r, y + 9.4, Math.sin(a) * r], 0.2, '#f0c03a', 6);
    for (const r of [4.0]) beam(sb, [Math.cos(a + 0.39) * r, y, Math.sin(a + 0.39) * r], [Math.cos(a + 0.39) * r, y + 9.4, Math.sin(a + 0.39) * r], 0.16, '#f6efe0', 6);
  }
  // Skirt: alternating panels, then the cone roof and a flag.
  const sk = 16;
  for (let i = 0; i < sk; i++) {
    const a = ((i + 0.5) / sk) * Math.PI * 2, r = R + 0.3;
    sb.add(new THREE.BoxGeometry(0.3, 1.6, 2 * Math.PI * r / sk * 0.98), sb.transform(Math.cos(a) * r, y + 9.4, Math.sin(a) * r, [0, -a, 0]), i % 2 ? '#f6efe0' : '#e8574a');
    lit.sphere(Math.cos(a) * (r + 0.1), y + 8.45, Math.sin(a) * (r + 0.1), 0.28, '#fff3c8', 5, 4);
    glows.add(Math.cos(a) * (r + 0.1), y + 8.45, Math.sin(a) * (r + 0.1), '#ffd89a', 2.2);
  }
  sb.cone(0, y + 9.9 + 1.7, 0, R + 0.9, 3.4, '#3f8f88', 16);
  sb.cone(0, y + 9.9 + 3.9, 0, 3.4, 2.6, '#f0c03a', 16);
  sb.sphere(0, y + 14.4, 0, 0.6, '#f0c03a', 8, 6);
  sb.block(0.3, y + 14.5, 0, 2.2, 1.2, 0.08, '#e8574a');
  lit.sphere(0, y + 9.4, 0, 0.9, '#fff3c8', 8, 6);
}

function horseGeometry() {
  const sb = new ShapeBuilder();
  const body = '#ffffff', dark = '#5a4636', gold = '#f0c03a';
  sb.add(new THREE.BoxGeometry(2.3, 1.0, 0.8), sb.transform(0, 0, 0), body);
  sb.add(new THREE.BoxGeometry(0.9, 1.5, 0.6), sb.transform(1.2, 0.8, 0, [0, 0, -0.35]), body);
  sb.add(new THREE.BoxGeometry(1.0, 0.55, 0.5), sb.transform(1.85, 1.45, 0, [0, 0, 0.1]), body);
  sb.add(new THREE.BoxGeometry(0.4, 0.3, 0.2), sb.transform(1.65, 1.95, 0.15, [0, 0, 0.1]), dark);
  sb.add(new THREE.BoxGeometry(0.4, 0.3, 0.2), sb.transform(1.65, 1.95, -0.15, [0, 0, 0.1]), dark);
  sb.add(new THREE.BoxGeometry(0.5, 1.4, 0.2), sb.transform(0.9, 1.1, 0, [0, 0, -0.35]), dark);
  sb.add(new THREE.BoxGeometry(0.2, 1.3, 0.5), sb.transform(-1.3, -0.1, 0, [0, 0, 0.35]), dark);
  for (const [x, z, r] of [[0.8, 0.3, -0.5], [0.8, -0.3, -0.5], [-0.8, 0.3, 0.5], [-0.8, -0.3, 0.5]]) sb.add(new THREE.BoxGeometry(0.3, 1.2, 0.3), sb.transform(x, -0.9, z, [0, 0, r]), body);
  sb.add(new THREE.BoxGeometry(0.9, 0.18, 0.9), sb.transform(0, 0.55, 0), '#c9483b');
  sb.add(new THREE.BoxGeometry(0.2, 0.3, 0.9), sb.transform(1.1, 0.45, 0), gold);
  return sb.build();
}

// ---------------------------------------------------------------- swing ride
function swingStatic(sb, sx, sz) {
  sb.cylinder(sx, 0.55, sz, 3.4, 3.8, 0.7, '#e9e2d4', 14);
  sb.cylinder(sx, SWING.height / 2, sz, 0.7, 1.0, SWING.height, '#3e6fa8', 10);
  sb.cylinder(sx, SWING.height + 0.2, sz, 1.1, 1.1, 0.5, '#f0c03a', 10);
}

function swingTop(sb, lit, glows) {
  const R = 7.0;
  sb.cone(0, 1.2, 0, R + 0.4, 2.4, '#e8574a', 12);
  sb.cylinder(0, 0.1, 0, R, R, 0.3, '#f6efe0', 12);
  sb.cylinder(0, 2.6, 0, 0.4, 0.4, 0.8, '#f0c03a', 8);
  for (let i = 0; i < SWING.chairs; i++) {
    const a = (i / SWING.chairs) * Math.PI * 2, phi = 0.62;
    const ax = Math.cos(a) * (SWING.r), az = Math.sin(a) * SWING.r;
    const ex = Math.cos(a) * (SWING.r + SWING.chain * Math.sin(phi)), ez = Math.sin(a) * (SWING.r + SWING.chain * Math.sin(phi));
    const ey = -SWING.chain * Math.cos(phi) - 0.1;
    for (const s of [-0.5, 0.5]) beam(sb, [ax - Math.sin(a) * s, 0, az + Math.cos(a) * s], [ex - Math.sin(a) * s, ey + 0.3, ez + Math.cos(a) * s], 0.07, '#d7dde0', 3);
    const col = POP[i % POP.length];
    sb.add(new THREE.BoxGeometry(0.9, 0.2, 1.4), sb.transform(ex, ey, ez, [0, -a, 0]), col);
    sb.add(new THREE.BoxGeometry(0.15, 0.9, 1.4), sb.transform(ex - Math.cos(a) * 0.4, ey + 0.5, ez - Math.sin(a) * 0.4, [0, -a, 0]), col);
    lit.sphere(Math.cos(a) * (R + 0.35), 0.35, Math.sin(a) * (R + 0.35), 0.3, '#fff3c8', 5, 4);
    glows.add(Math.cos(a) * (R + 0.35), 0.35, Math.sin(a) * (R + 0.35), POP[i % POP.length], 2.4);
  }
}

// ---------------------------------------------------------------- roller coaster
function coasterCurve(cx, cz) {
  const pts = [];
  const N = 14;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    // A rounded loop, longer along z, with two hills and a dip.
    const x = cx + Math.cos(t) * 9.5 * (1 + 0.12 * Math.cos(2 * t)), z = cz + Math.sin(t) * 11;
    const y = 5.2 + 4.2 * Math.sin(2 * t + 0.6) + 1.6 * Math.cos(3 * t);
    pts.push(new THREE.Vector3(x, y, z));
  }
  return new THREE.CatmullRomCurve3(pts, true, 'centripetal');
}

function coasterStatic(sb, curve) {
  const n = 120, rail = 0.55, up = new THREE.Vector3(0, 1, 0);
  const prev = [null, null];
  let tie = 0;
  for (let i = 0; i <= n; i++) {
    const t = (i % n) / n, p = curve.getPointAt(t), tan = curve.getTangentAt(t);
    const side = new THREE.Vector3().crossVectors(tan, up).normalize();
    const pts = [-1, 1].map(s => p.clone().addScaledVector(side, s * rail));
    if (prev[0]) for (let k = 0; k < 2; k++) beam(sb, prev[k].toArray(), pts[k].toArray(), 0.12, '#e8574a', 4);
    prev[0] = pts[0]; prev[1] = pts[1];
    if (i < n && i % 2 === 0) sb.add(new THREE.BoxGeometry(0.16, 0.12, rail * 2 + 0.3), new THREE.Matrix4().compose(p.clone().add(new THREE.Vector3(0, -0.14, 0)), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(tan.x, 0, tan.z).normalize()), new THREE.Vector3(1, 1, 1)), '#5c4a3a');
    // Central spine and supports every few steps.
    if (i < n && i % 3 === 0) {
      beam(sb, p.clone().add(new THREE.Vector3(0, -0.2, 0)).toArray(), [p.x, p.y - 0.6, p.z], 0.12, '#59606a', 4);
      if (p.y > 1.2) sb.cylinder(p.x, (p.y - 0.4 + 0.2) / 2, p.z, 0.2, 0.26, p.y - 0.6, '#8c949b', 6);
      tie++;
    }
  }
  void tie;
  const p0 = curve.getPointAt(0);
  sb.block(p0.x + 3, 0.2, p0.z, 5, 0.6, 3, '#e9e2d4');
}

function trainGeometry() {
  const sb = new ShapeBuilder();
  sb.add(new THREE.BoxGeometry(3.0, 0.6, 2.0), sb.transform(0, 0.55, 0), '#f0c03a');
  sb.add(new THREE.BoxGeometry(2.8, 0.9, 2.2), sb.transform(0, 1.2, 0), '#3e6fa8');
  sb.add(new THREE.BoxGeometry(0.2, 0.9, 2.2), sb.transform(0.8, 1.8, 0), '#e8574a');
  sb.add(new THREE.BoxGeometry(0.2, 0.9, 2.2), sb.transform(-0.9, 1.8, 0), '#e8574a');
  sb.add(new THREE.BoxGeometry(0.15, 0.2, 2.5), sb.transform(0, 2.3, 0), '#d7dde0');
  return sb.build();
}

// ---------------------------------------------------------------- arch, carts, ground
function arch(sb, lit, glows, x, z, facing, width = 15) {
  // Two towers with star tops and a crescent of lights between; the sign hangs on the beam.
  const half = width / 2;
  for (const s of [-1, 1]) {
    sb.block(x + s * half, 0.2, z, 2.6, 11, 2.6, '#f6efe0');
    sb.block(x + s * half, 4.2, z, 2.9, 1.0, 2.9, '#e8574a');
    sb.block(x + s * half, 8.4, z, 2.9, 1.0, 2.9, '#3f8f88');
    sb.cone(x + s * half, 12.8, z, 1.8, 3.4, '#f0c03a', 4, [0, Math.PI / 4, 0]);
    lit.sphere(x + s * half, 15, z, 0.5, '#fff3c8', 6, 5); glows.add(x + s * half, 15, z, '#ffe6a0', 4);
  }
  sb.block(x, 9.6, z, width, 1.3, 1.8, '#e8574a');
  sb.block(x, 10.9, z, width + 1, 0.4, 2.2, '#f0c03a');
  // Bulbs along the beam.
  for (let i = 0; i <= 14; i++) {
    const bx = x - half + (i / 14) * width;
    lit.sphere(bx, 9.1, z + facing * 1.0, 0.24, POP[i % POP.length], 5, 4);
    glows.add(bx, 9.1, z + facing * 1.0, POP[i % POP.length], 1.8);
  }
}

function balloonCart(sb, x, z, heading, seed) {
  const m = (lx, ly, lz, w, h, d, c) => {
    const cs = Math.cos(heading), sn = Math.sin(heading);
    sb.add(new THREE.BoxGeometry(w, h, d), sb.transform(x + lx * cs - lz * sn, 0.2 + ly, z + lx * sn + lz * cs, [0, -heading, 0]), c);
  };
  m(0, 1.1, 0, 3.0, 1.6, 2.0, '#f6efe0');
  m(0, 1.95, 0, 3.2, 0.2, 2.2, '#3f8f88');
  for (const sz of [-1, 1]) { sb.cylinder(x + (-Math.sin(heading)) * sz * 0.8 * 1, 0.5, z + Math.cos(heading) * sz * 0.8, 0.45, 0.45, 0.2, '#3b4045', 8, [Math.PI / 2, 0, 0]); }
  sb.block(x, 0.2, z, 0.1, 0.1, 0.1, '#3b4045');
  // Pole with a bunch of balloons.
  const px = x - Math.cos(heading) * 0.8, pz = z - Math.sin(heading) * 0.8;
  sb.cylinder(px, 3.4, pz, 0.08, 0.08, 6.4, '#8c949b', 4);
  for (let i = 0; i < 9; i++) {
    const a = noise(seed * 9 + i, 3) * Math.PI * 2, r = 0.6 + noise(seed * 9 + i, 4) * 1.6, h = 7.0 + noise(seed * 9 + i, 5) * 2.2;
    sb.sphere(px + Math.cos(a) * r, h, pz + Math.sin(a) * r, 0.82, POP[(i + seed) % POP.length], 8, 6, [1, 1.15, 1]);
    beam(sb, [px, 6.4, pz], [px + Math.cos(a) * r, h - 0.8, pz + Math.sin(a) * r], 0.025, '#d7dde0', 3);
  }
}

function paving(sb, a, cx, cz) {
  const y = 0.2;
  sb.block(cx, 0.05, cz, a.w, 0.15, a.d, '#e6dcc6');
  // Border and the main avenue with coloured tiles; a round plaza at the middle.
  sb.block(cx, y - 0.03, a.z0 + 0.9, a.w, 0.06, 1.8, '#d6c8a8'); sb.block(cx, y - 0.03, a.z1 - 0.9, a.w, 0.06, 1.8, '#d6c8a8');
  sb.block(a.x0 + 0.9, y - 0.03, cz, 1.8, 0.06, a.d, '#d6c8a8'); sb.block(a.x1 - 0.9, y - 0.03, cz, 1.8, 0.06, a.d, '#d6c8a8');
  sb.block(cx, y - 0.02, cz, 7, 0.06, a.d - 2, '#f3ead6'); sb.block(cx, y - 0.02, cz, a.w - 2, 0.06, 7, '#f3ead6');
  for (let i = 0; i < 10; i++) { const z = a.z0 + 4 + i * ((a.d - 8) / 9); sb.block(cx, y, z, 7, 0.05, 1.2, i % 2 ? '#f0c03a' : '#e8574a'); }
  groundDisc(sb, cx, cz, 8, y + 0.03, '#f3ead6');
  groundRing(sb, cx, cz, 5.2, 6.0, y + 0.06, '#3f8f88'); groundRing(sb, cx, cz, 7.0, 7.5, y + 0.06, '#e8574a');
  // Lawn corners.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    sb.block(cx + sx * (a.w / 4 + 2), y, cz + sz * (a.d / 4 + 2), a.w / 2 - 9, 0.06, a.d / 2 - 9, '#e6dcc6');
  }
}

export function create({ world, quality = 'full' } = {}) {
  const base = moduleBase('amusement');
  const { group } = base;
  const site = world.site('c-amusement') || world.siteList.find(s => s.kind === 'amusement');
  if (!site) return { group, update() {}, dispose: base.dispose, lights: [] };
  const a = site.area, cx = a.x, cz = a.z;
  const sb = new ShapeBuilder(), lit = new ShapeBuilder(), glows = new Glows();

  paving(sb, a, cx, cz);
  const wheelPos = { x: cx - 10.5, z: cz + 17 }, carPos = { x: cx - 15, z: cz - 12 }, swingPos = { x: cx + 16, z: cz - 12 };
  const curve = coasterCurve(cx + 14.5, cz + 17.5);
  wheelStatic(sb, wheelPos.x, wheelPos.z);
  carouselStatic(sb, carPos.x, carPos.z);
  swingStatic(sb, swingPos.x, swingPos.z);
  coasterStatic(sb, curve);

  arch(sb, lit, glows, cx, a.z0 + 3.2, 1);
  arch(sb, lit, glows, cx, a.z1 - 3.2, -1);
  // Small gate posts at the east and west doors.
  for (const dx of [a.x0 + 2, a.x1 - 2]) for (const s of [-1, 1]) {
    sb.block(dx, 0.2, cz + s * 4.2, 1.4, 6, 1.4, '#f6efe0'); sb.cone(dx, 8.7, cz + s * 4.2, 1.1, 2.2, '#f0c03a', 4, [0, Math.PI / 4, 0]);
    lit.sphere(dx, 10, cz + s * 4.2, 0.35, '#fff3c8', 6, 4); glows.add(dx, 10, cz + s * 4.2, '#ffe6a0', 3);
  }
  // Balloon carts along the avenue, flowers and trees in the corners, lamps.
  balloonCart(sb, cx + 6.5, cz - 21, 0, 1);
  balloonCart(sb, cx - 6.5, cz + 6.5, Math.PI, 2);
  balloonCart(sb, cx + 6.5, cz + 4, 0, 3);
  tree(sb, a.x1 - 6, a.z0 + 8, 0.95, 1, 0.2); tree(sb, a.x1 - 5, cz + 4, 0.9, 2, 0.2); tree(sb, a.x0 + 6, a.z0 + 6, 0.9, 3, 0.2); tree(sb, a.x1 - 6, a.z1 - 7, 0.9, 4, 0.2);
  for (let i = 0; i < 6; i++) { shrub(sb, a.x0 + 5 + i * 2.2, a.z1 - 5, 1.1, i); shrub(sb, a.x1 - 5 - i * 2.2, a.z0 + 6.5, 1.1, i + 9); }
  const lampPts = [[cx - 7, a.z0 + 9], [cx + 7, a.z0 + 9], [cx - 7, a.z1 - 9], [cx + 7, a.z1 - 9], [cx - 9, cz], [cx + 9, cz], [cx - 22, cz + 0.0], [cx + 23, cz + 4]];
  for (const [x, z] of lampPts) lampPost(sb, lit, glows, x, z, 8);

  group.add(mesh(sb.build(), material({ roughness: 0.8 }), { shadow: true }));
  const litMat = litMaterial();
  group.add(mesh(lit.build(), litMat));
  const glowPoints = glows.build({ opacity: 0.8 });
  group.add(glowPoints);

  // Ferris wheel: the body turns; cabins are instances kept upright.
  const wsb = new ShapeBuilder(), wlit = new ShapeBuilder();
  wheelBody(wsb, wlit);
  const wheel = new THREE.Group();
  wheel.position.set(wheelPos.x, WHEEL.hubY, wheelPos.z);
  wheel.add(mesh(wsb.build(), material({ roughness: 0.6 }), { shadow: true, isStatic: false }));
  const wheelLitMat = litMaterial();
  wheel.add(mesh(wlit.build(), wheelLitMat, { isStatic: false }));
  const wg = new Glows(), nGlow = WHEEL.cabins * 2;
  for (let i = 0; i < nGlow; i++) for (const z of [-WHEEL.gap / 2, WHEEL.gap / 2]) wg.add(Math.cos((i / nGlow) * Math.PI * 2) * WHEEL.r, Math.sin((i / nGlow) * Math.PI * 2) * WHEEL.r, z, '#ffffff', 4.2);
  const wheelGlow = wg.build({ opacity: 0.9 });
  wheel.add(wheelGlow);
  group.add(wheel);
  const wheelColors = wheelGlow.geometry.attributes.color;

  const cab = cabinGeometry();
  const cabins = new THREE.InstancedMesh(cab.body, material({ roughness: 0.6 }), WHEEL.cabins);
  const cabinLitMat = litMaterial();
  const cabinLit = new THREE.InstancedMesh(cab.lit, cabinLitMat, WHEEL.cabins);
  cabins.castShadow = true;
  const col = new THREE.Color();
  for (let i = 0; i < WHEEL.cabins; i++) cabins.setColorAt(i, col.set(i % 2 ? '#ffffff' : '#ffffff').lerp(new THREE.Color(POP[i % POP.length]), 0.8));
  cabins.frustumCulled = false; cabinLit.frustumCulled = false;
  group.add(cabins, cabinLit);

  // Carousel.
  const csb = new ShapeBuilder(), clit = new ShapeBuilder(), cg = new Glows();
  carouselTop(csb, clit, cg);
  const carTop = new THREE.Group();
  carTop.position.set(carPos.x, 0, carPos.z);
  carTop.add(mesh(csb.build(), material({ roughness: 0.6 }), { shadow: true, isStatic: false }));
  const carLitMat = litMaterial();
  carTop.add(mesh(clit.build(), carLitMat, { isStatic: false }));
  const carGlow = cg.build({ opacity: 0.8 });
  carTop.add(carGlow);
  group.add(carTop);
  const horses = new THREE.InstancedMesh(horseGeometry(), material({ roughness: 0.7 }), CAROUSEL.horses);
  horses.castShadow = true; horses.frustumCulled = false;
  const horseCols = ['#ffffff', '#f3d9b5', '#d9a273', '#f2b6c8', '#b9d7ea', '#ffffff', '#e8c06a', '#c7e3b5'];
  for (let i = 0; i < CAROUSEL.horses; i++) horses.setColorAt(i, col.set(horseCols[i % 8]));
  group.add(horses);

  // Swing ride.
  const ssb = new ShapeBuilder(), slit = new ShapeBuilder(), sg = new Glows();
  swingTop(ssb, slit, sg);
  const swingTopG = new THREE.Group();
  swingTopG.position.set(swingPos.x, SWING.height + 0.4, swingPos.z);
  swingTopG.add(mesh(ssb.build(), material({ roughness: 0.6 }), { shadow: true, isStatic: false }));
  const swingLitMat = litMaterial();
  swingTopG.add(mesh(slit.build(), swingLitMat, { isStatic: false }));
  const swingGlow = sg.build({ opacity: 0.8 });
  swingTopG.add(swingGlow);
  group.add(swingTopG);

  // Roller-coaster train.
  const train = new THREE.InstancedMesh(trainGeometry(), material({ roughness: 0.5 }), COASTER.cars);
  train.castShadow = true; train.frustumCulled = false;
  for (let i = 0; i < COASTER.cars; i++) train.setColorAt(i, col.set(i === 0 ? '#ffffff' : '#fff0f0'));
  group.add(train);

  // The names on the arches.
  const tex = signTexture('星光樂園', { background: '#243a6b', color: '#ffe08a', border: '#ffe08a', height: 100, padding: 60 });
  const signMat = new THREE.MeshBasicMaterial({ map: tex.texture, color: '#9a9a9a', side: THREE.DoubleSide });
  const sw = 12.4, sh = sw / tex.aspect;
  const plane = new THREE.PlaneGeometry(sw, sh);
  for (const [z, ry] of [[a.z0 + 3.2, 0], [a.z1 - 3.2, Math.PI]]) {
    const m = new THREE.Mesh(plane, signMat);
    m.position.set(cx, 9.6, z + (ry ? -1 : 1) * 0.95); m.rotation.y = ry;
    group.add(m);
    const back = new THREE.Mesh(plane, signMat);
    back.position.set(cx, 9.6, z - (ry ? -1 : 1) * 0.95); back.rotation.y = ry + Math.PI;
    group.add(back);
  }

  const lights = lampPts.map(([x, z]) => lightSource(x, 8, z, 12, '#fff0c8', 0.6, 'lamps', 'park-lamp'));
  lights.push(lightSource(wheelPos.x, 12, wheelPos.z, 26, '#ffd9f0', 0.8, 'facade', 'ferris'));
  lights.push(lightSource(carPos.x, 6, carPos.z, 15, '#ffe2a0', 0.8, 'facade', 'carousel'));
  lights.push(lightSource(swingPos.x, 8, swingPos.z, 14, '#bfe0ff', 0.7, 'facade', 'swing'));
  lights.push(lightSource(cx + 14.5, 6, cz + 17.5, 14, '#ffc9b0', 0.6, 'facade', 'coaster'));
  lights.push(lightSource(cx, 9, a.z0 + 5, 14, '#ffe6a0', 0.7, 'sign', 'arch'));
  lights.push(lightSource(cx, 9, a.z1 - 5, 14, '#ffe6a0', 0.7, 'sign', 'arch'));

  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1), E = new THREE.Euler(), T = new THREE.Vector3(), U = new THREE.Vector3(0, 1, 0);
  const tmpC = new THREE.Color();
  function update(frame) {
    const night = frame.lamps, t = frame.time;
    // Use the clock for the rides when time runs: they turn with `time`, which is real seconds.
    const level = Math.max(night, 0);
    for (const m of [litMat, wheelLitMat, cabinLitMat, carLitMat, swingLitMat]) setLevel(m, level, 0.45);
    glowPoints.userData.level(night);
    for (const g of [wheelGlow, carGlow, swingGlow]) { g.userData.level(night); g.material.uniforms.scale.value = pointScale(frame, 1); }
    glowPoints.material.uniforms.scale.value = pointScale(frame, 1);
    signMat.color.setScalar(0.62 + 0.38 * night);

    // Ferris wheel.
    const ang = (t / WHEEL.period) * Math.PI * 2;
    wheel.rotation.z = ang;
    for (let i = 0; i < WHEEL.cabins; i++) {
      const a2 = ang + (i / WHEEL.cabins) * Math.PI * 2;
      M.makeTranslation(wheelPos.x + Math.cos(a2) * WHEEL.r, WHEEL.hubY + Math.sin(a2) * WHEEL.r, wheelPos.z);
      cabins.setMatrixAt(i, M); cabinLit.setMatrixAt(i, M);
    }
    cabins.instanceMatrix.needsUpdate = true; cabinLit.instanceMatrix.needsUpdate = true;
    // Chasing colours on the rim lights.
    if (night > 0.05) {
      for (let i = 0; i < nGlow * 2; i++) {
        const k = Math.floor(i / 2), phase = (k - t * 5) % 6, c = ((phase % 6) + 6) % 6;
        tmpC.set(c < 2 ? '#ff5fae' : c < 4 ? '#3ee0d0' : '#ffd05a');
        wheelColors.setXYZ(i, tmpC.r, tmpC.g, tmpC.b);
      }
      wheelColors.needsUpdate = true;
    }

    // Carousel.
    const ca = (t / CAROUSEL.period) * Math.PI * 2;
    carTop.rotation.y = -ca;
    for (let i = 0; i < CAROUSEL.horses; i++) {
      const ring = i % 2, k = Math.floor(i / 2), r = ring ? 4.0 : CAROUSEL.r - 1.1;
      const th = (k / 8) * Math.PI * 2 + (ring ? 0.39 : 0) + ca;
      // The canopy's rotation.y = -ca carries a local angle phi to world angle phi + ca.
      const px = carPos.x + Math.cos(th) * r, pz = carPos.z + Math.sin(th) * r;
      const bob = 3.0 + Math.sin(t * 1.6 + i * 1.3 + ring * 1.7) * 0.6;
      Q.setFromAxisAngle(U, -(th + Math.PI / 2));
      M.compose(P.set(px, bob + 1.4, pz), Q, S);
      horses.setMatrixAt(i, M);
    }
    horses.instanceMatrix.needsUpdate = true;

    // Swing ride: spins, chairs flung out by the fixed lean.
    swingTopG.rotation.y = -(t / SWING.period) * Math.PI * 2;

    // Roller coaster: a train of three cars follows the track, nose first.
    const s0 = (t / COASTER.period) % 1;
    for (let i = 0; i < COASTER.cars; i++) {
      const u = (((s0 - i * 0.022) % 1) + 1) % 1;
      curve.getPointAt(u, T); const tan = curve.getTangentAt(u);
      const yaw = Math.atan2(-tan.z, tan.x), pitch = Math.asin(THREE.MathUtils.clamp(tan.y, -1, 1));
      E.set(0, yaw, pitch, 'YZX'); Q.setFromEuler(E);
      M.compose(P.set(T.x, T.y + 0.05, T.z), Q, S);
      train.setMatrixAt(i, M);
    }
    train.instanceMatrix.needsUpdate = true;
  }
  return { group, update, dispose() { tex.texture.dispose(); base.dispose(); }, lights };
}

export function preview(ctx) { return create({ world: ctx.world, quality: ctx.quality }); }
