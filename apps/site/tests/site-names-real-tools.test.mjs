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

const built = existsSync(DIST) ? pages() : [];
const found = new Map();
for (const file of built) {
  for (const [, token] of visible(readFileSync(join(DIST, file), 'utf8')).matchAll(TOOLISH)) {
    if (!found.has(token)) found.set(token, new Set());
    found.get(token).add(file);
  }
}

test('the build and the registry are both here, or this file has measured nothing', () => {
  assert.ok(built.length >= 10, `only ${built.length} built pages — run \`npx astro build\` first`);
  assert.ok(existsSync(REGISTRY), `the tool registry is not at ${REGISTRY}; this guard has no source of truth`);
  assert.ok(declaredTools().size >= 20, 'the registry scan found almost no tools — the extraction has stopped working');
  assert.ok(found.size >= 5, `only ${found.size} tool-shaped words on the whole site — the scanner is not reading the pages`);
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

test('the guard has teeth', () => {
  const tools = declaredTools();

  // 1. The registry read is real, and it does not contain the op the landing used to print.
  assert.ok(tools.has('get_project_tree'), 'the extraction lost a tool that certainly exists');
  assert.ok(!tools.has('get_tree'), 'the extraction is picking up wire ops, so the check above proves nothing');

  // 2. A name nobody registers is rejected. This is the assertion the test above makes, run
  //    against an input chosen here so the mechanism is exercised even on a clean site.
  assert.ok(!tools.has('summon_the_parts'), 'the registry appears to contain anything asked of it');

  // 3. The site really is printing tool names. Without this, deleting the figure and the proof
  //    page would leave every assertion above passing over an empty set.
  const seen = [...found.keys()].filter((t) => tools.has(t));
  assert.ok(
    seen.length >= 5,
    `only ${seen.length} real tool names are on the site (${seen.join(', ')}) — the pages that named ` +
      'them have been rewritten, and this guard is now checking nothing',
  );

  // 4. AND THE FIGURE THIS GUARD WAS BORN FROM IS STILL A FIGURE OF TOOL CALLS.
  //
  //    THIS ASSERTION WAS WRITTEN TWICE BECAUSE THE FIRST VERSION DID NOT FAIL. Emptying the
  //    landing's activity array was tried as a mutation, and both "at least five real tool names on
  //    the site" and "at least one on the landing" stayed green: /proof alone prints six, and the
  //    proof band above the figure quotes `create_instances` out of the plugin's own refusal. Two
  //    tripwires, neither of them covering the one element this file exists for. The figure could
  //    have been replaced by a paragraph and this guard would have gone on reporting a clean site.
  //
  //    So it reads the figure. If the activity block is ever removed or renamed ON PURPOSE, this is
  //    the line to change, and changing it should cost a sentence saying what replaced it — the
  //    landing's depiction of a run is the only place on this site where a wrong tool name has
  //    actually shipped.
  const landing = readFileSync(join(DIST, 'index.html'), 'utf8');
  const figure = landing.match(/<div class="activity"[^>]*>([\s\S]*?)<\/div>\s*<\/figure>/);
  assert.ok(
    figure,
    'the landing has no activity figure any more — it was renamed or removed, and assertions 1-3 ' +
      'would have stayed green over its absence',
  );
  const inFigure = [...new Set([...visible(figure[1]).matchAll(TOOLISH)].map((m) => m[1]))];
  assert.ok(
    inFigure.some((t) => tools.has(t)),
    `the landing's activity figure no longer names a single registered tool (found: ${inFigure.join(', ') || 'nothing'})`,
  );
});
