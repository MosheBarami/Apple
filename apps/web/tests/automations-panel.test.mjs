/**
 * THE AUTOMATIONS PANEL, WIRED — because a panel nothing opens is a panel nobody has.
 *
 * apps/web has no DOM renderer, so nothing here mounts anything. These read the SOURCE and pin the
 * wiring, which is the class of defect this repository keeps finding and the one this feature was
 * one step away from repeating: the worker's automation routes were written, tested end to end, and
 * reachable by no person, because `grep -rni automation apps/web/src` returned nothing. A panel
 * added without a way in would be the same defect one layer up.
 *
 * What each test is holding:
 *
 *   - THERE IS A WAY IN, and more than one. A drawer reachable only from the command palette is a
 *     drawer most people never find; a drawer reachable only from a button is one nobody can
 *     search for.
 *   - THE DRAWER NAME IS IN THE VALIDATED LIST. workspace.tsx restores the drawer you left open by
 *     checking the stored name against the drawers this build HAS, so a name missing from that list
 *     restores as closed and the panel silently never reopens.
 *   - THE PANEL DOES NOT RE-DECIDE ANYTHING. Every sentence it shows about a refusal, an outcome, a
 *     cost or a daylight-saving fold comes from lib/automations.ts, which is held against the
 *     worker's own constants in automations-model.test.mjs. A string written inline here would be a
 *     second opinion with no test behind it.
 *   - NOTHING IS TRUNCATED CLIENT-SIDE. `maxLength` on the name input would silently cut a pasted
 *     value down, and the person would never learn what the server was told.
 *   - THE ROUTES IT CALLS ARE THE ROUTES THE WORKER SERVES.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(WEB, ...p), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const PANEL = read('src', 'components', 'ws', 'automations-panel.tsx');
const WS = read('src', 'routes', 'workspace.tsx');
const API = read('src', 'lib', 'api.ts');
const CSS = read('src', 'styles', 'workspace.css');
const PANEL_CODE = strip(PANEL);
const WS_CODE = strip(WS);

// ------------------------------------------------------------------- the way in ---

test('the workspace mounts the panel, and only while its drawer is open', () => {
  assert.match(WS_CODE, /import \{ AutomationsPanel \}/);
  // Mounted conditionally for the reason the memory drawer gives: the panel holds an unsaved
  // draft, and closing the drawer is the gesture people use to abandon one.
  assert.match(WS_CODE, /drawer === 'automations' && <AutomationsPanel projectId=\{projectId\} \/>/);
});

test("'automations' is in the validated drawer list, or it restores as closed forever", () => {
  const list = WS_CODE.match(/const DRAWERS = \[([^\]]*)\]/);
  assert.ok(list, 'the validated list must still exist');
  assert.match(list[1], /'automations'/);
  assert.match(WS_CODE, /type Drawer = [^;]*'automations'/);
});

test('there are two ways in: a control on the surface and a word in the palette', () => {
  // A drawer with one entry point is one a person either stumbles on or never finds.
  assert.match(WS_CODE, /setDrawer\('automations'\)/);
  assert.match(WS_CODE, /id: 'ws-automations'/);
  const cmd = WS_CODE.slice(WS_CODE.indexOf("id: 'ws-automations'"));
  assert.match(cmd.slice(0, 400), /keywords: \[[^\]]*'automation'/, 'searching for the word must find it');
});

test('the button carries its own accessible name, because the icon has no word', () => {
  // Located by the glyph, because the palette entry also calls setDrawer('automations') and a
  // window around the first of those would be asserting about the wrong control.
  const at = WS_CODE.indexOf('PATH.automation');
  assert.ok(at > 0, 'the glyph comes from the one icon module');
  const btn = WS_CODE.slice(at - 500, at + 60);
  assert.match(btn, /aria-label="[^"]+"/, 'an icon button announces as unnamed without one');
  assert.match(btn, /setDrawer\('automations'\)/, 'and it opens the drawer');
});

// --------------------------------------------------- it re-decides nothing on its own ---

test('every sentence the panel shows comes from the model that is held against the worker', () => {
  for (const fn of ['refusalFor', 'fireRefusal', 'outcomeLabel', 'creditLabel', 'durationLabel', 'foldNote']) {
    assert.match(PANEL_CODE, new RegExp(`\\b${fn}\\b`), `${fn} must be the panel's source for that copy`);
  }
  assert.match(PANEL_CODE, /from '\.\.\/\.\.\/lib\/automations'/);
});

test('the request body is built by draftToBody, not assembled in the component', () => {
  // Assembling it here is how the two sides drift: the spellings would no longer be the ones
  // automations-model.test.mjs runs through the worker's own validator.
  assert.match(PANEL_CODE, /draftToBody\(draft\)/);
  assert.equal(/trigger:\s*'/.test(PANEL_CODE), false, 'the panel must not name a trigger of its own');
  assert.equal(/budget:\s*\{/.test(PANEL_CODE), false, 'nor assemble a budget');
});

test('nothing is truncated in the browser — the counter reports and the server refuses', () => {
  assert.equal(/maxLength/.test(PANEL_CODE), false, 'maxLength silently cuts a pasted value down');
  assert.equal(/\.slice\(0,\s*(LIMITS|\d)/.test(PANEL_CODE), false, 'and slicing does it louder but no better');
  assert.match(PANEL_CODE, /overBy\(/, 'the counter says how far over it is');
  assert.match(CSS, /\.au-count--over/, 'and it is drawn as over');
});

test("a refusal lands on the field that caused it, and one that names no field is still said", () => {
  assert.match(PANEL_CODE, /rejection\.field !== on/, 'a message is shown only on its own field');
  assert.match(PANEL_CODE, /rejection\.field === null/, 'and a fieldless refusal has somewhere to go');
  assert.match(PANEL_CODE, /role="alert"/, 'a refusal is announced, not just coloured');
});

// ------------------------------------------------- it tells the truth about what runs ---

test('an automation this build cannot start on its own is drawn as dormant, not as a schedule', () => {
  // The worker accepts a scheduled automation and nothing dispatches one. A row that showed the
  // schedule sentence alone would be a failure to run rendered as a plan to run.
  assert.match(PANEL_CODE, /willFireOnItsOwn\(a\)/);
  assert.match(PANEL_CODE, /DORMANT_NOTE/);
});

test('the schedule sentence and the daylight-saving note are the SERVER\'s words', () => {
  // Describing a schedule in the client would let the description disagree with the code that
  // would fire it, which is the commonest automation bug wearing a second face.
  assert.match(PANEL_CODE, /a\.describes/);
  assert.match(PANEL_CODE, /a\.dstNote/);
  assert.equal(/Every day at/.test(PANEL_CODE), false, 'no schedule is spelled out here');
});

test('the pause toggle reflects the write, not the request', () => {
  // The worker answers with the state its own write produced, so a toggle that changed nothing
  // cannot render as one that worked. Re-reading the list is what honours that.
  assert.match(PANEL_CODE, /setAutomationEnabled\(v\.id, v\.enabled\)/);
  assert.match(PANEL_CODE, /onSuccess: refresh/);
});

test('a run whose cost was never recorded is never drawn as zero Credits', () => {
  assert.match(PANEL_CODE, /creditLabel\(r\.credits\)/);
  assert.equal(/credits \?\? 0|credits \|\| 0/.test(PANEL_CODE), false, 'coalescing a null cost to zero understates the bill');
  assert.match(PANEL_CODE, /unreadable/, 'the spend summary counts them separately too');
});

test('the history is only asked for when somebody opens it', () => {
  // One request per automation on every workspace load, for a panel most people never open, is a
  // cost paid by everyone for the few who ask.
  assert.match(PANEL_CODE, /openHistory === a\.id && <RunHistory/);
});

// ------------------------------------------------------------------- the routes ---

test('the client calls the paths the worker serves', () => {
  const worker = readFileSync(join(WEB, '..', 'worker', 'src', 'index.ts'), 'utf8');
  const paths = [
    ['/automations`', "app.get('/api/projects/:id/automations'"],
    ['/automations`, { method: \'POST\'', "app.post('/api/projects/:id/automations'"],
    ['/enabled`', "app.post('/api/automations/:id/enabled'"],
    ['/run`', "app.post('/api/automations/:id/run'"],
    ['/runs?limit=', "app.get('/api/automations/:id/runs'"],
    ['/spend?days=', "app.get('/api/automations/:id/spend'"],
  ];
  for (const [client, server] of paths) {
    assert.ok(API.includes(client), `the client is missing ${client}`);
    assert.ok(worker.includes(server), `the worker no longer serves ${server}`);
  }
  assert.match(API, /method: 'PATCH'[\s\S]{0,80}|`\/api\/automations\/\$\{encodeURIComponent\(id\)\}`/);
  assert.ok(worker.includes("app.patch('/api/automations/:id'"));
  assert.ok(worker.includes("app.delete('/api/automations/:id'"));
});

test('every project id and automation id in a path is encoded', () => {
  const from = API.indexOf('AutomationView');
  const to = API.indexOf('admin (X-Admin-Key)');
  assert.ok(from > 0 && to > from, 'the automations block must still be where this looks');
  const urls = API.slice(from, to).match(/`\/api\/[^`]*`/g) ?? [];
  assert.ok(urls.length >= 6, `the automation routes must be in this block, found ${urls.length}`);
  for (const u of urls) {
    assert.equal(/\$\{(projectId|id)\}/.test(u), false, `${u} interpolates an id without encoding it`);
  }
});
