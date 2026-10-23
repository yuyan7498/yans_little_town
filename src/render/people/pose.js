// The pose solver: from a rig (build.js) and a pose {x, y, z, heading, stride, pose, eat}
// it writes one 3×4 matrix per bone (row-major, 12 floats, world space) into `out`.
// No allocation: everything goes through module-level scratch arrays.
//
// Conventions (see body.js): model forward +x, up +y, right +z; a hanging limb points
// down −y. A rotation (rx, ry, rz) is THREE's 'XYZ' order; rz > 0 swings a hanging limb
// forward (+x), rx < 0 swings a right-side (+z) limb outwards. Things that point *up*
// (the torso, the head) lean forward with rz < 0.

import { BONE, BONES } from './body.js';
import { SEATS } from '../props/seats.js';

const { pelvis: PELVIS, torso: TORSO, head: HEAD, upperL, foreL, upperR, foreR, thighL, shinL, footL, thighR, shinR, footR, prop: PROP, helmet: HELMET, hat: HAT, hem: HEM } = BONE;

export const L = new Float64Array(BONES * 12);          // bone matrices in figure space
const R = new Float64Array(9);
export const V = new Float64Array(12);                  // scratch points / directions
const ZERO12 = new Float64Array(12);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

// Seat tops above the ground, to find the floor under a sitting figure.
const SEAT_TOP = { bench: 1.4, stool: 1.35, chess: 1.15 };
const SITTING = new Set(['bench', 'stool', 'chess']);

// --- matrices ----------------------------------------------------------------

// L[b] = L[pb] · [Rx·Ry·Rz | t]   (pb < 0: no parent)
export function put(b, pb, tx, ty, tz, rx = 0, ry = 0, rz = 0) {
  const a = Math.cos(rx), s = Math.sin(rx), c = Math.cos(ry), d = Math.sin(ry), e = Math.cos(rz), f = Math.sin(rz);
  const ae = a * e, af = a * f, be = s * e, bf = s * f;
  R[0] = c * e; R[1] = -c * f; R[2] = d;
  R[3] = af + be * d; R[4] = ae - bf * d; R[5] = -s * c;
  R[6] = bf - ae * d; R[7] = s * e + af * d; R[8] = a * c;
  const o = b * 12;
  if (pb < 0) {
    for (let i = 0; i < 3; i++) { L[o + i * 4] = R[i * 3]; L[o + i * 4 + 1] = R[i * 3 + 1]; L[o + i * 4 + 2] = R[i * 3 + 2]; }
    L[o + 3] = tx; L[o + 7] = ty; L[o + 11] = tz;
    return;
  }
  const p = pb * 12;
  for (let i = 0; i < 3; i++) {
    const p0 = L[p + i * 4], p1 = L[p + i * 4 + 1], p2 = L[p + i * 4 + 2];
    L[o + i * 4] = p0 * R[0] + p1 * R[3] + p2 * R[6];
    L[o + i * 4 + 1] = p0 * R[1] + p1 * R[4] + p2 * R[7];
    L[o + i * 4 + 2] = p0 * R[2] + p1 * R[5] + p2 * R[8];
    L[o + i * 4 + 3] = p0 * tx + p1 * ty + p2 * tz + L[p + i * 4 + 3];
  }
}

// V[0..2] = L[b] · (x, y, z)
export function point(b, x, y, z) {
  const o = b * 12;
  V[0] = L[o] * x + L[o + 1] * y + L[o + 2] * z + L[o + 3];
  V[1] = L[o + 4] * x + L[o + 5] * y + L[o + 6] * z + L[o + 7];
  V[2] = L[o + 8] * x + L[o + 9] * y + L[o + 10] * z + L[o + 11];
}

// Two angles that turn a hanging limb (0, −1, 0) of bone `pb`'s child so that it points
// along the figure-space direction (dx, dy, dz): V[3] = rx, V[4] = rz.
function aim(pb, dx, dy, dz) {
  const o = pb * 12;
  const lx = L[o] * dx + L[o + 4] * dy + L[o + 8] * dz;
  const ly = L[o + 1] * dx + L[o + 5] * dy + L[o + 9] * dz;
  const lz = L[o + 2] * dx + L[o + 6] * dy + L[o + 10] * dz;
  V[4] = Math.asin(clamp(lx, -1, 1));
  V[3] = Math.atan2(-lz, -ly);
}

// A two-bone limb from the joint at (jx, jy, jz) of bone pb to the figure-space target (tx, ty, tz),
// the middle joint bending towards the pole (px, py, pz). Writes both bones.
function limb(up, fore, pb, jx, jy, jz, l1, l2, tx, ty, tz, px, py, pz) {
  point(pb, jx, jy, jz);
  const sx = V[0], sy = V[1], sz = V[2];
  let dx = tx - sx, dy = ty - sy, dz = tz - sz;
  let dist = Math.hypot(dx, dy, dz) || 1e-6;
  const maxReach = (l1 + l2) * 0.998, minReach = Math.abs(l1 - l2) + 0.02;
  const reach = clamp(dist, minReach, maxReach);
  dx /= dist; dy /= dist; dz /= dist;
  const a = (l1 * l1 - l2 * l2 + reach * reach) / (2 * reach), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  // pole component perpendicular to the limb axis
  const pd = px * dx + py * dy + pz * dz;
  let qx = px - pd * dx, qy = py - pd * dy, qz = pz - pd * dz;
  const ql = Math.hypot(qx, qy, qz) || 1;
  qx /= ql; qy /= ql; qz /= ql;
  const ex = sx + dx * a + qx * h, ey = sy + dy * a + qy * h, ez = sz + dz * a + qz * h;
  aim(pb, (ex - sx) / l1, (ey - sy) / l1, (ez - sz) / l1);
  put(up, pb, jx, jy, jz, V[3], 0, V[4]);
  // forearm: from the elbow towards the (clamped) end
  const fx = sx + dx * reach - ex, fy = sy + dy * reach - ey, fz = sz + dz * reach - ez;
  const fl = Math.hypot(fx, fy, fz) || 1;
  aim(up, fx / fl, fy / fl, fz / fl);
  put(fore, up, 0, -l1, 0, V[3], 0, V[4]);
}

// --- the solver -------------------------------------------------------------------

export function solvePose(rig, p, out, o) {
  const k = rig.k, kind = p.pose || 'walk';
  const stride = p.stride || 0;
  const sit = SITTING.has(kind), scoot = kind === 'scooter' || kind === 'pillion', bike = kind === 'bicycle';
  const T = rig.thigh, S = rig.shin, U = rig.upper, F = rig.fore + 0.45 * rig.hand;
  const stoop = rig.stoop;

  let hx = 0, hy = rig.hipY, torsoPitch = -stoop, headPitch = stoop * 0.7;
  let pelvisRoll = 0, pelvisYaw = 0, torsoYaw = 0, torsoRoll = 0, headYaw = 0;
  const ground = sit ? -SEAT_TOP[kind] : 0;
  const walking = kind === 'walk' && stride !== 0;

  let thL = 0, thR = 0, knL = 0, knR = 0, anL = 0, anR = 0;      // analytic leg angles (walk / stand / sit)
  let armL = 0, armR = 0, elbL = 0, elbR = 0, abdL = 0, abdR = 0;
  let legsIK = false, handsIK = 0;                              // 1 = hands to targets (set below)
  let ph = 0;                                                   // gait phase

  if (kind === 'walk' || kind === 'stand') {
    ph = stride;
    const idleSway = kind === 'stand' ? Math.sin(stride) * 0.012 : 0;
    if (walking) {
      const A = rig.step, sw = Math.sin(ph), cw = Math.cos(ph);
      thL = A * sw; thR = -A * sw;
      knL = 0.1 + 0.62 * Math.max(0, Math.cos(ph)) ** 1.3 * (A / 0.42);
      knR = 0.1 + 0.62 * Math.max(0, -Math.cos(ph)) ** 1.3 * (A / 0.42);
      armL = -rig.swing * sw; armR = rig.swing * rig.swingRight * sw;
      elbL = 0.14 + 0.5 * Math.max(0, armL / rig.swing); elbR = 0.14 + 0.5 * Math.max(0, armR / rig.swing);
      abdL = abdR = 0.05;
      pelvisYaw = 0.1 * sw; torsoYaw = -0.14 * sw; pelvisRoll = 0.025 * cw; torsoRoll = -0.02 * cw;
      torsoPitch -= 0.05; headYaw = 0.04 * sw;
      // keep both legs on the ground: the lower foot sets the hip height
      let reach = 0;
      for (let i = 0; i < 2; i++) {
        const a = i ? thR : thL, b = i ? knR : knL;
        const r = T * Math.cos(a) + S * Math.cos(a - b);
        if (r > reach) reach = r;
      }
      hy = reach + rig.footH + 0.02 * k;
      hy = Math.max(hy, rig.hipY - 0.35 * T);
      // ankles pitched so the stance foot lies flat, the swinging one toes down
      anL = -(thL - knL) + 0.12 * Math.max(0, -Math.cos(ph));
      anR = -(thR - knR) + 0.12 * Math.max(0, Math.cos(ph));
      if (rig.prop === 'cane') { armR = 0; elbR = 0; }
    } else {
      knL = knR = 0.03; abdL = abdR = 0.08 + idleSway;
      hy = T * Math.cos(0) + S * Math.cos(-0.03) + rig.footH + 0.02 * k;
      anL = anR = 0.03;
      armL = armR = 0.03; elbL = elbR = 0.12 + idleSway;
      torsoPitch -= idleSway; headPitch += idleSway;
      if (kind === 'stand') { pelvisRoll = idleSway * 0.7; }
    }
    if (rig.idle !== 'relaxed' && !walking) handsIK = rig.idle === 'front' ? 1 : 2;
    if (rig.prop === 'cane') handsIK = 3;
    if (rig.prop === 'iv') handsIK = 4;
  } else if (sit) {
    const seat = SEAT_TOP[kind];
    hx = -0.12 * k - (kind === 'chess' ? 0.05 : 0);
    hy = 0.9 * rig.thighR;
    const rel = hy - ground - S - rig.footH;       // hip above the knee-level floor
    const cosT = rel / T;
    const th = cosT >= 1 ? 1.4 : clamp(Math.acos(clamp(cosT, 0, 1)), 0.55, 1.4);
    thL = thR = th;
    knL = knR = th - (cosT >= 1 ? 0 : 0.0);        // shin vertical (the sum thigh − knee ≈ 0)
    if (cosT >= 1) { knL = knR = th + 0.1; }
    const dangle = cosT >= 1 ? Math.sin(stride * 0.7) * 0.12 : 0;
    thL += dangle; thR -= dangle; knL -= dangle; knR += dangle * 0.5;
    anL = anR = -(thL - knL) + 0.0;
    torsoPitch = -0.04 - stoop * 0.8 - (kind === 'chess' ? 0.12 : kind === 'stool' ? 0.06 : 0);
    headPitch = stoop * 0.6 + 0.04;
    handsIK = kind === 'chess' ? 6 : 5;
  } else if (scoot) {
    const s = SEATS.scooter;
    hx = -s.back - (kind === 'pillion' ? s.pillion : 0);
    hy = s.y;
    torsoPitch = kind === 'pillion' ? -0.1 : -0.14;
    headPitch = 0.1;
    legsIK = true;
    handsIK = kind === 'pillion' ? 8 : 7;
  } else if (bike) {
    const s = SEATS.bicycle;
    hx = -s.back; hy = s.y;
    torsoPitch = -0.5 - stoop;
    headPitch = 0.42;
    pelvisRoll = 0.015 * Math.sin(stride);
    legsIK = true;
    handsIK = 9;
    ph = stride;
  }

  const hxw = hx, hyw = hy;
  // --- spine
  put(PELVIS, -1, hxw, hyw, 0, pelvisRoll, pelvisYaw, bike ? -0.2 : 0);
  put(TORSO, PELVIS, 0, rig.waist, 0, torsoRoll, torsoYaw, torsoPitch + (kind === 'bicycle' ? 0.2 : 0));
  put(HEAD, TORSO, 0, rig.neckTop, 0, 0, headYaw - torsoYaw * 0.5, headPitch);
  // hat or helmet share the head's matrix
  const helmeted = scoot, hasHat = !helmeted;
  copy(HELMET, HEAD, helmeted); copy(HAT, HEAD, hasHat);

  // --- legs
  const hipZ = rig.hipZ;
  if (legsIK) {
    for (let i = 0; i < 2; i++) {
      const sd = i ? 1 : -1, up = i ? thighR : thighL, fo = i ? shinR : shinL;
      let tx, ty, tz;
      if (scoot) {
        const pil = kind === 'pillion';
        tx = pil ? -0.2 : 0.32; ty = 0.62; tz = sd * (pil ? 0.4 : 0.24);
      } else {
        // The crank turns clockwise seen from the rider's left: the front pedal goes down.
        const a = -ph + (i ? Math.PI : 0), r = 0.42 * Math.min(1, rig.legLen / 1.68 + 0.15);
        tx = 0.12 + r * Math.cos(a) + 0.0; ty = 0.9 + r * Math.sin(a) * 0.9; tz = sd * 0.27;
      }
      // ankle target = foot sole target + ankle height
      ty += rig.footH;
      limb(up, fo, PELVIS, 0, 0, sd * hipZ, T, S, tx, ty, tz, 1, 0, sd * 0.25);
    }
  } else {
    put(thighL, PELVIS, 0, 0, -hipZ, 0, 0, thL);
    put(shinL, thighL, 0, -T, 0, 0, 0, -knL);
    put(thighR, PELVIS, 0, 0, hipZ, 0, 0, thR);
    put(shinR, thighR, 0, -T, 0, 0, 0, -knR);
  }
  // feet: toes along +x, keep the sole roughly level
  for (let i = 0; i < 2; i++) {
    const sh = i ? shinR : shinL, ft = i ? footR : footL;
    let pitch;
    if (legsIK) {
      const o2 = sh * 12;
      pitch = -Math.atan2(L[o2 + 4], L[o2]) + (bike ? -0.1 : scoot ? 0 : 0);
    } else pitch = i ? anR : anL;
    put(ft, sh, 0, -S, 0, 0, 0, pitch);
  }

  // --- arms
  const sy = rig.shoulderY, sz = rig.shoulderZ;
  // hands: 0 hang/swing (analytic), otherwise IK targets
  if (handsIK === 0 || walking && handsIK < 3) {
    put(upperL, TORSO, 0, sy, -sz, abdL, 0, armL);
    put(foreL, upperL, 0, -U, 0, 0, 0, elbL);
    put(upperR, TORSO, 0, sy, sz, -abdR, 0, armR);
    put(foreR, upperR, 0, -U, 0, 0, 0, elbR);
  } else {
    const eat = p.eat || 0;
    for (let i = 0; i < 2; i++) {
      const sd = i ? 1 : -1, up = i ? upperR : upperL, fo = i ? foreR : foreL;
      let tx, ty, tz, px = 0, py = -1, pz = sd * 0.8;
      const hd = rig.torsoHD;
      switch (handsIK) {
        case 1: tx = hx + hd + 0.12 * k; ty = hy + rig.waist + 0.22 * k; tz = sd * 0.14 * k; pz = sd * 1.2; break;      // hands clasped in front
        case 2: tx = hx - hd - 0.08 * k; ty = hy + rig.waist + 0.0 * k; tz = sd * 0.13 * k; py = -1; px = -0.4; pz = sd * 0.8; break; // behind the back
        case 3:                                                                                                          // cane in the right hand
          if (sd > 0) { tx = hx + 0.3 * k + (walking ? 0.15 * Math.sin(ph) * k : 0); ty = rig.caneLen; tz = sz * 1.05 + 0.1 * k; }
          else { tx = hx + 0.0; ty = hy - 0.12 * k; tz = sd * (rig.torsoHW + 0.3 * k); }
          break;
        case 4:                                                                                                          // drip stand
          if (sd > 0) { tx = hx + 0.3 * k; ty = hy + 0.2 * k; tz = sz + 0.42 * k; }
          else { tx = hx + 0.05 * k; ty = hy - 0.1 * k; tz = sd * (rig.torsoHW + 0.2 * k); }
          break;
        case 5: case 6: {                                                                                                // sitting: on the lap, a bite now and then, or on the table
          const lap = kind === 'chess' ? 0 : 1;
          tx = hx + T * (lap ? 0.5 : 0.78) * Math.cos(Math.max(0, 1.4 - thL) * 0.0 + 0); ty = lap ? hy + rig.thighR + 0.14 * k : hy + 0.62 * k; tz = sd * 0.2 * k;
          if (kind === 'chess') { tx = hx + 1.12 * k * (0.9 + 0.2 * Math.abs(sd) * 0); ty = hy + 0.55 * k; tz = sd * 0.5 * k; }
          if (sd > 0 && eat > 0) {
            point(HEAD, rig.headCX + rig.headHD * 0.85, 0.3 * rig.headH, 0.06 * k);
            tx = lerp(tx, V[0], eat); ty = lerp(ty, V[1] - 0.05 * k, eat); tz = lerp(tz, V[2], eat);
          }
          px = 0.2; py = -1; pz = sd * 0.9;
          break;
        }
        case 7: tx = 0.98; ty = 2.78; tz = sd * 0.36; py = -1; pz = sd * 0.5; px = -0.3; break;                          // scooter grips
        case 8: tx = hx + hd + 0.05 * k; ty = hy + rig.waist + 0.15 * k; tz = sd * (rig.torsoHW * 0.75); px = 0; py = -0.4; pz = sd * 1; break; // pillion clutches the driver's waist
        default: tx = 0.78; ty = 2.74; tz = sd * 0.36; py = -1; pz = sd * 0.6; break;                                     // bicycle grips
      }
      limb(up, fo, TORSO, 0, sy, sd * sz, U, F, tx, ty, tz, px, py, pz);
    }
  }

  // --- skirt, props
  const thAvg = legsIK || sit ? (sit ? thL : 0.5) * 0.9 : (thL + thR) * 0.5 * 0.8 + 0;
  put(HEM, PELVIS, 0, 0, 0, 0, 0, sit ? thAvg * 0.8 : legsIK ? 0.7 : (thL + thR) * 0.3 + Math.abs(thL - thR) * 0.0);
  const showProp = !!rig.prop && !sit && !scoot && !bike;
  if (showProp) {
    switch (rig.prop) {
      case 'cane': put(PROP, -1, hx + 0.3 * k + (walking ? 0.15 * Math.sin(ph) * k : 0), rig.caneLen, rig.shoulderZ * 1.05 + 0.1 * k, 0, 0, walking ? -0.1 * Math.sin(ph) : 0); break;
      case 'iv': put(PROP, -1, hx + 0.3 * k, 0, rig.shoulderZ + 0.42 * k, 0, 0, 0); break;
      default: {
        point(foreR, 0, -rig.fore - 0.45 * rig.hand, 0);
        const sw = walking ? -rig.swing * rig.swingRight * Math.sin(ph) * 0.45 : 0;
        put(PROP, -1, V[0], V[1] + 0.0, V[2], 0, 0, sw);
      }
    }
  } else ZERO(PROP);

  finish(out, o, p, BONES);
}

// Figure space → world: root position and heading applied to `count` bone matrices.
export function finish(out, o, p, count) {
  const yaw = -(p.heading || 0), cy = Math.cos(yaw), sY = Math.sin(yaw);
  const px0 = p.x || 0, py0 = (p.y || 0), pz0 = p.z || 0;
  for (let b = 0; b < count; b++) {
    const s = b * 12, d = o + b * 12;
    if (L[s] === 0 && L[s + 1] === 0 && L[s + 2] === 0 && L[s + 5] === 0) { for (let i = 0; i < 12; i++) out[d + i] = 0; continue; }
    // Ry(yaw) rows: [c 0 s; 0 1 0; −s 0 c]
    for (let j = 0; j < 3; j++) {
      out[d + j] = cy * L[s + j] + sY * L[s + 8 + j];
      out[d + 4 + j] = L[s + 4 + j];
      out[d + 8 + j] = -sY * L[s + j] + cy * L[s + 8 + j];
    }
    out[d + 3] = cy * L[s + 3] + sY * L[s + 11] + px0;
    out[d + 7] = L[s + 7] + py0;
    out[d + 11] = -sY * L[s + 3] + cy * L[s + 11] + pz0;
  }
}

function copy(dst, src, on) {
  const d = dst * 12, s = src * 12;
  for (let i = 0; i < 12; i++) L[d + i] = on ? L[s + i] : 0;
}
function ZERO(b) { L.set(ZERO12, b * 12); }
