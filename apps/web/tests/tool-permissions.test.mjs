/**
 * THE SETTING THE WORKER ENFORCES AND NOTHING COULD SET.
 *
 * `tool_permissions` is real all the way down on the server: `normalisePreferences` validates it
 * against the live tool registry (preferences.ts), it INTERSECTS towards the most restrictive
 * value across org/user/project rather than overriding, and `applyToolPermissions` narrows the
 * mode's toolset on every single step of every run — pinned by preferences.test.mjs.
 *
 * `grep -rn tool_permissions apps/web/src` returned exactly one line: the TYPE in api.ts. No
 * control anywhere. A user could not withhold `run_luau` from an agent working in their game.
 * The enforcement existed; the decision it enforces could not be made.
 *
 * WHAT THIS FILE PINS, and each one is a way the control could be worse than absent:
 *
 *   1. Every tool it offers EXISTS. The server rejects an unknown name with `unknown_tool`, so a
 *      typo here is a checkbox that silently saves nothing. The list is checked against the
 *      worker's own TOOLS registry, parsed out of the source.
 *   2. It offers nothing READ-ONLY. Blocking `read_script` buys no safety and breaks the agent;
 *      the read-only set is exactly Plan mode's toolset, and nothing in it may appear here.
 *   3. It writes 'deny' and never 'allow'. `allow` is not a capability — applyToolPermissions
 *      only ever REMOVES — so an "allow" entry would be a stored setting that grants nothing
 *      while reading like permission. And it never writes 'ask', because nothing in this product
 *      can interrupt a run to ask: preferences.ts collapses 'ask' to a refusal, so an Ask option
 *      would be a control promising a confirmation that never comes.
 *   4. Clearing the last block REMOVES the key rather than storing an empty object, because the
 *      server treats an empty map as "not set" and a caller that kept one would disagree with it.
 *
 * Run with:  node --test           (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  GOVERNABLE_TOOLS,
  blockedTools,
  withToolBlocked,
} from '../src/components/ws/tool-permissions.ts';
import { GOVERNED_TOOL_NAMES } from '@golem/shared';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const workerTools = read('../../worker/src/tools.ts');
const workerRouter = read('../../worker/src/router.ts');
const workerPrefs = read('../../worker/src/preferences.ts');

/** The keys of `export const TOOLS`, by brace-matching — the same parse tool-vocabulary uses. */
function registeredTools() {
  const start = workerTools.indexOf('{', workerTools.indexOf('export const TOOLS'));
  let depth = 0;
  let end = start;
  for (let i = start; i < workerTools.length; i += 1) {
    if (workerTools[i] === '{') depth += 1;
    else if (workerTools[i] === '}') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  return [...workerTools.slice(start, end).matchAll(/^ {2}([a-z_][a-z0-9_]*):\s*\{/gm)].map((m) => m[1]);
}

/** Plan mode's toolset: the tools that cannot change a project. */
function planTools() {
  const decl = workerRouter.slice(workerRouter.indexOf('const PLAN_TOOLS = ['));
  return [...decl.slice(0, decl.indexOf(']')).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

test('CONTROL: the worker sources really parsed, so nothing below is vacuous', () => {
  assert.ok(registeredTools().length >= 20, `parsed ${registeredTools().length} tools`);
  assert.ok(planTools().length >= 4, 'PLAN_TOOLS did not parse');
  assert.ok(GOVERNABLE_TOOLS.length > 0, 'the control offers nothing at all');
});

test('EVERY TOOL OFFERED EXISTS — a typo here is a checkbox that saves nothing', () => {
  const real = new Set(registeredTools());
  const phantom = GOVERNABLE_TOOLS.filter((t) => !real.has(t.tool)).map((t) => t.tool);
  assert.deepEqual(phantom, [], `the server would reject these as unknown_tool: ${phantom.join(', ')}`);
});

test('nothing read-only is offered, because blocking it buys nothing and breaks the agent', () => {
  const readOnly = new Set(planTools());
  const pointless = GOVERNABLE_TOOLS.filter((t) => readOnly.has(t.tool)).map((t) => t.tool);
  assert.deepEqual(pointless, [], `these cannot change anything, so blocking them is only damage: ${pointless.join(', ')}`);
});

test('the panel renders the shared governed-tool vocabulary exactly', () => {
  // Mutation truth now lives beside each ToolImpl in worker/tools.ts and the worker test proves
  // every mutation-capable tool appears in GOVERNED_TOOL_NAMES. This web-side assertion checks the
  // second half of that contract: the panel must render that one shared vocabulary without losing
  // or inventing a name of its own.
  assert.deepEqual(
    GOVERNABLE_TOOLS.map((tool) => tool.tool),
    [...GOVERNED_TOOL_NAMES],
  );
});

test('the list fits the server\'s entry cap', () => {
  const cap = Number(/TOOL_PERMISSION_ENTRIES_MAX = (\d+)/.exec(workerPrefs)?.[1]);
  assert.ok(Number.isFinite(cap), 'the cap could not be read from the worker');
  assert.ok(GOVERNABLE_TOOLS.length <= cap, `${GOVERNABLE_TOOLS.length} entries against a cap of ${cap}`);
});

test('every offered tool says WHY someone would withhold it', () => {
  for (const t of GOVERNABLE_TOOLS) {
    assert.ok(t.label && t.label.length > 3, `${t.tool} has no label`);
    assert.ok(t.why && t.why.length > 10, `${t.tool} gives the user no reason to decide`);
  }
});

/* -------------------------------------------------------------------- the toggle --- */

test('BLOCKING WRITES deny, never allow and never ask', () => {
  const out = withToolBlocked(undefined, 'run_luau', true);
  assert.deepEqual(out, { run_luau: 'deny' });
  for (const v of Object.values(out)) assert.equal(v, 'deny');
});

test('unblocking removes the key rather than storing an allow', () => {
  // An `allow` entry grants nothing — applyToolPermissions only ever removes — so storing one
  // would be a setting that reads like permission and confers none.
  const blocked = withToolBlocked({ run_luau: 'deny', delete_instances: 'deny' }, 'run_luau', false);
  assert.deepEqual(blocked, { delete_instances: 'deny' });
});

test('clearing the LAST block yields undefined, not an empty object', () => {
  // The server treats an empty map as "not set" and deletes the row. A client holding {} would
  // disagree with what was stored.
  assert.equal(withToolBlocked({ run_luau: 'deny' }, 'run_luau', false), undefined);
  assert.equal(withToolBlocked(undefined, 'run_luau', false), undefined);
});

test('an ask stored by something else still reads as blocked, because that is what it does', () => {
  // preferences.ts collapses 'ask' to a refusal. A checkbox that drew it as unblocked would be
  // telling the user the tool is available when the worker has already removed it.
  assert.deepEqual(blockedTools({ run_luau: 'ask' }), new Set(['run_luau']));
  assert.deepEqual(blockedTools({ run_luau: 'deny' }), new Set(['run_luau']));
  assert.deepEqual(blockedTools({ run_luau: 'allow' }), new Set());
  assert.deepEqual(blockedTools(undefined), new Set());
});

/* -------------------------------------------------------------------- the wiring --- */

test('the panel actually renders the control', () => {
  // The whole point of the item: the enforcement existed and nothing could reach it. A module
  // with no caller would leave it exactly as it was.
  const panel = read('../src/components/ws/instructions-panel.tsx');
  assert.match(panel, /GOVERNABLE_TOOLS/, 'the instructions panel never offers the tool permissions');
  assert.match(panel, /withToolBlocked/, 'the panel renders the list but cannot change it');
  assert.match(panel, /tool_permissions/, 'nothing is saved under the key the worker reads');
});
