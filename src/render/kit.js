// Small helpers every render module shares: merged low-poly geometry with vertex
// colours, a material cache, sign textures with Chinese text, and the palette.
// Modules are free to build their own geometry; these just keep the common cases short.

import * as THREE from 'three';

// The town's palette: warm modern Taiwanese streets.
export const PALETTE = {
  asphalt: '#3d4146', asphaltLight: '#4a4f55', marking: '#f2f0e6', markingYellow: '#e8b531',
  pavement: '#c9c2b5', pavementDark: '#aaa293', kerb: '#d9d4ca', grass: '#7aa35b', grassDark: '#5f8a47',
  water: '#4f8fa0', stone: '#e6dfd2', concrete: '#bdb7ad', brick: '#b8664a', tile: '#e9e2d4',
  glass: '#6f9fb4', glassDark: '#35566a', metal: '#8c949b', darkMetal: '#3b4045', wood: '#a7774f',
  roofDark: '#59606a', accentRed: '#c9483b', accentTeal: '#3f8f88', accentYellow: '#f0c03a', accentBlue: '#3e6fa8',
  skin: ['#f1cfae', '#e3b48c', '#c98f63', '#a9744c'], hair: ['#231d1a', '#3a2a22', '#5b4231', '#8c8c8c', '#d9d4ce']
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

// Collects primitives (each with a colour and a transform) and merges them into one
// non-indexed BufferGeometry with position, normal and color attributes.
export class ShapeBuilder {
  constructor() { this.positions = []; this.normals = []; this.colors = []; }
  // Add any geometry with a transform matrix and a colour (CSS string or THREE.Color).
  add(geometry, matrix, color) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const pos = g.attributes.position, nor = g.attributes.normal;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    _c.set(color);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      n.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
      this.positions.push(v.x, v.y, v.z); this.normals.push(n.x, n.y, n.z); this.colors.push(_c.r, _c.g, _c.b);
    }
    if (g !== geometry) g.dispose();
    geometry.dispose();
    return this;
  }
  // Position (x, y, z) is the centre; rotation in radians [rx, ry, rz].
  transform(x, y, z, rotation = null, scale = null) {
    _e.set(...(rotation || [0, 0, 0]));
    return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e), scale ? _s.set(...scale) : _s.set(1, 1, 1));
  }
  box(x, y, z, w, h, d, color, rotation) { return this.add(new THREE.BoxGeometry(w, h, d), this.transform(x, y, z, rotation), color); }
  // A box standing on y (its base at y instead of its centre).
  block(x, y, z, w, h, d, color, rotY = 0) { return this.box(x, y + h / 2, z, w, h, d, color, [0, rotY, 0]); }
  cylinder(x, y, z, radiusTop, radiusBottom, h, color, segments = 10, rotation) {
    return this.add(new THREE.CylinderGeometry(radiusTop, radiusBottom, h, segments), this.transform(x, y, z, rotation), color);
  }
  sphere(x, y, z, r, color, widthSegments = 10, heightSegments = 7, scale) {
    return this.add(new THREE.SphereGeometry(r, widthSegments, heightSegments), this.transform(x, y, z, null, scale), color);
  }
  cone(x, y, z, r, h, color, segments = 10, rotation) { return this.add(new THREE.ConeGeometry(r, h, segments), this.transform(x, y, z, rotation), color); }
  get vertexCount() { return this.positions.length / 3; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

// Shared materials, one per look. Vertex-coloured unless `vertexColors: false`.
const materialCache = new Map();
export function material(options = {}) {
  const key = JSON.stringify(options);
  if (!materialCache.has(key)) {
    const { kind = 'standard', ...rest } = options;
    const params = { vertexColors: true, roughness: 0.85, metalness: 0, ...rest };
    const m = kind === 'basic' ? new THREE.MeshBasicMaterial({ vertexColors: params.vertexColors, color: rest.color || '#ffffff', transparent: rest.transparent, opacity: rest.opacity })
      : new THREE.MeshStandardMaterial(params);
    m.name = 'kit:' + key;
    materialCache.set(key, m);
  }
  return materialCache.get(key);
}

// A canvas texture with text on it, for signs. Returns {texture, aspect}.
export function signTexture(text, { color = '#ffffff', background = '#2d5f73', font = '700 64px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif',
  padding = 24, height = 96, border = null } = {}) {
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  ctx.font = font;
  const width = Math.ceil(ctx.measureText(text).width + padding * 2);
  canvas.width = Math.max(16, width); canvas.height = height;
  if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  if (border) { ctx.strokeStyle = border; ctx.lineWidth = 6; ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6); }
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, aspect: canvas.width / canvas.height };
}

// An instanced mesh from a list of {x, y, z, rotY, scale (number or [sx, sy, sz]), color}.
export function instanced(geometry, mat, items, { castShadow = true, receiveShadow = true } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, mat, Math.max(1, items.length));
  mesh.count = items.length;
  items.forEach((it, i) => {
    const s = it.scale === undefined ? 1 : it.scale;
    _m.compose(_p.set(it.x, it.y || 0, it.z), _q.setFromEuler(_e.set(0, it.rotY || 0, 0)), Array.isArray(s) ? _s.set(...s) : _s.set(s, s, s));
    mesh.setMatrixAt(i, _m);
    if (it.color) mesh.setColorAt(i, _c.set(it.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
  mesh.computeBoundingSphere();
  return mesh;
}

// Dispose every geometry, material and texture under an object.
export function disposeTree(object) {
  object.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) { if (m.name && m.name.startsWith('kit:')) continue; for (const k of Object.keys(m)) if (m[k] && m[k].isTexture) m[k].dispose(); m.dispose(); }
  });
}
