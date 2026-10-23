// Machinery for the towers, housing, commercial and civic modules: a site's local frame,
// merged geometry layers with per-vertex night glow, one material per layer and a sign
// atlas drawn on a canvas. Local frame: origin at the plot centre, +x out of the front,
// z along the front, y world height.

import * as THREE from 'three';
import { unit, scatter } from '../../core/random.js';
import { material as kitMaterial } from '../kit.js';

export const GROUND = 0.15;                 // lots and pavements
export const SLOTS = 8;                     // sites per module whose lighting the glow shader reads
const NORMAL = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const FACE_RY = { f: Math.PI / 2, b: -Math.PI / 2, p: 0, n: Math.PI };

// Glow channels (per vertex): how a glowing part follows the frame.
export const GLOW = { windows: 0, entry: 1, sign: 2, lamps: 3, beacon: 4, always: 5, none: 9 };

export const lrect = (x0, x1, z0, z1) => ({ x0, x1, z0, z1, x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 });
export const grow = (r, g) => lrect(r.x0 - g, r.x1 + g, r.z0 - g, r.z1 + g);
export const overlaps = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;

// The largest part of rect r that keeps clear of every obstacle (all local rects).
export function freeRect(r, obstacles) {
  const hit = obstacles.find(o => overlaps(r, o));
  if (!hit) return r;
  const options = [lrect(r.x0, Math.min(r.x1, hit.x0), r.z0, r.z1), lrect(Math.max(r.x0, hit.x1), r.x1, r.z0, r.z1),
    lrect(r.x0, r.x1, r.z0, Math.min(r.z1, hit.z0)), lrect(r.x0, r.x1, Math.max(r.z0, hit.z1), r.z1)]
    .filter(c => c.w > 0.5 && c.d > 0.5).map(c => freeRect(c, obstacles));
  return options.reduce((best, c) => (!best || c.w * c.d > best.w * best.d ? c : best), null) || lrect(r.x, r.x, r.z, r.z);
}

export class SiteFrame {
  constructor(site, world) {
    const [nx, nz] = NORMAL[site.front || 's'];
    this.site = site; this.world = world; this.nx = nx; this.nz = nz;
    this.ox = site.area.x; this.oz = site.area.z;
    this.rotY = -Math.atan2(nz, nx);
    this.base = new THREE.Matrix4().makeRotationY(this.rotY).setPosition(this.ox, 0, this.oz);
    this.area = this.rect(site.area);
    this.foot = this.rect(site.footprint);
    // Annex footprints standing on this plot (reserved: draw nothing there).
    this.annexes = (site.annexes || []).map(id => world && world.site(id)).filter(Boolean).map(a => this.rect(a.footprint));
  }
  toWorld(lx, lz) { return { x: this.ox + lx * this.nx - lz * this.nz, z: this.oz + lx * this.nz + lz * this.nx }; }
  toLocal(x, z) { const dx = x - this.ox, dz = z - this.oz; return { x: dx * this.nx + dz * this.nz, z: -dx * this.nz + dz * this.nx }; }
  rect(r) {
    const a = this.toLocal(r.x0, r.z0), b = this.toLocal(r.x1, r.z1);
    return lrect(Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.z, b.z), Math.max(a.z, b.z));
  }
  point(p) { return p ? this.toLocal(p.x, p.z) : null; }
  // A heading in the local frame (0 = local +x) to a world heading.
  heading(localHeading) { return localHeading - this.rotY; }
}

// ------------------------------------------------------------------ unit shapes
// Non-indexed unit primitives, transformed into place by a matrix.
const UNITS = new Map();
function unitOf(key, make) {
  if (!UNITS.has(key)) {
    let g = make();
    if (g.index) { const n = g.toNonIndexed(); g.dispose(); g = n; }
    UNITS.set(key, { pos: g.attributes.position.array, nor: g.attributes.normal.array, uv: g.attributes.uv ? g.attributes.uv.array : null });
    g.dispose();
  }
  return UNITS.get(key);
}
const U = {
  box: () => unitOf('box', () => new THREE.BoxGeometry(1, 1, 1)),
  plane: () => unitOf('plane', () => new THREE.PlaneGeometry(1, 1)),
  cyl: (seg, top = 1) => unitOf('cyl' + seg + ':' + top, () => new THREE.CylinderGeometry(top, 1, 1, seg)),
  cone: seg => unitOf('cone' + seg, () => new THREE.ConeGeometry(1, 1, seg)),
  ico: () => unitOf('ico', () => new THREE.IcosahedronGeometry(1, 0)),
  ring: (seg, inner, arc) => unitOf('ring' + seg + ':' + inner + ':' + arc, () => new THREE.RingGeometry(inner, 1, seg, 1, 0, arc)),
  disc: seg => unitOf('disc' + seg, () => new THREE.CircleGeometry(1, seg)),
  wedge: () => unitOf('wedge', () => {
    // A gable prism: base 1 x 1 at y = 0, ridge along z at x = 0, y = 1.
    const p = [], A = [-0.5, 0, -0.5], B = [0.5, 0, -0.5], C = [0, 1, -0.5], D = [-0.5, 0, 0.5], E = [0.5, 0, 0.5], F = [0, 1, 0.5];
    const tri = (...v) => v.forEach(q => p.push(...q));
    tri(A, C, B); tri(D, E, F);                 // gable ends
    tri(A, D, F); tri(A, F, C);                 // west slope
    tri(B, C, F); tri(B, F, E);                 // east slope
    tri(A, B, E); tri(A, E, D);                 // base
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.computeVertexNormals();
    return g;
  })
};

// ------------------------------------------------------------------ layers
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3(), _c = new THREE.Color(), _e = new THREE.Color();
const _m = new THREE.Matrix4(), _w = new THREE.Matrix4(), _q = new THREE.Quaternion(), _eu = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

// One merged mesh in the making: positions, normals, colours, and for glowing layers a
// glow descriptor (channel, slot, threshold) and an emission colour per vertex.
class Layer {
  constructor(kind) { this.kind = kind; this.pos = []; this.nor = []; this.col = []; this.uv = []; this.glow = []; this.emit = []; }
  push(u, m, color, extra) {
    _nm.getNormalMatrix(m); _c.set(color);
    const P = u.pos, N = u.nor, count = P.length / 3;
    for (let i = 0; i < P.length; i += 3) {
      _v.set(P[i], P[i + 1], P[i + 2]).applyMatrix4(m);
      _n.set(N[i], N[i + 1], N[i + 2]).applyMatrix3(_nm).normalize();
      this.pos.push(_v.x, _v.y, _v.z); this.nor.push(_n.x, _n.y, _n.z); this.col.push(_c.r, _c.g, _c.b);
    }
    if (this.kind === 'body' || this.kind === 'clear') return;
    const g = (extra && extra.glow) || [GLOW.none, 0, 0];
    _e.set((extra && extra.emit) || '#000000').multiplyScalar((extra && extra.power) || 1);
    for (let i = 0; i < count; i++) { this.glow.push(g[0], g[1], g[2]); this.emit.push(_e.r, _e.g, _e.b); }
    if (this.kind === 'sign') {
      const r = (extra && extra.uv) || [0, 0, 0, 0], UV = u.uv;
      for (let i = 0; i < count; i++) this.uv.push(r[0] + (UV ? UV[i * 2] : 0) * (r[2] - r[0]), r[1] + (UV ? UV[i * 2 + 1] : 0) * (r[3] - r[1]));
    }
  }
  get triangles() { return this.pos.length / 9; }
  build() {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.kind === 'glow' || this.kind === 'sign') {
      g.setAttribute('glow', new THREE.Float32BufferAttribute(this.glow, 3));
      g.setAttribute('emit', new THREE.Float32BufferAttribute(this.emit, 3));
    }
    if (this.kind === 'sign') g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

// A MeshStandardMaterial whose emission comes from the per-vertex glow descriptor and
// the module's uniforms: windows light by a hashed threshold against the site's share
// of lit windows; entries, signs and lamps follow their levels.
function glowMaterial(uniforms, { map = null, ...params } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0, map, ...params });
  m.onBeforeCompile = shader => {
    shader.uniforms.uLevels = uniforms.levels;
    shader.uniforms.uGlobal = uniforms.global;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 glow;
attribute vec3 emit;
uniform vec4 uLevels[${SLOTS}];
uniform vec4 uGlobal;
varying vec3 vEmit;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  int ch = int(glow.x + 0.5);
  vec4 L = uLevels[int(glow.y + 0.5)];
  float on = 0.0;
  if (ch == 0) on = step(glow.z, L.x);
  else if (ch == 1) on = L.y;
  else if (ch == 2) on = L.z;
  else if (ch == 3) on = uGlobal.x;
  else if (ch == 4) on = max(L.z, 0.3) * (0.55 + 0.45 * sin(uGlobal.z * 4.0 + glow.z * 6.2832));
  else if (ch == 5) on = 1.0;
  vEmit = emit * on * uGlobal.y;
}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEmit;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEmit${map ? ' * diffuseColor.rgb' : ''};`);
  };
  m.customProgramCacheKey = () => 'a-glow' + (map ? '-map' : '');
  return m;
}

// ------------------------------------------------------------------ the sign atlas
const FONT = '"Microsoft JhengHei", "Noto Sans TC", "PingFang TC", "Heiti TC", sans-serif';
export class Atlas {
  constructor(width = 2048, height = 1024) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width; this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');
    this.x = 4; this.y = 4; this.row = 0; this.items = new Map(); this.pad = 6;
  }
  // Reserve w x h pixels and draw into them with draw(ctx, x, y, w, h).
  add(key, w, h, draw) {
    if (this.items.has(key)) return this.items.get(key);
    const W = this.canvas.width, H = this.canvas.height;
    if (this.x + w + this.pad > W) { this.x = 4; this.y += this.row + this.pad; this.row = 0; }
    if (this.y + h > H) console.warn('a-kit atlas full:', key);
    const x = this.x, y = this.y;
    this.ctx.save(); draw(this.ctx, x, y, w, h); this.ctx.restore();
    // Inset the UVs half a pixel so mipmaps do not bleed the neighbours in.
    const item = { uv: [(x + 0.5) / W, 1 - (y + h - 0.5) / H, (x + w - 0.5) / W, 1 - (y + 0.5) / H], aspect: w / h };
    this.items.set(key, item);
    this.x += w + this.pad; this.row = Math.max(this.row, h);
    return item;
  }
  // A text sign: background (null = letters only), letters, optional border.
  // vertical: characters stacked top to bottom.
  text(key, text, { color = '#ffffff', background = '#2d5f73', size = 72, weight = 800, pad = 0.35, vertical = false, border = null, radius = 0, sub = null, subSize = 0.42 } = {}) {
    const ctx = this.ctx, font = `${weight} ${size}px ${FONT}`;
    ctx.font = font;
    const chars = [...text];
    const p = Math.round(size * pad);
    let w, h;
    if (vertical) { w = Math.round(size * 1.0 + p * 2); h = Math.round(chars.length * size * 1.08 + p * 2); }
    else { w = Math.ceil(ctx.measureText(text).width + p * 2); h = Math.round(size * (sub ? 1.0 + subSize * 1.1 : 1.0) + p * 2); }
    if (sub) { ctx.font = `${weight - 200} ${Math.round(size * subSize)}px ${FONT}`; w = Math.max(w, Math.ceil(ctx.measureText(sub).width + p * 2)); }
    return this.add(key, w, h, (c, x, y) => {
      if (background) {
        c.fillStyle = background;
        if (radius) { c.beginPath(); c.roundRect(x, y, w, h, radius * h); c.fill(); } else c.fillRect(x, y, w, h);
      }
      if (border) { c.strokeStyle = border; c.lineWidth = Math.max(4, size * 0.08); c.strokeRect(x + c.lineWidth, y + c.lineWidth, w - c.lineWidth * 2, h - c.lineWidth * 2); }
      c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = font;
      if (vertical) chars.forEach((ch, i) => c.fillText(ch, x + w / 2, y + p + size * 1.08 * (i + 0.5)));
      else if (sub) {
        c.fillText(text, x + w / 2, y + p + size * 0.5);
        c.font = `${weight - 200} ${Math.round(size * subSize)}px ${FONT}`;
        c.fillText(sub, x + w / 2, y + p + size * (1.0 + subSize * 0.62));
      } else c.fillText(text, x + w / 2, y + h / 2 + size * 0.04);
    });
  }
  texture() {
    if (!this.tex) {
      this.tex = new THREE.CanvasTexture(this.canvas);
      this.tex.colorSpace = THREE.SRGBColorSpace;
      this.tex.anisotropy = 8;
    }
    return this.tex;
  }
}

// The ROC national flag (3:2) into the atlas.
export function flagROC(atlas) {
  return atlas.add('flag-roc', 192, 128, (c, x, y, w, h) => {
    c.fillStyle = '#d42a2f'; c.fillRect(x, y, w, h);
    const cw = w / 2, ch = h / 2;
    c.fillStyle = '#1b3a8c'; c.fillRect(x, y, cw, ch);
    const cx = x + cw / 2, cy = y + ch / 2, R = ch * 0.38, r = ch * 0.23;
    c.fillStyle = '#ffffff'; c.beginPath();
    for (let i = 0; i < 24; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 12, q = i % 2 ? r : R;
      i ? c.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q) : c.moveTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q);
    }
    c.closePath(); c.fill();
    c.fillStyle = '#1b3a8c'; c.beginPath(); c.arc(cx, cy, ch * 0.2, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(cx, cy, ch * 0.17, 0, Math.PI * 2); c.fill();
  });
}

// ------------------------------------------------------------------ the builder
// One per module: collects the layers of every site it draws, then makes the meshes.
export class Builder {
  constructor({ world, quality = 'full', atlas = null }) {
    this.world = world; this.lite = quality === 'lite';
    this.layers = { body: new Layer('body'), glow: new Layer('glow'), sign: new Layer('sign'), clear: new Layer('clear') };
    this.atlas = atlas || new Atlas();
    this.slots = [];                     // site ids in glow-slot order
    this.lights = [];
    this.uniforms = {
      levels: { value: Array.from({ length: SLOTS }, () => new THREE.Vector4()) },
      global: { value: new THREE.Vector4(0, 1, 0, 1) }
    };
  }
  // A painter for one site: draws in that site's local frame.
  site(site) {
    let slot = this.slots.indexOf(site.id);
    if (slot < 0) { slot = this.slots.length; this.slots.push(site.id); }
    if (slot >= SLOTS) console.warn('a-kit: too many sites for one module', site.id);
    return new Painter(this, new SiteFrame(site, this.world), Math.min(slot, SLOTS - 1));
  }
  // Light sources in world coordinates (docs/CONTRACTS.md §4 LightSource).
  light(x, y, z, radius, color, intensity, group, kind) { this.lights.push({ x, y, z, radius, color, intensity, group, kind }); }

  finish(name) {
    const group = new THREE.Group(); group.name = name;
    const meshes = [];
    const add = (layer, mat, { cast = false } = {}) => {
      const g = layer.build();
      if (!g) { if (mat && !mat.name.startsWith('kit:')) mat.dispose(); return; }
      const mesh = new THREE.Mesh(g, mat);
      mesh.name = name + ':' + layer.kind;
      mesh.castShadow = cast; mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      group.add(mesh); meshes.push(mesh);
    };
    add(this.layers.body, kitMaterial({ roughness: 0.82 }), { cast: true });
    add(this.layers.glow, glowMaterial(this.uniforms, { roughness: 0.38, metalness: 0.05 }));
    if (this.layers.sign.pos.length) add(this.layers.sign, glowMaterial(this.uniforms, { map: this.atlas.texture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 }));
    add(this.layers.clear, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.05, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
    group.matrixAutoUpdate = false;
    const triangles = meshes.reduce((t, m) => t + m.geometry.attributes.position.count / 3, 0);
    const uniforms = this.uniforms, slots = this.slots.slice(), atlas = this.atlas;
    return {
      group, lights: this.lights,
      update(frame) {
        const lit = (frame.lighting && frame.lighting.buildings) || {};
        slots.forEach((id, i) => {
          const l = lit[id];
          uniforms.levels.value[Math.min(i, SLOTS - 1)].set(l ? l.windows || 0 : 0, l ? l.entry || 0 : frame.lamps, l ? l.sign || 0 : frame.lamps, 0);
        });
        uniforms.global.value.set(frame.lamps, 1 - 0.85 * frame.daylight, frame.time || 0, frame.daylight);
      },
      dispose() {
        for (const m of meshes) { m.geometry.dispose(); if (!m.material.name.startsWith('kit:')) m.material.dispose(); }
        if (atlas.tex) atlas.tex.dispose();
        group.clear();
      },
      info: () => ({ meshes: meshes.length, triangles })
    };
  }
}

// Draws one site's parts in its local frame.
export class Painter {
  constructor(builder, frame, slot) {
    this.b = builder; this.f = frame; this.slot = slot; this.site = frame.site; this.lite = builder.lite;
    this.L = builder.layers; this.windowCount = 0;
  }
  // Generic: a unit shape, local position, euler rotation, scale.
  put(u, x, y, z, rot, scale, color, layer = 'body', extra) {
    _eu.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0);
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_eu), _s.set(scale[0], scale[1], scale[2]));
    _w.multiplyMatrices(this.f.base, _m);
    this.L[layer].push(u, _w, color, extra);
    return this;
  }
  // A box standing on y0 (sizes along local x, y, z), turned ry about its centre.
  box(x, y0, z, sx, sy, sz, color, ry = 0, layer = 'body', extra) { return this.put(U.box(), x, y0 + sy / 2, z, [0, ry, 0], [sx, sy, sz], color, layer, extra); }
  // A box by its extents.
  span(x0, x1, y0, y1, z0, z1, color, layer = 'body', extra) {
    return this.put(U.box(), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, null, [Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)], color, layer, extra);
  }
  // A box between two points on the ground plane (a beam, rail or wall run), centre height y.
  beam(ax, az, bx, bz, y, thick, tall, color, layer = 'body', extra) {
    const len = Math.hypot(bx - ax, bz - az);
    return this.put(U.box(), (ax + bx) / 2, y, (az + bz) / 2, [0, -Math.atan2(bz - az, bx - ax), 0], [len, tall, thick], color, layer, extra);
  }
  cyl(x, y0, z, r, h, color, seg = 8, layer = 'body', extra, top = 1) { return this.put(U.cyl(seg, top), x, y0 + h / 2, z, null, [r, h, r], color, layer, extra); }
  // A cylinder lying along local z (wheels, pipes) or x (axis 'x').
  tube(x, y, z, r, len, color, axis = 'z', seg = 8, layer = 'body', extra) {
    return this.put(U.cyl(seg), x, y, z, axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2], [r, len, r], color, layer, extra);
  }
  cone(x, y0, z, r, h, color, seg = 8, layer = 'body') { return this.put(U.cone(seg), x, y0 + h / 2, z, null, [r, h, r], color, layer); }
  // A four-sided pyramid roof over a w x d base.
  pyramid(x, y0, z, w, d, h, color) { return this.put(U.cone(4), x, y0 + h / 2, z, [0, Math.PI / 4, 0], [w / Math.SQRT2, h, d / Math.SQRT2], color); }
  // A gable prism: base sx x sz at y0, ridge along local z (turn with ry).
  wedge(x, y0, z, sx, h, sz, color, ry = 0, layer = 'body') { return this.put(U.wedge(), x, y0, z, [0, ry, 0], [sx, h, sz], color, layer); }
  blob(x, y, z, r, color, sy = 1, layer = 'body', ry = 0) { return this.put(U.ico(), x, y, z, [0, ry, 0], [r, r * sy, r], color, layer); }
  // A flat ring (or arc) on the ground at height y.
  ring(x, y, z, rOuter, rInner, color, seg = 24, arc = Math.PI * 2, ry = 0) {
    return this.put(U.ring(seg, +(rInner / rOuter).toFixed(4), +arc.toFixed(4)), x, y, z, [-Math.PI / 2, 0, ry], [rOuter, rOuter, 1], color);
  }
  disc(x, y, z, r, color, seg = 16, face = 'u', layer = 'body', extra) {
    const rot = face === 'u' ? [-Math.PI / 2, 0, 0] : [0, FACE_RY[face], 0];
    return this.put(U.disc(seg), x, y, z, rot, [r, r, 1], color, layer, extra);
  }
  // A flat rectangle facing `face` ('f' +x, 'b' -x, 'p' +z, 'n' -z, 'u' up).
  quad(x, y, z, w, h, face, color, layer = 'body', extra) {
    const rot = face === 'u' ? [-Math.PI / 2, 0, 0] : [0, FACE_RY[face], 0];
    return this.put(U.plane(), x, y, z, rot, [w, h, 1], color, layer, extra);
  }
  // Ground cover: a thin slab whose top is at y (above the lot surface).
  pad(x0, x1, z0, z1, color, y = 0.2) { return this.span(x0, x1, y - 0.08, y, z0, z1, color); }

  // ---------------------------------------------------------------- glowing parts
  // One window (split into panes) on a face; lit by the site's window share.
  window(face, x, y, z, w, h, { glass = '#5f8ea3', light = '#ffd79c', panes = 1, mullion = 0.12, power = 1 } = {}) {
    const key = this.site.id + ':w' + (this.windowCount++);
    const extra = { glow: [GLOW.windows, this.slot, 0.02 + 0.97 * scatter(key)], emit: light, power };
    const pw = (w - mullion * (panes - 1)) / panes;
    for (let i = 0; i < panes; i++) {
      const o = -w / 2 + pw / 2 + i * (pw + mullion);
      if (face === 'f' || face === 'b') this.quad(x, y, z + o, pw, h, face, glass, 'glow', extra);
      else this.quad(x + o, y, z, pw, h, face, glass, 'glow', extra);
    }
    return this;
  }
  // A row of windows per floor along a face. plane: the face's x (f/b) or z (p/n);
  // a0..a1: the stretch along the face; floors from y0, `floorH` apart.
  windows(face, plane, a0, a1, { y0 = GROUND, floors = 1, floorH = 6, first = 0, sill = 1.7, h = 2.6, w = 2.4, pitch = 4, panes = 2, glass, light, skip = null, frame = null, out = 0.05 } = {}) {
    const n = Math.max(1, Math.floor((a1 - a0) / pitch)), step = (a1 - a0) / n;
    const sgn = face === 'f' || face === 'p' ? 1 : -1, off = sgn * out;
    for (let f = first; f < floors; f++) {
      for (let i = 0; i < n; i++) {
        const a = a0 + step * (i + 0.5);
        if (skip && skip(a, f)) continue;
        const y = y0 + f * floorH + sill + h / 2;
        if (face === 'f' || face === 'b') {
          if (frame) this.span(plane, plane + sgn * 0.24, y - h / 2 - 0.22, y - h / 2, a - w / 2 - 0.15, a + w / 2 + 0.15, frame);
          this.window(face, plane + off, y, a, w, h, { glass, light, panes });
        } else {
          if (frame) this.span(a - w / 2 - 0.15, a + w / 2 + 0.15, y - h / 2 - 0.22, y - h / 2, plane, plane + sgn * 0.24, frame);
          this.window(face, a, y, plane + off, w, h, { glass, light, panes });
        }
      }
    }
    return this;
  }
  // A glowing part following a channel ('entry', 'sign', 'lamps', 'beacon', 'always').
  glowBox(x, y0, z, sx, sy, sz, color, emit, channel = 'lamps', power = 1, ry = 0) {
    return this.box(x, y0, z, sx, sy, sz, color, ry, 'glow', { glow: [GLOW[channel], this.slot, unit(this.site.id + x + ':' + z)], emit, power });
  }
  glowQuad(x, y, z, w, h, face, color, emit, channel = 'entry', power = 1) {
    return this.quad(x, y, z, w, h, face, color, 'glow', { glow: [GLOW[channel], this.slot, 0], emit, power });
  }
  // A sign from the atlas (key) on a face, centred at (x, y, z), w wide (height from the
  // atlas aspect unless h is given). channel: what lights it at night.
  sign(key, face, x, y, z, w, { h = null, channel = 'sign', power = 0.9 } = {}) {
    const item = this.b.atlas.items.get(key);
    if (!item) { console.warn('a-kit: no sign', key); return this; }
    const hh = h || w / item.aspect;
    const off = face === 'f' || face === 'p' ? 0.06 : face === 'u' ? 0 : -0.06;
    const px = face === 'f' || face === 'b' ? x + off : x, pz = face === 'p' || face === 'n' ? z + off : z;
    return this.quad(px, y, pz, w, hh, face, '#ffffff', 'sign', { glow: [channel ? GLOW[channel] : GLOW.none, this.slot, 0], emit: '#ffffff', power, uv: item.uv });
  }
  // A light source at local (x, z), height y.
  light(x, y, z, radius, color, intensity, group, kind) {
    const p = this.f.toWorld(x, z);
    this.b.light(+p.x.toFixed(2), +y.toFixed(2), +p.z.toFixed(2), radius, color, intensity, group, kind);
    return this;
  }
}

export { U as UNIT_SHAPES };
