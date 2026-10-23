// A neon advertising airship circling slowly high over the town, lit at night, with
// 彥彥的小鎮 / By 彥彥 on both flanks. Its place is a pure function of the clock.

import * as THREE from 'three';
import { ShapeBuilder, material } from '../kit.js';
import { Glows, mesh, litMaterial, pointScale, moduleBase, beam } from './common.js';

// Where and how it flies (town units, real seconds).
const FLIGHT = { height: 232, bob: 5, lap: 200, radiusX: 0.7, radiusZ: 0.74, phase: 0.9 };
// The envelope is an ellipsoid with these half lengths: along, up, across.
const ENV = { a: 34, b: 11.5, c: 12 };

const TEAL = '#2f8a90', IVORY = '#f3eee2', CORAL = '#ec6a5a', NAVY = '#1d2b45';

function envelope() {
  const g = new THREE.SphereGeometry(1, 56, 34);
  g.scale(ENV.a, ENV.b, ENV.c);
  g.computeVertexNormals();
  // Ivory on top shading to teal underneath, by height, as a vertex colour.
  const pos = g.attributes.position, colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color(IVORY), bottom = new THREE.Color(TEAL), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / ENV.b;
    c.copy(bottom).lerp(top, THREE.MathUtils.smoothstep(y, -0.55, 0.15));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

// A curved banner lying just off the envelope's flank, u along the length, v up.
function banner(side) {
  const nx = 22, ny = 6, halfLen = 20.5, halfHigh = 5.5;
  const pos = [], uv = [], index = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = -halfLen + (2 * halfLen * i) / nx, y = -halfHigh + (2 * halfHigh * j) / ny;
      const k = 1 - (x / ENV.a) ** 2 - (y / ENV.b) ** 2;
      pos.push(x, y - 0.2, side * (ENV.c * Math.sqrt(Math.max(k, 0.01)) + 0.4));
      uv.push(side > 0 ? i / nx : 1 - i / nx, j / ny);
    }
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    if (side > 0) index.push(a, b, d, a, d, c); else index.push(a, d, b, a, c, d);
  }
  return { pos, uv, index };
}

function bannerGeometry() {
  const pos = [], uv = [], index = [];
  for (const side of [1, -1]) {
    const b = banner(side), off = pos.length / 3;
    pos.push(...b.pos); uv.push(...b.uv); index.push(...b.index.map(i => i + off));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

// The neon sign: dark glass, glowing text with a halo.
function bannerTexture() {
  const w = 1536, h = 470, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#171d3c'); bg.addColorStop(1, '#0d1226');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#3ee0d0'; g.lineWidth = 7; g.shadowColor = '#3ee0d0'; g.shadowBlur = 16;
  g.strokeRect(14, 14, w - 28, h - 28);
  g.shadowBlur = 0;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const font = '900 218px "Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif';
  g.font = font;
  g.shadowColor = '#ff4fa3'; g.shadowBlur = 38; g.fillStyle = '#ff6fb6'; g.fillText('彥彥的小鎮', w * 0.5, h * 0.4);
  g.shadowBlur = 14; g.fillStyle = '#ffe4f2'; g.fillText('彥彥的小鎮', w * 0.5, h * 0.4);
  g.font = '800 104px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  g.shadowColor = '#3ee0d0'; g.shadowBlur = 28; g.fillStyle = '#6ff2e4'; g.fillText('By 彥彥', w * 0.5, h * 0.79);
  g.shadowBlur = 8; g.fillStyle = '#e6fffb'; g.fillText('By 彥彥', w * 0.5, h * 0.79);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function fittings() {
  const sb = new ShapeBuilder();
  // Tail: four swept fins in a cross, coral and teal alternating.
  const shape = new THREE.Shape();
  shape.moveTo(-17, 3); shape.lineTo(-36.5, 3); shape.lineTo(-36.5, 14.5); shape.lineTo(-31.5, 14.5); shape.closePath();
  for (let k = 0; k < 4; k++) {
    const fin = new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: false });
    fin.translate(0, 0, -0.4);
    sb.add(fin, new THREE.Matrix4().makeRotationX(k * Math.PI / 2 + Math.PI / 4), k % 2 ? TEAL : CORAL);
  }
  // Gondola under the belly: cabin, windows, nose glass and two engine pods.
  sb.block(2, -ENV.b - 4.9, 0, 12, 3.2, 4.6, '#f6f1e6');
  sb.block(2, -ENV.b - 4.9 + 2.4, 0, 12.2, 0.5, 4.8, CORAL);
  sb.sphere(8, -ENV.b - 3.3, 0, 2.4, '#2a4258', 10, 7, [1, 0.7, 0.95]);
  for (const s of [-1, 1]) {
    sb.block(1.5, -ENV.b - 3.8, s * 2.35, 7.6, 1.3, 0.12, '#26485c');
    sb.block(-1, -ENV.b - 3.0, s * 8.0, 4.2, 1.7, 1.7, '#e8e2d4');
    sb.sphere(-3.1, -ENV.b - 2.15, s * 8.0, 0.9, '#e8e2d4', 8, 6);
    beam(sb, [-1, -ENV.b - 2.1, s * 8], [1, -ENV.b + 0.6, s * 5.8], 0.25, '#555d66');
    beam(sb, [-1, -ENV.b - 2.1, s * 8], [-1, -ENV.b - 5.0, s * 2.6], 0.25, '#555d66');
  }
  for (const dx of [-3, 7]) for (const s of [-1, 1]) beam(sb, [dx, -ENV.b - 3.3, s * 1.5], [dx * 0.8, -ENV.b + 1.2, s * 3.2], 0.16, '#555d66');
  return sb.build();
}

function propellers() {
  const sb = new ShapeBuilder();
  sb.box(0, 0, 0, 0.3, 4.6, 0.5, NAVY); sb.box(0, 0, 0, 0.3, 0.5, 4.6, NAVY);
  sb.sphere(0, 0, 0, 0.45, CORAL, 6, 5);
  return sb.build();
}

export function create({ world } = {}) {
  const base = moduleBase('airship');
  const { group } = base;
  const root = new THREE.Group();
  root.rotation.order = 'YZX';
  group.add(root);

  const envMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, emissive: '#7f93b8', emissiveIntensity: 0 });
  root.add(mesh(envelope(), envMaterial, { shadow: false, isStatic: false }));
  root.add(mesh(fittings(), material({ roughness: 0.7 }), { isStatic: false }));
  const bannerMaterial = new THREE.MeshBasicMaterial({ map: bannerTexture(), color: '#a8a8b8', side: THREE.DoubleSide });
  root.add(new THREE.Mesh(bannerGeometry(), bannerMaterial));
  const props = [];
  for (const s of [-1, 1]) {
    const p = new THREE.Group();
    p.position.set(-3.5, -ENV.b - 2.15, s * 8.0);
    p.add(mesh(propellers(), material({ roughness: 0.6 }), { isStatic: false }));
    p.rotation.y = Math.PI / 2;
    root.add(p); props.push(p);
  }
  // Rotate propellers about x (their axis): the geometry lies in the y-z plane.
  for (const p of props) p.rotation.y = 0;

  // Neon halos: pink and cyan along the banner frame and the belly, nav lights.
  const glows = new Glows();
  const frame = [[-21, -6.4], [21, -6.4]];
  void frame;
  for (const side of [-1, 1]) {
    for (let i = 0; i <= 14; i++) {
      const x = -20 + i * (40 / 14);
      for (const y of [-5.7, 5.3]) {
        const k = 1 - (x / ENV.a) ** 2 - (y / ENV.b) ** 2;
        glows.add(x, y - 0.2, side * (ENV.c * Math.sqrt(Math.max(k, 0.01)) + 0.9), i % 2 ? '#ff5fae' : '#3ee0d0', 3.2);
      }
    }
  }
  glows.add(ENV.a - 1, 0, 0, '#ffffff', 4).add(-ENV.a + 1, 1, 0, '#ff3b30', 3.6);
  glows.add(-3, -ENV.b - 3, 8, '#3bdc6a', 2.4).add(-3, -ENV.b - 3, -8, '#ff3b30', 2.4);
  for (let i = 0; i < 10; i++) glows.add(-9 + i * 2.4, -ENV.b - 6.6, 0, '#ffd27a', 2);
  const glowPoints = glows.build({ opacity: 0.85 });
  root.add(glowPoints);

  const state = { pos: { x: 0, y: FLIGHT.height, z: 0 } };
  function update(frame) {
    const night = frame.lamps;
    bannerMaterial.color.setScalar(0.62 + 0.38 * night);
    glowPoints.userData.level(night);
    envMaterial.emissiveIntensity = 0.16 * night;
    glowPoints.material.uniforms.scale.value = pointScale(frame, 1);
    const w = world.board;
    const th = (frame.daySeconds / FLIGHT.lap) * Math.PI * 2 + FLIGHT.phase;
    const rx = w.halfX * FLIGHT.radiusX, rz = w.halfZ * FLIGHT.radiusZ;
    const x = Math.cos(th) * rx, z = Math.sin(th) * rz;
    const vx = -Math.sin(th) * rx, vz = Math.cos(th) * rz;
    const y = FLIGHT.height + Math.sin(th * 3 + 1) * FLIGHT.bob;
    root.position.set(x, y, z);
    root.rotation.set(0.04 * Math.sin(th * 5), -Math.atan2(vz, vx), 0.03 * Math.cos(th * 3));
    for (const p of props) p.rotation.x = frame.time * 18;
    state.pos = { x, y, z };
  }
  return { group, update, dispose: base.dispose, lights: [], info: () => state.pos };
}

export function preview(ctx) { return create({ world: ctx.world }); }
void litMaterial;
