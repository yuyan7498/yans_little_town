// Building blocks for the day templates.
//
// A template is a function (resident, day) → rows covering the whole day, 00:00 to
// 24:00 without gaps. A row is [start, end, state, place token, activity, options?]:
//
//   ['07:30', '08:00', 'COMMUTE', 'STREET', 'commute']
//   ['08:00', '12:00', 'AT_WORK', 'WORK', 'class', FIXED]
//
// Times are 'HH:MM' (or town minutes, for times worked out from data). States:
// HOME SLEEPING COMMUTE AT_WORK LEISURE MEDICAL SHOPPING DINING. Place tokens are
// listed in places.js. Activities are the keys of labels.js ACTIVITY_LABELS.
//
// The `day` object (plans.js dayContext) says what kind of day it is (dow, weekend,
// works, duty, overtimeEnd …) and carries the habit questions of habits.js
// (has, today, onDays, choose, lasting, weekly, alternate).

import { toMinute } from '../timeline.js';

// The stay's hours are firm: walks before it only come earlier, after it only later.
export const FIXED = { fixed: true };
// A visit that never moves to another place or folds (the mayor's own rounds).
export const FIRM = { firm: true };
// A walk for its own sake, from home back home.
export const LOOP = { loop: true };

export const t = toMinute;
export const add = (time, minutes) => toMinute(time) + minutes;
export const later = (...times) => Math.max(...times.map(toMinute));

// A trip on the street.
export const go = (from, to, activity = 'commute') => [from, to, 'COMMUTE', 'STREET', activity];
// A walk round the block and home again.
export const stroll = (from, to) => [from, to, 'LEISURE', 'STREET', 'stroll', LOOP];

// Out and back: leave at `leave`, there from `arrive` to `back`, home again at `home`.
export const outing = (leave, arrive, back, home, state, token, activity, options) => [
  go(leave, arrive), [arrive, back, state, token, activity, options], go(back, home)
];


// An outing as a unit other rows can be laid around: { leave, home, rows }. With a
// `party` the whole trip is shared (same minutes for everyone in it, never nudged).
export function trip({ leave, arrive, back, home, state, token, activity, options, party }) {
  const shared = party ? { party, keep: true } : undefined;
  const L = toMinute(leave), A = toMinute(arrive), B = toMinute(back), H = toMinute(home);
  return {
    leave: L, home: H, party,
    rows: [[L, A, 'COMMUTE', 'STREET', 'commute', shared], [A, B, state, token, activity, party ? { ...options, ...shared } : options],
      [B, H, 'COMMUTE', 'STREET', 'commute', shared]]
  };
}

// Mark rows as part of a shared plan.
export const shareRows = (rows, party) => rows.map(row => [row[0], row[1], row[2], row[3], row[4], { ...row[5], party, keep: true }]);

// Rows of a list restricted to [from, 24:00).
export function clip(rows, from) {
  const f = toMinute(from);
  return rows.filter(row => toMinute(row[1]) > f).map(row => (toMinute(row[0]) < f ? [f, ...row.slice(1)] : row));
}

// A day mostly at home: sleep until `wake`, meals at their usual hours, `outings`
// (descriptors from trip(), earlier ones win when two overlap) laid between, to bed
// at `bed`. A meal is [[from, to] candidate windows or one 'HH:MM' start, activity];
// it is skipped when an outing covers it (the next candidate is tried).
export function homeDay({ wake, bed = '23:00', meals = [], idle = at => (at >= 1080 ? 'tv' : 'leisure') }, outings = []) {
  // An outing that must happen (taking a child to school) moves the wake-up earlier.
  const w = Math.min(toMinute(wake), ...outings.filter(o => o && o.must).map(o => o.leave - 45));
  const items = [], taken = [];
  const free = (a, b) => taken.every(([x, y]) => b <= x || a >= y);
  for (const o of outings) {
    if (!o || o.leave < w + 10 || !free(o.leave, o.home)) continue;
    items.push(o); taken.push([o.leave, o.home]);
  }
  for (const [when, activity] of meals) {
    for (const at of [].concat(when)) {
      const a = toMinute(at);
      if (a < w || !free(a, a + 45)) continue;
      items.push({ leave: a, home: a + 45, rows: [[a, a + 45, 'DINING', 'HOME', activity]] });
      taken.push([a, a + 45]);
      break;
    }
  }
  items.sort((x, y) => x.leave - y.leave);
  const rows = [['00:00', w, 'SLEEPING', 'HOME', 'sleep']];
  let at = w;
  for (const item of items) {
    if (item.leave > at) rows.push([at, item.leave, 'HOME', 'HOME', idle(at)]);
    rows.push(...item.rows);
    at = item.home;
  }
  const b = Math.max(toMinute(bed), at + 15);
  if (b > at) rows.push([at, b, 'HOME', 'HOME', idle(at)]);
  rows.push([b, '24:00', 'SLEEPING', 'HOME', 'sleep']);
  return rows;
}

// From `from` (already home) to midnight: rest, supper at `supper` (null: ate elsewhere),
// bed at `bed`. A shared dinner out (`dinner`, a trip() descriptor) replaces supper when
// there is time to go.
export function evening(from, { supper = '19:00', bed = '23:00', after = 'tv', dinner = null, nm = null, late = null } = {}) {
  const f = toMinute(from);
  // Supper out: a shared dinner, else a night-market supper at a time of the person's own.
  const out = dinner && dinner.leave >= f + 10 ? dinner : supper !== null && nm ? nm(f) : null;
  if (out && out.leave >= f + 10) {
    const b = later(out.home + 20, bed);
    return [[f, out.leave, 'HOME', 'HOME', 'leisure'], ...out.rows, [out.home, b, 'HOME', 'HOME', after], [b, '24:00', 'SLEEPING', 'HOME', 'sleep']];
  }
  if (supper === null) {
    const b = later(f + 20, bed);
    return [[f, b, 'HOME', 'HOME', 'leisure'], [b, '24:00', 'SLEEPING', 'HOME', 'sleep']];
  }
  const s = later(f, supper), e = s + 45;
  // A late snack at the night market after supper at home.
  const snack = late ? late(e) : null;
  if (snack && snack.leave >= e + 10) {
    const b = later(snack.home + 15, bed);
    return [[f, s, 'HOME', 'HOME', 'leisure'], [s, e, 'DINING', 'HOME', 'supper'], [e, snack.leave, 'HOME', 'HOME', after], ...snack.rows,
      [snack.home, b, 'HOME', 'HOME', after], [b, '24:00', 'SLEEPING', 'HOME', 'sleep']];
  }
  const b = later(e, bed);
  return [
    [f, s, 'HOME', 'HOME', 'leisure'],
    [s, e, 'DINING', 'HOME', 'supper'],
    [e, b, 'HOME', 'HOME', after],
    [b, '24:00', 'SLEEPING', 'HOME', 'sleep']
  ];
}

// Leave work at `leave`, home 30 minutes later, then an evening at home.
export function homeFrom(leave, options) {
  const home = add(leave, 30);
  return [go(leave, home), ...evening(home, options)];
}

// Leave work at `leave` for supper at the night market, then home. Too early for the
// market (it opens at 18:00): home first, out again later.
export function nightMarketFrom(leave, { bed = '23:00', stay = 75, arriveBy = '18:20' } = {}) {
  const rows = [];
  let at = toMinute(leave), arrive = at + 30;
  const earliest = toMinute(arriveBy);
  if (arrive < earliest) {
    if (earliest - 25 - arrive >= 20) {
      rows.push(go(at, arrive), [arrive, earliest - 25, 'HOME', 'HOME', 'leisure']);
      at = earliest - 25;
    }
    arrive = earliest;
  }
  const back = arrive + stay, home = back + 30, b = later(home, bed);
  rows.push(go(at, arrive), [arrive, back, 'DINING', 'NIGHT_MARKET', 'night-snack'], go(back, home),
    [home, b, 'HOME', 'HOME', 'tv'], [b, '24:00', 'SLEEPING', 'HOME', 'sleep']);
  return rows;
}
