// The riverside night market: one booth per world.stalls entry (counter facing the
// seats, a cooker, a striped awning and a lit sign with the stall's name), the stools
// and round tables exactly where the world put the seats, poles with strings of bulbs
// and paper lanterns along both strips. By day the booths are shuttered; the lights
// come on with the market hours (18:00).

import * as THREE from 'three';
import { ShapeBuilder, material } from '../kit.js';
import {
  Glows, beam, mesh, litMaterial, setLevel, pointScale, moduleBase, lightSource, marketLevel, noise, MARKET_OPEN
} from './common.js';

// Awning colour pairs (stripe A, stripe B) and the booth's wall colour, picked per stall.
const AWNINGS = [
  ['#d9483b', '#f6efe0'], ['#2f8f88', '#f6efe0'], ['#eeb62e', '#d9483b'], ['#3e6fa8', '#f6efe0'],
  ['#5a9a4a', '#f6efe0'], ['#e8749a', '#f6efe0'], ['#ee8a2e', '#f6efe0'], ['#35466b', '#e9dfc8'],
  ['#8a5fb0', '#f6efe0'], ['#c9483b', '#eeb62e']
];
const WALLS = ['#f1e7d0', '#e8dcc2', '#f4efe4', '#ead9bd'];
const STOOLS = ['#d9483b', '#3e6fa8', '#eeb62e', '#2f8f88'];
const STEEL = '#b9c0c6', STEEL_DARK = '#7d868e', WOOD = '#c59a66', WOOD_DARK = '#8a6240';
const BULB = '#ffd89a', LANTERN = '#f0442f';

const BOOTH = { back: 7.5, awningFront: 6.1, awningReach: 2.0, counterTop: 3.0, counterDepth: 0.95 };
const POLE = { inset: 28.4, height: 9.8 };
const STRING = { sag: 0.85, bulbs: 8 };

const hashName = s => [...s].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7);

// ------------------------------------------------------------------ one stall
function addStall(sb, lit, glows, stall, k) {
  const h = hashName(stall.name) + k * 7;
  const [colA, colB] = AWNINGS[h % AWNINGS.length];
  const wall = WALLS[(h >> 3) % WALLS.length];
  const dirX = Math.cos(stall.counterFacing) >= 0 ? 1 : -1;
  const { booth } = stall, z0 = booth.z, w = booth.w, d = booth.d;
  const backX = booth.x - dirX * w / 2, frontX = booth.x + dirX * w / 2;
  const at = (back, y, lz) => [backX + dirX * back, y, z0 + lz];
  const box = (back0, back1, y0, y1, lz0, lz1, color) => {
    const xa = backX + dirX * back0, xb = backX + dirX * back1;
    sb.block((xa + xb) / 2, y0, z0 + (lz0 + lz1) / 2, Math.abs(xb - xa), y1 - y0, lz1 - lz0, color);
  };
  const half = d / 2;

  // Back wall with a coloured band, and low side walls. (The bands wrap a little wider than
  // the walls: faces of the two in one plane would flicker.)
  box(0, 0.35, 0, BOOTH.back, -half, half, wall);
  box(-0.04, 0.4, BOOTH.back - 1.3, BOOTH.back - 0.4, -half - 0.04, half + 0.04, colA);
  for (const s of [-1, 1]) {
    box(0, w - 1.0, 0, 4.2, s * (half - 0.2), s * half, wall);
    box(-0.04, w - 0.96, 4.0, 4.2, s * (half - 0.28), s * (half + 0.04), colA);
  }
  // Counter: wooden top with a lip, coloured front, and the work table behind it.
  const cx0 = w - BOOTH.counterDepth - 0.1, cx1 = w + 0.15;
  box(cx0, cx1, 0, BOOTH.counterTop - 0.18, -half + 0.05, half - 0.05, colA);
  box(cx0 - 0.1, cx1 + 0.12, BOOTH.counterTop - 0.18, BOOTH.counterTop, -half - 0.05, half + 0.05, WOOD);
  box(0.4, 2.0, 0, 2.7, -half + 0.4, half - 0.4, STEEL);
  box(0.4, 2.0, 2.7, 2.85, -half + 0.35, half - 0.35, STEEL_DARK);

  cooker(sb, k + (h >> 5), at, box, half, colA);

  // Menu board on the back wall: warm lit panel with coloured lines of "writing".
  const menuY = BOOTH.back - 3.3;
  lit.block(backX + dirX * 0.4, menuY, z0 - 1.6, 0.12, 2.0, 3.0, '#fff1c8');
  for (let i = 0; i < 4; i++) sb.block(backX + dirX * 0.47, menuY + 0.3 + i * 0.4, z0 - 1.6, 0.04, 0.16, 1.6 + (i % 2) * 0.8, i % 2 ? colA : '#6a5a48');
  // Light strips under the awning, warm.
  lit.block(frontX + dirX * 0.9, BOOTH.awningFront - 0.5, z0, 0.3, 0.12, d - 0.8, '#fff0c0');

  // Awning: sloped stripes from the back wall top to beyond the counter, with a scalloped edge.
  const reach = w + BOOTH.awningReach;
  const slope = Math.atan2(BOOTH.back - BOOTH.awningFront, reach), len = Math.hypot(reach, BOOTH.back - BOOTH.awningFront);
  const stripes = 7, sw = (d + 0.6) / stripes;
  const midX = backX + dirX * reach / 2, midY = (BOOTH.back + BOOTH.awningFront) / 2 + 0.05;
  for (let i = 0; i < stripes; i++) {
    const lz = -(d + 0.6) / 2 + sw * (i + 0.5), col = i % 2 ? colB : colA;
    sb.box(midX, midY, z0 + lz, len, 0.2, sw, col, [0, 0, -dirX * slope]);
    const fy = BOOTH.awningFront - 0.2 - (i % 2 ? 0.25 : 0.45);
    sb.block(backX + dirX * reach, fy - 0.1, z0 + lz, 0.14, (i % 2 ? 0.55 : 0.75), sw, col);
  }
  // The warm underside of the awning, lit with the bulbs.
  lit.add(new THREE.BoxGeometry(len - 0.4, 0.05, d - 0.2), lit.transform(midX, midY - 0.16, z0, [0, 0, -dirX * slope]), '#ffd9a0');
  // Awning posts at the front corners.
  for (const s of [-1, 1]) {
    sb.block(backX + dirX * (reach - 0.25), 0, z0 + s * (half + 0.15), 0.26, BOOTH.awningFront, 0.26, STEEL_DARK);
    lit.sphere(backX + dirX * (reach - 0.25), BOOTH.awningFront - 1.0, z0 + s * (half + 0.15), 0.28, '#fff3d0', 6, 5);
  }
  // Bulbs under the awning's front edge.
  for (let i = 0; i < 6; i++) glows.add(backX + dirX * (reach - 0.15), BOOTH.awningFront - 0.75, z0 - half + 0.3 + (i * (d - 0.6)) / 5, BULB, 1.5);
  glows.add(backX + dirX * (reach - 1.6), BOOTH.awningFront - 0.9, z0, '#ffe2a8', 6);

  // The sign stands on the awning's front edge; its board is drawn here, the writing in signs.
  const signX = backX + dirX * (reach - 0.55), signY = BOOTH.awningFront + 0.62, signW = d - 0.4, signH = 1.9;
  sb.block(signX - dirX * 0.08, signY, z0, 0.22, signH + 0.35, signW + 0.35, WOOD_DARK);
  for (const s of [-1, 1]) sb.block(signX - dirX * 0.1, BOOTH.awningFront - 0.1, z0 + s * (signW / 2 - 0.2), 0.16, 0.8, 0.16, STEEL_DARK);
  return { signX: signX + dirX * 0.05, signY: signY + 0.17, signZ: z0, signW, signH, dirX, colA, colB };
}

// The cooker and its odds and ends on the work table, a different one per stall.
function cooker(sb, variant, at, box, half, accent) {
  const top = 2.85, z = (lz) => lz;
  const pos = (back, lz) => at(back, top, lz);
  const cyl = (back, lz, y, r, hgt, color, seg = 10) => { const [x, , zz] = at(back, y, lz); sb.cylinder(x, y + hgt / 2, zz, r, r, hgt, color, seg); };
  const cone = (back, lz, y, r, hgt, color) => { const [x, , zz] = at(back, y, lz); sb.cone(x, y + hgt / 2, zz, r, hgt, color, 10); };
  void z; void pos;
  switch (variant % 6) {
    case 0: // bamboo steamers
      for (const lz of [-1.3, 1.3]) { cyl(1.2, lz, top, 0.85, 0.7, '#d3a96a'); cyl(1.2, lz, top + 0.7, 0.8, 0.6, '#c89a58'); cone(1.2, lz, top + 1.3, 0.9, 0.5, '#b78447'); }
      break;
    case 1: // drink dispensers and a stack of cups
      for (const [lz, col] of [[-1.9, '#d9483b'], [-0.7, '#eeb62e'], [0.5, '#3f8f88']]) { cyl(1.1, lz, top, 0.42, 1.7, '#e9f3f6'); cyl(1.1, lz, top + 1.7, 0.45, 0.22, col); }
      cyl(1.2, 1.8, top, 0.4, 0.9, '#f6f1e6');
      break;
    case 2: // flat griddle with domes
      box(0.7, 1.9, top, top + 0.35, -2.0, 2.0, '#3b4045');
      for (const lz of [-1.2, 0, 1.2]) { const [x, , zz] = at(1.3, top, lz); sb.sphere(x, top + 0.5, zz, 0.55, '#d9a24a', 8, 5, [1, 0.55, 1]); }
      break;
    case 3: // fryer with a hood
      box(0.6, 1.9, top, top + 0.9, -1.8, 0.2, STEEL_DARK);
      box(0.6, 1.9, top + 0.9, top + 1.0, -1.7, 0.1, '#e8b94a');
      box(0.4, 1.6, top + 3.0, top + 3.7, -2.3, 0.6, STEEL);
      box(1.7, 1.95, top, top + 1.1, 0.9, 2.5, '#d9483b');
      break;
    case 4: // big stock pot and ladle
      cyl(1.3, -1.0, top, 0.95, 1.2, STEEL); cyl(1.3, -1.0, top + 1.2, 1.0, 0.12, STEEL_DARK);
      cyl(1.3, 1.5, top, 0.55, 0.8, '#d9483b'); cyl(1.3, 1.5, top + 0.8, 0.6, 0.1, STEEL_DARK);
      break;
    default: // glass display of treats
      box(0.7, 1.9, top, top + 1.4, -2.0, 2.0, '#d3e8ee');
      box(0.8, 1.8, top + 0.15, top + 0.4, -1.9, 1.9, accent);
      box(0.8, 1.8, top + 0.8, top + 1.0, -1.9, 1.9, '#d8a05a');
  }
}

// ------------------------------------------------------------------ seats
function addSeats(sb, stall, k) {
  const seats = stall.seats;
  seats.forEach((seat, i) => {
    const col = STOOLS[(k + i) % STOOLS.length];
    sb.cylinder(seat.x, 0.1, seat.z, 0.5, 0.5, 0.2, STEEL_DARK, 8);
    sb.cylinder(seat.x, seat.y / 2, seat.z, 0.1, 0.1, seat.y, STEEL_DARK, 6);
    sb.cylinder(seat.x, seat.y - 0.08, seat.z, 0.5, 0.5, 0.16, col, 10);
  });
  if (stall.type === 'table') {
    const cx = seats.reduce((s, p) => s + p.x, 0) / seats.length, cz = seats.reduce((s, p) => s + p.z, 0) / seats.length;
    const cloth = k % 2 ? '#f2eadb' : '#d9594a';
    sb.cylinder(cx, 0.08, cz, 0.8, 0.8, 0.16, STEEL_DARK, 10);
    sb.cylinder(cx, 1.3, cz, 0.16, 0.16, 2.6, STEEL_DARK, 6);
    sb.cylinder(cx, 2.68, cz, 1.2, 1.2, 0.14, cloth, 14);
    sb.cylinder(cx, 2.62, cz, 1.28, 1.2, 0.18, k % 2 ? '#e0d3b8' : '#b8382c', 14);
    // Condiments and a chopstick pot in the middle.
    sb.cylinder(cx, 2.95, cz, 0.18, 0.18, 0.5, '#e8b94a', 6);
    sb.cylinder(cx + 0.4, 2.85, cz - 0.3, 0.13, 0.13, 0.3, '#c9483b', 6);
  }
}

// ------------------------------------------------------------------ poles and strings
function polesOf(world) {
  const out = { poles: [], spans: [] };
  for (const bank of [-1, 1]) {
    const stalls = world.stalls.filter(s => s.bank === bank).sort((a, b) => a.z - b.z);
    const zs = [];
    for (const s of stalls) for (const dz of [-s.d / 2 - 0.4, s.d / 2 + 0.4]) {
      const z = s.z + dz;
      if (!zs.some(v => Math.abs(v - z) < 0.9)) zs.push(z);
    }
    zs.sort((a, b) => a - b);
    const pts = zs.map(z => ({ x: bank * POLE.inset, z, bank }));
    out.poles.push(...pts);
    for (let i = 0; i + 1 < pts.length; i++) if (pts[i + 1].z - pts[i].z < 12) out.spans.push([pts[i], pts[i + 1]]);
  }
  return out;
}

function addStrings(sb, lit, glows, plan, quality) {
  const nb = quality === 'lite' ? 5 : STRING.bulbs;
  for (const p of plan.poles) {
    sb.block(p.x, 0, p.z, 0.8, 0.4, 0.8, STEEL_DARK);
    sb.cylinder(p.x, POLE.height / 2, p.z, 0.14, 0.2, POLE.height, '#4a5258', 6);
    sb.sphere(p.x, POLE.height + 0.1, p.z, 0.3, '#4a5258', 6, 5);
  }
  plan.spans.forEach(([a, b], si) => {
    const y0 = POLE.height - 0.3;
    let prev = [a.x, y0, a.z];
    for (let i = 1; i <= nb; i++) {
      const t = i / nb, sag = STRING.sag * 4 * t * (1 - t) * Math.min(1.4, (b.z - a.z) / 8.5);
      const cur = [a.x, y0 - sag, a.z + (b.z - a.z) * t];
      beam(sb, prev, cur, 0.05, '#2f3438', 4);
      if (i < nb) {
        lit.sphere(cur[0], cur[1] - 0.18, cur[2], 0.2, BULB, 6, 4);
        glows.add(cur[0], cur[1] - 0.18, cur[2], BULB, 1.9);
      }
      prev = cur;
    }
    // Paper lanterns in the middle of every other span.
    if (si % 2 === 0 || quality !== 'lite') {
      const t = 0.5, sag = STRING.sag * Math.min(1.4, (b.z - a.z) / 8.5), x = a.x, z = a.z + (b.z - a.z) * t, y = y0 - sag - 1.35;
      beam(sb, [x, y0 - sag, z], [x, y + 0.7, z], 0.04, '#2f3438', 3);
      lit.sphere(x, y, z, 0.66, LANTERN, 10, 7, [0.9, 1.2, 0.9]);
      sb.cylinder(x, y + 0.8, z, 0.26, 0.3, 0.12, '#c89a3a', 6);
      sb.cylinder(x, y - 0.8, z, 0.26, 0.3, 0.12, '#c89a3a', 6);
      glows.add(x, y, z, '#ff7a4a', 4.6);
    }
  });
}

// ------------------------------------------------------------------ signs (one atlas, one draw call)
function signAtlas(stalls, looks) {
  const cols = 4, rows = Math.ceil(stalls.length / cols), cw = 320, ch = 100;
  const canvas = document.createElement('canvas');
  canvas.width = cols * cw; canvas.height = rows * ch;
  const g = canvas.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  stalls.forEach((s, i) => {
    const cx = (i % cols) * cw, cy = Math.floor(i / cols) * ch, look = looks[i];
    g.fillStyle = look.colA; g.fillRect(cx, cy, cw, ch);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(cx, cy, cw, 10);
    g.strokeStyle = '#fff6dc'; g.lineWidth = 5; g.strokeRect(cx + 8, cy + 8, cw - 16, ch - 16);
    const size = s.name.length > 4 ? 52 : s.name.length > 3 ? 62 : 70;
    g.font = `900 ${size}px "Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif`;
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillText(s.name, cx + cw / 2 + 2, cy + ch / 2 + 6);
    g.fillStyle = '#fffaf0'; g.fillText(s.name, cx + cw / 2, cy + ch / 2 + 4);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return { texture, cols, rows, cw, ch, width: canvas.width, height: canvas.height };
}

function signGeometry(stalls, looks, atlas) {
  const pos = [], uv = [], nor = [];
  stalls.forEach((s, i) => {
    const L = looks[i], { signX: x, signY: y, signZ: z, signW: w, signH: h, dirX } = L;
    const u0 = ((i % atlas.cols) * atlas.cw + 4) / atlas.width, u1 = ((i % atlas.cols + 1) * atlas.cw - 4) / atlas.width;
    const vTop = 1 - (Math.floor(i / atlas.cols) * atlas.ch + 4) / atlas.height, vBot = 1 - ((Math.floor(i / atlas.cols) + 1) * atlas.ch - 4) / atlas.height;
    // Seen from the seats (looking toward -dirX) the viewer's right is -z when dirX = +1.
    const zl = z + dirX * w / 2, zr = z - dirX * w / 2;
    const quad = (xx, a, b, c, d, n) => { // four corners (z, y) with uv
      pos.push(xx, a[1], a[0], xx, b[1], b[0], xx, c[1], c[0], xx, a[1], a[0], xx, c[1], c[0], xx, d[1], d[0]);
      for (let k = 0; k < 6; k++) nor.push(n, 0, 0);
    };
    quad(x, [zl, y - h / 2], [zr, y - h / 2], [zr, y + h / 2], [zl, y + h / 2], dirX);
    uv.push(u0, vBot, u1, vBot, u1, vTop, u0, vBot, u1, vTop, u0, vTop);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// ------------------------------------------------------------------ shutters
function addShutters(sb, stall) {
  const dirX = Math.cos(stall.counterFacing) >= 0 ? 1 : -1;
  const { booth } = stall, frontX = booth.x + dirX * booth.w / 2 + dirX * 0.2;
  const y0 = BOOTH.counterTop, y1 = BOOTH.awningFront - 0.3, d = booth.d - 0.2;
  const slats = 9, hs = (y1 - y0) / slats;
  for (let i = 0; i < slats; i++) sb.block(frontX, y0 + i * hs, booth.z, 0.16, hs - 0.04, d, i % 2 ? '#aab2b8' : '#c4cbd0');
  sb.block(frontX, y1 - 0.1, booth.z, 0.3, 0.3, d + 0.1, '#7d868e');
  // A cover thrown over the work table behind.
}

export function create({ world, quality = 'full' } = {}) {
  const base = moduleBase('market');
  const { group } = base;
  const stalls = world.stalls || [];
  if (!stalls.length) return { group, update() {}, dispose: base.dispose, lights: [] };

  const sb = new ShapeBuilder(), lit = new ShapeBuilder(), shutters = new ShapeBuilder(), glows = new Glows();
  const looks = stalls.map((s, k) => { const L = addStall(sb, lit, glows, s, k); addSeats(sb, s, k); addShutters(shutters, s); return L; });
  const plan = polesOf(world);
  addStrings(sb, lit, glows, plan, quality);

  group.add(mesh(sb.build(), material({ roughness: 0.82 }), { shadow: true }));
  const litMat = litMaterial();
  group.add(mesh(lit.build(), litMat));
  const shutterMesh = mesh(shutters.build(), material({ roughness: 0.6, metalness: 0.25 }), { shadow: true });
  group.add(shutterMesh);

  const atlas = signAtlas(stalls, looks);
  const signMat = new THREE.MeshBasicMaterial({ map: atlas.texture, color: '#888888', side: THREE.DoubleSide });
  const signMesh = new THREE.Mesh(signGeometry(stalls, looks, atlas), signMat);
  signMesh.matrixAutoUpdate = false;
  group.add(signMesh);

  const glowPoints = glows.build({ opacity: 0.8 });
  group.add(glowPoints);

  const lights = plan.poles.map(p => lightSource(p.x - p.bank * 1.5, POLE.height - 0.5, p.z, 12, '#ffcf8a', 0.62, 'market', 'market-string'));

  function update(frame) {
    const open = marketLevel(frame);
    setLevel(litMat, open, 0.55);
    signMat.color.setScalar(0.5 + 0.5 * open);
    shutterMesh.visible = open < 0.5 && frame.minute < MARKET_OPEN;
    glowPoints.userData.level(open);
    glowPoints.material.uniforms.scale.value = pointScale(frame, 1);
  }
  return { group, update, dispose() { atlas.texture.dispose(); base.dispose(); }, lights };
}

export function preview(ctx) { return create({ world: ctx.world, quality: ctx.quality }); }
void noise;
