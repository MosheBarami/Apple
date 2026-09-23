// Building blocks shared by the platform pages: stat tiles, one-click buttons and switches that
// route through app.act (confirm modal → POST → toast), "not connected" cards and row lists.
import { html, num, isNum } from '../ui.js';
import { logo, icon, PLATFORMS } from '../logos.js';
import { rn, spark } from '../fx.js';
import { aid } from '../actions.js';

/** Stat tile. value drives the rolling digits; text is what is shown (already formatted). */
export function stat({ key, label, value, text, unit, sub, series, tone, platform, href, wide, sparkCls = '' }) {
  const tag = href ? 'a' : 'div';
  const shown = text ?? (isNum(value) ? num(value) : '—');
  const inner = html`<p class="stat-k">${platform ? logo(platform, 'sm') : ''}<span>${label}</span></p>
    <p class="stat-v">${isNum(value) ? rn(key, value, shown) : shown}${unit ? html`<small>${unit}</small>` : ''}</p>
    ${sub ? html`<p class="stat-s">${sub}</p>` : ''}
    ${series ? spark(series, { cls: sparkCls, label: `${label}: מגמה` }) : ''}`;
  return tag === 'a'
    ? html`<a class="card stat spot ${tone ? `is-${tone}` : ''} ${wide ? 'wide' : ''}" href="${href}">${inner}</a>`
    : html`<div class="card stat spot ${tone ? `is-${tone}` : ''} ${wide ? 'wide' : ''}">${inner}</div>`;
}

/** A button that runs an action spec (modal first, never a silent write). */
export const actBtn = (spec, label, { cls = 'btn-sm', ic = 'bolt', title } = {}) =>
  html`<button class="btn ${cls}" data-act="app:act" data-aid="${aid(spec)}" ${title ? html`title="${title}"` : ''}>${ic ? icon(ic, 14) : ''}<span>${label}</span></button>`;

/** A switch that flips a remote setting through the same confirm path. */
export const swBtn = (spec, on, label) =>
  html`<button class="swb" role="switch" aria-checked="${on ? 'true' : 'false'}" data-act="app:act" data-aid="${aid(spec)}" aria-label="${label}"><span class="sw"><i></i></span><span>${on ? 'דלוק' : 'כבוי'}</span></button>`;

export const extBtn = (url, label, cls = 'btn-sm') =>
  (url ? html`<a class="btn ${cls}" href="${url}" target="_blank" rel="noopener noreferrer"><span>${label}</span>${icon('ext', 13)}</a>` : '');

/** Card for a platform whose key is missing from .env: names the exact key and how to get it. */
export function notConnected(id, need = [], { how, docs, blurb } = {}) {
  const p = PLATFORMS[id] || { name: id, he: '' };
  return html`<article class="card nc is-off">
    <div class="nc-h">${logo(id, 'md')}<div><b>${p.name}</b><small>${blurb || p.he}</small></div><span class="chip chip-off" style="margin-inline-start:auto">לא מחובר</span></div>
    <p class="nc-how">כדי לחבר: להוסיף ל-<code>.env</code> ${need.map((k, i) => html`${i ? ' ו-' : ''}<code>${k}</code>`)}, ואז להפעיל מחדש את לוח הבקרה.</p>
    ${how ? html`<details class="nc-d"><summary>איך משיגים את המפתח</summary><p dir="auto">${how}</p></details>` : ''}
    ${docs ? html`<p>${extBtn(docs, 'התיעוד הרשמי', 'btn-sm btn-ghost')}</p>` : ''}
  </article>`;
}

export const sec = (title, sub) => html`<div class="sec"><h2>${title}</h2>${sub ? html`<p>${sub}</p>` : ''}</div>`;
export const note = (kind, title, text, extra = '') =>
  html`<div class="note note-${kind}" role="${kind === 'bad' ? 'alert' : 'status'}">${icon(kind === 'ok' ? 'check' : kind === 'info' ? 'bolt' : 'alert', 16)}<div><b>${title}</b>${text ? html`<p dir="auto">${text}</p>` : ''}${extra}</div></div>`;
