// The test of the thing that decides what a browser does with a page.
//
// `/pricing` served `application/octet-stream` on the live site, so every browser DOWNLOADED the
// pricing page instead of rendering it. The commercial page of the product, not opening.
//
// THE MECHANISM, because it is the interesting part. `serveStatic` reads
// `row.content_type ?? contentTypeFor(row.path)`. The admin upload route has always accepted and
// stored a `contentType`, and `deploy-static.mjs` never sent one — so every object in the store
// had content_type NULL and fell through to the guess. `contentTypeFor` derives the extension with
// `path.split('.').pop()`, which for the extensionless key `/pricing` returns the whole string
// `/pricing`, matches no MIME entry, and yields octet-stream.
//
// WHAT MISSED IT. Every check any of us ran: curl does not care about content-type, grep does not
// care, and the byte counts were correct because the BYTES were correct. It was caught by
// check-pixels failing 4 of 72 frames with `page.goto: Download is starting` — a real browser
// refusing to render, found by rbxai-a3 while re-baselining. The lesson is narrower than "test
// more": a check that reads a response BODY cannot see a defect that lives in its headers.
//
// The fix is in the uploader rather than the worker, because the key has no extension and the
// local file does. These tests pin the derivation to the FILE NAME.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'infra', 'deploy-static.mjs'), 'utf8');

/**
 * The real `contentTypeOf`, lifted out of the script by name and evaluated.
 *
 * deploy-static.mjs performs an upload the moment it is imported, so it cannot be required here.
 * Extracting the function keeps this a test OF that function rather than of a copy of it: if
 * someone edits the one in the script, this runs the edited one.
 */
function contentTypeOf(path) {
  const mime = SRC.slice(SRC.indexOf('const MIME = {'), SRC.indexOf('function contentTypeOf'));
  const fn = SRC.slice(SRC.indexOf('function contentTypeOf'), SRC.indexOf('async function upload'));
  // eslint-disable-next-line no-new-func
  return Function(`${mime}\n${fn}\nreturn contentTypeOf(${JSON.stringify(path)});`)();
}

test('THE DEFECT: an html file uploaded to an EXTENSIONLESS key still gets text/html', () => {
  // The whole bug in one line. The remote key is `/pricing`; the local file is the one that knows.
  assert.equal(contentTypeOf('apps/site/dist/pricing/index.html'), 'text/html; charset=utf-8');
});

test('a dot elsewhere in the PATH does not count as an extension', () => {
  // The precise confusion that produced octet-stream: `'/pricing'.split('.').pop()` returns
  // `/pricing`. A derivation that looks anywhere in the string finds dots in directory names and
  // in nothing at all, and is confidently wrong either way.
  assert.equal(contentTypeOf('/some.dir/pricing'), null, 'a dot in a directory is not the file type');
  assert.equal(contentTypeOf('/pricing'), null, 'no extension means no claim');
  assert.equal(contentTypeOf('apps/site/dist/pricing'), null);
});

test('the types the site actually ships are all derived', () => {
  const want = {
    'x/index.html': 'text/html; charset=utf-8',
    'x/style.css': 'text/css; charset=utf-8',
    'x/app.js': 'text/javascript; charset=utf-8',
    'x/og.png': 'image/png',
    'x/icon.svg': 'image/svg+xml',
    'x/site.webmanifest': 'application/manifest+json',
    'x/robots.txt': 'text/plain; charset=utf-8',
    'x/sitemap-0.xml': 'application/xml; charset=utf-8',
    'x/f.woff2': 'font/woff2',
  };
  for (const [p, t] of Object.entries(want)) assert.equal(contentTypeOf(p), t, p);
});

test('an unknown extension claims nothing rather than guessing', () => {
  // null, not octet-stream: a null lets the server fall back to its own derivation, while a
  // confident wrong type overrides it. Claiming less is the safe direction here.
  assert.equal(contentTypeOf('x/thing.wat'), null);
});

test('the uploader SENDS it — a derivation nothing transmits is not a fix', () => {
  // The half that made this possible in the first place: the route accepted `contentType` and
  // nothing ever passed one, so the field existed and was always null.
  assert.match(SRC, /const contentType = contentTypeOf\(localPath\)/, 'it must be derived per file');
  assert.match(SRC, /JSON\.stringify\(\{ path: remotePath, contentType,/, 'and put in the request body');
});

test('the worker still prefers a stored type over its own guess', () => {
  // The other half of the contract, asserted against the worker rather than assumed: if this line
  // ever became `contentTypeFor(row.path)` alone, sending the type would silently stop working.
  const worker = readFileSync(join(ROOT, 'apps', 'worker', 'src', 'static.ts'), 'utf8');
  assert.match(worker, /row\.content_type \?\? contentTypeFor\(row\.path\)/);
});
