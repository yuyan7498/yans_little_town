// Preview one render module on its own, against the real world model.
//
//   tools/preview.html?m=src/render/buildings/towers.js
//     &fn=preview        export to call (default `preview`)
//     &cam=x,y,z,tx,ty,tz camera position and target
//     &minute=1260&day=1 town time (default 10:00 day 1); &speed=0 freezes it (default 0)
//     &ground=0          leave out the stand-in ground (roads, lots, water)
//     &quality=lite
//
// The export is called as fn(ctx) with ctx = {THREE, world, scene, renderer, camera,
// quality, makeFrame} and may return {group, update(frame)} (both optional; a group is
// added to the scene). window.__ready turns true after a few frames, for tools/shot.mjs.
import * as THREE from 'three';
import * as data from '../src/core/data.js';
import { buildWorld } from '../src/core/world/index.js';
import { makeFrame } from '../src/render/frame.js';
import { toDaySeconds } from '../src/core/clock.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
const quality = q.get('quality') === 'lite' ? 'lite' : 'full';
const world = buildWorld(data.town, data.buildings);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 1, 4000);
const hemi = new THREE.HemisphereLight('#cfe3f5', '#a99a83', 1.1);
const sun = new THREE.DirectionalLight('#fff1dc', 2.6);
sun.position.set(-260, 360, -180);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.06;
Object.assign(sun.shadow.camera, { left: -300, right: 300, top: 300, bottom: -300, near: 10, far: 1000 });
scene.add(hemi, sun, sun.target);

if (q.get('ground') !== '0') scene.add(standInGround(world));

// Orbit camera.
const cam = { tx: 0, ty: 0, tz: 0, yaw: -0.8, pitch: 0.7, distance: 900 };
if (q.has('cam')) {
  const [x, y, z, tx, ty, tz] = q.get('cam').split(',').map(Number);
  Object.assign(cam, { tx, ty, tz });
  const dx = x - tx, dy = y - ty, dz = z - tz;
  cam.distance = Math.hypot(dx, dy, dz); cam.pitch = Math.asin(dy / cam.distance); cam.yaw = Math.atan2(dx, dz);
}
function placeCamera() {
  const cp = Math.cos(cam.pitch);
  camera.position.set(cam.tx + Math.sin(cam.yaw) * cp * cam.distance, cam.ty + Math.sin(cam.pitch) * cam.distance, cam.tz + Math.cos(cam.yaw) * cp * cam.distance);
  camera.lookAt(cam.tx, cam.ty, cam.tz);
}
let drag = null;
renderer.domElement.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, pan: e.button !== 0 || e.shiftKey, c: { ...cam } }; renderer.domElement.setPointerCapture(e.pointerId); });
renderer.domElement.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (drag.pan) {
    const k = drag.c.distance / 900, s = Math.sin(cam.yaw), c = Math.cos(cam.yaw);
    cam.tx = drag.c.tx - (c * dx + s * dy) * k; cam.tz = drag.c.tz - (-s * dx + c * dy) * k;
  } else { cam.yaw = drag.c.yaw - dx * 0.006; cam.pitch = Math.max(0.05, Math.min(1.55, drag.c.pitch + dy * 0.005)); }
});
addEventListener('pointerup', () => { drag = null; });
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
renderer.domElement.addEventListener('wheel', e => { e.preventDefault(); cam.distance = Math.max(5, Math.min(3000, cam.distance * Math.exp(e.deltaY * 0.0012))); }, { passive: false });

const ctx = { THREE, world, scene, renderer, camera, quality, makeFrame };
let result = null;
const modulePath = q.get('m');
try {
  if (modulePath) {
    const mod = await import('../' + modulePath.replace(/^\//, ''));
    const fn = mod[q.get('fn') || 'preview'];
    if (typeof fn !== 'function') throw new Error(`${modulePath} has no export ${q.get('fn') || 'preview'}`);
    result = (await fn(ctx)) || null;
    if (result && result.group) scene.add(result.group);
  }
} catch (error) { console.error(error); document.getElementById('info').textContent = String(error); }

let daySeconds = toDaySeconds(num('day', 1), num('minute', 600));
const speed = num('speed', 0);
let last = performance.now(), start = last, frames = 0;
const bgDay = new THREE.Color('#dfe7ec'), bgNight = new THREE.Color('#0e1724');
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  daySeconds += dt * speed;
  const w = innerWidth, h = innerHeight;
  if (renderer.domElement.width !== Math.floor(w * renderer.getPixelRatio())) renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  placeCamera();
  const frame = makeFrame({ daySeconds, time: (now - start) / 1000, dt, camera, quality, world, cameraState: { ...cam } });
  sun.intensity = 2.6 * frame.daylight; hemi.intensity = 0.25 + 0.85 * frame.daylight;
  scene.background = bgNight.clone().lerp(bgDay, frame.daylight);
  if (result && result.update) result.update(frame);
  renderer.render(scene, camera);
  if (++frames === 8) {
    window.__ready = true;
    document.getElementById('info').textContent = `${modulePath || '(none)'} · ${renderer.info.render.calls} draw calls · ${(renderer.info.render.triangles / 1000).toFixed(0)}k triangles`;
  }
}
requestAnimationFrame(loop);
window.preview = { THREE, world, scene, camera, renderer, cam, result, info: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }) };

// Flat stand-in ground so a module is seen in place: lots, roads, promenades, water.
function standInGround(world) {
  const g = new THREE.Group();
  g.name = 'stand-in-ground';
  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 });
  const slab = (r, y, c, h = 0.1) => { const m = new THREE.Mesh(new THREE.BoxGeometry(r.w, h, r.d), mat(c)); m.position.set(r.x, y - h / 2, r.z); m.receiveShadow = true; g.add(m); };
  slab({ x: 0, z: 0, w: world.board.halfX * 2, d: world.board.halfZ * 2 }, 0.15, '#cfc8bb');
  for (const s of world.segments) slab({ x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2, w: s.axis === 'x' ? s.x1 - s.x0 : s.width, d: s.axis === 'z' ? s.z1 - s.z0 : s.width }, 0.16, s.pedestrian ? '#d8cdb9' : '#4a4e53', 0.12);
  slab({ x: 0, z: 0, w: world.river.halfWidth * 2, d: world.board.halfZ * 2 }, 0.18, '#4f8fa0', 0.2);
  for (const lot of world.lots) slab(lot, 0.17, '#bfb7a6', 0.1);
  return g;
}
