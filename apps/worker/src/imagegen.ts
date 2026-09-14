// Image generation on Cloudflare Workers AI, art-directed against docs/ROBLOX-STYLE-SPEC.md.
//
// The point of this file is that it does NOT concatenate a user's words with "roblox style" and
// hope. A caller states what it wants STRUCTURALLY — subject, target surface, palette roles,
// outline weight, low-poly level, lighting, camera, background, aspect — and the prompt is
// composed from the style spec's own grammar. Manifest §21 asks for exactly that, and the measured
// reason is in docs/evidence/PHASE4-IMAGE-GEN.md: the recipe-guided render came back at half the
// encoded size of the bare-prompt control, i.e. the recipe is what actually moved the model.
//
// Three things are refused rather than attempted:
//   1. embedded text (§4 wants heavy uppercase with a black stroke; image models cannot do it)
//   2. provider logos and brand marks (§20: use the official asset where brand identity is needed)
//   3. anything the deterministic flatness gate says came back as a detailed render
//
// SPEND. Image models are billed per tile and per step, not per token, so pricing.ts's token table
// cannot price them. The rate below is Cloudflare's published per-model rate converted with the
// SAME neuron unit the rest of the product uses, reserved and settled against the SAME BudgetDO
// singleton. There is no second ledger and no second unit.
import type { Env } from './env';
import { BudgetError } from './gateway';
import { gatewayOpts } from './providers/workers-ai';
import { MAX_NEURONS_PER_REQUEST, usdFor } from './pricing';

// ---------------------------------------------------------------------------
// the typed request
// ---------------------------------------------------------------------------

/** What the image is FOR. Drives framing, margin and whether a scene is allowed at all. */
export type ImageTarget = 'ui_icon' | 'decal' | 'texture' | 'thumbnail' | 'concept';

/**
 * Palette roles, lifted from §1 of the style spec rather than invented. Each one carries the
 * spec's own hex range into the prompt, because "bright green" and `#5FC94A – #7ED957` are not
 * the same instruction to a diffusion model.
 */
export type PaletteRole =
  | 'grass'
  | 'dirt'
  | 'stone'
  | 'cliff'
  | 'foliage'
  | 'wood'
  | 'sky'
  | 'sand'
  | 'accent'
  | 'positive'
  | 'danger'
  | 'premium'
  | 'currency_soft'
  | 'currency_hard'
  | 'locked';

/**
 * §2 is blunt: "If in doubt, the outline is too thin." So there is no thin option — the choice is
 * between heavy and heavier, and the default is heavy.
 */
export type OutlineWeight = 'heavy' | 'very_heavy';

/** §7 form language. `flat_vector` is 2D artwork; the other two are 3D reads of the same grammar. */
export type LowPolyLevel = 'flat_vector' | 'chunky_low_poly' | 'blocky';

export type LightingStyle = 'flat' | 'high_key' | 'clear_daylight';

export type CameraAngle = 'straight_on' | 'three_quarter' | 'isometric' | 'top_down';

export type BackgroundStyle = 'flat_solid' | 'soft_vignette_free' | 'sky' | 'plain_white';

export type AspectRatio = '1:1' | '4:3' | '3:4' | '16:9' | '9:16';

export interface ImageRequest {
  /** what to draw, in plain words — a noun phrase, not a prompt */
  subject: string;
  target: ImageTarget;
  /** palette roles from §1; empty means "let the target's default palette apply" */
  palette?: PaletteRole[];
  outline?: OutlineWeight;
  lowPoly?: LowPolyLevel;
  lighting?: LightingStyle;
  camera?: CameraAngle;
  background?: BackgroundStyle;
  /**
   * Composition hint only on models with a fixed output size — flux-1-schnell exposes no width or
   * height, so this shapes how the subject is framed, not the canvas. The result reports whether
   * the model actually honoured it.
   */
  aspect?: AspectRatio;
  /** 1–8 on flux-1-schnell; 4 is the measured default and what the latency figures were taken at */
  steps?: number;
  seed?: number;
}

// ---------------------------------------------------------------------------
// the model
// ---------------------------------------------------------------------------

interface ImageModelSpec {
  id: string;
  /** Cloudflare's published rate, in neurons, for one 512x512 output tile */
  neuronsPer512Tile: number;
  /** Cloudflare's published rate, in neurons, for one diffusion step */
  neuronsPerStep: number;
  /** fixed for this model — it takes no width/height parameter */
  outputWidth: number;
  outputHeight: number;
  /** whether the model takes a real `negative_prompt`; when false the avoid list goes inline */
  supportsNegativePrompt: boolean;
  maxPromptChars: number;
  defaultSteps: number;
  maxSteps: number;
}

/**
 * The ONE image model this file will run. It is the only one measured against this account
 * (docs/evidence/PHASE4-IMAGE-GEN.md: 200, real image, ~1.3–1.5 s at 4 steps), and it is the only
 * one whose flatness threshold below is calibrated from real output.
 *
 * Nine other text-to-image models are in the account's catalogue (flux-2-klein-9b/4b, flux-2-dev,
 * leonardo phoenix-1.0 and lucid-origin, SDXL base and lightning, dreamshaper-8-lcm, sd-1.5
 * inpainting). None has been run against the style spec, so none is registered: registering an
 * unmeasured model would mean shipping a byte-size threshold that was never calibrated for it.
 *
 * Rates from developers.cloudflare.com/workers-ai/platform/pricing (read 2026-08-31):
 * "4.80 neurons per 512x512 tile, 9.60 neurons per step".
 */
const FLUX_SCHNELL: ImageModelSpec = {
  id: '@cf/black-forest-labs/flux-1-schnell',
  neuronsPer512Tile: 4.8,
  neuronsPerStep: 9.6,
  // schnell exposes prompt/steps/seed and nothing else; the canvas is fixed at 1024x1024.
  outputWidth: 1024,
  outputHeight: 1024,
  supportsNegativePrompt: false,
  maxPromptChars: 2048,
  defaultSteps: 4,
  maxSteps: 8,
};

/**
 * Neurons a generation costs.
 *
 * Cloudflare lists schnell's two rates side by side without saying whether the per-step rate is
 * charged once per image or once per tile per step. flux-2-dev, listed two rows below, is explicit
 * — "per 512x512 tile, per step" — so the per-tile reading is the one that could be true and cost
 * more. cost.ts already fixed the direction to fail in ("Over-charging the internal ledger is the
 * safe direction"), so that is the reading used here: a 1024x1024 image at 4 steps is charged
 * 4 x (4.8 + 4 x 9.6) = 173 neurons rather than the 58 the cheaper reading would give.
 *
 * This estimate is EXACT in the sense that matters for reservation: tiles and steps are both known
 * before the call, so the reservation and the settlement are the same number and there is nothing
 * to refund. That is unlike a token-billed call, where the output length is a guess.
 */
export function neuronsForImage(spec: ImageModelSpec, steps: number): number {
  const tiles = Math.ceil(spec.outputWidth / 512) * Math.ceil(spec.outputHeight / 512);
  return Math.ceil(tiles * (spec.neuronsPer512Tile + steps * spec.neuronsPerStep));
}

// ---------------------------------------------------------------------------
// refusals: text and brand marks
// ---------------------------------------------------------------------------

/**
 * Phrases that mean "render these words into the picture".
 *
 * WHY THIS IS A REFUSAL AND NOT AN ATTEMPT. §4 of the style spec requires heavy, predominantly
 * uppercase display type with a white fill, a near-black stroke and a drop shadow. Diffusion models
 * produce approximately-shaped glyphs with unstable spacing and invented letters, so an image model
 * cannot meet that bar — and it does not have to. Roblox renders type as a real `TextLabel` with a
 * `UIStroke`, which is vector-sharp at every scale, localisable, and changeable after the fact
 * without regenerating anything. Baking a word into a decal throws all three away to get a worse
 * result. So the caller is told to put the word in a TextLabel over the generated art.
 */
const TEXT_REQUEST = [
  /\b(?:that|which)\s+(?:says|reads|spells)\b/i,
  /\bwith\s+the\s+(?:word|words|text|caption|label|title|number)\b/i,
  /\b(?:text|caption|label|title|wordmark|lettering|typography|subtitle|banner)\s+(?:saying|reading|that)\b/i,
  /\b(?:says|reading|spelling out)\s+["“']/i,
  /\b(?:write|written|print(?:ed)?|render)\s+(?:the\s+)?(?:word|text|letters)\b/i,
  /\b(?:lettering|wordmark|typography|calligraphy|speech bubble)\b/i,
];

/** A quoted phrase in a subject is almost always the words the caller wants painted in. */
const QUOTED = /["“”'‘’]([^"“”'‘’]{1,80})["“”'‘’]/g;

/**
 * Brand terms. §20 says to use the official provider asset wherever brand identity is needed, so
 * an imitation is never the right answer: it is at best a worse version of an asset that already
 * exists and at worst a trademark the user would ship into a public experience. The check trips on
 * the brand NAME, not on the word "logo" beside it — "a Roblox-style Discord icon" is still a
 * Discord mark, and generating it is still the wrong move.
 */
const BRAND_TERMS =
  /\b(roblox|discord|youtube|twitch|tiktok|instagram|snapchat|whatsapp|facebook|twitter|apple|android|google|gmail|microsoft|windows|xbox|playstation|nintendo|switch|steam|minecraft|fortnite|pokemon|pokémon|disney|marvel|nike|adidas|coca[- ]?cola|pepsi|mcdonald|starbucks|amazon|netflix|spotify|paypal|visa|mastercard|nvidia|cloudflare|openai|anthropic|claude|chatgpt|gemini|meta)\b/i;

/** Generic marks. A logo is a mark plus type, so this also collides with the no-text rule. */
const MARK_REQUEST = /\b(logo|logotype|brand ?mark|trademark|emblem of|badge of|official (?:seal|crest|icon))\b/i;

/**
 * "Roblox-style" is the one place the brand list has to yield. It is a STYLE adjective, and it is
 * the phrase a caller is most likely to reach for — the whole file exists to produce work in that
 * category — so treating it as a request for Roblox's mark would refuse the most ordinary request
 * there is. It is redundant here anyway (the grammar is applied unconditionally), so it is dropped
 * before screening. `roblox` used any other way, including "the Roblox logo", still trips.
 */
const STYLE_ADJECTIVE = /\broblox[-\s]?(?:style[d]?|like|ish|esque)\b/gi;

export interface Refusal {
  refused: true;
  reason: 'embedded_text' | 'brand_mark';
  /** plain-language explanation, safe to hand straight to a non-admin caller */
  message: string;
  /** the exact fragments that tripped the check, so the caller can edit rather than guess */
  offending: string[];
}

function isRefusal(v: unknown): v is Refusal {
  return typeof v === 'object' && v !== null && (v as Refusal).refused === true;
}

/**
 * Screen a subject, and strip the quoted fragments out of it.
 *
 * Both halves matter. Refusing tells the caller to move the word into a TextLabel; stripping means
 * that if a quoted fragment somehow survives into a composed prompt it is not a request to paint
 * letters. The refusal is returned in preference, because silently building a different image than
 * the one asked for is worse than saying no.
 */
export function screenSubject(subject: string): { cleaned: string } | Refusal {
  const quoted: string[] = [];
  const styled = subject.replace(STYLE_ADJECTIVE, ' ');
  const cleaned = styled.replace(QUOTED, (_m, inner: string) => {
    quoted.push(inner);
    return inner.replace(/[^\p{L}\p{N} ]/gu, ' ');
  });

  if (MARK_REQUEST.test(styled) || BRAND_TERMS.test(styled)) {
    const hits = [styled.match(MARK_REQUEST)?.[0], styled.match(BRAND_TERMS)?.[0]].filter(Boolean) as string[];
    return {
      refused: true,
      reason: 'brand_mark',
      message:
        'Apple does not generate logos, wordmarks or brand marks. Where a real brand has to appear, use that provider\'s own official asset; where the mark is decorative, describe an original shape instead (for example "a rounded chat bubble icon" rather than a named app icon).',
      offending: hits,
    };
  }

  const textHit = TEXT_REQUEST.find((re) => re.test(styled));
  if (textHit || quoted.length) {
    return {
      refused: true,
      reason: 'embedded_text',
      message:
        'This reads as a request to paint words into the picture (a quoted phrase is always read that way). Image models cannot render the heavy uppercase type this style needs — they produce misshapen, misspelled glyphs. Generate the artwork without words, then put the text in a Roblox TextLabel with a UIStroke over it: sharper at every scale, still editable afterwards, and the construction the style spec actually describes.',
      offending: quoted.length ? quoted : [styled.match(textHit!)?.[0] ?? ''],
    };
  }

  return { cleaned: cleaned.replace(/\s+/g, ' ').trim() };
}

// ---------------------------------------------------------------------------
// the art-direction builder
// ---------------------------------------------------------------------------

/** §1 palette table, hex ranges included so the instruction is a colour and not an adjective. */
const PALETTE: Record<PaletteRole, string> = {
  grass: 'grass in strong fully saturated yellow-green (#5FC94A to #7ED957)',
  dirt: 'dirt and paths in warm orange-tan (#C98A4B to #E0A45C), clearly distinct from the green',
  stone: 'stone in light cool neutral grey (#B8BFC4 to #D2D8DC)',
  cliff: 'rock faces in rust red-brown (#B5533A to #8E3F2E), banded horizontally in two or three tones of the same hue',
  foliage: 'foliage in flat mid-to-dark green (#3E9E4E to #57B85F)',
  wood: 'wood in mid brown (#7A5230 to #96683E), lower saturation than the foliage',
  sky: 'a clear cyan-blue sky (#7FC8F0 to #A8DCF7) with soft white clouds',
  sand: 'pale warm beige ground (#E8D3A9)',
  accent: 'accent props in pure full-chroma hues — pink, purple, yellow, cyan',
  positive: 'a saturated green buy/confirm colour',
  danger: 'a saturated red close/danger colour',
  premium: 'gold or purple, reading as premium and rare',
  currency_soft: 'yellow-gold soft-currency colour',
  currency_hard: 'green or cyan hard-currency colour',
  locked: 'grey and desaturated, reading as locked and unavailable',
};

/** §0 and §7: what the frame is, per target. The centre-clear HUD rule (§6) is a layout rule, so it is not repeated here. */
const TARGET_FRAMING: Record<ImageTarget, string> = {
  ui_icon:
    'a single game UI icon: one subject, centred, filling most of the frame with an even empty margin, no scene and no ground plane, still readable at 64 pixels',
  decal: 'a single flat decal motif: one subject, centred on an empty field, no scene, no border ornament',
  texture:
    'a flat tiling surface pattern with even coverage and no single focal subject, edges designed to repeat seamlessly',
  thumbnail:
    'bold key art: one oversized hero subject filling the frame against a saturated background, composed to read instantly at thumbnail size',
  concept: 'a flat orthographic concept study of the subject alone on a plain background',
};

const LOW_POLY: Record<LowPolyLevel, string> = {
  flat_vector: 'drawn as flat vector shapes with no shading gradients — large areas of one constant colour',
  chunky_low_poly:
    'built from chunky low-polygon flat-shaded geometry, untextured, with visible facets; colour does all the work',
  blocky: 'built from a small number of large blocky rounded volumes, untextured and flat-shaded',
};

const LIGHTING: Record<LightingStyle, string> = {
  flat: 'flat even lighting with no cast shadows',
  high_key: 'bright high-key lighting, everything clearly lit, no dark areas anywhere',
  clear_daylight: 'clear bright daylight from above, soft short shadows, nothing in shade',
};

const CAMERA: Record<CameraAngle, string> = {
  straight_on: 'seen straight on, square to the camera',
  three_quarter: 'seen from a three-quarter angle, slightly above',
  isometric: 'drawn in isometric projection',
  top_down: 'seen from directly overhead',
};

const BACKGROUND: Record<BackgroundStyle, string> = {
  flat_solid: 'on a single flat solid colour background',
  soft_vignette_free: 'on an empty untextured background with no vignette and no gradient',
  sky: 'against a clear cyan-blue sky',
  plain_white: 'on a plain white background',
};

const OUTLINE: Record<OutlineWeight, string> = {
  heavy:
    'every shape carries a thick uniform near-black outline (#111 to #1A1A1A) roughly 4 pixels at 1080p, and the outline does not thin down on small details',
  very_heavy:
    'every shape carries a very thick uniform near-black outline (#111 to #1A1A1A) roughly 6 pixels at 1080p, heavier than looks correct, and it does not thin down on small details',
};

/**
 * §9's automatic failures, stated as things to avoid. The order is §9's order, followed by the
 * §3 and §7 items that are the same failure wearing different clothes, followed by the no-lettering
 * clause that backs up the text refusal above.
 */
export const AVOID_LIST: readonly string[] = [
  'photorealism',
  'photographic render',
  'PBR materials, metallic or roughness maps, specular highlights',
  'thin or hairline strokes',
  'desaturated, muted or pastel colour',
  'dark, moody or low-key lighting',
  'gradients used to fake depth',
  'soft shadows, blur, glassmorphism, glow, fog',
  'realistic architecture, photoreal foliage, fine surface texture, noise',
  'busy clutter or many small details',
  'any lettering, words, numbers, logos, signatures or watermarks',
];

export interface ArtDirection {
  /** the composed positive prompt, already clamped to the model's prompt limit */
  prompt: string;
  /** the avoid list as the model wants it, or null when it had to be folded into `prompt` */
  negativePrompt: string | null;
  /** true when the avoid list went in as a real negative prompt rather than inline prose */
  negativePromptSupported: boolean;
  /** true when the model actually renders at the requested aspect rather than a fixed canvas */
  aspectHonoured: boolean;
}

/**
 * Compose the prompt from the grammar, not from the caller's sentence.
 *
 * Order is deliberate. Subject and framing come first because that is what a diffusion model
 * weights most heavily; the outline clause comes early because §2 calls it "the single most
 * important signal" and an image that fails it fails the category test on that point alone.
 */
export function composeArtDirection(req: ImageRequest, spec: ImageModelSpec = FLUX_SCHNELL): ArtDirection | Refusal {
  const screened = screenSubject(req.subject);
  if (isRefusal(screened)) return screened;

  const outline = OUTLINE[req.outline ?? 'heavy'];
  const lowPoly = LOW_POLY[req.lowPoly ?? (req.target === 'ui_icon' || req.target === 'decal' ? 'flat_vector' : 'chunky_low_poly')];
  const lighting = LIGHTING[req.lighting ?? 'flat'];
  const camera = CAMERA[req.camera ?? (req.target === 'ui_icon' ? 'straight_on' : 'three_quarter')];
  const background = BACKGROUND[req.background ?? 'flat_solid'];
  const palette = (req.palette ?? []).map((role) => PALETTE[role]).filter(Boolean);

  const clauses = [
    `${TARGET_FRAMING[req.target]}: ${screened.cleaned}`,
    outline,
    lowPoly,
    'chunky rounded forms with generous corner radii, thick and physical, nothing delicate',
    'bright fully saturated high-key colour throughout, no muted or neutral palette',
    palette.length ? `colour: ${palette.join('; ')}` : 'colour: a small number of pure saturated hues',
    lighting,
    camera,
    background,
    'no realism of any kind',
  ];

  // Aspect is a composition instruction on a fixed-canvas model, and a real one elsewhere. Say
  // which it is instead of silently pretending the canvas moved.
  const aspectHonoured = spec.outputWidth !== spec.outputHeight;
  if (req.aspect && req.aspect !== '1:1') clauses.push(`composed for a ${req.aspect} frame`);

  const avoid = AVOID_LIST.join(', ');
  let prompt = clauses.join('. ') + '.';
  if (!spec.supportsNegativePrompt) {
    // Folding the avoid list into the positive prompt is materially weaker than a real negative
    // prompt — the model attends to the nouns either way — but it is measurably better than
    // omitting it, and schnell offers no negative_prompt field to use instead.
    prompt += ` Do not include: ${avoid}.`;
  }
  if (prompt.length > spec.maxPromptChars) prompt = prompt.slice(0, spec.maxPromptChars);

  return {
    prompt,
    negativePrompt: spec.supportsNegativePrompt ? avoid : null,
    negativePromptSupported: spec.supportsNegativePrompt,
    aspectHonoured,
  };
}

// ---------------------------------------------------------------------------
// the deterministic flatness gate
// ---------------------------------------------------------------------------

/**
 * Encoded PNG bytes per output pixel, and the thresholds it is judged against.
 *
 * THIS IS A CHEAP HEURISTIC, NOT A STYLE JUDGEMENT. It catches exactly one failure — the model
 * ignored the recipe and returned a detailed or photoreal render — and it catches it for zero
 * neurons and zero latency, before any model-based critic is worth paying for. It cannot tell you
 * an icon is ugly, badly composed, off-palette or wrong; a hideous but genuinely flat image passes.
 * Treat a pass as "worth showing to the critic", never as "good".
 *
 * WHY IT WORKS AT ALL. Flat vector art is large runs of one constant colour, which is precisely
 * what PNG's filter-plus-deflate stage compresses; a photoreal render is high-entropy pixel noise,
 * which does not compress. Measured on this account (docs/evidence/PHASE4-IMAGE-GEN.md), the same
 * subject rendered at 1024x1024:
 *   recipe-guided ("gold coin" + full art direction) ~173 KB -> 0.165 bytes/pixel
 *   bare prompt   ("a gold coin")                    ~344 KB -> 0.328 bytes/pixel
 * The ceiling sits just under the bare control, so the known-not-flat case fails and the known-flat
 * case passes with roughly 1.8x headroom. It is calibrated as a RATIO against the pixel area, not
 * as an absolute byte count, so it stays meaningful if the output size ever changes.
 */
export const FLAT_MAX_BYTES_PER_PIXEL = 0.3;

/**
 * A floor as well as a ceiling: an image this small is not "very flat", it is a blank field.
 *
 * Calibrated the same way. A synthetic solid-colour 1024x1024 PNG, encoded locally with the same
 * deflate settings, comes out around 0.005 bytes/pixel; the measured flat render is 0.165. So this
 * sits roughly 16x below the known-good case and just above a solid colour field.
 *
 * IT ONLY CATCHES AN ACTUALLY EMPTY ENCODE. A near-blank but still dithered model output would
 * carry enough entropy to clear this, and no such output has been measured, so do not read a pass
 * here as "the image has a subject in it".
 */
export const DEGENERATE_MIN_BYTES_PER_PIXEL = 0.01;

export interface FlatnessVerdict {
  verdict: 'flat' | 'too_detailed' | 'degenerate' | 'unmeasurable';
  bytesPerPixel: number | null;
  bytes: number;
  width: number | null;
  height: number | null;
  /** one line, safe to put in front of the model or the user */
  note: string;
}

/** Byte length of a base64 payload without decoding it. */
export function base64ByteLength(b64: string): number {
  const clean = b64.replace(/=+$/, '');
  return Math.floor((clean.length * 3) / 4);
}

/**
 * Read width/height out of a PNG's IHDR. Returns null for anything that is not a PNG, which is the
 * honest answer: the threshold above was calibrated on PNG bytes, so a JPEG must not be judged
 * against it.
 */
export function readPngSize(headerBytes: Uint8Array): { width: number; height: number } | null {
  const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (headerBytes.length < 24) return null;
  for (let i = 0; i < SIG.length; i++) if (headerBytes[i] !== SIG[i]) return null;
  // bytes 12..15 are the chunk type; the first chunk in a valid PNG is always IHDR
  if (String.fromCharCode(...headerBytes.subarray(12, 16)) !== 'IHDR') return null;
  const view = new DataView(headerBytes.buffer, headerBytes.byteOffset, headerBytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Decode just the first `n` bytes of a base64 string — enough for a header, cheap for a 200 KB image. */
function decodeBase64Prefix(b64: string, n: number): Uint8Array {
  const chars = Math.ceil(n / 3) * 4;
  const bin = atob(b64.slice(0, chars));
  const out = new Uint8Array(Math.min(bin.length, n));
  for (let i = 0; i < out.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function flatnessGate(imageBase64: string): FlatnessVerdict {
  const bytes = base64ByteLength(imageBase64);
  const size = readPngSize(decodeBase64Prefix(imageBase64, 32));
  if (!size || size.width <= 0 || size.height <= 0) {
    return {
      verdict: 'unmeasurable',
      bytesPerPixel: null,
      bytes,
      width: null,
      height: null,
      note: 'the payload is not a PNG, so the flatness ratio it was calibrated on does not apply — this image was not gated',
    };
  }
  const bpp = bytes / (size.width * size.height);
  const round = Number(bpp.toFixed(4));
  if (bpp < DEGENERATE_MIN_BYTES_PER_PIXEL) {
    return {
      verdict: 'degenerate',
      bytesPerPixel: round,
      bytes,
      width: size.width,
      height: size.height,
      note: `${round} bytes/pixel is below ${DEGENERATE_MIN_BYTES_PER_PIXEL} — the image is effectively a blank colour field, not artwork`,
    };
  }
  if (bpp > FLAT_MAX_BYTES_PER_PIXEL) {
    return {
      verdict: 'too_detailed',
      bytesPerPixel: round,
      bytes,
      width: size.width,
      height: size.height,
      note: `${round} bytes/pixel is above ${FLAT_MAX_BYTES_PER_PIXEL} — the render did not go flat. This is a cheap size heuristic, not a style verdict: it means detail and texture, most likely a realistic render, which §9 of the style spec calls an automatic fail.`,
    };
  }
  return {
    verdict: 'flat',
    bytesPerPixel: round,
    bytes,
    width: size.width,
    height: size.height,
    note: `${round} bytes/pixel is inside the flat range — the image compressed like flat vector art. This only rules out a detailed render; it says nothing about whether the art is good.`,
  };
}

// ---------------------------------------------------------------------------
// spend
// ---------------------------------------------------------------------------

// The SAME BudgetDO singleton, the same three endpoints and the same neuron unit the token path
// uses. gateway.ts keeps its reserve/settle/release helpers private to itself, and this file is not
// the place to widen that file's surface, so the calls are re-plumbed here. What must not happen —
// and does not — is a second ledger: every neuron below lands in the same day/month counters, under
// the same kill switch, that /api/admin/spend reports on.
function budgetStub(env: Env) {
  return env.BUDGET_DO.get(env.BUDGET_DO.idFromName('singleton'));
}

const BUDGET_MESSAGES: Record<string, string> = {
  daily_cap: "Apple has reached today's shared building capacity. It resets at midnight UTC.",
  monthly_cap: "Apple has reached this month's shared building capacity.",
  request_too_large: 'That image needs more capacity than a single step allows.',
  killed: 'AI generation is paused right now.',
};

async function reserve(env: Env, model: string, neurons: number): Promise<number> {
  const res = await budgetStub(env).fetch('https://do/reserve', {
    method: 'POST',
    body: JSON.stringify({ neurons, model }),
  });
  const data = (await res.json()) as { ok: boolean; reserved?: number; reason?: string; message?: string };
  if (!data.ok) {
    const reason = (data.reason ?? 'daily_cap') as 'killed' | 'daily_cap' | 'monthly_cap' | 'request_too_large';
    throw new BudgetError(reason, data.message ?? BUDGET_MESSAGES[reason] ?? BUDGET_MESSAGES.daily_cap!);
  }
  return data.reserved ?? neurons;
}

async function settle(env: Env, reserved: number, actual: number, model: string, kind: string): Promise<void> {
  await budgetStub(env)
    .fetch('https://do/settle', { method: 'POST', body: JSON.stringify({ reserved, actual, model, kind }) })
    .catch(() => {});
}

async function release(env: Env, reserved: number): Promise<void> {
  await budgetStub(env)
    .fetch('https://do/release', { method: 'POST', body: JSON.stringify({ reserved }) })
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// generation
// ---------------------------------------------------------------------------

export interface GeneratedImage {
  /** the PNG, base64. Callers that must not put pixels in a transcript strip this. */
  pngBase64: string;
  width: number;
  height: number;
  bytes: number;
  steps: number;
  seed?: number;
  flatness: FlatnessVerdict;
  /** the composed prompt, kept so a failure can be diagnosed without re-deriving it */
  prompt: string;
  negativePrompt: string | null;
  aspectHonoured: boolean;
  /** what the global neuron ledger was charged */
  neurons: number;
  usd: number;
}

/**
 * Generate one image: screen, compose, reserve, run, settle, gate.
 *
 * Spend order matches gateway.ts exactly and for the same reason. The reservation happens BEFORE
 * `env.AI.run`, so the kill switch and the daily/monthly caps refuse the call before a neuron is
 * spent. Past the run the image HAS been billed, so the reservation is settled and never released,
 * even when the flatness gate then rejects the result — a rejected image was still paid for, and an
 * accounting failure has to land on the side of over-billing our own ledger, never on the side of
 * spend the caps cannot see. There are no retries, for the same reason: a retry is a second bill.
 *
 * NOT CHARGED TO USER SPARKS. Like `embed()`, this settles against the global ledger only; QuotaDO
 * is untouched. The agent step that invoked it is metered on its own.
 */
export async function generateImage(env: Env, req: ImageRequest, kind = 'imagegen'): Promise<GeneratedImage | Refusal> {
  const spec = FLUX_SCHNELL;
  const direction = composeArtDirection(req, spec);
  if (isRefusal(direction)) return direction;

  const steps = Math.min(spec.maxSteps, Math.max(1, Math.floor(Number(req.steps) || spec.defaultSteps)));
  const neurons = neuronsForImage(spec, steps);
  if (neurons > MAX_NEURONS_PER_REQUEST) {
    throw new BudgetError('request_too_large', BUDGET_MESSAGES.request_too_large!);
  }

  // ---- spend gate: nothing below this line runs without a reservation ----
  const reserved = await reserve(env, spec.id, neurons);

  const payload: Record<string, unknown> = { prompt: direction.prompt, steps };
  if (direction.negativePrompt) payload.negative_prompt = direction.negativePrompt;
  if (typeof req.seed === 'number') payload.seed = Math.floor(req.seed);

  let raw: unknown;
  try {
    // cacheTtl 0: an image request is not idempotent from the user's point of view — asking twice
    // is asking for a second take, not for the first one back.
    raw = await env.AI.run(spec.id as Parameters<Ai['run']>[0], payload as never, gatewayOpts(env, kind, 0) as never);
  } catch (e) {
    await release(env, reserved);
    throw e;
  }
  // Billed from here on; settle, never release.
  await settle(env, reserved, neurons, spec.id, kind);

  const pngBase64 = extractImageBase64(raw);
  if (!pngBase64) {
    throw new Error('the image model returned no image');
  }

  const flatness = flatnessGate(pngBase64);
  return {
    pngBase64,
    width: flatness.width ?? spec.outputWidth,
    height: flatness.height ?? spec.outputHeight,
    bytes: flatness.bytes,
    steps,
    ...(typeof req.seed === 'number' ? { seed: Math.floor(req.seed) } : {}),
    flatness,
    prompt: direction.prompt,
    negativePrompt: direction.negativePrompt,
    aspectHonoured: direction.aspectHonoured,
    neurons,
    usd: Number(usdFor(neurons).toFixed(6)),
  };
}

/** schnell returns `{ image: "<base64>" }`; the other shapes are defensive, not observed. */
function extractImageBase64(raw: unknown): string | null {
  const r = raw as { image?: unknown; result?: { image?: unknown } } | string | null;
  if (typeof r === 'string' && r.length > 0) return r;
  const img = (r as { image?: unknown })?.image ?? (r as { result?: { image?: unknown } })?.result?.image;
  return typeof img === 'string' && img.length > 0 ? img : null;
}

// ---------------------------------------------------------------------------
// delivery
// ---------------------------------------------------------------------------

/** How long a generated image stays retrievable. Long enough to place it, short enough not to accrete. */
export const IMAGE_TTL_SECONDS = 3600;

/** What is stored beside the pixels: the unix second at which KV drops them. */
export interface ImageMeta {
  expiresAt: number;
}

/**
 * Park the pixels in KV and return the key.
 *
 * Pixels must not enter the model's transcript. A 1024x1024 PNG is ~230,000 base64 characters,
 * which is two orders of magnitude past the tool-result cap and tells the model nothing the
 * metadata does not — the same reasoning render_view already follows when it pushes frames to the
 * browser and strips them from the tool result.
 */
export async function storeImage(env: Env, pngBase64: string, projectId: string): Promise<string> {
  const imageId = crypto.randomUUID();
  // `expiresAt` is written alongside because the TTL is anchored HERE, at write time, and every
  // reader is somewhere else in time. A reader that assumes a full life left will hand out a
  // cache directive that outlives the object — see the route's Cache-Control.
  await env.KV.put(imageKvKey(projectId, imageId), pngBase64, {
    expirationTtl: IMAGE_TTL_SECONDS,
    metadata: { expiresAt: Math.floor(Date.now() / 1000) + IMAGE_TTL_SECONDS } satisfies ImageMeta,
  });
  return imageId;
}

/**
 * The KV key an image lives under.
 *
 * SCOPED TO THE PROJECT, and that is the authorisation, not a tidiness choice. The key used to be
 * `image:<uuid>` with nothing tying the pixels to anyone, so any route that served them would have
 * had to trust the caller's own id — and a serving route whose only protection is that the
 * identifier is hard to guess is a serving route with no protection at all, one leaked transcript
 * later. With the project in the key, the route asks the question it already knows how to ask:
 * does this user own this project? A caller who owns a different project cannot construct a key
 * into someone else's images, whatever id they present.
 */
export function imageKvKey(projectId: string, imageId: string): string {
  return `image:${projectId}:${imageId}`;
}

/**
 * MERGE NOTE. storeImage and imageKvKey above are main's, deliberately: main's version writes an
 * `expiresAt` into KV metadata so the serving route can hand out a Cache-Control anchored at WRITE
 * time rather than at response time. Mine had neither the metadata nor a reader to need it. The
 * two below are the half main did not have — the panel that puts an image in front of the user,
 * and the path the browser asks for.
 */

/**
 * The panel that puts a generated image in front of the user.
 *
 * Pure, and separate from the tool, because this is the half that was missing for the whole life of
 * `generate_image`: the pixels were generated, paid for and stored, and no payload ever carried
 * them to a surface. Keeping it here means it can be tested without a model call.
 *
 * The src is a PATH, never the bytes. A 1024x1024 PNG as a data URL is far past the UI detail cap,
 * which is the original reason the image went to KV rather than into the result.
 */
export function imagePanel(
  projectId: string,
  imageId: string,
  subject: string,
  meta: { width: number; height: number; note?: string },
): { v: 1; blocks: unknown[] } {
  const name = subject.trim().slice(0, 80) || 'Generated image';
  return {
    v: 1,
    blocks: [
      {
        type: 'asset_picker',
        title: 'Generated image',
        assets: [
          {
            id: imageId,
            name,
            kind: 'image',
            thumbnail: {
              src: imagePathFor(projectId, imageId),
              alt: subject.trim().slice(0, 120) || 'generated image',
              width: meta.width,
              height: meta.height,
            },
            ...(meta.note ? { note: meta.note } : {}),
          },
        ],
      },
    ],
  };
}

/**
 * The same-origin path the browser fetches. Shared so the tool and the route agree on one shape.
 *
 * PLURAL, because the route that now exists is GET /api/projects/:id/images/:imageId. This emitted
 * the singular while there was no reader to disagree with, so every panel it built would have
 * pointed one character away from the only thing that serves it — a 404 rendered as the honest
 * "no longer available" state, which is the worst kind of wrong: a correct-looking answer to a
 * question nobody asked.
 */
export function imagePathFor(projectId: string, imageId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/images/${encodeURIComponent(imageId)}`;
}
