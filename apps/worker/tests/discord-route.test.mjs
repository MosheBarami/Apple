/**
 * THE WIRING, ASSERTED AS SOURCE FACTS.
 *
 * discord.ts can be perfect and the bot still unsafe, because safety here is a property of how the
 * route is HOOKED UP: the interactions endpoint has to be exempt from the JWT middleware (Discord
 * has no JWT and would otherwise 401 forever) AND it has to authenticate by signature. Either one
 * alone is wrong — the exemption without the signature is an open endpoint, the signature without
 * the exemption is a bot that never answers. So they are asserted together, in one test, and
 * neither can be removed without the other going red.
 *
 * The same trap the billing webhook test documents: the first version of THAT test asserted the
 * opposite of what it meant and passed, because the broken state satisfied it.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const INDEX = readFileSync(join(WORKER, 'src', 'index.ts'), 'utf8');
const DISCORD = readFileSync(join(WORKER, 'src', 'discord.ts'), 'utf8');
const DO = readFileSync(join(WORKER, 'src', 'do', 'discord.ts'), 'utf8');
const WRANGLER = readFileSync(join(WORKER, 'wrangler.jsonc'), 'utf8');
const route = INDEX.slice(INDEX.indexOf("app.post('/api/discord/interactions'"), INDEX.indexOf("app.post('/api/projects/:id/discord-code'"));

test('the endpoint bypasses JWT auth AND authenticates by signature — both, or neither is safe', () => {
  const exempt = /const AUTH_EXEMPT = \[([^\]]*)\]/.exec(INDEX);
  assert.ok(exempt, 'AUTH_EXEMPT must exist');
  assert.ok(exempt[1].includes('/api/discord/interactions'), 'Discord has no JWT — without this every interaction 401s');
  assert.match(route, /handleDiscordRequest\(c\.req\.raw, \{/);
  assert.match(route, /publicKeyHex: c\.env\.DISCORD_PUBLIC_KEY/);
});

test('verification happens before parsing and before dispatch', () => {
  const verify = DISCORD.indexOf('verifyDiscordSignature(');
  const parse = DISCORD.indexOf('JSON.parse(rawBody)');
  const dispatch = DISCORD.indexOf('return handleInteraction(payload');
  assert.ok(verify > 0 && parse > verify, 'parse must come after verify');
  assert.ok(dispatch > parse, 'dispatch must come after parse');
  // Re-serialising parsed JSON changes bytes, and the signature could then never match.
  assert.match(DISCORD, /const rawBody = await req\.text\(\)/);
  assert.equal(/JSON\.stringify\(await req\.json\(\)\)/.test(DISCORD), false);
});

test('no public key means refuse, never "no key so trust the body"', () => {
  assert.match(DISCORD, /if \(!opts\.publicKeyHex\) return \{ status: 503/);
  const guard = DISCORD.indexOf('!opts.publicKeyHex');
  assert.ok(guard < DISCORD.indexOf('await req.text()'), 'the refusal must precede reading the body');
});

test('the refusal is 401, which is what Discord itself requires of an interactions endpoint', () => {
  // Discord probes a new endpoint URL with a deliberately invalid signature and will not accept
  // the URL at all unless that probe is answered with 401.
  assert.match(DISCORD, /return \{ status: 401, body: \{ error: 'invalid request signature' \} \}/);
  assert.equal(/body: \{ error: verdict\.reason/.test(DISCORD), false, 'the reason is logged, not returned');
  assert.match(DISCORD, /console\.warn\('discord interaction rejected:', verdict\.reason\)/);
});

test('background work is scheduled only for a request that got past verification', () => {
  // `out.deferred` exists only on an outcome handleDiscordRequest produced after verifying.
  assert.match(route, /if \(out\.deferred && out\.reply\)/);
  assert.ok(route.indexOf('handleDiscordRequest') < route.indexOf('waitUntil'), 'verify, then schedule');
});

test('minting a link code proves ownership with the user own token, not with our own filter', () => {
  const mint = INDEX.slice(
    INDEX.indexOf("app.post('/api/projects/:id/discord-code'"),
    INDEX.indexOf("app.get('/api/discord/link'"),
  );
  assert.match(mint, /withOwnedProject\(c, c\.req\.param\('id'\)\)/);
  assert.match(mint, /if \(!ctx\) return c\.json\(\{ error: 'not found' \}, 404\)/);
  // The minted code carries the VERIFIED user and project, never anything from the request body.
  assert.match(mint, /appleUserId: ctx\.user\.userId, projectId: ctx\.project\.id, projectName: ctx\.project\.name/);
  assert.ok(mint.indexOf('withOwnedProject') < mint.indexOf('https://do/mint'), 'ownership first, code second');
});

test('a code is single-use, short-lived, and guessing it is counted', () => {
  assert.match(DO, /const CODE_TTL_MS = 10 \* 60 \* 1000/);
  assert.match(DO, /await this\.ctx\.storage\.delete\(key\); \/\/ single use/);
  assert.match(DO, /reason: 'throttled'/);
  assert.match(DO, /const MAX_FAILS = \d+/);
  // The failure counter must be written on the invalid path, or nothing is actually bounded.
  const invalid = DO.slice(DO.indexOf("if (!row || now - row.createdAt > CODE_TTL_MS)"), DO.indexOf("// single use"));
  assert.match(invalid, /this\.ctx\.storage\.put\(failKey/);
});

test('the bot token is used for registration only, never on the interaction path', () => {
  // Editing a deferred reply is authenticated by the interaction token in the URL. Sending a bot
  // token from a background alarm would hand a long-lived credential to the most exposed code.
  assert.equal(/Bot \$\{/.test(DO), false, 'the progress pusher must never hold the bot token');
  const edit = DISCORD.slice(
    DISCORD.indexOf('export async function editOriginal'),
    DISCORD.indexOf('export async function registerCommands'),
  );
  assert.equal(/authorization/i.test(edit), false, 'editOriginal must not send credentials');
  assert.match(DISCORD, /export async function registerCommands\(botToken: string\)/);
});

test('the Durable Object is bound and migrated, never renamed', () => {
  assert.match(WRANGLER, /\{ "name": "DISCORD_DO", "class_name": "DiscordDO" \}/);
  assert.match(WRANGLER, /\{ "tag": "v3", "new_sqlite_classes": \["DiscordDO"\] \}/);
  assert.match(INDEX, /export \{ DiscordDO \} from '\.\/do\/discord'/);
  // Every binding that existed before must still exist under the same name.
  for (const name of ['SESSION_DO', 'QUOTA_DO', 'PAIRING_DO', 'ADMIN_DO', 'BUDGET_DO']) {
    assert.ok(WRANGLER.includes(`"name": "${name}"`), `${name} must not be renamed`);
  }
});

test('no Discord secret is committed anywhere', () => {
  // Both values go in through `wrangler secret put`. A public key in a file is not a catastrophe;
  // a bot token in one is, and the only reliable rule is that neither is ever written down.
  for (const file of ['wrangler.jsonc', 'package.json']) {
    const text = readFileSync(join(WORKER, file), 'utf8');
    assert.equal(/DISCORD_PUBLIC_KEY"\s*:/.test(text), false, `${file} must not carry the public key`);
    assert.equal(/DISCORD_BOT_TOKEN"\s*:/.test(text), false, `${file} must not carry the bot token`);
  }
  // A bot token looks like three dot-separated base64 chunks and starts with the app id; refuse
  // anything shaped like one in any worker source file.
  for (const f of readdirSync(join(WORKER, 'src'))) {
    if (!f.endsWith('.ts')) continue;
    const text = readFileSync(join(WORKER, 'src', f), 'utf8');
    assert.equal(/M[A-Za-z0-9_-]{22,}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}/.test(text), false, `${f} looks like it contains a bot token`);
  }
});

test('the interaction path never reads Supabase, because it has no token that could satisfy RLS', () => {
  // Every Supabase read in this codebase goes through the caller's own JWT so row-level security
  // applies. A Discord interaction has no JWT. Resolving a project from a Discord command would
  // therefore mean bypassing RLS and trusting our own filter instead — so the project is bound at
  // mint time, where a real JWT exists, and the command path only ever follows that binding.
  const ports = INDEX.slice(INDEX.indexOf('function discordPorts('), INDEX.indexOf("app.post('/api/discord/interactions'"));
  assert.equal(/supaRest|getOwnedProject|getProfile/.test(ports), false, 'no Supabase read may happen without a user JWT');
});
