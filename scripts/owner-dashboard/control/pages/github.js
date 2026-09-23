import { html, raw, num, ago, arr, brand, extLink, duration, short, part, isFail, failCard } from '../ui.js';

// GitHub-style status icons (octicon-like shapes)
const ICON = {
  success: '<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M4.7 8.2l2.2 2.1 4.4-4.5" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  failure: '<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>',
  running: '<svg viewBox="0 0 16 16" width="16" height="16" class="spin"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-opacity=".3" stroke-width="2" fill="none"/><path d="M8 2a6 6 0 016 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
  queued: '<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>',
  cancelled: '<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" fill="none"/><path d="M4 12L12 4" stroke="currentColor" stroke-width="2"/></svg>',
  skipped: '<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" fill="none"/><path d="M5 8h6" stroke="currentColor" stroke-width="2"/></svg>',
};
function runState(r) {
  if (r.status && r.status !== 'completed') return r.status === 'in_progress' ? ['running', 'רץ עכשיו', 'gh-warn'] : ['queued', 'בתור', 'gh-warn'];
  return {
    success: ['success', 'הצליח', 'gh-ok'], failure: ['failure', 'נכשל', 'gh-bad'], timed_out: ['failure', 'חרג מהזמן', 'gh-bad'], startup_failure: ['failure', 'לא עלה', 'gh-bad'],
    cancelled: ['cancelled', 'בוטל', 'gh-dim'], skipped: ['skipped', 'דולג', 'gh-dim'], neutral: ['skipped', 'ניטרלי', 'gh-dim'], action_required: ['queued', 'מחכה לאישור', 'gh-warn'],
  }[r.conclusion] || ['skipped', r.conclusion || 'לא ידוע', 'gh-dim'];
}
const stIcon = (r) => { const [i, l, c] = runState(r); return html`<span class="gh-st ${c}" title="${l}">${raw(ICON[i])}<span>${l}</span></span>`; };

function box(title, countN, body, extra = '') {
  return html`<section class="gh-box"><header class="gh-box-h"><h2>${title}${countN != null ? html` <span class="gh-count">${num(countN)}</span>` : ''}</h2>${extra}</header>${body}</section>`;
}

function commits(list) {
  return part(list, (cs) => html`<ul class="gh-rows">${cs.slice(0, 15).map((c) => html`<li class="gh-row">
    <div class="gh-row-m">${extLink(c.url, c.title, 'gh-link')} ${c.ai ? html`<span class="gh-label gh-label-ai">AI</span>` : ''}
      <div class="gh-meta"><b>${c.author || ''}</b> ${ago(c.date)}</div></div>
    ${extLink(c.url, html`<bdi class="mono">${short(c.sha)}</bdi>`, 'gh-sha')}</li>`)}</ul>`, { empty: 'אין קומיטים להציג.' });
}

function pulls(list) {
  return part(list, (ps) => html`<ul class="gh-rows">${ps.map((p) => html`<li class="gh-row">
    <span class="gh-pr-ic ${p.draft ? 'gh-dim' : 'gh-ok'}" aria-hidden="true">${raw('<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="4" cy="3.5" r="1.8" stroke="currentColor" stroke-width="1.4" fill="none"/><circle cx="4" cy="12.5" r="1.8" stroke="currentColor" stroke-width="1.4" fill="none"/><circle cx="12" cy="12.5" r="1.8" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M4 5.3v5.4M12 10.7V6a2 2 0 00-2-2H7.5" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>')}</span>
    <div class="gh-row-m">${extLink(p.url, p.title, 'gh-link')} ${p.draft ? html`<span class="gh-label">טיוטה</span>` : ''} ${checks(p.checks)}
      <div class="gh-meta"><bdi class="ltr">#${p.number}</bdi> נפתח ${ago(p.createdAt)} ע״י ${p.author || '—'}</div></div>
    <div class="gh-btns">
      <button class="gh-btn gh-btn-primary" data-act="approve" data-n="${p.number}">אישור</button>
      <button class="gh-btn gh-btn-danger" data-act="close" data-n="${p.number}">סגירה</button>
    </div></li>`)}</ul>`, { empty: 'אין בקשות שינוי (PR) פתוחות.' });
}
function checks(c) {
  if (c == null) return '';
  if (typeof c === 'string') { const r = { status: 'completed', conclusion: c === 'pending' ? null : c }; if (c === 'pending') r.status = 'in_progress'; return stIcon(r); }
  if (typeof c === 'object' && ('conclusion' in c || 'status' in c)) return stIcon(c);
  if (typeof c === 'object') { const f = c.failure || c.failed || 0; const p = c.pending || 0; const s = c.success || c.passed || 0; return html`<span class="gh-meta">${f ? html`<span class="gh-bad">✗ ${num(f)}</span> ` : ''}${p ? html`<span class="gh-warn">● ${num(p)}</span> ` : ''}${s ? html`<span class="gh-ok">✓ ${num(s)}</span>` : ''}</span>`; }
  return '';
}

function runs(list, wfs) {
  const wfName = Object.fromEntries(arr(wfs).map((w) => [w.id, w.name]));
  return part(list, (rs) => html`<div class="tbl-wrap"><table class="gh-tbl">
    <thead><tr><th scope="col">מצב</th><th scope="col">ריצה</th><th scope="col">ענף</th><th scope="col">מתי</th><th scope="col">משך</th><th scope="col"><span class="sr">פעולות</span></th></tr></thead>
    <tbody>${rs.slice(0, 25).map((r) => { const live = r.status && r.status !== 'completed'; const failed = ['failure', 'timed_out', 'startup_failure', 'cancelled'].includes(r.conclusion); return html`<tr>
      <td data-l="מצב">${stIcon(r)}</td>
      <td data-l="ריצה">${extLink(r.url, r.name || wfName[r.workflowId] || `#${r.id}`, 'gh-link')}<div class="gh-meta">${r.event || ''}</div></td>
      <td data-l="ענף"><bdi class="gh-branch">${r.branch || '—'}</bdi></td>
      <td data-l="מתי">${ago(r.createdAt)}</td>
      <td data-l="משך" class="mono">${duration(r.durationSec)}</td>
      <td class="gh-btns">
        ${live ? html`<button class="gh-btn gh-btn-danger" data-act="run" data-k="cancel" data-id="${r.id}">עצירה</button>`
    : html`<button class="gh-btn" data-act="run" data-k="rerun" data-id="${r.id}">↻ הרצה חוזרת</button>${failed ? html`<button class="gh-btn" data-act="run" data-k="rerun-failed" data-id="${r.id}">רק מה שנכשל</button>` : ''}`}
      </td></tr>`; })}</tbody></table></div>`, { empty: 'אין ריצות אוטומטיות (Actions) להציג.' });
}

const RUN_TXT = {
  rerun: ['להריץ שוב את כל הבדיקות?', 'GitHub יריץ מחדש את כל השלבים של הריצה הזו. זה לא משנה קוד, רק בודק אותו שוב.', 'לא צריך. הרצה חוזרת לא משנה כלום בקוד.', '↻ כן, להריץ שוב'],
  'rerun-failed': ['להריץ שוב רק את מה שנכשל?', 'GitHub יריץ מחדש רק את השלבים שנכשלו בריצה הזו. זה לא משנה קוד.', 'לא צריך. הרצה חוזרת לא משנה כלום בקוד.', 'כן, להריץ שוב'],
  cancel: ['לעצור את הריצה?', 'הריצה תיעצר באמצע, והבדיקות שלה לא יסתיימו.', 'אפשר להריץ אותה שוב אחר כך בלחיצה על "הרצה חוזרת".', 'כן, לעצור'],
};

export default {
  id: 'github', title: 'GitHub', theme: 'github', icon: brand('github'), mark: brand('github', 'bm-lg'), endpoint: '/api/cc/github',
  sub: 'הקוד, השינויים והבדיקות האוטומטיות',
  render(d) {
    const r = d.repo || {};
    const pl = arr(d.pulls); const br = d.branches;
    return html`
      ${isFail(d.repo) ? failCard(d.repo.reason, { level: 'warn', title: 'פרטי המאגר לא זמינים' }) : html`<div class="gh-head">
        <div class="gh-repo">${brand('github', 'bm-md')}<bdi class="ltr">${extLink(r.url, html`<span class="gh-owner">${(r.fullName || '').split('/')[0]}</span> / <b>${(r.fullName || '').split('/')[1] || ''}</b>`, 'gh-link gh-repo-n')}</bdi>
          <span class="gh-label">${r.private ? 'Private' : 'Public'}</span></div>
        <div class="gh-meta">ענף ראשי: <bdi class="gh-branch">${r.defaultBranch || '—'}</bdi> · עדכון אחרון ${ago(r.pushedAt)}${d.account ? html` · מחובר בתור <bdi class="ltr">${typeof d.account === 'string' ? d.account : d.account.login || ''}</bdi>` : ''}</div>
        <nav class="gh-tabs" aria-label="קפיצה לחלק בדף"><a href="#gh-commits" data-act="jump">⟨⟩ קוד</a><a href="#gh-pulls" data-act="jump">בקשות שינוי <span class="gh-count">${num(pl.length)}</span></a><a href="#gh-runs" data-act="jump">▶ Actions</a></nav>
      </div>`}
      <div class="gh-grid">
        <div class="gh-main">
          <div id="gh-pulls">${box('בקשות שינוי פתוחות (PR)', pl.length, pulls(d.pulls))}</div>
          <div id="gh-commits">${box('קומיטים אחרונים', arr(d.commits).length || null, commits(d.commits))}</div>
        </div>
        <aside class="gh-side">
          ${box('ענפים', arr(br).length || null, part(br, (bs) => html`<ul class="gh-rows">${bs.slice(0, 12).map((b) => html`<li class="gh-row gh-row-sm">${extLink(b.url, html`<bdi class="gh-branch">${b.name}</bdi>`)}${b.protected ? html`<span class="gh-label" title="ענף מוגן: אי אפשר לדחוף אליו ישירות">מוגן</span>` : ''}<span class="gh-meta">${ago(b.lastCommitAt)}</span></li>`)}</ul>`, { empty: 'אין ענפים.' }))}
          ${box('תהליכים אוטומטיים', arr(d.workflows).length || null, part(d.workflows, (ws) => html`<ul class="gh-rows">${ws.map((w) => html`<li class="gh-row gh-row-sm">${extLink(w.url, w.name, 'gh-link')}<span class="gh-label ${w.state === 'active' ? 'gh-label-ok' : ''}">${w.state === 'active' ? 'פעיל' : w.state || ''}</span></li>`)}</ul>`, { empty: 'אין תהליכים.' }))}
        </aside>
      </div>
      <div id="gh-runs">${box('ריצות אחרונות של Actions', arr(d.runs).length || null, runs(d.runs, d.workflows))}</div>`;
  },
  actions: {
    jump(el, ctx, e) { e.preventDefault(); ctx.root.querySelector(el.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    approve(el, ctx) {
      const n = +el.dataset.n; const p = arr(ctx.data.pulls).find((x) => x.number === n) || {};
      ctx.act({ title: `לאשר את בקשת השינוי #${n}?`, what: `תישלח ב-GitHub הודעת "מאושר" (Approve) על "${p.title || n}". זה לא ממזג את השינוי לקוד.`, undo: 'כן. אפשר לבטל את האישור ב-GitHub (Dismiss review).', confirmLabel: 'כן, לאשר', path: '/api/cc/github/action', body: { kind: 'approve-pr', id: n }, okMsg: 'האישור נשלח.' });
    },
    close(el, ctx) {
      const n = +el.dataset.n; const p = arr(ctx.data.pulls).find((x) => x.number === n) || {};
      ctx.act({ title: `לסגור את בקשת השינוי #${n}?`, danger: true, what: `בקשת השינוי "${p.title || n}" תיסגר בלי להיכנס לקוד.`, undo: 'כן. אפשר לפתוח אותה מחדש ב-GitHub (Reopen), שום דבר לא נמחק.', confirmLabel: 'כן, לסגור', path: '/api/cc/github/action', body: { kind: 'close-pr', id: n }, okMsg: 'בקשת השינוי נסגרה.' });
    },
    run(el, ctx) {
      const k = el.dataset.k; const id = +el.dataset.id || el.dataset.id; const [title, what, undo, confirmLabel] = RUN_TXT[k];
      ctx.act({ title, what, undo, confirmLabel, danger: k === 'cancel', path: '/api/cc/github/action', body: { kind: k, id }, okMsg: 'הבקשה נשלחה ל-GitHub.' });
    },
  },
};
