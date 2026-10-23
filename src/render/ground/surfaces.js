// The flat surfaces of the town: every grid rectangle from layout.js becomes asphalt,
// pavement, paving, lawn or a forecourt, with the kerb faces between pieces of
// different height, the board's skirt, lot edges and paths, park lawns, the pedestrian
// street's inlays and the canal bank's coping.
import { PALETTE } from '../kit.js';
import { unit } from '../../core/random.js';
import { Y } from '../../core/world/geometry.js';
import { gridPoints, GX } from './layout.js';

// Colours of the surfaces, from the kit palette plus the few the town adds.
export const COLOR = {
  asphalt: PALETTE.asphalt, ramp: '#383c41', pavement: '#cdc6b8', kerb: '#dcd7cd', kerbTop: '#e4dfd5', concrete: '#b3ada2', stone: '#e6dfd2',
  verge: PALETTE.grass, lawn: PALETTE.grass, lawnAlt: '#73a054',
  promenadeIn: '#dad6ca', promenadeOut: '#d1cdc0', coping: '#bcb5a6', strip: '#d9cbb0', ped: '#e2d4b8',
  lot: '#d2cabb', path: '#e0d7c4', skirt: '#a8a297', skirtTop: '#e0dacd', plinth: '#6f6a62',
  brick: '#bf6f55', teal: '#4f9a96', cream: '#efe7d6', water: PALETTE.water
};
// Forecourt colour by kind of site: warmer for schools, greyer for industry.
const LOT_COLOR = {
  housing: '#d6cebf', tower: '#d9d4c8', mall: '#dad5c9', 'annex-mall': '#dad5c9', hospital: '#dedbd3', clinic: '#dedbd3', primary: '#d8cbab', secondary: '#d8cbab',
  university: '#d4c8ac', library: '#d9d1c1', civic: '#d9d1c1', precinct: '#cfcfca', bank: '#d9d4c8', market: '#cdc6b6', workshop: '#b9b4aa', depot: '#b3aea4',
  waste: '#aca79d', station: '#c8c5bd', plaza: '#e3d8c4', amusement: '#d3c6b2', sports: '#cbc6b9', park: PALETTE.grass
};

const LIFT = { overlay: 0.015, paint: 0.03 };
export { LIFT };

// ---------------------------------------------------------------- helpers
// A quad strip over [x0, x1] × [z0, z1] following height `h(x, z)`, cut on the global grid
// when the height varies. Faces up.
export function surface(m, x0, x1, z0, z1, h, color, varies = false, lift = 0) {
  const xs = varies ? gridPoints(x0, x1) : [x0, x1];
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i], b = xs[i + 1];
    if (!varies) { m.quad([a, h(a, z0) + lift, z0], [a, h(a, z1) + lift, z1], [b, h(b, z1) + lift, z1], [b, h(b, z0) + lift, z0], color); continue; }
    m.quad([a, h(a, z0) + lift, z0], [a, h(a, z1) + lift, z1], [b, h(b, z1) + lift, z1], [b, h(b, z0) + lift, z0], color);
  }
}

// A vertical face along a straight run p0 → p1 ([x, z]) between two height functions,
// sampled on the grid when the run is along x. `faces` is the unit normal it should face.
function faceWall(m, p0, p1, bottom, top, color, faces) {
  const dx = p1[0] - p0[0], dz = p1[1] - p0[1];
  const nx = -dz, nz = dx;                      // the right-hand normal of p0 → p1
  const flip = nx * faces[0] + nz * faces[1] < 0;
  const a = flip ? p1 : p0, b = flip ? p0 : p1;
  const along = Math.abs(dx) > Math.abs(dz);
  const t0 = along ? Math.min(a[0], b[0]) : 0, t1 = along ? Math.max(a[0], b[0]) : 1;
  const samples = along ? gridPoints(t0, t1) : [0, 1];
  const pts = samples.map(s => along ? [s, a[1]] : [a[0], a[1] + (b[1] - a[1]) * s]);
  if (along && a[0] > b[0]) pts.reverse();
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i], q = pts[i + 1];
    m.wall(p, q, [bottom(p[0], p[1]), bottom(q[0], q[1])], [top(p[0], p[1]), top(q[0], q[1])], color);
  }
}

// ---------------------------------------------------------------- the cells
export function buildSurfaces(G) {
  const { world, layout, M } = G;
  const { cells, cellAt, heightIn } = layout;

  const lotColor = lot => {
    const site = lot.site && world.site(lot.site);
    const base = LOT_COLOR[site ? site.kind : 'housing'] || COLOR.lot;
    return jitter(base, unit('lot:' + lot.id), 0.025);
  };

  for (const cell of cells) {
    const { x0, x1, z0, z1, type } = cell, h = (x, z) => heightIn(cell, x, z);
    switch (type) {
      case 'road': surface(M.road, x0, x1, z0, z1, h, COLOR.asphalt, false); break;
      case 'ramp': surface(M.road, x0, x1, z0, z1, h, COLOR.ramp, true); break;
      case 'deck-road': surface(M.roadS, x0, x1, z0, z1, h, COLOR.asphalt, true); break;
      case 'deck-walk': surface(M.pavingS, x0, x1, z0, z1, h, COLOR.pavement, true); break;
      case 'promenade': {
        const walk = Math.abs(world.promenades[0].x), mid = (x0 + x1) / 2;
        surface(M.paving, x0, x1, z0, z1, h, Math.abs(mid) < walk ? COLOR.promenadeIn : COLOR.promenadeOut); break;
      }
      case 'ped': surface(M.paving, x0, x1, z0, z1, h, COLOR.ped); break;
      case 'strip': surface(M.paving, x0, x1, z0, z1, h, COLOR.strip); break;
      case 'walk': surface(M.paving, x0, x1, z0, z1, h, COLOR.pavement); break;
      case 'verge': lawn(M.grass, x0, x1, z0, z1, COLOR.verge, COLOR.lawnAlt, 8); break;
      case 'lot': {
        const site = cell.lot.site && world.site(cell.lot.site);
        if (site && site.kind === 'park') lawn(M.grass, x0, x1, z0, z1, COLOR.lawn, COLOR.lawnAlt, 5.5);
        else surface(M.slab, x0, x1, z0, z1, h, lotColor(cell.lot));
        break;
      }
      default: break;                   // river, void: drawn by the canal and bridge builders
    }
  }

  // ------------------------------------------------------------ kerb faces and coping
  // Between neighbouring cells of different height: a vertical face toward the lower
  // one, and a pale kerb stone along the higher one's edge.
  function between(A, B, along) {
    if (!A || !B) return;
    const voidish = c => c.type === 'river' || c.type === 'void';
    if (voidish(A) || voidish(B)) return;
    if (A.structure !== B.structure) return;                 // a deck's sides are built with the bridge
    // The tunnel portal (a wall with an opening) is built with the tunnel.
    if (along === 'z' && (A.type === 'ramp' || B.type === 'ramp') && world.tunnels.some(t => Math.abs(Math.abs(A.x1) - t.coverX) < 1e-6)) return;
    const x = along === 'z' ? A.x1 : null, z = along === 'x' ? A.z1 : null;
    const run = along === 'z' ? [[x, A.z0], [x, A.z1]] : [[A.x0, z], [A.x1, z]];
    const samples = along === 'x' && (A.varies || B.varies) ? gridPoints(A.x0, A.x1) : null;
    const hA = (px, pz) => heightIn(A, px, pz), hB = (px, pz) => heightIn(B, px, pz);
    const mid = along === 'z' ? [x, (A.z0 + A.z1) / 2] : [(A.x0 + A.x1) / 2, z];
    const probes = samples ? samples.map(s => [s, z]) : [mid];
    let low = null;
    for (const [px, pz] of probes) {
      const d = hA(px, pz) - hB(px, pz);
      if (Math.abs(d) > 0.004) { low = d < 0 ? A : B; break; }
    }
    if (!low) return;
    const lowC = low, highC = low === A ? B : A;
    const lowH = (px, pz) => heightIn(lowC, px, pz), highH = (px, pz) => heightIn(highC, px, pz);
    const dir = along === 'z' ? [low === A ? -1 : 1, 0] : [0, low === A ? -1 : 1];
    const deep = probes.some(([px, pz]) => highH(px, pz) - lowH(px, pz) > 0.6);
    const m = A.structure ? M.plainS : M.plain;
    faceWall(m, run[0], run[1], lowH, highH, deep ? COLOR.concrete : COLOR.kerb, dir);
    // Kerb stone on the high side's edge (ramps and decks too).
    const w = deep ? 0.55 : 0.4;
    let kx0, kx1, kz0, kz1;
    if (along === 'z') { kz0 = A.z0; kz1 = A.z1; if (highC === A) { kx0 = x - w; kx1 = x; } else { kx0 = x; kx1 = x + w; } }
    else { kx0 = A.x0; kx1 = A.x1; if (highC === A) { kz0 = z - w; kz1 = z; } else { kz0 = z; kz1 = z + w; } }
    const tone = highC.type === 'ped' ? COLOR.brick : deep ? COLOR.coping : COLOR.kerbTop;
    surface(M.paint, kx0, kx1, kz0, kz1, highH, tone, highC.varies, LIFT.paint);
  }
  for (let i = 0; i < layout.cols; i++) for (let j = 0; j < layout.rows; j++) {
    const c = layout.grid[i][j];
    between(c, cellAt(i + 1, j), 'z');
    between(c, cellAt(i, j + 1), 'x');
  }

  skirt(G);
  lotDetails(G);
  parks(G);
  pedestrianStreet(G);
  promenadeCoping(G);
}

function jitter(hex, t, amount) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255, k = 1 + (t - 0.5) * 2 * amount;
  const c = v => Math.max(0, Math.min(255, Math.round(v * k)));
  return '#' + [c(r), c(g), c(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}

// A lawn with two-tone mowing stripes (bands along x, `band` wide).
function lawn(m, x0, x1, z0, z1, a, b, band) {
  const n = Math.max(1, Math.round((z1 - z0) / band));
  for (let k = 0; k < n; k++) {
    const za = z0 + (z1 - z0) * k / n, zb = z0 + (z1 - z0) * (k + 1) / n;
    m.rect(x0, x1, za, zb, Y.kerb, k % 2 ? b : a);
  }
}

// ---------------------------------------------------------------- the board's edge
// A neat skirt round the board (concrete with a pale coping) on a wider dark plinth,
// so the town reads as a diorama.
const SKIRT = { bottom: -6, plinthBottom: -8, plinthOut: 2.6, coping: 0.55 };
function skirt(G) {
  const { world, layout, M } = G;
  const b = world.board, { cellAt, heightIn } = layout;
  const top = (cell, x, z) => { const h = heightIn(cell, x, z); return h === null ? Y.kerb : h; };
  const wallRun = (cell, p0, p1, normal) => {
    const t = (x, z) => top(cell, x, z);
    faceWall(M.plain, p0, p1, () => SKIRT.bottom, (x, z) => t(x, z) - SKIRT.coping, COLOR.skirt, normal);
    faceWall(M.plain, p0, p1, (x, z) => t(x, z) - SKIRT.coping, t, COLOR.skirtTop, normal);
  };
  for (let i = 0; i < layout.cols; i++) {
    wallRun(layout.grid[i][0], [layout.X[i], b.minZ], [layout.X[i + 1], b.minZ], [0, -1]);
    wallRun(layout.grid[i][layout.rows - 1], [layout.X[i], b.maxZ], [layout.X[i + 1], b.maxZ], [0, 1]);
  }
  for (let j = 0; j < layout.rows; j++) {
    wallRun(layout.grid[0][j], [b.minX, layout.Z[j]], [b.minX, layout.Z[j + 1]], [-1, 0]);
    wallRun(layout.grid[layout.cols - 1][j], [b.maxX, layout.Z[j]], [b.maxX, layout.Z[j + 1]], [1, 0]);
  }
  // The plinth: a ledge at SKIRT.bottom and its own wall, all the way round.
  const o = SKIRT.plinthOut, x0 = b.minX - o, x1 = b.maxX + o, z0 = b.minZ - o, z1 = b.maxZ + o, y = SKIRT.bottom, yb = SKIRT.plinthBottom;
  M.plain.quad([x0, y, z0], [x0, y, b.minZ], [x1, y, b.minZ], [x1, y, z0], COLOR.plinth);
  M.plain.quad([x0, y, b.maxZ], [x0, y, z1], [x1, y, z1], [x1, y, b.maxZ], COLOR.plinth);
  M.plain.quad([x0, y, b.minZ], [x0, y, b.maxZ], [b.minX, y, b.maxZ], [b.minX, y, b.minZ], COLOR.plinth);
  M.plain.quad([b.maxX, y, b.minZ], [b.maxX, y, b.maxZ], [x1, y, b.maxZ], [x1, y, b.minZ], COLOR.plinth);
  M.plain.wall([x1, z0], [x0, z0], yb, y, COLOR.plinth); M.plain.wall([x0, z1], [x1, z1], yb, y, COLOR.plinth);
  M.plain.wall([x0, z0], [x0, z1], yb, y, COLOR.plinth); M.plain.wall([x1, z1], [x1, z0], yb, y, COLOR.plinth);
  void cellAt;
}

// ---------------------------------------------------------------- lots
// Every built lot gets a pale kerb round its edge, and a path from the door to the
// pavement (compounds: from the gate to the entrance).
function lotDetails(G) {
  const { world, M } = G;
  for (const lot of world.lots) {
    const site = lot.site && world.site(lot.site);
    if (!site) continue;
    const e = 0.5, y = Y.kerb;
    const edge = (a0, a1, b0, b1) => M.paint.rect(a0, a1, b0, b1, y + LIFT.paint, COLOR.kerbTop);
    // Edge kerb on the sides that face a road, pedestrian street or promenade.
    for (const [side, rect] of [['n', [lot.x0, lot.x1, lot.z0, lot.z0 + e]], ['s', [lot.x0, lot.x1, lot.z1 - e, lot.z1]], ['w', [lot.x0, lot.x0 + e, lot.z0, lot.z1]], ['e', [lot.x1 - e, lot.x1, lot.z0, lot.z1]]]) {
      if (lot.sides[side].kind === 'edge') continue;
      edge(...rect);
    }
    if (site.open_air) continue;
    const pathColor = COLOR.path, wGate = 5, wDoor = 3.4;
    if (site.compound && site.gate && site.entrance) {
      const g = site.gate, en = site.entrance;
      pathBetween(M.overlay, g, en, wGate * 0.7, pathColor);
    } else if (site.door) {
      const d = site.door, nx = d.nx, nz = d.nz;
      // From the door out to the lot's edge on that side.
      const edgeAt = nx ? (nx > 0 ? lot.x1 : lot.x0) : (nz > 0 ? lot.z1 : lot.z0);
      const to = nx ? { x: edgeAt - nx * e, z: d.z } : { x: d.x, z: edgeAt - nz * e };
      pathBetween(M.overlay, d, to, wDoor, pathColor);
    }
  }
}

// A path rectangle between two points on an axis (door → edge), `w` wide.
function pathBetween(m, a, b, w, color) {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z);
  if (x1 - x0 > z1 - z0) m.rect(x0, x1, a.z - w / 2, a.z + w / 2, Y.kerb + LIFT.overlay, color);
  else m.rect(a.x - w / 2, a.x + w / 2, z0, z1, Y.kerb + LIFT.overlay, color);
}

// ---------------------------------------------------------------- parks
function parks(G) {
  const { furniture, M } = G;
  if (!furniture || !furniture.parks) return;
  const y = Y.kerb + LIFT.overlay;
  for (const park of furniture.parks) {
    for (const path of park.paths) M.overlay.ribbon(path.points, path.width, y, COLOR.path, !!path.closed);
    const p = park.plaza;
    if (p) {
      const disc = (r, color, lift) => {
        const pts = [];
        for (let k = 0; k < 40; k++) { const a = k / 40 * Math.PI * 2; pts.push({ x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r }); }
        M.overlay.fan(pts, y + lift, color);
      };
      disc(p.r, COLOR.cream, 0);
      // A teal ring and a centre medallion, painted on top.
      ring(M.paint, p.x, p.z, p.r * 0.80, p.r * 0.88, Y.kerb + LIFT.paint, COLOR.teal);
      ring(M.paint, p.x, p.z, p.r - 0.35, p.r, Y.kerb + LIFT.paint, COLOR.coping);
    }
    const pond = park.pond;
    if (pond) {
      // A stone-rimmed pool standing proud of the lawn (the water itself is the canal mesh's).
      const rim = 0.55, h = 0.5, n = 36, outer = [], inner = [];
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        outer.push({ x: pond.x + c * (pond.rx + rim), z: pond.z + s * (pond.rz + rim) });
        inner.push({ x: pond.x + c * pond.rx, z: pond.z + s * pond.rz });
      }
      for (let k = 0; k < n; k++) {
        const k2 = (k + 1) % n, o0 = outer[k], o1 = outer[k2], i0 = inner[k], i1 = inner[k2];
        M.plain.wall([o1.x, o1.z], [o0.x, o0.z], Y.kerb, Y.kerb + h, COLOR.concrete);
        M.plain.wall([i0.x, i0.z], [i1.x, i1.z], Y.kerb + 0.18, Y.kerb + h, COLOR.concrete);
        M.plain.quad([o0.x, Y.kerb + h, o0.z], [i0.x, Y.kerb + h, i0.z], [i1.x, Y.kerb + h, i1.z], [o1.x, Y.kerb + h, o1.z], COLOR.stone);
      }
      G.ponds.push({ x: pond.x, z: pond.z, rx: pond.rx, rz: pond.rz, y: Y.kerb + 0.36 });
      // The pool's floor under the water.
      M.plain.fan(inner, Y.kerb + 0.18, '#7d9a98');
    }
  }
}
function ring(m, cx, cz, r0, r1, y, color, n = 40) {
  for (let k = 0; k < n; k++) {
    const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2;
    const P = (r, a) => [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
    m.quad(P(r0, a0), P(r0, a1), P(r1, a1), P(r1, a0), color);
  }
}

// ---------------------------------------------------------------- the pedestrian street
// Brick borders along both sides, a pale runner down the middle and inlaid diamonds.
function pedestrianStreet(G) {
  const { world, layout, M } = G;
  const y = Y.kerb + LIFT.overlay, edge = layout.promenadeEdge;
  for (const s of world.segments) {
    if (!s.pedestrian) continue;
    const road = world.roadById.get(s.road), c = road.z, hw = road.half;
    // Trim to the street's own paving: off the avenues' carriageways and the promenades.
    let lo = s.x0, hi = s.x1;
    for (const idx of [s.a, s.b]) {
      const n = world.nodes[idx];
      if (n.kind !== 'junction') continue;
      const half = world.roadById.get(n.avenue).half;
      if (Math.abs(n.x - s.x0) < 1e-6) lo = n.x + half; else hi = n.x - half;
    }
    const spans = [];
    if (hi <= -edge || lo >= edge) spans.push([lo, hi]);
    else { if (lo < -edge) spans.push([lo, -edge]); if (hi > edge) spans.push([edge, hi]); }
    for (const [x0, x1] of spans) {
      M.overlay.rect(x0, x1, c - hw, c - hw + 1.0, y, COLOR.brick);
      M.overlay.rect(x0, x1, c + hw - 1.0, c + hw, y, COLOR.brick);
      M.overlay.rect(x0, x1, c - hw + 1.0, c - hw + 1.35, y, COLOR.cream);
      M.overlay.rect(x0, x1, c + hw - 1.35, c + hw - 1.0, y, COLOR.cream);
      M.overlay.rect(x0, x1, c - 1.9, c + 1.9, y, '#ece3cf');
      for (let x = Math.ceil((x0 + 4) / 8) * 8; x < x1 - 3; x += 8) {
        const k = Math.round(x / 8);
        diamond(M.paint, x, c, 1.5, k % 2 ? COLOR.teal : COLOR.brick, Y.kerb + LIFT.paint);
        diamond(M.paint, x, c, 0.7, COLOR.cream, Y.kerb + LIFT.paint + 0.004);
      }
    }
  }
}
function diamond(m, cx, cz, r, color, y) {
  m.quad([cx - r, y, cz], [cx, y, cz + r], [cx + r, y, cz], [cx, y, cz - r], color);
}

// ---------------------------------------------------------------- the canal bank's coping
// A darker stone band along the water's edge on both promenades, broken where a road
// bridge or a footbridge crosses.
function promenadeCoping(G) {
  const { world, layout, M } = G;
  const water = layout.water, y = Y.kerb + LIFT.overlay;
  const gaps = layout.decks.map(d => [d.z0 - 0.0, d.z1 + 0.0]).sort((a, b) => a[0] - b[0]);
  const z0 = world.board.minZ, z1 = world.board.maxZ;
  let cursor = z0;
  const runs = [];
  for (const [a, b] of gaps) { if (a > cursor) runs.push([cursor, a]); cursor = Math.max(cursor, b); }
  if (cursor < z1) runs.push([cursor, z1]);
  for (const [a, b] of runs) for (const side of [-1, 1]) {
    const xa = side * water, xb = side * (water + 1.1);
    M.overlay.rect(Math.min(xa, xb), Math.max(xa, xb), a, b, y, COLOR.coping);
  }
  G.copingRuns = runs;
}
