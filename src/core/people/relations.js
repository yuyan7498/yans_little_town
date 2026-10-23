// Who is who to whom. data/relations.json holds households (a couple and their
// children, a single parent, an elderly couple, students sharing a flat), the links
// between people (partners, parents, siblings, grandparents, roommates, friends, old
// friends, classmates, colleagues, the mayor's fiancée), the grandparents who collect
// a pupil from school, groups of good friends and circles of old friends.
//
// buildRelations turns that record into lookups for the info sheet and writes a few
// fields on the residents that the plans read to put families, couples and friends in
// the same place at the same time: household, householdMembers, familyRole, partner,
// date, pickUp, pickedUpBy, friendGroup, circle.

import { RELATION_LABELS, RELATION_ORDER, RELATION_GROUP, RELATION_INVERSE } from './labels.js';

export function buildRelations(byId, record = {}) {
  const links = new Map();
  for (const id of byId.keys()) links.set(id, []);
  const seen = new Set();
  const add = (a, b, kind) => {
    const key = a + '>' + b + ':' + kind;
    if (seen.has(key)) return;
    seen.add(key);
    links.get(a).push({ id: b, kind });
  };
  for (const [kind, pairs] of Object.entries(record.links || {})) {
    if (!RELATION_LABELS[kind]) continue;
    for (const [a, b] of pairs || []) {
      if (!byId.has(a) || !byId.has(b) || a === b) continue;
      add(a, b, kind);
      add(b, a, RELATION_INVERSE[kind] || kind);
      if (kind === 'partner' || kind === 'old-partner') { byId.get(a).partner = b; byId.get(b).partner = a; }
      if (kind === 'fiancee') { byId.get(a).date = b; byId.get(b).date = a; }
    }
  }

  const households = new Map(), householdOf = new Map();
  for (const row of record.households || []) {
    const known = ids => (ids || []).filter(id => byId.has(id));
    const h = { id: row.id, kind: row.kind, adults: known(row.adults), kids: known(row.kids), grandparents: known(row.grandparents) };
    h.members = [...h.adults, ...h.kids];
    h.home = h.members.length ? byId.get(h.members[0]).home : null;
    households.set(h.id, h);
    for (const id of h.members) {
      const r = byId.get(id);
      householdOf.set(id, h);
      r.household = h.id;
      r.householdMembers = h.members;
      r.familyRole = h.kids.includes(id) ? 'kid' : 'adult';
    }
  }

  const pickUps = new Map();
  for (const [grandparent, pupil] of record.pickUps || []) {
    if (!byId.has(grandparent) || !byId.has(pupil)) continue;
    pickUps.set(grandparent, pupil);
    byId.get(grandparent).pickUp = pupil;
    byId.get(pupil).pickedUpBy = grandparent;
  }
  const groupsOf = (list, field) => (list || []).map((group, i) => {
    const members = group.filter(id => byId.has(id));
    for (const id of members) byId.get(id)[field] = i;
    return members;
  });
  const friendGroups = groupsOf(record.friendGroups, 'friendGroup');
  const circles = groupsOf(record.circles, 'circle');

  // Someone's relations, family first, then friends, then work.
  function of(id) {
    return (links.get(id) || []).slice()
      .sort((a, b) => RELATION_ORDER.indexOf(a.kind) - RELATION_ORDER.indexOf(b.kind) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map(l => ({ id: l.id, kind: l.kind, label: RELATION_LABELS[l.kind], group: RELATION_GROUP[l.kind] }));
  }

  const stats = { households: households.size, families: 0, couples: 0, elders: 0, flats: 0, singles: 0,
    pickUps: pickUps.size, friendGroups: friendGroups.length, circles: circles.length, linked: 0, links: seen.size / 2 };
  for (const h of households.values()) {
    if (h.kind === 'flat') stats.flats++;
    else if (h.kind === 'elders') stats.elders++;
    else if (h.kind === 'single') stats.singles++;
    if (h.kids.length && h.kind !== 'flat') stats.families++;
    if (h.adults.length === 2 && h.kind !== 'flat') stats.couples++;
  }
  for (const list of links.values()) if (list.length) stats.linked++;

  return { of, households, householdOf: id => householdOf.get(id) || null, pickUps, friendGroups, circles, stats };
}
