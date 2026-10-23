// The knobs of the town's week: who does what, how often and when. Shares are the
// part of the group named that has a habit; times are 'HH:MM' (or town minutes).
// Change a number here and every plan follows; nothing else stores these values.

export const ROLES = [
  'preschooler', 'student-p', 'student-m', 'student-u', 'office', 'worker', 'shopkeeper', 'driver', 'teacher',
  'school-admin', 'medical-doc', 'medical-nurse', 'hosp-admin', 'officer', 'clerk', 'sanitation', 'unemployed',
  'patient', 'retiree', 'senior', 'stray'
];

// Named days that override a role's own.
export const NAMED_SCHEDULES = ['mayor', 'president', 'transit-driver', 'office-night', 'aircrew'];

// Which `shift` values a resident may carry, by the kind of job (see roster.js jobKind).
export const SHIFT_CHOICES = {
  doctor: ['early', 'evening', 'night'],
  nurse: ['early', 'evening', 'night'],
  officer: ['early', 'evening', 'night'],
  sanitation: ['dawn', 'evening'],
  market: ['dawn', 'morning'],
  fire: ['early', 'evening', 'night'],
  airport: ['early', 'late']
};

// Shift hours, used by the day templates and by the info sheet's 班別 alike.
export const SHIFTS = {
  early: { label: '早班', from: '08:00', to: '16:00' },
  evening: { label: '小夜班', from: '16:00', to: '24:00' },
  night: { label: '大夜班', from: '00:00', to: '08:00' },
  'office-night': { label: '大夜班', from: '22:00', to: '07:00' },
  'sanitation-dawn': { label: '凌晨班', from: '04:30', to: '11:30', note: '04:30 出車收垃圾' },
  'sanitation-evening': { label: '傍晚班', from: '15:30', to: '24:40', note: '夜市收攤後清掃河岸' },
  'market-dawn': { label: '凌晨批發', from: '04:00', to: '08:00' },
  'market-morning': { label: '早市', from: '07:30', to: '11:30' },
  'transit-early': { label: '早班', from: '05:45', to: '13:30' },
  'transit-late': { label: '晚班', from: '13:00', to: '21:00' },
  'shop-open': { label: '早班', from: '09:30', to: '18:00' },
  'shop-close': { label: '晚班', from: '13:30', to: '22:00' },
  stall: { label: '夜市', from: '16:00', to: '23:30' },
  'airport-early': { label: '早班', from: '05:30', to: '14:00', note: '第一班飛機 07:00 起飛' },
  'airport-late': { label: '晚班', from: '13:00', to: '21:30', note: '送走最後一班飛機' }
};

// How fast the strays walk (units per town minute) when the street layer gives no estimate.
export const ANIMAL_SPEED = { cat: 2.6, dog: 2.4 };

// How the day's times wobble (minutes).
export const TIME = {
  jitter: 15,     // a boundary inside a stay moves up to this much from day to day
  wave: 30,       // a walk slides up to this much so the town does not all leave at once
  flex: 30,       // flexible start: a personal offset, the same every day
  minStay: 15,    // a stay never shrinks below this (or below its own length if shorter)
  remnant: 4      // a stay shorter than this between two walks is dropped
};

// Roles with a flexible start (office hours drift by person, not the shift trades).
export const FLEX_KINDS = ['office', 'workshop', 'depot', 'bank', 'civic', 'hosp-admin', 'shop', 'zoo'];

// Travel time a walk is given at least: base + distance / speed, clamped (town minutes).
export const TRAVEL = { margin: 8, base: 6, unitsPerMinute: 14, min: 5, max: 40 };

// Opening hours for visitors where data/buildings.js gives none ([open, close)).
// Staff keep their own hours; parks, plazas and the station never close.
export const VISITOR_HOURS = {
  mall: ['10:00', '22:00'],
  'annex-mall': ['10:00', '21:30'],
  market: ['06:00', '13:00'],
  amusement: ['09:00', '21:00'],
  library: ['08:30', '21:00'],
  sports: ['05:30', '22:00'],
  clinic: ['08:30', '21:00'],
  hospital: ['08:00', '21:00']
};

// Days off where data gives no `restDays`: how many days in a row, and which weekdays
// the first may fall on (0 = Monday). Teams are spread so the days off rotate evenly.
export const REST = {
  shop: { days: 2, starts: [0, 1, 2, 3] },        // shop staff: two weekdays in a row
  stall: { days: 1, starts: [0, 1, 2, 3, 4, 5, 6] },  // night-market stall holders
  market: { days: 1, starts: [0, 1, 2, 3, 4, 5, 6] }, // market traders
  depot: { days: 2, starts: [0, 1, 2, 3, 4, 5, 6] },
  driver: { days: 2, starts: [0, 1, 2, 3, 4, 5, 6] },
  doctor: { days: 2, starts: [0, 1, 2, 3, 4, 5, 6] },
  nurse: { days: 2, starts: [0, 1, 2, 3, 4, 5, 6] },
  officer: { days: 2, starts: [0, 1, 2, 3, 4, 5, 6] },
  sanitation: { days: 1, starts: [0, 1, 2, 3, 4, 5, 6] },
  fire: { days: 2, starts: [0, 1, 2, 3, 4, 5, 6] },
  airport: { days: 2, starts: [0, 1, 2, 3, 4, 5, 6] },
  zoo: { days: 2, starts: [0, 1, 2, 3, 4, 5, 6] },          // the zoo opens every day: keepers rotate
  'hosp-admin': { fixed: [5, 6] }                   // hospital office staff: weekends
};

// Office towers: who stays late one weekday, and who comes in on alternate Saturdays.
export const OFFICE = {
  overtime: { 't-one': 0.5, 't-three': 0.45, 't-two': 0.3, 't-four': 0.25 },
  overtimeEnds: ['19:30', '21:00'],
  saturday: { 't-one': 0.25, 't-three': 0.25 },
  nightMarket: 0.45,  // eat supper at the night market on two weekdays
  errand: 0.3         // a lunchtime errand at the bank or the town office once a week
};

// Bank staff take turns on Saturday mornings (half each week).
export const BANK_SATURDAY = 0.5;

// Weekend duty: staff of places shut at the weekend take turns minding them. Each
// such place keeps a pool of `perSite`; half the pool is on each weekend day, the
// halves swap every week. `mallGuards` more keep watch at the two malls.
export const WEEKEND_DUTY = { perSite: 4, mallGuards: 4, from: '08:30', to: '17:30' };

export const SHARE = {
  worker: { nightMarket: 0.3 },
  shop: { closing: 0.5 },          // shop staff on the closing shift
  primary: { afterSchool: 0.25, weekendOut: 0.5 },
  secondary: { library: 0.3, fridayOut: 0.4, weekendOut: 0.7, weekendSupper: 0.55 },
  university: { nightMarket: 0.55, shopping: 0.5, weekendSupper: 0.6 },
  preschool: { stroller: 0.85 },
  adult: { morningOut: 0.5, afternoonOut: 0.45, nightMarket: 0.65 },
  retiree: { exercise: 0.75, stroller: 1 / 3, squareDance: 0.25, market: 0.55, checkUp: 0.12, pension: 0.1, boardGames: 0.5 },
  senior: { exercise: 0.5, stroller: 1 / 3, squareDance: 0.08, market: 0.3, checkUp: 0.2, pension: 0.1, hangout: 0.35 },
  unemployed: { civic: 0.5, nightMarket: 0.5 },
  family: { out: 0.7, nightMarket: 0.45 },
  couple: { out: 0.5, nightMarket: 0.5 },
  friends: { fridays: 2 / 3, nightMarket: 0.7 },
  // Places beyond the old town: worship at the temple, a car's weekly fill-up.
  temple: { retiree: 0.3, senior: 0.35, days: 2 },   // elders who go to the temple, on this many mornings a week
  refuel: { days: 2 }                                // people who drive fill up on this many days a week
};

// The night market, the town's centrepiece. Beyond the habits above, on any evening a
// share of people who are free sup there at a time of their own between 18:05 and
// 21:00 (spreading arrivals), and some young people go for a late snack.
export const NIGHT = {
  supper: { weekday: 0.46, friday: 0.5, weekend: 0.72, from: '18:05', to: '21:00', stay: [55, 95] },
  late: { share: 0.4, weekendShare: 0.45, maxAge: 35, from: '21:15', to: '22:15', stay: [45, 65] },
  overflow: 1.3     // the market may hold this much of its capacity before visitors are sent elsewhere
};

// Circles of old friends: which afternoons, the two sittings on a bench, how far
// from home a bench may be, how many circles share one bench.
export const CIRCLES = { daysPerWeek: 5, sittings: ['14:30', '16:15'], sit: 80, radius: 220, perBench: 2 };

// The mayor's Tuesday and Thursday rounds, in rotation by week (site kinds).
export const INSPECTIONS = ['market', 'primary', 'park', 'station', 'hospital', 'park'];
export const MAYOR = { inspectionDays: [1, 3], dateDays: [0, 2, 4] };
