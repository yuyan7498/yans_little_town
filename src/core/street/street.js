// The live street (docs/CONTRACTS.md §6 Runtime): everyone who is out right now, moved
// through the street physics together with the buses, taxis and service vehicles, and
// everyone sitting at the night market or on a bench. Each frame `step(daySeconds)`;
// then `walkers()` and `vehicles()` say what to draw. The lists and the objects in them
// are reused from frame to frame: read them, do not keep them.

import { SECONDS_PER_MINUTE, MINUTES_PER_DAY } from '../clock.js';
import { hash, unit } from '../random.js';
import { createTraffic } from './traffic.js';
import { createTransit, dutyOf } from './transit.js';
import { createService } from './service.js';
import { tripInput, ownsVehicle, partyRows, ABREAST, BEHIND, IN_FILE, WALK_SPEED } from './sim-schedule.js';
import { createSeating, assignStalls, behindCounter } from './sim-seats.js';
import { runAudit } from './sim-audit.js';
import { runStuck } from './sim-stuck.js';

const PREROLL = 12, PREROLL_STEP = 0.3;   // town minutes run before a jump in time lands, so queues form
const FRAME_SPLIT = 0.5;                  // a frame longer than this (town minutes) is taken in pieces
const RESET_QUIET = 30;                   // frames: a reset this soon after another (the clock dragged) skips the preroll
const MAX_LATE = 40;                      // still out this long after the plan's end: lifted off the street
const EARLY = 1;
const TURN_EASE = 0.07, STILL_AFTER = 0.25;   // real seconds: heading smoothing, still before the standing pose
const STRIDE = 2.6, PEDAL = 4.4;          // units per gait cycle on foot, per crank turn on a bicycle
const TAU = Math.PI * 2;
const IN_A_CAR = new Set(['car', 'family', 'taxi', 'bus']);

// Paint, by kind: residents' own vehicles take one by a hash of their owner.
const PAINT = {
  car: [0xf2f2ee, 0xc8ccd0, 0x2b2f36, 0xb3262e, 0x2f5d9e, 0x6f7d86, 0xe0d6c2, 0x3f6b4f, 0x8a1f3d, 0xd98a2b],
  scooter: [0xe8e4dc, 0x33373d, 0xc0392b, 0x2e86c1, 0x7fb3a0, 0xf2c14e, 0x9b59b6, 0x95a5a6],
  bicycle: [0x2c3e50, 0xc0392b, 0x16a085, 0xf39c12, 0x8e44ad, 0xecf0f1, 0x27ae60],
  bus: [0x2a9d8f, 0xe76f51, 0x457b9d, 0xf4a261, 0x6a994e],
  taxi: [0xf2c230], police: [0xf5f7fa], van: [0xe9e4d8]
};
const VEHICLE_NAME = { scooter: '機車', bicycle: '腳踏車', car: '汽車' };
const paint = (kind, key) => { const list = PAINT[kind] || PAINT.car; return list[hash(key + ':paint') % list.length]; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const now = () => (globalThis.performance ? globalThis.performance.now() : Date.now());

export function createStreet(options) {
  const { world, net = null, lines = null, trips, people = null, pace = 3, helicopterAt = null, planeOfCrew = null } = options;
  const crews = (people && people.crews) || new Map();
  const traffic = createTraffic({ world, pace, roomAt: net && typeof net.roomAt === 'function' ? (x, z) => net.roomAt(x, z) : null });
  const transit = lines && lines.runsOf ? createTransit({ net, lines, traffic, pace }) : null;
  const service = createService({ world, net, pace });
  const seating = createSeating();
  const marketSite = world.siteList.find(s => s.place === 'night-market') || null;
  const strays = people && people.residents ? people.residents.filter(r => r.species) : [];

  const inputs = [], inputCache = new Map(), finished = new Map();   // trip key -> its day: in at the door early
  const live = new Map(), liveList = [];          // resident id -> {trip, agentId, aboard, stamp}
  const drawn = new Map(), shown = new Map();      // resident id -> what is drawn; key -> smoothing
  const walkersOut = [], vehiclesOut = [], vehiclePool = [];
  let liveStamp = 0, frame = 0, lastAbs = null, lastSeconds = null, lastResetFrame = -Infinity, today = null, nowAbs = 0, nowSeconds = 0;
  let stepMs = 0, lastStepMs = 0, steps = 0, furniture = [];
  const stats = { prerolls: 0, resets: 0 };

  // ---------------------------------------------------------------- the day's data
  const tripDays = new WeakMap();
  const dayOf = trip => trip.day || tripDays.get(trip) || 1;
  const minuteOf = (trip, abs) => abs - (dayOf(trip) - 1) * MINUTES_PER_DAY;
  const planOf = (d, id) => { const plans = people && people.plansFor ? people.plansFor(d) : null; return plans ? plans.get(id) || null : null; };
  function segmentNow(plan, m) {
    if (!plan) return null;
    if (people && people.segmentAt) { const at = people.segmentAt(plan, m); return at ? at.segment : null; }
    for (const s of plan.segments) if (m >= s.start && m < s.end) return s;
    return null;
  }
  let vendorStalls = null;
  function vendorsOf() {
    if (vendorStalls) return vendorStalls;
    const holders = marketSite && people && people.residents ? people.residents.filter(r => r.work === marketSite.id) : [];
    return (vendorStalls = assignStalls(world.stalls || [], holders));
  }

  function dayData(d) {
    if (today && today.day === d) return today;
    const t = trips.tripsFor(d);
    for (const trip of t.list) if (!trip.day) tripDays.set(trip, d);
    const duty = transit ? (lines.dutyOf ? lines.dutyOf(d) : dutyOf(people, world, d)) : null;
    // The president (or anyone whose plan has them aboard the helicopter today), and the
    // airline crews flying today.
    const flyers = new Map(), crew = new Map();
    if (people && people.plansFor) for (const [id, plan] of people.plansFor(d)) {
      if (plan.segments.some(s => s.activity === 'helicopter')) flyers.set(id, plan);
      if (crews.has(id) && plan.segments.some(s => s.activity === 'flying')) crew.set(id, plan);
    }
    const labels = new Map();
    for (const st of t.stays || []) if (st.spot && st.spot.id) labels.set(st.spot.id, st.spot.label || st.spot.name || null);
    // Forget inputs and riders of trips two days gone.
    for (const [key, input] of inputCache) if (input.ref && dayOf(input.ref) < d - 1) inputCache.delete(key);
    if (transit) transit.prune(trip => dayOf(trip) >= d - 1);
    for (const [key, day] of finished) if (day < d - 1) finished.delete(key);
    // The strays do not take a seat: they rest on the ground near the spot (composeStrays).
    const strayStays = (t.stays || []).filter(st => st.resident && st.resident.species);
    today = { day: d, list: [...t.list], stays: (t.stays || []).filter(st => !(st.resident && st.resident.species)), strayStays, duty, flyers, crew, labels, prev: false };
    return today;
  }
  // The night's trips and sittings from the day before that are still going after midnight.
  function loadPrevious(D) {
    D.prev = true;
    if (D.day <= 1) return;
    const p = trips.tripsFor(D.day - 1);
    for (const trip of p.list) {
      if (!trip.day) tripDays.set(trip, D.day - 1);
      if (Math.max(trip.end || 0, trip.arrive || 0) + MAX_LATE > MINUTES_PER_DAY) D.list.unshift(trip);
    }
    for (const st of p.stays || []) if ((st.end || 0) + 40 > MINUTES_PER_DAY) D.stays.unshift(st);
  }

  // ---------------------------------------------------------------- one physics step
  function mark(trip, agentId, aboard) {
    const id = trip.resident.id;
    let e = live.get(id);
    if (!e) live.set(id, e = { trip: null, agentId: null, aboard: null, stamp: 0 });
    e.trip = trip; e.agentId = agentId; e.aboard = aboard; e.stamp = liveStamp;
    liveList.push(e);
  }
  const isLive = id => { const e = live.get(id); return !!e && e.stamp === liveStamp; };

  function consider(trip, abs) {
    if (trip.leader || !trip.resident) return;
    if (isLive(trip.resident.id)) return;            // out already on an earlier trip
    const m = minuteOf(trip, abs);
    if (trip.mode === 'bus' || trip.mode === 'taxi') {
      if (!transit) return;
      const state = transit.riderState(trip.key);
      if (state === 'done') return;
      if (!state && (m < Math.min(trip.start, trip.depart) - EARLY || m >= trip.end + MAX_LATE)) return;
      const ride = transit.passenger(trip, abs);
      if (ride.done || ride.waiting) return;
      mark(trip, ride.input ? ride.input.id : null, ride.aboard);
      if (ride.input) inputs.push(ride.input);
      return;
    }
    if (!trip.path || m < trip.depart || m >= trip.end + MAX_LATE || finished.has(trip.key)) return;
    const agent = traffic.agents.get(trip.key);
    // Reached the door with others queueing behind: in at once (the pause there cut short).
    if (agent && agent.queued && agent.s >= trip.path.total - 0.01) { finished.set(trip.key, dayOf(trip)); return; }
    if (m >= trip.arrive && !(agent && agent.s < trip.path.total - 0.01)) return;
    mark(trip, trip.key, null);
    inputs.push(tripInput(trip, m, pace, inputCache));
  }

  function stepAt(abs, restart) {
    const d = Math.floor(abs / MINUTES_PER_DAY) + 1, D = dayData(d), m = abs - (d - 1) * MINUTES_PER_DAY;
    if (!D.prev && m < 180) loadPrevious(D);
    inputs.length = 0; liveList.length = 0; liveStamp++;
    if (transit) transit.begin(d, abs, restart, D.duty);
    for (let i = 0; i < D.list.length; i++) consider(D.list[i], abs);
    service.inputs(abs, inputs, traffic.agents);
    if (transit) transit.vehicleInputs(abs, inputs);
    traffic.step(abs, inputs);
    if (transit) transit.afterStep(abs);
    service.afterStep(abs, traffic.agents);
    nowAbs = abs;
  }

  // Move everyone to this moment. A jump in time (or the first frame) lands after a
  // dozen town minutes of preroll, so the street has its queues and crowds.
  function step(daySeconds) {
    const t0 = now();
    const abs = daySeconds / SECONDS_PER_MINUTE;
    const dt = lastSeconds === null ? 0 : clamp(daySeconds - lastSeconds, 0, 0.1);
    frame++;
    if (traffic.wouldReset(abs)) {
      stats.resets++;
      finished.clear(); seating.reset();
      if (frame - lastResetFrame > RESET_QUIET) {
        stats.prerolls++;
        stepAt(abs - PREROLL, true);
        for (let t = abs - PREROLL + PREROLL_STEP; t < abs - 0.01; t += PREROLL_STEP) stepAt(t, false);
        stepAt(abs, false);
      } else stepAt(abs, true);
      lastResetFrame = frame;
    } else {
      for (let t = lastAbs + FRAME_SPLIT; t < abs - 1e-6; t += FRAME_SPLIT) stepAt(t, false);
      stepAt(abs, false);
    }
    lastAbs = abs; lastSeconds = daySeconds; nowSeconds = daySeconds;
    compose(dt);
    if (frame % 300 === 0) for (const [key, e] of shown) if (e.seen < frame - 2) shown.delete(key);
    lastStepMs = now() - t0; steps++;
    stepMs += (lastStepMs - stepMs) * (steps < 10 ? 1 / steps : 0.05);
    return street;
  }

  // ---------------------------------------------------------------- drawing
  function turnTo(key, path, heading, dt) {
    let e = shown.get(key);
    if (!e) { shown.set(key, e = { path, h: heading, still: 0, seen: frame }); return heading; }
    e.seen = frame;
    if (path && e.path !== path) { e.path = path; e.h = heading; e.still = 0; return heading; }
    let d = heading - e.h;
    d -= Math.round(d / TAU) * TAU;
    e.h += d * (1 - Math.exp(-dt / TURN_EASE));
    return e.h;
  }
  // A walker takes the standing pose only once still for a moment, not between every two
  // steps of a shuffling queue.
  function keptStill(key, still, dt) {
    const e = shown.get(key);
    if (!e) return false;
    e.still = still ? e.still + dt : 0;
    return e.still >= STILL_AFTER;
  }
  // A walker or cyclist sidestepping on the move turns a little into the step.
  const sidestepTurn = st => clamp(Math.atan2(st.latV || 0, Math.max(st.v, WALK_SPEED)), -0.4, 0.4) * Math.min(1, st.v / WALK_SPEED);

  function entryOf(resident) {
    let e = drawn.get(resident.id);
    if (!e) drawn.set(resident.id, e = { resident, point: { x: 0, y: 0, z: 0, heading: 0, stride: 0, pose: 'stand', riding: null, aboard: null, eat: 0, pet: null },
      trip: null, stay: null, kind: 'street', mode: null, phase: null, vehicle: null, spot: null, dist: 0, lx: 0, lz: 0, stamp: 0 });
    return e;
  }
  // Someone to draw (or, aboard, only to find): their point this frame.
  function person(resident, kind, x, z, heading, pose, extra) {
    const e = entryOf(resident), p = e.point;
    const moved = Math.hypot(x - e.lx, z - e.lz);
    if (e.stamp === frame - 1 && moved < 4) e.dist += moved;
    e.lx = x; e.lz = z; e.stamp = frame; e.kind = kind;
    p.x = x; p.z = z; p.heading = heading; p.pose = pose;
    p.riding = extra.riding || null; p.aboard = extra.aboard || null; p.eat = extra.eat || 0; p.pet = extra.pet || null;
    p.y = extra.y !== undefined ? extra.y : world.heightAt(x, z, pose === 'scooter' || pose === 'pillion' ? 'road' : 'foot');
    p.stride = pose === 'walk' ? (e.dist / STRIDE % 1) * TAU : pose === 'bicycle' ? (e.dist / PEDAL % 1) * TAU : 0;
    e.trip = extra.trip || null; e.stay = extra.stay || null; e.mode = extra.mode || null; e.phase = extra.phase || null;
    e.vehicle = extra.vehicle || null; e.spot = extra.spot || null;
    if (!p.aboard) walkersOut.push(e);
    return e;
  }
  function vehicle(id, kind, x, z, heading, color, layer, extra) {
    let v = vehiclePool[vehiclesOut.length];
    if (!v) v = vehiclePool[vehiclesOut.length] = { id: '', kind: '', x: 0, y: 0, z: 0, heading: 0, color: 0, line: null, owner: null, hazard: false };
    v.id = id; v.kind = kind; v.x = x; v.z = z; v.heading = heading; v.color = color;
    v.y = world.heightAt(x, z, layer); v.line = extra ? extra.line || null : null; v.owner = extra ? extra.owner || null : null; v.hazard = !!(extra && extra.hazard);
    vehiclesOut.push(v);
    return v;
  }
  const ridePhase = { walk1: 'walk', wait: 'wait', aboard: 'aboard', walk2: 'walk' };
  const tmpA = { x: 0, z: 0, heading: 0 }, seatTmp = { x: 0, z: 0, heading: 0, walking: false, distance: 0 };

  // Out with the dog: the owner's plan says dog-walk now (a lead and a dog beside them).
  function onDogWalk(r, trip) {
    if (!trip.loop) return false;
    const d = dayOf(trip), seg = segmentNow(planOf(d, r.id), nowAbs - (d - 1) * MINUTES_PER_DAY);
    return !!seg && seg.activity === 'dog-walk';
  }

  function composeLive(e, dt) {
    const trip = e.trip, leader = trip.resident, n = trip.followers ? trip.followers.length + 1 : 1;
    const riderPhase = trip.mode === 'bus' || trip.mode === 'taxi' ? ridePhase[transit.riderState(trip.key)] || 'walk' : null;
    let x, z, heading, riding = null, aboard = null, standing = false;
    if (e.aboard) {
      const st = traffic.agents.get(e.aboard.agentId);
      if (!st) return;
      x = st.x; z = st.z; heading = turnTo(e.aboard.id, null, Math.atan2(st.uz, st.ux), dt); riding = trip.mode; aboard = e.aboard.id;
    } else {
      const st = traffic.agents.get(e.agentId);
      if (!st) return;                                  // not out of the door yet
      riding = st.kind === 'veh' ? trip.mode : st.cls === 'bicycle' ? 'bicycle' : null;
      let h = Math.atan2(st.uz, st.ux);
      // (A party walking abreast keeps facing the way it goes: a row twisting into every
      // sidestep would swing as a whole.)
      if (st.kind === 'ped' && n === 1) h += sidestepTurn(st);
      heading = turnTo(e.agentId, st.path, h, dt);
      standing = keptStill(e.agentId, st.v < 0.05, dt);
      x = st.x; z = st.z;
      if (riding && IN_A_CAR.has(riding)) aboard = 'own:' + leader.id;
      if (riding) {
        const kind = riding === 'family' ? 'car' : riding;
        vehicle('own:' + leader.id, kind, riding === 'bicycle' ? x + Math.cos(heading) * (n - 1) * IN_FILE / 2 : x,
          riding === 'bicycle' ? z + Math.sin(heading) * (n - 1) * IN_FILE / 2 : z, heading, paint(kind, leader.id), riding === 'bicycle' ? 'foot' : 'road', { owner: leader.id });
      }
    }
    const mode = trip.mode, phase = riderPhase || (riding ? 'ride' : 'walk');
    const c = Math.cos(heading), s = Math.sin(heading);
    const rows = partyRows(n), perRow = Math.ceil(n / rows);
    for (let k = 0; k < n; k++) {
      const r = k === 0 ? leader : trip.followers[k - 1].resident, t = k === 0 ? trip : trip.followers[k - 1];
      if (!r) continue;
      let px = x, pz = z, pose, ride = riding, inside = aboard;
      if (aboard) pose = 'stand';
      else if (riding === 'scooter') { pose = k === 0 ? 'scooter' : 'pillion'; if (k > 1) inside = 'own:' + leader.id; ride = k === 0 ? 'scooter' : 'pillion'; }
      else if (riding === 'bicycle') {
        // In file, the leader in front.
        const ahead = ((n - 1) / 2 - k) * IN_FILE;
        px = x + c * ahead; pz = z + s * ahead; pose = 'bicycle';
        if (k > 0) vehicle('own:' + r.id, 'bicycle', px, pz, heading, paint('bicycle', r.id), 'foot', { owner: r.id });
      } else {
        // Abreast, two by two when there are four.
        const col = k % perRow, lat = (col - (perRow - 1) / 2) * ABREAST, back = (Math.floor(k / perRow) - (rows - 1) / 2) * BEHIND;
        if (n > 1) { px = x - s * lat - c * back; pz = z + c * lat - s * back; }
        pose = standing ? 'stand' : 'walk';
      }
      const vehicleId = aboard || (riding === 'bicycle' ? 'own:' + r.id : riding ? 'own:' + leader.id : null);
      person(r, 'street', px, pz, heading, pose, { riding: ride, aboard: inside, trip: t, mode, phase, vehicle: vehicleId, pet: !ride && r.dog && onDogWalk(r, t) ? 'dog' : null });
    }
  }

  function composeSeated(abs) {
    const D = today;
    if (!D) return;
    const arrived = (trip, m) => {
      const key = (trip.leader || trip).key;
      return m >= trip.arrive || finished.has(key) || (!!transit && transit.riderState(key) === 'done');
    };
    seating.update(D.stays, abs, trip => minuteOf(trip, abs), isLive, arrived, (held, m, outMinute) => {
      const p = seating.seatPoint(held, m, outMinute, seatTmp), spot = held.spot, seat = held.seat;
      const atStall = !!spot.booth;
      let pose = 'walk', y;
      if (!p.walking) {
        pose = held.standing || !seat.kind ? 'stand' : seat.kind;
        if (pose !== 'stand') y = world.heightAt(seat.x, seat.z, 'foot') + seat.y;
      }
      const eat = atStall && !p.walking && !held.standing ? eatAt(held.stay.resident.id) : 0;
      person(held.stay.resident, 'seated', p.x, p.z, p.walking ? p.heading : seat.heading, pose,
        { y, eat, stay: held.stay, spot, mode: null, phase: p.walking ? 'walk' : 'seated' });
    });
  }
  // Now and then a hand goes up with a bite (0..1), every few seconds, each to their own beat.
  function eatAt(id) {
    const period = 5 + unit(id + ':eat') * 5, t = (nowSeconds / period + unit(id + ':bite')) % 1;
    return t < 0.18 ? Math.sin(t / 0.18 * Math.PI) : 0;
  }

  // The strays at rest: not on a seat but on the ground by the spot (their nest, a bench, a
  // stall front, a door), lying when asleep or sunning, eating when fed, sitting otherwise.
  const SLEEPY = /sleep|doze|nap|sunbathe|rest|lie/;
  // A stray whose plan has it on the street but whose trip has not set off yet (or has
  // already arrived) waits outdoors where it was (or where it got to), instead of
  // vanishing the way a person indoors would.
  function strayWaiting(d, r, m) {
    const plan = planOf(d, r.id);
    if (!plan) return null;
    const segs = plan.segments;
    let i = segs.findIndex(sg => m >= sg.start && m < sg.end);
    if (i < 0) return null;
    const trip = today ? today.list.find(t => t.resident === r && m >= t.start && m < t.end) : null;
    const back = trip ? m < trip.depart : m < (segs[i].start + segs[i].end) / 2;
    while (segs[i] && segs[i].place === 'street') i += back ? -1 : 1;
    return segs[i] || null;
  }
  function composeStrays(abs) {
    if (!strays.length) return;
    const d = Math.floor(abs / MINUTES_PER_DAY) + 1, m = abs - (d - 1) * MINUTES_PER_DAY;
    for (const r of strays) {
      if (isLive(r.id)) continue;
      let seg = segmentNow(planOf(d, r.id), m);
      if (seg && seg.place === 'street') seg = strayWaiting(d, r, m);
      if (!seg || seg.place === 'street' || !seg.place) continue;
      let spot = null, at = null;
      const stay = today && today.strayStays ? today.strayStays.find(st => st.resident === r && m >= st.start - 1 && m < st.end) : null;
      if (stay && stay.spot) spot = stay.spot;
      else if (typeof seg.place === 'string' && seg.place.includes(':')) spot = net && net.spot ? net.spot(seg.place) : null;
      if (spot && spot.stand && spot.stand.length) at = spot.stand[hash(r.id + ':stand') % spot.stand.length];
      else if (spot) at = { x: spot.x, z: spot.z, heading: spot.heading || 0 };
      else {
        const site = world.site(seg.place);
        const door = site && site.door ? site.door.approach || site.door : null;
        if (!door) continue;
        const a = unit(r.id + ':rest') * TAU, back = 1.2 + unit(r.id + ':back') * 1.2;
        at = { x: door.x + Math.cos(a) * back, z: door.z + Math.sin(a) * back, heading: unit(r.id + ':face') * TAU - Math.PI };
      }
      const act = String(seg.activity || '');
      const pose = seg.state === 'SLEEPING' || SLEEPY.test(act) ? 'lie' : seg.state === 'DINING' || /fed|feed|eat/.test(act) ? 'eat' : 'sit';
      person(r, 'seated', at.x, at.z, at.heading, pose, { spot, stay: stay || null, phase: 'rest', eat: pose === 'eat' ? eatAt(r.id) : 0, y: world.heightAt(at.x, at.z, 'foot') });
    }
  }

  function composeVendors(abs) {
    const d = Math.floor(abs / MINUTES_PER_DAY) + 1, m = abs - (d - 1) * MINUTES_PER_DAY;
    for (const [id, stall] of vendorsOf()) {
      const r = people.byId ? people.byId.get(id) : null;
      if (!r || isLive(id)) continue;
      const e = drawn.get(id);
      if (e && e.stamp === frame) continue;           // seated somewhere already
      const seg = segmentNow(planOf(d, id), m);
      if (!seg || seg.state !== 'AT_WORK' || seg.place !== marketSite.id) continue;
      const at = behindCounter(stall);
      person(r, 'vendor', at.x, at.z, at.heading, 'stand', { spot: stall, phase: 'stall' });
    }
  }

  function compose(dt) {
    walkersOut.length = 0; vehiclesOut.length = 0;
    for (let i = 0; i < liveList.length; i++) composeLive(liveList[i], dt);
    composeSeated(nowAbs);
    composeStrays(nowAbs);
    if (people) composeVendors(nowAbs);
    if (transit) transit.each((v, st) => vehicle(v.id, v.kind, st.x, st.z, turnTo(v.id, null, Math.atan2(st.uz, st.ux), dt),
      v.kind === 'bus' ? paint('bus', v.route.line || v.route.id) : PAINT.taxi[0], 'road', { line: v.kind === 'bus' ? v.route.line || v.route.id : null }));
    for (const v of service.fleet) {
      const st = service.agentOf(v);
      if (st) vehicle(v.id, v.kind, st.x, st.z, turnTo(v.id, null, Math.atan2(st.uz, st.ux), dt), PAINT[v.kind][0], 'road', { hazard: v.hazard });
    }
  }

  // ---------------------------------------------------------------- looking
  function placeName(id) {
    if (!id) return '';
    const site = world.site(id);
    if (site) return site.name;
    const label = today && today.labels.get(id);
    return label || (String(id).startsWith('bench:') ? '長椅' : String(id));
  }
  const current = id => { const e = drawn.get(id); return e && e.stamp === frame ? e : null; };

  function whereIs(id) {
    const e = current(id);
    if (e) {
      const p = e.point;
      if (e.kind === 'street') return { kind: 'street', x: p.x, y: p.y, z: p.z, heading: p.heading, mode: e.mode, phase: e.phase, trip: e.trip, vehicle: e.vehicle, aboard: p.aboard };
      if (e.kind === 'seated') return { kind: 'seated', spot: e.spot && e.spot.id, x: p.x, y: p.y, z: p.z, heading: p.heading, pose: p.pose, stay: e.stay };
      if (e.kind === 'vendor') return { kind: 'seated', spot: e.spot && e.spot.id, x: p.x, y: p.y, z: p.z, heading: p.heading, pose: 'stand', role: 'vendor' };
    }
    if (transit) {
      const v = transit.vehicleOfDriver(id), st = v && traffic.agents.get(v.agentId);
      if (st) return { kind: 'driving', vehicle: v.id, x: st.x, y: world.heightAt(st.x, st.z, 'road'), z: st.z, heading: Math.atan2(st.uz, st.ux) };
    }
    if (helicopterAt && today && today.flyers.has(id)) {
      const m = nowAbs - (today.day - 1) * MINUTES_PER_DAY, seg = segmentNow(today.flyers.get(id), m);
      if (seg && seg.activity === 'helicopter') {
        const h = helicopterAt(world, nowSeconds);
        if (h && h.phase !== 'parked') return { kind: 'aloft', x: h.x, y: h.y, z: h.z, heading: h.heading, phase: h.phase };
      }
    }
    // A crew aboard their plane once it moves off the stand, until it is parked again.
    if (planeOfCrew && today && today.crew.has(id)) {
      const m = nowAbs - (today.day - 1) * MINUTES_PER_DAY, seg = segmentNow(today.crew.get(id), m);
      if (seg && seg.activity === 'flying') {
        const p = planeOfCrew(world, crews.get(id), nowSeconds);
        if (p) return { kind: 'aloft', x: p.x, y: p.y, z: p.z, heading: p.heading, phase: p.phase, plane: p.id, away: p.away };
      }
    }
    return null;
  }

  function vehicleInfo(id) {
    if (!id) return null;
    if (id.startsWith('own:')) {
      const rid = id.slice(4), e = current(rid);
      if (!e || !e.trip || e.kind !== 'street') return null;
      const v = vehiclesOut.find(q => q.id === id);
      if (!v) return null;
      const trip = e.trip, mode = trip.mode === 'bicycle' ? 'bicycle' : trip.mode, family = mode === 'family';
      const name = e.resident.name || e.resident.id;
      const people = [{ id: rid, role: mode === 'bicycle' ? '騎士' : '駕駛' }];
      if (mode !== 'bicycle' && !trip.leader) for (const f of trip.followers || []) people.push({ id: f.resident.id, role: '乘客' });
      return { id, kind: v.kind, label: family ? '家人的車' : name + ' 的' + (VEHICLE_NAME[mode] || '車'),
        sub: trip.loop ? '在附近散步' : '前往 ' + placeName(trip.to), x: v.x, z: v.z, people };
    }
    if (transit) {
      const v = transit.vehicleById(id);
      if (v) {
        const out = [];
        if (people && people.byId && people.byId.has(v.driver)) out.push({ id: v.driver, role: '司機' });
        for (const key of v.passengers) {
          const r = transit.rider(key) || null, trip = r ? r.trip : null;
          if (!trip) continue;
          out.push({ id: trip.resident.id, role: '乘客' });
          for (const f of trip.followers || []) out.push({ id: f.resident.id, role: '乘客' });
        }
        return { id, kind: v.kind, label: v.label, sub: v.sub, x: v.x, z: v.z, people: out };
      }
    }
    const sv = service.byId.get(id), st = sv && service.agentOf(sv);
    if (st) { const d = service.describe(sv); return { id, kind: sv.kind, label: d.label, sub: d.sub, x: st.x, z: st.z, people: [] }; }
    return null;
  }

  const TAP_RADIUS = { bus: 6.6, car: 4.6, taxi: 4.6, police: 4.6, van: 4.6, scooter: 2.2, bicycle: 2 };
  function tapTargets() {
    const out = [];
    for (const e of walkersOut) {
      const p = e.point, seated = p.pose === 'stool' || p.pose === 'bench' || p.pose === 'chess', animal = !!e.resident.species;
      out.push({ key: 'person:' + e.resident.id, kind: 'person', id: e.resident.id, x: p.x, y: p.y + (animal ? 0.5 : seated ? 0.9 : 2.1), z: p.z, radius: animal ? 0.9 : 1.7 });
    }
    for (const v of vehiclesOut) out.push({ key: 'vehicle:' + v.id, kind: 'vehicle', id: v.id, x: v.x, y: v.y + 1.6, z: v.z, radius: TAP_RADIUS[v.kind] || 3 });
    return out;
  }

  // Bus stops to draw: one per kerb spot (lines share some), the pole a step back from the kerb.
  let stopList = null;
  function stops() {
    if (stopList) return stopList;
    stopList = [];
    for (const stop of (lines && lines.stops) || []) {
      const kerb = stop.kerb || stop, lane = stop.lane || null;
      let x = kerb.x, z = kerb.z;
      if (lane) { const dx = kerb.x - lane.x, dz = kerb.z - lane.z, l = Math.hypot(dx, dz); if (l > 1e-6) { x += dx / l * 1.2; z += dz / l * 1.2; } }
      if (stopList.some(s => Math.hypot(s.x - x, s.z - z) < 3)) continue;
      stopList.push({ id: stop.id, x, z, heading: stop.heading || 0, shelter: !!stop.shelter });
    }
    return stopList;
  }
  // Street furniture walkers step round (planFurniture(world).items), and the stop poles.
  function setObstacles(items) {
    furniture = items || [];
    traffic.setObstacles(furniture.concat(stops().map(s => ({ x: s.x, z: s.z, r: 0.3, kind: 'bus-stop' }))));
  }
  if (options.obstacles) setObstacles(options.obstacles);

  function info() {
    let seated = 0;
    for (const e of walkersOut) if (e.kind === 'seated') seated++;
    return { movers: traffic.agents.size, walkers: walkersOut.length, vehicles: vehiclesOut.length, seated, live: liveList.length,
      ...(transit ? transit.info() : {}), service: service.fleet.length, ...service.info(), slips: traffic.info().slips, stepMs: +stepMs.toFixed(2), lastStepMs: +lastStepMs.toFixed(2), ...stats };
  }

  const street = {
    step, walkers: () => walkersOut, vehicles: () => vehiclesOut, signals: (out = new Map()) => traffic.signalStates(out), stops,
    whereIs, vehicleInfo, tapTargets, info, setObstacles,
    audit: (opts = {}) => runAudit(() => {
      const fresh = createStreet({ ...options, obstacles: null });
      fresh.setObstacles(furniture);
      return fresh._sim;
    }, { day: today ? today.day : 1, minute: nowAbs - ((today ? today.day : 1) - 1) * MINUTES_PER_DAY, ...opts }),
    stuckAudit: (opts = {}) => runStuck(() => {
      const fresh = createStreet({ ...options, obstacles: null });
      fresh.setObstacles(furniture);
      return fresh._sim;
    }, { day: today ? today.day : 1, ...opts }),
    // For tests and the audit: the moving parts.
    _sim: { traffic, transit, service, finished, step, stepAt, live: () => liveList, minuteOf, trips, world, pace,
      sidestepTurn, TURN_EASE, STILL_AFTER, obstacles: () => traffic.obstacles() }
  };
  return street;
}
