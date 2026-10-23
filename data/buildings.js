// Every place in town a resident can be: its name, what kind of place it is, how
// many people it is meant to hold at once, and when it is open.
//
// Where it stands comes from data/town.js: `lots` puts a site on a lot, `waterfront`
// on the market strip, and an annex (`host`) stands on its host's lot. The id is what
// data/residents.json uses for `home`, `work` and `hangout`.
//
// open: 'daily' (every day), 'weekday' (shut Saturday and Sunday), 'sat-am' (shut
// Sunday, Saturday until hours.saturdayClose). hours: town minutes, [open, close).
// group: the heading the search panel lists the place under.

export default [
  // Homes. `type` is the shape of the estate, `clinic` the surgery on its ground floor.
  { id: 'h-courtyard', name: '庭院住宅', kind: 'housing', type: 'courtyard', group: '住宅', capacity: 13, floors: 7 },
  { id: 'h-slab', name: '花園大樓', kind: 'housing', type: 'slab', group: '住宅', capacity: 358, floors: 8, clinic: 'i-clinic-a' },
  { id: 'h-terrace', name: '露台公寓', kind: 'housing', type: 'terrace', group: '住宅', capacity: 185, floors: 8, clinic: 'i-clinic-b' },
  { id: 'h-point', name: '雙塔社區', kind: 'housing', type: 'point', group: '住宅', capacity: 436, floors: 10, clinic: 'i-clinic-c' },
  // 豪宅: a gated estate of detached villas, and a luxury tower with a sky lobby.
  { id: 'h-villa', name: '雲頂別墅', kind: 'housing', type: 'villa', group: '住宅', capacity: 36, floors: 3 },
  { id: 'h-sky', name: '天璽豪宅', kind: 'housing', type: 'luxury', group: '住宅', capacity: 150, floors: 24 },

  // Schools (walled, entered by the gate).
  { id: 'c-primary', name: '鎮東國小', kind: 'primary', group: '學校', capacity: 240, open: 'weekday', floors: 3, compound: true },
  { id: 'c-secondary', name: '未來中學', kind: 'secondary', group: '學校', capacity: 260, open: 'weekday', floors: 4, compound: true },
  { id: 'c-university', name: '小鎮大學', kind: 'university', group: '學校', capacity: 300, open: 'weekday', floors: 5, compound: true },

  // Health.
  { id: 'c-hospital', name: '小鎮綜合醫院', kind: 'hospital', group: '醫療', capacity: 100, floors: 7, compound: true },
  { id: 'i-clinic-a', name: '花園大樓診所', kind: 'clinic', group: '醫療', capacity: 16, host: 'h-slab', placement: 'ground-floor' },
  { id: 'i-clinic-b', name: '露台公寓診所', kind: 'clinic', group: '醫療', capacity: 16, host: 'h-terrace', placement: 'ground-floor' },
  { id: 'i-clinic-c', name: '雙塔社區診所', kind: 'clinic', group: '醫療', capacity: 16, host: 'h-point', placement: 'ground-floor' },

  // Shops and food.
  { id: 'c-mall', name: '星河百貨', kind: 'mall', group: '購物・美食', capacity: 150, floors: 5 },
  { id: 'c-annex-mall', name: '南巷商場', kind: 'annex-mall', group: '購物・美食', capacity: 90, floors: 3 },
  { id: 'c-night-market', name: '河岸夜市', kind: 'night-market', group: '購物・美食', capacity: 140, hours: { open: 1080, close: 1440 } },
  { id: 'i-market', name: '果菜批發市場', kind: 'market', group: '購物・美食', capacity: 90, floors: 2 },

  // Offices. `style` is the tower's facade. The `helipad` tower carries the
  // president's helicopter on its roof (data/town.js `helicopter`).
  { id: 't-one', name: '北區辦公大樓', kind: 'tower', group: '辦公', capacity: 90, open: 'weekday', floors: 22, style: 'fins', helipad: true },
  { id: 't-two', name: '銀行商務大樓', kind: 'tower', group: '辦公', capacity: 90, open: 'weekday', floors: 19, style: 'bands' },
  { id: 't-three', name: '東岸辦公大樓', kind: 'tower', group: '辦公', capacity: 90, open: 'weekday', floors: 20, style: 'ribs' },
  { id: 't-four', name: '社區辦公大樓', kind: 'tower', group: '辦公', capacity: 90, open: 'weekday', floors: 18, style: 'terraces' },
  { id: 'c-bank', name: '鎮北銀行', kind: 'bank', group: '辦公', capacity: 48, open: 'sat-am', hours: { open: 480, close: 1020, saturdayClose: 840 }, host: 't-two', placement: 'podium', floors: 3 },
  // A bank's own building: the banking hall, the vault, a drive-up ATM.
  { id: 'c-bank-hq', name: '小鎮銀行總行', kind: 'bank', group: '辦公', capacity: 60, open: 'weekday', hours: { open: 540, close: 930 }, floors: 4 },

  // Public services.
  { id: 'c-civic', name: '鎮公所', kind: 'civic', group: '公共服務', capacity: 40, open: 'weekday', hours: { open: 480, close: 1020 }, floors: 2 },
  { id: 'c-library', name: '鎮立圖書館', kind: 'library', group: '公共服務', capacity: 90, floors: 3 },
  { id: 'c-precinct', name: '鎮東派出所', kind: 'precinct', group: '公共服務', capacity: 8, host: 'c-primary', placement: 'corner', floors: 2 },
  { id: 'i-waste', name: '清潔隊', kind: 'waste', group: '公共服務', capacity: 12, host: 'i-depot', placement: 'corner', floors: 1 },
  { id: 'c-fire', name: '小鎮消防隊', kind: 'fire', group: '公共服務', capacity: 24, floors: 3 },

  // Getting about. The airport faces the town (east); data/town.js `airport` has its flights.
  { id: 'c-station', name: '轉運站', kind: 'station', group: '交通', capacity: 80, floors: 1 },
  { id: 'x-airport', name: '小鎮機場', kind: 'airport', group: '交通', capacity: 90, front: 'e', hours: { open: 330, close: 1290 } },
  { id: 'g-gas-w', name: '西區加油站', kind: 'gas', group: '交通', capacity: 14, hours: { open: 360, close: 1410 } },
  { id: 'g-gas-e', name: '東區加油站', kind: 'gas', group: '交通', capacity: 14, hours: { open: 360, close: 1410 } },

  // Industry.
  { id: 'i-workshop', name: '工匠工坊', kind: 'workshop', group: '產業', capacity: 60, open: 'weekday', floors: 2, compound: true },
  { id: 'i-depot', name: '鎮北物流中心', kind: 'depot', group: '產業', capacity: 55, floors: 2, compound: true },

  // Out of doors.
  { id: 'c-plaza', name: '城市之光廣場', kind: 'plaza', group: '休閒', capacity: 100 },
  { id: 'c-amusement', name: '星光樂園', kind: 'amusement', group: '休閒', capacity: 60 },
  { id: 'c-park-a', name: '西岸公園', kind: 'park', group: '休閒', capacity: 90 },
  { id: 'c-park-b', name: '東岸公園', kind: 'park', group: '休閒', capacity: 90 },
  { id: 'c-sports', name: '鎮民運動場', kind: 'sports', group: '休閒', capacity: 60 },
  // The zoo faces the town (west).
  { id: 'x-zoo', name: '小鎮動物園', kind: 'zoo', group: '休閒', capacity: 220, front: 'w', hours: { open: 540, close: 1020 } },
  { id: 'c-cinema', name: '星空影城', kind: 'cinema', group: '休閒', capacity: 120, floors: 3, hours: { open: 600, close: 1440 } },
  // A Matsu temple in a walled court, entered through the front gate.
  { id: 'c-temple', name: '鎮安宮', kind: 'temple', group: '休閒', capacity: 60, floors: 2, compound: true, hours: { open: 300, close: 1320 } }
];
