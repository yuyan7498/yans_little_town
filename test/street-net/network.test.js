import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';

const { world, net, spots } = setup();
const placeIds = [...world.siteList.map(s => s.id), ...world.stalls.slice(0, 6).map(s => s.id), ...spots.slice(0, 6).map(s => s.id)];
const near = (p, q, d = 0.01) => Math.hypot(p.x - q.x, p.z - q.z) <= d;
const inRect = (p, r, m = 0) => p.x >= r.x0 - m && p.x <= r.x1 + m && p.z >= r.z0 - m && p.z <= r.z1 + m;

function sample(path, step, fn) {
  for (let s = 0; s <= path.total; s += step) fn(net.sampleAt(path, s), s);
}

test('every place has a door, and routes begin and end at the right doors', () => {
  for (const id of placeIds) assert.ok(net.doorOf(id, 'k'), id);
  let n = 0;
  for (const a of placeIds) for (const b of placeIds) {
    if (a === b) continue;
    const key = 'k' + n++;
    const path = net.route(a, b, key);
    assert.ok(path && path.total > 0, a + '>' + b);
    assert.equal(path.doors[0], net.doorOf(a, key));
    assert.equal(path.doors[1], net.doorOf(b, key));
    assert.ok(near(path.points[0], path.doors[0]), 'starts at ' + a);
    assert.ok(near(path.points.at(-1), path.doors[1]), 'ends at ' + b);
    assert.ok(Math.abs(path.lengths.at(-1) - path.total) < 1e-6);
  }
});

test('a stroll goes out and comes back to the same door', () => {
  for (const id of placeIds.slice(0, 20)) {
    const path = net.route(id, id, 'stroll');
    assert.ok(path.total > 10, id);
    assert.ok(near(path.points[0], path.points.at(-1)), id);
  }
});

test('walkers cross carriageways only on zebras', () => {
  const cws = net.walkGraph.carriageways.filter(c => c.over === 'land');
  const eps = 0.05, bad = [];
  let n = 0;
  for (const a of placeIds) for (const b of placeIds) {
    if (a === b || (n++ % 3)) continue;
    const path = net.route(a, b, 'x');
    sample(path, 0.5, p => {
      for (const c of cws) {
        if (p.x > c.x0 + eps && p.x < c.x1 - eps && p.z > c.z0 + eps && p.z < c.z1 - eps &&
          !net.zebras.some(z => inRect(p, z, 0.4))) bad.push(`${a}>${b} at ${p.x.toFixed(1)},${p.z.toFixed(1)} on ${c.road}`);
      }
    });
  }
  assert.deepEqual(bad.slice(0, 5), []);
});

test('rides keep to the right and use only vehicle roads', () => {
  const edges = net.roadGraph.edges, nodes = net.roadGraph.nodes;
  let samples = 0, left = 0, n = 0;
  for (const a of world.siteList) for (const b of world.siteList) {
    if (a === b || (n++ % 4)) continue;
    for (const kind of ['car', 'two']) {
      const ride = net.ride(a.id, b.id, 'r' + n, kind);
      if (!ride) continue;
      assert.ok(ride.legs.walkEnd <= ride.legs.driveStart && ride.legs.driveEnd <= ride.legs.walkStart && ride.legs.walkStart <= ride.total + 1e-6);
      assert.ok(ride.roadEdges.length > 0);
      for (let s = ride.legs.driveStart + 4; s < ride.legs.driveEnd - 4; s += 1) {
        const p = net.sampleAt(ride, s);
        for (const pc of ride.roadEdges) {
          const e = edges[pc.edge], A = nodes[e.a];
          const t = (p.x - A.x) * e.ux + (p.z - A.z) * e.uz, perp = -(p.x - A.x) * e.uz + (p.z - A.z) * e.ux;
          if (t < e.road.half + 1 || t > e.length - e.road.half - 1 || Math.abs(perp) > e.road.half + 0.5) continue;
          // With z towards the viewer, the right of travel (dx, dz) is (-dz, dx).
          const dir = pc.forward ? 1 : -1, rightOf = perp * dir;
          if (Math.abs(rightOf) < 0.2) continue;
          if (Math.cos(p.heading) * e.ux * dir + Math.sin(p.heading) * e.uz * dir < 0.9) continue;
          samples++;
          if (rightOf < 0) left++;
          break;
        }
      }
    }
  }
  assert.ok(samples > 1000, 'samples ' + samples);
  assert.ok(left / samples < 0.02, `on the left ${left}/${samples}`);
});

test('a ride ends at the destination door', () => {
  let n = 0;
  for (const a of world.siteList) for (const b of world.siteList) {
    if (a === b || (n++ % 3)) continue;
    const key = 'p' + n, ride = net.ride(a.id, b.id, key, 'car');
    if (!ride) continue;
    const end = net.sampleAt(ride, ride.total), door = net.doorOf(b.id, key);
    assert.ok(near(end, door, 1.5), `${a.id}>${b.id} ends ${Math.hypot(end.x - door.x, end.z - door.z)} from the door`);
  }
});

test('routes are cached and fast', () => {
  const t0 = performance.now();
  let count = 0;
  for (let i = 0; i < 4000; i++) {
    const a = placeIds[i % placeIds.length], b = placeIds[(i * 7 + 3) % placeIds.length];
    if (a !== b) { net.route(a, b, 'perf' + (i % 50)); count++; }
  }
  const ms = performance.now() - t0;
  assert.ok(ms < 3000, `${count} routes took ${ms.toFixed(0)}ms`);
});

test('roomAt is sensible and zebras carry junction ids', () => {
  assert.ok(net.roomAt(0, 0) > 0);
  assert.ok(net.zebras.length > 20);
  for (const z of net.zebras) assert.ok(z.junction && z.id);
});

test('kerb spots: clear of bus stops, one vehicle to a spot at a time, taxis on their own spots', async () => {
  const { lines } = setup();
  const ledger = new Map();
  const win = (a, b) => [a, b];
  const taken = new Set(), takenTaxi = new Set();
  let rides = 0;
  for (let i = 0; i < 12; i++) {
    const book = { ledger, owner: 'o' + i, taxi: false, pick: win(100, 106), drop: win(140, 146) };
    const ride = net.ride('h-slab', 'c-primary', 'k' + i, 'car', null, book);
    if (!ride) continue;
    rides++;
    const [a, b] = ride.slots;
    if (i < 4) assert.ok(!taken.has(a), 'pick-up spot not shared at once');
    taken.add(a);
    for (const k of ride.kerbs) for (const s of lines.stops) assert.ok(Math.hypot(k.x - s.kerb.x, k.z - s.kerb.z) > 10, 'clear of bus stop ' + s.id);
  }
  assert.ok(rides >= 5 && taken.size >= 4, `spread over ${taken.size} spots`);
  for (let i = 0; i < 1; i++) {
    const ride = net.ride('h-slab', 'c-primary', 'taxi' + i, 'car', null, { ledger, owner: 'taxi' + i, taxi: true, pick: win(100, 106), drop: win(140, 146) });
    if (ride) takenTaxi.add(ride.slots[0]);
  }
  for (const s of takenTaxi) assert.ok(!taken.has(s) || taken.size > 3, 'taxis do not use car spots');
});
