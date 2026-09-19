/**
 * Small, private generated assets. Previews remain in KV; paid image results belong to projects.
 *
 * WHERE THE BYTES ARE. The row is still the admission gate — quota and tombstone are decided in one
 * D1 statement, atomically, because that is the only place they can be — but the pixels now live in
 * R2 and the row records the key. A `r2_key` that is NULL means the row predates the move and its
 * base64 is in the table; that is not a legacy branch to delete later, it is how the deployments
 * without a bucket keep working.
 *
 * WHY THE ROW IS WRITTEN FIRST. The insert is what decides whether this image is ALLOWED to exist:
 * it checks the tombstone and both quotas in one statement. Putting the object first would mean
 * uploading bytes the quota may then refuse, leaving an object in the bucket that no row points at
 * and nothing sweeps until the project is deleted. Row first, bytes second, and a failed put
 * deletes the row it just wrote — an image nobody can fetch must not hold quota.
 *
 * WHAT THAT LEAVES. Between the insert and the put there is a row whose bytes are not there yet. No
 * one can ask for it: the id is not returned until both have happened. A reader who somehow arrives
 * inside that window gets `bytes: null`, which the route already renders as a 404 — the same answer
 * it gives for an expired preview, and the correct one for pixels that do not exist.
 */
import type { Env } from './env';
import { oncePerIsolate } from './schema-once';
import { imageMimeType } from './imagegen';
import { mediaKey, mediaStore, putMedia, getMedia } from './media-store';
import { GENERATED_IMAGE_MAX_BYTES, GENERATED_IMAGE_MAX_ENCODED, GENERATED_PROJECT_BYTES, GENERATED_PROJECT_COUNT, generatedImageCeiling } from './generated-image-limits';
export { GENERATED_IMAGE_MAX_BYTES, GENERATED_IMAGE_MAX_ENCODED, GENERATED_PROJECT_BYTES, GENERATED_PROJECT_COUNT, GENERATED_GLOBAL_BYTES, GENERATED_GLOBAL_COUNT, generatedImageCeiling } from './generated-image-limits';

type ImageEnv = Pick<Env, 'CORPUS' | 'MEDIA'>;

export async function ensureGeneratedImageTables(env: Pick<Env, 'CORPUS'>): Promise<void> {
  await oncePerIsolate('generated-images-v1', async () => {
    // D1 exec treats newlines as query separators; keep each DDL statement on one line.
    await env.CORPUS.exec([
      'CREATE TABLE IF NOT EXISTS generated_images (project_id TEXT NOT NULL, image_id TEXT NOT NULL, base64 TEXT NOT NULL, stored_bytes INTEGER NOT NULL, created_at INTEGER NOT NULL, r2_key TEXT, PRIMARY KEY(project_id, image_id));',
      'CREATE TABLE IF NOT EXISTS generated_image_tombstones (project_id TEXT PRIMARY KEY);',
    ].join('\n'));
    // THE COLUMN ON A TABLE THAT ALREADY EXISTS. `CREATE TABLE IF NOT EXISTS` above does nothing
    // for a deployment that already has this table, so the column has to be added separately —
    // and SQLite has no `ADD COLUMN IF NOT EXISTS`, so the second run throws "duplicate column".
    // That throw is the expected steady state, not an error, which is why it is swallowed here and
    // nowhere else: any OTHER failure would surface on the first write instead.
    try { await env.CORPUS.exec('ALTER TABLE generated_images ADD COLUMN r2_key TEXT;'); }
    catch { /* the column is already there, which is what we wanted */ }
  }, env.CORPUS);
}

const CAPACITY = `NOT EXISTS (SELECT 1 FROM generated_image_tombstones WHERE project_id = ?)
  AND (SELECT COUNT(*) FROM generated_images WHERE project_id = ?) < ?
  AND (SELECT COALESCE(SUM(stored_bytes),0) FROM generated_images WHERE project_id = ?) + ? <= ?
  AND (SELECT COUNT(*) FROM generated_images) < ?
  AND (SELECT COALESCE(SUM(stored_bytes),0) FROM generated_images) + ? <= ?`;

function capacityBindings(projectId: string, bytes: number, ceiling: { bytes: number; count: number }): (string | number)[] {
  return [projectId, projectId, GENERATED_PROJECT_COUNT, projectId, bytes, GENERATED_PROJECT_BYTES,
    ceiling.count, bytes, ceiling.bytes];
}

/** Conservative preflight before a paid call; the insert repeats these checks atomically. */
export async function generatedImageCapacity(env: ImageEnv, projectId: string): Promise<boolean> {
  await ensureGeneratedImageTables(env);
  // The preflight must use the SAME ceiling the insert will, or it refuses a call the insert would
  // have taken — a refusal the customer sees and nothing explains.
  const ceiling = generatedImageCeiling(mediaStore(env) !== null);
  return !!await env.CORPUS.prepare(`SELECT 1 AS available WHERE ${CAPACITY}`)
    .bind(...capacityBindings(projectId, GENERATED_IMAGE_MAX_ENCODED, ceiling)).first();
}

export async function saveGeneratedImage(env: ImageEnv, base64: string, projectId: string): Promise<string> {
  if (!projectId || projectId.length > 128 || base64.length > GENERATED_IMAGE_MAX_ENCODED) throw new Error('Generated image exceeds storage limits');
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)); }
  catch { throw new Error('Generated image is not valid base64'); }
  const contentType = imageMimeType(bytes);
  if (bytes.byteLength > GENERATED_IMAGE_MAX_BYTES || !contentType) throw new Error('Generated image is not a supported bounded raster');
  await ensureGeneratedImageTables(env);
  const id = crypto.randomUUID();
  const bucket = mediaStore(env) !== null;
  const ceiling = generatedImageCeiling(bucket);
  // Admission is ONE write and it still is: the tombstone and both quotas are decided in this
  // statement or not at all. What changed is what the row carries — an R2-backed row stores the key
  // and an empty payload, because the column is NOT NULL on tables that already exist and widening
  // it would mean rewriting a live table to say something `r2_key` already says.
  const result = await env.CORPUS.prepare(`INSERT INTO generated_images
    (project_id, image_id, base64, stored_bytes, created_at, r2_key)
    SELECT ?, ?, ?, ?, ?, ? WHERE ${CAPACITY}`)
    .bind(projectId, id, bucket ? '' : base64, base64.length, Date.now(),
      bucket ? mediaKey('image', projectId, id) : null, ...capacityBindings(projectId, base64.length, ceiling)).run();
  if (!result.success || result.meta.changes !== 1) throw new Error('Image storage is full or this project was deleted');
  if (!bucket) return id;

  try {
    await putMedia(env, 'image', projectId, id, bytes, contentType);
  } catch (error) {
    // THE ROW GOES BACK. An image nobody can fetch must not hold quota, and must not appear in an
    // export as a file that 404s. Deleting it is safe on retry and cannot resurrect anything: the
    // tombstone check is in the INSERT, so a deleted project cannot be written to either way.
    await env.CORPUS.prepare('DELETE FROM generated_images WHERE project_id = ? AND image_id = ?').bind(projectId, id).run().catch(() => {});
    throw error instanceof Error ? error : new Error('Generated image could not be stored');
  }
  return id;
}

/**
 * The pixels, as bytes.
 *
 * BYTES RATHER THAN BASE64, because with the payload in R2 the base64 form is a round trip nobody
 * needs: the object arrives as an ArrayBuffer, the route writes an ArrayBuffer, and encoding a
 * megabyte in between to decode it again on the next line is work done to preserve a signature.
 * The legacy column is decoded here instead of at the call site, which also puts "the stored string
 * is not valid base64" in the one place that knows the string came from a table rather than a user.
 */
export async function readGeneratedImage(env: ImageEnv, projectId: string, imageId: string): Promise<{ bytes: Uint8Array | null; deleted: boolean }> {
  await ensureGeneratedImageTables(env);
  // A deleted project is NOT a missing image: the caller must not fall back to legacy KV.
  const row = await env.CORPUS.prepare(`SELECT
    (SELECT base64 FROM generated_images WHERE project_id = ? AND image_id = ?) AS base64,
    (SELECT r2_key FROM generated_images WHERE project_id = ? AND image_id = ?) AS r2_key,
    EXISTS (SELECT 1 FROM generated_image_tombstones WHERE project_id = ?) AS deleted`)
    .bind(projectId, imageId, projectId, imageId, projectId).first<{ base64: string | null; r2_key: string | null; deleted: number }>();
  if (!row) throw new Error('Image state could not be read');
  if (row.deleted) return { bytes: null, deleted: true };

  if (row.r2_key !== null) {
    const object = await getMedia(env, 'image', projectId, imageId);
    // A row pointing at an object that is not there reads as MISSING, not as an error. It is the
    // half-written window, or a bucket that lost an object, and the honest answer to "show me this
    // image" is the same 404 an expired preview gets rather than a 500 that says the store broke.
    return { bytes: object ? new Uint8Array(object.body) : null, deleted: false };
  }

  if (!row.base64) return { bytes: null, deleted: false };
  try { return { bytes: Uint8Array.from(atob(row.base64), (character) => character.charCodeAt(0)), deleted: false }; }
  catch { return { bytes: null, deleted: false }; }
}

/** First deny future writes, then delete. If deletion fails, retry is safe and cannot resurrect data. */
export async function eraseGeneratedImages(env: Pick<Env, 'CORPUS'>, projectId: string): Promise<number> {
  // The R2 objects are NOT swept here. `eraseProjectData` runs `eraseProjectMedia` as its first
  // step, by prefix, which covers images, audio and attachments in one pass — and doing it twice
  // would make this function report rows it did not delete.
  await ensureGeneratedImageTables(env);
  const fence = await env.CORPUS.prepare('INSERT OR IGNORE INTO generated_image_tombstones(project_id) VALUES (?)').bind(projectId).run();
  if (!fence.success) throw new Error('Image deletion fence failed');
  const result = await env.CORPUS.prepare('DELETE FROM generated_images WHERE project_id = ?').bind(projectId).run();
  if (!result.success) throw new Error('Image deletion failed');
  return result.meta.changes;
}
