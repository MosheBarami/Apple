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
  assert.deepEqual(P.POLICY_TO_SOURCE.apple_library, ['library']);
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
  assert.deepEqual(P.allowedSources(policy(['apple_library'])), ['library']);
  const both = P.allowedSources(policy(['apple_library', 'creator_store']));
  assert.deepEqual(both.sort(), ['creator_store', 'library']);
  assert.equal(both.includes('procedural'), false, 'from_scratch was not chosen');
});

test('A REFUSAL NAMES THE SETTING AND WHERE TO CHANGE IT', () => {
  // "not allowed" tells a model to give up and a person nothing. The sentence has to say which
  // switch is off and where the switch is, because the reader is an agent that will otherwise
  // report a capability gap that is really a preference.
  const r = P.sourceRefusal(policy(['from_scratch']), 'library');
  assert.ok(r, 'a disallowed source must be refused');
  assert.match(r, /Apple library/i, 'it must name the source in the words the dialog used');
  assert.match(r, /Settings/i, 'and where to change it');
  assert.match(r, /from scratch|parts/i, 'and what IS allowed, so the agent can carry on');
});

test('an allowed source is not refused', () => {
  assert.equal(P.sourceRefusal(policy(['apple_library']), 'library'), null);
  assert.equal(P.sourceRefusal(policy(['creator_store']), 'creator_store'), null);
});

test('with nothing answered, the refusal says so rather than blaming a setting', () => {
  // Never answered and deliberately turned off are different facts, and the fix differs: one
  // person needs to answer a dialog, the other to change their mind.
  const r = P.sourceRefusal(null, 'library');
  assert.match(r, /has not chosen|not been asked|no asset sources/i);
  assert.equal(/turned off|disabled/i.test(r), false, 'nobody turned anything off');
});
