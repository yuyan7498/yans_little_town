import './helpers.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { residents } from '../../src/core/data.js';

const { appearanceOf, ROLES, LOOKS, createCrowd, createFigure } = await import('../../src/render/people/index.js').catch(async () => {
  // index.js pulls in the browser-only preview: fall back to the parts.
  const a = await import('../../src/render/people/appearance.js');
  const c = await import('../../src/render/people/crowd.js');
  return { ...a, ...c };
});

const sample = role => residents.filter(r => r.role === role && !r.schedule);

test('appearanceOf is deterministic and covers every role', () => {
  assert.equal(ROLES.length, 20);
  for (const role of ROLES) {
    const list = sample(role);
    assert.ok(list.length, role);
    const a = appearanceOf(list[0]), b = appearanceOf({ ...list[0] });
    assert.deepEqual(a, b);
    assert.equal(a.look, role);
  }
  for (const s of ['mayor', 'president']) {
    const r = residents.find(x => x.schedule === s);
    assert.equal(appearanceOf(r).look, s);
  }
  assert.equal(LOOKS.length, 22);
});

test('heights follow age', () => {
  const at = age => appearanceOf({ id: 'h-' + age, role: 'unemployed', age }).height;
  assert.ok(at(1) >= 2.1 && at(5) <= 2.8);
  assert.ok(at(9) > 2.9 && at(9) < 3.6);
  assert.ok(at(15) > 3.6 && at(15) < 4.2);
  assert.ok(at(35) > 4.0 && at(35) < 4.7);
  assert.ok(at(80) < at(35) + 0.2);
});

test('every resident builds within the triangle budget', () => {
  const crowd = createCrowd({ capacity: 4 });
  let over = 0;
  for (const r of residents.slice(0, 200)) if (!crowd.assign(0, r)) over++;
  assert.equal(over, 0);
  crowd.dispose();
});

test('crowd poses every pose without NaN and hidden slots cost nothing', () => {
  const crowd = createCrowd({ capacity: 8 });
  residents.slice(0, 8).forEach((r, i) => assert.ok(crowd.assign(i, r)));
  crowd.show([0, 1, 2]);
  assert.equal(crowd.info().shown, 3);
  for (const pose of ['walk', 'stand', 'scooter', 'bicycle', 'pillion', 'bench', 'stool', 'chess']) {
    for (let i = 0; i < 8; i++) crowd.pose(i, { x: 5, y: pose === 'bench' ? 1.4 : 0, z: 3, heading: 1, stride: 2.3, pose, eat: 0.5 });
  }
  const g = crowd.object.geometry;
  assert.equal(g.drawRange.count % 3, 0);
  assert.ok(g.drawRange.count > 0 && g.drawRange.count < g.index.count);
  assert.equal(crowd.holder(1), residents[1].id);
  crowd.dispose();
});

test('createFigure works and updates', () => {
  const f = createFigure(residents[0]);
  f.update(1.2, 'walk'); f.update(0, 'stand');
  assert.ok(f.object);
  f.dispose();
});

test('posing 250 walkers is cheap', () => {
  const crowd = createCrowd({ capacity: 250 });
  residents.slice(0, 250).forEach((r, i) => crowd.assign(i, r));
  const p = { x: 0, y: 0, z: 0, heading: 0, stride: 0, pose: 'walk' };
  const run = t => { for (let i = 0; i < 250; i++) { p.x = i; p.stride = t + i; crowd.pose(i, p); } };
  for (let i = 0; i < 20; i++) run(i);
  const t0 = performance.now();
  for (let i = 0; i < 100; i++) run(i);
  const ms = (performance.now() - t0) / 100;
  console.log('pose 250 walkers: ' + ms.toFixed(3) + ' ms');
  assert.ok(ms < 2, ms + ' ms');
  crowd.dispose();
});

const animals = await import('../../src/render/people/animals.js');

test('animals: breeds are deterministic and vary for pets', () => {
  const a = animals.breedFor({ id: 'office-001:dog', species: 'dog', pet: true });
  assert.equal(a, animals.breedFor({ id: 'office-001:dog', species: 'dog', pet: true }));
  const set = new Set(Array.from({ length: 40 }, (_, i) => animals.breedFor({ id: 'o' + i + ':dog', species: 'dog', pet: true })));
  assert.ok(set.size >= 4);
  assert.equal(animals.breedFor({ id: 'x', species: 'cat' }), 'tabby');
  assert.equal(animals.breedFor({ id: 'y', species: 'dog' }), 'tudog');
});

test('animals: strays, pets and nests update without error', () => {
  const nests = [{ id: 'nest:a', kind: 'nest', animal: 'cat', x: 1, z: 2, heading: 0 }, { id: 'nest:b', kind: 'nest', animal: 'dog', x: 9, z: 2, heading: 1 }];
  const field = animals.createAnimals({ nests });
  const list = [{ id: 'cat', species: 'cat', x: 0, y: 0, z: 0, heading: 0, pose: 'lie', stride: 0 }, { id: 'dog', species: 'dog', x: 3, y: 0, z: 0, heading: 1, pose: 'sit', stride: 0 },
    { id: 'o1:dog', species: 'dog', pet: true, x: 5, y: 0, z: 5, heading: 0.5, stride: 2 }];
  for (const pose of ['walk', 'stand', 'sit', 'lie', 'eat']) { list[0].pose = list[1].pose = pose; field.update(list, { time: 1 }); }
  assert.equal(field.info().animals, 3);
  assert.ok(field.info().drawCalls <= 10);
  field.update([], { time: 2 });
  assert.equal(field.info().animals, 0);
  const f = animals.createAnimalFigure({ id: 'cat', species: 'cat' });
  f.update(1, 'walk'); f.update(0, 'eat');
  f.dispose(); field.dispose();
});

test('lite crowd figures are much smaller', () => {
  const full = createCrowd({ capacity: 2 }), lite = createCrowd({ capacity: 2, quality: 'lite' });
  let a = 0, b = 0;
  for (const r of residents.slice(0, 120)) { full.assign(0, r); full.show([0]); a += full.info().triangles; lite.assign(0, r); lite.show([0]); b += lite.info().triangles; }
  console.log('avg triangles full ' + Math.round(a / 120) + ' lite ' + Math.round(b / 120));
  assert.ok(b < a * 0.7);
});
