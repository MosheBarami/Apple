// Small cards: the worker's health, the Roblox Creator Store listing (and two controls that tell a
// Roblox outage from a problem with our asset), and the platforms that are not connected yet.
import { cached, ok } from '../http.mjs';
import { workerHealth } from './cloudflare.mjs';
// One source for the asset and for WHY it is not listed: packages/shared, which every product surface
// already follows. A bare 404 read as "waiting for approval"; since 2026-09-23 it is a recorded removal.
import { STUDIO_PLUGIN_ASSET_ID, STUDIO_PLUGIN_STORE_LIVE, STUDIO_PLUGIN_STORE_REFUSAL } from '../../../../packages/shared/src/index.ts';

const STORE = 'https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=';
export const ASSET_ID = Number(STUDIO_PLUGIN_ASSET_ID);
const CONTROLS = [6415005344, 1];

async function storeStatus(id) {
  const t0 = Date.now();
  try {
    const r = await fetch(STORE + id, { signal: AbortSignal.timeout(10000) });
    let found = null;
    try { const j = await r.json(); found = Array.isArray(j?.data) ? j.data.length > 0 : null; } catch {}
    return { assetId: id, httpStatus: r.status, found, ms: Date.now() - t0 };
  } catch (e) {
    return { assetId: id, httpStatus: null, found: null, ms: Date.now() - t0,
      reason: e?.name === 'TimeoutError' ? 'Roblox לא ענה תוך 10 שניות' : 'אין חיבור ל-Roblox' };
  }
}

export function extras() {
  return cached('extras', async () => {
    const [health, asset, ...controls] = await Promise.all([workerHealth(), storeStatus(ASSET_ID), ...CONTROLS.map(storeStatus)]);
    return ok({
      apple: health,
      robloxStore: { ...asset, url: `https://create.roblox.com/store/asset/${ASSET_ID}`, controls,
        siteSaysLive: STUDIO_PLUGIN_STORE_LIVE, refusal: STUDIO_PLUGIN_STORE_REFUSAL },
      stripe: { configured: Boolean(process.env.STRIPE_SECRET_KEY),
        how: 'ב-Stripe Dashboard → Developers → API keys צרו Restricted key לקריאה בלבד והוסיפו לקובץ ‎.env שורה STRIPE_SECRET_KEY=<המפתח>' },
      posthog: { configured: Boolean(process.env.POSTHOG_PERSONAL_API_KEY) },
    });
  });
}
