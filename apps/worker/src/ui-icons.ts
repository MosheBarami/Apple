/**
 * Which icon a piece of game UI shows, chosen from what it is about (phase T, game 1, flaws 15 and 16: a counter for
 * "Crystals" drew a dollar coin, and "Pickaxe Power" drew a pointing finger). Pure, so a test can hold it.
 *
 * Two vocabularies, one table:
 *  - the UI library's icon keys (packages/asset-library/ui-components.json `icons`: coin, gem, star, heart ...) are what
 *    insert_ui_component draws, and are the names the agent may pass as `icon`;
 *  - the studded screens (stud-ui.ts) draw a glyph in a bubble, so each key also has one glyph. A few keys the library has
 *    no picture for (pickaxe, boots, bag, clover, magnet, robot, sparkle, bolt) are studded-only and marked as such.
 *
 * A subject that matches nothing falls back to a NEUTRAL icon (star), never to the dollar coin: a coin says "money",
 * which is a claim about the game that nothing here has checked.
 */
import lib from '../../../packages/asset-library/ui-components.json';

/** The UI library's own icon keys: the ones insert_ui_component can draw. */
export const LIBRARY_ICON_KEYS: readonly string[] = Object.keys((lib as unknown as { icons: Record<string, string> }).icons);

/** Keys with a studded glyph but no library picture. */
export const STUDDED_ONLY_KEYS = ['pickaxe', 'boots', 'bag', 'clover', 'magnet', 'robot', 'sparkle', 'bolt'] as const;

/** The glyph a studded bubble draws for each key (the game font falls back to emoji for these, as it did for the first set). */
export const GLYPHS: Readonly<Record<string, string>> = {
  coin: '$', dollar: '$', gem: '\u{1F48E}', star: '⭐', heart: '❤', trophy: '\u{1F3C6}', key: '\u{1F511}', gift: '\u{1F381}',
  skull: '\u{1F480}', fire: '\u{1F525}', timer: '⏱', rebirth: '♻', sword: '⚔', shield: '\u{1F6E1}',
  jump: '⬆', target: '\u{1F3AF}', pet: '\u{1F43E}', fist: '\u{1F44A}', tap: '\u{1F446}', cart: '\u{1F6D2}', quest: '❗',
  home: '\u{1F3E0}', flag: '\u{1F6A9}', gear: '⚙', lock: '\u{1F512}', check: '✔', info: 'ℹ', warning: '⚠', cross: '✖',
  leaderboard: '\u{1F3C5}', menu: '☰', music: '\u{1F3B5}', sound: '\u{1F50A}', player: '\u{1F464}', play: '▶', pause: '⏸',
  pickaxe: '⛏', boots: '\u{1F45F}', bag: '\u{1F392}', clover: '\u{1F340}', magnet: '\u{1F9F2}', robot: '\u{1F916}', sparkle: '✨', bolt: '⚡',
};

/** Worded subjects, first match wins. Prefix matches, so "crystals" and "crystalline" both read as crystal. */
const CURRENCY_WORDS: [RegExp, string][] = [
  [/\b(gem|crystal|diamond|jewel|ruby|emerald|sapphire|shard|ore\b|ores\b)/, 'gem'],
  [/\b(coin|cash|money|gold|dollar|buck|credit|silver|penny|pennies|currency|wealth|funds)/, 'coin'],
  [/\b(hearts?|love|lives|life)\b/, 'heart'],
  [/\b(trophy|trophies|win|wins|medal|medals|victor)\b|\bvictor/, 'trophy'],
  [/\b(key|keys)\b/, 'key'],
  [/\b(gift|present|candy|candies|treat|sweet)/, 'gift'],
  [/\b(rebirth|prestige)/, 'rebirth'],
  [/\b(soul|souls|skull|bone|bones)\b/, 'skull'],
  [/\b(fire|flame|ember|lava|coal)/, 'fire'],
  [/\b(time|second|seconds|minute)\b/, 'timer'],
  [/\b(star|stars|stardust|point|points|score|xp|exp)\b/, 'star'],
];

/** What an upgrade does, from its own name, first match wins. */
const EFFECT_WORDS: [RegExp, string][] = [
  [/\b(pick|axe|mining|mine\b|dig\b|digging|drill|hammer|tool)/, 'pickaxe'],
  [/\b(speed|fast|swift|quick|sprint|walk|haste|run\b|runner|running|boots?\b)/, 'boots'],
  [/\b(luck|lucky|clover|fortune|rare|chance)/, 'clover'],
  [/\b(bag|backpack|capacity|storage|inventory|carry|pocket|space|slot)/, 'bag'],
  [/\b(magnet|collect|range|reach|vacuum|radius)/, 'magnet'],
  [/\b(auto\w*|bots?|robots?|helpers?|workers?|miners?|assistants?|drones?|idle)\b/, 'robot'],
  [/\b(sword|blade|damage|attack|strength|weapon)/, 'sword'],
  [/\b(armou?r|defen[cs]e|shield|guard|tough)/, 'shield'],
  [/\b(health|hp|heal|vital)/, 'heart'],
  [/\b(jump|leap|hop|hops|hopping)\b/, 'jump'],
  [/\b(gem|crystal|diamond)/, 'gem'],
  [/\b(coin|cash|money|gold|income|profit|sell|value|wealth)/, 'coin'],
  [/\b(taps?|tapping|click|press|finger|touch)/, 'tap'],
  [/\b(multiplier|double|triple|bonus|boost|golden|x\d)/, 'sparkle'],
  [/\b(fire|flame|burn)/, 'fire'],
  [/\b(time|timer|cooldown|duration)/, 'timer'],
  [/\b(pet|companion|buddy)/, 'pet'],
  [/\b(keys?|unlock)\b/, 'key'],
];

const lower = (...parts: unknown[]) => parts.map((p) => String(p ?? '')).join(' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-.]+/g, ' ').toLowerCase();

/** A key (or glyph-bearing name) the agent typed, mapped to a key we know; undefined when it is something else. */
export function knownKey(v: unknown): string | undefined {
  const k = String(v ?? '').trim().toLowerCase();
  return k in GLYPHS ? k : undefined;
}

/**
 * The icon key of a currency from the words naming it. Nothing named -> 'coin' (the old default, so a caller that never
 * said what the money is keeps what it had); something named that matches nothing -> 'star', the neutral icon.
 */
export function currencyIconKey(...named: unknown[]): string {
  const text = lower(...named).replace(/[^a-z]+/g, ' ').trim();
  if (!text) return 'coin';
  for (const [re, key] of CURRENCY_WORDS) if (re.test(text)) return key;
  return 'star';
}

/** The studded glyph for a currency's words. */
export const currencyGlyph = (...named: unknown[]): string => GLYPHS[currencyIconKey(...named)]!;

/**
 * The icon key of an upgrade from what it is called (its label and id); undefined when nothing in the name says what it
 * does, so the caller keeps the icon of its kind.
 */
export function effectIconKey(...named: unknown[]): string | undefined {
  const text = lower(...named);
  for (const [re, key] of EFFECT_WORDS) if (re.test(text)) return key;
  return undefined;
}

/** The glyph an icon the agent gave stands for: a known key becomes its glyph, anything else is kept as typed. */
export function glyphOf(icon: string): string {
  const key = knownKey(icon);
  return key ? GLYPHS[key]! : icon;
}

/** A round money token is gold; any other glyph sits on a cream disc so a picture reads as a picture, not as a coin. */
export const isMoneyGlyph = (glyph: string): boolean => glyph === '$';
