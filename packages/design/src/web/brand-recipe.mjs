/**
 * THE BRAND RECIPE: how the favicon, the icon PNGs and the share card are made from the mark and the
 * tokens, in one place, read by the generator (scripts/make-brand-assets.mjs) and by the test that
 * holds every shipped copy to it (brand.test.mjs). Nothing here renders anything: it composes text,
 * hashes inputs and says which file depends on which input.
 *
 * THE MANIFEST. A PNG is opaque, and a committed PNG that no longer matches its mark is invisible to
 * every check that reads text. So the generator writes `packages/design/brand/brand-manifest.json`:
 * a hash of each INPUT the renders are made from (the icon SVG as composed from the mark and the
 * tokens, and the share card's HTML with the token file it links) and a hash of each OUTPUT file as
 * written. A node test (no browser) recomputes the inputs from the sources and the outputs from the
 * files, so a changed mark, a changed token the card spends, or a PNG that was swapped, stale or
 * edited by hand all fail in `pnpm -r test`, on any machine.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { theme, themeBlocks } from './css-tokens.mjs';

export const REPO = fileURLToPath(new URL('../../../../', import.meta.url));

export const MARK_FILE = 'packages/design/brand/studpilot-mark.svg';
export const OG_SOURCE = 'apps/site/brand/og.html';
export const TOKENS_FILE = 'packages/design/src/web/tokens.css';
export const MANIFEST_FILE = 'packages/design/brand/brand-manifest.json';

/** Every standalone copy of the favicon SVG. The web app's inline copy is WEB_FAVICON_FILE. */
export const FAVICON_COPIES = ['packages/design/brand/favicon.svg', 'apps/site/public/favicon.svg', 'tools/repo-chat/public/favicon.svg'];
/** The app's favicon is a data: URI in this file's <link rel="icon">. */
export const WEB_FAVICON_FILE = 'apps/web/index.html';
export const WEB_FAVICON_RE = /(rel="icon"\s+href=")data:image\/svg\+xml,[^"]+(")/;

/**
 * Every PNG the generator writes. `input` names the manifest input the render depends on:
 * `icon` (rounded tile), `iconSquare` (the touch icon: iOS applies its own mask, so a baked-in radius
 * would leave a sliver) or `og` (the share card).
 */
export const PNGS = [
  { out: 'packages/design/brand/icon-16.png', size: 16, input: 'icon' },
  { out: 'packages/design/brand/icon-32.png', size: 32, input: 'icon' },
  { out: 'packages/design/brand/icon-180.png', size: 180, input: 'iconSquare' },
  { out: 'packages/design/brand/icon-512.png', size: 512, input: 'icon' },
  { out: 'apps/site/public/apple-touch-icon.png', size: 180, input: 'iconSquare' },
  { out: 'apps/site/public/icon-192.png', size: 192, input: 'icon' },
  { out: 'apps/site/public/icon-512.png', size: 512, input: 'icon' },
  { out: 'apps/site/public/og.png', width: 1200, height: 630, input: 'og', source: OG_SOURCE },
];

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** The mark's one path, from the drawing. */
export function markPathOf(root = REPO) {
  return /<path[^>]*\sd="([^"]+)"/.exec(readFileSync(join(root, MARK_FILE), 'utf8'))?.[1] ?? null;
}

/** What the icon is made of: the mark, and the base and accent colours of the dark theme. */
export function brandSources(root = REPO) {
  const dark = theme(themeBlocks(readFileSync(join(root, TOKENS_FILE), 'utf8')).dark);
  return { markPath: markPathOf(root), paper: dark.resolve('paper'), accent: dark.resolve('accent') };
}

/** The icon: the mark in the accent, centred on a tile in the base colour. */
export const SCALE = 0.74;
export function iconSvg({ markPath, paper, accent }, { square = false } = {}) {
  const offset = ((32 - 32 * SCALE) / 2).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="StudPilot">` +
    `<rect width="32" height="32"${square ? '' : ' rx="7"'} fill="${paper}"/>` +
    `<path transform="translate(${offset} ${offset}) scale(${SCALE})" fill="${accent}" fill-rule="evenodd" d="${markPath}"/></svg>\n`;
}

/** The favicon as an inline `href`: quotes single, and only `<`, `>` and `#` escaped, so it stays readable. */
export const faviconHref = (svg) => 'data:image/svg+xml,' + svg.trim().replace(/"/g, "'").replace(/</g, '%3C').replace(/>/g, '%3E').replace(/#/g, '%23');

/** `html` (the text of WEB_FAVICON_FILE) with its favicon replaced by `svg`; null when it has no inline favicon. */
export function withWebFavicon(html, svg) {
  return WEB_FAVICON_RE.test(html) ? html.replace(WEB_FAVICON_RE, (_, a, b) => a + faviconHref(svg) + b) : null;
}

/**
 * The hash of everything each kind of render is made from. The share card links the whole token file
 * by path, so a change to any token is a change to the card's inputs; that is deliberate, and costs
 * one `pnpm brand` (which rewrites the PNG byte for byte when nothing it draws moved).
 */
export function inputHashes(root = REPO) {
  const src = brandSources(root);
  return {
    icon: sha256(iconSvg(src)),
    iconSquare: sha256(iconSvg(src, { square: true })),
    og: sha256(readFileSync(join(root, OG_SOURCE)) + '\0' + readFileSync(join(root, TOKENS_FILE))),
  };
}

/** The manifest as the files on disk say it should read: inputs from the sources, outputs from the PNGs. */
export function manifestOf(root = REPO, platform = process.platform) {
  return {
    note: 'Written by scripts/make-brand-assets.mjs; never edit by hand. inputs: sha256 of what each render is made from. outputs: sha256 of each PNG as written. renderedOn: the platform whose fonts drew og.png.',
    renderedOn: platform,
    inputs: inputHashes(root),
    outputs: Object.fromEntries(PNGS.map((p) => [p.out, { input: p.input, sha256: sha256(readFileSync(join(root, p.out))) }])),
  };
}

export const readManifest = (root = REPO) => JSON.parse(readFileSync(join(root, MANIFEST_FILE), 'utf8'));

/**
 * Everything wrong between a stored manifest and the one the tree would produce now (`manifestOf`),
 * as sentences. Empty means every PNG is the one the generator wrote from the current mark, tokens
 * and card. The generator's --check and brand.test.mjs both ask this, so they cannot disagree.
 */
export function manifestProblems(stored, now) {
  const out = [];
  for (const [name, hash] of Object.entries(now.inputs)) {
    if (stored?.inputs?.[name] !== hash) out.push(`the "${name}" render inputs changed (the mark, a token or the share card) since the PNGs were made; run \`pnpm brand\``);
  }
  for (const [file, entry] of Object.entries(now.outputs)) {
    if (stored?.outputs?.[file]?.sha256 !== entry.sha256) out.push(`${file} is not the PNG the generator wrote (its hash is not the manifest's: swapped, stale or edited); run \`pnpm brand\``);
    if (stored?.outputs?.[file]?.input !== entry.input) out.push(`${file} is recorded as made from "${stored?.outputs?.[file]?.input}" but is made from "${entry.input}"`);
  }
  for (const file of Object.keys(stored?.outputs ?? {})) if (!now.outputs[file]) out.push(`the manifest lists ${file}, which the generator no longer writes`);
  return out;
}
