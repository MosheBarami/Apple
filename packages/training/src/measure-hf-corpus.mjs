#!/usr/bin/env node
/**
 * HOW MUCH LUAU IS ACTUALLY OUT THERE, MEASURED RATHER THAN LISTED.
 *
 * THE GAP THIS FILLS. `packages/training/discovery/v2/hf-datasets.jsonl` catalogued 115 Hub
 * datasets on 2026-09-20 with a licence, a disposition and a reason for each — careful work. Every
 * single one of its `row_count` fields is 0. It recorded what each dataset IS and never what each
 * dataset HOLDS, so the register cannot answer the only question the owner asked of it: is there
 * enough here. A list of names is not a corpus.
 *
 * It also had no script behind it. It was produced once, by hand, and nothing in the repository
 * could produce it again — which is the shape this repository calls a dead end however good the
 * contents are. This file is the re-runnable half.
 *
 * WHAT IT DOES. Enumerates the Hub's dataset index across the Roblox/Luau search surface, then asks
 * datasets-server for each one's REAL size. Both are public, unauthenticated, read-only endpoints;
 * nothing here downloads a dataset, and nothing here decides admission — licence and suitability
 * stay with the register. This answers volume only.
 *
 *   node packages/training/src/measure-hf-corpus.mjs            # writes runs/hf-luau-corpus-measured.jsonl
 *
 * A dataset whose size cannot be read is written with rows: 0 AND the reason in `why` — gated,
 * private, or no parquet conversion. It is NOT dropped, because a dataset that could not be
 * measured and a dataset measured as empty are different facts and must not print the same.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS = resolve(HERE, '..', 'runs');

/** The search surface. "lua game" and "rbx" pull in adjacent noise on purpose: a term that returns
 *  only clean hits is a term that is also missing things, and the classifier below separates them
 *  afterwards where the decision is visible. */
const TERMS = ['roblox', 'luau', 'rbx', 'roblox studio', 'lua game'];

/** Roblox-ADJACENT is not Roblox-CODE. Usernames, meshes, avatars, clothing, PII benchmarks and
 *  YouTube comments are all real Roblox data and none of them teaches a model to write Luau. */
const CODE = /luau|robloxcode|roblox-?db|roblox-?large|luau_github|lua-luau|coding-instructions|acecode/i;
const NOISE = /username|mesh|avatar|clothing|pii|comment|icon|inappropriate|bio/i;

const seen = new Map();
for (const term of TERMS) {
  const res = await fetch(`https://huggingface.co/api/datasets?search=${encodeURIComponent(term)}&limit=1000&full=false`);
  if (!res.ok) { console.error(`search "${term}" -> HTTP ${res.status}; that term contributed nothing`); continue; }
  for (const d of await res.json()) {
    if (!seen.has(d.id)) seen.set(d.id, { id: d.id, downloads: d.downloads ?? 0, likes: d.likes ?? 0, terms: [] });
    seen.get(d.id).terms.push(term);
  }
  console.error(`  search "${term}": ${seen.size} distinct so far`);
}

const all = [...seen.values()];
console.error(`\nmeasuring ${all.length} datasets`);
let done = 0;
async function measure(d) {
  try {
    const res = await fetch(`https://datasets-server.huggingface.co/size?dataset=${encodeURIComponent(d.id)}`);
    const body = await res.json();
    d.rows = body?.size?.dataset?.num_rows ?? 0;
    d.bytes = body?.size?.dataset?.num_bytes_original_files ?? 0;
    d.why = d.rows ? '' : (body?.error ?? `http ${res.status}`);
  } catch (e) { d.rows = 0; d.bytes = 0; d.why = e.message; }
  d.isLuauCode = CODE.test(d.id) && !NOISE.test(d.id);
  if (++done % 25 === 0) console.error(`  ${done}/${all.length}`);
}
for (let i = 0; i < all.length; i += 12) await Promise.all(all.slice(i, i + 12).map(measure));

all.sort((a, b) => b.rows - a.rows);
mkdirSync(RUNS, { recursive: true });
const out = join(RUNS, 'hf-luau-corpus-measured.jsonl');
writeFileSync(out, all.map((d) => JSON.stringify(d)).join('\n') + '\n');

const code = all.filter((d) => d.isLuauCode && d.rows > 0);
const unread = all.filter((d) => !d.rows);
const n = (x) => x.toLocaleString('en-US');
console.error(`\nLuau/Roblox-CODE corpora: ${code.length} datasets, ${n(code.reduce((s, d) => s + d.rows, 0))} rows, `
  + `${(code.reduce((s, d) => s + d.bytes, 0) / 1e9).toFixed(1)} GB`);
console.error(`size unreadable (gated, private, or not parquet-converted): ${unread.length} — counted, not dropped`);
console.error(`-> ${out}`);
