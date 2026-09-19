// The policy is READ, not merely stored.
//
// A preference nothing consults is the most convincing kind of broken feature: the dialog appears,
// the row is written, the settings page renders the answer back, and the build ignores all of it.
// These assertions are on the SOURCE, because what matters is that the call site exists at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const tools = readFileSync(join(WORKER, 'src', 'tools.ts'), 'utf8');
const session = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');

/** One top-level tool registry entry, ending at its own two-space-indented closing brace. */
function toolEntry(src, name) {
  const start = src.indexOf(`  ${name}: {`);
  assert.notEqual(start, -1, `${name} registry entry moved or was renamed`);
  const end = src.indexOf('\n  },\n', start);
  assert.notEqual(end, -1, `${name} registry entry has no top-level terminator`);
  return src.slice(start, end + '\n  },'.length);
}

function assertChooseAssetPolicyWiring(body) {
  assert.match(body, /run: async \(ctx, a\) => \{/, 'choose_asset_source must keep the caller context');
  const policy = body.indexOf('allowedSources(ctx.assetSources)');
  const filter = body.indexOf('chosen.filter((c) => allowed.includes(c.source))');
  assert.ok(policy !== -1, 'choose_asset_source must read the caller asset-source policy');
  assert.ok(filter !== -1, 'choose_asset_source must filter recommendations through the allowed set');
  assert.ok(policy < filter, 'policy must be resolved before recommendations are filtered');
  assert.match(body, /sourceRefusal\(ctx\.assetSources,/, 'the refusal must describe the same caller policy');
}

test('AgentCtx carries the policy, so a tool reads a value rather than querying per call', () => {
  const iface = tools.slice(tools.indexOf('export interface AgentCtx'), tools.indexOf('}', tools.indexOf('export interface AgentCtx')));
  assert.match(iface, /assetSources\?: AssetSourcePolicy/);
});

test('choose_asset_source NARROWS its list to what the policy allows', () => {
  const body = toolEntry(tools, 'choose_asset_source');
  assertChooseAssetPolicyWiring(body);

  // Falsification: replacing the caller's policy with an unscoped/default input must make this
  // guard fail even though the rest of the tool entry (including unrelated registry tools) is intact.
  const weakened = body.replace('allowedSources(ctx.assetSources)', 'allowedSources(undefined)');
  assert.notEqual(weakened, body, 'CONTROL: the synthetic policy bypass must actually be planted');
  assert.throws(
    () => assertChooseAssetPolicyWiring(weakened),
    /caller asset-source policy/,
    'the guard must fail when choose_asset_source stops consulting the caller policy',
  );
});

test('SEARCHING A FORBIDDEN LIBRARY IS REFUSED BEFORE THE QUERY RUNS', () => {
  // Searching and then filtering would still spend a D1 query, and worse, would let an empty
  // result read as "the library has nothing like that" — a claim about a table the caller was
  // never allowed to look in.
  const start = tools.indexOf('  search_asset_library: {');
  const end = tools.indexOf('  find_verified_asset: {');
  // A failure to find either marker must not silently become "start to end of file" — that would
  // let this test read as passing (or failing for the wrong reason) while actually observing
  // nothing. A guard that cannot see the thing it guards must say so loudly.
  assert.notEqual(start, -1, 'search_asset_library marker moved or was renamed');
  assert.notEqual(end, -1, 'find_verified_asset marker moved or was renamed');
  const body = tools.slice(start, end);
  const refusal = body.indexOf('sourceRefusal(');
  const search = body.indexOf('searchAssetLibrary(');
  assert.ok(refusal !== -1, 'it must consult the policy');
  assert.ok(refusal < search, 'and refuse BEFORE querying');
});

test('the session hands the policy to every step, not to the first one', () => {
  // agentCtx() is rebuilt every step. A policy resolved once into a local would be present on step
  // one and undefined on step two, which is the same bug discoveredAssetIds already had here.
  assert.match(session, /assetSources/, 'the DO must supply it');
  const ctxFn = session.slice(session.indexOf('private agentCtx('), session.indexOf('private agentCtx(') + 1800);
  assert.match(ctxFn, /assetSources/, 'and it must be inside agentCtx(), which every step rebuilds');
});
