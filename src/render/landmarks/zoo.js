// 小鎮動物園: the town zoo on two merged lots. An entrance plaza with a gate arch, ticket
// booths, a gift shop, a snack kiosk and a map board; a looping path; enclosures for
// elephants, giraffes (with a tall feeding platform), lions on rocks, zebras, monkeys on a
// climbing frame, hippos, capybaras in a warm pond and flamingos; a rest pavilion and an
// animal hospital.
// Everything is built in the site's local frame (+x out of the front, z along it) inside
// one group that is rotated onto the lot, so it works on any lot of the same size.
// The animals are in zoo-animals.js (their shapes) and zoo-herd.js (how they move).

import * as THREE from 'three';
import { ShapeBuilder } from '../kit.js';
import { SiteFrame } from '../buildings/a-kit.js';
import { Glows, beam, mesh, litMaterial, setLevel, pointScale, moduleBase, lightSource, noise, smoothstep } from './common.js';
import { lampPost, bench, shrub, planter, groundDisc, groundRing } from './props.js';
import { createHerd } from './zoo-herd.js';

// Ground layers, each at least 0.05 above the one below it.
const Y_GRASS = 0.22, Y_PATH = 0.31, Y_FLOOR = 0.36, Y_INLAY = 0.41, Y_INLAY2 = 0.46;
const FOLIAGE = ['#5f9a4a', '#6aa855', '#56904a', '#78b05c'];
const LABELS = [
  ['小鎮動物園', '#1f5a52', '#ffe08a'], ['售票處', '#f4ead2', '#2a4a46'], ['紀念品店', '#f4ead2', '#8a3a2a'], ['小吃部', '#f4ead2', '#b5651d'],
  ['園區導覽圖', '#f4ead2', '#2a4a46'], ['大象', '#e6dcc4', '#3b4045'], ['長頸鹿', '#f0d98a', '#5a3a1a'], ['獅子', '#e8b860', '#5a2a10'],
  ['斑馬', '#eeeeee', '#222428'], ['卡皮巴拉', '#ead9b4', '#5a3a22'], ['猴子', '#cfe0a8', '#4a3220'], ['紅鶴', '#f6c6d0', '#7a2a40'],
  ['河馬', '#cdbfd6', '#3a2a44'], ['動物醫院', '#ffffff', '#c9483b'], ['長頸鹿餵食台', '#f0d98a', '#5a3a1a'], ['休息亭', '#f4ead2', '#2a4a46']
];
const L = Object.fromEntries(['GATE', 'TICKET', 'GIFT', 'SNACK', 'MAP', 'ELE', 'GIR', 'LION', 'ZEBRA', 'CAPY', 'MONK', 'FLAM', 'HIPPO', 'HOSP', 'FEED', 'REST'].map((k, i) => [k, i]));

// ---------------------------------------------------------------- helpers
const rect = (x0, x1, z0, z1) => ({ x0, x1, z0, z1, x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 });
const inside = (r, x, z, g = 0) => x > r.x0 - g && x < r.x1 + g && z > r.z0 - g && z < r.z1 + g;

// A flat patch (top face only) at height y.
function flat(sb, r, y, color) {
  sb.add(new THREE.PlaneGeometry(r.w, r.d), sb.transform(r.x, y, r.z, [-Math.PI / 2, 0, 0]), color);
}

// Posts, rails and an optional low wall along one axis-aligned line.
function line(sb, axis, c, a, b, o, gaps) {
  const { h, sp, y, pc, rc, wall, wc, wt, pw, bars } = o;
  const gap = t => gaps.some(g => t > g[0] && t < g[1]);
  const n = Math.max(1, Math.round((b - a) / sp));
  const at = (t, yy, w, hh, dd) => (axis === 'x' ? sb.block(t, yy, c, w, hh, dd, hh > 1 && w === dd ? pc : rc) : sb.block(c, yy, t, dd, hh, w, hh > 1 && w === dd ? pc : rc));
  void at;
  for (let i = 0; i <= n; i++) {
    const t = a + (b - a) * i / n;
    if (gap(t)) continue;
    if (axis === 'x') sb.block(t, y + wall, c, pw, h, pw, pc); else sb.block(c, y + wall, t, pw, h, pw, pc);
  }
  for (let i = 0; i < n; i++) {
    const t0 = a + (b - a) * i / n, t1 = a + (b - a) * (i + 1) / n;
    if (gap((t0 + t1) / 2)) continue;
    const len = t1 - t0, mid = (t0 + t1) / 2;
    if (wall > 0) { if (axis === 'x') sb.block(mid, y, c, len, wall, wt, wc); else sb.block(c, y, mid, wt, wall, len, wc); }
    for (let k = 0; k < bars; k++) {
      const yy = y + wall + h * (0.38 + 0.52 * k / Math.max(1, bars - 1)) - 0.07;
      if (axis === 'x') sb.block(mid, yy, c, len, 0.14, 0.14, rc); else sb.block(c, yy, mid, 0.14, 0.14, len, rc);
    }
  }
}

function fence(sb, r, opt = {}, gaps = {}) {
  const o = { h: 2.4, sp: 2.6, y: Y_FLOOR, pc: '#6b5a48', rc: '#8a7358', wall: 0, wc: '#d8d0c0', wt: 0.7, pw: 0.32, bars: 2, ...opt };
  line(sb, 'x', r.z0, r.x0, r.x1, o, gaps.z0 || []);
  line(sb, 'x', r.z1, r.x0, r.x1, o, gaps.z1 || []);
  line(sb, 'z', r.x0, r.z0, r.z1, o, gaps.x0 || []);
  line(sb, 'z', r.x1, r.z0, r.z1, o, gaps.x1 || []);
}

// A raised pool: coping all round, water inside (top at `top`).
function pool(sb, r, top, water, rimColor, rimW = 0.5, rimTop = 1.1) {
  const hgt = rimTop - Y_FLOOR + 0.1;
  sb.block(r.x0 + rimW / 2, Y_FLOOR - 0.1, r.z, rimW, hgt, r.d, rimColor);
  sb.block(r.x1 - rimW / 2, Y_FLOOR - 0.1, r.z, rimW, hgt, r.d, rimColor);
  sb.block(r.x, Y_FLOOR - 0.1, r.z0 + rimW / 2, r.w - 2 * rimW, hgt, rimW, rimColor);
  sb.block(r.x, Y_FLOOR - 0.1, r.z1 - rimW / 2, r.w - 2 * rimW, hgt, rimW, rimColor);
  sb.block(r.x, Y_FLOOR - 0.2, r.z, r.w - 2 * rimW, top - Y_FLOOR + 0.2, r.d - 2 * rimW, water);
}

function rock(sb, x, y, z, sx, sy, sz, color, ry = 0, tilt = 0) {
  sb.add(new THREE.IcosahedronGeometry(1, 0), sb.transform(x, y + sy * 0.55, z, [tilt, ry, tilt * 0.6], [sx, sy, sz]), color);
}
function rocks(sb, x, z, spread, n, seed, y = Y_FLOOR, size = 1) {
  const cols = ['#9a9082', '#a79d8e', '#8c8478', '#b3a999'];
  for (let i = 0; i < n; i++) {
    const a = noise(seed * 31 + i, 1) * Math.PI * 2, d = noise(seed * 31 + i, 2) * spread, s = (0.6 + noise(seed * 31 + i, 3) * 1.1) * size;
    rock(sb, x + Math.cos(a) * d, y - 0.1, z + Math.sin(a) * d, s * 1.2, s * 0.8, s, cols[i % 4], noise(seed + i, 4) * 3, noise(seed + i, 5) * 0.4);
  }
}

function tree(sb, x, z, s, seed, y = Y_GRASS) {
  const trunk = 3.2 * s, r = 3.4 * s;
  sb.cylinder(x, y + trunk / 2, z, 0.28 * s, 0.42 * s, trunk, '#7a5a3d', 6);
  const col = FOLIAGE[Math.floor(noise(seed, 1) * 4)];
  sb.sphere(x, y + trunk + r * 0.55, z, r, col, 7, 5, [1, 0.88, 1]);
  sb.sphere(x + (noise(seed, 2) - 0.5) * r * 0.7, y + trunk + r * 1.2, z + (noise(seed, 3) - 0.5) * r * 0.7, r * 0.7, FOLIAGE[(Math.floor(noise(seed, 1) * 4) + 1) % 4], 7, 5);
}
function acacia(sb, x, z, s, y = Y_FLOOR) {
  sb.cylinder(x, y + 2.6 * s, z, 0.3 * s, 0.5 * s, 5.2 * s, '#6e5440', 6);
  sb.cylinder(x + 0.4 * s, y + 6.4 * s, z, 0.2 * s, 0.3 * s, 2.6 * s, '#6e5440', 5, [0, 0, 0.35]);
  sb.sphere(x + 0.7 * s, y + 7.4 * s, z, 3.4 * s, '#8aa650', 8, 5, [1, 0.32, 1]);
  sb.sphere(x - 1.4 * s, y + 6.6 * s, z + 0.6 * s, 2.2 * s, '#7a9a46', 7, 4, [1, 0.35, 1]);
}

// Open shelter on posts under a pyramid roof.
function shelter(sb, cx, cz, w, d, h, roof, post = '#8a6b4a', y = Y_FLOOR) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) sb.block(cx + sx * (w / 2 - 0.3), y, cz + sz * (d / 2 - 0.3), 0.5, h, 0.5, post);
  sb.block(cx, y + h, cz, w + 0.8, 0.35, d + 0.8, '#6b5a48');
  sb.add(new THREE.ConeGeometry(0.5, 1, 4).rotateY(Math.PI / 4), sb.transform(cx, y + h + 0.35 + 0.8, cz, null, [(w + 1.4) * 1.414, 1.6, (d + 1.4) * 1.414]), roof);
}

function hedge(sb, r, color = '#5a8f48') { sb.block(r.x, Y_GRASS - 0.02, r.z, r.w, 1.6, r.d, color); }

// ---------------------------------------------------------------- text atlas for signs
function makeAtlas() {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 1024;
  const g = cv.getContext('2d');
  LABELS.forEach(([text, bg, fg], i) => {
    const x = (i % 2) * 512, y = (i >> 1) * 128;
    g.fillStyle = bg; g.fillRect(x, y, 512, 128);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(x + 6, y + 6, 500, 116);
    let size = i === 0 ? 92 : 70;
    const font = s => `700 ${s}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;
    g.font = font(size);
    while (g.measureText(text).width > 440 && size > 24) { size -= 4; g.font = font(size); }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, x + 256, y + 66);
  });
  const texture = new THREE.CanvasTexture(cv);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

class Quads {
  constructor() { this.p = []; this.uv = []; this.n = []; }
  // A sign quad of width w (height w/4) centred at (x, y, z) facing angle ry (0 = +z).
  add(label, x, y, z, w, ry) {
    const h = w / 4, c = Math.cos(ry), s = Math.sin(ry);
    const rx = [c * w / 2, 0, -s * w / 2], nx = [s, 0, c];
    const u0 = (label % 2) * 0.5, u1 = u0 + 0.5, v1 = 1 - (label >> 1) / 8, v0 = v1 - 0.125;
    const corner = (sr, su) => [x + rx[0] * sr, y + su * h / 2, z + rx[2] * sr];
    const bl = corner(-1, -1), br = corner(1, -1), tr = corner(1, 1), tl = corner(-1, 1);
    for (const [pt, u, v] of [[bl, u0, v0], [br, u1, v0], [tr, u1, v1], [bl, u0, v0], [tr, u1, v1], [tl, u0, v1]]) { this.p.push(...pt); this.uv.push(u, v); this.n.push(...nx); }
  }
  // Both faces of a board: `ry` is the front; the back face reads the right way round too.
  board(label, x, y, z, w, ry, thick = 0.3, frame = '#3b4045') {
    const off = thick / 2 + 0.07, nx = Math.sin(ry), nz = Math.cos(ry);
    this.add(label, x + nx * off, y, z + nz * off, w, ry);
    this.add(label, x - nx * off, y, z - nz * off, w, ry + Math.PI);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

// A sign board standing on two posts, plus its quad faces. ry: 0 faces +z, PI/2 faces +x.
function plate(sb, quads, label, x, z, ry, w = 4.4, y = 2.4) {
  const h = w / 4, nx = Math.sin(ry), nz = Math.cos(ry), px = Math.cos(ry), pz = -Math.sin(ry);
  for (const s of [-1, 1]) sb.block(x + px * s * (w / 2 - 0.3), Y_PATH, z + pz * s * (w / 2 - 0.3), 0.3, y + h / 2 - Y_PATH + 0.2, 0.3, '#59606a');
  sb.add(new THREE.BoxGeometry(w + 0.3, h + 0.3, 0.3), sb.transform(x, y, z, [0, ry, 0]), '#59606a');
  quads.board(label, x, y, z, w, ry);
  void nx; void nz;
}

// ---------------------------------------------------------------- the enclosures and their animals
// Plot-local rects of the enclosures, and where each kind of animal lives.
const ENC = {
  ele: rect(12.5, 32.5, 18, 47), gir: rect(12.5, 32.5, -47, -18), lio: rect(-14, 4, 27, 47), mon: rect(-14, 4, 5, 24),
  hip: rect(-14, 4, -24, -5), zeb: rect(-14, 4, -47, -27), cap: rect(14, 32, 58, 67), fla: rect(14, 32, -67, -58)
};
const HOME = { elephant: 'ele', giraffe: 'gir', lion: 'lio', monkey: 'mon', hippo: 'hip', zebra: 'zeb', capybara: 'cap', flamingo: 'fla' };
const CLIMB = { x: -5, z: 14.5 };            // the monkeys' climbing frame
// The pools' water (waders and swimmers are in it; everyone else keeps out of the pools).
export const WATER = ['#6aa0a8', '#5a9fb2', '#6fa9a2', '#6db3c4'];

// Every animal: its walk (zoo-herd.js) in plot coordinates. Nobody's walk crosses
// anybody else's: an animal on its own has its own patch of the enclosure, and a group
// walks one ring in file (same ring and pace, evenly spaced, resting together).
export function animalSpecs() {
  const S = (tpl, cx, cz, rx, rz, o = {}) => ({ tpl, enc: HOME[tpl], cx, cz, rx, rz, y0: Y_FLOOR, ...o });
  const file = (tpl, n, cx, cz, r, o, each) => Array.from({ length: n }, (_, i) => S(tpl, cx, cz, r, r, { ...o, phase: i * Math.PI * 2 / n, ...each(i) }));
  return [
    // Elephants: a mother walking a ring in the south with her calf at her side (spec 0
    // and 1), and the bull at the hay under the shelter.
    S('elephant', 22.5, 27.6, 3, 3, { k: 0.8, w: 0.1, step: 2.6, seed: 0.3, naps: [[790, 830]] }),
    S('elephant', 0, 0, 0, 0, { k: 0.45, follow: 0, at: [0.6, -4.5], step: 1.4, seed: 4.4, hop: 0.1 }),
    S('elephant', 21, 42.3, 0, 0, { k: 0.8, yaw: 0, seed: 2.1, naps: [[840, 880]] }),
    // Giraffes: one strolling the north end, one at the feeding platform, a young one browsing.
    S('giraffe', 25.5, -25.8, 2, 1.6, { k: 0.93, w: 0.12, step: 3, seed: 1.1, naps: [[700, 730]] }),
    S('giraffe', 28.8, -41.8, 0, 0, { k: 0.93, yaw: Math.PI, graze: 0, seed: 3.3, naps: [[900, 930]] }),
    S('giraffe', 21, -35.5, 0, 0, { k: 0.85, yaw: 0.3, seed: 5.7, naps: [[760, 820]] }),
    // Lions: the male on his rock, a lioness on patrol, another napping most of the day.
    S('lion', -9.8, 44, 0, 0, { y0: Y_FLOOR + 3.4, yaw: 0, seed: 6.1, naps: [[660, 840]], opts: { mane: true } }),
    S('lion', -3, 36.5, 3, 3, { w: 0.16, step: 2, seed: 7.3, naps: [[840, 900]], opts: { mane: false } }),
    S('lion', -9.5, 33, 0, 0, { k: 0.9, yaw: 1.0, seed: 8.8, naps: [[600, 960]], opts: { mane: false } }),
    // Zebras: a little herd going round together, stopping to graze together.
    ...file('zebra', 4, -5, -35.5, 5.2, { w: 0.2, step: 2, naps: [[750, 790]] }, i => ({ seed: 9.1 + i * 1.3, k: i === 3 ? 0.85 : 1 })),
    // Monkeys: two up on the deck, three chasing round the climbing frame.
    S('monkey', CLIMB.x + 1.8, CLIMB.z - 1.2, 0, 0, { y0: Y_FLOOR + 5.25, yaw: 1.2, seed: 13.1, naps: [[720, 760]] }),
    S('monkey', CLIMB.x - 1.6, CLIMB.z + 1.3, 0, 0, { y0: Y_FLOOR + 5.25, yaw: -2, seed: 14.9, naps: [[800, 840]] }),
    ...file('monkey', 3, CLIMB.x, CLIMB.z, 6.6, { w: 0.32, step: 1.4, hop: 0.9, naps: [[780, 800]] }, i => ({ seed: 15.2 + i * 1.6, k: [1, 0.85, 0.8][i] })),
    // Hippos: wading round their pool.
    ...file('hippo', 2, -5, -15, 3.6, { y0: 0.1, wade: true, w: 0.07, step: 3, naps: [[720, 800]] }, i => ({ seed: 18.5 + i * 1.4, k: i ? 0.85 : 1 })),
    // Capybaras: two on the bank (one by the greens), three soaking in the warm pond, one
    // with a yuzu on its head; they soak on through the night.
    S('capybara', 17, 60.4, 0, 0, { yaw: 0.15, seed: 20.3, naps: [[600, 960]] }),
    S('capybara', 17.6, 64.6, 0, 0, { yaw: Math.PI, seed: 21.6, naps: [[720, 780]] }),
    ...file('capybara', 3, 26, 62.5, 1.7, { y0: -0.3, swim: true, sleeps: false, w: 0.12, step: 1.4, graze: 0 }, i => ({ seed: 30 + i, opts: { yuzu: i === 0 } })),
    // Flamingos: three wading round in file, three asleep on one leg.
    ...file('flamingo', 3, 23, -62.75, 1.4, { k: 0.8, y0: 0.4, wade: true, w: 0.1, step: 1.5, naps: [[820, 850]] }, i => ({ seed: 40 + i })),
    S('flamingo', 17.6, -62.6, 0, 0, { k: 0.8, y0: 0.4, wade: true, graze: 0, yaw: 0.4, seed: 43, opts: { oneLeg: true } }),
    S('flamingo', 28.4, -60.9, 0, 0, { k: 0.8, y0: 0.4, wade: true, graze: 0, yaw: 2.6, seed: 44, opts: { oneLeg: true } }),
    S('flamingo', 28.4, -64.6, 0, 0, { k: 0.8, y0: 0.4, wade: true, graze: 0, yaw: -2.4, seed: 45, opts: { oneLeg: true } })
  ];
}

// ---------------------------------------------------------------- the zoo
export function create({ world, quality = 'full' } = {}) {
  const base = moduleBase('zoo');
  const { group } = base;
  const site = world.site('x-zoo') || world.siteList.find(s => s.kind === 'zoo');
  if (!site) return { group, update() {}, dispose: base.dispose, lights: [], info: () => ({}) };
  const F = new SiteFrame(site, world);
  group.position.set(F.ox, 0, F.oz); group.rotation.y = F.rotY; group.updateMatrix(); group.matrixAutoUpdate = false;
  const A = rect(-34, 34, -69, 69);

  const sb = new ShapeBuilder(), lit = new ShapeBuilder(), glows = new Glows(), quads = new Quads();
  const hours = site.hours || { open: 540, close: 1020 };

  // ---- layout
  const PATHS = [
    rect(5.5, 10.5, -54.5, 54.5), rect(-20.5, -15.5, -54.5, 54.5), rect(-15.5, 5.5, 49.5, 54.5), rect(-15.5, 5.5, -54.5, -49.5),
    rect(10.5, 32.4, 49.5, 54.5), rect(10.5, 32.4, -54.5, -49.5), rect(-15.5, 5.5, -2.5, 2.5), rect(10.5, 16, -2.5, 2.5),
    rect(-25, -20.5, -2, 2), rect(-25, -20.5, 28, 32)
  ];
  const PLAZA = rect(16, 34, -16, 16);
  const HOSP = rect(-33, -25, -9, 9), PAVI = rect(-33, -25, 26, 34);
  const keep = [...PATHS, PLAZA, ...Object.values(ENC), HOSP, PAVI];

  // ---- ground
  flat(sb, A, Y_GRASS, '#8db565');
  for (const p of PATHS) flat(sb, p, Y_PATH, '#e4d8bf');
  flat(sb, PLAZA, Y_PATH, '#ecdcbc');
  groundDisc(sb, 24, 0, 7, Y_INLAY, '#f4e9cf'); groundRing(sb, 24, 0, 4.6, 5.3, Y_INLAY2, '#3f8f88'); groundRing(sb, 24, 0, 6.2, 6.8, Y_INLAY2, '#e8b24a');
  const floors = { ele: '#d8c59c', gir: '#cbbf80', lio: '#dcc590', mon: '#94b36a', hip: '#a79a72', zeb: '#a9b666', cap: '#b3b67a', fla: '#e8d6ac' };
  for (const k of Object.keys(ENC)) flat(sb, ENC[k], Y_FLOOR, floors[k]);
  flat(sb, rect(10.9, 12.3, 18.5, 46.5), Y_INLAY, '#5fa6bd');          // elephant moat
  flat(sb, rect(-13.2, 3.2, 25.2, 26.4), Y_INLAY, '#a07a50');           // keeper's lane marks (lions)
  flat(sb, rect(13.1, 16.1, -39.5, -26.5), Y_INLAY, '#d8c8a8');         // feeding platform floor

  // ---- perimeter hedges and front walls
  hedge(sb, rect(-34, 34, 67.4, 69)); hedge(sb, rect(-34, 34, -69, -67.4)); hedge(sb, rect(-34, -32.4, -67.4, 67.4));
  hedge(sb, rect(32.4, 34, 16.5, 67.4)); hedge(sb, rect(32.4, 34, -67.4, -16.5));
  for (const s of [-1, 1]) sb.block(33.4, Y_GRASS, s * 12.4, 1.0, 1.4, 7.8, '#e6dcc6');

  // ---- entrance gate
  for (const s of [-1, 1]) {
    const z = s * 8;
    sb.block(31, Y_PATH, z, 3.6, 12, 3, '#ece0c0');
    sb.block(31, 3.1, z, 3.9, 0.9, 3.3, '#3f8f88');
    sb.block(31, 8.4, z, 3.9, 0.9, 3.3, '#3f8f88');
    sb.block(31, 12.3, z, 4.3, 0.5, 3.7, '#d7a53a');
    sb.sphere(31, 13.6, z, 0.9, '#f0c03a', 8, 6);
    for (const [y, c] of [[5.4, '#e8574a'], [10.2, '#f0c03a']]) sb.block(32.9, y, z, 0.12, 0.7, 2.2, c);
  }
  sb.block(31, 10.3, 0, 2.6, 4.2, 19.6, '#1f5a52');
  sb.block(31, 14.5, 0, 3.2, 0.4, 20.2, '#d7a53a');
  quads.add(L.GATE, 31 + 1.3 + 0.07, 12.4, 0, 16, Math.PI / 2); quads.add(L.GATE, 31 - 1.3 - 0.07, 12.4, 0, 16, -Math.PI / 2);
  for (let i = 0; i < 9; i++) {
    const z = -8 + i * 2, col = ['#e8574a', '#f0c03a', '#3f8f88', '#e8749a', '#3e6fa8'][i % 5];
    lit.sphere(32.6, 10.0, z, 0.22, col, 5, 4); glows.add(32.6, 10.0, z, col, 1.6);
  }
  for (const z of [-6, 0, 6]) sb.sphere(31, 15.6, z, 0.8, ['#e8574a', '#f0c03a', '#3f8f88'][z / 6 + 1], 8, 6);

  // ---- ticket booths, gift shop, snack kiosk, map board
  for (const s of [-1, 1]) {
    const z = s * 12;
    sb.block(27, Y_PATH, z, 4.4, 3.8, 3.8, '#f4ead2');
    sb.block(27, 4.1, z, 5.4, 0.4, 4.8, '#3f8f88');
    sb.block(27, 2.2, z - s * (1.9 + 0.06), 2.6, 1.4, 0.12, '#35566a');
    sb.block(27, 1.7, z - s * (1.9 + 0.35), 3.0, 0.2, 0.6, '#a7774f');
    lit.block(27, 2.2, z - s * (1.9 + 0.17), 2.4, 1.2, 0.04, '#ffe9b0');
    for (const dx of [-1, 1]) sb.block(27 + dx * 2.6, Y_PATH, z - s * 2.2, 0.2, 3.7, 0.2, '#59606a');
    plate(sb, quads, L.TICKET, 27, z + s * 3.0, Math.PI / 2, 4.4, 6.4);
  }
  // Gift shop (x 16.5..23.5, z -15.5..-9.5), faces +z; snack kiosk faces -z.
  sb.block(20, Y_PATH, -12.5, 7, 6, 6, '#f2dfc4');
  sb.block(20, 6.2, -12.5, 8, 0.5, 7, '#b8664a');
  sb.block(20, 3.2, -9.5 + 0.06, 4.4, 2.6, 0.12, '#35566a'); lit.block(20, 3.2, -9.5 + 0.17, 4.2, 2.4, 0.04, '#ffe9b0');
  sb.block(23, Y_PATH, -9.5 + 0.06, 1.4, 3.2, 0.12, '#6f9fb4');
  for (let i = 0; i < 6; i++) sb.block(17.0 + i * 1.2, 5.4, -9.0, 0.6, 0.5, 1.6, i % 2 ? '#ffffff' : '#e8574a');
  quads.board(L.GIFT, 20, 7.5, -9.0, 4.8, 0, 0.1);
  sb.block(20, 7.0, -9.0, 5.1, 1.5, 0.12, '#59606a');
  sb.block(20, Y_PATH, 12.5, 5.2, 4.2, 5.2, '#fbe6b8');
  sb.block(20, 4.3, 12.5, 6.2, 0.4, 6.2, '#e8a02e');
  sb.block(20, 2.2, 12.5 - 2.6 - 0.06, 3.6, 1.5, 0.12, '#35566a'); lit.block(20, 2.2, 12.5 - 2.6 - 0.17, 3.4, 1.3, 0.04, '#ffe9b0');
  sb.block(20, 1.6, 12.5 - 2.6 - 0.45, 4.0, 0.2, 0.7, '#a7774f');
  for (let i = 0; i < 5; i++) sb.block(17.8 + i * 1.1, 3.8, 12.5 - 3.3, 0.6, 0.6, 1.1, i % 2 ? '#ffffff' : '#e8a02e');
  quads.board(L.SNACK, 20, 6.0, 12.5 - 3.0, 4.0, Math.PI, 0.1);
  sb.block(20, 5.5, 12.5 - 3.0, 4.3, 1.2, 0.12, '#59606a');
  // Tables with umbrellas by the snack kiosk.
  for (const z of [7.2, 17.6 - 1.2]) {
    sb.cylinder(24, Y_PATH + 1.3, z, 1.2, 1.2, 0.2, '#a7774f', 8); sb.cylinder(24, Y_PATH + 0.65, z, 0.2, 0.2, 1.3, '#59606a', 5);
    sb.cylinder(24, Y_PATH + 4.0, z, 0.1, 0.1, 5.4, '#8c949b', 4); sb.cone(24, Y_PATH + 5.1, z, 2.6, 1.1, '#3f8f88', 8);
  }
  // Map board.
  for (const s of [-1, 1]) sb.block(17.2, Y_PATH, s * 2.6, 0.3, 5.4, 0.3, '#59606a');
  sb.block(17.2, 3.3, 0, 0.3, 3.2, 6.6, '#59606a');
  sb.block(17.4, 3.5, 0, 0.1, 2.6, 5.9, '#f4ead2');
  const mapBits = [[-1.8, 3.9, 1.5, 1.0, '#c9bd7c'], [0.2, 4.1, 1.2, 1.0, '#d8c59c'], [1.9, 3.9, 1.3, 1.0, '#5fa6bd'], [-1.6, 2.9, 1.2, 0.9, '#dcc590'], [0.3, 2.9, 1.4, 0.9, '#94b36a'], [2.0, 2.9, 1.1, 0.9, '#a9b666']];
  for (const [z, y, w, h, c] of mapBits) sb.block(17.52, y - 0.3, z, 0.06, h * 0.8, w, c);
  quads.add(L.MAP, 17.4 + 0.07 + 0.02 + 0.06, 5.3, 0, 5.6, Math.PI / 2);
  sb.block(17.2, 4.95, 0, 0.35, 0.8, 6.1, '#59606a');

  // ---- plaza planting and flags
  planter(sb, 28.2, 5.2, 4.5, 1.8, false, 3, Y_PATH); planter(sb, 28.2, -5.2, 4.5, 1.8, false, 7, Y_PATH);
  planter(sb, 21, 4.4, 5, 1.8, true, 11, Y_PATH); planter(sb, 21, -4.4, 5, 1.8, true, 15, Y_PATH);
  for (const [x, z, c] of [[33, 14.8, '#e8574a'], [33, -14.8, '#3f8f88'], [17, 14.6, '#f0c03a'], [17, -14.6, '#e8749a']]) {
    sb.cylinder(x, Y_PATH + 4, z, 0.08, 0.1, 8, '#8c949b', 5);
    sb.block(x + 0.6, Y_PATH + 6.2, z, 1.2, 1.2, 0.08, c);
  }

  // ---- enclosures
  // Elephants: low wall with railings, a moat, a mud pool and a shelter with hay.
  fence(sb, ENC.ele, { h: 2.4, wall: 1.1, bars: 2, rc: '#59606a', pc: '#59606a', sp: 3.2 });
  pool(sb, rect(13.2, 16.8, 39.5, 46.2), 0.7, '#6aa0a8', '#c2b9a8');
  shelter(sb, 30.5, 42, 6, 7.5, 4.8, '#b8664a');
  sb.block(30.5, Y_INLAY, 42, 4.5, 0.5, 5.5, '#d4b86a');
  rocks(sb, 14.4, 19.9, 0.6, 2, 4); rocks(sb, 31.2, 19.6, 0.5, 2, 5);
  sb.cylinder(30.6, Y_FLOOR + 0.6, 35.3, 0.2, 0.2, 1.2, '#7a5a3d', 5);
  sb.add(new THREE.TorusGeometry(1.1, 0.35, 5, 10), sb.transform(30.6, Y_FLOOR + 0.4, 35.8, [Math.PI / 2, 0, 0]), '#3b4045');
  // Giraffes: wooden fence, feeding platform on the west side.
  const gGaps = { x0: [[-29, -26]] };
  fence(sb, ENC.gir, { h: 2.6, wall: 0, bars: 3, sp: 3 }, gGaps);
  fence(sb, rect(12.5, 16.6, -39.5, -25.5), { h: 1.8, bars: 2, sp: 3 }, { x0: [[-30, -26]], z1: [[12, 17]], z0: [[12, 17]] });
  const deckTop = Y_FLOOR + 5.0;
  sb.block(18.25, deckTop - 0.4, -42.5, 11.5, 0.4, 6, '#a7774f');
  for (const [x, z] of [[13.4, -44.4], [23.1, -44.4], [13.4, -40.6], [23.1, -40.6]]) sb.block(x, Y_FLOOR, z, 0.5, 4.6, 0.5, '#6b5a48');
  for (const [x, z] of [[12.9, -44.9], [23.6, -44.9], [12.9, -40.1], [23.6, -40.1]]) sb.block(x, Y_FLOOR, z, 0.3, 4.6, 0.3, '#59606a');
  fence(sb, rect(12.6, 23.9, -45.4, -39.6), { y: deckTop, h: 1.3, bars: 2, sp: 2.9 }, { x0: [[-45.4, -44]], z1: [[12.6, 16.4]] });
  const nSteps = 14, tread = 12 / nSteps;
  for (let i = 0; i < nSteps; i++) sb.block(14.6, Y_FLOOR, -27.5 - (i + 0.5) * tread, 3, (i + 1) * (5.0 / nSteps), tread, i % 2 ? '#d8c8a8' : '#cdbd9a');
  for (let i = 0; i < 3; i++) sb.cylinder(24.3, deckTop + 0.5, -44 + i * 1.5, 0.45, 0.45, 0.5, '#6b8f3a', 6);
  quads.board(L.FEED, 17.2, deckTop + 2.1, -39.9, 4.4, 0, 0.2);
  sb.block(17.2, deckTop + 1.3, -39.9, 4.0, 1.5, 0.2, '#59606a');
  acacia(sb, 31.5, -46.3, 0.8); acacia(sb, 29.5, -20.5, 0.7);
  sb.block(30, Y_FLOOR, -33, 3.2, 1.8, 0.9, '#6b8f3a');     // hay racks
  rocks(sb, 21, -21, 1, 2, 6);
  // Lions: tall steel fence, a rock pile with a high ledge, rocks and a log.
  fence(sb, ENC.lio, { h: 4.2, wall: 0.9, bars: 4, rc: '#3b4045', pc: '#3b4045', wc: '#b3a999', sp: 2.4 });
  sb.block(-10.5, Y_FLOOR, 43.5, 7, 1.8, 5, '#9a9082', 0.15); sb.block(-10.5, Y_FLOOR + 1.8, 44, 5.2, 1.6, 3.6, '#a79d8e', -0.2);
  rocks(sb, 2.2, 45.2, 1, 2, 8); rocks(sb, -12.6, 28.6, 0.8, 2, 9);
  sb.cylinder(-1.5, Y_FLOOR + 0.5, 29.2, 0.5, 0.5, 4.0, '#6b5240', 6, [0, 0, Math.PI / 2]);
  acacia(sb, 2, 29.5, 0.7);
  // Zebras.
  fence(sb, ENC.zeb, { h: 2.4, bars: 3, sp: 2.8 });
  shelter(sb, -6, -45.8, 10, 2.4, 3.4, '#a7774f');
  rocks(sb, 2.5, -29.5, 1.2, 2, 11);
  // Monkeys: mesh fence, climbing frame, deck with slide, hanging tyre.
  fence(sb, ENC.mon, { h: 4.4, bars: 4, rc: '#59606a', pc: '#59606a', sp: 2.4 });
  const { x: mcx, z: mcz } = CLIMB;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    beam(sb, [mcx + sx * 2.5, Y_FLOOR, mcz + sz * 2.5], [mcx + sx * 2.5, Y_FLOOR + 9.0, mcz + sz * 2.5], 0.2, '#a7774f', 6);
    beam(sb, [mcx + sx * 3.4, Y_FLOOR, mcz + sz * 3.4], [mcx + sx * 2.5, Y_FLOOR + 5.0, mcz + sz * 2.5], 0.12, '#8a6b4a', 5);
  }
  sb.block(mcx, Y_FLOOR + 4.9, mcz, 6.2, 0.35, 6.2, '#b8864f');
  for (const s of [-1, 1]) {
    beam(sb, [mcx - 2.5, Y_FLOOR + 9.0, mcz + s * 2.5], [mcx + 2.5, Y_FLOOR + 9.0, mcz + s * 2.5], 0.16, '#a7774f', 5);
    beam(sb, [mcx + s * 2.5, Y_FLOOR + 8.95, mcz - 2.5], [mcx + s * 2.5, Y_FLOOR + 8.95, mcz + 2.5], 0.16, '#8a6b4a', 5);
  }
  beam(sb, [mcx, Y_FLOOR + 9.0, mcz - 2.5], [mcx, Y_FLOOR + 9.0, mcz + 2.5], 0.14, '#a7774f', 5);
  for (const [dx, dz] of [[-2.7, -1.2], [-2.7, 1.2]]) beam(sb, [mcx + dx, Y_FLOOR + 5.2, mcz + dz], [mcx + dx - 0.9, Y_FLOOR + 0.2, mcz + dz], 0.07, '#c9b58a', 4);
  for (const dz of [-0.6, 0.6]) beam(sb, [mcx + 2.9, Y_FLOOR, mcz + dz], [mcx + 2.9, Y_FLOOR + 4.9, mcz + dz], 0.06, '#c9b58a', 4);
  for (let i = 1; i < 7; i++) sb.cylinder(mcx + 2.9, Y_FLOOR + i * 0.7, mcz, 0.07, 0.07, 1.2, '#a7774f', 5, [Math.PI / 2, 0, 0]);
  beam(sb, [mcx, Y_FLOOR + 9.0, mcz], [mcx, Y_FLOOR + 5.7, mcz + 0.0], 0.05, '#c9b58a', 3);
  sb.add(new THREE.TorusGeometry(0.6, 0.2, 5, 9), sb.transform(mcx - 1.2, Y_FLOOR + 4.7, mcz + 2.5, [Math.PI / 2, 0, 0]), '#3b4045');
  beam(sb, [mcx - 1.2, Y_FLOOR + 9.0, mcz + 2.5], [mcx - 1.2, Y_FLOOR + 5.0, mcz + 2.5], 0.05, '#c9b58a', 3);
  rocks(sb, -12, 7.5, 1, 2, 12); rocks(sb, 2, 22.5, 1, 2, 13);
  // Hippos.
  fence(sb, ENC.hip, { h: 2.0, wall: 0.9, bars: 2, rc: '#59606a', pc: '#59606a', wc: '#c2b9a8', sp: 3 });
  pool(sb, rect(-12, 2, -22, -8), 0.75, '#5a9fb2', '#c2b9a8', 0.5, 1.1);
  rocks(sb, -12.5, -6.5, 1, 2, 14); rocks(sb, 2.8, -22.8, 1, 2, 15);
  // Capybaras: a wooden fence on a stone kerb, a grassy bank with a tray of greens, and a
  // warm stone-edged pond with yuzu floating in it.
  fence(sb, ENC.cap, { h: 1.6, wall: 0.9, bars: 2, rc: '#8a6b4a', pc: '#6b5a48', wc: '#b3a999', sp: 3 });
  pool(sb, rect(21, 31, 59, 66), 0.8, '#6fa9a2', '#b5a488', 0.5, 1.1);
  for (const [x, z] of [[22.3, 60.2], [22.5, 65], [29.8, 60.3], [30, 64.8], [29.2, 62.4]]) sb.sphere(x, 0.84, z, 0.26, '#f0a12a', 7, 5);
  sb.block(15.0, Y_FLOOR, 64.6, 0.9, 0.35, 2.6, '#8a6b4a');
  for (let i = 0; i < 4; i++) sb.sphere(15.0 + (i % 2 ? 0.15 : -0.15), Y_FLOOR + 0.42, 63.7 + i * 0.6, 0.32, ['#6aa84a', '#7bbf52', '#e48a2e', '#6aa84a'][i], 6, 4, [1, 0.6, 1]);
  rock(sb, 15.1, Y_FLOOR - 0.1, 58.9, 0.8, 0.6, 0.6, '#9a9082', 0.4, 0.1); rock(sb, 20, Y_FLOOR - 0.1, 66.4, 0.9, 0.7, 0.6, '#a79d8e', 1.0, 0.1);
  // Flamingos.
  fence(sb, ENC.fla, { h: 1.6, wall: 1.1, bars: 2, rc: '#59606a', pc: '#59606a', wc: '#d9cdb0', sp: 3 });
  pool(sb, rect(16, 30, -66, -59.5), 0.55, '#6db3c4', '#e6d3a8', 0.35, 0.7);
  rocks(sb, 31, -65, 0.8, 2, 16); rocks(sb, 15.5, -59, 0.6, 2, 17);
  for (const [x, z, s] of [[15.2, -65.2, 0.6], [31, -59, 0.7], [15, -61, 0.55]]) shrub(sb, x, z, 1.3 * s * 1.6, Math.round(x + z), Y_FLOOR);

  // ---- hospital (x -33..-25, z -9..9), door on +x
  sb.block(-29, Y_PATH, 0, 8, 7.5, 18, '#f0e8d8');
  sb.block(-29, 7.8, 0, 9, 0.5, 19, '#3f8f88');
  for (const z of [-6.2, -3.6, 3.6, 6.2]) for (const y of [1.6, 4.6]) {
    sb.block(-24.94, y, z, 0.12, 1.5, 1.6, '#6f9fb4'); lit.block(-24.83, y + 0.05, z, 0.04, 1.4, 1.5, '#ffe9b0');
  }
  sb.block(-24.94, Y_PATH, 0, 0.12, 3.4, 2.4, '#35566a');
  sb.block(-23.5, 3.9, 0, 3.2, 0.3, 4.2, '#3f8f88');
  for (const z of [-1.9, 1.9]) sb.block(-22.1, Y_PATH, z, 0.2, 3.5, 0.2, '#59606a');
  sb.block(-24.9, 8.0 - 0.6, 6.4, 0.14, 2.4, 0.7, '#c9483b'); sb.block(-24.9, 8.0 - 1.4, 6.4, 0.14, 0.7, 2.4, '#c9483b');
  sb.block(-24.9, 5.9, -6.4, 0.14, 0.7, 2.4, '#ffffff');
  quads.add(L.HOSP, -24.88 - 0.0 + 0.03 + 0.04, 6.0, 0, 4.4, Math.PI / 2);
  sb.block(-24.97, 5.5, 0, 0.1, 1.2, 4.8, '#3b4045');
  for (const [x, z] of [[-32.3, -4], [-32.3, 4]]) sb.block(x, 8.3, z, 1.6, 0.8, 1.6, '#d7dde0');
  // ---- rest pavilion
  shelter(sb, -29, 30, 8, 8, 4.6, '#3f8f88', '#a7774f', Y_PATH);
  sb.block(-29, Y_PATH + 0.01, 30, 1.0, 1.3, 4.5, '#a7774f');
  for (const dz of [-1, 1]) sb.block(-29 + dz * 2.0, Y_PATH + 0.01, 30, 0.8, 0.8, 5.6, '#8a6b4a');
  quads.board(L.REST, -29, 6.2, 30 + 4.4, 3.6, 0, 0.1);
  sb.block(-29, 5.7, 34.4, 3.9, 0.9, 0.12, '#59606a');

  // ---- enclosure name plates
  plate(sb, quads, L.ELE, 9.6, 33, -Math.PI / 2); plate(sb, quads, L.GIR, 9.6, -33, -Math.PI / 2);
  plate(sb, quads, L.LION, 4.9, 37, Math.PI / 2); plate(sb, quads, L.MONK, 4.9, 14.5, Math.PI / 2);
  plate(sb, quads, L.HIPPO, 4.9, -14.5, Math.PI / 2); plate(sb, quads, L.ZEBRA, 4.9, -37, Math.PI / 2);
  plate(sb, quads, L.CAPY, 24, 56.2, Math.PI); plate(sb, quads, L.FLAM, 24, -56.2, 0);

  // ---- benches, lamps, trees
  const benchSpots = [[9.6, 12, 0], [9.6, -12, 0], [9.6, 26, 0], [9.6, -26, 0], [9.6, 44, 0], [9.6, -44, 0], [-16.4, 15, Math.PI], [-16.4, -15, Math.PI], [-16.4, 35, Math.PI], [-16.4, -35, Math.PI],
    [-5, 52.2, Math.PI / 2], [-5, -52.2, -Math.PI / 2], [-5, 0.9, Math.PI / 2], [26, 52.2, Math.PI / 2], [26, -52.2, -Math.PI / 2], [30, 9.5, Math.PI], [30, -9.5, 0]];
  for (const [x, z, h] of benchSpots) bench(sb, x, z, h, Y_PATH);
  const lampPts = [[6.4, 40], [6.4, 20], [6.4, -20], [6.4, -40], [-16.4, 40], [-16.4, 20], [-16.4, -20], [-16.4, -40], [9.8, 8], [9.8, -8],
    [-5, 52], [-5, -52], [14, 52], [14, -52], [28, 52], [28, -52], [18, 6], [18, -6], [-23, 10], [-23, 38]];
  for (const [x, z] of lampPts) lampPost(sb, lit, glows, x, z, 8, Y_PATH);
  for (const s of [-1, 1]) for (const [x, z] of [[33, s * 5.0]]) lampPost(sb, lit, glows, x, z, 7, Y_PATH);
  // Gate lanterns on the pillars.
  for (const s of [-1, 1]) { lit.sphere(33.2, 7.5, s * 8, 0.45, '#fff0c8', 6, 4); glows.add(33.2, 7.5, s * 8, '#ffe6a0', 3.5); }

  const treeCount = quality === 'lite' ? 0.5 : 1;
  let ti = 0;
  for (let gx = -29; gx <= 29; gx += 6) for (let gz = -65; gz <= 65; gz += 6) {
    const x = gx + (noise(ti, 1) - 0.5) * 3.5, z = gz + (noise(ti, 2) - 0.5) * 3.5;
    ti++;
    if (noise(ti, 9) > 0.62 * treeCount) continue;
    if (keep.some(r => inside(r, x, z, 3.2))) continue;
    if (inside(rect(25, 34, -20, 20), x, z)) continue;
    tree(sb, x, z, 0.75 + noise(ti, 3) * 0.35, ti);
  }
  const shrubSpots = [];
  for (let i = 0; i < 18; i++) { shrubSpots.push([11.3, 10 + i * 2.2 - 40 * 0]); }
  for (const [x, z] of [[12, 9], [12, -9], [14, 11.5], [14, -11.5]]) shrub(sb, x, z, 1.3, Math.round(x * 3 + z), Y_GRASS);
  for (let i = 0; i < 8; i++) { shrub(sb, -22.5 + noise(i, 3) * 2, -48 + i * 3 + noise(i, 4) * 2, 1.2, i, Y_GRASS); shrub(sb, -31, -46 + i * 12, 1.4, i + 20, Y_GRASS); }
  void shrubSpots;

  // ---- meshes
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  group.add(mesh(sb.build(), mat, { shadow: true, receive: true }));
  const litMat = litMaterial();
  group.add(mesh(lit.build(), litMat));
  const glowPoints = glows.build({ opacity: 0.8 });
  group.add(glowPoints);
  const atlas = makeAtlas();
  const signMat = new THREE.MeshBasicMaterial({ map: atlas, color: '#9a9a9a' });
  group.add(mesh(quads.build(), signMat, { receive: false }));

  // ---- animals
  const open = hours.open, close = hours.close;
  const zoo = createHerd(animalSpecs(), { open, close, quality, bounds: new THREE.Sphere(new THREE.Vector3(0, 6, 0), Math.hypot(A.w, A.d) / 2 + 8) });
  for (const m of zoo.meshes) group.add(m);

  // ---- lights (world coordinates)
  const lights = lampPts.map(([x, z]) => { const w = F.toWorld(x, z); return lightSource(w.x, 8, w.z, 12, '#fff0c8', 0.55, 'lamps', 'zoo-lamp'); });
  for (const [x, z, r, k] of [[32, 0, 16, 'zoo-gate'], [22, -12.5, 9, 'zoo-shop'], [20, 12.5, 8, 'zoo-snack'], [-28, 0, 12, 'zoo-hospital']]) {
    const w = F.toWorld(x, z); lights.push(lightSource(w.x, 6, w.z, r, '#ffe6a0', 0.7, k === 'zoo-gate' ? 'sign' : 'facade', k));
  }

  function update(frame) {
    const lamps = Math.max(frame.lamps || 0, 0);
    setLevel(litMat, lamps, 0.45);
    glowPoints.userData.level(lamps);
    glowPoints.material.uniforms.scale.value = pointScale(frame, 1);
    const b = frame.lighting && frame.lighting.buildings && frame.lighting.buildings['x-zoo'];
    const sign = b && b.sign !== undefined ? b.sign : lamps;
    signMat.color.setScalar(0.62 + 0.38 * Math.max(0, Math.min(1, sign)));
    zoo.update(frame);
  }
  update({ time: 0, minute: 600, lamps: 0, lighting: null, camera: null });

  return {
    group, update, lights,
    dispose() { atlas.dispose(); mat.dispose(); zoo.dispose(); base.dispose(); },
    info: () => ({ animals: zoo.count, lights: lights.length })
  };
}

export function preview(ctx) { return create(ctx); }
void smoothstep;
