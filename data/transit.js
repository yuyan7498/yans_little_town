// The town's bus lines and the station's fleet.
//
// A line is a loop through junctions, each named 'avenue/street' after the two roads
// that meet there (ids from data/town.js). Consecutive junctions must share a road;
// the bus follows that road between them. Every line runs both ways round: 'in' in
// the order written, 'out' reversed. Stops are placed by src/core/street on each
// stretch long enough for one.

export default {
  lines: [
    { id: 'c', name: '環河線', via: ['trunk-w/trunk-n', 'trunk-e/trunk-n', 'trunk-e/center', 'trunk-e/trunk-s', 'trunk-w/trunk-s', 'trunk-w/center'] },
    { id: 'w', name: '西區線', via: ['ring-w/ring-n', 'trunk-w/ring-n', 'trunk-w/ring-s', 'ring-w/ring-s'] },
    { id: 'e', name: '東區線', via: ['ring-e/ring-n', 'ring-e/ring-s', 'trunk-e/ring-s', 'trunk-e/ring-n'] },
    // Past every housing estate and both schools, over both bridges.
    { id: 's', name: '社區接駁線', via: ['trunk-e/center', 'ring-e/center', 'ring-e/trunk-n', 'trunk-e/trunk-n', 'trunk-w/trunk-n', 'trunk-w/ring-n',
      'ring-w/ring-n', 'ring-w/center', 'trunk-w/center', 'trunk-w/trunk-s', 'trunk-e/trunk-s'] },
    // Round the outer columns: both 豪宅 on 北外環路, the temple and the cinema on 南環路,
    // the gas stations, the fire station and the bank on the outer avenues.
    { id: 'o', name: '外環線', via: ['outer-w/edge-n', 'outer-e/edge-n', 'outer-e/ring-s', 'outer-w/ring-s'] }
  ],

  // Which loop each bus driver on shift takes, in order; a second bus on a loop runs
  // half a lap behind the first.
  fleet: ['s-in', 'c-in', 'c-out', 'o-in', 's-in', 'w-in', 'e-in', 's-in', 'w-out', 'e-out', 'o-out', 'c-in', 'c-out', 'w-in'],

  // Buses: cruise speed and timetable speed (units per town minute at real-life
  // speed, before the vehicle pace), seats, minutes at a stop and per boarding.
  bus: { cruise: 11, timetable: 9, capacity: 45, dwell: 0.5, board: 0.12, walkReach: 105, minRide: 50, late: 10 },
  taxi: { cruise: 11, seats: 3, expectWait: 4 },

  // Bus service hours, town minutes.
  hours: { first: 345, last: 1260 }
};
