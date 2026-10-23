// Preview helpers for the public-building modules: all five together, and the same
// town with two pairs of lots swapped (schools and industry trade places) to show that
// every building follows whatever lot, size and facing it is given.

import * as data from '../../core/data.js';
import { buildWorld } from '../../core/world/index.js';
import * as schools from './schools.js';
import * as hospital from './hospital.js';
import * as services from './services.js';
import * as industry from './industry.js';
import * as station from './station.js';

const MODULES = [schools, hospital, services, industry, station];

function combine(world, quality) {
  const parts = MODULES.map(m => m.create({ world, quality }));
  const group = parts[0].group.constructor === Object ? null : new parts[0].group.constructor();
  parts.forEach(p => group.add(p.group));
  return {
    group,
    update: frame => parts.forEach(p => p.update(frame)),
    dispose: () => parts.forEach(p => p.dispose()),
    lights: parts.flatMap(p => p.lights || []),
    info: () => parts.map(p => p.info && p.info())
  };
}

export const preview = ({ world, quality }) => combine(world, quality);

// The primary school and the university swap lots (one faces south, the other north),
// and so do the workshop and the market (a walled compound and an open plot).
export function swapped({ world, quality }) {
  const lots = { ...data.town.lots };
  const swap = (a, b) => { [lots[a], lots[b]] = [lots[b], lots[a]]; };
  swap('A1', 'A6'); swap('B1', 'B6');
  const w = buildWorld({ ...data.town, lots }, data.buildings);
  void world;
  return combine(w, quality);
}
