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
  // Both row shapes are keyed here. A UI row carries a screen id AND a genre, because the same shop
  // built for horror and for tycoon are two different results. A MAP row carries only a genre —
  // there is one map per genre — so its screen half is empty and the genre alone identifies it.
  const key = (r) => `${r.id ?? r.target ?? ''}--${r.genre ?? ''}`;
  const byKey = new Map(prior.results.map((r) => [key(r), r]));
  for (const r of fresh) byKey.set(key(r), r);
  return [...byKey.values()];
}
