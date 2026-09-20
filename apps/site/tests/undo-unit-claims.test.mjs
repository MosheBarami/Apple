// THE UNIT OF A NATIVE UNDO STEP IS ONE OPERATION, NOT ONE RUN AND NOT ONE BATCH.
//
// Ground truth, read rather than remembered:
//   apps/apple-plugin/src/Commands.luau — `execute` calls beginRecording(...) once per operation
//     and finishOperation(...) once per operation, so every mutating op is its own
//     ChangeHistoryService recording.
//   apps/apple-plugin/src/Bridge.luau  — `for index = 1, #ops do ... resultForExecution(...)`,
//     so a server-sent batch is walked one operation at a time. Nothing groups a batch.
//
// Therefore a run that writes N times is N native undo steps. Four surfaces on this site said
// otherwise — the landing's Undo card ("a single Ctrl+Z away"), /docs/faq, /docs/troubleshooting
// and /docs/getting-started ("each batch ... is one native undo step") — and a customer who
// believed any of them pressed Ctrl+Z once and was left with a half-reverted place.
//
// This guard fails on the shape of the false claim, and requires the surfaces that offer Ctrl+Z
// as an exit to also name the checkpoint, which IS the one-action whole-run undo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

/** Astro/JSX comments are where the reasoning lives; the claim guard must not read them. */
function prose(source) {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

const PAGES = {
  'index.astro': '../src/pages/index.astro',
  'docs/faq.astro': '../src/pages/docs/faq.astro',
  'docs/troubleshooting.astro': '../src/pages/docs/troubleshooting.astro',
  'docs/getting-started.astro': '../src/pages/docs/getting-started.astro',
  'changelog.astro': '../src/pages/changelog.astro',
};

/** The two shapes that assert the wrong unit. Both are what shipped. */
const FALSE_UNIT = [
  // "each batch of Apple changes is one native undo step" / "every batch of changes is one native undo step"
  /\b(?:each|every)\s+batch[^.]{0,60}?\bone\s+(?:native\s+)?undo\s+step/i,
  // "a run you dislike is a single Ctrl+Z away"
  /\b(?:a\s+)?run[^.]{0,60}?\bsingle\s+Ctrl\+?-?Z\b/i,
  // "every operation batch in a ChangeHistory waypoint" — same error, one layer down
  /\boperation\s+batch\s+in\s+a\s+ChangeHistory\s+waypoint/i,
];

function audit(name, source) {
  const text = prose(source);
  for (const shape of FALSE_UNIT) {
    assert.doesNotMatch(
      text,
      shape,
      `${name} claims a batch or a run is one undo step; the plugin records one per operation`,
    );
  }
}

for (const [name, rel] of Object.entries(PAGES)) {
  test(`${name} does not sell one Ctrl+Z as a whole-run undo`, () => audit(name, read(rel)));
}

// The three pages that hand a reader Ctrl+Z as a remedy must also hand them the thing that
// actually reverts a run, or the correction just removes a promise and leaves no exit.
for (const [name, rel] of [
  ['index.astro', '../src/pages/index.astro'],
  ['docs/faq.astro', '../src/pages/docs/faq.astro'],
  ['docs/troubleshooting.astro', '../src/pages/docs/troubleshooting.astro'],
  ['docs/getting-started.astro', '../src/pages/docs/getting-started.astro'],
]) {
  test(`${name} names the checkpoint as the whole-run exit beside Ctrl+Z`, () => {
    const text = prose(read(rel));
    // Ctrl+Z is written three ways across these pages: bare, `Ctrl+Z` inside one <kbd>, and
    // <kbd>Ctrl</kbd>+<kbd>Z</kbd>. Strip tags before looking, so the guard reads what a reader sees.
    const visible = text.replace(/<[^>]+>/g, '');
    assert.match(visible, /Ctrl\s*\+\s*Z/i, `${name} should still mention Ctrl+Z`);
    assert.match(text, /checkpoint/i, `${name} offers Ctrl+Z without naming the checkpoint`);
  });
}

// ---------------------------------------------------------------------------
// The guard can fail. Without this, everything above is decoration.
// ---------------------------------------------------------------------------
test('the guard rejects the exact sentences that shipped', () => {
  assert.throws(
    () => audit('victim', '<p>Each batch of Apple changes is one native undo step.</p>'),
    /one undo step/,
  );
  assert.throws(
    () => audit('victim', '<p>so a run you dislike is a single Ctrl+Z away.</p>'),
    /one undo step/,
  );
  assert.throws(
    () => audit('victim', '<li>Wraps every operation batch in a ChangeHistory waypoint.</li>'),
    /one undo step/,
  );
  // and it passes the corrected shape
  audit('victim', '<p>One undo step per change, so a five-step run is five presses; restore the checkpoint to take the whole run back.</p>');
});

test('the guard reads prose and not the comment explaining the fix', () => {
  // A comment quoting the old sentence must not trip the rule, or the reasoning cannot be recorded.
  audit('victim', '{/* "each batch is one native undo step" was the wrong unit. */}<p>fine</p>');
  // ...but the same words outside a comment still fail.
  assert.throws(() => audit('victim', '<p>each batch is one native undo step</p>'), /one undo step/);
});
