// The town's week. Day 1 is a Monday. Schools, towers and the workshop shut at the
// weekend; the bank opens Saturday mornings; shops, the market, the depot, the
// hospital and the cleansing crew run every day, so their people take turns off.
// This module answers, for any resident and day: is it a working day, what did last
// night leave over (a night or evening shift running past midnight), is it their
// weekend duty, their overtime evening, their Saturday in the office.

import { hash, pick, unit } from './mix.js';
import { REST, OFFICE, BANK_SATURDAY, WEEKEND_DUTY, INSPECTIONS, MAYOR, CIRCLES, SHARE } from './rules.js';
import { dowOf, weekOf } from './places.js';
import { personalDays } from './habits.js';
import { toMinute } from './timeline.js';

const mod = (v, n) => ((v % n) + n) % n;
// Kinds that keep the hours of their workplace (shut at the weekend → off at the weekend).
const WORKPLACE_HOURS = new Set(['office', 'workshop', 'teacher', 'school-admin', 'civic', 'bank', 'mayor']);
// Kinds whose staff take turns minding their shut workplace at the weekend.
const DUTY_KINDS = new Set(['office', 'workshop', 'teacher', 'school-admin', 'civic']);
// Kinds that work even when their building is shut to the public.
const OWN_HOURS = new Set(['office-night', 'president', 'transit']);
const NOT_WORKING = new Set(['unemployed', 'retiree', 'senior', 'patient', 'stray']);

// flightDuty(r, day): an aircrew member's duty that day (src/core/world/flights.js), or null.
export function createWeek({ residents, places, flightDuty = () => null }) {
  // Days off: given in the data, fixed for the kind, rotated through a team, or the
  // workplace's own closed days.
  const restStart = new Map();
  const teams = new Map();
  for (const r of residents) {
    const policy = REST[r.kind] || (r.kind === 'office-night' ? REST.nurse : null);
    if (r.restDays || !policy || policy.fixed) continue;
    const key = [r.kind, r.work, r.shift || '', r.crew || ''].join('|');
    if (!teams.has(key)) teams.set(key, []);
    teams.get(key).push(r);
  }
  for (const [key, team] of teams) {
    const policy = REST[team[0].kind] || REST.nurse;
    team.sort((a, b) => hash(a.id + ':rest') - hash(b.id + ':rest') || (a.id < b.id ? -1 : 1));
    const offset = pick(key, policy.starts.length);
    team.forEach((r, i) => restStart.set(r.id, { start: policy.starts[(i + offset) % policy.starts.length], days: policy.days }));
  }
  const restCache = new Map();
  function restDays(r) {
    if (restCache.has(r.id)) return restCache.get(r.id);
    let days = [];
    if (r.restDays) days = r.restDays;
    else if (REST[r.kind] && REST[r.kind].fixed) days = REST[r.kind].fixed;
    else if (restStart.has(r.id)) {
      const { start, days: n } = restStart.get(r.id);
      for (let i = 0; i < n; i++) days.push((start + i) % 7);
      days.sort((a, b) => a - b);
    } else if (WORKPLACE_HOURS.has(r.kind)) {
      const open = r.work && places.site(r.work) ? places.site(r.work).open : 'daily';
      days = open === 'weekday' ? [5, 6] : open === 'sat-am' ? [6] : r.kind === 'mayor' ? [5, 6] : [];
    }
    restCache.set(r.id, days);
    return days;
  }

  // Bank staff: half of each branch on Saturday mornings, alternating by week.
  const bankRank = new Map();
  const bankTeams = new Map();
  for (const r of residents) if (r.kind === 'bank') { if (!bankTeams.has(r.work)) bankTeams.set(r.work, []); bankTeams.get(r.work).push(r); }
  for (const team of bankTeams.values()) {
    team.sort((a, b) => hash(a.id + ':saturday') - hash(b.id + ':saturday'));
    team.forEach((r, i) => bankRank.set(r.id, i));
  }
  const bankSaturday = (r, day) => {
    const n = Math.max(1, Math.round(1 / BANK_SATURDAY));
    return mod((bankRank.get(r.id) || 0) + weekOf(day), n) === 0;
  };

  // Does r do their own job on `day`? For a night shift: the shift that starts this evening.
  function worksOn(r, day) {
    const dw = dowOf(day);
    if (NOT_WORKING.has(r.kind)) return false;
    if (r.kind === 'president') return true;
    if (r.kind === 'aircrew') return !!flightDuty(r, day);
    if (r.kind === 'preschool' || r.kind === 'primary' || r.kind === 'secondary' || r.kind === 'university') return !!r.work && !places.shutOn(r.work, day);
    if (restDays(r).includes(dw)) return false;
    if (r.kind === 'bank' && dw === 5) return bankSaturday(r, day) && !places.shutOn(r.work, day);
    if (r.work && !OWN_HOURS.has(r.kind) && places.shutOn(r.work, day)) return false;
    return true;
  }

  // Which shift runs past midnight into the next day.
  function overnight(r) {
    if (r.kind === 'office-night') return 'office-night';
    if ((r.kind === 'doctor' || r.kind === 'nurse' || r.kind === 'officer' || r.kind === 'fire') && (r.shift === 'night' || r.shift === 'evening')) return r.shift;
    if (r.kind === 'sanitation' && r.shift === 'evening') return 'sanitation-evening';
    return null;
  }
  // What last night leaves over this morning: the key of a carry piece, or null.
  function carry(r, day) {
    const kind = overnight(r);
    return kind && worksOn(r, day - 1) ? kind : null;
  }

  // Weekend duty pools: per weekday-only place, its staff in hash order; then guards
  // for the malls from whoever is left.
  const duty = new Map();
  const dutyPools = new Map();
  const candidates = residents.filter(r => DUTY_KINDS.has(r.kind) && r.work && places.site(r.work) &&
    places.site(r.work).open === 'weekday' && !r.date && !r.schedule);
  const bySite = new Map();
  for (const r of candidates) { if (!bySite.has(r.work)) bySite.set(r.work, []); bySite.get(r.work).push(r); }
  const taken = new Set();
  for (const [siteId, staff] of [...bySite].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    staff.sort((a, b) => hash(a.id + ':duty') - hash(b.id + ':duty'));
    const pool = staff.slice(0, WEEKEND_DUTY.perSite);
    pool.forEach((r, i) => { duty.set(r.id, { place: siteId, half: i % 2, activity: 'duty' }); taken.add(r.id); });
    dutyPools.set(siteId, pool.map(r => r.id));
  }
  const malls = [...places.ofKind('mall'), ...places.ofKind('annex-mall')].map(s => s.id);
  if (malls.length) {
    const guards = candidates.filter(r => !taken.has(r.id))
      .sort((a, b) => (b.kind === 'workshop') - (a.kind === 'workshop') || hash(a.id + ':guard') - hash(b.id + ':guard'))
      .slice(0, WEEKEND_DUTY.mallGuards);
    guards.forEach((r, i) => {
      const place = malls[i % malls.length];
      duty.set(r.id, { place, half: Math.floor(i / malls.length) % 2, activity: 'security' });
      if (!dutyPools.has(place)) dutyPools.set(place, []);
      dutyPools.get(place).push(r.id);
    });
  }
  // Is today r's turn at weekend duty? → {place, activity} or null.
  function dutyOn(r, day) {
    const dw = dowOf(day);
    const p = duty.get(r.id);
    if (!p || dw < 5) return null;
    if (p.place === r.work && !places.shutOn(r.work, day)) return null;
    const half = mod(weekOf(day) + (dw === 5 ? 0 : 1), 2);
    return p.half === half ? p : null;
  }

  // The weekday evening a share of each tower's staff stays late, and until when.
  function overtimeEnd(r, day) {
    const dw = dowOf(day);
    if (r.kind !== 'office' || dw >= 5) return null;
    if (unit(r.id + ':overtime') >= (OFFICE.overtime[r.work] || 0)) return null;
    // The mayor's fiancée keeps the date evenings free.
    const allowed = [0, 1, 2, 3, 4].filter(x => !(r.date && MAYOR.dateDays.includes(x)));
    if (allowed[pick(r.id + ':overtime:' + weekOf(day), allowed.length)] !== dw) return null;
    const [a, b] = OFFICE.overtimeEnds.map(toMinute);
    return a + 15 * pick(r.id + ':overtime-end:' + weekOf(day), Math.floor((b - a) / 15) + 1);
  }
  // Alternate Saturdays in the office for a share of some towers' staff.
  function saturdayWork(r, day) {
    if (r.kind !== 'office' || dowOf(day) !== 5) return false;
    return unit(r.id + ':saturday') < (OFFICE.saturday[r.work] || 0) && mod(weekOf(day) + pick(r.id + ':saturday-week', 2), 2) === 0;
  }

  // The mayor's Tuesday and Thursday round: one place, in rotation by week.
  function inspection(day) {
    const i = MAYOR.inspectionDays.indexOf(dowOf(day));
    if (i < 0) return null;
    const n = weekOf(day) * MAYOR.inspectionDays.length + i;
    const sites = places.ofKind(INSPECTIONS[mod(n, INSPECTIONS.length)]);
    return sites.length ? sites[mod(n, sites.length)].id : null;
  }

  // Circles of old friends meet five afternoons a week; which five is their own.
  const circleMeets = (index, day) => !personalDays('circle:' + index, 7 - CIRCLES.daysPerWeek).includes(dowOf(day));
  // Friend groups: dinner on two Fridays in three.
  const friendsMeet = (index, day) => dowOf(day) === 4 &&
    mod(weekOf(day) + pick('friends:' + index, 3), 3) < Math.round(SHARE.friends.fridays * 3);

  // Free all day: no job, no duty, nothing left from last night, no shift tonight.
  function freeAllDay(r, day) {
    if (r.kind === 'patient' || r.kind === 'president' || r.kind === 'mayor') return false;
    return !worksOn(r, day) && !dutyOn(r, day) && !carry(r, day) && !saturdayWork(r, day);
  }

  // The key of a resident's shift in rules.SHIFTS (null for plain day jobs).
  function shiftKey(r) {
    switch (r.kind) {
      case 'doctor': case 'nurse': case 'officer': case 'fire': return r.shift;
      case 'airport': return 'airport-' + r.shift;
      case 'office-night': return 'office-night';
      case 'sanitation': return 'sanitation-' + r.shift;
      case 'market': return 'market-' + r.shift;
      case 'transit': return 'transit-' + r.crew;
      case 'shop': return unit(r.id + ':closing-shift') < SHARE.shop.closing ? 'shop-close' : 'shop-open';
      case 'stall': return 'stall';
      default: return null;
    }
  }

  return { restDays, worksOn, carry, overnight, dutyOn, dutyPools, duty, overtimeEnd, saturdayWork, bankSaturday, inspection,
    circleMeets, friendsMeet, freeAllDay, shiftKey };
}
