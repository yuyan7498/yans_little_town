// Preview of the scene module on its own page, src/render/scene/preview.html: the
// massing model on a stand-in ground with ~600 stand-in night lights (street lamps on
// both kerbs every 22 units, promenade lamps, door and facade lights, signs, the night
// market), to judge day, dusk and night and to measure the cost.
//
//   preview.html?minute=1290&day=1&quality=lite
//     &view=town|street|close|wide|west|east|south   camera preset (default wide)
//     &cam=x,y,z,yaw,pitch,distance            explicit camera
//     &speed=0       town seconds per real second (0 freezes time; 96 is real pace)
//     &lights=0      without the night-light system   &extra=300  more stand-in lamps
//
// window.__bench({frames, lights}) renders frames back to back and returns ms per frame.
// preview(ctx) does the same inside tools/preview.html, on its own canvas.

import * as THREE from 'three';
import * as data from '../../core/data.js';
import { buildWorld } from '../../core/world/index.js';
import { toDaySeconds, format } from '../../core/clock.js';
import { makeFrame } from '../frame.js';
import { ShapeBuilder, material } from '../kit.js';
import * as massing from '../massing.js';
import { createView } from './index.js';

const LAMP_SPACING = 22;
const LAMP_HEIGHT = 9;

export async function previewPage({ canvas, info = null, params = new URLSearchParams(location.search), world = null } = {}) {
  const num = (k, d) => (params.has(k) ? Number(params.get(k)) : d);
  const quality = params.get('quality') === 'lite' ? 'lite' : 'full';
  world = world || buildWorld(data.town, data.buildings);

  const view = createView({ canvas, world, quality });
  view.add(massing.create({ world }));
  view.add(standInGround(world));
  const lamps = standInLights(world, num('extra', 0));
  view.add(lamps);
  if (params.get('lights') === '0') view.setNightLights(false);

  view.setCamera(cameraPreset(world, params));
  const fit = () => view.resize(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight);
  fit();
  addEventListener('resize', fit);
  orbitControls(canvas, view);

  let daySeconds = toDaySeconds(num('day', 1), num('minute', 600));
  const speed = num('speed', 0);
  let last = performance.now(), frames = 0;
  const start = last;
  const frameAt = (now, dt) => makeFrame({ daySeconds, time: (now - start) / 1000, dt, world, quality });

  const skyLoaded = view.ready;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    daySeconds += dt * speed;
    const frame = frameAt(now, dt);
    view.render(frame);
    frames++;
    if (info && frames % 10 === 1) {
      const i = view.info();
      info.textContent = `${format(frame.minute)} 第 ${frame.day} 天 · ${quality} · ${i.calls} draw calls · ${(i.triangles / 1000).toFixed(0)}k 三角形 · ${i.frameMs} ms · ${i.lights} 盞燈`;
    }
  }
  requestAnimationFrame(loop);
  skyLoaded.then(() => {
    let n = 0;
    const wait = () => (++n >= 6 ? (window.__ready = true) : requestAnimationFrame(wait));
    requestAnimationFrame(wait);
  });

  // Back-to-back frames with a GPU sync at the end: relative cost of the parts.
  window.__bench = async ({ frames: count = 20, lights = true, shadows = true } = {}) => {
    view.setNightLights(lights);
    view.renderer.shadowMap.enabled = shadows;
    view.scene.traverse(o => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });
    const gl = view.renderer.getContext(), px = new Uint8Array(4);
    const now = performance.now();
    for (let i = 0; i < 3; i++) view.render(frameAt(now, 0)); // compile and warm up
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const t0 = performance.now();
    for (let i = 0; i < count; i++) view.render(frameAt(now + i, 0));
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const ms = (performance.now() - t0) / count;
    const i = view.info();
    view.setNightLights(params.get('lights') !== '0');
    view.renderer.shadowMap.enabled = true;
    view.scene.traverse(o => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });
    return { ms: +ms.toFixed(2), lights, shadows, calls: i.calls, triangles: i.triangles, nightLights: i.lights, glows: i.glows };
  };
  window.view = view;
  return view;
}

// For tools/preview.html: hide the harness canvas and run the page on a canvas of our own.
export function preview(ctx) {
  ctx.renderer.domElement.style.display = 'none';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block';
  document.body.prepend(canvas);
  previewPage({ canvas, world: ctx.world, info: document.getElementById('info') });
  return {};
}

// ---------------------------------------------------------------- camera
function cameraPreset(world, params) {
  if (params.has('cam')) {
    const [x, y, z, yaw, pitch, distance] = params.get('cam').split(',').map(Number);
    return { x, y, z, yaw, pitch, distance };
  }
  const j = world.junctions.find(k => k.avenue === 'trunk-e' && k.street === 'center') || world.junctions[0];
  const presets = {
    town: { x: 0, y: 0, z: 0, yaw: 0.5, pitch: 0.78, distance: 1050 },
    wide: { x: 0, y: 30, z: 20, yaw: 0.5, pitch: 0.16, distance: 560 },
    street: { x: j.x - 30, y: 0, z: j.z + 10, yaw: 0.75, pitch: 0.42, distance: 190 },
    close: { x: j.x - 12, y: 2, z: j.z + 12, yaw: 0.9, pitch: 0.28, distance: 70 },
    west: { x: 0, y: 40, z: 0, yaw: Math.PI / 2 - 0.25, pitch: 0.08, distance: 520 },
    south: { x: 0, y: 40, z: 60, yaw: Math.PI, pitch: 0.08, distance: 520 },
    east: { x: 0, y: 40, z: 0, yaw: -Math.PI / 2 + 0.25, pitch: 0.08, distance: 520 }
  };
  return presets[params.get('view')] || presets.wide;
}

function orbitControls(canvas, view) {
  let drag = null;
  canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, pan: e.button !== 0 || e.shiftKey, c: { ...view.cameraState } }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y, c = drag.c;
    if (drag.pan) {
      const k = c.distance / 900, s = Math.sin(c.yaw), co = Math.cos(c.yaw);
      view.setCamera({ x: c.x - (co * dx + s * dy) * k, z: c.z - (-s * dx + co * dy) * k });
    } else view.setCamera({ yaw: c.yaw - dx * 0.006, pitch: Math.max(0.03, Math.min(1.55, c.pitch + dy * 0.005)) });
  });
  addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    view.setCamera({ distance: Math.max(8, Math.min(3000, view.cameraState.distance * Math.exp(e.deltaY * 0.0012))) });
  }, { passive: false });
}

// ---------------------------------------------------------------- stand-in ground
// Flat stand-ins: pavement-coloured board on both banks, roads, lots, the canal.
function standInGround(world) {
  const b = new ShapeBuilder(), B = world.board, river = world.river;
  const deep = 3;
  for (const [x0, x1] of [[B.minX, river.x0], [river.x1, B.maxX]]) b.box((x0 + x1) / 2, 0.15 - deep / 2, 0, x1 - x0, deep, B.maxZ - B.minZ, '#c9c2b5');
  b.box(0, -1.2 - 0.05, 0, river.x1 - river.x0, 0.1, B.maxZ - B.minZ, '#4f8fa0');
  for (const s of world.segments) {
    if (s.over === 'tunnel' || s.covered) continue;
    const w = s.axis === 'x' ? s.x1 - s.x0 : s.width, d = s.axis === 'z' ? s.z1 - s.z0 : s.width;
    const deck = s.over === 'bridge' ? 0.5 : 0.04;
    b.box((s.x0 + s.x1) / 2, 0.16 + (s.over === 'bridge' ? 0.4 : 0) - deck / 2, (s.z0 + s.z1) / 2, w, deck, d, s.pedestrian ? '#d8cdb9' : '#43474d');
  }
  for (const lot of world.lots) b.box(lot.x, 0.17, lot.z, lot.w, 0.04, lot.d, '#b9b29f');
  for (const br of world.bridges) if (br.kind === 'foot') b.box(0, 1.6, br.z, br.x1 - br.x0 + 4, 0.5, br.width, '#cbbfa6');
  const mesh = new THREE.Mesh(b.build(), material({ roughness: 0.95 }));
  mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.name = 'stand-in-ground';
  const group = new THREE.Group();
  group.add(mesh);
  return { group, update() {}, dispose() { mesh.geometry.dispose(); } };
}

// ---------------------------------------------------------------- stand-in lights
function standInLights(world, extra = 0) {
  const lights = [], posts = [];
  const groundY = (x, z) => (world.heightAt ? world.heightAt(x, z, 'road') : 0);
  // Street lamps on both kerbs, the head reaching out over the carriageway.
  for (const s of world.segments) {
    if (s.over === 'tunnel' || s.covered || s.pedestrian) continue;
    const along = s.axis === 'x';
    const a = along ? s.x0 : s.z0, len = (along ? s.x1 : s.z1) - a;
    const lamps = Math.max(1, Math.floor((len - 24) / LAMP_SPACING));
    const color = s.lanes > 1 ? '#ffbf7a' : '#ffd9a6';
    for (let i = 0; i <= lamps; i++) {
      const t = a + 12 + (len - 24) * (lamps ? i / lamps : 0.5);
      for (const side of [-1, 1]) {
        const off = side * (s.width / 2 + 1.0), head = side * (s.width / 2 - 1.4);
        const x = along ? t : s.x0 + off, z = along ? s.z0 + off : t;
        const hx = along ? t : s.x0 + head, hz = along ? s.z0 + head : t;
        const y = groundY(hx, hz) + LAMP_HEIGHT;
        posts.push({ x, z, hx, hz, y });
        lights.push({ x: hx, y, z: hz, radius: s.lanes > 1 ? 16 : 13.5, color, intensity: 1, group: 'lamps', kind: 'street-lamp' });
      }
    }
  }
  // Promenade lamps along both banks.
  for (const bank of world.river.banks) {
    for (let z = world.board.minZ + 10; z < world.board.maxZ; z += 20) {
      const x = bank.promenade.walkX + bank.side * 3;
      lights.push({ x, y: 4.2, z, radius: 9, color: '#ffd28e', intensity: 0.85, group: 'lamps', kind: 'bollard' });
    }
  }
  // Door lights, facade washes and signs.
  const signColors = ['#ff9ac2', '#9ee8ff', '#fff2c4', '#b7ff9e'];
  let n = 0;
  for (const site of world.siteList) {
    if (site.kind === 'night-market' || site.open_air) continue;
    for (const door of site.doors || []) {
      lights.push({ x: door.x + door.nx * 1.5, y: 4.5, z: door.z + door.nz * 1.5, radius: 8, color: '#ffd59a', intensity: 0.8, group: 'facade', kind: 'door' });
    }
    const f = site.footprint;
    if (!f || !site.door) continue;
    const nx = site.door.nx, nz = site.door.nz, alongX = Math.abs(nz) > 0.5;
    const span = alongX ? f.w : f.d;
    const faceX = alongX ? f.x : (nx > 0 ? f.x1 : f.x0), faceZ = alongX ? (nz > 0 ? f.z1 : f.z0) : f.z;
    const count = Math.floor(span / 16);
    for (let i = 0; i < count; i++) {
      const u = (i + 0.5) / count - 0.5;
      const x = faceX + (alongX ? u * span : 0) + nx * 1.2, z = faceZ + (alongX ? 0 : u * span) + nz * 1.2;
      lights.push({ x, y: Math.min(site.height, 14), z, radius: 7, color: '#ffe0b0', intensity: 0.55, group: 'facade', kind: 'wash' });
    }
    if (['mall', 'market', 'bank', 'clinic', 'annex-mall', 'station'].includes(site.kind)) {
      lights.push({ x: faceX + nx * 2, y: 9, z: faceZ + nz * 2, radius: 9, color: signColors[n++ % signColors.length], intensity: 0.7, group: 'sign', kind: 'sign' });
    }
  }
  // The night market: a lamp over every stall and one at its counter.
  for (const st of world.stalls) {
    lights.push({ x: st.x, y: 3.4, z: st.z, radius: 7.5, color: '#ffb35c', intensity: 1, group: 'market', kind: 'stall' });
    lights.push({ x: st.booth.x, y: 2.8, z: st.booth.z, radius: 5, color: '#ffd27a', intensity: 0.8, group: 'market', kind: 'counter' });
  }
  // Extra lamps for stress tests, scattered over the lots.
  for (let i = 0; i < extra; i++) {
    const lot = world.lots[i % world.lots.length], k = Math.floor(i / world.lots.length);
    const x = lot.x0 + ((i * 37 + k * 11) % 97) / 97 * lot.w, z = lot.z0 + ((i * 53 + k * 7) % 89) / 89 * lot.d;
    lights.push({ x, y: 5, z, radius: 10, color: '#ffd9a6', intensity: 0.7, group: 'lamps', kind: 'extra' });
  }

  // Lamp posts with arms (one instanced draw) and their heads (another).
  const post = new ShapeBuilder()
    .cylinder(0, LAMP_HEIGHT / 2, 0, 0.16, 0.22, LAMP_HEIGHT, '#5a6168', 6)
    .box(1.2, LAMP_HEIGHT - 0.1, 0, 2.6, 0.16, 0.16, '#5a6168')
    .build();
  const postMesh = new THREE.InstancedMesh(post, material({ roughness: 0.6, metalness: 0.3 }), posts.length);
  const headMat = new THREE.MeshBasicMaterial({ color: '#fff1d6' });
  const headMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.3, 0.55), headMat, posts.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  posts.forEach((s, i) => {
    const heading = Math.atan2(s.hz - s.z, s.hx - s.x);
    q.setFromAxisAngle(up, -heading);
    m.compose(p.set(s.x, s.y - LAMP_HEIGHT, s.z), q, one); postMesh.setMatrixAt(i, m);
    m.compose(p.set(s.hx, s.y - 0.3, s.hz), q, one); headMesh.setMatrixAt(i, m);
  });
  postMesh.castShadow = true;
  postMesh.computeBoundingSphere(); headMesh.computeBoundingSphere();
  const group = new THREE.Group();
  group.name = 'stand-in-lamps';
  group.add(postMesh, headMesh);
  const dim = new THREE.Color('#9a958c'), lit = new THREE.Color('#fff1d6');
  return {
    group, lights,
    update(frame) { headMat.color.copy(dim).lerp(lit, frame.lamps); },
    dispose() { post.dispose(); headMesh.geometry.dispose(); headMat.dispose(); }
  };
}
