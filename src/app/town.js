// The town facade the UI talks to (docs/CONTRACTS.md §7): the clock, the residents and
// their plans, and the live street behind one object, with the words the screens show.
//
//   const town = createTown({ world, people, street, trips, net, loadProfiles, start });
//   each frame: town.step() → moves the street to town.clock.daySeconds

import { moment, MINUTES_PER_DAY, toDaySeconds } from '../core/clock.js';
import { MODE_LABEL } from '../core/street/trips.js';
import { helicopterAt } from '../core/world/helicopter.js';
import { planesAt } from '../core/world/flights.js';
import { searchTown } from '../core/search.js';

const STREET = 'street';
const HELICOPTER = 'helicopter';
const HELICOPTER_PHASE = { parked: '停在停機坪', boarding: '準備起飛', 'take-off': '起飛中', circuit: '在小鎮上空巡視', landing: '降落中', shutdown: '剛降落' };
const PLANE = 'plane:';
const PLANE_PHASE = { parked: '停在停機坪', 'start-up': '發動引擎', pushback: '後推出機位', 'taxi-out': '滑行到跑道', 'line-up': '在跑道頭準備起飛',
  'take-off': '起飛滑跑', climb: '爬升離場', cruise: '飛行中', approach: '進場', landing: '落地減速', 'taxi-in': '滑回停機坪', shutdown: '關閉引擎' };
const AIRBORNE = new Set(['climb', 'cruise', 'approach']);

export function createTown({ world, people, street, trips, net, loadProfiles, start = toDaySeconds(1, 540) }) {
  const clock = {
    daySeconds: start,
    speed: 1,
    moment() { return moment(this.daySeconds); },
    setDay(day) { const m = this.moment(); this.daySeconds = toDaySeconds(Math.max(1, day), m.minute); },
    setMinute(minute) { const m = this.moment(); this.daySeconds = toDaySeconds(m.day, minute); }
  };

  const residents = people.residents;
  const resident = id => people.byId.get(id) || null;
  const familyLabel = new Map(people.families.map(f => [f.id, f.label]));

  // Places: sites, benches and chess tables, night-market stalls.
  const sites = world.siteList.filter(s => s.group).map(s => ({ id: s.id, name: s.name, group: s.group, kind: s.kind }));
  const siteById = new Map(sites.map(s => [s.id, s]));
  function placeName(id) {
    if (!id || id === STREET) return '';
    const site = world.site(id);
    if (site) return site.name;
    const spot = net.spot(id);
    if (spot) return spot.label || spot.name || '';
    return '';
  }
  const siteOfPlace = id => (world.site(id) ? id : null);

  let profiles = null;
  const profile = id => (profiles || (profiles = loadProfiles())).then(all => all[id] || {}, () => ({}));

  // ------------------------------------------------------------- now
  const now = () => clock.moment();
  function segmentNow(id) {
    const m = now();
    const plan = people.planFor(id, m.day);
    if (!plan) return null;
    const { segment, index } = people.segmentAt(plan, m.minute);
    return { m, plan, segment, index };
  }
  // The trip of a street run, from the street layer's plan of the day.
  function tripAt(id, day, minute) {
    const list = trips.tripsFor(day).byResident.get(id);
    if (!list) return null;
    for (const t of list) if (minute >= t.start && minute < t.end) return t;
    return null;
  }
  // Where someone is by their plan when the street has them indoors: on a street run the
  // street has finished (or not begun), they are at its end (or still at its start).
  function placeByPlan(id) {
    const now = segmentNow(id);
    if (!now || !now.segment) return null;
    const { m, plan, segment, index } = now;
    if (segment.place !== STREET) return { place: segment.place, segment };
    const trip = tripAt(id, m.day, m.minute);
    const before = trip ? m.minute < trip.depart : m.minute < (segment.start + segment.end) / 2;
    const segs = plan.segments;
    let i = index;
    if (before) { while (i > 0 && segs[i].place === STREET) i--; } else { while (i < segs.length - 1 && segs[i].place === STREET) i++; }
    return { place: segs[i].place === STREET ? null : segs[i].place, segment: segs[i] };
  }

  function whereIs(id) {
    const w = street.whereIs(id);
    if (w) {
      if (w.kind === 'aloft') return { inside: false, x: w.x, y: w.y, z: w.z, aloft: true };
      const layer = w.kind === 'driving' ? 'road' : 'foot';
      return { inside: false, x: w.x, y: world.heightAt(w.x, w.z, layer), z: w.z };
    }
    const at = placeByPlan(id);
    const site = at && at.place ? siteOfPlace(at.place) : null;
    if (site) return { inside: true, site };
    const spot = at && at.place ? net.spot(at.place) : null;
    if (spot) return { inside: false, x: spot.x, y: world.heightAt(spot.x, spot.z), z: spot.z };
    const r = resident(id);
    return { inside: true, site: r ? r.home : null };
  }

  function statusOf(id) {
    const w = street.whereIs(id);
    if (w) {
      if (w.kind === 'aloft' && w.plane) return crewStatus(id, w);
      if (w.kind === 'aloft') return '搭直升機巡視小鎮';
      if (w.kind === 'driving') { const v = street.vehicleInfo(w.vehicle); return v ? `駕駛${v.label}` : '開車中'; }
      if (w.kind === 'seated') {
        const at = placeByPlan(id), what = at ? people.describe.activity(at.segment) : '';
        return `在 ${placeName(w.spot) || '路邊'}${what ? ' ' + what : ''}`;
      }
      const trip = w.trip, to = trip ? placeName(trip.to) : '';
      const how = (trip && MODE_LABEL[trip.mode]) || MODE_LABEL[w.mode] || '走路';
      return to ? `${how}前往 ${to}` : how;
    }
    const at = placeByPlan(id);
    if (!at || !at.place) return '';
    const what = people.describe.activity(at.segment);
    return `在 ${placeName(at.place)}${what ? ' ' + what : ''}`;
  }

  // Everyone in a building now: by plan, less those the street still has outside.
  function presentAt(siteId) {
    const m = now();
    const here = people.occupancy(m.day, m.minute).byPlace[siteId];
    if (!here) return [];
    return here.present.filter(id => !street.whereIs(id));
  }

  // The day's timeline for the info sheet: one entry per stay, one per street run.
  function dayEntries(id) {
    const day = now().day;
    const plan = people.planFor(id, day);
    if (!plan) return [];
    const out = [], segs = plan.segments;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (s.place === STREET) {
        let j = i;
        while (j + 1 < segs.length && segs[j + 1].place === STREET) j++;
        const trip = tripAt(id, day, s.start);
        const next = segs[j + 1], how = (trip && MODE_LABEL[trip.mode]) || '出門';
        out.push({ start: s.start, end: segs[j].end, text: next ? `${how}前往 ${placeName(next.place)}` : how, walk: true });
        i = j;
        continue;
      }
      const text = [people.describe.activity(s), placeName(s.place)].filter(Boolean).join('・');
      const last = out[out.length - 1];
      if (last && !last.walk && last.text === text && last.end === s.start) last.end = s.end;
      else out.push({ start: s.start, end: s.end, text, walk: false });
    }
    return out;
  }

  // The president's helicopter: tapped and followed like a vehicle, up in the air.
  const president = residents.find(r => r.schedule === 'president') || null;
  const heliTarget = { key: 'v:' + HELICOPTER, kind: 'vehicle', id: HELICOPTER, x: 0, y: 0, z: 0, radius: 9 };
  function helicopterInfo() {
    const h = helicopterAt(world, clock.daySeconds);
    if (!h) return null;
    const aboard = president && street.whereIs(president.id);
    const people = president && aboard && aboard.kind === 'aloft' ? [{ id: president.id, role: '總統' }] : [];
    return { id: HELICOPTER, kind: 'helicopter', label: '總統專機', sub: HELICOPTER_PHASE[h.phase] || '', x: h.x, y: h.y, z: h.z, aloft: h.phase !== 'parked' && h.phase !== 'boarding' && h.phase !== 'shutdown', people };
  }
  // The airline's planes: tapped and followed like the helicopter, the crew aboard listed.
  const airline = (world.config.airport && world.config.airport.airline) || '';
  const crewOf = people.crews || new Map();
  const planeTargets = new Map();
  function tripText(p) {
    if (!p.flight) return PLANE_PHASE[p.phase] || '';
    const outbound = ['start-up', 'pushback', 'taxi-out', 'line-up', 'take-off', 'climb'].includes(p.phase) || (p.phase === 'cruise' && !p.homeward);
    const leg = p.route ? (outbound ? `飛往${p.route}` : `從${p.route}返航`) : '';
    return [p.flight, leg, PLANE_PHASE[p.phase]].filter(Boolean).join(' ');
  }
  function planeInfo(id) {
    const p = planesAt(world, clock.daySeconds).find(q => PLANE + q.id === id);
    if (!p) return null;
    const people = [];
    for (const rid of crewOf.keys()) {
      const w = street.whereIs(rid);
      if (w && w.kind === 'aloft' && w.plane === p.id) people.push({ id: rid, role: (resident(rid) || {}).job || '機組員' });
    }
    return { id, kind: 'plane', label: `${airline} ${p.name}`.trim(), sub: tripText(p), x: p.x, y: p.y, z: p.z, aloft: AIRBORNE.has(p.phase), people };
  }
  function crewStatus(id, w) {
    const p = planesAt(world, clock.daySeconds).find(q => q.id === w.plane);
    const r = resident(id), flies = r && /機長/.test(r.job || '');
    return p ? `${flies ? '駕駛' : '在'}${p.name}${flies ? '' : '上服務'}・${tripText(p)}` : '執勤飛行中';
  }
  const vehicleInfo = id => (id === HELICOPTER ? helicopterInfo() : String(id).startsWith(PLANE) ? planeInfo(id) : street.vehicleInfo(id));
  function tapTargets() {
    const list = street.tapTargets().slice();
    const h = helicopterAt(world, clock.daySeconds);
    if (h) {
      heliTarget.x = h.x; heliTarget.y = h.y + 1.5; heliTarget.z = h.z;
      list.push(heliTarget);
    }
    for (const p of planesAt(world, clock.daySeconds)) {
      if (p.away) continue;
      let t = planeTargets.get(p.id);
      if (!t) planeTargets.set(p.id, t = { key: 'v:' + PLANE + p.id, kind: 'vehicle', id: PLANE + p.id, x: 0, y: 0, z: 0, radius: 13 });
      t.x = p.x; t.y = p.y + 3; t.z = p.z;
      list.push(t);
    }
    return list;
  }

  const search = query => searchTown(query, { residents, sites, jobOf: id => people.job(id), familyLabel });

  function step() {
    street.step(clock.daySeconds);
  }

  // Window lighting from who is home and awake, once per town minute.
  let lit = null, litAbs = -1;
  function lighting() {
    const m = now();
    const key = Math.floor(m.abs);
    if (key !== litAbs) { litAbs = key; lit = people.lighting(m.day, Math.floor(m.minute)); }
    return lit;
  }

  return {
    world, people, street, clock, residents, resident,
    job: id => people.job(id),
    relationsOf: id => people.relationsOf(id),
    profile,
    sites, site: id => siteById.get(id) || world.site(id) || null,
    presentAt, statusOf, whereIs, dayEntries,
    facts: id => people.describe.facts(id),
    vehicleInfo, tapTargets,
    search, step, lighting,
    MINUTES_PER_DAY
  };
}
