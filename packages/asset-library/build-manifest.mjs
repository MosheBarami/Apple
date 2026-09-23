#!/usr/bin/env node
// Walks packs/<id>/ and writes manifest.json (what each pack is, its licence, counts, previews)
// and index.json (the compact file list the worker bundles for `find_ui_asset`).
//
// Only the words below are written by hand. Every count, the licence string and the file list are
// read off the directories, so the manifest cannot claim a file that is not in the checkout.
//
//   node packages/asset-library/build-manifest.mjs
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PACKS_DIR = join(HERE, 'packs');
const KENNEY = 'https://kenney.nl/assets/';

// kind: 'ui' = panels, buttons, bars and frames; 'icons' = single glyphs.
// variant: which of the pack's own folders were kept (see D-UILIB-2).
export const PACKS = [
  { id: 'kenney-ui-pack', page: 'ui-pack', kind: 'ui', name: 'UI Pack', nameHe: 'ערכת UI בסיסית',
    what: 'Buttons, panels, sliders, checkboxes, arrows and bars in blue, green, grey, red and yellow.',
    whatHe: 'כפתורים, פאנלים, סליידרים, תיבות סימון, חצים ופסים בחמישה צבעים',
    variant: 'PNG, Double (2x) size only',
    previews: ['blue/button_rectangle_depth_gradient.png', 'yellow/slide_horizontal_color.png', 'red/icon_checkmark.png'] },
  { id: 'kenney-ui-pack-rpg', page: 'ui-pack-rpg-expansion', kind: 'ui', name: 'UI Pack: RPG Expansion', nameHe: 'ערכת UI לפנטזיה ו-RPG',
    what: 'Parchment and wood panels, long buttons, bars and cursors for fantasy and RPG menus.',
    whatHe: 'פאנלים של קלף ועץ, כפתורים ופסי התקדמות לתפריטי פנטזיה',
    variant: 'PNG',
    previews: ['buttonLong_blue.png', 'panelInset_beige.png', 'iconCircle_brown.png'] },
  { id: 'kenney-ui-pack-sci-fi', page: 'ui-pack-sci-fi', kind: 'ui', name: 'UI Pack: Sci-Fi', nameHe: 'ערכת UI מדע בדיוני',
    what: 'Angular metal panels, header buttons, bars, cursors and crosshair frames for sci-fi and space games.',
    whatHe: 'פאנלים מתכתיים, כפתורי כותרת, פסים וכוונות למשחקי חלל',
    variant: 'PNG, Double (2x) size only',
    previews: ['blue/button_square_header_small_square.png', 'green/crosshair_color_c.png', 'red/bar_round_gloss_small.png'] },
  { id: 'kenney-ui-pack-adventure', page: 'ui-pack-adventure', kind: 'ui', name: 'UI Pack: Adventure', nameHe: 'ערכת UI הרפתקאות',
    what: 'Rounded panels, banners, checkboxes and progress bars for adventure and casual games.',
    whatHe: 'פאנלים מעוגלים, באנרים, תיבות סימון ופסי התקדמות למשחקי הרפתקאות',
    variant: 'PNG, Double (2x) size only',
    previews: ['panel_brown_dark.png', 'checkbox_beige_checked.png', 'round_grey_detailed_red.png'] },
  { id: 'kenney-fantasy-ui-borders', page: 'fantasy-ui-borders', kind: 'ui', name: 'Fantasy UI Borders', nameHe: 'מסגרות UI לפנטזיה',
    what: 'Ornate borders, filled panels and dividers that 9-slice into framed windows.',
    whatHe: 'מסגרות מעוטרות, פאנלים וקווי הפרדה לחלונות ממוסגרים',
    variant: 'PNG, Double (2x) size only',
    previews: ['panel/panel-013.png', 'border/panel-border-016.png', 'transparent-center/panel-transparent-center-005.png'] },
  { id: 'kenney-game-icons', page: 'game-icons', kind: 'icons', name: 'Game Icons', nameHe: 'אייקוני משחק',
    what: 'Menu and HUD icons (settings, sound, arrows, medals, players, controllers) in black and white.',
    whatHe: 'אייקונים לתפריט ול-HUD: הגדרות, צליל, חצים, מדליות ושחקנים, בשחור ולבן',
    variant: 'PNG, 2x size only',
    previews: ['white/medal1.png', 'white/musicOff.png', 'white/multiplayer.png'] },
  { id: 'kenney-game-icons-expansion', page: 'game-icons-expansion', kind: 'icons', name: 'Game Icons Expansion', nameHe: 'אייקוני משחק - הרחבה',
    what: 'More HUD icons: joystick moves, D-pad, keys, cloud and a coloured set.',
    whatHe: 'עוד אייקוני HUD: תנועות ג\'ויסטיק, חצים, מפתחות וסט צבעוני',
    variant: 'PNG, 2x size only (the bundled copy of the base pack is dropped)',
    previews: ['colored/fightJoy_09.png', 'white/cloudUpload.png', 'white/DPAD_right.png'] },
  { id: 'kenney-input-prompts', page: 'input-prompts', kind: 'icons', name: 'Input Prompts', nameHe: 'כפתורי שליטה',
    what: 'Keyboard, mouse, touch, Xbox, PlayStation, Switch, Steam Deck and other controller button prompts.',
    whatHe: 'כפתורי מקלדת, עכבר, מגע, Xbox, PlayStation, Switch ועוד, להסבר שליטה',
    variant: 'PNG, Double size only (fonts and vectors dropped)',
    previews: ['keyboard-mouse/keyboard_f.png', 'xbox-series/xbox_button_color_a.png', 'touch/touch_hand_open.png'] },
  { id: 'kenney-board-game-icons', page: 'board-game-icons', kind: 'icons', name: 'Board Game Icons', nameHe: 'אייקוני משחקי קופסה',
    what: 'Dice, cards, suits, pawns, tokens, resources and timers.',
    whatHe: 'קוביות, קלפים, כלי משחק, אסימונים, משאבים וטיימרים',
    variant: 'PNG, Double (128px) size only',
    previews: ['suit_hearts.png', 'sword.png', 'd10.png'] },
  { id: 'kenney-emotes', page: 'emotes-pack', kind: 'icons', name: 'Emotes', nameHe: 'אימוג\'ים ובועות רגש',
    what: 'Speech-bubble emotes (happy, angry, sleepy, hearts, alerts) in eight pixel and eight vector styles.',
    whatHe: 'בועות רגש: שמח, כועס, ישנוני, לבבות והתראות, ב-16 סגנונות',
    variant: 'PNG',
    previews: ['vector/style-1/emote_anger.png', 'pixel/style-1/emote_faceHappy.png', 'vector/style-3/emote_heart.png'] },
  { id: 'kenney-generic-items', page: 'generic-items', kind: 'icons', name: 'Generic Items', nameHe: 'חפצים כלליים',
    what: 'Inventory items (tools, weapons, potions, food, gems) in colour and as white silhouettes. Files are numbered, not named.',
    whatHe: 'חפצים למלאי: כלים, נשק, שיקויים, אוכל ואבני חן, בצבע ובלבן',
    variant: 'PNG',
    previews: ['colored/genericItem_color_080.png', 'colored/genericItem_color_041.png', 'colored/genericItem_color_157.png'] },
  { id: 'kenney-cursors', page: 'cursor-pack', kind: 'icons', name: 'Cursor Pack', nameHe: 'סמני עכבר',
    what: 'Mouse cursors: pointers, hands, resize arrows, busy hourglasses and tool cursors.',
    whatHe: 'סמני עכבר: חצים, ידיים, שינוי גודל, שעון חול וכלים',
    variant: 'PNG, Double size only',
    previews: ['basic/hand_small_point_e.png', 'basic/tool_wand.png', 'outline/tool_shovel.png'] },
  { id: 'kenney-crosshairs', page: 'crosshair-pack', kind: 'icons', name: 'Crosshair Pack', nameHe: 'כוונות',
    what: 'Two hundred crosshairs in dark, glow, light and outline styles.',
    whatHe: 'מאתיים כוונות לנשק בארבעה סגנונות',
    variant: 'PNG, 2x size only',
    previews: ['light/crosshair-034.png', 'glow/crosshair-119.png', 'outline/crosshair-024.png'] },
];

const IMAGE = /\.(png|svg)$/i;
const LICENCE_FILE = /^licen[cs]e(\.txt|\.md)?$/i;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

/** The licence as the pack's own licence file states it — never taken from this script. */
export function licenceOf(text) {
  if (/CC0|Creative Commons Zero|publicdomain\/zero/i.test(text)) return 'CC0-1.0';
  if (/CC BY 3\.0|creativecommons\.org\/licenses\/by\/3\.0/i.test(text)) return 'CC-BY-3.0';
  if (/CC BY 4\.0|creativecommons\.org\/licenses\/by\/4\.0/i.test(text)) return 'CC-BY-4.0';
  return null;
}

export function build() {
  const packs = [];
  const index = [];
  for (const meta of PACKS) {
    const dir = join(PACKS_DIR, meta.id);
    if (!existsSync(dir)) throw new Error(`${meta.id}: packs/${meta.id} is missing`);
    const all = walk(dir).map((abs) => relative(dir, abs).split('\\').join('/'));
    const licenceFile = all.find((p) => !p.includes('/') && LICENCE_FILE.test(p));
    if (!licenceFile) throw new Error(`${meta.id}: no licence file in packs/${meta.id}`);
    const license = licenceOf(readFileSync(join(dir, licenceFile), 'utf8'));
    if (!license) throw new Error(`${meta.id}: ${licenceFile} names no licence this library accepts`);
    const images = all.filter((p) => IMAGE.test(p));
    const bytes = images.reduce((n, p) => n + statSync(join(dir, p)).size, 0);
    for (const p of meta.previews) {
      if (!images.includes(p)) throw new Error(`${meta.id}: preview ${p} is not a file in the pack`);
    }
    const categories = {};
    for (const p of images) {
      const cat = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
      categories[cat] = (categories[cat] ?? 0) + 1;
    }
    const attribution = license.startsWith('CC-BY') ? meta.attribution ?? null : null;
    if (license.startsWith('CC-BY') && !attribution) throw new Error(`${meta.id}: a CC BY pack needs an attribution line`);
    packs.push({
      id: meta.id,
      name: meta.name,
      nameHe: meta.nameHe,
      kind: meta.kind,
      what: meta.what,
      whatHe: meta.whatHe,
      source: KENNEY + meta.page,
      author: 'Kenney (www.kenney.nl)',
      license,
      licenseFile: `packs/${meta.id}/${licenceFile}`,
      attribution,
      variant: meta.variant,
      files: images.length,
      bytes,
      categories,
      forAgent: true,
      forSite: true,
      previews: meta.previews.map((p) => `packs/${meta.id}/${p}`),
      dir: `packs/${meta.id}`,
    });
    // Grouped by folder so the bundled index stays small: [folder, [file names without .png]].
    const byFolder = new Map();
    for (const p of images.filter((q) => q.toLowerCase().endsWith('.png'))) {
      const cut = p.lastIndexOf('/');
      const folder = cut < 0 ? '' : p.slice(0, cut);
      if (!byFolder.has(folder)) byFolder.set(folder, []);
      byFolder.get(folder).push(p.slice(cut + 1, -4));
    }
    index.push({ id: meta.id, name: meta.name, kind: meta.kind, license, attribution, folders: [...byFolder] });
  }
  const totalFiles = packs.reduce((n, p) => n + p.files, 0);
  const manifest = {
    about: 'Openly licensed UI and icon packs Apple may hand to the agent and show on the site. Generated by build-manifest.mjs; do not edit by hand.',
    servedAt: '/asset-library/<pack id>/<path inside the pack>',
    totalFiles,
    totalBytes: packs.reduce((n, p) => n + p.bytes, 0),
    packs,
  };
  return { manifest, index: { servedAt: '/asset-library/', packs: index } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { manifest, index } = build();
  writeFileSync(join(HERE, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(join(HERE, 'index.json'), JSON.stringify(index) + '\n');
  console.log(`asset-library: ${manifest.packs.length} packs, ${manifest.totalFiles} files, ${(manifest.totalBytes / 1e6).toFixed(1)} MB`);
}
