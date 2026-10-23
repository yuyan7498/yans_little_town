import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realStreet } from './real.js';

// The street wired as src/main.js wires it (real people, trips and network).
const R = realStreet();
const { street } = R;
const SECONDS = 0.625;

test('nothing stays stuck for long on a morning of real traffic', () => {
  const a = street.stuckAudit({ day: 1, from: 420, to: 600, step: 0.2 });
  console.log('stuck', JSON.stringify({ episodes: a.episodes, longest: +a.longest.toFixed(1), jam: a.jam, cycles: a.cycles, slips: a.slips, byCause: a.byCause }));
  assert.ok(a.cycles <= 3, 'vehicles waiting on each other in a ring: ' + a.cycles);   // (a moment's mutual stop at a box; none lasts)
  assert.ok(a.longest < 20, 'longest stand ' + a.longest);
});

test('delivery vans: out of the depot, unloading at kerbs with hazard lights, back again', () => {
  const svc = street._sim.service;
  const unloaded = new Set(), hazards = new Set(), told = new Set();
  let started = 0, prev = new Map();
  for (let m = 400; m <= 1100; m += 0.5) {
    street.step(m * SECONDS);
    for (const v of svc.fleet) {
      if (v.type !== 'van') continue;
      if (v.state === 'toStop' && prev.get(v.id) === 'idle') started++;
      prev.set(v.id, v.state);
      if (v.state === 'unloading') unloaded.add(v.id + ':' + v.at + ':' + v.round);
    }
    for (const e of street.vehicles()) if (e.kind === 'van' && e.hazard) { hazards.add(e.id); const info = street.vehicleInfo(e.id); if (info) told.add(info.sub.split('・')[0]); }
    for (const e of street.vehicles()) if (e.kind === 'van' && !e.hazard) { const info = street.vehicleInfo(e.id); if (info) told.add(info.sub.split('・')[0]); }
  }
  console.log('vans', JSON.stringify({ rounds: started, unloads: unloaded.size, hazardVans: hazards.size, told: [...told] }));
  assert.ok(started >= 4, 'rounds started ' + started);
  assert.ok(unloaded.size >= 8, 'unloads ' + unloaded.size);
  assert.ok(hazards.size >= 2, 'vans with hazard lights ' + hazards.size);
  assert.ok(told.has('卸貨中') && told.has('送貨中'), 'vehicleInfo says ' + [...told]);
});

test('police patrol on routes that differ from leg to leg', () => {
  const svc = street._sim.service, legs = new Set();
  for (let m = 500; m <= 800; m += 0.5) { street.step(m * SECONDS); for (const v of svc.fleet) if (v.type === 'police' && v.state === 'patrol') legs.add(v.id + '>' + v.label); }
  assert.ok(legs.size >= 6, 'distinct patrol destinations ' + legs.size);
});

test('the strays rest on the ground by their spots, and the dog owners walk their dogs', () => {
  const poses = new Set();
  let pets = 0, strayWalkers = 0;
  for (let m = 340; m <= 1400; m += 1) {
    street.step(m * SECONDS);
    for (const w of street.walkers()) {
      if (w.resident.species) { poses.add(w.point.pose); strayWalkers++; assert.ok(['walk', 'stand', 'lie', 'sit', 'eat'].includes(w.point.pose), w.point.pose); }
      if (w.point.pet) { assert.equal(w.point.pet, 'dog'); assert.ok(w.resident.dog); pets++; }
    }
  }
  console.log('strays', JSON.stringify({ poses: [...poses], strayWalkers, pets }));
  assert.ok(poses.has('lie') && poses.has('sit') && poses.has('eat'), 'poses ' + [...poses]);
  assert.ok(pets > 0, 'no one walked a dog');
  const cat = street.whereIs('stray-cat');
  assert.ok(cat === null || typeof cat.x === 'number');
  assert.ok(street.tapTargets().some(t => t.id === 'stray-cat' || t.id === 'stray-dog'));
});
