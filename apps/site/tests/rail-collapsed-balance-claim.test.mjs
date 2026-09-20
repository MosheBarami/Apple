/**
 * "IN THE FOOTER OF THE LEFT RAIL" WAS THE SECOND WRONG ANSWER TO THE SAME QUESTION.
 *
 * balance-visibility-claim.test.mjs already retired "always visible in the workspace header, and it
 * updates live". What replaced it — "Your balance sits in the footer of the left rail, beside your
 * account" — is true of a rail that is OPEN, and the workspace does not open with one.
 *
 * MEASURED ON THE DEPLOYED APP, 2026-09-20, signed in as the project's own end-to-end account, in a
 * fresh browser context at 1920, 1440, 1280 and 1024:
 *
 *   document.querySelector('.gx-shell').className  ->  "gx gx-shell is-rail-collapsed"
 *   document.querySelector('.gx-usage')            ->  null   (at all four widths)
 *   document.querySelector('.gx-rail__foot')       ->  null
 *
 * and the collapsed dock carries one row labelled "Usage and Credits". Click the control labelled
 * "Open navigation" and `.gx-rail__foot` appears holding the meter: "202 Credits left today / Free
 * / of 231 a day / about 2 more builds / resets in 14h".
 *
 * So the sentence described a state the reader was not in, and the reader who followed it looked at
 * a rail that was not there. This guard is about the ORDER the page names things in: what is on
 * screen when the workspace loads has to be named before what appears after an action, and the
 * action has to be named too.
 *
 * WHY IT IS NOT MEASURED HERE. The state is a deployed rendering, and this suite has no browser.
 * The source-side fact the guard CAN check is that the rail collapses by default, so that is what
 * it reads: when apps/web stops shipping a collapsed rail, this test flips and stops demanding the
 * caveat — the same shape as the guard it sits beside, and the only way a copy rule can be right on
 * both sides of a fix.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const DOC = read('../src/pages/docs/credits-and-limits.astro')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/&rsquo;/g, '’');

const layout = read('../../web/src/components/layout.tsx');
const shell = read('../../web/src/lib/shell.tsx');

/**
 * Does the shell ship collapsed for somebody who has never opened it?
 *
 * READ FROM THE FILE THAT DECIDES, which is not the one that renders. layout.tsx only spends
 * `railCollapsed`; `readCollapsed()` in lib/shell.tsx is what returns it, and it answers TRUE on
 * every path a first-time visitor takes — no window, a throw, and a stored value that is anything
 * other than the string '0'. A probe pointed at layout.tsx passes by coincidence and would go on
 * passing after the default was flipped, which is a guard that has stopped guarding.
 */
function railStartsCollapsed() {
  if (!/is-rail-collapsed/.test(layout)) return false;
  const at = shell.indexOf('function readCollapsed');
  if (at === -1) return false;
  const body = shell.slice(at, shell.indexOf('\n}', at));
  return /return true;/.test(body) && /!==\s*'0'/.test(body);
}

test('the app still ships a rail that can be collapsed, and a footer meter inside it', () => {
  assert.match(layout, /gx-rail__foot/, 'the rail footer is gone — re-derive the sentence, do not trust it');
  assert.match(layout, /is-rail-collapsed/, 'the collapsed state is gone — this guard has to be re-measured');
});

test('the page names the surface that is on screen when the workspace loads', () => {
  // "Usage and Credits" is the label the collapsed dock actually renders. A page that only names
  // the rail is describing a second click.
  assert.match(DOC, /Usage and Credits/, 'name the dock row a reader can actually see on load');
});

test('the rail sentence carries the caveat, for as long as the rail starts closed', () => {
  const mentionsRail = /left rail/i.test(DOC);
  assert.ok(mentionsRail, 'the rail is where the meter lives once it is open — it should still be named');
  if (!railStartsCollapsed()) return; // an app that opens the rail needs no warning about it
  assert.match(
    DOC,
    /(closed|collapsed|not on screen|until you open)/i,
    'the rail starts closed, so a page that sends a reader to it must say so',
  );
});

// ---------------------------------------------------------------------------
// The guard can fail.
// ---------------------------------------------------------------------------
test('the collapsed probe reads the file that decides, and can answer no', () => {
  // As measured on the deployed app: collapsed unless a stored preference says otherwise.
  assert.equal(railStartsCollapsed(), true, 'lib/shell.tsx no longer defaults the rail closed — re-measure the page');
  // And the shape of an app that opens it must read as open, or the caveat can never be retired.
  const opened = "function readCollapsed(): boolean {\n  return window.localStorage.getItem(K) === '1';\n}";
  const at = opened.indexOf('function readCollapsed');
  const body = opened.slice(at, opened.indexOf('\n}', at));
  assert.equal(/return true;/.test(body) && /!==\s*'0'/.test(body), false);
});

test('the guard rejects the sentence that shipped and accepts the one that replaced it', () => {
  const shipped =
    'Your balance sits in the footer of the left rail, beside your account. It is read when the ' +
    'workspace loads and does not refresh itself while you build — reload the page for the current figure.';
  assert.equal(/Usage and Credits/.test(shipped), false, 'the shipped sentence never named the dock');
  assert.equal(/(closed|collapsed|not on screen|until you open)/i.test(shipped), false, 'nor the caveat');

  const at = DOC.indexOf('How metering works');
  assert.ok(at > 0, 'the metering section is gone');
  const section = DOC.slice(at, at + 1400);
  assert.match(section, /Usage and Credits/, 'the correction must be in the paragraph that was wrong');
  assert.match(section, /(closed|collapsed|not on screen|until you open)/i);
});
