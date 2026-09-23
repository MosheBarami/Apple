// Sentry action specs: one reversible issue update each (the server refuses any other kind). Ids match
// the shell's sx specs (st-<kind>-<issue>) so the palette never lists the same action twice.
const PATH = '/api/cc/sentry/action';
const PRI = { high: 'גבוהה', medium: 'בינונית', low: 'נמוכה' };
const t = (i) => `"${String(i.title || '').slice(0, 90)}"`;
const base = (i, kind, label, title, what, undo, okMsg) => ({ id: `st-${kind}-${i.id}`, platform: 'sentry', label, hint: i.shortId,
  title, what, undo, path: PATH, body: { kind, id: i.id }, okMsg });

export const sa = {
  resolve: (i) => base(i, 'resolve', `סימון כתוקנה: ${i.shortId}`, 'לסמן שהתקלה תוקנה?',
    `${t(i)} תסומן כפתורה ותצא מהרשימה. אם היא תקרה שוב, Sentry יפתח אותה מחדש כ"חזרה אחרי תיקון".`, 'אפשר להחזיר אותה לפתוחות מתוך Sentry או מהלוח.', 'סומן כתוקן.'),
  ignore: (i) => base(i, 'ignore', `השתקה עד שתחמיר: ${i.shortId}`, 'להשתיק את התקלה?',
    `${t(i)} תוסתר מהרשימה, ו-Sentry יחזיר אותה לבד אם היא תתחיל לקרות יותר.`, 'אפשר להחזיר אותה לפתוחות בכל רגע.', 'התקלה הושתקה.'),
  bookmark: (i) => base(i, i.bookmarked ? 'unbookmark' : 'bookmark', `${i.bookmarked ? 'הסרה ממועדפים' : 'סימון במועדפים'}: ${i.shortId}`,
    i.bookmarked ? 'להסיר מהמועדפים?' : 'לסמן במועדפים?', `${t(i)} ${i.bookmarked ? 'תצא מ' : 'תיכנס ל'}רשימת המועדפים שלכם ב-Sentry.`,
    'לחיצה נוספת מחזירה.', i.bookmarked ? 'הוסר מהמועדפים.' : 'סומן במועדפים.'),
  seen: (i) => base(i, 'seen', `סימון כנקראה: ${i.shortId}`, 'לסמן כנקראה?', `${t(i)} תסומן כתקלה שכבר ראיתם (הנקודה הסגולה תיעלם).`,
    'אין השפעה על התקלה עצמה.', 'סומן כנקרא.'),
  priority: (i, p) => base(i, `priority-${p}`, `עדיפות ${PRI[p]}: ${i.shortId}`, `לשנות את העדיפות ל${PRI[p]}?`,
    `העדיפות של ${t(i)} תשתנה מ${PRI[i.priority] || ' —'} ל${PRI[p]}.`, `אפשר להחזיר לעדיפות ${PRI[i.priority] || 'הקודמת'} באותה דרך.`, 'העדיפות עודכנה.'),
};

/** Palette: triage for the five noisiest open issues. */
export function catalog(seen = {}) {
  const iss = [...(seen.sentry?.issues || [])].filter((i) => /^\d+$/.test(String(i.id))).sort((a, b) => b.count - a.count).slice(0, 5);
  const out = [];
  for (const i of iss) {
    out.push(sa.resolve(i), sa.ignore(i), sa.bookmark(i));
    if (!i.seen) out.push(sa.seen(i));
    out.push(sa.priority(i, i.priority === 'high' ? 'medium' : 'high'));
  }
  return out;
}
