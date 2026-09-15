// Capture the bytes a static deploy is about to overwrite, so the upload has a real undo.
//
//   node infra/capture-rollback.mjs --out <dir> [--base <origin>]
//
// WHY THIS IS A PROGRAM AND NOT A SHELL LOOP. §12.6's rollback is `wrangler rollback` to a
// recorded version id, which is a WORKER concept. `deploy-static.mjs` writes files into the D1
// static store, where there is no version to roll back to — so the only undo is the previous
// bytes, and they exist only if something captured them first.
//
// The first capture of these paths was a shell loop, and it demonstrated the failure this file
// exists to prevent: 4 of 28 paths returned 404 and it only came to light because the loop
// happened to print non-200s. A curl that 404s, times out, or meets a proxy error writes an error
// page or nothing at all, and the result is a "backup" of garbage that is not discovered until the
// moment it is needed. So every captured file is asserted — status, non-empty, and a content type
// consistent with its extension — and the run fails unless it can state its own count. Raised by
// rbxai-a3, who put it as: a capture that cannot say how many things it captured is not a capture.
//
// ADDITIONS ARE NAMED, NOT SKIPPED. A path the new build introduces does not exist on the live
// origin, so there is nothing to restore it to and a rollback leaves it published. Those are
// recorded in the manifest as `addition` rather than quietly dropped, because the difference
// between "backed up" and "cannot be backed up" is the whole value of the record.
//
// HASHED ASSETS ARE EXCLUDED, deliberately. Their names contain their content, so an upload can
// never overwrite a different file at the same path — there is nothing to lose and nothing to
// restore. The exclusion uses the same test `deploy-static.mjs` uses to decide immutability, so
// the two cannot drift into disagreeing about which files are safe.
//
// To restore one file:  node infra/deploy-static.mjs --file <captured> <remote>
// NOT `--only file ...`, which is the spelling the header used to document and which uploads
// nothing while printing "done" (F-62).
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const argv = process.argv.slice(2);
let OUT = null;
let BASE = process.env.API_BASE;
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === '--out') { OUT = argv[i + 1]; i += 1; continue; }
  if (a === '--base') { BASE = argv[i + 1]; i += 1; continue; }
  console.error(`capture-rollback: unrecognised flag ${a} — use --out <dir> [--base <origin>]`);
  process.exit(2);
}
if (!OUT) {
  console.error('capture-rollback: --out <dir> is required');
  process.exit(2);
}
if (!BASE) {
  console.error('capture-rollback: no origin — set API_BASE in .env or pass --base');
  process.exit(2);
}
BASE = BASE.replace(/\/$/, '');

// The same test deploy-static.mjs applies, kept identical on purpose.
const IMMUTABLE = /\.(js|css|woff2|png|jpg|webp|svg|glb)$/;
const HASHED = /(\/_astro\/|\/assets\/.*-[A-Za-z0-9_-]{8,}\.)/;

const TYPES = {
  html: 'text/html', xml: 'xml', txt: 'text/plain', json: 'json', webmanifest: 'json',
  svg: 'svg', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', ico: 'image',
  js: 'javascript', css: 'text/css', woff2: 'font', glb: 'model',
};

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** Every remote path this deploy would write, minus the ones it cannot clobber. */
function overwritablePaths() {
  const out = [];
  for (const [dir, prefix] of [['apps/site/dist', ''], ['apps/web/dist', '/app']]) {
    let files;
    try { files = [...walk(join(root, dir))]; } catch {
      console.error(`capture-rollback: ${dir} is not built — run \`pnpm -r build\` first`);
      process.exit(2);
    }
    for (const f of files) {
      const rel = '/' + relative(join(root, dir), f).split('\\').join('/');
      const remote = prefix + rel;
      if (IMMUTABLE.test(remote) && HASHED.test(remote)) continue;
      out.push(remote);
    }
  }
  return out.sort();
}

/** The URL that serves the bytes stored at a remote path. Astro writes pages as `<route>/index.html`. */
const urlFor = (remote) => remote.replace(/\/index\.html$/, '/').replace(/^\/index\.html$/, '/');

const paths = overwritablePaths();
mkdirSync(OUT, { recursive: true });

const captured = [];
const additions = [];
const unrestorable = [];
const failures = [];

for (const remote of paths) {
  const url = `${BASE}${urlFor(remote)}`;
  let res;
  try {
    res = await fetch(url, { redirect: 'follow' });
  } catch (e) {
    failures.push({ remote, url, why: `fetch threw: ${e.message}` });
    continue;
  }
  if (res.status === 404) {
    // Not currently served. This path is introduced by the new build, so a rollback cannot put
    // anything back here — stated, not skipped.
    additions.push({ remote, url });
    continue;
  }
  if (!res.ok) {
    failures.push({ remote, url, why: `HTTP ${res.status}` });
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) {
    failures.push({ remote, url, why: 'empty body — a zero-byte backup is not a backup' });
    continue;
  }
  const ext = remote.split('.').pop().toLowerCase();
  const want = TYPES[ext];
  const got = (res.headers.get('content-type') ?? '').toLowerCase();
  if (want && !got.includes(want)) {
    // A 200 whose type contradicts the extension. Either the origin falls back to a page for a
    // missing asset, or an earlier upload stored the wrong bytes under this name — and in both
    // cases there is no original asset to put back, so this is unrestorable rather than a failed
    // capture. Recorded loudly as a LIVE DEFECT in its own right, because a path answering 200
    // with the wrong type is broken for every client that trusts the status code, and `nosniff`
    // means a browser will not rescue it.
    //
    // It does not block: the upload replaces the object with the real file, which is the fix. What
    // would be wrong is saving 2KB of HTML under a .png name and calling it a backup, which is
    // exactly what the shell loop this program replaced did.
    unrestorable.push({ remote, url, servedType: got || '(none)', expected: want, bytes: Number(res.headers.get('content-length') ?? 0) });
    continue;
  }
  const dest = join(OUT, remote);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  captured.push({ remote, url, bytes: buf.length, contentType: got });
}

const manifest = {
  origin: BASE,
  at: new Date().toISOString(),
  overwritable: paths.length,
  captured: captured.length,
  additions: additions.length,
  unrestorable: unrestorable.length,
  failures: failures.length,
  files: captured,
  additionPaths: additions.map((a) => a.remote),
  unrestorablePaths: unrestorable,
  failurePaths: failures,
};
writeFileSync(join(OUT, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`origin ${BASE}`);
console.log(`overwritable paths: ${paths.length}`);
console.log(`captured:           ${captured.length}`);
console.log(`additions (nothing live to restore to): ${additions.length}`);
for (const a of additions) console.log(`  + ${a.remote}`);
if (unrestorable.length) {
  console.log(`unrestorable — LIVE DEFECT, 200 with the wrong type: ${unrestorable.length}`);
  for (const u of unrestorable) {
    console.log(`  ! ${u.remote} serves ${u.servedType}, not ${u.expected} — broken for any client that trusts the status; this upload replaces it`);
  }
}

if (failures.length) {
  console.log(`failures:           ${failures.length}`);
  for (const f of failures) console.error(`  ! ${f.remote} — ${f.why}`);
  console.log('CAPTURE INCOMPLETE — do not deploy against this; the undo has holes in it');
  process.exit(1);
}

// The count has to reconcile. Anything else means a path was neither captured, nor recorded as an
// addition, nor recorded as a failure — which is the silent gap this whole file is against.
if (captured.length + additions.length + unrestorable.length !== paths.length) {
  console.log(`CAPTURE INCOMPLETE — ${captured.length} + ${additions.length} + ${unrestorable.length} does not reconcile with ${paths.length}`);
  process.exit(1);
}

console.log(
  `CAPTURE COMPLETE — ${captured.length} of ${paths.length} overwritable path(s) saved to ${OUT}; ` +
  `${additions.length} addition(s) and ${unrestorable.length} unrestorable have no bytes to restore, and are listed above rather than counted as saved`,
);
