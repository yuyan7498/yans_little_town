// Preview helpers for the a-modules: every building of this family together, and a
// world with two lots swapped (?swap=A,B lot ids) to show the buildings adapt.
import * as data from '../../core/data.js';
import { buildWorld } from '../../core/world/index.js';
import * as towers from './towers.js';
import * as housing from './housing.js';
import * as commercial from './commercial.js';
import * as civic from './civic-office.js';

const MODULES = [towers, housing, commercial, civic];

export function swapWorld(a, b) {
  const lots = { ...data.town.lots };
  [lots[a], lots[b]] = [lots[b], lots[a]];
  return buildWorld({ ...data.town, lots }, data.buildings);
}

export function createAll(ctx) {
  const parts = MODULES.map(m => m.create(ctx));
  const group = new ctx.THREE.Group();
  parts.forEach(p => group.add(p.group));
  return { group, update: f => parts.forEach(p => p.update(f)), dispose: () => parts.forEach(p => p.dispose()), lights: parts.flatMap(p => p.lights || []) };
}
export const preview = ctx => createAll(ctx);

export function previewSwap(ctx) {
  const [a, b] = (new URLSearchParams(location.search).get('swap') || 'B3,D4').split(',');
  return createAll({ ...ctx, world: swapWorld(a, b) });
}
