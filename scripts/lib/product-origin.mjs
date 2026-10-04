// Where the product lives, read from the one file that declares it.
//
// FIVE SCRIPTS HELD THEIR OWN COPY OF THE HOSTNAME AND ALL FIVE HELD THE OLD ONE.
// import-assets.mjs, unimport-assets.mjs and ingest-assets.mjs POST to /api/admin/* on
// `golem.moshe-barami111.workers.dev`, and the legacy host's redirect deliberately EXEMPTS /api/*
// — so those three were not "pointing at an old name", they were writing to a different, older
// deployment. Measured 2026-09-20: /api/health answers buildSha 44d9ded-dirty there against
// 946cf5f on the canonical origin, 38 commits apart. probe-s1.mjs and check-pixels.mjs read the
// same stale value and then WROTE IT INTO THE EVIDENCE FILE as the origin they had probed.
// (That was then. Since the cutover the product is https://studpilot.app and the former hosts are
// stand-ins that forward /api/* to it until 2027-01-02, but the lesson stands: a script that types
// a hostname goes stale at the next move, and one that reads it moves with it.)
//
// So the value is derived rather than restated. A constant typed into a script proves only that
// the script agrees with itself; this proves it agrees with the package every client imports.
// packages/shared is TypeScript and these are plain .mjs run by bare node — there is no loader in
// the way — so the declaration is read as text, and a missing declaration THROWS rather than
// falling back to a literal, because a fallback is how the stale copy survives the next rename.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHARED = join(dirname(fileURLToPath(import.meta.url)), '../../packages/shared/src/index.ts');

function declared(name, pattern) {
  let src;
  try { src = readFileSync(SHARED, 'utf8'); }
  catch (e) { throw new Error(`cannot read packages/shared/src/index.ts to resolve ${name}: ${e.message}`); }
  const m = pattern.exec(src);
  if (!m) {
    throw new Error(
      `${name} is no longer declared in packages/shared/src/index.ts. Every script that talks to the `
      + 'product reads it from there on purpose — re-aim scripts/lib/product-origin.mjs rather than '
      + 'typing the hostname back into a script.',
    );
  }
  return m[1];
}

/** `https://studpilot.app` — the origin every client is sent to. */
export const PRODUCT_ORIGIN = declared('PRODUCT_ORIGIN', /export const PRODUCT_ORIGIN = '([^']+)'/);

/**
 * `golem.moshe-barami111.workers.dev` — a former host, a stand-in until 2027-01-02.
 *
 * Exported so a checker can name the thing it refuses. Nothing here should ever SEND to it: it
 * forwards /api/* to the product only while the stand-in exists, and a script written against it
 * stops working on the day the stand-in is deleted.
 */
export const LEGACY_PRODUCT_HOST = declared('LEGACY_PRODUCT_HOST', /export const LEGACY_PRODUCT_HOST = '([^']+)'/);
