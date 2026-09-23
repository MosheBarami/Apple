// GitHub: the repo's CI runs (re-run, re-run failed, cancel), workflows (run now, enable/disable),
// repo settings as switches, pull requests (approve / close), commits and branches.
import { html, num, ago, arr, short, duration, light } from '../ui.js';
import { icon } from '../logos.js';
import { gh, GH_SETTINGS } from '../actions.js';
import { stat, actBtn, swBtn, extBtn } from './kit.js';

const st = { runs: '' };
const FAIL = ['failure', 'timed_out', 'startup_failure'];
function runLight(r) {
  if (r.status !== 'completed') return light('warn', r.status === 'queued' ? 'בתור' : 'רץ עכשיו');
  if (r.conclusion === 'success') return light('ok', 'עבר');
  if (FAIL.includes(r.conclusion)) return light('bad', 'נכשל');
  return light('off', r.conclusion === 'cancelled' ? 'בוטל' : r.conclusion || '—');
}
const EVENT = { push: 'push', pull_request: 'PR', schedule: 'לפי שעון', workflow_dispatch: 'ידני', dynamic: 'אוטומטי' };

export default {
  id: 'github', title: 'GitHub', nav: 'GitHub', brand: 'github', needs: ['github'],
  sub: 'הבדיקות האוטומטיות, ה-workflows, ההגדרות של הריפו וכל מה שנכנס לקוד',
  links: (d) => [{ label: 'הריפו', url: d.github?.repo?.url }, { label: 'Actions', url: d.github?.repo?.url && `${d.github.repo.url}/actions` }],
  render(d) {
    const g = d.github || {}; const runs = arr(g.runs); const repo = g.repo || {};
    const done = runs.filter((r) => r.status === 'completed' && r.conclusion !== 'cancelled' && r.conclusion !== 'skipped');
    const passRate = done.length ? done.filter((r) => r.conclusion === 'success').length / done.length : null;
    const aiShare = arr(g.commits).length ? arr(g.commits).filter((c) => c.ai).length / arr(g.commits).length : null;
    const shown = runs.filter((r) => !st.runs || (st.runs === 'bad' ? FAIL.includes(r.conclusion) : r.status !== 'completed'));
    return html`
      <section class="g g4" aria-label="מדדים">
        ${stat({ key: 'gh-pass', label: 'ריצות שעברו', value: passRate == null ? null : Math.round(passRate * 100), text: passRate == null ? '—' : `${num(Math.round(passRate * 100))}%`, tone: passRate != null && passRate < 0.5 ? 'bad' : 'good', series: done.slice().reverse().map((r) => (r.conclusion === 'success' ? 1 : 0)), sparkCls: passRate < 0.5 ? 'bad' : '', sub: `מתוך ${num(done.length)} הריצות האחרונות` })}
        ${stat({ key: 'gh-commits', label: 'קומיטים אחרונים', value: arr(g.commits).length, sub: aiShare == null ? '' : `${num(Math.round(aiShare * 100))}% מהם נכתבו עם AI` })}
        ${stat({ key: 'gh-prs', label: 'PR פתוחים', value: arr(g.pulls).length, sub: `${num(repo.openIssues)} issues פתוחים` })}
        ${stat({ key: 'gh-br', label: 'ענפים', value: arr(g.branches).length, sub: html`ראשי: <bdi class="mono">${repo.defaultBranch || '—'}</bdi> · עודכן ${ago(repo.pushedAt)}` })}
      </section>
      <div class="g g21">
        <section class="card flush" aria-labelledby="h-runs"><h2 class="card-h" id="h-runs">${icon('refresh', 15)}ריצות CI<span class="grow"></span>
          ${[['', 'הכול'], ['bad', 'נכשלו'], ['live', 'רצות']].map(([k, l]) => html`<button class="chip chip-btn ${st.runs === k ? 'on' : ''}" data-act="runs" data-k="${k}" aria-pressed="${st.runs === k}">${l}</button>`)}</h2>
          <ul class="list">${shown.length ? shown.slice(0, 12).map((r) => html`<li class="li">${runLight(r)}
            <div class="li-m"><a class="li-t" href="${r.url}" target="_blank" rel="noopener noreferrer">${r.name} <span class="faint mono">#${String(r.id).slice(-5)}</span></a>
              <span class="li-s"><bdi class="mono">${r.branch}</bdi><span>${EVENT[r.event] || r.event}</span><span>${duration(r.durationSec)}</span>${ago(r.createdAt)}</span></div>
            <div class="li-a">${r.status !== 'completed' ? actBtn(gh.cancel(r), 'ביטול', { ic: 'x', cls: 'btn-sm btn-danger-o' })
              : html`${FAIL.includes(r.conclusion) ? actBtn(gh.rerunFailed(r), 'רק מה שנכשל', { ic: 'refresh' }) : ''}${actBtn(gh.rerun(r), 'הכול מחדש', { ic: 'refresh', cls: 'btn-sm btn-ghost' })}`}</div></li>`)
            : html`<li class="empty" style="padding:14px 20px">אין ריצות בסינון הזה.</li>`}</ul>
          ${shown.length > 12 ? html`<p style="padding:10px 20px 14px">${extBtn(repo.url && `${repo.url}/actions`, `עוד ${num(shown.length - 12)} ריצות ב-GitHub`, 'btn-sm btn-ghost')}</p>` : ''}</section>
        <div class="col">
          <section class="card flush" aria-labelledby="h-wf"><h2 class="card-h" id="h-wf">Workflows<small>מתג = פעיל/מושבת</small></h2>
            ${arr(g.workflows).map((w) => html`<div class="sw-row"><div class="li-m"><b>${w.name}</b><span><bdi class="mono">${w.path}</bdi></span></div>
              ${w.path?.startsWith('.github/') ? actBtn(gh.dispatch(w), 'הרצה', { ic: 'play', cls: 'btn-sm btn-ghost' }) : ''}${swBtn(gh.wfToggle(w), w.state === 'active', `${w.name} פעיל`)}</div>`)}</section>
          <section class="card flush" aria-labelledby="h-set"><h2 class="card-h" id="h-set">הגדרות הריפו<small>לחיצה = חלון אישור</small></h2>
            ${Object.entries(g.settings || {}).map(([k, v]) => html`<div class="sw-row"><div class="li-m"><b>${GH_SETTINGS[k]?.[0] || k}</b><span>${GH_SETTINGS[k]?.[1] || ''}</span></div>${swBtn(gh.setting(k, v), v, GH_SETTINGS[k]?.[0] || k)}</div>`)}</section>
        </div>
      </div>
      <div class="g g2">
        <section class="card flush" aria-labelledby="h-pr"><h2 class="card-h" id="h-pr">Pull requests</h2>
          ${arr(g.pulls).length ? html`<ul class="list">${arr(g.pulls).map((p) => html`<li class="li"><div class="li-m"><a class="li-t" dir="auto" href="${p.url}" target="_blank" rel="noopener noreferrer">#${p.number} ${p.title}</a>
            <span class="li-s">${p.author || ''}${p.draft ? html`<span class="chip chip-sm">טיוטה</span>` : ''}${ago(p.updatedAt || p.createdAt)}</span></div>
            <div class="li-a">${actBtn(gh.approvePr(p), 'אישור', { ic: 'check', cls: 'btn-sm btn-ok' })}${actBtn(gh.closePr(p), 'סגירה', { ic: 'x', cls: 'btn-sm btn-ghost' })}</div></li>`)}</ul>`
            : html`<p class="empty good" style="padding:14px 20px">אין PR פתוחים. כל העבודה נכנסה ישר ל-main.</p>`}
          <h3 class="card-h" style="padding:6px 20px 0">ענפים</h3>
          <ul class="list">${arr(g.branches).slice(0, 8).map((b) => html`<li class="li"><div class="li-m"><a class="li-t mono" dir="ltr" style="text-align:right" href="${b.url}" target="_blank" rel="noopener noreferrer">${b.name}</a><span class="li-s">${short(b.sha)} · ${ago(b.lastCommitAt)}</span></div>${b.protected ? html`<span class="chip chip-ok">מוגן</span>` : ''}</li>`)}</ul></section>
        <section class="card flush" aria-labelledby="h-cm"><h2 class="card-h" id="h-cm">קומיטים אחרונים</h2>
          <ul class="list">${arr(g.commits).slice(0, 14).map((c) => html`<li class="li"><div class="li-m"><a class="li-t" dir="auto" href="${c.url}" target="_blank" rel="noopener noreferrer" title="${c.title}">${c.title}</a>
            <span class="li-s"><bdi class="mono">${short(c.sha)}</bdi>${c.author}${ago(c.date)}</span></div>${c.ai ? html`<span class="chip chip-ai">AI</span>` : ''}</li>`)}</ul></section>
      </div>
      <p>${extBtn(repo.url && `${repo.url}/settings`, 'כל ההגדרות ב-GitHub', 'btn-sm btn-ghost')}</p>`;
  },
  actions: { runs(el, ctx) { st.runs = el.dataset.k; ctx.rerender(); } },
};
