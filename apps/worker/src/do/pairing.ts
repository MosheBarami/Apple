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
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no confusable chars

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
      const bytes = crypto.getRandomValues(new Uint8Array(6));
      const code = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
      await this.ctx.storage.put(`code:${code}`, { ...body, createdAt: Date.now() } satisfies Pairing);
      await this.ctx.storage.setAlarm(Date.now() + TTL_MS + 1000);
      return Response.json({ code, expiresAtIso: new Date(Date.now() + TTL_MS).toISOString() });
    }
    if (url.pathname === '/claim' && req.method === 'POST') {
      const { code } = (await req.json()) as { code: string };
      const key = `code:${(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
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
