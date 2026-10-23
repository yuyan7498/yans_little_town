// Not a test: late-trip report over real plans. node test/street-net/real-report.mjs [days]
import { realStreet } from './real.js';
const t0 = performance.now();
const s = realStreet(3);
console.log('build', (performance.now() - t0).toFixed(0), 'ms');
for (const day of (process.argv[2] || '1').split(',').map(Number)) {
  const t1 = performance.now();
  const d = s.trips.tripsFor(day);
  const ms = performance.now() - t1;
  const by = {};
  let late = 0;
  for (const t of d.list) {
    const l = t.arrive > t.end + 5; if (l) late++;
    const m = by[t.mode] || (by[t.mode] = { n: 0, late: 0 }); m.n++; if (l) m.late++;
  }
  console.log('day', day, d.list.length, 'trips', ms.toFixed(0), 'ms; late', late, JSON.stringify(by));
  if (process.env.SHOW) for (const t of d.list.filter(t => t.arrive > t.end + 5).slice(0, +process.env.SHOW)) console.log(t.key, t.mode, t.from, t.to, 'win', t.end - t.start, 'dep', t.depart.toFixed(0), 'arr', t.arrive.toFixed(0), 'end', t.end, 'earliest', t.earliest, !!t.leader, t.followers && t.followers.length, 'need', (t.arrive - t.depart).toFixed(0));
}
