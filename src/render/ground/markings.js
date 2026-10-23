// Road paint: double yellow centre lines, white dashed lane dividers, edge lines, zebra
// crossings and stop lines. Zebras and stop lines come straight from the world model
// (junction.zebras / stopLines, crossings), so they sit exactly where the traffic and
// the walkers expect them. All of it is laid on the `paint` mesh, a hair above the road
// and pulled forward in depth so it never flickers against the asphalt.
import { PALETTE } from '../kit.js';
import { ZEBRA } from '../../core/world/geometry.js';
import { surface, LIFT } from './surfaces.js';

const WHITE = PALETTE.marking, YELLOW = PALETTE.markingYellow;
const LINE = 0.17;                       // paint width of lane lines
const DASH = { period: 8, from: 0.8, to: 4.0 };
const EPS = 1e-6;

export function buildMarkings(G) {
  const { world, layout, M } = G;
  const roadY = layout.roadY;

  // Does the road surface in this rectangle follow a bridge arch or a tunnel ramp?
  const varying = (x0, x1, z0, z1) =>
    world.bridges.some(b => b.kind === 'road' && x1 > -b.abutment && x0 < b.abutment && z1 > b.z - b.width / 2 && z0 < b.z + b.width / 2) ||
    world.tunnels.some(t => z1 > t.z - t.halfD && z0 < t.z + t.halfD && ((x1 > t.coverX && x0 < t.portalX) || (x1 > -t.portalX && x0 < -t.coverX)));
  const paint = (x0, x1, z0, z1, color) => {
    if (x1 - x0 < EPS || z1 - z0 < EPS) return;
    surface(M.paint, x0, x1, z0, z1, roadY, color, varying(x0, x1, z0, z1), LIFT.paint);
  };

  // --------------------------------------------------------------- lane lines
  // Where a line along a segment must stop at each end: the stop line's distance from the
  // node (a junction's cross road half + box margin + stop-back; a mid-block crossing's).
  function trimAt(node, road) {
    if (node.kind === 'junction') {
      const j = world.junctions.find(q => q.node === node.index);
      const arm = road.axis === 'x' ? j.hx : j.hz;
      return arm + 5.5;
    }
    const c = world.crossings.find(q => q.node === node.index && q.street === road.id);
    if (c) { const s = c.stopLines[0]; return Math.abs((s.x0 + s.x1) / 2 - c.x); }
    return 0;
  }
  // An interval of the line's own coordinate, drawn at offset `off` from the centre line.
  function lineRun(road, lo, hi, off, color, w = LINE) {
    if (road.axis === 'x') paint(lo, hi, road.z + off - w / 2, road.z + off + w / 2, color);
    else paint(road.x + off - w / 2, road.x + off + w / 2, lo, hi, color);
  }
  function dashedRun(road, lo, hi, off, color) {
    for (let k = Math.floor(lo / DASH.period); k * DASH.period < hi; k++) {
      const a = Math.max(lo, k * DASH.period + DASH.from), b = Math.min(hi, k * DASH.period + DASH.to);
      if (b - a > 0.3) lineRun(road, a, b, off, color);
    }
  }

  const tunnelOf = new Map(world.tunnels.map(t => [t.street, t]));
  for (const seg of world.segments) {
    if (!seg.vehicles) continue;
    const road = world.roadById.get(seg.road);
    const nodeA = world.nodes[seg.a], nodeB = world.nodes[seg.b];
    const coordOf = n => (road.axis === 'x' ? n.x : n.z);
    const [lowNode, highNode] = coordOf(nodeA) < coordOf(nodeB) ? [nodeA, nodeB] : [nodeB, nodeA];
    let lo = coordOf(lowNode) + trimAt(lowNode, road), hi = coordOf(highNode) - trimAt(highNode, road);
    // Under a tunnel's lid there is nothing to see from outside.
    const runs = [[lo, hi]], t = tunnelOf.get(road.id);
    if (t) {
      runs.length = 0;
      if (lo < -t.coverX) runs.push([lo, Math.min(hi, -t.coverX)]);
      if (hi > t.coverX) runs.push([Math.max(lo, t.coverX), hi]);
    }
    const half = road.half;
    for (const [a, b] of runs) {
      if (b - a < 0.3) continue;
      lineRun(road, a, b, -0.22, YELLOW, 0.16); lineRun(road, a, b, 0.22, YELLOW, 0.16);
      if (road.lanes > 1) {
        for (const s of [-1, 1]) {
          dashedRun(road, a, b, s * 4.8, WHITE);
          lineRun(road, a, b, s * 9.15, WHITE, 0.16);
          lineRun(road, a, b, s * (half - 0.4), WHITE, 0.15);
        }
      } else for (const s of [-1, 1]) lineRun(road, a, b, s * (half - 0.4), WHITE, 0.15);
    }
  }

  // --------------------------------------------------------------- zebras
  // Bars run along the traffic, `stripe` wide every `pitch`, centred across the crossing.
  const gap = ZEBRA.pitch - ZEBRA.stripe;
  function zebra(r, trafficAlongX) {
    const across0 = trafficAlongX ? r.z0 : r.x0, across1 = trafficAlongX ? r.z1 : r.x1, L = across1 - across0;
    const n = Math.max(1, Math.floor((L + gap) / ZEBRA.pitch)), used = n * ZEBRA.pitch - gap, start = across0 + (L - used) / 2;
    for (let k = 0; k < n; k++) {
      const a = start + k * ZEBRA.pitch, b = a + ZEBRA.stripe;
      if (trafficAlongX) paint(r.x0, r.x1, a, b, WHITE); else paint(a, b, r.z0, r.z1, WHITE);
    }
  }
  // Stop lines: the world's rectangle widened a little, kept off the centre line.
  function stopLine(r, centre) {
    const w = 0.5, thinX = (r.x1 - r.x0) < (r.z1 - r.z0);
    const lo = thinX ? r.z0 : r.x0, hi = thinX ? r.z1 : r.x1;
    const a = Math.abs(lo - centre) < 1e-3 ? lo + 0.55 : lo + 0.3, b = Math.abs(hi - centre) < 1e-3 ? hi - 0.55 : hi - 0.3;
    if (thinX) { const c = (r.x0 + r.x1) / 2; paint(c - w / 2, c + w / 2, a, b, WHITE); }
    else { const c = (r.z0 + r.z1) / 2; paint(a, b, c - w / 2, c + w / 2, WHITE); }
  }
  for (const j of world.junctions) {
    for (const z of j.zebras) zebra(z, z.walk === 'z');
    for (const s of j.stopLines) stopLine(s, s.arm[1] === 'x' ? j.z : j.x);
  }
  for (const c of world.crossings) {
    zebra(c.zebra, true);
    for (const s of c.stopLines) stopLine(s, c.z);
  }
}
