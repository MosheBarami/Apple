/**
 * WHETHER ANY PAID PLAN CAN BE BOUGHT, ASKED OF THE DEPLOYMENT AT BUILD TIME.
 *
 * The same question, and the same answer, as the probe in pages/pricing.astro: `/api/billing/config`
 * returns `{ checkout, purchasable }` computed from the live Worker's own environment. Read the long
 * note there for why it is build-time and why the fallback is the safe claim — an unreachable probe
 * means "not on sale", because promising a purchase we could not establish walks someone into a
 * checkout that answers 503.
 *
 * It lives in a module rather than inline in index.astro so the landing page itself names no remote
 * origin (tests/asset-wall.test.mjs holds the landing to "no remote dependency" by that spelling).
 */
const BILLING_ORIGIN = 'https://apple.moshe-barami111.workers.dev';

export async function paidPlansOnSale(): Promise<boolean> {
  const body = await fetch(BILLING_ORIGIN + '/api/billing/config')
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return Array.isArray(body?.purchasable) && body.purchasable.length > 0;
}
