/**
 * THE SITE MAY NOT PRINT THE NAME OF A TOOL THE PRODUCT DOES NOT HAVE.
 *
 * THE DEFECT THIS WAS WRITTEN AGAINST WAS LIVE WHEN IT WAS WRITTEN. The landing's "How a run
 * actually goes" figure — captioned "Studio · activity", drawn to look like the log a user watches
 * — opened with `get_tree`. There is no tool called `get_tree`. It is the plugin's wire op, the
 * thing `get_project_tree` sends down the socket (apps/worker/src/tools.ts, `studioOps:
 * ['get_tree']`), and no user has ever seen it in an activity log or ever will. The figure's other
 * six lines were right, which is exactly why nobody noticed: five real tool names and one internal
 * protocol verb read identically to anyone who is not holding the registry open beside the page.
 *
 * WHY THIS IS WORTH A GUARD RATHER THAN A CORRECTION. Tool names are the site's most quotable
 * technical detail and its least durable: the registry gains and loses entries every week, and the
 * evidence file docs/evidence/2026-09-01-activity-vocabulary.md records four separate copies of
 * one tool table drifting apart inside this repository alone. The marketing site was a fifth copy
 * that nothing compared to anything.
 *
 * THE SOURCE OF TRUTH IS WHAT THE MODEL IS TOLD, not a list typed here. `name: '…'` inside
 * apps/worker/src/tools.ts is the string the tool is advertised under; a tool renamed there and not
 * renamed on the site turns this red the same day, with no edit to this file. Rename a tool and
 * this fails until the page catches up, which is the point.
 *
 * IT READS THE BUILT PAGES, because the landing assembles its figure from an array in the page's
 * frontmatter and /proof from a data module, and a scanner that read one source file would check
 * one of them. Comments, scripts and styles are stripped first: a reason written beside a line
 * about a withdrawn tool is not copy, and a guard that fires on its own explanation gets deleted.
 *
 * Run with:  node --test tests/site-names-real-tools.test.mjs      (from apps/site, after a build)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(SITE, '..', '..');
const DIST = join(SITE, 'dist');
const REGISTRY = join(ROOT, 'apps', 'worker', 'src', 'tools.ts');

/** Every name the worker advertises a tool under. */
function declaredTools() {
  const src = readFileSync(REGISTRY, 'utf8');
  return new Set([...src.matchAll(/\bname: '([a-z][a-z0-9_]*)'/g)].map((m) => m[1]));
}

function pages(dir = '', out = []) {
  for (const entry of readdirSync(join(DIST, dir)).sort()) {
    const rel = dir ? `${dir}/${entry}` : entry;
    if (statSync(join(DIST, rel)).isDirectory()) pages(rel, out);
    else if (entry.endsWith('.html')) out.push(rel);
  }
  return out;
}

/** Visible words only: tags, scripts and styles removed. */
const visible = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');

/**
 * `snake_case` in running copy is a tool name on this site and nothing else — measured: eleven
 * distinct tokens across twenty built pages, every one of them a tool. The shape is required to
 * hold an underscore between two lowercase runs, so CSS hooks, data attributes and hyphenated
 * words are not candidates, and tags are gone before this runs.
 */
const TOOLISH = /\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g;

/**
 * A NAME A PAGE WRITES AT RUNTIME IS AS VISIBLE AS ONE IT SHIPS IN ITS MARKUP, and the first
 * version of this file could not see it. It stripped `<script>` — correctly, because the site's
 * other copy guards do, and for the right reason: a bundle is not prose. But the landing's
 * read-the-tree demo builds its readout in JavaScript, `'get_tree  game.' + path + '  ok'`, and a
 * visitor who clicks a node reads that string off the page. So the wire op was fixed in the figure
 * and shipped in the demo on the same commit, and this guard reported the site clean.
 *
 * The scan is over STRING LITERALS inside those scripts, not over the code: identifiers, property
 * names and minified locals are not copy, and a scan that could not tell them apart would be a
 * guard nobody could keep green. Measured across the twenty built pages: exactly one snake_case
 * token appears inside any inline-script literal, and it is a tool name.
 */
function literalsIn(html) {
  const out = [];
  for (const [, body] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const m of body.matchAll(/'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\\n]*)`/g)) out.push(m[1] ?? m[2] ?? m[3]);
  }
  return out.join('\n');
}

const built = existsSync(DIST) ? pages() : [];
const found = new Map();
for (const file of built) {
  const html = readFileSync(join(DIST, file), 'utf8');
  for (const source of [visible(html), literalsIn(html)]) {
    for (const [, token] of source.matchAll(TOOLISH)) {
      if (!found.has(token)) found.set(token, new Set());
      found.get(token).add(file);
    }
  }
}

// RESTATED 2026-10-05 (M2 rebuild). The old canaries demanded that the site print at least five real tool names, because the old front
// page and /proof did (an activity log drawn with `get_tree`, a recorded run). The rebuilt marketing pages name no tool at all: they
// say "a play test", "button presses", "a layout check" in words a 13-year-old reads (handoff M2, "Copy"). The property is unchanged
// (anything the site prints that looks like a tool name must be one the worker registers), and the canaries now prove the SCANNER can
// see a tool name, on a synthetic page, instead of demanding that the site print some.
test('the build and the registry are both here, and the scanner can see a tool name in a page and in a script literal', () => {
  assert.ok(built.length >= 10, `only ${built.length} built pages — run \`npx astro build\` first`);
  assert.ok(existsSync(REGISTRY), `the tool registry is not at ${REGISTRY}; this guard has no source of truth`);
  assert.ok(declaredTools().size >= 20, 'the registry scan found almost no tools — the extraction has stopped working');
  const seenInMarkup = [...visible('<p>It calls <code>get_project_tree</code> first.</p>').matchAll(TOOLISH)].map((m) => m[1]);
  assert.deepEqual(seenInMarkup, ['get_project_tree'], 'the scanner is blind to a tool name in running copy');
  const seenInScript = [...literalsIn('<script>log("get_tree  game.x  ok")</script>').matchAll(TOOLISH)].map((m) => m[1]);
  assert.deepEqual(seenInScript, ['get_tree'], 'the scanner is blind to a tool name written by a script at runtime');
});

test('every tool name printed on this site is one the worker actually registers', () => {
  const tools = declaredTools();
  const wrong = [];
  for (const [token, files] of found) {
    if (!tools.has(token)) wrong.push(`${token} — on ${[...files].sort().join(', ')}`);
  }
  assert.deepEqual(
    wrong.sort(),
    [],
    'the site prints a name that is not a tool in apps/worker/src/tools.ts:\n  ' +
      wrong.sort().join('\n  ') +
      '\n\nA wire op is not a tool. `get_tree` is what `get_project_tree` sends to the plugin, and ' +
      'a user never sees it.',
  );
});

test('the guard has teeth, and the marketing pages say it in words: no tool name on /, /how-it-works, /catalog or /pricing', () => {
  const tools = declaredTools();

  // 1. The registry read is real, and it does not contain the op the landing used to print.
  assert.ok(tools.has('get_project_tree'), 'the extraction lost a tool that certainly exists');
  assert.ok(!tools.has('get_tree'), 'the extraction is picking up wire ops, so the check above proves nothing');

  // 2. A name nobody registers is rejected. This is the assertion the test above makes, run against an input chosen here so the
  //    mechanism is exercised even on a clean site.
  assert.ok(!tools.has('summon_the_parts'), 'the registry appears to contain anything asked of it');

  // 3. The rebuilt marketing pages print no tool name at all. (The old assertion here read the landing's "activity" figure, a
  //    drawn log that was deleted with the old front page; it is replaced by the stronger rule that those pages use plain words.)
  for (const route of ['index.html', 'how-it-works/index.html', 'catalog/index.html', 'pricing/index.html']) {
    const html = readFileSync(join(DIST, route), 'utf8');
    const named = [...new Set([...visible(html).matchAll(TOOLISH), ...literalsIn(html).matchAll(TOOLISH)].map((m) => m[1]))];
    assert.deepEqual(named, [], `${route} prints technical names: ${named.join(', ')}. The marketing pages say it in words.`);
  }
});
