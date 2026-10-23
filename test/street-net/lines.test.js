import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, PACE } from './helpers.js';

const { world, net, lines, transit } = setup();

test('every bus line is a closed loop on vehicle roads, with stops', () => {
  assert.equal(lines.routes.length, new Set(lines.routes.map(r => r.id)).size);
  assert.ok(lines.routes.length >= 2, 'routes both ways');
  for (const r of lines.routes) {
    assert.ok(r.path.loop, r.id);
    assert.ok(r.stops.length >= 3, r.id + ' stops ' + r.stops.length);
    assert.ok(r.path.total > 100);
    for (let s = 0; s < r.path.total; s += 3) {
      const p = net.sampleAt(r.path, s);
      const on = world.segments.some(g => {
        if (!g.vehicles) return false;
        const road = world.roadById.get(g.road), h = road.half + 0.5;
        return road.axis === 'x' ? p.x >= g.x0 - h && p.x <= g.x1 + h && Math.abs(p.z - road.z) <= h
          : p.z >= g.z0 - h && p.z <= g.z1 + h && Math.abs(p.x - road.x) <= h;
      });
      assert.ok(on, `${r.id} off the road at ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
    }
  }
});

test('stops are at the kerb with a heading, and some have shelters', () => {
  assert.ok(lines.stops.length > 20);
  for (const s of lines.stops) assert.ok(Number.isFinite(s.s) && s.kerb && s.lane && Number.isFinite(s.heading), s.id);
  assert.ok(lines.stops.some(s => s.shelter));
});

test('the taxi rank is at the station and parameters scale with pace', () => {
  assert.ok(lines.rank && lines.rank.site === world.siteList.find(s => s.kind === 'station').id);
  assert.equal(lines.BUS.cruise, transit.bus.cruise * PACE);
  assert.equal(lines.TAXI.cruise, transit.taxi.cruise * PACE);
});

test('runsOf spreads buses and planBus finds a ride', () => {
  const duty = { bus: [], taxi: [{ id: 't', shifts: [[300, 1300]] }] };
  for (let i = 0; i < 12; i++) duty.bus.push({ id: 'b' + i, shifts: [[360, 1200]] });
  const runs = lines.runsOf(duty);
  assert.ok(runs.length > 0);
  assert.ok(lines.taxiOnDuty(duty, 600) && !lines.taxiOnDuty(duty, 100));
  let found = 0, tried = 0;
  const ids = world.siteList.map(s => s.id);
  for (const a of ids) for (const b of ids) {
    if (a === b) continue;
    tried++;
    const plan = lines.planBus(net.doorOf(a, 'k'), net.doorOf(b, 'k'), duty, 480, 560);
    if (plan) {
      found++;
      assert.ok(plan.board >= 480 && plan.alight > plan.board && plan.from !== plan.to);
    }
  }
  assert.ok(found > tried * 0.05, `buses serve ${found}/${tried} pairs`);
});
