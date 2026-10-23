// Time spent together. Every plan is worked out for one person, so whatever several
// people do at the same minutes is agreed here first, from the household, the circle or
// the friend group and the day alone: everyone who takes part is handed the very same
// outing (same minutes, same place, a shared `party` id), and their own day is laid
// around it (see schedules/rows.js homeDay and evening).
//
//   family day    weekends: the kids and the free parents out together, now and then supper at the night market
//   couple day    two adults both off, neither on nights: an afternoon out or supper out
//   stroller      a preschooler with a free grown-up of the household, or a grandparent, in the afternoon
//   pick-up       a grandparent at the school gate before the bell, home with the pupil (after-school and all)
//   circle        old friends on their own bench, two sittings a day, five afternoons a week
//   friends       Friday supper, two Fridays in three
//
// Retired couples go further: they keep one plan (the lower id's), see plans.js.

import { unit, pick } from './mix.js';
import { SHARE, CIRCLES, TRAVEL } from './rules.js';
import { trip } from './schedules/rows.js';
import { afterSchoolRows, staysOutAfterSchool } from './schedules/students.js';
import { toMinute } from './timeline.js';
import { BELL, HANDOVER, walkToSchool, dropOffStay, pickUpStay, walkHome } from './schedules/kinder.js';

const ELDERS = new Set(['retiree', 'senior']);
const FAMILY_VENUES = [
  ['AMUSEMENT', 'LEISURE', 'family-fun'], ['MALL', 'SHOPPING', 'family-shopping'], ['PARK', 'LEISURE', 'family-picnic'],
  ['ANNEX_MALL', 'SHOPPING', 'family-shopping'], ['PLAZA', 'LEISURE', 'family-picnic'], ['ZOO', 'LEISURE', 'family-zoo'], ['ZOO', 'LEISURE', 'family-zoo'],
  ['CINEMA', 'LEISURE', 'family-movie'], ['AIRPORT', 'LEISURE', 'plane-spotting']
];
const COUPLE_VENUES = [['OUTDOOR', 'LEISURE', 'couple-time'], ['MALL', 'SHOPPING', 'couple-time'], ['PLAZA', 'LEISURE', 'couple-time'], ['ANNEX_MALL', 'SHOPPING', 'couple-time'],
  ['CINEMA', 'LEISURE', 'movie-date'], ['ZOO', 'LEISURE', 'couple-time']];
const NO_DINNER = new Set(['preschooler', 'student-p', 'patient']);

export function createTogether({ byId, rel, week, places, travel = null }) {
  // Minutes the slowest of these people needs to get from their home to a place (or the
  // fallback when there is no estimator), so a shared outing leaves early enough for all.
  function walk(ids, place, fallback) {
    if (!travel) return fallback;
    let m = 0;
    for (const id of ids) { const v = travel(id, byId.get(id).home, place); m = Math.max(m, Number.isFinite(v) ? v : fallback); }
    return Math.max(TRAVEL.min, Math.ceil(m) + TRAVEL.margin);
  }
  // Lazily: the estimator may not exist yet when assignSpots runs.
  const walkOf = (ids, spot) => (travel ? walk(ids, spot, 0) : Math.max(...ids.map(id => places.travel(byId.get(id).home, spot))));
  // A trip whose two walks are sized for the party.
  function outingTo(ids, place, arrive, back, rest) {
    const n = walk(ids, place, toMinute(arrive) - toMinute(rest.leave));
    return trip({ ...rest, leave: toMinute(arrive) - n, arrive, back, home: toMinute(back) + n });
  }
  // Circles of old friends: which bench and which sitting (0 or 1).
  const benchOf = new Map();
  const walkTo = new Map();

  // Give each circle the nearest bench with enough seats, two circles to a bench.
  function assignSpots(spots, doorOf) {
    benchOf.clear(); walkTo.clear();
    places.addSpots(spots);
    const benches = (spots || []).filter(s => s.kind === 'bench');
    const load = new Map();
    const homeDoor = id => { try { return doorOf(id, 'bench') || places.position(id); } catch { return places.position(id); } };
    rel.circles.forEach((members, index) => {
      const homes = members.map(id => byId.get(id).home);
      const at = homeDoor(homes[0]);
      if (!at || !benches.length) return;
      const dist = s => Math.hypot(s.x - at.x, s.z - at.z);
      const usable = benches.filter(s => (load.get(s.id) || 0) < CIRCLES.perBench)
        .sort((a, b) => (b.seats.length >= members.length) - (a.seats.length >= members.length) || dist(a) - dist(b));
      const spot = usable.find(s => s.seats.length >= members.length && dist(s) <= CIRCLES.radius) || usable.find(s => dist(s) <= CIRCLES.radius) || usable[0];
      if (!spot) return;
      benchOf.set(index, { spot, sitting: load.get(spot.id) || 0 });
      load.set(spot.id, (load.get(spot.id) || 0) + 1);
      walkTo.set(index, null);
    });
  }

  function forDay(day) {
    const cache = new Map();
    const once = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
    const free = r => week.freeAllDay(r, day);
    const placeFor = (token, home, key) => {
      const list = places.venueList(token, home, unit(key));
      return { place: list[0], alt: list };
    };
    const night = r => r.shift === 'night' || r.kind === 'office-night';
    // Retired couples keep one plan, the lower id's: whoever is asked to do something for the
    // family should be the one whose plan is used.
    const leader = r => {
      const p = r && r.partner && byId.get(r.partner);
      return p && ELDERS.has(r.kind) && ELDERS.has(p.kind) && p.home === r.home && r.id > p.id ? p : r;
    };

    // The outing a household takes together on a weekend (or any day the kids are free).
    function family(h) {
      return once('family:' + h.id, () => {
        const people = h.members.map(id => byId.get(id));
        const kids = people.filter(r => h.kids.includes(r.id));
        if (!kids.length) return null;
        // Everyone under 18 must be free, and at least one parent.
        if (kids.some(k => k.age < 18 && (week.worksOn(k, day) || k.kind === 'patient'))) return null;
        const adults = people.filter(r => h.adults.includes(r.id) && free(r) && !night(r));
        if (!adults.length || unit(h.id + ':family:' + day) >= SHARE.family.out) return null;
        const party = 'family:' + h.id;
        const members = new Set([...kids.filter(k => k.kind !== 'patient').map(k => k.id), ...adults.map(a => a.id)]);
        const [token, state, activity] = FAMILY_VENUES[pick(h.id + ':family-place:' + day, FAMILY_VENUES.length)];
        const { place, alt } = placeFor(token, h.home, h.id + ':family-venue:' + day);
        if (!place) return null;
        const morning = unit(h.id + ':family-slot:' + day) < 0.35;
        const times = morning ? ['09:20', '09:50', '11:50', '12:20'] : ['13:50', '14:20', '16:50', '17:20'];
        const outing = outingTo(members, place, times[1], times[2], { leave: times[0], state, token: '@' + place, activity, options: { alt }, party });
        let dinner = null;
        if (unit(h.id + ':family-dinner:' + day) < SHARE.family.nightMarket) {
          const m = placeFor('NIGHT_MARKET', h.home, h.id + ':family-dinner-venue:' + day);
          dinner = outingTo(members, m.place, '18:55', '20:35', { leave: '18:30', state: 'DINING', token: '@' + m.place, activity: 'family-dinner', options: { alt: m.alt }, party: party + ':dinner' });
        }
        return { members, outing, dinner };
      });
    }

    // Two adults both off: an afternoon out or supper out, kids at least twelve.
    function couple(h) {
      return once('couple:' + h.id, () => {
        if (h.kind === 'flat' || h.adults.length !== 2) return null;
        const adults = h.adults.map(id => byId.get(id));
        if (adults.some(a => ELDERS.has(a.kind) || !free(a) || night(a))) return null;
        if (h.kids.some(id => byId.get(id).age < 12) || family(h)) return null;
        if (unit(h.id + ':couple:' + day) >= SHARE.couple.out) return null;
        const party = 'couple:' + h.id;
        const members = new Set(h.adults);
        if (unit(h.id + ':couple-dinner:' + day) < SHARE.couple.nightMarket) {
          const m = placeFor('NIGHT_MARKET', h.home, h.id + ':couple-dinner-venue:' + day);
          return { members, dinner: outingTo(members, m.place, '18:55', '20:25', { leave: '18:30', state: 'DINING', token: '@' + m.place, activity: 'night-snack', options: { alt: m.alt }, party }) };
        }
        const [token, state, activity] = COUPLE_VENUES[pick(h.id + ':couple-place:' + day, COUPLE_VENUES.length)];
        const { place, alt } = placeFor(token, h.home, h.id + ':couple-venue:' + day);
        if (!place) return null;
        return { members, outing: outingTo(members, place, '14:30', '16:30', { leave: '14:00', state, token: '@' + place, activity, options: { alt }, party }) };
      });
    }

    // A preschooler's stroller walk: with a free grown-up of the house, else a grandparent.
    function stroller(p) {
      return once('stroller:' + p.id, () => {
        // Stroller walks are for the weekend: on school days the kindergarten has them.
        if (p.kind !== 'preschool' || !p.household || week.worksOn(p, day) || unit(p.id + ':stroller:' + day) >= SHARE.preschool.stroller) return null;
        if (family(rel.households.get(p.household))) return null;
        const h = rel.households.get(p.household);
        let minder = h.adults.map(id => byId.get(id)).find(a => free(a) && !night(a) && !a.pickUp);
        if (!minder) minder = leader((h.grandparents || []).map(id => byId.get(id)).find(g => g && ELDERS.has(g.kind) && !g.pickUp && !leader(g).pickUp && free(g)));
        else minder = leader(minder);
        if (!minder) return null;
        const { place, alt } = placeFor('PARK', p.home, p.id + ':stroller-venue:' + day);
        if (!place) return null;
        const party = 'stroller:' + p.id;
        const members = new Set([p.id, minder.id]);
        return { members, outing: outingTo(members, place, '15:45', '16:45', { leave: '15:20', state: 'LEISURE', token: '@' + place, activity: 'stroller', options: { alt }, party }) };
      });
    }

    // Friday supper for a group of friends.
    function friends(index) {
      return once('friends:' + index, () => {
        if (!week.friendsMeet(index, day)) return null;
        const group = rel.friendGroups[index];
        const lead = byId.get(group[0]);
        const token = unit('friends:' + index + ':venue') < SHARE.friends.nightMarket ? 'NIGHT_MARKET' : 'MALL';
        const { place, alt } = placeFor(token, lead.home, 'friends:' + index + ':' + day);
        if (!place) return null;
        return outingTo(group, place, '19:25', '20:55', { leave: '19:00', state: 'DINING', token: '@' + place,
          activity: token === 'MALL' ? 'food-court' : 'friends-dinner', options: { alt }, party: 'friends:' + index });
      });
    }

    // An elder's circle sitting on its bench.
    function circle(index) {
      return once('circle:' + index, () => {
        const bench = benchOf.get(index);
        if (!bench || !week.circleMeets(index, day)) return null;
        if (walkTo.get(index) == null) walkTo.set(index, Math.max(10, walkOf(rel.circles[index], bench.spot.id)));
        const walk = walkTo.get(index);
        const arrive = toMinute(CIRCLES.sittings[bench.sitting] || CIRCLES.sittings[0]);
        return trip({ leave: arrive - walk, arrive, back: arrive + CIRCLES.sit, home: arrive + CIRCLES.sit + walk, state: 'LEISURE', token: '@' + bench.spot.id,
          activity: bench.spot.kind === 'chess' ? 'chess' : 'bench-chat', options: { firm: true }, party: 'circle:' + index });
      });
    }

    // A grandparent's school-gate pick-up and the walk home with the pupil.
    function pickup(gp) {
      return once('pickup:' + gp.id, () => {
        const pupil = byId.get(gp.pickUp);
        if (!pupil || !pupil.work || places.shutOn(pupil.work, day) || !free(gp)) return null;
        const party = 'pickup:' + gp.id;
        const goes = staysOutAfterSchool(pupil.id, day);
        const to = goes ? (places.venueList('AMUSEMENT', pupil.home)[0] || pupil.home) : pupil.home;
        const homeNeed = travel ? Math.max(walkBetween(gp, pupil.work, pupil.home), walkBetween(pupil, pupil.work, pupil.home), goes ? walkBetween(pupil, pupil.work, to) : 0) : 0;
        const after = afterSchoolRows(goes, travel ? homeNeed : 0);
        const walkIn = travel ? walkBetween(gp, gp.home, pupil.work) : Math.min(TRAVEL.max, places.travel(gp.home, pupil.work));
        const walk = Math.max(10, walkIn);
        const shared = { party, keep: true };
        const rows = [
          [950 - walk, 950, 'COMMUTE', 'STREET', 'commute', shared],
          [950, 960, 'LEISURE', '@' + pupil.work, 'pick-up', { ...shared, firm: true }],
          ...after.rows.map(row => [row[0], row[1], row[2], row[3], row[4], { ...row[5], ...shared }])
        ];
        return { leave: 950 - walk, home: toMinute(after.home), rows, party, need: travel ? homeNeed : 0 };
      });
    }

    // The kindergarten run of a household: who takes the little ones, and when.
    const DROPPERS = new Set(['office', 'workshop', 'depot', 'bank', 'civic', 'hosp-admin']);
    const canDrop = a => week.worksOn(a, day) && DROPPERS.has(a.kind) && !a.date && !a.pickUp && !week.overtimeEnd(a, day) && !week.dutyOn(a, day) && !week.carry(a, day);
    function kinder(h) {
      return once('kinder:' + h.id, () => {
        const kids = h.kids.map(id => byId.get(id)).filter(k => k.kind === 'preschool' && k.work && !places.shutOn(k.work, day));
        if (!kids.length) return null;
        const school = kids[0].work, party = 'kinder:' + h.id;
        const adults = h.adults.map(id => byId.get(id));
        const dropper = adults.find(canDrop);
        if (dropper) return { mode: 'parent', kids: kids.map(k => k.id), school, party, dropper: dropper.id, info: null };
        const minder = leader(adults.find(a => free(a) && !night(a) && !a.pickUp)
          || (h.grandparents || []).map(id => byId.get(id)).find(g => g && ELDERS.has(g.kind) && !g.pickUp && !leader(g).pickUp && free(g)));
        if (!minder) return null;
        const ids = [minder.id, ...kids.map(k => k.id)];
        const D = 470, n1 = walk(ids, school, 25), m = walk([minder.id], school, 25);
        const info = { dropAt: D, leave: D - n1, pickDepart: BELL, homeAt: BELL + n1 };
        const drop = { must: true, leave: D - n1, home: D + HANDOVER + m, party, rows: [walkToSchool(D - n1, D, party), dropOffStay(D, school, party), [D + HANDOVER, D + HANDOVER + m, 'COMMUTE', 'STREET', 'commute']] };
        const pick = { leave: BELL - 10 - m, home: BELL + n1, party, rows: [[BELL - 10 - m, BELL - 10, 'COMMUTE', 'STREET', 'commute'], pickUpStay(BELL - 10, BELL, school, party), walkHome(BELL, BELL + n1, party)] };
        return { mode: 'minder', kids: kids.map(k => k.id), school, party, minder: minder.id, info, drop, pick };
      });
    }
    const householdOf = r => (r.household ? rel.households.get(r.household) : null);

    const none = [];
    return {
      // The agreed outings for r, most binding first.
      sharedFor(r) {
        const out = [];
        const p = r.pickUp ? pickup(r) : null;
        if (p) out.push(p);
        const seen = new Set();
        for (const pre of strollerKids(r)) {
          const g = householdOf(pre) && kinder(householdOf(pre));
          if (g && g.mode === 'minder' && g.minder === r.id && !seen.has(g)) { seen.add(g); out.push(g.drop, g.pick); }
        }
        if (r.circle != null && ELDERS.has(r.kind)) { const c = circle(r.circle); if (c) out.push(c); }
        const h = r.household ? rel.households.get(r.household) : null;
        if (h) {
          const f = family(h);
          if (f && f.members.has(r.id)) out.push(f.outing);
          const c = couple(h);
          if (c && c.members.has(r.id) && c.outing) out.push(c.outing);
        }
        const s = r.kind === 'preschool' ? stroller(r) : minderOf(r);
        if (s && s.members.has(r.id)) out.push(s.outing);
        return out.length ? out : none;
      },
      // Supper out together: friends first, then family, then the couple.
      dinnerFor(r) {
        if (NO_DINNER.has(r.role)) return null;
        if (r.friendGroup != null) { const f = friends(r.friendGroup); if (f) return f; }
        const h = r.household ? rel.households.get(r.household) : null;
        if (!h) return null;
        const f = family(h);
        if (f && f.dinner && f.members.has(r.id)) return f.dinner;
        const c = couple(h);
        return c && c.dinner && c.members.has(r.id) ? c.dinner : null;
      },
      // The kindergarten run for a preschooler (null: stays home today).
      kinderFor(r) {
        const h = r.kind === 'preschool' ? householdOf(r) : null;
        return h ? kinder(h) : null;
      },
      // The kindergarten run a working parent takes part in (they publish their own times).
      kidRunFor(r) {
        const h = householdOf(r);
        const g = h && r.kind !== 'preschool' ? kinder(h) : null;
        return g && g.mode === 'parent' && g.dropper === r.id ? { kids: g.kids, school: g.school, party: g.party, publish(info) { g.info = info; } } : null;
      },
      // The party a pupil walks home with.
      pickedUpFor(r) {
        if (!r.pickedUpBy) return null;
        const p = pickup(byId.get(r.pickedUpBy));
        return p ? { party: p.party, need: p.need } : null;
      }
    };

    // A grandparent who minds a preschooler on the stroller walk.
    function minderOf(r) {
      for (const p of strollerKids(r)) { const s = stroller(p); if (s && s.members.has(r.id)) return s; }
      return null;
    }
  }

  // Preschoolers a grown-up may be asked to mind: those of the household, and a
  // grandchild of a retiree.
  const walkBetween = (r, a, b) => {
    const v = travel(r.id, a, b);
    return Number.isFinite(v) ? Math.max(TRAVEL.min, Math.ceil(v) + TRAVEL.margin) : places.travel(a, b);
  };
  const kidsOf = new Map();
  for (const r of byId.values()) {
    if (r.kind !== 'preschool' || !r.household) continue;
    const h = rel.households.get(r.household);
    for (const id of [...h.adults, ...(h.grandparents || [])]) {
      if (!kidsOf.has(id)) kidsOf.set(id, []);
      kidsOf.get(id).push(r);
    }
  }
  const strollerKids = r => kidsOf.get(r.id) || [];

  return { assignSpots, forDay, benchOf };
}
