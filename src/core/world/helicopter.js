// The president's helicopter (docs/CONTRACTS.md §Landmarks): where it is at any
// moment, as a pure function of time. Between sorties it stands on the pad on the
// roof of the site flagged `helipad`; each sortie (data/town.js `helicopter`) spools
// the rotor up, lifts off vertically, flies one smooth closed circuit over the town
// above the tallest roof, comes back to a hover over the pad, settles and spools down.
// No THREE and no state: the same daySeconds always gives the same answer.

import { MINUTES_PER_DAY, SECONDS_PER_MINUTE, dayType } from '../clock.js';

// The pad on the roof: its deck stands `rise` above roof.y and is `size` square
// (src/render/landmarks/helipad.js draws it from these).
export const PAD = { rise: 1.6, size: 24 };

// The shape of a flight. Heights and distances in town units, times as noted.
export const FLIGHT = {
  hover: 14,          // hover height above the deck after lift-off / before touch-down
  aboveRoofs: 12,     // the hover is at least this far above the tallest roof
  clearance: 40,      // cruise height above the tallest roof
  climbOver: 150,     // path distance spent climbing to cruise height (and descending)
  lift: 4,            // town minutes of vertical lift after take-off
  descend: 5,         // town minutes of vertical descent before touch-down
  accel: 10,          // real seconds to reach cruise speed (and to slow down from it)
  ring: 0.62,         // size of the circuit, a share of the board's half extents
  ringPoints: 12,     // waypoints round the ring
  roundness: 3,       // superellipse exponent of the ring (2 = ellipse, higher = squarer)
  keepAway: 0.62,     // radians: ring waypoints this close (by angle) to the pad are dropped
  smoothing: 22,      // path distance over which the turn rate is averaged (for bank)
  gravity: 19,        // town units per real second², for how hard it banks in a turn
  maxBank: 0.42, maxPitch: 0.26
};

// The main rotor: full speed, and when it spools (town minutes into the sortie).
export const ROTOR = { speed: 2 * Math.PI * 3.2 /* radians per real second */, spinUp: 8, ready: 1, spinDownFrom: 1, stopBefore: 2 };

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = x => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const lerpAngle = (a, b, t) => a + wrap(b - a) * t;

// --------------------------------------------------------------------------- the route
// Everything that depends only on the world, worked out once per world.
const plans = new WeakMap();

function planOf(world) {
  if (plans.has(world)) return plans.get(world);
  const site = world.siteList.find(s => s.helipad && s.roof) || null;
  const plan = site ? makePlan(world, site) : null;
  plans.set(world, plan);
  return plan;
}

function makePlan(world, site) {
  const cfg = world.config.helicopter;
  const pad = { x: site.roof.x, z: site.roof.z, y: site.roof.y + PAD.rise };
  const tallestRoof = Math.max(world.tallest, ...world.siteList.map(s => (s.roof ? s.roof.y : s.height)));
  const hoverY = Math.max(pad.y + FLIGHT.hover, tallestRoof + FLIGHT.aboveRoofs);
  const cruiseY = Math.max(tallestRoof + FLIGHT.clearance, hoverY + 10);
  const route = makeRoute(world.board, pad);
  const spm = SECONDS_PER_MINUTE;
  // Real seconds of the path between the end of the lift and the start of the descent.
  const pathFrom = (cfg.takeOff + FLIGHT.lift) * spm, pathTo = (cfg.landing - FLIGHT.descend) * spm;
  const pathTime = pathTo - pathFrom;
  const accel = Math.min(FLIGHT.accel, pathTime / 3);
  const cruise = route.length / (pathTime - accel);
  const departure = headingOn(route, 0);
  // Parked square to the roof: the nearest quarter turn to the way it leaves.
  const parked = Math.round(departure / (Math.PI / 2)) * (Math.PI / 2);
  const rotor = rotorPlan(cfg);
  return { site, cfg, pad, tallestRoof, hoverY, cruiseY, route, pathFrom, pathTime, accel, cruise, departure, parked, rotor };
}

// The circuit: a rounded ring round the middle of the board with the pad spliced
// into it, joined by a closed centripetal Catmull-Rom spline and sampled densely.
function makeRoute(board, pad) {
  const cx = (board.minX + board.maxX) / 2, cz = (board.minZ + board.maxZ) / 2;
  const ax = board.halfX * FLIGHT.ring, az = board.halfZ * FLIGHT.ring, e = 2 / FLIGHT.roundness;
  const angleOf = (x, z) => Math.atan2((z - cz) / board.halfZ, (x - cx) / board.halfX);
  const padAngle = angleOf(pad.x, pad.z);
  const points = [];
  for (let i = 0; i < FLIGHT.ringPoints; i++) {
    const a = padAngle + TAU * i / FLIGHT.ringPoints + Math.PI / FLIGHT.ringPoints;
    const c = Math.cos(a), s = Math.sin(a);
    const x = cx + ax * Math.sign(c) * Math.abs(c) ** e, z = cz + az * Math.sign(s) * Math.abs(s) ** e;
    if (Math.abs(wrap(angleOf(x, z) - padAngle)) >= FLIGHT.keepAway) points.push({ x, z, a: wrap(angleOf(x, z) - padAngle) });
  }
  points.sort((p, q) => (p.a + TAU) % TAU - (q.a + TAU) % TAU);
  const ways = [{ x: pad.x, z: pad.z }, ...points.map(p => ({ x: p.x, z: p.z }))];

  // Sample the closed spline: samples[i] = {x, z, tx, tz (unit tangent), s (distance)}.
  const samples = [], PER = 48, n = ways.length;
  for (let i = 0; i < n; i++) {
    const p0 = ways[(i - 1 + n) % n], p1 = ways[i], p2 = ways[(i + 1) % n], p3 = ways[(i + 2) % n];
    for (let k = 0; k < PER; k++) {
      const t = k / PER, a = catmull(p0, p1, p2, p3, t), b = catmull(p0, p1, p2, p3, Math.min(1, t + 1e-3)), c = catmull(p0, p1, p2, p3, Math.max(0, t - 1e-3));
      const dx = b.x - c.x, dz = b.z - c.z, l = Math.hypot(dx, dz) || 1;
      samples.push({ x: a.x, z: a.z, tx: dx / l, tz: dz / l, s: 0 });
    }
  }
  samples.push({ ...samples[0] });
  for (let i = 1; i < samples.length; i++) samples[i].s = samples[i - 1].s + Math.hypot(samples[i].x - samples[i - 1].x, samples[i].z - samples[i - 1].z);
  return { samples, length: samples[samples.length - 1].s, waypoints: ways };
}

// Centripetal Catmull-Rom (Barry-Goldman) between p1 and p2.
function catmull(p0, p1, p2, p3, t) {
  const knot = (a, b) => Math.max(1e-4, Math.sqrt(Math.hypot(b.x - a.x, b.z - a.z)));
  const t0 = 0, t1 = t0 + knot(p0, p1), t2 = t1 + knot(p1, p2), t3 = t2 + knot(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const mix = (a, b, ta, tb) => ({ x: (a.x * (tb - u) + b.x * (u - ta)) / (tb - ta), z: (a.z * (tb - u) + b.z * (u - ta)) / (tb - ta) });
  const a1 = mix(p0, p1, t0, t1), a2 = mix(p1, p2, t1, t2), a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2), b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

// Point on the route at distance s (wrapping), with its unit tangent.
function pointOn(route, s) {
  const S = route.samples, L = route.length;
  const d = ((s % L) + L) % L;
  let lo = 0, hi = S.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (S[mid].s <= d) lo = mid; else hi = mid; }
  const a = S[lo], b = S[hi], t = b.s > a.s ? (d - a.s) / (b.s - a.s) : 0;
  const tx = a.tx + (b.tx - a.tx) * t, tz = a.tz + (b.tz - a.tz) * t;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx, tz };
}
const headingOn = (route, s) => { const p = pointOn(route, s); return Math.atan2(p.tz, p.tx); };

// --------------------------------------------------------------------------- the rotor
// Angle as the integral of a speed that ramps up, holds, and ramps down; the spool-down
// is stretched a little so a sortie always ends on a whole turn (parked blades sit
// exactly where they started).
function rotorPlan(cfg) {
  const spm = SECONDS_PER_MINUTE, w = ROTOR.speed;
  const uA = (cfg.takeOff - ROTOR.spinUp) * spm, uB = (cfg.takeOff - ROTOR.ready) * spm;
  const uC = (cfg.landing + ROTOR.spinDownFrom) * spm, uD = (cfg.cycleMinutes - ROTOR.stopBefore) * spm;
  const raw = w * (uB - uA) / 2 + w * (uC - uB) + w * (uD - uC) / 2;
  const total = Math.ceil(raw / TAU) * TAU;
  return { uA, uB, uC, uD, extra: total - raw, total };
}

function rotorAt(r, u) {
  const w = ROTOR.speed;
  if (u <= r.uA) return { angle: 0, spin: 0 };
  if (u <= r.uB) { const k = (u - r.uA) / (r.uB - r.uA); return { angle: w * (u - r.uA) * k / 2, spin: k }; }
  const atB = w * (r.uB - r.uA) / 2;
  if (u <= r.uC) return { angle: atB + w * (u - r.uB), spin: 1 };
  if (u <= r.uD) {
    const d = u - r.uC, span = r.uD - r.uC, k = d / span;
    return { angle: atB + w * (r.uC - r.uB) + w * d - w * d * k / 2 + r.extra * smooth(k), spin: 1 - k };
  }
  return { angle: r.total, spin: 0 };
}

// --------------------------------------------------------------------------- sorties
// The sorties of a day: [{start, takeOff, landing, end}] in town minutes of that day.
export function sortiesOn(world, day) {
  const cfg = world.config.helicopter;
  if (!cfg) return [];
  const list = dayType(day) === 'weekday' ? cfg.sorties.weekday : cfg.sorties.weekend;
  return list.map(start => ({ start, takeOff: start + cfg.takeOff, landing: start + cfg.landing, end: start + cfg.cycleMinutes,
    board: start + cfg.takeOff - cfg.boardBefore, leave: start + cfg.landing + cfg.leaveAfter }));
}

// The sortie under way at absolute town minute `abs`, as {abs0 (its start), rel (minutes into it)}.
function sortieAt(world, plan, abs) {
  const day = Math.floor(abs / MINUTES_PER_DAY) + 1;
  for (const d of [day, day - 1]) {
    if (d < 1) continue;
    const base = (d - 1) * MINUTES_PER_DAY;
    for (const s of sortiesOn(world, d)) {
      const rel = abs - (base + s.start);
      if (rel >= 0 && rel < plan.cfg.cycleMinutes) return { abs0: base + s.start, rel };
    }
  }
  return null;
}

// --------------------------------------------------------------------------- the answer
// → {phase, x, y, z (the point under the skids), heading, bank (+ = right side down),
//    pitch (+ = nose up), rotor (main rotor angle, radians), spin (rotor speed 0..1),
//    speed (town units per real second), site (helipad site id)} or null without a helipad.
export function helicopterAt(world, daySeconds) {
  const plan = planOf(world);
  if (!plan) return null;
  const abs = Math.max(0, daySeconds) / SECONDS_PER_MINUTE;
  const sortie = sortieAt(world, plan, abs);
  const parked = { phase: 'parked', x: plan.pad.x, y: plan.pad.y, z: plan.pad.z, heading: plan.parked, bank: 0, pitch: 0, rotor: 0, spin: 0, speed: 0, site: plan.site.id };
  if (!sortie) return parked;

  const { cfg } = plan, rel = sortie.rel, spm = SECONDS_PER_MINUTE;
  const u = rel * spm;                                   // real seconds into the sortie
  const rotor = rotorAt(plan.rotor, u);
  const out = { ...parked, rotor: rotor.angle % TAU, spin: rotor.spin };
  const accelMinutes = plan.accel / spm;
  out.phase = rel < cfg.takeOff ? 'boarding'
    : rel < cfg.takeOff + FLIGHT.lift + accelMinutes ? 'take-off'
    : rel < cfg.landing - FLIGHT.descend - accelMinutes ? 'circuit'
    : rel < cfg.landing ? 'landing' : 'shutdown';
  if (rel < cfg.takeOff || rel >= cfg.landing) return out;

  const liftEnd = cfg.takeOff + FLIGHT.lift, descentFrom = cfg.landing - FLIGHT.descend;
  if (rel < liftEnd) {
    // Straight up off the deck, turning on the spot to the way out.
    const k = (rel - cfg.takeOff) / FLIGHT.lift, e = smooth(k);
    out.y = plan.pad.y + (plan.hoverY - plan.pad.y) * e;
    out.heading = lerpAngle(plan.parked, plan.departure, smooth(k * 1.4 - 0.2));
    out.pitch = 0.04 * Math.sin(Math.PI * k);
    return out;
  }
  if (rel >= descentFrom) {
    const k = (rel - descentFrom) / FLIGHT.descend, e = smooth(k);
    out.y = plan.hoverY + (plan.pad.y - plan.hoverY) * e;
    out.heading = lerpAngle(plan.departure, plan.parked, smooth(k * 1.4));
    out.pitch = 0.03 * Math.sin(Math.PI * k);
    return out;
  }
  return Object.assign(out, flightAt(plan, u - plan.pathFrom));
}

// On the circuit, tau real seconds after leaving the hover.
function flightAt(plan, tau) {
  const { route, accel: A, cruise: V, pathTime: T } = plan, L = route.length;
  let s, v, a;
  if (tau < A) { const x = tau / A; s = V * A * (x ** 3 - x ** 4 / 2); v = V * smooth(x); a = V / A * 6 * x * (1 - x); }
  else if (tau > T - A) { const y = clamp((T - tau) / A, 0, 1); s = L - V * A * (y ** 3 - y ** 4 / 2); v = V * smooth(y); a = -V / A * 6 * y * (1 - y); }
  else { s = V * A / 2 + V * (tau - A); v = V; a = 0; }
  const p = pointOn(route, s);
  const heading = Math.atan2(p.tz, p.tx);
  const climb = smooth(s / FLIGHT.climbOver) * (1 - smooth((s - (L - FLIGHT.climbOver)) / FLIGHT.climbOver));
  // Turn rate averaged over a stretch of path, so the bank eases in and out of turns.
  const h = FLIGHT.smoothing, turn = wrap(headingOn(route, s + h) - headingOn(route, s - h)) / (2 * h);
  const bank = clamp(Math.atan(v * v * turn / FLIGHT.gravity), -FLIGHT.maxBank, FLIGHT.maxBank);
  const pitch = clamp(-(0.0055 * v + 0.045 * a), -FLIGHT.maxPitch, FLIGHT.maxPitch);
  return { x: p.x, z: p.z, y: plan.hoverY + (plan.cruiseY - plan.hoverY) * climb, heading, bank, pitch, speed: v };
}

// The circuit as a polyline at cruise height, for debugging views: [{x, y, z}].
export function helicopterRoute(world) {
  const plan = planOf(world);
  return plan ? plan.route.samples.map(p => ({ x: p.x, y: plan.cruiseY, z: p.z })) : [];
}
