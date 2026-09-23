// בריאות הריפו: who is working in the repository and how it stands (GET /api/cc/repo-health). Commit
// activity per agent and author from git, the open customer findings, the gates ledger (GATES.md),
// the owner queue, CI runs from GitHub, what the live Worker reports as its buildSha against HEAD,
// and the deploy log read from commit messages. Every number comes from one of those files or calls.
import { html, num, ago } from '../ui.js';
import { spark } from '../fx.js';
import { stat } from './kit.js';
import { nd, stamp, day, sha7, path, areaHe } from './repo-kit.js';

const SEV_HE = { critical: 'קריטי', high: 'גבוה', medium: 'בינוני', low: 'נמוך' };
const SEV_TONE = { critical: 'bad', high: 'warn', medium: 'ai', low: 'off' };
const CI_HE = { success: 'עבר', failure: 'נכשל', cancelled: 'בוטל', skipped: 'דולג', timed_out: 'חרג מהזמן', action_required: 'מחכה לאישור' };
const TARGET_HE = { worker: 'השרת', web: 'אפליקציית הווב', site: 'האתר', plugin: 'הפלאגין' };
const st = { deploys: false };

const ciChip = (r) => {
  if (r.status !== 'completed') return html`<span class="chip chip-sm chip-warn">${r.status === 'queued' ? 'בתור' : 'רץ עכשיו'}</span>`;
  const t = r.conclusion === 'success' ? 'ok' : r.conclusion === 'failure' ? 'bad' : 'off';
  return html`<span class="chip chip-sm chip-${t}">${CI_HE[r.conclusion] || r.conclusion || 'לא ידוע'}</span>`;
};

function live(d) {
  const l = d.live; const h = d.head;
  if (!l?.buildSha) return html`<section class="card rh-live">${nd(l?.reason || 'השרת החי לא החזיר buildSha')}</section>`;
  const same = h?.sha?.startsWith(l.buildSha);
  const tone = l.dirty ? 'warn' : !l.known ? 'warn' : l.behind > 0 ? 'warn' : 'ok';
  return html`<section class="card rh-live is-${tone}">
    <h2>מה רץ עכשיו בייצור</h2>
    <div class="rh-vs">
      <div><p class="rh-l">השרת החי</p><p class="rh-sha">${sha7(l.buildSha)}${l.dirty ? html`<span class="chip chip-sm chip-warn" title="נבנה מעץ עבודה עם שינויים שלא נשמרו בקומיט">עם שינויים לא שמורים</span>` : ''}</p><p class="faint small">גרסה ${l.version || '—'} · נבדק ${ago(l.time)}</p></div>
      <div class="rh-arrow" aria-hidden="true"><span>${same ? '=' : `${num(l.behind)}`}</span><i></i></div>
      <div><p class="rh-l">הקוד בריפו (HEAD)</p><p class="rh-sha">${sha7(h?.sha)}</p><p class="faint small" dir="auto">${h?.subject}</p></div>
    </div>
    <p class="rh-say">${same ? 'הייצור מריץ בדיוק את הקומיט האחרון.' : !l.known ? 'ה-buildSha של השרת החי לא נמצא בהיסטוריה של הריפו.' : html`הייצור <b>${num(l.behind)} קומיטים</b> מאחורי הקוד בריפו. לא כל קומיט משנה את השרת, אז פער לבדו אינו תקלה.`}</p>
    <p class="md-src">${path(l.url)} · HTTP ${l.status}</p></section>`;
}

function ci(d) {
  const c = d.ci;
  if (!c?.runs) return html`<section class="card rh-ci"><h2>CI ב-GitHub</h2><p class="note note-warn">${c?.reason || 'לא מתועד'}</p></section>`;
  const done = c.runs.filter((r) => r.status === 'completed');
  const fail = done.filter((r) => r.conclusion === 'failure').length; const ok = done.filter((r) => r.conclusion === 'success').length;
  return html`<section class="card rh-ci"><h2>CI ב-GitHub <small>${num(c.runs.length)} הריצות האחרונות · ${num(ok)} עברו · ${num(fail)} נכשלו</small></h2>
    <div class="rh-strip" aria-label="הריצות מהישנה לחדשה">${[...c.runs].reverse().map((r, i) => html`<a class="rh-tick ${r.status !== 'completed' ? 'q' : r.conclusion === 'success' ? 'ok' : r.conclusion === 'failure' ? 'bad' : 'off'}" style="--i:${i}" href="${r.url}" target="_blank" rel="noopener noreferrer" title="${r.title} · ${CI_HE[r.conclusion] || r.status}"></a>`)}</div>
    <ol class="rh-runs">${c.runs.slice(0, 8).map((r) => html`<li><a href="${r.url}" target="_blank" rel="noopener noreferrer">${ciChip(r)}<span dir="auto">${r.title}</span><span class="faint small">${r.workflow} · ${ago(r.at)}</span></a></li>`)}</ol></section>`;
}

function agents(d) {
  return html`<section class="card flush rh-agents"><h2 class="card-h">מי עובד בריפו <small>לפי שורת Co-Authored-By בכל קומיט · 14 הימים האחרונים</small></h2>
    <div class="tbl-wrap"><table class="md-tbl rh-tbl"><thead><tr><th scope="col">סוכן או אדם</th><th scope="col">סך הכול</th><th scope="col">שבוע</th><th scope="col">יממה</th><th scope="col">14 ימים</th><th scope="col">איפה עבד</th><th scope="col">לאחרונה</th></tr></thead>
    <tbody>${d.agents.map((a, i) => html`<tr style="--i:${i}"><td><b>${a.name}</b>${a.human ? html`<span class="chip chip-sm">אדם</span>` : ''}</td>
      <td class="rh-n">${num(a.n)}</td><td class="rh-n">${num(a.week)}</td><td class="rh-n ${a.day ? 'hot' : ''}">${num(a.day)}</td>
      <td class="rh-sp" title="${a.spark.join(' · ')}">${spark(a.spark, { w: 120, h: 28, label: `${a.name}: קומיטים ביום` })}</td>
      <td>${a.areas.map((x) => html`<span class="chip chip-sm">${areaHe(x.id)} ${num(x.n)}</span>`)}</td><td class="faint small">${ago(a.last)}</td></tr>`)}</tbody></table></div>
    <p class="md-foot">כותבי הקומיטים ב-git: ${d.authors.map((a) => `${a.name} (${num(a.n)})`).join(' · ')}.</p></section>`;
}

function findings(d) {
  const f = d.findings; if (!f) return html`<section class="card">${nd()}</section>`;
  const sevs = Object.keys(SEV_HE);
  return html`<section class="card rh-find"><h2>ממצאים מהלקוח <small>${num(f.open.length)} פתוחים מתוך ${num(f.total)} · ${path(f.source)}</small></h2>
    <div class="rh-sev">${sevs.map((s, i) => { const b = f.bySev?.[s] || { open: 0, closed: 0 }; const t = b.open + b.closed || 1; return html`<div style="--i:${i}">
      <p><span class="chip chip-sm chip-${SEV_TONE[s]}">${SEV_HE[s]}</span><span>${num(b.open)} פתוחים · ${num(b.closed)} נסגרו</span></p>
      <span class="rh-bar"><i class="c" style="width:${(b.closed / t * 100).toFixed(1)}%"></i><i class="o" style="width:${(b.open / t * 100).toFixed(1)}%"></i></span></div>`; })}</div>
    <ol class="rh-flist">${[...f.open].sort((a, b) => sevs.indexOf(a.sev) - sevs.indexOf(b.sev)).map((x) => html`<li class="sev-${x.sev}">
      <p class="rh-fh"><span class="chip chip-sm chip-${SEV_TONE[x.sev] || 'off'}">${SEV_HE[x.sev] || x.sev}</span><b>${x.id}</b>${x.reopened ? html`<span class="chip chip-sm chip-warn">נפתח מחדש</span>` : ''}</p>
      <p dir="auto" class="rh-ft">${x.text}</p>${x.evidence ? html`<details class="dh-f"><summary>הראיה</summary><p dir="auto" class="rh-ft">${x.evidence}</p></details>` : ''}</li>`)}</ol></section>`;
}

function gates(d) {
  const g = d.gates; if (!g) return html`<section class="card">${nd()}</section>`;
  const ST = { met: ['עומד', 'ok'], open: ['פתוח', 'bad'], unproven: ['לא הוכח', 'warn'] };
  return html`<section class="card rh-gates"><h2>שערי האיכות <small>${path(g.source)}</small></h2>
    <div class="rh-ring" style="--p:${(g.met / (g.total || 1) * 100).toFixed(1)}"><b>${num(g.met)}/${num(g.total)}</b><span>עומדים</span></div>
    <dl class="kv kv-row"><div><dt>נבדקו קודם באדום</dt><dd>${num(g.redFirst)} מתוך ${num(g.total)}</dd></div><div><dt>ראיה אחרונה</dt><dd>${day(g.lastEvidenceAt)}</dd></div><div><dt>פתוחים</dt><dd>${num(g.open)}</dd></div><div><dt>לא הוכחו</dt><dd>${num(g.unproven)}</dd></div></dl>
    <p class="rh-l">הפרקים בקובץ (שמות הפרקים כפי שנכתבו, לא מצב השערים)</p><ul class="rh-secs">${g.sections.map((s) => html`<li><span dir="auto">${s.title}</span><b>${num(s.n)}</b></li>`)}</ul>
    <details class="dh-f" data-keep><summary>כל ${num(g.gates.length)} השערים</summary><ol class="rh-glist">${g.gates.map((x) => html`<li><span class="chip chip-sm chip-${(ST[x.state] || ['', 'off'])[1]}">${(ST[x.state] || [x.state])[0]}</span><b>${x.id}</b><span dir="auto">${x.title}</span>${x.evidence ? html`<span class="faint small">${sha7(x.evidence.sha)} · ${stamp(x.evidence.at)}</span>` : ''}</li>`)}</ol></details></section>`;
}

function queue(d) {
  const q = d.queue; if (!q) return html`<section class="card">${nd()}</section>`;
  return html`<section class="card rh-queue"><h2>מה מחכה לבעלים <small>${num(q.open.length)} פתוחים · ${num(q.done)} נסגרו · ${path(q.source)}</small></h2>
    <ol class="rh-qlist">${q.open.map((x, i) => html`<li style="--i:${i}"><p class="rh-fh"><b>${x.id}</b>${x.paid ? html`<span class="chip chip-sm chip-warn">עולה כסף</span>` : ''}${x.blocks && x.blocks !== 'none' ? html`<span class="chip chip-sm chip-bad" title="${x.blocks}">חוסם</span>` : ''}</p>
      <p class="rh-l">מה לעשות</p><p dir="auto" class="rh-ft">${x.step}</p>${x.why ? html`<p dir="auto" class="rh-ft faint">${x.why}</p>` : ''}</li>`)}</ol></section>`;
}

function deploys(d) {
  const list = st.deploys ? d.deploys : d.deploys.slice(0, 10);
  return html`<section class="card flush rh-dep"><h2 class="card-h">יומן ההעלאות לייצור <small>${num(d.deploys.length)} קומיטים שמתעדים העלאה</small></h2>
    <ol class="rh-dlist">${list.map((x, i) => html`<li data-k="dp-${x.sha}" style="--i:${Math.min(i, 12)}">
      <span class="rh-dt">${stamp(x.at)}</span>
      <div><p class="rh-c-t">${sha7(x.sha)}<span dir="auto">${x.subject}</span></p>
        <p class="rh-dm">${x.targets.map((t) => html`<span class="chip chip-sm chip-ai">${TARGET_HE[t] || t}</span>`)}${x.worker ? html`<span class="faint small">גרסת Worker ${sha7(x.worker)}</span>` : ''}<span class="faint small" dir="auto">${x.line}</span></p></div></li>`)}</ol>
    ${d.deploys.length > 10 ? html`<div class="rh-more"><button class="btn btn-sm btn-ghost" data-act="deploys">${st.deploys ? 'להציג פחות' : `להציג את כל ${num(d.deploys.length)}`}</button></div>` : ''}</section>`;
}

export default {
  id: 'repo-health',
  title: 'בריאות הריפו',
  nav: 'בריאות הריפו',
  glyph: 'health',
  eyebrow: 'ריפו וידע · מי עובד ואיך זה עומד',
  sub: 'הפעילות של כל סוכן, הממצאים הפתוחים, שערי האיכות, ה-CI, מה רץ בייצור מול הקוד בריפו, ויומן ההעלאות.',
  endpoint: '/api/cc/repo-health',
  render(d) {
    const a = d.activity; const f = d.findings; const g = d.gates;
    return html`
    <section class="g g4">
      ${stat({ key: 'rh-24', label: 'קומיטים ביממה האחרונה', value: a.last24h, sub: `${num(a.last7d)} בשבוע · ${num(a.total)} בסך הכול` })}
      ${stat({ key: 'rh-unc', label: 'קבצים שלא נשמרו בקומיט', value: a.uncommitted, tone: a.uncommitted > 50 ? 'warn' : '', sub: 'עבודה פתוחה בעץ העבודה עכשיו' })}
      ${stat({ key: 'rh-f', label: 'ממצאים פתוחים', value: f?.open?.length, tone: f?.bySev?.critical?.open ? 'bad' : '', sub: f ? `${num(f.bySev?.critical?.open || 0)} קריטיים · ${num(f.closed)} נסגרו` : 'לא מתועד' })}
      ${stat({ key: 'rh-g', label: 'שערי איכות שעומדים', text: g ? `${num(g.met)}/${num(g.total)}` : '—', sub: g ? `ראיה אחרונה ${day(g.lastEvidenceAt)}` : 'לא מתועד' })}
    </section>
    <div class="g g2 rh-two">${live(d)}${ci(d)}</div>
    <div class="rk-sec"><h2>הסוכנים והאנשים</h2></div>
    ${agents(d)}
    <div class="g g2 rh-two">${findings(d)}<div class="rh-col">${gates(d)}${queue(d)}</div></div>
    <div class="rk-sec"><h2>העלאות וגרסאות</h2></div>
    ${deploys(d)}
    <div class="rh-rel">${d.releases.map((r, i) => html`<article class="card" style="--i:${i}"><p class="rh-fh"><span class="md-v">${r.version}</span><span class="faint small">${r.date || 'בלי תאריך'} · ${num(r.changes)} שינויים</span></p><h3 dir="auto">${r.title}</h3><p dir="auto" class="rh-ft">${r.lede}</p></article>`)}</div>`;
  },
  actions: {
    deploys(el, ctx) { st.deploys = !st.deploys; ctx.rerender(); },
  },
};
