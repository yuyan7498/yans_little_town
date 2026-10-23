// The town's bus lines and taxi rank (the fixed part of transit: routes, stops,
// timetable lookups). Lines come from data/transit.js as loops of junctions; the bus
// follows the shared road between consecutive junctions, in the kerb lane, both ways
// round. Stops stand mid-block at the kerb on every stretch long enough for one (never
// on a bridge or in a tunnel's cutting). Which bus each driver on shift drives comes
// from the fleet order; buses sharing a loop run evenly spaced. See docs/CONTRACTS.md §6.

import { pick } from '../random.js';
import { EPS, project } from './net-geom.js';

// Walking pace, units per town minute (the same as trips.js SPEED.walk).
const WALK = 1.625;
// A stretch of road shorter than this gets no stop.
const STOP_MIN_STRETCH = 60;
// A stop's pole stands this far onto the pavement from the kerb's edge.
const POLE_OUT = 1.2;
// A stop this close to the door of one of these places gets a shelter; of the rest,
// one in SHELTER_SHARE does.
const SHELTER_NEAR = 60;
const SHELTER_KINDS = new Set(['housing', 'primary', 'secondary', 'university', 'hospital', 'station', 'mall', 'market', 'clinic']);
const SHELTER_SHARE = 3;
// Vehicle sizes (docs/CONVENTIONS.md).
const BUS_SIZE = { length: 12.6, width: 3.8 }, TAXI_SIZE = { length: 8.6, width: 3.4 };
// Which station staff drive what, by job title.
export const DRIVER_TITLES = { taxi: /計程車/, bus: /公車|接駁/ };

const mod = (v, n) => ((v % n) + n) % n;

export function driverKind(title) {
  if (!title) return null;
  if (DRIVER_TITLES.taxi.test(title)) return 'taxi';
  if (DRIVER_TITLES.bus.test(title)) return 'bus';
  return null;
}

// Who drives today and when: {bus: [{id, shifts: [[start, end]]}], taxi: [...]}, from
// each station driver's time at the station in the day's plans (Map id -> Plan).
export function dutyFromPlans(plans, drivers, stationId) {
  const duty = { bus: [], taxi: [] };
  for (const d of drivers) {
    const plan = plans.get(d.id);
    const shifts = [];
    for (const s of (plan && plan.segments) || []) {
      if (s.place !== stationId) continue;
      const last = shifts[shifts.length - 1];
      if (last && s.start <= last[1] + 1) last[1] = s.end; else shifts.push([s.start, s.end]);
    }
    duty[d.kind].push({ id: d.id, shifts });
  }
  return duty;
}

export function createLines(net, world, transitData, { pace = 3 } = {}) {
  const T = transitData;
  const BUS = { ...T.bus, cruise: T.bus.cruise * pace, timetable: T.bus.timetable * pace, ...BUS_SIZE, first: T.hours.first, last: T.hours.last };
  const TAXI = { ...T.taxi, cruise: T.taxi.cruise * pace, ...TAXI_SIZE };
  const fleet = T.fleet || [];
  const riverX = world.river ? (world.river.x0 + world.river.x1) / 2 : 0;

  // ------------------------------------------------------------------ routes and stops
  // The world nodes a line passes, in order: each junction, and every node on the shared
  // road between it and the next.
  function loopNodes(line) {
    const js = line.via.map(ref => {
      const [avenue, street] = ref.split('/');
      const j = world.junctionAt(avenue, street);
      if (!j) throw new Error(`data/transit.js ${line.id}: 沒有 ${ref} 這個路口`);
      return j;
    });
    const out = [];
    for (let i = 0; i < js.length; i++) {
      const a = js[i], b = js[(i + 1) % js.length];
      const roadId = a.avenue === b.avenue ? a.avenue : a.street === b.street ? a.street : null;
      if (!roadId) throw new Error(`data/transit.js ${line.id}: ${a.id} 和 ${b.id} 不在同一條路上`);
      const road = world.roadById.get(roadId), u = n => (road.axis === 'x' ? n.x : n.z);
      const ua = u(a), ub = u(b), dir = Math.sign(ub - ua);
      const between = world.nodes.filter(n => n.roads.includes(roadId) && (u(n) - ua) * dir > EPS && (ub - u(n)) * dir > EPS)
        .sort((p, q) => (u(p) - u(q)) * dir);
      const chain = [world.nodes[a.node], ...between, world.nodes[b.node]];
      for (let k = 0; k + 1 < chain.length; k++) {
        const seg = world.segments.find(s => (s.a === chain[k].index && s.b === chain[k + 1].index) || (s.b === chain[k].index && s.a === chain[k + 1].index));
        if (!seg || !seg.vehicles) throw new Error(`data/transit.js ${line.id}: ${a.name} 到 ${b.name} 之間不能行車`);
      }
      out.push(world.nodes[a.node], ...between);
    }
    return out;
  }
  // Is a stop at this mark at street level, on land, mid-block on a long enough stretch?
  function stopsHere(mark) {
    if (mark.over !== 'land' || mark.length < STOP_MIN_STRETCH) return false;
    const seg = mark.segment != null ? world.segments[mark.segment] : null;
    if (seg && !seg.vehicles) return false;
    const mid = { x: (mark.lane.x + mark.kerb.x) / 2, z: (mark.lane.z + mark.kerb.z) / 2 };
    return !world.tunnels.some(t => t.street === mark.road && Math.abs(mid.x - riverX) < t.portalX + 10);
  }
  const busyDoors = world.siteList.filter(s => SHELTER_KINDS.has(s.kind)).flatMap(s => s.doors || []);
  const poles = new Map();
  function poleAt(mark, road) {
    const ox = mark.kerb.x - mark.lane.x, oz = mark.kerb.z - mark.lane.z, len = Math.hypot(ox, oz) || 1;
    const out = road.half + POLE_OUT - road.lanesAt.kerb;
    const x = mark.kerb.x + ox / len * out, z = mark.kerb.z + oz / len * out;
    const key = Math.round(x) + ',' + Math.round(z);
    if (!poles.has(key)) {
      const near = busyDoors.some(d => Math.hypot(d.x - x, d.z - z) < SHELTER_NEAR);
      poles.set(key, { id: 'pole:' + poles.size, x, z, heading: mark.heading, shelter: near || pick(key, SHELTER_SHARE) === 0, stops: [] });
    }
    return poles.get(key);
  }

  const routes = [], byId = new Map(), stops = [];
  for (const line of T.lines) {
    const loop = loopNodes(line);
    for (const dir of ['in', 'out']) {
      const nodes = dir === 'in' ? loop : loop.slice().reverse();
      const path = net.loopLane(nodes);
      // Round clockwise (north up) with right-hand traffic, the bus keeps to the outside.
      let area = 0;
      for (let i = 0; i < nodes.length; i++) { const a = nodes[i], b = nodes[(i + 1) % nodes.length]; area += a.x * b.z - b.x * a.z; }
      const route = { id: line.id + '-' + dir, line: line.id, dir, name: line.name + '・' + (area > 0 ? '外圈' : '內圈'), lineName: line.name,
        path, nodes: nodes.map(n => n.index), stops: [], depot: 0 };
      for (const mark of path.marks) {
        if (!stopsHere(mark)) continue;
        const road = world.roadById.get(mark.road), pole = poleAt(mark, road);
        const stop = { id: route.id + ':' + mark.index, route: route.id, line: line.id, s: mark.s, kerb: mark.kerb, lane: mark.lane, heading: mark.heading,
          x: pole.x, z: pole.z, pole: pole.id, shelter: pole.shelter, road: road.id };
        pole.stops.push(stop.id);
        if (net.blockKerb) net.blockKerb(stop.kerb);
        route.stops.push(stop); stops.push(stop);
      }
      route.stops.sort((a, b) => a.s - b.s);
      routes.push(route); byId.set(route.id, route);
    }
  }

  // ------------------------------------------------------------------ the taxi rank
  // In the kerb lane at the station's front, facing the way traffic goes on that side.
  const station = world.siteList.find(s => s.kind === 'station') || null;
  function rankOf() {
    if (!station) return null;
    const door = station.door, lot = station.lot ? world.lotById.get(station.lot) : null;
    const side = lot && lot.sides[station.front];
    let road = side && side.road ? world.roadById.get(side.road) : null;
    if (!road) road = world.roads.slice().sort((p, q) => dist(p, door) - dist(q, door))[0];
    const L = road.lanesAt, outer = L.car[L.car.length - 1];
    if (road.axis === 'x') {
      const sign = Math.sign(door.z - road.z) || 1;
      return { x: door.x, z: road.z + sign * outer, heading: sign > 0 ? 0 : Math.PI, kerb: { x: door.x, z: road.z + sign * L.kerb }, road: road.id, site: station.id };
    }
    const sign = Math.sign(door.x - road.x) || 1;
    return { x: road.x + sign * outer, z: door.z, heading: sign > 0 ? -Math.PI / 2 : Math.PI / 2, kerb: { x: road.x + sign * L.kerb, z: door.z }, road: road.id, site: station.id };
  }
  const dist = (road, p) => (road.axis === 'x' ? Math.abs(p.z - road.z) : Math.abs(p.x - road.x));
  const rank = rankOf();
  // Where on each loop a bus comes into and goes out of service: the point nearest the rank.
  for (const route of routes) route.depot = rank ? project(route.path, rank.x, rank.z).s : 0;

  // ------------------------------------------------------------------ timetable
  // The bus runs of a day: [{key, route, driver, start, end, phase, slot}] from who is on
  // shift. Each crew (early or late) fills the fleet list from the top, so the busy loops
  // always have their buses whoever is on.
  const runCache = new WeakMap();
  function runsOf(duty) {
    if (!duty) return [];
    if (runCache.has(duty)) return runCache.get(duty);
    const drivers = (duty.bus || []).filter(d => d.shifts && d.shifts.length)
      .map(d => ({ d, crew: d.shifts[0][0] < 600 ? 0 : 1 }))
      .sort((a, b) => a.crew - b.crew || String(a.d.id).localeCompare(String(b.d.id)));
    const crewSize = [0, 0];
    for (const e of drivers) crewSize[e.crew]++;
    const counts = [0, 0], runs = [];
    for (const { d, crew } of drivers) {
      const i = counts[crew]++;
      if (i >= fleet.length) continue;
      const route = byId.get(fleet[i]);
      if (!route) continue;
      const same = fleet.slice(0, Math.min(fleet.length, crewSize[crew])).filter(id => id === fleet[i]).length;
      const nth = fleet.slice(0, i).filter(id => id === fleet[i]).length;
      for (const [s0, s1] of d.shifts) {
        const start = Math.max(s0, BUS.first), end = Math.min(s1, BUS.last);
        if (start >= end - 10) continue;
        runs.push({ key: fleet[i] + '#' + i + '@' + Math.round(s0) + ':' + d.id, route, routeId: route.id, driver: d.id, start, end,
          phase: route.path.total * nth / Math.max(1, same), slot: i, crew });
      }
    }
    runCache.set(duty, runs);
    return runs;
  }
  // When the run's bus passes loop distance s by the timetable: the first time at or
  // after `from` and before the run ends, or null.
  function passTime(run, s, from) {
    const L = run.route.path.total, lap = L / BUS.timetable;
    const first = run.start + mod(s - run.route.depot - run.phase, L) / BUS.timetable;
    const t = from <= first ? first : first + Math.ceil((from - first) / lap - 1e-9) * lap;
    return t <= run.end ? t : null;
  }
  // The stop of a route nearest (on foot) to a door: {stop, walk} within walking reach.
  const walkCache = new Map();
  function walkTo(door, stop, toStop) {
    let m = walkCache.get(door);
    if (!m) { m = new Map(); walkCache.set(door, m); }
    const key = stop.pole + (toStop ? '>' : '<');
    if (!m.has(key)) {
      const pole = polePoint(stop);
      m.set(key, toStop ? net.walkCost(door, pole) : net.walkCost(pole, door));
    }
    return m.get(key);
  }
  const polePoints = new Map();
  const polePoint = stop => { if (!polePoints.has(stop.pole)) polePoints.set(stop.pole, { x: stop.x, z: stop.z }); return polePoints.get(stop.pole); };
  function bestStop(route, door, toStop) {
    let best = null;
    for (const stop of route.stops) {
      const walk = walkTo(door, stop, toStop);
      if (walk <= BUS.walkReach && (!best || walk < best.walk)) best = { stop, walk };
    }
    return best;
  }
  // A bus trip from door A to door B leaving no earlier than `earliest` and getting there
  // by `target` (a few minutes late is still the bus to take): {route, run, from, to,
  // board, alight, total, walk1, walk2} (walks as distances), or null when no line fits.
  function planBus(doorA, doorB, duty, earliest, target, pauses = { out: 0, in: 0 }) {
    if (!doorA || !doorB) return null;
    let best = null;
    for (const run of runsOf(duty)) {
      const route = run.route, a = bestStop(route, doorA, true), b = bestStop(route, doorB, false);
      if (!a || !b || a.stop === b.stop) continue;
      const L = route.path.total, ride = mod(b.stop.s - a.stop.s, L);
      if (ride < BUS.minRide || ride > L * 0.75) continue;
      const rideTime = ride / BUS.timetable;
      const ready = earliest + pauses.out + a.walk / WALK + 1;
      const latest = target + BUS.late - pauses.in - b.walk / WALK - rideTime - 0.8;
      if (latest < ready) continue;
      let board = null;
      for (let t = passTime(run, a.stop.s, ready); t !== null && t <= latest; t = passTime(run, a.stop.s, t + 0.01)) board = t;
      if (board === null) continue;
      const total = (a.walk + b.walk) / WALK + rideTime;
      if (!best || total < best.total - 1e-6 || (Math.abs(total - best.total) < 1e-6 && board > best.board)) {
        best = { route, run, from: a.stop, to: b.stop, board, alight: board + rideTime, total, walk1: a.walk, walk2: b.walk };
      }
    }
    return best;
  }
  function taxiOnDuty(duty, minute) {
    return ((duty && duty.taxi) || []).some(d => d.shifts.some(([s0, s1]) => minute >= s0 && minute < s1 - 5));
  }

  return { routes, byId, stops, poles: [...poles.values()], rank, runsOf, passTime, planBus, taxiOnDuty, BUS, TAXI, pace };
}
