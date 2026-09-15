// The two-step prompt must offer a way out, because the phone it asks for is the thing people lose.
//
// THE DEAD END THIS CLOSES. A person with two-step verification on and no authenticator has, from
// this screen, nothing: the code field wants the app that is gone, "use a different account" wants
// an account they do not have, and /forgot resets a password that was never the problem — a new
// password still lands on this same prompt. The screen's own copy said so plainly and correctly:
// "Without that app you cannot get in — there are no backup codes yet."
//
// That sentence was the honest thing to print while it was true. It is no longer true: /recovery
// takes the message and an operator works the queue. Leaving the dead-end wording in place now
// would be the mirror of the failure it was written to avoid — the screen asserting an absence
// that is no longer there, and stranding somebody in front of a door that has since been built.
//
// WHAT THIS TEST WILL NOT LET BACK IN is the opposite lie. Backup codes still do not exist. A
// "enter a recovery code instead" link would point at nothing, and a promise that support can
// restore the account on request would be a claim about a decision only a human makes. The exit
// must be an honest one: here is where to say what happened, and a person will read it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = readFileSync(join(WEB, 'src', 'routes', 'auth-pages.tsx'), 'utf8');

// Comments stripped first — check-email-exit.test.mjs records why: a guard that reads its own
// explanation as data reports the thing it is explaining.
const strip = (src) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** The `stepOwed?.step === 'code'` branch of LoginPage, and nothing else. */
function codeStep() {
  const start = PAGE.indexOf("if (stepOwed?.step === 'code')");
  assert.notEqual(start, -1, 'the two-step prompt moved — this test is reading the wrong thing');
  const end = PAGE.indexOf('return (', PAGE.indexOf('</AuthShell>', start));
  assert.ok(end > start, 'could not find the end of the code step');
  return strip(PAGE.slice(start, end));
}

test('the scrape is not vacuous — it really is the two-step prompt', () => {
  // F-64 first. A slice that missed would report "no dead end" for ever.
  const step = codeStep();
  assert.match(step, /six-digit code/i, 'the prompt must still ask for the code');
  assert.match(step, /totpCode/, 'and must still be the TOTP field');
});

test('THE TWO-STEP PROMPT OFFERS A WAY OUT THAT LEADS SOMEWHERE', () => {
  const step = codeStep();
  assert.match(
    step,
    /\/recovery/,
    'somebody whose authenticator is gone has no other door from this screen: /forgot resets a '
      + 'password that was not the problem and lands them back here. Point at /recovery.',
  );
});

test('it still does not promise backup codes, because there are none', () => {
  const step = codeStep();
  for (const claim of [/backup code/i, /recovery code/i, /one-time code/i, /scratch code/i]) {
    assert.doesNotMatch(
      step,
      claim,
      'no such thing exists in this product; a link to one would be a control wired to nothing',
    );
  }
});

test('and it does not promise an outcome only a human can decide', () => {
  const step = codeStep();
  for (const claim of [/we will restore/i, /we can unlock/i, /support will reset/i, /guarantee/i]) {
    assert.doesNotMatch(step, claim, 'the queue takes the message; it does not promise the answer');
  }
});

test('the exit it offers actually exists as a route', () => {
  // A link is only a way out if something is mounted at the other end. This is the assertion that
  // would have caught the dead-end wording being replaced by a dead LINK, which is no better.
  const app = readFileSync(join(WEB, 'src', 'app.tsx'), 'utf8');
  assert.match(app, /path="\/recovery"/, '/recovery must be a registered route');
});
