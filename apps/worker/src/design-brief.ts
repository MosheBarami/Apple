// design-brief.ts — put learned UI grammar in front of the model BEFORE it writes a GUI.
//
// §G: "Golem must STOP defaulting to inventing every Roblox GUI and every visual primitive
// from a blank canvas." A library nothing reads does not change that. This is the read path.
//
// WHY IT IS SHAPED LIKE THE ART-DIRECTION BRIEF. `prompts.ts` already established the
// pattern and, more importantly, established its COST DISCIPLINE: a brief is re-sent on
// every step because the whole transcript is, so it is only included when the request is
// actually of that kind, and it is collapsed to a one-line reminder once the work stops
// being design work. This brief follows the same rules rather than inventing new ones.
//
// WHAT IT IS NOT. It does not paste a kit. §K is explicit that the corpus teaches grammar
// and the output must be Golem-authored, and the licence classification made that binding
// rather than stylistic: of the seed manifest's 24 free cartoon UI kits and world packs,
// ZERO can prove a licence. `composeBrief` enforces that boundary by refusing to emit
// concrete values for any rule sourced from something we may only read.

import { composeBrief, COMPONENTS, STYLE_FAMILIES } from '@golem/design';

/**
 * Which component the request is about.
 *
 * Ordered most-specific first, because a request naming both a modal and a button is about
 * the modal — the button is a part of it. Matching is on word boundaries so "shopping" does
 * not select the shop grammar.
 */
const COMPONENT_HINTS: ReadonlyArray<[RegExp, string]> = [
  [/\b(modal|dialog|popup|window)\w*/i, 'modal'],
  [/\b(toast|notification|notif|alert)\w*/i, 'toast'],
  [/\b(currency|coins?|cash|gems?|shards?|balance|wallet)\w*/i, 'currency-pill'],
  [/\b(gauge|progress|capacity|bar|meter)\w*/i, 'gauge'],
  [/\b(nav|navigation|sidebar|rail|menu)\w*/i, 'nav'],
  [/\b(tab|tabs)\b/i, 'tab'],
  [/\b(icon|pictogram|glyph)\w*/i, 'icon'],
  [/\b(card|tile|slot)\w*/i, 'card'],
  [/\b(counter|score|tally)\w*/i, 'counter'],
  [/\b(button|cta|press)\w*/i, 'button'],
  // `shops?` is bounded rather than \w*-suffixed: "shopping cart datastore bug" is a
  // persistence question, and matching it would spend a UI brief on every step of a run
  // that never draws a pixel. The other tokens keep \w* because "buttons" and "panels"
  // are the same request as their singulars.
  [/\b(shops?)\b/i, 'panel'],
  [/\b(panel|hud|inventory|screen|gui|ui|interface)\w*/i, 'panel'],
  [/\b(animat|motion|tween|transition|juice|feedback)\w*/i, 'motion'],
];

/**
 * Which style family. Only the families the library actually has rules for can be selected;
 * naming a family with no rules would produce an empty brief that looks like a failure of
 * the request rather than of the library's coverage.
 */
const FAMILY_HINTS: ReadonlyArray<[RegExp, string]> = [
  [/\b(tycoon)\w*/i, 'tycoon'],
  [/\b(simulator|sim)\b/i, 'cartoon-simulator'],
  [/\b(cartoon|colou?rful|chunky|playful)\w*/i, 'cartoon-simulator'],
  [/\b(incremental|idle|clicker)\w*/i, 'incremental'],
  [/\b(pet|pets|collection|collect)\w*/i, 'pets-collection'],
  [/\b(studs?|classic|retro|old ?school|2008|nostalgi)\w*/i, 'studs-classic'],
  [/\b(rpg|fantasy|quest|dungeon)\w*/i, 'rpg'],
  [/\b(minimal|clean|sleek|understated)\w*/i, 'minimalist'],
  [/\b(mobile|phone|touch|portrait)\w*/i, 'mobile-first'],
  [/\b(controller|gamepad|console)\w*/i, 'controller-first'],
  [/\b(farm|farming|harvest)\w*/i, 'farming'],
  [/\b(obby|parkour|platform)\w*/i, 'obby'],
];

const PLATFORM_HINTS: ReadonlyArray<[RegExp, string]> = [
  [/\b(mobile|phone|touch|tablet)\w*/i, 'mobile'],
  [/\b(desktop|pc|keyboard)\w*/i, 'desktop'],
];

function firstHit(text: string, table: ReadonlyArray<[RegExp, string]>, allowed?: ReadonlyArray<string>): string | undefined {
  for (const [re, value] of table) {
    if (re.test(text) && (!allowed || allowed.includes(value))) return value;
  }
  return undefined;
}

export interface DesignBrief {
  text: string;
  /** Rule ids, for the admin trace. Policy metadata, never user-facing. */
  used: string[];
  component?: string;
  styleFamily?: string;
}

/**
 * Build the UI grammar brief for a request, or return null when the library has nothing
 * useful to say.
 *
 * NULL IS A REAL ANSWER AND MUST STAY ONE. The library covers a fraction of the style
 * families §L asks for, and padding a thin match into a prompt would spend tokens on every
 * step of the run to tell the model things it did not need. An empty brief is also how the
 * coverage gap stays visible in the trace rather than being hidden by a filler paragraph.
 */
export function designBrief(text: string, opts: { limit?: number } = {}): DesignBrief | null {
  const component = firstHit(text, COMPONENT_HINTS, COMPONENTS);
  const styleFamily = firstHit(text, FAMILY_HINTS, STYLE_FAMILIES);
  const platform = firstHit(text, PLATFORM_HINTS);
  if (!component && !styleFamily) return null;

  // 8 rather than the library default of 12: this rides in a system prompt that is re-sent
  // on every step, and the marginal rule is worth less than the tokens it costs on step 14.
  const brief = composeBrief(
    { component, styleFamily, platform, need: text.slice(0, 240) },
    { limit: opts.limit ?? 8 },
  );
  if (brief.count === 0) return null;
  return { text: brief.text, used: brief.used, component, styleFamily };
}
