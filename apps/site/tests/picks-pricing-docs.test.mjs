/**
 * THE OWNER'S PICKS FOR /pricing AND /docs ARE MOUNTED IN THE PRODUCT, NOT PARKED BESIDE IT.
 *
 * Fifteen components were ticked for these two surfaces. Each one is now part of a real page —
 * merged where two did one job (BorderBeam + Electric Border, Number counter + Number formatting,
 * Code Tabs + Code Tabs MDX), and applied to what the docs already draw where the page had the
 * element (the side nav, every <kbd>, every prose link). A component file nobody imports is a demo,
 * so this reads the pages and fails when a mount is removed, commented out, or moved to a page
 * that is not the one the pick belongs on.
 *
 * Comments are stripped first (visibleCopy): a page that explains a mount it no longer has must
 * not pass.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { visibleCopy } from './lib/visible-copy.mjs';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(SITE, '..', '..');
const read = (...parts) => readFileSync(join(SITE, ...parts), 'utf8');
const page = (rel) => visibleCopy(read('src', 'pages', rel));
const KIT = join(SITE, 'src', 'components', 'picks-docs');

/** `<Name` rendered AND `import Name from '…/picks-docs/Name.astro'`. */
function mounts(src, name) {
  const imported = new RegExp(`import\\s+${name}\\s+from\\s+'[./]+(?:components/)?picks-docs/${name}\\.astro'`).test(src);
  const rendered = new RegExp(`<${name}[\\s/>]`).test(src);
  return imported && rendered;
}

// pick id -> [page, component that carries it]
//
// RESTATED 2026-10-05 (M2 rebuild, handoff 2.2). Seven of the fifteen picks were the pricing page's: the shiny button, the spotlight, the
// beam border, the number counter and formatter (the build estimator) and the price switcher. The rebuilt pricing page does not use them
// (flat panels, no motion, no script of its own), so ShinyButton, Spotlight, BeamBorder, BuildEstimator, PriceSwitch and rolling-number
// are deleted (planning/proof/M2/DECISIONS.md section 12, with the owner pick each one was) and their seven mount tests, 'every plan card
// is lit by the spotlight', 'both rolling-number users share one implementation' and the estimator half of 'the estimator and the
// per-build price are derived' went with them. What is kept: the eight docs picks, the Accordion on /pricing, and the per-build price,
// which is still printed (on each paid card) and is still held to the config below.
const PICKS = {
  'motion--accordion': ['docs/faq.astro', 'Accordion'],
  'reactbits--folder': ['docs/getting-started.astro', 'Folder'],
  'eldora--terminal': ['docs/build-from-source.astro', 'Terminal'],
  'ui-layouts--code-tabs': ['docs/build-from-source.astro', 'CodeTabs'],
  'ui-layouts--code-tabs-mdx': ['docs/build-from-source.astro', 'CodeTabs'],
  // These three upgrade what DocsLayout already draws, so they ride on DocsKit (tested below).
  'reactbits--line-sidebar': ['docs/index.astro', 'DocsKit'],
  'componentry--mac-keyboard': ['docs/getting-started.astro', 'DocsKit'],
  'ui-layouts--button-hover-6': ['docs/faq.astro', 'DocsKit'],
};

for (const [id, [rel, name]] of Object.entries(PICKS)) {
  test(`${id} is mounted on /${rel.replace(/(index)?\.astro$/, '')} through ${name}`, () => {
    assert.ok(existsSync(join(KIT, `${name}.astro`)), `${name}.astro is gone from components/picks-docs`);
    assert.ok(mounts(page(rel), name), `${rel} no longer imports and renders <${name} /> — the ${id} pick is not in the product`);
  });
}

// RESTATED 2026-10-05 (M2 site fix cycle 1): /pricing's limits are an always-open grid now (the accordion was the old page's), so the Accordion is
// the docs FAQ's alone. The property (the FAQ opens with the Accordion, mounted and rendered) is kept for it.
test('the docs FAQ opens with the Accordion, and /pricing no longer mounts one', () => {
  assert.match(page('docs/faq.astro'), /<Accordion items=\{general\}/);
  assert.ok(mounts(page('docs/faq.astro'), 'Accordion'));
  assert.ok(!mounts(page('pricing.astro'), 'Accordion'), '/pricing mounts the Accordion again: its limits are an always-open grid');
});

test('the per-build price of each paid column is derived from the config, never typed', async () => {
  const src = page('pricing.astro');
  assert.match(src, /buildsPerMonth\(id\)\)\) \* 100\) \/ 100/, 'the per-build price is no longer the monthly price over buildsPerMonth');
  const shared = await import('../../../packages/shared/src/index.ts');
  const file = join(SITE, 'dist', 'pricing', 'index.html');
  assert.ok(existsSync(file), 'dist/pricing/index.html is missing: run the site build first');
  const text = visibleCopy(readFileSync(file, 'utf8')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const paid = shared.LISTED_PLAN_IDS.filter((p) => p !== 'free');
  assert.ok(paid.length >= 2, 'the paid plans were not found');
  for (const id of paid) {
    const perBuild = Math.round((shared.PLAN_TABLE[id].priceUsdMonthly / shared.buildsPerMonth(id)) * 100) / 100;
    assert.ok(
      text.includes(`about ${shared.formatMoney(perBuild)} a build at this price`),
      `${id}: the rendered per-build price is not ${shared.formatMoney(perBuild)}, the monthly price over its builds`,
    );
  }
  assert.ok(text.includes(`A typical build costs about ${shared.formatCredits(shared.TYPICAL_BUILD_CREDITS)} Credits`), 'the typical build is not the shared one');
});

test('every docs page mounts DocsKit, last, so the nav, keys and links are upgraded everywhere', () => {
  const dir = join(SITE, 'src', 'pages', 'docs');
  const files = readdirSync(dir).filter((f) => f.endsWith('.astro'));
  assert.ok(files.length >= 10, `only ${files.length} docs pages found — the walk is blind`);
  for (const f of files) {
    const src = page(`docs/${f}`);
    assert.ok(mounts(src, 'DocsKit'), `docs/${f} does not mount DocsKit`);
    assert.match(src, /<DocsKit \/>\s*<\/DocsLayout>/, `docs/${f}: DocsKit is not the last thing in the page`);
  }
});

test('DocsKit still has the layout hooks it upgrades', () => {
  const layout = read('src', 'layouts', 'DocsLayout.astro');
  const kit = readFileSync(join(KIT, 'DocsKit.astro'), 'utf8');
  for (const hook of ['id="docs-nav-list"', 'class="docs__main"', 'class="docs__foot"']) {
    assert.ok(layout.includes(hook), `DocsLayout.astro lost ${hook}; DocsKit would upgrade nothing`);
  }
  assert.match(kit, /getElementById\('docs-nav-list'\)/);
  assert.match(kit, /\.docs__main kbd/);
  assert.match(kit, /\.prose a:not\(\.btn\)/);
});

test('the terminal on /docs/build-from-source prints only lines the build really prints', () => {
  const src = read('src', 'pages', 'docs', 'build-from-source.astro');
  const block = /const buildOutput = \[([\s\S]*?)\];/.exec(src);
  assert.ok(block, 'build-from-source.astro no longer declares buildOutput');
  const lines = [...block[1].matchAll(/'([^']*)'/g)].map((m) => m[1]).filter((l) => l !== '…');
  assert.ok(lines.length >= 1, 'the terminal quotes no output — this check would pass on nothing');
  const scripts = [
    readFileSync(join(ROOT, 'apps', 'studpilot-plugin', 'scripts', 'build.mjs'), 'utf8'),
    readFileSync(join(ROOT, 'apps', 'studpilot-plugin', 'scripts', 'verify-artifact.py'), 'utf8'),
  ].join('\n');
  for (const line of lines) {
    assert.ok(scripts.includes(line), `the terminal prints "${line}", which no build script prints`);
  }
  assert.match(visibleCopy(src), /<Terminal command="node apps\/studpilot-plugin\/scripts\/build\.mjs"/);
});

test('the picks are dependency-free: no Motion, GSAP or Radix import anywhere in the kit', () => {
  for (const f of readdirSync(KIT)) {
    const src = readFileSync(join(KIT, f), 'utf8');
    assert.doesNotMatch(src, /from\s+['"](?:motion|framer-motion|gsap|@radix-ui\/[^'"]+)['"]/, `${f} imports a library that is not installed`);
  }
});
