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
 *
 * ROUND TWO, M2 handoff step 2.4 (planning/proof/M2/LEGAL-CLAIMS.md has the claim-by-claim table). The Roblox sign-in lane
 * made three published sentences false ("our servers hold no master key", "the only personal information signup asks for",
 * "children below the age of consent") and the same sweep found others that were already false: the pages said a prompt is "not
 * retained by the inference layer" while providers/workers-ai.ts logs every text call in Cloudflare AI Gateway with
 * `collectLog: true`, and named five recipients of data where the worker's source calls thirteen hosts that receive it. So this half derives from
 * the source and fails when the two disagree, in the direction that matters (the page says something the code does not do):
 *
 *   THE ROBLOX DATA LIST IS THE COLUMNS THE CODE STORES, read from the CREATE TABLE statements, and every column is accounted
 *   for. A column added later with no sentence fails here.
 *   THE SUPABASE SECRET KEY IS DESCRIBED BY WHAT IT DOES: the Auth admin calls are read out of roblox-oauth.ts.
 *   EVERY HOST THE WORKER CALLS IS CLASSIFIED: a recipient of user data (named on both pages) or public content (listed here).
 *   EVERY RESIDUE ENTRY IS ACKNOWLEDGED on both pages, not just the two the first version of this file knew.
 *   THE MODEL-CALL LOG IS DISCLOSED WHILE THE CODE COLLECTS IT.
 *   13 AND OLDER, NO PARENT'S PERMISSION; NO CLAIM THAT SIGN-UP ASKS FOR A BIRTH DATE WHILE IT DOES NOT.
 *   NO BLANKET NO-TRAINING PROMISE, IN ANY WORDS, IN apps/site/src, apps/web/src, packages/shared/src AND apps/site/public: the owner's rule is Roblox data never, improvement data opt-out and
 *   not collected yet. A sentence that denies training, in any words, must be about Roblox data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { visibleText } from './lib/visible-copy.mjs';

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
  // The Roblox sign-in is its own integration (identity provider), with its own file.
  { name: 'Roblox', evidence: 'roblox-oauth.ts' },
  { name: 'Turnstile', evidence: 'turnstile.ts' },
  { name: 'Sentry', evidence: 'sentry.ts' },
  { name: 'Hugging Face', evidence: 'hf.ts' },
  { name: 'AssemblyAI', evidence: 'voice-transcribe.ts' },
  { name: 'Serper', evidence: 'webtools.ts' },
  { name: 'Tavily', evidence: 'webtools.ts' },
  { name: 'Context7', evidence: 'webtools.ts' },
  { name: 'GitHub', evidence: 'webtools.ts' },
];

test('every third party the worker actually talks to is named on both pages', () => {
  assert.ok(PROCESSORS.length >= 12, 'the processor list is too short to be a list');
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

/* ======================================================================================================================
 * ROUND TWO: the pages are true of the code on the Roblox sign-in branch. See the header.
 * ==================================================================================================================== */

const ROOT = join(SITE, '..', '..');
const terms = read(SITE, 'src', 'pages', 'terms.astro');
const oauth = read(WORKER, 'src', 'roblox-oauth.ts');
const gate = read(ROOT, 'packages', 'training', 'src', 'consent-staging.mjs');
const signup = read(ROOT, 'apps', 'web', 'src', 'routes', 'auth-pages.tsx');
const settingsSrc = read(ROOT, 'apps', 'web', 'src', 'routes', 'settings.tsx');

/** What a reader receives: comments, tags and the page's frontmatter out, entities in, one line. */
const prose = (src) => visibleText(src.replace(/^---[\s\S]*?\n---/, ' ')).replace(/&amp;/g, '&').replace(/&rsquo;/g, "'").replace(/\s+/g, ' ').trim();
const PRIVACY = prose(policy);
const DOCS = prose(docs);
const TERMS = prose(terms);
const BOTH = [['/privacy', PRIVACY], ['/docs/privacy-and-data', DOCS]];

/** Every .ts file under a directory, tests and generated tables excluded: the source a claim is about. */
function sourceFiles(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git' || name === 'components.generated.ts') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}
/** Source with its comments removed, so a sentence EXPLAINING a rule is not read as the rule being broken. */
const code = (file) =>
  readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
const WORKER_SRC = sourceFiles(join(WORKER, 'src'), ['.ts']);
/**
 * `code`, for the worker's own files: only comments that START A LINE (or trail after whitespace) are removed. `code` strips from any "/*" to the next "*\/",
 * and index.ts has the string '/api/*' in it, so `code` ate the middleware that applies the analytics consent filter and a test about it saw nothing.
 */
const wcode = (file) =>
  readFileSync(file, 'utf8').replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, ' ').replace(/^[ \t]*\/\/.*$/gm, '').replace(/[ \t]\/\/ .*$/gm, '');

/** A worker module, bundled and imported, so a claim is checked against what the code EVALUATES TO and not against how its source is wrapped or named. */
const ESBUILD = join(WORKER, 'node_modules', '.bin', 'esbuild');
const BUNDLES = mkdtempSync(join(tmpdir(), 'privacy-claims-'));
process.on('exit', () => rmSync(BUNDLES, { recursive: true, force: true }));
async function bundleWorker(rel, name) {
  const out = join(BUNDLES, name);
  execFileSync(ESBUILD, [join(WORKER, 'src', rel), '--bundle', '--format=esm', '--platform=neutral', '--main-fields=main,module', '--outfile=' + out], { stdio: 'pipe' });
  return import(pathToFileURL(out).href);
}

/* ---------------------------------------------------------------- the Roblox data that is held --- */

test('the Roblox data the pages list is the columns the code stores: read from the CREATE TABLE statements, and every column is accounted for', () => {
  const stored = {};
  for (const m of oauth.matchAll(/create table if not exists (roblox_[a-z_]+)\(([^)`]*)\)`/g)) {
    stored[m[1]] = m[2].split(',').map((c) => c.trim().split(/\s+/)[0]);
  }
  assert.deepEqual(Object.keys(stored).sort(), ['roblox_identities', 'roblox_oauth_tokens'], 'could not read both Roblox tables out of roblox-oauth.ts: this test would check nothing');
  const columns = [...new Set(Object.values(stored).flat())];
  assert.ok(columns.length >= 12, `only ${columns.length} columns were read`);

  // What each column is, in the words a person reads. `sub` and `roblox_sub` are the same fact, so they share a sentence.
  const COVERAGE = {
    roblox_sub: /Roblox user id/,
    sub: /Roblox user id/,
    user_id: /StudPilot account id/,
    username: /Roblox username/,
    created_at: /the time the link was made/,
    reauth_at: /last confirmed with Roblox that it is you/,
    sealed_refresh: /Roblox refresh token, encrypted/,
    scopes: /permissions Roblox granted/,
    version: /technical bookkeeping/,
    generation: /technical bookkeeping/,
    rotated_at: /technical bookkeeping/,
    lease_until: /technical bookkeeping/,
  };
  assert.deepEqual(Object.keys(COVERAGE).sort(), [...columns].sort(),
    'a column the code stores has no sentence here (or a sentence names a column the code no longer stores): decide what the pages say about it');
  for (const [where, text] of BOTH) {
    for (const [column, re] of Object.entries(COVERAGE)) assert.match(text, re, `${where} does not account for the stored column ${column}`);
  }

  // The scopes asked for are the scopes named, and nothing asks for more.
  const scope = /const SIGNIN_SCOPE = '([^']+)'/.exec(oauth)?.[1];
  assert.equal(scope, 'openid profile', 'the sign-in scope changed: the pages say which permissions are asked for');
  // THE SENTENCE, not the words: "profile" also occurs in "your profile picture" (the Google and Discord line), so a page that named only openid passed.
  const RAW = [['/privacy', policy], ['/docs/privacy-and-data', docs]];
  assert.deepEqual(scope.split(' '), ['openid', 'profile'], 'the permissions changed: re-aim the sentence below');
  for (const [where, raw] of RAW) assert.match(raw, /<code>openid<\/code>\s+and\s+<code>profile<\/code>/, `${where} does not name the openid and profile permissions together, as the two it asks for`);
  assert.ok(!/asset:(read|write)/.test(code(join(WORKER, 'src', 'roblox-oauth.ts'))), 'the code asks for an asset scope, which the pages say it does not');
});

test('what is held outside those two tables is on the pages too: the placeholder address, the five-minute hold, the ten-minute confirmation', () => {
  const domain = /const SYNTHETIC_EMAIL_DOMAIN = '([^']+)'/.exec(oauth)?.[1];
  const hold = Number(/const HANDLE_TTL_SECONDS = (\d+)/.exec(oauth)?.[1]);
  const window = Number(/const REAUTH_WINDOW_MS = (\d+) \* 60_000/.exec(oauth)?.[1]);
  const lease = Number(/const REFRESH_LEASE_MS = (\d+)_000/.exec(oauth)?.[1]);
  const stateTtl = Number(/const STATE_TTL_SECONDS = (\d+)/.exec(oauth)?.[1]);
  const cookies = [...oauth.matchAll(/const (?:STATE|HANDLE)_COOKIE = '([a-z_]+)'/g)].map((m) => m[1]);
  const WORDS = { 5: 'five', 10: 'ten' };
  assert.ok(domain && hold && window && lease && stateTtl, 'could not read the address domain, the hold, the window, the lease or the state hold out of roblox-oauth.ts');
  assert.equal(cookies.length, 2, `the sign-in sets ${cookies.length} flow cookies (${cookies.join(', ')}): the pages say two`);
  assert.equal(stateTtl / 60, 10, 'the sign-in state is no longer held ten minutes: the pages say ten');
  assert.equal(hold / 60, 5, 'the handle is no longer held five minutes: the pages say five');
  assert.ok(WORDS[hold / 60] && WORDS[window], `no word for ${hold / 60} or ${window} minutes: extend WORDS`);
  for (const [where, text] of BOTH) {
    assert.ok(text.includes(domain), `${where} does not name the placeholder address domain ${domain}`);
    // ANCHORED to the sentence each number belongs to: the two numbers are both minutes, and a bare "ten minutes" would satisfy either.
    assert.ok(new RegExp(`up to ${WORDS[hold / 60]} minutes`, 'i').test(text), `${where} does not say a first sight is held for up to ${WORDS[hold / 60]} minutes`);
    assert.ok(new RegExp(`good for ${WORDS[window]} minutes`, 'i').test(text), `${where} does not say a confirmation is good for ${WORDS[window]} minutes`);
    assert.ok(new RegExp(`lock held for up to ${lease} seconds`, 'i').test(text), `${where} does not say the refresh lock is held for up to ${lease} seconds`);
    // The flow cookies and the short-lived records the sign-in makes: "everything we hold because you signed in with Roblox" has to include them.
    assert.match(text, /two cookies that StudPilot's own address sets|two cookies StudPilot's own address sets/, `${where} does not disclose the two sign-in cookies`);
    assert.match(text, /one lasting ten minutes and one lasting five|one lasts ten minutes, one five/, `${where} does not give the cookies' lifetimes`);
    assert.match(text, /hash of the one-time sign-in token/, `${where} does not disclose the sign-in token hash held for a returning account`);
  }
});

test('Roblox data is never used for AI training, stated on every page, and the wipe the pages describe is in the code', () => {
  for (const [where, text] of [...BOTH, ['/terms', TERMS]]) {
    assert.match(text, /Roblox data is never used for AI training|data that comes from Roblox is never used for AI training/i, `${where} does not state the Roblox no-training rule`);
  }
  assert.match(PRIVACY, /Third-Party App Policy/, 'the policy no longer says where the rule comes from');
  // No code path trains on anything today: the gate that would is closed (promises-match-the-product.test.mjs holds it to the copy).
  assert.match(gate, /export const CUSTOMER_WORK_TRAINING_ENABLED = false;/);

  // The mechanism: refreshRobloxAccessToken, the one function that uses the stored token, deletes it when Roblox says invalid_grant.
  assert.match(oauth, /async function robloxSaysGrantGone[\s\S]{0,400}=== 'invalid_grant'/);
  // (The version and generation binding of that delete is held by behaviour, not by its SQL text: roblox-oauth.test.mjs "ACCESS LOST deletes only the row that was refreshed".)
  assert.match(oauth, /async function wipeDeadGrant[\s\S]{0,500}delete from roblox_oauth_tokens/);
  const at = oauth.indexOf('export async function refreshRobloxAccessToken');
  const refresh = oauth.slice(at, oauth.indexOf('\nexport ', at + 10));
  assert.match(refresh, /if \(await robloxSaysGrantGone\(res\)\) \{\s*await wipeDeadGrant\(env, userId, row\);/, 'the refresh no longer wipes the token when Roblox says the grant is gone');

  // THE LIMITATION THE PAGES ADMIT IS TRUE ONLY WHILE NOTHING CALLS THE REFRESH. The day M5c calls it, "nothing uses it yet" is false and must go.
  const callers = WORKER_SRC.filter((f) => !f.endsWith('roblox-oauth.ts') && /refreshRobloxAccessToken/.test(code(f)));
  assert.deepEqual(callers, [], 'something now calls refreshRobloxAccessToken: the pages still say nothing uses the Roblox token yet. Reword them, and say what the connection is used for');
  // INSIDE roblox-oauth.ts TOO, where a new caller is most likely to appear: the function is named once (its definition) and nothing there calls it.
  assert.equal([...code(join(WORKER, 'src', 'roblox-oauth.ts')).matchAll(/\brefreshRobloxAccessToken\b/g)].length, 1,
    'roblox-oauth.ts now calls refreshRobloxAccessToken (or names it twice): the pages still say nothing uses the Roblox token yet');
  for (const [where, text] of BOTH) assert.match(text, /nothing uses it yet/, `${where} no longer says the token is not used yet`);
});

/* ----------------------------------------------------------------------------------- 13 and older --- */

test('13 AND OLDER: no "parent\'s permission" or "age of consent", the sign-up form does not ask for a birth date, and no page claims it does', () => {
  for (const [where, text] of [...BOTH, ['/terms', TERMS]]) {
    assert.match(text, /13 (or|and) older/, `${where} does not say StudPilot is for people 13 and older`);
    assert.doesNotMatch(text, /parent|guardian|age of consent|old enough to consent|consent to online services/i, `${where} still has the old age wording`);
  }
  assert.match(PRIVACY, /under 13[\s\S]{0,200}delete/i, 'the policy does not say what happens to an account found to belong to someone under 13');
  assert.match(PRIVACY, /Roblox's sign-in service is for accounts held by people aged 13 and older/, 'the policy no longer says Roblox sign-in needs a 13+ Roblox account');
  // THE BIRTH-DATE GATE IS A LATER LANE. While the sign-up form has no such field, no page may say it asks for one.
  const form = signup.slice(signup.indexOf('export function SignupPage'), signup.indexOf('export function ForgotPasswordPage'));
  assert.ok(form.length > 2000, 'could not read the sign-up form out of auth-pages.tsx: this test would check nothing');
  const gateBuilt = /birth|date of birth|dob\b/i.test(form.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, ''));
  assert.equal(gateBuilt, false, 'the sign-up form now asks for a birth date: the pages may say so, so re-aim this test (and say it on the pages)');
  for (const [where, text] of [...BOTH, ['/terms', TERMS]]) assert.doesNotMatch(text, /date of birth|birth ?date|birthday/i, `${where} claims a birth-date gate that sign-up does not have`);
});

/* ------------------------------------------------------------------------------ improvement data --- */

test('improvement data: anonymised, opt-out, never Roblox data, NOT collected yet, and the in-app string says what the pages say', () => {
  // THE WHOLE SENTENCE, on every surface that defines the rule. The first version matched "anonymised" and "opt-out" anywhere on the page, and the
  // callout at the top of each page supplied both, so a body that said "identifiable" and "mandatory" passed.
  const RULE = 'Improvement data is anonymised, is opt-out, and never includes data from Roblox, an Open Cloud key, credentials or payment details';
  const NOT_ACTIVE = 'Collection is not active yet';
  const inApp = prose(settingsSrc.slice(settingsSrc.indexOf('<Row id="improvement-opt-out"'), settingsSrc.indexOf('</Row>', settingsSrc.indexOf('<Row id="improvement-opt-out"'))));
  assert.ok(inApp.length > 200, 'could not read the improvement-data row out of settings.tsx: this test would check nothing');
  for (const [where, text] of [...BOTH, ['Settings > Privacy', inApp]]) {
    assert.ok(text.includes(RULE), `${where} does not state the rule: "${RULE}"`);
    assert.ok(text.includes(NOT_ACTIVE), `${where} does not say "${NOT_ACTIVE}"`);
  }
  for (const [where, text] of BOTH) {
    // THE PROMISE ABOUT THE DAY COLLECTION STARTS, IN THE FUTURE TENSE, because the in-app half has no mechanism yet. It says "tell", not "email":
    // an account that signs in only with Roblox has a placeholder address nothing can deliver to. The phrase is the owner's wording of the commitment.
    assert.match(text, /[Bb]efore collection starts we will tell every account holder: by email, and in the app for accounts with no email address/, `${where} does not make the future-tense commitment to tell every account holder, by email and in the app`);
    assert.match(text, /That in-app notice does not exist yet; it will be built first/, `${where} does not admit the in-app notice is not built`);
    // And the opt-out is described as saved, with nothing reading it yet; "will be honoured" is a promise with no reader and is gone.
    assert.match(text, /nothing reads it yet, because nothing is collected/, `${where} does not say nothing reads the choice yet`);
    assert.match(text, /will not (be )?switch(ed)? collection on until the code that would collect reads (that|it)|will not be switched on until the code that would collect reads it/, `${where} does not commit to the opt-out being read before collection starts`);
    assert.doesNotMatch(text, /will be honou?red when collection starts/i, `${where} still promises the choice "will be honoured": nothing reads it`);
    assert.match(text, /Settings → Privacy → (<strong>)?Improvement data/, `${where} does not say where the opt-out is`);
  }
  // The same two promises in the policy-change sections of the policy and the terms: future tense, and the missing notice admitted.
  for (const [where, text] of [['/privacy', PRIVACY], ['/terms', TERMS]]) {
    assert.match(text, /we will (tell|email)[^.]{0,80}(account holders|accounts)[\s\S]{0,400}we will tell those accounts in the app\. That in-app notice does not exist yet; it will be built before the first change that needs it/, `${where} does not say, in the future tense, that Roblox-only accounts will be told in the app, and that the notice is not built`);
    assert.doesNotMatch(text, /notice (is|will be) shown in the app|(it|they) (is|are) told in the app/i, `${where} still states the in-app notice as if it existed`);
  }
  // "Not active" is a claim about code: the gate that would process customer work is closed.
  assert.match(gate, /export const CUSTOMER_WORK_TRAINING_ENABLED = false;/, 'the gate is open while the pages say collection is not active');
  // And the old claims that this replaced are gone from the pages. (The any-wording scan is the last test in this file.)
  for (const [where, text] of [...BOTH, ['/terms', TERMS]]) {
    assert.doesNotMatch(text, /never trains|never used to train|no fine-print exception|not "?anonymi[sz]ed"? derivatives/i, `${where} still carries the blanket promise`);
  }
});

/* ------------------------------------------------------------------------------------ identity --- */

test('Google and Discord sign-in are described conditionally while the app does not offer them', () => {
  const offered = WORKER_SRC.length > 0 && sourceFiles(join(ROOT, 'apps', 'web', 'src'), ['.ts', '.tsx']).some((f) => /signInWithOAuth/.test(code(f)));
  assert.equal(offered, false, 'the app now calls signInWithOAuth: a provider is offered, so the pages must say which, and this test must be re-aimed');
  for (const [where, text] of BOTH) {
    assert.match(text, /If you sign in with Google or Discord, when offered/, `${where} does not describe Google and Discord conditionally`);
    assert.match(text, /Google or Discord — not offered yet/, `${where} does not say neither is offered yet`);
    assert.match(text, /Supabase receives/, `${where} does not say what Supabase receives`);
  }
});

test('the Supabase secret key is described by what it does: used in one file, for the Auth admin calls the pages name, and the "no master key" claim is gone', () => {
  const users = WORKER_SRC.filter((f) => /SUPABASE_SECRET_KEY/.test(code(f))).map((f) => f.slice(WORKER.length + 1)).sort();
  assert.deepEqual(users, ['src/env.ts', 'src/roblox-oauth.ts'], 'the Supabase secret key is read somewhere else now: the pages say it is used in one place');
  const calls = [...code(join(WORKER, 'src', 'roblox-oauth.ts')).matchAll(/admin\(env, cfg, '([A-Z]+)', (['`])([^'`]+)\2/g)]
    .map((m) => `${m[1]} ${m[3].replace(/\$\{[^}]*\}/g, '')}`).sort();
  assert.deepEqual(calls, ['GET /users/', 'POST /generate_link', 'POST /users'], 'the Auth admin calls changed: the pages name exactly what the key is used for');
  for (const [where, text] of BOTH) {
    assert.match(text, /create the account/, `${where} does not say the key creates the account`);
    assert.match(text, /read that account's sign-in address/, `${where} does not say the key reads the sign-in address`);
    assert.match(text, /one-time (sign-in )?link/, `${where} does not say the key issues the one-time link`);
    assert.match(text, /not used (to read or write your projects or any other table|for your projects or any other table)/, `${where} does not say what the key is not used for`);
    assert.doesNotMatch(text, /no master key|hold(s)? no (master|service|secret)|no service[- ]role/i, `${where} still says the server holds no master key`);
  }
});

/* ----------------------------------------------------------------------------------- recipients --- */

test('EVERY HOST THE WORKER CALLS IS CLASSIFIED: a recipient of user data, named on both pages, or public content listed here', () => {
  // Hand-classified, but the HOSTS are read out of the source, so a new outbound call fails here until somebody decides which it is.
  const RECIPIENT = {
    'api.assemblyai.com': 'AssemblyAI', 'api.cloudflare.com': 'Cloudflare', 'api.github.com': 'GitHub', 'api.stripe.com': 'Stripe',
    'api.tavily.com': 'Tavily', 'apis.roblox.com': 'Roblox', 'challenges.cloudflare.com': 'Turnstile', 'context7.com': 'Context7',
    'discord.com': 'Discord', 'google.serper.dev': 'Serper', 'router.huggingface.co': 'Hugging Face',
    'tencent-hunyuan3d-2.hf.space': 'Tencent', 'thumbnails.roblox.com': 'Roblox',
  };
  // `worker.invalid` is a LABEL, not a recipient: sentry.ts uses it as the fallback origin in an event's request.url. Sentry's real host comes from
  // the DSN (envelopeEndpoint, asserted below), so it is guarded by that code and by PROCESSORS, not by a placeholder.
  const PUBLIC = new Set(['asset-library.internal', 'model-library.internal', 'create.roblox.com', 'game-icons.net', 'polyhaven.com', 'github.com', 'studpilot.app', 'worker.invalid']);
  const sentry = code(join(WORKER, 'src', 'sentry.ts'));
  assert.match(sentry, /function envelopeEndpoint\b/, 'sentry.ts no longer derives its endpoint from the DSN: re-aim this guard');
  assert.match(sentry.slice(sentry.indexOf('function envelopeEndpoint')), /dsn/i, 'the Sentry endpoint is no longer read from the DSN');
  const seen = new Set();
  for (const f of WORKER_SRC) for (const m of code(f).matchAll(/https:\/\/([a-z0-9][a-z0-9.-]*\.[a-z]{2,}|[a-z0-9.-]+\.(?:internal|invalid))/gi)) seen.add(m[1].toLowerCase());
  assert.ok(seen.size >= 15, `only ${seen.size} hosts were read out of the worker: this test would check nothing`);
  assert.equal(Object.keys(RECIPIENT).length, 13, 'the recipient hosts are thirteen: a new one is a decision about the pages');
  const unclassified = [...seen].filter((h) => !(h in RECIPIENT) && !PUBLIC.has(h));
  assert.deepEqual(unclassified, [], `the worker calls ${unclassified.join(', ')}: decide whether it receives user data (then name it on both pages and add it here) or is public content`);
  const stale = [...Object.keys(RECIPIENT), ...PUBLIC].filter((h) => !seen.has(h));
  assert.deepEqual(stale, [], `${stale.join(', ')} is classified here but the worker no longer calls it`);
  for (const name of new Set(Object.values(RECIPIENT))) {
    for (const [where, text] of BOTH) assert.ok(text.includes(name), `${where} does not name ${name}, which the worker calls`);
  }
});

test('the model-call log is disclosed for as long as the code collects it, with the voice exception the code makes', () => {
  const gatewaySrc = code(join(WORKER, 'src', 'providers', 'workers-ai.ts'));
  const voiceSrc = code(join(WORKER, 'src', 'voice-transcribe.ts'));
  assert.match(gatewaySrc, /collectLog: true/, 'text calls no longer collect the gateway log: the pages say they do, so update them');
  assert.match(voiceSrc, /collectLog: false/, 'voice calls no longer switch the gateway log off: the pages say they do');
  for (const [where, text] of BOTH) {
    assert.match(text, /Cloudflare AI Gateway/, `${where} does not name AI Gateway`);
    assert.match(text, /prompt and (the model's )?repl(y|ies)/i, `${where} does not say the log holds the prompt and the reply`);
    assert.match(text, /Voice recordings are (the exception|sent with logging (switched )?off)/, `${where} does not say voice is excluded from the log`);
    assert.doesNotMatch(text, /not retained by the inference layer/i, `${where} still says prompts are not retained`);
  }
});

/* ------------------------------------------------------------------------------ deletion residue --- */

const RECEIPT = await bundleWorker('erasure.ts', 'erasure.mjs');
const EXPORT = await bundleWorker('account-export.ts', 'account-export.mjs');

/** The part of a page that is about what survives a deletion: from its marker to the next heading, as a reader meets it. */
function survivorSection(raw, marker) {
  const at = raw.indexOf(marker);
  assert.ok(at > 0, `the page no longer has the "${marker}" paragraph`);
  const rest = raw.slice(at);
  const end = rest.search(/<h2>/);
  return prose(end === -1 ? rest : rest.slice(0, end));
}
const SURVIVORS = [['/privacy', survivorSection(policy, 'Some things survive deletion')], ['/docs/privacy-and-data', survivorSection(docs, 'Some things outlive that')]];

test('EVERY ENTRY OF THE DELETION RESIDUE is acknowledged IN THE DELETION SECTION of both pages, and what the receipt says about the Roblox data is what the pages say', () => {
  const residue = RECEIPT.ACCOUNT_RESIDUE;
  const targets = residue.map((r) => r.target);
  assert.ok(targets.length >= 12, `only ${targets.length} residue entries were read out of erasure.ts`);
  // Each acknowledgement is looked for in the SECTION about what survives, not on the whole page: a bullet deleted from that list used to be
  // satisfied by a sentence in the retention list or the callout ("the model-call log described above", "temporary image previews, one hour").
  const ACKNOWLEDGED_AS = [
    ['in-flight temporary image previews', /temporary image previews/i],
    ['generated_image_tombstones', /deleted[- ]project (id|identifier)/i],
    ['auth.users', /sign-in identity/i],
    ['public.profiles', /account row/i],
    ['public.usage_events', /usage ledger/i],
    ['public.feedback', /support messages/i],
    ['public.project_members', /other people's projects|projects other people own/i],
    ['QuotaDO', /subscription records/i],
    ['AI Gateway', /AI Gateway log|model-call log/i],
    ['AdminDO', /request log,? for up to 30 days/i],
    ['DiscordDO', /Discord link/i],
    ['account_deletions', /record of this deletion/i],
    ['SessionDO of projects other people own', /comments, reviews and messages you added/i],
  ];
  for (const target of targets) {
    assert.ok(ACKNOWLEDGED_AS.some(([key]) => target.includes(key)), `the receipt lists "${target}" as surviving a deletion and this test knows no sentence for it: add one to the pages, then here`);
  }
  for (const [key] of ACKNOWLEDGED_AS) assert.ok(targets.some((t) => t.includes(key)), `"${key}" is no longer in the residue: the pages still say it survives`);
  for (const [where, text] of SURVIVORS) {
    assert.ok(text.length > 300, `${where}: the survivor section is empty or was not found`);
    for (const [key, re] of ACKNOWLEDGED_AS) assert.match(text, re, `${where}: the section about what survives a deletion does not acknowledge what ${key} keeps`);
    assert.doesNotMatch(text, /two things (survive|outlive)/i, `${where} still says only two things survive a deletion`);
    assert.match(text, /Roblox user id and username/, `${where} does not say a Roblox account's sign-in identity still holds the Roblox id and username`);
  }
  // THE RECEIPT'S OWN WORDS, read from the evaluated residue (not from the source's line breaks): the sign-in identity entry names the Roblox data, and the
  // "one exception" to row-level security is no longer claimed. Two narrow database functions are named, as the pages name them.
  const identity = residue.find((r) => r.target.includes('auth.users'));
  assert.match(identity.why, /Roblox user id and\s+username/, 'the receipt no longer says a Roblox account still holds the id and username');
  assert.match(identity.why, /a few narrow database functions that carry nobody's token/, 'the receipt no longer names the exceptions to row-level security');
  assert.doesNotMatch(identity.why, /every other query it makes carries your own token/, 'the receipt still says every other query carries your own token');
  const profile = residue.find((r) => r.target.includes('public.profiles'));
  assert.doesNotMatch(profile.why, /training consent withdrawn/i, 'the receipt still talks about a training consent that nothing creates');
  assert.doesNotMatch(profile.why, /\bconsent\b[^.]*\bwithdrawn\b/i, 'the receipt still says a consent was withdrawn');
});

test('THE PROFILE ROW\'S CONSENT FLAG is described as what it is, on the receipt AND on the live step: read into the export, the only proof the training gate accepts, and acted on by nothing while that gate is closed', async () => {
  // `profiles.training_opt_in` is reset to off by the deletion. It is NOT "an old flag that nothing reads": the data export includes it (user-export.ts) and the training pipeline
  // accepts consent proof only from that column (consent-staging.mjs). What is true is that nothing ACTS on it while the gate is closed. So long as either reader exists,
  // neither the receipt's residue entry nor the step label the deletion writes may say or imply that nothing reads it. The label is read from the code that writes it (the step is
  // run, with the database stubbed), the same way the residue is read from the evaluated list.
  const userExport = await bundleWorker('user-export.ts', 'user-export.mjs');
  const profilesSpec = userExport.USER_EXPORT.find((t) => t.table === 'profiles');
  assert.ok(profilesSpec && profilesSpec.fields.includes('training_opt_in'), 'the export no longer includes profiles.training_opt_in: re-read what the receipt may say about the flag');
  assert.match(code(join(ROOT, 'packages', 'training', 'src', 'consent-staging.mjs')), /proof\.source !== 'profiles\.training_opt_in'/, 'the training pipeline no longer takes its consent proof from profiles.training_opt_in: re-read what the receipt may say about the flag');
  assert.match(gate, /export const CUSTOMER_WORK_TRAINING_ENABLED = false;/, 'the gate is open: "nothing acts on it while the gate is closed" is no longer the sentence');

  const asked = [];
  const realFetch = globalThis.fetch;
  const answer = (status) => { globalThis.fetch = async (url, init) => { asked.push({ url: String(url), body: init?.body }); return new Response(JSON.stringify([{ id: 'u-1' }]), { status }); }; };
  const env = { SUPABASE_URL: 'https://supa.test', SUPABASE_ANON_KEY: 'anon' };
  let done;
  let failed;
  try {
    answer(200);
    done = await RECEIPT.minimiseProfile(env, { userId: 'u-1', jwt: 'jwt' });
    answer(500);
    failed = await RECEIPT.minimiseProfile(env, { userId: 'u-1', jwt: 'jwt' });
  } finally {
    globalThis.fetch = realFetch;
  }
  const patch = JSON.parse(asked[0].body);
  assert.equal(patch.training_opt_in, false, 'the deletion no longer resets the consent flag: the receipt says it does');
  assert.equal(patch.display_name, null, 'the deletion no longer clears the display name');
  assert.equal(done.status, 'erased');
  assert.equal(failed.status, 'failed');

  const UNREAD = /nothing reads|reads? (it|them|the flag) any more|any more|no longer (read|used|consulted)|\bunused\b|never read|(is|are) not read|\bold (consent )?flag\b|consent[^.]*\bwithdrawn/i;
  const profile = RECEIPT.ACCOUNT_RESIDUE.find((r) => r.target.includes('public.profiles'));
  for (const [where, text] of [['the residue entry for the account row', profile.why], ['the step label when the profile was cleared', done.target], ['the step label when it could not be', failed.target]]) {
    assert.doesNotMatch(text, UNREAD, `${where} says or implies nothing reads the consent flag, which the export and the training gate do: "${text}"`);
  }
  assert.match(done.target, /display name cleared, consent flag reset to off/, 'the live step label does not say what the step did to the display name and the flag');
  assert.match(profile.why, /consent flag reset to off/, 'the residue entry does not say the flag was reset to off');
  assert.match(profile.why, /Nothing acts on that flag while the training gate is closed/, 'the residue entry does not say what is true of the flag: nothing acts on it while the gate is closed');
  assert.match(profile.why, /data export still includes it/, 'the residue entry does not admit the export includes the flag');
});

test('what deletion does with the Roblox data is what the code does: revoke first, delete the token, the link last and only when everything else went', () => {
  const grant = erasure.indexOf('revokeStoredRobloxGrant(env, user.userId)');
  const tokens = erasure.indexOf("'roblox_oauth_tokens'");
  const link = erasure.indexOf("`delete from roblox_identities where user_id = ?`");
  const others = erasure.indexOf('const othersFailed = steps.some');
  assert.ok(grant > 0 && tokens > grant && others > tokens && link > others, 'erasure.ts no longer revokes, deletes the token, then deletes the link last');
  assert.match(erasure.slice(others, link), /const holdsLink = othersFailed &&[^;]*robloxLinkHeld/, 'the link is no longer held back while another step has failed');
  for (const [where, text] of BOTH) {
    assert.match(text, /asks? Roblox to withdraw (its|StudPilot's) access/i, `${where} does not say Roblox is asked to withdraw its access`);
    assert.match(text, /If Roblox cannot be reached, our copy (of the token )?is (still )?deleted/i, `${where} does not say what happens when Roblox cannot be reached`);
    assert.match(text, /not offered while Roblox is the only way you sign in/, `${where} does not say Disconnect is not offered to a Roblox-only account`);
    assert.match(text, /log of writes made with it/, `${where} does not say deletion also removes the log of writes made with the key`);
  }
  // WHAT DISCONNECT DOES is held by behaviour in roblox-oauth.test.mjs ("DISCONNECT revokes the grant ...", "... with Roblox unreachable changes nothing",
  // "... keeps the sign-in link while Roblox is the account's only way in", "... with no token left to withdraw"). Here: the pages' claim that the sign-in
  // identity in Supabase is KEPT is true only while Disconnect never calls the Auth admin API.
  const at = oauth.indexOf('export async function disconnectRoblox');
  const disconnect = code(join(WORKER, 'src', 'roblox-oauth.ts')).slice(code(join(WORKER, 'src', 'roblox-oauth.ts')).indexOf('export async function disconnectRoblox'));
  assert.ok(at > 0 && disconnect.length > 500, 'could not read disconnectRoblox out of roblox-oauth.ts');
  const body = disconnect.slice(0, disconnect.indexOf('\nexport ', 20));
  assert.doesNotMatch(body, /\badmin\(/, 'Disconnect now calls the Supabase Auth admin API: the pages say the sign-in identity is kept');
  for (const [where, text] of [...BOTH, ['/terms', TERMS]]) {
    assert.match(text, /sign-in identity[^.]{0,120}(Roblox user id and,? as its display name,? your Roblox username|Roblox user id and username|Roblox user id and\s+username)|Your sign-in identity in Supabase, with your Roblox user id and username, is kept/, `${where} does not say Disconnect keeps the sign-in identity with the Roblox id and username`);
  }
});

test('"Go back" asks Roblox to withdraw, and the pages say it does NOT tell you when Roblox could not be reached exactly while the code does not', () => {
  // declineAccount ignores the result of the revoke and answers `declined: true` either way. The pages say so. The day the answer carries the outcome
  // and the sign-in page shows it, these sentences must change in the same commit (this is the other half of that change, not an obstacle to it).
  const decline = oauth.slice(oauth.indexOf('async function declineAccount'), oauth.indexOf('\n/**', oauth.indexOf('async function declineAccount')));
  assert.ok(decline.length > 300, 'could not read declineAccount out of roblox-oauth.ts');
  assert.match(decline, /revokeAtRoblox\(cfg, token\)/, 'Go back no longer asks Roblox to withdraw the authorization');
  const tells = /jsonReply\(200, \{ declined: true,/.test(decline);
  for (const [where, text] of BOTH) {
    assert.match(text, /asks Roblox to withdraw the authorization that was just given/, `${where} does not say Go back asks Roblox to withdraw the authorization`);
    assert.equal(/does not show you a message about that|you are not shown a message about that/.test(text), !tells,
      tells ? `${where} says Go back shows no message, but the answer now carries the outcome` : `${where} no longer says Go back shows no message when Roblox could not be reached, which the code does not show`);
  }
});

test('"Disconnect is not shown to any account yet" is true only while a Roblox account cannot get a real address and nothing links Roblox to an email account', () => {
  const inserts = WORKER_SRC.flatMap((f) => [...code(f).matchAll(/insert into roblox_identities/g)].map(() => f.slice(WORKER.length + 1)));
  assert.deepEqual(inserts, ['src/roblox-oauth.ts'], 'something else now links a Roblox id to an account');
  const card = read(ROOT, 'apps', 'web', 'src', 'lib', 'roblox-signin.ts');
  assert.match(code(join(ROOT, 'apps', 'web', 'src', 'lib', 'roblox-signin.ts')), /if \(c\.signInOnly\) \{[\s\S]{0,900}canDisconnect: false/, 'the card no longer refuses Disconnect to an account whose only way in is Roblox');
  const emailRow = settingsSrc.slice(settingsSrc.indexOf('<Row id="email-address"'), settingsSrc.indexOf('</Row>', settingsSrc.indexOf('<Row id="email-address"')));
  // The CONTROL's own condition (the text before its first tag) names the Roblox account: the row also mentions it in a note, which is not the form being hidden.
  assert.ok(emailRow.length > 300 && /control=\{[^<]*identity\.roblox[^<]*</.test(emailRow), 'the email-address row no longer hides the change form from a Roblox account: the pages say the app offers no way to add an address');
  assert.ok(card.length > 0);
  for (const [where, text] of [...BOTH, ['/terms', TERMS]]) {
    assert.match(text, /every account that signs in with Roblox|every Roblox account|Today that is every account that signs in with Roblox/, `${where} does not say Disconnect is, today, not available to any Roblox account`);
  }
});

/* ------------------------------------------------------------------------------------ retention --- */

test('the sound and preview windows on the pages are the windows in retention.ts', () => {
  const audioDays = /generatedAudioR2Days: (\d+)/.exec(retention)?.[1];
  const previewSeconds = /generatedImageSeconds: (\d+)/.exec(retention)?.[1];
  assert.ok(audioDays && previewSeconds, 'could not read the media windows out of retention.ts');
  assert.equal(previewSeconds, '3600', 'the preview window is no longer an hour: the pages say one hour');
  // THE 365 DAYS IS A CLAIM ABOUT A SETTING IN A DASHBOARD. Nothing in this repository creates the R2 lifecycle rule or reads it back
  // (audio-store.ts says the same), and R2 does not expire objects by itself, so the pages state the number as the aim and the rule as a setting
  // outside this software, never as something the software does.
  const infra = [...sourceFiles(join(ROOT, 'infra'), ['.mjs', '.ts', '.sh', '.json', '.yml', '.yaml', '.sql']), join(WORKER, 'wrangler.studpilot.jsonc')];
  const LIFECYCLE_RULE = /PutBucketLifecycle|bucket lifecycle|lifecycle (?:add|set|put)|\blifecycle\b[^\n]{0,60}\br2\b|\br2\b[^\n]{0,60}\blifecycle\b/i;
  const creators = infra.filter((f) => LIFECYCLE_RULE.test(code(f)));
  assert.deepEqual(creators.map((f) => f.slice(ROOT.length + 1)), [], 'something in the repository now creates an R2 lifecycle rule: the pages say nothing here creates or checks it. Reword them to say what does, and what checks it');
  assert.ok(infra.length > 10, 'could not read the infra files: this test would check nothing');
  for (const [where, text] of BOTH) {
    assert.match(text, new RegExp(`Generated sound[\\s\\S]{0,500}${audioDays} days`), `${where} must give the ${audioDays}-day aim for generated sound (the R2 window), not an hour`);
    assert.match(text, /one hour on a deployment with no storage bucket/, `${where} does not say the one-hour window belongs to a deployment with no bucket`);
    assert.match(text, /lifecycle rule in StudPilot's Cloudflare account/, `${where} does not say the ${audioDays} days is a rule in the Cloudflare account`);
    assert.match(text, /(setting outside this software|outside this software)/, `${where} does not say the rule is outside this software`);
    assert.match(text, /(nothing here creates it or checks it|neither creates nor checks it)/, `${where} does not admit that nothing in this software creates or checks the rule`);
    assert.doesNotMatch(text, new RegExp(`(kept|saved privately) (privately )?for ${audioDays} days`), `${where} states the ${audioDays} days as a fact`);
  }
});

/* ------------------------------------------------------------------------- the terms, the notice --- */

test('the terms: 13+, Roblox account linking with disconnect, free while in beta, paid plans later, and no link to a page that is going away', () => {
  assert.match(TERMS, /Signing in with Roblox/);
  assert.match(TERMS, /Disconnect Roblox[^.]{0,80}asks Roblox to revoke it, then removes the token and the link StudPilot holds; your sign-in identity, which carries your Roblox user id and username, is kept/, 'the terms do not say what Disconnect revokes, removes and keeps');
  assert.match(TERMS, /free while it is in beta/i);
  assert.match(TERMS, /Paid plans start later/i, 'the terms do not say what the pricing page says: paid plans start later');
  assert.match(TERMS, /Plan & billing tab of your account's Usage and Credits page/, 'the terms no longer point at the page that shows purchase availability');
  for (const [where, text] of [['/privacy', PRIVACY], ['/terms', TERMS]]) {
    assert.doesNotMatch(text, /changelog/i, `${where} still points at the changelog, a page a later lane removes`);
    assert.match(text, /(the date at the top changes)[\s\S]{0,200}(email account holders|tell account holders by email)/, `${where} lost the promise to tell account holders by email before a change takes effect`);
  }
  // The Free allowance quoted is the plan table's, because the page renders it from there.
  assert.match(terms, /\{PLAN_TABLE\.free\.creditsPerDay\} Credits a day/);
  assert.match(terms, /\{PLAN_TABLE\.free\.creditsPerMonth\} a month/);
});

/* ------------------------------------------------------- fix cycle 1: claims the first review found untrue --- */

const rel = (f) => f.slice(WORKER.length + 1);
const BOTH_AND_SETTINGS = [...BOTH, ['Settings > Privacy', prose(settingsSrc.slice(settingsSrc.indexOf('<Row id="analytics-opt-out"'), settingsSrc.indexOf('</Row>', settingsSrc.indexOf('<Row id="analytics-opt-out"'))))]];

test('THE ANALYTICS OPT-OUT COVERS ONLY THE ENTRY FOR EACH REQUEST AND THE ERROR ENTRY FOR A FAILED ONE, every surface says so, and none says a project id is never in the log', () => {
  // The opt-out is applied in ONE place, the /api/* middleware, to the `request` event and to the `error` event that middleware writes for a failed request. The per-run
  // `build` event, every `model_call` event and the `error` event for a chat message that trips the abuse check (scope chat:ingress, written by the Session DO) carry the
  // account id with no consent filter, and are stored beside the request entries for the same 30 days. "Request and error entries" was wrong in the second half: an error
  // entry is not necessarily the one the middleware writes. If a later change routes the others through the same filter, these sentences become wrong in the other
  // direction: reword them then.
  const users = WORKER_SRC.filter((f) => /\banalyticsActorId\(/.test(wcode(f)) && !f.endsWith('analytics-consent.ts')).map(rel);
  assert.deepEqual(users, ['src/index.ts'], 'the consent filter is applied somewhere else now: the pages say it covers only request and error entries');
  assert.equal([...wcode(join(WORKER, 'src', 'index.ts')).matchAll(/\banalyticsActorId\(/g)].length, 1, 'index.ts applies the consent filter more than once: re-read what it now covers');
  const session = wcode(join(WORKER, 'src', 'do', 'session.ts'));
  const build = session.slice(session.indexOf("kind: 'build'"), session.indexOf("kind: 'build'") + 1400);
  assert.ok(build.length > 600 && /actorId:/.test(build) && /projectId:/.test(build) && !/analyticsActorId/.test(build), 'the per-run build event no longer carries the account id and project id unfiltered');
  const gw = wcode(join(WORKER, 'src', 'gateway.ts'));
  const call = gw.slice(gw.indexOf("kind: 'model_call'"), gw.indexOf("kind: 'model_call'") + 500);
  assert.ok(call.length > 300 && /actorId: opts\.actorId/.test(call) && /projectId: opts\.projectId/.test(call), 'the model_call event no longer carries the account id and project id as the pages say');
  // THE ERROR ENTRIES THAT CARRY AN ACCOUNT ID, derived: every `kind: 'error'` call whose actor id is not a literal null. There are two, and only the first is filtered. A third (or a
  // second one that gains the filter) changes what the pages may say, so this is a tripwire on purpose.
  const carrying = [];
  for (const f of WORKER_SRC.filter((f) => !f.endsWith('src/analytics.ts'))) { // analytics.ts defines the event; it does not record one
    const body = wcode(f);
    for (const m of body.matchAll(/kind: 'error'/g)) {
      const next = body.indexOf('recordEvent(', m.index + 10);
      const call = body.slice(m.index, next > 0 ? Math.min(next, m.index + 1500) : m.index + 1500);
      if (/\bactorId(?:,|:\s*(?!\s|null\b))/.test(call)) carrying.push(`${rel(f)} ${/scope: ([^,\n]+),/.exec(call)?.[1] ?? '?'} ${/analyticsActorId/.test(body.slice(Math.max(0, m.index - 1500), m.index)) ? 'filtered' : 'unfiltered'}`);
    }
  }
  assert.deepEqual(carrying.sort(), ["src/do/session.ts 'chat:ingress' unfiltered", 'src/index.ts route filtered'],
    'a different set of error entries carries an account id now: the pages say the switch covers only the request entry and the error entry of a failed request, and that the chat-ingress error entry is outside it');
  const ingress = session.slice(session.indexOf("scope: 'chat:ingress'"), session.indexOf("scope: 'chat:ingress'") + 1600);
  assert.ok(/actorId: who\.actorId/.test(ingress) && /projectId: who\.projectId/.test(ingress) && !/analyticsActorId/.test(ingress), 'the chat-ingress error entry no longer carries the account id and the project id unfiltered');
  assert.match(session, /refuseAbusive\(text, \{ actorId: me\?\.userId \?\? null, projectId: bind\.projectId \}\)/, 'the account id given to the abuse check is no longer the raw one');
  for (const [where, text] of BOTH) {
    assert.match(text, /covers only the entry for each request and the error entry for a request that failed/, `${where} does not say the analytics switch covers only the entry for each request and the error entry for a request that failed`);
    assert.doesNotMatch(text, /covers only those request and error entries/, `${where} still says the switch covers "those request and error entries", which overstates it`);
    assert.match(text, /one entry (for each|per) agent run and one (for each|per) model call/, `${where} does not say the log also holds an entry per agent run and per model call`);
    assert.match(text, /whatever the switch says/, `${where} does not say those entries carry the account id whatever the switch says`);
    assert.match(text, /error entry written when a chat message trips the abuse check[^.]*which carries your account id and the project('s)? id/, `${where} does not say the chat-ingress error entry carries the account id and the project id`);
    assert.doesNotMatch(text, /a project id is never in the log|so no project id is in it|never as the raw path, so a project id/i, `${where} still says no project id is ever in the log`);
  }
  const row = BOTH_AND_SETTINGS[2][1];
  assert.match(row, /covers only the entry for each request and the error entry for a request that failed/, 'the Settings analytics row does not say the switch covers only the request entry and the error entry of a failed request');
  assert.match(row, /one entry for each agent run and each model call, and an error entry for a chat message that trips the abuse check, and those carry your account id/, 'the Settings analytics row does not say run, model-call and chat-ingress entries carry the account id');
  assert.match(row, /Switched on, your account id is kept out of the request entry and the failed-request error entry described above, and nothing else/, 'the Settings line under the switch does not carry the same qualification');
  assert.doesNotMatch(row, /Switched on, your account id is kept out\./, 'the Settings line under the switch is the unqualified one again');
  assert.doesNotMatch(row, /request and error entries only/, 'the Settings analytics row still says "request and error entries only"');
  const exportNote = RECEIPT.ACCOUNT_RESIDUE.find((r) => r.target.includes('AdminDO'));
  assert.match(exportNote.why, /agent-run events/, 'the receipt does not say run events carry the account id');
  assert.match(exportNote.why, /covers only the entry for each request and the error entry for a request that failed/, 'the receipt does not say the analytics opt-out covers only the request entry and the error entry of a failed request');
  assert.match(exportNote.why, /abuse check/, 'the receipt does not say the chat-ingress error entry carries the project id too');
  assert.doesNotMatch(exportNote.why, /covers only the request and error entries/, 'the receipt still says the opt-out covers "the request and error entries"');
  const events = EXPORT.elsewhereFor().find((e) => e.name === 'events');
  assert.match(events.where, /not off the entries for agent runs/, 'the export file still tells the person the request log carries no actor id once analytics are off');
  assert.match(events.where, /leaves it off the entry for each request and the error entry for a request that failed/, 'the export note does not say what the opt-out covers');
  assert.match(events.where, /chat messages that trip the abuse check/, 'the export note does not say the chat-ingress entries are outside the opt-out');
});

test('the exceptions to row-level security are the secret key AND the purpose-token database functions (share links, membership changes), named on both pages; every other query carries a person\'s token', () => {
  const rpcs = [...new Set(WORKER_SRC.flatMap((f) => [...wcode(f).matchAll(/systemRpc(?:<[^>]*>)?\(\s*env,\s*'([a-z_]+)'/g)].map((m) => m[1])))].sort();
  // One serves share-link guests; the four others are the membership outbox (is it ready, claim, acknowledge, fail). The pages name those two purposes.
  assert.deepEqual(rpcs, ['ack_membership_access_outbox', 'claim_membership_access_outbox', 'fail_membership_access_outbox', 'membership_access_outbox_ready', 'project_for_link_grant'],
    'the worker calls a different set of database functions with no person\'s token: the pages name two purposes, share links and membership changes');
  // Every OTHER Postgres REST call carries an Authorization header (the caller's JWT): system-rpc.ts is the declared exception.
  let seen = 0;
  for (const f of WORKER_SRC.filter((f) => !f.endsWith('system-rpc.ts'))) {
    const body = wcode(f);
    for (const m of body.matchAll(/SUPABASE_URL\}\/rest\/v1/g)) {
      seen += 1;
      assert.match(body.slice(Math.max(0, m.index - 700), m.index + 500), /Authorization/, `${rel(f)} calls Postgres REST at offset ${m.index} with no Authorization header: a third way of acting as the worker itself`);
    }
  }
  assert.ok(seen >= 3, `only ${seen} Postgres REST calls were read: this test would check nothing`);
  for (const [where, text] of BOTH) {
    assert.match(text, /Two narrow exceptions exist/i, `${where} does not say there are two exceptions to row-level security (the secret key, and the purpose-token functions)`);
    assert.match(text, /share link/, `${where} does not name the share-link function`);
    assert.match(text, /membership changes/, `${where} does not name the membership function`);
    assert.doesNotMatch(text, /one exception exists|The one exception/i, `${where} still calls the secret key the one exception`);
  }
});

test('WHAT THE OPEN CLOUD KEY IS USED FOR is every scope the app marks implemented, and the stored details and the write log are disclosed with their lifetimes', () => {
  const keySrc = read(ROOT, 'apps', 'web', 'src', 'lib', 'roblox-key.ts');
  const live = [...keySrc.matchAll(/scope: '([a-z.:-]+)',[\s\S]*?implemented: (true|false)/g)].filter((m) => m[2] === 'true').map((m) => m[1]).sort();
  assert.deepEqual(live, ['asset-permissions:write', 'asset:read', 'asset:write', 'game-pass:read', 'game-pass:write', 'universe:read', 'user.inventory-item:read', 'user.social:read'],
    'the set of Open Cloud scopes the product really uses changed: the pages list what the key is used for, so list the change');
  const SAYS = {
    'asset:read': /looking up (the assets you own|your assets)/,
    'user.inventory-item:read': /looking up (the assets you own|your assets)/,
    'universe:read': /an experience/,
    'game-pass:read': /its game passes/,
    'game-pass:write': /creating a game pass/,
    'asset-permissions:write': /(letting another experience, group or person use your assets|granting other people's experiences, groups or accounts use of your assets)/,
    'asset:write': /uploading a file/,
    'user.social:read': /reading your public profile/,
  };
  assert.deepEqual(Object.keys(SAYS).sort(), live, 'a scope has no sentence in this test');
  for (const [where, text] of BOTH) {
    for (const [scope, re] of Object.entries(SAYS)) assert.match(text, re, `${where} does not say the key is used for ${scope}`);
    assert.match(text, /a log of every write it made to your Roblox account/, `${where} does not disclose the log of writes made to the Roblox account`);
    assert.match(text, /Roblox creator id/, `${where} does not disclose the stored creator id`);
    assert.match(text, /the log of writes stays until you delete your account/, `${where} does not say how long the write log is kept`);
    assert.doesNotMatch(text, /Only so StudPilot can upload assets|the only thing that can use it is the uploader/, `${where} still says the key is used only to upload`);
  }
  // THE LIFETIMES, from the code: deleting the key leaves the log; deleting the account removes both.
  const creds = wcode(join(WORKER, 'src', 'user-credentials.ts'));
  const del = creds.slice(creds.indexOf('export async function deleteRobloxCredential'), creds.indexOf('export interface UseResult'));
  assert.ok(del.length > 100 && !/creator_write_log/.test(del), 'deleting the key now touches the write log, or the function was not found: the pages say the log stays until the account is deleted');
  assert.match(wcode(join(WORKER, 'src', 'erasure.ts')), /delete from creator_write_log where user_id = \?/, 'account deletion no longer removes the write log');
  assert.match(wcode(join(WORKER, 'src', 'erasure.ts')), /delete from user_credentials where user_id = \?/, 'account deletion no longer removes the stored key');
});

test('Roblox also receives the Creator Store search words, and the 3D picture goes to a Space that Tencent runs: both are on the pages', () => {
  assert.match(wcode(join(WORKER, 'src', 'creator-store-live.ts')), /apis\.roblox\.com\/toolbox-service\/v2\/assets:search/, 'the live Creator Store search no longer goes to Roblox');
  assert.match(wcode(join(WORKER, 'src', 'tools.ts')), /searchLiveModels\(ctx\.env, query/, 'the agent\'s own words are no longer what is searched');
  assert.match(wcode(join(WORKER, 'src', 'do', 'session.ts')), /liveCreatorStore: true/, 'the live search is no longer on for a real run');
  assert.match(wcode(join(WORKER, 'src', 'hf.ts')), /tencent-hunyuan3d-2\.hf\.space/, 'the 3D route no longer goes to the Tencent Space');
  for (const [where, text] of BOTH) {
    assert.match(text, /Creator Store search[^.]{0,40}(receives|gets) the search words the agent wrote/, `${where} does not say Roblox's Creator Store search receives the agent's search words`);
    assert.match(text, /Space that Tencent runs on Hugging Face/, `${where} does not name who runs the 3D Space`);
  }
});

test('"every AI model request goes through AI Gateway" is not claimed: the Hugging Face and AssemblyAI routes are direct, and the pages say so', () => {
  const hf = wcode(join(WORKER, 'src', 'hf.ts'));
  assert.match(hf, /router\.huggingface\.co/, 'the Hugging Face route moved');
  assert.doesNotMatch(hf, /gatewayOpts|gateway:\s*\{/, 'hf.ts now uses the gateway: the pages say that route is direct');
  const voice = wcode(join(WORKER, 'src', 'voice-transcribe.ts'));
  const at = voice.indexOf('api.assemblyai.com');
  assert.ok(at > 0, 'the AssemblyAI route moved');
  assert.doesNotMatch(voice.slice(Math.max(0, at - 400), at + 400), /gatewayOpts|gateway:\s*\{/, 'the AssemblyAI call now goes through the gateway: the pages say it is direct');
  for (const [where, text] of BOTH) {
    assert.match(text, /do(es)? not go through (Cloudflare )?AI Gateway/, `${where} does not say which model routes bypass AI Gateway`);
    assert.match(text, /Hugging Face[^.]{0,120}AssemblyAI/, `${where} does not name the Hugging Face and AssemblyAI routes as the ones outside AI Gateway`);
    assert.doesNotMatch(text, /Each request StudPilot sends to an AI model goes through|each request to an AI model goes through Cloudflare AI Gateway/i, `${where} still says every model request goes through AI Gateway`);
  }
});

test('WHAT THE EXPORT LEAVES OUT is read from the worker\'s own list, and every kind the worker marks "not offered as a download" is named on both pages', () => {
  const notOffered = EXPORT.elsewhereFor().filter((e) => /^not offered as a/.test(e.where)).map((e) => e.name).sort();
  const SAYS = {
    recovery_requests: /hashed record of account-recovery requests/,
    applied_events: /which payment events and refunds were already applied/,
    applied_refunds: /which payment events and refunds were already applied/,
    billing_authority_replays: /cache of recent billing decisions/,
    events: /the request log/,
    generated_image_tombstones: /deleted project ids held back/,
    'PairingDO storage': /live Studio pairing code/,
    'idem:<keyId>:': /replies saved for your own API keys/,
  };
  assert.deepEqual(Object.keys(SAYS).sort(), notOffered, 'the worker\'s list of stores the export does not offer changed: say so on both pages, then here');
  for (const [where, text] of BOTH) {
    assert.match(text, /The file is not everything, and it lists at the top, store by store, what it leaves out and why/, `${where} does not say the export is not everything`);
    for (const [name, re] of Object.entries(SAYS)) assert.match(text, re, `${where} does not name what the export leaves out for ${name}`);
    assert.match(text, /\bbytes\b/, `${where} does not say bytes stay out`);
    assert.match(text, /branding settings/, `${where} does not say project branding is listed rather than included`);
    assert.doesNotMatch(text, /Two kinds of thing stay out|Two things stay out/, `${where} still says only two kinds of thing stay out`);
  }
});

test('THE WORKSPACE FILES: the export lists them (name, size, date, and the trash) and holds none of their text, and every surface says exactly that', () => {
  // The route the export follows for them is GET /api/projects/:id/files, which answers with `listWorkspace` and the trash. Their rows carry no text field: that is
  // what makes "lists but does not contain their text" true. If a row ever gains one, the file contains the text, and these sentences are wrong in the other direction.
  const tools = wcode(join(WORKER, 'src', 'webtools.ts'));
  const fieldsOf = (name) => [...(new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\}`).exec(tools)?.[1] ?? '').matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
  assert.deepEqual(fieldsOf('WorkspaceFile'), ['path', 'bytes', 'updatedAt'], 'a listed workspace file now carries more than its name, size and date: re-read what the export holds');
  assert.deepEqual(fieldsOf('WorkspaceTrashEntry'), ['path', 'bytes', 'deletedAt', 'expiresAt'], 'a trash entry now carries more than its name, size and dates');
  const index = wcode(join(WORKER, 'src', 'index.ts'));
  const route = index.slice(index.indexOf("app.get('/api/projects/:id/files', "), index.indexOf("app.get('/api/projects/:id/files/content'"));
  assert.ok(route.length > 200 && /listWorkspace\(/.test(route) && /trashOf\(/.test(route) && !/content|readVersionOf|\.read\(/.test(route), 'the files route the export follows now returns something other than the listing and the trash');
  // The worker's own pointers: the text is the zip, the trash is listed with the files, and the history is per path.
  const stores = EXPORT.elsewhereFor();
  assert.match(stores.find((s) => s.name === 'ws:<project>:').where, /files\/archive/, 'the worker no longer points the workspace files at the zip route');
  for (const [where, text] of BOTH) {
    assert.match(text, /The file lists your workspace files \(name, size and date, and the deleted ones in the trash\) but does not contain their text or their earlier versions/, `${where} does not say the export lists the workspace files but not their text`);
    assert.doesNotMatch(text, /history of your workspace files/, `${where} still says only the history of the workspace files is left out`);
    assert.doesNotMatch(text, /snapshots,? and the history of your workspace files|bytes[^.]{0,120}workspace files/, `${where} still files the workspace files under bytes`);
  }
});

test('THE NIGHTLY SWEEP is described as the three stores it runs, and the pages do not say it enforces every dated window', () => {
  const sweeps = [...wcode(join(WORKER, 'src', 'retention-sweep.ts')).matchAll(/results\.push\(await one\('([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(sweeps, ['memory_entries', 'notifications', 'automation_runs'], 'the nightly sweep runs a different set of stores: re-describe it on the data page');
  assert.match(DOCS, /Each window is enforced where the data lives, not by one sweep/);
  assert.match(DOCS, /a nightly sweep removes old notifications, automation runs and remembered facts that have passed their date/);
  assert.doesNotMatch(DOCS, /nightly sweep is what enforces/i, 'the data page still says the nightly sweep enforces the dated windows');
});

test('THE DISCORD LINK, the deletion record and what you wrote on other people\'s projects are disclosed as collected and as surviving deletion, exactly while the erasure does not remove them', () => {
  const link = /interface LinkRecord \{([\s\S]*?)\}/.exec(read(WORKER, 'src', 'discord.ts'))?.[1] ?? '';
  // The record holds the Discord user id, the account id (a stored identifier with a former name, so it is counted, not spelled), the project id and name, and when it was made.
  const fields = [...link.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
  assert.equal(fields.length, 5, `the Discord link record now holds ${fields.join(', ')}: re-describe what is kept`);
  for (const f of ['discordUserId', 'projectId', 'projectName', 'linkedAt']) assert.ok(fields.includes(f), `the Discord link record no longer holds ${f}`);
  for (const [where, text] of BOTH) assert.match(text, /Discord user id, your account id and the id and name of the project/, `${where} does not say what the Discord link holds`);
  const erase = erasure.slice(erasure.indexOf('export async function eraseAccountData'), erasure.indexOf('async function robloxLinkHeld'));
  assert.ok(erase.length > 1500, 'could not read eraseAccountData out of erasure.ts');
  assert.equal(/discord/i.test(erase), false, 'the erasure now touches the Discord link: move the Discord entry out of ACCOUNT_RESIDUE and out of the pages\' survivor lists');
  assert.ok(RECEIPT.ACCOUNT_RESIDUE.some((r) => r.target.includes('DiscordDO')), 'the receipt no longer lists the Discord link as surviving');
  assert.equal(WORKER_SRC.some((f) => /delete from account_deletions/.test(wcode(f))), false, 'something now deletes the deletion record: the pages say it is kept with no end date');
  for (const [where, text] of BOTH) assert.match(text, /kept with your account id(?: and no end date)?/, `${where} does not say the deletion record is kept`);
});

/* ------------------------------------------------------------- no blanket promise anywhere in the product --- */

/**
 * THE BLANKET PROMISE, IN ANY WORDS. The owner's rule (plan section 7) is: Roblox data is never used for AI training; improvement
 * data is anonymised, opt-out and not collected yet. So a sentence that denies training, without being about Roblox data, is the
 * retracted promise coming back, whatever its wording: "never trains", "does not train", "are not used to train", "won't be used
 * for training", "no training on your projects". The first version of this scan needed the word "never" before "train" and so
 * passed both the Settings sentence this lane removed ("not used to train models") and "We do not train on your projects".
 *
 * A NEGATOR within ninety characters before the train word (or forty after it) makes it a denial; a sentence that is about Roblox
 * data is allowed, unless it goes on to name the customer's own work after the Roblox mention ("Roblox data and your projects are
 * never used to train" is the blanket promise with Roblox in front of it). A block that carries its own retraction
 * (`release__since`, "Since replaced") may quote the old promise: the changelog records what was announced and corrects it in the
 * open, the same convention tests/promises-match-the-product.test.mjs applies to the withdrawn queue priority.
 */
const TRAIN_WORD = /\btrain(?:s|ed|ing)?\b/i;
const NEGATOR = /\b(?:never|not|no|without|cannot)\b|n[’']t\b/i;
const CUSTOMER_WORK_AFTER_ROBLOX = /projects?|chats?|prompts?|checkpoints?|customer|private|your (?:work|code|content|data)/i;
const RETRACTED_HERE = /release__since|Since (?:replaced|withdrawn)/i;
const OLD_BLANKET = [/never\s+trains?\b/i, /never\s+used\s+to\s+train/i, /no\s+fine-print\s+exception/i];
/** The old promise's second sentence has no train word of its own: "There is no fine-print exception." */
const FINE_PRINT = /no\s+fine-print\s+exception/i;

/** The sentences in `src` that deny training without being about Roblox data. `src` has had its comments removed. */
export function blanketTrainingSentences(src) {
  const found = [];
  for (const block of src.split(/<\/li>|<\/p>|\n\s*\n/)) {
    if (RETRACTED_HERE.test(block)) continue;
    const text = block.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ');
    for (const sentence of text.split(/(?<=[.!?])\s/)) {
      const t = TRAIN_WORD.exec(sentence);
      if (!t && !FINE_PRINT.test(sentence)) continue;
      const near = t ? sentence.slice(Math.max(0, t.index - 90), t.index + t[0].length + 40) : sentence;
      const denies = NEGATOR.test(near) || OLD_BLANKET.some((re) => re.test(sentence));
      if (!denies) continue;
      const roblox = sentence.lastIndexOf('Roblox');
      const aboutRobloxOnly = roblox !== -1 && !CUSTOMER_WORK_AFTER_ROBLOX.test(sentence.slice(roblox + 'Roblox'.length));
      if (!aboutRobloxOnly) found.push(sentence.trim().slice(0, 120));
    }
  }
  return found;
}

test('NO BLANKET "NEVER TRAINS" REMAINS in apps/site/src, apps/web/src, packages/shared/src or apps/site/public, in any wording: a sentence that denies training is about Roblox data', () => {
  const files = [
    ...sourceFiles(join(SITE, 'src'), ['.astro', '.ts', '.tsx', '.md', '.js']),
    ...sourceFiles(join(ROOT, 'apps', 'web', 'src'), ['.ts', '.tsx']),
    ...sourceFiles(join(ROOT, 'packages', 'shared', 'src'), ['.ts']),
    ...sourceFiles(join(SITE, 'public'), ['.txt', '.html', '.md', '.json', '.webmanifest']),
  ];
  assert.ok(files.length > 100, `only ${files.length} source files were read`);
  const offenders = [];
  for (const f of files) for (const sentence of blanketTrainingSentences(code(f))) offenders.push(`${f.slice(ROOT.length + 1)}: "${sentence}"`);
  assert.deepEqual(offenders, [], 'a blanket no-training promise is back; the owner\'s rule is Roblox data never, improvement data opt-out and not collected yet');
  // The scan found the Roblox sentences it must allow, so it is reading the pages it is meant to read.
  assert.ok(blanketTrainingSentences(code(join(SITE, 'src', 'pages', 'privacy.astro')).replace(/Roblox/g, 'Acme')).length >= 2,
    'the scan read no training sentence out of the privacy page: it would pass on any page');
});

test('the never-trains scan can fail: it catches the old wordings, the Settings sentence this lane removed, and phrasings with no "never"', () => {
  const MUST_FLAG = [
    'Private projects are never used to train models.',
    'Your private project data is never used to train AI models.',
    // The sentence the Settings row carried before this lane removed it: no "never" before "train".
    'Your projects, your prompts and the code StudPilot writes for you are yours. They are not used to train models.',
    'We do not train on your projects, chats or checkpoints, and we never will.',
    'Your chats won’t be used to train anything.',
    "Your code won't be used for training.",
    'No training on your projects.',
    'StudPilot does not train on customer work.',
    'There is no fine-print exception.',
    // Roblox in front of the customer's own work is still the blanket promise.
    'Roblox data and your projects are never used to train models.',
  ];
  for (const sentence of MUST_FLAG) assert.equal(blanketTrainingSentences(`<p>${sentence}</p>`).length > 0, true, `not caught: ${sentence}`);
  const MUST_ALLOW = [
    'Data that comes from Roblox is never used for AI training.',
    'Roblox data is never used for AI training, as set out above, whatever else this section says.',
    'Your projects stay yours, and data that comes from Roblox is never used for AI training.',
    'Improvement data is anonymised, is opt-out, and never includes data from Roblox, an Open Cloud key, credentials or payment details.',
    'Settings gives you a switch to opt out of improvement data.',
  ];
  for (const sentence of MUST_ALLOW) assert.deepEqual(blanketTrainingSentences(`<p>${sentence}</p>`), [], `wrongly flagged: ${sentence}`);
  // A block that retracts the old promise in the same breath may quote it (the changelog's convention); the same sentence alone may not.
  const quoted = '<li>Private projects are never used to train models. <span class="release__since">Since replaced: see the Privacy Policy.</span></li>';
  assert.deepEqual(blanketTrainingSentences(quoted), []);
  assert.equal(blanketTrainingSentences('<li>Private projects are never used to train models.</li>').length, 1);
});
