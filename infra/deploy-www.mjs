#!/usr/bin/env node
// Deploy only the existing Next frontend Worker, then prove the public origin serves it.
// The backend, Studio operations, secrets and domain bindings are not changed here.
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cwd = resolve(root, 'apps/www');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
if (process.argv.length !== 2) throw new Error('Usage: node infra/deploy-www.mjs');
if (git('status', '--porcelain')) throw new Error('Deploy requires a clean checkout. Commit only reviewed work first.');
const sha = git('rev-parse', 'HEAD');
if (sha !== git('rev-parse', 'origin/main')) throw new Error('Deploy requires HEAD equal to the fetched origin/main.');
const wrangler = resolve(cwd, 'node_modules/.bin/wrangler');
const existing = spawnSync(wrangler, ['deployments', 'list', '--name', 'studpilot-www', '--json'], { cwd, encoding: 'utf8' });
if (existing.status !== 0) throw new Error('Could not verify the existing studpilot-www Worker; nothing uploaded.');
const before = await fetch('https://studpilot.app/api/health').then(r => r.json());
const env = { ...process.env, STUDPILOT_WEB_BUILD_SHA: sha };
delete env.STUDPILOT_PREVIEW_DIST_DIR;
for (const command of ['build:cf', 'deploy:cf']) {
  const result = spawnSync('pnpm', [command], { cwd, env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const home = await fetch(`https://studpilot.app/?release=${sha}`, { cache: 'no-store' });
const html = await home.text();
if (!home.ok || !html.includes(`name="studpilot-build" content="${sha}"`)) {
  throw new Error('Upload finished, but the public homepage has not proven the expected release.');
}
for (const route of ['/login', '/pricing', '/docs', '/docs/connect-studio', '/app']) {
  const response = await fetch(`https://studpilot.app${route}?release=${sha}`, { cache: 'no-store' });
  if (!response.ok || !(await response.text()).includes(`name="studpilot-build" content="${sha}"`)) {
    throw new Error(`Public route ${route} did not prove the expected release.`);
  }
}
const after = await fetch('https://studpilot.app/api/health').then(r => r.json());
console.log(JSON.stringify({ frontendSha: sha, verifiedPublicRoutes: 6, backendShaBefore: before.buildSha, backendShaAfter: after.buildSha }));
