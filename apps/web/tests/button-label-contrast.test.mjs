// A button's label may not be painted the colour of its own background.
//
// MEASURED ON THE LIVE PAGE: the asset-source dialog's "Start building" button rendered
// rgb(255,154,77) text on rgb(255,154,77) — a contrast ratio of 1. It read as a button stuck
// mid-save with its label gone. It was not stuck; it was wordless.
//
// The cause is one rule that is CORRECT for the style it was written for. `.btn:hover` sets
// `color: var(--accent)` so a ghost button's label lights up under the pointer. A primary button
// has the accent as its BACKGROUND, and inherits that hover — so every primary button in the app
// went blank the moment anybody pointed at it, which is the moment before every click.
//
// WHAT THIS CHECKS. For each `.btn--*` rule that sets a background from a token, the same rule
// must set a colour from a DIFFERENT token, and must do so for the hover and focus states too.
// It reads the stylesheet rather than the rendered page, so it cannot catch every cascade — but
// it catches this shape, which is the one that shipped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(WEB, 'src', 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

/** Rules keyed by selector, with the background and colour token each declares. */
const rules = [];
for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
  const sel = m[1].trim();
  const body = m[2];
  const bg = /(?:^|[;\s])background(?:-color)?\s*:\s*([^;]+)/.exec(body)?.[1]?.trim();
  const fg = /(?:^|[;\s])color\s*:\s*([^;]+)/.exec(body)?.[1]?.trim();
  if (bg || fg) rules.push({ sel, bg, fg });
}

const token = (v) => /var\(\s*(--[\w-]+)/.exec(v ?? '')?.[1] ?? null;

test('the check can see the stylesheet', () => {
  assert.ok(rules.length >= 50, `parsed ${rules.length} rules — this check has gone blind`);
  assert.ok(rules.some((r) => /\.btn--primary/.test(r.sel)), 'no .btn--primary rule found at all');
});

test('a filled button never takes its label from its own background token', () => {
  const bad = [];
  for (const r of rules) {
    if (!/\.btn--/.test(r.sel)) continue;
    const bgTok = token(r.bg);
    const fgTok = token(r.fg);
    if (!bgTok || !fgTok) continue;
    if (bgTok === fgTok) bad.push(`${r.sel}  →  colour and background are both ${bgTok}`);
  }
  assert.deepEqual(bad, [], 'the label is the colour of the thing behind it');
});

test('a filled button restates its label colour for hover and focus', () => {
  //[[ THE INHERITED HOVER IS THE WHOLE BUG. `.btn:hover { color: var(--accent) }` is right for a
  //   ghost button and catastrophic for a filled one, and a filled variant that does not say what
  //   its label does on hover gets the ghost's answer. This is why the assertion is about the
  //   variant restating it rather than about the base rule being wrong — the base rule is correct
  //   for what it was written for. ]]
  //[[ "RESTING" IS PER SELECTOR IN THE LIST, NOT PER RULE. The fix for the bug this file guards
  //   was written as `.btn--primary, .btn--primary:hover, .btn--primary:focus-visible { … }` —
  //   one rule covering all three states. A filter that rejected any rule mentioning `:hover`
  //   therefore found ZERO filled variants and the blind-check fired, which is the correct
  //   behaviour for a matcher that has stopped matching, and the wrong answer about the code.
  const resting = (sel) => sel.split(',').some((one) => !/:[a-z-]+/.test(one.trim()));
  const filled = rules.filter((r) => /\.btn--/.test(r.sel) && token(r.bg) && resting(r.sel));
  assert.ok(filled.length >= 1, 'no filled button variant found — the matcher has gone blind');

  const hoverCol = rules.find((r) => /^\.btn:hover$/.test(r.sel) && r.fg);
  if (!hoverCol) return; // no inherited hover colour, nothing to defend against

  for (const f of filled) {
    // Every class in the variant's selector list, e.g. `.btn--primary, .btn--primary:hover`.
    const names = [...f.sel.matchAll(/\.(btn--[\w-]+)/g)].map((m) => m[1]);
    for (const name of new Set(names)) {
      const covers = rules.some((r) => r.fg && new RegExp(`\\.${name}:hover`).test(r.sel));
      assert.ok(covers,
        `.${name} has a background but never says what its label does on hover, so it inherits `
        + `\`.btn:hover { color: ${hoverCol.fg} }\` — which is its own background`);
    }
  }
});
