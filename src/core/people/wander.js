// A stray's wander: a different trail across the whole town every day, built from stops
// drawn deterministically per (animal, day). A stop is a bench or chess spot, or the front
// of a building (a site id: the street layer rests an animal at its door approach,
// outdoors, never inside). Consecutive stops are 60–200 units apart so the animal really
// travels, and each day leans toward a few districts of a 4 x 8 grid over the board,
// rotating so that a week covers all of them.
//
// How long a hop takes comes from `leg(from, to)` (the street layer's estimate for an
// animal's walk when there is one, else distance over a pace).

import { hash, pick, unit } from './mix.js';

const COLS = 4, ROWS = 8;
const FAR = [60, 200];         // distance between consecutive stops
const NO_STOPS = new Set(['primary', 'secondary', 'university']);   // schools are visited at their own times
const FOOD = new Set(['mall', 'annex-mall', 'market', 'night-market']);
const FEATURED_PER_DAY = 5;

export function createWander({ world, places }) {
  let pool = null;
  const board = world.board;

  const cellOf = p => {
    const cx = Math.max(0, Math.min(COLS - 1, Math.floor(((p.x - board.minX) / (board.maxX - board.minX)) * COLS)));
    const cz = Math.max(0, Math.min(ROWS - 1, Math.floor(((p.z - board.minZ) / (board.maxZ - board.minZ)) * ROWS)));
    return cz * COLS + cx;
  };
  const centreOf = cell => ({
    x: board.minX + (((cell % COLS) + 0.5) / COLS) * (board.maxX - board.minX),
    z: board.minZ + ((Math.floor(cell / COLS) + 0.5) / ROWS) * (board.maxZ - board.minZ)
  });
  const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);

  function build() {
    pool = [];
    for (const s of world.siteList) {
      if (NO_STOPS.has(s.kind)) continue;
      const p = places.position(s.id);
      if (p) pool.push({ id: s.id, kind: s.kind, x: p.x, z: p.z, cell: cellOf(p) });
    }
    for (const sp of places.spots.values()) if (sp.kind === 'bench' || sp.kind === 'chess') pool.push({ id: sp.id, kind: sp.kind, x: sp.x, z: sp.z, cell: cellOf(sp) });
  }
  const invalidate = () => { pool = null; };
  const ensure = () => { if (!pool) build(); return pool; };

  // The districts an animal leans toward on a day: a rotation through all 32 cells.
  function featured(id, day) {
    const order = Array.from({ length: COLS * ROWS }, (_, i) => i).sort((a, b) => hash(id + ':cell:' + a) - hash(id + ':cell:' + b));
    const first = ((((day - 1) * FEATURED_PER_DAY) % order.length) + order.length) % order.length;
    return Array.from({ length: FEATURED_PER_DAY }, (_, i) => order[(first + i) % order.length]);
  }

  // Where the night's last stop is (the cat stays out past midnight): a stop in the day's
  // first district, near enough that the way home takes at most `within` minutes.
  function nightStop({ id, day, nest, nestPos, leg, within = 175 }) {
    ensure();
    // The night stop swings round the town: east middle, north and south edges, in turn.
    const ORDER = [3 * COLS + 3, 2, 7 * COLS + 3, 3, 7 * COLS, 3 * COLS + 1, 1, 7 * COLS + 1, 3 * COLS + 2, 0, 7 * COLS + 2, 3 * COLS];
    const goal = centreOf(ORDER[(((day - 1) % ORDER.length) + ORDER.length) % ORDER.length]);
    let best = null, bestScore = Infinity;
    for (const c of pool) {
      if (c.kind === 'night-market' || dist(c, nestPos) < 80) continue;
      const score = dist(c, goal) + 40 * unit(id + ':night:' + day + ':' + c.id);
      if (score >= bestScore) continue;
      if (leg(c.id, nest) > within) continue;
      bestScore = score; best = c;
    }
    return best;
  }

  // The trail: `start` minute at `from`, then through free stops and the fixed `targets`
  // ({ place, by, block(arrive) → { rows, end } }) in order, ending at `final`
  // ({ place, by, block? }) — the nest unless said otherwise. `memo` ({ visited, stops })
  // carries the day's stops across several trails. Returns { rows, at }.
  function trail({ id, day, start, from, targets = [], final, leg, maxStops = 8, daytime = true, memo, stay = [15, 60] }) {
    ensure();
    const rows = [];
    memo = memo || { visited: new Set(), stops: 0 };
    let t = start, here = from.pos, hereId = from.id;
    const posOf = pid => from.id === pid ? from.pos : pool.find(c => c.id === pid) || places.position(pid) || from.pos;
    const minutes = (aId, bId) => Math.max(5, Math.ceil(leg(aId, bId)));
    const walkTo = (pid, p) => { const m = minutes(hereId, pid); rows.push([t, t + m, 'COMMUTE', 'STREET', 'commute']); t += m; here = p; hereId = pid; };
    const cells = featured(id, day), centres = cells.map(centreOf);
    let fi = 0;
    for (const target of [...targets, final]) {
      const tp = posOf(target.place);
      while (memo.stops < maxStops) {
        const eat = stay[0] + 5 * pick(id + ':stay:' + day + ':' + memo.stops, Math.floor((stay[1] - stay[0]) / 5) + 1);
        const goal = centres[fi % centres.length];
        let best = null, bestScore = Infinity;
        for (const c of pool) {
          if (memo.visited.has(c.id) || c.id === hereId) continue;
          const d = dist(here, c);
          if (d < FAR[0] || d > FAR[1]) continue;
          const score = dist(c, goal) / 150 + 0.3 * unit(id + ':stop:' + day + ':' + memo.stops + ':' + c.id) + 0.3 * (d - FAR[0]) / (FAR[1] - FAR[0]);
          if (score >= bestScore) continue;
          // Within reach of the next anchor, with time to spare (or at least nearer to it).
          if (dist(c, tp) > Math.max(220, (target.by - t - eat) * 1.6) && dist(c, tp) > dist(here, tp) - 60) continue;
          if (t + minutes(hereId, c.id) + eat + minutes(c.id, target.place) > target.by) continue;
          bestScore = score; best = c;
        }
        if (!best) break;
        walkTo(best.id, best);
        stopRows(rows, t, eat, best, id, day, memo.stops, daytime && t < 1080 && t >= 330);
        t += eat;
        memo.visited.add(best.id);
        if (best.cell === cells[fi % cells.length]) fi++;
        memo.stops++;
      }
      if (target.place !== hereId) walkTo(target.place, tp);
      if (target.block) { const b = target.block(t); rows.push(...b.rows); t = b.end; }
    }
    return { rows, at: t, memo };
  }

  // What the animal does at a stop.
  function stopRows(rows, t, len, c, id, day, i, daylight) {
    const key = id + ':act:' + day + ':' + i;
    const at = '@' + c.id, opt = { firm: true, ghost: true };
    if (FOOD.has(c.kind)) {
      const beg = Math.max(10, Math.floor(len / 2));
      rows.push([t, t + beg, 'LEISURE', at, 'beg-food', opt]);
      if (len - beg >= 5) rows.push([t + beg, t + len, pick(key, 3) ? 'DINING' : 'LEISURE', at, pick(key, 3) ? 'fed' : 'beg-food', opt]);
      return;
    }
    if (c.kind === 'bench' || c.kind === 'chess' || c.kind === 'park' || c.kind === 'plaza' || c.kind === 'sports') {
      const list = daylight ? [['LEISURE', 'sunbathe'], ['SLEEPING', 'doze'], ['LEISURE', 'patrol-turf']] : [['LEISURE', 'patrol-turf'], ['LEISURE', 'wait-door']];
      const [state, activity] = list[pick(key, list.length)];
      rows.push([t, t + len, state, at, activity, opt]);
      return;
    }
    if (c.kind === 'amusement') { rows.push([t, t + len, 'LEISURE', at, 'play-kids', opt]); return; }
    const list = [['LEISURE', 'wait-door'], ['LEISURE', 'patrol-turf'], ['LEISURE', 'sunbathe']];
    const [state, activity] = list[pick(key, daylight ? 3 : 2)];
    rows.push([t, t + len, state, at, activity, opt]);
  }

  return { trail, nightStop, invalidate, cellOf, featured, pool: ensure };
}
