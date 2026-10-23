import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as clock from '../../src/core/clock.js';
import { hash, rng, unit } from '../../src/core/random.js';

test('a day is 1440 minutes and 900 seconds; day 1 is a Monday', () => {
  const m = clock.moment(clock.toDaySeconds(6, 750));
  assert.equal(m.day, 6); assert.equal(Math.round(m.minute), 750); assert.equal(m.dayType, 'saturday');
  assert.equal(clock.toDaySeconds(2, 0), 900);
  assert.equal(clock.format(1439), '23:59');
});

test('day and night', () => {
  assert.equal(clock.daylight(720), 1);
  assert.equal(clock.daylight(60), 0);
  assert.equal(clock.lamps(1300), 1);
  assert.equal(clock.lamps(720), 0);
  assert.ok(clock.within(30, 1380, 120));
});

test('random is deterministic', () => {
  assert.equal(hash('a'), hash('a'));
  const a = rng('x'), b = rng('x');
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
  assert.ok(unit('k') >= 0 && unit('k') < 1);
});
