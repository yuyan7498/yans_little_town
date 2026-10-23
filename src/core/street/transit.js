// The town's buses and taxis, with real drivers and real passengers. Buses run their
// lines (src/core/street/lines.js) driven by whichever station drivers are on shift;
// residents walk to a stop, wait, ride and walk on. Taxis are one per taxi driver on
// duty: a call sends the nearest free taxi to the kerb, people leaving the same place
// for the same place share it, and with every taxi busy the caller waits. The vehicles
// move through the street physics like everyone else.
//
// Riders go walk1 → wait → aboard → walk2 → done. Time is absolute town minutes
// (minutes since day 1, 00:00); a trip's own times are minutes of its day.

import { MINUTES_PER_DAY } from '../clock.js';

const WALK = 1.625;                 // units per town minute on foot
// Sizes (half length, half width): a bus 12.6 × 3.8, a taxi 8.6 × 3.4.
const BUS_SIZE = { hl: 6.3, hw: 1.9 }, TAXI_SIZE = { hl: 4.3, hw: 1.7 };
// Which station staff drive what: by job title.
const TAXI_JOB = /計程車/, BUS_JOB = /司機/;
const STATION_KIND = 'station';
// A crowd waiting to step down from a bus or taxi stops waiting for room after this.
const STEP_DOWN_ANYWAY = 1.5;
const PICKUP_WAIT = 3;       // town minutes a taxi waits at a pick-up for riders still on their way, then goes
const EARLY = 0.4;           // a taxi is sent to arrive about this much before its riders reach the kerb
const DETOUR = 1.5;          // road distance over straight-line (Manhattan) distance, for sending a taxi in time

const mod = (v, n) => ((v % n) + n) % n;

// Who drives today, from the plans: everyone AT_WORK at the station whose job is a
// driver's, with their shifts [[start, end], …] (town minutes of the day).
export function dutyOf(people, world, day) {
  const duty = { bus: [], taxi: [] };
  if (!people || !people.plansFor) return duty;
  const stations = new Set(world.siteList.filter(s => s.kind === STATION_KIND).map(s => s.id));
  const plans = people.plansFor(day);
  for (const [id, plan] of plans) {
    const r = (people.byId && people.byId.get(id)) || null;
    const job = r ? r.job || '' : '';
    const kind = TAXI_JOB.test(job) ? 'taxi' : BUS_JOB.test(job) ? 'bus' : null;
    if (!kind) continue;
    const shifts = [];
    for (const s of plan.segments) {
      if (s.state !== 'AT_WORK' || !stations.has(s.place)) continue;
      const last = shifts[shifts.length - 1];
      if (last && s.start - last[1] < 1) last[1] = s.end; else shifts.push([s.start, s.end]);
    }
    if (shifts.length) duty[kind].push({ id, shifts });
  }
  duty.bus.sort((a, b) => (a.id < b.id ? -1 : 1)); duty.taxi.sort((a, b) => (a.id < b.id ? -1 : 1));
  return duty;
}

export function createTransit({ net, lines, traffic, pace = 3 }) {
  const BUS = lines.BUS || {}, TAXI = lines.TAXI || {};
  const busTimetable = BUS.timetable || BUS.pace || 9 * pace, busCruise = BUS.cruise || 11 * pace;
  const capacity = BUS.capacity || 45, dwell = BUS.dwell ?? 0.5, boardEach = BUS.board ?? 0.12;
  const taxiCruise = TAXI.cruise || 11 * pace, taxiSeats = TAXI.seats || 3;
  const rank = lines.rank || { x: 0, z: 0, heading: 0 };
  const buses = new Map(), taxis = new Map(), riders = new Map(), calls = [];
  let busDay = null, legs = 0, fresh = false;
  const depots = new WeakMap(), runsCache = new WeakMap();

  // Where on a loop a bus comes into (and goes out of) service: the point nearest the rank.
  function depotOf(route) {
    if (Number.isFinite(route.depot)) return route.depot;
    let s = depots.get(route);
    if (s !== undefined) return s;
    const p = route.path;
    let best = Infinity;
    s = 0;
    for (let k = 1; k < p.points.length; k++) {
      const a = p.points[k - 1], b = p.points[k], dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((rank.x - a.x) * dx + (rank.z - a.z) * dz) / len2));
      const d = Math.hypot(a.x + dx * t - rank.x, a.z + dz * t - rank.z);
      if (d < best) { best = d; s = p.lengths[k - 1] + t * (p.lengths[k] - p.lengths[k - 1]); }
    }
    depots.set(route, s);
    return s;
  }
  const dayStart = day => (day - 1) * MINUTES_PER_DAY;
  const tripMinute = (trip, abs) => abs - dayStart(trip.day || 1);

  function reset() { buses.clear(); taxis.clear(); riders.clear(); calls.length = 0; busDay = null; }
  const agentOf = v => (v && v.agentId ? traffic.agents.get(v.agentId) || null : null);
  const stopped = (st, at) => st && st.v < 0.3 * pace && Math.abs(st.s - at) < 0.45;

  // Which drivers are working now, and the vehicles that go with them.
  function begin(day, abs, restart, duty) {
    if (restart) reset();
    fresh = !!restart;
    const minute = abs - dayStart(day);
    if (busDay !== day) {
      // Buses do not run over midnight: a new day starts the fleet afresh.
      buses.clear();
      busDay = day;
    }
    let runs = duty ? runsCache.get(duty) : null;
    if (!runs) { runs = lines.runsOf(duty) || []; if (duty) runsCache.set(duty, runs); }
    for (const run of runs) {
      if (!run.key) run.key = run.route.id + '#' + (run.slot ?? 0) + '@' + Math.round(run.start) + ':' + run.driver;
      if (minute < run.start || minute >= run.end || buses.has(run.key)) continue;
      const depot = depotOf(run.route), target = depot + (run.phase || 0) + (minute - run.start) * busTimetable;
      buses.set(run.key, { id: 'bus:' + run.key, kind: 'bus', run, route: run.route, driver: run.driver, depot,
        agentId: 'bus:' + run.key, passengers: new Set(), served: target - 1, stopAt: null, stopping: null, dwellUntil: 0,
        retiring: false, home: 0, start: target, input: null });
    }
    for (const driver of (duty && duty.taxi) || []) {
      const working = driver.shifts.some(s => minute >= s[0] && minute < s[1]);
      let taxi = taxis.get(driver.id);
      if (working && !taxi) taxis.set(driver.id, taxi = { id: 'taxi:' + driver.id, kind: 'taxi', driver: driver.id, state: 'rank', passengers: new Set(), job: null, leg: null, agentId: null, onRoad: false, input: null });
      if (taxi) taxi.onDuty = working;
    }
    for (const taxi of taxis.values()) if (!taxi.onDuty && taxi.state === 'rank') taxis.delete(taxi.driver);
    for (const bus of buses.values()) {
      const st = agentOf(bus);
      bus.retiring = minute >= bus.run.end;
      if (bus.retiring && !bus.passengers.size) {
        // Out of service: on to where it leaves the loop, then gone.
        const L = bus.route.path.total, s = st ? st.s : bus.start, home = s + mod(bus.depot - s, L);
        if (!bus.home || bus.home < s - 1) bus.home = home < s + 2 ? home + L : home;
        if (!st || st.s >= bus.home - 0.6) buses.delete(bus.run.key);
      }
    }
    dispatch(abs);
  }

  // ---------------------------------------------------------------- riders
  function waitingAt(stop, route, out) {
    out.length = 0;
    for (const r of riders.values()) if (r.phase === 'wait' && r.trip.bus && r.trip.bus.from === stop && r.trip.bus.route === route) out.push(r);
    return out;
  }
  function nearlyAt(stop, route) {
    for (const r of riders.values()) {
      if (r.phase !== 'walk1' || !r.trip.bus || r.trip.bus.from !== stop || r.trip.bus.route !== route) continue;
      const st = traffic.agents.get(r.agentId);
      if (st && r.walk1.total - st.s < 3.5) return true;
    }
    return false;
  }
  // Off the bus or taxi: still on board (`leaving`) until there is room on the kerb to
  // step down, so a busload gets off one after another instead of on one spot.
  function startWalk2(r, at) {
    r.phase = 'walk2'; r.t2 = at; r.leaving = r.vehicle; r.vehicle = null; r.agentId = r.trip.key + ':2';
  }
  function leavingFrom(v) {
    for (const r of riders.values()) if (r.leaving === v && !traffic.agents.has(r.agentId)) return true;
    return false;
  }
  // A passenger's state, set up from the timetable when first met.
  function riderOf(trip, abs) {
    let r = riders.get(trip.key);
    if (r) return r;
    const m = tripMinute(trip, abs);
    if (m < trip.depart) return null;
    const walk1 = trip.walk1 || trip.path, walk2 = trip.walk2 || null;
    if (!walk1 || !walk2) return null;
    r = { trip, phase: 'walk1', agentId: trip.key + ':1', walk1, walk2, vehicle: null, leaving: null, t2: 0, call: null, input: null };
    if (fresh && trip.mode === 'bus' && trip.bus && m >= trip.bus.board) {
      if (m >= trip.bus.alight) startWalk2(r, trip.bus.alight);
      else {
        // Mid-ride after a jump in time: aboard the bus that is now between the two stops.
        const L = trip.bus.route.path.total;
        let best = null, bestAhead = Infinity;
        for (const bus of buses.values()) {
          if (bus.route !== trip.bus.route) continue;
          const st = agentOf(bus), s = st ? st.s : bus.start;
          const ahead = mod(trip.bus.to.s - s, L), since = mod(s - trip.bus.from.s, L);
          if (ahead + since <= mod(trip.bus.to.s - trip.bus.from.s, L) + 1 && ahead < bestAhead) { best = bus; bestAhead = ahead; }
        }
        if (best) { r.phase = 'aboard'; r.vehicle = best; best.passengers.add(trip.key); }
        else r.phase = 'wait';
      }
    } else if (fresh && trip.mode === 'taxi' && Number.isFinite(trip.t2) && m >= trip.t2) startWalk2(r, trip.t2);
    riders.set(trip.key, r);
    if ((r.phase === 'walk1' || r.phase === 'wait') && trip.mode === 'taxi') call(r, abs);
    return r;
  }
  const result = { input: null, aboard: null, done: false, waiting: false };
  // What the physics should move for a bus or taxi rider now: {input, aboard (vehicle) |
  // null, done, waiting}. The result object is reused: read it before the next call.
  function passenger(trip, abs) {
    result.input = null; result.aboard = null; result.done = false; result.waiting = false;
    const r = riderOf(trip, abs);
    if (!r) { result.waiting = true; return result; }
    if (r.phase === 'done') { result.done = true; return result; }
    if (r.phase === 'aboard') { result.aboard = r.vehicle; return result; }
    const m = tripMinute(trip, abs);
    const input = r.input || (r.input = { id: '', group: 'resident', kind: 'ped', path: null, target: 0, walkFree: WALK * 1.3, lat0: 0, ref: trip, openStart: false, noDoorCheck: false });
    input.lat0 = trip.lane || 0;
    input.id = r.agentId;
    if (r.phase === 'walk1' || r.phase === 'wait') {
      const walkTime = Math.max(0.01, r.walk1.total / WALK);
      input.path = r.walk1; input.openStart = false; input.noDoorCheck = false;
      input.target = r.phase === 'wait' ? r.walk1.total : r.walk1.total * Math.max(0, Math.min(1, (m - trip.depart - (trip.pauseOut || 0)) / walkTime));
      result.input = input;
      return result;
    }
    input.path = r.walk2; input.openStart = true;
    input.target = r.walk2.total * Math.max(0, Math.min(1, (m - r.t2) / Math.max(0.01, r.walk2.total / WALK)));
    const leaving = r.leaving && !traffic.agents.has(r.agentId) ? r.leaving : null;
    if (leaving && m < r.t2) { result.aboard = leaving; return result; }
    input.noDoorCheck = m > r.t2 + STEP_DOWN_ANYWAY;      // a crowd on the kerb: step down anyway
    result.input = input; result.aboard = leaving;
    return result;
  }

  // ---------------------------------------------------------------- taxis
  function call(r, abs) {
    if (r.call) return;
    const trip = r.trip, ride = trip.taxiRide;
    if (!ride || !ride.legs) return;
    // Same door, same destination, not picked up yet: share the ride.
    // When the rider reaches the kerb: the taxi is sent to be there then, not an hour early.
    const ready = dayStart(trip.day || 1) + (Number.isFinite(trip.t1) ? trip.t1 - (TAXI.expectWait || 0) : trip.depart);
    const shared = calls.find(c => c.state !== 'picked' && c.from === trip.from && c.to === trip.to && c.riders.length < taxiSeats && (c.state === 'open' || c.taxi && c.taxi.state === 'toPickup'));
    if (shared) { shared.riders.push(r); r.call = shared; shared.ready = Math.max(shared.ready, ready); return; }
    const at = net.sampleAt(ride, ride.legs.driveStart + 0.01);
    r.call = { from: trip.from, to: trip.to, ride, riders: [r], state: 'open', since: abs, taxi: null, ready,
      pickup: { x: at.x, z: at.z, heading: at.heading } };
    calls.push(r.call);
  }
  function taxiPlace(taxi) {
    const st = agentOf(taxi);
    if (st) return { x: st.x, z: st.z, heading: Math.atan2(st.uz, st.ux) };
    return { x: rank.x, z: rank.z, heading: rank.heading };
  }
  function setLeg(taxi, path, state) {
    taxi.onRoad = !!agentOf(taxi);
    taxi.waitSince = null;
    taxi.leg = path; taxi.state = state; taxi.agentId = taxi.id + '#' + (++legs);
  }
  function sendTo(taxi, c) {
    const from = taxiPlace(taxi);
    taxi.job = c; c.state = 'assigned'; c.taxi = taxi;
    setLeg(taxi, net.approach(from, from.heading, c.pickup, c.pickup.heading), 'toPickup');
  }
  const etaOf = (p, c) => (Math.abs(p.x - c.pickup.x) + Math.abs(p.z - c.pickup.z)) * DETOUR / taxiCruise + 0.3;
  function dispatch(abs) {
    for (const c of calls) {
      if (c.state !== 'open') continue;
      let best = null, bestD = Infinity;
      for (const taxi of taxis.values()) {
        if (!taxi.onDuty || (taxi.state !== 'rank' && taxi.state !== 'toRank')) continue;
        const p = taxiPlace(taxi), d = Math.abs(p.x - c.pickup.x) + Math.abs(p.z - c.pickup.z);
        if (d < bestD) { best = taxi; bestD = d; }
      }
      // Not before it is time to leave to be there when they are.
      if (best && abs >= c.ready - EARLY - etaOf(taxiPlace(best), c)) sendTo(best, c);
    }
  }
  function taxiStep(taxi, abs) {
    const st = agentOf(taxi);
    if (!taxi.leg || !st || !stopped(st, taxi.leg.total)) return;
    if (taxi.state === 'toPickup') taxi.state = 'atPickup';
    if (taxi.state === 'atPickup') {
      const c = taxi.job;
      for (const r of c.riders) if (r.phase === 'wait') { r.phase = 'aboard'; r.vehicle = taxi; taxi.passengers.add(r.trip.key); }
      if (taxi.waitSince == null) taxi.waitSince = abs;
      const late = abs - taxi.waitSince > PICKUP_WAIT;
      if (c.riders.every(r => r.phase === 'aboard') || (late && c.riders.some(r => r.phase === 'aboard'))) {
        // (Off with those aboard; anyone still on their way calls another taxi.)
        const behind = c.riders.filter(r => r.phase !== 'aboard');
        c.riders = c.riders.filter(r => r.phase === 'aboard');
        c.state = 'picked';
        setLeg(taxi, net.subPath(c.ride, c.ride.legs.driveStart, c.ride.legs.driveEnd), 'toDropoff');
        for (const r of behind) { r.call = null; call(r, abs); }
      } else if (late) {
        // Nobody came: away rather than hold up the road, and they call again.
        calls.splice(calls.indexOf(c), 1);
        taxi.job = null; taxi.state = 'dropping';
        for (const r of c.riders) { r.call = null; call(r, abs); }
      }
      return;
    }
    if (taxi.state === 'toDropoff') {
      let i = 0;
      for (const r of taxi.job.riders) if (r.vehicle === taxi) startWalk2(r, tripMinute(r.trip, abs) + (i++) * 0.15);
      taxi.passengers.clear();
      taxi.state = 'dropping';
    }
    if (taxi.state === 'dropping') {
      if (leavingFrom(taxi)) return;
      if (taxi.job) calls.splice(calls.indexOf(taxi.job), 1);
      taxi.job = null;
      let waiting = null;
      const here0 = taxiPlace(taxi);
      for (const c of calls) if (c.state === 'open' && abs >= c.ready - EARLY - etaOf(here0, c) && (!waiting || c.since < waiting.since)) waiting = c;
      if (waiting && taxi.onDuty) { sendTo(taxi, waiting); return; }
      const here = taxiPlace(taxi);
      setLeg(taxi, net.approach(here, here.heading, rank, rank.heading), 'toRank');
      return;
    }
    if (taxi.state === 'toRank') {
      taxi.state = 'rank'; taxi.leg = null; taxi.agentId = null; taxi.onRoad = false;
      if (!taxi.onDuty) taxis.delete(taxi.driver);
    }
  }

  // ---------------------------------------------------------------- buses
  const boarding = [];
  function busStep(bus, abs) {
    const st = agentOf(bus);
    if (!st) return;
    const route = bus.route, L = route.path.total, minute = abs - dayStart(busDay);
    if (bus.stopAt !== null) {
      if (!stopped(st, bus.stopAt)) return;
      const stop = bus.stopping;
      if (!bus.dwellUntil) {
        // Off first, then on: everyone for this stop steps down, everyone waiting climbs in.
        let off = 0;
        for (const r of riders.values()) {
          if (r.vehicle === bus && r.trip.bus && r.trip.bus.to === stop) { startWalk2(r, tripMinute(r.trip, abs) + (off++) * boardEach); bus.passengers.delete(r.trip.key); }
        }
        bus.dwellUntil = minute + dwell + off * boardEach;
      }
      if (!bus.retiring) {
        for (const r of waitingAt(stop, route, boarding)) {
          if (bus.passengers.size >= capacity) break;
          r.phase = 'aboard'; r.vehicle = bus; bus.passengers.add(r.trip.key);
          bus.dwellUntil += boardEach;
        }
      }
      if (minute >= bus.dwellUntil && !leavingFrom(bus) && !(nearlyAt(stop, route) && !bus.retiring && minute < bus.dwellUntil + 1.5)) {
        bus.served = bus.stopAt; bus.stopAt = null; bus.stopping = null; bus.dwellUntil = 0;
      }
      return;
    }
    // The next stop ahead: pull in when someone is getting off or waiting there.
    const lap = Math.floor(st.s / L) * L;
    let next = null, nextS = Infinity;
    for (const stop of route.stops) {
      let s = lap + stop.s;
      if (s <= bus.served + 1) s += L;
      if (s <= bus.served + 1) s += L;
      if (s < st.s - 0.2) s += L;
      if (s < nextS) { nextS = s; next = stop; }
    }
    if (!next || nextS - st.s > 40) return;
    let getsOff = false;
    for (const r of riders.values()) if (r.vehicle === bus && r.trip.bus && r.trip.bus.to === next) { getsOff = true; break; }
    const getsOn = !bus.retiring && bus.passengers.size < capacity && (waitingAt(next, route, boarding).length > 0 || nearlyAt(next, route));
    if (getsOff || getsOn) { bus.stopAt = nextS; bus.stopping = next; }
    else if (st.s > nextS + 0.5) bus.served = nextS;
  }

  // The buses' and taxis' inputs for the physics, appended to `out`.
  function vehicleInputs(abs, out) {
    const minute = abs - dayStart(busDay || 1);
    for (const bus of buses.values()) {
      let target = bus.depot + (bus.run.phase || 0) + (minute - bus.run.start) * busTimetable;
      if (bus.retiring && bus.home) target = bus.home;
      if (bus.stopAt !== null) target = Math.min(target, bus.stopAt);
      else if (bus.served > target) target = bus.served;
      const input = bus.input || (bus.input = { id: bus.agentId, group: 'transit', kind: 'veh', path: bus.route.path, target: 0, start: bus.start,
        walkFree: busCruise, rideFree: busCruise, hl: BUS_SIZE.hl, hw: BUS_SIZE.hw, cls: 'bus', ref: bus });
      input.target = Math.max(target, bus.start);
      out.push(input);
    }
    for (const taxi of taxis.values()) {
      if (!taxi.leg) continue;
      let input = taxi.input;
      if (!input || input.id !== taxi.agentId) input = taxi.input = { id: taxi.agentId, group: 'transit', kind: 'veh', path: taxi.leg, target: taxi.leg.total,
        walkFree: taxiCruise, rideFree: taxiCruise, hl: TAXI_SIZE.hl, hw: TAXI_SIZE.hw, cls: 'taxi', carryOn: taxi.onRoad, ref: taxi };
      out.push(input);
    }
    return out;
  }

  function afterStep(abs) {
    fresh = false;
    for (const r of riders.values()) {
      const st = traffic.agents.get(r.agentId), m = tripMinute(r.trip, abs);
      if (r.phase === 'walk1' && st && st.s >= r.walk1.total - 0.05) r.phase = 'wait';
      if (r.phase === 'walk2' && st) r.leaving = null;
      // At the door: in after the pause there, or straight away with others waiting behind.
      if (r.phase === 'walk2' && st && st.s >= r.walk2.total - 0.02 && (m >= r.t2 + r.walk2.total / WALK + (r.trip.pauseIn || 0) || st.queued)) r.phase = 'done';
    }
    for (const bus of buses.values()) busStep(bus, abs);
    for (const taxi of taxis.values()) taxiStep(taxi, abs);
    dispatch(abs);
  }
  // Forget riders whose trip is over and long gone.
  function prune(keep) { for (const [key, r] of riders) if (r.phase === 'done' && !keep(r.trip)) riders.delete(key); }

  // ---------------------------------------------------------------- looking
  const BUS_SUB = v => (v.retiring ? '回轉運站' : v.stopAt !== null ? '靠站中' : '行駛中');
  const TAXI_SUB = { toPickup: '前往載客', atPickup: '等乘客上車', toDropoff: '載客中', dropping: '乘客下車', toRank: '回轉運站', rank: '排班中' };
  function describe(v) {
    const st = agentOf(v);
    if (!st) return null;
    const people = [];
    for (const r of riders.values()) if (r.vehicle === v || r.leaving === v) people.push(r.trip.resident.id);
    return { id: v.id, kind: v.kind, label: v.kind === 'bus' ? '公車・' + v.route.name : '計程車',
      sub: v.kind === 'bus' ? BUS_SUB(v) : TAXI_SUB[v.state] || '', x: st.x, z: st.z, heading: Math.atan2(st.uz, st.ux),
      driver: v.driver, passengers: people, agent: st, line: v.kind === 'bus' ? v.route.line || v.route.id : null };
  }
  function each(fn) {
    for (const bus of buses.values()) { const st = agentOf(bus); if (st) fn(bus, st); }
    for (const taxi of taxis.values()) { const st = agentOf(taxi); if (st) fn(taxi, st); }
  }
  function vehicleById(id) {
    for (const bus of buses.values()) if (bus.id === id) return describe(bus);
    for (const taxi of taxis.values()) if (taxi.id === id) return describe(taxi);
    return null;
  }
  function vehicleOfDriver(id) {
    for (const bus of buses.values()) if (bus.driver === id && agentOf(bus)) return bus;
    const taxi = taxis.get(id);
    return taxi && agentOf(taxi) ? taxi : null;
  }
  const riderState = key => { const r = riders.get(key); return r ? r.phase : null; };

  return {
    begin, passenger, vehicleInputs, afterStep, reset, prune, each, describe, vehicleById, vehicleOfDriver, riderState,
    rider: key => riders.get(key) || null, buses, taxis, riders, calls,
    info: () => ({ buses: buses.size, taxis: taxis.size, taxisOut: [...taxis.values()].filter(t => t.leg).length, riders: riders.size, calls: calls.length })
  };
}
