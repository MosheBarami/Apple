#!/usr/bin/env node
// Deploy the worker with BUILD_SHA stamped from the commit being deployed.
//
//   node infra/deploy-worker.mjs studpilot [--secrets-file <ignored JSON or .env file>]
//   node infra/deploy-worker.mjs studpilot --build-sha <git-archive source SHA>
//   (the old `apple` and `golem` workers are proxies now, deployed from infra/legacy-proxy)
//
// WHY THIS EXISTS. `BUILD_SHA` is a plain var in wrangler.studpilot.jsonc, edited by hand before a deploy.
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
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKER = join(ROOT, 'apps', 'worker');

const target = process.argv[2] ?? 'studpilot';
if (target !== 'studpilot') {
  console.error(`deploy-worker: the only target is studpilot, not ${target}`);
  process.exit(2);
}

// Upload required secrets with the reviewed code in the same version. Unknown flags must never
// be silently ignored and turn a configuration request into an unintended deployment.
const extras = process.argv.slice(3);
let secretsFile = null;
let suppliedSha = null;
if (extras.length % 2 !== 0) {
  console.error('deploy-worker: options need values');
  process.exit(2);
}
for (let i = 0; i < extras.length; i += 2) {
  if (extras[i] === '--secrets-file' && !secretsFile) secretsFile = resolve(ROOT, extras[i + 1]);
  else if (extras[i] === '--build-sha' && !suppliedSha && /^[0-9a-f]{7,40}$/.test(extras[i + 1])) suppliedSha = extras[i + 1];
  else {
    console.error('deploy-worker: use studpilot [--build-sha <hex SHA>] [--secrets-file <ignored file>]');
    process.exit(2);
  }
}
if (secretsFile) {
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
// A git archive intentionally has no .git directory. Its caller supplies the SHA it archived;
// using the checkout's working tree here would bundle unrelated in-progress edits.
const sha = suppliedSha ?? git('rev-parse', '--short', 'HEAD');
const dirty = suppliedSha ? false : git('status', '--porcelain').length > 0;
const stamp = dirty ? `${sha}-dirty` : sha;

// THE NAME MUST ALREADY EXIST. A first deploy under a name creates a NEW Worker with new, empty
// Durable Objects, and this config would then move studpilot.app to it: every project would open
// empty. The production Worker became `studpilot` by being renamed in place (handoff 1.3), so a
// missing `studpilot` means that step has not run, and nothing is uploaded.
// Only Cloudflare's "does not exist" (10007) means that; any other failure (a token, an outage) is
// reported as itself, and nothing is uploaded either way. STUDPILOT_WRANGLER is the tests' stub.
const wrangler = process.env.STUDPILOT_WRANGLER ?? join(WORKER, 'node_modules', '.bin', 'wrangler');
const exists = spawnSync(wrangler, ['deployments', 'list', '--name', 'studpilot', '--json'], { cwd: WORKER, encoding: 'utf8' });
if (exists.status !== 0) {
  const said = `${exists.stdout ?? ''}${exists.stderr ?? ''}${exists.error?.message ?? ''}`;
  console.error(/\[code: 10007\]/.test(said)
    ? 'deploy-worker: no Worker named studpilot exists. Rename the production Worker in place first '
      + '(planning/proof/M1/PLAN.md, step 1.3f); deploying now would create an empty one.'
    : `deploy-worker: could not check that the studpilot Worker exists, so nothing was uploaded:\n${said.trim().slice(0, 600)}`);
  process.exit(2);
}

console.log(`deploying ${target} as BUILD_SHA=${stamp}`);
execFileSync(
  wrangler,
  ['deploy', '--config', 'wrangler.studpilot.jsonc', '--var', `BUILD_SHA:${stamp}`,
    ...(secretsFile ? ['--secrets-file', secretsFile] : [])],
  { cwd: WORKER, stdio: 'inherit' },
);

// UPLOADED IS NOT RUNNING. The one thing this script can prove afterwards is that the build now
// answering is the build it just sent, so it asks.
const base = 'https://studpilot.app';
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
