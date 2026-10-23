// Places as the plans see them: sites by kind, opening hours for visitors, how far
// apart two places are and how long a trip between them is given, and the place
// tokens of the day templates resolved against a resident and the world.
//
// Tokens: HOME WORK STREET (the resident's own places), DUTY (weekend duty post),
// POST (an officer's gate post), RIVERSIDE (the night-market strip, for the crew that
// cleans it), INSPECTION (the mayor's round), BENCH (the circle's bench), HANGOUT,
// EXERCISE (where to do morning exercise), CLINIC, and venues looked up by kind:
// MALL ANNEX_MALL MARKET NIGHT_MARKET BANK CIVIC AMUSEMENT PLAZA PARK OUTDOOR LIBRARY
// SPORTS HOSPITAL STATION ZOO CINEMA TEMPLE AIRPORT GAS.

import { pick } from './mix.js';
import { VISITOR_HOURS, TRAVEL } from './rules.js';
import { toMinute, STREET } from './timeline.js';

const mod = (v, n) => ((v % n) + n) % n;
export const dowOf = day => mod(day - 1, 7);
export const weekOf = day => Math.floor((day - 1) / 7);

// Venue tokens: the site kinds to look in, preferred first; later kinds are where a
// visit goes when the first is full or shut. `near`: prefer the closest to home.
const VENUES = {
  MALL: ['mall', 'annex-mall'],
  ANNEX_MALL: ['annex-mall', 'mall'],
  MARKET: ['market', 'mall'],
  NIGHT_MARKET: ['night-market', 'mall', 'annex-mall'],
  AMUSEMENT: ['amusement', 'plaza', 'mall'],
  PLAZA: ['plaza', 'park'],
  PARK: ['park', 'plaza'],
  OUTDOOR: ['plaza', 'park'],
  LIBRARY: ['library'],
  SPORTS: ['sports', 'park'],
  BANK: ['bank'],
  CIVIC: ['civic'],
  HOSPITAL: ['hospital'],
  STATION: ['station'],
  ZOO: ['zoo', 'amusement', 'park'],
  CINEMA: ['cinema', 'mall'],
  TEMPLE: ['temple', 'plaza'],
  AIRPORT: ['airport', 'plaza'],
  GAS: ['gas']
};
const NEAREST = new Set(['PARK', 'OUTDOOR', 'SPORTS']);
// Share of outings to a park or plaza that go to the second nearest one.
const SECOND_NEAREST = 0.35;
const OUTDOOR_KINDS = new Set(['plaza', 'park', 'sports']);
// The token for a hangout of each kind (where to find a stand-in).
const TOKEN_OF_KIND = { mall: 'MALL', 'annex-mall': 'ANNEX_MALL', market: 'MARKET', 'night-market': 'NIGHT_MARKET', amusement: 'AMUSEMENT',
  plaza: 'PLAZA', park: 'PARK', library: 'LIBRARY', sports: 'SPORTS', zoo: 'ZOO', cinema: 'CINEMA', temple: 'TEMPLE', airport: 'AIRPORT' };

export function createPlaces(world) {
  const byKind = new Map();
  for (const s of world.siteList) {
    if (!byKind.has(s.kind)) byKind.set(s.kind, []);
    byKind.get(s.kind).push(s);
  }
  const spots = new Map();
  const positions = new Map();
  const doorPos = new Map();

  const site = id => world.site(id);
  const ofKind = kind => byKind.get(kind) || [];
  const firstOf = kind => (byKind.get(kind) || [])[0]?.id || null;

  function position(id) {
    if (positions.has(id)) return positions.get(id);
    const s = world.site(id);
    let p = null;
    if (s) p = s.door ? { x: s.door.x, z: s.door.z } : { x: s.footprint.x, z: s.footprint.z };
    else if (spots.has(id)) p = { x: spots.get(id).x, z: spots.get(id).z };
    positions.set(id, p);
    return p;
  }
  // Walking distance, roughly: along the streets, so Manhattan.
  function distance(a, b) {
    const p = position(a), q = position(b);
    if (!p || !q) return 0;
    return Math.abs(p.x - q.x) + Math.abs(p.z - q.z);
  }
  // Minutes a trip between two places is given at least.
  function travel(a, b) {
    if (!a || !b || a === STREET || b === STREET || a === b) return TRAVEL.min;
    const m = Math.round(TRAVEL.base + distance(a, b) / TRAVEL.unitsPerMinute);
    return Math.max(TRAVEL.min, Math.min(TRAVEL.max, m));
  }

  // Visitor hours on a day: [open, close), or null when the place is shut all day.
  function hoursOn(id, day) {
    const s = world.site(id);
    if (!s) return spots.has(id) ? [0, 1440] : null;
    const dw = dowOf(day);
    if (s.open === 'weekday' && dw >= 5) return null;
    if (s.open === 'sat-am' && dw === 6) return null;
    let open = 0, close = 1440;
    if (s.hours) { open = s.hours.open ?? 0; close = s.hours.close ?? 1440; }
    else if (VISITOR_HOURS[s.kind]) [open, close] = VISITOR_HOURS[s.kind].map(toMinute);
    if (s.open === 'sat-am' && dw === 5 && s.hours && s.hours.saturdayClose != null) close = s.hours.saturdayClose;
    return [open, close];
  }
  const shutOn = (id, day) => world.site(id) ? hoursOn(id, day) === null : false;
  function openDuring(id, day, start, end) {
    const h = hoursOn(id, day);
    return !!h && start >= h[0] && end <= h[1];
  }

  // Sites for a venue token, preferred first, for someone living at `home`.
  // Two sites of the same kind (the parks) are tried nearest first; `spread` (0..1)
  // sends some people to the second nearest so one park is not everyone's.
  function venueList(token, home, spread = 0) {
    const kinds = VENUES[token];
    if (!kinds) return [];
    const near = (a, b) => distance(home, a) - distance(home, b);
    // OUTDOOR takes plazas and parks alike; other tokens prefer their first kind.
    const groups = token === 'OUTDOOR' ? [kinds.flatMap(k => ofKind(k).map(s => s.id))] : kinds.map(k => ofKind(k).map(s => s.id));
    const out = [];
    groups.forEach((ids, g) => {
      const list = [...ids];
      if (list.length > 1) list.sort(near);
      if (g === 0 && list.length > 1 && NEAREST.has(token) && spread > 1 - SECOND_NEAREST) list.unshift(list.splice(1, 1)[0]);
      for (const id of list) if (!out.includes(id)) out.push(id);
    });
    return out;
  }

  // Resolve a segment's token for resident r on day context d. Sets place, and for
  // visits: visit, alt (alternatives, preferred first) and the hours [lo, hi].
  function resolve(seg, r, d) {
    const token = seg.token;
    if (token[0] === '@') { seg.place = token.slice(1); seg.visit = true; seg.alt = seg.firm ? null : (seg.alt || [seg.place]); return hoursOf(seg, d); }
    const staff = place => { seg.place = place || null; seg.visit = false; seg.alt = null; };
    switch (token) {
      case 'HOME': return staff(r.home);
      case 'WORK': return staff(r.work);
      case 'STREET': return staff(STREET);
      case 'DUTY': return staff(d.duty ? d.duty.place : r.work);
      case 'POST': return staff(r.dutyPost || r.work);
      case 'RIVERSIDE': return staff(firstOf('night-market') || r.work);
      case 'INSPECTION': return staff(d.inspection);
      case 'BENCH': if (d.bench) return staff(d.bench); return visit(r.hangout ? [r.hangout, ...venueList(TOKEN_OF_KIND[site(r.hangout)?.kind] || 'OUTDOOR', r.home)] : venueList('OUTDOOR', r.home));
      case 'CLINIC': return visit(r.clinic ? [r.clinic] : venueList('HOSPITAL', r.home));
      case 'HANGOUT': {
        if (!r.hangout || !site(r.hangout)) return visit(venueList('OUTDOOR', r.home, d.spread(token)));
        return visit([r.hangout, ...venueList(TOKEN_OF_KIND[site(r.hangout).kind] || 'OUTDOOR', r.home)]);
      }
      case 'EXERCISE': {
        const h = r.hangout && site(r.hangout);
        if (h && OUTDOOR_KINDS.has(h.kind)) return visit([h.id, ...venueList('OUTDOOR', r.home)]);
        return visit(venueList('OUTDOOR', r.home, d.spread(token)));
      }
      default:
        if (VENUES[token]) return visit(venueList(token, r.home, d.spread(token)));
        throw new Error(`不認得的地點代號 ${token}`);
    }
    function visit(list) {
      const places = [...new Set(list.filter(Boolean))];
      seg.place = places[0] || null;
      seg.visit = true;
      seg.alt = seg.firm ? null : places;
      hoursOf(seg, d);
    }
    function hoursOf(seg, d) {
      const h = seg.place ? hoursOn(seg.place, d.day) : null;
      seg.shut = !h;
      seg.lo = h ? h[0] : 0;
      seg.hi = h ? h[1] : 1440;
    }
  }

  function addSpots(list) {
    spots.clear(); positions.clear();
    for (const s of list || []) spots.set(s.id, s);
  }

  return { site, ofKind, firstOf, position, distance, travel, hoursOn, shutOn, openDuring, venueList, resolve, addSpots, spots, doorPos };
}
