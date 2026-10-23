// From a template to a day. For each resident and day:
//
//   1. what kind of day it is (week.js), with the habit questions of habits.js
//   2. the shared outings of the household, circle or friends (together.js)
//   3. the template's rows for their kind of job (schedules/) → segments
//   4. places looked up for the tokens (places.js)
//   5. a few minutes of daily drift in meals and wake-up, every walk slid into its
//      own wave, walks given time enough for the distance, visits that fall outside
//      opening hours folded into time at home
//   6. once everyone has a day: crowded venues eased by sending whole parties to the
//      next place on their list (crowd.js)
//
// Retired couples keep one plan: the lower id's, copied for the other.

import { unit, pick } from './mix.js';
import { TIME, TRAVEL, FLEX_KINDS, NIGHT, ANIMAL_SPEED, SHARE } from './rules.js';
import { fillsUp } from './ride.js';
import { DAY_NAMES } from './labels.js';
import { dayType } from '../clock.js';
import { habitsOf } from './habits.js';
import { dowOf } from './places.js';
import { compileRows, cloneSegments, runsOf, isRun, shiftSpan, moveBoundary, fitRun, growRun, foldVisit, tidy, indexAt, STREET } from './timeline.js';
import { rowsFor } from './schedules/index.js';
import { evening, go, add, trip } from './schedules/rows.js';
import { toMinute } from './timeline.js';
import { settleVisits } from './crowd.js';
import { createWander } from './wander.js';

const round5 = v => Math.round(v / 5) * 5;
const ELDERS = new Set(['retiree', 'senior']);
const CACHE_DAYS = 3;

export function createPlanner({ world, places, week, together, town, byId, travel = null, flightDuty = () => null }) {
  const primarySchool = places.firstOf('primary');
  const wander = createWander({ world, places });
  const cache = new Map();
  let settled = [];

  // Retired couples who keep one plan: follower id → owner id.
  const ownerOf = new Map();
  for (const r of byId.values()) {
    const p = r.partner && byId.get(r.partner);
    if (p && ELDERS.has(r.kind) && ELDERS.has(p.kind) && p.home === r.home && r.id > p.id) ownerOf.set(r.id, p.id);
  }
  const hasFollower = new Set(ownerOf.values());

  // Minutes a street run must last: the estimator's door-to-door time (the slowest of a
  // couple who share a plan) and a little margin; without one, the fixed estimate.
  const margin = TRAVEL.margin;
  const sharer = new Map([...ownerOf].map(([f, o]) => [o, f]));
  // Animals walk at a walker's pace (the street layer's estimator is for people).
  const WALK_SPEED = 1.625;
  // Minutes a stray takes between two places: the street layer's estimate for an animal, else a pace.
  const strayLeg = (who, from, to) => {
    if (from === to) return 0;
    const m = travel ? travel(who.id, from, to) : NaN;
    return Number.isFinite(m) && m > 0 ? m : places.distance(from, to) / (ANIMAL_SPEED[who.species] || WALK_SPEED) + 3;
  };
  function need(id, from, to) {
    const who = byId.get(id);
    if (who && who.role === 'stray') return Math.max(TRAVEL.min, Math.ceil(strayLeg(who, from, to)) + 1);
    if (!travel) return places.travel(from, to);
    let m = travel(id, from, to);
    const other = sharer.get(id);
    if (other) m = Math.max(m, travel(other, from, to));
    return Number.isFinite(m) ? Math.max(TRAVEL.min, Math.ceil(m) + margin) : places.travel(from, to);
  }
  function fit(segs, id, skipParties) {
    for (const [i, j] of runsOf(segs)) {
      const from = segs[i - 1], to = segs[j];
      if (!from || !to || from.place === to.place) continue;
      if (skipParties && segs[i].party) continue;
      if (segs.slice(i, j).some(s => s.keep)) continue;     // shared walks keep the minutes they were agreed with
      (travel ? growRun : fitRun)(segs, i, j, need(id, from.place, to.place));
    }
  }

  function dayContext(r, day, ev) {
    const dow = dowOf(day);
    const habits = habitsOf(r, day, dow);
    const ctx = {
      ...habits,
      day, dow, weekend: dow >= 5, dayType: dayType(day),
      works: week.worksOn(r, day), satWork: week.saturdayWork(r, day), duty: week.dutyOn(r, day), carry: week.carry(r, day),
      overtimeEnd: week.overtimeEnd(r, day), inspection: week.inspection(day), shiftKey: week.shiftKey(r),
      schoolDay: primarySchool ? !places.shutOn(primarySchool, day) : true,
      flex: FLEX_KINDS.includes(r.kind) ? round5((unit(r.id + ':flex') * 2 - 1) * TIME.flex) : 0,
      jit: (key, amount = TIME.jitter) => round5((unit(r.id + ':' + key + ':' + day) * 2 - 1) * amount),
      firstOf: places.firstOf, helicopter: town.helicopter,
      flightDuty: r.kind === 'aircrew' ? flightDuty(r, day) : null,
      // A car's fill-up, on the driver's own days of the week, at the station nearest home.
      refuel: fillsUp(r) && !!places.firstOf('gas') && habits.onDays('refuel', SHARE.refuel.days),
      gasStation: places.venueList('GAS', r.home)[0] || null,
      // Minutes to get between two places (for the few hand-written days).
      need: (from, to, fallback = 30) => ((travel || r.role === 'stray') && from && to && from !== to ? need(r.id, from, to) : fallback),
      shared: ev.sharedFor(r), dinner: ev.dinnerFor(r), pickedUp: ev.pickedUpFor(r),
      kinder: ev.kinderFor(r), kidRun: ev.kidRunFor(r),
      // Minutes the slowest of these people needs between two places.
      needFor: (ids, from, to, fallback = 25) => (travel ? Math.max(...ids.map(id => need(id, from, to))) : fallback)
    };
    if (travel && r.date && byId.get(r.date)) {
      const o = byId.get(r.date), nm = places.firstOf('night-market');
      ctx.dateNeed = Math.max(need(r.id, r.work, nm), need(o.id, o.work, nm), need(r.id, nm, r.home), need(o.id, nm, o.home));
    }
    // A supper (or late snack) at the night market at a time of one's own.
    const nmPlace = places.firstOf('night-market');
    const grownUp = nmPlace && r.age >= 12 && !['patient', 'preschooler', 'student-p'].includes(r.role);
    ctx.nmTrip = (from, to, key, stay) => {
      const n = ctx.need(r.home, nmPlace, 25);
      const len = stay[0] + 5 * pick(r.id + ':nm-stay:' + key + ':' + day, Math.floor((stay[1] - stay[0]) / 5) + 1);
      const lo = Math.max(toMinute(from), 0), hi = Math.min(toMinute(to), 1410 - len - n);   // home before midnight
      if (lo > hi) return null;
      const arrive = lo + 5 * pick(r.id + ':nm-at:' + key + ':' + day, Math.floor((hi - lo) / 5) + 1);
      return trip({ leave: arrive - n, arrive, back: arrive + len, home: arrive + len + n, state: 'DINING', token: 'NIGHT_MARKET', activity: 'night-snack' });
    };
    const supperShare = dow === 4 ? NIGHT.supper.friday : dow >= 5 ? NIGHT.supper.weekend : NIGHT.supper.weekday;
    ctx.nmSupper = f => {
      if (!grownUp || unit(r.id + ':nm-supper:' + day) >= supperShare) return null;
      const n = ctx.need(r.home, nmPlace, 25);
      const t = ctx.nmTrip(Math.max(toMinute(NIGHT.supper.from), f + n + 10), NIGHT.supper.to, 'supper', NIGHT.supper.stay);
      return t && t.home <= 1400 ? t : null;
    };
    ctx.nmLate = f => {
      const share = dow >= 4 ? NIGHT.late.weekendShare : NIGHT.late.share;
      if (!grownUp || r.age > NIGHT.late.maxAge || unit(r.id + ':nm-late:' + day) >= share) return null;
      const n = ctx.need(r.home, nmPlace, 25);
      const t = ctx.nmTrip(Math.max(toMinute(NIGHT.late.from), f + n + 10), NIGHT.late.to, 'late', NIGHT.late.stay);
      return t && t.home <= 1425 ? t : null;
    };
    // Candidate venues for a token, nearest by travel first: [{ place, n }] (null without an estimator).
    ctx.venues = token => {
      if (!travel) return null;
      const h = r.hangout && world.site(r.hangout);
      const base = token === 'CLINIC' ? [r.clinic] : token === 'HANGOUT' ? [r.hangout] : token === 'EXERCISE'
        ? [h && ['plaza', 'park', 'sports'].includes(h.kind) ? h.id : null, ...places.venueList('OUTDOOR', r.home)] : places.venueList(token, r.home, 0);
      return [...new Set(base.filter(Boolean))].slice(0, 4).map(place => ({ place, n: need(r.id, r.home, place) })).sort((a, b) => a.n - b.n);
    };
    // For the days at home: a night-market outing (or none) for this share of people.
    ctx.nmOut = (share, key = 'rest') => (grownUp && unit(r.id + ':nm-out:' + key + ':' + day) < share
      ? ctx.nmTrip(NIGHT.supper.from, NIGHT.supper.to, key, NIGHT.supper.stay) : null);
    ctx.nmSnack = () => {
      if (!grownUp || r.age > NIGHT.late.maxAge || unit(r.id + ':nm-snack:' + day) >= (dow >= 4 ? NIGHT.late.weekendShare : NIGHT.late.share)) return null;
      const t = ctx.nmTrip(NIGHT.late.from, NIGHT.late.to, 'snack', NIGHT.late.stay);
      return t && t.home <= 1425 ? t : null;
    };
    if (r.role === 'stray') {
      // Where the nest is (the town hall's front until the street layer gives it a spot).
      const nestPos = places.position(r.home) || places.position(places.firstOf('civic')) || { x: 0, z: 0 };
      const parks = [...places.ofKind('plaza'), ...places.ofKind('park')].map(s => s.id);
      const walkMinutes = pid => Math.ceil(strayLeg(r, r.home, pid));
      ctx.parkNear = parks.slice().sort((a, b) => walkMinutes(a) - walkMinutes(b))[0];
      ctx.walkMinutes = walkMinutes;
      ctx.leg = (a, b) => strayLeg(r, a, b);
      ctx.nest = { id: r.home, pos: nestPos };
      ctx.trail = opts => wander.trail({ id: r.id, day: ctx.day, from: ctx.nest, leg: ctx.leg, ...opts });
      ctx.nightStop = d => wander.nightStop({ id: r.id, day: d, nest: r.home, nestPos, leg: ctx.leg });
    }
    ctx.evening = (from, o) => evening(from, { dinner: ctx.dinner, nm: ctx.nmSupper, late: ctx.nmLate, ...o });
    ctx.homeFrom = (leave, o) => [go(leave, add(leave, 30)), ...ctx.evening(add(leave, 30), o)];
    return ctx;
  }

  // A dog's owner takes it for a walk (20–40 minutes) from a stay at home: in the early
  // morning when there is time, and most evenings.
  const WALKS = [['am', 330, 570, 0.5, 55], ['pm', 1080, 1380, 0.85, 55]];
  function addDogWalks(segs, r, ctx) {
    for (const [key, w0, w1, share, minStay] of WALKS) {
      if (!ctx.today('dog-' + key, share)) continue;
      for (let k = 0; k < segs.length; k++) {
        const s = segs[k];
        if (s.token !== 'HOME' || s.state !== 'HOME' || s.fixed || s.keep) continue;
        const a = Math.max(s.start, w0), b = Math.min(s.end, w1);
        if (b - a < minStay) continue;
        const len = 20 + 5 * pick(r.id + ':dog-len:' + ctx.day + key, 5);
        const at = a + 5 * pick(r.id + ':dog-at:' + ctx.day + key, Math.floor((b - a - len - 10) / 5) + 1);
        const rest = { ...s, start: at + len };
        s.end = at;
        segs.splice(k + 1, 0, { start: at, end: at + len, state: 'LEISURE', token: 'STREET', activity: 'dog-walk', place: null, loop: true }, rest);
        break;
      }
    }
  }

  function buildSegments(r, ctx) {
    let segs;
    try { segs = compileRows(rowsFor(r, ctx)); }
    catch (e) { throw new Error(`${r.id} 第 ${ctx.day} 天（${DAY_NAMES[ctx.dow]}）的日程有誤：${e.message}`); }
    if (r.dog || (sharer.get(r.id) && byId.get(sharer.get(r.id)).dog)) addDogWalks(segs, r, ctx);
    for (const s of segs) places.resolve(s, r, ctx);
    // An animal at a building's front is outdoors: no opening hours apply.
    for (const s of segs) if (s.ghost) { s.shut = false; s.lo = s.hi = undefined; }
    for (let k = segs.length - 1; k >= 0; k--) {
      const s = segs[k];
      if (!s.place) Object.assign(s, { place: r.home, state: 'HOME', activity: 'leisure', visit: false, alt: null });
    }

    // Meals and wake-ups drift a little from day to day.
    for (let k = 1; k < segs.length; k++) {
      const a = segs[k - 1], b = segs[k];
      if (isRun(a) || isRun(b) || a.place !== b.place) continue;
      moveBoundary(segs, k, round5((unit(r.id + ':b' + k + ':' + ctx.day) * 2 - 1) * TIME.jitter));
    }
    // Every walk in its own wave, then long enough for the distance.
    const runs = runsOf(segs);
    for (const [i, j] of runs) shiftSpan(segs, i, j, Math.round((unit(r.id + ':wave' + i + ':' + ctx.day) * 2 - 1) * TIME.wave));
    fit(segs, r.id, false);
    // A visit outside the opening hours is time at home instead.
    for (let k = segs.length - 1; k >= 0; k--) {
      const s = segs[k];
      if (s.visit && !s.firm && (s.shut || s.start < s.lo || s.end > s.hi)) foldVisit(segs, k, r.home);
    }
    return tidy(segs);
  }

  function finalize(segs) {
    tidy(segs);
    const out = [];
    for (const s of segs) {
      const prev = out[out.length - 1];
      if (prev && prev.state === s.state && prev.place === s.place && prev.activity === s.activity && prev.party === s.party && s.start === prev.end) { prev.end = s.end; continue; }
      const o = { start: s.start, end: s.end, state: s.state, place: s.place, activity: s.activity };
      if (s.party) o.party = s.party;
      out.push(o);
    }
    return out;
  }

  function compute(day) {
    const ev = together.forDay(day);
    const built = new Map();
    // Preschoolers last: their kindergarten walk is decided by the parent who takes them.
    const ordered = [...byId.values()].sort((a, b) => (a.kind === 'preschool') - (b.kind === 'preschool'));
    for (const r of ordered) {
      if (ownerOf.has(r.id)) continue;
      const ctx = dayContext(r, day, ev);
      const segs = buildSegments(r, ctx);
      if (hasFollower.has(r.id)) {
        const party = 'couple:' + r.id;
        for (const s of segs) if (!s.party && (isRun(s) || s.place !== r.home)) s.party = party;
      }
      built.set(r.id, segs);
    }
    const items = [];
    for (const r of byId.values()) {
      const owner = ownerOf.get(r.id);
      items.push({ id: r.id, segs: owner ? cloneSegments(built.get(owner)) : built.get(r.id) });
    }
    const crowded = settleVisits(items, { places, world, day });
    const plans = new Map();
    const type = dayType(day);
    for (const { id, segs } of items) {
      // The walks to a place that changed need time for the new distance.
      fit(segs, id, true);
      plans.set(id, { owner: id, day, dayType: type, segments: finalize(segs) });
    }
    plans.crowded = crowded;
    return plans;
  }

  function plansFor(day) {
    let plans = cache.get(day);
    if (!plans) {
      plans = compute(day);
      cache.set(day, plans);
      while (cache.size > CACHE_DAYS) cache.delete(cache.keys().next().value);
    }
    return plans;
  }
  const planFor = (id, day) => plansFor(day).get(id);
  const invalidate = () => { cache.clear(); wander.invalidate(); };

  // The plan's segment at a minute.
  function segmentAt(plan, minute) {
    const segs = plan.segments;
    const index = indexAt(segs, Math.max(0, Math.min(1439, minute)));
    return { segment: segs[index], index };
  }

  return { plansFor, planFor, segmentAt, invalidate, settled, STREET };
}
