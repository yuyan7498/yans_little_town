// A resident's trip as the street physics sees it: how far along its path the
// timetable says they should be at a minute (`targetAt`), and the input that goes to
// the physics each step (`tripInput`, one object per trip, refreshed in place).
//
// A trip (src/core/street/trips.js) leaves the door at `depart`, pauses `pauseOut`
// there, walks at `speed`; on its own vehicle it walks to the kerb (legs.walkEnd),
// drives from legs.driveStart at t1 to legs.driveEnd at t2, and walks on from
// legs.walkStart to the door. Times are town minutes of the trip's day.

export const WALK_SPEED = 1.625;
// Residents' own vehicles: half length and width (a car 8.6 × 3.4, a scooter 3.3 ×
// 0.84, a bicycle 2.9 × 0.9), and cruise speed in real-life units per town minute
// (× the vehicle pace; bicycles keep their own speed).
export const RIDE = {
  scooter: { hl: 1.65, hw: 0.42, cls: 'scooter', cruise: 9 },
  car: { hl: 4.3, hw: 1.7, cls: 'car', cruise: 11 },
  family: { hl: 4.3, hw: 1.7, cls: 'car', cruise: 11 }
};
// The strays: half length and width. Their trotting pace is trips.js ANIMAL_SPEED, already in trip.speed.
export const ANIMAL = { cat: { hl: 0.5, hw: 0.25, cls: 'cat' }, dog: { hl: 0.8, hw: 0.35, cls: 'dog' } };
export const BIKE = { hl: 1.45, hw: 0.45, cls: 'bicycle' };
// A party on foot walks abreast, two by two when there are four; cyclists ride in file.
export const ABREAST = 0.85, BEHIND = 1.1, IN_FILE = 3.1;
export const partyRows = n => (n > 3 ? 2 : 1);
// How much faster than the timetable someone may go to catch up with it.
const CATCH_UP = { walk: 1.3, bicycle: 1.2, ride: 1.2 };

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

// The drive's start and end times, from the trip or from its speeds.
function driveTimes(trip) {
  const L = trip.path.legs, t0 = trip.depart + (trip.pauseOut || 0), speed = trip.speed || WALK_SPEED;
  const t1 = Number.isFinite(trip.t1) ? trip.t1 : t0 + L.walkEnd / speed;
  const t2 = Number.isFinite(trip.t2) ? trip.t2 : t1 + (L.driveEnd - L.driveStart) / Math.max(0.1, trip.rideSpeed || 20);
  return [t0, t1, t2];
}

// Distance along trip.path the timetable has reached at minute m.
export function targetAt(trip, m) {
  const path = trip.path, speed = trip.speed || WALK_SPEED, L = path.legs;
  const t0 = trip.depart + (trip.pauseOut || 0);
  if (m <= t0) return 0;
  if (!L || !(trip.mode === 'scooter' || trip.mode === 'car' || trip.mode === 'family')) return Math.min(path.total, (m - t0) * speed);
  const [, t1, t2] = driveTimes(trip);
  if (m < t1) return Math.min(L.walkEnd, (m - t0) * speed);
  if (m < t2) return L.driveStart + (L.driveEnd - L.driveStart) * clamp01((m - t1) / Math.max(1e-6, t2 - t1));
  return Math.min(path.total, L.walkStart + (m - t2) * speed);
}

export const ownsVehicle = trip => !!trip.path && !!trip.path.legs && (trip.mode === 'scooter' || trip.mode === 'car' || trip.mode === 'family');

// The physics input for a trip at minute m, kept in `cache` (Map key → input).
export function tripInput(trip, m, pace, cache) {
  let input = cache.get(trip.key);
  if (!input || input.path !== trip.path) {
    input = makeInput(trip, pace);
    cache.set(trip.key, input);
  }
  input.target = targetAt(trip, m);
  input.used = m;
  return input;
}

function makeInput(trip, pace) {
  const path = trip.path, speed = trip.speed || WALK_SPEED;
  const input = { id: trip.key, group: 'resident', kind: 'ped', path, target: 0, walkFree: speed * CATCH_UP.walk, rideFree: 0,
    lat0: trip.lane || 0, ref: trip, hl: 0.35, hw: 0.42, cls: 'walker', drive: null, jumps: null, used: 0 };
  // A stray is small; its trip already carries its trotting speed.
  const animal = ANIMAL[trip.resident && trip.resident.species];
  if (animal) { input.hl = animal.hl; input.hw = animal.hw; input.cls = animal.cls; input.walkFree = speed * CATCH_UP.walk; }
  // A party walking abreast takes the room of the whole row (see street.js, abreast).
  const n = trip.followers ? trip.followers.length + 1 : 1;
  if (n > 1) {
    const rows = partyRows(n);
    input.hw = 0.42 + (Math.ceil(n / rows) - 1) * ABREAST / 2;
    input.hl = 0.35 + (rows - 1) * BEHIND / 2;
  }
  if (trip.mode === 'bicycle') {
    input.hl = BIKE.hl + (n - 1) * IN_FILE / 2; input.hw = BIKE.hw; input.cls = BIKE.cls;
    input.walkFree = speed * CATCH_UP.bicycle;
  } else if (ownsVehicle(trip)) {
    const L = path.legs, size = RIDE[trip.mode];
    input.walkFree = WALK_SPEED * CATCH_UP.walk;
    input.rideFree = Math.max((trip.rideSpeed || 0) * CATCH_UP.ride, size.cruise * pace) * 1.05;
    input.drive = { walkEnd: L.walkEnd, start: L.driveStart, end: L.driveEnd, walkStart: L.walkStart, cls: size.cls, hl: size.hl, hw: size.hw };
    input.jumps = [{ at: L.walkEnd, to: L.driveStart, check: size }, { at: L.driveEnd, to: L.walkStart }];
  }
  return input;
}

// The minute a trip's timetable reaches its door (before the pause there).
export function doorTime(trip) {
  const speed = trip.speed || WALK_SPEED, t0 = trip.depart + (trip.pauseOut || 0);
  if (!ownsVehicle(trip)) return t0 + trip.path.total / speed;
  const [, , t2] = driveTimes(trip);
  return t2 + (trip.path.total - trip.path.legs.walkStart) / speed;
}
