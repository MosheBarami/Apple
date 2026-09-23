// Hugging Face: the owner's account, models, datasets and Spaces (private ones included), the recent
// commits of each model/dataset repo, and the Hub's rate-limit headers. Reads are free. Writes are
// only the Space power switches (restart, pause, factory rebuild); nothing paid, no hardware change.
import { fetchJson, cached, uncache, ok, fail, section, UpstreamError, reasonFor } from '../http.mjs';

const API = 'https://huggingface.co/api';
const HUB = 'https://huggingface.co';
const LABEL = 'Hugging Face';
export const HF_USER = 'moshebarami';
const REPO_CAP = 6; // repos per kind whose detail + commits are fetched

const auth = () => ({ authorization: `Bearer ${process.env.HF_TOKEN}` });
// One Hub call that keeps the response headers (the rate-limit counters ride on every answer).
async function getR(p, what) {
  const r = await fetchJson(`${API}${p}`, { label: LABEL, what, headers: auth(), raw: true });
  const text = await r.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!r.ok) throw new UpstreamError(r.status, reasonFor(LABEL, r.status, what));
  return { json, headers: r.headers };
}
const get = async (p, what) => (await getR(p, what)).json;
const q = `author=${HF_USER}&limit=100`;
const list = (x) => (Array.isArray(x) ? x : []);
const iso = (s) => { const t = Date.parse(s); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
const str = (s, n = 200) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : null);

// `ratelimit: "api";r=988;t=143` and `ratelimit-policy: "fixed window";"api";q=1000;w=300`.
export function parseRate(h) {
  const rl = String(h?.get?.('ratelimit') || ''), pol = String(h?.get?.('ratelimit-policy') || '');
  const n = (s, k) => { const m = s.match(new RegExp(`(?:^|;)\\s*${k}=(\\d+)`)); return m ? Number(m[1]) : null; };
  const out = { remaining: n(rl, 'r'), resetSec: n(rl, 't'), limit: n(pol, 'q'), windowSec: n(pol, 'w') };
  return Object.values(out).some((v) => v != null) ? out : null;
}

const commitsOf = (arr) => list(arr).slice(0, 8).map((c) => ({ id: String(c.id || '').slice(0, 40), title: str(c.title, 140) || '',
  date: iso(c.date), author: list(c.authors)[0]?.user ?? null }));
const splitTags = (tags) => {
  const t = list(tags).map(String).filter((x) => x !== 'region:us');
  return { tags: t.filter((x) => !/^(base_model|license|dataset):/.test(x)).slice(0, 12),
    license: t.find((x) => x.startsWith('license:'))?.slice(8) ?? null,
    baseModel: (t.find((x) => x.startsWith('base_model:adapter:')) || t.find((x) => /^base_model:[^:]+\/[^:]+$/.test(x)) || '').replace(/^base_model:(adapter:)?/, '') || null };
};

function repoOf(r, kind, detail, commits) {
  const d = detail || {}; const t = splitTags(r.tags || d.tags);
  const files = list(d.siblings || r.siblings).map((s) => String(s.rfilename || '')).filter(Boolean);
  return {
    id: String(r.id), kind, private: !!r.private, downloads: r.downloads ?? 0, likes: r.likes ?? 0,
    updatedAt: r.lastModified ?? null, createdAt: r.createdAt ?? d.createdAt ?? null, sha: r.sha ?? d.sha ?? null,
    url: kind === 'dataset' ? `${HUB}/datasets/${r.id}` : `${HUB}/${r.id}`,
    pipeline: r.pipeline_tag ?? null, library: r.library_name ?? null, ...t,
    title: str(r.cardData?.pretty_name ?? d.cardData?.pretty_name, 80),
    summary: kind === 'dataset' ? str(r.description ?? d.description, 220) : null,
    gated: r.gated ?? false, disabled: !!(r.disabled ?? d.disabled),
    storage: Number.isFinite(d.usedStorage) ? d.usedStorage : null,
    fileCount: files.length || null, files: files.slice(0, 24),
    commits: commits?.value ? commitsOf(commits.value.json) : [],
    commitCount: commits?.value ? (Number(commits.value.headers.get('x-total-count')) || list(commits.value.json).length) : null,
    commitsError: commits?.error ?? null,
  };
}

const spaceOf = (s) => ({
  id: String(s.id), sdk: s.sdk ?? null, runtimeStage: s.runtime?.stage ?? null, private: !!s.private, likes: s.likes ?? 0,
  hardware: s.runtime?.hardware?.current ?? null, requestedHardware: s.runtime?.hardware?.requested ?? null,
  sleepAfterSec: s.runtime?.gcTimeout ?? null, domainStage: list(s.runtime?.domains)[0]?.stage ?? null,
  errorMessage: str(s.runtime?.errorMessage, 240),
  title: str(s.cardData?.title, 80), emoji: str(s.cardData?.emoji, 8), colorFrom: str(s.cardData?.colorFrom, 16), colorTo: str(s.cardData?.colorTo, 16),
  updatedAt: s.lastModified ?? null, url: `${HUB}/spaces/${s.id}`,
});

/** 2–4 conclusions for the owner, each saying what it rests on. A section that failed yields a
 *  "could not look" line, never a conclusion about the thing it did not see. */
export function hfInsights(p) {
  const out = []; const e = p?.errors || {};
  const add = (tone, text, basis) => out.push({ tone, text, basis });
  const short = (id) => String(id).split('/')[1] || id;
  // Spaces
  if (e.spaces) add('warn', `לא הצלחנו לקרוא את ה-Spaces (${e.spaces}), אז אין כאן מסקנה עליהם.`, 'GET /api/spaces נכשל');
  else {
    const sp = list(p.spaces);
    const noApp = sp.filter((s) => s.runtimeStage === 'NO_APP_FILE'), broken = sp.filter((s) => /ERROR/.test(s.runtimeStage || ''));
    const running = sp.filter((s) => s.runtimeStage === 'RUNNING');
    if (broken.length) add('bad', `${broken.map((s) => short(s.id)).join(', ')} קרס (${broken[0].runtimeStage}). הפעלה מחדש היא הצעד הראשון.`, `runtime.stage של ${broken.length} Space`);
    else if (noApp.length) add('warn', `ה-Space ${short(noApp[0].id)} לא עולה: אין בו קובץ אפליקציה. הפעלה מחדש לא תעזור עד שיועלה אליו קוד (Dockerfile או app.py).`, `runtime.stage = NO_APP_FILE, חומרה מבוקשת ${noApp[0].requestedHardware || '—'}`);
    else if (sp.length) add('good', `${running.length} מתוך ${sp.length} Spaces רצים עכשיו.`, 'runtime.stage של כל Space');
    else add('info', 'אין Spaces בחשבון.', 'GET /api/spaces החזיר רשימה ריקה');
  }
  // Training repos: is the model newer than the data it should have learned from?
  if (e.models || e.datasets) add('warn', `לא הצלחנו לקרוא את ${e.models ? 'המודלים' : 'מאגרי הנתונים'}, אז אין השוואה בין המודל לנתונים.`, 'רשימת המאגרים נכשלה');
  else {
    const last = (r) => Date.parse(r.commits?.[0]?.date || r.updatedAt || '') || 0;
    const m = list(p.models).slice().sort((a, b) => last(b) - last(a))[0], d = list(p.datasets).slice().sort((a, b) => last(b) - last(a))[0];
    if (m && d && last(m) && last(d)) {
      const gap = Math.round((last(d) - last(m)) / 60000);
      const fmt = (min) => (Math.abs(min) < 90 ? `${Math.abs(min)} דקות` : Math.abs(min) < 2880 ? `${Math.round(Math.abs(min) / 60)} שעות` : `${Math.round(Math.abs(min) / 1440)} ימים`);
      if (gap > 0) add('warn', `מאגר הנתונים ${short(d.id)} עודכן ${fmt(gap)} אחרי המודל ${short(m.id)}: ייתכן שהמודל לא אומן על הגרסה האחרונה של הנתונים.`, 'תאריך ה-commit האחרון בכל מאגר');
      else add('good', `המודל ${short(m.id)} עדכני יותר מהנתונים (${fmt(gap)} אחרי ה-commit האחרון של ${short(d.id)}).`, 'תאריך ה-commit האחרון בכל מאגר');
    } else if (!list(p.models).length) add('info', 'אין מודלים בחשבון.', 'GET /api/models החזיר רשימה ריקה');
    const repos = [...list(p.models), ...list(p.datasets)];
    const pub = repos.filter((r) => !r.private);
    if (repos.length) add(pub.length ? 'warn' : 'good', pub.length ? `${pub.map((r) => short(r.id)).join(', ')} ציבורי: כל אחד יכול להוריד אותו.` : `כל ${repos.length} המודלים ומאגרי הנתונים פרטיים: רק החשבון שלך רואה אותם.`, 'השדה private בכל מאגר');
  }
  // Account and billing, honestly bounded by what the API exposes.
  if (e.who) add('warn', `לא הצלחנו לזהות את החשבון (${e.who}).`, 'whoami-v2 נכשל');
  else if (p.isPro != null) add('info', `החשבון ${p.isPro ? 'PRO' : 'חינמי (לא PRO)'}${p.canPay === false ? ', בלי אמצעי תשלום' : ''}. כמה קרדיט Inference נוצל אי אפשר לדעת מכאן: ה-API לא חושף את זה.`, `isPro=${p.isPro}, canPay=${p.canPay}`);
  return out.slice(0, 4);
}

export function hf() {
  if (!process.env.HF_TOKEN) return Promise.resolve(fail('חסר HF_TOKEN בקובץ ‎.env', { configured: false, need: ['HF_TOKEN'] }));
  return cached('hf', async () => {
    const [who, overview, models, datasets, spaces] = await Promise.all([
      section(() => getR('/whoami-v2', 'זיהוי המשתמש')),
      section(() => get(`/users/${HF_USER}/overview`, 'סקירת החשבון')),
      section(() => get(`/models?${q}&full=true`, 'רשימת המודלים')),
      section(() => get(`/datasets?${q}&full=true`, 'רשימת הדאטהסטים')),
      section(() => get(`/spaces?${q}&expand[]=sdk&expand[]=runtime&expand[]=private&expand[]=likes&expand[]=lastModified&expand[]=cardData`, 'רשימת ה-Spaces')),
    ]);
    const errors = Object.fromEntries(Object.entries({ who, overview, models, datasets, spaces }).filter(([, s]) => s.error).map(([k, s]) => [k, s.error]));
    if (errors.who && errors.models && errors.datasets && errors.spaces) return fail(errors.who, { configured: true, errors });
    // Detail (size, files) and the commit log of each model/dataset repo.
    const deep = async (r, kind) => {
      const base = kind === 'dataset' ? 'datasets' : 'models';
      const [detail, commits] = await Promise.all([section(() => get(`/${base}/${r.id}`, 'פרטי המאגר')), section(() => getR(`/${base}/${r.id}/commits/main`, 'היסטוריית ה-commits'))]);
      return repoOf(r, kind, detail.value, commits);
    };
    const [ms, ds] = await Promise.all([
      Promise.all(list(models.value).slice(0, REPO_CAP).map((r) => deep(r, 'model'))),
      Promise.all(list(datasets.value).slice(0, REPO_CAP).map((r) => deep(r, 'dataset'))),
    ]);
    const w = who.value?.json && !Array.isArray(who.value.json) ? who.value.json : {};
    // Only named fields of whoami: its `auth` section describes (and can contain) the token itself.
    const perms = list(w.auth?.accessToken?.fineGrained?.scoped).flatMap((s) => list(s.permissions));
    const ov = overview.value && !Array.isArray(overview.value) ? overview.value : {};
    const avatar = typeof w.avatarUrl === 'string' && /^(\/avatars\/|https:\/\/cdn-avatars\.huggingface\.co\/)[\w./-]+$/.test(w.avatarUrl) ? (w.avatarUrl.startsWith('/') ? HUB + w.avatarUrl : w.avatarUrl) : null;
    const body = {
      configured: true,
      user: typeof w.name === 'string' ? w.name : HF_USER, fullname: str(w.fullname, 80), type: w.type ?? null, avatar,
      isPro: typeof w.isPro === 'boolean' ? w.isPro : null, canPay: typeof w.canPay === 'boolean' ? w.canPay : null,
      billingMode: str(w.billingMode, 20), periodEnd: Number.isFinite(w.periodEnd) ? new Date(w.periodEnd * 1000).toISOString() : null,
      orgs: list(w.orgs).map((o) => str(o.name, 60)).filter(Boolean),
      token: w.auth?.accessToken ? { role: str(w.auth.accessToken.role, 20), write: perms.includes('repo.write') || w.auth.accessToken.role === 'write' } : null,
      counts: { models: ov.numModels ?? null, datasets: ov.numDatasets ?? null, spaces: ov.numSpaces ?? null, followers: ov.numFollowers ?? null, likes: ov.numLikes ?? null },
      joinedAt: ov.createdAt ?? null,
      rate: who.value ? parseRate(who.value.headers) : null,
      inference: { measurable: false },
      models: ms, datasets: ds, spaces: list(spaces.value).map(spaceOf),
      errors,
    };
    return ok({ ...body, conclusions: hfInsights(body) });
  }, 120000);
}

// Space power switches: restart (also wakes a paused Space), pause, and a factory rebuild (restart
// from a clean build). Only the owner's own Spaces; nothing is deleted, no hardware, visibility or
// secret changes.
const KINDS = { restart: 'הפעלה מחדש של ה-Space', pause: 'השהיית ה-Space', rebuild: 'בנייה מחדש של ה-Space' };
export async function hfAction({ kind, id, dryRun } = {}) {
  if (!Object.hasOwn(KINDS, String(kind))) return fail('פעולה לא מוכרת');
  // A Hub repo name: letters, digits, - _ . ; never a dot segment (".." would climb out of /spaces/<id>).
  if (!new RegExp(`^${HF_USER}/[\\w-][\\w.-]{0,95}$`).test(String(id)) || String(id).includes('..')) return fail('ה-Space לא שייך לחשבון');
  const url = kind === 'rebuild' ? `${API}/spaces/${id}/restart?factory=true` : `${API}/spaces/${id}/${kind}`;
  if (dryRun === true) return ok({ dryRun: true, plan: { method: 'POST', url, body: null } });
  if (!process.env.HF_TOKEN) return fail('חסר HF_TOKEN בקובץ ‎.env', { configured: false, need: ['HF_TOKEN'] });
  try { await fetchJson(url, { label: LABEL, what: KINDS[kind], method: 'POST', headers: auth() }); }
  catch (e) { return fail(e?.reason || 'הפעולה נכשלה'); }
  uncache('hf');
  return ok({ kind, id });
}
