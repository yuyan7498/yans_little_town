// 小鎮機場: the airline's crews and the airport's ground staff.
//
// A crew (schedule 'aircrew') flies a duty — two round trips of one plane — on the days
// src/core/world/flights.js gives it one (`day.flightDuty`): a briefing, aboard from
// boarding until the plane is parked again, a turnaround between the trips, a debrief,
// then home. Days without a duty are days off. Ground staff (worker at the airport) work
// an early or a late shift that covers the first and the last flights.

import { FIXED, go } from './rows.js';
import { dayJob } from './work.js';
import { adultRestDay } from './leisure.js';

const BRIEFING = 30, DEBRIEF = 20;

export function aircrew(r, day) {
  const duty = day.flightDuty;
  if (!duty) return adultRestDay(r, day);
  const brief = Math.floor(duty.from) - BRIEFING;
  const leave = brief - day.need(r.home, r.work, 30), wake = Math.min(leave - 60, 480);
  const rows = [['00:00', wake, 'SLEEPING', 'HOME', 'sleep'], [wake, wake + 40, 'DINING', 'HOME', 'breakfast']];
  // An afternoon duty leaves the morning free, with lunch at home.
  let at = wake + 40;
  if (leave - at >= 150 && leave > 765) { rows.push([at, 705, 'HOME', 'HOME', 'leisure'], [705, 750, 'DINING', 'HOME', 'lunch-home']); at = 750; }
  rows.push([at, leave, 'HOME', 'HOME', at === wake + 40 ? 'wake' : 'leisure'], go(leave, brief));
  at = brief;
  for (const f of duty.flights) {
    const on = Math.max(at, Math.floor(f.board)), off = Math.ceil(f.leave);
    if (on > at) rows.push([at, on, 'AT_WORK', 'WORK', at === brief ? 'preflight' : 'turnaround', FIXED]);
    rows.push([on, off, 'AT_WORK', 'WORK', 'flying', FIXED]);
    at = off;
  }
  rows.push([at, at + DEBRIEF, 'AT_WORK', 'WORK', 'debrief', FIXED], ...day.homeFrom(at + DEBRIEF, { supper: '19:00', bed: '23:15' }));
  return rows;
}

// Ground staff, check-in counters and the tower: early 05:30–14:00 or late 13:00–21:30.
export function airportGround(r, day) {
  if (!day.works) return adultRestDay(r, day);
  if (r.shift === 'late') return dayJob(r, day, { start: '13:00', end: '21:30', lunch: ['17:30', '18:10'], lunchActivity: 'staff-meal', activity: 'ground-ops', supper: false, bed: '23:40' });
  return dayJob(r, day, { start: '05:30', end: '14:00', lunch: ['10:40', '11:20'], lunchActivity: 'staff-meal', activity: 'ground-ops', bed: '21:30' });
}
