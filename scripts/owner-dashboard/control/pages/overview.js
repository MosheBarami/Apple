import { html, num, pct, toFrac, isNum, ring, bars, lines, legend, light, ago, short, count, arr, extLink, shortDay, part } from '../ui.js';

const AI = 'var(--accent)'; const HU = 'var(--human)';

function share(ai) {
  const f = toFrac(ai.share);
  if (f != null) return f;
  if (isNum(ai.aiCommits) && ai.totalCommits > 0) return ai.aiCommits / ai.totalCommits;
  return null;
}

function hero(ai) {
  const f = share(ai);
  return html`<section class="card hero" aria-labelledby="h-ai">
    ${ring(f, { size: 200, stroke: 18, label: f == null ? '—' : pct(f), sub: 'נכתב ע״י AI' })}
    <div class="hero-t">
      <h2 id="h-ai" class="hero-h">${f == null ? 'אין עדיין מספיק נתונים' : html`${pct(f)} מהקוד נכתב ע״י AI`}</h2>
      <dl class="kv">
        <div><dt>קומיטים של AI</dt><dd>${num(ai.aiCommits)} <span class="faint">מתוך ${num(ai.totalCommits)}</span></dd></div>
        <div><dt>שורות שה-AI הוסיף</dt><dd>${num(ai.aiLinesAdded)} <span class="faint">מתוך ${num(ai.totalLinesAdded)}</span></dd></div>
      </dl>
      <p class="explain">החישוב מבוסס על סימוני הקומיטים בריפו (מי כתב כל שינוי). זו הערכה, לא מדידה מדויקת.</p>
    </div></section>`;
}

const SEV = [
  ['critical', 'קריטי', 'bad'], ['high', 'גבוה', 'warn'], ['medium', 'בינוני', 'mid'], ['low', 'נמוך', 'off'],
];
function findingsTile(f) {
  const open = f?.open || {};
  const state = open.critical > 0 ? 'bad' : open.high > 0 ? 'warn' : 'ok';
  const lbl = state === 'bad' ? 'יש ממצא קריטי פתוח' : state === 'warn' ? 'יש ממצאים חשובים פתוחים' : 'אין ממצאים חמורים פתוחים';
  const list = arr(f?.list).filter((x) => x.status !== 'closed');
  return html`<article class="card tile">
    <header class="tile-h"><h3>ממצאים פתוחים</h3>${light(state, lbl)}</header>
    <div class="sev">${SEV.map(([k, he, c]) => html`<div class="sev-i sev-${c} ${(open[k] ?? 0) === 0 ? 'zero' : ''}"><b>${num(open[k] ?? 0)}</b><span>${he}</span></div>`)}</div>
    <p class="explain">בעיות שהבדיקות האוטומטיות מצאו בקוד ועדיין לא תוקנו. נסגרו עד היום: ${num(f?.closed)}. הערכה בלבד: הבדיקות לא מוצאות הכל.</p>
    ${list.length ? html`<details><summary>לרשימת הממצאים (${num(list.length)})</summary><ul class="flist">
      ${list.slice(0, 30).map((x) => html`<li><span class="chip chip-${(SEV.find((s) => s[0] === x.severity) || [])[2] || 'off'}">${(SEV.find((s) => s[0] === x.severity) || [])[1] || x.severity}</span><span dir="auto">${x.title}</span> <bdi class="faint mono">${x.id}</bdi></li>`)}
    </ul></details>` : ''}
  </article>`;
}
function fastFixTile(ff) {
  const f = toFrac(ff?.share);
  const state = f == null ? 'off' : f <= 0.1 ? 'ok' : f <= 0.25 ? 'warn' : 'bad';
  const lbl = { ok: 'נמוך, טוב', warn: 'בינוני', bad: 'גבוה, כדאי לבדוק', off: 'אין נתון' }[state];
  return html`<article class="card tile">
    <header class="tile-h"><h3>תיקונים מהירים אחרי AI</h3>${light(state, lbl)}</header>
    <div class="tile-v"><b>${pct(f)}</b><span class="faint">${num(ff?.count)} מתוך ${num(ff?.of)} קומיטים</span></div>
    <p class="explain">כמה משינויי ה-AI קיבלו תיקון זמן קצר אחריהם, סימן שיצאו עם תקלה. פחות = טוב יותר. זה מדד עקיף (הערכה).</p>
  </article>`;
}
function revertsTile(r) {
  const n = isNum(r) ? r : isNum(r?.count) ? r.count : null;
  const state = n == null ? 'off' : n === 0 ? 'ok' : n <= 2 ? 'warn' : 'bad';
  const lbl = { ok: 'אין ביטולים', warn: 'מעט ביטולים', bad: 'הרבה ביטולים', off: 'אין נתון' }[state];
  return html`<article class="card tile">
    <header class="tile-h"><h3>שינויים שבוטלו</h3>${light(state, lbl)}</header>
    <div class="tile-v"><b>${num(n)}</b><span class="faint">ביטולים (revert)</span></div>
    <p class="explain">כמה פעמים שינוי בוטל לגמרי כי היה שגוי. פחות = טוב יותר. נספר לפי הודעות הקומיט, כך שזו הערכה.</p>
  </article>`;
}

function commitRow(c, decided) {
  const files = count(c.files);
  const v = c.verdict;
  return html`<li class="rv">
    <div class="rv-main">
      <div class="rv-t">${c.ai ? html`<span class="chip chip-ai">AI</span>` : ''}${extLink(c.url, c.title || '(ללא כותרת)', 'rv-title')}</div>
      <div class="rv-m">
        <bdi class="mono">${c.short || short(c.sha)}</bdi><span>${ago(c.date)}</span>${c.author ? html`<span>${c.author}</span>` : ''}
        <span class="ltr mono"><span class="add">+${num(c.additions ?? 0)}</span> <span class="del">−${num(c.deletions ?? 0)}</span></span>
        ${files != null ? html`<span title="${Array.isArray(c.files) ? c.files.join('\n') : ''}">${num(files)} קבצים</span>` : ''}
      </div></div>
    ${decided ? html`<span class="verdict ${v === 'approve' || v === 'approved' ? 'v-ok' : 'v-bad'}">${v === 'approve' || v === 'approved' ? '✓ אושר' : v === 'reject' || v === 'rejected' ? '✗ נדחה' : v}</span>${c.note ? html`<p class="rv-note" dir="auto">${c.note}</p>` : ''}`
    : html`<div class="rv-b">
        <button class="btn btn-ok" data-act="approve" data-sha="${c.sha}" aria-label="אישור: ${c.title}">✓ אשר</button>
        <button class="btn btn-danger-o" data-act="reject" data-sha="${c.sha}" aria-label="דחייה: ${c.title}">✗ דחה</button>
      </div>`}
  </li>`;
}

function review(r) {
  const pend = arr(r?.pending); const dec = arr(r?.decided);
  return html`<section class="card" aria-labelledby="h-rv">
    <h2 id="h-rv">מרכז אישורים <span class="ct">${num(r?.pendingTotal ?? pend.length)} ממתינים</span></h2>
    <p class="explain mb">שינויים שה-AI עשה ומחכים שתגידו אם הם בסדר. "אשר" רק רושם את ההחלטה. "דחה" אומר לסוכן לבטל את השינוי.</p>
    ${(r?.pendingTotal ?? 0) > pend.length ? html`<p class="explain mb">מוצגים ${num(pend.length)} השינויים האחרונים מתוך ${num(r.pendingTotal)}.</p>` : ''}
    ${pend.length ? html`<ul class="rvlist">${pend.map((c) => commitRow(c, false))}</ul>` : html`<p class="empty good">אין שינויים שמחכים לאישור. הכל נבדק.</p>`}
    ${dec.length ? html`<details><summary>החלטות אחרונות (${num(dec.length)})</summary><ul class="rvlist">${dec.slice(0, 40).map((c) => commitRow(c, true))}</ul></details>` : ''}
  </section>`;
}

function decide(el, ctx, verdict) {
  const sha = el.dataset.sha;
  const c = arr(ctx.data?.review?.pending).find((x) => x.sha === sha) || { sha };
  const name = `"${c.title || short(sha)}"`;
  return ctx.act(verdict === 'approve' ? {
    title: 'לאשר את השינוי?', confirmLabel: '✓ כן, לאשר',
    what: `השינוי ${name} יסומן כמאושר. הקוד עצמו לא משתנה.`,
    undo: 'כן. אישור הוא רק רישום של ההחלטה.',
    path: '/api/cc/review', body: { sha, verdict: 'approve' }, okMsg: 'השינוי אושר.',
  } : {
    title: 'לדחות את השינוי?', danger: true, reversible: false, confirmLabel: '✗ כן, לדחות',
    what: `השינוי ${name} יסומן כנדחה, והסוכן יבטל אותו (revert) בשינוי חדש.`,
    undo: 'הביטול משנה את הקוד בפועל. הגרסה הקודמת נשארת בהיסטוריה של GitHub, כך שאפשר לשחזר אותה אחר כך, אבל רק ידנית.',
    path: '/api/cc/review', body: { sha, verdict: 'reject' }, okMsg: 'השינוי נדחה. הסוכן יבטל אותו.',
  });
}

export default {
  id: 'overview', title: 'סקירת AI', nav: 'סקירת AI', icon: '◎', endpoint: '/api/cc/overview',
  sub: 'כמה מהעבודה עושה ה-AI, מה האיכות, ומה מחכה לאישור שלכם',
  render(d) {
    const ai = d.ai || {}; const q = d.quality || {};
    const keys = [{ key: 'ai', label: 'AI', color: AI }, { key: 'human', label: 'אנשים', color: HU }];
    return html`
      <div class="g g21">${part(d.ai, hero, { title: 'נתוני ה-AI לא זמינים' })}
        <section class="card" aria-labelledby="h-day"><h2 id="h-day">קומיטים ביום</h2>
          ${part(ai.perDay, (rows) => html`${bars(rows, keys, { x: (r) => r.day, xfmt: shortDay })}${legend(keys)}`, { empty: 'אין עדיין קומיטים בתקופה.' })}
        </section></div>
      <div class="g g21">
        <section class="card" aria-labelledby="h-wk"><h2 id="h-wk">שורות קוד בשבוע</h2>
          ${part(ai.perWeekLines, (rows) => html`${lines(rows, keys, { x: (r) => r.week, xfmt: shortDay })}${legend(keys)}`, { empty: 'אין עדיין נתונים שבועיים.' })}
        </section>
        <div class="col">${part(q, () => html`${findingsTile(q.findings)}<div class="g g2 flush">${fastFixTile(q.fastFix)}${revertsTile(q.reverts)}</div>`, { title: 'נתוני האיכות לא זמינים' })}</div>
      </div>
      ${part(d.review, review, { title: 'מרכז האישורים לא זמין', empty: 'מרכז האישורים יופיע כאן כשיהיו שינויים לבדוק.' })}`;
  },
  actions: {
    approve: (el, ctx) => decide(el, ctx, 'approve'),
    reject: (el, ctx) => decide(el, ctx, 'reject'),
  },
};
