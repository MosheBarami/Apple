// Every data-fetching route must say when it is loading and when it failed.
//
// THE DEFECT: workspace.tsx — the product's main route — ran two queries and handled neither. While
// the fetch was in flight, and after it FAILED, it fell through to the full workspace render: a
// header titled "Build", every panel empty, and nothing saying the data never arrived. A screen
// that looks like an empty project is indistinguishable from an empty project.
//
// That is the same defect as a green check over a failed build, in UI form, so it is gated the
// same way.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');
const ROUTES = join(SRC, 'routes');

/**
 * Every .tsx under src, not just src/routes.
 *
 * THE GATE SAYS "every user-facing surface" AND THIS CHECKED ONLY ROUTES. Three components fetch
 * and are as user-facing as any route — layout.tsx carries the rail's usage meter, and the
 * workspace's memory and credits panels each run their own query. A panel that renders the same
 * thing whether its fetch is in flight, failed, or returned nothing is the defect in the header of
 * this file, and it was outside the sweep: the gate could report green over surfaces it had never
 * looked at, which is the failure the gate exists to prevent, one level up.
 */
function tsxUnder(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsxUnder(full));
    else if (entry.name.endsWith('.tsx')) out.push({ file: relative(SRC, full), src: readFileSync(full, 'utf8') });
  }
  return out;
}

/**
 * Surfaces that fetch, and therefore can be mid-flight or can fail.
 *
 * A CALL to a query hook, not the letters "useQuery": `useQueryClient` begins with them, and the
 * DEV-only chat specimen (routes/studio-preview.tsx) uses it to SEED the cache so the credits drawer
 * renders without a request — it runs no query and has no in-flight or failed state to show. On
 * 2026-09-22 the call form selected 19 files and the old substring the same 19 plus that one.
 */
const fetching = tsxUnder(SRC).filter(({ src }) => /\buse(?:Suspense)?Quer(?:y|ies)\s*[(<]/.test(src));

test('there are surfaces to check, so this cannot pass vacuously', () => {
  assert.ok(fetching.length >= 5, `expected several fetching surfaces, found ${fetching.length}`);
  // And the sweep must actually reach past routes/, or widening it achieved nothing.
  const outsideRoutes = fetching.filter(({ file }) => !file.startsWith('routes/'));
  assert.ok(outsideRoutes.length >= 3,
    `expected fetching components outside routes/, found ${outsideRoutes.map((f) => f.file).join(', ')}`);
});

test('every fetching surface handles the in-flight state', () => {
  for (const { file, src } of fetching) {
    assert.match(
      src,
      /isPending|isLoading|aria-busy|Spinner|Forge|Skeleton/,
      `${file}: fetches but never indicates it is loading`,
    );
  }
});

test('every fetching surface handles failure', () => {
  for (const { file, src } of fetching) {
    assert.match(
      src,
      /isError|\.error\b|ErrorState|connectionFailed/,
      `${file}: fetches but renders the same thing whether or not the fetch failed`,
    );
  }
});

test('the workspace specifically distinguishes loading, failed and not-found', () => {
  // Three different outcomes that used to render as one: an empty workspace.
  const src = readFileSync(join(ROUTES, 'workspace.tsx'), 'utf8');
  assert.match(src, /if \(project\.isPending\)/, 'in-flight must be its own branch');
  assert.match(src, /if \(project\.isError\)/, 'failure must be its own branch');
  assert.match(src, /project\.isSuccess && project\.data === null/, 'not-found must stay distinct from failure');

  // Order matters: a pending query has no data, so a not-found check placed first would claim the
  // project is gone every time the page opens.
  const pending = src.indexOf('if (project.isPending)');
  const notFound = src.indexOf('project.isSuccess && project.data === null');
  assert.ok(pending < notFound, 'the pending branch must come before the not-found branch');

  // A failure must offer a way out, not just an apology.
  const errBranch = src.slice(src.indexOf('if (project.isError)'), notFound);
  assert.match(errBranch, /refetch\(\)/, 'a failed load must offer a retry');
});

test('a failure state is announced to assistive technology, an empty shelf is not', () => {
  // Reading "Summon your first project" to a screen-reader user as an alert would be noise;
  // silently swallowing "Could not reach Apple" would not be.
  const es = readFileSync(join(HERE, '..', 'src', 'components', 'empty-state.tsx'), 'utf8');
  assert.match(es, /role=\{isFailure \? 'alert' : undefined\}/);
  const model = readFileSync(join(HERE, '..', 'src', 'components', 'empty-state-model.ts'), 'utf8');
  assert.match(model, /connectionFailed:[\s\S]{0,200}tone: 'failure'/);
});
