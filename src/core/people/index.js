// The people layer: residents, their relations, jobs and the plan of every day.
// createPeople() is the one entry point (docs/CONTRACTS.md section 5).

import { checkData } from './check.js';
import { normaliseResidents } from './roster.js';
import { buildRelations } from './relations.js';
import { createPlaces } from './places.js';
import { createWeek } from './week.js';
import { createTogether } from './together.js';
import { createPlanner } from './plans.js';
import { createPresence } from './presence.js';
import { createDescribe } from './describe.js';
import { validatePlan } from './validate.js';
import { crewRoster, dutiesOn } from '../world/flights.js';

export class PeopleError extends Error {
  constructor(problems) {
    super(`居民資料有 ${problems.length} 個問題：\n- ${problems.join('\n- ')}`);
    this.name = 'PeopleError';
    this.problems = problems;
  }
}

export { validatePlan, checkData };

export function createPeople({ world, residents, relations, occupations, buildings, town, travel = null }) {
  const { errors } = checkData({ world, residents, relations, occupations, strays: town.strays || null });
  if (errors.length) throw new PeopleError(errors);

  const list = normaliseResidents(residents, { world, occupations });
  const byId = new Map(list.map(r => [r.id, r]));
  const rel = buildRelations(byId, relations);
  const places = createPlaces(world);
  // The airline's crews fly the duties src/core/world/flights.js hands their crew.
  const crews = crewRoster(list), duties = new Map();
  const flightDuty = (r, day) => {
    const crew = crews.get(r.id);
    if (crew === undefined) return null;
    if (!duties.has(day)) { duties.set(day, dutiesOn(world, day)); if (duties.size > 8) duties.delete(duties.keys().next().value); }
    return duties.get(day).find(d => d.crew === crew) || null;
  };
  const week = createWeek({ residents: list, places, flightDuty });
  const together = createTogether({ byId, rel, week, places, travel });
  const planner = createPlanner({ world, places, week, together, town, byId, travel, flightDuty });
  const presence = createPresence({ world, residents: list, planner, places });
  const describe = createDescribe({ world, byId, week, strays: town.strays || [] });

  const jobs = new Map(list.map(r => [r.id, { title: r.job, family: r.family, familyLabel: r.familyLabel, org: r.org }]));

  function stats() {
    const byRole = {};
    for (const r of list) byRole[r.role] = (byRole[r.role] || 0) + 1;
    return { residents: list.length, byRole, ...rel.stats };
  }

  return {
    residents: list, byId,
    job: id => jobs.get(id) || null,
    families: occupations,
    relationsOf: id => rel.of(id),
    stats,
    assignSpots(spots, doorOf) { together.assignSpots(spots, doorOf); planner.invalidate(); presence.invalidate(); },
    planFor: planner.planFor,
    plansFor: planner.plansFor,
    segmentAt: planner.segmentAt,
    occupancy: presence.occupancy,
    lighting: presence.lighting,
    validatePlan,
    // Extra: every plan of a day checked against the day before; → problems[].
    validateDay(day) {
      const today = planner.plansFor(day), before = day > 1 ? planner.plansFor(day - 1) : null;
      const problems = [];
      for (const [id, plan] of today) problems.push(...validatePlan(plan, before ? before.get(id) : null).problems);
      return problems;
    },
    crowded: day => planner.plansFor(day).crowded,
    describe,
    // Extras for tools and tests.
    week, relations: rel, rules: { restDays: id => week.restDays(byId.get(id)) },
    crews, flightDuty: (id, day) => (byId.get(id) ? flightDuty(byId.get(id), day) : null)
  };
}
