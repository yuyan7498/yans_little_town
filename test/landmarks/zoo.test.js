import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zooClips } from '../../tools/zoo-clip.mjs';
const { walkSeconds } = await import('../../src/render/landmarks/zoo-herd.js');
const { SECONDS_PER_MINUTE } = await import('../../src/core/clock.js');

const at = (day, minute) => ((day - 1) * 1440 + minute) * SECONDS_PER_MINUTE;

test('the zoo animals never poke into each other, the ground or anything built in the zoo', async () => {
  const problems = await zooClips({ days: 1, step: 5 });
  assert.deepEqual(problems.map(p => `${p.what} (${p.worst.toFixed(2)})`), []);
});

test('an animal walks while the zoo is open and stands still asleep and in its naps', () => {
  const rest = { open: 540, close: 1020, naps: [[780, 840]] };
  const walked = (d, m) => walkSeconds(at(d, m), rest);
  // Asleep at night and in the nap: no walking.
  assert.ok(Math.abs(walked(1, 300) - walked(1, 120)) < 1e-9);
  assert.ok(Math.abs(walked(1, 830) - walked(1, 795)) < 1e-9);
  // Awake: a minute's walk per minute.
  assert.ok(Math.abs(walked(1, 700) - walked(1, 650) - 50 * SECONDS_PER_MINUTE) < 1e-6);
  // Never backwards, and every day the same.
  let prev = -1;
  for (let m = 0; m < 2880; m += 7) { const w = walked(1, m); assert.ok(w >= prev - 1e-9); prev = w; }
  assert.ok(Math.abs((walked(3, 700) - walked(2, 700)) - (walked(2, 700) - walked(1, 700))) < 1e-6);
});
