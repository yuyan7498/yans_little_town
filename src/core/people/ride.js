// How a resident gets about when it is too far to walk: their own scooter, car or
// bicycle, a lift in the family car, the bus or a taxi. The street layer rides by it
// (src/core/street/trips.js); the plans use it for the errands only drivers run (a
// fill-up at the gas station).

import { hash } from '../random.js';

export function vehicleOf(r) {
  if (r.schedule === 'mayor') return 'scooter';
  if (r.schedule === 'president') return 'car';
  const h = hash(r.id + ':ride') % 100;
  switch (r.role) {
    case 'patient': return null;
    case 'preschooler': return h < 55 ? 'family' : 'bus';
    case 'student-p': return h < 30 ? 'family' : 'bus';
    case 'student-m': return h < 55 ? 'bicycle' : h < 85 ? 'bus' : 'family';
    case 'student-u': return h < 60 ? 'scooter' : h < 85 ? 'bus' : 'bicycle';
    case 'senior': return h < 65 ? 'bus' : h < 85 ? 'taxi' : 'family';
    case 'retiree': return h < 35 ? 'scooter' : h < 60 ? 'bus' : h < 80 ? 'car' : 'bicycle';
    case 'unemployed': return h < 45 ? 'scooter' : h < 75 ? 'bus' : 'bicycle';
    default: return h < 52 ? 'scooter' : h < 76 ? 'car' : h < 90 ? 'bus' : 'bicycle';
  }
}

// Fills up at a gas station now and then: people who drive a car of their own.
export const fillsUp = r => !r.schedule && vehicleOf(r) === 'car';
