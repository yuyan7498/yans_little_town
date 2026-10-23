// The town clock. A town day is 1440 town minutes and lasts 900 real seconds at
// normal speed (the town runs 96 times faster than life). Time is carried as
// `daySeconds`: real seconds since day 1, 00:00. Day 1 is a Monday.

export const MINUTES_PER_DAY = 1440;
export const SECONDS_PER_MINUTE = 0.625;
export const DAY_NAMES = ['週一', '週二', '週三', '週四', '週五', '週六', '週日'];

const mod = (v, n) => ((v % n) + n) % n;
const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// Absolute town minutes since day 1, 00:00 (a float).
export const absoluteMinute = daySeconds => Math.max(0, daySeconds) / SECONDS_PER_MINUTE;
export const toDaySeconds = (day, minute) => ((Math.max(1, day) - 1) * MINUTES_PER_DAY + minute) * SECONDS_PER_MINUTE;

// Everything about one moment.
export function moment(daySeconds) {
  const abs = absoluteMinute(daySeconds);
  const day = Math.floor(abs / MINUTES_PER_DAY) + 1;
  const minute = abs - (day - 1) * MINUTES_PER_DAY;
  return { day, minute, abs, dow: dow(day), dayType: dayType(day), daylight: daylight(minute), lamps: lamps(minute), dusk: dusk(minute) };
}

// 0 = Monday … 6 = Sunday.
export const dow = day => mod((day || 1) - 1, 7);
export const isWeekend = day => dow(day) >= 5;
export const dayType = day => (dow(day) === 5 ? 'saturday' : dow(day) === 6 ? 'sunday' : 'weekday');
export const weekIndex = day => Math.floor(((day || 1) - 1) / 7);

// 'HH:MM' for a minute of the day.
export function format(minute) {
  const m = mod(Math.floor(minute), MINUTES_PER_DAY);
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

// Sun light, 0 (night) to 1 (day): sunrise 05:30–07:00, sunset 18:30–19:30.
export function daylight(minute) {
  const m = mod(minute, MINUTES_PER_DAY);
  return smooth(330, 420, m) * (1 - smooth(1110, 1170, m));
}

// Street lamps, 0 to 1: on through dusk at 18:30, off at dawn 06:00.
export function lamps(minute) {
  const m = mod(minute, MINUTES_PER_DAY);
  return m < 720 ? 1 - smooth(345, 360, m) : smooth(1100, 1115, m);
}

// The warm hour around sunset, 0 to 1 (peaks about 18:40).
export function dusk(minute) {
  const m = mod(minute, MINUTES_PER_DAY);
  return smooth(1000, 1110, m) * (1 - smooth(1140, 1175, m));
}

// Is `minute` (of the day) inside [from, to)? Windows may wrap past midnight.
export function within(minute, from, to) {
  const m = mod(minute, MINUTES_PER_DAY);
  return from <= to ? m >= from && m < to : m >= from || m < to;
}
