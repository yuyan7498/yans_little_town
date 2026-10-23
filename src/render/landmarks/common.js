// Helpers the landmark modules share: struts, soft glow points, lit materials, the
// level of the night lights. Landmark-only; the town-wide helpers are in ../kit.js.

import * as THREE from 'three';
import { ShapeBuilder, disposeTree } from '../kit.js';

export { ShapeBuilder, disposeTree };

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();

export const clamp01 = v => Math.max(0, Math.min(1, v));
export const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// A round strut between two points.
export function beam(sb, a, b, r, color, segments = 5) {
  _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]);
  const dir = _b.clone().sub(_a), len = dir.length();
  if (len < 1e-6) return sb;
  _q.setFromUnitVectors(UP, dir.normalize());
  _m.compose(_a.clone().add(_b).multiplyScalar(0.5), _q, _s.set(1, 1, 1));
  return sb.add(new THREE.CylinderGeometry(r, r, len, segments), _m.clone(), color);
}

// A box between two points' x/z/y extents given as a centre and a rotation about y.
export function slab(sb, x, y, z, w, h, d, color, rotY = 0) { return sb.block(x, y, z, w, h, d, color, rotY); }

// A ring (torus) lying in the plane facing +z, then rotated by `rotation` and moved.
export function ring(sb, x, y, z, radius, tube, color, rotation = [0, 0, 0], radial = 6, tubular = 28) {
  return sb.add(new THREE.TorusGeometry(radius, tube, radial, tubular), sb.transform(x, y, z, rotation), color);
}

// One soft round sprite shared by every glow.
let dotTexture = null;
export function glowDot() {
  if (dotTexture) return dotTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.28, 'rgba(255,255,255,0.75)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.18)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  dotTexture = new THREE.CanvasTexture(c);
  dotTexture.colorSpace = THREE.SRGBColorSpace;
  return dotTexture;
}

// A set of glowing points (bulbs, halos) in one draw call; `level` scales the light.
export class Glows {
  constructor() { this.p = []; this.c = []; this.sizes = []; }
  add(x, y, z, color, size = 1.4) {
    const col = new THREE.Color(color);
    this.p.push(x, y, z); this.c.push(col.r, col.g, col.b); this.sizes.push(size);
    return this;
  }
  get count() { return this.p.length / 3; }
  // Points sized per vertex through a tiny shader (so halos can differ in size).
  build({ scale = 1, opacity = 1 } = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('size', new THREE.Float32BufferAttribute(this.sizes, 1));
    g.computeBoundingSphere();
    const material = new THREE.ShaderMaterial({
      uniforms: { map: { value: glowDot() }, level: { value: 0 }, scale: { value: 300 * scale }, opacity: { value: opacity } },
      vertexShader: `attribute float size; varying vec3 vColor; uniform float scale;
        void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; uniform float level; uniform float opacity; varying vec3 vColor;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vColor * level * opacity, 1.0) * t.a; }`,
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const points = new THREE.Points(g, material);
    points.frustumCulled = false;
    points.userData.level = v => { material.uniforms.level.value = v; points.visible = v > 0.01; };
    points.userData.setScale = v => { material.uniforms.scale.value = v; };
    return points;
  }
}

// Point sprites are sized in world units; the shader needs pixels per unit at distance 1.
// The canvas fills the window, so its pixel height comes from the window.
export function pointScale(frame, base = 1) {
  const fov = frame.camera && frame.camera.isPerspectiveCamera ? frame.camera.fov : 30;
  const px = (typeof innerHeight === 'number' ? innerHeight : 800) * Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2);
  return base * px / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
}

// A lit material for glowing parts: vertex colours, unaffected by the sun, scaled by a level.
export function litMaterial(options = {}) {
  return new THREE.MeshBasicMaterial({ vertexColors: true, ...options });
}

export function setLevel(material, level, base = 0.18) {
  const v = base + (1 - base) * level;
  material.color.setScalar(v);
}

export function mesh(geometry, material, { shadow = false, receive = true, isStatic = true } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = shadow; m.receiveShadow = receive;
  if (isStatic) { m.matrixAutoUpdate = false; m.updateMatrix(); }
  return m;
}

// Where the market and park lights switch on: night market hours (18:00 on).
export const MARKET_OPEN = 1080;
export const marketLevel = frame => (frame.minute >= MARKET_OPEN - 10 ? smoothstep(MARKET_OPEN - 10, MARKET_OPEN + 5, frame.minute) : 0);

// A deterministic 0..1 from integers (for scattering without Math.random).
export function noise(i, salt = 0) {
  let h = (Math.imul(i + 1, 374761393) ^ Math.imul(salt + 7, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function lightSource(x, y, z, radius, color, intensity, group, kind) { return { x, y, z, radius, color, intensity, group, kind }; }

// Standard module scaffolding: root group, dispose.
export function moduleBase(name) {
  const group = new THREE.Group();
  group.name = name;
  return { group, dispose() { disposeTree(group); } };
}
