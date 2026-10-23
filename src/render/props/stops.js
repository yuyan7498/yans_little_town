// Bus stops: a pole with a route sign, and (when `shelter`) a glass-sided shelter with a
// roof, a bench and a lit advertising panel behind it.
// Model space: +x = the stop's heading (the way buses travel), +y up, +z to the right of
// the traffic, i.e. toward the kerb and away from the road. The pole stands at the origin
// (the kerb point of the stop); the shelter extends behind it (-x) and back from the road.

import * as THREE from 'three';
import { PropBuilder, Atlas, fitText, propMaterial, instancedModel, disposeObject, scaleFigure } from './parts.js';
import { createVehicles } from './vehicles.js';

const POLE = '#3f8f88', POLE_DARK = '#3b4045', STEEL = '#aab2b8', GLASS = '#a6c9d4', WOOD = '#b3835a';

function pole(rects) {
  const b = new PropBuilder();
  b.cyl(0, 0.2, 0, 0.42, 0.5, 0.4, '#bdb7ad', { seg: 6 });
  b.rod([0, 0.3, 0], [0, 7.6, 0], 0.15, '#4d5a5e', { r2: 0.12, seg: 5 });
  // the sign plate, readable from both ways along the road: header + route list
  for (const f of ['+x', '-x']) {
    const s = f === '+x' ? 1 : -1;
    b.quad(s * 0.17, 6.55, 0, 2.5, 0.8, f, '#ffffff', { tex: rects.header });
    b.quad(s * 0.17, 5.25, 0, 2.5, 1.8, f, '#ffffff', { tex: rects.routes });
  }
  b.box(0, 5.25, 0, 0.14, 3.1, 2.62, '#e8e2d0');
    // a round "bus" disc above the plate
  b.box(0, 7.55, 0, 0.14, 1.0, 1.0, '#3e6fa8');
  b.quad(0.09, 7.55, 0, 0.8, 0.8, '+x', '#ffffff', { tex: rects.disc }); b.quad(-0.09, 7.55, 0, 0.8, 0.8, '-x', '#ffffff', { tex: rects.disc });
  return b;
}

function shelter(rects) {
  const b = new PropBuilder(), X0 = -9.4, X1 = -0.8, ZB = 2.2, ZF = -0.2, H = 5.0, cx = (X0 + X1) / 2, cz = (ZB + ZF) / 2, L = X1 - X0;
  b.block(cx, 0, cz, L + 0.6, 0.18, ZB - ZF + 0.6, '#c9c2b5');                       // pad
  // roof: a gently pitched steel-framed slab with a teal fascia
  b.box(cx, H + 0.15, cz, L + 0.8, 0.22, ZB - ZF + 0.9, '#e6e1d6', { rot: [0.05, 0, 0] });
  b.box(cx, H + 0.1, ZF - 0.5, L + 0.8, 0.5, 0.14, POLE);
  b.box(cx, H + 0.1, ZB + 0.45, L + 0.8, 0.5, 0.14, POLE);
  b.box(X0 - 0.4, H + 0.1, cz, 0.14, 0.5, ZB - ZF + 0.9, POLE); b.box(X1 + 0.4, H + 0.1, cz, 0.14, 0.5, ZB - ZF + 0.9, POLE);
  for (const x of [X0 + 0.1, X1 - 0.1, cx]) for (const z of [ZF, ZB]) b.rod([x, 0.15, z], [x, H, z], 0.1, STEEL, { seg: 4 });
  // glazed end walls and back (the back carries the ad panel in its middle bay)
  b.box(X0 + 0.1, 2.8, cz, 0.06, 3.9, ZB - ZF, GLASS); b.box(X1 - 0.1, 2.8, cz, 0.06, 3.9, ZB - ZF, GLASS);
  b.box(X0 + 1.5, 2.8, ZB, 2.8, 3.9, 0.06, GLASS); b.box(X1 - 1.5, 2.8, ZB, 2.8, 3.9, 0.06, GLASS);
  b.box(cx, 2.8, ZB, 3.0, 3.9, 0.14, '#2f3a40');
  b.quad(cx, 2.9, ZB - 0.08, 2.6, 3.4, '-z', '#ffffff', { tex: rects.ad, glow: -0.9 });
  b.quad(cx, 2.9, ZB + 0.08, 2.6, 3.4, '+z', '#ffffff', { tex: rects.ad, glow: -0.9 });
  // bench, seat top 1.4, and a perch rail
  b.block(cx + 0.6, 1.2, ZB - 0.75, L - 2.2, 0.2, 0.9, WOOD);
  for (const x of [X0 + 1.4, X1 - 1.6]) b.block(x, 0.15, ZB - 0.75, 0.2, 1.05, 0.8, POLE_DARK);
  b.block(cx + 0.6, 1.9, ZB - 0.22, L - 2.2, 0.9, 0.08, WOOD);
  // route board inside the shelter's end, and a small bin
  b.quad(X1 - 0.17, 3.0, cz - 0.3, 1.4, 1.9, '-x', '#ffffff', { tex: rects.routes });
  return b;
}

export function createStops(stops) {
  const atlas = new Atlas(512, 512), rects = {};
  rects.header = atlas.patch(256, 80, (c, w, h) => { c.fillStyle = '#2f7f79'; c.fillRect(0, 0, w, h); fitText(c, '公車站', 0, 4, w, h - 8, { color: '#ffffff', size: 56 }); });
  rects.routes = atlas.patch(256, 180, (c, w, h) => {
    c.fillStyle = '#f7f4ea'; c.fillRect(0, 0, w, h); c.fillStyle = '#2f7f79'; c.fillRect(0, 0, w, 6);
    const lines = [['C', '環河線'], ['W', '西區線'], ['E', '東區線'], ['S', '社區接駁線']], cols = ['#2f8f88', '#3e6fa8', '#d9822b', '#7a5aa6'];
    lines.forEach(([k, n], i) => {
      const y = 14 + i * 40;
      c.fillStyle = cols[i]; c.fillRect(10, y, 34, 32); fitText(c, k, 10, y, 34, 32, { color: '#ffffff', size: 24 });
      c.textAlign = 'left'; fitText(c, n, 52, y, w - 62, 32, { color: '#222a2e', size: 26 });
    });
  });
  rects.disc = atlas.patch(64, 64, (c, w, h) => {
    c.fillStyle = '#3e6fa8'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffffff';
    c.fillRect(12, 14, 40, 30); c.fillStyle = '#3e6fa8'; c.fillRect(16, 18, 14, 12); c.fillRect(34, 18, 14, 12);
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(20, 48, 5, 0, 7); c.arc(44, 48, 5, 0, 7); c.fill();
  });
  rects.ad = atlas.patch(128, 160, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#f6c75a'); g.addColorStop(1, '#e8825a');
    c.fillStyle = g; c.fillRect(0, 0, w, h); c.fillStyle = '#ffffff'; c.beginPath(); c.arc(w / 2, 60, 34, 0, 7); c.fill();
    c.fillStyle = '#d9522b'; c.beginPath(); c.arc(w / 2, 60, 22, 0, 7); c.fill();
    fitText(c, '鎮上好味道', 6, 108, w - 12, 34, { color: '#ffffff', size: 28 });
  });
  const mat = propMaterial({ atlas: atlas.finish() });
  const group = new THREE.Group(); group.name = 'bus-stops';
  const poles = stops, sheltered = stops.filter(s => s.shelter);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);
  const place = (mesh, list) => {
    list.forEach((st, i) => { _q.setFromAxisAngle(UP, -(st.heading || 0)); mesh.setMatrixAt(i, _m.compose(_p.set(st.x, st.y || 0, st.z), _q, _s)); });
    mesh.count = list.length; mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); group.add(mesh);
  };
  place(instancedModel(pole(rects).build(), mat, poles.length, { name: 'stop-poles' }), poles);
  place(instancedModel(shelter(rects).build(), mat, sheltered.length, { name: 'stop-shelters' }), sheltered);
  mat.userData.uniforms.uLamps.value = 0;
  return { object: group, dispose() { disposeObject(group); }, setLamps(v) { mat.userData.uniforms.uLamps.value = v; } };
}

// Showroom: a stop with and without a shelter, a bus pulling in at each, a person for scale.
export function preview(ctx) {
  const site = ctx.world.siteList.find(s => s.id === 'c-sports') || ctx.world.siteList[0];
  const cx = site.area.x, cz = site.area.z;
  const list = [{ x: cx - 12, y: 0.15, z: cz, heading: 0, shelter: false }, { x: cx + 22, y: 0.15, z: cz, heading: 0, shelter: true }];
  const stops = createStops(list), vehicles = createVehicles({ quality: ctx.quality });
  const fig = new PropBuilder();
  scaleFigure(fig, cx - 15, cz + 1.5, '#d9734e', { heading: 0 }); scaleFigure(fig, cx + 15, cz + 1.2, '#6f9fb4', { heading: 0 });
  const figMesh = new THREE.Mesh(fig.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
  figMesh.position.y = 0.15; figMesh.castShadow = true;
  const group = new THREE.Group(); group.add(stops.object, vehicles.object, figMesh);
  const buses = [{ id: 'b1', kind: 'bus', line: 'c', x: cx - 10, y: 0.15, z: cz - 5, heading: 0 }, { id: 'b2', kind: 'bus', line: 'w', x: cx + 24, y: 0.15, z: cz - 5, heading: 0 }];
  return { group, update(frame) { vehicles.update(buses, frame); stops.setLamps(frame.lamps); } };
}
