// The nightly fireworks as a pure function of time (no THREE, no state): which shells
// fly, where every spark is and what colour it has. Scrubbing the clock gives the same
// picture as playing it. fireworks.js uploads what this writes into point buffers.
//
// Over the canal between data/town.js `fireworks.from` and `.to` (town minutes).

import { SECONDS_PER_MINUTE, MINUTES_PER_DAY } from '../../core/clock.js';

// Tuning, in town units and real seconds.
export const SHOW = {
  rise: 1.35,          // seconds a shell takes to climb
  apexMin: 118, apexMax: 168,
  spread: 16,          // sideways drift of the apex from the launch point
  trail: 7,            // points in the rising shell's tail
  tail: [0, 0.05, 0.1, 0.16, 0.23], // seconds behind the head for a spark tail
  tailFade: [1, 0.62, 0.4, 0.24, 0.12],
  gravity: 16,
  finale: 6.5,         // seconds at the end given to the finale salvo
  quiet: 1.2           // lead-in before the first shell
};

export const KINDS = ['peony', 'ring', 'willow', 'crackle', 'double'];

// Colours chosen to read on a night sky (r, g, b 0..1).
const HUES = [
  [1, 0.28, 0.3], [1, 0.72, 0.25], [0.35, 0.85, 1], [0.7, 0.45, 1], [0.4, 1, 0.55], [1, 0.45, 0.8], [1, 0.95, 0.7]
];

const fract = v => v - Math.floor(v);
function hash(i, salt) {
  let h = (Math.imul(i + 1, 374761393) ^ Math.imul(salt + 11, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function windowOf(world) {
  const f = world.config && world.config.fireworks;
  return f ? { from: f.from, to: f.to } : { from: 1170, to: 1230 };
}

// Every shell of one day's show. Cached by day: the list is a function of the day only.
const showCache = new Map();
export function shellsOf(world, day) {
  const key = `${world.config ? world.config.seed : 0}:${day}`;
  if (showCache.has(key)) return showCache.get(key);
  const { from, to } = windowOf(world);
  const length = (to - from) * SECONDS_PER_MINUTE;
  const shells = [];
  let t = SHOW.quiet, n = 0;
  const salt = day * 97 + (world.config ? world.config.seed % 1000 : 0);
  const make = (launch, finale) => {
    const r = k => hash(n * 13 + k, salt);
    const kind = finale ? KINDS[Math.floor(r(1) * 5)] : KINDS[n % KINDS.length === 4 && r(2) < 0.5 ? 4 : Math.floor(r(1) * 4)];
    const hue = HUES[Math.floor(r(3) * HUES.length)];
    const hue2 = HUES[(Math.floor(r(3) * HUES.length) + 2 + Math.floor(r(4) * 3)) % HUES.length];
    const apexY = SHOW.apexMin + r(5) * (SHOW.apexMax - SHOW.apexMin);
    const x = (r(6) - 0.5) * 14, z = (r(7) - 0.5) * 150 + (finale ? 0 : 0);
    shells.push({
      id: n, launch, kind, hue, hue2, x, z, apexY,
      apexX: x + (r(8) - 0.5) * 2 * SHOW.spread, apexZ: z + (r(9) - 0.5) * 2 * SHOW.spread,
      radius: (kind === 'ring' ? 34 : kind === 'willow' ? 30 : 38) * (0.8 + r(10) * 0.4),
      count: kind === 'ring' ? 56 : kind === 'willow' ? 92 : kind === 'double' ? 110 : 84,
      life: kind === 'willow' ? 4.6 : kind === 'crackle' ? 3.2 : 3.0,
      tilt: (r(11) - 0.5) * 1.6, turn: r(12) * Math.PI * 2, finale
    });
    n++;
  };
  while (t < length - SHOW.finale - 2.5) { make(t, false); t += 1.5 + hash(n, salt + 5) * 1.2; }
  for (let k = 0; k < 13; k++) make(length - SHOW.finale - 0.5 + k * 0.4 + hash(k, salt + 9) * 0.2, true);
  showCache.set(key, shells);
  return shells;
}

// Where the show is: seconds since it began, or null outside the window.
export function showTime(world, daySeconds) {
  const { from, to } = windowOf(world);
  const abs = Math.max(0, daySeconds) / SECONDS_PER_MINUTE;
  const day = Math.floor(abs / MINUTES_PER_DAY) + 1, minute = abs - (day - 1) * MINUTES_PER_DAY;
  if (minute < from || minute >= to) return null;
  return { day, t: (minute - from) * SECONDS_PER_MINUTE };
}

export const CAPACITY = { sparks: 13000, flashes: 24 };

// The unit direction of spark i of a shell, by kind.
function direction(shell, i, out) {
  const n = shell.count;
  if (shell.kind === 'ring') {
    const a = (i / n) * Math.PI * 2 + shell.turn;
    out[0] = Math.cos(a); out[1] = Math.sin(a); out[2] = 0;
    // Tilt the ring's plane about x.
    const c = Math.cos(shell.tilt + 0.5), s = Math.sin(shell.tilt + 0.5), y = out[1];
    out[1] = y * c; out[2] = y * s;
    return 1;
  }
  // Fibonacci sphere; the double burst puts every other spark on a smaller shell.
  const k = (i + 0.5) / n, phi = Math.acos(1 - 2 * k), theta = Math.PI * (1 + Math.sqrt(5)) * i + shell.turn;
  out[0] = Math.sin(phi) * Math.cos(theta); out[1] = Math.cos(phi); out[2] = Math.sin(phi) * Math.sin(theta);
  return shell.kind === 'double' && i % 2 ? 0.55 : 1;
}

const dir = [0, 0, 0];

// Write the whole sky at `daySeconds` into the buffers (positions xyz, colours rgb,
// already faded by brightness). Returns { sparks, flashes, active } (counts).
export function fillShow(world, daySeconds, b) {
  const st = showTime(world, daySeconds);
  const result = { sparks: 0, flashes: 0, active: false };
  if (!st) return result;
  result.active = true;
  const shells = shellsOf(world, st.day);
  const P = b.positions, C = b.colors, FP = b.flashPositions, FC = b.flashColors;
  let n = 0, f = 0;
  const put = (x, y, z, r, g, bl, a) => {
    if (n >= CAPACITY.sparks || a <= 0.004) return;
    const o = n * 3;
    P[o] = x; P[o + 1] = y; P[o + 2] = z; C[o] = r * a; C[o + 1] = g * a; C[o + 2] = bl * a; n++;
  };
  for (const s of shells) {
    const u = st.t - s.launch;
    if (u < 0 || u > SHOW.rise + s.life + 0.1) continue;
    if (u < SHOW.rise) {
      // Rising: ease-out climb with a glittering tail.
      for (let k = 0; k < SHOW.trail; k++) {
        const uu = u - k * 0.045;
        if (uu < 0) break;
        const e = 1 - (1 - uu / SHOW.rise) ** 2.2;
        put(s.x + (s.apexX - s.x) * e, 1 + (s.apexY - 1) * e, s.z + (s.apexZ - s.z) * e, 1, 0.82, 0.5, (1 - k / SHOW.trail) * 0.9 * (0.8 + 0.2 * Math.sin(uu * 90 + k)));
      }
      continue;
    }
    const age = u - SHOW.rise;
    const fade = Math.max(0, 1 - age / s.life);
    if (age < 0.9 && f < CAPACITY.flashes) {
      const a = Math.exp(-age * 4.2);
      const o = f * 3;
      FP[o] = s.apexX; FP[o + 1] = s.apexY; FP[o + 2] = s.apexZ;
      FC[o] = s.hue[0] * a; FC[o + 1] = s.hue[1] * a; FC[o + 2] = s.hue[2] * a; f++;
    }
    const drag = s.kind === 'willow' ? 1.35 : 1.9;
    const grav = s.kind === 'willow' ? SHOW.gravity * 0.55 : SHOW.gravity * 0.4;
    for (let i = 0; i < s.count; i++) {
      const sc = direction(s, i, dir);
      const speed = s.radius * drag * sc * (0.85 + 0.3 * hash(i, s.id * 7 + 3));
      const hue = s.kind === 'double' && i % 2 ? s.hue2 : s.kind === 'willow' ? [1, 0.78, 0.38] : s.hue;
      for (let k = 0; k < SHOW.tail.length; k++) {
        const a = age - SHOW.tail[k];
        if (a < 0) break;
        const e = (1 - Math.exp(-drag * a)) / drag;
        const flicker = s.kind === 'crackle' ? 0.45 + 0.55 * Math.abs(Math.sin(a * 34 + i * 2.1)) : s.kind === 'willow' ? 1 : 0.85 + 0.15 * Math.sin(a * 22 + i);
        const life = Math.max(0, 1 - a / s.life);
        const bright = (s.kind === 'willow' ? life : life * life * (3 - 2 * life)) * flicker * SHOW.tailFade[k];
        // White-hot at birth, then the colour of the shell.
        const hot = Math.max(0, 1 - a * 3.2);
        put(s.apexX + dir[0] * speed * e, s.apexY + dir[1] * speed * e - grav * a * a * 0.5, s.apexZ + dir[2] * speed * e,
          hue[0] + (1 - hue[0]) * hot, hue[1] + (1 - hue[1]) * hot, hue[2] + (1 - hue[2]) * hot, bright * 1.15);
      }
    }
    void fade;
  }
  result.sparks = n; result.flashes = f;
  return result;
}

// How much the shells light the town right now: {intensity 0..1, color [r,g,b], x, y, z}.
export function glowAt(world, daySeconds) {
  const st = showTime(world, daySeconds);
  const out = { intensity: 0, color: [1, 1, 1], x: 0, y: 120, z: 0 };
  if (!st) return out;
  let sum = 0, r = 0, g = 0, bl = 0, px = 0, py = 0, pz = 0;
  for (const s of shellsOf(world, st.day)) {
    const age = st.t - s.launch - SHOW.rise;
    if (age < 0 || age > 1.6) continue;
    const a = Math.exp(-age * 3.2) * (1 - Math.exp(-age * 30));
    sum += a; r += s.hue[0] * a; g += s.hue[1] * a; bl += s.hue[2] * a; px += s.apexX * a; py += s.apexY * a; pz += s.apexZ * a;
  }
  if (sum <= 0) return out;
  out.intensity = Math.min(1, sum * 0.6);
  out.color = [r / sum, g / sum, bl / sum];
  out.x = px / sum; out.y = py / sum; out.z = pz / sum;
  void fract;
  return out;
}

export function newBuffers() {
  return {
    positions: new Float32Array(CAPACITY.sparks * 3), colors: new Float32Array(CAPACITY.sparks * 3),
    flashPositions: new Float32Array(CAPACITY.flashes * 3), flashColors: new Float32Array(CAPACITY.flashes * 3)
  };
}
