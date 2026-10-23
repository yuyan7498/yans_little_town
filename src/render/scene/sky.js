// The sky: one shader dome around the camera. Day gradient, the sun's disc and glow,
// warm light along the horizon at dusk and dawn, a moon, and at night stars and the
// Milky Way, turning with the hours.
//
// Milky Way panorama: "The Milky Way panorama" by ESO/S. Brunier
// (https://www.eso.org/public/images/eso0932a/), licensed CC BY 4.0
// (https://creativecommons.org/licenses/by/4.0/). assets/sky/milky-way.jpg is the original
// 6000 × 3000 image; milky-way-3k.jpg is a downscaled copy for phones. The shader below
// adjusts its brightness and colour when it draws it.

import * as THREE from 'three';

const TEXTURE = { full: 'assets/sky/milky-way.jpg', lite: 'assets/sky/milky-way-3k.jpg' };
// The sky turns as if seen from this latitude. Not the town's real one (about 24°): from
// further north the Milky Way's core hangs low over the southern horizon in the evening,
// where the town's low, narrow (30°) camera can actually see it.
const LATITUDE = 53 * Math.PI / 180;
const MILKY_GAIN = 0.55;              // brightness of the panorama at full night
const SUN_RADIUS = 0.026;             // radians, a little larger than life
const MOON_RADIUS = 0.03;

// Equatorial (J2000) to galactic coordinates (IAU rotation).
const EQ_TO_GAL = new THREE.Matrix3().set(
  -0.0548755604, -0.8734370902, -0.4838350155,
  0.4941094279, -0.4448296300, 0.7469822445,
  -0.8676661490, -0.1980763734, 0.4559837762);

const VERTEX = /* glsl */`
varying vec3 vDir;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vDir = world.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const FRAGMENT = /* glsl */`
uniform vec3 uZenith, uHorizon, uFog, uSunDir, uSunColor, uSunGlow, uWarmSky, uMoonDir, uMoonColor;
uniform float uWarm, uSunUp, uMoonUp, uStars, uMilkyGain, uTime, uSunCos, uMoonCos, uSunDisc;
uniform mat3 uGalactic;
uniform sampler2D uMilky;
varying vec3 vDir;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash13(vec3(i, 7.0)), b = hash13(vec3(i + vec2(1.0, 0.0), 7.0));
  float c = hash13(vec3(i + vec2(0.0, 1.0), 7.0)), e = hash13(vec3(i + vec2(1.0, 1.0), 7.0));
  return mix(mix(a, b, f.x), mix(c, e, f.x), f.y);
}

// Crisp twinkling stars on top of the panorama (which is soft at this field of view).
vec3 starField(vec3 d) {
  vec3 p = d * 230.0;
  vec3 cell = floor(p);
  float r = hash13(cell);
  if (r < 0.982) return vec3(0.0);
  vec3 jitter = vec3(hash13(cell + 1.7), hash13(cell + 5.3), hash13(cell + 9.1)) - 0.5;
  float dist = length(fract(p) - 0.5 - jitter * 0.5);
  float k = fract(r * 113.0);
  float size = 0.06 + 0.1 * k * k;
  float twinkle = 0.65 + 0.35 * sin(uTime * (1.3 + 2.7 * fract(r * 7.0)) + r * 61.0);
  float b = smoothstep(size, 0.0, dist) * twinkle * (0.25 + 1.6 * k * k);
  return mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.88, 0.72), fract(r * 37.0)) * b;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float up = max(h, 0.0);

  // Gradient from the horizon haze up to the zenith.
  vec3 col = mix(uHorizon, uZenith, pow(up, 0.55));

  // Warm band toward the sun's side of the horizon at dusk and dawn.
  vec2 dh = normalize(d.xz + vec2(1e-5));
  vec2 sh = normalize(uSunDir.xz + vec2(1e-5));
  float side = dot(dh, sh) * 0.5 + 0.5;
  float band = exp(-up * 6.5) * (0.35 + 0.65 * side * side * side);
  col = mix(col, uWarmSky, clamp(uWarm * band, 0.0, 1.0));

  // The sun: a broad glow, a tighter halo and the disc, hidden below the horizon.
  float cs = dot(d, uSunDir);
  float above = smoothstep(-0.02, 0.015, h);
  float c0 = max(cs, 0.0);
  col += uSunGlow * uSunUp * above * (0.22 * pow(c0, 6.0) + 0.6 * pow(c0, 90.0));
  col += uSunColor * uSunUp * above * smoothstep(uSunCos - 0.00004, uSunCos + 0.00004, cs) * uSunDisc;

  // The night: the Milky Way panorama in galactic coordinates, and the stars.
  if (uStars > 0.001) {
    float fade = smoothstep(0.0, 0.22, h) * uStars;
    vec3 g = uGalactic * d;
    float lon = atan(g.y, g.x);
    float lat = asin(clamp(g.z, -1.0, 1.0));
    vec3 milky = texture2D(uMilky, vec2(0.5 - lon / 6.2831853, 0.5 + lat / 3.1415927)).rgb;
    // Lift the faint glow a little and cool the colour toward the night sky.
    milky = pow(milky, vec3(0.9)) * vec3(0.92, 0.96, 1.08);
    col += milky * uMilkyGain * fade;
    col += starField(d) * fade;
  }

  // The moon: a pale disc with soft maria and a halo.
  if (uMoonUp > 0.001) {
    float cm = dot(d, uMoonDir);
    float disc = smoothstep(uMoonCos - 0.00003, uMoonCos + 0.00003, cm);
    // Position on the disc (−1…1) in the moon's own frame, for maria and limb darkening.
    vec3 east = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
    vec3 north = cross(east, uMoonDir);
    vec2 p = vec2(dot(d, east), dot(d, north)) / sqrt(max(1.0 - uMoonCos * uMoonCos, 1e-8));
    float maria = valueNoise(p * 2.3 + 3.1) * 0.65 + valueNoise(p * 5.7 + 8.4) * 0.35;
    float shade = (1.0 - 0.3 * smoothstep(0.42, 0.72, maria)) * (1.0 - 0.18 * dot(p, p));
    vec3 moon = uMoonColor * shade * 1.15;
    float vis = uMoonUp * smoothstep(0.0, 0.03, h);
    col = mix(col, moon, disc * vis);
    col += uMoonColor * vis * (0.05 * pow(max(cm, 0.0), 60.0) + 0.12 * pow(max(cm, 0.0), 900.0));
  }

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>

  // Haze at and below the horizon. three.js mixes fog into the final display colour
  // (after tone mapping), so the sky does the same here with the same colour: the
  // fogged plain then meets the sky without a seam.
  float haze = max(exp(-up * 22.0), smoothstep(0.004, -0.05, h));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uFog, haze);
}`;

export function createSky({ quality = 'full', radius = 1000 } = {}) {
  const uniforms = {
    uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uFog: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() }, uSunGlow: { value: new THREE.Color() },
    uWarmSky: { value: new THREE.Color() }, uMoonDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonColor: { value: new THREE.Color() },
    uWarm: { value: 0 }, uSunUp: { value: 1 }, uMoonUp: { value: 0 }, uStars: { value: 0 }, uMilkyGain: { value: MILKY_GAIN },
    uTime: { value: 0 }, uSunDisc: { value: 28 }, uSunCos: { value: Math.cos(SUN_RADIUS) }, uMoonCos: { value: Math.cos(MOON_RADIUS) },
    uGalactic: { value: new THREE.Matrix3() }, uMilky: { value: null }
  };

  // A 1×1 black stand-in until the panorama arrives.
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  blank.needsUpdate = true;
  uniforms.uMilky.value = blank;

  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false });
  material.name = 'scene:sky';
  const geometry = new THREE.SphereGeometry(1, 48, 24);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.scale.setScalar(radius);

  // The reflection environment: the same sky without the night details, on its own scene.
  const envZenith = { value: new THREE.Color() };
  // Its zenith is softened toward the horizon: the environment also lights every surface
  // diffusely, and a saturated blue there turns dark shadows navy.
  const envMaterial = new THREE.ShaderMaterial({ uniforms: { ...uniforms, uStars: { value: 0 }, uMoonUp: { value: 0 }, uZenith: envZenith },
    vertexShader: VERTEX, fragmentShader: FRAGMENT, side: THREE.BackSide, depthWrite: false, depthTest: false });
  envMaterial.name = 'scene:sky-env';
  const envMesh = new THREE.Mesh(geometry, envMaterial);
  envMesh.scale.setScalar(50);
  envMesh.frustumCulled = false;
  const envScene = new THREE.Scene();
  envScene.add(envMesh);

  let texture = null;
  const ready = new Promise(resolve => {
    new THREE.TextureLoader().load(new URL('../../../' + TEXTURE[quality === 'lite' ? 'lite' : 'full'], import.meta.url).href, t => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
      // At a 30° field of view the panorama is always magnified, so no mipmaps are needed.
      t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
      texture = t;
      uniforms.uMilky.value = t;
      resolve(true);
    }, undefined, () => { console.warn('[sky] Milky Way panorama did not load'); resolve(false); });
  });

  const local = new THREE.Matrix3();
  function update(atm, camera, time) {
    uniforms.uZenith.value.copy(atm.zenith);
    envZenith.value.copy(atm.zenith).lerp(atm.horizon, 0.6);
    uniforms.uHorizon.value.copy(atm.horizon);
    atm.fog.getRGB(uniforms.uFog.value, THREE.SRGBColorSpace); // display colour, as three.js fog uses it
    uniforms.uSunDisc.value = atm.sunDisc;
    uniforms.uSunDir.value.copy(atm.sunDir);
    uniforms.uSunColor.value.copy(atm.sunColor);
    uniforms.uSunGlow.value.copy(atm.sunGlow);
    uniforms.uWarmSky.value.copy(atm.warmSky);
    uniforms.uMoonDir.value.copy(atm.moonDir);
    uniforms.uMoonColor.value.copy(atm.moonColor);
    uniforms.uWarm.value = atm.warm;
    uniforms.uSunUp.value = atm.sunUp;
    uniforms.uMoonUp.value = atm.moonUp * atm.stars;
    uniforms.uStars.value = atm.stars;
    uniforms.uTime.value = time;
    if (atm.stars > 0) uniforms.uGalactic.value.multiplyMatrices(EQ_TO_GAL, horizonToEquatorial(atm.siderealHours, local));
    mesh.position.copy(camera.position);
  }

  function setRadius(r) { mesh.scale.setScalar(r); }

  function dispose() {
    geometry.dispose(); material.dispose(); envMaterial.dispose(); blank.dispose();
    if (texture) texture.dispose();
  }

  return { mesh, envScene, ready, update, setRadius, dispose };
}

// Local sky directions (x east, y up, z south) to equatorial unit vectors at a given
// local sidereal time, for an observer at LATITUDE. In local coordinates the celestial
// pole P is north and up by the latitude, Q is where the celestial equator crosses the
// meridian (south) and W is due west; a star at hour angle H and declination δ lies at
// cos δ (cos H·Q + sin H·W) + sin δ·P, and right ascension = sidereal time − H.
const SIN_LAT = Math.sin(LATITUDE), COS_LAT = Math.cos(LATITUDE);
function horizonToEquatorial(siderealHours, out) {
  const lst = siderealHours / 24 * Math.PI * 2;
  const c = Math.cos(lst), s = Math.sin(lst);
  // Rows: c·Q + s·W, s·Q − c·W, P, with Q = (0, cos φ, sin φ), W = (−1, 0, 0), P = (0, sin φ, −cos φ).
  return out.set(
    -s, c * COS_LAT, c * SIN_LAT,
    c, s * COS_LAT, s * SIN_LAT,
    0, SIN_LAT, -COS_LAT);
}
