/**
 * Dd7711a — AN INTERNAL REVIEW PAGE WAS PART OF THE PRODUCT.
 *
 * /app/ui-lab is the generative-UI specimen book: every approved block type with fixture data,
 * the ten canonical empty states, the nine status marks — and, deliberately, four hostile
 * documents carrying `javascript:alert(1)` and `<img src=x onerror=alert(1)>` so a reviewer can
 * watch the sanitiser refuse them. All of that is correct for a reviewer and bewildering for a
 * customer, and the route sat inside the ordinary AuthGuard: anyone signed in could reach it by
 * typing the path or following a link somebody pasted, and land on a page reading
 * "CANONICAL STATES · M01–M10" and "Tone is a property of the state, not a prop".
 *
 * It was ALSO unstyled. Thirteen `lab-*` class names, not one rule for any of them anywhere in the
 * bundle — so the specimens had no frame, the index column no grid, and the rejection cases looked
 * exactly like the approved ones.
 *
 * TWO FIXES, because they answer two different questions.
 *
 *   The route is registered only under `import.meta.env.DEV`, and the lazy import with it, so a
 *   production build neither serves it nor ships it. MEASURED with `vite build`: with the route
 *   registered the build emits `ui-lab-*.js` (13.80 kB / 5.29 gzip) and the entry is 589.80 kB;
 *   gated, there is no such chunk, the entry is 586.71 kB, and
 *   `grep -rl 'ui-lab\|UI lab\|CANONICAL STATES' dist/` returns nothing at all.
 *
 *   The page is drawn, because the reviewers who still open it in development are judging whether
 *   ten empty states read as one family — a question an unstyled page cannot answer. MEASURED in
 *   Chromium at 1200px: 27 `.lab-specimen` cards at 20px padding with a --line hairline at --r-md
 *   on --paper-2, 4 `.lab-invalid` carrying a 2px --bad leading rule, `.lab-marks` at four
 *   columns, `.lab-states` at three, `.lab-layout` at `200px 860px` with a sticky index, and no
 *   horizontal page overflow.
 *
 * Source-read, which is this package's standing bound; the numbers above are the evidence.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(WEB, ...p), 'utf8');
/** Comments stripped: prose describing a route is not a route, and prose naming a rule is not one. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const APP = code(read('src', 'app.tsx'));
const LAB = read('src', 'routes', 'ui-lab.tsx');
const LAB_CSS = code(read('src', 'routes', 'ui-lab.css'));

test('THE SPECIMEN BOOK IS NOT PART OF THE PRODUCT A CUSTOMER GETS', () => {
  // The route itself must be conditional, not just its element. An element that renders null
  // leaves /app/ui-lab as a blank white screen, which is the same defect wearing a costume — the
  // path has to fall through to `path="*"` and the ordinary Not found page.
  const route = /\{import\.meta\.env\.DEV && \(\s*<Route\s+path="\/ui-lab"/.exec(APP);
  assert.ok(route, '/ui-lab must be registered only under import.meta.env.DEV');
  assert.doesNotMatch(
    APP.replace(/\{import\.meta\.env\.DEV && \([\s\S]*?\n {20}\)\}/g, ''),
    /path="\/ui-lab"/,
    'a second, ungated registration of /ui-lab defeats the first',
  );
  // And the chunk must be unreachable, not merely unvisited: `import.meta.env.DEV` is a build-time
  // constant, so this is what stops the bundler emitting ui-lab-*.js at all.
  assert.match(
    APP,
    /const UiLabPage = import\.meta\.env\.DEV\s*\?\s*lazy\(\(\) => import\('\.\/routes\/ui-lab'\)/,
    'the lazy import must be dead in a production build, or the page still ships',
  );
  // `path="*"` still has to be the last route, or falling through reaches nothing.
  assert.match(APP, /<Route path="\*" element=\{<NotFoundPage \/>\} \/>/);
});

test('and the hostile specimens it carries are exactly why', () => {
  // Not a rule about the route so much as the evidence for it: these strings are correct on a
  // review page and are not something to hand a fifteen-year-old's customers.
  assert.match(LAB, /javascript:alert\(1\)|onerror=alert\(1\)/,
    'if the rejection cases ever leave, re-read the gate above — it was justified by them');
});

test('every lab-* class the page emits is drawn by something', () => {
  // The drift this repository keeps finding, in its purest form: thirteen names in the markup and
  // none in any stylesheet. Collected from the JSX so a rename cannot leave the rules orphaned.
  const emitted = new Set(
    [...code(LAB).matchAll(/className=(?:"([^"]*)"|\{`((?:[^`\\]|\\.)*)`\})/g)]
      .flatMap((m) => [...(m[1] ?? m[2]).matchAll(/\blab-[\w-]+/g)].map((x) => x[0])),
  );
  assert.ok(emitted.size >= 13, `expected at least 13 lab-* classes, found ${[...emitted].join(', ')}`);
  assert.match(LAB, /import '\.\/ui-lab\.css'/, 'a stylesheet nothing imports is not a stylesheet');
  for (const name of emitted) {
    assert.match(
      LAB_CSS,
      new RegExp(`\\.${name}(?![\\w-])[^{}]*\\{[^{}]*\\S[^{}]*\\}`),
      `.${name} is rendered by ui-lab.tsx and has no rule`,
    );
  }
});

test('the specimens are separable, and a refused document is not drawn as an approved one', () => {
  assert.match(LAB_CSS, /\.lab-specimen\s*\{[^{}]*border:\s*1px solid var\(--line\)/,
    'without a frame two specimens run together and one component’s spacing reads as the next one’s');
  assert.match(LAB_CSS, /\.lab-invalid\s*\{[^{}]*border-inline-start:\s*2px solid var\(--bad\)/,
    'the four hostile documents looked identical to the approved ones');
  // The grids are the whole point of the two comparison sections: these states are only judgeable
  // side by side.
  for (const grid of ['lab-marks', 'lab-states', 'lab-layout']) {
    assert.match(LAB_CSS, new RegExp(`\\.${grid}\\s*\\{[^{}]*display:\\s*grid`), `.${grid} must be a grid`);
  }
  // A wide specimen must not push the page sideways — `1fr` alone would, because a grid item's
  // default min-width is auto.
  assert.match(LAB_CSS, /\.lab-layout\s*\{[^{}]*grid-template-columns:\s*200px minmax\(0, 1fr\)/);
  assert.match(LAB_CSS, /@media \(max-width: 860px\)/, 'the two-column layout has to collapse somewhere');
});
