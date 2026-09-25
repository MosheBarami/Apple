// Where a build may take its assets from, and who gets to decide.
//
// The owner's rule: before Apple builds, ask whether it may use the curated library, the Creator
// Store, or invent geometry — and let that answer be settled once in settings instead of being
// asked forever. That makes it a preference, so it inherits the layering every other preference
// here has: set it for one project, for yourself, or for a whole organisation.
//
// THE ASSERTION THAT MATTERS IS THE DIRECTION OF THE LAYERING. Most preferences are taste and the
// closest layer wins. This one is not: it decides what gets bought, what gets licensed and what
// gets generated at cost. So it NARROWS — a project may drop a source its organisation allowed and
// may never add one it did not. A test that only checked "the value round-trips" would pass just
// as happily with the arrow pointing the wrong way, which is the failure worth catching.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'assetsrc-')), 'prefs.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'preferences.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const P = await import(`file://${out}`);

const pol = (mode, allow) => ({ mode, allow });

test('new projects use the internal asset pipeline without a customer source prompt', () => {
  const base = P.mergePreferences({}).prefs.asset_sources;
  assert.deepEqual(base, pol('remember', ['creator_store', 'from_scratch']));
  const restricted = P.mergePreferences({ org: { asset_sources: pol('remember', ['from_scratch']) } }).prefs.asset_sources;
  assert.deepEqual(restricted, pol('remember', ['from_scratch']), 'an explicit organisation limit still narrows the product default');
});

test('legacy ask rows do not strand an existing project behind the removed chooser', () => {
  const oldUnanswered = P.mergePreferences({ project: { asset_sources: pol('ask', []) } });
  assert.deepEqual(oldUnanswered.prefs.asset_sources, pol('remember', ['creator_store', 'from_scratch']));
  const oldSubset = P.mergePreferences({ user: { asset_sources: pol('ask', ['creator_store']) } });
  assert.deepEqual(oldSubset.prefs.asset_sources, pol('remember', ['creator_store']));
  const explicitBan = P.mergePreferences({ org: { asset_sources: pol('remember', []) } });
  assert.deepEqual(explicitBan.prefs.asset_sources, pol('remember', []));
});

/* ------------------------------------------------------------------------- the vocabulary --- */

//[[ THERE WERE THREE AND NOW THERE ARE TWO.
//
//   `apple_library` was the first member until 2026-09-20, when the owner removed the catalogue it
//   authorised. `apple_library` is therefore in the REFUSED list below rather than merely absent
//   from the allowed one, and that placement is the assertion: a policy saved while the choice
//   existed must now fail validation outright, so `isAssetSourcePolicy` returns false, the stored
//   preference falls back to `ask` with nothing allowed, and the person is asked again. Quietly
//   dropping the dead member instead would leave `remember` set on an answer they never gave. ]]
test('the two sources are exactly the two that still exist, and nothing else validates', () => {
  assert.deepEqual([...P.ASSET_SOURCE_CHOICES], ['creator_store', 'from_scratch']);
  for (const c of P.ASSET_SOURCE_CHOICES) assert.ok(P.isAssetSourcePolicy(pol('ask', [c])), c);
  for (const bad of ['marketplace', 'toolbox', 'ANY', '', 'apple-library', 'apple_library']) {
    assert.equal(P.isAssetSourcePolicy(pol('ask', [bad])), false, `"${bad}" is not a source`);
  }
  // AND A WHOLE STORED POLICY THAT NAMES IT IS INVALID, not merely narrowed. This is the migration
  // behaviour every account that answered the old dialog will actually take.
  assert.equal(P.isAssetSourcePolicy(pol('remember', ['apple_library', 'creator_store'])), false,
    'a saved policy still naming the removed catalogue must be refused, so the person is asked again');
});

test('a malformed policy is refused rather than repaired', () => {
  for (const bad of [
    null, undefined, 'ask', 42, [],
    { mode: 'ask' },                                   // no list at all
    { allow: ['creator_store'] },                      // no mode
    { mode: 'sometimes', allow: [] },                  // not a mode
    { mode: 'ask', allow: 'creator_store' },           // a string is not a list
    { mode: 'ask', allow: ['creator_store', 'creator_store'] }, // a duplicate is a client bug
  ]) {
    assert.equal(P.isAssetSourcePolicy(bad), false, JSON.stringify(bad));
  }
});

test('the product default uses sources internally and never grants an upload key', () => {
  assert.equal(P.ASSET_SOURCE_DEFAULT.mode, 'remember');
  assert.deepEqual(P.ASSET_SOURCE_DEFAULT.allow, ['creator_store', 'from_scratch']);
  assert.deepEqual(P.narrowAssetSources(undefined, undefined), P.ASSET_SOURCE_DEFAULT);
});

/* ---------------------------------------------------------------------------- normalising --- */

test('the preference survives a round trip through normalisePreferences', () => {
  const { prefs, rejected } = P.normalisePreferences({ asset_sources: pol('remember', ['creator_store', 'from_scratch']) });
  assert.deepEqual(rejected, []);
  assert.deepEqual(prefs.asset_sources, pol('remember', ['creator_store', 'from_scratch']));
});

test('and a bad one is REPORTED, not dropped in silence', () => {
  // The settings page shows rejections. A preference that vanished without a word would leave a
  // person looking at a control they set and a build that ignores it.
  const { prefs, rejected } = P.normalisePreferences({ asset_sources: { mode: 'ask', allow: ['toolbox'] } });
  assert.equal(prefs.asset_sources, undefined);
  assert.deepEqual(rejected, [{ key: 'asset_sources', reason: 'bad_value' }]);
});

/* ------------------------------------------------------------------------------ narrowing --- */

test('NARROWING: a project may drop a source the organisation allowed', () => {
  const merged = P.mergePreferences({
    org: { asset_sources: pol('remember', ['creator_store', 'from_scratch']) },
    project: { asset_sources: pol('remember', ['creator_store']) },
  });
  assert.deepEqual(merged.prefs.asset_sources.allow, ['creator_store']);
});

test('AND MAY NEVER ADD ONE IT DID NOT — this is the whole point of the direction', () => {
  // Reverse the arrow and this is the assertion that goes red: last-layer-wins would hand the
  // project `creator_store`, which is a spending decision the organisation declined.
  const merged = P.mergePreferences({
    org: { asset_sources: pol('remember', ['creator_store']) },
    project: { asset_sources: pol('remember', ['creator_store', 'from_scratch']) },
  });
  assert.deepEqual(merged.prefs.asset_sources.allow, ['creator_store']);
  assert.ok(!merged.prefs.asset_sources.allow.includes('from_scratch'));
});

test('an organisation that allows nothing leaves nothing for any layer below it', () => {
  const merged = P.mergePreferences({
    org: { asset_sources: pol('remember', []) },
    user: { asset_sources: pol('remember', ['creator_store', 'from_scratch']) },
    project: { asset_sources: pol('remember', ['from_scratch']) },
  });
  assert.deepEqual(merged.prefs.asset_sources.allow, []);
});

test('a legacy ask restriction still narrows sources without showing a chooser', () => {
  const merged = P.mergePreferences({
    org: { asset_sources: pol('ask', ['creator_store']) },
    user: { asset_sources: pol('remember', ['creator_store']) },
  });
  assert.deepEqual(merged.prefs.asset_sources, pol('remember', ['creator_store']));
});

test('remember only survives when every layer that spoke said remember', () => {
  const merged = P.mergePreferences({
    org: { asset_sources: pol('remember', ['creator_store', 'from_scratch']) },
    user: { asset_sources: pol('remember', ['creator_store']) },
  });
  assert.equal(merged.prefs.asset_sources.mode, 'remember');
  assert.deepEqual(merged.prefs.asset_sources.allow, ['creator_store']);
});

test('the panel is told WHICH layer decided, so it can say so instead of showing a dead control', () => {
  // The same reason memory_mode records its source: a control that silently does nothing because
  // a layer above already refused is worse than one that explains itself.
  const merged = P.mergePreferences({
    org: { asset_sources: pol('remember', []) },
    project: { asset_sources: pol('remember', ['from_scratch']) },
  });
  assert.equal(merged.sources.asset_sources, 'org', 'the org is what actually decided here');
});

test('a single layer passes through unchanged, so narrowing costs nothing when nobody disagrees', () => {
  const only = pol('remember', ['creator_store', 'from_scratch']);
  assert.deepEqual(P.mergePreferences({ user: { asset_sources: only } }).prefs.asset_sources, only);
});

test('and a layer that never set it does not overwrite one that did', () => {
  const merged = P.mergePreferences({
    user: { asset_sources: pol('remember', ['creator_store']) },
    project: { coding_style: 'minimal' },
  });
  assert.deepEqual(merged.prefs.asset_sources, pol('remember', ['creator_store']));
  assert.equal(merged.sources.asset_sources, 'user');
});
