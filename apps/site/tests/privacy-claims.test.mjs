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
 * `collectLog: true`, and named five recipients of data where the worker's source calls fifteen hosts. So this half derives from
 * the source and fails when the two disagree, in the direction that matters (the page says something the code does not do):
 *
 *   THE ROBLOX DATA LIST IS THE COLUMNS THE CODE STORES, read from the CREATE TABLE statements, and every column is accounted
 *   for. A column added later with no sentence fails here.
 *   THE SUPABASE SECRET KEY IS DESCRIBED BY WHAT IT DOES: the Auth admin calls are read out of roblox-oauth.ts.
 *   EVERY HOST THE WORKER CALLS IS CLASSIFIED: a recipient of user data (named on both pages) or public content (listed here).
 *   EVERY RESIDUE ENTRY IS ACKNOWLEDGED on both pages, not just the two the first version of this file knew.
 *   THE MODEL-CALL LOG IS DISCLOSED WHILE THE CODE COLLECTS IT.
 *   13 AND OLDER, NO PARENT'S PERMISSION; NO CLAIM THAT SIGN-UP ASKS FOR A BIRTH DATE WHILE IT DOES NOT.
 *   NO BLANKET "NEVER TRAINS" ANYWHERE IN THE PRODUCT'S SOURCE: the owner's rule is Roblox data never, improvement data opt-out and
 *   not collected yet. A sentence about "never" and "train" must be about Roblox.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  for (const [where, text] of BOTH) for (const word of scope.split(' ')) assert.ok(text.includes(word), `${where} does not name the "${word}" permission`);
  assert.ok(!/asset:(read|write)/.test(code(join(WORKER, 'src', 'roblox-oauth.ts'))), 'the code asks for an asset scope, which the pages say it does not');
});

test('what is held outside those two tables is on the pages too: the placeholder address, the five-minute hold, the ten-minute confirmation', () => {
  const domain = /const SYNTHETIC_EMAIL_DOMAIN = '([^']+)'/.exec(oauth)?.[1];
  const hold = Number(/const HANDLE_TTL_SECONDS = (\d+)/.exec(oauth)?.[1]);
  const window = Number(/const REAUTH_WINDOW_MS = (\d+) \* 60_000/.exec(oauth)?.[1]);
  const WORDS = { 5: 'five', 10: 'ten' };
  assert.ok(domain && hold && window, 'could not read the address domain, the hold or the window out of roblox-oauth.ts');
  assert.ok(WORDS[hold / 60] && WORDS[window], `no word for ${hold / 60} or ${window} minutes: extend WORDS`);
  for (const [where, text] of BOTH) {
    assert.ok(text.includes(domain), `${where} does not name the placeholder address domain ${domain}`);
    // ANCHORED to the sentence each number belongs to: the two numbers are both minutes, and a bare "ten minutes" would satisfy either.
    assert.ok(new RegExp(`up to ${WORDS[hold / 60]} minutes`, 'i').test(text), `${where} does not say a first sight is held for up to ${WORDS[hold / 60]} minutes`);
    assert.ok(new RegExp(`good for ${WORDS[window]} minutes`, 'i').test(text), `${where} does not say a confirmation is good for ${WORDS[window]} minutes`);
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
  assert.match(oauth, /async function wipeDeadGrant[\s\S]{0,500}delete from roblox_oauth_tokens where user_id = \? and version = \? and generation = \?/);
  const at = oauth.indexOf('export async function refreshRobloxAccessToken');
  const refresh = oauth.slice(at, oauth.indexOf('\nexport ', at + 10));
  assert.match(refresh, /if \(await robloxSaysGrantGone\(res\)\) \{\s*await wipeDeadGrant\(env, userId, row\);/, 'the refresh no longer wipes the token when Roblox says the grant is gone');

  // THE LIMITATION THE PAGES ADMIT IS TRUE ONLY WHILE NOTHING CALLS THE REFRESH. The day M5c calls it, "nothing uses it yet" is false and must go.
  const callers = WORKER_SRC.filter((f) => !f.endsWith('roblox-oauth.ts') && /refreshRobloxAccessToken/.test(code(f)));
  assert.deepEqual(callers, [], 'something now calls refreshRobloxAccessToken: the pages still say nothing uses the Roblox token yet. Reword them, and say what the connection is used for');
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
  const RULE = 'never includes data from Roblox, an Open Cloud key, credentials or payment details';
  const NOT_ACTIVE = 'Collection is not active yet';
  const inApp = prose(settingsSrc.slice(settingsSrc.indexOf('<Row id="improvement-opt-out"'), settingsSrc.indexOf('</Row>', settingsSrc.indexOf('<Row id="improvement-opt-out"'))));
  assert.ok(inApp.length > 200, 'could not read the improvement-data row out of settings.tsx: this test would check nothing');
  for (const [where, text] of [...BOTH, ['Settings > Privacy', inApp]]) {
    assert.ok(text.includes(RULE), `${where} does not state the rule: "${RULE}"`);
    assert.ok(text.includes(NOT_ACTIVE), `${where} does not say "${NOT_ACTIVE}"`);
    assert.match(text, /anonymised/, `${where} does not say anonymised`);
    assert.match(text, /opt-out|opt out/i, `${where} does not say opt-out`);
  }
  for (const [where, text] of BOTH) {
    assert.match(text, /Before (collection|it) starts,? (we will email|every account holder is emailed)/, `${where} does not promise to email account holders first`);
    // ANCHORED to the promise: "no email address" is also said elsewhere on both pages, so a bare match proves nothing about THIS sentence.
    assert.match(text, /Before (collection|it) starts,? (we will email every account holder|every account holder is emailed)[\s\S]{0,260}no email address/, `${where} says account holders are emailed without saying that a Roblox-only account has no email address`);
    assert.match(text, /Settings → Privacy → (<strong>)?Improvement data/, `${where} does not say where the opt-out is`);
  }
  // "Not active" is a claim about code: the gate that would process customer work is closed.
  assert.match(gate, /export const CUSTOMER_WORK_TRAINING_ENABLED = false;/, 'the gate is open while the pages say collection is not active');
  // And the old claims that this replaced are gone from the pages.
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
    'tencent-hunyuan3d-2.hf.space': 'Hugging Face', 'thumbnails.roblox.com': 'Roblox', 'worker.invalid': 'Sentry',
  };
  const PUBLIC = new Set(['asset-library.internal', 'model-library.internal', 'create.roblox.com', 'game-icons.net', 'polyhaven.com', 'github.com', 'studpilot.app']);
  const seen = new Set();
  for (const f of WORKER_SRC) for (const m of code(f).matchAll(/https:\/\/([a-z0-9][a-z0-9.-]*\.[a-z]{2,}|[a-z0-9.-]+\.(?:internal|invalid))/gi)) seen.add(m[1].toLowerCase());
  assert.ok(seen.size >= 15, `only ${seen.size} hosts were read out of the worker: this test would check nothing`);
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

test('EVERY ENTRY OF THE DELETION RESIDUE is acknowledged on both pages, and the Roblox data that stays is in the receipt too', () => {
  const at = erasure.indexOf('export const ACCOUNT_RESIDUE');
  const block = erasure.slice(at, erasure.indexOf('];', at));
  const targets = [...block.matchAll(/target: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(targets.length >= 9, `only ${targets.length} residue entries were read out of erasure.ts`);
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
  ];
  for (const target of targets) {
    assert.ok(ACKNOWLEDGED_AS.some(([key]) => target.includes(key)), `the receipt lists "${target}" as surviving a deletion and this test knows no sentence for it: add one to the pages, then here`);
  }
  for (const [key] of ACKNOWLEDGED_AS) assert.ok(targets.some((t) => t.includes(key)), `"${key}" is no longer in the residue: the pages still say it survives`);
  for (const [where, text] of BOTH) {
    for (const [key, re] of ACKNOWLEDGED_AS) assert.match(text, re, `${where} does not acknowledge what ${key} keeps after a deletion`);
    assert.doesNotMatch(text, /two things (survive|outlive)/i, `${where} still says only two things survive a deletion`);
    assert.match(text, /Roblox user id and username/, `${where} does not say a Roblox account's sign-in identity still holds the Roblox id and username`);
  }
  // The page says it because the receipt does: the sign-in identity entry names the Roblox data.
  assert.match(block, /still holds your Roblox user id and\s+' \+\s+'username/, 'the receipt no longer says a Roblox account still holds the id and username');
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
  }
  // Disconnect deletes nothing unless Roblox confirms, and keeps the link for a Roblox-only account: both read out of the code.
  const disconnect = oauth.slice(oauth.indexOf('export async function disconnectRoblox'));
  assert.match(disconnect, /if \(!\(await revokeAtRoblox\(cfg, token\)\)\) \{[\s\S]{0,300}return \{ status: 502/);
  assert.match(disconnect, /const linkRemoved = onlyWayIn\s*\? false/);
});

/* ------------------------------------------------------------------------------------ retention --- */

test('the sound and preview windows on the pages are the windows in retention.ts', () => {
  const audioDays = /generatedAudioR2Days: (\d+)/.exec(retention)?.[1];
  const previewSeconds = /generatedImageSeconds: (\d+)/.exec(retention)?.[1];
  assert.ok(audioDays && previewSeconds, 'could not read the media windows out of retention.ts');
  assert.equal(previewSeconds, '3600', 'the preview window is no longer an hour: the pages say one hour');
  for (const [where, text] of BOTH) {
    assert.ok(new RegExp(`Generated sound[^.]{0,80}${audioDays} days`).test(text), `${where} must say generated sound is kept ${audioDays} days (the R2 window), not an hour`);
    assert.match(text, /one hour on a deployment with no storage bucket/, `${where} does not say the one-hour window belongs to a deployment with no bucket`);
    assert.match(text, /lifecycle rule/, `${where} does not admit the ${audioDays} days is a dashboard rule the code cannot see`);
  }
});

/* ------------------------------------------------------------------------- the terms, the notice --- */

test('the terms: 13+, Roblox account linking with disconnect, free while in beta, paid plans later, and no link to a page that is going away', () => {
  assert.match(TERMS, /Signing in with Roblox/);
  assert.match(TERMS, /Disconnect Roblox[^.]{0,80}asks Roblox to revoke it/, 'the terms do not say Disconnect revokes the grant at Roblox');
  assert.match(TERMS, /free while it is in beta/i);
  assert.match(TERMS, /Paid plans start later/i, 'the terms do not say what the pricing page says: paid plans start later');
  assert.match(TERMS, /Plan & billing tab of your account's Usage and Credits page/, 'the terms no longer point at the page that shows purchase availability');
  for (const [where, text] of [['/privacy', PRIVACY], ['/terms', TERMS]]) {
    assert.doesNotMatch(text, /changelog/i, `${where} still points at the changelog, a page a later lane removes`);
    assert.match(text, /(the date at the top changes)[\s\S]{0,200}email account holders/, `${where} lost the promise to email account holders before a change takes effect`);
  }
  // The Free allowance quoted is the plan table's, because the page renders it from there.
  assert.match(terms, /\{PLAN_TABLE\.free\.creditsPerDay\} Credits a day/);
  assert.match(terms, /\{PLAN_TABLE\.free\.creditsPerMonth\} a month/);
});

/* ------------------------------------------------------------- no blanket promise anywhere in the product --- */

test('NO BLANKET "NEVER TRAINS" REMAINS in apps/site/src or apps/web/src: a sentence with "never" and "train" is about Roblox data', () => {
  const files = [...sourceFiles(join(SITE, 'src'), ['.astro', '.ts', '.tsx', '.md', '.js']), ...sourceFiles(join(ROOT, 'apps', 'web', 'src'), ['.ts', '.tsx'])];
  assert.ok(files.length > 100, `only ${files.length} source files were read`);
  const BANNED = [/never\s+trains?\b/i, /never\s+used\s+to\s+train/i, /no\s+fine-print\s+exception/i];
  const offenders = [];
  for (const f of files) {
    const body = code(f).replace(/\s+/g, ' ');
    for (const re of BANNED) if (re.test(body)) offenders.push(`${f.slice(ROOT.length + 1)}: ${re}`);
    for (const sentence of body.split(/(?<=[.!?])\s/)) {
      if (/\bnever\b[^.!?]*\btrain/i.test(sentence) && !/Roblox/.test(sentence)) offenders.push(`${f.slice(ROOT.length + 1)}: "${sentence.slice(0, 90)}"`);
    }
  }
  assert.deepEqual(offenders, [], 'a blanket never-train promise is back; the owner\'s rule is Roblox data never, improvement data opt-out and not collected yet');
  // And it can fail: the scanner finds the sentence the old page carried.
  const old = 'Your private project data is never used to train AI models.';
  assert.ok(BANNED.some((re) => re.test(old)), 'the scanner would not have caught the old promise');
});
