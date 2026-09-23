// המודלים של Apple: what the product actually runs and what was trained for it, all from files in
// the repository (GET /api/cc/models): the model registry with plan gating (packages/shared), every
// LoRA run (config, dataset, adapters, training log), the before/after evals, the production and
// frontier measurements, the RAG index and the skill cards. A fact no file records says "לא מתועד".
import { html, num, pct } from '../ui.js';
import { stat } from './kit.js';
import { nd, or, day, stamp, path } from './repo-kit.js';

const PLAN_HE = { free: 'Free', builder: 'Builder', studio: 'Studio', enterprise: 'Enterprise' };
const TIER_HE = { free: 'חינם', pro: 'Pro', max: 'Max' };
const TRACK_HE = { 'game-logic': 'לוגיקת משחק', trajectory: 'קריאות לכלים', finish: 'לדעת מתי לסיים' };
const REASON_HE = {
  fails_own_checks: 'נכשל בבדיקות של עצמו', no_code_block: 'לא החזיר קוד', not_standalone: 'לא עומד בפני עצמו', does_not_parse: 'לא מתפרסר',
  no_tool_call: 'לא קרא לכלי', tool_does_not_exist: 'קרא לכלי שלא קיים', arguments_rejected: 'פרמטרים שגויים', called_a_tool_instead_of_finishing: 'קרא לכלי במקום לסיים', arguments_not_an_object: 'הפרמטרים לא במבנה הנכון',
};
const demd = (s) => String(s || '').replace(/\*\*|`/g, '');
const firstLine = (s) => String(s || '').split('\n')[0];

function registry(r) {
  if (!r?.models?.length) return html`<div class="card">${nd('packages/shared/src/models.ts לא נקרא')}</div>`;
  const plans = Object.keys(r.tierForPlan || PLAN_HE);
  return html`<div class="card flush md-reg"><h2 class="card-h">רישום המודלים <small>${path(r.source)} · מה כל תוכנית מקבלת</small></h2>
    <div class="tbl-wrap"><table class="md-tbl">
      <thead><tr><th scope="col">המודל</th><th scope="col">ספק ומודל בסיס</th><th scope="col">מסלול</th>${plans.map((p) => html`<th scope="col" class="md-pl">${PLAN_HE[p] || p}<small>${TIER_HE[r.tierForPlan?.[p]] || ''}</small></th>`)}<th scope="col">חלון / פלט</th><th scope="col">LoRA</th></tr></thead>
      <tbody>${r.models.map((m, i) => html`<tr style="--i:${i}">
        <td><b>${m.displayName}</b><span class="md-id mono" dir="ltr">${m.id}</span>${m.blurb ? html`<p class="md-blurb" dir="auto">${m.blurb}</p>` : ''}</td>
        <td><span class="chip chip-sm">${m.vendor}</span><bdi class="md-pm mono" dir="ltr">${m.providerModelId}</bdi></td>
        <td><bdi class="mono small" dir="ltr">${m.route}</bdi><p class="faint small">מאמץ חשיבה: ${or(m.reasoningEffort)}${m.vision ? ' · ראייה' : ''}${m.nativeTools ? ' · כלים' : ''}</p></td>
        ${plans.map((p) => (m.plans.includes(p) ? html`<td class="md-pl"><span class="md-yes" title="זמין בתוכנית ${PLAN_HE[p]}">✓</span></td>` : html`<td class="md-pl"><span class="md-no" title="${m.locked || 'לא זמין'}">—</span></td>`))}
        <td class="mono small">${m.ctx ? num(m.ctx) : nd()} / ${m.maxOutputTokens ? num(m.maxOutputTokens) : nd()}</td>
        <td>${m.lora ? html`<bdi class="mono small" dir="ltr">${m.lora}</bdi>` : nd('אף LoRA לא מחובר למודל הזה בייצור')}</td>
      </tr>`)}</tbody></table></div>
    <p class="md-foot">✓ = כלול בתוכנית, — = לא כלול (מעבר עם העכבר מראה מה פותח אותו). "לא מתועד" בעמודת LoRA: אף מודל בייצור לא מריץ היום מתאם LoRA שאומן כאן.</p></div>`;
}

// A small loss chart: train (thin) and validation (bold) against the step.
function lossChart(log) {
  const tr = (log?.train || []).map(([s, l]) => [s, l]); const va = log?.val || [];
  const all = [...tr, ...va]; if (all.length < 2) return html`<p class="faint small">אין עקומת הפסד ביומן.</p>`;
  const W = 300, H = 90; const xs = all.map((p) => p[0]); const ys = all.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = (x) => 4 + ((x - x0) / (x1 - x0 || 1)) * (W - 8); const Y = (y) => H - 6 - ((y - y0) / (y1 - y0 || 1)) * (H - 14);
  const d = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)} ${Y(y).toFixed(1)}`).join('');
  const lastV = va.at(-1);
  return html`<figure class="md-loss"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="עקומת ההפסד: אימון ובדיקה">
      ${tr.length > 1 ? html`<path class="md-l-tr" d="${d(tr)}" pathLength="1"/>` : ''}${va.length > 1 ? html`<path class="md-l-va" d="${d(va)}" pathLength="1"/>` : ''}
      ${va.map(([x, y]) => html`<circle class="md-l-pt" cx="${X(x).toFixed(1)}" cy="${Y(y).toFixed(1)}" r="2"/>`)}</svg>
    <figcaption><span><i class="md-k-tr"></i>אימון</span><span><i class="md-k-va"></i>בדיקה</span>${lastV ? html`<span>הפסד בדיקה אחרון ${num(lastV[1], 3)} בצעד ${num(lastV[0])}</span>` : ''}</figcaption></figure>`;
}

const P = (params, k) => params?.[k]?.v;
function loraCard(l, i) {
  const ds = l.dataset; const lg = l.log;
  return html`<article class="card md-run" style="--i:${i}">
    <header class="md-run-h"><span class="md-v">v${l.version}</span><div><b dir="auto">${firstLine(l.header).replace(/^Apple[^—]*—\s*/, '') || nd()}</b><bdi class="mono small faint" dir="ltr">${l.base || '—'}</bdi></div></header>
    <dl class="md-kv">
      <div><dt>נתוני אימון</dt><dd>${ds ? html`${num(ds.train)} <small>אימון</small> · ${num(ds.valid)} <small>בדיקה</small> · ${num(ds.test)} <small>מבחן</small>` : nd()}</dd></div>
      <div><dt>rank / scale</dt><dd>${or(P(l.params, 'lora.rank'))} / ${or(P(l.params, 'lora.scale'))}</dd></div>
      <div><dt>צעדים / batch</dt><dd>${or(P(l.params, 'iters'))} / ${or(P(l.params, 'batch_size'))}</dd></div>
      <div><dt>קצב למידה</dt><dd class="mono">${or(P(l.params, 'learning_rate'))}</dd></div>
      <div><dt>אורך רצף</dt><dd>${or(P(l.params, 'max_seq_length'))}</dd></div>
      <div><dt>פרמטרים שאומנו</dt><dd>${lg?.trainable ? html`${lg.trainable.params} <small>(${num(lg.trainable.pct, 3)}%)</small>` : nd()}</dd></div>
      <div><dt>זיכרון שיא</dt><dd>${lg?.peakGb ? html`<bdi dir="ltr">${num(lg.peakGb, 1)} GB</bdi>` : nd()}</dd></div>
      <div><dt>שמירה אחרונה</dt><dd>${lg?.lastSaved ? html`צעד ${num(lg.lastSaved)}` : nd()}</dd></div>
    </dl>
    ${lg ? lossChart(lg) : html`<p class="md-nolog">${nd()} · אין יומן אימון בתיקייה runs/ לריצה הזאת.</p>`}
    ${lg?.error ? html`<p class="md-err" title="${lg.error}">היומן נגמר בשגיאה: <bdi class="mono" dir="ltr">${lg.error.split(':').slice(0, 2).join(':')}</bdi></p>` : ''}
    <div class="md-ad">${l.adapters.length ? l.adapters.map((a) => html`<span class="chip chip-sm" title="${a.path}">${a.name} · ${num(a.sizeMb, 1)} MB${a.checkpoints.length ? ` · ${num(a.checkpoints.length)} נקודות שמירה` : ''}</span>`) : html`<span class="chip chip-sm chip-off">אין מתאם שמור</span>`}</div>
    ${ds?.card ? html`<details class="md-d"><summary>כרטיס הנתונים (${num(ds.card.rows)} שורות, ${num(ds.card.families)} משפחות)</summary>
      <p>מקור: ${ds.card.source} · נתוני לקוחות: ${ds.card.customerData ? 'כן' : 'לא'} · מוכן לאימון בייצור: ${ds.card.productionTrainingReady ? 'כן' : 'לא'}</p>
      <ul>${(ds.card.limitations || []).map((x) => html`<li dir="auto">${x}</li>`)}</ul></details>` : ''}
    <details class="md-d"><summary>למה הריצה הזאת · ${path(l.config)}</summary><pre dir="auto">${l.header}</pre></details>
  </article>`;
}

function evalCard(e) {
  return html`<article class="card md-ev"><h3 class="md-ev-h">${e.name}<small>${num(e.rows)} שאלות מבחן · ${stamp(e.mtime)}</small></h3>
    ${e.tracks.filter((t) => t.base.n || t.adapter.n).map((t) => {
      const b = t.base.n ? t.base.ok / t.base.n : 0; const a = t.adapter.n ? t.adapter.ok / t.adapter.n : 0;
      const delta = a - b;
      return html`<div class="md-tr"><p class="md-tr-n">${TRACK_HE[t.track] || t.track}<span class="${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${delta > 0 ? '▲' : delta < 0 ? '▼' : '='} ${num(Math.round(delta * 100))} נק׳</span></p>
        <div class="md-bars"><span class="md-bl">לפני</span><span class="md-bar b"><i style="width:${(b * 100).toFixed(1)}%"></i></span><span class="md-bv">${num(t.base.ok)}/${num(t.base.n)}</span>
        <span class="md-bl">אחרי</span><span class="md-bar a"><i style="width:${(a * 100).toFixed(1)}%"></i></span><span class="md-bv">${num(t.adapter.ok)}/${num(t.adapter.n)}</span></div>
        ${Object.keys(t.adapter.reasons).length ? html`<p class="md-why">כשלונות אחרי: ${Object.entries(t.adapter.reasons).map(([k, n]) => `${REASON_HE[k] || k} ${n}`).join(' · ')}</p>` : ''}</div>`;
    })}
    <p class="md-src">${path(e.file)}</p></article>`;
}

export default {
  id: 'models',
  title: 'המודלים של Apple',
  nav: 'המודלים של Apple',
  glyph: 'models',
  eyebrow: 'ריפו וידע · מה רץ בייצור ומה אומן',
  sub: 'איזה מודל כל תוכנית מקבלת, כל ריצת אימון LoRA עם הנתונים והתוצאות, המדידות לפני ואחרי, מאגר הידע (RAG) וכרטיסי המיומנויות.',
  endpoint: '/api/cc/models',
  render(d) {
    const r = d.registry; const prod = d.production; const rag = d.rag; const sk = d.skills;
    const best = [...d.evals].reverse().find((e) => e.tracks.some((t) => t.adapter.n));
    return html`
    <section class="g g4">
      ${stat({ key: 'md-n', label: 'מודלים ברישום', value: r?.models?.length, sub: r ? [...new Set(r.models.map((m) => m.providerModelId))].length + ' מודלי בסיס שונים' : '' })}
      ${stat({ key: 'md-lora', label: 'ריצות LoRA', value: d.lora.length, sub: `${num(d.lora.reduce((s, l) => s + l.adapters.length, 0))} מתאמים שמורים · אף אחד לא בייצור` })}
      ${stat({ key: 'md-rag', label: 'קטעי ידע ב-RAG', value: rag?.chunks, sub: rag ? `מ-${num(rag.documents)} מסמכים · נמדד ${day(rag.witnessAt)}` : 'לא מתועד' })}
      ${stat({ key: 'md-sk', label: 'כרטיסי מיומנות', value: sk?.cards?.length, sub: sk ? `עד ${num(sk.limits.perPrompt)} לבקשה, ${num(sk.limits.perRun)} לריצה` : 'לא מתועד' })}
    </section>
    <div class="rk-sec"><h2>מה כל תוכנית מקבלת</h2><p>הרישום בקוד הוא המקור; השער לפי תוכנית מחושב מאותה פונקציה שהשרת משתמש בה.</p></div>
    ${registry(r)}

    <div class="rk-sec"><h2>ריצות האימון (LoRA)</h2><p>${num(d.lora.length)} ריצות, מהראשונה לאחרונה. כל מספר נקרא מקובץ ההגדרות, מתיקיית הנתונים ומיומן האימון.</p></div>
    <div class="md-runs">${d.lora.map(loraCard)}</div>

    <div class="rk-sec"><h2>לפני ואחרי: מבחני המתאמים</h2><p>אותן שאלות, המודל הבסיסי מול המודל עם המתאם.${best ? ` האחרון: ${best.name}.` : ''}</p></div>
    ${d.evals.length ? html`<div class="md-evs">${d.evals.map(evalCard)}</div>` : html`<div class="card">${nd()}</div>`}

    <div class="g g2 md-two">
      <section class="card md-prod"><h2>המדידה בייצור <small>${prod ? `${day(prod.measuredAt)} · ${num(prod.runs)} ריצות` : ''}</small></h2>
        ${prod ? html`<p class="md-what" dir="auto">${prod.modelUnderTest}</p>
          <dl class="md-head">${Object.entries(prod.headline || {}).map(([k, v]) => html`<div><dt>${{ freeLaneAgentPrompts1to24: 'מסלול חינם, בקשות 1–24', freeLaneAgentPrompts25to48: 'מסלול חינם, בקשות 25–48', maxSuperAgentPrompts25to48: 'MAX, בקשות 25–48', pairedLaneComparison: 'השוואה זוגית', seenVersusUnseen: 'מוכר מול חדש', failureMode: 'איך נכשל' }[k] || k}</dt><dd dir="auto">${v}</dd></div>`)}</dl>
          ${prod.caveats?.length ? html`<details class="md-d"><summary>${num(prod.caveats.length)} הסתייגויות</summary><ul>${prod.caveats.map((c) => html`<li dir="auto">${c}</li>`)}</ul></details>` : ''}
          <p class="md-src">${path(prod.file)}</p>` : nd()}</section>
      <section class="card md-front"><h2>חוקי הבית מול המודל לבדו <small>אותן שאלות, שלוש הנחיות מערכת</small></h2>
        ${d.frontier?.length ? html`<ol class="md-arms">${d.frontier.map((a, i) => html`<li style="--i:${i}"><p><b>${{ 'house-rules-plus': 'חוקי הבית + ארבעה חוקים חסרים', 'house-rules': 'חוקי הבית כפי שהם בייצור', neutral: 'בלי הנחיות Roblox' }[a.id] || a.id}</b><span>${pct(a.pct)}</span></p>
          <span class="md-bar a"><i style="width:${(a.pct * 100).toFixed(1)}%"></i></span><p class="md-why" dir="auto">${a.passed}/${a.measured} עברו · ${num(a.runs)} ריצות · ${a.what}</p></li>`)}</ol>` : nd()}</section>
    </div>

    <div class="g g2 md-two">
      <section class="card md-rag"><h2>מאגר הידע (RAG)</h2>
        ${rag ? html`<dl class="kv kv-row">
          <div><dt>קטעים</dt><dd>${num(rag.chunks)}</dd></div><div><dt>מסמכים</dt><dd>${num(rag.documents)}</dd></div>
          ${Object.entries(rag.kinds || {}).map(([k, n]) => html`<div><dt>${k === 'api' ? 'עיון ב-API' : k === 'guide' ? 'מדריכים' : k}</dt><dd>${num(n)}</dd></div>`)}
          <div><dt>גודל</dt><dd>${rag.sizeMb ? html`<bdi dir="ltr">${num(rag.sizeMb, 1)} MB</bdi>` : nd()}</dd></div></dl>
          <dl class="md-kv md-kv2"><div><dt>האינדקס</dt><dd class="mono" dir="ltr">${or(rag.index)}</dd></div><div><dt>מודל ההטמעה</dt><dd class="mono" dir="ltr">${or(rag.embedModel)}</dd></div>
          <div><dt>העלאה אחרונה</dt><dd>${rag.upload ? html`${stamp(rag.upload.ranAt)} · ${num(rag.upload.indexed)} באינדקס (+${num(rag.upload.added)} / ~${num(rag.upload.updated)} / −${num(rag.upload.removed)})` : nd()}</dd></div>
          <div><dt>מקורות</dt><dd>${rag.sources ? rag.sources : nd('רשימת המקורות לא נשמרה בקובץ העד')}</dd></div></dl>` : nd()}</section>
      <section class="card md-docs"><h2>מסמכי ראיות על המודלים <small>${num(d.docs.length)}</small></h2>
        <ul class="md-doclist">${d.docs.map((x) => html`<li><b dir="auto">${demd(x.title)}</b><span>${x.date ? day(x.date) : 'בלי תאריך'} · ${path(x.path)}</span></li>`)}</ul></section>
    </div>

    <div class="rk-sec"><h2>כרטיסי המיומנויות</h2><p>${sk ? html`${sk.what} (${path(sk.source)})` : ''}</p></div>
    ${sk?.cards?.length ? html`<div class="md-skills">${sk.cards.map((c, i) => html`<article class="card md-sk" style="--i:${i}">
      <p class="md-sk-d"><span class="chip chip-sm chip-ai">${c.domain}</span><span class="faint small">${num(c.triggers)} מילות הפעלה</span></p>
      <h3 dir="auto">${c.title}</h3>
      <p class="md-tools">${c.tools.map((t) => html`<bdi class="chip chip-sm mono" dir="ltr">${t}</bdi>`)}</p>
      <details class="md-d"><summary>המתכון (${num(c.recipe.length)} צעדים)</summary><ol>${c.recipe.map((x) => html`<li dir="auto">${x}</li>`)}</ol>
        ${c.avoid?.length ? html`<p class="md-av">להימנע:</p><ul>${c.avoid.map((x) => html`<li dir="auto">${x}</li>`)}</ul>` : ''}
        ${c.check ? html`<p class="md-av">בדיקה:</p><p dir="auto">${c.check}</p>` : ''}</details>
      ${c.docs?.length ? html`<p class="md-links">${c.docs.map((x) => html`<a href="${x.url}" target="_blank" rel="noopener noreferrer">${x.title}</a>`)}</p>` : ''}
    </article>`)}</div>` : html`<div class="card">${nd()}</div>`}`;
  },
};
