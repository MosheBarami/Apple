/**
 * A `var()` NAMING A TOKEN NOBODY DEFINES SILENTLY DELETES THE WHOLE DECLARATION.
 *
 * The sibling of `apps/web/tests/undefined-custom-property.test.mjs`, and it exists because the
 * same class of defect was already here. `global.css` removed `--display-vf` deliberately — three
 * Fraunces axes that do not exist on Archivo — and wrote down that the token "is gone". Two
 * components went on reading it: `Nav.astro` and `Footer.astro` both carried
 * `font-variation-settings: var(--display-vf)` against a name nothing defines. The cleanup was
 * complete in the file that did it and nowhere else, and no build, type-check or test noticed.
 *
 * An unresolvable `var()` does not fall back to something sensible: the declaration becomes invalid
 * at computed-value time and the property reverts to its initial value. There is no error and no
 * warning, and — as the web app's version of this found — often no visible difference in the
 * properties you would think to inspect.
 *
 * SCOPE: `apps/site/src` only. `packages/corpus/raw` holds harvested third-party repositories whose
 * CSS correctly references THEIR framework's tokens (Starlight `--sl-*`, Docusaurus `--ifm-*`,
 * VitePress `--vp-*`). Those are other people's files, they are not shipped, and reporting them
 * would bury the two findings that are ours under sixty that are not.
 *
 * A reference carrying a fallback — `var(--maybe, 1rem)` — is deliberate and allowed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');

function sources(dir = 'src') {
  const out = [];
  for (const entry of readdirSync(join(SITE, dir)).sort()) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(SITE, rel)).isDirectory()) out.push(...sources(rel));
    else if (/\.(css|astro|tsx?|mjs|js)$/.test(entry)) out.push(rel);
  }
  return out;
}

// Comments are stripped before anything is counted: this guard's own explanation names
// `var(--display-vf)` twice, and a scanner that reads prose reports the account of a defect as the
// defect. Four scanners in this repo have now needed this.
const decomment = (body) => body.replace(/\/\*[\s\S]*?\*\//g, ' ');

const files = sources();
const text = new Map(files.map((f) => [f, decomment(readFileSync(join(SITE, f), 'utf8'))]));

const defined = () => {
  const names = new Set();
  for (const body of text.values()) {
    for (const [, n] of body.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) names.add(n);
    for (const [, n] of body.matchAll(/setProperty\(\s*['"`](--[a-zA-Z0-9_-]+)/g)) names.add(n);
  }
  return names;
};

const bareRefs = () => {
  const out = [];
  for (const [file, body] of text) {
    for (const m of body.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)\s*\)/g)) {
      out.push({ file, name: m[1], line: body.slice(0, m.index).split('\n').length });
    }
  }
  return out;
};

test('the sources are being read', () => {
  assert.ok(files.length > 10, 'the walk found almost nothing — this test would check nothing');
  assert.ok(bareRefs().length > 100, 'no var() references found — the scan is not reading the styles');
  assert.ok(defined().size > 40, 'no custom properties found — the scan is not reading definitions');
});

test('every bare var() names a custom property something defines', () => {
  const known = defined();
  const orphans = [...new Set(
    bareRefs().filter((r) => !known.has(r.name)).map((r) => `${r.file}:${r.line}  var(${r.name})`),
  )].sort();
  assert.deepEqual(
    orphans,
    [],
    'an unresolvable var() makes the whole declaration invalid — the property reverts to its initial '
      + 'value, with no error. Define the token, use the right name, or give it a fallback:\n  '
      + orphans.join('\n  '),
  );
});
