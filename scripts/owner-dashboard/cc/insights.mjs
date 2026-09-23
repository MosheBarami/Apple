// Cross-platform conclusions for the HQ's "מה קורה עכשיו ומה לעשות" feed. `derive()` is pure: it reads
// the platform payloads it is given and nothing else, so every number in an insight is one of those
// payloads' own numbers. A payload that is missing or {ok:false} produces no insight about its content
// (a failure to observe is never rendered as an observation); a core platform that could not be read
// produces one "we could not look" insight instead.
import { section } from './http.mjs';
import { github } from './platforms/github.mjs';
import { supabase } from './platforms/supabase.mjs';
import { cloudflare, workerHealth } from './platforms/cloudflare.mjs';
import { sentry } from './platforms/sentry.mjs';
import { hf } from './platforms/hf.mjs';
import { apple } from './platforms/apple.mjs';
import { discord } from './platforms/discord.mjs';
import { langflow } from './platforms/langflow.mjs';
import { status } from './platforms/status.mjs';
import { connectors } from './platforms/connectors.mjs';

const SEV = { bad: 0, warn: 1, info: 2 };
const HOUR = 3600000;
const okv = (x) => x && typeof x === 'object' && x.ok !== false;
const arr = (x) => (Array.isArray(x) ? x : []);
const ms = (d) => { const n = Date.parse(d); return Number.isFinite(n) ? n : null; };
const nf = (n, d = 0) => new Intl.NumberFormat('he-IL', { maximumFractionDigits: d }).format(n);
const pctx = (f, d = 1) => `${nf(f * 100, d)}%`;
const FAILED = new Set(['failure', 'timed_out', 'startup_failure']);
const CORE = { github: 'GitHub', supabase: 'Supabase', cloudflare: 'Cloudflare', sentry: 'Sentry' };

/**
 * @param d  { github, supabase, cloudflare, sentry, hf, apple, discord, langflow, status, connectors, health }
 * @param o  { now, history } — history: { [key]: [[atMs, bytes], ...] } size samples, oldest first
 * @returns  insights sorted red-first: { id, sev, platform, title, why, evidence:[{k,v}], action }
 *           action: { type:'page', page, label } | { type:'act', id, page, label } | { type:'url', url, label }
 */
export function derive(d = {}, { now = Date.now(), history = {} } = {}) {
  const out = [];
  const add = (x) => out.push({ weight: 0, evidence: [], ...x });

  // ---- core platforms we could not read at all
  for (const [id, name] of Object.entries(CORE)) {
    const v = d[id];
    if (v && v.ok === false && v.configured !== false) add({ id: `blind-${id}`, sev: 'warn', platform: id === 'hf' ? 'huggingface' : id,
      title: `לא הצלחנו לקרוא את ${name}`, why: `המספרים של ${name} בלוח לא עדכניים עד שזה יסתדר. הסיבה: ${v.reason || 'לא ידועה'}.`,
      evidence: [{ k: 'תשובת השרת', v: v.reason || '—' }], action: { type: 'page', page: id, label: `לדף ${name}` } });
  }

  // ---- the site itself
  const h = d.health || d.cloudflare?.health || d.apple?.health;
  if (h && h.httpStatus != null && h.httpStatus !== 200) add({ id: 'site-down', sev: 'bad', platform: 'apple', weight: 100,
    title: 'האתר לא עונה כמו שצריך', why: `בדיקת הבריאות של האתר החזירה ${h.httpStatus} במקום 200. משתמשים כנראה רואים שגיאה.`,
    evidence: [{ k: 'HTTP', v: String(h.httpStatus) }, { k: 'זמן תגובה', v: `${nf(h.ms)} ms` }], action: { type: 'page', page: 'cloudflare', label: 'לדף Cloudflare' } });
  else if (h && h.httpStatus == null && h.reason) add({ id: 'site-down', sev: 'bad', platform: 'apple', weight: 100,
    title: 'האתר לא עונה', why: `לא הגענו לאתר בכלל: ${h.reason}.`, evidence: [{ k: 'ניסיון', v: h.reason }], action: { type: 'page', page: 'cloudflare', label: 'לדף Cloudflare' } });

  // ---- deployed version vs. main
  const g = okv(d.github) ? d.github : null;
  const sha = String(h?.buildSha || '');
  if (sha && g) {
    const base = sha.replace(/-dirty$/, '');
    const commits = arr(g.commits);
    const i = commits.findIndex((c) => String(c.sha || '').startsWith(base));
    if (i > 0) add({ id: 'deploy-behind', sev: 'info', platform: 'cloudflare', weight: i,
      title: `האתר רץ על גרסה ישנה ב-${nf(i)} קומיטים`, why: 'יש שינויים ב-main שעוד לא הגיעו לאתר החי. הם יגיעו בפריסה הבאה.',
      evidence: [{ k: 'גרסה באתר', v: base }, { k: 'אחרון ב-main', v: String(commits[0].sha).slice(0, 7) }, { k: 'פער', v: `${nf(i)} קומיטים` }],
      action: { type: 'page', page: 'github', label: 'לרשימת הקומיטים' } });
    else if (i < 0 && commits.length) add({ id: 'deploy-behind', sev: 'info', platform: 'cloudflare', weight: commits.length,
      title: `הגרסה באתר לא נמצאת ב-${nf(commits.length)} הקומיטים האחרונים`, why: 'האתר החי רץ על קוד ישן יותר מכל מה שמופיע ברשימה, או על קוד שלא נשמר ב-main.',
      evidence: [{ k: 'גרסה באתר', v: base }, { k: 'אחרון ב-main', v: String(commits[0].sha).slice(0, 7) }], action: { type: 'page', page: 'github', label: 'לרשימת הקומיטים' } });
    if (/-dirty$/.test(sha)) add({ id: 'deploy-dirty', sev: 'info', platform: 'cloudflare',
      title: 'הגרסה באתר נבנתה מקוד שלא נשמר ב-git', why: 'מי שפרס עשה זאת עם שינויים שלא נשמרו (commit). קשה לדעת בדיוק איזה קוד רץ באתר.',
      evidence: [{ k: 'גרסה באתר', v: sha }], action: { type: 'page', page: 'cloudflare', label: 'לפריסות' } });
  }

  // ---- CI on the default branch
  if (g) {
    const main = g.repo?.defaultBranch;
    const runs = arr(g.runs).filter((r) => r.status === 'completed' && (!main || r.branch === main) && r.conclusion !== 'cancelled' && r.conclusion !== 'skipped');
    let n = 0; while (n < runs.length && FAILED.has(runs[n].conclusion)) n++;
    if (n) {
      const failed = runs.slice(0, n);
      const quick = failed.filter((r) => Number.isFinite(r.durationSec) && r.durationSec <= 15).length;
      const lastOk = runs[n];
      const instant = n >= 2 && quick >= Math.ceil(n * 0.75);
      add({ id: 'ci-failing', sev: 'bad', platform: 'github', weight: 50 + n,
        title: instant ? `הבדיקות נכשלות תוך שניות (${nf(n)} ריצות ברצף)` : `הבדיקות נכשלות ב-main (${nf(n)} ${n === 1 ? 'ריצה' : 'ריצות ברצף'})`,
        why: instant ? `${nf(quick)} מתוך ${nf(n)} הריצות נעצרו אחרי פחות מ-15 שניות, לפני שהקוד בכלל נבדק. זה בדרך כלל חסימה בחשבון GitHub (חיוב או מכסת דקות), לא באג בקוד.`
          : 'הקוד האחרון ב-main לא עובר את הבדיקות האוטומטיות. כדאי לתקן לפני הפריסה הבאה.',
        evidence: [{ k: 'ריצות שנכשלו ברצף', v: nf(n) }, { k: 'נעצרו תוך 15 שניות', v: `${nf(quick)}/${nf(n)}` },
          { k: 'הצלחה אחרונה', v: lastOk ? lastOk.createdAt : 'אין ברשימה' }],
        action: { type: 'act', id: `gh-rerunf-${failed[0].id}`, page: 'github', label: 'להריץ שוב את מה שנכשל' } });
    }
  }

  // ---- Sentry: errors after the latest worker deploy
  const st = okv(d.sentry) && d.sentry.configured !== false ? d.sentry : null;
  const cf = okv(d.cloudflare) ? d.cloudflare : null;
  if (st) {
    const issues = arr(st.issues);
    const len = Math.max(0, ...issues.map((i) => arr(i.trend).length));
    const sum = Array(len).fill(0);
    for (const i of issues) arr(i.trend).forEach((v, k) => { sum[k + len - arr(i.trend).length] += Number(v) || 0; });
    const base = ms(st.fetchedAt) ?? now;
    const dep = cf ? arr(cf.workers).filter((w) => w.name === 'apple').flatMap((w) => arr(w.deployments)).map((x) => ms(x.createdAt)).filter(Boolean).sort((a, b) => b - a)[0] : null;
    if (len === 24 && dep && base - dep < 24 * HOUR && base - dep >= HOUR) {
      const hoursAfter = Math.floor((base - dep) / HOUR);
      const after = sum.slice(len - hoursAfter);
      const before = sum.slice(Math.max(0, len - hoursAfter * 2), len - hoursAfter);
      const a = after.reduce((x, y) => x + y, 0), b = before.reduce((x, y) => x + y, 0);
      const ra = a / after.length, rb = before.length ? b / before.length : 0;
      if (a >= 5 && ra > rb * 1.5) add({ id: 'sentry-after-deploy', sev: ra >= rb * 3 && a >= 20 ? 'bad' : 'warn', platform: 'sentry', weight: 40 + a,
        title: `יותר שגיאות מאז הפריסה האחרונה של האתר (${nf(a)} ב-${nf(hoursAfter)} שעות)`,
        why: `לפני הפריסה היו ${nf(rb, 1)} שגיאות בשעה, אחריה ${nf(ra, 1)}. ייתכן שהפריסה הכניסה באג.`,
        evidence: [{ k: 'פריסה אחרונה', v: new Date(dep).toISOString() }, { k: 'לשעה לפני', v: nf(rb, 1) }, { k: 'לשעה אחרי', v: nf(ra, 1) }],
        action: { type: 'page', page: 'sentry', label: 'לתקלות ב-Sentry' } });
    }
    const reg = issues.filter((i) => i.substatus === 'regressed');
    if (reg.length) add({ id: 'sentry-regressed', sev: 'warn', platform: 'sentry', weight: 30 + reg.length,
      title: `${nf(reg.length)} ${reg.length === 1 ? 'תקלה שתוקנה חזרה' : 'תקלות שתוקנו חזרו'}`, why: `תקלה שסומנה כפתורה קרתה שוב: "${reg[0].title}".`,
      evidence: reg.slice(0, 3).map((i) => ({ k: i.shortId, v: `${nf(i.count)} פעמים` })), action: { type: 'page', page: 'sentry', label: 'לתקלות שחזרו' } });
    const fresh = issues.filter((i) => ms(i.firstSeen) && now - ms(i.firstSeen) < 24 * HOUR);
    if (fresh.length) add({ id: 'sentry-new', sev: 'warn', platform: 'sentry', weight: 20 + fresh.length,
      title: `${nf(fresh.length)} ${fresh.length === 1 ? 'תקלה חדשה' : 'תקלות חדשות'} ב-24 השעות האחרונות`, why: `החדשה ביותר: "${fresh[0].title}".`,
      evidence: fresh.slice(0, 3).map((i) => ({ k: i.shortId, v: i.project || '' })), action: { type: 'page', page: 'sentry', label: 'לתקלות החדשות' } });
  }

  // ---- Cloudflare worker error rate vs. its own baseline
  if (cf) {
    const hours = arr(cf.traffic?.perHour).filter((x) => Number.isFinite(x.requests));
    if (hours.length >= 8) {
      const recent = hours.slice(-3), older = hours.slice(0, -3);
      const rate = (xs) => { const r = xs.reduce((s, x) => s + x.requests, 0); return r ? xs.reduce((s, x) => s + (x.errors || 0), 0) / r : 0; };
      const rr = rate(recent), rb = rate(older);
      const errs = recent.reduce((s, x) => s + (x.errors || 0), 0);
      if (errs >= 5 && rr > 0.01 && rr > rb * 2) add({ id: 'cf-error-rate', sev: rr > 0.05 ? 'bad' : 'warn', platform: 'cloudflare', weight: 45,
        title: `שיעור השגיאות באתר עלה ל-${pctx(rr)} בשלוש השעות האחרונות`, why: `ב-21 השעות שלפני זה היה ${pctx(rb)}. משהו השתנה לאחרונה.`,
        evidence: [{ k: 'שגיאות ב-3 שעות', v: nf(errs) }, { k: 'שיעור עכשיו', v: pctx(rr) }, { k: 'שיעור רגיל', v: pctx(rb) }],
        action: { type: 'page', page: 'cloudflare', label: 'לתעבורה ב-Cloudflare' } });
    }
    for (const db of arr(cf.d1)) growth(`d1:${db.name}`, db.sizeBytes, `מסד D1 ${db.name}`, 'cloudflare');
  }
  if (okv(d.supabase)) growth('supabase:db', d.supabase.dbSizeBytes, 'מסד Supabase', 'supabase');

  function growth(key, bytes, label, platform) {
    const s = arr(history[key]).filter(([t, b]) => Number.isFinite(t) && Number.isFinite(b));
    if (!Number.isFinite(bytes) || s.length < 1) return;
    const [t0, b0] = s[0]; const span = now - t0;
    if (span < HOUR || bytes <= b0) return;
    const perDay = ((bytes - b0) / span) * 24 * HOUR;
    const frac = (bytes - b0) / b0;
    if (frac < 0.02) return;
    add({ id: `growth-${key}`, sev: 'info', platform, weight: 10,
      title: `${label} גדל ב-${pctx(frac)} מאז שהלוח נפתח`, why: `בקצב הזה זה בערך ${mb(perDay)} ליום. כדאי לדעת לפני שמגיעים למגבלה של החבילה.`,
      evidence: [{ k: 'בהתחלה', v: mb(b0) }, { k: 'עכשיו', v: mb(bytes) }, { k: 'לאורך', v: `${nf(span / HOUR, 1)} שעות` }],
      action: { type: 'page', page: platform, label: `לדף ${platform === 'supabase' ? 'Supabase' : 'Cloudflare'}` } });
  }

  // ---- Supabase
  const sb = okv(d.supabase) ? d.supabase : null;
  if (sb) {
    if (sb.project?.status && sb.project.status !== 'ACTIVE_HEALTHY') add({ id: 'sb-status', sev: 'bad', platform: 'supabase', weight: 90,
      title: `מסד הנתונים לא במצב תקין (${sb.project.status})`, why: 'כשהמסד לא בריא, התחברות ושמירת פרויקטים באתר עלולות להיכשל.',
      evidence: [{ k: 'מצב', v: sb.project.status }], action: { type: 'page', page: 'supabase', label: 'לדף Supabase' } });
    const sec = sb.advisors?.security || {};
    if (sec.error || sec.warn) add({ id: 'sb-security', sev: sec.error ? 'bad' : 'warn', platform: 'supabase', weight: 35 + (sec.error || 0) * 5 + (sec.warn || 0),
      title: sec.error ? `${nf(sec.error)} בעיות אבטחה חמורות במסד הנתונים` : `${nf(sec.warn)} אזהרות אבטחה במסד הנתונים`,
      why: 'הבודק של Supabase מצא הגדרות שכדאי להדק (למשל טבלה שפתוחה ליותר מדי). הטיפול נעשה ב-Supabase עצמו.',
      evidence: [{ k: 'חמורות', v: nf(sec.error || 0) }, { k: 'אזהרות', v: nf(sec.warn || 0) }, { k: 'מידע', v: nf(sec.info || 0) }],
      action: sb.project?.dashboardUrl ? { type: 'url', url: `${sb.project.dashboardUrl}/advisors/security`, label: 'לבודק האבטחה' } : { type: 'page', page: 'supabase', label: 'לדף Supabase' } });
    const perf = sb.advisors?.performance || {};
    if (perf.warn >= 10) add({ id: 'sb-perf', sev: 'info', platform: 'supabase', weight: 5,
      title: `${nf(perf.warn)} המלצות מהירות במסד הנתונים`, why: 'Supabase מצא שאילתות או אינדקסים שאפשר לשפר. לא דחוף, משפר מהירות.',
      evidence: [{ k: 'אזהרות מהירות', v: nf(perf.warn) }], action: { type: 'page', page: 'supabase', label: 'לדף Supabase' } });
  }

  // ---- AI spend (the site's own budget)
  const ap = okv(d.apple) ? d.apple : null;
  const sp = ap?.spend;
  if (sp?.killed) add({ id: 'spend-killed', sev: 'bad', platform: 'apple', weight: 95, title: 'מתג החירום של ההוצאה פעיל',
    why: 'האתר עצר קריאות למודלים כי עבר את תקרת ההוצאה. משתמשים לא מקבלים תשובות מה-AI.', evidence: [{ k: 'הוצאה החודש', v: `$${nf(sp.monthUsd ?? 0, 2)}` }],
    action: { type: 'page', page: 'apple', label: 'לדף Apple' } });
  else if (Number.isFinite(sp?.monthUsd) && sp?.maxMonthlyUsd > 0 && sp.monthUsd / sp.maxMonthlyUsd >= 0.8) add({ id: 'spend-month', sev: 'warn', platform: 'apple', weight: 30,
    title: `ההוצאה החודשית על AI הגיעה ל-${pctx(sp.monthUsd / sp.maxMonthlyUsd, 0)} מהתקרה`, why: 'כשמגיעים לתקרה האתר מפסיק לענות עם AI עד סוף החודש.',
    evidence: [{ k: 'הוצאה', v: `$${nf(sp.monthUsd, 2)}` }, { k: 'תקרה', v: `$${nf(sp.maxMonthlyUsd, 2)}` }], action: { type: 'page', page: 'apple', label: 'לדף Apple' } });
  if (!sp?.killed && Number.isFinite(sp?.dayRemaining) && sp.dayRemaining < 0.2) add({ id: 'spend-day', sev: 'warn', platform: 'apple', weight: 25,
    title: `נשארו ${pctx(Math.max(0, sp.dayRemaining), 0)} מהתקציב היומי של AI`, why: 'כשהתקציב היומי נגמר, קריאות למודלים נעצרות עד חצות.',
    evidence: [{ k: 'נוירונים היום', v: nf(sp.dayNeurons ?? 0) }, { k: 'נשאר', v: pctx(Math.max(0, sp.dayRemaining), 0) }], action: { type: 'page', page: 'apple', label: 'לדף Apple' } });
  const b = ap?.billing;
  if (b?.production && b.keyMode === 'test') add({ id: 'stripe-test', sev: 'info', platform: 'stripe', weight: 8,
    title: 'התשלומים באתר עדיין במצב בדיקה', why: 'האתר בפרודקשן אבל מפתח Stripe הוא מפתח test, אז אף אחד לא מחויב באמת. המעבר ל-live הוא החלטה שלכם ב-Stripe.',
    evidence: [{ k: 'מצב מפתח', v: 'test' }, { k: 'סביבה', v: 'production' }], action: { type: 'page', page: 'apple', label: 'לדף Apple' } });

  // ---- Hugging Face spaces
  for (const s of okv(d.hf) ? arr(d.hf.spaces) : []) {
    if (/RUNNING|SLEEPING|PAUSED/.test(s.runtimeStage || '') || !s.runtimeStage) continue;
    add({ id: `hf-space-${s.id}`, sev: 'warn', platform: 'huggingface', weight: 15, title: `ה-Space ${String(s.id).split('/')[1] || s.id} לא רץ`,
      why: s.runtimeStage === 'NO_APP_FILE' ? 'אין בו קובץ אפליקציה, אז הפעלה מחדש לא תעזור עד שיעלה אליו קוד.' : `המצב שלו הוא ${s.runtimeStage}. הפעלה מחדש בדרך כלל פותרת.`,
      evidence: [{ k: 'מצב', v: s.runtimeStage }], action: s.runtimeStage === 'NO_APP_FILE' ? { type: 'page', page: 'hf', label: 'לדף Hugging Face' }
        : { type: 'act', id: `hf-restart-${s.id}`, page: 'hf', label: 'הפעלה מחדש' } });
  }

  // ---- Langflow flows
  const lf = okv(d.langflow) && d.langflow.running ? d.langflow : null;
  for (const f of lf ? arr(lf.flows) : []) if (f.lastRun && f.lastRun.ok === false) add({ id: `lf-${f.id || f.file}`, sev: 'warn', platform: 'langflow', weight: 12,
    title: `ההרצה האחרונה של "${f.name}" נכשלה`, why: 'הזרימה לא סיימה את העבודה בפעם האחרונה שהופעלה. פותחים אותה ב-Langflow ורואים באיזה שלב.',
    evidence: [{ k: 'מתי', v: f.lastRun.at || '—' }], action: f.openUrl ? { type: 'url', url: f.openUrl, label: 'לפתוח ב-Langflow' } : { type: 'page', page: 'langflow', label: 'לדף Langflow' } });

  // ---- Discord bot
  const dc = okv(d.discord) ? d.discord : null;
  if (dc?.configured && dc.bot === false) add({ id: 'discord-bot', sev: 'info', platform: 'discord', weight: 3,
    title: 'אי אפשר לדעת אם הבוט של Discord מחובר', why: 'יש אפליקציה אבל אין טוקן של בוט, אז הלוח לא יכול לבדוק אם הוא באוויר ובכמה שרתים הוא נמצא.',
    evidence: [{ k: 'אפליקציה', v: dc.app?.name || '—' }, { k: 'טוקן בוט', v: 'חסר' }], action: { type: 'page', page: 'discord', label: 'לדף Discord' } });

  // ---- vendor incidents on platforms we use
  for (const v of okv(d.status) ? arr(d.status.vendors) : []) for (const i of arr(v.incidents).slice(0, 1)) add({ id: `vendor-${v.id}`,
    sev: i.impact === 'major' || i.impact === 'critical' ? 'warn' : 'info', platform: v.id, weight: 18, title: `תקלה אצל ${v.name || v.id}: ${i.name}`,
    why: 'זו תקלה אצל הספק, לא אצלנו. אם משהו באתר מתנהג מוזר, זו כנראה הסיבה.', evidence: [{ k: 'חומרה', v: i.impact || '—' }, { k: 'עודכן', v: i.updatedAt || '—' }],
    action: i.url ? { type: 'url', url: i.url, label: 'לדף הסטטוס' } : { type: 'page', page: 'status', label: 'למצב הספקים' } });

  // ---- connectors that are configured but failing
  for (const c of okv(d.connectors) ? arr(d.connectors.list) : []) if (c.configured && c.error) add({ id: `conn-${c.id}`, sev: 'warn', platform: c.id, weight: 10,
    title: `החיבור ל-${c.name || c.id} לא עובד`, why: `יש מפתח, אבל הקריאה נכשלה: ${c.error}.`, evidence: [{ k: 'שגיאה', v: String(c.error) }],
    action: { type: 'page', page: 'connect', label: 'לחיבורים' } });

  return out.sort((a, b) => SEV[a.sev] - SEV[b.sev] || b.weight - a.weight).map(({ weight, ...x }) => x);
}
const mb = (n) => `${nf(n / 1048576, n < 10485760 ? 1 : 0)} MB`;

// ---- size history kept in memory while the server runs (growth needs two samples an hour apart)
const HISTORY = {};
function remember(key, bytes, at) {
  if (!Number.isFinite(bytes)) return;
  const s = (HISTORY[key] ||= []);
  if (!s.length || at - s[s.length - 1][0] >= 10 * 60000) s.push([at, bytes]);
  while (s.length > 200) s.shift();
}

const val = async (fn) => { const s = await section(fn); return s.error ? { ok: false, reason: s.error } : s.value; };

/** GET /api/cc/insights — reads the modules' own caches, so it costs nothing upstream most of the time. */
export async function insights() {
  const [gh, sb, cf, st, h, ap, dc, lf, vs, cn, health] = await Promise.all([
    val(github), val(supabase), val(cloudflare), val(sentry), val(hf), val(apple), val(discord), val(langflow), val(status), val(connectors),
    workerHealth()]);
  const now = Date.now();
  if (okv(sb)) remember('supabase:db', sb.dbSizeBytes, now);
  for (const db of okv(cf) ? arr(cf.d1) : []) remember(`d1:${db.name}`, db.sizeBytes, now);
  const list = derive({ github: gh, supabase: sb, cloudflare: cf, sentry: st, hf: h, apple: ap, discord: dc, langflow: lf, status: vs, connectors: cn, health },
    { now, history: HISTORY });
  return { ok: true, fetchedAt: new Date(now).toISOString(), insights: list,
    counts: { bad: list.filter((x) => x.sev === 'bad').length, warn: list.filter((x) => x.sev === 'warn').length, info: list.filter((x) => x.sev === 'info').length } };
}
