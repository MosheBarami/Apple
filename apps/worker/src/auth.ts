// Supabase JWT verification via JWKS (ES256). The worker never holds auth secrets.
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env, AuthedUser } from './env';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksUrl = '';

export async function verifyJwt(env: Env, token: string): Promise<AuthedUser | null> {
  const url = `${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`;
  if (!jwks || jwksUrl !== url) {
    jwks = createRemoteJWKSet(new URL(url), { cacheMaxAge: 12 * 3600 * 1000 });
    jwksUrl = url;
  }
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `${env.SUPABASE_URL}/auth/v1`,
      audience: 'authenticated',
    });
    if (!payload.sub) return null;
    return {
      userId: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
      role: typeof payload.role === 'string' ? payload.role : 'authenticated',
      jwt: token,
    };
  } catch {
    return null;
  }
}

export function bearerToken(req: Request): string | null {
  const h = req.headers.get('Authorization');
  if (h?.startsWith('Bearer ')) return h.slice(7);
  // WebSocket clients cannot set headers from the browser; allow token via subprotocol
  const proto = req.headers.get('Sec-WebSocket-Protocol');
  if (proto) {
    const parts = proto.split(',').map((s) => s.trim());
    const tok = parts.find((p) => p.startsWith('golem.jwt.'));
    if (tok) return tok.slice('golem.jwt.'.length);
  }
  return null;
}
