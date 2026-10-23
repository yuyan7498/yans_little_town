// Spreading the town over its venues. Every visit names a preferred place and a list
// of others (`alt`); after everyone's day is laid out, visits are settled in order of
// their start, each party moving as one, to the first place on its list that has room
// for the whole stay. Staff, residents at home and visits that cannot move count as
// the load already there.

import { hash } from '../random.js';
import { isRun } from './timeline.js';
import { NIGHT } from './rules.js';

const BUCKET = 5;
const BUCKETS = 1440 / BUCKET;

export function settleVisits(plans, { places, world, day }) {
  const load = new Map();
  const loadOf = id => {
    let a = load.get(id);
    if (!a) { a = new Uint16Array(BUCKETS + 1); load.set(id, a); }
    return a;
  };
  const span = s => [Math.floor(s.start / BUCKET), Math.ceil(s.end / BUCKET)];
  const add = (id, s, n) => { const a = loadOf(id), [x, y] = span(s); for (let i = x; i < y; i++) a[i] += n; };
  const peak = (id, s) => { const a = loadOf(id), [x, y] = span(s); let m = 0; for (let i = x; i < y; i++) if (a[i] > m) m = a[i]; return m; };

  // The movable visits, grouped into parties.
  const units = new Map();
  for (const { id, segs } of plans) {
    for (const s of segs) {
      if (isRun(s) || s.ghost) continue;      // animals are not counted
      if (s.visit && !s.firm && s.alt && s.alt.length > 1) {
        const key = (s.party || id) + '|' + s.start + '|' + s.end;
        if (!units.has(key)) units.set(key, []);
        units.get(key).push(s);
      } else if (s.place) add(s.place, s, 1);
    }
  }
  const ordered = [...units.entries()].sort((a, b) => a[1][0].start - b[1][0].start || hash(a[0]) - hash(b[0]));
  const crowded = [];
  for (const [, unit] of ordered) {
    const lead = unit[0], n = unit.length;
    const options = lead.alt.filter(id => places.openDuring(id, day, lead.start, lead.end));
    if (!options.length) options.push(lead.place);
    let chosen = null, best = Infinity, bestOver = Infinity;
    for (const id of options) {
      const site = world.site(id);
      const cap = site ? site.capacity * (site.kind === 'night-market' ? NIGHT.overflow : 1) : Infinity;
      const over = peak(id, lead) + n - cap;
      if (over <= 0) { chosen = id; break; }
      if (over < bestOver) { bestOver = over; best = id; }
    }
    if (!chosen) { chosen = best; crowded.push(chosen); }
    for (const s of unit) s.place = chosen;
    add(chosen, lead, n);
  }
  return crowded;
}
