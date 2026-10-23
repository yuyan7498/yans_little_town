// Trips: every resident's plan turned into timed trips and stays (docs/CONTRACTS.md §6).
//
// Every run of `street` segments in a plan is one trip from a door to a door, timed so
// the resident reaches the destination door when the plan says they arrive. Short trips
// are walked; middling ones cycled by people who cycle; longer ones go by scooter, car,
// family car, bus or taxi, as the resident usually does. A trip may leave early (never
// before the previous stay ends) and runs late rather than racing. People out together
// form one party whose followers copy the leader's trip.

import { hash } from '../random.js';
import { clamp } from './net-geom.js';
import { dutyFromPlans, driverKind } from './lines.js';
import { vehicleOf } from '../people/ride.js';

// Units per town minute.
export const WALK_SPEED = 1.625, BIKE_SPEED = 5.5;
export const WALK_LIMIT = 110, BIKE_LIMIT = 280;
const RIDE_BASE = { scooter: 9, car: 11, taxi: 11, family: 11 };
export const rideSpeeds = pace => Object.fromEntries(Object.entries(RIDE_BASE).map(([k, v]) => [k, v * pace]));
export const MODE_LABEL = { walk: '走路', bicycle: '騎腳踏車', scooter: '騎機車', car: '開車', taxi: '搭計程車', family: '坐家人的車', bus: '搭公車' };
export const RIDE_LANE = { scooter: 'two', car: 'car', taxi: 'car', family: 'car' };

const MAX_EARLY = 45, BUS_EARLY = 100, MOUNT = 0.4;
const RIDE_BOOST = 1.2;
// Timetables allow for traffic: drives are planned this much slower than the vehicle
// really goes, plus minutes at each junction (longer at lights).
const TRAFFIC_ALLOWANCE = 1.3, JUNCTION_WAIT = 0.6, SIGNAL_WAIT = 2.8, CROSSING_WAIT = 6;
const ROAD_BUCKET = 10, ROAD_BUCKETS = 1440 / ROAD_BUCKET + 1, ROAD_WEIGHT = { scooter: 0.35 };
const CAPACITY = 0.25;
const TOGETHER_GROUPS = new Set(['family', 'friends']);
const STREET = 'street';

const leadRank = r => (r.schedule === 'mayor' ? 2 : 0) + (r.age >= 18 ? 1 : 0);
// Strays trot faster than people walk (town units per town minute).
export const ANIMAL_SPEED = { cat: 2.6, dog: 2.4 };
export const isAnimal = r => r.species === 'cat' || r.species === 'dog';
const cycles = r => r.schedule !== 'president' && !['preschooler', 'student-p', 'patient', 'senior'].includes(r.role);

// How a resident gets about when it is too far to walk (shared with the plans).
export { vehicleOf };

// ------------------------------------------------------------------ slack
// Minutes a walk or cycle allows at the signalled crossings it uses (both zebras
// round one corner go on the same phase).
function crossingSlack(path) {
  let n = 0, last = null;
  for (const c of path.crossings || []) {
    if (!c.signal) continue;
    if (!last || last.id !== c.id || c.s0 - last.s1 > 8) n++;
    last = c;
  }
  return n * CROSSING_WAIT;
}
const junctionSlack = ride => (ride.junctions || []).reduce((s, j) => s + (j.signal ? SIGNAL_WAIT : JUNCTION_WAIT), 0);


export function createTrips({ world, net, lines, people, pace = 1 }) {
  const RIDE = rideSpeeds(pace);
  const capacity = CAPACITY * pace;
  const stalls = world.stalls || [];
  const edges = net.roadGraph.edges;
  const stationId = lines.rank ? lines.rank.site : null;
  const market = world.siteList.find(s => s.id === 'c-night-market') || world.siteList.find(s => s.kind === 'market-night');
  const marketId = market ? market.id : 'c-night-market';
  const drivers = people.residents.map(r => ({ id: r.id, kind: driverKind((people.job(r.id) || {}).title) })).filter(d => d.kind);

  const ledger = new Map();  // kerb spot bookings: slot id -> [[from, to, owner]]
  const dutyCache = new Map(), dayCache = new Map(), loadCache = new Map(), stallOfTrip = new Map();
  const remember = (map, key, value, keep = 3) => { map.set(key, value); if (map.size > keep) map.delete(map.keys().next().value); return value; };
  const plansOf = day => (people.plansFor ? people.plansFor(day) : new Map(people.residents.map(r => [r.id, people.planFor(r.id, day)])));
  const dutyFor = day => dutyCache.get(day) || remember(dutyCache, day, dutyFromPlans(plansOf(day), drivers, stationId));

  // ------------------------------------------------------------------ road load
  const loadOf = day => loadCache.get(day) || remember(loadCache, day, new Float32Array(edges.length * 2 * ROAD_BUCKETS));
  function roadCost(day, minute) {
    const load = loadOf(day), b = clamp(Math.floor(minute / ROAD_BUCKET), 0, ROAD_BUCKETS - 1);
    return (edge, from) => {
      const e = edges[edge], row = (edge * 2 + (from === e.a ? 0 : 1)) * ROAD_BUCKETS;
      const flow = (load[row + b] + 0.5 * ((b > 0 ? load[row + b - 1] : 0) + (b < ROAD_BUCKETS - 1 ? load[row + b + 1] : 0))) / (2 * ROAD_BUCKET);
      const ratio = flow / (capacity * (e.lanes || 1));
      return 1 + 2 * ratio * ratio;
    };
  }
  function addRoadLoad(trip) {
    const list = trip.path && trip.path.roadEdges;
    if (!list || !(trip.t2 > trip.t1)) return;
    const load = loadOf(trip.day), weight = ROAD_WEIGHT[trip.mode] || 1, total = list.reduce((s, e) => s + e.length, 0) || 1;
    let along = 0;
    for (const e of list) {
      const b = clamp(Math.floor((trip.t1 + (trip.t2 - trip.t1) * along / total) / ROAD_BUCKET), 0, ROAD_BUCKETS - 1);
      load[e.key * ROAD_BUCKETS + b] += weight;
      along += e.length;
    }
  }

  // The kerb spots a ride holds, from its timetable: the pick-up from a little before the
  // vehicle is boarded, the drop-off from its arrival.
  function bookOf(trip) {
    const base = (trip.day - 1) * 1440, wait = trip.mode === 'taxi' ? lines.TAXI.expectWait : 0;
    return { ledger, owner: trip.rideKey, taxi: trip.mode === 'taxi',
      pick: [base + trip.t1 - wait - 3, base + trip.t1 + 1.5], drop: [base + trip.t2 - 1, base + trip.t2 + 3.5] };
  }
  // A taxi's waiting spot and the walk off it follow the ride's kerb.
  function seatTaxi(trip, ride, foot) {
    const L = ride.legs;
    trip.path = ride; trip.taxiRide = ride;
    const lane = net.sampleAt(ride, L.driveStart + 0.01), ahead = net.sampleAt(ride, L.driveStart + 1), kerb = net.sampleAt(ride, L.walkEnd);
    trip.walk1 = net.walkBetween(foot.doors[0], waitingSpot(kerb, lane, Math.atan2(ahead.z - lane.z, ahead.x - lane.x), trip.key, 8));
    trip.walk2 = net.subPath(ride, L.walkStart, ride.total);
  }

  // ------------------------------------------------------------------ waiting spots
  const kerbSide = (kerb, lane) => { const ox = kerb.x - lane.x, oz = kerb.z - lane.z, len = Math.hypot(ox, oz) || 1; return { x: ox / len, z: oz / len }; };
  function waitingSpot(kerb, lane, heading, key, spread) {
    const h = hash(key + ':wait'), out = 0.6 + ((h >>> 10) % 100) / 100 * 1.4;
    let along = ((h % 1000) / 1000 - 0.5) * spread - spread * 0.15;
    if (Math.abs(along) < 0.9) along += 1.8;
    const o = kerbSide(kerb, lane);
    return { x: kerb.x + Math.cos(heading) * along + o.x * out, z: kerb.z + Math.sin(heading) * along + o.z * out };
  }
  function alightSpot(kerb, lane, heading, key) {
    const h = hash(key + ':alight');
    let along = ((h % 1000) / 1000 - 0.5) * 9;
    if (Math.abs(along) < 0.9) along = along < 0 ? -0.9 - Math.abs(along) : 0.9 + along;
    const o = kerbSide(kerb, lane);
    return { x: kerb.x + Math.cos(heading) * along + o.x * 0.25, z: kerb.z + Math.sin(heading) * along + o.z * 0.25 };
  }

  // ------------------------------------------------------------------ trips from plans
  function collect(day, plans) {
    const list = [], byResident = new Map();
    for (const r of people.residents) {
      const plan = plans.get(r.id), mine = [];
      byResident.set(r.id, mine);
      if (!plan) continue;
      const segs = plan.segments;
      for (let i = 0; i < segs.length; i++) {
        if (segs[i].place !== STREET || (i > 0 && segs[i - 1].place === STREET)) continue;
        let j = i;
        while (j < segs.length - 1 && segs[j + 1].place === STREET) j++;
        const prev = i > 0 ? segs[i - 1] : null, next = j < segs.length - 1 ? segs[j + 1] : null;
        const trip = {
          key: r.id + ':' + day + ':' + segs[i].start, resident: r, day,
          from: prev ? prev.place : r.home, to: next ? next.place : r.home,
          start: segs[i].start, end: segs[j].end,
          earliest: Math.max(prev ? prev.start + 3 : -Infinity, segs[i].start - MAX_EARLY),
          earliestBus: Math.max(prev ? prev.start + 3 : -Infinity, segs[i].start - BUS_EARLY),
          activity: (segs.slice(i, j + 1).find(g => g.activity === 'dog-walk') || segs[i]).activity, party: segs[i].party || null,
          mode: 'walk', path: null, depart: 0, arrive: 0, speed: WALK_SPEED, rideSpeed: 0, t1: 0, t2: 0,
          pauseOut: 0, pauseIn: 0, lane: 0, loop: false, bus: null, walk1: null, walk2: null, taxiRide: null,
          leader: null, followers: null, timed: false, siblings: mine
        };
        list.push(trip); mine.push(trip);
      }
    }
    return { list, byResident };
  }

  // People leaving the same door for the same place at the same minutes who share a
  // plan `party` or are family or friends go together: the leader (the mayor, else the
  // youngest grown-up) makes the trip and up to three go along.
  function linkCompanions(list) {
    const same = new Map();
    for (const trip of list) {
      const key = trip.from + '>' + trip.to + '@' + trip.start + '-' + trip.end;
      if (!same.has(key)) same.set(key, []);
      same.get(key).push(trip);
    }
    for (const trips of same.values()) {
      if (trips.length < 2) continue;
      const left = trips.slice();
      while (left.length > 1) {
        const group = [left.shift()];
        for (let i = 0; i < group.length && group.length < 4; i++) {
          const kin = new Set(people.relationsOf(group[i].resident.id).filter(l => TOGETHER_GROUPS.has(l.group)).map(l => l.id));
          for (let j = 0; j < left.length && group.length < 4; j++) {
            if ((group[i].party && left[j].party === group[i].party) || kin.has(left[j].resident.id)) group.push(left.splice(j--, 1)[0]);
          }
        }
        if (group.length < 2) continue;
        group.sort((a, b) => leadRank(b.resident) - leadRank(a.resident) || a.resident.age - b.resident.age || (a.key < b.key ? -1 : 1));
        group[0].followers = group.slice(1);
        for (const f of group.slice(1)) f.leader = group[0];
      }
    }
  }

  // ------------------------------------------------------------------ sittings
  function planStays(day, plans, byKey) {
    const stays = [], diners = [];
    for (const r of people.residents) {
      const plan = plans.get(r.id);
      if (!plan) continue;
      const segs = plan.segments;
      segs.forEach((s, k) => {
        const bench = typeof s.place === 'string' && s.place.startsWith('bench:');
        if (k === 0 || segs[k - 1].place !== STREET || !(bench || (s.place === marketId && s.state === 'DINING'))) return;
        let a = k - 1;
        while (a > 0 && segs[a - 1].place === STREET) a--;
        const stay = {
          resident: r, place: s.place, spot: null, state: s.state, activity: s.activity, start: s.start, end: s.end, in: null, out: null,
          party: s.party || r.id,
          inKey: r.id + ':' + day + ':' + segs[a].start,
          outKey: k + 1 < segs.length && segs[k + 1].place === STREET ? r.id + ':' + day + ':' + segs[k + 1].start : null
        };
        if (bench) { stay.spot = net.spot(s.place); if (stay.spot) stays.push(stay); }
        else if (stalls.length) { diners.push(stay); stays.push(stay); }
      });
    }
    // A stall with room for the whole party for the whole supper, on the diner's own bank.
    const booked = stalls.map(() => []), parties = new Map();
    // (People going along with a leader eat where the leader does.)
    for (const d of diners) {
      const trip = byKey.get(d.inKey), lead = trip && (trip.leader || (trip.followers ? trip : null));
      const key = lead ? 'with:' + lead.key : d.party + '@' + Math.round(d.start / 60);
      if (!parties.has(key)) parties.set(key, []);
      parties.get(key).push(d);
    }
    const busy = (i, a, b) => booked[i].reduce((n, iv) => n + (iv[0] < b && iv[1] > a ? iv[2] : 0), 0);
    const bankOf = r => { const d = net.doorOf(r.home, 'stall'); return d && d.x < 0 ? -1 : 1; };
    [...parties.entries()].sort((p, q) => p[1][0].start - q[1][0].start || (p[0] < q[0] ? -1 : 1)).forEach(([key, party]) => {
      const a = Math.min(...party.map(d => d.start)) - 5, b = Math.max(...party.map(d => d.end)) + 20;
      const bank = bankOf(party[0].resident), h = hash(key);
      const order = stalls.map((s, i) => i).sort((i, j) => (stalls[i].bank === bank ? 0 : 1) - (stalls[j].bank === bank ? 0 : 1) ||
        hash(h + ':' + i) - hash(h + ':' + j));
      let choice = order.find(i => busy(i, a, b) + party.length <= stalls[i].seats.length);
      if (choice === undefined) choice = order.reduce((best, i) => busy(i, a, b) - stalls[i].seats.length < busy(best, a, b) - stalls[best].seats.length ? i : best, order[0]);
      booked[choice].push([a, b, party.length]);
      for (const d of party) {
        d.spot = stalls[choice];
        stallOfTrip.set(d.inKey, stalls[choice]);
        if (d.outKey) stallOfTrip.set(d.outKey, stalls[choice]);
      }
    });
    if (stallOfTrip.size > 6000) for (const k of [...stallOfTrip.keys()].slice(0, stallOfTrip.size - 4000)) stallOfTrip.delete(k);
    return stays;
  }
  // A place as the walking network sees it: a stall's front for a night-market diner.
  const placeFor = (place, trip) => {
    if (place === marketId) { const stall = stallOfTrip.get(trip.key); if (stall) return stall.id; }
    return place;
  };

  // ------------------------------------------------------------------ timing
  function arrivedBefore(trip) {
    const prev = trip.siblings && trip.siblings[trip.siblings.indexOf(trip) - 1];
    if (!prev) return -Infinity;
    if (!prev.timed) timeTrip(prev, arrivedBefore(prev));
    return prev.arrive;
  }
  const COPIED = ['mode', 'path', 'speed', 'depart', 'arrive', 'bus', 'taxiRide', 'rideSpeed', 't1', 't2', 'walk1', 'walk2', 'pauseOut', 'pauseIn', 'loop', 'lane'];

  function options(trip, foot, target, pauses, after) {
    return {
      bicycle: () => ({ need: foot.total / BIKE_SPEED + pauses + crossingSlack(foot), apply: () => { trip.mode = 'bicycle'; trip.path = foot; trip.speed = BIKE_SPEED; } }),
      bus: () => {
        const plan = lines.planBus(foot.doors[0], foot.doors[1], dutyFor(trip.day), Math.max(trip.earliestBus, after + 1), target, { out: trip.pauseOut, in: trip.pauseIn });
        return plan && {
          need: 0, apply: () => {
            trip.mode = 'bus'; trip.bus = plan;
            trip.walk1 = net.walkBetween(foot.doors[0], waitingSpot(plan.from.kerb, plan.from.lane, plan.from.heading, trip.key, 18));
            trip.walk2 = net.walkBetween(alightSpot(plan.to.kerb, plan.to.lane, plan.to.heading, trip.key), foot.doors[1]);
            trip.path = trip.walk1;
            trip.depart = plan.board - 1.2 - trip.walk1.total / WALK_SPEED - trip.pauseOut;
            trip.arrive = plan.alight + 0.3 + trip.walk2.total / WALK_SPEED + trip.pauseIn;
          }
        };
      },
      taxi: () => {
        if (!lines.taxiOnDuty(dutyFor(trip.day), target - 20)) return null;
        // Taxi calls share a pick-up point per door and destination, so neighbours can share.
        // (Only when the shared call uses this person's own doors.)
        const shared = 'taxi:' + trip.rFrom + '>' + trip.rTo;
        const same = net.doorOf(trip.rFrom, shared) === foot.doors[0] && net.doorOf(trip.rTo, shared) === foot.doors[1];
        const callKey = same ? shared : trip.rkey;
        const ride = net.ride(trip.rFrom, trip.rTo, callKey, 'car');
        if (!ride) return null;
        const L = ride.legs, footTime = (L.walkEnd + ride.total - L.walkStart) / WALK_SPEED + MOUNT * 2 + pauses;
        return {
          need: footTime + lines.TAXI.expectWait + (L.driveEnd - L.driveStart) / RIDE.taxi, apply: () => { trip.mode = 'taxi'; trip.rideKey = callKey; trip.rideSpeed = RIDE.taxi; trip.rideCost = null; seatTaxi(trip, ride, foot); }
        };
      },
      ride: mode => {
        const free = net.ride(trip.rFrom, trip.rTo, trip.rkey + ':free', RIDE_LANE[mode]);
        let when = target - 6;
        if (free) {
          const F = free.legs;
          when = target - trip.pauseIn - (free.total - F.walkStart) / WALK_SPEED - MOUNT
            - ((F.driveEnd - F.driveStart) * TRAFFIC_ALLOWANCE / RIDE[mode] + junctionSlack(free)) / 2;
        }
        const cost = roadCost(trip.day, when), ride = net.ride(trip.rFrom, trip.rTo, trip.rkey, RIDE_LANE[mode], cost);
        if (!ride) return null;
        const L = ride.legs, footTime = (L.walkEnd + ride.total - L.walkStart) / WALK_SPEED + MOUNT * 2 + pauses;
        const need = footTime + (L.driveEnd - L.driveStart) * TRAFFIC_ALLOWANCE / (RIDE[mode] * RIDE_BOOST) + junctionSlack(ride);
        return { need, apply: () => { trip.mode = mode; trip.path = ride; trip.rideKey = trip.rkey; trip.rideCost = cost; } };
      }
    };
  }

  function timeTrip(trip, after) {
    trip.timed = true;
    if (trip.leader) {
      const lead = trip.leader;
      if (!lead.timed) timeTrip(lead, arrivedBefore(lead));
      for (const k of COPIED) trip[k] = lead[k];
      return;
    }
    const r = trip.resident, h = hash(r.id);
    trip.lane = ((h % 11) - 5) * 0.12;
    trip.rFrom = placeFor(trip.from, trip); trip.rTo = placeFor(trip.to, trip);
    const target = trip.end - ((h >>> 4) % 5) * 0.4;
    let startAfter = after;
    for (const f of trip.followers || []) startAfter = Math.max(startAfter, arrivedBefore(f));
    let earliest = Math.max(trip.earliest, startAfter + 1);
    for (const f of trip.followers || []) earliest = Math.max(earliest, f.earliest);
    trip.loop = trip.from === trip.to;
    const rkey = r.id + '|' + trip.key;
    trip.rkey = rkey;
    const foot = net.route(trip.rFrom, trip.rTo, rkey);
    trip.path = foot; trip.mode = 'walk'; trip.speed = WALK_SPEED; trip.bus = null; trip.taxiRide = null;
    if (!foot) { trip.depart = trip.arrive = target; return; }
    trip.pauseOut = Math.min(0.5, foot.doors[0] ? foot.doors[0].pause : 0);
    trip.pauseIn = foot.doors[1] ? foot.doors[1].pause : 0;
    const pauses = trip.pauseOut + trip.pauseIn;
    if (trip.loop) {
      trip.depart = Math.max(earliest, trip.start); trip.arrive = Math.max(trip.depart + 1 + pauses, target);
      trip.speed = Math.max(0.3, foot.total / Math.max(0.5, trip.arrive - trip.depart - pauses));
      return;
    }
    const d = foot.total, room = target - earliest, party = trip.followers ? trip.followers.length + 1 : 1;
    // Strays always walk, and so does anyone out with a dog.
    const onFoot = isAnimal(r) || trip.activity === 'dog-walk';
    if (!onFoot && (d > WALK_LIMIT || d / WALK_SPEED + pauses > room)) {
      const usual = vehicleOf(r), opts = options(trip, foot, target, pauses, startAfter), order = [];
      const bikeFan = hash(r.id + ':bike') % 100 < 55;
      // A party of cyclists all ride.
      const allCycle = cycles(r) && (trip.followers || []).every(f => cycles(f.resident));
      if (allCycle && d <= BIKE_LIMIT && (usual === 'bicycle' || bikeFan)) order.push('bicycle');
      if (party > 2) order.push(usual === 'bus' || usual === 'taxi' ? usual : 'car', 'bus', 'taxi');
      else if (party > 1) order.push(usual === 'bicycle' || usual === 'family' ? 'scooter' : usual, 'bus');
      if (party === 1 && usual) order.push(usual);
      if (usual === 'bus') order.push(r.role === 'senior' ? 'taxi' : r.role === 'student-p' ? 'family' : allCycle && d <= 420 ? 'bicycle' : 'scooter');
      if (usual === 'taxi') order.push('bus');
      if (usual === 'bicycle' && d > BIKE_LIMIT && r.role !== 'student-m') order.push('scooter');
      if (r.role === 'senior' || r.role === 'student-p') order.push('family');
      let fallback = null, chosen = null;
      for (const mode of order) {
        const option = mode === 'bicycle' || mode === 'bus' || mode === 'taxi' ? opts[mode]() : opts.ride(mode);
        if (!option) continue;
        if (mode === 'bus' || option.need <= room) { chosen = option; break; }
        if (!fallback) fallback = option;
      }
      if (chosen || fallback) (chosen || fallback).apply();
    }
    const path = trip.path;
    if (trip.mode === 'bus') return;
    if (trip.mode === 'walk' || trip.mode === 'bicycle') {
      const animal = isAnimal(r);
      const base = animal ? ANIMAL_SPEED[r.species] : trip.mode === 'walk' ? WALK_SPEED : BIKE_SPEED, lights = animal ? 0 : crossingSlack(path);
      let speed = base;
      if (!animal && path.total / speed + pauses + lights > room) speed = clamp(path.total / Math.max(1, room - pauses - lights), base, base * (trip.mode === 'walk' ? 1.3 : 1.15));
      const need = path.total / speed + pauses + lights;
      trip.depart = Math.max(earliest, target - need); trip.arrive = trip.depart + need; trip.speed = speed;
      return;
    }
    timeDrive(trip, earliest, target, pauses);
    // Now that the ride's times are known it takes its kerb spots for them, and is timed
    // again over the spots it gets.
    const lane = RIDE_LANE[trip.mode], again = net.ride(trip.rFrom, trip.rTo, trip.rideKey, lane, trip.rideCost, bookOf(trip));
    if (again && again.legs) {
      if (trip.mode === 'taxi') seatTaxi(trip, again, foot); else trip.path = again;
      timeDrive(trip, earliest, target, pauses);
    }
    delete trip.rideKey; delete trip.rideCost;
    addRoadLoad(trip);
  }
  // Times a ride over trip.path: when it leaves, boards, gets off and arrives.
  function timeDrive(trip, earliest, target, pauses) {
    const path = trip.path, L = path.legs, footTime = (L.walkEnd + path.total - L.walkStart) / WALK_SPEED + MOUNT * 2 + pauses, drive = L.driveEnd - L.driveStart;
    const wait = trip.mode === 'taxi' ? lines.TAXI.expectWait : 0;
    const base = RIDE[trip.mode] / TRAFFIC_ALLOWANCE, spare = target - earliest - footTime - wait, boost = trip.mode === 'taxi' ? 1 : RIDE_BOOST;
    const slack = junctionSlack(path);
    const speed = drive / base + slack > spare ? clamp(drive / Math.max(0.5, spare - slack), base, base * boost) : base;
    const driveTime = drive / speed + slack, need = footTime + wait + driveTime;
    trip.depart = Math.max(earliest, target - need); trip.arrive = trip.depart + need; trip.rideSpeed = drive / driveTime;
    trip.t1 = trip.depart + trip.pauseOut + L.walkEnd / WALK_SPEED + MOUNT + wait;
    trip.t2 = trip.t1 + driveTime;
  }

  function tripsFor(day) {
    if (dayCache.has(day)) return dayCache.get(day);
    const plans = plansOf(day), { list, byResident } = collect(day, plans);
    linkCompanions(list);
    const byKey = new Map(list.map(t => [t.key, t]));
    const stays = planStays(day, plans, byKey);
    // The day is planned in the order people mean to arrive, so each driver plans round
    // the roads the earlier ones have made busy.
    const order = list.slice().sort((a, b) => a.end - b.end || (a.key < b.key ? -1 : 1));
    for (const trip of order) if (!trip.leader && !trip.timed) timeTrip(trip, arrivedBefore(trip));
    for (const trip of list) if (!trip.timed) timeTrip(trip, arrivedBefore(trip));
    for (const stay of stays) {
      stay.in = byKey.get(stay.inKey) || null;
      stay.out = stay.outKey ? byKey.get(stay.outKey) || null : null;
      delete stay.inKey; delete stay.outKey;
    }
    for (const trip of list) { delete trip.siblings; delete trip.rkey; }
    return remember(dayCache, day, { list, byResident, stays: stays.filter(s => s.in) });
  }

  return { tripsFor, stallOf: tripKey => stallOfTrip.get(tripKey) || null, dutyFor, WALK_SPEED, BIKE_SPEED, RIDE, MODE_LABEL, vehicleOf };
}

// A plan-independent estimate of door-to-door minutes, with the same mode rules and
// speeds as tripsFor but no boosts and a small margin: a trip that leaves at
// `end - minutes` arrives on time in the common case. Places are site ids, spot ids and
// stall ids.
// (Rides allow RIDE_MARGIN more for the kerb spot a vehicle is given along the kerb.)
const MARGIN = 1.5, BUS_WAIT = 4, RIDE_MARGIN = 4;
export function createTravel({ world, net, lines, residents, pace = 1 }) {
  const RIDE = rideSpeeds(pace);
  const byId = new Map(residents.map(r => [r.id, r]));
  const cache = new Map();
  const busDuty = { taxi: [], bus: residents.map(r => ({ id: r.id, shifts: [[0, 1440]] })).slice(0, 24) };
  const footOf = (from, to, rid) => {
    return net.route(from, to, rid + '|travel');
  };
  const pausesOf = foot => Math.min(0.5, foot.doors[0] ? foot.doors[0].pause : 0) + (foot.doors[1] ? foot.doors[1].pause : 0);

  function modeFor(r, d) {
    if (isAnimal(r) || d <= WALK_LIMIT) return 'walk';
    const usual = vehicleOf(r), bikeFan = hash(r.id + ':bike') % 100 < 55;
    if (d <= BIKE_LIMIT && cycles(r) && (usual === 'bicycle' || bikeFan)) return 'bicycle';
    if (usual) return usual;
    return 'walk';
  }
  function rideMinutes(rid, from, to, mode, foot, pauses) {
    if (mode === 'bicycle') return foot.total / BIKE_SPEED + pauses + crossingSlack(foot);
    const ride = net.ride(from, to, rid + '|travel', RIDE_LANE[mode]);
    if (!ride) return null;
    const L = ride.legs, footTime = (L.walkEnd + ride.total - L.walkStart) / WALK_SPEED + MOUNT * 2 + pauses;
    return footTime + (L.driveEnd - L.driveStart) * TRAFFIC_ALLOWANCE / RIDE[mode] + junctionSlack(ride) + (mode === 'taxi' ? lines.TAXI.expectWait : 0);
  }
  function busMinutes(foot) {
    const plan = lines.planBus(foot.doors[0], foot.doors[1], busDuty, 300, 1300);
    return plan ? plan.total + BUS_WAIT + 2 : null;
  }
  // What tripsFor falls back on when there is no bus.
  const fallbackOf = (r, foot) => r.role === 'senior' ? 'taxi' : r.role === 'student-p' ? 'family' : cycles(r) && foot.total <= 420 ? 'bicycle' : 'scooter';
  function estimate(r, from, to) {
    if (from === to) return { mode: 'walk', minutes: 0 };
    const foot = footOf(from, to, r.id);
    if (!foot) return { mode: 'walk', minutes: 0 };
    const pauses = pausesOf(foot);
    if (isAnimal(r)) return { mode: 'walk', minutes: foot.total / ANIMAL_SPEED[r.species] + pauses };
    let mode = modeFor(r, foot.total), minutes = null;
    if (mode === 'walk') minutes = foot.total / WALK_SPEED + pauses + crossingSlack(foot);
    else if (mode === 'bicycle') minutes = foot.total / BIKE_SPEED + pauses + crossingSlack(foot);
    else if (mode === 'bus') {
      // A bus that cannot be caught in time means the fallback, so a bus trip is sized
      // half way to what the fallback would take.
      minutes = busMinutes(foot);
      const other = fallbackOf(r, foot);
      const alt = rideMinutes(r.id, from, to, other, foot, pauses);
      if (minutes !== null && alt !== null && alt > minutes) minutes += (alt - minutes) / 2;
    }
    else minutes = rideMinutes(r.id, from, to, mode, foot, pauses);
    if (minutes === null) {
      // No bus that fits or no way to drive: what tripsFor falls back on.
      mode = mode === 'bus' ? fallbackOf(r, foot)
        : mode === 'taxi' ? 'scooter' : 'walk';
      minutes = mode === 'walk' || mode === 'bicycle' ? foot.total / (mode === 'walk' ? WALK_SPEED : BIKE_SPEED) + pauses + crossingSlack(foot) : rideMinutes(r.id, from, to, mode, foot, pauses);
      if (minutes === null) { mode = 'walk'; minutes = foot.total / WALK_SPEED + pauses + crossingSlack(foot); }
    }
    return { mode, minutes: minutes + MARGIN + (RIDE_LANE[mode] ? RIDE_MARGIN : 0) };
  }
  // The night market's stalls are strung out over the promenades, and which one a diner
  // gets is only settled with their party: size for the median stall.
  const marketId = (world.siteList.find(x => x.id === 'c-night-market') || {}).id;
  const stallIds = (world.stalls || []).map(x => x.id);
  function lookup(id, from, to) {
    const r = byId.get(id);
    if (!r) return { mode: 'walk', minutes: 0 };
    if (marketId && stallIds.length && (from === marketId || to === marketId) && from !== to) {
      const ck = 'market|' + id + '|' + from + '|' + to;
      let hit = cache.get(ck);
      if (!hit) {
        const all = stallIds.map(sid => single(r, from === marketId ? sid : from, to === marketId ? sid : to)).sort((p, q) => p.minutes - q.minutes);
        hit = all[Math.min(all.length - 1, Math.floor(all.length * 0.5))];
        cache.set(ck, hit);
      }
      return hit;
    }
    return single(r, from, to);
  }
  function single(r, from, to) {
    const id = r.id;
    const foot = from === to ? null : footOf(from, to, r.id);
    const klass = foot ? modeFor(r, foot.total) : 'walk';
    const dsig = foot ? foot.doors.map(d => d ? d.x + ',' + d.z : '').join(';') : '';
    const key = from + '|' + to + '|' + klass + '|' + (klass === 'walk' ? '' : vehicleOf(r)) + '|' + dsig;
    let hit = cache.get(key);
    if (!hit) { hit = estimate(r, from, to); cache.set(key, hit); }
    return hit;
  }
  return { minutes: (id, from, to) => lookup(id, from, to).minutes, modeOf: (id, from, to) => lookup(id, from, to).mode };
}
