// The helipad on the roof of the `helipad` site and the president's helicopter.
// The deck is static; the helicopter is one group moved by helicopterAt() each frame,
// with the rotors and the windsock turning as transforms (no geometry is rebuilt).

import * as THREE from 'three';
import { helicopterAt, PAD } from '../../core/world/helicopter.js';
import { ShapeBuilder, material } from '../kit.js';
import { Glows, beam, mesh, litMaterial, setLevel, pointScale, moduleBase, lightSource, smoothstep } from './common.js';

const C = {
  deck: '#46504d', plinth: '#b9b4aa', rail: '#e6e0d2', yellow: '#f0c03a', white: '#f4f1ea', navy: '#1f3a5f', gold: '#d4a63a',
  glass: '#26485c', red: '#d6403a', blade: '#2f3439', tip: '#f0c03a', sockA: '#f08a2c', sockB: '#fbf6ea'
};
const EDGE_LIGHT = '#8fd0ff';

// ------------------------------------------------------------------ the deck
function buildDeck(pad, heading) {
  const sb = new ShapeBuilder(), lit = new ShapeBuilder(), glows = new Glows();
  const half = PAD.size / 2, top = pad.rise;
  // Raised deck with a slightly wider plinth, so it reads as a pad and not a painted roof.
  sb.block(0, 0, 0, PAD.size + 2, 0.5, PAD.size + 2, C.plinth);
  sb.block(0, 0.5, 0, PAD.size, top - 0.5, PAD.size, C.deck);
  // Painted marks, flat just above the deck.
  const paint = (w, d, x, z, color) => sb.block(x, top, z, w, 0.06, d, color);
  const inset = 1.0, band = 0.7, e = half - inset;
  paint(2 * e, band, 0, -e, C.yellow); paint(2 * e, band, 0, e, C.yellow);
  paint(band, 2 * e - band, -e, 0, C.yellow); paint(band, 2 * e - band, e, 0, C.yellow);
  sb.add(new THREE.RingGeometry(8.6, 9.5, 40), sb.transform(0, top + 0.09, 0, [-Math.PI / 2, 0, 0]), C.white);
  // The H: bars run along the helicopter's heading so the nose points up the H.
  const c = Math.cos(heading), s = Math.sin(heading);
  const bar = (along, across, length, width) => {
    // along/across in the heading frame → world x/z
    sb.block(along * c - across * s, top + 0.1, along * s + across * c, length, 0.06, width, C.white, -heading);
  };
  bar(0, -2.6, 7.2, 1.1); bar(0, 2.6, 7.2, 1.1); bar(0, 0, 1.1, 5.2);
  // Walkway edge rail: posts and two rails.
  const rail = half + 0.6;
  for (let i = -4; i <= 4; i++) {
    const t = (i / 4) * rail;
    for (const [x, z] of [[t, -rail], [t, rail], [-rail, t], [rail, t]]) sb.block(x, 0.5, z, 0.22, 1.0, 0.22, C.rail);
  }
  const rails = (a, b, y) => beam(sb, [a[0], y, a[1]], [b[0], y, b[1]], 0.1, C.rail, 4);
  for (const y of [1.0, 1.55]) {
    rails([-rail, -rail], [rail, -rail], y); rails([rail, -rail], [rail, rail], y);
    rails([rail, rail], [-rail, rail], y); rails([-rail, rail], [-rail, -rail], y);
  }
  // Edge lights, a ring of small blue-white lamps just inside the border band.
  const lamp = half - 0.35, step = 3;
  for (let t = -half + 1.5; t <= half - 1.4; t += step) {
    for (const [x, z] of [[t, -lamp], [t, lamp], [-lamp, t], [lamp, t]]) {
      lit.block(x, top, z, 0.5, 0.35, 0.5, EDGE_LIGHT);
      glows.add(x, top + 0.5, z, EDGE_LIGHT, 2.4);
    }
  }
  for (const [x, z] of [[-lamp, -lamp], [lamp, -lamp], [-lamp, lamp], [lamp, lamp]]) { lit.block(x, top, z, 0.6, 0.45, 0.6, '#ff5a4a'); glows.add(x, top + 0.6, z, '#ff5a4a', 3); }
  return { sb, lit, glows };
}

// Windsock on a pole; the sock is its own small mesh so it can swing in the wind.
function buildWindsock() {
  const pole = new ShapeBuilder(), sock = new ShapeBuilder();
  pole.block(0, 0, 0, 1, 0.4, 1, C.plinth);
  pole.cylinder(0, 3.4, 0, 0.12, 0.18, 6.4, C.rail, 6);
  pole.sphere(0, 6.7, 0, 0.25, C.red, 8, 6);
  // Five tapering rings, orange and white, lying along +x from the pole top.
  const rings = 5;
  for (let i = 0; i < rings; i++) {
    const r0 = 0.62 - i * 0.09, r1 = r0 - 0.09;
    sock.add(new THREE.CylinderGeometry(r1, r0, 0.72, 8, 1, true), sock.transform(0.5 + i * 0.7, 0, 0, [0, 0, Math.PI / 2]), i % 2 ? C.sockB : C.sockA);
  }
  return { pole, sock };
}

// ------------------------------------------------------------------ the helicopter
function buildHelicopter() {
  const body = new ShapeBuilder(), lit = new ShapeBuilder();
  const E = (x, y, z, rx, ry, rz, color, seg = [14, 10]) => body.sphere(x, y, z, 1, color, seg[0], seg[1], [rx, ry, rz]);
  // Cabin: a white egg with a navy belly and a gold waist stripe.
  E(0, 2.55, 0, 4.1, 1.95, 1.75, C.white);
  E(0.1, 1.55, 0, 3.7, 0.95, 1.62, C.navy);
  E(0, 2.2, 0, 4.09, 0.09, 1.77, C.gold, [14, 3]);
  // Windscreen and side windows.
  E(2.7, 2.75, 0, 1.75, 1.3, 1.42, C.glass, [12, 8]);
  for (const side of [-1, 1]) {
    body.box(0.2, 2.85, side * 1.58, 2.8, 0.85, 0.12, C.glass);
    body.box(-2.15, 2.85, side * 1.4, 1.1, 0.7, 0.12, C.glass);
    body.box(-0.5, 2.85, side * 1.62, 0.16, 0.85, 0.12, C.white);
  }
  // Engine hump under the rotor and the tail boom.
  E(-0.9, 4.2, 0, 2.3, 0.85, 1.1, C.white, [10, 7]);
  body.add(new THREE.ConeGeometry(0.85, 8.2, 8), body.transform(-7.4, 3.1, 0, [0, 0, Math.PI / 2]), C.white);
  body.add(new THREE.ConeGeometry(0.62, 3.2, 8), body.transform(-5.0, 3.1, 0, [0, 0, Math.PI / 2]), C.navy);
  // Tail fin with the presidential patch, and the stabiliser.
  body.add(new THREE.BoxGeometry(1.7, 3.0, 0.22), body.transform(-11.0, 4.3, 0, [0, 0, -0.38]), C.navy);
  for (const side of [-1, 1]) {
    body.box(-11.15, 4.6, side * 0.13, 0.9, 0.9, 0.05, C.white);
    body.box(-11.15, 4.6, side * 0.15, 0.5, 0.5, 0.04, C.red);
  }
  body.box(-9.7, 3.05, 0, 1.5, 0.14, 3.2, C.white);
  for (const side of [-1, 1]) body.box(-9.7, 3.05, side * 1.6, 1.5, 0.5, 0.14, C.navy);
  // Skids and struts.
  for (const side of [-1, 1]) {
    body.cylinder(0.1, 0.18, side * 1.45, 0.14, 0.14, 7.4, C.blade, 6, [0, 0, Math.PI / 2]);
    body.cylinder(3.9, 0.45, side * 1.45, 0.14, 0.14, 1.0, C.blade, 6, [0, 0, -0.9]);
    beam(body, [1.7, 0.2, side * 1.45], [1.3, 1.5, side * 1.1], 0.12, C.blade);
    beam(body, [-1.9, 0.2, side * 1.45], [-1.4, 1.5, side * 1.1], 0.12, C.blade);
  }
  // Mast and hub.
  body.cylinder(0, 5.2, 0, 0.22, 0.3, 0.9, C.blade, 8);
  // Lights: red/green navigation, red beacon on the fin, white strobe on the belly.
  lit.sphere(0.4, 2.2, -1.72, 0.2, '#ff3b30', 6, 5); lit.sphere(0.4, 2.2, 1.72, 0.2, '#3bdc6a', 6, 5);
  const group = new THREE.Group();
  const bodyMesh = mesh(body.build(), material({ roughness: 0.55, metalness: 0.1 }), { shadow: true, isStatic: false });
  const litMesh = mesh(lit.build(), litMaterial(), { isStatic: false });
  group.add(bodyMesh, litMesh);

  // Main rotor: four blades with yellow tips, turning about the mast.
  const rot = new ShapeBuilder();
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    const bx = Math.cos(a), bz = Math.sin(a);
    rot.add(new THREE.BoxGeometry(7.0, 0.1, 0.62), rot.transform(bx * 4.1, 0, -bz * 4.1, [0, a, 0]), C.blade);
    rot.add(new THREE.BoxGeometry(0.9, 0.11, 0.63), rot.transform(bx * 7.15, 0, -bz * 7.15, [0, a, 0]), C.tip);
  }
  rot.cylinder(0, 0, 0, 0.6, 0.6, 0.35, C.blade, 8);
  const rotorGroup = new THREE.Group();
  rotorGroup.position.set(0, 5.75, 0);
  rotorGroup.add(mesh(rot.build(), material({ roughness: 0.6 }), { shadow: true, isStatic: false }));
  const discMaterial = new THREE.MeshBasicMaterial({ color: '#cfd6dc', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(7.6, 28), discMaterial);
  disc.rotation.x = -Math.PI / 2; disc.position.y = 5.75;
  group.add(rotorGroup, disc);

  // Tail rotor.
  const tail = new ShapeBuilder();
  tail.box(0, 0, 0, 0.12, 2.2, 0.28, C.blade); tail.box(0, 0, 0, 0.12, 0.28, 2.2, C.blade);
  const tailRotor = new THREE.Group();
  tailRotor.position.set(-11.4, 4.3, 0.5);
  tailRotor.add(mesh(tail.build(), material({ roughness: 0.6 }), { isStatic: false }));
  group.add(tailRotor);

  // Beacon halos (local coordinates), blinking.
  const halo = new Glows();
  halo.add(-11.2, 5.9, 0, '#ff4a3a', 5).add(0.4, 2.2, -1.9, '#ff3b30', 2.6).add(0.4, 2.2, 1.9, '#3bdc6a', 2.6);
  halo.add(0.2, 0.5, 0, '#ffffff', 4.5);
  const haloPoints = halo.build();
  group.add(haloPoints);
  return { group, rotorGroup, disc, discMaterial, tailRotor, haloPoints, litMesh };
}

// ------------------------------------------------------------------ module
export function create({ world, quality = 'full' } = {}) {
  const base = moduleBase('helipad');
  const { group } = base;
  const site = world.siteList.find(s => s.helipad && s.roof);
  if (!site) return { group, update() {}, dispose: base.dispose, lights: [] };
  const roof = site.roof;
  const first = helicopterAt(world, 0);
  const root = new THREE.Group();
  root.position.set(roof.x, roof.y, roof.z);
  group.add(root);

  const deck = buildDeck(PAD, first.heading);
  const deckMesh = mesh(deck.sb.build(), material({ roughness: 0.9 }), { receive: true, shadow: true });
  const deckLitMaterial = litMaterial();
  const deckLit = mesh(deck.lit.build(), deckLitMaterial);
  const deckGlow = deck.glows.build({ opacity: 0.8 });
  root.add(deckMesh, deckLit, deckGlow);

  const ws = buildWindsock();
  const windsock = new THREE.Group();
  windsock.position.set(PAD.size / 2 + 0.2 + 0.0, PAD.rise, -PAD.size / 2 - 0.2);
  windsock.add(mesh(ws.pole.build(), material({ roughness: 0.8 }), { shadow: true }));
  const sockPivot = new THREE.Group();
  sockPivot.position.set(0, 6.7, 0);
  const sockMaterial = material({ roughness: 0.9, side: THREE.DoubleSide });
  sockPivot.add(mesh(ws.sock.build(), sockMaterial, { isStatic: false }));
  windsock.add(sockPivot);
  root.add(windsock);

  const heli = buildHelicopter();
  // The helicopter's y is the point under its skids, in world space.
  group.add(heli.group);
  heli.group.rotation.order = 'YZX';

  const lights = [];
  const cx = roof.x, cz = roof.z, top = roof.y + PAD.rise;
  for (const [dx, dz] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) lights.push(lightSource(cx + dx, top + 1, cz + dz, 9, '#8fd0ff', 0.55, 'sign', 'helipad'));

  const state = { last: null };
  function update(frame) {
    const night = frame.lamps;
    setLevel(deckLitMaterial, night, 0.35);
    deckGlow.userData.level(night);
    deckGlow.material.uniforms.scale.value = pointScale(frame, 1);
    heli.haloPoints.material.uniforms.scale.value = pointScale(frame, 1);
    const h = helicopterAt(world, frame.daySeconds);
    // Wind: a slow drift and flutter; the sock streams away from it.
    const wind = 0.9 + 0.5 * Math.sin(frame.time * 0.11) + 0.12 * Math.sin(frame.time * 0.7);
    sockPivot.rotation.set(0, wind, 0.18 + 0.1 * Math.sin(frame.time * 1.9));
    if (!h) return;
    heli.group.position.set(h.x, h.y, h.z);
    heli.group.rotation.set(-h.bank, -h.heading, h.pitch);
    heli.rotorGroup.rotation.y = -h.rotor;
    heli.tailRotor.rotation.z = h.rotor * 4.3;
    heli.discMaterial.opacity = 0.2 * smoothstep(0.55, 1, h.spin);
    // Beacon: a double blink in the dark, and by day only when the rotors turn.
    const beat = frame.time % 1.3;
    const blink = beat < 0.1 || (beat > 0.25 && beat < 0.33) ? 1 : 0.15;
    const on = h.phase === 'parked' ? 0 : 1;
    heli.haloPoints.userData.level(Math.max(on * blink, 0) * (0.5 + 0.5 * night) + (h.phase === 'parked' ? 0.0 : 0));
    heli.litMesh.material.color.setScalar(0.4 + 0.6 * (on ? blink : 0.3));
    state.last = h;
  }
  return { group, update, dispose: base.dispose, lights, info: () => ({ phase: state.last && state.last.phase }) };
}

export function preview(ctx) {
  const m = create({ world: ctx.world, quality: ctx.quality });
  return m;
}
