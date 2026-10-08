// Explicit opt-in real JWT -> local HTTPS Worker -> encrypted BYOK -> provider proof.
// Never called by CI. It does not create a project, pair Studio, or execute a build.
import { readFile, writeFile, stat } from 'node:fs/promises';
import { request } from 'node:https';
import { connect } from 'node:tls';
import { createHash } from 'node:crypto';
import { envCompat } from '../scripts/lib/env-compat.mjs';
const option = (name) => { const at = process.argv.indexOf(name); return at < 0 ? undefined : process.argv[at + 1]; };
if (!process.argv.includes('--live') || !option('--dev-env-file')) throw new Error('Explicit --live and private --dev-env-file are required.');
if (((await stat(option('--dev-env-file'))).mode & 0o077) !== 0) throw new Error('The development credential file must be private.');
const environment = {};
for (const line of (await readFile(option('--dev-env-file'), 'utf8')).split('\n')) {
  const found = /^([A-Z0-9_]+)=(.*)$/.exec(line);
  if (found) environment[found[1]] = found[2].trim().replace(/^(['"])(.*)\1$/, '$2');
}
const email = envCompat('STUDPILOT_E2E_EMAIL', environment), password = envCompat('STUDPILOT_E2E_PASSWORD', environment);
const token = environment.CLOUDFLARE_API_TOKEN_MASTER, accountId = environment.CLOUDFLARE_ACCOUNT_ID;
if (!email || !password || !token || !accountId) throw new Error('The existing evaluation account and authorized API access are unavailable.');
const config = await readFile(new URL('../apps/worker/wrangler.studpilot.jsonc', import.meta.url), 'utf8');
const supabase = /"SUPABASE_URL":\s*"([^"]+)"/.exec(config)?.[1], anon = /"SUPABASE_ANON_KEY":\s*"([^"]+)"/.exec(config)?.[1];
const auth = await fetch(`${supabase}/auth/v1/token?grant_type=password`, { method: 'POST',
  headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  signal: AbortSignal.timeout(20000), redirect: 'error' });
const session = await auth.json();
if (!auth.ok || typeof session.access_token !== 'string') throw new Error(`Evaluation sign-in failed (${auth.status}).`);

// Bootstrap only the certificate from our freshly launched loopback daemon, without sending
// credentials. Every subsequent HTTPS request pins this certificate and validates its hostname.
// This never changes a browser trust setting or disables validation for a remote destination.
const certificate = await new Promise((resolve, reject) => {
  const socket = connect({ host: '127.0.0.1', port: 8791, servername: 'localhost', rejectUnauthorized: false }, () => {
    const raw = socket.getPeerCertificate().raw; socket.end(); raw ? resolve(raw) : reject(new Error('Local TLS certificate unavailable.'));
  }); socket.once('error', reject); socket.setTimeout(5000, () => socket.destroy(new Error('Local TLS timed out.')));
});
const ca = `-----BEGIN CERTIFICATE-----\n${certificate.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`;
const local = (path, method = 'GET', body) => new Promise((resolve, reject) => {
  const req = request({ hostname: '127.0.0.1', port: 8791, servername: 'localhost', ca, path, method,
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' } }, (res) => {
    const chunks = []; let bytes = 0;
    res.on('data', (chunk) => { bytes += chunk.length; if (bytes > 4 * 1024 * 1024) req.destroy(new Error('Response exceeded its limit.')); else chunks.push(chunk); });
    res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) }); } catch { reject(new Error(`Local JSON response unavailable (${res.statusCode}).`)); } });
  }); req.once('error', reject); req.setTimeout(60000, () => req.destroy(new Error('Local inference request timed out.')));
  req.end(body === undefined ? undefined : JSON.stringify(body));
});
const proof = { checkedAt: new Date().toISOString(), scope: 'real JWT and local HTTPS Worker BYOK; no website or Studio build acceptance',
  productionDeployment: false, studioMutation: false, authHttpStatus: auth.status,
  loopbackTlsFingerprint: createHash('sha256').update(certificate).digest('hex'), steps: [] };
const checked = async (stage, path, method, body) => {
  const result = await local(path, method, body); proof.steps.push({ stage, httpStatus: result.status,
    ...(result.status >= 400 && typeof result.data.error === 'string' ? { code: result.data.error,
      providerStatus: result.data.providerStatus ?? null } : {}) });
  if (result.status < 200 || result.status >= 300) throw new Error(`${stage} failed (${result.status}).`);
  return result.data;
};
let connectionId;
try {
  const created = await checked('encrypted connection save', '/api/me/ai/connections', 'POST', {
    provider: 'cloudflare', name: 'Temporary local acceptance', credentials: { apiKey: token, accountId } });
  connectionId = created.connection.id;
  if (JSON.stringify(created).includes(token)) throw new Error('A raw credential reached its connection response.');
  const catalog = await checked('authenticated model discovery', `/api/me/ai/connections/${connectionId}/models/refresh`, 'POST');
  proof.modelsReturned = catalog.catalog.models.length;
  const modelId = '@cf/openai/gpt-oss-20b';
  const inference = await checked('real selected model inference', `/api/me/ai/connections/${connectionId}/check`, 'POST', { modelId });
  proof.inference = { provider: inference.provider, modelId: inference.modelId, verified: inference.verified, usage: inference.usage };
  const tools = await checked('real native tool support', `/api/me/ai/connections/${connectionId}/capabilities`, 'POST', { modelId });
  proof.tools = { provider: tools.provider, modelId: tools.modelId, passed: tools.tools, usage: tools.usage };
  if (!inference.verified || tools.tools !== true) throw new Error('The provider did not pass actual inference and native tool checks.');
  proof.passed = true;
} catch (error) { proof.passed = false; proof.failure = error.message; }
finally {
  if (connectionId) {
    const removed = await local(`/api/me/ai/connections/${connectionId}`, 'DELETE');
    proof.connectionRemoved = removed.status === 200 && removed.data.removed === true;
  }
}
if (option('--output')) await writeFile(option('--output'), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify(proof));
if (!proof.passed || !proof.connectionRemoved) process.exitCode = 1;
