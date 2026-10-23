// 鎮民運動場: a running track round a marked pitch, a small covered stand on one
// side, trees along the edge and four floodlight masts that come on in the evening.

import * as THREE from 'three';
import { ShapeBuilder, material, signTexture } from '../kit.js';
import { Glows, mesh, litMaterial, setLevel, pointScale, moduleBase, lightSource, beam } from './common.js';
import { tree, planter, groundRing, groundDisc } from './props.js';

// Track: outer half-width/half-length (a stadium: two straights and two half circles), band width, lane count.
const TRACK = { halfW: 19, halfL: 26.5, band: 7.2, lanes: 4 };
const FLOOD = { height: 23, lampW: 5.2, lampH: 2.6 };

// A stadium (rounded rectangle, long axis z) outline as a THREE.Path at inset `dr`.
function stadium(path, cx, cz, halfW, halfL, dr, ccw = true) {
  const r = halfW - dr, h = halfL - dr - r, steps = 24;
  const pts = [];
  for (let i = 0; i <= steps; i++) { const a = Math.PI * i / steps; pts.push([cx + Math.cos(a) * r, cz + h + Math.sin(a) * r]); }
  for (let i = 0; i <= steps; i++) { const a = Math.PI + Math.PI * i / steps; pts.push([cx + Math.cos(a) * r, cz - h + Math.sin(a) * r]); }
  if (!ccw) pts.reverse();
  path.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) path.lineTo(p[0], p[1]);
  path.closePath();
  return path;
}

// A flat band between two stadium outlines, lying at height y.
function band(sb, cx, cz, outer, inner, y, color) {
  const shape = stadium(new THREE.Shape(), cx, -cz, outer.halfW, outer.halfL, outer.inset);
  shape.holes.push(stadium(new THREE.Path(), cx, -cz, inner.halfW, inner.halfL, inner.inset, false));
  sb.add(new THREE.ShapeGeometry(shape, 1), sb.transform(0, y, 0, [-Math.PI / 2, 0, 0]), color);
}
function disc(sb, cx, cz, halfW, halfL, inset, y, color) {
  const shape = stadium(new THREE.Shape(), cx, -cz, halfW, halfL, inset);
  sb.add(new THREE.ShapeGeometry(shape, 1), sb.transform(0, y, 0, [-Math.PI / 2, 0, 0]), color);
}

function ground(sb, a, cx, cz) {
  const y = 0.2;
  sb.block(cx, 0.05, cz, a.w, 0.15, a.d, '#d8d1c3');
  // Lawn round the edge, trees later; the track and the pitch go on top.
  const t = TRACK;
  disc(sb, cx, cz, t.halfW + 3, t.halfL + 2.4, 0, y + 0.015, '#bdb4a3'); // concourse apron
  band(sb, cx, cz, { halfW: t.halfW, halfL: t.halfL, inset: 0 }, { halfW: t.halfW, halfL: t.halfL, inset: t.band }, y + 0.04, '#c4624a');
  // Lane lines.
  for (let i = 0; i <= t.lanes; i++) {
    const inset = (t.band / t.lanes) * i;
    band(sb, cx, cz, { halfW: t.halfW, halfL: t.halfL, inset: inset }, { halfW: t.halfW, halfL: t.halfL, inset: inset + 0.14 }, y + 0.08, '#f6efe4');
  }
  // Infield lawn with mowing stripes, then the pitch.
  disc(sb, cx, cz, t.halfW, t.halfL, t.band + 0.14, y + 0.04, '#6fa357');
  const inW = t.halfW - t.band - 0.14, inL = t.halfL - t.band - 0.14;
  const pw = Math.min(inW * 2 - 3, 21), pl = Math.min(inL * 2 - 4, 33);
  for (let i = 0; i < 6; i++) sb.block(cx, y + 0.07, cz - pl / 2 + (i + 0.5) * pl / 6, pw, 0.03, pl / 6, i % 2 ? '#78ad5f' : '#69a052');
  // Pitch lines.
  const ln = (x, z, w, d) => sb.block(x, y + 0.12, z, w, 0.03, d, '#fbf8ef');
  const lw = 0.22;
  ln(cx, cz - pl / 2, pw, lw); ln(cx, cz + pl / 2, pw, lw); ln(cx - pw / 2, cz, lw, pl); ln(cx + pw / 2, cz, lw, pl); ln(cx, cz, pw, lw);
  groundRing(sb, cx, cz, 3.1, 3.3, y + 0.14, '#fbf8ef', 36);
  for (const s of [-1, 1]) {
    const z = cz + s * pl / 2;
    ln(cx, z - s * 4, 10, lw); ln(cx - 5, z - s * 2, lw, 4); ln(cx + 5, z - s * 2, lw, 4);
    // Goal: two posts, a crossbar and a net hint.
    for (const gx of [-2.4, 2.4]) sb.cylinder(cx + gx, y + 2.0, z + s * 0.1, 0.12, 0.12, 4.0, '#f6f6f6', 6);
    sb.box(cx, y + 4.0, z + s * 0.1, 4.9, 0.24, 0.24, '#f6f6f6');
    sb.box(cx, y + 2.0, z + s * 1.4, 4.8, 4.0, 0.05, '#e8ecee');
  }
}

function stand(sb, lit, cx, cz, a) {
  // On the west edge, facing the field (+x), 28 long.
  const x0 = a.x0 + 2.2, len = 28, rows = 5, run = 1.5, rise = 0.95;
  const baseY = 0.2;
  const cols = ['#3e6fa8', '#e9e2d4'];
  sb.block(x0 + 3.6, baseY, cz, 8.0, 0.4, len + 1.6, '#c9c2b5');
  for (let r = 0; r < rows; r++) {
    const h = 0.7 + rise * (r + 1);
    sb.block(x0 + 6.8 - r * run - run / 2, baseY, cz, run, h, len, '#bdb7ad');
    sb.block(x0 + 6.8 - r * run - run / 2 + 0.08, baseY + h, cz, run * 0.7, 0.14, len - 0.4, cols[0]);
    // Seat backs in blocks of four, leaving aisles.
    for (let s = 0; s < 7; s++) sb.block(x0 + 6.8 - r * run - run + 0.34, baseY + h + 0.14, cz - len / 2 + 2 + s * 3.7 + 0.4, 0.14, 0.7, 3.0, s % 2 ? '#e8b531' : '#3e6fa8');
  }
  // Roof: a thin slab on two rows of posts, with the sign fascia in front.
  const roofY = baseY + 9.2;
  for (const dz of [-len / 2 + 0.6, 0, len / 2 - 0.6]) {
    sb.block(x0 + 0.6, baseY, cz + dz, 0.5, 9.2, 0.5, '#8c949b');
    sb.block(x0 + 7.6, baseY, cz + dz, 0.5, 6.4, 0.5, '#8c949b');
  }
  sb.add(new THREE.BoxGeometry(9.2, 0.35, len + 1.2), sb.transform(x0 + 4.2, roofY + 0.4, cz, [0, 0, 0.16]), '#f4f1ea');
  sb.block(x0 + 8.5, roofY - 1.2, cz, 0.4, 1.9, len + 1.2, '#2f8f88');
  lit.block(x0 + 8.3, roofY - 1.5, cz, 0.15, 0.2, len + 0.8, '#fff0c0');
  // Little team benches on the opposite side, by the track.
  return { signX: x0 + 8.72, signY: roofY - 0.25, signZ: cz, len };
}

function floodlight(sb, lit, glows, x, z, aimX, aimZ) {
  sb.cylinder(x, 0.5, z, 1.1, 1.3, 0.6, '#8c949b', 8);
  sb.cylinder(x, FLOOD.height / 2 + 0.2, z, 0.28, 0.5, FLOOD.height, '#8c949b', 8);
  const yaw = Math.atan2(aimZ - z, aimX - x);
  const top = FLOOD.height + 0.2;
  // Frame plus a bank of 3×2 lamps facing the pitch.
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (f, u, v) => [x + f * c - u * s, top + v, z + f * s + u * c];
  sb.add(new THREE.BoxGeometry(0.4, FLOOD.lampH + 0.5, FLOOD.lampW + 0.5), sb.transform(...at(0.3, 0, 0.8), [0, -yaw, 0]), '#4a5258');
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    const p = at(0.62, (i - 1) * 2.0, 0.8 + (j - 0.5) * 1.5);
    lit.add(new THREE.BoxGeometry(0.2, 1.2, 1.6), lit.transform(p[0], p[1], p[2], [0, -yaw, 0]), '#fffbe8');
    const g = at(1.6, (i - 1) * 2.0, 0.8 + (j - 0.5) * 1.5);
    glows.add(g[0], g[1], g[2], '#fff3cf', 7);
  }
  sb.add(new THREE.BoxGeometry(0.5, 0.4, 3.0), sb.transform(...at(-0.2, 0, -1.0), [0, -yaw, 0]), '#4a5258');
}

export function create({ world, quality = 'full' } = {}) {
  const base = moduleBase('sports');
  const { group } = base;
  const site = world.site('c-sports') || world.siteList.find(s => s.kind === 'sports');
  if (!site) return { group, update() {}, dispose: base.dispose, lights: [] };
  const a = site.area, cx = a.x + 3, cz = a.z;
  const sb = new ShapeBuilder(), lit = new ShapeBuilder(), glows = new Glows();

  ground(sb, a, cx, cz);
  const st = stand(sb, lit, cx, cz, a);
  // Floodlights at the four corners, aimed at the middle of the pitch.
  const corners = [[a.x0 + 4.5, a.z0 + 4.0], [a.x1 - 4.0, a.z0 + 4.0], [a.x0 + 4.5, a.z1 - 4.0], [a.x1 - 4.0, a.z1 - 4.0]];
  for (const [x, z] of corners) floodlight(sb, lit, glows, x, z, cx, cz);
  // Trees and planters on the open edge, away from the stand.
  const trees = [[a.x1 - 4, cz - 14], [a.x1 - 4, cz], [a.x1 - 4, cz + 14]];
  trees.forEach(([x, z], i) => { sb.cylinder(x, 0.6, z, 2.4, 2.6, 0.8, '#d8d0c0', 10); sb.cylinder(x, 1.0, z, 2.0, 2.0, 0.1, '#6b4a34', 10); tree(sb, x, z, 0.9, i, 1.0); });
  // Hurdles stacked by the track and a few cones: small things that make it look used.
  for (let i = 0; i < 5; i++) { const hx = cx + 21.8, hz = cz - 24 + i * 1.8; sb.block(hx, 0.2, hz, 0.12, 1.1, 1.4, '#f6efe4'); sb.block(hx + 0.35, 0.2, hz, 0.12, 1.1, 1.4, '#c9483b'); }

  group.add(mesh(sb.build(), material({ roughness: 0.9 }), { shadow: true }));
  const litMat = litMaterial();
  group.add(mesh(lit.build(), litMat));
  const glowPoints = glows.build({ opacity: 0.7 });
  group.add(glowPoints);

  // The name on the stand's fascia: facing the pitch (+x) and the street side (-x).
  const sign = signTexture('鎮民運動場', { background: '#2f8f88', color: '#fffaf0', border: '#fff0c0', height: 96, padding: 40 });
  const signMat = new THREE.MeshBasicMaterial({ map: sign.texture, color: '#9a9a9a' });
  const signH = 1.5, signW = signH * sign.aspect;
  const plane = new THREE.PlaneGeometry(signW, signH);
  const front = new THREE.Mesh(plane, signMat);
  front.rotation.y = Math.PI / 2; front.position.set(st.signX, st.signY, st.signZ);
  const back = new THREE.Mesh(plane, signMat);
  back.rotation.y = -Math.PI / 2; back.position.set(st.signX - 8.9, st.signY + 0.8, st.signZ);
  group.add(front);
  void back; void beam; void planter; void groundDisc;

  const lights = corners.map(([x, z]) => lightSource(x + (cx - x) * 0.12, FLOOD.height, z + (cz - z) * 0.12, 36, '#fff4d6', 0.95, 'lamps', 'floodlight'));

  function update(frame) {
    // Floodlights take a moment to warm up as the lamps come on.
    const on = Math.max(0, Math.min(1, (frame.lamps - 0.15) / 0.5));
    setLevel(litMat, on, 0.22);
    glowPoints.userData.level(on);
    glowPoints.material.uniforms.scale.value = pointScale(frame, 1);
    signMat.color.setScalar(0.62 + 0.38 * frame.lamps);
  }
  return { group, update, dispose() { sign.texture.dispose(); base.dispose(); }, lights };
}

export function preview(ctx) { return create({ world: ctx.world, quality: ctx.quality }); }
