// What a resident looks like: a plain, deterministic description built from their
// role, age, job, family and a hash of their id. Never from gender — residents carry
// none — so hair styles and lengths, skirts or trousers, builds and colours are all
// drawn freely by hash. The figure builder (build.js) turns this into geometry.
//
// appearanceOf(resident) → {
//   id, role, look (role, or 'mayor' / 'president'), age, stage, height, build, skin,
//   hair {style, color}, glasses, blush,
//   top {color, sleeves 'short'|'long', collar, tie, stripe, logo, hood, pocket},
//   outer {kind 'blazer'|'cardigan'|'jacket'|'coat'|'track'|'gown', color, trim, long} | null,
//   vest {color, strip, open} | null, apron {color, bib, long} | null,
//   bottom {kind 'trousers'|'shorts'|'skirt', color, stripe, belt}, socks, shoes {kind, color, sole},
//   gloves, hat {kind, color, trim} | null, bag {kind, color, trim} | null,
//   extras [{kind, color}], prop {kind 'cane'|'iv'|'briefcase'|'nylon', color} | null,
//   helmet (colour worn on a scooter), stoop (0..0.5 rad), gait {step, swing}, idle }

import { hash } from '../../core/random.js';
import * as P from './palette.js';

export const ROLES = ['preschooler', 'student-p', 'student-m', 'student-u', 'office', 'worker', 'shopkeeper', 'driver', 'teacher',
  'school-admin', 'medical-doc', 'medical-nurse', 'hosp-admin', 'officer', 'clerk', 'sanitation', 'unemployed', 'patient', 'retiree', 'senior'];
export const LOOKS = [...ROLES, 'mayor', 'president'];

// Heights (adult 4.3 with hips at 1.85; see docs/CONVENTIONS.md).
export const ADULT_HEIGHT = 4.3;
const TODDLER_HEIGHTS = [2.2, 2.2, 2.34, 2.46, 2.57, 2.68];   // by age 0..5

export function heightForAge(age, u = 0.5) {
  if (age <= 5) return TODDLER_HEIGHTS[Math.max(0, Math.round(age))] + (u - 0.5) * 0.08;
  if (age <= 12) return 3.0 + (age - 6) / 6 * 0.5 + (u - 0.5) * 0.1;
  if (age <= 17) return 3.72 + (age - 13) / 4 * 0.36 + (u - 0.5) * 0.12;
  let h = ADULT_HEIGHT * (0.955 + 0.09 * u);
  if (age >= 65) h *= 1 - Math.min(0.05, (age - 65) * 0.0025);
  return h;
}

export function stageOf(age) {
  return age <= 5 ? 'tot' : age <= 12 ? 'child' : age <= 17 ? 'teen' : age <= 29 ? 'young' : age <= 54 ? 'adult' : age <= 69 ? 'mature' : 'elder';
}

// A well-mixed number in [0, 1) per (id, key): every trait has its own key, so adding
// a trait never reshuffles the others.
function mix(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
function dice(id) {
  const u = key => mix(hash(id + '|' + key)) / 4294967296;
  return {
    u,
    chance: (key, p) => u(key) < p,
    pick: (key, list) => list[Math.floor(u(key) * list.length)],
    weigh(key, pairs) {
      let total = 0;
      for (const pair of pairs) total += pair[1];
      let x = u(key) * total;
      for (const pair of pairs) if ((x -= pair[1]) < 0) return pair[0];
      return pairs[pairs.length - 1][0];
    }
  };
}

const HAIR_STYLES = {
  tot: [['tuft', 2], ['crop', 3], ['bowl', 3], ['bob', 3], ['twin', 2], ['pony', 1]],
  child: [['crop', 3], ['short', 3], ['bowl', 2], ['bob', 3], ['pony', 2], ['twin', 1], ['long', 2], ['spiky', 1]],
  teen: [['crop', 3], ['short', 3], ['spiky', 2], ['bob', 2], ['long', 2], ['pony', 2], ['curtain', 2], ['side', 1]],
  young: [['crop', 3], ['short', 3], ['side', 2], ['curtain', 2], ['bob', 2], ['long', 3], ['pony', 2], ['bun', 2], ['spiky', 1]],
  adult: [['crop', 3], ['short', 3], ['side', 3], ['bob', 2], ['long', 2], ['pony', 2], ['bun', 2], ['buzz', 1]],
  mature: [['short', 3], ['side', 3], ['crop', 2], ['bob', 2], ['perm', 3], ['bun', 1], ['buzz', 1], ['thin', 1]],
  elder: [['short', 3], ['perm', 4], ['crop', 2], ['thin', 2], ['bald', 1], ['bun', 2], ['buzz', 1]]
};
// Tied-back hair for jobs where long hair is kept up.
const TIED = { long: 'bun', bob: 'pony', twin: 'pony' };

function hairFor(d, stage, { tied = false, neat = false } = {}) {
  let style = d.weigh('hair', HAIR_STYLES[stage]);
  if (tied && TIED[style]) style = TIED[style];
  if (neat && (style === 'spiky' || style === 'curtain')) style = 'side';
  const pool = stage === 'elder' ? P.HAIR.grey : stage === 'mature' ? P.HAIR.greying
    : stage === 'young' || stage === 'teen' ? P.HAIR.young : P.HAIR.adult;
  let color = d.weigh('hair-colour', pool);
  if (stage === 'adult' && d.chance('grey-early', 0.12)) color = '#57524d';
  if (neat && pool === P.HAIR.young) color = d.weigh('hair-colour', P.HAIR.adult);
  return { style, color };
}

const glassesFor = (d, p) => (d.chance('glasses', p) ? d.pick('glasses-colour', P.GLASSES) : null);
const sneakers = d => ({ kind: 'sneakers', color: d.pick('shoe', P.SNEAKER), sole: '#f4f2ec' });
const leather = d => ({ kind: 'shoes', color: d.pick('shoe-leather', P.LEATHER), sole: '#1a1918' });
const slippers = () => ({ kind: 'slippers', color: '#2f6fc4', sole: '#f4f2ec' });   // 藍白拖
const skirtOrTrousers = (d, key, pSkirt, skirtColours, trouserColours) =>
  d.chance(key, pSkirt) ? { kind: 'skirt', color: d.pick(key + '-colour', skirtColours) } : { kind: 'trousers', color: d.pick(key + '-colour', trouserColours) };

function base(resident, d) {
  const age = Number.isFinite(resident.age) ? resident.age : 30;
  const stage = stageOf(age);
  return {
    id: String(resident.id), role: resident.role, look: resident.role, age, stage,
    height: heightForAge(age, d.u('height')),
    build: 0.9 + 0.22 * d.u('build'),
    skin: d.weigh('skin', P.SKIN),
    hair: hairFor(d, stage),
    glasses: null, blush: stage === 'tot' || stage === 'child',
    top: { color: d.pick('tee', P.TEE), sleeves: 'short', collar: null, tie: null, stripe: null, logo: null, hood: null, pocket: false },
    outer: null, vest: null, apron: null,
    bottom: { kind: 'trousers', color: d.pick('bottom', P.DENIM), stripe: null, belt: null },
    socks: null, shoes: sneakers(d), gloves: null, hat: null, bag: null, extras: [], prop: null,
    helmet: stage === 'tot' || stage === 'child' ? d.pick('helmet', P.KIDHELMET) : d.pick('helmet', P.HELMET),
    stoop: 0, gait: { step: 0.42, swing: 0.34 }, idle: 'relaxed'
  };
}

// --- the twenty looks ------------------------------------------------------

const LOOK = {
  preschooler(a, d) {
    a.top = { ...a.top, color: d.pick('tee', P.BRIGHT) };
    a.bottom = { kind: d.pick('bottom-kind', ['shorts', 'shorts', 'trousers', 'skirt']), color: d.pick('bottom', ['#2f4462', '#5f7ea6', '#d9534f', '#f39ac0', '#c9b48a', '#f4f1ea', '#6b7a4a']), stripe: null, belt: null };
    a.shoes = { kind: 'sneakers', color: d.pick('shoe', ['#e04a4a', '#3f7fd8', '#f39ac0', '#f6c431', '#8bd150', '#f4f2ec']), sole: '#f4f2ec' };
    a.socks = '#f7f6f2';
    if (a.age >= 3 && d.chance('kinder-hat', 0.45)) a.hat = { kind: 'kinder', color: d.pick('hat', ['#f6c431', '#f6c431', '#6cc4f5', '#ff8fab', '#ffffff']), trim: null };
    if (a.age >= 3 && d.chance('kidpack', 0.7)) a.bag = { kind: 'kidpack', color: d.pick('bag', P.KIDPACK), trim: '#f7f6f2' };
    a.gait = { step: 0.5, swing: 0.42 };
  },
  'student-p'(a, d) {
    a.top = { ...a.top, color: '#f8f8f4', collar: '#f8f8f4', logo: '#2f63b0' };
    a.bottom = { kind: d.chance('skirt', 0.5) ? 'skirt' : 'shorts', color: '#1f2a4a', stripe: null, belt: null };
    a.socks = '#f7f6f2';
    a.shoes = { kind: 'sneakers', color: d.pick('shoe', ['#f4f2ec', '#f4f2ec', '#2b2c30', '#3c5a8a']), sole: '#f4f2ec' };
    if (d.chance('safety-cap', 0.88)) a.hat = { kind: 'safety', color: '#f7d417', trim: null };   // 小黃帽
    a.bag = d.chance('randoseru', 0.85) ? { kind: 'randoseru', color: d.pick('bag', P.RANDOSERU), trim: '#e8e2d4' }
      : { kind: 'backpack', color: d.pick('bag', P.KIDPACK), trim: null };
    a.glasses = glassesFor(d, 0.12);
    a.gait = { step: 0.52, swing: 0.48 };
  },
  'student-m'(a, d) {
    // The school track suit (運動服): navy with white collar and a light-blue stripe.
    const summer = d.chance('summer-pe', 0.35);
    a.top = { ...a.top, color: summer ? '#f8f8f4' : P.TRACK.jacket, sleeves: summer ? 'short' : 'long', collar: P.TRACK.trim, stripe: P.TRACK.stripe };
    if (!summer) a.outer = { kind: 'track', color: P.TRACK.jacket, trim: P.TRACK.trim, long: false };
    a.bottom = { kind: 'trousers', color: P.TRACK.pants, stripe: P.TRACK.stripe, belt: null };
    a.shoes = { kind: 'sneakers', color: d.pick('shoe', ['#f4f2ec', '#2b2c30', '#f4f2ec', '#8e9298']), sole: '#f4f2ec' };
    if (d.chance('backpack', 0.85)) a.bag = { kind: 'backpack', color: d.pick('bag', ['#2b2c30', '#1f2a4a', '#5d636b', '#3a4a5e', '#55603f']), trim: null };
    a.glasses = glassesFor(d, 0.35);
    a.gait = { step: 0.46, swing: 0.36 };
  },
  'student-u'(a, d) {
    const kind = d.weigh('outfit', [['tee', 5], ['hoodie', 2], ['shirt', 2], ['jacket', 1]]);
    a.top = { ...a.top, color: d.pick('tee', P.TEE), sleeves: kind === 'tee' ? 'short' : 'long' };
    if (kind === 'hoodie') a.top = { ...a.top, color: d.pick('hoodie', P.HOODIE), hood: true, pocket: true };
    if (kind === 'shirt') a.outer = { kind: 'jacket', color: d.pick('flannel', ['#a3423a', '#3f6b57', '#2f3b55', '#c49a3d', '#6b4f7a']), trim: null, long: false };
    if (kind === 'jacket') a.outer = { kind: 'jacket', color: d.pick('denim-jacket', ['#5f7ea6', '#3b5578', '#6b6f45', '#2d2f33']), trim: null, long: false };
    a.bottom = { kind: d.weigh('bottom-kind', [['trousers', 6], ['shorts', 2], ['skirt', 2]]), color: d.pick('bottom', [...P.DENIM, '#efe3c8', '#2d2f33', '#8a7a62']), stripe: null, belt: null };
    a.bag = d.chance('bag', 0.55) ? { kind: 'backpack', color: d.pick('bag-colour', P.BAG), trim: null }
      : d.chance('tote', 0.7) ? { kind: 'tote', color: d.pick('tote', P.TOTE), trim: null } : null;
    if (d.chance('cap', 0.16)) a.hat = { kind: d.pick('cap-kind', ['cap', 'bucket']), color: d.pick('cap-colour', ['#2d2f33', '#efe3c8', '#55603f', '#2f3b55']), trim: null };
    if (d.chance('headphones', 0.12)) a.extras.push({ kind: 'headphones', color: d.pick('phones', ['#f4f1ea', '#2d2f33']) });
    a.glasses = glassesFor(d, 0.38);
  },
  office(a, d, r) {
    const job = r.job || '';
    const fam = r.family;
    if (/機長/.test(job)) {   // 小鎮航空's pilots: white shirt, black tie, gold epaulettes, peaked cap
      a.hair = hairFor(d, a.stage, { tied: true, neat: true });
      a.top = { ...a.top, color: '#fbfbf8', sleeves: d.chance('sleeves', 0.5) ? 'long' : 'short', collar: 'self', tie: '#15181f' };
      a.bottom = { kind: 'trousers', color: '#1d2433', stripe: null, belt: '#111213' };
      a.hat = { kind: 'peaked', color: '#1d2433', trim: '#d8b54a' };
      a.shoes = { kind: 'shoes', color: '#111213', sole: '#111213' };
      a.extras.push({ kind: 'epaulettes', color: '#d8b54a' }, { kind: 'badge', color: '#d8b54a' });
      a.prop = d.chance('case', 0.5) ? { kind: 'briefcase', color: '#1e1c1b' } : null;
      a.bag = null; a.glasses = glassesFor(d, 0.2);
      return;
    }
    if (/空服/.test(job)) {   // cabin crew: the airline's teal, an orange scarf, hair neatly up
      a.hair = hairFor(d, a.stage, { tied: true, neat: true });
      a.top = { ...a.top, color: '#fbfbf8', sleeves: 'long', collar: 'self' };
      a.outer = { kind: 'blazer', color: '#1f6f6a', trim: '#e8862e', long: false };
      a.bottom = skirtOrTrousers(d, 'bottom', 0.55, ['#1f6f6a'], ['#1f6f6a', '#1d2433']);
      a.extras.push({ kind: 'scarf', color: '#e8862e' }, { kind: 'pin', color: '#d8b54a' });
      a.shoes = leather(d);
      a.bag = null; a.glasses = null;
      a.idle = 'front';
      return;
    }
    if (/保全/.test(job)) {   // night security guards
      a.top = { ...a.top, color: '#cfdcea', sleeves: 'long', collar: '#cfdcea', tie: '#1f2a44' };
      a.bottom = { kind: 'trousers', color: '#1f2a44', stripe: null, belt: '#1a1918' };
      a.hat = { kind: 'peaked', color: '#1f2a44', trim: '#c9a64a' };
      a.shoes = leather(d);
      a.extras.push({ kind: 'epaulettes', color: '#1f2a44' }, { kind: 'radio', color: '#2a2a2c' });
      a.hair = hairFor(d, a.stage, { tied: true, neat: true });
      return;
    }
    const casual = fam === 'creative' || (fam === 'tech' && d.chance('tech-casual', 0.4));
    a.hair = hairFor(d, a.stage, { neat: !casual });
    if (casual) {
      a.top = { ...a.top, color: d.pick('tee', P.TEE), sleeves: d.chance('sleeves', 0.5) ? 'long' : 'short' };
      if (d.chance('hoodie', 0.25)) a.top = { ...a.top, color: d.pick('hoodie', P.HOODIE), sleeves: 'long', hood: true };
      else if (d.chance('overshirt', 0.35)) a.outer = { kind: 'jacket', color: d.pick('overshirt', ['#55603f', '#2f3b55', '#c9b48a', '#2d2f33', '#7a3a3f']), trim: null, long: false };
      a.bottom = skirtOrTrousers(d, 'bottom', 0.18, P.SKIRT, [...P.DENIM, ...P.CHINOS]);
      a.shoes = sneakers(d);
      if (d.chance('cap', 0.12)) a.hat = { kind: 'cap', color: d.pick('cap-colour', ['#2d2f33', '#efe3c8', '#2f3b55']), trim: null };
    } else {
      a.top = { ...a.top, color: d.pick('shirt', P.SHIRT), sleeves: d.chance('short-sleeves', 0.3) ? 'short' : 'long', collar: 'self' };
      const blazerOdds = fam === 'finance' || fam === 'firm' ? 0.5 : 0.3;
      if (d.chance('blazer', blazerOdds)) a.outer = { kind: 'blazer', color: d.pick('blazer-colour', P.BLAZER), trim: null, long: false };
      else if (d.chance('cardigan', 0.12)) a.outer = { kind: 'cardigan', color: d.pick('cardigan', P.CARDIGAN), trim: null, long: false };
      if (d.chance('tie', a.outer && a.outer.kind === 'blazer' ? 0.45 : 0.15)) a.top.tie = d.pick('tie-colour', ['#24314f', '#7a2f3a', '#2f5fa8', '#3f6b57', '#5d636b']);
      a.bottom = skirtOrTrousers(d, 'bottom', 0.28, P.SKIRT, P.SLACKS);
      a.bottom.belt = a.bottom.kind === 'trousers' ? '#1e1c1b' : null;
      a.shoes = fam === 'tech' && d.chance('tech-sneakers', 0.5) ? sneakers(d) : leather(d);
    }
    if (d.chance('lanyard', fam === 'creative' ? 0.4 : 0.75)) a.extras.push({ kind: 'lanyard', color: d.pick('lanyard', P.LANYARD) });
    if (d.chance('briefcase', 0.14)) a.prop = { kind: 'briefcase', color: d.pick('case', ['#2a221d', '#1e1c1b', '#4a3426']) };
    else if (d.chance('bag', 0.3)) a.bag = d.chance('satchel', 0.5) ? { kind: 'satchel', color: d.pick('satchel', P.BAG), trim: null } : { kind: 'tote', color: d.pick('tote', P.TOTE), trim: null };
    a.glasses = glassesFor(d, 0.42);
    if (d.chance('front-hands', 0.2)) a.idle = 'front';
  },
  worker(a, d, r) {
    const job = r.job || '';
    if (r.family === 'aviation') {
      a.hair = hairFor(d, a.stage, { tied: true });
      if (/塔台|櫃台/.test(job)) {   // the tower and the check-in desks: the airline's shirt and a lanyard
        const desk = /櫃台/.test(job);
        a.top = { ...a.top, color: desk ? '#fbfbf8' : '#cfdcea', sleeves: 'long', collar: 'self', tie: desk ? null : '#1d2433' };
        if (desk) a.extras.push({ kind: 'scarf', color: '#1f6f6a' });
        a.bottom = skirtOrTrousers(d, 'bottom', 0.3, ['#1d2433'], ['#1d2433']);
        a.shoes = leather(d);
        a.extras.push({ kind: 'lanyard', color: '#1f6f6a' });
      } else {                        // ramp, baggage and maintenance: navy overalls, a hi-vis vest, ear defenders
        a.top = { ...a.top, color: '#2a3550', sleeves: 'long', collar: 'self', pocket: true };
        a.bottom = { kind: 'trousers', color: '#2a3550', stripe: '#e6e9ea', belt: null };
        a.vest = { color: d.pick('hi-vis', ['#ff7a1f', '#f5d21f']), strip: '#e6e9ea', open: false };
        a.shoes = { kind: 'boots', color: '#1f2023', sole: '#1a1a1a' };
        a.gloves = d.chance('gloves', 0.6) ? '#f0ede4' : null;
        a.extras.push({ kind: 'headphones', color: '#e8b531' });
      }
      a.glasses = glassesFor(d, 0.2);
      return;
    }
    if (r.family === 'zoo') {     // keepers: khaki shirt, olive trousers or shorts, a wide hat, boots; the vets wear white coats
      a.hair = hairFor(d, a.stage, { tied: true });
      a.top = { ...a.top, color: '#c2ad7a', sleeves: d.chance('sleeves', 0.4) ? 'long' : 'short', collar: 'self', pocket: true, logo: '#4f7d45' };
      a.bottom = { kind: d.chance('shorts', 0.35) ? 'shorts' : 'trousers', color: '#5d6640', stripe: null, belt: '#3b2d1f' };
      a.shoes = { kind: 'boots', color: d.pick('boots', ['#3b2d1f', '#2a2622']), sole: '#1a1a1a' };
      if (/獸醫/.test(job)) a.outer = { kind: 'coat', color: P.WHITE_COAT, trim: null, long: false };
      else a.hat = { kind: d.chance('sun', 0.6) ? 'sun' : 'cap', color: d.pick('hat', ['#c9b48a', '#8a9a6a', '#efe6cf']), trim: null };
      a.gloves = d.chance('gloves', 0.3) ? '#8a7a52' : null;
      a.glasses = glassesFor(d, 0.25);
      return;
    }
    if (r.family === 'market') {
      // Traditional market: tee, a long waterproof apron, rubber boots, a towel or visor.
      a.top = { ...a.top, color: d.pick('tee', [...P.TEE, ...P.POLO]), sleeves: d.chance('sleeves', 0.25) ? 'long' : 'short' };
      a.apron = { color: d.pick('apron', P.MARKET_APRON), bib: true, long: true };
      a.bottom = { kind: d.chance('shorts', 0.3) ? 'shorts' : 'trousers', color: d.pick('bottom', [...P.CHINOS, '#2d2f33']), stripe: null, belt: null };
      a.shoes = { kind: 'boots', color: d.pick('boots', P.BOOTS), sole: '#2a2a2c' };
      if (d.chance('towel', 0.45)) a.extras.push({ kind: 'towel', color: d.pick('towel', ['#f4f1ea', '#e8d7a0', '#a8c9e0']) });
      if (d.chance('visor', 0.3)) a.hat = { kind: d.pick('hat-kind', ['visor', 'cap', 'bucket']), color: d.pick('hat', P.SUN_HAT), trim: null };
      if (d.chance('gloves', 0.25)) a.gloves = d.pick('glove', ['#e8a23a', '#2f6fc4', '#f0ede4']);
      a.glasses = glassesFor(d, 0.2);
      return;
    }
    const logistics = r.family === 'logistics';
    const colour = logistics ? d.pick('company', P.LOGISTICS) : d.pick('work', P.WORK);
    if (/廠長|調度|管理/.test(job)) {
      a.top = { ...a.top, color: d.pick('shirt', P.SHIRT), sleeves: 'long', collar: 'self' };
      a.outer = { kind: 'jacket', color: colour, trim: null, long: false };
      a.bottom = { kind: 'trousers', color: d.pick('bottom', P.SLACKS), stripe: null, belt: '#1e1c1b' };
      a.shoes = leather(d);
      a.extras.push({ kind: 'lanyard', color: d.pick('lanyard', P.LANYARD) });
    } else if (logistics) {
      a.top = { ...a.top, color: colour, sleeves: d.chance('sleeves', 0.4) ? 'long' : 'short', collar: 'self', logo: '#f4f1ea' };
      a.bottom = { kind: 'trousers', color: d.pick('bottom', ['#2d2f33', '#4d5560', '#6d6a63', '#3b5578']), stripe: null, belt: null };
      a.shoes = { kind: 'sneakers', color: '#2b2c30', sole: '#5a5a5a' };
      a.gloves = d.chance('gloves', 0.6) ? d.pick('glove', P.GLOVES_WORK) : null;
      if (d.chance('cap', 0.5)) a.hat = { kind: 'cap', color: colour, trim: null };
      if (/搬運|分揀/.test(job) && d.chance('vest', 0.5)) a.vest = { color: '#d6ef3a', strip: P.SILVER, open: false };
    } else {
      // Workshop: a work jacket or overalls in the company colour, gloves, safety shoes.
      a.top = { ...a.top, color: colour, sleeves: 'long', collar: 'self', logo: '#f4f1ea', pocket: true };
      a.bottom = { kind: 'trousers', color: d.chance('match', 0.6) ? colour : d.pick('bottom', ['#2d2f33', '#4d5560', '#2f4462']), stripe: null, belt: null };
      a.shoes = { kind: 'shoes', color: '#2a2622', sole: '#4a3a2a' };
      a.gloves = d.chance('gloves', 0.55) ? d.pick('glove', P.GLOVES_WORK) : null;
      if (d.chance('cap', 0.4)) a.hat = { kind: 'cap', color: d.chance('cap-match', 0.5) ? colour : '#2d2f33', trim: null };
    }
    a.hair = hairFor(d, a.stage, { tied: true });
    a.glasses = glassesFor(d, 0.2);
  },
  shopkeeper(a, d, r) {
    // The outer town's counters: the gas stations, the cinema, the temple, the zoo's shop.
    const at = r.workKind;
    if (at === 'gas' || at === 'cinema' || at === 'temple' || at === 'zoo') {
      a.hair = hairFor(d, a.stage, { tied: true });
      if (at === 'gas') {
        a.top = { ...a.top, color: '#2f6fc4', sleeves: 'short', collar: 'self', logo: '#f5d21f' };
        a.vest = { color: '#f5d21f', strip: '#e6e9ea', open: false };
        a.hat = { kind: 'cap', color: '#2f6fc4', trim: null };
        a.bottom = { kind: 'trousers', color: '#2a3550', stripe: null, belt: null };
        a.gloves = d.chance('gloves', 0.5) ? '#f0ede4' : null;
        a.shoes = { kind: 'sneakers', color: '#2b2c30', sole: '#5a5a5a' };
      } else if (at === 'cinema') {
        a.top = { ...a.top, color: '#1c1d22', sleeves: 'short', collar: 'self', logo: '#f0c03a' };
        a.vest = { color: '#a3252c', strip: null, open: true };
        a.bottom = skirtOrTrousers(d, 'bottom', 0.3, ['#1c1d22'], ['#1c1d22']);
        a.shoes = leather(d);
        a.extras.push({ kind: 'lanyard', color: '#f0c03a' });
      } else if (at === 'temple') {
        a.top = { ...a.top, color: d.pick('shirt', ['#f4f1ea', '#d8cfb8', '#e6dcc6']), sleeves: 'long', collar: 'self' };
        a.vest = { color: '#8a2f24', strip: null, open: true };
        a.bottom = { kind: 'trousers', color: d.pick('bottom', ['#2d2f33', '#5a4f42']), stripe: null, belt: null };
        a.shoes = { kind: 'slippers', color: '#2d2f33', sole: '#1a1a1a' };
      } else {
        a.top = { ...a.top, color: '#c2ad7a', sleeves: 'short', collar: 'self', logo: '#4f7d45' };
        a.bottom = { kind: 'trousers', color: '#5d6640', stripe: null, belt: null };
        a.hat = { kind: 'cap', color: '#4f7d45', trim: null };
        a.shoes = sneakers(d);
      }
      a.glasses = glassesFor(d, 0.3);
      if (d.chance('front-hands', 0.3)) a.idle = 'front';
      return;
    }
    const job = r.job || '';
    a.top = { ...a.top, color: d.pick('tee', [...P.TEE, ...P.SHIRT]), sleeves: d.chance('sleeves', 0.4) ? 'long' : 'short' };
    a.bottom = skirtOrTrousers(d, 'bottom', 0.2, P.SKIRT, [...P.DENIM, ...P.CHINOS, '#2d2f33']);
    a.apron = { color: d.pick('apron', P.APRON), bib: d.chance('bib', 0.75), long: false };
    if (/廚師|甜點/.test(job)) {
      a.top = { ...a.top, color: '#f6f6f2', sleeves: 'long', collar: '#f6f6f2' };
      a.apron = { color: d.chance('dark-apron', 0.5) ? '#2d2f33' : '#f0eee8', bib: false, long: true };
      a.hat = { kind: 'chef', color: '#f8f8f4', trim: null };
      a.bottom = { kind: 'trousers', color: d.pick('chef-pants', ['#2d2f33', '#3a3d42', '#4a4d55']), stripe: null, belt: null };
    } else if (/專櫃|服飾|樓管|珠寶|手機|眼鏡/.test(job)) {
      // Shop-floor staff: a smart all-black or uniform look instead of an apron.
      a.apron = null;
      a.top = { ...a.top, color: d.pick('floor-top', ['#1f2023', '#f7f6f2', '#24314f', '#e9e7e1']), sleeves: 'long', collar: 'self' };
      if (d.chance('floor-blazer', 0.3)) a.outer = { kind: 'blazer', color: '#1f2023', trim: null, long: false };
      a.extras.push({ kind: 'badge', color: '#d8b54a' });
      a.shoes = leather(d);
    } else if (/藥師|驗光/.test(job)) {
      a.apron = null;
      a.outer = { kind: 'coat', color: P.WHITE_COAT, trim: null, long: false };
      a.top = { ...a.top, color: d.pick('shirt', P.SHIRT), sleeves: 'long', collar: 'self' };
    } else if (/便利商店/.test(job)) {
      a.apron = null;
      a.vest = { color: '#2f8a6a', strip: '#f0a03a', open: true };
    } else if (r.family === 'night') {
      if (d.chance('headband', 0.4)) a.hat = { kind: 'band', color: d.pick('band', ['#f4f1ea', '#c6372f', '#2f5fa8']), trim: null };
      else if (d.chance('towel', 0.35)) a.extras.push({ kind: 'towel', color: '#f4f1ea' });
      if (d.chance('slippers', 0.25)) a.shoes = slippers();
    } else if (/理髮/.test(job)) {
      a.top = { ...a.top, color: '#1f2023' };
      a.apron = { color: '#1f2023', bib: true, long: false };
    }
    a.hair = hairFor(d, a.stage, { tied: !!a.apron });
    a.glasses = glassesFor(d, 0.3);
  },
  driver(a, d, r) {
    const job = r.job || '';
    a.hair = hairFor(d, a.stage, { tied: true, neat: true });
    if (/公車|接駁|遊覽|客運/.test(job)) {
      // Bus driver: light-blue uniform shirt, navy trousers and tie, peaked cap.
      a.top = { ...a.top, color: d.pick('uniform', P.DRIVER.shirt), sleeves: d.chance('sleeves', 0.5) ? 'short' : 'long', collar: 'self', tie: P.DRIVER.tie, logo: '#2f5fa8' };
      a.bottom = { kind: 'trousers', color: P.DRIVER.trousers, stripe: null, belt: '#1a1918' };
      a.hat = { kind: 'peaked', color: P.DRIVER.cap, trim: P.DRIVER.band };
      a.extras.push({ kind: 'epaulettes', color: P.DRIVER.trousers });
      a.shoes = leather(d);
    } else if (/計程車/.test(job)) {
      a.top = { ...a.top, color: d.pick('polo', P.POLO), sleeves: 'short', collar: 'self' };
      a.bottom = { kind: 'trousers', color: d.pick('bottom', P.CHINOS), stripe: null, belt: '#1e1c1b' };
      a.hat = d.chance('cap', 0.5) ? { kind: 'cap', color: d.pick('cap-colour', ['#f2c230', '#2d2f33', '#2f3b55']), trim: null } : null;
      a.shoes = leather(d);
    } else {
      // Lorry and van drivers: a work polo, a cap and a reflective vest over it.
      a.top = { ...a.top, color: d.pick('work', P.WORK), sleeves: 'short', collar: 'self', logo: '#f4f1ea' };
      a.bottom = { kind: 'trousers', color: d.pick('bottom', ['#2d2f33', '#4d5560', '#3b5578']), stripe: null, belt: null };
      a.hat = { kind: 'cap', color: d.pick('cap-colour', ['#2d2f33', '#2f3b55', '#c6372f', '#e5793a']), trim: null };
      if (d.chance('vest', 0.5)) a.vest = { color: '#f2a23a', strip: P.SILVER, open: true };
      a.gloves = d.chance('gloves', 0.4) ? '#f0ede4' : null;
      a.shoes = { kind: 'sneakers', color: '#2b2c30', sole: '#5a5a5a' };
    }
    a.glasses = glassesFor(d, 0.3);
  },
  teacher(a, d, r) {
    const job = r.job || '';
    if (/體育/.test(job)) {
      a.top = { ...a.top, color: d.pick('polo', ['#2f5fa8', '#c6372f', '#2f7a5a', '#f4f1ea']), sleeves: 'short', collar: 'self' };
      a.outer = d.chance('track-top', 0.4) ? { kind: 'track', color: '#22336b', trim: '#f2f2ee', long: false } : null;
      a.bottom = { kind: 'trousers', color: '#1f2a52', stripe: '#f2f2ee', belt: null };
      a.extras.push({ kind: 'whistle', color: '#c6372f' });
      if (d.chance('cap', 0.5)) a.hat = { kind: 'cap', color: '#22336b', trim: null };
      return;
    }
    a.hair = hairFor(d, a.stage, { neat: true });
    a.top = { ...a.top, color: d.pick('knit', [...P.KNIT, ...P.SHIRT]), sleeves: 'long', collar: d.chance('collar', 0.6) ? 'self' : null };
    if (d.chance('cardigan', 0.6)) a.outer = { kind: 'cardigan', color: d.pick('cardigan', P.CARDIGAN), trim: null, long: false };
    else if (/講師|教授/.test(job) && d.chance('blazer', 0.6)) a.outer = { kind: 'blazer', color: d.pick('blazer-colour', P.BLAZER), trim: null, long: false };
    a.bottom = skirtOrTrousers(d, 'bottom', 0.3, P.SKIRT, P.CHINOS);
    a.shoes = d.chance('loafers', 0.6) ? leather(d) : sneakers(d);
    if (d.chance('tote', 0.35)) a.bag = { kind: 'tote', color: d.pick('tote', P.TOTE), trim: null };
    a.glasses = glassesFor(d, 0.5);
  },
  'school-admin'(a, d, r) {
    const job = r.job || '';
    a.hair = hairFor(d, a.stage, { neat: true });
    if (/護理/.test(job)) {
      a.top = { ...a.top, color: d.pick('scrubs', P.SCRUBS), sleeves: 'short', collar: null };
      a.bottom = { kind: 'trousers', color: a.top.color, stripe: null, belt: null };
      a.outer = { kind: 'cardigan', color: '#f4f4f0', trim: null, long: false };
      a.shoes = { kind: 'sneakers', color: '#f4f4f0', sole: '#f4f2ec' };
    } else if (/生教/.test(job)) {
      a.top = { ...a.top, color: '#f4f1ea', sleeves: 'short', collar: 'self' };
      a.outer = { kind: 'track', color: '#22336b', trim: '#f2f2ee', long: false };
      a.bottom = { kind: 'trousers', color: '#1f2a52', stripe: '#f2f2ee', belt: null };
      a.extras.push({ kind: 'whistle', color: '#c6372f' });
    } else {
      a.top = { ...a.top, color: d.pick('polo', [...P.POLO, ...P.SHIRT]), sleeves: d.chance('sleeves', 0.5) ? 'long' : 'short', collar: 'self' };
      if (d.chance('vest', 0.45)) a.vest = { color: d.pick('vest', P.CARDIGAN), strip: null, open: true };
      a.bottom = skirtOrTrousers(d, 'bottom', 0.3, P.SKIRT, P.CHINOS);
      a.shoes = leather(d);
    }
    a.extras.push({ kind: 'lanyard', color: '#2f63b0' });
    a.glasses = glassesFor(d, 0.45);
  },
  'medical-doc'(a, d, r) {
    const job = r.job || '';
    a.hair = hairFor(d, a.stage, { tied: true, neat: true });
    const scrubs = /外科|急診|麻醉|骨科|婦產/.test(job) && d.chance('scrubs', 0.6);
    a.top = scrubs ? { ...a.top, color: d.pick('scrubs', P.DOC_SCRUBS), sleeves: 'short', collar: null }
      : { ...a.top, color: d.pick('shirt', P.SHIRT), sleeves: 'long', collar: 'self', tie: d.chance('tie', 0.3) ? d.pick('tie-colour', ['#24314f', '#7a2f3a', '#2f5fa8']) : null };
    a.outer = { kind: 'coat', color: P.WHITE_COAT, trim: null, long: true };
    a.bottom = scrubs ? { kind: 'trousers', color: a.top.color, stripe: null, belt: null } : { kind: 'trousers', color: d.pick('slacks', P.SLACKS), stripe: null, belt: null };
    a.shoes = scrubs ? { kind: 'sneakers', color: '#f4f4f0', sole: '#f4f2ec' } : leather(d);
    a.extras.push({ kind: 'stethoscope', color: '#2a2c30' });
    if (d.chance('lanyard', 0.5)) a.extras.push({ kind: 'badge', color: '#2f63b0' });
    a.glasses = glassesFor(d, 0.5);
  },
  'medical-nurse'(a, d, r) {
    const job = r.job || '';
    a.hair = hairFor(d, a.stage, { tied: true });
    const colour = /急診|加護/.test(job) ? d.pick('ward', ['#3d6fa3', '#5aa3a0', '#2f4f6e']) : d.pick('scrubs', P.SCRUBS);
    a.top = { ...a.top, color: colour, sleeves: 'short', collar: null, pocket: true };
    a.bottom = { kind: 'trousers', color: colour, stripe: null, belt: null };
    if (d.chance('cardigan', 0.18)) a.outer = { kind: 'cardigan', color: d.pick('cardigan', ['#24314f', '#f4f4f0', '#2f3b55']), trim: null, long: false };
    a.shoes = { kind: 'sneakers', color: '#f4f4f0', sole: '#f4f2ec' };
    a.extras.push({ kind: 'badge', color: '#2f63b0' });
    if (/護理長/.test(job)) a.extras.push({ kind: 'stethoscope', color: '#2a2c30' });
    a.glasses = glassesFor(d, 0.3);
  },
  'hosp-admin'(a, d, r) {
    const job = r.job || '';
    a.hair = hairFor(d, a.stage, { neat: true });
    a.top = { ...a.top, color: d.pick('shirt', P.SHIRT), sleeves: 'long', collar: 'self' };
    if (/營養/.test(job)) a.outer = { kind: 'coat', color: P.WHITE_COAT, trim: null, long: false };
    else a.vest = { color: d.pick('vest', ['#7da7c9', '#24314f', '#5b8f9a']), strip: null, open: true };
    a.bottom = skirtOrTrousers(d, 'bottom', 0.3, P.SKIRT, P.SLACKS);
    a.shoes = leather(d);
    a.extras.push({ kind: 'lanyard', color: '#2f7a6a' });
    a.glasses = glassesFor(d, 0.45);
    if (d.chance('front-hands', 0.3)) a.idle = 'front';
  },
  officer(a, d, r) {
    if (r.family === 'fire') {
      // 小鎮消防隊 on duty at the station: navy work uniform with reflective bands, a cap, boots.
      a.hair = hairFor(d, a.stage, { tied: true, neat: true });
      a.top = { ...a.top, color: '#1f2a44', sleeves: d.chance('sleeves', 0.5) ? 'long' : 'short', collar: 'self', stripe: '#f5d21f', logo: '#c9483b' };
      a.bottom = { kind: 'trousers', color: '#1f2a44', stripe: '#e6e9ea', belt: '#111215' };
      a.hat = /隊長/.test(r.job || '') ? { kind: 'peaked', color: '#1f2a44', trim: '#c9483b' } : { kind: 'cap', color: '#a3252c', trim: null };
      a.extras.push({ kind: 'radio', color: '#111215' }, { kind: 'badge', color: '#d8b54a' });
      a.shoes = { kind: 'boots', color: '#111215', sole: '#111215' };
      a.glasses = glassesFor(d, 0.15);
      a.gait = { step: 0.44, swing: 0.32 };
      return;
    }
    // Taiwan police: dark navy uniform, peaked cap with badge, a fluorescent reflective vest.
    const chief = /所長/.test(r.job || '');
    a.hair = hairFor(d, a.stage, { tied: true, neat: true });
    a.top = { ...a.top, color: P.POLICE.uniform, sleeves: d.chance('sleeves', 0.5) ? 'long' : 'short', collar: 'self', tie: chief ? '#111215' : null };
    a.bottom = { kind: 'trousers', color: P.POLICE.trousers, stripe: null, belt: '#111215' };
    a.hat = { kind: 'police', color: P.POLICE.cap, trim: P.POLICE.badge };
    if (!chief && d.chance('vest', 0.8)) a.vest = { color: P.POLICE.vest, strip: P.POLICE.strip, open: false };
    a.extras.push({ kind: 'epaulettes', color: P.POLICE.uniform }, { kind: 'radio', color: '#111215' }, { kind: 'badge', color: P.POLICE.badge });
    a.shoes = { kind: 'shoes', color: '#111215', sole: '#111215' };
    a.glasses = glassesFor(d, 0.2);
    a.gait = { step: 0.42, swing: 0.3 };
  },
  clerk(a, d, r) {
    const bank = r.family === 'bank';
    const senior = /經理|襄理|主任/.test(r.job || '');
    a.hair = hairFor(d, a.stage, { neat: true });
    a.top = { ...a.top, color: bank ? '#f8f8f4' : d.pick('shirt', P.SHIRT), sleeves: 'long', collar: 'self' };
    if (bank) {
      if (senior) a.outer = { kind: 'blazer', color: d.pick('bank-blazer', P.BANK_VEST), trim: null, long: false };
      else a.vest = { color: d.pick('bank-vest', P.BANK_VEST), strip: null, open: true };
      if (d.chance('scarf', 0.5)) a.extras.push({ kind: 'scarf', color: d.pick('scarf-colour', P.SCARF) });
      else a.top.tie = d.pick('tie-colour', P.BANK_VEST);
      a.bottom = skirtOrTrousers(d, 'bottom', 0.45, [a.vest ? a.vest.color : a.outer.color, '#1f2126'], ['#1f2126', '#283247']);
    } else {
      // Town hall: shirt with a cardigan or a khaki service vest (里幹事), a staff badge.
      if (/里幹事/.test(r.job || '')) a.vest = { color: '#b49f7e', strip: null, open: true };
      else if (d.chance('cardigan', 0.4)) a.outer = { kind: 'cardigan', color: d.pick('cardigan', P.CARDIGAN), trim: null, long: false };
      a.bottom = skirtOrTrousers(d, 'bottom', 0.3, P.SKIRT, P.SLACKS);
      a.extras.push({ kind: 'lanyard', color: '#2f7a5a' });
    }
    a.shoes = leather(d);
    a.glasses = glassesFor(d, 0.45);
    if (d.chance('front-hands', 0.3)) a.idle = 'front';
  },
  sanitation(a, d) {
    // 清潔隊: fluorescent orange (or yellow) vest with reflective strips, cap, gloves, boots.
    a.hair = hairFor(d, a.stage, { tied: true });
    a.top = { ...a.top, color: d.pick('clothes', P.SANITATION.clothes), sleeves: 'long', collar: 'self' };
    a.vest = { color: d.pick('vest', P.SANITATION.vests), strip: P.SANITATION.strip, open: false };
    a.bottom = { kind: 'trousers', color: a.top.color, stripe: null, belt: null };
    a.hat = { kind: 'cap', color: d.pick('cap', P.SANITATION.cap), trim: null };
    a.gloves = d.pick('gloves', ['#f2c230', '#f0ede4', '#2f6fc4']);
    a.shoes = { kind: 'boots', color: d.pick('boots', ['#1f2023', '#1f2023', '#2f4f8a']), sole: '#1a1a1a' };
  },
  unemployed(a, d) {
    a.top = { ...a.top, color: d.pick('hoodie', P.HOODIE), sleeves: 'long', hood: true, pocket: true };
    if (d.chance('tee-only', 0.3)) a.top = { ...a.top, color: d.pick('tee', P.TEE), sleeves: 'short', hood: null, pocket: false };
    a.bottom = { kind: d.chance('shorts', 0.35) ? 'shorts' : 'trousers', color: d.pick('bottom', ['#2d2f33', '#8e9298', '#3b5578', '#55603f', '#26272b']), stripe: null, belt: null };
    a.shoes = d.chance('slippers', 0.35) ? slippers() : sneakers(d);
    if (d.chance('headphones', 0.3)) a.extras.push({ kind: 'headphones', color: d.pick('phones', ['#2d2f33', '#f4f1ea', '#c6372f']) });
    if (d.chance('beanie', 0.2)) a.hat = { kind: d.pick('hat-kind', ['beanie', 'cap', 'bucket']), color: d.pick('hat', ['#2d2f33', '#55603f', '#7a3a3f', '#efe3c8']), trim: null };
    if (d.chance('bag', 0.25)) a.bag = { kind: 'tote', color: d.pick('tote', P.TOTE), trim: null };
    a.glasses = glassesFor(d, 0.35);
    a.gait = { step: 0.4, swing: 0.24 };
  },
  patient(a, d) {
    // Hospital gown over pyjama trousers, slippers; some wheel a drip stand.
    const colour = d.pick('gown', P.GOWN);
    a.top = { ...a.top, color: colour, sleeves: 'short', collar: null, pocket: true };
    a.outer = { kind: 'gown', color: colour, trim: null, long: true };
    a.bottom = { kind: 'trousers', color: colour, stripe: null, belt: null };
    a.shoes = { kind: 'slippers', color: d.pick('slippers', ['#8e9298', '#f4f2ec', '#2f6fc4']), sole: '#f4f2ec' };
    a.extras.push({ kind: 'wristband', color: '#f4f4f0' });
    if (d.chance('drip', 0.35)) a.prop = { kind: 'iv', color: '#c9cdd1' };
    else if (a.age >= 70 && d.chance('cane', 0.4)) a.prop = { kind: 'cane', color: '#5a3a24' };
    if (a.age >= 72) a.stoop = 0.12 + Math.min(0.3, (a.age - 72) * 0.012) + 0.06 * d.u('stoop');
    a.gait = { step: 0.26, swing: 0.12 };
    a.glasses = glassesFor(d, a.age > 50 ? 0.5 : 0.2);
  },
  retiree(a, d) {
    const sporty = d.chance('sporty', 0.25);
    if (sporty) {
      a.top = { ...a.top, color: d.pick('polo', P.POLO), sleeves: 'short', collar: 'self' };
      if (d.chance('track-top', 0.5)) a.outer = { kind: 'track', color: d.pick('track', ['#2f3b55', '#7a2f3a', '#2e6f73', '#4d5560']), trim: '#f2f2ee', long: false };
      a.bottom = { kind: 'trousers', color: d.pick('track-pants', ['#2f3b55', '#2d2f33', '#4d5560']), stripe: '#f2f2ee', belt: null };
      a.hat = d.chance('visor', 0.6) ? { kind: 'visor', color: d.pick('visor', P.SUN_HAT), trim: null } : null;
      a.shoes = sneakers(d);
    } else {
      a.top = { ...a.top, color: d.pick('polo', [...P.POLO, ...P.KNIT]), sleeves: d.chance('sleeves', 0.35) ? 'long' : 'short', collar: d.chance('collar', 0.7) ? 'self' : null };
      if (d.chance('vest', 0.15)) a.vest = { color: d.pick('vest-colour', ['#8a7a62', '#55603f', '#2f3b55', '#d9c9a8']), strip: null, open: true, pockets: true };
      a.bottom = skirtOrTrousers(d, 'bottom', 0.2, ['#6d6a63', '#2f3b55', '#7a3b46', '#4a4d55'], [...P.CHINOS, '#6d6a63']);
      if (d.chance('sun-hat', 0.5)) a.hat = { kind: d.pick('hat-kind', ['bucket', 'sun', 'visor', 'cap']), color: d.pick('sun-hat', P.SUN_HAT), trim: null };
      a.shoes = d.chance('sandals', 0.15) ? slippers() : d.chance('walkers', 0.6) ? sneakers(d) : leather(d);
    }
    if (d.chance('fanny', 0.45)) a.bag = { kind: 'fanny', color: d.pick('fanny-colour', ['#2b2c30', '#3a4a5e', '#7b6a55', '#55603f']), trim: null };
    else if (d.chance('nylon', 0.25)) a.prop = { kind: 'nylon', color: '#c6372f' };   // the red-white-blue market bag
    a.glasses = glassesFor(d, 0.45);
    a.stoop = 0.03 * d.u('stoop');
    a.gait = { step: 0.38, swing: 0.28 };
    if (d.chance('behind', 0.25)) a.idle = 'behind';
  },
  senior(a, d) {
    a.top = { ...a.top, color: d.pick('shirt', ['#f4f1ea', '#efe4cf', '#dfe6ee', '#e9dfe6', '#d9d2b5']), sleeves: 'long', collar: 'self' };
    a.outer = d.chance('vest', 0.35) ? null : { kind: 'cardigan', color: d.pick('cardigan', P.CARDIGAN), trim: null, long: false };
    if (!a.outer) a.vest = { color: d.pick('vest-colour', ['#8a7a62', '#5c4b3f', '#2f3b55', '#7a3a3f', '#6b6f45']), strip: null, open: true };
    a.bottom = skirtOrTrousers(d, 'bottom', 0.2, ['#5c4b3f', '#2f3b55', '#4a4d55'], ['#5c4b3f', '#4a4d55', '#2f3b55', '#6d6a63', '#2d2f33']);
    a.shoes = d.chance('slippers', 0.3) ? slippers() : { kind: 'shoes', color: d.pick('shoe', ['#2a221d', '#4a3426', '#6d6a63', '#1e1c1b']), sole: '#2a2a2a' };
    if (d.chance('hat', 0.45)) a.hat = { kind: d.pick('hat-kind', ['flat', 'flat', 'bucket', 'sun']), color: d.pick('hat-colour', P.FLAT_CAP), trim: null };
    const caneOdds = 0.12 + Math.max(0, a.age - 71) * 0.03;
    if (d.chance('cane', caneOdds)) a.prop = { kind: 'cane', color: d.pick('cane', ['#5a3a24', '#3b2a20', '#8c949b']) };
    else if (d.chance('nylon', 0.15)) a.prop = { kind: 'nylon', color: '#c6372f' };
    a.stoop = 0.12 + Math.min(0.28, Math.max(0, a.age - 71) * 0.014) + 0.08 * d.u('stoop');
    a.glasses = glassesFor(d, 0.6);
    a.gait = { step: a.prop && a.prop.kind === 'cane' ? 0.26 : 0.3, swing: 0.16 };
    a.idle = d.chance('behind', 0.5) ? 'behind' : 'relaxed';
  }
};

// The mayor: a smart teal jacket with the town's gold pin, crisp shirt and a red tie —
// nobody else in town wears that colour.
function mayor(a, d) {
  a.look = 'mayor';
  a.hair = hairFor(d, a.stage, { neat: true });
  a.top = { ...a.top, color: '#f8f8f4', sleeves: 'long', collar: 'self', tie: '#b8323a' };
  a.outer = { kind: 'blazer', color: '#1c7a74', trim: '#d8b54a', long: false };
  a.bottom = { kind: 'trousers', color: '#2b2f36', stripe: null, belt: '#1e1c1b' };
  a.shoes = { kind: 'shoes', color: '#4a3426', sole: '#1a1918' };
  a.extras = [{ kind: 'pin', color: '#e2be4a' }];
  a.bag = null; a.hat = null; a.prop = null;
  a.idle = 'front';
}

// The president: a formal near-black suit, white shirt, a navy tie and a flag pin.
function president(a, d) {
  a.look = 'president';
  a.hair = hairFor(d, a.stage, { tied: true, neat: true });
  a.top = { ...a.top, color: '#fbfbf8', sleeves: 'long', collar: 'self', tie: '#1f3a7a' };
  a.outer = { kind: 'blazer', color: '#22252c', trim: null, long: false, suit: true };
  a.bottom = { kind: 'trousers', color: '#22252c', stripe: null, belt: null };
  a.shoes = { kind: 'shoes', color: '#111213', sole: '#111213' };
  a.extras = [{ kind: 'flagpin', color: '#c6372f' }];
  a.bag = null; a.hat = null; a.prop = null;
  a.glasses = null;
  a.idle = 'front';
}

// Age shapes everyone a little: greying for the old, a stoop past seventy.
function byAge(a, d) {
  if (a.stage === 'tot' && a.age <= 2) { a.bag = null; a.gait = { step: 0.4, swing: 0.3 }; }
  if (a.stage === 'elder' && a.role !== 'senior' && a.role !== 'patient') a.stoop = Math.max(a.stoop, 0.1 + 0.05 * d.u('stoop'));
  if (a.stage === 'mature' && !a.glasses && d.chance('reading-glasses', 0.25)) a.glasses = d.pick('glasses-colour', P.GLASSES);
}

export function appearanceOf(resident) {
  const d = dice(resident.id);
  const a = base(resident, d);
  const look = LOOK[resident.role] || LOOK.unemployed;
  look(a, d, resident);
  if (resident.schedule === 'mayor') mayor(a, d);
  if (resident.schedule === 'president') president(a, d);
  byAge(a, d);
  if (a.stoop) a.gait.step = Math.min(a.gait.step, 0.42 - a.stoop * 0.3);
  return a;
}
