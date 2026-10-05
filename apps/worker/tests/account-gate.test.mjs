// The pre-launch account gate (G02/Q37, src/account-gate.ts): only the owner and approved accounts start builds.
// Moved here from owner-library-namespace.test.mjs when the owner library was removed (M4): the gate outlived it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'account-gate-'));
test.after(() => rmSync(dir, { recursive: true, force: true }));
const out = join(dir, 'account-gate.mjs');
await esbuild.build({ entryPoints: [join(root, 'src', 'account-gate.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out });
const { buildApproved } = await import(pathToFileURL(out).href);

const OWNER = 'owner-a', APPROVED = 'customer-ok', STRANGER = 'customer-no';
const env = (vars = {}) => ({ OWNER_USER_IDS: `${OWNER}, other-owner`, LIBRARY_APPROVED_USER_IDS: ` ${APPROVED} ,x`, ...vars });

test('G02/Q37: only the owner and approved accounts may start builds before launch', () => {
  const e = env();
  assert.equal(buildApproved(e, OWNER), true);
  assert.equal(buildApproved(e, 'other-owner'), true);
  assert.equal(buildApproved(e, APPROVED), true);
  assert.equal(buildApproved(e, STRANGER), false);
  assert.equal(buildApproved(env({ OWNER_USER_IDS: '' }), STRANGER), true, 'no owner configured (dev) gates nothing');
});

test('the release owner id named by RELEASE_LIBRARY_OWNER_ID is approved, with its whitespace trimmed', () => {
  assert.equal(buildApproved(env({ RELEASE_LIBRARY_OWNER_ID: ' release-1 ' }), 'release-1'), true);
  assert.equal(buildApproved(env({ RELEASE_LIBRARY_OWNER_ID: ' release-1 ' }), STRANGER), false);
});

test('G02: every run-start path in the session DO consults the account gate', () => {
  const src = readFileSync(join(root, 'src/do/session.ts'), 'utf8');
  assert.match(src, /if \(!runLive && this\.refuseUnapproved\(ws, bind\)\) return;/, 'chat message');
  assert.match(src, /if \(this\.refuseUnapproved\(ws, bind\)\) return;\n\s+const gate = await this\.studioGate\(\);/, 'message edit');
  assert.match(src, /if \(!buildApproved\(this\.env, bind\.ownerId\)\) return json\(\{ ok: false, code: 'account_not_approved'/, '/agent-run');
  assert.match(src, /import \{ buildApproved \} from '\.\.\/account-gate';/, 'the session reads the gate from account-gate.ts');
});
