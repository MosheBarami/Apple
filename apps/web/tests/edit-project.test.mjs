/**
 * THE DESCRIPTION WAS WRITE-ONCE.
 *
 * It is collected in the create dialog, inserted with the row, and rendered on the dashboard card
 * as the fallback behind `memory_summary` — and then nothing in the product ever writes it again.
 * A repo-wide grep for writes to `description` returned the insert and nothing else. So the one
 * sentence a person types to describe what they are building was, from the second they pressed
 * Create, a thing they could read and never correct. The rename dialog said as much in its own
 * words: "Only the name changes."
 *
 * WHAT THESE TESTS GUARD is not that a textarea exists. It is the two ways a combined edit goes
 * wrong:
 *
 *   1. AN EDIT THAT ERASES THE HALF IT WAS NOT ASKED ABOUT. The workspace title editor knows the
 *      name and nothing else. If it commits through a patch builder that treats "not given" as
 *      "empty", renaming a project silently deletes its description.
 *
 *   2. A WRITE THAT IS NOT A CHANGE. The existing rule refuses an unchanged name because writing
 *      it bumps updated_at, reorders the dashboard by recency and pops a toast about nothing. A
 *      description added to the same write has to obey the same rule, and so does the pair.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_DESCRIPTION_MAX, PROJECT_NAME_MAX, projectEditPatch } from '../src/lib/rename-rules.ts';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = readFileSync(join(WEB, 'src', 'lib', 'rename-project.ts'), 'utf8');
const DASH = readFileSync(join(WEB, 'src', 'routes', 'dashboard.tsx'), 'utf8');
const TITLE = readFileSync(join(WEB, 'src', 'components', 'editable-title.tsx'), 'utf8');

const NOW = { name: 'Tower Defence', description: 'A lane defence game.' };

// ------------------------------------------------------------------ what is worth writing ---

test('a changed description alone is worth writing, and the name is left out of the patch', () => {
  // Sending an unchanged name too would bump nothing that matters, but it also would not be true:
  // the patch is the record of what the user changed.
  assert.deepEqual(projectEditPatch({ ...NOW, description: 'A lane defence game with towers.' }, NOW), {
    description: 'A lane defence game with towers.',
  });
});

test('a changed name alone leaves the description out of the patch', () => {
  assert.deepEqual(projectEditPatch({ ...NOW, name: 'Tower Siege' }, NOW), { name: 'Tower Siege' });
});

test('both changed is ONE patch, not two writes', () => {
  assert.deepEqual(projectEditPatch({ name: 'Tower Siege', description: 'Now with siege engines.' }, NOW), {
    name: 'Tower Siege',
    description: 'Now with siege engines.',
  });
});

test('nothing changed is not an edit', () => {
  assert.equal(projectEditPatch({ ...NOW }, NOW), null);
  assert.equal(projectEditPatch({ name: '  Tower Defence  ', description: ' A lane defence game. ' }, NOW), null);
});

test('AN ABSENT DESCRIPTION MEANS "LEAVE IT", NOT "EMPTY IT"', () => {
  // The workspace title editor has a name and nothing else. If absence meant empty, every inline
  // rename would delete the project's description and the user would never be told.
  assert.deepEqual(projectEditPatch({ name: 'Tower Siege' }, NOW), { name: 'Tower Siege' });
  assert.equal(projectEditPatch({ name: 'Tower Defence' }, NOW), null);
});

test('a description the user cleared is written as null, not as an empty string', () => {
  // The card falls back to memory_summary when the description is null. An empty string is not
  // null, so it would render an empty line under the title instead of the fallback.
  assert.deepEqual(projectEditPatch({ ...NOW, description: '   ' }, NOW), { description: null });
  assert.equal(projectEditPatch({ ...NOW, description: '' }, { ...NOW, description: null }), null);
});

test('a description over the limit is refused rather than silently truncated', () => {
  // Same reasoning the name already had: maxLength is not a guarantee. A paste on some engines and
  // any programmatic set can exceed it, and cutting it saves words the user never wrote.
  const long = 'x'.repeat(PROJECT_DESCRIPTION_MAX + 1);
  assert.equal(projectEditPatch({ ...NOW, description: long }, NOW), null);
  assert.deepEqual(projectEditPatch({ ...NOW, description: 'x'.repeat(PROJECT_DESCRIPTION_MAX) }, NOW), {
    description: 'x'.repeat(PROJECT_DESCRIPTION_MAX),
  });
});

test('AN UNUSABLE NAME REFUSES THE WHOLE EDIT, INCLUDING THE GOOD HALF', () => {
  // Writing the description while dropping a blank name would save half of what the form shows and
  // report success, which is the shape of the failure this codebase keeps finding.
  assert.equal(projectEditPatch({ name: '   ', description: 'Still fine.' }, NOW), null);
  assert.equal(projectEditPatch({ name: 'x'.repeat(PROJECT_NAME_MAX + 1), description: 'Still fine.' }, NOW), null);
});

// --------------------------------------------------------------------------- one write, one hook ---

test('the hook writes the patch in a single Supabase update, still under RLS', () => {
  assert.match(HOOK, /useEditProject/, 'the hook still claims to be a rename');
  assert.match(HOOK, /projectEditPatch/, 'the hook has its own idea of what changed');
  assert.match(HOOK, /\.update\(patch\)\s*\.eq\('id', projectId\)/, 'name and description are two writes');
  assert.equal(/fetch\(|\/api\//.test(HOOK), false, 'no HTTP call belongs in this path');
});

test('the same three caches are invalidated — the card shows the description too', () => {
  for (const key of ["queryKey: ['projects']", "queryKey: ['projects-nav']", "queryKey: ['project', projectId]"]) {
    assert.ok(HOOK.includes(key), `${key} must be invalidated after an edit`);
  }
});

// ------------------------------------------------------------------------------- the surfaces ---

test('the dashboard modal edits both fields and no longer promises it will not', () => {
  assert.match(DASH, /id="edit-project-description"/, 'there is no description field to type in');
  assert.match(DASH, new RegExp(`maxLength=\\{PROJECT_DESCRIPTION_MAX\\}`), 'the field has no limit');
  assert.equal(/Only the name changes/.test(DASH), false, 'the dialog still says the description cannot change');
  assert.match(DASH, /title="Edit project"/, 'a dialog that edits two fields is still called Rename');
});

test('the inline title editor sends a name and no description at all', () => {
  // It is the caller that cannot know the description, so it is the caller that must not send one.
  assert.match(TITLE, /useEditProject/);
  const commit = TITLE.slice(TITLE.indexOf('mutate('));
  assert.equal(/description/.test(commit.slice(0, 200)), false, 'the title editor names a description it cannot know');
});
