// Langflow action specs: the one write is running a repo flow in the local Langflow (the server refuses
// any other kind, and any flow that is not checked in at packages/langflow/flows). Each spec says whether
// the run calls a model (Workers AI neurons) or only reads local files.
const PATH = '/api/cc/langflow/action';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Run `flow` (a langflow() flow row) with `input`; `tag` keeps ids distinct (example vs typed input). */
export function lfRun(flow, input, tag = 'input') {
  const cost = flow.usesModel
    ? 'הזרימה קוראת ל-Workers AI, כך שהריצה מנצלת נוירונים מהמכסה היומית של Cloudflare.'
    : 'הזרימה לא קוראת לאף מודל: היא רק קוראת קבצים מקומיים ומחזירה טקסט.';
  return {
    id: `lf-run-${tag}-${flow.id}`, platform: 'langflow', label: `הרצת ${flow.name}${tag === 'example' ? ' עם קלט הדוגמה' : ''}`, hint: 'Langflow המקומי',
    title: `להריץ את "${flow.name}"?`,
    what: `Langflow המקומי יריץ את הזרימה עם הקלט (${input.length} תווים). ${cost} הריצה נרשמת ביומן הריצות של Langflow, ואם אין LANGFLOW_API_KEY נוצר מפתח הרצה זמני שנמחק מיד אחריה.`,
    undo: 'אין מה לבטל: ריצה לא משנה את הזרימה ולא כותבת לריפו. היא רק מוסיפה שורה ליומן הריצות.',
    path: PATH, body: { kind: 'run', id: flow.id, input }, okMsg: 'הזרימה רצה.',
  };
}

/** Palette: run each imported flow that has sync.mjs's example input, local-only flows first. */
export function catalog(seen = {}) {
  const l = seen.langflow;
  if (!l?.running || l.auth !== 'ok') return [];
  return (l.flows || []).filter((f) => f.imported && UUID.test(String(f.id)) && typeof f.example === 'string')
    .sort((a, b) => Number(a.usesModel) - Number(b.usesModel)).map((f) => lfRun(f, f.example, 'example'));
}
