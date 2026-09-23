// Vendor status pages (Atlassian Statuspage summary.json, public). Tells "our bug" from "their outage".
import { cached, ok } from '../http.mjs';

export const VENDORS = {
  github: 'https://www.githubstatus.com', cloudflare: 'https://www.cloudflarestatus.com', supabase: 'https://status.supabase.com',
  sentry: 'https://status.sentry.io', discord: 'https://discordstatus.com', groq: 'https://groqstatus.com',
  vercel: 'https://www.vercel-status.com', netlify: 'https://www.netlifystatus.com', openai: 'https://status.openai.com',
  anthropic: 'https://status.anthropic.com', clerk: 'https://status.clerk.com', resend: 'https://resend-status.com',
  assemblyai: 'https://status.assemblyai.com',
};

async function one(id, url) {
  try {
    const r = await fetch(`${url}/api/v2/summary.json`, { signal: AbortSignal.timeout(8000) });
    const j = r.ok ? await r.json() : null;
    if (!j?.status) return { id, url, indicator: 'unknown', description: null };
    const hit = (j.components || []).filter((c) => c.status && c.status !== 'operational' && !c.group).slice(0, 5);
    return { id, url, indicator: j.status.indicator, description: j.status.description,
      incidents: (j.incidents || []).slice(0, 3).map((i) => ({ name: i.name, impact: i.impact, status: i.status, updatedAt: i.updated_at, url: i.shortlink })),
      degraded: hit.map((c) => ({ name: c.name, status: c.status })) };
  } catch { return { id, url, indicator: 'unknown', description: null }; }
}

export function status() {
  return cached('status', async () => ok({ vendors: await Promise.all(Object.entries(VENDORS).map(([id, u]) => one(id, u))) }), 120000);
}
