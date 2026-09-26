// These children are local scripts. They cannot invoke a model or paid provider.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SUP = process.env.AUTONOMY_SUPERVISOR_SOURCE || join(REPO, 'scripts/autonomy-supervisor.py');
const PYTHON = spawnSync('python3', ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8' }).stdout.trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const read = p => JSON.parse(readFileSync(p, 'utf8'));
async function until(fn) {
  for (let i = 0; i < 300; i++) { try { if (fn()) return; } catch {} await sleep(20); }
  throw new Error('timed out waiting for fake-child observation');
}
function fixture(steps = [{}], overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'owner-lifecycle-'));
  mkdirSync(join(root, 'docs/autonomy'), { recursive: true });
  mkdirSync(join(root, 'scripts'));
  writeFileSync(join(root, 'docs/autonomy/OWNER_PROMPT.md'), 'OWNER BACKGROUND\n');
  copyFileSync(join(REPO, 'scripts/autonomy-review-gate.py'), join(root, 'scripts/autonomy-review-gate.py'));
  writeFileSync(join(root, 'mission.json'), JSON.stringify({ status: 'active', goal: 'CANONICAL CURRENT GOAL', next_action: 'safe local work' }));
  writeFileSync(join(root, 'steps.json'), JSON.stringify(steps));
  const fake = join(root, 'fake-claude');
  writeFileSync(fake, `#!${PYTHON}\nimport json,sys,time,os,re\nfrom pathlib import Path\nr=Path(${JSON.stringify(root)})\nif '--help' in sys.argv:\n print('--model --resume --session-id --permission-mode --output-format --verbose --append-system-prompt --system-prompt-snapshot');sys.exit(0)\nc=r/'calls.json'\na=json.loads(c.read_text()) if c.exists() else []\na.append(sys.argv[1:]);c.write_text(json.dumps(a))\ns=json.loads((r/'steps.json').read_text())[len(a)-1]\nif s.get('probe_stdin'): (r/'agent-stdin').write_text(sys.stdin.read())\nif s.get('fatal'):\n print(json.dumps({'type':'result','is_error':True,'result':'Your organization has disabled Claude subscription access for Claude Code'}));sys.exit(s.get('rc',1))\nif s.get('native_achieved'): print(json.dumps({'type':'result','is_error':False,'result':'Goal achieved'}))\nif s.get('missing'):\n print('No conversation found with session ID');sys.exit(1)\nwhile s.get('wait') and not (r/'release').exists(): time.sleep(.02)\ntime.sleep(s.get('sleep',0))\nif not s.get('no_result'):\n context=sys.argv[sys.argv.index('--append-system-prompt')+1] if '--append-system-prompt' in sys.argv else sys.argv[sys.argv.index('-p')+1]\n p=re.search(r'ONLY at (.+?)\\.\\nSchema:',context).group(1)\n Path(p).write_text(json.dumps({'status':s.get('status','human_blocked'), 'full_objective_audit':s.get('audit')}))\nsys.exit(s.get('rc',0))\n`, { mode: 0o755 });
  const cfg = { root, python: PYTHON, claude: fake, model: 'opus', continuation_mode: 'resumed_turn', mission_path: join(root, 'mission.json'), heartbeat_seconds: .05, shutdown_grace_seconds: .15, max_failures: 3, backoff_seconds: [.05, .1], ...overrides };
  writeFileSync(join(root, 'config.json'), JSON.stringify(cfg));
  const statePath = join(root, '.autonomy/owner-runtime.json');
  const start = (extra = [], input = 'ignore') => {
    const p = spawn(PYTHON, [SUP, '--owner', '--config', join(root, 'config.json'), ...extra], { env: { ...process.env, AUTONOMY_ROOT: root }, stdio: [input, 'pipe', 'pipe'] });
    p.err = ''; p.stderr.on('data', b => { p.err += b; });
    p.done = new Promise(r => p.on('exit', (code, signal) => r({ code, signal })));
    return p;
  };
  const sync = (extra = []) => spawnSync(PYTHON, [SUP, '--owner', '--config', join(root, 'config.json'), ...extra], { env: { ...process.env, AUTONOMY_ROOT: root }, encoding: 'utf8', timeout: 10000 });
  return { root, start, sync, state: () => read(statePath), calls: () => existsSync(join(root, 'calls.json')) ? read(join(root, 'calls.json')) : [] };
}
async function cleanup(f, ...supervisors) {
  // Only identities created by this fixture are signalled. Never inspect training.
  writeFileSync(join(f.root, 'release'), '');
  for (const p of supervisors) { if (p.exitCode === null && p.signalCode === null) p.kill('SIGTERM'); await p.done; }
  if (existsSync(join(f.root, '.autonomy/owner-runtime.json'))) {
    const child = f.state().child;
    if (child && existsSync(child.identity_path)) {
      const info = read(child.identity_path);
      for (const id of [info.agent, info.relay]) if (id) { try { process.kill(id.pid, 'SIGTERM'); } catch {} }
    }
  }
}

test('explicit owner selects model and resumes the same durable session without rotating roles', async () => {
  const f = fixture([{ status: 'continue' }, { status: 'human_blocked' }]);
  const p = f.start();
  try {
    assert.equal((await p.done).code, 3, p.err);
    const calls = f.calls(); assert.equal(calls.length, 2);
    assert.equal(calls[0][calls[0].indexOf('--model') + 1], 'opus');
    const id = calls[0][calls[0].indexOf('--session-id') + 1];
    assert.equal(calls[1][calls[1].indexOf('--resume') + 1], id);
    assert.match(calls[0][1], /CANONICAL CURRENT GOAL/);
    assert.match(calls[1][1], /STRATEGIC OWNER CONTROL/);
    assert.equal(f.state().max_wall_clock_hours, null);
    assert.equal(existsSync(join(f.root, '.autonomy/state.json')), false);
    assert.equal(existsSync(join(f.root, '.autonomy/result.json')), false);
  } finally { await cleanup(f, p); }
});

test('simultaneous starts exclude the second supervisor; heartbeat is atomic and advances', async () => {
  const f = fixture([{ wait: true }]);
  const a = f.start(), b = f.start();
  try {
    await until(() => f.calls().length === 1);
    await until(() => a.exitCode === 4 || b.exitCode === 4);
    const heartbeat = f.state().heartbeat_at;
    await until(() => f.state().heartbeat_at !== heartbeat);
    assert.equal(f.calls().length, 1);
    const winner = a.exitCode === 4 ? b : a;
    winner.kill('SIGTERM'); assert.equal((await winner.done).code, 0);
    assert.equal(f.state().status, 'detached');
    assert.equal(f.calls().length, 1);
  } finally { await cleanup(f, a, b); }
});

test('supervisor SIGKILL leaves an orphan with a lease; restart adopts it without duplication', async () => {
  const f = fixture([{ wait: true, status: 'continue' }, { status: 'human_blocked' }]);
  const a = f.start(); let b;
  try {
    await until(() => f.calls().length === 1);
    const before = read(f.state().child.identity_path);
    a.kill('SIGKILL'); await a.done;
    b = f.start();
    await until(() => f.state().supervisor.pid === b.pid && f.state().status === 'observing_child');
    assert.equal(read(f.state().child.identity_path).agent.pid, before.agent.pid);
    assert.equal(f.calls().length, 1);
    writeFileSync(join(f.root, 'release'), '');
    assert.equal((await b.done).code, 3, b.err);
    assert.equal(f.calls().length, 2);
    assert.ok(f.calls()[1].includes('--resume'));
  } finally { await cleanup(f, a, ...(b ? [b] : [])); }
});

test('relay SIGKILL preserves surviving agent; restart reconciles agent identity and lease', async () => {
  const f = fixture([{ wait: true }]);
  const a = f.start(); let b;
  try {
    await until(() => f.calls().length === 1 && read(f.state().child.identity_path).agent);
    const info = read(f.state().child.identity_path);
    a.kill('SIGKILL'); await a.done;
    process.kill(info.relay.pid, 'SIGKILL');
    b = f.start();
    await until(() => f.state().supervisor.pid === b.pid && f.state().status === 'observing_child');
    assert.equal(f.calls().length, 1);
    process.kill(info.agent.pid, 0);
    b.kill('SIGTERM'); await b.done;
    assert.equal(f.state().status, 'detached');
  } finally { await cleanup(f, a, ...(b ? [b] : [])); }
});

test('STOP and canonical/runtime terminal states never start a child', () => {
  for (const status of ['paused', 'complete', 'blocked']) {
    const f = fixture(); const m = read(join(f.root, 'mission.json')); m.status = status;
    writeFileSync(join(f.root, 'mission.json'), JSON.stringify(m));
    assert.equal(f.sync().status, 0); assert.equal(f.calls().length, 0);
  }
  const f = fixture(); mkdirSync(join(f.root, '.autonomy'), { recursive: true });
  writeFileSync(join(f.root, '.autonomy/STOP'), '');
  assert.equal(f.sync().status, 0); assert.equal(f.state().status, 'stopped');
  rmSync(join(f.root, '.autonomy/STOP'));
  assert.equal(f.sync().status, 0); assert.equal(f.calls().length, 0, 'removing STOP cannot silently clear terminal runtime');
});

test('STOP during child work signals only the verified fake group and starts no replacement', async () => {
  const f = fixture([{ wait: true }]); const p = f.start();
  try {
    await until(() => f.calls().length === 1);
    writeFileSync(join(f.root, '.autonomy/STOP'), '');
    assert.equal((await p.done).code, 0);
    assert.equal(f.state().status, 'stopped'); assert.equal(f.calls().length, 1);
  } finally { await cleanup(f, p); }
});

test('missing native session reconstructs from canonical state; provider failures are bounded', async () => {
  const f = fixture([{ status: 'continue' }, { missing: true }, { status: 'human_blocked' }]);
  const p = f.start();
  try {
    assert.equal((await p.done).code, 3, p.err);
    const c = f.calls(); assert.equal(c.length, 3);
    assert.ok(c[1].includes('--resume')); assert.ok(c[2].includes('--session-id'));
    assert.notEqual(c[0].at(-1), c[2].at(-1));
    assert.match(c[2][1], /RECOVERY MODE/); assert.match(c[2][1], /CANONICAL CURRENT GOAL/);
    assert.ok(f.state().reconstructed_at);
  } finally { await cleanup(f, p); }
  const g = fixture([{ rc: 1, no_result: true }, { rc: 1, no_result: true }, { rc: 1, no_result: true }]);
  const q = g.start();
  try { assert.equal((await q.done).code, 2); assert.equal(g.calls().length, 3); assert.equal(g.state().status, 'supervisor_blocked'); }
  finally { await cleanup(g, q); }
});

test('enduring owner ignores expired legacy ceilings; explicit owner ceiling and corrupt runtime fail closed', () => {
  const f = fixture(); mkdirSync(join(f.root, '.autonomy'), { recursive: true });
  writeFileSync(join(f.root, '.autonomy/state.json'), JSON.stringify({ started_at: '2020-01-01', max_wall_clock_hours: 72, iteration: 80 }));
  assert.equal(f.sync().status, 3); assert.equal(f.calls().length, 1);
  const g = fixture([], { max_sessions: 1 });
  mkdirSync(join(g.root, '.autonomy'), { recursive: true });
  writeFileSync(join(g.root, '.autonomy/owner-runtime.json'), JSON.stringify({ status: 'ready', iteration: 1, started_at: new Date().toISOString(), session_id: 'xxx', child: null }));
  assert.equal(g.sync().status, 5); assert.equal(g.calls().length, 0);
  const h = fixture(); mkdirSync(join(h.root, '.autonomy'), { recursive: true });
  writeFileSync(join(h.root, '.autonomy/owner-runtime.json'), '{bad');
  assert.equal(h.sync().status, 8); assert.equal(h.calls().length, 0);
});

test('inactive LaunchAgent renderer validates root/flags and uses absolute executable paths', () => {
  const f = fixture(); const output = join(f.root, 'rendered');
  const run = root => spawnSync(PYTHON, [join(REPO, 'scripts/autonomy/install-owner-launchagent.py'), '--root', root,
    '--mission', join(f.root, 'mission.json'), '--model', 'opus', '--goal-condition', 'Full product acceptance gate passes on real independent evidence with a persistent strategic Opus owner and canonical mission state.', '--python', PYTHON,
    '--claude', join(f.root, 'fake-claude'), '--output-dir', output], { encoding: 'utf8' });
  assert.equal(run(f.root).status, 1, 'non-repository root is refused');
  const r = run(REPO); assert.equal(r.status, 0, r.stderr);
  const cfg = read(join(output, 'owner-config.json'));
  assert.equal(cfg.python, PYTHON); assert.equal(cfg.claude, join(f.root, 'fake-claude'));
  assert.equal(cfg.max_wall_clock_hours, null);
  const plist = readFileSync(join(output, 'com.moshe.apple.strategic-owner.plist'), 'utf8');
  assert.match(plist, /SuccessfulExit/); assert.match(plist, /--owner/); assert.doesNotMatch(plist, /\{\{/);
  assert.match(r.stdout, /No launchctl call made/);
  assert.equal(run(REPO).status, 1, 'existing config is preserved');
});

function pending(f, extra = {}) {
  const folder = join(f.root, '.autonomy/owner-sessions/intent'); mkdirSync(folder, { recursive: true });
  const child = { token: 'intent', started_epoch: Date.now() / 1000, resume: true,
    ...Object.fromEntries(['identity', 'exit', 'result', 'output'].map(k => [`${k}_path`, join(folder, `${k}.json`)])) };
  writeFileSync(join(f.root, '.autonomy/owner-runtime.json'), JSON.stringify({ schema: 1, status: 'launching',
    iteration: 1, failures: 0, started_at: new Date().toISOString(), session_id: 'c95f44c5-03d4-49ce-bbe6-bd310d714a49',
    session_established: true, recovery: false, child, ...extra }));
  return child;
}
async function holdLease(f) {
  mkdirSync(join(f.root, '.autonomy/locks'), { recursive: true });
  const code = `import fcntl,time\nfrom pathlib import Path\nf=open(${JSON.stringify(join(f.root, '.autonomy/locks/execution.lock'))},'a+')\nfcntl.flock(f,fcntl.LOCK_EX)\nPath(${JSON.stringify(join(f.root, 'lease-ready'))}).touch()\nwhile not Path(${JSON.stringify(join(f.root, 'release-lease'))}).exists():time.sleep(.02)\n`;
  const p = spawn(PYTHON, ['-c', code], { stdio: 'ignore' });
  p.done = new Promise(r => p.on('exit', r));
  await until(() => existsSync(join(f.root, 'lease-ready')));
  return p;
}

test('crash before child identity publication waits for inherited lease; then resumes in recovery', async () => {
  const f = fixture([{ status: 'human_blocked' }]); pending(f);
  const holder = await holdLease(f); const p = f.start();
  try {
    await until(() => f.state().status === 'reconciling');
    await sleep(120); assert.equal(f.calls().length, 0);
    writeFileSync(join(f.root, 'release-lease'), ''); await holder.done;
    assert.equal((await p.done).code, 3, p.err);
    assert.ok(f.calls()[0].includes('--resume'));
    assert.match(f.calls()[0][1], /RECOVERY MODE/);
  } finally { writeFileSync(join(f.root, 'release-lease'), ''); await holder.done; await cleanup(f, p); }
});

test('unknown lease holder blocks a blank runtime; stale birth identity never signals an unrelated PID', async () => {
  const f = fixture(); const holder = await holdLease(f);
  try { assert.equal(f.sync().status, 8); assert.equal(f.calls().length, 0); assert.equal(f.state().status, 'reconciliation_blocked'); }
  finally { writeFileSync(join(f.root, 'release-lease'), ''); await holder.done; }
  const g = fixture([{ status: 'human_blocked' }]); const child = pending(g);
  writeFileSync(child.identity_path, JSON.stringify({ token: child.token, relay: { pid: process.pid, start: 'WRONG-BIRTH' }, agent: null }));
  assert.equal(g.sync().status, 3);
  assert.equal(g.calls().length, 1); process.kill(process.pid, 0);
  assert.match(g.calls()[0][1], /RECOVERY MODE/);
});

test('persisted backoff survives supervisor restart and canonical next action is reread', async () => {
  const f = fixture([{ wait: true, status: 'continue' }, { status: 'human_blocked' }]);
  pending(f, { child: null, status: 'backoff', retry_at_epoch: Date.now() / 1000 + .35 });
  const p = f.start();
  try {
    await until(() => existsSync(join(f.root, '.autonomy/owner-runtime.json')) && f.state().supervisor?.pid === p.pid);
    assert.equal(f.calls().length, 0, 'persisted retry deadline forbids immediate launch');
    await until(() => f.calls().length === 1);
    const mission = read(join(f.root, 'mission.json')); mission.next_action = 'NEW CANONICAL ACTION';
    writeFileSync(join(f.root, 'mission.json'), JSON.stringify(mission));
    writeFileSync(join(f.root, 'release'), '');
    assert.equal((await p.done).code, 3);
    assert.match(f.calls()[1][1], /NEW CANONICAL ACTION/);
  } finally { await cleanup(f, p); }
});

test('session deadline preserves surviving child; missing result is recovery, never a clean turn', async () => {
  const f = fixture([{ wait: true }], { session_seconds: 1.5 }); const p = f.start();
  try {
    await until(() => f.calls().length === 1);
    assert.equal((await p.done).code, 3, p.err); assert.equal(f.state().status, 'human_blocked');
    const agent = read(f.state().child.identity_path).agent; process.kill(agent.pid, 0);
    assert.equal(f.sync().status, 0); assert.equal(f.calls().length, 1, 'terminal deadline cannot relaunch');
  } finally { await cleanup(f, p); }
  const g = fixture([{ no_result: true }, { status: 'human_blocked' }]); const q = g.start();
  try { assert.equal((await q.done).code, 3); assert.match(g.calls()[1][1], /RECOVERY MODE/); assert.ok(g.calls()[1].includes('--resume')); }
  finally { await cleanup(g, q); }
});

test('legacy builders are excluded while independent reviewers retain a fresh separate lifecycle', async () => {
  const f = fixture([{ wait: true }]); const p = f.start();
  try {
    await until(() => f.calls().length === 1);
    const env = { ...process.env, AUTONOMY_ROOT: f.root };
    assert.equal(spawnSync(PYTHON, [SUP], { env, encoding: 'utf8' }).status, 4);
    writeFileSync(join(f.root, 'docs/autonomy/MISSION.md'), 'FRESH CUSTOMER MISSION');
    writeFileSync(join(f.root, 'docs/autonomy/ACCEPTANCE.json'), JSON.stringify({ fresh_reviews_without_material_blocker: 0 }));
    writeFileSync(join(f.root, 'reviewer.py'), `import sys,json\nfrom pathlib import Path\nr=Path(${JSON.stringify(f.root)})\n(r/'review-prompt').write_text(sys.argv[1])\n(r/'.autonomy/result.json').write_text(json.dumps({'status':'continue','review_verdict':'MATERIAL_FINDINGS'}))\n`);
    env.AUTONOMY_AGENT_CMD = JSON.stringify([PYTHON, join(f.root, 'reviewer.py'), '{PROMPT}']);
    const review = spawnSync(PYTHON, [SUP, '--reviews-only'], { env, encoding: 'utf8', timeout: 10000 });
    assert.equal(review.status, 6, review.stderr);
    const prompt = readFileSync(join(f.root, 'review-prompt'), 'utf8');
    assert.match(prompt, /INDEPENDENT CUSTOMER REVIEWER/); assert.doesNotMatch(prompt, /CANONICAL CURRENT GOAL|OWNER BACKGROUND/);
    assert.equal(f.calls().length, 1);
    assert.equal(f.state().status, 'observing_child');
  } finally { await cleanup(f, p); }
});

test('the same canonical mission cannot acquire a second owner in another checkout, even after a crash', async () => {
  const a = fixture([{ wait: true }]), b = fixture();
  const cfgPath = join(b.root, 'config.json'); const cfg = read(cfgPath);
  cfg.mission_path = join(a.root, 'mission.json'); writeFileSync(cfgPath, JSON.stringify(cfg));
  const p = a.start();
  try {
    await until(() => a.calls().length === 1);
    assert.equal(b.sync().status, 4, 'live mission lifecycle excludes other roots');
    p.kill('SIGKILL'); await p.done;
    assert.equal(b.sync().status, 8, 'surviving child retains mission execution lease');
    assert.equal(b.calls().length, 0);
  } finally { await cleanup(a, p); }
});

test('terminal runtime with a recorded living child still reconciles STOP on supervisor restart', async () => {
  const f = fixture([{ wait: true }]); const a = f.start(); let b;
  try {
    await until(() => f.calls().length === 1 && read(f.state().child.identity_path).agent);
    const info = read(f.state().child.identity_path);
    a.kill('SIGKILL'); await a.done;
    const state = f.state(); state.status = 'human_blocked';
    writeFileSync(join(f.root, '.autonomy/owner-runtime.json'), JSON.stringify(state));
    writeFileSync(join(f.root, '.autonomy/STOP'), '');
    b = f.start(); assert.equal((await b.done).code, 0, b.err);
    await until(() => {
      try { process.kill(info.agent.pid, 0); return false; } catch { return true; }
    });
    assert.equal(f.state().status, 'stopped'); assert.equal(f.calls().length, 1);
  } finally { await cleanup(f, a, ...(b ? [b] : [])); }
});

test('canonical paused to active requires explicit --resume-owner and retains durable session identity', async () => {
  const f = fixture([{ status: 'human_blocked' }]);
  pending(f, { child: null, status: 'paused' });
  const cfgMission = join(f.root, 'mission.json'); const m = read(cfgMission); m.status = 'paused';
  writeFileSync(cfgMission, JSON.stringify(m));
  assert.equal(f.sync(['--resume-owner']).status, 8, 'cannot resume a still-paused mission');
  m.status = 'active'; writeFileSync(cfgMission, JSON.stringify(m));
  assert.equal(f.sync().status, 0); assert.equal(f.calls().length, 0, 'active mission alone cannot undo deliberate runtime pause');
  const id = f.state().session_id;
  const p = f.start(['--resume-owner']);
  try {
    assert.equal((await p.done).code, 3, p.err); assert.equal(f.calls().length, 1);
    const args = f.calls()[0]; assert.equal(args[args.indexOf('--resume') + 1], id);
    assert.ok(f.state().resumed_at);
    assert.equal(f.sync(['--resume-owner']).status, 8, 'resume does not clear a non-pause terminal blocker');
  } finally { await cleanup(f, p); }
  const g = fixture(); pending(g, { child: null, status: 'paused' });
  writeFileSync(join(g.root, '.autonomy/STOP'), '');
  assert.equal(g.sync(['--resume-owner']).status, 8); assert.equal(g.calls().length, 0);
});

test('a sticky runtime blocker alone preserves recorded survivors on restart', async () => {
  const f = fixture([{ wait: true }]); const p = f.start();
  try {
    await until(() => f.calls().length === 1 && read(f.state().child.identity_path).agent);
    const info = read(f.state().child.identity_path);
    p.kill('SIGKILL'); await p.done;
    const state = f.state(); state.status = 'human_blocked';
    writeFileSync(join(f.root, '.autonomy/owner-runtime.json'), JSON.stringify(state));
    assert.equal(f.sync().status, 0); process.kill(info.agent.pid, 0);
    assert.equal(f.state().status, 'human_blocked'); assert.equal(f.calls().length, 1);
  } finally { await cleanup(f, p); }
});

const PRODUCT_CONDITION = 'Complete the Apple Roblox Studio product: scripts/autonomy-review-gate.py exits 0 on fresh independent browser/Studio/gameplay evidence, with canonical full-owner objective honored, deterministic single-owner recovery, independent evaluations and current mission state; preserve STOP and account/provider boundaries.';
function nativeFixture(steps, overrides = {}) {
  return fixture(steps, { continuation_mode: 'native_goal', goal_condition: PRODUCT_CONDITION, ...overrides });
}

test('native goal owns in-process continuation, streams output, and native achieved does not bypass acceptance', async () => {
  const f = nativeFixture(Array.from({ length: 3 }, () => ({ native_achieved: true, no_result: true })));
  const p = f.start();
  try {
    assert.equal((await p.done).code, 2, p.err);
    const calls = f.calls(); assert.equal(calls.length, 3, 'unmet native exits have bounded recovery, not a hot turn loop');
    for (const c of calls) {
      assert.equal(c[c.indexOf('-p') + 1], '/goal ' + PRODUCT_CONDITION);
      assert.equal(c[c.indexOf('--output-format') + 1], 'stream-json');
      assert.ok(c.includes('--verbose')); assert.ok(c.includes('--append-system-prompt'));
      assert.equal(c[c.indexOf('--system-prompt-snapshot') + 1], 'off');
    }
    assert.ok(calls[1].includes('--resume')); assert.equal(f.state().acceptance_gate_passed, false);
    assert.equal(f.state().status, 'supervisor_blocked');
  } finally { await cleanup(f, p); }
});

function auditFile(f) {
  const path = join(f.root, 'docs/evidence/full-owner-audit.md');
  mkdirSync(join(f.root, 'docs/evidence'), { recursive: true });
  writeFileSync(path, '# Full objective audit\nLive compaction/restart, owner agency, listed assets, independent evaluations and canonical state: verified by isolated fixture evidence.');
  return 'docs/evidence/full-owner-audit.md';
}

test('native completion requires explicit candidate receipt, existing full-objective audit and independent gate', async () => {
  const f = nativeFixture([{ native_achieved: true, status: 'candidate_complete', audit: 'docs/evidence/full-owner-audit.md' }]);
  auditFile(f);
  writeFileSync(join(f.root, 'scripts/autonomy-review-gate.py'), 'raise SystemExit(0)\n');
  const p = f.start();
  try { assert.equal((await p.done).code, 0, p.err); assert.equal(f.calls().length, 1); assert.equal(f.state().status, 'candidate_complete'); assert.equal(f.state().acceptance_gate_passed, true); assert.equal(f.state().full_objective_audit, 'docs/evidence/full-owner-audit.md'); }
  finally { await cleanup(f, p); }
  for (const step of [{ no_result: true }, { status: 'continue', audit: 'docs/evidence/full-owner-audit.md' }, { status: 'candidate_complete' }, { status: 'candidate_complete', audit: 'docs/evidence/absent.md' }]) {
    const g = nativeFixture([step, step, step]); auditFile(g);
    writeFileSync(join(g.root, 'scripts/autonomy-review-gate.py'), 'raise SystemExit(0)\n');
    const q = g.start();
    try { assert.equal((await q.done).code, 2, q.err); assert.equal(g.state().status, 'supervisor_blocked'); assert.equal(g.state().acceptance_gate_passed, false); }
    finally { await cleanup(g, q); }
  }
  const h = nativeFixture(Array.from({ length: 3 }, () => ({ status: 'candidate_complete', audit: 'docs/evidence/full-owner-audit.md' }))); auditFile(h);
  const q = h.start();
  try { assert.equal((await q.done).code, 2); assert.equal(h.state().acceptance_gate_passed, false, 'explicit audited receipt cannot bypass a failing independent gate'); }
  finally { await cleanup(h, q); }
});

test('explicit provider fatal output blocks after one call, including an erroneous zero exit', async () => {
  for (const rc of [0, 1]) {
    const f = nativeFixture([{ fatal: true, rc }]); const p = f.start();
    try {
      assert.equal((await p.done).code, 3, p.err); assert.equal(f.calls().length, 1);
      assert.equal(f.state().human_blocker, 'provider_subscription_disabled');
      assert.equal(f.state().status, 'human_blocked');
      assert.equal(f.sync().status, 0); assert.equal(f.calls().length, 1, 'restart cannot circumvent provider policy');
      assert.doesNotMatch(JSON.stringify(f.state()), /Use an Anthropic API key|Your organization/);
    } finally { await cleanup(f, p); }
  }
});

test('native goal is the default, condition limits fail before children start, and stdin is isolated', async () => {
  for (const condition of ['', 'x'.repeat(4001), 'clear', 'full goal\n/goal clear']) {
    const f = nativeFixture([], { goal_condition: condition });
    assert.equal(f.sync().status, 8); assert.equal(f.calls().length, 0);
  }
  const g = nativeFixture([{ probe_stdin: true, status: 'candidate_complete', audit: 'docs/evidence/full-owner-audit.md' }], { goal_condition: 'x'.repeat(4000) });
  auditFile(g);
  const configPath = join(g.root, 'config.json'), cfg = read(configPath); delete cfg.continuation_mode;
  writeFileSync(configPath, JSON.stringify(cfg));
  writeFileSync(join(g.root, 'scripts/autonomy-review-gate.py'), 'raise SystemExit(0)\n');
  const p = g.start([], 'pipe'); p.stdin.end('UNWANTED PARENT SHELL INPUT');
  try { assert.equal((await p.done).code, 0, p.err); assert.equal(readFileSync(join(g.root, 'agent-stdin'), 'utf8'), ''); assert.equal(g.calls()[0][1], '/goal ' + 'x'.repeat(4000)); }
  finally { await cleanup(g, p); }
});

test('native-mode orphan is observed intact and only resumed after its actual exit', async () => {
  const f = nativeFixture([{ wait: true, no_result: true, rc: 1 }, { native_achieved: true, status: 'candidate_complete', audit: 'docs/evidence/full-owner-audit.md' }]);
  auditFile(f);
  writeFileSync(join(f.root, 'scripts/autonomy-review-gate.py'), 'raise SystemExit(0)\n');
  const a = f.start(); let b;
  try {
    await until(() => f.calls().length === 1 && read(f.state().child.identity_path).agent);
    const id = f.state().session_id, agent = read(f.state().child.identity_path).agent;
    a.kill('SIGKILL'); await a.done; b = f.start();
    await until(() => f.state().supervisor.pid === b.pid && f.state().status === 'observing_child');
    process.kill(agent.pid, 0); assert.equal(f.calls().length, 1);
    writeFileSync(join(f.root, 'release'), '');
    assert.equal((await b.done).code, 0, b.err); assert.equal(f.calls().length, 2);
    const resumed = f.calls()[1]; assert.equal(resumed[resumed.indexOf('--resume') + 1], id);
    assert.equal(resumed[1], '/goal ' + PRODUCT_CONDITION);
    assert.match(resumed[resumed.indexOf('--append-system-prompt') + 1], /RECOVERY MODE/);
    assert.equal(f.state().status, 'candidate_complete');
  } finally { await cleanup(f, a, ...(b ? [b] : [])); }
});

test('a canonical pause cannot convert a provider blocker into resumable pause', async () => {
  const f = nativeFixture([{ fatal: true }, { status: 'human_blocked' }]);
  const p = f.start();
  try {
    assert.equal((await p.done).code, 3, p.err);
    const m = read(join(f.root, 'mission.json')); m.status = 'paused';
    writeFileSync(join(f.root, 'mission.json'), JSON.stringify(m));
    assert.equal(f.sync().status, 0);
    assert.equal(f.state().terminal_status, 'human_blocked');
    m.status = 'active'; writeFileSync(join(f.root, 'mission.json'), JSON.stringify(m));
    assert.equal(f.sync(['--resume-owner']).status, 8);
    assert.equal(f.calls().length, 1);
  } finally { await cleanup(f, p); }
});

test('restart publication never erases sticky terminal intent before a crash', () => {
  const f = fixture(); pending(f, { child: null, status: 'human_blocked' });
  const probe = `import importlib.util,os\ns=importlib.util.spec_from_file_location('sup',${JSON.stringify(SUP)})\nm=importlib.util.module_from_spec(s);s.loader.exec_module(m)\noriginal=m.save_json\ndef cut(path,value):\n original(path,value)\n if path.name=='owner-runtime.json': os._exit(71)\nm.save_json=cut\nm.owner_main(m.Path(${JSON.stringify(join(f.root, 'config.json'))}))\n`;
  const r = spawnSync(PYTHON, ['-c', probe], { env: { ...process.env, AUTONOMY_ROOT: f.root } });
  assert.equal(r.status, 71);
  assert.equal(f.state().status, 'human_blocked');
  assert.equal(f.sync().status, 0); assert.equal(f.calls().length, 0);
});

test('agent publishes independently after relay death before publication; canonical pause prevents inference', async () => {
  const f = fixture([{ wait: true }], { shutdown_grace_seconds: 2 });
  const proxy = join(f.root, 'proxy-python');
  writeFileSync(proxy, `#!${PYTHON}\nimport os,sys,time\nfrom pathlib import Path\nr=Path(${JSON.stringify(f.root)})\nif '--owner-agent' in sys.argv:\n (r/'before-publication').write_text(str(os.getpid()))\n while not (r/'publish').exists(): time.sleep(.01)\nos.execv(${JSON.stringify(PYTHON)},[${JSON.stringify(PYTHON)}]+sys.argv[1:])\n`, { mode: 0o755 });
  const cfg = read(join(f.root, 'config.json')); cfg.python = proxy;
  writeFileSync(join(f.root, 'config.json'), JSON.stringify(cfg));
  const a = f.start(); let b;
  try {
    await until(() => existsSync(join(f.root, 'before-publication')));
    const info = read(f.state().child.identity_path); assert.equal(info.agent, null);
    process.kill(info.relay.pid, 'SIGKILL'); a.kill('SIGKILL'); await a.done;
    const m = read(join(f.root, 'mission.json')); m.status = 'paused';
    writeFileSync(join(f.root, 'mission.json'), JSON.stringify(m));
    b = f.start(); writeFileSync(join(f.root, 'publish'), '');
    assert.equal((await b.done).code, 0, b.err);
    assert.equal(f.calls().length, 0, 'a paused canonical mission cannot execute the actual model');
    const id = f.state().child && read(f.state().child.identity_path).agent;
    if (id) await until(() => { try { process.kill(id.pid, 0); return false; } catch { return true; } });
    assert.equal(f.state().status, 'paused');
  } finally { writeFileSync(join(f.root, 'publish'), ''); await cleanup(f, a, ...(b ? [b] : [])); }
});

test('delayed unpublished agent cannot revive a recorded pause after canonical reactivation', async () => {
  const f = fixture([{ wait: true }], { shutdown_grace_seconds: .15 });
  const proxy = join(f.root, 'proxy-python');
  writeFileSync(proxy, `#!${PYTHON}\nimport os,sys,time\nfrom pathlib import Path\nr=Path(${JSON.stringify(f.root)})\nif '--owner-agent' in sys.argv:\n (r/'before-publication').write_text(str(os.getpid()))\n while not (r/'publish').exists(): time.sleep(.01)\nos.execv(${JSON.stringify(PYTHON)},[${JSON.stringify(PYTHON)}]+sys.argv[1:])\n`, { mode: 0o755 });
  const cfg = read(join(f.root, 'config.json')); cfg.python = proxy;
  writeFileSync(join(f.root, 'config.json'), JSON.stringify(cfg));
  const a = f.start(); let b;
  try {
    await until(() => existsSync(join(f.root, 'before-publication')));
    const info = read(f.state().child.identity_path);
    process.kill(info.relay.pid, 'SIGKILL'); a.kill('SIGKILL'); await a.done;
    const m = read(join(f.root, 'mission.json')); m.status = 'paused';
    writeFileSync(join(f.root, 'mission.json'), JSON.stringify(m));
    b = f.start(); assert.equal((await b.done).code, 0, b.err);
    assert.equal(f.state().terminal_status, 'paused');
    m.status = 'active'; writeFileSync(join(f.root, 'mission.json'), JSON.stringify(m));
    writeFileSync(join(f.root, 'publish'), '');
    await until(() => read(f.state().child.identity_path).agent);
    const id = read(f.state().child.identity_path).agent;
    await until(() => { try { process.kill(id.pid, 0); return false; } catch { return true; } });
    assert.equal(f.calls().length, 0, 'durable pause remains binding without explicit resume');
    assert.equal(f.sync().status, 0); assert.equal(f.calls().length, 0);
  } finally { writeFileSync(join(f.root, 'publish'), ''); await cleanup(f, a, ...(b ? [b] : [])); }
});

test('legacy builder survives supervisor death while retaining the shared execution lease', async () => {
  const f = fixture(); const worker = join(f.root, 'legacy-worker.py');
  writeFileSync(worker, `import os,time\nfrom pathlib import Path\nr=Path(${JSON.stringify(f.root)})\n(r/'legacy-pid').write_text(str(os.getpid()))\nwhile not (r/'release').exists():time.sleep(.02)\n`);
  const env = { ...process.env, AUTONOMY_ROOT: f.root, AUTONOMY_AGENT_CMD: JSON.stringify([PYTHON, worker]) };
  const a = spawn(PYTHON, [SUP], { env, stdio: 'ignore' }); a.done = new Promise(r => a.on('exit', r));
  let child;
  try {
    await until(() => existsSync(join(f.root, 'legacy-pid'))); child = Number(readFileSync(join(f.root, 'legacy-pid'), 'utf8'));
    a.kill('SIGKILL'); await a.done;
    process.kill(child, 0);
    assert.equal(f.sync().status, 8, 'strategic owner is excluded by the surviving legacy child');
    const again = spawnSync(PYTHON, [SUP], { env, timeout: 10000 });
    assert.equal(again.status, 4, 'a replacement legacy builder is excluded too');
  } finally {
    writeFileSync(join(f.root, 'release'), ''); if (child) { try { process.kill(child, 'SIGTERM'); } catch {} }
    if (a.exitCode === null && a.signalCode === null) a.kill('SIGTERM'); await a.done;
  }
});
