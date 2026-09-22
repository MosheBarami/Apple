/**
 * THE PANEL'S LIST OF TOOLS IS THE WORKER'S LIST OF TOOLS.
 *
 * `normalisePreferences` refuses a tool permission whose name is not in the real registry — the
 * right behaviour, and the one that turns a drifted UI list into a silent failure rather than a
 * loud one: the switch flicks, the save returns 200, the rejection is reported as a key nobody
 * recognises, and the tool stays allowed. So the settings panel may not hold its own opinion about
 * what tools exist. GOVERNED_TOOLS lives in @golem/shared and this file is what keeps it true.
 *
 * The second claim is the one that makes the control worth rendering at all: a permission the
 * panel can set has to survive all the way to the toolset the model is offered. That is asserted
 * against `toolsForMode` + `applyToolPermissions` — the same pair session.ts uses — rather than
 * against the merged preferences object, because a permission that merges correctly and never
 * reaches the toolset is a setting that does nothing.
 *
 * Run with:  node --test tests/tool-permissions.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(WORKER, '../..');
const DIR = mkdtempSync(join(tmpdir(), 'toolperm-'));

function bundle(rel, name) {
  const out = join(DIR, `${name}.mjs`);
  execFileSync(
    join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [join(WORKER, 'src', rel), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
    { cwd: WORKER, stdio: 'pipe' },
  );
  return out;
}

const T = await import(`file://${bundle('tools.ts', 'tools')}`);
const P = await import(`file://${bundle('preferences.ts', 'preferences')}`);
const R = await import(`file://${bundle('router.ts', 'router')}`);
const A = await import(`file://${bundle('analytics.ts', 'analytics')}`);
const S = await import(`file://${join(ROOT, 'packages/shared/src/index.ts')}`);

const SESSION = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
const SHARED = readFileSync(join(ROOT, 'packages', 'shared', 'src', 'index.ts'), 'utf8');

test('every tool the settings panel can govern is a tool the registry has', () => {
  const real = new Set(T.toolNames());
  for (const g of S.GOVERNED_TOOLS) {
    assert.ok(real.has(g.name), `GOVERNED_TOOLS names "${g.name}", which is not in TOOLS`);
  }
  assert.ok(S.GOVERNED_TOOLS.length >= 10, 'suspiciously few tools are governable');
});

test('every tool that can mutate the Roblox place is governable', () => {
  const governed = new Set(S.GOVERNED_TOOL_NAMES);
  const missing = T.projectMutatingToolNames().filter((name) => !governed.has(name)).sort();
  assert.deepEqual(
    missing,
    [],
    `project-mutating tools are missing from the user's tool-permission surface: ${missing.join(', ')}`,
  );
});

test('and the worker would ACCEPT every one of them — not just recognise the string', () => {
  // The end-to-end version of the claim above. normalisePreferences is what the PUT route runs;
  // a name that survives `toolNames()` and is still rejected here would be refused on save.
  const perms = Object.fromEntries(S.GOVERNED_TOOLS.map((g) => [g.name, 'deny']));
  const out = P.normalisePreferences({ tool_permissions: perms }, { knownToolNames: T.toolNames() });
  assert.deepEqual(out.rejected, [], 'the server refused a permission the panel can set');
  assert.equal(Object.keys(out.prefs.tool_permissions).length, S.GOVERNED_TOOLS.length);
});

test('the vocabulary is ONE literal, not two that agree today', () => {
  // preferences.ts used to hold its own copy of ['allow','ask','deny']. Two lists agreeing is not
  // the same as one list: the failure only appears when somebody changes one of them.
  //
  // Asserted against the SOURCE, not by comparing the two imported arrays by identity. Each module
  // here is bundled separately, so esbuild inlines its own copy of everything — two references
  // that ARE one literal in the tree come back as two objects, and an identity check would fail
  // against correct code and pass against nothing. Reading the file is the only measurement that
  // sees the thing being claimed.
  const src = readFileSync(join(WORKER, 'src', 'preferences.ts'), 'utf8');
  assert.match(src, /import \{[^}]*TOOL_PERMISSIONS[^}]*\} from '@golem\/shared'/s, 'preferences.ts does not take the vocabulary from @golem/shared');
  assert.doesNotMatch(src, /\[\s*'allow',\s*'ask',\s*'deny'\s*\]/, 'preferences.ts still holds its own copy of the list');
  assert.deepEqual([...P.TOOL_PERMISSIONS], [...S.TOOL_PERMISSIONS]);
});

test('strictness ordering is shared too, so the browser and the worker cannot disagree', () => {
  // The browser disables the options looser than the floor using toolPermissionRank; the worker
  // merges layers using mostRestrictive. If those two orderings ever diverged, the panel would
  // offer a choice the server then discards.
  for (const a of S.TOOL_PERMISSIONS) {
    for (const b of S.TOOL_PERMISSIONS) {
      const byRank = S.toolPermissionRank(a) >= S.toolPermissionRank(b) ? a : b;
      assert.equal(P.mostRestrictive(a, b), byRank, `${a} vs ${b}`);
    }
  }
});

test('DENYING A GOVERNED TOOL ACTUALLY REMOVES IT FROM THE RUN', () => {
  // The claim that makes the panel worth building. Asserted against the toolset the run loop
  // assembles, not against the merged preferences: a permission that merges and never narrows is
  // a control that moves.
  const base = R.toolsForMode('agent', true, T.toolNames());
  // Not vacuous: Agent is the builder and has every tool, so every governed name must
  // actually be in the set being narrowed. An earlier draft of this test named a mode that does
  // not exist ('agent'), fell through to the read-only default, and skipped ten of the twelve
  // while reporting green.
  for (const g of S.GOVERNED_TOOLS) {
    assert.ok(base.has(g.name), `${g.name} is not in the builder toolset — this assertion measures nothing`);
    const narrowed = P.applyToolPermissions(base, { [g.name]: 'deny' });
    assert.equal(narrowed.has(g.name), false, `${g.name} survived its own denial`);
    assert.equal(narrowed.size, base.size - 1, `${g.name}: denying it took something else too`);
  }
});

test('Autonomous Agent bypasses user tool-preference narrowing for that run only', () => {
  const base = R.toolsForMode('agent', true, T.toolNames());
  const denied = { run_luau: 'deny', delete_instances: 'deny' };
  const normal = P.applyToolPermissions(base, denied);
  assert.equal(normal.has('run_luau'), false, 'normal Agent must still honour the stored preference');
  assert.equal(base.has('run_luau'), true, 'the full Agent toolset must contain run_luau');
  assert.match(
    SESSION,
    /agent\.mode === 'agent' && agent\.autonomous\s*\?\s*base\s*:\s*applyToolPermissions\(base, agent\.toolPermissions\)/,
    'SessionDO is not using the full Agent toolset when the per-message Autonomous flag is on',
  );
});

test('and denying one leaves the read-only tools alone', () => {
  const base = R.toolsForMode('agent', true, T.toolNames());
  const narrowed = P.applyToolPermissions(base, { delete_instances: 'deny' });
  for (const readOnly of ['read_script', 'get_project_tree', 'search_scripts']) {
    if (base.has(readOnly)) assert.equal(narrowed.has(readOnly), true, readOnly);
  }
});

/* ------------------------------------------- the narrowing has to leave a record --- */

test('WHAT WAS TAKEN AWAY IS NAMEABLE, not just absent', () => {
  // "Why did Apple not use run_luau on that run" had no answer anywhere: the tool was removed from
  // the set and nothing was logged, broadcast, or told to anyone. A capability that is silently
  // not there is indistinguishable, from inside, from a product that is broken.
  const base = R.toolsForMode('agent', true, T.toolNames());
  assert.deepEqual(P.deniedTools(base, { run_luau: 'deny', delete_instances: 'ask' }).sort(), ['delete_instances', 'run_luau']);
  assert.deepEqual(P.deniedTools(base, { run_luau: 'allow' }), [], 'allow removes nothing');
  assert.deepEqual(P.deniedTools(base, undefined), []);
  assert.deepEqual(P.deniedTools(base, {}), []);
});

test('and it names only what was ACTUALLY there to take', () => {
  // A permission naming a tool this mode never had changes nothing, so reporting it would tell the
  // user a capability was withheld when it was never offered. Plan mode is the case: denying
  // delete_instances there is a no-op, and announcing it invents a restriction.
  const plan = R.toolsForMode('plan', true, T.toolNames());
  assert.equal(plan.has('delete_instances'), false, 'Plan is supposed to be the read-only mode');
  assert.deepEqual(P.deniedTools(plan, { delete_instances: 'deny', run_luau: 'deny' }), [],
    'reported a restriction on tools Plan never had');
  const base = R.toolsForMode('agent', true, T.toolNames());
  const perms = { run_luau: 'deny', not_a_tool_at_all: 'deny' };
  assert.deepEqual(P.deniedTools(base, perms), ['run_luau']);
  assert.equal(P.applyToolPermissions(base, perms).size, base.size - 1);
});

test('the run loop records it, broadcasts it, and replays it', () => {
  // Three separate ways to leave this half-built: compute and never send, send and never persist
  // (so a refresh loses it), or send with no audit line behind it.
  assert.match(SESSION, /deniedTools\(/, 'the run loop never computes what was removed');
  assert.match(SESSION, /type: 'tools_denied'/, 'nothing is broadcast');
  assert.match(SESSION, /action: 'tool_denied'/, 'no audit event is recorded');
  assert.match(SESSION, /deniedTools:/, 'the snapshot does not replay it, so a refresh loses it');
  assert.match(SHARED, /type: 'tools_denied'/, 'the wire has no such message');
});

test('the audit event the analytics module accepts is the one the loop sends', () => {
  // `allowed` defaults to FALSE on an unreadable value in analytics.ts, deliberately — a record of
  // a permission decision nobody can confirm was permitted must not be filed as permitted.
  const res = A.recordEvent({ kind: 'audit', action: 'tool_denied', actorKind: 'user', subject: 'run_luau', allowed: false });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.event.action, 'tool_denied');
  assert.equal(res.event.allowed, false);
  assert.equal(res.event.subject, 'run_luau');
});
