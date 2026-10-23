// Finds faces that z-fight: triangles facing the same way, lying in (almost) the same
// plane and overlapping, in different colours or different meshes. Such pairs flicker
// as the camera moves. Runs in the browser against a preview's scene:
//
//   node tools/shot.mjs "/tools/preview.html?m=src/render/buildings/commercial.js&ground=0" .shots/x.png \
//     --eval "import('/tools/zfight.js').then(m => m.report(window.preview.scene))"
//
// → { pairs, area, worst: [{ area, x, y, z, normal, meshes, colors }] } (worst first).
// `tolerance` is how far apart (along the normal) two faces still count as one plane.
import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _m = new THREE.Matrix4();

export function report(root, { tolerance = 0.02, minArea = 0.01, cell = 4, skip = ['stand-in-ground'], instanced = false, limit = 30 } = {}) {
  root.updateMatrixWorld(true);
  const tris = [];
  root.traverse(o => {
    if (skip.some(name => o.name === name)) { o.traverse(c => { c.userData.__zskip = true; }); return; }
    if (o.userData.__zskip || !o.isMesh || !o.visible) return;
    if (o.isInstancedMesh && !instanced) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.every(m => m.transparent && !m.depthWrite)) return;
    const g = o.geometry, pos = g.attributes.position, col = g.attributes.color, idx = g.index;
    if (!pos) return;
    const base = (mats[0] && mats[0].color) ? '#' + mats[0].color.getHexString() : '#ffffff';
    const count = o.isInstancedMesh ? o.count : 1;
    for (let k = 0; k < count; k++) {
      if (o.isInstancedMesh) { o.getMatrixAt(k, _m); _m.premultiply(o.matrixWorld); } else _m.copy(o.matrixWorld);
      const n = idx ? idx.count : pos.count;
      for (let i = 0; i + 2 < n; i += 3) {
        const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
        _a.fromBufferAttribute(pos, ia).applyMatrix4(_m);
        _b.fromBufferAttribute(pos, ib).applyMatrix4(_m);
        _c.fromBufferAttribute(pos, ic).applyMatrix4(_m);
        const nrm = new THREE.Vector3().subVectors(_b, _a).cross(new THREE.Vector3().subVectors(_c, _a));
        const area2 = nrm.length();
        if (area2 < 1e-6) continue;
        nrm.divideScalar(area2);
        // Undersides at ground level are never seen.
        if (nrm.y < -0.7 && Math.max(_a.y, _b.y, _c.y) < 0.6) continue;
        const colour = col ? '#' + new THREE.Color(col.getX(ia), col.getY(ia), col.getZ(ia)).getHexString() : base;
        tris.push({ p: [_a.clone(), _b.clone(), _c.clone()], n: nrm, d: nrm.dot(_a), mesh: o.name || o.type, colour });
      }
    }
  });

  // Group by facing, then compare faces whose planes are within `tolerance`, cell by cell.
  const groups = new Map();
  for (const t of tris) {
    const key = [t.n.x, t.n.y, t.n.z].map(v => Math.round(v * 200) / 200).join(',');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const found = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const n = list[0].n, u = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(n).normalize() : new THREE.Vector3(1, 0, 0).cross(n).normalize(), v = n.clone().cross(u);
    for (const t of list) {
      t.q = t.p.map(p => [p.dot(u), p.dot(v)]);
      t.box = [Math.min(...t.q.map(q => q[0])), Math.max(...t.q.map(q => q[0])), Math.min(...t.q.map(q => q[1])), Math.max(...t.q.map(q => q[1]))];
    }
    const grid = new Map();
    list.forEach((t, i) => {
      for (let gx = Math.floor(t.box[0] / cell); gx <= Math.floor(t.box[1] / cell); gx++)
        for (let gy = Math.floor(t.box[2] / cell); gy <= Math.floor(t.box[3] / cell); gy++) {
          const k = gx + ':' + gy;
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(i);
        }
    });
    const seen = new Set();
    for (const ids of grid.values()) {
      for (let x = 0; x < ids.length; x++) for (let y = x + 1; y < ids.length; y++) {
        const i = Math.min(ids[x], ids[y]), j = Math.max(ids[x], ids[y]), key = i * 1e7 + j;
        if (seen.has(key)) continue;
        seen.add(key);
        const A = list[i], B = list[j];
        if (Math.abs(A.d - B.d) > tolerance) continue;
        if (A.colour === B.colour && A.mesh === B.mesh) continue;
        if (A.box[1] <= B.box[0] || B.box[1] <= A.box[0] || A.box[3] <= B.box[2] || B.box[3] <= A.box[2]) continue;
        const area = overlap(A.q, B.q);
        if (area < minArea) continue;
        const c = A.p[0].clone().add(A.p[1]).add(A.p[2]).divideScalar(3);
        found.push({ area, x: c.x, y: c.y, z: c.z, normal: [n.x, n.y, n.z].map(v => +v.toFixed(2)), meshes: [A.mesh, B.mesh], colors: [A.colour, B.colour], gap: +Math.abs(A.d - B.d).toFixed(3) });
      }
    }
  }
  // Merge findings a unit apart into one spot.
  const spots = new Map();
  for (const f of found) {
    const k = [Math.round(f.x), Math.round(f.y), Math.round(f.z), f.normal.join(',')].join('|');
    const s = spots.get(k);
    if (s) s.area += f.area; else spots.set(k, { ...f, x: +f.x.toFixed(1), y: +f.y.toFixed(1), z: +f.z.toFixed(1) });
  }
  const worst = [...spots.values()].sort((p, q) => q.area - p.area).slice(0, limit).map(s => ({ ...s, area: +s.area.toFixed(2) }));
  return { triangles: tris.length, pairs: found.length, area: +found.reduce((s, f) => s + f.area, 0).toFixed(2), worst };
}

// Area of the overlap of two triangles in 2-D (clip one by the other).
function overlap(a, b) {
  const ccw = t => ((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[1][1] - t[0][1]) * (t[2][0] - t[0][0])) > 0 ? t : [t[0], t[2], t[1]];
  let poly = ccw(a).slice();
  const clip = ccw(b);
  for (let i = 0; i < 3 && poly.length; i++) {
    const p = clip[i], q = clip[(i + 1) % 3];
    const inside = r => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]) >= -1e-9;
    const cut = (r, s) => {
      const d1 = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
      const d2 = (q[0] - p[0]) * (s[1] - p[1]) - (q[1] - p[1]) * (s[0] - p[0]);
      const t = d1 / (d1 - d2);
      return [r[0] + (s[0] - r[0]) * t, r[1] + (s[1] - r[1]) * t];
    };
    const out = [];
    for (let k = 0; k < poly.length; k++) {
      const r = poly[k], s = poly[(k + 1) % poly.length];
      if (inside(r)) { out.push(r); if (!inside(s)) out.push(cut(r, s)); } else if (inside(s)) out.push(cut(r, s));
    }
    poly = out;
  }
  let area = 0;
  for (let k = 0; k < poly.length; k++) { const r = poly[k], s = poly[(k + 1) % poly.length]; area += r[0] * s[1] - s[0] * r[1]; }
  return Math.abs(area) / 2;
}
