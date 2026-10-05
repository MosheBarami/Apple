/**
 * ONE-CLICK CREATE (M2 step 2.3, item C3): "New project" makes the project at once, with a generated name, and opens it.
 *
 * The old way was a dialog that asked for a name, a description and a starting point before anything existed. What this file holds,
 * by running the shipped code and not by reading its spelling:
 *
 *   1. THE NAME. "Untitled piece N", one more than the highest the person already has; only the exact pattern counts; deleting an
 *      old one never hands its name to a new one; a person's own names never move the number.
 *   2. THE HOOK, run (tests/page-harness.mjs): it reads the names, inserts exactly `{ owner_id, name }` (no description, no
 *      template), opens the new project, hands over the landing page's sentence only when there is one, says a failure in words,
 *      and makes ONE project however many entry points are pressed at once.
 *   3. EVERY ENTRY POINT calls the same creator: the shelf's header button and its empty state (the page is run and the props read),
 *      and the shell's rail, palette and shortcut (tests/command-palette.test.mjs holds the shell's half).
 *   4. NOTHING IS ASKED: the dashboard has no dialog, no name field, no description field and no template picker left.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WEB } from './ui-bundle.mjs';
import { findAll } from './page-harness.mjs';
import { loadPage } from './page-harness.mjs';
import { UNTITLED_PREFIX, nextProjectName } from '../src/lib/project-names.ts';

/* ------------------------------------------------------------------ the name --- */

test('the first project is "Untitled piece 1", and each one after is one more than the highest the person has', () => {
  assert.equal(UNTITLED_PREFIX, 'Untitled piece');
  assert.equal(nextProjectName([]), 'Untitled piece 1');
  assert.equal(nextProjectName(['Untitled piece 1']), 'Untitled piece 2');
  assert.equal(nextProjectName(['Untitled piece 1', 'Untitled piece 2', 'Untitled piece 3']), 'Untitled piece 4');
  assert.equal(nextProjectName(['Untitled piece 3']), 'Untitled piece 4', 'one more than the HIGHEST, not the count');
  assert.equal(nextProjectName(['Untitled piece 7', 'Untitled piece 2']), 'Untitled piece 8', 'in any order');
});

test('a name is never handed out again while its project exists: deleting a lower one changes nothing', () => {
  const had = ['Untitled piece 1', 'Untitled piece 2', 'Untitled piece 3'];
  assert.equal(nextProjectName(had), 'Untitled piece 4');
  assert.equal(nextProjectName(had.filter((n) => n !== 'Untitled piece 2')), 'Untitled piece 4', 'the gap is not refilled');
  assert.equal(nextProjectName(had.filter((n) => n === 'Untitled piece 1')), 'Untitled piece 2');
});

test('only the exact generated pattern moves the number: the person’s own names are left alone', () => {
  for (const other of ['Ember Halls', 'Untitled piece', 'Untitled piece 2 final', 'my Untitled piece 9', 'untitled piece 9', 'Untitled piece 0', 'Untitled piece 05', 'Untitled piece -3', 'Untitled piece 2.5', 'Untitled piece 1e9', 'Untitled  piece 9', 'Untitled piece 99999999999', '', null, undefined, 7]) {
    assert.equal(nextProjectName([other, 'Untitled piece 2']), 'Untitled piece 3', `${JSON.stringify(other)} changed the number`);
  }
  assert.equal(nextProjectName(['  Untitled piece 4  ']), 'Untitled piece 5', 'a name with stray spaces is still that name');
  assert.equal(nextProjectName(['Untitled piece 4\n']), 'Untitled piece 5');
});

test('the name always fits a project name', () => {
  assert.ok(nextProjectName(['Untitled piece 999999999']).length <= 80);
});

/* ------------------------------------------------------------------ the hook, run --- */

const fakesFor = {
  'lib/auth.tsx': { useAuth: '() => globalThis.__pageFakes.auth' },
  'components/toast.tsx': { useToast: '() => ({ toast: (...args) => globalThis.__pageFakes.toasts.push(args) })' },
  'lib/mock.ts': { MOCK_MODE: 'false', mockProjects: '[]' },
};

async function loadHook() {
  return loadPage({
    entry: 'src/lib/use-create-project.ts',
    name: 'create-project',
    real: ['lib/project-names.ts', 'lib/pending-start.ts'],
    fakes: fakesFor,
  });
}

/** A fresh page (the module keeps one in-flight flag per page), signed in as `user`, with `taken` as the names the person already has. */
async function mounted({ user = { id: 'u1' }, taken = [], insert } = {}) {
  const P = await loadHook();
  globalThis.__pageFakes = { auth: { session: user ? { user } : null }, toasts: [] };
  P.supabaseControls.takenNames = { data: taken.map((name) => ({ name })), error: null };
  if (insert) P.supabaseControls.insertResult = insert;
  P.routerControls.navigations.length = 0;
  P.queryControls.mutations.length = 0;
  P.queryControls.mutateCalls.length = 0;
  const hook = P.mountStub(() => P.useCreateProject());
  await hook.settle();
  const latest = () => P.queryControls.mutations.at(-1);
  const calls = (m) => P.supabaseControls.calls.filter((c) => c.method === m);
  return { P, hook, latest, calls };
}

const sessionStore = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, String(v)), removeItem: (k) => void data.delete(k) },
    configurable: true,
    writable: true,
  });
  return data;
};

test('the mutation reads the names the person has, then inserts exactly { owner_id, name }: no description, no template, nothing else', async () => {
  sessionStore();
  const { latest, calls } = await mounted({ taken: ['Untitled piece 1', 'Untitled piece 3'] });
  const row = await latest().mutationFn();
  assert.deepEqual(row, { id: 'the-new-project' });
  assert.deepEqual(calls('like').map((c) => c.args), [['name', 'Untitled piece %']], 'only the generated names are read');
  const [insert] = calls('insert');
  assert.deepEqual(insert.args[0], { owner_id: 'u1', name: 'Untitled piece 4' });
  assert.deepEqual(Object.keys(insert.args[0]).sort(), ['name', 'owner_id'], 'no description and no other field');
  assert.deepEqual(calls('from').map((c) => c.args[0]), ['projects', 'projects']);
});

test('the first project of a new person is Untitled piece 1', async () => {
  sessionStore();
  const { latest, calls } = await mounted({ taken: [] });
  await latest().mutationFn();
  assert.equal(calls('insert')[0].args[0].name, 'Untitled piece 1');
});

test('signed out, nothing is read and nothing is written', async () => {
  sessionStore();
  const { latest, calls } = await mounted({ user: null });
  await assert.rejects(() => latest().mutationFn(), /Not signed in/);
  assert.deepEqual(calls('from'), []);
});

test('a failed read of the names, or a failed insert, throws the database’s message and writes nothing more', async () => {
  sessionStore();
  const failedRead = await mounted();
  failedRead.P.supabaseControls.takenNames = { data: null, error: { message: 'read refused' } };
  await assert.rejects(() => failedRead.latest().mutationFn(), /read refused/);
  assert.deepEqual(failedRead.calls('insert'), [], 'no insert after a failed read');
  const failedInsert = await mounted({ insert: { data: null, error: { message: 'insert refused' } } });
  await assert.rejects(() => failedInsert.latest().mutationFn(), /insert refused/);
});

test('on success the new project OPENS, with no state when the person has typed nothing', async () => {
  sessionStore();
  const { P, latest } = await mounted();
  latest().onSuccess({ id: 'abc' });
  assert.deepEqual(P.routerControls.navigations, [{ to: '/projects/abc', options: undefined }], 'a blank start carries no handoff at all');
  assert.deepEqual(globalThis.__pageFakes.toasts, [], 'no toast: the new conversation opening is the answer');
});

test('the sentence typed on the landing page rides along ONCE, and is spent', async () => {
  const store = sessionStore({ 'apple.pendingStart': 'a lobby with a round timer' });
  const first = await mounted();
  first.latest().onSuccess({ id: 'p1' });
  assert.deepEqual(first.P.routerControls.navigations, [{ to: '/projects/p1', options: { state: { seed: 'a lobby with a round timer' } } }]);
  assert.equal(store.has('apple.pendingStart'), false, 'moved, not copied');
  const second = await mounted();
  second.latest().onSuccess({ id: 'p2' });
  assert.deepEqual(second.P.routerControls.navigations, [{ to: '/projects/p2', options: undefined }], 'the next project starts empty');
});

test('a failure is said in words, and nothing navigates', async () => {
  sessionStore();
  const { P, latest } = await mounted();
  latest().onError(new Error('permission denied'));
  assert.deepEqual(globalThis.__pageFakes.toasts, [['Could not create a project: permission denied', 'error']]);
  assert.deepEqual(P.routerControls.navigations, []);
});

test('ONE PROJECT however many times it is pressed: a second press while one is in flight does nothing, and the button says so', async () => {
  sessionStore();
  const { P, hook, latest } = await mounted();
  const mine = latest();
  assert.equal(hook.result.pending, false);
  hook.result.create();
  await hook.settle();
  assert.equal(hook.result.pending, true, 'pending while it is being made');
  hook.result.create();
  hook.result.create();
  assert.equal(P.queryControls.mutateCalls.length, 1, 'three presses made one project');
  // Another entry point holding the same hook is stopped too: the in-flight flag is the page's, not one component's.
  const other = P.mountStub(() => P.useCreateProject());
  await other.settle();
  other.result.create();
  assert.equal(P.queryControls.mutateCalls.length, 1, 'the shell and the shelf cannot each make one');
  // When it settles, the next press works (the flag is the page's, so the other entry point's creator is free too).
  mine.onSettled();
  await hook.settle();
  assert.equal(hook.result.pending, false);
  hook.result.create();
  assert.equal(P.queryControls.mutateCalls.length, 2);
});

test('a failure releases the creator, so a second try is possible', async () => {
  sessionStore();
  const { P, hook, latest } = await mounted();
  hook.result.create();
  latest().onError(new Error('x'));
  latest().onSettled();
  hook.result.create();
  assert.equal(P.queryControls.mutateCalls.length, 2);
});

/* ------------------------------------------------------------------ every entry point, run --- */

const Dash = await loadPage({
  entry: 'src/routes/dashboard.tsx',
  name: 'create-project-dashboard',
  // The page's own logic over the list it was handed (which scope shows, how it is searched, which tags there are) stays real.
  real: ['lib/archive.ts', 'lib/project-search.ts', 'lib/view-state.ts', 'lib/tags.ts', 'lib/format.ts', 'lib/rename-project.ts', 'lib/rename-rules.ts'],
  fakes: {
    'lib/use-create-project.ts': { useCreateProject: '() => globalThis.__pageFakes.creator' },
    // The shelf also holds the invite-link press (a project's menu), which is not what this file is about.
    'lib/use-invite-link.ts': { useShareInvite: '() => ({ share() {} })' },
    'lib/auth.tsx': { useAuth: '() => ({ session: { user: { id: "u1" } } })' },
    'components/toast.tsx': { useToast: '() => ({ toast() {} })' },
    'lib/mock.ts': { MOCK_MODE: 'false', mockProjects: '[]' },
    'lib/commands.tsx': { useCommands: '(list) => { globalThis.__pageFakes.commands = list; }' },
  },
});

async function shelf({ projects }) {
  const creator = { create() { creator.pressed += 1; }, pending: false, pressed: 0 };
  globalThis.__pageFakes = { creator, commands: null };
  Dash.queryControls.queries.length = 0;
  Dash.queryControls.answer = (options) => (options.queryKey?.[0] === 'projects'
    ? { data: projects, isSuccess: true, isPending: false, isFetching: false }
    : { data: [], isSuccess: true, isPending: false, isFetching: false });
  const page = Dash.mountStub(() => Dash.DashboardPage());
  await page.settle();
  return { page, creator };
}

const labelOf = (node) => JSON.stringify(node.props?.children ?? '');

test('THE SHELF’S HEADER BUTTON makes a project in one click, and is held while one is being made', async () => {
  const { page, creator } = await shelf({ projects: [] });
  const buttons = findAll(page.result, (n) => n.type === 'button' && /New project/.test(labelOf(n)));
  assert.equal(buttons.length, 1, 'the header button');
  assert.equal(buttons[0].props.onClick, creator.create, 'it is the shared creator, with no dialog between');
  buttons[0].props.onClick();
  assert.equal(creator.pressed, 1);
  creator.pending = true;
  await page.settle();
  page.rerender();
  const held = findAll(page.result, (n) => n.type === 'button' && /New project/.test(labelOf(n)))[0];
  assert.equal(held.props.disabled, true, 'a button that is already making a project is held');
});

test('THE EMPTY STATE’S ACTION makes a project in one click too', async () => {
  const { page, creator } = await shelf({ projects: [] });
  const actions = findAll(page.result, (n) => n.type === 'button' && /Create a project/.test(labelOf(n)));
  assert.equal(actions.length, 1, 'the empty state offers "Create a project"');
  assert.equal(actions[0].props.onClick, creator.create);
  actions[0].props.onClick();
  assert.equal(creator.pressed, 1);
});

test('with projects on the shelf the empty state is gone and the header button is the only way in', async () => {
  const row = { id: 'p1', owner_id: 'u', name: 'Untitled piece 1', description: null, place_name: null, place_id: null, memory_summary: null, created_at: '2026-10-05T00:00:00Z', updated_at: '2026-10-05T00:00:00Z' };
  const { page } = await shelf({ projects: [row] });
  assert.equal(findAll(page.result, (n) => n.type === 'button' && /Create a project/.test(labelOf(n))).length, 0);
  assert.equal(findAll(page.result, (n) => n.type === 'button' && /New project/.test(labelOf(n))).length, 1);
});

test('the shelf contributes Refresh to the palette, and "New project" is the shell’s one command, so the palette lists it once', async () => {
  await shelf({ projects: [] });
  const titles = globalThis.__pageFakes.commands.map((c) => c.title);
  assert.deepEqual(titles, ['Refresh projects']);
});

/* ------------------------------------------------------------------ nothing is asked (source) --- */

const dashSrc = readFileSync(join(WEB, 'src', 'routes', 'dashboard.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');

test('the dashboard has no create dialog, no name or description field and no template picker left', () => {
  for (const gone of ['CreateProjectModal', 'projectName', 'projectDescription', 'projectTemplate', 'PROJECT_TEMPLATES', 'tpl__card', 'Starting point', 'useProvideNewProject']) {
    assert.equal(dashSrc.includes(gone), false, `${gone} is still in the dashboard`);
  }
  // The edit dialog (rename and describe an EXISTING project) is a different thing and stays.
  assert.ok(dashSrc.includes('EditProjectModal'), 'the positive control: the other dialogs are still read');
});

test('the creation hook asks the person nothing: it takes no arguments', () => {
  const hook = readFileSync(join(WEB, 'src', 'lib', 'use-create-project.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');
  assert.match(hook, /export function useCreateProject\(\): \{ create: \(\) => void; pending: boolean \}/);
  assert.doesNotMatch(hook, /template/i, 'the hook reads a template');
  assert.match(hook, /\.insert\(\{ owner_id: ownerId, name: [^}]*\}\)/, 'the insert carries something besides an owner and a name');
});
