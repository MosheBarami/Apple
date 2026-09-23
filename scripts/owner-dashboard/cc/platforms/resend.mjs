// Resend. Without RESEND_API_KEY it names the key and makes no call. With it: sending domains and
// their DNS verification, the last emails with their delivery status, API keys (names and dates only),
// audiences, segments, contacts, broadcasts and webhooks — each part fails on its own.
// Writes are small and reversible: re-check a domain's DNS, flip open/click tracking, and one test
// email whose recipient comes ONLY from OWNER_EMAIL in .env (never from the request, never hardcoded).
import { fetchJson, cached, uncache, ok, fail, section, redact } from '../http.mjs';

const API = 'https://api.resend.com';
const LABEL = 'Resend';
const HOW = 'ב-Resend: API Keys → Create API Key (הרשאת Full access כדי לקרוא דומיינים ומיילים) → העתיקו את המפתח '
  + 'והוסיפו לקובץ ‎.env שורה RESEND_API_KEY=<המפתח>, ואז הפעילו מחדש את הדשבורד.';
const auth = () => ({ authorization: `Bearer ${process.env.RESEND_API_KEY}` });
const get = (p, what) => fetchJson(`${API}${p}`, { label: LABEL, what, headers: auth() });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@<>()",;:]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const FALLBACK_FROM = 'onboarding@resend.dev'; // Resend's shared sender: delivers only to the account owner's address
const list = (x) => (Array.isArray(x) ? x : Array.isArray(x?.data) ? x.data : []);
const str = (x, max = 200) => (x == null ? null : String(x).slice(0, max));
const failed = (s) => ({ ok: false, reason: s.error });
// Resend dates look like '2026-09-23 20:03:08.57+00': normalised to ISO so every browser parses them.
const iso = (x) => { const t = Date.parse(String(x ?? '').replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')); return x && Number.isFinite(t) ? new Date(t).toISOString() : null; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** m***@gmail.com — enough to recognise an address, not enough to harvest one. */
export const maskEmail = (e) => {
  const m = String(e ?? '').match(/^([^@]{0,64})@(.+)$/);
  return m ? `${m[1].slice(0, 1)}***@${m[2]}` : null;
};
function ownerEmail() {
  const v = String(process.env.OWNER_EMAIL || '').trim();
  return EMAIL.test(v) ? v : null;
}

// ---------- normalisers ----------
const domainOf = (d) => ({ id: str(d.id, 40), name: str(d.name, 253), status: str(d.status, 30), region: str(d.region, 30), created: iso(d.created_at),
  openTracking: d.open_tracking ?? null, clickTracking: d.click_tracking ?? null,
  records: Array.isArray(d.records) ? d.records.map((r) => ({ record: str(r.record, 30), type: str(r.type, 10), name: str(r.name, 253),
    status: str(r.status, 30), ttl: str(r.ttl, 20), priority: r.priority ?? null })) : null });
const emailOf = (e) => ({ id: str(e.id, 40), to: list(e.to).length ? list(e.to).map(maskEmail) : [maskEmail(e.to)].filter(Boolean),
  from: str(e.from, 200), subject: str(e.subject, 160), created: iso(e.created_at), status: str(e.last_event, 30), scheduled: iso(e.scheduled_at) });
const keyOf = (k) => ({ name: str(k.name, 120), created: iso(k.created_at), lastUsed: iso(k.last_used_at) }); // never the token, never the id
const namedOf = (a) => ({ name: str(a.name, 160), created: iso(a.created_at) });
const broadcastOf = (b) => ({ name: str(b.name, 160), status: str(b.status, 30), created: iso(b.created_at), sent: iso(b.sent_at) });
const hookOf = (w) => { let host = null; try { host = new URL(w.endpoint).host; } catch { /* not a URL */ }
  return { host, status: str(w.status, 30), events: list(w.events).length, created: iso(w.created_at) }; };
const page = (x, fn) => ({ items: list(x).map(fn), more: Boolean(x?.has_more) });

// ---------- conclusions (pure, tested) ----------
const fmt = (x) => new Intl.NumberFormat('he-IL').format(x);
const BAD_STATUS = new Set(['bounced', 'complained', 'failed', 'suppressed']);
export function resendConclusions(d, now = Date.now()) {
  const out = [];
  const dom = d?.domains;
  if (dom?.ok === false) out.push({ k: 'domains', tone: 'info', title: 'רשימת הדומיינים לא נקראה', text: dom.reason });
  else if (dom) {
    const all = list(dom.items); const good = all.filter((x) => x.status === 'verified'); const bad = all.filter((x) => x.status !== 'verified');
    if (!all.length) out.push({ k: 'domains', tone: 'bad', title: 'אין דומיין שולח: אי אפשר לשלוח מיילים למשתמשים',
      text: `בלי דומיין מאומת Resend שולח רק מ-${FALLBACK_FROM}, ורק לכתובת של בעל החשבון. צריך להוסיף דומיין ולהגדיר את רשומות ה-DNS שלו.` });
    else if (bad.length) out.push({ k: 'domains', tone: good.length ? 'warn' : 'bad', title: `${fmt(bad.length)} מתוך ${fmt(all.length)} דומיינים לא מאומתים`,
      text: `${bad.map((x) => `${x.name} (${x.status})`).join(', ')}: רשומות ה-DNS עוד לא נמצאו. אחרי שמוסיפים אותן אפשר לבקש בדיקה חוזרת.` });
    else out.push({ k: 'domains', tone: 'good', title: good.length === 1 ? `הדומיין ${good[0].name} מאומת` : `${fmt(good.length)} דומיינים מאומתים`, text: 'אפשר לשלוח מכל כתובת בדומיין.' });
  }
  const em = d?.emails;
  if (em?.ok === false) out.push({ k: 'emails', tone: 'info', title: 'רשימת המיילים לא נקראה', text: em.reason });
  else if (em) {
    const all = list(em.items); const bad = all.filter((x) => BAD_STATUS.has(x.status));
    if (!all.length) out.push({ k: 'emails', tone: 'info', title: 'עוד לא נשלח אף מייל דרך Resend', text: 'רשימת המיילים האחרונים ריקה.' });
    else out.push({ k: 'emails', tone: bad.length ? 'warn' : 'good',
      title: `${fmt(all.length)}${em.more ? '+' : ''} מיילים אחרונים, ${fmt(all.filter((x) => x.status === 'delivered').length)} נמסרו`,
      text: bad.length ? `${fmt(bad.length)} לא הגיעו (${[...new Set(bad.map((x) => x.status))].join(', ')}).` : 'אף מייל לא חזר ולא סומן כספאם.' });
  }
  const keys = d?.keys;
  if (keys && keys.ok !== false) {
    const all = list(keys.items); const used = all.map((k) => Date.parse(k.lastUsed)).filter(Number.isFinite);
    const last = used.length ? Math.max(...used) : null; const days = last ? Math.floor((now - last) / 86400000) : null;
    out.push({ k: 'keys', tone: !all.length ? 'warn' : 'info', title: all.length === 1 ? 'מפתח API אחד' : `${fmt(all.length)} מפתחות API`,
      text: last ? `שימוש אחרון ${days < 1 ? 'היום' : `לפני ${fmt(days)} ימים`} (גם הקריאות של לוח הבקרה נספרות).` : 'אף מפתח עוד לא שימש.' });
  }
  if (!d?.testEmail?.available) out.push({ k: 'test', tone: 'info', title: 'מייל ניסיון לא זמין', text: 'חסר OWNER_EMAIL בקובץ ‎.env: רק אליו מותר לשלוח מייל ניסיון.' });
  return out.slice(0, 4);
}

export function resend() {
  if (!process.env.RESEND_API_KEY) return Promise.resolve(ok({ configured: false, how: HOW, missing: ['RESEND_API_KEY'] }));
  return cached('resend', async () => {
    // 10 requests a second is Resend's limit: eight reads at once, then the domain details.
    const [dom, em, keys, aud, seg, con, bro, hooks] = await Promise.all([
      section(() => get('/domains', 'רשימת הדומיינים')),
      section(() => get('/emails?limit=20', 'רשימת המיילים')),
      section(() => get('/api-keys', 'רשימת המפתחות')),
      section(() => get('/audiences', 'רשימת הקהלים')),
      section(() => get('/segments', 'רשימת הסגמנטים')),
      section(() => get('/contacts?limit=100', 'רשימת אנשי הקשר')),
      section(() => get('/broadcasts', 'רשימת הדיוורים')),
      section(() => get('/webhooks', 'רשימת ה-Webhooks')),
    ]);
    if ([dom, em, keys].every((s) => s.error)) return fail(dom.error, { configured: true });
    let domains = dom.error ? failed(dom) : page(dom.value, domainOf);
    const ids = dom.error ? [] : domains.items.map((x) => x.id).filter((id) => UUID.test(id || '')).slice(0, 3);
    if (ids.length) {
      await sleep(1100);
      const det = await Promise.all(ids.map((id) => section(() => get(`/domains/${id}`, 'פרטי הדומיין'))));
      domains = { ...domains, items: domains.items.map((x) => { const k = ids.indexOf(x.id); return k > -1 && det[k].value ? domainOf(det[k].value) : x; }) };
    }
    const owner = ownerEmail(); const from = domains.items?.find((x) => x.status === 'verified');
    const data = {
      configured: true, domains,
      emails: em.error ? failed(em) : page(em.value, emailOf),
      keys: keys.error ? failed(keys) : page(keys.value, keyOf),
      audiences: aud.error ? failed(aud) : page(aud.value, namedOf),
      segments: seg.error ? failed(seg) : page(seg.value, namedOf),
      contacts: con.error ? failed(con) : { count: list(con.value).length, more: Boolean(con.value?.has_more) },
      broadcasts: bro.error ? failed(bro) : page(bro.value, broadcastOf),
      webhooks: hooks.error ? failed(hooks) : page(hooks.value, hookOf),
      testEmail: owner ? { available: true, to: maskEmail(owner), from: from ? `noreply@${from.name}` : FALLBACK_FROM }
        : { available: false, missing: ['OWNER_EMAIL'] },
    };
    data.conclusions = resendConclusions(data);
    return ok(JSON.parse(redact(JSON.stringify(data))));
  });
}

// ---------- actions ----------
const TEST_SUBJECT = 'Apple HQ: מייל ניסיון מלוח הבקרה';
const TEST_TEXT = 'זה מייל ניסיון שנשלח מלוח הבקרה של Apple כדי לוודא ש-Resend מוסר מיילים. אין צורך לענות.';

function plan(body) {
  const kind = body?.kind;
  if (kind === 'verify-domain' || kind === 'open-tracking' || kind === 'click-tracking') {
    if (!UUID.test(String(body.id ?? ''))) return { error: 'מזהה דומיין לא תקין' };
    if (kind === 'verify-domain') return { method: 'POST', url: `${API}/domains/${body.id}/verify`, body: undefined, what: 'בדיקת ה-DNS של הדומיין' };
    if (typeof body.value !== 'boolean') return { error: 'ערך לא תקין (צריך true או false)' };
    return { method: 'PATCH', url: `${API}/domains/${body.id}`, body: { [kind === 'open-tracking' ? 'open_tracking' : 'click_tracking']: body.value }, what: 'עדכון הדומיין' };
  }
  if (kind === 'test-email') {
    const to = ownerEmail();
    if (!to) return { error: 'מייל ניסיון לא זמין: חסר OWNER_EMAIL בקובץ ‎.env (רק אליו מותר לשלוח)', unavailable: true, missing: ['OWNER_EMAIL'] };
    if (body.domain != null && !HOST.test(String(body.domain))) return { error: 'שם דומיין לא תקין' };
    const from = body.domain ? `Apple HQ <noreply@${String(body.domain).toLowerCase()}>` : `Apple HQ <${FALLBACK_FROM}>`;
    return { method: 'POST', url: `${API}/emails`, body: { from, to: [to], subject: TEST_SUBJECT, text: TEST_TEXT }, what: 'שליחת מייל הניסיון' };
  }
  return { error: 'פעולה לא מוכרת' };
}

export async function resendAction(body = {}) {
  const p = plan(body);
  if (p.error) return fail(p.error, p.unavailable ? { unavailable: true, missing: p.missing } : undefined);
  if (body.dryRun === true) return ok({ dryRun: true, plan: { method: p.method, url: p.url, body: p.body ?? null } });
  if (!process.env.RESEND_API_KEY) return fail('Resend עדיין לא מחובר', { configured: false, how: HOW, missing: ['RESEND_API_KEY'] });
  let res;
  try { res = await fetchJson(p.url, { label: LABEL, what: p.what, method: p.method, headers: auth(), body: p.body }); } catch (e) { return fail(e?.reason || `${p.what} נכשלה`); }
  uncache('resend');
  return ok({ kind: body.kind, ...(body.kind === 'test-email' ? { emailId: str(res?.id, 40) } : { id: String(body.id) }) });
}
