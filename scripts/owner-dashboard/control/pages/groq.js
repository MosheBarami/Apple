// Groq: the models the account can call, with context size and output limit.
import { html, num, compact, arr, meter } from '../ui.js';
import { stat } from './kit.js';

export default {
  id: 'groq', title: 'Groq', nav: 'Groq', brand: 'groq', needs: ['groq'],
  sub: 'המודלים המהירים שהאתר יכול להשתמש בהם, וכמה טקסט כל אחד מקבל ומחזיר',
  links: () => [{ label: 'Groq Console', url: 'https://console.groq.com/keys' }],
  render(d) {
    const g = d.groq || {}; const models = arr(g.models).slice().sort((a, b) => (b.context || 0) - (a.context || 0));
    const maxC = Math.max(1, ...models.map((m) => m.context || 0));
    const owners = [...new Set(models.map((m) => m.owner))];
    return html`
      <section class="g g4" aria-label="מדדים">
        ${stat({ key: 'gq-n', label: 'מודלים זמינים', value: models.length })}
        ${stat({ key: 'gq-a', label: 'פעילים', value: models.filter((m) => m.active).length, tone: 'good' })}
        ${stat({ key: 'gq-c', label: 'חלון הקשר הגדול', value: maxC, text: compact(maxC), unit: 'טוקנים' })}
        ${stat({ key: 'gq-o', label: 'יצרנים', value: owners.length, sub: owners.join(' · ') })}
      </section>
      <section class="card flush" aria-labelledby="h-gm"><h2 class="card-h" id="h-gm">מודלים<small>מהחלון הגדול לקטן</small></h2>
        <table><thead><tr><th>מודל</th><th>יצרן</th><th>חלון הקשר</th><th>פלט מקסימלי</th><th>מצב</th></tr></thead><tbody>
          ${models.map((m) => html`<tr><td data-l="מודל"><bdi class="mono">${m.id}</bdi></td><td data-l="יצרן">${m.owner}</td>
            <td data-l="חלון הקשר"><span class="row" style="gap:8px">${meter((m.context || 0) / maxC, 'var(--b-use)')}<span class="mono">${compact(m.context)}</span></span></td>
            <td data-l="פלט מקסימלי" class="mono">${compact(m.maxOut)}</td><td data-l="מצב">${m.active ? html`<span class="chip chip-ok">פעיל</span>` : html`<span class="chip chip-off">כבוי</span>`}</td></tr>`)}
        </tbody></table></section>
      <p class="explain">חלון הקשר = כמה טקסט המודל יכול לקרוא בבת אחת. ${num(1000)} טוקנים הם בערך 750 מילים באנגלית.</p>`;
  },
};
