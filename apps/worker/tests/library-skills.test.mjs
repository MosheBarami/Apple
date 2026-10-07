// Library skills (master plan §4.3 category 16, §8 step 6): only A/B documentation procedures reach the model, A
// first, and a read returns the official steps word for word with their source and credit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchLibrarySkills, readLibrarySkill } from '../src/library-skills.ts';

const row = (id, grade, over = {}) => ({ id, title: id, grade, grade_notes: JSON.stringify([{ critic: '1', grade, why: `how to ${id}` }]), source_url: `https://create.roblox.com/docs/${id}`, attribution: `${id}, CC BY 4.0`, body: `1. Do ${id}.\n2. Then.\n3. Done.`, ...over });
function env(rows, matches) {
  return {
    LIBRARY: { query: async (_v, opts) => { assert.deepEqual(opts.filter, { kind: 'skill' }); return { matches: matches.map((item) => ({ metadata: { item } })) }; } },
    CORPUS: { prepare: () => ({ bind: (...ids) => ({ first: async () => rows[ids[0]] ?? null, all: async () => ({ results: ids.map((i) => rows[i]).filter(Boolean) }) }) }) },
  };
}
const embed = async () => [[0.1]];

test('search offers A and B procedures only, A first, keeping relevance within a grade', async () => {
  const rows = { 'skill:docs:b1': row('skill:docs:b1', 'B'), 'skill:docs:c': row('skill:docs:c', 'C'), 'skill:docs:a1': row('skill:docs:a1', 'A'), 'skill:docs:a2': row('skill:docs:a2', 'A') };
  const hits = await searchLibrarySkills(env(rows, ['skill:docs:b1', 'skill:docs:c', 'skill:docs:a1', 'skill:docs:a2']), 'lava that kills', embed);
  assert.deepEqual(hits.map((h) => h.id), ['skill:docs:a1', 'skill:docs:a2', 'skill:docs:b1']);
  assert.equal(hits[0].use, 'how to skill:docs:a1');
  assert.deepEqual(await searchLibrarySkills(env(rows, []), '  ', embed), [], 'no query, no search');
});

test('a read gives the steps word for word with source and attribution, and refuses a C or unknown id', async () => {
  const rows = { 'skill:docs:a': row('skill:docs:a', 'A'), 'skill:docs:c': row('skill:docs:c', 'C') };
  const r = await readLibrarySkill(env(rows, []), 'skill:docs:a');
  assert.equal(r.steps, '1. Do skill:docs:a.\n2. Then.\n3. Done.');
  assert.equal(r.source, 'https://create.roblox.com/docs/skill:docs:a');
  assert.match(r.attribution, /CC BY 4\.0/);
  assert.match((await readLibrarySkill(env(rows, []), 'skill:docs:c')).error, /no library skill/);
  assert.match((await readLibrarySkill(env(rows, []), 'skill:docs:none')).error, /no library skill/);
  const long = await readLibrarySkill(env({ 'skill:docs:l': row('skill:docs:l', 'A', { body: 'x'.repeat(7000) }) }, []), 'skill:docs:l');
  assert.match(long.steps, /the rest is at the source\]$/);
});

test('the skill tools reach the library: search adds documentation procedures, read routes skill:docs: ids', () => {
  const src = readFileSync(new URL('../src/tools.ts', import.meta.url), 'utf8');
  const search = src.slice(src.indexOf('search_creation_skills: {'), src.indexOf('read_creation_skill: {'));
  assert.match(search, /searchLibrarySkills\(ctx\.env, a\.query, embed\)\.catch\(\(\) => \[\]\)/, 'a library failure leaves the catalogue answer whole');
  const read = src.slice(src.indexOf('read_creation_skill: {'), src.indexOf('get_genre_references: {'));
  assert.match(read, /startsWith\(LIBRARY_SKILL_PREFIX\) \? readLibrarySkill\(ctx\.env, a\.id\)/);
});
