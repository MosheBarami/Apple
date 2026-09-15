/**
 * THE MEMBERS PANEL IS REACHABLE.
 *
 * It was not. `components/ws/members-panel.tsx` was written, reviewed and merged — 400 lines with
 * a roster, role changes, pause, remove, undo and an invite form — and a repo-wide grep for
 * `MembersPanel` returned its own `export function` line and nothing else. Its data source,
 * `fetchProjectAccess` in lib/api.ts, had zero callers. Its own header says the collaboration
 * ROUTES were unreachable and that this panel is the fix; the panel was itself unreachable, so the
 * only way to add a collaborator to a paid project was still curl.
 *
 * That is the defect this codebase keeps finding and has refused to ship again: a control wired to
 * nothing, or in this case an entire surface wired to nothing. These tests fail if the panel goes
 * back to being orphaned — asserted against the source, because mounting is a fact about the route
 * module and there is no DOM here to render it in.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(WEB, 'src');
const WORKSPACE = readFileSync(join(SRC, 'routes', 'workspace.tsx'), 'utf8');
const PANEL = readFileSync(join(SRC, 'components', 'ws', 'members-panel.tsx'), 'utf8');
const API = readFileSync(join(SRC, 'lib', 'api.ts'), 'utf8');

function sources(dir = SRC, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

// ------------------------------------------------------------------- it is imported at all ---

test('something other than itself imports MembersPanel', () => {
  // The grep that caught this the first time, turned into an assertion. `>= 2` because the
  // definition itself is one of the hits.
  const hits = sources()
    .filter((f) => /MembersPanel/.test(readFileSync(f, 'utf8')))
    .map((f) => relative(WEB, f));
  assert.ok(hits.length >= 2, `MembersPanel appears only in ${hits.join(', ')} — it is orphaned again`);
  assert.ok(hits.includes('src/routes/workspace.tsx'), `the workspace does not mount it; found in ${hits.join(', ')}`);
});

test('the workspace imports it from the file it lives in', () => {
  assert.match(WORKSPACE, /import \{ MembersPanel \} from '\.\.\/components\/ws\/members-panel'/);
});

// ------------------------------------------------------------------------ it can be opened ---

test("'members' is a drawer this build has, in BOTH unions and the stored-name list", () => {
  //[[ Three places, and missing any one of them is a different bug.
  //
  //   The type union is what lets `setDrawer('members')` compile. DrawerName and DRAWERS are what
  //   `readViewChoice` validates a persisted name against — a drawer missing from those opens on
  //   first click and is silently forgotten on reload, which reads as the drawer not existing. ]]
  const union = /type Drawer = null \| ([^;]+);/.exec(WORKSPACE);
  assert.ok(union, 'the Drawer union is gone');
  assert.match(union[1], /'members'/, 'members is not a drawer this build can show');

  const names = /type DrawerName = ([^;]+);/.exec(WORKSPACE);
  assert.ok(names, 'the DrawerName union is gone');
  assert.match(names[1], /'members'/, 'a stored members drawer would not survive a reload');

  const list = /const DRAWERS = \[([^\]]+)\]/.exec(WORKSPACE);
  assert.ok(list, 'the DRAWERS list is gone');
  assert.match(list[1], /'members'/, "readViewChoice would reject 'members' as an unknown name");
});

test('there is a control that opens it, and it is named for assistive tech', () => {
  // The topbar collapses labels below 860px, so an icon button with no aria-label announces as
  // "button" — the same defect the Checkpoints and Roadmap controls carry a comment about.
  const btn = /<button[^>]*?onClick=\{\(\) => setDrawer\('members'\)\}[\s\S]{0,400}?<\/button>/.exec(WORKSPACE);
  assert.ok(btn, 'nothing in the topbar opens the members drawer');
  assert.match(btn[0], /aria-label="[^"]+"/, 'the members button has no accessible name');
});

test('the command palette can open it too', () => {
  const cmd = /id: 'ws-members',[\s\S]{0,400}?\n    \},/.exec(WORKSPACE);
  assert.ok(cmd, "the palette has no 'ws-members' command");
  assert.match(cmd[0], /setDrawer\('members'\)/, 'the members command does not open the drawer');
  assert.match(cmd[0], /title: '[^']+'/, 'the command has no title, so the palette lists a blank row');
});

test('the drawer actually renders the panel, and only while it is open', () => {
  //[[ Mounted conditionally on purpose, the same way the memory and credits drawers are.
  //
  //   The panel holds an unsent invitation in local state and runs a roster query. Leaving it
  //   mounted behind a closed drawer keeps polling a list nobody is looking at and keeps a
  //   half-typed user id alive across a close, which reads as the dialog having "remembered"
  //   something it will not actually send. ]]
  const drawer = /<Drawer open=\{drawer === 'members'\}[\s\S]{0,600}?<\/Drawer>/.exec(WORKSPACE);
  assert.ok(drawer, 'there is no members Drawer');
  assert.match(drawer[0], /drawer === 'members' && <MembersPanel/, 'the panel is not gated on the drawer being open');
  assert.match(drawer[0], /title="[^"]+"/, 'the drawer has no title, so the dialog has no name');
});

// ------------------------------------------------- the access answer, and the third state ---

test('the panel is given a real access answer, fetched from the route that decides it', () => {
  assert.match(API, /export const fetchProjectAccess/, 'the access client is gone');
  assert.match(WORKSPACE, /fetchProjectAccess/, 'the workspace never asks what this person may do');
  assert.match(WORKSPACE, /normaliseAccess/, 'the raw payload reaches the panel unvalidated');
  assert.match(WORKSPACE, /queryKey: \['access', projectId\]/, 'the access answer is not cached per project');
});

test('LOADING AND FAILURE ARE NOT PERMISSION, and the workspace says which one it is in', () => {
  //[[ The failure-to-observe rule, at the one place it decides whether a stranger sees live
  //   controls. `useQuery` is pending before the first answer and errors on a refusal; both must
  //   reach the panel as something other than a role, or the panel enables its Remove buttons on
  //   an authority nobody established. ]]
  const block = /const access(: AccessState)? = useMemo\(\(\) => \{[\s\S]{0,700}?\}, \[/.exec(WORKSPACE);
  assert.ok(block, 'the access state is not derived in one place');
  assert.match(block[0], /ACCESS_LOADING/, 'a pending check does not render as loading');
  assert.match(block[0], /'unavailable'/, 'a failed check is not reported as unavailable');
  assert.ok(!/status: 'ready'/.test(block[0]), 'the workspace invents a ready state instead of reading one');
});

// ------------------------------------------------------------------- the panel's own rules ---

test('the panel still refuses to enable anything on an unverified permission', () => {
  // Mounting it is worthless if it greys nothing out. These are the properties its header
  // promises; they are what make it safe to show a viewer.
  assert.match(PANEL, /allows\(access, 'manage_members'\)/, 'the panel no longer asks whether you may manage members');
  assert.match(PANEL, /whyNot\(access, 'manage_members'\)/, 'the panel no longer explains why a control is off');
  assert.match(PANEL, /disabled=\{!mayManage/, 'controls are not disabled for someone who cannot manage members');
});
