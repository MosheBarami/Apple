// Sentry, in Sentry's own look: the issue stream (unread dot, level bar, short id, culprit, 14-day
// trend bars, events, users, priority) with one-click reversible triage and the latest event's stack
// trace for the selected issue; releases with their crash-free rate (said plainly when it is not
// measured), performance (said plainly when nothing is sent), alert workflows + detectors, projects,
// and daily event volume by outcome. The opening conclusions are computed by the server.
import { html, raw, num, compact, ago, arr, isFail, part, shortDay, bars, legend } from '../ui.js';
import { icon } from '../logos.js';
import { stat, actBtn, extBtn, notConnected } from './kit.js';
import { sa } from '../actions/sentry.js';

const st = { tab: 'issues', proj: '', q: '', sort: 'events', sel: null };
const TABS = [['issues', 'תקלות'], ['releases', 'גרסאות'], ['perf', 'ביצועים'], ['alerts', 'התראות'], ['projects', 'פרויקטים'], ['stats', 'נפח אירועים']];
const LEVEL = { fatal: ['bad', 'קריטית'], error: ['bad', 'שגיאה'], warning: ['warn', 'אזהרה'], info: ['mid', 'מידע'], debug: ['off', 'דיבאג'] };
const PRI = { high: ['bad', 'גבוהה'], medium: ['warn', 'בינונית'], low: ['off', 'נמוכה'] };
const SUB = { regressed: ['bad', 'חזרה אחרי תיקון'], escalating: ['bad', 'מחמירה'], new: ['mid', 'חדשה'], ongoing: ['off', 'נמשכת'], archived_until_escalating: ['off', 'מושתקת'] };
const QS = [['', 'הכול'], ['high', 'עדיפות גבוהה'], ['unread', 'לא נקראו'], ['unhandled', 'לא נתפסו'], ['star', 'מועדפים']];
const SORTS = [['events', 'הכי הרבה אירועים'], ['last', 'נראו לאחרונה'], ['new', 'הכי חדשות'], ['priority', 'עדיפות']];
const PRANK = { high: 0, medium: 1, low: 2 };
const mono = (s) => html`<bdi class="mono">${s}</bdi>`;
const tag = (tone, label) => html`<span class="chip chip-sm chip-${tone}">${label}</span>`;

/** Sentry's trend column: grey bars, the peak labelled. */
function trendBars(v, label) {
  const a = arr(v).map((x) => +x || 0); if (!a.length) return html`<span class="faint">—</span>`;
  const max = Math.max(...a) || 1, w = 120, h = 28, bw = w / a.length;
  const rects = a.map((x, i) => `<rect x="${(i * bw + 0.5).toFixed(1)}" y="${(h - 2 - (x / max) * (h - 4)).toFixed(1)}" width="${Math.max(1, bw - 1.5).toFixed(1)}" height="${Math.max(x ? 1.5 : 0, (x / max) * (h - 4)).toFixed(1)}" rx="1"/>`).join('');
  return html`<span class="sx-trend"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${label}">${raw(`<line x1="0" x2="${w}" y1="${h - 1}" y2="${h - 1}" class="sx-base"/>${rects}`)}</svg><small class="mono">${compact(max)}</small></span>`;
}

function shown(iss) {
  const f = iss.filter((i) => (!st.proj || i.project === st.proj) && (!st.q || (st.q === 'high' ? i.priority === 'high' : st.q === 'unread' ? !i.seen
    : st.q === 'unhandled' ? i.unhandled : i.bookmarked)));
  const by = { events: (a, b) => b.count - a.count, last: (a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen),
    new: (a, b) => Date.parse(b.firstSeen) - Date.parse(a.firstSeen), priority: (a, b) => (PRANK[a.priority] ?? 3) - (PRANK[b.priority] ?? 3) || b.count - a.count };
  return f.sort(by[st.sort] || by.events);
}

function row(i, on) {
  const [lc] = LEVEL[i.level] || ['off']; const [pc, pl] = PRI[i.priority] || ['off', '—']; const sub = SUB[i.substatus];
  const [head, ...rest] = String(i.title).split(': ');
  return html`<button class="sx-row ${on ? 'on' : ''} ${i.seen ? '' : 'unread'}" data-k="iss-${i.id}" data-act="sel" data-f="${i.id}" aria-pressed="${String(on)}">
    <span class="sx-issue"><span class="sx-lvl sx-${lc}" aria-label="${(LEVEL[i.level] || [, i.level])[1]}"></span>
      <span class="sx-t"><b dir="auto">${rest.length ? head : i.title}</b>${rest.length ? html`<span dir="auto">${rest.join(': ')}</span>` : ''}</span>
      <span class="sx-meta">${i.seen ? '' : html`<i class="sx-dot" aria-label="לא נקראה"></i>`}${mono(i.shortId || i.id)}${i.culprit ? mono(i.culprit) : ''}
        ${i.unhandled ? html`<span class="sx-unh">Unhandled</span>` : ''}${sub ? tag(sub[0], sub[1]) : ''}${i.bookmarked ? tag('mid', '★ מועדף') : ''}</span></span>
    <span class="sx-c-last">${ago(i.lastSeen)}</span><span class="sx-c-age">${ago(i.firstSeen)}</span>
    <span class="sx-c-trend">${trendBars(i.trend, `${i.shortId}: אירועים לפי יום, 14 ימים`)}</span>
    <span class="sx-c-n mono">${compact(i.count)}</span><span class="sx-c-u mono">${compact(i.users)}</span>
    <span class="sx-c-p">${tag(pc, pl)}</span></button>`;
}

function frames(ex) {
  const fr = [...arr(ex.frames)].reverse(); // most recent call first, as Sentry shows it
  return html`<div class="sx-ex" data-k="ex-${ex.type}"><p class="sx-ex-h" dir="ltr"><b>${ex.type || 'Error'}</b> ${ex.value || ''}</p>
    ${fr.length ? html`<ol class="sx-frames" dir="ltr">${fr.map((f, k) => html`<li class="sx-fr ${f.inApp ? 'app' : ''}" data-k="fr-${k}">
      <p><bdi class="mono sx-file">${f.file || '?'}</bdi> ${f.fn ? html`<span class="faint">in</span> <bdi class="mono">${f.fn}</bdi>` : ''}
        ${f.line != null ? html`<span class="faint">at line</span> <bdi class="mono">${f.line}${f.col != null ? `:${f.col}` : ''}</bdi>` : ''}${f.inApp ? html` <span class="chip chip-sm chip-mid">In App</span>` : ''}</p>
      ${arr(f.ctx).length ? html`<pre class="sx-code">${f.ctx.map(([ln, code]) => html`<span class="${ln === f.line ? 'hit' : ''}"><i>${ln}</i>${code}\n</span>`)}</pre>` : ''}</li>`)}</ol>`
    : html`<p class="empty">ל-exception הזה אין frames (ה-SDK לא שלח stack trace).</p>`}</div>`;
}

function detail(i, ev, org) {
  const [lc, ll] = LEVEL[i.level] || ['off', i.level]; const [pc, pl] = PRI[i.priority] || ['off', '—'];
  const evs = ev && !isFail(ev) ? ev : null;
  return html`<section class="card sx-detail" data-k="det-${i.id}" aria-labelledby="sx-dt">
    <header class="sx-dh"><div class="sx-dh-t"><p class="sx-meta">${mono(i.shortId)}${i.project ? mono(i.project) : ''}${tag(lc, ll)}${tag(pc, `עדיפות ${pl}`)}
      ${SUB[i.substatus] ? tag(SUB[i.substatus][0], SUB[i.substatus][1]) : ''}${i.unhandled ? html`<span class="sx-unh">Unhandled</span>` : ''}</p>
      <h2 id="sx-dt" dir="auto">${i.title}</h2>${i.culprit ? html`<p class="sx-culprit">${mono(i.culprit)}</p>` : ''}</div>
      <div class="sx-acts">${actBtn(sa.resolve(i), 'תוקן', { ic: 'check', cls: 'btn-sm btn-primary' })}
        ${actBtn(sa.ignore(i), 'השתקה', { ic: 'pause', cls: 'btn-sm' })}
        ${actBtn(sa.bookmark(i), i.bookmarked ? 'הסרה ממועדפים' : 'מועדף', { ic: '', cls: 'btn-sm' })}
        ${i.seen ? '' : actBtn(sa.seen(i), 'נקרא', { ic: '', cls: 'btn-sm' })}
        ${['high', 'medium', 'low'].filter((p) => p !== i.priority).map((p) => actBtn(sa.priority(i, p), `עדיפות ${PRI[p][1]}`, { ic: '', cls: 'btn-sm btn-ghost' }))}
        ${extBtn(i.url, 'פתיחה ב-Sentry', 'btn-sm btn-ghost')}</div></header>
    <div class="sx-dstats">${[['אירועים', num(i.count)], ['משתמשים', num(i.users)], ['נראתה לראשונה', ago(i.firstSeen)], ['נראתה לאחרונה', ago(i.lastSeen)],
      ['גרסה באירוע האחרון', evs?.release ? mono(evs.release) : '—']].map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</div>
    <div class="sx-dchart">${bars(arr(i.trend).map((v, k, a) => ({ day: `לפני ${a.length - 1 - k} ימים`, n: v })), [{ key: 'n', label: 'אירועים', color: 'var(--sx-viz)' }], { h: 120, x: (r) => r.day, xfmt: () => '' })}</div>
    ${ev == null ? html`<p class="empty">הסטאק טרייס נטען מראש רק לחמש התקלות העליונות (מגבלת הקצב של Sentry). ${extBtn(i.url, 'לפתוח את האירוע ב-Sentry', 'btn-sm btn-ghost')}</p>`
    : isFail(ev) ? part(ev, () => '', { title: 'האירוע האחרון לא נקרא' })
      : html`<h3 class="sx-h3">Stack trace <small class="faint">האירוע האחרון ${ago(evs.date)} · ${mono(evs.id?.slice(0, 8))}</small></h3>
        ${evs.exceptions.length ? evs.exceptions.map(frames) : html`<p class="empty">לאירוע הזה אין exception (הודעה בלבד).</p>`}
        ${evs.errors.length ? html`<div class="sx-perr">${evs.errors.map((e) => html`<p>${icon('alert', 14)}<bdi class="mono">${e.type}</bdi> ${e.msg}</p>`)}
          ${evs.errors.some((e) => e.type === 'js_no_source') ? html`<p class="faint">בלי source maps Sentry מציג את הקוד המוקטן בלבד. העלאת source maps בבנייה תחזיר שמות קבצים ושורות מקוריים.</p>` : ''}</div>` : ''}
        ${evs.tags.length ? html`<h3 class="sx-h3">Tags</h3><div class="sx-tags">${evs.tags.map((t) => html`<span class="sx-tag"><b>${t.k}</b><bdi class="mono">${t.v}</bdi></span>`)}</div>` : ''}`}
  </section>`;
}

function issuesTab(s) {
  const iss = arr(s.issues); const list = shown(iss); const projects = arr(s.projects);
  const sel = list.find((i) => i.id === st.sel) || list[0];
  return html`<div class="sx-tab" data-k="tab-issues">
    <div class="sx-filters"><div class="sx-join" role="group" aria-label="פרויקט">${[{ slug: '' }, ...projects].map((p) => html`<button class="sx-jb ${st.proj === p.slug ? 'on' : ''}" data-act="proj" data-f="${p.slug}" aria-pressed="${String(st.proj === p.slug)}">${p.slug ? mono(p.slug) : 'כל הפרויקטים'}</button>`)}</div>
      <span class="sx-join"><span class="sx-jb is-static">14D</span></span>
      <label class="sx-sort"><span class="sr">מיון</span><select data-change="sort" aria-label="מיון">${SORTS.map(([k, l]) => html`<option value="${k}" ${st.sort === k ? 'selected' : ''}>${l}</option>`)}</select></label></div>
    <div class="sx-search" role="group" aria-label="סינון"><span class="sx-token"><bdi class="mono">is:unresolved</bdi></span>
      ${QS.map(([k, l]) => html`<button class="chip chip-btn ${st.q === k ? 'on' : ''}" data-act="q" data-f="${k}" aria-pressed="${String(st.q === k)}">${l}</button>`)}</div>
    <section class="card flush sx-stream" aria-label="תקלות פתוחות">
      <div class="sx-row sx-head" aria-hidden="true"><span class="sx-issue">תקלה</span><span class="sx-c-last">נראתה</span><span class="sx-c-age">גיל</span>
        <span class="sx-c-trend">מגמה · 14 ימים</span><span class="sx-c-n">אירועים</span><span class="sx-c-u">משתמשים</span><span class="sx-c-p">עדיפות</span></div>
      <div class="sx-rows">${list.length ? list.map((i) => row(i, i === sel)) : html`<p class="empty good" data-k="none">אין תקלות בסינון הזה.</p>`}</div></section>
    ${sel ? detail(sel, s.events?.[sel.id], s.org) : ''}</div>`;
}

const health = (p) => (p.health ? `${num(p.crashFreeSessions, 2)}%` : null);
function releasesTab(s) {
  return html`<div class="sx-tab" data-k="tab-releases">${part(s.releases, (rel) => {
    const measured = rel.some((r) => r.projects.some((p) => p.health));
    return html`${measured ? '' : html`<div class="sx-honest" data-k="rel-honest"><b>crash-free rate לא נמדד</b><p>אף גרסה לא שלחה sessions (hasHealthData=false בכל ${num(rel.length)} הגרסאות), ולכן Sentry לא יודע כמה משתמשים עברו בלי קריסה. זה נמדד רק כשה-SDK שולח sessions (Release Health).</p></div>`}
    <section class="card flush" data-k="rel-t"><div class="tbl-wrap"><table><thead><tr><th>גרסה</th><th>פרויקט</th><th>נוצרה</th><th>תקלות חדשות</th><th class="sx-hide-s">commits</th><th class="sx-hide-s">deploys</th><th>crash-free</th></tr></thead>
      <tbody>${rel.map((r) => html`<tr data-k="rel-${r.version}"><td>${mono(r.short)}</td><td>${r.projects.map((p) => mono(p.slug))}</td><td>${ago(r.created)}</td>
        <td class="mono">${num(r.newGroups)}</td><td class="mono sx-hide-s">${num(r.commits)}</td><td class="mono sx-hide-s">${num(r.deploys)}</td>
        <td>${r.projects.map((p) => health(p) || html`<span class="faint" title="אין sessions">לא נמדד</span>`)}</td></tr>`)}</tbody></table></div></section>`;
  }, { title: 'הגרסאות לא נקראו', empty: 'עוד לא נשלחה אף גרסה (release) ל-Sentry.' })}</div>`;
}

function perfTab(s) {
  const pr = arr(s.projects); const tot = isFail(s.volume) ? null : s.volume?.total || {};
  const tx = tot ? (tot.transaction?.accepted || 0) + (tot.span?.accepted || 0) : null;
  const any = pr.some((p) => p.transactions) || tx > 0;
  return html`<div class="sx-tab" data-k="tab-perf">${any ? '' : html`<div class="sx-honest" data-k="perf-honest"><b>אין נתוני ביצועים</b>
    <p>אף פרויקט לא שלח transaction${tot ? `. לפי stats_v2 התקבלו ${num(tx)} transactions ו-spans ב-14 הימים האחרונים` : ''}, ולכן אין כאן זמני תגובה, throughput או Web Vitals. לא מציגים גרף ריק כאילו הכול תקין.
    כדי להתחיל: להגדיר <bdi class="mono">tracesSampleRate</bdi> ב-Sentry.init של האתר וה-Worker.</p></div>`}
    <section class="card flush" data-k="perf-t"><div class="tbl-wrap"><table><thead><tr><th>פרויקט</th><th>Transactions</th><th>Sessions</th><th class="sx-hide-s">Replays</th><th class="sx-hide-s">Logs</th><th class="sx-hide-s">Source maps</th></tr></thead>
      <tbody>${pr.map((p) => html`<tr data-k="pf-${p.slug}"><td>${mono(p.slug)}</td>${[p.transactions, p.sessions, p.replays, p.logs, !p.minified].map((v, k) =>
        html`<td class="${k > 1 ? 'sx-hide-s' : ''}">${v ? tag('ok', 'נשלח') : tag('off', 'לא נשלח')}</td>`)}</tr>`)}</tbody></table></div></section></div>`;
}

function alertsTab(s) {
  return html`<div class="sx-tab" data-k="tab-alerts"><p class="sx-note" data-k="al-410">${s.legacyAlerts || ''}</p>
    ${part(s.workflows, (w) => html`<section class="card flush" data-k="al-wf"><h2 class="card-h">תהליכי התראה (Workflows)<span class="grow"></span><small>${num(w.length)}</small></h2>
      <div class="tbl-wrap"><table><thead><tr><th>שם</th><th>מופעל כש…</th><th>שולח</th><th class="sx-hide-s">הופעל לאחרונה</th><th>מצב</th></tr></thead><tbody>${w.map((x) => html`<tr data-k="wf-${x.id}">
        <td dir="auto">${x.name}</td><td>${x.triggers.map((t) => mono(t))}${x.alertsOnErrors ? '' : html` ${tag('warn', 'לא על שגיאות')}`}</td><td>${x.actions.map((a) => mono(a))}</td>
        <td class="sx-hide-s">${x.lastTriggered ? ago(x.lastTriggered) : html`<span class="faint">אף פעם</span>`}</td><td>${x.enabled ? tag('ok', 'דלוק') : tag('off', 'כבוי')}</td></tr>`)}</tbody></table></div></section>`,
    { title: 'תהליכי ההתראה לא נקראו', empty: 'אין אף תהליך התראה: אף אחד לא מקבל הודעה על תקלה חדשה.' })}
    ${part(s.detectors, (d) => html`<section class="card flush" data-k="al-det"><h2 class="card-h">מוניטורים (Detectors)<span class="grow"></span><small>${num(d.length)}</small></h2>
      <div class="tbl-wrap"><table><thead><tr><th>שם</th><th>סוג</th><th>פרויקט</th><th>מחובר להתראה</th><th class="sx-hide-s">התקלה האחרונה</th></tr></thead><tbody>${d.map((x) => html`<tr data-k="det-${x.id}">
        <td dir="auto">${x.name}</td><td>${mono(x.type)}</td><td>${x.project ? mono(x.project) : html`<span class="faint">כל הפרויקטים</span>`}</td>
        <td>${x.workflows ? tag('ok', x.workflows === 1 ? 'תהליך אחד' : `${num(x.workflows)} תהליכים`) : tag(x.type === 'error' ? 'bad' : 'off', 'לא מחובר')}</td>
        <td class="sx-hide-s">${x.latest ? html`${mono(x.latest.shortId)} ${ago(x.latest.lastSeen)}` : '—'}</td></tr>`)}</tbody></table></div></section>`,
    { title: 'המוניטורים לא נקראו' })}
    ${part(s.monitors, (m) => html`<section class="card" data-k="al-cron"><h2 class="card-h">Cron monitors</h2><ul class="list">${m.map((x) => html`<li class="li" data-k="cr-${x.slug}"><span class="li-m">${x.name}</span>${mono(x.status)}</li>`)}</ul></section>`,
    { title: 'מוניטורי ה-Cron לא נקראו', empty: 'אין Cron monitors: עבודות מתוזמנות לא נבדקות.' })}</div>`;
}

function projectsTab(s) {
  const iss = arr(s.issues);
  return html`<div class="sx-tab g g2" data-k="tab-projects">${arr(s.projects).map((p) => {
    const mine = iss.filter((i) => i.project === p.slug);
    return html`<article class="card sx-proj" data-k="pr-${p.slug}"><h2 class="card-h">${mono(p.slug)}<span class="grow"></span>${mono(p.platform || '')}</h2>
      <div class="sx-dstats">${[['תקלות פתוחות', num(mine.length)], ['אירועים', compact(mine.reduce((a, i) => a + i.count, 0))], ['אירוע ראשון', ago(p.firstEvent)], ['גרסה אחרונה', p.release ? mono(p.release) : '—']]
        .map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</div>
      <p class="sx-meta">${arr(p.environments).map((e) => tag('off', e))}${p.minified ? tag('warn', 'stack trace מוקטן') : ''}</p>
      ${extBtn(s.orgUrl && `${s.orgUrl}/issues/?project=${encodeURIComponent(p.id || '')}`, 'התקלות ב-Sentry', 'btn-sm btn-ghost')}</article>`;
  })}</div>`;
}

function statsTab(s) {
  return html`<div class="sx-tab" data-k="tab-stats">${part(s.volume, (v) => {
    const e = v.total?.error || {}; const rows = arr(v.errors);
    return html`<section class="g g4" data-k="st-tiles">${stat({ key: 'sx-acc', label: 'שגיאות שהתקבלו', value: e.accepted || 0, sub: '14 ימים' })}
      ${stat({ key: 'sx-rl', label: 'נחסמו במגבלת קצב', value: e.rate_limited || 0, tone: e.rate_limited ? 'warn' : 'good' })}
      ${stat({ key: 'sx-fl', label: 'סוננו', value: e.filtered || 0 })}
      ${stat({ key: 'sx-tx', label: 'Transactions', value: (v.total?.transaction?.accepted || 0) + (v.total?.span?.accepted || 0), sub: 'ביצועים' })}</section>
      <section class="card" data-k="st-chart"><h2 class="card-h">אירועי שגיאה לפי יום<span class="grow"></span><small>stats_v2 · 14 ימים</small></h2>
        ${legend([{ label: 'התקבלו', color: 'var(--sx-viz)' }, { label: 'מגבלת קצב', color: 'var(--sx-meh)' }, { label: 'סוננו', color: 'var(--sx-other)' }])}
        ${bars(rows, [{ key: 'accepted', label: 'התקבלו', color: 'var(--sx-viz)' }, { key: 'rate_limited', label: 'מגבלת קצב', color: 'var(--sx-meh)' },
          { key: 'filtered', label: 'סוננו', color: 'var(--sx-other)' }], { x: (r) => r.day, xfmt: shortDay, h: 220 })}</section>`;
  }, { title: 'נפח האירועים לא נקרא' })}</div>`;
}

export default {
  id: 'sentry', title: 'Sentry', nav: 'Sentry', brand: 'sentry', needs: ['sentry'],
  sub: 'התקלות שהאתר והשרת דיווחו עליהן, עם הסטאק טרייס, מיון בלחיצה, גרסאות, התראות ונפח אירועים',
  links: (d) => [{ label: 'Sentry', url: d.sentry?.orgUrl && `${d.sentry.orgUrl}/issues/` }].filter((l) => l.url),
  render(d) {
    const s = d.sentry || {};
    if (!s.configured) return notConnected('sentry', ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG'], { how: s.how, docs: 'https://docs.sentry.io/api/auth/' });
    const iss = arr(s.issues); const trend = iss.reduce((acc, i) => arr(i.trend).map((v, k) => (acc[k] || 0) + v), []);
    const tab = TABS.some(([k]) => k === st.tab) ? st.tab : 'issues';
    const body = { issues: issuesTab, releases: releasesTab, perf: perfTab, alerts: alertsTab, projects: projectsTab, stats: statsTab }[tab](s);
    return html`
      <section class="sx-concl" data-k="concl" aria-label="מסקנות">${arr(s.conclusions).map((c) => html`<article class="sx-cc is-${c.tone}" data-k="c-${c.k}"><b>${c.title}</b><p dir="auto">${c.text}</p></article>`)}</section>
      <section class="g g4" data-k="tiles" aria-label="מדדים">
        ${stat({ key: 'se-open', label: 'תקלות פתוחות', value: iss.length, tone: iss.length ? 'warn' : 'good', series: trend, sub: 'אירועים ביום, 14 ימים' })}
        ${stat({ key: 'se-ev', label: 'אירועים בתקלות הפתוחות', value: iss.reduce((a, i) => a + i.count, 0), sub: `${num(iss.filter((i) => i.unhandled).length)} לא נתפסו בקוד` })}
        ${stat({ key: 'se-hi', label: 'בעדיפות גבוהה', value: iss.filter((i) => i.priority === 'high').length, tone: iss.some((i) => i.priority === 'high') ? 'bad' : 'good' })}
        ${stat({ key: 'se-new', label: 'עוד לא נקראו', value: iss.filter((i) => !i.seen).length, sub: `${num(arr(s.projects).length)} פרויקטים בארגון ${s.org}` })}</section>
      <nav class="sx-tabs" role="tablist" aria-label="חלקי Sentry" data-k="tabs">${TABS.map(([k, l]) => html`<button role="tab" class="sx-tb ${tab === k ? 'on' : ''}" aria-selected="${String(tab === k)}" data-act="tab" data-f="${k}">${l}</button>`)}</nav>
      ${body}`;
  },
  actions: {
    tab(el, ctx) { st.tab = el.dataset.f; ctx.rerender(); },
    proj(el, ctx) { st.proj = el.dataset.f; ctx.rerender(); },
    q(el, ctx) { st.q = el.dataset.f; ctx.rerender(); },
    sort(el, ctx) { st.sort = el.value; ctx.rerender(); },
    sel(el, ctx) { st.sel = el.dataset.f; ctx.rerender(); },
  },
};
