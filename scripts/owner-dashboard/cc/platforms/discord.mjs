// Discord: what the bot can see over REST (identity, application, servers, channels, recent messages,
// members, slash commands, gateway limits) and one write, a message send, behind confirm + dryRun.
// With no bot token it falls back to the application's public profile (/rpc). Presence is a gateway
// feature and is not readable over REST; the page says so instead of guessing.
import { fetchJson, cached, ok, fail } from '../http.mjs';

const API = 'https://discord.com/api/v10';
const CDN = 'https://cdn.discordapp.com';
export const SNOWFLAKE = /^\d{17,20}$/;
// VIEW_CHANNEL (1024) + SEND_MESSAGES (2048) + READ_MESSAGE_HISTORY (65536): enough to read and post.
export const INVITE_PERMS = 1024 + 2048 + 65536;
const MAX_GUILDS = 5;
const MAX_CHANNELS = 8; // text channels per server whose recent messages are prefetched
const MSG_LIMIT = 20;
// Application flags for the privileged gateway intents (developer portal → Bot → Privileged Gateway Intents).
const INTENTS = { presence: [12, 13], members: [14, 15], content: [18, 19] };
const TEXT = new Set([0, 5]); // GUILD_TEXT, GUILD_ANNOUNCEMENT
const LABEL = 'Discord';

export const inviteUrl = (id) => `https://discord.com/oauth2/authorize?client_id=${id}&scope=bot+applications.commands&permissions=${INVITE_PERMS}`;
const portalUrl = (id) => `https://discord.com/developers/applications/${id}`;
const fid = (x) => (SNOWFLAKE.test(String(x ?? '')) ? String(x) : null);
const str = (x, n = 200) => (typeof x === 'string' ? x.slice(0, n) : null);
const numOr = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const list = (x) => (Array.isArray(x) ? x : []);
const bad = (e) => ({ ok: false, reason: e?.reason || 'שגיאה לא צפויה', status: typeof e?.status === 'number' ? e.status : null });

function avatarUrl(u) {
  const id = fid(u?.id); if (!id) return null;
  if (typeof u.avatar === 'string' && /^(a_)?[0-9a-f]{32}$/.test(u.avatar)) return `${CDN}/avatars/${id}/${u.avatar}.png?size=64`;
  return `${CDN}/embed/avatars/${Number((BigInt(id) >> 22n) % 6n)}.png`;
}
const iconUrl = (g) => (fid(g?.id) && typeof g.icon === 'string' && /^(a_)?[0-9a-f]{32}$/.test(g.icon) ? `${CDN}/icons/${g.id}/${g.icon}.png?size=96` : null);

// Every string the module returns has the credential values cut out, so the payload is safe before
// the server's own redact() runs (an upstream that echoes a header back cannot carry it through).
function scrub(obj) {
  let s = JSON.stringify(obj);
  for (const k of ['DISCORD_BOT_TOKEN', 'DISCORD_PUBLIC_KEY', 'DISCORD_CLIENT_SECRET']) {
    const v = process.env[k]; if (typeof v === 'string' && v.length >= 8) s = s.split(v).join('[redacted]');
  }
  return JSON.parse(s);
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

const cmd = (c) => ({ id: fid(c?.id), name: str(c?.name, 32), description: str(c?.description, 100), type: numOr(c?.type),
  options: list(c?.options).length, guildId: fid(c?.guild_id) });

function msg(m) {
  const a = m?.author || {};
  const content = str(m?.content, 2000) ?? '';
  const attachments = list(m?.attachments).length; const embeds = list(m?.embeds).length;
  return { id: fid(m?.id), type: numOr(m?.type), at: str(m?.timestamp, 40), edited: str(m?.edited_timestamp, 40),
    author: { id: fid(a.id), name: str(a.global_name || a.username, 64), bot: Boolean(a.bot), avatarUrl: avatarUrl(a) },
    content, attachments, embeds, pinned: Boolean(m?.pinned),
    // An empty message with nothing attached is what REST returns when the Message Content intent is off.
    hidden: !content && !attachments && !embeds && list(m?.sticker_items).length === 0 };
}

function intents(flags) {
  const f = numOr(flags) ?? 0; const has = ([a, b]) => Boolean(f & (1 << a) || f & (1 << b));
  return { presence: has(INTENTS.presence), members: has(INTENTS.members), content: has(INTENTS.content) };
}

function appOf(a, id) {
  return { id, name: str(a?.name, 100), description: str(a?.description, 400) || null, iconUrl: fid(id) && typeof a?.icon === 'string' && /^[0-9a-f]{32}$/.test(a.icon) ? `${CDN}/app-icons/${id}/${a.icon}.png?size=96` : null,
    botPublic: Boolean(a?.bot_public), requireCodeGrant: Boolean(a?.bot_require_code_grant), verified: Boolean(a?.is_verified),
    monetized: Boolean(a?.is_monetized), discoverable: Boolean(a?.is_discoverable), hook: Boolean(a?.hook),
    scopes: list(a?.install_params?.scopes).filter((s) => typeof s === 'string').slice(0, 10),
    installPermissions: str(a?.install_params?.permissions, 30), interactionsUrl: typeof a?.interactions_endpoint_url === 'string' ? 'set' : null,
    guildCount: numOr(a?.approximate_guild_count), userInstallCount: numOr(a?.approximate_user_install_count),
    intents: a?.flags == null ? null : intents(a.flags) };
}

async function guildDetail(g, appId, get) {
  const id = g.id;
  const base = { id, name: str(g.name, 100), iconUrl: iconUrl(g), owner: Boolean(g.owner), members: numOr(g.approximate_member_count),
    online: numOr(g.approximate_presence_count) };
  let channels;
  try {
    channels = list(await get(`/guilds/${id}/channels`, `רשימת הערוצים של ${base.name || 'השרת'}`)).filter((c) => fid(c?.id)).map((c) => ({
      id: c.id, name: str(c.name, 100), type: numOr(c.type), parentId: fid(c.parent_id), position: numOr(c.position) ?? 0,
      topic: str(c.topic, 300), nsfw: Boolean(c.nsfw) })).sort((a, b) => a.position - b.position);
  } catch (e) { channels = bad(e); }
  const [commands, memberList] = await Promise.all([
    appId ? get(`/applications/${appId}/guilds/${id}/commands`, 'פקודות הסלאש של השרת').then((x) => list(x).map(cmd), bad) : Promise.resolve(bad({ reason: 'אין מזהה אפליקציה' })),
    get(`/guilds/${id}/members?limit=50`, 'רשימת החברים').then((x) => list(x).map((m) => ({ id: fid(m?.user?.id),
      name: str(m?.nick || m?.user?.global_name || m?.user?.username, 64), bot: Boolean(m?.user?.bot), avatarUrl: avatarUrl(m?.user), roles: list(m?.roles).length })), bad),
  ]);
  const messages = {};
  if (Array.isArray(channels)) {
    const text = channels.filter((c) => TEXT.has(c.type)).slice(0, MAX_CHANNELS);
    await pool(text, 3, async (c) => {
      messages[c.id] = await get(`/channels/${c.id}/messages?limit=${MSG_LIMIT}`, `ההודעות בערוץ #${c.name}`).then((x) => list(x).map(msg), bad);
    });
  }
  return { ...base, channels, commands, memberList, messages };
}

async function withBot(token, envAppId) {
  const headers = { authorization: `Bot ${token}` };
  const get = (p, what) => fetchJson(`${API}${p}`, { label: LABEL, what, headers });
  // /users/@me/guilds has a one-request-per-second bucket, so the reads that do not depend on each
  // other run in parallel and that one runs once.
  const [me, app, guildsRaw, gateway] = await Promise.all([
    get('/users/@me', 'זהות הבוט').then((u) => u, bad),
    get('/applications/@me', 'פרטי האפליקציה').then((a) => a, bad),
    get('/users/@me/guilds?with_counts=true', 'רשימת השרתים').then((x) => x, bad),
    get('/gateway/bot', 'מגבלות החיבור').then((x) => x, bad),
  ]);
  const appId = fid(app?.id) || fid(me?.id) || fid(envAppId);
  const identity = me?.ok === false ? me : { id: fid(me?.id), username: str(me?.username, 64), globalName: str(me?.global_name, 64),
    discriminator: str(me?.discriminator, 4), bot: Boolean(me?.bot), verified: Boolean(me?.verified), mfa: Boolean(me?.mfa_enabled), avatarUrl: avatarUrl(me) };
  const all = guildsRaw?.ok === false ? null : list(guildsRaw).filter((g) => fid(g?.id));
  const guilds = all === null ? guildsRaw : await pool(all.slice(0, MAX_GUILDS), 2, (g) => guildDetail(g, appId, get));
  const global = appId ? await get(`/applications/${appId}/commands`, 'פקודות הסלאש הגלובליות').then((x) => list(x).map(cmd), bad) : bad({ reason: 'אין מזהה אפליקציה' });
  const gw = gateway?.ok === false ? gateway : { shards: numOr(gateway?.shards), total: numOr(gateway?.session_start_limit?.total),
    remaining: numOr(gateway?.session_start_limit?.remaining), resetAfterMs: numOr(gateway?.session_start_limit?.reset_after),
    maxConcurrency: numOr(gateway?.session_start_limit?.max_concurrency) };
  return { configured: true, bot: true, source: 'bot', identity, app: app?.ok === false ? app : appOf(app, appId), guilds, guildTotal: all ? all.length : null,
    commands: { global }, gateway: gw, inviteUrl: appId ? inviteUrl(appId) : null, portalUrl: appId ? portalUrl(appId) : null };
}

async function publicOnly(id) {
  try {
    const a = await fetchJson(`${API}/applications/${id}/rpc`, { label: LABEL, what: 'פרטי האפליקציה' });
    return { configured: true, bot: false, source: 'public', need: ['DISCORD_BOT_TOKEN'], app: appOf(a, id), identity: bad({ reason: 'אין טוקן בוט, אז אי אפשר לשאול מי הבוט' }),
      guilds: bad({ reason: 'אין טוקן בוט, אז אי אפשר לראות באילו שרתים הוא נמצא' }), commands: { global: bad({ reason: 'אין טוקן בוט' }) },
      gateway: bad({ reason: 'אין טוקן בוט' }), inviteUrl: inviteUrl(id), portalUrl: portalUrl(id) };
  } catch (e) { return { ...fail(e?.reason || 'Discord לא זמין'), configured: true, bot: false }; }
}

const PRESENCE = { readable: false, why: 'Discord מציג "מחובר" רק לבוט שמחזיק חיבור Gateway פתוח. הלוח קורא ב-REST בלבד, אז מצב הנוכחות של הבוט לא ניתן לקריאה מכאן.' };

export function discord() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const envId = process.env.DISCORD_APPLICATION_ID;
  const hasToken = typeof token === 'string' && token.length >= 20;
  if (!hasToken && !fid(envId)) return Promise.resolve(ok({ configured: false, bot: false, need: ['DISCORD_BOT_TOKEN', 'DISCORD_APPLICATION_ID'], presence: PRESENCE }));
  return cached('discord', async () => {
    try {
      const body = hasToken ? await withBot(token, envId) : await publicOnly(envId);
      return scrub(body.ok === false ? { ...body, presence: PRESENCE } : ok({ ...body, presence: PRESENCE }));
    } catch (e) { return scrub(fail(e?.reason || 'Discord לא זמין', { configured: true, bot: hasToken })); }
  }, 60000);
}

/**
 * The only write: send a plain message to a channel. No mention can ping anyone (allowed_mentions
 * parse:[]). dryRun returns the exact call and makes no network request.
 */
export async function discordAction(b = {}) {
  if (b?.kind !== 'send') return fail('הפעולה הזו לא קיימת בדף של Discord. אפשר רק לשלוח הודעה.');
  const channelId = String(b.channelId ?? '');
  if (!SNOWFLAKE.test(channelId)) return fail('מזהה הערוץ לא תקין (צריך להיות מספר של 17 עד 20 ספרות).');
  if (typeof b.content !== 'string') return fail('חסר תוכן להודעה.');
  const content = b.content.trim();
  if (!content) return fail('ההודעה ריקה.');
  if (content.length > 2000) return fail(`ההודעה ארוכה מדי (${content.length} תווים, המקסימום של Discord הוא 2000).`);
  const url = `${API}/channels/${channelId}/messages`;
  const body = { content, allowed_mentions: { parse: [] } };
  if (b.dryRun === true) return scrub(ok({ dryRun: true, plan: { method: 'POST', url, body, auth: 'Bot <DISCORD_BOT_TOKEN>' } }));
  const token = process.env.DISCORD_BOT_TOKEN;
  if (typeof token !== 'string' || token.length < 20) return fail('אין טוקן בוט (DISCORD_BOT_TOKEN), אז אי אפשר לשלוח.');
  try {
    const m = await fetchJson(url, { label: LABEL, what: 'שליחת ההודעה', method: 'POST', body, headers: { authorization: `Bot ${token}` } });
    return scrub(ok({ sent: true, id: fid(m?.id), channelId, note: 'ההודעה נשלחה לערוץ.' }));
  } catch (e) { return scrub(fail(e?.reason || 'השליחה נכשלה')); }
}
