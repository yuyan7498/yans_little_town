// Traffic lights, Taiwanese style, at every junction the world flags `signal` and at
// every signalled mid-block crossing. North-south and east-west traffic take turns;
// when people are waiting to cross, an exclusive pedestrian phase (行人專用時相) holds
// every vehicle on red while they cross every way, the diagonal too.
//
// A vehicle green lasts minGreen to maxGreen while there is demand elsewhere (it rests
// on green when there is none), then amber, then all red until the box is clear (at
// most redMax). The people's phase shows the green man for pedWalk, then flashes until
// the last of them is over (flashMin to flashMax). It starts only with every zebra and
// the box clear of vehicles: with one still stuck there the lights let the traffic have
// another turn, at most MAX_WALK_SKIPS times running.
//
// Timings are town minutes (1.6 to the real second at normal speed), the same at any
// vehicle pace: people walk at their own speed whatever the cars do. Geometry (boxes,
// zebras, stop lines) is the world's (src/core/world/build.js).

import { STOP_BACK, MIDBLOCK, ZEBRA, BOX_MARGIN } from '../world/geometry.js';

export const SIGNAL = {
  minGreen: 1.7, maxGreen: 7, amber: 0.8, redMin: 0.3, redMax: 1,
  pedWalk: 1.3, flashMin: 0.6, flashMax: 2.4,
  approach: 30,      // a green keeps going while vehicles are still this close to the box
  pedEvery: 2        // vehicle phases between two people's phases, when both axes wait
};
export const MAX_WALK_SKIPS = 2;

// Junctions without lights take turns by demand (minutes at pace 1; faster traffic
// clears a box sooner, so these shrink with the pace).
export const UNSIGNALLED = { minGreen: 1.5, maxGreen: 4, maxClear: 2.5 };

function zone(x0, x1, z0, z1, axis, along) {
  return { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), axis, along };
}

// The traffic layer's junctions: boxes vehicles reserve to cross, with their lights.
// `walks`: the zones people cross in their phase — each zebra (`along`: the way people
// walk over it; `axis`: the traffic that runs beside it) and, at a junction, the box
// itself (crossed diagonally).
export function buildJunctions(world) {
  const list = [];
  for (const j of world.junctions) {
    const J = junction(j.id, j.name, j.x, j.z, j.hx, j.hz, !!j.signal, { ...j.arms }, false);
    J.stopBack = STOP_BACK;
    J.zebraOut = ZEBRA.far - BOX_MARGIN;        // the far edge of a zebra, beyond the box
    J.walks = j.zebras.map(z => zone(z.x0, z.x1, z.z0, z.z1, z.walk === 'z' ? 'ns' : 'ew', z.walk));
    J.walks.push(zone(j.x - j.hx, j.x + j.hx, j.z - j.hz, j.z + j.hz, null, null));
    J.zebras = J.walks.filter(w => w.axis);
    list.push(J);
  }
  for (const c of world.crossings || []) {
    const arms = { px: false, nx: false, pz: false, nz: false };
    for (const s of c.stopLines) arms[s.arm] = true;
    const J = junction(c.id, c.name, c.x, c.z, c.hx, c.hz, true, arms, true);
    // The crossing's box is its zebra; the stop lines are just short of the stripes.
    J.stopBack = MIDBLOCK.stopBack;
    J.zebraOut = 0;
    const along = c.zebra.w < c.zebra.d ? 'z' : 'x';
    J.walks = [zone(c.zebra.x0, c.zebra.x1, c.zebra.z0, c.zebra.z1, along === 'z' ? 'ns' : 'ew', along)];
    J.zebras = J.walks;
    list.push(J);
  }
  return list;
}

function junction(id, name, x, z, hx, hz, signal, arms, midblock) {
  const J = {
    id, name, x, z, hx, hz, signal, midblock, arms,
    hasNs: arms.pz || arms.nz, hasEw: arms.px || arms.nx,
    holders: new Map(),       // vehicle id -> {enter, exit, axis}: who has been let into the box
    phase: null, stage: null, since: 0, clearing: false, clearSince: 0,
    waitNs: 0, waitEw: 0,     // longest wait of a vehicle asking at the line, by axis
    comingNs: 0, comingEw: 0, // vehicles still coming up to the box, by axis
    state: { phase: 'ns', stage: 'green' }
  };
  resetJunction(J);
  return J;
}

export function resetJunction(J) {
  J.holders.clear();
  J.phase = null; J.stage = null; J.since = 0; J.clearing = false; J.clearSince = 0;
  J.pedCall = 0; J.pedNext = 0; J.crossing = 0; J.crossingNext = 0;
  J.lastVeh = J.hasNs ? 'ns' : 'ew'; J.sinceWalk = 0; J.walkSkips = 0;
  J.waitNs = J.waitEw = J.comingNs = J.comingEw = 0;
  J.state.phase = J.lastVeh; J.state.stage = 'green';
}

const flip = axis => (axis === 'ns' ? 'ew' : 'ns');
// Vehicles want this axis: waiting at the line or still coming up to the box.
const wants = (J, axis) => (axis === 'ns' ? J.waitNs > 0 || J.comingNs > 0 : J.waitEw > 0 || J.comingEw > 0);
const has = (J, axis) => (axis === 'ns' ? J.hasNs : J.hasEw);
// The axis to give the green to, never one with no road leading off the junction.
const usable = (J, axis) => (has(J, axis) ? axis : flip(axis));

function to(J, stage, phase, clock) {
  J.stage = stage;
  if (phase) J.phase = phase;
  J.since = clock;
}

// One tick of a junction's lights. `occupied(J)`: is a vehicle standing on a zebra or
// in the box? `J.holders` (vehicles let in, with their axis) are what all red waits on.
export function stepSignal(J, clock, occupied) {
  if (!J.stage) to(J, 'green', J.hasNs ? 'ns' : 'ew', clock);
  const t = clock - J.since, ped = J.pedCall > 0;
  switch (J.stage) {
    case 'green':
      if ((wants(J, flip(J.phase)) || ped) && t > SIGNAL.minGreen && (!wants(J, J.phase) || t > SIGNAL.maxGreen)) to(J, 'amber', null, clock);
      break;
    case 'amber':
      if (t > SIGNAL.amber) to(J, 'red', null, clock);
      break;
    case 'red': {
      let still = false;
      for (const h of J.holders.values()) if (h.axis === J.phase) { still = true; break; }
      if (t < SIGNAL.redMin || (still && t < SIGNAL.redMax)) break;
      if (J.phase === 'walk') {
        // After the people: the other axis from last time if it is waiting, else the same one.
        const alt = usable(J, flip(J.lastVeh));
        to(J, 'green', wants(J, alt) || !wants(J, J.lastVeh) ? alt : J.lastVeh, clock);
        break;
      }
      // The people go once both axes have had a turn (or straight away when the other has
      // nobody waiting), and only with every zebra and the box clear of vehicles.
      let people = ped && (J.sinceWalk + 1 >= SIGNAL.pedEvery || !wants(J, flip(J.phase)));
      if (people && J.walkSkips < MAX_WALK_SKIPS && occupied(J)) {
        if (t < SIGNAL.redMax) break;
        people = false; J.walkSkips++;
      }
      J.lastVeh = J.phase; J.sinceWalk++;
      if (people) { J.walkSkips = 0; to(J, 'walk', 'walk', clock); }
      else to(J, 'green', usable(J, wants(J, flip(J.phase)) || !ped ? flip(J.phase) : J.phase), clock);
      break;
    }
    case 'walk':
      if (t > SIGNAL.pedWalk) to(J, 'flash', null, clock);
      break;
    case 'flash':
      if (t > SIGNAL.flashMin && (!J.crossing || t > SIGNAL.flashMax)) { J.sinceWalk = 0; to(J, 'red', null, clock); }
      break;
  }
  J.state.phase = J.phase; J.state.stage = J.stage;
}

// A junction without lights: the axis with the right of way keeps it for minGreen at
// least while the other waits, maxGreen at most; then nobody new goes in until the box
// is clear (or maxClear has passed), and the other axis goes.
export function stepUnsignalled(J, clock, pace) {
  const minGreen = UNSIGNALLED.minGreen / pace, maxGreen = UNSIGNALLED.maxGreen / pace, maxClear = UNSIGNALLED.maxClear / pace;
  const wNs = J.waitNs, wEw = J.waitEw;
  if (wNs || wEw) {
    if (!J.phase) { J.phase = wNs >= wEw ? 'ns' : 'ew'; J.since = clock; }
    const other = flip(J.phase), green = clock - J.since;
    const wOther = other === 'ns' ? wNs : wEw, wMine = J.phase === 'ns' ? wNs : wEw;
    if (!J.clearing && wOther && green > minGreen && (!wMine || green > maxGreen)) { J.clearing = true; J.clearSince = clock; }
  }
  if (J.clearing) {
    let still = false;
    for (const h of J.holders.values()) if (h.axis === J.phase) { still = true; break; }
    if (!still || clock - J.clearSince > maxClear) { J.phase = flip(J.phase); J.since = clock; J.clearing = false; }
  }
  J.state.phase = J.phase || 'ns'; J.state.stage = J.clearing ? 'red' : 'green';
}

// Every signal's state, into `out` (a Map id -> {phase, stage}; the objects are live).
export function signalStates(junctions, out = new Map()) {
  for (const J of junctions) if (J.signal) out.set(J.id, J.state);
  return out;
}
