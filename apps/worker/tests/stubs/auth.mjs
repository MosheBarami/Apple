// Stubbed auth boundary for the route integration test. Only the two functions index.ts imports.
export function bearerToken(req) {
  const h = req.headers.get('Authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}
// The token IS the user id here. Real verification is auth.ts's own test; this test is about
// whether the image route is registered, reachable, and scoped.
export async function verifyJwt(_env, token) {
  return token && token !== 'invalid' ? { userId: token, jwt: token } : null;
}
