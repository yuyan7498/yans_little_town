// Do the zoo's animals ever poke into each other, the ground, or anything built in the zoo?
//
//   node tools/zoo-clip.mjs [animal] [--days 1] [--step 2] [--verbose]
//
// Builds the real zoo (src/render/landmarks/zoo.js, with a stand-in canvas), records every
// solid its ShapeBuilder adds, and poses the herd through the day every `step` town
// minutes. Animals that move together (a file on one ring, a calf at its mother's side)
// are compared moment by moment; animals on their own are compared in every pair of their
// states, since over enough days every pair comes round. Waders and swimmers may be in
// their pool's water (zoo.js WATER), never in its rim. Exit code 1 if anything clips;
// test/landmarks/zoo.test.js runs it too.
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const threeUrl = new URL('vendor/three/three.module.min.js', ROOT).href;
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s, c, n) { if (s === 'three') return { url: ${JSON.stringify(threeUrl)}, shortCircuit: true }; return n(s, c); }`));
if (!globalThis.document) {
  const ctx = new Proxy({}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 10 }) : String(k).startsWith('create') ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) };
}
const THREE = await import(threeUrl);
const at = p => new URL(p, ROOT).href;
const kit = await import(at('src/render/kit.js'));
const data = await import(at('src/core/data.js'));
const { buildWorld } = await import(at('src/core/world/index.js'));
const zoo = await import(at('src/render/landmarks/zoo.js'));
const { createHerd } = await import(at('src/render/landmarks/zoo-herd.js'));
const { shapeGeometries } = await import(at('src/render/landmarks/zoo-animals.js'));
const { SECONDS_PER_MINUTE } = await import(at('src/core/clock.js'));

const DEEP = 0.08;        // how far into something counts (town units for solids, unit-shape units for animals)

// Every unit shape (all convex): points on its surface, and its face planes for inside tests.
const UNITS = shapeGeometries().map(g0 => {
  const g = g0.index ? g0.toNonIndexed() : g0, pos = g.attributes.position;
  const samples = new Map(), planes = new Map(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const key = v => v.map(x => Math.round(x * 1000)).join(',');
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    for (const v of [a, b, c]) samples.set(key(v.toArray()), v.toArray());
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n.lengthSq() < 1e-12) continue;
    n.normalize();
    const plane = [n.x, n.y, n.z, n.dot(a)];
    planes.set(key(plane), plane);
    const mid = a.clone().add(b).add(c).divideScalar(3).toArray();      // face centres too (a box's corners alone miss a lot)
    samples.set(key(mid), mid);
  }
  return { samples: [...samples.values()], planes: [...planes.values()] };
});
// Depth of a point inside a unit shape (≤ 0 outside); stops early once it is clearly outside.
function unitDepth(u, x, y, z) {
  let d = Infinity;
  for (const [nx, ny, nz, w] of u.planes) { const e = w - (nx * x + ny * y + nz * z); if (e < d) { d = e; if (d < DEEP) return d; } }
  return d;
}

// Depth of a plot point inside a solid the zoo builds (its local space is in town units).
const W = new THREE.Vector3();
function solidDepth(s, p) {
  W.set(p[0], p[1], p[2]).applyMatrix4(s.inv);
  const { x, y, z } = W, P = s.p;
  switch (s.type) {
    case 'BoxGeometry': return Math.min(P.width / 2 - Math.abs(x), P.height / 2 - Math.abs(y), P.depth / 2 - Math.abs(z));
    case 'SphereGeometry': return P.radius - Math.hypot(x, y, z);
    case 'IcosahedronGeometry': return P.radius * 0.8 - Math.hypot(x, y, z);
    case 'CylinderGeometry': case 'ConeGeometry': {
      const h = P.height, rt = s.type === 'ConeGeometry' ? 0 : P.radiusTop, rb = s.type === 'ConeGeometry' ? P.radius : P.radiusBottom;
      return Math.min(rb + (rt - rb) * (y / h + 0.5) - Math.hypot(x, z), h / 2 - Math.abs(y));
    }
    case 'TorusGeometry': return P.tube - Math.hypot(Math.hypot(x, y) - P.radius, z);
    default: { const b = s.local; return Math.min(x - b.min.x, b.max.x - x, y - b.min.y, b.max.y - y, z - b.min.z, b.max.z - z); }
  }
}

// → [{ what, samples, worst, at }] (empty: nothing clips).
export async function zooClips({ days = 1, step = 2, only = '', verbose = false } = {}) {
  const solids = [], add = kit.ShapeBuilder.prototype.add;
  kit.ShapeBuilder.prototype.add = function (geometry, matrix, color) {
    if (geometry.type !== 'PlaneGeometry') {
      geometry.computeBoundingBox();
      solids.push({ type: geometry.type, p: geometry.parameters || {}, local: geometry.boundingBox.clone(), inv: matrix.clone().invert(), bb: geometry.boundingBox.clone().applyMatrix4(matrix), color });
    }
    return add.call(this, geometry, matrix, color);
  };
  const world = buildWorld(data.town, data.buildings);
  try { zoo.create({ world }); } finally { kit.ShapeBuilder.prototype.add = add; }
  // Ground patches and thin inlays are not in the way.
  const hard = solids.filter(s => s.bb.max.y - s.bb.min.y > 0.12 || s.bb.max.y > 0.6);
  const water = new Set(zoo.WATER || []);
  const specs = zoo.animalSpecs(), site = world.site('x-zoo');
  const herd = createHerd(specs, (site && site.hours) || {});
  const parts = herd.parts(), nA = specs.length;
  const inWater = s => s.swim || s.wade;

  // Which animals move together: a calf with its mother, a file on one ring.
  const group = [];
  specs.forEach((s, i) => {
    if (s.follow !== undefined) group[i] = group[s.follow];
    else if (!((s.rx || 0) + (s.rz || 0) > 0)) group[i] = 'still:' + i;
    else { const { cx, cz, rx, rz, w, w2, a, k2, dir, naps, sleeps } = s; group[i] = JSON.stringify({ cx, cz, rx, rz, w, w2, a, k2, dir, naps, sleeps }); }
  });

  const report = new Map();
  const note = (what, at, depth) => { const r = report.get(what) || { what, samples: 0, worst: 0, at }; r.samples++; if (depth > r.worst) { r.worst = depth; r.at = at; } report.set(what, r); };
  const name = i => `${specs[i].tpl}#${i}`;
  const solidName = s => `${s.type.replace('Geometry', '')} ${s.color}` + (verbose ? ` @${((s.bb.min.x + s.bb.max.x) / 2).toFixed(1)},${((s.bb.min.z + s.bb.max.z) / 2).toFixed(1)}` : '');

  // Every state of every animal: part matrices, part boxes and a box round it all.
  const K = Math.floor(1440 * days / step);
  const mats = parts.map(p => new Float32Array(K * p.length * 16)), pboxes = parts.map(p => new Float32Array(K * p.length * 6)), boxes = parts.map(() => new Float32Array(K * 6));
  const M = new THREE.Matrix4(), IM = new THREE.Matrix4(), V = new THREE.Vector3();
  const meet = (A, o, B, p) => A[o] < B[p + 3] && A[o + 3] > B[p] && A[o + 1] < B[p + 4] && A[o + 4] > B[p + 1] && A[o + 2] < B[p + 5] && A[o + 5] > B[p + 2];
  // How deep animal i (state ki) is inside animal j (state kj); stops at the first clear overlap unless `full`.
  function overlap(i, ki, j, kj, full) {
    const ni = parts[i].length, nj = parts[j].length;
    let d = 0;
    for (let a = 0; a < ni; a++) for (let b = 0; b < nj; b++) {
      if (!meet(pboxes[i], (ki * ni + a) * 6, pboxes[j], (kj * nj + b) * 6)) continue;
      M.fromArray(mats[i], (ki * ni + a) * 16); IM.fromArray(mats[j], (kj * nj + b) * 16).invert();
      const ub = UNITS[parts[j][b][0]];
      for (const q of UNITS[parts[i][a][0]].samples) {
        V.set(q[0], q[1], q[2]).applyMatrix4(M).applyMatrix4(IM);
        const dd = unitDepth(ub, V.x, V.y, V.z);
        if (dd > d) { d = dd; if (!full && d > DEEP) return d; }
      }
    }
    return d;
  }

  for (let k = 0; k < K; k++) {
    const minute = k * step;
    herd.update({ time: minute * SECONDS_PER_MINUTE, daySeconds: minute * SECONDS_PER_MINUTE, minute: minute % 1440 });
    const points = [];
    for (let i = 0; i < nA; i++) {
      const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], pts = [];
      parts[i].forEach(([shape, idx], j) => {
        herd.meshes[shape].getMatrixAt(idx, M);
        M.toArray(mats[i], (k * parts[i].length + j) * 16);
        const pb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
        for (const q of UNITS[shape].samples) {
          V.set(q[0], q[1], q[2]).applyMatrix4(M);
          pts.push([V.x, V.y, V.z]);
          for (let c = 0; c < 3; c++) { const v = V.getComponent(c); pb[c] = Math.min(pb[c], v); pb[c + 3] = Math.max(pb[c + 3], v); }
        }
        pboxes[i].set(pb, (k * parts[i].length + j) * 6);
        for (let c = 0; c < 3; c++) { box[c] = Math.min(box[c], pb[c]); box[c + 3] = Math.max(box[c + 3], pb[c + 3]); }
      });
      boxes[i].set(box, k * 6);
      points.push(pts);
    }
    for (let i = 0; i < nA; i++) {
      const s = specs[i];
      if (only && s.tpl !== only) continue;
      const floor = inWater(s) ? -Infinity : (s.y0 || 0), b = boxes[i].subarray(k * 6, k * 6 + 6);
      let low = 0;
      for (const p of points[i]) low = Math.max(low, floor - p[1]);
      if (low > DEEP + 0.02) note(`${name(i)} below its floor`, minute, low);
      for (const so of hard) {
        if (so.bb.min.x > b[3] || so.bb.max.x < b[0] || so.bb.min.y > b[4] || so.bb.max.y < b[1] || so.bb.min.z > b[5] || so.bb.max.z < b[2]) continue;
        if (inWater(s) && water.has(so.color)) continue;
        let d = 0;
        for (const p of points[i]) d = Math.max(d, solidDepth(so, p));
        if (d > DEEP) note(`${name(i)} × ${solidName(so)}`, minute, d);
      }
      for (let j = 0; j < nA; j++) {
        if (j === i || group[j] !== group[i] || specs[j].enc !== s.enc || !meet(boxes[i], k * 6, boxes[j], k * 6)) continue;
        const d = overlap(i, k, j, k, true);
        if (d > DEEP) note(`${name(i)} × ${name(j)} (together)`, minute, d);
      }
    }
  }
  // Animals on their own: every pair of their states whose boxes meet.
  for (let i = 0; i < nA; i++) for (let j = 0; j < nA; j++) {
    if (i === j || group[i] === group[j] || specs[i].enc !== specs[j].enc || (only && specs[i].tpl !== only)) continue;
    for (let ki = 0; ki < K; ki++) for (let kj = 0; kj < K; kj++) {
      if (!meet(boxes[i], ki * 6, boxes[j], kj * 6)) continue;
      const d = overlap(i, ki, j, kj, false);
      if (d > DEEP) note(`${name(i)} × ${name(j)} (apart)`, [ki * step, kj * step], d);
    }
  }
  return [...report.values()].sort((a, b) => a.what.localeCompare(b.what, 'en', { numeric: true }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(process.argv[1]))) {
  const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? Number(args[i + 1]) : d; };
  const only = args[0] && !args[0].startsWith('--') ? args[0] : '';
  const days = opt('days', 1), step = opt('step', 2);
  const clock = m => `day ${Math.floor(m / 1440) + 1} ${String(Math.floor(m % 1440 / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
  const list = await zooClips({ days, step, only, verbose: args.includes('--verbose') });
  for (const r of list) console.log(r.what.padEnd(48), 'samples', String(r.samples).padStart(6), 'worst', r.worst.toFixed(2), 'at', Array.isArray(r.at) ? r.at.map(clock).join(' vs ') : clock(r.at));
  console.log(list.length ? `${list.length} problems` : `no clipping over ${days} day(s), every ${step} min`);
  process.exitCode = list.length ? 1 : 0;
}
