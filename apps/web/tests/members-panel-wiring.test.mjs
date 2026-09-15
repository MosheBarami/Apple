/**
 * THE MEMBER PANEL IS REACHABLE, AND IT IS DRESSED.
 *
 * `components/ws/members-panel.tsx` was written against a complete, tested worker surface — the
 * roster, invite, role change, suspend, reactivate and revoke routes all exist and all have tests
 * in apps/worker/tests — and then nothing imported it. A repo-wide grep for `MembersPanel` returned
 * exactly the line that exports it. So in the shipped product the only way to add a collaborator to
 * a project was curl, which the panel's own header comment says out loud.
 *
 * That is this codebase's named defect — a route nothing calls, a component nothing renders — and
 * it hides from every test that reads the panel in isolation, because the panel was never wrong.
 * What was wrong was that no path through the app arrives at it.
 *
 * SO THESE ASK THREE THINGS, and each of them failed before this change:
 *
 *   1. The route mounts it, on a drawer name the route's own validation accepts. A name missing
 *      from DRAWERS is restored as 'none' by readViewChoice, so the drawer would open on the first
 *      click and never survive a reload — mounted, and still unreachable the second time.
 *   2. It is handed a REAL access answer. The panel turns every control off unless `access` says
 *      'ready', so passing a hand-made `{status:'ready'}` would light up an admin's interface for a
 *      viewer. It must come from fetchProjectAccess through normaliseAccess, which is the pair
 *      apps/web/tests/capabilities.test.mjs holds against the worker's allowlists.
 *   3. Every class it draws with exists in a stylesheet. The panel's mb__* block was in none of
 *      them: mounting it without that is an unstyled stack of text that ships as "done".
 *
 * Structural, because apps/web has no DOM renderer — the same bargain usage-page-wiring.test.mjs
 * makes, and for the same reason.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(WEB, ...p), 'utf8');

/** Source with comments stripped: a class named in prose is not a class in use. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const PANEL = read('src', 'components', 'ws', 'members-panel.tsx');
const PANEL_CODE = code(PANEL);
const WS = code(read('src', 'routes', 'workspace.tsx'));
const API = read('src', 'lib', 'api.ts');
const CSS = [read('src', 'styles.css'), read('src', 'styles', 'global.css'), read('src', 'styles', 'workspace.css')].join('\n');

// ------------------------------------------------------------------ it is mounted ---

test('THE WORKSPACE RENDERS THE PANEL — it had zero callers anywhere in the app', () => {
  assert.match(WS, /import \{ MembersPanel \} from '\.\.\/components\/ws\/members-panel'/, 'the route must import it');
  assert.match(WS, /<MembersPanel\b/, 'and render it');
});

test('the drawer name it opens on is one the route will accept back from storage', () => {
  // readViewChoice checks the stored name against DRAWERS and falls back to 'none'. A drawer
  // rendered on a name that is not in that list opens once and is forgotten on reload — which
  // looks, to the person using it, exactly like the feature being broken at random.
  assert.match(WS, /const DRAWERS = \[[^\]]*'members'/, "'members' must be in DRAWERS");
  assert.match(WS, /type Drawer =[^;]*'members'/, 'and in the Drawer union');
  assert.match(WS, /type DrawerName =[^;]*'members'/, 'and in DrawerName');
  assert.match(WS, /drawer === 'members'/, 'the drawer must actually be keyed on it');
});

test('there is a control that opens it, named, and a command for people who never see the topbar', () => {
  // A drawer with no opener is the same dead branch one step further along.
  assert.match(WS, /setDrawer\('members'\)/, 'nothing opens the members drawer');
  // The button, not the command-palette entry: a <button …> element whose onClick opens it. Its
  // icon is the whole of its content, so without an aria-label it announces as "button".
  const buttons = [...WS.matchAll(/<button[\s\S]{0,400}?setDrawer\('members'\)[\s\S]{0,400}?<\/button>/g)];
  assert.equal(buttons.length >= 1, true, 'no <button> in the topbar opens the members drawer');
  assert.match(buttons[0][0], /aria-label="[^"]+"/, 'the opener must carry an accessible name');
  assert.match(WS, /id: 'ws-members'/, 'and it must be in the command palette like every other drawer');
});

test('the panel is mounted only while the drawer is open, like the others', () => {
  // Otherwise every workspace load fetches a roster for the majority of users who never open it.
  assert.match(WS, /\{drawer === 'members' && <MembersPanel/, 'mounted unconditionally');
});

// ----------------------------------------------------- it is handed a real answer ---

test('ACCESS COMES FROM THE SERVER, not from a literal the route made up', () => {
  // `allows()` returns false for anything but a 'ready' state, so the panel is safe against a
  // missing answer — but not against a fabricated one. A hand-written {status:'ready', role:'admin'}
  // would enable every destructive control for a viewer and let them discover the truth by
  // pressing Remove.
  assert.match(WS, /fetchProjectAccess\(/, 'the route must ask /api/shared/:id');
  assert.match(WS, /normaliseAccess\(/, 'and read the answer through the shared normaliser');
  assert.equal(/status:\s*'ready'/.test(WS), false, 'the route must not synthesise an access state');
  assert.match(API, /fetchProjectAccess/, 'the client function must exist');
});

test('while the answer is not in hand the panel is told so, rather than told nothing', () => {
  // ACCESS_LOADING is the state whyNot() explains as "checking", as distinct from "your role
  // cannot". Defaulting to an empty ready state would blame the user's role for a request that
  // has not come back.
  assert.match(WS, /ACCESS_LOADING/, 'the loading state must be the fallback');
});

// ------------------------------------------------------------------ it has styles ---

/** Every static class token the panel draws with. */
function classesUsed(src) {
  const out = new Set();
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    // Template holes are dynamic; their static neighbours still name real classes. Both
    // alternatives are read — taking only the quoted one would silently skip every conditional
    // class, which is exactly the set most likely to have no rule behind it.
    for (const token of (m[1] ?? m[2] ?? '').replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) {
      if (token) out.add(token);
    }
  }
  return [...out];
}

test('EVERY CLASS THE PANEL DRAWS WITH HAS A RULE — the whole mb__ block was missing', () => {
  const missing = classesUsed(PANEL_CODE).filter((c) => !new RegExp(`\\.${c.replace(/[-]/g, '\\-')}\\b`).test(CSS));
  assert.deepEqual(missing, [], 'these classes are used by members-panel.tsx and defined in no stylesheet');
});

test('the screen-reader-only label uses the class this app actually ships', () => {
  // The panel asked for `sr-only`. This app's utility is `visually-hidden`, so that span rendered
  // as visible body text reading "Role for <handle>" beside every row — a label meant for a
  // screen reader printed on screen, which is the failure in both directions at once.
  assert.equal(/"sr-only"/.test(PANEL_CODE), false, 'sr-only is not a class this app defines');
  assert.match(PANEL_CODE, /visually-hidden/, 'the hidden label must use the shipped utility');
});
