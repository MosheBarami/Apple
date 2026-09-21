// Uploads built frontends into the worker's D1 static store.
//   node infra/deploy-static.mjs [--only site|web]
//   node infra/deploy-static.mjs --file <local> <remote>
// Env: API_BASE, GOLEM_ADMIN_KEY (from repo .env)
//
// THE SECOND LINE USED TO BE DOCUMENTED AS `--only file <local> <remote>`, WHICH UPLOADS NOTHING.
// The code branches on `args[0] === '--file'`, so the documented spelling set `only = 'file'`,
// matched neither 'site' nor 'web', skipped both directories and printed `done`. A command that
// reports success having transferred zero bytes.
//
// That matters more than a typo because `--file` is the ROLLBACK path: it is what puts a captured
// copy of a page back over a bad one. So the failure mode was a restore that silently does nothing
// and says it worked, discovered at the only moment anyone runs it — during a bad deploy, under
// pressure, when nobody re-reads the source. An unknown `--only` value is now an error.
//
// UPLOAD ORDER IS DELIBERATE. This is not transactional: each file is a separate POST, and large
// files are chunked with `append`, so a failure part-way leaves a mixed site. Content-addressed
// assets go FIRST and pages LAST, because the survivable mixed state is old pages pointing at
// assets that all exist. The reverse — new pages referencing assets that never uploaded — is a
// broken site rather than a stale one.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
// .env IS A CONVENIENCE, NOT A REQUIREMENT. It is gitignored, so it does not exist in a fresh
// clone or in CI, and reading it unconditionally made this script throw ENOENT before it had even
// looked at its arguments — including when the environment already carried both values. The
// missing-credential error below is still a hard failure; what changed is that it is now the error
// you get, rather than a stack trace about a file that is supposed to be optional. Required so
// that infra/rollback-static.mjs can drive this uploader against a throwaway origin in its tests.
try {
  for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* no .env: the environment is expected to carry API_BASE and GOLEM_ADMIN_KEY */ }
const BASE = process.env.API_BASE;
const KEY = process.env.GOLEM_ADMIN_KEY;
if (!BASE || !KEY) throw new Error('API_BASE / GOLEM_ADMIN_KEY missing');

const CHUNK = 700_000; // bytes per request (D1 row limit headroom + request size)
const IMMUTABLE = /\.(js|css|woff2|png|jpg|webp|svg|glb)$/;
const HASHED = /(\/_astro\/|\/assets\/.*-[A-Za-z0-9_-]{8,}\.)/;

// THE UPLOADER KNOWS THE FILE'S TYPE; THE SERVER SHOULD NOT HAVE TO GUESS IT FROM A URL.
//
// `serveStatic` uses `row.content_type ?? contentTypeFor(row.path)`, and this script never sent a
// content type, so every object in the store fell through to the guess. `contentTypeFor` derives
// the extension with `path.split('.').pop()`, which for an extensionless key like `/pricing`
// returns the whole string `/pricing`, matches no MIME entry, and yields
// `application/octet-stream`. A browser asked to open the canonical pricing URL DOWNLOADED it.
//
// The key has no extension; the local file does — apps/site/dist/pricing/index.html. Deriving the
// type where that information exists fixes the class rather than the instance, and needs no worker
// deploy because the admin route has always accepted and stored the field.
//
// Found by rbxai-a3 while re-baselining: check-pixels failed 4 of 72 frames with
// `page.goto: Download is starting`. A real browser refusing to render the page, caught by a
// checker looking at pixels, after curl and grep had both passed it — neither of them cares what
// the content type is.
const MIME = {
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8', webmanifest: 'application/manifest+json',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  ico: 'image/x-icon', woff2: 'font/woff2', txt: 'text/plain; charset=utf-8',
  // Luau source, served as text so a browser RENDERS it. With no entry here the upload sends no
  // content type, the worker's own guess yields application/octet-stream, and `nosniff` turns
  // every "the Luau the model wrote" link on /showcase into a file download — which is not
  // "showing him the code", it is handing a fifteen-year-old a file his phone cannot open.
  luau: 'text/plain; charset=utf-8', lua: 'text/plain; charset=utf-8',
  xml: 'application/xml; charset=utf-8', glb: 'model/gltf-binary', map: 'application/json; charset=utf-8',
};

function contentTypeOf(localPath) {
  const name = localPath.split('/').pop() ?? '';
  // Only a real extension counts: a dot must appear in the FILE NAME, not merely somewhere in the
  // path, which is the exact confusion that produced octet-stream on /pricing.
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return null;
  return MIME[name.slice(dot + 1).toLowerCase()] ?? null;
}

async function upload(localPath, remotePath) {
  const data = readFileSync(localPath);
  const contentType = contentTypeOf(localPath);
  const immutable = IMMUTABLE.test(remotePath) && HASHED.test(remotePath);
  for (let i = 0; i * CHUNK < data.length || i === 0; i++) {
    const slice = data.subarray(i * CHUNK, (i + 1) * CHUNK);
    //[[ A CHUNK IS RETRIED, BECAUSE THE FAILURE THAT STOPS THIS IS TRANSIENT AND NOT OURS.
    //
    //   The store is D1, and D1 is shared with everything else this worker does. During a bulk
    //   asset ingest it answers "D1 DB exceeded its CPU time limit and was reset" — a plain 500
    //   with an empty body — and one of those aborted the whole deploy on the first stylesheet.
    //
    //   That is the worst moment for this script to be brittle, because it is also the ROLLBACK
    //   path: `--file` is what puts a captured copy of a page back over a bad one, run during a
    //   bad deploy, under pressure. A restore that dies on a transient 500 is a restore that does
    //   not happen.
    //
    //   Three attempts with growing backoff, and then it still throws — a chunk that will not go
    //   must stop the deploy, because the alternative is a page uploaded with a hole in it. The
    //   attempt count is printed so a deploy that only just survived does not look like a clean
    //   one. ]]
    let res = null;
    let body = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await fetch(`${BASE}/api/admin/static-upload`, {
          method: 'POST',
          headers: { 'X-Admin-Key': KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: remotePath, contentType, b64: slice.toString('base64'), immutable, append: i > 0 }),
        });
        if (res.ok) break;
        body = await res.text();
      } catch (e) {
        res = null;
        body = String(e?.message ?? e);
      }
      if (attempt < 2) {
        console.warn(`  retrying ${remotePath} chunk ${i} after ${res ? 'HTTP ' + res.status : 'network error'}`);
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1) ** 2));
      }
    }
    if (!res?.ok) throw new Error(`${remotePath} chunk ${i}: HTTP ${res?.status ?? 'network'} ${body} (3 attempts)`);
    if ((i + 1) * CHUNK >= data.length) break;
  }
  return data.length;
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

/**
 * Content-addressed assets first, everything else after, pages last.
 *
 * A hashed asset can never overwrite a different file — its name contains its content — so
 * uploading it early is free of risk, and it is what the new pages will ask for.
 */
function inUploadOrder(dir) {
  const files = [...walk(dir)];
  // The same path normalisation `upload` applies, so the immutability test agrees with the name
  // the file is actually stored under — on Windows `relative` yields backslashes and HASHED,
  // which looks for /_astro/ and /assets/, would match nothing.
  const remoteOf = (f) => '/' + relative(dir, f).split('\\').join('/');
  const rank = (f) => (HASHED.test(remoteOf(f)) ? 0 : /\.html$/.test(remoteOf(f)) ? 2 : 1);
  return files.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

async function uploadDir(dir, prefix) {
  let count = 0, bytes = 0;
  for (const file of inUploadOrder(dir)) {
    const rel = '/' + relative(dir, file).split('\\').join('/');
    const remote = prefix === '/' ? rel : prefix + rel;
    bytes += await upload(file, remote);
    count++;
    process.stdout.write(`\r${prefix} ${count} files, ${(bytes / 1024).toFixed(0)}KB   `);
  }
  console.log();
  return { count, bytes };
}

/**
 * DID THE URL A READER TYPES ACTUALLY CHANGE?
 *
 * THE FAILURE THIS EXISTS FOR, and it was live for a day before anyone looked. `/pricing` served a
 * page from the previous design — blue accents, a headline in 96px capitals, and the word "Sparks"
 * the owner had the product renamed away from — while `apps/site/dist/pricing/index.html` held the
 * current one and every deploy printed `done`. Both statements were true at once.
 *
 * The cause is in the worker's own lookup order. For a request to `/pricing` it tries, in order,
 * `/pricing`, then `/pricing.html`, then `/pricing/index.html` — and an old row sitting at the
 * bare `/pricing` key wins. This uploader writes `/pricing/index.html` and has no way to delete
 * anything, so a stale row at the shadowing key is permanent and invisible: the upload succeeds,
 * the row it wrote is correct, and the site serves the other one.
 *
 * Uploading is therefore not evidence of deploying. The only evidence is fetching the URL a reader
 * would type and finding the bytes that were just sent. That is all this does.
 *
 * ON THE RETRY. The worker caches responses for 60s under a key built from the REQUEST path, while
 * the upload busts a key built from the STORED path — for any extensionless URL those are
 * different strings, so a correct upload can still be shadowed by a cache entry for up to a minute.
 * A mismatch is therefore re-checked before it is believed. It is re-checked, not forgiven: if the
 * bytes are still wrong at the end of the window, the deploy fails.
 */
async function verifyServed(dir, prefix) {
  const pages = [...walk(dir)].filter((f) => f.endsWith('.html'));
  const wrong = [];
  for (const file of pages) {
    const rel = '/' + relative(dir, file).split('\\').join('/');
    const stored = prefix === '/' ? rel : prefix + rel;
    // The URL a reader types: `/x/index.html` is reached as `/x`, and the root one as `/`.
    const url = stored.replace(/\/index\.html$/, '') || '/';
    const want = sha256(readFileSync(file));
    let got = null;
    for (const waitMs of [0, 3000, 12000, 30000, 30000]) {
      if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
      const res = await fetch(BASE + url).catch(() => null);
      if (!res || !res.ok) { got = res ? `HTTP ${res.status}` : 'no response'; continue; }
      got = sha256(new Uint8Array(await res.arrayBuffer()));
      if (got === want) break;
    }
    if (got !== want) wrong.push({ url, stored, got });
  }
  return wrong;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16);
}

const args = process.argv.slice(2);
if (args[0] === '--file') {
  const size = await upload(args[1], args[2]);
  console.log(`uploaded ${args[2]} (${size}B)`);
} else {
  const only = args[0] === '--only' ? args[1] : null;
  // An unrecognised target is an error, never a silent no-op. This is the line that used to let
  // `--only file ...` transfer nothing and report success.
  if (args.length && args[0] !== '--only') {
    console.error(`deploy-static: unrecognised argument ${args[0]} — use --only site|web, or --file <local> <remote>`);
    process.exit(2);
  }
  if (only !== null && only !== 'site' && only !== 'web') {
    console.error(`deploy-static: --only takes site or web, not ${only === undefined ? '(nothing)' : only}`);
    process.exit(2);
  }
  let total = 0;
  if (!only || only === 'site') total += (await uploadDir(join(root, 'apps/site/dist'), '/')).count;
  if (!only || only === 'web') total += (await uploadDir(join(root, 'apps/web/dist'), '/app')).count;
  // A run that uploaded nothing has not deployed, whatever the arguments looked like.
  if (total === 0) {
    console.error('deploy-static: 0 files uploaded — nothing was deployed');
    process.exit(2);
  }
  console.log(`done — ${total} file(s)`);

  // UPLOADED IS NOT DEPLOYED. See verifyServed.
  const wrong = [];
  if (!only || only === 'site') wrong.push(...(await verifyServed(join(root, 'apps/site/dist'), '/')));
  if (!only || only === 'web') wrong.push(...(await verifyServed(join(root, 'apps/web/dist'), '/app')));
  if (wrong.length) {
    console.error(`\nDEPLOYED BYTES ARE NOT WHAT ${BASE} SERVES — ${wrong.length} page(s):`);
    for (const w of wrong) console.error(`  ${w.url}   uploaded to ${w.stored}, served ${w.got}`);
    console.error(
      '\nThe usual cause is an older row at a SHADOWING key: the worker tries /x before /x/index.html,\n'
      + 'so a stale bare-path row wins forever and no upload can replace or remove it. Check with\n'
      + '  GET /api/admin/static-list   (header X-Admin-Key)\n'
      + 'and delete the shadowing row.',
    );
    process.exit(3);
  }
  console.log(`verified — every page serves the bytes just uploaded`);
}
