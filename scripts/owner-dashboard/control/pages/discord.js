// Discord: the bot seen the way Discord's own client shows it. Server rail, channel list, message
// list and member list are the real ones the bot can read over REST (prefetched by the server, so
// picking a channel is instant); with no server they stay on screen with Discord-style empty states.
// Below: the application, slash commands (global and per server), privileged intents, gateway limits
// and the invite link. The one write, sending a message, goes through the confirm modal and dry run.
import { html, raw, num, arr, isNum, isFail, when, rel } from '../ui.js';
import { icon, mark } from '../logos.js';
import { rn } from '../fx.js';
import { extBtn } from './kit.js';
import { send } from '../actions/discord.js';

const TEXT = new Set([0, 5]);
const PERMS = [['צפייה בערוצים', 'VIEW_CHANNEL'], ['שליחת הודעות', 'SEND_MESSAGES'], ['קריאת היסטוריית הודעות', 'READ_MESSAGE_HISTORY']];
const ok = (x) => x != null && !isFail(x);
const good = (x) => Array.isArray(x);

/**
 * The opening conclusions, computed from the payload alone (pure; the tests call it directly).
 * Each: { k, tone: ok|warn|bad|info, title, text }. Between 2 and 4; a section that failed to load
 * produces a "could not check" line, never a conclusion about what it would have shown.
 */
export function infer(s) {
  const out = [];
  if (!s || s.ok === false) {
    return [{ k: 'down', tone: 'bad', title: 'אין תשובה מ-Discord', text: s?.reason || 'השרת של הלוח לא החזיר נתונים.' },
      { k: 'blind', tone: 'warn', title: 'לכן אין כאן מסקנות על השרתים', text: 'בלי תשובה אי אפשר לדעת אם הבוט בשרת כלשהו. זה לא אומר שהוא לא.' }];
  }
  if (!s.configured) {
    return [{ k: 'nc', tone: 'warn', title: 'Discord לא מחובר ללוח', text: `חסר בקובץ ‎.env: ${arr(s.need).join(', ')}.` },
      { k: 'nc2', tone: 'info', title: 'מה יופיע אחרי החיבור', text: 'זהות הבוט, השרתים שהוא נמצא בהם, הערוצים, ההודעות האחרונות ופקודות הסלאש.' }];
  }
  const a = ok(s.app) ? s.app : null;
  const botName = s.identity?.username || a?.name || 'הבוט';
  if (!s.bot) out.push({ k: 'token', tone: 'warn', title: 'אין טוקן בוט', text: 'רואים רק את הפרופיל הציבורי של האפליקציה. כדי לראות שרתים והודעות צריך DISCORD_BOT_TOKEN ב-‎.env.' });
  const G = s.guilds;
  if (s.bot && isFail(G)) out.push({ k: 'gfail', tone: 'warn', title: 'לא הצלחנו לבדוק באילו שרתים הבוט נמצא', text: `${G.reason}. לכן אין כאן מסקנה על השרתים.` });
  else if (good(G) && !G.length) {
    out.push({ k: 'zero', tone: 'bad', title: `${botName} לא נמצא באף שרת`, text: 'Discord מחזיר לבוט 0 שרתים, אז אין ערוצים, הודעות או חברים להציג. זו הסיבה שהחלון למטה ריק.' });
    out.push({ k: 'next', tone: 'info', title: 'הצעד הבא (מסקנה): להזמין את הבוט לשרת', text: 'קישור ההזמנה למטה נבנה ממזהה האפליקציה, עם bot ו-applications.commands והרשאות צפייה, שליחה וקריאת היסטוריה. זה רק קישור: שום דבר לא מתקבל אוטומטית, מאשרים בתוך Discord.' });
  } else if (good(G)) {
    const members = G.reduce((t, g) => t + (isNum(g.members) ? g.members : 0), 0);
    const online = G.reduce((t, g) => t + (isNum(g.online) ? g.online : 0), 0);
    out.push({ k: 'in', tone: 'ok', title: `${botName} נמצא ב-${num(s.guildTotal ?? G.length)} שרתים`, text: `כ-${num(members)} חברים בסך הכל, כ-${num(online)} מחוברים עכשיו (מספרים משוערים של Discord).` });
    const msgs = G.flatMap((g) => Object.values(g.messages || {}).filter(good).flat());
    const hidden = msgs.filter((m) => m.hidden).length;
    if (msgs.length && hidden / msgs.length > 0.5) out.push({ k: 'hidden', tone: 'warn', title: 'רוב ההודעות מגיעות ריקות', text: `${num(hidden)} מתוך ${num(msgs.length)} הודעות בלי תוכן. זה מה ש-Discord שולח כש-Message Content intent כבוי בפורטל.` });
    const last = msgs.map((m) => m.at).filter(Boolean).sort().pop();
    if (last) out.push({ k: 'last', tone: 'info', title: 'ההודעה האחרונה שהבוט רואה', text: `נכתבה ${rel(last)} (${when(last)}).` });
  }
  const global = s.commands?.global;
  const guildCmds = good(G) ? G.map((g) => g.commands).filter(good).flat() : [];
  if (s.bot && isFail(global)) out.push({ k: 'cfail', tone: 'warn', title: 'לא הצלחנו לקרוא את פקודות הסלאש', text: global.reason });
  else if (s.bot && good(global) && !global.length && !guildCmds.length) {
    out.push({ k: 'nocmd', tone: 'warn', title: 'אין אף פקודת סלאש רשומה', text: 'גם לא גלובלית וגם לא בשרת. אנשים שיקלידו "/" לא יראו שום פקודה של הבוט עד שהקוד שלו ירשום אותן.' });
  }
  if (a?.intents && !a.intents.content && out.length < 4) out.push({ k: 'intent', tone: 'info', title: 'Message Content intent כבוי', text: 'גם בשרת, הבוט יקבל הודעות בלי הטקסט שלהן (חוץ מהודעות שמתייגות אותו). מדליקים ב-Developer Portal ← Bot.' });
  if (a && !arr(a.scopes).includes('bot') && out.length < 4) out.push({ k: 'scope', tone: 'info', title: 'כפתור "הוספת אפליקציה" בפרופיל לא מוסיף את הבוט', text: 'ההתקנה שמוגדרת באפליקציה כוללת רק applications.commands, בלי bot. לכן משתמשים בקישור ההזמנה של הלוח.' });
  if (out.length < 2) out.push({ k: 'presence', tone: 'info', title: 'מצב "מחובר" של הבוט לא נראה מכאן', text: s.presence?.why || 'נוכחות נקראת רק דרך Gateway.' });
  return out.slice(0, 4);
}

// ---------- client state (which server and channel are open) ----------
const view = { g: null, c: null, draft: '' };
function pick(s) {
  const G = good(s.guilds) ? s.guilds : [];
  const g = view.g === '__home' ? null : G.find((x) => x.id === view.g) || G[0] || null;
  const chans = g && good(g.channels) ? g.channels : [];
  const text = chans.filter((c) => TEXT.has(c.type));
  const c = text.find((x) => x.id === view.c) || text.find((x) => good(g?.messages?.[x.id]) && g.messages[x.id].length) || text[0] || null;
  return { G, g, chans, c };
}

// ---------- glyphs (drawn here, not Discord's artwork) ----------
const svg = (d, size = 20, extra = '') => raw(`<svg class="dc-gl" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`);
const GL = {
  hash: '<path d="M10 4 8 20M16 4l-2 16M5 9h15M4 15h15"/>',
  speaker: '<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  mega: '<path d="M3 10v4h3l8 5V5L6 10H3Z"/><path d="M17 9v6M20 7v10"/>',
  forum: '<path d="M4 5h12v9H8l-4 3V5Z"/><path d="M16 9h4v9l-3-2h-6v-2"/>',
  stage: '<circle cx="12" cy="10" r="4"/><path d="M6 20a6 6 0 0 1 12 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21 20a6 6 0 0 0-3.5-5.5"/>',
  send: '<path d="m4 12 16-8-6 16-2.5-6.5L4 12Z"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1"/>',
  bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
};
const chIcon = (t) => (t === 2 ? GL.speaker : t === 5 ? GL.mega : t === 15 ? GL.forum : t === 13 ? GL.stage : GL.hash);
const initials = (name) => String(name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 3);
const av = (u, size = 40) => (u?.avatarUrl ? html`<img class="dc-av" src="${u.avatarUrl}" alt="" width="${size}" height="${size}" loading="lazy" referrerpolicy="no-referrer">`
  : html`<span class="dc-av dc-av-i" style="width:${size}px;height:${size}px">${initials(u?.name)}</span>`);
const botTag = () => html`<span class="dc-tag">${svg('<path d="m5 12 4 4 10-10"/>', 10, 'stroke-width="3"')}BOT</span>`;

// ---------- the client ----------
function rail(s, g, G) {
  return html`<nav class="dc-rail" aria-label="שרתים">
    <button class="dc-rb dc-home ${g ? '' : 'on'}" data-act="dcHome" aria-label="הבית של הבוט" title="${s.identity?.username || 'הבית'}"><span class="dc-pill" aria-hidden="true"></span><span class="dc-ri">${mark('discord', 26)}</span></button>
    <i class="dc-sep" aria-hidden="true"></i>
    ${G.map((x) => html`<button class="dc-rb ${g?.id === x.id ? 'on' : ''}" data-k="g-${x.id}" data-act="dcGuild" data-id="${x.id}" title="${x.name}" aria-label="${x.name}" ${g?.id === x.id ? raw('aria-current="true"') : ''}>
      <span class="dc-pill" aria-hidden="true"></span>${x.iconUrl ? html`<img class="dc-ri" src="${x.iconUrl}" alt="" width="48" height="48" referrerpolicy="no-referrer">` : html`<span class="dc-ri dc-ri-t">${initials(x.name)}</span>`}</button>`)}
    ${s.inviteUrl ? html`<a class="dc-rb dc-add ${G.length ? '' : 'is-cta'}" href="${s.inviteUrl}" target="_blank" rel="noopener noreferrer" title="הזמנת הבוט לשרת (נפתח ב-Discord)" aria-label="הזמנת הבוט לשרת"><span class="dc-ri">${svg(GL.plus, 22)}</span></a>` : ''}
  </nav>`;
}

function userPanel(s) {
  const me = ok(s.identity) ? s.identity : null;
  return html`<div class="dc-user" data-k="me">
    <span class="dc-av-w">${av({ avatarUrl: me?.avatarUrl, name: me?.username || s.app?.name }, 32)}<i class="dc-st dc-st-unk" title="מצב הנוכחות לא ניתן לקריאה ב-REST"></i></span>
    <span class="dc-un"><b>${me?.globalName || me?.username || s.app?.name || 'הבוט'}</b><small>${me ? html`<bdi class="mono">#${me.discriminator || '0'}</bdi>` : 'אין טוקן בוט'} · נוכחות לא ידועה</small></span>
  </div>`;
}

function side(s, g, chans, c) {
  if (!g) {
    const G = s.guilds;
    return html`<aside class="dc-side" aria-label="ניווט">
      <div class="dc-sh dc-sh-search"><span>${isFail(G) ? 'לא ידוע באילו שרתים הבוט' : 'אין שרת לפתוח'}</span></div>
      <div class="dc-list">
        <p class="dc-cat"><span>שרתים</span><b>${good(G) ? rn('dc-gcount', G.length, num(G.length)) : '—'}</b></p>
        ${good(G) ? html`${[70, 52, 62, 44].map((w, i) => html`<span class="dc-ghost" style="--w:${w}%" data-k="gh-${i}" aria-hidden="true"><i></i><em></em></span>`)}
          <p class="dc-empty-s">${good(G) && !G.length ? 'הבוט עוד לא בשום שרת. שרתים יופיעו כאן אחרי שמישהו יזמין אותו.' : ''}</p>`
          : html`<p class="dc-empty-s" dir="auto">${G?.reason || 'אין נתון.'}</p>`}
      </div>${userPanel(s)}</aside>`;
  }
  const cats = chans.filter((x) => x.type === 4);
  const loose = chans.filter((x) => x.type !== 4 && !x.parentId);
  const row = (x) => {
    const readable = TEXT.has(x.type);
    return html`<button class="dc-ch ${c?.id === x.id ? 'on' : ''} ${readable ? '' : 'is-dim'}" data-k="ch-${x.id}" ${readable ? raw(`data-act="dcChan" data-id="${x.id}"`) : raw('disabled')} title="${readable ? x.topic || x.name : 'ערוץ קולי או פורום: הלוח קורא רק ערוצי טקסט'}">
      ${svg(chIcon(x.type), 20)}<span>${x.name}</span>${readable && good(g.messages?.[x.id]) ? html`<small>${num(g.messages[x.id].length)}</small>` : ''}</button>`;
  };
  return html`<aside class="dc-side" aria-label="ערוצים">
    <div class="dc-sh"><b>${g.name}</b>${svg(GL.chev, 18)}</div>
    <div class="dc-list">
      ${isFail(chans) || isFail(g.channels) ? html`<p class="dc-empty-s" dir="auto">${g.channels.reason}</p>` : ''}
      ${loose.map(row)}
      ${cats.map((cat) => html`<div class="dc-catg" data-k="cat-${cat.id}"><p class="dc-cat">${svg(GL.chev, 12)}<span>${cat.name}</span></p>
        ${chans.filter((x) => x.parentId === cat.id).map(row)}</div>`)}
      ${good(g.channels) && !g.channels.length ? html`<p class="dc-empty-s">אין ערוצים שהבוט רשאי לראות בשרת הזה.</p>` : ''}
    </div>${userPanel(s)}</aside>`;
}

function messages(list) {
  const sorted = [...list].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  let prev = null; let day = '';
  return sorted.map((m) => {
    const d = String(m.at || '').slice(0, 10);
    const divider = d && d !== day ? html`<div class="dc-day" data-k="day-${d}" role="separator"><span>${new Date(m.at).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>` : '';
    const grouped = prev && divider === '' && prev.author?.id === m.author?.id && Date.parse(m.at) - Date.parse(prev.at) < 7 * 60000;
    day = d || day; prev = m;
    const body = m.hidden ? html`<p class="dc-hidden">${svg(GL.lock, 14)}התוכן לא הגיע: Message Content intent כבוי</p>`
      : html`${m.content ? html`<p class="dc-tx" dir="auto">${m.content}</p>` : ''}${m.attachments ? html`<p class="dc-att">${num(m.attachments)} קבצים מצורפים</p>` : ''}${m.embeds ? html`<p class="dc-att">${num(m.embeds)} תצוגות מקדימות (embed)</p>` : ''}`;
    return html`${divider}<article class="dc-msg ${grouped ? 'is-grp' : ''}" data-k="m-${m.id}">
      ${grouped ? html`<time class="dc-hov" datetime="${m.at}">${new Date(m.at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</time>` : av(m.author, 40)}
      <div class="dc-mb">${grouped ? '' : html`<p class="dc-mh"><b>${m.author?.name || 'לא ידוע'}</b>${m.author?.bot ? botTag() : ''}<time datetime="${m.at}" title="${when(m.at)}">${when(m.at)}</time>${m.edited ? html`<small>(נערך)</small>` : ''}</p>`}${body}</div>
    </article>`;
  });
}

function chat(s, g, c) {
  const me = ok(s.identity) ? s.identity : null;
  if (!g) {
    const G = s.guilds;
    return html`<main class="dc-chat" aria-label="תוכן">
      <header class="dc-ch-h">${svg(GL.at, 22)}<b>${me?.username || s.app?.name || 'הבוט'}</b>${me?.bot ? botTag() : ''}</header>
      <div class="dc-scroll"><div class="dc-empty" data-k="empty">
        <span class="dc-empty-art" aria-hidden="true">${mark('discord', 56)}<i></i><i></i><i></i></span>
        ${isFail(G) ? html`<h3>לא הצלחנו לבדוק באילו שרתים הבוט נמצא</h3><p dir="auto">${G.reason}</p>`
          : !s.bot ? html`<h3>אין טוקן בוט</h3><p>בלי DISCORD_BOT_TOKEN ב-‎.env הלוח רואה רק את הפרופיל הציבורי של האפליקציה.</p>`
            : html`<h3>אין כאן אף אחד עדיין</h3><p>${me?.username || 'הבוט'} לא נמצא באף שרת, אז אין ערוצים ואין הודעות. כשמישהו יזמין אותו, השרת יופיע בסרגל בצד והערוצים שלו כאן.</p>`}
        ${s.inviteUrl ? html`<a class="dc-btn" href="${s.inviteUrl}" target="_blank" rel="noopener noreferrer">${svg(GL.plus, 16)}<span>להזמין את הבוט לשרת</span>${icon('ext', 13)}</a>
          <p class="dc-fine">נפתח ב-Discord. בוחרים שרת ומאשרים שם. הלוח לא מאשר כלום בעצמו.</p>` : ''}
      </div></div>
      ${composer(null, null)}
    </main>`;
  }
  const list = c ? g.messages?.[c.id] : null;
  return html`<main class="dc-chat" aria-label="הודעות">
    <header class="dc-ch-h">${svg(chIcon(c?.type), 22)}<b>${c?.name || 'אין ערוץ טקסט'}</b>${c?.topic ? html`<i class="dc-div" aria-hidden="true"></i><span class="dc-topic" dir="auto">${c.topic}</span>` : ''}</header>
    <div class="dc-scroll" role="log" aria-label="הודעות אחרונות">
      ${!c ? html`<div class="dc-empty" data-k="noc"><h3>אין ערוץ טקסט שהבוט רואה</h3><p>בשרת הזה אין ערוץ טקסט שהבוט רשאי לקרוא.</p></div>`
        : isFail(list) ? html`<div class="dc-empty" data-k="mfail"><h3>לא הצלחנו לקרוא את ההודעות</h3><p dir="auto">${list.reason}</p></div>`
          : !good(list) ? html`<div class="dc-empty" data-k="mnone"><h3>ההודעות של הערוץ הזה לא נטענו מראש</h3><p>הלוח טוען מראש עד 8 ערוצי טקסט בכל שרת.</p></div>`
            : !list.length ? html`<div class="dc-empty dc-welcome" data-k="mzero"><span class="dc-wi">${svg(GL.hash, 40)}</span><h3>ברוכים הבאים ל-#${c.name}</h3><p>זו תחילת הערוץ. עוד אין בו הודעות.</p></div>`
              : html`<div class="dc-msgs">${messages(list)}</div>`}
    </div>
    ${composer(c, g)}
  </main>`;
}

function composer(c, g) {
  const can = Boolean(c);
  return html`<form class="dc-comp" data-keep="comp-${c?.id || 'none'}" onsubmit="return false">
    <label class="dc-sr" for="dc-msg">${can ? `הודעה ל-#${c.name}` : 'אין ערוץ לשלוח אליו'}</label>
    <textarea id="dc-msg" rows="1" maxlength="2000" dir="auto" data-key="dcKey" data-input="dcDraft" ${can ? '' : raw('disabled')} placeholder="${can ? `הודעה ל-#${c.name}` : 'אין ערוץ לשלוח אליו'}"></textarea>
    <button type="button" class="dc-send" data-act="dcSend" ${can ? raw(`data-ch="${c.id}"`) : raw('disabled')} aria-label="שליחה (עם אישור)">${svg(GL.send, 20)}</button>
    <p class="dc-hint">${can ? html`כל שליחה נפתחת בחלון אישור. במצב ניסוי רואים בדיוק מה יישלח, בלי לשלוח. תיוגים (@) לא יתייגו אף אחד.` : 'השליחה תיפתח כשהבוט יהיה בשרת עם ערוץ טקסט.'}</p>
  </form>`;
}

function members(s, g) {
  const me = ok(s.identity) ? s.identity : null;
  if (!g) {
    return html`<aside class="dc-mem" aria-label="חברים">
      <p class="dc-cat"><span>בוט — 1</span></p>
      <div class="dc-mi" data-k="mem-me"><span class="dc-av-w">${av({ avatarUrl: me?.avatarUrl, name: me?.username || s.app?.name }, 32)}<i class="dc-st dc-st-unk"></i></span>
        <span class="dc-un"><b>${me?.username || s.app?.name || 'הבוט'}</b>${botTag()}<small>נוכחות לא ידועה (REST בלבד)</small></span></div>
      <p class="dc-empty-s">אין שרת, אז אין רשימת חברים.</p></aside>`;
  }
  const M = g.memberList;
  const list = good(M) ? M : [];
  const bots = list.filter((m) => m.bot); const people = list.filter((m) => !m.bot);
  const item = (m) => html`<div class="dc-mi" data-k="mem-${m.id}"><span class="dc-av-w">${av(m, 32)}</span><span class="dc-un"><b>${m.name || '—'}</b>${m.bot ? botTag() : ''}</span></div>`;
  return html`<aside class="dc-mem" aria-label="חברים">
    <p class="dc-cat"><span>חברים — ${isNum(g.members) ? rn(`dc-mem-${g.id}`, g.members, num(g.members)) : '—'}</span></p>
    ${isNum(g.online) ? html`<p class="dc-empty-s">כ-${num(g.online)} מחוברים עכשיו (משוער)</p>` : ''}
    ${isFail(M) ? html`<p class="dc-empty-s" dir="auto">${M.status === 403 ? 'Discord לא נותן לבוט לקרוא את רשימת החברים: צריך להדליק Server Members intent בפורטל.' : M.reason}</p>` : ''}
    ${bots.length ? html`<p class="dc-cat"><span>בוטים — ${num(bots.length)}</span></p>${bots.map(item)}` : ''}
    ${people.length ? html`<p class="dc-cat"><span>אנשים — ${num(people.length)}</span></p>${people.map(item)}` : ''}
  </aside>`;
}

// ---------- detail cards (Developer Portal) ----------
const yes = (on, a, b) => html`<span class="dc-pill2 ${on ? 'is-on' : ''}">${on ? a : b}</span>`;
function cmdList(list, empty) {
  if (isFail(list)) return html`<p class="dc-note is-warn" dir="auto">${list.reason}</p>`;
  if (!good(list) || !list.length) return html`<p class="dc-note">${empty}</p>`;
  return html`<ul class="dc-cmds">${list.map((c) => html`<li data-k="cmd-${c.id}"><bdi class="mono">/${c.name}</bdi><span dir="auto">${c.description || ''}</span></li>`)}</ul>`;
}

function details(s) {
  const a = ok(s.app) ? s.app : null; const gw = ok(s.gateway) ? s.gateway : null;
  const G = good(s.guilds) ? s.guilds : [];
  const it = a?.intents;
  return html`<section class="dc-cards" aria-label="פרטי הבוט">
    <article class="dc-card" data-k="app"><h3>${svg(GL.bolt, 18)}האפליקציה</h3>
      ${isFail(s.app) ? html`<p class="dc-note is-warn" dir="auto">${s.app.reason}</p>` : html`
      <div class="dc-apph">${a?.iconUrl ? html`<img src="${a.iconUrl}" alt="" width="56" height="56" class="dc-av">` : html`<span class="dc-av dc-av-i" style="width:56px;height:56px">${initials(a?.name)}</span>`}
        <div><b>${a?.name || '—'}</b><small><bdi class="mono">${a?.id || ''}</bdi></small></div></div>
      <p class="dc-desc" dir="auto">${a?.description || 'אין תיאור לאפליקציה.'}</p>
      <dl class="dc-kv">
        <div><dt>מי יכול להזמין</dt><dd>${yes(a?.botPublic, 'כל אחד (ציבורי)', 'רק הבעלים')}</dd></div>
        <div><dt>מאומתת</dt><dd>${yes(a?.verified, 'כן', 'לא')}</dd></div>
        <div><dt>שרתים (לפי Discord)</dt><dd>${isNum(a?.guildCount) ? rn('dc-appg', a.guildCount, num(a.guildCount)) : '—'}</dd></div>
        <div><dt>התקנות אישיות</dt><dd>${isNum(a?.userInstallCount) ? rn('dc-appu', a.userInstallCount, num(a.userInstallCount)) : '—'}</dd></div>
        <div><dt>התקנה מהפרופיל</dt><dd>${arr(a?.scopes).map((x) => html`<bdi class="mono dc-code">${x}</bdi> `)}</dd></div>
      </dl>`}
      <p class="dc-row">${extBtn(s.portalUrl, 'Developer Portal', 'btn-sm')}</p></article>

    <article class="dc-card" data-k="invite"><h3>${svg(GL.plus, 18)}קישור הזמנה</h3>
      ${s.inviteUrl ? html`<p class="dc-desc">הקישור נבנה ממזהה האפליקציה. הוא מבקש מ-Discord לצרף את הבוט עם:</p>
        <ul class="dc-perms">${PERMS.map(([he, en]) => html`<li data-k="p-${en}">${svg('<path d="m5 12 4 4 10-10"/>', 14)}<span>${he}</span><bdi class="mono">${en}</bdi></li>`)}</ul>
        <p class="dc-desc">ועם ההרשאות <bdi class="mono">bot</bdi> ו-<bdi class="mono">applications.commands</bdi>. בלי הרשאת מנהל ובלי מחיקה.</p>
        <bdi class="dc-url mono" dir="ltr">${s.inviteUrl}</bdi>
        <p class="dc-row"><a class="dc-btn" href="${s.inviteUrl}" target="_blank" rel="noopener noreferrer"><span>פתיחת ההזמנה ב-Discord</span>${icon('ext', 13)}</a></p>
        <p class="dc-fine">רק קישור. שום דבר לא מאושר מכאן.</p>` : html`<p class="dc-note">אין מזהה אפליקציה, אז אי אפשר לבנות קישור.</p>`}</article>

    <article class="dc-card" data-k="cmds"><h3>${svg('<path d="m7 20 10-16"/>', 18)}פקודות סלאש</h3>
      <p class="dc-cat"><span>גלובליות</span><b>${good(s.commands?.global) ? num(s.commands.global.length) : '—'}</b></p>
      ${cmdList(s.commands?.global, s.bot ? 'אין פקודות גלובליות רשומות.' : 'אין טוקן בוט, אז אי אפשר לקרוא.')}
      ${G.map((g) => html`<div data-k="cg-${g.id}"><p class="dc-cat"><span>${g.name}</span><b>${good(g.commands) ? num(g.commands.length) : '—'}</b></p>${cmdList(g.commands, 'אין פקודות שרשומות רק לשרת הזה.')}</div>`)}
      ${good(s.guilds) && !G.length ? html`<p class="dc-note">פקודות לפי שרת יופיעו כשהבוט יהיה בשרת.</p>` : ''}</article>

    <article class="dc-card" data-k="intents"><h3>${svg(GL.lock, 18)}Privileged Gateway Intents</h3>
      ${it ? html`<dl class="dc-kv">
        <div><dt>Presence</dt><dd>${yes(it.presence, 'דלוק', 'כבוי')}</dd></div>
        <div><dt>Server Members</dt><dd>${yes(it.members, 'דלוק', 'כבוי')}</dd></div>
        <div><dt>Message Content</dt><dd>${yes(it.content, 'דלוק', 'כבוי')}</dd></div></dl>
        <p class="dc-fine">נקרא מדגלי האפליקציה. משנים רק ב-Developer Portal ← Bot.</p>` : html`<p class="dc-note">לא ידוע (צריך טוקן בוט).</p>`}</article>

    <article class="dc-card" data-k="gw"><h3>${svg('<path d="M4 12h4l3-7 4 14 3-7h2"/>', 18)}חיבור Gateway</h3>
      ${gw ? html`<dl class="dc-kv">
        <div><dt>התחברויות שנותרו היום</dt><dd>${isNum(gw.remaining) ? rn('dc-gwr', gw.remaining, num(gw.remaining)) : '—'} / ${num(gw.total)}</dd></div>
        <div><dt>Shards מומלצים</dt><dd>${num(gw.shards)}</dd></div>
        <div><dt>התחברויות במקביל</dt><dd>${num(gw.maxConcurrency)}</dd></div></dl>
        <p class="dc-fine">${gw.remaining === gw.total ? 'אף התחברות לא נוצלה ב-24 השעות האחרונות, כלומר הבוט כנראה לא רץ עכשיו (מסקנה, לא מדידה של נוכחות).' : 'חלק מההתחברויות נוצלו, כלומר תהליך כלשהו חיבר את הבוט לאחרונה.'}</p>`
        : html`<p class="dc-note ${isFail(s.gateway) ? 'is-warn' : ''}" dir="auto">${s.gateway?.reason || 'לא ידוע.'}</p>`}</article>

    <article class="dc-card" data-k="presence"><h3><i class="dc-st dc-st-unk dc-st-inline"></i>נוכחות (Presence)</h3>
      <p class="dc-desc" dir="auto">${s.presence?.why || 'נוכחות נקראת רק דרך Gateway.'}</p></article>
  </section>`;
}

function conclusions(list) {
  return html`<section class="dc-concl" data-k="concl" aria-label="מסקנות">${list.map((c) => html`<article class="dc-cc is-${c.tone}" data-k="cc-${c.k}"><b>${c.title}</b><p dir="auto">${c.text}</p></article>`)}</section>`;
}

export default {
  id: 'discord', title: 'Discord', nav: 'Discord', brand: 'discord', needs: ['discord'],
  sub: 'הבוט AppleAI כמו שהוא נראה בתוך Discord: השרתים, הערוצים, ההודעות והפקודות שלו',
  links: (d) => [{ label: 'Developer Portal', url: d.discord?.portalUrl }].filter((l) => l.url),
  render(d) {
    const s = d.discord || {};
    const list = infer(s);
    if (s.ok === false || !s.configured) return html`${conclusions(list)}`;
    const { G, g, chans, c } = pick(s);
    const msgs = G.flatMap((x) => Object.values(x.messages || {}).filter(good).flat()).length;
    const cmdN = (good(s.commands?.global) ? s.commands.global.length : 0) + G.reduce((t, x) => t + (good(x.commands) ? x.commands.length : 0), 0);
    return html`${conclusions(list)}
      <section class="dc-stats" data-k="stats" aria-label="מדדים">
        <div class="dc-stat" data-k="s-g"><small>שרתים</small><b>${good(s.guilds) ? rn('dc-s-g', s.guildTotal ?? G.length, num(s.guildTotal ?? G.length)) : '—'}</b></div>
        <div class="dc-stat" data-k="s-c"><small>ערוצים</small><b>${rn('dc-s-c', G.reduce((t, x) => t + (good(x.channels) ? x.channels.length : 0), 0), num(G.reduce((t, x) => t + (good(x.channels) ? x.channels.length : 0), 0)))}</b></div>
        <div class="dc-stat" data-k="s-m"><small>הודעות שנקראו</small><b>${rn('dc-s-m', msgs, num(msgs))}</b></div>
        <div class="dc-stat" data-k="s-x"><small>פקודות סלאש</small><b>${rn('dc-s-x', cmdN, num(cmdN))}</b></div>
      </section>
      <section class="dc-app" data-k="client" aria-label="חלון Discord של הבוט">
        ${rail(s, g, G)}${side(s, g, chans, c)}${chat(s, g, c)}${members(s, g)}
      </section>
      ${details(s)}`;
  },
  actions: {
    dcHome(el, ctx) { view.g = '__home'; view.c = null; ctx.rerender(); },
    dcGuild(el, ctx) { view.g = el.dataset.id; view.c = null; ctx.rerender(); },
    dcChan(el, ctx) { view.c = el.dataset.id; ctx.rerender(); ctx.root.querySelector('#dc-msg')?.focus(); },
    dcDraft(el) { view.draft = el.value; },
    dcKey(el, ctx, e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ctx.root.querySelector('.dc-send')?.click(); } },
    async dcSend(el, ctx) {
      const s = ctx.data?.discord || {}; const { g, c } = pick(s);
      const box = ctx.root.querySelector('#dc-msg'); const text = (box?.value || '').trim();
      if (!c || c.id !== el.dataset.ch) return;
      if (!text) { ctx.toast('כתבו הודעה לפני השליחה.', 'bad', 'ההודעה ריקה'); box?.focus(); return; }
      if (text.length > 2000) { ctx.toast(`ההודעה ארוכה מ-2000 תווים (${text.length}).`, 'bad', 'ארוך מדי'); return; }
      const res = await ctx.act(send(c, text, g?.name));
      if (res && res.ok !== false && !res.dryRun && box) { box.value = ''; view.draft = ''; }
    },
  },
};
