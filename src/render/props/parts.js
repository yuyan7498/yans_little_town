// Building blocks shared by the prop models (vehicles, signals, stops, street furniture).
//
// A model is one merged, flat-shaded geometry, so a hundred scooters are one draw call.
// Besides a flat colour every part carries a *look* that the one prop material reads:
//   paint  the part takes the instance's colour (car body) instead of staying as built
//   glow   it lights up: > 0 with the street lamps (frame.lamps), < 0 always (LED boards)
//   flash  it blinks with one of two alternating flash groups (+1 / -1: a police light bar)
//   tex    it shows a patch of a texture atlas (signs, text); 2 = the patch moves down by
//          the instance's `instanceRow` (bus destination boards, street-name plates)
// Model space: forward +x, up +y, width along z; the base stands on y = 0.

import * as THREE from 'three';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

// A transform matrix: position, optional rotation [rx, ry, rz] and scale [sx, sy, sz].
export function at(x, y, z, rot = null, scale = null) {
  _e.set(...(rot || [0, 0, 0]));
  return new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e), scale ? _s.set(...scale) : _s.set(1, 1, 1));
}

const signedArea = pts => pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;

// The part of polygon `pts` below (keep = -1) or above (keep = 1) the line y = c.
export function clipY(pts, c, keep = -1) {
  const inside = p => (keep < 0 ? p[1] <= c : p[1] >= c);
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    if (inside(p)) out.push(p);
    if (inside(p) !== inside(q)) { const t = (c - p[1]) / (q[1] - p[1]); out.push([p[0] + t * (q[0] - p[0]), c]); }
  }
  return out;
}

export class PropBuilder {
  constructor() { this.position = []; this.color = []; this.look = []; this.uv = []; this.stack = [new THREE.Matrix4()]; }

  get base() { return this.stack[this.stack.length - 1]; }
  // Build part of a model in a frame of its own (a parked bike in a rack, a stool by a table).
  within(matrix, fn) { this.stack.push(this.base.clone().multiply(matrix)); try { fn(this); } finally { this.stack.pop(); } return this; }

  // Add any geometry (consumed) under `matrix` with a colour and look options
  // {paint, glow, flash, tex: [u0, v0, u1, v1] atlas rect for the geometry's uv 0..1, row}.
  add(geometry, matrix, color, o = {}) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const pos = g.attributes.position, uv = g.attributes.uv, m = this.base.clone().multiply(matrix);
    _c.set(color);
    const paint = o.paint ? 1 : 0, glow = o.glow || 0, flash = o.flash || 0, tex = o.tex ? (o.row ? 2 : 1) : 0, r = o.tex;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(m);
      this.position.push(_v.x, _v.y, _v.z);
      this.color.push(_c.r, _c.g, _c.b);
      this.look.push(paint, glow, flash, tex);
      if (r && uv) this.uv.push(r[0] + (r[2] - r[0]) * uv.getX(i), r[1] + (r[3] - r[1]) * uv.getY(i));
      else this.uv.push(0, 0);
    }
    if (g !== geometry) g.dispose();
    geometry.dispose();
    return this;
  }

  // A box by its centre.
  box(x, y, z, w, h, d, color, o = {}) { return this.add(new THREE.BoxGeometry(w, h, d), at(x, y, z, o.rot, o.scale), color, o); }
  // A box standing on y.
  block(x, y, z, w, h, d, color, o = {}) { return this.box(x, y + h / 2, z, w, h, d, color, o); }
  // A cylinder by its centre, along o.axis ('y' default, 'x' or 'z').
  cyl(x, y, z, rTop, rBottom, h, color, o = {}) {
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, o.seg || 8, 1, !!o.open, o.thetaStart || 0, o.thetaLength || Math.PI * 2);
    if (o.axis === 'z') g.rotateX(Math.PI / 2);
    else if (o.axis === 'x') g.rotateZ(-Math.PI / 2);
    return this.add(g, at(x, y, z, o.rot, o.scale), color, o);
  }
  // A wheel or disc across the width (axis z).
  wheel(x, y, z, r, width, color, o = {}) { return this.cyl(x, y, z, r, r, width, color, { seg: 10, ...o, axis: 'z' }); }
  // A rod from a to b ([x, y, z]).
  rod(a, b, r, color, o = {}) {
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = dir.length();
    const g = new THREE.CylinderGeometry(o.r2 === undefined ? r : o.r2, r, len, o.seg || 6, 1, false);
    const m = new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2),
      new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()), new THREE.Vector3(1, 1, 1));
    return this.add(g, m, color, o);
  }
  // A faceted ball (icosahedron), optionally squashed by o.scale.
  ball(x, y, z, r, color, o = {}) { return this.add(new THREE.IcosahedronGeometry(r, o.detail || 0), at(x, y, z, o.rot, o.scale), color, o); }
  cone(x, y, z, r, h, color, o = {}) { return this.add(new THREE.ConeGeometry(r, h, o.seg || 8, 1, !!o.open), at(x, y, z, o.rot, o.scale), color, o); }
  // A flat rectangle w × h whose front faces `facing` ('+x' '-x' '+z' '-z' '+y' '-y'),
  // reading the right way round from that side; with o.tex it shows that atlas patch.
  quad(x, y, z, w, h, facing, color, o = {}) {
    const g = new THREE.PlaneGeometry(w, h);
    const turn = { '+x': [0, Math.PI / 2, 0], '-x': [0, -Math.PI / 2, 0], '+z': [0, 0, 0], '-z': [0, Math.PI, 0], '+y': [-Math.PI / 2, 0, 0], '-y': [Math.PI / 2, 0, 0] }[facing];
    g.rotateX(turn[0]); g.rotateY(turn[1]);
    if (o.spin) g.rotateY(o.spin);
    return this.add(g, at(x, y, z, o.rot), color, o);
  }
  // A prism from a side profile [[x, y], ...] in the x-y plane, `half` wide each side of
  // z = o.z (a number, or a function (x, y) → half width, so a cabin can lean inward).
  loft(profile, half, color, o = {}) {
    const pts = signedArea(profile) < 0 ? profile.slice().reverse() : profile;
    const hw = typeof half === 'function' ? half : () => half, zc = o.z || 0, out = [];
    const vert = (p, side) => out.push(p[0], p[1], zc + side * hw(p[0], p[1]));
    const tris = THREE.ShapeUtils.triangulateShape(pts.map(p => new THREE.Vector2(p[0], p[1])), []);
    for (const t of tris) {
      const [a, b, c] = signedArea([pts[t[0]], pts[t[1]], pts[t[2]]]) < 0 ? [t[0], t[2], t[1]] : t;
      vert(pts[a], 1); vert(pts[b], 1); vert(pts[c], 1);
      vert(pts[a], -1); vert(pts[c], -1); vert(pts[b], -1);
    }
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      vert(p, -1); vert(q, -1); vert(q, 1);
      vert(p, -1); vert(q, 1); vert(p, 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    return this.add(g, at(0, 0, 0), color, o);
  }

  get vertexCount() { return this.position.length / 3; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.color, 3));
    g.setAttribute('look', new THREE.Float32BufferAttribute(this.look, 4));
    g.setAttribute('atlasUv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();          // non-indexed: one normal per face, the faceted look
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}

// A canvas texture atlas: allocate a patch, draw into it, get its uv rect back.
export class Atlas {
  constructor(width = 1024, height = 1024) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width; this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.fillStyle = '#ffffff'; this.ctx.fillRect(0, 0, width, height);
    this.x = 0; this.y = 0; this.rowH = 0; this.pad = 4;
    this.texture = null;
  }
  // A patch w × h pixels; draw(ctx, w, h) paints it with (0, 0) at its top left.
  // Returns [u0, v0, u1, v1] (v up, the texture's flipY convention).
  patch(w, h, draw) {
    const W = this.canvas.width, H = this.canvas.height;
    if (this.x + w > W) { this.x = 0; this.y += this.rowH + this.pad; this.rowH = 0; }
    if (this.y + h > H) throw new Error('props atlas full');
    const x = this.x, y = this.y;
    this.ctx.save(); this.ctx.translate(x, y); this.ctx.beginPath(); this.ctx.rect(0, 0, w, h); this.ctx.clip();
    draw(this.ctx, w, h);
    this.ctx.restore();
    this.x += w + this.pad; this.rowH = Math.max(this.rowH, h);
    const inset = 0.5;
    return [(x + inset) / W, 1 - (y + h - inset) / H, (x + w - inset) / W, 1 - (y + inset) / H];
  }
  // A column of `n` equal patches; the instance's row picks one. Returns {rect (row 0), step}.
  rows(w, h, n, draw) {
    const W = this.canvas.width, H = this.canvas.height;
    if (this.x + w > W) { this.x = 0; this.y += this.rowH + this.pad; this.rowH = 0; }
    const x = this.x, y = this.y;
    if (y + h * n > H) throw new Error('props atlas full');
    for (let i = 0; i < n; i++) {
      this.ctx.save(); this.ctx.translate(x, y + i * h); this.ctx.beginPath(); this.ctx.rect(0, 0, w, h); this.ctx.clip();
      draw(this.ctx, w, h, i);
      this.ctx.restore();
    }
    this.x += w + this.pad; this.rowH = Math.max(this.rowH, h * n);
    return { rect: [(x + 0.5) / W, 1 - (y + h - 0.5) / H, (x + w - 0.5) / W, 1 - (y + 0.5) / H], step: h / H };
  }
  finish() {
    const t = new THREE.CanvasTexture(this.canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture = t;
    return t;
  }
}

// Text centred in a box on an atlas canvas, shrunk to fit.
export const FONT = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Heiti TC", sans-serif';
export function fitText(ctx, text, x, y, w, h, { color = '#ffffff', weight = 700, size = h * 0.8, font = FONT } = {}) {
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let s = size;
  ctx.font = `${weight} ${s}px ${font}`;
  const m = ctx.measureText(text).width;
  if (m > w) { s *= w / m; ctx.font = `${weight} ${s}px ${font}`; }
  ctx.fillText(text, x + w / 2, y + h / 2 + s * 0.04);
}

// The prop material: MeshStandardMaterial reading the parts' looks. Its uniforms live
// on material.userData.uniforms: uLamps (0..1), uFlash (vec2: the two flash groups).
export function propMaterial({ atlas = null, rowStep = 0, roughness = 0.78, metalness = 0.04, side = THREE.FrontSide } = {}) {
  const rows = rowStep > 0;
  const uniforms = { uLamps: { value: 0 }, uFlash: { value: new THREE.Vector2(0, 0) }, uAtlas: { value: atlas }, uRowStep: { value: rowStep } };
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness, side });
  m.name = 'props';
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 look;
attribute vec2 atlasUv;
varying vec3 vLook;
varying vec2 vAtlasUv;
${rows ? 'attribute float instanceRow;\nuniform float uRowStep;' : ''}`)
      .replace('#include <color_vertex>', `vColor = color;
#ifdef USE_INSTANCING_COLOR
  vColor *= mix(vec3(1.0), instanceColor, look.x);
#endif
vLook = look.yzw;
vAtlasUv = atlasUv;
${rows ? 'if (look.w > 1.5) vAtlasUv.y -= instanceRow * uRowStep;' : ''}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vLook;
varying vec2 vAtlasUv;
uniform float uLamps;
uniform vec2 uFlash;
${atlas ? 'uniform sampler2D uAtlas;' : ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
${atlas ? 'if (vLook.z > 0.5) diffuseColor.rgb *= texture2D(uAtlas, vAtlasUv).rgb;' : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float propGlow = vLook.x > 0.0 ? vLook.x * uLamps : -vLook.x;
propGlow += vLook.y > 0.5 ? uFlash.x : (vLook.y < -0.5 ? uFlash.y : 0.0);
totalEmissiveRadiance += diffuseColor.rgb * propGlow;`);
  };
  m.customProgramCacheKey = () => 'props-v1' + (atlas ? '-atlas' : '') + (rows ? '-rows' : '');
  return m;
}

// An instanced mesh of one model, with instance colours (white = as built) ready.
export function instancedModel(geometry, mat, capacity, { name = 'prop', dynamic = false, castShadow = true, receiveShadow = true, rows = false } = {}) {
  const n = Math.max(1, capacity);
  const mesh = new THREE.InstancedMesh(geometry, mat, n);
  mesh.name = name;
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
  if (rows) geometry.setAttribute('instanceRow', new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
  if (dynamic) { mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; }
  mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
  mesh.count = 0;
  return mesh;
}

// Colour helpers: a CSS colour → cached THREE.Color (no parsing in hot loops).
const colorCache = new Map();
export function cachedColor(css) {
  let c = colorCache.get(css);
  if (!c) { c = new THREE.Color(css); colorCache.set(css, c); }
  return c;
}

// A soft round glow sprite texture (for halos), white on transparent.
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.18, 'rgba(255,255,255,0.65)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.18)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

// Camera-facing additive halos, one per instance (position = matrix translation, size =
// its x scale, colour = instance colour; black = off). One draw call for any number.
export function haloMesh(capacity, name = 'halos') {
  const mat = new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: true });
  mat.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
float haloSize = length(instanceMatrix[0].xyz);
mvPosition.xy += position.xy * haloSize;
mvPosition.z += haloSize * 0.3;
gl_Position = projectionMatrix * mvPosition;`);
  };
  mat.customProgramCacheKey = () => 'props-halo-v1';
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, Math.max(1, capacity));
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, capacity) * 3), 3);
  mesh.name = name; mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.count = 0;
  mesh.castShadow = false; mesh.receiveShadow = false;
  return mesh;
}

// Dispose an object's geometries and materials (and their textures).
export function disposeObject(object) {
  object.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const k of Object.keys(m)) if (m[k] && m[k].isTexture && m[k] !== glowTex) m[k].dispose();
      const u = m.userData && m.userData.uniforms;
      if (u && u.uAtlas && u.uAtlas.value && u.uAtlas.value.isTexture) u.uAtlas.value.dispose();
      m.dispose();
    }
  });
  if (object.parent) object.parent.remove(object);
}

// A plain stand-in person (4.3 tall, hips 1.85) for judging scale in the previews only.
export function scaleFigure(b, x, z, color = '#d9734e', { seated = false, seatY = 1.4, heading = 0 } = {}) {
  b.within(at(x, 0, z, [0, -heading, 0]), () => {
    if (seated) {
      b.box(0, seatY + 0.15, 0, 0.9, 0.3, 0.9, '#34495e');
      b.box(0.65, seatY + 0.05, 0, 1.1, 0.3, 0.8, '#34495e');
      b.box(1.15, seatY / 2, 0, 0.3, seatY, 0.7, '#34495e');
      b.box(0, seatY + 1.15, 0, 0.55, 1.7, 0.95, color);
      b.ball(0, seatY + 2.35, 0, 0.42, '#f1cfae', { detail: 1 });
    } else {
      b.block(0, 0, 0.22, 0.38, 1.85, 0.36, '#34495e'); b.block(0, 0, -0.22, 0.38, 1.85, 0.36, '#34495e');
      b.block(0, 1.85, 0, 0.55, 1.65, 0.95, color);
      b.ball(0, 3.85, 0, 0.45, '#f1cfae', { detail: 1 });
    }
  });
}
