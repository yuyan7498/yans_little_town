// Ordinary working days: a start, a lunch, an end, and the evening that follows.
// dayJob() is the shape most jobs share; the families below only choose its hours.

import { SHARE, OFFICE, MAYOR } from '../rules.js';
import { FIXED, t, go, add, nightMarketFrom } from './rows.js';
import { adultRestDay } from './leisure.js';
import { dateEvening, mayorWeekend } from './civic.js';
import { BELL, HANDOVER, walkToSchool, dropOffStay, pickUpStay, walkHome } from './kinder.js';

// Minutes at the pump.
export const REFUEL = 10;
// A fill-up on the way home only when it still leaves the evening at home (home by then).
const REFUEL_BY = 1260;

// o: { start, end, lunch: [from, to] | null, activity, lunchActivity, body (rows
//      replacing the work between start and end), errand, nightMarket, bed, after,
//      supper (false: ate at work), place: 'WORK' }
export function dayJob(r, day, o) {
  let start = t(o.start);
  const end = t(o.end);
  // A parent who takes the little ones to the kindergarten on the way to work (and
  // collects them on the way home) walks with them to the school gate.
  const kr = day.kidRun && !o.body && !o.place && start <= 600 ? day.kidRun : null;
  let kid = null;
  if (kr) {
    const n1 = day.needFor([r.id, ...kr.kids], r.home, kr.school), n2 = day.needFor([r.id], kr.school, r.work);
    // The children are at the gate about 07:50, or later when the way is long, so the parent need not rise before 06:30.
    const D = Math.min(520, Math.max(470, 390 + n1));
    if (D - n1 >= 360) { kid = { n1, n2, D }; start = Math.max(start, D + HANDOVER + n2); }
  }
  const leave = kid ? kid.D - kid.n1 : start - 30;
  const wake = Math.min(leave - 75, 510);
  const rows = [
    ['00:00', wake, 'SLEEPING', 'HOME', 'sleep'],
    [wake, wake + 45, 'DINING', 'HOME', 'breakfast'],
    [wake + 45, leave, 'HOME', 'HOME', 'wake'],
    ...(kid ? [walkToSchool(leave, kid.D, kr.party), dropOffStay(kid.D, kr.school, kr.party), go(kid.D + HANDOVER, start)] : [go(leave, start)])
  ];
  const place = o.place || 'WORK';
  const work = (a, b, activity) => (b > a ? [a, b, 'AT_WORK', place, activity, FIXED] : null);
  if (o.body) rows.push(...o.body);
  else if (o.lunch) {
    const [l0, l1] = o.lunch.map(t);
    if (o.errand) {
      rows.push(work(start, l0, o.activity), go(l0, l0 + 20), [l0 + 20, l0 + 45, 'SHOPPING', o.errand, 'errand'], go(l0 + 45, l0 + 65),
        work(l0 + 65, end, o.activity));
    } else {
      rows.push(work(start, l0, o.activity), [l0, l1, 'AT_WORK', place, o.lunchActivity || 'staff-lunch', FIXED], work(l1, end, o.activity));
    }
  } else rows.push(work(start, end, o.activity));
  const tail = { bed: o.bed || '23:00', after: o.after || 'tv', supper: o.supper === false ? null : '19:00' };
  if (kid) {
    // Home by way of the school gate, with the children.
    const n3 = day.needFor([r.id], r.work, kr.school), n4 = day.needFor([r.id, ...kr.kids], kr.school, r.home);
    const arrive = Math.max(end + n3, BELL + 10), depart = arrive + HANDOVER, home = depart + n4;
    rows.push(go(end, arrive), pickUpStay(arrive, depart, kr.school, kr.party), walkHome(depart, home, kr.party), ...day.evening(home, tail));
    kr.publish({ leave, dropAt: kid.D, pickDepart: depart, homeAt: home });
    return rows.filter(Boolean);
  }
  if (kr) kr.publish(null);
  if (o.nightMarket) rows.push(...nightMarketFrom(end, { bed: tail.bed }));
  else if (day.refuel && !o.place && end + day.need(r.work, day.gasStation, 20) + REFUEL + day.need(day.gasStation, r.home, 20) <= REFUEL_BY) {
    // A fill-up at the gas station on the way home.
    const n1 = day.need(r.work, day.gasStation, 20), n2 = day.need(day.gasStation, r.home, 20), out = end + n1 + REFUEL;
    rows.push(go(end, end + n1), [end + n1, out, 'SHOPPING', 'GAS', 'refuel'], go(out, out + n2), ...day.evening(out + n2, tail));
  } else rows.push(go(end, end + 30), ...day.evening(end + 30, tail));
  return rows.filter(Boolean);
}

// The lunch-hour errand (bank or town office) some people run one weekday a week.
function errandOf(day, share = OFFICE.errand) {
  return !day.weekend && day.has('errand', share) && day.onDays('errand', 1, 5) ? day.lasting('errand-place', ['BANK', 'CIVIC']) : null;
}
const nightMarketToday = (day, share = OFFICE.nightMarket, days = 2) => !day.dinner && !day.weekend && day.has('night-market', share) && day.onDays('night-market', days, 5);

// Offices: about 09:00–18:00 with lunch at work (flexible start), one weekday of
// overtime for some, alternate Saturdays for some. The mayor's fiancée keeps the date
// evenings and the weekends with the mayor.
export function office(r, day) {
  if (r.date) {
    if (day.weekend) return mayorWeekend(r, day);
    if (day.works && MAYOR.dateDays.includes(day.dow)) return dateDay(r, day);
  }
  if (!day.works && !day.satWork) return adultRestDay(r, day);
  const start = 540 + day.flex + day.jit('start');
  if (day.satWork) return dayJob(r, day, { start, end: 900, lunch: ['12:00', '12:45'], activity: 'office' });
  if (day.overtimeEnd) return dayJob(r, day, { start, end: day.overtimeEnd, lunch: ['12:00', '13:00'], activity: 'overtime', supper: true, bed: '23:30' });
  const errand = errandOf(day);
  return dayJob(r, day, { start, end: start + 540, lunch: ['12:00', '13:00'], activity: 'office', errand, nightMarket: !errand && nightMarketToday(day) });
}

// The fiancée's weekday on a date evening: office until 17:30, then supper at the
// night market with the mayor.
function dateDay(r, day) {
  const base = dayJob(r, day, { start: '09:00', end: '17:30', lunch: ['12:00', '13:00'], activity: 'office', supper: false });
  const cut = base.findIndex(row => t(row[0]) >= t('17:30'));
  return [...base.slice(0, cut), ...dateEvening(r, day)];
}

// Workshop and depot hands: 08:00–17:00 with a flexible start; a share eat out some evenings.
export function workshop(r, day) {
  if (!day.works) return adultRestDay(r, day);
  const start = 480 + day.flex + day.jit('start');
  return dayJob(r, day, { start, end: start + 540, lunch: ['12:00', '13:00'], lunchActivity: 'canteen', activity: 'labour', nightMarket: nightMarketToday(day, SHARE.worker.nightMarket, 1) });
}

// Zoo keepers: from 07:30 (the animals are fed before the gates open) to 16:30; the zoo
// opens every day, so their days off rotate.
export function zooKeeper(r, day) {
  if (!day.works) return adultRestDay(r, day);
  const start = Math.round((450 + day.flex / 2 + day.jit('start') / 3) / 5) * 5;
  return dayJob(r, day, { start, end: start + 540, lunch: ['12:00', '12:45'], lunchActivity: 'staff-lunch', activity: 'animal-care',
    nightMarket: nightMarketToday(day, SHARE.worker.nightMarket, 1) });
}

// Drivers based at the depot or the station desk: ordinary day shifts.
export function driver(r, day) {
  if (!day.works) return adultRestDay(r, day);
  const start = 480 + day.jit('start');
  return dayJob(r, day, { start, end: start + 540, lunch: ['12:00', '13:00'], activity: r.workKind === 'station' ? 'dispatch' : 'driving' });
}

// Teachers: early at school, lessons, a long lunch, marking at home in the evening.
export function teacher(r, day) {
  if (!day.works) return adultRestDay(r, day);
  const start = r.workKind === 'university' ? 540 : r.workKind === 'secondary' ? 435 : 450;
  return dayJob(r, day, { start: start + day.jit('start'), end: r.workKind === 'university' ? 1020 : 1050, lunch: ['12:00', '13:00'], activity: 'teaching', after: 'lesson-prep' });
}

export function schoolAdmin(r, day) {
  if (!day.works) return adultRestDay(r, day);
  return dayJob(r, day, { start: 480 + day.jit('start'), end: 1020 + day.jit('end'), lunch: ['12:00', '13:00'], activity: 'school-office' });
}

export function hospitalAdmin(r, day) {
  if (!day.works) return adultRestDay(r, day);
  const start = 510 + day.flex + day.jit('start');
  return dayJob(r, day, { start, end: start + 540, lunch: ['12:00', '13:00'], activity: 'hospital-office', errand: errandOf(day, 0.15) });
}

// Bank and town-office clerks (the bank is open on Saturday mornings).
export function clerk(r, day) {
  if (!day.works) return adultRestDay(r, day);
  const bank = r.kind === 'bank';
  const start = 510 + day.flex + day.jit('start');
  const saturday = day.dow === 5;
  return dayJob(r, day, { start, end: saturday ? 870 : start + 540, lunch: saturday ? null : ['12:00', '13:00'], activity: bank ? 'counter' : 'town-hall',
    nightMarket: !saturday && nightMarketToday(day, OFFICE.nightMarket, 1) });
}

// Shop staff: opening shift 09:30–18:00 or closing shift 13:30–22:00 (ate at work). What
// minding the place means depends on the place.
const SHOP_ACTIVITY = { gas: 'pump-service', cinema: 'cinema-service', temple: 'temple-service' };
export function shop(r, day) {
  if (!day.works) return adultRestDay(r, day);
  const activity = SHOP_ACTIVITY[r.workKind] || 'reception';
  if (day.shiftKey === 'shop-close') {
    const start = 810 + day.flex / 2 + day.jit('start') / 3;
    return dayJob(r, day, { start: Math.round(start / 5) * 5, end: 1320, body: null, lunch: ['18:00', '18:45'], lunchActivity: 'staff-meal', activity, supper: false, bed: '23:30' });
  }
  const start = 570 + day.flex + day.jit('start');
  return dayJob(r, day, { start, end: start + 510, lunch: ['12:30', '13:15'], lunchActivity: 'staff-meal', activity });
}

// Night-market stall holders: set up from 16:00, trade until about 23:20.
export function stall(r, day) {
  if (!day.works) return adultRestDay(r, day);
  return [
    ['00:00', '09:30', 'SLEEPING', 'HOME', 'sleep'],
    ['09:30', '10:30', 'DINING', 'HOME', 'brunch'],
    ['10:30', '14:30', 'HOME', 'HOME', 'prep'],
    ['14:30', '15:10', 'DINING', 'HOME', 'lunch-home'],
    ['15:10', '15:30', 'HOME', 'HOME', 'wake'],
    go('15:30', '16:00'),
    ['16:00', '18:00', 'AT_WORK', 'WORK', 'set-up', FIXED],
    ['18:00', '23:20', 'AT_WORK', 'WORK', 'stall', FIXED],
    go('23:20', '23:50'),
    ['23:50', '24:00', 'SLEEPING', 'HOME', 'sleep']
  ];
}
