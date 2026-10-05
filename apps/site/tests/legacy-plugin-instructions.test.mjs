/**
 * NO PAGE, AND NO SOURCE OF THE SITE'S WORDS, TELLS ANYBODY TO BUILD, LOAD OR DOWNLOAD THE LEGACY apps/plugin (M2 site fix cycle 2, finding 8).
 *
 * This property used to be held by apps/site/tests/build-from-source-target.test.mjs, a test of ONE page (/docs/build-from-source). The docs rewrite folded that page
 * into /docs/plugin and deleted the test with its subject, and the property did not die with the page: it is a property of any page that tells a reader how to get a
 * plugin. `apps/plugin` is the legacy source. Its `handlers.run_code` builds a ModuleScript out of text that arrived over HTTP and calls `require` on it, which is remote
 * code execution in plugin context, and the Creator Store asset built from it was removed by Roblox for "Misusing Roblox Systems". A locally built legacy plugin
 * sends no capability report, so the worker's compatibility path withholds nothing and hands it every tool. The site promises "It will not run code it was sent",
 * true of `apps/studpilot-plugin` and false of what a page that said "rojo build apps/plugin" would have a reader load. The first guard was deleted with the page
 * and the mutation "Run rojo build apps/plugin/default.project.json and load the result as a local plugin." added to /docs/plugin left the whole suite green.
 *
 * THE PROPERTY. A page may NAME apps/plugin (to warn about it, which is the useful thing to say), but no built page and no source of words (every .astro, .md, .ts
 * under apps/site/src, comments stripped) may instruct anybody to build, load, install or download it, name its Rojo project, or name the CI plugin artifact
 * (`*-pr-unverified`, built from whatever a pull request contains, a fork's included).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE, realPages, textOf } from './lib/dist.mjs';
import { copySources } from './lib/site-sources.mjs';
import { visibleCopy } from './lib/visible-copy.mjs';

const ROOT = join(SITE, '..', '..');

/** Instructions, not mentions: a command, a path to its project file, or a "build/load/install X" sentence that names apps/plugin. */
const INSTRUCTS_LEGACY = [
  { id: 'rojo-build-legacy', re: /rojo\s+build\s+apps\/plugin\b/i },
  { id: 'legacy-project-file', re: /apps\/plugin\/default\.project\.json/i },
  { id: 'build-the-legacy', re: /\b(build|compile|load|install|download|use|run)\b[^.<]{0,60}\bapps\/plugin\b(?!\/README)/i },
  { id: 'legacy-then-load', re: /\bapps\/plugin\b[^.<]{0,60}\b(build|built|compile|compiled|load|loaded|install|installed|download|downloaded)\b/i },
];

/** The ids of every instruction pattern a text trips (comments, scripts and styles stripped first). */
const scan = (text) => INSTRUCTS_LEGACY.filter(({ re }) => re.test(visibleCopy(text))).map(({ id }) => id);

/** The name of the CI plugin artifact, read from ci.yml and never typed here: built from pull requests, marked unverified so nobody installs it. */
function unverifiedArtifact() {
  const ci = join(ROOT, '.github', 'workflows', 'ci.yml');
  assert.ok(existsSync(ci), '.github/workflows/ci.yml is missing: the CI artifact this guard keeps off the site cannot be named');
  const m = /\bname:\s*([\w-]*-pr-unverified)\b/.exec(readFileSync(ci, 'utf8'));
  assert.ok(m, 'THIS GUARD IS STALE: the CI plugin artifact is no longer named *-pr-unverified, so the reason no page may send readers to it has changed. Go and look.');
  return m[1];
}

test('THE PREMISE IS STILL TRUE: apps/plugin is still the legacy, code-executing build, and the shipped plugin is buildable the way the docs say', () => {
  const readme = readFileSync(join(ROOT, 'apps', 'plugin', 'README.md'), 'utf8');
  assert.match(readme, /^# apps\/plugin — NOT THE PRODUCT/m, 'THIS GUARD IS STALE, NOT THE SITE: apps/plugin/README.md no longer declares itself the legacy build. Re-read this file and decide what the site may say; do not delete it to get quiet.');
  const ops = readFileSync(join(ROOT, 'apps', 'plugin', 'src', 'Ops.luau'), 'utf8');
  assert.match(ops, /handlers\.run_code[\s\S]{0,2000}pcall\(require, module\)/, 'THIS GUARD IS STALE, NOT THE SITE: apps/plugin no longer requires a ModuleScript built from received text. The reason pages may not send readers to it may have gone; go and look.');
  assert.ok(existsSync(join(ROOT, 'apps', 'studpilot-plugin', 'scripts', 'build.mjs')), 'apps/studpilot-plugin/scripts/build.mjs is gone');
  assert.ok(existsSync(join(ROOT, 'apps', 'studpilot-plugin', 'default.project.json')), 'apps/studpilot-plugin has no Rojo project');
});

test('the scanner can see: the instruction that shipped, the mutation, a prose "load the build of apps/plugin" and the CI artifact are caught; the warning is not', () => {
  const shipped =
    '<p>The plugin lives in <code>apps/plugin</code> and is built with Rojo.</p>' +
    '<pre><code>rojo build apps/plugin/default.project.json --output studpilot-plugin.rbxm</code></pre>';
  const bad = scan(shipped);
  assert.ok(bad.includes('rojo-build-legacy') && bad.includes('legacy-project-file'), `the shipped instruction slipped past: ${bad.join(', ')}`);
  assert.ok(scan('<p>Run rojo build apps/plugin/default.project.json and load the result as a local plugin.</p>').length >= 1, 'the finding\'s mutation was not caught');
  assert.ok(scan('<p>Then build apps/plugin and open it in Studio.</p>').length >= 1, 'a build sentence naming apps/plugin was not caught');
  assert.ok(scan('<p>The source in apps/plugin is built with Rojo and loaded as a local plugin.</p>').length >= 1, 'a passive "apps/plugin is built ... loaded" sentence was not caught');
  // The warning the site may carry must not trip it, or the guard forces silence about the very thing a reader most needs warned about.
  assert.deepEqual(scan('<p>There is a second Studio plugin in the repository, <code>apps/plugin</code>. It is the legacy source the removed Creator Store asset was built from. Do not use it.</p>'), []);
  assert.deepEqual(scan('<!-- do not rojo build apps/plugin --><p>Nothing to see.</p>'), [], 'a comment is read as visible copy');
  // The artifact name comes from ci.yml and is looked for by name.
  assert.match(unverifiedArtifact(), /-pr-unverified$/);
});

test('no built page instructs a reader toward the legacy plugin or names the unverified CI artifact', () => {
  const artifact = unverifiedArtifact();
  const pages = realPages();
  const bad = [];
  for (const { route, html } of pages) {
    const text = textOf(html);
    const hit = scan(text);
    if (hit.length) bad.push(`${route}: instructs a reader toward apps/plugin (${hit.join(', ')})`);
    if (text.includes(artifact) || html.includes(artifact)) bad.push(`${route}: names the unverified CI artifact ${artifact}`);
  }
  assert.deepEqual(bad, []);
  assert.ok(pages.length >= 15, `only ${pages.length} pages were read`);
});

test('no source of the site\'s words (every .astro, .md, .ts under apps/site/src, comments stripped) instructs a reader toward the legacy plugin or names the unverified CI artifact', () => {
  const artifact = unverifiedArtifact();
  const sources = copySources();
  const bad = [];
  for (const { rel, text } of sources) {
    const hit = scan(text);
    if (hit.length) bad.push(`${rel}: instructs a reader toward apps/plugin (${hit.join(', ')})`);
    if (visibleCopy(text).includes(artifact)) bad.push(`${rel}: names the unverified CI artifact ${artifact}`);
  }
  assert.deepEqual(bad, []);
  assert.ok(sources.length >= 30);
});
