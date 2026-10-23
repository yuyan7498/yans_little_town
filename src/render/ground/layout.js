// Splits the board into a grid of rectangles whose edges fall on every road edge, kerb,
// lot edge, canal bank and bridge, and says what each rectangle is. Tiling the ground
// this way (rather than laying slabs over each other) means no two surfaces overlap, so
// nothing can z-fight, and neighbouring pieces share their corners, so nothing can leave
// a crack. No THREE here: pure arithmetic over the world model.
import { Y } from '../../core/world/geometry.js';

const EPS = 1e-6;

// Heights follow bridge decks and tunnel ramps; surfaces that do are cut every GX units
// (on a global grid so markings and asphalt sample the same heights).
export const GX = 2;

// Sorted unique values (within EPS).
function unique(values) {
  const sorted = [...values].sort((a, b) => a - b), out = [];
  for (const v of sorted) if (!out.length || v - out[out.length - 1] > EPS) out.push(v);
  return out;
}

// Points of [a, b] on the global grid, with a and b themselves.
export function gridPoints(a, b, step = GX) {
  const out = [a];
  for (let v = Math.floor(a / step + EPS) * step + step; v < b - EPS; v += step) out.push(v);
  out.push(b);
  return out;
}

export function buildLayout(world) {
  const cfg = world.config, pave = cfg.pavement, board = world.board;
  const water = world.river.halfWidth;
  const promenadeEdge = water + cfg.river.promenade, stripEdge = promenadeEdge + cfg.river.strip;
  const tunnelOf = new Map(world.tunnels.map(t => [t.street, t]));

  // Carriageway rectangles, by what runs on them. A tunnel's covered stretch is not
  // road (its lid is pavement); the ramp is.
  const roadRects = [], pedRects = [];
  for (const s of world.segments) {
    const road = world.roadById.get(s.road), t = tunnelOf.get(s.road);
    const rects = [];
    if (s.axis === 'z') rects.push({ x0: road.x - road.half, x1: road.x + road.half, z0: s.z0, z1: s.z1 });
    else {
      const z0 = road.z - road.half, z1 = road.z + road.half;
      if (t && s.x0 < t.coverX && s.x1 > -t.coverX) {
        if (s.x0 < -t.coverX) rects.push({ x0: s.x0, x1: -t.coverX, z0, z1 });
        if (s.x1 > t.coverX) rects.push({ x0: t.coverX, x1: s.x1, z0, z1 });
      } else rects.push({ x0: s.x0, x1: s.x1, z0, z1 });
    }
    (s.pedestrian ? pedRects : roadRects).push(...rects);
  }
  const allRects = roadRects.concat(pedRects, [{ x0: -stripEdge, x1: stripEdge, z0: board.minZ, z1: board.maxZ }]);
  // Bridges' decks and the footbridges' (the structures module draws their undersides).
  const decks = world.bridges.map(b => ({ b, x0: -b.abutment, x1: b.abutment, z0: b.z - b.width / 2, z1: b.z + b.width / 2 }));

  // ---------------------------------------------------------------- breakpoints
  const xs = [board.minX, board.maxX, -water, water, -promenadeEdge, promenadeEdge, -stripEdge, stripEdge];
  const zs = [board.minZ, board.maxZ];
  for (const r of allRects) {
    xs.push(r.x0, r.x1); zs.push(r.z0, r.z1);
    for (const g of [-pave, pave]) { xs.push(g < 0 ? r.x0 + g : r.x1 + g); zs.push(g < 0 ? r.z0 + g : r.z1 + g); }
  }
  for (const lot of world.lots) { xs.push(lot.x0, lot.x1); zs.push(lot.z0, lot.z1); }
  for (const d of decks) { xs.push(d.x0, d.x1); zs.push(d.z0, d.z1); }
  for (const t of world.tunnels) { xs.push(-t.portalX, t.portalX, -t.coverX, t.coverX); zs.push(t.z - t.halfD, t.z + t.halfD); }
  for (const p of world.promenades) xs.push(p.x);
  const X = unique(xs.filter(v => v >= board.minX - EPS && v <= board.maxX + EPS)), Z = unique(zs.filter(v => v >= board.minZ - EPS && v <= board.maxZ + EPS));

  // ---------------------------------------------------------------- classification
  const inside = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
  const nearest = (x, z) => {                 // Chebyshev distance to the nearest road, ped street or the canal's strips
    let best = Infinity;
    for (const r of allRects) best = Math.min(best, Math.max(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1)));
    return best;
  };
  function classify(x, z) {
    for (const d of decks) {
      if (!inside(d, x, z)) continue;
      if (d.b.kind === 'foot') return { type: 'void', bridge: d.b };
      return { type: Math.abs(z - d.b.z) < d.b.carriageway / 2 ? 'deck-road' : 'deck-walk', bridge: d.b };
    }
    for (const t of world.tunnels) {
      if (Math.abs(z - t.z) < t.halfD && Math.abs(x) > t.coverX && Math.abs(x) < t.portalX) return { type: 'ramp', tunnel: t };
    }
    if (Math.abs(x) < water) return { type: 'river' };
    for (const r of roadRects) if (inside(r, x, z)) return { type: 'road' };
    if (Math.abs(x) < promenadeEdge) return { type: 'promenade' };
    for (const r of pedRects) if (inside(r, x, z)) return { type: 'ped' };
    if (Math.abs(x) < stripEdge) return { type: 'strip' };
    for (const lot of world.lots) if (inside(lot, x, z)) return { type: 'lot', lot };
    return { type: nearest(x, z) <= pave + 0.01 ? 'walk' : 'verge' };
  }

  const cols = X.length - 1, rows = Z.length - 1;
  const grid = [];
  for (let i = 0; i < cols; i++) {
    const column = [];
    for (let j = 0; j < rows; j++) {
      const cell = { i, j, x0: X[i], x1: X[i + 1], z0: Z[j], z1: Z[j + 1], ...classify((X[i] + X[i + 1]) / 2, (Z[j] + Z[j + 1]) / 2) };
      cell.varies = cell.type === 'ramp' || cell.type === 'deck-road' || cell.type === 'deck-walk';
      cell.structure = cell.type === 'deck-road' || cell.type === 'deck-walk';
      column.push(cell);
    }
    grid.push(column);
  }

  // The surface height of a cell at (x, z).
  const roadY = (x, z) => world.heightAt(x, z, 'road');
  function heightIn(cell, x, z) {
    switch (cell.type) {
      case 'road': case 'ramp': case 'deck-road': return roadY(x, z);
      case 'deck-walk': return world.heightAt(x, z, 'foot');
      case 'river': case 'void': return null;
      default: return Y.kerb;
    }
  }
  const cellAt = (i, j) => (i >= 0 && j >= 0 && i < cols && j < rows ? grid[i][j] : null);

  return { X, Z, cols, rows, grid, cells: grid.flat(), cellAt, heightIn, roadY, classify, decks, roadRects, pedRects, water, promenadeEdge, stripEdge };
}
