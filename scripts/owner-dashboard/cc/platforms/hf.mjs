// Hugging Face: the owner's models, datasets and Spaces, private ones included (read-only, free).
import { fetchJson, cached, uncache, ok, fail, section } from '../http.mjs';

const API = 'https://huggingface.co/api';
const LABEL = 'Hugging Face';
export const HF_USER = 'moshebarami';

const auth = () => ({ authorization: `Bearer ${process.env.HF_TOKEN}` });
const get = (p, what) => fetchJson(`${API}${p}`, { label: LABEL, what, headers: auth() });
const q = `author=${HF_USER}&limit=100`;

export function hf() {
  if (!process.env.HF_TOKEN) return Promise.resolve(fail('חסר HF_TOKEN בקובץ ‎.env'));
  return cached('hf', async () => {
    const [who, models, datasets, spaces] = await Promise.all([
      section(() => get('/whoami-v2', 'זיהוי המשתמש')),
      section(() => get(`/models?${q}&full=true`, 'רשימת המודלים')),
      section(() => get(`/datasets?${q}&full=true`, 'רשימת הדאטהסטים')),
      section(() => get(`/spaces?${q}&expand[]=sdk&expand[]=runtime&expand[]=private&expand[]=likes&expand[]=lastModified`, 'רשימת ה-Spaces')),
    ]);
    const all = { who, models, datasets, spaces };
    const errors = Object.fromEntries(Object.entries(all).filter(([, s]) => s.error).map(([k, s]) => [k, s.error]));
    if (Object.keys(errors).length === 4) return fail(who.error, { errors });
    return ok({
      user: who.value?.name ?? HF_USER, // only the name: whoami also describes the token itself
      models: (models.value || []).map((m) => ({ id: m.id, private: m.private, downloads: m.downloads ?? 0, likes: m.likes ?? 0,
        updatedAt: m.lastModified, url: `https://huggingface.co/${m.id}`, pipeline: m.pipeline_tag ?? null, library: m.library_name ?? null })),
      datasets: (datasets.value || []).map((d) => ({ id: d.id, private: d.private, downloads: d.downloads ?? 0, likes: d.likes ?? 0,
        updatedAt: d.lastModified, url: `https://huggingface.co/datasets/${d.id}` })),
      spaces: (spaces.value || []).map((s) => ({ id: s.id, sdk: s.sdk ?? null, runtimeStage: s.runtime?.stage ?? null, private: s.private,
        hardware: s.runtime?.hardware?.current ?? null, updatedAt: s.lastModified, url: `https://huggingface.co/spaces/${s.id}` })),
      errors,
    });
  });
}

// Space power switches: restart (also wakes a paused Space) and pause. Only the owner's own Spaces;
// nothing is deleted and no visibility or secret changes.
export async function hfAction({ kind, id, dryRun }) {
  if (!['restart', 'pause'].includes(kind)) return fail('פעולה לא מוכרת');
  if (!new RegExp(`^${HF_USER}/[\\w.-]{1,96}$`).test(String(id))) return fail('ה-Space לא שייך לחשבון');
  const url = `${API}/spaces/${id}/${kind}`;
  if (dryRun === true) return ok({ dryRun: true, plan: { method: 'POST', url, body: null } });
  if (!process.env.HF_TOKEN) return fail('חסר HF_TOKEN בקובץ ‎.env');
  try { await fetchJson(url, { label: LABEL, what: kind === 'restart' ? 'הפעלה מחדש של ה-Space' : 'השהיית ה-Space', method: 'POST', headers: auth() }); }
  catch (e) { return fail(e?.reason || 'הפעולה נכשלה'); }
  uncache('hf');
  return ok({ kind, id });
}
