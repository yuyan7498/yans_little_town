// Shared street geometry: the few numbers every module that draws a road, paints a
// zebra, routes a walker or drives a car has to agree on. Distances in town units.

// Heights of the town's surfaces.
export const Y = {
  road: 0,          // carriageway
  kerb: 0.15,       // pavements, lots, promenades, grass
  water: -1.2       // the canal's surface
};

// Lane centres, measured from a road's centre line toward the right-hand side.
// A road with one lane each way keeps cars at 2.4; a trunk road has two lanes each way.
export const LANES = { 1: [2.4], 2: [2.4, 7.2] };

// A walker on a pavement keeps this far out from the kerb.
export const WALK_FROM_KERB = 2;

// Zebra crossings at a junction run across each arm, from `near` to `far` beyond
// the edge of the crossing carriageway. Stripes are `stripe` wide every `pitch`.
export const ZEBRA = { near: 1.3, far: 4.7, stripe: 0.68, pitch: 1.3 };

// Vehicles wait at the stop line, this far back from the junction box.
export const STOP_BACK = 5.5;

// A junction box is the two carriageways' overlap grown by this much each side.
export const BOX_MARGIN = 0.5;

// Mid-block signalled crossings (promenade over a road): half the zebra's width
// along the road, and the stop lines' distance back from it.
export const MIDBLOCK = { halfWidth: 1.7, stopBack: 1.3 };

// Doors: how far the approach step stands out from the door, and how long people
// pause there (town minutes).
export const DOOR = { approach: 1.6, pause: 0.4, gatePause: 1.2, openPause: 0.3 };

// Car lanes of a road, from its centre line: [inner] or [inner, outer].
export function carLanes(road) {
  return LANES[road.lanes] || LANES[1];
}

// Where two-wheelers ride, from the centre line (by the kerb).
export function twoWheelLane(road) {
  return road.width / 2 - (road.lanes > 1 ? 1.2 : 1);
}

// Where a vehicle pulls in to the kerb, from the centre line.
export function kerbLane(road) {
  return road.width / 2 - 0.3;
}

// The pavement walking line beside a road, from its centre line.
export function walkLine(road) {
  return road.width / 2 + WALK_FROM_KERB;
}

// Heading (radians, atan2(dz, dx)) and right-hand normal of a direction.
export const heading = (dx, dz) => Math.atan2(dz, dx);
export const rightOf = (ux, uz) => ({ x: -uz, z: ux });
