/** Worker → runner integrity; no browser credential and no provider key in the request. */
const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((n) => n.toString(16).padStart(2, '0')).join('');
const keyFor = async (secret: string) => {
  const bytes = Uint8Array.from(atob(secret), (char) => char.charCodeAt(0));
  if (bytes.byteLength !== 32) throw new Error('Runner signing key must be 32 base64-encoded bytes.');
  return crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
};
const canonical = async (method: string, path: string, body: string, time: string, nonce: string) =>
  encoder.encode(['studpilot-runner-v1', method.toUpperCase(), path, time, nonce,
    hex(await crypto.subtle.digest('SHA-256', encoder.encode(body)))].join('\n'));

export async function signRunnerRequest(secret: string, method: string, path: string, body: string,
  now = Date.now()): Promise<Record<string, string>> {
  const time = String(now), nonce = crypto.randomUUID();
  const signature = await crypto.subtle.sign('HMAC', await keyFor(secret), await canonical(method, path, body, time, nonce));
  return { 'X-StudPilot-Runner-Time': time, 'X-StudPilot-Runner-Nonce': nonce,
    'X-StudPilot-Runner-Signature': hex(signature) };
}

export async function verifyRunnerRequest(secret: string, method: string, path: string, body: string,
  headers: Headers, now = Date.now()): Promise<{ nonce: string; time: number } | null> {
  const time = headers.get('X-StudPilot-Runner-Time') ?? '';
  const nonce = headers.get('X-StudPilot-Runner-Nonce') ?? '';
  const signature = headers.get('X-StudPilot-Runner-Signature') ?? '';
  if (!/^\d{13}$/.test(time) || Math.abs(now - Number(time)) > 60_000
    || !/^[0-9a-f-]{36}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(signature)) return null;
  const bytes = Uint8Array.from(signature.match(/../g)!, (pair) => parseInt(pair, 16));
  const valid = await crypto.subtle.verify('HMAC', await keyFor(secret), bytes,
    await canonical(method, path, body, time, nonce));
  return valid ? { nonce, time: Number(time) } : null;
}
