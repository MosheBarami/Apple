// Which asset sources a build may actually use.
//
// The dialog collects an answer. Until something READS it, the answer is a row in a table and the
// build does whatever it would have done anyway — which is the exact shape of failure this
// repository keeps naming: a control that appears to work and governs nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'assetpolicy-')), 'p.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'asset-policy.ts'), '--bundle', '--format=esm', '--target=es2022',
   '--platform=neutral', '--main-fields=main,module', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const P = await import(`file://${out}`);

const policy = (allow) => ({ mode: 'remember', allow });

test('each choice maps to the engine sources it actually authorises', () => {
  assert.deepEqual(P.POLICY_TO_SOURCE.creator_store, ['creator_store']);
  // `from_scratch` covers three engine sources, and the reason is worth stating: building out of
  // parts, generating geometry in the customer's own session, and using Studio's own built-ins are
  // all "nothing came from anywhere else" to the person who ticked the box.
  assert.deepEqual(P.POLICY_TO_SOURCE.from_scratch, ['procedural', 'generation_service', 'terrain', 'builtin']);
});

test('NO POLICY ALLOWS NOTHING — never everything', () => {
  // The dangerous default. An absent policy means nobody has answered, and answering for them by
  // allowing every source is how 510,979 third-party assets end up in a game whose owner was
  // never asked.
  assert.deepEqual(P.allowedSources(null), []);
  assert.deepEqual(P.allowedSources(undefined), []);
  assert.deepEqual(P.allowedSources(policy([])), []);
});

test('an allowed choice yields its sources, and nothing else', () => {
  assert.deepEqual(P.allowedSources(policy(['creator_store'])), ['creator_store']);
  const both = P.allowedSources(policy(['creator_store', 'from_scratch']));
  assert.deepEqual(both.sort(), ['builtin', 'creator_store', 'generation_service', 'procedural', 'terrain']);
});

//[[ THE ASSET LIBRARY WAS REMOVED ON 2026-09-20, AND THIS IS WHERE IT STAYS REMOVED.
//
//   The owner's reason was not that the catalogue was slow or small. Every upload it could make was
//   an Image or a Decal, Roblox refuses to archive either, so each one was permanent in somebody's
//   real account — and it also held rows named after other companies' properties under one blanket
//   licence claim. Putting the choice back would put that back.
//
//   It is tested HERE, in the policy, rather than only by the absence of a tool, because the
//   dialog's vocabulary is where it would come back first: a box that reads "the Apple library"
//   and unlocks an engine source is the whole feature, and everything else follows from it. ]]
test('NEITHER THE LIBRARY ENGINE SOURCE NOR THE DIALOG CHOICE THAT UNLOCKED IT EXISTS', () => {
  assert.equal(P.ASSET_SOURCES.includes('library'), false,
    'the `library` engine source is back in ./assets — the catalogue it named was deleted');
  assert.equal(Object.prototype.hasOwnProperty.call(P.SOURCE_CHOICE, 'library'), false,
    'SOURCE_CHOICE still classifies `library`, which means something can still authorise it');
  assert.equal(Object.prototype.hasOwnProperty.call(P.POLICY_TO_SOURCE, 'apple_library'), false,
    'the `apple_library` dialog choice is back — a box that unlocks a catalogue that does not exist');
  // And a stored policy that still names it must not quietly grant anything. `allowedSources`
  // ignores an unknown choice, which is the safe direction: nothing, rather than everything.
  assert.deepEqual(P.allowedSources(policy(['apple_library'])), [],
    'a saved `apple_library` must unlock no engine source at all');
  // PROVENANCE, THE OTHER HALF. `library` was also a provenance kind, and it was the one that
  // waived three marketplace assertions in insert_asset. It must not be classifiable either.
  assert.equal(Object.prototype.hasOwnProperty.call(P.PROVENANCE_SOURCE, 'library'), false,
    'the `library` provenance kind is back, and with it the waiver it used to authorise');
});

test('A REFUSAL NAMES THE SETTING AND WHERE TO CHANGE IT', () => {
  // "not allowed" tells a model to give up and a person nothing. The sentence has to say which
  // switch is off and where the switch is, because the reader is an agent that will otherwise
  // report a capability gap that is really a preference.
  const r = P.sourceRefusal(policy(['from_scratch']), 'creator_store');
  assert.ok(r, 'a disallowed source must be refused');
  assert.match(r, /Creator Store/i, 'it must name the source in the words the dialog used');
  assert.match(r, /Settings/i, 'and where to change it');
  assert.match(r, /from scratch|parts/i, 'and what IS allowed, so the agent can carry on');
});

test('an allowed source is not refused', () => {
  assert.equal(P.sourceRefusal(policy(['creator_store']), 'creator_store'), null);
  assert.equal(P.sourceRefusal(policy(['from_scratch']), 'procedural'), null);
});

test('with nothing answered, the refusal says so rather than blaming a setting', () => {
  // Never answered and deliberately turned off are different facts, and the fix differs: one
  // person needs to answer a dialog, the other to change their mind.
  const r = P.sourceRefusal(null, 'creator_store');
  assert.match(r, /has not chosen|not been asked|no asset sources/i);
  assert.equal(/turned off|disabled/i.test(r), false, 'nobody turned anything off');
});

test('SOURCE_CHOICE classifies every engine source, and POLICY_TO_SOURCE agrees with it both ways', () => {
  // POLICY_TO_SOURCE is derived from SOURCE_CHOICE, so the two cannot disagree by construction —
  // but that guarantee is only as good as the derivation staying correct, and a type annotation
  // nobody exercises is exactly the kind of silent failure this policy exists to rule out. This
  // test walks the REAL engine-source list from ./assets (re-exported here as P.ASSET_SOURCES,
  // not a copy that could go stale), so a source added there without a SOURCE_CHOICE entry is
  // caught here even before the typecheck would catch it.
  assert.ok(P.ASSET_SOURCES.length > 0, 'the source list itself must not be empty');

  for (const source of P.ASSET_SOURCES) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(P.SOURCE_CHOICE, source),
      `${source} has no entry in SOURCE_CHOICE — it would be silently unauthorisable`,
    );
    const choice = P.SOURCE_CHOICE[source];
    assert.equal(P.choiceFor(source), choice, `choiceFor(${source}) disagrees with SOURCE_CHOICE`);

    if (choice === null) {
      for (const c of Object.keys(P.POLICY_TO_SOURCE)) {
        assert.equal(
          P.POLICY_TO_SOURCE[c].includes(source), false,
          `${source} is marked ungoverned in SOURCE_CHOICE but POLICY_TO_SOURCE.${c} still lists it`,
        );
      }
    } else {
      assert.ok(
        P.POLICY_TO_SOURCE[choice].includes(source),
        `SOURCE_CHOICE says ${source} belongs to ${choice}, but POLICY_TO_SOURCE.${choice} does not list it`,
      );
    }
  }

  // And the reverse direction: nothing in POLICY_TO_SOURCE claims a source that SOURCE_CHOICE
  // does not also credit to it.
  for (const [choice, sources] of Object.entries(P.POLICY_TO_SOURCE)) {
    for (const source of sources) {
      assert.equal(
        P.SOURCE_CHOICE[source], choice,
        `POLICY_TO_SOURCE.${choice} lists ${source}, but SOURCE_CHOICE credits it to a different choice`,
      );
    }
  }
});
