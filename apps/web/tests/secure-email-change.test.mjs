/**
 * THE PAGE MAY NOT PROMISE A DEFENCE THE REPOSITORY CANNOT SHOW IS ON.
 *
 * Changing the address on an account is how an account is taken over, and Supabase has a project
 * setting for exactly that — "secure email change", which mails BOTH the old address and the new
 * one and applies the change only when both are confirmed. With it on, someone who sits down at an
 * unlocked screen cannot quietly move the account to their own inbox. With it off, one click in the
 * attacker's own mail finishes the job.
 *
 * The settings page used to state the strong behaviour as fact: "Your current address gets one too —
 * the change only takes effect once both are confirmed." Nothing in this repository sets that
 * toggle, and nothing checks it. There is no config.toml anywhere in the tree, infra/supabase holds
 * a migration runner and SQL, and neither can see an auth setting. So the sentence was a claim about
 * a dashboard checkbox nobody in this codebase has ever looked at — an observation nobody made,
 * printed as one, on the screen where being wrong costs the account.
 *
 * This test does not decide what the copy should say. It says: while nothing here can OBSERVE the
 * setting, the page may not assert it. Add a check under infra/supabase/tests/ that queries the
 * project's auth settings and fails when secure email change is off, and the sentence becomes
 * licensed and this test lets it back in.
 *
 * Run with:  node --test tests/secure-email-change.test.mjs      (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = readFileSync(join(HERE, '..', 'src', 'routes', 'settings.tsx'), 'utf8');
/**
 * Whitespace collapsed, because JSX wraps.
 *
 * Matching the raw file would let the very claim this forbids back in simply by falling across a
 * line break, which is how a guard quietly stops guarding.
 */
const SETTINGS = RAW.replace(/\s+/g, ' ');
const INFRA_TESTS = join(HERE, '..', '..', '..', 'infra', 'supabase', 'tests');

/**
 * Sentences that assert the provider is configured the strong way.
 *
 * Each of these is a statement about what the OLD inbox receives and what it takes for the change
 * to apply — which is precisely the part this repository cannot see.
 */
const ASSERTS_DUAL_CONFIRMATION = [
  /current address gets one too/i,
  /both (of them )?are confirmed/i,
  /once both/i,
  /your old address (also )?gets/i,
  /we (also )?email your (current|old) address/i,
];

/** Does anything in the tree actually LOOK at the setting? */
function licensedByAnObservation() {
  if (!existsSync(INFRA_TESTS)) return false;
  return readdirSync(INFRA_TESTS).some((f) => {
    const src = readFileSync(join(INFRA_TESTS, f), 'utf8');
    return /secure[_\s-]?email[_\s-]?change/i.test(src);
  });
}

test('the scrape is not vacuous — the address-change copy is where this test thinks it is', () => {
  // F-64 first. A test that reads the wrong file reports "no forbidden claims" for ever.
  assert.match(SETTINGS, /<Row id="email-address"/, 'the email row must still exist');
  assert.match(SETTINGS, /A confirmation link is on its way to/, 'and must still say a link was sent');
});

test('THE SETTINGS PAGE DOES NOT CLAIM DUAL CONFIRMATION WHILE NOTHING CAN CHECK IT', () => {
  if (licensedByAnObservation()) return; // Someone built the check; the claim is theirs to make.
  for (const claim of ASSERTS_DUAL_CONFIRMATION) {
    assert.doesNotMatch(
      SETTINGS,
      claim,
      'this asserts Supabase\'s "secure email change" is on. Nothing in this repository reads that ' +
        'setting, so the page cannot know it. Either add a check under infra/supabase/tests/ that ' +
        'queries the project auth settings and fails when it is off, or do not promise it.',
    );
  }
});

test('what it says instead is true whatever the provider is set to', () => {
  // The honest floor, and it holds either way: the new address must be confirmed before anything
  // moves, so a change nobody asked for dies by being ignored. That sentence needs no dashboard.
  assert.match(
    SETTINGS,
    /does not change until/i,
    'the page must still tell the user what protects them — vagueness is not the fix for a false claim',
  );
});
