// A check on the street physics: runs a fresh copy of the street over a stretch of
// time and counts what should not happen.
//   overlaps   vehicles and walkers by their footprints, walkers against posts, trees
//              and benches (agent-steps over a small depth; `pairs` counts distinct pairs)
//   onZebra    vehicles standing on a zebra (steps), why, and how many in the walk phase
//   waits      movers held over a minute, by what holds them
//   lag        how far residents run behind their timetable; `arrivals`: how late each
//              trip on its own steam reaches its door, by mode
//   jitter     (with `jitter: true`, run at a frame's step, e.g. 1/60 s = 0.0267 min) per
//              thousand mover-frames: stepping to and fro (`back`), turning one way and
//              straight back (`turn`), standing pose on and off within a few frames
//              (`pose`), a vehicle stopping dead for one frame (`stopGo`), braking harder
//              than it can (`brake`), hopping further than it was moving (`hop`).

import { SECONDS_PER_MINUTE, MINUTES_PER_DAY } from '../clock.js';
import { doorTime } from './sim-schedule.js';

const now = () => (globalThis.performance ? globalThis.performance.now() : Date.now());

function depthOf(a, b) {
  const A = a.kind === 'ped' ? { hl: 0.3, hw: 0.36 } : a, B = b.kind === 'ped' ? { hl: 0.3, hw: 0.36 } : b;
  const dx = b.x - a.x, dz = b.z - a.z;
  let least = Infinity;
  const axes = [a.ux, a.uz, -a.uz, a.ux, b.ux, b.uz, -b.uz, b.ux];
  for (let i = 0; i < 8; i += 2) {
    const ux = axes[i], uz = axes[i + 1];
    const ra = A.hl * Math.abs(a.ux * ux + a.uz * uz) + A.hw * Math.abs(-a.uz * ux + a.ux * uz);
    const rb = B.hl * Math.abs(b.ux * ux + b.uz * uz) + B.hw * Math.abs(-b.uz * ux + b.ux * uz);
    least = Math.min(least, ra + rb - Math.abs(dx * ux + dz * uz));
    if (least <= 0) return 0;
  }
  return least;
}

export function runAudit(make, { day = 1, minute = 480, from = minute - 5, to = from + 30, step = 0.1, jitter = false, only = null } = {}) {
  const t0 = now(), sim = make(), traffic = sim.traffic, pace = traffic.pace, base = (day - 1) * MINUTES_PER_DAY;
  const out = { from, to, step, frames: 0, maxAgents: 0, vehicle: 0, vehicleWalker: 0, walker: 0, furniture: 0, forcedSteps: 0, pairs: {}, waits: {}, worst: [] };
  const worst = new Map(), arrived = new Map(), seen = new Map(), lags = [], lagBy = {};
  const furnitureCells = new Map();
  for (const f of sim.obstacles()) {
    const k = Math.floor(f.x / 12) + ',' + Math.floor(f.z / 12);
    if (!furnitureCells.has(k)) furnitureCells.set(k, []);
    furnitureCells.get(k).push(f);
  }
  const note = (key, depth, m, a, b) => {
    const kept = worst.get(key);
    if (!kept || kept.depth < depth) worst.set(key, { depth: +depth.toFixed(2), minute: +m.toFixed(1), x: +a.x.toFixed(1), z: +a.z.toFixed(1), a: a.id + '/' + a.cls, b: b.id ? b.id + '/' + b.cls : b.kind });
  };
  // Vehicles standing on a zebra, by why they stand there.
  out.onZebra = { steps: 0, inWalk: 0, why: {}, worst: [] };
  const zebras = traffic.junctions.filter(J => J.signal).flatMap(J => J.zebras.map(Z => ({ J, Z })));
  function zebraStops(list, m) {
    for (const a of list) {
      if (a.kind !== 'veh' || a.v > 0.3 * pace) continue;
      const hit = zebras.find(({ Z }) => {
        const cx = (Z.x0 + Z.x1) / 2, cz = (Z.z0 + Z.z1) / 2, hx = (Z.x1 - Z.x0) / 2, hz = (Z.z1 - Z.z0) / 2;
        if (Math.abs(a.x - cx) > hx + a.hl + 1 || Math.abs(a.z - cz) > hz + a.hl + 1) return false;
        const dx = cx - a.x, dz = cz - a.z;
        // (The stripes' own axes too: a car turned a little can touch neither edge.)
        const ex = a.hl * Math.abs(a.ux) + a.hw * Math.abs(a.uz), ez = a.hl * Math.abs(a.uz) + a.hw * Math.abs(a.ux);
        if (Math.abs(dx) > hx + ex - 0.3 || Math.abs(dz) > hz + ez - 0.3) return false;
        return Math.abs(dx * a.ux + dz * a.uz) < a.hl + hx * Math.abs(a.ux) + hz * Math.abs(a.uz) - 0.3 &&
          Math.abs(-dx * a.uz + dz * a.ux) < a.hw + hx * Math.abs(a.uz) + hz * Math.abs(a.ux) - 0.3;
      });
      if (!hit) continue;
      const B = a.blockedBy && traffic.agents.get(a.blockedBy), walk = hit.J.stage === 'walk' || hit.J.stage === 'flash';
      const why = a.cls + '>' + (a.junctionStop < 1e9 ? 'lights' : B ? (B.kind === 'ped' ? 'person' : 'queue') : a.blockedBy ? 'gap' : a.drive && a.s >= a.drive.end - 0.05 ? 'kerb' : a.s >= a.target - 0.05 ? 'timetable' : 'slow');
      out.onZebra.steps++; if (walk) out.onZebra.inWalk++;
      out.onZebra.why[why] = (out.onZebra.why[why] || 0) + 1;
      if (out.onZebra.worst.length < (globalThis.ZW||12) && (walk || !out.onZebra.worst.some(w => w.startsWith(a.id + " ")))) out.onZebra.worst.push(a.id + ' ' + why + ' ' + hit.J.id + ' @' + a.x.toFixed(1) + ',' + a.z.toFixed(1) + ' m' + m.toFixed(2) + (walk ? ' WALK' : ''));
    }
  }
  // Jitter, as drawn (heading smoothing, the standing pose after a still moment).
  const tracks = new Map(), shake = {}, shakers = new Map(), frameSec = step * SECONDS_PER_MINUTE;
  function shakes(list, m) {
    for (const a of list) {
      const face = Math.atan2(a.uz, a.ux) + (a.kind === 'ped' && !(a.ref && a.ref.followers) ? sim.sidestepTurn(a) : 0);
      const kind = a.kind === 'ped' ? (a.cls === 'bicycle' ? 'bicycle' : 'walker') : a.cls === 'scooter' ? 'scooter' : a.cls === 'bus' ? 'bus' : 'car';
      const j = tracks.get(a.id);
      if (!j || j.path !== a.path || j.kind !== kind) { tracks.set(a.id, { path: a.path, kind, x: a.x, z: a.z, h: face, dx: 0, dz: 0, dh: 0, d1: 0, still: 0, standing: false, flip: -99, backAt: -99, turnAt: -99 }); continue; }
      let turn = face - j.h;
      turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
      const h = j.h + turn * (1 - Math.exp(-frameSec / sim.TURN_EASE));
      j.still = a.v < 0.05 ? j.still + frameSec : 0;
      const standing = j.still >= sim.STILL_AFTER;
      const dx = a.x - j.x, dz = a.z - j.z, d = Math.hypot(dx, dz), d0 = Math.hypot(j.dx, j.dz), eps = kind === 'walker' ? 0.004 : kind === 'bicycle' ? 0.008 : 0.02;
      let dh = h - j.h;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const k = shake[kind] = shake[kind] || { back: 0, turn: 0, pose: 0, stopGo: 0, brake: 0, hop: 0, frames: 0 };
      const hit = what => {
        if (out.frames <= 12) return;      // not in the first frames, after the run-in
        k[what]++;
        const s = shakers.get(a.id) || { id: a.id, kind, n: 0, what: {}, x: +a.x.toFixed(1), z: +a.z.toFixed(1), m: +m.toFixed(2) };
        s.n++; s.what[what] = (s.what[what] || 0) + 1; shakers.set(a.id, s);
      };
      k.frames++;
      // (A shake is one reversal hard on another: a single step back or glance aside is not.)
      if (d > eps && d0 > eps && dx * j.dx + dz * j.dz < -0.3 * d * d0) { if (out.frames - j.backAt <= 3) hit('back'); j.backAt = out.frames; }
      if (Math.abs(dh) > 0.03 && Math.abs(j.dh) > 0.03 && dh * j.dh < 0) { if (out.frames - j.turnAt <= 3) hit('turn'); j.turnAt = out.frames; }
      if (a.kind === 'ped' && standing !== j.standing) { if (out.frames - j.flip <= 4) hit('pose'); j.flip = out.frames; }
      if (a.kind === 'veh' && j.d1 > eps && d0 < eps * 0.1 && d > eps) hit('stopGo');
      if (a.kind === 'veh' && d0 - d > 1.6 * traffic.brake * step * step) hit('brake');
      if (d > 0.15 + 2 * (a.v + Math.abs(a.latV || 0)) * step) hit('hop');
      Object.assign(j, { x: a.x, z: a.z, h, dx, dz, dh, d1: d0, standing });
    }
  }

  const cells = new Map();
  for (let m = from; m <= to + 1e-9; m += step) {
    sim.step((base + m) * SECONDS_PER_MINUTE);
    out.frames++;
    const list = traffic.list();
    if (jitter) shakes(list, m);
    zebraStops(list, m);
    out.maxAgents = Math.max(out.maxAgents, list.length);
    for (const c of cells.values()) c.length = 0;
    for (const a of list) {
      const k = Math.floor(a.x / 12) + ',' + Math.floor(a.z / 12);
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(a);
    }
    for (const a of list) {
      if (a.force) out.forcedSteps++;
      if (a.wait > 1) {
        const b = a.blockedBy ? traffic.agents.get(a.blockedBy) : null;
        const why = a.cls + (a.junctionStop < 1e9 ? '>junction' : b ? '>' + b.cls + (b.ux * a.ux + b.uz * a.uz > 0.64 ? '(ahead)' : '(cross)') : a.kind === 'ped' && a.blocker === 'ahead' ? '>kerb' : '>?');
        out.waits[why] = (out.waits[why] || 0) + 1;
      }
      const trip = a.ref && a.ref.key === a.id ? a.ref : null;
      if (trip) {
        lags.push(a.target - a.s); (lagBy[a.cls] = lagBy[a.cls] || []).push(a.target - a.s);
        seen.set(a.id, trip.mode);
        if (!arrived.has(a.id) && a.s >= a.path.total - 0.05) arrived.set(a.id, { mode: trip.mode, late: sim.minuteOf(trip, base + m) - doorTime(trip) });
      }
      const cx = Math.floor(a.x / 12), cz = Math.floor(a.z / 12);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        for (const b of cells.get((cx + dx) + ',' + (cz + dz)) || []) {
          if (b.id <= a.id || (a.ghost && b.kind === 'veh') || (b.ghost && a.kind === 'veh')) continue;
          if (a.kind === 'ped' && b.kind === 'ped' && (a.cls === 'bicycle') !== (b.cls === 'bicycle')) continue;   // they pass through by design
          if (a.kind !== b.kind && traffic.underground(a) !== traffic.underground(b)) continue;
          if (a.kind === 'veh' && b.kind === 'veh' && traffic.underground(a) !== traffic.underground(b)) continue;
          const depth = depthOf(a, b), kind = a.kind === 'veh' && b.kind === 'veh' ? 'vehicle' : a.kind === 'ped' && b.kind === 'ped' ? 'walker' : 'vehicleWalker';
          if (depth <= (kind === 'walker' ? 0.15 : 0.1)) continue;
          out[kind]++;
          if (!only || only === kind) note(a.id + '|' + b.id, depth, m, a, b);
        }
        if (a.kind !== 'ped') continue;
        for (const f of furnitureCells.get((cx + dx) + ',' + (cz + dz)) || []) {
          const r = f.post ? f.r : 0, hx = f.post ? 0 : f.w / 2, hz = f.post ? 0 : f.d / 2;
          const gx = Math.max(0, Math.abs(a.x - f.x) - hx), gz = Math.max(0, Math.abs(a.z - f.z) - hz);
          const depth = 0.3 + r - Math.hypot(gx, gz);
          if (depth > 0.15) { out.furniture++; if (!only || only === 'furniture') note(a.id + '|' + f.x + ',' + f.z, depth, m, a, f); }
        }
      }
    }
  }
  out.worst = [...worst.values()].sort((p, q) => q.depth - p.depth).slice(0, 12);
  for (const [key] of worst) { const kind = key.includes(',') ? 'furniture' : 'agents'; out.pairs[kind] = (out.pairs[kind] || 0) + 1; }
  lags.sort((p, q) => p - q);
  const byMode = {};
  for (const r of arrived.values()) { const b = byMode[r.mode] = byMode[r.mode] || { n: 0, sum: 0, over5: 0 }; b.n++; b.sum += Math.max(0, r.late); if (r.late > 5) b.over5++; }
  // Given up on: seen out, never reached the door, and gone from the street.
  out.dropped = [];
  for (const [id, mode] of seen) {
    if (!arrived.has(id) && !traffic.agents.has(id) && !sim.finished.has(id)) { const b = byMode[mode] = byMode[mode] || { n: 0, sum: 0, over5: 0 }; b.dropped = (b.dropped || 0) + 1; out.dropped.push(id); }
  }
  out.arrivals = Object.fromEntries(Object.entries(byMode).map(([k, b]) => [k, { n: b.n, meanLate: +(b.sum / Math.max(1, b.n)).toFixed(1), over5: b.over5, dropped: b.dropped || 0 }]));
  out.lagBy = Object.fromEntries(Object.entries(lagBy).map(([k, v]) => [k, +(v.reduce((t, x) => t + x, 0) / v.length).toFixed(1)]));
  out.lag = { mean: +(lags.reduce((t, v) => t + v, 0) / Math.max(1, lags.length)).toFixed(1), p90: +(lags[Math.floor(lags.length * 0.9)] || 0).toFixed(1), max: +(lags[lags.length - 1] || 0).toFixed(1) };
  if (jitter) {
    out.jitter = Object.fromEntries(Object.entries(shake).map(([kind, k]) => [kind, { frames: k.frames,
      ...Object.fromEntries(['back', 'turn', 'pose', 'stopGo', 'brake', 'hop'].map(w => [w, +(k[w] * 1000 / k.frames).toFixed(2)])) }]));
    out.shakers = [...shakers.values()].sort((p, q) => q.n - p.n).slice(0, 12);
  }
  out.ms = Math.round(now() - t0);
  out.msPerStep = +(out.ms / Math.max(1, out.frames)).toFixed(2);
  Object.defineProperty(out, 'sim', { value: sim });
  return out;
}
