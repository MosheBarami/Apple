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
    assert.deepEqual(await M.readGeneratedImage(db, 'project-a', id), { base64: PNG, deleted: false });
    assert.deepEqual(await M.readGeneratedImage(db, 'project-b', id), { base64: null, deleted: false });
    assert.deepEqual(await M.readGeneratedImage(db, 'project-a', 'unknown'), { base64: null, deleted: false });
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
      db.raw.prepare('INSERT INTO generated_images VALUES (?, ?, ?, ?, ?)').run(global ? 'other' : 'a', 'seed', PNG, limit, Date.now());
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
    assert.deepEqual(await M.readGeneratedImage(db, 'a', id), { base64: null, deleted: true });
    assert.equal(await M.generatedImageCapacity(db, 'a'), false);
    await assert.rejects(M.saveGeneratedImage(db, PNG, 'a'), /full|deleted/);
    assert.equal(await M.eraseGeneratedImages(db, 'a'), 0);
    assert.deepEqual(await M.readGeneratedImage(db, 'b', other), { base64: PNG, deleted: false });
  } finally { db.close(); }
});

test('failed deletion does not claim success or allow late writes', async () => {
  const db = d1();
  try {
    const id = await M.saveGeneratedImage(db, PNG, 'a');
    db.raw.exec("CREATE TRIGGER fail_delete BEFORE DELETE ON generated_images BEGIN SELECT RAISE(ABORT, 'simulated failure'); END;");
    await assert.rejects(M.eraseGeneratedImages(db, 'a'), /simulated failure/);
    assert.deepEqual(await M.readGeneratedImage(db, 'a', id), { base64: null, deleted: true });
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
