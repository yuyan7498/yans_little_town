// The town's two strays roam. Each day is a different trail across the whole town
// (src/core/people/wander.js draws the stops per animal and day: benches, chess tables,
// building fronts) between fixed anchors, and never goes into a building. Both sleep at
// their nest, which they leave and come back to:
//
//   cat   nocturnal: naps by day (with a short outing), is fed at the night market in the
//         evening by the vendors, then prowls the quiet streets far from the nest and
//         comes back at 02:00–03:00 — so its day ends out in town and the next one
//         begins there (the stop is a function of the day, see wander.nightStop).
//   dog   a day roamer: out early, breakfast from the retirees at their park, the school
//         gate (or the amusement park, or the plaza) when the children come out, back at the nest by night.
//
// The town looks after them (relations.json links.caretaker), so the anchors are where the
// caretakers are. How long a walk takes comes from day.leg (the street layer's estimate).

import { pick } from '../mix.js';

const nest = (a, b, state, activity) => (b > a ? [a, b, state, 'HOME', activity] : null);
const ghost = { firm: true, ghost: true };

export function stray(r, day) {
  return (r.species === 'dog' ? dog(r, day) : cat(r, day)).filter(Boolean);
}

function cat(r, day) {
  const market = day.firstOf('night-market');
  const rows = [];
  // The night before ended at a stop in town; the cat walks home from it.
  const last = day.nightStop(day.day - 1);
  let home = 0;
  if (last) {
    const m = Math.max(5, Math.ceil(day.leg(last.id, r.home)));
    const arrive = Math.max(120 + 5 * pick(r.id + ':home:' + day.day, 13), m + 10);
    rows.push([0, arrive - m, 'LEISURE', '@' + last.id, 'patrol-turf', ghost], [arrive - m, arrive, 'COMMUTE', 'STREET', 'commute']);
    home = arrive;
  }
  rows.push(nest(home, 630, 'SLEEPING', 'nest-sleep'), nest(630, 700, 'LEISURE', 'sunbathe'), nest(700, 780, 'SLEEPING', 'doze'));
  const memo = { visited: new Set(), stops: 0 };
  // A short outing in the afternoon, back for a nap.
  const noon = day.trail({ start: 780, final: { place: r.home, by: 1000 }, maxStops: 4, daytime: true, memo, stay: [15, 30] });
  rows.push(...noon.rows);
  const rest = Math.max(noon.at, 1000);
  rows.push(nest(noon.at, rest + 20, 'SLEEPING', 'doze'));
  // The vendors' feeding hour, then a long prowl and a stop for the night.
  const feed = arrive => {
    const from = Math.max(1140, arrive);
    return { rows: [[arrive, from + 30, 'LEISURE', '@' + market, 'beg-food', ghost], [from + 30, from + 85, 'DINING', '@' + market, 'fed', ghost]], end: from + 85 };
  };
  const stop = day.nightStop(day.day);
  const evening = day.trail({
    start: rest + 20, targets: [{ place: market, by: 1140, block: feed }], maxStops: 10, daytime: false, memo,
    final: stop ? { place: stop.id, by: 1400, block: arrive => ({ rows: [[arrive, 1440, 'LEISURE', '@' + stop.id, 'patrol-turf', ghost]], end: 1440 }) } : { place: r.home, by: 1400 }
  });
  rows.push(...evening.rows);
  if (!stop) rows.push(nest(evening.at, 1440, 'SLEEPING', 'nest-sleep'));
  return rows;
}

function dog(r, day) {
  const retirees = day.parkNear;                    // where the retirees do their morning exercise, nearest the nest
  // Where the children are when school lets out: the school gate, the amusement park or the plaza, in turn.
  const spot = [['primary', 960], ['amusement', 960], ['plaza', 960], ['secondary', 1020], ['amusement', 960], ['primary', 960], ['plaza', 960]][((day.day - 1) % 7 + 7) % 7];
  const school = day.firstOf(spot[0]);
  const leave = Math.max(300, 390 - day.walkMinutes(retirees));
  const breakfast = arrive => ({ rows: [[arrive, arrive + 45, 'LEISURE', '@' + retirees, 'beg-food', ghost], [arrive + 45, arrive + 90, 'DINING', '@' + retirees, 'fed', ghost]], end: arrive + 90 });
  const kids = arrive => {
    const from = Math.max(spot[1], arrive);
    return { rows: [[arrive, from + 50, 'LEISURE', '@' + school, 'play-kids', ghost]], end: from + 50 };
  };
  const rows = [nest(0, 300, 'SLEEPING', 'nest-sleep'), nest(300, leave, 'LEISURE', 'sunbathe')];
  const { rows: trail, at } = day.trail({
    start: leave, maxStops: 10, stay: [15, 45], final: { place: r.home, by: 1290 },
    targets: [{ place: retirees, by: 390, block: breakfast }, { place: school, by: spot[1], block: kids }]
  });
  rows.push(...trail, nest(at, Math.max(at + 10, 1320), 'LEISURE', 'sunbathe'), nest(Math.max(at + 10, 1320), 1440, 'SLEEPING', 'nest-sleep'));
  return rows;
}
