// Hugging Face: the account's Spaces (restart / pause), models and datasets.
import { html, num, ago, arr } from '../ui.js';
import { icon } from '../logos.js';
import { hfx } from '../actions.js';
import { stat, actBtn, extBtn, note } from './kit.js';

const STAGE = { RUNNING: ['ok', 'רץ'], BUILDING: ['warn', 'נבנה'], PAUSED: ['off', 'מושהה'], SLEEPING: ['off', 'ישן'], STOPPED: ['off', 'עצור'], NO_APP_FILE: ['warn', 'אין קובץ אפליקציה'], RUNTIME_ERROR: ['bad', 'קרס'], BUILD_ERROR: ['bad', 'הבנייה נכשלה'] };

const repoRow = (r, kind) => html`<li class="li"><div class="li-m"><a class="li-t mono" dir="ltr" style="text-align:right" href="${r.url}" target="_blank" rel="noopener noreferrer">${r.id}</a>
  <span class="li-s">${r.private ? html`<span class="chip chip-sm">פרטי</span>` : html`<span class="chip chip-sm chip-ok">ציבורי</span>`}${r.library ? html`<bdi class="mono">${r.library}</bdi>` : ''}${r.pipeline ? html`<bdi class="mono">${r.pipeline}</bdi>` : ''}<span>${num(r.downloads)} הורדות · ${num(r.likes)} לייקים</span><span>עודכן ${ago(r.updatedAt)}</span></span></div>
  <span class="chip">${kind}</span></li>`;

export default {
  id: 'hf', title: 'Hugging Face', nav: 'Hugging Face', brand: 'huggingface', needs: ['hf'],
  sub: 'המודל שאומן על Roblox, מאגר הנתונים שלו וה-Spaces שרצים בחשבון',
  links: (d) => [{ label: 'הפרופיל ב-Hugging Face', url: d.hf?.user && `https://huggingface.co/${d.hf.user}` }],
  render(d) {
    const h = d.hf || {}; const spaces = arr(h.spaces);
    return html`
      <section class="g g4" aria-label="מדדים">
        ${stat({ key: 'hf-m', label: 'מודלים', value: arr(h.models).length, sub: arr(h.models).map((m) => m.id.split('/')[1]).join(', ') })}
        ${stat({ key: 'hf-d', label: 'מאגרי נתונים', value: arr(h.datasets).length, sub: arr(h.datasets).map((m) => m.id.split('/')[1]).join(', ') })}
        ${stat({ key: 'hf-s', label: 'Spaces', value: spaces.length, sub: `${num(spaces.filter((s) => s.runtimeStage === 'RUNNING').length)} רצים עכשיו` })}
        ${stat({ key: 'hf-dl', label: 'הורדות', value: [...arr(h.models), ...arr(h.datasets)].reduce((a, r) => a + (+r.downloads || 0), 0), sub: `חשבון ${h.user || '—'}` })}
      </section>
      <section class="card flush" aria-labelledby="h-sp"><h2 class="card-h" id="h-sp">${icon('bolt', 15)}Spaces<small>אפליקציות שרצות על השרתים של Hugging Face</small></h2>
        <ul class="list">${spaces.length ? spaces.map((s) => { const [c, l] = STAGE[s.runtimeStage] || ['off', s.runtimeStage || '—']; return html`<li class="li">
          <span class="light light-${c}"><i></i>${l}</span>
          <div class="li-m"><a class="li-t mono" dir="ltr" style="text-align:right" href="${s.url}" target="_blank" rel="noopener noreferrer">${s.id}</a>
            <span class="li-s"><bdi class="mono">${s.sdk || ''}</bdi><span>${s.hardware || 'חומרה חינמית'}</span><span>עודכן ${ago(s.updatedAt)}</span></span></div>
          <div class="li-a">${actBtn(hfx.restart(s), 'הפעלה מחדש', { ic: 'refresh', cls: 'btn-sm btn-brand' })}${/RUNNING/.test(s.runtimeStage || '') ? actBtn(hfx.pause(s), 'השהיה', { ic: 'pause', cls: 'btn-sm btn-ghost' }) : ''}${extBtn(s.url && `${s.url}/settings`, 'הגדרות', 'btn-sm btn-ghost')}</div></li>`; })
          : html`<li class="empty" style="padding:14px 20px">אין Spaces בחשבון.</li>`}</ul>
        ${spaces.some((s) => s.runtimeStage === 'NO_APP_FILE') ? html`<div style="padding:0 20px 16px">${note('info', 'Space בלי קוד', 'ל-Space הזה אין קובץ אפליקציה (למשל Dockerfile או app.py), ולכן הוא לא עולה. הפעלה מחדש לא מזיקה, אבל הוא יעלה רק אחרי שיועלה אליו קוד.')}</div>` : ''}</section>
      <section class="card flush" aria-labelledby="h-md"><h2 class="card-h" id="h-md">מודלים ומאגרי נתונים</h2>
        <ul class="list">${arr(h.models).map((m) => repoRow(m, 'מודל'))}${arr(h.datasets).map((m) => repoRow(m, 'מאגר נתונים'))}</ul></section>`;
  },
};
