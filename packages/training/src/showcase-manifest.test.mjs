/**
 * THE MANIFEST IS THE ONLY RECORD OF WHAT THE SHOWCASE CONTAINS.
 *
 * It says which screens exist, which failed and why. A one-target re-run — the normal way to redo a
 * screen after fixing a harness gap — used to overwrite it wholesale, deleting the evidence for
 * every screen the run did not touch. The gallery is built from this file, so the gallery would
 * silently shrink to one card and nothing would say that fifteen results had been discarded.
 *
 * That is a failure to observe presenting as an observation, so the merge is guarded.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mergeResults } from './showcase-manifest.mjs';

const withDir = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'showcase-manifest-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
const write = (dir, results) =>
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ results }, null, 2));

test('a re-run of one screen keeps every other screen in the manifest', () =>
  withDir((dir) => {
    write(dir, [
      { id: 'screen-shop', genre: 'tycoon', outcome: 'built', guiNodes: 43 },
      { id: 'screen-hud', genre: 'tycoon', outcome: 'runtime_error', detail: 'missing method' },
      { id: 'screen-lobby', genre: 'tycoon', outcome: 'built', guiNodes: 24 },
    ]);
    const merged = mergeResults(dir, [{ id: 'screen-hud', genre: 'tycoon', outcome: 'built', guiNodes: 51 }]);

    assert.equal(merged.length, 3, 'nothing may be dropped by a one-target run');
    const hud = merged.find((r) => r.id === 'screen-hud');
    assert.equal(hud.outcome, 'built', 'the fresh result replaces the stale one');
    assert.equal(hud.guiNodes, 51);
    assert.ok(merged.find((r) => r.id === 'screen-shop'), 'the untouched screens survive');
    assert.ok(merged.find((r) => r.id === 'screen-lobby'));
  }));

test('the same screen in a different genre is a different row', () =>
  withDir((dir) => {
    write(dir, [{ id: 'screen-shop', genre: 'tycoon', outcome: 'built' }]);
    const merged = mergeResults(dir, [{ id: 'screen-shop', genre: 'horror', outcome: 'built' }]);
    assert.equal(merged.length, 2, 'genre is part of the identity, or one genre erases another');
  }));

test('with no prior manifest the fresh results stand alone', () =>
  withDir((dir) => {
    const fresh = [{ id: 'screen-shop', genre: 'tycoon', outcome: 'built' }];
    assert.deepEqual(mergeResults(dir, fresh), fresh);
  }));

test('an unreadable manifest is replaced rather than silently half-merged', () =>
  withDir((dir) => {
    writeFileSync(join(dir, 'manifest.json'), '{ this is not json');
    const fresh = [{ id: 'screen-shop', genre: 'tycoon', outcome: 'built' }];
    assert.deepEqual(mergeResults(dir, fresh), fresh);
  }));

test('a failure replacing a success is kept as a failure, never quietly preferred away', () =>
  withDir((dir) => {
    write(dir, [{ id: 'screen-map', genre: 'tycoon', outcome: 'built', guiNodes: 12 }]);
    const merged = mergeResults(dir, [{ id: 'screen-map', genre: 'tycoon', outcome: 'no_code_block' }]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].outcome, 'no_code_block', 'the newest measurement wins in both directions');
  }));

test('map rows, which carry only a genre, merge one per genre', () =>
  withDir((dir) => {
    write(dir, [
      { genre: 'tycoon', outcome: 'runtime_error', detail: 'arithmetic' },
      { genre: 'obby', outcome: 'built', parts: 84 },
      { genre: 'horror', outcome: 'built', parts: 182 },
    ]);
    const merged = mergeResults(dir, [{ genre: 'tycoon', outcome: 'built', parts: 102 }]);

    assert.equal(merged.length, 3, 'a one-genre re-run keeps the other two maps');
    assert.equal(merged.find((r) => r.genre === 'tycoon').parts, 102);
    assert.equal(merged.find((r) => r.genre === 'obby').parts, 84);
  }));

/**
 * The key must be what was ASKED FOR. `id` is the library's resolved id and only a row that reached
 * the library carries it, so keying on it made one screen key two different ways depending on
 * whether it succeeded — and the manifest then held a stale "built" row beside a fresh failure for
 * the same screen, with the stale PNG still on disk for the gallery to show.
 */
test('a fresh failure replaces the built row for the same screen, not sits beside it', () =>
  withDir((dir) => {
    write(dir, [{ target: 'screen-gacha', id: 'screen-gacha', genre: 'tycoon', outcome: 'built', guiNodes: 53 }]);
    const merged = mergeResults(dir, [
      { target: 'screen-gacha', genre: 'tycoon', id: 'screen-gacha', outcome: 'runtime_error', detail: 'index nil' },
    ]);

    assert.equal(merged.length, 1, 'one screen in one genre is exactly one row, whatever the outcome');
    assert.equal(merged[0].outcome, 'runtime_error');
  }));

test('a bare target name and its resolved library id are the same row', () =>
  withDir((dir) => {
    // The library resolves bare names: asking for "shop" returns the entry "screen-shop". So a row
    // that FAILED before reaching the library carries target "shop" and no id, while the row that
    // built carries target "shop" AND id "screen-shop". Keying on the resolved id forks those into
    // two rows for one screen, which is how a stale success ended up beside a fresh failure.
    write(dir, [{ target: 'shop', genre: 'tycoon', outcome: 'request_failed', detail: 'timeout' }]);
    const merged = mergeResults(dir, [
      { target: 'shop', id: 'screen-shop', genre: 'tycoon', outcome: 'built', guiNodes: 57 },
    ]);

    assert.equal(merged.length, 1, 'the resolved id must not fork the identity of one request');
    assert.equal(merged[0].outcome, 'built');
  }));
