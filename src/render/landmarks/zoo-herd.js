// The zoo's animals in motion (their part trees are in zoo-animals.js). Every part of every
// animal is an instance of one unit shape, so the whole menagerie is one draw call per
// shape. Each frame only matrices are rewritten (no allocation).
//
// Animals walk slow closed loops on the town clock, slowing down to graze now and then.
// At night, and in their nap windows, they slow to a stop where they are and lie down on
// the spot (so nobody walks through anybody on the way to bed); the walk carries on from
// there when they get up. Heads, ears, trunks and tails sway on real time. A calf can
// keep to its mother's side; animals of one enclosure that share a loop (same centre,
// radii, speeds and naps, different phase) walk it in file and never close up.
//
//   createHerd(specs, {open, close, quality, bounds}) → { meshes, update(frame), parts(), poses(), count, dispose() }
//     bounds: a THREE.Sphere (in the meshes' space) every animal always stays inside, so the
//     herd is skipped when it is out of view; lite quality: coarser shapes, no shadows.
//   walkSeconds(daySeconds, {open, close, naps}) → how long an animal has walked by then
//
// spec: { tpl, k, opts, cx, cz, rx, rz, w, w2, a, k2, phase, dir, step, y0, hop, waddle,
//         swim (bobs in water), tilt (body roll), graze, seed,
//         yaw (facing when standing still), naps: [[from, to] town minutes]?, sleeps (false:
//         never rests), wade (stands in a pool; for checks),
//         follow (index of an earlier spec), at: [ahead, side] (place in the leader's frame) }

import * as THREE from 'three';
import { TEMPLATES, SHAPES, shapeGeometries } from './zoo-animals.js';
import { SECONDS_PER_MINUTE, MINUTES_PER_DAY } from '../../core/clock.js';

const TAU = Math.PI * 2;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ the day's rest
// How sleepy an animal is at a minute of the day: 0 awake … 1 lying down.
function sleepiness(m, { open = 540, close = 1020, naps = [] }) {
  let s = 1 - smooth(open - 40, open + 5, m) * (1 - smooth(close - 10, close + 30, m));
  for (const [from, to] of naps) s = Math.max(s, smooth(from - 8, from + 8, m) * (1 - smooth(to - 8, to + 8, m)));
  return s;
}
const AWAKE = { open: -1e4, close: 1e4, naps: [] };     // never rests (sleeps: false)
const settle = s => smooth(0, 0.8, s);          // slows to a stop …
const fold = s => smooth(0.8, 1, s);            // … then lies down

// Minutes walked since midnight, minute by minute through the day (trapezoids), per profile.
const tables = new Map();
function walkTable(rest) {
  const key = `${rest.open}|${rest.close}|${JSON.stringify(rest.naps || [])}`;
  let t = tables.get(key);
  if (!t) {
    t = new Float64Array(MINUTES_PER_DAY + 1);
    let prev = 1 - settle(sleepiness(0, rest));
    for (let m = 1; m <= MINUTES_PER_DAY; m++) {
      const v = 1 - settle(sleepiness(m, rest));
      t[m] = t[m - 1] + (prev + v) / 2;
      prev = v;
    }
    tables.set(key, t);
  }
  return t;
}
export const walkSeconds = (daySeconds, rest) => walkedBy(walkTable(rest), daySeconds);
function walkedBy(t, daySeconds) {
  const abs = Math.max(0, daySeconds) / SECONDS_PER_MINUTE;
  const day = Math.floor(abs / MINUTES_PER_DAY), m = abs - day * MINUTES_PER_DAY, i = Math.min(MINUTES_PER_DAY - 1, Math.floor(m));
  return (day * t[MINUTES_PER_DAY] + t[i] + (t[i + 1] - t[i]) * (m - i)) * SECONDS_PER_MINUTE;
}

// ------------------------------------------------------------------ the herd
export function createHerd(specs, { open = 540, close = 1020, quality = 'full', bounds = null } = {}) {
  const geos = shapeGeometries(quality);
  const animals = [];
  const counts = geos.map(() => 0);
  for (const [i, s] of specs.entries()) {
    const tpl = TEMPLATES[s.tpl](s.k || 1, s.opts || {});
    const an = {
      s, tpl, seed: s.seed !== undefined ? s.seed : i * 1.7 + 0.3,
      w: s.w || 0.15, w2: s.w2 || 0.3, a: s.a !== undefined ? s.a : 0.9, k2: s.k2 || 1,
      dir: s.dir || 1, phase: s.phase || 0, moves: (s.rx || 0) + (s.rz || 0) > 0,
      rx: s.rx || 0, rz: s.rz || 0, y0: s.y0 || 0, hop: s.hop || 0, waddle: s.waddle || 0,
      swim: !!s.swim, tilt: s.tilt || 0,
      graze: s.graze === undefined ? 1 : s.graze, yaw: s.yaw || 0, step: s.step || 1.6,
      rest: s.sleeps === false ? AWAKE : { open, close, naps: s.naps || [] }, table: null,
      leader: s.follow !== undefined ? animals[s.follow] : null, at: s.at || [0, 0],
      pose: { x: 0, y: 0, z: 0, yaw: 0, walked: 0, mvPath: 0, mv: 0, sPos: 0, sFold: 0 },
      N: tpl.parts.map(() => new THREE.Matrix4()), idx: tpl.parts.map(() => -1)
    };
    an.wa = an.w * an.a / an.w2;
    an.table = walkTable(an.rest);
    an.loop = TAU * Math.max(1, Math.sqrt((an.rx * an.rx + an.rz * an.rz) / 2));    // path length per turn, near enough
    tpl.parts.forEach((p, j) => { if (p.shape >= 0) an.idx[j] = counts[p.shape]++; });
    animals.push(an);
  }

  const mat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0 });
  const names = Object.keys(SHAPES);
  const meshes = geos.map((g, si) => {
    const m = new THREE.InstancedMesh(g, mat, Math.max(1, counts[si]));
    m.count = counts[si]; m.castShadow = quality !== 'lite'; m.receiveShadow = true;
    if (bounds) m.boundingSphere = bounds.clone(); else m.frustumCulled = false;
    m.name = 'zoo-animals-' + names[si];
    return m;
  });
  const col = new THREE.Color();
  for (const an of animals) an.tpl.parts.forEach((p, j) => { if (p.shape >= 0) meshes[p.shape].setColorAt(an.idx[j], col.set(p.color)); });
  for (const m of meshes) if (m.instanceColor) m.instanceColor.needsUpdate = true;

  const root = new THREE.Matrix4(), T = new THREE.Matrix4(), R = new THREE.Matrix4(), D = new THREE.Matrix4();
  const Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), V = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);

  // Where an animal stands and how far along its walk it is (written into an.pose).
  function place(an, t, daySeconds, minute) {
    const s = an.s, o = an.pose;
    if (an.leader) {
      // At the leader's side, turning and resting with it.
      const L = an.leader.pose, c = Math.cos(L.yaw), sn = Math.sin(L.yaw), [ahead, side] = an.at;
      o.x = L.x + ahead * c + side * sn; o.z = L.z - ahead * sn + side * c; o.yaw = L.yaw;
      o.walked = L.walked; o.mvPath = L.mvPath; o.mv = L.mv; o.sPos = L.sPos; o.sFold = L.sFold;
      return;
    }
    const sl = sleepiness(minute, an.rest), sPos = settle(sl);
    o.sPos = sPos; o.sFold = fold(sl);
    if (!an.moves) {
      o.x = s.cx; o.z = s.cz; o.yaw = an.yaw + 0.35 * Math.sin(t * 0.3 + an.seed * 2) * (1 - sPos);
      o.walked = 0; o.mvPath = 0; o.mv = 0;
      return;
    }
    // The loop, on walked time; speed breathes so animals slow down and turn.
    const wt = walkedBy(an.table, daySeconds);
    const th0 = an.w * wt - an.wa * Math.cos(an.w2 * wt) + an.phase, th = an.dir * th0;
    o.x = s.cx + an.rx * Math.cos(th); o.z = s.cz + an.rz * Math.sin(an.k2 * th);
    o.yaw = Math.atan2(-an.rz * an.k2 * Math.cos(an.k2 * th) * an.dir, -an.rx * Math.sin(th) * an.dir);
    o.mvPath = (1 + an.a * Math.sin(an.w2 * wt)) / (1 + an.a);
    o.walked = Math.abs(th0) * an.loop;
    o.mv = o.mvPath * (1 - sPos);
  }

  function update(frame) {
    const t = frame.time, daySeconds = frame.daySeconds || 0;
    const minute = frame.minute !== undefined ? frame.minute : (daySeconds / SECONDS_PER_MINUTE) % MINUTES_PER_DAY;
    for (let ai = 0; ai < animals.length; ai++) {
      const an = animals[ai], parts = an.tpl.parts;
      place(an, t, daySeconds, minute);
      const { x, z, yaw, mv, sPos, sFold } = an.pose;
      const gr = an.graze * (1 - smooth(0.12, 0.4, mv)) * (1 - sPos) * (0.5 + 0.5 * Math.sin(t * 0.4 + an.seed * 3));
      const lp = an.pose.walked / an.step + an.seed;
      // Sinks as the legs fold (late, so folding legs never dig into the ground).
      const y = an.y0 + an.hop * Math.abs(Math.sin(lp)) * mv - an.tpl.lie * sFold * sFold + (an.swim ? 0.06 * Math.sin(t * 1.3 + an.seed) : 0);
      an.pose.y = y;
      E.set(an.waddle * Math.sin(lp) * mv, yaw, an.tilt, 'YZX');
      root.compose(P.set(x, y, z), Q.setFromEuler(E), ONE);

      for (let j = 0; j < parts.length; j++) {
        const p = parts[j], N = an.N[j];
        N.copy(p.par < 0 ? root : an.N[p.par]);
        if (p.pos[0] !== 0 || p.pos[1] !== 0 || p.pos[2] !== 0) N.multiply(T.makeTranslation(p.pos[0], p.pos[1], p.pos[2]));
        let a = p.base;
        switch (p.kind) {
          case 'leg': a += p.amp * Math.sin(lp + p.ph) * mv; break;
          case 'osc': a += p.amp * Math.sin(t * p.freq + p.ph); break;
          case 'neck': a += p.amp * Math.sin(t * p.freq + p.ph) + p.ga * gr; break;
          case 'flap': a += p.amp * (0.4 * Math.sin(t * p.freq * 2 + p.ph) + Math.sin(lp * 2 + p.ph) * mv); break;
          default: break;
        }
        if (p.sl !== null) a += (p.sl - a) * sFold;
        if (a !== 0) { N.multiply(p.ax === 0 ? R.makeRotationX(a) : p.ax === 1 ? R.makeRotationY(a) : R.makeRotationZ(a)); }
        if (p.shape >= 0) {
          D.copy(N);
          if (p.off[0] !== 0 || p.off[1] !== 0 || p.off[2] !== 0) D.multiply(T.makeTranslation(p.off[0], p.off[1], p.off[2]));
          D.scale(V.set(p.size[0], p.size[1], p.size[2]));
          meshes[p.shape].setMatrixAt(an.idx[j], D);
        }
      }
    }
    for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    meshes, update, count: animals.length,
    // Every animal's part instances as [shape, index] (for checks and tools).
    parts: () => animals.map(an => an.tpl.parts.map((p, j) => (p.shape >= 0 ? [p.shape, an.idx[j]] : null)).filter(Boolean)),
    poses: () => animals.map(an => ({ ...an.pose })),
    dispose() { for (const g of geos) g.dispose(); mat.dispose(); for (const m of meshes) m.dispose(); }
  };
}

// tools/preview.html?m=src/render/landmarks/zoo-herd.js&ground=0&cam=0,46,150,0,4,0
// Every animal in a row, facing +x: standing (z -27), grazing (z -9), mid-stride (z 9)
// and lying down (z 27), frozen at &t= seconds (default 0); &live=1 lets them move.
export function preview() {
  const q = new URLSearchParams(location.search), t0 = Number(q.get('t') || 0), live = q.get('live') === '1';
  const names = Object.keys(TEMPLATES), specs = [];
  const daySeconds = 600 * SECONDS_PER_MINUTE, wt = walkSeconds(daySeconds, { open: 540, close: 1020, naps: [] });
  names.forEach((tpl, i) => {
    const cx = (i - (names.length - 1) / 2) * 16;
    specs.push({ tpl, cx, cz: -27, yaw: 0, graze: 0, seed: -0.15 * t0 });
    specs.push({ tpl, cx, cz: -9, yaw: 0, seed: (Math.PI / 2 - 0.4 * t0) / 3 });
    // Facing +x at the bottom of a tiny loop, a leg pair swung right out.
    const th0 = Math.PI / 2, step = 1.6;
    specs.push({ tpl, cx, cz: 9 + 0.001, rx: 0.001, rz: 0.001, a: 0, w: 0.15, phase: -th0 - 0.15 * wt, step, graze: 0, seed: Math.PI / 2 - th0 * TAU / step });
    specs.push({ tpl, cx, cz: 27, yaw: 0, naps: [[0, MINUTES_PER_DAY]], seed: -0.15 * t0 });
  });
  const herd = createHerd(specs);
  const group = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 80), new THREE.MeshStandardMaterial({ color: '#cfc3a2', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ground.name = 'stand-in-ground';
  group.add(ground, ...herd.meshes);
  return { group, update: frame => herd.update({ ...frame, time: live ? frame.time : t0, daySeconds: live ? frame.daySeconds : daySeconds, minute: live ? frame.minute : 600 }) };
}
