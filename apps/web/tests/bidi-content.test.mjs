/**
 * TWO KINDS OF TEXT THE DOCUMENT DIRECTION GETS WRONG.
 *
 * This app renders right-to-left when the browser asks for it. `dir` on <html> is the right default
 * for the interface, and the wrong answer for two kinds of run inside it:
 *
 *   CODE IS ALWAYS LEFT-TO-RIGHT. Luau, a diff hunk, a stack trace, a shortcut legend — these are
 *   not prose in the user's language, and under `dir=rtl` the bidi algorithm reorders their
 *   brackets, operators and leading +/− sigils. `(a + b)` becomes `(b + a)` on screen, a diff's
 *   '+' lands at the end of the line, and the reader has no way to tell that what they are seeing
 *   is not what is in the file. Nothing in this tree pinned any code container: three files carry
 *   dir="ltr" on a keyboard hint and no stylesheet declared `direction` at all.
 *
 *   USER CONTENT FOLLOWS THE USER, NOT THE PAGE. A project called "מגדל האש" inside an English
 *   session, or an English project name inside a Hebrew one, inherits the document direction and
 *   reorders its own punctuation — a trailing '?' or '!' jumps to the wrong end. `dir="auto"` reads
 *   the first strong character of the content itself, which is the only thing that can be right for
 *   a string this product did not write.
 *
 * WHAT THIS PROVES AND WHAT IT DOES NOT. apps/web has no DOM renderer and the workspace sits behind
 * a login, so nothing here mounts anything: these are source and stylesheet facts, the same bound
 * rtl-workspace.test.mjs states about itself. What they pin is that the declaration exists and
 * reaches the elements that carry the text.
 *
 * Run with:  node --test tests/bidi-content.test.mjs      (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(WEB, 'src', ...p), 'utf8');
/** Comments stripped, so a rule discussed in prose is never mistaken for one in force. */
const cssCode = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const jsxCode = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SHEETS = {
  'design/system.css': cssCode(read('design/system.css')),
  'workspace.css': cssCode(read('design', 'system.css')),
};

// --------------------------------------------------------------------------------- code is LTR

/**
 * Every declaration block in a sheet, as [selector, body] pairs. A regex for "the rule containing
 * direction: ltr" would match the declaration wherever it appeared, including inside a rule that
 * targets something else entirely — the selector is the half that matters.
 */
function rules(css) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);
}

/** Selectors of every rule that pins its subject left-to-right. */
function ltrSelectors(css) {
  return rules(css)
    .filter(([, body]) => /\bdirection\s*:\s*ltr\b/.test(body))
    .flatMap(([sel]) => sel.split(',').map((s) => s.trim()));
}

test('A STYLESHEET PINS CODE CONTAINERS LEFT-TO-RIGHT', () => {
  const selectors = Object.values(SHEETS).flatMap(ltrSelectors);
  assert.ok(selectors.length > 0, 'no rule anywhere declares direction: ltr');
  // The ELEMENTS, not a class name: a class can be renamed or forgotten on the next code block
  // someone adds, and `<pre>`/`<code>` cannot.
  for (const el of ['pre', 'code', 'kbd', 'samp']) {
    assert.ok(
      selectors.some((s) => s === el || s.startsWith(`${el}:`) || s.startsWith(`${el} `)),
      `<${el}> is not pinned LTR by any rule; pinned: ${selectors.join(', ')}`,
    );
  }
});

test('and isolates itself, so a code run cannot reorder the line around it', () => {
  // `direction: ltr` fixes the inside. Without isolation the block is still a participant in the
  // surrounding paragraph's bidi run, and an inline <code> in an RTL sentence drags its neighbours.
  const isolating = Object.values(SHEETS).flatMap((css) =>
    rules(css)
      .filter(([, body]) => /\bunicode-bidi\s*:\s*(isolate|isolate-override|plaintext)\b/.test(body))
      .flatMap(([sel]) => sel.split(',').map((s) => s.trim())),
  );
  for (const el of ['pre', 'code']) {
    assert.ok(isolating.includes(el), `<${el}> declares no unicode-bidi isolation`);
  }
});

test('CONTROL: the sheets really do contain rules this parser can see', () => {
  // A selector parser that silently matched nothing would make every assertion above vacuous in
  // exactly the way this repo keeps finding. Count something known to be there.
  for (const [name, css] of Object.entries(SHEETS)) {
    assert.ok(rules(css).length > 50, `${name}: parsed only ${rules(css).length} rules`);
  }
});

// ------------------------------------------------------------------- user content carries its own

/**
 * The surfaces that render a string a USER wrote. Each entry names the file, the expression that
 * puts the text on screen, and what it is — so a failure says which surface lost its direction
 * rather than which regex stopped matching.
 */
const USER_CONTENT = [
  ['components/ws/turn.tsx', 'gx-user', 'a message the user typed'],
  ['components/ws/turn.tsx', 'gx-prose', "the assistant's reply, which answers in the user's language"],
  ['routes/dashboard.tsx', 'project-card-name', 'a project name on the dashboard'],
  ['components/editable-title.tsx', 'gx-title-edit', 'the project name in the workspace topbar'],
  ['components/editable-title.tsx', 'gx-title-input', 'the project name while it is being renamed'],
];

test('EVERY SURFACE THAT RENDERS A USER-WRITTEN STRING SETS dir="auto"', () => {
  for (const [file, className, what] of USER_CONTENT) {
    const src = jsxCode(read(...file.split('/')));
    // The element that carries the class, up to the end of its opening tag.
    const i = src.indexOf(className);
    assert.notEqual(i, -1, `${file}: no element with class ${className} — has the markup moved?`);
    const tagStart = src.lastIndexOf('<', i);
    const tagEnd = src.indexOf('>', i);
    assert.ok(tagStart !== -1 && tagEnd !== -1, `${file}: could not bound the ${className} tag`);
    const tag = src.slice(tagStart, tagEnd + 1);
    assert.match(tag, /\bdir="auto"/, `${what} (.${className} in ${file}) inherits the page direction: ${tag}`);
  }
});

test('and the document direction is still what sets the INTERFACE direction', () => {
  // dir="auto" on content must not be mistaken for a way to direct the shell. The root attribute is
  // what mirrors the layout, and it is still set before React mounts.
  const direction = read('lib', 'direction.ts');
  assert.match(direction, /document\.documentElement/, 'the root element is what carries the interface direction');
  assert.match(direction, /setAttribute\('dir'/, 'and it is set explicitly');
});
