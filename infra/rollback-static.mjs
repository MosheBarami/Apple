#!/usr/bin/env node
// The undo, as a program that can say what it did.
//
//   node infra/rollback-static.mjs --from <capture-dir> --base <origin> --dry-run
//   node infra/rollback-static.mjs --from <capture-dir> --base <origin> --yes
//
// WHY THIS IS A PROGRAM AND NOT A COMMAND YOU TYPE — docs/FAILURES.md F-62. The documented
// rollback for a bad static deploy was `deploy-static.mjs --only file <local> <remote>`. That
// spelling matched no branch, uploaded nothing, and printed `done`: an undo that silently no-ops
// and reports success, reached for at the only moment anyone runs it — during a bad deploy, under
// pressure, when nobody re-reads the source. The working form, `--file <local> <remote>`, restores
// exactly ONE file, so a real rollback of 28 paths was 28 hand-typed commands with no count, no
// verification and no record of which ones took.
//
// This file is the loop, and every claim it makes is checked by scripts/lib/rollback-rules.mjs:
//
//   THE CAPTURE IS AUDITED BEFORE ANYTHING IS WRITTEN. The manifest's own arithmetic has to
//   reconcile, every file it lists has to be on disk at the length it claims, and a capture that
//   recorded failures is refused unless `--partial` says otherwise. An undo restored from a
//   capture with holes in it is a second incident.
//
//   IT UPLOADS THROUGH deploy-static.mjs, one child process per file, rather than reimplementing
//   the upload. That script derives the content type from the LOCAL file name — the fix for the
//   pricing page that browsers downloaded — chunks large files, and marks hashed assets
//   immutable. A second uploader here would drift from it, and the first symptom of the drift
//   would appear during a rollback.
//
//   EVERY RESTORED PATH IS READ BACK. A 200 from the upload route means a row was written, not
//   that the origin serves those bytes. The restored file is re-fetched and its sha256 compared
//   with the captured copy's, and an upload that cannot be read back counts as unverified — which
//   fails the run.
//
//   `--base` IS REQUIRED AND HAS NO DEFAULT. Every other script here falls back to API_BASE from
//   .env; an undo may not guess which origin it is undoing, and the absence of a default is also
//   what makes this file safe to point at a throwaway server in its own tests.
//
//   `--dry-run` REHEARSES. F-62's rule is that an undo you have not watched work is not an undo,
//   so the rehearsal is a first-class mode: it does the audit, prints the exact plan, and writes
//   nothing. Its success token is deliberately NOT the one a real restore prints.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { judgeRestore, planRestore } from '../scripts/lib/rollback-rules.mjs';

const ROOT = new URL('..', import.meta.url).pathname;

const argv = process.argv.slice(2);
let FROM = null;
let BASE = null;
let DRY = false;
let YES = false;
let PARTIAL = false;
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === '--from') { FROM = argv[i + 1] ?? null; i += 1; continue; }
  if (a === '--base') { BASE = argv[i + 1] ?? null; i += 1; continue; }
  if (a === '--dry-run') { DRY = true; continue; }
  if (a === '--yes') { YES = true; continue; }
  if (a === '--partial') { PARTIAL = true; continue; }
  // F-63: a silently ignored flag is indistinguishable from an honoured one.
  console.error(`rollback-static: unrecognised flag ${a} — use --from <dir> --base <origin> [--dry-run | --yes] [--partial]`);
  process.exit(2);
}
if (!FROM) { console.error('rollback-static: --from <capture-dir> is required'); process.exit(2); }
if (!BASE) { console.error('rollback-static: --base <origin> is required — an undo does not guess which origin it is undoing'); process.exit(2); }
if (DRY && YES) { console.error('rollback-static: --dry-run and --yes are different jobs — pick one'); process.exit(2); }
if (!DRY && !YES) { console.error('rollback-static: refusing to write without --yes; rehearse it with --dry-run first'); process.exit(2); }
BASE = BASE.replace(/\/$/, '');

const MANIFEST = join(FROM, 'MANIFEST.json');
if (!existsSync(MANIFEST)) {
  console.error(`rollback-static: ${MANIFEST} does not exist — a directory with no manifest is not a capture`);
  process.exit(2);
}
let manifest;
try { manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')); } catch (e) {
  console.error(`rollback-static: the manifest does not parse — ${e.message}`);
  process.exit(2);
}

/** Everything in the capture directory except the manifest, keyed by the remote path it restores. */
function onDisk(dir) {
  const out = new Map();
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else {
        const rel = `/${relative(dir, p).split('\\').join('/')}`;
        if (rel === '/MANIFEST.json') continue;
        out.set(rel, { bytes: statSync(p).size, local: p });
      }
    }
  };
  walk(dir);
  return out;
}

/** Astro writes pages as `<route>/index.html`; the URL that serves them drops the file name. */
const urlFor = (remote) => remote.replace(/\/index\.html$/, '/').replace(/^\/index\.html$/, '/');
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

const present = onDisk(FROM);
const plan = planRestore(manifest, present, { allowPartial: PARTIAL });

console.log(`capture ${FROM}`);
console.log(`origin  ${BASE}${manifest.origin && manifest.origin !== BASE ? `   (the capture was taken from ${manifest.origin})` : ''}`);
console.log(`restorable: ${plan.restore.length} file(s)`);
for (const p of plan.leftPublished) {
  console.log(`  = ${p} — NOT restorable: nothing was live here when the capture ran, so the deploy's version stays published`);
}
if (plan.refusals.length) {
  for (const r of plan.refusals) console.error(`  ! ${r}`);
  console.error(`ROLLBACK REFUSED — ${plan.refusals.length} reason(s); nothing was written`);
  process.exit(1);
}
for (const f of plan.restore) console.log(`  < ${f.remote} (${f.bytes}B)`);

if (DRY) {
  // A rehearsal must not be mistakable for a restore, in either direction: it says what it would
  // do, it says it did not do it, and its token is its own.
  console.log(`ROLLBACK REHEARSED — ${plan.restore.length} file(s) would be restored to ${BASE}; nothing was written`);
  process.exit(0);
}

/* ------------------------------------------------------------------ the writes --- */

const KEY = process.env.GOLEM_ADMIN_KEY ?? (() => {
  // .env is a convenience, not a requirement: the key may come from the environment, which is how
  // this file is driven against a throwaway origin in its own tests.
  try {
    const m = readFileSync(join(ROOT, '.env'), 'utf8').match(/^GOLEM_ADMIN_KEY=(.*)$/m);
    return m === null ? null : m[1];
  } catch { return null; }
})();
if (!KEY) { console.error('rollback-static: GOLEM_ADMIN_KEY is not set and is not in .env'); process.exit(2); }

const failures = [];
let uploaded = 0;
let verified = 0;

for (const f of plan.restore) {
  const local = present.get(f.remote).local;
  try {
    execFileSync(process.execPath, [join(ROOT, 'infra', 'deploy-static.mjs'), '--file', local, f.remote], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      // The child reads .env only for values the environment does not already carry, so these two
      // win. That is what keeps a rollback aimed at the origin `--base` names and nowhere else.
      env: { ...process.env, API_BASE: BASE, GOLEM_ADMIN_KEY: KEY },
    });
    uploaded += 1;
  } catch (e) {
    failures.push({ remote: f.remote, why: `upload failed: ${(e.stderr || e.stdout || e.message).toString().trim().split('\n').pop()}` });
    continue;
  }

  // Read it back. The bytes on the origin are the claim; the upload's exit code is not.
  const want = readFileSync(local);
  try {
    const res = await fetch(`${BASE}${urlFor(f.remote)}`, { redirect: 'follow' });
    if (!res.ok) { failures.push({ remote: f.remote, why: `restored, then read back HTTP ${res.status}` }); continue; }
    const got = Buffer.from(await res.arrayBuffer());
    if (sha(got) !== sha(want)) {
      failures.push({ remote: f.remote, why: `restored, but the origin serves ${got.length}B that do not match the captured ${want.length}B` });
      continue;
    }
    const ct = (res.headers.get('content-type') ?? '').toLowerCase();
    if (typeof f.contentType === 'string' && f.contentType !== '' && !ct.includes(f.contentType.split(';')[0].toLowerCase())) {
      failures.push({ remote: f.remote, why: `restored with the right bytes under the wrong type: ${ct || '(none)'}, captured as ${f.contentType}` });
      continue;
    }
    verified += 1;
  } catch (e) {
    failures.push({ remote: f.remote, why: `restored, then could not be read back: ${e.message}` });
  }
}

const verdict = judgeRestore(plan, { uploaded, verified, failures });
console.log(`uploaded ${uploaded}, verified ${verified}, of ${plan.restore.length} planned`);
if (!verdict.ok) {
  for (const p of verdict.problems) console.error(`  ! ${p}`);
  console.error(`ROLLBACK INCOMPLETE — ${verdict.restored} of ${verdict.planned} path(s) are back; the origin is mixed and needs a person`);
  process.exit(1);
}
console.log(
  `ROLLBACK COMPLETE — ${verdict.restored} of ${verdict.planned} path(s) restored and read back byte for byte`
  + `${plan.leftPublished.length ? `; ${plan.leftPublished.length} path(s) listed above stay published because nothing was captured for them` : ''}`,
);
