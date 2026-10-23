// The per-frame state every render module's update(frame) receives (docs/CONTRACTS.md §Frame).
// The app fills `lighting` from the residents (src/core/people); `simpleLighting` is a
// stand-in for previews and tests: every window lit by the dark alone.

import { moment } from '../core/clock.js';

export function makeFrame({ daySeconds, time = 0, dt = 0, lighting = null, camera = null, cameraState = null, quality = 'full', world = null }) {
  const m = moment(daySeconds);
  return { time, dt, daySeconds, ...m, lighting: lighting || simpleLighting(world, m), camera, cameraState, quality };
}

export function simpleLighting(world, m) {
  const dark = 1 - m.daylight, buildings = {};
  if (world) for (const s of world.siteList) {
    buildings[s.id] = { windows: s.kind === 'housing' ? dark * 0.6 : dark * 0.35, entry: m.lamps, sign: m.lamps,
      visitors: Math.round((s.capacity || 0) * 0.2 * (0.4 + 0.6 * m.daylight)) };
  }
  return { buildings };
}
