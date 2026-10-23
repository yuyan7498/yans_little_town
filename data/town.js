// 彥彥的小鎮 — the map.
//
// Everything with a position in the town is derived from this file by
// src/core/world/build.js: roads, junctions, zebras, lots, building footprints,
// doors, the river, bridges, tunnels and the night-market stalls. No other file
// stores a coordinate of the map, so moving a road or swapping two lots here is
// the whole change.
//
// Axes: x runs west (-) to east (+), z runs north (-) to south (+), y is up.
// Units: a storey is 6, a person about 4.3 tall, a car 8.6 long (see docs/CONVENTIONS.md).

export default {
  seed: 20260818,

  // The board: the ground the town stands on. The outer columns (A and F) make it
  // roughly square.
  board: { halfX: 298, halfZ: 276, edgeMargin: 8 },

  // The canal runs north-south through the middle of the town. From the water
  // outwards on each bank: the riverside promenade (people walk along walkX), then
  // the market strip where the night-market stalls and the town office stand.
  river: { halfWidth: 15, promenade: 12, walkInset: 6, strip: 10 },

  // Pavement between a road's kerb and the lots beside it.
  pavement: 6,

  // Roads running north-south (constant x). `lanes` is per direction. They run the length
  // of the board unless `from`/`to` (z) say otherwise: the ring roads turn the corner into
  // the outer ring at the top and bottom of town.
  avenues: [
    { id: 'outer-w', name: '西外環路', x: -280, width: 10, lanes: 1, from: -256, to: 256 },
    { id: 'ring-w', name: '西環路', x: -190, width: 10, lanes: 1, from: -256, to: 256 },
    { id: 'trunk-w', name: '西堤大道', x: -108, width: 22, lanes: 2 },
    { id: 'trunk-e', name: '東堤大道', x: 108, width: 22, lanes: 2 },
    { id: 'ring-e', name: '東環路', x: 190, width: 10, lanes: 1, from: -256, to: 256 },
    { id: 'outer-e', name: '東外環路', x: 280, width: 10, lanes: 1, from: -256, to: 256 }
  ],

  // Roads running east-west (constant z), from `from` to `to` in x.
  // `river`: how the road gets over the canal — 'bridge', 'tunnel', or null (it stops
  // at each bank). `pedestrian`: [x0, x1], the stretch closed to traffic (here the
  // river side of the street, between the two trunk avenues). 中央街 stops at the ring
  // roads: the airport and the zoo each take both lots beside its ends (see `lots`).
  streets: [
    { id: 'edge-n', name: '北外環路', z: -256, width: 12, lanes: 1, from: -280, to: 280, river: 'bridge' },
    { id: 'ring-n', name: '北環路', z: -172, width: 12, lanes: 1, from: -280, to: 280, river: 'tunnel' },
    { id: 'trunk-n', name: '北大街', z: -86, width: 22, lanes: 2, from: -298, to: 298, river: 'bridge' },
    { id: 'center', name: '中央街', z: 0, width: 12, lanes: 1, from: -190, to: 190, river: null, pedestrian: [-108, 108] },
    { id: 'trunk-s', name: '南大街', z: 86, width: 22, lanes: 2, from: -298, to: 298, river: 'bridge' },
    { id: 'ring-s', name: '南環路', z: 172, width: 12, lanes: 1, from: -280, to: 280, river: 'tunnel' },
    { id: 'edge-s', name: '南外環路', z: 256, width: 12, lanes: 1, from: -280, to: 280, river: 'bridge' }
  ],

  // Junctions that go without traffic lights although three roads meet there
  // ('avenue/street'): the old corners of the ring, where 北/南外環路 now carry on to the
  // outer columns. Hardly anything comes from the outer side, and the school-run traffic
  // turning at 鎮東國小 would queue at lights.
  unsignalled: ['ring-w/edge-n', 'ring-w/edge-s', 'ring-e/edge-n', 'ring-e/edge-s'],

  // Footbridges over the canal, between the promenades.
  footbridges: [
    { id: 'foot-n', name: '北人行橋', z: -40.5, width: 5 },
    { id: 'foot-s', name: '南人行橋', z: 40.5, width: 5 }
  ],

  // The tunnels' profile: the carriageway starts down `portalX` from the river,
  // is covered from `coverX` in, and runs `drop` below the street: deep enough that a bus
  // (5.8 tall) passes under the canal's water (y = -1.2).
  tunnel: { portalX: 88, coverX: 40, drop: 8.5 },

  // The lots. Columns A-F run west to east and rows 1-6 north to south, between the
  // roads above (src/core/world/build.js finds them). Each lot holds one site from
  // data/buildings.js. To move a building, swap two ids here. A key joining two
  // neighbouring lots with '+' gives one site both of them; no road may run between
  // them (here 中央街 stops short of columns A and F).
  lots: {
    A1: 'h-villa', B1: 'c-primary', C1: 'i-workshop', D1: 'i-depot', E1: 't-one', F1: 'h-sky',
    A2: 'g-gas-w', B2: 'c-park-a', C2: 't-two', D2: 't-three', E2: 'c-hospital', F2: 'g-gas-e',
    'A3+A4': 'x-airport', B3: 'h-courtyard', C3: 't-four', D3: 'h-slab', E3: 'c-park-b', 'F3+F4': 'x-zoo',
    B4: 'c-station', C4: 'h-terrace', D4: 'c-mall', E4: 'h-point',
    A5: 'c-fire', B5: 'c-sports', C5: 'c-secondary', D5: 'c-plaza', E5: 'c-amusement', F5: 'c-bank-hq',
    A6: 'c-temple', B6: 'c-university', C6: 'i-market', D6: 'c-library', E6: 'c-annex-mall', F6: 'c-cinema'
  },

  // Sites on the market strip, by bank (-1 west, 1 east) and z-span.
  waterfront: [
    { site: 'c-civic', bank: -1, z0: 108, z1: 150 }
  ],

  // The night market: stalls fill both strips from the middle of town outwards,
  // `perBank` on each side. `table` stalls seat 5 round a table, `counter` stalls 4
  // at the counter. Names in order of placement (centre first, west bank first).
  nightMarket: {
    site: 'c-night-market',
    perBank: 16,
    length: 7,
    gap: 1.5,
    stalls: [
      ['蚵仔煎', 'table'], ['珍珠奶茶', 'counter'], ['鹽酥雞', 'table'], ['豆花', 'counter'],
      ['大腸包小腸', 'table'], ['剉冰', 'counter'], ['滷味', 'table'], ['現打果汁', 'counter'],
      ['臭豆腐', 'table'], ['雞排', 'counter'], ['刈包', 'counter'], ['愛玉', 'counter'],
      ['胡椒餅', 'counter'], ['甘蔗汁', 'counter'], ['麻辣燙', 'table'], ['車輪餅', 'counter'],
      ['蔥油餅', 'counter'], ['芒果冰', 'counter'], ['碳烤香腸', 'table'], ['地瓜球', 'counter'],
      ['豬血糕', 'counter'], ['仙草', 'counter'], ['牛肉麵', 'table'], ['紅豆餅', 'counter'],
      ['烤玉米', 'table'], ['木瓜牛奶', 'counter'], ['蚵仔麵線', 'table'], ['射氣球', 'counter'],
      ['肉圓', 'table'], ['冬瓜茶', 'counter'], ['鍋貼', 'table'], ['章魚燒', 'counter']
    ]
  },

  // The president's helicopter on the roof of the site flagged `helipad` in
  // data/buildings.js: the town minute each sortie starts, and how long one lasts.
  // The president boards `boardBefore` minutes before take-off and leaves the
  // aircraft `leaveAfter` minutes after it lands.
  helicopter: {
    sorties: { weekday: [500, 770, 990], weekend: [600, 840, 1050] },
    cycleMinutes: 150, takeOff: 20, landing: 130, boardBefore: 10, leaveAfter: 7
  },

  // 小鎮機場 (site `site`): the airline's planes and the town minute each round trip's
  // take-off roll starts, per plane, every day. A trip is `airborne` minutes from lift-off
  // to touch-down; between them the plane flies out of town and back. Back-to-back trips of
  // one plane make a crew's duty; `crews` crews of three (captain, first officer, cabin
  // crew: the residents with schedule `aircrew`, in id order) take the duties in turn.
  airport: {
    site: 'x-airport',
    airline: '小鎮航空',
    planes: [{ id: 'B-17001', name: '小鎮一號' }, { id: 'B-17002', name: '小鎮二號' }],
    departures: [[420, 600, 840, 1020], [510, 690, 930, 1110]],
    // Where the trips go, in turn (out and back the same day).
    routes: ['澎湖', '金門', '台東', '馬祖'],
    airborne: 105,
    crews: 6
  },

  // The town's two strays (residents `stray-cat` and `stray-dog` in data/residents.json)
  // each have a nest beside a site (both by the town office now); src/core/world/furniture.js
  // finds a quiet corner for it and makes it a spot (`id`) their plans can use as home.
  strays: [
    { animal: 'cat', id: 'nest:cat', site: 'c-civic' },
    { animal: 'dog', id: 'nest:dog', site: 'c-civic' }
  ],

  // Fireworks over the canal every evening, town minutes.
  fireworks: { from: 1170, to: 1230 },

  // The welcome screen opens on this day and minute on a first visit.
  start: { day: 1, minute: 540 }
};
