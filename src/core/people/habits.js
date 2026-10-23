// Personal habits: everything a template asks about one resident's tastes and whims
// is a hash of their id (and, for whims, the day), so it is the same in every browser
// and the same person keeps the same habits week after week.

import { hash, pick, unit } from './mix.js';

const daysCache = new Map();
// n distinct days of the week (among the first `of`: 5 = weekdays) for a key.
export function personalDays(key, n, of = 7) {
  const k = key + '/' + n + '/' + of;
  let days = daysCache.get(k);
  if (!days) {
    days = Array.from({ length: of }, (_, i) => i).sort((a, b) => hash(key + ':' + a) - hash(key + ':' + b)).slice(0, n).sort((a, b) => a - b);
    daysCache.set(k, days);
  }
  return days;
}

// The questions a template may ask about resident r on `day` (weekday `dow`).
export function habitsOf(r, day, dow) {
  const id = r.id;
  return {
    // A lasting habit: the same share of people, the same people, every week.
    has: (key, share) => unit(id + ':' + key) < share,
    // Today's whim.
    today: (key, share) => unit(id + ':' + key + ':' + day) < share,
    // A habit kept on n chosen days of the week (of the first `of` days; 5 = weekdays).
    onDays: (key, n, of = 7) => personalDays(id + ':' + key, n, of).includes(dow),
    // One of a list: chosen afresh each day, or fixed for good.
    choose: (key, list) => list[pick(id + ':' + key + ':' + day, list.length)],
    lasting: (key, list) => list[pick(id + ':' + key, list.length)],
    // A weekly timetable: the same choice on the same weekday every week.
    weekly: (key, list) => list[pick(id + ':' + key + ':' + dow, list.length)],
    // A number in [0, 1) for spreading people between places, fresh each day.
    spread: key => unit(id + ':spread:' + key + ':' + day),
    // Every other day (a person's own parity).
    alternate: key => (day + pick(id + ':' + key, 2)) % 2 === 0
  };
}
