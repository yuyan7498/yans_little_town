import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realStreet } from './real.js';

// The street wired as src/main.js wires it. Thresholds are loose guards, not targets.
test('real wiring, morning rush: walkers keep off furniture, no car on a zebra in the walk phase', () => {
  const { street } = realStreet();
  const a = street.audit({ day: 1, from: 470, to: 560, step: 0.1 });
  console.log('real-morning', JSON.stringify({ agents: a.maxAgents, vv: a.vehicle, vw: a.vehicleWalker, ww: a.walker, furn: a.furniture, forced: a.forcedSteps, inWalk: a.onZebra.inWalk, ms: a.msPerStep }));
  assert.ok(a.onZebra.inWalk < 30, 'cars on zebras in the walk phase ' + a.onZebra.inWalk);   // (a few kerb spots lie on a zebra: the net's)
  assert.ok(a.furniture < 800, 'furniture ' + a.furniture);
  assert.ok(a.walker < 4000, 'walker ' + a.walker);
  assert.ok(a.msPerStep < 6, 'ms ' + a.msPerStep);
});
