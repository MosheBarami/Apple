// Apple on Discord: an HTTP-interactions bot, not a gateway bot.
//
// WHY HTTP AND NOT A GATEWAY. A gateway bot holds an open WebSocket to Discord forever, which
// needs a process that never stops. This product has no such process — it is a Worker plus Durable
// Objects — and adding one would be a second runtime to deploy, watch and pay for. Discord's
// interactions endpoint is just a webhook: Discord POSTs a signed request, we answer it. Nothing
// long-lived, nothing new to operate.
//
// WHAT THAT COSTS, STATED HONESTLY. An HTTP bot cannot read ordinary chat messages and cannot
// speak unprompted. Every command below therefore starts with the user invoking it. Progress on a
// long build is pushed by editing OUR OWN reply (see DiscordDO), which is the only channel an
// interaction gives us — and that channel closes 15 minutes after the command.
//
// THE THREE-SECOND WALL. Discord kills an interaction that is not answered within three seconds.
// A build takes minutes. So `/build` answers with a DEFERRED response (type 5) — a loading state —
// and the message is edited afterwards. Everything else here answers immediately.
import type { QuotaState, RunSnapshot } from '@golem/shared';

// ---------------------------------------------------------------- wire constants
// Values are Discord's, not ours. Named so a reader does not have to remember what 5 means.

export const INTERACTION = { PING: 1, APPLICATION_COMMAND: 2 } as const;
export const CALLBACK = { PONG: 1, MESSAGE: 4, DEFERRED_MESSAGE: 5 } as const;
/** MessageFlags.EPHEMERAL — only the invoker sees it. */
export const EPHEMERAL = 64;
/** Discord rejects a message body longer than this. */
export const MAX_CONTENT = 2000;
export const DISCORD_API = 'https://discord.com/api/v10';

/**
 * How stale a signed request may be.
 *
 * Discord does not retry interactions, so nothing legitimate arrives late. Without a window, a
 * request captured off the wire stays valid forever and can be replayed to spend somebody's
 * credits again — the interaction token would be dead, so the user would never see the reply, but
 * the build would still run and still be charged. Five minutes is the same tolerance the Stripe
 * webhook uses, and is far wider than any real clock skew.
 */
export const TIMESTAMP_TOLERANCE_S = 300;

export type Verdict = { ok: true } | { ok: false; reason: string };

function fromHex(s: string): Uint8Array | null {
  if (s.length === 0 || s.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(s)) return null;
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Is this request really from Discord?
 *
 * Discord signs `timestamp + rawBody` with Ed25519 and sends the signature hex in
 * `X-Signature-Ed25519`. The public key is the one shown on the application's page in the
 * developer portal. Discord will not even accept an endpoint URL that fails to refuse a
 * deliberately bad signature, so this is not optional decoration — it IS the authentication.
 *
 * Every failure path returns a reason for the log and nothing for the caller: a response that
 * explains which half of a forgery was wrong is an oracle for making a better one.
 */
export async function verifyDiscordSignature(
  rawBody: string,
  signatureHex: string | null,
  timestamp: string | null,
  publicKeyHex: string,
  nowSeconds: number,
): Promise<Verdict> {
  if (!signatureHex) return { ok: false, reason: 'no signature header' };
  if (!timestamp || !/^\d{1,15}$/.test(timestamp)) return { ok: false, reason: 'no usable timestamp header' };
  const age = Math.abs(nowSeconds - Number(timestamp));
  if (age > TIMESTAMP_TOLERANCE_S) return { ok: false, reason: `timestamp outside tolerance (${age}s)` };

  const sig = fromHex(signatureHex);
  if (!sig || sig.length !== 64) return { ok: false, reason: 'signature is not 64 bytes of hex' };
  const key = fromHex(publicKeyHex ?? '');
  if (!key || key.length !== 32) return { ok: false, reason: 'public key is not 32 bytes of hex' };

  let pub: CryptoKey;
  try {
    pub = await crypto.subtle.importKey('raw', key, { name: 'Ed25519' }, false, ['verify']);
  } catch {
    return { ok: false, reason: 'public key could not be imported' };
  }
  const signed = new TextEncoder().encode(`${timestamp}${rawBody}`);
  const ok = await crypto.subtle.verify('Ed25519', pub, sig, signed).catch(() => false);
  return ok ? { ok: true } : { ok: false, reason: 'signature mismatch' };
}

// ---------------------------------------------------------------- the link

/**
 * A Discord user bound to one Apple project.
 *
 * Deliberately a project and not just an account. A Discord interaction carries no Supabase JWT,
 * so the worker cannot ask Supabase "which projects does this person own?" — every read there goes
 * through the user's own token so that row-level security applies. Resolving a project name inside
 * a Discord command would mean reading projects with a service key and trusting our own filter,
 * which is precisely the check RLS exists to make unnecessary. Binding the project AT MINT TIME,
 * where a real JWT exists and ownership is verified, keeps that guarantee intact.
 */
export interface LinkRecord {
  discordUserId: string;
  appleUserId: string;
  projectId: string;
  projectName: string;
  linkedAt: number;
}

export type RedeemResult =
  | { ok: true; link: LinkRecord; replaced: LinkRecord | null }
  | { ok: false; reason: 'invalid' | 'throttled' };

/**
 * Everything a command needs from the rest of the product, as functions.
 *
 * Injected rather than imported so the command layer can be tested for what it SAYS without a
 * Durable Object, a network, or a Discord application that does not exist yet.
 */
export interface DiscordPorts {
  redeemLinkCode(discordUserId: string, code: string): Promise<RedeemResult>;
  removeLink(discordUserId: string): Promise<boolean>;
  findLink(discordUserId: string): Promise<LinkRecord | null>;
  quota(appleUserId: string): Promise<QuotaState | null>;
  projectHealth(projectId: string): Promise<{ agentStatus: string; pluginConnected: boolean } | null>;
  run(projectId: string): Promise<RunSnapshot | null>;
  startBuild(projectId: string, prompt: string): Promise<{ ok: true } | { ok: false; error: string }>;
  /** Register this interaction so progress can be pushed onto it until the run ends. */
  watchRun(link: LinkRecord, applicationId: string, token: string): Promise<void>;
  projectUrl(projectId: string): string;
}

// ---------------------------------------------------------------- responses

export interface InteractionResponse {
  type: number;
  data?: { content?: string; flags?: number; allowed_mentions?: { parse: never[] } };
}

/**
 * Nothing this bot says may mention anyone.
 *
 * Every reply echoes text the user typed — a prompt, a project name. With no `allowed_mentions`,
 * Discord parses mentions out of whatever we send, so `@everyone` inside a build prompt becomes a
 * ping issued by Apple. An empty `parse` list turns every mention in our output back into plain
 * text, which is the only safe default for content we did not write.
 */
export const NO_MENTIONS = { parse: [] as never[] };

/**
 * Every reply is ephemeral. Credits, run progress and which project somebody is building are
 * account facts, and a slash command typed in a public channel must not publish them to it.
 */
export function say(content: string): InteractionResponse {
  return {
    type: CALLBACK.MESSAGE,
    data: { content: content.slice(0, MAX_CONTENT), flags: EPHEMERAL, allowed_mentions: NO_MENTIONS },
  };
}

export function thinking(): InteractionResponse {
  return { type: CALLBACK.DEFERRED_MESSAGE, data: { flags: EPHEMERAL } };
}

/** One line describing where a run has got to, shared by `/status` and the progress pusher. */
export function progressLine(run: RunSnapshot | null): string {
  if (!run) return 'Nothing is building right now.';
  const phase = run.phase.replace(/_/g, ' ');
  const tools = run.tools.length;
  return `Building — ${phase}, step ${run.step} of ${run.totalSteps}, ${tools} ${tools === 1 ? 'action' : 'actions'} so far.`;
}

// ---------------------------------------------------------------- commands

/**
 * The command set, in the exact shape `PUT /applications/{id}/commands` wants.
 *
 * Registered by POST /api/admin/discord/register-commands, which is the only thing the bot token
 * is used for. Everything else Discord needs is authenticated by the interaction itself.
 */
export const COMMANDS = [
  {
    name: 'link',
    type: 1,
    description: 'Connect this Discord account to one of your Apple projects.',
    options: [
      { type: 3, name: 'code', description: 'The code from your project page in Apple.', required: true, min_length: 4, max_length: 16 },
    ],
  },
  { name: 'unlink', type: 1, description: 'Disconnect this Discord account from Apple.' },
  {
    name: 'build',
    type: 1,
    description: 'Ask Apple to build something in your linked project.',
    options: [{ type: 3, name: 'prompt', description: 'What should Apple build?', required: true, min_length: 3, max_length: 800 }],
  },
  { name: 'status', type: 1, description: 'How is the current build going?' },
  { name: 'credits', type: 1, description: 'How many Credits do you have left?' },
] as const;

export const COMMAND_NAMES = COMMANDS.map((c) => c.name);

interface Interaction {
  type?: number;
  application_id?: string;
  token?: string;
  data?: { name?: string; options?: { name?: string; value?: unknown }[] };
  member?: { user?: { id?: string } };
  user?: { id?: string };
}

/** The invoking user's id. In a guild it arrives under `member`; in a DM with the bot, under `user`. */
function invokerId(i: Interaction): string | null {
  const id = i.member?.user?.id ?? i.user?.id;
  return typeof id === 'string' && /^\d{1,32}$/.test(id) ? id : null;
}

function optionString(i: Interaction, name: string): string {
  const v = i.data?.options?.find((o) => o.name === name)?.value;
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * What a handled interaction produces.
 *
 * `deferred` exists only for `/build`. It runs AFTER the loading state has been returned to
 * Discord, so the three-second wall is met even when starting a run is slow, and an error that
 * only becomes knowable at that point is delivered by editing the loading message.
 */
export interface Outcome {
  status: number;
  body: unknown;
  deferred?: (edit: (content: string) => Promise<void>) => Promise<void>;
  /** Where a deferred reply lives, so the caller can edit the loading message it left behind. */
  reply?: { applicationId: string; token: string };
}

/**
 * The only instruction an unlinked user ever gets — and it describes a screen that lives in another
 * app. Every bolded word is something the reader will hunt for by that exact name, so
 * discord-commands.test.mjs checks each one against the settings screen's own source. It used to
 * say "open your project and click Connect Discord": there is no such button, and never was. The
 * control is in Settings, not on a project, and it is called "Get a code". A message naming a
 * button nobody can find is indistinguishable, from the user's side, from a bot that is broken.
 */
const NOT_LINKED =
  'This Discord account is not connected to Apple yet.\n' +
  'In Apple, open **Settings** → **Connections** → **Discord**, choose your project and press ' +
  '**Get a code**. Then run `/link` here with the code it shows. Codes last 10 minutes.';

export async function handleInteraction(raw: unknown, ports: DiscordPorts): Promise<Outcome> {
  const i = (raw ?? {}) as Interaction;

  if (i.type === INTERACTION.PING) return { status: 200, body: { type: CALLBACK.PONG } };
  if (i.type !== INTERACTION.APPLICATION_COMMAND) {
    return { status: 200, body: say('Apple does not know what to do with that.') };
  }

  const discordUserId = invokerId(i);
  if (!discordUserId) return { status: 200, body: say('Apple could not tell who you are on Discord.') };
  const name = i.data?.name ?? '';

  if (name === 'link') {
    const code = optionString(i, 'code');
    const res = await ports.redeemLinkCode(discordUserId, code);
    if (!res.ok) {
      // The two refusals read differently on purpose: one is "wrong code", the other is "stop
      // guessing". Collapsing them would hide the fact that guessing is being counted.
      return {
        status: 200,
        body: say(
          res.reason === 'throttled'
            ? 'Too many wrong codes. Wait a few minutes and try again.'
            : 'That code is not valid, or it has already been used, or it has expired. Codes last 10 minutes.',
        ),
      };
    }
    const swapped = res.replaced && res.replaced.projectId !== res.link.projectId
      ? `\nThis replaced your previous link to **${res.replaced.projectName}**.`
      : '';
    return {
      status: 200,
      body: say(`Connected to **${res.link.projectName}**. \`/build\` will build in that project.${swapped}`),
    };
  }

  if (name === 'unlink') {
    const removed = await ports.removeLink(discordUserId);
    return {
      status: 200,
      body: say(removed ? 'Disconnected. Apple will not act on commands from this Discord account.' : 'This Discord account was not connected to anything.'),
    };
  }

  const link = await ports.findLink(discordUserId);
  if (!link) return { status: 200, body: say(NOT_LINKED) };

  if (name === 'credits') {
    const q = await ports.quota(link.appleUserId);
    if (!q) return { status: 200, body: say('Apple could not read your balance just now. Try again in a moment.') };
    return {
      status: 200,
      body: say(
        `**${q.creditsRemaining} Credits** left — ${q.allowanceRemaining} from today's ${q.plan} allowance` +
          `${q.credits > 0 ? `, plus ${q.credits} purchased` : ''}.\nToday's allowance refills ${friendlyReset(q.resetsAtIso)}.`,
      ),
    };
  }

  if (name === 'status') {
    // A null health is a FAILURE TO LOOK, and a null run means "idle" only once looking succeeded.
    // Both arrive as null from the same okJson, so the unreachable case is separated here or not at
    // all — otherwise `/status` answers "Nothing is building right now" about a project it never
    // reached, and the user runs `/build` on top of a live run they were told did not exist.
    const health = await ports.projectHealth(link.projectId);
    if (!health) {
      return {
        status: 200,
        body: say(
          `**${link.projectName}** — Apple could not reach this project just now, so it cannot say whether anything is building.\nTry again in a moment: ${ports.projectUrl(link.projectId)}`,
        ),
      };
    }
    const run = await ports.run(link.projectId);
    const studio = health.pluginConnected ? '' : '\nStudio is not connected right now.';
    return { status: 200, body: say(`**${link.projectName}** — ${progressLine(run)}${studio}\n${ports.projectUrl(link.projectId)}`) };
  }

  if (name === 'build') {
    const prompt = optionString(i, 'prompt');
    if (!prompt) return { status: 200, body: say('Tell Apple what to build, for example `/build prompt: a lava obby with 6 stages`.') };
    const applicationId = typeof i.application_id === 'string' ? i.application_id : '';
    const token = typeof i.token === 'string' ? i.token : '';

    return {
      status: 200,
      body: thinking(),
      reply: { applicationId, token },
      deferred: async (edit) => {
        // Refused BEFORE a Credit is spent rather than after: a build with no Studio attached burns
        // the allowance producing changes that have nowhere to land.
        // A null health is a FAILURE TO LOOK, and `health && …` quietly promotes it to consent:
        // both refusals below are skipped and the run starts anyway — with no Studio to land in,
        // or on top of a live run — having spent the Credit either way. /status already draws this
        // distinction; it matters more here, where being wrong costs money rather than a sentence.
        const health = await ports.projectHealth(link.projectId);
        if (!health) {
          await edit(
            `**${link.projectName}** — Apple could not reach this project, so it cannot tell whether Studio is attached or whether a build is already running. Nothing was started.\nTry again in a moment: ${ports.projectUrl(link.projectId)}`,
          );
          return;
        }
        if (!health.pluginConnected) {
          await edit(`**${link.projectName}** — Roblox Studio is not connected, so there is nothing to build into.\nOpen Studio with the Apple plugin, then try again.`);
          return;
        }
        if (health.agentStatus === 'running') {
          await edit(`**${link.projectName}** is already building. \`/status\` will tell you how far along it is.`);
          return;
        }
        const started = await ports.startBuild(link.projectId, prompt);
        if (!started.ok) {
          await edit(`Apple could not start that build: ${started.error}`);
          return;
        }
        // The loading message is now owned by the progress pusher, which edits it as the run moves
        // and has a lifetime that outlives this request.
        await ports.watchRun(link, applicationId, token);
        await edit(`**${link.projectName}** — starting: ${prompt.slice(0, 300)}`);
      },
    };
  }

  return { status: 200, body: say(`Apple has no \`/${name.slice(0, 40)}\` command.`) };
}

function friendlyReset(iso: string): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return 'soon';
  const hours = Math.max(0, Math.round((at - Date.now()) / 3600_000));
  if (hours < 1) return 'within the hour';
  return `in about ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

// ---------------------------------------------------------------- the endpoint

/**
 * The whole endpoint, verification first.
 *
 * The ORDER is the security property. Read the raw body, verify it, and only then parse and
 * dispatch — parsing first would mean a forged payload had already been interpreted, and
 * re-serialising parsed JSON changes bytes so the signature could never match again.
 */
export async function handleDiscordRequest(
  req: Request,
  opts: { publicKeyHex: string | undefined; ports: DiscordPorts; nowSeconds?: number },
): Promise<Outcome> {
  // No key configured is a refusal, never "unverified but probably fine". Unverified, this
  // endpoint is a public button that spends other people's credits.
  if (!opts.publicKeyHex) return { status: 503, body: { error: 'discord is not configured' } };

  const rawBody = await req.text();
  const verdict = await verifyDiscordSignature(
    rawBody,
    req.headers.get('X-Signature-Ed25519'),
    req.headers.get('X-Signature-Timestamp'),
    opts.publicKeyHex,
    opts.nowSeconds ?? Math.floor(Date.now() / 1000),
  );
  if (!verdict.ok) {
    console.warn('discord interaction rejected:', verdict.reason);
    return { status: 401, body: { error: 'invalid request signature' } };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: 'invalid json' } };
  }
  return handleInteraction(payload, opts.ports);
}

/**
 * Edit the message a deferred response left loading.
 *
 * Authenticated by the interaction token in the URL — the bot token is NOT used and must not be:
 * this call is made from a background alarm that has no business holding it.
 */
export async function editOriginal(applicationId: string, token: string, content: string): Promise<boolean> {
  const res = await fetch(`${DISCORD_API}/webhooks/${applicationId}/${token}/messages/@original`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: content.slice(0, MAX_CONTENT), allowed_mentions: NO_MENTIONS }),
  }).catch(() => null);
  return !!res && res.ok;
}

/**
 * Publish the command list to Discord.
 *
 * The application id is READ FROM DISCORD rather than configured, so the owner has one fewer
 * value to copy correctly. A bot token identifies exactly one application; asking which one is
 * cheaper than asking a person to paste an 18-digit number.
 */
export async function registerCommands(botToken: string): Promise<{ ok: true; names: string[] } | { ok: false; status: number; detail: string }> {
  const auth = { authorization: `Bot ${botToken}`, 'content-type': 'application/json' };
  const who = await fetch(`${DISCORD_API}/applications/@me`, { headers: auth }).catch(() => null);
  if (!who || !who.ok) return { ok: false, status: who?.status ?? 0, detail: 'the bot token was refused' };
  const app = (await who.json().catch(() => null)) as { id?: string } | null;
  if (!app?.id) return { ok: false, status: 502, detail: 'discord did not say which application this token belongs to' };

  const res = await fetch(`${DISCORD_API}/applications/${app.id}/commands`, {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify(COMMANDS),
  }).catch(() => null);
  if (!res || !res.ok) {
    return { ok: false, status: res?.status ?? 0, detail: (await res?.text().catch(() => ''))?.slice(0, 400) ?? 'no response' };
  }
  return { ok: true, names: [...COMMAND_NAMES] };
}
