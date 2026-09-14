// Asset provenance must survive the step boundary.
//
// THE DEFECT: `discoveredAssetIds` and `libraryAssetIds` lived only on the per-step AgentCtx, which
// `agentCtx()` rebuilds from scratch every step. A model that ran find_verified_asset in step N and
// insert_asset in step N+1 arrived with both sets empty, so provenance degraded to `user_supplied`
// — which means the curated-library waiver is not applied and the full Creator Store gate (price,
// votes, verified creator) runs against an asset that by construction has none of them. The
// intended search-then-insert flow only worked when both calls landed in the same 4-call step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SESSION = readFileSync(join(HERE, '..', 'src', 'do', 'session.ts'), 'utf8');
const TOOLS = readFileSync(join(HERE, '..', 'src', 'tools.ts'), 'utf8');

test('the run carries provenance, and carries it as JSON-serialisable arrays', () => {
  // AgentState is serialised into DO storage; a Set survives neither JSON.stringify nor an
  // eviction, so storing one here would silently lose the very thing this fixes.
  assert.match(SESSION, /discoveredAssetIds\?: number\[\]/);
  assert.match(SESSION, /libraryAssetIds\?: number\[\]/);
});

test('agentCtx hydrates the sets from the run', () => {
  const ctx = SESSION.slice(SESSION.indexOf('private agentCtx('), SESSION.indexOf('emitFrame:'));
  assert.match(ctx, /discoveredAssetIds: new Set\(agent\?\.discoveredAssetIds \?\? \[\]\)/);
  assert.match(ctx, /libraryAssetIds: new Set\(agent\?\.libraryAssetIds \?\? \[\]\)/);
});

test('every agent-run call site passes the run in', () => {
  // A call site that forgets the argument silently reverts to the old behaviour — empty sets, no
  // error, degraded provenance. The admin /run-tool route is the ONE that legitimately omits it,
  // because a single tool call has no run to accumulate against.
  const callSites = [...SESSION.matchAll(/this\.agentCtx\(([^)]*)\)/g)].map((m) => m[1].trim());
  const withRun = callSites.filter((a) => a === 'agent');
  const without = callSites.filter((a) => a === '');
  assert.equal(withRun.length, 2, 'both agent-run call sites must pass the run');
  assert.equal(without.length, 1, 'only the admin single-tool route may omit it');
});

test('what the tools discovered is written back before the state is persisted', () => {
  // Hydrating without capturing would be a no-op that looks like a fix.
  const loopEnd = SESSION.indexOf('this.captureProvenance(agent, ctx);');
  const persist = SESSION.indexOf('await this.persistAgent(agent);', loopEnd);
  assert.ok(loopEnd !== -1, 'the tool loop must capture provenance');
  assert.ok(persist > loopEnd, 'capture must happen BEFORE the run state is persisted');
});

test('the persisted set is bounded', () => {
  // These ids originate in model-driven searches. Unbounded, a run that searched in a loop would
  // grow DO state without limit.
  const fn = SESSION.slice(SESSION.indexOf('private captureProvenance('), SESSION.indexOf('Persist the run state, shedding'));
  assert.match(fn, /const CAP = \d+;/);
  assert.match(fn, /\.slice\(-CAP\)/, 'the newest ids are the ones the next step is about');
});

test('provenance still only records where an id came from — never that it is permitted', () => {
  // The whole point of the waiver is that it changes which assertions may be WAIVED, never whether
  // the security gate runs. If this comment contract ever goes, the fix above becomes dangerous.
  assert.match(TOOLS, /Membership records PROVENANCE and nothing else/);
  assert.match(TOOLS, /never whether the gate runs/);
});
