// Days off, by age group, and the days of people without a job. Where they go is a
// token (MALL, OUTDOOR …): places.js picks the actual place and plans.js moves people
// on when a place is full, so the crowds spread over the town's venues.
//
// Every one of these is a homeDay(): meals and a few outings laid over a day at home.
// `day.shared` holds the outings the resident's family, couple, circle or friends have
// agreed (same minutes for everyone); they come first, so a family day beats a whim.

import { SHARE, WEEKEND_DUTY } from '../rules.js';
import { FIXED, add, go, trip, homeDay } from './rows.js';

const out = (leave, arrive, back, home, state, token, activity) => trip({ leave, arrive, back, home, state, token, activity });

// A pupil's day without school. Younger pupils stay home unless the family goes out.
export function kidRestDay(r, day) {
  const goOut = r.age >= 9 && day.today('kid-out', SHARE.primary.weekendOut);
  const [token, activity] = day.choose('kid-place', [['AMUSEMENT', 'rides'], ['MALL', 'arcade'], ['PLAZA', 'playground'], ['ZOO', 'zoo-visit'], ['AIRPORT', 'plane-spotting']]);
  return homeDay({
    wake: '07:40', bed: '21:30', idle: at => (at < 840 ? 'play' : 'tv'),
    meals: [['07:40', 'breakfast'], [['12:00', '13:00'], 'lunch-home'], [['18:30'], 'supper']]
  }, [...day.shared, goOut && out('13:50', '14:10', '16:30', '16:50', 'LEISURE', token, activity)]);
}

// A secondary-school student's day off: a lie-in, homework, the afternoon out, and
// sometimes supper at the night market or the mall's food court.
export function teenRestDay(r, day) {
  const [token, state, activity] = day.choose('teen-place', [
    ['MALL', 'SHOPPING', 'shopping'], ['ANNEX_MALL', 'SHOPPING', 'shopping'], ['PLAZA', 'LEISURE', 'hang-out'],
    ['SPORTS', 'LEISURE', 'sports'], ['LIBRARY', 'LEISURE', 'study'], ['CINEMA', 'LEISURE', 'movie']]);
  const supperPlace = day.choose('teen-supper-place', ['NIGHT_MARKET', 'MALL']);
  return homeDay({
    wake: '08:40', bed: '23:30', idle: at => (at < 750 ? 'homework' : 'leisure'),
    meals: [['08:40', 'breakfast'], [['12:30'], 'lunch-home'], [['18:45'], 'supper']]
  }, [...day.shared,
    day.today('teen-out', SHARE.secondary.weekendOut) && out('14:00', '14:25', '17:30', '17:55', state, token, activity),
    day.today('teen-supper', SHARE.secondary.weekendSupper) && (supperPlace === 'NIGHT_MARKET' ? day.nmOut(1, 'teen') : out('18:30', '18:55', '20:15', '20:40', 'DINING', supperPlace, 'night-snack')),
    day.nmSnack()]);
}

// A university student's day off: up late, out in the afternoon, often out for supper.
export function studentRestDay(r, day) {
  const [token, state, activity] = day.choose('student-place', [
    ['MALL', 'SHOPPING', 'shopping'], ['ANNEX_MALL', 'SHOPPING', 'shopping'], ['PLAZA', 'LEISURE', 'hang-out'],
    ['LIBRARY', 'LEISURE', 'study'], ['OUTDOOR', 'LEISURE', 'outing'], ['CINEMA', 'LEISURE', 'movie']]);
  const supperPlace = day.choose('student-supper-place', ['NIGHT_MARKET', 'NIGHT_MARKET', 'MALL']);
  return homeDay({
    wake: '10:00', bed: '23:50',
    meals: [['10:00', 'brunch'], [['18:30'], 'supper']]
  }, [...day.shared,
    out('13:30', '13:55', '17:15', '17:40', state, token, activity),
    day.today('student-supper', SHARE.university.weekendSupper) && (supperPlace === 'NIGHT_MARKET' ? day.nmOut(1, 'student') : out('18:45', '19:10', '20:40', '21:05', 'DINING', supperPlace, 'night-snack')),
    day.nmSnack()]);
}

// A grown-up's day off: maybe out in the morning (market, mall, a park), maybe out
// in the afternoon, sometimes supper at the night market.
export function adultRestDay(r, day) {
  const errands = day.weekend ? [] : [['BANK', 'SHOPPING', 'errand']];
  const morning = day.today('rest-morning', SHARE.adult.morningOut) && day.choose('rest-morning-place', [
    ['MARKET', 'SHOPPING', 'grocery'], ['MALL', 'SHOPPING', 'shopping'], ['ANNEX_MALL', 'SHOPPING', 'shopping'],
    ['OUTDOOR', 'LEISURE', 'outing'], ['SPORTS', 'LEISURE', 'sports'], ['TEMPLE', 'LEISURE', 'worship'], ...errands]);
  const afternoon = day.today('rest-afternoon', SHARE.adult.afternoonOut) && day.choose('rest-afternoon-place', [
    ['MALL', 'SHOPPING', 'shopping'], ['ANNEX_MALL', 'SHOPPING', 'shopping'], ['OUTDOOR', 'LEISURE', 'outing'],
    ['LIBRARY', 'LEISURE', 'library-reading'], ['PLAZA', 'LEISURE', 'outing'], ['CINEMA', 'LEISURE', 'movie'], ['ZOO', 'LEISURE', 'zoo-visit']]);
  return homeDay({
    wake: '07:45', bed: '23:30',
    meals: [['07:45', 'breakfast'], [['12:15'], 'lunch-home'], [['18:45'], 'supper']]
  }, [...day.shared,
    morning && out('09:20', '09:45', '11:30', '11:55', morning[1], morning[0], morning[2]),
    afternoon && out('14:30', '14:55', '17:00', '17:25', afternoon[1], afternoon[0], afternoon[2]),
    day.refuel && out('10:40', '11:00', '11:10', '11:30', 'SHOPPING', 'GAS', 'refuel'),
    day.nmOut(SHARE.adult.nightMarket, 'adult'), day.nmSnack()]);
}

// Between jobs: up late, the plaza or the mall, some afternoons at the town office
// registering for work, often supper at the night market.
export function unemployed(r, day) {
  const civic = !day.weekend && day.has('job-hunt', SHARE.unemployed.civic) && day.onDays('job-hunt', 2, 5);
  const nightMarket = day.has('night-market', SHARE.unemployed.nightMarket) && day.onDays('night-market', 3);
  const [token, state, activity] = day.choose('afternoon', [['HANGOUT', 'LEISURE', 'hang-out'], ['MALL', 'SHOPPING', 'shopping'], ['PLAZA', 'LEISURE', 'hang-out'], ['CINEMA', 'LEISURE', 'movie']]);
  return homeDay({
    wake: '10:00', bed: '23:50',
    meals: [['10:00', 'brunch'], [['12:30'], 'lunch-home'], [['18:45'], 'supper']]
  }, [...day.shared,
    civic ? out('13:40', '14:00', '16:00', '16:20', 'SHOPPING', 'CIVIC', 'welfare-queue') : out('13:40', '14:00', '16:00', '16:20', state, token, activity),
    nightMarket && day.nmOut(1, 'jobless'), day.nmSnack()]);
}

// Weekend duty: minding a shut workplace (or keeping watch at a mall) all day.
export function dutyDay(r, day) {
  const activity = day.duty.activity;
  return [
    ['00:00', '06:45', 'SLEEPING', 'HOME', 'sleep'],
    ['06:45', '07:35', 'DINING', 'HOME', 'breakfast'],
    ['07:35', add(WEEKEND_DUTY.from, -30), 'HOME', 'HOME', 'wake'],
    go(add(WEEKEND_DUTY.from, -30), WEEKEND_DUTY.from),
    [WEEKEND_DUTY.from, '12:00', 'AT_WORK', 'DUTY', activity, FIXED],
    ['12:00', '12:40', 'AT_WORK', 'DUTY', 'duty-meal'],
    ['12:40', WEEKEND_DUTY.to, 'AT_WORK', 'DUTY', activity, FIXED],
    ...day.homeFrom(WEEKEND_DUTY.to, { supper: '19:00', bed: '23:15' })
  ];
}
