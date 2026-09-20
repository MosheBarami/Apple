#!/usr/bin/env node
/**
 * The showcase manifest's merge rule, shared by the UI and map generators.
 *
 * It lives in its own module because BOTH generators write a manifest and both were destroying
 * history on a partial re-run. One copy, one guard, one behaviour.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A RE-RUN OF ONE SCREEN MUST NOT ERASE THE RECORD OF THE OTHER FIFTEEN.
 *
 * The manifest is the only place that says which screens exist, what they cost and which ones
 * failed. Overwriting it with the results of a one-target run would delete the evidence for
 * everything the run did not touch, and the gallery built from it would silently shrink — a
 * failure to observe presenting as an observation. Results are keyed by screen+genre, and a fresh
 * result replaces the row of the same key while every other row survives.
 */
export function mergeResults(outDir, fresh) {
  const path = join(outDir, 'manifest.json');
  if (!existsSync(path)) return fresh;
  let prior;
  try {
    prior = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fresh; // an unreadable manifest is replaced, not silently merged into
  }
  if (!Array.isArray(prior.results)) return fresh;
  //[[ THE KEY IS WHAT WAS ASKED FOR, NOT WHAT CAME BACK.
  //
  //   MEASURED. The key used to read `r.id ?? r.target`, and `id` is the LIBRARY's resolved id,
  //   which only a row that got as far as the library carries. A failed row fell back to `target`
  //   and, worse, carried no `genre` at all — so one screen keyed as `screen-gacha--tycoon` when it
  //   built and `screen-gacha--` when it failed. Sixteen screens produced twenty rows, and
  //   screen-gacha appeared TWICE: built, from a stale run, beside runtime_error from the current
  //   one — with the stale run's PNG still on disk for the gallery to show. A reader would have
  //   seen a picture of a screen that no longer builds.
  //
  //   `target` and `genre` are what the caller asked for, every row carries both now, and they are
  //   the identity. `id` is a result, and a result must never be part of a key. ]]
  const key = (r) => `${r.target ?? r.id ?? ''}--${r.genre ?? ''}`;
  const byKey = new Map(prior.results.map((r) => [key(r), r]));
  for (const r of fresh) byKey.set(key(r), r);
  return [...byKey.values()];
}
