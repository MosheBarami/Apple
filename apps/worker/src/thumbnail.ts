// The image that represents an experience on its Roblox store page — and the honest account of
// how much of one this product can actually make.
//
// WHAT ROBLOX ASKS FOR. 1920x1080, 16:9, under 3 MB, up to ten per experience, all moderated
// (create.roblox.com/docs/production/publishing/thumbnails). The icon is a separate asset: square,
// at least 512x512 (.../publishing/experience-icons). Those numbers are written down ONCE, here,
// because a requirement duplicated across a tool, a prompt and a card is a requirement that will
// eventually disagree with itself and nobody will know which copy the product obeyed.
//
// WHAT WE CAN OBTAIN. Roblox gives Studio plugins no viewport readback — `ThumbnailGenerator` is
// not a valid service name and `CaptureService:CaptureScreenshot`'s callback never fires in edit
// mode, both verified against real Studio and recorded in apps/plugin/src/Render.luau. So the only
// pixels of a customer's place this product will ever hold come from the plugin's own software
// rasteriser, which clamps at 320x240 because it runs synchronously on Studio's main thread and
// every frame briefly freezes the user's editor.
//
// THEREFORE: the largest honest 16:9 frame of the real place is 320x180. That is one sixth of the
// published requirement on each side, flat-shaded, with no shadows, no PointLights, no Neon glow,
// no atmosphere and no post-processing. It is a REAL PICTURE OF THE REAL PLACE at a size Roblox
// will accept but display stretched, and it is not a finished store-page asset. Saying so is the
// feature; the alternatives are all worse:
//
//   * upscaling 6x would produce a file with the right header and none of the information;
//   * generating an image of a game that does not exist would put a picture on a store page that
//     misrepresents the product being sold — which the owner has rejected outright and which
//     Roblox's own thumbnail policy forbids;
//   * uploading it would create a permanent asset in the customer's account (see below).
//
// WHAT A PERSON MUST STILL DO BY HAND is in `publishSteps`, and it is the truth rather than a
// placeholder: there is no Open Cloud endpoint for experience thumbnails at all.

/** The two images a Roblox experience has, and which one is being asked for. */
export type ThumbnailKind = 'thumbnail' | 'icon';

export interface RobloxImageSpec {
  kind: ThumbnailKind;
  /** what a person calls it on the Creator Dashboard */
  what: string;
  width: number;
  height: number;
  aspectLabel: string;
  /** published ceiling on the uploaded file, when Roblox states one */
  maxBytes?: number;
  /** how many may be attached to one experience, when Roblox states a number */
  maxPerExperience?: number;
  formats?: readonly string[];
  /** the page these numbers were read off */
  source: string;
}

/**
 * Verified 2026-09-16 against BOTH the Roblox docs the corpus holds
 * (`packages/corpus/data/chunks.jsonl`, docSlug `docs-production-publishing-thumbnails`) and a live
 * Context7 query of `/roblox/creator-docs`. Both say the same thing, word for word:
 * "A thumbnail image should be 16:9 aspect ratio and ideally 1920x1080 pixels".
 */
export const ROBLOX_THUMBNAIL: RobloxImageSpec = {
  kind: 'thumbnail',
  what: 'experience thumbnail',
  width: 1920,
  height: 1080,
  aspectLabel: '16:9',
  // "Make sure to keep these images under 3 MB and 1920x1080 pixels."
  maxBytes: 3 * 1024 * 1024,
  // "You can feature up to 10 images or videos for each of your games' detail pages."
  maxPerExperience: 10,
  formats: ['jpg', 'gif', 'png', 'tga', 'bmp'],
  source: 'https://create.roblox.com/docs/production/publishing/thumbnails',
};

/**
 * The icon is a DIFFERENT asset from the thumbnail and is configured on a different page, which is
 * why it is a second spec rather than a variant of the first. "Use a template of 512x512 pixels";
 * it scales down to 150x150 in places, so detail that only reads at full size is wasted.
 */
export const ROBLOX_ICON: RobloxImageSpec = {
  kind: 'icon',
  what: 'experience icon',
  width: 512,
  height: 512,
  aspectLabel: '1:1',
  source: 'https://create.roblox.com/docs/production/publishing/experience-icons',
};

export const ROBLOX_IMAGE_SPECS: Readonly<Record<ThumbnailKind, RobloxImageSpec>> = {
  thumbnail: ROBLOX_THUMBNAIL,
  icon: ROBLOX_ICON,
};

/**
 * The plugin rasteriser's own clamp, copied from `Render.capture` in apps/plugin/src/Render.luau:
 *
 *     local w = math.clamp(width, 48, 320)
 *     local h = math.clamp(height, 32, 240)
 *
 * Asking for more does not fail — it is silently reshaped on the far side, which would make every
 * dimension this module reports a claim about a frame that was never produced. So the size is
 * fitted to the clamp HERE, where the discrepancy can be reported instead of hidden.
 */
export const RASTERISER_CLAMP = { minWidth: 48, maxWidth: 320, minHeight: 32, maxHeight: 240 } as const;

export interface CaptureSize {
  width: number;
  height: number;
}

/**
 * The largest frame at the SPEC'S OWN aspect ratio that the rasteriser will actually produce.
 *
 * Derived, never typed in: change `ROBLOX_THUMBNAIL.height` and this follows. 16:9 comes out at
 * 320x180 (width-bound); 1:1 comes out at 240x240 (height-bound).
 */
export function captureSizeFor(kind: ThumbnailKind): CaptureSize {
  const spec = ROBLOX_IMAGE_SPECS[kind];
  const ratio = spec.width / spec.height;
  // Annotated, because RASTERISER_CLAMP is `as const` and an inferred literal type cannot be
  // reassigned to the height-bound branch below.
  let width: number = RASTERISER_CLAMP.maxWidth;
  let height: number = Math.round(width / ratio);
  if (height > RASTERISER_CLAMP.maxHeight) {
    height = RASTERISER_CLAMP.maxHeight;
    width = Math.round(height * ratio);
  }
  return {
    width: Math.max(RASTERISER_CLAMP.minWidth, Math.min(RASTERISER_CLAMP.maxWidth, width)),
    height: Math.max(RASTERISER_CLAMP.minHeight, Math.min(RASTERISER_CLAMP.maxHeight, height)),
  };
}

export interface Shortfall {
  /** how many times larger each side of the published requirement is than what we captured */
  scale: number;
  aspectMatches: boolean;
  /** false in every case today; a field rather than a constant so a future capture path can flip it */
  uploadReady: boolean;
  /** one paragraph a person can act on, naming both numbers */
  note: string;
}

/** How far the best capture we can make falls short of the published requirement, and why. */
export function shortfallAgainst(kind: ThumbnailKind): Shortfall {
  const spec = ROBLOX_IMAGE_SPECS[kind];
  const cap = captureSizeFor(kind);
  const scale = Math.round((spec.width / cap.width) * 100) / 100;
  const aspectMatches = Math.abs(cap.width / cap.height - spec.width / spec.height) < 1e-6;
  return {
    scale,
    aspectMatches,
    uploadReady: false,
    note:
      `This is a real render of the actual place at ${cap.width}x${cap.height}, the largest ${spec.aspectLabel} ` +
      `frame the Studio plugin's software rasteriser can produce. Roblox wants ${spec.width}x${spec.height} — ` +
      `${scale}x larger on each side — and the rasteriser draws flat shading with no shadows, lights, ` +
      `atmosphere or post-processing, so this shows the COMPOSITION rather than the finished look. ` +
      `Use it to settle the framing, then take the full-resolution shot in Studio yourself.`,
  };
}

/**
 * Whether anything anywhere can put this image into the customer's Roblox account.
 *
 * It cannot, and both halves of that matter. Roblox publishes no Open Cloud endpoint for
 * experience thumbnails or icons — they are Creator Dashboard surfaces — so there is no API to
 * call even with a key. And the one write scope that does exist, `asset:write`, creates an Image
 * asset, which Roblox refuses to archive: "not an archivable asset type". That is exactly how 299
 * assets came to sit permanently in the owner's account. So this feature has no upload path at
 * all, by construction rather than by a flag somebody could set.
 */
export const THUMBNAIL_UPLOAD = {
  supported: false,
  reason:
    'Roblox exposes no Open Cloud endpoint for experience thumbnails or icons — both are set on the ' +
    'Creator Dashboard by hand. The only write scope that exists, asset:write, would upload this as an ' +
    'Image asset instead, and Roblox refuses to archive an Image: it would stay in the account for good. ' +
    'So Apple never uploads a thumbnail; you download it and set it yourself.',
} as const;

/**
 * Camera presets that can stand as a store-page image.
 *
 * `top` is excluded and it is the only exclusion. A plan view is the most informative angle for
 * judging layout, which is why the critique loop renders it — and it is a diagram. Nobody clicks a
 * game because they saw its floor plan. Excluding it here rather than declining to render it keeps
 * the measurement honest: the angle is still captured and still measured, it is simply never the
 * one proposed.
 */
const NOT_A_THUMBNAIL_VIEW = new Set(['top']);

export function isFramableView(view: string): boolean {
  return !NOT_A_THUMBNAIL_VIEW.has(view);
}

/** What one candidate angle measured, in the terms framing is decided on. */
export interface FramingInput {
  view: string;
  /** fraction of the frame covered by geometry */
  coverage: number;
  /** colourfulness computed over the geometry mask only — sky and ground excluded */
  colourfulness: number;
  /** how far the geometry centroid sits from the frame centre, 0 at dead centre */
  centroidOffset: number;
  /** how much the skyline varies across the frame; a flat silhouette reads as a wall */
  silhouetteRange: number;
}

export interface FramingChoice extends FramingInput {
  score: number;
  /** why this angle, in one line, for the tool result */
  because: string;
}

/**
 * The coverage a store-page image wants.
 *
 * Not "as much as possible": a frame packed to the edges has no silhouette against the sky, and the
 * critique loop's own framing distance (1.35x the subject radius, chosen after 2.1x produced "a
 * postage stamp in a void") lands around a third to a half. Distance from this target is penalised
 * symmetrically, so both a speck and a wall of geometry lose.
 */
export const THUMBNAIL_TARGET_COVERAGE = 0.45;

/**
 * Score one candidate framing. Arithmetic over measurements, no model call — the same discipline
 * the composition gates follow, and for the same reason: a model asked which of five renders is
 * prettiest will answer differently on Tuesday.
 */
export function scoreFraming(c: FramingInput): number {
  const fill = 1 - Math.min(1, Math.abs(c.coverage - THUMBNAIL_TARGET_COVERAGE) / THUMBNAIL_TARGET_COVERAGE);
  const colour = Math.min(1, Math.max(0, c.colourfulness) / 40);
  const silhouette = Math.min(1, Math.max(0, c.silhouetteRange));
  // A centroid far off-centre is usually a mis-framed subject rather than a bold composition.
  const centred = 1 - Math.min(1, Math.max(0, c.centroidOffset));
  return Math.round((fill * 0.5 + colour * 0.2 + silhouette * 0.2 + centred * 0.1) * 1000) / 1000;
}

/**
 * Pick the angle to propose, or null when none of the rendered angles can be one.
 *
 * Null rather than "the first row": a fallback that quietly returns the plan view would put a floor
 * plan on a store page, and the caller could not tell that from a deliberate choice.
 */
export function chooseFraming(candidates: readonly FramingInput[]): FramingChoice | null {
  const usable = candidates.filter((c) => isFramableView(c.view));
  if (!usable.length) return null;
  let best: FramingChoice | null = null;
  for (const c of usable) {
    const score = scoreFraming(c);
    if (!best || score > best.score) {
      best = {
        ...c,
        score,
        because:
          `${c.view}: the place fills ${Math.round(c.coverage * 100)}% of the frame ` +
          `(target ${Math.round(THUMBNAIL_TARGET_COVERAGE * 100)}%), masked colourfulness ${Math.round(c.colourfulness)}, ` +
          `skyline variation ${c.silhouetteRange.toFixed(2)}`,
      };
    }
  }
  return best;
}

/**
 * Exactly what a person does next, in the order the Creator Dashboard does it.
 *
 * Written out rather than linked because the link is one more thing to go and read at the moment
 * somebody is trying to finish. The pages themselves are cited at the end of each list.
 */
export function publishSteps(kind: ThumbnailKind): string[] {
  const spec = ROBLOX_IMAGE_SPECS[kind];
  const common = [
    'Save the PNG from the card above (right-click the image, Save image as). It stays retrievable for an hour.',
  ];
  if (kind === 'icon') {
    return [
      ...common,
      'Open the Creator Dashboard and select the experience.',
      'Configure > Places > the start place (marked with a star) > Icon.',
      'Set the media type to Image, click Change, choose the file, then Save Changes.',
      `Roblox wants a square image of at least ${spec.width}x${spec.height}; it is scaled down to 150x150 in places, so check it small.`,
      'The icon is moderated before anyone else sees it.',
      `Reference: ${spec.source}`,
    ];
  }
  return [
    ...common,
    'Open the Creator Dashboard and select the experience.',
    'Configure > Places > the place, then Thumbnails in the left nav.',
    'Upload under Experience Detail Page (and Home Page if you want personalisation across 2-5 active images).',
    `Roblox wants ${spec.width}x${spec.height} at ${spec.aspectLabel}, under 3 MB; anything not 16:9 is displayed stretched.`,
    `Up to ${spec.maxPerExperience} images or videos per experience, all moderated.`,
    'For a full-resolution shot: frame it in Studio using this composition and take the screenshot yourself — or publish with Studio\'s camera left here and let Roblox auto-generate a thumbnail from that camera position.',
    `Reference: ${spec.source}`,
  ];
}

/**
 * The card. Two blocks, and the second is not decoration.
 *
 * The picker carries the pixels by PATH (a 320x180 PNG as a data URL is past the UI detail cap and
 * the model cannot read it anyway). The callout carries the shortfall, because an image presented
 * without its limitation is an image somebody will upload believing it is finished — which is the
 * observation-failure shape this repository keeps finding: a partial result rendered as a whole one.
 */
export function thumbnailPanel(args: {
  imageId: string;
  /** the same-origin path the browser fetches — built by imagegen's `imagePathFor`, never here */
  src: string;
  kind: ThumbnailKind;
  subject: string;
  capture: CaptureSize;
  view: string;
}): { v: 1; blocks: unknown[] } {
  const spec = ROBLOX_IMAGE_SPECS[args.kind];
  const short = shortfallAgainst(args.kind);
  const subject = args.subject.trim().slice(0, 80) || 'your place';
  return {
    v: 1,
    blocks: [
      {
        type: 'asset_picker',
        title: `Proposed ${spec.what}`,
        assets: [
          {
            id: args.imageId,
            name: `${subject} — ${args.view} view`,
            kind: 'image',
            thumbnail: {
              src: args.src,
              alt: `${args.view} render of ${subject}, ${args.capture.width} by ${args.capture.height} pixels`,
              width: args.capture.width,
              height: args.capture.height,
            },
            note: `Captured at ${args.capture.width}x${args.capture.height}. Roblox wants ${spec.width}x${spec.height}.`,
            link: { href: args.src, label: 'Open the full image' },
          },
        ],
      },
      {
        type: 'callout',
        tone: 'warn',
        title: 'Not ready to upload as-is',
        text: `${short.note} ${THUMBNAIL_UPLOAD.reason}`,
        link: { href: spec.source, label: `Roblox's ${spec.what} requirements` },
      },
    ],
  };
}
