// DiscordDO — singleton. Who on Discord may spend which Apple account, and the progress pusher.
//
// THE SECURITY QUESTION THIS OBJECT ANSWERS: a Discord user id is just a number in a webhook body.
// Before any command can spend an account's Credits, that Discord user must have PROVED they own
// the Apple account. The proof is a code that only a signed-in owner of the account can mint:
//
//   1. Signed in to Apple, on a project you own, you press Connect Discord. The worker checks
//      ownership with YOUR Supabase token (row-level security, same as everywhere else) and asks
//      this object for a code. The code exists for 10 minutes and can be used once.
//   2. In Discord you run `/link code:…`. Discord signs that interaction, so the Discord user id
//      on it is Discord's claim, not the caller's. Presenting the code proves the other half.
//
// The direction matters and is not interchangeable. The AUTHENTICATED side mints the secret and
// the UNAUTHENTICATED side presents it, so redeeming a code is evidence of having been signed in
// to that account. Minting in Discord and redeeming in Apple would prove nothing about the Discord
// user at all — it would only prove that somebody could read a code somebody else sent them.
//
// Guessing is bounded rather than merely unlikely: wrong codes are counted per Discord user and
// five of them inside the window stops that user trying. Against 31^8 codes with a ten-minute life
// that is already hopeless; the counter is there so the bound is a fact rather than an estimate.
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import type { LinkRecord, RedeemResult } from '../discord';
import { editOriginal, progressLine } from '../discord';
import type { RunSnapshot } from '@golem/shared';

const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_LEN = 8;
const MAX_ACTIVE_CODES = 5;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no confusable characters

const FAIL_WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 5;

/**
 * An interaction token dies 15 minutes after the command. We stop a minute early rather than
 * discovering the deadline by having an edit rejected — a build that outlives the window is told
 * so, with a link, instead of going quiet.
 */
const WATCH_TTL_MS = 14 * 60 * 1000;
/** How often the pusher looks at the run. Edits happen only when the line actually changes. */
const WATCH_TICK_MS = 5_000;
/** A run that never becomes visible at all is given this long before the watch gives up. */
const WATCH_GRACE_MS = 45_000;

interface CodeRow {
  appleUserId: string;
  projectId: string;
  projectName: string;
  createdAt: number;
}

interface WatchRow {
  projectId: string;
  applicationId: string;
  token: string;
  startedAt: number;
  lastLine: string;
  sawRun: boolean;
  projectName: string;
  projectUrl: string;
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function normaliseCode(raw: unknown): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 16);
}

export class DiscordDO extends DurableObject<Env> {
  // ------------------------------------------------------------------ alarm

  /**
   * One alarm serves two jobs: pushing progress, and expiring codes. It is set to whichever comes
   * first, and to nothing at all when there is neither — an object with no work must not keep
   * waking up, because a self-renewing alarm is a bill that never stops.
   */
  private async reschedule(): Promise<void> {
    const watches = await this.ctx.storage.list<WatchRow>({ prefix: 'watch:' });
    if (watches.size > 0) {
      await this.ctx.storage.setAlarm(Date.now() + WATCH_TICK_MS);
      return;
    }
    const codes = await this.ctx.storage.list<CodeRow>({ prefix: 'code:' });
    let soonest = Infinity;
    for (const [, row] of codes) soonest = Math.min(soonest, row.createdAt + CODE_TTL_MS);
    if (Number.isFinite(soonest)) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1000, soonest + 1000));
    else await this.ctx.storage.deleteAlarm();
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    for (const [key, row] of await this.ctx.storage.list<CodeRow>({ prefix: 'code:' })) {
      if (now - row.createdAt > CODE_TTL_MS) await this.ctx.storage.delete(key);
    }
    for (const [key, row] of await this.ctx.storage.list<{ at: number }>({ prefix: 'fail:' })) {
      if (now - row.at > FAIL_WINDOW_MS) await this.ctx.storage.delete(key);
    }
    for (const [key, watch] of await this.ctx.storage.list<WatchRow>({ prefix: 'watch:' })) {
      const done = await this.tick(watch, now);
      if (done) await this.ctx.storage.delete(key);
      else await this.ctx.storage.put(key, watch);
    }
    await this.reschedule();
  }

  /** Advance one watched run. Returns true when the watch is finished with. */
  private async tick(watch: WatchRow, now: number): Promise<boolean> {
    if (now - watch.startedAt > WATCH_TTL_MS) {
      await editOriginal(
        watch.applicationId,
        watch.token,
        `**${watch.projectName}** is still building — Discord stops letting Apple update this message after 15 minutes.\nFollow it here: ${watch.projectUrl}`,
      );
      return true;
    }

    const run = await this.runSnapshot(watch.projectId);
    if (!run) {
      // Either it has finished, or it has not become visible yet. Those are different and must not
      // be reported as the same thing: announcing "finished" for a run that never started is the
      // failure-to-observe dressed up as an observation.
      if (!watch.sawRun) {
        if (now - watch.startedAt < WATCH_GRACE_MS) return false;
        await editOriginal(
          watch.applicationId,
          watch.token,
          `**${watch.projectName}** — Apple could not see that build start. Open the project to check: ${watch.projectUrl}`,
        );
        return true;
      }
      await editOriginal(watch.applicationId, watch.token, `**${watch.projectName}** — build finished.\n${watch.projectUrl}`);
      return true;
    }

    watch.sawRun = true;
    const line = `**${watch.projectName}** — ${progressLine(run)}`;
    if (line === watch.lastLine) return false; // nothing changed; do not spend a Discord edit
    watch.lastLine = line;
    await editOriginal(watch.applicationId, watch.token, `${line}\n${watch.projectUrl}`);
    return false;
  }

  private async runSnapshot(projectId: string): Promise<RunSnapshot | null> {
    const stub = this.env.SESSION_DO.get(this.env.SESSION_DO.idFromName(projectId));
    const res = await stub.fetch('https://do/run-state').catch(() => null);
    if (!res || !res.ok) return null;
    const body = (await res.json().catch(() => null)) as { run?: RunSnapshot | null } | null;
    return body?.run ?? null;
  }

  // ------------------------------------------------------------------ fetch

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    // -------------------------------------------------------------- minting
    if (path === '/mint' && req.method === 'POST') {
      const body = (await req.json()) as { appleUserId: string; projectId: string; projectName: string };
      const now = Date.now();
      let active = 0;
      for (const [key, row] of await this.ctx.storage.list<CodeRow>({ prefix: 'code:' })) {
        if (now - row.createdAt > CODE_TTL_MS) await this.ctx.storage.delete(key);
        else if (row.appleUserId === body.appleUserId) active++;
      }
      if (active >= MAX_ACTIVE_CODES) return json({ error: 'too many active codes' }, 429);

      const bytes = crypto.getRandomValues(new Uint8Array(CODE_LEN));
      const code = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
      await this.ctx.storage.put(`code:${code}`, {
        appleUserId: body.appleUserId,
        projectId: body.projectId,
        projectName: body.projectName,
        createdAt: now,
      } satisfies CodeRow);
      await this.reschedule();
      return json({ code, expiresAtIso: new Date(now + CODE_TTL_MS).toISOString() });
    }

    // ------------------------------------------------------------ redeeming
    if (path === '/redeem' && req.method === 'POST') {
      const { discordUserId, code } = (await req.json()) as { discordUserId: string; code: unknown };
      const now = Date.now();

      const failKey = `fail:${discordUserId}`;
      const fails = (await this.ctx.storage.get<{ n: number; at: number }>(failKey)) ?? { n: 0, at: now };
      const windowLive = now - fails.at <= FAIL_WINDOW_MS;
      if (windowLive && fails.n >= MAX_FAILS) return json({ ok: false, reason: 'throttled' } satisfies RedeemResult);

      const key = `code:${normaliseCode(code)}`;
      const row = await this.ctx.storage.get<CodeRow>(key);
      if (!row || now - row.createdAt > CODE_TTL_MS) {
        await this.ctx.storage.put(failKey, windowLive ? { n: fails.n + 1, at: fails.at } : { n: 1, at: now });
        if (row) await this.ctx.storage.delete(key);
        return json({ ok: false, reason: 'invalid' } satisfies RedeemResult);
      }
      await this.ctx.storage.delete(key); // single use, consumed whether or not the rest succeeds
      await this.ctx.storage.delete(failKey);

      // One Discord account to one Apple account, in BOTH directions. Two Discord users quietly
      // sharing one balance is a billing surprise nobody consented to, and the person paying is
      // the one who would never see it.
      const replaced = (await this.ctx.storage.get<LinkRecord>(`link:${discordUserId}`)) ?? null;
      const previousHolder = await this.ctx.storage.get<string>(`owner:${row.appleUserId}`);
      if (previousHolder && previousHolder !== discordUserId) await this.ctx.storage.delete(`link:${previousHolder}`);
      if (replaced) await this.ctx.storage.delete(`owner:${replaced.appleUserId}`);

      const link: LinkRecord = {
        discordUserId,
        appleUserId: row.appleUserId,
        projectId: row.projectId,
        projectName: row.projectName,
        linkedAt: now,
      };
      await this.ctx.storage.put(`link:${discordUserId}`, link);
      await this.ctx.storage.put(`owner:${row.appleUserId}`, discordUserId);
      return json({ ok: true, link, replaced } satisfies RedeemResult);
    }

    // -------------------------------------------------------------- reading
    if (path === '/link' && req.method === 'GET') {
      const link = (await this.ctx.storage.get<LinkRecord>(`link:${url.searchParams.get('discordUserId') ?? ''}`)) ?? null;
      return json({ link });
    }

    /** What the Apple-side settings screen shows: the Discord account bound to THIS user, if any. */
    if (path === '/link-for-owner' && req.method === 'GET') {
      const holder = await this.ctx.storage.get<string>(`owner:${url.searchParams.get('appleUserId') ?? ''}`);
      const link = holder ? ((await this.ctx.storage.get<LinkRecord>(`link:${holder}`)) ?? null) : null;
      return json({ link });
    }

    // ------------------------------------------------------------- revoking
    if (path === '/unlink' && req.method === 'POST') {
      // Revocable from either end. From Discord the caller is a signed interaction; from Apple the
      // caller is a verified JWT. Neither can revoke the other's OTHER links, only this pairing.
      const { discordUserId, appleUserId } = (await req.json()) as { discordUserId?: string; appleUserId?: string };
      let holder = discordUserId ?? '';
      if (!holder && appleUserId) holder = (await this.ctx.storage.get<string>(`owner:${appleUserId}`)) ?? '';
      if (!holder) return json({ removed: false });
      const link = await this.ctx.storage.get<LinkRecord>(`link:${holder}`);
      if (!link) return json({ removed: false });
      if (appleUserId && link.appleUserId !== appleUserId) return json({ removed: false });
      await this.ctx.storage.delete(`link:${holder}`);
      await this.ctx.storage.delete(`owner:${link.appleUserId}`);
      return json({ removed: true });
    }

    // -------------------------------------------------------------- watching
    if (path === '/watch' && req.method === 'POST') {
      const body = (await req.json()) as {
        projectId: string;
        applicationId: string;
        token: string;
        projectName: string;
        projectUrl: string;
      };
      if (!body.applicationId || !body.token) return json({ ok: false, error: 'no interaction to update' }, 400);
      await this.ctx.storage.put(`watch:${body.projectId}`, {
        projectId: body.projectId,
        applicationId: body.applicationId,
        token: body.token,
        startedAt: Date.now(),
        lastLine: '',
        sawRun: false,
        projectName: body.projectName,
        projectUrl: body.projectUrl,
      } satisfies WatchRow);
      await this.reschedule();
      return json({ ok: true });
    }

    return json({ error: 'not found' }, 404);
  }
}
