// 城市之光廣場: a paved square with a round fountain at its heart, the 城市之光
// monument at the north end, planters, trees and lamps. The fountain runs a programmed
// water show: calm jets by day, and short coloured shows in the evening.

import * as THREE from 'three';
import { ShapeBuilder, material } from '../kit.js';
import { Glows, mesh, litMaterial, setLevel, pointScale, moduleBase, lightSource, glowDot, smoothstep } from './common.js';
import { tree, planter, lampPost, bench, groundRing, groundDisc } from './props.js';

// When the evening shows start (town minutes) and how long each lasts.
const SHOWS = { starts: [1110, 1240, 1320], length: 26 };
// The water runs from morning until 23:00.
const WATER = { from: 360, to: 1380 };
const BASIN = { r: 10.6, wall: 1.2, height: 1.6, water: 1.15 };
// Jet rings: count, radius, how far the jet leans (+ outward), base height, droplets per jet, flights per second.
const RINGS = [
  { n: 12, r: 4.9, lean: 0.8, calm: 4.5, show: 14, drops: 18, rate: 0.5 },
  { n: 18, r: 7.6, lean: -3.2, calm: 2.6, show: 7, drops: 13, rate: 0.62 },
  { n: 24, r: 9.5, lean: -2.6, calm: 1.5, show: 4, drops: 9, rate: 0.8 }
];
const CENTRE = { calm: 9, show: 28, drops: 80, rate: 0.3, top: 2.9 };
const GRAV = 15;

function paving(sb, a, cx, cz) {
  const base = 0.2;
  sb.block(cx, 0.05, cz, a.w, 0.15, a.d, '#e4ddd0');
  // Chequer of large slabs.
  const step = 6, nx = Math.floor(a.w / step), nz = Math.floor(a.d / step);
  const ox = cx - (nx * step) / 2, oz = cz - (nz * step) / 2;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    if ((i + j) % 2) sb.block(ox + (i + 0.5) * step, base - 0.02, oz + (j + 0.5) * step, step - 0.3, 0.06, step - 0.3, '#d9d1c1');
  }
  // Border band and inner line. (Every layer of paving stands clear of the one below:
  // layers in one plane flicker as the camera moves.)
  const e = 1.0;
  sb.block(cx, base + 0.01, a.z0 + e, a.w, 0.06, 1.6, '#c4b8a4'); sb.block(cx, base + 0.01, a.z1 - e, a.w, 0.06, 1.6, '#c4b8a4');
  sb.block(a.x0 + e, base + 0.01, cz, 1.6, 0.06, a.d, '#c4b8a4'); sb.block(a.x1 - e, base + 0.01, cz, 1.6, 0.06, a.d, '#c4b8a4');
  // The fountain court: rings in teal-grey and warm sand, and four warm paths to the doors.
  groundDisc(sb, cx, cz, 19.5, base + 0.09, '#ece4d3');
  groundRing(sb, cx, cz, 12.6, 14.2, base + 0.12, '#8fb0b3');
  groundRing(sb, cx, cz, 17.2, 18.6, base + 0.12, '#d3b484');
  groundRing(sb, cx, cz, 15.1, 15.5, base + 0.12, '#fff6e2');
  // Paths from each side's door to the court.
  const pathW = 6, warm = '#f2e9d6', edge = '#cdbf9f';
  const lenZ = a.d / 2 - 12, lenX = a.w / 2 - 12;
  for (const s of [-1, 1]) {
    sb.block(cx, base + 0.09, cz + s * (12 + lenZ / 2), pathW, 0.06, lenZ, warm);
    sb.block(cx + s * (12 + lenX / 2), base + 0.09, cz, lenX, 0.06, pathW, warm);
    for (const t of [-1, 1]) {
      sb.block(cx + t * (pathW / 2 + 0.2), base + 0.12, cz + s * (12 + lenZ / 2), 0.35, 0.06, lenZ, edge);
      sb.block(cx + s * (12 + lenX / 2), base + 0.12, cz + t * (pathW / 2 + 0.2), lenX, 0.06, 0.35, edge);
    }
  }
}

function fountain(sb, lit, cx, cz) {
  const lathe = new THREE.LatheGeometry([[BASIN.r - BASIN.wall, 0.1], [BASIN.r - BASIN.wall, BASIN.height], [BASIN.r + 0.4, BASIN.height], [BASIN.r + 0.4, BASIN.height - 0.25], [BASIN.r + 0.9, BASIN.height - 0.25], [BASIN.r + 0.9, 0.1]].map(([x, y]) => new THREE.Vector2(x, y)), 40);
  sb.add(lathe, sb.transform(cx, 0.2, cz), '#e9e2d4');
  // Tiled floor, and a raised tiered pedestal for the central jet.
  groundDisc(sb, cx, cz, BASIN.r - BASIN.wall, 0.5, '#4f9aa9');
  groundRing(sb, cx, cz, 6.2, 6.5, 0.52, '#a9dbe3');
  sb.cylinder(cx, 1.4, cz, 2.6, 3.0, 2.4, '#e9e2d4', 14);
  sb.cylinder(cx, 2.7, cz, 3.4, 2.4, 0.35, '#d3c9b6', 14);
  sb.cylinder(cx, 2.9, cz, 0.6, 0.8, 0.4, '#8c949b', 8);
  // Jet nozzles: small steel caps on the floor.
  for (const ring of RINGS) for (let i = 0; i < ring.n; i++) {
    const a = (i / ring.n) * Math.PI * 2;
    sb.cylinder(cx + Math.cos(a) * ring.r, 0.62, cz + Math.sin(a) * ring.r, 0.2, 0.26, 0.28, '#8c949b', 6);
  }
  // Underwater lights ring.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.26;
    lit.sphere(cx + Math.cos(a) * 8.6, 0.8, cz + Math.sin(a) * 8.6, 0.28, '#e6fbff', 6, 4);
  }
}

// The monument: a stepped plinth, three rising blades, an orb of light; the two
// slow rings are a separate mesh that turns.
function monument(sb, lit, rings, glows, mx, mz) {
  const y = 0.2;
  sb.cylinder(mx, y + 0.3, mz, 6.6, 7.0, 0.6, '#d9d1c1', 8);
  sb.cylinder(mx, y + 0.9, mz, 5.4, 5.8, 0.6, '#e9e2d4', 8);
  sb.cylinder(mx, y + 2.0, mz, 2.7, 3.4, 1.6, '#c9bfae', 8);
  // Three twisting blades.
  const cols = ['#f4f1ea', '#3f8f88', '#f0c03a'];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2, lean = 0.2;
    const w = new THREE.BoxGeometry(1.1, 17, 3.0);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(mx + Math.cos(a) * 2.0, y + 2.8 + 8.4, mz + Math.sin(a) * 2.0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(a) * lean, -a + 0.9, -Math.cos(a) * lean, 'YXZ')), new THREE.Vector3(1, 1, 1));
    sb.add(w, m, cols[k]);
  }
  sb.sphere(mx, y + 3.0, mz, 1.0, '#8c949b', 8, 6);
  // The orb.
  lit.sphere(mx, y + 21.4, mz, 2.1, '#fff0c0', 12, 8);
  glows.add(mx, y + 21.4, mz, '#ffe2a0', 14);
  // Turning rings around the middle.
  rings.add(new THREE.TorusGeometry(5.6, 0.32, 6, 40), rings.transform(0, 0, 0, [Math.PI / 2, 0, 0]), '#e0b146');
  rings.add(new THREE.TorusGeometry(5.0, 0.28, 6, 40), rings.transform(0, 0, 0, [Math.PI / 2 + 0.9, 0, 0.35]), '#f6efe0');
  rings.add(new THREE.TorusGeometry(4.4, 0.26, 6, 40), rings.transform(0, 0, 0, [Math.PI / 2 - 0.9, 0.2, -0.35]), '#3f8f88');
}

// -------------------------------------------------------------- water show
function showLevel(minute) {
  for (const s of SHOWS.starts) {
    const u = (minute - s) / SHOWS.length;
    if (u >= 0 && u <= 1) return Math.min(1, u * 12, (1 - u) * 12);
  }
  return 0;
}

export function create({ world, quality = 'full' } = {}) {
  const base = moduleBase('plaza');
  const { group } = base;
  const site = world.site('c-plaza') || world.siteList.find(s => s.kind === 'plaza');
  if (!site) return { group, update() {}, dispose: base.dispose, lights: [] };
  const a = site.area, cx = a.x, cz = a.z;
  const sb = new ShapeBuilder(), lit = new ShapeBuilder(), rings = new ShapeBuilder(), glows = new Glows();

  paving(sb, a, cx, cz);
  fountain(sb, lit, cx, cz);
  // The monument sits at the end of the main axis, on the side away from the road door.
  const mz = a.z0 + 9.5;
  monument(sb, lit, rings, glows, cx, mz);
  // Trees and planters in the four quadrants.
  const q = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  q.forEach(([sx, sz], i) => {
    const tx = cx + sx * (a.w / 2 - 8), tz = cz + sz * (a.d / 2 - 8);
    sb.cylinder(tx, 0.55, tz, 3.2, 3.4, 0.7, '#d8d0c0', 12);
    sb.cylinder(tx, 0.92, tz, 2.8, 2.8, 0.1, '#6b4a34', 12);
    tree(sb, tx, tz, 1.05, i, 0.9);
    planter(sb, cx + sx * (a.w / 2 - 3.2), cz + sz * 6.5, 11, 2.6, false, i * 5);
    planter(sb, cx + sx * 15, cz + sz * (a.d / 2 - 3.2), 9, 2.6, true, i * 7 + 2);
  });
  // Benches facing the fountain, between the paths.
  for (const [sx, sz] of q) { const bx = cx + sx * 12.5, bz = cz + sz * 12.5; bench(sb, bx, bz, Math.atan2(cz - bz, cx - bx)); }
  // Lamps: a ring round the court and the four corners.
  const lampPoints = [];
  for (let i = 0; i < 8; i++) { const t = (i + 0.5) / 8 * Math.PI * 2; lampPoints.push([cx + Math.cos(t) * 20.5, cz + Math.sin(t) * 20.5]); }
  for (const [x, z] of lampPoints) lampPost(sb, lit, glows, x, z, 9);

  group.add(mesh(sb.build(), material({ roughness: 0.85 }), { shadow: true }));
  const litMat = litMaterial();
  group.add(mesh(lit.build(), litMat));
  const ringMesh = mesh(rings.build(), material({ roughness: 0.4, metalness: 0.4 }), { shadow: true, isStatic: false });
  const ringHolder = new THREE.Group();
  ringHolder.position.set(cx, 0.2 + 14.2, mz);
  ringHolder.add(ringMesh);
  group.add(ringHolder);

  // Water surface.
  const waterMat = new THREE.MeshBasicMaterial({ color: '#79c0cf', transparent: true, opacity: 0.88 });
  const water = new THREE.Mesh(new THREE.CircleGeometry(BASIN.r - BASIN.wall + 0.05, 40), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.set(cx, BASIN.water + 0.2, cz);
  group.add(water);

  // Droplets: one Points, positions and colours rewritten each frame from the show.
  const jets = [{ x: cx, z: cz, y0: CENTRE.top + 0.2, nx: 0, nz: 0, kind: 'centre', ring: -1, phase: 0, drops: CENTRE.drops, rate: CENTRE.rate }];
  RINGS.forEach((r, ri) => {
    for (let i = 0; i < r.n; i++) {
      const ang = (i / r.n) * Math.PI * 2;
      jets.push({ x: cx + Math.cos(ang) * r.r, z: cz + Math.sin(ang) * r.r, y0: 0.7, nx: Math.cos(ang), nz: Math.sin(ang), kind: 'ring', ring: ri, ang, phase: i * 0.37, drops: r.drops, rate: r.rate });
    }
  });
  const total = jets.reduce((s, j) => s + j.drops, 0);
  const dropGeom = new THREE.BufferGeometry();
  const dp = new Float32Array(total * 3), dc = new Float32Array(total * 3), ds = new Float32Array(total);
  dropGeom.setAttribute('position', new THREE.BufferAttribute(dp, 3).setUsage(THREE.DynamicDrawUsage));
  dropGeom.setAttribute('color', new THREE.BufferAttribute(dc, 3).setUsage(THREE.DynamicDrawUsage));
  dropGeom.setAttribute('size', new THREE.BufferAttribute(ds, 1));
  ds.fill(1);
  dropGeom.setDrawRange(0, 0);
  const dropMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: glowDot() }, scale: { value: 1000 }, alpha: { value: 0.9 } },
    vertexShader: `attribute float size; uniform float scale; varying vec3 vColor;
      void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = clamp(size * scale / -mv.z, 2.0, 40.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; uniform float alpha; varying vec3 vColor;
      void main(){ float a = texture2D(map, gl_PointCoord).a; if (a < 0.05) discard; gl_FragColor = vec4(vColor, a * alpha); }`,
    vertexColors: true, transparent: true, depthWrite: false
  });
  // `size` is per vertex (attribute), world units.
  ds.fill(1.0);
  const drops = new THREE.Points(dropGeom, dropMat);
  drops.frustumCulled = false;
  group.add(drops);

  const glowPoints = glows.build({ opacity: 0.85 });
  group.add(glowPoints);
  // Underwater light halos, whose colour follows the show.
  const wl = new Glows();
  for (let i = 0; i < 12; i++) { const t = (i / 12) * Math.PI * 2 + 0.26; wl.add(cx + Math.cos(t) * 8.6, 1.3, cz + Math.sin(t) * 8.6, '#ffffff', 4.2); }
  wl.add(cx, 3.4, cz, '#ffffff', 6);
  const waterGlow = wl.build({ opacity: 0.9 });
  group.add(waterGlow);
  const wlColors = waterGlow.geometry.attributes.color;

  const lights = lampPoints.map(([x, z]) => lightSource(x, 9, z, 13, '#fff0c8', 0.62, 'lamps', 'plaza-lamp'));
  lights.push(lightSource(cx, 3, cz, 22, '#9fe6f2', 0.8, 'facade', 'fountain'));
  lights.push(lightSource(cx, 18, mz, 18, '#ffe2a0', 0.8, 'facade', 'monument'));

  const tint = new THREE.Color();
  function update(frame) {
    const night = frame.lamps;
    setLevel(litMat, night, 0.3);
    glowPoints.userData.level(night);
    glowPoints.material.uniforms.scale.value = pointScale(frame, 1);
    waterGlow.material.uniforms.scale.value = pointScale(frame, 1);
    ringHolder.rotation.y = frame.time * 0.25;
    ringMesh.rotation.x = Math.sin(frame.time * 0.3) * 0.12;
    dropMat.uniforms.scale.value = pointScale(frame, 1);

    const running = frame.minute >= WATER.from && frame.minute < WATER.to;
    const show = night > 0.3 ? showLevel(frame.minute) : 0;
    // Show clock: seconds since the show began (real time of the town clock, so scrubbing is deterministic).
    const t = frame.daySeconds;
    const level = running ? 1 : 0;
    waterMat.color.set('#79c0cf').lerp(tint.set('#1c4e61'), night * 0.8);
    if (show > 0) waterMat.color.lerp(tint.setHSL((t * 0.07) % 1, 0.8, 0.4), 0.5 * show);
    if (!level) { dropGeom.setDrawRange(0, 0); waterGlow.userData.level(0); return; }

    let n = 0;
    const white = tint;
    for (const jet of jets) {
      let H, reach;
      if (jet.kind === 'centre') {
        H = CENTRE.calm * 0.8 + 1.5 * Math.sin(t * 0.9) + show * (CENTRE.show - CENTRE.calm + 4 * Math.sin(t * 1.7 + 1));
        reach = 0;
      } else {
        const r = RINGS[jet.ring];
        // A wave runs round each ring during the show, in opposite directions on alternate rings.
        const wave = 0.5 + 0.5 * Math.sin(t * (1.3 + jet.ring * 0.25) * (jet.ring % 2 ? -1 : 1) + jet.ang * (2 + jet.ring));
        H = r.calm * (0.85 + 0.15 * Math.sin(t * 0.8 + jet.phase)) + show * (r.show * (0.25 + 0.75 * wave) - r.calm);
        reach = RINGS[jet.ring].lean;
      }
      H = Math.max(0.2, H);
      for (let j = 0; j < jet.drops; j++) {
        const s = (t * jet.rate + j / jet.drops + jet.phase * 0.31) % 1;
        const o = n * 3;
        dp[o] = jet.x + jet.nx * reach * s;
        dp[o + 1] = jet.y0 + 4 * H * s * (1 - s);
        dp[o + 2] = jet.z + jet.nz * reach * s;
        // Whiter by day, coloured and brighter at night; the colour sweeps round during a show.
        if (night > 0.3) {
          const hue = jet.kind === 'centre' ? (t * 0.09) % 1 : ((t * 0.09 + (jet.ang || 0) / (Math.PI * 2) * (1 + jet.ring)) % 1);
          white.setHSL(hue, 0.85, 0.62);
          const k = 0.55 * (1 - show);
          dc[o] = white.r * (1 - k) + k; dc[o + 1] = white.g * (1 - k) + k * 0.95; dc[o + 2] = white.b * (1 - k) + k * 0.88;
        } else { dc[o] = 0.92; dc[o + 1] = 0.97; dc[o + 2] = 1; }
        n++;
      }
    }
    dropGeom.setDrawRange(0, n);
    dropGeom.attributes.position.needsUpdate = true; dropGeom.attributes.color.needsUpdate = true;
    // Underwater lights: warm white, sweeping colours in a show.
    for (let i = 0; i < 13; i++) {
      const hue = ((t * 0.09 + i / 13) % 1);
      tint.setHSL(hue, 0.9, 0.55);
      const k = 1 - show;
      wlColors.setXYZ(i, tint.r * (1 - 0.7 * k) + 0.7 * k, tint.g * (1 - 0.7 * k) + 0.85 * k, tint.b * (1 - 0.7 * k) + 0.95 * k);
    }
    wlColors.needsUpdate = true;
    waterGlow.userData.level(night * (0.55 + 0.45 * show));
    void smoothstep;
  }
  return { group, update, dispose: base.dispose, lights };
}

export function preview(ctx) { return create({ world: ctx.world, quality: ctx.quality }); }
