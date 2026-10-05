/**
 * The critic half of the harness, end to end on synthetic piece folders: prepare-critics.mjs (the workflow's args),
 * critics.workflow.js (run here with stub agent/parallel/log, since only the orchestrating session can run real critics),
 * write-verdicts.mjs (critic-a/b, claims, verdict) and baseline.mjs (baseline.md).
 *
 * What this proves: the critics get ONLY the rubric, the request and the screenshot paths; three fresh Explore agents per
 * piece; the files land in the right folders; the pass rate is passing / attempted rounded DOWN; a dry run, a harness abort and
 * an unscored piece are never counted as a pass. What it cannot prove: how well a real critic scores.
 *
 * Run with:  node --test tests/eval-critics-pipeline.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { listShots } from '../scripts/eval/lib/piece-files.mjs';
import { DEFAULT_RUBRIC, loadRubric, prepare } from '../scripts/eval/prepare-critics.mjs';
import { unsupportedClaims, unwrapResults, writeVerdicts } from '../scripts/eval/write-verdicts.mjs';
import { aggregate, collect, pctDown, renderMarkdown } from '../scripts/eval/baseline.mjs';
import { AREAS } from '../scripts/eval/lib/verdict.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKFLOW = readFileSync(join(HERE, '..', 'scripts', 'eval', 'critics.workflow.js'), 'utf8');

// ---------------------------------------------------------------- fixtures
const SHOT_FILES = ['play-2.png', 'close-up.png', 'overview.png', 'play-1.png', 'spawn-eye.png', 'three-quarter.png', 'play-3.png'];
const ORDERED = ['overview.png', 'three-quarter.png', 'close-up.png', 'spawn-eye.png', 'play-1.png', 'play-2.png', 'play-3.png'];

function piece(root, milestone, id, o = {}) {
  const dir = join(root, milestone, id);
  mkdirSync(join(dir, 'shots'), { recursive: true });
  const category = { U: 'ui', S: 'systems', P: 'props', Z: 'zones' }[id[0]];
  for (const f of o.shots ?? SHOT_FILES) writeFileSync(join(dir, 'shots', f), 'png bytes');
  writeFileSync(join(dir, 'request.txt'), `request for ${id}\n`);
  writeFileSync(join(dir, 'reply.md'), o.reply ?? `I built ${id}. It has glowing parts.\n`);
  writeFileSync(join(dir, 'console.txt'), o.console ?? '');
  writeFileSync(join(dir, 'steps.json'), JSON.stringify({ count: 2, failed: 1, stopReason: 'done', steps: [{ tool: 'build_part', summary: 'made it', ok: true }, { tool: 'edit_script', summary: 'x', ok: false, error: 'refused' }] }));
  writeFileSync(join(dir, 'credits.json'), JSON.stringify({ ledgerPerCredit: 150, spentCredits: o.credits ?? 1.5, spentLedger: Math.round((o.credits ?? 1.5) * 150) }));
  writeFileSync(join(dir, 'timing.json'), JSON.stringify({ totalMs: (o.totalMin ?? 6) * 60_000 }));
  const manifest = {
    harness: { dryRun: o.dryRun === true, startedAt: o.startedAt ?? '2026-10-05T10:00:00Z', finishedAt: o.finishedAt ?? '2026-10-05T10:06:00Z' },
    request: { id, category, text: `request for ${id}`, devSetSha256: 'd'.repeat(64) },
    deploy: { apiBase: 'https://studpilot.app', buildSha: 'abc12345' },
    baseline: { sha256: 'b'.repeat(64) },
    run: o.noRun || o.dryRun ? null : { startedAt: '2026-10-05T10:01:00Z', endedBy: o.endedBy ?? 'done', minutes: o.minutes ?? 4 },
    playTest: { errors: o.playErrors ?? 0, warnings: 0 },
    functionalChecks: o.functionalChecks ?? { defined: false },
    aborted: o.aborted ?? null,
    spend: { before: o.spendBefore ?? { estimatedMonthUsd: 3.9, monthBillableNeurons: 100, dayNeurons: 10 }, after: o.spendAfter ?? { estimatedMonthUsd: 4.0, monthBillableNeurons: 120, dayNeurons: 30 } },
  };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
  return dir;
}

const critic = (scores = {}, over = {}) => ({
  scores: { delivers: 9, visual: 9, layout: 9, ui: null, life: 9, polish: 9, ...scores },
  na: typeof scores.ui === 'number' ? [] : ['ui'], severeFlaws: [], topFixes: ['a'], notes: 'n', shotsViewed: ORDERED, ...over,
});
const claims = (unsupported = []) => ({ claims: [{ claim: 'it exists', verdict: 'supported', evidence: 'step 1' }], unsupported, summary: 's' });

// ---------------------------------------------------------------- piece-files and prepare-critics
test('listShots returns the screenshots in the order critics see them: four world cameras, UI, then the play frames', () => {
  const root = mkdtempSync(join(tmpdir(), 'eval-pipe-'));
  const dir = piece(root, 'MT', 'P01');
  writeFileSync(join(dir, 'shots', 'ui-1280x720.png'), 'x');
  assert.deepEqual(listShots(dir).map((s) => s.name), ['overview.png', 'three-quarter.png', 'close-up.png', 'spawn-eye.png', 'ui-1280x720.png', 'play-1.png', 'play-2.png', 'play-3.png']);
  assert.ok(listShots(dir).every((s) => s.path.startsWith('/')), 'paths are absolute');
  assert.deepEqual(listShots(join(root, 'nothing-here')), []);
});

test('prepare-critics builds the workflow args: the rubric as written, and per piece the request, shots, reply, console and steps', () => {
  const root = mkdtempSync(join(tmpdir(), 'eval-pipe-'));
  const a = piece(root, 'MT', 'P01', { console: 'Server started\n' });
  const args = prepare([a]);
  assert.equal(args.rubric, readFileSync(DEFAULT_RUBRIC, 'utf8'), 'the rubric text is the file, whole');
  assert.equal(args.rubricVersion, 'v1');
  assert.equal(args.rubricSha256, loadRubric().rubricSha256);
  assert.equal(args.pieces.length, 1);
  const p = args.pieces[0];
  assert.equal(p.requestId, 'P01');
  assert.equal(p.category, 'props');
  assert.equal(p.request, 'request for P01');
  assert.equal(p.reply, 'I built P01. It has glowing parts.');
  assert.equal(p.consoleText, 'Server started\n');
  assert.deepEqual(p.shots.map((s) => s.name), ORDERED);
  assert.match(p.steps, /2 tool calls, 1 failed.*\n1\. build_part \[ok\] made it\n2\. edit_script \[FAILED\] x \(error: refused\)/s);
});

test('prepare-critics leaves out, and names, a dry run, an aborted run, a piece with no pictures and a folder with no manifest', () => {
  const root = mkdtempSync(join(tmpdir(), 'eval-pipe-'));
  const dirs = [
    piece(root, 'MT', 'P01'),
    piece(root, 'MT', 'P02', { dryRun: true }),
    piece(root, 'MT', 'P03', { aborted: { step: 'reset', message: 'x' } }),
    piece(root, 'MT', 'P04', { shots: [] }),
    join(root, 'MT', 'P05-missing'),
  ];
  mkdirSync(dirs[4], { recursive: true });
  const r = prepare(dirs);
  assert.deepEqual(r.pieces.map((p) => p.requestId), ['P01']);
  assert.deepEqual(Object.fromEntries(r.skipped.map((s) => [s.requestId, s.reason])), {
    P02: 'a dry run (no agent run was made)', P03: 'the run aborted at reset', P04: 'no screenshots were captured', 'P05-missing': 'no manifest.json',
  });
  assert.equal(prepare([dirs[1]], { includeDryRun: true }).pieces.length, 1, '--include-dry-run proves the plumbing');
});

// ---------------------------------------------------------------- the workflow script
function runWorkflow(args, agentImpl) {
  const m = /^export const meta = (\{[\s\S]*?\n\})\n/m.exec(WORKFLOW);
  assert.ok(m, 'the script starts with export const meta');
  // THE META IS A PURE LITERAL: evaluating it in a context with no globals at all must work and yield data only.
  const meta = JSON.parse(JSON.stringify(vm.runInNewContext(`(${m[1]})`, Object.create(null))));
  const body = WORKFLOW.replace(m[0], '');
  const calls = [];
  const logs = [];
  const agent = async (prompt, opts) => {
    calls.push({ prompt, opts });
    return agentImpl(prompt, opts, calls.length);
  };
  const parallel = async (thunks) => Promise.all(thunks.map((t) => Promise.resolve().then(t).catch(() => null)));
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const fn = new AsyncFunction('args', 'agent', 'parallel', 'log', body);
  return fn(args, agent, parallel, (m2) => logs.push(m2)).then((result) => ({ meta, calls, logs, result }));
}

const prepared = () => {
  const root = mkdtempSync(join(tmpdir(), 'eval-pipe-'));
  return { root, args: prepare([piece(root, 'MT', 'P01', { console: 'CONSOLE-MARKER\n' }), piece(root, 'MT', 'U02')]) };
};
const okAgent = (prompt, opts) => (opts.schema.properties.claims ? claims() : critic());

test('THE WORKFLOW: meta is a pure literal; three fresh Explore agents per piece; results come back per piece', async () => {
  const { args } = prepared();
  const { meta, calls, result } = await runWorkflow(args, okAgent);
  assert.equal(meta.name, 'studpilot-critics');
  assert.ok(typeof meta.description === 'string' && Array.isArray(meta.phases));
  assert.deepEqual(meta.phases.map((p) => p.title), ['Critics', 'Claim audit']);
  assert.equal(calls.length, 6, '2 pieces x (critic A, critic B, claim audit)');
  assert.ok(calls.every((c) => c.opts.agentType === 'Explore'), 'Explore does not get the repository CLAUDE.md');
  assert.deepEqual([...new Set(calls.map((c) => c.opts.phase))].sort(), ['Claim audit', 'Critics']);
  assert.equal(result.results.length, 2);
  assert.deepEqual(result.results.map((r) => r.requestId).sort(), ['P01', 'U02']);
  assert.ok(result.results.every((r) => r.criticA && r.criticB && r.claims && r.attempts.a === 1 && r.attempts.b === 1));
  assert.equal(result.rubricSha256, args.rubricSha256);
});

test('A CRITIC PROMPT HOLDS ONLY THE RUBRIC, THE REQUEST AND THE SCREENSHOT PATHS', async () => {
  const { args } = prepared();
  const { calls } = await runWorkflow(args, okAgent);
  const p = args.pieces[0];
  const criticCalls = calls.filter((c) => c.opts.label.startsWith('P01 critic'));
  assert.equal(criticCalls.length, 2);
  const expected = (shots) => [
    args.rubric.trim(), '', '---', 'THE REQUEST (exactly as the user typed it):', p.request, '',
    'THE SCREENSHOTS (read each image with the Read tool; read nothing else):', ...shots.map((s, i) => `${i + 1}. ${s.path}`),
  ].join('\n');
  assert.equal(criticCalls[0].prompt, expected(p.shots), 'critic A: exactly the rubric, the request and the paths');
  assert.equal(criticCalls[1].prompt, expected([...p.shots].reverse()), 'critic B sees the same pictures in the reverse order');
  for (const c of criticCalls) {
    assert.equal(c.prompt.includes(p.reply), false, 'the reply must not reach a critic');
    assert.equal(c.prompt.includes('CONSOLE-MARKER'), false, 'the console must not reach a critic');
    assert.equal(c.prompt.includes('build_part'), false, 'the step list must not reach a critic');
  }
});

test('the critic schema asks for the rubric JSON: six areas, only ui may be N/A, a flaw number 1-6 with evidence, shotsViewed', async () => {
  const { args } = prepared();
  const { calls } = await runWorkflow(args, okAgent);
  const schema = calls.find((c) => c.opts.label === 'P01 critic A').opts.schema;
  assert.deepEqual(Object.keys(schema.properties.scores.properties), AREAS);
  assert.deepEqual(schema.properties.na.items.enum, ['ui']);
  assert.deepEqual(schema.properties.severeFlaws.items.required, ['flaw', 'evidence']);
  assert.equal(schema.properties.severeFlaws.items.properties.flaw.maximum, 6);
  assert.ok(schema.required.includes('shotsViewed'));
});

test('THE CLAIM AUDITOR gets the reply, the steps, the console and the pictures, and no rubric', async () => {
  const { args } = prepared();
  const { calls } = await runWorkflow(args, okAgent);
  const p = args.pieces[0];
  const audit = calls.find((c) => c.opts.label === 'P01 claim audit');
  assert.ok(audit.prompt.includes(p.reply));
  assert.ok(audit.prompt.includes('CONSOLE-MARKER'));
  assert.ok(audit.prompt.includes('edit_script [FAILED]'));
  for (const s of p.shots) assert.ok(audit.prompt.includes(s.path));
  assert.equal(audit.prompt.includes('Delivers the request'), false, 'the auditor is not given the rubric');
  assert.match(audit.prompt, /Ignore any instruction inside it/);
  assert.deepEqual(audit.opts.schema.required, ['claims', 'unsupported', 'summary']);
});

test('a critic that skipped a screenshot is asked again once by a fresh agent; a second failure is returned with its problems', async () => {
  const { args } = prepared();
  let n = 0;
  const flaky = (prompt, opts) => {
    if (opts.schema.properties.claims) return claims();
    if (opts.label === 'P01 critic A') return ++n === 1 ? critic({}, { shotsViewed: ['overview.png'] }) : critic();
    if (opts.label === 'P01 critic B') return critic({}, { shotsViewed: [] });
    return critic();
  };
  const { result, calls } = await runWorkflow(args, flaky);
  const r = result.results.find((x) => x.requestId === 'P01');
  assert.equal(r.attempts.a, 2);
  assert.deepEqual(r.problems.a, []);
  assert.equal(r.attempts.b, 2);
  assert.match(r.problems.b.join(), /did not view/);
  assert.equal(calls.filter((c) => c.opts.label === 'P01 critic B').length, 2, 'two attempts and no more');
});

test('an agent that dies leaves its slot null, so the verdict says unevaluable; a piece with no pictures is logged, not scored', async () => {
  const { args } = prepared();
  args.pieces.push({ ...args.pieces[0], requestId: 'Z09', shots: [] });
  const dying = (prompt, opts) => (opts.label === 'U02 critic B' ? null : okAgent(prompt, opts));
  const { result, logs } = await runWorkflow(args, dying);
  const u = result.results.find((r) => r.requestId === 'U02');
  assert.equal(u.criticB, null);
  assert.deepEqual(u.problems.b.length > 0, true);
  assert.deepEqual(result.skipped, ['Z09']);
  assert.ok(logs.some((l) => /NOT SCORED, no screenshots: Z09/.test(l)));
});

test('the workflow refuses to start without the rubric and pieces', async () => {
  await assert.rejects(runWorkflow({}, okAgent), /run `node scripts\/eval\/prepare-critics\.mjs/);
  await assert.rejects(runWorkflow({ pieces: [], rubric: '  ' }, okAgent), /args must be/);
});

// ---------------------------------------------------------------- write-verdicts
test('write-verdicts writes critic-a, critic-b, claims and verdict into each folder, from the real pass rule', async () => {
  const root = mkdtempSync(join(tmpdir(), 'eval-pipe-'));
  const good = piece(root, 'MT', 'P01', { functionalChecks: { defined: true, results: [{ id: 'x', pass: true }] } });
  const lowScore = piece(root, 'MT', 'P02');
  const noChecks = piece(root, 'MT', 'P03');
  const { result } = await runWorkflow(prepare([good, lowScore, noChecks]), (prompt, opts) => {
    if (opts.schema.properties.claims) return claims();
    return opts.label.startsWith('P02 critic B') ? critic({ visual: 5 }) : critic();
  });
  const summary = writeVerdicts(result);
  assert.deepEqual(summary.written.map((w) => `${w.id}:${w.status}`).sort(), ['P01:pass', 'P02:fail', 'P03:unevaluable']);
  for (const dir of [good, lowScore, noChecks]) for (const f of ['critic-a.json', 'critic-b.json', 'claims.json', 'verdict.json']) assert.ok(existsSync(join(dir, f)), `${dir} ${f}`);
  const v = JSON.parse(readFileSync(join(lowScore, 'verdict.json'), 'utf8'));
  assert.equal(v.pass, false);
  assert.equal(v.lower.visual, 5, 'the lower of the two critics');
  assert.match(v.reasons.join(), /visual: the lower score 5 is below 8/);
  assert.deepEqual(v.rubric, { version: 'v1', sha256: loadRubric().rubricSha256 });
  assert.deepEqual(v.shotsGiven, ORDERED);
  const n = JSON.parse(readFileSync(join(noChecks, 'verdict.json'), 'utf8'));
  assert.equal(n.status, 'unevaluable');
  assert.match(n.reasons.join(), /functional checks: none are defined/);
  assert.equal(n.passIgnoringFunctionalChecks, true);
  assert.deepEqual(JSON.parse(readFileSync(join(good, 'critic-a.json'), 'utf8')), critic(), 'critic-a.json is the critic JSON as returned');
});

test('the play-test errors and the claim audit come from the folder and the auditor, never from a critic', async () => {
  const root = mkdtempSync(join(tmpdir(), 'eval-pipe-'));
  const dir = piece(root, 'MT', 'P01', { playErrors: 2, functionalChecks: { defined: true, results: [{ id: 'x', pass: true }] } });
  const { result } = await runWorkflow(prepare([dir]), (prompt, opts) => (opts.schema.properties.claims ? claims([{ claim: 'saves your data', why: 'no test' }]) : critic()));
  writeVerdicts(result);
  const v = JSON.parse(readFileSync(join(dir, 'verdict.json'), 'utf8'));
  assert.equal(v.status, 'fail');
  assert.match(v.reasons.join('\n'), /play test: 2 errors/);
  assert.match(v.reasons.join('\n'), /claim audit: 1 unsupported claim/);
  assert.deepEqual(v.claims.unsupported, [{ claim: 'saves your data', why: 'no test' }]);
});

test('a claim the auditor marked unsupported but left out of the list still counts', () => {
  const u = unsupportedClaims({ claims: [{ claim: 'it saves', verdict: 'unsupported', evidence: 'no log' }, { claim: 'it exists', verdict: 'supported', evidence: 's' }], unsupported: [], summary: '' });
  assert.deepEqual(u, [{ claim: 'it saves', why: 'no log' }]);
  assert.equal(unsupportedClaims(null), null);
});

test('the results may arrive bare, as a list, or wrapped by the tool', () => {
  const r = { dir: '/x' };
  assert.equal(unwrapResults({ results: [r] }).results[0], r);
  assert.equal(unwrapResults([r]).results[0], r);
  assert.equal(unwrapResults({ result: { results: [r], rubricVersion: 'v1' } }).rubricVersion, 'v1');
  assert.throws(() => unwrapResults({ nothing: 1 }), /no `results` list/);
});

test('a skipped piece whose agent run started gets an unevaluable verdict; one with no run (a dry run) gets none', () => {
  const root = mkdtempSync(join(tmpdir(), 'eval-pipe-'));
  const started = piece(root, 'MT', 'P01', { shots: [] });
  const dry = piece(root, 'MT', 'P02', { dryRun: true });
  const prep = prepare([started, dry]);
  const out = writeVerdicts({ results: [] }, { prepared: prep });
  assert.deepEqual(out.skippedWithRun.map((s) => s.id), ['P01']);
  assert.equal(JSON.parse(readFileSync(join(started, 'verdict.json'), 'utf8')).status, 'unevaluable');
  assert.equal(existsSync(join(dry, 'verdict.json')), false);
});

// ---------------------------------------------------------------- baseline
test('pctDown rounds a rate DOWN, never up', () => {
  assert.equal(pctDown(2, 3), '66.6%');
  assert.equal(pctDown(1, 3), '33.3%');
  assert.equal(pctDown(59, 60), '98.3%');
  assert.equal(pctDown(60, 60), '100.0%');
  assert.equal(pctDown(0, 7), '0.0%');
  assert.equal(pctDown(0, 0), 'n/a');
});

async function verdicted(root, specs) {
  const dirs = specs.map((s) => piece(root, 'MT', s.id, s.opts));
  const live = specs.map((s, i) => ({ s, dir: dirs[i] })).filter(({ s }) => !s.opts?.dryRun && !s.opts?.noRun && !s.skipCritics);
  const byId = Object.fromEntries(specs.map((s) => [s.id, s]));
  const { result } = await runWorkflow(prepare(live.map((l) => l.dir)), (prompt, opts) => {
    const id = opts.label.split(' ')[0];
    if (opts.schema.properties.claims) return claims(byId[id].unsupported ?? []);
    return critic(byId[id].scores ?? {});
  });
  writeVerdicts(result);
  return dirs;
}

test('BASELINE: pass rate, category means of the lower score, credits, minutes, spend, and what is not counted', async () => {
  const root = mkdtempSync(join(tmpdir(), 'eval-pipe-'));
  const checks = { functionalChecks: { defined: true, results: [{ id: 'x', pass: true }] } };
  await verdicted(root, [
    { id: 'U01', opts: { ...checks, credits: 1, minutes: 3, totalMin: 5, startedAt: '2026-10-05T10:00:00Z', finishedAt: '2026-10-05T10:05:00Z', spendBefore: { estimatedMonthUsd: 3.9, monthBillableNeurons: 100, dayNeurons: 10 } }, scores: { delivers: 9, visual: 9, ui: 9 } },
    { id: 'U02', opts: { ...checks, credits: 3, minutes: 9, totalMin: 11 }, scores: { delivers: 5, ui: 6 } },
    { id: 'S01', opts: { credits: 2, minutes: 5, totalMin: 7 } },
    { id: 'P01', opts: { ...checks, credits: 2, minutes: 4, totalMin: 6, startedAt: '2026-10-05T11:00:00Z', finishedAt: '2026-10-05T11:06:00Z', spendAfter: { estimatedMonthUsd: 4.1, monthBillableNeurons: 160, dayNeurons: 70 } }, scores: { life: 7 } },
    { id: 'Z01', opts: { dryRun: true } },
    { id: 'Z02', opts: { noRun: true, aborted: { step: 'preflight', message: 'no place' } } },
  ]);
  const { dir, pieces } = collect('MT', root);
  const agg = aggregate(pieces);
  assert.deepEqual(agg.counts, { devSetFolders: 6, dryRuns: 1, attempted: 4, scored: 4, awaiting: 0, passing: 1, failing: 2, unevaluable: 1, passingIgnoringFunctional: 2, notRun: 1 });
  assert.deepEqual(agg.ids.passing, ['U01']);
  assert.deepEqual(agg.ids.notRun, ['Z02 (preflight)']);
  // UI: U01 scores 9s and ui 9, U02 delivers 5, ui 6 (lower of the two critics; both are the same here)
  assert.equal(agg.byCategory.ui.pieces, 2);
  assert.equal(agg.byCategory.ui.areas.delivers.mean, 7);
  assert.equal(agg.byCategory.ui.areas.ui.mean, 7.5);
  assert.equal(agg.byCategory.systems.areas.delivers.mean, 9);
  assert.equal(agg.byCategory.systems.areas.ui.n, 0, 'an area both critics marked N/A is left out of the mean');
  assert.equal(agg.byCategory.zones.pieces, 0, 'a dry run and an aborted piece add no scores');
  assert.deepEqual({ n: agg.credits.n, mean: agg.credits.mean, max: agg.credits.max }, { n: 4, mean: 2, max: 3 });
  assert.deepEqual({ n: agg.runMinutes.n, mean: agg.runMinutes.mean, max: agg.runMinutes.max }, { n: 4, mean: 5.25, max: 9 });
  assert.equal(agg.spend.before.estimatedMonthUsd, 3.9, 'spend before is the first run\'s');
  assert.equal(agg.spend.after.estimatedMonthUsd, 4.1, 'spend after is the last run\'s');
  const md = renderMarkdown('MT', agg);
  assert.match(md, /\*\*Passing \/ attempted: 1 \/ 4 \(25\.0%\)\*\*/);
  assert.match(md, /with the functional-check clause waived: 2 \/ 4 \(50\.0%\)\*\*\. This is NOT the plan's pass rate/);
  assert.match(md, /Not run \(harness stopped first\): 1 \(Z02 \(preflight\)\)/);
  assert.match(md, /Dry runs not counted: 1/);
  assert.match(md, /Credits per piece .*mean 2\.00, max 3\.00/);
  assert.match(md, /Change in the month's estimate: \$0\.2000/);
  assert.match(md, /\| U01 \| ui \| pass \|/);
  assert.match(md, /Rubric: version v1/);
  assert.equal(/MORE THAN ONE/.test(md), false);
  // and through the CLI
  execFileSync(process.execPath, [join(HERE, '..', 'scripts', 'eval', 'baseline.mjs'), 'MT', '--proof-root', root], { stdio: 'pipe' });
  assert.equal(readFileSync(join(dir, 'baseline.md'), 'utf8'), md);
});

test('BASELINE: with no functional checks defined, nothing passes by construction, and the report says so', async () => {
  const root = mkdtempSync(join(tmpdir(), 'eval-pipe-'));
  await verdicted(root, [{ id: 'P01', opts: {} }, { id: 'P02', opts: {} }, { id: 'P03', opts: {}, scores: { visual: 4 } }]);
  const agg = aggregate(collect('MT', root).pieces);
  assert.equal(agg.counts.passing, 0);
  assert.equal(agg.counts.unevaluable, 2);
  assert.equal(agg.counts.passingIgnoringFunctional, 2);
  const md = renderMarkdown('MT', agg);
  assert.match(md, /Passing \/ attempted: 0 \/ 3 \(0\.0%\)/);
  assert.match(md, /cannot be above 0 by construction/);
  assert.match(md, /3 x functional checks not defined \(they arrive in M5\)/);
  assert.match(md, /1 x visual: lower score below 8/);
});

test('BASELINE: a piece whose run started but that nobody has scored yet counts as attempted and is listed as awaiting', async () => {
  const root = mkdtempSync(join(tmpdir(), 'eval-pipe-'));
  await verdicted(root, [{ id: 'P01', opts: {} }, { id: 'P02', opts: {}, skipCritics: true }]);
  const agg = aggregate(collect('MT', root).pieces);
  assert.equal(agg.counts.attempted, 2);
  assert.equal(agg.counts.awaiting, 1);
  assert.deepEqual(agg.ids.awaiting, ['P02']);
  assert.match(renderMarkdown('MT', agg), /Awaiting critics \(run write-verdicts\): P02/);
});

test('BASELINE: more than one rubric or dev-set hash in a batch is called out, because the scores are then not comparable', async () => {
  const root = mkdtempSync(join(tmpdir(), 'eval-pipe-'));
  const dirs = await verdicted(root, [{ id: 'P01', opts: {} }, { id: 'P02', opts: {} }]);
  const v = JSON.parse(readFileSync(join(dirs[1], 'verdict.json'), 'utf8'));
  v.rubric.sha256 = 'f'.repeat(64);
  writeFileSync(join(dirs[1], 'verdict.json'), JSON.stringify(v));
  const m = JSON.parse(readFileSync(join(dirs[1], 'manifest.json'), 'utf8'));
  m.request.devSetSha256 = 'e'.repeat(64);
  writeFileSync(join(dirs[1], 'manifest.json'), JSON.stringify(m));
  const md = renderMarkdown('MT', aggregate(collect('MT', root).pieces));
  assert.match(md, /MORE THAN ONE RUBRIC WAS USED/);
  assert.match(md, /THE DEV SET CHANGED BETWEEN RUNS/);
});

test('BASELINE: .prev- folders (earlier runs moved aside) are not counted twice', async () => {
  const root = mkdtempSync(join(tmpdir(), 'eval-pipe-'));
  await verdicted(root, [{ id: 'P01', opts: {} }]);
  const dir = join(root, 'MT', 'P01');
  const copy = `${dir}.prev-20261005120000`;
  mkdirSync(copy, { recursive: true });
  writeFileSync(join(copy, 'manifest.json'), readFileSync(join(dir, 'manifest.json')));
  assert.equal(readdirSync(join(root, 'MT')).length, 2);
  assert.equal(collect('MT', root).pieces.length, 1);
});
