// A stand-in for the town facade (docs/CONTRACTS.md §7) so the UI can be built and
// screenshot without the people and street modules: the real world and residents, simple
// positions (people home at night, at work by day), and a few fake walkers and a bus.
import * as data from '../../core/data.js';
import { buildWorld } from '../../core/world/index.js';
import { moment, toDaySeconds } from '../../core/clock.js';
import { searchTown } from '../../core/search.js';

const REL = { partner: '另一半', parent: '父母', sibling: '兄弟姊妹', grandparent: '祖父母', roommate: '室友', friend: '好朋友', coworker: '同事', classmate: '同學', 'old-friend': '老朋友', fiancee: '未婚妻' };
const GROUP = { partner: 'family', parent: 'family', sibling: 'family', grandparent: 'family', fiancee: 'family', roommate: 'friends', friend: 'friends', 'old-friend': 'friends', coworker: 'work', classmate: 'work' };

export async function createMockTown() {
  const world = buildWorld(data.town, data.buildings);
  const residents = data.residents.map(r => ({ ...r }));
  const byId = new Map(residents.map(r => [r.id, r]));
  const families = data.occupations;
  const famLabel = new Map(families.map(f => [f.id, f.label]));
  const profiles = await data.loadProfiles();
  const clock = { daySeconds: toDaySeconds(1, 540), speed: 1, moment() { return moment(this.daySeconds); } };
  const edges = new Map();
  for (const [kind, list] of Object.entries(data.relations.links || {})) {
    for (const [a, b] of list) {
      for (const [x, y] of [[a, b], [b, a]]) {
        if (!edges.has(x)) edges.set(x, []);
        edges.get(x).push({ id: y, kind, label: REL[kind] || kind, group: GROUP[kind] || 'friends' });
      }
    }
  }
  const sites = world.siteList.filter(s => s.group).map(s => ({ id: s.id, name: s.name, group: s.group, kind: s.kind }));
  const siteName = id => (world.site(id) || {}).name || id;

  // Asleep or home outside 07:30–18:30, lunch at the hangout, else at work.
  const placeOf = r => {
    const m = clock.moment().minute;
    if (m < 450 || m >= 1110) return r.home;
    if (m >= 690 && m < 780) return r.hangout || r.home;
    return r.work || r.home;
  };
  const walkers = residents.slice(0, 6).map((r, i) => ({ id: r.id, phase: i * 1.7 }));
  const walking = new Map();
  const tick = () => {
    const t = performance.now() / 1000;
    for (const w of walkers) { const a = t * 0.05 + w.phase; walking.set(w.id, { x: Math.cos(a) * (60 + w.phase * 6), z: Math.sin(a) * (50 + w.phase * 5), y: 0 }); }
  };
  tick();
  setInterval(tick, 100);

  const town = {
    world, people: { families }, clock, residents,
    resident: id => byId.get(id),
    job: id => { const r = byId.get(id); return r ? { title: r.job, family: r.family, familyLabel: famLabel.get(r.family) || '其他', org: r.org } : null; },
    relationsOf: id => edges.get(id) || [],
    profile: id => Promise.resolve(profiles[id] || {}),
    sites, site: id => sites.find(s => s.id === id) || world.site(id),
    presentAt: siteId => residents.filter(r => !walking.has(r.id) && placeOf(r) === siteId).map(r => r.id),
    statusOf(id) {
      const r = byId.get(id), m = clock.moment().minute;
      if (walking.has(id)) return '走在路上，前往 ' + siteName(r.work || r.home);
      return (m < 450 || m >= 1320 ? '在 ' + siteName(r.home) + ' 睡覺' : '在 ' + siteName(placeOf(r)));
    },
    whereIs(id) { return walking.has(id) ? { inside: false, ...walking.get(id) } : { inside: true, site: placeOf(byId.get(id)) }; },
    dayEntries(id) {
      const r = byId.get(id);
      return [[0, 450, '在家睡覺', r.home], [450, 480, '出門上班', null, true], [480, 690, '工作', r.work || r.home], [690, 780, '吃午餐', r.hangout || r.home], [780, 1050, '工作', r.work || r.home], [1050, 1110, '回家', null, true], [1110, 1440, '在家休息', r.home]]
        .map(([start, end, text, place, walk]) => ({ start, end, text: place ? `${text}・${siteName(place)}` : text, walk: !!walk }));
    },
    facts: id => { const r = byId.get(id); return [['年齡', `${r.age} 歲`], ['住處', siteName(r.home)], ['工作地點', r.work ? siteName(r.work) : '無'], ['常去的地方', r.hangout ? siteName(r.hangout) : '無']]; },
    vehicleInfo(id) {
      if (id !== 'bus-1') return null;
      const t = performance.now() / 1000;
      return { id, kind: 'bus', label: '環河線公車', sub: '往 轉運站', x: Math.cos(t * 0.04) * 110, z: Math.sin(t * 0.04) * 90, people: residents.slice(10, 16).map((r, i) => ({ id: r.id, role: i ? '乘客' : '駕駛' })) };
    },
    tapTargets() {
      const out = [...walking].map(([id, p]) => ({ key: 'p:' + id, kind: 'person', id, x: p.x, y: 0, z: p.z, radius: 2.5 }));
      const v = town.vehicleInfo('bus-1');
      out.push({ key: 'v:bus-1', kind: 'vehicle', id: 'bus-1', x: v.x, y: 0, z: v.z, radius: 6 });
      return out;
    },
    search(q) {
      const jobOf = id => { const r = byId.get(id); return r && { title: r.job, family: r.family, org: r.org }; };
      return searchTown(q, { residents, sites, jobOf, familyLabel: famLabel });
    }
  };
  return town;
}
