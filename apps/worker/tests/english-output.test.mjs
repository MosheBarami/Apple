// ENGLISH OUT, ANY LANGUAGE IN (V3 handoff §1, gate G08, NEXT_ACTION 1d).
//
// The claims:
//   1. There is no reply-language preference any more: not a key, not a prompt line.
//   2. A `pref.language` row written before the removal, or a key an older page still sends, is
//      IGNORED — never an error, never a "Not saved: language" refusal for a setting that is gone.
//   3. Every agent prompt tells the model to produce English — replies, plans and in-game text —
//      while still reading a request in any language, and that rule is read AFTER anything the user
//      wrote, so a profile or project note asking for another language cannot be the last word.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { systemPrompt, ENGLISH_OUTPUT_RULE, MEMORY_UPDATE_PROMPT } from '../src/prompts.ts';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(tmpdir(), `apple-english-prefs-${process.pid}.mjs`);
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
  join(WORKER, 'src', 'preferences.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${out}`,
], { cwd: WORKER, stdio: 'pipe' });
const P = await import(`file://${out}`);
process.on('exit', () => rmSync(out, { force: true }));

const row = (key, value) => ({
  scope: 'user', scopeId: 'u1', key, kind: 'preference', value, source: 'user',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', expiresAt: null, updatedBy: 'u1',
});

test('there is no reply-language preference', () => {
  assert.ok(P.PREFERENCE_KEYS.length > 5, 'the key list is empty — this test would check nothing');
  assert.equal(P.PREFERENCE_KEYS.includes('language'), false);
  assert.equal('LANGUAGES' in P, false, 'the reply-language allowlist is exported again');
});

test('a stored pref.language row loads harmlessly and the rest of the row set survives', () => {
  for (const stored of ['"es"', '"he"', '"en"', 'not json']) {
    const back = P.preferencesFromEntries([row('pref.language', stored), row('pref.response_length', '"brief"')], {});
    assert.equal('language' in back.prefs, false, stored);
    assert.equal(back.prefs.response_length, 'brief', `${stored}: a retired row must not take its neighbours with it`);
    assert.deepEqual(back.rejected, [], `${stored}: a retired row is not reported as a refusal`);
  }
});

test('an older page that still sends `language` is not told its save failed', () => {
  const { prefs, rejected } = P.normalisePreferences({ language: 'es', response_length: 'detailed' }, {});
  assert.deepEqual(prefs, { response_length: 'detailed' });
  assert.deepEqual(rejected, []);
  // The quiet drop is for the retired key only; an invented key is still named.
  assert.deepEqual(P.normalisePreferences({ lang: 'es' }, {}).rejected, [{ key: 'lang', reason: 'unknown_key' }]);
});

test('the preferences block never asks for another language', () => {
  const block = P.preferencesPrompt({ prefs: { language: 'es', response_length: 'brief' } }, 'f1');
  assert.doesNotMatch(block, /Reply in|Spanish|language/i);
});

const base = { mode: 'agent', placeName: 'Test', projectName: 'Test', memorySummary: null, memoryFacts: [], fenceId: 'fence-english' };

test('every agent prompt carries the English output rule, and still reads other languages', () => {
  assert.match(ENGLISH_OUTPUT_RULE, /whatever language/i, 'input in any language is still interpreted');
  assert.match(ENGLISH_OUTPUT_RULE, /in English/);
  for (const what of [/replies/, /plan/, /UI labels/, /NPC dialogue/, /item/]) assert.match(ENGLISH_OUTPUT_RULE, what);
  for (const studioConnected of [true, false]) {
    assert.ok(systemPrompt({ ...base, studioConnected }).includes(ENGLISH_OUTPUT_RULE), `studioConnected=${studioConnected}`);
    assert.ok(
      systemPrompt({ ...base, studioConnected, toolSequence: ['get_project_tree'] }).includes(ENGLISH_OUTPUT_RULE),
      'a bounded tool sequence still answers in English',
    );
  }
});

test('a user instruction asking for another language is read BEFORE the English rule', () => {
  const personalisation = 'Project instructions:\n- Always answer in Hebrew and name every item in Hebrew.';
  const prompt = systemPrompt({ ...base, studioConnected: true, personalisation });
  assert.ok(prompt.indexOf(personalisation) >= 0);
  assert.ok(prompt.indexOf(ENGLISH_OUTPUT_RULE) > prompt.indexOf(personalisation));
});

test('project memory, which the user can read, is written in English', () => {
  assert.match(MEMORY_UPDATE_PROMPT, /in English/);
});
