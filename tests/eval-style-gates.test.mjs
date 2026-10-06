// Rubric v2 (planning/STYLE-BIBLE.md §5-§7): the colour gate's maths, the reply rule, the kit lint gate, the style area
// and its seven signatures in the verdict, and prepare-critics holding back a piece that failed a gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { colourVerdict, hsv, kitLintGate, measurePixels, replyRule } from '../scripts/eval/lib/style-gates.mjs';
import { computeVerdict, SIGNATURES } from '../scripts/eval/lib/verdict.mjs';
import { gateFailure, prepare, REFERENCE_BOARD } from '../scripts/eval/prepare-critics.mjs';

const px = (...colours) => Buffer.from(colours.flat());

test('the colour measures: saturation, grey (s < 0.15) and vivid (s >= 0.5 and v >= 0.5) shares', () => {
  assert.deepEqual(hsv(255, 0, 0), { s: 1, v: 1 });
  const m = measurePixels(px([128, 128, 128], [255, 0, 0], [40, 20, 20], [200, 180, 180]));
  assert.equal(m.grey, 0.5, 'the mid grey and the pale pink are grey');
  assert.equal(m.vivid, 0.25, 'only the bright red is vivid; the dark red is saturated but not bright');
  assert.equal(colourVerdict('ui', { saturation: 0.06, grey: 0.95, vivid: 0.01 }).pass, false, 'StudPilot\'s M3 UI shot fails');
  assert.equal(colourVerdict('ui', { saturation: 0.57, grey: 0.08, vivid: 0.52 }).pass, true, 'the reference median passes');
  const world = colourVerdict('world', { saturation: 0.5, grey: 0.2, vivid: 0.2 });
  assert.equal(world.pass, false);
  assert.match(world.reasons.join(), /vivid share 0.20 is below 0.3/);
});

test('the reply rule: no visual claims', () => {
  assert.equal(replyRule('Added the shop with 6 eggs.').pass, true);
  assert.deepEqual(replyRule('Done and Verified, it looks great').reasons.length, 2);
});

test('the kit lint gate fails on any finding and names an example', () => {
  assert.equal(kitLintGate({ findings: [], counts: {} }).pass, true);
  const g = kitLintGate({ findings: [{ rule: 'nostroke', path: 'StarterGui.Shop.Title' }], counts: { nostroke: 1 } });
  assert.equal(g.pass, false);
  assert.match(g.reasons[0], /1 nostroke \(e\.g\. StarterGui\.Shop\.Title\)/);
  assert.equal(kitLintGate(null).pass, false, 'a lint that did not run is not a pass');
});

const critic = (style, signatures) => ({
  scores: { delivers: 9, visual: 9, layout: 9, ui: 9, life: 9, polish: 9, style }, na: [], severeFlaws: [], topFixes: [], notes: '', shotsViewed: ['ui.jpg'],
  signatures,
});
const all = (state) => Object.fromEntries(SIGNATURES.map((s) => [s, state]));
const base = {
  shotsGiven: ['ui.jpg'], planned: { names: ['ui'], missing: [] }, uiRequired: 'the request is UI', playTest: { errors: 0 },
  functionalChecks: { defined: true, results: [{ id: 'x', pass: true }] }, claims: { unsupported: [] }, run: { endedBy: 'done' }, rubricVersion: 'v2',
  gates: { kitLint: { pass: true }, colour: { pass: true }, reply: { pass: true } },
};

test('v2 verdict: style >= 8 with no signature missing passes; a missing signature, low style or a failed gate fails', () => {
  assert.equal(computeVerdict({ ...base, criticA: critic(8, { ...all('present'), icons: 'weak' }), criticB: critic(9, all('present')) }).status, 'pass');
  const missing = computeVerdict({ ...base, criticA: critic(9, { ...all('present'), studs: 'missing' }), criticB: critic(9, all('present')) });
  assert.equal(missing.pass, false);
  assert.match(missing.reasons.join('\n'), /critic A found 1 signature missing \(studs\)/);
  assert.match(computeVerdict({ ...base, criticA: critic(7, all('present')), criticB: critic(9, all('present')) }).reasons.join(), /style: the lower score 7/);
  const gate = computeVerdict({ ...base, gates: { ...base.gates, colour: { pass: false, reasons: ['ui.jpg: grey share 0.9'] } }, criticA: critic(9, all('present')), criticB: critic(9, all('present')) });
  assert.match(gate.reasons.join(), /colour gate: ui\.jpg: grey share 0\.9/);
  const noSig = computeVerdict({ ...base, criticA: critic(9, undefined), criticB: critic(9, all('present')) });
  assert.match(noSig.reasons.join(), /critic A is not usable: signature font is not given/);
  assert.equal(computeVerdict({ ...base, rubricVersion: 'v1', gates: null, criticA: { ...critic(1), scores: { ...critic(1).scores, style: undefined } }, criticB: critic(9) }).status, 'pass', 'v1 verdicts are unchanged');
});

test('prepare-critics (v2) holds back a piece that failed a gate and gives the others the fixed reference board', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'v2-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const piece = (id, gates) => {
    const dir = join(root, id);
    mkdirSync(join(dir, 'shots'), { recursive: true });
    writeFileSync(join(dir, 'shots', 'ui-1280x720.jpg'), 'x');
    writeFileSync(join(dir, 'request.txt'), 'a shop\n');
    writeFileSync(join(dir, 'reply.md'), 'done\n');
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ requestId: id, aborted: null, run: { endedBy: 'done' }, build: { kind: 'ui' }, gates }));
    return dir;
  };
  const pass = { kitLint: { pass: true }, colour: { pass: true }, reply: { pass: true } };
  const r = prepare([piece('U01', pass), piece('U02', { ...pass, colour: { pass: false } }), piece('U03', undefined)]);
  assert.equal(r.rubricVersion, 'v2');
  assert.deepEqual(r.pieces.map((p) => p.requestId), ['U01']);
  assert.deepEqual(r.pieces[0].board.map((b) => b.id), REFERENCE_BOARD.ui.map(([id]) => id));
  assert.match(r.skipped.find((s) => s.requestId === 'U02').reason, /failed the automatic style checks \(colour\)/);
  assert.match(gateFailure({}), /did not run/);
});
