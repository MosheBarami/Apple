// PairingDO - singleton. Short-lived codes that link a Studio plugin to a project.
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';

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
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/create' && req.method === 'POST') {
      const body = (await req.json()) as Omit<Pairing, 'createdAt'>;
      const all = await this.ctx.storage.list<Pairing>({ prefix: 'code:' });
      let userCodes = 0;
      for (const [key, val] of all) {
        if (Date.now() - val.createdAt > TTL_MS) await this.ctx.storage.delete(key);
        else if (val.userId === body.userId) userCodes++;
      }
      if (userCodes >= 5) return Response.json({ error: 'too many active codes' }, { status: 429 });
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
    return Response.json({ error: 'not found' }, { status: 404 });
  }

  async alarm() {
    const all = await this.ctx.storage.list<Pairing>({ prefix: 'code:' });
    for (const [key, val] of all) {
      if (Date.now() - val.createdAt > TTL_MS) await this.ctx.storage.delete(key);
    }
  }
}
