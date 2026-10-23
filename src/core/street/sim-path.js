// Small helpers over a Path ({points, lengths, total, loop?}) for the street physics:
// where distance s lies, the point and direction there, and the pieces of the path
// ahead. They write into objects the caller owns, so a frame allocates nothing.

// s brought into [0, total] (or wrapped round a loop).
export function wrapS(path, s) {
  if (!path.loop) return s < 0 ? 0 : s > path.total ? path.total : s;
  const t = s % path.total;
  return t < 0 ? t + path.total : t;
}

// Index i of the piece points[i-1] → points[i] that s lies on. Exactly at a joint, the
// piece leaving it, so a vehicle that has just pulled out faces down the lane.
export function pieceAt(path, s) {
  const L = path.lengths;
  let lo = 1, hi = L.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (L[mid] <= s) lo = mid + 1; else hi = mid;
  }
  return Math.max(1, Math.min(lo, L.length - 1));
}

// Point and unit direction at distance s: out.{x, z, ux, uz}.
export function pointAt(path, s, out) {
  const t = wrapS(path, s), i = pieceAt(path, t), P = path.points;
  const a = P[i - 1] || P[0], b = P[i] || a;
  const span = path.lengths[i] - path.lengths[i - 1], f = span > 1e-9 ? (t - path.lengths[i - 1]) / span : 0;
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
  out.x = a.x + dx * f; out.z = a.z + dz * f;
  if (len > 1e-9) { out.ux = dx / len; out.uz = dz / len; } else { out.ux = 1; out.uz = 0; }
  return out;
}

// The pieces of the path from s onward until `reach` is covered, written into `pool`
// (objects {ax, az, ux, uz, len, start}; `start` is the piece's distance on the
// unwrapped path). Returns how many.
export function piecesAhead(path, s, reach, pool) {
  let base = path.loop ? s - wrapS(path, s) : 0;
  let i = pieceAt(path, wrapS(path, s)), covered = 0, n = 0, guard = 0;
  const P = path.points, L = path.lengths;
  while (covered < reach && guard++ < 64) {
    if (i >= P.length) {
      if (!path.loop) break;
      base += path.total; i = 1;
    }
    const a = P[i - 1], b = P[i], len = L[i] - L[i - 1];
    if (len > 1e-6) {
      let p = pool[n];
      if (!p) p = pool[n] = { ax: 0, az: 0, ux: 0, uz: 0, len: 0, start: 0 };
      p.ax = a.x; p.az = a.z; p.ux = (b.x - a.x) / len; p.uz = (b.z - a.z) / len; p.len = len; p.start = base + L[i - 1];
      n++;
      covered = base + L[i] - s;
    }
    i++;
  }
  return n;
}

// Centre points one unit apart along a stretch of path, into a flat buffer
// [x, z, ux, uz, ...]. Returns the number of points.
const tmp = { x: 0, z: 0, ux: 0, uz: 0 };
export function sweepInto(path, from, to, buf) {
  let n = 0;
  for (let s = from; s <= to + 1e-6 && n < buf.length / 4; s += 1) {
    pointAt(path, s, tmp);
    buf[n * 4] = tmp.x; buf[n * 4 + 1] = tmp.z; buf[n * 4 + 2] = tmp.ux; buf[n * 4 + 3] = tmp.uz;
    n++;
  }
  return n;
}

// Where segment a→b runs inside the box [x0,x1]×[z0,z1]: [t0, t1] as fractions of
// the segment (Liang–Barsky), or null.
export function clipSegment(a, b, x0, x1, z0, z1) {
  const dx = b.x - a.x, dz = b.z - a.z;
  let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dz, dz], q = [a.x - x0, x1 - a.x, a.z - z0, z1 - a.z];
  for (let e = 0; e < 4; e++) {
    if (Math.abs(p[e]) < 1e-12) { if (q[e] < 0) return null; continue; }
    const r = q[e] / p[e];
    if (p[e] < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return t1 > t0 ? [t0, t1] : null;
}

// A path from a list of points (lengths and total worked out).
export function makePath(points, extra = {}) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  return { points, lengths, total: lengths[lengths.length - 1], ...extra };
}
