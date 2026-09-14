/**
 * The canonical status marks, and the shortcut they replaced.
 *
 * Before this there were four drawings of the same idea: a literal `✓` in
 * pairing-dialog.tsx and loading.tsx, `✓ ✗ –` in generative-ui/render.tsx, and inline
 * SVG in ws/activity.tsx. A Unicode tick renders in whatever the font decides — its own
 * weight, baseline and size, next to marks drawn at 1.7 stroke — and it is TEXT, so a
 * screen reader reads "check mark" beside the word it duplicates unless every call site
 * remembers aria-hidden.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(WEB, 'src');
const out = join(mkdtempSync(join(tmpdir(), 'status-')), 'status.mjs');
execFileSync(join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(SRC, 'components', 'status-icon-model.ts'), '--bundle', '--format=esm',
   '--platform=neutral', '--main-fields=main,module', '--outfile=' + out], { stdio: 'pipe' });
const { STATUS, STATUS_PATH } = await import(out);

test('every status carries a canonical id from the reference board', () => {
  for (const [name, spec] of Object.entries(STATUS)) {
    assert.match(spec.canonical, /^I\d{2}$/, `${name} has no canonical id`);
  }
  const ids = Object.values(STATUS).map((s) => s.canonical);
  assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids.join(', ')}`);
});

test('tone never contradicts the meaning', () => {
  // The §16.3 drift, and one careless copy away: a success in the failure colour.
  const MUST = {
    success: 'good', error: 'bad', warning: 'warn', info: 'info',
    pending: 'muted', waiting: 'muted', skipped: 'muted',
    locked: 'warn', experimental: 'future',
  };
  for (const [name, tone] of Object.entries(MUST)) {
    assert.equal(STATUS[name].tone, tone, `${name} is toned ${STATUS[name].tone}`);
  }
});

test('every tone has a stylesheet rule, so none renders in the inherited colour', () => {
  const css = readFileSync(join(SRC, 'styles', 'workspace.css'), 'utf8');
  for (const spec of Object.values(STATUS)) {
    assert.ok(css.includes(`.st--${spec.tone}`), `.st--${spec.tone} has no rule`);
  }
});

test('every mark is real SVG path data', () => {
  for (const [name, d] of Object.entries(STATUS_PATH)) {
    assert.match(d, /^M/, `${name} does not start with a moveto`);
    assert.ok(!/[^MmLlHhVvCcSsQqTtAaZz0-9.,\-\s]/.test(d), `${name} has a non-path character`);
  }
});

test('success and error are visibly different shapes, not the same path recoloured', () => {
  // Colour alone is not a status: a red tick and a green tick read identically to
  // anyone who cannot distinguish them.
  assert.notEqual(STATUS.success.path, STATUS.error.path);
  assert.notEqual(STATUS.warning.path, STATUS.info.path);
});

// --- the shortcut does not come back ------------------------------------------

function sources(dir = SRC, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, acc);
    else if (/\.tsx?$/.test(name)) acc.push(p);
  }
  return acc;
}

test('no source draws a status with a Unicode character', () => {
  //[[ The whole reason the component exists. A `✓` in JSX is one keystroke and it
  //   brings its own font metrics and its own screen-reader announcement with it.
  //   Caught here rather than in review, because it looks fine in a diff. ]]
  //[[ STATUS marks only. `×` is deliberately NOT here: it is the multiplication sign
  //   and this codebase uses it correctly for dimensions — `160×100`, `86 × 24 × 74
  //   studs`, `4×4 tiles` — as well as for the close affordance on toast and modal,
  //   which carry their own aria-labels. My first version included it and flagged six
  //   legitimate uses. A guard that cries wolf is one people delete. ]]
  const MARKS = /[✓✔✗✘⚠]/;
  const offenders = [];
  for (const file of sources()) {
    const src = readFileSync(file, 'utf8');
    // Only lines that RENDER. A mark inside a comment is prose ABOUT the mark, and
    // this file's own header quotes the characters it bans — the first version of this
    // loop flagged its own documentation, because stripping `//` and a single-line
    // `/* */` does not see a JSDoc block where every line begins ` * `.
    let inBlock = false;
    for (const [i, raw] of src.split('\n').entries()) {
      const trimmed = raw.trim();
      if (inBlock) {
        if (trimmed.includes('*/')) inBlock = false;
        continue;
      }
      if (trimmed.startsWith('/*')) {
        if (!trimmed.includes('*/')) inBlock = true;
        continue;
      }
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      const code = raw.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
      if (MARKS.test(code)) offenders.push(`${relative(WEB, file)}:${i + 1}`);
    }
  }
  assert.deepEqual(offenders, [],
    'a status is being drawn with a Unicode character. Use <StatusIcon>, which brings '
    + 'its own tone, size and aria treatment.');
});

test('the marks that were replaced are actually gone from their call sites', () => {
  for (const f of ['components/pairing-dialog.tsx', 'components/loading.tsx', 'lib/generative-ui/render.tsx']) {
    const src = readFileSync(join(SRC, f), 'utf8');
    assert.match(src, /StatusIcon/, `${f} still draws its own mark instead of the shared one`);
  }
});

test('exactly one mark animates, and it is the one that means work is happening', () => {
  // A guard against the drift in both directions: a static `pending` reads as a broken
  // circle rather than as progress, and a spinning `success` would claim the work is
  // still going after it has finished.
  const spinning = Object.entries(STATUS)
    .filter(([, spec]) => spec.spin)
    .map(([name]) => name);
  assert.deepEqual(spinning, ['pending']);

  // And the animation must actually exist, with a reduced-motion escape.
  const css = readFileSync(join(WEB, 'src/styles/workspace.css'), 'utf8');
  assert.match(css, /\.st--spin \{[^}]*animation:/, '.st--spin must animate');
  assert.match(
    css,
    /prefers-reduced-motion: reduce\) \{ \.st--spin \{ animation: none/,
    'and must stop for a reader who asked for less motion',
  );
});
