// The town's own service vehicles, which are not residents.
//   Delivery vans load at the depot, drive to three to five businesses (malls, shops in the
//   towers, the market, the hospital, school canteens, the night-market strip in the
//   afternoon), pull in at a kerb spot by each door and unload there for a few minutes
//   with their hazard lights on, come back, load again, and go round once more, on a daily
//   schedule that is the same every day of the same number.
//   Police patrol cars roam from one place in town to the next on routes that differ with
//   every leg, stopping a moment now and then.
// They go through the same physics as everyone else; legs are laid by the network
// (net.ride / net.approach), no coordinates here.

import { hash, unit } from '../random.js';
import { MINUTES_PER_DAY } from '../clock.js';

const mod = (v, n) => ((v % n) + n) % n;

// What runs, and when (town minutes of the day). Speeds are real-life units per town
// minute (x the vehicle pace).
export const SERVICE = {
  police: { count: 2, cruise: 11, kind: 'police', home: 'precinct', from: 0, to: 1440, dwell: [0.25, 1.0] },
  van: { count: 4, cruise: 9.5, kind: 'van', home: 'depot', from: 420, to: 1080, unload: [2, 5], stops: [3, 5], reload: [4, 9], leadIn: 28 }
};
const SIZE = { police: { hl: 4.3, hw: 1.7 }, van: { hl: 4.4, hw: 1.75 } };
export const SERVICE_LABEL = { police: { label: '警車', sub: '巡邏中' }, van: { label: '物流貨車', sub: '送貨中' } };
const ROUND = 62;       // nominal minutes a delivery round takes, with the loading

// Who gets deliveries: [site kind, weight, only after this minute]; the night-market strip
// is served in the afternoon.
const CUSTOMERS = [['mall', 3], ['annex-mall', 2], ['tower', 1.2], ['market', 3], ['hospital', 2], ['primary', 1], ['secondary', 1], ['university', 1], ['night-market', 3, 840]];
// Patrol points: anywhere the town gathers.
const PATROL = ['civic', 'plaza', 'station', 'mall', 'hospital', 'park', 'market', 'tower', 'secondary', 'university', 'library', 'sports', 'amusement', 'night-market', 'housing', 'bank'];

export function createService({ world, net = null, pace = 3, plan = SERVICE }) {
  const siteByKind = new Map();
  for (const s of world.siteList) {
    if (!s.door) continue;
    if (!siteByKind.has(s.kind)) siteByKind.set(s.kind, []);
    siteByKind.get(s.kind).push(s);
  }
  const homeOf = type => (siteByKind.get(plan[type].home) || [])[0] || null;
  const rideCache = new Map();
  // The drive from `base` to `site`: its leg, the lane point to stop at, and where it starts.
  function rideTo(base, site) {
    if (!net || !base || !site || base === site) return null;
    const key = base.id + '>' + site.id;
    if (rideCache.has(key)) return rideCache.get(key);
    let out = null;
    try {
      const ride = net.ride(base.id, site.id, 'service:' + key, 'car');
      if (ride && ride.legs) {
        const leg = net.subPath(ride, ride.legs.driveStart, ride.legs.driveEnd);
        const end = net.sampleAt(ride, ride.legs.driveEnd - 0.01), begin = net.sampleAt(ride, ride.legs.driveStart + 0.01);
        out = { leg, stop: { x: end.x, z: end.z, heading: end.heading }, begin: { x: begin.x, z: begin.z, heading: begin.heading }, ride, site };
      }
    } catch { out = null; }
    rideCache.set(key, out);
    return out;
  }

  const fleet = [];
  let legs = 0;
  for (const [type, cfg] of Object.entries(plan)) {
    for (let i = 0; i < cfg.count; i++) {
      const id = type + ':' + (i + 1), size = SIZE[type], cruise = cfg.cruise * pace;
      fleet.push({ id, type, kind: cfg.kind, cfg, index: i, cruise, size,
        state: 'idle', leg: null, agentId: null, onRoad: false, hazard: false, input: null,
        round: -1, day: 0, stops: [], at: 0, dwellUntil: 0, nextRound: 0, here: null, patrolN: 0, label: null });
    }
  }
  const byId = new Map(fleet.map(v => [v.id, v]));
  let agents = null, lastAbs = null, patrol = null;

  const dayOf = abs => Math.floor(abs / MINUTES_PER_DAY) + 1;
  const agentOf = v => (v.agentId && agents ? agents.get(v.agentId) || null : null);
  const stoppedAt = (st, v) => st && v.leg && st.v < 0.3 * pace && Math.abs(st.s - v.leg.total) < 0.45;
  const placeOf = v => { const st = agentOf(v); return st ? { x: st.x, z: st.z, heading: Math.atan2(st.uz, st.ux) } : v.here; };
  function setLeg(v, path, state) {
    v.onRoad = !!agentOf(v); v.leg = path; v.state = state; v.agentId = v.id + '#' + (++legs); v.input = null;
  }
  function sendTo(v, point, state) {
    const from = placeOf(v);
    if (!from || !net) return false;
    const path = net.approach(from, from.heading, point, point.heading);
    if (!path || !(path.total > 0)) return false;
    setLeg(v, path, state);
    return true;
  }
  function clear(v) {
    v.state = 'idle'; v.leg = null; v.agentId = null; v.hazard = false; v.here = null; v.onRoad = false; v.round = -1; v.day = 0; v.nextRound = 0; v.input = null;
  }

  // ---- delivery rounds, the same every day of the same number
  function weightedSites(key, minute) {
    const out = [];
    for (const [kind, w, after] of CUSTOMERS) {
      if (after && minute < after) continue;
      for (const s of siteByKind.get(kind) || []) out.push({ s, w: w * (0.7 + 0.6 * unit(key + ':w:' + s.id)) });
    }
    return out;
  }
  function planRound(v, day, k, minute) {
    const cfg = v.cfg, key = 'round:' + day + ':' + v.id + ':' + k, depot = homeOf('van');
    const n = cfg.stops[0] + hash(key + ':n') % (cfg.stops[1] - cfg.stops[0] + 1);
    const pool = weightedSites(key, minute).filter(c => rideTo(depot, c.s));
    const stops = [];
    for (let guard = 0; stops.length < n && pool.length && guard < 40; guard++) {
      const total = pool.reduce((t, c) => t + c.w, 0);
      let r = unit(key + ':pick:' + guard) * total, chosen = pool[pool.length - 1];
      for (const c of pool) { r -= c.w; if (r <= 0) { chosen = c; break; } }
      pool.splice(pool.indexOf(chosen), 1);
      stops.push({ site: chosen.s, unload: cfg.unload[0] + unit(key + ':u:' + chosen.s.id) * (cfg.unload[1] - cfg.unload[0]) });
    }
    return stops;
  }
  // When van i's k-th round of a day starts, nominally: staggered starts, rounds back to back.
  const roundStart = (v, day, k) => v.cfg.from + v.index * 22 + k * ROUND + unit('round-gap:' + day + ':' + v.id + ':' + k) * 12;
  const roundAt = (v, minute) => Math.max(0, Math.floor((minute - v.cfg.from - v.index * 22) / ROUND));

  // Out of the depot with the round's first stop (`at` > 0: after a jump in time, a moment
  // before the kerb it is bound for).
  function beginRound(v, day, k, stops, at) {
    v.round = k; v.day = day; v.stops = stops; v.at = at;
    const depot = homeOf('van'), first = rideTo(depot, stops[at].site);
    if (!first) { v.state = 'idle'; return false; }
    v.label = stops[at].site.name;
    const L = first.ride.legs;
    const path = at === 0 ? first.leg : net.subPath(first.ride, Math.max(L.driveStart, L.driveEnd - v.cfg.leadIn), L.driveEnd);
    v.here = null; setLeg(v, path, 'toStop');
    return true;
  }

  function stepVan(v, abs) {
    const day = dayOf(abs), minute = abs - (day - 1) * MINUTES_PER_DAY, st = agentOf(v);
    if (v.state === 'idle') {
      if (minute < v.cfg.from || minute >= v.cfg.to - 25) return;
      if (v.day === day && minute < v.nextRound) return;
      let k = roundAt(v, minute);
      if (v.day === day && k <= v.round) k = v.round + 1;
      if (minute < roundStart(v, day, k)) return;
      const stops = planRound(v, day, k, minute);
      if (!stops.length) return;
      beginRound(v, day, k, stops, 0);
      return;
    }
    if (v.state === 'toStop') {
      if (stoppedAt(st, v)) { v.state = 'unloading'; v.hazard = true; v.dwellUntil = abs + v.stops[v.at].unload; v.here = placeOf(v); }
      return;
    }
    if (v.state === 'unloading') {
      v.here = placeOf(v);
      if (abs < v.dwellUntil) return;
      v.hazard = false;
      v.at++;
      const depot = homeOf('van');
      if (v.at < v.stops.length) {
        const to = rideTo(depot, v.stops[v.at].site);
        v.label = v.stops[v.at].site.name;
        if (to && sendTo(v, to.stop, 'toStop')) return;
      }
      const any = v.stops.map(s => rideTo(depot, s.site)).find(Boolean);
      if (any && sendTo(v, any.begin, 'toDepot')) return;
      const keep = v.round, keepDay = v.day;
      clear(v); v.round = keep; v.day = keepDay; v.nextRound = minute + 5;
      return;
    }
    if (v.state === 'toDepot' && stoppedAt(st, v)) {
      const keep = v.round, keepDay = v.day;
      clear(v); v.round = keep; v.day = keepDay;
      v.nextRound = minute + v.cfg.reload[0] + unit('reload:' + day + ':' + v.id + ':' + keep) * (v.cfg.reload[1] - v.cfg.reload[0]);
    }
  }
  // Mid-round after a jump in time: the nominal timetable says which stop it is at.
  function jumpInto(v, abs) {
    const day = dayOf(abs), minute = abs - (day - 1) * MINUTES_PER_DAY;
    if (minute < v.cfg.from || minute >= v.cfg.to) return;
    const k = roundAt(v, minute), start = roundStart(v, day, k);
    if (minute < start) { v.round = k - 1; v.day = day; v.nextRound = start; return; }
    const stops = planRound(v, day, k, start);
    if (!stops.length) return;
    beginRound(v, day, k, stops, Math.min(stops.length - 1, Math.floor((minute - start) / 10)));
  }

  // ---- police: from one place to the next, by a different way each time
  function patrolPoints() {
    const pts = [], base = homeOf('police');
    for (const kind of PATROL) for (const s of siteByKind.get(kind) || []) { const r = rideTo(base, s); if (r) pts.push(r); }
    return pts;
  }
  function nextPatrol(v, abs) {
    if (!patrol) patrol = patrolPoints();
    if (!patrol.length) return false;
    const key = 'patrol:' + v.id + ':' + dayOf(abs) + ':' + (++v.patrolN), here = placeOf(v);
    let best = null;
    for (let g = 0; g < 6 && !best; g++) {
      const c = patrol[hash(key + ':' + g) % patrol.length];
      if (!here || Math.hypot(c.stop.x - here.x, c.stop.z - here.z) > 40) best = c;
    }
    if (!best) best = patrol[hash(key) % patrol.length];
    v.label = best.site.name;
    return sendTo(v, best.stop, 'patrol');
  }
  function stepPolice(v, abs) {
    const minute = mod(abs, MINUTES_PER_DAY), st = agentOf(v), on = minute >= v.cfg.from && minute < v.cfg.to;
    if (v.state === 'idle') {
      if (!on) return;
      if (!patrol) patrol = patrolPoints();
      if (!patrol.length) return;
      const first = patrol[hash('start:' + v.id + ':' + dayOf(abs)) % patrol.length];
      v.here = null; v.patrolN = 0; v.label = first.site.name;
      setLeg(v, first.leg, 'patrol');
      return;
    }
    if (v.state === 'patrol' && stoppedAt(st, v)) {
      v.state = 'checking'; v.here = placeOf(v);
      v.dwellUntil = abs + v.cfg.dwell[0] + unit('dwell:' + v.id + ':' + v.patrolN + ':' + dayOf(abs)) * (v.cfg.dwell[1] - v.cfg.dwell[0]);
      return;
    }
    if (v.state === 'checking') {
      v.here = placeOf(v);
      if (abs < v.dwellUntil) return;
      if (!nextPatrol(v, abs)) v.dwellUntil = abs + 1;
    }
  }

  function jumped(abs) { return lastAbs === null || abs < lastAbs || abs - lastAbs > 4; }

  // The service vehicles' inputs, appended to `out`.
  function inputs(abs, out, map) {
    agents = map || agents;
    if (jumped(abs)) {
      for (const v of fleet) clear(v);
      lastAbs = abs;
      for (const v of fleet) { if (v.type === 'van') jumpInto(v, abs); else stepPolice(v, abs); }
    }
    for (const v of fleet) {
      if (!v.leg) continue;
      let input = v.input;
      if (!input || input.id !== v.agentId) input = v.input = { id: v.agentId, group: 'service', kind: 'veh', path: v.leg, target: v.leg.total, start: 0,
        walkFree: v.cruise, rideFree: v.cruise, hl: v.size.hl, hw: v.size.hw, cls: v.kind, carryOn: v.onRoad, ref: v };
      out.push(input);
    }
    return out;
  }
  // After the physics step: who has arrived, who is done.
  function afterStep(abs, map) {
    agents = map || agents;
    lastAbs = abs;
    for (const v of fleet) { if (v.type === 'van') stepVan(v, abs); else stepPolice(v, abs); }
  }

  // What to say about a service vehicle now.
  function describe(v) {
    if (v.type === 'van') {
      if (v.state === 'unloading') return { label: '物流貨車', sub: '卸貨中・' + (v.label || '') };
      if (v.state === 'toStop') return { label: '物流貨車', sub: '送貨中・往 ' + (v.label || '') };
      if (v.state === 'toDepot') return { label: '物流貨車', sub: '送貨完畢・返回物流倉庫' };
      return { label: '物流貨車', sub: '送貨中' };
    }
    return { label: '警車', sub: v.state === 'checking' ? '路邊停留・' + (v.label || '') : v.label ? '巡邏中・往 ' + v.label : '巡邏中' };
  }
  const current = v => { const st = agentOf(v); return st ? { x: st.x, z: st.z, uz: st.uz, ux: st.ux } : null; };

  return { fleet, inputs, afterStep, byId, agentOf, describe, current,
    info: () => ({ police: fleet.filter(v => v.type === 'police').length, vans: fleet.filter(v => v.type === 'van').length,
      vansOut: fleet.filter(v => v.type === 'van' && v.leg).length, unloading: fleet.filter(v => v.state === 'unloading').length }) };
}
