// tools/preview.html?m=src/render/people/index.js
//   &view=lineup (default)  every look in walk / stand / scooter / pillion / bench / stool rows
//   &view=crowd             a few hundred residents walking about the plaza
//   &view=rows              the given rows only: &rows=walk,stand   &v=<variation index>
// Use cam=… to look closer, e.g. cam=63,14,118,63,2,112
import { createCrowd } from './crowd.js';
import { LOOKS } from './appearance.js';
import { SEATS } from '../props/seats.js';
import { residents } from '../../core/data.js';

const ROWS = ['walk', 'stand', 'scooter', 'pillion', 'bicycle', 'bench', 'stool', 'chess'];

function pickFor(look, v) {
  const match = r => (look === 'mayor' || look === 'president' ? r.schedule === look : r.role === look && !r.schedule);
  const list = residents.filter(match);
  return list[(v * 7919) % list.length] || list[0];
}

export function preview(ctx) {
  const { THREE, world } = ctx, q = new URLSearchParams(location.search);
  const site = world.site('c-plaza'), cx = site.area.x, cz = site.area.z;
  const group = new THREE.Group();
  const view = q.get('view') || 'lineup';
  const crowd = createCrowd({ capacity: 420, quality: ctx.quality });
  group.add(crowd.object);
  let step = null;

  if (view === 'crowd') {
    const people = residents.slice(0, 420), items = [];
    people.forEach((r, i) => {
      if (!crowd.assign(i, r)) return;
      const a = (i / people.length) * Math.PI * 2 * 7, rad = 5 + (i % 17) * 1.8;
      items.push({ slot: i, cx: cx + Math.cos(i * 2.4) * 14, cz: cz + Math.sin(i * 3.1) * 16, a, rad, dir: i % 2 ? 1 : -1, speed: 0.5 + (i % 5) * 0.12 });
    });
    crowd.show(items.map(it => it.slot));
    const p = { x: 0, y: 0, z: 0, heading: 0, stride: 0, pose: 'walk' };
    step = t => {
      for (const it of items) {
        const ang = it.a + t * it.speed * 0.1 * it.dir;
        p.x = it.cx + Math.cos(ang) * it.rad * 0.5; p.z = it.cz + Math.sin(ang) * it.rad * 0.5;
        p.heading = Math.atan2(Math.cos(ang) * it.dir, -Math.sin(ang) * it.dir);
        p.stride = t * 7 * it.speed + it.slot; p.pose = 'walk';
        crowd.pose(it.slot, p);
      }
    };
  } else {
    const rows = (q.get('rows') ? q.get('rows').split(',') : ROWS);
    const v = Number(q.get('v') || 0), gap = Number(q.get('gap') || 5), rowGap = 10;
    const [from, count] = (q.get('looks') || '0,' + LOOKS.length).split(',').map(Number), looks = LOOKS.slice(from, from + count);
    const x0 = cx - (looks.length - 1) * gap / 2, z0 = cz - (rows.length - 1) * rowGap / 2;
    const vehicleMat = new THREE.MeshStandardMaterial({ color: '#b9453a', roughness: 0.7 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: '#222' });
    const woodMat = new THREE.MeshStandardMaterial({ color: '#8a6a44', roughness: 0.9 });
    const face = row => (row === 'walk' || row === 'stand' ? Number(q.get('h') || -1.0) : 0);
    const items = [];
    let slot = 0;
    rows.forEach((row, ri) => {
      looks.forEach((look, li) => {
        const r = pickFor(look, v);
        if (!r || !crowd.assign(slot, r)) return;
        const x = x0 + li * gap, z = z0 + ri * rowGap;
        const it = { slot, x, z, row, y: 0, heading: face(row) };
        items.push(it);
        slot++;
        const add = (w, h, d, ax, ay, az, mat = vehicleMat) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
          m.position.set(x + ax, ay + h / 2, z + az); m.castShadow = true; group.add(m);
        };
        if (row === 'scooter' || row === 'pillion') {
          add(1.7, 0.5, 0.7, 0.1, 0.35, 0); add(1.3, 0.25, 0.7, -0.6, 1.65, 0); add(0.25, 1.3, 0.3, 1.05, 0.5, 0); add(0.2, 0.2, 0.9, 1.0, 2.75, 0);
          add(0.5, 0.5, 0.2, 1.35, 0, 0, wheelMat); add(0.5, 0.5, 0.2, -1.35, 0, 0, wheelMat);
        }
        if (row === 'bicycle') {
          add(1.4, 0.1, 0.1, 0.1, 1.0, 0); add(0.7, 0.12, 0.35, -0.5, 2.0, 0); add(0.1, 1.8, 0.1, 0.78, 0.9, 0); add(0.1, 0.1, 0.8, 0.78, 2.7, 0);
          add(0.5, 0.5, 0.1, 1.3, 0, 0, wheelMat); add(0.5, 0.5, 0.1, -1.2, 0, 0, wheelMat);
        }
        if (row === 'bench') { it.y = 1.4; add(4.6, 0.2, 1.1, 0.05, 1.2, 0, woodMat); add(0.2, 1.2, 4.6, -0.5, 1.4, 0, woodMat); add(0.2, 1.2, 0.2, 0, 0, 1.8, woodMat); }
        if (row === 'stool') { it.y = 1.35; add(1.0, 0.15, 1.0, 0, 1.2, 0, woodMat); add(0.2, 1.2, 0.2, 0, 0, 0, woodMat); }
        if (row === 'chess') { it.y = 1.15; add(1.0, 0.15, 1.0, 0, 1.0, 0, woodMat); add(1.8, 0.2, 1.8, 1.7, 1.7, 0, woodMat); }
      });
    });
    crowd.show(items.map(it => it.slot));
    const p = { x: 0, y: 0, z: 0, heading: 0, stride: 0, pose: 'walk', eat: 0 };
    step = t => {
      for (const it of items) {
        p.x = it.x; p.z = it.z; p.y = it.y; p.heading = it.heading; p.pose = it.row;
        p.stride = it.row === 'walk' ? t * 6 + it.slot * 0.3 : t * 4;
        p.eat = it.row === 'bench' || it.row === 'stool' ? Math.max(0, Math.sin(t * 1.2 + it.slot)) : 0;
        if (it.row === 'bicycle') p.stride = t * 4;
        crowd.pose(it.slot, p);
      }
    };
  }
  let t0 = null;
  return {
    group,
    update(frame) {
      const t = q.has('t') ? Number(q.get('t')) : (t0 === null ? (t0 = performance.now()) && 0 : (performance.now() - t0) / 1000);
      step(t);
    }
  };
}
