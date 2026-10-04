/**
 * What the model is SHOWN holds no subject of an earlier benchmark (phase 1, step 10).
 *
 * The 2026-10-02 benchmark's prompts and skills carried worked examples ("make me a stick of butter", an ASMR keyboard's JSON,
 * a donut and a lamp recipe, "make it 100x cooler"), and tool descriptions carried subjects too. A worked example is read as
 * the answer: every object came out shaped like the examples. no-subject-literals.test.mjs scans the SOURCE; this one scans what
 * the model actually receives for a plain request: the assembled system prompt, the craft-recipe cards for it, every tool
 * definition, and the creation skills. It pins the property (no subject words), not the text.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const dir = mkdtempSync(join(tmpdir(), 'prompt-subj-'));
const entry = join(dir, 'entry.ts');
writeFileSync(entry, ['prompts', 'skill-cards', 'creator-skills', 'tools'].map((f) => `export * from '${join(WORKER, 'src', f + '.ts')}';`).join('\n') + '\n');
const out = join(dir, 'p.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [entry, '--bundle', '--format=esm', '--target=es2022', '--platform=node', '--outfile=' + out, '--external:cloudflare:*', '--log-level=error'], { cwd: WORKER, stdio: 'pipe' });
const { systemPrompt, skillCardsForRun, CREATOR_SKILLS: CREATION_SKILLS, toolDefs } = await import(`file://${out}`);

// The banned list is the guard's own: one source of truth.
const guard = readFileSync(join(HERE, 'no-subject-literals.test.mjs'), 'utf8');
const BANNED = new Function(`return [${/export const BANNED = \[([\s\S]*?)\];/.exec(guard)[1]}];`)();
const allowed = JSON.parse(readFileSync(join(HERE, 'no-subject-literals.allow.json'), 'utf8')).entries;
const found = (text) => BANNED.filter((w) => new RegExp(`(?<![A-Za-z0-9_])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_])`, 'i').test(text));
/** Lines of a text with a banned word that no allowlist entry covers (the docs link in the input skill is the only one). */
const uncovered = (text) => text.split('\n').flatMap((line) => found(line).filter((w) => !allowed.some((e) => e.literal === w && line.includes(e.lineContains))).map((w) => `${w}: ${line.slice(0, 100)}`));

const base = { mode: 'agent', studioConnected: true, placeName: 'place', projectName: 'proj', memorySummary: null, memoryFacts: [], fenceId: 'a91f3c0d' };

test('the guard list was read (a test that read nothing would pass)', () => {
  assert.ok(BANNED.length >= 18 && BANNED.includes('butter') && BANNED.includes('keyboard') && BANNED.includes('crown'), BANNED.join(','));
});

test('the assembled system prompt for a plain request holds no word from the guard list', () => {
  assert.deepEqual(uncovered(systemPrompt(base)), []);
  assert.deepEqual(uncovered(systemPrompt({ ...base, studioConnected: false })), []);
});

test('the craft-recipe cards a plain request pulls in hold none, whatever the object asked for', async () => {
  for (const request of ['make me a thing', 'build me a toy that spins', 'make it cooler', 'a chest', 'a creature that walks', 'עשה לי חפץ מצחיק', 'make a prop with a door']) {
    const { block } = skillCardsForRun(request, true);
    assert.deepEqual(uncovered(block ?? ''), [], `request "${request}"`);
  }
});

test('every creation skill and every tool definition holds none', async () => {
  const skills = CREATION_SKILLS.map((s) => JSON.stringify(s)).join('\n');
  assert.deepEqual(uncovered(skills.replace(/","/g, '"\n"')), []);
  const defs = toolDefs(true).map((d) => JSON.stringify(d)).join('\n');
  assert.deepEqual(uncovered(defs.replace(/","/g, '"\n"')), []);
});

test('the any-idea skill no longer teaches one tool for everything: it names the choice (library, build, compose, dress) and no worked example', () => {
  const skill = CREATION_SKILLS.find((s) => s.id === 'any-idea-done-right');
  const text = JSON.stringify(skill);
  for (const tool of ['find_library_model', 'preview_library_models', 'build_object', 'dress_object', 'compose_game']) assert.ok(text.includes(tool), `${tool} is part of the choice`);
  assert.equal(/ONE build_object call/i.test(text), false, 'the "always one build_object" rule is gone');
  assert.equal(/Example,|More examples/.test(text), false, 'no worked example');
  assert.deepEqual(skill.keywords.filter((k) => BANNED.includes(k)), [], 'the skill no longer routes on a subject word');
  const sys = systemPrompt(base);
  assert.equal(/ONE build_object call/i.test(sys), false);
  assert.match(sys, /you choose/i);
});
