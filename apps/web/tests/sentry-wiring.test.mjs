/**
 * ERROR MONITORING — IS IT ACTUALLY PLUGGED IN, AND DOES IT AGREE WITH THE WORKER?
 *
 * sentry.test.mjs proves the module. This file holds the two things that live outside it:
 *
 *   1. THE WIRING. A monitoring module with no caller is the same defect as a retention sweep
 *      with no cron, and it is invisible: every test in sentry.test.mjs passes on a tree where
 *      main.tsx never calls `installSentry` and the crash card never reports. Read from source,
 *      because a bundler is the only other way to see it and the assertion would then be about
 *      the bundle rather than about the code somebody edits.
 *
 *   2. THE DRIFT. There are now two scrubbers in this repository — apps/worker/src/redaction.ts,
 *      which is the real one, and the deliberate subset in apps/web/src/lib/sentry.ts, which
 *      cannot import it across the package boundary. Two independently-maintained credential
 *      tables is a standing invitation for one to be weakened while the other is not, so the
 *      shared specimens below are driven through BOTH, and so are the route labels. Weaken either
 *      side and this file goes red.
 *
 * Run with:  node --test apps/web/tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const ESBUILD = join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild');
const SRC = join(WEB, 'src');
const read = (...p) => readFileSync(join(SRC, ...p), 'utf8');

const dir = mkdtempSync(join(tmpdir(), 'sentrydrift-'));
const bundle = (entry, name) => {
  const out = join(dir, name);
  execFileSync(ESBUILD, [entry, '--bundle', '--format=esm', '--platform=neutral', '--main-fields=main,module', '--outfile=' + out], { stdio: 'pipe' });
  return import(out);
};
const WEBS = await bundle(join(WEB, 'src', 'lib', 'sentry.ts'), 'web-sentry.mjs');
const WORKER_REDACTION = await bundle(join(WEB, '..', 'worker', 'src', 'redaction.ts'), 'worker-redaction.mjs');
const WORKER_ANALYTICS = await bundle(join(WEB, '..', 'worker', 'src', 'analytics.ts'), 'worker-analytics.mjs');

/* ------------------------------------------------------------------- the wiring --- */

test('main.tsx installs the reporter before React mounts, and it is the only reader of the DSN', () => {
  const MAIN = read('main.tsx');
  assert.match(MAIN, /import \{ installSentry \}/, 'main.tsx no longer imports installSentry');
  assert.match(MAIN, /installSentry\(\{[\s\S]*?dsn: import\.meta\.env\.VITE_SENTRY_DSN/, 'main.tsx no longer passes the DSN');
  // BEFORE render. Installing afterwards leaves every error thrown during the first mount — which
  // is where the interesting ones live — outside the handlers.
  //
  // Anchored on `createRoot(rootEl)`, the CALL, rather than on `createRoot(`: main.tsx's own
  // comment explains why installation comes first and names the function while doing it, so the
  // looser anchor found the prose above the line it was trying to order against and reported the
  // file as wrong when it was right.
  const installAt = MAIN.indexOf('installSentry({');
  const renderAt = MAIN.indexOf('createRoot(rootEl)');
  assert.ok(installAt !== -1 && renderAt !== -1, 'main.tsx no longer installs monitoring or no longer mounts React');
  assert.ok(installAt < renderAt, 'monitoring is installed after the first render, so first-mount crashes are missed');
});

/**
 * Lines that are prose, not code. Both files below DISCUSS `import.meta.env` in their headers —
 * explaining why they do not read it — so a plain `includes` would fail on the very comment that
 * documents the rule. Checking per line, and skipping the commented ones, is the difference
 * between asserting the code and asserting the prose about the code.
 */
const isComment = (line) => {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
};
const codeLinesMentioning = (src, needle) =>
  src.split('\n').filter((l) => l.includes(needle) && !isComment(l));

test('nothing but main.tsx reads the DSN, so no module is untestable because of a build flag', () => {
  // lib/sentry.ts takes the DSN as an argument on purpose: reading Vite's build-time env there
  // would make the module unloadable by `node --test` without Vite's define pass, which is the
  // same reason lib/error-taxonomy.ts gives in its own header.
  assert.deepEqual(codeLinesMentioning(read('lib', 'sentry.ts'), 'import.meta.env'), [],
    'lib/sentry.ts now reads the build-time env directly, which makes it untestable without Vite');
  assert.deepEqual(codeLinesMentioning(read('components', 'error-boundary.tsx'), 'import.meta.env'), []);
  // And main.tsx really does read it — without this the test passes on a tree where the DSN is
  // never read anywhere at all.
  assert.ok(codeLinesMentioning(read('main.tsx'), 'import.meta.env.VITE_SENTRY_DSN').length === 1);
});

test('the crash card reports the error AND still writes it to the console', () => {
  const BOUNDARY = read('components', 'error-boundary.tsx');
  const method = /override componentDidCatch\([\s\S]*?\n  \}/.exec(BOUNDARY);
  assert.ok(method, 'componentDidCatch is gone');
  assert.match(method[0], /captureException\(/, 'the crash card no longer reports anything');
  //[[ THE CONSOLE LINE IS NOT OPTIONAL, and this assertion is the point of the test.
  //
  //   The failure shape this repository keeps finding is a mechanism that removed the old signal
  //   and then quietly failed to produce the new one. Reporting to Sentry is an ADDITION to the
  //   console entry a developer with devtools open is actually reading — deleting it in favour of
  //   the dashboard trades a signal that always works for one that needs a DSN, a network and
  //   somebody logged in. ]]
  assert.match(method[0], /console\.error\(/, 'the console entry was removed in favour of the report');
  // And the report is not awaited: a boundary that waits on the network before painting shows a
  // white screen exactly when the network is the thing that broke.
  assert.match(method[0], /void captureException\(/, 'the report is awaited, which delays the crash card');
  // The component stack is NOT sent — it is the one string here that grows without bound.
  assert.equal(/captureException\([^)]*componentStack/.test(method[0]), false, 'the component stack is being sent');
});

/* -------------------------------------------------------------------- the drift --- */

/**
 * Every shape both scrubbers must remove. One list, two implementations.
 *
 * These are SHAPES, not secrets: each is a syntactically valid example of its format with nothing
 * real in it. The point of the list being shared is that adding a rule to one side and not the
 * other is the failure, so a new entry here fails on whichever side is behind.
 */
const SPECIMENS = {
  jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk',
  email: 'someone.real@example.com',
  apple_api_key: 'gk_live_0123456789abcdef01234567_0123456789abcdef0123456789abcdef0123456789abcdef',
  anthropic_key: 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123',
  openai_key: 'sk-abcdefghijklmnopqrstuvwxyz0123',
  github_token: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
  aws_access_key_id: 'AKIAIOSFODNN7EXAMPLE',
  google_api_key: 'AIzaSyA1234567890abcdefghijklmnopqrstuv',
  slack_token: 'xoxb-1234567890-abcdefghijklmnop',
  long_hex: '0123456789abcdef0123456789abcdef0123456789',
  pairing_token: '8f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f.0123456789abcdef0123456789abcdef0123456789abcdef',
};

test('every shape the worker removes from a log, the browser removes from an event', () => {
  for (const [kind, specimen] of Object.entries(SPECIMENS)) {
    const inWeb = WEBS.redactText(`before ${specimen} after`);
    assert.equal(inWeb.includes(specimen), false, `the BROWSER scrubber let a ${kind} through`);
    // And the diagnostic text around it survives — a scrubber that returned '' would pass the
    // line above while destroying every error report in the product.
    assert.match(inWeb, /before .* after/, `the browser scrubber destroyed the text around a ${kind}`);

    const inWorker = WORKER_REDACTION.redact(`before ${specimen} after`, { placeholder: 'labelled' }).text;
    assert.equal(inWorker.includes(specimen), false, `the WORKER scrubber let a ${kind} through`);
  }
});

test('the two scrubbers agree on ordinary text, so neither is quietly redacting the product', () => {
  // The other direction, and it is the one that makes a scrubber get switched off: over-redaction.
  // These must survive both sides intact.
  for (const benign of [
    'TypeError: Cannot read properties of undefined (reading "map")',
    'the build failed at step 3 of 7',
    'Failed to fetch https://apple.example/api/projects/list',
    'v0.1.0 (build cafe123)',
  ]) {
    assert.equal(WEBS.redactText(benign), benign, `the browser scrubber mangled: ${benign}`);
    assert.equal(WORKER_REDACTION.redact(benign, { placeholder: 'labelled' }).text, benign, `the worker scrubber mangled: ${benign}`);
  }
});

test('the two route labellers agree about what an id is', () => {
  //[[ WHY THIS MATTERS RATHER THAN BEING TIDINESS. Both labellers exist to keep customer
  //   identifiers out of a monitoring transaction name. If the browser's is looser than the
  //   worker's, the SPA half of the same Sentry organisation starts filing issues titled with
  //   project uuids while the worker half does not — and the leak is in the half nobody audited,
  //   because "the worker redacts it" was the answer everybody remembered. ]]
  for (const path of [
    '/projects/8f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f/files',
    '/api/projects/8f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f/ws',
    '/invoices/12345',
    '/settings/security',
    '/',
    '/share/0123456789abcdef0123456789abcdef',
  ]) {
    assert.equal(
      WEBS.routeLabel(path),
      WORKER_ANALYTICS.routeLabel(path),
      `the two labellers disagree about ${path}`,
    );
  }
  // And they actually label — without this the test would pass on two functions that both return
  // the path untouched.
  assert.equal(WEBS.routeLabel('/projects/8f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f/files'), '/projects/:id/files');
});
