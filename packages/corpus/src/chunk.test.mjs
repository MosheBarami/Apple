// How a documentation page becomes retrievable chunks.
//
// WHY THIS FILE EXISTS. chunk.mjs is 525 lines and had ZERO exports and a `main()` call at module
// scope, so importing anything from it executed the whole corpus build — walking creator-docs,
// packing thousands of chunks, writing a multi-megabyte artefact. The heading and code-block
// splitting was not hard to test; the file could not be loaded.
//
// What it decides matters downstream: a chunk that splits a code fence in half retrieves as two
// fragments that each look like valid documentation and neither of which runs. A section that
// splits on a `##` inside a shell block attributes half a page to the wrong heading. Both produce
// plausible, wrong answers rather than errors — which is the failure mode this corpus exists to
// avoid, since the model quotes what it retrieves.
//
// Found by Tommy while citing backlog rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toBlocks, splitByH2, stripFrontmatter, stripMdx, slugify, oneLine, guidePriority } from './chunk.mjs';

/* ------------------------------------------------------------------ blocks --- */

test('a blank line separates blocks', () => {
  assert.deepEqual(toBlocks('one\n\ntwo\n\nthree'), ['one', 'two', 'three']);
});

test('A FENCED CODE BLOCK IS ONE BLOCK, however many blank lines it contains', () => {
  // The defect this guards: Luau samples routinely contain blank lines between statements. Split
  // on them and the corpus holds two fragments that each look like code and neither of which runs.
  const md = 'intro\n\n```lua\nlocal a = 1\n\nlocal b = 2\n```\n\nafter';
  const blocks = toBlocks(md);
  assert.equal(blocks.length, 3, `expected intro/code/after, got ${blocks.length}: ${JSON.stringify(blocks)}`);
  assert.equal(blocks[1], '```lua\nlocal a = 1\n\nlocal b = 2\n```');
  assert.ok(blocks[1].startsWith('```') && blocks[1].endsWith('```'), 'the fence must survive whole');
});

test('tildes fence as well as backticks', () => {
  const blocks = toBlocks('a\n\n~~~lua\nx = 1\n\ny = 2\n~~~\n\nb');
  assert.equal(blocks.length, 3);
  assert.match(blocks[1], /^~~~lua[\s\S]*~~~$/);
});

test('an unterminated fence does not swallow the rest of the page silently', () => {
  // Real documentation contains malformed markdown. Whatever the policy, the content must still
  // arrive: losing the tail of a page is the kind of absence nobody notices.
  const blocks = toBlocks('before\n\n```lua\nlocal a = 1\n\nstill inside');
  assert.ok(blocks.join('\n').includes('still inside'), 'content after an unclosed fence must not vanish');
});

/* ---------------------------------------------------------------- sections --- */

test('a page splits on its H2 headings, and the heading travels with the body', () => {
  const s = splitByH2('lead in\n\n## First\nalpha\n\n## Second\nbeta', 'Page');
  assert.deepEqual(s.map((x) => x.heading), ['', 'First', 'Second']);
  assert.match(s[1].body, /alpha/);
  assert.match(s[2].body, /beta/);
});

test('A `##` INSIDE A CODE FENCE IS NOT A HEADING', () => {
  // A shell sample with a comment — `## install the plugin` — would otherwise start a new section
  // mid-fence, attributing the rest of the page to a heading that is a line of someone's script.
  const md = 'intro\n\n## Real\n```bash\n## not a heading\necho hi\n```\nstill under Real\n\n## Also Real\ntail';
  const s = splitByH2(md, 'Page');
  assert.deepEqual(s.map((x) => x.heading), ['', 'Real', 'Also Real'],
    `a fenced ## started a section: ${JSON.stringify(s.map((x) => x.heading))}`);
  assert.match(s[1].body, /still under Real/, 'the text after the fence belongs to the heading above it');
});

test('H3 and deeper do not split — only H2 is a section boundary', () => {
  const s = splitByH2('## Top\n### Sub\nbody', 'Page');
  assert.equal(s.length, 1);
  assert.match(s[0].body, /### Sub/, 'a sub-heading stays inside its section as content');
});

test('markup in a heading is stripped, because the heading becomes a title', () => {
  const s = splitByH2('## `Part.Size` **matters**\nbody', 'Page');
  assert.equal(s[0].heading, 'Part.Size matters');
});

test('a page with no headings still yields a section rather than nothing', () => {
  const s = splitByH2('just prose, no headings at all', 'Page');
  assert.equal(s.length, 1);
  assert.match(s[0].body, /just prose/);
});

/* -------------------------------------------------------------- front matter --- */

test('frontmatter is parsed out, and a page that merely starts with a rule is not truncated', () => {
  // It returns { meta, body }, not a string. My first version of this test asserted on the object
  // and failed — the code was right and the test was wrong, which is worth leaving a note about
  // since a red test is usually read as a defect in the code.
  const withFm = stripFrontmatter('---\ntitle: X\n---\nbody here');
  assert.equal(withFm.meta.title, 'X', 'the frontmatter must be parsed, not merely removed');
  assert.match(withFm.body, /^body here/);

  // The failure worth guarding: treating a horizontal rule as an unterminated frontmatter block
  // would silently drop the whole page. It does not — no closing delimiter, no match.
  const noFm = stripFrontmatter('---\n\nactual content');
  assert.match(noFm.body, /actual content/, 'content must survive a leading horizontal rule');
  assert.deepEqual(noFm.meta, {}, 'and no metadata should be invented from it');

  // Malformed YAML must not throw: real documentation contains it, and one bad page must not end
  // a corpus build.
  const bad = stripFrontmatter('---\ntitle: [unclosed\n---\nbody');
  assert.deepEqual(bad.meta, {});
  assert.match(bad.body, /body/);
});

/* ------------------------------------------------------------------- slugs --- */

test('a slug is stable, lowercase and free of punctuation', () => {
  assert.equal(slugify('Part.Size & CFrame!'), slugify('Part.Size & CFrame!'));
  assert.match(slugify('Part.Size & CFrame!'), /^[a-z0-9-]+$/);
});

test('oneLine collapses whitespace and bounds the length', () => {
  const long = oneLine('a'.repeat(400), 170);
  assert.ok(long.length <= 171, `expected a bounded line, got ${long.length}`);
  assert.equal(oneLine('two\n\n  lines'), 'two lines');
});

test('guidePriority is a total order, so chunk selection is not arbitrary', () => {
  const paths = ['getting-started/index.md', 'reference/engine/classes/Part.md', 'random/thing.md'];
  for (const p of paths) assert.equal(typeof guidePriority(p), 'number', `${p} has no priority`);
});

test('visual-building guides get an embed bucket instead of staying keyword-only', () => {
  // Measured 2026-09-23: Parts, Terrain, Lighting and Atmosphere guides were FTS-only (bucket 99), so
  // a semantic query about building a map or lighting a scene could never reach them.
  for (const p of ['parts/terrain.md', 'environment/lighting.md', 'effects/particle-emitters.md', 'art/modeling/index.md', 'workspace/cframes.md', 'physics/constraints.md', 'animation/index.md', 'studio/toolbox.md']) {
    const bucket = guidePriority(p);
    assert.ok(bucket > guidePriority('tutorials/x.md') && bucket < 99, `${p} -> ${bucket}`);
  }
  assert.equal(guidePriority('production/monetization/index.md'), 99);
});
