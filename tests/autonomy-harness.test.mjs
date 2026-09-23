// The autonomy harness (docs/autonomy/) enforces its safety envelope outside the model. These tests
// drive every rule both ways — the planted forbidden action is DENIED, the ordinary one is not — so a
// guard that silently stopped matching turns this file red instead of passing vacuously.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GUARD = join(ROOT, '.claude', 'hooks', 'autonomy_guard.py');
const SUPERVISOR = join(ROOT, 'scripts', 'autonomy-supervisor.py');
const REVIEW_GATE = join(ROOT, 'scripts', 'autonomy-review-gate.py');

// ------------------------------------------------------------------ the guard

function guard(tool_name, tool_input, projectDir = ROOT) {
  const r = spawnSync('python3', [GUARD], {
    input: JSON.stringify({ tool_name, tool_input }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, `guard crashed: ${r.stderr}`);
  if (!r.stdout.trim()) return null;
  const out = JSON.parse(r.stdout);
  return out.hookSpecificOutput?.permissionDecision === 'deny' ? out.hookSpecificOutput.permissionDecisionReason : null;
}

const DENIED_BASH = [
  'git reset --hard HEAD',
  'git reset --soft HEAD~1',
  'git clean -fdx',
  'git push origin main --force',
  'git push -f origin main',
  'git stash',
  'git checkout -- apps/web',
  'git switch other',
  'git restore apps/web/src/app.tsx',
  'git add -A',
  'git add .',
  'git add -u apps/worker',
  'rm -rf ~',
  'rm -rf /',
  'security dump-keychain',
  'security find-generic-password -w -s foo',
  'sqlite3 "$HOME/Library/Application Support/Google/Chrome/Default/Cookies" .dump',
  'npx wrangler delete golem',
  'curl -X POST https://apis.roblox.com/assets/v1/assets -F request=@x.json',
  'cat .env',
  'head -5 apps/worker/.dev.vars',
  'tail .env.local',
];
const ALLOWED_BASH = [
  'git status --short',
  'git diff --stat',
  'git commit -F /tmp/msg -- apps/web/src/app.tsx',
  'git add apps/web/src/app.tsx',
  'git push origin main',
  'git log --oneline -5',
  'rm -rf /tmp/scratch-dir',
  'rm -rf ~/scratch-dir',
  'node infra/deploy-worker.mjs apple',
  'curl -s https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=1',
  'grep -c GOLEM_ADMIN_KEY .env',
];

test('the guard denies every forbidden command it names', () => {
  for (const command of DENIED_BASH) {
    assert.ok(guard('Bash', { command }), `NOT denied: ${command}`);
  }
});

test('the guard lets ordinary engineering commands through with no decision', () => {
  for (const command of ALLOWED_BASH) {
    assert.equal(guard('Bash', { command }), null, `wrongly denied: ${command}`);
  }
});

test('credential stores are protected for reads and writes alike', () => {
  for (const [tool, input] of [
    ['Read', { file_path: '/Users/moshe/.ssh/id_ed25519' }],
    ['Read', { file_path: '/Users/moshe/Library/Keychains/login.keychain-db' }],
    ['Read', { file_path: '/Users/moshe/Library/Application Support/Google/Chrome/Default/Login Data' }],
    ['Write', { file_path: '/Users/moshe/.mcp-auth/tokens.json', content: 'x' }],
  ]) assert.ok(guard(tool, input), `NOT denied: ${tool} ${input.file_path}`);
  assert.equal(guard('Read', { file_path: join(ROOT, 'AGENTS.md') }), null);
});

test('the STOP switch freezes every mutating tool and nothing else', () => {
  const root = mkdtempSync(join(tmpdir(), 'autonomy-stop-'));
  mkdirSync(join(root, '.autonomy'));
  assert.equal(guard('Edit', { file_path: join(root, 'a.txt') }, root), null, 'control: no STOP, no denial');
  writeFileSync(join(root, '.autonomy', 'STOP'), '');
  for (const tool of ['Bash', 'Edit', 'Write', 'NotebookEdit']) {
    assert.match(guard(tool, { command: 'ls', file_path: join(root, 'a.txt') }, root) ?? '', /STOP/, `${tool} not frozen`);
  }
  assert.equal(guard('Read', { file_path: join(root, 'a.txt') }, root), null, 'reads stay possible while stopped');
});

test('the project settings actually wire the guard as a PreToolUse hook over the mutating tools', () => {
  const settings = JSON.parse(readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8'));
  const entries = settings.hooks?.PreToolUse ?? [];
  const wired = entries.filter((e) => (e.hooks ?? []).some((h) => /autonomy_guard\.py/.test(h.command)));
  assert.equal(wired.length, 1, 'exactly one PreToolUse entry runs the guard');
  for (const tool of ['Bash', 'Edit', 'Write']) assert.match(wired[0].matcher, new RegExp(`(^|\\|)${tool}(\\||$)`));
  assert.ok((settings.permissions?.deny ?? []).some((r) => /\.env/.test(r)), 'reading .env is denied by rule');
});

// ------------------------------------------------------------- the supervisor

const FAKE_AGENT = `
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
const root = process.env.AUTONOMY_ROOT;
const script = JSON.parse(readFileSync(root + '/script.json', 'utf8'));
const n = existsSync(root + '/calls') ? Number(readFileSync(root + '/calls', 'utf8')) : 0;
writeFileSync(root + '/calls', String(n + 1));
writeFileSync(root + '/prompt-' + (n + 1) + '.txt', process.argv[2] ?? '');
const step = script[n] ?? { exit: 0, result: { status: 'human_blocked', human_blocker: 'script ran out' } };
if (step.sleep) await new Promise((r) => setTimeout(r, step.sleep));
if (step.result) { mkdirSync(root + '/.autonomy', { recursive: true }); writeFileSync(root + '/.autonomy/result.json', JSON.stringify(step.result)); }
process.exit(step.exit ?? 0);
`;

function sandbox(script, { acceptance } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'autonomy-sup-'));
  mkdirSync(join(root, 'docs', 'autonomy'), { recursive: true });
  mkdirSync(join(root, 'scripts'));
  copyFileSync(REVIEW_GATE, join(root, 'scripts', 'autonomy-review-gate.py'));
  writeFileSync(join(root, 'docs', 'autonomy', 'OWNER_PROMPT.md'), 'OWNER PROMPT BODY: FORGET OWNER PREFERENCES AS PRODUCT EVIDENCE\n');
  writeFileSync(join(root, 'docs', 'autonomy', 'MISSION.md'), 'MISSION BODY\n');
  writeFileSync(join(root, 'docs', 'autonomy', 'ACCEPTANCE.json'), JSON.stringify(acceptance ?? { schema: 1, fresh_reviews_without_material_blocker: 0, required_fresh_reviews_without_material_blocker: 3 }));
  writeFileSync(join(root, 'docs', 'autonomy', 'CUSTOMER_FINDINGS.md'), '- [open][critical] F-001: still broken — evidence: x\n');
  writeFileSync(join(root, 'script.json'), JSON.stringify(script));
  writeFileSync(join(root, 'fake-agent.mjs'), FAKE_AGENT);
  return root;
}

function supervise(root, extraEnv = {}) {
  const r = spawnSync('python3', [SUPERVISOR], {
    env: {
      ...process.env,
      AUTONOMY_ROOT: root,
      AUTONOMY_AGENT_CMD: JSON.stringify(['node', join(root, 'fake-agent.mjs'), '{PROMPT}']),
      AUTONOMY_BACKOFF: '0',
      ...extraEnv,
    },
    encoding: 'utf8',
    timeout: 60_000,
  });
  const state = existsSync(join(root, '.autonomy', 'state.json')) ? JSON.parse(readFileSync(join(root, '.autonomy', 'state.json'), 'utf8')) : null;
  const calls = existsSync(join(root, 'calls')) ? Number(readFileSync(join(root, 'calls'), 'utf8')) : 0;
  const prompt = (i) => readFileSync(join(root, `prompt-${i}.txt`), 'utf8');
  return { status: r.status, state, calls, prompt, stderr: r.stderr };
}

test('STOP present: the supervisor starts no session at all', () => {
  const root = sandbox([{ exit: 0, result: { status: 'continue' } }]);
  mkdirSync(join(root, '.autonomy'), { recursive: true });
  writeFileSync(join(root, '.autonomy', 'STOP'), '');
  const r = supervise(root);
  assert.equal(r.status, 0);
  assert.equal(r.calls, 0, 'no child may start while STOP exists');
  assert.equal(r.state.status, 'stopped');
});

test('a crashed session makes the NEXT fresh session run in RECOVERY MODE', () => {
  const root = sandbox([
    { exit: 1 },
    { exit: 0, result: { status: 'human_blocked', human_blocker: 'test end' } },
  ]);
  const r = supervise(root);
  assert.equal(r.status, 3);
  assert.equal(r.calls, 2);
  assert.doesNotMatch(r.prompt(1), /RECOVERY MODE/, 'control: the first session is not in recovery');
  assert.match(r.prompt(2), /RECOVERY MODE/);
  assert.equal(r.state.status, 'human_blocked');
});

test('three consecutive failed sessions stop the supervisor with a recorded blocker', () => {
  const r = supervise(sandbox([{ exit: 1 }, { exit: 1 }, { exit: 2 }, { exit: 0, result: { status: 'continue' } }]));
  assert.equal(r.status, 2);
  assert.equal(r.calls, 3, 'the fourth session must never start');
  assert.equal(r.state.status, 'supervisor_blocked');
  assert.match(r.state.human_blocker, /3 consecutive/);
});

test('an overrunning session is killed at the wall-clock ceiling and counted as a failure', () => {
  const r = supervise(
    sandbox([{ exit: 0, sleep: 20_000, result: { status: 'continue' } }, { exit: 0, result: { status: 'human_blocked', human_blocker: 'end' } }]),
    { AUTONOMY_MAX_SESSION_SECONDS: '1' },
  );
  assert.equal(r.status, 3);
  assert.equal(r.calls, 2);
  assert.match(r.prompt(2), /RECOVERY MODE/, 'the killed session must be treated as unclean');
});

test('a stale result.json from an earlier session is never read as this session\'s result', () => {
  const root = sandbox([{ exit: 0 }, { exit: 0, result: { status: 'human_blocked', human_blocker: 'end' } }]);
  mkdirSync(join(root, '.autonomy'), { recursive: true });
  writeFileSync(join(root, '.autonomy', 'result.json'), JSON.stringify({ status: 'human_blocked', human_blocker: 'STALE' }));
  const r = supervise(root);
  assert.equal(r.calls, 2, 'the stale human_blocked must not end the run after session 1');
  assert.equal(r.state.human_blocker, 'end');
});

test('candidate_complete is IGNORED while the acceptance gate refuses it', () => {
  const r = supervise(sandbox([
    { exit: 0, result: { status: 'candidate_complete' } },
    { exit: 0, result: { status: 'human_blocked', human_blocker: 'end' } },
  ]));
  assert.equal(r.calls, 2, 'a refused completion claim must lead to another session');
  assert.notEqual(r.state.candidate_complete, true);
});

test('strangers and reviewers get the mission only; implementers get the owner prompt', () => {
  const r = supervise(sandbox([
    { exit: 0, result: { status: 'continue', next_phase: 'critic' } },
    { exit: 0, result: { status: 'continue', next_phase: 'reviewer' } },
    { exit: 0, result: { status: 'continue', review_verdict: 'PASS', next_phase: 'implementer' } },
    { exit: 0, result: { status: 'human_blocked', human_blocker: 'end' } },
  ]));
  assert.equal(r.calls, 4);
  assert.match(r.prompt(1), /FRESH ROBLOX CUSTOMER/);
  assert.match(r.prompt(1), /MISSION BODY/);
  assert.doesNotMatch(r.prompt(1), /FORGET OWNER PREFERENCES/, 'the stranger must not receive the owner prompt');
  assert.match(r.prompt(2), /FORGET OWNER PREFERENCES/, 'the critic works from the owner prompt');
  assert.match(r.prompt(3), /INDEPENDENT CUSTOMER REVIEWER/);
  assert.doesNotMatch(r.prompt(3), /FORGET OWNER PREFERENCES/);
  assert.match(r.prompt(4), /Role for this session: implementer/);
});

test('the review streak is kept by the supervisor: PASS counts, MATERIAL_FINDINGS resets', () => {
  const root = sandbox([
    { exit: 0, result: { status: 'continue', next_phase: 'reviewer' } },
    { exit: 0, result: { status: 'continue', review_verdict: 'PASS', next_phase: 'reviewer' } },
    { exit: 0, result: { status: 'continue', review_verdict: 'PASS', next_phase: 'reviewer' } },
    { exit: 0, result: { status: 'continue', review_verdict: 'MATERIAL_FINDINGS', next_phase: 'reviewer' } },
    { exit: 0, result: { status: 'continue', review_verdict: 'PASS', next_phase: 'critic' } },
    { exit: 0, result: { status: 'human_blocked', human_blocker: 'end' } },
  ]);
  const r = supervise(root);
  assert.equal(r.calls, 6);
  const acc = JSON.parse(readFileSync(join(root, 'docs', 'autonomy', 'ACCEPTANCE.json'), 'utf8'));
  assert.equal(acc.fresh_reviews_without_material_blocker, 1, 'PASS, PASS, MATERIAL (reset), PASS => 1');
});

test('the supervisor refuses to run while an interactive Product Owner holds the lock', () => {
  const root = sandbox([{ exit: 0, result: { status: 'continue' } }]);
  mkdirSync(join(root, '.autonomy', 'locks'), { recursive: true });
  writeFileSync(join(root, '.autonomy', 'locks', 'product-owner.lock'), `${process.pid}\n`);
  const r = supervise(root);
  assert.equal(r.status, 4);
  assert.equal(r.calls, 0);
  writeFileSync(join(root, '.autonomy', 'locks', 'product-owner.lock'), '999999\n');
  const r2 = supervise(root);
  assert.ok(r2.calls >= 1, 'a lock held by a dead pid is stale and must not block forever');
});

// --reviews-only (owner, 23 Sep: "you don't leave this session until the product is ready"): reviews
// run beside the interactive session, and the streak is still kept by the supervisor, never the session.
test('--reviews-only runs only reviewers beside a live Product Owner and stops at the required streak', () => {
  const root = sandbox([
    { exit: 0, result: { status: 'continue', review_verdict: 'PASS', next_phase: 'critic' } },
    { exit: 0, result: { status: 'continue', review_verdict: 'PASS', next_phase: 'implementer' } },
    { exit: 0, result: { status: 'continue', review_verdict: 'PASS' } },
    { exit: 0, result: { status: 'continue', review_verdict: 'PASS' } },
  ]);
  mkdirSync(join(root, '.autonomy', 'locks'), { recursive: true });
  writeFileSync(join(root, '.autonomy', 'locks', 'product-owner.lock'), `${process.pid}\n`);
  const r = spawnSync('python3', [SUPERVISOR, '--reviews-only'], {
    env: { ...process.env, AUTONOMY_ROOT: root, AUTONOMY_AGENT_CMD: JSON.stringify(['node', join(root, 'fake-agent.mjs'), '{PROMPT}']), AUTONOMY_BACKOFF: '0' },
    encoding: 'utf8', timeout: 60_000,
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(Number(readFileSync(join(root, 'calls'), 'utf8')), 3, 'it stops once three reviews passed');
  for (const i of [1, 2, 3]) {
    const p = readFileSync(join(root, `prompt-${i}.txt`), 'utf8');
    assert.match(p, /INDEPENDENT CUSTOMER REVIEWER/, `session ${i} must be a reviewer whatever next_phase said`);
    assert.doesNotMatch(p, /FORGET OWNER PREFERENCES/);
  }
  const acc = JSON.parse(readFileSync(join(root, 'docs', 'autonomy', 'ACCEPTANCE.json'), 'utf8'));
  assert.equal(acc.fresh_reviews_without_material_blocker, 3);
});

test('--reviews-only stops at the first material finding with the streak reset', () => {
  const root = sandbox([
    { exit: 0, result: { status: 'continue', review_verdict: 'PASS' } },
    { exit: 0, result: { status: 'continue', review_verdict: 'MATERIAL_FINDINGS' } },
    { exit: 0, result: { status: 'continue', review_verdict: 'PASS' } },
  ]);
  const r = spawnSync('python3', [SUPERVISOR, '--reviews-only'], {
    env: { ...process.env, AUTONOMY_ROOT: root, AUTONOMY_AGENT_CMD: JSON.stringify(['node', join(root, 'fake-agent.mjs'), '{PROMPT}']), AUTONOMY_BACKOFF: '0' },
    encoding: 'utf8', timeout: 60_000,
  });
  assert.equal(r.status, 6);
  assert.equal(Number(readFileSync(join(root, 'calls'), 'utf8')), 2);
  const acc = JSON.parse(readFileSync(join(root, 'docs', 'autonomy', 'ACCEPTANCE.json'), 'utf8'));
  assert.equal(acc.fresh_reviews_without_material_blocker, 0);
});

// ------------------------------------------------------------ the acceptance gate

const FLAGS = ['deterministic_gates_green', 'production_deployed', 'production_bytes_verified', 'signed_in_browser_qa',
  'mobile_qa', 'real_studio_end_to_end', 'studio_readback_verified', 'follow_up_edit_verified',
  'failure_recovery_verified', 'database_security_verified', 'production_error_reviewed'];

function gateRoot({ findings, overrides = {}, dropEvidence } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'autonomy-gate-'));
  mkdirSync(join(root, 'docs', 'autonomy', 'evidence'), { recursive: true });
  writeFileSync(join(root, 'docs', 'autonomy', 'evidence', 'proof.md'), 'x');
  const evidence = {};
  const acc = { schema: 1, fresh_reviews_without_material_blocker: 3, required_fresh_reviews_without_material_blocker: 3, missions: { a: true, b: true }, evidence };
  for (const f of FLAGS) { acc[f] = true; evidence[f] = ['docs/autonomy/evidence/proof.md']; }
  evidence['mission:a'] = ['docs/autonomy/evidence/proof.md'];
  evidence['mission:b'] = ['docs/autonomy/evidence/proof.md'];
  if (dropEvidence) delete evidence[dropEvidence];
  Object.assign(acc, overrides);
  writeFileSync(join(root, 'docs', 'autonomy', 'ACCEPTANCE.json'), JSON.stringify(acc));
  writeFileSync(join(root, 'docs', 'autonomy', 'CUSTOMER_FINDINGS.md'), findings ?? '- [closed][critical] F-001: fixed — evidence: x\n- [open][low] F-002: nit — evidence: y\n');
  return root;
}
const gate = (root) => spawnSync('python3', [REVIEW_GATE], { env: { ...process.env, AUTONOMY_ROOT: root }, encoding: 'utf8' });

test('the acceptance gate passes only a fully evidenced, fully reviewed state', () => {
  const ok = gate(gateRoot());
  assert.equal(ok.status, 0, ok.stdout);
  assert.match(ok.stdout, /ACCEPTANCE MET/);
});

test('the acceptance gate refuses each way completion can be faked', () => {
  const cases = [
    ['an open critical finding in CUSTOMER_FINDINGS.md, whatever the JSON says', gateRoot({ findings: '- [open][critical] F-009: broken — evidence: z\n', overrides: { open_critical_findings: 0 } }), /open critical findings: F-009/],
    ['an open high finding', gateRoot({ findings: '- [open][high] F-010: bad — evidence: z\n' }), /open high findings: F-010/],
    ['a true flag with no evidence behind it', gateRoot({ dropEvidence: 'real_studio_end_to_end' }), /real_studio_end_to_end is true but names no existing evidence/],
    ['a mission not yet succeeded', gateRoot({ overrides: { missions: { a: true, b: false } } }), /mission b has not succeeded/],
    ['too few fresh reviews', gateRoot({ overrides: { fresh_reviews_without_material_blocker: 2 } }), /fresh reviews without a material blocker: 2 of 3/],
    ['a flag still false', gateRoot({ overrides: { mobile_qa: false } }), /mobile_qa is not true/],
    ['a findings file the parser cannot read any line of', gateRoot({ findings: 'nothing here\n' }), /no parseable finding lines/],
  ];
  for (const [what, root, expected] of cases) {
    const r = gate(root);
    assert.equal(r.status, 1, `gate passed despite ${what}`);
    assert.match(r.stdout, expected, what);
  }
});

test('the real docs/autonomy contract is readable by the gate and its findings file is not vacuous', () => {
  // Asserts the PROPERTY (the gate can judge the real contract), not today's verdict — a test that
  // insisted on "not met" would go red the day the product is finished.
  const r = spawnSync('python3', [REVIEW_GATE], { env: { ...process.env, AUTONOMY_ROOT: ROOT }, encoding: 'utf8' });
  assert.ok(r.status === 0 || r.status === 1, `gate crashed: ${r.stderr}`);
  assert.match(r.stdout, /^ACCEPTANCE (NOT )?MET/m);
  assert.doesNotMatch(r.stdout, /UNREADABLE|no parseable finding lines/);
  assert.ok(readdirSync(join(ROOT, 'docs', 'autonomy')).includes('OWNER_PROMPT.md'), 'the mission file exists');
});
