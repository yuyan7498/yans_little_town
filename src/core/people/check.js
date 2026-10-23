// Checks the people data against the world and against itself, in words a person
// editing data/ can act on. `errors` would break the town (an unknown place, a role
// with no day); `warnings` are oddities worth a look (a child older than a parent).
// Used by createPeople (which refuses errors) and by tools/check-data.mjs.

import { ROLES, NAMED_SCHEDULES, SHIFT_CHOICES } from './rules.js';
import { RELATION_LABELS } from './labels.js';
import { jobKind } from './roster.js';

// Where each role may work (site kinds); null: no workplace.
const WORK_KINDS = {
  preschooler: ['primary'], 'student-p': ['primary'], 'student-m': ['secondary'], 'student-u': ['university'],
  office: ['tower', 'civic', 'airport', 'zoo'], worker: ['workshop', 'depot', 'market', 'airport', 'zoo'],
  shopkeeper: ['mall', 'annex-mall', 'night-market', 'gas', 'cinema', 'temple', 'zoo', 'airport'],
  driver: ['station', 'depot'], teacher: ['primary', 'secondary', 'university'], 'school-admin': ['primary', 'secondary', 'university'],
  'medical-doc': ['hospital'], 'medical-nurse': ['hospital'], 'hosp-admin': ['hospital'], officer: ['precinct', 'fire'],
  clerk: ['bank', 'civic'], sanitation: ['waste'], unemployed: null, patient: ['hospital'], retiree: null, senior: null, stray: null
};
const LEISURE_KINDS = new Set(['plaza', 'park', 'library', 'amusement', 'sports', 'mall', 'annex-mall', 'night-market', 'market', 'zoo', 'cinema', 'temple', 'airport']);
const HOUSEHOLD_KINDS = ['couple', 'single', 'elders', 'flat'];
const ELDER_ROLES = new Set(['retiree', 'senior']);

export function checkData({ world, residents, relations, occupations, profiles = null, strays = null }) {
  const errors = [], warnings = [];
  const site = id => (typeof id === 'string' ? world.site(id) : null);
  const list = Array.isArray(residents) ? residents : [];
  if (!Array.isArray(residents)) errors.push('residents.json 應該是一個陣列（每位居民一行）');

  // ---------------------------------------------------------------- occupations
  const families = new Set();
  (occupations || []).forEach((o, i) => {
    if (!o || typeof o.id !== 'string' || !o.id) { errors.push(`occupations.json 第 ${i + 1} 項沒有 id`); return; }
    if (families.has(o.id)) errors.push(`occupations.json：職業類別 ${o.id} 出現兩次`);
    if (!o.label) warnings.push(`occupations.json：${o.id} 沒有 label（顯示的名稱）`);
    families.add(o.id);
  });

  // ---------------------------------------------------------------- residents
  const byId = new Map(), names = new Map(), lineOf = new Map();
  const who = r => `${r.id}${r.name ? `（${r.name}）` : ''}`;
  list.forEach((r, i) => {
    const where = `residents.json 第 ${i + 2} 行`;
    if (!r || typeof r !== 'object') { errors.push(`${where}：不是一筆居民資料`); return; }
    if (typeof r.id !== 'string' || !r.id.trim() || /\s/.test(r.id)) { errors.push(`${where}：id 必須是不含空白的文字`); return; }
    if (byId.has(r.id)) { errors.push(`${where}：id ${r.id} 和第 ${lineOf.get(r.id)} 行重複`); return; }
    byId.set(r.id, r); lineOf.set(r.id, i + 2);
    const say = (field, text) => `${where} ${who(r)} 的 ${field}${text}`;
    if (typeof r.name !== 'string' || !r.name.trim()) errors.push(say('name', ' 是空的'));
    else if (names.has(r.name)) warnings.push(say('name', `「${r.name}」和 ${names.get(r.name)} 重複`));
    else names.set(r.name, r.id);
    if (!Number.isInteger(r.age) || r.age < 0 || r.age > 120) errors.push(say('age', `「${r.age}」不是 0–120 的整數`));
    if (!ROLES.includes(r.role)) { errors.push(say('role', `「${r.role}」不是認得的角色（${ROLES.join('、')}）`)); return; }
    if (!r.job) warnings.push(say('job', ' 是空的（職稱）'));
    if (!families.has(r.family)) errors.push(say('family', `「${r.family}」不在 occupations.json`));
    const home = site(r.home);
    if (r.role === 'stray') {
      // Strays live at a nest (a spot in a park, data/town.js `strays`), never in a building.
      if (!/^nest:/.test(String(r.home))) errors.push(say('home', `「${r.home}」要寫成 nest:cat 或 nest:dog 這樣的窩（data/town.js 的 strays）`));
      else if (strays && !strays.some(n => n.id === r.home)) errors.push(say('home', `「${r.home}」不在 data/town.js 的 strays（有 ${strays.map(n => n.id).join('、') || '沒有任何窩'}）`));
      if (!['cat', 'dog'].includes(r.species)) errors.push(say('species', `「${r.species}」要是 cat 或 dog`));
      if (r.work != null) errors.push(say('work', ' 要是 null（流浪動物沒有工作地點）'));
    } else if (r.species != null) warnings.push(say('species', ' 只用在流浪動物（role: stray）'));
    if (r.dog != null && (typeof r.dog !== 'string' || !r.dog.trim() || r.role === 'stray' || r.role === 'patient')) warnings.push(say('dog', ' 應該是狗的名字（文字），而且主人要是居民'));
    if (r.role === 'stray') { /* no building to check */ }
    else if (!home) errors.push(say('home', `「${r.home}」不是 data/buildings.js 裡的地點`));
    else if (r.role === 'patient' ? home.kind !== 'hospital' : home.kind !== 'housing') errors.push(say('home', `「${r.home}」是 ${home.kind}，${r.role === 'patient' ? '住院病人要住在醫院' : '住處要是住宅'}`));
    const allowed = WORK_KINDS[r.role];
    const work = r.work == null ? null : site(r.work);
    if (r.work != null && !work) errors.push(say('work', `「${r.work}」不是 data/buildings.js 裡的地點`));
    else if (allowed && !work) errors.push(say('work', ` 是空的，${r.role} 要有工作或就讀的地方（${allowed.join('、')}）`));
    else if (allowed && !allowed.includes(work.kind)) errors.push(say('work', `「${r.work}」是 ${work.kind}，${r.role} 的工作地點應該是 ${allowed.join('、')}`));
    else if (!allowed && work && !r.schedule) warnings.push(say('work', `「${r.work}」會被忽略：${r.role} 沒有工作地點`));
    if (r.hangout != null) {
      const h = site(r.hangout);
      if (!h) errors.push(say('hangout', `「${r.hangout}」不是 data/buildings.js 裡的地點`));
      else if (!LEISURE_KINDS.has(h.kind)) warnings.push(say('hangout', `「${r.hangout}」是 ${h.kind}，不太像休閒去處`));
    }
    if (r.schedule != null) {
      if (!NAMED_SCHEDULES.includes(r.schedule)) errors.push(say('schedule', `「${r.schedule}」不是認得的作息（${NAMED_SCHEDULES.join('、')}）`));
      else if (r.schedule === 'mayor' && (!work || work.kind !== 'civic')) errors.push(say('schedule', ' 是 mayor，work 要是鎮公所（civic）'));
      else if (r.schedule === 'president' && !work) errors.push(say('schedule', ' 是 president，要有 work（總統府所在的大樓）'));
      else if (r.schedule === 'president' && !work.helipad) warnings.push(say('schedule', ` 是 president，但 ${r.work} 樓頂沒有停機坪（helipad）`));
      else if (r.schedule === 'office-night' && (!work || work.kind !== 'tower')) errors.push(say('schedule', ' 是 office-night，work 要是辦公大樓'));
      else if (r.schedule === 'transit-driver' && (!work || work.kind !== 'station')) warnings.push(say('schedule', ' 是 transit-driver，work 通常是轉運站'));
      else if (r.schedule === 'aircrew' && (!work || work.kind !== 'airport')) errors.push(say('schedule', ' 是 aircrew（機組員），work 要是機場（airport）'));
    }
    const kind = jobKind(r, site);
    const shifts = SHIFT_CHOICES[kind];
    if (shifts && r.shift == null) warnings.push(say('shift', ` 沒填，當作 ${kind === 'sanitation' ? 'dawn' : kind === 'market' ? 'morning' : 'early'}`));
    else if (shifts && !shifts.includes(r.shift)) errors.push(say('shift', `「${r.shift}」不對，可以是 ${shifts.join('、')}`));
    else if (!shifts && r.shift != null) warnings.push(say('shift', `「${r.shift}」會被忽略（這個工作沒有分班）`));
    if (r.post != null) {
      if (r.role !== 'officer') warnings.push(say('post', ' 只用在警察'));
      else if (!['desk', 'gate'].includes(r.post)) errors.push(say('post', `「${r.post}」要是 desk 或 gate`));
      else if (r.post === 'gate' && r.shift !== 'early') warnings.push(say('post', ' 是 gate（護學崗），只有早班會去校門口'));
      else if (r.post === 'gate' && work && !work.host) warnings.push(say('post', ` 是 gate，但 ${r.work} 不在學校旁（沒有 host）`));
    }
    if (r.crew != null && !['early', 'late'].includes(r.crew)) errors.push(say('crew', `「${r.crew}」要是 early 或 late`));
    if (r.schedule === 'transit-driver' && r.crew == null) warnings.push(say('crew', ' 沒填，當作 early（早班）'));
    if (r.restDays != null) {
      const ok = Array.isArray(r.restDays) && r.restDays.every(d => Number.isInteger(d) && d >= 0 && d <= 6) && new Set(r.restDays).size === r.restDays.length;
      if (!ok) errors.push(say('restDays', ` 要是 0（週一）到 6（週日）不重複的數字陣列`));
      else if (r.restDays.length > 6) errors.push(say('restDays', ' 不能整週都休假'));
    }
    if (r.birthMonth != null && !(Number.isInteger(r.birthMonth) && r.birthMonth >= 1 && r.birthMonth <= 12)) errors.push(say('birthMonth', `「${r.birthMonth}」要是 1–12`));
  });

  const strayHomes = (list || []).filter(r => r && r.role === 'stray').map(r => r.home);
  if (new Set(strayHomes).size !== strayHomes.length) warnings.push('有兩隻流浪動物共用同一個窩');

  // Homes within capacity.
  const living = new Map();
  for (const r of byId.values()) if (site(r.home)) living.set(r.home, (living.get(r.home) || 0) + 1);
  for (const [id, n] of living) {
    const s = site(id);
    if (s.capacity && n > s.capacity) errors.push(`${s.name}（${id}）住了 ${n} 人，超過容量 ${s.capacity}：搬走 ${n - s.capacity} 人或在 data/buildings.js 調高 capacity`);
  }
  const named = [...byId.values()].filter(r => r.schedule === 'mayor' || r.schedule === 'president');
  for (const kind of ['mayor', 'president']) if (named.filter(r => r.schedule === kind).length > 1) warnings.push(`有不只一位居民的 schedule 是 ${kind}`);

  // ---------------------------------------------------------------- relations
  const rel = relations || {};
  for (const key of ['households', 'links', 'pickUps', 'friendGroups', 'circles']) if (rel[key] == null) warnings.push(`relations.json 沒有 ${key}`);
  const person = (id, where) => { if (!byId.has(id)) { errors.push(`${where}：沒有居民 ${id}`); return null; } return byId.get(id); };
  const age = id => byId.get(id).age;

  const householdOf = new Map(), householdIds = new Set();
  (rel.households || []).forEach((h, i) => {
    const where = `relations.json households 第 ${i + 1} 戶${h && h.id ? `（${h.id}）` : ''}`;
    if (!h || typeof h.id !== 'string') { errors.push(`${where}：要有 id`); return; }
    if (householdIds.has(h.id)) errors.push(`${where}：id 重複`);
    householdIds.add(h.id);
    if (!HOUSEHOLD_KINDS.includes(h.kind)) errors.push(`${where}：kind「${h.kind}」要是 ${HOUSEHOLD_KINDS.join('、')}`);
    if (!Array.isArray(h.adults) || !h.adults.length) { errors.push(`${where}：adults 至少要有一位`); return; }
    const adults = h.adults.filter(id => person(id, where)), kids = (h.kids || []).filter(id => person(id, where));
    const members = [...adults, ...kids];
    for (const id of members) {
      if (householdOf.has(id)) errors.push(`${where}：${who(byId.get(id))} 已經在 ${householdOf.get(id)} 這一戶`);
      else householdOf.set(id, h.id);
    }
    const homes = new Set(members.map(id => byId.get(id).home));
    if (homes.size > 1) errors.push(`${where}：同一戶的人住在不同地方（${[...homes].join('、')}），把 home 改成一樣`);
    if (h.kind !== 'flat') for (const kid of kids) for (const adult of adults) {
      if (age(kid) >= age(adult)) errors.push(`${where}：子女 ${who(byId.get(kid))} ${age(kid)} 歲，不比大人 ${who(byId.get(adult))}（${age(adult)} 歲）年輕`);
      else if (age(adult) - age(kid) < 15) warnings.push(`${where}：${who(byId.get(adult))} 只比子女 ${who(byId.get(kid))} 大 ${age(adult) - age(kid)} 歲`);
    }
    if (h.kind === 'couple' && adults.length !== 2) warnings.push(`${where}：couple 應該有兩位大人`);
    if (h.kind === 'elders' && adults.some(id => !ELDER_ROLES.has(byId.get(id).role))) warnings.push(`${where}：elders 這戶有不是退休族或長輩的人`);
    if (h.kind === 'flat' && kids.length) warnings.push(`${where}：合租（flat）不該有 kids`);
    for (const g of h.grandparents || []) {
      const gp = person(g, where + ' grandparents');
      if (!gp) continue;
      if (adults.some(id => age(id) >= gp.age)) warnings.push(`${where}：祖父母 ${who(gp)} 沒有比父母年長`);
      if (homes.size === 1 && gp.home !== [...homes][0]) warnings.push(`${where}：祖父母 ${who(gp)} 不住同一個社區，接送和推車散步會找不到人`);
    }
  });

  const pairKeys = new Set(), partnerCount = new Map();
  for (const [kind, pairs] of Object.entries(rel.links || {})) {
    const where = `relations.json links.${kind}`;
    if (!RELATION_LABELS[kind]) { errors.push(`${where}：不認得的關係（${Object.keys(RELATION_LABELS).filter(k => !['fiance', 'child', 'grandchild'].includes(k)).join('、')}）`); continue; }
    if (!Array.isArray(pairs)) { errors.push(`${where} 要是 [a, b] 的陣列`); continue; }
    for (const pair of pairs) {
      if (!Array.isArray(pair) || pair.length !== 2) { errors.push(`${where}：${JSON.stringify(pair)} 要是兩個 id`); continue; }
      const [a, b] = pair;
      const ra = person(a, where), rb = person(b, where);
      if (!ra || !rb) continue;
      if (a === b) { errors.push(`${where}：${who(ra)} 和自己有關係`); continue; }
      const key = kind + ':' + [a, b].sort().join('|');
      if (pairKeys.has(key)) warnings.push(`${where}：${a} 和 ${b} 重複寫了兩次`);
      pairKeys.add(key);
      if (kind === 'caretaker' && (ra.role === 'stray' || rb.role !== 'stray')) errors.push(`${where}：[${a}, ${b}] 要是 [照顧的人, 流浪動物]`);
      if (kind === 'parent' && ra.age >= rb.age) errors.push(`${where}：[${a}, ${b}] 是 [子女, 父母]，但子女 ${ra.age} 歲不比父母 ${rb.age} 歲小`);
      if (kind === 'grandparent' && rb.age - ra.age < 30) warnings.push(`${where}：[${a}, ${b}] 是 [孫子女, 祖父母]，年紀只差 ${rb.age - ra.age} 歲`);
      if ((kind === 'partner' || kind === 'old-partner' || kind === 'fiancee') && (ra.age < 18 || rb.age < 18)) warnings.push(`${where}：${a}、${b} 有人未滿 18 歲`);
      if (kind === 'partner' || kind === 'old-partner') for (const id of [a, b]) partnerCount.set(id, (partnerCount.get(id) || 0) + 1);
      if (kind === 'fiancee' && ra.schedule !== 'mayor') warnings.push(`${where}：[${a}, ${b}] 的第一位通常是鎮長（schedule: mayor）`);
    }
  }
  for (const [id, n] of partnerCount) if (n > 1) errors.push(`relations.json links：${who(byId.get(id))} 有 ${n} 位另一半／老伴`);
  // Couples living together should be partners.
  for (const h of rel.households || []) {
    if (!h || !Array.isArray(h.adults) || h.adults.length !== 2 || (h.kind !== 'couple' && h.kind !== 'elders')) continue;
    const [a, b] = h.adults;
    if (!pairKeys.has('partner:' + [a, b].sort().join('|')) && !pairKeys.has('old-partner:' + [a, b].sort().join('|')))
      warnings.push(`relations.json households ${h.id}：${a} 和 ${b} 住一起，但 links 裡沒有 partner／old-partner`);
  }

  const picker = new Map(), picked = new Map();
  (rel.pickUps || []).forEach((pair, i) => {
    const where = `relations.json pickUps 第 ${i + 1} 組`;
    if (!Array.isArray(pair) || pair.length !== 2) { errors.push(`${where} 要是 [祖父母, 國小學生]`); return; }
    const [g, p] = pair, gp = person(g, where), pupil = person(p, where);
    if (!gp || !pupil) return;
    if (picker.has(g)) errors.push(`${where}：${who(gp)} 已經要接 ${picker.get(g)}（一人只接一位）`);
    if (picked.has(p)) errors.push(`${where}：${who(pupil)} 已經由 ${picked.get(p)} 接`);
    picker.set(g, p); picked.set(p, g);
    if (pupil.role !== 'student-p') warnings.push(`${where}：${who(pupil)} 不是國小學生，不會去接`);
    if (!ELDER_ROLES.has(gp.role)) warnings.push(`${where}：${who(gp)} 不是退休族或長輩，平日下午不一定有空`);
    if (!pairKeys.has('grandparent:' + [g, p].sort().join('|'))) warnings.push(`${where}：links.grandparent 裡沒有 [${p}, ${g}]`);
    if (gp.home !== pupil.home) warnings.push(`${where}：${who(gp)} 和 ${who(pupil)} 不住同一個社區`);
  });

  const groups = (key, label, check) => {
    const member = new Map();
    (rel[key] || []).forEach((group, i) => {
      const where = `relations.json ${key} 第 ${i + 1} 組`;
      if (!Array.isArray(group) || group.length < 2) { errors.push(`${where}：至少要兩個人`); return; }
      for (const id of group) {
        const r = person(id, where);
        if (!r) continue;
        if (member.has(id)) errors.push(`${where}：${who(r)} 已經在第 ${member.get(id) + 1} 組${label}`);
        member.set(id, i);
        check(r, where);
      }
      if (key === 'circles' && new Set(group.filter(id => byId.has(id)).map(id => byId.get(id).home)).size > 1)
        warnings.push(`${where}：老朋友圈的人住在不同社區，坐同一張長椅要走很遠`);
    });
  };
  groups('friendGroups', '好朋友', (r, where) => {
    if (['patient', 'preschooler', 'student-p'].includes(r.role)) warnings.push(`${where}：${who(r)} 是 ${r.role}，不會去週五聚餐`);
  });
  groups('circles', '老朋友圈', (r, where) => {
    if (!ELDER_ROLES.has(r.role)) warnings.push(`${where}：${who(r)} 不是退休族或長輩，下午不一定有空`);
  });

  // ---------------------------------------------------------------- profiles
  if (profiles) {
    let missing = 0;
    for (const id of Object.keys(profiles)) if (!byId.has(id)) warnings.push(`profiles.json：${id} 不是任何居民`);
    for (const id of byId.keys()) {
      const p = profiles[id];
      if (!p) { missing++; continue; }
      for (const field of ['bio', 'motto', 'goal', 'secret']) if (typeof p[field] !== 'string') warnings.push(`profiles.json ${id}：${field} 應該是文字`);
      for (const field of ['traits', 'hobbies']) if (!Array.isArray(p[field])) warnings.push(`profiles.json ${id}：${field} 應該是陣列`);
    }
    if (missing) warnings.push(`profiles.json：${missing} 位居民沒有簡介`);
  }

  const summary = {
    residents: byId.size,
    households: householdIds.size, links: pairKeys.size, pickUps: picker.size,
    friendGroups: (rel.friendGroups || []).length, circles: (rel.circles || []).length,
    homes: Object.fromEntries([...living].map(([id, n]) => [id, `${n}/${site(id).capacity}`]))
  };
  return { errors, warnings, summary };
}
