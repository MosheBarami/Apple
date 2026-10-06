// Master plan §4.1 L1: human-made only. An item whose own words mention an AI tool is refused; an upload from 2024 on
// needs a creator on the known-human list. The result is kept on the item as `ai_check`. Pure.
export const AI_WORDS = /\b(ai|a\.i\.|cube|assistant|meshy|tripo|luma|midjourney|dall[·.\- ]?e|stable diffusion|sdxl|generated|text[- ]to[- ](3d|image|mesh))\b/i;

/**
 * { pass, reasons, checked_at }. `item` carries title, description, tags, created (ISO date) and creator; `known` is the
 * set of creators or studios verified as human (Kenney, Quaternius, Kay Lousberg, Poly Haven artists, Roblox, ...).
 */
export function aiCheck(item, known = new Set(), now = new Date().toISOString()) {
  const reasons = [];
  const words = [item.title, item.description, ...(item.tags ?? [])].filter(Boolean).join(' ');
  const hit = words.match(AI_WORDS);
  if (hit) reasons.push(`its own words mention "${hit[0]}"`);
  const year = Number(String(item.created ?? '').slice(0, 4));
  if (Number.isFinite(year) && year >= 2024 && !known.has(String(item.creator ?? '').toLowerCase())) {
    reasons.push(`uploaded ${year} by "${item.creator ?? 'unknown'}", who is not on the known-human list`);
  }
  if (!item.created) reasons.push('no creation date, so the 2024 rule cannot be applied');
  return { pass: reasons.length === 0, reasons, checked_at: now };
}
