// Read-only validation of existing owner-authorized Cloudflare access. No key provisioning or inference.
import { readFile, writeFile } from 'node:fs/promises';
import { envCompat } from '../scripts/lib/env-compat.mjs';
const option = (name) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
if (!option('--dev-env-file')) throw new Error('An explicit ignored development env file is required.');
const environment = {};
for (const line of (await readFile(option('--dev-env-file'), 'utf8')).split('\n')) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
  if (match) environment[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
}
const token = environment.CLOUDFLARE_API_TOKEN_MASTER, account = environment.CLOUDFLARE_ACCOUNT_ID;
if (!token || !/^[a-f0-9]{32}$/.test(account ?? '')) throw new Error('Existing Cloudflare account access is unavailable.');
const admin = envCompat('STUDPILOT_ADMIN_KEY', environment);
const [models, spend] = await Promise.all([
  fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/models/search?per_page=100`, {
    headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(20000) }),
  fetch('https://studpilot.app/api/admin/spend', { headers: { 'X-Admin-Key': admin ?? '' },
    redirect: 'error', signal: AbortSignal.timeout(20000) }),
]);
const catalog = await models.json().catch(() => null), budget = await spend.json().catch(() => null);
const proof = { checkedAt: new Date().toISOString(), readonly: true, inferencePerformed: false,
  cloudflare: { httpStatus: models.status, success: catalog?.success === true,
    returnedModels: Array.isArray(catalog?.result) ? catalog.result.length : null,
    modelNames: Array.isArray(catalog?.result) ? catalog.result.slice(0, 6).map(({ name }) => name) : [],
    sample: Array.isArray(catalog?.result) ? catalog.result.find((model) => model.name === '@cf/openai/gpt-oss-20b') : null,
    errorCodes: Array.isArray(catalog?.errors) ? catalog.errors.map(({ code }) => code) : [] },
  budget: { httpStatus: spend.status, fields: budget && typeof budget === 'object' ? Object.keys(budget) : [],
    dailyNeurons: budget?.daily?.neurons ?? null, monthlyNeurons: budget?.monthly?.neurons ?? null } };
if (budget?.state) proof.budget.state = Object.fromEntries(Object.entries(budget.state).filter(([_, value]) => typeof value === 'number' || typeof value === 'boolean'));
if (budget?.limits) proof.budget.limits = Object.fromEntries(Object.entries(budget.limits).filter(([_, value]) => typeof value === 'number' || typeof value === 'boolean'));
if (option('--output')) await writeFile(option('--output'), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify(proof));
