// 小鎮航空's regional turboprop: white, high wing, two engines with four-blade propellers,
// T-tail, a teal and orange cheat line, the airline's name and the registration on the
// fuselage. Forward is +x, up +y, right wing +z; the origin is on the ground under the
// wheels. A plane is a few meshes moved by transforms: the body (static geometry), the
// livery decal (cabin windows, name, registration), the gear (scaled to fold), two
// propellers (spun) and a handful of light points (colours rewritten each frame).

import * as THREE from 'three';
import { ShapeBuilder, material } from '../kit.js';
import { Glows, mesh, pointScale } from './common.js';

const C = {
  white: '#f4f2eb', grey: '#d3d7d9', dark: '#2b3036', teal: '#2f8f88', orange: '#ee8a2e', glass: '#1d3446',
  metal: '#8c949b', tyre: '#25282c', tip: '#f0c03a', red: '#d6403a', green: '#2fb765'
};
const R = 1.8, AXIS_Y = 3.0;               // fuselage radius and height of its axis
const X0 = -6.0, X1 = 4.2;                 // cylindrical part of the fuselage
const ENGINE = { x: 3.8, y: 4.0, z: 5.2, r: 0.82 };
const GEAR_PIVOT = 3.6;
const SPIN_RATE = 24;                      // radians per second at full power
const DECAL_ANGLES = [-0.32, 0.72];

// A swept slab: the outline is in (a, b) and is extruded `depth` along the third axis.
function slab(sb, outline, depth, matrix, color) {
  const shape = new THREE.Shape();
  outline.forEach(([a, b], i) => (i ? shape.lineTo(a, b) : shape.moveTo(a, b)));
  shape.closePath();
  sb.add(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }), matrix, color);
}

// ------------------------------------------------------------------ the shared geometry
export function planeGeometry() {
  const sb = new ShapeBuilder();
  const E = (x, y, z, rx, ry, rz, color, seg = [14, 10]) => sb.sphere(x, y, z, 1, color, seg[0], seg[1], [rx, ry, rz]);
  // Fuselage: cabin tube, rounded nose, tapering tail.
  sb.cylinder((X0 + X1) / 2, AXIS_Y, 0, R, R, X1 - X0, C.white, 14, [0, 0, Math.PI / 2]);
  E(X1, AXIS_Y, 0, 3.8, R, R, C.white, [14, 10]);
  sb.cylinder((X0 - 5.8 / 2), AXIS_Y, 0, 0.35, R, 5.8, C.white, 14, [0, 0, Math.PI / 2]);
  // Nose tip and the cockpit windscreen.
  E(7.7, AXIS_Y, 0, 0.5, 0.62, 0.62, C.dark, [8, 6]);
  E(5.7, 3.92, 0, 1.3, 0.74, 1.55, C.glass, [10, 7]);
  // Wing on top of the fuselage, tapering; the tips carry the navigation lenses.
  slab(sb, [[3.0, -5.2], [2.6, -12], [0.3, -12], [-0.7, -5.2], [-0.7, 5.2], [0.3, 12], [2.6, 12], [3.0, 5.2]], 0.4, sb.transform(0, 4.75, 0, [-Math.PI / 2, 0, 0]), C.white);
  for (const s of [-1, 1]) {
    sb.box(1.45, 4.95, s * 11.88, 2.7, 0.5, 0.36, C.teal);
    sb.sphere(1.45, 4.95, s * 12.1, 0.26, s < 0 ? C.red : C.green, 6, 5);
    // Engine nacelle, cowling ring, gear housing underneath.
    const { x, y, z, r } = ENGINE;
    sb.cylinder(x / 2 - 1.1, y, s * z, r, r, x + 2.0, C.white, 10, [0, 0, Math.PI / 2]);
    sb.sphere(x, y, s * z, r, C.white, 10, 7, [0.9, 1, 1]);
    sb.cylinder(x - 0.5, y, s * z, r + 0.05, r + 0.05, 0.55, C.teal, 10, [0, 0, Math.PI / 2]);
    sb.box(-1.0, y - 0.7, s * z, 3.2, 0.5, 1.0, C.grey);
  }
  // T-tail: fin with an orange band, and the swept tailplane on top.
  slab(sb, [[-6.2, 4.3], [-9.0, 6.4], [-11.4, 6.4], [-11.5, 3.2], [-8.0, 3.2]], 0.3, sb.transform(0, 0, -0.15), C.teal);
  slab(sb, [[-8.0, 5.0], [-11.45, 5.0], [-11.45, 5.8], [-9.2, 5.8]], 0.42, sb.transform(0, 0, -0.21), C.orange);
  slab(sb, [[-9.0, -1.2], [-10.0, -4.4], [-11.5, -4.4], [-11.5, 4.4], [-10.0, 4.4], [-9.0, 1.2]], 0.25, sb.transform(0, 6.3, 0, [-Math.PI / 2, 0, 0]), C.white);
  sb.box(-10.6, 6.7, 0, 0.5, 0.3, 0.5, C.dark);
  return sb.build();
}

// Wheels and legs, built so the pivot (y = 0) is where the legs meet the plane: the group
// is lifted to GEAR_PIVOT and scaled in y to fold.
export function gearGeometry() {
  const sb = new ShapeBuilder(), y0 = -GEAR_PIVOT;
  const wheel = (x, z, r, w) => sb.cylinder(x, y0 + r, z, r, r, w, C.tyre, 10, [Math.PI / 2, 0, 0]);
  for (const s of [-1, 1]) {
    const z = s * ENGINE.z;
    sb.cylinder(0.9, y0 + 1.9, z, 0.14, 0.18, GEAR_PIVOT - 0.6, C.metal, 6);
    wheel(0.9, z - 0.3, 0.6, 0.38); wheel(0.9, z + 0.3, 0.6, 0.38);
    sb.box(0.9, y0 + 0.6, z, 0.2, 0.2, 0.9, C.metal);
  }
  sb.cylinder(6.0, y0 + 1.9, 0, 0.12, 0.15, GEAR_PIVOT - 0.5, C.metal, 6);
  wheel(6.0, -0.25, 0.5, 0.32); wheel(6.0, 0.25, 0.5, 0.32);
  return sb.build();
}

// One propeller (at the origin, turning about x): hub, spinner, four blades with yellow tips.
export function propGeometry() {
  const sb = new ShapeBuilder();
  sb.cone(0.5, 0, 0, 0.5, 1.0, C.dark, 8, [0, 0, -Math.PI / 2]);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + 0.3, c = Math.cos(a), s = Math.sin(a);
    sb.box(0.05, 1.42 * c, 1.42 * s, 0.1, 2.1, 0.4, C.dark, [a, 0.4, 0]);
    sb.box(0.05, 2.5 * c, 2.5 * s, 0.22, 0.46, 0.58, C.tip, [a, 0.4, 0]);
  }
  return sb.build();
}

// ------------------------------------------------------------------ the livery decal
// A strip wrapped round the cabin on each side, so the name reads left to right from both.
function liveryTextures(reg, name, airline) {
  const L = X1 - X0, w = Math.round(L * 112), h = 224;
  const paint = windowsOnly => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (windowsOnly) { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); }
    const win = windowsOnly ? '#ffffff' : '#1d3446';
    g.fillStyle = win;
    for (let i = 0; i < 9; i++) { g.beginPath(); g.roundRect(118 + i * 99, 40, 54, 38, 10); g.fill(); }
    // The cockpit door window and the cabin door.
    g.beginPath(); g.roundRect(1062, 38, 46, 42, 10); g.fill();
    if (!windowsOnly) {
      g.fillStyle = C.teal; g.fillRect(0, 170, w, 20);
      g.fillStyle = C.orange; g.fillRect(0, 194, w, 9);
      g.textBaseline = 'middle';
      g.font = '700 70px "Noto Sans TC","Microsoft JhengHei","PingFang TC",sans-serif';
      const cn = airline, cw = g.measureText(cn).width;
      g.font = '700 34px "Noto Sans TC","Microsoft JhengHei",sans-serif';
      const en = 'TOWN AIRLINES', ew = g.measureText(en).width, total = cw + 20 + ew, x0 = 560 - total / 2;
      g.font = '700 70px "Noto Sans TC","Microsoft JhengHei","PingFang TC",sans-serif';
      g.fillStyle = C.teal; g.textAlign = 'left'; g.fillText(cn, x0, 126);
      g.font = '700 34px "Noto Sans TC","Microsoft JhengHei",sans-serif';
      g.fillStyle = C.orange; g.fillText(en, x0 + cw + 20, 132);
      g.font = '700 40px "Noto Sans TC","Microsoft JhengHei",sans-serif';
      g.fillStyle = '#4a5258'; g.fillText(reg, 24, 128);
      g.font = '700 30px "Noto Sans TC","Microsoft JhengHei",sans-serif';
      g.fillStyle = C.teal; g.fillText(name, 880, 130);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  };
  return { map: paint(false), glow: paint(true) };
}

function decalGeometry() {
  const steps = 8, pos = [], nor = [], uv = [], idx = [];
  const [a0, a1] = DECAL_ANGLES, r = R + 0.06;
  for (const side of [-1, 1]) {
    const base = pos.length / 3;
    for (const x of [X0, X1]) for (let k = 0; k <= steps; k++) {
      const a = a0 + (a1 - a0) * k / steps;
      pos.push(x, AXIS_Y + r * Math.sin(a), side * r * Math.cos(a));
      nor.push(0, Math.sin(a), side * Math.cos(a));
      const u = (x - X0) / (X1 - X0);
      uv.push(side > 0 ? u : 1 - u, k / steps);
    }
    for (let k = 0; k < steps; k++) {
      const a = base + k, b = base + k + 1, c = base + steps + 1 + k, d = base + steps + 2 + k;
      if (side > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------ lights (points)
const LIGHTS = [
  // [x, y, z, colour, size, kind]
  [1.45, 5.0, -12.35, '#ff2a20', 3.2, 'nav'], [1.45, 5.0, 12.35, '#2bff6a', 3.2, 'nav'], [-11.9, 3.3, 0, '#ffffff', 2.8, 'nav'],
  [-4.0, 5.1, 0, '#ff3b2e', 3.6, 'beacon'], [-1.0, 1.0, 0, '#ff3b2e', 3.6, 'beacon'],
  [0.2, 5.1, -12.3, '#ffffff', 5.5, 'strobe'], [0.2, 5.1, 12.3, '#ffffff', 5.5, 'strobe'], [-11.2, 6.85, 0, '#ffffff', 5.5, 'strobe'],
  [8.1, 2.8, 0, '#fff1c8', 12, 'landing'], [3.2, 4.6, -3.0, '#fff1c8', 7, 'landing'], [3.2, 4.6, 3.0, '#fff1c8', 7, 'landing']
];

// ------------------------------------------------------------------ a plane
// `shared` = { body, gear, prop } geometries from the functions above (built once).
export function createPlane({ id, name, airline }, shared) {
  const group = new THREE.Group();
  group.rotation.order = 'YZX';
  const body = mesh(shared.body, material({ roughness: 0.55, metalness: 0.08 }), { shadow: true, isStatic: false });
  group.add(body);

  const tex = liveryTextures(id, name, airline);
  const decalMaterial = new THREE.MeshStandardMaterial({ map: tex.map, emissiveMap: tex.glow, emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0,
    transparent: true, depthWrite: false, roughness: 0.6, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const decal = new THREE.Mesh(shared.decal, decalMaterial);
  group.add(decal);

  const gear = mesh(shared.gear, material({ roughness: 0.7, metalness: 0.2 }), { shadow: true, isStatic: false });
  const gearGroup = new THREE.Group();
  gearGroup.position.y = GEAR_PIVOT;
  gearGroup.add(gear);
  group.add(gearGroup);

  const props = [-1, 1].map(s => {
    const holder = new THREE.Group();
    holder.position.set(ENGINE.x + ENGINE.r * 0.9 - 0.05, ENGINE.y, s * ENGINE.z);
    holder.add(mesh(shared.prop, material({ roughness: 0.5 }), { shadow: true, isStatic: false }));
    group.add(holder);
    return holder;
  });

  const glows = new Glows();
  for (const [x, y, z, color, size] of LIGHTS) glows.add(x, y, z, color, size);
  const points = glows.build();
  points.userData.level(1);
  group.add(points);
  const colors = points.geometry.attributes.color, base = Float32Array.from(colors.array);

  let angle = 0;
  const kinds = LIGHTS.map(l => l[5]);
  function update(pose, frame, offset = 0) {
    group.visible = !pose.away;
    if (pose.away) return;
    const night = frame.lamps;
    group.position.set(pose.x, pose.y + 0.4, pose.z);
    group.rotation.set(pose.bank, -pose.heading, pose.pitch);
    gearGroup.scale.y = Math.max(0.001, pose.gear);
    gearGroup.visible = pose.gear > 0.04;
    angle += frame.dt * SPIN_RATE * pose.spin;
    props[0].rotation.x = angle; props[1].rotation.x = angle + 0.7;
    // Cabin lit while the plane is in service at dusk and night.
    decalMaterial.emissiveIntensity = pose.phase === 'parked' ? 0 : 0.9 * Math.min(1, night * 1.4 + 0.1);
    // Lights: steady navigation, flashing beacon and strobes, landing lights when asked.
    const t = frame.time + offset, boost = 0.4 + 0.6 * night;
    const beat = t % 1.3, strobe = beat < 0.08 || (beat > 0.2 && beat < 0.28) ? 1 : 0;
    const beacon = Math.max(0, Math.sin(t * 5.2)) ** 4;
    const L = pose.lights;
    const arr = colors.array;
    for (let i = 0; i < kinds.length; i++) {
      const k = kinds[i];
      const v = k === 'nav' ? L.nav : k === 'beacon' ? L.beacon * beacon : k === 'strobe' ? L.strobe * strobe : L.landing * 0.85;
      const lv = v * boost;
      arr[i * 3] = base[i * 3] * lv; arr[i * 3 + 1] = base[i * 3 + 1] * lv; arr[i * 3 + 2] = base[i * 3 + 2] * lv;
    }
    colors.needsUpdate = true;
    points.material.uniforms.scale.value = pointScale(frame, 1);
  }
  return { group, update, decalMaterial, textures: tex };
}

export function sharedGeometry() {
  return { body: planeGeometry(), gear: gearGeometry(), prop: propGeometry(), decal: decalGeometry() };
}
