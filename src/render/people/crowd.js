// The crowd: up to `capacity` different people in ONE draw call.
//
// Every slot owns a fixed region of one big BufferGeometry, filled by assign() with the
// figure from build.js (vertices carry flat colours and a bone index). Posing writes one
// 3×4 matrix per bone into a float texture; the vertex shader skins each vertex from it
// (rigid, one bone per vertex). show() rewrites the draw index so only the slots on
// screen cost anything. Nothing is allocated per frame.

import * as THREE from 'three';
import { appearanceOf } from './appearance.js';
import { buildFigure } from './build.js';
import { solvePose } from './pose.js';
import { BONES } from './body.js';

const VMAX = 800;            // vertices a slot can hold
const TMAX = 1300;           // triangles a slot can hold
const ROW = BONES * 3;       // texels per slot (three per bone)
const CACHE = 360;           // figures kept built, by resident id

export const skinHead = bones => /* glsl */ `
uniform highp sampler2D uBones;
attribute float aSkin;
void skinFetch(out vec4 r0, out vec4 r1, out vec4 r2) {
  int s = int(aSkin + 0.5);
  int slot = s / ${bones};
  int b = s - slot * ${bones};
  r0 = texelFetch(uBones, ivec2(b * 3, slot), 0);
  r1 = texelFetch(uBones, ivec2(b * 3 + 1, slot), 0);
  r2 = texelFetch(uBones, ivec2(b * 3 + 2, slot), 0);
}
vec3 skinPoint(vec3 p) { vec4 a, b, c; skinFetch(a, b, c); return vec3(dot(a.xyz, p) + a.w, dot(b.xyz, p) + b.w, dot(c.xyz, p) + c.w); }
vec3 skinDir(vec3 n) { vec4 a, b, c; skinFetch(a, b, c); return vec3(dot(a.xyz, n), dot(b.xyz, n), dot(c.xyz, n)); }
`;

export function skinned(material, uniforms, bones = BONES) {
  material.onBeforeCompile = shader => {
    shader.uniforms.uBones = uniforms.uBones;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + skinHead(bones))
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = skinDir(normal);\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(tangent.xyz);\n#endif')
      .replace('#include <begin_vertex>', 'vec3 transformed = skinPoint(position);');
  };
  material.customProgramCacheKey = () => 'people-skinned-' + bones;
  return material;
}

export function createCrowd({ capacity = 420, quality = 'full' } = {}) {
  const lite = quality === 'lite';
  const V = capacity * VMAX;
  const position = new Float32Array(V * 3), normal = new Int8Array(V * 3), color = new Uint16Array(V * 3), skin = new Uint16Array(V);
  const slotIndex = new Uint32Array(capacity * TMAX * 3);
  const drawIndex = new Uint32Array(capacity * TMAX * 3);
  const bones = new Float32Array(capacity * ROW * 4);

  const geometry = new THREE.BufferGeometry();
  const attrs = {
    position: new THREE.BufferAttribute(position, 3),
    normal: new THREE.BufferAttribute(normal, 3, true),
    color: new THREE.BufferAttribute(color, 3, true),
    aSkin: new THREE.BufferAttribute(skin, 1)
  };
  for (const [name, a] of Object.entries(attrs)) { a.setUsage(THREE.DynamicDrawUsage); geometry.setAttribute(name, a); }
  const index = new THREE.BufferAttribute(drawIndex, 1);
  index.setUsage(THREE.DynamicDrawUsage);
  geometry.setIndex(index);
  geometry.setDrawRange(0, 0);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-1e6, -1e6, -1e6), new THREE.Vector3(1e6, 1e6, 1e6));

  const texture = new THREE.DataTexture(bones, ROW, capacity, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  const uniforms = { uBones: { value: texture } };

  const material = skinned(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }), uniforms);
  const depth = skinned(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), uniforms);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'crowd';
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.customDepthMaterial = depth;

  const slots = Array.from({ length: capacity }, () => ({ id: null, rig: null, indices: 0, verts: 0 }));
  const cache = new Map();
  let shown = new Int32Array(0), shownCount = 0, drawn = 0, drawnTriangles = 0;

  function figureFor(resident) {
    let f = cache.get(resident.id);
    if (f) { cache.delete(resident.id); cache.set(resident.id, f); return f; }
    f = buildFigure(appearanceOf(resident), { lite });
    cache.set(resident.id, f);
    if (cache.size > CACHE) cache.delete(cache.keys().next().value);
    return f;
  }

  function assign(s, resident) {
    const slot = slots[s];
    if (!slot) return false;
    if (slot.id === resident.id && slot.rig) return true;
    const f = figureFor(resident), m = f.mesh;
    if (m.vertexCount > VMAX || m.triangleCount > TMAX) return false;
    const base = s * VMAX, n = m.vertexCount;
    position.set(m.positions, base * 3);
    normal.set(m.normals, base * 3);
    color.set(m.colors, base * 3);
    for (let i = 0; i < n; i++) skin[base + i] = s * BONES + m.bones[i];
    const at = s * TMAX * 3;
    for (let i = 0; i < m.indices.length; i++) slotIndex[at + i] = m.indices[i] + base;
    slot.id = resident.id; slot.rig = f.rig; slot.indices = m.indices.length; slot.verts = n;
    for (const [name, a] of Object.entries(attrs)) {
      const size = a.itemSize;
      a.addUpdateRange(base * size, n * size);
      a.needsUpdate = true;
    }
    bones.fill(0, s * ROW * 4, (s + 1) * ROW * 4);
    texture.needsUpdate = true;
    shownCount = -1;           // the draw index must be rebuilt
    return true;
  }

  // p = { x, y, z, heading, stride, pose, eat }
  function pose(s, p) {
    const slot = slots[s];
    if (!slot || !slot.rig) return;
    solvePose(slot.rig, p, bones, s * ROW * 4);
    texture.needsUpdate = true;
  }

  function show(list) {
    let same = shownCount === list.length;
    for (let i = 0; same && i < list.length; i++) if (shown[i] !== list[i]) same = false;
    if (same) return;
    if (shown.length < list.length) shown = new Int32Array(Math.max(list.length, shown.length * 2));
    let n = 0, count = 0, tris = 0;
    for (let i = 0; i < list.length; i++) {
      shown[i] = list[i];
      const slot = slots[list[i]];
      if (!slot || !slot.rig) continue;
      const at = list[i] * TMAX * 3;
      drawIndex.set(slotIndex.subarray(at, at + slot.indices), n);
      n += slot.indices; count++; tris += slot.indices / 3;
    }
    shownCount = list.length;
    drawn = count; drawnTriangles = tris;
    geometry.setDrawRange(0, n);
    index.clearUpdateRanges();
    index.addUpdateRange(0, n);
    index.needsUpdate = true;
    mesh.visible = n > 0;
  }

  const holder = s => (slots[s] ? slots[s].id : null);
  function dispose() { geometry.dispose(); texture.dispose(); material.dispose(); depth.dispose(); mesh.removeFromParent(); cache.clear(); }
  function info() {
    return { capacity, assigned: slots.reduce((n, s) => n + (s.rig ? 1 : 0), 0), shown: drawn, triangles: drawnTriangles, drawCalls: 2, cached: cache.size };
  }
  return { object: mesh, assign, pose, show, holder, dispose, info };
}

// One figure on its own (the followed person's marker). Move/rotate `object` yourself.
export function createFigure(resident) {
  const crowd = createCrowd({ capacity: 1 });
  crowd.assign(0, resident);
  crowd.show([0]);
  const p = { x: 0, y: 0, z: 0, heading: 0, stride: 0, pose: 'walk' };
  return {
    object: crowd.object,
    update(stride = 0, pose = 'walk') { p.stride = stride; p.pose = pose; crowd.pose(0, p); },
    dispose: crowd.dispose
  };
}
