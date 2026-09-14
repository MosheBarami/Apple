/**
 * A SPEC HARNESS IS A FINE PLACE TO HIDE A BACKDOOR, AND A FINE PLACE TO LOSE A CASE.
 *
 * Two properties carry this tool, and neither is about assertions working.
 *
 * 1. THE CASE BODIES ARE MODEL-AUTHORED LUAU. set_mood and add_effect generate their source from
 *    tables in this repository, so nothing the model writes becomes code and the ingress filter is
 *    belt-and-braces there. Here the bodies ARE the model's Luau, at exactly run_luau's trust
 *    level. Requiring project modules by path is the whole point of the tool, so `require` is legal
 *    and `require(<asset id>)` must still be refused — which makes that rule load-bearing rather
 *    than incidental. Asserted by driving the tool and proving nothing reached Studio.
 *
 * 2. A CASE THAT NEVER RAN MUST NOT BE SILENTLY ABSENT. A body with a syntax error takes the whole
 *    chunk down before the harness's result table is built, so the report comes back SHORTER than
 *    the spec rather than failing. "3 passed" for a four-case spec is the same defect as a critic
 *    reporting a lens it never ran.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const bundle = (src, tag) => {
  const out = join(mkdtempSync(join(tmpdir(), `sr-${tag}-`)), `${tag}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [join(WORKER, 'src', src), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
    { cwd: WORKER, stdio: 'pipe' });
  return out;
};
const SR = await import(`file://${bundle('spec-runner.ts', 'sr')}`);
const T = await import(`file://${bundle('tools.ts', 'tools')}`);

const TMP = mkdtempSync(join(tmpdir(), 'sr-luau-'));
const haveLuau = () => { try { execFileSync('luau-analyze', ['--help'], { stdio: 'pipe' }); return true; } catch { return false; } };
function syntaxErrors(source, tag) {
  const file = join(TMP, `${tag}.luau`);
  writeFileSync(file, source);
  let out = '';
  try { out = execFileSync('luau-analyze', [file], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { out = `${e.stdout ?? ''}${e.stderr ?? ''}`; }
  return out.split('\n').filter((l) => l.includes('SyntaxError'));
}

const OK = [
  { name: 'shop debits the right amount', code: 'local w = { coins = 100 }\nw.coins = w.coins - 30\nassert(w.coins == 70, "expected 70")' },
  { name: 'save round-trips', code: 'assert(true)' },
];
function stubCtx(payload) {
  const ops = [];
  return { ops, ctx: { env: {}, studioConnected: () => true,
    execStudioOp: async (o) => { ops.push(o); return { ok: true, data: { result: JSON.stringify(payload) } }; },
    addMemoryFact: async () => {} } };
}
const reply = (rows) => ({ cases: rows });

test('the generated harness compiles', { skip: haveLuau() ? false : 'luau-analyze not on PATH' }, () => {
  assert.deepEqual(syntaxErrors(SR.specLuau(OK), 'ok'), []);
});

test('a hostile case NAME cannot become code', { skip: haveLuau() ? false : 'luau-analyze not on PATH' }, () => {
  // Names are inserted as string literals; only bodies are inserted as code.
  const nasty = [
    { name: 'a "quoted" name', code: 'assert(true)' },
    { name: 'back\\slash', code: 'assert(true)' },
    { name: 'end) print("escaped") __case("x", function()', code: 'assert(true)' },
    { name: 'new\nline', code: 'assert(true)' },
  ];
  const src = SR.specLuau(nasty);
  assert.deepEqual(syntaxErrors(src, 'nasty'), [], 'a name broke the harness');
  assert.doesNotMatch(src, /print\("escaped"\)\s*$/m, 'a name escaped its literal');
});

test('THE INGRESS FILTER IS APPLIED — a backdoor in a case never reaches Studio', async () => {
  for (const body of [
    'local M = require(12345)\nassert(M)',
    'local o = game:GetObjects("rbxassetid://99")\nassert(o)',
    'local f = loadstring("return 1")\nassert(f)',
  ]) {
    const { ctx, ops } = stubCtx(reply([]));
    const res = await T.TOOLS.run_spec.run(ctx, { cases: [{ name: 'sneaky', code: body }] });
    assert.ok(res.error, `not refused: ${body}`);
    assert.equal(ops.length, 0, `reached Studio: ${body}`);
  }
});

test('requiring a project module BY PATH is still allowed, which is the point of the tool', async () => {
  const { ctx, ops } = stubCtx(reply([{ name: 'shop', status: 'pass', durationMs: 2 }]));
  const res = await T.TOOLS.run_spec.run(ctx, {
    cases: [{ name: 'shop', code: 'local Shop = require(game.ServerScriptService.Shop)\nassert(Shop)' }],
  });
  assert.equal(res.error, undefined, JSON.stringify(res));
  assert.equal(ops.length, 1);
  assert.equal(res.passed, 1);
});

test('A CASE THAT DID NOT RUN IS A FAILURE, NOT AN ABSENCE', async () => {
  // Four sent, two came back: the other two took the chunk down before the table was built.
  const sent = [
    { name: 'one', code: 'assert(true)' }, { name: 'two', code: 'assert(true)' },
    { name: 'three', code: 'assert(true)' }, { name: 'four', code: 'assert(true)' },
  ];
  const { ctx } = stubCtx(reply([
    { name: 'one', status: 'pass' }, { name: 'two', status: 'fail', message: 'nope' },
  ]));
  const res = await T.TOOLS.run_spec.run(ctx, { cases: sent });
  assert.equal(res.passed, 1);
  assert.equal(res.failed, 3, 'one real failure plus the two that never ran');
  assert.deepEqual(res.didNotRun, ['three', 'four']);
  const rep = ctx.uiDetail.blocks[0];
  assert.equal(rep.cases.length, 4, 'every case sent must appear in the report');
  const ghost = rep.cases.find((c) => c.name === 'three');
  assert.equal(ghost.status, 'fail');
  assert.match(ghost.message, /did not run/);
});

test('one failing case does not hide the ones after it', () => {
  const src = SR.specLuau(OK);
  assert.match(src, /pcall\(fn\)/, 'each case must be isolated');
  assert.equal((src.match(/__case\(/g) ?? []).length, OK.length + 1, 'one call per case, plus the definition');
});

test('parseSpecRun tallies, and drops rows it cannot read rather than guessing', () => {
  const run = SR.parseSpecRun({ result: JSON.stringify(reply([
    { name: 'a', status: 'pass', durationMs: 3 },
    { name: 'b', status: 'fail', message: 'boom' },
    { name: 'c', status: 'skip' },
    { name: 'd' },                       // no status
    { status: 'pass' },                  // no name
    'not an object',
  ])) });
  assert.equal(run.cases.length, 3);
  assert.deepEqual([run.passed, run.failed, run.skipped], [1, 1, 1]);
  assert.equal(run.cases[1].message, 'boom');
});

test('unreadable harness output is an error, not an empty green run', async () => {
  const ops = [];
  const ctx = { env: {}, studioConnected: () => true,
    execStudioOp: async (o) => { ops.push(o); return { ok: true, data: { result: 'not json' } }; },
    addMemoryFact: async () => {} };
  const res = await T.TOOLS.run_spec.run(ctx, { cases: OK });
  assert.match(String(res.error), /could not read/);
});

test('the case list is validated before anything is generated', async () => {
  const bad = [
    [[], /non-empty/],
    [[{ name: 'x' }], /no code/],
    [[{ code: 'assert(true)' }], /no name/],
    [[{ name: 'dup', code: 'assert(true)' }, { name: 'dup', code: 'assert(true)' }], /both named/],
    [Array.from({ length: SR.SPEC_LIMITS.maxCases + 1 }, (_, i) => ({ name: `c${i}`, code: 'assert(true)' })), /at most/],
    [[{ name: 'big', code: 'x'.repeat(SR.SPEC_LIMITS.maxCodeChars + 1) }], /keep a case under/],
  ];
  for (const [cases, re] of bad) {
    const { ctx, ops } = stubCtx(reply([]));
    const res = await T.TOOLS.run_spec.run(ctx, { cases });
    assert.match(String(res.error), re);
    assert.equal(ops.length, 0);
  }
});

test('the report is a valid test_report document', async () => {
  const { ctx } = stubCtx(reply([
    { name: 'a', status: 'pass', durationMs: 4 }, { name: 'b', status: 'fail', message: 'x' },
  ]));
  await T.TOOLS.run_spec.run(ctx, { cases: [{ name: 'a', code: 'assert(true)' }, { name: 'b', code: 'assert(true)' }], title: 'Shop economy' });
  const b = ctx.uiDetail.blocks[0];
  assert.equal(ctx.uiDetail.v, 1);
  assert.equal(b.type, 'test_report');
  assert.equal(b.title, 'Shop economy');
  assert.equal(b.passed + b.failed, b.cases.length);
  for (const c of b.cases) {
    assert.ok(['pass', 'fail', 'skip'].includes(c.status), `bad status ${c.status}`);
    assert.equal(typeof c.name, 'string');
  }
});

test('run_spec is offered with Studio and withheld without it', () => {
  assert.ok(T.toolDefs(true, undefined).map((d) => d.name).includes('run_spec'));
  assert.equal(T.toolDefs(false, undefined).map((d) => d.name).includes('run_spec'), false);
});
