// THE ONE BLOG POST SAYS ONLY WHAT IS TRUE OF THE CODE ("What works today in the StudPilot beta", handoff M2: honest copy).
//
// Markdown cannot read the shared pricing config, so the figures in the post are typed. This guard is what keeps them honest: each figure
// is compared with the config, and each "not there yet" line is compared with the fact it denies, read from the repository. The post itself
// is a content-collection entry (src/content/blog/*.md, no MDX) with a title, a description and a date.
//
// Run with:  pnpm --filter @studpilot/site build && node --test tests/blog-post.test.mjs   (from apps/site)
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE, distPage, textOf, walkFiles } from './lib/dist.mjs';

const BLOG = join(SITE, 'src', 'content', 'blog');
const shared = await import('../../../packages/shared/src/index.ts');

function post(name) {
  const raw = readFileSync(join(BLOG, name), 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  assert.ok(m, `${name} has no frontmatter`);
  const front = Object.fromEntries(m[1].split('\n').map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()]));
  return { front, body: m[2] };
}

test('the blog is a content collection of Markdown (no MDX), and its posts carry a title, a description and a date', () => {
  const files = walkFiles(BLOG);
  assert.ok(files.length > 0, 'the blog holds no post');
  for (const f of files) assert.match(f, /\.md$/, `${f} is not Markdown`);
  assert.ok(existsSync(join(SITE, 'src', 'content.config.ts')), 'src/content.config.ts is missing');
  for (const f of files) {
    const { front } = post(f);
    for (const k of ['title', 'description', 'date']) assert.ok(front[k], `${f} has no ${k}`);
    assert.match(front.date, /^\d{4}-\d{2}-\d{2}$/);
  }
  assert.equal(post('what-works-today.md').front.title, 'What works today in the StudPilot beta');
});

test('the figures in the post are the config\'s: Free is 5 Credits a day and 30 a month, a Credit is about $0.05, a typical build about 1.40', () => {
  const { body } = post('what-works-today.md');
  const free = shared.PLAN_TABLE.free;
  assert.ok(body.includes(`${free.creditsPerDay} Credits a day, up to ${free.creditsPerMonth} a month`), 'the Free allowance in the post differs from PLAN_TABLE.free');
  assert.ok(body.includes(`about ${shared.formatMoney(shared.CREDIT_USD)} of AI compute`), 'the Credit price in the post differs from CREDIT_USD');
  assert.ok(body.includes(`about ${shared.formatCredits(shared.TYPICAL_BUILD_CREDITS)} Credits`), 'the typical build in the post differs from TYPICAL_BUILD_CREDITS');
});

test('every "not there yet" line is still true of the repository, so the post cannot go stale quietly', () => {
  const { body } = post('what-works-today.md');
  // Paid plans are not for sale: no credit checkout, and the pricing page has only disabled buttons.
  assert.equal(shared.CREDIT_PURCHASE_LIVE, false, 'credits can be bought now: the post says paid plans are not for sale');
  assert.match(body, /Paid plans are not for sale/);
  // The plugin is not on the Creator Store.
  assert.equal(shared.STUDIO_PLUGIN_STORE_LIVE, false, 'the store listing is live: the post says the plugin is not on the Creator Store');
  assert.match(body, /The plugin is not on the Creator Store/);
  // Google and Discord sign-in are not enabled: the app draws those buttons only when its provider is on, and the post says they are coming.
  assert.match(body, /Google and Discord sign-in are coming/);
  // No settings panel and no block engine in the repository.
  const web = join(SITE, '..', 'web', 'src');
  assert.equal(walkFiles(web, (p) => /piece-settings|settings-panel-piece|PieceSettings/.test(p)).length, 0, 'a per-piece settings panel exists: the post says there is none');
  assert.equal(walkFiles(join(SITE, '..', 'worker', 'src'), (p) => /\/(?:block-engine|blocks|recipe-interpreter)[^/]*\.ts$/.test(p)).length, 0, 'a block engine exists: the post says reviewed blocks are not built');
  assert.match(body, /Reviewed building blocks are not built/);
  assert.match(body, /There is no settings panel for a piece yet/);
});

test('the built post and the blog index carry the Beta label, link to real pages and show no result', () => {
  const page = distPage('/blog/what-works-today/');
  const text = textOf(page.html);
  assert.match(text, /\bBeta\b/);
  assert.match(text, /What works today/);
  assert.doesNotMatch(text, /\b\d+(?:\.\d+)?\s*\/\s*10\b/, 'the post shows a score');
  const index = textOf(distPage('/blog/').html);
  assert.match(index, /What works today in the StudPilot beta/);
});
