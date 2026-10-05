/**
 * MOTION ON THIS SITE IS CALM, CANNOT GO DEAD, AND CANNOT RUN AWAY.
 *
 * RESTATED 2026-10-05 (M2 rebuild, handoff 2.2). The earlier file was a 450-line harness that resolved the CASCADE over landing.css and
 * the old front page: for each declared keyframe it matched the sheet's selectors against the page's elements, kept the winner by
 * specificity and source order, and failed if a keyframe never won ("`fade-in-soft` was dead twice over while a comment swore it was
 * live"). Its subject was the old landing: nineteen animations, the composer's ghost sentences, the atmosphere layers and the picks
 * components' loops. All of it was deleted on purpose (landing.css, the picks/ components, the noise and beam effects), and the
 * rebuilt pages declare no keyframe at all, so there is no cascade left to resolve over them.
 *
 * What it protected is held in two forms, and one form is NOT carried over, said plainly:
 *   - the rebuilt marketing sheets (base.css, site.css, global.css) and layouts declare NO keyframe, run NO animation and loop nothing,
 *     which is stronger than "every keyframe wins": there is nothing to lose. Held below.
 *   - the keyframes that remain are the three of the docs and status components (Folder, Terminal, status orb). For those the property
 *     is held at the level of names: every `animation` names a keyframe the same file declares, every keyframe is used, and every loop
 *     (`infinite`) is switched off under prefers-reduced-motion in the same file or by the base sheet's global reduced-motion rule.
 *     NOT carried over: resolving specificity and source order for them. A keyframe that is declared, named by a rule and shadowed by
 *     a more specific rule on the same element would pass here. The docs rewrite owns those three components.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE, stripComments, walkFiles } from './lib/dist.mjs';

const SRC = join(SITE, 'src');

/** Every <style> block and stylesheet with the file it came from; comments out. */
function styleSources() {
  return walkFiles(SRC, (p) => /\.(?:css|astro)$/.test(p)).flatMap((f) => {
    const text = readFileSync(join(SRC, f), 'utf8');
    if (f.endsWith('.css')) return [{ file: f, css: stripComments(text) }];
    return [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => ({ file: f, css: stripComments(m[1]) }));
  });
}

const declared = (css) => [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
/** The animation names a file's rules use, from `animation:` and `animation-name:` declarations. */
function used(css) {
  const out = [];
  for (const m of css.matchAll(/(?:^|[;{\s])animation(?:-name)?\s*:\s*([^;}]+)/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+/).find((t) => /^[a-z][\w-]*$/i.test(t) && !/^(?:none|infinite|both|forwards|backwards|alternate|reverse|normal|running|paused|ease|ease-in|ease-out|ease-in-out|linear|steps|start|end|\d.*)$/i.test(t) && !/^var$/i.test(t));
      if (name) out.push(name);
    }
  }
  return out;
}

const MARKETING = ['styles/base.css', 'styles/site.css', 'styles/global.css'];

test('the harness read real sheets, so nothing below is vacuous', () => {
  const sources = styleSources();
  assert.ok(sources.length >= 8, `only ${sources.length} style sources read: the walk has drifted`);
  for (const f of MARKETING) assert.ok(sources.some((s) => s.file === f), `${f} was not read`);
  // RESTATED 2026-10-05 (M2 site fix cycle 1): the floor was THREE (the docs picks, the terminal's caret among them, and the status page's orb). The docs
  // rewrite deleted the picks, so the one keyframe left is the status page's orb-checking, which this must still find: a parse that finds none is blind.
  assert.ok(sources.flatMap((s) => declared(s.css)).includes('orb-checking'), 'the status page\'s one keyframe (orb-checking) was not found: the parse has drifted');
  assert.deepEqual(used('.x { animation: fold-in 360ms var(--ease-out) both; }\n.y { animation-name: a, b }'), ['fold-in', 'a', 'b'], 'the animation-name parser is blind');
});

test('the rebuilt marketing sheets declare no keyframe, run no animation and loop nothing', () => {
  for (const f of MARKETING) {
    const css = styleSources().filter((s) => s.file === f).map((s) => s.css).join('\n');
    assert.deepEqual(declared(css), [], `${f} declares a keyframe: the rebuilt marketing pages are still`);
    assert.doesNotMatch(css, /(?:^|[;{\s])animation(?:-name)?\s*:\s*(?!none\b)[^;}]+/, `${f} runs an animation`);
    assert.doesNotMatch(css, /\binfinite\b/, `${f} loops something`);
  }
  // The layout and the page components of the rebuild carry no <style> animation either (Nav, Footer, ScreenSlot, PieceIcon, and the pages).
  const rebuilt = styleSources().filter((s) => /^(?:components\/(?:Nav|Footer|ScreenSlot|PieceIcon|StudPilotMark)|pages\/(?:index|how-it-works|catalog|pricing|404|blog\/))/.test(s.file));
  assert.ok(rebuilt.length >= 5, `only ${rebuilt.length} rebuilt style blocks read`);
  for (const { file, css } of rebuilt) {
    assert.deepEqual(declared(css), [], `${file} declares a keyframe`);
    assert.doesNotMatch(css, /(?:^|[;{\s])animation(?:-name)?\s*:\s*(?!none\b)[^;}]+/, `${file} runs an animation`);
  }
});

test('every keyframe that remains is declared and used in the same file, and every loop stops under reduced motion', () => {
  const base = stripComments(readFileSync(join(SRC, 'styles', 'base.css'), 'utf8'));
  const globalOff = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{[^]*?animation-iteration-count\s*:\s*1\s*!important/.test(base);
  assert.ok(globalOff, 'base.css has no global reduced-motion rule that ends every animation');
  let looping = 0;
  for (const { file, css } of styleSources()) {
    const names = declared(css);
    const usedHere = used(css);
    for (const name of names) assert.ok(usedHere.includes(name), `${file}: @keyframes ${name} is declared and no rule uses it (dead)`);
    for (const name of usedHere) assert.ok(names.includes(name), `${file}: an animation names ${name}, which this file does not declare`);
    for (const m of css.matchAll(/([^{}]+)\{[^{}]*\binfinite\b[^{}]*\}/g)) {
      looping += 1;
      const cls = (m[1].trim().split(/\s+/).at(-1).match(/\.([\w-]+)/g) ?? []).at(-1);
      assert.ok(cls, `${file}: a looping rule (${m[1].trim()}) has no class this check can follow`);
      const stopsHere = new RegExp(`prefers-reduced-motion\\s*:\\s*reduce[^]*?${cls.replace('.', '\\.')}[^{}]*\\{[^}]*animation\\s*:\\s*none`).test(css);
      assert.ok(stopsHere || globalOff, `${file}: ${cls} loops and nothing switches it off under prefers-reduced-motion`);
    }
  }
  assert.ok(looping >= 1, 'no looping rule was found: the status orb and the terminal caret loop, so the parse has drifted');
});

test('the layouts carry no cinematic layer and load the tokens before the base sheet', () => {
  const base = readFileSync(join(SRC, 'layouts', 'Base.astro'), 'utf8');
  const active = stripComments(base);
  assert.doesNotMatch(active, /import\s+(?:Horizon|FlowField)\b|<(?:Horizon|FlowField)\b/, 'Base mounts the retired Horizon/FlowField treatment');
  assert.doesNotMatch(active, /class=["'][^"']*\b(?:atmosphere|light-column|sky|strata|stratum|ridge)\b/, 'Base renders a retired cinematic atmosphere element');
  const tokens = base.search(/import\s+['"]@studpilot\/design\/tokens\.css['"]/);
  const baseCss = base.search(/import\s+['"][^'"]*styles\/base\.css['"]/);
  assert.notEqual(tokens, -1, 'Base does not import the shared design tokens');
  assert.ok(baseCss > tokens, 'Base must import styles/base.css after the design tokens');
  assert.doesNotMatch(base, /styles\/relaunch\.css/, 'Base still loads the retired relaunch treatment');
});
