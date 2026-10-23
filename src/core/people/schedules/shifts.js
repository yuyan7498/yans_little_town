// Shift work: hospital doctors and nurses, officers, the cleansing crew, market
// workers, transit drivers, tower night crews and the patients in the wards.
//
// A shift that runs past midnight is written as two halves: tonight's start (the end of
// today's plan) and what is left of it (`day.carry`, the start of tomorrow's plan,
// worked out from yesterday), so the seam at midnight is whatever last night really was.

import { FIXED, t, go, evening, clip } from './rows.js';
import { dayJob } from './work.js';
import { adultRestDay } from './leisure.js';

// An early shift (08:00–16:00) of the hospital or the precinct.
function earlyShift(r, day, o) {
  if (!day.works) return adultRestDay(r, day);
  return dayJob(r, day, { start: '08:00', end: '16:00', lunch: ['12:00', '12:40'], ...o });
}

// A shift that ends at midnight (16:00–24:00, the cleansing crew 15:30–): the plan
// ends at work; the next morning begins with a short tail and the way home.
// spec: { start, tonight (rows from start to 24:00), tail: [rows from 00:00], tailEnd }
function eveningShift(r, day, spec) {
  const rows = [];
  if (day.carry) rows.push(...spec.tail, go(spec.tailEnd, spec.tailEnd + 30), [spec.tailEnd + 30, '08:30', 'SLEEPING', 'HOME', 'sleep']);
  else if (day.works) rows.push(['00:00', '08:30', 'SLEEPING', 'HOME', 'sleep']);
  else return adultRestDay(r, day);
  if (!day.works) return [...rows, ...clip(adultRestDay(r, day), '08:30')];
  const start = t(spec.start), leave = start - 45;
  rows.push(['08:30', '09:15', 'DINING', 'HOME', 'breakfast'], ['09:15', leave, 'HOME', 'HOME', 'leisure'], go(leave, start), ...spec.tonight);
  return rows;
}

// A shift that starts late in the evening and ends in the morning (tower night crews,
// hospital night shift). spec: { start, tonight, carry (rows from 00:00), carryEnd }
function nightShift(r, day, spec) {
  const rows = [];
  if (day.carry) rows.push(...spec.carry, go(spec.carryEnd, spec.carryEnd + 30), [spec.carryEnd + 30, '15:00', 'SLEEPING', 'HOME', 'day-sleep']);
  else if (day.works) rows.push(['00:00', '11:00', 'SLEEPING', 'HOME', 'sleep'], ['11:00', '12:00', 'DINING', 'HOME', 'brunch'], ['12:00', '15:00', 'HOME', 'HOME', 'leisure']);
  else return adultRestDay(r, day);
  if (!day.works) return [...rows, ...day.evening('15:00', { supper: '17:30', bed: '22:30' })];
  const leave = t(spec.start) - 30;
  rows.push(['15:00', '17:30', 'HOME', 'HOME', 'leisure'], ['17:30', '18:15', 'DINING', 'HOME', 'supper'], ['18:15', leave, 'HOME', 'HOME', 'leisure'],
    go(leave, spec.start), ...spec.tonight);
  return rows;
}


// Doctors and nurses: early 08–16, evening 16–24, night 00–08.
export function medical(r, day) {
  const act = r.kind === 'doctor' ? 'rounds' : 'nursing';
  if (r.shift === 'early') return earlyShift(r, day, { activity: act });
  if (r.shift === 'evening') {
    return eveningShift(r, day, {
      start: '16:00', tail: [['00:00', '00:20', 'AT_WORK', 'WORK', 'handover', FIXED]], tailEnd: 20,
      tonight: [['16:00', '19:30', 'AT_WORK', 'WORK', act, FIXED], ['19:30', '20:10', 'AT_WORK', 'WORK', 'duty-meal', FIXED], ['20:10', '24:00', 'AT_WORK', 'WORK', act, FIXED]]
    });
  }
  return nightShift(r, day, {
    start: '23:30', carry: [['00:00', '08:00', 'AT_WORK', 'WORK', act, FIXED]], carryEnd: 480,
    tonight: [['23:30', '24:00', 'AT_WORK', 'WORK', 'handover', FIXED]]
  });
}

// Tower night crews, 22:00–07:00.
export function officeNight(r, day) {
  return nightShift(r, day, {
    start: '22:00', carry: [['00:00', '07:00', 'AT_WORK', 'WORK', 'night-duty', FIXED]], carryEnd: 420,
    tonight: [['22:00', '24:00', 'AT_WORK', 'WORK', 'night-duty', FIXED]]
  });
}

// Officers: early shift (on gate duty at the school gate for the last 45 minutes of a school day),
// evening 16–24, night 00–08.
export function officer(r, day) {
  if (r.shift === 'early') {
    const gate = r.dutyPost && day.schoolDay;
    return earlyShift(r, day, gate
      ? { body: [['08:00', '15:10', 'AT_WORK', 'WORK', 'patrol', FIXED], go('15:10', '15:15'), ['15:15', '16:00', 'AT_WORK', 'POST', 'school-gate', FIXED]] }
      : { activity: r.post === 'gate' ? 'patrol' : 'desk', lunch: ['12:00', '12:40'] });
  }
  if (r.shift === 'evening') {
    return eveningShift(r, day, {
      start: '16:00', tail: [['00:00', '00:20', 'AT_WORK', 'WORK', 'handover', FIXED]], tailEnd: 20,
      tonight: [['16:00', '24:00', 'AT_WORK', 'WORK', 'patrol', FIXED]]
    });
  }
  return nightShift(r, day, {
    start: '23:30', carry: [['00:00', '08:00', 'AT_WORK', 'WORK', 'patrol', FIXED]], carryEnd: 480,
    tonight: [['23:30', '24:00', 'AT_WORK', 'WORK', 'handover', FIXED]]
  });
}

// Firefighters: the precinct's three shifts, standing by at the station; the early
// shift drills in the afternoon.
export function firefighter(r, day) {
  if (r.shift === 'early') {
    return earlyShift(r, day, { body: [['08:00', '12:00', 'AT_WORK', 'WORK', 'fire-duty', FIXED], ['12:00', '12:40', 'AT_WORK', 'WORK', 'duty-meal', FIXED],
      ['12:40', '14:30', 'AT_WORK', 'WORK', 'drill', FIXED], ['14:30', '16:00', 'AT_WORK', 'WORK', 'fire-duty', FIXED]] });
  }
  if (r.shift === 'evening') {
    return eveningShift(r, day, {
      start: '16:00', tail: [['00:00', '00:20', 'AT_WORK', 'WORK', 'handover', FIXED]], tailEnd: 20,
      tonight: [['16:00', '19:00', 'AT_WORK', 'WORK', 'fire-duty', FIXED], ['19:00', '19:40', 'AT_WORK', 'WORK', 'duty-meal', FIXED], ['19:40', '24:00', 'AT_WORK', 'WORK', 'fire-duty', FIXED]]
    });
  }
  return nightShift(r, day, {
    start: '23:30', carry: [['00:00', '08:00', 'AT_WORK', 'WORK', 'fire-duty', FIXED]], carryEnd: 480,
    tonight: [['23:30', '24:00', 'AT_WORK', 'WORK', 'handover', FIXED]]
  });
}

// The cleansing crew: the dawn crew is out at 04:30; the evening crew clears the
// riverside after the night market.
export function sanitation(r, day) {
  if (r.shift === 'evening') {
    return eveningShift(r, day, {
      start: '15:30', tail: [['00:00', '00:40', 'AT_WORK', 'RIVERSIDE', 'riverfront', FIXED]], tailEnd: 40,
      tonight: [['15:30', '22:30', 'AT_WORK', 'WORK', 'collection', FIXED], go('22:30', '22:45'), ['22:45', '24:00', 'AT_WORK', 'RIVERSIDE', 'riverfront', FIXED]]
    });
  }
  if (!day.works) return adultRestDay(r, day);
  return [
    ['00:00', '03:45', 'SLEEPING', 'HOME', 'sleep'],
    ['03:45', '04:05', 'HOME', 'HOME', 'wake'],
    go('04:05', '04:30'),
    ['04:30', '08:30', 'AT_WORK', 'WORK', 'collection', FIXED],
    ['08:30', '09:00', 'AT_WORK', 'WORK', 'yard-breakfast', FIXED],
    ['09:00', '11:30', 'AT_WORK', 'WORK', 'transfer', FIXED],
    go('11:30', '12:00'),
    ['12:00', '12:45', 'DINING', 'HOME', 'lunch-home'],
    ['12:45', '16:00', 'SLEEPING', 'HOME', 'nap'],
    ['16:00', '17:30', 'HOME', 'HOME', 'leisure'],
    ['17:30', '18:15', 'DINING', 'HOME', 'supper'],
    ['18:15', '21:15', 'HOME', 'HOME', 'tv'],
    ['21:15', '24:00', 'SLEEPING', 'HOME', 'sleep']
  ];
}

// Market workers: dawn wholesale 04:00–08:00 then a nap; morning retail 07:30–11:30.
export function market(r, day) {
  if (!day.works) return adultRestDay(r, day);
  if (r.shift === 'dawn') {
    return [
      ['00:00', '03:10', 'SLEEPING', 'HOME', 'sleep'],
      ['03:10', '03:30', 'HOME', 'HOME', 'wake'],
      go('03:30', '04:00'),
      ['04:00', '08:00', 'AT_WORK', 'WORK', 'wholesale', FIXED],
      ['08:00', '08:30', 'AT_WORK', 'WORK', 'stall-breakfast', FIXED],
      go('08:30', '09:00'),
      ['09:00', '12:00', 'SLEEPING', 'HOME', 'nap'],
      ['12:00', '12:45', 'DINING', 'HOME', 'lunch-home'],
      ['12:45', '18:00', 'HOME', 'HOME', 'leisure'],
      ['18:00', '18:45', 'DINING', 'HOME', 'supper'],
      ['18:45', '21:30', 'HOME', 'HOME', 'tv'],
      ['21:30', '24:00', 'SLEEPING', 'HOME', 'sleep']
    ];
  }
  return [
    ['00:00', '06:15', 'SLEEPING', 'HOME', 'sleep'],
    ['06:15', '06:55', 'DINING', 'HOME', 'breakfast'],
    ['06:55', '07:00', 'HOME', 'HOME', 'wake'],
    go('07:00', '07:30'),
    ['07:30', '11:30', 'AT_WORK', 'WORK', 'retail', FIXED],
    go('11:30', '12:00'),
    ['12:00', '12:45', 'DINING', 'HOME', 'lunch-home'],
    ...day.evening('12:45', { supper: '18:30', bed: '22:30' })
  ];
}

// Transit drivers, every day: the early crew 05:45–13:30, the late crew 13:00–21:00.
export function transit(r, day) {
  if (r.crew === 'late') {
    return [
      ['00:00', '08:30', 'SLEEPING', 'HOME', 'sleep'],
      ['08:30', '09:15', 'DINING', 'HOME', 'breakfast'],
      ['09:15', '12:30', 'HOME', 'HOME', 'leisure'],
      go('12:30', '13:00'),
      ['13:00', '17:00', 'AT_WORK', 'WORK', 'driving', FIXED],
      ['17:00', '17:30', 'AT_WORK', 'WORK', 'duty-meal', FIXED],
      ['17:30', '21:00', 'AT_WORK', 'WORK', 'driving', FIXED],
      go('21:00', '21:30'),
      ...evening('21:30', { supper: '21:30', bed: '23:15' })
    ];
  }
  return [
    ['00:00', '04:20', 'SLEEPING', 'HOME', 'sleep'],
    ['04:20', '05:00', 'DINING', 'HOME', 'breakfast'],
    ['05:00', '05:15', 'HOME', 'HOME', 'wake'],
    go('05:15', '05:45'),
    ['05:45', '09:30', 'AT_WORK', 'WORK', 'driving', FIXED],
    ['09:30', '10:00', 'AT_WORK', 'WORK', 'duty-meal', FIXED],
    ['10:00', '13:30', 'AT_WORK', 'WORK', 'driving', FIXED],
    go('13:30', '14:00'),
    ['14:00', '14:45', 'DINING', 'HOME', 'lunch-home'],
    ...day.evening('14:45', { supper: '18:00', bed: '21:30' })
  ];
}

// Patients live in the hospital: treatment, ward rest, ward meals, a stroll in the corridor.
export function patient(r, day) {
  const ward = (a, b, state, activity) => [a, b, state, 'WORK', activity];
  return [
    ward('00:00', '07:00', 'SLEEPING', 'sleep'),
    ward('07:00', '07:30', 'HOME', 'ward-rest'),
    ward('07:30', '08:15', 'DINING', 'ward-meal'),
    ward('08:15', '09:00', 'HOME', 'ward-rest'),
    ward('09:00', '10:30', 'MEDICAL', 'treatment'),
    ward('10:30', '12:00', 'HOME', 'ward-rest'),
    ward('12:00', '12:45', 'DINING', 'ward-meal'),
    ward('12:45', '14:30', 'SLEEPING', 'nap'),
    ward('14:30', '15:15', 'LEISURE', 'corridor'),
    ward('15:15', '16:15', 'MEDICAL', 'treatment'),
    ward('16:15', '18:00', 'HOME', 'ward-rest'),
    ward('18:00', '18:45', 'DINING', 'ward-meal'),
    ward('18:45', '21:00', 'HOME', 'ward-rest'),
    ward('21:00', '24:00', 'SLEEPING', 'sleep')
  ];
}
