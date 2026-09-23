// The HQ: one screen for the whole repo. Hero with every platform's live pulse over the site's
// noise field, a ticker of the latest events, vitals with sparklines, what needs attention (each
// with its one-click fix), the live feed, quick actions and every platform, connected or not.
import { html, num, compact, bytes, pct, ago, arr, isNum } from '../ui.js';
import { PLATFORMS, logo, icon, brandVars } from '../logos.js';
import { rn, spark } from '../fx.js';
import { catalog, gh, hfx, sx, aid } from '../actions.js';
import { stat, actBtn, extBtn, sec } from './kit.js';

const st = { feed: '', tickerPaused: false, seen: null, fresh: new Set() };
const ok = (x) => x && x.ok !== false;
const pageOf = (id) => `#/${PLATFORMS[id]?.page || 'connect'}`;
const STATE_HE = { ok: 'תקין', warn: 'לבדוק', bad: 'תקלה', off: 'לא מחובר' };

function headline(plats) {
  const on = plats.filter((p) => p.state !== 'off');
  const bad = on.filter((p) => p.state === 'bad'); const warn = on.filter((p) => p.state === 'warn');
  const names = (xs) => xs.slice(0, 3).map((p) => PLATFORMS[p.id]?.name || p.id).join(', ');
  if (bad.length) return { tone: 'bad', h: html`<em>${num(bad.length)}</em> ${bad.length === 1 ? 'דבר דורש' : 'דברים דורשים'} טיפול עכשיו`, p: `${names(bad)}${warn.length ? `, ועוד ${num(warn.length)} שכדאי לבדוק` : ''}.` };
  if (warn.length) return { tone: 'warn', h: html`הכול עובד. <em>${num(warn.length)}</em> דברים שכדאי לבדוק`, p: `${names(warn)}.` };
  return { tone: 'ok', h: html`הכול ירוק. <em>כל המערכות עובדות</em>`, p: 'אין תקלות פתוחות שדורשות אתכם.' };
}

function hero(pulse, store) {
  const plats = arr(pulse.platforms); const hd = headline(plats);
  const live = plats.filter((p) => p.state !== 'off').length;
  const ping = pulse.ping || {};
  return html`<section class="hero" data-nf aria-labelledby="hq-h">
    <div class="hero-g"><div>
      <p class="eyebrow hero-e is-${hd.tone}"><i class="live-d" aria-hidden="true"></i>מרכז הפיקוד · ${num(live)} פלטפורמות מדווחות בזמן אמת</p>
      <h2 class="hero-h" id="hq-h">${hd.h}</h2>
      <p class="hero-p">${hd.p} ${num(plats.length - live)} חיבורים נוספים מחכים למפתח. הכול מתעדכן לבד כל 20 שניות.</p>
      <div class="chips" role="list" aria-label="מצב כל פלטפורמה">${plats.map((p, k) => html`<a role="listitem" class="pchip ${p.state === 'off' ? 'is-off' : ''}" href="${pageOf(p.id)}" style="${brandVars(p.id)};--k:${k}" title="${p.line || ''}">
        ${logo(p.id, 'sm')}<span>${PLATFORMS[p.id]?.name || p.id}</span><i class="dot dot-${p.state}" aria-hidden="true"></i><span class="sr">${STATE_HE[p.state] || p.state}: ${p.line || ''}</span></a>`)}</div>
    </div>
    <aside class="ping" style="${brandVars('apple')}" aria-label="זמן התגובה של האתר">
      <p class="stat-k">${logo('apple', 'sm')}<span>האתר עונה תוך</span></p>
      <p class="stat-v">${isNum(ping.ms) ? rn('hq-ping', ping.ms, num(ping.ms)) : '—'}<small>ms</small></p>
      <p class="stat-s">HTTP ${ping.httpStatus ?? '—'} · גרסה <bdi class="mono">${ping.buildSha || ping.version || '—'}</bdi></p>
      ${spark(store.pings.length > 1 ? store.pings : [ping.ms || 0, ping.ms || 0], { h: 44, label: 'זמן תגובה בדגימות האחרונות' })}
      <p class="stat-s">${num(store.pings.length)} דגימות מאז שנפתח הדף</p>
    </aside></div>
  </section>`;
}

function tk(e) {
  const inner = html`${logo(e.platform, 'sm')}<i class="dot" aria-hidden="true"></i><span>${e.title}</span>${ago(e.at)}`;
  return e.url ? html`<a class="tk tk-${e.tone}" href="${e.url}" target="_blank" rel="noopener noreferrer" tabindex="-1">${inner}</a>` : html`<span class="tk tk-${e.tone}">${inner}</span>`;
}
function ticker(events) {
  const ev = arr(events).slice(0, 18); if (!ev.length) return '';
  return html`<section class="ticker ${st.tickerPaused ? 'is-paused' : ''}" aria-label="אירועים אחרונים (רצועה נעה)">
    <span class="ticker-l"><span class="live-d" aria-hidden="true"></span>עכשיו</span>
    <div class="ticker-v" aria-hidden="true"><div class="ticker-r" style="--dur:${Math.max(40, ev.length * 6)}s">${ev.map(tk)}${ev.map(tk)}</div></div>
    <button class="ib" data-act="tick" aria-pressed="${st.tickerPaused}" aria-label="${st.tickerPaused ? 'להפעיל את הרצועה' : 'לעצור את הרצועה'}">${icon(st.tickerPaused ? 'play' : 'pause', 14)}</button>
  </section>`;
}

function vitals(v, d) {
  const ci = arr(v.ciSeries); const ciRate = ci.length ? ci.filter(Boolean).length / ci.length : null;
  const spendF = v.maxMonthlyUsd ? v.monthUsd / v.maxMonthlyUsd : null;
  const users = d.supabase?.authUsers ?? v.authUsers;
  return html`<section class="bento" aria-label="מדדים חיים">
    ${stat({ key: 'hq-req', label: 'בקשות לאתר ב-24 שעות', value: v.requests24h, text: num(v.requests24h), platform: 'cloudflare', series: v.requestsSeries, sub: `${num(v.errors24h)} שגיאות · לפי שעה`, href: '#/cloudflare', wide: true })}
    ${stat({ key: 'hq-spend', label: 'הוצאה על AI החודש', value: v.monthUsd, text: isNum(v.monthUsd) ? `$${num(v.monthUsd, 2)}` : '—', platform: 'apple', series: v.spendSeries, sub: v.maxMonthlyUsd ? `${pct(spendF)} מתקרה של $${num(v.maxMonthlyUsd, 2)}` : '', tone: spendF > 0.8 ? 'warn' : '', href: '#/apple', wide: true })}
    ${stat({ key: 'hq-ci', label: 'בדיקות CI שעברו', value: ciRate == null ? null : Math.round(ciRate * 100), text: ciRate == null ? '—' : `${num(Math.round(ciRate * 100))}%`, platform: 'github', series: ci, sparkCls: ciRate != null && ciRate < 0.5 ? 'bad' : '', tone: ciRate != null && ciRate < 0.5 ? 'bad' : '', sub: `${num(ci.length)} הריצות האחרונות`, href: '#/github' })}
    ${stat({ key: 'hq-sentry', label: 'תקלות פתוחות', value: v.sentryOpen, platform: 'sentry', series: v.sentrySeries, sparkCls: 'bad', tone: v.sentryOpen ? 'warn' : 'good', sub: 'אירועים לפי שעה, 24 שעות', href: '#/sentry' })}
    ${stat({ key: 'hq-calls', label: 'קריאות למודלים', value: v.modelCalls, platform: 'apple', sub: `${compact(v.tokens)} טוקנים · ${pct(v.cacheHit)} מהמטמון`, href: '#/apple' })}
    ${stat({ key: 'hq-commits', label: 'קומיטים ב-14 יום', value: arr(v.commits14).reduce((a, b) => a + b, 0), platform: 'github', series: v.commits14, sub: 'לפי יום', href: '#/github' })}
    ${stat({ key: 'hq-db', label: 'מסד הנתונים', value: v.dbBytes, text: bytes(v.dbBytes), platform: 'supabase', sub: `${num(users)} משתמשים רשומים`, href: '#/supabase', wide: true })}
    ${stat({ key: 'hq-sec', label: 'אזהרות אבטחה', value: v.securityWarn, platform: 'supabase', tone: v.securityWarn ? 'warn' : 'good', sub: 'מהבודק של Supabase', href: '#/supabase', wide: true })}
  </section>`;
}

/** Everything that needs the owner, each with the one safe click that fixes or explains it. */
function attention(d) {
  const out = [];
  const g = d.github;
  if (ok(g)) {
    const last = arr(g.runs).find((r) => r.status === 'completed');
    if (last && ['failure', 'timed_out', 'startup_failure'].includes(last.conclusion)) {
      out.push({ sev: 'bad', p: 'github', t: `הבדיקות האחרונות נכשלו: ${last.name}`, s: html`ענף <bdi>${last.branch}</bdi> · ${ago(last.createdAt)}`,
        a: html`${actBtn(gh.rerunFailed(last), 'להריץ שוב את מה שנכשל', { ic: 'refresh' })}${extBtn(last.url, 'לוג')}` });
    }
  }
  for (const s of arr(d.hf?.spaces)) {
    if (!/RUNNING/.test(s.runtimeStage || '')) {
      out.push({ sev: 'warn', p: 'huggingface', t: `ה-Space ${s.id.split('/')[1]} לא רץ`, s: html`מצב: <bdi class="mono">${s.runtimeStage || '—'}</bdi>${s.runtimeStage === 'NO_APP_FILE' ? ' · אין בו קובץ אפליקציה, אז הפעלה מחדש לא תעזור עד שיעלה קוד' : ''}`,
        a: html`${actBtn(hfx.restart(s), 'הפעלה מחדש', { ic: 'refresh' })}${extBtn(s.url, 'פתיחה')}` });
    }
  }
  const iss = arr(d.sentry?.issues);
  const hot = iss.filter((i) => i.priority === 'high' || i.level === 'fatal').slice(0, 2);
  for (const i of hot.length ? hot : iss.slice(0, 1)) {
    out.push({ sev: i.level === 'error' || i.level === 'fatal' ? 'bad' : 'warn', p: 'sentry', t: i.title, s: html`<bdi class="mono">${i.shortId}</bdi> · ${num(i.count)} פעמים · נראתה ${ago(i.lastSeen)}`,
      a: html`${actBtn(sx.bookmark(i), i.bookmarked ? 'הסרת סימון' : 'סימון במועדפים', { ic: 'check' })}${extBtn(i.url, 'פרטים')}` });
  }
  const sb = d.supabase;
  if (ok(sb) && sb.advisors?.security?.warn) {
    out.push({ sev: 'warn', p: 'supabase', t: `${num(sb.advisors.security.warn)} אזהרות אבטחה במסד הנתונים`, s: 'הגדרות אבטחה לא משתנות מכאן בכוונה. פותחים את הבודק ב-Supabase ומטפלים שם.',
      a: extBtn(sb.project?.dashboardUrl ? `${sb.project.dashboardUrl}/advisors/security` : null, 'לבודק האבטחה') });
  }
  const b = d.apple?.billing;
  if (b?.production && b.keyMode === 'test') {
    out.push({ sev: 'info', p: 'stripe', t: 'התשלומים באתר עדיין במצב בדיקה', s: 'האתר בפרודקשן אבל מפתח Stripe הוא מפתח test, כך שאף אחד לא מחויב באמת. מעבר ל-live הוא החלטה שלכם ונעשה ב-Stripe.', a: '' });
  }
  for (const e of arr(d.pulse?.events).filter((x) => x.kind === 'incident').slice(0, 2)) {
    out.push({ sev: 'info', p: e.platform, t: e.title, s: html`דף הסטטוס הרשמי · ${ago(e.at)}`, a: extBtn(e.url, 'לדף הסטטוס') });
  }
  if (!out.length) return html`<p class="empty good" style="padding:14px 20px">אין כרגע שום דבר שדורש אתכם.</p>`;
  return html`<ul class="att">${out.map((x) => html`<li style="${brandVars(x.p)}"><span class="sev sev-${x.sev}" aria-hidden="true"></span>${logo(x.p, 'sm')}
    <div class="li-m"><span class="li-t" dir="auto" title="${String(x.t)}">${x.t}</span><span class="li-s">${x.s}</span></div><div class="li-a">${x.a}</div></li>`)}</ul>`;
}

function feed(events) {
  const ev = arr(events);
  const key = (e) => `${e.at}|${e.title}`;
  st.fresh = new Set();
  if (st.seen) { for (const e of ev) if (!st.seen.has(key(e))) st.fresh.add(key(e)); }
  st.seen = new Set(ev.map(key));
  const plats = [...new Set(ev.map((e) => e.platform))];
  const shown = ev.filter((e) => !st.feed || e.platform === st.feed).slice(0, 40);
  return html`<div class="feed-f" role="group" aria-label="סינון לפי פלטפורמה">
      <button class="chip chip-btn ${!st.feed ? 'on' : ''}" data-act="feed" data-p="" aria-pressed="${!st.feed}">הכול · ${num(ev.length)}</button>
      ${plats.map((p) => html`<button class="chip chip-btn ${st.feed === p ? 'on' : ''}" data-act="feed" data-p="${p}" aria-pressed="${st.feed === p}">${PLATFORMS[p]?.name || p}</button>`)}</div>
    <ol class="feed" aria-live="polite" aria-relevant="additions">${shown.map((e) => html`<li class="fe fe-${e.tone} ${st.fresh.has(key(e)) ? 'is-new' : ''}">${logo(e.platform, 'sm')}
      <div class="fe-m">${e.url ? html`<a class="fe-t" dir="auto" href="${e.url}" target="_blank" rel="noopener noreferrer">${e.title}</a>` : html`<p class="fe-t" dir="auto">${e.title}</p>`}
      <p class="fe-s"><i class="dot" aria-hidden="true"></i>${PLATFORMS[e.platform]?.name || e.platform} · ${ago(e.at)}</p></div></li>`)}</ol>`;
}

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
    return html`<a class="pc spot is-${p.state}" href="${pageOf(p.id)}" style="${brandVars(p.id)}">
      <div class="pc-h">${logo(p.id, 'md')}<div><b>${P.name}</b><small>${P.he}</small></div><i class="dot dot-${p.state}" aria-hidden="true"></i></div>
      <p class="pc-l" dir="auto">${p.line || STATE_HE[p.state]}</p>
      <p class="pc-v">${m ? html`<span>${m.label}</span><b>${m.unit === '$' ? `$${num(m.value, 2)}` : num(m.value)}</b>` : html`<span>${p.state === 'off' ? 'להוספת מפתח' : ''}</span>${icon('key', 15)}`}</p>
    </a>`;
  })}</div>`;
}

export default {
  id: 'hq', title: 'מרכז הפיקוד', nav: 'מרכז הפיקוד', glyph: 'hq', eyebrow: 'Apple · מרכז הפיקוד של הריפו',
  sub: 'כל הפלטפורמות של הפרויקט במסך אחד: מה המצב עכשיו, מה דורש אתכם, ומה אפשר לתקן בלחיצה',
  needs: ['pulse', 'github', 'sentry', 'hf', 'supabase', 'cloudflare', 'apple', 'connectors'],
  render(d, ctx) {
    const pulse = d.pulse;
    if (!ok(pulse)) return html`<div class="fail fail-bad" role="alert"><div class="fail-ic">!</div><div class="fail-tx"><b>הדופק של המערכת לא זמין</b><p>${pulse?.reason || ''}</p><button class="btn btn-sm" data-act="app:refresh">לנסות שוב</button></div></div>`;
    return html`${hero(pulse, ctx.store)}
      ${ticker(pulse.events)}
      ${vitals(pulse.vitals || {}, d)}
      <div class="g g21">
        <section class="card flush" aria-labelledby="h-att"><h2 class="card-h" id="h-att">${icon('alert', 16)}דורש טיפול<small>כל שורה עם התיקון שלה</small></h2>${attention(d)}</section>
        <section class="card flush" aria-labelledby="h-feed"><h2 class="card-h" id="h-feed">${icon('status', 16)}מה קורה עכשיו<small>קומיטים, בדיקות, פריסות, תקלות</small></h2>${feed(pulse.events)}</section>
      </div>
      ${sec('פעולות בלחיצה', 'כל לחיצה פותחת חלון שמסביר בדיוק מה ישתנה ואיך מבטלים. במצב ניסוי רק רואים מה היה נשלח.')}
      ${quick(d)}
      ${sec('כל הפלטפורמות', 'לחיצה על כרטיס פותחת את הדף שלו')}
      ${grid(pulse.platforms)}`;
  },
  actions: {
    tick(el, ctx) { st.tickerPaused = !st.tickerPaused; const t = el.closest('.ticker'); t.classList.toggle('is-paused', st.tickerPaused); el.setAttribute('aria-pressed', String(st.tickerPaused)); el.innerHTML = icon(st.tickerPaused ? 'play' : 'pause', 14).s; },
    feed(el, ctx) { st.feed = el.dataset.p; ctx.rerender(); },
  },
};
