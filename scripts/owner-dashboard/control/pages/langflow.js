// Langflow: the product flows as Langflow itself draws them. A project list of the flows checked in at
// packages/langflow/flows, the selected flow's canvas (nodes, fields, outputs and edges from the flow
// JSON, so it shows even when Langflow is down), a Playground-style run box behind the confirm modal,
// the flow's git versions and the local instance's run log. The conclusions come from the server
// (cc/platforms/langflow.mjs langflowConclusions), computed from the same payload.
import { html, raw, num, ago, arr, rel, isNum } from '../ui.js';
import { icon } from '../logos.js';
import { rn } from '../fx.js';
import { note } from './kit.js';
import { lfRun } from '../actions/langflow.js';

let sel = null; // selected flow (repo file path), client state
let runTab = 'flow'; // flow | all
const outs = {}; // flow id -> { at, text } of the last run started from this page

// Lucide glyphs (ISC), the icon set Langflow's nodes name in their `icon` field.
const LU = {
  MessagesSquare: '<path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/>',
  'shield-check': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
  'graduation-cap': '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  'file-json': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1"/><path d="M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  scale: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
  Cloudflare: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  workflow: '<rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  commit: '<circle cx="12" cy="12" r="3"/><line x1="3" x2="9" y1="12" y2="12"/><line x1="15" x2="21" y1="12" y2="12"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
};
const lu = (name, s = 16) => html`<svg class="lf-lu" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${raw(LU[name] || LU.box)}</svg>`;

// Langflow's swatch colours for flow tiles, picked by a hash of the flow id as Langflow does.
const SWATCH = ['#7c3aed', '#4ade80', '#2f10fe', '#ff3276', '#f97316', '#06b6d4', '#eab308', '#10b981'];
const swatch = (id) => SWATCH[[...String(id || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % SWATCH.length];
// Datatype colour classes (the handle and edge colour of each Langflow type).
const TYPES = new Set(['Message', 'Data', 'DataFrame', 'LanguageModel', 'Tool', 'Embeddings', 'Memory', 'Text']);
const tcls = (t) => `t-${TYPES.has(t) ? t : 'other'}`;
const TONE_IC = { ok: 'check', info: 'bolt', warn: 'alert', bad: 'alert' };
// Server-written Hebrew sentences carry Latin names and numbers: each Latin run is isolated in a <bdi>.
const LAT = /([A-Za-z0-9$(](?:[\w$.\/:=%+'(),& -]*[\w$%)])?)/;
const bidi = (t) => String(t ?? '').split(LAT).map((p, i) => (i % 2 ? html`<bdi dir="ltr">${p}</bdi>` : p));
const secs = (ms) => (isNum(ms) ? (ms < 1000 ? `${num(ms)}ms` : `${num(ms / 1000, 1)}s`) : '—');

// ------------------------------------------------ canvas geometry (world units = CSS px at 100%)
const NW = 256; const GX = 76; const PAD = 28; const HEAD = 50; const DESC = 46; const FIELD = 56; const OUT = 38;
function layout(canvas) {
  const nodes = arr(canvas?.nodes); if (!nodes.length) return null;
  const cols = [...new Set(nodes.map((n) => n.x))].sort((a, b) => a - b);
  const minY = Math.min(...nodes.map((n) => n.y));
  const at = {};
  for (const n of nodes) {
    const f = arr(n.fields).length; const o = Math.max(1, arr(n.outputs).length);
    at[n.id] = { n, x: PAD + cols.indexOf(n.x) * (NW + GX), y: PAD + Math.round((n.y - minY) * 0.55), h: HEAD + DESC + f * FIELD + o * OUT + 2 };
  }
  const W = PAD * 2 + cols.length * NW + (cols.length - 1) * GX;
  const H = Math.max(...Object.values(at).map((p) => p.y + p.h)) + PAD;
  const edges = arr(canvas.edges).map((e) => {
    const s = at[e.source]; const t = at[e.target]; if (!s || !t) return null;
    const oi = Math.max(0, arr(s.n.outputs).findIndex((o) => o.name === e.output));
    const fi = arr(t.n.fields).findIndex((f) => f.name === e.field);
    const sx = s.x + NW; const sy = s.y + HEAD + DESC + arr(s.n.fields).length * FIELD + oi * OUT + OUT / 2;
    const tx = t.x; const ty = fi < 0 ? t.y + HEAD / 2 : t.y + HEAD + DESC + fi * FIELD + 17;
    const dx = Math.max(40, (tx - sx) / 2);
    return { ...e, k: `${e.source}>${e.target}:${e.field}`, d: `M${sx} ${sy} C${sx + dx} ${sy} ${tx - dx} ${ty} ${tx} ${ty}`, sx, sy, tx, ty };
  }).filter(Boolean);
  // Every output gets its round handle on the node's right edge, connected or not (as in Langflow).
  const outs = Object.values(at).flatMap((p) => arr(p.n.outputs).map((o, j) => ({ k: `${p.n.id}.${o.name}`, type: arr(o.types)[0],
    cx: p.x + NW, cy: p.y + HEAD + DESC + arr(p.n.fields).length * FIELD + j * OUT + OUT / 2 })));
  return { at, W, H, edges, outs };
}

function nodeBody(n, into) {
  return html`<div class="lf-node ${n.usesModel ? 'is-model' : ''}">
    <div class="lf-nh"><span class="lf-ni">${lu(n.icon, 18)}</span><b dir="ltr">${n.label || n.type}</b>${n.usesModel ? html`<span class="lf-nb" title="קורא למודל">AI</span>` : ''}</div>
    <p class="lf-nd" dir="ltr">${n.desc || ''}</p>
    ${arr(n.fields).map((f) => html`<div class="lf-f">
      <span class="lf-fl" dir="ltr">${f.label || f.name}</span>
      ${into.has(f.name) ? html`<span class="lf-fx" dir="ltr">${f.type === 'other' ? 'Data, Message…' : 'Message'}</span>`
        : html`<span class="lf-fi mono" dir="ltr">${f.value != null && f.value !== '' ? String(f.value) : f.type === 'str' ? 'Type something…' : f.type}</span>`}
    </div>`)}
    <div class="lf-no">${(arr(n.outputs).length ? arr(n.outputs) : [{ name: 'out', label: 'Output', types: [] }]).map((o) => html`<div class="lf-o"><span dir="ltr">${o.label || o.name}</span><i class="lf-h ${tcls(arr(o.types)[0])}" aria-hidden="true"></i></div>`)}</div>
  </div>`;
}

function canvasView(f) {
  const L = layout(f.canvas);
  if (!L) return html`<div class="lf-empty">${f.invalid ? 'קובץ הזרימה לא נקרא כ-JSON תקין, אז אין קנבס להציג.' : 'בזרימה הזו אין רכיבים.'}</div>`;
  const into = (id) => new Set(L.edges.filter((e) => e.target === id).map((e) => e.field));
  const nodes = arr(f.canvas.nodes);
  const label = `קנבס של ${f.name}: ${nodes.length} רכיבים, ${L.edges.length} חיבורים. ${nodes.map((n) => n.label).join(' ← ')}`;
  return html`<figure class="lf-canvas" dir="ltr" data-k="cv-${f.file}" aria-label="${label}">
    <svg class="lf-svg" viewBox="0 0 ${L.W} ${L.H}" style="max-width:${L.W}px" role="img" aria-label="${label}">
      <g class="lf-edges">${L.edges.map((e, i) => html`<path class="lf-e ${tcls(e.type)}" style="--i:${i}" d="${e.d}" pathLength="1"/>`)}</g>
      ${nodes.map((n, i) => { const p = L.at[n.id]; return html`<foreignObject class="lf-fo" style="--i:${i}" x="${p.x}" y="${p.y}" width="${NW}" height="${p.h}">${nodeBody(n, into(n.id))}</foreignObject>`; })}
      <g class="lf-hs">${L.edges.map((e) => html`<circle class="lf-hc ${tcls(e.type)}" cx="${e.tx}" cy="${e.ty}" r="6"/>`)}${L.outs.map((o) => html`<circle class="lf-hc ${tcls(o.type)}" cx="${o.cx}" cy="${o.cy}" r="6"/>`)}</g>
    </svg>
    <ol class="lf-stack">${nodes.slice().sort((a, b) => a.x - b.x || a.y - b.y).map((n, i) => html`<li data-k="st-${n.id}" style="--i:${i}">${nodeBody(n, into(n.id))}</li>`)}</ol>
    <figcaption class="lf-ctl"><span>${lu('workflow', 14)}<bdi class="mono">${f.file}</bdi></span><span>${rn(`lf-nodes-${f.file}`, nodes.length, num(nodes.length))} components · ${rn(`lf-edges-${f.file}`, L.edges.length, num(L.edges.length))} edges</span></figcaption>
  </figure>`;
}

function concl(list) {
  if (!list.length) return '';
  return html`<section class="lf-concl" aria-label="מסקנות">${list.map((c) => html`<article class="lf-cc is-${c.tone}" data-k="cc-${c.k}">
    <span class="lf-cc-i" aria-hidden="true">${icon(TONE_IC[c.tone] || 'bolt', 16)}</span>
    <div><h2>${bidi(c.title)}</h2><p>${bidi(c.text)}</p></div></article>`)}</section>`;
}

function flowRow(f, on) {
  const chip = f.imported === true ? (f.current === false ? ['warn', 'שונה מהריפו'] : ['ok', 'מיובאת']) : f.imported === false ? ['warn', 'לא מיובאת'] : ['off', 'Langflow כבוי'];
  return html`<li data-k="fl-${f.file}"><button class="lf-row ${on ? 'on' : ''}" data-act="pick" data-f="${f.file}" aria-pressed="${on ? 'true' : 'false'}">
    <span class="lf-tile" style="--sw:${swatch(f.id || f.file)}">${lu('workflow', 16)}</span>
    <span class="lf-rn"><b dir="ltr">${f.name}</b><small>נערכה ${rel(f.instanceUpdatedAt || f.updatedAt)}${f.usesModel ? ' · קוראת למודל' : ''}</small></span>
    <span class="lf-chip is-${chip[0]}">${chip[1]}</span>
  </button></li>`;
}

function runBox(f, l) {
  const can = l.running && l.auth === 'ok' && f.imported && f.id;
  const why = !l.running ? 'Langflow כבוי: אי אפשר להריץ עכשיו.' : l.auth !== 'ok' ? 'Langflow סירב להתחברות, אז אי אפשר להריץ.' : !f.imported ? 'הזרימה לא מיובאת ל-Langflow. קודם node packages/langflow/sync.mjs sync.' : '';
  const o = outs[f.id];
  return html`<section class="card lf-play" aria-labelledby="lf-play-h" data-k="play">
    <header class="lf-ph"><h2 id="lf-play-h">${lu('play', 15)}Playground</h2><span class="lf-chip ${f.usesModel ? 'is-warn' : 'is-ok'}">${f.usesModel ? 'קוראת ל-Workers AI' : 'בלי מודל, רק קבצים מקומיים'}</span></header>
    <div class="lf-pf" data-k="run-${f.id || f.file}" data-keep="run-${f.id || f.file}">
      <label for="lf-in" class="lf-pl">קלט (<bdi class="mono">input_value</bdi>, עד 4,000 תווים)${f.example ? ' · מולא מראש מהדוגמה של sync.mjs' : ''}</label>
      <textarea id="lf-in" class="lf-ta mono" dir="ltr" rows="5" maxlength="4000" spellcheck="false" ${can ? '' : 'disabled'}>${f.example || ''}</textarea>
      <div class="lf-pa"><button type="button" class="btn btn-primary btn-sm" data-act="run" data-id="${f.id || ''}" ${can ? '' : 'disabled'}>${lu('play', 14)}<span>הרצה</span></button>
        <small>${why || 'לפני הריצה נפתח אישור. במצב ניסוי רואים את הקריאה המדויקת בלי לשלוח.'}</small></div>
    </div>
    ${o ? html`<div class="lf-out" data-k="out-${f.id}"><p class="lf-pl">הפלט של הריצה ${rel(o.at)}</p>${o.text ? html`<pre class="mono" dir="ltr">${o.text}</pre>` : html`<p class="faint">הריצה הסתיימה בלי הודעת פלט.</p>`}</div>` : ''}
  </section>`;
}

function stateBox(f, l) {
  const v = arr(f.versions);
  const rows = [
    ['קובץ בריפו', html`<bdi class="mono">packages/langflow/${f.file}</bdi>`],
    ['הקובץ נערך', ago(f.updatedAt)],
    ['ב-Langflow', !l.running ? 'לא ידוע (Langflow כבוי)' : f.imported ? html`מיובאת, עודכנה ${ago(f.instanceUpdatedAt)}` : 'לא מיובאת'],
    ['הקוד תואם לריפו', f.current === true ? 'כן, אותו קוד בכל הרכיבים' : f.current === false ? 'לא: העותק ב-Langflow שונה' : 'לא ידוע'],
    ['Endpoint', f.endpoint ? html`<bdi class="mono">/api/v1/run/${f.endpoint}</bdi>` : '—'],
    ['מזהה', f.id ? html`<bdi class="mono">${f.id}</bdi>` : '—'],
  ];
  return html`<section class="card lf-info" aria-labelledby="lf-info-h" data-k="info">
    <h2 id="lf-info-h">${f.name}</h2>${f.description ? html`<p class="lf-desc" dir="ltr">${f.description}</p>` : ''}
    <dl class="lf-kv">${rows.map(([k, val]) => html`<div><dt>${k}</dt><dd>${val}</dd></div>`)}</dl>
    <h3>${lu('commit', 14)}גרסאות (git)${f.dirty ? html` <span class="lf-chip is-warn">יש שינויים שלא נשמרו</span>` : ''}</h3>
    ${f.versions === null ? html`<p class="faint">לא הצלחנו לקרוא את היסטוריית git של התיקייה.</p>`
      : v.length ? html`<ol class="lf-vers">${v.map((c) => html`<li data-k="v-${c.sha}"><bdi class="mono lf-sha">${c.sha}</bdi><span dir="ltr">${c.subject}</span><small>${ago(c.at)}</small></li>`)}</ol>`
        : html`<p class="faint">הקובץ עוד לא נשמר באף קומיט.</p>`}
    ${f.openUrl ? html`<p><a class="btn btn-sm" href="${f.openUrl}" target="_blank" rel="noopener noreferrer">פתיחה ב-Langflow${icon('ext', 13)}</a></p>`
      : l.running && l.ui === false ? html`<p class="faint lf-noui">ל-Langflow המקומי אין ממשק ווב (backend-only), אז אין קישור לפתיחה. פותחים ב-Langflow Desktop.</p>` : ''}
  </section>`;
}

function runsView(f, l) {
  const list = runTab === 'flow' ? arr(f.runs).map((r) => ({ ...r, flowName: f.name })) : arr(l.recentRuns);
  const head = html`<header class="lf-rh"><h2 id="lf-runs-h">יומן ריצות</h2>
    <div class="lf-seg" role="tablist" aria-label="איזה ריצות">${[['flow', 'הזרימה הזו'], ['all', 'כל הזרימות']].map(([k, t]) => html`<button class="lf-tab ${runTab === k ? 'on' : ''}" role="tab" aria-selected="${runTab === k ? 'true' : 'false'}" data-act="runtab" data-t="${k}">${t}</button>`)}</div>
    ${l.runsKnown ? html`<span class="lf-rt">${rn('lf-runs-total', l.runsTotal ?? 0, num(l.runsTotal ?? 0))} ריצות רשומות</span>` : ''}</header>`;
  let body;
  if (!l.running) body = html`<p class="lf-empty">Langflow כבוי, אז אין גישה ליומן הריצות. זה לא אומר שלא היו ריצות.</p>`;
  else if (!l.runsKnown) body = html`<p class="lf-empty">לא הצלחנו לקרוא את יומן הריצות של Langflow (<bdi class="mono">/api/v1/monitor/traces</bdi>).</p>`;
  else if (!list.length) body = html`<p class="lf-empty">${runTab === 'flow' ? 'הזרימה הזו עוד לא הורצה.' : 'עוד לא הורצה אף זרימה.'}</p>`;
  else {
    body = html`<div class="lf-tw"><table class="lf-t"><thead><tr><th>סטטוס</th><th>זרימה</th><th>מזהה</th><th>מתי</th><th>משך</th></tr></thead>
      <tbody>${list.map((r) => html`<tr data-k="r-${r.id}"><td><span class="lf-st ${r.ok ? 'is-ok' : 'is-bad'}"><i></i>${r.ok ? 'הצליחה' : 'נכשלה'}</span></td>
        <td dir="ltr" class="lf-tn">${r.flowName || '—'}</td><td><bdi class="mono">${r.id}</bdi></td><td>${ago(r.at)}</td><td><bdi class="mono">${secs(r.ms)}</bdi></td></tr>`)}</tbody></table></div>`;
  }
  return html`<section class="card lf-runs" aria-labelledby="lf-runs-h" data-k="runs">${head}${body}</section>`;
}

export default {
  id: 'langflow', title: 'Langflow', nav: 'Langflow', brand: 'langflow', needs: ['langflow'],
  sub: 'זרימות ה-AI של המוצר כמו ש-Langflow מצייר אותן: הרכיבים והחיבורים מהריפו, מה נטען ל-Langflow המקומי, הרצה מוגנת ויומן ריצות',
  links: (d) => [{ label: 'Langflow המקומי', url: d.langflow?.ui ? d.langflow.url : null }, { label: 'התיעוד של Langflow', url: 'https://docs.langflow.org' }].filter((x) => x.url),
  render(d) {
    const l = d.langflow || {}; const flows = arr(l.flows);
    if (!flows.find((f) => f.file === sel)) sel = flows[0]?.file ?? null;
    const f = flows.find((x) => x.file === sel);
    const pill = !l.running ? ['off', 'כבוי'] : l.auth === 'refused' ? ['bad', 'סירב להתחברות'] : ['ok', `רץ${l.version ? ` · ${l.version}` : ''}`];
    const top = !l.repoFolder ? note('warn', 'אין תיקיית זרימות בריפו', 'packages/langflow לא נמצא. כשהתיקייה תחזור, הזרימות יופיעו כאן.') : '';
    return html`
      ${concl(arr(l.conclusions))}
      ${top}
      <section class="lf-app" aria-label="Langflow" data-k="app">
        <header class="lf-bar">
          <span class="lf-mark" aria-hidden="true">${icon('bolt', 14)}</span>
          <nav class="lf-crumb" aria-label="מיקום"><bdi dir="ltr">${l.project?.name || 'Apple'}</bdi><span aria-hidden="true">/</span>${f ? html`<span class="lf-tile sm" style="--sw:${swatch(f.id || f.file)}">${lu('workflow', 12)}</span><b dir="ltr">${f.name}</b>` : ''}</nav>
          <span class="lf-pill is-${pill[0]}"><i></i>${pill[1]}</span>
          ${l.queue ? html`<span class="lf-q">תור: <bdi class="mono">${l.queue.backend || '—'}</bdi> · ${rn('lf-q', l.queue.active, num(l.queue.active))} פעילות</span>` : ''}
        </header>
        <div class="lf-split">
          <aside class="lf-side" aria-label="זרימות">
            <p class="lf-sh"><span>Flows</span><span class="lf-n">${rn('lf-flows', flows.length, num(flows.length))}</span></p>
            ${flows.length ? html`<ul class="lf-list">${flows.map((x) => flowRow(x, x.file === sel))}</ul>` : html`<p class="lf-empty">אין קבצי זרימה בתיקייה.</p>`}
            ${l.extraInstanceFlows ? html`<p class="lf-extra">${rn('lf-extra', l.extraInstanceFlows, num(l.extraInstanceFlows))} זרימות נוספות ב-Langflow שלא שמורות בריפו.</p>` : ''}
          </aside>
          <div class="lf-main">${f ? canvasView(f) : html`<div class="lf-empty">בחרו זרימה.</div>`}</div>
        </div>
      </section>
      ${f ? html`<div class="lf-grid">${runBox(f, l)}${stateBox(f, l)}</div>${runsView(f, l)}` : ''}`;
  },
  actions: {
    pick(el, ctx) { sel = el.dataset.f; ctx.rerender(); },
    runtab(el, ctx) { runTab = el.dataset.t === 'all' ? 'all' : 'flow'; ctx.rerender(); },
    async run(el, ctx) {
      const f = arr(ctx.data?.langflow?.flows).find((x) => x.id && x.id === el.dataset.id); if (!f) return;
      const input = ctx.root.querySelector('#lf-in')?.value ?? '';
      if (!input.trim()) { ctx.toast('צריך קלט להרצה.', 'warn', 'Langflow'); return; }
      if (input.length > 4000) { ctx.toast('הקלט ארוך מ-4,000 תווים.', 'warn', 'Langflow'); return; }
      const res = await ctx.act(lfRun(f, input));
      if (res && res.ok !== false && !res.dryRun) { outs[f.id] = { at: Date.now(), text: res.output ?? null }; ctx.rerender(); }
    },
  },
};
