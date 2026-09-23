import { html, num, arr, brand, light, isNum, isFail, failCard, short } from '../ui.js';

const ok2xx = (c) => isNum(c) && c >= 200 && c < 300;

function apple(a) {
  if (isFail(a)) return failCard(a.reason, { level: 'warn', title: 'בדיקת Apple לא זמינה' });
  const state = a?.httpStatus == null ? 'off' : ok2xx(a.httpStatus) ? (a.ms > 1500 ? 'warn' : 'ok') : 'bad';
  return html`<article class="card mc">
    <header class="mc-h"><span class="mc-logo mc-apple" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="13" r="8" fill="currentColor"/><path d="M12 5c0-2 1.5-3.5 3.5-3.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg></span><h2>Apple בייצור</h2></header>
    <p>${light(state, { ok: 'השירות למשתמשים עובד', warn: 'עובד, אבל לאט', bad: 'השירות לא עונה כמו שצריך', off: 'אין נתון' }[state])}</p>
    <dl class="kv kv-row"><div><dt>קוד תשובה</dt><dd class="mono">${a?.httpStatus ?? '—'}</dd></div><div><dt>זמן תגובה</dt><dd class="mono">${isNum(a?.ms) ? `${num(a.ms)}ms` : '—'}</dd></div><div><dt>גרסה</dt><dd class="mono"><bdi>${short(a?.buildSha) || '—'}</bdi></dd></div></dl>
    <p class="explain">בדיקה חיה של השרת שהמשתמשים האמיתיים מתחברים אליו.</p></article>`;
}

function roblox(r) {
  if (isFail(r)) return failCard(r.reason, { level: 'warn', title: 'בדיקת החנות של Roblox לא זמינה' });
  const ctl = arr(r?.controls); const ctlOk = ctl.some((c) => ok2xx(c.httpStatus));
  const ours = r?.httpStatus;
  const rf = r?.refusal;
  const [state, head, meaning] = ok2xx(ours) ? ['ok', 'הפלאגין מופיע בחנות', 'אפשר למצוא ולהתקין את הפלאגין ב-Creator Store.']
    : ctlOk && rf ? ['warn', 'Roblox הסירה את הפלאגין מהחנות (ידוע)', `הסיבה של Roblox: "${rf.reason}" (${String(rf.decidedAt).slice(0, 10)}). האתר כבר לא מציג קישור התקנה שלא עובד. אפשר לערער עד ${String(rf.appealableUntil).slice(0, 10)}${rf.appealId ? ' — ערעור נשלח.' : ' — ערעור עוד לא נשלח.'}`]
    : ctlOk ? ['bad', 'הפלאגין עדיין לא מופיע בחנות', 'הבדיקה עצמה עובדת (נכס הביקורת כן נמצא), אז הבעיה היא שהפלאגין שלנו לא מפורסם או ממתין לאישור של Roblox.']
      : ctl.length ? ['warn', 'אי אפשר לדעת כרגע', 'גם נכסי הביקורת לא ענו, כלומר כנראה יש תקלה זמנית אצל Roblox ולא אצלנו.'] : ['off', 'אין נתון', 'השרת לא שלח תוצאה.'];
  return html`<article class="card mc">
    <header class="mc-h"><span class="mc-logo" aria-hidden="true">${brand('roblox', 'bm-md')}</span><h2>החנות של Roblox (Creator Store)</h2></header>
    <p>${light(state, head)}</p><p class="mc-mean">${meaning}</p>
    <dl class="kv kv-row"><div><dt>מספר הנכס שלנו</dt><dd class="mono"><bdi>${r?.assetId ?? '—'}</bdi></dd></div><div><dt>תשובת החנות</dt><dd class="mono">${ours ?? '—'}</dd></div></dl>
    ${ctl.length ? html`<h3 class="mc-s">נכסי ביקורת</h3><p class="explain">נכסים ציבוריים ידועים שבודקים באותה דרך. אם הם נמצאים (200) והנכס שלנו לא, הבעיה אצלנו. אם גם הם לא נמצאים, הבעיה אצל Roblox.</p>
      <ul class="mc-ctl">${ctl.map((c) => html`<li><bdi class="mono">${c.assetId ?? c.id}</bdi>${light(ok2xx(c.httpStatus) ? 'ok' : 'bad', ok2xx(c.httpStatus) ? `נמצא (${c.httpStatus})` : `לא נמצא (${c.httpStatus ?? '—'})`)}</li>`)}</ul>` : ''}
  </article>`;
}

function notYet(slug, name, what, x) {
  const on = x?.configured === true;
  return html`<article class="card mc ${on ? '' : 'mc-off'}">
    <header class="mc-h"><span class="mc-logo" aria-hidden="true">${brand(slug, 'bm-md')}</span><h2>${name}</h2></header>
    <p>${isFail(x) ? light('warn', 'לא זמין') : on ? light('ok', 'מחובר') : light('off', 'עוד לא מחובר')}</p>
    <p class="mc-mean">${what}</p>
    ${isFail(x) ? html`<p class="explain">${x.reason}</p>` : !on && x?.how ? html`<pre class="mc-how" dir="auto">${x.how}</pre>` : ''}
  </article>`;
}

export default {
  id: 'more', title: 'עוד', nav: 'עוד', icon: '⋯', endpoint: '/api/cc/extras',
  sub: 'השירות למשתמשים, החנות של Roblox ושירותים שעוד לא חוברו',
  render(d) {
    return html`<div class="g g2">${apple(d.apple)}${roblox(d.robloxStore)}</div>
      <div class="g g2">
        ${notYet('stripe', 'Stripe (תשלומים)', 'כשיחובר: כמה כסף נכנס, מנויים פעילים ותשלומים שנכשלו.', d.stripe)}
        ${notYet('posthog', 'PostHog (שימוש באפליקציה)', 'כשיחובר: כמה אנשים משתמשים באפליקציה ומה הם עושים בה.', d.posthog)}
      </div>`;
  },
};
