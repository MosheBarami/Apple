import { RETENTION } from './retention';

export const GENERATED_IMAGE_MAX_BYTES = 1024 * 1024;
export const GENERATED_IMAGE_MAX_ENCODED = 4 * Math.ceil(GENERATED_IMAGE_MAX_BYTES / 3);
// Project/global quotas count stored base64 bytes, not decoded file bytes (about 4/3 larger).
// The unit did NOT change when the bytes moved to R2, deliberately: one SUM adds rows written
// before the move to rows written after it, and two units in one column would make that sum a
// number with no meaning.
export const GENERATED_PROJECT_BYTES = 16 * 1024 * 1024;
export const GENERATED_PROJECT_COUNT = RETENTION.generatedImagesKept;

/**
 * THE GLOBAL CEILING, and why there are two of them.
 *
 * These are not per-customer limits. They are the total across every project this product has ever
 * generated an image for, and until the bytes moved to R2 they were 128 MB and 4,096 images — for
 * everyone, together. Eight projects at the per-project cap filled it, and the message on the other
 * side is "Image storage is full", shown to a paying customer who has generated two images. That is
 * a product-stopping limit rather than an abuse guard, and it was sized for the store it was in:
 * base64 in a D1 table that also holds the corpus, the automations and the memory.
 *
 * In R2 the constraint is a bill rather than a table. 8 GiB of base64 is about 6 GiB of pixels,
 * which sits inside R2's 10 GB-month free allowance on this account, and the count is what stops a
 * runaway loop from making a million tiny objects rather than what stops the storage filling.
 *
 * The D1 pair survives because the binding is optional: a `wrangler dev` without R2, or a deploy
 * from an older config, still writes base64 into the table, and lifting its ceiling to 8 GiB would
 * point the old failure at a worse store. `generatedImageCeiling()` picks the pair that matches
 * where the bytes are actually going, which is the only honest way to have two.
 */
export const GENERATED_GLOBAL_BYTES = 8 * 1024 * 1024 * 1024;
export const GENERATED_GLOBAL_COUNT = 65_536;
export const GENERATED_GLOBAL_BYTES_D1 = 128 * 1024 * 1024;
export const GENERATED_GLOBAL_COUNT_D1 = 4096;

/** The ceiling that applies given whether this deployment has an object store. */
export function generatedImageCeiling(hasBucket: boolean): { bytes: number; count: number } {
  return hasBucket
    ? { bytes: GENERATED_GLOBAL_BYTES, count: GENERATED_GLOBAL_COUNT }
    : { bytes: GENERATED_GLOBAL_BYTES_D1, count: GENERATED_GLOBAL_COUNT_D1 };
}
