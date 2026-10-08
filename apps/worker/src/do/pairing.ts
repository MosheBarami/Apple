// PairingDO - singleton. Links a Studio plugin to a project: the Studio lobby (Connect, no code) and, for one
// release, the short-lived pairing codes older plugins still claim with.
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';

//[[ THE STUDIO LOBBY: CONNECT WITHOUT A CODE.
//
//   A Studio plugin cannot listen on a port and cannot open a browser, so the web cannot reach it and
//   it cannot reach the web's tab. Both reach this object. The plugin announces itself here while it
//   waits (its install id, a per-install secret, the Roblox user signed into Studio and the place it
//   has open); the project owner presses Connect on the web; this object finds the waiting Studio that
//   belongs to that person and BINDS it to the project. The plugin's next announce (or the one it is
//   holding open) carries the binding back and the worker mints the ordinary plugin token from it.
//
//   WHO MAY BE BOUND IS DECIDED BY THE CALLER'S EVIDENCE, NEVER BY A NAME. A lobby entry is a
//   candidate for a Connect only when its Roblox user id is one of the Roblox accounts linked to the
//   person pressing Connect, or (when none matches) when it came from the same public address as their
//   browser. The pick id the web may send back from a picker is re-checked against the same rule here,
//   so a guessed pick id cannot bind somebody else's Studio.
//
//   THE SECRET IS THE CREDENTIAL. The install id is only an address. The first announce from an install
//   records the SHA-256 of its secret; every later announce must present the same secret or is refused,
//   so knowing an install id (it is never shown to the web) is not enough to collect a token.
//
//   A binding is remembered per install AND place, so reopening the same place in Studio reconnects
//   without another click, until somebody disconnects. One project has at most one bound Studio. ]]
export const LOBBY_TTL_MS = 45_000;
export const MAX_HOLD_MS = 20_000;
const MAX_LOBBY = 5000;

export interface LobbyPlace { placeId: number; gameId: number; placeName: string }
interface LobbyEntry {
  key: string;
  installId: string;
  sessionId: string;
  pickId: string;
  ip: string;
  robloxUserId: string | null;
  place: LobbyPlace;
  placeKey: string;
  connectedProjectId: string | null;
  seenAt: number;
}
export interface LobbyBinding { projectId: string; userId: string; projectName: string; boundAt: number }
export interface LobbyCandidate {
  pickId: string;
  placeName: string;
  placeId: number;
  robloxUserId: string | null;
  matchedBy: 'roblox' | 'ip';
  connectedProjectId: string | null;
}

/** Which place a binding is remembered for: the published id, or the file's name for a place never saved to Roblox. */
export function placeKey(place: LobbyPlace): string {
  return place.placeId > 0 ? `id:${place.placeId}` : `name:${place.placeName.slice(0, 100)}`;
}

const randomHex = (bytes: number) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');

interface Pairing {
  projectId: string;
  userId: string;
  projectName: string;
  createdAt: number;
}

const TTL_MS = 10 * 60 * 1000;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no confusable chars (no I, L, O, 0, 1)

/**
 * A pairing code, drawn UNIFORMLY from the alphabet.
 *
 * `ALPHABET[b % 31]` over a random byte is modulo bias: 256 = 8*31 + 8, so the first EIGHT letters
 * get one extra chance in 256. Measured over 2,000,000 bytes before this changed:
 *
 *   A +9.3%  F +9.3%  H +9.2%  G +9.2%   …   Q -3.7%  T -3.7%  S -3.9%
 *
 * A 13.5% spread, worth about 0.75 bits of the 29.7 this code carries (31^6 = 8.875e8) — an
 * attacker guessing most-likely-first is roughly 1.7x better off. That is a SMALL effect and worth
 * stating as small. It is fixed because the fix is one loop and because `/api/studio/claim` is
 * unauthenticated: a correct code is the entire credential, and it returns a projectId and a userId.
 *
 * 248 is 8*31, so every accepted byte maps to exactly 8 of the 256 values and the draw is flat.
 * Exported so the distribution can be measured directly; inline, it was unreachable from a test.
 */
export function newPairingCode(length = 6): string {
  const out: string[] = [];
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    for (const b of bytes) {
      if (b >= 248) continue; // reject the tail that does not divide evenly, rather than fold it
      out.push(ALPHABET[b % ALPHABET.length]!);
      if (out.length === length) break;
    }
  }
  return out.join('');
}

export class PairingDO extends DurableObject<Env> {
  /** Waiting Studios. Memory only: an entry lives 45 seconds and the plugin re-announces long before an eviction matters. */
  private lobby = new Map<string, LobbyEntry>();
  /** Announces being held open, by lobby key, released the moment a Connect binds that entry. */
  private waiters = new Map<string, (b: LobbyBinding | null) => void>();
  /** The clock, replaceable so the expiry tests do not have to wait 45 seconds. */
  now: () => number = () => Date.now();

  private freshEntries(): LobbyEntry[] {
    const now = this.now();
    for (const [k, e] of this.lobby) if (now - e.seenAt > LOBBY_TTL_MS) this.lobby.delete(k);
    return [...this.lobby.values()];
  }

  /** The rule a Connect is held to, used both to list candidates and to re-check a picked one. */
  private async candidates(robloxUserIds: string[], ip: string, userId: string): Promise<Array<{ e: LobbyEntry; by: 'roblox' | 'ip' }>> {
    const all = this.freshEntries();
    const byUser = all.filter((e) => e.robloxUserId !== null && robloxUserIds.includes(e.robloxUserId));
    // A linked Roblox account is the stronger evidence: when it finds anything, the address is not consulted.
    if (byUser.length) return byUser.map((e) => ({ e, by: 'roblox' as const }));
    if (!ip || ip === 'unknown') return [];
    const out: Array<{ e: LobbyEntry; by: 'ip' }> = [];
    for (const e of all) {
      if (e.ip !== ip) continue;
      // An address is weak evidence (a school, a family): a Studio already bound to ANOTHER StudPilot user is not offered.
      const held = await this.ctx.storage.get<LobbyBinding>(`bind:${e.installId}:${e.placeKey}`);
      if (held && held.userId !== userId) continue;
      out.push({ e, by: 'ip' });
    }
    return out;
  }

  private async lobbyRoute(path: string, req: Request): Promise<Response | null> {
    if (req.method !== 'POST') return null;
    if (path === '/announce') {
      const b = (await req.json().catch(() => null)) as {
        installId?: string; secretHash?: string; sessionId?: string; robloxUserId?: string | null; place?: LobbyPlace;
        ip?: string; connectedProjectId?: string | null; holdMs?: number;
      } | null;
      if (!b?.installId || !b.secretHash || !b.sessionId || !b.place) return Response.json({ error: 'bad announce' }, { status: 400 });
      const installKey = `install:${b.installId}`;
      const install = await this.ctx.storage.get<{ secretHash: string; createdAt: number }>(installKey);
      if (!install) await this.ctx.storage.put(installKey, { secretHash: b.secretHash, createdAt: this.now() });
      else if (install.secretHash !== b.secretHash) return Response.json({ error: 'this Studio install is not recognised' }, { status: 403 });
      const key = `${b.installId}:${b.sessionId}`;
      const pk = placeKey(b.place);
      const prior = this.lobby.get(key);
      if (!prior && this.freshEntries().length >= MAX_LOBBY) return Response.json({ error: 'busy, try again' }, { status: 503 });
      this.lobby.set(key, {
        key, installId: b.installId, sessionId: b.sessionId, pickId: prior?.pickId ?? randomHex(12),
        ip: b.ip ?? 'unknown', robloxUserId: b.robloxUserId ?? null, place: b.place, placeKey: pk,
        connectedProjectId: b.connectedProjectId ?? null, seenAt: this.now(),
      });
      const binding = await this.ctx.storage.get<LobbyBinding>(`bind:${b.installId}:${pk}`);
      if (binding && binding.projectId !== b.connectedProjectId) return Response.json({ bound: binding });
      // A connected plugin's announce is a heartbeat: it keeps the entry visible to Connect and is never held.
      const hold = b.connectedProjectId ? 0 : Math.max(0, Math.min(MAX_HOLD_MS, Number(b.holdMs) || 0));
      if (hold === 0) return Response.json({ bound: null });
      this.waiters.get(key)?.(null); // a newer announce from the same Studio retires the older hold
      const bound = await new Promise<LobbyBinding | null>((resolve) => {
        const done = (v: LobbyBinding | null) => {
          clearTimeout(timer);
          if (this.waiters.get(key) === done) this.waiters.delete(key);
          resolve(v);
        };
        const timer = setTimeout(() => done(null), hold);
        this.waiters.set(key, done);
      });
      return Response.json({ bound });
    }
    if (path === '/candidates') {
      const b = (await req.json().catch(() => null)) as { robloxUserIds?: string[]; ip?: string; userId?: string } | null;
      const list: LobbyCandidate[] = (await this.candidates(b?.robloxUserIds ?? [], b?.ip ?? '', b?.userId ?? '')).map(({ e, by }) => ({
        pickId: e.pickId, placeName: e.place.placeName, placeId: e.place.placeId, robloxUserId: e.robloxUserId,
        matchedBy: by, connectedProjectId: e.connectedProjectId,
      }));
      return Response.json({ candidates: list });
    }
    if (path === '/bind') {
      const b = (await req.json().catch(() => null)) as {
        pickId?: string; robloxUserIds?: string[]; ip?: string; projectId?: string; userId?: string; projectName?: string;
      } | null;
      if (!b?.pickId || !b.projectId || !b.userId) return Response.json({ error: 'bad bind' }, { status: 400 });
      // Re-checked here, not trusted from the list the web was shown: a pick id alone binds nothing.
      const hit = (await this.candidates(b.robloxUserIds ?? [], b.ip ?? '', b.userId)).find(({ e }) => e.pickId === b.pickId);
      if (!hit) return Response.json({ error: 'that Studio is no longer waiting' }, { status: 404 });
      const e = hit.e;
      const bindKey = `bind:${e.installId}:${e.placeKey}`;
      const binding: LobbyBinding = { projectId: b.projectId, userId: b.userId, projectName: b.projectName ?? 'StudPilot project', boundAt: this.now() };
      // One Studio per project: whatever this project was bound to before is forgotten.
      const projKey = `proj:${b.projectId}`;
      const oldKey = await this.ctx.storage.get<string>(projKey);
      if (oldKey && oldKey !== bindKey) await this.ctx.storage.delete(oldKey);
      // And this Studio leaves the project it served before; the caller revokes that project's token.
      const previous = await this.ctx.storage.get<LobbyBinding>(bindKey);
      const previousProjectId = previous && previous.projectId !== b.projectId ? previous.projectId : null;
      if (previousProjectId) await this.ctx.storage.delete(`proj:${previousProjectId}`);
      await this.ctx.storage.put(bindKey, binding);
      await this.ctx.storage.put(projKey, bindKey);
      this.waiters.get(e.key)?.(binding);
      return Response.json({ ok: true, placeName: e.place.placeName, placeId: e.place.placeId, previousProjectId });
    }
    if (path === '/unbind') {
      const b = (await req.json().catch(() => null)) as { projectId?: string } | null;
      if (!b?.projectId) return Response.json({ ok: true, unbound: false });
      const projKey = `proj:${b.projectId}`;
      const bindKey = await this.ctx.storage.get<string>(projKey);
      if (bindKey) { await this.ctx.storage.delete(bindKey); await this.ctx.storage.delete(projKey); }
      return Response.json({ ok: true, unbound: !!bindKey });
    }
    if (path === '/release') {
      const b = (await req.json().catch(() => null)) as { installId?: string; secretHash?: string; place?: LobbyPlace } | null;
      if (!b?.installId || !b.secretHash || !b.place) return Response.json({ error: 'bad release' }, { status: 400 });
      const install = await this.ctx.storage.get<{ secretHash: string }>(`install:${b.installId}`);
      if (!install || install.secretHash !== b.secretHash) return Response.json({ error: 'this Studio install is not recognised' }, { status: 403 });
      const bindKey = `bind:${b.installId}:${placeKey(b.place)}`;
      const binding = await this.ctx.storage.get<LobbyBinding>(bindKey);
      if (binding) { await this.ctx.storage.delete(bindKey); await this.ctx.storage.delete(`proj:${binding.projectId}`); }
      return Response.json({ ok: true, projectId: binding?.projectId ?? null });
    }
    return null;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const lobbyAnswer = await this.lobbyRoute(url.pathname, req);
    if (lobbyAnswer) return lobbyAnswer;
    if (url.pathname === '/create' && req.method === 'POST') {
      const body = (await req.json()) as Omit<Pairing, 'createdAt'>;
      const all = await this.ctx.storage.list<Pairing>({ prefix: 'code:' });
      let userCodes = 0;
      for (const [key, val] of all) {
        if (Date.now() - val.createdAt > TTL_MS) await this.ctx.storage.delete(key);
        else if (val.userId === body.userId) userCodes++;
      }
      if (userCodes >= 5) return Response.json({ error: 'too many active codes' }, { status: 429 });
      //[[ A SUPERSEDED CODE IS CANCELLED BY THE SURFACE THAT SUPERSEDED IT, NOT HERE.
      //
      //   Retiring every other live code for this project at mint time was tried and taken back
      //   out. It kills a code that a SECOND open tab is still displaying, beside a live countdown
      //   — a dialog that shows an expiry time for a credential the server has already destroyed,
      //   which is this repository's central defect wearing a clock. The dialog cancels the code
      //   it was itself holding, explicitly, before it mints a replacement: that is the one caller
      //   that knows the old code is no longer on anybody's screen. See /cancel below. ]]
      const code = newPairingCode();
      await this.ctx.storage.put(`code:${code}`, { ...body, createdAt: Date.now() } satisfies Pairing);
      await this.ctx.storage.setAlarm(Date.now() + TTL_MS + 1000);
      return Response.json({ code, expiresAtIso: new Date(Date.now() + TTL_MS).toISOString() });
    }
    if (url.pathname === '/claim' && req.method === 'POST') {
      const { code } = (await req.json()) as { code: string };
      // `(code || '').toUpperCase()` threw a 500 for any non-string — a number, an object, an array
      // — which is a crash handed to an UNAUTHENTICATED caller for a malformed body. A bad code is
      // a refusal, not an exception.
      if (typeof code !== 'string') return Response.json({ error: 'invalid or expired code' }, { status: 404 });
      const key = `code:${code.toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
      const pairing = await this.ctx.storage.get<Pairing>(key);
      if (!pairing || Date.now() - pairing.createdAt > TTL_MS) return Response.json({ error: 'invalid or expired code' }, { status: 404 });
      await this.ctx.storage.delete(key); // single use
      return Response.json(pairing);
    }
    //[[ CANCEL A CODE THAT IS NO LONGER WANTED.
    //
    //   Closing the pairing dialog did nothing to the code it had just shown: it stayed claimable
    //   for its full ten minutes, and `/api/studio/claim` is UNAUTHENTICATED, so an abandoned code
    //   on somebody's screen or in a screenshot was a live credential to a project.
    //
    //   OWNERSHIP IS CHECKED AGAINST THE MINTING USER, which is the whole security content of this
    //   route. Without it, cancel is a denial-of-service primitive: guess a code, revoke somebody
    //   else's pairing. The answer is deliberately the SAME for a code that does not exist, a code
    //   that expired, and a code belonging to another user — `{ ok: true, cancelled: false }` — so
    //   this cannot be used to test whether a code exists. That is the same reasoning that makes
    //   /claim answer one sentence for every kind of bad code. ]]
    if (url.pathname === '/cancel' && req.method === 'POST') {
      const body = (await req.json().catch(() => null)) as { code?: unknown; userId?: unknown } | null;
      const rawCode = body?.code;
      const userId = body?.userId;
      if (typeof rawCode !== 'string' || typeof userId !== 'string' || !userId) {
        return Response.json({ ok: true, cancelled: false });
      }
      const key = `code:${rawCode.toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
      const pairing = await this.ctx.storage.get<Pairing>(key);
      if (!pairing || pairing.userId !== userId) return Response.json({ ok: true, cancelled: false });
      await this.ctx.storage.delete(key);
      return Response.json({ ok: true, cancelled: true });
    }

    return Response.json({ error: 'not found' }, { status: 404 });
  }

  async alarm() {
    const all = await this.ctx.storage.list<Pairing>({ prefix: 'code:' });
    for (const [key, val] of all) {
      if (Date.now() - val.createdAt > TTL_MS) await this.ctx.storage.delete(key);
    }
  }
}
