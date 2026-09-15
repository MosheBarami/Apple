// Renaming a project.
//
// The write itself is one Supabase update under RLS. What can actually go wrong is everything
// around it: a rename that leaves the old name on screen somewhere, a no-op write that claims
// something happened, and — the real one — an in-place edit that saves when the user pressed
// Escape, because blur fires after Escape and a naive handler cannot tell the two apart.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_NAME_MAX, isRenameWorthwhile } from '../src/lib/rename-rules.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');

// ------------------------------------------------------------ what is a rename ---

test('a different, non-empty name is worth writing', () => {
  assert.equal(isRenameWorthwhile('Tower Defence', 'Untitled'), true);
});

test('the same name is not a rename', () => {
  // Writing it anyway bumps updated_at, reorders the dashboard by recency, and pops a toast
  // announcing a change that did not happen.
  assert.equal(isRenameWorthwhile('Tower Defence', 'Tower Defence'), false);
});

test('whitespace-only differences are not a rename', () => {
  assert.equal(isRenameWorthwhile('  Tower Defence  ', 'Tower Defence'), false);
});

test('blank is not a name', () => {
  for (const v of ['', '   ', '\t', '\n']) assert.equal(isRenameWorthwhile(v, 'Tower Defence'), false, JSON.stringify(v));
});

test('a name over the limit is refused rather than silently truncated', () => {
  // The input has maxLength, but a paste on some engines and any programmatic set can exceed it.
  // Truncating would rename the project to something the user never typed.
  assert.equal(isRenameWorthwhile('x'.repeat(PROJECT_NAME_MAX), 'a'), true);
  assert.equal(isRenameWorthwhile('x'.repeat(PROJECT_NAME_MAX + 1), 'a'), false);
});

// ------------------------------------------------- every cache that holds the name ---

const HOOK = readFileSync(join(WEB, 'src', 'lib', 'rename-project.ts'), 'utf8');

test('all three caches holding the name are invalidated', () => {
  // The dashboard grid, the sidebar, and the open workspace each cache it separately. Missing one
  // leaves the old name on screen beside the new one, which reads as a failed save.
  for (const key of ["queryKey: ['projects']", "queryKey: ['projects-nav']", "queryKey: ['project', projectId]"]) {
    assert.ok(HOOK.includes(key), `${key} must be invalidated after a rename`);
  }
});

test('the rename goes to Supabase under RLS, not through a worker route', () => {
  // withOwnedProject posts the current name to the DO's /init on every request, so the session
  // picks it up on its next call. A route would be a second place the name could be wrong.
  //
  // The update takes a computed PATCH now rather than a literal `{ name }` — the same hook carries
  // the description, and edit-project.test.mjs holds the patch rule. What matters here is unchanged
  // and is asserted as the property rather than as the old spelling: one Supabase update, scoped to
  // this row, and no HTTP anywhere in the path.
  assert.match(HOOK, /supabase\.from\('projects'\)\.update\(\w+\)\.eq\('id', projectId\)/);
  assert.equal(/fetch\(|\/api\//.test(HOOK), false, 'no HTTP call belongs in the rename path');
});

// ----------------------------------------------------------- the in-place editor ---

const TITLE = readFileSync(join(WEB, 'src', 'components', 'editable-title.tsx'), 'utf8');

test('Escape cancels without saving, even though blur fires afterwards', () => {
  // This is the bug this component exists to prevent: onBlur runs after Escape, so a handler that
  // just saves on blur saves the edit the user explicitly abandoned.
  assert.match(TITLE, /if \(e\.key === 'Escape'\)/);
  assert.match(TITLE, /cancelled\.current = true/);
  const blur = TITLE.slice(TITLE.indexOf('onBlur='));
  assert.match(blur, /if \(cancelled\.current\)/, 'blur must consult the cancel flag before committing');
  assert.ok(blur.indexOf('cancelled.current') < blur.indexOf('commit()'), 'and consult it FIRST');
});

test('the cancel flag is reset, so one Escape cannot swallow the next save', () => {
  const blur = TITLE.slice(TITLE.indexOf('onBlur='));
  assert.match(blur, /cancelled\.current = false;\s*\n\s*return;/);
});

test('Enter commits', () => {
  assert.match(TITLE, /if \(e\.key === 'Enter'\)[\s\S]{0,120}commit\(\)/);
});

test('a failed rename keeps what the user typed', () => {
  // Discarding the draft on failure means retyping the name because the network blipped.
  const fail = TITLE.slice(TITLE.indexOf('onFail:'));
  assert.match(fail, /setEditing\(true\)/);
});

test('an external rename does not clobber an edit in progress', () => {
  assert.match(TITLE, /if \(!editing\) setDraft\(name\)/);
});

test('the editor commits through the shared hook, not its own write', () => {
  assert.match(TITLE, /useEditProject/);
  assert.match(TITLE, /isRenameWorthwhile/);
  assert.equal(/supabase/.test(TITLE), false, 'one rename implementation, not two');
});

// ------------------------------------------------------------------- both surfaces ---

const DASH = readFileSync(join(WEB, 'src', 'routes', 'dashboard.tsx'), 'utf8');
const WS = readFileSync(join(WEB, 'src', 'routes', 'workspace.tsx'), 'utf8');

test('the dashboard menu offers the edit and uses the shared hook', () => {
  // The item said "Rename…" while the dialog behind it could only rename. It edits the description
  // too now, so the menu says what the dialog does.
  assert.match(DASH, /Edit…/);
  assert.match(DASH, /useEditProject\(project\.id, \{ name: project\.name/);
  assert.equal(/\.update\(\{ name/.test(DASH), false, 'the dashboard must not write the name itself');
});

test('the workspace title is renamable, but only once the project has loaded', () => {
  assert.match(WS, /EditableProjectTitle/);
  // An editable control over a placeholder offers to rename something that is not there.
  assert.match(WS, /project\.data \? \(\s*<EditableProjectTitle/);
});
