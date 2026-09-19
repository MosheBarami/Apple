#!/usr/bin/env node
// Deploy the worker with BUILD_SHA stamped from the commit being deployed.
//
//   node infra/deploy-worker.mjs [apple|golem] [--secrets-file <ignored JSON or .env file>]
//
// WHY THIS EXISTS. `BUILD_SHA` is a plain var in wrangler.*.jsonc, edited by hand before a deploy.
// It went stale the first time anyone deployed without remembering — including me, an hour ago:
// `/api/health` answered `"buildSha":"616d84b"` while the code serving that answer was four commits
// further on. A health endpoint that names the wrong build is worse than one that names none: it
// is the thing you check FIRST when production is behaving strangely, and it tells you the
// strangeness cannot be recent.
//
// It cannot go stale from a value read out of git at the moment of the deploy, so that is what this
// does. The file keeps its value for local runs and for anyone deploying by hand; `--var` overrides
// it for this upload only.
//
// A DIRTY TREE IS NAMED, NOT REFUSED. Deploying uncommitted work is an ordinary thing to do while
// fixing something live, and refusing it would push people back to bare `wrangler deploy`, which is
// how the value went stale. So the stamp says so: `86c63b9-dirty` is a truthful answer and an
// unqualified sha would not be.
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKER = join(ROOT, 'apps', 'worker');

const target = process.argv[2] ?? 'apple';
if (target !== 'apple' && target !== 'golem') {
  console.error(`deploy-worker: target must be apple or golem, not ${target}`);
  process.exit(2);
}

// Upload required secrets with the reviewed code in the same version. Unknown flags must never
// be silently ignored and turn a configuration request into an unintended deployment.
const extras = process.argv.slice(3);
let secretsFile = null;
if (extras.length) {
  if (extras.length !== 2 || extras[0] !== '--secrets-file' || !extras[1]) {
    console.error('deploy-worker: use [apple|golem] [--secrets-file <ignored JSON or .env file>]');
    process.exit(2);
  }
  secretsFile = resolve(ROOT, extras[1]);
  try {
    if (!statSync(secretsFile).isFile()) throw new Error('not a file');
    // A release secret file must never become an accidental tracked artifact.
    execFileSync('git', ['check-ignore', '-q', '--', secretsFile], { cwd: ROOT, stdio: 'pipe' });
  } catch {
    console.error('deploy-worker: the secrets file must exist and be gitignored');
    process.exit(2);
  }
}

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const sha = git('rev-parse', '--short', 'HEAD');
const dirty = git('status', '--porcelain').length > 0;
const stamp = dirty ? `${sha}-dirty` : sha;

console.log(`deploying ${target} as BUILD_SHA=${stamp}`);
execFileSync(
  join(WORKER, 'node_modules', '.bin', 'wrangler'),
  ['deploy', '--config', target === 'apple' ? 'wrangler.apple.jsonc' : 'wrangler.jsonc', '--var', `BUILD_SHA:${stamp}`,
    ...(secretsFile ? ['--secrets-file', secretsFile] : [])],
  { cwd: WORKER, stdio: 'inherit' },
);

// UPLOADED IS NOT RUNNING. The one thing this script can prove afterwards is that the build now
// answering is the build it just sent, so it asks.
const base = target === 'apple'
  ? 'https://apple.moshe-barami111.workers.dev'
  : 'https://golem.moshe-barami111.workers.dev';
for (const waitMs of [1500, 3000, 6000]) {
  await new Promise((r) => setTimeout(r, waitMs));
  const health = await fetch(`${base}/api/health`).then((r) => r.json()).catch(() => null);
  if (health?.buildSha === stamp) {
    console.log(`verified — ${base} is serving ${stamp}`);
    process.exit(0);
  }
  console.log(`  /api/health says ${health?.buildSha ?? 'nothing'}, waiting…`);
}
console.error(`\nDEPLOYED ${stamp} BUT /api/health DOES NOT SAY SO.`);
console.error('Either the upload did not take, or BUILD_SHA is being set somewhere this did not reach.');
process.exit(3);
