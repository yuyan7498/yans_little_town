// Segments and the few operations on them that every step of planning uses. A day is
// a list of segments covering [0, 1440) with no gaps: `{start, end, state, place,
// activity, party?}` plus planning flags that are stripped before a plan goes out:
//
//   fixed   the stay's hours are firm (a shift, a class): a walk before it may only
//           come earlier, a walk after it only later, and nothing inside it moves
//   min     the shortest the stay may become (default TIME.minStay)
//   lo, hi  a visit's opening hours: the stay never starts before lo or ends after hi
//   visit   a stay at a place the resident is only visiting (it may fold, move)
//   alt     other places a visit may move to when its place is full (preferred first)
//   firm    a visit that never moves or folds (the mayor's rounds)
//   keep    part of a plan shared with others: later steps leave it alone
//   loop    a walk for its own sake (from home back home): never folded away
//
// A run of consecutive `street` segments is one trip from the stay before it to the
// stay after it. Any change of place goes through a trip; the first and last
// segments of a day are never on the street.

import { TIME } from './rules.js';
import { format } from '../clock.js';

export const DAY = 1440;
export const STREET = 'street';
export const isRun = seg => seg.place === STREET;

const minuteCache = new Map();
// 'HH:MM' (or a number of minutes) → town minutes. '24:00' is 1440.
export function toMinute(t) {
  if (typeof t === 'number') return t;
  let m = minuteCache.get(t);
  if (m === undefined) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(t);
    if (!match) throw new Error(`時間格式錯誤：「${t}」，要寫成 HH:MM`);
    m = Number(match[1]) * 60 + Number(match[2]);
    minuteCache.set(t, m);
  }
  return m;
}
export const plus = (t, minutes) => toMinute(t) + minutes;
const hhmm = m => (m >= DAY ? '24:00' : format(m));

// Template rows → segments covering [from, to). A row is
// [start, end, state, placeToken, activity, options?]; rows of no length are skipped.
export function compileRows(rows, from = 0, to = DAY) {
  const segs = [];
  let at = from;
  for (const row of rows) {
    if (!row) continue;
    const [a, b, state, token, activity, options] = row;
    let start = toMinute(a);
    const end = toMinute(b);
    if (end === start) continue;
    // A row an earlier, longer trip has run into is squeezed (or dropped), never overlapped.
    if (start <= at) { if (end <= at) continue; start = at; }
    if (start !== at || end < start) throw new Error(`行程不連續：${hhmm(at)} 之後接到 ${hhmm(start)}–${hhmm(end)} ${activity}`);
    segs.push({ start, end, state, token, activity, place: null, ...options });
    at = end;
  }
  if (at !== to) throw new Error(`行程只排到 ${hhmm(at)}，應該排到 ${hhmm(to)}`);
  return segs;
}

export const cloneSegments = segs => segs.map(s => ({ ...s }));

// Index of the segment covering `minute` (the last one starting at or before it).
export function indexAt(segs, minute) {
  let lo = 0, hi = segs.length - 1;
  if (minute <= segs[0].start) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segs[mid].start <= minute) lo = mid; else hi = mid - 1;
  }
  return lo;
}

// Make a boundary fall at t; returns the index of the segment that starts there.
export function cutAt(segs, t) {
  if (t <= 0) return 0;
  if (t >= DAY) return segs.length;
  const i = indexAt(segs, t), s = segs[i];
  if (s.start === t) return i;
  segs.splice(i + 1, 0, { ...s, start: t });
  s.end = t;
  return i + 1;
}

// Put `block` (covering [a, b)) in place of whatever was there.
export function replaceSpan(segs, block) {
  const a = block[0].start, b = block[block.length - 1].end;
  const i = cutAt(segs, a), j = cutAt(segs, b);
  segs.splice(i, j - i, ...block);
}

// [i, j) index ranges of the day's trips.
export function runsOf(segs) {
  const out = [];
  for (let i = 0; i < segs.length; i++) {
    if (!isRun(segs[i])) continue;
    let j = i + 1;
    while (j < segs.length && isRun(segs[j])) j++;
    out.push([i, j]);
    i = j - 1;
  }
  return out;
}

const length = s => s.end - s.start;
// How much a stay may shrink.
export function room(s) {
  if (s.fixed || s.keep) return 0;
  const len = length(s);
  // Sleep never shrinks below about six hours (the morning half of a night counts the evening's bed time too).
  const floor = s.state === 'SLEEPING' ? Math.max(s.min ?? 0, s.start === 0 ? 270 : 360) : s.min ?? TIME.minStay;
  return Math.max(0, len - Math.min(floor, len));
}

// Move segments [i, j) rigidly by delta, the stays on either side giving or taking
// the time. Clamped so no stay shrinks below its minimum, a fixed stay never
// shrinks, and visits stay inside their hours. Returns the shift actually made.
export function shiftSpan(segs, i, j, delta) {
  if (!delta || i <= 0 || j >= segs.length) return 0;
  const prev = segs[i - 1], next = segs[j];
  if (prev.keep || next.keep) return 0;
  for (let k = i; k < j; k++) if (segs[k].keep) return 0;
  let d = delta;
  if (d < 0) {
    d = Math.max(d, -room(prev));
    if (next.lo != null) d = Math.max(d, next.lo - next.start);
    for (let k = i; k < j; k++) if (segs[k].lo != null) d = Math.max(d, segs[k].lo - segs[k].start);
    if (d > 0) d = 0;
  } else {
    d = Math.min(d, room(next));
    if (prev.hi != null) d = Math.min(d, prev.hi - prev.end);
    for (let k = i; k < j; k++) if (segs[k].hi != null) d = Math.min(d, segs[k].hi - segs[k].end);
    if (d < 0) d = 0;
  }
  if (!d) return 0;
  prev.end += d;
  for (let k = i; k < j; k++) { segs[k].start += d; segs[k].end += d; }
  next.start += d;
  return d;
}

// Move the boundary between two stays at the same place (wake-up time, end of lunch).
export function moveBoundary(segs, k, delta) {
  const a = segs[k - 1], b = segs[k];
  if (!a || !b || !delta || isRun(a) || isRun(b) || a.fixed || b.fixed || a.keep || b.keep) return 0;
  let d = delta;
  if (d < 0) { d = Math.max(d, -room(a)); if (b.lo != null) d = Math.max(d, b.lo - b.start); if (d > 0) d = 0; }
  else { d = Math.min(d, room(b)); if (a.hi != null) d = Math.min(d, a.hi - a.end); if (d < 0) d = 0; }
  a.end += d; b.start += d;
  return d;
}

// Give the trip [i, j) at least `need` minutes: leave earlier if the stay before
// allows it, else arrive later.
export function fitRun(segs, i, j, need) {
  const first = segs[i], last = segs[j - 1];
  let extra = need - (last.end - first.start);
  if (extra <= 0) return;
  const prev = segs[i - 1], next = segs[j];
  if (prev) {
    const early = Math.min(extra, room(prev));
    prev.end -= early; first.start -= early; extra -= early;
  }
  if (extra > 0 && next) {
    const late = Math.min(extra, room(next));
    next.start += late; last.end += late;
  }
}

// Make the trip [i, j) at least `need` minutes long by taking time from the stays around
// it, reaching back (or forward) over stays that can slide: a trip before a fixed start
// begins earlier, a trip after a fixed end pushes what follows later. Fixed and shared
// stays never change. Gives what it can.
function pull(segs, i, extra) {
  for (let k = i - 1; k >= 0; k--) {
    const s = segs[k];
    if (room(s) > 0) {
      let take = Math.min(extra, room(s));
      for (let m = k + 1; m < i; m++) if (segs[m].lo != null) take = Math.min(take, segs[m].start - segs[m].lo);
      if (take > 0) {
        for (let m = k + 1; m < i; m++) { segs[m].start -= take; segs[m].end -= take; }
        s.end -= take; segs[i].start -= take;
        return take;
      }
    }
    if (isRun(s) || s.fixed || s.keep) return 0;
  }
  return 0;
}
function push(segs, j, extra) {
  for (let k = j; k < segs.length; k++) {
    const s = segs[k];
    if (room(s) > 0) {
      let take = Math.min(extra, room(s));
      for (let m = j; m < k; m++) if (segs[m].hi != null) take = Math.min(take, segs[m].hi - segs[m].end);
      if (take > 0) {
        for (let m = j; m < k; m++) { segs[m].start += take; segs[m].end += take; }
        s.start += take; segs[j - 1].end += take;
        return take;
      }
    }
    if (isRun(s) || s.fixed || s.keep) return 0;
  }
  return 0;
}
export function growRun(segs, i, j, need) {
  for (let k = i; k < j; k++) if (segs[k].keep) return;
  let extra = need - (segs[j - 1].end - segs[i].start);
  if (extra <= 0) return;
  const prev = segs[i - 1], next = segs[j];
  const earlyFirst = !(prev && (prev.fixed || prev.keep) && !(next && (next.fixed || next.keep)));
  const first = earlyFirst ? () => (prev ? pull(segs, i, extra) : 0) : () => (next ? push(segs, j, extra) : 0);
  const second = earlyFirst ? () => (next ? push(segs, j, extra) : 0) : () => (prev ? pull(segs, i, extra) : 0);
  for (const step of [first, second]) {
    while (extra > 0) { const got = step(); if (!got) break; extra -= got; }
  }
}

const isHomeStay = (s, home) => s.place === home && !isRun(s);

// Fold the outing that covers `minute` back into time at home: everything between
// the home stays either side of it becomes one stay at home. Leaves it alone (and
// returns false) if the outing reaches the start or end of the day.
export function foldOutingAt(segs, minute, home) {
  const k = indexAt(segs, Math.max(0, Math.min(DAY - 1, minute)));
  if (isHomeStay(segs[k], home)) return true;
  let p = k, q = k + 1;
  while (p > 0 && !isHomeStay(segs[p - 1], home)) p--;
  while (q < segs.length && !isHomeStay(segs[q], home)) q++;
  if (p === 0 || q === segs.length) return false;
  segs.splice(p, q - p, homeStay(segs[p].start, segs[q - 1].end, home));
  return true;
}

export const homeStay = (start, end, home, activity = 'leisure') =>
  ({ start, end, state: 'HOME', place: home, activity, token: 'HOME' });

// Lay `piece` over the day: it replaces what was there, and outings cut by its
// edges fold into time at home so both joins are at home.
export function overlay(segs, piece, home) {
  const a = piece[0].start, b = piece[piece.length - 1].end;
  if (b < DAY) foldOutingAt(segs, b, home);
  if (a > 0) foldOutingAt(segs, a - 1, home);
  replaceSpan(segs, piece);
}

// Take a visit out of the day: the trips either side join into one, or (if the
// visit has no trip on one side) the time is spent at home.
export function foldVisit(segs, k, home) {
  const place = segs[k].place;
  let p = k, q = k + 1;
  while (p > 0 && segs[p - 1].place === place) p--;
  while (q < segs.length && segs[q].place === place) q++;
  const before = segs[p - 1], after = segs[q];
  if (before && after && isRun(before) && isRun(after)) {
    before.end = segs[q - 1].end;
    before.loop = before.loop && after.loop;
    segs.splice(p, q - p);
  } else {
    for (let i = p; i < q; i++) Object.assign(segs[i], { place: home, state: 'HOME', activity: 'leisure', visit: false, alt: null, party: undefined });
  }
}

const sameKind = (a, b) => a.state === b.state && a.place === b.place && a.activity === b.activity && a.party === b.party &&
  !!a.fixed === !!b.fixed && !!a.keep === !!b.keep && !!a.visit === !!b.visit && !!a.loop === !!b.loop && a.firm === b.firm;

// Clean a day after edits: no empty segments, no tiny stays between two trips, no
// trips that lead back where they started (unless walked for their own sake), and
// neighbours that are the same thing merged.
export function tidy(segs) {
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let k = segs.length - 1; k >= 0; k--) if (segs[k].end <= segs[k].start) { segs.splice(k, 1); changed = true; }
    // A remnant stay squeezed between two trips: walk straight on.
    for (let k = segs.length - 2; k >= 1; k--) {
      const s = segs[k];
      if (isRun(s) || length(s) >= TIME.remnant || !isRun(segs[k - 1]) || !isRun(segs[k + 1])) continue;
      segs[k - 1].end = s.end;
      segs.splice(k, 1);
      changed = true;
    }
    // A remnant stay next to a stay at the same place: let the neighbour take it.
    for (let k = segs.length - 1; k >= 0; k--) {
      const s = segs[k];
      if (isRun(s) || length(s) >= TIME.remnant || segs.length < 2) continue;
      const prev = segs[k - 1], next = segs[k + 1];
      if (prev && !isRun(prev) && prev.place === s.place) { prev.end = s.end; segs.splice(k, 1); changed = true; }
      else if (next && !isRun(next) && next.place === s.place) { next.start = s.start; segs.splice(k, 1); changed = true; }
    }
    // Trips from a place back to the same place, not walked for their own sake.
    for (const [i, j] of runsOf(segs).reverse()) {
      const prev = segs[i - 1], next = segs[j];
      if (!prev || !next || prev.place !== next.place) continue;
      let loop = false;
      for (let k = i; k < j; k++) if (segs[k].loop) loop = true;
      if (loop) continue;
      const end = segs[j - 1].end;
      if (prev.state === 'SLEEPING' && next.state !== 'SLEEPING') next.start = segs[i].start; else prev.end = end;
      segs.splice(i, j - i);
      changed = true;
    }
    for (let k = segs.length - 1; k >= 1; k--) {
      if (!sameKind(segs[k - 1], segs[k])) continue;
      segs[k - 1].end = segs[k].end;
      segs.splice(k, 1);
      changed = true;
    }
    if (!changed) break;
  }
  return segs;
}

// The place someone is at (or heading to) at `minute`.
export function placeAt(segs, minute) {
  let k = indexAt(segs, minute);
  while (k < segs.length && isRun(segs[k])) k++;
  return k < segs.length ? segs[k].place : segs[segs.length - 1].place;
}
// The place someone comes from at `minute` (the stay before a trip).
export function placeBefore(segs, minute) {
  let k = indexAt(segs, minute);
  while (k > 0 && isRun(segs[k])) k--;
  return segs[k].place;
}
