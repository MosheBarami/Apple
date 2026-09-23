// The one-click action catalogue. Every entry is a spec for app.act(): a Hebrew modal that says
// exactly what changes and how to undo it, then the POST (session token + confirm:true), then a
// toast with the real answer. Only reversible, non-destructive writes live here: no deletes of
// production resources, no payments, no key rotation, no auth/RLS/security settings, no accounts.
// The Worker kill switch exists upstream and is deliberately absent.

export const GH_SETTINGS = {
  delete_branch_on_merge: ['מחיקת ענף אוטומטית אחרי מיזוג', 'אחרי שמאשרים PR, הענף שלו נמחק לבד (אפשר לשחזר אותו מה-PR)'],
  allow_auto_merge: ['מיזוג אוטומטי', 'PR ימוזג לבד ברגע שכל הבדיקות עוברות'],
  allow_update_branch: ['כפתור "עדכון ענף"', 'ב-PR יופיע כפתור שמושך את השינויים האחרונים מ-main'],
  has_issues: ['Issues', 'לשונית לדיווח תקלות ומשימות'],
  has_wiki: ['Wiki', 'לשונית של דפי תיעוד'],
  has_projects: ['Projects', 'לוחות משימות בסגנון קנבן'],
  has_discussions: ['Discussions', 'לשונית דיונים פתוחים'],
};

const P = (platform) => `/api/cc/${platform}/action`;

/** Specs rendered on a page, so a button can carry just data-aid and app.js finds the spec. */
export const REG = new Map();
export const aid = (spec) => { REG.set(spec.id, spec); return spec.id; };

export const gh = {
  rerun: (r) => ({ id: `gh-rerun-${r.id}`, platform: 'github', label: `הרצה מחדש: ${r.name}`, hint: 'CI',
    title: `להריץ מחדש את "${r.name}"?`, what: `GitHub יריץ שוב את כל השלבים של הריצה #${r.id} על הענף ${r.branch}.`,
    undo: 'אפשר לבטל את הריצה באמצע בלחיצה על "ביטול".', path: P('github'), body: { kind: 'rerun', id: r.id }, okMsg: 'הריצה נשלחה שוב. היא תופיע כאן תוך כמה שניות.' }),
  rerunFailed: (r) => ({ id: `gh-rerunf-${r.id}`, platform: 'github', label: `להריץ שוב רק מה שנכשל ב-${r.name}`, hint: 'CI · נכשל',
    title: 'להריץ שוב רק את השלבים שנכשלו?', what: `רק השלבים שנכשלו בריצה #${r.id} (${r.name}, ענף ${r.branch}) ירוצו שוב. מה שעבר לא ירוץ.`,
    undo: 'אפשר לבטל את הריצה באמצע.', path: P('github'), body: { kind: 'rerun-failed', id: r.id }, okMsg: 'השלבים שנכשלו נשלחו להרצה חוזרת.' }),
  cancel: (r) => ({ id: `gh-cancel-${r.id}`, platform: 'github', label: `ביטול הריצה: ${r.name}`, hint: 'CI · רץ',
    title: 'לעצור את הריצה?', what: `GitHub יעצור את הריצה #${r.id} (${r.name}) באמצע.`, undo: 'אפשר להריץ אותה מחדש בכל רגע.',
    path: P('github'), body: { kind: 'cancel', id: r.id }, okMsg: 'הריצה בוטלה.' }),
  dispatch: (w) => ({ id: `gh-dispatch-${w.id}`, platform: 'github', label: `הפעלה ידנית: ${w.name}`, hint: 'Workflow',
    title: `להפעיל עכשיו את "${w.name}"?`, what: `GitHub יתחיל ריצה חדשה של ${w.path || w.name} על הענף הראשי. זה עובד רק אם ה-workflow מוגדר להפעלה ידנית (workflow_dispatch).`,
    undo: 'אפשר לבטל את הריצה באמצע.', path: P('github'), body: { kind: 'dispatch', id: String(w.id) }, okMsg: 'ה-workflow הופעל.' }),
  wfToggle: (w) => {
    const on = w.state === 'active';
    return { id: `gh-wf-${w.id}`, platform: 'github', label: `${on ? 'השבתת' : 'הפעלת'} ${w.name}`, hint: 'Workflow',
      title: on ? `להשבית את "${w.name}"?` : `להפעיל מחדש את "${w.name}"?`,
      what: on ? 'ה-workflow יפסיק לרוץ אוטומטית (על push או לפי שעון) עד שתפעילו אותו שוב.' : 'ה-workflow יחזור לרוץ אוטומטית כמו קודם.',
      undo: `לחיצה נוספת על אותו מתג ${on ? 'מפעילה' : 'משביתה'} אותו שוב.`, path: P('github'), body: { kind: on ? 'wf-disable' : 'wf-enable', id: w.id },
      okMsg: on ? 'ה-workflow הושבת.' : 'ה-workflow הופעל.' };
  },
  setting: (key, cur) => {
    const [name, what] = GH_SETTINGS[key] || [key, ''];
    return { id: `gh-set-${key}`, platform: 'github', label: `${cur ? 'כיבוי' : 'הדלקת'}: ${name}`, hint: 'הגדרת ריפו',
      title: `${cur ? 'לכבות' : 'להדליק'} את "${name}"?`, what: `${what}. ההגדרה תעבור מ-${cur ? 'דלוק' : 'כבוי'} ל-${cur ? 'כבוי' : 'דלוק'} בריפו.`,
      undo: 'לחיצה נוספת מחזירה את ההגדרה בדיוק כמו שהייתה.', path: P('github'), body: { kind: 'setting', key, value: !cur }, okMsg: `${name}: ${cur ? 'כבוי' : 'דלוק'}.` };
  },
  approvePr: (p) => ({ id: `gh-appr-${p.number}`, platform: 'github', label: `אישור PR #${p.number}`, hint: 'PR',
    title: `לאשר את PR #${p.number}?`, what: `תתווסף סקירה "Approve" ל-"${p.title}". זה לא ממזג אותו.`, undo: 'אפשר לבטל אישור מתוך GitHub (Dismiss review).',
    path: P('github'), body: { kind: 'approve-pr', id: p.number }, okMsg: 'ה-PR אושר.' }),
  closePr: (p) => ({ id: `gh-close-${p.number}`, platform: 'github', label: `סגירת PR #${p.number}`, hint: 'PR',
    title: `לסגור את PR #${p.number} בלי למזג?`, what: `"${p.title}" ייסגר. הקוד והענף נשארים.`, undo: 'אפשר לפתוח אותו מחדש בלחיצה (Reopen) ב-GitHub.',
    path: P('github'), body: { kind: 'close-pr', id: p.number }, okMsg: 'ה-PR נסגר.' }),
};

export const cf = {
  toggle: (kind, cur) => {
    const name = kind === 'logs' ? 'יומני הרצה (Logs)' : 'מעקב בקשות (Traces)';
    return { id: `cf-${kind}`, platform: 'cloudflare', label: `${cur ? 'כיבוי' : 'הדלקת'} ${name}`, hint: 'Worker apple',
      title: `${cur ? 'לכבות' : 'להדליק'} ${name} ב-Worker?`,
      what: kind === 'logs' ? `Cloudflare ${cur ? 'יפסיק לשמור' : 'ישמור'} את השורות שה-Worker כותב, כדי שאפשר יהיה לחפש בהן תקלות.`
        : `Cloudflare ${cur ? 'יפסיק לעקוב' : 'יעקוב'} אחרי כל בקשה מקצה לקצה (כמה זמן לקח כל שלב).`,
      undo: 'לחיצה נוספת מחזירה את המצב הקודם. הקוד של האתר לא משתנה.', path: P('cloudflare'), body: { kind, value: !cur },
      okMsg: `${name}: ${cur ? 'כבוי' : 'דלוק'}.` };
  },
};

export const hfx = {
  restart: (s) => ({ id: `hf-restart-${s.id}`, platform: 'huggingface', label: `הפעלה מחדש: ${s.id.split('/')[1]}`, hint: `Space · ${s.runtimeStage || ''}`,
    title: 'להפעיל מחדש את ה-Space?', what: `Hugging Face יבנה ויפעיל מחדש את ${s.id}. זה לוקח דקה-שתיים.`, undo: 'אין מה לבטל: ה-Space פשוט עולה מחדש.',
    path: P('hf'), body: { kind: 'restart', id: s.id }, okMsg: 'ה-Space נשלח להפעלה מחדש.' }),
  pause: (s) => ({ id: `hf-pause-${s.id}`, platform: 'huggingface', label: `השהיה: ${s.id.split('/')[1]}`, hint: 'Space',
    title: 'להשהות את ה-Space?', what: `${s.id} ייעצר ולא יענה עד שתפעילו אותו מחדש.`, undo: 'לחיצה על "הפעלה מחדש" מחזירה אותו.',
    path: P('hf'), body: { kind: 'pause', id: s.id }, okMsg: 'ה-Space הושהה.' }),
};

export const sx = {
  base: (i, kind, label, title, what, undo, okMsg) => ({ id: `st-${kind}-${i.id}`, platform: 'sentry', label, hint: i.shortId,
    title, what, undo, path: P('sentry'), body: { kind, id: i.id }, okMsg }),
  bookmark: (i) => sx.base(i, i.bookmarked ? 'unbookmark' : 'bookmark', `${i.bookmarked ? 'הסרת סימון' : 'סימון במועדפים'}: ${i.shortId}`,
    i.bookmarked ? 'להסיר את הסימון?' : 'לסמן את התקלה במועדפים?', `"${i.title}" ${i.bookmarked ? 'תצא מ' : 'תיכנס ל'}רשימת המועדפים שלכם ב-Sentry.`,
    'לחיצה נוספת מחזירה.', i.bookmarked ? 'הסימון הוסר.' : 'סומן במועדפים.'),
  seen: (i) => sx.base(i, 'seen', `סימון כנקראה: ${i.shortId}`, 'לסמן כנקראה?', `"${i.title}" תסומן כתקלה שכבר ראיתם.`, 'אין השפעה על התקלה עצמה.', 'סומן כנקרא.'),
  ignore: (i) => sx.base(i, 'ignore', `השתקה עד שתחמיר: ${i.shortId}`, 'להשתיק את התקלה?',
    `"${i.title}" תוסתר מהרשימה, ו-Sentry יחזיר אותה לבד אם היא תתחיל לקרות יותר.`, 'אפשר להחזיר אותה בלחיצה על "החזרה לפתוחות".', 'התקלה הושתקה.'),
  unresolve: (i) => sx.base(i, 'unresolve', `החזרה לפתוחות: ${i.shortId}`, 'להחזיר לרשימת הפתוחות?', `"${i.title}" תחזור להיות תקלה פתוחה.`, 'אפשר להשתיק שוב.', 'התקלה חזרה לפתוחות.'),
  resolve: (i) => sx.base(i, 'resolve', `סימון כתוקנה: ${i.shortId}`, 'לסמן שהתקלה תוקנה?',
    `"${i.title}" תסומן כפתורה. אם היא תקרה שוב, Sentry יפתח אותה מחדש.`, 'אפשר להחזיר אותה לפתוחות בלחיצה.', 'סומן כתוקן.'),
  priority: (i, p) => sx.base(i, `priority-${p}`, `עדיפות ${({ high: 'גבוהה', medium: 'בינונית', low: 'נמוכה' })[p]}: ${i.shortId}`,
    'לשנות עדיפות?', `העדיפות של "${i.title}" תשתנה מ-${i.priority || '—'} ל-${p}.`, 'אפשר להחזיר לעדיפות הקודמת.', 'העדיפות עודכנה.'),
};

export const sb = {
  backup: () => ({ id: 'sb-backup', platform: 'supabase', label: 'גיבוי כל הטבלאות למחשב', hint: 'קריאה בלבד',
    title: 'לגבות את מסד הנתונים למחשב?', what: 'כל טבלה ב-public תיקרא (קריאה בלבד, עד 50,000 שורות לטבלה) ותישמר כקובץ JSON בתיקייה ‎.backups שבפרויקט. שום דבר במסד לא משתנה.',
    undo: 'אין מה לבטל: זו קריאה בלבד. אפשר למחוק את התיקייה מהמחשב.', path: P('supabase'), body: { kind: 'backup' }, okMsg: 'הגיבוי נשמר ב-‎.backups.' }),
};

export const ph = {
  flag: (f) => ({ id: `ph-flag-${f.id}`, platform: 'posthog', label: `${f.active ? 'כיבוי' : 'הדלקת'} הדגל ${f.key}`, hint: 'Feature flag',
    title: `${f.active ? 'לכבות' : 'להדליק'} את הדגל "${f.key}"?`, what: `הדגל ${f.name ? `(${f.name}) ` : ''}יעבור ל-${f.active ? 'כבוי' : 'דלוק'} לכל המשתמשים שהוא חל עליהם.`,
    undo: 'לחיצה נוספת מחזירה.', path: '/api/cc/connectors/action', body: { id: 'posthog', kind: 'flag', target: String(f.id), value: !f.active }, okMsg: 'הדגל עודכן.' }),
};

/** Everything currently offerable, from whatever platform data is loaded. */
export function catalog(d = {}) {
  const out = [];
  const g = d.github;
  if (g && g.ok !== false) {
    const runs = g.runs || [];
    const failed = runs.find((r) => r.status === 'completed' && ['failure', 'timed_out', 'startup_failure'].includes(r.conclusion));
    if (failed) out.push(gh.rerunFailed(failed));
    const live = runs.find((r) => r.status !== 'completed'); if (live) out.push(gh.cancel(live));
    if (runs[0]) out.push(gh.rerun(runs[0]));
    for (const w of g.workflows || []) { out.push(gh.dispatch(w)); out.push(gh.wfToggle(w)); }
    for (const [k, v] of Object.entries(g.settings || {})) out.push(gh.setting(k, v));
  }
  const c = d.cloudflare;
  if (c?.settings) { out.push(cf.toggle('logs', !!c.settings.logs)); out.push(cf.toggle('traces', !!c.settings.traces)); }
  for (const s of d.hf?.spaces || []) { out.push(hfx.restart(s)); if (/RUNNING/.test(s.runtimeStage || '')) out.push(hfx.pause(s)); }
  const top = (d.sentry?.issues || [])[0];
  if (top) { out.push(sx.bookmark(top)); out.push(sx.ignore(top)); if (!top.seen) out.push(sx.seen(top)); }
  if (d.supabase && d.supabase.ok !== false) out.push(sb.backup());
  const phc = (d.connectors?.list || []).find((x) => x.id === 'posthog');
  for (const f of phc?.data?.flags || []) out.push(ph.flag(f));
  return out;
}
