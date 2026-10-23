import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld } from '../../src/core/world/index.js';
import { town, buildings, residents, relations, occupations } from '../../src/core/data.js';
import { createPeople } from '../../src/core/people/index.js';

const world = buildWorld(town, buildings);
const make = () => createPeople({ world, residents, relations, occupations, buildings, town });
const people = make();
const at = (id, day, minute) => people.segmentAt(people.planFor(id, day), minute).segment;

test('every plan validates for 28 days (midnight seam included)', () => {
  let problems = [];
  for (let d = 1; d <= 28; d++) problems.push(...people.validateDay(d));
  assert.deepEqual(problems.slice(0, 5), []);
});

test('plans are deterministic', () => {
  const other = make();
  for (const day of [1, 6, 7, 15]) assert.deepEqual([...other.plansFor(day)], [...people.plansFor(day)]);
});

test('plans for a day are quick', () => {
  const fresh = make();
  const t0 = performance.now();
  fresh.plansFor(3);
  assert.ok(performance.now() - t0 < 400, 'plansFor(day) took ' + (performance.now() - t0));
});

test('peak occupancy stays within capacity (visited places)', () => {
  const over = new Map();
  for (let d = 1; d <= 14; d++) {
    for (let m = 0; m < 1440; m += 15) {
      const { byPlace } = people.occupancy(d, m);
      for (const [id, e] of Object.entries(byPlace)) {
        const s = world.site(id);
        if (s && s.kind !== 'housing' && e.present.length > s.capacity) over.set(id, Math.max(over.get(id) || 0, e.present.length - s.capacity));
      }
    }
  }
  if (over.size) console.log('over capacity (excess):', Object.fromEntries(over));
  assert.ok(over.size <= 2, 'too many crowded places: ' + [...over.keys()]);
});

test('mayor and fiancee: date suppers Mon/Wed/Fri, same minutes', () => {
  const mayor = people.residents.find(r => r.schedule === 'mayor');
  assert.ok(mayor.date);
  for (const day of [1, 3, 5, 8]) {
    const a = people.planFor(mayor.id, day).segments.find(s => s.activity === 'date');
    const b = people.planFor(mayor.date, day).segments.find(s => s.activity === 'date');
    assert.ok(a && b, 'day ' + day);
    assert.equal(a.start, b.start); assert.equal(a.end, b.end); assert.equal(a.place, b.place); assert.equal(a.party, b.party);
  }
  assert.ok(!people.planFor(mayor.id, 2).segments.some(s => s.activity === 'date'));
  assert.ok(people.planFor(mayor.id, 6).segments.some(s => s.activity === 'walkabout'));
});

test('president is aboard every sortie', () => {
  const pres = people.residents.find(r => r.schedule === 'president');
  for (const [day, key] of [[1, 'weekday'], [6, 'weekend']]) {
    for (const s of town.helicopter.sorties[key]) {
      const mid = s + town.helicopter.takeOff + 20;
      assert.equal(at(pres.id, day, mid).activity, 'helicopter');
    }
  }
});

test('every tower has someone in it at 03:00', () => {
  for (const day of [1, 4, 6]) {
    const { byPlace } = people.occupancy(day, 180);
    for (const id of ['t-one', 't-two', 't-three', 't-four']) assert.ok(byPlace[id] && byPlace[id].present.length > 0, id + ' day ' + day);
  }
});

test('families go out together at weekends', () => {
  const parties = new Map();
  for (const [id, plan] of people.plansFor(6)) for (const s of plan.segments) if (s.party && s.party.startsWith('family:') && s.state !== 'COMMUTE') {
    const k = s.party + s.start; parties.set(k, [...(parties.get(k) || []), id]);
  }
  assert.ok([...parties.values()].filter(v => v.length >= 2).length > 10);
});

test('grandparents wait at the school gate on weekdays', () => {
  const [gp, pupil] = relations.pickUps[0];
  const p = people.planFor(gp, 2).segments.find(s => s.activity === 'pick-up');
  assert.ok(p); assert.equal(p.place, people.byId.get(pupil).work);
  assert.ok(!people.planFor(gp, 6).segments.some(s => s.activity === 'pick-up'));
});

test('gate officers stand at the school gate on school days only', () => {
  let seen = 0;
  for (const o of people.residents.filter(r => r.dutyPost)) for (let d = 1; d <= 7; d++) {
    const gate = people.planFor(o.id, d).segments.some(s => s.activity === 'school-gate' && s.place === o.dutyPost);
    if (d <= 5 && people.week.worksOn(o, d)) { assert.ok(gate, o.id + ' day ' + d); seen++; } else assert.ok(!gate, o.id + ' day ' + d);
  }
  assert.ok(seen > 0);
});

test('bank errands only within opening hours', () => {
  for (let d = 1; d <= 14; d++) for (const [id, plan] of people.plansFor(d)) for (const s of (people.byId.get(id).role === 'stray' ? [] : plan.segments)) {
    if (s.place !== 'c-bank' || s.state === 'AT_WORK') continue;
    assert.ok(s.start >= 480 && s.end <= (d % 7 === 6 ? 840 : 1020), `bank visit ${s.start}-${s.end} on day ${d}`);
    assert.notEqual(d % 7, 0);
  }
});

test('relations carry neutral labels, family first', () => {
  const r = people.relationsOf(people.residents.find(x => x.partner).id);
  assert.ok(r.length && r[0].group === 'family');
});

test('with a travel estimator: plans validate for 28 days and street runs are long enough', () => {
  const pos = id => { const s = world.site(id); return s ? (s.door || s.footprint) : null; };
  const travel = (id, a, b) => {
    const p = pos(a), q = pos(b);
    return a === b || !p || !q ? 0 : 20 + (Math.abs(p.x - q.x) + Math.abs(p.z - q.z)) / 6;
  };
  const timed = createPeople({ world, residents, relations, occupations, buildings, town, travel });
  const t0 = performance.now();
  timed.plansFor(2);
  assert.ok(performance.now() - t0 < 400);
  let problems = [];
  for (let d = 1; d <= 28; d++) problems.push(...timed.validateDay(d));
  assert.deepEqual(problems.slice(0, 5), []);
  // A worker's walk to a fixed start is as long as the estimate (when the day has room).
  const r = timed.residents.find(x => x.kind === 'workshop' && !timed.planFor(x.id, 2).segments.some(s => s.activity === 'drop-off') && timed.week.worksOn(x, 2));
  const plan = timed.planFor(r.id, 2).segments;
  const k = plan.findIndex(s => s.state === 'AT_WORK');
  assert.equal(plan[k - 1].place, 'street');
  assert.ok(plan[k - 1].end - plan[k - 1].start >= Math.min(travel(r.id, r.home, r.work), 90));
});

test('the strays stay out of buildings and are looked after', () => {
  const cat = people.byId.get('stray-cat'), dog = people.byId.get('stray-dog');
  assert.ok(cat && dog);
  // Animals roam: building fronts (site ids) and spots, never counted as inside.
  for (const id of ['stray-cat', 'stray-dog']) {
    const week = new Set();
    for (let d = 1; d <= 7; d++) {
      const stops = new Set(people.planFor(id, d).segments.filter(s => s.place !== 'street' && !s.place.startsWith('nest:')).map(s => s.place));
      assert.ok(stops.size >= 3, id + ' day ' + d + ' stops ' + stops.size);
      stops.forEach(p => week.add(p));
    }
    assert.ok(week.size >= 10, id + ' covered ' + week.size + ' places in a week');
  }
  for (let d = 1; d <= 7; d++) for (let m = 0; m < 1440; m += 30) {
    const { byPlace } = people.occupancy(d, m);
    for (const e of Object.values(byPlace)) assert.ok(!e.present.includes('stray-cat') && !e.present.includes('stray-dog'));
  }
  assert.ok(people.planFor('stray-cat', 2).segments.some(s => s.activity === 'fed' && s.place === 'c-night-market'));
  const carers = people.relationsOf('stray-cat');
  assert.ok(carers.length >= 6 && carers.every(c => c.label === '照顧牠的人'));
  assert.ok(people.relationsOf(carers[0].id).some(c => c.id === 'stray-cat' && c.label === '照顧的毛孩'));
  assert.deepEqual(people.describe.facts('stray-cat').map(f => f[0]), ['身分', '窩']);
});

test('dog owners walk their dogs', () => {
  const owners = people.residents.filter(r => r.dog);
  assert.ok(owners.length >= 12);
  for (const o of owners) {
    let walks = 0;
    for (let d = 1; d <= 7; d++) walks += people.planFor(o.id, d).segments.filter(s => s.activity === 'dog-walk').length;
    assert.ok(walks >= 2, o.id + ' walked ' + walks);
  }
  assert.ok(people.describe.facts(owners[0].id).some(f => f[0] === '養狗'));
});

test('preschoolers go to the kindergarten with a grown-up, on school days only', () => {
  let together = 0, days = 0;
  for (const k of people.residents.filter(r => r.kind === 'preschool')) {
    const segs = people.planFor(k.id, 2).segments, ks = segs.find(s => s.activity === 'kindergarten');
    if (!ks) continue;
    days++;
    assert.equal(ks.place, 'c-primary');
    const walk = segs.find(s => s.party && s.party.startsWith('kinder:'));
    const others = people.residents.filter(a => a.id !== k.id && a.kind !== 'preschool');
    if (walk && others.some(a => people.planFor(a.id, 2).segments.some(s => s.party === walk.party && s.start === walk.start && s.end === walk.end))) together++;
    assert.ok(!people.planFor(k.id, 6).segments.some(s => s.activity === 'kindergarten'));
  }
  assert.ok(days > 25 && together === days, `${together}/${days}`);
});
