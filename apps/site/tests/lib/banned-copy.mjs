/**
 * THE WORDS NO SURFACE OF THE SITE MAY SAY, in one place for every guard that reads copy.
 *
 * tests/no-fake-output.test.mjs reads the built pages with BANNED; tests/share-surfaces.test.mjs reads the share card, the web manifest and the
 * description and title tags of every page with the same list, because words that are not allowed on the page are not allowed on the card
 * that links to it (the card and the manifest said "Describe a Roblox game. StudPilot builds it." while every page-reading guard was clean).
 *
 * STUDIO_BUILD_CLAIMS is the other half: while STUDIO_PLUGIN_STORE_LIVE is false new customers cannot get the plugin, and a sentence that says
 * StudPilot works inside Studio, or builds into the place you have open, is true of nobody who just arrived.
 *
 * Not a test file.
 */
export const BANNED = [
  [/sample critique/i, 'a critique the site drew (the old "Sample critique" stage)'],
  [/generates real geometry/i, 'the old "Generates real geometry" capability card (text-to-3D is not in the product)'],
  [/renders the scene/i, 'the old "renders the scene" capability (the product has no vision)'],
  [/text[- ]to[- ]3d/i, 'text-to-3D'],
  [/\b(?:whole|entire|complete)\s+(?:roblox\s+)?games?\b/i, 'whole-game framing (the product builds pieces)'],
  [/\bgame from (?:one|a single) (?:line|prompt|sentence)\b/i, 'whole-game framing'],
  [/\b(?:describe|ask for|tell us|type) an? (?:roblox )?game\b/i, 'whole-game framing (a game from a description; the product builds pieces)'],
  [/\b(?:looks?|sees?) at (?:the |your )?screenshots?\b/i, 'a vision claim (the AI does not look at screenshots)'],
  [/\b\d[\d,]* (?:pieces|builds) (?:passed|built|made|shipped)\b/i, 'a results claim'],
];

export const STUDIO_BUILD_CLAIMS = [
  [/\bworks? inside (?:roblox )?studio\b/i, '"works inside Roblox Studio" (new customers cannot get the plugin)'],
  [/\bstraight into (?:the|your) (?:place|studio)\b/i, '"straight into the place you have open" (needs the plugin)'],
  [/\bbuilds?\b[^.!?]{0,40}\b(?:in|inside|into) your (?:own )?(?:studio|place)\b/i, 'building "in your own Studio" stated without the plugin caveat'],
];
