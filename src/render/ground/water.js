// The canal's water: a standard (lit, shadowed, fogged) material with a few moving
// ripples bent into its normal, deeper colour toward the middle, a sky glint at grazing
// angles and, at night, the promenade lanterns' warm reflections broken up by the ripples.
import * as THREE from 'three';

const DAY = { shallow: '#6db3b6', deep: '#3c7f95', sky: '#d4e7f5' };
const NIGHT = { shallow: '#142e40', deep: '#09192a', sky: '#233553' };

export function createWater({ reflection, half, zMin, zMax }) {
  const uniforms = {
    uTime: { value: 0 }, uDay: { value: 1 }, uLamps: { value: 0 }, uRefl: { value: reflection },
    uShallow: { value: new THREE.Color(DAY.shallow) }, uDeep: { value: new THREE.Color(DAY.deep) }, uSky: { value: new THREE.Color(DAY.sky) },
    uHalf: { value: half }, uZ: { value: new THREE.Vector2(zMin, zMax) }, uBank: { value: 15 }
  };
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.16, metalness: 0.05 });
  material.name = 'ground:water';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vWP;
uniform float uTime, uDay, uLamps, uHalf, uBank;
uniform vec3 uShallow, uDeep, uSky;
uniform vec2 uZ;
uniform sampler2D uRefl;
// Height gradient of a few crossing waves (x, z slopes) and a cheap 0..1 sparkle.
vec2 rippleSlope(vec2 p, float t) {
  vec2 g = vec2(0.0);
  g += vec2(0.80, 0.60) * cos(dot(p, vec2(0.80, 0.60)) * 0.9 + t * 1.10) * 0.55;
  g += vec2(-0.55, 0.83) * cos(dot(p, vec2(-0.55, 0.83)) * 1.7 + t * 1.55) * 0.35;
  g += vec2(0.20, -0.98) * cos(dot(p, vec2(0.20, -0.98)) * 3.1 + t * 2.30) * 0.20;
  g += vec2(0.96, 0.28) * cos(dot(p, vec2(0.96, 0.28)) * 4.6 + t * 2.90) * 0.10;
  return g;
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec2 slope = rippleSlope(vWP, uTime);
  float bankDist = clamp(uBank - abs(vWP.x), 0.0, 20.0);
  float deepT = smoothstep(0.0, 9.0, bankDist);
  diffuseColor.rgb = mix(uShallow, uDeep, deepT);
  float glint = smoothstep(0.55, 0.95, slope.x * 0.6 + slope.y * 0.5 + 0.35);
  diffuseColor.rgb += vec3(0.05, 0.07, 0.07) * glint * uDay;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  normal = normalize(normal - (viewMatrix * vec4(slope.x, 0.0, slope.y, 0.0)).xyz * 0.11);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    vec3 V = normalize(vViewPosition);
    float fres = pow(1.0 - clamp(dot(normal, V), 0.0, 1.0), 3.0);
    totalEmissiveRadiance += uSky * fres * (0.30 + 0.45 * uDay);
    // Lantern reflections: the map is x in [-uHalf, uHalf], z over uZ, bent by the ripples.
    vec2 uv = vec2((vWP.x + uHalf) / (2.0 * uHalf) + slope.x * 0.012, (vWP.y - uZ.x) / (uZ.y - uZ.x) + slope.y * 0.0009);
    float inRange = step(abs(vWP.x), uHalf);
    vec3 refl = texture2D(uRefl, uv).rgb * inRange;
    totalEmissiveRadiance += refl * uLamps * (0.55 + 0.9 * glint) * 0.9;
    // A faint pale line where the water meets the wall.
    float foam = (1.0 - smoothstep(0.0, 0.55, bankDist)) * inRange;
    totalEmissiveRadiance += vec3(0.10, 0.12, 0.12) * foam * (0.15 + 0.35 * uDay) * (0.6 + 0.4 * sin(vWP.y * 1.3 + uTime * 1.2 + vWP.x * 2.0));
  }`);
  };
  material.customProgramCacheKey = () => 'ground-water-1';

  const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
  return {
    material,
    update(frame) {
      const d = frame.daylight, night = 1 - d;
      uniforms.uTime.value = frame.time;
      uniforms.uDay.value = d;
      uniforms.uLamps.value = frame.lamps;
      uniforms.uShallow.value.copy(mix(NIGHT.shallow, DAY.shallow, d));
      uniforms.uDeep.value.copy(mix(NIGHT.deep, DAY.deep, d));
      uniforms.uSky.value.copy(mix(NIGHT.sky, DAY.sky, d));
      void night;
    },
    dispose() { material.dispose(); }
  };
}
