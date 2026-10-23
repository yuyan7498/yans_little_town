// The street wired as src/main.js wires it: real people, travel estimator and trips.
import * as data from '../../src/core/data.js';
import { buildWorld } from '../../src/core/world/index.js';
import { planFurniture } from '../../src/core/world/furniture.js';
import { helicopterAt } from '../../src/core/world/helicopter.js';
import { createPeople } from '../../src/core/people/index.js';
import { createNetwork } from '../../src/core/street/network.js';
import { createLines } from '../../src/core/street/lines.js';
import { createTrips, createTravel } from '../../src/core/street/trips.js';
import { createStreet } from '../../src/core/street/street.js';

export function realStreet(pace = 3) {
  const world = buildWorld(data.town, data.buildings), furniture = planFurniture(world);
  const net = createNetwork(world, { spots: furniture.spots }), lines = createLines(net, world, data.transit, { pace });
  let travel = null;
  const people = createPeople({ world, residents: (globalThis.process && process.env.NO_STRAY) ? data.residents.filter(r => r.role !== 'stray') : data.residents, relations: (globalThis.process && process.env.NO_STRAY) ? { ...data.relations, links: Object.fromEntries(Object.entries(data.relations.links).filter(([k]) => k !== 'caretaker')) } : data.relations, occupations: data.occupations,
    buildings: data.buildings, town: data.town, travel: (id, a, b) => travel.minutes(id, a, b) });
  people.assignSpots(furniture.spots, (id, key) => net.doorOf(id, key));
  travel = createTravel({ world, net, lines, residents: people.residents, pace });
  const trips = createTrips({ world, net, lines, people, pace });
  const street = createStreet({ world, net, lines, trips, people, pace, helicopterAt, obstacles: furniture.items });
  return { world, furniture, net, lines, people, trips, street };
}
