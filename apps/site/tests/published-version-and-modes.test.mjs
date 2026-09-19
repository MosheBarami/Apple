/**
 * THREE THINGS THIS SITE PUBLISHED THAT THE PRODUCT DOES NOT HAVE.
 *
 * Found by reviewers reading the deployed docs as somebody who had just paid:
 *
 *   /docs/faq          told a customer to "ask in Plan mode — 2 credits", and /docs/modes says on
 *                      the same site "It is not a read-only Plan mode". The FAQ named a mode that
 *                      does not exist and put a price on it.
 *   /docs/credits...   said "Pro (when it ships) queues ahead", inventing a fourth tier. The plans
 *                      are Free, Builder and Studio, and there is no paid queue priority at all.
 *   /docs/updating     told a customer to look for "Apple v0.2.0 · protocol 1" at the bottom of the
 *                      panel. The shipped plugin is 1.0.0 and prints
 *                      "Apple Studio · 1.0.0 · independent preview".
 *
 * Each of these is a sentence a customer acts on — looks for a mode, waits for a tier, checks a
 * version — so each of them ends in confusion rather than in a wrong belief they never test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const DOCS = join(HERE, '..', 'src', 'pages', 'docs');
const pages = readdirSync(DOCS).filter((f) => f.endsWith('.astro'));
const text = (f) => readFileSync(join(DOCS, f), 'utf8');

test('THE PLUGIN VERSION THE DOCS NAME IS THE ONE THE PLUGIN PRINTS', () => {
  // Read it out of the plugin rather than out of another document. The panel's own string is the
  // thing a customer compares against, so that is the string this asserts on.
  const panel = readFileSync(join(ROOT, 'apps', 'apple-plugin', 'src', 'init.server.luau'), 'utf8');
  const shown = /text\("(Apple Studio · [^"]+)"/.exec(panel);
  assert.ok(shown, 'the plugin panel no longer prints a version line — re-aim this test');
  const version = /(\d+\.\d+\.\d+)/.exec(shown[1])[1];

  for (const f of pages) {
    const body = text(f);
    for (const [, found] of body.matchAll(/Apple v?(\d+\.\d+\.\d+)\s*·/g)) {
      assert.equal(found, version,
        `${f} tells a customer to look for Apple ${found} at the bottom of the panel; it prints ${version}`);
    }
  }
});

test('NO PAGE NAMES A MODE THE PRODUCT REFUSES BY NAME', () => {
  // modes.astro states "It is not a read-only Plan mode" — so any page offering one contradicts the
  // page whose whole subject is what the modes are.
  const modes = text('modes.astro');
  assert.match(modes, /not a read-only Plan mode/,
    'modes.astro no longer denies Plan mode — check what the product does now before trusting this');
  for (const f of pages) {
    if (f === 'modes.astro') continue;
    assert.doesNotMatch(text(f), /\bin Plan mode\b/,
      `${f} tells a customer to use Plan mode, which modes.astro says does not exist`);
  }
});

test('NO PAGE INVENTS A PLAN, and the three that exist are the three that are named', () => {
  const shared = readFileSync(join(ROOT, 'packages', 'shared', 'src', 'index.ts'), 'utf8');
  // The declared plan ids. Two earlier versions of this parse were wrong and the assertion below
  // caught both, which is the only reason they are worth mentioning: the first matched by
  // indentation across the whole file and returned `free, builder, studio, enterprise, opts, free,
  // builder, studio, enterprise` — `opts` is a function parameter and the list was doubled — and
  // the second read `PlanId`, which is `keyof typeof PLAN_LIMITS` and carries no literal union at
  // all, so it returned nothing. A guard whose own input is wrong reports the wrong defect, so the
  // `>= 3` check is doing real work rather than decorating.
  const block = /export const PLAN_LIMITS = \{([\s\S]*?)^\} as const;/m.exec(shared)
    ?? /export const PLAN_LIMITS = \{([\s\S]*?)^\};/m.exec(shared);
  assert.ok(block, 'PLAN_LIMITS moved — re-aim this test');
  const ids = [...block[1].matchAll(/^\s{2}([a-z][a-z-]*):\s*\{\s*creditsPerDay/gm)].map((m) => m[1]);
  assert.ok(ids.length >= 3, `only ${ids.length} plans parsed — the shape changed`);

  for (const f of pages) {
    // A plan name is capitalised and stands alone. `Pro` inside `Protocol` is not a claim, and
    // neither is a sentence DENYING a plan — which is what tripped this the first time, because the
    // fix I had written said "no plan called Pro" and the checker read the denial as the claim. The
    // page no longer needs the word at all, and this scan no longer has to tell them apart.
    const body = text(f).replace(/<code>[\s\S]*?<\/code>/g, '');
    // NAMED TIERS ONLY. The obvious scan — any capitalised word before "plan" — flagged
    // billing.astro's "Your plan", which is ordinary English, and a checker that reports "Your
    // plan" as an invented tier is a checker somebody deletes within a week. What was actually
    // published was a TIER NAME: "Pro (when it ships) queues ahead", a plan, a promise and a
    // capability, none of them real. So this checks for tier names, and a new invented tier gets
    // added here the day somebody writes one — which is a cost, and a smaller one than the alarm
    // nobody believes.
    // ONE WORD, AND THE LIST STOPPED GROWING FOR A REASON. It was Pro, Plus, Premium, Ultimate,
    // Team and Business — and Team immediately flagged connect.astro's "Team Create", which is
    // Roblox's own feature and has nothing to do with pricing. Every word on that list except Pro
    // has an ordinary meaning in these docs, so each one buys a false alarm, and a checker that
    // cries wolf about "Team Create" and "Your plan" is one somebody switches off before it ever
    // catches the thing it was written for.
    //
    // Pro is the one that was actually published — "Pro (when it ships) queues ahead", a tier, a
    // promise and a capability, none of them real — and it is the one word here with no other use.
    // A guard narrow enough to stay true beats a guard wide enough to be ignored.
    if (!ids.includes('pro')) {
      assert.doesNotMatch(body, /\bPro\b(?![a-z])/,
        `${f} names a tier called Pro; the plans are ${ids.join(', ')}`);
    }
  }
});

test('the 404 a stranger reaches from a dead share link is written in English', () => {
  const notFound = readFileSync(join(HERE, '..', 'src', 'pages', '404.astro'), 'utf8');
  assert.doesNotMatch(notFound, /\bA apple\b/, 'the headline reads "A apple" — this is the first page a stranger sees');
  assert.doesNotMatch(notFound, /\bA (a|e|i|o|u)/, 'an "a" before a vowel on the 404 headline');
});
