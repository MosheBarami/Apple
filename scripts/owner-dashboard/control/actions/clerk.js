// Clerk action specs for app.act(): ban / unban / lock / unlock a user and revoke one session. Each is
// reversible, each opens the confirm modal first, and in dry-run mode the server answers with the
// exact call instead of sending it. No delete, no impersonation, no sign-in token, no setting.
const PATH = '/api/cc/clerk/action';
const who = (u) => u.name || u.email || u.username || u.id;

const user = (u, kind, label, title, what, undo, okMsg, danger = false) => ({ id: `ck-${kind}-${u.id}`, platform: 'clerk', label: `${label}: ${who(u)}`,
  hint: 'Clerk · משתמש', title, what, undo, reversible: true, danger, path: PATH, body: { kind, id: u.id }, okMsg });

export const ck = {
  ban: (u) => user(u, 'ban', 'חסימה', `לחסום את ${who(u)}?`,
    `${who(u)} יתנתק מכל המכשירים ולא יוכל להתחבר עד שתשחררו את החסימה. החשבון והנתונים שלו נשארים כמו שהם.`,
    'לחיצה על "שחרור חסימה" מחזירה את הגישה מיד.', 'המשתמש נחסם.', true),
  unban: (u) => user(u, 'unban', 'שחרור חסימה', `לשחרר את החסימה של ${who(u)}?`, `${who(u)} יוכל להתחבר שוב כרגיל.`,
    'אפשר לחסום שוב בכל רגע.', 'החסימה שוחררה.'),
  lock: (u) => user(u, 'lock', 'נעילה', `לנעול את ${who(u)}?`,
    `${who(u)} לא יוכל להתחבר עד שהנעילה תשוחרר (Clerk משחרר נעילה לבד אחרי הזמן שמוגדר במופע).`,
    'לחיצה על "שחרור נעילה" מחזירה את הגישה מיד.', 'המשתמש ננעל.', true),
  unlock: (u) => user(u, 'unlock', 'שחרור נעילה', `לשחרר את הנעילה של ${who(u)}?`,
    `${who(u)} יוכל לנסות להתחבר שוב מיד, בלי לחכות שהנעילה תפוג.`, 'אפשר לנעול שוב בכל רגע.', 'הנעילה שוחררה.'),
  revoke: (s, u = {}) => ({ id: `ck-revoke-${s.id}`, platform: 'clerk', label: `ניתוק חיבור: ${[s.browser, s.device].filter(Boolean).join(' · ') || s.id}`,
    hint: 'Clerk · חיבור', title: 'לנתק את החיבור הזה?',
    what: `${who({ ...u, id: s.userId || s.id })} יתנתק במכשיר הזה (${[s.browser, s.device, s.city].filter(Boolean).join(', ') || s.id}). שאר החיבורים שלו לא נפגעים.`,
    undo: 'אין מה לבטל: המשתמש פשוט יתחבר שוב בפעם הבאה שייכנס.', reversible: true, path: PATH, body: { kind: 'revoke-session', id: s.id },
    okMsg: 'החיבור נותק. המשתמש יתחבר שוב בפעם הבאה.' }),
};

/** Palette entries: releasing whoever is banned or locked right now. */
export function catalog(seen = {}) {
  const d = seen.clerk; if (!d || d.ok === false || !Array.isArray(d.users?.list)) return [];
  const out = [];
  for (const u of d.users.list) { if (u.banned) out.push(ck.unban(u)); if (u.locked) out.push(ck.unlock(u)); }
  return out;
}
