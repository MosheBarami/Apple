// Roblox: the plugin's public catalogue record (economy API, no key) plus the Creator Store check that
// extras.mjs already runs. Nothing here uploads or edits an asset.
import { fetchJson, cached, ok, section } from '../http.mjs';
import { ASSET_ID } from './extras.mjs';

const details = (id) => fetchJson(`https://economy.roblox.com/v2/assets/${id}/details`, { label: 'Roblox', what: `פרטי הנכס ${id}` });

export function roblox() {
  const ids = [...new Set([process.env.ROBLOX_PLUGIN_ASSET_ID, String(ASSET_ID)].filter((x) => /^\d{3,20}$/.test(String(x || ''))))];
  return cached('roblox', async () => {
    const out = await Promise.all(ids.map(async (id) => {
      const s = await section(() => details(id));
      const d = s.value;
      return s.error ? { id, error: s.error } : {
        id, name: d?.Name ?? null, description: d?.Description ?? null, type: d?.AssetTypeId === 38 ? 'Plugin' : d?.AssetTypeId ?? null,
        creator: d?.Creator ? { name: d.Creator.Name, type: d.Creator.CreatorType, verified: Boolean(d.Creator.HasVerifiedBadge) } : null,
        created: d?.Created ?? null, updated: d?.Updated ?? null, sales: d?.Sales ?? null, forSale: Boolean(d?.IsForSale),
        price: d?.PriceInRobux ?? null, url: `https://create.roblox.com/store/asset/${id}`,
      };
    }));
    return ok({ assets: out, creatorToken: Boolean(process.env.ROBLOX_CREATOR_TOKEN) });
  }, 120000);
}
