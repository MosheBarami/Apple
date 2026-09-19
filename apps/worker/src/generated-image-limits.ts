import { RETENTION } from './retention';

export const GENERATED_IMAGE_MAX_BYTES = 1024 * 1024;
export const GENERATED_IMAGE_MAX_ENCODED = 4 * Math.ceil(GENERATED_IMAGE_MAX_BYTES / 3);
// Project/global quotas count stored base64 bytes, not decoded file bytes (about 4/3 larger).
export const GENERATED_PROJECT_BYTES = 16 * 1024 * 1024;
export const GENERATED_PROJECT_COUNT = RETENTION.generatedImagesKept;
export const GENERATED_GLOBAL_BYTES = 128 * 1024 * 1024;
export const GENERATED_GLOBAL_COUNT = 4096;
