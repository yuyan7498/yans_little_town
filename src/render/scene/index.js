// The view: renderer, camera, sky, sun and moon light with shadows, fog, exposure, and
// the night lights of every module (docs/CONTRACTS.md §4 Scene).
//
//   const view = createView({ canvas, world, quality });
//   view.add(module); view.setCamera({x, y, z, yaw, pitch, distance}); view.render(frame);
//
// Lit materials of everything in the scene receive the night light pools automatically
// (see night-lights.js); set material.userData.lightPools = false to opt one out.

import * as THREE from 'three';
import { createAtmosphere, atmosphere } from './atmosphere.js';
import { createSky } from './sky.js';
import { createLighting } from './lighting.js';
import { createNightLights, patchTree, receiveLightPools } from './night-lights.js';

export { receiveLightPools };

const PIXEL_RATIO = { full: 1.5, lite: 1.25 };
const FOV = 30;
// The plain the board stands on, reaching out into the fog.
const SURROUNDINGS = { color: '#8e9a7f', reach: 5000, y: -0.02 };
// How often (ms) the scene is scanned for new materials to give the light pools.
const SCAN_EVERY = { full: 1000, lite: 2000 };
// Fireworks light up the town (frame.flash from the fireworks module): peak intensity of
// the flash light. Phones skip it: one more light for every lit pixel.
const FLASH_GAIN = { full: 1.6, lite: 0 };

export function createView({ canvas, world, quality = 'full', surroundings = true } = {}) {
  quality = quality === 'lite' ? 'lite' : 'full';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, PIXEL_RATIO[quality]));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false; // counted per render(), shadow and light-map passes included

  const scene = new THREE.Scene();
  scene.name = 'town';
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 4000);

  const sky = createSky({ quality, radius: 3000 });
  scene.add(sky.mesh);
  // Always in the scene, dark when nothing bursts, so turning it on recompiles nothing.
  const flash = FLASH_GAIN[quality] ? new THREE.PointLight('#ffffff', 0, 0, 0) : null;
  if (flash) { flash.name = 'fireworks-flash'; scene.add(flash); }
  const lighting = createLighting({ renderer, scene, world, quality, sky });
  const night = createNightLights({ renderer, world, quality });
  scene.add(night.group);

  let plain = null;
  if (surroundings) {
    plain = makeSurroundings(world);
    scene.add(plain);
  }

  const atm = createAtmosphere();
  const state = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0.8, distance: 600 };
  let cssWidth = 1, cssHeight = 1;

  // ------------------------------------------------------------ modules
  const modules = [];
  let lightsDirty = true, lastScan = 0;
  function add(module) {
    if (!module || modules.some(e => e.module === module)) return module;
    modules.push({ module, lights: module.lights || null, lightCount: module.lights ? module.lights.length : 0 });
    if (module.group) { scene.add(module.group); patchTree(module.group); }
    lightsDirty = true;
    return module;
  }
  function remove(module) {
    const i = modules.findIndex(e => e.module === module);
    if (i < 0) return;
    modules.splice(i, 1);
    if (module.group) scene.remove(module.group);
    lightsDirty = true;
  }
  function collectLights() {
    const all = [];
    for (const e of modules) {
      e.lights = e.module.lights || null;
      e.lightCount = e.lights ? e.lights.length : 0;
      if (e.lights) for (const l of e.lights) all.push(l);
    }
    night.setLights(all);
    lightsDirty = false;
  }

  // ------------------------------------------------------------ camera
  // Orbit rig: eye = pivot + distance·(sin yaw·cos pitch, sin pitch, cos yaw·cos pitch).
  // Missing fields keep their current value.
  function setCamera(c = {}) {
    if (c.x !== undefined) state.x = c.x;
    if (c.y !== undefined) state.y = c.y;
    if (c.z !== undefined) state.z = c.z;
    if (c.yaw !== undefined) state.yaw = c.yaw;
    if (c.pitch !== undefined) state.pitch = c.pitch;
    if (c.distance !== undefined) state.distance = Math.max(0.5, c.distance);
    const { x, y, z, yaw, distance } = state;
    const pitch = Math.max(-1.5607, Math.min(1.5607, state.pitch)); // straight down would leave lookAt without an up
    const cp = Math.cos(pitch);
    camera.position.set(x + Math.sin(yaw) * cp * distance, y + Math.sin(pitch) * distance, z + Math.cos(yaw) * cp * distance);
    camera.lookAt(x, y, z);
    camera.near = Math.min(30, Math.max(0.2, distance * 0.03));
    camera.far = distance * 2.5 + 3000;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    sky.setRadius(camera.far * 0.9);
  }

  function resize(width, height) {
    cssWidth = Math.max(1, width); cssHeight = Math.max(1, height);
    renderer.setSize(cssWidth, cssHeight);
    camera.aspect = cssWidth / cssHeight;
    camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ render
  const timing = { cpuMs: 0, frameMs: 0, last: 0 };
  let disposed = false;
  function render(frame) {
    if (disposed) return;
    const t0 = performance.now();
    renderer.info.reset();
    if (!frame.camera) frame.camera = camera;
    if (!frame.cameraState) frame.cameraState = state;
    if (!frame.quality) frame.quality = quality;
    atmosphere(frame, atm);
    frame.atmosphere = atm;

    for (const e of modules) {
      const m = e.module;
      if (m.update) m.update(frame);
      const lights = m.lights || null;
      if (lights !== e.lights || (lights ? lights.length : 0) !== e.lightCount) lightsDirty = true;
    }
    if (lightsDirty) collectLights();
    if (t0 - lastScan > SCAN_EVERY[quality]) { patchTree(scene); lastScan = t0; }

    const time = frame.time || 0;
    sky.update(atm, camera, time);
    lighting.update(atm, frame, camera, state, time);
    if (flash) {
      const f = frame.flash;
      flash.intensity = f ? f.intensity * FLASH_GAIN[quality] : 0;
      if (f && f.intensity > 0) { flash.position.set(f.x, f.y, f.z); flash.color.setRGB(f.color[0], f.color[1], f.color[2]); }
    }
    night.update(frame, camera, cssHeight * renderer.getPixelRatio(), atm.night);
    renderer.render(scene, camera);

    const t1 = performance.now();
    timing.cpuMs += ((t1 - t0) - timing.cpuMs) * 0.1;
    if (timing.last) timing.frameMs += (Math.min(250, t0 - timing.last) - timing.frameMs) * 0.1;
    timing.last = t0;
  }

  // ------------------------------------------------------------ helpers
  const _p = new THREE.Vector3(), _q = new THREE.Vector3();
  // A world point to CSS pixels on the canvas (depth = distance in front of the camera),
  // or null when it is behind the camera or past the far plane. Pass `out` to reuse an object.
  function project(p, out = {}) {
    _q.set(p.x, p.y || 0, p.z).applyMatrix4(camera.matrixWorldInverse);
    if (_q.z > -camera.near || -_q.z > camera.far) return null;
    _p.set(p.x, p.y || 0, p.z).project(camera);
    out.x = (_p.x + 1) / 2 * cssWidth; out.y = (1 - _p.y) / 2 * cssHeight; out.depth = -_q.z;
    return out;
  }
  // A picking ray through canvas CSS pixel (px, py).
  function rayAt(px, py) {
    const origin = camera.position.clone();
    const dir = new THREE.Vector3(px / cssWidth * 2 - 1, 1 - py / cssHeight * 2, 0.5).unproject(camera).sub(origin).normalize();
    return { origin, dir };
  }

  function info() {
    const r = renderer.info;
    return {
      calls: r.render.calls, triangles: r.render.triangles, points: r.render.points, lines: r.render.lines,
      frameMs: +timing.frameMs.toFixed(2), cpuMs: +timing.cpuMs.toFixed(2), fps: timing.frameMs ? Math.round(1000 / timing.frameMs) : 0,
      programs: r.programs ? r.programs.length : 0, geometries: r.memory.geometries, textures: r.memory.textures,
      pixelRatio: renderer.getPixelRatio(), quality, ...lighting.info(), ...night.info()
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const e of modules) if (e.module.group) scene.remove(e.module.group);
    modules.length = 0;
    night.dispose(); lighting.dispose(); sky.dispose();
    if (plain) { plain.geometry.dispose(); plain.material.dispose(); }
    renderer.dispose();
  }

  setCamera(state);
  resize(canvas.clientWidth || canvas.width || 1, canvas.clientHeight || canvas.height || 1);

  return {
    renderer, scene, camera, quality,
    add, remove, setCamera, render, resize, info, dispose, project, rayAt,
    ready: sky.ready,                       // resolves when the night sky has loaded
    atmosphere: atm,                        // the sky's current state (also frame.atmosphere)
    cameraState: state,
    setNightLights: on => night.setEnabled(on)
  };
}

// A wide plain around the board so the town's edge melts into the fog instead of
// ending in mid-air. It has a hole where the board is, so it never covers the canal.
function makeSurroundings(world) {
  const b = world.board, R = SURROUNDINGS.reach;
  const shape = new THREE.Shape([new THREE.Vector2(-R, -R), new THREE.Vector2(R, -R), new THREE.Vector2(R, R), new THREE.Vector2(-R, R)]);
  // Shape y is world −z once the plain is laid flat facing up.
  shape.holes.push(new THREE.Path([new THREE.Vector2(b.minX, -b.minZ), new THREE.Vector2(b.minX, -b.maxZ), new THREE.Vector2(b.maxX, -b.maxZ), new THREE.Vector2(b.maxX, -b.minZ)]));
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({ color: SURROUNDINGS.color, roughness: 1, metalness: 0 });
  material.name = 'scene:surroundings';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'surroundings';
  mesh.position.y = SURROUNDINGS.y;
  mesh.receiveShadow = false; // long dusk and moon shadows would draw ghost towers on it
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}
