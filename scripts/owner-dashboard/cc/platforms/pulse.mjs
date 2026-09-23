// One cheap poll for the live HQ: every platform's state in a word, the headline numbers with their
// series, and a merged, time-sorted event feed. It reads the modules' own 60-second caches, so a
// 20-second poll costs one fresh worker ping and nothing upstream most of the time.
import { ok, section } from '../http.mjs';
import { github } from './github.mjs';
import { supabase } from './supabase.mjs';
import { cloudflare, workerHealth } from './cloudflare.mjs';
import { sentry } from './sentry.mjs';
import { hf } from './hf.mjs';
import { apple } from './apple.mjs';
import { groq } from './groq.mjs';
import { discord } from './discord.mjs';
import { roblox } from './roblox.mjs';
import { status } from './status.mjs';
import { connectors } from './connectors.mjs';
import { langflow } from './langflow.mjs';

const val = async (fn) => { const s = await section(fn); return s.value?.ok === false || s.error ? null : s.value; };
const t = (d) => { const n = Date.parse(d); return Number.isFinite(n) ? n : null; };

function perDay(dates, days = 14) {
  const out = Array(days).fill(0), day = 86400000, end = Math.floor(Date.now() / day);
  for (const d of dates) { const i = days - 1 - (end - Math.floor(d / day)); if (i >= 0 && i < days) out[i]++; }
  return out;
}

export async function pulse() {
  const [gh, sb, cf, st, h, ap, gq, dc, rb, vs, cn, ping, lf] = await Promise.all([
    val(github), val(supabase), val(cloudflare), val(sentry), val(hf), val(apple), val(groq), val(discord), val(roblox), val(status),
    val(connectors), workerHealth(), val(langflow)]);
  const vendor = Object.fromEntries((vs?.vendors || []).map((v) => [v.id, v]));
  const P = [];
  const E = [];
  const ev = (at, platform, kind, title, url, tone = 'info') => { const n = t(at) ?? (typeof at === 'number' ? at : null); if (n) E.push({ at: new Date(n).toISOString(), platform, kind, title, url: url || null, tone }); };
  const add = (id, state, line, metric) => P.push({ id, state, line, metric, vendor: vendor[id]?.indicator ?? null });

  const up = ping.httpStatus === 200;
  add('apple', !up ? 'bad' : ap?.spend?.killed ? 'bad' : 'ok', !up ? 'האתר לא עונה' : ap?.spend?.killed ? 'מתג החירום פעיל' : `האתר עונה תוך ${ping.ms} ms`,
    { label: 'הוצאה החודש', value: ap?.spend?.monthUsd ?? null, unit: '$' });
  const lastRun = (gh?.runs || []).find((r) => r.branch === gh?.repo?.defaultBranch) || gh?.runs?.[0];
  const ciBad = lastRun && ['failure', 'timed_out', 'startup_failure'].includes(lastRun.conclusion);
  const ciLive = lastRun && lastRun.status !== 'completed';
  add('github', !gh ? 'off' : ciBad ? 'bad' : ciLive ? 'warn' : 'ok',
    !gh ? 'לא זמין' : ciBad ? `הבדיקות נכשלו: ${lastRun.name}` : ciLive ? `בדיקות רצות: ${lastRun.name}` : 'הבדיקות האחרונות עברו',
    { label: 'קומיטים', value: gh?.commits?.length ?? null });
  const tr = cf?.traffic?.last24h;
  add('cloudflare', !cf ? 'off' : tr?.errors > 0 ? 'warn' : 'ok', !cf ? 'לא זמין' : tr ? `${tr.requests.toLocaleString('he-IL')} בקשות ב-24 שעות` : 'מחובר',
    { label: 'שגיאות', value: tr?.errors ?? null });
  const sbOk = sb?.project?.status === 'ACTIVE_HEALTHY';
  add('supabase', !sb ? 'off' : !sbOk ? 'bad' : sb.advisors?.security?.error ? 'bad' : sb.advisors?.security?.warn ? 'warn' : 'ok',
    !sb ? 'לא זמין' : sbOk ? `בריא · ${sb.advisors?.security?.warn ?? 0} אזהרות אבטחה` : `מצב: ${sb.project?.status}`,
    { label: 'משתמשים', value: sb?.authUsers ?? null });
  const open = st?.issues?.length ?? null;
  add('sentry', !st?.configured ? 'off' : open ? 'warn' : 'ok', !st?.configured ? 'לא מחובר' : open ? `${open} תקלות פתוחות` : 'אין תקלות פתוחות',
    { label: 'תקלות', value: open });
  const spaces = h?.spaces || [], broken = spaces.filter((s) => /ERROR|NO_APP_FILE/.test(s.runtimeStage || ''));
  add('huggingface', !h ? 'off' : broken.length ? 'warn' : 'ok', !h ? 'לא זמין' : broken.length ? `${broken.length} Space לא רץ` : `${(h.models || []).length} מודלים`,
    { label: 'Spaces', value: spaces.length });
  add('groq', !gq?.configured ? 'off' : 'ok', gq?.configured ? `${gq.models?.length ?? 0} מודלים זמינים` : 'לא מחובר', { label: 'מודלים', value: gq?.models?.length ?? null });
  add('discord', !dc?.configured ? 'off' : 'ok', dc?.app?.name ? `אפליקציה ${dc.app.name}` : 'לא מחובר', { label: 'בוט', value: dc?.bot ? 1 : 0 });
  const plug = rb?.assets?.[0];
  add('roblox', !rb ? 'off' : plug?.error ? 'warn' : 'ok', plug?.name ? `הפלאגין ${plug.name}` : 'לא זמין', { label: 'מכירות', value: plug?.sales ?? null });
  const lfFlows = lf?.flows || [];
  add('langflow', lf?.running ? (lfFlows.some((f) => f.lastRun && !f.lastRun.ok) ? 'warn' : 'ok') : 'off',
    lf?.running ? `רץ · ${lfFlows.filter((f) => f.imported).length}/${lfFlows.length} זרימות מיובאות` : 'לא רץ במחשב',
    { label: 'זרימות', value: lfFlows.length });
  for (const f of lfFlows) if (f.lastRun) ev(f.lastRun.at, 'langflow', 'run', `הרצה של ${f.name} · ${f.lastRun.ok ? 'הצליחה' : 'נכשלה'}`, f.openUrl, f.lastRun.ok ? 'ok' : 'bad');
  for (const c of (cn?.list || []).filter((x) => x.id !== 'langflow')) add(c.id, c.configured ? (c.error ? 'warn' : 'ok') : 'off', c.configured ? (c.error || 'מחובר') : `חסר ${c.need.join(', ')}`, null);

  for (const c of gh?.commits || []) ev(c.date, 'github', 'commit', `${c.author || 'מישהו'}: ${c.title}`, c.url, c.ai ? 'ai' : 'info');
  for (const r of gh?.runs || []) ev(r.createdAt, 'github', 'ci', `${r.name} · ${r.status !== 'completed' ? 'רץ' : r.conclusion === 'success' ? 'עבר' : r.conclusion || ''}`, r.url,
    r.status !== 'completed' ? 'warn' : r.conclusion === 'success' ? 'ok' : r.conclusion === 'cancelled' || r.conclusion === 'skipped' ? 'info' : 'bad');
  for (const w of cf?.workers || []) for (const d of w.deployments || []) ev(d.createdAt, 'cloudflare', 'deploy', `פריסה של ${w.name}${d.message ? ` · ${d.message}` : ''}`, null, 'ok');
  for (const i of st?.issues || []) { ev(i.lastSeen, 'sentry', 'error', `${i.shortId}: ${i.title}`, i.url, i.level === 'error' || i.level === 'fatal' ? 'bad' : 'warn'); }
  for (const m of [...(h?.models || []), ...(h?.datasets || []), ...(h?.spaces || [])]) ev(m.updatedAt, 'huggingface', 'update', `עודכן ${m.id}`, m.url);
  for (const a of rb?.assets || []) if (a.updated) ev(a.updated, 'roblox', 'update', `הנכס ${a.name || a.id} עודכן`, a.url);
  for (const v of vs?.vendors || []) for (const i of v.incidents || []) ev(i.updatedAt, v.id, 'incident', `תקלה אצל ${v.id}: ${i.name}`, i.url, i.impact === 'major' || i.impact === 'critical' ? 'bad' : 'warn');
  E.sort((a, b) => b.at.localeCompare(a.at));

  const runs = (gh?.runs || []).filter((r) => r.status === 'completed' && r.conclusion !== 'skipped' && r.conclusion !== 'cancelled');
  return ok({
    ping,
    platforms: P,
    vitals: {
      requests24h: tr?.requests ?? null, errors24h: tr?.errors ?? null, requestsSeries: (cf?.traffic?.perHour || []).map((x) => x.requests),
      ciPass: runs.length ? runs.filter((r) => r.conclusion === 'success').length / runs.length : null,
      ciSeries: runs.slice(0, 20).reverse().map((r) => (r.conclusion === 'success' ? 1 : 0)),
      commits14: perDay((gh?.commits || []).map((c) => t(c.date)).filter(Boolean)),
      sentryOpen: open, sentrySeries: (st?.issues || []).reduce((acc, i) => { (i.trend || []).forEach((n, k) => { acc[k] = (acc[k] || 0) + n; }); return acc; }, []),
      monthUsd: ap?.spend?.monthUsd ?? null, maxMonthlyUsd: ap?.spend?.maxMonthlyUsd ?? null, spendSeries: (ap?.spend?.days || []).map((d) => d.usd),
      modelCalls: ap?.cost?.calls ?? null, tokens: ap?.tokens?.total ?? null, cacheHit: ap?.tokens?.cacheHit ?? null,
      dbBytes: sb?.dbSizeBytes ?? null, authUsers: sb?.authUsers ?? null, securityWarn: sb?.advisors?.security?.warn ?? null,
    },
    events: E.slice(0, 60),
  });
}
