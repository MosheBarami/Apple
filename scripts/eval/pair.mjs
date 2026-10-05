#!/usr/bin/env node
// Mint a Studio pairing code for the test project, with no sign-in (POST /api/admin/pairing/:id).
//
//   node scripts/eval/pair.mjs [--project <id>] [--user <id>] [--env-file <.env>] [--api-base <url>]
//
// The code is single-use and lives ten minutes. Type it into the StudPilot plugin's pairing box in Studio. It is a
// credential for those ten minutes: do not paste it into a log, a commit or a chat. The admin key is read from the
// environment or the env file and never printed.
//
// A second code supersedes an existing pairing (the session holds one plugin token): when one is live, this says so.
import { pathToFileURL } from 'node:url';
import { makeAdminApi } from './lib/api.mjs';
import { loadHarnessEnv, redact } from './lib/env.mjs';
import { DEFAULT_PROJECT, DEFAULT_USER, parseArgs } from './run-piece.mjs';

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const projectId = flags.project ?? DEFAULT_PROJECT;
  const userId = flags.user ?? DEFAULT_USER;
  const env = loadHarnessEnv({ envFile: flags['env-file'], apiBase: flags['api-base'] });
  const api = makeAdminApi({ apiBase: env.apiBase, adminKey: env.adminKey });
  try {
    const r = await api.mintPairingCode(projectId, userId);
    if (r.status !== 200) {
      console.error(`refused (HTTP ${r.status}): ${redact(r.json?.error ?? 'no reason given', [env.adminKey])}`);
      process.exitCode = 2;
      return;
    }
    console.log(`pairing code for project ${projectId}: ${r.json.code}   (expires ${r.json.expiresAtIso})`);
    if (r.json.existingLink) console.log(`NOTE: this project is already paired (${r.json.existingLink.connected ? 'connected' : 'not connected'}); the new code supersedes that pairing once it is claimed.`);
  } catch (e) {
    console.error(redact(e.message, [env.adminKey]));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
