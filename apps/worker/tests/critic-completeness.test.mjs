/**
 * A critic lens that did not run must not read as a lens that found nothing.
 *
 * THE DEFECT, measured before the fix. With every metric supplied — so `unchecked` is empty and no
 * INCOMPLETE line prints — a panel whose six model lenses ALL threw produced a report BYTE-IDENTICAL
 * to one where all six ran and found nothing:
 *
 *   panel: 6 lens(es), 6 model call(s)
 *   10 criticisms raised -> 10 admissible -> 10 CONFIRMED (0 discarded for want of evidence)
 *
 * The deterministic rules still fire, so the report is not empty — it is worse than empty. It reads
 * as a thorough audit that measured ten defects and had nothing further to add, when in fact the
 * entire model half of the panel was unavailable.
 *
 * Three ways a lens contributes nothing and was still counted:
 *   - the judge THREW. runCriticPanel catches it and comments "a lens that errors contributes
 *     nothing", which is true and was the whole problem: nothing recorded that it had.
 *   - the judge REPLIED UNREADABLY. parseLensResponse returns [] for a prose answer and [] for an
 *     honest empty verdict, and the two were indistinguishable.
 *   - the lens NEVER RAN. `request_fidelity` is not deterministic, so with no judge configured it
 *     executes neither branch — yet `lensesRun` is the REQUESTED list, so it was reported as run.
 *
 * `lensesRun` keeps its meaning (packages/evals asserts on it, and a field that quietly changes
 * meaning is its own trap). The panel now also reports `lensesIncomplete`, and the report and the
 * agent-facing summary in tools.ts both say so.
 *
 * Found by rbxai-1d, who predicted the shape before either of us looked: "whether a lens that did
 * not run can still be counted in a denominator that makes the panel look complete."
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'critic-c-')), 'critic.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'critic.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const C = await import(`file://${out}`);

/** Every metric a deterministic rule reads, so `unchecked` is empty and cannot mask the question. */
function fullInput() {
  const metrics = {};
  for (const rules of [C.COMPOSITION_RULES, C.ROBLOX_RULES, C.TECHNICAL_ART_RULES, C.LIGHTING_RULES, C.READABILITY_RULES]) {
    for (const r of rules ?? []) metrics[r.metric] = 0.5;
  }
  return {
    metrics,
    layout: { format: 'x,y,z,sx,sy,sz,yawDeg', parts: [], skipped: 0 },
    lighting: { brightness: 2, clockTime: 14, ambient: [0, 0, 0], lightInstances: 3, effects: ['Atmosphere'] },
    views: [{ name: 'hero', width: 64, height: 64, rgbBase64: '' }],
    request: 'build a house',
  };
}

const WORKING = async () => JSON.stringify({ criticisms: [] });
const THROWING = async () => { throw new Error('provider down'); };
const PROSE = async () => 'Honestly the build looks great to me!';

test('CONTROL: a panel whose lenses all ran reports nothing incomplete', async () => {
  // If this ever reports incompleteness for a healthy panel, every assertion below is meaningless.
  const r = await C.runCriticPanel(fullInput(), { judge: WORKING });
  assert.equal(r.unchecked.length, 0, 'the fixture must supply every metric, or unchecked masks the question');
  assert.deepEqual(r.lensesIncomplete ?? [], [], 'a healthy panel has no incomplete lenses');
  assert.equal(/INCOMPLETE: \d+ lens/.test(C.formatPanelReport(r)), false, 'and says nothing about lenses');
});

test('A PANEL WHOSE LENSES ALL FAILED CANNOT READ LIKE A CLEAN ONE', async () => {
  // The property, stated as the two reports being different documents.
  const ok = await C.runCriticPanel(fullInput(), { judge: WORKING });
  const bad = await C.runCriticPanel(fullInput(), { judge: THROWING });
  assert.notEqual(C.formatPanelReport(bad), C.formatPanelReport(ok),
    'a panel where every model lens threw produced a report identical to a clean audit');
});

test('a judge that throws is recorded against the lens, with a reason', async () => {
  const r = await C.runCriticPanel(fullInput(), { judge: THROWING });
  assert.equal(r.lensesIncomplete.length, 6, `expected all six lenses incomplete, got ${r.lensesIncomplete.length}`);
  for (const f of r.lensesIncomplete) {
    assert.ok(typeof f.lens === 'string' && f.lens, 'each entry names its lens');
    assert.match(f.reason, /provider down|error/i, 'and carries why, so it can be acted on');
  }
  assert.match(C.formatPanelReport(r), /INCOMPLETE: 6 lens/, 'and the report leads with it');
});

test('a judge that answers unreadably is not counted as a lens that found nothing', async () => {
  const r = await C.runCriticPanel(fullInput(), { judge: PROSE });
  assert.equal(r.lensesIncomplete.length, 6, 'prose is not a verdict');
  assert.match(r.lensesIncomplete[0].reason, /unreadable|parse/i);
});

test('an honest empty verdict is NOT incomplete', async () => {
  // The distinction the old code could not make: `{"criticisms": []}` means "I looked and found
  // nothing", and must not be reported as a failure. This is the control for the case above.
  const r = await C.runCriticPanel(fullInput(), { judge: WORKING });
  assert.deepEqual(r.lensesIncomplete, [], 'an empty verdict is an answer, not a failure');
});

test('a lens that executes neither branch is reported, not silently counted', async () => {
  // request_fidelity is not deterministic, so with no judge it runs nothing at all.
  const r = await C.runCriticPanel(fullInput(), {});
  const names = r.lensesIncomplete.map((f) => f.lens);
  assert.ok(names.includes('request_fidelity'),
    `request_fidelity never ran but was not reported; incomplete = [${names.join(',')}]`);
  assert.match(C.formatPanelReport(r), /INCOMPLETE: \d+ lens/);
});

test('the INCOMPLETE line comes BEFORE the tally, like the unchecked-rules one', async () => {
  // The tally is the verdict a reader forms an opinion from; a caveat under it arrives too late.
  const r = await C.runCriticPanel(fullInput(), { judge: THROWING });
  const lines = C.formatPanelReport(r).split('\n');
  const inc = lines.findIndex((l) => /INCOMPLETE: \d+ lens/.test(l));
  const tally = lines.findIndex((l) => /criticisms raised/.test(l));
  assert.ok(inc >= 0 && tally >= 0, 'both lines must be present');
  assert.ok(inc < tally, `the caveat must precede the verdict (incomplete at ${inc}, tally at ${tally})`);
});

test('CONTROL: deterministic findings survive a failed model half', async () => {
  // A fix that discarded the panel when the judge failed would pass every test above and throw away
  // ten real measured defects.
  const r = await C.runCriticPanel(fullInput(), { judge: THROWING });
  assert.ok(r.criticisms.length >= 10, `the measured rules must still report (${r.criticisms.length})`);
  assert.ok(r.adjudication.stats.confirmed >= 10, 'and still be adjudicated');
});
