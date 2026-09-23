// Discord: the AppleAI application (public flags, install scopes, interactions hook), the invite
// link, and what is missing for the bot itself.
import { html, arr } from '../ui.js';
import { logo } from '../logos.js';
import { stat, extBtn, notConnected } from './kit.js';

const flag = (on, yes, no) => html`<span class="chip ${on ? 'chip-ok' : 'chip-off'}">${on ? yes : no}</span>`;

export default {
  id: 'discord', title: 'Discord', nav: 'Discord', brand: 'discord', needs: ['discord'],
  sub: 'אפליקציית AppleAI בדיסקורד: מי יכול להוסיף אותה, ומה חסר כדי שהבוט יעבוד',
  links: (d) => [{ label: 'Developer Portal', url: d.discord?.portalUrl }],
  render(d) {
    const s = d.discord || {}; const a = s.app || {};
    return html`
      <section class="g g4" aria-label="מדדים">
        ${stat({ key: 'dc-app', label: 'אפליקציה', text: a.name || '—', sub: a.id ? html`<bdi class="mono">${a.id}</bdi>` : '' })}
        ${stat({ key: 'dc-bot', label: 'בוט', text: s.bot ? 'מחובר' : 'לא מחובר', tone: s.bot ? 'good' : 'warn', sub: s.bot ? '' : 'חסר DISCORD_BOT_TOKEN' })}
        ${stat({ key: 'dc-pub', label: 'מי יכול להזמין', text: a.botPublic ? 'כולם' : 'רק הבעלים' })}
        ${stat({ key: 'dc-hook', label: 'פקודות (/)', text: a.hook ? 'מחוברות' : 'לא מחוברות', tone: a.hook ? 'good' : '', sub: 'כתובת Interactions מוגדרת' })}
      </section>
      <div class="g g2">
        <article class="card">
          <div class="nc-h">${logo('discord', 'lg')}<div class="grow"><b>${a.name || 'AppleAI'}</b><small dir="auto">${a.description || 'אין תיאור לאפליקציה'}</small></div></div>
          <div class="row" style="margin-top:14px">${flag(a.botPublic, 'ציבורית', 'פרטית')}${flag(a.verified, 'מאומתת', 'לא מאומתת')}${flag(a.discoverable, 'מופיעה בחיפוש', 'לא בחיפוש')}${flag(a.monetized, 'עם מנויים', 'בלי מנויים')}</div>
          <dl class="kv kv-row"><div><dt>הרשאות התקנה</dt><dd>${arr(a.scopes).map((x) => html`<bdi class="mono">${x}</bdi> `)}</dd></div></dl>
          <p class="row" style="margin-top:14px">${extBtn(s.inviteUrl, 'קישור הזמנה לשרת', 'btn-sm btn-brand')}${extBtn(s.portalUrl, 'Developer Portal', 'btn-sm btn-ghost')}</p>
          <p class="explain">קישור ההזמנה פותח את דיסקורד ומבקש לבחור שרת. שום דבר לא משתנה עד שמאשרים שם.</p></article>
        ${s.bot ? '' : notConnected('discord', ['DISCORD_BOT_TOKEN'], { blurb: 'הבוט עצמו', how: 'ב-Developer Portal: Bot → Reset Token → להעתיק את הטוקן ולהדביק ב-.env כ-DISCORD_BOT_TOKEN. אחרי זה לוח הבקרה יראה גם את השרתים שהבוט נמצא בהם.', docs: 'https://discord.com/developers/docs/topics/oauth2#bots' })}
      </div>`;
  },
};
