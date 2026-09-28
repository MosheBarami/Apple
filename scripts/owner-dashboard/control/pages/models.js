// המודלים של Apple: what the product actually runs, all from files in the repository
// (GET /api/cc/models): the model registry (packages/shared), the RAG index, the model evidence
// documents and the skill cards. A fact no file records says "לא מתועד". Training and LoRA were
// cancelled (V3 §2), so the LoRA runs, adapter evals and Apple MAX frontier lanes are retired.
import { html, num } from '../ui.js';
import { stat } from './kit.js';
import { nd, or, day, stamp, path } from './repo-kit.js';

const PLAN_HE = { free: 'Free', builder: 'Builder', studio: 'Studio', enterprise: 'Enterprise' };
const TIER_HE = { free: 'חינם', pro: 'Pro', max: 'Max' };
const demd = (s) => String(s || '').replace(/\*\*|`/g, '');

function registry(r) {
  if (!r?.models?.length) return html`<div class="card">${nd('packages/shared/src/models.ts לא נקרא')}</div>`;
  const plans = Object.keys(r.tierForPlan || PLAN_HE);
  return html`<div class="card flush md-reg"><h2 class="card-h">רישום המודלים <small>${path(r.source)} · מה כל תוכנית מקבלת</small></h2>
    <div class="tbl-wrap"><table class="md-tbl">
      <thead><tr><th scope="col">המודל</th><th scope="col">ספק ומודל בסיס</th><th scope="col">מסלול</th>${plans.map((p) => html`<th scope="col" class="md-pl">${PLAN_HE[p] || p}<small>${TIER_HE[r.tierForPlan?.[p]] || ''}</small></th>`)}<th scope="col">חלון / פלט</th></tr></thead>
      <tbody>${r.models.map((m, i) => html`<tr style="--i:${i}">
        <td><b>${m.displayName}</b><span class="md-id mono" dir="ltr">${m.id}</span>${m.blurb ? html`<p class="md-blurb" dir="auto">${m.blurb}</p>` : ''}</td>
        <td><span class="chip chip-sm">${m.vendor}</span><bdi class="md-pm mono" dir="ltr">${m.providerModelId}</bdi></td>
        <td><bdi class="mono small" dir="ltr">${m.route}</bdi><p class="faint small">מאמץ חשיבה: ${or(m.reasoningEffort)}${m.vision ? ' · ראייה' : ''}${m.nativeTools ? ' · כלים' : ''}</p></td>
        ${plans.map((p) => (m.plans.includes(p) ? html`<td class="md-pl"><span class="md-yes" title="זמין בתוכנית ${PLAN_HE[p]}">✓</span></td>` : html`<td class="md-pl"><span class="md-no" title="${m.locked || 'לא זמין'}">—</span></td>`))}
        <td class="mono small">${m.ctx ? num(m.ctx) : nd()} / ${m.maxOutputTokens ? num(m.maxOutputTokens) : nd()}</td>
      </tr>`)}</tbody></table></div>
    <p class="md-foot">✓ = כלול בתוכנית, — = לא כלול (מעבר עם העכבר מראה מה פותח אותו).</p></div>`;
}

export default {
  id: 'models',
  title: 'המודלים של Apple',
  nav: 'המודלים של Apple',
  glyph: 'models',
  eyebrow: 'ריפו וידע · מה רץ בייצור',
  sub: 'איזה מודל רץ בייצור, מאגר הידע (RAG) וכרטיסי המיומנויות.',
  endpoint: '/api/cc/models',
  render(d) {
    const r = d.registry; const rag = d.rag; const sk = d.skills;
    return html`
    <section class="g g3">
      ${stat({ key: 'md-n', label: 'מודלים ברישום', value: r?.models?.length, sub: r ? [...new Set(r.models.map((m) => m.providerModelId))].length + ' מודלי בסיס שונים' : '' })}
      ${stat({ key: 'md-rag', label: 'קטעי ידע ב-RAG', value: rag?.chunks, sub: rag ? `מ-${num(rag.documents)} מסמכים · נמדד ${day(rag.witnessAt)}` : 'לא מתועד' })}
      ${stat({ key: 'md-sk', label: 'כרטיסי מיומנות', value: sk?.cards?.length, sub: sk ? `עד ${num(sk.limits.perPrompt)} לבקשה, ${num(sk.limits.perRun)} לריצה` : 'לא מתועד' })}
    </section>
    <div class="rk-sec"><h2>מה כל תוכנית מקבלת</h2><p>הרישום בקוד הוא המקור; השער לפי תוכנית מחושב מאותה פונקציה שהשרת משתמש בה.</p></div>
    ${registry(r)}

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
