// Groq action specs. The only one is the latency probe: a one-token request that costs about
// $0.000006 and one of the key's daily requests. The server sends at most one per minute.
export const groqProbe = () => ({
  id: 'groq-probe', platform: 'groq', label: 'מדידת זמן תגובה של Groq עכשיו', hint: 'בקשה אחת קטנה',
  title: 'לשלוח בקשת בדיקה אחת ל-Groq?',
  what: 'הלוח ישלח ל-Groq בקשה של מילה אחת (מודל openai/gpt-oss-20b, טוקן אחד בתשובה) וימדוד כמה זמן לקח לה לחזור. היא עולה בערך 0.000006 דולר ומנצלת בקשה אחת מתוך המכסה היומית. אם כבר נשלחה בדיקה בדקה האחרונה, לא יישלח כלום ותוצג התוצאה הקודמת.',
  undo: 'אין מה לבטל: הבקשה רק קוראת תשובה, שום הגדרה לא משתנה.',
  path: '/api/cc/groq/action', body: { kind: 'probe' }, okMsg: 'זמן התגובה נמדד.',
});

export function catalog(seen = {}) {
  return seen.groq?.configured ? [groqProbe()] : [];
}
