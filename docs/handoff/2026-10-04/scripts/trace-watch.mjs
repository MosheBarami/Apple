// Read-only: saves the bench project's latest messages (with tool traces) per running item, so a reset cannot erase them.
import { readFileSync, writeFileSync } from 'node:fs';
const S = '/Users/moshe/Developer/RbxAI/docs/handoff/2026-10-04/work';
for (const line of readFileSync('/Users/moshe/Developer/RbxAI/.env', 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const project = readFileSync(`${S}/bench-project.txt`, 'utf8').trim();
for (;;) {
  try {
    const log = readFileSync(`${S}/bench-sc.log`, 'utf8').trim().split('\n');
    const cur = [...log].reverse().find((l) => / running$/.test(l))?.split(' ')[0];
    if (cur) {
      const r = await fetch(`https://apple.moshe-barami111.workers.dev/api/admin/session-messages/${project}?limit=100`, { headers: { 'X-Admin-Key': process.env.GOLEM_ADMIN_KEY } });
      if (r.ok) { const j = await r.json(); if ((j.messages ?? []).length) writeFileSync(`${S}/traces/${cur}.json`, JSON.stringify(j.messages, null, 1)); }
    }
  } catch {}
  await new Promise((res) => setTimeout(res, 20_000));
}
