/**
 * A `var()` NAMING A TOKEN NOBODY DEFINES SILENTLY DELETES THE WHOLE DECLARATION.
 *
 * FOUND BY LOOKING AT THE DEPLOYED SIGN-IN PAGE. `.mode-dot` was written
 *
 *     border: 1.5px solid var(--ink-2);
 *
 * and the Plan marker was simply not on the page. `--ink-2` belongs to the WORKSPACE stylesheet's
 * token family (`--gx-ink-2`); this app's equivalent is `--muted`, so the reference resolved to
 * nothing. An unresolvable `var()` is not ignored — it makes the entire declaration invalid at
 * computed-value time, and every longhand of a shorthand falls back to its initial value. Style
 * `none`, width `0`.
 *
 * WHAT MADE IT INVISIBLE TO EVERY CHECK EXCEPT EYES. `border-color`'s initial value is
 * `currentColor`, and the text beside that dot is `--muted` — the exact colour the author intended.
 * So `getComputedStyle(el).borderTopColor` returned rgb(163,163,173) and agreed with the source.
 * The stylesheet said the border was there. The computed colour said the border was there. Only the
 * screen said otherwise.
 *
 * That is why this reads NAMES and not rendered output: a typo'd token is a declaration that
 * deletes itself, and the deletion has no error, no warning and — as above — often no visible
 * difference in the properties you would think to inspect.
 *
 * A reference carrying a FALLBACK — `var(--maybe, 1px)` — is deliberate and is allowed: the author
 * has said what happens when it is absent. Only a bare reference to a name nothing defines fails.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Every file that can define or use a custom property, found by walking — never a fixed list. */
function sources(dir = 'src', match = /\.(css|tsx?|mjs)$/) {
  const out = [];
  for (const entry of readdirSync(join(WEB, dir)).sort()) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(WEB, rel)).isDirectory()) out.push(...sources(rel, match));
    else if (match.test(entry)) out.push(rel);
  }
  return out;
}

const files = sources();

/**
 * COMMENTS ARE STRIPPED, and that is not tidiness.
 *
 * The first run of this guard reported two orphans in styles.css that did not exist: they were
 * inside the comment explaining the bug this test was written for, which names `var(--ink-2)` four
 * times. A scanner that reads prose reports the account of a defect as the defect — and the more
 * carefully a fix is documented, the more false findings it produces. The same shape has now bitten
 * `check-copy.mjs`, `check-escape-hatches.mjs` and the deadends scanner in this repo.
 */
const decomment = (body) => body.replace(/\/\*[\s\S]*?\*\//g, ' ');
const text = new Map(files.map((f) => [f, decomment(readFileSync(join(WEB, f), 'utf8'))]));

/** Names a stylesheet declares, plus any the app sets from script at runtime. */
function defined() {
  const names = new Set();
  for (const body of text.values()) {
    for (const [, n] of body.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) names.add(n);
    // `el.style.setProperty('--x', …)` is a definition this file cannot see in CSS.
    for (const [, n] of body.matchAll(/setProperty\(\s*['"`](--[a-zA-Z0-9_-]+)/g)) names.add(n);
  }
  return names;
}

/** Bare `var(--name)` references — those WITHOUT a fallback, which is the failing shape. */
function bareRefs() {
  const out = [];
  for (const [file, body] of text) {
    if (!file.endsWith('.css')) continue;
    for (const m of body.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)\s*\)/g)) {
      out.push({ file, name: m[1], line: body.slice(0, m.index).split('\n').length });
    }
  }
  return out;
}

test('the sources are being read', () => {
  assert.ok(files.length > 20, 'the walk found almost nothing — this test would check nothing');
  assert.ok(bareRefs().length > 200, 'no var() references found — the scan is not reading the stylesheets');
  assert.ok(defined().size > 50, 'no custom properties found — the scan is not reading definitions');
});

test('every bare var() names a custom property something defines', () => {
  const known = defined();
  const orphans = bareRefs()
    .filter((r) => !known.has(r.name))
    .map((r) => `${r.file}:${r.line}  var(${r.name})`);
  assert.deepEqual(
    [...new Set(orphans)].sort(),
    [],
    'an unresolvable var() makes the whole declaration invalid — the property silently reverts to '
      + 'its initial value. Define the token, use the right name, or give the reference a fallback:'
      + '\n  ' + [...new Set(orphans)].sort().join('\n  '),
  );
});

test('the check can actually fail', () => {
  // The guard is only worth its line count if a planted orphan trips it, so plant one in memory.
  const known = defined();
  assert.equal(known.has('--a-token-nothing-defines'), false);
  const planted = [{ file: 'src/x.css', name: '--a-token-nothing-defines', line: 1 }];
  assert.equal(planted.filter((r) => !known.has(r.name)).length, 1, 'a planted orphan must be caught');
});
