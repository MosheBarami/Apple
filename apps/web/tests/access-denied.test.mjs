/**
 * "YOU ARE NOT AN OPERATOR" AND "I COULD NOT FIND OUT" ARE DIFFERENT ANSWERS.
 *
 * /admin guarded itself with `me.isError || me.data?.profile?.is_admin !== true`, which folds a
 * failed profile fetch into a permission verdict: a network blip, an expired session or a 500
 * from /api/me all rendered as "Nothing here — this area is for Apple operators." The operator
 * is then told, flatly and wrongly, what they are. It is this repository's failure-to-observe
 * pattern in the place where it costs most: an authority claim the interface never established.
 *
 * Hiding the panel on a failed fetch is still right — offering a page that will 403 is worse —
 * but the page has to SAY the check failed, and offer to run it again.
 *
 * Run with:  node --test apps/web/tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../src');
const ADMIN = readFileSync(join(SRC, 'routes', 'admin.tsx'), 'utf8');

/** The body of `export function AdminPage`, up to the next top-level export. */
function adminPage() {
  const i = ADMIN.indexOf('export function AdminPage');
  assert.notEqual(i, -1, 'AdminPage is gone — has the route been renamed?');
  const rest = ADMIN.slice(i + 1);
  const end = rest.indexOf('\nexport ');
  return end === -1 ? rest : rest.slice(0, end);
}

test('a profile fetch that failed is rendered as a failure, not as a verdict', () => {
  const body = adminPage();
  const branch = /if \(me\.isError\)\s*\{([\s\S]*?)\n  \}/.exec(body);
  assert.ok(branch, '/admin needs its own branch for "the check did not come back"');
  assert.match(branch[1], /<Failure\b/, 'that branch must render the shared failure card');
  assert.match(branch[1], /onRetry=/, 'a check that failed must be offerable again');
  assert.match(branch[1], /me\.error/, 'the card must be handed the actual error, not a stand-in');
});

test('the refusal card is shown only to a profile that actually answered', () => {
  const body = adminPage();
  // The guard that produces "Nothing here" must be about is_admin and nothing else. With
  // `me.isError ||` back in front of it, this assertion is what goes red.
  const guard = /if \(([^)]*)\) \{\s*return \(\s*<div className="page">\s*<div className="empty-state">/.exec(body);
  assert.ok(guard, 'could not find the refusal card — has its shape changed?');
  assert.doesNotMatch(
    guard[1],
    /isError|isPending|error/,
    `"Nothing here" must not be reachable from a failed or pending check, but its guard is: ${guard[1]}`,
  );
  assert.match(guard[1], /is_admin !== true/, 'the refusal must rest on a profile that said so');
});

test('the refusal still says what the page is, rather than showing a blank', () => {
  const body = adminPage();
  assert.match(body, /Nothing here/);
  assert.match(body, /This area is for Apple operators\./);
});
