import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { d1 } from './stubs/d1.mjs';
const directory = mkdtempSync(join(tmpdir(), 'apple-durable-images-'));
const output = join(directory, 'module.mjs');
await build({ entryPoints: [new URL('../src/generated-images.ts', import.meta.url).pathname], bundle: true, format: 'esm', platform: 'node', outfile: output });
const M = await import(output);
process.on('exit', () => rmSync(directory, { recursive: true, force: true }));
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_BYTES = Uint8Array.from(atob(PNG), (c) => c.charCodeAt(0));
/**
 * The read answers in BYTES rather than base64 since the pixels moved to R2, and these assertions
 * say so rather than comparing a string that no longer exists. `deepEqual` on a Uint8Array
 * compares contents, so a byte that changed still fails — the looser-looking form is not looser.
 */
const pixels = (r) => ({ bytes: r.bytes === null ? null : Buffer.from(r.bytes).toString('base64'), deleted: r.deleted });

test('schema initializes when D1 treats each newline as a separate query', async () => {
  const db = d1();
  try {
    const binding = { CORPUS: { ...db.CORPUS, async exec(sql) {
      for (const line of sql.split('\n')) db.raw.exec(line);
      return { count: sql.split('\n').length, duration: 0 };
    } } };
    await M.ensureGeneratedImageTables(binding);
    assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('generated_images','generated_image_tombstones')").get().n, 2);
  } finally { db.close(); }
});

test('image stays retrievable beyond an hour and only inside its own project', async () => {
  const db = d1();
  try {
    const id = await M.saveGeneratedImage(db, PNG, 'project-a');
    db.raw.prepare('UPDATE generated_images SET created_at = ?').run(Date.now() - 90 * 86400_000);
    assert.deepEqual(pixels(await M.readGeneratedImage(db, 'project-a', id)), { bytes: PNG, deleted: false });
    assert.deepEqual(pixels(await M.readGeneratedImage(db, 'project-b', id)), { bytes: null, deleted: false });
    assert.deepEqual(pixels(await M.readGeneratedImage(db, 'project-a', 'unknown')), { bytes: null, deleted: false });
  } finally { db.close(); }
});

test('concurrent writers cannot cross the per-project count cap', async () => {
  const db = d1();
  try {
    const results = await Promise.allSettled(Array.from({ length: M.GENERATED_PROJECT_COUNT + 1 }, () => M.saveGeneratedImage(db, PNG, 'a')));
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, M.GENERATED_PROJECT_COUNT);
    assert.equal(await M.generatedImageCapacity(db, 'a'), false);
    assert.equal(await M.generatedImageCapacity(db, 'b'), true);
  } finally { db.close(); }
});

test('project and global byte admission are checked by the insert, not only preflight', async () => {
  for (const global of [false, true]) {
    const db = d1();
    try {
      await M.ensureGeneratedImageTables(db);
      const limit = global ? M.GENERATED_GLOBAL_BYTES : M.GENERATED_PROJECT_BYTES;
      db.raw.prepare('INSERT INTO generated_images (project_id, image_id, base64, stored_bytes, created_at) VALUES (?, ?, ?, ?, ?)').run(global ? 'other' : 'a', 'seed', PNG, limit, Date.now());
      assert.equal(await M.generatedImageCapacity(db, 'a'), false);
      await assert.rejects(M.saveGeneratedImage(db, PNG, 'a'), /full|deleted/);
      assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM generated_images').get().n, 1);
    } finally { db.close(); }
  }
});

test('deletion fences late writers, leaves other projects alone, and retries safely', async () => {
  const db = d1();
  try {
    const id = await M.saveGeneratedImage(db, PNG, 'a');
    const other = await M.saveGeneratedImage(db, PNG, 'b');
    assert.equal(await M.eraseGeneratedImages(db, 'a'), 1);
    assert.deepEqual(pixels(await M.readGeneratedImage(db, 'a', id)), { bytes: null, deleted: true });
    assert.equal(await M.generatedImageCapacity(db, 'a'), false);
    await assert.rejects(M.saveGeneratedImage(db, PNG, 'a'), /full|deleted/);
    assert.equal(await M.eraseGeneratedImages(db, 'a'), 0);
    assert.deepEqual(pixels(await M.readGeneratedImage(db, 'b', other)), { bytes: PNG, deleted: false });
  } finally { db.close(); }
});

test('failed deletion does not claim success or allow late writes', async () => {
  const db = d1();
  try {
    const id = await M.saveGeneratedImage(db, PNG, 'a');
    db.raw.exec("CREATE TRIGGER fail_delete BEFORE DELETE ON generated_images BEGIN SELECT RAISE(ABORT, 'simulated failure'); END;");
    await assert.rejects(M.eraseGeneratedImages(db, 'a'), /simulated failure/);
    assert.deepEqual(pixels(await M.readGeneratedImage(db, 'a', id)), { bytes: null, deleted: true });
    await assert.rejects(M.saveGeneratedImage(db, PNG, 'a'), /full|deleted/);
    db.raw.exec('DROP TRIGGER fail_delete');
    assert.equal(await M.eraseGeneratedImages(db, 'a'), 1);
  } finally { db.close(); }
});

test('unbounded and non-image payloads are refused before storage', async () => {
  const db = d1();
  try {
    await assert.rejects(M.saveGeneratedImage(db, 'A'.repeat(M.GENERATED_IMAGE_MAX_ENCODED + 1), 'a'), /limits/);
    await assert.rejects(M.saveGeneratedImage(db, '!', 'a'), /base64/);
    await assert.rejects(M.saveGeneratedImage(db, btoa('<svg></svg>'), 'a'), /raster/);
  } finally { db.close(); }
});

/* ------------------------------------------------------------------------ the bucket ---
 *
 * EVERY TEST ABOVE RUNS WITHOUT ONE. They pass a bare D1 stub as the env, so `env.MEDIA` is
 * undefined, `mediaStore()` answers null, and the whole R2 path is skipped — which means seven
 * green tests proved the FALLBACK and said nothing at all about the thing that was just built.
 * These are the ones that exercise it.
 */

/** An R2 bucket, in the ways this module depends on, that records what it was told. */
function bucket({ failPut = false } = {}) {
  const objects = new Map();
  return {
    objects,
    async put(key, bytes, opts) {
      if (failPut) throw new Error('simulated R2 outage');
      objects.set(key, { bytes: Uint8Array.from(bytes), contentType: opts?.httpMetadata?.contentType ?? null });
    },
    async get(key) {
      const o = objects.get(key);
      return o ? { httpMetadata: { contentType: o.contentType }, arrayBuffer: async () => o.bytes.buffer } : null;
    },
  };
}

test('WITH A BUCKET the pixels are in R2 and the row is only the index', async () => {
  const db = d1();
  try {
    const MEDIA = bucket();
    const env = { ...db, MEDIA };
    const id = await M.saveGeneratedImage(env, PNG, 'project-a');

    // The key is the erasure contract from media-store.ts, project SECOND, and the row records the
    // exact string rather than a flag — so a person holding a row can find the object.
    const row = db.raw.prepare('SELECT base64, r2_key, stored_bytes FROM generated_images WHERE image_id = ?').get(id);
    assert.equal(row.r2_key, `image/project-a/${id}`);
    assert.equal(row.base64, '', 'the payload must not be in the table as well as the bucket');
    // The QUOTA UNIT did not change with the store. If this ever counts decoded bytes, one SUM
    // starts adding two units together and the global ceiling becomes a number with no meaning.
    assert.equal(row.stored_bytes, PNG.length);
    assert.ok(MEDIA.objects.has(`image/project-a/${id}`));
    assert.equal(MEDIA.objects.get(`image/project-a/${id}`).contentType, 'image/png');

    assert.deepEqual(pixels(await M.readGeneratedImage(env, 'project-a', id)), { bytes: PNG, deleted: false });
    // Ownership is still the key, not a guess: another project cannot construct its way in.
    assert.deepEqual(pixels(await M.readGeneratedImage(env, 'project-b', id)), { bytes: null, deleted: false });
  } finally { db.close(); }
});

test('A FAILED PUT TAKES THE ROW BACK, so an unfetchable image holds no quota', async () => {
  const db = d1();
  try {
    const env = { ...db, MEDIA: bucket({ failPut: true }) };
    await assert.rejects(M.saveGeneratedImage(env, PNG, 'a'), /R2 outage/);
    // The compensation is the point. Without it the row survives, counts against both quotas
    // forever, and appears in the account export as a file that 404s.
    assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM generated_images').get().n, 0);
    // Falsification: the same write succeeds once the store does, so the refusal above was the
    // put failing and not some other gate quietly rejecting it.
    const ok = { ...db, MEDIA: bucket() };
    assert.ok(await M.saveGeneratedImage(ok, PNG, 'a'));
  } finally { db.close(); }
});

test('a row pointing at an object that is not there reads as MISSING, not as an error', async () => {
  const db = d1();
  try {
    const MEDIA = bucket();
    const env = { ...db, MEDIA };
    const id = await M.saveGeneratedImage(env, PNG, 'a');
    MEDIA.objects.clear();
    // This is the half-written window and it is also what a lost object looks like. The honest
    // answer to "show me this image" is the 404 an expired preview gets; a throw would render as a
    // 500 telling the customer the store is broken when one object is missing.
    assert.deepEqual(pixels(await M.readGeneratedImage(env, 'a', id)), { bytes: null, deleted: false });
  } finally { db.close(); }
});

test('THE GLOBAL CEILING FOLLOWS THE STORE, and the preflight uses the one the insert will', async () => {
  // The old ceiling was 128 MB and 4,096 images for EVERY customer together — eight projects at
  // the per-project cap filled it, and the ninth customer was told storage was full.
  const withR2 = M.generatedImageCeiling(true);
  const withoutR2 = M.generatedImageCeiling(false);
  assert.ok(withR2.bytes > withoutR2.bytes * 8, 'moving to R2 must actually lift the ceiling');
  assert.equal(withoutR2.bytes, 128 * 1024 * 1024, 'the D1 ceiling must NOT be lifted — it bounds a table, not a bill');

  const db = d1();
  try {
    await M.ensureGeneratedImageTables(db);
    // Seed past the D1 ceiling exactly once, then ask both deployments the same question.
    db.raw.prepare('INSERT INTO generated_images (project_id, image_id, base64, stored_bytes, created_at) VALUES (?, ?, ?, ?, ?)')
      .run('someone-else', 'seed', '', withoutR2.bytes, Date.now());
    assert.equal(await M.generatedImageCapacity(db, 'mine'), false, 'without a bucket the old ceiling still holds');
    assert.equal(await M.generatedImageCapacity({ ...db, MEDIA: bucket() }, 'mine'), true,
      'with a bucket the same tree must still accept writes — this is the product-stopping limit being lifted');
  } finally { db.close(); }
});
