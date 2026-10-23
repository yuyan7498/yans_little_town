import { test } from 'node:test';
import assert from 'node:assert/strict';
import { town, buildings } from '../../src/core/data.js';
import { buildWorld } from '../../src/core/world/index.js';
import { fillShow, glowAt, newBuffers, windowOf } from '../../src/render/landmarks/fireworks-show.js';
import { toDaySeconds } from '../../src/core/clock.js';

const world = buildWorld(town, buildings);
const { from, to } = windowOf(world);
const snap = (ds) => { const b = newBuffers(); const r = fillShow(world, ds, b); return { r, p: Array.from(b.positions.slice(0, r.sparks * 3)), c: Array.from(b.colors.slice(0, r.sparks * 3)) }; };

test('nothing flies outside the show window', () => {
  for (const m of [from - 1, to, 600]) assert.equal(snap(toDaySeconds(1, m)).r.active, false);
});

test('the sky is a pure function of time (scrubbing gives the same frame)', () => {
  const times = [from + 5, from + 20, to - 3].map(m => toDaySeconds(2, m));
  const first = times.map(snap);
  const again = [...times].reverse().map(snap).reverse();
  assert.deepEqual(again, first);
  assert.ok(first.some(s => s.r.sparks > 50), 'sparks are drawn during the show');
  assert.deepEqual(glowAt(world, times[1]), glowAt(world, times[1]));
});

test('sparks stay above the ground and over the town', () => {
  for (let m = from; m < to; m += 0.7) {
    const s = snap(toDaySeconds(1, m));
    for (let i = 0; i < s.p.length; i += 3) assert.ok(s.p[i + 1] > -5 && s.p[i + 1] < 260);
  }
});
