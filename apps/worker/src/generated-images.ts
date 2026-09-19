/** Small, private generated assets. Previews remain in KV; paid image results belong to projects. */
import type { Env } from './env';
import { oncePerIsolate } from './schema-once';
import { imageMimeType } from './imagegen';
import { GENERATED_IMAGE_MAX_BYTES, GENERATED_IMAGE_MAX_ENCODED, GENERATED_PROJECT_BYTES, GENERATED_PROJECT_COUNT, GENERATED_GLOBAL_BYTES, GENERATED_GLOBAL_COUNT } from './generated-image-limits';
export { GENERATED_IMAGE_MAX_BYTES, GENERATED_IMAGE_MAX_ENCODED, GENERATED_PROJECT_BYTES, GENERATED_PROJECT_COUNT, GENERATED_GLOBAL_BYTES, GENERATED_GLOBAL_COUNT } from './generated-image-limits';

export async function ensureGeneratedImageTables(env: Pick<Env, 'CORPUS'>): Promise<void> {
  await oncePerIsolate('generated-images-v1', async () => {
    // D1 exec treats newlines as query separators; keep each DDL statement on one line.
    await env.CORPUS.exec([
      'CREATE TABLE IF NOT EXISTS generated_images (project_id TEXT NOT NULL, image_id TEXT NOT NULL, base64 TEXT NOT NULL, stored_bytes INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(project_id, image_id));',
      'CREATE TABLE IF NOT EXISTS generated_image_tombstones (project_id TEXT PRIMARY KEY);',
    ].join('\n'));
  }, env.CORPUS);
}

const CAPACITY = `NOT EXISTS (SELECT 1 FROM generated_image_tombstones WHERE project_id = ?)
  AND (SELECT COUNT(*) FROM generated_images WHERE project_id = ?) < ?
  AND (SELECT COALESCE(SUM(stored_bytes),0) FROM generated_images WHERE project_id = ?) + ? <= ?
  AND (SELECT COUNT(*) FROM generated_images) < ?
  AND (SELECT COALESCE(SUM(stored_bytes),0) FROM generated_images) + ? <= ?`;

function capacityBindings(projectId: string, bytes: number): (string | number)[] {
  return [projectId, projectId, GENERATED_PROJECT_COUNT, projectId, bytes, GENERATED_PROJECT_BYTES,
    GENERATED_GLOBAL_COUNT, bytes, GENERATED_GLOBAL_BYTES];
}

/** Conservative preflight before a paid call; the insert repeats these checks atomically. */
export async function generatedImageCapacity(env: Pick<Env, 'CORPUS'>, projectId: string): Promise<boolean> {
  await ensureGeneratedImageTables(env);
  return !!await env.CORPUS.prepare(`SELECT 1 AS available WHERE ${CAPACITY}`)
    .bind(...capacityBindings(projectId, GENERATED_IMAGE_MAX_ENCODED)).first();
}

export async function saveGeneratedImage(env: Pick<Env, 'CORPUS'>, base64: string, projectId: string): Promise<string> {
  if (!projectId || projectId.length > 128 || base64.length > GENERATED_IMAGE_MAX_ENCODED) throw new Error('Generated image exceeds storage limits');
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)); }
  catch { throw new Error('Generated image is not valid base64'); }
  if (bytes.byteLength > GENERATED_IMAGE_MAX_BYTES || !imageMimeType(bytes)) throw new Error('Generated image is not a supported bounded raster');
  await ensureGeneratedImageTables(env);
  const id = crypto.randomUUID();
  // Payload and quota admission are ONE write: no orphaned KV blob or separate quota counter.
  const result = await env.CORPUS.prepare(`INSERT INTO generated_images
    (project_id, image_id, base64, stored_bytes, created_at)
    SELECT ?, ?, ?, ?, ? WHERE ${CAPACITY}`)
    .bind(projectId, id, base64, base64.length, Date.now(), ...capacityBindings(projectId, base64.length)).run();
  if (!result.success || result.meta.changes !== 1) throw new Error('Image storage is full or this project was deleted');
  return id;
}

export async function readGeneratedImage(env: Pick<Env, 'CORPUS'>, projectId: string, imageId: string): Promise<{ base64: string | null; deleted: boolean }> {
  await ensureGeneratedImageTables(env);
  // A deleted project is NOT a missing image: the caller must not fall back to legacy KV.
  const row = await env.CORPUS.prepare(`SELECT
    (SELECT base64 FROM generated_images WHERE project_id = ? AND image_id = ?) AS base64,
    EXISTS (SELECT 1 FROM generated_image_tombstones WHERE project_id = ?) AS deleted`)
    .bind(projectId, imageId, projectId).first<{ base64: string | null; deleted: number }>();
  if (!row) throw new Error('Image state could not be read');
  return { base64: row.deleted ? null : row.base64, deleted: !!row.deleted };
}

/** First deny future writes, then delete. If deletion fails, retry is safe and cannot resurrect data. */
export async function eraseGeneratedImages(env: Pick<Env, 'CORPUS'>, projectId: string): Promise<number> {
  await ensureGeneratedImageTables(env);
  const fence = await env.CORPUS.prepare('INSERT OR IGNORE INTO generated_image_tombstones(project_id) VALUES (?)').bind(projectId).run();
  if (!fence.success) throw new Error('Image deletion fence failed');
  const result = await env.CORPUS.prepare('DELETE FROM generated_images WHERE project_id = ?').bind(projectId).run();
  if (!result.success) throw new Error('Image deletion failed');
  return result.meta.changes;
}
