#!/usr/bin/env node
// Deploys the Studio worker (apps/studio, `studpilot-studio`) and proves the page it serves is whole.
//
//   node infra/deploy-studio.mjs
//
// WHY THIS EXISTS. A deploy from a `dist/` left by an earlier build shipped a worker whose page named assets the upload did
// not carry: studpilot.app/studio/ answered every stylesheet and script with the page itself (text/html) and drew an
// unstyled screen (2026-10-06). So the build always starts from nothing, and the deploy is not done until /studio/ and
// every asset it names come back with their own content type.
//
// Deploy studpilot-studio BEFORE `infra/deploy-worker.mjs` when both change: the main worker binds to it.
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STUDIO = join(ROOT, 'apps', 'studio');
const ORIGIN = process.env.STUDPILOT_ORIGIN ?? 'https://studpilot.app';

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: STUDIO, stdio: 'inherit', ...opts });
  if (r.status !== 0) {
    console.error(`deploy-studio: ${cmd} ${args.join(' ')} failed (exit ${r.status})`);
    process.exit(1);
  }
}

const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
if (dirty) throw new Error('deploy-studio: commit reviewed changes before deploying');
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();

run(join(STUDIO, 'node_modules', '.bin', 'wrangler'), ['deploy', '--var', `BUILD_SHA:${sha}`]);

/** The agent worker answers with this commit, and its agent route refuses a request with no sign-in (owner check first). */
async function verify() {
  const health = await fetch(`${ORIGIN}/studio/api/health`).then((r) => r.json()).catch(() => null);
  if (health?.buildSha !== sha) return [`Studio health reports ${health?.buildSha ?? 'no build'}, expected ${sha}`];
  const agent = await fetch(`${ORIGIN}/studio/agent/00000000-0000-4000-8000-000000000000`);
  if (agent.status !== 401) return [`/studio/agent/ answered ${agent.status} without a token, expected 401`];
  return [];
}

let problems = [];
for (let attempt = 0; attempt < 6; attempt += 1) {
  problems = await verify();
  if (!problems.length) break;
  await new Promise((r) => setTimeout(r, 5_000));
}
if (problems.length) {
  console.error(`deploy-studio: NOT VERIFIED:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`verified — ${ORIGIN}/studio/api/health reports ${sha} and the agent route checks sign-in first`);
// fetch's kept-alive connections would hold the process open for minutes after the answer is known.
process.exit(0);
