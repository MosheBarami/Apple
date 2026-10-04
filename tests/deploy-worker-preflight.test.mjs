// infra/deploy-worker.mjs must refuse to upload unless a Worker named studpilot already exists: a first
// deploy under that name would create a new Worker with empty Durable Objects and move studpilot.app to
// it. Driven through a stub wrangler that records every call, so nothing reaches Cloudflare.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function deployWith(listAnswer) {
  const dir = mkdtempSync(join(tmpdir(), 'studpilot-deploy-preflight-'));
  const log = join(dir, 'calls.log');
  const stub = join(dir, 'wrangler');
  writeFileSync(stub, `#!/usr/bin/env node
require('node:fs').appendFileSync(${JSON.stringify(log)}, process.argv.slice(2).join(' ') + '\\n');
if (process.argv[2] === 'deployments') { process.stderr.write(${JSON.stringify(listAnswer)}); process.exit(1); }
`);
  chmodSync(stub, 0o755);
  const r = spawnSync('node', [join(ROOT, 'infra', 'deploy-worker.mjs'), 'studpilot'], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, STUDPILOT_WRANGLER: stub } });
  return { exit: r.status, out: `${r.stdout}${r.stderr}`, calls: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [] };
}

test('no studpilot Worker (Cloudflare 10007): it says so and uploads nothing', () => {
  const r = deployWith('✘ [ERROR] A request to the Cloudflare API failed.\n  This Worker does not exist on your account. [code: 10007]\n');
  assert.equal(r.exit, 2, r.out);
  assert.match(r.out, /no Worker named studpilot exists/);
  assert.deepEqual(r.calls.map((c) => c.split(' ')[0]), ['deployments'], 'it went on to deploy');
});

test('any other wrangler failure is reported as itself, not as a missing Worker, and uploads nothing', () => {
  const r = deployWith('✘ [ERROR] Authentication error [code: 10000]\n');
  assert.equal(r.exit, 2, r.out);
  assert.match(r.out, /could not check that the studpilot Worker exists/);
  assert.match(r.out, /Authentication error/);
  assert.doesNotMatch(r.out, /no Worker named studpilot exists/);
  assert.deepEqual(r.calls.map((c) => c.split(' ')[0]), ['deployments']);
});
