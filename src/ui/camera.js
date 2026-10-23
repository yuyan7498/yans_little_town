// The orbit rig and its maths. Pure: no DOM, no THREE.
//
// The rig is the point the camera looks at (x, y, z), the compass direction it looks
// from (yaw), how high above the horizon it sits (pitch) and how far away (distance):
//   eye = pivot + distance · (sin yaw · cos pitch, sin pitch, cos yaw · cos pitch)
// with a vertical field of view of 30° (docs/CONTRACTS.md §Scene, view.setCamera).
// A viewport is {w, h} in CSS pixels; screen points are measured from its top left.

export const FOV = 30;
export const TAN = Math.tan(FOV * Math.PI / 360);
export const PITCH_MIN = 0.12, PITCH_MAX = 1.45, DIST_MIN = 14;
// How far past the board's edge the pivot may wander, and how high it may rise
// (high enough to keep the president's helicopter mid-screen).
const PIVOT_MARGIN = 70, PIVOT_TOP = 160;
const TAU = Math.PI * 2;

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a + (b - a) * t;
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// The yaw `to` brought within half a turn of `from`, so a flight takes the short way round.
const nearestYaw = (from, to) => from + ((((to - from) % TAU) + TAU * 1.5) % TAU - Math.PI);

// ------------------------------------------------------------------ projection

// Eye position and the camera's forward, right and up vectors.
export function basis(c, out = { eye: {}, fwd: {}, right: {}, up: {} }) {
  const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch), s = Math.sin(c.yaw), co = Math.cos(c.yaw);
  out.eye.x = c.x + s * cp * c.distance; out.eye.y = c.y + sp * c.distance; out.eye.z = c.z + co * cp * c.distance;
  out.fwd.x = -s * cp; out.fwd.y = -sp; out.fwd.z = -co * cp;
  out.right.x = co; out.right.y = 0; out.right.z = -s;
  out.up.x = -s * sp; out.up.y = cp; out.up.z = -co * sp;
  return out;
}

const scratch = basis({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, distance: 1 });

// The ray through a screen point: {o (the eye), d (not normalised)}.
export function rayAt(c, vp, px, py) {
  const b = basis(c, scratch), ax = (px / vp.w * 2 - 1) * TAN * vp.w / vp.h, ay = (1 - py / vp.h * 2) * TAN;
  return {
    o: { x: b.eye.x, y: b.eye.y, z: b.eye.z },
    d: { x: b.fwd.x + b.right.x * ax + b.up.x * ay, y: b.fwd.y + b.right.y * ax + b.up.y * ay, z: b.fwd.z + b.right.z * ax + b.up.z * ay }
  };
}

// Where a screen point meets the horizontal plane y = planeY (the pivot's by default);
// null above the horizon or absurdly far away.
export function groundAt(c, vp, px, py, planeY = c.y) {
  const r = rayAt(c, vp, px, py);
  if (r.d.y > -1e-3) return null;
  const t = (planeY - r.o.y) / r.d.y;
  if (t <= 0) return null;
  const hit = { x: r.o.x + r.d.x * t, y: planeY, z: r.o.z + r.d.z * t };
  return Math.hypot(hit.x - c.x, hit.z - c.z) > Math.max(2400, c.distance * 5) ? null : hit;
}

// A world point on screen: {x, y, depth}, or null behind the eye. Writes into `out` if given.
export function project(c, vp, p, out = null) {
  const b = basis(c, scratch), dx = p.x - b.eye.x, dy = p.y - b.eye.y, dz = p.z - b.eye.z;
  const depth = dx * b.fwd.x + dy * b.fwd.y + dz * b.fwd.z;
  if (depth <= 1) return null;
  const x = (dx * b.right.x + dy * b.right.y + dz * b.right.z) / (depth * TAN * vp.w / vp.h);
  const y = (dx * b.up.x + dy * b.up.y + dz * b.up.z) / (depth * TAN);
  const q = out || {};
  q.x = (x + 1) * vp.w / 2; q.y = (1 - y) * vp.h / 2; q.depth = depth;
  return q;
}

// Pixels per world unit at a given depth.
export const pixelsPerUnit = (vp, depth) => vp.h / (2 * TAN * depth);

// ------------------------------------------------------------------ boxes

// Axis-aligned boxes {x0, x1, y0, y1, z0, z1} for picking and line of sight.
// Ray (o + t·d) against a box: the entry t in [tMin, tMax], or -1.
export function rayBox(o, d, b, tMin = 0, tMax = Infinity) {
  let t0 = tMin, t1 = tMax;
  for (let axis = 0; axis < 3; axis++) {
    const oa = axis === 0 ? o.x : axis === 1 ? o.y : o.z, da = axis === 0 ? d.x : axis === 1 ? d.y : d.z;
    const lo = axis === 0 ? b.x0 : axis === 1 ? b.y0 : b.z0, hi = axis === 0 ? b.x1 : axis === 1 ? b.y1 : b.z1;
    if (Math.abs(da) < 1e-9) { if (oa < lo || oa > hi) return -1; continue; }
    let a = (lo - oa) / da, c = (hi - oa) / da;
    if (a > c) { const s = a; a = c; c = s; }
    if (a > t0) t0 = a;
    if (c < t1) t1 = c;
    if (t0 > t1) return -1;
  }
  return t0;
}

// The nearest box a ray hits: {box, t} or null.
export function pickBox(ray, boxes) {
  let best = null;
  for (const b of boxes) {
    const t = rayBox(ray.o, ray.d, b);
    if (t >= 0 && (!best || t < best.t)) best = { box: b, t };
  }
  return best;
}

// Is the straight line from `from` to (almost) `to` blocked by any box?
export function blocked(from, to, boxes) {
  const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  for (const b of boxes) if (rayBox(from, d, b, 0, 0.97) >= 0) return true;
  return false;
}

// Is a point inside any box, grown by `pad`?
export function insideAny(p, boxes, pad = 1.5) {
  for (const b of boxes) {
    if (p.x > b.x0 - pad && p.x < b.x1 + pad && p.z > b.z0 - pad && p.z < b.z1 + pad && p.y < b.y1 + pad && p.y > b.y0 - pad) return true;
  }
  return false;
}

// ------------------------------------------------------------------ framing

// The part of the viewport that is not under the HUD: {x0, x1, y0, y1} in pixels.
export function frameOf(vp, insets = {}) {
  const { top = 0, bottom = 0, left = 0, right = 0 } = insets;
  const x0 = Math.min(left, vp.w * 0.4), x1 = Math.max(vp.w - right, vp.w * 0.6);
  const y0 = Math.min(top, vp.h * 0.4), y1 = Math.max(vp.h - bottom, vp.h * 0.6);
  return { x0, x1, y0, y1 };
}

// The smallest distance at which every point is on screen inside `frame` (shrunk by `pad`, a share).
export function fitDistance(c, vp, points, frame, pad = 0.03) {
  const fx = (frame.x1 - frame.x0) * pad, fy = (frame.y1 - frame.y0) * pad;
  const x0 = frame.x0 + fx, x1 = frame.x1 - fx, y0 = frame.y0 + fy, y1 = frame.y1 - fy;
  let lo = 4, hi = 8000;
  const probe = { ...c }, q = {};
  for (let i = 0; i < 40; i++) {
    probe.distance = (lo + hi) / 2;
    let fits = true;
    for (const p of points) {
      const s = project(probe, vp, p, q);
      if (!s || s.x < x0 || s.x > x1 || s.y < y0 || s.y > y1) { fits = false; break; }
    }
    if (fits) hi = probe.distance; else lo = probe.distance;
  }
  return hi;
}

// Fits `points` into the frame: sets the distance, then slides the pivot (on its own
// plane) so their on-screen box sits in the middle of the frame, a few times over.
function fitPoints(c, vp, points, frame, pad) {
  for (let pass = 0; pass < 4; pass++) {
    c.distance = fitDistance(c, vp, points, frame, pad);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
      const s = project(c, vp, p);
      if (!s) continue;
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
    }
    const from = groundAt(c, vp, (minX + maxX) / 2, (minY + maxY) / 2), to = groundAt(c, vp, (frame.x0 + frame.x1) / 2, (frame.y0 + frame.y1) / 2);
    if (from && to) { c.x += from.x - to.x; c.z += from.z - to.z; }
  }
  c.distance = fitDistance(c, vp, points, frame, pad);
  return c;
}

// Corners of a box (and, for a board, its towers' height) as points to fit.
function boxPoints(x0, x1, z0, z1, y0, y1) {
  const out = [];
  for (const x of [x0, x1]) for (const z of [z0, z1]) for (const y of [y0, y1]) out.push({ x, y, z });
  return out;
}

// The whole-town view. A landscape screen sees the board from the south-east corner;
// a portrait one turns it so the long (north–south) side runs up the screen.
export const HOME_LANDSCAPE = { yaw: -0.78, pitch: 0.64 };
export const HOME_PORTRAIT = { yaw: -0.26, pitch: 0.86 };
export function homeFor(world, vp, { insets = {}, angle = null } = {}) {
  const portrait = vp.h > vp.w * 1.05, a = angle || (portrait ? HOME_PORTRAIT : HOME_LANDSCAPE);
  const b = world.board, points = boxPoints(b.minX, b.maxX, b.minZ, b.maxZ, 0, (world.tallest || 60) * 0.6);
  return fitPoints({ x: 0, y: 0, z: 0, yaw: a.yaw, pitch: a.pitch, distance: 1000 }, vp, points, frameOf(vp, insets), 0.02);
}

// Limits for a town: the pivot over the board (plus a margin), and how far out one may zoom.
export function boundsFor(world, home) {
  const b = world.board;
  return { minX: b.minX - PIVOT_MARGIN, maxX: b.maxX + PIVOT_MARGIN, minZ: b.minZ - PIVOT_MARGIN, maxZ: b.maxZ + PIVOT_MARGIN,
    distMax: Math.max(700, (home ? home.distance : 900) * 1.45) };
}

export function clampRig(c, bounds) {
  c.pitch = clamp(c.pitch, PITCH_MIN, PITCH_MAX);
  c.distance = clamp(c.distance, DIST_MIN, bounds ? bounds.distMax : 3000);
  if (bounds) { c.x = clamp(c.x, bounds.minX, bounds.maxX); c.z = clamp(c.z, bounds.minZ, bounds.maxZ); }
  c.y = clamp(c.y, 0, PIVOT_TOP);
  return c;
}

// A view of one building: its box filling a good part of the frame, seen from the
// current compass direction at a comfortable tilt.
export function boxView(box, rig, vp, { insets = {}, bounds = null } = {}) {
  const c = { x: box.x, y: Math.min(box.height * 0.35, 28), z: box.z, yaw: rig.yaw, pitch: clamp(rig.pitch, 0.5, 0.85), distance: 300 };
  const frame = frameOf(vp, insets);
  // Leave the building room: it fills about half the frame, never closer than 90 units.
  const pts = boxPoints(box.x0, box.x1, box.z0, box.z1, 0, box.height);
  c.distance = clamp(fitDistance(c, vp, pts, frame, 0.22), 90, bounds ? bounds.distMax : 900);
  return c;
}

// A view of a person or vehicle on the street (or aloft, further back).
export function pointView(p, rig, { aloft = false, vehicle = false } = {}) {
  if (aloft) return { x: p.x, y: p.y || 0, z: p.z, distance: clamp(rig.distance, 120, 260), pitch: clamp(rig.pitch, 0.45, 0.9) };
  return { x: p.x, y: 0, z: p.z, distance: clamp(Math.min(rig.distance, vehicle ? 130 : 110), 80, vehicle ? 150 : 140), pitch: clamp(rig.pitch, 0.8, 1.1) };
}

// ------------------------------------------------------------------ the live rig

// The camera the UI moves: its state, a flight in progress, following, and the
// keep-in-sight rules. `reducedMotion` makes flights short and flat.
export function createRig({ world, reducedMotion = false }) {
  const state = { x: 0, y: 0, z: 0, yaw: HOME_LANDSCAPE.yaw, pitch: HOME_LANDSCAPE.pitch, distance: 900 };
  let bounds = boundsFor(world, null), flight = null;

  function flyTo(goal, duration = 1.15) {
    const from = { ...state }, to = clampRig({ ...state, ...goal }, bounds);
    to.yaw = nearestYaw(from.yaw, to.yaw);
    // A long hop (in screen widths) takes a little longer and rises a little on the way.
    const hop = Math.hypot(to.x - from.x, to.z - from.z) / Math.max(80, Math.min(from.distance, to.distance));
    flight = reducedMotion
      ? { from, to, t: 0, duration: Math.min(0.55, duration), lift: 0 }
      : { from, to, t: 0, duration: duration * clamp(0.85 + hop * 0.12, 0.85, 1.7), lift: clamp(hop * 0.18, 0, 0.55) };
  }

  function step(dt) {
    if (!flight) return false;
    flight.t = Math.min(1, flight.t + dt / flight.duration);
    const k = easeInOut(flight.t), f = flight.from, to = flight.to;
    state.x = mix(f.x, to.x, k); state.y = mix(f.y, to.y, k); state.z = mix(f.z, to.z, k);
    state.yaw = mix(f.yaw, to.yaw, k); state.pitch = mix(f.pitch, to.pitch, k);
    // Distance travels in log space (zoom feels even) and lifts mid-flight on long hops.
    state.distance = Math.exp(mix(Math.log(f.distance), Math.log(to.distance), k)) * (1 + flight.lift * Math.sin(Math.PI * k));
    if (flight.t >= 1) flight = null;
    return true;
  }

  // Following: ease the pivot toward a moving point; a flight in progress lands on it instead.
  function track(p, dt, y = 0) {
    if (flight) { flight.to.x = p.x; flight.to.z = p.z; flight.to.y = y; return; }
    const k = 1 - Math.exp(-dt * 5);
    state.x = mix(state.x, p.x, k); state.z = mix(state.z, p.z, k); state.y = mix(state.y, y, k);
  }

  // A building between the eye and the followed person: tilt up until the view clears.
  // Nothing in the way, the visitor's own tilt stands.
  function keepInSight(p, dt, boxes) {
    if (!p || !blocked(eye(), p, boxes)) return false;
    if (flight) flight.to.pitch = Math.min(PITCH_MAX, flight.to.pitch + dt * 1.2);
    else state.pitch = Math.min(PITCH_MAX, state.pitch + dt * 1.2);
    return true;
  }

  // The eye never rests inside a building: tilt up until it clears the roof.
  function escape(boxes) {
    for (let i = 0; i < 24 && state.pitch < PITCH_MAX; i++) {
      if (!insideAny(eye(), boxes, 1.5)) return;
      state.pitch = Math.min(PITCH_MAX, state.pitch + 0.04);
    }
  }

  const eyePoint = {};
  function eye() { return Object.assign(eyePoint, basis(state, scratch).eye); }

  return {
    state,
    get flying() { return !!flight; },
    get bounds() { return bounds; },
    setBounds(next) { bounds = next; clampRig(state, bounds); },
    set(next) { flight = null; Object.assign(state, next); clampRig(state, bounds); },
    clamp() { clampRig(state, bounds); },
    stop() { flight = null; },
    flyTo, step, track, keepInSight, escape, eye
  };
}
