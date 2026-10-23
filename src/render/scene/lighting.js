// The town's light rig: one directional key light (the sun by day, the moon by night)
// whose shadow map follows the view, a hemisphere light for the sky's fill, the
// reflection environment rendered from the sky, fog and exposure.

import * as THREE from 'three';

const SHADOW = {
  full: { size: 4096, refresh: 0 },       // every frame
  lite: { size: 2048, refresh: 1 / 8 }    // seconds between shadow-map refreshes
};
// Smallest half-width of the shadow frustum, in town units (sharp shadows up close).
const SHADOW_MIN_HALF = 24;
// How far a ray toward the horizon is followed when fitting the shadow to the view,
// as a multiple of the camera distance.
const SHADOW_REACH = 2.6;
// Highest surfaces the shadow has to cover (roofs), for the fit.
const ROOF_Y = 70;
// How often the reflection environment is re-rendered (town minutes between updates).
const ENV_STEP = { full: 6, lite: 20 };

const _v = new THREE.Vector3(), _ray = new THREE.Vector3(), _origin = new THREE.Vector3();
const _right = new THREE.Vector3(), _up = new THREE.Vector3(), _fwd = new THREE.Vector3();
// Screen points (NDC x, y pairs) whose ground the shadow must cover: corners and edge midpoints.
const CORNERS = [-1, -1, 1, -1, 1, 1, -1, 1, 0, -1, 0, 1, -1, 0, 1, 0];

export function createLighting({ renderer, scene, world, quality, sky }) {
  const tier = SHADOW[quality] || SHADOW.full;
  const board = world.board;
  // Everything that can cast a shadow is inside the board (plus the tallest roof).
  const boardRadius = Math.hypot(board.halfX, board.halfZ);
  const reach = boardRadius + 200;

  const key = new THREE.DirectionalLight('#ffffff', 3);
  key.name = 'key-light';
  key.castShadow = true;
  key.shadow.mapSize.set(tier.size, tier.size);
  key.shadow.bias = -0.0002;
  const cam = key.shadow.camera;
  cam.near = 1; cam.far = reach * 2;
  key.shadow.autoUpdate = tier.refresh === 0;
  scene.add(key, key.target);

  const hemi = new THREE.HemisphereLight('#ffffff', '#888888', 1);
  hemi.name = 'sky-fill';
  scene.add(hemi);

  scene.fog = new THREE.Fog('#c9d8e2', 400, 2000);

  // Reflection environment from the sky.
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTarget = null, envKey = null;
  function refreshEnvironment(atm) {
    const step = ENV_STEP[quality] || ENV_STEP.full;
    const k = Math.floor(atm.minute / step);
    if (k === envKey) return false;
    envKey = k;
    const next = pmrem.fromScene(sky.envScene, 0.02, 0.1, 100, { size: quality === 'lite' ? 64 : 128 });
    scene.environment = next.texture;
    if (envTarget) envTarget.dispose();
    envTarget = next;
    return true;
  }

  // Fit the shadow camera to what the view shows: the ground (and roofs) under the
  // screen's corners and edge midpoints, measured in the light's own frame.
  let lastShadowTime = -1e9;
  const pivot = new THREE.Vector3();
  const bounds = { minR: 0, maxR: 0, minU: 0, maxU: 0 };
  function include(p) {
    const r = p.dot(_right), u = p.dot(_up);
    if (r < bounds.minR) bounds.minR = r;
    if (r > bounds.maxR) bounds.maxR = r;
    if (u < bounds.minU) bounds.minU = u;
    if (u > bounds.maxU) bounds.maxU = u;
  }
  function fitShadow(camera, distance, lightDir) {
    _fwd.copy(lightDir).negate();
    _right.crossVectors(_fwd, Math.abs(_fwd.y) > 0.99 ? _v.set(0, 0, 1) : _v.set(0, 1, 0)).normalize();
    _up.crossVectors(_right, _fwd).normalize();
    bounds.minR = bounds.minU = Infinity; bounds.maxR = bounds.maxU = -Infinity;
    _origin.copy(camera.position);
    const limit = distance * SHADOW_REACH;
    for (let i = 0; i < CORNERS.length; i += 2) {
      _ray.set(CORNERS[i], CORNERS[i + 1], 0.5).unproject(camera).sub(_origin).normalize();
      for (let level = 0; level < 2; level++) {
        const y = level * ROOF_Y;
        let t = _ray.y < -1e-4 ? (y - _origin.y) / _ray.y : limit;
        if (t < 0) t = limit;                  // the plane is behind (camera below the roofs)
        t = Math.min(t, limit);
        _v.copy(_origin).addScaledVector(_ray, t);
        _v.x = Math.max(board.minX - 30, Math.min(board.maxX + 30, _v.x));
        _v.z = Math.max(board.minZ - 30, Math.min(board.maxZ + 30, _v.z));
        _v.y = Math.min(_v.y, ROOF_Y);
        include(_v);
      }
    }
    include(pivot);
    const { minR, maxR, minU, maxU } = bounds;
    // Centre and half-size in the light's frame, the size in steps of ~19% and the centre
    // snapped to whole texels, so the shadows do not shimmer as the view moves.
    let half = Math.max(SHADOW_MIN_HALF, (maxR - minR) / 2, (maxU - minU) / 2) * (tier.refresh ? 1.15 : 1.04);
    half = Math.pow(2, Math.ceil(Math.log2(half) * 4) / 4);
    const texel = (half * 2) / tier.size;
    const cr = Math.round((minR + maxR) / 2 / texel) * texel, cu = Math.round((minU + maxU) / 2 / texel) * texel;
    // The centre in world space lies on the plane through the origin facing the light;
    // the light stands `reach` back from it toward the sun.
    const centre = _v.copy(_right).multiplyScalar(cr).addScaledVector(_up, cu);
    key.target.position.copy(centre);
    key.position.copy(centre).addScaledVector(lightDir, reach);
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.near = 1; cam.far = reach * 2;
    cam.updateProjectionMatrix();
    key.target.updateMatrixWorld();
    key.shadow.normalBias = texel * 1.2;
    key.shadow.bias = -0.00015 - texel * 0.00004;
    return half;
  }

  let shadowHalf = 0;
  function update(atm, frame, camera, cameraState, time) {
    key.color.copy(atm.lightColor);
    key.intensity = atm.lightIntensity;
    hemi.color.copy(atm.hemiSky);
    hemi.groundColor.copy(atm.hemiGround);
    hemi.intensity = atm.hemiIntensity;
    scene.environmentIntensity = atm.env;
    renderer.toneMappingExposure = atm.exposure;

    // Fog: clear over the town, thickening past the board's edge.
    const d = cameraState.distance;
    scene.fog.color.copy(atm.fog);
    scene.fog.near = d * 0.75 + boardRadius * 0.55;
    scene.fog.far = d * 1.4 + boardRadius * 2.6;

    pivot.set(cameraState.x, cameraState.y, cameraState.z);
    if (tier.refresh === 0) shadowHalf = fitShadow(camera, d, atm.keyDir);
    else if (time - lastShadowTime >= tier.refresh || time < lastShadowTime) {
      lastShadowTime = time;
      shadowHalf = fitShadow(camera, d, atm.keyDir);
      key.shadow.needsUpdate = true;
    }
    refreshEnvironment(atm);
  }

  function dispose() {
    scene.remove(key, key.target, hemi);
    key.shadow.dispose?.();
    key.dispose(); hemi.dispose();
    if (envTarget) envTarget.dispose();
    pmrem.dispose();
    scene.environment = null;
    scene.fog = null;
  }

  return { key, hemi, update, dispose, info: () => ({ shadowMap: tier.size, shadowHalf: Math.round(shadowHalf) }) };
}
