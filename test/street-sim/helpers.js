// Hand-built paths over the real world for the street-sim tests: lane lines through
// junctions (kept to the right), pavement walks, and a tiny depth-of-overlap check.

import { town, buildings } from '../../src/core/data.js';
import { buildWorld } from '../../src/core/world/index.js';
import { makePath } from '../../src/core/street/sim-path.js';

export const world = buildWorld(town, buildings);

// A polyline moved `off` to the right of its direction of travel (corners meet).
export function offsetLine(points, off, loop = false) {
  const n = points.length, out = [];
  const dir = (a, b) => { const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; return { x: dx / l, z: dz / l }; };
  for (let i = 0; i < n; i++) {
    const prev = i > 0 ? points[i - 1] : loop ? points[n - 1] : null;
    const next = i + 1 < n ? points[i + 1] : loop ? points[0] : null;
    const u1 = prev ? dir(prev, points[i]) : dir(points[i], next), u2 = next ? dir(points[i], next) : u1;
    const r1 = { x: -u1.z, z: u1.x }, r2 = { x: -u2.z, z: u2.x }, k = 1 + r1.x * r2.x + r1.z * r2.z;
    out.push({ x: points[i].x + off * (r1.x + r2.x) / k, z: points[i].z + off * (r1.z + r2.z) / k });
  }
  if (loop) out.push({ ...out[0] });
  return out;
}

const J = id => { const j = world.junctions.find(q => q.id === 'j:' + id); if (!j) throw new Error('no junction ' + id); return j; };

// A lane through junctions 'avenue/street' (and optional raw {x, z} points).
export function lane(stops, off = 2.4, { loop = false } = {}) {
  const pts = stops.map(s => (typeof s === 'string' ? { x: J(s).x, z: J(s).z } : s));
  return makePath(offsetLine(pts, off, loop), loop ? { loop: true } : {});
}
// A straight walk.
export const walk = (...pts) => makePath(pts.map(p => ({ x: p[0], z: p[1] })));

// How deep two movers' footprints overlap (0 when apart), boxes along their headings.
export function depthOf(a, b) {
  const A = a.kind === 'ped' ? { hl: 0.3, hw: 0.36 } : a, B = b.kind === 'ped' ? { hl: 0.3, hw: 0.36 } : b;
  const dx = b.x - a.x, dz = b.z - a.z;
  let least = Infinity;
  for (const [ux, uz] of [[a.ux, a.uz], [-a.uz, a.ux], [b.ux, b.uz], [-b.uz, b.ux]]) {
    const ra = A.hl * Math.abs(a.ux * ux + a.uz * uz) + A.hw * Math.abs(-a.uz * ux + a.ux * uz);
    const rb = B.hl * Math.abs(b.ux * ux + b.uz * uz) + B.hw * Math.abs(-b.uz * ux + b.ux * uz);
    least = Math.min(least, ra + rb - Math.abs(dx * ux + dz * uz));
    if (least <= 0) return 0;
  }
  return least;
}

// A car input following a timetable at `speed` from `t0`.
export function carInput(id, path, t, t0, { speed = 30, hl = 4.3, hw = 1.7, cls = 'car', start = 0 } = {}) {
  return { id, group: 'service', kind: 'veh', path, target: Math.min(path.loop ? Infinity : path.total, start + Math.max(0, t - t0) * speed), start,
    walkFree: speed * 1.1, rideFree: speed * 1.1, hl, hw, cls };
}
export function walkerInput(id, path, t, t0, { speed = 1.625, lat0 = 0, cls = 'walker', hl = 0.35, hw = 0.42 } = {}) {
  return { id, group: 'resident', kind: 'ped', path, target: Math.min(path.total, Math.max(0, t - t0) * speed), walkFree: speed * 1.3, lat0, hl, hw, cls, noDoorCheck: true };
}
