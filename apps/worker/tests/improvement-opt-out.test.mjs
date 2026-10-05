/**
 * THE IMPROVEMENT-DATA OPT-OUT IS A PREFERENCE THE SERVER ACCEPTS, KEEPS AND NARROWS.
 *
 * Owner decision (planning/STUDPILOT-FINAL-PLAN.md section 7): StudPilot may one day collect anonymised improvement data, as an
 * opt-out. Collection is NOT active (packages/training CUSTOMER_WORK_TRAINING_ENABLED is false; tests/promises-match-the-product.test.mjs
 * holds the published rule, the Settings switch and that gate to each other). The switch in Settings > Privacy writes `improvement_opt_out`
 * through the preferences layer, and this file is about that half: the worker has to accept the key, keep it exactly, and treat an
 * organisation's `true` as one a project cannot undo. A key the validator does not know is a switch whose answer the server throws
 * away ("what is not sent is deleted"), and the person would believe they had opted out of something they had not.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(tmpdir(), `studpilot-improvement-opt-out-${process.pid}.mjs`);
await esbuild.build({ entryPoints: [join(HERE, '..', 'src', 'preferences.ts')], bundle: true, format: 'esm', target: 'es2022', outfile: OUT });
const P = await import(pathToFileURL(OUT).href);
process.on('exit', () => rmSync(OUT, { force: true }));

test('the opt-out is a declared preference, accepted as a boolean and only as a boolean', () => {
  assert.ok(P.PREFERENCE_KEYS.length > 5, 'the key list is empty: this test would check nothing');
  assert.ok(P.PREFERENCE_KEYS.includes('improvement_opt_out'), 'the server would refuse the switch as an unknown key');
  assert.equal(P.normalisePreferences({ improvement_opt_out: true }).prefs.improvement_opt_out, true);
  assert.equal(P.normalisePreferences({ improvement_opt_out: false }).prefs.improvement_opt_out, false);
  for (const wrong of ['true', 'false', 1, 0, null, {}]) {
    const out = P.normalisePreferences({ improvement_opt_out: wrong });
    assert.deepEqual(out.rejected, [{ key: 'improvement_opt_out', reason: 'bad_value' }], `${JSON.stringify(wrong)} must not be coerced into a consent answer`);
    assert.equal('improvement_opt_out' in out.prefs, false);
  }
});

test('NOT OPTED OUT IS THE DEFAULT: with nothing stored there is no value at all, and the page reads absent as false', () => {
  assert.equal('improvement_opt_out' in P.normalisePreferences({}).prefs, false);
  assert.equal('improvement_opt_out' in P.mergePreferences({ user: {} }).prefs, false);
  assert.equal('improvement_opt_out' in P.mergePreferences({}).prefs, false);
});

test('the choice round-trips through the rows the preferences layer stores, under the key the memory store can address', () => {
  const rows = P.preferencesToEntries({ improvement_opt_out: true }, 'user', 'u1');
  const row = rows.find((r) => r.key === 'pref.improvement_opt_out');
  assert.ok(row, `the writer stores ${rows.map((r) => r.key).join(', ')}`);
  assert.equal(row.kind, 'preference');
  assert.equal(row.value, 'true');
  const entries = rows.map((r) => ({ ...r, source: 'user', createdAt: '', updatedAt: '', expiresAt: null }));
  assert.equal(P.preferencesFromEntries(entries).prefs.improvement_opt_out, true);
  // `false` is an answer too, and is kept as one.
  const off = P.preferencesToEntries({ improvement_opt_out: false }, 'user', 'u1').find((r) => r.key === 'pref.improvement_opt_out');
  assert.equal(off?.value, 'false');
});

test('opting out at any layer opts out: it narrows, and a project cannot switch back on what an organisation switched off', () => {
  const org = P.mergePreferences({ org: { improvement_opt_out: true }, user: { improvement_opt_out: false } });
  assert.equal(org.prefs.improvement_opt_out, true);
  assert.equal(org.sources.improvement_opt_out, 'org');
  const project = P.mergePreferences({ user: { improvement_opt_out: true }, project: { improvement_opt_out: false } });
  assert.equal(project.prefs.improvement_opt_out, true);
  assert.equal(project.sources.improvement_opt_out, 'user');
  const own = P.mergePreferences({ org: { improvement_opt_out: false }, user: { improvement_opt_out: true } });
  assert.equal(own.prefs.improvement_opt_out, true);
  assert.equal(own.sources.improvement_opt_out, 'user');
  assert.equal(P.mergePreferences({ org: { improvement_opt_out: false }, user: {} }).prefs.improvement_opt_out, false, 'considered and left alone is a real answer');
});

test('the improvement opt-out and the analytics opt-out are two answers, and one never sets the other', () => {
  const both = P.mergePreferences({ user: { improvement_opt_out: true } });
  assert.equal('analytics_opt_out' in both.prefs, false);
  const other = P.mergePreferences({ user: { analytics_opt_out: true } });
  assert.equal('improvement_opt_out' in other.prefs, false);
});
