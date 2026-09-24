#!/usr/bin/env node
// Builds the Apple community server on Discord from a declaration, idempotently.
//
//   (set -a; . ./.env; set +a; node infra/discord-server.mjs)
//
// Everything is matched BY NAME, so running it twice changes nothing and running it after an edit
// here applies only the difference. It never deletes a channel or a role it did not declare —
// a moderator's hand-made channel survives a rerun. Needs DISCORD_BOT_TOKEN (bot with
// Administrator in the server) and DISCORD_GUILD_ID. Webhook URLs it creates are written to
// .env (gitignored) under DISCORD_WEBHOOK_*; nothing secret is printed.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD = process.env.DISCORD_GUILD_ID || '1549352480658169866';
const SITE = process.env.API_BASE || 'https://apple.moshe-barami111.workers.dev';
if (!TOKEN) { console.error('DISCORD_BOT_TOKEN is not set'); process.exit(1); }

const API = 'https://discord.com/api/v10';
const P = (n) => 1n << BigInt(n);
const PERM = {
  INVITE: P(0), KICK: P(1), BAN: P(2), ADMIN: P(3), MANAGE_CHANNELS: P(4), MANAGE_GUILD: P(5),
  REACT: P(6), AUDIT_LOG: P(7), PRIORITY_SPEAKER: P(8), STREAM: P(9), VIEW: P(10), SEND: P(11),
  MANAGE_MESSAGES: P(13), EMBED: P(14), ATTACH: P(15), HISTORY: P(16), MENTION_EVERYONE: P(17),
  EXTERNAL_EMOJIS: P(18), CONNECT: P(20), SPEAK: P(21), MUTE: P(22), DEAFEN: P(23), MOVE: P(24),
  VAD: P(25), CHANGE_NICK: P(26), MANAGE_NICKS: P(27), MANAGE_ROLES: P(28), MANAGE_WEBHOOKS: P(29),
  MANAGE_EXPRESSIONS: P(30), APP_COMMANDS: P(31), REQUEST_TO_SPEAK: P(32), MANAGE_EVENTS: P(33),
  MANAGE_THREADS: P(34), PUBLIC_THREADS: P(35), PRIVATE_THREADS: P(36), EXTERNAL_STICKERS: P(37),
  SEND_IN_THREADS: P(38), ACTIVITIES: P(39), MODERATE: P(40), VOICE_MESSAGES: P(46), POLLS: P(49),
};
const bits = (...names) => names.reduce((a, n) => a | PERM[n], 0n).toString();

let calls = 0;
async function api(method, path, body, { reason, allow404 } = {}) {
  for (let attempt = 0; attempt < 6; attempt++) {
    calls++;
    const res = await fetch(API + path, {
      method,
      headers: {
        Authorization: `Bot ${TOKEN}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(reason ? { 'X-Audit-Log-Reason': encodeURIComponent(reason) } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) {
      const j = await res.json().catch(() => ({}));
      await new Promise((r) => setTimeout(r, Math.ceil((j.retry_after ?? 1) * 1000) + 250));
      continue;
    }
    if (res.status === 204) return null;
    const text = await res.text();
    if (allow404 && res.status === 404) return null;
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 400)}`);
    return text ? JSON.parse(text) : null;
  }
  throw new Error(`${method} ${path} -> still rate limited`);
}

// ------------------------------------------------------------------ declaration

const ROLES = [
  // Highest first. `hoist` shows the role as its own group in the member list.
  { name: 'Apple Team', color: 0xff4d4d, hoist: true, mentionable: false,
    permissions: bits('KICK', 'BAN', 'MANAGE_CHANNELS', 'MANAGE_GUILD', 'AUDIT_LOG', 'MANAGE_MESSAGES', 'MENTION_EVERYONE',
      'MANAGE_NICKS', 'MANAGE_ROLES', 'MANAGE_WEBHOOKS', 'MANAGE_EXPRESSIONS', 'MANAGE_EVENTS', 'MANAGE_THREADS', 'MODERATE',
      'MUTE', 'DEAFEN', 'MOVE', 'PRIORITY_SPEAKER', 'VIEW', 'SEND', 'EMBED', 'ATTACH', 'HISTORY', 'REACT', 'CONNECT', 'SPEAK',
      'STREAM', 'VAD', 'APP_COMMANDS', 'PUBLIC_THREADS', 'PRIVATE_THREADS', 'SEND_IN_THREADS', 'EXTERNAL_EMOJIS', 'POLLS') },
  { name: 'Moderator', color: 0x3ba55d, hoist: true, mentionable: true,
    permissions: bits('KICK', 'BAN', 'AUDIT_LOG', 'MANAGE_MESSAGES', 'MANAGE_NICKS', 'MANAGE_THREADS', 'MODERATE', 'MUTE',
      'DEAFEN', 'MOVE', 'VIEW', 'SEND', 'EMBED', 'ATTACH', 'HISTORY', 'REACT', 'CONNECT', 'SPEAK', 'STREAM', 'VAD',
      'APP_COMMANDS', 'PUBLIC_THREADS', 'PRIVATE_THREADS', 'SEND_IN_THREADS', 'EXTERNAL_EMOJIS', 'POLLS') },
  { name: 'Apple MAX', color: 0xf5b700, hoist: true, mentionable: false, permissions: '0' },
  { name: 'Pro', color: 0x9b59ff, hoist: true, mentionable: false, permissions: '0' },
  { name: 'Creator', color: 0x2ecc71, hoist: false, mentionable: false, permissions: '0' },
  { name: 'Beta Tester', color: 0x00b8d9, hoist: false, mentionable: true, permissions: '0' },
  { name: 'Content Creator', color: 0xff66c4, hoist: false, mentionable: false, permissions: '0' },
  // Interests — picked in onboarding, used to find people who can help.
  { name: 'Scripter', color: 0x5865f2, permissions: '0' },
  { name: 'Builder', color: 0xe67e22, permissions: '0' },
  { name: 'UI Designer', color: 0xeb459e, permissions: '0' },
  { name: '3D Modeler', color: 0x1abc9c, permissions: '0' },
  { name: 'VFX Artist', color: 0x9b84ee, permissions: '0' },
  { name: 'New to Roblox Dev', color: 0x95a5a6, permissions: '0' },
  // Pings — opt-in, so an announcement only reaches people who asked for it.
  { name: 'Announcements Ping', color: 0, mentionable: false, permissions: '0' },
  { name: 'Updates Ping', color: 0, mentionable: false, permissions: '0' },
  { name: 'Events Ping', color: 0, mentionable: false, permissions: '0' },
];

// Base permissions for @everyone: normal chatting, no @everyone pings, no external apps spam.
const EVERYONE_PERMS = bits('INVITE', 'CHANGE_NICK', 'VIEW', 'SEND', 'EMBED', 'ATTACH', 'HISTORY', 'REACT',
  'EXTERNAL_EMOJIS', 'EXTERNAL_STICKERS', 'CONNECT', 'SPEAK', 'STREAM', 'VAD', 'APP_COMMANDS', 'PUBLIC_THREADS',
  'SEND_IN_THREADS', 'REQUEST_TO_SPEAK', 'VOICE_MESSAGES', 'POLLS', 'ACTIVITIES');

const T = { TEXT: 0, VOICE: 2, CATEGORY: 4, NEWS: 5, STAGE: 13, FORUM: 15 };

// `readonly`: members read and react, staff post. `staff`: invisible to everyone else.
const LAYOUT = [
  { category: '📌 START HERE', rename: [], channels: [
    { name: 'welcome', type: T.TEXT, readonly: true, topic: 'Start here: what Apple is and how to get going.' },
    { name: 'rules', type: T.TEXT, readonly: true, topic: 'The server rules. Breaking them gets a timeout or a ban.' },
    { name: 'announcements', type: T.NEWS, readonly: true, topic: 'Big news about Apple. Follow this channel to get it in your own server.' },
    { name: 'changelog', type: T.NEWS, readonly: true, topic: 'Every release of the site, the Studio plugin and the models.' },
    { name: 'faq', type: T.TEXT, readonly: true, topic: 'Answers to the questions everyone asks first.' },
    { name: 'status', type: T.TEXT, readonly: true, topic: 'Is Apple up? Outages and maintenance are posted here.' },
  ] },
  { category: '💬 COMMUNITY', rename: ['Text Channels'], channels: [
    { name: 'general', type: T.TEXT, topic: 'Talk about anything Roblox and Apple.' },
    { name: 'introductions', type: T.TEXT, topic: 'New here? Say hi and tell us what you are building.' },
    { name: 'roblox-dev-chat', type: T.TEXT, topic: 'Luau, Studio, building, UI, monetisation: game dev talk.' },
    { name: 'off-topic', type: T.TEXT, topic: 'Everything else. Keep it friendly.' },
    { name: 'showcase', type: T.FORUM, topic: 'Show a game you built with Apple: one post per game, with screenshots or a video.',
      tags: [['Simulator', '🌱'], ['Obby', '🧗'], ['Tycoon', '🏭'], ['RPG', '⚔️'], ['Horror', '👻'], ['Racing', '🏎️'], ['UI', '🎨'], ['Map', '🗺️'], ['Work in progress', '🚧']],
      reaction: '🔥' },
  ] },
  { category: '🍎 APPLE', rename: [], channels: [
    { name: 'ask-apple', type: T.TEXT, topic: 'Use the bot here: /build <idea>, /status, /credits, /link <code>, /unlink.', slowmode: 5 },
    { name: 'prompt-library', type: T.FORUM, topic: 'Share the prompts that built something great: paste the prompt, show the result.',
      tags: [['Full game', '🎮'], ['UI', '🎨'], ['Map', '🗺️'], ['Scripting', '📜'], ['VFX & SFX', '✨'], ['Tip', '💡']], reaction: '🍎' },
    { name: 'ui-library', type: T.TEXT, topic: 'The Roblox UI library Apple builds with: kits, icons, genre styles. Requests welcome.' },
    { name: 'model-updates', type: T.NEWS, readonly: true, topic: 'Training log for Apple and Apple MAX: every version, measured on the same held-out tests.' },
  ] },
  { category: '🛟 SUPPORT', rename: [], channels: [
    { name: 'help', type: T.FORUM, topic: 'Stuck? Open a post: what you did, what you expected, what happened. Add a screenshot.',
      tags: [['Studio plugin', '🔌'], ['Connecting Studio', '🔗'], ['Builds', '🏗️'], ['Account', '👤'], ['Billing', '💳'], ['Solved', '✅', true]], reaction: '👍' },
    { name: 'bug-reports', type: T.FORUM, topic: 'Found a bug? One post per bug: steps to reproduce, what you expected, screenshots.',
      tags: [['Website', '🌐'], ['Studio plugin', '🔌'], ['Builds', '🏗️'], ['Billing', '💳'], ['Confirmed', '🟠', true], ['Fixed', '✅', true], ['Cannot reproduce', '❔', true]], reaction: '🐞' },
    { name: 'feature-requests', type: T.FORUM, topic: 'Ideas for Apple. Upvote with 👍: the most wanted ones get built first.',
      tags: [['Planned', '🗓️', true], ['Under review', '👀', true], ['Shipped', '🚀', true], ['Studio', '🔌'], ['Website', '🌐'], ['Models', '🧠']], reaction: '👍' },
    { name: 'plugin-setup', type: T.TEXT, readonly: true, topic: 'How to install the Apple Studio plugin and connect it to your project.' },
  ] },
  { category: '🔊 VOICE', rename: ['Voice Channels'], channels: [
    { name: 'Lounge', type: T.VOICE, rename: ['General'] },
    { name: 'Build Together', type: T.VOICE },
    { name: 'Help Desk', type: T.VOICE },
    { name: 'Apple Live', type: T.STAGE, topic: 'Live demos, Q&A and release streams.' },
  ] },
  { category: '🛡️ STAFF', staff: true, rename: [], channels: [
    { name: 'staff-chat', type: T.TEXT },
    { name: 'mod-log', type: T.TEXT, topic: 'AutoMod alerts and moderation actions.' },
    { name: 'alerts', type: T.TEXT, topic: 'Automated alerts from the Apple backend.' },
    { name: 'discord-updates', type: T.TEXT, topic: 'Discord’s own community updates land here.' },
  ] },
];

const WEBHOOKS = [
  // [channel, webhook name, .env key]
  ['announcements', 'Apple', 'DISCORD_WEBHOOK_ANNOUNCEMENTS'],
  ['changelog', 'Apple Releases', 'DISCORD_WEBHOOK_CHANGELOG'],
  ['status', 'Apple Status', 'DISCORD_WEBHOOK_STATUS'],
  ['model-updates', 'Apple Training', 'DISCORD_WEBHOOK_MODEL_UPDATES'],
  ['alerts', 'Apple Alerts', 'DISCORD_WEBHOOK_ALERTS'],
];

const APP = `${SITE}/app`;
const DOCS = `${SITE}/docs`;
const MARK = '​'; // zero-width marker so a rerun recognises its own posts

const COLOR = 0xe8423f;
const MESSAGES = {
  welcome: [{
    title: '🍎 Welcome to Apple',
    description: [
      'Apple builds Roblox games from a sentence. Describe the game, and Apple builds it in **Roblox Studio**: map, scripts, UI, sounds and effects.',
      '',
      '**Get started in three steps**',
      `1. Make a free account: ${SITE}/app/signup`,
      '2. Install the Apple Studio plugin (see <#plugin-setup>)',
      '3. Open a project, type your idea, and watch Studio fill up',
      '',
      '**Find your way around**',
      '• <#rules>: read these first',
      '• <#announcements> and <#changelog>: what is new',
      '• <#ask-apple>: build from Discord with `/build`',
      '• <#help>: stuck? open a post',
      '• <#showcase>: show what you made',
      '• <#feature-requests>: tell us what to build next',
    ].join('\n'),
    fields: [
      { name: 'Website', value: SITE, inline: true },
      { name: 'Open the app', value: APP, inline: true },
      { name: 'Docs', value: DOCS, inline: true },
    ],
  }],
  rules: [{
    title: '📜 Server rules',
    description: [
      '**1. Be kind.** No harassment, hate, slurs, threats or bullying. Everyone here is learning.',
      '**2. Keep it safe for everyone.** No NSFW, gore or shocking content, in messages, names or avatars.',
      '**3. No spam or self-promo.** No ads, invite links to other servers, or mass pings. Share your games in <#showcase>.',
      '**4. No scams.** No "free Robux", account trading, or links that ask for passwords. Staff will never ask for your password or a code.',
      '**5. Protect your privacy.** Never post your password, email, address, phone number or someone else’s.',
      '**6. Use the right channel.** Help goes in <#help>, bugs in <#bug-reports>, ideas in <#feature-requests>.',
      '**7. Respect creators.** Only share work you made or have permission to share. No leaked or stolen assets.',
      '**8. Follow Discord’s rules.** The Discord Terms of Service and Community Guidelines apply here, including the minimum age of 13.',
      '',
      'Moderators may remove content and time out, kick or ban anyone who breaks these rules. Report problems to a **@Moderator**.',
    ].join('\n'),
  }],
  faq: [{
    title: '❓ Frequently asked questions',
    fields: [
      { name: 'What is Apple?', value: 'An AI that builds Roblox games directly in Roblox Studio through the Apple plugin: maps, scripts, UI, sounds and effects.' },
      { name: 'Is it free?', value: `Yes. The Free plan uses the **Apple** model with daily Credits. **Pro** adds **Apple MAX**, and **Max** unlocks everything. See ${SITE}/pricing` },
      { name: 'What is the difference between Apple and Apple MAX?', value: 'Apple MAX is the strongest model, for full games and complex systems. Apple is fast and great for smaller builds and edits.' },
      { name: 'Does Apple change my game without asking?', value: 'Apple works in the project you connect. Every change is a checkpoint, and you can undo it from the project page.' },
      { name: 'Can I build from Discord?', value: 'Yes. Link your account with `/link <code>` (the code is on your project page), then use `/build` in <#ask-apple>.' },
      { name: 'Where do the UI images and models come from?', value: 'Apple uses free assets from the Roblox Creator Store and free (CC0) icon libraries, so your game stays yours.' },
      { name: 'Something broke. What do I do?', value: 'Open a post in <#help> with what you did and a screenshot, or report a bug in <#bug-reports>.' },
    ],
  }],
  'plugin-setup': [{
    title: '🔌 Installing the Apple Studio plugin',
    description: [
      '1. Open **Roblox Studio** and sign in.',
      '2. Open the **Creator Store** (Toolbox → Plugins) and search **Apple Studio**, or open the plugin page from the app.',
      '3. Press **Install**. The Apple button appears in the **Plugins** tab.',
      `4. On ${APP}, open your project and press **Connect Studio**. You get a short pairing code.`,
      '5. In Studio, press the Apple button, paste the code, and press **Connect**.',
      '6. When the dock says **Connected**, type your idea in the app and Apple starts building.',
      '',
      '**Plugin says "Connection hiccup"?** It reconnects by itself within a few seconds. If it stays, close and reopen the dock.',
      '**Still stuck?** Open a post in <#help> with the tag *Connecting Studio*.',
    ].join('\n'),
  }],
  status: [{
    title: '🟢 Status',
    description: `Apple is up. Outages and maintenance are posted here as they happen.\nLive health check: ${SITE}/api/health`,
  }],
  'ui-library': [{
    title: '🎨 The Apple UI library',
    description: [
      'Apple builds game UI **only** from its library, not from scratch:',
      '• **77,000+** free UI images from the Roblox Creator Store, searchable by genre and role',
      '• **5,000+** free (CC0) icons and UI components',
      '• Genre kits: simulator, obby, tycoon, RPG, horror and more',
      '',
      'Want a style or component that is missing? Post it here.',
    ].join('\n'),
  }],
  'model-updates': [{
    title: '🧠 Model updates',
    description: 'Every training version of Apple is posted here with its scores on the same held-out tests, so progress is measured, not claimed.',
  }],
  'ask-apple': [{
    title: '🤖 Build from Discord',
    description: [
      '`/link <code>`: connect your Apple account (the code is on your project page)',
      '`/build <idea>`: tell Apple what to build in your linked project',
      '`/status`: how the current build is going',
      '`/credits`: how many Credits you have left',
      '`/unlink`: disconnect Discord from Apple',
    ].join('\n'),
  }],
};

// ------------------------------------------------------------------ helpers

function channelMention(content, byName) {
  return content.replace(/<#([a-z0-9-]+)>/g, (m, n) => (byName.get(n) ? `<#${byName.get(n).id}>` : `#${n}`));
}

function embedFor(e, byName) {
  const out = { color: COLOR, ...e };
  if (out.description) out.description = channelMention(out.description, byName);
  if (out.fields) out.fields = out.fields.map((f) => ({ ...f, value: channelMention(f.value, byName) }));
  out.footer = { text: `Apple · ${SITE.replace(/^https?:\/\//, '')}${MARK}` };
  return out;
}

function upsertEnv(key, value) {
  const file = resolve(ROOT, '.env');
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const re = new RegExp(`^${key}=.*$`, 'm');
  const line = `${key}=${value}`;
  const next = re.test(text) ? text.replace(re, line) : `${text.replace(/\n?$/, '\n')}${line}\n`;
  if (next !== text) writeFileSync(file, next);
}

// ------------------------------------------------------------------ build

const log = (...a) => console.log(...a);

async function main() {
  const me = await api('GET', '/users/@me');
  const guild = await api('GET', `/guilds/${GUILD}`);
  log(`server: ${guild.name} (${GUILD}) as ${me.username}`);

  // 1. Roles, top to bottom. Created in reverse so position order follows the declaration.
  let roles = await api('GET', `/guilds/${GUILD}/roles`);
  const roleByName = new Map(roles.map((r) => [r.name, r]));
  for (const spec of ROLES) {
    const body = { name: spec.name, color: spec.color ?? 0, hoist: !!spec.hoist, mentionable: !!spec.mentionable, permissions: spec.permissions };
    const have = roleByName.get(spec.name);
    if (!have) { roleByName.set(spec.name, await api('POST', `/guilds/${GUILD}/roles`, body, { reason: 'Apple server build' })); log(`+ role ${spec.name}`); }
    else if (have.color !== body.color || have.hoist !== body.hoist || have.mentionable !== body.mentionable || have.permissions !== body.permissions) {
      await api('PATCH', `/guilds/${GUILD}/roles/${have.id}`, body, { reason: 'Apple server build' }); log(`~ role ${spec.name}`);
    }
  }
  const everyone = roleByName.get('@everyone') ?? roles.find((r) => r.id === GUILD);
  if (everyone.permissions !== EVERYONE_PERMS) { await api('PATCH', `/guilds/${GUILD}/roles/${GUILD}`, { permissions: EVERYONE_PERMS }); log('~ @everyone permissions'); }
  // Order: our roles just below the bot's own managed role.
  roles = await api('GET', `/guilds/${GUILD}/roles`);
  const botRole = roles.find((r) => r.managed && r.tags?.bot_id === me.id);
  if (botRole) {
    const top = botRole.position - 1;
    const positions = ROLES.map((s, i) => ({ id: roles.find((r) => r.name === s.name).id, position: Math.max(1, top - i) }));
    const needs = positions.some((p) => roles.find((r) => r.id === p.id).position !== p.position);
    if (needs) { await api('PATCH', `/guilds/${GUILD}/roles`, positions).catch((e) => log('! role order:', e.message)); log('~ role order'); }
  }
  const R = (n) => roles.find((r) => r.name === n)?.id ?? roleByName.get(n)?.id;
  roles = await api('GET', `/guilds/${GUILD}/roles`);

  const TEAM = R('Apple Team'), MOD = R('Moderator');
  const staffAllow = bits('VIEW', 'SEND', 'HISTORY', 'MANAGE_MESSAGES', 'MANAGE_THREADS', 'EMBED', 'ATTACH', 'CONNECT', 'SPEAK');
  const readonlyOverwrites = [
    { id: GUILD, type: 0, allow: bits('VIEW', 'HISTORY', 'REACT'), deny: bits('SEND', 'PUBLIC_THREADS', 'PRIVATE_THREADS', 'SEND_IN_THREADS') },
    { id: TEAM, type: 0, allow: bits('SEND', 'EMBED', 'ATTACH', 'MANAGE_MESSAGES'), deny: '0' },
  ];
  const staffOverwrites = [
    { id: GUILD, type: 0, allow: '0', deny: bits('VIEW', 'CONNECT') },
    { id: TEAM, type: 0, allow: staffAllow, deny: '0' },
    { id: MOD, type: 0, allow: staffAllow, deny: '0' },
    { id: me.id, type: 1, allow: bits('VIEW', 'SEND', 'MANAGE_WEBHOOKS', 'EMBED'), deny: '0' },
  ];

  // 2. Categories and channels. Community-only types (news, forum, stage) are created after
  //    Community is on; until then they are created as text or skipped.
  let channels = await api('GET', `/guilds/${GUILD}/channels`);
  const find = (name, type) => channels.find((c) => c.name === name && (type === undefined || c.type === type));
  const community = () => (guild.features || []).includes('COMMUNITY');

  async function ensureChannels(pass) {
    channels = await api('GET', `/guilds/${GUILD}/channels`);
    let pos = 0;
    for (const block of LAYOUT) {
      let cat = find(block.category, T.CATEGORY) ?? block.rename.map((n) => find(n, T.CATEGORY)).find(Boolean);
      const catBody = { name: block.category, type: T.CATEGORY, position: pos++, permission_overwrites: block.staff ? staffOverwrites : [] };
      if (!cat) { cat = await api('POST', `/guilds/${GUILD}/channels`, catBody); channels.push(cat); log(`+ category ${block.category}`); }
      else if (cat.name !== block.category || (block.staff && (cat.permission_overwrites || []).length === 0)) {
        cat = await api('PATCH', `/channels/${cat.id}`, { name: block.category, ...(block.staff ? { permission_overwrites: staffOverwrites } : {}) }); log(`~ category ${block.category}`);
      }
      let cpos = 0;
      for (const ch of block.channels) {
        const communityType = ch.type === T.NEWS || ch.type === T.FORUM || ch.type === T.STAGE;
        if (communityType && !community()) {
          if (ch.type === T.FORUM || ch.type === T.STAGE) continue; // created on pass 2
        }
        const wantType = communityType && !community() ? T.TEXT : ch.type;
        let have = channels.find((c) => c.name === ch.name && c.type !== T.CATEGORY) ?? (ch.rename || []).map((n) => channels.find((c) => c.name === n && c.type !== T.CATEGORY)).find(Boolean);
        const overwrites = block.staff ? staffOverwrites : ch.readonly ? readonlyOverwrites : [];
        const body = { name: ch.name, parent_id: cat.id, position: cpos++ };
        if (ch.topic && ch.type !== T.VOICE) body.topic = ch.topic;
        if (ch.slowmode) body.rate_limit_per_user = ch.slowmode;
        if (ch.type === T.FORUM) {
          body.available_tags = ch.tags.map(([name, emoji, moderated]) => ({ name, emoji_name: emoji, moderated: !!moderated }));
          body.default_reaction_emoji = { emoji_name: ch.reaction };
          body.default_sort_order = 0;
          body.default_forum_layout = 1;
          body.flags = 0;
        }
        if (!have) {
          have = await api('POST', `/guilds/${GUILD}/channels`, { ...body, type: wantType, permission_overwrites: overwrites });
          channels.push(have); log(`+ #${ch.name}`);
        } else {
          const patch = { ...body };
          if (have.type !== wantType && have.type === T.TEXT && wantType === T.NEWS) patch.type = T.NEWS;
          if (overwrites.length && (have.permission_overwrites || []).length === 0) patch.permission_overwrites = overwrites;
          if (ch.type === T.FORUM && (have.available_tags || []).length) delete patch.available_tags; // keep tag ids stable
          const changed = have.name !== ch.name || have.parent_id !== cat.id || (ch.topic && have.topic !== ch.topic && ch.type !== T.VOICE) || patch.type !== undefined || patch.permission_overwrites || (ch.slowmode && have.rate_limit_per_user !== ch.slowmode) || have.position !== body.position;
          if (changed) { have = await api('PATCH', `/channels/${have.id}`, patch); log(`~ #${ch.name}`); }
        }
      }
    }
    channels = await api('GET', `/guilds/${GUILD}/channels`);
  }

  await ensureChannels(1);

  // 3. Server settings + Community. Community needs a rules channel, an updates channel, email
  //    verification and the explicit-media filter on for everyone.
  const byName = new Map(channels.filter((c) => c.type !== T.CATEGORY).map((c) => [c.name, c]));
  const icon = readFileSync(resolve(ROOT, 'apps/site/public/icon-512.png')).toString('base64');
  const settings = {
    name: 'Apple · AI Roblox Builder',
    description: 'Apple builds Roblox games from a sentence. Get help, share your builds and follow every release.',
    verification_level: 2,
    default_message_notifications: 1,
    explicit_content_filter: 2,
    preferred_locale: 'en-US',
    rules_channel_id: byName.get('rules').id,
    public_updates_channel_id: byName.get('discord-updates').id,
    system_channel_id: byName.get('introductions').id,
    system_channel_flags: (1 << 1) | (1 << 3), // no boost notices, no sticker-reply buttons on joins
    safety_alerts_channel_id: byName.get('mod-log').id,
    features: Array.from(new Set([...(guild.features || []), 'COMMUNITY'])),
  };
  if (!guild.icon) settings.icon = `data:image/png;base64,${icon}`;
  const needsSettings = guild.name !== settings.name || !community() || guild.description !== settings.description || guild.verification_level !== 2 || guild.explicit_content_filter !== 2 || guild.rules_channel_id !== settings.rules_channel_id || !guild.icon || guild.system_channel_id !== settings.system_channel_id;
  if (needsSettings) {
    const g2 = await api('PATCH', `/guilds/${GUILD}`, settings, { reason: 'Apple server build' });
    guild.features = g2.features; guild.name = g2.name;
    log(`~ server settings (community: ${community()})`);
  }

  // 4. Second pass: news, forum and stage channels now exist as their real types.
  await ensureChannels(2);
  const ch = new Map(channels.filter((c) => c.type !== T.CATEGORY).map((c) => [c.name, c]));

  // 5. Pinned guide posts, one per channel, updated in place on rerun.
  for (const [name, embeds] of Object.entries(MESSAGES)) {
    const c = ch.get(name); if (!c) continue;
    const recent = await api('GET', `/channels/${c.id}/messages?limit=50`);
    const mine = recent.find((m) => m.author?.id === me.id && m.embeds?.some((e) => e.footer?.text?.endsWith(MARK)));
    const payload = { embeds: embeds.map((e) => embedFor(e, ch)), allowed_mentions: { parse: [] } };
    if (mine) {
      await api('PATCH', `/channels/${c.id}/messages/${mine.id}`, payload);
    } else {
      const m = await api('POST', `/channels/${c.id}/messages`, payload);
      await api('PUT', `/channels/${c.id}/pins/${m.id}`).catch(() => {});
      log(`+ post in #${name}`);
    }
  }

  // 6. AutoMod. Blocks the obvious and reports to #mod-log.
  const alert = { type: 2, metadata: { channel_id: ch.get('mod-log').id } };
  const block = (msg) => ({ type: 1, metadata: { custom_message: msg } });
  const exempt = [TEAM, MOD].filter(Boolean);
  const RULES = [
    { name: 'Apple: slurs, sexual content, profanity', event_type: 1, trigger_type: 4, trigger_metadata: { presets: [1, 2, 3] }, actions: [block('That message was blocked by the server filter.'), alert], exempt_roles: exempt },
    { name: 'Apple: spam', event_type: 1, trigger_type: 3, actions: [block('That looked like spam.'), alert], exempt_roles: exempt },
    { name: 'Apple: mass mentions', event_type: 1, trigger_type: 5, trigger_metadata: { mention_total_limit: 5, mention_raid_protection_enabled: true }, actions: [block('Too many mentions in one message.'), alert, { type: 3, metadata: { duration_seconds: 600 } }], exempt_roles: exempt },
    { name: 'Apple: scams and other servers', event_type: 1, trigger_type: 1, trigger_metadata: {
      keyword_filter: ['free robux*', '*robux generator*', 'free nitro*', '*nitro giveaway*', '*steamcommunity.ru*', '*discord-gift*', '*dlscord*', '*roblox-login*', '*rbx-free*'],
      regex_patterns: ['discord(app)?\\.(gg|com/invite)/[A-Za-z0-9-]+'],
      allow_list: ['discord.gg/APPLE_INVITE', 'discord.com/invite/APPLE_INVITE'],
    }, actions: [block('Links to other servers and "free Robux" offers are not allowed here.'), alert], exempt_roles: exempt },
  ];
  const existingRules = await api('GET', `/guilds/${GUILD}/auto-moderation/rules`);

  // 7. Invite (permanent) — needed before the invite-link rule can exempt it.
  const invites = await api('GET', `/guilds/${GUILD}/invites`);
  let invite = invites.find((i) => i.max_age === 0 && i.max_uses === 0 && i.channel?.id === ch.get('welcome').id && i.inviter?.id === me.id);
  if (!invite) { invite = await api('POST', `/channels/${ch.get('welcome').id}/invites`, { max_age: 0, max_uses: 0, unique: false }); log('+ permanent invite'); }
  for (const r of RULES) {
    if (r.trigger_metadata?.allow_list) r.trigger_metadata.allow_list = r.trigger_metadata.allow_list.map((p) => p.replace('APPLE_INVITE', invite.code));
    const have = existingRules.find((x) => x.name === r.name);
    // A server allows one mention-spam rule and Community servers ship Discord's own
    // "Block Mention Spam", which a bot cannot edit (404). It does the same job; keep it.
    if (!have && r.trigger_type === 5 && existingRules.some((x) => x.trigger_type === 5)) continue;
    try {
      if (have) await api('PATCH', `/guilds/${GUILD}/auto-moderation/rules/${have.id}`, { ...r, enabled: true });
      else { await api('POST', `/guilds/${GUILD}/auto-moderation/rules`, { ...r, enabled: true }); log(`+ automod ${r.name}`); }
    } catch (e) { log(`! automod ${r.name}: ${e.message}`); }
  }

  // 8. Webhooks — URLs go to .env only.
  for (const [chanName, hookName, envKey] of WEBHOOKS) {
    const c = ch.get(chanName); if (!c) continue;
    const hooks = await api('GET', `/channels/${c.id}/webhooks`);
    let hook = hooks.find((h) => h.name === hookName);
    if (!hook) {
      hook = await api('POST', `/channels/${c.id}/webhooks`, { name: hookName, avatar: `data:image/png;base64,${icon}` });
      log(`+ webhook ${hookName} -> #${chanName}`);
    }
    upsertEnv(envKey, `https://discord.com/api/webhooks/${hook.id}/${hook.token}`);
  }

  // 9. Welcome screen, widget, onboarding.
  const W = (name, description, emoji) => ({ channel_id: ch.get(name).id, description, emoji_name: emoji });
  await api('PATCH', `/guilds/${GUILD}/welcome-screen`, {
    enabled: true,
    description: 'Apple builds Roblox games from a sentence. Start here:',
    welcome_channels: [
      W('welcome', 'What Apple is and how to start', '🍎'),
      W('rules', 'Read the rules', '📜'),
      W('help', 'Get help from the team and community', '🛟'),
      W('showcase', 'Show what you built', '🔥'),
      W('ask-apple', 'Build from Discord with /build', '🤖'),
    ],
  }).catch((e) => log('! welcome screen:', e.message));
  await api('PATCH', `/guilds/${GUILD}/widget`, { enabled: true, channel_id: ch.get('welcome').id }).catch((e) => log('! widget:', e.message));

  // Onboarding prompts and options need ids; reuse the live ones (matched by title) so a rerun edits
  // in place, and mint snowflake-shaped ids for new ones.
  const live = await api('GET', `/guilds/${GUILD}/onboarding`).catch(() => ({ prompts: [] }));
  const liveOpts = new Map(live.prompts.flatMap((p) => p.options.map((o) => [`${p.title}|${o.title}`, o.id])));
  const livePrompts = new Map(live.prompts.map((p) => [p.title, p.id]));
  let seq = 0n;
  const mint = () => String(((BigInt(Date.now()) - 1420070400000n) << 22n) + seq++);
  let promptTitle = '';
  const opt = (title, description, emoji, roleNames = [], channelNames = []) => ({
    id: liveOpts.get(`${promptTitle}|${title}`) ?? mint(),
    title, description, emoji: { name: emoji },
    role_ids: roleNames.map(R).filter(Boolean), channel_ids: channelNames.map((n) => ch.get(n)?.id).filter(Boolean),
  });
  const onboarding = {
    enabled: true,
    mode: 0,
    default_channel_ids: ['welcome', 'rules', 'announcements', 'faq', 'general', 'introductions', 'showcase', 'ask-apple', 'help', 'changelog'].map((n) => ch.get(n)?.id).filter(Boolean),
    prompts: [
      { type: 0, title: (promptTitle = 'What do you do on Roblox?'), single_select: false, required: false, in_onboarding: true, options: [
        opt('Scripting', 'Luau, systems, game logic', '📜', ['Scripter'], ['roblox-dev-chat']),
        opt('Building', 'Maps, props, terrain', '🧱', ['Builder'], ['roblox-dev-chat']),
        opt('UI design', 'Menus, HUDs, shops', '🎨', ['UI Designer'], ['ui-library']),
        opt('3D modeling', 'Meshes and assets', '🧊', ['3D Modeler']),
        opt('VFX', 'Particles, beams, effects', '✨', ['VFX Artist']),
        opt('I am new', 'Just getting started with Roblox dev', '🌱', ['New to Roblox Dev'], ['faq', 'plugin-setup']),
      ] },
      { type: 0, title: (promptTitle = 'Which pings do you want?'), single_select: false, required: false, in_onboarding: true, options: [
        opt('Announcements', 'Big news about Apple', '📣', ['Announcements Ping']),
        opt('Releases', 'Every new version of the site, plugin and models', '🚀', ['Updates Ping'], ['changelog', 'model-updates']),
        opt('Events', 'Live demos and build jams', '🎉', ['Events Ping'], ['Apple Live']),
      ] },
      { type: 0, title: (promptTitle = 'Want to test new features early?'), single_select: true, required: false, in_onboarding: true, options: [
        opt('Yes, make me a Beta Tester', 'Try features before everyone else and report bugs', '🧪', ['Beta Tester'], ['bug-reports', 'feature-requests']),
        opt('Not now', 'You can change this later in Channels & Roles', '👌', [], ['general']),
      ] },
    ],
  };
  onboarding.prompts.forEach((p) => { p.id = livePrompts.get(p.title) ?? mint(); });
  await api('PUT', `/guilds/${GUILD}/onboarding`, onboarding).then(() => log('~ onboarding')).catch((e) => log('! onboarding:', e.message));

  // 10. The owner gets the team role (cosmetic: the owner already has every permission).
  if (guild.owner_id && TEAM) await api('PUT', `/guilds/${GUILD}/members/${guild.owner_id}/roles/${TEAM}`, undefined, { reason: 'server owner' }).catch(() => {});

  // 11. Custom emoji.
  const emojis = await api('GET', `/guilds/${GUILD}/emojis`);
  if (!emojis.find((e) => e.name === 'apple_ai')) {
    await api('POST', `/guilds/${GUILD}/emojis`, { name: 'apple_ai', image: `data:image/png;base64,${icon}` }).then(() => log('+ emoji :apple_ai:')).catch((e) => log('! emoji:', e.message));
  }

  upsertEnv('DISCORD_GUILD_ID', GUILD);
  upsertEnv('DISCORD_INVITE_URL', `https://discord.gg/${invite.code}`);
  const final = await api('GET', `/guilds/${GUILD}?with_counts=true`);
  const finalCh = await api('GET', `/guilds/${GUILD}/channels`);
  log(JSON.stringify({ name: final.name, community: final.features.includes('COMMUNITY'), features: final.features, channels: finalCh.length, roles: final.roles.length, invite: `https://discord.gg/${invite.code}`, apiCalls: calls }));
}

main().catch((e) => { console.error(e.message); process.exit(1); });
