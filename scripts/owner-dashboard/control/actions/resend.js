// Resend action specs. Nothing here deletes, rotates a key or changes billing. The test email goes
// only to OWNER_EMAIL from .env: the server picks the recipient, the browser never sends one.
const PATH = '/api/cc/resend/action';

export const rs = {
  verify: (d) => ({ id: `rs-verify-${d.id}`, platform: 'resend', label: `בדיקת DNS מחדש: ${d.name}`, hint: d.status || 'דומיין',
    title: `לבקש מ-Resend לבדוק שוב את ה-DNS של ${d.name}?`, what: 'Resend יחפש מחדש את רשומות ה-SPF, DKIM ו-MX. שום רשומה לא משתנה; רק הסטטוס מתעדכן.',
    undo: 'אין מה לבטל: זו בדיקה בלבד.', path: PATH, body: { kind: 'verify-domain', id: d.id }, okMsg: 'הבדיקה התחילה. הסטטוס יתעדכן בעוד כמה דקות.' }),
  tracking: (d, which, on) => ({ id: `rs-${which}-${d.id}`, platform: 'resend', label: `${on ? 'כיבוי' : 'הדלקת'} מעקב ${which === 'open' ? 'פתיחות' : 'קליקים'}: ${d.name}`,
    hint: 'דומיין', title: `${on ? 'לכבות' : 'להדליק'} מעקב ${which === 'open' ? 'פתיחות' : 'קליקים'} ב-${d.name}?`,
    what: which === 'open' ? `מיילים חדשים מ-${d.name} ${on ? 'לא יכילו' : 'יכילו'} פיקסל שמדווח מתי המייל נפתח.`
      : `קישורים במיילים חדשים מ-${d.name} ${on ? 'לא יעברו' : 'יעברו'} דרך Resend כדי לספור קליקים.`,
    undo: 'לחיצה נוספת מחזירה. מיילים שכבר נשלחו לא משתנים.', path: PATH, body: { kind: `${which}-tracking`, id: d.id, value: !on }, okMsg: 'הדומיין עודכן.' }),
  test: (t) => ({ id: 'rs-test-email', platform: 'resend', label: 'שליחת מייל ניסיון לבעלים', hint: t?.to || 'OWNER_EMAIL',
    title: 'לשלוח מייל ניסיון?', what: `מייל קצר אחד יישלח מ-${t?.from || 'onboarding@resend.dev'} אל ${t?.to || 'הכתובת ב-OWNER_EMAIL'} בלבד, כדי לוודא ש-Resend מוסר מיילים.`,
    undo: 'מייל שנשלח אי אפשר להחזיר; הוא הולך רק אליכם.', path: PATH,
    body: { kind: 'test-email', ...(t?.from && !t.from.endsWith('@resend.dev') ? { domain: t.from.split('@')[1] } : {}) }, okMsg: 'מייל הניסיון נשלח.' }),
};

export function catalog(seen = {}) {
  const r = seen.resend; if (!r || r.ok === false) return [];
  const out = [];
  for (const d of r.domains?.items || []) {
    if (!d.id) continue;
    if (d.status !== 'verified') out.push(rs.verify(d));
    if (typeof d.openTracking === 'boolean') out.push(rs.tracking(d, 'open', d.openTracking));
    if (typeof d.clickTracking === 'boolean') out.push(rs.tracking(d, 'click', d.clickTracking));
  }
  if (r.testEmail?.available) out.push(rs.test(r.testEmail));
  return out;
}
