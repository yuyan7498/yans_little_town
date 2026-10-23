// Things that stand or span: the canal's walls and bed, the promenade railing and its
// lanterns, road bridges (arched undersides, parapets, lamp pilasters), the arched
// footbridges with their railings, and the tunnels' portals, fences and dark interiors.
// Everything here goes into the shadow-casting meshes.
import { PALETTE } from '../kit.js';
import { Y } from '../../core/world/geometry.js';
import { BRIDGE, PROMENADE } from '../../core/world/furniture.js';
import { COLOR } from './surfaces.js';

const STONE = ['#cfc8b8', '#c6bfae'];
const WATER_LINE = Y.water, BED = -2.8;
const rails = { metal: PALETTE.metal, dark: PALETTE.darkMetal };

// ---------------------------------------------------------------- the canal
export function buildCanal(G) {
  const { world, M, layout } = G;
  const b = world.board, w = layout.water, top = Y.kerb;
  M.plainS.quad([-w, BED, b.minZ], [-w, BED, b.maxZ], [w, BED, b.maxZ], [w, BED, b.minZ], '#587570');
  const courses = (p0, p1, faces) => {
    const m = M.plainS, bands = [[BED, -1.9, '#587570'], [-1.9, WATER_LINE, '#8d9b96']];
    for (let y = WATER_LINE, k = 0; y < top - 1e-6; y += 0.45, k++) bands.push([y, Math.min(top, y + 0.45), STONE[k % 2]]);
    for (const [y0, y1, c] of bands) {
      const dx = p1[0] - p0[0], dz = p1[1] - p0[1], flip = (-dz) * faces[0] + dx * faces[1] < 0;
      m.wall(flip ? p1 : p0, flip ? p0 : p1, y0, y1, c);
    }
  };
  courses([-w, b.minZ], [-w, b.maxZ], [1, 0]);
  courses([w, b.minZ], [w, b.maxZ], [-1, 0]);
  courses([-w, b.minZ], [w, b.minZ], [0, 1]);
  courses([-w, b.maxZ], [w, b.maxZ], [0, -1]);
  // The water itself (one quad; the ripples are in the shader).
  M.water.quad([-w, WATER_LINE, b.minZ], [-w, WATER_LINE, b.maxZ], [w, WATER_LINE, b.maxZ], [w, WATER_LINE, b.minZ], '#ffffff');
}

// ---------------------------------------------------------------- promenade railing and lanterns
export function buildPromenade(G) {
  const { world, M, furniture } = G;
  const x = world.river.halfWidth + PROMENADE.rail, h = 1.9, base = Y.kerb;
  const m = M.plainS;
  const post = (px, pz) => m.block(px, base, pz, 0.2, h, 0.2, rails.dark);
  for (const [a, b] of G.copingRuns) {
    const z0 = a + 0.4, z1 = b - 0.4;
    if (z1 - z0 < 2) continue;
    for (const s of [-1, 1]) {
      const px = s * x;
      m.beam([px, base + h - 0.1, z0], [px, base + h - 0.1, z1], 0.26, 0.16, rails.metal, true);
      m.beam([px, base + 1.0, z0], [px, base + 1.0, z1], 0.1, 0.1, rails.metal, true);
      m.block(px, base, (z0 + z1) / 2, 0.12, 0.35, z1 - z0, COLOR.concrete);          // low kerb under the rails
      const n = Math.ceil((z1 - z0) / 2);
      for (let k = 0; k <= n; k++) post(px, z0 + (z1 - z0) * k / n);
    }
  }
  // Lantern posts (the plan's `lanterns`): a pole, a cap, and an emissive head.
  for (const l of (furniture && furniture.lanterns) || []) {
    const y0 = Y.kerb, head = l.light.y;
    m.block(l.x, y0, l.z, 0.62, 0.5, 0.62, rails.dark);
    const ph = head - y0 - 1.0;
    m.cylinder(l.x, y0 + 0.5 + ph / 2, l.z, 0.12, 0.17, ph, rails.dark, 8);
    m.block(l.x, head - 0.5, l.z, 0.82, 0.12, 0.82, rails.dark);
    m.block(l.x, head + 0.55, l.z, 0.9, 0.1, 0.9, rails.dark);
    m.cone(l.x, head + 0.9, l.z, 0.55, 0.55, rails.dark, 4, [0, Math.PI / 4, 0]);
    M.glow.block(l.x, head - 0.38, l.z, 0.64, 0.92, 0.64, '#ffffff');
  }
}

// ---------------------------------------------------------------- road bridges
const sampleRange = (a, b, step = 1) => { const out = []; for (let x = a; x < b - 1e-9; x += step) out.push(x); out.push(b); return out; };

export function buildBridges(G) {
  const { world, M, furniture, layout } = G;
  const water = layout.water;

  // Segments of the span: samples every unit plus the canal walls.
  function xsOf(b) {
    return [...new Set([...sampleRange(-b.abutment, b.abutment), -water, water])].sort((p, q) => p - q);
  }
  const top = (b, x, z) => world.heightAt(x, z, 'foot');

  for (const b of world.bridges) {
    if (b.kind === 'road') roadBridge(b); else footBridge(b);
  }

  // The arched underside: thick at the springings, slim at the crown.
  function soffit(b, x, thin, thick) {
    if (Math.abs(x) > water + 1e-9) return Y.kerb;
    const t = Math.abs(x) / water;
    return top(b, x, b.z) - (thin + thick * t * t);
  }
  function fascia(b, sideZ, facing, thin, thick, upper, lower) {
    const xs = xsOf(b), m = M.plainS, cap = 0.42;
    // wall() faces the right of p0 -> p1: along +x that is +z.
    const face = (p, q, y0, y1, color) => {
      if (facing > 0) m.wall([p, sideZ], [q, sideZ], [y0(p), y0(q)], [y1(p), y1(q)], color);
      else m.wall([q, sideZ], [p, sideZ], [y0(q), y0(p)], [y1(q), y1(p)], color);
    };
    for (let i = 0; i + 1 < xs.length; i++) {
      const p = xs[i], q = xs[i + 1], inside = Math.abs((p + q) / 2) < water;
      const bot = x => (inside ? top(b, x, b.z) - (thin + thick * (Math.abs(x) / water) ** 2) : Y.kerb);
      const tp = x => top(b, x, b.z), mid = x => tp(x) - cap;
      face(p, q, bot, mid, lower);
      face(p, q, mid, tp, upper);
    }
  }

  function roadBridge(b) {
    const m = M.plainS, zs = [b.z - b.width / 2, b.z + b.width / 2];
    // Sides: facing outward (north side faces -z, south side +z).
    fascia(b, zs[0], -1, 0.9, 1.7, COLOR.stone, '#b4aea2');
    fascia(b, zs[1], 1, 0.9, 1.7, COLOR.stone, '#b4aea2');
    // Underside, facing down.
    const xs = xsOf(b);
    for (let i = 0; i + 1 < xs.length; i++) {
      const p = xs[i], q = xs[i + 1];
      if (Math.abs((p + q) / 2) > water) continue;
      const yp = soffit(b, p, 0.9, 1.7), yq = soffit(b, q, 0.9, 1.7);
      m.quad([p, yp, zs[0]], [q, yq, zs[0]], [q, yq, zs[1]], [p, yp, zs[1]], '#8e897f');
    }
    // Parapets along both edges, with a coping, from abutment to abutment.
    const cz = [zs[0] + BRIDGE.parapetThick / 2 + 0.05, zs[1] - BRIDGE.parapetThick / 2 - 0.05];
    for (const z of cz) {
      for (let i = 0; i + 1 < xs.length; i++) {
        const p = xs[i], q = xs[i + 1];
        m.beam([p, top(b, p, z) + BRIDGE.parapet / 2, z], [q, top(b, q, z) + BRIDGE.parapet / 2, z], BRIDGE.parapetThick, BRIDGE.parapet, '#d3cdc0');
        m.beam([p, top(b, p, z) + BRIDGE.parapet + 0.07, z], [q, top(b, q, z) + BRIDGE.parapet + 0.07, z], BRIDGE.parapetThick + 0.2, 0.14, COLOR.stone);
      }
    }
    // End posts.
    for (const sx of [-1, 1]) for (const z of cz) {
      const px = sx * (b.abutment - 0.5);
      m.block(px, Y.kerb, z, 1.0, 1.9 + top(b, px, z) - Y.kerb, 1.0, '#c9c2b4');
      m.block(px, top(b, px, z) + 1.9, z, 1.2, 0.18, 1.2, COLOR.stone);
    }
    // Pilasters under the parapet lamps.
    for (const it of (furniture && furniture.items) || []) {
      if (it.style !== 'bridge' || it.bridge !== b.id) continue;
      const low = top(b, it.x, b.z) - 0.6;
      m.block(it.x, low, it.z, 1.1, it.y - low, 1.0, '#cdc6b8');
      m.block(it.x, it.y, it.z, 1.3, 0.14, 1.2, COLOR.stone);
    }
  }

  function footBridge(b) {
    const m = M.plainS, zs = [b.z - b.width / 2, b.z + b.width / 2], xs = [...new Set([...sampleRange(-b.abutment, b.abutment, 0.55), -water, water])].sort((p, q) => p - q);
    const woods = ['#b4875e', '#a67a52', '#b88d63'];
    const ytop = x => world.heightAt(x, b.z, 'foot');
    // Deck planks.
    for (let i = 0; i + 1 < xs.length; i++) {
      const p = xs[i], q = xs[i + 1];
      m.quad([p, ytop(p), zs[0]], [p, ytop(p), zs[1]], [q, ytop(q), zs[1]], [q, ytop(q), zs[0]], woods[i % 3]);
    }
    // Sides and the arched underside.
    const thin = 0.5, thick = 0.95;
    const bot = (x, mid) => (Math.abs(mid) < water ? ytop(x) - (thin + thick * (Math.min(1, Math.abs(x) / water)) ** 2) : Y.kerb);
    for (let i = 0; i + 1 < xs.length; i++) {
      const p = xs[i], q = xs[i + 1], mid = (p + q) / 2;
      m.wall([q, zs[0]], [p, zs[0]], [bot(q, mid), bot(p, mid)], [ytop(q), ytop(p)], '#7a5d43');
      m.wall([p, zs[1]], [q, zs[1]], [bot(p, mid), bot(q, mid)], [ytop(p), ytop(q)], '#7a5d43');
      if (Math.abs(mid) < water) m.quad([p, bot(p, mid), zs[0]], [q, bot(q, mid), zs[0]], [q, bot(q, mid), zs[1]], [p, bot(p, mid), zs[1]], '#5e4833');
    }
    // Railings: posts, a top rail and a mid rail.
    const rx = sampleRange(-b.abutment, b.abutment, 1.7);
    for (const z of [zs[0] + 0.18, zs[1] - 0.18]) {
      for (let i = 0; i + 1 < rx.length; i++) {
        const p = rx[i], q = rx[i + 1];
        m.beam([p, ytop(p) + 1.5, z], [q, ytop(q) + 1.5, z], 0.22, 0.16, '#d9b98f');
        m.beam([p, ytop(p) + 0.8, z], [q, ytop(q) + 0.8, z], 0.09, 0.09, rails.metal);
      }
      for (const px of rx) m.block(px, ytop(px) - 0.05, z, 0.2, 1.65, 0.2, rails.dark);
    }
  }
}

// ---------------------------------------------------------------- tunnels
export function buildTunnels(G) {
  const { world, M, layout } = G;
  const m = M.plainS;
  // CLEAR: headroom for a bus (5.8 with its roof units); with data/town.js tunnel.drop the
  // ceiling stays below the canal's water.
  const FRAME = 0.95, CLEAR = 6.4, DEPTH = 16, FLOOR = '#26292d', WALL = '#34383d', LIGHT = '#fff0c4';
  for (const t of world.tunnels) {
    const floorY = layout.roadY(t.coverX, t.z), roofY = floorY + CLEAR, z0 = t.z - t.halfD, z1 = t.z + t.halfD;
    for (const sgn of [-1, 1]) {
      const xp = sgn * t.coverX, inner = sgn * (t.coverX - DEPTH);
      const out = x => xp + sgn * x;                              // outward from the portal
      // The facade: two piers and a lintel, standing proud of the cutting's end wall.
      const face = Y.kerb + 0.12;
      m.box(out(0.25), floorY, z0 + FRAME / 2, 0.5, roofY - floorY, FRAME, '#d1cabc', ['bottom']);
      m.box(out(0.25), floorY, z1 - FRAME / 2, 0.5, roofY - floorY, FRAME, '#d1cabc', ['bottom']);
      m.box(out(0.25), roofY, t.z, 0.5, face - roofY, t.halfD * 2, '#d8d2c5', ['bottom']);
      // Interior: floor, side walls, ceiling, end wall, a few ceiling lamps.
      const lo = Math.min(xp, inner), hi = Math.max(xp, inner), zi0 = z0 + FRAME, zi1 = z1 - FRAME;
      m.quad([lo, floorY, zi0], [lo, floorY, zi1], [hi, floorY, zi1], [hi, floorY, zi0], FLOOR);
      m.quad([lo, roofY, zi0], [hi, roofY, zi0], [hi, roofY, zi1], [lo, roofY, zi1], WALL);
      m.wall([lo, zi0], [hi, zi0], floorY, roofY, WALL); m.wall([hi, zi1], [lo, zi1], floorY, roofY, WALL);
      if (sgn > 0) m.wall([inner, zi1], [inner, zi0], floorY, roofY, '#0b0c0e'); else m.wall([inner, zi0], [inner, zi1], floorY, roofY, '#0b0c0e');
      // Centre line inside (so the road reads as continuing).
      const { paint } = G.M;
      paint.rect(lo, hi, t.z - 0.22 - 0.08, t.z - 0.22 + 0.08, floorY + 0.03, PALETTE.markingYellow);
      paint.rect(lo, hi, t.z + 0.22 - 0.08, t.z + 0.22 + 0.08, floorY + 0.03, PALETTE.markingYellow);
      for (let k = 2.5; k < DEPTH - 1; k += 4) M.tunnelLight.box(xp - sgn * k, roofY - 0.14, t.z, 0.7, 0.14, 5, LIGHT, ['top']);
    }
    // Guard fence along both edges of the cutting, on the pavement beside it.
    for (const sgn of [-1, 1]) for (const zs of [-1, 1]) {
      const z = t.z + zs * (t.halfD + 0.3), xa = sgn * t.coverX, xb = sgn * t.portalX;
      const lo = Math.min(xa, xb), hi = Math.max(xa, xb);
      m.beam([lo, Y.kerb + 1.55, z], [hi, Y.kerb + 1.55, z], 0.16, 0.14, rails.metal, true);
      m.beam([lo, Y.kerb + 0.85, z], [hi, Y.kerb + 0.85, z], 0.1, 0.1, rails.metal, true);
      const n = Math.ceil((hi - lo) / 4);
      for (let k = 0; k <= n; k++) m.block(lo + (hi - lo) * k / n, Y.kerb, z, 0.18, 1.62, 0.18, rails.dark);
    }
  }
}
