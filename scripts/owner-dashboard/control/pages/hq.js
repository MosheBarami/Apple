// The HQ: the command centre for the whole repo. A headline drawn from the inferred insights, the key
// numbers (they count up and roll), a live map of every system coloured by health with traffic
// flowing along its edges, "מה קורה עכשיו ומה לעשות" (each conclusion with its evidence and one click),
// a cross-platform timeline, quick actions and every platform. Everything re-renders from the stream
// through morph(): rows keep their identity (data-k), new ones slide in, gone ones fade.
import { html, raw, num, compact, bytes, pct, ago, rel, arr, isNum } from '../ui.js';
import { PLATFORMS, logo, mark, icon, brandVars } from '../logos.js';
import { rn, spark } from '../fx.js';
import { catalog, aid } from '../actions.js';
import { stat, sec } from './kit.js';

const st = { feed: '', seen: null, fresh: new Set(), off: [] };
const ok = (x) => x && x.ok !== false;
const pageOf = (id) => `#/${PLATFORMS[id]?.page || 'connect'}`;
const STATE_HE = { ok: 'תקין', warn: 'לבדוק', bad: 'תקלה', off: 'לא מחובר או אין נתונים' };
const SEV_HE = { bad: 'דחוף', warn: 'לבדוק', info: 'לידיעה' };
const RANK = { bad: 3, warn: 2, ok: 1, off: 0 };
const worst = (...s) => s.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'off');

// ---------------------------------------------------------------- headline
function headline(ins, plats) {
  const bad = ins.filter((x) => x.sev === 'bad'); const warn = ins.filter((x) => x.sev === 'warn');
  const live = plats.filter((p) => p.state !== 'off').length;
  if (bad.length) return { tone: 'bad', h: html`<em>${num(bad.length)}</em> ${bad.length === 1 ? 'דבר דורש' : 'דברים דורשים'} טיפול עכשיו`, p: `${bad[0].title}.${warn.length ? ` ועוד ${num(warn.length)} לבדוק.` : ''}` };
  if (warn.length) return { tone: 'warn', h: html`אין תקלות דחופות. <em>${num(warn.length)}</em> ${warn.length === 1 ? 'דבר' : 'דברים'} שכדאי לבדוק`, p: `${warn[0].title}.` };
  return { tone: 'ok', h: html`הכול ירוק. <em>${num(live)} מערכות עובדות</em>`, p: 'אין כרגע שום דבר שדורש אתכם.' };
}
function hero(pulse, ins, store) {
  const plats = arr(pulse.platforms); const hd = headline(ins, plats); const ping = pulse.ping || {};
  const live = plats.filter((p) => p.state !== 'off').length;
  return html`<section class="hero hq-hero" data-nf aria-labelledby="hq-h">
    <div class="hero-g"><div>
      <p class="eyebrow hero-e is-${hd.tone}"><i class="live-d" aria-hidden="true"></i>מרכז הפיקוד · ${num(live)} מתוך ${num(plats.length)} מערכות מדווחות בשידור חי</p>
      <h2 class="hero-h" id="hq-h">${hd.h}</h2>
      <p class="hero-p" dir="auto">${hd.p}</p>
      <div class="hq-sum" role="list" aria-label="סיכום המסקנות">
        ${['bad', 'warn', 'info'].map((s) => html`<a role="listitem" class="hq-sum-i sev-${s}" href="#hq-ins"><b>${rn(`hq-sum-${s}`, ins.filter((x) => x.sev === s).length, num(ins.filter((x) => x.sev === s).length))}</b><span>${SEV_HE[s]}</span></a>`)}
      </div>
    </div>
    <aside class="ping" style="${brandVars('apple')}" aria-label="זמן התגובה של האתר">
      <p class="stat-k">${logo('apple', 'sm')}<span>האתר עונה תוך</span></p>
      <p class="stat-v">${isNum(ping.ms) ? rn('hq-ping', ping.ms, num(ping.ms)) : '—'}<small>ms</small></p>
      <p class="stat-s">HTTP ${ping.httpStatus ?? '—'} · גרסה <bdi class="mono" dir="ltr">${ping.buildSha || ping.version || '—'}</bdi></p>
      ${spark(store.pings.length > 1 ? store.pings : [ping.ms || 0, ping.ms || 0], { h: 44, label: 'זמן תגובה בדגימות האחרונות' })}
      <p class="stat-s">${num(store.pings.length)} דגימות מאז שנפתח הדף</p>
    </aside></div>
  </section>`;
}

// ---------------------------------------------------------------- key numbers
function vitals(v, d, plats) {
  const ghOff = arr(plats).find((p) => p.id === 'github')?.state === 'off'; // no read: its zeros are not a count
  const ci = arr(v.ciSeries); const ciRate = ci.length ? ci.filter(Boolean).length / ci.length : null;
  const spendF = v.maxMonthlyUsd ? v.monthUsd / v.maxMonthlyUsd : null;
  const users = d.supabase?.authUsers ?? v.authUsers;
  return html`<section class="bento" aria-label="מספרי המפתח">
    ${stat({ key: 'hq-req', label: 'בקשות לאתר ב-24 שעות', value: v.requests24h, text: num(v.requests24h), platform: 'cloudflare', series: v.requestsSeries, sub: `${num(v.errors24h)} שגיאות · לפי שעה`, href: '#/cloudflare', wide: true })}
    ${stat({ key: 'hq-spend', label: 'הוצאה על AI החודש', value: v.monthUsd, text: isNum(v.monthUsd) ? `$${num(v.monthUsd, 2)}` : '—', platform: 'apple', series: v.spendSeries, sub: v.maxMonthlyUsd ? `${pct(spendF)} מתקרה של $${num(v.maxMonthlyUsd, 2)}` : 'לפי יום', href: '#/apple', wide: true })}
    ${stat({ key: 'hq-ci', label: 'בדיקות CI שעברו', value: ciRate == null ? null : Math.round(ciRate * 100), text: ciRate == null ? '—' : `${num(Math.round(ciRate * 100))}%`, platform: 'github', series: ci, sparkCls: ciRate != null && ciRate < 0.5 ? 'bad' : '', tone: ciRate != null && ciRate < 0.5 ? 'bad' : '', sub: ghOff ? 'GitHub לא מחובר, אין ריצות לקרוא' : `${num(ci.length)} הריצות האחרונות`, href: '#/github' })}
    ${stat({ key: 'hq-sentry', label: 'תקלות פתוחות', value: v.sentryOpen, platform: 'sentry', series: v.sentrySeries, sparkCls: 'bad', tone: v.sentryOpen ? 'warn' : 'good', sub: 'אירועים לפי שעה, 24 שעות', href: '#/sentry' })}
    ${stat({ key: 'hq-calls', label: 'קריאות למודלים', value: v.modelCalls, platform: 'apple', sub: `${compact(v.tokens)} טוקנים · ${pct(v.cacheHit)} מהמטמון`, href: '#/apple' })}
    ${stat({ key: 'hq-commits', label: 'קומיטים ב-14 יום', value: ghOff ? null : arr(v.commits14).reduce((a, b) => a + b, 0), text: ghOff ? '—' : undefined, platform: 'github', series: ghOff ? [] : v.commits14, sub: ghOff ? 'GitHub לא מחובר, אין מה לספור' : 'לפי יום', href: '#/github' })}
    ${stat({ key: 'hq-db', label: 'מסד הנתונים', value: v.dbBytes, text: bytes(v.dbBytes), platform: 'supabase', sub: `${num(users)} משתמשים רשומים`, href: '#/supabase', wide: true })}
    ${stat({ key: 'hq-sec', label: 'אזהרות אבטחה', value: v.securityWarn, platform: 'supabase', tone: v.securityWarn ? 'warn' : 'good', sub: 'מהבודק של Supabase', href: '#/supabase', wide: true })}
  </section>`;
}

// ---------------------------------------------------------------- the architecture map
// Nodes are the systems the product runs on (bindings read from apps/worker/wrangler.apple.jsonc:
// D1 golem-corpus, R2 apple-media, Vectorize golem-docs, Workers AI; the rest are the connected
// platforms). Positions are a fixed drawing; health and traffic are live.
const W = 124, H = 36;
const NODES = [
  { id: 'supabase', label: 'Supabase', brand: 'supabase', x: 150, y: 46 },
  { id: 'stripe', label: 'Stripe', brand: 'stripe', x: 320, y: 46 },
  { id: 'sentry', label: 'Sentry', brand: 'sentry', x: 490, y: 46 },
  { id: 'clerk', label: 'Clerk', brand: 'clerk', x: 660, y: 46 },
  { id: 'resend', label: 'Resend', brand: 'resend', x: 830, y: 46 },
  { id: 'users', label: 'משתמשים', x: 925, y: 222, page: 'apple' },
  { id: 'site', label: 'האתר', brand: 'apple', x: 780, y: 168 },
  { id: 'web', label: 'האפליקציה', brand: 'apple', x: 780, y: 276 },
  { id: 'worker', label: 'Worker', brand: 'cloudflare', x: 600, y: 222, core: true },
  { id: 'aigw', label: 'AI Gateway', brand: 'cloudflare', x: 425, y: 222, cf: 'aiGateway' },
  { id: 'workersai', label: 'Workers AI', brand: 'cloudflare', x: 250, y: 150 },
  { id: 'groq', label: 'Groq', brand: 'groq', x: 250, y: 222 },
  { id: 'hf', label: 'Hugging Face', brand: 'huggingface', x: 250, y: 294, w: 148 },
  { id: 'd1', label: 'D1', brand: 'cloudflare', x: 100, y: 398, cf: 'd1' },
  { id: 'r2', label: 'R2', brand: 'cloudflare', x: 235, y: 398, cf: 'r2' },
  { id: 'vectorize', label: 'Vectorize', brand: 'cloudflare', x: 370, y: 398, cf: 'vectorize' },
  { id: 'langflow', label: 'Langflow', brand: 'langflow', x: 505, y: 398 },
  { id: 'discord', label: 'Discord', brand: 'discord', x: 640, y: 398 },
  { id: 'plugin', label: 'Studio', brand: 'roblox', x: 775, y: 398 },
  { id: 'github', label: 'GitHub', brand: 'github', x: 910, y: 398 },
];
const EDGES = [
  ['users', 'site', 'req'], ['users', 'web', 'req'], ['site', 'worker'], ['web', 'worker'], ['plugin', 'worker'],
  ['github', 'worker', 'deploy'], ['discord', 'worker'],
  ['worker', 'supabase'], ['worker', 'stripe'], ['worker', 'sentry', 'err'], ['worker', 'clerk'], ['worker', 'resend'],
  ['worker', 'aigw', 'ai'], ['aigw', 'workersai', 'ai'], ['aigw', 'groq', 'ai'], ['aigw', 'hf'], ['langflow', 'aigw'],
  ['worker', 'd1'], ['worker', 'r2'], ['worker', 'vectorize'],
];
const byNode = Object.fromEntries(NODES.map((n) => [n.id, n]));
const wOf = (n) => n.w || W;

function nodeStates(pulse, d, ins) {
  const ps = (id) => arr(pulse.platforms).find((p) => p.id === id);
  const s = (id) => ps(id)?.state || 'off';
  const ping = pulse.ping || {};
  const site = ping.httpStatus === 200 ? 'ok' : ping.httpStatus || ping.reason ? 'bad' : 'off';
  const cf = ok(d.cloudflare) ? d.cloudflare : null;
  const cfs = s('cloudflare');
  const out = {};
  for (const n of NODES) {
    let v = n.brand ? s(n.brand) : 'off'; let line = ps(n.brand)?.line || '';
    if (n.id === 'users') { v = pulse.vitals?.requests24h > 0 ? 'ok' : 'off'; line = `${num(pulse.vitals?.requests24h)} בקשות ב-24 שעות`; }
    if (n.id === 'site' || n.id === 'web') { v = site; line = ping.httpStatus ? `HTTP ${ping.httpStatus} · ${num(ping.ms)} ms` : ping.reason || ''; }
    if (n.id === 'worker') v = worst(cfs, site === 'bad' ? 'bad' : 'off');
    if (n.cf) { const list = arr(cf?.[n.cf]); v = cf && list.length ? cfs : 'off'; line = list.length ? list.map((x) => x.name || x.title || x.id).join(', ') : 'אין נתונים מ-Cloudflare'; }
    if (n.id === 'workersai') { v = cf ? cfs : 'off'; line = cf ? 'מחובר ל-Worker (binding AI)' : 'אין נתונים מ-Cloudflare'; }
    // an inferred red or yellow conclusion about this node's platform colours it too
    const hit = ins.filter((x) => (n.core && x.platform === 'cloudflare') || (n.id === 'site' && x.platform === 'apple') || (!n.cf && n.brand && n.brand !== 'cloudflare' && n.brand !== 'apple' && x.platform === n.brand));
    if (v !== 'off' && hit.some((x) => x.sev === 'bad')) v = 'bad'; else if (v === 'ok' && hit.some((x) => x.sev === 'warn')) v = 'warn';
    out[n.id] = { state: v, line, why: hit[0]?.title || '' };
  }
  return out;
}

function edgePath(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dy) > Math.abs(dx) * 0.6 || Math.abs(dy) > 120) { // mostly vertical, or a row apart: leave from top/bottom
    const y1 = a.y + Math.sign(dy) * H / 2, y2 = b.y - Math.sign(dy) * H / 2, my = (y1 + y2) / 2;
    return `M${a.x} ${y1}C${a.x} ${my} ${b.x} ${my} ${b.x} ${y2}`;
  }
  const x1 = a.x + Math.sign(dx) * wOf(a) / 2, x2 = b.x - Math.sign(dx) * wOf(b) / 2, mx = (x1 + x2) / 2;
  return `M${x1} ${a.y}C${mx} ${a.y} ${mx} ${b.y} ${x2} ${b.y}`;
}
// A busier edge flows faster: 6 s for a trickle down to 1.2 s for heavy traffic.
const dur = (n) => (isNum(n) && n > 0 ? Math.max(1.2, 6 - Math.log10(n + 1) * 1.1) : 4).toFixed(2);

function markSvg(n) {
  if (!n.brand) return raw('<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="3.6"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/></svg>');
  if (n.brand === 'apple' || PLATFORMS[n.brand]?.path) return mark(n.brand, 16);
  return raw(`<svg viewBox="0 0 16 16" width="16" height="16"><text x="8" y="12.5" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor">${(PLATFORMS[n.brand]?.name || n.id).slice(0, 1)}</text></svg>`);
}

function archMap(pulse, d, ins) {
  const S = nodeStates(pulse, d, ins); const v = pulse.vitals || {};
  const traffic = { req: v.requests24h, ai: v.modelCalls, err: arr(v.sentrySeries).reduce((a, b) => a + b, 0), deploy: arr(pulse.events).filter((e) => e.kind === 'deploy').length };
  const counts = Object.values(S).reduce((m, x) => ({ ...m, [x.state]: (m[x.state] || 0) + 1 }), {});
  const edges = EDGES.map(([a, b, t]) => {
    const A = byNode[a], B = byNode[b]; const sa = S[a].state, sb = S[b].state;
    const state = sa === 'off' || sb === 'off' ? 'off' : sa === 'bad' || sb === 'bad' ? 'bad' : sa === 'warn' || sb === 'warn' ? 'warn' : 'ok';
    const p = edgePath(A, B);
    return html`<g class="ae ae-${state}" data-k="ae-${a}-${b}" data-a="${a}" data-b="${b}"><path class="ae-l" d="${p}"/>${state === 'off' ? '' : html`<path class="ae-f" d="${p}" style="--dur:${dur(traffic[t])}s"/>`}</g>`;
  });
  const nodes = NODES.map((n) => {
    const s = S[n.id]; const page = n.page || PLATFORMS[n.brand]?.page || 'connect'; const W = wOf(n);
    return html`<a class="an an-${s.state}" href="#/${page}" data-k="an-${n.id}" data-n="${n.id}" transform="translate(${n.x - W / 2} ${n.y - H / 2})" style="${n.brand ? brandVars(n.brand) : ''}">
      <title>${n.label} · ${STATE_HE[s.state]}${s.line ? ` · ${s.line}` : ''}${s.why ? ` · ${s.why}` : ''}</title>
      ${s.state === 'bad' ? html`<rect class="an-r" width="${W}" height="${H}" rx="9"/>` : ''}
      <rect class="an-bg" width="${W}" height="${H}" rx="8"/>
      <g class="an-m" transform="translate(${W - 26} 10)">${markSvg(n)}</g>
      <text class="an-t" x="${(W - 6) / 2}" y="${H / 2 + 4.5}" text-anchor="middle">${n.label}</text>
      <circle class="an-d" cx="13" cy="${H / 2}" r="3.5"/>
    </a>`;
  });
  return html`<section class="card flush amap-card" aria-labelledby="h-map">
    <h2 class="card-h" id="h-map">${icon('explorer', 16)}מפת המערכות<small>צבע לפי מצב · הקווים זזים לפי התנועה · לחיצה פותחת את הדף</small></h2>
    <div class="amap-w"><svg class="amap" viewBox="0 0 1000 440" role="group" aria-label="מפת המערכות של הפרויקט">
      <g class="amap-e">${edges}</g>
      <g class="amap-n">${nodes}</g>
    </svg></div>
    <p class="amap-l">${['ok', 'warn', 'bad', 'off'].map((s) => html`<span><i class="dot dot-${s}" aria-hidden="true"></i>${STATE_HE[s]} · ${num(counts[s] || 0)}</span>`)}<span class="amap-tr">${compact(v.requests24h)} בקשות ב-24 שעות · ${compact(v.modelCalls)} קריאות למודלים</span></p>
  </section>`;
}

// ---------------------------------------------------------------- what is happening and what to do
function insightsFeed(ins) {
  if (ins == null) return html`<p class="empty" style="padding:14px 20px">מחשבים מסקנות מכל הפלטפורמות…</p>`;
  if (!ins.length) return html`<p class="empty good" style="padding:14px 20px">אין כרגע שום דבר שדורש אתכם. כל מה שהלוח יודע לבדוק נראה תקין.</p>`;
  return html`<ol class="ins">${ins.map((x) => html`<li class="in in-${x.sev}" data-k="in-${x.id}" style="${PLATFORMS[x.platform] ? brandVars(x.platform) : ''}">
    <span class="in-sev" aria-hidden="true">${icon(x.sev === 'info' ? 'status' : 'alert', 15)}</span>
    <div class="in-m">
      <p class="in-h">${PLATFORMS[x.platform] ? logo(x.platform, 'sm') : ''}<b dir="auto">${x.title}</b><span class="chip chip-sm chip-${x.sev === 'bad' ? 'bad' : x.sev === 'warn' ? 'warn' : 'mid'}">${SEV_HE[x.sev]}</span></p>
      <p class="in-w" dir="auto">${x.why}</p>
      ${arr(x.evidence).length ? html`<dl class="in-e">${x.evidence.map((e) => html`<div><dt>${e.k}</dt><dd><bdi>${e.v}</bdi></dd></div>`)}</dl>` : ''}
    </div>
    ${x.action ? html`<div class="in-a"><button class="btn btn-sm ${x.sev === 'bad' ? 'btn-primary' : ''}" data-act="app:insight" data-iid="${x.id}">${x.action.label}${icon('arrow', 14)}</button></div>` : ''}
  </li>`)}</ol>`;
}

// ---------------------------------------------------------------- cross-platform timeline
const KIND_HE = { ci: 'בדיקות', commit: 'קומיט', deploy: 'פריסה', run: 'הרצה', incident: 'תקלה אצל ספק', error: 'שגיאה' };
function swimlane(ev, now) {
  const t = ev.map((e) => Date.parse(e.at)).filter(Number.isFinite); if (t.length < 2) return '';
  const from = Math.min(...t); const span = Math.max(now - from, 60_000);
  const plats = [...new Set(ev.map((e) => e.platform))];
  const RW = 440, L = 88, row = 24, h = plats.length * row + 22;
  // RTL: lane names on the right, the past next to them, now at the left edge
  const x = (ms) => 8 + ((now - ms) / span) * (RW - L - 20);
  return html`<svg class="tl-s" viewBox="0 0 ${RW} ${h}" role="img" aria-label="${`ציר זמן: ${num(ev.length)} אירועים ב-${rel(new Date(from))}`}">
    ${plats.map((p, i) => html`<g class="tl-r" transform="translate(0 ${i * row + 4})" style="${brandVars(p)}">
      <line x1="8" x2="${RW - L}" y1="11" y2="11"/><text x="${RW - L + 10}" y="15">${PLATFORMS[p]?.name || p}</text>
      ${ev.filter((e) => e.platform === p).map((e) => html`<circle class="tl-d tl-${e.tone || 'ok'}" data-k="td-${e.at}-${e.kind}" cx="${x(Date.parse(e.at)).toFixed(1)}" cy="11" r="4.5"><title>${e.title} · ${rel(e.at)}</title></circle>`)}
    </g>`)}
    <text class="tl-ax" x="8" y="${h - 4}">עכשיו</text><text class="tl-ax" x="${RW - L}" y="${h - 4}" text-anchor="end">${rel(new Date(from))}</text>
  </svg>`;
}
function timeline(events, now) {
  const ev = arr(events);
  const key = (e) => `${e.at}|${e.title}`;
  st.fresh = new Set();
  if (st.seen) { for (const e of ev) if (!st.seen.has(key(e))) st.fresh.add(key(e)); }
  st.seen = new Set(ev.map(key));
  const plats = [...new Set(ev.map((e) => e.platform))];
  const shown = ev.filter((e) => !st.feed || e.platform === st.feed);
  if (!ev.length) return html`<p class="empty" style="padding:14px 20px">עוד אין אירועים. קומיטים, בדיקות ופריסות יופיעו כאן כשיקרו.</p>`;
  return html`<div class="tl-w">${swimlane(shown, now)}</div>
    <div class="feed-f" role="group" aria-label="סינון לפי פלטפורמה">
      <button class="chip chip-btn ${!st.feed ? 'on' : ''}" data-act="feed" data-p="" aria-pressed="${!st.feed}">הכול · ${num(ev.length)}</button>
      ${plats.map((p) => html`<button class="chip chip-btn ${st.feed === p ? 'on' : ''}" data-act="feed" data-p="${p}" aria-pressed="${st.feed === p}">${PLATFORMS[p]?.name || p}</button>`)}</div>
    <ol class="feed" aria-live="polite" aria-relevant="additions">${shown.slice(0, 14).map((e) => html`<li class="fe fe-${e.tone} ${st.fresh.has(key(e)) ? 'is-new' : ''}" data-k="fe-${key(e)}">${logo(e.platform, 'sm')}
      <div class="fe-m">${e.url ? html`<a class="fe-t" dir="auto" href="${e.url}" target="_blank" rel="noopener noreferrer">${e.title}</a>` : html`<p class="fe-t" dir="auto">${e.title}</p>`}
      <p class="fe-s"><i class="dot" aria-hidden="true"></i>${PLATFORMS[e.platform]?.name || e.platform} · ${KIND_HE[e.kind] || e.kind} · ${ago(e.at)}</p></div></li>`)}</ol>`;
}

// ---------------------------------------------------------------- quick actions and every platform
function quick(d) {
  const all = catalog(d); const pick = []; const per = {};
  for (const a of all) { per[a.platform] = (per[a.platform] || 0) + 1; if (per[a.platform] <= 2) pick.push(a); }
  if (!pick.length) return html`<p class="empty">הפעולות יופיעו כשהנתונים ייטענו.</p>`;
  return html`<div class="qa">${pick.slice(0, 12).map((a) => html`<button class="qa-b" style="${brandVars(a.platform)}" data-act="app:act" data-aid="${aid(a)}">
    ${logo(a.platform, 'md')}<span class="qa-m"><b>${a.label}</b><small>${PLATFORMS[a.platform]?.name} · ${a.hint}</small></span>${icon('arrow', 16)}</button>`)}</div>`;
}
function grid(plats) {
  return html`<div class="pgrid">${arr(plats).map((p) => {
    const P = PLATFORMS[p.id] || { name: p.id, he: '' }; const m = p.metric;
    return html`<a class="pc spot is-${p.state}" href="${pageOf(p.id)}" style="${brandVars(p.id)}" data-k="pc-${p.id}">
      <div class="pc-h">${logo(p.id, 'md')}<div><b>${P.name}</b><small>${P.he}</small></div><i class="dot dot-${p.state}" aria-hidden="true"></i></div>
      <p class="pc-l" dir="auto">${p.line || STATE_HE[p.state]}</p>
      <p class="pc-v">${m ? html`<span>${m.label}</span><b>${m.unit === '$' ? `$${num(m.value, 2)}` : num(m.value)}</b>` : html`<span>${p.state === 'off' ? 'להוספת מפתח' : ''}</span>${icon('key', 15)}`}</p>
    </a>`;
  })}</div>`;
}

// hovering a node lights its edges and dims the rest
function hover(e) {
  const map = e.currentTarget; const n = e.type === 'pointerleave' || e.type === 'focusout' ? null : e.target.closest?.('.an')?.dataset.n;
  map.classList.toggle('is-focus', !!n);
  for (const g of map.querySelectorAll('.ae')) g.classList.toggle('is-hl', !!n && (g.dataset.a === n || g.dataset.b === n));
}

export default {
  id: 'hq', title: 'מרכז הפיקוד', nav: 'מרכז הפיקוד', glyph: 'hq', eyebrow: 'Apple · מרכז הפיקוד של הריפו',
  sub: 'כל המערכות של הפרויקט במסך אחד: מה קורה עכשיו, מה דורש אתכם, ומה אפשר לתקן בלחיצה',
  needs: ['pulse', 'github', 'sentry', 'hf', 'supabase', 'cloudflare', 'apple', 'connectors'],
  render(d, ctx) {
    const pulse = d.pulse;
    if (!ok(pulse)) return html`<div class="fail fail-bad" role="alert"><div class="fail-ic">!</div><div class="fail-tx"><b>הדופק של המערכת לא זמין</b><p>${pulse?.reason || ''}</p><button class="btn btn-sm" data-act="app:refresh">לנסות שוב</button></div></div>`;
    const ins = ctx.insights; const list = arr(ins);
    const now = Date.parse(pulse.fetchedAt) || Date.now();
    return html`${hero(pulse, list, ctx.store)}
      ${vitals(pulse.vitals || {}, d, pulse.platforms)}
      <div class="g g21 hq-now">
        <section class="card flush" id="hq-ins" aria-labelledby="h-ins"><h2 class="card-h" id="h-ins">${icon('bolt', 16)}מה קורה עכשיו ומה לעשות<small>מסקנות מכל הפלטפורמות יחד, הדחוף ראשון</small></h2>${insightsFeed(ins)}</section>
        <section class="card flush" aria-labelledby="h-tl"><h2 class="card-h" id="h-tl">${icon('status', 16)}ציר הזמן<small>קומיטים, בדיקות, פריסות ותקלות מכל המערכות</small></h2>${timeline(pulse.events, now)}</section>
      </div>
      ${archMap(pulse, d, list)}
      ${sec('פעולות בלחיצה', 'כל לחיצה פותחת חלון שמסביר בדיוק מה ישתנה ואיך מבטלים. במצב ניסוי רק רואים מה היה נשלח. Ctrl/⌘+K מציג את כל הפעולות מכל הפלטפורמות.')}
      ${quick(d)}
      ${sec('כל הפלטפורמות', 'לחיצה על כרטיס פותחת את הדף שלו')}
      ${grid(pulse.platforms)}`;
  },
  mount(root) {
    st.off = [];
    const on = (el, ev, fn) => { el.addEventListener(ev, fn); st.off.push(() => el.removeEventListener(ev, fn)); };
    const map = root.querySelector('.amap'); if (map) { on(map, 'pointerover', hover); on(map, 'pointerleave', hover); on(map, 'focusin', hover); on(map, 'focusout', hover); }
  },
  unmount() { for (const f of st.off) f(); st.off = []; },
  actions: {
    feed(el, ctx) { st.feed = el.dataset.p; ctx.rerender(); },
  },
};
