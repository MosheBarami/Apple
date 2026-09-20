// Asset provenance must survive the step boundary.
//
// THE DEFECT: `discoveredAssetIds` lived only on the per-step AgentCtx, which `agentCtx()` rebuilds
// from scratch every step. A model that ran find_verified_asset in step N and insert_asset in step
// N+1 arrived with the set empty, so provenance degraded to `user_supplied` and the transcript said
// an id nobody had searched for had been placed. The intended search-then-insert flow only worked
// when both calls landed in the same 4-call step.
//
// THERE WAS A SECOND SET, `libraryAssetIds`, and it is gone with the curated catalogue it indexed
// (2026-09-20). It mattered more than this one did: membership in it WAIVED three marketplace
// assertions. Its absence is asserted below, because a set that waives assertions coming back
// unnoticed is a security change, not a refactor.
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
  assert.doesNotMatch(SESSION, /libraryAssetIds/,
    'the curated-library id set is back in AgentState, and it is the set that waived marketplace assertions');
});

test('agentCtx hydrates the sets from the run', () => {
  const ctx = SESSION.slice(SESSION.indexOf('private agentCtx('), SESSION.indexOf('emitFrame:'));
  assert.match(ctx, /discoveredAssetIds: new Set\(agent\?\.discoveredAssetIds \?\? \[\]\)/);
  assert.doesNotMatch(ctx, /libraryAssetIds/, 'agentCtx hydrates a waiver set that should no longer exist');
});

test('every agent-run call site passes the run in', () => {
  // A call site that forgets the argument silently reverts to the old behaviour — empty sets, no
  // error, degraded provenance.
  const callSites = [...SESSION.matchAll(/this\.agentCtx\(([^)]*)\)/g)].map((m) => m[1].trim());
  const withRun = callSites.filter((a) => a === 'agent');
  assert.equal(withRun.length, 2, 'both agent-run call sites must pass the run');

  // THE RUN-LESS SITES ARE NAMED, NOT COUNTED. A bare count is a number the next person bumps
  // when their route trips it, which is exactly how a provenance-degrading call site gets waved
  // through. Each single-tool route is listed here with the reason it has no run to accumulate
  // against, and an unlisted one fails.
  const runLess = ["path === '/run-tool'", "path === '/mcp-tool'"];
  const without = callSites.filter((a) => a === '');
  assert.equal(
    without.length,
    runLess.length,
    `a call site builds an AgentCtx with no run and is not one of the ${runLess.length} single-tool routes this test knows about`,
  );
  for (const route of runLess) {
    const at = SESSION.indexOf(route);
    assert.ok(at > 0, `${route} is gone — this test is now guarding a route that does not exist`);
    const block = SESSION.slice(at, at + 1200);
    assert.match(block, /this\.agentCtx\(\)/, `${route} no longer builds the run-less ctx this test accounts for`);
  }
});

test('the MCP route cannot reach a tool that carries provenance', () => {
  // Why the run-less ctx is safe THERE specifically. `/run-tool` is admin-only; `/mcp-tool` is
  // reachable with any customer's API key, so "it has no run to accumulate against" has to be a
  // fact about the tools it can run, not a promise. These four are the ones that read or write the
  // discovered-asset sets — if any of them ever reached the MCP surface, every id would arrive with
  // an empty set and be recorded as `user_supplied`, so the audit trail would say nobody searched
  // for an asset that a search returned.
  const MCP = readFileSync(join(HERE, '..', 'src', 'mcp.ts'), 'utf8');
  const names = [...MCP.matchAll(/\{ tool: '([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(names.length >= 5, 'the mcp.ts tool scrape broke');
  for (const carrier of ['find_verified_asset', 'insert_asset', 'generate_model']) {
    assert.equal(names.includes(carrier), false, `${carrier} is on the MCP surface, where the AgentCtx has no run and provenance is always empty`);
  }
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
  // Membership is a fact about where a number came from. The moment it also decides what is
  // checked, one bad row anywhere upstream becomes an unverified asset in a customer's place.
  assert.match(TOOLS, /Membership records PROVENANCE and nothing else/);
  assert.match(TOOLS, /never whether the gate runs/);
});

test('NOTHING WAIVES A VERIFICATION ASSERTION ANY MORE', () => {
  // `securityBlockers` existed for exactly one caller: the curated-library branch of insert_asset,
  // which waived price, votes and verified-creator because a catalogue asset had none of the three.
  // With the catalogue gone that branch was unreachable, and an unreachable security waiver is
  // worse than a live one — the next reader has to prove from two other files that nothing can
  // ask for it. Both the branch and the helper were deleted; this is what keeps them deleted.
  assert.doesNotMatch(TOOLS, /function securityBlockers\b/,
    'securityBlockers is back, which means some id can again skip an assertion others cannot');
  assert.doesNotMatch(TOOLS, /fromLibrary \? securityBlockers/,
    'the curated-library waiver branch is back in insert_asset');
  assert.doesNotMatch(TOOLS, /waivedForLibraryAsset/,
    'insert_asset reports a waiver again, so it is granting one');
  // CONTROL: insert_asset is still here and still gates, so the three absences above are about the
  // waiver rather than about the whole tool having been renamed out from under this test.
  assert.match(TOOLS, /  insert_asset: \{/, 'insert_asset itself is gone — these assertions prove nothing');
  assert.match(TOOLS, /verifyCreatorStoreAsset\(ctx\.env, assetId/, 'insert_asset no longer verifies at all');
});
