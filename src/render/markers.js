// Selection markers: a soft light column over the selected building and a glowing ring
// with a column over the followed person. Both stay readable from the whole-town view,
// so their width grows with the camera distance.
import * as THREE from 'three';

const TOP = 340;                 // how tall a column stands
const COLOR = new THREE.Color('#ffd98a');

// A column that fades out toward the top (and a little at the foot), drawn additively.
function columnMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: COLOR.clone() }, uAlpha: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform vec3 uColor; uniform float uAlpha; uniform float uTime;
      void main() {
        float up = pow(1.0 - vUv.y, 1.7);
        float edge = sin(vUv.x * 3.14159 * 4.0) * 0.5 + 0.5;       // four soft ribs per turn
        float shimmer = 0.88 + 0.12 * sin(uTime * 1.6 + vUv.y * 9.0);
        gl_FragColor = vec4(uColor * (0.55 + 0.45 * edge), up * uAlpha * shimmer * (0.45 + 0.55 * edge));
      }`
  });
}

function ringMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: COLOR.clone() }, uAlpha: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform vec3 uColor; uniform float uAlpha; uniform float uTime;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float pulse = 0.5 + 0.5 * sin(uTime * 2.4);
        float ring = smoothstep(0.62, 0.7, r) * (1.0 - smoothstep(0.78, 0.86, r));
        float halo = (1.0 - smoothstep(0.0, 1.0, r)) * 0.28;
        float wave = smoothstep(0.1, 0.0, abs(r - mix(0.35, 0.95, fract(uTime * 0.55)))) * 0.35;
        float a = (ring + halo + wave) * (0.8 + 0.2 * pulse) * step(r, 1.0);
        gl_FragColor = vec4(uColor, a * uAlpha);
      }`
  });
}

export function create({ world }) {
  const group = new THREE.Group();
  group.name = 'markers';
  group.renderOrder = 20;
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
  cyl.translate(0, 0.5, 0);
  // The cylinder's v runs bottom to top; flip so vUv.y = 0 at the top fades correctly.
  const buildingMat = columnMaterial(), personMat = columnMaterial(), ringMat = ringMaterial();

  const building = new THREE.Mesh(cyl, buildingMat);
  const column = new THREE.Mesh(cyl, personMat);
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), ringMat);
  for (const m of [building, column, ring]) { m.visible = false; m.frustumCulled = false; m.matrixAutoUpdate = true; group.add(m); }
  building.renderOrder = 20; column.renderOrder = 21; ring.renderOrder = 22;

  const shared = { building: null, person: null };
  const fade = { building: 0, person: 0 };
  let dist = 600;

  function setBuilding(id) {
    shared.building = null;
    const s = id && world.site ? world.site(id) : null;
    if (!s) return;
    const f = s.footprint || s;
    shared.building = { x: f.x, z: f.z, r: Math.max(8, Math.hypot(f.w || 20, f.d || 20) * 0.5), top: (s.height || 20) };
  }
  function setPerson(point) { shared.person = point ? { x: point.x, y: point.y || 0, z: point.z } : null; }

  function update(frame) {
    const t = frame.time || 0, dt = Math.min(0.1, frame.dt || 0.016);
    if (frame.cameraState) dist = frame.cameraState.distance;
    const k = 1 - Math.exp(-dt * 6);
    fade.building += ((shared.building ? 1 : 0) - fade.building) * k;
    fade.person += ((shared.person ? 1 : 0) - fade.person) * k;
    buildingMat.uniforms.uTime.value = personMat.uniforms.uTime.value = ringMat.uniforms.uTime.value = t;
    const night = 1 - (frame.daylight ?? 1);
    // Fainter in daylight (white sky eats additive light), brighter at night.
    const gain = 0.5 + 0.5 * night;

    const b = shared.building;
    building.visible = fade.building > 0.01 && !!b;
    if (b) {
      const w = Math.max(b.r * 0.9, dist * 0.035);
      building.position.set(b.x, b.top, b.z);
      building.scale.set(w, TOP, w);
      buildingMat.uniforms.uAlpha.value = fade.building * 0.55 * gain;
    }
    const p = shared.person;
    column.visible = ring.visible = fade.person > 0.01 && !!p;
    if (p) {
      const w = Math.max(1.4, dist * 0.007);
      column.position.set(p.x, p.y, p.z);
      column.scale.set(w, TOP * 0.5, w);
      personMat.uniforms.uAlpha.value = fade.person * 0.7 * gain;
      const rr = Math.max(5, dist * 0.032);
      ring.position.set(p.x, p.y + 0.35, p.z);
      ring.scale.set(rr, 1, rr);
      ringMat.uniforms.uAlpha.value = fade.person * (0.9 + 0.1 * gain);
    }
  }

  function dispose() {
    cyl.dispose(); ring.geometry.dispose();
    buildingMat.dispose(); personMat.dispose(); ringMat.dispose();
  }

  return { group, update, setBuilding, setPerson, dispose };
}

export const preview = create;
