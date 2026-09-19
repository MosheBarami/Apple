/**
 * AN INVITEE WHO DID THE ONLY THING OPEN TO THEM LOST THE INVITATION.
 *
 * Someone is sent a share link. They have never used the product. `/join?token=…` sits inside
 * `AuthGuard`, which does the right thing — it redirects to `/login` carrying
 * `state.from = "/join?token=…"`, the whole invitation, and the comment in App.tsx says so
 * deliberately. The login page reads it and returns them there.
 *
 * Then they click "Create an account", because they do not have one, and that link carried no
 * state. `from` was dropped at the click, the signup page had never heard of it, and after signing
 * up they landed on an empty project list with no idea what had happened to the thing they were
 * sent.
 *
 * The guard preserved the token across the one hop somebody had already thought about, and the
 * funnel lost it on the next.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, '..', 'src', 'routes', 'auth-pages.tsx'), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const GUARD = readFileSync(join(HERE, '..', 'src', 'lib', 'auth.tsx'), 'utf8');
const APP = readFileSync(join(HERE, '..', 'src', 'App.tsx'), 'utf8');

test('THE PREMISE: /join is behind the guard and the guard remembers the query', () => {
  // If either of these stops being true the rest of this file is asserting about nothing.
  assert.match(APP, /path="\/join"/, '/join is no longer a route');
  assert.match(GUARD, /const from = `\$\{location\.pathname\}\$\{location\.search\}`/,
    'the guard no longer remembers the query string, so the token is lost before signup is reached');
});

test('"CREATE AN ACCOUNT" CARRIES THE RETURN PATH — this is the defect', () => {
  const link = /New here\?\s*<Link to="\/signup"([^>]*)>/.exec(SRC);
  assert.ok(link, 'the signup link is gone — re-aim this test');
  assert.match(link[1], /state=\{from/,
    'the signup link drops `from`, so an invitee loses the invitation at the click');
});

test('the signup page reads it, or carrying it there achieves nothing', () => {
  const page = SRC.slice(SRC.indexOf('export function SignupPage'));
  assert.match(page, /safeInternalPath\(\(location\.state as \{ from\?: string \} \| null\)\?\.from\)/,
    'SignupPage does not read `from`');
  // `safeInternalPath` and not the raw value: this ends up in a navigate(), so an off-origin string
  // here would be an open redirect reached by sending somebody a crafted link.
  assert.match(page, /navigate\(from \?\? '\/', \{ replace: true \}\)/,
    'a confirmed sign-up still lands on the project list rather than on the invitation');
});

test('AND BACK THE OTHER WAY, so the pair cannot drift apart again', () => {
  const back = /Already have an account\?\s*<Link to="\/login"([^>]*)>/.exec(SRC);
  assert.ok(back, 'the sign-in link on the signup page is gone');
  assert.match(back[1], /state=\{from/,
    'bouncing from signup back to login loses the invitation — the same defect in the other direction');
});

test('the raw state is never navigated to without being checked', () => {
  // The whole mechanism is "take a path out of router state and go there". That is an open redirect
  // unless something refuses an off-origin target, and `safeInternalPath` is that something.
  const uses = [...SRC.matchAll(/navigate\(from/g)];
  assert.ok(uses.length >= 1, 'nothing navigates to `from` — re-aim this test');
  assert.doesNotMatch(SRC, /const from = \(location\.state as[^;]*\)\?\.from;/,
    '`from` is read raw somewhere, without safeInternalPath');
});
