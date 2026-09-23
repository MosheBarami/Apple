// Langflow: the local instance (localhost:7860) and the product flows checked in at
// packages/langflow/. Each flow shows whether it is imported into the instance, its last run and a
// one-click "open in Langflow". Langflow down, or the folder missing, is a calm state, never an error.
import { html, num, ago, arr, light } from '../ui.js';
import { icon } from '../logos.js';
import { stat, extBtn, note } from './kit.js';

const dots = (n, ok) => html`<span class="flow-n ${ok ? 'is-ok' : ''}" aria-hidden="true" style="--n:${Math.max(1, Math.min(8, n || 1))}">${Array.from({ length: Math.max(1, Math.min(8, n || 1)) }, (_, k) => html`<i style="--k:${k}"></i>`)}</span>`;

export default {
  id: 'langflow', title: 'Langflow', nav: 'Langflow', brand: 'langflow', needs: ['langflow'],
  sub: 'זרימות ה-AI של המוצר: מה נשמר בריפו, מה נטען ל-Langflow המקומי, ומתי כל אחת רצה לאחרונה',
  links: (d) => [{ label: 'Langflow המקומי', url: d.langflow?.running ? d.langflow.url : null }],
  render(d) {
    const l = d.langflow || {}; const flows = arr(l.flows);
    const imported = flows.filter((f) => f.imported).length;
    const okRuns = flows.filter((f) => f.lastRun?.ok).length;
    const state = !l.running
      ? note('info', 'Langflow לא רץ כרגע', `לא הגיעה תשובה מ-${l.url || 'http://localhost:7860'}. זה בסדר: הזרימות שמורות בריפו ויופיעו כאן לבד כש-Langflow יעלה (הדף מתעדכן כל 20 שניות).`)
      : l.auth === 'refused' ? note('warn', 'Langflow רץ אבל לא נותן לקרוא את הזרימות', 'ההתחברות האוטומטית כבויה. אפשר להוסיף ל-.env את LANGFLOW_API_KEY ולהפעיל מחדש את לוח הבקרה.') : '';
    return html`
      <section class="g g4" aria-label="מדדים">
        ${stat({ key: 'lf-run', label: 'Langflow המקומי', text: l.running ? 'רץ' : 'לא רץ', tone: l.running ? 'good' : '', sub: l.version ? `גרסה ${l.version}` : (l.url || '') })}
        ${stat({ key: 'lf-flows', label: 'זרימות בריפו', value: flows.length, sub: l.repoFolder ? 'packages/langflow' : 'התיקייה עוד לא קיימת' })}
        ${stat({ key: 'lf-imp', label: 'נטענו ל-Langflow', value: l.running ? imported : null, text: l.running ? `${num(imported)}/${num(flows.length)}` : '—', tone: l.running && imported < flows.length ? 'warn' : l.running ? 'good' : '' })}
        ${stat({ key: 'lf-ok', label: 'ריצה אחרונה הצליחה', value: l.running ? okRuns : null, text: l.running ? `${num(okRuns)}/${num(flows.length)}` : '—', sub: l.running && l.extraInstanceFlows ? `ועוד ${num(l.extraInstanceFlows)} זרימות שלא מהריפו` : '' })}
      </section>
      ${state}
      ${!l.repoFolder ? note('info', 'עוד אין זרימות בריפו', 'כשתיווסף התיקייה packages/langflow עם קבצי JSON של זרימות, הן יופיעו כאן אוטומטית.') : ''}
      ${flows.length ? html`<section class="card flush" aria-labelledby="h-fl"><h2 class="card-h" id="h-fl">${icon('bolt', 15)}זרימות המוצר<small>לחיצה על "פתיחה" פותחת את הזרימה בעורך של Langflow</small></h2>
        <ul class="list">${flows.map((f) => html`<li class="li flow">
          ${dots(f.nodes, f.lastRun?.ok)}
          <div class="li-m"><span class="li-t" dir="auto">${f.name}</span>
            ${f.description ? html`<span class="li-s" dir="auto">${f.description}</span>` : ''}
            <span class="li-s">${f.imported == null ? html`<span class="chip chip-sm chip-off">לא ידוע</span>` : f.imported ? html`<span class="chip chip-sm chip-ok">נטענה ל-Langflow</span>` : html`<span class="chip chip-sm chip-warn">לא נטענה</span>`}
              ${f.lastRun ? light(f.lastRun.ok ? 'ok' : 'bad', html`${f.lastRun.ok ? 'רצה בהצלחה' : 'נכשלה'} ${ago(f.lastRun.at)}`) : f.imported ? light('off', 'עוד לא רצה') : ''}</span>
            <span class="li-s"><bdi class="mono">${f.file}</bdi>${f.endpoint ? html`<bdi class="mono">/${f.endpoint}</bdi>` : ''}<span>${num(f.nodes)} רכיבים</span>${f.updatedAt ? html`<span>עודכן ${ago(f.updatedAt)}</span>` : ''}</span></div>
          <div class="li-a">
            ${f.openUrl ? extBtn(f.openUrl, 'פתיחה ב-Langflow', 'btn-sm btn-brand') : html`<button class="btn btn-sm" disabled title="${l.running ? 'הזרימה לא נטענה ל-Langflow' : 'Langflow לא רץ'}"><span>פתיחה ב-Langflow</span></button>`}</div></li>`)}</ul></section>` : ''}
      <p class="explain">הזרימות נטענות ל-Langflow מהריפו (packages/langflow/sync.mjs). לוח הבקרה רק קורא: הוא לא מריץ זרימות ולא משנה אותן.</p>`;
  },
};
