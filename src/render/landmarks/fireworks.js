// Fireworks over the canal. The sky is computed from the time alone
// (fireworks-show.js) into two point buffers: sparks and the flash of each burst.
// Two draw calls, additive blending. `glow(frame)` tells the scene how much to flash
// the town.

import * as THREE from 'three';
import { fillShow, glowAt, newBuffers, CAPACITY, windowOf } from './fireworks-show.js';
import { glowDot, pointScale, moduleBase } from './common.js';

function pointsMaterial({ size, minPx, maxPx, gain }) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: glowDot() }, scale: { value: 1000 }, size: { value: size }, minPx: { value: minPx }, maxPx: { value: maxPx }, gain: { value: gain } },
    vertexShader: `uniform float scale; uniform float size; uniform float minPx; uniform float maxPx; varying vec3 vColor;
      void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = clamp(size * scale / -mv.z, minPx, maxPx); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; uniform float gain; varying vec3 vColor;
      void main(){ float a = texture2D(map, gl_PointCoord).a; gl_FragColor = vec4(vColor * gain * a, 1.0); }`,
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
  });
}

function dynamicPoints(capacity, material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setDrawRange(0, 0);
  const p = new THREE.Points(g, material);
  p.frustumCulled = false;
  return p;
}

export function create({ world } = {}) {
  const base = moduleBase('fireworks');
  const { group } = base;
  const window_ = windowOf(world);
  const sparkMaterial = pointsMaterial({ size: 3.1, minPx: 3, maxPx: 26, gain: 1.0 });
  const flashMaterial = pointsMaterial({ size: 46, minPx: 6, maxPx: 260, gain: 0.34 });
  const sparks = dynamicPoints(CAPACITY.sparks, sparkMaterial);
  const flashes = dynamicPoints(CAPACITY.flashes, flashMaterial);
  group.add(sparks, flashes);
  const buffers = {
    positions: sparks.geometry.attributes.position.array, colors: sparks.geometry.attributes.color.array,
    flashPositions: flashes.geometry.attributes.position.array, flashColors: flashes.geometry.attributes.color.array
  };
  void newBuffers;
  let lastGlow = { intensity: 0, color: [1, 1, 1], x: 0, y: 120, z: 0 };

  function update(frame) {
    const inWindow = frame.minute >= window_.from && frame.minute < window_.to;
    group.visible = inWindow;
    if (!inWindow) { lastGlow = { intensity: 0, color: [1, 1, 1], x: 0, y: 120, z: 0 }; return; }
    const r = fillShow(world, frame.daySeconds, buffers);
    sparks.geometry.setDrawRange(0, r.sparks);
    flashes.geometry.setDrawRange(0, r.flashes);
    for (const p of [sparks, flashes]) { p.geometry.attributes.position.needsUpdate = true; p.geometry.attributes.color.needsUpdate = true; }
    const s = pointScale(frame, 1);
    sparkMaterial.uniforms.scale.value = s; flashMaterial.uniforms.scale.value = s;
    lastGlow = glowAt(world, frame.daySeconds);
  }

  // The town-wide flash (0..1, a colour and where it comes from) for the scene's lighting.
  const glow = frame => glowAt(world, frame.daySeconds);
  return { group, update, dispose: base.dispose, lights: [], glow, info: () => ({ glow: lastGlow.intensity }) };
}

export function preview(ctx) { return create({ world: ctx.world }); }
