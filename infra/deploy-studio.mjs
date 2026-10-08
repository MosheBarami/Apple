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
import { rmSync } from 'node:fs';
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

rmSync(join(STUDIO, 'dist'), { recursive: true, force: true });
run('pnpm', ['build']);
run(join(STUDIO, 'node_modules', '.bin', 'wrangler'), ['deploy', '--var', `BUILD_SHA:${sha}`]);

/** /studio/ and every asset it names, with the type each must have. Retried briefly while the new version propagates. */
async function verify() {
  const health = await fetch(`${ORIGIN}/studio/api/health`).then((r) => r.json());
  if (health?.buildSha !== sha) return [`Studio health reports ${health?.buildSha ?? 'no build'}, expected ${sha}`];
  const page = await fetch(`${ORIGIN}/studio/?deploy-check=${Date.now()}`);
  const html = await page.text();
  if (!page.ok || !/<div id="root">/.test(html)) return [`/studio/ answered ${page.status} without the app's root element`];
  const assets = [...html.matchAll(/(?:src|href)="(\/studio\/assets\/[^"]+)"/g)].map((m) => m[1]);
  if (!assets.length) return ['/studio/ names no assets'];
  const problems = [];
  for (const path of assets) {
    const res = await fetch(`${ORIGIN}${path}`);
    const type = res.headers.get('content-type') ?? '';
    const want = path.endsWith('.css') ? 'text/css' : 'javascript';
    if (!res.ok || !type.includes(want)) problems.push(`${path}: ${res.status} ${type || '(no type)'}`);
  }
  return problems;
}

let problems = [];
for (let attempt = 0; attempt < 6; attempt += 1) {
  problems = await verify();
  if (!problems.length) break;
  await new Promise((r) => setTimeout(r, 5_000));
}
if (problems.length) {
  console.error(`deploy-studio: NOT VERIFIED — ${ORIGIN}/studio/ is broken:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`verified — ${ORIGIN}/studio/ and every asset it names are served with their own types`);
// fetch's kept-alive connections would hold the process open for minutes after the answer is known.
process.exit(0);
