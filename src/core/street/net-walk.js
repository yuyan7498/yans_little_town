// The walking graph, built from the world model alone. People walk on the pavement
// beside every road (each side its own line, `lanesAt.walk` out from the centre), along
// the riverside promenades, over the footbridges and down the middle of the pedestrian
// street. The only ways from one side of a carriageway to the other are the zebras:
// across each arm of a junction, and where a promenade meets a road bridge (the
// mid-block crossings). Over a tunnel's covered stretch the promenade simply walks on.

import { EPS, closest, clipToBox, MinHeap } from './net-geom.js';

// How far right of the line a walker keeps on a walkway shared both ways (a pavement
// has one line per side, so there the side itself is the keeping right).
export const KEEP = { pavement: 0, zebra: 0, promenade: 1.2, lid: 1.2, foot: 0.6, pedestrian: 2.5 };
// Walking a pavement against the keep-right side costs this much more per unit, so
// people take the right-hand pavement when it costs nothing.
export const KEEP_RIGHT = 0.03;
// Units added for each zebra crossed (waiting at the lights), so walkers do not zigzag.
export const CROSS_PENALTY = 10;

const along = (road, x, z) => (road.axis === 'x' ? x : z);
const pointOn = (road, u, off) => (road.axis === 'x' ? { x: u, z: road.z + off } : { x: road.x + off, z: u });

export function buildWalkGraph(world) {
  const nodes = [], nodeKey = new Map(), edges = [];
  const riverX = world.river ? (world.river.x0 + world.river.x1) / 2 : 0;
  const walkX = world.promenades.length ? Math.min(...world.promenades.map(p => Math.abs(p.x - riverX))) : Infinity;
  const junctionAtNode = new Map(world.junctions.map(j => [j.node, j]));
  const crossingAt = new Map();
  for (const c of world.crossings) crossingAt.set(c.street + '@' + c.x.toFixed(3), c);
  const tunnelOf = new Map(world.tunnels.map(t => [t.street, t]));
  // Over the tunnel's lid the carriageway is underground.
  const covered = (x, z) => world.tunnels.some(t => Math.abs(z - t.z) <= t.halfD + EPS && Math.abs(x - riverX) < t.coverX);

  const node = (x, z) => {
    const key = Math.round(x * 1000) + ',' + Math.round(z * 1000);
    let i = nodeKey.get(key);
    if (i === undefined) { i = nodes.length; nodeKey.set(key, i); nodes.push({ index: i, x, z }); }
    return i;
  };
  const addEdge = (a, b, props) => {
    if (a === b) return null;
    const A = nodes[a], B = nodes[b], length = Math.hypot(B.x - A.x, B.z - A.z);
    const e = { index: edges.length, a, b, length, kind: 'pavement', keep: 0, road: null, side: 0, segment: null, junction: null,
      midblock: false, signal: false, zebra: null, fwd: 1, back: 1, penalty: 0, ...props };
    e.keep = KEEP[e.kind] ?? 0;
    edges.push(e);
    return e;
  };
  const otherRoad = (road, j) => world.roadById.get(j.avenue === road.id ? j.street : j.avenue);

  // ------------------------------------------------------------------ pavements
  // Each road's segments, in order along it, grouped into runs that carry pavements
  // ('paved': traffic beside a pavement, over land or a bridge) or are the pedestrian
  // street ('ped'). Tunnels and the stubs over a tunnel's lid carry neither.
  const pavedRuns = new Map(), pedRuns = new Map();
  const pavements = new Map();          // road id + side -> pavement edges sorted along the road
  for (const road of world.roads) {
    const tunnel = tunnelOf.get(road.id);
    const segs = world.segments.filter(s => s.road === road.id).map(s => {
      const A = world.nodes[s.a], B = world.nodes[s.b], ua = along(road, A.x, A.z), ub = along(road, B.x, B.z);
      return { s, lo: Math.min(ua, ub), hi: Math.max(ua, ub), nlo: ua <= ub ? A : B, nhi: ua <= ub ? B : A };
    }).sort((p, q) => p.lo - q.lo);
    const classOf = g => {
      if (g.s.pedestrian) return 'ped';
      if (!g.s.vehicles || g.s.over === 'tunnel') return null;
      if (tunnel && road.axis === 'x' && Math.abs((g.lo + g.hi) / 2 - riverX) < walkX - EPS) return null;
      return 'paved';
    };
    const runs = [];
    for (const g of segs) {
      const kind = classOf(g);
      if (!kind) continue;
      const last = runs[runs.length - 1];
      if (last && last.kind === kind && Math.abs(last.hi - g.lo) < EPS) { last.hi = g.hi; last.nhi = g.nhi; last.segs.push(g.s); }
      else runs.push({ kind, lo: g.lo, hi: g.hi, nlo: g.nlo, nhi: g.nhi, segs: [g.s] });
    }
    // Where a run's pavement stops: at the corner of the crossing road's pavement, at the
    // promenade, or a step short of the board's edge.
    const clip = (n, dir) => {
      const u = along(road, n.x, n.z);
      if (n.kind === 'junction') return u + dir * otherRoad(road, junctionAtNode.get(n.index)).lanesAt.walk;
      if (n.kind === 'end') return u + dir;
      return u;
    };
    pavedRuns.set(road.id, []); pedRuns.set(road.id, []);
    const roadNodes = world.nodes.filter(n => n.roads.includes(road.id));
    for (const run of runs) {
      const a = clip(run.nlo, 1), b = clip(run.nhi, -1);
      if (b - a < EPS) continue;
      const segAt = u => (run.segs.find(s => u >= along(road, s.x0, s.z0) - EPS && u <= along(road, s.x1, s.z1) + EPS) || run.segs[0]).index;
      if (run.kind === 'ped') {
        pedRuns.get(road.id).push({ a, b });
        const p = pointOn(road, a, 0), q = pointOn(road, b, 0);
        addEdge(node(p.x, p.z), node(q.x, q.z), { kind: 'pedestrian', road: road.id, segment: segAt((a + b) / 2), u0: a, u1: b });
        continue;
      }
      pavedRuns.get(road.id).push({ a, b });
      const w = road.lanesAt.walk;
      for (const side of [-1, 1]) {
        const stations = [a, b], cuts = [];
        for (const n of roadNodes) {
          const u = along(road, n.x, n.z);
          if (u < run.lo - EPS || u > run.hi + EPS) continue;
          const inside = u > a + EPS && u < b - EPS;
          const J = junctionAtNode.get(n.index);
          if (J) {
            const wc = otherRoad(road, J).lanesAt.walk;
            // The crossing road's arm on this side cuts the pavement between the corners.
            const arm = road.axis === 'x' ? (side > 0 ? 'pz' : 'nz') : (side > 0 ? 'px' : 'nx');
            if (inside) stations.push(u - wc, u + wc);
            if (inside && J.arms[arm]) cuts.push([u - wc, u + wc]);
            if (J.walkArms[arm]) stations.push(u);
            for (const zb of J.zebras) {
              if ((road.axis === 'x') !== (zb.walk === 'z')) continue;   // a zebra across this road
              const uc = road.axis === 'x' ? (zb.x0 + zb.x1) / 2 : (zb.z0 + zb.z1) / 2;
              if (uc > a - EPS && uc < b + EPS) stations.push(uc);
            }
          } else if (n.kind === 'promenade' && inside) stations.push(u);
        }
        const list = [...new Set(stations.map(u => Math.round(u * 1e6) / 1e6))].sort((p, q) => p - q);
        const key = road.id + (side > 0 ? '+' : '-'), mine = [];
        for (let i = 0; i + 1 < list.length; i++) {
          const u0 = list[i], u1 = list[i + 1], mid = (u0 + u1) / 2;
          if (cuts.some(([c0, c1]) => mid > c0 + EPS && mid < c1 - EPS)) continue;
          const p = pointOn(road, u0, side * w), q = pointOn(road, u1, side * w);
          const e = addEdge(node(p.x, p.z), node(q.x, q.z), { kind: 'pavement', road: road.id, side, segment: segAt(mid), u0, u1 });
          if (e) mine.push(e);
        }
        pavements.set(key, (pavements.get(key) || []).concat(mine).sort((p, q) => p.u0 - q.u0));
      }
    }
  }

  // ------------------------------------------------------------------ zebras
  const zebras = [];
  for (const J of world.junctions) {
    const av = world.roadById.get(J.avenue), st = world.roadById.get(J.street);
    const wa = av.lanesAt.walk, ws = st.lanesAt.walk;
    for (const zb of J.zebras) {
      let p, q;
      if (zb.walk === 'x') { const zc = (zb.z0 + zb.z1) / 2; p = { x: J.x - wa, z: zc }; q = { x: J.x + wa, z: zc }; }
      else { const xc = (zb.x0 + zb.x1) / 2; p = { x: xc, z: J.z - ws }; q = { x: xc, z: J.z + ws }; }
      const e = addEdge(node(p.x, p.z), node(q.x, q.z), { kind: 'zebra', junction: J.id, signal: !!J.signal, zebra: zb, penalty: CROSS_PENALTY,
        road: zb.walk === 'x' ? av.id : st.id });
      zebras.push({ id: J.id + ':' + zb.arm, junction: J.id, midblock: false, arm: zb.arm, walk: zb.walk, signal: !!J.signal,
        x0: zb.x0, x1: zb.x1, z0: zb.z0, z1: zb.z1, a: p, b: q, edge: e.index });
    }
  }
  for (const c of world.crossings) {
    const st = world.roadById.get(c.street), ws = st.lanesAt.walk;
    const p = { x: c.x, z: c.z - ws }, q = { x: c.x, z: c.z + ws };
    const e = addEdge(node(p.x, p.z), node(q.x, q.z), { kind: 'zebra', junction: c.id, midblock: true, signal: !!c.signal, zebra: c.zebra,
      penalty: CROSS_PENALTY, road: st.id });
    zebras.push({ id: c.id, junction: c.id, midblock: true, arm: null, walk: 'z', signal: !!c.signal,
      x0: c.zebra.x0, x1: c.zebra.x1, z0: c.zebra.z0, z1: c.zebra.z1, a: p, b: q, edge: e.index });
  }

  // ------------------------------------------------------------------ promenades, footbridges
  const footbridges = world.bridges.filter(b => b.kind === 'foot');
  const promenadeEdges = [];
  for (const p of world.promenades) {
    const stations = [p.from, p.to], cuts = [], lids = [];
    for (const s of world.streets) {
      if (s.z < p.from || s.z > p.to) continue;
      const ws = s.lanesAt.walk;
      const through = (pavedRuns.get(s.id) || []).some(r => p.x > r.a + EPS && p.x < r.b - EPS);
      const ends = (pavedRuns.get(s.id) || []).some(r => Math.abs(p.x - r.a) < EPS || Math.abs(p.x - r.b) < EPS);
      const ped = (pedRuns.get(s.id) || []).some(r => Math.abs(p.x - r.a) < EPS || Math.abs(p.x - r.b) < EPS);
      if (through || ends) {
        stations.push(s.z - ws, s.z + ws);
        const span = [s.z - ws, s.z + ws];
        if (covered(p.x, s.z)) lids.push(span);
        else if (through || world.segments.some(g => g.road === s.id && g.vehicles && p.x > g.x0 - EPS && p.x < g.x1 + EPS)) cuts.push(span);
      }
      if (ped) stations.push(s.z);
    }
    for (const f of footbridges) if (f.z > p.from && f.z < p.to) stations.push(f.z);
    const list = [...new Set(stations.map(u => Math.round(u * 1e6) / 1e6))].sort((a, b) => a - b);
    for (let i = 0; i + 1 < list.length; i++) {
      const z0 = list[i], z1 = list[i + 1], mid = (z0 + z1) / 2;
      if (cuts.some(([c0, c1]) => mid > c0 + EPS && mid < c1 - EPS)) continue;
      const lid = lids.some(([c0, c1]) => mid > c0 + EPS && mid < c1 - EPS);
      const e = addEdge(node(p.x, z0), node(p.x, z1), { kind: lid ? 'lid' : 'promenade', u0: z0, u1: z1, promenade: p.side });
      if (e) promenadeEdges.push(e);
    }
  }
  const banks = world.promenades.slice().sort((a, b) => a.x - b.x);
  if (banks.length >= 2) {
    for (const f of footbridges) addEdge(node(banks[0].x, f.z), node(banks[banks.length - 1].x, f.z), { kind: 'foot', bridge: f.id });
  }

  // ------------------------------------------------------------------ costs and adjacency
  for (const e of edges) {
    if (e.kind !== 'pavement') continue;
    const A = nodes[e.a], B = nodes[e.b], road = world.roadById.get(e.road);
    const ux = (B.x - A.x) / e.length, uz = (B.z - A.z) / e.length;
    const ox = road.axis === 'z' ? e.side : 0, oz = road.axis === 'x' ? e.side : 0;
    // Walking a->b with the pavement on the right of the road centre is keeping right.
    const right = -uz * ox + ux * oz > 0;
    e.fwd = right ? 1 : 1 + KEEP_RIGHT;
    e.back = right ? 1 + KEEP_RIGHT : 1;
  }
  const n = nodes.length, outCount = new Int32Array(n + 1), inCount = new Int32Array(n + 1);
  for (const e of edges) { outCount[e.a + 1]++; outCount[e.b + 1]++; inCount[e.a + 1]++; inCount[e.b + 1]++; }
  for (let i = 0; i < n; i++) { outCount[i + 1] += outCount[i]; inCount[i + 1] += inCount[i]; }
  const m = edges.length * 2;
  const outTo = new Int32Array(m), outEdge = new Int32Array(m), outCost = new Float64Array(m);
  const inFrom = new Int32Array(m), inEdge = new Int32Array(m), inCost = new Float64Array(m);
  const oFill = outCount.slice(0, n), iFill = inCount.slice(0, n);
  for (const e of edges) {
    const ab = e.length * e.fwd + e.penalty, ba = e.length * e.back + e.penalty;
    let k = oFill[e.a]++; outTo[k] = e.b; outEdge[k] = e.index; outCost[k] = ab;
    k = oFill[e.b]++; outTo[k] = e.a; outEdge[k] = e.index; outCost[k] = ba;
    k = iFill[e.b]++; inFrom[k] = e.a; inEdge[k] = e.index; inCost[k] = ab;
    k = iFill[e.a]++; inFrom[k] = e.b; inEdge[k] = e.index; inCost[k] = ba;
  }

  // ------------------------------------------------------------------ carriageways
  // Open carriageway boxes (a tunnel's covered stretch left out), for keeping the steps
  // from a door to the pavement off the road.
  const carriageways = [];
  for (const s of world.segments) {
    if (!s.vehicles) continue;
    const road = world.roadById.get(s.road), h = road.half;
    if (road.axis === 'x') {
      const t = tunnelOf.get(road.id);
      const spans = t ? [[s.x0, Math.min(s.x1, riverX - t.coverX)], [Math.max(s.x0, riverX + t.coverX), s.x1]] : [[s.x0, s.x1]];
      for (const [x0, x1] of spans) if (x1 - x0 > EPS) carriageways.push({ x0, x1, z0: road.z - h, z1: road.z + h, axis: 'x', road: road.id, segment: s.index, over: s.over });
    } else carriageways.push({ x0: road.x - h, x1: road.x + h, z0: s.z0, z1: s.z1, axis: 'z', road: road.id, segment: s.index, over: s.over });
  }
  // Does the step from a to b go over an open carriageway (the gutter excepted)?
  function crossesRoad(ax, az, bx, bz, gutter = 0.4) {
    for (const c of carriageways) {
      // Shrink across the road only: the long sides are the kerbs.
      const eastWest = c.axis === 'x';
      const x0 = c.x0 + (eastWest ? 0 : gutter), x1 = c.x1 - (eastWest ? 0 : gutter), z0 = c.z0 + (eastWest ? gutter : 0), z1 = c.z1 - (eastWest ? gutter : 0);
      const hit = clipToBox(ax, az, bx, bz, x0, x1, z0, z1);
      if (hit && (hit[1] - hit[0]) * Math.hypot(bx - ax, bz - az) > 0.02) return true;
    }
    return false;
  }

  // The nearest point of the walking network to (x, z) that can be stepped to without
  // walking over a road: {edge, t, x, z, d} or null.
  function snap(x, z, maxD = 140) {
    let best = null;
    for (const e of edges) {
      if (e.kind === 'zebra') continue;
      const A = nodes[e.a], B = nodes[e.b];
      const c = closest(x, z, A.x, A.z, B.x, B.z);
      if (c.d >= (best ? best.d : maxD)) continue;
      if (c.d > 0.05 && crossesRoad(x, z, c.x, c.z)) continue;
      best = { edge: e.index, t: c.t, x: c.x, z: c.z, d: c.d };
    }
    return best;
  }

  // The pavement edge on `side` of road `roadId` at distance u along it: {edge, t} or null.
  function pavementAt(roadId, side, u) {
    const list = pavements.get(roadId + (side > 0 ? '+' : '-'));
    if (!list) return null;
    for (const e of list) {
      if (u < e.u0 - EPS || u > e.u1 + EPS) continue;
      const A = nodes[e.a], road = world.roadById.get(roadId), ua = along(road, A.x, A.z);
      const t = Math.max(0, Math.min(1, Math.abs(u - ua) / e.length));
      return { edge: e.index, t };
    }
    return null;
  }

  return { nodes, edges, zebras, carriageways, pavements, promenadeEdges, walkX, riverX,
    outStart: outCount, outTo, outEdge, outCost, inStart: inCount, inFrom, inEdge, inCost,
    heap: new MinHeap(256), snap, pavementAt, crossesRoad, covered };
}

// Cheapest walking costs from a point on the network (`end`: {edge, t}) to every node,
// or, reversed, from every node to it. {dist, prev, via, reverse, end}: prev is the node
// one step nearer `end`, via the edge taken.
export function walkTree(g, end, reverse = false) {
  const n = g.nodes.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), via = new Int32Array(n).fill(-1);
  const e = g.edges[end.edge], heap = g.heap;
  heap.clear();
  // From the point toward a is walking b->a; from a toward the point is a->b.
  const toA = end.t * e.length * (reverse ? e.fwd : e.back), toB = (1 - end.t) * e.length * (reverse ? e.back : e.fwd);
  dist[e.a] = toA; dist[e.b] = toB;
  heap.push(toA, e.a); heap.push(toB, e.b);
  const start = reverse ? g.inStart : g.outStart, other = reverse ? g.inFrom : g.outTo;
  const arcEdge = reverse ? g.inEdge : g.outEdge, arcCost = reverse ? g.inCost : g.outCost;
  while (heap.size) {
    const u = heap.pop(), du = heap.key;
    if (du > dist[u]) continue;
    for (let k = start[u]; k < start[u + 1]; k++) {
      const v = other[k], nd = du + arcCost[k];
      if (nd < dist[v]) { dist[v] = nd; prev[v] = u; via[v] = arcEdge[k]; heap.push(nd, v); }
    }
  }
  return { dist, prev, via, reverse, end };
}

// The cheapest way between a tree's own end and `other` (a point on the network):
// {cost, node} where node is where the walk joins (or leaves) other's edge, -1 when it
// goes straight along a shared edge.
export function viaTree(g, tree, other) {
  const A = tree.end, e = g.edges[other.edge];
  let cost, node;
  if (!tree.reverse) {
    const ca = tree.dist[e.a] + other.t * e.length * e.fwd, cb = tree.dist[e.b] + (1 - other.t) * e.length * e.back;
    if (ca <= cb) { cost = ca; node = e.a; } else { cost = cb; node = e.b; }
  } else {
    const ca = other.t * e.length * e.back + tree.dist[e.a], cb = (1 - other.t) * e.length * e.fwd + tree.dist[e.b];
    if (ca <= cb) { cost = ca; node = e.a; } else { cost = cb; node = e.b; }
  }
  if (A.edge === other.edge) {
    const dt = tree.reverse ? A.t - other.t : other.t - A.t;
    const direct = Math.abs(dt) * e.length * (dt >= 0 ? e.fwd : e.back);
    if (direct <= cost) return { cost: direct, node: -1 };
  }
  return { cost, node };
}

// The nodes and edges walked between `node` and the tree's own end, in walking order:
// {nodes, edges} (edges[i] joins nodes[i] and nodes[i + 1]).
export function treeSteps(tree, node) {
  const list = [], via = [];
  for (let v = node; v >= 0; v = tree.prev[v]) {
    list.push(v);
    if (tree.prev[v] >= 0) via.push(tree.via[v]);
    if (list.length > tree.prev.length) break;
  }
  if (!tree.reverse) { list.reverse(); via.reverse(); }
  return { nodes: list, edges: via };
}
