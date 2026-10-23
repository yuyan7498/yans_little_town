// The street network: walking and driving routes between any two doors in town,
// built entirely from the world model (src/core/world). See docs/CONTRACTS.md §6.
//
// A walk goes from a door, out through its approach step, onto the nearest walkway
// and along the pavements, promenades and footbridges to the other door, crossing a
// carriageway only on a zebra (it walks to the nearest one when it has to change
// sides). A ride walks from the door to the kerb where the vehicle stands, drives in
// the right-hand lane and pulls in with the destination door on its right — or at the
// far kerb when going round the block would cost more — and walks from the kerb.

import { pick, unit } from '../random.js';
import { buildWalkGraph, walkTree, viaTree, treeSteps } from './net-walk.js';
import { buildRoadGraph, CORNER, LANE_EASE } from './net-drive.js';
import { EPS, clamp, closest, measure, pathOf, sampleAt, subPath, joinPieces, roundCorners, project, polylineLength } from './net-geom.js';

// A walker's change of line (onto or off a shared walkway) is eased over this distance.
const WALK_EASE = 1.5;
// Choosing where to get in: one unit walked counts as this many units driven.
const WALK_WEIGHT = 12;
// How far from a door a kerb may be to serve it.
const KERB_REACH = 110;
// Kerb spots: a vehicle stands in a slot SLOT long along the kerb (a taxi needs most of
// it); every third slot is for taxis. A slot's centre keeps BUS_CLEAR from a bus stop,
// and a vehicle takes the nearest free one: SPOT_SPREAD of random preference per slot
// keeps neighbours from all taking the same.
const SLOT = 6.5, SLOT_MARGIN = 3, TAXI_EVERY = 4, BUS_CLEAR = 13, SPOT_SPREAD = 6, SPOT_REACH = 30;
// People walk to and from a parked vehicle's door, up to this far either side of its centre.
const DOOR_SPREAD = 1.8;
// A full kerb sends a vehicle to another kerb only if the walk is at most this much longer.
const ALT_WALK = 30;
// Bookings older than this (minutes) are forgotten.
const BOOK_KEEP = 3 * 1440;
// A drive shorter than this is not worth getting the vehicle out for.
const MIN_DRIVE = 24;
// A stroll turns this far along the promenade from the door's own z, kept this far
// from the promenade's ends.
const STROLL = { reach: 60, margin: 10 };
const CACHE_LIMIT = 8000;

export function createNetwork(world, { spots = [] } = {}) {
  const g = buildWalkGraph(world);
  const rg = buildRoadGraph(world);
  const spotById = new Map((spots || []).map(s => [s.id, s]));
  const stallById = new Map(world.stalls.map(s => [s.id, s]));
  const cache = new Map();
  const remember = (key, value) => {
    if (cache.size >= CACHE_LIMIT) {
      let drop = CACHE_LIMIT / 8;
      for (const k of cache.keys()) { cache.delete(k); if (--drop <= 0) break; }
    }
    cache.set(key, value);
    return value;
  };

  // ------------------------------------------------------------------ doors
  // The door a person uses for a place: a site's door (a compound's gate), one of several
  // picked by `key`, a night-market stall's front, or a sitting spot's.
  function doorOf(placeId, key) {
    if (placeId == null) return null;
    const id = String(placeId);
    if (stallById.has(id)) return stallById.get(id).door || null;
    if (spotById.has(id)) return spotById.get(id).door || null;
    const site = world.site(id);
    if (!site) return null;
    const doors = site.doors && site.doors.length ? site.doors : site.door ? [site.door] : [];
    if (!doors.length) return null;
    // (A key 'who|which' picks by who alone: a person keeps to their own door.)
    return doors.length > 1 ? doors[pick(String(key ?? '').split('|')[0] + ':' + id, doors.length)] : doors[0];
  }
  const doorIds = new WeakMap();
  let doorSeq = 0;
  const idOf = door => { let id = doorIds.get(door); if (id === undefined) { id = ++doorSeq; doorIds.set(door, id); } return id; };

  // Where a door (or any point) joins the walking network: {edge, t, x, z, spur, door}.
  // `spur` lists the points from the door out to the joining point.
  const doorEnds = new Map();
  function doorEnd(door) {
    if (doorEnds.has(door)) return doorEnds.get(door);
    const ap = door.approach || door, s = g.snap(ap.x, ap.z);
    const end = s ? { ...s, spur: door.approach ? [{ x: door.x, z: door.z }, { x: ap.x, z: ap.z }] : [{ x: door.x, z: door.z }], door, fwd: null, rev: null, kerbs: null } : null;
    doorEnds.set(door, end);
    return end;
  }
  // (Points are remembered by identity, so a bus stop's pole is placed once.)
  const pointEnds = new WeakMap();
  function pointEnd(p) {
    if (!p) return null;
    if (p.approach) return doorEnd(p);
    if (pointEnds.has(p)) return pointEnds.get(p);
    const s = g.snap(p.x, p.z);
    const end = s ? { ...s, spur: [{ x: p.x, z: p.z }], door: null, fwd: null, rev: null } : null;
    pointEnds.set(p, end);
    return end;
  }
  const fwdTree = end => end.fwd || (end.fwd = walkTree(g, end, false));
  const revTree = end => end.rev || (end.rev = walkTree(g, end, true));
  const spurLength = end => {
    let total = 0, prev = end.spur[0];
    for (const p of end.spur.slice(1).concat([{ x: end.x, z: end.z }])) { total += Math.hypot(p.x - prev.x, p.z - prev.z); prev = p; }
    return total;
  };

  // ------------------------------------------------------------------ walks
  // The cheapest walk from end A to end B: {cost, nodes, edges} in walking order, using a
  // door's cached tree where there is one.
  function walkPlan(A, B) {
    const useForward = A.fwd || A.door || !(B.rev || B.door);
    const tree = useForward ? fwdTree(A) : revTree(B), other = useForward ? B : A;
    const q = viaTree(g, tree, other);
    if (!Number.isFinite(q.cost)) return null;
    const steps = q.node < 0 ? { nodes: [], edges: [] } : treeSteps(tree, q.node);
    return { cost: q.cost + spurLength(A) + spurLength(B), nodes: steps.nodes, edges: steps.edges };
  }
  const piece = (p, q, off, edge) => ({ ax: p.x, az: p.z, bx: q.x, bz: q.z, off, edge });
  function walkPieces(A, B, plan) {
    const pieces = [], head = A.spur.concat([{ x: A.x, z: A.z }]), tail = [{ x: B.x, z: B.z }].concat(B.spur.slice().reverse());
    for (let i = 0; i + 1 < head.length; i++) pieces.push(piece(head[i], head[i + 1], 0, null));
    const eA = g.edges[A.edge], eB = g.edges[B.edge];
    if (!plan.nodes.length) pieces.push(piece(A, B, eA.keep, eA));
    else {
      pieces.push(piece(A, g.nodes[plan.nodes[0]], eA.keep, eA));
      for (let i = 0; i < plan.edges.length; i++) {
        const e = g.edges[plan.edges[i]];
        pieces.push(piece(g.nodes[plan.nodes[i]], g.nodes[plan.nodes[i + 1]], e.keep, e));
      }
      pieces.push(piece(g.nodes[plan.nodes[plan.nodes.length - 1]], B, eB.keep, eB));
    }
    for (let i = 0; i + 1 < tail.length; i++) pieces.push(piece(tail[i], tail[i + 1], 0, null));
    return pieces;
  }
  // A path from walking pieces, with the zebras crossed: {id, midblock, signal, s0, s1}.
  function walkPath(pieces, doors) {
    const { points, starts } = joinPieces(pieces, WALK_EASE, 4);
    const m = measure(points);
    const at = i => (i < pieces.length ? m.lengths[m.map[starts[i]]] : m.total);
    const crossings = [];
    for (let i = 0; i < pieces.length; i++) {
      const e = pieces[i].edge;
      if (e && e.kind === 'zebra') crossings.push({ id: e.junction, midblock: e.midblock, signal: e.signal, s0: at(i), s1: at(i + 1), edge: e.index });
    }
    return { path: { points: m.points, lengths: m.lengths, total: m.total, doors, crossings }, at };
  }
  const still = (door, doors) => ({ points: [{ x: door.x, z: door.z }], lengths: [0], total: 0, doors, crossings: [] });

  function walkEnds(A, B, doors) {
    if (!A || !B) return null;
    const plan = walkPlan(A, B);
    if (!plan) return null;
    return walkPath(walkPieces(A, B, plan), doors).path;
  }

  // Door to door along the network; a stroll (out along the network and back) when
  // from === to.
  function route(from, to, key) {
    const dA = doorOf(from, key), dB = doorOf(to, key);
    if (!dA && !dB) return null;
    if (from === to) return stroll(dA || dB, key);
    const a = dA || dB, b = dB || dA;
    const ck = 'w:' + idOf(a) + '>' + idOf(b);
    if (cache.has(ck)) return cache.get(ck);
    const path = a === b ? still(a, [a, b]) : walkEnds(doorEnd(a), doorEnd(b), [a, b]);
    return remember(ck, path);
  }

  // Out to a point on the nearest promenade and back: {…path, loop: true, turn (distance
  // of the turning point)}.
  function stroll(door, key) {
    const variant = pick(String(key ?? '') + ':loop', 2);
    const ck = 'l:' + idOf(door) + ':' + variant;
    if (cache.has(ck)) return cache.get(ck);
    const A = doorEnd(door);
    let result = null;
    const prom = world.promenades.slice().sort((p, q) => Math.abs(p.x - door.x) - Math.abs(q.x - door.x))[0];
    // The turning point is nudged along the promenade when it falls where nothing walks.
    for (const nudge of [0, 6, -6, 12, -12, 20, -20, 30, -30]) {
      const sign = variant ? 1 : -1;
      const turn = prom
        ? { x: prom.x, z: clamp(door.z + sign * STROLL.reach + nudge, prom.from + STROLL.margin, prom.to - STROLL.margin) }
        : { x: door.x + sign * STROLL.reach + nudge, z: door.z };
      const T = pointEnd(turn);
      if (!A || !T) continue;
      const out = walkPlan(A, T), back = walkPlan(T, A);
      if (!out || !back) continue;
      const first = walkPieces(A, T, out), second = walkPieces(T, A, back);
      const { path, at } = walkPath(first.concat(second), [door, door]);
      result = { ...path, loop: true, turn: at(first.length) };
      break;
    }
    if (!result) result = { ...still(door, [door, door]), loop: true, turn: 0 };
    return remember(ck, result);
  }

  // A walk between two doors or points (a door is anything with an approach step).
  function walkBetween(a, b) {
    const doors = [a && a.approach ? a : null, b && b.approach ? b : null];
    if (doors[0] && doors[1]) {
      const ck = 'b:' + idOf(a) + '>' + idOf(b);
      if (cache.has(ck)) return cache.get(ck);
      return remember(ck, a === b ? still(a, doors) : walkEnds(doorEnd(a), doorEnd(b), doors));
    }
    return walkEnds(pointEnd(a), pointEnd(b), doors);
  }
  // The walking cost (about the distance, with the zebras' waits) between two doors or points.
  function walkCost(a, b) {
    const A = pointEnd(a), B = pointEnd(b);
    if (!A || !B) return Infinity;
    const plan = walkPlan(A, B);
    return plan ? plan.cost : Infinity;
  }

  // ------------------------------------------------------------------ kerbs and rides
  const alongRoad = (road, p) => (road.axis === 'x' ? p.x : p.z);
  // The walking-network point on the pavement beside kerb point k ({edge, d, side}),
  // with the step out to the kerb as its spur.
  function kerbEnd(k) {
    const e = rg.edges[k.edge], road = e.road, forward = k.side > 0;
    const W = rg.pointAt(e, k.d, road.lanesAt.walk, forward), K = rg.pointAt(e, k.d, road.lanesAt.kerb, forward);
    const sign = road.axis === 'x' ? Math.sign(W.z - road.z) : Math.sign(W.x - road.x);
    const on = g.pavementAt(road.id, sign, alongRoad(road, W));
    if (on) {
      const we = g.edges[on.edge], A = g.nodes[we.a], B = g.nodes[we.b];
      return { edge: on.edge, t: on.t, x: A.x + (B.x - A.x) * on.t, z: A.z + (B.z - A.z) * on.t, spur: [K], door: null, fwd: null, rev: null };
    }
    const s = g.snap(K.x, K.z);
    return s ? { ...s, spur: [K], door: null, fwd: null, rev: null } : null;
  }
  // Where a vehicle for this door may wait: the best kerb to walk to, the far kerb of the
  // same road and the best kerb of another road ({edge, d, side, walkOut, walkIn}).
  function kerbsOf(A) {
    if (A.kerbs) return A.kerbs;
    const ap = A.door ? A.door.approach || A.door : A.spur[0];
    const fwd = fwdTree(A), rev = revTree(A), list = [];
    for (const e of rg.edges) {
      if (!e.pickup) continue;
      const N = rg.nodes[e.a], M = rg.nodes[e.b], c = closest(ap.x, ap.z, N.x, N.z, M.x, M.z);
      if (c.d > KERB_REACH) continue;
      const d = clamp(c.t * e.length, e.pickup[0], e.pickup[1]);
      for (const side of [1, -1]) {
        const end = kerbEnd({ edge: e.index, d, side });
        if (!end) continue;
        const out = viaTree(g, fwd, end).cost, back = viaTree(g, rev, end).cost;
        if (!Number.isFinite(out) || !Number.isFinite(back)) continue;
        const step = Math.hypot(end.x - end.spur[0].x, end.z - end.spur[0].z);
        list.push({ edge: e.index, d, side, walkOut: out + step + spurLength(A), walkIn: back + step + spurLength(A) });
      }
    }
    list.sort((p, q) => p.walkOut - q.walkOut || p.edge - q.edge || p.side - q.side);
    const best = list[0];
    const picked = best ? [best, list.find(k => k.edge === best.edge && k.side !== best.side), list.find(k => k.edge !== best.edge)] : [];
    A.kerbs = picked.filter((k, i) => k && picked.indexOf(k) === i);
    return A.kerbs;
  }

  // A drive's junctions (and signalled mid-block crossings) with their distance along `lane`.
  function junctionsOf(drive, lane, offset) {
    const out = [];
    let from = 0;
    for (const n of drive.nodes) {
      const J = rg.junctionAtNode.get(n), C = rg.crossingAtNode.get(n);
      if (!J && !C) continue;
      const node = rg.nodes[n], hit = project(lane, node.x, node.z, from);
      if (!hit) continue;
      from = hit.s;
      out.push(J ? { id: J.id, kind: 'junction', node: n, signal: !!J.signal, s: offset + hit.s }
        : { id: C.id, kind: 'midblock', node: n, signal: !!C.signal, s: offset + hit.s });
    }
    return out;
  }

  // ------------------------------------------------------------------ kerb spots
  // Bus stops (and anything else the kerb must keep clear of) are registered here.
  const blocked = [];
  let blockedVersion = 0;
  function blockKerb(p, radius = BUS_CLEAR) { blocked.push({ x: p.x, z: p.z, r: radius }); blockedVersion++; slotCache.clear(); }
  const slotCache = new Map();
  // The slots along one side of an edge: [{id, d, taxi, x, z}] clear of junctions,
  // crossings and bus stops.
  function slotsOf(edge, side) {
    const ck = edge * 2 + (side > 0 ? 0 : 1), hit = slotCache.get(ck);
    if (hit) return hit;
    const e = rg.edges[edge], list = [];
    if (e.pickup) {
      const lo = e.pickup[0] + SLOT_MARGIN, hi = e.pickup[1] - SLOT_MARGIN;
      const n = Math.floor((hi - lo) / SLOT) + 1, used = n * SLOT - SLOT, start = lo + (hi - lo - used) / 2;
      for (let k = 0; k < n; k++) {
        const d = start + k * SLOT, K = rg.pointAt(e, d, e.road.lanesAt.kerb, side > 0);
        if (blocked.some(b => Math.hypot(K.x - b.x, K.z - b.z) < b.r)) continue;
        list.push({ id: ck + ':' + k, d, taxi: k % TAXI_EVERY === TAXI_EVERY - 1 });
      }
    }
    slotCache.set(ck, list);
    return list;
  }
  const clash = (ledger, id, [a, b], owner) => (ledger.get(id) || []).some(r => r[0] < b && a < r[1] && r[2] !== owner);
  // The slot nearest to kerb point p (same edge and side) that is free for the window:
  // {...p, d, slot}. A free slot of the right kind is preferred, then any free one, then
  // (when the kerb is full) the nearest, shared.
  function pickSlot(cands, walkKey, hashKey, taxi, window, owner, ledger, reach = SPOT_REACH) {
    const options = [];
    for (const c of cands) {
      for (const sl of slotsOf(c.edge, c.side)) {
        const along = Math.abs(sl.d - c.d);
        if (along > reach) continue;
        options.push({ c, sl, score: c[walkKey] + along + unit(hashKey + ':' + sl.id) * SPOT_SPREAD });
      }
    }
    if (!options.length) return { ...cands[0], slot: null };
    options.sort((x, y) => x.score - y.score);
    const free = o => !window || !ledger || !clash(ledger, o.sl.id, window, owner);
    const open = options.find(o => o.sl.taxi === taxi && free(o)) || (taxi ? options.find(free) : options.find(o => !o.sl.taxi && free(o)));
    const chosen = open || options.find(o => o.sl.taxi === taxi) || options[0];
    return { ...chosen.c, d: chosen.sl.d, slot: chosen.sl.id, full: !open };
  }
  function bookSlot(p, window, owner, ledger) {
    if (!p.slot || !window || !ledger) return;
    let list = ledger.get(p.slot);
    if (!list) ledger.set(p.slot, list = []);
    if (list.length > 40) { const keep = window[0] - BOOK_KEEP; for (let i = list.length - 1; i >= 0; i--) if (list[i][1] < keep) list.splice(i, 1); }
    list.push([window[0], window[1], owner]);
  }

  // Walk to the kerb, drive, walk from the kerb. Null when there is no way to drive it or
  // the drive is too short to be worth it. `cost(edge, fromNode, toNode)` makes busy roads
  // count for more. Without a cost the ride is cached under `key`.
  function ride(from, to, key, vehicle = 'car', cost = null, book = null) {
    const two = vehicle === 'two';
    if (from === to) return null;
    const dA = doorOf(from, key), dB = doorOf(to, key);
    if (!dA || !dB || dA === dB) return null;
    const ck = cost || book ? null : 'r:' + (two ? 't' : 'c') + ':' + idOf(dA) + '>' + idOf(dB) + ':' + key;
    if (ck && cache.has(ck)) return cache.get(ck);
    const A = doorEnd(dA), B = doorEnd(dB);
    const result = A && B ? planRide(A, B, String(key), two, cost, book) : null;
    if (result) result.doors = [dA, dB];
    return ck ? remember(ck, result) : result;
  }
  function planRide(A, B, key, two, cost, book) {
    let best = null;
    for (const p of kerbsOf(A)) {
      for (const q of kerbsOf(B)) {
        const drive = rg.plan(p, q, cost);
        if (!drive) continue;
        const total = drive.cost + WALK_WEIGHT * (p.walkOut + q.walkIn);
        if (!best || total < best.total - 1e-9) best = { total, p, q, drive };
      }
    }
    if (!best) return null;
    // Each vehicle takes a kerb spot of its own, clear of bus stops, and its people walk
    // to its door.
    let { p, q, drive } = best;
    const taxi = !!(book && book.taxi), owner = book ? book.owner : null;
    let p2 = pickSlot([p], 'walkOut', key + ':pickup', taxi, book && book.pick, owner, book && book.ledger);
    // (A full kerb sends the vehicle to the far kerb or the next road.)
    if (p2.full && book) { const alt = pickSlot(kerbsOf(A).filter(c => c.walkOut <= p.walkOut + ALT_WALK), 'walkOut', key + ':pickup', taxi, book.pick, owner, book.ledger); if (!alt.full) p2 = alt; }
    let q2 = pickSlot([q], 'walkIn', key + ':dropoff', taxi, book && book.drop, owner, book && book.ledger);
    if (q2.full && book) { const alt = pickSlot(kerbsOf(B).filter(c => c.walkIn <= q.walkIn + ALT_WALK), 'walkIn', key + ':dropoff', taxi, book.drop, owner, book.ledger); if (!alt.full) q2 = alt; }
    const spread = rg.plan(p2, q2, cost);
    if (spread && spread.length >= MIN_DRIVE) { p = p2; q = q2; drive = spread; }
    if (drive.length < MIN_DRIVE) return null;
    if (book) { bookSlot(p, book.pick, owner, book.ledger); bookSlot(q, book.drop, owner, book.ledger); }
    const half = (a, b) => rg.edges[a.edge].pickup ? clamp(a.d + (unit(key + b) - 0.5) * 2 * DOOR_SPREAD, ...rg.edges[a.edge].pickup) : a.d;
    const pW = { ...p, d: half(p, ':doorA') }, qW = { ...q, d: half(q, ':doorB') };

    const lane = rg.laneLine(rg.runsOf(p, q, drive), two ? 'two' : 'car');
    const eP = rg.edges[p.edge], eQ = rg.edges[q.edge];
    const K1 = rg.pointAt(eP, pW.d, eP.road.lanesAt.kerb, p.side > 0), K2 = rg.pointAt(eQ, qW.d, eQ.road.lanesAt.kerb, q.side > 0);
    const walk1 = walkEnds(A, kerbEnd(pW), [A.door, null]), walk2 = walkEnds(kerbEnd(qW), B, [null, B.door]);
    if (!walk1 || !walk2) return null;
    const lp = lane.points, first = lp[0], last = lp[lp.length - 1];
    const legs = {};
    legs.walkEnd = walk1.total;
    legs.driveStart = legs.walkEnd + Math.hypot(first.x - K1.x, first.z - K1.z);
    legs.driveEnd = legs.driveStart + polylineLength(lp);
    legs.walkStart = legs.driveEnd + Math.hypot(K2.x - last.x, K2.z - last.z);
    const m = measure(walk1.points.concat(lp, walk2.points));
    const lanePath = pathOf(lp);
    return {
      points: m.points, lengths: m.lengths, total: m.total, doors: null, legs, vehicle: two ? 'two' : 'car',
      roadEdges: drive.pieces.map(s => ({ key: s.edge * 2 + (s.forward ? 0 : 1), edge: s.edge, forward: s.forward, length: s.length })),
      junctions: junctionsOf(drive, lanePath, legs.driveStart),
      crossings: walk1.crossings.concat(walk2.crossings.map(c => ({ ...c, s0: c.s0 + legs.walkStart, s1: c.s1 + legs.walkStart }))),
      kerbs: [K1, K2], slots: [p.slot, q.slot], lanes: { start: lane.lanes[0].entry, end: lane.lanes[lane.lanes.length - 1].target },
      driveLength: drive.length
    };
  }

  // ------------------------------------------------------------------ vehicles on their own
  // The road edge nearest to p, travelled the way `heading` points: {edge, d, side}.
  function onRoad(p, heading) {
    let best = null;
    for (const e of rg.edges) {
      const N = rg.nodes[e.a], M = rg.nodes[e.b], c = closest(p.x, p.z, N.x, N.z, M.x, M.z);
      if (!best || c.d < best.c.d - 1e-9) best = { e, c };
    }
    if (!best) return null;
    const { e, c } = best;
    const side = e.ux * Math.cos(heading) + e.uz * Math.sin(heading) >= 0 ? 1 : -1;
    return { edge: e.index, d: c.t * e.length, side };
  }
  // A drive from where a vehicle stands (facing `heading`) to a lane point it must reach
  // facing `arrive`, round the block if need be: a taxi going to a pick-up.
  function approach(pos, heading, target, arrive) {
    const P = onRoad(pos, heading), Q = onRoad(target, arrive);
    if (!P || !Q) return pathOf([pos, target]);
    let drive = rg.plan(P, Q, null);
    if (!drive) {
      const eP = rg.edges[P.edge], eQ = rg.edges[Q.edge];
      const mid = rg.search(P.side > 0 ? eP.b : eP.a, Q.side > 0 ? eQ.a : eQ.b, -1, -1, null);
      if (mid) {
        const lenP = P.side > 0 ? eP.length - P.d : P.d, lenQ = Q.side > 0 ? Q.d : eQ.length - Q.d;
        drive = { nodes: mid.nodes, pieces: [{ edge: eP.index, forward: P.side > 0, length: lenP }]
          .concat(mid.steps.map(s => ({ edge: s.edge, forward: s.forward, length: rg.edges[s.edge].length })), [{ edge: eQ.index, forward: Q.side > 0, length: lenQ }]) };
      }
    }
    if (!drive) return pathOf([pos, target]);
    const lane = rg.laneLine(rg.runsOf(P, Q, drive), 'car');
    const path = pathOf(lane.points);
    path.roadEdges = drive.pieces.map(s => ({ key: s.edge * 2 + (s.forward ? 0 : 1), edge: s.edge, forward: s.forward, length: s.length }));
    path.junctions = junctionsOf(drive, path, 0);
    return path;
  }

  // A closed bus loop through these road nodes (world nodes, indices or points; each
  // consecutive pair on one road), in the kerb lane with rounded corners. It starts and
  // ends in the middle of the first stretch; `marks` give each stretch's middle:
  // {s, length, heading, kerb, lane, road, segment, over}.
  function loopLane(list) {
    const pts = list.map(n => (typeof n === 'number' ? world.nodes[n] : n)), n = pts.length;
    const stretches = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n], len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < EPS) continue;
      const road = roadBetween(a, b), lanes = road.lanesAt;
      const edge = a.index != null && b.index != null ? rg.edgeBetween.get(a.index + '-' + b.index) : null;
      stretches.push({ a, b, len, ux: (b.x - a.x) / len, uz: (b.z - a.z) / len, road, off: lanes.car[lanes.car.length - 1], kerb: lanes.kerb, edge });
    }
    const s0 = stretches[0], mid0 = { x: (s0.a.x + s0.b.x) / 2, z: (s0.a.z + s0.b.z) / 2 };
    const pieces = [piece(mid0, s0.b, s0.off)];
    for (let i = 1; i < stretches.length; i++) pieces.push(piece(stretches[i].a, stretches[i].b, stretches[i].off));
    pieces.push(piece(s0.a, mid0, s0.off));
    const path = pathOf(roundCorners(joinPieces(pieces, LANE_EASE, 14).points, CORNER.car));
    path.loop = true;
    path.marks = stretches.map((st, i) => {
      const m = { x: (st.a.x + st.b.x) / 2, z: (st.a.z + st.b.z) / 2 }, rx = -st.uz, rz = st.ux;
      const lane = { x: m.x + rx * st.off, z: m.z + rz * st.off }, kerb = { x: m.x + rx * st.kerb, z: m.z + rz * st.kerb };
      const hit = i === 0 ? { s: 0 } : project(path, lane.x, lane.z);
      const segment = st.edge ? world.segments[st.edge.segment] : null;
      return { s: hit.s > path.total - 0.5 ? 0 : hit.s, length: st.len, heading: Math.atan2(st.uz, st.ux), kerb, lane, road: st.road.id,
        segment: segment ? segment.index : null, over: segment ? segment.over : overOf(st), index: i };
    });
    return path;
  }
  function roadBetween(a, b) {
    const road = Math.abs(a.x - b.x) < EPS ? world.avenues.find(r => Math.abs(r.x - a.x) < EPS)
      : Math.abs(a.z - b.z) < EPS ? world.streets.find(r => Math.abs(r.z - a.z) < EPS) : null;
    if (!road) throw new Error(`loopLane: (${a.x}, ${a.z}) 和 (${b.x}, ${b.z}) 不在同一條路上`);
    return road;
  }
  // A stretch given by its ends: land unless any segment of it is a bridge or tunnel.
  function overOf(st) {
    const lo = Math.min(st.a.x, st.b.x), hi = Math.max(st.a.x, st.b.x), lz = Math.min(st.a.z, st.b.z), hz = Math.max(st.a.z, st.b.z);
    const segs = world.segments.filter(s => s.road === st.road.id && s.x0 >= lo - EPS && s.x1 <= hi + EPS && s.z0 >= lz - EPS && s.z1 <= hz + EPS);
    return segs.find(s => s.over !== 'land')?.over || 'land';
  }

  // ------------------------------------------------------------------ walking room
  // How far a walker may drift either side of the walking line here (to pass someone or
  // step round a lamp post).
  function roomAt(x, z) {
    const rx = g.riverX;
    for (const b of world.bridges) {
      if (Math.abs(x - rx) >= b.abutment) continue;
      if (b.kind === 'foot' && Math.abs(z - b.z) <= b.width / 2 + 1) return Math.max(0.4, b.width / 2 - 1.2);
      if (b.kind === 'road') {
        const road = world.roadById.get(b.street), off = Math.abs(z - b.z);
        if (off > road.half && off <= b.width / 2 + 0.5) return Math.max(0.3, (b.width / 2 - road.lanesAt.walk) - 0.4);
      }
    }
    for (const p of world.promenades) if (x >= p.band.x0 && x <= p.band.x1) return Math.max(1, (p.band.x1 - p.band.x0) / 2 - 2);
    for (const s of world.segments) {
      if (!s.pedestrian) continue;
      const road = world.roadById.get(s.road);
      if (x >= s.x0 - EPS && x <= s.x1 + EPS && Math.abs(z - road.z) <= road.half + 2) return Math.max(1, road.half - 3);
    }
    for (const road of world.roads) {
      const off = road.axis === 'x' ? Math.abs(z - road.z) : Math.abs(x - road.x), u = road.axis === 'x' ? x : z;
      if (u >= road.from - EPS && u <= road.to + EPS && off > road.half && off < road.half + 6) return 1.4;
    }
    return 1;
  }

  return {
    walkGraph: { nodes: g.nodes, edges: g.edges, snap: g.snap, carriageways: g.carriageways },
    roadGraph: { nodes: rg.nodes, edges: rg.edges, adjacency: rg.adjacency },
    zebras: g.zebras,
    blockKerb, doorOf, route, ride, walkBetween, walkCost, subPath, sampleAt, approach, loopLane, roomAt,
    spot: id => spotById.get(id) || stallById.get(id) || null,
    info: () => ({ walkNodes: g.nodes.length, walkEdges: g.edges.length, roadEdges: rg.edges.length, zebras: g.zebras.length, cached: cache.size })
  };
}
