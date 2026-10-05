/**
 * THE FOUR KINDS OF PIECE, ONCE.
 *
 * The front page and the catalog both explain them, so the words live here and the two pages cannot
 * disagree. Plan section 1 names the four: any custom UI, game system, interactive prop or map area.
 *
 * `examples` are REQUESTS, copied word for word from planning/STUDPILOT-TEST-SET-DEV.md (the 60 requests the
 * product is built against). They are shown as things a person might type. They are never shown with a result:
 * no piece has passed the bar yet, and tests/catalog-examples.test.mjs fails if one of these is not a line of
 * that file or if a result sits beside it.
 */
export type PieceId = 'ui' | 'system' | 'prop' | 'area';

export interface Piece {
  id: PieceId;
  title: string;
  /** One sentence, a 13-year-old can read it. */
  short: string;
  /** What it is, for the catalog. */
  what: string;
  /** Requests, verbatim from the dev test set. */
  examples: string[];
}

export const PIECES: Piece[] = [
  {
    id: 'ui',
    title: 'Custom UI',
    short: 'The screens and menus your players tap: a shop, a settings window, the coins and level bar at the top.',
    what: 'Anything a player sees on top of the game and presses. A piece of UI has a layout, buttons that do something, and a look that fits your game.',
    examples: [
      'a shop screen for a pet simulator with 6 eggs, prices in gems, and a big featured egg at the top',
      'daily reward calendar with 7 days, today highlighted and claimed days greyed out',
      'HUD showing coins, gems and a level bar at the top of the screen',
    ],
  },
  {
    id: 'system',
    title: 'Game system',
    short: 'The rules that run behind the scenes: coins that save, a rebirth, eggs that hatch, a round with winners.',
    what: 'The part of a game that keeps score and remembers things. A system has scripts, saved data and numbers you can change later.',
    examples: [
      'a click-to-earn system: clicking gives coins, with a cooldown so autoclickers can\'t abuse it',
      'daily reward that gives more each day you come back in a row, resets if you miss a day',
      'a round system: 30s lobby, 2 minute round, winners get coins',
    ],
  },
  {
    id: 'prop',
    title: 'Interactive prop',
    short: 'A thing in the world that reacts to a player: a chest that opens, a door with a price, a portal.',
    what: 'One object you can walk up to. A prop has a model, a behavior when a player touches or presses it, and sound and effects that make it feel alive.',
    examples: [
      'a treasure chest that opens when you press E and gives coins with a sparkle',
      'a door that only opens if you have 500 coins',
      'a teleport portal with swirling particles that sends you to a second area',
    ],
  },
  {
    id: 'area',
    title: 'Map area',
    short: 'A place to walk through: a spawn hub, a crystal cave, a snowy village, a lava zone behind a gate.',
    what: 'A part of the map with a mood. An area has ground, landmarks, lighting and the things that make it feel like somewhere.',
    examples: [
      'a spawn hub for a simulator: spawn point, shop stall, rebirth altar, signs',
      'a crystal cave zone with glowing crystals, rocks and a dark blue mood',
      'a small floating sky island with a waterfall',
    ],
  },
];
