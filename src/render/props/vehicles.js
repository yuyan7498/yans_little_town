// Vehicles: scooter, bicycle, three car shapes, taxi, city bus, police car, delivery van.
// Each model is one merged geometry, drawn as one instanced mesh (9 draw calls in all).
// Model space: forward +x, up +y, width along z, standing on y = 0; rotation.y = -heading.
// Sizes per docs/CONVENTIONS.md: car 8.6 x 3.4, bus 12.6 x 3.8, scooter 3.3 x 0.84,
// bicycle 2.9 x 0.9. Riders sit at SEATS (seats.js).

import * as THREE from 'three';
import { PropBuilder, Atlas, fitText, propMaterial, instancedModel, at, disposeObject, scaleFigure } from './parts.js';
import { SEATS } from './seats.js';
import { hash } from '../../core/random.js';

const TYRE = '#26272b', HUB = '#b9bec4', GLASS = '#456a7e', TRIM = '#2e3136', CHROME = '#c7ccd2', LAMP = '#fff1c4', TAIL = '#d3342c', WHITE = '#eceae3';
const CAR_COLORS = ['#d8d3c8', '#2f3c4c', '#b83c35', '#4f7391', '#7d8b8f', '#e6dcc2', '#3f806e', '#c8a24c', '#22262b', '#8f5a45'];
const SCOOTER_COLORS = ['#d84f3f', '#2f6fa8', '#e8e2d0', '#2a2d33', '#e0a932', '#4f9a82', '#7d5aa6', '#8c9399'];
const BIKE_COLORS = ['#f0a22e', '#3f7fb0', '#c9483b', '#4a9a7b', '#d8d3c8', '#2d3238'];
const BUS_COLORS = ['#2f8f88', '#3e6fa8', '#d9822b', '#7a5aa6'];
const LINES = [['c', '環河線'], ['w', '西區線'], ['e', '東區線'], ['s', '社區接駁線']];

// ------------------------------------------------------------------ shared pieces
// Detail level of the models being built (set by createVehicles): lite = phones.
let LITE = false;
// Wheels are 8-sided prisms; the hub patch is left out in lite.
function wheel(b, x, y, z, r, w = 0.5) {
  b.wheel(x, y, z, r, w, TYRE, { seg: 8 });
  if (!LITE) b.wheel(x, y, z + Math.sign(z) * w * 0.52, r * 0.55, 0.06, HUB, { seg: 6 });
}
const lamps = (b, x, y, zs, w, h) => { for (const z of zs) b.box(x, y, z, 0.12, h, w, LAMP, { glow: 1 }); };
const tails = (b, x, y, zs, w, h) => { for (const z of zs) b.box(x, y, z, 0.12, h, w, TAIL, { glow: 0.9 }); };

// ------------------------------------------------------------------ cars
const SHAPES = {
  sedan: {
    lower: [[-4.3, 0.7], [4.3, 0.7], [4.3, 1.55], [3.9, 1.95], [2.1, 2.2], [-3.5, 2.3], [-4.3, 2.1]],
    cabin: [[-2.95, 2.25], [-2.1, 3.5], [0.9, 3.5], [2.2, 2.2]], wheelX: [2.75, -2.7], r: 0.85
  },
  hatch: {
    lower: [[-4.3, 0.7], [4.3, 0.7], [4.3, 1.5], [3.7, 1.9], [2.3, 2.15], [-4.3, 2.3]],
    cabin: [[-4.15, 2.3], [-3.8, 3.55], [0.7, 3.55], [2.35, 2.15]], wheelX: [2.7, -2.7], r: 0.82
  },
  suv: {
    lower: [[-4.3, 0.95], [4.3, 0.95], [4.3, 2.0], [3.8, 2.45], [2.4, 2.6], [-4.3, 2.7]],
    cabin: [[-4.2, 2.65], [-4.1, 4.1], [0.9, 4.1], [2.55, 2.55]], wheelX: [2.7, -2.7], r: 1.0
  }
};

function car(shapeName, { taxi = false, police = false } = {}) {
  const S = SHAPES[shapeName], b = new PropBuilder(), P = !taxi && !police, body = taxi ? '#f2b826' : police ? WHITE : '#ffffff';
  const o = { paint: P };
  b.loft(S.lower, 1.7, body, o);
  b.block(0, 0.45, 0, 7.8, 0.5, 3.0, TRIM);
  b.block(4.28, 0.7, 0, 0.3, 0.55, 3.3, TRIM); b.block(-4.28, 0.7, 0, 0.3, 0.55, 3.3, TRIM);
  // cabin: a glass prism, then roof, pillars and the sill in body colour
  const c = S.cabin, top = c[1][1];
  b.loft(c, 1.4, GLASS);
  const roofX0 = c[1][0], roofX1 = c[2][0];
  b.box((roofX0 + roofX1) / 2, top + 0.02, 0, roofX1 - roofX0 + 0.3, 0.2, 2.9, body, o);
  const bx = (roofX0 + roofX1) / 2 - 0.2;
  b.box(bx, (c[0][1] + top) / 2, 0, 0.3, top - c[0][1], 2.9, body, o);
  for (const s of [1, -1]) {
    b.rod([c[3][0], c[3][1], s * 1.4], [c[2][0], top, s * 1.4], 0.1, body, { ...o, seg: 3 });
    b.rod([c[0][0], c[0][1], s * 1.4], [c[1][0], top, s * 1.4], 0.1, body, { ...o, seg: 3 });
    if (!LITE) b.box(c[3][0] - 0.25, c[3][1] + 0.35, s * 1.85, 0.3, 0.3, 0.3, body, o);          // mirror
    b.box(bx + 0.1, 1.6, s * 1.72, 0.08, 0.9, 0.04, TRIM);                                       // door seam
  }
  lamps(b, 4.32, S.lower[3][1] - 0.15, [-1.15, 1.15], 0.8, 0.4);
  b.box(4.33, 1.2, 0, 0.1, 0.35, 1.3, TRIM);
  tails(b, -4.32, S.lower[5][1] - 0.35, [-1.2, 1.2], 0.75, 0.4);
  if (!LITE) { b.box(-4.34, 1.3, 0, 0.08, 0.35, 0.9, '#f3efe0'); b.box(4.34, 1.0, 0, 0.08, 0.3, 0.9, '#f3efe0'); }
  for (const s of [1, -1]) { wheel(b, S.wheelX[0], S.r, s * 1.5, S.r); wheel(b, S.wheelX[1], S.r, s * 1.5, S.r); }
  return { b, top };
}

function taxiCar(rects) {
  const { b, top } = car('sedan', { taxi: true });
  if (!LITE) { b.box(0, 1.55, 1.73, 6.8, 0.22, 0.04, '#26272b'); b.box(0, 1.55, -1.73, 6.8, 0.22, 0.04, '#26272b'); }
  const y = top + 0.12 + 0.45, x = -0.65;
  b.box(x, y, 0, 0.95, 0.9, 2.5, '#f6e9a8', { glow: 0.6 });
  b.quad(x + 0.48, y, 0, 2.3, 0.7, '+x', '#ffffff', { tex: rects.taxi });
  b.quad(x - 0.48, y, 0, 2.3, 0.7, '-x', '#ffffff', { tex: rects.taxi });
  return b;
}

function policeCar(rects) {
  const { b, top } = car('sedan', { police: true });
  for (const s of [1, -1]) {
    b.box(0, 1.5, s * 1.73, 6.8, 0.42, 0.04, '#2a5fb4');
    b.quad(-0.3, 1.5, s * 1.76, 2.6, 0.34, s > 0 ? '+z' : '-z', '#ffffff', { tex: rects.police });
  }
  b.box(-0.6, top + 0.4, 0.5, 0.6, 0.38, 0.9, '#d33a32', { flash: 1 });
  b.box(-0.6, top + 0.4, -0.5, 0.6, 0.38, 0.9, '#3a6fe0', { flash: -1 });
  return b;
}

function van(rects) {
  const b = new PropBuilder(), o = { paint: true };
  b.loft([[-4.3, 0.85], [4.3, 0.85], [4.3, 2.5], [3.4, 3.0], [2.8, 4.6], [-4.3, 4.7]], 1.7, '#ffffff', o);
  b.block(0, 0.45, 0, 7.8, 0.5, 3.0, TRIM);
  b.loft([[3.43, 3.05], [2.83, 4.45], [2.4, 4.45], [2.4, 3.05]], 1.45, GLASS);
  for (const s of [1, -1]) {
    b.box(2.0, 3.8, s * 1.71, 1.5, 1.2, 0.06, GLASS);
    b.box(-0.2, 2.8, s * 1.71, 0.06, 3.2, 0.04, TRIM);
    b.quad(-2.2, 3.1, s * 1.75, 3.6, 1.1, s > 0 ? '+z' : '-z', '#ffffff', { tex: rects.van });
  }
  lamps(b, 4.32, 1.8, [-1.15, 1.15], 0.8, 0.45);
  b.box(4.33, 1.25, 0, 0.1, 0.4, 1.4, TRIM);
  tails(b, -4.32, 2.0, [-1.3, 1.3], 0.7, 0.9);
  b.box(-4.33, 3.5, 0, 0.06, 2.6, 0.04, TRIM);
  for (const s of [1, -1]) { wheel(b, 2.7, 0.9, s * 1.5, 0.9); wheel(b, -2.7, 0.9, s * 1.5, 0.9); }
  return b;
}

// ------------------------------------------------------------------ bus
function bus(rects) {
  const b = new PropBuilder(), o = { paint: true };
  const L = 6.3, hw = 1.9;
  b.loft([[-L, 1.0], [L, 1.0], [L, 4.5], [L - 0.35, 5.5], [-L + 0.3, 5.6], [-L, 5.2]], hw, WHITE);
  b.block(0, 0.55, 0, 11.6, 0.6, 3.3, TRIM);
  for (const s of [1, -1]) {
    b.box(0, 1.6, s * (hw + 0.01), 12.4, 0.9, 0.04, '#ffffff', o);
    b.box(0, 2.3, s * (hw + 0.01), 12.4, 0.16, 0.04, '#ffffff', o);
    b.box(-0.2, 3.7, s * (hw + 0.02), 11.2, 1.55, 0.04, GLASS);
    for (let x = -5; x <= 5.3; x += LITE ? 3.8 : 1.9) b.box(x, 3.7, s * (hw + 0.04), 0.16, 1.55, 0.04, WHITE);
  }
  for (const x of [4.4, -0.9]) {                    // doors on the right (+z)
    b.box(x, 2.35, hw + 0.05, 1.6, 2.7, 0.05, '#3c6078');
    b.box(x, 2.35, hw + 0.08, 0.06, 2.6, 0.04, WHITE);
  }
  b.box(L + 0.02, 3.3, 0, 0.1, 2.2, 3.4, GLASS);
  b.box(L + 0.03, 3.3, 0, 0.12, 2.2, 0.14, WHITE);
  b.box(L + 0.02, 1.5, 0, 0.1, 0.8, 3.6, '#ffffff', o);
  b.box(L + 0.06, 1.0, 0, 0.08, 0.5, 3.6, TRIM);
  b.quad(L + 0.1, 4.95, 0, 3.0, 0.5, '+x', '#ffffff', { tex: rects.bus, row: true });
  b.quad(-L - 0.04, 4.3, 0, 1.8, 0.5, '-x', '#ffffff', { tex: rects.bus, row: true });
  b.box(-L - 0.02, 3.3, 0, 0.08, 1.4, 3.0, GLASS);
  b.quad(3.4, 4.7, hw + 0.04, 3.0, 0.5, '+z', '#ffffff', { tex: rects.bus, row: true });
  b.quad(3.4, 4.7, -hw - 0.04, 3.0, 0.5, '-z', '#ffffff', { tex: rects.bus, row: true });
  for (const s of [1, -1]) {
    lamps(b, L + 0.08, 1.7, [s * 1.4], 0.7, 0.4);
    tails(b, -L - 0.06, 1.8, [s * 1.45], 0.6, 0.9);
    if (!LITE) b.box(L - 0.2, 3.7, s * 2.2, 0.2, 0.9, 0.12, TRIM);
    wheel(b, 4.4, 1.0, s * 1.7, 1.0, 0.7); wheel(b, -3.6, 1.0, s * 1.7, 1.0, 0.7);
  }
  b.block(-1.0, 5.55, 0, 4.6, 0.55, 2.4, '#d3d6d8'); b.block(4.0, 5.55, 0, 1.6, 0.3, 2.2, '#d3d6d8');
  return b;
}

// ------------------------------------------------------------------ scooter and bicycle
function scooter() {
  const b = new PropBuilder(), o = { paint: true }, R = 0.58, fx = 1.12, rx = -1.05, W = '#ffffff';
  for (const x of [fx, rx]) b.cyl(x, R, 0, R, R, 0.34, TYRE, { axis: 'z', seg: 8 });
  for (const s of [1, -1]) b.rod([fx, R, s * 0.18], [fx - 0.3, 2.0, s * 0.18], 0.07, CHROME, { seg: 3 });
  b.block(fx - 0.04, 1.28, 0, 0.8, 0.12, 0.44, W, o);                           // front fender
  b.loft([[0.95, 0.64], [0.55, 0.64], [0.45, 2.0], [0.85, 2.0]], 0.27, W, o);   // leg shield
  b.block(0.1, 0.55, 0, 1.2, 0.14, 0.62, '#34363b');                              // floorboard
  b.loft([[0.45, 2.0], [1.2, 2.1], [1.0, 2.55], [0.45, 2.55]], 0.3, W, o);   // handlebar cowl
  b.box(1.22, 2.22, 0, 0.1, 0.26, 0.4, LAMP, { glow: 1 });
  b.rod([0.5, 2.6, -0.44], [0.5, 2.6, 0.44], 0.06, TRIM, { seg: 3 });
  if (!LITE) for (const s of [1, -1]) { b.rod([0.5, 2.6, s * 0.4], [0.4, 2.9, s * 0.46], 0.03, TRIM, { seg: 3 }); }
  b.loft([[-1.62, 1.1], [-1.5, 0.95], [-0.7, 0.9], [-0.1, 0.72], [-0.05, 1.7], [-1.3, 1.72], [-1.62, 1.5]], 0.27, W, o);   // rear body
  b.block(-SEATS.scooter.back - 0.18, SEATS.scooter.y - 0.2, 0, 1.6, 0.2, 0.5, '#2b2d32');                                  // seat
  tails(b, -1.64, 1.35, [0], 0.36, 0.22);
  if (!LITE) b.rod([-0.3, 0.8, 0.3], [-1.2, 0.84, 0.3], 0.09, CHROME, { seg: 4 });
  return b;
}

// color: a fixed frame colour (for bikes parked in a rack); otherwise the frame takes the instance colour.
// simple: the cheapest version, for the racks.
// A bicycle wheel: a thin tyre hoop (open tube plus a ring each side), see-through in the middle.
function hoop(b, x, y, R, seg) {
  b.add(new THREE.CylinderGeometry(R, R, 0.16, seg, 1, true), at(x, y, 0, [Math.PI / 2, 0, 0]), TYRE);
  b.add(new THREE.RingGeometry(R - 0.15, R, seg, 1), at(x, y, 0.081), TYRE);
  b.add(new THREE.RingGeometry(R - 0.15, R, seg, 1).rotateY(Math.PI), at(x, y, -0.081), TYRE);
}
// color: a fixed frame colour (bikes parked in a rack); otherwise the frame takes the instance colour.
// opts.basket: the front basket's colour; opts.light: add the lamp.
export function bicycle(b = new PropBuilder(), color = null, simple = false, { basket = '#8c949b', light = true } = {}) {
  const o = color ? { paint: false } : { paint: true }, FR = color || '#ffffff', R = 0.62, wb = 0.83, lite = simple || LITE;
  for (const x of [wb, -wb]) { hoop(b, x, R, R, lite ? 8 : 10); if (!lite) b.cyl(x, R, 0, 0.09, 0.09, 0.22, CHROME, { axis: 'z', seg: 4 }); }
  const bb = [-0.05, 0.8], seat = [-SEATS.bicycle.back, SEATS.bicycle.y - 0.2], head = [0.55, 1.95], rear = [-wb, R], front = [wb, R];
  const tube = (p, q, r = 0.07) => b.rod([p[0], p[1], 0], [q[0], q[1], 0], r, FR, { ...o, seg: 3 });
  tube(bb, seat); tube(bb, head); tube(seat, head);
  b.rod([bb[0], bb[1], 0], [rear[0], rear[1], 0.1], 0.06, FR, { ...o, seg: 3 });
  b.rod([seat[0], seat[1], 0], [rear[0], rear[1], -0.1], 0.06, FR, { ...o, seg: 3 });
  b.rod([head[0] + 0.06, head[1] - 0.1, 0], [front[0], front[1], 0], 0.07, CHROME, { seg: 3 });
  b.rod([head[0] - 0.05, head[1] + 0.4, -0.4], [head[0] - 0.05, head[1] + 0.4, 0.4], 0.06, TRIM, { seg: 3 });
  b.rod([head[0] + 0.05, head[1] + 0.4, 0], [head[0] + 0.05, head[1] - 0.2, 0], 0.06, TRIM, { seg: 3 });
  b.block(seat[0] - 0.05, SEATS.bicycle.y - 0.14, 0, 0.8, 0.14, 0.3, '#2b2d32');
  b.block(head[0] + 0.45, head[1] - 0.25, 0, 0.5, 0.4, 0.55, basket);
  if (light && !simple) b.box(head[0] + 0.18, head[1] + 0.2, 0, 0.12, 0.14, 0.14, LAMP, { glow: 1 });
  return b;
}

// ------------------------------------------------------------------ the factory
const kindOf = v => {
  if (v.kind === 'car') { const h = hash(String(v.id)) % 6; return h < 3 ? 'sedan' : h < 5 ? 'hatch' : 'suv'; }
  return v.kind;
};

export function createVehicles({ quality = 'full' } = {}) {
  LITE = quality === 'lite';
  const atlas = new Atlas(512, 512), rects = {};
  rects.taxi = atlas.patch(256, 64, (c, w, h) => {
    c.fillStyle = '#fff2b8'; c.fillRect(0, 0, w, h); c.fillStyle = '#3a2f12'; c.fillRect(0, 0, w, 6); c.fillRect(0, h - 6, w, 6);
    fitText(c, '計程車 TAXI', 0, 4, w, h - 8, { color: '#2a2a2a', size: 40 });
  });
  rects.police = atlas.patch(256, 48, (c, w, h) => { c.fillStyle = '#2a5fb4'; c.fillRect(0, 0, w, h); fitText(c, '警察 POLICE', 0, 0, w, h, { color: '#ffffff', size: 34 }); });
  rects.van = atlas.patch(256, 80, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h); c.fillStyle = '#d9822b'; c.fillRect(0, h - 16, w, 16);
    fitText(c, '宅配', 0, 0, w, h - 14, { color: '#d9822b', size: 54 });
  });
  const busRows = atlas.rows(256, 48, LINES.length, (c, w, h, i) => {
    c.fillStyle = '#10161a'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffb400'; c.font = '700 26px sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(LINES[i][0].toUpperCase(), 14, h / 2 + 2);
    fitText(c, LINES[i][1], 40, 2, w - 54, h - 4, { color: '#ffb400', size: 34 });
  });
  rects.bus = busRows.rect;
  const texture = atlas.finish();
  const mat = propMaterial({ atlas: texture });
  const busMat = propMaterial({ atlas: texture, rowStep: busRows.step });
  const group = new THREE.Group(); group.name = 'vehicles';
  const specs = {
    scooter: [scooter().build(), mat, 700], bicycle: [bicycle().build(), mat, 260],
    sedan: [car('sedan').b.build(), mat, 160], hatch: [car('hatch').b.build(), mat, 160], suv: [car('suv').b.build(), mat, 160],
    taxi: [taxiCar(rects).build(), mat, 48], police: [policeCar(rects).build(), mat, 12], van: [van(rects).build(), mat, 48], bus: [bus(rects).build(), busMat, 24]
  };
  const meshes = {};
  for (const [k, [geo, m, cap]] of Object.entries(specs)) {
    meshes[k] = instancedModel(geo, m, cap, { name: 'vehicle-' + k, dynamic: true, rows: k === 'bus' });
    group.add(meshes[k]);
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color(), UP = new THREE.Vector3(0, 1, 0);
  // Hazard lights: a van unloading (list entry hazard: true) blinks amber at its corners.
  const HAZARD = [[4.36, 1.8, 1.4], [4.36, 1.8, -1.4], [-4.36, 1.8, 1.4], [-4.36, 1.8, -1.4]];
  const hazard = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.36, 0.5), new THREE.MeshBasicMaterial({ color: '#ffb020', toneMapped: false }), specs.van[2] * HAZARD.length);
  hazard.name = 'vehicle-hazard'; hazard.count = 0; hazard.frustumCulled = false;
  group.add(hazard);
  const _o = new THREE.Vector3();
  const palette = { scooter: SCOOTER_COLORS, bicycle: BIKE_COLORS, sedan: CAR_COLORS, hatch: CAR_COLORS, suv: CAR_COLORS, van: ['#ffffff', '#e8e2d0', '#dfe6ea'], bus: BUS_COLORS };

  function update(list, frame) {
    const counts = {};
    let lit = 0;
    for (const v of list) {
      const k = kindOf(v), mesh = meshes[k];
      if (!mesh) continue;
      const i = counts[k] || 0;
      if (i >= mesh.instanceMatrix.count) continue;
      counts[k] = i + 1;
      _q.setFromAxisAngle(UP, -v.heading);
      mesh.setMatrixAt(i, _m.compose(_p.set(v.x, v.y || 0, v.z), _q, _s));
      if (v.hazard && k === 'van') for (const [hx, hy, hz] of HAZARD) hazard.setMatrixAt(lit++, _m.compose(_o.set(hx, hy, hz).applyQuaternion(_q).add(_p), _q, _s));
      const pal = palette[k], col = v.color || (pal ? pal[hash(String(v.id)) % pal.length] : '#ffffff');
      _c.set(col); mesh.instanceColor.setXYZ(i, _c.r, _c.g, _c.b);
      if (k === 'bus') {
        const li = LINES.findIndex(l => l[0] === v.line);
        mesh.geometry.attributes.instanceRow.setX(i, li >= 0 ? li : hash(String(v.id)) % LINES.length);
      }
    }
    for (const [k, mesh] of Object.entries(meshes)) {
      mesh.count = counts[k] || 0;
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
      if (k === 'bus') mesh.geometry.attributes.instanceRow.needsUpdate = true;
    }
    const level = frame ? frame.lamps || 0 : 0, blink = frame ? Math.floor((frame.time || 0) * 5) % 2 : 0;
    hazard.count = frame && Math.floor((frame.time || 0) * 2.4) % 2 ? lit : 0;
    hazard.instanceMatrix.needsUpdate = true;
    for (const m of [mat, busMat]) { m.userData.uniforms.uLamps.value = level; m.userData.uniforms.uFlash.value.set(blink ? 1 : 0, blink ? 0 : 1); }
  }
  return { object: group, update, dispose() { disposeObject(group); }, info: () => ({ meshes: Object.keys(meshes).length }) };
}

// ------------------------------------------------------------------ showroom
// Rows, front to back: bicycles, scooters, cars, taxis + police + vans, buses; a stand-in
// person (4.3 tall) stands at the start of each row.
export function preview(ctx) {
  const v = createVehicles({ quality: ctx.quality }), world = ctx.world;
  const site = world.siteList.find(s => s.id === 'c-sports') || world.siteList[0];
  const cx = site.area.x, cz = site.area.z;
  const list = [], fig = new PropBuilder(), x0 = cx - 40;
  // [kind, count, spacing, start x offset, row z offset, colours]
  const rows = [['bicycle', 6, 5, 0, -30, BIKE_COLORS], ['scooter', 6, 5, 0, -22, SCOOTER_COLORS], ['car', 6, 12, 0, -12, CAR_COLORS],
    ['taxi', 2, 12, 0, 0], ['police', 2, 12, 30, 0], ['van', 2, 12, 60, 0], ['bus', 4, 17, 0, 14]];
  for (const [kind, n, gap, off, dz, colors] of rows) {
    for (let i = 0; i < n; i++) list.push({ id: kind + (i * 5 + 1), kind, x: x0 + off + i * gap, y: 0.15, z: cz + dz, heading: 0, color: colors ? colors[i % colors.length] : undefined, line: LINES[i % 4][0] });
    if (!off) scaleFigure(fig, x0 - 6, cz + dz, '#d9734e');
  }
  const figMesh = new THREE.Mesh(fig.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
  figMesh.position.y = 0.15; figMesh.castShadow = true;
  const group = new THREE.Group(); group.add(v.object, figMesh);
  return { group, update(frame) { v.update(list, frame); } };
}
