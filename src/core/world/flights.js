// 小鎮機場: the airport's layout on its plot and where each of the airline's planes is at
// any moment, as pure functions of the world and time (like helicopter.js).
//
// Every plane has its own stand on the apron. A round trip (data/town.js `airport`)
// starts the engines, pushes back onto the taxiway, taxis to the south end of the
// runway, rolls north and climbs out of town, flies a wide loop out over the plain,
// comes back on a long final from the south, lands northward, turns off at the far end
// and taxis back to its stand. Back-to-back trips of one plane are a crew's duty.
//
//   airportOf(world)            → the layout (rects in world and plot coordinates), or null
//   flightsOn(world, day)       → the day's trips with their times (town minutes of that day)
//   dutiesOn(world, day)        → the day's crew duties: [{index, plane, crew, flights, from, to}]
//   crewRoster(residents)       → Map resident id → crew index (schedule 'aircrew', id order)
//   planesAt(world, daySeconds) → every plane's pose, phase and lights
//   planeOfCrew(world, crew, daySeconds) → the plane a crew is aboard and moving, or null
//
// Plot coordinates are the site's local frame (as src/render/buildings/a-kit.js): +x out
// of the front, z along it. The runway runs along z at the back of the plot.

import { MINUTES_PER_DAY, SECONDS_PER_MINUTE } from '../clock.js';

// The plane everything here is sized for (forward +x, like every model): a regional
// turboprop with its wing on top, stylised to the town's scale.
export const PLANE = { length: 20, span: 24, height: 6.6, wheelBase: 1.4 };

// Where things stand on the plot, measured from the back edge (local x = -depth/2) and
// from the ends (local z = ±length/2). Widths in town units.
export const LAYOUT = {
  runway: { at: 11, width: 9, endInset: 5 },
  taxiway: { at: 25, width: 5, link: 12 },            // links to the runway `link` in from each end
  apron: { from: 29, to: 52 },
  stand: { at: 39, gap: 26, count: 3, first: -24 },   // stands' z: first, first+gap, …
  terminal: { from: 52, frontGap: 4, halfLength: 34 },
  tower: { at: 46, fromEnd: 14, size: 7, height: 38 },
  hangar: { from: 30, frontGap: 4, fromEnd: 3, length: 21 },
  carpark: { from: 49, frontGap: 2, fromEnd: 3, length: 22 }
};

// Speeds (town units per real second) and fixed times (town minutes).
export const MOTION = {
  push: 5, taxiOut: 14, taxiIn: 12, lift: 48, touch: 45, rollEnd: 10,
  spinUp: 3, lineUp: 2, spinDown: 3, board: 15, leave: 15, corner: 6
};

// Out past the board's edge a plane thins into the haze: whole up to `from` town units out,
// gone at `to`.
export const FADE = { from: 40, to: 640 };

// The loop flown out of sight, in plot coordinates from the runway's centre line
// [x, z, height]: climb straight out north, swing out behind the plot, come round and
// line up on a long final from the south.
const LOOP = [[0, -80, 14], [0, -320, 55], [-150, -560, 90], [-600, -780, 125], [-1300, -520, 150], [-1550, 200, 150],
  [-1150, 820, 135], [-460, 980, 112], [-60, 780, 84], [0, 560, 58], [0, 300, 30]];

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = x => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const toMin = seconds => seconds / SECONDS_PER_MINUTE;
const rect = (x0, x1, z0, z1) => ({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, x0, x1, z0, z1 });

// ------------------------------------------------------------------ the plot
const NORMAL = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
function frameOf(site) {
  const [nx, nz] = NORMAL[site.front || 'e'];
  const ox = site.area.x, oz = site.area.z, rotY = -Math.atan2(nz, nx);
  const toWorld = (lx, lz) => ({ x: ox + lx * nx - lz * nz, z: oz + lx * nz + lz * nx });
  const rectToWorld = r => { const a = toWorld(r.x0, r.z0), b = toWorld(r.x1, r.z1); return rect(Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.z, b.z), Math.max(a.z, b.z)); };
  return { ox, oz, nx, nz, rotY, toWorld, rectToWorld, heading: h => h - rotY };
}

const layouts = new WeakMap();
export function airportOf(world) {
  if (layouts.has(world)) return layouts.get(world);
  const cfg = world.config.airport;
  const site = cfg && world.site(cfg.site);
  const plan = site ? makeLayout(world, site, cfg) : null;
  layouts.set(world, plan);
  return plan;
}

function makeLayout(world, site, cfg) {
  const F = frameOf(site);
  // The plot in its own frame: depth along x, length along z.
  const depth = (F.nx ? site.area.w : site.area.d), length = (F.nx ? site.area.d : site.area.w);
  const back = -depth / 2, front = depth / 2, end = length / 2, L = LAYOUT;
  const local = {
    area: rect(back, front, -end, end),
    runway: rect(back + L.runway.at - L.runway.width / 2, back + L.runway.at + L.runway.width / 2, -end + L.runway.endInset, end - L.runway.endInset),
    taxiway: rect(back + L.taxiway.at - L.taxiway.width / 2, back + L.taxiway.at + L.taxiway.width / 2, -end + L.taxiway.link - L.taxiway.width / 2, end - L.taxiway.link + L.taxiway.width / 2),
    links: [-1, 1].map(s => rect(back + L.runway.at, back + L.taxiway.at, s * (end - L.taxiway.link) - L.taxiway.width / 2, s * (end - L.taxiway.link) + L.taxiway.width / 2)),
    apron: rect(back + L.apron.from, back + L.apron.to, -end + L.tower.fromEnd + L.tower.size, end - L.hangar.fromEnd - L.hangar.length - 2),
    terminal: rect(back + L.terminal.from, front - L.terminal.frontGap, -L.terminal.halfLength, L.terminal.halfLength),
    tower: rect(back + L.tower.at - L.tower.size / 2, back + L.tower.at + L.tower.size / 2, -end + L.tower.fromEnd - L.tower.size / 2, -end + L.tower.fromEnd + L.tower.size / 2),
    hangar: rect(back + L.hangar.from, front - L.hangar.frontGap, end - L.hangar.fromEnd - L.hangar.length, end - L.hangar.fromEnd),
    carpark: rect(back + L.carpark.from, front - L.carpark.frontGap, -end + L.carpark.fromEnd, -end + L.carpark.fromEnd + L.carpark.length)
  };
  const rx = back + L.runway.at, tx = back + L.taxiway.at, link = end - L.taxiway.link;
  const stands = Array.from({ length: L.stand.count }, (_, i) => ({ index: i, x: back + L.stand.at, z: L.stand.first + i * L.stand.gap, heading: 0 }));
  const inWorld = {};
  for (const [k, r] of Object.entries(local)) inWorld[k] = Array.isArray(r) ? r.map(F.rectToWorld) : F.rectToWorld(r);
  const towerTop = { ...F.toWorld(local.tower.x, local.tower.z), y: L.tower.height };
  const planes = cfg.planes.map((p, i) => ({ ...p, index: i, stand: stands[i % stands.length] }));
  const routes = planes.map(p => makeRoutes(p.stand, { rx, tx, link, end }));
  return {
    site, config: cfg, frame: F, local, world: inWorld, towerTop,
    stands: stands.map(s => ({ ...s, ...F.toWorld(s.x, s.z), heading: F.heading(s.heading), local: s })),
    planes, routes, runwayX: rx, taxiwayX: tx, link, end
  };
}

// ------------------------------------------------------------------ paths
// A polyline with every corner rounded (radius r), sampled: [{x, z, h (heading), s}].
function filleted(points, r) {
  const out = [];
  const push = (x, z) => { const last = out[out.length - 1]; if (!last || Math.hypot(x - last.x, z - last.z) > 1e-6) out.push({ x, z }); };
  push(points[0][0], points[0][1]);
  for (let i = 1; i < points.length - 1; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i], [cx, cz] = points[i + 1];
    const l1 = Math.hypot(bx - ax, bz - az), l2 = Math.hypot(cx - bx, cz - bz);
    const ux = (bx - ax) / l1, uz = (bz - az) / l1, vx = (cx - bx) / l2, vz = (cz - bz) / l2;
    const turn = wrap(Math.atan2(vz, vx) - Math.atan2(uz, ux));
    const cut = Math.min(r * Math.tan(Math.abs(turn) / 2), l1 / 2, l2 / 2);
    if (Math.abs(turn) < 1e-3 || cut < 1e-3) { push(bx, bz); continue; }
    const p = [bx - ux * cut, bz - uz * cut], q = [bx + vx * cut, bz + vz * cut];
    // A quadratic curve through the corner stands in for the arc.
    for (let k = 0; k <= 10; k++) {
      const t = k / 10, m = 1 - t;
      push(m * m * p[0] + 2 * m * t * bx + t * t * q[0], m * m * p[1] + 2 * m * t * bz + t * t * q[1]);
    }
  }
  push(points[points.length - 1][0], points[points.length - 1][1]);
  return measure(out);
}
function measure(pts) {
  let s = 0;
  return pts.map((p, i) => {
    if (i) s += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    return { ...p, s, h: Math.atan2(b.z - a.z, b.x - a.x) };
  });
}
function along(path, s) {
  const L = path[path.length - 1].s, d = clamp(s, 0, L);
  let lo = 0, hi = path.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (path[mid].s <= d) lo = mid; else hi = mid; }
  const a = path[lo], b = path[hi], t = b.s > a.s ? (d - a.s) / (b.s - a.s) : 0;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, h: a.h + wrap(b.h - a.h) * t, y: a.y !== undefined ? a.y + (b.y - a.y) * t : 0 };
}
const lengthOf = path => path[path.length - 1].s;

// Centripetal Catmull-Rom through 3-D points, sampled and measured along the ground.
function spline(points, per = 24) {
  const knot = (a, b) => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])));
  const out = [];
  const n = points.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(n - 1, i + 2)];
    const t0 = 0, t1 = t0 + knot(p0, p1), t2 = t1 + knot(p1, p2), t3 = t2 + knot(p2, p3);
    for (let k = 0; k < per; k++) {
      const u = t1 + (t2 - t1) * (k / per);
      const mix = (a, b, ta, tb) => a.map((v, j) => (ta === tb ? v : (v * (tb - u) + b[j] * (u - ta)) / (tb - ta)));
      const a1 = mix(p0, p1, t0, t1), a2 = mix(p1, p2, t1, t2), a3 = mix(p2, p3, t2, t3);
      const b1 = mix(a1, a2, t0, t2), b2 = mix(a2, a3, t1, t3);
      const c = mix(b1, b2, t1, t2);
      out.push({ x: c[0], z: c[1], y: c[2] });
    }
  }
  const last = points[n - 1];
  out.push({ x: last[0], z: last[1], y: last[2] });
  let s = 0;
  return out.map((p, i) => {
    if (i) s += Math.hypot(p.x - out[i - 1].x, p.z - out[i - 1].z, p.y - out[i - 1].y);
    const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)];
    return { ...p, s, h: Math.atan2(b.z - a.z, b.x - a.x), climb: Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z) || 1e-6) };
  });
}

// The ground and air routes of one plane, in plot coordinates.
function makeRoutes(stand, { rx, tx, link, end }) {
  const r = MOTION.corner;
  // Push back straight onto the taxiway (the tug turns it to face south on the way).
  const push = measure([{ x: stand.x, z: stand.z }, { x: tx, z: stand.z }]);
  const taxiOut = filleted([[tx, stand.z], [tx, link], [rx, link], [rx, link - 2]], r);
  const rollStart = link - 2, liftAt = -end * 0.22;
  const air = spline([[rx, liftAt, 0], ...LOOP.map(([x, z, y]) => [rx + x, z, y]), [rx, end + 40, 7], [rx, end - 22, 0]]);
  const touchAt = end - 22, rollOutEnd = -link;
  const taxiIn = filleted([[rx, rollOutEnd], [rx, -link - 1], [tx, -link - 1], [tx, stand.z], [stand.x, stand.z]], r);
  return { push, taxiOut, rollStart, liftAt, air, touchAt, rollOutEnd, taxiIn, stand };
}

// ------------------------------------------------------------------ the timetable
// One trip's times in town minutes of its day (all derived from the take-off roll).
function tripTimes(routes, depart, airborne) {
  const pushMin = toMin(lengthOf(routes.push) / MOTION.push), taxiOutMin = toMin(lengthOf(routes.taxiOut) / MOTION.taxiOut);
  const roll = routes.rollStart - routes.liftAt, rollMin = toMin(2 * roll / MOTION.lift);
  const rollOut = routes.touchAt - routes.rollOutEnd, rollOutMin = toMin(2 * rollOut / (MOTION.touch + MOTION.rollEnd));
  const taxiInMin = toMin(lengthOf(routes.taxiIn) / MOTION.taxiIn);
  const lineUp = depart - MOTION.lineUp, taxi = lineUp - taxiOutMin, push = taxi - pushMin, start = push - MOTION.spinUp;
  const lift = depart + rollMin, touch = lift + airborne, rolled = touch + rollOutMin, parked = rolled + taxiInMin, end = parked + MOTION.spinDown;
  return { start, push, taxi, lineUp, depart, lift, touch, rolled, parked, end };
}

const plans = new WeakMap();
function timetable(world) {
  if (plans.has(world)) return plans.get(world);
  const A = airportOf(world);
  let out = null;
  if (A) {
    const cfg = A.config, flights = [];
    A.planes.forEach((p, i) => (cfg.departures[i] || []).forEach((depart, k) => {
      const t = tripTimes(A.routes[i], depart, cfg.airborne);
      const route = (cfg.routes || [])[(i + k) % Math.max(1, (cfg.routes || []).length)] || null;
      flights.push({ id: `${p.id}:${k}`, code: 'TT' + (101 + i * 10 + k), plane: p.id, planeIndex: i, trip: k, route, ...t,
        board: t.start - MOTION.board, leave: t.end + MOTION.leave });
    }));
    // Duties: a plane's trips two by two, numbered plane by plane.
    const duties = [];
    A.planes.forEach((p, i) => {
      const own = flights.filter(f => f.planeIndex === i);
      for (let k = 0; k < own.length; k += 2) {
        const list = own.slice(k, k + 2);
        duties.push({ plane: p.id, planeIndex: i, flights: list, from: list[0].board, to: list[list.length - 1].leave });
      }
    });
    duties.forEach((d, k) => { d.index = k; });
    out = { flights, duties };
  }
  plans.set(world, out);
  return out;
}

// The day's trips (the same every day).
export function flightsOn(world, day) {
  const t = timetable(world);
  return t ? t.flights.map(f => ({ ...f, day })) : [];
}

// The day's duties and the crew on each: crews take the duties in turn, so each flies
// most days and rests on the others.
export function dutiesOn(world, day) {
  const t = timetable(world);
  if (!t) return [];
  const crews = world.config.airport.crews || 1, n = t.duties.length;
  return t.duties.map(d => ({ ...d, day, crew: (d.index + n * (Math.max(1, day) - 1)) % crews }));
}

// Crew of every aircrew resident: three to a crew in id order.
export function crewRoster(residents) {
  const crew = residents.filter(r => r.schedule === 'aircrew').map(r => r.id).sort();
  return new Map(crew.map((id, i) => [id, Math.floor(i / 3)]));
}

// ------------------------------------------------------------------ poses
const easeTaxi = u => u - Math.sin(TAU * u) / TAU;      // starts and stops gently
// Distance after time t (s) on a run from v0 to v1 over length L in T seconds.
const evenly = (v0, v1, T, t) => v0 * t + (v1 - v0) * t * t / (2 * T);

// Plane i at absolute town minute abs.
function planeState(A, T, i, abs, board) {
  const P = A.planes[i], R = A.routes[i], F = A.frame;
  const day = Math.floor(abs / MINUTES_PER_DAY) + 1, m = abs - (day - 1) * MINUTES_PER_DAY;
  const flight = T.flights.find(f => f.planeIndex === i && m >= f.start && m < f.end) || null;
  const st = R.stand;
  const base = { id: P.id, name: P.name, index: i, flight: flight ? flight.code : null, route: flight ? flight.route : null,
    phase: 'parked', x: st.x, z: st.z, y: 0, heading: st.heading, pitch: 0, bank: 0, gear: 1, spin: 0, speed: 0,
    lights: { nav: 0, beacon: 0, landing: 0, strobe: 0 }, moving: false, fade: 1, away: false, homeward: false };
  if (!flight) return finish(base, F);
  const f = flight, sec = minutes => minutes * SECONDS_PER_MINUTE;
  const spin = m < f.push ? smooth((m - f.start) / MOTION.spinUp) : m >= f.parked ? 1 - smooth((m - f.parked) / MOTION.spinDown) : 1;
  const out = { ...base, spin, lights: { nav: 1, beacon: 1, landing: 0, strobe: 0 } };
  if (m < f.push) { out.phase = 'start-up'; return finish(out, F); }
  out.moving = true;
  if (m < f.taxi) {
    // Pushed back tail first; the nose swings round to face down the taxiway.
    const u = (m - f.push) / (f.taxi - f.push), p = along(R.push, lengthOf(R.push) * easeTaxi(u));
    Object.assign(out, { phase: 'pushback', x: p.x, z: p.z, heading: st.heading + (Math.PI / 2) * smooth((u - 0.3) / 0.7), speed: MOTION.push });
    return finish(out, F);
  }
  if (m < f.lineUp) {
    const u = (m - f.taxi) / (f.lineUp - f.taxi), p = along(R.taxiOut, lengthOf(R.taxiOut) * easeTaxi(u));
    Object.assign(out, { phase: 'taxi-out', x: p.x, z: p.z, heading: p.h, speed: MOTION.taxiOut });
    return finish(out, F);
  }
  const runwayHeading = -Math.PI / 2;      // the take-off and landing run toward local -z
  if (m < f.depart) {
    Object.assign(out, { phase: 'line-up', x: A.runwayX, z: R.rollStart, heading: runwayHeading });
    out.lights.landing = 1;
    return finish(out, F);
  }
  if (m < f.lift) {
    const Tr = sec(f.lift - f.depart), tt = sec(m - f.depart), d = evenly(0, MOTION.lift, Tr, tt);
    const u = tt / Tr;
    Object.assign(out, { phase: 'take-off', x: A.runwayX, z: R.rollStart - d, heading: runwayHeading, pitch: 0.14 * smooth((u - 0.82) / 0.18), speed: MOTION.lift * u });
    out.lights.landing = 1; out.lights.strobe = 1;
    return finish(out, F);
  }
  if (m < f.touch) {
    // Airborne: along the loop, gently from lift-off speed up to cruise and back down.
    const Ta = sec(f.touch - f.lift), L = lengthOf(R.air), u = sec(m - f.lift) / Ta;
    const m0 = MOTION.lift * Ta / L, m1 = MOTION.touch * Ta / L;
    const s = L * ((u ** 3 - 2 * u * u + u) * m0 + (-2 * u ** 3 + 3 * u * u) + (u ** 3 - u * u) * m1);
    const p = along(R.air, s), q = along(R.air, s + 30), back = along(R.air, s - 30);
    const turn = wrap(q.h - back.h) / 60, speed = L * ((3 * u * u - 4 * u + 1) * m0 + (-6 * u * u + 6 * u) + (3 * u * u - 2 * u) * m1) / Ta;
    // Nose a little up of the flight path; up again in the flare just before touch-down.
    const climb = Math.atan2(q.y - back.y, 60);
    const low = p.y < 70;
    Object.assign(out, { x: p.x, z: p.z, y: p.y, heading: p.h, speed,
      pitch: clamp(climb * 0.7 + 0.07 + 0.05 * smooth(1 - p.y / 10) * (u > 0.5 ? 1 : 0), -0.1, 0.26),
      bank: clamp(Math.atan(speed * speed * turn / 60), -0.5, 0.5), gear: u < 0.5 ? 1 - smooth(p.y / 30) : smooth((70 - p.y) / 25) });
    out.phase = u < 0.5 ? (p.y < 110 ? 'climb' : 'cruise') : (p.y < 110 ? 'approach' : 'cruise');
    out.fade = fadeOf(board, out, F);
    out.away = out.fade <= 0;
    out.homeward = u >= 0.5;
    out.lights.strobe = 1; out.lights.landing = low ? 1 : 0;
    return finish(out, F);
  }
  if (m < f.rolled) {
    const Tr = sec(f.rolled - f.touch), tt = sec(m - f.touch), d = evenly(MOTION.touch, MOTION.rollEnd, Tr, tt);
    Object.assign(out, { phase: 'landing', x: A.runwayX, z: R.touchAt - d, heading: runwayHeading, pitch: 0.06 * (1 - smooth(tt / 1.2)),
      speed: MOTION.touch + (MOTION.rollEnd - MOTION.touch) * tt / Tr });
    out.lights.landing = 1; out.lights.strobe = 1;
    return finish(out, F);
  }
  if (m < f.parked) {
    const u = (m - f.rolled) / (f.parked - f.rolled), L = lengthOf(R.taxiIn);
    // Leaves the runway at roll-out speed, then the usual gentle taxi.
    const p = along(R.taxiIn, L * (0.15 * u + 0.85 * easeTaxi(u)));
    Object.assign(out, { phase: 'taxi-in', x: p.x, z: p.z, heading: p.h, speed: MOTION.taxiIn });
    return finish(out, F);
  }
  out.phase = 'shutdown'; out.moving = false;
  return finish(out, F);
}

// From plot to world coordinates.
function finish(p, F) {
  const w = F.toWorld(p.x, p.z);
  p.local = { x: p.x, z: p.z, heading: p.heading };
  p.x = w.x; p.z = w.z; p.heading = wrap(F.heading(p.heading));
  return p;
}
function fadeOf(b, p, F) {
  const w = F.toWorld(p.x, p.z);
  const out = Math.hypot(Math.max(b.minX - w.x, 0, w.x - b.maxX), Math.max(b.minZ - w.z, 0, w.z - b.maxZ));
  return 1 - smooth((out - FADE.from) / (FADE.to - FADE.from));
}

// Every plane now: [{id, name, index, flight (code or null), route, phase, x, y, z (the point
// under the wheels), heading, pitch (+ nose up), bank (+ right wing down), gear (0 up … 1
// down), spin (propellers 0 … 1), speed, lights {nav, beacon, landing, strobe} (0 or 1),
// moving, fade (1 seen … 0 faded out, far past the board), away (faded out), homeward (on the
// way back)}]. Phases: parked, start-up, pushback, taxi-out, line-up, take-off, climb, cruise,
// approach, landing, taxi-in, shutdown.
export function planesAt(world, daySeconds) {
  const A = airportOf(world), T = timetable(world);
  if (!A || !T) return [];
  const abs = Math.max(0, daySeconds) / SECONDS_PER_MINUTE;
  return A.planes.map((_, i) => planeState(A, T, i, abs, world.board));
}

// The plane a crew flies at this moment, once it has started moving (until it parks).
export function planeOfCrew(world, crew, daySeconds) {
  const T = timetable(world);
  if (!T || crew == null) return null;
  const abs = Math.max(0, daySeconds) / SECONDS_PER_MINUTE, day = Math.floor(abs / MINUTES_PER_DAY) + 1, m = abs - (day - 1) * MINUTES_PER_DAY;
  const duty = dutiesOn(world, day).find(d => d.crew === crew && m >= d.from && m < d.to);
  if (!duty) return null;
  const f = duty.flights.find(x => m >= x.push && m < x.parked);
  if (!f) return null;
  return planesAt(world, daySeconds)[f.planeIndex] || null;
}
