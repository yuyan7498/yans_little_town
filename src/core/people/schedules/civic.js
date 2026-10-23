// The two people whose days are written by hand: the mayor (and the fiancée who keeps
// the mayor's evenings and weekends) and the president, who is aboard every
// helicopter sortie. Their rows are all `keep`: nothing nudges them.

import { FIXED, t, go, evening } from './rows.js';

const keep = rows => rows.map(row => [row[0], row[1], row[2], row[3], row[4], { ...row[5], keep: true }]);
// A date: shared minutes, never moved, never folded away.
const together = (rows, party) => rows.map(row => [row[0], row[1], row[2], row[3], row[4],
  { ...row[5], party, keep: true, firm: row[3] !== 'STREET' && row[3] !== 'HOME' }]);
const dateParty = r => 'date:' + [r.id, r.date].sort().join('+');

// Supper at the night market after work (17:30), the mayor and the fiancée together.
export function dateEvening(r, day) {
  const market = '@' + day.firstOf('night-market');
  const n = day.dateNeed || 40;               // the slower of the two walks, there and back
  const a = Math.max(1090, 1050 + n), b = a + 105;
  return together([
    go(1050, a),
    [a, b, 'DINING', market, 'date'],
    go(b, b + n),
    [b + n, Math.max(1380, b + n + 20), 'HOME', 'HOME', 'tv'],
    [Math.max(1380, b + n + 20), '24:00', 'SLEEPING', 'HOME', 'sleep']
  ], dateParty(r));
}

// A weekend walkabout at the plaza, the mall and the night market, the two of them all day.
export function mayorWeekend(r, day) {
  const at = kind => '@' + day.firstOf(kind);
  return together([
    ['00:00', '07:30', 'SLEEPING', 'HOME', 'sleep'],
    ['07:30', '08:30', 'DINING', 'HOME', 'breakfast'],
    ['08:30', '09:30', 'HOME', 'HOME', 'leisure'],
    go('09:30', '10:10'),
    ['10:10', '11:50', 'LEISURE', at('plaza'), 'walkabout'],
    go('11:50', '12:15'),
    ['12:15', '13:15', 'DINING', at('mall'), 'food-court'],
    ['13:15', '14:30', 'SHOPPING', at('mall'), 'shopping'],
    go('14:30', '15:00'),
    ['15:00', '17:30', 'LEISURE', at('plaza'), 'walkabout'],
    go('17:30', '18:05'),
    ['18:05', '20:00', 'DINING', at('night-market'), 'date'],
    go('20:00', '20:40'),
    ['20:40', '23:00', 'HOME', 'HOME', 'tv'],
    ['23:00', '24:00', 'SLEEPING', 'HOME', 'sleep']
  ], dateParty(r));
}

// The mayor: the town office on weekdays, an inspection round on Tuesday and Thursday
// afternoons, supper at the night market every evening (with the fiancée on date days).
export function mayor(r, day) {
  if (day.weekend) return r.date ? mayorWeekend(r, day) : weekendAlone(r, day);
  const round = day.inspection;
  const rows = [
    ['00:00', '06:30', 'SLEEPING', 'HOME', 'sleep'],
    ['06:30', '07:15', 'DINING', 'HOME', 'breakfast'],
    ['07:15', '08:00', 'HOME', 'HOME', 'wake'],
    go('08:00', '08:30'),
    ['08:30', '12:00', 'AT_WORK', 'WORK', 'town-hall', FIXED],
    ['12:00', '12:50', 'AT_WORK', 'WORK', 'staff-lunch', FIXED]
  ];
  if (round) {
    rows.push(go('12:50', '13:20'), ['13:20', '15:30', 'LEISURE', 'INSPECTION', 'inspection', FIXED], go('15:30', '16:00'),
      ['16:00', '17:30', 'AT_WORK', 'WORK', 'town-hall', FIXED]);
  } else rows.push(['12:50', '17:30', 'AT_WORK', 'WORK', 'town-hall', FIXED]);
  if (r.date && [0, 2, 4].includes(day.dow)) rows.push(...dateEvening(r, day));
  else {
    rows.push(go('17:30', '18:10'), ['18:10', '19:40', 'DINING', '@' + day.firstOf('night-market'), 'night-snack', { firm: true }], go('19:40', '20:15'),
      ['20:15', '23:00', 'HOME', 'HOME', 'tv'], ['23:00', '24:00', 'SLEEPING', 'HOME', 'sleep']);
  }
  return rows;
}

function weekendAlone(r, day) {
  const at = kind => '@' + day.firstOf(kind);
  return [
    ['00:00', '07:30', 'SLEEPING', 'HOME', 'sleep'], ['07:30', '08:30', 'DINING', 'HOME', 'breakfast'], ['08:30', '10:00', 'HOME', 'HOME', 'leisure'],
    go('10:00', '10:40'), ['10:40', '12:30', 'LEISURE', at('plaza'), 'walkabout'], go('12:30', '13:00'),
    ['13:00', '15:00', 'SHOPPING', at('mall'), 'shopping'], go('15:00', '15:40'), ['15:40', '17:30', 'LEISURE', at('plaza'), 'walkabout'],
    go('17:30', '18:05'), ['18:05', '19:45', 'DINING', at('night-market'), 'night-snack'], go('19:45', '20:25'),
    ['20:25', '23:00', 'HOME', 'HOME', 'tv'], ['23:00', '24:00', 'SLEEPING', 'HOME', 'sleep']
  ];
}

// The president: in the office tower every day, aboard every helicopter sortie.
export function president(r, day) {
  const h = day.helicopter;
  const sorties = day.weekend ? h.sorties.weekend : h.sorties.weekday;
  const there = day.need(r.home, r.work, 30), back = day.need(r.work, r.home, 30);
  const leaveHome = t('07:45') - there, wake = Math.min(360, leaveHome - 60);
  const rows = [
    ['00:00', wake, 'SLEEPING', 'HOME', 'sleep'],
    [wake, wake + 45, 'DINING', 'HOME', 'breakfast'],
    [wake + 45, leaveHome, 'HOME', 'HOME', 'wake'],
    go(leaveHome, '07:45')
  ];
  let at = t('07:45');
  for (const s of sorties) {
    const a = s + h.takeOff - h.boardBefore, b = s + h.landing + h.leaveAfter;
    if (a > at) rows.push([at, a, 'AT_WORK', 'WORK', 'state-affairs']);
    rows.push([a, b, 'AT_WORK', 'WORK', 'helicopter']);
    at = b;
  }
  const leave = Math.max(at + 15, t('18:00'));
  rows.push([at, leave, 'AT_WORK', 'WORK', 'state-affairs'], go(leave, leave + back), ...evening(leave + back, { supper: '19:00', bed: '23:00', after: 'reading' }));
  return keep(rows);
}

