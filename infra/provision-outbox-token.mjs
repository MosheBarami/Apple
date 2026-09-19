#!/usr/bin/env node
/**
 * Install the membership-outbox purpose token, both halves, in one act.
 *
 * WHY THIS IS A SCRIPT AND NOT A PARAGRAPH IN A RUNBOOK. The token has to exist in two places that
 * must agree — as a Worker secret, and as its SHA-256 in `public.membership_outbox_secret` — and
 * 0009 says plainly that the migration creates no secret values, so a person doing this by hand is
 * generating a value, hashing it, pasting one half into a dashboard and typing the other into
 * wrangler. Every one of those steps is a place to get it wrong quietly: a trailing newline, a
 * truncated paste, the wrong consumer. The failure is silent — `membershipOutboxConfigured`
 * answers false and the feature simply does not run, which is indistinguishable from it being
 * deliberately off. That is how it came to be missing in production for as long as it was.
 *
 * WHAT IT DOES:
 *   1. generates a 64-character token with crypto.randomBytes
 *   2. prints the SQL to paste into the Supabase SQL editor — the HASH only, never the token
 *   3. pipes the token straight into `wrangler secret put`, so it never reaches a terminal
 *      scrollback, a shell history, or a chat transcript
 *
 * The token is NEVER printed. If you lose it between step 2 and step 3, run this again: it is a
 * purpose token with one consumer, so replacing it costs nothing but the two writes.
 *
 *   node infra/provision-outbox-token.mjs [--consumer apple] [--worker apple]
 *
 * Run the printed SQL FIRST, then answer yes to the wrangler step. In that order the database
 * accepts a token the Worker does not yet hold, which fails closed; the other order leaves the
 * Worker presenting a token the database has never heard of, which also fails closed but looks
 * like a broken deploy rather than a half-finished one.
 */
import { randomBytes, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const consumer = flag('consumer', 'apple');
const worker = flag('worker', 'apple');
if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(consumer)) {
  console.error(`consumer "${consumer}" does not match the shape 0009 requires`);
  process.exit(1);
}

// base64url of 48 bytes is 64 characters, comfortably past the 32-character floor in
// systemRpcConfig — which exists so a placeholder left in a config cannot become a token.
const token = randomBytes(48).toString('base64url');
const hash = createHash('sha256').update(token).digest('hex');

console.log(`
STEP 1 — paste this into the Supabase SQL editor and run it.
It contains the HASH, which is not a secret: it cannot be turned back into the token.

insert into public.membership_outbox_consumers (consumer) values ('${consumer}')
  on conflict (consumer) do nothing;
insert into public.membership_outbox_secret (consumer, token_hash)
  values ('${consumer}', '${hash}')
  on conflict (consumer) do update set token_hash = excluded.token_hash, updated_at = now();

STEP 2 — this script will then put the token on the "${worker}" Worker.
`);

const rl = createInterface({ input: stdin, output: stdout });
const answer = (await rl.question('Has the SQL above run successfully? [y/N] ')).trim().toLowerCase();
rl.close();
if (answer !== 'y' && answer !== 'yes') {
  console.log('\nStopped. Nothing was written to the Worker. Run this again when the SQL has landed.');
  process.exit(1);
}

// stdin, not argv: a token on a command line is visible in `ps` and lands in shell history.
const put = spawnSync('npx', ['wrangler', 'secret', 'put', 'MEMBERSHIP_OUTBOX_TOKEN', '--name', worker], {
  input: `${token}\n`,
  cwd: new URL('../apps/worker/', import.meta.url).pathname,
  stdio: ['pipe', 'inherit', 'inherit'],
});
if (put.status !== 0) {
  console.error('\nwrangler refused. The database now holds a hash for a token the Worker does not have,');
  console.error('which fails CLOSED — the outbox and share links stay as they were. Re-run this whole script.');
  process.exit(put.status ?? 1);
}

console.log(`
Done. Verify with:
  cd apps/worker && npx wrangler secret list --name ${worker}     # MEMBERSHIP_OUTBOX_TOKEN present
and mint a share link, redeem it from another account, and open the project.
`);
