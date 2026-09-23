// Roblox: the plugins published to the Creator Store, as the store sees them.
import { html, num, ago, arr, isNum, isFail, light } from '../ui.js';
import { logo } from '../logos.js';
import { stat, extBtn, note } from './kit.js';

const ok2xx = (c) => isNum(c) && c >= 200 && c < 300;

// The Creator Store listing of the Studio plugin. A 404 with a recorded refusal (packages/shared) is a
// known removal, not "waiting for approval"; control assets tell our fault apart from Roblox's.
function storeCard(r) {
  if (!r || isFail(r)) return note('warn', 'בדיקת החנות של Roblox לא זמינה', r?.reason || 'השרת לא שלח תוצאה.');
  const ctl = arr(r.controls); const ctlOk = ctl.some((c) => ok2xx(c.httpStatus));
  const ours = r.httpStatus; const rf = r.refusal;
  const [state, head, meaning] = ok2xx(ours) ? ['ok', 'הפלאגין מופיע בחנות', 'אפשר למצוא ולהתקין את הפלאגין ב-Creator Store.']
    : ctlOk && rf ? ['warn', 'Roblox הסירה את הפלאגין מהחנות (ידוע)', `הסיבה של Roblox: "${rf.reason}" (${String(rf.decidedAt).slice(0, 10)}). האתר כבר לא מציג קישור התקנה שלא עובד. אפשר לערער עד ${String(rf.appealableUntil).slice(0, 10)}${rf.appealId ? ' — ערעור נשלח.' : ' — ערעור עוד לא נשלח.'}`]
    : ctlOk ? ['bad', 'הפלאגין עדיין לא מופיע בחנות', 'הבדיקה עצמה עובדת (נכס הביקורת כן נמצא), אז הבעיה היא שהפלאגין שלנו לא מפורסם או ממתין לאישור של Roblox.']
      : ctl.length ? ['warn', 'אי אפשר לדעת כרגע', 'גם נכסי הביקורת לא ענו, כלומר כנראה יש תקלה זמנית אצל Roblox ולא אצלנו.'] : ['off', 'אין נתון', 'השרת לא שלח תוצאה.'];
  return html`<article class="card">
    <div class="nc-h">${logo('roblox', 'md')}<div class="grow"><b>הפלאגין של Apple ב-Creator Store</b><small>${light(state, head)}</small></div>${r.url ? extBtn(r.url, 'בחנות', 'btn-sm btn-ghost') : ''}</div>
    <p class="explain">${meaning}</p>
    <dl class="kv kv-row"><div><dt>מספר הנכס שלנו</dt><dd><bdi class="mono">${r.assetId ?? '—'}</bdi></dd></div><div><dt>תשובת החנות</dt><dd class="mono">${ours ?? '—'}</dd></div>
      ${ctl.map((c) => html`<div><dt>נכס ביקורת <bdi class="mono">${c.assetId ?? c.id}</bdi></dt><dd>${light(ok2xx(c.httpStatus) ? 'ok' : 'bad', ok2xx(c.httpStatus) ? `נמצא (${c.httpStatus})` : `לא נמצא (${c.httpStatus ?? '—'})`)}</dd></div>`)}</dl>
    ${ctl.length ? html`<p class="explain">נכסי ביקורת הם נכסים ציבוריים ידועים שנבדקים באותה דרך: אם הם נמצאים והנכס שלנו לא, הבעיה אצלנו. אם גם הם לא, הבעיה אצל Roblox.</p>` : ''}</article>`;
}

export default {
  id: 'roblox', title: 'Roblox', nav: 'Roblox', brand: 'roblox', needs: ['roblox', 'extras'],
  sub: 'הפלאגינים שפורסמו בחנות של Roblox: שם, יוצר, מכירות ומחיר',
  links: () => [{ label: 'Creator Dashboard', url: 'https://create.roblox.com/dashboard/creations' }],
  render(d) {
    const r = d.roblox || {}; const assets = arr(r.assets);
    return html`
      <section class="g g4" aria-label="מדדים">
        ${stat({ key: 'rb-n', label: 'פלאגינים בחנות', value: assets.length })}
        ${stat({ key: 'rb-sale', label: 'מכירות', value: assets.reduce((a, x) => a + (+x.sales || 0), 0) })}
        ${stat({ key: 'rb-fs', label: 'למכירה', value: assets.filter((x) => x.forSale).length, sub: 'השאר חינמיים או לא מוצעים' })}
        ${stat({ key: 'rb-up', label: 'עדכון אחרון', text: ago(assets.map((x) => x.updated).sort().pop()), sub: r.creatorToken ? 'מפתח יוצר מחובר' : 'אין מפתח יוצר' })}
      </section>
      ${storeCard(d.extras?.robloxStore)}
      <div class="g g2">${assets.map((a) => html`<article class="card">
        <div class="nc-h">${logo('roblox', 'lg')}<div class="grow"><b dir="auto">${a.name}</b><small>${a.type} · <bdi>${a.creator?.name || '—'}</bdi>${a.creator?.verified ? ' ✓' : ''}</small></div>
          <span class="chip ${a.forSale ? 'chip-ok' : 'chip-off'}">${a.forSale ? (a.price ? `${num(a.price)} R$` : 'חינם') : 'לא למכירה'}</span></div>
        ${a.description ? html`<p class="explain" dir="auto">${a.description}</p>` : ''}
        <dl class="kv kv-row"><div><dt>מכירות</dt><dd>${num(a.sales)}</dd></div><div><dt>פורסם</dt><dd>${ago(a.created)}</dd></div><div><dt>עודכן</dt><dd>${ago(a.updated)}</dd></div><div><dt>מזהה</dt><dd><bdi class="mono">${a.id}</bdi></dd></div></dl>
        <p class="row" style="margin-top:14px">${extBtn(a.url, 'בחנות', 'btn-sm btn-brand')}${extBtn(`https://create.roblox.com/dashboard/creations/store/${a.id}/configure`, 'הגדרות הפריט', 'btn-sm btn-ghost')}</p></article>`)}</div>
      ${note('info', 'שינויים בחנות נעשים ב-Roblox', 'מחיר, תיאור ופרסום של פלאגין משתנים מתוך Creator Dashboard. לוח הבקרה רק מציג אותם.')}`;
  },
};
