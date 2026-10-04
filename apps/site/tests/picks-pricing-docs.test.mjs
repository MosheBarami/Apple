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
const PICKS = {
  'eldora--animated-shiny-button': ['pricing.astro', 'ShinyButton'],
  'gsap--quicksetter': ['pricing.astro', 'Spotlight'],
  'motion--ui-border-beam': ['pricing.astro', 'BeamBorder'],
  'reactbits--electric-border': ['pricing.astro', 'BeamBorder'],
  'motion--number-counter': ['pricing.astro', 'BuildEstimator'],
  'motion--number-formatting': ['pricing.astro', 'BuildEstimator'],
  'motion--price-switcher': ['pricing.astro', 'PriceSwitch'],
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

test('the pricing limits FAQ and the docs FAQ both open with the Accordion', () => {
  assert.match(page('pricing.astro'), /<Accordion items=\{limitFaq\}/);
  assert.match(page('docs/faq.astro'), /<Accordion items=\{general\}/);
  assert.ok(mounts(page('pricing.astro'), 'Accordion'));
});

test('every plan card is lit by the spotlight and every price can roll', () => {
  const src = page('pricing.astro');
  assert.equal((src.match(/\bdata-spotlight\b/g) ?? []).length, 2, 'the Free card and the paid-card template each carry data-spotlight');
  assert.equal((src.match(/\bdata-price-roll\b/g) ?? []).length, 2, 'the Free price and the paid-price template each carry data-price-roll');
  assert.equal((src.match(/\bdata-price-unit\b/g) ?? []).length, 2);
  // Only the ranked card gets the beam and the shining button, and the ranked card is Free: both are
  // mounted once, before the paid-card template, so no paid card (none can be bought yet) carries them.
  const paidAt = src.indexOf('paid.map(');
  assert.ok(paidAt > 0, 'the paid-card template is gone');
  for (const el of ['<BeamBorder />', '<ShinyButton']) {
    assert.equal(src.split(el).length - 1, 1, `${el} is mounted more than once, or not at all`);
    assert.ok(src.indexOf(el) < paidAt, `${el} is on a paid card`);
  }
});

test('the estimator and the per-build price are derived, never typed', async () => {
  const src = page('pricing.astro');
  assert.match(src, /builds: buildsPerMonth\(id\)/, 'the estimator plans no longer read buildsPerMonth');
  assert.equal((src.match(/creditsPerBuild=\{TYPICAL_BUILD_CREDITS\}/g) ?? []).length, 2, 'the price switch and the estimator both read the shared typical build');
  assert.match(src, /start=\{buildsPerMonth\('free'\)\}/);
  assert.match(src, /buildsPerMonth\(id\)\)\) \* 100\) \/ 100/, 'the per-build price is no longer the monthly price over buildsPerMonth');

  // And the built page carries the config's numbers, whatever they are.
  const shared = await import('../../../packages/shared/src/index.ts');
  const file = join(SITE, 'dist', 'pricing', 'index.html');
  if (existsSync(file)) {
    const html = readFileSync(file, 'utf8');
    assert.match(html, new RegExp(`data-cpb="${shared.TYPICAL_BUILD_CREDITS}"`), 'the estimator was not handed the typical build');
    for (const id of shared.LISTED_PLAN_IDS.filter((p) => p !== 'free')) {
      const perBuild = Math.round((shared.PLAN_TABLE[id].priceUsdMonthly / shared.PLAN_TABLE[id].approxBuilds) * 100) / 100;
      assert.ok(
        html.includes(`data-build="${shared.formatMoney(perBuild)}"`),
        `${id}: the rendered per-build price is not ${shared.formatMoney(perBuild)}, the monthly price over its builds`,
      );
    }
  }
});

test('both rolling-number users share one implementation', () => {
  for (const name of ['PriceSwitch', 'BuildEstimator']) {
    const src = readFileSync(join(KIT, `${name}.astro`), 'utf8');
    assert.match(src, /import \{ rollTo \} from '\.\/rolling-number'/, `${name} no longer rolls its digits`);
  }
  assert.match(readFileSync(join(KIT, 'rolling-number.ts'), 'utf8'), /export function rollTo\(/);
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
