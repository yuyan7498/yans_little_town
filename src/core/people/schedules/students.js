// Children and students. School days follow the school's own days (shut at the
// weekend); days without school use the rest days in leisure.js.

import { SHARE } from '../rules.js';
import { unit } from '../mix.js';
import { FIXED, add, go, shareRows } from './rows.js';
import { BELL } from './kinder.js';
import { kidRestDay, teenRestDay, studentRestDay } from './leisure.js';

// Under-sixes: the kindergarten in the primary school on school days (a grown-up takes
// them and brings them home, see together.js and work.js), otherwise at home with the
// weekend stroller walk (with a grown-up, from day.shared).
export function preschooler(r, day) {
  const k = day.works && day.kinder;
  const info = k && k.info;
  if (info) {
    const eat = Math.max(1080, info.homeAt);
    const wake = Math.min(info.leave - 60, 450);
    return [
      ['00:00', wake, 'SLEEPING', 'HOME', 'sleep'],
      [wake, wake + 40, 'DINING', 'HOME', 'breakfast'],
      [wake + 40, info.leave, 'HOME', 'HOME', 'play'],
      [info.leave, info.dropAt, 'COMMUTE', 'STREET', 'commute', { party: k.party, keep: true }],
      [info.dropAt, BELL, 'AT_WORK', 'WORK', 'kindergarten', FIXED],
      ...(info.pickDepart > BELL ? [[BELL, info.pickDepart, 'AT_WORK', 'WORK', 'after-care', FIXED]] : []),
      [info.pickDepart, info.homeAt, 'COMMUTE', 'STREET', 'commute', { party: k.party, keep: true }],
      ...(eat > info.homeAt ? [[info.homeAt, eat, 'HOME', 'HOME', 'play']] : []),
      [eat, eat + 40, 'DINING', 'HOME', 'supper'],
      [eat + 40, Math.max(1230, eat + 60), 'HOME', 'HOME', 'play'],
      [Math.max(1230, eat + 60), '24:00', 'SLEEPING', 'HOME', 'sleep']
    ];
  }
  const found = day.shared.find(o => o.leave >= 790 && o.leave < 1000);
  const walk = found && found.leave >= 775 ? found : null;
  const napEnd = walk ? Math.min(880, walk.leave - 10) : 880;
  const rows = [
    ['00:00', '07:30', 'SLEEPING', 'HOME', 'sleep'],
    ['07:30', '08:20', 'DINING', 'HOME', 'breakfast'],
    ['08:20', '12:00', 'HOME', 'HOME', 'play'],
    ['12:00', '12:40', 'DINING', 'HOME', 'lunch-home'],
    ['12:40', napEnd, 'SLEEPING', 'HOME', 'nap']
  ];
  if (walk) rows.push([napEnd, walk.leave, 'HOME', 'HOME', 'play'], ...walk.rows, [walk.home, Math.max(1080, walk.home), 'HOME', 'HOME', 'play']);
  else rows.push([napEnd, '18:00', 'HOME', 'HOME', 'play']);
  const eat = Math.max(1080, walk ? walk.home : 0);
  rows.push([eat, eat + 40, 'DINING', 'HOME', 'supper'], [eat + 40, Math.max(1230, eat + 60), 'HOME', 'HOME', 'play'], [Math.max(1230, eat + 60), '24:00', 'SLEEPING', 'HOME', 'sleep']);
  return rows;
}

// Does this pupil go to the amusement park after school today? (A grandparent who
// collects the pupil asks the same question, so both know.)
export const staysOutAfterSchool = (pupilId, day) => unit(pupilId + ':after-school:' + day) < SHARE.primary.afterSchool;

// The walk from the school gate after the 16:00 bell: straight home or round the
// amusement park. `home` is when they get in.
export function afterSchoolRows(goesOut, need = 0) {
  if (!goesOut) {
    const n = need || 25;
    return { home: 960 + n, rows: [go('16:00', 960 + n)] };
  }
  const n = need || 20;
  return { home: 1060 + n, rows: [go('16:00', 960 + n), [960 + n, 1060, 'LEISURE', 'AMUSEMENT', 'after-school'], go(1060, 1060 + n)] };
}

// Primary school 08:00–16:00; a quarter of the pupils go to the amusement park after school.
export function primary(r, day) {
  if (!day.works) return kidRestDay(r, day);
  const after = afterSchoolRows(staysOutAfterSchool(r.id, day.day), day.pickedUp ? day.pickedUp.need : 0);
  const afterRows = day.pickedUp ? shareRows(after.rows, day.pickedUp.party) : after.rows;
  return [
    ['00:00', '06:40', 'SLEEPING', 'HOME', 'sleep'],
    ['06:40', '07:30', 'DINING', 'HOME', 'breakfast'],
    go('07:30', '08:00'),
    ['08:00', '12:00', 'AT_WORK', 'WORK', 'class', FIXED],
    ['12:00', '13:00', 'AT_WORK', 'WORK', 'school-lunch', FIXED],
    ['13:00', '16:00', 'AT_WORK', 'WORK', 'class', FIXED],
    ...afterRows,
    [after.home, '18:30', 'HOME', 'HOME', 'homework'],
    ['18:30', '19:10', 'DINING', 'HOME', 'supper'],
    ['19:10', '21:15', 'HOME', 'HOME', 'tv'],
    ['21:15', '24:00', 'SLEEPING', 'HOME', 'sleep']
  ];
}

// Secondary school 07:30–17:00, then evening study at school (or at the library) to
// about 20:30, Monday to Thursday; Friday evenings are free.
export function secondary(r, day) {
  if (!day.works) return teenRestDay(r, day);
  let after;
  if (day.dow === 4) {
    after = day.today('friday-out', SHARE.secondary.fridayOut)
      ? [go('17:00', '17:25'), ['17:25', '19:30', 'LEISURE', 'MALL', 'hang-out'], go('19:30', '19:55'), ...day.evening('19:55', { supper: '20:00', bed: '23:30' })]
      : [go('17:00', '17:30'), ...day.evening('17:30', { supper: '18:45', bed: '23:30' })];
  } else if (day.has('library-study', SHARE.secondary.library)) {
    after = [go('17:00', '17:20'), ['17:20', '20:30', 'LEISURE', 'LIBRARY', 'study'], go('20:30', '20:50'),
      ['20:50', '21:30', 'DINING', 'HOME', 'supper'], ['21:30', '23:30', 'HOME', 'HOME', 'homework'], ['23:30', '24:00', 'SLEEPING', 'HOME', 'sleep']];
  } else {
    after = [
      ['17:00', '17:40', 'AT_WORK', 'WORK', 'school-supper'],
      ['17:40', '20:30', 'AT_WORK', 'WORK', 'evening-study', FIXED],
      go('20:30', '21:00'),
      ['21:00', '23:30', 'HOME', 'HOME', 'homework'],
      ['23:30', '24:00', 'SLEEPING', 'HOME', 'sleep']
    ];
  }
  return [
    ['00:00', '06:15', 'SLEEPING', 'HOME', 'sleep'],
    ['06:15', '06:55', 'DINING', 'HOME', 'breakfast'],
    go('06:55', '07:30'),
    ['07:30', '12:10', 'AT_WORK', 'WORK', 'class', FIXED],
    ['12:10', '13:10', 'AT_WORK', 'WORK', 'school-lunch', FIXED],
    ['13:10', '17:00', 'AT_WORK', 'WORK', 'class', FIXED],
    ...after
  ];
}

// University: a loose timetable (the same each week), some shopping after class, a
// share eat at the night market on two evenings.
export function university(r, day) {
  if (!day.works) return studentRestDay(r, day);
  const shape = day.weekly('timetable', ['full', 'morning', 'afternoon']);
  const rows = [];
  let free;   // when classes end
  if (shape === 'afternoon') {
    rows.push(
      ['00:00', '09:00', 'SLEEPING', 'HOME', 'sleep'],
      ['09:00', '10:00', 'DINING', 'HOME', 'brunch'],
      ['10:00', '12:30', 'HOME', 'HOME', 'homework'],
      go('12:30', '13:00'),
      ['13:00', '13:20', 'AT_WORK', 'WORK', 'study'],
      ['13:20', '17:10', 'AT_WORK', 'WORK', 'lecture', FIXED]);
    free = '17:10';
  } else {
    rows.push(
      ['00:00', '08:15', 'SLEEPING', 'HOME', 'sleep'],
      ['08:15', '09:10', 'DINING', 'HOME', 'breakfast'],
      go('09:10', '09:45'),
      ['09:45', '10:10', 'AT_WORK', 'WORK', 'study'],
      ['10:10', '12:00', 'AT_WORK', 'WORK', 'lecture', FIXED],
      ['12:00', '13:20', 'AT_WORK', 'WORK', 'school-lunch']);
    if (shape === 'full') { rows.push(['13:20', '16:00', 'AT_WORK', 'WORK', 'lecture', FIXED]); free = '16:00'; }
    else { rows.push(['13:20', '15:00', 'AT_WORK', 'WORK', 'study']); free = '15:00'; }
  }
  const nightMarket = !day.dinner && day.has('night-market', SHARE.university.nightMarket) && day.onDays('night-market', 2, 5);
  const shopping = !nightMarket && day.today('shopping', SHARE.university.shopping / 2);
  const home = add(free, 30);
  if (shopping) {
    const place = day.choose('shop-place', ['MALL', 'ANNEX_MALL']);
    rows.push(go(free, add(free, 25)), [add(free, 25), '18:30', 'SHOPPING', place, 'shopping'], go('18:30', '18:55'),
      ...day.evening('18:55', { supper: '19:00', bed: '23:45' }));
  } else if (nightMarket) {
    rows.push(go(free, home), [home, '18:30', 'HOME', 'HOME', 'leisure'],
      go('18:30', '18:55'), ['18:55', '20:20', 'DINING', 'NIGHT_MARKET', 'night-snack'], go('20:20', '20:45'),
      ['20:45', '23:45', 'HOME', 'HOME', 'homework'], ['23:45', '24:00', 'SLEEPING', 'HOME', 'sleep']);
  } else {
    rows.push(go(free, home), ...day.evening(home, { supper: '19:00', bed: '23:45', after: 'homework' }));
  }
  return rows;
}
