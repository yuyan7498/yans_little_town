// The three schools: 鎮東國小 (primary), 未來中學 (secondary), 小鎮大學 (university).
// Each is a walled compound with a gate on `site.gate`, the main building on its
// footprint with the entrance at `site.entrance`, and a yard in front. Whatever the lot
// gives (size, facing side, an annex such as the police box on a corner) the layout
// follows: everything is placed from the plot, footprint, gate and annex rectangles.

import { Builder, GLOW, GROUND as G, lrect, grow, freeRect, flagROC, UNIT_SHAPES as U } from './b-kit.js';
import { COL, compoundWall, gateway, tree, bush, bed, lamp, bench, bikes, flagpole, court, corridorBlock, roofPlant, hedge } from './b-parts.js';

const KINDS = ['primary', 'secondary', 'university'];

const LOOK = {
  primary: { board: '#2f9e8f', wall: '#f3e9cf', accents: ['#f0c03a', '#3fa7a0', '#e8705a'], roof: '#2f9e8f', gate: '#fff5dc', yard: '#d9cfbc' },
  secondary: { board: '#27466f', wall: '#ebe8e0', accents: ['#3e6fa8', '#e7e4dc', '#c9483b'], roof: '#6b7480', gate: '#e7e4dc', yard: '#cfcabd' },
  university: { board: '#6b2f2a', wall: '#c98a6a', accents: ['#efe6d2'], roof: '#4c7f74', gate: '#efe6d2', yard: '#d8d0c0' }
};

export function create({ world, quality = 'full' }) {
  const b = new Builder({ world, quality });
  flagROC(b.atlas);
  b.atlas.add('clock', 128, 128, (c, x, y, w, h) => {
    c.fillStyle = '#f7f3e6'; c.beginPath(); c.arc(x + w / 2, y + h / 2, w / 2 - 2, 0, 7); c.fill();
    c.strokeStyle = '#3b4045'; c.lineWidth = 7; c.stroke(); c.lineCap = 'round';
    c.beginPath(); c.moveTo(x + w / 2, y + h / 2); c.lineTo(x + w / 2, y + 22); c.moveTo(x + w / 2, y + h / 2); c.lineTo(x + w / 2 + 28, y + h / 2 + 12); c.stroke();
  });
  for (const site of world.siteList) {
    if (!KINDS.includes(site.kind)) continue;
    const look = LOOK[site.kind];
    b.atlas.text('name:' + site.id, site.name, { background: look.board, color: '#fff8e6', size: 96, pad: 0.22, border: site.kind === 'primary' ? null : '#e8c14c' });
    if (site.kind === 'primary') b.atlas.text('kg:' + site.id, site.name + '附設幼兒園', { background: '#e8705a', color: '#fff8e6', size: 80, pad: 0.22, radius: 0.3 });
    drawSchool(b, site, look);
  }
  const out = b.finish('schools');
  return { group: out.group, update: out.update, dispose: out.dispose, lights: out.lights, info: out.info };
}

export const preview = ctx => create(ctx);

// ------------------------------------------------------------------ one school
function drawSchool(b, site, look) {
  const p = b.site(site), f = p.f, a = f.area, foot = f.foot;
  const ent = f.point(site.entrance) || { x: foot.x1, z: foot.z };
  const gate = f.point(site.gate) || { x: a.x1, z: ent.z };
  const gateW = Math.min(12, a.d * 0.3);
  // The wall runs round the annexes; it opens in front of any annex door and at the gate.
  const gaps = [[gate.z - gateW / 2 - 0.9, gate.z + gateW / 2 + 0.9, true]];
  for (const id of site.annexes || []) {
    const door = b.world.site(id) && b.world.site(id).door;
    if (door) { const d = f.point(door); gaps.push([d.z - 3, d.z + 3, false]); }
  }
  p.pad(a.x0 + 0.4, a.x1 - 0.4, a.z0 + 0.4, a.z1 - 0.4, look.yard, G + 0.05);
  compoundWall(p, { style: site.kind === 'university' ? 'solid' : 'fence', color: look.gate, h: site.kind === 'university' ? 4.2 : 3.8, gaps });
  gateway(p, { z: gate.z, w: gateW, key: 'name:' + site.id, pier: look.gate, board: look.board });
  const ctx = { p, f, a, foot, ent, gate, look, gateW, obstacles: f.annexes.map(r => grow(r, 2)) };
  if (site.kind === 'primary') primary(ctx, site);
  else if (site.kind === 'secondary') secondary(ctx, site);
  else university(ctx, site);
}

// The walkway from the gate to the entrance, and the yard sides left and right of it.
function pathAndSides(c, depth0) {
  const { p, a, ent, gate, look } = c;
  const x0 = c.foot.x1, x1 = a.x1 - 0.4;
  const pw = 4.5;
  p.pad(x0, x1, ent.z - pw, ent.z + pw, '#ece4d2', G + 0.1);
  if (Math.abs(gate.z - ent.z) > pw) p.pad(a.x1 - 6, x1, Math.min(gate.z, ent.z) - pw, Math.max(gate.z, ent.z) + pw, '#ece4d2', G + 0.1);
  const yardX0 = x0 + depth0, yardX1 = a.x1 - 1.6;
  const left = freeRect(lrect(yardX0, yardX1, a.z0 + 1.6, ent.z - pw - 1.4), c.obstacles);
  const right = freeRect(lrect(yardX0, yardX1, ent.z + pw + 1.4, a.z1 - 1.6), c.obstacles);
  return { left, right, yardX0, yardX1, pw };
}

const free = (c, x, z, r) => c.obstacles.every(o => x + r < o.x0 || x - r > o.x1 || z + r < o.z0 || z - r > o.z1);

// Trees along both side walls, where the annex does not stand.
function sideTrees(c, x0, x1, step = 9, kind = 0) {
  const { p, a } = c;
  for (let x = x0; x <= x1; x += step) for (const z of [a.z0 + 3, a.z1 - 3]) if (free(c, x, z, 3)) tree(p, x, z, 0.9 + ((x * 7 + z) % 3) * 0.08, kind);
}

// ------------------------------------------------------------------ primary
function primary(c, site) {
  const { p, foot, ent, look } = c;
  const F = site.floors, H = F * 6, depth = Math.min(12, foot.d * 0.45);
  const fx = foot.x1 - depth / 2;
  // Front classroom block with its corridor facing the yard.
  corridorBlock(p, { cx: fx, cz: foot.z, len: foot.w, depth, floors: F, wall: look.wall, accents: look.accents, roof: '#e8e2d2', glass: '#6aa0b5' });
  const rest = foot.d - depth;
  const wing = 10;
  if (rest > 6) {
    // A rear classroom wing along one side, a gym hall along the other.
    const wl = rest, wx = foot.x0 + rest / 2;
    const gymSide = ent.z >= foot.z ? 1 : -1;
    const oz = gymSide > 0 ? foot.z0 + wing / 2 : foot.z1 - wing / 2;
    corridorBlock(p, { cx: wx, cz: oz, ry: gymSide > 0 ? -Math.PI / 2 : Math.PI / 2, len: wl, depth: wing, floors: F, wall: look.wall, accents: look.accents, roof: '#e8e2d2', glass: '#6aa0b5' });
    const gw = Math.min(24, foot.w - wing - 10);
    const gz = gymSide > 0 ? foot.z1 - gw / 2 : foot.z0 + gw / 2;
    gym(p, wx, gz, wl, gw, look);
    // The courtyard between: sand pit with play frames and a tree.
    const cz = (gymSide > 0 ? foot.z0 + wing + (foot.z1 - gw - foot.z0 - wing) / 2 : foot.z0 + gw + (foot.z1 - wing - foot.z0 - gw) / 2);
    p.pad(foot.x0 + 1, foot.x0 + rest - 1, cz - 5, cz + 5, '#e6d6a8', G + 0.12);
    playFrame(p, wx - 2, cz, look);
    tree(p, wx + 2, cz + 3, 0.8);
    roofPlant(p, lrect(foot.x0 + 2, foot.x0 + 12, foot.z0 + 2, foot.z0 + 8), G + H + 0.7, { tanks: 2, stair: false });
  }
  entrancePavilion(p, foot, ent, F, look);
  const s = pathAndSides(c, 5);
  // Flagpole by the path, a basketball court on the roomier side, planting on the other.
  const big = s.left.w * s.left.d >= s.right.w * s.right.d ? s.left : s.right, small = big === s.left ? s.right : s.left;
  flagpole(p, foot.x1 + 4.5, ent.z + (small === s.right ? 1 : -1) * 8.5);
  // The kindergarten wants a roomy corner; the court takes the other, and gives way if only one fits.
  const fits = r => r.w > 14 && r.d > 12, courtOk = r => r.w > 12 && r.d > 12;
  const kg = fits(small) ? small : fits(big) ? big : null, other = kg === small ? big : small;
  if (kg) kindergarten(c, kg, 'kg:' + site.id);
  if (courtOk(other)) court(p, other.x, other.z, Math.min(26, other.d - 3), Math.min(14, other.w - 3), { color: '#3f7d6e', zone: '#d9694a' });
  else if (other.w > 5 && other.d > 5) { bed(p, other.x0 + 1, other.x0 + 4, other.z0 + 1, other.z1 - 1, '#7fae5f'); bench(p, other.x0 + other.w / 2 + 1, other.z0 + 3, Math.PI / 2); }
  sideTrees(c, s.yardX0 + 2, s.yardX1 - 3, 8);
  lamp(p, foot.x1 + 8, ent.z + 6, { h: 7 }); lamp(p, foot.x1 + 8, ent.z - 18 * 0, { h: 7, lit: false });
  lamp(p, c.a.x1 - 8, ent.z + 8, { h: 7 });
}

function gym(p, x, z, len, wid, look) {
  const h = 10;
  p.span(x - len / 2, x + len / 2, G, G + h, z - wid / 2, z + wid / 2, look.wall);
  p.span(x - len / 2 - 0.1, x + len / 2 + 0.1, G + 1.0, G + 3.0, z - wid / 2 - 0.1, z + wid / 2 + 0.1, look.accents[1]);
  // Curved-look gable roof in the school colour, ridge along the long side.
  p.wedge(x, G + h, z, len + 1.6, 4.6, wid + 1.6, look.roof, Math.PI / 2 * 0);
  p.windows('f', x + len / 2, z - wid / 2 + 2, z + wid / 2 - 2, { floors: 1, y0: G + 4.5, sill: 0, h: 2.8, w: 3, pitch: 5, panes: 2 });
  p.windows('p', z + wid / 2, x - len / 2 + 2, x + len / 2 - 2, { floors: 1, y0: G + 4.5, sill: 0, h: 2.8, w: 3, pitch: 5, panes: 2 });
  p.windows('n', z - wid / 2, x - len / 2 + 2, x + len / 2 - 2, { floors: 1, y0: G + 4.5, sill: 0, h: 2.8, w: 3, pitch: 5, panes: 2 });
}

function playFrame(p, x, z, look) {
  const cols = ['#e8705a', '#f0c03a', '#3fa7a0', '#3e6fa8'];
  for (const dx of [-1.5, 1.5]) for (const dz of [-1.5, 1.5]) p.box(x + dx, G + 0.12, z + dz, 0.3, 4.0, 0.3, COL.steel);
  p.box(x, G + 4.0, z, 4, 0.3, 4, cols[0]);
  p.span(x - 2, x + 2, G + 4.3, G + 5.0, z - 2.1, z - 1.8, cols[1]).span(x - 2, x + 2, G + 4.3, G + 5.0, z + 1.8, z + 2.1, cols[1]);
  p.put(U.box(), x + 4.3, G + 2.2, z, [0, 0, 0.62], [5.4, 0.3, 1.6], cols[2], 'body');
  p.put(U.box(), x, G + 2.2, z + 3.4, [0.7, 0, 0], [1.6, 0.3, 5], cols[3], 'body');
}

// The entrance pavilion: a taller bay with a clock, canopy and glazed doors.
function entrancePavilion(p, foot, ent, floors, look) {
  const x1 = foot.x1, H = floors * 6, w = 13, z = ent.z;
  p.span(x1 - 8, x1 + 0.45, G, G + H + 4.5, z - w / 2, z + w / 2, look.wall);
  p.span(x1 - 8, x1 + 0.5, G + 1.0, G + 2.6, z - w / 2 - 0.1, z + w / 2 + 0.1, look.accents[2]);
  p.span(x1 - 8.4, x1 + 0.9, G + H + 4.5, G + H + 5.1, z - w / 2 - 0.4, z + w / 2 + 0.4, COL.white);
  p.pyramid(x1 - 3.8, G + H + 5.1, z, w - 0.2, 9, 4.8, look.roof);
  p.span(x1, x1 + 4.2, G + 6.6, G + 7.1, z - 5.6, z + 5.6, COL.white);
  p.span(x1, x1 + 4.2, G + 7.1, G + 7.6, z - 5.6, z + 5.6, look.accents[1]);
  for (const s of [-1, 1]) p.span(x1 + 3.4, x1 + 3.9, G, G + 6.6, z + s * 5.3 - 0.25, z + s * 5.3 + 0.25, COL.white);
  p.glowQuad(x1 + 0.56, G + 3.2, z, 7.4, 6.1, 'f', '#4f7f94', '#ffe2b0', 'entry', 1.1);
  p.span(x1 + 0.3, x1 + 0.45, G + 3.0, G + 3.2, z - 4, z + 4, COL.steel);
  p.span(x1 + 0.3, x1 + 0.5, G, G + 6.2, z - 0.1, z + 0.1, COL.white);
  p.sign('clock', 'f', x1 + 0.55, G + H + 1.8, z, 4.6, { h: 4.6, channel: 'sign', power: 0.5 });
  p.windows('f', x1 + 0.45, z - w / 2 + 1.5, z + w / 2 - 1.5, { y0: G + 6, floors: floors - 1, first: 0, sill: 1.6, h: 2.2, w: 2.4, pitch: 3.6, panes: 1 });
  p.light(x1 + 4, G + 6, z, 14, '#ffe2b0', 0.6, 'facade', 'entrance');
}

// ------------------------------------------------------------------ secondary
function secondary(c, site) {
  const { p, foot, ent, look, a } = c;
  const F = site.floors, H = F * 6, depth = Math.min(13, foot.d * 0.5);
  corridorBlock(p, { cx: foot.x1 - depth / 2, cz: foot.z, len: foot.w, depth, floors: F, wall: look.wall, accents: look.accents, roof: '#dcd9d2', glass: '#5f8ea3', cor: 3.2 });
  const rest = foot.d - depth;
  if (rest > 6) {
    const wl = rest, wx = foot.x0 + rest / 2, wing = 10;
    corridorBlock(p, { cx: wx, cz: foot.z0 + wing / 2, ry: -Math.PI / 2, len: wl, depth: wing, floors: F - 1, wall: look.wall, accents: look.accents, roof: '#dcd9d2', glass: '#5f8ea3' });
    corridorBlock(p, { cx: wx, cz: foot.z1 - wing / 2, ry: Math.PI / 2, len: wl, depth: wing, floors: F - 1, wall: look.wall, accents: look.accents, roof: '#dcd9d2', glass: '#5f8ea3' });
    const cz = foot.z;
    p.pad(foot.x0 + 1, foot.x0 + rest - 1, cz - 8, cz + 8, '#98b87e', G + 0.12);
    tree(p, wx, cz, 1.1); bench(p, wx + 2, cz - 6, Math.PI / 2); bench(p, wx + 2, cz + 6, Math.PI / 2);
  }
  // Stair tower with a glazed face over the entrance and a blue canopy.
  const x1 = foot.x1, z = ent.z, w = 12;
  p.span(x1 - 7, x1 + 0.4, G, G + H + 3.5, z - w / 2, z + w / 2, '#f4f2ec');
  p.span(x1 + 0.1, x1 + 0.55, G + 6.6, G + H + 3.2, z - w / 2 + 1.4, z + w / 2 - 1.4, COL.navy);
  p.windows('f', x1 + 0.55, z - w / 2 + 2.6, z + w / 2 - 2.6, { y0: G + 6.6, floors: F - 1, h: 3.4, w: 3, sill: 0.8, pitch: 6, panes: 3, glass: '#6f9fb4', first: 0 });
  p.span(x1 - 7.4, x1 + 0.9, G + H + 3.5, G + H + 4.1, z - w / 2 - 0.4, z + w / 2 + 0.4, COL.white);
  p.span(x1, x1 + 4.4, G + 6.5, G + 7.0, z - 5.5, z + 5.5, '#27466f');
  for (const s of [-1, 1]) p.span(x1 + 3.6, x1 + 4.1, G, G + 6.5, z + s * 5.2 - 0.25, z + s * 5.2 + 0.25, COL.white);
  p.glowQuad(x1 + 0.5, G + 3.1, z, 7, 6.0, 'f', '#4f7f94', '#ffe2b0', 'entry', 1.1);
  p.sign('clock', 'f', x1 + 0.6, G + H + 1.6, z, 3.6, { h: 3.6, channel: 'sign', power: 0.5 });
  roofPlant(p, lrect(foot.x0 + 2, foot.x0 + 14, foot.z0 + 3, foot.z0 + 9), G + (F - 1) * 6 + 0.7, { tanks: 2, stair: false });
  p.light(x1 + 4, G + 6, z, 14, '#ffe2b0', 0.6, 'facade', 'entrance');

  const s = pathAndSides(c, 6);
  // A running track and field on the roomier side; a court on the other.
  const big = s.left.w * s.left.d >= s.right.w * s.right.d ? s.left : s.right, small = big === s.left ? s.right : s.left;
  flagpole(p, foot.x1 + 4.5, ent.z + (small === s.right ? 1 : -1) * 8.5);
  if (big.w > 10 && big.d > 10) {
    p.pad(big.x0, big.x1, big.z0, big.z1, '#c9573f', G + 0.1);
    p.pad(big.x0 + 1.4, big.x1 - 1.4, big.z0 + 1.4, big.z1 - 1.4, '#7fae5f', G + 0.14);
    if (big.w > 16 && big.d > 16) p.pad(big.x0 + 3.6, big.x1 - 3.6, big.z0 + 3.6, big.z1 - 3.6, '#8cb86a', G + 0.16);
  }
  if (small.w > 12 && small.d > 12) court(p, small.x, small.z, Math.min(24, small.d - 3), Math.min(13, small.w - 3), { color: '#3f6f9a', zone: '#d9694a' });
  sideTrees(c, s.yardX0 + 2, s.yardX1 - 2, 9);
  lamp(p, foot.x1 + 9, z - 7, { h: 8 }); lamp(p, a.x1 - 7, z + 7, { h: 8 });
}

// ------------------------------------------------------------------ university
function university(c, site) {
  const { p, foot, ent, look, a } = c;
  const F = site.floors, H = F * 6, depth = Math.min(15, foot.d * 0.55), brick = look.wall, stone = look.gate;
  const x1 = foot.x1, xm = x1 - depth;
  // The main range: brick wall with a stone plinth, stone string courses and grid windows.
  const range = (x0, x1_, z0, z1, floors, face) => {
    const h = floors * 6;
    p.span(x0, x1_, G, G + h, z0, z1, brick);
    p.span(x0 - 0.2, x1_ + 0.2, G, G + 1.4, z0 - 0.2, z1 + 0.2, '#a8a094');
    p.span(x0 - 0.5, x1_ + 0.5, G + h, G + h + 0.9, z0 - 0.5, z1 + 0.5, stone);
    p.span(x0 - 0.3, x1_ + 0.3, G + h + 0.9, G + h + 1.3, z0 - 0.3, z1 + 0.3, '#8c847a');
    for (let f = 1; f < floors; f++) p.span(x0 - 0.15, x1_ + 0.15, G + f * 6 - 0.2, G + f * 6 + 0.2, z0 - 0.15, z1 + 0.15, stone);
    return h;
  };
  range(xm, x1, foot.z0, foot.z1, F, 'f');
  const o = { floors: F, sill: 1.6, h: 3.1, w: 2.5, pitch: 4.4, panes: 2, glass: '#5f8ea3', frame: stone };
  const hallW = 18;
  const side = (z0, z1) => { if (z1 - z0 > 5) p.windows('f', x1, z0, z1, o); };
  side(foot.z0 + 2, foot.z - hallW / 2 - 1); side(foot.z + hallW / 2 + 1, foot.z1 - 2);
  p.windows('p', foot.z1, xm + 2.5, x1 - 2.5, o); p.windows('n', foot.z0, xm + 2.5, x1 - 2.5, o);
  // Central hall: taller, with a two-storey portico of columns and a pediment.
  const zc = ent.z;
  p.span(x1 - 4, x1 + 3.4, G, G + H + 6, zc - hallW / 2, zc + hallW / 2, '#d9a98c');
  p.span(x1 - 4.4, x1 + 3.8, G + H + 6, G + H + 7, zc - hallW / 2 - 0.4, zc + hallW / 2 + 0.4, stone);
  p.pyramid(x1 - 0.2, G + H + 7, zc, hallW + 0.2, 10, 6.5, look.roof);
  p.span(x1 + 3.4, x1 + 5.6, G + 12.2, G + 13, zc - hallW / 2 + 1, zc + hallW / 2 - 1, stone);
  for (let i = 0; i < 4; i++) {
    const z = zc - 6.6 + i * 4.4;
    p.cyl(x1 + 4.8, G, z, 0.8, 12.2, stone, 10);
    p.cyl(x1 + 4.8, G + 11.6, z, 1.1, 0.6, '#c8bfae', 10);
  }
  p.span(x1 + 3.2, x1 + 6.2, G + 13, G + 14.4, zc - hallW / 2 + 0.6, zc + hallW / 2 - 0.6, '#e9e0cc');
  p.sign('name:' + site.id, 'f', x1 + 6.25, G + 13.7, zc, hallW - 3, { h: 1.2, channel: 'sign', power: 0.8 });
  p.glowQuad(x1 + 3.45, G + 3.4, zc, 8.4, 6.8, 'f', '#4f7f94', '#ffe2b0', 'entry', 1.1);
  p.windows('f', x1 + 3.4, zc - 6, zc + 6, { floors: F - 2, y0: G + 14.6, first: 0, sill: 1.2, h: 3.1, w: 2.5, pitch: 4, panes: 2, glass: '#5f8ea3', frame: stone });
  p.sign('clock', 'f', x1 + 3.5, G + H + 3.4, zc, 4.4, { h: 4.4, channel: 'sign', power: 0.5 });
  p.light(x1 + 6, G + 8, zc, 20, '#ffe2b0', 0.7, 'facade', 'entrance');
  // Rear wings round a lawn quad.
  const rest = foot.d - depth;
  if (rest > 6) {
    const wing = 12;
    for (const s of [-1, 1]) {
      const z0 = s < 0 ? foot.z0 : foot.z1 - wing, z1 = s < 0 ? foot.z0 + wing : foot.z1;
      range(foot.x0, xm, z0, z1, F - 1);
      p.windows('f', xm, z0 + 1.5, z1 - 1.5, { ...o, floors: F - 1 });
      p.windows(s < 0 ? 'p' : 'n', s < 0 ? z1 : z0, foot.x0 + 2, xm - 2, { ...o, floors: F - 1 });
      p.windows('b', foot.x0, z0 + 1.5, z1 - 1.5, { ...o, floors: F - 1 });
    }
    p.windows('b', xm, foot.z0 + wing, foot.z1 - wing, o);
    p.pad(foot.x0 + 1, xm - 1, foot.z0 + wing + 1.5, foot.z1 - wing - 1.5, '#8cb86a', G + 0.12);
    tree(p, foot.x0 + rest / 2, foot.z, 1.2);
    roofPlant(p, lrect(xm + 2, x1 - 2, foot.z0 + 3, foot.z0 + 10), G + H + 1.3, { tanks: 2, stair: true });
  }
  // The yard: lawns either side of a stone path with a fountain, rows of trees, benches.
  const s = pathAndSides(c, 8);
  p.pad(foot.x1 + 6.4, a.x1 - 0.4, ent.z - 6.5, ent.z + 6.5, '#e8dfcc', G + 0.12);
  for (const r of [s.left, s.right]) {
    if (r.w < 6 || r.d < 6) continue;
    p.pad(r.x0, r.x1, r.z0, r.z1, '#86b266', G + 0.14);
    p.span(r.x0 - 0.4, r.x1 + 0.4, G + 0.14, G + 0.6, r.z0 - 0.4, r.z0, '#c8bfae'); p.span(r.x0 - 0.4, r.x1 + 0.4, G + 0.14, G + 0.6, r.z1, r.z1 + 0.4, '#c8bfae');
    const nt = Math.max(1, Math.floor(r.d / 12));
    for (let i = 0; i < nt; i++) tree(p, r.x0 + 4, r.z0 + r.d * (i + 0.5) / nt, 1.1);
    bench(p, r.x1 - 3, r.z + (r.z > ent.z ? -1 : 1) * 2, r.z > ent.z ? Math.PI : 0);
  }
  const fx = foot.x1 + 13 + (a.x1 - foot.x1 - 13) * 0.25;
  p.ring(fx, G + 0.15, ent.z, 4.5, 0, '#a8cde0', 20); p.ring(fx, G + 0.5, ent.z, 5, 4.3, '#c8bfae', 20);
  p.cyl(fx, G, ent.z, 0.5, 3, '#c8bfae', 8); p.cyl(fx, G + 3, ent.z, 1.6, 0.4, '#a8cde0', 12);
  bikes(p, foot.x1 + 4.2, a.z1 - 6, 8, Math.PI / 2);
  lamp(p, foot.x1 + 12, ent.z - 7.5, { h: 8 }); lamp(p, foot.x1 + 12, ent.z + 7.5, { h: 8 });
  lamp(p, a.x1 - 6, ent.z - 7.5, { h: 8 }); lamp(p, a.x1 - 6, ent.z + 7.5, { h: 8 });
  void bush; void hedge;
}

// ------------------------------------------------------------------ kindergarten
// 附設幼兒園: a low, bright one-storey house with round windows and a fenced play yard,
// laid out inside the free corner r of the front yard (clear of the path and the gate).
function kindergarten(c, r, key) {
  const { p, ent, a } = c;
  const len = Math.min(20, r.d - 1), zc = r.z, bd = Math.min(7, r.w * 0.34), bx0 = r.x0, bx1 = r.x0 + bd, H = 7;
  const trim = ['#e8705a', '#3fa7a0', '#f0c03a'];
  p.span(bx0, bx1, G, G + H, zc - len / 2, zc + len / 2, '#fdebb0');
  p.span(bx0 - 0.2, bx1 + 0.2, G, G + 1.1, zc - len / 2 - 0.2, zc + len / 2 + 0.2, trim[0]);
  p.span(bx0 - 0.2, bx1 + 0.2, G + H - 1.7, G + H - 0.7, zc - len / 2 - 0.2, zc + len / 2 + 0.2, trim[1]);
  p.wedge((bx0 + bx1) / 2, G + H, zc, bd + 1.4, 2.8, len + 1.4, trim[0]);
  for (const [i, s] of [-1, 1].entries()) { p.cyl(bx1, G, zc + s * len / 2, 0.95, H, trim[2 - i], 12); p.blob(bx1, G + H + 0.3, zc + s * len / 2, 1.0, trim[2 - i], 0.8); }
  const entry = { glow: [GLOW.entry, p.slot, 0], emit: '#ffd79c', power: 1 };
  for (const dz of [-8, -4.6, 4.6, 8]) {
    if (Math.abs(dz) > len / 2 - 1.8) continue;
    p.disc(bx1 + 0.06, G + 4.2, zc + dz, 1.2, '#8fc4d6', 14, 'f', 'glow', entry);
  }
  p.glowQuad(bx1 + 0.08, G + 2.1, zc, 3, 4.2, 'f', '#6aa0b5', '#ffe2b0', 'entry', 1.1);
  p.span(bx1, bx1 + 2.2, G + 4.6, G + 5.1, zc - 2.4, zc + 2.4, trim[2]);
  p.light(bx1 + 3, G + 4, zc, 14, '#ffd9a0', 0.5, 'facade', 'kindergarten');
  // The play yard: soft floor, a picket fence in three colours, open on the side of the path.
  const yx0 = bx1 + 1.4, yx1 = r.x1 - 3, z0 = zc - len / 2, z1 = zc + len / 2, open = ent.z > zc ? z1 : z0;
  if (yx1 - yx0 < 6) return;
  p.pad(yx0, yx1, z0, z1, '#8fd0b0', G + 0.1);
  const run = (ax, az, bx, bz) => {
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 1.1));
    p.beam(ax, az, bx, bz, G + 1.9, 0.2, 0.25, '#ffffff');
    for (let i = 0; i <= n; i++) { const t = i / n; p.box(ax + (bx - ax) * t, G, az + (bz - az) * t, 0.3, 2.3, 0.3, trim[i % 3]); }
  };
  run(yx1, z0, yx1, z1); run(yx0, z0, yx1, z0); run(yx0, z1, yx1, z1);
  void open;
  // Sandbox, slide, climbing frame, tricycles.
  const sx = yx0 + 3.6, sz = z0 + 3.4;
  p.span(sx - 3, sx + 3, G + 0.1, G + 0.9, sz - 3, sz + 3, '#c8995a'); p.span(sx - 2.5, sx + 2.5, G + 0.5, G + 0.95, sz - 2.5, sz + 2.5, '#ecd9a0');
  p.box(sx - 0.8, G + 0.9, sz, 1.4, 0.9, 1.4, '#e8705a'); p.blob(sx + 1.2, G + 1.2, sz + 1, 0.6, '#f0c03a', 0.7);
  const lx = yx1 - 4.5, lz = z1 - 3;
  p.box(lx - 2, G, lz, 2.4, 3.2, 2.4, trim[1]); p.box(lx - 2, G + 3.2, lz, 2.8, 0.3, 2.8, trim[2]);
  p.put(U.box(), lx + 1.6, G + 1.7, lz, [0, 0, 0.62], [4.4, 0.3, 1.6], '#e8705a', 'body');
  playFrame(p, yx0 + (yx1 - yx0) * 0.55, z0 + 4.2, c.look);
  for (const [dx, dz, ry, col] of [[0, 0, 0.5, '#e8705a'], [3, 2.2, -0.4, '#3e6fa8'], [-1, 4.5, 1.2, '#f0c03a']]) tricycle(p, yx0 + 4 + dx, zc + dz - 1, ry, col);
  // The little sign on posts by the wall, at the gate side, facing the street.
  const bx = a.x1 - 1.9, sz2 = r.z;
  for (const dz of [-3.6, 3.6]) p.box(bx, G, sz2 + dz, 0.35, 3.4, 0.35, '#8b6a45');
  p.box(bx, G + 3.0, sz2, 0.3, 2.3, 8.6, '#fdf3d0');
  p.sign(key, 'f', bx + 0.18, G + 4.15, sz2, 8.2, { h: 1.9, channel: 'sign', power: 0.9 });
  void ent;
}

function tricycle(p, x, z, ry, color) {
  p.at(x, G, z, ry, q => {
    q.tube(0.9, 0.5, 0, 0.5, 0.15, '#222', 'z', 8).tube(-0.7, 0.5, 0.55, 0.4, 0.15, '#222', 'z', 8).tube(-0.7, 0.5, -0.55, 0.4, 0.15, '#222', 'z', 8);
    q.box(0, 0.9, 0, 1.8, 0.2, 0.3, color).box(-0.5, 1.1, 0, 0.8, 0.2, 0.7, '#222').box(0.9, 0.9, 0, 0.15, 0.9, 0.15, color).box(0.9, 1.7, 0, 0.15, 0.15, 0.9, '#888');
  });
}
