// A check that nothing gets stuck: runs a fresh copy of the street over a stretch of time
// and watches every vehicle that wants to move (it is behind its timetable) but stands still.
//   stuck      episodes of standing more than `limit` town minutes (default 2) that no red
//              light explains: how many, the longest, by cause of the root of the queue
//   cycles     vehicles waiting on each other in a ring
//   jam        most vehicles stuck at once
//   slips      how many times the runtime let a long-stuck vehicle slip past (info().slips)

import { SECONDS_PER_MINUTE, MINUTES_PER_DAY } from '../clock.js';

const LIGHT_CYCLE = 25;   // town minutes: longer than any full round of the lights

export function runStuck(make, { day = 1, from = 330, to = 1440, step = 0.2, limit = 2, report = 12 } = {}) {
  const sim = make(), traffic = sim.traffic, base = (day - 1) * MINUTES_PER_DAY;
  const since = new Map(), flagged = new Map(), all = [];
  const out = { from, to, step, frames: 0, episodes: 0, longest: 0, vehicleMinutes: 0, byCause: {}, byCls: {}, cycles: 0, jam: 0, samples: [], cycleSamples: [], series: [] };
  const signalled = traffic.junctions.filter(J => J.signal);
  const redAhead = A => {
    for (const J of signalled) {
      if (Math.abs(J.x - A.x) > J.hx + 40 || Math.abs(J.z - A.z) > J.hz + 40) continue;
      const dx = J.x - A.x, dz = J.z - A.z;
      if (dx * A.ux + dz * A.uz < 0) continue;
      if (J.stage !== 'green' || (J.phase !== 'ns' && J.phase !== 'ew')) return true;
      const axis = Math.abs(A.uz) > Math.abs(A.ux) ? 'ns' : 'ew';
      if (J.phase !== axis) return true;
    }
    return false;
  };
  const cause = A => {
    // Follow who holds whom to the root of the queue.
    const seen = new Set([A.id]);
    let X = A, hops = 0;
    while (X.blockedBy && hops++ < 40) {
      const B = traffic.agents.get(X.blockedBy);
      if (!B || seen.has(B.id)) return { root: B || X, why: B ? 'cycle' : 'gone' };
      seen.add(B.id); X = B;
    }
    const why = X.kind === 'ped' ? 'walker' : X.junctionStop < 1e9 ? (redAhead(X) ? 'queue-at-lights' : 'box') :
      X.s >= X.target - 1.5 ? (X.cls === 'bus' ? 'bus-dwelling' : X.cls + '-standing') : X.drive ? 'kerb' : 'unknown';
    return { root: X, why };
  };
  let stuckNow = 0;
  for (let m = from; m <= to + 1e-9; m += step) {
    sim.step((base + m) * SECONDS_PER_MINUTE);
    out.frames++;
    stuckNow = 0;
    const live = new Set();
    for (const A of traffic.list()) {
      if (A.kind !== 'veh' || A.reserve || A.ghost) continue;
      live.add(A.id);
      const wants = A.target - A.s > 1.5 && !(A.drive && A.s >= A.drive.end - 1);
      if (!wants || A.v > 0.05 * traffic.pace) { since.delete(A.id); flagged.delete(A.id); continue; }
      let ep = since.get(A.id);
      if (!ep) since.set(A.id, ep = { t: m, red: false, cause: null });
      const waited = m - ep.t;
      // Part of the stand at a red light, or in a queue at one, is no fault (a full round of
      // the lights takes a while): only a very long one is.
      const c = (waited >= limit || !ep.red) ? cause(A) : null;
      if (c && c.why === 'queue-at-lights') ep.red = true;
      if (waited < limit) continue;
      if (ep.red && waited < LIGHT_CYCLE) continue;
      let f = flagged.get(A.id);
      stuckNow++;
      if (f && f.smp) f.smp.dur = +waited.toFixed(1);
      out.vehicleMinutes += step;
      out.longest = Math.max(out.longest, waited);
      if (!f) {
        f = { cause: c.why, root: c.root.id + '/' + c.root.cls };
        flagged.set(A.id, f);
        out.episodes++;
        out.byCause[c.why] = (out.byCause[c.why] || 0) + 1;
        out.byCls[A.cls] = (out.byCls[A.cls] || 0) + 1;
        const smp = { id: A.id, cls: A.cls, m: +m.toFixed(1), x: +A.x.toFixed(1), z: +A.z.toFixed(1), cause: c.why, root: f.root, rootAt: [+c.root.x.toFixed(1), +c.root.z.toFixed(1)], rootS: +c.root.s.toFixed(1) + '/' + +c.root.target.toFixed(1), hold: c.root.holdWhy, at: c.root.holdAt && c.root.holdAt.id, holders: c.root.holdAt ? [...c.root.holdAt.holders.keys()].join(',') : '', jphase: c.root.holdAt ? c.root.holdAt.phase + '/' + c.root.holdAt.stage : '' };
        f.smp = smp; all.push(smp);
        if (c.why === 'cycle') { out.cycles++; if (out.cycleSamples.length < 6) out.cycleSamples.push({ id: A.id, m: +m.toFixed(1), x: +A.x.toFixed(1), z: +A.z.toFixed(1) }); }
      }
    }
    for (const id of since.keys()) if (!live.has(id)) { since.delete(id); flagged.delete(id); }
    out.jam = Math.max(out.jam, stuckNow);
    if (Math.abs(m / 30 - Math.round(m / 30)) < step / 60) out.series.push([Math.round(m), stuckNow, live.size]);
  }
  out.samples = (globalThis.STUCK_BY_TIME ? all.sort((p, q) => p.m - q.m) : all.sort((p, q) => (q.dur || 0) - (p.dur || 0))).slice(0, report);
  out.slips = sim.traffic.info().slips || 0;
  Object.defineProperty(out, 'sim', { value: sim });
  return out;
}
