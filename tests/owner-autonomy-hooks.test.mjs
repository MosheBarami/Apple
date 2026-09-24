// The owner-autonomy hooks (.claude/skills/apple-owner-autonomy) are the enforcement, so they are tested
// against fixture repositories rather than trusted: each behaviour below has a case that must go the
// other way, so a hook that always allows (or always blocks) fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOOKS = join(ROOT, '.claude', 'hooks');
const PASSING = {
  schema: 1, deterministic_gates_green: true, production_deployed: true, production_bytes_verified: true,
  signed_in_browser_qa: true, mobile_qa: true, real_studio_end_to_end: true, studio_readback_verified: true,
  follow_up_edit_verified: true, failure_recovery_verified: true, database_security_verified: true,
  production_error_reviewed: true, fresh_reviews_without_material_blocker: 3, required_fresh_reviews_without_material_blocker: 3,
  missions: { gameplay_loop_from_baseplate: true }, evidence: {},
};

function fixture({ acceptance, findings, queue = '', stop = false }) {
  const dir = mkdtempSync(join(tmpdir(), 'owner-autonomy-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  mkdirSync(join(dir, 'docs', 'autonomy', 'evidence'), { recursive: true });
  copyFileSync(join(ROOT, 'scripts', 'autonomy-review-gate.py'), join(dir, 'scripts', 'autonomy-review-gate.py'));
  writeFileSync(join(dir, 'docs', 'autonomy', 'evidence', 'e.md'), 'evidence');
  const acc = structuredClone(acceptance);
  for (const k of Object.keys(PASSING)) if (acc[k] === true) acc.evidence[k] = ['docs/autonomy/evidence/e.md'];
  for (const [m, ok] of Object.entries(acc.missions)) if (ok) acc.evidence[`mission:${m}`] = ['docs/autonomy/evidence/e.md'];
  writeFileSync(join(dir, 'docs', 'autonomy', 'ACCEPTANCE.json'), JSON.stringify(acc));
  writeFileSync(join(dir, 'docs', 'autonomy', 'CUSTOMER_FINDINGS.md'), findings);
  writeFileSync(join(dir, 'docs', 'autonomy', 'OWNER_QUEUE.md'), queue);
  if (stop) { mkdirSync(join(dir, '.autonomy'), { recursive: true }); writeFileSync(join(dir, '.autonomy', 'STOP'), ''); }
  // As in the real repository, the gate's own state is ignored, so it cannot count as progress.
  writeFileSync(join(dir, '.gitignore'), '.autonomy/\n');
  spawnSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}
const run = (hook, dir) => spawnSync('python3', [join(HOOKS, hook)], { input: '{}', encoding: 'utf8', env: { ...process.env, AUTONOMY_ROOT: dir, CLAUDE_PROJECT_DIR: dir } });
const blocked = (r) => { const out = r.stdout.trim(); return out ? JSON.parse(out).decision === 'block' : false; };
const CLOSED = '- [closed][low] F-001: fine — evidence: x\n';

test('the gate passes → the stop is allowed, silently', () => {
  const r = run('autonomy_stop_gate.py', fixture({ acceptance: PASSING, findings: CLOSED }));
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), '', 'no stop-time notice when allowing');
});

test('agent-doable work remains → the stop is blocked with the list', () => {
  const r = run('autonomy_stop_gate.py', fixture({ acceptance: { ...PASSING, mobile_qa: false }, findings: CLOSED + '- [open][high] F-002: broken — evidence: x\n' }));
  assert.ok(blocked(r), r.stdout);
  assert.match(r.stdout, /mobile_qa/);
  assert.match(r.stdout, /F-002/);
  assert.match(r.stdout, /Do not ask the owner/);
});

test('owner-blocked findings still keep the gate active until acceptance', () => {
  const dir = fixture({ acceptance: PASSING, findings: CLOSED + '- [open][critical] F-017: needs a dashboard toggle — evidence: x\n',
    queue: '- [open] Q-003: turn on leaked-password protection — why: F-017 — Blocks findings: F-017\n' });
  assert.ok(blocked(run('autonomy_stop_gate.py', dir)));
});

test('a DONE queue item no longer excuses its finding', () => {
  const dir = fixture({ acceptance: PASSING, findings: CLOSED + '- [open][critical] F-017: needs a dashboard toggle — evidence: x\n',
    queue: '- [done] Q-003: turn on leaked-password protection — why: F-017 — Blocks findings: F-017\n' });
  assert.ok(blocked(run('autonomy_stop_gate.py', dir)));
});

// 2026-09-24, owner: the hook forces work all the time, without a break. A stop with no change in the
// repository is blocked like any other; only .autonomy/STOP (the owner's switch) or a passing gate end it.
test('no progress never stands the gate down: every stop is blocked while work remains', () => {
  const dir = fixture({ acceptance: { ...PASSING, mobile_qa: false }, findings: CLOSED });
  for (let i = 1; i <= 5; i++) assert.ok(blocked(run('autonomy_stop_gate.py', dir)), `stop ${i} with nothing changed: blocked`);
});

test('.autonomy/STOP lifts every hook', () => {
  const dir = fixture({ acceptance: { ...PASSING, mobile_qa: false }, findings: CLOSED, stop: true });
  assert.equal(run('autonomy_stop_gate.py', dir).stdout.trim(), '');
  assert.equal(run('autonomy_no_questions.py', dir).stdout.trim(), '');
  assert.equal(run('autonomy_prompt_context.py', dir).stdout.trim(), '');
});

test('questions to the owner are denied; the prompt carries the contract', () => {
  const dir = fixture({ acceptance: PASSING, findings: CLOSED });
  const q = JSON.parse(run('autonomy_no_questions.py', dir).stdout);
  assert.equal(q.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(q.hookSpecificOutput.permissionDecisionReason, /do not ask the owner/);
  const c = JSON.parse(run('autonomy_prompt_context.py', dir).stdout);
  assert.equal(c.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(c.hookSpecificOutput.additionalContext, /Decide instead of asking/);
});

test('the hooks are wired in the project settings', () => {
  const s = JSON.parse(readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8'));
  const cmds = (ev) => (s.hooks[ev] ?? []).flatMap((e) => e.hooks.map((h) => `${e.matcher ?? ''} ${h.command}`));
  assert.ok(cmds('Stop').some((c) => c.includes('autonomy_stop_gate.py')));
  assert.ok(cmds('UserPromptSubmit').some((c) => c.includes('autonomy_prompt_context.py')));
  assert.ok(cmds('PreToolUse').some((c) => c.startsWith('AskUserQuestion ') && c.includes('autonomy_no_questions.py')));
});

// 2026-09-24, owner: no waiting either. A WAITING marker (fresh, expired, or written with an ISO `until`
// the gate once crashed on, which let every stop through) never excuses a stop, and the gate never crashes.
test('a WAITING marker of any shape never excuses the stop, and never crashes the gate', () => {
  const doable = { acceptance: { ...PASSING, mobile_qa: false }, findings: CLOSED };
  const now = Date.now() / 1000;
  for (const body of [{ until: now + 600, on: 'workflow wf_x' }, { until: '2026-09-23T13:02:03Z', on: 'build lanes' }, 'not json']) {
    const dir = fixture(doable);
    mkdirSync(join(dir, '.autonomy'), { recursive: true });
    writeFileSync(join(dir, '.autonomy', 'WAITING'), typeof body === 'string' ? body : JSON.stringify(body));
    const r = run('autonomy_stop_gate.py', dir);
    assert.equal(r.status, 0, `the gate crashed: ${r.stderr}`);
    assert.ok(blocked(r), `WAITING ${JSON.stringify(body)} let the stop through`);
  }
});

test('an unreadable acceptance gate blocks until repaired', () => {
  const dir = fixture({ acceptance: PASSING, findings: CLOSED });
  unlinkSync(join(dir, 'scripts', 'autonomy-review-gate.py'));
  const r = run('autonomy_stop_gate.py', dir);
  assert.equal(r.status, 0);
  assert.ok(blocked(r));
  assert.match(r.stdout, /missing or unreadable/);
});
