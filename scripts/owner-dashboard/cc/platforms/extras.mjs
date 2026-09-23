// Small cards: the worker's health, the Roblox Creator Store listing (and two controls that tell a
// Roblox outage from a problem with our asset), and the platforms that are not connected yet.
import { cached, ok } from '../http.mjs';
import { workerHealth } from './cloudflare.mjs';

const STORE = 'https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=';
export const ASSET_ID = 107230158271368;
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
      robloxStore: { ...asset, url: `https://create.roblox.com/store/asset/${ASSET_ID}`, controls },
      stripe: { configured: Boolean(process.env.STRIPE_SECRET_KEY),
        how: 'ב-Stripe Dashboard → Developers → API keys צרו Restricted key לקריאה בלבד והוסיפו לקובץ ‎.env שורה STRIPE_SECRET_KEY=<המפתח>' },
      posthog: { configured: Boolean(process.env.POSTHOG_API_KEY) },
    });
  });
}
