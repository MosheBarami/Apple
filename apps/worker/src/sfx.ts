// Sound effects Golem SYNTHESISES, because the ones it could reference do not exist.
//
// READ effects.ts's header first — this file is the other half of the argument it makes. That file
// ships particle and light presets and refuses to ship a sound library, for a reason worth
// repeating: `rbxasset://` paths that do not exist do not error. `Sound.SoundId` accepts the
// string, the Sound plays nothing, and the scene is silent in exactly the way a scene with no
// sound at all is silent. The only engine sound path this repository can actually evidence is one
// line in apps/benchmark/crystal-canyon/src/client/Effects.luau, so a catalogue of plausible
// `rbxasset://` sound ids would be a table of silent failures that every test would pass.
//
// So the audio is MADE HERE, out of oscillators and noise, and arrives as bytes. That has three
// consequences worth stating plainly:
//   * It costs zero neurons and calls no provider. A footstep is arithmetic.
//   * Its provenance is unambiguous: `procedural` in asset-library.ts's vocabulary maps to
//     `golem_original`, which is the only originality class Golem may present as its own work.
//   * It is DETERMINISTIC. The same preset and seed produce the same bytes on every machine, so a
//     regression in a filter is a diff rather than an opinion, and a user who liked take 7 can
//     have take 7 again.
//
// WHAT THIS IS NOT. There is no neural audio model here and nothing that takes a text prompt: a
// preset is a recipe someone tuned, not a description someone typed. "Generate the sound of a
// dragon eating a bell" is not a request this file can serve, and it says so rather than returning
// filtered noise with a confident name.
//
// AND THERE IS STILL NO PATH THAT UPLOADS ANY OF IT TO ROBLOX. Roblox audio must be uploaded and
// moderated under an account before a Sound can reference it; nothing in this worker does that.
// The bytes are for the user to hear and to download. Telling them a sound has been placed in
// their game would be the same lie `generate_image` is careful not to tell.
import {
  type AudioFault,
  type PcmAudio,
  fromDb,
  isAudioFault,
  master,
  toDbfs,
} from './audio';

// ---------------------------------------------------------------------------------------------
// The recipe vocabulary
// ---------------------------------------------------------------------------------------------

/**
 * What a layer's oscillator does. `noise` is the workhorse — impacts, wind, rain and footsteps are
 * all filtered noise with different envelopes, which is why the filter fields matter more than the
 * waveform ones.
 */
export type Waveform = 'noise' | 'sine' | 'triangle' | 'square' | 'saw';

export interface SfxLayer {
  wave: Waveform;
  /** Pitch at the start of the layer. Ignored by `noise`. */
  startHz?: number;
  /** Pitch at the end; glides exponentially from `startHz`. Absent means no glide. */
  endHz?: number;
  /** Layer gain before the master stage, 0–1. */
  level: number;
  attackMs: number;
  decayMs: number;
  /** Level held after the decay, 0–1. A one-shot leaves this at 0. */
  sustain?: number;
  releaseMs?: number;
  /** Delay before the layer starts. This is how a crack lands after a thud. */
  delayMs?: number;
  /** One-pole low-pass, swept from this to `lowPassEndHz`. The sweep is what makes a whoosh. */
  lowPassHz?: number;
  lowPassEndHz?: number;
  /** One-pole high-pass, static. Removes the mud a low-passed noise layer leaves behind. */
  highPassHz?: number;
  tremoloHz?: number;
  /** 0–1. 1 means the tremolo takes the layer to silence at the bottom of its cycle. */
  tremoloDepth?: number;
}

export type SfxFamily = 'footstep' | 'ui' | 'combat' | 'ambience';

export interface SfxPreset {
  family: SfxFamily;
  /** What a person would call it. */
  summary: string;
  /** When to reach for it, written for the model that will read it in a tool description. */
  use: string;
  seconds: number;
  /**
   * Render a seamless loop: the tail is crossfaded into the head so the clip can be set
   * `Looped = true` in Roblox without a click at the seam. Only ambience uses it.
   */
  loop?: boolean;
  layers: SfxLayer[];
}

// ---------------------------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------------------------
//
// Tuned rather than plausible, in the same sense as EFFECTS in effects.ts. Three rules run through
// all of it:
//   * Footsteps are two layers, not one. The body (a low, fast thud) is what makes it a foot and
//     not a rustle; the surface lives entirely in the noise layer's filter band and decay.
//   * UI sounds are SHORT — 60–180 ms. A UI sound long enough to notice is a UI sound the player
//     will hear ten thousand times and come to hate.
//   * Every one-shot ends at silence. A layer whose envelope stops above zero clicks on the way
//     out, which is the single most common defect in generated sound effects.

export const SFX: Record<string, SfxPreset> = {
  // ------------------------------------------------------------------ footsteps ---
  footstep_grass: {
    family: 'footstep',
    summary: 'A soft, dry rustle with almost no body.',
    use: 'Lawns, meadows, jungle floor. The quietest surface in the set — grass absorbs the thud.',
    seconds: 0.22,
    layers: [
      { wave: 'sine', startHz: 90, endHz: 62, level: 0.22, attackMs: 1, decayMs: 55 },
      { wave: 'noise', level: 0.5, attackMs: 2, decayMs: 130, highPassHz: 900, lowPassHz: 5200, lowPassEndHz: 2200 },
    ],
  },
  footstep_stone: {
    family: 'footstep',
    summary: 'A hard, bright tap with a short slap of room.',
    use: 'Flagstone, marble, concrete, castle floors. Reads as indoors and heavy.',
    seconds: 0.26,
    layers: [
      { wave: 'sine', startHz: 128, endHz: 74, level: 0.4, attackMs: 1, decayMs: 70 },
      { wave: 'noise', level: 0.42, attackMs: 1, decayMs: 95, highPassHz: 1800, lowPassHz: 9000, lowPassEndHz: 4200 },
    ],
  },
  footstep_wood: {
    family: 'footstep',
    summary: 'A hollow knock with a woody ring under it.',
    use: 'Decks, floorboards, docks, treehouses. The ring is what separates wood from stone.',
    seconds: 0.28,
    layers: [
      { wave: 'sine', startHz: 168, endHz: 96, level: 0.42, attackMs: 1, decayMs: 110 },
      { wave: 'triangle', startHz: 320, endHz: 300, level: 0.14, attackMs: 2, decayMs: 150, delayMs: 6 },
      { wave: 'noise', level: 0.3, attackMs: 1, decayMs: 70, highPassHz: 1200, lowPassHz: 6500, lowPassEndHz: 3000 },
    ],
  },
  footstep_gravel: {
    family: 'footstep',
    summary: 'A loose, scattered crunch that keeps moving after the step lands.',
    use: 'Paths, quarries, riverbanks, rubble. The long bright tail is the giveaway.',
    seconds: 0.34,
    layers: [
      { wave: 'sine', startHz: 104, endHz: 66, level: 0.25, attackMs: 1, decayMs: 60 },
      { wave: 'noise', level: 0.55, attackMs: 1, decayMs: 240, highPassHz: 2400, lowPassHz: 11000, lowPassEndHz: 6000 },
    ],
  },
  footstep_metal: {
    family: 'footstep',
    summary: 'A ringing clang on a hollow plate.',
    use: 'Catwalks, hulls, machinery, sci-fi corridors. Loud on purpose.',
    seconds: 0.4,
    layers: [
      { wave: 'sine', startHz: 150, endHz: 120, level: 0.3, attackMs: 1, decayMs: 80 },
      { wave: 'triangle', startHz: 860, endHz: 840, level: 0.2, attackMs: 1, decayMs: 320 },
      { wave: 'triangle', startHz: 1290, endHz: 1270, level: 0.12, attackMs: 1, decayMs: 260, delayMs: 3 },
      { wave: 'noise', level: 0.3, attackMs: 1, decayMs: 60, highPassHz: 3000, lowPassHz: 12000, lowPassEndHz: 7000 },
    ],
  },
  footstep_snow: {
    family: 'footstep',
    summary: 'A muffled squeak with the top end rolled off.',
    use: 'Snow, deep sand, thick carpet. Everything above 3 kHz is gone, which is the effect.',
    seconds: 0.26,
    layers: [
      { wave: 'sine', startHz: 84, endHz: 56, level: 0.24, attackMs: 2, decayMs: 80 },
      { wave: 'noise', level: 0.4, attackMs: 3, decayMs: 150, highPassHz: 300, lowPassHz: 2600, lowPassEndHz: 900 },
    ],
  },
  footstep_water: {
    family: 'footstep',
    summary: 'A shallow splash with a wet tail.',
    use: 'Puddles, shorelines, ankle-deep streams. Pair with `ambience_stream` for a riverbank.',
    seconds: 0.36,
    layers: [
      { wave: 'sine', startHz: 120, endHz: 60, level: 0.2, attackMs: 2, decayMs: 70 },
      { wave: 'noise', level: 0.5, attackMs: 4, decayMs: 260, highPassHz: 700, lowPassHz: 7000, lowPassEndHz: 1400 },
    ],
  },

  // ------------------------------------------------------------------------- UI ---
  ui_click: {
    family: 'ui',
    summary: 'A single dry tick.',
    use: 'Every ordinary button. Deliberately the least interesting sound in the set.',
    seconds: 0.07,
    layers: [
      { wave: 'triangle', startHz: 1400, endHz: 900, level: 0.45, attackMs: 1, decayMs: 45 },
      { wave: 'noise', level: 0.12, attackMs: 0, decayMs: 18, highPassHz: 3000 },
    ],
  },
  ui_confirm: {
    family: 'ui',
    summary: 'Two rising notes. Reads as "yes, that worked".',
    use: 'Save, accept, claim, equip. Never for navigation — it is too positive to hear constantly.',
    seconds: 0.26,
    layers: [
      { wave: 'sine', startHz: 660, endHz: 660, level: 0.34, attackMs: 3, decayMs: 110 },
      { wave: 'sine', startHz: 990, endHz: 990, level: 0.32, attackMs: 3, decayMs: 150, delayMs: 85 },
    ],
  },
  ui_error: {
    family: 'ui',
    summary: 'A low, flat two-tone buzz falling away.',
    use: 'Refused, not enough coins, locked. Blunt without being harsh.',
    seconds: 0.3,
    layers: [
      { wave: 'square', startHz: 220, endHz: 150, level: 0.24, attackMs: 2, decayMs: 190, lowPassHz: 2200 },
      { wave: 'sine', startHz: 150, endHz: 110, level: 0.2, attackMs: 2, decayMs: 220, delayMs: 60 },
    ],
  },
  ui_open: {
    family: 'ui',
    summary: 'A short upward sweep.',
    use: 'Opening a panel, a shop, an inventory. Pairs with `ui_close`.',
    seconds: 0.2,
    layers: [
      { wave: 'triangle', startHz: 420, endHz: 1250, level: 0.3, attackMs: 4, decayMs: 150 },
      { wave: 'noise', level: 0.08, attackMs: 4, decayMs: 120, highPassHz: 2000, lowPassHz: 4000, lowPassEndHz: 9000 },
    ],
  },
  ui_close: {
    family: 'ui',
    summary: 'The same sweep, downward.',
    use: 'Closing whatever `ui_open` opened. The pair is what makes the UI feel physical.',
    seconds: 0.2,
    layers: [
      { wave: 'triangle', startHz: 1250, endHz: 420, level: 0.3, attackMs: 3, decayMs: 150 },
      { wave: 'noise', level: 0.08, attackMs: 3, decayMs: 120, highPassHz: 2000, lowPassHz: 9000, lowPassEndHz: 4000 },
    ],
  },
  ui_coin: {
    family: 'ui',
    summary: 'A bright two-note chime with a metallic edge.',
    use: 'Picking up currency. Short enough to fire ten times a second without turning to mush.',
    seconds: 0.3,
    layers: [
      { wave: 'sine', startHz: 1320, endHz: 1320, level: 0.3, attackMs: 1, decayMs: 90 },
      { wave: 'sine', startHz: 1980, endHz: 1980, level: 0.26, attackMs: 1, decayMs: 200, delayMs: 45 },
      { wave: 'triangle', startHz: 2640, endHz: 2600, level: 0.1, attackMs: 1, decayMs: 160, delayMs: 45 },
    ],
  },
  ui_purchase: {
    family: 'ui',
    summary: 'A three-note rising flourish.',
    use: 'A real purchase or a tier unlock — something that happens rarely enough to earn 0.6s.',
    seconds: 0.6,
    layers: [
      { wave: 'sine', startHz: 523, endHz: 523, level: 0.3, attackMs: 4, decayMs: 200 },
      { wave: 'sine', startHz: 659, endHz: 659, level: 0.3, attackMs: 4, decayMs: 220, delayMs: 110 },
      { wave: 'sine', startHz: 784, endHz: 784, level: 0.32, attackMs: 4, decayMs: 340, delayMs: 220 },
    ],
  },
  ui_notify: {
    family: 'ui',
    summary: 'One soft bell.',
    use: 'A quest update or a message arriving. Quieter than everything else in the family, on purpose.',
    seconds: 0.45,
    layers: [
      { wave: 'sine', startHz: 880, endHz: 880, level: 0.24, attackMs: 6, decayMs: 380 },
      { wave: 'sine', startHz: 1760, endHz: 1760, level: 0.07, attackMs: 6, decayMs: 260 },
    ],
  },

  // --------------------------------------------------------------------- combat ---
  combat_swing: {
    family: 'combat',
    summary: 'A whoosh that passes the listener.',
    use: 'A melee swing that misses, a thrown object, a dodge. The filter sweep IS the movement.',
    seconds: 0.34,
    layers: [
      { wave: 'noise', level: 0.5, attackMs: 40, decayMs: 200, highPassHz: 400, lowPassHz: 900, lowPassEndHz: 6000 },
      { wave: 'noise', level: 0.2, attackMs: 70, decayMs: 160, highPassHz: 2000, lowPassHz: 9000, lowPassEndHz: 2500, delayMs: 40 },
    ],
  },
  combat_impact_soft: {
    family: 'combat',
    summary: 'A dull body hit with no ring.',
    use: 'Landing a punch, a club, a hit on something alive. Low and short — nothing metallic.',
    seconds: 0.26,
    layers: [
      { wave: 'sine', startHz: 150, endHz: 55, level: 0.5, attackMs: 1, decayMs: 130 },
      { wave: 'noise', level: 0.3, attackMs: 1, decayMs: 80, highPassHz: 200, lowPassHz: 2400, lowPassEndHz: 700 },
    ],
  },
  combat_impact_metal: {
    family: 'combat',
    summary: 'A hard strike on plate, with a ring that outlasts the hit.',
    use: 'Sword on shield, hammer on armour, anything struck that is meant to sound expensive.',
    seconds: 0.55,
    layers: [
      { wave: 'sine', startHz: 220, endHz: 120, level: 0.34, attackMs: 1, decayMs: 70 },
      { wave: 'triangle', startHz: 1180, endHz: 1160, level: 0.24, attackMs: 1, decayMs: 460 },
      { wave: 'triangle', startHz: 2370, endHz: 2330, level: 0.13, attackMs: 1, decayMs: 380 },
      { wave: 'noise', level: 0.3, attackMs: 0, decayMs: 45, highPassHz: 3500, lowPassHz: 14000, lowPassEndHz: 8000 },
    ],
  },
  combat_block: {
    family: 'combat',
    summary: 'A short, clamped thud with the ring cut off.',
    use: 'A blocked or parried hit. It is `combat_impact_metal` with the ring taken away, which is what "blocked" sounds like.',
    seconds: 0.24,
    layers: [
      { wave: 'sine', startHz: 260, endHz: 130, level: 0.42, attackMs: 1, decayMs: 90 },
      { wave: 'noise', level: 0.34, attackMs: 0, decayMs: 55, highPassHz: 1500, lowPassHz: 8000, lowPassEndHz: 3000 },
    ],
  },
  combat_bow: {
    family: 'combat',
    summary: 'A string release and the arrow leaving.',
    use: 'Bows, crossbows, slings. The tail is the departure, so do not shorten it.',
    seconds: 0.4,
    layers: [
      { wave: 'triangle', startHz: 420, endHz: 190, level: 0.3, attackMs: 1, decayMs: 90 },
      { wave: 'noise', level: 0.28, attackMs: 8, decayMs: 260, highPassHz: 1500, lowPassHz: 3000, lowPassEndHz: 9000, delayMs: 25 },
    ],
  },
  combat_explosion: {
    family: 'combat',
    summary: 'A small explosion: crack, body, and a long rumbling tail.',
    use: 'Barrels, grenades, collapsing structures. The longest one-shot in the set.',
    seconds: 1.3,
    layers: [
      { wave: 'noise', level: 0.55, attackMs: 0, decayMs: 160, highPassHz: 1200, lowPassHz: 14000, lowPassEndHz: 3000 },
      { wave: 'sine', startHz: 90, endHz: 34, level: 0.55, attackMs: 4, decayMs: 700 },
      { wave: 'noise', level: 0.38, attackMs: 30, decayMs: 1100, lowPassHz: 1400, lowPassEndHz: 220 },
    ],
  },

  // ------------------------------------------------------------------ ambience ---
  // Loops, and the loop is the hard part: a bed that clicks once every four seconds is worse than
  // no bed, because the click is the only thing anyone will hear.
  ambience_wind: {
    family: 'ambience',
    summary: 'An open, moving wind bed.',
    use: 'Cliffs, plains, rooftops, anywhere exposed. Layer under everything at a low volume.',
    seconds: 6,
    loop: true,
    layers: [
      { wave: 'noise', level: 0.34, attackMs: 400, decayMs: 0, sustain: 1, releaseMs: 400, highPassHz: 180, lowPassHz: 900, lowPassEndHz: 1600, tremoloHz: 0.17, tremoloDepth: 0.55 },
      { wave: 'noise', level: 0.14, attackMs: 600, decayMs: 0, sustain: 1, releaseMs: 600, highPassHz: 1200, lowPassHz: 5000, lowPassEndHz: 3000, tremoloHz: 0.11, tremoloDepth: 0.7 },
    ],
  },
  ambience_rain: {
    family: 'ambience',
    summary: 'Steady rain with no thunder.',
    use: 'Storm weather, a wet city, a jungle. Deliberately even — a rain loop with an event in it announces its own length.',
    seconds: 6,
    loop: true,
    layers: [
      { wave: 'noise', level: 0.3, attackMs: 300, decayMs: 0, sustain: 1, releaseMs: 300, highPassHz: 1600, lowPassHz: 9000, lowPassEndHz: 7000 },
      { wave: 'noise', level: 0.16, attackMs: 300, decayMs: 0, sustain: 1, releaseMs: 300, highPassHz: 200, lowPassHz: 1200, tremoloHz: 0.23, tremoloDepth: 0.3 },
    ],
  },
  ambience_stream: {
    family: 'ambience',
    summary: 'Running water, mid-sized — a stream rather than a river or a tap.',
    use: 'Rivers, fountains, waterfalls at a distance. Pairs with `footstep_water`.',
    seconds: 6,
    loop: true,
    layers: [
      { wave: 'noise', level: 0.3, attackMs: 300, decayMs: 0, sustain: 1, releaseMs: 300, highPassHz: 900, lowPassHz: 6000, lowPassEndHz: 4500, tremoloHz: 0.9, tremoloDepth: 0.18 },
      { wave: 'noise', level: 0.13, attackMs: 300, decayMs: 0, sustain: 1, releaseMs: 300, highPassHz: 3000, lowPassHz: 11000, tremoloHz: 1.7, tremoloDepth: 0.3 },
    ],
  },
  ambience_machine: {
    family: 'ambience',
    summary: 'A low hum with a slow pulse — something large that is running.',
    use: 'Engine rooms, generators, spaceships, factories. Tonal, so keep it quiet or it fights the music.',
    seconds: 6,
    loop: true,
    layers: [
      { wave: 'saw', startHz: 55, endHz: 55, level: 0.16, attackMs: 400, decayMs: 0, sustain: 1, releaseMs: 400, lowPassHz: 400 },
      { wave: 'sine', startHz: 110, endHz: 110, level: 0.1, attackMs: 400, decayMs: 0, sustain: 1, releaseMs: 400, tremoloHz: 0.5, tremoloDepth: 0.4 },
      { wave: 'noise', level: 0.07, attackMs: 400, decayMs: 0, sustain: 1, releaseMs: 400, highPassHz: 600, lowPassHz: 3000, tremoloHz: 0.33, tremoloDepth: 0.5 },
    ],
  },
  ambience_room: {
    family: 'ambience',
    summary: 'Barely-there room tone.',
    use: 'Interiors that would otherwise be digitally silent. Digital silence reads as a bug; this reads as a room.',
    seconds: 6,
    loop: true,
    layers: [
      { wave: 'noise', level: 0.08, attackMs: 500, decayMs: 0, sustain: 1, releaseMs: 500, highPassHz: 120, lowPassHz: 700 },
    ],
  },
};

export const SFX_NAMES = Object.keys(SFX);

export function sfxCatalogue(): { name: string; family: SfxFamily; summary: string; use: string; seconds: number; loop: boolean }[] {
  return SFX_NAMES.map((name) => {
    const p = SFX[name]!;
    return { name, family: p.family, summary: p.summary, use: p.use, seconds: p.seconds, loop: p.loop === true };
  });
}

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------

export interface SfxRequest {
  preset: string;
  /** Same seed, same bytes. Absent means 0 — reproducible by default rather than random by default. */
  seed?: number;
  /** Transpose every tonal layer. ±24 is the usable range before a preset stops being itself. */
  semitones?: number;
  /** Override the preset's length, within RENDER_LIMITS. */
  seconds?: number;
  sampleRate?: number;
  /** Peak ceiling for the master stage. */
  peakDbfs?: number;
}

export const SFX_LIMITS = {
  minSeconds: 0.02,
  maxSeconds: 20,
  minSampleRate: 8_000,
  maxSampleRate: 48_000,
  defaultSampleRate: 22_050,
  maxSemitones: 24,
} as const;

export interface RenderedSfx {
  audio: PcmAudio;
  preset: string;
  family: SfxFamily;
  seed: number;
  semitones: number;
  seconds: number;
  sampleRate: number;
  loop: boolean;
  peakDbfs: number;
  rmsDbfs: number;
  /** Set for a loop: how much of the tail was folded back into the head to hide the seam. */
  crossfadeMs?: number;
}

/**
 * Render one preset to samples.
 *
 * THE PRESET NAME CROSSES A TRUST BOUNDARY, so it is checked against the catalogue with
 * `hasOwnProperty` rather than by indexing. `SFX[name]` on a plain object resolves `__proto__`,
 * `constructor` and `toString` to real values, and a `Record<string, SfxPreset>` is a compile-time
 * promise about the keys the code writes — not about the key a tool call carries. The failure that
 * matters is not a crash: it is `SFX['constructor']` returning a function that `layers` is then
 * read off, producing `undefined`, which renders as a clip of silence with a valid-looking report
 * attached.
 */
export function renderSfx(req: SfxRequest): RenderedSfx | AudioFault {
  const name = String(req.preset ?? '');
  if (!Object.prototype.hasOwnProperty.call(SFX, name)) {
    return {
      fault: true,
      code: 'bad_parameter',
      detail: `"${name}" is not a sound in the catalogue. This synthesiser plays recipes, not descriptions — choose one of: ${SFX_NAMES.join(', ')}.`,
    };
  }
  const preset = SFX[name]!;

  const sampleRate = clampInt(req.sampleRate, SFX_LIMITS.defaultSampleRate, SFX_LIMITS.minSampleRate, SFX_LIMITS.maxSampleRate);
  const seconds = clampNumber(req.seconds, preset.seconds, SFX_LIMITS.minSeconds, SFX_LIMITS.maxSeconds);
  const semitones = clampNumber(req.semitones, 0, -SFX_LIMITS.maxSemitones, SFX_LIMITS.maxSemitones);
  const seed = Number.isFinite(req.seed) ? Math.floor(req.seed as number) : 0;
  const pitch = Math.pow(2, semitones / 12);

  // A loop is rendered LONGER than it is asked for, and the extra is folded back over the head.
  // Rendering exactly `seconds` and looping it puts a discontinuity at the seam, which is a click
  // at exactly the interval of the loop — the most conspicuous defect an ambience bed can have.
  const crossfadeMs = preset.loop ? Math.min(600, Math.max(80, seconds * 1000 * 0.12)) : 0;
  const renderSeconds = seconds + crossfadeMs / 1000;
  const frames = Math.max(1, Math.round(renderSeconds * sampleRate));

  const mix = new Float32Array(frames);
  preset.layers.forEach((layer, index) => {
    // Each layer gets its own stream, derived from the request seed and the layer's position, so
    // layers are decorrelated (two noise layers sharing a stream sum into one louder layer) while
    // the whole render stays reproducible from one number.
    renderLayer(mix, layer, { frames, sampleRate, pitch, loop: preset.loop === true, rng: lcg(seed * 2654435761 + index * 40503 + 1) });
  });

  let audio: PcmAudio = { sampleRate, channels: 1, samples: mix };
  if (preset.loop) audio = foldLoopSeam(audio, crossfadeMs);

  // Mastered, not merely normalised: the sum of four layers routinely exceeds full scale, and a
  // catalogue whose entries arrive at different levels is a catalogue nobody can use together.
  const mastered = master(audio, { targetLoudnessDbfs: preset.family === 'ambience' ? -24 : -16, ceilingDbfs: clampNumber(req.peakDbfs, -1, -24, -0.1) });
  if (isAudioFault(mastered)) return mastered;

  return {
    audio: mastered.audio,
    preset: name,
    family: preset.family,
    seed,
    semitones,
    seconds: Number((mastered.audio.samples.length / sampleRate).toFixed(4)),
    sampleRate,
    loop: preset.loop === true,
    peakDbfs: mastered.after.peakDbfs,
    rmsDbfs: mastered.after.rmsDbfs,
    ...(preset.loop ? { crossfadeMs: Math.round(crossfadeMs) } : {}),
  };
}

interface LayerContext {
  frames: number;
  sampleRate: number;
  pitch: number;
  /**
   * A looping bed takes NO attack ramp and NO release taper.
   *
   * Those tapers exist to stop a one-shot clicking at its edges, and on a loop they do the
   * opposite: the fold overlaps the quiet tail with the quiet head, so the seam becomes a hole
   * that recurs once per loop — the same defect the fold was added to remove. Continuity at the
   * wrap is the fold's job here, and it does it without touching the level.
   */
  loop: boolean;
  rng: () => number;
}

function renderLayer(mix: Float32Array, layer: SfxLayer, ctx: LayerContext): void {
  const { frames, sampleRate, pitch, rng } = ctx;
  const delay = Math.max(0, Math.round((numberOr(layer.delayMs, 0) / 1000) * sampleRate));
  if (delay >= frames) return;

  const attack = Math.max(0, Math.round((numberOr(layer.attackMs, 1) / 1000) * sampleRate));
  const decay = Math.max(0, Math.round((numberOr(layer.decayMs, 0) / 1000) * sampleRate));
  const release = Math.max(0, Math.round((numberOr(layer.releaseMs, 0) / 1000) * sampleRate));
  const sustain = Math.max(0, Math.min(1, numberOr(layer.sustain, 0)));
  const level = Math.max(0, Math.min(1, numberOr(layer.level, 0.3)));

  const startHz = numberOr(layer.startHz, 440) * pitch;
  const endHz = numberOr(layer.endHz, numberOr(layer.startHz, 440)) * pitch;

  // One-pole low-pass, swept exponentially. This is the cheapest filter that produces a whoosh,
  // and a whoosh is a filter sweep — there is no oscillator that makes one.
  const lpStart = numberOr(layer.lowPassHz, 0);
  const lpEnd = numberOr(layer.lowPassEndHz, lpStart);
  const hp = numberOr(layer.highPassHz, 0);

  const tremoloHz = numberOr(layer.tremoloHz, 0);
  const tremoloDepth = Math.max(0, Math.min(1, numberOr(layer.tremoloDepth, 0)));

  const active = frames - delay;
  let phase = 0;
  let lpState = 0;
  let hpStateIn = 0;
  let hpStateOut = 0;

  for (let i = 0; i < active; i++) {
    const t = i / active;

    let raw: number;
    if (layer.wave === 'noise') {
      raw = rng() * 2 - 1;
    } else {
      // Exponential glide: pitch is perceived logarithmically, so a linear ramp from 1400 Hz to
      // 900 Hz spends most of its time at the top and reads as a bend, not a fall.
      const hz = startHz * Math.pow(endHz / Math.max(1e-6, startHz), t);
      phase += (2 * Math.PI * hz) / sampleRate;
      if (phase > 2 * Math.PI) phase -= 2 * Math.PI;
      raw = oscillate(layer.wave, phase);
    }

    if (lpStart > 0) {
      const fc = lpStart * Math.pow(Math.max(1e-6, lpEnd) / Math.max(1e-6, lpStart), t);
      const a = 1 - Math.exp((-2 * Math.PI * Math.min(fc, sampleRate * 0.45)) / sampleRate);
      lpState += a * (raw - lpState);
      raw = lpState;
    }
    if (hp > 0) {
      const a = Math.exp((-2 * Math.PI * Math.min(hp, sampleRate * 0.45)) / sampleRate);
      const out = a * (hpStateOut + raw - hpStateIn);
      hpStateIn = raw;
      hpStateOut = out;
      raw = out;
    }

    let env: number;
    const fromEnd = active - i;
    if (ctx.loop) {
      env = 1;
    } else {
      if (i < attack) env = attack > 0 ? i / attack : 1;
      else if (i < attack + decay) env = 1 - (1 - sustain) * ((i - attack) / Math.max(1, decay));
      else env = sustain;
      // The release is applied as a second, independent taper at the END of the layer, so a layer
      // whose decay has not finished still reaches zero. A one-shot that stops above zero clicks.
      if (release > 0 && fromEnd < release) env *= fromEnd / release;
      else if (release === 0 && fromEnd < 32) env *= fromEnd / 32;
    }

    if (tremoloHz > 0) {
      env *= 1 - tremoloDepth + tremoloDepth * (0.5 + 0.5 * Math.sin((2 * Math.PI * tremoloHz * i) / sampleRate));
    }

    mix[delay + i] = mix[delay + i]! + raw * env * level;
  }
}

function oscillate(wave: Waveform, phase: number): number {
  switch (wave) {
    case 'sine':
      return Math.sin(phase);
    case 'triangle':
      return (2 / Math.PI) * Math.asin(Math.sin(phase));
    case 'square':
      return Math.sin(phase) >= 0 ? 1 : -1;
    case 'saw':
      return (phase / Math.PI) - 1;
    default:
      return 0;
  }
}

/**
 * Fold the tail over the head with an equal-power crossfade, so the loop has no seam.
 *
 * THE DIRECTION OF THE TWO RAMPS IS THE ENTIRE TRICK, and getting it backwards produces a fold
 * that looks right in the code and leaves the seam exactly where it was. The clip keeps frames
 * [0, keep) and the overlap region is the first `fade` frames. The TAIL — original frames
 * [keep, keep + fade) — fades OUT across that region, and the head fades IN. So the very first
 * output sample is the original frame at `keep`, and the very last is the original frame at
 * `keep - 1`: adjacent samples of one continuous render, which is why wrapping from the end to the
 * beginning is a step of nothing. Swap the ramps and output[0] is the head's own first sample
 * instead, which has no relationship at all to the last — measured at a 17 dB step, i.e. an
 * audible click once per loop. `seamDiscontinuityDb` exists so that this is a number rather than
 * an opinion, and the test asserts it.
 *
 * EQUAL POWER, not linear, for the second defect: two decorrelated noise streams crossfaded
 * linearly sum to a ~3 dB dip at the midpoint — a hole that recurs at exactly the loop interval,
 * which is the same defect as the click wearing a different hat.
 */
function foldLoopSeam(audio: PcmAudio, crossfadeMs: number): PcmAudio {
  const fade = Math.round((crossfadeMs / 1000) * audio.sampleRate);
  const frames = audio.samples.length;
  const keep = frames - fade;
  if (fade <= 0 || keep <= fade) return audio;
  const out = audio.samples.slice(0, keep);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    const headGain = Math.sin((t * Math.PI) / 2); // 0 → 1
    const tailGain = Math.cos((t * Math.PI) / 2); // 1 → 0
    out[i] = out[i]! * headGain + audio.samples[keep + i]! * tailGain;
  }
  return { sampleRate: audio.sampleRate, channels: 1, samples: out };
}

/**
 * How far off a seamless loop this clip is, in dB — the wrap step measured against the clip's OWN
 * typical sample-to-sample step.
 *
 * WHY NOT AGAINST THE PEAK, which is the obvious normalisation and was the first version: full-band
 * noise moves a long way between adjacent samples everywhere, so a rain bed measures a "17 dB step"
 * at the wrap and at every other sample too. Normalised against the peak, the metric reports how
 * BROADBAND a clip is and says nothing about its loop — it failed a correctly folded rain bed and
 * would have passed a badly folded sine.
 *
 * Against the typical step it is a real anomaly detector: ~0 dB means the wrap looks like any other
 * sample boundary in the file, which is exactly what seamless means.
 *
 * AND ITS LIMIT, stated because a metric whose blind spot is undocumented gets trusted past it:
 * noise has no phase to break, so a noise-only bed scores well whether it was folded or not. The
 * metric is sharp on TONAL material, where phase and level discontinuities are real — measured on
 * `ambience_machine`: 5.8 dB folded, 18.1 dB with the crossfade ramps swapped, 17.1 dB with no fold
 * at all. What the fold buys a noise bed is level and filter-state continuity, which this number
 * does not see and the evenness test does.
 */
export function seamDiscontinuityDb(audio: PcmAudio): number {
  const n = audio.samples.length;
  if (n < 3) return 0;
  let sumSq = 0;
  for (let i = 1; i < n; i++) {
    const d = audio.samples[i]! - audio.samples[i - 1]!;
    sumSq += d * d;
  }
  const typicalStep = Math.sqrt(sumSq / (n - 1));
  // A perfectly flat buffer has no typical step to compare against. Its wrap is 0 too, so the
  // honest answer is "no discontinuity", not a division by zero.
  if (typicalStep <= 0) return toDbfs(0);
  const wrapStep = Math.abs(audio.samples[0]! - audio.samples[n - 1]!);
  return Number((20 * Math.log10(Math.max(wrapStep, 1e-12) / typicalStep)).toFixed(2));
}

/** dB-relative gain, exported so a caller can place a preset in a mix without importing `audio`. */
export function sfxGain(audio: PcmAudio, db: number): PcmAudio {
  const g = fromDb(db);
  const samples = new Float32Array(audio.samples.length);
  for (let i = 0; i < samples.length; i++) samples[i] = audio.samples[i]! * g;
  return { sampleRate: audio.sampleRate, channels: audio.channels, samples };
}

// ---------------------------------------------------------------------------------------------

/**
 * A linear congruential generator, so "deterministic" is a property of this file rather than a
 * hope about the platform. `Math.random()` cannot be seeded, so a catalogue built on it could
 * never produce take 7 twice, and no test could assert a byte.
 */
function lcg(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = numberOr(value, fallback);
  return Math.max(min, Math.min(max, n));
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(clampNumber(value, fallback, min, max));
}
