// Street furniture models for the items planned by src/core/world/furniture.js:
// lamps (with LightSources), six tree species, benches, river benches, chess tables,
// bins, bollards, planters, bike racks, vending machines, post boxes, hydrants and the
// park pavilion. One merged geometry per model, one instanced mesh per model
// (about 22 draw calls), tens of thousands of instances are fine.
// Model space: forward +x = the item's heading, up +y, width along z, standing on y = 0.
// Footprints are [w across (z), d along the heading (x)].

import * as THREE from 'three';
import { PropBuilder, Atlas, fitText, propMaterial, instancedModel, at, disposeObject, scaleFigure } from './parts.js';
import { bicycle } from './vehicles.js';
import { planFurniture, SIZE } from '../../core/world/furniture.js';
import { hash } from '../../core/random.js';

const POLE = '#5f6b6d', POLE_DARK = '#454d52', STEEL = '#9aa2a8', WOOD = '#b3835a', WOOD_DARK = '#8f6644', STONE = '#d6cfc1', STONE_DARK = '#b3ab9c', CONCRETE = '#bdb7ad';
const LAMPLIGHT = '#ffe2b0';
const TRUNK = '#735843';

// ------------------------------------------------------------------ small helpers
// Detail level of the models being built (set by createFurniture): lite = phones.
let LITE = false;
const unitOf = (id, salt = '') => (hash(String(id) + salt) % 10000) / 10000;

// ------------------------------------------------------------------ lamps
function lampArm() {
  const b = new PropBuilder(), sg = LITE ? 5 : 6;
  b.cyl(0, 0.35, 0, 0.36, 0.5, 0.7, CONCRETE, { seg: sg });
  b.rod([0, 0.6, 0], [0, 8.7, 0], 0.17, POLE, { r2: 0.11, seg: sg });
  // the curved arm reaching toward +x
  b.rod([0, 8.3, 0], [0.5, 9.3, 0], 0.1, POLE, { seg: 4 }); b.rod([0.5, 9.3, 0], [1.9, 9.2, 0], 0.1, POLE, { seg: 4 });
  // luminaire hung from the end: housing and warm lens below (light at y = 8.6)
  b.box(1.9, 9.0, 0, 1.5, 0.3, 0.7, '#4f565c');
  b.box(1.9, 8.82, 0, 1.3, 0.08, 0.56, LAMPLIGHT, { glow: 1 });
  return b;
}
function lampPost() {
  const b = new PropBuilder(), sg = LITE ? 5 : 6;
  b.cyl(0, 0.25, 0, 0.36, 0.44, 0.5, CONCRETE, { seg: sg });
  b.rod([0, 0.5, 0], [0, 4.0, 0], 0.15, POLE_DARK, { r2: 0.09, seg: sg });
  b.ball(0, 4.6, 0, 0.62, '#fff2d2', { detail: 0, glow: 1 });
  b.cone(0, 5.35, 0, 0.55, 0.45, POLE_DARK, { seg: 5 });
  return b;
}

// ------------------------------------------------------------------ trees
// The crown: a big faceted blob and a few small ones; only the first is subdivided.
const crownTint = (b, parts) => parts.slice(0, LITE ? 3 : 5).forEach((p, i) => b.ball(p[0], p[1], p[2], p[3], p[4], { detail: i === 0 && !LITE ? 1 : 0, scale: [p[6] ?? 1, p[7] ?? 0.85, p[6] ?? 1], paint: true }));
function trunk(b, h, r0, r1) { b.rod([0, 0, 0], [0, h, 0], r0 * 1.2, TRUNK, { r2: r1, seg: 5 }); }
function camphor() {
  const b = new PropBuilder();
  trunk(b, 5.2, 0.55, 0.38);
  b.rod([0, 4.2, 0], [1.9, 6.6, 0.4], 0.26, TRUNK, { r2: 0.18, seg: 4 }); b.rod([0, 4.6, 0], [-1.7, 6.9, -0.6], 0.24, TRUNK, { r2: 0.16, seg: 4 });
  crownTint(b, [[0, 8.6, 0, 5.2, '#4e7f45', 1, 1, 0.82], [3.3, 7.4, 1.4, 3.4, '#5a8c4d', 1], [-3.0, 7.6, -1.6, 3.6, '#467840', 1], [0.6, 11.0, -0.4, 3.3, '#659651', 1],
    [-1.4, 6.6, 2.8, 2.9, '#3f6d3b', 1], [1.8, 6.4, -3.0, 2.8, '#52833f', 1]]);
  return b;
}
function banyan() {
  const b = new PropBuilder();
  trunk(b, 3.6, 0.95, 0.7);
  b.rod([0, 2.8, 0], [2.8, 5.4, 1.0], 0.45, TRUNK, { r2: 0.3, seg: 4 }); b.rod([0, 3.0, 0], [-2.6, 5.2, -1.4], 0.45, TRUNK, { r2: 0.3, seg: 4 });
  crownTint(b, [[0, 7.4, 0, 5.4, '#3f7040', 1, 1.15, 0.7], [4.2, 6.4, 1.8, 3.8, '#4b7c47', 1, 1.1, 0.75], [-4.2, 6.6, -1.4, 3.9, '#386a3d', 1, 1.1, 0.75],
    [1.0, 9.0, -1.2, 3.4, '#558549', 1, 1, 0.8], [-1.2, 6.2, 3.8, 3.0, '#33623a', 1, 1.1, 0.75], [2.4, 6.0, -3.9, 3.0, '#467a44', 1, 1.1, 0.75]]);
  // aerial roots hanging from the crown edge
  if (!LITE) for (const [x, z, h] of [[5.2, 1.6, 3.4], [-5.4, -1.0, 3.0], [1.6, 5.6, 2.6]]) b.rod([x, 5.6, z], [x * 0.98, 5.6 - h, z * 0.98], 0.1, '#8a6f55', { r2: 0.05, seg: 3 });
  return b;
}
function flame() {   // golden rain tree 台灣欒樹: yellow and orange crown with red pods
  const b = new PropBuilder();
  trunk(b, 4.6, 0.42, 0.3);
  b.rod([0, 3.8, 0], [2.0, 6.4, 0.6], 0.2, TRUNK, { r2: 0.14, seg: 4 }); b.rod([0, 4.0, 0], [-1.8, 6.2, -0.8], 0.2, TRUNK, { r2: 0.14, seg: 4 });
  crownTint(b, [[0, 8.0, 0, 4.4, '#e8b83a', 1, 1, 0.8], [2.9, 7.0, 1.2, 3.0, '#e39b30', 1], [-2.7, 7.2, -1.3, 3.1, '#efc94e', 1], [0.4, 10.0, 0, 2.8, '#d9822f', 1],
    [-1.2, 6.4, 2.5, 2.4, '#cf5f3a', 0], [1.6, 9.2, -2.2, 2.2, '#f0d25a', 0], [2.6, 8.6, 2.4, 1.9, '#d24b38', 0], [-2.6, 9.2, 1.2, 1.8, '#9fb04a', 0]]);
  return b;
}
function bauhinia() {
  const b = new PropBuilder();
  trunk(b, 3.6, 0.4, 0.28);
  b.rod([0, 3.0, 0], [2.6, 5.6, 0.4], 0.22, TRUNK, { r2: 0.14, seg: 4 }); b.rod([0, 3.2, 0], [-2.4, 5.4, -0.6], 0.22, TRUNK, { r2: 0.14, seg: 4 }); b.rod([0, 3.4, 0], [0.2, 5.8, 2.4], 0.2, TRUNK, { r2: 0.13, seg: 4 });
  crownTint(b, [[0, 7.2, 0, 4.3, '#d9759f', 1, 1.15, 0.62], [3.6, 6.6, 0.8, 2.9, '#c85a8c', 1, 1.1, 0.62], [-3.4, 6.5, -0.8, 3.0, '#e59abb', 1, 1.1, 0.62],
    [0.2, 6.2, 3.4, 2.6, '#cf6a97', 1, 1.1, 0.62], [-0.4, 8.6, -1.4, 2.6, '#ea9fc0', 1, 1, 0.7], [0.6, 6.0, -3.4, 2.6, '#7aa05a', 0, 1, 0.6]]);
  return b;
}
function willow() {
  const b = new PropBuilder();
  trunk(b, 4.2, 0.5, 0.34);
  b.rod([0, 3.4, 0], [1.4, 6.2, 0.4], 0.22, TRUNK, { r2: 0.14, seg: 4 }); b.rod([0, 3.6, 0], [-1.2, 6.0, -0.5], 0.2, TRUNK, { r2: 0.14, seg: 4 });
  crownTint(b, [[0, 7.4, 0, 3.8, '#8bb35a', 1, 1.15, 0.62], [2.8, 6.8, 1.0, 2.4, '#7fa850', 1], [-2.6, 6.9, -1.0, 2.5, '#97bd62', 1]]);
  const n = LITE ? 6 : 10;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, r = 3.0 + (i % 3) * 0.6, len = 5.0 + (i % 4) * 0.8;
    b.cone(Math.cos(a) * r, 6.2 - len / 2 + 0.6, Math.sin(a) * r, 0.32, len, i % 2 ? '#b0cf72' : '#9cc064', { seg: 3, rot: [Math.PI, 0, 0], paint: true });
  }
  return b;
}
function palm() {
  const b = new PropBuilder();
  const seg = [[0, 0, 0.7], [0.1, 3.5, 0.5], [0.4, 7.0, 0.42], [1.0, 10.2, 0.36]];
  for (let i = 0; i + 1 < seg.length; i++) b.rod([seg[i][0], seg[i][1], 0], [seg[i + 1][0], seg[i + 1][1], 0], seg[i][2], i % 2 ? '#8d7258' : '#7d6550', { r2: seg[i + 1][2], seg: 5 });
  const topX = 1.0, topY = 10.4, n = LITE ? 5 : 7;
  b.ball(topX, topY, 0, 0.55, '#a68a3a', { detail: 0 });
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + 0.2, droop = 0.55 + (i % 3) * 0.12;
    b.within(at(topX, topY, 0, [0, -a, 0]), () => b.box(2.4, -0.3, 0, 5.2, 0.12, 0.95, i % 2 ? '#4f8a3f' : '#5f9b48', { rot: [0, 0, -droop], paint: true }));
  }
  return b;
}
function treeGrate() {
  const b = new PropBuilder();
  b.block(0, 0, 0, 2.6, 0.12, 2.6, '#4a4e52'); b.block(0, 0.1, 0, 1.9, 0.06, 1.9, '#2f3236');
  return b;
}
function treePlanter() {
  const b = new PropBuilder();
  b.block(0, 0, 0, 3.0, 0.8, 3.0, STONE_DARK); b.block(0, 0.7, 0, 3.2, 0.14, 3.2, STONE); b.block(0, 0.76, 0, 2.5, 0.1, 2.5, '#5a4a3a');
  return b;
}

// ------------------------------------------------------------------ seating
function bench(widthZ = 4.6, depthX = 1.1, back = true) {
  const b = new PropBuilder(), W = widthZ, D = depthX;
  for (const s of [1, -1]) {                                     // cast-iron ends
    b.block(0, 0, s * (W / 2 - 0.35), D * 0.85, 0.15, 0.3, POLE_DARK);
    b.block(0, 0, s * (W / 2 - 0.35), 0.3, 1.25, 0.3, POLE_DARK);
    if (back) b.rod([-D / 2 + 0.15, 1.3, s * (W / 2 - 0.35)], [-D / 2 - 0.45, 2.75, s * (W / 2 - 0.35)], 0.13, POLE_DARK);
  }
  for (let i = 0; i < 4; i++) b.block(0.2 - i * 0.3, 1.2, 0, 0.26, 0.2, W - 0.1, i % 2 ? WOOD : '#bb8c62');          // seat slats, top at 1.4
  if (back) for (let i = 0; i < 3; i++) b.block(-D / 2 - 0.1 - i * 0.14, 1.9 + i * 0.4, 0, 0.12, 0.3, W - 0.1, i % 2 ? WOOD : '#bb8c62', { rot: [0, 0, 0.2] });
  b.block(0, 0.6, 0, 0.3, 0.14, W - 0.7, POLE_DARK);
  return b;
}
function riverBench() {
  const b = new PropBuilder(), W = 2.8, D = 1.0;
  b.block(0, 0, 0, D, 0.85, W - 0.2, STONE_DARK);
  for (const s of [1, -1]) b.block(0, 0, s * (W / 2 - 0.2), D, 1.2, 0.4, STONE);
  b.block(0, 1.2, 0, D + 0.1, 0.2, W, '#c2956b');                                 // wooden top at 1.4
  b.block(-0.05, 1.18, 0, 0.04, 0.24, W + 0.01, WOOD_DARK);
  return b;
}
function chessTable() {
  const b = new PropBuilder();
  b.cyl(0, 0.2, 0, 0.8, 0.9, 0.4, STONE_DARK, { seg: 10 });
  b.cyl(0, 0.9, 0, 0.35, 0.45, 1.1, STONE, { seg: 10 });
  b.cyl(0, 1.55, 0, 1.15, 1.15, 0.22, STONE, { seg: 14 });
  b.cyl(0, 1.7, 0, 0.82, 0.82, 0.05, '#e4d3a8', { seg: 4, rot: [0, Math.PI / 4, 0] });
  // the board: eight by eight squares on a square patch
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    b.block(-0.5 + i * 0.28 * 1 + 0.07, 1.7, -0.5 + j * 0.28 + 0.07, 0.14, 0.015, 0.14, '#3b3a36');
  }
  const a = 1.35 / Math.SQRT2;
  for (const s of [1, -1]) { b.cyl(s * a, 0.55, s * a, 0.34, 0.4, 1.1, STONE_DARK, { seg: 8 }); b.cyl(s * a, 1.05, s * a, 0.47, 0.47, 0.2, STONE, { seg: 10 }); }   // stool tops at 1.15
  return b;
}

// ------------------------------------------------------------------ small street objects
function bin() {
  const b = new PropBuilder();
  b.cyl(0, 1.0, 0, 0.42, 0.38, 2.0, '#6f7a7e', { seg: 8 });
  b.cyl(0, 2.05, 0, 0.46, 0.46, 0.16, '#3f8f88', { seg: 8 });
  b.box(0.3, 1.5, 0, 0.06, 0.5, 0.4, '#23282c');
  b.cyl(0, 0.08, 0, 0.45, 0.45, 0.16, POLE_DARK, { seg: 8 });
  b.box(0.34, 1.0, 0, 0.04, 0.18, 0.26, '#e8e2d0');
  return b;
}
function bollard() {
  const b = new PropBuilder();
  b.cyl(0, 0.9, 0, 0.17, 0.19, 1.8, '#8c949b', { seg: 8 });
  b.ball(0, 1.8, 0, 0.19, '#8c949b', { detail: 0 });
  b.cyl(0, 1.4, 0, 0.2, 0.2, 0.22, '#e8b531', { seg: 8 });
  b.cyl(0, 1.0, 0, 0.195, 0.195, 0.1, '#e8e2d0', { seg: 8 });
  return b;
}
function planter() {                 // footprint: 2.6 along x, 1.4 across z
  const b = new PropBuilder();
  b.block(0, 0, 0, 2.6, 1.15, 1.4, '#b8664a'); b.block(0, 1.05, 0, 2.75, 0.14, 1.55, '#c97a5c'); b.block(0, 1.15, 0, 2.3, 0.1, 1.1, '#5a4a3a');
  const leaf = ['#5f9b48', '#4f8a3f', '#6aa650'], flower = ['#e8728a', '#f0c03a', '#f4f0e6', '#d9528a'];
  for (let i = 0; i < 5; i++) {
    const x = -0.95 + i * 0.475, z = (i % 2 ? 0.25 : -0.25);
    b.ball(x, 1.7, z, 0.5, leaf[i % 3], { detail: 1, scale: [1, 0.85, 1] });
    b.ball(x + 0.15, 2.05, z + 0.1, 0.18, flower[i % 4], { detail: 0 }); b.ball(x - 0.2, 1.95, z - 0.15, 0.16, flower[(i + 2) % 4], { detail: 0 });
  }
  return b;
}
// A public bike-share station (footprint 4.2 across z, 1.8 along x): a row of docks with
// identical orange bikes parked in them (some docks empty, by variant), a kiosk pillar at one end.
const RACK_BIKE = '#f2a31f';
function bikeRack(rects, variant = 0) {
  const b = new PropBuilder(), n = LITE ? 4 : 5, gap = 0.8, z0 = -1.75 + 0.4;
  const empty = [[], [2], [1, 3]][variant % 3].filter(i => i < n);
  b.block(0, 0, 0, 1.8, 0.06, 4.2, '#a9aeb0');
  for (let i = 0; i < n; i++) {
    const z = z0 + i * gap;
    b.block(1.3, 0.06, z, 0.22, 1.0, 0.3, '#8f979c');
    if (!LITE) b.box(1.42, 0.85, z, 0.04, 0.12, 0.18, empty.includes(i) ? '#3f8f88' : '#e8b531', { glow: 0.5 });
    if (!empty.includes(i)) b.within(at(0, 0.06, z), () => bicycle(b, RACK_BIKE, true, { basket: '#f4f1e8' }));
  }
  // kiosk pillar at the +z end: a screen and a sign "小鎮單車"
  const kz = 1.85;
  b.block(0, 0.06, kz, 0.6, 3.4, 0.7, '#e8e4da');
  b.block(0, 3.46, kz, 0.7, 0.14, 0.8, '#3f8f88');
  b.quad(0.31, 2.55, kz, 0.54, 0.46, '+x', '#ffffff', { tex: rects.kioskScreen, glow: 0.5 });
  b.quad(-0.31, 2.55, kz, 0.54, 0.46, '-x', '#ffffff', { tex: rects.kioskScreen, glow: 0.5 });
  b.box(0, 3.1, kz, 0.06, 0.5, 0.78, '#3f8f88');
  b.quad(0.04, 3.1, kz, 0.78, 0.5, '+x', '#ffffff', { tex: rects.kioskSign, glow: 0.35 });
  b.quad(-0.04, 3.1, kz, 0.78, 0.5, '-x', '#ffffff', { tex: rects.kioskSign, glow: 0.35 });
  if (!LITE) b.box(0.32, 1.7, kz, 0.04, 0.3, 0.4, '#3a4046');
  return b;
}
function vending(rects) {
  const b = new PropBuilder();
  b.block(0, 0, 0, 0.9, 4.3, 1.2, '#c9483b');
  b.block(0.46, 0.2, 0, 0.06, 0.25, 1.2, '#23282c');
  b.quad(0.46, 3.85, 0, 1.1, 0.5, '+x', '#ffffff', { tex: rects.vendLogo, glow: -0.35 });
  b.quad(0.465, 2.55, -0.08, 0.92, 2.2, '+x', '#ffffff', { tex: rects.vendDrinks, glow: -0.55 });
  b.box(0.46, 1.1, 0.4, 0.08, 0.5, 0.26, '#e8e2d0'); b.box(0.46, 1.7, 0.4, 0.08, 0.5, 0.24, '#23282c'); b.box(0.47, 1.5, 0.4, 0.04, 0.06, 0.14, '#e8b531', { glow: -0.8 });
  b.box(0.46, 0.65, -0.1, 0.05, 0.6, 0.9, '#2a2e32');
  b.block(0, 4.3, 0, 1.0, 0.12, 1.3, '#a83a30');
  return b;
}
function mailbox(rects) {            // two post boxes side by side: red and green, 1.4 across
  const b = new PropBuilder();
  b.block(0, 0, 0, 1.0, 0.3, 1.4, CONCRETE);
  [[-0.35, '#cf3e34', rects.mailRed], [0.35, '#2f8f5a', rects.mailGreen]].forEach(([z, c, rect]) => {
    b.block(0, 0.3, z, 0.85, 2.3, 0.56, c);
    b.cyl(0, 2.6, z, 0.28, 0.28, 0.85, c, { axis: 'x', seg: 12 });
    b.quad(0.43, 1.9, z, 0.48, 0.48, '+x', '#ffffff', { tex: rect });
    b.box(0.43, 1.3, z, 0.05, 0.1, 0.4, '#1d2023');
    b.box(0.43, 0.9, z, 0.05, 0.5, 0.4, '#e8e2d0');
  });
  return b;
}
function hydrant() {
  const b = new PropBuilder();
  b.cyl(0, 0.75, 0, 0.22, 0.27, 1.5, '#cf3e34', { seg: 6 });
  b.cyl(0, 1.45, 0, 0.3, 0.3, 0.14, '#a8302a', { seg: 6 });
  b.cone(0, 1.8, 0, 0.26, 0.4, '#cf3e34', { seg: 6 });
  b.box(0, 0.95, 0, 0.9, 0.2, 0.2, '#e8b531');
  return b;
}
function pavilion() {                // 7.2 square: floor, four posts, a hipped roof, four corner seats
  const b = new PropBuilder(), R = '#a8453a';
  b.block(0, 0, 0, 6.8, 0.3, 6.8, STONE); b.block(0, 0.3, 0, 6.2, 0.06, 6.2, STONE_DARK);
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    b.cyl(sx * 2.95, 2.7, sz * 2.95, 0.22, 0.26, 4.8, R, { seg: 8 });
    b.cyl(sx * 2.95, 0.4, sz * 2.95, 0.36, 0.4, 0.2, STONE_DARK, { seg: 8 });
    // seat in the corner, facing the middle
    b.within(at(sx * 1.66, 0, sz * 1.66, [0, Math.atan2(-sx, -sz) - Math.PI / 2 + Math.PI, 0]), () => {
      b.block(0, 0, 0, 0.9, 1.1, 1.5, STONE_DARK); b.block(0, 1.1, 0, 1.0, 0.3, 1.6, '#c2956b');
    });
  }
  b.block(0, 5.0, 0, 6.6, 0.3, 0.3, R); b.block(0, 5.0, 3.15, 0.3, 0.3, 6.6, R); b.block(0, 5.0, -3.15, 0.3, 0.3, 6.6, R);
  for (const s of [1, -1]) { b.block(s * 3.15, 5.0, 0, 0.3, 0.3, 6.6, R); b.block(0, 5.0, s * 3.15, 6.6, 0.3, 0.3, R); }
  b.add(new THREE.ConeGeometry(5.9, 2.4, 4, 1), at(0, 6.45, 0, [0, Math.PI / 4, 0]), '#59606a');
  b.add(new THREE.ConeGeometry(5.95, 0.5, 4, 1, true), at(0, 5.3, 0, [Math.PI, Math.PI / 4, 0]), '#3f444c');
  b.cyl(0, 7.9, 0, 0.14, 0.14, 0.7, R, { seg: 6 }); b.ball(0, 8.35, 0, 0.3, '#e8b531', { detail: 0 });
  return b;
}
function marker() {
  const b = new PropBuilder();
  b.cyl(0, 0.6, 0, 0.2, 0.25, 1.2, '#9aa0a6', { seg: 6 }); b.ball(0, 1.35, 0, 0.3, '#c8ccd0', { detail: 0 });
  return b;
}

// ------------------------------------------------------------------ the factory
const MODELS = {
  'lamp': { build: lampArm, name: 'lamp' }, 'lamp-post': { build: lampPost },
  camphor: { build: camphor }, banyan: { build: banyan }, flame: { build: flame }, bauhinia: { build: bauhinia }, willow: { build: willow }, palm: { build: palm },
  'base-grate': { build: treeGrate }, 'base-planter': { build: treePlanter },
  bench: { build: () => bench() }, 'river-bench': { build: riverBench }, 'chess-table': { build: chessTable }, bin: { build: bin }, bollard: { build: bollard },
  planter: { build: planter }, 'bike-rack': { build: bikeRack, atlas: true }, 'bike-rack-1': { build: r => bikeRack(r, 1), atlas: true }, 'bike-rack-2': { build: r => bikeRack(r, 2), atlas: true }, vending: { build: vending, atlas: true }, mailbox: { build: mailbox, atlas: true },
  hydrant: { build: hydrant }, pavilion: { build: pavilion }, marker: { build: marker }
};
// Crowns are drawn narrower than they are tall so that trees planted 8 apart do not merge.
const SPREAD = { camphor: 0.72, banyan: 0.82, flame: 0.7, bauhinia: 0.76, willow: 0.8, palm: 1 };
const TREE_SPECIES = ['camphor', 'banyan', 'flame', 'bauhinia', 'willow', 'palm'];
const BASE_SIZE = { bench: [4.6, 1.1], 'river-bench': [2.8, 1.0] };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), UP = new THREE.Vector3(0, 1, 0);

export function createFurniture(items, world, { quality = 'full' } = {}) {
  LITE = quality === 'lite';
  const atlas = new Atlas(512, 512), rects = {};
  rects.vendLogo = atlas.patch(128, 64, (c, w, h) => { c.fillStyle = '#f4efe2'; c.fillRect(0, 0, w, h); c.fillStyle = '#d33a32'; c.fillRect(0, 0, w, 10); fitText(c, '冰涼飲料', 0, 12, w, h - 14, { color: '#c4302b', size: 38 }); });
  rects.vendDrinks = atlas.patch(128, 256, (c, w, h) => {
    c.fillStyle = '#1b2227'; c.fillRect(0, 0, w, h);
    const cols = ['#e8b531', '#3f8f88', '#d9528a', '#3e6fa8', '#c8d0d6', '#7aa35b', '#d9822b'];
    for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) {
      c.fillStyle = cols[(r * 3 + k * 2) % cols.length]; c.fillRect(10 + k * 28, 14 + r * 58, 20, 38);
      c.fillStyle = '#f4efe2'; c.fillRect(10 + k * 28, 24 + r * 58, 20, 10);
    }
  });
  rects.kioskSign = atlas.patch(160, 100, (c, w, h) => { c.fillStyle = '#3f8f88'; c.fillRect(0, 0, w, h); fitText(c, '小鎮單車', 4, 4, w - 8, h - 8, { color: '#fff6dc', size: 54 }); });
  rects.kioskScreen = atlas.patch(96, 80, (c, w, h) => { c.fillStyle = '#12262c'; c.fillRect(0, 0, w, h); c.fillStyle = '#7fe0d0'; c.fillRect(8, 10, w - 16, 8); c.fillRect(8, 26, w - 36, 6); c.fillStyle = '#f2a31f'; c.fillRect(8, 48, w - 16, 20); fitText(c, '借車', 8, 48, w - 16, 20, { color: '#12262c', size: 18 }); });
  rects.mailRed = atlas.patch(64, 64, (c, w, h) => { c.fillStyle = '#f4efe2'; c.fillRect(0, 0, w, h); fitText(c, '郵', 0, 0, w, h, { color: '#cf3e34', size: 56 }); });
  rects.mailGreen = atlas.patch(64, 64, (c, w, h) => { c.fillStyle = '#f4efe2'; c.fillRect(0, 0, w, h); fitText(c, '郵', 0, 0, w, h, { color: '#2f8f5a', size: 56 }); });
  const texture = atlas.finish();
  const mat = propMaterial({ atlas: texture, roughness: 0.82 });
  const group = new THREE.Group(); group.name = 'furniture';

  // Which model each item uses, and the instance transform.
  const lists = {}, lights = [];
  const put = (model, x, y, z, heading, sx, sy, sz, tint) => { (lists[model] = lists[model] || []).push({ x, y, z, heading, sx, sy, sz, tint }); };
  for (const it of items) {
    const y = it.y || 0, h = it.heading || 0;
    switch (it.kind) {
      case 'lamp': {
        const l = it.light, arm = l ? Math.hypot(l.x - it.x, l.z - it.z) : 1.8, head = l ? l.y - y : 8.6;
        if (arm > 0.5) { const k = head / 8.6; put('lamp', it.x, y, it.z, h, k, k, k); } else { const k = head / 4.6; put('lamp-post', it.x, y, it.z, h, k, k, k); }
        if (l) lights.push({ x: l.x, y: l.y, z: l.z, radius: l.radius, color: l.color, intensity: 1, group: 'lamps', kind: it.style ? it.style + '-lamp' : 'lamp' });
        break;
      }
      case 'tree': {
        const sp = TREE_SPECIES.includes(it.species) ? it.species : 'camphor', size = it.size || 1, u = unitOf(it.id), v = unitOf(it.id, 'v');
        const tint = 0.84 + 0.16 * unitOf(it.id, 't');
        put(sp, it.x, y, it.z, u * Math.PI * 2, size * SPREAD[sp] * (0.94 + 0.12 * v), size * (0.92 + 0.16 * unitOf(it.id, 'h')), size * SPREAD[sp] * (0.94 + 0.12 * unitOf(it.id, 'w')), tint);
        if (it.base === 'grate') put('base-grate', it.x, y, it.z, 0, 1, 1, 1);
        else if (it.base === 'planter') put('base-planter', it.x, y, it.z, 0, 1, 1, 1);
        break;
      }
      case 'bench': case 'river-bench': {
        const [bw, bd] = BASE_SIZE[it.kind], kz = it.w ? it.w / bw : 1, kx = it.d ? it.d / bd : 1;
        put(it.kind, it.x, y, it.z, h, Math.abs(kx - 1) < 0.02 ? 1 : kx, 1, Math.abs(kz - 1) < 0.02 ? 1 : kz);
        break;
      }
      case 'bike-rack': put('bike-rack' + (hash(String(it.id)) % 3 ? '-' + (hash(String(it.id)) % 3) : ''), it.x, y, it.z, h, 1, 1, 1); break;
      case 'chess-table': case 'bin': case 'bollard': case 'planter': case 'vending': case 'mailbox': case 'hydrant': case 'pavilion':
        put(it.kind, it.x, y, it.z, h, 1, 1, 1); break;
      default: put('marker', it.x, y, it.z, h, 1, 1, 1);
    }
  }
  const meshes = {};
  for (const [name, list] of Object.entries(lists)) {
    const spec = MODELS[name];
    const mesh = instancedModel(spec.build(spec.atlas ? rects : undefined).build(), mat, list.length, { name: 'furniture-' + name, castShadow: !name.startsWith('base-'), receiveShadow: true });
    list.forEach((o, i) => {
      _q.setFromAxisAngle(UP, -o.heading);
      mesh.setMatrixAt(i, _m.compose(_p.set(o.x, o.y, o.z), _q, _s.set(o.sx, o.sy, o.sz)));
      if (o.tint) { _c.setRGB(o.tint, o.tint * (0.96 + 0.04 * (i % 2)), o.tint * 0.95); mesh.instanceColor.setXYZ(i, _c.r, _c.g, _c.b); }
    });
    mesh.count = list.length;
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    meshes[name] = mesh; group.add(mesh);
  }
  void world;
  return {
    group, lights,
    update(frame) { mat.userData.uniforms.uLamps.value = frame ? frame.lamps || 0 : 0; },
    dispose() { disposeObject(group); },
    info: () => ({ meshes: Object.keys(meshes).length, instances: items.length })
  };
}

// ------------------------------------------------------------------ showroom
// Every model in a row (fronts toward +z, the south), trees behind, the pavilion beside, with
// stand-in people (4.3 tall) for scale; plus the real planned items around the c-sports lot.
// &at=x,z moves the window of real items (e.g. to a park: at=-152,-131).
export function preview(ctx) {
  const world = ctx.world, q = new URLSearchParams(location.search);
  const site = world.siteList.find(s => s.id === 'c-sports') || world.siteList[0];
  const cx = site.area.x, cz = site.area.z, H = Math.PI / 2;
  const [ax, az] = q.has('at') ? q.get('at').split(',').map(Number) : [cx, cz];
  const real = planFurniture(world).items.filter(i => Math.abs(i.x - ax) < 70 && Math.abs(i.z - az) < 55);
  const show = [], fig = new PropBuilder();
  const row = [['bench', 7], ['river-bench', 5], ['chess-table', 5], ['bin', 3], ['bollard', 3], ['planter', 4], ['bike-rack', 6.5], ['vending', 4], ['mailbox', 4], ['hydrant', 3.5], ['lamp', 8], ['lamp-park', 4], ['unknown-thing', 3]];
  let x = cx - 36;
  for (const [k, gap] of row) {
    const base = { id: k + ':show', x: x + gap / 2, z: cz, y: 0.15, heading: H, w: (SIZE[k] || [1, 1])[0], d: (SIZE[k] || [1, 1])[1] };
    if (k === 'lamp') show.push({ ...base, kind: 'lamp', heading: Math.PI, light: { x: base.x, z: cz + 1.8, y: 0.15 + 8.6, radius: 10, color: '#ffd9a6' } });
    else if (k === 'lamp-park') show.push({ ...base, kind: 'lamp', style: 'park', light: { x: base.x, z: cz, y: 0.15 + 4.6, radius: 8, color: '#ffd9a6' } });
    else show.push({ ...base, kind: k });
    if (k === 'bench') scaleFigure(fig, base.x, cz + 0.05, '#6f9fb4', { seated: true, seatY: 1.4, heading: H });
    if (k === 'chess-table') scaleFigure(fig, base.x + 0.95, cz + 0.95, '#d9b24e', { seated: true, seatY: 1.15, heading: Math.PI * 0.75 });
    if (k === 'vending') scaleFigure(fig, base.x + 2.4, cz + 1.4, '#d9734e', { heading: H });
    x += gap;
  }
  ['camphor', 'banyan', 'flame', 'bauhinia', 'willow', 'palm'].forEach((sp, i) => show.push({ id: 'tree:show' + i, kind: 'tree', species: sp, size: 1, x: cx - 36 + i * 14, z: cz - 28, y: 0.15, heading: 0, base: i % 2 ? 'planter' : 'grate' }));
  show.push({ id: 'pavilion:show', kind: 'pavilion', x: cx + 50, z: cz - 28, y: 0.15, heading: 0 });
  scaleFigure(fig, cx + 50, cz - 20, '#d9734e', { heading: H });
  const furniture = createFurniture([...show, ...real], world, { quality: ctx.quality });
  const figMesh = new THREE.Mesh(fig.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
  figMesh.position.y = 0.15; figMesh.castShadow = true;
  const group = new THREE.Group(); group.add(furniture.group, figMesh);
  return { group, update: f => furniture.update(f) };
}
