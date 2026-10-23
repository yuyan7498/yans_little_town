// Retirees and seniors: morning exercise, market runs, clinic check-ups, the pension at
// lunchtime, board games, a walk round the block, square-dancing after supper — and
// whatever their circle, a grandchild's school gate or a stroller walk agreed
// (`day.shared`, which comes first). Seniors are quieter than retirees.

import { SHARE } from '../rules.js';
import { LOOP, trip, homeDay } from './rows.js';
import { REFUEL } from './work.js';

const out = (leave, arrive, back, home, state, token, activity) => trip({ leave, arrive, back, home, state, token, activity });

// An errand to the nearest suitable venue by travel time, arriving at `arrive` for `stay`
// minutes. An outing whose round trip would be more than ~40% of the whole outing is
// dropped (a short errand is not worth a long ride). Without an estimator: the plain
// token with the usual walk.
const OVERHEAD = 0.4;
function errand(day, token, arrive, stay, state, activity) {
  const venues = day.venues(token);
  if (!venues) return out(arrive - 20, arrive, arrive + stay, arrive + stay + 20, state, token, activity);
  const ok = venues.filter(v => 2 * v.n <= OVERHEAD * (stay + 2 * v.n));
  if (!ok.length) return null;
  const n = ok[0].n;
  return trip({ leave: arrive - n, arrive, back: arrive + stay, home: arrive + stay + n, state, token: '@' + ok[0].place, activity, options: { alt: ok.map(v => v.place) } });
}

export function elder(r, day) {
  const senior = r.kind === 'senior';
  const S = senior ? SHARE.senior : SHARE.retiree;
  const outings = [...day.shared];
  const weekday = !day.weekend;

  if (day.has('exercise', S.exercise)) outings.push(errand(day, 'EXERCISE', 410, 60, 'LEISURE', 'morning-exercise'));
  if (day.has('market', S.market) && [1, 3, 5].includes(day.dow)) {
    const o = day.lasting('market-time', [-120, -90, -60, -30, 0, 30, 60, 90]);
    outings.push(errand(day, 'MARKET', 575 + o, 60, 'SHOPPING', 'grocery'));
  }
  else if (weekday && day.has('check-up', S.checkUp) && day.onDays('check-up', 1, 5)) outings.push(errand(day, 'CLINIC', 590, 60, 'MEDICAL', 'check-up'));
  else if (day.has('stroller', S.stroller) && day.alternate('stroller')) {
    outings.push({ leave: 570, home: 630, rows: [[570, 630, 'LEISURE', 'STREET', 'stroll', LOOP]] });
  }
  // Worship at the temple on a couple of mornings a week: worth the ride however far.
  if (day.has('temple', senior ? SHARE.temple.senior : SHARE.temple.retiree) && day.onDays('temple', SHARE.temple.days)) outings.push(out(550, 580, 630, 660, 'LEISURE', 'TEMPLE', 'worship'));
  if (weekday && day.has('pension', S.pension) && day.onDays('pension', 1, 5)) outings.push(errand(day, 'BANK', 735, 30, 'SHOPPING', 'pension'));
  if (day.refuel) outings.push(out(620, 640, 640 + REFUEL, 660 + REFUEL, 'SHOPPING', 'GAS', 'refuel'));
  if (senior ? day.has('hangout-out', S.hangout) : day.has('board-games', S.boardGames)) {
    outings.push(errand(day, 'HANGOUT', 880, 120, 'LEISURE', senior ? 'hang-out' : 'board-games'));
  }
  if (day.has('square-dance', S.squareDance) && day.onDays('square-dance', 3)) outings.push(errand(day, 'PLAZA', 1165, 80, 'LEISURE', 'square-dance'));

  return homeDay({
    wake: senior ? '06:20' : '06:00', bed: senior ? '21:45' : '22:15',
    meals: [[['08:15', '08:45'], 'breakfast'], [['12:30', '13:15'], 'lunch-home'], [['17:45', '18:30'], 'supper']],
    idle: at => (at < 780 ? 'leisure' : at >= 1080 ? 'tv' : 'leisure')
  }, outings);
}
