// The hero's living background, asserted as a mechanism rather than as an impression.
//
// WHAT THIS EXISTS FOR. The hero used to carry a WebGL <canvas> driven by a three.js tag
// fetched from cdnjs — a route that advertises "zero JavaScript" while shipping an inline
// script and a third-party CDN request. That component is gone, and what replaced it is four
// CSS layers that drift. CSS layers are exactly the kind of thing that dies silently: delete a
// span from the page, or a keyframes block from the stylesheet, and nothing throws, nothing
// 404s, and the page still renders — just flat. So the layers are checked here.
//
// THE THING THIS FILE REFUSES TO DO is report "clean" when it cannot see. Every way of failing
// to observe — an unreadable file, a hero block it cannot locate, a stylesheet it parsed into
// zero rules, a layer list that came back empty — is a hard failure with its own message
// naming the harness as broken, NOT a pass. A guard that cannot find the thing it guards has
// learned nothing about it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = join(SITE, 'src', 'pages', 'index.astro');
const SHEET = join(SITE, 'src', 'styles', 'landing.css');

/**
 * The layers, and what each one is for. The duration is not asserted as an exact number —
 * that is a taste call somebody may retune — only that it resolves to a real, non-zero time.
 * A layer whose duration is `0s`, or whose duration is a `var()` naming a token that no longer
 * exists, is a dead declaration: present in the file, painting nothing.
 */
const LAYERS = [
  { cls: 'ap-field__bloom', what: 'the light source, breathing behind the headline' },
  { cls: 'ap-field__catch', what: 'the one light that crosses the frame' },
];

/**
 * The layers that never move, and must exist anyway.
 *
 * `sky` carries the composition. `grain` is dither: a few percent of static noise that breaks the
 * bloom's very long ramp over very few near-black values, which an 8-bit display would otherwise
 * quantise into visible rings. Both are deliberately still, and a test that demanded an animation
 * from every layer would have forced motion onto the one layer that must not have it — grain that
 * moves reads as compression artefacting, not as film.
 *
 * They are asserted as PRESENT AND STYLED rather than exempted: a still layer that vanished from
 * the markup would otherwise be invisible to this file, which is how the stud plate could have
 * been deleted with every test still green.
 */
const STILL = ['ap-field__sky', 'ap-field__grain'];

function read(file) {
  try {
    const src = readFileSync(file, 'utf8');
    if (!src.trim()) throw new Error('empty');
    return src;
  } catch (e) {
    assert.fail(
      `CANNOT READ ${file} (${e.message}). This test has observed nothing about the hero; `
      + 'it is broken, and a broken harness is not a clean page.',
    );
  }
}

/**
 * Comments are stripped from both files before anything is asserted.
 *
 * This is the defect check-copy.mjs already records twice over: a guard that reads its own
 * commentary as data. index.astro explains at the top of the hero that the field "occupies the
 * slot the three.js BuildStage used to" — exactly the right thing for the next reader, and the
 * exact string the last test below forbids. A checker that cannot tell an explanation from a
 * usage forces the explanation out of the file, which costs more than the check is worth.
 *
 * `(^|[^:])//` rather than a bare `//`, because `https://fonts.googleapis.com` is a line
 * comment to any regex naive enough to look only at the slashes.
 */
const stripComments = (src) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * Every rule in the sheet, flattened, each tagged with the at-rules it sits inside.
 *
 * Written by hand rather than with a regex because the reduced-motion block below contains the
 * very selectors the base rules use, and a regex that cannot tell "inside @media" from "at top
 * level" would happily accept a page whose layers only animate for readers who asked for no
 * motion — the precise inversion this file is here to catch.
 */
function rules(css) {
  const out = [];
  const walk = (text, at) => {
    let i = 0;
    let head = '';
    while (i < text.length) {
      const ch = text[i];
      if (ch === '{') {
        let depth = 1;
        let j = i + 1;
        while (j < text.length && depth > 0) {
          if (text[j] === '{') depth += 1;
          else if (text[j] === '}') depth -= 1;
          j += 1;
        }
        const body = text.slice(i + 1, j - 1);
        const selector = head.trim();
        if (selector.startsWith('@')) {
          // A nested at-rule: its body holds rules of its own, except @keyframes, whose body
          // holds percentage steps rather than selectors.
          if (/^@keyframes/i.test(selector)) out.push({ selector, body, at });
          else walk(body, [...at, selector]);
        } else {
          out.push({ selector, body, at });
        }
        head = '';
        i = j;
        continue;
      }
      if (ch === '}') { head = ''; i += 1; continue; }
      head += ch;
      i += 1;
    }
  };
  walk(text_of(css), []);
  return out;
}

const text_of = (x) => x;

/** Custom properties declared at the top level of the sheet, so `var()` can be resolved. */
function tokens(all) {
  const map = new Map();
  for (const r of all) {
    if (r.at.length) continue;
    if (!/:root/.test(r.selector)) continue;
    for (const m of r.body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map.set(m[1], m[2].trim());
  }
  return map;
}

/** A CSS time in milliseconds, following one level of `var()` indirection. */
function timeMs(value, toks) {
  const resolved = value.replace(/var\(\s*(--[\w-]+)\s*\)/g, (_, name) => toks.get(name) ?? '');
  const m = /(-?\d*\.?\d+)\s*(ms|s)\b/.exec(resolved);
  if (!m) return null;
  return m[2] === 'ms' ? Number(m[1]) : Number(m[1]) * 1000;
}

const decl = (body, prop) => {
  const m = new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;}]+)`, 'i').exec(body);
  return m ? m[1].trim() : null;
};

const CSS = stripComments(read(SHEET));
const PAGE_SRC = stripComments(read(PAGE));
const ALL = rules(CSS);
const TOKENS = tokens(ALL);

test('the stylesheet parsed into real rules — otherwise this file knows nothing', () => {
  assert.ok(
    ALL.length > 40,
    `the landing stylesheet parsed into ${ALL.length} rules. That is a broken parser, not a `
    + 'small stylesheet: every assertion below would pass vacuously over an empty list.',
  );
  assert.ok(
    LAYERS.length > 0,
    'the LAYERS table is empty, so every per-layer assertion below iterates nothing and passes.',
  );
});

test('the hero carries the living layers by class', () => {
  const hero = /<section class="ap-hero"[\s\S]*?<\/section>/.exec(PAGE_SRC);
  assert.ok(
    hero,
    'could not locate the <section class="ap-hero"> block in index.astro. The markup check '
    + 'below has read nothing — fix this harness before trusting it.',
  );
  const html = hero[0];

  assert.match(
    html,
    /class="ap-field"/,
    'the hero has no .ap-field container, so there is no living background at all.',
  );
  for (const cls of STILL) {
    assert.match(
      html,
      new RegExp(`class="${cls}"`),
      `the hero has no .${cls} — a still layer the composition needs. Without the sky the moving `
      + 'layers drift over nothing; without the grain the bloom bands into rings on an 8-bit screen.',
    );
    assert.ok(
      ALL.some((r) => r.at.length === 0 && r.selector.split(',').some((x) => x.trim().endsWith(`.${cls}`))),
      `.${cls} is in the markup and has no top-level rule in landing.css — it paints nothing.`,
    );
  }
  for (const { cls, what } of LAYERS) {
    assert.match(
      html,
      new RegExp(`class="${cls}"`),
      `the hero has no .${cls} — ${what}.`,
    );
  }

  // The route's whole claim. A layer that needed a script would not be one of these layers.
  assert.doesNotMatch(html, /<canvas\b/i, 'a <canvas> is back in the hero; this route ships no JS.');
  assert.doesNotMatch(html, /<script\b/i, 'a <script> is back in the hero; this route ships no JS.');
});

test('every living layer animates for a real, non-zero duration', () => {
  for (const { cls, what } of LAYERS) {
    const base = ALL.filter((r) => r.at.length === 0 && r.selector.split(',').some((s) => s.trim().endsWith(`.${cls}`)));
    assert.ok(
      base.length > 0,
      `.${cls} has no top-level rule in landing.css — ${what} is markup with no style behind it.`,
    );

    const withAnim = base.find((r) => decl(r.body, 'animation'));
    assert.ok(
      withAnim,
      `.${cls} is styled but never given an \`animation\`. It is a still rectangle: ${what}.`,
    );

    const value = decl(withAnim.body, 'animation');
    const ms = timeMs(value, TOKENS);
    assert.ok(
      ms !== null,
      `.${cls} declares \`animation: ${value}\` with no readable duration. If that is a var(), `
      + 'the token it names is not declared on :root — a dead declaration that animates nothing.',
    );
    assert.ok(
      ms > 0,
      `.${cls} animates for ${ms}ms. A zero duration is a layer that never moves.`,
    );

    // The keyframes it names must exist, or the animation is a name pointing at nothing.
    const name = value.trim().split(/\s+/).find((t) => /^[a-zA-Z_-][\w-]*$/.test(t)
      && !/^(infinite|alternate|linear|both|forwards|backwards|reverse|normal|none|paused|running|ease|ease-in|ease-out|ease-in-out)$/.test(t));
    assert.ok(name, `.${cls} declares \`animation: ${value}\` with no keyframes name in it.`);
    assert.ok(
      ALL.some((r) => new RegExp(`^@keyframes\\s+${name}$`).test(r.selector.trim())),
      `.${cls} animates \`${name}\`, and there is no \`@keyframes ${name}\` in the stylesheet. `
      + 'The layer is declared and paints nothing.',
    );
  }
});

test('prefers-reduced-motion stops every one of them', () => {
  const reduced = ALL.filter((r) => r.at.some((a) => /prefers-reduced-motion\s*:\s*reduce/.test(a)));
  assert.ok(
    reduced.length > 0,
    'landing.css has no @media (prefers-reduced-motion: reduce) block. Every layer below keeps '
    + 'moving for a reader who asked the operating system for no motion.',
  );

  for (const { cls } of LAYERS) {
    const stopped = reduced.some((r) => {
      if (!r.selector.split(',').some((s) => s.trim().endsWith(`.${cls}`))) return false;
      const a = decl(r.body, 'animation');
      return a !== null && /^none\b/.test(a);
    });
    assert.ok(
      stopped,
      `.${cls} is not disabled under prefers-reduced-motion. It keeps drifting for a reader who `
      + 'asked for no motion.',
    );
  }

  // The still frame has to be the finished frame. `.ap-in` is a `both`-filled entrance from
  // opacity 0, so `animation: none` there would park the hero copy invisible — it is collapsed
  // to an instant instead. That distinction is the whole reason this assertion is separate.
  const entrance = reduced.find((r) => r.selector.split(',').some((s) => s.trim().endsWith('.ap-in')));
  assert.ok(entrance, '.ap-in has no reduced-motion rule, so the hero copy still slides in.');
  assert.equal(
    decl(entrance.body, 'animation'),
    null,
    '.ap-in is switched off with `animation: none` under reduced motion. It is a both-filled '
    + 'entrance from opacity 0, so that parks the whole hero invisible. Collapse the duration '
    + 'to 1ms instead.',
  );
  const dur = timeMs(decl(entrance.body, 'animation-duration') ?? '', TOKENS);
  assert.ok(
    dur !== null && dur <= 1,
    '.ap-in under reduced motion must collapse to an instant (animation-duration: 1ms), so the '
    + 'finished frame is what renders.',
  );
});

/**
 * THE MIRROR BUG, CHECKED RATHER THAN PROMISED.
 *
 * global.css records this failure in its own comments: the `[data-theme='dark']` block and the
 * `prefers-color-scheme: dark` block drifted apart, so people who had picked dark explicitly saw
 * one palette and people whose operating system was dark saw another, and nothing reported it
 * because both files were valid CSS. landing.css now carries the same two blocks for the same
 * reason, and its header says this test holds them together — so it had better.
 *
 * It also enforces the rule the task states directly: every colour is declared on bare `:root`
 * first. A token that appears ONLY inside the dark blocks does not exist at all for a visitor who
 * has expressed no preference, which is most visitors.
 */
test('the two dark blocks agree with each other, and neither invents a token', () => {
  const declared = (selector, pred) => {
    const rule = ALL.find(pred);
    assert.ok(rule, `landing.css has no ${selector} block. This test has measured nothing.`);
    const m = new Map();
    for (const d of rule.body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) m.set(d[1], d[2].trim());
    assert.ok(m.size > 0, `the ${selector} block declares no custom properties — broken parse.`);
    return m;
  };

  const systemDark = declared(
    '@media (prefers-color-scheme: dark) :root',
    (r) => r.at.some((a) => /prefers-color-scheme\s*:\s*dark/.test(a)) && /:root/.test(r.selector),
  );
  const stampedDark = declared(
    ":root[data-theme='dark']",
    (r) => !r.at.length && /\[data-theme=['"]dark['"]\]/.test(r.selector) && /--/.test(r.body),
  );

  assert.deepEqual(
    [...stampedDark.keys()].sort(),
    [...systemDark.keys()].sort(),
    'the explicit dark stamp and the system-dark override declare different token sets. That is '
    + 'the exact drift global.css got caught by: one kind of dark reader gets a palette the other '
    + 'does not.',
  );
  for (const [token, value] of systemDark) {
    assert.equal(
      stampedDark.get(token),
      value,
      `${token} is ${value} under system dark and ${stampedDark.get(token)} under an explicit `
      + 'dark stamp. The two darks have drifted.',
    );
  }

  // And every one of them must exist unconditionally first.
  const base = declared(':root', (r) => !r.at.length && r.selector.trim() === ':root');
  const missing = [...systemDark.keys()].filter((t) => !base.has(t));
  assert.deepEqual(
    missing,
    [],
    `${missing.join(', ')} is declared only inside a dark block. A visitor who has expressed no `
    + 'colour preference never gets it, and that is the default state.',
  );
});

test('the rejected three.js build animation has not come back', () => {
  assert.doesNotMatch(
    PAGE_SRC,
    /BuildStage/,
    'index.astro references BuildStage again. It was deleted on the owner\'s word: "I do not '
    + 'need that animation of the parts being built."',
  );
  assert.doesNotMatch(CSS, /ap-hero__stage/, 'landing.css still styles the deleted .ap-hero__stage slot.');
});
