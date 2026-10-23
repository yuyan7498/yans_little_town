import { test } from 'node:test';
import assert from 'node:assert/strict';
import { town, buildings } from '../../src/core/data.js';
import { buildWorld, WorldError } from '../../src/core/world/index.js';

const world = buildWorld(town, buildings);

test('every building has a place and every lot a site', () => {
  for (const b of buildings) assert.ok(world.site(b.id), b.id);
  for (const lot of world.lots) assert.ok(lot.site, lot.id);
  // Six columns by six rows, the airport and the zoo each on two joined lots.
  assert.equal(world.lots.length, 34);
});

test('joined lots: one lot over both and the ground between, with roads on every side', () => {
  for (const [id, site, joins] of [['A3+A4', 'x-airport', ['A3', 'A4']], ['F3+F4', 'x-zoo', ['F3', 'F4']]]) {
    const lot = world.lotById.get(id);
    assert.ok(lot, id);
    assert.equal(lot.site, site);
    assert.deepEqual(lot.joins, joins);
    for (const j of joins) assert.equal(world.lotById.get(j), undefined, j);
    assert.ok(lot.d > 2 * world.lotById.get('B3').d, id);
    for (const side of ['n', 's', 'e', 'w']) assert.equal(lot.sides[side].kind, 'road', id + ' ' + side);
  }
  // A road between the two lots is refused.
  const across = { ...town, streets: town.streets.map(s => (s.id === 'center' ? { ...s, from: -280, to: 280 } : s)) };
  assert.throws(() => buildWorld(across, buildings), /中央街/);
});

test('junctions: lights where three or more roads meet, zebras and stop lines on every vehicle arm', () => {
  assert.equal(world.junctions.length, 40);
  for (const j of world.junctions) {
    const arms = Object.values(j.arms).filter(Boolean).length;
    // The outer ring's four corners are plain bends; the old ring's corners go without lights.
    const quiet = town.unsignalled.includes(j.avenue + '/' + j.street);
    assert.equal(!!j.signal, arms >= 3 && !quiet, j.id);
    assert.equal(j.zebras.length, arms, j.id);
    assert.equal(j.stopLines.length, arms, j.id);
  }
  assert.equal(world.crossings.length, 8);
  assert.ok(world.junctionAt('trunk-w', 'center'));
});

test('the pedestrian street carries no traffic', () => {
  const ped = world.segments.filter(s => s.pedestrian);
  assert.ok(ped.length >= 2);
  for (const s of ped) assert.equal(s.vehicles, false);
  assert.equal(world.junctionAt('trunk-e', 'center').arms.nx, false);
});

test('doors stand on the footprint (or the plot, for gates and open ground) and face out', () => {
  for (const s of world.siteList) {
    if (s.place === 'night-market') continue;
    for (const d of s.doors) {
      const box = d.gate || s.open_air ? s.area : s.footprint;
      const onEdge = Math.abs(d.x - box.x0) < 1e-6 || Math.abs(d.x - box.x1) < 1e-6 || Math.abs(d.z - box.z0) < 1e-6 || Math.abs(d.z - box.z1) < 1e-6;
      assert.ok(onEdge, s.id);
      assert.equal(Math.abs(d.nx) + Math.abs(d.nz), 1, s.id);
    }
  }
});

test('footprints stay inside their lots; annexes inside their host lot', () => {
  for (const s of world.siteList) {
    if (!s.lot) continue;
    const lot = world.lotById.get(s.lot), f = s.footprint;
    assert.ok(f.x0 >= lot.x0 - 1e-6 && f.x1 <= lot.x1 + 1e-6 && f.z0 >= lot.z0 - 1e-6 && f.z1 <= lot.z1 + 1e-6, s.id);
  }
});

test('the night market has 32 stalls and 140 seats, none in the canal', () => {
  assert.equal(world.stalls.length, 32);
  assert.equal(world.stalls.reduce((n, s) => n + s.seats.length, 0), 140);
  for (const s of world.stalls) for (const seat of s.seats) assert.ok(Math.abs(seat.x) > world.river.halfWidth + 12, s.id);
});

test('swapping two lots moves the buildings and nothing else breaks', () => {
  const swapped = { ...town, lots: { ...town.lots, B1: town.lots.E6, E6: town.lots.B1 } };
  const w = buildWorld(swapped, buildings);
  assert.equal(w.site('c-primary').lot, 'E6');
  assert.equal(w.site('c-precinct').lot, 'E6');
  assert.equal(w.site('c-annex-mall').lot, 'B1');
  // The two joined lots can swap their sites too.
  const joined = buildWorld({ ...town, lots: { ...town.lots, 'A3+A4': 'x-zoo', 'F3+F4': 'x-airport' } }, buildings);
  assert.equal(joined.site('x-zoo').lot, 'A3+A4');
  assert.equal(joined.site('x-airport').lot, 'F3+F4');
});

test('bad data gives readable errors', () => {
  assert.throws(() => buildWorld({ ...town, lots: { ...town.lots, Z9: 'c-mall' } }, buildings), WorldError);
  assert.throws(() => buildWorld({ ...town, lots: { ...town.lots, A1: 'nowhere' } }, buildings), /nowhere/);
});

test('heights: bridges rise, tunnels sink, pavements sit on the kerb', () => {
  assert.ok(world.heightAt(0, -86, 'road') > 1);
  assert.ok(world.heightAt(0, -172, 'road') < -4);
  assert.equal(world.heightAt(0, -172, 'foot'), 0.15);
  assert.equal(world.heightAt(150, 150, 'foot'), 0.15);
});
