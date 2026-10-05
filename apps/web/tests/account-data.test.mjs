/**
 * "SEND ME MY DATA" AND "DELETE MY ACCOUNT", FROM THE SCREEN A PERSON CAN ACTUALLY REACH.
 *
 * The worker serves both (apps/worker/tests/account-data-routes-live.test.mjs drives them). A route
 * nothing on a screen calls is half a feature, and this half is the half the law is about: three
 * published pages promise an account deletion, and until these controls existed the only way to ask
 * for one was an email to a person.
 *
 * WHAT THESE TESTS ARE FOR, in the order they matter:
 *
 *   1. THE CLIENT AND THE SERVER AGREE ON THE CONFIRMATION PHRASE. It is a literal on both sides of
 *      a network boundary; if they drift, the button produces a 400 forever and the person concludes
 *      the product will not delete them. The worker's own constant is read here, not retyped.
 *   2. THE COPY DOES NOT CLAIM MORE THAN THE SERVER DID. The receipt says what survived and why —
 *      including that the sign-in identity is still there — and the screen has to show that rather
 *      than printing "your account has been deleted" over it.
 *   3. BOTH ARE GATED ON IDENTITY. An export is the whole account in one file and a deletion is
 *      irreversible; either one, run by whoever sat down at an unlocked screen, is the failure.
 *   4. SEARCH CAN FIND THEM. A privacy control nobody can find is a privacy control nobody has.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SETTING_FIELDS, matchSettings } from '../src/lib/settings-search.ts';
import { confirmationFor } from '../src/lib/confirm-model.ts';
import { PREFERENCES_NOT_LOADED, preferencesLoaded, preferencesToSave } from '../src/lib/stored-preferences.ts';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const api = readFileSync(join(WEB, 'src', 'lib', 'api.ts'), 'utf8');
const page = readFileSync(join(WEB, 'src', 'routes', 'settings.tsx'), 'utf8');
const flows = readFileSync(join(WEB, 'src', 'lib', 'auth-flows.ts'), 'utf8');
const reauth = readFileSync(join(WEB, 'src', 'components', 'reauth-dialog.tsx'), 'utf8');
const erasure = readFileSync(join(WEB, '..', 'worker', 'src', 'erasure.ts'), 'utf8');

/**
 * The page with its commentary removed.
 *
 * The copy assertions below are about what a PERSON reads, and this file's first run failed on a
 * comment in settings.tsx that quoted the very sentence it was forbidding. A comment explaining why
 * a phrase is wrong is not that phrase being shown to anybody.
 */
const copy = page.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');

/* ------------------------------------------------------------------- the client --- */

test('the export asks for the route the worker serves, with the token it requires', () => {
  const at = api.indexOf('export async function downloadAccountExport');
  assert.ok(at > 0, 'there is no account export in the client at all');
  const body = api.slice(at, at + 1600);
  assert.match(body, /'\/api\/me\/export'/, 'the path must be the one index.ts registers');
  assert.match(body, /headers\.set\('Authorization', `Bearer \$\{token\}`\)/, 'an /api route needs the bearer');
  assert.match(body, /Content-Disposition/, 'the server names the file — a second slug rule here would disagree with it');
  assert.match(body, /URL\.revokeObjectURL/, 'and the blob is released');
});

test('the deletion posts the exact phrase the worker demands', () => {
  const server = /ERASURE_CONFIRMATION = '([^']+)'/.exec(erasure)?.[1];
  assert.ok(server, "could not read the worker's confirmation phrase");
  const client = /DELETE_ACCOUNT_PHRASE = '([^']+)'/.exec(api)?.[1];
  assert.ok(client, 'the client has no confirmation phrase at all');
  assert.equal(
    client,
    server,
    'the two sides of the network disagree about the phrase — the button would 400 forever and nobody would know why',
  );
  const at = api.indexOf('export const deleteAccount');
  assert.ok(at > 0, 'there is no account deletion in the client at all');
  const body = api.slice(at, at + 900);
  assert.match(body, /'\/api\/me\/delete'/);
  assert.match(body, /method: 'POST'/);
  assert.match(body, /confirm: DELETE_ACCOUNT_PHRASE/, 'the phrase must be the shared constant, not a second copy of it');
  // And the ceremony asks the person to type the same string, so what they read and what is sent
  // are one sentence rather than two similar ones.
  assert.match(page, /subject: DELETE_ACCOUNT_PHRASE/, 'the dialog must ask for the phrase the API sends');
});

test('the deletion status is read back from the same path', () => {
  assert.match(api, /export const fetchDeletionStatus[\s\S]{0,300}\/api\/me\/delete/);
});

/* --------------------------------------------------------------- what it claims --- */

test('the screen shows the server’s receipt rather than a sentence of its own', () => {
  // The receipt's whole job is to be honest about what survived — the sign-in identity, the credit
  // ledger, the support messages. A screen that printed its own success line over it would undo
  // every decision in erasure.ts.
  assert.match(copy, /receipt\.summary/, 'the server’s summary must be what the person reads');
  assert.match(copy, /receipt\.residue\.map/, 'what survives a deletion must be on the screen too');
  assert.equal(
    /your account (has been|was) deleted/i.test(copy),
    false,
    'the account is NOT deleted — the sign-in identity outlives this route, and the copy must not say otherwise',
  );
});

/* ------------------------------------------------------------------ the gates --- */

test('both are identity-gated, and each says why', () => {
  for (const action of ['export-data', 'delete-account']) {
    assert.ok(flows.includes(`'${action}'`), `${action} is not a sensitive action — an unlocked screen is enough`);
    assert.ok(reauth.includes(`'${action}':`), `${action} has no reason beside it in the re-auth dialog`);
  }
  // A deletion needs BOTH questions asked: who are you, and did you mean it. The verdict is
  // DERIVED from the confirm model rather than asserted, so the page and the model cannot drift.
  assert.equal(confirmationFor({ reversible: false, destroysUserContent: true }), 'typed');
  assert.match(
    page,
    /'delete-account': confirmationFor\(\{ reversible: false, destroysUserContent: true \}\)/,
    'deleting an account must take a typed confirmation, derived from the model',
  );
});

/* ------------------------------------------------------------------- findable --- */

test('search finds the privacy controls by the words people use for them', () => {
  const ids = new Set(SETTING_FIELDS.map((f) => f.id));
  for (const id of ['analytics-opt-out', 'improvement-opt-out', 'download-my-data', 'delete-account']) {
    assert.ok(ids.has(id), `${id} is not in the settings registry`);
  }
  const cases = [
    ['download my data', 'download-my-data'],
    ['gdpr', 'download-my-data'],
    ['delete account', 'delete-account'],
    ['close my account', 'delete-account'],
    ['analytics', 'analytics-opt-out'],
    ['tracking', 'analytics-opt-out'],
    // The old promise row was found by "training"; the opt-out that replaced it has to be.
    ['training', 'improvement-opt-out'],
    ['ai training', 'improvement-opt-out'],
  ];
  for (const [query, id] of cases) {
    assert.equal(matchSettings(query)[0], id, `"${query}" should find ${id}, found ${matchSettings(query)[0]}`);
  }
});

/* ------------------------------------------------------------- the opt-out works --- */

test('the analytics switch writes the preference the worker reads', () => {
  // The worker's middleware reads `analytics_opt_out` at USER scope (analytics-consent.ts). A
  // control that wrote it anywhere else would be a switch that changes nothing.
  assert.match(api, /analytics_opt_out\?: boolean/, 'the preference is not in the client’s vocabulary');
  const at = page.indexOf('analytics_opt_out');
  assert.ok(at > 0, 'nothing on the settings page sets it');
  const around = page.slice(Math.max(0, at - 700), at + 400);
  assert.match(around, /savePreferences\('user'/, 'it must be written at user scope');
});

test('the improvement-data switch writes the preference the worker validates, at user scope, and reads absent as NOT opted out', () => {
  // The worker accepts the key only if preferences.ts declares it (a key it does not know is thrown away, so the switch would look
  // saved and be forgotten), and the page reads what the SERVER returned rather than what it sent.
  const worker = readFileSync(join(WEB, '..', 'worker', 'src', 'preferences.ts'), 'utf8');
  // The key list is READ OUT of the array (comments stripped), so it holds wherever in the list the key sits and not when it is gone.
  const declared = /PREFERENCE_KEYS = \[([\s\S]*?)\n\] as const/.exec(worker)?.[1].replace(/\/\/.*$/gm, '').match(/'[a-z_]+'/g) ?? [];
  assert.ok(declared.length > 5, 'could not read PREFERENCE_KEYS out of the worker: this test would check nothing');
  assert.ok(declared.includes("'improvement_opt_out'"), "the worker's preference vocabulary does not declare the key the switch writes");
  assert.match(api, /improvement_opt_out\?: boolean/, 'the preference is not in the client’s vocabulary');
  const at = page.indexOf('const setImprovementOptOut');
  assert.ok(at > 0, 'nothing on the settings page sets it');
  const mutation = page.slice(at, at + 900);
  // The property: written at user scope, on top of what was LOADED (preferencesToSave keeps everything stored and refuses a blank base), carrying the key.
  assert.match(mutation, /savePreferences\('user', userId, preferencesToSave\(storedPrefs\.data, \{ improvement_opt_out: optOut \}\)\)/, 'it must be written at user scope, with everything already stored kept');
  assert.match(mutation, /out\.preferences\.improvement_opt_out/, 'the confirmation must say what came back, not what was sent');
  const row = copy.slice(copy.indexOf('<Row id="improvement-opt-out"'), copy.indexOf('</Row>', copy.indexOf('<Row id="improvement-opt-out"')));
  assert.match(row, /checked=\{storedPrefs\.data\?\.preferences\.prefs\.improvement_opt_out \?\? false\}/, 'default must be not opted out');
  assert.match(row, /onChange=\{\(e\) => setImprovementOptOut\.mutate\(e\.target\.checked\)\}/, 'checked means opted OUT');
  assert.match(row, /storedPrefs\.isError/, 'a failed read must not render as "not opted out"');
});

/* ------------------------------------------------ the export is not described as "everything" or as "two things" --- */

test('the Settings copy and the file\u2019s own readMe do not call the export everything, or say only two kinds of thing stay out', () => {
  const readMe = /const READ_ME =([\s\S]*?);\n\nexport function assembleAccountExport/.exec(page)?.[1] ?? '';
  assert.ok(readMe.length > 300, 'could not read READ_ME out of settings.tsx');
  const rows = copy.slice(copy.indexOf('<Row id="download-my-data"'), copy.indexOf('</Row>', copy.indexOf('<Row id="download-my-data"')));
  assert.ok(rows.length > 500, 'the download row is not on the page');
  for (const [where, text] of [['READ_ME', readMe], ['the download row', rows]]) {
    assert.doesNotMatch(text, /Two kinds of thing|Two things stay out|everything StudPilot keeps about you/i, `${where} still says the export is everything, or that two kinds of thing stay out`);
  }
  // What the file leaves out, named: the internal records the worker marks "not offered as a download", and branding.
  for (const [where, text] of [['READ_ME', readMe], ['the download row', rows]]) {
    assert.match(text, /request log/, `${where} does not name the request log among what stays out`);
    assert.match(text, /recovery/i, `${where} does not name the account-recovery records`);
  }
  assert.match(rows, /Project branding has\s+a route of its own/, 'the download row does not say branding is listed rather than included');
  // The worker's own note on the request log no longer says it carries no actor id once analytics are off (the run entries still do).
  const note = /\n\s+events: '([^']+)'/.exec(readFileSync(join(WEB, '..', 'worker', 'src', 'account-export.ts'), 'utf8'))?.[1] ?? '';
  assert.ok(note.length > 40, 'could not read the request-log note out of account-export.ts');
  assert.match(note, /not off the entries for agent runs/, 'the export note on the request log is the old one');
  assert.doesNotMatch(note, /carries no actor id at all/, 'the export note still says the request log carries no actor id once analytics are off');
});

/* ------------------------------------------- a failed read must never become a delete-everything save --- */

test('A SWITCH SAVES ON TOP OF WHAT WAS LOADED, AND REFUSES WHEN NOTHING WAS: a blank base would delete every other preference', () => {
  const stored = {
    preferences: {
      prefs: { analytics_opt_out: true, notify_events: { run_complete: false }, model: 'm' },
      rejected: [],
    },
  };
  // Loaded: everything stored stays, the change is added, and the change wins over a stored value of its own key.
  assert.deepEqual(preferencesToSave(stored, { improvement_opt_out: true }), {
    analytics_opt_out: true, notify_events: { run_complete: false }, model: 'm', improvement_opt_out: true,
  });
  assert.equal(preferencesToSave(stored, { analytics_opt_out: false }).analytics_opt_out, false);
  assert.equal(stored.preferences.prefs.analytics_opt_out, true, 'the loaded object must not be mutated');
  // Not loaded, in every shape a failed or pending read leaves behind: nothing is saved, and the person is told so.
  for (const none of [undefined, null, {}, { preferences: {} }, { preferences: { prefs: null } }]) {
    assert.throws(() => preferencesToSave(none, { improvement_opt_out: true }), { message: PREFERENCES_NOT_LOADED }, JSON.stringify(none));
    assert.equal(preferencesLoaded({ data: none }), false, `${JSON.stringify(none)} is not a loaded read`);
  }
  assert.equal(preferencesLoaded({ data: stored }), true);
  // An empty stored set is a real answer (a person who has set nothing), and is not mistaken for a failed read.
  assert.deepEqual(preferencesToSave({ preferences: { prefs: {}, rejected: [] } }, { improvement_opt_out: true }), { improvement_opt_out: true });
});

test('BOTH PRIVACY SWITCHES ARE DISABLED UNTIL THE PREFERENCES HAVE LOADED, and no preference save takes a blank base', () => {
  for (const [id, mutation] of [['improvement-opt-out', 'setImprovementOptOut'], ['analytics-opt-out', 'setAnalyticsOptOut']]) {
    const at = copy.indexOf(`<Row id="${id}"`);
    assert.ok(at > 0, `the ${id} row is not on the page`);
    const row = copy.slice(at, copy.indexOf('</Row>', at));
    // Disabled on "not loaded", which covers pending AND failed. `isPending` alone left the switch live after a failed read.
    assert.match(row, new RegExp(`disabled=\\{!preferencesLoaded\\(storedPrefs\\) \\|\\| ${mutation}\\.isPending\\}`), `the ${id} switch is not disabled until the preferences have loaded`);
  }
  // Every preference save in the page is built by preferencesToSave, and none falls back to a blank object.
  const saves = [...copy.matchAll(/savePreferences\('user', userId, /g)];
  assert.ok(saves.length >= 3, `only ${saves.length} preference saves were read out of settings.tsx: this test would check nothing`);
  for (const m of saves) {
    assert.ok(copy.slice(m.index, m.index + 160).includes('preferencesToSave('), `a preference save at offset ${m.index} is not built by preferencesToSave`);
  }
  assert.doesNotMatch(copy, /preferences\.prefs \?\? \{\}/, 'a stored-preferences base falls back to a blank object again');
});

test('the switch says when it takes effect, and quotes the window the worker really keeps', () => {
  const at = copy.indexOf('<Row id="analytics-opt-out"');
  assert.ok(at > 0, 'the analytics row is not on the page');
  const row = copy.slice(at, copy.indexOf('</Row>', at));
  assert.match(row, /within a minute/i, 'the consent cache window is real and the copy has to admit it');

  // THE NUMBER IN THE COPY IS THE NUMBER IN THE CODE. A privacy page quoting a retention window the
  // worker does not keep is drift that only a reader with both files open would ever catch.
  const retention = readFileSync(join(WEB, '..', 'worker', 'src', 'retention.ts'), 'utf8');
  const days = /analyticsEventDays: (\d+)/.exec(retention)?.[1];
  assert.ok(days, 'could not read the analytics retention window from the worker');
  assert.ok(row.includes(`${days} days`), `the copy must say ${days} days, which is what retention.ts keeps`);
});
