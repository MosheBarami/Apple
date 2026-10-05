// Stubbed auth boundary that also carries the account's email, for tests where the email decides the answer.
// The bearer token is `<userId>` or `<userId>|<email>`. Real verification is auth.ts's own test.
export function bearerToken(req) {
  const h = req.headers.get('Authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}
export async function verifyJwt(_env, token) {
  if (!token || token === 'invalid') return null;
  const [userId, email] = token.split('|');
  return { userId, email: email ?? null, jwt: token };
}
