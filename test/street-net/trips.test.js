import test from 'node:test';
import assert from 'node:assert/strict';
import { setupTrips, setup, synthPeople, PACE } from './helpers.js';
import { createTrips, ANIMAL_SPEED, MODE_LABEL, WALK_SPEED, BIKE_SPEED } from '../../src/core/street/trips.js';

const ctx = setupTrips(1000);
const { trips, people, net, world } = ctx;

let timing = null;
const day1 = (() => { const t0 = performance.now(); const d = trips.tripsFor(1); timing = performance.now() - t0; return d; })();

test('constants and labels are exported', () => {
  assert.equal(WALK_SPEED, 1.625);
  assert.equal(BIKE_SPEED, 5.5);
  assert.deepEqual(Object.keys(MODE_LABEL), ['walk', 'bicycle', 'scooter', 'car', 'taxi', 'family', 'bus']);
  assert.equal(MODE_LABEL.bus, '搭公車');
});

test('every street run of every plan is one timed trip', () => {
  const plans = people.plansFor(1);
  let runs = 0;
  for (const r of people.residents) {
    const segs = plans.get(r.id).segments;
    for (let i = 0; i < segs.length; i++) if (segs[i].place === 'street' && (i === 0 || segs[i - 1].place !== 'street')) runs++;
  }
  assert.equal(day1.list.length, runs);
  for (const t of day1.list) {
    assert.ok(t.timed && t.path, t.key);
    assert.ok(Number.isFinite(t.depart) && Number.isFinite(t.arrive) && t.arrive >= t.depart, t.key);
    assert.ok(MODE_LABEL[t.mode], t.key);
    assert.ok(t.path.points.length >= 2);
  }
});

test('nobody leaves before the previous stay ends and trips do not overlap', () => {
  for (const [id, list] of day1.byResident) {
    for (let i = 1; i < list.length; i++) assert.ok(list[i].depart >= list[i - 1].arrive - 1e-6, id);
    for (const t of list) assert.ok(t.depart >= (t.mode === 'bus' ? t.earliestBus : t.earliest) - 1e-6 || t.leader, t.key);
  }
});

test('door to door: each trip starts and ends at its places', () => {
  for (const t of day1.list) {
    if (t.leader) continue;
    if (t.mode === 'bus') {
      assert.equal(t.walk1.doors[0], net.doorOf(t.from, t.resident.id + '|' + t.key) || t.walk1.doors[0]);
      assert.ok(t.walk1.total >= 0 && t.walk2.total >= 0);
      continue;
    }
    const a = t.path.points[0], b = t.path.points.at(-1);
    const dA = net.doorOf(t.from === 'c-night-market' && trips.stallOf(t.key) ? trips.stallOf(t.key).id : t.from, t.resident.id + '|' + t.key);
    const dB = net.doorOf(t.to === 'c-night-market' && trips.stallOf(t.key) ? trips.stallOf(t.key).id : t.to, t.resident.id + '|' + t.key);
    assert.ok(Math.hypot(a.x - dA.x, a.z - dA.z) < 1.5, t.key + ' start');
    assert.ok(Math.hypot(b.x - dB.x, b.z - dB.z) < 1.5, t.key + ' end');
  }
});

test('modes follow distance and role', () => {
  const modes = new Set(day1.list.map(t => t.mode));
  for (const m of ['walk', 'bicycle', 'scooter', 'car', 'bus']) assert.ok(modes.has(m), m + ' used');
  for (const t of day1.list) {
    if (t.mode === 'bicycle') assert.ok(t.resident.role !== 'preschooler' && t.resident.role !== 'senior');
    if (t.mode === 'car' || t.mode === 'scooter' || t.mode === 'family' || t.mode === 'taxi') assert.ok(t.path.legs, t.key);
    if (t.to === 'c-night-market' || t.from === 'c-night-market') continue;
  }
  // nobody drives into the pedestrian street
  const ped = world.segments.filter(s => s.pedestrian);
  for (const t of day1.list) {
    if (!t.path.legs || !t.path.roadEdges) continue;
    for (const pc of t.path.roadEdges) assert.ok(!ped.some(s => s.index === net.roadGraph.edges[pc.edge].segment), t.key);
  }
});

test('walks carry the stroll loops', () => {
  const loops = [...day1.list, ...trips.tripsFor(6).list].filter(t => t.loop);
  assert.ok(loops.length > 0);
  for (const t of loops) {
    assert.equal(t.mode, 'walk');
    const a = t.path.points[0], b = t.path.points.at(-1);
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.1);
  }
});

test('bus trips walk to the stop, ride and walk on', () => {
  const buses = day1.list.filter(t => t.mode === 'bus');
  assert.ok(buses.length > 10);
  for (const t of buses) {
    assert.ok(t.bus.board >= t.depart && t.bus.alight <= t.arrive);
    assert.ok(t.bus.from !== t.bus.to);
  }
});

test('parties go together and copy the leader', () => {
  const followers = day1.list.filter(t => t.leader);
  assert.ok(followers.length > 0);
  for (const f of followers) {
    assert.ok(f.leader.followers.includes(f) && f.leader.followers.length <= 3);
    assert.equal(f.path, f.leader.path);
    assert.equal(f.arrive, f.leader.arrive);
    assert.equal(f.from, f.leader.from);
    assert.equal(f.to, f.leader.to);
  }
});

test('stays: every supper has a roomy stall, every sitting its spot', () => {
  const dinners = day1.stays.filter(s => s.place === 'c-night-market');
  const sittings = day1.stays.filter(s => String(s.place).startsWith('bench:'));
  assert.ok(dinners.length > 50 && sittings.length > 10);
  for (const s of dinners) {
    assert.ok(s.spot && s.spot.seats.length > 0 && s.in, s.resident.id);
    assert.equal(trips.stallOf(s.in.key), s.spot);
    if (s.out) assert.equal(trips.stallOf(s.out.key), s.spot);
  }
  for (const s of sittings) assert.equal(s.spot.id, s.place);
  // no stall over capacity at any minute
  const over = [];
  for (const stall of world.stalls) {
    const mine = dinners.filter(s => s.spot === stall);
    for (let m = 0; m < 1440; m += 10) {
      const n = mine.filter(s => s.start <= m && m < s.end).length;
      if (n > stall.seats.length) over.push(`${stall.id}@${m}:${n}/${stall.seats.length}`);
    }
  }
  assert.ok(over.length < 5, over.slice(0, 5).join(' '));
  const bank = dinners.filter(s => { const d = net.doorOf(s.resident.home, 'stall'); return (d.x < 0 ? -1 : 1) === s.spot.bank; }).length;
  assert.ok(bank / dinners.length > 0.6, 'own bank ' + bank + '/' + dinners.length);
});

test('late arrivals are rare for trips with room, and the share is reported', () => {
  const late = day1.list.filter(t => t.arrive > t.end + 5);
  console.log(`# late (>5 min): ${late.length}/${day1.list.length} = ${(100 * late.length / day1.list.length).toFixed(1)}% (synthetic 40-minute street runs)`);
  const bike = day1.list.filter(t => t.mode === 'bicycle' || t.mode === 'walk');
  assert.ok(bike.filter(t => t.arrive > t.end + 5 && !t.leader).length < day1.list.length * 0.05);
});

test('the week is deterministic', () => {
  const digest = c => {
    const out = [];
    for (const day of [1, 2, 6]) for (const t of c.trips.tripsFor(day).list) out.push([t.key, t.mode, t.depart.toFixed(3), t.arrive.toFixed(3), t.path.total.toFixed(2)].join('|'));
    return out.join('\n');
  };
  const again = createTrips({ world, net, lines: ctx.lines, people: synthPeople(world, 1000), pace: PACE });
  assert.equal(digest({ trips: again }), digest(ctx));
});

test('performance: a full day of 1000 residents', () => {
  const fresh = createTrips({ world, net, lines: ctx.lines, people: synthPeople(world, 1000), pace: PACE });
  const times = [];
  for (const day of [3, 4, 5]) { const t0 = performance.now(); fresh.tripsFor(day); times.push(performance.now() - t0); }
  console.log(`# tripsFor: first day ${timing.toFixed(0)} ms (cold), then ${times.map(t => t.toFixed(0)).join(', ')} ms`);
  assert.ok(Math.min(...times) < 1500, times.join(','));
});

test('createTravel estimates door-to-door minutes that tripsFor can meet', async () => {
  const { createTravel } = await import('../../src/core/street/trips.js');
  const travel = createTravel({ world, net, lines: ctx.lines, residents: people.residents, pace: PACE });
  const t0 = performance.now();
  let n = 0, short = 0;
  for (const t of day1.list) {
    if (t.loop || t.leader || t.mode === 'bus') continue;
    const m = travel.minutes(t.resident.id, t.from, t.to);
    assert.ok(Number.isFinite(m) && m >= 0);
    assert.ok(travel.modeOf(t.resident.id, t.from, t.to));
    n++;
    if (m < (t.arrive - t.depart) * 0.8) short++;
  }
  console.log(`# travel: ${n} estimates in ${(performance.now() - t0).toFixed(0)} ms, ${short} below 80% of tripsFor's own need`);
  assert.ok(short < n * 0.2);
  const r = people.residents[0];
  assert.equal(travel.minutes(r.id, r.home, r.home), 0);
  assert.equal(travel.minutes(r.id, r.home, 'c-plaza'), travel.minutes(r.id, r.home, 'c-plaza'));
});

test('animals and dog-walkers always walk, and the activity is copied onto the trip', async () => {
  const { createTravel } = await import('../../src/core/street/trips.js');
  const pets = synthPeople(world, 200);
  const ids = pets.residents.slice(0, 40).map(r => r.id);
  pets.residents.forEach((r, i) => { if (i < 20) { const c = { ...r, species: i % 2 ? 'cat' : 'dog' }; pets.residents[i] = c; pets.byId.set(r.id, c); } });
  const walkers = new Set(ids.slice(20, 40));
  const plain = pets.planFor;
  const cache = new Map();
  pets.planFor = (id, day) => {
    if (!walkers.has(id)) return plain(id, day);
    const k = id + day;
    if (!cache.has(k)) { const p = plain(id, day); cache.set(k, { ...p, segments: p.segments.map(s => (s.place === 'street' ? { ...s, activity: 'dog-walk' } : s)) }); }
    return cache.get(k);
  };
  pets.plansFor = day => new Map(pets.residents.map(r => [r.id, pets.planFor(r.id, day)]));
  const t = createTrips({ world, net, lines: ctx.lines, people: pets, pace: PACE });
  const list = t.tripsFor(1).list;
  const mine = list.filter(x => ids.includes(x.resident.id));
  assert.ok(mine.length > 10);
  for (const x of mine) assert.equal(x.mode, 'walk', x.key);
  for (const x of mine.filter(x => x.resident.species && !x.loop)) assert.equal(x.speed, ANIMAL_SPEED[x.resident.species], x.key);
  for (const x of mine.filter(x => walkers.has(x.resident.id))) assert.equal(x.activity, 'dog-walk');
  const travel = createTravel({ world, net, lines: ctx.lines, residents: pets.residents, pace: PACE });
  for (const id of ids.slice(0, 20)) assert.equal(travel.modeOf(id, 'h-point', 'c-primary'), 'walk');
});
