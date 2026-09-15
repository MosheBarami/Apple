/**
 * THE PRIVACY PAGES ARE CLAIMS ABOUT THE CODE, AND NOTHING WAS COMPARING THEM TO IT.
 *
 * Both pages were written before Stripe, before the request log, before the encrypted Roblox key
 * and before Discord linking, and both had gone on saying so. Measured against the tree at the time
 * this file was written:
 *
 *   - "No payment details — v1 collects no payment of any kind" sat on /privacy while
 *     apps/worker/src/billing.ts opens Stripe Checkout sessions and a webhook sets people's plans.
 *   - "Who processes your data" named two companies. The worker talks to four.
 *   - "Account deletion removes your profile, projects, chat history, checkpoints and usage ledger"
 *     — two of those five are in `ACCOUNT_RESIDUE` in apps/worker/src/erasure.ts, which is the code
 *     that actually does the deleting. It cannot remove them, and it says so in its receipt.
 *
 * A privacy policy that overstates what is deleted is not a stale document; it is the one document
 * where being wrong is the whole problem. So this test derives the claims from the worker:
 *
 *   EVERY THIRD PARTY THE WORKER INTEGRATES WITH MUST BE DISCLOSED ON BOTH PAGES. The evidence is
 *   a file in apps/worker/src, so an integration added later and not disclosed fails here rather
 *   than being noticed by a regulator.
 *
 *   NOTHING THE ERASURE PATH KEEPS MAY BE LISTED AS DELETED. The residue list is read out of
 *   erasure.ts, and each entry has to be acknowledged rather than contradicted.
 *
 *   THE RETENTION NUMBERS ARE THE ONES IN retention.ts. A window quoted from memory is how the
 *   drift started.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKER = join(SITE, '..', 'worker');
const read = (...p) => readFileSync(join(...p), 'utf8');

const policy = read(SITE, 'src', 'pages', 'privacy.astro');
const docs = read(SITE, 'src', 'pages', 'docs', 'privacy-and-data.astro');
const erasure = read(WORKER, 'src', 'erasure.ts');
const retention = read(WORKER, 'src', 'retention.ts');
const PAGES = [['privacy.astro', policy], ['docs/privacy-and-data.astro', docs]];

/**
 * Every third party that receives data because of something this product does.
 *
 * `evidence` is the file that proves the integration is real; a disclosure of something the code
 * does not do is as wrong as an omission, in the other direction.
 */
const PROCESSORS = [
  { name: 'Cloudflare', evidence: 'index.ts' },
  { name: 'Supabase', evidence: 'supa.ts' },
  { name: 'Stripe', evidence: 'billing.ts' },
  { name: 'Discord', evidence: 'discord.ts' },
  { name: 'Roblox', evidence: 'roblox-upload.ts' },
];

test('every third party the worker actually talks to is named on both pages', () => {
  assert.ok(PROCESSORS.length >= 5, 'the processor list is too short to be a list');
  for (const p of PROCESSORS) {
    assert.ok(existsSync(join(WORKER, 'src', p.evidence)), `${p.name}: ${p.evidence} does not exist — the disclosure has no basis`);
    for (const [where, text] of PAGES) {
      assert.ok(text.includes(p.name), `${where} does not mention ${p.name}, which apps/worker/src/${p.evidence} integrates with`);
    }
  }
});

test('the policy no longer says this product takes no payments', () => {
  // It does. apps/worker/src/billing.ts opens Stripe Checkout and the webhook sets the plan.
  const billing = read(WORKER, 'src', 'billing.ts');
  assert.ok(/stripe/i.test(billing), 'billing.ts does not look like Stripe — re-check this test, not the page');
  for (const [where, text] of PAGES) {
    assert.equal(/no payment of any kind/i.test(text), false, `${where} still claims this product takes no payments`);
    assert.equal(/collects? no payment/i.test(text), false, `${where} still claims this product collects no payment`);
  }
});

test('nothing the deletion path cannot reach is described as deleted', () => {
  // The residue is what erasure.ts could not remove with the credentials it holds. Each of these
  // has to be ACKNOWLEDGED on the page — the old copy listed two of them as things deletion takes.
  const residue = [
    { keeps: 'the sign-in identity', mustSay: /sign-in|log in|login/i },
    { keeps: 'the usage ledger', mustSay: /usage ledger|credit ledger|billing record|accounting/i },
  ];
  assert.match(erasure, /ACCOUNT_RESIDUE/, 'erasure.ts no longer declares a residue — re-check this test');
  assert.match(erasure, /auth\.users/, 'the residue no longer names the sign-in identity');
  assert.match(erasure, /usage_events/, 'the residue no longer names the usage ledger');
  for (const [where, text] of PAGES) {
    for (const r of residue) {
      assert.match(text, r.mustSay, `${where} does not account for ${r.keeps}, which a deletion leaves behind`);
    }
    // And the sentence that was wrong: the ledger is not one of the things deletion removes.
    assert.equal(
      /removes your profile, projects, chat history, checkpoints and usage ledger/i.test(text),
      false,
      `${where} still lists the usage ledger among the things account deletion removes`,
    );
  }
});

test('the retention windows on the page are the windows in the code', () => {
  const days = /analyticsEventDays: (\d+)/.exec(retention)?.[1];
  const kept = /checkpointsKept: (\d+)/.exec(retention)?.[1];
  assert.ok(days && kept, 'could not read the retention windows out of retention.ts');
  for (const [where, text] of PAGES) {
    assert.ok(text.includes(`${days} days`), `${where} must state the ${days}-day request-log window`);
    assert.ok(text.includes(kept), `${where} must state that the newest ${kept} checkpoints are kept`);
  }
});

test('the pages say a person can do it themselves, and name the routes that exist', () => {
  // Both features exist now (apps/worker/src/account-export.ts, erasure.ts) and are on the settings
  // page. A policy that still sent people to an email address would be under-promising a right the
  // product already honours, which is its own kind of wrong.
  for (const [where, text] of PAGES) {
    assert.match(text, /download/i, `${where} does not tell anybody they can export their data`);
    assert.match(text, /settings/i, `${where} does not say where`);
  }
});

test('the analytics record and the stored Roblox key are disclosed, with what each is for', () => {
  for (const [where, text] of PAGES) {
    assert.match(text, /request log|analytics/i, `${where} does not mention the request log at all`);
    assert.match(text, /Open Cloud|Roblox (API )?key/i, `${where} does not mention the stored Roblox credential`);
    // The key is encrypted at rest and never returned — the two facts that make storing it
    // defensible, and therefore the two the page has to state rather than imply.
    assert.match(text, /encrypt/i, `${where} does not say the stored credential is encrypted`);
  }
});
