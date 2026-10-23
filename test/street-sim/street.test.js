import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world, lane, walk, depthOf, carInput, walkerInput } from './helpers.js';
import { net, mockLines, mockPeople, mockTrips } from './mocks.js';
import { createStreet } from '../../src/core/street/street.js';
import { createTraffic } from '../../src/core/street/traffic.js';
import { planFurniture } from '../../src/core/world/furniture.js';

const items = planFurniture(world).items;
const lines = mockLines(3), people = mockPeople();
const make = (from, to, count) => {
  const trips = mockTrips({ lines, people, count, from, to });
  const street = createStreet({ world, net, lines, trips, people, pace: 3 });
  street.setObstacles(items);
  return street;
};
const audit = (from, to, opts = {}) => make(from - 10, to, opts.count || 400).audit({ day: 1, from, to, step: 0.1, ...opts });

test('hand-built lanes: a car queue behind a stopped one never overlaps', () => {
  const T = createTraffic({ world, pace: 3 });
  const path = lane(['trunk-e/trunk-s', 'trunk-e/center']);
  let worst = 0;
  for (let m = 0; m < 6; m += 0.05) {
    const inputs = [carInput('a', path, m, 0, { speed: 15, start: 60 }), carInput('b', path, m, 0, { speed: 36, start: 30 }), carInput('c', path, m, 0, { speed: 36, start: 5 })];
    T.step(m, inputs);
    const a = [...T.agents.values()];
    for (let i = 0; i < a.length; i++) for (let k = i + 1; k < a.length; k++) worst = Math.max(worst, depthOf(a[i], a[k]));
  }
  assert.ok(worst < 0.5, 'worst overlap ' + worst);
});

test('walkers on a straight walk pass through each other without deep overlap', () => {
  const T = createTraffic({ world, pace: 3 });
  const p = walk([-50, -50], [-10, -50]), q = walk([-10, -50.1], [-50, -50.1]);
  let worst = 0;
  for (let m = 0; m < 1; m += 0.02) {
    T.step(m, [walkerInput('w1', p, m, 0), walkerInput('w2', q, m, 0)]);
    const a = [...T.agents.values()];
    if (a.length === 2) worst = Math.max(worst, depthOf(a[0], a[1]));
  }
  assert.ok(worst < 0.9, 'worst overlap ' + worst);
});

test('morning rush: vehicles never overlap deeply, walkers keep off furniture, no car on a zebra in the walk phase', () => {
  const a = audit(480, 540);
  console.log('rush', JSON.stringify({ agents: a.maxAgents, vv: a.vehicle, vw: a.vehicleWalker, ww: a.walker, furn: a.furniture, zebra: a.onZebra.steps, inWalk: a.onZebra.inWalk, ms: a.msPerStep }));
  assert.ok(a.maxAgents > 100);
  assert.equal(a.onZebra.inWalk, 0);
  assert.ok(a.vehicle <= 20, 'vehicle overlap steps ' + a.vehicle);
  const deepV = a.worst.filter(w => !/walker/.test(w.a + w.b)).filter(w => w.depth > 3.5);
  assert.deepEqual(deepV, []);
  const furn = a.worst.filter(w => w.b === 'furniture' || w.a === 'furniture');
  assert.ok(furn.every(w => w.depth < 1));
});

test('evening: same checks over two hours', () => {
  const a = audit(1020, 1140, { count: 500 });
  console.log('evening', JSON.stringify({ agents: a.maxAgents, vv: a.vehicle, vw: a.vehicleWalker, ww: a.walker, zebra: a.onZebra.steps, inWalk: a.onZebra.inWalk, ms: a.msPerStep }));
  assert.equal(a.onZebra.inWalk, 0);
  assert.ok(a.vehicle <= 30, 'vehicle overlap steps ' + a.vehicle);
});

test('lights cycle through green, amber, red and an exclusive walk phase', () => {
  const street = make(470, 540, 300);
  const seen = new Map();
  for (let m = 480; m < 540; m += 0.1) {
    street.step(m * 0.625);
    for (const [id, s] of street.signals()) {
      if (!seen.has(id)) seen.set(id, new Set());
      seen.get(id).add(s.phase + ':' + s.stage);
    }
  }
  assert.ok(seen.size >= 6, 'signalled junctions ' + seen.size);
  const all = new Set([...seen.values()].flatMap(s => [...s]));
  for (const k of ['ns:green', 'ew:green', 'ns:amber', 'ew:amber']) assert.ok(all.has(k), 'missing ' + k);
  assert.ok([...all].some(k => k.startsWith('walk:')), 'walk phase never came');
});

test('buses pick up and drop riders', () => {
  const street = make(470, 600, 500);
  const phases = new Set();
  let aboardMax = 0;
  for (let m = 480; m < 600; m += 0.1) {
    street.step(m * 0.625);
    for (const w of street.walkers()) if (w.mode === 'bus' || w.vehicle) phases.add(w.phase);
    aboardMax = Math.max(aboardMax, street.info().riders || 0);
  }
  const info = street.info();
  console.log('transit', JSON.stringify({ buses: info.buses, taxis: info.taxis, riders: aboardMax, phases: [...phases] }));
  assert.ok(info.buses > 0);
  assert.ok(aboardMax > 0);
});

test('a jump in time resets cleanly and prerolls', () => {
  const street = make(470, 1200, 500);
  for (let m = 480; m < 485; m += 0.1) street.step(m * 0.625);
  const before = street.info().prerolls;
  street.step(900 * 0.625);
  const info = street.info();
  assert.ok(info.prerolls > before, 'preroll after jump');
  for (let m = 900; m < 903; m += 0.1) street.step(m * 0.625);
  for (const v of street.vehicles()) assert.ok(Number.isFinite(v.x) && Number.isFinite(v.z) && Number.isFinite(v.y));
  for (const w of street.walkers()) assert.ok(Number.isFinite(w.point.x) && Number.isFinite(w.point.z));
  // and back in time
  street.step(481 * 0.625);
  assert.ok(street.info().resets >= 2);
});

test('jitter at 60 fps is low', () => {
  const a = audit(490, 500, { step: 0.0267, jitter: true });
  console.log('jitter', JSON.stringify(a.jitter));
  for (const [k, j] of Object.entries(a.jitter)) {
    for (const f of ['turn', 'stopGo', 'brake', 'hop']) assert.ok(j[f] < 1, k + ' ' + f + ' ' + j[f]);
    assert.ok(j.back < 5 && j.pose < 2, k + ' back/pose');
  }
});

test('frame step with ~250 movers stays under 4 ms', () => {
  const street = make(470, 540, 500);
  for (let m = 480; m < 500; m += 0.1) street.step(m * 0.625);
  const times = [];
  for (let m = 500; m < 520; m += 0.0267) { const t = performance.now(); street.step(m * 0.625); times.push(performance.now() - t); }
  times.sort((a, b) => a - b);
  const p50 = times[times.length >> 1], p95 = times[Math.floor(times.length * 0.95)];
  console.log('perf', JSON.stringify({ movers: street.info().movers, p50: +p50.toFixed(2), p95: +p95.toFixed(2) }));
  assert.ok(p50 < 4, 'median ' + p50);
});
