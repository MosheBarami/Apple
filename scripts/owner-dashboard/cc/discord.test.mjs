// Discord module + page tests. No network: fetch is a fake upstream, every call is recorded. The one
// write (a message send) is exercised only as a dry run or against the fake; nothing reaches Discord.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const SENTINEL = `SENTINEL_dc_${'x'.repeat(40)}`;
const ENV = ['DISCORD_BOT_TOKEN', 'DISCORD_APPLICATION_ID', 'DISCORD_PUBLIC_KEY', 'DISCORD_CLIENT_SECRET'];
const APP = '222222222222222222', GUILD = '444444444444444444', TEXTCH = '555555555555555555', VOICE = '666666666666666666';
const USER = '888888888888888888', MSG1 = '999999999999999991', MSG2 = '999999999999999992';

const { uncache } = await import('./http.mjs');
const { discord, discordAction, inviteUrl, INVITE_PERMS } = await import('./platforms/discord.mjs');
const page = (await import('../control/pages/discord.js')).default;
const { infer } = await import('../control/pages/discord.js');
const { send } = await import('../control/actions/discord.js');

let calls = []; let mode = 'fixture';
const res = (body, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

const FIX = {
  '/users/@me': { id: APP, username: 'AppleAI App', global_name: null, discriminator: '4925', bot: true, verified: true, mfa_enabled: false, avatar: null, email: 'bot-owner@example.com' },
  '/applications/@me': { id: APP, name: 'AppleAI', description: '', verify_key: 'VERIFY_KEY_abcdef0123', owner: { id: USER, username: 'owner-person', email: 'owner@example.com' },
    flags: 0, install_params: { scopes: ['applications.commands'], permissions: '0' }, bot_public: true, approximate_guild_count: 1 },
  '/users/@me/guilds?with_counts=true': [{ id: GUILD, name: 'Test Guild', icon: null, owner: false, approximate_member_count: 42, approximate_presence_count: 7 }],
  '/gateway/bot': { url: 'wss://gateway.discord.gg', shards: 1, session_start_limit: { total: 1000, remaining: 999, reset_after: 1000, max_concurrency: 1 } },
  [`/guilds/${GUILD}/channels`]: [{ id: VOICE, name: 'voice', type: 2, position: 1 }, { id: TEXTCH, name: 'general', type: 0, position: 0, topic: 'hi' }],
  [`/applications/${APP}/guilds/${GUILD}/commands`]: [{ id: '777777777777777777', name: 'ping', description: 'Ping', type: 1 }],
  [`/guilds/${GUILD}/members?limit=50`]: [{ nick: null, roles: ['1'], user: { id: USER, username: 'alice', email: 'alice@example.com', avatar: null } }],
  [`/channels/${TEXTCH}/messages?limit=20`]: [
    { id: MSG1, type: 0, timestamp: '2026-09-01T10:00:00Z', author: { id: USER, username: 'alice' }, content: 'hello', attachments: [], embeds: [] },
    { id: MSG2, type: 0, timestamp: '2026-09-01T10:01:00Z', author: { id: USER, username: 'alice' }, content: '', attachments: [], embeds: [] }],
  [`/applications/${APP}/commands`]: [],
};

globalThis.fetch = async (url, init = {}) => {
  const u = String(url); calls.push({ url: u, init });
  const p = u.replace('https://discord.com/api/v10', '');
  const echo = init.headers?.authorization || 'none';
  if (mode === 'throw') throw new TypeError('network down');
  if (mode === 'echo403') return res({ message: `Missing Access ${echo}`, code: 50001 }, 403);
  if (mode === 'echo401') return res({ message: `401: Unauthorized ${echo}` }, 401);
  if (mode === 'echo500text') return res(`<html>boom ${echo}</html>`, 500);
  if (mode === 'echo200') {
    const one = { id: GUILD, name: echo, username: echo, global_name: echo, description: echo, content: echo, topic: echo, nick: echo, type: 0,
      user: { id: USER, username: echo }, author: { id: USER, username: echo }, install_params: { scopes: [echo] } };
    return res(/guilds|channels$|commands$|members|messages/.test(p.split('?')[0]) || p.includes('/guilds?') ? [one] : one);
  }
  if (init.method === 'POST' && p === `/channels/${TEXTCH}/messages`) return res({ id: '123456789012345678', content: JSON.parse(init.body).content });
  return p in FIX ? res(FIX[p]) : res({ message: 'Unknown' }, 404);
};

const saved = {};
beforeEach(() => { for (const k of ENV) saved[k] = process.env[k]; calls = []; mode = 'fixture'; uncache('discord'); });
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } uncache('discord'); });
const withToken = () => { process.env.DISCORD_BOT_TOKEN = SENTINEL; process.env.DISCORD_APPLICATION_ID = APP; };

test('with no token and no application id: not configured, names both keys, makes no request', async () => {
  delete process.env.DISCORD_BOT_TOKEN; delete process.env.DISCORD_APPLICATION_ID;
  const r = await discord();
  assert.equal(r.ok, true); assert.equal(r.configured, false); assert.equal(r.bot, false);
  assert.deepEqual(r.need, ['DISCORD_BOT_TOKEN', 'DISCORD_APPLICATION_ID']);
  assert.equal(calls.length, 0);
});

test('with a bot token: identity, app, guilds with channels, members, messages and commands, prefetched in one GET', async () => {
  withToken();
  const r = await discord();
  assert.equal(r.ok, true); assert.equal(r.bot, true);
  assert.equal(r.identity.username, 'AppleAI App'); assert.equal(r.app.name, 'AppleAI');
  assert.deepEqual(r.app.scopes, ['applications.commands']);
  assert.deepEqual(r.app.intents, { presence: false, members: false, content: false });
  const g = r.guilds[0];
  assert.equal(g.members, 42, 'the approximate member count survives next to the member list');
  assert.equal(g.online, 7);
  assert.deepEqual(g.channels.map((c) => c.name), ['general', 'voice'], 'channels sorted by position');
  assert.equal(g.memberList[0].name, 'alice');
  assert.equal(g.commands[0].name, 'ping');
  assert.equal(g.messages[TEXTCH].length, 2);
  assert.equal(g.messages[TEXTCH][1].hidden, true, 'an empty message with nothing attached is flagged as intent-hidden');
  assert.equal(g.messages[VOICE], undefined, 'voice channels are not read');
  assert.deepEqual(r.commands.global, []);
  assert.equal(r.gateway.remaining, 999);
  assert.equal(r.presence.readable, false);
  assert.equal(r.inviteUrl, `https://discord.com/oauth2/authorize?client_id=${APP}&scope=bot+applications.commands&permissions=${INVITE_PERMS}`);
  assert.equal(INVITE_PERMS, 1024 + 2048 + 65536);
  assert.ok(calls.every((c) => c.url.startsWith('https://discord.com/api/v10/') && (c.init.method ?? 'GET') === 'GET'), 'reads only');
  assert.ok(calls.every((c) => !c.url.includes(SENTINEL)), 'the token never rides in a URL');
});

test('personal and secret fields from Discord are not forwarded', async () => {
  withToken();
  const s = JSON.stringify(await discord());
  for (const x of ['VERIFY_KEY_abcdef0123', 'owner-person', 'owner@example.com', 'alice@example.com', 'bot-owner@example.com']) assert.ok(!s.includes(x), x);
});

test('the token never comes back, whatever Discord answers (200 echo, 401, 403, 500 text, network error)', async () => {
  withToken();
  for (const m of ['echo200', 'echo401', 'echo403', 'echo500text', 'throw']) {
    mode = m; uncache('discord');
    let r; await assert.doesNotReject(async () => { r = await discord(); }, m);
    assert.ok(!JSON.stringify(r).includes(SENTINEL), `leak in ${m}`);
    assert.ok(calls.some((c) => c.init.headers?.authorization === `Bot ${SENTINEL}`), 'the token is sent as a header');
  }
});

test('a failed guilds read is a failure, not "in no server"', async () => {
  withToken(); mode = 'echo403';
  const r = await discord();
  assert.equal(r.guilds.ok, false); assert.equal(r.guilds.status, 403);
  const ks = infer(r).map((c) => c.k);
  assert.ok(ks.includes('gfail')); assert.ok(!ks.includes('zero'));
});

test('dry run returns the exact call, mentions disabled, token masked, and makes no request', async () => {
  withToken();
  const r = await discordAction({ kind: 'send', channelId: TEXTCH, content: '  hi @everyone  ', dryRun: true });
  assert.equal(r.ok, true); assert.equal(r.dryRun, true);
  assert.deepEqual(r.plan, { method: 'POST', url: `https://discord.com/api/v10/channels/${TEXTCH}/messages`,
    body: { content: 'hi @everyone', allowed_mentions: { parse: [] } }, auth: 'Bot <DISCORD_BOT_TOKEN>' });
  assert.ok(!JSON.stringify(r).includes(SENTINEL));
  assert.equal(calls.length, 0);
});

test('invalid sends are refused before any request, dry run or not', async () => {
  withToken();
  const bad = [{ kind: 'delete', channelId: TEXTCH, content: 'x' }, { kind: 'send', channelId: '123', content: 'x' }, { kind: 'send', channelId: `${TEXTCH}/../x`, content: 'x' },
    { kind: 'send', channelId: TEXTCH, content: '   ' }, { kind: 'send', channelId: TEXTCH }, { kind: 'send', channelId: TEXTCH, content: 'y'.repeat(2001) }, {}];
  for (const b of bad) for (const dryRun of [true, false]) {
    const r = await discordAction({ ...b, dryRun });
    assert.equal(r.ok, false, JSON.stringify(b)); assert.equal(typeof r.reason, 'string');
  }
  assert.equal(calls.length, 0);
});

test('a real send (fake upstream only) posts once with mentions disabled and returns no secret', async () => {
  withToken();
  const r = await discordAction({ kind: 'send', channelId: TEXTCH, content: 'hello <@123>' });
  assert.equal(r.ok, true); assert.equal(r.sent, true);
  assert.equal(calls.length, 1);
  const c = calls[0];
  assert.equal(c.init.method, 'POST');
  assert.deepEqual(JSON.parse(c.init.body), { content: 'hello <@123>', allowed_mentions: { parse: [] } });
  assert.ok(!JSON.stringify(r).includes(SENTINEL));
  delete process.env.DISCORD_BOT_TOKEN;
  const n = await discordAction({ kind: 'send', channelId: TEXTCH, content: 'x' });
  assert.equal(n.ok, false); assert.equal(calls.length, 1, 'no token: refused without a request');
});

test('the page action spec posts to the discord action route with the typed text and a Hebrew confirm', () => {
  const s = send({ id: TEXTCH, name: 'general' }, '  hi  ', 'Test Guild');
  assert.equal(s.path, '/api/cc/discord/action');
  assert.deepEqual(s.body, { kind: 'send', channelId: TEXTCH, content: 'hi' });
  assert.match(s.title, /לשלוח/); assert.match(s.what, /אף אחד לא יתויג/);
});

test('infer: conclusions follow the state, 2 to 4 of them', async () => {
  const cases = {
    down: { ok: false, reason: 'x' },
    nc: { ok: true, configured: false, need: ['DISCORD_BOT_TOKEN'] },
    zero: { ok: true, configured: true, bot: true, identity: { username: 'B' }, app: { name: 'A', scopes: ['applications.commands'], intents: { content: false } }, guilds: [], commands: { global: [] } },
    in: { ok: true, configured: true, bot: true, identity: { username: 'B' }, app: { name: 'A', scopes: ['bot'], intents: { content: true } },
      guilds: [{ id: GUILD, members: 42, online: 7, commands: [], messages: { [TEXTCH]: [{ at: '2026-09-01T10:00:00Z', hidden: false }] } }], guildTotal: 1, commands: { global: [{ id: '1', name: 'x' }] } },
  };
  const k = Object.fromEntries(Object.entries(cases).map(([n, s]) => [n, infer(s)]));
  for (const [n, list] of Object.entries(k)) { assert.ok(list.length >= 2 && list.length <= 4, n); assert.ok(list.every((c) => c.title && c.text && c.tone), n); }
  assert.deepEqual(k.down.map((c) => c.k), ['down', 'blind']);
  assert.equal(k.nc[0].k, 'nc');
  assert.deepEqual(k.zero.slice(0, 2).map((c) => c.k), ['zero', 'next']);
  assert.ok(k.zero.some((c) => c.k === 'nocmd'));
  assert.equal(k.in[0].k, 'in'); assert.match(k.in[0].text, /42/);
  assert.ok(!k.in.some((c) => c.k === 'zero' || c.k === 'nocmd'));
});

test('page: no server still draws the client with an empty state and the invite link; a server shows its count', async () => {
  withToken();
  const z = { ok: true, configured: true, bot: true, identity: { username: 'B' }, app: { name: 'A', scopes: [] }, guilds: [], commands: { global: [] }, inviteUrl: inviteUrl(APP), presence: { why: 'x' } };
  const zero = String(page.render({ discord: z }));
  for (const cls of ['dc-rail', 'dc-side', 'dc-chat', 'dc-mem', 'dc-empty']) assert.ok(zero.includes(cls), cls);
  assert.ok(zero.includes(inviteUrl(APP).replace(/&/g, '&amp;')) || zero.includes(inviteUrl(APP)));
  const full = String(page.render({ discord: await discord() }));
  assert.ok(full.includes('data-k="g-' + GUILD + '"'));
  assert.match(full, /data-rn="dc-mem-444444444444444444" data-v="42"/);
  assert.ok(full.includes('data-act="dcSend"'));
  assert.ok(!full.includes(SENTINEL));
});
