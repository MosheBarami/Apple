// Vercel action specs. Four writes only, each through app.act (Hebrew confirm modal → POST with the
// session token and confirm:true → toast): Redeploy, Promote to Production, Instant Rollback, Cancel.
// The server (cc/platforms/vercel.mjs) re-validates every id and refuses anything else: no deletes,
// no env changes, no domain purchases or transfers, no billing.
const PATH = '/api/cc/vercel/action';
const LIVE = new Set(['BUILDING', 'QUEUED', 'INITIALIZING']);
const s7 = (x) => (x ? String(x).slice(0, 7) : '');
const tail = (id) => String(id || '').slice(4, 13);

export const vx = {
  redeploy: (d) => {
    const prod = d.target === 'production';
    return { id: `vc-redeploy-${d.id}`, platform: 'vercel', label: `Redeploy · ${d.project}`, hint: `${tail(d.id)} · ${prod ? 'Production' : 'Preview'}`,
      title: 'לבנות מחדש את הפריסה?',
      what: `Vercel יבנה פריסה חדשה של ${d.project} מאותו קוד${d.commit?.sha ? ` (commit ${s7(d.commit.sha)})` : ''} כמו ${d.id}.${prod ? ' כשהיא תהיה מוכנה היא תקבל את הדומיינים של production.' : ' זו פריסת Preview, האתר באוויר לא משתנה.'}`,
      undo: prod ? 'אם הגרסה החדשה לא תקינה: Instant Rollback לפריסה הנוכחית, מהדף הזה בלחיצה.' : 'אין מה לבטל: Preview לא נוגע באתר באוויר.',
      reversible: true, path: PATH, body: { kind: 'redeploy', deploymentId: d.id, name: d.project, target: prod ? 'production' : 'preview' },
      okMsg: 'הפריסה החדשה נשלחה לבנייה. היא תופיע ברשימה תוך כמה שניות.' };
  },
  promote: (d) => ({ id: `vc-promote-${d.id}`, platform: 'vercel', label: `Promote to Production · ${d.project}`, hint: tail(d.id),
    title: 'לקדם את הפריסה ל-production?',
    what: `הדומיינים של production ב-${d.project} יעברו לפריסה ${d.url || d.id} בלי בנייה מחדש. המבקרים יראו אותה מיד.`,
    undo: 'Instant Rollback מחזיר את הפריסה שהייתה באוויר קודם.', reversible: true, path: PATH,
    body: { kind: 'promote', projectId: d.projectId, deploymentId: d.id }, okMsg: 'הפריסה קודמה ל-production.' }),
  rollback: (d) => ({ id: `vc-rollback-${d.id}`, platform: 'vercel', label: `Instant Rollback · ${d.project}`, hint: tail(d.id),
    title: 'להחזיר את production לפריסה הזו?',
    what: `Instant Rollback: הדומיינים של production ב-${d.project} יחזרו מיד לפריסה ${d.url || d.id}${d.commit?.message ? ` ("${String(d.commit.message).split('\n')[0].slice(0, 60)}")` : ''}. אחרי rollback, Vercel לא מקדם לבד פריסות חדשות ל-production עד שמקדמים ידנית.`,
    undo: 'Promote to Production לפריסה החדשה יותר מחזיר את המצב הקודם.', reversible: true, path: PATH,
    body: { kind: 'rollback', projectId: d.projectId, deploymentId: d.id }, okMsg: 'production חזר לפריסה שבחרתם.' }),
  cancel: (d) => ({ id: `vc-cancel-${d.id}`, platform: 'vercel', label: `Cancel · ${d.project}`, hint: `${tail(d.id)} · ${d.state}`,
    title: 'לעצור את הבנייה?', what: `הבנייה של ${d.project} (${d.id}) תיעצר באמצע ולא תגיע לאוויר.`,
    undo: 'אי אפשר להמשיך בנייה שבוטלה, אבל Redeploy בונה אותה מחדש מאותו קוד.', reversible: false, path: PATH,
    body: { kind: 'cancel', deploymentId: d.id }, okMsg: 'הבנייה בוטלה.' }),
};

/** The actions that make sense for one deployment, in Vercel's menu order. */
export function offer(d, v) {
  const p = (v?.projects || []).find((x) => x.id === d.projectId);
  const cur = p?.production || null;
  const out = [];
  if (LIVE.has(d.state)) out.push(vx.cancel(d));
  if (d.state === 'READY' && d.target === 'production' && d.projectId && cur && d.id !== cur.id) {
    if ((d.createdAt || 0) < (cur.createdAt || 0)) out.push(vx.rollback(d)); else out.push(vx.promote(d));
  }
  if (!LIVE.has(d.state) && d.project) out.push(vx.redeploy(d));
  return out;
}

/** For the command palette: cancel what is building, roll back to the last good production, redeploy the latest. */
export function catalog(seen = {}) {
  const v = seen.vercel;
  if (!v || v.ok === false || !Array.isArray(v.deployments)) return [];
  const out = []; const ids = new Set();
  const add = (s) => { if (s && !ids.has(s.id)) { ids.add(s.id); out.push(s); } };
  for (const d of v.deployments) if (LIVE.has(d.state)) add(vx.cancel(d));
  for (const p of v.projects || []) {
    const mine = v.deployments.filter((d) => d.projectId === p.id);
    const back = mine.find((d) => d.target === 'production' && d.state === 'READY' && p.production && d.id !== p.production.id && (d.createdAt || 0) < (p.production.createdAt || 0));
    if (back) add(vx.rollback(back));
    const last = mine.find((d) => d.target === 'production' && !LIVE.has(d.state));
    if (last) add(vx.redeploy(last));
  }
  return out;
}
