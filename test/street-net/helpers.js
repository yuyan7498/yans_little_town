import { town, buildings, transit } from '../../src/core/data.js';
import { buildWorld } from '../../src/core/world/index.js';
import { createNetwork } from '../../src/core/street/network.js';
import { createLines } from '../../src/core/street/lines.js';
import { planFurniture } from '../../src/core/world/furniture.js';

export const PACE = 3;
let cache = null;
export function setup() {
  if (!cache) {
    const world = buildWorld(town, buildings);
    const spots = planFurniture(world).spots;
    const net = createNetwork(world, { spots });
    const lines = createLines(net, world, transit, { pace: PACE });
    cache = { world, net, lines, transit, spots };
  }
  return cache;
}

import { residents, relations, occupations } from '../../src/core/data.js';
import { createTrips } from '../../src/core/street/trips.js';
import { hash } from '../../src/core/random.js';

// A small hand-made population: everyone leaves home for work (or the hangout) with a
// 40-minute street run each way, some go to the night market for supper, some sit on a
// bench, and the weekend is a stroll and a visit to the hangout.
export function synthPeople(world, count = 1000) {
  const list = residents.slice(0, count);
  const byId = new Map(list.map(r => [r.id, r]));
  const rel = new Map(), household = new Map();
  for (const hh of relations.households) {
    const all = [...hh.adults, ...hh.kids, ...(hh.grandparents || [])];
    for (const a of all) household.set(a, hh.id);
    for (const a of all) rel.set(a, all.filter(b => b !== a).map(b => ({ id: b, kind: 'family', label: '家人', group: 'family' })));
  }
  const plans = new Map();
  const benches = ['bench:0', 'bench:5', 'bench:10'];
  function planFor(id, day) {
    const key = id + ':' + day;
    if (plans.has(key)) return plans.get(key);
    const r = byId.get(id), h = hash(key), segs = [];
    const weekend = ((day - 1) % 7) >= 5;
    const dest = !weekend && r.work ? r.work : r.hangout || r.home;
    const t0 = 480 + (hash(r.id) % 60), t1 = 1020 + (h % 60);
    const push = (start, end, state, place, extra = {}) => segs.push({ start, end, state, place, activity: state, ...extra });
    push(0, t0 - 40, 'SLEEPING', r.home);
    push(t0 - 40, t0, 'COMMUTE', 'street');
    push(t0, t1, weekend ? 'LEISURE' : 'AT_WORK', dest);
    let t = t1;
    push(t, t + 40, 'COMMUTE', 'street'); t += 40;
    const night = h % 9 === 0, bench = h % 7 === 0;
    if (night) {
      push(t, t + 90, 'DINING', 'c-night-market', { party: household.get(r.id) || r.id }); t += 90;
      push(t, t + 40, 'COMMUTE', 'street'); t += 40;
    } else if (bench) {
      push(t, t + 60, 'LEISURE', benches[h % 3]); t += 60;
      push(t, t + 25, 'COMMUTE', 'street'); t += 25;
    } else if (h % 5 === 0) {
      push(t, t + 30, 'LEISURE', 'street'); t += 30;
    }
    push(t, 1440, 'HOME', r.home);
    const plan = { owner: id, day, dayType: weekend ? 'saturday' : 'weekday', segments: segs };
    plans.set(key, plan);
    return plan;
  }
  const people = {
    residents: list, byId,
    job: id => ({ title: byId.get(id).job, org: byId.get(id).org }),
    relationsOf: id => (rel.get(id) || []),
    planFor,
    plansFor: day => new Map(list.map(r => [r.id, planFor(r.id, day)]))
  };
  return people;
}

export function setupTrips(count) {
  const s = setup();
  const people = synthPeople(s.world, count);
  const trips = createTrips({ world: s.world, net: s.net, lines: s.lines, people, pace: PACE });
  return { ...s, people, trips };
}
