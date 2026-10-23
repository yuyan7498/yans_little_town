import { test } from 'node:test';
import assert from 'node:assert/strict';
import { town, buildings } from '../../src/core/data.js';
import { buildWorld } from '../../src/core/world/index.js';
import { planFurniture, furnitureLights, toWorld } from '../../src/core/world/furniture.js';

const world = buildWorld(town, buildings);
const plan = planFurniture(world);
const { items, spots } = plan;

// The rules below are worked out again from the world model, independently of the planner.
const rect = (x0, x1, z0, z1) => ({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) });
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
const dist = (a, b) => Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.z0 - b.z1, b.z0 - a.z1));
const pt = (x, z) => rect(x, x, z, z);
const KINDS = new Set(['lamp', 'tree', 'bench', 'river-bench', 'chess-table', 'bin', 'bollard', 'planter', 'bike-rack', 'vending', 'mailbox', 'hydrant', 'pavilion', 'nest']);

const carriageways = world.segments.filter(s => s.vehicles).flatMap(s => {
  const r = world.roadById.get(s.road);
  if (s.axis === 'z') return [rect(r.x - r.half, r.x + r.half, s.z0, s.z1)];
  const t = world.tunnels.find(t => t.street === r.id);
  const pieces = [];
  for (const [a, b] of [[s.x0, Math.min(s.x1, t ? -t.coverX : s.x1)], [Math.max(s.x0, t ? t.coverX : s.x0), s.x1]]) if (b > a) pieces.push(rect(a, b, r.z - r.half, r.z + r.half));
  return t ? pieces : [rect(s.x0, s.x1, r.z - r.half, r.z + r.half)];
});
const zebras = [...world.junctions.flatMap(j => j.zebras), ...world.crossings.map(c => c.zebra)];
const corners = [...world.junctions.flatMap(j => j.corners), ...world.crossings.flatMap(c => c.corners)];
const walkLines = [
  ...world.segments.filter(s => s.over !== 'tunnel').flatMap(s => {
    const r = world.roadById.get(s.road), w = r.lanesAt.walk;
    return s.axis === 'x' ? [rect(s.x0, s.x1, r.z - w, r.z - w), rect(s.x0, s.x1, r.z + w, r.z + w)] : [rect(r.x - w, r.x - w, s.z0, s.z1), rect(r.x + w, r.x + w, s.z0, s.z1)];
  }),
  ...world.promenades.map(p => rect(p.x, p.x, p.from, p.to)),
  ...world.bridges.filter(b => b.kind === 'foot').map(b => rect(-world.promenades[1].x, world.promenades[1].x, b.z, b.z))
];
const siteDoors = world.siteList.filter(s => s.place !== 'night-market').flatMap(s => [...s.doors, ...(s.entrance ? [s.entrance] : [])]);
const allDoors = siteDoors.concat(world.stalls.map(s => s.door));

test('the plan is deterministic', () => {
  const again = planFurniture(buildWorld(town, buildings));
  assert.deepEqual(again, plan);
});

test('every item is well formed', () => {
  const ids = new Set();
  for (const it of items) {
    assert.ok(KINDS.has(it.kind), it.kind);
    assert.ok(!ids.has(it.id), 'duplicate ' + it.id); ids.add(it.id);
    for (const k of ['x', 'z', 'y', 'heading', 'w', 'd']) assert.ok(Number.isFinite(it[k]), it.id + ' ' + k);
    assert.ok(it.w > 0 && it.d > 0);
    assert.ok(it.x > world.board.minX && it.x < world.board.maxX && it.z > world.board.minZ && it.z < world.board.maxZ, it.id);
    if (it.kind === 'lamp') {
      assert.ok(it.light && it.light.y > it.y + 4 && it.light.radius > 0 && /^#/.test(it.light.color), it.id);
      assert.ok(Math.hypot(it.light.x - it.x, it.light.z - it.z) <= 2, it.id);
    }
    if (it.kind === 'tree') assert.ok(typeof it.species === 'string' && it.size > 0.5 && it.size < 1.6, it.id);
  }
  const count = k => items.filter(i => i.kind === k).length;
  assert.ok(count('lamp') > 300, 'lamps ' + count('lamp'));
  assert.ok(count('tree') > 300, 'trees ' + count('tree'));
  for (const k of ['bench', 'river-bench', 'chess-table', 'bin', 'bollard', 'planter', 'bike-rack', 'vending', 'mailbox', 'hydrant']) assert.ok(count(k) > 0, k);
});

test('nothing on a carriageway, a zebra, or in the canal', () => {
  for (const it of items) {
    for (const c of carriageways) assert.ok(!overlaps(it.box, c), `${it.id} on a carriageway`);
    for (const z of zebras) assert.ok(!overlaps(it.box, z), `${it.id} on a zebra`);
    const inCanal = it.box.x0 < world.river.halfWidth && it.box.x1 > -world.river.halfWidth;
    if (inCanal) assert.ok(it.kind === 'lamp' && it.style === 'bridge', `${it.id} in the canal`);
  }
});

test('nothing within 1.2 of a walking line', () => {
  for (const it of items) for (const l of walkLines) {
    assert.ok(dist(pt(it.x, it.z), l) >= 1.2 - 1e-6, `${it.id} at ${it.x},${it.z} too near a walking line`);
    assert.ok(dist(it.box, l) >= 0.8 - 1e-6, `${it.id} footprint too near a walking line`);
  }
});

test('door approaches, building footprints and stalls stay clear', () => {
  for (const it of items) {
    for (const d of allDoors) {
      assert.ok(dist(it.box, pt(d.approach.x, d.approach.z)) >= 0.8, `${it.id} blocks a door approach at ${d.approach.x},${d.approach.z}`);
      assert.ok(dist(it.box, pt(d.x, d.z)) >= 0.5, `${it.id} on a door`);
    }
    for (const s of world.siteList) {
      if (s.kind === 'park' || s.place === 'night-market') continue;
      assert.ok(!overlaps(it.box, s.footprint), `${it.id} inside ${s.id}`);
      if (s.lot || s.place === 'waterfront') assert.ok(!overlaps(it.box, s.area), `${it.id} on the plot of ${s.id}`);
    }
    for (const st of world.stalls) assert.ok(!overlaps(it.box, st.plot), `${it.id} in ${st.id}`);
  }
  // Inside a park only the park's own furniture.
  for (const s of world.siteList.filter(s => s.kind === 'park')) {
    for (const it of items) if (overlaps(it.box, s.area) && it.x > s.area.x0 && it.x < s.area.x1 && it.z > s.area.z0 && it.z < s.area.z1) assert.equal(it.park || it.site, s.id, it.id);
  }
});

test('lamps: along both kerbs, none near a signal corner, arms toward the road', () => {
  const street = items.filter(i => i.kind === 'lamp' && i.style === 'street');
  for (const l of street) {
    for (const c of corners) assert.ok(Math.hypot(c.x - l.x, c.z - l.z) >= 8 - 1e-6, `${l.id} within 8 of a signal corner`);
    const r = world.roadById.get(l.road);
    const toRoad = r.axis === 'z' ? { x: Math.sign(r.x - l.x), z: 0 } : { x: 0, z: Math.sign(r.z - l.z) };
    assert.ok(Math.cos(l.heading) * toRoad.x + Math.sin(l.heading) * toRoad.z > 0.99, l.id + ' faces away from its road');
    const across = r.axis === 'z' ? Math.abs(l.x - r.x) : Math.abs(l.z - r.z);
    assert.ok(Math.abs(across - (r.half + 0.8)) < 1e-6, l.id + ' off the verge');
  }
  // Every road has lamps on both sides, roughly every 22.
  for (const r of world.roads) for (const side of [-1, 1]) {
    const mine = street.filter(l => l.road === r.id && Math.sign(r.axis === 'z' ? l.x - r.x : l.z - r.z) === side);
    assert.ok(mine.length >= 8, `${r.id} side ${side}: ${mine.length} lamps`);
    const ts = mine.map(l => (r.axis === 'z' ? l.z : l.x)).sort((a, b) => a - b);
    for (let i = 1; i < ts.length; i++) assert.ok(ts[i] - ts[i - 1] >= 9.9, `${r.id} lamps bunched at ${ts[i]}`);
  }
  const bridge = items.filter(i => i.kind === 'lamp' && i.style === 'bridge');
  assert.equal(bridge.length, world.bridges.filter(b => b.kind === 'road').length * 6);
  for (const l of bridge) assert.ok(l.y > 1.2, 'bridge lamps stand on the parapet');
});

test('spots: seats, doors and stands', () => {
  const byId = new Map(items.map(i => [i.id, i]));
  assert.ok(spots.length >= 70, 'spots ' + spots.length);
  spots.filter(s => s.kind !== 'nest').forEach((s, i) => {
    assert.equal(s.id, 'bench:' + i);
    const it = byId.get(s.item);
    assert.ok(it, s.id + ' has its item');
    assert.equal(it.spot, s.id);
    assert.ok(typeof s.label === 'string' && /的(長椅|棋桌|涼亭)$/.test(s.label), s.label);
    const n = { bench: 3, 'river-bench': 2, 'chess-table': 2, pavilion: 4 }[it.kind];
    assert.equal(s.seats.length, n, s.id + ' seats');
    assert.equal(s.kind, it.kind === 'chess-table' ? 'chess' : 'bench');
    for (const seat of s.seats) {
      assert.deepEqual(Object.keys(seat).sort(), ['heading', 'kind', 'x', 'y', 'z']);
      assert.equal(seat.y, it.kind === 'chess-table' ? 1.15 : 1.4);
      assert.equal(seat.kind, it.kind === 'chess-table' ? 'chess' : 'bench');
    }
    if (it.kind === 'bench' || it.kind === 'river-bench') {
      const gap = it.kind === 'bench' ? 1.5 : 1.6;
      for (let k = 1; k < s.seats.length; k++) assert.ok(Math.abs(Math.hypot(s.seats[k].x - s.seats[k - 1].x, s.seats[k].z - s.seats[k - 1].z) - gap) < 1e-6, s.id);
      for (const seat of s.seats) assert.ok(Math.abs(seat.heading - it.heading) < 1e-6);
    }
    if (it.kind === 'chess-table') for (const seat of s.seats) {
      assert.ok(Math.abs(Math.hypot(seat.x - it.x, seat.z - it.z) - 1.35) < 1e-6, s.id + ' stool distance');
      const facing = Math.cos(seat.heading) * (it.x - seat.x) + Math.sin(seat.heading) * (it.z - seat.z);
      assert.ok(facing > 1.3, s.id + ' stool faces the table');
    }
    // The door has the world's door shape.
    const d = s.door;
    for (const k of ['x', 'z', 'nx', 'nz', 'side', 'pause', 'approach', 'facing']) assert.ok(k in d, s.id + ' door.' + k);
    assert.ok(Math.abs(Math.hypot(d.nx, d.nz) - 1) < 1e-6);
    assert.ok(['n', 's', 'e', 'w'].includes(d.side));
    assert.ok(Math.abs(Math.hypot(d.approach.x - d.x, d.approach.z - d.z) - 1) < 1e-6);
    assert.ok((d.approach.x - d.x) * d.nx + (d.approach.z - d.z) * d.nz > 0.99, s.id + ' approach is outside');
    assert.ok(Math.abs(Math.cos(d.facing) + d.nx) < 1e-6 && Math.abs(Math.sin(d.facing) + d.nz) < 1e-6, s.id + ' facing looks in');
    // The approach is walkable: not in the canal, not on a carriageway, not inside any item.
    assert.ok(Math.abs(d.approach.x) > world.river.halfWidth + 0.5, s.id + ' approach in the canal');
    for (const c of carriageways) assert.ok(!overlaps(pt(d.approach.x, d.approach.z), c), s.id + ' approach on a road');
    for (const other of items) assert.ok(other.kind === 'pavilion' && other.id === it.id || !overlaps(pt(d.approach.x, d.approach.z), other.box), `${s.id} approach inside ${other.id}`);
    assert.ok(Array.isArray(s.stand) && s.stand.length >= 2);
    for (const p of s.stand) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.heading));
  });
  const labels = new Set(spots.filter(s => s.kind !== 'nest').map(s => s.label));
  for (const l of ['徒步街的長椅', '徒步街的棋桌', '河濱步道的長椅', '西岸公園的長椅', '東岸公園的長椅']) assert.ok(labels.has(l), l);
});

test('river benches face the water between the railing and the walking line', () => {
  const rb = items.filter(i => i.kind === 'river-bench');
  assert.ok(rb.length >= 20);
  for (const b of rb) {
    const walk = world.promenades.find(p => Math.sign(p.x) === Math.sign(b.x)).x;
    assert.ok(Math.abs(b.x) > world.river.halfWidth && Math.abs(b.x) < Math.abs(walk), b.id);
    assert.ok(Math.cos(b.heading) * -Math.sign(b.x) > 0.99, b.id + ' faces the water');
    for (const f of world.bridges) assert.ok(Math.abs(b.z - f.z) > f.width / 2 + 4, b.id + ' too near ' + f.id);
  }
});

test('parks: paths from every door, furniture beside them', () => {
  assert.equal(plan.parks.length, world.siteList.filter(s => s.kind === 'park').length);
  for (const park of plan.parks) {
    const site = world.site(park.site);
    const starts = park.paths.map(p => p.points[0]);
    for (const d of site.doors) assert.ok(starts.some(p => p.x === d.x && p.z === d.z), park.site + ' door ' + d.side);
    const near = (x, z) => park.paths.some(p => p.points.some((a, i) => {
      const b = p.points[(i + 1) % p.points.length];
      if (!p.closed && i === p.points.length - 1) return false;
      const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
      return Math.hypot(x - a.x - t * dx, z - a.z - t * dz) < p.width / 2 + 0.6;
    })) || Math.hypot(x - park.plaza.x, z - park.plaza.z) < park.plaza.r;
    for (const s of spots.filter(s => s.kind !== 'nest').filter(s => items.find(i => i.id === s.item).park === park.site)) assert.ok(near(s.door.approach.x, s.door.approach.z), s.id + ' approach off the paths');
    for (const t of items.filter(i => i.kind === 'tree' && i.park === park.site)) assert.ok(!near(t.x, t.z), t.id + ' on a path');
  }
});

test('lights: every lamp and lantern is a LightSource', () => {
  const lights = furnitureLights(plan);
  assert.equal(lights.length, items.filter(i => i.light).length + plan.lanterns.length);
  for (const l of lights) {
    assert.equal(l.group, 'lamps');
    for (const k of ['x', 'y', 'z', 'radius', 'intensity']) assert.ok(Number.isFinite(l[k]), k);
  }
});

test('toWorld follows the model convention (forward +x, width along z)', () => {
  const item = { x: 10, z: 20, heading: Math.PI / 2 };
  const f = toWorld(item, 1, 0), w = toWorld(item, 0, 1);
  assert.ok(Math.abs(f.x - 10) < 1e-9 && Math.abs(f.z - 21) < 1e-9);
  assert.ok(Math.abs(w.x - 9) < 1e-9 && Math.abs(w.z - 20) < 1e-9);
});

test('strays: a nest spot and item in each named park, off paths and clear of doors', () => {
  const plan = planFurniture(world);
  for (const stray of world.config.strays) {
    const spot = plan.spots.find(s => s.id === stray.id);
    assert.ok(spot, stray.id);
    assert.equal(spot.kind, 'nest'); assert.equal(spot.animal, stray.animal); assert.equal(spot.site, stray.site);
    assert.match(spot.label, /的窩$/);
    assert.ok(spot.stand.length >= 2 && spot.door.approach);
    const item = plan.items.find(i => i.id === spot.item);
    assert.equal(item.kind, 'nest'); assert.equal(item.w, 2.2); assert.equal(item.d, 1.6);
    const site = world.site(stray.site);
    if (site.place === 'night-market' || site.place === 'waterfront') {
      if (site.place === 'waterfront') {
        assert.equal(Math.sign(item.x), site.bank);
        assert.ok(item.z > site.area.z0 - 6 && item.z < site.area.z1 + 6, 'alongside the site');
        for (const other of plan.items.filter(o => o.kind === 'nest' && o.site === site.id && o.id !== item.id)) { const d = Math.hypot(other.x - item.x, other.z - item.z); assert.ok(d >= 5 && d <= 8, 'neighbours 5-8 apart'); }
        assert.ok(Math.hypot(item.x - site.door.approach.x, item.z - site.door.approach.z) > 4);
      }
      // On the promenade between the railing and the walking line, near a willow, clear of the stalls.
      const walkX = Math.abs(world.promenades[0].x);
      assert.ok(Math.abs(item.x) > world.river.halfWidth + 1.5 && Math.abs(item.x) < walkX - 1.2);
      assert.ok(plan.items.some(t => t.species === 'willow' && Math.hypot(t.x - item.x, t.z - item.z) < 5), 'near a willow');
      for (const st of world.stalls) assert.ok(!(item.box.x0 < st.plot.x1 && st.plot.x0 < item.box.x1 && item.box.z0 < st.plot.z1 && st.plot.z0 < item.box.z1), 'clear of ' + st.id);
      continue;
    }
    const a = site.area;
    assert.ok(item.x > a.x0 && item.x < a.x1 && item.z > a.z0 && item.z < a.z1);
    const park = plan.parks.find(p => p.site === stray.site);
    for (const p of park.paths) for (const q of p.points) assert.ok(Math.hypot(q.x - item.x, q.z - item.z) > p.width / 2 + 0.8);
    for (const d of site.doors) assert.ok(Math.hypot(d.x - item.x, d.z - item.z) > 4);
    assert.ok(plan.items.some(t => t.kind === 'tree' && Math.hypot(t.x - item.x, t.z - item.z) < 6), 'near a tree');
  }
  assert.deepEqual(planFurniture(world).spots.filter(s => s.kind === 'nest'), plan.spots.filter(s => s.kind === 'nest'));
});

test('clearForStops: nothing overlaps a real bus stop, spots untouched', async () => {
  const { transit } = await import('../../src/core/data.js');
  const { createNetwork } = await import('../../src/core/street/network.js');
  const { createLines } = await import('../../src/core/street/lines.js');
  const { clearForStops } = await import('../../src/core/world/furniture.js');
  const net = createNetwork(world, { spots: plan.spots });
  const lines = createLines(net, world, transit, { pace: 3 });
  // The stops as street.js lists them: the pole a step back from the kerb point.
  const stops = [];
  for (const stop of lines.stops) {
    const kerb = stop.kerb || stop, lane = stop.lane || null;
    let x = kerb.x, z = kerb.z;
    if (lane) { const dx = kerb.x - lane.x, dz = kerb.z - lane.z, l = Math.hypot(dx, dz); if (l > 1e-6) { x += dx / l * 1.2; z += dz / l * 1.2; } }
    if (stops.some(s => Math.hypot(s.x - x, s.z - z) < 3)) continue;
    stops.push({ id: stop.id, x, z, heading: stop.heading || 0, shelter: !!stop.shelter });
  }
  assert.ok(stops.length > 4);
  const cleared = clearForStops(plan, stops);
  assert.equal(cleared.spots, plan.spots);
  assert.ok(cleared.items.length >= plan.items.length - 6 && cleared.items.length <= plan.items.length);
  const inLocal = (st, x, z) => { const c = Math.cos(st.heading), s = Math.sin(st.heading), dx = x - st.x, dz = z - st.z; return [dx * c + dz * s, -dx * s + dz * c]; };
  for (const it of cleared.items) {
    if (it.spot) continue;
    for (const st of stops) {
      const [lx, lz] = inLocal(st, it.x, it.z);
      if (it.kind === 'tree' || it.kind === 'lamp') { assert.ok(Math.hypot(lx, lz) > 0.6, it.id + ' trunk on a pole'); if (st.shelter) assert.ok(!(lx > -10 && lx < -0.1 && lz > -1 && lz < 2.95), it.id + ' trunk in a shelter'); }
      else if (st.shelter) assert.ok(!(lx > -10.5 && lx < 0.6 && lz > -1.5 && lz < 3.6), it.id + ' (' + it.kind + ') beside a shelter');
    }
  }
  // The bike rack at (-58, -102) is out of the shelter.
  const rack = cleared.items.find(i => i.id === 'bike-rack:2');
  if (rack) assert.ok(Math.hypot(rack.x + 58, rack.z + 102) < 20);
});
