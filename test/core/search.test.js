import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readQuery, searchTown } from '../../src/core/search.js';
import { residents } from '../../src/core/data.js';

const people = [
  { id: 'a', name: 'chen.wei_88', job: '工程師', family: 'tech', org: '晨光科技' },
  { id: 'b', name: 'wei.daily', job: '老師', family: 'school', org: '' },
  { id: 'c', name: 'chenwei88', job: '護理師', family: 'care', org: '' }
];
const sites = [{ id: 's1', name: '晨光科技大樓', group: '辦公' }];
const byId = new Map(people.map(r => [r.id, r]));
const ctx = {
  residents: people, sites,
  jobOf: id => { const r = byId.get(id); return { title: r.job, family: r.family, org: r.org }; },
  familyLabel: new Map([['tech', '科技業'], ['school', '學校'], ['care', '醫護']])
};
const ids = q => searchTown(q, ctx).people.map(r => r.id);

test('a query reads "@name" as an account', () => {
  assert.equal(readQuery('  @Chen.Wei_88 ').text, 'Chen.Wei_88');
  assert.equal(readQuery('@x').account, true);
  assert.equal(readQuery('工程師').account, false);
});

test('accounts match in any case, with or without "@", dots and underscores', () => {
  assert.deepEqual(ids('chen.wei_88'), ['a', 'c']);
  assert.deepEqual(ids('@CHENWEI88'), ['c', 'a']);
  assert.deepEqual(ids('weidaily'), ['b']);
});

test('names that start with the query come before names that only contain it', () => {
  assert.deepEqual(ids('wei'), ['b', 'a', 'c']);
});

test('job titles, occupations, employers and buildings still match, but not for an account query', () => {
  assert.deepEqual(ids('工程師'), ['a']);
  assert.deepEqual(ids('醫護'), ['c']);
  assert.deepEqual(searchTown('晨光科技', ctx).sites.map(s => s.id), ['s1']);
  assert.deepEqual(ids('晨光科技'), ['a']);
  assert.deepEqual(ids('@工程師'), []);
  assert.deepEqual(searchTown('@晨光科技', ctx).sites, []);
});

test('an empty query or a bare "@" finds nothing', () => {
  for (const q of ['', '   ', '@']) assert.deepEqual(ids(q), []);
});

test('every resident comes first when searched by their own @account', () => {
  const town = { ...ctx, residents, jobOf: () => null };
  for (const r of residents) assert.equal(searchTown('@' + r.name, town).people[0].id, r.id, r.name);
});
