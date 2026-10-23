// Street physics for everything that moves through the town: residents on foot and
// on their own vehicles, the service vehicles, the station's buses and taxis. Every
// mover follows its own polyline. Its timetable says how far along it should be by
// now (`target`); this layer decides how far it really gets. Nobody drives into the
// vehicle ahead, cuts across a junction through crossing traffic or runs a pedestrian
// down; walkers step round each other and round lamp posts, trees and benches. A mover
// that was held up runs a little faster afterwards until it is back on schedule.
//
// Each step every mover's position from the step before goes into a grid; then each
// looks along its own path for whatever is in its way and moves as far as it safely
// can. Decisions read the previous positions only, so the order never matters.
// Time in town minutes, distances in town units. Pure, no allocation per step once
// warmed up (scratch buffers are kept on the instance).
//
// inputs: [{ id, group: 'resident'|'transit'|'service', kind: 'ped'|'veh', path, target,
//   start?, walkFree, rideFree (units/min), hl, hw (half length / width), cls, lat0 (own
//   sideways line), room, drive?: {walkEnd, start, end, walkStart, cls, hl, hw},
//   jumps?: [{at, to, check?: {hl, hw}}], noDoorCheck?, openStart?, carryOn?, ref? }]

import { createGrid } from './sim-grid.js';
import { hash } from '../random.js';
import { wrapS, pieceAt, pointAt, piecesAhead, sweepInto, clipSegment } from './sim-path.js';
import { buildJunctions, stepSignal, stepUnsignalled, resetJunction, signalStates, SIGNAL } from './signals.js';

const CELL = 10;
const BRAKE = 16;            // units/min² a vehicle sheds when it has to stop (at pace 1)
const LAT_RATE = 1.7;        // units/min a walker slides sideways at most
// The sideways line a walker wants is their own lane pushed off it LAT_PUSH times the
// room missing to the nearest walker on either side. They ease toward it over about
// LAT_EASE minutes, never more than LAT_SHARE of the way in one step: everyone in a crowd
// moves at once, and going further would set the crowd shuffling to and fro (it settles
// while LAT_SHARE * (1 + 4 * LAT_PUSH) stays under 1).
const LAT_PUSH = 4, LAT_EASE = 0.12, LAT_SHARE = 0.06;
// With nobody else pushing, only posts and benches steer a walker: nothing moves back,
// so they ease over DODGE_EASE minutes whatever the step (the share cap above is per
// step, and at 30 frames a second would leave them too little time to get round).
const DODGE_EASE = 0.25;
const PED_HEAD_START = 0.5;  // minutes a pedestrian is granted at a crossing
const STUCK = 3;             // minutes of waiting to give way before going anyway
const PATIENCE = 4;           // minutes held at a junction for crossing traffic before it is let in on the heels of it
const GATE_LINES = 6;         // how wide a band of a compound's gate people spread over as they pass it
const GATE_SPREAD = 9;        // and how far before it they begin to
const SLIP_AFTER = 10;       // minutes stuck behind something that is not going anywhere before slipping past (counted in info().slips)
const STUCK_ON_FOOT = 6;     // a walker waits longer for a car stopped across the way
const MAX_STEP = 0.35;       // longer frames are split into steps of this (÷ pace)
export const MAX_GAP = 4;    // a jump in time beyond this resets everyone to schedule
const SETTLE = 0.06;         // minutes a standing vehicle's way must stay open before it moves off
// Pick-up in units/min² (× pace²): from standing to cruising in about a minute and a half.
const ACCEL = { car: 5.5, taxi: 5.5, police: 5.5, van: 5, scooter: 7, bicycle: 4, bus: 3.5 };
const AHEAD = 'ahead';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createTraffic({ world = null, pace = 3, roomAt = null } = {}) {
  pace = Math.max(1, pace);
  const brake = BRAKE * pace * pace, stepMax = MAX_STEP / pace;
  // A vehicle under a tunnel's lid and someone walking over it are not in each other's way.
  const tunnels = ((world && world.tunnels) || []).map(t => ({ z: t.z, halfD: t.halfD, coverX: t.coverX }));
  const riverX = world && world.river ? (world.river.x0 + world.river.x1) / 2 : 0;
  const junctions = world ? buildJunctions(world) : [];
  const signalled = junctions.filter(J => J.signal);
  const junctionById = new Map(junctions.map(J => [J.id, J]));
  const agents = new Map();
  let list = [];
  const grid = createGrid(CELL), statics = createGrid(CELL);
  let staticList = [], staticStamp = 0;
  // Per path, kept here and not on the path: paths are shared with other layers.
  const crossingCache = new WeakMap(), walkCache = new WeakMap(), keepCache = new WeakMap();
  let lastTime = null, frame = 0, clock = 0;
  const boarded = [], spawned = [];
  // Scratch.
  const pieces = [], nearDecide = [], nearSpot = [], nearRoom = [], nearWay = [], nearOcc = [], nearStatic = [], nearDoor = [];
  const bufMine = new Float64Array(4 * 256), bufTheirs = new Float64Array(4 * 256);
  const p1 = { x: 0, z: 0, ux: 1, uz: 0 }, p2 = { x: 0, z: 0, ux: 1, uz: 0 }, p3 = { x: 0, z: 0, ux: 1, uz: 0 }, p4 = { x: 0, z: 0, ux: 1, uz: 0 };
  const proj = { a: 0, l: 0, ux: 0, uz: 0, off: 0 };
  const crossingAt = { j: null, enter: 0, exit: 0 };
  const asking = [], askPool = [];
  const dodgeList = [], dodgePool = [];
  const slipOnce = A => { if (!A.slipped) { A.slipped = true; slips++; } };
  let slips = 0;           // times a long-stuck vehicle was let past what held it (should stay 0)

  function underground(st) {
    if (st.kind !== 'veh') return false;
    for (let i = 0; i < tunnels.length; i++) {
      const t = tunnels[i];
      if (Math.abs(st.z - t.z) < t.halfD + 0.5 && Math.abs(st.x - riverX) < t.coverX) return true;
    }
    return false;
  }

  // Ground-level street furniture walkers keep clear of: posts {x, z, r}, or items of
  // the furniture plan (src/core/world/furniture.js) — their world rectangle `box`, or
  // failing that w across and d along their heading.
  function setObstacles(items) {
    statics.clear();
    staticList = [];
    for (const o of items || []) {
      if (!o) continue;
      let x = o.x, z = o.z, w, d;
      if (o.r > 0) w = d = o.r * 2;
      else if (o.box) { w = o.box.x1 - o.box.x0; d = o.box.z1 - o.box.z0; x = (o.box.x0 + o.box.x1) / 2; z = (o.box.z0 + o.box.z1) / 2; }
      else if (o.w > 0 && o.d > 0) {
        const c = Math.abs(Math.cos(o.heading || 0)), s = Math.abs(Math.sin(o.heading || 0));
        w = c * o.d + s * o.w; d = s * o.d + c * o.w;
      } else continue;
      if (!(w > 0 && d > 0)) continue;
      const ob = { x, z, w, d, r: o.r || Math.hypot(w, d) / 2, post: !!o.r, kind: o.kind || null, mark: 0 };
      staticList.push(ob);
      statics.putWide(ob, ob.x, ob.z, ob.r);
    }
  }

  function reset() {
    agents.clear(); list = []; lastTime = null;
    for (const J of junctions) resetJunction(J);
  }

  // ------------------------------------------------------------------ placing
  function place(st) {
    const path = st.path, s = wrapS(path, st.s), i = pieceAt(path, s), P = path.points;
    const a = P[i - 1] || P[0], b = P[i] || a;
    const span = path.lengths[i] - path.lengths[i - 1], t = span > 1e-9 ? (s - path.lengths[i - 1]) / span : 0;
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    if (len > 1e-9) { st.ux = dx / len; st.uz = dz / len; }
    st.px = a.x + dx * t; st.pz = a.z + dz * t;
    if (st.kind === 'ped' && len > 1e-9) bend(st, path, i, s);
    st.x = st.px - st.uz * st.lat; st.z = st.pz + st.ux * st.lat;
  }
  // Someone on foot turns through each bend of their path instead of snapping round at
  // the corner (which would also swing them across their line in one step). Turning
  // right round they turn away from the side they keep to.
  function bend(st, path, i, s) {
    const L = path.lengths, n = path.points.length, p = path.points;
    let from, to, f;
    const w0 = i >= 2 ? Math.min(0.9, (L[i] - L[i - 1]) / 2, (L[i - 1] - L[i - 2]) / 2) : 0;
    const w1 = i + 1 < n ? Math.min(0.9, (L[i] - L[i - 1]) / 2, (L[i + 1] - L[i]) / 2) : 0;
    if (w0 > 1e-3 && s - L[i - 1] < w0) { from = i - 1; to = i; f = 0.5 + (s - L[i - 1]) / (2 * w0); }
    else if (w1 > 1e-3 && L[i] - s < w1) { from = i; to = i + 1; f = 0.5 - (L[i] - s) / (2 * w1); }
    else return;
    let ax = p[from].x - p[from - 1].x, az = p[from].z - p[from - 1].z, bx = p[to].x - p[to - 1].x, bz = p[to].z - p[to - 1].z;
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    if (la < 1e-9 || lb < 1e-9) return;
    ax /= la; az /= la; bx /= lb; bz /= lb;
    let turn = Math.atan2(ax * bz - az * bx, ax * bx + az * bz);
    if (Math.abs(turn) > Math.PI - 0.05) turn = st.lat > 0 ? -Math.PI : Math.PI;
    const r = turn * f * f * (3 - 2 * f), cs = Math.cos(r), sn = Math.sin(r);
    st.ux = ax * cs - az * sn; st.uz = ax * sn + az * cs;
  }

  function rebuildGrid() {
    grid.clear();
    for (let i = 0; i < list.length; i++) {
      const st = list[i];
      grid.put(st, st.x, st.z);
      if (st.reservation && st.kind === 'ped') grid.put(st.reservation, st.reservation.x, st.reservation.z);
      else st.reservation = null;
    }
  }

  // ------------------------------------------------------------------ sync
  function shape(st) {
    const d = st.drive;
    st.kind = !d || st.group !== 'resident' ? st.base : (st.s >= d.start - 1e-6 && st.s <= d.end + 1e-6 ? 'veh' : 'ped');
    // A resident's own vehicle keeps to its lane line (the walking lane is for the pavement).
    if (st.kind === 'veh' && d) { st.hl = d.hl; st.hw = d.hw; st.cls = d.cls; st.lat = 0; }
    else if (d) { st.hl = st.walkHl; st.hw = st.walkHw; st.cls = st.walkCls; }
    // Someone stepping to or from their own vehicle at the kerb is not in the way.
    st.ghost = st.kind === 'ped' && !!d && ((st.s >= d.walkEnd - 1.4 && st.s <= d.start) || (st.s >= d.walkStart && st.s <= d.walkStart + 1.4));
    st.vfree = st.kind === 'veh' ? st.rideFree : st.walkFree;
    st.look = st.kind === 'veh' ? st.hl + 3 + st.v * 0.9 / pace : 2.2 + st.hl - 0.35 + st.v * 0.35;   // a cyclist looks further
    st.accel = (ACCEL[st.cls] || 6) * (st.kind === 'veh' ? pace * pace : 1);
  }

  function newAgent(input, s) {
    return {
      id: input.id, path: input.path, s, v: 0, lat: input.lat0 || 0, latV: 0, wait: 0, yieldTo: null, force: false, forceUntil: 0, slip: false, slipUntil: 0, slipped: false,
      ux: 1, uz: 0, px: 0, pz: 0, x: 0, z: 0, openSince: null, target: null, targetV: 0, group: 'resident', base: 'ped', kind: 'ped',
      walkFree: 1.6, rideFree: 1.6, vfree: 1.6, drive: null, jumps: null, lat0: 0, room: 1, ref: null, openStart: false,
      hl: 0.35, hw: 0.42, cls: 'walker', walkHl: 0.35, walkHw: 0.42, walkCls: 'walker', look: 2, accel: 6, seen: 0, ghost: false,
      next: s, nextLat: 0, nextV: 0, blocker: null, blockedBy: null, leadGap: Infinity, leadId: null, junctionStop: Infinity,
      holdWhy: null, holdAt: null, nearJunction: false, keepAt: null, squeeze: false, squeezeUntil: 0, dodge: null, dodgeLeft: false, jumped: false,
      reservation: null, queued: false, reserve: false, born: clock
    };
  }

  function sync(inputs, fresh, frameDt) {
    frame++;
    spawned.length = 0;
    let changed = false;
    for (let n = 0; n < inputs.length; n++) {
      const input = inputs[n];
      let st = agents.get(input.id);
      if (!st || st.path !== input.path) {
        // Out of the door only once the doorway is clear; until then they stay in.
        if (!fresh && input.group === 'resident' && !input.noDoorCheck && doorwayTaken(input.path)) continue;
        if (!fresh && input.group === 'resident') spawned.push(input.path.points[0]);
        // A bus or taxi pulls out only into a clear stretch of lane (one carrying on from
        // where it already stands is just carrying on).
        if (!fresh && input.group !== 'resident' && !input.carryOn && !st) {
          const at = pointAt(input.path, input.start !== undefined ? input.start : 0, p1);
          if (!spotClear(at.x, at.z, at.ux, at.uz, input, null)) continue;
        }
        st = newAgent(input, fresh ? input.target : input.start !== undefined ? input.start : 0);
        agents.set(input.id, st);
        changed = true;
      }
      // How fast the timetable moves on (a vehicle catching up with it eases to that).
      st.targetV = frameDt > 0 && st.target !== null ? Math.max(0, (input.target - st.target) / frameDt) : st.targetV;
      st.group = input.group; st.base = input.kind; st.target = input.target;
      st.walkFree = input.walkFree || 1.6; st.rideFree = input.rideFree || input.walkFree || 1.6;
      st.drive = input.drive || null; st.jumps = input.jumps || null; st.lat0 = input.lat0 || 0;
      st.room = input.room === undefined ? 1 : input.room; st.ref = input.ref || null; st.openStart = !!(input.noDoorCheck || input.openStart);
      st.walkHl = input.hl || 0.35; st.walkHw = input.hw || 0.42; st.walkCls = input.cls || 'walker';
      if (!st.drive) { st.hl = st.walkHl; st.hw = st.walkHw; st.cls = st.walkCls; }
      st.seen = frame;
      shape(st);
      place(st);
    }
    for (const [id, st] of agents) if (st.seen !== frame) { agents.delete(id); changed = true; }
    if (changed) list = [...agents.values()];
  }

  function doorwayTaken(path) {
    const p = path.points[0];
    // Someone who stepped out of the same door earlier in this step counts too.
    for (let i = 0; i < spawned.length; i++) if (Math.hypot(spawned[i].x - p.x, spawned[i].z - p.z) < 0.95) return true;
    grid.gather(p.x - 2, p.z - 2, p.x + 2, p.z + 2, nearDoor);
    for (const B of nearDoor) {
      if (B.cls !== 'bicycle' && !B.reserve && Math.hypot(B.x - p.x, B.z - p.z) < (B.kind === 'ped' ? 0.95 : B.hl + 0.6)) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ decisions
  // Where B sits along A's path ahead (the `n` pieces in `pieces`): proj.{a (distance on
  // A's path), l (offset right of A's line), ux, uz}, or null when nowhere near it.
  function project(A, B, n) {
    let found = false, best = Infinity;
    const reach = B.hl + B.hw;
    for (let k = 0; k < n; k++) {
      const p = pieces[k], dx = B.x - p.ax, dz = B.z - p.az;
      const along = dx * p.ux + dz * p.uz, lat = -dx * p.uz + dz * p.ux;
      if (along < -reach - (k ? 0 : A.hl) || along > p.len + reach) continue;
      // The first piece starts at A itself: what lies behind keeps its true (negative)
      // distance so it is never mistaken for something in front.
      const clamped = Math.min(p.len, k ? Math.max(0, along) : along);
      const off = Math.abs(lat) + Math.abs(along - clamped);
      if (off < best) { best = off; found = true; proj.a = p.start + clamped; proj.l = lat; proj.ux = p.ux; proj.uz = p.uz; proj.off = off; }
    }
    return found ? proj : null;
  }

  // Bumper to bumper: a little more at speed; two wheels close up tighter.
  function gapFor(A, B) {
    if (A.kind === 'ped') return B.kind === 'ped' ? 0.25 : 0.7;
    if (B.kind === 'ped') return 1.6;
    return A.hw < 1 && B.hw < 1 ? 0.5 + 0.1 * A.v / pace : 0.8 + 0.15 * A.v / pace;
  }

  // A and B want the same patch of ground: does A give way?
  function givesWay(A, B, gapA) {
    if (B.yieldTo === A.id) return false;           // B is already waiting for A
    if (A.yieldTo === B.id) return true;            // keep waiting rather than dither
    const dx = A.x - B.x, dz = A.z - B.z;
    const alongB = dx * B.ux + dz * B.uz, latB = Math.abs(-dx * B.uz + dz * B.ux);
    const c = Math.abs(A.ux * B.ux + A.uz * B.uz), s = Math.abs(A.ux * B.uz - A.uz * B.ux);
    const aLat = s * A.hl + c * A.hw, aAlong = c * A.hl + s * A.hw;
    const inB = alongB > 0 && alongB < B.look + B.hl + 2 && latB < B.hw + aLat + 0.15;
    if (!inB) return true;                           // B is in A's way and has not seen A
    // They see each other: whoever reaches the meeting point first goes first.
    const tA = Math.max(0, gapA) / Math.max(A.v, A.vfree * 0.5, 0.1) - (A.kind === 'ped' ? PED_HEAD_START : 0);
    let tB = Math.max(0, alongB - B.hl - aAlong) / Math.max(B.v, B.vfree * 0.5, 0.1) - (B.kind === 'ped' ? PED_HEAD_START : 0);
    if (B.kind === 'veh' && B.v < 0.05 * pace && A.kind === 'ped') tB += 1;   // a car standing still lets the walker go
    if (Math.abs(tA - tB) < 1e-3) return A.id > B.id;
    return tA > tB;
  }

  // Is this patch of lane free for a vehicle of `size` to appear on? A standing queue
  // only needs a vehicle-length gap; moving traffic behind needs room to stop.
  function spotClear(cx, cz, ux, uz, size, self) {
    grid.gather(cx - 16, cz - 16, cx + 16, cz + 16, nearSpot);
    for (let i = 0; i < boarded.length; i++) nearSpot.push(boarded[i]);   // appeared earlier this step
    for (const B of nearSpot) {
      // A gap kept for someone else pulling out is not in the way (two neighbours at the
      // kerb would otherwise each wait for the other's gap for ever).
      if (B === self || B.kind !== 'veh' || B.reserve) continue;
      const dx = B.x - cx, dz = B.z - cz, along = dx * ux + dz * uz, lat = -dx * uz + dz * ux;
      const c = Math.abs(B.ux * ux + B.uz * uz), s = Math.abs(B.ux * uz - B.uz * ux);
      const eAlong = c * B.hl + s * B.hw, eLat = s * B.hl + c * B.hw;
      if (Math.abs(lat) >= size.hw + eLat + 0.02) continue;
      // A driver already stopped for this very gap only has to be clear of it.
      const mine = self && B.blockedBy === 'res:' + self.id && B.v < 0.5 * pace;
      const still = B.v < 2.5 * pace;
      const behind = size.hl + (mine ? 0 : still ? 0.5 : 1.5 + (B.ux * ux + B.uz * uz > 0.5 ? B.v * B.v / (2 * brake) + 1 : 0));
      if (along + eAlong > -behind && along - eAlong < size.hl + (still ? 0.5 : 1.2)) return false;
    }
    boarded.push({ x: cx, z: cz, ux, uz, hl: size.hl, hw: size.hw, v: 0, kind: 'veh', reserve: false });
    return true;
  }
  function clearToBoard(A, at, size) {
    const spot = pointAt(A.path, at, p2);
    return spotClear(spot.x, spot.z, spot.ux, spot.uz, size, A);
  }

  // A boarding or alighting step: onto the vehicle once the lane is clear, off it as
  // soon as the drive is done. True while A is at one (nothing else to decide).
  function jumpStep(A, dt) {
    for (const jump of A.jumps) {
      if (!(A.s >= jump.at - 1e-6 && A.s < jump.to - 1e-6 && A.target >= jump.to - 1e-6)) continue;
      // Pulling out at the planned spot, or (once kept waiting, the kerb lined with a
      // queue) into the first gap a few lengths further along the lane.
      let into = !jump.check || clearToBoard(A, jump.to, jump.check) ? jump.to : -1;
      for (let off = 2.5; into < 0 && jump.check && A.wait > 0.8 && off <= 10; off += 2.5) {
        if (A.drive && jump.to + off > A.drive.end - jump.check.hl - 2) break;
        if (clearToBoard(A, jump.to + off, jump.check)) into = jump.to + off;
      }
      if (into >= 0) { A.next = into; A.jumped = true; A.reservation = null; }
      else {
        A.wait += dt;
        // Kept waiting at the kerb: the next driver along leaves a gap to pull into.
        if (A.wait > 0.8 && !A.reservation) {
          const spot = pointAt(A.path, jump.to, p2);
          A.reservation = { id: 'res:' + A.id, x: spot.x, z: spot.z, ux: spot.ux, uz: spot.uz, hl: jump.check.hl, hw: jump.check.hw,
            v: 0, kind: 'veh', reserve: true, look: 0, vfree: 0, yieldTo: null, blockedBy: null, ghost: false, cls: 'gap', s: 0 };
        }
      }
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ junctions
  // Where a path runs through each junction box: [{j, enter, exit}] in path distance.
  function crossingsOf(path) {
    let out = crossingCache.get(path);
    if (out) return out;
    out = [];
    const P = path.points, L = path.lengths;
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i], len = L[i] - L[i - 1];
      if (len < 1e-6) continue;
      for (const J of junctions) {
        if (Math.max(a.x, b.x) < J.x - J.hx || Math.min(a.x, b.x) > J.x + J.hx || Math.max(a.z, b.z) < J.z - J.hz || Math.min(a.z, b.z) > J.z + J.hz) continue;
        const t = clipSegment(a, b, J.x - J.hx, J.x + J.hx, J.z - J.hz, J.z + J.hz);
        if (!t) continue;
        out.push({ j: J, enter: L[i - 1] + t[0] * len, exit: L[i - 1] + t[1] * len });
      }
    }
    // Along the path (one long segment can pass several junctions), then join the pieces
    // of one junction that a bend inside the box split.
    out.sort((p, q) => p.enter - q.enter);
    const joined = [];
    for (const c of out) {
      let prev = null;
      for (let k = joined.length - 1; k >= 0 && !prev; k--) if (joined[k].j === c.j) prev = joined[k];
      if (prev && c.enter - prev.exit < 0.5) prev.exit = Math.max(prev.exit, c.exit);
      else joined.push(c);
    }
    crossingCache.set(path, joined);
    return joined;
  }
  // Where a walk crosses the road at lights: [{j, axis, enter, exit}] in path distance.
  function walksOf(path) {
    let out = walkCache.get(path);
    if (out) return out;
    out = [];
    const P = path.points, L = path.lengths;
    for (let i = 1; i < P.length && signalled.length; i++) {
      const a = P[i - 1], b = P[i], len = L[i] - L[i - 1];
      if (len < 1e-6) continue;
      const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
      for (const J of signalled) {
        if (Math.max(a.x, b.x) < J.x - J.hx - 6 || Math.min(a.x, b.x) > J.x + J.hx + 6 || Math.max(a.z, b.z) < J.z - J.hz - 6 || Math.min(a.z, b.z) > J.z + J.hz + 6) continue;
        for (const Z of J.walks) {
          // A zebra counts for someone walking over it, not along its edge (the box always).
          if ((Z.along === 'z' && Math.abs(uz) < 0.6) || (Z.along === 'x' && Math.abs(ux) < 0.6)) continue;
          const t = clipSegment(a, b, Z.x0, Z.x1, Z.z0, Z.z1);
          if (!t) continue;
          const axis = Z.axis || (Math.abs(ux) > Math.abs(uz) ? 'ew' : 'ns');
          const enter = L[i - 1] + t[0] * len, exit = L[i - 1] + t[1] * len, last = out[out.length - 1];
          if (last && last.j === J && last.axis === axis && enter - last.exit < 0.6) last.exit = Math.max(last.exit, exit);
          else out.push({ j: J, axis, enter, exit });
        }
      }
    }
    out.sort((p, q) => p.enter - q.enter);
    walkCache.set(path, out);
    return out;
  }
  // Where a vehicle's path runs over a junction with lights, from the zebra it crosses
  // going in to the zebra it crosses coming out: [{enter, exit}]. It goes onto one only
  // with room to stand beyond it: never stops on a zebra or in the box.
  function keepClearOf(path) {
    let merged = keepCache.get(path);
    if (merged) return merged;
    const zones = [], P = path.points, L = path.lengths;
    for (let i = 1; i < P.length && signalled.length; i++) {
      const a = P[i - 1], b = P[i], len = L[i] - L[i - 1];
      if (len < 1e-6) continue;
      const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
      for (const J of signalled) {
        if (Math.max(a.x, b.x) < J.x - J.hx - 6 || Math.min(a.x, b.x) > J.x + J.hx + 6 || Math.max(a.z, b.z) < J.z - J.hz - 6 || Math.min(a.z, b.z) > J.z + J.hz + 6) continue;
        for (const Z of J.walks) {
          if ((Z.along === 'z' && Math.abs(ux) < 0.6) || (Z.along === 'x' && Math.abs(uz) < 0.6)) continue;
          const t = clipSegment(a, b, Z.x0, Z.x1, Z.z0, Z.z1);
          if (t) zones.push({ enter: L[i - 1] + t[0] * len, exit: L[i - 1] + t[1] * len });
        }
      }
    }
    zones.sort((p, q) => p.enter - q.enter);
    merged = [];
    for (const z of zones) {
      const last = merged[merged.length - 1];
      if (last && z.enter - last.exit < 2) last.exit = Math.max(last.exit, z.exit);
      else merged.push({ enter: z.enter, exit: z.exit });
    }
    keepCache.set(path, merged);
    return merged;
  }
  function nextWalk(A) {
    const ws = walksOf(A.path);
    for (let i = 0; i < ws.length; i++) if (ws[i].exit > A.s) return ws[i];
    return null;
  }
  // The next junction on A's path that A has not wholly left, in A's own distances.
  function nextCrossing(A) {
    const cs = crossingsOf(A.path), total = A.path.total, base = A.path.loop ? Math.floor(A.s / total) * total : 0;
    for (let lap = 0; lap < (A.path.loop ? 2 : 1); lap++) {
      const off = base + lap * total;
      for (let i = 0; i < cs.length; i++) {
        if (cs[i].exit + off > A.s - A.hl) { crossingAt.j = cs[i].j; crossingAt.enter = cs[i].enter + off; crossingAt.exit = cs[i].exit + off; return crossingAt; }
      }
    }
    return null;
  }
  // Does anyone holding J sweep through the box where A would? Two in the same lane
  // going the same way just queue; their shared approach is not a clash.
  // The vehicle let into J whose way through crosses A's, or null.
  function heldBy(J, A, at) {
    const entryA = pointAt(A.path, at.enter, p1), exitA = pointAt(A.path, at.exit, p2);
    let nMine = -1;
    for (const [id, h] of J.holders) {
      const B = agents.get(id);
      if (!B || B === A) continue;
      const entryB = pointAt(B.path, h.enter, p3), exitB = pointAt(B.path, h.exit, p4);
      const sameIn = entryA.ux * entryB.ux + entryA.uz * entryB.uz > 0.9 && Math.abs(-(entryB.x - entryA.x) * entryA.uz + (entryB.z - entryA.z) * entryA.ux) < 1.2;
      const sameOut = exitA.ux * exitB.ux + exitA.uz * exitB.uz > 0.9 && Math.abs(-(exitB.x - exitA.x) * exitA.uz + (exitB.z - exitA.z) * exitA.ux) < 1.2;
      if (sameIn && sameOut) continue;
      // Side by side the same way in lanes with the bodies clear (a scooter by the kerb, a car
      // by it) is no clash, however long they run on together.
      if (Math.abs(-(entryB.x - entryA.x) * entryA.uz + (entryB.z - entryA.z) * entryA.ux) >= A.hw + B.hw - 0.3 && entryA.ux * entryB.ux + entryA.uz * entryB.uz > 0.9 &&
          exitA.ux * exitB.ux + exitA.uz * exitB.uz > 0.9 && Math.abs(-(exitB.x - exitA.x) * exitA.uz + (exitB.z - exitA.z) * exitA.ux) >= A.hw + B.hw - 0.3) continue;
      if (nMine < 0) nMine = sweepInto(A.path, at.enter - A.hl, at.exit + A.hl, bufMine);
      const startB = Math.max(B.s - B.hl, h.enter - B.hl), nTheirs = sweepInto(B.path, startB, h.exit + B.hl, bufTheirs);
      const skipMine = sameIn ? Math.round(A.hl + 3) : 0, skipTheirs = sameIn ? Math.round(Math.max(0, h.enter + 3 - startB)) : 0;
      const reach = A.hw + B.hw + 0.05, r2 = reach * reach;
      for (let i = skipMine; i < nMine; i++) {
        const mx = bufMine[i * 4], mz = bufMine[i * 4 + 1];
        for (let k = skipTheirs; k < nTheirs; k++) {
          const dx = mx - bufTheirs[k * 4], dz = mz - bufTheirs[k * 4 + 1];
          if (dx < reach && dx > -reach && dz < reach && dz > -reach && dx * dx + dz * dz < r2) return B;
        }
      }
    }
    return null;
  }
  // Room for A beyond `sExit`: nothing standing or crawling within a vehicle length of it
  // (a queue that is barely moving soon stops and would leave A in the box). `slow`:
  // below this share of its free speed a vehicle counts as part of a queue.
  function roomPast(A, sExit, extra, slow) {
    const out = pointAt(A.path, sExit, p3), need = 2 * A.hl + 2 + extra;
    grid.gather(out.x - need - 6, out.z - need - 6, out.x + need + 6, out.z + need + 6, nearRoom);
    for (const B of nearRoom) {
      if (B === A || B.kind !== 'veh' || B.v > (B.vfree || 6 * pace) * slow) continue;
      if (B.ux * out.ux + B.uz * out.uz < 0.7) continue;
      const dx = B.x - out.x, dz = B.z - out.z, along = dx * out.ux + dz * out.uz, lat = -dx * out.uz + dz * out.ux;
      if (Math.abs(lat) < A.hw + B.hw + 0.1 && along - B.hl < need && along + B.hl > -1) return false;
    }
    return true;
  }
  // Is the way along A's path from `from` to `to` clear of vehicles standing there (or
  // pulling up to stand), or turning across it slowly? A queue still moving along the
  // same way is no obstacle: following it on keeps the junction flowing.
  function wayClear(A, from, to) {
    const n = sweepInto(A.path, from, to, bufMine);
    if (!n) return true;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = bufMine[i * 4], z = bufMine[i * 4 + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    grid.gather(x0 - 8, z0 - 8, x1 + 8, z1 + 8, nearWay);
    for (const B of nearWay) {
      if (B === A || B.kind !== 'veh' || B.reserve) continue;
      const free = B.vfree || 6 * pace;
      for (let i = 0; i < n; i++) {
        const px = bufMine[i * 4], pz = bufMine[i * 4 + 1], pux = bufMine[i * 4 + 2], puz = bufMine[i * 4 + 3];
        const dx = B.x - px, dz = B.z - pz, cu = Math.abs(B.ux * pux + B.uz * puz), cn = Math.abs(B.ux * puz - B.uz * pux);
        // (Side by side with the bodies not touching is clear: the scooter lane by the car lane.)
        if (Math.abs(dx * pux + dz * puz) > B.hl * cu + B.hw * cn + 0.5 || Math.abs(-dx * puz + dz * pux) > B.hl * cn + B.hw * cu + A.hw - 0.05) continue;
        // (Not one about to pull up just ahead: a bus at its stop, a car at the kerb.)
        const pulling = Math.min(B.target, B.drive ? B.drive.end : Infinity) - B.s < 2 * (A.hl + B.hl) + 10;
        const along = B.ux * pux + B.uz * puz > 0.9;
        if (!pulling && (along ? B.v > free * 0.15 : B.v > free * 0.5)) break;
        return false;
      }
    }
    return true;
  }
  // Is any vehicle standing (any part of it) on one of J's zebras or in its box?
  function occupied(J) {
    const rx = J.hx + 12, rz = J.hz + 12;
    grid.gather(J.x - rx, J.z - rz, J.x + rx, J.z + rz, nearOcc);
    for (const A of nearOcc) {
      if (A.kind !== 'veh' || A.reserve) continue;
      const ex = A.hl * Math.abs(A.ux) + A.hw * Math.abs(A.uz), ez = A.hl * Math.abs(A.uz) + A.hw * Math.abs(A.ux);
      for (const Z of J.walks) {
        if (A.x + ex < Z.x0 + 0.2 || A.x - ex > Z.x1 - 0.2 || A.z + ez < Z.z0 + 0.2 || A.z - ez > Z.z1 - 0.2) continue;
        // Against the stripes' box along the vehicle's own length and width too.
        const cx = (Z.x0 + Z.x1) / 2 - A.x, cz = (Z.z0 + Z.z1) / 2 - A.z, hx = (Z.x1 - Z.x0) / 2, hz = (Z.z1 - Z.z0) / 2;
        if (Math.abs(cx * A.ux + cz * A.uz) < A.hl + hx * Math.abs(A.ux) + hz * Math.abs(A.uz) - 0.2 &&
            Math.abs(-cx * A.uz + cz * A.ux) < A.hw + hx * Math.abs(A.uz) + hz * Math.abs(A.ux) - 0.2) return true;
      }
    }
    return false;
  }
  // Which way a vehicle comes into a junction: along z (north-south) or along x.
  function axisOf(A, s) {
    const p = pointAt(A.path, s + 0.01, p4);
    return Math.abs(p.uz) > Math.abs(p.ux) ? 'ns' : 'ew';
  }
  function ask(A, J, at, toEntry, lead, axis) {
    let r = askPool[asking.length];
    if (!r) r = askPool[asking.length] = { A: null, j: null, enter: 0, exit: 0, axis: 'ns', toEntry: 0, lead: null };
    r.A = A; r.j = J; r.enter = at.enter; r.exit = at.exit; r.axis = axis; r.toEntry = toEntry; r.lead = lead;
    asking.push(r);
  }
  const byUrgency = (p, q) => (q.A.wait - p.A.wait) || (p.toEntry - q.toEntry);

  function manageJunctions() {
    // Who called at, or is still on, each zebra in the last step.
    for (const J of signalled) { J.pedCall = J.pedNext; J.crossing = J.crossingNext; J.pedNext = 0; J.crossingNext = 0; }
    for (const J of junctions) {
      for (const [id, h] of J.holders) {
        const A = agents.get(id);
        if (!A || A.kind !== 'veh' || A.s - A.hl > h.exit + 0.05) J.holders.delete(id);
        // Let in but stuck short of the box: hand the slot back rather than hold up the crossing traffic.
        else if (A.s + A.hl < h.enter && A.v < 0.05 * pace && A.wait > 1.5 / pace) J.holders.delete(id);
        // Let in at lights no longer green for it, and still able to stop at the line: it stops.
        else if (J.signal && !(J.phase === h.axis && J.stage === 'green') && h.enter - J.stopBack - 0.3 - A.hl - A.s > A.v * A.v / (2 * brake) + 0.2) J.holders.delete(id);
      }
      J.comingNs = J.comingEw = J.waitNs = J.waitEw = 0;
    }
    asking.length = 0;
    for (let i = 0; i < list.length; i++) {
      const A = list[i];
      A.junctionStop = Infinity; A.nearJunction = false;
      if (A.kind !== 'veh') continue;
      const at = nextCrossing(A);
      if (!at || (A.drive && at.enter > A.drive.end)) continue;
      const J = at.j, toEntry = at.enter - (A.s + A.hl), back = J.signal ? J.stopBack : 0;
      const held = J.holders.has(A.id);
      if (J.signal && toEntry > 0 && toEntry < SIGNAL.approach && !held) { if (axisOf(A, at.enter) === 'ns') J.comingNs++; else J.comingEw++; }
      A.nearJunction = toEntry < A.look + 4 + back;
      if (held) continue;
      if (toEntry <= 0.05) { J.holders.set(A.id, { enter: at.enter, exit: at.exit, axis: axisOf(A, at.enter) }); continue; }
      // The first in line asks; at lights the one close behind asks as well, to be let
      // through on the heels of the one in front or told to stop at the line in good time.
      const lead = A.leadGap < toEntry && A.leadGap > -1 ? agents.get(A.leadId) || null : null;   // (not one overlapping it: each would wait on the other)
      if (toEntry > A.look + 3 + back || (A.leadGap < toEntry && !(J.signal && lead))) continue;
      ask(A, J, at, toEntry, lead, axisOf(A, at.enter));
    }
    for (const r of asking) {
      const w = r.A.wait + 0.01;
      if (r.axis === 'ns') r.j.waitNs = Math.max(r.j.waitNs, w); else r.j.waitEw = Math.max(r.j.waitEw, w);
    }
    for (const J of junctions) { if (J.signal) stepSignal(J, clock, occupied); else stepUnsignalled(J, clock, pace); }
    // Longest waiting first, then nearest: nobody is passed over for ever.
    if (asking.length > 1) asking.sort(byUrgency);
    for (const r of asking) {
      const J = r.j, A = r.A;
      let green, stop = r.enter - A.hl - 0.6, clearing = false;
      if (J.signal) {
        // On amber, only someone too close to stop at the line carries on.
        const line = r.enter - J.stopBack - 0.3 - A.hl;
        green = r.axis === J.phase && (J.stage === 'green' || (J.stage === 'amber' && line - A.s < A.v * A.v / (2 * brake) + 0.2));
        // Already over the line: waits short of the zebra, or if on it, at the box.
        if (A.s <= line + 0.05) stop = line;
        else if (A.s + A.hl < r.enter - J.zebraOut - 0.1) stop = r.enter - J.zebraOut - 0.3 - A.hl;
        // Caught on the zebra by the change of lights: on into the box when its way through is
        // clear, rather than stand on the crossing through the people's phase.
        else if (!green && J.stage !== 'walk' && J.stage !== 'flash') { green = true; clearing = true; }
      } else green = r.axis === J.phase && (!J.clearing || A.wait > 1 / pace);
      if (r.lead && !J.holders.has(r.lead.id)) green = false;     // the one in front waits: so does it
      let why = !green ? (r.lead && !J.holders.has(r.lead.id) ? 'lead' : 'phase') : null;
      // After long enough held back by crossing traffic or lack of room beyond, in it goes (the lights
      // have said so): nobody waits for ever on a clash that never clears.
      // (Only a clash that stands still: one still driving through clears by itself.)
      const clash = green ? heldBy(J, A, r) : null;
      if (clash) { if (!clearing && A.wait > PATIENCE && (clash.v < 0.15 * pace || A.wait > 2 * PATIENCE)) slipOnce(A); else { green = false; why = 'crossing'; } }
      if (green && !roomPast(A, r.exit, J.signal ? J.stopBack : 0, 0.5)) { if (!clearing && A.wait > PATIENCE * 1.5) slipOnce(A); else { green = false; why = 'room'; } }
      if (green) J.holders.set(A.id, { enter: r.enter, exit: r.exit, axis: r.axis });
      else { A.junctionStop = stop; A.holdWhy = why; A.holdAt = J; }
    }
  }

  // ------------------------------------------------------------------ one mover
  const goingIn = X => X.path.total - X.s < 4, comingOut = X => X.s < 4 && X.path.total - X.s > 4;

  function decide(A, dt) {
    A.next = A.s; A.nextLat = A.lat; A.nextV = 0; A.blocker = null;
    if (dt <= 0) return;
    if (A.jumps && jumpStep(A, dt)) return;
    const room = A.target - A.s, onFoot = A.kind === 'ped';
    const n = piecesAhead(A.path, A.s, A.look + A.hl, pieces);
    // A vehicle pulling up at the very end of its path (a taxi at a pick-up) still has
    // its nose out beyond it, and sees what stands there.
    if (!onFoot && n && !A.path.loop) { const tail = pieces[n - 1]; if (tail.start + tail.len > A.path.total - 1e-6) tail.len += A.hl + 2; }
    let x0 = A.x, x1 = A.x, z0 = A.z, z1 = A.z;
    for (let k = 0; k < n; k++) {
      const p = pieces[k], bx = p.ax + p.ux * p.len, bz = p.az + p.uz * p.len;
      x0 = Math.min(x0, p.ax, bx); x1 = Math.max(x1, p.ax, bx); z0 = Math.min(z0, p.az, bz); z1 = Math.max(z1, p.az, bz);
    }
    grid.gather(x0 - 7, z0 - 7, x1 + 7, z1 + 7, nearDecide);
    let limitAhead = Infinity, limitCross = Infinity, crossBlocker = null, aheadBlocker = null, pushL = 0, pushR = 0;
    let leadGap = Infinity, leadId = null, vCap = Infinity;
    const below = underground(A);
    for (let q = 0; q < nearDecide.length; q++) {
      const B = nearDecide[q];
      if (B === A) continue;
      if (!onFoot && B.ghost) continue;
      if (onFoot && B.reserve) continue;
      if (B.kind !== A.kind && underground(B) !== below) continue;
      const pr = project(A, B, n);
      if (!pr) continue;
      const rel = pr.l - A.lat, along = pr.a - A.s;
      const c = B.ux * pr.ux + B.uz * pr.uz, s = Math.abs(B.ux * pr.uz - B.uz * pr.ux), ac = Math.abs(c);
      const eAlong = ac * B.hl + s * B.hw, eLat = s * B.hl + ac * B.hw;
      if (onFoot && B.kind === 'ped') {
        // A cyclist and a walker on the same pavement simply pass (a queue at a bus stop
        // must not trap a bicycle).
        if ((A.cls === 'bicycle') !== (B.cls === 'bicycle')) continue;
        // Someone standing still just ahead (at a door, a stop, a kerb) is waited for,
        // whichever way they face; meeting head-on in a doorway, whoever is coming out
        // goes first. Two on the very same spot: the higher id counts as in front.
        const ahead = along > 0.05 || (along > -0.05 && B.id > A.id);
        const blocking = ahead && along < 1.4 + A.hl && Math.abs(rel) < (A.hw + B.hw) * 0.9;
        const waitFor = B.v < 0.1 ? !(comingOut(A) && goingIn(B)) && B.blockedBy !== A.id : c < -0.6 && goingIn(A) && comingOut(B);
        if (blocking && waitFor && !A.squeeze) {
          const hold = pr.a - eAlong - A.hl - 0.25;
          if (hold < limitAhead) { limitAhead = hold; aheadBlocker = B; }
          // Someone pausing at the door they have reached, with others waiting behind,
          // goes in now instead of holding up the queue.
          if (B.path && B.path.total - B.s < 0.05) B.queued = true;
        }
        // Walkers sidestep each other and fall in behind someone slower going the same
        // way: off their line by the room missing, only the biggest call from either
        // side counting. Level with someone met head-on, both keep right.
        const space = A.hw + B.hw + 0.3;
        if (along > -0.6 && along < 2.4 && Math.abs(rel) < space) {
          const away = rel > 0.03 ? -1 : rel < -0.03 ? 1 : c < 0 || A.id < B.id ? 1 : -1;
          const shove = LAT_PUSH * (space - Math.abs(rel)) * (1 - Math.max(0, along) / 2.4);
          if (away > 0) { if (shove > pushR) pushR = shove; } else if (shove > pushL) pushL = shove;
        }
        if (c > 0.6 && ahead && !A.squeeze && Math.abs(rel) < (A.hw + B.hw) * 0.75) {
          const queue = pr.a - eAlong - A.hl - gapFor(A, B);
          if (queue < limitAhead) { limitAhead = queue; aheadBlocker = B; }
        }
        continue;
      }
      // Side by side counts as clear when the bodies do not touch: a scooter by the kerb
      // rides past a queue of cars.
      if (Math.abs(rel) >= A.hw + eLat + (onFoot || B.kind === 'ped' ? 0.15 : 0.02)) continue;
      const gap = (pr.a - eAlong) - (A.s + A.hl);
      // A gap kept for someone pulling out is left only by those still short of it.
      if (B.reserve && gap < 0) continue;
      if (c > 0.64) {
        // Same way: only whoever is in front matters (level pegging: the higher id).
        if (along < -1e-3 || (along <= 1e-3 && B.id < A.id)) continue;
        // Each sure the other is in front (nose to nose at a slant): the lower id goes.
        if (B.blockedBy === A.id && A.id < B.id && along < A.hl + B.hl) continue;
        // A vehicle ahead that is moving needs room to stop as well: keeping clear of
        // where it could stop is enough.
        const follow = A.s + gap - gapFor(A, B) + (!onFoot && B.kind === 'veh' ? B.v * B.v * c * c / (2 * brake) : 0);
        if (B.kind === 'veh' && !B.reserve && gap < leadGap) { leadGap = gap; leadId = B.id; }
        // On the move, one that has cut in alongside and goes on at speed, or only just
        // touches alongside: brake hard, not to a dead stop, as the gap opens again.
        const grazing = gap < 0 && Math.abs(rel) > A.hw + eLat - 0.35;
        if (!onFoot && B.kind === 'veh' && follow < A.s && A.v > 0.05 * pace && (grazing || B.v * c > Math.max(0.5 * A.v, 0.5 * pace))) vCap = Math.min(vCap, Math.max(0, A.v - brake * dt));
        else if (follow < limitAhead) { limitAhead = follow; aheadBlocker = B; }
        continue;
      }
      if (along < -A.hl * 0.5) continue;                        // alongside or behind
      if (c < -0.64 && !onFoot && B.kind === 'veh') continue;   // the oncoming lane
      if (!onFoot && B.kind === 'veh' && A.nearJunction && B.nearJunction) continue;   // the junction decides
      if (givesWay(A, B, gap)) {
        const lim = A.s + gap - gapFor(A, B);
        if (lim < limitCross) { limitCross = lim; crossBlocker = B; }
      }
    }
    A.leadGap = leadGap; A.leadId = leadId;
    const stuckAfter = onFoot && crossBlocker && crossBlocker.kind === 'veh' && crossBlocker.v < 0.05 * pace ? STUCK_ON_FOOT : STUCK;
    if (A.force) limitCross = Infinity;
    // Last resort: stuck behind something that does not move for ages, a vehicle slips past it.
    if (!onFoot && A.wait > SLIP_AFTER && !A.slip) { A.slip = true; A.slipUntil = A.s + 2 * A.hl + 8; slipOnce(A); }
    if (A.slip) { if (A.s >= A.slipUntil) A.slip = false; else { limitAhead = Infinity; limitCross = Infinity; vCap = Infinity; } }
    let limit = Math.min(limitAhead, limitCross);
    // A resident's own vehicle pulls up at the kerb where they get off; anyone not let
    // into the junction ahead waits at its stop line.
    if (!onFoot && A.drive) limit = Math.min(limit, A.drive.end);
    if (!onFoot && A.junctionStop < limit) { limit = A.junctionStop; aheadBlocker = null; limitAhead = limit; }
    let heldAt = Math.min(limitAhead, limitCross);
    // Keep the zebras clear: onto the zebras (and the box between) only with room to
    // stand beyond them; otherwise wait at the line, 1.6 short of the first zebra. Having
    // waited for room it wants a little more before going, so a queue creeping on beyond
    // does not have it lurch on and off. Too close to stop, or on the zebra, it carries on.
    if (!onFoot) {
      const zones = keepClearOf(A.path), L = A.path.total, loop = !!A.path.loop;
      const lap = loop ? Math.floor(A.s / L) * L : 0;
      let kept = false;
      for (let zi = 0, count = zones.length * (loop ? 2 : 1); zi < count; zi++) {
        const zone = zones[zi % zones.length];
        const zEnter = zone.enter + lap + (zi >= zones.length ? L : 0), zExit = zEnter + zone.exit - zone.enter;
        if (zEnter < A.s + A.hl + 0.05) continue;
        const line = zEnter - 1.6 - A.hl;
        if (line - A.s > A.look + 4 || zEnter > Math.min(A.target, A.drive ? A.drive.end : Infinity) || line - A.s < A.v * A.v / (2 * brake) - 0.3) break;
        // (Following one that is moving on, it goes on behind it: only someone standing
        // short of the far side keeps it out.)
        const waited = A.keepAt === zEnter, held = heldAt === limitAhead ? aheadBlocker : crossBlocker;
        const flowing = held && held.kind === 'veh' && held.v > (held.vfree || 6 * pace) * 0.15;
        if ((!flowing && heldAt - A.hl < zExit + 0.3 + (waited ? 1 : 0)) || !wayClear(A, zEnter - 0.5, zExit + 2 * A.hl + 1 + (waited ? 2 : 0))) {
          kept = true; A.keepAt = zEnter;
          if (line < limit) { limit = Math.max(A.s, line); limitAhead = Math.min(limitAhead, limit); heldAt = Math.min(heldAt, limit); }
        }
        break;
      }
      if (!kept) A.keepAt = null;
    }
    // A zebra at lights: over only in the people's phase, and once on it, across.
    let crossing = false;
    if (onFoot) {
      const walkAt = nextWalk(A);
      if (walkAt) {
        // (Off the kerb already counts as on it: they carry on across rather than stand
        // half in the road when the green man goes.)
        const kerb = walkAt.enter - 0.2 - A.hl;
        crossing = A.s > kerb + 0.05;
        if (!crossing) {
          // Round a corner on the same people's phase the second zebra may be started
          // while the green man flashes.
          const ws = walksOf(A.path), idx = ws.indexOf(walkAt), prev = idx > 0 ? ws[idx - 1] : null;
          const onward = walkAt.j.stage === 'flash' && prev && prev.j === walkAt.j && walkAt.enter - prev.exit < 8 && A.s - prev.exit < 6;
          if (walkAt.enter - A.s < 3 + A.hl && walkAt.j.stage !== 'walk' && !onward) {
            if (kerb < limit) { limit = kerb; aheadBlocker = null; limitAhead = Math.min(limitAhead, kerb); }
            walkAt.j.pedNext = Math.max(walkAt.j.pedNext, A.wait + 0.01);
          }
        } else walkAt.j.crossingNext++;
      }
    }
    // On a zebra people step out briskly, catching up the time they waited at the kerb.
    const free = A.vfree * (crossing ? 1.5 : 1);
    // A vehicle closing in on where its timetable has got to slows to the timetable's
    // pace as it does, not all at once.
    const want = room <= 0 ? 0 : onFoot ? Math.min(free, room / dt) : Math.min(free, A.targetV + Math.sqrt(2 * brake * room));
    let v;
    if (onFoot) v = Math.min(want, Math.max(0, (limit - A.s) / dt));
    else {
      // Brakes for whatever is ahead and to pull up where it is due to stop: no faster
      // than it can go and still, braking evenly step by step, come to rest right there.
      const bdt = brake * dt, stopping = bdt * (Math.sqrt(0.25 + 2 * Math.max(0, Math.min(limit, A.target) - A.s) / (bdt * dt)) - 0.5);
      v = Math.min(want, stopping, vCap, A.v + A.accel * dt);
      // Standing, it moves off once the one in front is moving off, or into a proper gap,
      // and only once the way has stayed open a moment (open one step and shut the next
      // would have it lurch to and fro).
      if (A.v < 0.05 * pace) {
        const going = aheadBlocker && aheadBlocker.kind === 'veh' && aheadBlocker.v > 0.3 * pace;
        const shut = vCap < Infinity || (!going && heldAt - A.s < (A.hw < 1 ? 0.4 : 0.8) && heldAt < Math.min(limit, A.target) + 0.01 && heldAt < (A.drive ? A.drive.end : Infinity));
        if (shut || A.openSince === null) A.openSince = shut ? null : clock;
        if (shut || clock - A.openSince < SETTLE) v = 0;
      } else A.openSince = null;
    }
    const next = Math.max(A.s, Math.min(A.s + Math.max(0, v) * dt, A.target, limit));
    A.next = next; A.nextV = (next - A.s) / dt;
    A.blocker = limit < A.target && next - A.s < want * dt * 0.5 ? (limitCross <= limitAhead ? crossBlocker : AHEAD) : null;
    A.blockedBy = A.blocker ? (A.blocker === AHEAD ? (aheadBlocker ? aheadBlocker.id : null) : A.blocker.id) : null;
    A.yieldTo = crossBlocker && limitCross <= limitAhead && limitCross < A.target ? crossBlocker.id : null;
    // Waiting with somewhere to be: after a while someone held to give way goes anyway,
    // until well past the spot, so no knot of give-ways can lock the town.
    if (A.force && A.s >= A.forceUntil) A.force = false;
    if (A.blocker && room > 0.3) {
      A.wait += dt;
      if (A.wait > stuckAfter && A.blocker !== AHEAD && !A.force) { A.force = true; A.forceUntil = A.s + 2 * A.hl + 4; A.yieldTo = null; }
      // A walker stuck behind someone who is not moving either squeezes past them.
      if (onFoot && A.blocker === AHEAD && aheadBlocker && aheadBlocker.kind === 'ped' && aheadBlocker.v < 0.1 && A.wait > STUCK_ON_FOOT / 2 && !A.squeeze) {
        A.squeeze = true; A.squeezeUntil = A.s + 1.5;
      }
    } else { A.wait = 0; A.slipped = false; }
    if (A.squeeze && A.s >= Math.min(A.squeezeUntil, A.path.total - 0.05)) A.squeeze = false;
    if (onFoot) A.nextLat = slide(A, pushR - pushL, pushR > 0 || pushL > 0, dt);
  }

  // A walker's sideways line: their own lane on the pavement, nudged away from other
  // walkers, and round any post, tree or bench in the next few steps.
  function slide(A, push, crowded, dt) {
    // Single file through a doorway, a gate or onto a vehicle: the own lane narrows to
    // a keep-right line half a step off centre over the last few steps before one (so
    // someone coming out and someone going in pass). Stepping off a bus is open kerb.
    const d = A.drive;
    let end = A.openStart ? A.path.total - A.s : Math.min(A.s, A.path.total - A.s);
    if (d) end = Math.min(end, Math.abs(d.walkEnd - A.s), Math.abs(A.s - d.walkStart));
    // A compound's gate is wide: people pass it side by side, each on a line of their own
    // across it (spreading out a few steps before it), rather than queue on its middle in a
    // heap. Only where the gate is the end in question: by a vehicle they keep single file.
    const doors = A.path.doors;
    const toGate = Math.min(doors && doors[1] && doors[1].gate ? A.path.total - A.s : Infinity, doors && doors[0] && doors[0].gate && !A.openStart ? A.s : Infinity);
    const gate = toGate < GATE_SPREAD && toGate <= end + 1e-6;
    const taper = clamp((end - 0.4) / (gate ? GATE_SPREAD : 2.5), 0, 1);
    let room = roomAt ? roomAt(A.px, A.pz) : A.room;
    if (!(room >= 0)) room = A.room;
    if (gate && A.gateLine === undefined) A.gateLine = (hash(A.id + ':gate') / 4294967296 - 0.5) * GATE_LINES;
    if (gate) room = Math.max(room, GATE_LINES / 2);
    let want = clamp(A.lat0 * taper + (gate ? A.gateLine : 0.5) * (1 - taper) + push, -room, room);
    if (staticList.length) {
      statics.gather(A.px - 4, A.pz - 4, A.px + 4, A.pz + 4, nearStatic);
      staticStamp++;
      dodgeList.length = 0;
      const axialX = Math.abs(A.ux) > 0.92, axial = axialX || Math.abs(A.uz) > 0.92;
      for (const o of nearStatic) {
        if (o.mark === staticStamp) continue;
        o.mark = staticStamp;
        const dx = o.x - A.px, dz = o.z - A.pz;
        const along = dx * A.ux + dz * A.uz, lat = -dx * A.uz + dz * A.ux;
        const eAlong = axial ? (axialX ? o.w : o.d) / 2 : o.r;
        const eLat = axial ? (axialX ? o.d : o.w) / 2 : o.r;
        if (along + eAlong < -0.3 || along - eAlong > 2.8) continue;
        let r = dodgePool[dodgeList.length];
        if (!r) r = dodgePool[dodgeList.length] = { o: null, along: 0, lo: 0, hi: 0 };
        r.o = o; r.along = along; r.lo = lat - eLat - A.hw - 0.12; r.hi = lat + eLat + A.hw + 0.12;
        // (Insertion by distance ahead: there are only ever a few.)
        let k = dodgeList.length;
        dodgeList.push(r);
        while (k > 0 && dodgeList[k - 1].along > r.along) { dodgeList[k] = dodgeList[k - 1]; k--; }
        dodgeList[k] = r;
      }
      // Round each post by the nearer side, and once a side is picked keep to it until
      // past (a walker nudged to and fro by others would otherwise swap sides).
      let kept = false;
      for (let pass = 0; pass < 2; pass++) {
        for (const r of dodgeList) {
          if (r.o === A.dodge) kept = true;
          if (want <= r.lo || want >= r.hi) continue;
          const okLeft = r.lo >= -room - 0.5, okRight = r.hi <= room + 0.5, spill = 1.5;   // (none with room: step off the pavement edge rather than through it)
          const goLeft = r.o === A.dodge ? A.dodgeLeft : A.lat - r.lo <= r.hi - A.lat;   // (the side they are on now: pushed across a bench they would walk through it)
          if (okLeft && (!okRight || goLeft)) want = r.lo;
          else if (okRight) want = r.hi;
          else {
            const dl = -room - 0.5 - r.lo, dr = r.hi - room - 0.5;
            if (Math.min(dl, dr) > spill) continue;
            want = dl <= dr ? r.lo : r.hi;
          }
          A.dodge = r.o; A.dodgeLeft = want === r.lo; kept = true;
        }
      }
      if (!kept) A.dodge = null;
    }
    const stepMaxLat = LAT_RATE * dt, share = crowded ? Math.min(LAT_SHARE, 1 - Math.exp(-dt / LAT_EASE)) : 1 - Math.exp(-dt / DODGE_EASE);
    return A.lat + clamp((want - A.lat) * share, -stepMaxLat, stepMaxLat);
  }

  // Straight after a jump in time everyone stands where their timetable says, and
  // people who left together stand on top of each other. Each one that overlaps the
  // one in front steps back along its own path until there is a proper gap.
  function decompress() {
    for (let round = 0; round < 10; round++) {
      rebuildGrid();
      let moved = 0;
      for (const A of list) {
        const n = piecesAhead(A.path, A.s, A.hl * 2 + 3, pieces);
        let back = 0;
        grid.gather(A.x - 12, A.z - 12, A.x + 12, A.z + 12, nearDecide);
        for (const B of nearDecide) {
          if (B === A || B.reserve || (A.kind === 'veh') !== (B.kind === 'veh') || (A.cls === 'bicycle') !== (B.cls === 'bicycle')) continue;
          if (A.kind === 'veh' && underground(A) !== underground(B)) continue;
          const pr = project(A, B, n);
          if (!pr) continue;
          const c = B.ux * pr.ux + B.uz * pr.uz, along = pr.a - A.s;
          if (c < 0.64 || along < -1e-3 || (along <= 1e-3 && B.id < A.id)) continue;
          const sn = Math.abs(B.ux * pr.uz - B.uz * pr.ux), eLat = sn * B.hl + c * B.hw;
          if (Math.abs(pr.l - A.lat) >= A.hw + eLat + 0.02) continue;
          const gap = (pr.a - (c * B.hl + sn * B.hw)) - (A.s + A.hl), need = gapFor(A, B);
          if (gap < need) back = Math.max(back, need - gap);
        }
        if (back <= 0) continue;
        const floor = A.drive && A.kind === 'veh' ? A.drive.start : A.path.loop ? -Infinity : 0;
        const next = Math.max(floor, A.s - back);
        if (next < A.s - 1e-3) { A.s = next; moved++; shape(A); place(A); }
      }
      if (!moved) break;
    }
  }

  function advance(dt) {
    clock += dt;
    rebuildGrid();
    manageJunctions();
    boarded.length = 0;
    for (let i = 0; i < list.length; i++) { list[i].jumped = false; decide(list[i], dt); }
    const ease = 1 - Math.exp(-dt / LAT_EASE);
    for (let i = 0; i < list.length; i++) {
      const st = list[i];
      if (st.jumped) { st.s = st.next; st.v = 0; st.latV = 0; if (st.drive) st.lat = 0; }
      else {
        // `latV`: how fast they are stepping sideways, evened out over a few steps.
        st.latV += ((st.nextLat - st.lat) / dt - st.latV) * ease;
        st.s = st.next; st.v = st.nextV; st.lat = st.nextLat;
      }
      shape(st);
      place(st);
    }
  }

  // Moves everyone to `time` (town minutes, increasing). A step back in time, or one
  // longer than MAX_GAP, starts everyone afresh from their timetable.
  function step(time, inputs) {
    let dt = lastTime === null ? 0 : time - lastTime;
    const fresh = lastTime === null || dt < 0 || dt > MAX_GAP;
    if (fresh) { reset(); dt = 0; }
    lastTime = time; clock = time - dt;
    sync(inputs, fresh, dt);
    if (fresh) decompress();
    const steps = Math.max(1, Math.ceil(dt / stepMax - 1e-9));
    for (let k = 0; k < steps && dt > 0; k++) advance(dt / steps);
    return agents;
  }
  const wouldReset = time => lastTime === null || time < lastTime || time - lastTime > MAX_GAP;

  return {
    step, reset, wouldReset, setObstacles, agents, list: () => list, junctions, junctionById,
    signalStates: out => signalStates(junctions, out), walksOf, keepClearOf, underground, occupied,
    obstacles: () => staticList, pace, brake, time: () => lastTime,
    info: () => ({ agents: agents.size, obstacles: staticList.length, time: lastTime, pace, slips })
  };
}
