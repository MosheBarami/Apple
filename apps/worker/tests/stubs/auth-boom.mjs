// An auth boundary that EXPLODES, so a test can drive a real unhandled error through the real
// middleware chain in index.ts.
//
// Why this rather than a route that happens to throw: the auth middleware is registered INSIDE
// the Sentry middleware and OUTSIDE every handler, so a throw here takes the exact path a genuine
// unhandled error takes — up through the request log's `finally`, up through the Sentry
// middleware's `finally`, and into Hono's own error handler, which is the thing whose response
// must not change. A handler that throws would test less of that path, and picking one would tie
// the test to whatever that route happens to need bound.
export function bearerToken(req) {
  const h = req.headers.get('Authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

// THE TRIGGER IS THE ENV, NOT THE TOKEN, and that is the whole point of this file. The test needs
// to present a real Supabase-shaped JWT — that token is one of the needles it then looks for in the
// envelope — while still provoking a throw. A stub that exploded on a magic token value would force
// the test to send a token that is not JWT-shaped, and the assertion "no JWT reached Sentry" would
// then be true of a request that never carried one.
export async function verifyJwt(env, token) {
  if (env?.AUTH_EXPLODES) throw new Error('the credential check exploded');
  return token && token !== 'invalid' ? { userId: token, jwt: token } : null;
}
