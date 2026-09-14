// The pixel primitives both halves of the product measure builds with.
//
// WHY THIS FILE EXISTS. `geometryMask` and the two backdrop constants were duplicated in
// `apps/worker/src/composition.ts` and `packages/evals/src/props.mjs`. One decides what the PRODUCT
// believes about a build; the other decides what the offline GRADER believes. They agreed, and
// nothing anywhere would have said when they stopped — both copies had callers, so no dead-end
// detector would find it and no test compared them. A grader whose mask differs from the product's
// is a grader whose scores do not predict the product, which is the whole reason it exists.
//
// WHY IT LIVES IN THE DESIGN PACKAGE. The worker and the eval harness are the only two consumers,
// they already depend on `@golem/design`, and this package is the one place both can reach without
// new workspace wiring. A dedicated `@golem/pixels` package would be a cleaner name; that choice is
// reversible and recorded as such — moving the module later is an import rewrite in two files.
//
// These constants are the renderer's backdrop, not a preference. They must match what the plugin
// actually clears to, or every mask silently includes the sky.

/** The flat sky the render clears to. */
export const SKY_RGB = [0x9f, 0xc7, 0xe8];
/** The flat baseplate the render draws under the build. */
export const GROUND_RGB = [0x6e, 0x7a, 0x63];

/**
 * 1 where a pixel is geometry, 0 where it is backdrop.
 *
 * Exact equality, not a tolerance: the backdrop is drawn flat and unlit precisely so this test can
 * be exact. A tolerance here would eat genuine geometry that happens to be near the sky's colour,
 * which is the single most common thing a builder paints a wall.
 */
export function geometryMask(rgb, width, height) {
  const px = width * height;
  const mask = new Uint8Array(px);
  for (let i = 0; i < px; i += 1) {
    const r = rgb[i * 3];
    const g = rgb[i * 3 + 1];
    const b = rgb[i * 3 + 2];
    const isSky = r === SKY_RGB[0] && g === SKY_RGB[1] && b === SKY_RGB[2];
    const isGround = r === GROUND_RGB[0] && g === GROUND_RGB[1] && b === GROUND_RGB[2];
    mask[i] = isSky || isGround ? 0 : 1;
  }
  return mask;
}
