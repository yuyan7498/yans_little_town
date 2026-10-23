// Procedural surface textures for the ground, drawn on canvases. They are near-white
// greyscale detail (grain, tile joints) that multiplies the vertex colours, so the
// palette stays in the geometry. Meshes use world x, z as UVs: one texture covers
// `size` world units and repeats seamlessly across every piece.
import * as THREE from 'three';
import { hash } from '../../core/random.js';

function canvas(n) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  return [c, c.getContext('2d')];
}

// A seeded random source so the textures look the same on every visit.
function source(seed) {
  let s = hash(seed) >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

const grey = v => { const g = Math.max(0, Math.min(255, Math.round(v * 255))); return `rgb(${g},${g},${g})`; };

function finish(c, size, { anisotropy = 8, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / size, 1 / size);
  t.anisotropy = anisotropy;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.userData.size = size;
  return t;
}

// Asphalt: fine grit with a few darker and lighter stones. 12 world units per tile.
export function asphaltTexture() {
  const n = 256, [c, g] = canvas(n), r = source('asphalt');
  g.fillStyle = grey(0.93); g.fillRect(0, 0, n, n);
  for (let i = 0; i < 5200; i++) {
    g.fillStyle = grey(0.78 + r() * 0.22);
    const s = r() < 0.08 ? 2 : 1;
    g.fillRect(Math.floor(r() * n), Math.floor(r() * n), s, s);
  }
  // Soft mottling so a long road does not look printed.
  for (let i = 0; i < 40; i++) {
    const x = r() * n, y = r() * n, rad = 14 + r() * 26, a = g.createRadialGradient(x, y, 0, x, y, rad);
    const dark = r() < 0.5;
    a.addColorStop(0, dark ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'); a.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = a; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return finish(c, 12);
}

// Square paving tiles with joints: `tiles` per side over `size` world units.
export function pavingTexture({ size = 6, tiles = 4, joint = 0.045, variation = 0.07, seed = 'paving' } = {}) {
  const n = 256, [c, g] = canvas(n), r = source(seed), cell = n / tiles;
  g.fillStyle = grey(0.62); g.fillRect(0, 0, n, n);        // joint colour
  const j = Math.max(1.5, cell * joint);
  for (let y = 0; y < tiles; y++) for (let x = 0; x < tiles; x++) {
    g.fillStyle = grey(0.96 - r() * variation * 2);
    g.fillRect(x * cell + j / 2, y * cell + j / 2, cell - j, cell - j);
    // A little grit on every tile.
    for (let k = 0; k < 14; k++) {
      g.fillStyle = grey(0.86 + r() * 0.14);
      g.fillRect(x * cell + j + r() * (cell - 3 * j), y * cell + j + r() * (cell - 3 * j), 1.5, 1.5);
    }
  }
  return finish(c, size);
}

// Large concrete slabs (forecourts): `tiles` slabs over `size` world units, hairline joints.
export function slabTexture() {
  const n = 256, [c, g] = canvas(n), r = source('slab');
  g.fillStyle = grey(0.9); g.fillRect(0, 0, n, n);
  for (let i = 0; i < 3500; i++) { g.fillStyle = grey(0.84 + r() * 0.16); g.fillRect(Math.floor(r() * n), Math.floor(r() * n), 1, 1); }
  g.fillStyle = grey(0.68);
  g.fillRect(0, 0, n, 2.5); g.fillRect(0, 0, 2.5, n);
  g.fillRect(0, n / 2 - 1, n, 2); g.fillRect(n / 2 - 1, 0, 2, n);
  return finish(c, 16);
}

// Lawn: blotches of two greens and short blades.
export function grassTexture() {
  const n = 256, [c, g] = canvas(n), r = source('grass');
  g.fillStyle = grey(0.9); g.fillRect(0, 0, n, n);
  for (let i = 0; i < 60; i++) {
    const x = r() * n, y = r() * n, rad = 10 + r() * 30, a = g.createRadialGradient(x, y, 0, x, y, rad);
    const dark = r() < 0.5;
    a.addColorStop(0, dark ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)'); a.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = a; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 2600; i++) { g.fillStyle = grey(0.74 + r() * 0.26); g.fillRect(Math.floor(r() * n), Math.floor(r() * n), 1, 2); }
  return finish(c, 14);
}

// A night-reflection map for the canal: warm vertical streaks where lanterns stand.
// `lights` are [x, z] pairs on the canal's own axes; the map covers x ∈ [-half, half],
// z ∈ [zMin, zMax]. Returned as a texture sampled with (x, z) mapped to (u, v).
export function reflectionTexture(lights, half, zMin, zMax) {
  const w = 64, h = 1024, [c, g] = canvas(w);
  c.width = w; c.height = h;
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'lighter';
  for (const [x, z] of lights) {
    const u = (x + half) / (2 * half) * w, v = (z - zMin) / (zMax - zMin) * h;
    const a = g.createRadialGradient(u, v, 0, u, v, 6);
    a.addColorStop(0, 'rgba(255,200,130,0.95)'); a.addColorStop(0.35, 'rgba(255,170,90,0.4)'); a.addColorStop(1, 'rgba(255,150,70,0)');
    g.save(); g.translate(u, v); g.scale(2.6, 1); g.translate(-u, -v);   // wider across than along (streaks run out from the bank)
    g.fillStyle = a; g.fillRect(u - 24, v - 8, 48, 16); g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearFilter;
  return t;
}
