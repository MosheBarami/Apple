// Cloudflare action specs beyond the two observability switches (cf.toggle in ../actions.js):
// ROLLBACK a Worker to an earlier version, and purge a zone's cache. Each goes through app.act
// (Hebrew confirm modal → POST with confirm:true → toast; dry-run shows the exact call). The server
// (cc/platforms/cloudflare.mjs) re-checks that the version belongs to that Worker and is not the one
// already serving, and refuses anything else: no deletes, no secrets, no billing or plan changes.
import { cf } from '../actions.js';

const PATH = '/api/cc/cloudflare/action';
const s8 = (id) => String(id || '').slice(0, 8);

export const cfx = {
  rollback: (script, v, cur) => ({
    id: `cf-rollback-${script}-${v.id}`, platform: 'cloudflare', label: `חזרה לגרסה #${v.number ?? s8(v.id)} · ${script}`, hint: `Worker ${script}`,
    title: `להחזיר את ${script} לגרסה #${v.number ?? s8(v.id)}?`,
    what: `Cloudflare יצור פריסה חדשה של ${script} שמגישה 100% מהתנועה מגרסה #${v.number ?? '?'} (${s8(v.id)})${v.message ? `, "${String(v.message).slice(0, 60)}"` : ''}${cur ? ` במקום #${cur}` : ''}. הגרסה חוזרת עם הקוד, החיבורים (bindings) והסודות שהיו לה כשנוצרה. אם מאז השתנו סודות, חיבורים או מחלקות של Durable Objects, Cloudflare יסרב ולא ישתנה דבר.`,
    undo: cur ? `אותה פעולה על גרסה #${cur} מחזירה את המצב הקודם. הקוד בריפו לא משתנה, והפריסה הבאה מהריפו תדרוס את החזרה.` : 'אותה פעולה על הגרסה החדשה מחזירה את המצב הקודם.',
    reversible: true, path: PATH, body: { kind: 'rollback', script, versionId: v.id },
    okMsg: `${script} מגיש עכשיו את גרסה #${v.number ?? s8(v.id)}.`,
  }),
  purge: (z) => ({
    id: `cf-purge-${z.id}`, platform: 'cloudflare', label: `ניקוי כל המטמון · ${z.name}`, hint: 'Zone',
    title: `לנקות את כל המטמון של ${z.name}?`,
    what: `Cloudflare ימחק מהמטמון את כל הקבצים השמורים של ${z.name} בכל מרכזי הנתונים. הבקשות הבאות יגיעו לשרת עד שהמטמון יתמלא שוב.`,
    undo: 'אי אפשר להחזיר מטמון שנוקה, אבל הוא מתמלא לבד בבקשות הבאות. שום קובץ באתר לא נמחק.',
    reversible: false, danger: true, path: PATH, body: { kind: 'purge', zoneId: z.id }, okMsg: 'המטמון נוקה.',
  }),
};

/** The version to roll back to: the one the previous single-version deployment served. */
export function previous(w) {
  const serving = (w?.serving || [])[0]?.id;
  const deps = w?.deployments || [];
  const back = deps.slice(1).flatMap((d) => d.versions || []).find((v) => v.id && v.id !== serving);
  return back ? (w.versions || []).find((v) => v.id === back.id) || { id: back.id, number: null } : null;
}

/** For the command palette: the two switches, a rollback per Worker, purge per zone. */
export function catalog(seen = {}) {
  const c = seen.cloudflare;
  if (!c || c.ok === false) return [];
  const out = [];
  if (c.settings) out.push(cf.toggle('logs', !!c.settings.logs), cf.toggle('traces', !!c.settings.traces));
  for (const w of c.workers || []) {
    const p = previous(w); const cur = (w.serving || [])[0]?.number;
    if (p && w.name) out.push(cfx.rollback(w.name, p, cur));
  }
  for (const z of c.zones || []) if (z.id) out.push(cfx.purge(z));
  return out;
}
