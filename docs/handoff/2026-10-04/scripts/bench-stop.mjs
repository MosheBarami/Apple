import { readFileSync } from 'node:fs';
const root = '/Users/moshe/Developer/RbxAI/';
for (const line of readFileSync(root + '.env', 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const id = readFileSync('/Users/moshe/Developer/RbxAI/docs/handoff/2026-10-04/bench-project.txt', 'utf8').trim();
const r = await fetch(`https://apple.moshe-barami111.workers.dev/api/admin/agent-stop/${id}`, { method: 'POST', headers: { 'X-Admin-Key': process.env.GOLEM_ADMIN_KEY } });
console.log('agent-stop', r.status, (await r.text()).slice(0, 160));
