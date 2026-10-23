// Residents as the town uses them: data/residents.json, normalised, with what can be
// worked out from the data added on — the kind of job (which day template and which
// rules of the week apply), the clinic in their estate, an officer's gate post, the
// label of their occupation family. Relations add household, partner and friends.

import { SHIFT_CHOICES } from './rules.js';

const DEFAULT_SHIFT = { doctor: 'early', nurse: 'early', officer: 'early', sanitation: 'dawn', market: 'morning', fire: 'early', airport: 'early' };

// The kind of job: role, refined by the workplace (a worker at the market keeps
// market hours) and overridden by a named schedule.
export function jobKind(r, siteOf) {
  if (r.schedule === 'president' || r.schedule === 'mayor' || r.schedule === 'office-night') return r.schedule;
  if (r.schedule === 'transit-driver') return 'transit';
  if (r.schedule === 'aircrew') return 'aircrew';
  const workKind = r.work && siteOf(r.work) ? siteOf(r.work).kind : null;
  switch (r.role) {
    case 'preschooler': return 'preschool';
    case 'student-p': return 'primary';
    case 'student-m': return 'secondary';
    case 'student-u': return 'university';
    case 'worker': return workKind === 'market' ? 'market' : workKind === 'depot' ? 'depot' : workKind === 'airport' ? 'airport' : workKind === 'zoo' ? 'zoo' : 'workshop';
    case 'shopkeeper': return workKind === 'night-market' ? 'stall' : 'shop';
    case 'medical-doc': return 'doctor';
    case 'medical-nurse': return 'nurse';
    case 'clerk': return workKind === 'bank' ? 'bank' : 'civic';
    case 'officer': return workKind === 'fire' ? 'fire' : 'officer';
    default: return r.role;   // office, driver, teacher, school-admin, hosp-admin, sanitation, unemployed, patient, retiree, senior
  }
}

export function normaliseResidents(list, { world, occupations }) {
  const familyLabel = new Map(occupations.map(o => [o.id, o.label]));
  const siteOf = id => (id ? world.site(id) : null);
  return list.map(raw => {
    const r = {
      id: raw.id, name: raw.name, age: raw.age, role: raw.role, job: raw.job || '', family: raw.family,
      org: raw.org || null, home: raw.home, work: raw.work || null, hangout: raw.hangout || null,
      schedule: raw.schedule || null, shift: raw.shift || null, post: raw.post || null, crew: raw.crew || null,
      restDays: Array.isArray(raw.restDays) ? [...new Set(raw.restDays)].sort((a, b) => a - b) : null,
      birthMonth: raw.birthMonth ?? null, species: raw.species || null, dog: raw.dog || null
    };
    r.kind = jobKind(r, siteOf);
    r.workKind = siteOf(r.work) ? siteOf(r.work).kind : null;
    if (SHIFT_CHOICES[r.kind] && !SHIFT_CHOICES[r.kind].includes(r.shift)) r.shift = DEFAULT_SHIFT[r.kind];
    if (!SHIFT_CHOICES[r.kind]) r.shift = null;
    if (r.kind === 'transit' && r.crew !== 'late') r.crew = 'early';
    const home = siteOf(r.home);
    r.clinic = (home && home.record && home.record.clinic) || null;
    // An early-shift officer on gate duty stands at the school the precinct belongs to.
    r.dutyPost = r.kind === 'officer' && r.post === 'gate' && r.shift === 'early' ? (siteOf(r.work) || {}).host || null : null;
    r.familyLabel = familyLabel.get(r.family) || r.family || '';
    // Filled in by relations.js.
    Object.assign(r, { household: null, familyRole: null, householdMembers: [], partner: null, date: null,
      pickUp: null, pickedUpBy: null, friendGroup: null, circle: null });
    return r;
  });
}
