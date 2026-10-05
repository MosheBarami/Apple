// THE REWRITTEN DOCS SAY ONLY WHAT THE PLUGIN, THE WORKER AND THE APP DO (M2 site fix cycle 1, plan step 2.6: "every claim true of the code").
//
// The docs rewrite folded /docs/connect, /docs/updating and /docs/build-from-source into Getting started and the plugin page. Each claim those two pages
// make that is the code's to keep is read here against the file that keeps it: the plugin's own words (apps/studpilot-plugin/src/init.server.luau), the
// pairing code's lifetime (apps/worker/src/do/pairing.ts), the session's (do/session.ts), the update path the worker prints (plugin-version.ts) and
// the app's own dialog (apps/web/src/components/pairing-dialog.tsx). The old Connect page said the connection "survives restarts" and "remembers the
// session"; the shipped plugin says "A pairing lasts until Studio closes", so that sentence is banned on every docs page, not only the one it was on.
//
// Reads the BUILT pages, and runs each scanner on a sentence it must catch first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE, distPage, distPages, textOf } from './lib/dist.mjs';
import { CONSENT_SENTENCE, assertCodeFactsHold, assertConsentPromiseHolds, plugin } from './lib/plugin-promises.mjs';

const shared = await import('../../../packages/shared/src/index.ts');
const APPS = join(SITE, '..');
const read = (...p) => readFileSync(join(APPS, ...p), 'utf8');
const docsText = (route) => textOf(distPage(route).html);

const PERSISTS = /\b(?:survives?|persists?|remembers?|keeps?)\b[^.]{0,40}\b(?:restarts?|reopening|the session)\b/i;

test('the scanner can see: it catches the sentences the old Connect page carried and passes the plugin\'s own', () => {
  assert.match('It survives restarts. The plugin remembers the session, so reopening Studio reconnects without a new code.', PERSISTS);
  assert.doesNotMatch('A pairing lasts until Studio closes. After a restart, enter a new code.', PERSISTS);
});

test('no docs page says a pairing survives a restart: the plugin says it lasts until Studio closes', () => {
  assert.match(plugin, /A pairing lasts until Studio closes; after a restart, enter a new code/, 'the plugin no longer says so: re-aim this guard and the pages');
  const docs = distPages().filter((p) => p.route.startsWith('/docs/') && !/http-equiv="refresh"/.test(p.html));
  assert.ok(docs.length >= 7);
  for (const { route, html } of docs) assert.doesNotMatch(textOf(html), PERSISTS, `${route} says a pairing survives a restart`);
  const gs = docsText('/docs/getting-started/');
  assert.match(gs, /A pairing lasts until Studio closes\. After a restart, enter a new code/);
});

test('Getting started names the panel and the dialog by the words the plugin and the app print', () => {
  const gs = docsText('/docs/getting-started/');
  for (const label of ['Not connected', 'Connect to StudPilot', 'Enable edits…', 'Allow edits for this connection', 'Turn edits off', 'Access: inspect only', 'Connected', 'Disconnect']) {
    assert.ok(plugin.includes(label), `the plugin no longer prints "${label}"`);
    assert.ok(gs.includes(label), `Getting started no longer says "${label}"`);
  }
  assert.match(read('web', 'src', 'components', 'pairing-dialog.tsx'), /<Modal title="Studio connection"/, 'the app\'s pairing dialog is no longer called "Studio connection"');
  assert.ok(gs.includes('Studio connection'), 'Getting started does not name the dialog the code is shown in');
  assert.match(read('web', 'src', 'components', 'pairing-dialog.tsx'), /Your pairing code/, 'the app no longer shows "Your pairing code"');
});

test('the code facts, the consent promise and the 30-day session on Getting started are the plugin\'s and the worker\'s', () => {
  const gs = docsText('/docs/getting-started/');
  assertCodeFactsHold();
  assert.match(gs, /six-character code/);
  assert.match(gs, /expires after 10 minutes/);
  assert.match(gs, CONSENT_SENTENCE, 'Getting started no longer carries the consent promise in the words the pages use');
  assertConsentPromiseHolds();
  assert.match(read('worker', 'src', 'do', 'session.ts'), /const PLUGIN_TOKEN_TTL_MS = 30 \* 24 \* 3600 \* 1000;/, 'a session no longer lasts 30 days');
  assert.match(docsText('/docs/troubleshooting/'), /a session expires after 30 days at the latest/);
  assert.match(gs, /temporary credential/);
});

test('the plugin page quotes the plugin\'s own disclosure for what it can and cannot do, and the update path the worker prints', () => {
  const page = docsText('/docs/plugin/');
  for (const [said, source] of [
    ['create or change supported objects and scripts in the place you paired', 'create or change supported objects and scripts in this place'],
    ['control a Run-mode playtest', 'control a Run-mode playtest'],
    ['start a short Test session with a player', 'start a short Test session with a player'],
    ['cannot publish, upload assets or execute arbitrary received Luau inside the plugin', 'It cannot publish, upload assets or execute arbitrary received Luau inside the plugin'],
  ]) {
    assert.ok(page.includes(said), `the plugin page no longer says "${said}"`);
    assert.ok(plugin.includes(source), `the plugin no longer says "${source}"`);
  }
  assert.ok(plugin.includes('Writes require edit mode and an undo recording'), 'the plugin no longer requires edit mode and an undo recording');
  assert.match(page, /Writes need edit mode/);
  const update = /const UPDATE_PATH = '([^']+)'/.exec(read('worker', 'src', 'plugin-version.ts'))?.[1];
  assert.equal(update, 'Studio → Plugins → Manage Plugins → Update', 'the update path the worker prints changed: re-word the plugin page');
  assert.match(page, /open <strong>Plugins<\/strong>|open Plugins/i);
  assert.match(page, /Manage Plugins/);
  assert.match(page, /press Update/);
  assert.match(docsText('/docs/troubleshooting/'), /This StudPilot build is too old for the server/);
});

test('the FAQ and Getting started read the Free allowance from the config, and the FAQ names the API where the app mints keys', () => {
  const free = shared.PLAN_TABLE.free;
  assert.ok(docsText('/docs/faq/').includes(`${free.creditsPerDay} Credits a day, up to ${free.creditsPerMonth} a month`), 'the FAQ\'s Free allowance is not the config\'s');
  assert.ok(docsText('/docs/getting-started/').includes(`${free.creditsPerDay} Credits immediately`), 'Getting started\'s Free allowance is not the config\'s');
  assert.match(docsText('/docs/faq/'), /Settings → Connections → API keys/);
});
