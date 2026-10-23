// Night lights for hundreds of static LightSources at a fixed, small cost.
//
// Pools: every light is splatted as a soft disc into one top-down "light map" (a
// half-float render target covering the board): RGB is the light falling on the ground,
// A carries the lights' mean height. The map is redrawn only when a group's level changes
// (dusk and dawn), in one instanced draw. Every lit material in the town (standard,
// physical, lambert, phong, toon) gets a few lines injected after its own lights: one
// texture read at the fragment's world position, nudged out along its normal so a wall
// picks up the pool in front of it, and faded above the lights' height so roofs and upper
// floors stay dark. Cost per pixel is one fetch whatever the number of lights.
//
// Glows: one instanced billboard per light head, drawn additively and depth-tested,
// with a minimum size in pixels so distant lamps still twinkle at the whole-town view.

import * as THREE from 'three';

// Group levels: which frame value drives each group.
export const GROUPS = ['lamps', 'facade', 'market', 'sign'];
// Per-group look: how big the head glow is (fraction of the pool radius) and how bright.
const GLOW = {
  lamps: { size: 0.1, gain: 0.85 },
  facade: { size: 0.08, gain: 0.55 },
  market: { size: 0.1, gain: 0.8 },
  sign: { size: 0, gain: 0 }
};
const POOL_GAIN = 2.6;        // irradiance at the centre of a full-intensity pool
const HEIGHT_SCALE = 64;      // light heights are stored as y / HEIGHT_SCALE
const MAP_SIZE = { full: 1024, lite: 512 };
const MAP_MARGIN = 40;        // the map reaches this far past the board
const GLOW_MIN_PX = { full: 3.2, lite: 2.6 };
// The night market's lights warm up and go out over these many minutes around its hours.
const MARKET_RAMP = 12;

// ---------------------------------------------------------------- shared uniforms
// One set of uniform objects shared by every patched material, so updating them once
// reaches the whole town.
const shared = {
  lpMap: { value: null },
  lpRect: { value: new THREE.Vector4(0, 0, 1, 1) },   // minX, minZ, 1/width, 1/depth
  lpGain: { value: 0 }                                  // 0 switches the pools off (day)
};

const PATCH_KEY = 'light-pools-v1';

const FRAGMENT_HEAD = /* glsl */`
uniform sampler2D lpMap;
uniform vec4 lpRect;
uniform float lpGain;
`;

const FRAGMENT_POOLS = /* glsl */`
#include <lights_fragment_end>
if (lpGain > 0.0) {
  // World position and normal from the view-space ones (the view matrix is a rigid motion).
  vec3 lpWorld = cameraPosition + (vec4(-vViewPosition, 0.0) * viewMatrix).xyz;
  vec3 lpNormal = (vec4(normal, 0.0) * viewMatrix).xyz;
  // Walls read the pool a step in front of them.
  vec2 lpUv = (lpWorld.xz + lpNormal.xz * 1.2 - lpRect.xy) * lpRect.zw;
  vec4 lpTexel = texture2D(lpMap, lpUv);
  float lpLum = dot(lpTexel.rgb, vec3(0.3333));
  if (lpLum > 1e-4) {
    float lpHeight = lpTexel.a * ${HEIGHT_SCALE.toFixed(1)} / lpLum;
    // Lights shine down: surfaces above them fade out.
    float lpBelow = 1.0 - smoothstep(-1.5, 5.0, lpWorld.y - lpHeight);
    // Ground full, walls a little less, undersides only a touch.
    float lpFacing = mix(0.72, 1.0, max(lpNormal.y, 0.0)) * (0.15 + 0.85 * smoothstep(-0.85, -0.2, lpNormal.y));
    vec3 lpIrradiance = lpTexel.rgb * (lpGain * lpBelow * lpFacing);
    reflectedLight.directDiffuse += lpIrradiance * BRDF_Lambert(material.diffuseColor);
  }
}
`;

const PATCHABLE = m => m && (m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial);
const DEFAULT_KEY = THREE.Material.prototype.customProgramCacheKey;
// Patched materials (a WeakSet, not a userData flag, so a clone() gets patched too).
const patched = new WeakSet();

// Make a material receive the light pools. Idempotent; keeps any onBeforeCompile the
// material already has. Opt out with material.userData.lightPools = false.
export function receiveLightPools(material) {
  if (!PATCHABLE(material) || material.userData.lightPools === false || patched.has(material)) return false;
  const before = material.onBeforeCompile;
  const keyBefore = material.customProgramCacheKey;
  const ownKey = keyBefore === DEFAULT_KEY ? () => before.toString() : () => keyBefore.call(material);
  material.onBeforeCompile = function (shader, renderer) {
    before.call(this, shader, renderer);
    if (!shader.fragmentShader.includes('#include <lights_fragment_end>')) return;
    shader.uniforms.lpMap = shared.lpMap;
    shader.uniforms.lpRect = shared.lpRect;
    shader.uniforms.lpGain = shared.lpGain;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAGMENT_HEAD)
      .replace('#include <lights_fragment_end>', FRAGMENT_POOLS);
  };
  material.customProgramCacheKey = () => ownKey() + '|' + PATCH_KEY;
  patched.add(material);
  material.needsUpdate = true;
  return true;
}

// Patch every material under an object. Returns how many were newly patched.
export function patchTree(object) {
  let n = 0;
  object.traverse(o => {
    if (!o.material) return;
    if (Array.isArray(o.material)) { for (const m of o.material) n += receiveLightPools(m) ? 1 : 0; }
    else n += receiveLightPools(o.material) ? 1 : 0;
  });
  return n;
}

// ---------------------------------------------------------------- the light map
const SPLAT_VERTEX = /* glsl */`
attribute vec4 aLight;      // x, z, radius, y
attribute vec4 aColor;      // linear rgb, intensity
attribute vec4 aGroup;      // one-hot group
uniform vec4 uLevels;
uniform vec4 uRect;         // minX, minZ, 1/width, 1/depth
varying vec2 vLocal;
varying vec4 vColor;
varying float vHeight;
void main() {
  float level = dot(uLevels, aGroup) * aColor.a;
  vLocal = position.xy;
  vColor = vec4(aColor.rgb, level);
  vHeight = aLight.w;
  vec2 world = aLight.xy + position.xy * aLight.z;
  vec2 uv = (world - uRect.xy) * uRect.zw;
  gl_Position = level > 0.0 ? vec4(uv * 2.0 - 1.0, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}`;

const SPLAT_FRAGMENT = /* glsl */`
uniform float uScale;
varying vec2 vLocal;
varying vec4 vColor;
varying float vHeight;
void main() {
  float s2 = dot(vLocal, vLocal);
  if (s2 >= 1.0) discard;
  // Brightest under the lamp, falling off smoothly to nothing at the radius.
  float edge = 1.0 - s2;
  float w = vColor.a * (edge * edge) * exp(-2.2 * s2);
  float lum = dot(vColor.rgb, vec3(0.3333));
  gl_FragColor = vec4(vColor.rgb * w, w * lum * vHeight / ${HEIGHT_SCALE.toFixed(1)}) * uScale;
}`;

// ---------------------------------------------------------------- glows
const GLOW_VERTEX = /* glsl */`
attribute vec4 aHead;       // x, y, z, size (world units)
attribute vec4 aColor;      // linear rgb, intensity × group gain
attribute vec4 aGroup;
uniform vec4 uLevels;
uniform float uMinPx;       // smallest glow, in pixels
uniform float uPxPerUnit;   // pixels per world unit at distance 1
varying vec2 vLocal;
varying vec3 vColor;
void main() {
  float level = dot(uLevels, aGroup) * aColor.a;
  vLocal = position.xy;
  vec4 mv = viewMatrix * vec4(aHead.xyz, 1.0);
  float dist = max(-mv.z, 0.1);
  float px = aHead.w * uPxPerUnit / dist;
  float grow = max(1.0, uMinPx / max(px, 1e-3));
  // Distant glows keep a minimum size but fade so they do not swell into blobs.
  vColor = aColor.rgb * level / (grow * 0.65 + 0.35);
  // Pull the sprite toward the camera so it is not buried in the lamp's own housing.
  mv.xyz += normalize(-mv.xyz) * min(aHead.w * 1.2, dist * 0.5);
  mv.xy += position.xy * aHead.w * grow;
  gl_Position = level > 0.001 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
}`;

const GLOW_FRAGMENT = /* glsl */`
varying vec2 vLocal;
varying vec3 vColor;
void main() {
  float r2 = dot(vLocal, vLocal);
  if (r2 >= 1.0) discard;
  float a = exp(-r2 * 16.0) * 1.4 + exp(-r2 * 4.0) * 0.3 * (1.0 - r2);
  gl_FragColor = vec4(vColor * a, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------- the system
export function createNightLights({ renderer, world, quality }) {
  const size = MAP_SIZE[quality] || MAP_SIZE.full;
  const b = world.board;
  const rect = { x0: b.minX - MAP_MARGIN, z0: b.minZ - MAP_MARGIN, w: b.maxX - b.minX + MAP_MARGIN * 2, d: b.maxZ - b.minZ + MAP_MARGIN * 2 };
  shared.lpRect.value.set(rect.x0, rect.z0, 1 / rect.w, 1 / rect.d);

  // Half float when the GPU can render to it (nearly all); otherwise 8-bit, scaled down.
  const halfFloat = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const scale = halfFloat ? 1 : 0.25;
  const target = new THREE.WebGLRenderTarget(size, size, {
    type: halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType, format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false
  });
  target.texture.name = 'light-pools';
  shared.lpMap.value = target.texture;

  const quad = new THREE.PlaneGeometry(2, 2);
  const levels = new THREE.Vector4();
  const splatMaterial = new THREE.ShaderMaterial({
    uniforms: { uLevels: { value: levels }, uRect: shared.lpRect, uScale: { value: scale } },
    vertexShader: SPLAT_VERTEX, fragmentShader: SPLAT_FRAGMENT,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
    depthTest: false, depthWrite: false, transparent: true
  });
  splatMaterial.name = 'scene:light-splat';
  const splatScene = new THREE.Scene();
  const splatCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); // unused by the shader
  let splatMesh = null;

  const glowMaterial = new THREE.ShaderMaterial({
    uniforms: { uLevels: { value: levels }, uMinPx: { value: GLOW_MIN_PX[quality] || GLOW_MIN_PX.full }, uPxPerUnit: { value: 500 } },
    vertexShader: GLOW_VERTEX, fragmentShader: GLOW_FRAGMENT,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    depthTest: true, depthWrite: false, transparent: true, fog: false
  });
  glowMaterial.name = 'scene:light-glow';
  const group = new THREE.Group();
  group.name = 'night-lights';
  let glowMesh = null;
  let count = 0, glowCount = 0, redraws = 0;
  let dirty = true, enabled = true;
  const last = new THREE.Vector4(-1, -1, -1, -1); // group levels the map was last drawn with

  const _color = new THREE.Color();
  function groupMask(name) {
    const i = Math.max(0, GROUPS.indexOf(name));
    return [i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0, i === 3 ? 1 : 0];
  }

  // (Re)build the instance buffers from every module's LightSources.
  function setLights(list) {
    if (splatMesh) { splatScene.remove(splatMesh); splatMesh.geometry.dispose(); splatMesh = null; }
    if (glowMesh) { group.remove(glowMesh); glowMesh.geometry.dispose(); glowMesh = null; }
    count = list.length;
    glowCount = 0;
    if (!count) { dirty = true; return; }
    const light = new Float32Array(count * 4), color = new Float32Array(count * 4), mask = new Float32Array(count * 4);
    const heads = [], headColors = [], headMasks = [];
    list.forEach((l, i) => {
      const g = GROUPS.includes(l.group) ? l.group : 'lamps';
      _color.set(l.color === undefined ? '#ffc98a' : l.color);
      const intensity = l.intensity === undefined ? 1 : l.intensity;
      const radius = l.radius || 12;
      light.set([l.x, l.z, radius, l.y === undefined ? 6 : l.y], i * 4);
      color.set([_color.r, _color.g, _color.b, intensity], i * 4);
      const m = groupMask(g);
      mask.set(m, i * 4);
      const glowSize = l.glow !== undefined ? l.glow : radius * GLOW[g].size;
      if (glowSize > 0 && GLOW[g].gain > 0) {
        heads.push(l.x, l.y === undefined ? 6 : l.y, l.z, glowSize);
        headColors.push(_color.r, _color.g, _color.b, intensity * GLOW[g].gain);
        headMasks.push(...m);
      }
    });
    const splat = new THREE.InstancedBufferGeometry();
    splat.index = quad.index;
    splat.setAttribute('position', quad.attributes.position);
    splat.setAttribute('aLight', new THREE.InstancedBufferAttribute(light, 4));
    splat.setAttribute('aColor', new THREE.InstancedBufferAttribute(color, 4));
    splat.setAttribute('aGroup', new THREE.InstancedBufferAttribute(mask, 4));
    splat.instanceCount = count;
    splatMesh = new THREE.Mesh(splat, splatMaterial);
    splatMesh.frustumCulled = false;
    splatScene.add(splatMesh);

    glowCount = heads.length / 4;
    if (glowCount) {
      const glow = new THREE.InstancedBufferGeometry();
      glow.index = quad.index;
      glow.setAttribute('position', quad.attributes.position);
      glow.setAttribute('aHead', new THREE.InstancedBufferAttribute(new Float32Array(heads), 4));
      glow.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(headColors), 4));
      glow.setAttribute('aGroup', new THREE.InstancedBufferAttribute(new Float32Array(headMasks), 4));
      glow.instanceCount = glowCount;
      glowMesh = new THREE.Mesh(glow, glowMaterial);
      glowMesh.frustumCulled = false;
      glowMesh.renderOrder = 900;
      glowMesh.name = 'light-glows';
      group.add(glowMesh);
    }
    dirty = true;
  }

  // Night-market hours from the world (its site's hours), defaulting to 18:00–24:00.
  const marketSite = world.siteList.find(s => s.kind === 'night-market');
  const opens = marketSite?.hours?.open ?? 1080, closes = marketSite?.hours?.close ?? 1440;
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function marketLevel(minute, lamps) {
    const m = ((minute % 1440) + 1440) % 1440;
    if (m < opens - MARKET_RAMP || m >= closes) return 0;
    const open = smooth(opens - MARKET_RAMP, opens, m) * (1 - smooth(closes - MARKET_RAMP, closes, m));
    return open * (0.3 + 0.7 * lamps);
  }


  function update(frame, camera, viewHeightPx, night) {
    const lamps = frame.lamps;
    levels.set(lamps, lamps, marketLevel(frame.minute, lamps), lamps);
    if (!enabled) levels.set(0, 0, 0, 0);
    // Pools only show against the dark: fade them in as the daylight goes.
    shared.lpGain.value = count && levels.lengthSq() > 0 ? POOL_GAIN / scale * (0.25 + 0.75 * night) : 0;
    const changed = Math.abs(levels.x - last.x) + Math.abs(levels.y - last.y) + Math.abs(levels.z - last.z) + Math.abs(levels.w - last.w) > 0.004;
    if ((dirty || changed) && shared.lpGain.value > 0) {
      redraw();
      last.copy(levels);
      dirty = false;
    }
    glowMaterial.uniforms.uPxPerUnit.value = viewHeightPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    if (glowMesh) glowMesh.visible = levels.lengthSq() > 0;
  }

  function redraw() {
    const previousTarget = renderer.getRenderTarget();
    const previousAlpha = renderer.getClearAlpha();
    renderer.getClearColor(_color);
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    if (splatMesh) renderer.render(splatScene, splatCamera);
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(_color, previousAlpha);
    redraws++;
  }

  // Switch the whole system off (to measure its cost) or back on.
  function setEnabled(on) { enabled = !!on; group.visible = enabled; }

  function dispose() {
    setLights([]);
    target.dispose(); quad.dispose(); splatMaterial.dispose(); glowMaterial.dispose();
    if (shared.lpMap.value === target.texture) { shared.lpMap.value = null; shared.lpGain.value = 0; }
  }

  return {
    group, setLights, update, setEnabled, dispose,
    get count() { return count; },
    info: () => ({ lights: count, glows: glowCount, mapSize: size, mapRedraws: redraws, halfFloat })
  };
}
