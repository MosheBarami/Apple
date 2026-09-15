/**
 * WHO ACTUALLY CALLS notify(), AND WHETHER ANY KIND HAS NOBODY.
 *
 * notifications.ts is exhaustively tested as a POLICY — what a kind means, when it defers, how it
 * dedupes, where it links. notification-store.ts is exhaustively tested as a STORE. Between the
 * two there was no test at all of the thing that joins them to the product: the call sites. A
 * refactor of `finishRun` that dropped the emit would have turned nothing red, and the subsystem
 * would have carried on passing two hundred assertions about notifications nobody was creating.
 *
 * SOURCE-LEVEL, and that is a deliberate limit rather than a shortcut. `do/session.ts` is a Durable
 * Object with a run loop, a socket and a quota DO behind it; standing all of that up to observe one
 * `waitUntil` would be a harness with more ways to be wrong than the line it watches. The same
 * technique is already used by notifications.test.mjs:177, which reads apps/web's router to prove
 * the deep links land on routes that exist. What it can prove is that the emit is still there, with
 * the right kind, the right recipient and the right dedupe subject; what it cannot is that the
 * branch is reached, which is what the route-level tests in collab-routes.test.mjs do for the two
 * emitters that have an HTTP surface.
 *
 * THE LAST TEST IS THE ONE THAT MATTERS MOST: every kind the policy declares is either produced
 * somewhere in this tree, or is named here as having no producer. A fully-specified notification
 * type that nothing can create is dead weight that reads as a feature — preference key, dedupe,
 * deep link and delivery timing all working, for something that will never exist.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(WORKER, 'src');

const read = (...p) => readFileSync(join(SRC, ...p), 'utf8');
const session = read('do', 'session.ts');
const index = read('index.ts');
const specs = read('notifications.ts');

/** Every .ts under src, so "nothing emits this kind" is a claim about the whole tree. */
function sources(dir = SRC, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** Source with comments stripped: a kind discussed in prose is not a kind anybody emits. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ------------------------------------------------------- a run finishing, and failing --- */

test('a finished run still tells the person who started it, and a failed one says so', () => {
  // do/session.ts:finishRun. The ONLY thing this product had was a msg_end frame to a tab that
  // happened to be open — close it and the outcome was not delayed, it was gone. This is the line
  // that closes that, and a refactor of finishRun must not quietly drop it.
  const body = code(session);
  const emit = /notify\(this\.env, \{\s*kind: failed \? 'run_failed' : 'run_complete',([\s\S]{0,600}?)\}\)/.exec(body);
  assert.ok(emit, 'finishRun no longer emits run_complete / run_failed');
  assert.match(emit[1], /recipientId: agent\.userId/, 'the run outcome must go to the person who started it');
  // The run id as the dedupe subject is what makes two failures of ONE run one line with a count,
  // and two different runs two rows. notification-store.test.mjs:143 pins the store side of that;
  // this pins that the emitter supplies the key which makes it true.
  assert.match(emit[1], /subject: agent\.msgId/, 'the run id is the dedupe subject');
  assert.match(emit[1], /projectId: this\.boundProjectId/, 'a project-scoped kind with no project is refused as no_target');
});

test('the failure branch is the three reasons that are failures, and not the one that is not', () => {
  // 'stopped' is the user pressing stop. Reporting that back to the person who pressed it is the
  // product telling them what they just did.
  const body = code(session);
  assert.match(
    body,
    /const failed = reason === 'error' \|\| reason === 'incomplete' \|\| reason === 'quota'/,
    'the failure branch moved; run_failed may now fire for a deliberate stop, or not at all',
  );
});

test('the run notification is best-effort, so a slow inbox cannot take down a finished run', () => {
  const body = code(session);
  assert.match(body, /waitUntil\(outcome\)/, 'the emit must stay off the critical path');
});

/* ---------------------------------------------------------------- running out of credits --- */

test('the run that spends the last Credits says so, once per day per band', () => {
  // Before this, the only way to learn was to look at the meter — the same "only while watching"
  // gap the run outcome had. The DAY and the BAND in the subject are what stop the eleven runs
  // after the crossing from being eleven notifications.
  const body = code(session);
  const emit = /notify\(this\.env, \{\s*kind: 'usage_threshold',([\s\S]{0,900}?)at: Date\.now\(\),/.exec(body);
  assert.ok(emit, 'nothing emits usage_threshold any more');
  assert.match(emit[1], /recipientId: agent\.userId/);
  assert.match(emit[1], /subject: `usage:\$\{dayKey\([\s\S]*?\}:\$\{band\}`/, 'the day and the band are the dedupe subject');
  assert.match(body, /usageBand\(state\.creditsRemaining, state\.creditsDaily\)/, 'the band must come from the shared threshold');
  assert.match(body, /band !== 'fine'/, 'a healthy balance must not notify');
});

test('the balance is read after the last settlement, or the figure reported is the old one', () => {
  const body = code(session);
  const order = body.indexOf("kind: 'usage_threshold'");
  const outcome = body.indexOf("kind: failed ? 'run_failed' : 'run_complete'");
  assert.ok(outcome > 0 && order > outcome, 'the usage check must come after the run outcome and its settlement');
});

/* ------------------------------------------------------------------- security events --- */

test('the seven routes that change a credential or a membership all tell the account holder', () => {
  // securityNotice exists at ONE place and is called at seven. A route that stopped calling it
  // would leave a security log nobody is told about, which is a security log nobody reads on the
  // day something is wrong.
  //
  // IT WAS FIVE. Connecting a Roblox account — a credential that can create things in somebody's
  // real Roblox account, permanently — fired nothing at all, while minting an Apple API key fired
  // one. The count moving is the point of pinning it: adding a credential route and not telling
  // the account holder about it should be a decision somebody makes on purpose, in this file.
  const body = code(index);
  assert.match(body, /function securityNotice\(/, 'securityNotice is gone');
  assert.match(body, /kind: 'security_event'/, 'securityNotice no longer emits the security kind');
  const calls = [...body.matchAll(/\bsecurityNotice\(/g)].length - 1; // minus the declaration
  assert.equal(
    calls,
    7,
    `expected the seven call sites (mint, rotate, revoke, invite, remove, roblox connect, roblox disconnect); found ${calls}`,
  );
});

test('a key event is keyed on the key and a membership event on the pair, so repeats coalesce', () => {
  const body = code(index);
  assert.ok(
    [...body.matchAll(/`key:\$\{[^`]*\}`/g)].length >= 3,
    'the three key routes must each name the key as the dedupe subject',
  );
  assert.ok(
    [...body.matchAll(/`member:\$\{ctx\.project\.id\}:\$\{userId\}`/g)].length >= 2,
    'the two membership routes must key on project+member',
  );
});

test('the membership notice goes to the OWNER, not to the person who was added or removed', () => {
  // Who can reach a place is the owner's business. The invitee finds out by the project appearing
  // in their list, which is the arrival they actually care about.
  const body = code(index);
  const sites = [...body.matchAll(/securityNotice\(\s*c,\s*([A-Za-z_.]+),/g)].map((m) => m[1]);
  assert.equal(sites.length, 7, `could not read all seven call sites; read ${JSON.stringify(sites)}`);
  assert.deepEqual(
    sites.filter((s) => s === 'ctx.project.owner_id').length,
    2,
    'the two membership routes must address the project owner',
  );
  // Three Apple keys and two Roblox connection events, all addressed to the person on the token —
  // never to an id read off a body, which would be a way to post alarming sentences into anybody's
  // account history.
  assert.deepEqual(sites.filter((s) => s === 'user.userId').length, 5, 'the credential routes address the key owner');
});

test('a notification that cannot be delivered does not fail the security action it reports', () => {
  // The key WAS minted; the member WAS removed. And `c.executionCtx` THROWS rather than returning
  // undefined when the worker was invoked without one, which once turned an API-key mint into a
  // 500 — a security notice taking down the security action.
  const body = code(index);
  const fn = /function securityNotice\([\s\S]*?\n\}/.exec(body);
  assert.ok(fn, 'could not read securityNotice');
  assert.match(fn[0], /\.catch\(/, 'a failed delivery must not reject into the route');
  assert.match(fn[0], /try \{[\s\S]*executionCtx\.waitUntil[\s\S]*\} catch/, 'executionCtx must be reached for inside a try');
});

/* ------------------------------------------------------------------- the billing alarm --- */

test('the Stripe webhook still emits the only billing alarm the product has', () => {
  const body = code(index);
  const emit = /notify\(c\.env, \{\s*kind: 'billing_issue',([\s\S]{0,400}?)\}\)/.exec(body);
  assert.ok(emit, 'the dunning path no longer notifies');
  assert.match(emit[1], /recipientId: dunning\.userId/);
  // The field was `invoiceId` when this was written and is now `subjectId`: the module grew a
  // fourth kind, `checkout_expired`, whose subject is a Checkout Session rather than an invoice,
  // and a field called `invoiceId` holding `cs_…` is the kind of mislabelling that reads correctly
  // and is wrong. The property asserted here is unchanged — the notice dedupes on WHAT IT IS
  // ABOUT, so three Stripe retries of one invoice are one problem and one line with a count.
  assert.match(emit[1], /subject: dunning\.subjectId \?\? dunning\.eventId/, 'three retries of one invoice are one problem');
});

/* -------------------------------------------------- every kind, and who can produce it --- */

/** The kinds the policy declares, read from its own allowlist. */
function declaredKinds() {
  const block = /export const NOTIFICATION_KINDS = \[([\s\S]*?)\] as const;/.exec(specs);
  assert.ok(block, 'could not find NOTIFICATION_KINDS — this test is measuring nothing');
  const kinds = [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(kinds.length >= 5, `only scraped ${kinds.length} kinds — the scrape is broken`);
  return kinds;
}

/**
 * Kinds that are declared and that NOTHING IN THIS TREE CAN CREATE.
 *
 * Listed rather than tolerated. Each of these has a preference key a person can switch, a dedupe
 * rule, a deep link and a delivery schedule — the entire apparatus of a notification, for something
 * that will never be written. This list is allowed to shrink; it must never grow silently, which is
 * what the assertion below is for.
 */
const NO_EMITTER = [
  // Nothing in roblox-upload.ts, asset-import.ts, user-credentials.ts or gateway.ts passes this
  // kind to notify(), so an Open Cloud publish rejected for a dead key still tells nobody.
  'integration_failure',
  // 'automation_failed' WAS HERE AND IS NOT ANY MORE. When this test was written there was no
  // scheduled-job runner, so the kind was apparatus for an event nothing could raise; the
  // automation runner in index.ts now notifies the project owner on a fire that did not start,
  // keyed on the EXECUTION rather than the automation. The list shrank, which is the direction it
  // is allowed to move — leaving the entry in would have made this file assert that a working
  // emitter does not exist.
];

test('every kind either has a producer, or is named here as having none', () => {
  const files = sources();
  assert.ok(files.length > 20, `only found ${files.length} source files — the scan is broken`);
  const tree = files
    .filter((f) => !f.endsWith('notifications.ts') && !f.endsWith('notification-store.ts'))
    .map((f) => code(readFileSync(f, 'utf8')))
    .join('\n');

  const unproduced = declaredKinds().filter((kind) => !tree.includes(`'${kind}'`));
  assert.deepEqual(
    unproduced.sort(),
    [...NO_EMITTER].sort(),
    'a kind gained or lost a producer — if this is a new emitter, take the kind out of NO_EMITTER; ' +
      'if a producer was deleted, the kind is now a switch that controls nothing',
  );
});

test('the emitterless list is not simply everything, which would make the test above vacuous', () => {
  // F-64: a scan that matches nothing reports "nothing missing". Most kinds must be produced.
  const kinds = declaredKinds();
  assert.ok(NO_EMITTER.length < kinds.length / 2, 'more than half the kinds have no producer — that is the finding, not the baseline');
  for (const kind of NO_EMITTER) assert.ok(kinds.includes(kind), `${kind} is not a kind at all any more`);
});
