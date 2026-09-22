/**
 * THE ONE BUILD INSTRUCTION THIS PRODUCT PUBLISHES MUST BUILD THE PLUGIN IT SHIPS.
 *
 * Public Creator Store installation is closed, so /docs/build-from-source is the only way a reader
 * can end up with an Apple plugin at all. It said "The plugin lives in apps/plugin" and gave
 * `rojo build apps/plugin/default.project.json`.
 *
 * `apps/plugin` is the legacy source. Its `handlers.run_code` builds a ModuleScript out of text
 * that arrived over HTTP and calls `require` on it — remote code execution in plugin context — and
 * the Creator Store asset built from it was removed by Roblox for "Misusing Roblox Systems". The
 * worker still emits `run_code` from a dozen tools, and a locally built legacy plugin sends no
 * capability report at all, so the worker's compatibility path withholds nothing and hands them all
 * over. Meanwhile the landing page promises "It will not run code it was sent" and /docs/plugin
 * promises "Refuses by name: ... it will not execute code it was sent" — both true of
 * `apps/apple-plugin`, which declares that refusal by name, and both false of what this page built.
 *
 * The 2026-09-19 decision reached the CI workflows and never reached this page. It also left the
 * page naming a CI artifact, `apple-plugin`, that ci.yml had renamed to `apple-plugin-pr-unverified`
 * — and which is built from the legacy source anyway, so the paragraph offering it as a shortcut is
 * gone rather than corrected.
 *
 * THE PROPERTY. The page may NAME apps/plugin — it now warns about it, which is the useful thing to
 * say — but it may not instruct anybody to build, download or load it. What it must contain is the
 * shipped plugin's own build command.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { visibleCopy } from './lib/visible-copy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..');
const ROOT = join(SITE, '..', '..');
const PAGE = join(SITE, 'src', 'pages', 'docs', 'build-from-source.astro');
const page = readFileSync(PAGE, 'utf8');

/** Instructions, not mentions: a command, a path in a code block, or a "build/load X" sentence. */
const INSTRUCTS_LEGACY = [
  { id: 'rojo-build-legacy', re: /rojo\s+build\s+apps\/plugin\b/i },
  { id: 'legacy-project-file', re: /apps\/plugin\/default\.project\.json/i },
  { id: 'build-the-legacy', re: /\b(build|compile|load|install)\b[^.<]{0,40}\bapps\/plugin\b(?!\/README)/i },
];

function scan(text) {
  const hay = visibleCopy(text);
  return INSTRUCTS_LEGACY.filter(({ re }) => re.test(hay)).map(({ id }) => id);
}

test('THE PREMISE IS STILL TRUE: apps/plugin is still the legacy, code-executing build', () => {
  const readme = readFileSync(join(ROOT, 'apps', 'plugin', 'README.md'), 'utf8');
  assert.match(
    readme,
    /^# apps\/plugin — NOT THE PRODUCT/m,
    'THIS GUARD IS STALE, NOT THE PAGE: apps/plugin/README.md no longer declares itself the legacy ' +
      'build. If the two plugins were merged or the legacy one was retired, re-read this file and ' +
      'decide what the build page should say — do not delete it to get quiet.',
  );
  const ops = readFileSync(join(ROOT, 'apps', 'plugin', 'src', 'Ops.luau'), 'utf8');
  assert.match(
    ops,
    /handlers\.run_code[\s\S]{0,2000}pcall\(require, module\)/,
    'THIS GUARD IS STALE, NOT THE PAGE: apps/plugin no longer requires a ModuleScript built from ' +
      'received text. The reason this page was retargeted may have gone — go and look.',
  );

  // And the plugin the page now names must actually be buildable the way the page says.
  assert.ok(
    existsSync(join(ROOT, 'apps', 'apple-plugin', 'scripts', 'build.mjs')),
    'apps/apple-plugin/scripts/build.mjs is gone, so the command this page publishes does not run',
  );
  assert.ok(
    existsSync(join(ROOT, 'apps', 'apple-plugin', 'default.project.json')),
    'apps/apple-plugin has no Rojo project, so build.mjs cannot produce the artifact the page names',
  );
});

test('the page does not tell anybody to build, load or download the legacy plugin', () => {
  const bad = scan(page);
  assert.deepEqual(
    bad,
    [],
    `/docs/build-from-source instructs a reader toward apps/plugin (${bad.join(', ')}). That is the ` +
      'source Roblox removed, and it executes Luau it is sent. Point at apps/apple-plugin.',
  );
});

test('the page publishes the shipped plugin and the command that builds it', () => {
  const hay = visibleCopy(page);
  assert.match(hay, /node apps\/apple-plugin\/scripts\/build\.mjs/,
    'the page no longer gives the build command for the plugin this product ships');
  assert.match(hay, /apps\/apple-plugin\/release\/apple-studio\.rbxm/,
    'the page does not say where the artifact lands, so a reader has nothing to load into Studio');
  assert.match(hay, /apps\/plugin/,
    'the page no longer warns about apps/plugin at all — a reader who finds it in the tree has ' +
      'nothing telling them not to load it');

  // The dead CI artifact must not come back: ci.yml builds the LEGACY plugin and publishes it as
  // apple-plugin-pr-unverified, so neither that name nor the old one belongs on this page.
  //[[ RESTATED 2026-09-22, WHEN THIS TRIPWIRE FIRED ON AN IMPROVEMENT.
  //
  //   It pinned `rojo build apps/plugin/default.project.json` in ci.yml, with the message "THIS GUARD
  //   IS STALE ... Go and look." A peer moved the CI plugin job onto the shipped plugin —
  //   `node apps/apple-plugin/scripts/build.mjs`, which also verifies the built bytes — and it fired,
  //   which is its job. Looking: the reason this page may not send readers to the CI artifact did not
  //   go away with the legacy build. That artifact is built from whatever a pull request contains,
  //   including a fork's, and ci.yml still names it `…-pr-unverified` so nobody installs it.
  //
  //   So the property is restated in its own terms: CI's plugin artifact is still marked unverified,
  //   its name is read from ci.yml (not typed here), and the page never names or offers it. ]]
  const ci = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  const artifact = /\bname:\s*([\w-]*-pr-unverified)\b/.exec(ci);
  assert.ok(artifact,
    'THIS GUARD IS STALE: the CI plugin artifact is no longer named *-pr-unverified, so the reason this ' +
      'page may not send readers to it has changed. Go and look.');
  assert.ok(!hay.includes(artifact[1]), `the page names the unverified CI artifact ${artifact[1]}`);
  assert.doesNotMatch(hay, /\bartifact\b[^.<]{0,60}\bapple-(?:plugin|studio)\b/i,
    'the page offers a CI artifact again — it is built from pull requests and is not an install path');
});

test('the guard has teeth: it fails on the instruction that shipped', () => {
  const shipped =
    '<p>The plugin lives in <code>apps/plugin</code> and is built with Rojo.</p>' +
    '<pre><code>rojo build apps/plugin/default.project.json --output apple-plugin.rbxm</code></pre>';
  const bad = scan(shipped);
  assert.ok(bad.length > 0, 'the shipped instruction slipped past every pattern — re-aim them');
  assert.ok(bad.includes('rojo-build-legacy') && bad.includes('legacy-project-file'), bad.join(', '));

  // The warning the page now carries must NOT trip it, or the guard forces the page into silence
  // about the very thing a reader most needs warned about.
  const warning =
    '<p>There is a second Studio plugin in the repository, <code>apps/plugin</code>. It is the ' +
    'legacy source the removed Creator Store asset was built from.</p>';
  assert.deepEqual(scan(warning), []);
});
