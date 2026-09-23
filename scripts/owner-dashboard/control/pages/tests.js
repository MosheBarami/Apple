// The Apple Test Lab: one card per real gauntlet test of Apple (round × test), newest first.
// Index: the cards (final shot, model, test, date, length, steps, tools, errors, score, the arrow
// against the previous round of the same test), filters, and the progress chart per test.
// #/tests/<id>: the exact prompt, the run replayed with the site's own thinking/tool-call UI (dir=ltr,
// English, as the customer saw it) and a timeline scrubber, the shots with a lightbox, tools, errors,
// knowledge, what worked, the result against the reference, the criteria, cost and tokens.
// #/tests/<a>/vs/<b>: two runs side by side.
// Every field nothing recorded says "לא נרשם בריצה הזאת". Pin and export stay in this browser; the
// re-run button goes through the confirm path and the server only ever answers with a dry-run plan.
import { html, raw, num, compact, isNum, arr, duration, fullDate, esc } from '../ui.js';
import { icon } from '../logos.js';
import { stat, note, actBtn } from './kit.js';
import { morph, reduced } from '../fx.js';

const NR = 'לא נרשם בריצה הזאת';
const nr = (t = NR) => html`<span class="tl-nr">${t}</span>`;
const media = (p) => `/api/cc/media?p=${encodeURIComponent(p)}`;
const TESTS = { map: 'מבחן המפה', models: 'מבחן המודלים', ui: 'מבחן ה-UI', other: 'Grow a Garden' };
const TEST_COLOR = { map: 'var(--accent)', models: 'var(--warn)', ui: 'var(--good)', other: 'var(--muted)' };
const PIN_KEY = 'tl-pins';

// ------------------------------------------------------------------------------ state ---
const S = { q: '', test: 'all', model: 'all', pinned: false, sort: 'new', metric: 'selfScore', scrub: {}, timer: null, view: '' };
let D = null; // the last payload, for the replay timer
const pins = new Set((() => { try { return JSON.parse(localStorage.getItem(PIN_KEY) || '[]'); } catch { return []; } })());
const savePins = () => { try { localStorage.setItem(PIN_KEY, JSON.stringify([...pins])); } catch { /* private mode */ } };

function view() {
  const m = location.hash.match(/^#\/tests\/([\w-]+)(?:\/vs\/([\w-]+))?/);
  return m ? (m[2] ? { kind: 'diff', a: m[1], b: m[2] } : { kind: 'detail', id: m[1] }) : { kind: 'index' };
}

/** A card with its round and run joined in, plus the numbers every view shows. */
function join(d, card) {
  const round = arr(d.rounds).find((r) => r.round === card.round) || {};
  const run = round.run || null;
  const trace = arr(run?.trace);
  return {
    card, round, run, trace,
    model: run?.model || null,
    tools: run ? trace.length : null,
    errors: run ? trace.filter((t) => !t.ok).length : null,
    prompt: round.prompt || null,
    self: run?.critique ? run.critique.score : null,
  };
}
const all = (d) => arr(d.cards).map((c) => join(d, c));

// ---------------------------------------------------------------------------- pieces ---
const whenOf = (j) => (j.round.date ? html`<span title="${j.round.dateSource === 'worker' ? 'זמן תחילת הריצה, מה-worker' : 'הזמן שבו הראיה נכנסה לריפו (git). הריצה עצמה לא נשמרה ב-worker'}">${fullDate(j.round.date)}${j.round.dateSource === 'repo' ? ' · לפי הריפו' : ''}</span>` : nr());
const modelChip = (j) => (j.model ? html`<span class="chip chip-sm chip-ai">${j.model}</span>` : html`<span class="chip chip-sm" title="אין רישום ריצה. לפי הפרוטוקול ב-GAUNTLET.md הבדיקה רצה על Apple MAX">Apple MAX · לפי הפרוטוקול</span>`);
const msText = (ms) => (isNum(ms) ? duration(ms / 1000) : null);

/** The "ours" panel of a compare image: the left half of the owner's side-by-side, same box every round. */
const crop = (src, alt) => (src ? html`<span class="tl-crop"><img src="${media(src)}" alt="${alt}" loading="lazy" decoding="async"></span>` : html`<span class="tl-crop tl-crop--none">${nr('אין צילום לסבב הזה')}</span>`);

function deltaView(delta, { full = false } = {}) {
  if (!delta) return html`<p class="tl-delta tl-delta--none">הסבב הראשון של המבחן הזה, אין למה להשוות</p>`;
  const vs = `מול סבב ${delta.vsRound}`;
  if (!delta.items.length) return html`<p class="tl-delta tl-delta--none">${vs}: ${nr('אין מדד שנרשם בשני הסבבים')}</p>`;
  const dir = delta.better > delta.worse ? 'better' : delta.worse > delta.better ? 'worse' : 'same';
  const head = dir === 'better' ? `השתפר ${vs}` : dir === 'worse' ? `נחלש ${vs}` : `בלי שינוי ${vs}`;
  const arrow = dir === 'better' ? '▲' : dir === 'worse' ? '▼' : '●';
  const list = delta.items.map((i) => html`<li class="tl-dl tl-dl--${i.dir}"><span>${i.label}</span><b dir="ltr">${num(i.before)} → ${num(i.now)}</b></li>`);
  const tip = delta.items.map((i) => `${i.label}: ${i.before} → ${i.now} (${i.dir === 'better' ? 'טוב יותר' : i.dir === 'worse' ? 'גרוע יותר' : 'אותו דבר'})`).join('\n');
  return html`<div class="tl-delta tl-delta--${dir}" title="${tip}"><p><span class="tl-arrow" aria-hidden="true">${arrow}</span><b>${head}</b>
    <small>${delta.better} טובים יותר · ${delta.worse} גרועים יותר · ${delta.same} זהים</small></p>${full ? html`<ul class="tl-dls">${list}</ul>` : ''}</div>`;
}

const scoreLine = (j) => html`<p class="tl-score"><span>ציון מבחן הקושי</span>${nr('לא נרשם')}${isNum(j.self) ? html`<span class="chip chip-sm ${j.run.critique.passed ? 'chip-ok' : 'chip-bad'}" title="הציון ש-Apple נתן לעצמו בבדיקה החזותית (inspect_visually), מתוך 10. זה לא ציון מבחן הקושי">בדיקה עצמית ${j.self}/10</span>` : ''}</p>`;

function card(j) {
  const { card: c } = j; const pinned = pins.has(c.id);
  const meta = [
    j.run ? msText(j.run.durationMs) : null,
    j.run && isNum(j.run.steps) ? `${num(j.run.steps)} צעדים` : null,
    isNum(j.tools) ? `${num(j.tools)} כלים` : null,
  ].filter(Boolean);
  return html`<article class="card tl-card ${pinned ? 'is-pinned' : ''}" data-k="tl-${c.id}">
    <a class="tl-thumb" href="#/tests/${c.id}" aria-label="פתיחת סבב ${c.round}, ${TESTS[c.test]}">${crop(c.compare, `מה ש-Apple בנה בסבב ${c.round}`)}</a>
    <div class="tl-cb">
      <div class="tl-chips"><span class="chip chip-sm" style="--tc:${TEST_COLOR[c.test]}"><i class="tl-dot" aria-hidden="true"></i>${TESTS[c.test]}</span>${modelChip(j)}
        ${isNum(j.errors) ? html`<span class="chip chip-sm ${j.errors ? 'chip-bad' : 'chip-ok'}">${num(j.errors)} שגיאות</span>` : ''}</div>
      <h3><a href="#/tests/${c.id}">סבב ${c.round} · ${TESTS[c.test]}</a></h3>
      <p class="tl-meta">${whenOf(j)}${meta.length ? html` · ${meta.join(' · ')}` : html` · ${nr('אורך, צעדים וכלים לא נרשמו')}`}</p>
      ${scoreLine(j)}
      ${deltaView(c.delta)}
    </div>
    <button class="tl-pin" data-act="pin" data-id="${c.id}" aria-pressed="${pinned ? 'true' : 'false'}" title="${pinned ? 'להסיר מהנעוצים' : 'לנעוץ'}">${raw(PIN_SVG)}</button>
  </article>`;
}
const PIN_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>';

// ------------------------------------------------------------------- progress chart ---
const METRICS = {
  hardness: { label: 'ציון מבחן הקושי (%)', of: () => null, max: 100 },
  selfScore: { label: 'הבדיקה החזותית של Apple (%)', of: (j) => (isNum(j.self) ? j.self * 10 : null), max: 100 },
  opsApplied: { label: 'שינויים שהוחלו', of: (j) => j.run?.opsApplied ?? null },
  errors: { label: 'כלים שנכשלו', of: (j) => j.errors },
  minutes: { label: 'אורך הריצה (דקות)', of: (j) => (isNum(j.run?.durationMs) ? Math.round(j.run.durationMs / 6000) / 10 : null) },
};
function progress(js) {
  const m = METRICS[S.metric];
  const rounds = [...new Set(js.map((j) => j.card.round))].sort((a, b) => a - b);
  const tests = Object.keys(TESTS).filter((t) => js.some((j) => j.card.test === t));
  const pts = tests.map((t) => ({ t, p: rounds.map((r) => { const j = js.find((x) => x.card.test === t && x.card.round === r); const v = j ? m.of(j) : null; return isNum(v) ? { r, v, id: j.card.id } : null; }).filter(Boolean) }));
  const seg = html`<div class="seg" role="group" aria-label="מדד">${Object.entries(METRICS).map(([k, x]) => html`<button class="seg-b ${S.metric === k ? 'on' : ''}" data-act="metric" data-m="${k}" aria-pressed="${S.metric === k ? 'true' : 'false'}">${x.label}</button>`)}</div>`;
  const count = pts.reduce((s, x) => s + x.p.length, 0);
  let chart;
  if (!count) chart = html`<p class="empty tl-empty">${S.metric === 'hardness' ? 'ציון מבחן הקושי באחוזים לא נרשם באף סבב עד היום. ברגע שהבודק ירשום אותו (ראו למטה מה צריך לשנות), הקו יופיע כאן.' : `${m.label}: ${NR}, באף סבב.`}</p>`;
  else {
    const W = 640; const H = 220; const L = 44; const R = 16; const T = 14; const B = 28;
    const max = m.max || Math.ceil(Math.max(1, ...pts.flatMap((x) => x.p.map((p) => p.v))) * 1.1);
    const px = (r) => L + (rounds.length === 1 ? (W - L - R) / 2 : ((W - L - R) * rounds.indexOf(r)) / (rounds.length - 1));
    const py = (v) => T + (H - T - B) * (1 - v / max);
    let g = '';
    for (let i = 0; i <= 4; i++) { const y = T + ((H - T - B) * i) / 4; g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="grid"/><text x="${L - 6}" y="${y + 4}" class="axis" text-anchor="end">${esc(compact(max * (1 - i / 4)))}</text>`; }
    for (const r of rounds) g += `<text x="${px(r)}" y="${H - 8}" class="axis" text-anchor="middle">סבב ${r}</text>`;
    for (const { t, p } of pts) {
      const dx = (tests.indexOf(t) - (tests.length - 1) / 2) * 9; // same-round points of different tests side by side
      if (p.length > 1) g += `<polyline points="${p.map((q) => `${(px(q.r) + dx).toFixed(1)},${py(q.v).toFixed(1)}`).join(' ')}" fill="none" stroke="${TEST_COLOR[t]}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
      for (const q of p) g += `<a href="#/tests/${q.id}"><circle cx="${px(q.r) + dx}" cy="${py(q.v)}" r="4.5" fill="${TEST_COLOR[t]}"><title>${esc(`סבב ${q.r} · ${TESTS[t]} · ${m.label}: ${q.v}`)}</title></circle></a>`;
    }
    chart = html`<div class="chart" dir="ltr"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${m.label} לפי סבב">${raw(g)}</svg></div>
      <div class="legend">${pts.filter((x) => x.p.length).map((x) => html`<span><i style="background:${TEST_COLOR[x.t]}"></i>${TESTS[x.t]}</span>`)}</div>`;
  }
  return html`<section class="card tl-prog" aria-labelledby="h-prog"><h2 id="h-prog">ההתקדמות לפי סבב<small>נקודה רק איפה שמשהו באמת נרשם</small></h2>
    ${seg}${chart}
    <p class="explain">סבב אחד של Apple בונה את כל המבחנים בבת אחת, אז הבדיקה העצמית, השינויים והשגיאות הם של הריצה כולה ולא של מבחן אחד. לחיצה על נקודה פותחת את הסבב.</p></section>`;
}

// ------------------------------------------------------------------------------ index ---
function filtered(js) {
  const q = S.q.trim().toLowerCase();
  const out = js.filter((j) => (S.test === 'all' || j.card.test === S.test)
    && (S.model === 'all' || (j.model || 'Apple MAX') === S.model)
    && (!S.pinned || pins.has(j.card.id))
    && (!q || [TESTS[j.card.test], `סבב ${j.card.round}`, `round ${j.card.round}`, j.prompt, j.round.protocolPrompt, j.run?.reply, ...arr(j.round.findings).map((f) => `${f.id} ${f.text}`), ...j.trace.map((t) => `${t.tool} ${t.title} ${t.result || ''}`)]
      .filter(Boolean).join(' ').toLowerCase().includes(q)));
  if (S.sort === 'old') out.reverse();
  if (S.sort === 'errors') out.sort((a, b) => (b.errors ?? -1) - (a.errors ?? -1));
  return out.sort((a, b) => pins.has(b.card.id) - pins.has(a.card.id));
}

function index(d) {
  const js = all(d);
  const runs = arr(d.rounds).filter((r) => r.run);
  const usd = runs.reduce((s, r) => s + (r.run.usd || 0), 0);
  const credits = runs.reduce((s, r) => s + (r.run.credits || 0), 0);
  const last = js[0];
  const shown = filtered(js);
  const tbtn = (k, label) => html`<button class="seg-b ${S.test === k ? 'on' : ''}" data-act="ftest" data-t="${k}" aria-pressed="${S.test === k ? 'true' : 'false'}">${label}</button>`;
  return html`
    ${note('info', 'מה יש כאן, ומאיפה', 'כל כרטיס הוא בדיקה אמיתית אחת של Apple: סבב אחד של הגאנטלט ומבחן אחד בתוכו. התמונה, ההשוואה וההערות של הבודק באים מהריפו (docs/gauntlet). הפרומפט, הכלים, השגיאות, העלות והבדיקה העצמית באים מה-worker, רק מפרויקטים בשם "Gauntlet". מה שלא נרשם כתוב "לא נרשם בריצה הזאת", ושום מספר לא הומצא.')}
    ${d.worker?.ok === false ? note('warn', 'אין נתוני ריצה מה-worker כרגע', `${d.worker.reason || ''} הכרטיסים מוצגים רק ממה שיש בריפו.`) : ''}
    <section class="g g4" aria-label="מדדים">
      ${stat({ key: 'tl-n', label: 'בדיקות מתועדות', value: js.length, sub: `${num(arr(d.rounds).length)} סבבים · ${num(runs.length)} עם רישום ריצה מה-worker` })}
      ${stat({ key: 'tl-score', label: 'ציון מבחן הקושי', text: 'לא נרשם', sub: 'אף סבב לא נמדד באחוזים עדיין', tone: 'warn' })}
      ${stat({ key: 'tl-usd', label: 'עלות הריצות שנרשמו', value: usd, text: `$${num(usd, 2)}`, sub: `${num(credits)} קרדיטים · הערכה לפי neurons` })}
      ${stat({ key: 'tl-last', label: 'הבדיקה האחרונה', text: last ? `סבב ${last.card.round}` : '—', sub: last ? (last.card.delta?.items.length ? `${last.card.delta.better} מדדים השתפרו, ${last.card.delta.worse} נחלשו` : TESTS[last.card.test]) : '' })}
    </section>
    ${progress(js)}
    <div class="tl-filters card" role="search">
      <label class="tl-search">${icon('search', 15)}<input id="tl-q" type="search" placeholder="חיפוש בפרומפט, בכלים, בשגיאות ובממצאים" value="${S.q}" data-input="q" aria-label="חיפוש"></label>
      <div class="seg" role="group" aria-label="סוג מבחן">${tbtn('all', 'הכל')}${tbtn('map', 'מפה')}${tbtn('models', 'מודלים')}${tbtn('ui', 'UI')}${tbtn('other', 'אחר')}</div>
      <label class="tl-sel"><span>מודל</span><select id="tl-model" data-change="fmodel"><option value="all" ${S.model === 'all' ? 'selected' : ''}>הכל</option><option ${S.model === 'Apple MAX' ? 'selected' : ''}>Apple MAX</option><option ${S.model === 'Apple' ? 'selected' : ''}>Apple</option></select></label>
      <label class="tl-sel"><span>מיון</span><select id="tl-sort" data-change="fsort"><option value="new" ${S.sort === 'new' ? 'selected' : ''}>החדש קודם</option><option value="old" ${S.sort === 'old' ? 'selected' : ''}>הישן קודם</option><option value="errors" ${S.sort === 'errors' ? 'selected' : ''}>הכי הרבה שגיאות</option></select></label>
      <button class="btn btn-sm ${S.pinned ? 'btn-primary' : ''}" data-act="fpinned" aria-pressed="${S.pinned ? 'true' : 'false'}">${raw(PIN_SVG)}<span>רק נעוצים</span></button>
    </div>
    <p class="explain mb">${num(shown.length)} מתוך ${num(js.length)} בדיקות${pins.size ? ` · ${num(pins.size)} נעוצות (נשמר רק בדפדפן הזה)` : ''}</p>
    ${shown.length ? html`<div class="tl-grid">${shown.map(card)}</div>` : html`<p class="empty">שום בדיקה לא מתאימה לסינון הזה.</p>`}
    ${suggest()}`;
}

function suggest() {
  const rows = [
    ['ציון מבחן הקושי ב-% וציון לכל קריטריון', 'אין שדה כזה בשום מקום. scripts/gauntlet-verdict.mjs רושם רק מי ניצח. להוסיף לו ציון 0 עד 100 לכל קריטריון מ-GAUNTLET.md, נשמר ב-docs/gauntlet/verdicts.json.'],
    ['הטקסט של המחשבה', 'reasoning_content נזרק בספק (apps/worker/src/providers/workers-ai.ts). לשמור אותו, מקוצר, בהודעת ה-assistant.'],
    ['הפרמטרים של כל כלי', 'ToolTraceEntry (packages/shared/src/index.ts) לא כולל args. להוסיף שדה args מקוצר ולמלא אותו כשהכלי רץ (apps/worker/src/session.ts).'],
    ['הכישורים (skills) שנבחרו', 'agent.skillCardsShown נדרס בכל ריצה. לשמור אותו על הודעת ה-assistant, כמו deniedTools.'],
    ['המודל באירוע הבנייה', 'אירוע ה-build לא כולל productModel. להוסיף אותו ל-recordEvent ולרשימת השדות המותרים ב-analytics.ts.'],
    ['הצילומים ש-Apple צילם', 'render_view שומר רק מטא-דאטה, ו-inspect_visually שומר תמונה זעירה. לשמור את התמונות ב-R2 (MEDIA) ולרשום את המפתח ב-trace.'],
  ];
  return html`<details class="card tl-sug"><summary><b>מה חסר כדי שהריצות הבאות יירשמו במלואן</b><small>שינויים קטנים ב-worker, לא נפרסו</small></summary>
    <table class="tl-tbl"><thead><tr><th>שדה</th><th>מה צריך לשנות</th></tr></thead><tbody>${rows.map(([a, b]) => html`<tr><td>${a}</td><td dir="auto">${b}</td></tr>`)}</tbody></table></details>`;
}

// ---------------------------------------------------------- the site's replay (1:1) ---
const SV = (w, inner, cls = '') => raw(`<svg class="${cls}" viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`);
const KIND_ICON = {
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/>',
  search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
};
const KIND = { searching_knowledge: 'book', searching_assets: 'search', inspecting: 'search', reading_scripts: 'file', writing_luau: 'file', generating: 'image', rendering: 'image', playtesting: 'monitor' };
const CHEVRON = '<path d="m6 9 6 6 6-6"/>';
const CLOCK = '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>';
const XCIRCLE = '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>';
const DONE_MARK = (s) => raw(`<svg viewBox="0 0 16 16" width="${s}" height="${s}" fill="none" aria-hidden="true"><g class="picks-step__done"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.2" class="picks-step__ring"/><path d="M5.3 8.3l1.8 1.8 3.6-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" pathLength="1" class="picks-step__tick"/></g></svg>`);
const ACTIVE_MARK = raw('<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="currentColor" class="picks-step__halo"/><circle cx="8" cy="8" r="3" fill="currentColor" class="picks-step__dot"/></svg>');
const FAIL_MARK = raw(`<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">${XCIRCLE}</svg>`);

// The thinking glyph: a 3×3 lattice that orbits while working and settles into a mark.
const ORBIT = [0, 1, 2, 7, null, 3, 6, 5, 4];
const MARKS = { done: [2, 3, 5, 7], failed: [0, 2, 4, 6, 8], stopped: [0, 3, 6, 2, 5, 8] };
function lattice(state) {
  const run = ORBIT.map((o) => (o == null ? '<i class="picks-lattice__cell" data-hole></i>' : `<i class="picks-lattice__cell" style="animation-delay:${o * 108}ms"></i>`)).join('');
  const on = MARKS[state] || [];
  const mark = ORBIT.map((_, i) => `<i class="picks-lattice__cell" ${on.includes(i) ? 'data-on' : ''}></i>`).join('');
  return raw(`<span class="picks-lattice picks-lattice--${state}" aria-hidden="true"><span class="picks-lattice__layer picks-lattice__run">${run}</span><span class="picks-lattice__layer picks-lattice__mark">${mark}</span></span>`);
}
// formatSeconds / formatElapsed, as the workspace prints them.
const secs = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`; };
const elapsed = (ms) => (ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : ms < 60_000 ? `${Math.round(ms / 1000)}s` : secs(ms));

function stepRow(t, state, k) {
  const badge = state === 'active' ? 'input-available' : t.ok ? 'output-available' : 'output-error';
  const status = badge === 'output-available' ? DONE_MARK(12) : SV(12, badge === 'input-available' ? CLOCK : XCIRCLE);
  const facts = [
    t.target ? html`<dt>On</dt><dd class="apple-reasoning__target">${t.target}</dd>` : '',
    t.result ? html`<dt>Result</dt><dd class="${t.ok ? '' : 'apple-step__err'}">${t.result}</dd>` : '',
    isNum(t.ms) && t.ms > 0 ? html`<dt>Time</dt><dd>${elapsed(t.ms)}</dd>` : '',
    html`<dt>Input</dt><dd class="tl-nr" dir="rtl">${NR}</dd>`,
  ];
  const mark = state === 'active' ? ACTIVE_MARK : t.ok ? DONE_MARK(16) : FAIL_MARK;
  return html`<div class="ai-chain-of-thought__step ai-chain-of-thought__step--${state === 'active' ? 'active' : 'complete'} apple-step ${t.ok ? '' : 'apple-step--failed'}" data-k="${k}">
    <div class="ai-chain-of-thought__rail"><span class="picks-step picks-step--${state === 'active' ? 'active' : t.ok ? 'complete' : 'failed'}">${mark}</span><span class="ai-chain-of-thought__line"></span></div>
    <div class="ai-chain-of-thought__body"><details class="ai-tool">
      <summary class="ai-tool__header"><span class="ai-tool__heading">${SV(16, KIND_ICON[KIND[t.kind] || 'wrench'], 'ai-tool__icon')}<span class="ai-tool__title ${state === 'active' ? 'is-running' : ''}">${state === 'active' ? t.running : t.title}</span>
        <span class="ai-tool__badge ai-tool__badge--${badge}"><span class="ai-tool__state">${status}</span>${badge === 'output-error' ? 'Error' : badge === 'input-available' ? 'Running' : 'Done'}</span></span>${SV(14, CHEVRON, 'ai-tool__chevron')}</summary>
      <div class="ai-tool__content apple-step__body"><dl class="apple-step__facts">${facts}</dl></div>
    </details></div></div>`;
}

/** The run as the workspace drew it, cut at step `at` of the trace. */
function replay(j, at) {
  const t = j.trace; const n = t.length; const live = at < n - 1;
  const rows = t.slice(0, at + 1);
  const recent = rows.slice(-3); const earlier = rows.slice(0, -3);
  const upTo = rows.reduce((s, x) => s + (x.ms || 0), 0);
  const settled = j.run.durationMs ?? upTo;
  const finalState = j.run.error ? 'failed' : 'done';
  const summary = live
    ? html`<span class="apple-reasoning__summary ai-elements-shimmer">${rows.at(-1)?.running || 'Working'}</span>`
    : html`<span class="apple-reasoning__summary apple-reasoning__settle">Thought for ${secs(settled)}</span>`;
  const hist = earlier.length ? html`<details class="apple-reasoning__history"><summary class="ai-chain-of-thought__header">${earlier.length} earlier steps${SV(14, CHEVRON, 'ai-tool__chevron')}</summary>
    <div class="ai-chain-of-thought apple-reasoning__chain">${earlier.map((x, i) => stepRow(x, 'complete', `s${i}`))}</div></details>` : '';
  return html`<div class="tl-user" dir="auto">${j.prompt || j.round.protocolPrompt || ''}</div>
    <div class="apple-reasoning">
      <div class="apple-reasoning__head"><span class="apple-reasoning__trigger" aria-expanded="true">${lattice(live ? 'working' : finalState)}${summary}${live ? html`<span class="apple-reasoning__time">${elapsed(upTo)}</span>` : ''}${SV(14, CHEVRON, 'apple-reasoning__chev')}</span>
        ${isNum(j.run.credits) ? html`<span class="apple-reasoning__cost">${j.run.credits} credits</span>` : ''}</div>
      <div class="apple-reasoning__details">
        <p class="apple-reasoning__note">The model's own thinking text was not saved for this run, so only its steps are shown.</p>
        ${hist}
        <div class="ai-chain-of-thought apple-reasoning__chain">${recent.map((x, i) => stepRow(x, live && i === recent.length - 1 ? 'active' : 'complete', `s${earlier.length + i}`))}</div>
      </div>
    </div>
    ${!live && j.run.reply ? html`<div class="tl-reply" dir="auto">${j.run.reply}</div>` : ''}`;
}

// ----------------------------------------------------------------------------- detail ---
const factList = (rows) => html`<dl class="tl-facts">${rows.map(([k, v]) => html`<dt>${k}</dt><dd>${v ?? nr()}</dd>`)}</dl>`;
const listOr = (items, fn, empty = NR) => (items.length ? html`<ul class="tl-list">${items.map(fn)}</ul>` : html`<p class="tl-nr-p">${empty}</p>`);
function toolCounts(trace) {
  const m = new Map();
  for (const t of trace) { const x = m.get(t.tool) || { tool: t.tool, title: t.title, n: 0, fail: 0, ms: 0 }; x.n++; if (!t.ok) x.fail++; x.ms += t.ms || 0; m.set(t.tool, x); }
  return [...m.values()].sort((a, b) => b.n - a.n);
}
function shotsOf(j) {
  const r = j.round; const c = j.card;
  const out = [];
  if (c.compare) out.push({ src: media(c.compare), label: `השוואה של הבודק · סבב ${c.round} · ${TESTS[c.test]}`, by: 'הבודק' });
  for (const p of arr(r.shots)) out.push({ src: media(p), label: p.split('/').pop(), by: /apple-max-run1/.test(p) ? 'צילום Studio של התוצאה' : 'צילום Studio של הבודק' });
  for (const s of arr(j.run?.appleShots)) out.push({ src: s.src, label: s.label, by: 'Apple צילם בעצמו' });
  return out;
}

function detail(d, id) {
  const js = all(d); const j = js.find((x) => x.card.id === id);
  if (!j) return html`<p><a href="#/tests" class="btn btn-sm">→ כל הבדיקות</a></p>${note('warn', 'הבדיקה הזו לא נמצאה', `אין כרטיס בשם ${id}.`)}`;
  const { card: c, round: r, run } = j; const t = j.trace;
  const at = Math.min(S.scrub[id] ?? t.length - 1, Math.max(0, t.length - 1));
  const test = d.tests?.[c.test] || {};
  const fails = t.filter((x) => !x.ok);
  const counts = toolCounts(t);
  const shots = shotsOf(j);
  const others = js.filter((x) => x.card.id !== id);
  const spec = { id: `tests-rerun-${id}`, path: '/api/cc/tests/action', body: { op: 'rerun', id }, platform: 'apple', title: `להריץ שוב את סבב ${c.round} עם אותו פרומפט`,
    what: 'השרת יחזיר את הקריאה המדויקת שמפעילה ריצה אמיתית של Apple עם אותו פרומפט, ולא ישלח אותה. ריצה אמיתית עולה קרדיטים וצריכה Studio מחובר עם Baseplate ריק.',
    undo: 'אין מה לבטל: שום דבר לא נשלח ושום ריצה לא מתחילה.', confirmLabel: 'להציג את הקריאה' };
  const worked = [
    ...(isNum(run?.opsApplied) ? [`${num(run.opsApplied)} שינויים הוחלו במשחק`] : []),
    ...counts.filter((x) => x.n - x.fail > 0).slice(0, 6).map((x) => `${x.title} · ${num(x.n - x.fail)} הצליחו`),
    ...(run?.critique?.passed ? ['הבדיקה החזותית עברה'] : []),
    ...arr(r.findings).filter((f) => f.status === 'closed').map((f) => `${f.id} נסגר: ${f.text}`),
  ];
  const didnt = [
    ...(run?.stopReason && run.stopReason !== 'done' ? [`הריצה נעצרה: ${run.stopReason}`] : []),
    ...arr(run?.critique?.defects).map((x) => `${x.dimension || 'ויזואלי'} (${x.severity || '—'}): ${x.observed || ''}`),
    ...arr(r.findings).filter((f) => f.status !== 'closed').map((f) => `${f.id} [${f.severity}]: ${f.text}`),
  ];
  const u = run?.usage;
  return html`
    <p class="tl-back"><a href="#/tests" class="btn btn-sm btn-ghost">→ כל הבדיקות</a></p>
    <header class="card tl-head" data-k="tl-head-${id}">
      <div><p class="eyebrow">סבב ${c.round} · ${TESTS[c.test]}${c.test === 'other' ? ' (ארכיון)' : ''}</p><h2>${run?.projectName || `סבב ${c.round}`}</h2>
        <div class="tl-chips">${modelChip(j)}${run?.mode ? html`<span class="chip chip-sm">${run.mode}</span>` : ''}${run?.runId ? html`<span class="chip chip-sm mono" title="מזהה הריצה">${String(run.runId).slice(0, 8)}</span>` : ''}<span class="chip chip-sm">${whenOf(j)}</span></div></div>
      <div class="tl-acts">
        <button class="btn btn-sm" data-act="pin" data-id="${id}" aria-pressed="${pins.has(id) ? 'true' : 'false'}">${raw(PIN_SVG)}<span>${pins.has(id) ? 'נעוץ' : 'לנעוץ'}</span></button>
        <button class="btn btn-sm" data-act="export" data-id="${id}">${icon('ext', 14)}<span>ייצוא דוח</span></button>
        ${actBtn(spec, 'הרצה חוזרת (תכנון בלבד)', { ic: 'play' })}
        <label class="tl-sel"><span>השוואה ל-</span><select id="tl-diff" data-change="diff" data-id="${id}"><option value="">בחירה…</option>${others.map((x) => html`<option value="${x.card.id}">סבב ${x.card.round} · ${TESTS[x.card.test]}</option>`)}</select></label>
      </div>
    </header>

    <section class="card" aria-labelledby="h-prompt"><h2 id="h-prompt">הפרומפט המדויק<small>${j.prompt ? 'כפי שנשלח, מתוך ההודעה השמורה' : 'לא נרשם בריצה הזאת. זה הפרומפט מהפרוטוקול'}</small></h2>
      <pre class="tl-prompt" dir="ltr">${j.prompt || r.protocolPrompt || NR}</pre>
      <p><button class="btn btn-sm" data-act="copy" data-id="${id}">${icon('check', 14)}<span>העתקה</span></button></p></section>

    <section class="g g4" aria-label="מדדים">
      ${stat({ key: `tl-d-${id}`, label: 'אורך הריצה', text: msText(run?.durationMs) || 'לא נרשם', sub: run?.finishReason ? `סיבת הסיום: ${run.finishReason}` : '' })}
      ${stat({ key: `tl-s-${id}`, label: 'קריאות לכלים', value: run ? t.length : null, text: run ? num(t.length) : 'לא נרשם', sub: run ? `${num(run.steps)} צעדי מודל · ${num(counts.length)} כלים שונים` : '' })}
      ${stat({ key: `tl-e-${id}`, label: 'כלים שנכשלו', value: run ? fails.length : null, text: run ? num(fails.length) : 'לא נרשם', sub: run ? `${num(run.opsApplied)} שינויים הוחלו · ${num(run.opsFailed)} נכשלו` : '', tone: run ? (fails.length ? 'bad' : 'good') : '' })}
      ${stat({ key: `tl-c-${id}`, label: 'עלות', text: isNum(run?.usd) ? `$${num(run.usd, 3)}` : 'לא נרשם', sub: run ? `${num(run.credits)} קרדיטים · ${compact(run.neurons)} neurons` : '' })}
    </section>

    <section class="card" aria-labelledby="h-vs"><h2 id="h-vs">התוצאה מול המשחק האמיתי<small>הצילום הסופי של Apple, חתוך מתמונת ההשוואה של הבודק, מול תמונות הייחוס של המשחק האמיתי</small></h2>
      <div class="tl-vs"><figure>${crop(c.compare, 'מה ש-Apple בנה')}<figcaption>Apple · סבב ${c.round}</figcaption></figure>
        <div class="tl-refs">${arr(test.refs).slice(0, 4).map((p) => html`<button class="tl-ref" data-act="shot" data-src="${media(p)}" data-label="${p.split('/').pop()}"><img src="${media(p)}" alt="תמונת ייחוס" loading="lazy"></button>`)}</div></div>
      ${c.compare ? html`<details class="tl-full"><summary>תמונת ההשוואה המלאה, עם ההערות של הבודק</summary><button class="tl-ref" data-act="shot" data-src="${media(c.compare)}" data-label="השוואה מלאה"><img src="${media(c.compare)}" alt="השוואה מלאה" loading="lazy"></button></details>` : ''}
      ${deltaView(c.delta, { full: true })}</section>

    <section class="card tl-replay-card" aria-labelledby="h-rep"><h2 id="h-rep">הריצה, כמו שהיא נראתה באתר<small>אותו רכיב חשיבה וכלים של סביבת העבודה</small></h2>
      ${run && t.length ? html`
        <div class="tl-scrub"><button class="btn btn-sm" data-act="play" data-id="${id}" aria-pressed="${S.timer ? 'true' : 'false'}">${icon(S.timer ? 'pause' : 'play', 14)}<span>${S.timer ? 'עצירה' : 'ניגון'}</span></button>
          <input id="tl-range" type="range" min="0" max="${t.length - 1}" value="${at}" data-input="scrub" data-id="${id}" aria-label="ציר הזמן של הריצה">
          <span class="tl-at mono" id="tl-at">${at + 1}/${t.length}</span></div>
        <div class="tl-site" dir="ltr" lang="en" id="tl-replay">${replay(j, at)}</div>
        <p class="explain">המחשבה עצמה (הטקסט שהמודל חשב) ${NR}: הספק זורק אותה לפני שהיא נשמרת. גם הפרמטרים של כל כלי לא נשמרו. מה שמופיע הוא מה שנשמר: שם הכלי, על מה הוא רץ, מה חזר, והזמן. באתר צעד שנכשל מוצג רק כשהכישלון סופי; כאן כל כישלון מוצג באדום.</p>` : html`<p class="tl-nr-p">${NR}: אין רישום של הריצה הזו ב-worker (הסבבים הראשונים רצו לפני שהריצות נשמרו). מה שנשאר הוא הצילומים וההערות של הבודק.</p>`}
    </section>

    <div class="g g2">
      <section class="card" aria-labelledby="h-plan"><h2 id="h-plan">התוכנית ש-Apple כתב</h2>
        ${run?.plan ? html`<p class="tl-plan-t" dir="auto">${run.plan.title}</p><ol class="tl-plan" dir="ltr">${run.plan.steps.map((s) => html`<li><b>${s.title}</b>${s.detail ? html`<span>${s.detail}</span>` : ''}${s.tool ? html`<code>${s.tool}</code>` : ''}</li>`)}</ol>` : nr()}</section>
      <section class="card" aria-labelledby="h-tools"><h2 id="h-tools">הכלים שהופעלו<small>${num(t.length)} קריאות · ${num(counts.length)} כלים שונים</small></h2>
        ${counts.length ? html`<table class="tl-tbl"><thead><tr><th>כלי</th><th>פעמים</th><th>נכשל</th><th>זמן</th></tr></thead><tbody>${counts.map((x) => html`<tr><td dir="ltr"><b>${x.title}</b> <code>${x.tool}</code></td><td>${num(x.n)}</td><td class="${x.fail ? 'bad' : ''}">${num(x.fail)}</td><td>${x.ms ? elapsed(x.ms) : '—'}</td></tr>`)}</tbody></table>` : nr()}</section>
    </div>

    <section class="card" aria-labelledby="h-err"><h2 id="h-err">שגיאות<small>כלים שנכשלו, שגיאות בבדיקת המשחק, בעיות שהבדיקה מצאה, קריאות למודל שנכשלו</small></h2>
      ${!run ? nr() : html`
        ${listOr(fails, (x) => html`<li class="tl-err" dir="ltr"><b>${x.title}</b>${x.target ? html` · <code>${x.target}</code>` : ''}<span>${x.result || 'no reason reported'}</span></li>`, 'שום כלי לא נכשל.')}
        ${run.play ? html`<h3>בדיקת המשחק (play_check): <code>${run.play.verdict}</code></h3>${listOr([...run.play.clientErrors.map((e) => ['client', e]), ...run.play.serverErrors.map((e) => ['server', e])], ([k, e]) => html`<li class="tl-err" dir="ltr"><b>${k}</b><span>${e}</span></li>`, 'בלי שגיאות.')}
          ${run.play.playerSees ? html`<p class="explain" dir="ltr">${run.play.playerSees}</p>` : ''}` : ''}
        ${run.audit?.defects.length ? html`<h3>${run.audit.callout?.title || 'בדיקת הבנייה (audit_build)'}</h3>${listOr(run.audit.defects, (x) => html`<li class="tl-err" dir="ltr"><b>${x.severity} · ${x.subject}</b><span>${x.measured} → ${x.fix}</span></li>`)}` : ''}
        ${u?.failed ? html`<p class="tl-err-p">${num(u.failed)} קריאות למודל נכשלו${u.errorKinds.length ? `: ${u.errorKinds.join(', ')}` : ''}</p>` : ''}
        ${run.error ? html`<p class="tl-err-p" dir="auto">${run.error}</p>` : ''}`}</section>

    <div class="g g2">
      <section class="card" aria-labelledby="h-know"><h2 id="h-know">ממה Apple למד<small>ידע, ערכות ומודולים שהוא שלף בריצה</small></h2>
        ${run ? listOr(run.knowledge, (x) => html`<li dir="ltr"><b>${x.title}</b> <code>${x.tool}</code>${x.what ? html`<span>${x.what}</span>` : ''}</li>`, 'לא נשלף שום ידע בריצה הזאת.') : nr()}
        <h3>מסמכים (RAG)</h3>${run ? listOr(run.docs, (x) => html`<li dir="ltr">${x.url ? html`<a href="${x.url}" target="_blank" rel="noopener noreferrer">${x.title || x.url}</a>` : x.title}${x.citation ? html` <code>${x.citation}</code>` : ''}</li>`, 'Apple לא חיפש במסמכים (search_docs) בריצה הזאת.') : nr()}
        <h3>כישורים (skills)</h3><p class="tl-nr-p">${NR}: ה-worker שומר את הכישורים שבחר רק עד הריצה הבאה.</p></section>
      <section class="card" aria-labelledby="h-work"><h2 id="h-work">מה עבד ומה לא</h2>
        <h3 class="good">עבד</h3>${listOr(worked, (x) => html`<li dir="auto">${x}</li>`)}
        <h3 class="bad">לא עבד</h3>${listOr(didnt, (x) => html`<li dir="auto">${x}</li>`)}
        ${run?.critique ? html`<h3>הבדיקה העצמית של Apple · ${run.critique.score}/10</h3><p class="explain" dir="ltr">${run.critique.summary}</p>` : ''}</section>
    </div>

    <section class="card" aria-labelledby="h-shots"><h2 id="h-shots">הצילומים<small>${num(shots.length)} · לחיצה מגדילה</small></h2>
      ${shots.length ? html`<div class="tl-strip">${shots.map((s) => html`<button class="tl-shot" data-act="shot" data-src="${s.src}" data-label="${s.by} · ${s.label}"><img src="${s.src}" alt="${s.label}" loading="lazy"><span>${s.by}</span></button>`)}</div>` : nr()}
      ${run && !run.appleShots.length ? html`<p class="explain">הצילומים ש-Apple צילם בעצמו בריצה (render_view) ${NR}: נשמרו רק הנתונים עליהם, בלי התמונה.</p>` : ''}</section>

    <div class="g g2">
      <section class="card" aria-labelledby="h-crit"><h2 id="h-crit">ציון לכל קריטריון<small>"מה נחשב זהה" לפי GAUNTLET.md</small></h2>
        <table class="tl-tbl"><thead><tr><th>קריטריון</th><th>ציון</th><th>שינוי</th></tr></thead><tbody>${arr(test.criteria).map((x) => html`<tr><td dir="ltr">${x}</td><td>${nr('לא נרשם')}</td><td>—</td></tr>`)}</tbody></table>
        <p class="explain">הבודק כתב את ההבדלים שהוא רואה בתחתית תמונת ההשוואה, אבל בלי ציון. ציון מבחן הקושי הכולל: ${NR}.</p></section>
      <section class="card" aria-labelledby="h-cost"><h2 id="h-cost">עלות וטוקנים</h2>
        ${run ? factList([
          ['קרדיטים שנוכו', isNum(run.credits) ? num(run.credits) : null],
          ['neurons', isNum(run.neurons) ? num(run.neurons) : null],
          ['עלות משוערת', isNum(run.usd) ? `$${num(run.usd, 4)} (לפי $0.011 ל-1,000 neurons)` : null],
          ['קריאות למודל', u ? `${num(u.calls)}${u.failed ? `, ${num(u.failed)} נכשלו` : ''}` : null],
          ['טוקנים נכנסים', u ? `${compact(u.inputTokens)}${u.cachedInputTokens ? ` (${compact(u.cachedInputTokens)} מהמטמון)` : ''}` : null],
          ['טוקנים יוצאים', u ? compact(u.outputTokens) : null],
          ['זמן המתנה למודל', u ? `${msText(u.latencyMs)} סך הכל · ${num(Math.round(u.latencyMs / Math.max(1, u.calls)))} ms בממוצע` : null],
          ['מודל', u?.models.length ? html`<bdi class="mono">${u.models.join(', ')}</bdi>` : null],
          ['הקשר', run.context ? `${compact(run.context.usedChars)} מתוך ${compact(run.context.maxChars)} תווים${run.context.droppedGroups ? ` · ${num(run.context.droppedGroups)} קבוצות נזרקו` : ''}` : null],
        ]) : nr()}</section>
    </div>`;
}

// ------------------------------------------------------------------------------- diff ---
function diffView(d, a, b) {
  const js = all(d); const A = js.find((x) => x.card.id === a); const B = js.find((x) => x.card.id === b);
  if (!A || !B) return html`<p><a href="#/tests" class="btn btn-sm">→ כל הבדיקות</a></p>${note('warn', 'אחת הבדיקות לא נמצאה', `${a} / ${b}`)}`;
  const rows = [
    ['מודל', (j) => j.model || 'Apple MAX · לפי הפרוטוקול'],
    ['תאריך', (j) => (j.round.date ? fullDate(j.round.date) : null)],
    ['אורך', (j) => msText(j.run?.durationMs)],
    ['צעדים', (j) => (isNum(j.run?.steps) ? num(j.run.steps) : null)],
    ['קריאות לכלים', (j) => (isNum(j.tools) ? num(j.tools) : null)],
    ['כלים שנכשלו', (j) => (isNum(j.errors) ? num(j.errors) : null)],
    ['שינויים שהוחלו / נכשלו', (j) => (j.run ? `${num(j.run.opsApplied)} / ${num(j.run.opsFailed)}` : null)],
    ['בדיקה עצמית', (j) => (isNum(j.self) ? `${j.self}/10` : null)],
    ['שגיאות בבדיקת המשחק', (j) => (j.run?.play ? num(j.run.play.clientErrors.length + j.run.play.serverErrors.length) : null)],
    ['קרדיטים', (j) => (isNum(j.run?.credits) ? num(j.run.credits) : null)],
    ['עלות', (j) => (isNum(j.run?.usd) ? `$${num(j.run.usd, 3)}` : null)],
    ['ציון מבחן הקושי', () => null],
  ];
  const tools = [...new Set([...A.trace, ...B.trace].map((t) => t.tool))];
  const cnt = (j, tool) => j.trace.filter((t) => t.tool === tool).length;
  const title = (tool) => [...A.trace, ...B.trace].find((t) => t.tool === tool)?.title || tool;
  const head = (j) => html`<a href="#/tests/${j.card.id}">סבב ${j.card.round} · ${TESTS[j.card.test]}</a>`;
  return html`<p class="tl-back"><a href="#/tests" class="btn btn-sm btn-ghost">→ כל הבדיקות</a></p>
    <section class="card" aria-labelledby="h-diff"><h2 id="h-diff">השוואה בין שתי ריצות</h2>
      <div class="tl-vs2">${[A, B].map((j) => html`<figure>${crop(j.card.compare, '')}<figcaption>${head(j)}</figcaption></figure>`)}</div>
      <table class="tl-tbl"><thead><tr><th></th><th>${head(A)}</th><th>${head(B)}</th></tr></thead>
        <tbody>${rows.map(([k, f]) => html`<tr><td>${k}</td><td>${f(A) ?? nr('לא נרשם')}</td><td>${f(B) ?? nr('לא נרשם')}</td></tr>`)}</tbody></table></section>
    <section class="card" aria-labelledby="h-difft"><h2 id="h-difft">הכלים, זה מול זה</h2>
      ${tools.length ? html`<table class="tl-tbl"><thead><tr><th>כלי</th><th>${head(A)}</th><th>${head(B)}</th></tr></thead><tbody>${tools.map((x) => html`<tr><td dir="ltr">${title(x)} <code>${x}</code></td><td>${num(cnt(A, x))}</td><td>${num(cnt(B, x))}</td></tr>`)}</tbody></table>` : nr()}</section>`;
}

// ----------------------------------------------------------------------------- export ---
function report(d, id) {
  const j = all(d).find((x) => x.card.id === id); if (!j) return '';
  const { card: c, round: r, run } = j; const L = [];
  const v = (x) => (x == null || x === '' ? NR : x);
  L.push(`# מעבדת בדיקות · סבב ${c.round} · ${TESTS[c.test]}`, '', `- מודל: ${v(j.model)}`, `- תאריך: ${v(r.date)} (${r.dateSource === 'worker' ? 'worker' : 'ריפו'})`,
    `- אורך: ${v(msText(run?.durationMs))}`, `- צעדים: ${v(run?.steps)}`, `- קריאות לכלים: ${v(j.tools)}`, `- כלים שנכשלו: ${v(j.errors)}`,
    `- בדיקה עצמית: ${isNum(j.self) ? `${j.self}/10` : NR}`, `- ציון מבחן הקושי: ${NR}`, `- קרדיטים: ${v(run?.credits)}`, `- עלות משוערת: ${isNum(run?.usd) ? `$${run.usd.toFixed(4)}` : NR}`, '',
    '## הפרומפט', '', '```', j.prompt || r.protocolPrompt || NR, '```', '');
  if (c.delta?.items.length) { L.push(`## מול סבב ${c.delta.vsRound}`, ''); for (const i of c.delta.items) L.push(`- ${i.label}: ${i.before} → ${i.now} (${i.dir})`); L.push(''); }
  L.push('## הכלים', '');
  for (const t of j.trace) L.push(`- ${t.ok ? '✓' : '✗'} ${t.title} (\`${t.tool}\`)${t.target ? ` · ${t.target}` : ''}${t.result ? ` — ${t.result}` : ''}`);
  if (!j.trace.length) L.push(NR);
  L.push('', '## ממצאים', '', ...(arr(r.findings).length ? r.findings.map((f) => `- [${f.status}][${f.severity}] ${f.id}: ${f.text}`) : ['אין']), '');
  if (run?.reply) L.push('## התשובה האחרונה של Apple', '', run.reply, '');
  if (c.compare) L.push('## ראיה', '', `- ${c.compare}`, ...arr(r.shots).map((p) => `- ${p}`), '');
  return L.join('\n');
}

// ----------------------------------------------------------------------- the replay timer ---
function stopPlay() { if (S.timer) { clearInterval(S.timer); S.timer = null; } }
function drawReplay(root, id) {
  const j = D && all(D).find((x) => x.card.id === id); const host = root.querySelector('#tl-replay'); if (!j || !host) return;
  const at = S.scrub[id] ?? j.trace.length - 1;
  morph(host, replay(j, at).s);
  const range = root.querySelector('#tl-range'); if (range && document.activeElement !== range) range.value = String(at);
  const lab = root.querySelector('#tl-at'); if (lab) lab.textContent = `${at + 1}/${j.trace.length}`;
}
function lightbox(src, label) {
  let dlg = document.getElementById('tl-lb');
  if (!dlg) {
    dlg = document.createElement('dialog'); dlg.id = 'tl-lb'; dlg.className = 'tl-lb'; dlg.setAttribute('aria-label', 'צילום בגודל מלא');
    dlg.addEventListener('click', () => dlg.close());
    document.body.append(dlg);
  }
  dlg.innerHTML = html`<figure><img src="${src}" alt="${label}"><figcaption>${label} · לחיצה או Esc לסגירה</figcaption></figure>`.s;
  dlg.showModal();
}

export default {
  id: 'tests', title: 'מעבדת בדיקות', nav: 'מעבדת בדיקות', glyph: 'flask', needs: ['tests'],
  sub: 'כל בדיקה אמיתית של Apple: מה ביקשו, מה הוא עשה, איפה נכשל, ואיך זה נראה מול המקור',
  links: () => [],
  render(d) {
    const t = d.tests || {};
    if (t.ok === false) return note('bad', 'לא הצלחנו לקרוא את הבדיקות', t.reason || '');
    D = t;
    const v = view();
    return v.kind === 'detail' ? detail(t, v.id) : v.kind === 'diff' ? diffView(t, v.a, v.b) : index(t);
  },
  after(root) {
    const v = view(); const key = JSON.stringify(v);
    if (v.kind !== 'detail') stopPlay();
    if (S.view && S.view !== key) requestAnimationFrame(() => window.scrollTo(0, 0));
    S.view = key;
  },
  unmount() { stopPlay(); S.view = ''; document.getElementById('tl-lb')?.remove(); },
  actions: {
    pin(el, ctx) { const id = el.dataset.id; if (pins.has(id)) pins.delete(id); else pins.add(id); savePins(); ctx.rerender(); },
    metric(el, ctx) { S.metric = el.dataset.m; ctx.rerender(); },
    ftest(el, ctx) { S.test = el.dataset.t; ctx.rerender(); },
    fmodel(el, ctx) { S.model = el.value; ctx.rerender(); },
    fsort(el, ctx) { S.sort = el.value; ctx.rerender(); },
    fpinned(el, ctx) { S.pinned = !S.pinned; ctx.rerender(); },
    q(el, ctx) { S.q = el.value; ctx.rerender(); },
    diff(el) { if (el.value) location.hash = `#/tests/${el.dataset.id}/vs/${el.value}`; },
    shot(el) { lightbox(el.dataset.src, el.dataset.label || ''); },
    scrub(el, ctx) { stopPlay(); S.scrub[el.dataset.id] = +el.value; drawReplay(ctx.root, el.dataset.id); const b = ctx.root.querySelector('[data-act="play"]'); if (b) b.outerHTML = playBtn(el.dataset.id); },
    play(el, ctx) {
      const id = el.dataset.id; const j = D && all(D).find((x) => x.card.id === id); if (!j) return;
      if (S.timer) { stopPlay(); } else {
        const n = j.trace.length;
        if ((S.scrub[id] ?? n - 1) >= n - 1) S.scrub[id] = 0;
        S.timer = setInterval(() => {
          const next = (S.scrub[id] ?? 0) + 1;
          if (next >= n || !ctx.root.querySelector('#tl-replay')) { S.scrub[id] = n - 1; stopPlay(); drawReplay(ctx.root, id); swapPlay(ctx.root, id); return; }
          S.scrub[id] = next; drawReplay(ctx.root, id);
        }, reduced() ? 700 : 260);
        drawReplay(ctx.root, id);
      }
      swapPlay(ctx.root, id);
    },
    copy(el, ctx) {
      const j = D && all(D).find((x) => x.card.id === el.dataset.id); const text = j?.prompt || j?.round.protocolPrompt || '';
      navigator.clipboard?.writeText(text).then(() => ctx.toast('הפרומפט הועתק.', 'ok', 'מעבדת בדיקות'), () => ctx.toast('הדפדפן לא איפשר העתקה.', 'bad', 'מעבדת בדיקות'));
    },
    export(el, ctx) {
      const md = report(D, el.dataset.id); if (!md) return;
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
      a.download = `apple-test-${el.dataset.id}.md`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      ctx.toast('הדוח ירד כקובץ Markdown. שום דבר לא נשלח לשום מקום.', 'ok', 'מעבדת בדיקות');
    },
  },
};
const playBtn = (id) => html`<button class="btn btn-sm" data-act="play" data-id="${id}" aria-pressed="${S.timer ? 'true' : 'false'}">${icon(S.timer ? 'pause' : 'play', 14)}<span>${S.timer ? 'עצירה' : 'ניגון'}</span></button>`.s;
function swapPlay(root, id) { const b = root.querySelector('[data-act="play"]'); if (b) b.outerHTML = playBtn(id); }
