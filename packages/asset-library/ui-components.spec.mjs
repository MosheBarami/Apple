// The UI component library (D-UIONLY-1): which stored library files every component is made of.
//
// This is the ONLY hand-written part. build-ui-components.mjs reads it, refuses any file the index
// (index.json) or the checkout does not hold, and derives everything else from the files and the
// sources list: image sizes and 9-slice margins from the PNG itself, every colour from a named
// pixel of a named library file, the fonts from sources/ui.jsonl import-ok font rows, and the
// "seen in" references for each component from sources/ui.jsonl.
//
// `{colour}` in a path is expanded once per colour the skin lists; an object maps colour -> path.
//
//   node packages/asset-library/build-ui-components.mjs

/** One skin per genre family. The tool's `genre` argument picks one; `colour` picks a variant. */
export const SKINS = {
  simulator: {
    title: 'Simulator / Tycoon',
    genres: ['simulator', 'tycoon', 'clicker', 'pet'],
    font: 'Fredoka',
    colours: ['green', 'blue', 'yellow', 'red'],
    roles: {
      panel: 'kenney-ui-pack-sci-fi/extra/panel_glass.png',
      card: 'kenney-ui-pack/grey/button_square_depth_flat.png',
      header: 'kenney-ui-pack/{colour}/button_rectangle_depth_gloss.png',
      button_primary: 'kenney-ui-pack/{colour}/button_rectangle_depth_gloss.png',
      button_secondary: 'kenney-ui-pack/grey/button_rectangle_depth_gloss.png',
      button_icon: 'kenney-ui-pack/{colour}/button_square_depth_gloss.png',
      button_close: 'kenney-ui-pack/red/button_round_depth_gloss.png',
      tab_on: 'kenney-ui-pack/{colour}/button_rectangle_depth_flat.png',
      tab_off: 'kenney-ui-pack/grey/button_rectangle_depth_flat.png',
      bar_track: 'kenney-ui-pack-sci-fi/extra/bar_shadow_round_large.png',
      bar_fill: 'kenney-ui-pack-sci-fi/{colour}/bar_round_large.png',
      bar_health: 'kenney-ui-pack-sci-fi/red/bar_round_large.png',
      input: 'kenney-ui-pack/extra/input_rectangle.png',
      toggle_on: 'kenney-ui-pack/{colour}/check_square_color_checkmark.png',
      toggle_off: 'kenney-ui-pack/grey/check_square_grey.png',
      slider_track: 'kenney-ui-pack/{colour}/slide_horizontal_color.png',
      slider_handle: 'kenney-ui-pack/{colour}/slide_hangle.png',
      dropdown_arrow: 'kenney-ui-pack/{colour}/arrow_basic_s.png',
      chip: 'kenney-ui-pack-sci-fi/extra/bar_shadow_round_large.png',
      toast: 'kenney-ui-pack/grey/button_rectangle_depth_flat.png',
      tooltip: 'kenney-ui-pack-sci-fi/extra/bar_shadow_square_large.png',
      minimap_ring: 'kenney-ui-pack-adventure/minimap_ring_white.png',
      minimap_arrow: 'kenney-ui-pack-adventure/minimap_arrow_a.png',
      crosshair: 'kenney-ui-pack-sci-fi/{colour}/crosshair_color_a.png',
      divider: 'kenney-ui-pack/extra/divider.png',
    },
  },
  obby: {
    title: 'Obby',
    genres: ['obby', 'parkour', 'tower'],
    font: 'Fredoka',
    colours: ['yellow', 'blue', 'green', 'red'],
    roles: {
      panel: 'kenney-ui-pack/grey/button_square_depth_flat.png',
      card: 'kenney-ui-pack-sci-fi/extra/panel_glass.png',
      header: 'kenney-ui-pack/{colour}/button_rectangle_depth_flat.png',
      button_primary: 'kenney-ui-pack/{colour}/button_rectangle_depth_flat.png',
      button_secondary: 'kenney-ui-pack/grey/button_rectangle_depth_flat.png',
      button_icon: 'kenney-ui-pack/{colour}/button_round_depth_flat.png',
      button_close: 'kenney-ui-pack/red/button_round_depth_flat.png',
      tab_on: 'kenney-ui-pack/{colour}/button_rectangle_flat.png',
      tab_off: 'kenney-ui-pack/grey/button_rectangle_flat.png',
      bar_track: 'kenney-ui-pack-sci-fi/extra/bar_shadow_round_large.png',
      bar_fill: 'kenney-ui-pack-sci-fi/{colour}/bar_round_gloss_large.png',
      bar_health: 'kenney-ui-pack-sci-fi/red/bar_round_gloss_large.png',
      input: 'kenney-ui-pack/extra/input_rectangle.png',
      toggle_on: 'kenney-ui-pack/{colour}/check_round_color.png',
      toggle_off: 'kenney-ui-pack/grey/check_round_grey.png',
      slider_track: 'kenney-ui-pack/{colour}/slide_horizontal_color.png',
      slider_handle: 'kenney-ui-pack/{colour}/slide_hangle.png',
      dropdown_arrow: 'kenney-ui-pack/{colour}/arrow_basic_s.png',
      chip: 'kenney-ui-pack-sci-fi/extra/bar_shadow_round_large.png',
      toast: 'kenney-ui-pack/grey/button_rectangle_depth_flat.png',
      tooltip: 'kenney-ui-pack-sci-fi/extra/bar_shadow_round_large.png',
      minimap_ring: 'kenney-ui-pack-adventure/minimap_ring_white.png',
      minimap_arrow: 'kenney-ui-pack-adventure/minimap_arrow_a.png',
      crosshair: 'kenney-ui-pack-sci-fi/{colour}/crosshair_color_b.png',
      divider: 'kenney-ui-pack/extra/divider.png',
    },
  },
  adventure: {
    title: 'Horror / Adventure',
    genres: ['adventure', 'horror', 'rpg', 'survival', 'story'],
    font: 'Luckiest Guy',
    colours: ['brown', 'grey'],
    roles: {
      panel: 'kenney-ui-pack-adventure/panel_{colour}_dark.png',
      card: 'kenney-ui-pack-adventure/panel_{colour}.png',
      header: 'kenney-ui-pack-adventure/banner_hanging.png',
      button_primary: 'kenney-ui-pack-adventure/button_{colour}.png',
      button_secondary: { brown: 'kenney-ui-pack-adventure/button_grey.png', grey: 'kenney-ui-pack-adventure/button_brown.png' },
      button_icon: 'kenney-ui-pack-adventure/round_{colour}.png',
      button_close: 'kenney-ui-pack-adventure/button_red_close.png',
      tab_on: 'kenney-ui-pack-adventure/button_{colour}.png',
      tab_off: 'kenney-ui-pack-adventure/panel_{colour}_dark.png',
      bar_track: 'kenney-ui-pack-adventure/progress_transparent.png',
      bar_fill: { brown: 'kenney-ui-pack-adventure/progress_green.png', grey: 'kenney-ui-pack-adventure/progress_blue.png' },
      bar_health: 'kenney-ui-pack-adventure/progress_red.png',
      input: 'kenney-ui-pack-rpg/panelInset_beige.png',
      toggle_on: 'kenney-ui-pack-adventure/checkbox_{colour}_checked.png',
      toggle_off: 'kenney-ui-pack-adventure/checkbox_{colour}_empty.png',
      slider_track: 'kenney-ui-pack/grey/slide_horizontal_grey.png',
      slider_handle: 'kenney-ui-pack-adventure/round_{colour}.png',
      dropdown_arrow: 'kenney-ui-pack/grey/arrow_decorative_s.png',
      chip: 'kenney-ui-pack-adventure/panel_{colour}_dark.png',
      toast: 'kenney-ui-pack-adventure/panel_{colour}.png',
      tooltip: 'kenney-ui-pack-adventure/panel_grey_dark.png',
      minimap_ring: 'kenney-ui-pack-adventure/minimap_ring_{colour}_detail.png',
      minimap_arrow: 'kenney-ui-pack-adventure/minimap_arrow_b.png',
      crosshair: 'kenney-crosshairs/light/crosshair-010.png',
      divider: 'kenney-fantasy-ui-borders/divider/divider-000.png',
      border: 'kenney-fantasy-ui-borders/border/panel-border-010.png',
    },
  },
  shooter: {
    title: 'Shooter / Fighting',
    genres: ['shooter', 'fps', 'fighting', 'battle', 'combat', 'pvp'],
    font: 'Luckiest Guy',
    colours: ['blue', 'red', 'green', 'yellow'],
    roles: {
      panel: 'kenney-ui-pack-sci-fi/extra/panel_rectangle_screws.png',
      card: 'kenney-ui-pack-sci-fi/extra/panel_square.png',
      header: 'kenney-ui-pack-sci-fi/{colour}/bar_square_gloss_large.png',
      button_primary: 'kenney-ui-pack-sci-fi/{colour}/bar_square_gloss_large.png',
      button_secondary: 'kenney-ui-pack-sci-fi/extra/button_rectangle_depth.png',
      button_icon: 'kenney-ui-pack-sci-fi/extra/button_square_depth.png',
      button_close: 'kenney-ui-pack-sci-fi/red/bar_square_large_square.png',
      tab_on: 'kenney-ui-pack-sci-fi/{colour}/bar_square_large.png',
      tab_off: 'kenney-ui-pack-sci-fi/extra/bar_shadow_square_large.png',
      bar_track: 'kenney-ui-pack-sci-fi/extra/bar_shadow_square_large.png',
      bar_fill: 'kenney-ui-pack-sci-fi/{colour}/bar_square_large.png',
      bar_health: 'kenney-ui-pack-sci-fi/red/bar_square_large.png',
      input: 'kenney-ui-pack/extra/input_outline_rectangle.png',
      toggle_on: 'kenney-ui-pack/{colour}/check_square_color_checkmark.png',
      toggle_off: 'kenney-ui-pack/grey/check_square_grey.png',
      slider_track: 'kenney-ui-pack/{colour}/slide_horizontal_color.png',
      slider_handle: 'kenney-ui-pack/{colour}/slide_hangle.png',
      dropdown_arrow: 'kenney-ui-pack/grey/arrow_basic_s.png',
      chip: 'kenney-ui-pack-sci-fi/extra/bar_shadow_square_large.png',
      toast: 'kenney-ui-pack-sci-fi/extra/panel_rectangle.png',
      tooltip: 'kenney-ui-pack-sci-fi/extra/bar_shadow_square_large.png',
      minimap_ring: 'kenney-ui-pack-adventure/minimap_ring_grey.png',
      minimap_arrow: 'kenney-ui-pack-adventure/minimap_arrow_c.png',
      crosshair: 'kenney-ui-pack-sci-fi/{colour}/crosshair_color_a.png',
      divider: 'kenney-ui-pack/extra/divider.png',
    },
  },
};

/**
 * Where each skin's colours are read from: a pixel of a library file, never a hex typed here.
 * `ink_light` / `ink_dark` are the text colours; the builder picks whichever reads on the surface.
 */
export const INK = {
  ink_light: { asset: 'kenney-game-icons/white/star.png', at: 'centre' },
  ink_dark: { asset: 'kenney-game-icons/black/star.png', at: 'centre' },
};

/** Icon keys the components and the tool's `icon` / item `icon` fields accept. */
export const ICONS = {
  coin: 'kenney-game-icons-expansion/white/coin.png',
  gem: 'kenney-game-icons-expansion/white/diamond.png',
  star: 'kenney-game-icons/white/star.png',
  heart: 'kenney-board-game-icons/suit_hearts.png',
  gear: 'kenney-game-icons/white/gear.png',
  trophy: 'kenney-game-icons/white/trophy.png',
  cart: 'kenney-game-icons/white/shoppingCart.png',
  cross: 'kenney-game-icons/white/cross.png',
  check: 'kenney-game-icons/white/checkmark.png',
  lock: 'kenney-game-icons/white/locked.png',
  timer: 'kenney-board-game-icons/hourglass.png',
  rebirth: 'kenney-board-game-icons/arrow_clockwise.png',
  quest: 'kenney-board-game-icons/notepad.png',
  key: 'kenney-game-icons-expansion/white/key.png',
  gift: 'kenney-board-game-icons/award.png',
  crown: 'kenney-board-game-icons/crown_a.png',
  info: 'kenney-game-icons/white/information.png',
  warning: 'kenney-game-icons/white/warning.png',
  home: 'kenney-game-icons/white/home.png',
  play: 'kenney-ui-pack/extra/icon_play_light.png',
  pause: 'kenney-game-icons/white/pause.png',
  sword: 'kenney-board-game-icons/sword.png',
  shield: 'kenney-board-game-icons/shield.png',
  fist: 'kenney-game-icons-expansion/white/fightFist.png',
  jump: 'kenney-game-icons/white/up.png',
  target: 'kenney-game-icons/white/target.png',
  skull: 'kenney-board-game-icons/skull.png',
  fire: 'kenney-board-game-icons/fire.png',
  pet: 'kenney-board-game-icons/pawn.png',
  leaderboard: 'kenney-game-icons/white/leaderboardsSimple.png',
  menu: 'kenney-game-icons/white/menuGrid.png',
  music: 'kenney-game-icons/white/musicOn.png',
  sound: 'kenney-game-icons/white/audioOn.png',
  player: 'kenney-game-icons/white/singleplayer.png',
  dollar: 'kenney-board-game-icons/dollar.png',
  flag: 'kenney-game-icons-expansion/white/flag.png',
  tap: 'kenney-input-prompts/touch/touch_tap.png',
};

const ALL = ['simulator', 'obby', 'adventure', 'shooter'];

/**
 * Every component the tool can insert. `roles` / `icons` are what it is made of (the test holds the
 * builder to exactly these), `genres` is where it belongs, `seenIn` a pattern over sources/ui.jsonl
 * titles and notes that finds the published kits and references showing the same element.
 */
export const COMPONENTS = [
  // HUD
  { id: 'currency_counter', title: 'Currency counter', group: 'hud', genres: ALL, roles: ['chip'], icons: ['coin'], seenIn: 'currenc|\\bcoins?\\b|\\bcash\\b' },
  { id: 'stat_counter', title: 'Stat counter', group: 'hud', genres: ALL, roles: ['chip'], icons: ['star'], seenIn: '\\bstats?\\b|leaderstat|counter' },
  { id: 'health_bar', title: 'Health bar', group: 'hud', genres: ALL, roles: ['bar_track', 'bar_health'], icons: ['heart'], seenIn: 'health|\\bhp\\b' },
  { id: 'progress_bar', title: 'Progress bar', group: 'hud', genres: ALL, roles: ['bar_track', 'bar_fill'], icons: [], seenIn: 'progress' },
  { id: 'level_bar', title: 'Level / XP bar', group: 'hud', genres: ALL, roles: ['bar_track', 'bar_fill', 'button_icon'], icons: [], seenIn: '\\bxp\\b|\\blevels?\\b' },
  { id: 'timer', title: 'Timer', group: 'hud', genres: ALL, roles: ['chip'], icons: ['timer'], seenIn: 'timer|countdown|\\btime\\b' },
  { id: 'minimap_frame', title: 'Minimap frame', group: 'hud', genres: ['adventure', 'shooter'], roles: ['minimap_ring', 'minimap_arrow'], icons: [], seenIn: 'minimap|mini-map|mini map' },
  { id: 'notification_toast', title: 'Notification toast', group: 'hud', genres: ALL, roles: ['toast'], icons: ['info'], seenIn: 'notification|toast' },
  { id: 'tooltip', title: 'Tooltip', group: 'hud', genres: ALL, roles: ['tooltip'], icons: [], seenIn: 'tooltip|hover' },
  // Buttons
  { id: 'button_primary', title: 'Primary button', group: 'button', genres: ALL, roles: ['button_primary'], icons: [], seenIn: 'button' },
  { id: 'button_secondary', title: 'Secondary button', group: 'button', genres: ALL, roles: ['button_secondary'], icons: [], seenIn: 'button' },
  { id: 'button_icon', title: 'Icon button', group: 'button', genres: ALL, roles: ['button_icon'], icons: ['gear'], seenIn: 'icon' },
  { id: 'button_close', title: 'Close button', group: 'button', genres: ALL, roles: ['button_close'], icons: ['cross'], seenIn: 'close|exit|\\bx button' },
  { id: 'tab_bar', title: 'Tabs', group: 'button', genres: ALL, roles: ['tab_on', 'tab_off'], icons: [], seenIn: '\\btabs?\\b|categor' },
  // Windows
  { id: 'item_card', title: 'Shop item card', group: 'window', genres: ALL, roles: ['card', 'button_primary'], icons: ['coin', 'gift'], seenIn: '\\bcards?\\b|\\bitem' },
  { id: 'shop_window', title: 'Shop window with item cards', group: 'window', genres: ALL, roles: ['panel', 'header', 'button_close', 'card', 'button_primary'], icons: ['cross', 'coin', 'gift'], seenIn: '\\bshop|\\bstore\\b' },
  { id: 'inventory_grid', title: 'Inventory / pets grid', group: 'window', genres: ALL, roles: ['panel', 'header', 'button_close', 'card'], icons: ['cross', 'pet', 'lock'], seenIn: 'inventory|\\bpets?\\b|backpack' },
  { id: 'toggle', title: 'Toggle', group: 'window', genres: ALL, roles: ['toggle_on', 'toggle_off'], icons: [], seenIn: 'toggle|switch|checkbox' },
  { id: 'slider', title: 'Slider', group: 'window', genres: ALL, roles: ['slider_track', 'slider_handle'], icons: [], seenIn: 'slider' },
  { id: 'dropdown', title: 'Dropdown', group: 'window', genres: ALL, roles: ['input', 'dropdown_arrow'], icons: [], seenIn: 'dropdown|drop-down|select' },
  { id: 'settings_window', title: 'Settings window (toggle, slider, dropdown)', group: 'window', genres: ALL, roles: ['panel', 'header', 'button_close', 'toggle_on', 'toggle_off', 'slider_track', 'slider_handle', 'input', 'dropdown_arrow'], icons: ['cross'], seenIn: 'settings|options' },
  { id: 'dialog_confirm', title: 'Dialog / confirm', group: 'window', genres: ALL, roles: ['panel', 'header', 'button_primary', 'button_secondary'], icons: [], seenIn: 'dialog|confirm|popup|pop-up|prompt' },
  { id: 'rebirth_panel', title: 'Rebirth panel', group: 'window', genres: ['simulator'], roles: ['panel', 'header', 'button_close', 'chip', 'button_primary'], icons: ['cross', 'rebirth', 'coin'], seenIn: 'rebirth' },
  { id: 'daily_reward', title: 'Daily reward', group: 'window', genres: ['simulator', 'obby', 'adventure'], roles: ['panel', 'header', 'button_close', 'card', 'button_primary'], icons: ['cross', 'gift', 'check'], seenIn: 'daily|reward' },
  { id: 'codes_entry', title: 'Codes entry', group: 'window', genres: ALL, roles: ['panel', 'header', 'button_close', 'input', 'button_primary'], icons: ['cross', 'key'], seenIn: '\\bcodes?\\b|redeem' },
  { id: 'leaderboard', title: 'Leaderboard', group: 'window', genres: ALL, roles: ['panel', 'header', 'card'], icons: ['trophy', 'crown'], seenIn: 'leaderboard' },
  { id: 'quest_list', title: 'Quest list', group: 'window', genres: ['simulator', 'adventure', 'obby'], roles: ['panel', 'header', 'card', 'bar_track', 'bar_fill'], icons: ['quest', 'check'], seenIn: 'quest|mission|objective' },
  { id: 'loading_screen', title: 'Loading screen', group: 'window', genres: ALL, roles: ['panel', 'bar_track', 'bar_fill'], icons: [], seenIn: 'loading' },
  { id: 'main_menu', title: 'Main menu', group: 'window', genres: ALL, roles: ['header', 'button_primary', 'button_secondary'], icons: [], seenIn: 'main menu|\\bmenu' },
  // Mobile and combat
  { id: 'mobile_action_buttons', title: 'Mobile action buttons', group: 'mobile', genres: ALL, roles: ['button_icon'], icons: ['jump', 'sword', 'fist'], seenIn: 'mobile|touch' },
  { id: 'crosshair', title: 'Crosshair', group: 'combat', genres: ['shooter'], roles: ['crosshair'], icons: [], seenIn: 'crosshair' },
  { id: 'ammo_counter', title: 'Ammo counter', group: 'combat', genres: ['shooter'], roles: ['chip'], icons: ['target'], seenIn: 'ammo|\\bfps\\b|shooter|weapon|\\bguns?\\b' },
  // In the world
  { id: 'billboard_tag', title: 'Overhead name / price tag (BillboardGui)', group: 'world', genres: ALL, roles: ['chip'], icons: ['coin'], seenIn: 'billboard|nametag|name tag|overhead' },
  { id: 'surface_sign', title: 'Sign on a part (SurfaceGui)', group: 'world', genres: ALL, roles: ['panel', 'header'], icons: [], seenIn: 'surfacegui|surface gui|\\bsigns?\\b|board' },
];
