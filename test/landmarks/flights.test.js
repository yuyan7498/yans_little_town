import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as data from '../../src/core/data.js';
import { buildWorld } from '../../src/core/world/index.js';
import { airportOf, flightsOn, dutiesOn, crewRoster, planesAt, planeOfCrew, PLANE } from '../../src/core/world/flights.js';
import { createPeople } from '../../src/core/people/index.js';
import { SECONDS_PER_MINUTE } from '../../src/core/clock.js';

const world = buildWorld(data.town, data.buildings);
const at = (day, minute) => ((day - 1) * 1440 + minute) * SECONDS_PER_MINUTE;
const inside = (r, x, z, pad = 0) => x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;

test('the airport lays out inside its plot: runway at the back, terminal at the front', () => {
  const A = airportOf(world), area = A.site.area;
  for (const key of ['runway', 'taxiway', 'apron', 'terminal', 'tower', 'hangar', 'carpark']) {
    const r = A.world[key];
    assert.ok(r.x0 >= area.x0 - 1e-6 && r.x1 <= area.x1 + 1e-6 && r.z0 >= area.z0 - 1e-6 && r.z1 <= area.z1 + 1e-6, key);
  }
  // Faces east: the runway is west of the terminal, and long enough for the plane.
  assert.ok(A.world.runway.x < A.world.terminal.x);
  assert.ok(A.world.runway.d > 5 * PLANE.length);
  assert.equal(A.planes.length, data.town.airport.planes.length);
});

test('between trips every plane stands still at its own stand', () => {
  const A = airportOf(world);
  const planes = planesAt(world, at(1, 300));
  planes.forEach((p, i) => {
    assert.equal(p.phase, 'parked');
    assert.ok(Math.hypot(p.x - A.stands[i].x, p.z - A.stands[i].z) < 1e-6);
    assert.equal(p.spin, 0);
  });
});

test('a trip runs its phases in order, rolls on the runway, leaves town and comes back', () => {
  const A = airportOf(world), f = flightsOn(world, 1)[0], order = [];
  let left = false, airborneMax = 0;
  for (let m = f.start - 1; m <= f.end + 1; m += 0.25) {
    const p = planesAt(world, at(1, m))[f.planeIndex];
    if (order[order.length - 1] !== p.phase) order.push(p.phase);
    if (p.phase === 'take-off' || p.phase === 'landing') assert.ok(inside(A.world.runway, p.x, p.z, 0.5), p.phase + ' off the runway');
    if (p.phase === 'taxi-out' || p.phase === 'taxi-in' || p.phase === 'pushback') assert.ok(inside(A.site.area, p.x, p.z, 1), p.phase + ' off the plot');
    if (p.away) left = true;
    airborneMax = Math.max(airborneMax, p.y);
  }
  const seq = order.filter((ph, i) => ph !== 'cruise' || order[i - 1] !== 'cruise');
  for (const ph of ['parked', 'start-up', 'pushback', 'taxi-out', 'line-up', 'take-off', 'climb', 'approach', 'landing', 'taxi-in', 'shutdown']) assert.ok(seq.includes(ph), ph);
  assert.ok(seq.indexOf('take-off') < seq.indexOf('climb') && seq.indexOf('approach') < seq.indexOf('landing') && seq.indexOf('landing') < seq.indexOf('taxi-in'));
  assert.ok(left, 'the plane flies out past the board');
  assert.ok(airborneMax > 100);
  assert.equal(planesAt(world, at(1, f.end + 2))[f.planeIndex].phase, 'parked');
});

test('a plane fades out gradually far past the board and fades back in on the way home', () => {
  const f = flightsOn(world, 1)[0];
  let prev = 1, out = null, back = null, gone = 0;
  for (let m = f.lift; m <= f.touch; m += 0.05) {
    const p = planesAt(world, at(1, m))[f.planeIndex];
    assert.ok(p.fade >= 0 && p.fade <= 1);
    assert.ok(Math.abs(p.fade - prev) < 0.02, `no sudden jump at minute ${m.toFixed(2)}`);
    assert.equal(p.away, p.fade <= 0);
    if (p.fade < 1 && out === null) out = m;
    if (p.away) { gone++; back = null; } else if (gone && back === null && p.fade >= 1) back = m;
    prev = p.fade;
  }
  assert.ok(gone > 0 && out !== null && back !== null);
  // Seen at full strength over the town (the board plus a margin).
  for (const m of [f.lift + 1, f.touch - 1]) assert.equal(planesAt(world, at(1, m))[f.planeIndex].fade, 1);
  // The fade takes a while: several real seconds at normal speed.
  const firstGone = (() => { for (let m = out; ; m += 0.05) if (planesAt(world, at(1, m))[f.planeIndex].away) return m; })();
  assert.ok((firstGone - out) * SECONDS_PER_MINUTE > 5);
});

test('the same moment always gives the same pose', () => {
  const a = planesAt(world, at(3, 427.3)), b = planesAt(world, at(3, 427.3));
  assert.deepEqual(a, b);
});

test('every trip is in one duty, and the crews take the duties in turn', () => {
  const crews = data.town.airport.crews, seen = new Map();
  for (let day = 1; day <= 3; day++) {
    const duties = dutiesOn(world, day), flights = flightsOn(world, day);
    assert.deepEqual(duties.flatMap(d => d.flights.map(f => f.id)).sort(), flights.map(f => f.id).sort());
    assert.equal(new Set(duties.map(d => d.crew)).size, duties.length, 'no crew flies two duties a day');
    for (const d of duties) seen.set(d.crew, (seen.get(d.crew) || 0) + 1);
  }
  assert.equal(seen.size, crews);
  for (const n of seen.values()) assert.equal(n, 2);
});

test('the crews are the aircrew residents, three to a crew, aboard while the plane moves', () => {
  const people = createPeople({ world, residents: data.residents, relations: data.relations, occupations: data.occupations, buildings: data.buildings, town: data.town });
  const roster = crewRoster(people.residents);
  assert.equal(roster.size, data.town.airport.crews * 3);
  const duty = dutiesOn(world, 1)[0], f = duty.flights[0], member = [...roster].find(([, c]) => c === duty.crew)[0];
  const plan = people.planFor(member, 1);
  // Aboard for each trip of the duty, from boarding until they leave the parked plane (a
  // short turnaround between two trips joins them into one stretch).
  const flying = plan.segments.filter(s => s.activity === 'flying');
  for (const s of flying) assert.equal(s.place, data.town.airport.site);
  for (const t of duty.flights) assert.ok(flying.some(s => s.start <= t.board + 1 && s.end >= t.leave - 1), t.code);
  const p = planeOfCrew(world, duty.crew, at(1, (f.lift + f.touch) / 2));
  assert.equal(p.id, duty.plane);
  assert.equal(planeOfCrew(world, duty.crew, at(1, f.start - 30)), null);
  // A crew without a duty that day has none of it.
  const off = [...new Set(roster.values())].find(c => !dutiesOn(world, 1).some(d => d.crew === c));
  const rester = [...roster].find(([, c]) => c === off)[0];
  assert.ok(!people.planFor(rester, 1).segments.some(s => s.activity === 'flying'));
});
