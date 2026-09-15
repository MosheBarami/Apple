/**
 * THE OPERATOR'S TWO MISSING HALVES: an account he can look up, and a pause he cannot press by
 * accident.
 *
 * ACCOUNT LOOKUP. The worker now serves `GET /api/admin/account/:userId` — the plan, the
 * subscription, the individual credit charges and this account's own usage window. A route with no
 * caller is this repository's named defect, and it hides from every test that reads the route in
 * isolation, because the route was never wrong. What is wrong is that no path through the app
 * arrives at it. The person who runs this business does not use curl: for him, a route the admin
 * page does not call is a feature that does not exist.
 *
 * CONFIRMATION. `lib/confirm-model.ts` grades ceremony from consequence and has been fully built
 * and fully tested since it landed — and not one administrative action used it. The admin page's
 * three spend controls sat bare: one click on "Stop all AI generation" halts every build in flight
 * for every customer, and one stray click on "Double the caps" doubles the worst-case bill this
 * business can run up in a month. Meanwhile "Resume" and "Halve the caps" are reversible and cost
 * nothing, and putting a dialog in front of THOSE is the other half of the same mistake — it
 * teaches the operator that dialogs mean nothing, which is the training you least want him to have
 * when the expensive one appears.
 *
 * Structural, because apps/web has no DOM renderer — the same bargain members-panel-wiring.test.mjs
 * makes, and for the same reason. The ceremony decisions themselves are a pure module, so those are
 * executed rather than grepped.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(WEB, ...p), 'utf8');
/** Source with comments stripped: a call named in prose is not a call. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ADMIN = read('src', 'routes', 'admin.tsx');
const ADMIN_CODE = code(ADMIN);
const API = read('src', 'lib', 'api.ts');
const CSS = [read('src', 'styles.css'), read('src', 'styles', 'global.css')].join('\n');

// Bundled rather than imported directly: admin-actions.ts imports ./confirm-model without an
// extension, which the app's bundler resolves and Node's type-stripping loader does not. esbuild
// lives in the worker's node_modules — the same path every other web test that needs it uses.
const OUT = join(mkdtempSync(join(tmpdir(), 'admin-actions-')), 'admin-actions.mjs');
execFileSync(
  join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(WEB, 'src', 'lib', 'admin-actions.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + OUT],
  { stdio: 'pipe' },
);
const { adminSpendCeremony, ADMIN_SPEND_ACTIONS } = await import(`file://${OUT}`);
const { confirmationFor } = await import('../src/lib/confirm-model.ts');

// ------------------------------------------------------------- the ceremony ladder ---

test('STOPPING ALL AI GENERATION STOPS FOR A DIALOG — it is irreversible for anyone mid-build', () => {
  assert.equal(adminSpendCeremony('kill'), 'dialog');
});

test('RAISING THE SPEND CAPS STOPS FOR A DIALOG — it is the one control that can cost money', () => {
  // Reversible, destroys nothing, and doubles the ceiling on the monthly bill. Money is worth a
  // beat even when it can be undone.
  assert.equal(adminSpendCeremony('raise'), 'dialog');
});

test('RESUMING DOES NOT — a reversible action behind a dialog teaches the operator to dismiss them', () => {
  assert.equal(adminSpendCeremony('resume'), 'none');
});

test('TIGHTENING THE CAPS DOES NOT — it is reversible, destroys nothing and spends nothing', () => {
  assert.equal(adminSpendCeremony('tighten'), 'none');
});

test('the verdicts come from confirmationFor rather than being written out by hand', () => {
  // The point of the model is that one function decides. A table of hard-coded strings here would
  // pass these tests and drift from every other confirmation in the product the first time the
  // ladder changed.
  for (const [name, consequence] of Object.entries(ADMIN_SPEND_ACTIONS)) {
    assert.equal(adminSpendCeremony(name), confirmationFor(consequence), `${name} must be graded by the shared model`);
  }
});

test('an action nobody declared is refused, not silently waved through', () => {
  // A typo'd action name must not come back 'none' and let the button act. The unknown-fact case
  // lands on more friction, never less — the rule confirm-model.ts is built on.
  assert.equal(adminSpendCeremony('nonsense'), 'dialog');
  assert.equal(adminSpendCeremony(undefined), 'dialog');
});

// ------------------------------------------------------------- the page uses it ---

test('THE ADMIN PAGE ACTUALLY RENDERS A CONFIRM DIALOG — the model had zero administrative callers', () => {
  assert.match(ADMIN_CODE, /import \{ ConfirmDialog \} from '\.\.\/components\/confirm-dialog'/, 'it must import the dialog');
  assert.match(ADMIN_CODE, /<ConfirmDialog\b/, 'and render it');
  assert.match(ADMIN_CODE, /adminSpendCeremony/, 'and grade the action with the shared model');
});

test('the dangerous controls open the dialog instead of firing the mutation on click', () => {
  // The failure this forbids: a dialog that exists in the file and a button that still calls the
  // mutation directly, so the ceremony renders beside a control it does not guard.
  //
  // The marker is asserted before the window is cut from it. `indexOf` returns -1 for a string that
  // is not there and `slice(-701, -1)` then reads the END of the file — a window that finds nothing
  // because it looked in the wrong place, passing as a window that found nothing wrong.
  const at = ADMIN_CODE.indexOf('Stop all AI generation');
  assert.ok(at > 0, 'the stop control must still be on the page for this to be checking anything');
  const button = ADMIN_CODE.slice(Math.max(0, at - 700), at);
  assert.match(button, /onClick=\{\(\) => ask\(/, 'the stop button must route through the ceremony');
  assert.doesNotMatch(button, /onClick=\{\(\) => void (toggleKill|perform)\(/, 'and must not act on the first click');
});

// ------------------------------------------------------------- account lookup ---

test('THE CLIENT CAN CALL THE ACCOUNT LOOKUP AT ALL', () => {
  assert.match(API, /export const adminAccount\b/, 'lib/api.ts must expose the lookup');
  assert.match(API, /\/api\/admin\/account\//, 'pointed at the route the worker serves');
  assert.match(API, /'X-Admin-Key': adminKey/, 'with the admin key, like every other operator call');
});

test('AND THE PAGE MOUNTS IT — a route with no caller is a feature that does not exist', () => {
  assert.match(ADMIN_CODE, /adminAccount/, 'the page must call the lookup');
  assert.match(ADMIN_CODE, /<AccountPanel\b/, 'and the panel must be rendered, not merely defined');
});

test('THE HEAVIEST ACCOUNTS ARE LISTED — a lookup you can only use if you already know the id is not one', () => {
  // `GET /api/admin/analytics?by=actorId` has ranked accounts by spend since analytics landed and
  // no client ever asked for it. Without it the panel's own instruction — paste an id — is only
  // answerable from a support email, so nobody can be found, only looked up.
  assert.match(API, /export const adminAnalytics\b/, 'lib/api.ts must expose the breakdown');
  assert.match(API, /by=\$\{encodeURIComponent\(by\)\}/, 'grouped by a dimension the caller names');
  assert.match(ADMIN_CODE, /adminAnalytics/, 'and the page must call it');
  assert.match(ADMIN_CODE, /'actorId'/, 'grouped by actor, which is the dimension a lookup starts from');
});

test('an unattributed call is COUNTED, never bucketed under a tenant-shaped key', () => {
  // breakdownBy returns `unattributed` separately for exactly this reason: a key that looks like a
  // user id will be read as one, and an operator will go looking for an account that does not exist.
  assert.match(ADMIN_CODE, /unattributed/, 'the panel must show the unattributed count rather than hiding it');
});

test('THE PANEL SAYS WHICH PART OF THE ACCOUNT IT COULD NOT READ', () => {
  // The worker answers `profile: {known:false, why}` because profiles is own-row-only under RLS and
  // the worker holds no service key. A panel that drops that field shows a partial record as a
  // whole one — a failure to observe rendered as an observation, which is the pattern this
  // repository is named for.
  assert.match(ADMIN_CODE, /profile\.known/, 'the panel must branch on whether the profile was readable');
  assert.match(ADMIN_CODE, /profile\.why/, 'and show the reason it was not');
});

test('the panel reports a cut usage window rather than presenting a floor as a total', () => {
  assert.match(ADMIN_CODE, /window\.truncated/, 'an incomplete window must be visible to the reader');
});

test('the panel reports the ledger retention window, so an empty ledger is not read as a clean account', () => {
  assert.match(ADMIN_CODE, /retentionDays/, '35 days of rows is not the account\'s whole history');
});

test('every class the new panel draws with exists in a stylesheet', () => {
  // Mounting a panel whose classes are in no stylesheet ships an unstyled stack of text as "done".
  const classes = new Set();
  for (const m of ADMIN_CODE.matchAll(/className="([^"{]+)"/g)) {
    for (const cls of m[1].split(/\s+/)) if (cls) classes.add(cls);
  }
  assert.ok(classes.size > 5, 'the scan must actually find classes — an empty set proves nothing');
  const missing = [...classes].filter((c) => !CSS.includes('.' + c));
  assert.deepEqual(missing, [], `admin.tsx draws with classes no stylesheet defines: ${missing.join(', ')}`);
});
