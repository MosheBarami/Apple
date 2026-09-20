/**
 * A MARK THAT CHANGES IS NOT A MARK.
 *
 * The shelf now draws each project a signature seeded from its id. The entire value of that is
 * RECOGNITION — you learn which card is yours by its shape, the way you learn a book by its spine.
 * A mark that redraws differently on the next visit is decoration wearing identity's clothes, and
 * it would be worse than the six identical rectangles it replaced, because it would actively teach
 * the wrong thing.
 *
 * So the properties under guard are not "does it render". They are:
 *
 *   STABLE  — the same id must produce byte-identical output, every time, in any order, with no
 *             dependence on how many marks were drawn before it.
 *   DISTINCT— different ids must produce visibly different marks, or the shelf is back where it
 *             started with extra SVG on it.
 *   HONEST  — no Math.random, no Date, no network, no storage. If any of those appear, the mark is
 *             not a function of the id any more and the first property is gone.
 *   QUIET   — decorative, aria-hidden, and exactly one accent line per mark.
 *
 * This renders the real component through react-dom/server rather than reading its source, because
 * "the file does not contain Math.random" and "the output is stable" are different claims and only
 * the second one is the one that matters.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const COMPONENT = join(WEB, 'src', 'components', 'project-signature.tsx');
const SOURCE = readFileSync(COMPONENT, 'utf8');
const CSS = readFileSync(join(WEB, 'src', 'routes', 'dashboard.css'), 'utf8');

/**
 * Compile the REAL component and run it, rather than reading its source for reassuring strings.
 * The esbuild binary and the compile-to-a-tempfile shape are both taken from
 * tests/build-plan-producer.test.mjs, which is the established idiom here; JSX is emitted against a
 * factory this file supplies, so no React install is involved and the recorded tree is exactly
 * what the component asked to draw.
 */
const DIR = mkdtempSync(join(tmpdir(), 'sig-'));
const OUT = join(DIR, 'signature.mjs');
execFileSync(
  join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [COMPONENT, '--loader:.tsx=tsx', '--format=esm', '--target=es2022', '--outfile=' + OUT],
  { stdio: 'pipe' },
);

/*
 * esbuild reads apps/web/tsconfig.json, which sets `"jsx": "react-jsx"`, so the output imports
 * `react/jsx-runtime` no matter what is passed on the command line. React is not resolvable from a
 * temp directory and installing it to run a test would be the tail wagging the dog, so the import
 * is repointed at a recorder written beside the compiled file. What comes back is exactly the tree
 * the component asked React to build.
 */
writeFileSync(join(DIR, 'jsx-runtime.mjs'), `
const h = (type, props, key) => {
  const { children, ...rest } = props ?? {};
  return {
    type: typeof type === 'function' ? type.name : type,
    props: key === undefined ? rest : { ...rest, key },
    children: children === undefined ? []
      : (Array.isArray(children) ? children : [children]).flat()
          .filter((c) => c !== null && c !== undefined && typeof c !== 'boolean'),
  };
};
export const jsx = h;
export const jsxs = h;
export const Fragment = 'Fragment';
`);
writeFileSync(OUT, readFileSync(OUT, 'utf8').replace(/["']react\/jsx-runtime["']/g, "'./jsx-runtime.mjs'"));

const { ProjectSignature } = await import(`file://${OUT}`);

const render = (id) => ProjectSignature({ id });

/** Flatten a recorded tree into a comparable string. */
function serialise(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node !== 'object') return String(node);
  const attrs = Object.entries(node.props ?? {})
    .filter(([k]) => k !== 'key' && k !== 'children')
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .sort()
    .join(' ');
  return `<${node.type} ${attrs}>${(node.children ?? []).map(serialise).join('')}</${node.type}>`;
}

/**
 * The source with comments removed. THE FIRST VERSION OF THIS FILE FAILED ON ITS OWN PROSE: the
 * component's header comment says "`Math.random()` is never called", and a raw scan for
 * /Math\.random/ matched that sentence and reported the component as reaching for the dice. A
 * guard that cannot tell a claim from the code is reading the wrong text.
 */
const CODE = SOURCE
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * Every path `d` in the rendered mark, taken FROM THE TREE.
 *
 * The first version of this pulled them out of the serialised string with
 * /d=(M[^ ]*(?: L[\d.]+ [\d.]+)*)/ — and a `d` value is full of spaces, so `[^ ]*` stopped at the
 * first one and every path came back as the literal "M0.0". Every project's geometry then compared
 * equal, which is what the distinctness test caught. The line-COUNT assertion in the test below it
 * kept passing the whole time, because counting "M0.0" occurrences still counts lines correctly —
 * by accident. Reading the attribute off the node cannot go wrong that way.
 */
function paths(node) {
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (typeof n.props?.d === 'string') out.push(n.props.d);
    for (const child of n.children ?? []) walk(child);
  };
  walk(node);
  return out;
}

test('the same project id draws the same mark, every time and in any order', () => {
  const a = serialise(render('p-lobby'));
  const b = serialise(render('p-lobby'));
  assert.equal(a, b, 'the same id drew two different marks — the signature is not a function of the id');

  // And it must not depend on what was drawn before it. A generator seeded once at module scope
  // rather than per call would pass the check above and fail this one.
  render('something-else');
  render('and-another');
  const c = serialise(render('p-lobby'));
  assert.equal(a, c,
    'the mark changed after other marks were drawn; the generator carries state between calls and '
    + 'a project would look different depending on its position on the shelf');
});

test('different projects look different', () => {
  const ids = ['p-lobby', 'p-tycoon', 'lava obby', 'Laundry Simulator', 'Laundry Simulator 2',
    '4d96a88c-79e6-4149-7f5d-040c7735aa2f', '52a4b8c5-7ac9-482c-acd1-1a16f9b980a4'];
  const marks = [];
  for (const id of ids) marks.push(serialise(render(id)));

  const unique = new Set(marks);
  assert.equal(unique.size, ids.length,
    `${ids.length} projects produced only ${unique.size} distinct marks — the shelf is back to `
    + 'identical cards with extra SVG on them');

  // Distinct STRINGS is not distinct LOOKS: two marks could differ only in a gradient id that
  // happens to carry the project id. Compare the drawn geometry on its own.
  const geometry = new Set();
  for (const id of ids) geometry.add(paths(render(id)).join('|'));
  assert.equal(geometry.size, ids.length,
    'two projects drew the same lines and differ only by an attribute nobody can see');
});

test('the mark is a function of the id and nothing else — no clock, no dice, no network', () => {
  for (const forbidden of [/Math\.random/, /Date\.now/, /new Date\b/, /performance\.now/,
    /localStorage/, /sessionStorage/, /fetch\s*\(/, /XMLHttpRequest/]) {
    assert.doesNotMatch(CODE, forbidden,
      `project-signature.tsx reaches for ${forbidden} — the mark stops being a function of the id`);
  }
});

test('it is decoration and says so', () => {
  const markup = serialise(render('p-lobby'));
  assert.match(markup, /aria-hidden=true/,
    'the mark is not hidden from assistive technology; it is not content and announces itself');
  assert.match(markup, /focusable=false/,
    'the SVG is focusable, so keyboard users tab through a decoration on every card');
});

test('exactly one line per mark spends the accent', () => {
  for (const id of ['p-lobby', 'p-tycoon', 'lava obby', 'x', 'zzzz']) {
    const markup = serialise(render(id));
    const accents = (markup.match(/is-accent/g) ?? []).length;
    assert.equal(accents, 1,
      `"${id}" drew ${accents} accent lines. One saturated colour used once is the rule the measured `
      + 'reference sites all follow; twenty cards of green lines is the defect, multiplied.');
    const total = paths(render(id)).length;
    assert.ok(total >= 5 && total <= 8,
      `"${id}" drew ${total} lines; the mark should stay between 5 and 8 or it reads as noise`);
  }
});

test('the stylesheet lets the mark reach the card edges and keeps it under the words', () => {
  assert.match(CSS, /\.shelf \.project-sig\s*\{[^}]*margin:\s*-20px -20px/,
    'the mark is not full-bleed; it sits inside the card padding as a framed picture');
  // It must not be given a z-index that lifts it over the content rows. The card lifts every child
  // to z-index 1 and settles equal rank by document order; the mark is first, so it stays behind.
  const block = /\.shelf \.project-sig\s*\{([^}]*)\}/.exec(CSS);
  assert.ok(block, 'no .project-sig rule at all');
  assert.doesNotMatch(block[1], /z-index/,
    'the mark sets a z-index. It is the first child precisely so document order keeps it under the '
    + 'project name — a z-index here is how it ends up painted over the words.');
});
