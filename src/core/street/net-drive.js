// The road graph and the geometry of a drive: where a vehicle may stop at the kerb,
// the cheapest way between two kerbs (busy roads counted longer), and the lane line a
// car or two-wheeler follows — right-hand traffic, the inner lane of a trunk road
// before a left turn, the outer one before a right turn and to pull in, lane changes
// mid-block and never in a junction, corners rounded.

import { ZEBRA, MIDBLOCK } from '../world/geometry.js';
import { EPS, clamp, joinPieces, roundCorners, MinHeap } from './net-geom.js';

// Half a car's length: a stopped vehicle keeps this clear of a junction or crossing.
const CAR_HALF = 4.3;
// A lane change is eased over this far either side of where it happens.
export const LANE_EASE = 7;
// Corner radius of a car's turn and of a two-wheeler's.
export const CORNER = { car: 4.2, two: 3 };

export function buildRoadGraph(world) {
  const nodes = world.nodes;
  const riverX = world.river ? (world.river.x0 + world.river.x1) / 2 : 0;
  const junctionAtNode = new Map(world.junctions.map(j => [j.node, j]));
  const crossingAtNode = new Map(world.crossings.filter(c => c.node != null).map(c => [c.node, c]));
  const tunnelOf = new Map(world.tunnels.map(t => [t.street, t]));
  const edges = world.segments.filter(s => s.vehicles).map((s, index) => {
    const A = nodes[s.a], B = nodes[s.b], road = world.roadById.get(s.road);
    const ux = (B.x - A.x) / s.length, uz = (B.z - A.z) / s.length;
    return { index, segment: s.index, a: s.a, b: s.b, length: s.length, road, over: s.over, ux, uz, lanes: road.lanes };
  });
  const adjacency = nodes.map(() => []);
  for (const e of edges) { adjacency[e.a].push(e.index); adjacency[e.b].push(e.index); }
  const edgeBetween = new Map();
  for (const e of edges) { edgeBetween.set(e.a + '-' + e.b, e); edgeBetween.set(e.b + '-' + e.a, e); }

  // How far from node n a vehicle on road `road` keeps a lane change or a stop.
  function clearance(n, road, extra = 0) {
    const J = junctionAtNode.get(n);
    if (J) {
      const cross = world.roadById.get(J.avenue === road.id ? J.street : J.avenue);
      return cross.half + ZEBRA.far + extra;
    }
    if (crossingAtNode.has(n) && crossingAtNode.get(n).street === road.id) return MIDBLOCK.halfWidth + MIDBLOCK.stopBack + extra;
    return 0;
  }
  // Where along each edge (distance from a) a vehicle may stand at the kerb: on land,
  // clear of junctions, crossings and a tunnel's ramp.
  for (const e of edges) {
    e.pickup = null;
    if (e.over !== 'land') continue;
    let lo = Math.max(clearance(e.a, e.road, CAR_HALF + 1.5), CAR_HALF + 1);
    let hi = e.length - Math.max(clearance(e.b, e.road, CAR_HALF + 1.5), CAR_HALF + 1);
    const t = tunnelOf.get(e.road.id);
    if (t && e.road.axis === 'x') {
      // Distances along the edge where |x - river| < portalX + CAR_HALF are in the cutting.
      const ax = nodes[e.a].x, keep = t.portalX + CAR_HALF + 1;
      const inRamp = d => Math.abs(ax + e.ux * d - riverX) < keep;
      if (inRamp(lo) && inRamp(hi)) continue;
      // The edge runs toward or away from the river: trim the ramp end.
      const dRamp = (riverX + Math.sign(ax - riverX || 1) * keep - ax) / (e.ux || 1);
      if (inRamp(hi)) hi = Math.min(hi, dRamp); else if (inRamp(lo)) lo = Math.max(lo, dRamp);
    }
    if (hi - lo > 1) e.pickup = [lo, hi];
  }

  const heap = new MinHeap(64);
  const dist = new Float64Array(nodes.length), back = new Int32Array(nodes.length), viaEdge = new Int32Array(nodes.length);
  // Cheapest node-to-node way, never leaving `from` by edge `notFirst` nor reaching `to`
  // by edge `notLast` (either would be a U-turn on the spot). An edge costs its length
  // times cost(edge, fromNode, toNode) when a cost is given (how busy that way is).
  function search(from, to, notFirst, notLast, cost) {
    dist.fill(Infinity); back.fill(-1); viaEdge.fill(-1);
    heap.clear();
    dist[from] = 0; heap.push(0, from);
    while (heap.size) {
      const u = heap.pop(), du = heap.key;
      if (du > dist[u]) continue;
      if (u === to) break;
      for (const ei of adjacency[u]) {
        if (u === from && ei === notFirst) continue;
        const e = edges[ei], v = e.a === u ? e.b : e.a;
        if (v === to && ei === notLast) continue;
        const nd = du + e.length * (cost ? cost(ei, u, v) : 1);
        if (nd < dist[v]) { dist[v] = nd; back[v] = u; viaEdge[v] = ei; heap.push(nd, v); }
      }
    }
    if (!Number.isFinite(dist[to])) return null;
    const list = [], steps = [];
    for (let v = to; v !== from; v = back[v]) { list.push(v); steps.push({ edge: viaEdge[v], forward: edges[viaEdge[v]].b === v }); if (back[v] < 0) return null; }
    list.push(from);
    list.reverse(); steps.reverse();
    return { cost: dist[to], nodes: list, steps };
  }

  // A drive from kerb P to kerb Q ({edge, d (from a), side: +1 right of a->b, -1 left}).
  // A vehicle at the kerb on the right of a->b faces b. {cost, length, nodes, pieces}:
  // pieces are [{edge, forward, length}] driven in order (partial at both ends).
  function plan(P, Q, cost) {
    const eP = edges[P.edge], eQ = edges[Q.edge];
    const fP = P.side > 0, fQ = Q.side > 0;
    const mult = (e, forward) => (cost ? cost(e.index, forward ? e.a : e.b, forward ? e.b : e.a) : 1);
    if (P.edge === Q.edge && fP === fQ && (fP ? Q.d > P.d + 1 : Q.d < P.d - 1)) {
      const length = Math.abs(Q.d - P.d);
      return { cost: length * mult(eP, fP), length, nodes: [], pieces: [{ edge: eP.index, forward: fP, length }] };
    }
    const depart = fP ? eP.b : eP.a, arrive = fQ ? eQ.a : eQ.b;
    const lenP = fP ? eP.length - P.d : P.d, lenQ = fQ ? Q.d : eQ.length - Q.d;
    let mid;
    if (depart === arrive) {
      if (P.edge === Q.edge) return null;
      mid = { cost: 0, nodes: [depart], steps: [] };
    } else mid = search(depart, arrive, eP.index, eQ.index, cost);
    if (!mid) return null;
    const pieces = [{ edge: eP.index, forward: fP, length: lenP }]
      .concat(mid.steps.map(s => ({ edge: s.edge, forward: s.forward, length: edges[s.edge].length })))
      .concat([{ edge: eQ.index, forward: fQ, length: lenQ }]);
    const length = pieces.reduce((sum, p) => sum + p.length, 0);
    return { cost: lenP * mult(eP, fP) + mid.cost + lenQ * mult(eQ, fQ), length, nodes: mid.nodes, pieces };
  }

  // The point d along edge e, moved `off` to the right of `forward` travel.
  function pointAt(e, d, off = 0, forward = true) {
    const A = nodes[e.a], s = forward ? 1 : -1;
    return { x: A.x + e.ux * d - e.uz * off * s, z: A.z + e.uz * d + e.ux * off * s };
  }

  // The centre-line spine of a drive, merged into straight runs along one road each:
  // [{ax, az, bx, bz, ux, uz, len, road, startNode, endNode, through: [{s, clear}]}].
  function runsOf(P, Q, drive) {
    const eP = edges[P.edge], eQ = edges[Q.edge];
    const pts = [{ ...pointAt(eP, P.d), node: null }];
    for (const n of drive.nodes) pts.push({ x: nodes[n].x, z: nodes[n].z, node: n });
    pts.push({ ...pointAt(eQ, Q.d), node: null });
    const roads = drive.pieces.map(p => edges[p.edge].road);
    const runs = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < EPS) continue;
      const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len, road = roads[Math.min(i, roads.length - 1)];
      const last = runs[runs.length - 1];
      if (last && last.ux * ux + last.uz * uz > 0.999 && last.road === road) {
        last.through.push({ s: last.len, node: a.node, clear: a.node != null ? clearance(a.node, road) : 0 });
        last.bx = b.x; last.bz = b.z; last.len += len; last.endNode = b.node;
      } else runs.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, ux, uz, len, road, startNode: a.node, endNode: b.node, through: [] });
    }
    return runs;
  }

  // Which way a run turns into the next: +1 right, -1 left, 0 straight on (or none).
  const turnOf = (r, s) => { if (!s) return 0; const c = r.ux * s.uz - r.uz * s.ux; return Math.abs(c) > 0.5 ? (c > 0 ? 1 : -1) : 0; };

  // The lane line for these runs: entry and target lane per run, a lane change placed
  // mid-block (the latest point clear of every junction and crossing), joined, rounded.
  // `kind`: 'car' or 'two'; `bus`: keep to the kerb lane throughout.
  function laneLine(runs, kind, bus = false) {
    const pieces = [], lanes = [];
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i], L = r.road.lanesAt, inner = L.car[0], outer = L.car[L.car.length - 1];
      const turn = turnOf(r, runs[i + 1]), lastRun = i === runs.length - 1;
      let entry, target;
      if (kind === 'two') entry = target = L.two;
      else if (bus) entry = target = outer;
      else {
        target = lastRun || turn >= 0 ? outer : inner;
        entry = i === 0 ? outer : turnOf(runs[i - 1], r) < 0 ? inner : outer;
      }
      lanes.push({ entry, target });
      let sc = null;
      if (Math.abs(entry - target) > 1e-6) {
        const lo = (i === 0 ? 4 : (r.startNode != null ? clearance(r.startNode, r.road) : 0)) + LANE_EASE;
        const hi = r.len - (lastRun ? 6 : (r.endNode != null ? clearance(r.endNode, r.road, 8) : 0)) - LANE_EASE;
        const zones = r.through.map(t => [t.s - t.clear - LANE_EASE, t.s + t.clear + LANE_EASE]);
        // The latest point in [lo, hi] outside every zone.
        let best = null;
        const bounds = [hi, ...zones.map(z => z[0])].filter(v => v >= lo && v <= hi).sort((a, b) => b - a);
        for (const v of bounds) if (!zones.some(z => v > z[0] + EPS && v < z[1] - EPS)) { best = v; break; }
        sc = best !== null ? best : r.len / 2;
      }
      if (sc === null) pieces.push({ ax: r.ax, az: r.az, bx: r.bx, bz: r.bz, off: target });
      else {
        const mx = r.ax + r.ux * sc, mz = r.az + r.uz * sc;
        pieces.push({ ax: r.ax, az: r.az, bx: mx, bz: mz, off: entry }, { ax: mx, az: mz, bx: r.bx, bz: r.bz, off: target });
      }
    }
    const joined = joinPieces(pieces, LANE_EASE, 14).points;
    return { points: roundCorners(joined, kind === 'two' ? CORNER.two : CORNER.car), lanes };
  }

  return { nodes, edges, adjacency, edgeBetween, junctionAtNode, crossingAtNode, clearance, search, plan, pointAt, runsOf, laneLine };
}
