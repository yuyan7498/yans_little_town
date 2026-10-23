// 檢查 data/ 裡的所有資料：node tools/check-data.mjs（或 npm run check）
// 有錯誤就以代碼 1 結束；--plans 會再把每位居民 28 天的行程都跑過一遍。
import { buildWorld } from '../src/core/world/index.js';
import { town, buildings, residents, relations, occupations, transit, loadProfiles } from '../src/core/data.js';
import { checkData, createPeople } from '../src/core/people/index.js';

const deep = process.argv.includes('--plans');
let world;
try { world = buildWorld(town, buildings); }
catch (e) {
  console.error('地圖資料（data/town.js、data/buildings.js）有問題：');
  for (const p of e.problems || [e.message]) console.error('  錯誤：' + p);
  process.exit(1);
}
const profiles = await loadProfiles();
const { errors, warnings, summary } = checkData({ world, residents, relations, occupations, profiles, strays: town.strays || null });

console.log(`居民 ${summary.residents} 位，家庭 ${summary.households} 戶，關係 ${summary.links} 組，接送 ${summary.pickUps} 組，好朋友群 ${summary.friendGroups}，老朋友圈 ${summary.circles}`);
console.log('住家人數／容量：' + Object.entries(summary.homes).map(([id, v]) => `${id} ${v}`).join('、'));

if (!errors.length && deep) {
  // With the street network available, plans are sized by the real travel estimator.
  let travel = null, how = '固定估計的走路時間';
  let people;
  try {
    const { createTravel } = await import('../src/core/street/trips.js');
    const { createNetwork } = await import('../src/core/street/network.js');
    const { createLines } = await import('../src/core/street/lines.js');
    const { planFurniture } = await import('../src/core/world/furniture.js');
    const spots = planFurniture(world).spots;
    const net = createNetwork(world, { spots });
    const lines = createLines(net, world, transit, { pace: 3 });
    people = createPeople({ world, residents, relations, occupations, buildings, town, travel: (id, a, b) => travel.minutes(id, a, b) });
    people.assignSpots(spots, (id, key) => net.doorOf(id, key));
    travel = createTravel({ world, net, lines, residents: people.residents, pace: 3 });
    how = '街道網路的真實旅行時間';
  } catch (e) {
    console.log('（沒有街道估算器，改用固定估計：' + String(e.message).slice(0, 80) + '）');
    travel = null;
    people = createPeople({ world, residents, relations, occupations, buildings, town });
  }
  let bad = 0;
  const t0 = performance.now();
  for (let d = 1; d <= 28; d++) for (const p of people.validateDay(d)) { errors.push('行程：' + p); bad++; }
  console.log(`行程檢查（${how}）：28 天 × ${people.residents.length} 位，${bad} 個問題（${Math.round(performance.now() - t0)} 毫秒）`);
}
for (const w of warnings) console.log('  提醒：' + w);
for (const e of errors) console.log('  錯誤：' + e);
console.log(errors.length ? `\n有 ${errors.length} 個錯誤、${warnings.length} 個提醒，請修正後再執行。` : `\n沒有錯誤（${warnings.length} 個提醒）。`);
process.exit(errors.length ? 1 : 0);
