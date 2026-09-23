// Apple itself, in the product's own quiet console look (apps/web /usage): the worker's admin GET
// routes only. Spend against the caps, the deployed build against HEAD, model mix and roles, builds and
// errors from the event log, the corpus and static assets, and a plain list of what no route exposes.
// Read-only: no write route is called or offered. The shell's "refresh" re-reads the worker.
import { html, num, compact, pct, ago, arr, isNum, bars, legend, meter, shortDay, duration } from '../ui.js';
import { rn } from '../fx.js';
import { stat, notConnected } from './kit.js';

let tab = 'now';
const TABS = [['now', 'עכשיו'], ['models', 'מודלים'], ['log', 'יומן'], ['data', 'נתונים']];
const usd = (x, d = 2) => (isNum(x) ? `$${num(x, d)}` : '—');
const ms = (v) => (!isNum(v) ? '—' : v >= 60_000 ? duration(v / 1000) : v >= 1000 ? `${num(v / 1000, 1)} שנ׳` : `${num(Math.round(v))} ms`);
const id = (s) => html`<bdi class="mono">${s ?? '—'}</bdi>`;
const TONE = { ok: 'ok', warn: 'warn', bad: 'bad', info: 'info' };

const concl = (list) => (arr(list).length ? html`<section class="ap-concl" aria-label="מסקנות">${arr(list).map((c) => html`
  <article class="ap-cc is-${TONE[c.tone] || 'info'}" data-k="cc-${c.k}"><i aria-hidden="true"></i><div><h2>${c.title}</h2><p>${c.text}</p></div></article>`)}</section>` : '');

const panel = (k, title, sub, body, cls = '') => html`<section class="ap-panel ${cls}" data-k="p-${k}" aria-labelledby="ap-h-${k}">
  <header><h2 id="ap-h-${k}">${title}</h2>${sub ? html`<small>${sub}</small>` : ''}</header>${body}</section>`;

const kv = (rows) => html`<dl class="ap-kv">${rows.filter(Boolean).map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>`;

function versionPanel(a) {
  const v = a.version || {}; const h = a.health || {};
  const state = !v.buildSha ? ['off', 'לא ידוע'] : !v.known ? ['off', 'לא בריפו המקומי'] : v.workerBehind > 0 || v.dirty ? ['warn', 'לא מעודכן'] : ['ok', 'מעודכן'];
  return panel('ver', 'הגרסה בפרודקשן', html`${id('buildSha')} מול ${id('git HEAD')}`, html`
    <div class="ap-ver"><span class="ap-sha">${id(v.sha || v.buildSha)}</span><span class="ap-chip is-${state[0]}">${state[1]}</span></div>
    ${kv([
      ['HEAD בריפו', id(v.head)],
      ['קומיטים מאז', v.known ? html`${rn('ap-behind', v.behind, num(v.behind))}${isNum(v.workerBehind) ? html` <small>(${num(v.workerBehind)} ב-<bdi class="mono">apps/worker</bdi>)</small>` : ''}` : '—'],
      ['עץ נקי בפריסה', v.dirty == null ? '—' : v.dirty ? 'לא, נפרס עם שינויים שלא נשמרו' : 'כן'],
      ['נפרס', v.deployedAt ? ago(v.deployedAt) : '—'],
      [id('/api/health'), html`<span class="ap-dot is-${h.httpStatus === 200 ? 'ok' : 'bad'}"></span>HTTP ${h.httpStatus ?? '—'} · ${rn('ap-ms', h.ms, `${num(h.ms)} ms`)}`],
    ])}`);
}

function spendPanel(s) {
  const rows = arr(s.days).map((x) => ({ ...x, usdc: Math.round((x.usd || 0) * 100) }));
  const f = s.maxMonthlyUsd > 0 && isNum(s.monthUsd) ? s.monthUsd / s.maxMonthlyUsd : null;
  return panel('spend', 'הוצאה לפי יום', 'Workers AI, לפי מה שהעובד רשם', html`
    <div class="ap-cap"><div><b>${rn('ap-month', s.monthUsd, usd(s.monthUsd))}</b><small>מתוך תקרה חודשית של ${usd(s.maxMonthlyUsd)}</small></div>${meter(f, 'var(--ap-ink)')}<span class="mono">${pct(f)}</span></div>
    <div class="ap-chart">${bars(rows, [{ key: 'usdc', label: 'סנט', color: 'var(--ap-bar)' }], { h: 190, xfmt: shortDay,
      tip: (r) => `${shortDay(r.day)} · ${usd(r.usd, 3)} · ${num(r.calls)} קריאות · ${compact(r.neurons)} neurons` })}</div>
    <p class="ap-fine">גובה העמודה בסנטים. ספקים חיצוניים החודש: ${usd(s.thirdParty?.monthUsd)} מתוך ${usd(s.thirdParty?.monthCeilingUsd, 0)}.</p>`);
}

function mixPanel(m, cls = '') {
  if (!m) return panel('mix', 'תמהיל המודלים', null, html`<p class="ap-empty">אין עדיין רשומות הוצאה לפי מודל.</p>`, cls);
  return panel('mix', 'תמהיל המודלים', html`${shortDay(m.from)}–${shortDay(m.to)} · ${compact(m.totalNeurons)} neurons`, html`
    <ul class="ap-mix">${arr(m.models).map((x) => html`<li data-k="mx-${x.model}"><div class="ap-mix-h">${id(x.model)}<b class="mono">${pct(x.share, 1)}</b></div>
      ${meter(x.share, 'var(--ap-bar)')}<small>${num(x.calls)} קריאות · ${compact(x.neurons)} neurons · ${usd(x.usd)}</small></li>`)}</ul>
    ${arr(m.kinds).length ? html`<h3 class="ap-h3">לפי סוג קריאה</h3><ul class="ap-tags">${arr(m.kinds).map((k) => html`<li data-k="kd-${k.key}">${id(k.key)} <span>${compact(k.neurons)}</span></li>`)}</ul>` : ''}`, cls);
}

function nowTab(a) {
  const s = a.spend || {}; const suc = a.success || {}; const c = a.counts || {};
  const w = a.window || {};
  return html`
    <section class="ap-stats" aria-label="מדדים">
      ${stat({ key: 'ap-s-month', label: 'הוצאה החודש', value: s.monthUsd, text: usd(s.monthUsd), sub: `מתוך ${usd(s.maxMonthlyUsd)}` })}
      ${stat({ key: 'ap-s-day', label: 'נשאר מהתקציב היומי', value: isNum(s.dayRemaining) ? Math.round(s.dayRemaining * 100) : null, text: pct(s.dayRemaining), sub: `${compact(s.dayNeurons)} מתוך ${compact(s.limits?.billablePerDay)} neurons היום`, tone: s.killed ? 'bad' : s.dayRemaining < 0.2 ? 'warn' : '' })}
      ${stat({ key: 'ap-s-calls', label: 'קריאות למודל', value: c.model_call, sub: `${pct(suc.modelCalls?.rate)} הצליחו · ${usd(a.cost?.usd, 3)}` })}
      ${stat({ key: 'ap-s-actors', label: 'משתמשים פעילים', value: a.actors?.distinct, sub: 'שונים, מתוך הלוג בלבד' })}
      ${stat({ key: 'ap-s-builds', label: 'בניות', value: a.builds?.retained, sub: `${num(suc.builds?.failed)} נכשלו` })}
      ${stat({ key: 'ap-s-err', label: 'שגיאות', value: a.errorLog?.retained, sub: `${num(suc.requests?.failed)} בקשות נכשלו מתוך ${num(suc.requests?.total)}`, tone: a.errorLog?.retained ? 'warn' : '' })}
    </section>
    <p class="ap-fine">בקשות, קריאות, משתמשים, בניות ושגיאות נספרים מ-${num(w.events)} האירועים האחרונים ביומן של העובד${isNum(w.hours) ? `, כלומר ${w.hours < 1 ? `${num(Math.round(w.hours * 60))} הדקות` : `${num(w.hours, 1)} השעות`} האחרונות` : ''}. ההוצאה היא לכל החודש.</p>
    <div class="ap-grid">${spendPanel(s)}${versionPanel(a)}${mixPanel(a.modelMix, 'ap-wide')}</div>`;
}

function modelsTab(a) {
  const t = a.tokens || {}; const lat = a.latency || {};
  return html`<div class="ap-grid">
    ${panel('roles', 'מודל לכל תפקיד', id('/api/admin/models'), html`<table class="ap-t"><thead><tr><th>תפקיד</th><th>מודל</th><th>טוקנים מקס׳</th><th>כלים</th></tr></thead><tbody>
      ${arr(a.models).map((m) => html`<tr data-k="r-${m.role}"><td data-l="תפקיד">${id(m.role)}</td><td data-l="מודל">${id(m.id)}</td><td data-l="טוקנים מקס׳" class="mono">${num(m.maxTokens)}</td><td data-l="כלים">${m.tools ? 'כן' : '—'}</td></tr>`)}</tbody></table>`, 'ap-wide')}
    ${panel('tok', 'טוקנים', 'בחלון הלוג', html`<div class="ap-big">${rn('ap-cache', t.cacheHit, pct(t.cacheHit))}<small>הגיעו מהמטמון</small></div>${meter(t.cacheHit, 'var(--ap-ink)')}
      ${kv([['נכנסו', compact(t.input)], ['יצאו', compact(t.output)], ['מהמטמון', compact(t.cached)]])}`)}
    ${panel('lat', 'כמה זמן לוקח', 'חציון ו-95%', kv([['בקשה', html`<bdi>${ms(lat.request?.p50)}</bdi> · <bdi>${ms(lat.request?.p95)}</bdi>`], ['קריאה למודל', html`<bdi>${ms(lat.model?.p50)}</bdi> · <bdi>${ms(lat.model?.p95)}</bdi>`], ['בנייה מלאה', html`<bdi>${ms(lat.build?.p50)}</bdi> · <bdi>${ms(lat.build?.p95)}</bdi>`]]))}
    ${panel('route', 'המודלים שאפשר לבחור', html`${id('/api/admin/model-routing')} · מחיר ל-1M טוקנים`, html`<table class="ap-t"><thead><tr><th>מודל</th><th>ספק</th><th>יכולות</th><th>נכנס</th><th>יוצא</th></tr></thead><tbody>
      ${arr(a.routing).map((m) => html`<tr data-k="rt-${m.id}" class="${m.available ? '' : 'is-off'}"><td data-l="מודל"><span><b>${m.label}</b><br>${id(m.id)}</span></td><td data-l="ספק">${id(m.provider)}</td>
        <td data-l="יכולות">${[m.tools && 'כלים', m.vision && 'ראייה', !m.available && 'לא זמין'].filter(Boolean).join(' · ') || '—'}</td><td data-l="נכנס" class="mono">${usd(m.inPer1M)}</td><td data-l="יוצא" class="mono">${usd(m.outPer1M)}</td></tr>`)}</tbody></table>`, 'ap-wide')}
  </div>`;
}

function studio(c = {}) {
  const days = [...new Set(Object.values(c).flatMap((o) => Object.keys(o || {})))].sort();
  const rows = days.map((day) => ({ day, ws: c.ws_connect?.[day] || 0, pair: c.pairing_create?.[day] || 0, paired: c.studio_paired?.[day] || 0 }));
  const keys = [{ key: 'ws', label: 'חיבורי Studio', color: 'var(--ap-ink)' }, { key: 'pair', label: 'בקשות צימוד', color: 'var(--ap-bar)' }, { key: 'paired', label: 'צימודים שהצליחו', color: 'var(--ap-accent)' }];
  return html`<div class="ap-chart">${bars(rows, keys, { h: 170, overlay: true, xfmt: shortDay })}</div>${legend(keys)}`;
}

function logTab(a) {
  const b = a.builds || {}; const e = a.errorLog || {};
  return html`<div class="ap-grid">
    ${panel('builds', 'בניות אחרונות', `${num(b.retained)} בחלון`, arr(b.recent).length ? html`<ul class="ap-rows">${arr(b.recent).map((x) => html`<li data-k="b-${x.k}">
      <span class="ap-dot is-${x.outcome === 'done' && !x.opsFailed ? 'ok' : x.outcome === 'done' ? 'warn' : 'bad'}"></span>
      <div><b>${id(x.k)} · ${x.outcome || '—'}</b><small>${num(x.steps)} צעדים · ${num(x.opsApplied)} פעולות${x.opsFailed ? `, ${num(x.opsFailed)} נכשלו` : ''} · ${ms(x.durationMs)} · ${compact(x.neurons)} neurons</small></div><span class="ap-when">${ago(x.at)}</span></li>`)}</ul>`
      : html`<p class="ap-empty">אין בניות בחלון הלוג.</p>`, 'ap-wide')}
    ${panel('errs', 'שגיאות', `${num(e.retained)} בחלון`, arr(e.recent).length ? html`<ul class="ap-rows">${arr(e.recent).map((x) => html`<li data-k="e-${x.k}">
      <span class="ap-dot is-${x.fatal ? 'bad' : 'warn'}"></span><div><b>${id(x.scope)}</b><small>${id(x.kind)}${x.fatal ? ' · עצרה את הבקשה' : ''}</small></div><span class="ap-when">${ago(x.at)}</span></li>`)}</ul>`
      : html`<p class="ap-empty">אין שגיאות בחלון הלוג.</p>`)}
    ${panel('feat', 'מה הכי עסוק', 'לפי מספר אירועים', html`<ul class="ap-rows">${arr(a.features).map((f) => html`<li data-k="f-${f.feature}"><div><b>${id(String(f.feature).replace(/^audit:/, ''))}</b><small>${String(f.feature).startsWith('audit:') ? 'יומן אדמין · ' : ''}${ago(f.lastAt)}</small></div><span class="mono">${num(f.events)}</span></li>`)}</ul>`)}
    ${panel('studio', 'Roblox Studio', 'חיבורים וצימודים לפי יום, מהמונים', studio(a.counters), 'ap-wide')}
  </div>`;
}

function dataTab(a) {
  const co = a.corpus; const st = a.static; const g = a.gauntlet; const bi = a.billing || {}; const pr = a.product;
  return html`<div class="ap-grid">
    ${panel('corpus', 'הקורפוס', id('/api/admin/corpus-census'), co ? html`<div class="ap-big">${rn('ap-chunks', co.chunks, num(co.chunks))}<small>chunks</small></div>
      ${meter(co.chunks ? co.embedded / co.chunks : null, 'var(--ap-ink)')}<p class="ap-fine">${num(co.embedded)} מהם עם embedding (${pct(co.chunks ? co.embedded / co.chunks : null)}).</p>` : html`<p class="ap-empty">המפקד לא זמין.</p>`)}
    ${panel('static', 'קבצים סטטיים', id('/api/admin/static-list'), st ? html`<div class="ap-big">${rn('ap-files', st.files, num(st.files))}<small>קבצים</small></div>
      ${kv([['chunks', num(st.chunks)], ['immutable', num(st.immutable)], ['עודכן', ago(st.lastAt)]])}
      <ul class="ap-tags">${arr(st.types).map((x) => html`<li data-k="ty-${x.key}">${id(x.key)} <span>${num(x.count)}</span></li>`)}</ul>` : html`<p class="ap-empty">הרשימה לא זמינה.</p>`)}
    ${panel('gaunt', 'סבבי gauntlet', g ? id(g.source) : null, g ? html`<div class="ap-big">${rn('ap-rounds', g.rounds, num(g.rounds))}<small>סבבים, האחרון ${num(g.last)}</small></div>` : html`<p class="ap-empty">התיקייה לא נמצאה בריפו.</p>`)}
    ${panel('bill', 'תשלומים', id('/api/admin/billing-wiring'), kv([
      ['מפתח Stripe', bi.keyMode === 'live' ? 'live' : bi.keyMode === 'test' ? html`<span class="ap-chip is-warn">test</span>` : '—'],
      ['סביבה', bi.production ? 'פרודקשן' : 'פיתוח'], ['Webhook', bi.webhook ? 'מחובר' : 'חסר'],
      ['מחירים', bi.prices?.builder && bi.prices?.studio ? 'מוגדרים' : 'חסרים'], ['העובד הוא מקור האמת', bi.authority ? 'כן' : 'לא']]))}
    ${panel('prod', 'אנליטיקת מוצר', id('/api/admin/product-analytics'), pr ? html`<p class="ap-fine">${pr.configured ? 'מחוברת.' : html`<span class="ap-chip is-off">לא מוגדרת</span> ${id(pr.why)}`}</p>` : html`<p class="ap-empty">לא זמין.</p>`)}
  </div>`;
}

const notExposed = (list) => html`<section class="ap-panel ap-nx" data-k="p-nx" aria-labelledby="ap-h-nx"><header><h2 id="ap-h-nx">מה אף נתיב לא חושף</h2>
  <small>המספרים האלה לא מוצגים כאפס. הם פשוט לא זמינים מהעובד.</small></header>
  <ul>${arr(list).map((x) => html`<li data-k="nx-${x.k}"><b>${x.title}</b><span>${x.why}</span></li>`)}</ul></section>`;

export default {
  id: 'apple', title: 'Apple', nav: 'Apple', brand: 'apple', needs: ['apple'],
  sub: 'המוצר החי מנתיבי האדמין של העובד: הוצאה, גרסה, מודלים, בניות ושגיאות. קריאה בלבד.',
  links: (d) => [{ label: 'לאתר', url: d.apple?.health?.url }, { label: 'בדיקת הבריאות', url: d.apple?.health?.url ? `${d.apple.health.url}/api/health` : null }].filter((l) => l.url),
  render(d) {
    const a = d.apple || {};
    if (a.configured === false) {
      return html`${notConnected('apple', a.need, { blurb: 'נתיבי האדמין של העובד', how: 'GOLEM_ADMIN_KEY הוא הסוד ADMIN_KEY של העובד (wrangler secret). הדף שולח אותו רק ככותרת X-Admin-Key לנתיבי GET.' })}${notExposed(a.notExposed)}`;
    }
    const errs = Object.entries(a.errors || {});
    return html`
      ${concl(a.conclusions)}
      <nav class="ap-switch" aria-label="תצוגה">${TABS.map(([k, l]) => html`<button type="button" data-act="tab" data-t="${k}" class="${tab === k ? 'is-active' : ''}" aria-pressed="${tab === k ? 'true' : 'false'}">${l}</button>`)}</nav>
      ${errs.length ? html`<p class="ap-fine ap-miss">חלקים שלא נטענו: ${errs.map(([k, r]) => html`<span>${id(k)}: ${r}</span>`)}</p>` : ''}
      ${tab === 'models' ? modelsTab(a) : tab === 'log' ? logTab(a) : tab === 'data' ? dataTab(a) : nowTab(a)}
      ${notExposed(a.notExposed)}`;
  },
  actions: {
    tab(el, ctx) { tab = TABS.some(([k]) => k === el.dataset.t) ? el.dataset.t : 'now'; ctx.rerender(); },
  },
};
