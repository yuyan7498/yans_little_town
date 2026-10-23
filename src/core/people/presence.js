// Who is where at a moment, and what that does to the buildings' lights.

import { hash } from '../random.js';
import { STREET, indexAt } from './timeline.js';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
// Activities that keep a building only dimly lit (a guard minding it).
const DUTY = new Set(['duty', 'security', 'night-duty', 'handover']);

export function createPresence({ world, residents, planner, places }) {
  const dwellers = new Map();
  for (const r of residents) if (r.role !== 'patient') dwellers.set(r.home, (dwellers.get(r.home) || 0) + 1);
  const animals = new Set(residents.filter(r => r.role === 'stray').map(r => r.id));
  const isAnimal = id => animals.has(id);
  let lastKey = null, last = null, lastLight = null, lastLightKey = null;

  function occupancy(day, minute) {
    const m = Math.max(0, Math.min(1439, Math.floor(minute)));
    const key = day + ':' + m;
    if (key === lastKey) return last;
    const byPlace = {}, street = [];
    for (const [id, plan] of planner.plansFor(day)) {
      const seg = plan.segments[indexAt(plan.segments, m)];
      if (seg.place === STREET) { street.push(id); continue; }
      if (isAnimal(id)) continue;                 // animals are outdoors: never counted in a building
      const here = byPlace[seg.place] || (byPlace[seg.place] = { present: [], awake: 0, working: 0, duty: 0, visitors: 0 });
      here.present.push(id);
      if (seg.state !== 'SLEEPING') here.awake++;
      if (seg.state === 'AT_WORK') here.working++;
      else if (seg.state !== 'SLEEPING' && seg.state !== 'HOME') here.visitors++;
      if (DUTY.has(seg.activity) && seg.state === 'AT_WORK') here.duty++;
    }
    last = { byPlace, street };
    lastKey = key;
    return last;
  }

  function lighting(day, minute) {
    const m = Math.max(0, Math.min(1439, Math.floor(minute)));
    const key = day + ':' + m;
    if (key === lastLightKey) return lastLight;
    const { byPlace } = occupancy(day, m);
    const buildings = {};
    for (const site of world.siteList) {
      const here = byPlace[site.id];
      const awake = here ? here.awake : 0;
      const housing = site.kind === 'housing';
      let windows, entry, sign;
      if (housing) {
        const ratio = awake / Math.max(1, dwellers.get(site.id) || site.capacity);
        // A few windows stay lit all night: somebody up late.
        const late = hash(site.id + ':' + Math.floor(m / 20)) % 100 < 6 ? 0.05 : 0.015;
        windows = awake ? clamp(0.1 + ratio * 1.15) : late;
        entry = awake ? 0.6 : 0.15;
        sign = 0;
      } else {
        const hours = places.hoursOn(site.id, day);
        const open = !hours || (m >= hours[0] && m < hours[1]);
        const ratio = awake / Math.max(1, site.capacity);
        const onlyDuty = here && here.awake > 0 && here.duty === here.awake;
        windows = !awake ? 0 : onlyDuty ? 0.08 : clamp(0.14 + ratio * 1.7);
        if (site.kind === 'night-market') windows = open ? 1 : 0;
        entry = awake ? (open ? 1 : 0.6) : open ? 0.5 : 0.1;
        sign = open && (awake || site.kind === 'night-market') ? 1 : awake ? 0.5 : 0.1;
      }
      // Visitors: people there who are not staff (the cars at the pumps of a gas station).
      buildings[site.id] = { windows, entry, sign, visitors: here ? here.visitors : 0 };
    }
    lastLight = { buildings };
    lastLightKey = key;
    return lastLight;
  }

  const invalidate = () => { lastKey = null; lastLightKey = null; };
  return { occupancy, lighting, invalidate };
}
