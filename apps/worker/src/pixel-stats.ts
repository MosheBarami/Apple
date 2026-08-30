// Pixel statistics over a rendered view.
//
// The loop rendered pixels and then judged everything except the pixels: every hard-fail in
// vision.ts reads scene PROPERTIES (materials, colours, light counts), and png.ts decoded the RGB
// buffer only to re-encode it. Nothing ever looked at the image numerically.
//
// That gap has a measured cost. A 725-part plaza with 10 materials and 5 lights passes every
// property check and still renders as a flat grey plate — its top-down view is one uniform tone
// across the entire frame. No property can see that. These statistics can, and they cost nothing:
// the buffer is already in memory and this is single-digit milliseconds.
//
// Deliberately NOT no-reference image quality assessment. NR-IQA measures distortion — blur, noise,
// compression — and these renders are sharp, noiseless and evenly exposed, so every distortion axis
// reads clean on a scene that looks terrible. The failure lives in value structure, palette width
// and surface detail, which is what these measure instead.
//
// Thresholds are calibrated on Golem's own fixtures, not imported: nobody has published perceptual
// metrics for low-resolution synthetic 3D renders, and borrowed numbers would be guesses wearing a
// citation. See packages/evals/src/pixel-stats.test.mjs for the measured separations.

export interface PixelStats {
  /** mean luminance, 0-1 (Rec. 709) */
  luminance: number;
  /** root-mean-square contrast of luminance, 0-1. Low = washed out or flat. */
  rmsContrast: number;
  /**
   * Hasler-Süsstrunk colourfulness. Roughly 0 for greyscale, 15+ for a normally colourful image.
   * This is the statistic that catches the grey-slab failure directly.
   */
  colorfulness: number;
  /** fraction of pixels on a Sobel edge. Low = large bare untextured surfaces, missing trim. */
  edgeDensity: number;
  /** luminance spread across 10 deciles, as fractions summing to 1 — the value structure */
  luminanceDeciles: number[];
  /**
   * Fraction of the frame taken by the single most common quantised colour. High means one tone
   * owns the image, which is the flat-plate signature.
   */
  dominantToneShare: number;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Compute every statistic in one pass over the buffer. `rgb` is tightly packed, 3 bytes/pixel. */
export function pixelStats(rgb: Uint8Array, width: number, height: number): PixelStats {
  const px = width * height;
  const L = new Float32Array(px);
  const deciles = new Array(10).fill(0);
  const tones = new Map<number, number>();

  let sumL = 0;
  // Hasler-Süsstrunk works on the opponent axes rg = R-G and yb = 0.5(R+G)-B
  let sumRg = 0;
  let sumRg2 = 0;
  let sumYb = 0;
  let sumYb2 = 0;

  for (let i = 0; i < px; i++) {
    const r = rgb[i * 3]!;
    const g = rgb[i * 3 + 1]!;
    const b = rgb[i * 3 + 2]!;
    const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    L[i] = l;
    sumL += l;
    deciles[Math.min(9, Math.floor(l * 10))]!++;
    // quantise to a 32^3 cube: counts perceptibly distinct tones, not shading gradients
    tones.set((r >> 3) * 1024 + (g >> 3) * 32 + (b >> 3), (tones.get((r >> 3) * 1024 + (g >> 3) * 32 + (b >> 3)) ?? 0) + 1);
    const rg = r - g;
    const yb = 0.5 * (r + g) - b;
    sumRg += rg;
    sumRg2 += rg * rg;
    sumYb += yb;
    sumYb2 += yb * yb;
  }

  const meanL = sumL / px;
  let varL = 0;
  for (let i = 0; i < px; i++) {
    const d = L[i]! - meanL;
    varL += d * d;
  }

  const meanRg = sumRg / px;
  const meanYb = sumYb / px;
  const sdRg = Math.sqrt(Math.max(0, sumRg2 / px - meanRg * meanRg));
  const sdYb = Math.sqrt(Math.max(0, sumYb2 / px - meanYb * meanYb));

  // Sobel over luminance. Interior pixels only; a one-pixel border is not worth special-casing.
  let edges = 0;
  let considered = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const tl = L[i - width - 1]!;
      const tt = L[i - width]!;
      const tr = L[i - width + 1]!;
      const ll = L[i - 1]!;
      const rr = L[i + 1]!;
      const bl = L[i + width - 1]!;
      const bb = L[i + width]!;
      const br = L[i + width + 1]!;
      const gx = tl + 2 * ll + bl - (tr + 2 * rr + br);
      const gy = tl + 2 * tt + tr - (bl + 2 * bb + br);
      considered++;
      // 0.08 in normalised luminance is about a 20/255 step — a visible boundary, not dithering
      if (Math.hypot(gx, gy) > 0.08) edges++;
    }
  }

  let dominant = 0;
  for (const n of tones.values()) if (n > dominant) dominant = n;

  return {
    luminance: round3(meanL),
    rmsContrast: round3(Math.sqrt(varL / px)),
    colorfulness: round3(Math.sqrt(sdRg * sdRg + sdYb * sdYb) + 0.3 * Math.sqrt(meanRg * meanRg + meanYb * meanYb)),
    edgeDensity: round3(considered ? edges / considered : 0),
    luminanceDeciles: deciles.map((d) => round3(d / px)),
    dominantToneShare: round3(dominant / px),
  };
}

/**
 * Thresholds calibrated against Golem's own fixtures. Measured separation on the two plaza
 * fixtures (see packages/evals/src/pixel-stats.test.mjs, which prints these):
 *
 *   baseline (rejected):  colourfulness 48.4, edge density 0.053
 *   improved:             colourfulness 49.5, edge density 0.174   <- 3.3x on edge density
 *
 * HONEST LIMITATION, stated because it changes how much weight these carry:
 * **edge density discriminates; colourfulness barely does.** Sky and ground fill most of every
 * frame and are themselves strongly coloured, so whole-frame colourfulness is dominated by the
 * backdrop rather than the build. It still catches the extreme case — a uniform grey plate scores
 * under 1 — but it cannot grade between a dull scene and a rich one. Treat the colourfulness
 * threshold as a floor against total greyness, not as a palette score. Restricting the statistic
 * to the geometry mask would fix this and has not been done.
 */
export const PIXEL_THRESHOLDS = {
  /** below this the image is effectively greyscale — the grey-slab signature */
  colorfulness: 12,
  /** below this the frame is one flat tone with no surface detail */
  edgeDensity: 0.02,
  /** above this a single tone owns the frame */
  dominantToneShare: 0.6,
  /** below this there is no value structure to read form by */
  rmsContrast: 0.06,
};

export interface ViewStats {
  name: string;
  stats: PixelStats;
  /** fraction of the frame covered by geometry — an empty frame is not judged */
  coverage: number;
}

/**
 * Measured pixel failures. These join the property-based hard-fails in vision.ts and, like them,
 * cannot be flattered: they are arithmetic over the actual image.
 *
 * Only views with geometry in them are judged — sky and ground fill are legitimately flat, so an
 * empty frame would trip every threshold for entirely the wrong reason. Each axis is judged on its
 * BEST view: one bad angle is a framing artefact, but if even the most favourable view is flat,
 * the scene is flat.
 */
export function pixelHardFails(views: ViewStats[]): string[] {
  const judged = views.filter((v) => v.coverage >= 0.05);
  if (!judged.length) return [];
  const fails: string[] = [];
  const best = (pick: (s: PixelStats) => number) => Math.max(...judged.map((v) => pick(v.stats)));

  const colour = best((s) => s.colorfulness);
  if (colour < PIXEL_THRESHOLDS.colorfulness) {
    fails.push(`the render is close to greyscale (colourfulness ${colour}, want at least ${PIXEL_THRESHOLDS.colorfulness}) — the flat-grey-slab signature`);
  }
  const edge = best((s) => s.edgeDensity);
  if (edge < PIXEL_THRESHOLDS.edgeDensity) {
    fails.push(`almost no surface detail in the image (edge density ${edge}, want at least ${PIXEL_THRESHOLDS.edgeDensity}) — large bare untextured surfaces with no trim or panelling`);
  }
  const contrast = best((s) => s.rmsContrast);
  if (contrast < PIXEL_THRESHOLDS.rmsContrast) {
    fails.push(`no value structure (RMS contrast ${contrast}, want at least ${PIXEL_THRESHOLDS.rmsContrast})`);
  }
  // tone dominance is a failure only when EVERY judged view is dominated by one tone
  const minDominant = Math.min(...judged.map((v) => v.stats.dominantToneShare));
  if (minDominant > PIXEL_THRESHOLDS.dominantToneShare) {
    fails.push(`a single tone fills ${Math.round(minDominant * 100)}% of every view — the surface is one unbroken flat plate`);
  }
  return fails;
}

/** One compact line per view for the critic, so it sees measured numbers beside the picture. */
export function statsLine(name: string, s: PixelStats): string {
  return `${name}: colourfulness ${s.colorfulness}, edge density ${s.edgeDensity}, RMS contrast ${s.rmsContrast}, most common tone covers ${Math.round(s.dominantToneShare * 100)}% of frame`;
}
