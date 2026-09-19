import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { filterProjects } from '../src/lib/project-search.ts';

const projects = [
  { id: 1, name: 'Laundry Simulator', description: 'Client work', tags: ['shop'] },
  { id: 2, name: 'Laundry Simulator', memory_summary: 'Coins and upgrades', place_name: 'Place2' },
  { id: 3, name: 'עולם חדש', description: null, tags: ['הרפתקה'] },
];

test('blank queries preserve exact scope identity and ordering', () => {
  assert.equal(filterProjects(projects, '  \t '), projects);
});
test('all terms match across name and metadata, case-insensitively', () => {
  assert.deepEqual(filterProjects(projects, 'LAUNDRY shop').map(p => p.id), [1]);
  assert.deepEqual(filterProjects(projects, 'upgrades Place2').map(p => p.id), [2]);
  assert.equal(filterProjects(projects, 'laundry nonexistent').length, 0);
});
test('Hebrew and compatibility-normalized text are searchable', () => {
  assert.deepEqual(filterProjects(projects, 'עולם הרפתקה').map(p => p.id), [3]);
  assert.deepEqual(filterProjects(projects, 'Ｐｌａｃｅ２').map(p => p.id), [2]);
});
test('punctuation is literal, not a pattern; empty scope stays empty', () => {
  assert.deepEqual(filterProjects(projects, '.*'), []);
  assert.deepEqual(filterProjects([], 'shop'), []);
  assert.equal(projects.length, 3);
});

test('the all-terms guard fails when any single matching term is enough', async () => {
  const source = readFileSync(new URL('../src/lib/project-search.ts', import.meta.url), 'utf8');
  assert.equal(source.split('terms.every(').length - 1, 1);
  const broken = stripTypeScriptTypes(source.replace('terms.every(', 'terms.some('));
  const mutated = await import('data:text/javascript;base64,' + Buffer.from(broken).toString('base64'));
  assert.throws(() => assert.equal(mutated.filterProjects(projects, 'laundry nonexistent').length, 0));
});
