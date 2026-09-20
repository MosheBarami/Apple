// EVERY SURFACE THAT TELLS A VISITOR WHETHER THEY CAN INSTALL THE PLUGIN MUST ASK THE SAME
// CONSTANT — INCLUDING THE HALF NOBODY LOOKS AT.
//
// Two defects, one cause.
//
//   /pricing's Free card carried "Studio integration · public installation pending" as a typed
//   string. "Pending" is the softest word on the site, on the only plan anybody can take today,
//   while the same page's comparison note already said "public installation is currently
//   unavailable" and /docs/plugin says Roblox removed the listing.
//
//   Three docs pages gated their BODY on STUDIO_PLUGIN_STORE_LIVE and left their
//   <meta name="description"> — which is also og:description, and is what a search result or a
//   pasted link shows — promising a Creator Store install path. The promise reached the reader
//   before the correction, and only if they clicked did the correction arrive at all.
//
// This guard reads the BUILT pages where it can, because a description is only a defect once it is
// rendered, and falls back to the source when dist/ has not been built in this checkout.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const distPath = (rel) => fileURLToPath(new URL(`../dist/${rel}`, import.meta.url));

// The single definition both the pages and this test derive from.
const shared = read('../../../packages/shared/src/index.ts');
const storeLive = /export const STUDIO_PLUGIN_STORE_LIVE:\s*boolean\s*=\s*true/.test(shared);

const GATED_PAGES = {
  'docs/plugin': '../src/pages/docs/plugin.astro',
  'docs/getting-started': '../src/pages/docs/getting-started.astro',
  'docs': '../src/pages/docs/index.astro',
};

for (const [route, src] of Object.entries(GATED_PAGES)) {
  test(`${route} asks the constant for its description, not just for its body`, () => {
    const source = read(src);
    // The description must be an expression keyed on the flag, not a bare string literal.
    const at = source.indexOf('\n  description=');
    assert.notEqual(at, -1, `${route} has no description prop`);
    // Read the VALUE only. Slicing a fixed number of characters past the prop reaches into the
    // page body, where the flag is already used — so the first version of this assertion passed on
    // a page whose description was still a bare string. It has to end at the prop's own terminator.
    const rest = source.slice(at + '\n  description='.length);
    const value = rest[0] === '{' ? rest.slice(0, rest.indexOf('\n  heading=')) : rest.slice(0, rest.indexOf('\n'));
    assert.match(
      value,
      /STUDIO_PLUGIN_STORE_LIVE|storeLive/,
      `${route}'s description is a fixed string; the body gates and the metadata does not`,
    );
  });
}

test('the rendered descriptions do not promise an install path the site denies', () => {
  if (storeLive) return; // the promise is true again; nothing to guard
  for (const route of Object.keys(GATED_PAGES)) {
    const file = distPath(`${route}/index.html`);
    if (!existsSync(file)) continue; // not built in this checkout
    const html = readFileSync(file, 'utf8');
    for (const tag of ['name="description"', 'property="og:description"']) {
      const m = new RegExp(`<meta ${tag} content="([^"]*)"`).exec(html);
      assert.ok(m, `${route} is missing ${tag}`);
      assert.doesNotMatch(
        m[1],
        /How to install .* from the Roblox Creator Store|install the plugin|installing and connecting the Studio plugin/i,
        `${route}'s ${tag} still promises an install path`,
      );
    }
  }
});

test('/pricing derives its Studio bullet instead of calling the block "pending"', () => {
  const source = read('../src/pages/pricing.astro');
  // Strip comments first: the comment recording this fix quotes the sentence it removed, and a
  // guard that cannot tell prose from the reasoning about prose forbids writing the reasoning down.
  const prose = source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
  assert.doesNotMatch(prose, /public installation pending/i, '"pending" is back on the Free card');
  assert.match(source, /STUDIO_PLUGIN_STORE_LIVE/, '/pricing does not ask the constant');

  const file = distPath('pricing/index.html');
  if (!existsSync(file) || storeLive) return;
  const html = readFileSync(file, 'utf8');
  assert.doesNotMatch(html, /public installation pending/i);
  // and the card now says the same thing the page's own closing note says
  assert.match(html, /Studio integration ·[^<]*(unavailable|removed by Roblox moderation)/i);
});

// ---------------------------------------------------------------------------
// The guard can fail.
// ---------------------------------------------------------------------------
test('the guard rejects the description and the bullet that shipped', () => {
  const shippedDesc =
    '  description="How to install Apple for Studio from the Roblox Creator Store, and what Studio asks for the first time it runs."';
  assert.doesNotMatch(shippedDesc, /STUDIO_PLUGIN_STORE_LIVE|storeLive/);
  assert.match(
    'How to install Apple for Studio from the Roblox Creator Store, and what Studio asks.',
    /How to install .* from the Roblox Creator Store/i,
  );
  assert.match('<li>Studio integration · public installation pending</li>', /public installation pending/i);
});
