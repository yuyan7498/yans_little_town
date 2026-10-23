// Geometry helpers for the street networks: polylines, offset lines, clipping and a
// binary heap for the shortest-path searches. Points are {x, z}; a path is
// {points, lengths, total}. Pure, no THREE.

export const EPS = 1e-6;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// The point of segment a-b nearest to p, its fraction t along a-b and its distance.
export function closest(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? clamp(((px - ax) * dx + (pz - az) * dz) / len2, 0, 1) : 0;
  const x = ax + dx * t, z = az + dz * t;
  return { x, z, t, d: Math.hypot(px - x, pz - z) };
}

// Measures a polyline, dropping repeated points. `map[i]` is the index input point i
// ended up at, so marks taken on the raw list can be found on the clean one.
export function measure(points) {
  const out = [], lengths = [], map = new Int32Array(points.length);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (out.length) {
      const q = out[out.length - 1], step = Math.hypot(p.x - q.x, p.z - q.z);
      if (step < 1e-4) { map[i] = out.length - 1; continue; }
      lengths.push(lengths[lengths.length - 1] + step);
    } else lengths.push(0);
    map[i] = out.length;
    out.push({ x: p.x, z: p.z });
  }
  return { points: out, lengths, total: lengths.length ? lengths[lengths.length - 1] : 0, map };
}

// A plain path from a list of points.
export function pathOf(points) {
  const m = measure(points);
  return { points: m.points, lengths: m.lengths, total: m.total };
}

export function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  return total;
}

// The point at distance s along a path: {x, z, heading, distance, index} where index is
// the path point the stretch it lies on ends at.
export function sampleAt(path, s) {
  if (!path || !path.points || !path.points.length) return null;
  const { points, lengths } = path;
  if (points.length === 1) return { x: points[0].x, z: points[0].z, heading: 0, distance: 0, index: 0 };
  const d = clamp(s, 0, path.total);
  let lo = 1, hi = lengths.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (lengths[mid] < d) lo = mid + 1; else hi = mid; }
  const a = points[lo - 1], b = points[lo], span = lengths[lo] - lengths[lo - 1];
  const t = span > 0 ? clamp((d - lengths[lo - 1]) / span, 0, 1) : 0;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading: Math.atan2(b.z - a.z, b.x - a.x), distance: d, index: lo };
}

// The stretch of a path between two distances, as a path of its own.
export function subPath(path, s0, s1) {
  const a = sampleAt(path, s0), b = sampleAt(path, Math.max(s0, s1));
  if (!a) return null;
  const points = [{ x: a.x, z: a.z }];
  for (let i = 0; i < path.points.length; i++) {
    if (path.lengths[i] > a.distance + 1e-6 && path.lengths[i] < b.distance - 1e-6) points.push(path.points[i]);
  }
  points.push({ x: b.x, z: b.z });
  return pathOf(points);
}

// Joins directed pieces {ax, az, bx, bz, off} — each a straight line moved `off` to
// its right — into one polyline. Corners meet where the moved lines cross; a change of
// offset along a straight line is eased over `ease` either side; a turn back on itself
// steps across. `reach` bounds how far from the shared point a crossing may lie.
// Returns {points, starts}: starts[i] is the index of the point where piece i begins.
export function joinPieces(pieces, ease = 1.5, reach = 6) {
  const lines = pieces.map(p => {
    const dx = p.bx - p.ax, dz = p.bz - p.az, len = Math.hypot(dx, dz);
    if (len < 1e-6) return null;
    const ux = dx / len, uz = dz / len, nx = -uz, nz = ux, off = p.off || 0;
    return { ax: p.ax + nx * off, az: p.az + nz * off, bx: p.bx + nx * off, bz: p.bz + nz * off, ux, uz, len, off };
  });
  const points = [], starts = new Array(pieces.length).fill(0);
  let last = null;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i];
    if (!t) { starts[i] = Math.max(0, points.length - 1); continue; }
    if (!last) { starts[i] = points.length; points.push({ x: t.ax, z: t.az }); last = t; continue; }
    const s = last, cross = s.ux * t.uz - s.uz * t.ux, dot = s.ux * t.ux + s.uz * t.uz;
    let joined = false;
    if (Math.abs(cross) > 0.05) {
      const k = ((t.ax - s.ax) * t.uz - (t.az - s.az) * t.ux) / cross;
      const px = s.ax + s.ux * k, pz = s.az + s.uz * k;
      const kt = (px - t.ax) * t.ux + (pz - t.az) * t.uz;
      if (k > -1e-6 && k < s.len + reach && kt > -reach && kt < t.len + 1e-6 && Math.hypot(px - s.bx, pz - s.bz) < reach) {
        starts[i] = points.length; points.push({ x: px, z: pz }); joined = true;
      }
    } else if (dot > 0 && Math.abs(s.off - t.off) > 1e-3) {
      const e = Math.min(ease, s.len * 0.45, t.len * 0.45);
      points.push({ x: s.bx - s.ux * e, z: s.bz - s.uz * e });
      starts[i] = points.length; points.push({ x: t.ax + t.ux * e, z: t.az + t.uz * e });
      joined = true;
    }
    if (!joined) {
      points.push({ x: s.bx, z: s.bz });
      starts[i] = points.length; points.push({ x: t.ax, z: t.az });
    }
    last = t;
  }
  if (last) points.push({ x: last.bx, z: last.bz });
  return { points, starts };
}

// Rounds every corner of a polyline with a quadratic arc, so a vehicle sweeps round a
// junction instead of pivoting on the spot. Gentle bends (lane changes) are eased too.
export function roundCorners(points, radius, steps = 6) {
  if (points.length < 3) return points.slice();
  const out = [points[0]];
  for (let i = 1; i + 1 < points.length; i++) {
    const a = points[i - 1], b = points[i], c = points[i + 1];
    const ab = Math.hypot(b.x - a.x, b.z - a.z), bc = Math.hypot(c.x - b.x, c.z - b.z);
    if (ab < 1e-6 || bc < 1e-6) continue;
    const bend = Math.abs((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x)) / (ab * bc);
    if (bend < 0.05) { out.push(b); continue; }
    const r = Math.min(radius, ab * 0.45, bc * 0.45);
    const p = { x: b.x + (a.x - b.x) * r / ab, z: b.z + (a.z - b.z) * r / ab };
    const q = { x: b.x + (c.x - b.x) * r / bc, z: b.z + (c.z - b.z) * r / bc };
    out.push(p);
    for (let j = 1; j <= steps; j++) {
      const t = j / steps, u = 1 - t;
      out.push({ x: u * u * p.x + 2 * u * t * b.x + t * t * q.x, z: u * u * p.z + 2 * u * t * b.z + t * t * q.z });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

// The part [t0, t1] of segment a-b inside the box, or null (Liang-Barsky).
export function clipToBox(ax, az, bx, bz, x0, x1, z0, z1) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  const edges = [[-dx, ax - x0], [dx, x1 - ax], [-dz, az - z0], [dz, z1 - az]];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-12) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return t1 > t0 ? [t0, t1] : null;
}

// Where along a polyline (as distance) the point nearest to p lies, searching only the
// stretch [from, to] when given.
export function project(path, px, pz, from = 0, to = Infinity) {
  let best = null;
  const { points, lengths } = path;
  for (let k = 1; k < points.length; k++) {
    if (lengths[k] < from || lengths[k - 1] > to) continue;
    const a = points[k - 1], b = points[k], c = closest(px, pz, a.x, a.z, b.x, b.z);
    if (!best || c.d < best.d) best = { d: c.d, s: lengths[k - 1] + c.t * (lengths[k] - lengths[k - 1]) };
  }
  return best;
}

// A binary min-heap of integer items keyed by numbers (lazy deletion: stale entries are
// skipped by the caller), reused across searches so a search allocates nothing.
export class MinHeap {
  constructor(capacity = 256) {
    this.keys = new Float64Array(capacity);
    this.items = new Int32Array(capacity);
    this.size = 0;
    this.key = 0;
  }
  clear() { this.size = 0; }
  push(key, item) {
    if (this.size === this.keys.length) this.grow();
    let i = this.size++;
    const keys = this.keys, items = this.items;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      keys[i] = keys[p]; items[i] = items[p]; i = p;
    }
    keys[i] = key; items[i] = item;
  }
  // Removes the smallest entry and returns its item; its key is left in `this.key`.
  pop() {
    const keys = this.keys, items = this.items, item = items[0];
    this.key = keys[0];
    const n = --this.size;
    if (n > 0) {
      const k = keys[n], it = items[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= k) break;
        keys[i] = keys[c]; items[i] = items[c]; i = c;
      }
      keys[i] = k; items[i] = it;
    }
    return item;
  }
  grow() {
    const keys = new Float64Array(this.keys.length * 2), items = new Int32Array(this.items.length * 2);
    keys.set(this.keys); items.set(this.items);
    this.keys = keys; this.items = items;
  }
}
