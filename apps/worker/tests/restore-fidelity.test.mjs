// A restore must report what it actually put back.
//
// THE DEFECT: restoreCheckpoint returned a bare `{ ok: true }` and discarded the plugin's fidelity
// report entirely. The serializer computes instancesCreated, scriptsRestored against
// scriptsExpected, and counts of instances, scripts and properties that could not be written — and
// none of it reached the user. So a restore that recreated every instance with the wrong Size,
// CFrame and Material reported plain success and the user had no reason to look.
//
// That is a green check over a failed build, on the one path whose entire purpose is getting a
// user's work back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SESSION = readFileSync(join(HERE, '..', 'src', 'do', 'session.ts'), 'utf8');
const SERIALIZER = readFileSync(join(HERE, '..', '..', 'plugin', 'src', 'Serializer.luau'), 'utf8');
// The body starts AFTER the return-type annotation, and that boundary is the whole point.
// The annotation NAMES every fidelity field, so a slice that includes it lets a `instancesCreated:`
// match land on the type that PROMISES the count rather than on the code that supplies it. Found by
// falsification: replacing the entire `const fidelity = {...}` with `undefined as any` left the
// "counts travel with the result" test green, because the signature above it still said they would.
const SIG = SESSION.indexOf('async restoreCheckpoint(');
const body = SESSION.slice(SESSION.indexOf('}> {', SIG), SESSION.indexOf('private async quotaSpend('));

test('the plugin still computes a fidelity report worth surfacing', () => {
  // If the plugin stops reporting these, the worker's handling below is dead code and this test
  // is the thing that says so.
  for (const field of ['instancesCreated', 'scriptsRestored', 'scriptsExpected', 'failedInstances', 'failedScripts', 'failedProperties']) {
    assert.match(SERIALIZER, new RegExp(`${field}\\s*=`), `Serializer.luau must still report ${field}`);
  }
  assert.match(SERIALIZER, /restored = failedInstances == 0 and failedScripts == 0/);
});

test('ok reflects the plugin verdict, not merely that the op was delivered', () => {
  assert.match(body, /if \(!d\.restored\)/, 'a plugin-reported incomplete restore must not return ok');
  // Asserted as a BRANCH rather than as one exact return statement. The property under test is
  // "refuses, names the plugin's own reason or a default, and still says how far it got"; pinning
  // the literal spelling made this fail the moment the reason was lifted into a variable so the
  // same sentence could also be broadcast to the browser — a test failing over punctuation while
  // the behaviour it guards was intact.
  const at = body.indexOf('if (!d.restored)');
  const branch = body.slice(at, at + 400);
  assert.match(branch, /d\.error \?\? 'restore incomplete'/, "the plugin's own reason, or a default — never an empty error");
  assert.match(branch, /ok: false/);
  assert.match(branch, /fidelity/, 'a refusal must still carry the counts, so the UI can say how far it got');
  // The bare success that hid everything must be gone.
  assert.equal(/return \{ ok: true \};\s*\n\s*\}/.test(body), false, 'the bare `{ ok: true }` must be gone');
});

test('the counts travel with the result so the UI can say what came back', () => {
  for (const field of ['instancesCreated', 'scriptsRestored', 'scriptsExpected', 'failedInstances', 'failedScripts', 'failedProperties']) {
    assert.match(body, new RegExp(`${field}:`), `fidelity must carry ${field}`);
  }
});

test('failed property writes are reported even though the restore succeeded', () => {
  // Every instance and script can come back while properties still fail, and a part with the wrong
  // Size and CFrame is not the part the user checkpointed. Success WITH a caveat, not silence.
  assert.match(body, /if \(fidelity\.failedProperties > 0\)/);
  assert.match(body, /could not be set/);
  // Still ok — this is a caveat, not a failure. The plugin's own threshold is scripts and
  // instances, and that judgement is deliberately not overridden here.
  const branch = body.slice(body.indexOf('if (fidelity.failedProperties > 0)'));
  assert.match(branch.slice(0, 400), /ok: true/);
});

test('a plugin too old to report is treated as unverified, never as success', () => {
  // `restored === undefined` must not read as "restored fine" — absent evidence is absent, and the
  // deployed plugin is provably older than source.
  assert.match(body, /if \(d\.restored === undefined\)/);
  assert.match(body, /too old to report/);
});

test('singular and plural are both handled, because the message is shown verbatim', () => {
  assert.match(body, /failedProperties === 1 \? 'y' : 'ies'/);
});
