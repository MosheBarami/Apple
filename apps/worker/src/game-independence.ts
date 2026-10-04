// G13 / G14: the delivered game must run without StudPilot, and must not pretend to sell anything.
//
// Two deterministic checks on Luau that StudPilot writes into a customer's place. Both take the
// scan variants tools.ts builds (comments stripped, literals folded) and, for edits, the script
// as it stood: a script that already offended can still be edited, it just cannot offend MORE.

export interface GameScriptRefusal {
  error: string;
  blocked: string[];
}

// A game script that phones home would stop working the day the subscription ends. Both the current host
// pattern and the one the product had before its rename: a game built earlier may carry either.
const OUR_HOSTS = /["'\[][^"'\]\n]*(?:workers\.dev|api\.z\.ai|bigmodel\.cn|open\.bigmodel|\.studpilot-rbx\.|\.apple-rbx\.|rbxai\.)[^"'\]\n]*["'\]]/gi;
// Requiring the Studio plugin (or anything named for it, under the current or the former name) from a game script.
const PLUGIN_REQUIRE = /\brequire\s*\(?\s*[^)\n]*\b(?:plugin|StudPilotBridge|StudPilotPlugin|AppleBridge|ApplePlugin|AppleAgent)\b/gi;

// Purchase APIs: a nonzero numeric literal argument is a fabricated id. 0 is the placeholder.
const PURCHASE_CALL =
  /\b(?:PromptProductPurchase|PromptGamePassPurchase|PromptPurchase|PromptBundlePurchase|PromptSubscriptionPurchase|UserOwnsGamePassAsync|GetProductInfo|PlayerOwnsAsset|PlayerOwnsBundle|GetUserSubscriptionStatusAsync)\s*\(([^)]*)\)/g;
// `local ProductId = 12345` / `GamePassId = 12345,`: a named product id set to a real-looking number.
const ID_ASSIGN = /\b\w*(?:product|gamepass|game_pass|bundle|subscription)\w*id\w*\s*=\s*([1-9]\d*)\b(?!\s*[.\w])/gi;

function count(variants: readonly string[], re: RegExp): { n: number; hits: string[] } {
  let best = { n: 0, hits: [] as string[] };
  for (const v of variants) {
    const hits = [...v.matchAll(re)].map((m) => m[0].trim());
    if (hits.length > best.n) best = { n: hits.length, hits };
  }
  return best;
}

function purchaseLiterals(variants: readonly string[]): { n: number; hits: string[] } {
  let best = { n: 0, hits: [] as string[] };
  for (const v of variants) {
    const hits: string[] = [];
    for (const m of v.matchAll(PURCHASE_CALL)) {
      if (/(?<![\w.])[1-9]\d*(?![\w.])/.test(m[1] ?? '')) hits.push(m[0].trim());
    }
    for (const m of v.matchAll(ID_ASSIGN)) hits.push(m[0].trim());
    if (hits.length > best.n) best = { n: hits.length, hits };
  }
  return best;
}

export function refuseApplyDependence(variants: readonly string[], before?: readonly string[]): GameScriptRefusal | null {
  const host = count(variants, OUR_HOSTS);
  const req = count(variants, PLUGIN_REQUIRE);
  const hadHost = before ? count(before, OUR_HOSTS).n : 0;
  const hadReq = before ? count(before, PLUGIN_REQUIRE).n : 0;
  const found = [...(host.n > hadHost ? host.hits : []), ...(req.n > hadReq ? req.hits : [])];
  if (!found.length) return null;
  return {
    error:
      `Refused (G13): this game script would reach StudPilot, GLM or the plugin at runtime (${found.slice(0, 3).join(' | ')}). ` +
      'The delivered game must stay playable and editable without StudPilot, GLM, Jev or an active subscription, so no inserted script may call our endpoints or require plugin modules. ' +
      'Keep the logic inside the game itself. Nothing was sent to Studio.',
    blocked: ['studpilot_runtime_dependency'],
  };
}

export function refuseFabricatedPurchaseId(variants: readonly string[], before?: readonly string[]): GameScriptRefusal | null {
  const after = purchaseLiterals(variants);
  const had = before ? purchaseLiterals(before).n : 0;
  if (after.n <= had) return null;
  return {
    error:
      `Refused (G14): this script hard-codes a purchase id (${after.hits.slice(0, 3).join(' | ')}). StudPilot never invents gamepass, developer-product or subscription ids. ` +
      'Read the id from owner config instead, for example a ModuleScript ReplicatedStorage.MonetizationConfig whose ids are 0 until the game owner creates the product on Roblox and pastes the id, ' +
      'and treat 0 as "not configured": the purchase button stays hidden or disabled and base gameplay is unchanged. Nothing was sent to Studio.',
    blocked: ['fabricated_purchase_id'],
  };
}

/** Both checks; the first refusal wins. */
export function refuseGameScript(variants: readonly string[], before?: readonly string[]): GameScriptRefusal | null {
  return refuseApplyDependence(variants, before) ?? refuseFabricatedPurchaseId(variants, before);
}

/** Every string under a `Source` key of a create_instances payload, for scanning. */
export function sourcesIn(items: unknown, out: string[] = []): string[] {
  if (Array.isArray(items)) for (const i of items) sourcesIn(i, out);
  else if (items && typeof items === 'object') {
    for (const [k, v] of Object.entries(items as Record<string, unknown>)) {
      if (k === 'Source' && typeof v === 'string') out.push(v);
      else sourcesIn(v, out);
    }
  }
  return out;
}
