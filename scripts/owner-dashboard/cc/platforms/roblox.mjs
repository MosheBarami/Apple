// Roblox: read-only. For each of our plugin assets: the catalogue record (economy API), the Creator
// Store listing (toolbox-service v1 items/details, public), its thumbnail and favourites; per creator,
// what the public store search lists under that name; and a probe of the Open Cloud endpoints that
// ROBLOX_CREATOR_TOKEN would unlock, each reported with the exact status it answered. Nothing here
// uploads, edits or publishes an asset.
import { fetchJson, cached, ok, fail, section } from '../http.mjs';
import { ASSET_ID } from './extras.mjs';

const LABEL = 'Roblox';
const ID = /^\d{3,20}$/;
const TYPES = { 38: 'Plugin', 10: 'Model', 13: 'Decal', 40: 'MeshPart', 24: 'Animation' };
const str = (x, n = 300) => (typeof x === 'string' ? x.slice(0, n) : null);
const numOr = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const list = (x) => (Array.isArray(x) ? x : []);
const bad = (e) => ({ ok: false, reason: e?.reason || 'שגיאה לא צפויה', status: typeof e?.status === 'number' ? e.status : null });
const get = (url, what, headers) => fetchJson(url, { label: LABEL, what, headers });
export const storeUrl = (id) => `https://create.roblox.com/store/asset/${id}`;

// Open Cloud has analytics only per experience (universe.analytics:read). A plugin has no universe,
// so the store numbers below (sales, favourites, votes) are all the analytics Roblox exposes for it.
export const ANALYTICS = { available: false, scope: 'universe.analytics:read', why: 'ב-Open Cloud יש נתוני אנליטיקה רק לחוויות (משחקים), לפי universeId. לפלאגין אין universe, אז אין לו אנליטיקה ב-API. מה שכן זמין: מכירות, מועדפים והצבעות, והם מוצגים כאן.' };

function scrub(obj) {
  let s = JSON.stringify(obj);
  for (const k of ['ROBLOX_CREATOR_TOKEN', 'ROBLOX_API_KEY', 'ROBLOSECURITY']) {
    const v = process.env[k]; if (typeof v === 'string' && v.length >= 8) s = s.split(v).join('[redacted]');
  }
  return JSON.parse(s);
}

function economy(id, d) {
  const c = d?.Creator || {};
  return { id, name: str(d?.Name, 100), description: str(d?.Description, 1000), typeId: numOr(d?.AssetTypeId), type: TYPES[d?.AssetTypeId] || null,
    creator: { id: ID.test(String(c.CreatorTargetId ?? c.Id ?? '')) ? String(c.CreatorTargetId ?? c.Id) : null, name: str(c.Name, 64),
      type: str(c.CreatorType, 10), verified: Boolean(c.HasVerifiedBadge) },
    created: str(d?.Created, 40), updated: str(d?.Updated, 40), sales: numOr(d?.Sales), forSale: Boolean(d?.IsForSale),
    price: numOr(d?.PriceInRobux), publicDomain: Boolean(d?.IsPublicDomain), url: storeUrl(id) };
}

function listing(x) {
  const a = x?.asset || {}; const f = x?.fiatProduct || {}; const v = x?.voting || {};
  return { listed: true, name: str(a.name, 100), published: Boolean(f.published), purchasable: Boolean(f.purchasable), free: Boolean(f.isFree),
    visibility: numOr(a.visibilityStatus), hashApproved: Boolean(a.isAssetHashApproved), endorsed: Boolean(a.isEndorsed), scriptCount: numOr(a.scriptCount),
    category: str(a.categoryPath, 80), created: str(a.createdUtc, 40), updated: str(a.updatedUtc, 40),
    votes: { up: numOr(v.upVotes), down: numOr(v.downVotes), shown: Boolean(v.showVotes) }, creatorVerified: Boolean(x?.creator?.isVerifiedCreator) };
}

async function storeDetails(ids) {
  if (!ids.length) return new Map();
  const j = await get(`https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=${ids.join(',')}`, 'פרטי החנות');
  return new Map(list(j?.data).filter((x) => ID.test(String(x?.asset?.id ?? ''))).map((x) => [String(x.asset.id), listing(x)]));
}

// The Open Cloud reads the key could unlock, each asked once with x-api-key. Only GETs; the assets
// upload API is never called.
async function probes(key, userIds, assetId) {
  const H = { 'x-api-key': key };
  const want = [
    ...userIds.slice(0, 2).map((u) => ({ key: `quotas-${u}`, what: 'מכסות העלאה', scope: 'asset:read', url: `https://apis.roblox.com/cloud/v2/users/${u}/asset-quotas` })),
    ...(assetId ? [{ key: 'store-asset', what: 'פרטי הנכס בחנות (Open Cloud)', scope: 'creator-store-product:read', url: `https://apis.roblox.com/toolbox-service/v2/assets/${assetId}` }] : []),
  ];
  return Promise.all(want.map(async (p) => {
    try { await get(p.url, p.what, H); return { key: p.key, endpoint: p.url.replace('https://apis.roblox.com', ''), scope: p.scope, status: 200, ok: true, reason: null }; }
    catch (e) {
      const why = e?.status === 401 ? 'Roblox לא מזהה את המפתח (401). כנראה שזה לא מפתח Open Cloud תקף, או שפג תוקפו.'
        : e?.status === 403 ? `המפתח תקף אבל אין לו את ההרשאה ${p.scope} (403).` : e?.reason || 'שגיאה';
      return { key: p.key, endpoint: p.url.replace('https://apis.roblox.com', ''), scope: p.scope, status: typeof e?.status === 'number' ? e.status : null, ok: false, reason: why };
    }
  }));
}

export function roblox() {
  const ids = [...new Set([process.env.ROBLOX_PLUGIN_ASSET_ID, String(ASSET_ID)].filter((x) => ID.test(String(x || ''))))];
  const key = process.env.ROBLOX_CREATOR_TOKEN;
  const hasKey = typeof key === 'string' && key.length >= 16;
  return cached('roblox', async () => {
    try {
      const [econ, store, thumbs, favs] = await Promise.all([
        Promise.all(ids.map((id) => section(() => get(`https://economy.roblox.com/v2/assets/${id}/details`, `פרטי הנכס ${id}`)))),
        section(() => storeDetails(ids)),
        section(() => get(`https://thumbnails.roblox.com/v1/assets?assetIds=${ids.join(',')}&size=420x420&format=Png`, 'התמונות')),
        Promise.all(ids.map((id) => section(() => get(`https://catalog.roblox.com/v1/favorites/assets/${id}/count`, 'מספר המועדפים')))),
      ]);
      const thumbOf = new Map(list(thumbs.value?.data).filter((t) => t?.state === 'Completed' && typeof t.imageUrl === 'string' && /^https:\/\/[a-z0-9.-]+\.rbxcdn\.com\//.test(t.imageUrl))
        .map((t) => [String(t.targetId), t.imageUrl]));
      const assets = ids.map((id, i) => {
        if (econ[i].error) return { id, error: econ[i].error, url: storeUrl(id) };
        return { ...economy(id, econ[i].value), thumb: thumbOf.get(id) || null, favorites: numOr(favs[i].value),
          store: store.error ? { ok: false, reason: store.error } : store.value.get(id) || { listed: false } };
      });
      // Our creators: what the public Creator Store search lists under each one (plugins, type 38).
      const who = [...new Map(assets.filter((a) => a.creator?.id).map((a) => [a.creator.id, a.creator])).values()];
      const creators = await Promise.all(who.map(async (c) => {
        const t = c.type === 'Group' ? 2 : 1;
        const s = await section(() => get(`https://apis.roblox.com/toolbox-service/v1/marketplace/38?creatorTargetId=${c.id}&creatorType=${t}&limit=30`, 'החיפוש בחנות'));
        if (s.error) return { ...c, items: { ok: false, reason: s.error } };
        const itemIds = list(s.value?.data).map((x) => String(x?.id ?? '')).filter((x) => ID.test(x));
        const known = new Map(assets.filter((a) => a.store?.listed).map((a) => [a.id, a.store]));
        const more = await section(() => storeDetails(itemIds.filter((x) => !known.has(x)).slice(0, 30)));
        return { ...c, total: numOr(s.value?.totalResults), items: itemIds.map((x) => ({ id: x, url: storeUrl(x), ...(known.get(x) || more.value?.get(x) || { listed: true }) })) };
      }));
      const userIds = who.filter((c) => c.type !== 'Group').map((c) => c.id);
      const cloud = hasKey ? { configured: true, probes: await probes(key, userIds, assets.find((a) => a.store?.listed)?.id) } : { configured: false, need: ['ROBLOX_CREATOR_TOKEN'], probes: [] };
      if (cloud.configured) cloud.valid = cloud.probes.some((p) => p.ok) ? true : cloud.probes.length && cloud.probes.every((p) => p.status === 401) ? false : null;
      return scrub(ok({ assets, creators, cloud, analytics: ANALYTICS, creatorToken: hasKey, dashboardUrl: 'https://create.roblox.com/dashboard/creations' }));
    } catch (e) { return scrub(fail(e?.reason || 'Roblox לא זמין')); }
  }, 120000);
}

/** The Roblox page publishes nothing: every write is refused here, dry run included. */
export async function robloxAction(b = {}) {
  return fail(`הדף של Roblox קורא בלבד. אין בו פעולה שמעלה, מעדכנת או מפרסמת נכס${b?.kind ? ` (ביקשתם "${String(b.kind).slice(0, 40)}")` : ''}. עושים את זה ב-Creator Dashboard.`);
}
