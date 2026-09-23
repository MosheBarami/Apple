// The owner-autonomy hooks (.claude/skills/apple-owner-autonomy) are the enforcement, so they are tested
// against fixture repositories rather than trusted: each behaviour below has a case that must go the
// other way, so a hook that always allows (or always blocks) fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs';
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

test('only owner-blocked findings remain → the stop is allowed', () => {
  const dir = fixture({ acceptance: PASSING, findings: CLOSED + '- [open][critical] F-017: needs a dashboard toggle — evidence: x\n',
    queue: '- [open] Q-003: turn on leaked-password protection — why: F-017 — Blocks findings: F-017\n' });
  assert.equal(blocked(run('autonomy_stop_gate.py', dir)), false);
});

test('a DONE queue item no longer excuses its finding', () => {
  const dir = fixture({ acceptance: PASSING, findings: CLOSED + '- [open][critical] F-017: needs a dashboard toggle — evidence: x\n',
    queue: '- [done] Q-003: turn on leaked-password protection — why: F-017 — Blocks findings: F-017\n' });
  assert.ok(blocked(run('autonomy_stop_gate.py', dir)));
});

test('no progress across two blocks → the gate stands down; progress re-arms it', () => {
  const dir = fixture({ acceptance: { ...PASSING, mobile_qa: false }, findings: CLOSED });
  assert.ok(blocked(run('autonomy_stop_gate.py', dir)), 'first stop blocked');
  assert.ok(blocked(run('autonomy_stop_gate.py', dir)), 'second stop, still no change: blocked once more');
  assert.equal(blocked(run('autonomy_stop_gate.py', dir)), false, 'third stop with nothing changed: allowed — no burn loop');
  writeFileSync(join(dir, 'progress.txt'), 'work happened');
  assert.ok(blocked(run('autonomy_stop_gate.py', dir)), 'a change in the repository re-arms the gate');
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

// 2026-09-23: background agents keep editing the tree, so the idle rule never fires while the agent is
// correctly waiting on them, and every blocked stop was a paid no-op. A WAITING marker allows the stop —
// only while it names what is awaited, and never for longer than 20 minutes after it was written.
test('a fresh WAITING marker allows the stop; an expired, empty or overlong one does not', async () => {
  const { utimesSync } = await import('node:fs');
  const doable = { acceptance: { ...PASSING, mobile_qa: false }, findings: CLOSED };
  const mark = (dir, body, ageSeconds = 0) => {
    mkdirSync(join(dir, '.autonomy'), { recursive: true });
    const f = join(dir, '.autonomy', 'WAITING');
    writeFileSync(f, JSON.stringify(body));
    const t = Date.now() / 1000 - ageSeconds;
    utimesSync(f, t, t);
  };
  const now = Date.now() / 1000;
  let dir = fixture(doable); mark(dir, { until: now + 600, on: 'workflow wf_x' });
  assert.equal(blocked(run('autonomy_stop_gate.py', dir)), false, 'waiting on named work is not stopping');
  dir = fixture(doable); mark(dir, { until: now - 5, on: 'workflow wf_x' });
  assert.ok(blocked(run('autonomy_stop_gate.py', dir)), 'an expired wait no longer excuses the stop');
  dir = fixture(doable); mark(dir, { until: now + 600, on: '' });
  assert.ok(blocked(run('autonomy_stop_gate.py', dir)), 'a wait that names nothing excuses nothing');
  dir = fixture(doable); mark(dir, { until: now + 86400, on: 'workflow wf_x' }, 21 * 60);
  assert.ok(blocked(run('autonomy_stop_gate.py', dir)), 'a marker older than 20 minutes is ignored whatever it claims');
});
