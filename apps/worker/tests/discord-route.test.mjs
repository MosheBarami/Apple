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
import { COMMAND_NAMES } from '../src/discord.ts';

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

test('Discord spends Credits through the one ledger, and adds no accounting of its own', () => {
  /*
   * THE RULE: there is exactly one place a Credit is deducted, and Discord is not allowed to be a
   * second one. `/build` reaches the agent through `https://do/agent-run` — the same door a chat
   * message and the eval harness use — so the run charges itself from measured usage against
   * QuotaDO, once, wherever it was started from. A "Discord build" that deducted its own Credit
   * would double-charge every build and would drift the moment the pricing changed on one side.
   *
   * So: the Discord modules may READ the balance (`/state`, to refuse before starting) and must
   * never WRITE it (`/spend`).
   */
  const ports = INDEX.slice(INDEX.indexOf('function discordPorts('), INDEX.indexOf("app.post('/api/discord/interactions'"));
  assert.match(ports, /https:\/\/do\/agent-run/, '/build must go through the same run door as everything else');
  for (const [name, text] of [['discordPorts', ports], ['discord.ts', DISCORD], ['do/discord.ts', DO]]) {
    assert.equal(/do\/spend/.test(text), false, `${name} must not deduct Credits — there is one ledger and this is not it`);
    assert.equal(/creditsForNeurons|BUDGET_DO/.test(text), false, `${name} must not price or reserve anything itself`);
  }
  // Reading it is not only allowed, it is required: the refusal has to happen where the user is.
  assert.match(ports, /QUOTA_DO[\s\S]{0,120}https:\/\/do\/state/, 'the balance is read from the same QuotaDO the web app reads');
  assert.match(DISCORD, /creditsRemaining <= 0/, '/build must refuse an empty balance before starting a run');
});

test('the rate limiter fails CLOSED, so an unreachable Durable Object is not an open door', () => {
  // `okJson` returns null when DiscordDO cannot be reached. Defaulting that to "allowed" would
  // mean the limiter switches itself off in exactly the conditions — load — that it exists for.
  const ports = INDEX.slice(INDEX.indexOf('function discordPorts('), INDEX.indexOf("app.post('/api/discord/interactions'"));
  const limiter = ports.slice(ports.indexOf('rateLimit:'), ports.indexOf('redeemLinkCode:'));
  assert.match(limiter, /https:\/\/do\/rate/);
  assert.match(limiter, /\?\?\s*\{\s*ok:\s*false/, 'a limiter that fails open is a limiter-shaped comment');
  // And it is consulted before anything else the command would touch.
  const dispatch = DISCORD.slice(DISCORD.indexOf('const discordUserId = invokerId(i)'));
  const limit = dispatch.indexOf('ports.rateLimit(');
  assert.ok(limit > 0, 'every command must pass the limiter');
  for (const port of ['ports.findLink(', 'ports.redeemLinkCode(', 'ports.quota(', 'ports.startBuild(']) {
    assert.ok(dispatch.indexOf(port) > limit, `${port} must come after the limiter, not before it`);
  }
});

test('the setup page states the real limits, so the doc cannot drift from the constants', () => {
  /*
   * The same trap as the settings screen's "Get a code" button, which the unlinked message used to
   * name wrongly: a number written into prose is a second copy of a fact, and the copy is the one
   * that rots. A user told "20 a minute" who is cut off at 12 concludes the bot is broken.
   */
  const doc = readFileSync(join(WORKER, '..', '..', 'docs', 'DISCORD-SETUP.md'), 'utf8');
  const wide = /export const RATE_DEFAULT = (\d+)/.exec(DISCORD);
  const build = /RATE_LIMITS: Record<string, number> = \{ build: (\d+) \}/.exec(DISCORD);
  assert.ok(wide && build, 'the limits must be readable constants, not inline numbers');
  assert.match(doc, new RegExp(`${wide[1]} commands a minute`), 'the doc must state the real overall limit');
  assert.match(doc, new RegExp(`most ${build[1]} may be \`/build\``), 'the doc must state the real build limit');
  // And the command list the page tells people to expect must be the list that is registered.
  for (const name of COMMAND_NAMES) assert.ok(doc.includes(`\`/${name}\``), `the doc must mention /${name}`);
});
