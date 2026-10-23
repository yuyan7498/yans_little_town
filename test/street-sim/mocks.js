// Stand-ins for the street-net agent's lines and trips and the people agent's plans,
// built on the real world and the real network, so the street runtime can be tested
// on its own. Only what src/core/street/{transit,street}.js read is provided.

import { transit as transitData, residents as residentList } from '../../src/core/data.js';
import { createNetwork } from '../../src/core/street/network.js';
import { hash, unit, rng } from '../../src/core/random.js';
import { world } from './helpers.js';

export const net = createNetwork(world, {});

// Bus lines: each data line both ways round, stops at the middle of every long stretch.
export function mockLines(pace = 3) {
  const B = transitData.bus, BUS = { ...B, cruise: B.cruise * pace, timetable: B.timetable * pace }, TAXI = { ...transitData.taxi, cruise: transitData.taxi.cruise * pace };
  const routes = [], stops = [];
  for (const line of transitData.lines) {
    for (const dir of ['in', 'out']) {
      const via = (dir === 'in' ? line.via : [...line.via].reverse()).map(ref => { const [a, s] = ref.split('/'); return world.junctionAt(a, s).node; });
      const path = net.loopLane(via);
      const route = { id: line.id + '-' + dir, line: line.id, name: line.name + '・' + (dir === 'in' ? '內圈' : '外圈'), path, stops: [] };
      for (const mark of path.marks) {
        if (mark.length < 60 || mark.over !== 'land') continue;
        const stop = { id: route.id + ':' + mark.index, route, s: mark.s, kerb: mark.kerb, lane: mark.lane, heading: mark.heading, shelter: mark.length > 120 };
        route.stops.push(stop); stops.push(stop);
      }
      routes.push(route);
    }
  }
  const byId = new Map(routes.map(r => [r.id, r]));
  const station = world.siteList.find(s => s.kind === 'station');
  const rank = { x: station.door.approach.x, z: station.door.approach.z + 6, heading: 0 };
  function runsOf(duty) {
    const runs = [], drivers = ((duty && duty.bus) || []).slice().sort((a, b) => (a.id < b.id ? -1 : 1));
    drivers.forEach((d, i) => {
      if (i >= transitData.fleet.length) return;
      const route = byId.get(transitData.fleet[i]), same = transitData.fleet.slice(0, i).filter(f => f === transitData.fleet[i]).length;
      for (const [start, end] of d.shifts) runs.push({ route, driver: d.id, start: Math.max(start, transitData.hours.first), end: Math.min(end, transitData.hours.last), phase: route.path.total * same / 2, slot: i, key: transitData.fleet[i] + '#' + i + '@' + start + ':' + d.id });
    });
    return runs.filter(r => r.end > r.start + 10);
  }
  function passTime(run, s, from) {
    const L = run.route.path.total, lap = L / BUS.timetable, depot = depotOf(run.route);
    const mod = (v, n) => ((v % n) + n) % n;
    const first = run.start + mod(s - depot - run.phase, L) / BUS.timetable;
    const t = from <= first ? first : first + Math.ceil((from - first) / lap) * lap;
    return t <= run.end ? t : null;
  }
  const depots = new Map();
  function depotOf(route) {
    if (depots.has(route)) return depots.get(route);
    let best = Infinity, s = 0;
    const p = route.path;
    for (let k = 1; k < p.points.length; k++) {
      const a = p.points[k - 1], b = p.points[k], dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((rank.x - a.x) * dx + (rank.z - a.z) * dz) / len2));
      const d = Math.hypot(a.x + dx * t - rank.x, a.z + dz * t - rank.z);
      if (d < best) { best = d; s = p.lengths[k - 1] + t * (p.lengths[k] - p.lengths[k - 1]); }
    }
    depots.set(route, s);
    return s;
  }
  return { routes, stops, rank, runsOf, passTime, BUS, TAXI, depotOf };
}

// People: real residents; drivers on the station's shifts, one stall holder at the market.
export function mockPeople({ shifts = { early: [330, 810], late: [780, 1290] } } = {}) {
  const residents = residentList, byId = new Map(residents.map(r => [r.id, r]));
  const station = world.siteList.find(s => s.kind === 'station').id, market = world.siteList.find(s => s.place === 'night-market').id;
  const cache = new Map();
  function plansFor(day) {
    if (cache.has(day)) return cache.get(day);
    const plans = new Map();
    for (const r of residents) {
      if (r.work === station && r.schedule === 'transit-driver') {
        const [a, b] = shifts[r.crew] || shifts.early;
        plans.set(r.id, { owner: r.id, day, segments: [{ start: 0, end: a, state: 'HOME', place: r.home }, { start: a, end: b, state: 'AT_WORK', place: station, activity: 'drive' }, { start: b, end: 1440, state: 'HOME', place: r.home }] });
      } else if (r.work === market) {
        plans.set(r.id, { owner: r.id, day, segments: [{ start: 0, end: 1050, state: 'HOME', place: r.home }, { start: 1050, end: 1410, state: 'AT_WORK', place: market }, { start: 1410, end: 1440, state: 'HOME', place: r.home }] });
      } else if (r.schedule === 'president') {
        plans.set(r.id, { owner: r.id, day, segments: [{ start: 0, end: 490, state: 'HOME', place: r.home }, { start: 490, end: 520, state: 'AT_WORK', place: r.work, activity: 'helicopter' }, { start: 520, end: 1440, state: 'AT_WORK', place: r.work }] });
      }
    }
    cache.set(day, plans);
    return plans;
  }
  const segmentAt = (plan, m) => { const i = plan.segments.findIndex(s => m >= s.start && m < s.end); return i < 0 ? null : { segment: plan.segments[i], index: i }; };
  return { residents, byId, plansFor, segmentAt };
}

// Trips: `count` residents going between random sites from `from` to `to` (minutes),
// by a mix of modes. Bus and taxi trips are planned against the mock lines.
export function mockTrips({ lines, people, count = 300, from = 470, to = 520, pace = 3, modes = { walk: 0.45, bicycle: 0.1, scooter: 0.2, car: 0.12, bus: 0.1, taxi: 0.03 }, seed = 'trips' } = {}) {
  const sites = world.siteList.filter(s => s.place === 'lot' && s.door);
  const cache = new Map();
  function tripsFor(day) {
    if (cache.has(day)) return cache.get(day);
    const rand = rng(seed + ':' + day), list = [];
    const pool = people.residents.filter(r => !people.plansFor(day).has(r.id));
    const duty = { bus: [], taxi: [] };
    for (const [id, plan] of people.plansFor(day)) {
      const r = people.byId.get(id), seg = plan.segments.find(s => s.state === 'AT_WORK');
      if (r && /計程車/.test(r.job)) duty.taxi.push({ id, shifts: [[seg.start, seg.end]] });
      else if (r && /司機/.test(r.job) && seg) duty.bus.push({ id, shifts: [[seg.start, seg.end]] });
    }
    const runs = lines.runsOf(duty);
    for (let i = 0; i < count && i < pool.length; i++) {
      const r = pool[i], a = sites[Math.floor(rand() * sites.length)];
      let b = sites[Math.floor(rand() * sites.length)];
      if (b === a) b = sites[(sites.indexOf(a) + 1) % sites.length];
      const depart = from + rand() * (to - from), key = r.id + ':' + day + ':' + Math.round(depart * 10);
      let pickMode = rand(), mode = 'walk';
      for (const [m, share] of Object.entries(modes)) { if (pickMode < share) { mode = m; break; } pickMode -= share; }
      const trip = { key, resident: r, day, from: a.id, to: b.id, start: depart, end: depart + 60, mode, depart, speed: 1.625, rideSpeed: 9 * pace, pauseOut: 0.3, pauseIn: 0.3, lane: (unit(key + ':lane') - 0.5) * 0.8, timed: true };
      if (mode === 'walk' || mode === 'bicycle') {
        trip.path = net.route(a.id, b.id, key);
        if (!trip.path || trip.path.total < 5) continue;
        if (mode === 'bicycle') trip.speed = 4;
        trip.arrive = depart + trip.pauseOut + trip.path.total / trip.speed + trip.pauseIn;
      } else if (mode === 'scooter' || mode === 'car') {
        const path = net.ride(a.id, b.id, key, mode === 'scooter' ? 'two' : 'car');
        if (!path) continue;
        trip.path = path;
        const L = path.legs;
        trip.t1 = depart + trip.pauseOut + L.walkEnd / trip.speed + 0.3;
        trip.t2 = trip.t1 + (L.driveEnd - L.driveStart) / trip.rideSpeed;
        trip.arrive = trip.t2 + (path.total - L.walkStart) / trip.speed + trip.pauseIn;
      } else if (mode === 'taxi') {
        const ride = net.ride(a.id, b.id, key, 'car');
        if (!ride) continue;
        const L = ride.legs;
        trip.taxiRide = ride; trip.path = ride;
        trip.walk1 = net.subPath(ride, 0, L.walkEnd); trip.walk2 = net.subPath(ride, L.walkStart, ride.total);
        trip.t1 = depart + trip.pauseOut + L.walkEnd / trip.speed + 4;
        trip.t2 = trip.t1 + (L.driveEnd - L.driveStart) / (11 * pace);
        trip.arrive = trip.t2 + trip.walk2.total / trip.speed + trip.pauseIn;
      } else if (mode === 'bus') {
        const plan = planBus(a.door, b.door, depart, runs);
        if (!plan) continue;
        Object.assign(trip, plan);
        trip.path = trip.walk1;
        trip.arrive = plan.bus.alight + trip.walk2.total / trip.speed + trip.pauseIn;
      }
      trip.end = Math.max(trip.end, trip.arrive + 5);
      list.push(trip);
    }
    list.sort((p, q) => p.depart - q.depart);
    const out = { list, byResident: new Map(), stays: [] };
    for (const t of list) out.byResident.set(t.resident.id, [t]);
    cache.set(day, out);
    return out;
  }
  // The nearest stops to each door on some running line, and the bus that serves them.
  function planBus(doorA, doorB, depart, runs) {
    let best = null;
    for (const run of runs) {
      const route = run.route, near = d => route.stops.map(s => ({ s, d: Math.hypot(s.kerb.x - d.x, s.kerb.z - d.z) })).sort((p, q) => p.d - q.d)[0];
      const A = near(doorA), B = near(doorB);
      if (!A || !B || A.s === B.s || A.d > 105 || B.d > 105) continue;
      const ride = ((B.s.s - A.s.s) % route.path.total + route.path.total) % route.path.total;
      if (ride < 50 || ride > route.path.total * 0.75) continue;
      const walk1 = net.walkBetween(doorA, waitSpot(A.s)), walk2 = net.walkBetween(waitSpot(B.s), doorB);
      if (!walk1 || !walk2) continue;
      const board = lines.passTime(run, A.s.s, depart + 0.3 + walk1.total / 1.625 + 1);
      if (board === null) continue;
      const total = walk1.total + walk2.total + ride;
      if (!best || total < best.total) best = { total, walk1, walk2, bus: { route, from: A.s, to: B.s, board, alight: board + ride / lines.BUS.timetable } };
    }
    return best;
  }
  const waitSpot = stop => { const dx = stop.kerb.x - stop.lane.x, dz = stop.kerb.z - stop.lane.z, l = Math.hypot(dx, dz) || 1; return { x: stop.kerb.x + dx / l * 2.2, z: stop.kerb.z + dz / l * 2.2 }; };
  return { tripsFor, stallOf: () => null };
}
