// The "check your email" screen must offer a way out, because half the time no mail is coming.
//
// THE CASE THAT IS NOT AN EDGE CASE. Signing up with an address that ALREADY has an account
// returns 200 from Supabase and sends nothing — deliberately, so this screen cannot be used to
// discover who is registered. `signupOutcome` preserves that on purpose and a test holds it to it.
//
// So the screen is reached in two states that look identical from inside it: a link IS on its way,
// or nothing will ever arrive. The owner of this product sat on this card four times in one hour
// waiting for a message that was never going to be sent. The screen was not wrong about security;
// it was wrong about offering nothing but patience.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = readFileSync(join(WEB, 'src', 'routes', 'auth-pages.tsx'), 'utf8');
//[[ COMMENTS ARE STRIPPED FIRST, and this file is the reason the rule exists in writing.
//
//   The oracle assertion below searches for the card CLAIMING that an account exists. It failed on
//   the correct code, matching "…an address that ALREADY has an account returns 200…" — a sentence
//   in the comment explaining WHY the claim must not be made. A guard that reads its own
//   commentary as data is a defect this repository has now caught four times, and scripts/
//   check-copy.mjs strips comments first for exactly this reason.
const strip = (src) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')   // JSX comments
    .replace(/\/\*[\s\S]*?\*\//g, ' ')         // block comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1');        // line comments, sparing the // in a URL

const cardRaw = PAGE.slice(PAGE.indexOf('function CheckEmailCard('), PAGE.indexOf('function FormError('));
const card = strip(cardRaw);

test('the card offers the door that works when no mail is coming', () => {
  assert.match(card, /to="\/login"/, 'a person who already has an account must be able to reach sign in');
  assert.match(card, /\/forgot/, 'and the password reset, which is the remedy when they cannot remember it');
});

test('it does not instruct unconditionally', () => {
  //[[ "Click the link to confirm your address" was printed to everyone, and for an address that
  //   already has an account there is no link and never will be. An instruction the person cannot
  //   follow and cannot explain is worse than no instruction: it makes them wait. ]]
  const sub = strip(PAGE.slice(PAGE.indexOf('<CheckEmailCard'), PAGE.indexOf('</CheckEmailCard>')));
  assert.doesNotMatch(sub, /Click the link to confirm your address/,
    'the unconditional instruction is false for an address that already has an account');
  assert.match(sub, /If this address is new/, 'the sentence must be conditional, as CHECK_EMAIL_LINE already is');
});

test('and it still reveals nothing about whether the account exists', () => {
  //[[ THE FIX MUST NOT COST THE PROPERTY IT SITS NEXT TO. The whole reason no mail is sent is that
  //   the screen is identical either way. A helpful "you already have an account" here would hand
  //   an enumeration oracle to anyone with a list of addresses — the same defect `signupOutcome`
  //   is written to avoid and `resendConfirmation` deliberately ignores its own error for. ]]
  //   The difference is one word, and it is the whole property: "you MAY already have an account"
  //   is true of every visitor to this screen and tells an attacker nothing. "You already have an
  //   account" is a yes/no oracle. The first version of this assertion used a lookahead clever
  //   enough to match its own correct copy — so it is written as the plain distinction instead.
  const hedged = /\bmay already have an account/i;
  const asserted = /(?<!may )already (?:have|has) an account/i;
  assert.match(card, hedged, 'it may only raise the possibility');
  const claims = [...card.matchAll(new RegExp(asserted.source, 'gi'))]
    .filter((m) => !/may /i.test(card.slice(Math.max(0, m.index - 4), m.index)));
  assert.equal(claims.length, 0, `the card asserts the account exists: ${claims.map((m) => m[0]).join(', ')}`);
});
