import { test } from 'node:test';
import assert from 'node:assert/strict';
import { town, buildings } from '../../src/core/data.js';
import { buildWorld } from '../../src/core/world/index.js';
import { helicopterAt, sortiesOn, PAD } from '../../src/core/world/helicopter.js';
import { toDaySeconds } from '../../src/core/clock.js';

const world = buildWorld(town, buildings);
const pad = world.siteList.find(s => s.helipad);
const at = (day, minute, w = world) => helicopterAt(w, toDaySeconds(day, minute));
const ORDER = ['parked', 'boarding', 'take-off', 'circuit', 'landing', 'shutdown', 'parked'];

// Every phase seen while stepping through [from, to) minutes, without repeats in a row.
function phasesBetween(day, from, to, step = 0.05, w = world) {
  const seen = [];
  for (let m = from; m < to; m += step) { const p = at(day, m, w).phase; if (seen[seen.length - 1] !== p) seen.push(p); }
  return seen;
}

test('helicopterAt is a pure function of time', () => {
  const times = [0, 123.4, toDaySeconds(1, 531.7), toDaySeconds(3, 801.2), toDaySeconds(6, 1061.9), toDaySeconds(1, 640)];
  const first = times.map(t => helicopterAt(world, t));
  const again = [...times].reverse().map(t => helicopterAt(world, t)).reverse();
  assert.deepEqual(again, first);
  // A fresh world built from the same data flies the same way.
  const other = buildWorld(town, buildings);
  assert.deepEqual(times.map(t => helicopterAt(other, t)), first);
});

test('parked exactly on the helipad roof between sorties', () => {
  for (const day of [1, 2, 5, 6, 7]) {
    const sorties = sortiesOn(world, day);
    const busy = m => sorties.some(s => m >= s.start && m < s.end);
    for (let m = 0; m < 1440; m += 7.3) {
      if (busy(m)) continue;
      const h = at(day, m);
      assert.equal(h.phase, 'parked', `day ${day} minute ${m}`);
      assert.equal(h.x, pad.roof.x); assert.equal(h.z, pad.roof.z);
      assert.equal(h.y, pad.roof.y + PAD.rise);
      assert.equal(h.rotor, 0); assert.equal(h.spin, 0); assert.equal(h.bank, 0); assert.equal(h.pitch, 0);
    }
  }
});

test('weekday and weekend sorties come from data/town.js', () => {
  assert.deepEqual(sortiesOn(world, 1).map(s => s.start), town.helicopter.sorties.weekday);
  assert.deepEqual(sortiesOn(world, 6).map(s => s.start), town.helicopter.sorties.weekend);
  assert.deepEqual(sortiesOn(world, 7).map(s => s.start), town.helicopter.sorties.weekend);
  const s = sortiesOn(world, 2)[1];
  assert.equal(at(2, s.takeOff - 0.01).phase, 'boarding');
  assert.equal(at(2, s.takeOff + 0.01).phase, 'take-off');
  assert.equal(at(2, s.landing - 0.01).phase, 'landing');
  assert.equal(at(2, s.landing + 0.01).phase, 'shutdown');
});

test('each sortie goes through the phases in order', () => {
  for (const day of [1, 4, 6]) {
    for (const s of sortiesOn(world, day)) assert.deepEqual(phasesBetween(day, s.start - 3, s.end + 3), ORDER, `day ${day} sortie ${s.start}`);
  }
});

test('in flight it stays above the tallest roof, and moves smoothly', () => {
  const tallestRoof = Math.max(...world.siteList.map(s => s.roof ? s.roof.y : s.height));
  const deck = pad.roof.y + PAD.rise;
  const s = sortiesOn(world, 3)[0];
  let prev = null, far = 0;
  for (let m = s.start; m < s.end; m += 0.02) {
    const h = at(3, m);
    assert.ok(h.y >= deck - 1e-9, `below the deck at ${m}`);
    const fromPad = Math.hypot(h.x - pad.roof.x, h.z - pad.roof.z);
    if (fromPad > PAD.size / 2) { assert.ok(h.y > tallestRoof + 10, `too low at ${m}: ${h.y}`); far++; }
    if (h.phase === 'circuit') assert.ok(h.y > tallestRoof + 30, `circuit too low at ${m}`);
    if (prev) {
      // 0.02 town minutes is 1/80 s: nothing jumps.
      assert.ok(Math.hypot(h.x - prev.x, h.y - prev.y, h.z - prev.z) < 0.6, `jump at ${m}`);
      assert.ok(Math.abs(Math.atan2(Math.sin(h.heading - prev.heading), Math.cos(h.heading - prev.heading))) < 0.05, `heading jump at ${m}`);
      assert.ok(Math.abs(h.bank - prev.bank) < 0.05 && Math.abs(h.pitch - prev.pitch) < 0.05, `attitude jump at ${m}`);
    }
    prev = h;
  }
  assert.ok(far > 1000, 'it really leaves the pad');
});

test('it flies a wide circuit over the town and comes back', () => {
  const s = sortiesOn(world, 1)[2];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let m = s.takeOff; m <= s.landing; m += 0.5) {
    const h = at(1, m);
    minX = Math.min(minX, h.x); maxX = Math.max(maxX, h.x); minZ = Math.min(minZ, h.z); maxZ = Math.max(maxZ, h.z);
    assert.ok(Math.abs(h.x) <= world.board.halfX && Math.abs(h.z) <= world.board.halfZ, 'over the board');
  }
  assert.ok(maxX - minX > world.board.halfX && maxZ - minZ > world.board.halfZ, 'covers the town');
  const down = at(1, s.landing);
  assert.equal(down.x, pad.roof.x); assert.equal(down.z, pad.roof.z);
});

test('still safe when the helipad tower is moved to another lot', () => {
  const lotOf = Object.entries(town.lots).find(([, id]) => id === pad.id)[0];
  const swapped = { ...town, lots: { ...town.lots, [lotOf]: town.lots.C4, C4: pad.id } };
  const w = buildWorld(swapped, buildings);
  const p = w.siteList.find(x => x.helipad);
  const tallestRoof = Math.max(...w.siteList.map(x => x.roof ? x.roof.y : x.height));
  const s = sortiesOn(w, 2)[0];
  assert.deepEqual(phasesBetween(2, s.start - 2, s.end + 2, 0.05, w), ORDER);
  for (let m = s.takeOff; m < s.landing; m += 0.1) {
    const h = at(2, m, w);
    if (Math.hypot(h.x - p.roof.x, h.z - p.roof.z) > PAD.size / 2) assert.ok(h.y > tallestRoof + 10, `too low at ${m}`);
  }
  assert.equal(at(2, 5, w).x, p.roof.x);
});
