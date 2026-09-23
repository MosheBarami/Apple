/**
 * F-059: THE ART DIRECTION FORBADE THE STYLE THE CUSTOMER ASKED FOR.
 *
 * 2026-09-23, the owner's gauntlet: "Build Basically Grow A Garden Type Game include 6 plots" on
 * Apple MAX came back as flat 0.2-stud slabs on realistic Grass, a grey path and two-part trees,
 * next to reference shots of bright, fenced, signposted plots. The model had followed its brief.
 * The brief banned Plastic outright, capped every large surface at HSV saturation 0.35 and offered
 * only desaturated palettes — the exact opposite of docs/ROBLOX-STYLE-SPEC.md, the repository's own
 * spec for simulators and tycoons ("Bright, saturated, high-key. No muted palettes"). The two
 * critics then enforced the same ban: vision.ts hard-failed any scene over 90% Plastic and
 * critic-input.ts reported every Plastic part as a "factory default", colours or not.
 *
 * These are GENERAL skills, not facts about one game (the owner's rule): a style chosen up front
 * and held, functional areas with volume and trim, organic shapes built from clusters, and a
 * reminder that keeps those rules alive after the full brief is collapsed.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const ESBUILD = join(WORKER, 'node_modules', '.bin', 'esbuild');
const DIR = mkdtempSync(join(tmpdir(), 'stylised-'));
function bundle(entry) {
  const out = join(DIR, entry.replace(/\W+/g, '_') + '.mjs');
  execFileSync(ESBUILD, [join(WORKER, 'src', entry), '--bundle', '--format=esm', '--target=es2022',
    '--main-fields=main,module', '--external:cloudflare:*', `--outfile=${out}`], { cwd: WORKER, stdio: 'pipe' });
  return import(`file://${out}`);
}
const { worldBuildingBrief, PALETTES, MOODS } = await bundle('worldbuilding.ts');
const { BRIEF_REMINDER } = await bundle('prompts.ts');
const { hardFailChecks } = await bundle('vision.ts');
const { metricsFromRender } = await bundle('critic-input.ts');

const hsv = ([r, g, b]) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return { s: max === 0 ? 0 : (max - min) / max, v: max / 255 };
};
/** The section of the brief that starts with `heading` and runs to the next blank line. */
const section = (brief, heading) => {
  const i = brief.indexOf(heading);
  assert.ok(i >= 0, `the brief has no ${heading} section`);
  const end = brief.indexOf('\n\n', i);
  return brief.slice(i, end < 0 ? undefined : end);
};

const PLOT_GAME = 'Build a farming tycoon with 6 plots';

// --------------------------------------------------------------- the style ---

test('the brief offers a stylised classic-Roblox style, and Plastic is part of it', () => {
  const brief = worldBuildingBrief(PLOT_GAME);
  const style = section(brief, 'STYLE');
  assert.match(style, /STYLISED/);
  assert.match(style, /SmoothPlastic/);
  assert.match(style, /REALISTIC/, 'the realistic style must still be on offer for showcases and horror');
});

test('no rule outside the realistic style bans Plastic or caps saturation', () => {
  const brief = worldBuildingBrief(PLOT_GAME);
  assert.doesNotMatch(section(brief, 'BANNED'), /Material=Plastic/, 'BANNED still bans Plastic for every style');
  assert.doesNotMatch(section(brief, 'SELF-CHECK'), /no Plastic/i, 'the self-check still demands no Plastic');
  // Every sentence carrying the saturation cap must belong to the realistic style.
  const sentences = brief.replace(/\n/g, ' ').split(/(?<=\.)\s+/);
  const capped = sentences.filter((s) => /saturation\s*<=\s*0\.35/i.test(s));
  assert.ok(capped.length > 0, 'the realistic saturation cap disappeared altogether');
  for (const s of capped) assert.match(s, /realistic/i, `an unconditional saturation cap: "${s}"`);
});

test('a saturated palette and a clear bright mood exist for the stylised look', () => {
  // Data, not prose: the palette the model is told to pick must actually be saturated, and the
  // mood must not wash it out with haze.
  const bright = Object.entries(PALETTES).filter(([, p]) => hsv(p.dominant).s >= 0.5 && p.materials.includes('SmoothPlastic'));
  assert.ok(bright.length >= 1, 'every palette is desaturated — the stylised look has nothing to pick');
  const clear = Object.entries(MOODS).filter(([, m]) => m.colorCorrection.Saturation >= 0.2 && m.atmosphere.Haze <= 1);
  assert.ok(clear.length >= 1, 'no mood keeps saturated colour vivid');
  for (const [, p] of bright) {
    assert.ok(p.moods.some((m) => clear.some(([name]) => name === m)), 'the bright palette is not paired with a clear mood');
  }
});

// ------------------------------------------------------- functional areas ---

test('functional areas are built with a base, a rim, a fence, a sign and props', () => {
  const areas = section(worldBuildingBrief(PLOT_GAME), 'FUNCTIONAL AREAS');
  for (const cue of [/thick/i, /rim/i, /fence/i, /posts?/i, /sign/i, /props/i]) assert.match(areas, cue);
});

test('organic shapes are clusters, never one primitive', () => {
  const organic = section(worldBuildingBrief(PLOT_GAME), 'ORGANIC SHAPES');
  assert.match(organic, /cluster/i);
  assert.match(organic, /tree/i);
  assert.match(organic, /fruit|foliage/i);
});

test('the sky is Lighting and a Clouds object, never Parts', () => {
  const lighting = section(worldBuildingBrief(PLOT_GAME), 'LIGHTING');
  assert.match(lighting, /Clouds/);
  assert.match(lighting, /Terrain/);
});

// ------------------------------------------------------------ scene kinds ---

test('a plot, tycoon or farming request gets the plot-game layout', () => {
  for (const text of [PLOT_GAME, 'make a tycoon', 'simulator with a hub',
    'Build Basically Grow A Garden Type Game include 6 plots make the full game make no mistakes']) {
    assert.match(worldBuildingBrief(text), /SCENE: PLOT GAME/, text);
  }
});

test('scene words match whole words, not substrings', () => {
  // "install" contains "stall" (-> shop) and "workshop" contains "shop"; "map" meant arena.
  assert.doesNotMatch(worldBuildingBrief('install a leaderboard'), /SCENE: SHOP/);
  assert.doesNotMatch(worldBuildingBrief('a workshop tutorial'), /SCENE: SHOP/);
  assert.doesNotMatch(worldBuildingBrief('make a map for my game'), /SCENE: ARENA/);
  // The positive controls: the same words used as words still route.
  assert.match(worldBuildingBrief('a market stall'), /SCENE: SHOP/);
  assert.match(worldBuildingBrief('a pvp arena'), /SCENE: ARENA/);
});

test('the first scene word in the request decides the kind', () => {
  // An obby that mentions a spawn is an obby; the old alias pass returned plaza for it.
  assert.match(worldBuildingBrief('an obby with a spawn and 20 stages'), /SCENE: OBBY/);
});

// --------------------------------------------------------------- the reminder ---

test('the collapsed reminder keeps the rules that the round-1 build broke', () => {
  // After the first change the full brief is replaced by BRIEF_REMINDER for the rest of the run —
  // which is most of it. The rules the round-1 build broke must survive that swap.
  for (const cue of [/style/i, /rim/i, /fence/i, /sign/i, /props/i, /cluster/i, /plan/i, /one element dominant/i]) {
    assert.match(BRIEF_REMINDER, cue);
  }
});

// ------------------------------------------------------------- the critics ---

const view = (name, over = {}) => ({
  name, rgbBase64: '',
  meta: { width: 288, height: 180, partsConsidered: 120, partsVisible: 110, partsOffCamera: 10,
    subjectCoverage: 0.5, distinctColours: 9,
    materials: [{ material: 'SmoothPlastic', parts: 70 }, { material: 'Plastic', parts: 34 }, { material: 'Neon', parts: 3 }],
    ...over },
});
const STYLISED = {
  subject: 'Workspace', boundsSize: [180, 30, 140], views: [view('hero'), view('front')],
  lighting: { brightness: 3, clockTime: 13, ambient: [100, 104, 112], lightInstances: 4, effects: ['Atmosphere', 'BloomEffect'] },
};
const GREYBOX = { ...STYLISED, views: [view('hero', { distinctColours: 2 }), view('front', { distinctColours: 2 })] };

test('a many-coloured Plastic scene is a style, not a missing material pass', () => {
  const fails = hardFailChecks(STYLISED, 'scene');
  assert.ok(!fails.some((f) => /Plastic/.test(f)), fails.join(' | '));
  assert.equal('factoryDefaultShare' in metricsFromRender(STYLISED), false,
    'nine colours of Plastic were reported as factory defaults');
});

test('an all-Plastic scene in two colours still fails both critics', () => {
  assert.ok(hardFailChecks(GREYBOX, 'scene').some((f) => /Plastic/.test(f)), 'the greybox check went blind');
  const m = metricsFromRender(GREYBOX);
  assert.ok(m.factoryDefaultShare > 0.3, `got ${m.factoryDefaultShare}`);
});
