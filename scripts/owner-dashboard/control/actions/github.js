// GitHub page actions beyond the shell's catalogue (control/actions.js keeps rerun, cancel, dispatch,
// workflow on/off, settings, approve and close PR). Everything goes through app.act: a Primer Dialog
// that names the change and the way back, then the POST, then a toast. The server re-checks every id,
// state and label (cc/platforms/github.mjs), so a stale button cannot merge a closed PR or add a label
// the repo does not have. Merge is the one write with no undo button: it is marked danger and says
// that the way back is a revert commit. No branch, release or repo deletes exist here.
import { gh } from '../actions.js';

const P = '/api/cc/github/action';
const REASON = { completed: 'הושלם', not_planned: 'לא מתוכנן' };

export const ghx = {
  mergePr: (p) => ({ id: `gh-merge-${p.number}`, platform: 'github', label: `מיזוג PR #${p.number} (squash)`, hint: 'PR · מיזוג',
    title: `למזג את PR #${p.number} לענף ${p.base || 'הראשי'}?`,
    what: `כל הקומיטים של "${p.title}" יימחצו לקומיט אחד (squash) שייכנס ל-${p.base || 'main'}.`,
    undo: 'אין ביטול למיזוג. הדרך לחזור היא Revert: קומיט חדש שמבטל את קומיט המיזוג (כפתור Revert ב-PR ב-GitHub).',
    reversible: false, danger: true, confirmLabel: 'כן, למזג', path: P, body: { kind: 'merge-pr', id: p.number }, okMsg: 'ה-PR מוזג.' }),
  reopenPr: (p) => ({ id: `gh-reopen-${p.number}`, platform: 'github', label: `פתיחה מחדש של PR #${p.number}`, hint: 'PR',
    title: `לפתוח מחדש את PR #${p.number}?`, what: `"${p.title}" יחזור לרשימת ה-PR הפתוחים, עם אותו ענף ואותם קומיטים.`,
    undo: 'אפשר לסגור אותו שוב בלחיצה.', path: P, body: { kind: 'reopen-pr', id: p.number }, okMsg: 'ה-PR נפתח מחדש.' }),
  closeIssue: (i, reason) => ({ id: `gh-iclose-${i.number}-${reason}`, platform: 'github', label: `סגירת issue #${i.number} (${REASON[reason]})`, hint: 'Issue',
    title: `לסגור את issue #${i.number} בתור "${REASON[reason]}"?`,
    what: `"${i.title}" ייסגר עם הסיבה "${REASON[reason]}" (${reason}). התגובות והתוויות נשארות.`,
    undo: 'אפשר לפתוח אותו מחדש בלחיצה.', path: P, body: { kind: 'close-issue', id: i.number, reason }, okMsg: 'ה-issue נסגר.' }),
  reopenIssue: (i) => ({ id: `gh-ireopen-${i.number}`, platform: 'github', label: `פתיחה מחדש של issue #${i.number}`, hint: 'Issue',
    title: `לפתוח מחדש את issue #${i.number}?`, what: `"${i.title}" יחזור לרשימה הפתוחה (סיבה: reopened).`,
    undo: 'אפשר לסגור אותו שוב בלחיצה.', path: P, body: { kind: 'reopen-issue', id: i.number }, okMsg: 'ה-issue נפתח מחדש.' }),
  addLabel: (item, label) => ({ id: `gh-lbl+${item.number}-${label}`, platform: 'github', label: `תווית "${label}" ל-#${item.number}`, hint: 'תווית',
    title: `להוסיף את התווית "${label}" ל-#${item.number}?`, what: `התווית "${label}" תוצמד ל-"${item.title}". התוויות האחרות נשארות.`,
    undo: 'לחיצה על ה-× שליד התווית מסירה אותה.', path: P, body: { kind: 'add-label', id: item.number, label }, okMsg: `התווית "${label}" נוספה.` }),
  removeLabel: (item, label) => ({ id: `gh-lbl-${item.number}-${label}`, platform: 'github', label: `הסרת "${label}" מ-#${item.number}`, hint: 'תווית',
    title: `להסיר את התווית "${label}" מ-#${item.number}?`, what: `התווית "${label}" תורד מ-"${item.title}". התווית עצמה נשארת ברשימת התוויות של הריפו.`,
    undo: 'אפשר להוסיף אותה שוב מהתפריט "תווית".', path: P, body: { kind: 'remove-label', id: item.number, label }, okMsg: `התווית "${label}" הוסרה.` }),
};

/** Palette entries from the last GitHub read: open PRs (approve, merge, close), closed PRs (reopen), issues. */
export function catalog(seen = {}) {
  const g = seen.github; if (!g || g.ok === false) return [];
  const out = [];
  for (const p of Array.isArray(g.pulls) ? g.pulls : []) {
    if (p.state === 'open') {
      out.push(gh.approvePr(p));
      if (!p.draft && p.mergeable !== 'conflicting') out.push(ghx.mergePr(p));
      out.push(gh.closePr(p));
    } else if (p.state === 'closed') out.push(ghx.reopenPr(p));
  }
  for (const i of Array.isArray(g.issues) ? g.issues : []) {
    if (i.state === 'open') out.push(ghx.closeIssue(i, 'completed'), ghx.closeIssue(i, 'not_planned'));
    else out.push(ghx.reopenIssue(i));
  }
  return out;
}
