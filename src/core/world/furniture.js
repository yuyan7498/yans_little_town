// Street furniture and sitting spots: where every lamp, tree, bench, bin, bollard and
// planter stands, worked out from the world model alone. Pure and deterministic (no
// THREE, no Math.random): the same world always gives the same plan.
//
//   planFurniture(world) → { items, spots, parks, lanterns }
//
// items    [{id, kind, x, z, y, heading, w, d, ...}] — y is the base height; w is the
//          width across the model (local z), d its depth along `heading` (local x);
//          `box` is the footprint's world rectangle (what walkers step round).
// spots    [{id:'bench:<n>', kind:'bench'|'chess', label, x, z, seats, door, stand, item}]
// parks    [{site, paths:[{id, points, width, closed}], plaza, pavilion, pond}] — for the
//          ground renderer (lawns, paths) and for routing walkers to park benches.
// lanterns [{x, z, y, light}] — the promenade lanterns the ground draws in its railing.

import { DOOR } from './geometry.js';
import { unit } from '../random.js';

// ------------------------------------------------------------------ what things measure
// Footprints [w across, d along the heading]; seat tops; how far things keep apart.
export const SIZE = {
  lamp: [0.4, 0.4], tree: [0.6, 0.6], bench: [4.6, 1.1], 'river-bench': [2.8, 1.0], 'chess-table': [3.0, 3.0],
  bin: [0.6, 0.6], bollard: [0.35, 0.35], planter: [1.4, 2.6], 'bike-rack': [4.2, 1.8], vending: [1.2, 0.9],
  mailbox: [1.4, 0.6], hydrant: [0.5, 0.5], pavilion: [7.2, 7.2], nest: [2.2, 1.6]
};
export const SEAT = { bench: 1.4, riverBench: 1.4, chess: 1.15, pavilion: 1.4, spacing: 1.5, riverSpacing: 0.8, chessOut: 1.35 };

// Street lamps: on the verge this far from the kerb, about `spacing` apart, the arm
// reaching `arm` toward the road with the head at `headY` above the pavement.
export const LAMP = { verge: 0.8, spacing: 22, cornerClear: 8, arm: 1.8, headY: 8.6, radius: 10, trunkRadius: 12, color: '#ffd9a6' };
// Street trees between the lamps, on the same verge line.
export const TREE = { pitch: 8, lampClear: 3.5, cornerClear: 5 };
// The middle of every long kerb run stays clear for a bus stop: trees ±`trees`,
// lamps ±`lamps`, on runs longer than `minRun`.
export const BUS_GAP = { minRun: 44, trees: 9, lamps: 5 };

// The promenade, measured from the canal edge outwards: the railing, the lanterns
// set in it every `lanternEvery`, the river benches and willows.
export const PROMENADE = { rail: 0.35, lanternEvery: 12, lanternY: 4.4, lanternRadius: 8, lanternColor: '#ffcf8a', bench: 3.6, willow: 2.4 };
// Road bridges: parapet height and end posts; lamps stand on pilasters that jut out.
export const BRIDGE = { parapet: 1.1, parapetThick: 0.35, end: 17, lampX: [-10, 0, 10], pilasterOut: 0.45, lampRadius: 10 };
// Parks: path width, the loop's inset from the lot edge, the central plaza, the walk
// round it, the pavilion.
export const PARK = { path: 2.8, loopInset: 9, plaza: 7.2, ring: 5.4, pavilion: 3.4, twist: 0.42, lampY: 4.6, lampRadius: 8 };
// The strays' names, for the label of their nest (data/town.js `strays` says where).
export const NEST_NAMES = { cat: '橘子', dog: '黑輪' };
// Spot doors: a step in front of the seats, the approach `out` further.
export const SPOT_DOOR = { step: 0.7, out: 1.0 };

const EPS = 1e-6;
const TAU = Math.PI * 2;
const clean = v => (Math.abs(v) < 1e-9 ? 0 : Math.round(v * 1e9) / 1e9);
const normHeading = h => { let a = h % TAU; if (a > Math.PI) a -= TAU; if (a <= -Math.PI) a += TAU; return clean(a); };

// ------------------------------------------------------------------ rectangles
const rect = (x0, x1, z0, z1) => ({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) });
const grow = (r, g) => ({ x0: r.x0 - g, x1: r.x1 + g, z0: r.z0 - g, z1: r.z1 + g });
const overlaps = (a, b, gap = 0) => a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.z0 < b.z1 + gap && b.z0 < a.z1 + gap;
const rectDistance = (a, b) => Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.z0 - b.z1, b.z0 - a.z1));
const pointRect = (x, z) => ({ x0: x, x1: x, z0: z, z1: z });

// The world rectangle round a footprint w (across) × d (along heading).
export function footprintBox(x, z, w, d, heading) {
  const c = Math.abs(Math.cos(heading)), s = Math.abs(Math.sin(heading));
  const ex = c * d / 2 + s * w / 2, ez = s * d / 2 + c * w / 2;
  return { x0: x - ex, x1: x + ex, z0: z - ez, z1: z + ez };
}
// A point given in an item's own frame (lx forward, lz across) → world.
export function toWorld(item, lx, lz) {
  const c = Math.cos(item.heading), s = Math.sin(item.heading);
  return { x: item.x + lx * c - lz * s, z: item.z + lx * s + lz * c };
}

// A footprint's corners, edge midpoints and centre.
export function outlineOf(x, z, w, d, heading) {
  const c = Math.cos(heading), s = Math.sin(heading), out = [];
  for (const [lx, lz] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const px = lx * d / 2, pz = lz * w / 2;
    out.push({ x: x + px * c - pz * s, z: z + px * s + pz * c });
  }
  return out;
}

// Distance from a point to a polyline.
function polylineDistance(x, z, points, closed = false) {
  let best = Infinity;
  const n = points.length, last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = points[i], b = points[(i + 1) % n];
    const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2)) : 0;
    best = Math.min(best, Math.hypot(x - a.x - t * dx, z - a.z - t * dz));
  }
  return best;
}

// ------------------------------------------------------------------ the street scene
// Everything a piece of furniture must keep clear of, from the world model.
export function streetScene(world) {
  const R = world.river, bankX = R.halfWidth;
  const stripEdge = Math.max(...R.banks.map(b => Math.abs(b.side > 0 ? b.strip.x1 : b.strip.x0)));
  const pavement = world.config.pavement;
  const roadOf = id => world.roadById.get(id);

  // Carriageways: every stretch that carries vehicles (tunnel lids are pavement).
  const carriageways = [];
  for (const s of world.segments) {
    if (!s.vehicles) continue;
    const road = roadOf(s.road);
    if (s.axis === 'z') { carriageways.push(rect(road.x - road.half, road.x + road.half, s.z0, s.z1)); continue; }
    const tunnel = world.tunnels.find(t => t.street === road.id);
    const pieces = tunnel ? clipOut([s.x0, s.x1], -tunnel.coverX, tunnel.coverX) : [[s.x0, s.x1]];
    for (const [a, b] of pieces) carriageways.push(rect(a, b, road.z - road.half, road.z + road.half));
  }
  const zebras = [...world.junctions.flatMap(j => j.zebras), ...world.crossings.map(c => c.zebra)].map(z => rect(z.x0, z.x1, z.z0, z.z1));
  const corners = [...world.junctions.flatMap(j => j.corners), ...world.crossings.flatMap(c => c.corners)].map(c => ({ x: c.x, z: c.z }));

  // Walking lines: both pavements of every segment, the promenades, the footbridges.
  const walkLines = [];
  for (const s of world.segments) {
    if (s.over === 'tunnel') continue;
    const road = roadOf(s.road), off = road.lanesAt.walk;
    for (const sgn of [-1, 1]) {
      walkLines.push(s.axis === 'x' ? { axis: 'x', at: road.z + sgn * off, from: s.x0, to: s.x1, road: road.id }
        : { axis: 'z', at: road.x + sgn * off, from: s.z0, to: s.z1, road: road.id });
    }
  }
  for (const p of world.promenades) walkLines.push({ axis: 'z', at: p.x, from: p.from, to: p.to, promenade: true });
  const walkX = Math.abs(world.promenades[0].x);
  for (const b of world.bridges) if (b.kind === 'foot') walkLines.push({ axis: 'x', at: b.z, from: -walkX, to: walkX, footbridge: true });
  // Our own extra rule: keep the middle of a pedestrian street open as well.
  const softLines = world.segments.filter(s => s.pedestrian).map(s => ({ axis: 'x', at: roadOf(s.road).z, from: s.x0, to: s.x1 }));
  const lineRect = l => (l.axis === 'x' ? rect(l.from, l.to, l.at, l.at) : rect(l.at, l.at, l.from, l.to));

  // Doors: each one keeps a corridor clear from the door out to the walking line.
  const doors = [];
  const addDoor = (d, half, owner) => {
    if (!d) return;
    const along = d.nx ? 'x' : 'z';
    let reach = DOOR.approach + 2.5;
    for (const l of walkLines) {
      if (l.axis === along) continue;                    // parallel to the normal
      const t = along === 'x' ? (l.at - d.x) * d.nx : (l.at - d.z) * d.nz;
      const cover = along === 'x' ? d.z : d.x;
      if (t > 0 && t < 30 && cover >= l.from - 1 && cover <= l.to + 1) reach = Math.min(reach, t + 0.8);
    }
    const corridor = d.nx ? rect(d.x, d.x + d.nx * reach, d.z - half, d.z + half) : rect(d.x - half, d.x + half, d.z, d.z + d.nz * reach);
    doors.push({ door: d, corridor, owner });
  };
  for (const site of world.siteList) {
    if (site.place === 'night-market') continue;
    for (const d of site.doors || []) addDoor(d, d.gate ? 3.5 : site.open_air ? 3 : 2.5, site.id);
    if (site.entrance) addDoor(site.entrance, 2.5, site.id);
  }
  for (const st of world.stalls) addDoor(st.door, 1.6, st.id);

  // Ground nobody else may have: lots other than parks, waterfront sites, stalls.
  const solids = [];
  for (const lot of world.lots) {
    const site = lot.site && world.site(lot.site);
    if (site && site.kind === 'park') continue;
    solids.push(rect(lot.x0, lot.x1, lot.z0, lot.z1));
  }
  for (const site of world.siteList) if (site.place === 'waterfront') solids.push(rect(site.area.x0, site.area.x1, site.area.z0, site.area.z1));
  for (const st of world.stalls) solids.push(grow(rect(st.plot.x0, st.plot.x1, st.plot.z0, st.plot.z1), 0.3));
  const stallStands = world.stalls.flatMap(st => st.stand.concat(st.seats));

  return { world, bankX, stripEdge, walkX, pavement, carriageways, zebras, corners, walkLines, softLines, lineRect, doors, solids, stallStands };
}

// [a, b] with (lo, hi) taken out.
function clipOut([a, b], lo, hi) {
  if (hi <= a || lo >= b) return [[a, b]];
  const out = [];
  if (lo > a) out.push([a, lo]);
  if (hi < b) out.push([hi, b]);
  return out;
}

// ------------------------------------------------------------------ the planner
export function planFurniture(world, { debug = false } = {}) {
  const S = streetScene(world);
  const items = [], spots = [], parks = [], lanterns = [];
  const counters = {};
  const board = world.board;

  // Can a footprint stand here? `o` relaxes rules for the things that need it.
  // What stops a footprint standing here (null: nothing). `o` relaxes rules for the
  // things that need it; `outline` is the footprint's corners and edge midpoints.
  function blocker(box, x, z, o, outline) {
    if (box.x0 < board.minX + 0.4 || box.x1 > board.maxX - 0.4 || box.z0 < board.minZ + 0.4 || box.z1 > board.maxZ - 0.4) return 'board';
    if (!o.bridge && box.x0 < S.bankX + 0.9 && box.x1 > -S.bankX - 0.9) return 'canal';
    for (const c of S.carriageways) if (overlaps(box, c, 0.05)) return 'carriageway';
    for (const zb of S.zebras) if (overlaps(box, zb, 0.6)) return 'zebra';
    for (const l of S.walkLines) {
      const r = S.lineRect(l);
      if (rectDistance(pointRect(x, z), r) < 1.2 - EPS || rectDistance(box, r) < 0.8 - EPS) return 'walk line';
    }
    if (!o.soft) for (const l of S.softLines) if (rectDistance(box, S.lineRect(l)) < 1.2) return 'pedestrian middle';
    for (const d of S.doors) {
      if (overlaps(box, d.corridor, 0.05)) return 'door corridor ' + d.owner;
      if (rectDistance(box, pointRect(d.door.approach.x, d.door.approach.z)) < 1.0) return 'door approach ' + d.owner;
    }
    for (const s of S.solids) if (overlaps(box, s, 0.05)) return 'lot';
    for (const p of S.stallStands) if (rectDistance(box, pointRect(p.x, p.z)) < 1.2) return 'stall';
    const clear = o.cornerClear ?? 3;
    for (const c of S.corners) if (Math.hypot(c.x - x, c.z - z) < clear) return 'corner';
    for (const it of items) if (overlaps(box, it.box, o.gap ?? 0.25)) return 'item ' + it.id;
    for (const sp of spots) {
      if (rectDistance(box, pointRect(sp.door.approach.x, sp.door.approach.z)) < 0.9) return 'spot approach ' + sp.id;
      if (rectDistance(box, pointRect(sp.door.x, sp.door.z)) < 0.5) return 'spot door ' + sp.id;
    }
    for (const keep of keepOut) if (keep.test(x, z, outline)) return keep.name;
    return null;
  }
  const rejected = [];
  function fits(box, x, z, o = {}, outline = [{ x, z }], kind = '?') {
    const why = blocker(box, x, z, o, outline);
    if (why && debug) rejected.push({ kind, x, z, why });
    return !why;
  }
  const keepOut = [];   // extra no-go zones (park paths, ponds, plazas): {name, test(x, z, outline)}

  function make(kind, x, z, heading, extra = {}) {
    const [w, d] = extra.footprint || SIZE[kind];
    const h = normHeading(heading);
    const n = counters[kind] = (counters[kind] || 0) + 1;
    const item = { id: kind + ':' + (n - 1), kind, x: clean(x), z: clean(z), y: extra.y ?? world.heightAt(x, z, 'foot'), heading: h, w, d };
    for (const [k, v] of Object.entries(extra)) if (k !== 'footprint' && k !== 'y' && k !== 'rules') item[k] = v;
    item.box = footprintBox(item.x, item.z, w, d, h);
    return item;
  }
  // Place it if it fits; returns the item or null.
  function tryPlace(kind, x, z, heading, extra = {}) {
    const [w, d] = extra.footprint || SIZE[kind];
    const rules = extra.rules || {}, pad = rules.pad || 0;
    const box = footprintBox(x, z, w + 2 * pad, d + 2 * pad, heading);
    if (!fits(box, x, z, rules, outlineOf(x, z, w + 2 * pad, d + 2 * pad, heading), kind)) return null;
    const item = make(kind, x, z, heading, extra);
    items.push(item);
    return item;
  }

  function lampLight(item, headY, radius, arm, color = LAMP.color) {
    const p = toWorld(item, arm, 0);
    item.light = { x: clean(p.x), z: clean(p.z), y: clean(item.y + headY), radius, color };
    return item;
  }

  // ---------------------------------------------------------------- spots
  function spotDoor(item, forward) {
    const nx = clean(Math.cos(item.heading)), nz = clean(Math.sin(item.heading));
    const px = item.x + nx * forward, pz = item.z + nz * forward;
    const side = Math.abs(nz) >= Math.abs(nx) ? (nz < 0 ? 'n' : 's') : (nx < 0 ? 'w' : 'e');
    return { x: clean(px), z: clean(pz), nx, nz, side, pause: DOOR.openPause, approach: { x: clean(px + nx * SPOT_DOOR.out), z: clean(pz + nz * SPOT_DOOR.out) },
      facing: normHeading(Math.atan2(-nz, -nx)), alongX: Math.abs(nz) >= Math.abs(nx) };
  }
  function addSpot(item, kind, label, seats, door, stand) {
    const spot = { id: 'bench:' + spots.filter(s => s.kind !== 'nest').length, kind, label, x: item.x, z: item.z, seats, door, stand, item: item.id };
    item.spot = spot.id;
    spots.push(spot);
    return spot;
  }
  // A bench (or river bench) seating people side by side, facing its heading.
  function benchSpot(item, label, offsets, y) {
    const seats = offsets.map(lz => { const p = toWorld(item, 0.05, lz); return { x: clean(p.x), z: clean(p.z), heading: item.heading, y, kind: 'bench' }; });
    const door = spotDoor(item, item.d / 2 + SPOT_DOOR.step);
    const back = normHeading(item.heading + Math.PI);
    const reach = Math.max(...offsets.map(Math.abs));
    const stand = [-1, 1].map(s => { const p = toWorld(item, item.d / 2 + 1.25, s * (reach + 0.4)); return { x: clean(p.x), z: clean(p.z), heading: back }; });
    return addSpot(item, 'bench', label, seats, door, stand);
  }
  function chessSpot(item, label) {
    const a = SEAT.chessOut / Math.SQRT2;
    const seats = [[a, a], [-a, -a]].map(([lx, lz]) => { const p = toWorld(item, lx, lz); return { x: clean(p.x), z: clean(p.z), heading: normHeading(Math.atan2(item.z - p.z, item.x - p.x)), y: SEAT.chess, kind: 'chess' }; });
    const stand = [[a + 0.5, -a - 0.5], [-a - 0.5, a + 0.5]].map(([lx, lz]) => { const p = toWorld(item, lx, lz); return { x: clean(p.x), z: clean(p.z), heading: normHeading(Math.atan2(item.z - p.z, item.x - p.x)) }; });
    return addSpot(item, 'chess', label, seats, spotDoor(item, item.d / 2 + SPOT_DOOR.step), stand);
  }

  // ---------------------------------------------------------------- 1. bridges: lamps on the parapets
  for (const b of world.bridges) {
    if (b.kind !== 'road') continue;
    for (const side of [-1, 1]) for (const bx of BRIDGE.lampX) {
      const z = b.z + side * (b.width / 2 + BRIDGE.pilasterOut);
      const y = world.heightAt(bx, b.z + side * (b.width / 2 - 0.5), 'foot') + BRIDGE.parapet;
      const it = make('lamp', bx, z, side > 0 ? -Math.PI / 2 : Math.PI / 2, { y, style: 'bridge', bridge: b.id });
      items.push(lampLight(it, LAMP.headY, BRIDGE.lampRadius, LAMP.arm));
    }
  }

  // ---------------------------------------------------------------- 2. the pedestrian street
  const pedSegments = world.segments.filter(s => s.pedestrian);
  for (const seg of pedSegments) {
    const road = world.roadById.get(seg.road);
    const sign = Math.sign(seg.x0 + seg.x1);
    // The paved corridor between the market strip and the avenue's pavement.
    const avenue = world.avenues.reduce((best, a) => (Math.abs(a.x - (sign > 0 ? seg.x1 : seg.x0)) < Math.abs(best.x - (sign > 0 ? seg.x1 : seg.x0)) ? a : best));
    const inner = sign * S.stripEdge, outer = avenue.x - sign * (avenue.half + S.pavement);
    const xa = Math.min(inner, outer), xb = Math.max(inner, outer);
    const z0 = road.z, row = 3.6;
    // Gateways: bollards along the avenue's kerb, planters flanking the way in.
    const kerbX = avenue.x - sign * (avenue.half + 0.7);
    for (const dz of [-4.6, -2.9, -1.2, 1.2, 2.9, 4.6]) tryPlace('bollard', kerbX, z0 + dz, 0, { rules: { soft: true, cornerClear: 1.5 } });
    for (const gx of [outer - sign * 1.6, inner + sign * 1.6]) for (const sz of [-1, 1]) {
      tryPlace('planter', gx, z0 + sz * row, 0, { style: 'gateway' });
      if (gx === outer - sign * 1.6) tryPlace('bin', gx, z0 + sz * (row + 1.6), 0);
    }
    // Free stretches between the doors' corridors, each filled with modules of a tree
    // in its planter and a bench (every third one a chess table), mirrored across.
    const cuts = S.doors.filter(d => Math.abs(d.door.x - (xa + xb) / 2) < (xb - xa) / 2 && Math.abs(d.door.z - z0) < road.half + S.pavement + 4 && !d.door.nx)
      .map(d => [d.door.x - 3.0, d.door.x + 3.0]);
    let free = [[xa + 3.0, xb - 3.0]];
    for (const [a, b] of cuts) free = free.flatMap(iv => clipOut(iv, a, b));
    const TREE_W = 1.6, BENCH_W = SIZE.bench[0], GAP = 0.7;
    let module = 0;
    for (const [a, b] of free) {
      const L = b - a;
      if (L < TREE_W) continue;
      // As many benches as fit with a tree between each two; trees at both ends if
      // there is room for both — all centred in the stretch.
      let benches = 0;
      while ((benches + 1) * BENCH_W + benches * (TREE_W + 2 * GAP) <= L) benches++;
      const core = benches ? benches * BENCH_W + (benches - 1) * (TREE_W + 2 * GAP) : 0;
      const ends = !benches || L - core >= 2 * (TREE_W + GAP);
      const total = core + (ends ? (benches ? 2 * (TREE_W + GAP) : TREE_W) : 0);
      let x = a + (L - total) / 2;
      const slots = [];
      const tree = () => { slots.push({ type: 'tree', x: x + TREE_W / 2 }); x += TREE_W + GAP; };
      if (ends) tree();
      for (let i = 0; i < benches; i++) {
        if (i) tree();
        slots.push({ type: 'bench', x: x + BENCH_W / 2, n: module++ }); x += BENCH_W + GAP;
      }
      if (ends && benches) tree();
      for (const sz of [-1, 1]) {
        const z = z0 + sz * row, out = sz < 0 ? -Math.PI / 2 : Math.PI / 2;
        for (const s of slots) {
          if (s.type === 'tree') {
            const key = 'ped:' + s.x.toFixed(1) + ':' + sz;
            tryPlace('tree', s.x, z, unit(key + ':h') * TAU, { species: 'bauhinia', size: Math.round((0.85 + 0.25 * unit(key)) * 100) / 100, base: 'planter', footprint: [TREE_W, TREE_W] });
          } else if ((s.n + (sz > 0 ? 1 : 0)) % 3 === 2) {
            const it = tryPlace('chess-table', s.x, z - sz * 0.4, out);
            if (it) chessSpot(it, '徒步街的棋桌');
          } else {
            const it = tryPlace('bench', s.x, z, out, { style: 'pedestrian' });
            if (it) benchSpot(it, '徒步街的長椅', [-SEAT.spacing, 0, SEAT.spacing], SEAT.bench);
          }
        }
        // A lamp at each end of the stretch, between the rows and the shopfronts.
        for (const lx of [a + 0.3, b - 0.3]) {
          const it = tryPlace('lamp', lx, z0 + sz * 5.6, sz < 0 ? Math.PI / 2 : -Math.PI / 2, { style: 'pedestrian' });
          if (it) lampLight(it, 5.2, 8, 0);
        }
      }
    }
  }

  // ---------------------------------------------------------------- 3. the promenades
  const roadBridges = world.bridges.filter(b => b.kind === 'road'), footBridges = world.bridges.filter(b => b.kind === 'foot');
  const ringStreets = world.tunnels.map(t => world.roadById.get(t.street));
  const promenadeClear = z => roadBridges.every(b => Math.abs(z - b.z) >= b.width / 2 + 8) && footBridges.every(b => Math.abs(z - b.z) >= b.width / 2 + 6) &&
    ringStreets.every(r => Math.abs(z - r.z) >= r.half + 10) && pedSegments.every(s => Math.abs(z - world.roadById.get(s.road).z) >= 16);
  for (const p of world.promenades) {
    const side = p.side, edge = side * S.bankX;
    const n = Math.floor((p.to - p.from) / PROMENADE.lanternEvery);
    const z0 = -Math.floor(n / 2) * PROMENADE.lanternEvery;
    for (let k = 0; k <= n; k++) {
      const z = z0 + k * PROMENADE.lanternEvery - PROMENADE.lanternEvery / 2;
      if (z < p.from || z > p.to) continue;
      if (roadBridges.some(b => Math.abs(z - b.z) < b.width / 2 + 3) || footBridges.some(b => Math.abs(z - b.z) < b.width / 2 + 2)) continue;
      const x = edge + side * PROMENADE.rail;
      lanterns.push({ x, z, y: world.heightAt(x, z, 'foot'), light: { x, z, y: clean(world.heightAt(x, z, 'foot') + PROMENADE.lanternY), radius: PROMENADE.lanternRadius, color: PROMENADE.lanternColor } });
    }
    for (let k = 0; k <= n; k++) {
      const z = z0 + k * PROMENADE.lanternEvery;
      if (z < p.from + 4 || z > p.to - 4 || !promenadeClear(z)) continue;
      const pick = ((k % 3) + 3) % 3;
      if (pick === 0) tryPlace('tree', edge + side * PROMENADE.willow, z, unit('willow:' + side + ':' + z) * TAU, { species: 'willow', size: Math.round((0.9 + 0.25 * unit('w' + z + side)) * 100) / 100, base: 'lawn' });
      else {
        const it = tryPlace('river-bench', edge + side * PROMENADE.bench, z, side < 0 ? 0 : Math.PI, { style: 'river' });
        if (it) {
          benchSpot(it, '河濱步道的長椅', [-SEAT.riverSpacing, SEAT.riverSpacing], SEAT.riverBench);
          if (pick === 1) tryPlace('bin', edge + side * (PROMENADE.bench + 0.3), z + 2.4, 0);
        }
      }
    }
  }

  // ---------------------------------------------------------------- 4. the parks
  for (const site of world.siteList) if (site.kind === 'park') parks.push(planPark(site));

  function planPark(site) {
    const a = site.area, cx = a.x, cz = a.z;
    const rx = a.w / 2 - PARK.loopInset, rz = a.d / 2 - PARK.loopInset;
    const paths = [];
    // The loop: an ellipse whose points include the four axis points (where the spokes cross).
    const N = 48, loop = [];
    for (let i = 0; i < N; i++) { const t = i / N * TAU; loop.push({ x: clean(cx + rx * Math.cos(t)), z: clean(cz + rz * Math.sin(t)) }); }
    paths.push({ id: site.id + ':loop', points: loop, width: PARK.path, closed: true });
    // The ring round the plaza and the spokes: door → loop → a curve into the plaza.
    const ringN = 32, ring = [];
    const spokeEnds = [];
    for (const d of site.doors) {
      const ang = Math.atan2(d.z - cz, d.x - cx);
      const loopPt = { x: clean(cx + rx * Math.cos(ang)), z: clean(cz + rz * Math.sin(ang)) };
      const endAng = ang + PARK.twist;
      spokeEnds.push(endAng);
      const end = { x: clean(cx + PARK.ring * Math.cos(endAng)), z: clean(cz + PARK.ring * Math.sin(endAng)) };
      const r0 = Math.hypot(loopPt.x - cx, loopPt.z - cz), mid = (r0 + PARK.ring) / 2;
      const ctl = { x: cx + mid * Math.cos(ang), z: cz + mid * Math.sin(ang) };
      const curve = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10, u = 1 - t;
        curve.push(i === 0 ? loopPt : i === 10 ? end : { x: clean(u * u * loopPt.x + 2 * u * t * ctl.x + t * t * end.x), z: clean(u * u * loopPt.z + 2 * u * t * ctl.z + t * t * end.z) });
      }
      paths.push({ id: site.id + ':gate-' + d.side, points: [{ x: d.x, z: d.z }, loopPt], width: PARK.path });
      paths.push({ id: site.id + ':spoke-' + d.side, points: curve, width: PARK.path });
    }
    const ringAngles = [...Array(ringN).keys()].map(i => i / ringN * TAU).concat(spokeEnds.map(e => ((e % TAU) + TAU) % TAU)).sort((p, q) => p - q);
    for (const t of ringAngles) ring.push({ x: clean(cx + PARK.ring * Math.cos(t)), z: clean(cz + PARK.ring * Math.sin(t)) });
    paths.push({ id: site.id + ':ring', points: ring, width: 1.6, closed: true });
    // A pond in the corner farthest from the town's middle; the pavilion faces south.
    const qx = cx > 0 ? 1 : -1, qz = cz > 0 ? 1 : -1;
    const pond = { x: clean(cx + qx * (a.w / 2 - 8.5)), z: clean(cz + qz * (a.d / 2 - 8.8)), rx: 5.2, rz: 4.2, y: 0.15 - 0.4 };
    const plaza = { x: cx, z: cz, r: PARK.plaza };
    const pavilion = { x: cx, z: cz, r: PARK.pavilion, heading: Math.PI / 2 };
    const park = { site: site.id, name: site.name, area: { ...a }, paths, plaza, pavilion, pond };

    // Keep trees and the rest off the paths, the plaza and the pond.
    keepOut.push({ name: 'park ground', test: (x, z, outline) => {
      if (x < a.x0 - 3 || x > a.x1 + 3 || z < a.z0 - 3 || z > a.z1 + 3) return false;
      return outline.some(p => Math.hypot(p.x - cx, p.z - cz) < PARK.plaza + 0.3 ||
        ((p.x - pond.x) / (pond.rx + 1)) ** 2 + ((p.z - pond.z) / (pond.rz + 1)) ** 2 < 1 ||
        paths.some(q => polylineDistance(p.x, p.z, q.points, q.closed) < q.width / 2 + 0.3));
    } });

    // The pavilion, its built-in bench and the benches round the plaza.
    const pav = make('pavilion', cx, cz, pavilion.heading, { style: 'park', park: site.id });
    items.push(pav);
    const pavSeats = [0, 1, 2, 3].map(k => {
      const ang = pavilion.heading + Math.PI / 4 + k * Math.PI / 2;
      const p = { x: cx + 2.35 * Math.cos(ang), z: cz + 2.35 * Math.sin(ang) };
      return { x: clean(p.x), z: clean(p.z), heading: normHeading(ang + Math.PI), y: SEAT.pavilion, kind: 'bench' };
    });
    const pavStand = [-1, 1].map(s => { const p = toWorld(pav, PARK.pavilion + 0.6, s * 1.6); return { x: clean(p.x), z: clean(p.z), heading: normHeading(pav.heading + Math.PI) }; });
    addSpot(pav, 'bench', site.name + '的涼亭', pavSeats, spotDoor(pav, PARK.pavilion + 0.2), pavStand);
    for (const e of spokeEnds) {
      const ang = e + Math.PI / 4;
      const r = PARK.plaza + 0.45;
      const it = make('bench', cx + r * Math.cos(ang), cz + r * Math.sin(ang), ang + Math.PI, { style: 'park', park: site.id });
      items.push(it);
      benchSpot(it, site.name + '的長椅', [-SEAT.spacing, 0, SEAT.spacing], SEAT.bench);
    }
    // Benches outside the loop, facing it; a bin beside every other one; lamps on the loop.
    const loopPoint = t => ({ x: cx + rx * Math.cos(t), z: cz + rz * Math.sin(t) });
    const loopNormal = t => { const nx = Math.cos(t) / rx, nz = Math.sin(t) / rz, L = Math.hypot(nx, nz); return { x: nx / L, z: nz / L }; };
    let nb = 0;
    for (let q = 0; q < 4; q++) for (const dt of [-0.3, 0.3]) {
      const t = Math.PI / 4 + q * Math.PI / 2 + dt, p = loopPoint(t), n = loopNormal(t);
      const off = PARK.path / 2 + 0.3 + SIZE.bench[1] / 2;
      const it = tryPlace('bench', p.x + n.x * off, p.z + n.z * off, Math.atan2(-n.z, -n.x), { style: 'park', park: site.id, rules: { gap: 0.4 } });
      if (!it) continue;
      benchSpot(it, site.name + '的長椅', [-SEAT.spacing, 0, SEAT.spacing], SEAT.bench);
      if (nb++ % 2 === 0) { const b = toWorld(it, 0, (dt > 0 ? 1 : -1) * 3.0); tryPlace('bin', b.x, b.z, it.heading); }
    }
    for (let q = 0; q < 4; q++) {
      const t = q * Math.PI / 2 + Math.PI / 4, p = loopPoint(t), n = loopNormal(t);
      const off = -(PARK.path / 2 + 0.7);
      const it = tryPlace('lamp', p.x + n.x * off, p.z + n.z * off, Math.atan2(n.z, n.x), { style: 'park', park: site.id });
      if (it) lampLight(it, PARK.lampY, PARK.lampRadius, 0);
    }
    for (const d of site.doors) {
      const ang = Math.atan2(d.z - cz, d.x - cx), inX = -Math.cos(ang), inZ = -Math.sin(ang);
      for (const s of [-1, 1]) {
        const x = d.x + inX * 3.2 - inZ * s * (PARK.path / 2 + 0.8), z = d.z + inZ * 3.2 + inX * s * (PARK.path / 2 + 0.8);
        if (s > 0) { const it = tryPlace('lamp', x, z, ang + Math.PI, { style: 'park', park: site.id }); if (it) lampLight(it, PARK.lampY, PARK.lampRadius, 0); }
      }
    }
    // A chess table on the lawn by the plaza.
    {
      const ang = spokeEnds[0] - Math.PI / 4 + Math.PI;
      const r = PARK.plaza + 4.2;
      const it = tryPlace('chess-table', cx + r * Math.cos(ang), cz + r * Math.sin(ang), ang + Math.PI, { style: 'park', park: site.id });
      if (it) chessSpot(it, site.name + '的棋桌');
    }
    // Trees: a jittered grid, thinned, with species by quarter.
    const species = ['camphor', 'banyan', 'flame', 'bauhinia'];
    const step = 5.2;
    for (let gx = a.x0 + 2.2; gx <= a.x1 - 2.2; gx += step) for (let gz = a.z0 + 2.2; gz <= a.z1 - 2.2; gz += step) {
      const key = site.id + ':' + gx.toFixed(1) + ',' + gz.toFixed(1);
      if (unit(key + ':keep') < 0.18) continue;
      const x = Math.min(a.x1 - 1.6, Math.max(a.x0 + 1.6, gx + (unit(key + ':x') - 0.5) * 2.6));
      const z = Math.min(a.z1 - 1.6, Math.max(a.z0 + 1.6, gz + (unit(key + ':z') - 0.5) * 2.6));
      const quarter = (x > cx ? 1 : 0) + (z > cz ? 2 : 0);
      const nearPond = Math.hypot(x - pond.x, z - pond.z) < 10;
      const sp = nearPond ? 'willow' : unit(key + ':sp') < 0.7 ? species[quarter] : species[Math.floor(unit(key + ':sp2') * species.length)];
      tryPlace('tree', x, z, unit(key + ':h') * TAU, { species: sp, size: Math.round((0.8 + 0.45 * unit(key + ':s')) * 100) / 100, base: 'lawn', park: site.id, rules: { gap: 1.2, pad: 0.9 } });
    }
    for (const stray of (world.config.strays || [])) if (stray.site === site.id) planNest(stray, site, park);
    return park;
  }

  // A nest beside a promenade willow, between the railing and the walking line, facing the
  // walkers. For the night market: near the middle of the stall rows. For a waterfront site
  // (the town office): on its bank, alongside its z-span. A second stray on the same site
  // goes 5-8 units from the first, so the two read as neighbours.
  function planPromenadeNest(stray, site) {
    const waterfront = site.place === 'waterfront';
    const mid = waterfront ? site.area.z : 0, half = waterfront ? site.area.d / 2 + 6 : Infinity;
    const willows = items.filter(it => it.kind === 'tree' && it.species === 'willow' && !it.park && Math.abs(it.x) < S.walkX && Math.abs(it.x) > S.bankX &&
      (!waterfront || (Math.sign(it.x) === site.bank && Math.abs(it.z - mid) <= half)))
      .sort((p, q) => Math.abs(p.z - mid) - Math.abs(q.z - mid) || p.x - q.x);
    const mates = items.filter(it => it.kind === 'nest' && it.site === site.id);
    let placed = null;
    for (const tree of willows) {
      const side = Math.sign(tree.x), heading = side > 0 ? 0 : Math.PI;
      for (const dz of [2.8, -2.8, 3.6, -3.6, 4.6, -4.6, 5.6, -5.6, 6.6, -6.6, 7.6, -7.6]) {
        const x = side * (S.bankX + PROMENADE.rail + 2.05), z = tree.z + dz;
        if (mates.length && !mates.every(m => { const d = Math.hypot(m.x - x, m.z - z); return d >= 5 && d <= 8; })) continue;
        const box = footprintBox(x, z, SIZE.nest[0] + 1.2, SIZE.nest[1] + 1.2, heading);
        if (!fits(box, x, z, { gap: 0.4 }, outlineOf(x, z, SIZE.nest[0] + 1.2, SIZE.nest[1] + 1.2, heading), 'nest')) continue;
        placed = { x, z, heading };
        break;
      }
      if (placed) break;
    }
    if (placed) makeNest(stray, site, placed);
  }

  // A stray's nest: a quiet corner of the park, in a tree's shade, off the paths, a short
  // walk across the lawn from one, facing it. Chosen by score so it is deterministic.
  function planNest(stray, site, park) {
    const trees = items.filter(it => it.kind === 'tree' && it.park === site.id);
    const doors = site.doors || [];
    let best = null;
    for (const tree of trees) for (let k = 0; k < 24; k++) {
      const ang = (k % 8) / 8 * TAU + unit(stray.id + ':' + tree.id) * 0.5, r = 2.4 + Math.floor(k / 8) * 1.2;
      const x = tree.x + r * Math.cos(ang), z = tree.z + r * Math.sin(ang);
      let near = null, nd = Infinity;
      for (const p of park.paths) for (const q of p.points) { const d = Math.hypot(q.x - x, q.z - z); if (d < nd) { nd = d; near = q; } }
      if (nd < 2.6 || nd > 11) continue;
      const quiet = Math.min(...doors.map(d => Math.hypot(d.x - x, d.z - z)), 99);
      const score = quiet + unit(stray.id + ':' + tree.id + ':' + k) * 2;
      if (best && score <= best.score) continue;
      const heading = Math.atan2(near.z - z, near.x - x);
      const box = footprintBox(x, z, SIZE.nest[0] + 1.2, SIZE.nest[1] + 1.2, heading);
      const a = park.area;
      if (box.x0 < a.x0 + 1 || box.x1 > a.x1 - 1 || box.z0 < a.z0 + 1 || box.z1 > a.z1 - 1) continue;
      if (!fits(box, x, z, { gap: 0.4 }, outlineOf(x, z, SIZE.nest[0] + 1.2, SIZE.nest[1] + 1.2, heading), 'nest')) continue;
      best = { score, x, z, heading };
    }
    if (!best) return;
    makeNest(stray, site, best);
  }

  function makeNest(stray, site, best) {
    const item = make('nest', best.x, best.z, best.heading, { animal: stray.animal, site: site.id });
    items.push(item);
    const door = spotDoor(item, item.d / 2 + SPOT_DOOR.step);
    const back = normHeading(item.heading + Math.PI);
    const stand = [[item.d / 2 + 1.2, 0.9], [item.d / 2 + 1.2, -0.9], [0, item.w / 2 + 1.1], [0, -item.w / 2 - 1.1]].map(([lx, lz]) => {
      const p = toWorld(item, lx, lz);
      return { x: clean(p.x), z: clean(p.z), heading: normHeading(Math.atan2(item.z - p.z, item.x - p.x)) };
    });
    void back;
    const spot = { id: stray.id, kind: 'nest', animal: stray.animal, label: (NEST_NAMES[stray.animal] || '小動物') + '的窩', x: item.x, z: item.z, heading: item.heading, door, stand, site: site.id, item: item.id };
    item.spot = spot.id;
    spots.push(spot);
  }

  // ---------------------------------------------------------------- 5. lamps and trees along the kerbs
  const kerbLines = [];
  for (const road of world.roads) for (const side of [-1, 1]) kerbLines.push(kerbLine(road, side));
  function kerbLine(road, side) {
    const zAxis = road.axis === 'z';
    const across = (zAxis ? road.x : road.z) + side * (road.half + LAMP.verge);
    const heading = zAxis ? (side > 0 ? Math.PI : 0) : (side > 0 ? -Math.PI / 2 : Math.PI / 2);
    const lo = Math.max(road.from, (zAxis ? board.minZ : board.minX) + 3), hi = Math.min(road.to, (zAxis ? board.maxZ : board.maxX) - 3);
    let reach = [[lo, hi]];
    if (!zAxis) {
      const bridge = world.bridges.find(b => b.street === road.id), tunnel = world.tunnels.find(t => t.street === road.id);
      if (bridge) reach = reach.flatMap(iv => clipOut(iv, -bridge.abutment, bridge.abutment));
      else if (tunnel) reach = reach.flatMap(iv => clipOut(iv, -tunnel.coverX, tunnel.coverX));
      else reach = reach.flatMap(iv => clipOut(iv, -S.stripEdge, S.stripEdge));
      if (road.pedestrian) reach = reach.flatMap(iv => clipOut(iv, road.pedestrian[0], road.pedestrian[1]));
    }
    // Blocks: the stretches between the roads that cross this kerb.
    const crossing = zAxis ? world.streets.filter(s => streetCrosses(s, road.x + side * (road.half + 1))).map(s => [s.z - s.half, s.z + s.half])
      : world.avenues.map(a => [a.x - a.half, a.x + a.half]);
    // A pedestrian street's mouth is no place for a lamp either.
    if (zAxis) for (const s of world.streets) if (s.pedestrian && pedestrianMouth(s, road, side)) crossing.push([s.z - s.half - S.pavement, s.z + s.half + S.pavement]);
    let blocks = reach;
    for (const [a, b] of crossing) blocks = blocks.flatMap(iv => clipOut(iv, a, b));
    blocks = blocks.filter(([a, b]) => b - a > 1);
    const at = t => (zAxis ? { x: across, z: t } : { x: t, z: across });
    return { road, side, zAxis, across, heading, blocks, at, lamps: [] };
  }
  function streetCrosses(s, x) {
    if (x < s.from - EPS || x > s.to + EPS) return false;
    if (!s.river && Math.abs(x) < S.walkX) return false;
    if (s.pedestrian && x > s.pedestrian[0] && x < s.pedestrian[1]) return false;
    return true;
  }
  function pedestrianMouth(s, avenue, side) {
    const x = avenue.x + side * (avenue.half + 1);
    return x > s.pedestrian[0] && x < s.pedestrian[1] && x >= s.from && x <= s.to;
  }
  const valid = (line, t, kind, rules) => { const p = line.at(t); const [w, d] = SIZE[kind]; return fits(footprintBox(p.x, p.z, w, d, line.heading), p.x, p.z, rules); };
  for (const line of kerbLines) {
    const isTrunk = line.road.kind === 'trunk';
    for (const [a, b] of line.blocks) {
      const mid = (a + b) / 2, long = b - a > BUS_GAP.minRun;
      // Where a lamp may stand along this block, sampled every half unit.
      const ok = [];
      for (let t = a; t <= b + EPS; t += 0.5) ok.push([t, valid(line, t, 'lamp', { cornerClear: LAMP.cornerClear })]);
      const intervals = [];
      let start = null;
      for (let i = 0; i < ok.length; i++) {
        if (ok[i][1] && start === null) start = ok[i][0];
        if ((!ok[i][1] || i === ok.length - 1) && start !== null) { intervals.push([start, ok[i][1] ? ok[i][0] : ok[i - 1][0]]); start = null; }
      }
      for (const [p, q] of intervals) {
        const L = q - p;
        if (L < 0) continue;
        // An even number of lamps on a stretch round the middle of a long block leaves
        // the middle (the bus stop's place) between two of them.
        const spansGap = long && p < mid - BUS_GAP.lamps && q > mid + BUS_GAP.lamps;
        let n = L < 6 ? 1 : Math.round(L / LAMP.spacing) + 1;
        if (spansGap) n = Math.max(2, 2 * Math.round((L / LAMP.spacing + 1) / 2));
        if (n > 1 && L / (n - 1) < 12) n = Math.max(1, Math.floor(L / 12) + 1);
        const ts = n === 1 ? [(p + q) / 2] : [...Array(n).keys()].map(i => p + i * L / (n - 1));
        for (let t of ts) {
          if (long && Math.abs(t - mid) < BUS_GAP.lamps) {
            t = mid + (t >= mid ? 1 : -1) * BUS_GAP.lamps;
            if (t < p || t > q) continue;
          }
          if (line.lamps.some(u => Math.abs(u - t) < 10)) continue;
          const pos = line.at(t);
          const it = tryPlace('lamp', pos.x, pos.z, line.heading, { style: 'street', road: line.road.id, rules: { cornerClear: LAMP.cornerClear } });
          if (it) { lampLight(it, LAMP.headY, isTrunk ? LAMP.trunkRadius : LAMP.radius, LAMP.arm); line.lamps.push(t); }
        }
      }
    }
    line.lamps.sort((p, q) => p - q);
  }

  // Neighbourhood benches and the things by the shop fronts, before the trees take the verge.
  planFrontages();

  const STREET_TREE = { 'trunk-w': 'palm', 'trunk-e': 'palm', 'trunk-n': 'camphor', 'trunk-s': 'camphor', center: 'bauhinia' };
  for (const line of kerbLines) {
    const species = STREET_TREE[line.road.id] || 'banyan';
    const lamps = line.lamps;
    const cand = [];
    for (let i = 0; i + 1 < lamps.length; i++) {
      const g = lamps[i + 1] - lamps[i];
      if (g > 30) continue;
      const k = Math.max(0, Math.round(g / TREE.pitch) - 1);
      for (let j = 1; j <= k; j++) cand.push(lamps[i] + j * g / (k + 1));
    }
    if (lamps.length) {
      for (let j = 1; j <= 3; j++) cand.push(lamps[0] - j * TREE.pitch * 0.95, lamps[lamps.length - 1] + j * TREE.pitch * 0.95);
    }
    for (const t of cand) {
      const block = line.blocks.find(([a, b]) => t >= a && t <= b);
      if (!block) continue;
      const mid = (block[0] + block[1]) / 2;
      if (block[1] - block[0] > BUS_GAP.minRun && Math.abs(t - mid) < BUS_GAP.trees) continue;
      if (lamps.some(u => Math.abs(u - t) < TREE.lampClear)) continue;
      const p = line.at(t), key = line.road.id + ':' + line.side + ':' + t.toFixed(1);
      tryPlace('tree', p.x, p.z, unit(key) * TAU, { species, size: Math.round((0.9 + 0.2 * unit(key + ':s')) * 100) / 100, base: 'grate', road: line.road.id, rules: { cornerClear: TREE.cornerClear } });
    }
  }

  // Fire hydrants: one on each long block, on one side of the road.
  for (const line of kerbLines) {
    for (const [a, b] of line.blocks) {
      if (b - a < 30) continue;
      const key = line.road.id + ':' + line.side + ':' + a.toFixed(0);
      if (unit(key + ':side') < 0.45) continue;
      const t0 = a + (0.18 + 0.14 * unit(key)) * (b - a);
      for (let d = 0; d < 8; d += 0.5) {
        const t = t0 + (d % 1 === 0 ? d : -d);
        const p = line.at(t);
        if (tryPlace('hydrant', p.x, p.z, line.heading, { road: line.road.id, rules: { gap: 0.6 } })) break;
      }
    }
  }

  // ---------------------------------------------------------------- 6. the board's green margins
  for (const zEdge of [board.minZ + 4, board.maxZ - 4]) {
    for (let x = board.minX + 4; x <= board.maxX - 4; x += 9) {
      const key = 'edge:' + x + ':' + zEdge;
      tryPlace('tree', x + (unit(key) - 0.5) * 2, zEdge + (unit(key + 'z') - 0.5) * 1.5, unit(key + 'h') * TAU, { species: unit(key + 's') < 0.6 ? 'camphor' : 'banyan', size: Math.round((0.95 + 0.3 * unit(key + 'k')) * 100) / 100, base: 'lawn', rules: { cornerClear: 4 } });
    }
  }
  for (const xEdge of [board.minX + 3.5, board.maxX - 3.5]) {
    for (let z = board.minZ + 6; z <= board.maxZ - 6; z += 9) {
      const key = 'edge:' + xEdge + ':' + z;
      tryPlace('tree', xEdge, z + (unit(key) - 0.5) * 2, unit(key + 'h') * TAU, { species: unit(key + 's') < 0.6 ? 'camphor' : 'banyan', size: Math.round((0.95 + 0.3 * unit(key + 'k')) * 100) / 100, base: 'lawn', rules: { cornerClear: 4 } });
    }
  }

  // ---------------------------------------------------------------- frontages
  function planFrontages() {
    const pav = S.pavement;
    for (const lot of world.lots) {
      const site = lot.site && world.site(lot.site);
      if (!site) continue;
      for (const [sideName, side] of Object.entries(lot.sides)) {
        if (side.kind !== 'road') continue;
        const road = world.roadById.get(side.road);
        // Along the lot's side: t runs along it; o is the distance from the kerb.
        const alongX = sideName === 'n' || sideName === 's';
        const sgn = sideName === 'n' || sideName === 'w' ? 1 : -1;   // from the road centre toward the lot
        const kerb = side.centre + sgn * road.half;
        const toRoad = sideName === 'n' ? -Math.PI / 2 : sideName === 's' ? Math.PI / 2 : sideName === 'e' ? 0 : Math.PI;
        const pos = (t, o) => (alongX ? { x: t, z: kerb + sgn * o } : { x: kerb + sgn * o, z: t });
        const lo = alongX ? lot.x0 : lot.z0, hi = alongX ? lot.x1 : lot.z1, len = hi - lo;
        const front = site.front === sideName;
        const door = site.doors.find(d => d.side === sideName) || null;
        const doorT = door ? (alongX ? door.x : door.z) : null;
        const tryAlong = (kind, t, o, heading, extra) => {
          for (let d = 0; d <= 6; d += 0.5) for (const s of d ? [1, -1] : [1]) {
            const p = pos(t + s * d, o);
            const it = tryPlace(kind, p.x, p.z, heading, extra);
            if (it) return it;
          }
          return null;
        };
        const backO = (d) => pav - d / 2 - 0.1;
        if (site.kind === 'housing') {
          for (const f of front ? [0.22, 0.78] : [0.5]) {
            const it = tryAlong('bench', lo + f * len, backO(SIZE.bench[1]), toRoad, { style: 'street' });
            if (it) { benchSpot(it, site.name + '前的長椅', [-SEAT.spacing, 0, SEAT.spacing], SEAT.bench); tryAlong('bin', (alongX ? it.x : it.z) + 3.4, backO(0.6), toRoad, {}); }
          }
          if (front && doorT !== null) tryAlong('vending', doorT + 6, backO(SIZE.vending[1]), toRoad, {});
        }
        if (front && doorT !== null) {
          const kinds = {
            station: [['bike-rack', 9], ['bike-rack', -9], ['vending', 5.5]], primary: [['bike-rack', 8.5]], secondary: [['bike-rack', 8.5], ['vending', -6]],
            university: [['bike-rack', 8.5], ['bike-rack', -8.5]], mall: [['bike-rack', 9], ['vending', -6]], 'annex-mall': [['bike-rack', -9]],
            library: [['bike-rack', 8]], hospital: [['vending', 6.5]], tower: [['bike-rack', 9]], sports: [['vending', 6], ['bike-rack', -9]], market: [['vending', -6]],
            park: [['vending', 6]], amusement: [['vending', -6]]
          }[site.kind] || [];
          for (const [kind, dt] of kinds) tryAlong(kind, doorT + dt, backO(SIZE[kind][1]), toRoad, {});
          const post = { station: 1, mall: 1, library: 1, hospital: 1, 'annex-mall': 1, market: 1 }[site.kind];
          if (post) tryAlong('mailbox', doorT - 5, LAMP.verge, toRoad + Math.PI, {});
          if (site.kind === 'library' || site.kind === 'hospital') {
            const it = tryAlong('bench', doorT - 10, backO(SIZE.bench[1]), toRoad, { style: 'street' });
            if (it) benchSpot(it, site.name + '前的長椅', [-SEAT.spacing, 0, SEAT.spacing], SEAT.bench);
          }
        }
      }
    }
    // The town office on the market strip gets a mailbox by its door.
    for (const site of world.siteList) {
      if (site.place !== 'waterfront' || !site.door) continue;
      const d = site.door;
      for (const dz of [4.5, -4.5, 6, -6]) if (tryPlace('mailbox', d.x + d.nx * 0.9, d.z + dz, Math.atan2(d.nz, d.nx))) break;
    }
  }

  // Strays whose nest is on the promenade by the night market (parks place theirs themselves).
  for (const stray of (world.config.strays || [])) {
    const site = world.site(stray.site);
    if (site && (site.place === 'night-market' || site.place === 'waterfront')) planPromenadeNest(stray, site);
  }

  items.sort((p, q) => (p.kind < q.kind ? -1 : p.kind > q.kind ? 1 : 0) || idNumber(p.id) - idNumber(q.id));
  const plan = { items, spots, parks, lanterns };
  if (debug) plan.rejected = rejected;
  return plan;
}
const idNumber = id => Number(id.slice(id.lastIndexOf(':') + 1));

// Every LightSource the plan implies (street, bridge, park and pedestrian lamps, and the
// promenade lanterns), for render modules and the scene.
export function furnitureLights(plan) {
  const out = [];
  for (const it of plan.items) if (it.light) out.push({ x: it.light.x, y: it.light.y, z: it.light.z, radius: it.light.radius, color: it.light.color, intensity: 1, group: 'lamps', kind: it.style ? it.style + '-lamp' : 'lamp' });
  for (const l of plan.lanterns || []) out.push({ x: l.light.x, y: l.light.y, z: l.light.z, radius: l.light.radius, color: l.light.color, intensity: 0.8, group: 'lamps', kind: 'promenade' });
  return out;
}

// ------------------------------------------------------------------ bus stops
// The bus stops come from the transit lines, after the plan is made. The pole stands at the
// stop's kerb point; the shelter extends behind it (-x in the stop's heading frame) and back
// from the road (+z there). Numbers match src/render/props/stops.js.
export const STOP = { pole: 0.4, shelter: { x0: -9.8, x1: -0.4, z0: -0.7, z1: 2.65 }, margin: 1, nudge: 0.5, reach: 14 };
const NUDGEABLE = new Set(['bike-rack', 'bin', 'planter', 'bollard', 'vending', 'mailbox', 'hydrant', 'lamp', 'tree']);

// Is world point (x, z) inside stop's footprint grown by `grow`?
function hitsStop(stop, x, z, grow) {
  const c = Math.cos(stop.heading || 0), s = Math.sin(stop.heading || 0);
  const dx = x - stop.x, dz = z - stop.z, lx = dx * c + dz * s, lz = -dx * s + dz * c;
  if (Math.hypot(lx, lz) < STOP.pole + grow) return true;
  if (!stop.shelter) return false;
  const r = STOP.shelter;
  return lx > r.x0 - grow && lx < r.x1 + grow && lz > r.z0 - grow && lz < r.z1 + grow;
}

// Returns the plan with items that overlap a bus stop nudged along the kerb (a lamp's light
// moves with it) or dropped when there is no room. Trees and lamps only count as in the way
// when their trunk is; spots and their items are never touched.
export function clearForStops(plan, stops) {
  const list = stops || [];
  if (!list.length) return plan;
  const hit = (it, x, z, grow) => list.some(st => {
    if (it.kind === 'tree' || it.kind === 'lamp') return hitsStop(st, x, z, 0.3);
    return outlineOf(x, z, it.w, it.d, it.heading).some(p => hitsStop(st, p.x, p.z, grow));
  });
  const spotApproaches = plan.spots.map(sp => sp.door.approach);
  const out = [];
  for (const it of plan.items) {
    if (it.spot || !hit(it, it.x, it.z, STOP.margin)) { out.push(it); continue; }
    if (!NUDGEABLE.has(it.kind)) continue;
    // Slide along the kerb (the stop's heading axis is the kerb direction), nearest first.
    const st = list.find(s => hitsStop(s, it.x, it.z, STOP.margin + 2)) || list[0];
    const ux = Math.cos(st.heading || 0), uz = Math.sin(st.heading || 0);
    let moved = null;
    for (let k = 1; k * STOP.nudge <= STOP.reach && !moved; k++) for (const sgn of [1, -1]) {
      const x = it.x + ux * sgn * k * STOP.nudge, z = it.z + uz * sgn * k * STOP.nudge;
      if (hit(it, x, z, STOP.margin)) continue;
      const box = footprintBox(x, z, it.w, it.d, it.heading);
      if (plan.items.some(o => o !== it && overlaps(box, o.box, 0.25))) continue;
      if (out.some(o => overlaps(box, o.box, 0.25))) continue;
      if (spotApproaches.some(a => rectDistance(box, pointRect(a.x, a.z)) < 0.9)) continue;
      moved = { x, z, box };
      break;
    }
    if (moved) {
      const next = { ...it, x: clean(moved.x), z: clean(moved.z), box: moved.box };
      if (it.light) next.light = { ...it.light, x: clean(it.light.x + moved.x - it.x), z: clean(it.light.z + moved.z - it.z) };
      out.push(next);
    }
  }
  return { ...plan, items: out };
}
