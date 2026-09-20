#!/usr/bin/env node
/**
 * Has the Hub actually been swept for Roblox material, or only for the words we happened to try?
 *
 * WHY THIS EXISTS. `manifests/hf-inventory.json` carries `coverage_claim: "Named query families
 * only; not all Hub content."` — an honest disclaimer that leaves the real question open. Seven
 * terms had been tried between that inventory and `measure-hf-corpus.mjs`: roblox, luau, rblx,
 * robloxstudio, rbx, "roblox studio", "lua game". The owner asked for "almost everything under
 * roblox on Hugging Face", and seven terms is not an answer to that.
 *
 * So this widens the net deliberately, with Roblox vocabulary the earlier sweeps did not use —
 * toolchain (rojo, roblox-ts), file formats (rbxlx, rbxm, rbxl), engine surface (datastore,
 * rbxassetid), and genre words — and asks how many NEW datasets appear.
 *
 * The trap, and the reason this file classifies rather than counts: a wider net catches more
 * non-Roblox material, not less. "datastore" returns OpenScholar retrieval stores and Solana
 * trading archives. "rojo" is Spanish for red. A sweep that reported those as new Roblox datasets
 * would manufacture coverage it does not have, which is worse than the narrow sweep it replaced.
 *
 * Writes runs/hub-coverage-sweep.json. Public search API; no credential required.
 *
 * Run: node packages/training/src/sweep-hub-coverage.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TRAINING = path.resolve(HERE, '..');
const OUT = path.join(TRAINING, 'runs/hub-coverage-sweep.json');

/** Terms the earlier sweeps used. Recorded so "new" means new relative to a stated baseline. */
export const TERMS_ALREADY_SWEPT = ['roblox', 'luau', 'rblx', 'robloxstudio', 'rbx', 'roblox studio', 'lua game'];

/** Roblox vocabulary the earlier sweeps did not use. */
export const TERMS_NEW = [
  'rojo', 'roblox-ts', 'robloxts', 'rbxlx', 'rbxm', 'rbxl', 'bloxstrap', 'luau-lang',
  'roblox api', 'datastore', 'obby', 'roblox game', 'luau script', 'roblox lua',
  'creator store', 'roblox ui', 'roblox dataset', 'luau code', 'rbxassetid', 'roblox studio plugin',
];

/**
 * Is this repository plausibly Roblox material at all?
 *
 * Deliberately generous on evidence and strict about where it looks: the repo id, its tags, and
 * its author. A dataset called `OpenScholar-DataStore-V3` matched the query "datastore" and has
 * nothing to do with Roblox; nothing in its id or tags says roblox, luau or rbx, so it is out.
 * Being generous here is safe because a false POSITIVE only adds a row to a review list, while a
 * false negative silently shrinks claimed coverage.
 */
export function looksRoblox(repo) {
  const haystack = [
    String(repo.id ?? ''),
    String(repo.author ?? ''),
    ...(Array.isArray(repo.tags) ? repo.tags.map(String) : []),
  ].join(' ').toLowerCase();
  const hits = ['roblox', 'luau', 'rblx', 'rbxm', 'rbxl', 'rbxassetid', 'bloxstrap', 'roblox-ts'].filter((k) => haystack.includes(k));
  return { relevant: hits.length > 0, matched_on: hits };
}

function knownIds() {
  const ids = new Set();
  for (const rel of ['discovery/v2/hf-datasets.jsonl', 'runs/hf-luau-corpus-measured.jsonl']) {
    const file = path.join(TRAINING, rel);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (line.trim()) ids.add(JSON.parse(line).id);
    }
  }
  return ids;
}

async function search(term) {
  const url = `https://huggingface.co/api/datasets?search=${encodeURIComponent(term)}&limit=100&full=false`;
  const res = await fetch(url, { headers: { 'user-agent': 'apple-roblox-rights-clearance' } });
  if (!res.ok) return { error: `http ${res.status}`, repos: [] };
  return { error: null, repos: await res.json() };
}

async function main() {
  const known = knownIds();
  const terms = [];
  const newRelevant = new Map();
  const newIrrelevant = new Map();

  for (const term of TERMS_NEW) {
    const { error, repos } = await search(term);
    if (error) {
      process.stderr.write(`${term}: SEARCH FAILED (${error})\n`);
      terms.push({ term, searched: false, why_not: error, returned: null, new_ids: null, new_relevant: null });
      continue;
    }
    const unseen = repos.filter((r) => !known.has(r.id));
    let relevant = 0;
    for (const r of unseen) {
      const c = looksRoblox(r);
      const row = { id: r.id, downloads: r.downloads ?? 0, likes: r.likes ?? 0, matched_query: term, matched_on: c.matched_on };
      if (c.relevant) { relevant += 1; if (!newRelevant.has(r.id)) newRelevant.set(r.id, row); }
      else if (!newIrrelevant.has(r.id)) newIrrelevant.set(r.id, row);
    }
    process.stderr.write(`${term.padEnd(22)} returned ${String(repos.length).padStart(3)} | new ${String(unseen.length).padStart(3)} | new AND Roblox ${relevant}\n`);
    terms.push({ term, searched: true, returned: repos.length, new_ids: unseen.length, new_relevant: relevant });
  }

  const searched = terms.filter((t) => t.searched);
  const out = {
    generated_at: new Date().toISOString(),
    generator: 'packages/training/src/sweep-hub-coverage.mjs',
    method:
      'Hugging Face dataset search, 100 results per term, against a baseline of every id already in '
      + 'the discovery register or the measured corpus. Every hit not in that baseline is classified '
      + 'as Roblox material or not by its id, author and tags — because widening the net catches '
      + 'more unrelated material, not less.',
    baseline_ids: known.size,
    terms_already_swept: TERMS_ALREADY_SWEPT,
    terms_tried: TERMS_NEW,
    per_term: terms,
    summary: {
      terms_tried: TERMS_NEW.length,
      terms_searched: searched.length,
      terms_failed: terms.length - searched.length,
      new_ids_total: newRelevant.size + newIrrelevant.size,
      new_and_roblox: newRelevant.size,
      new_and_not_roblox: newIrrelevant.size,
    },
    new_and_roblox: [...newRelevant.values()].sort((a, b) => b.downloads - a.downloads),
    new_and_not_roblox_sample: [...newIrrelevant.values()].sort((a, b) => b.downloads - a.downloads).slice(0, 12),
    limits: [
      'This measures the reach of Hugging Face SEARCH, not the contents of the Hub. A dataset whose id, author and tags never say roblox or luau is invisible to it.',
      'Each term is capped at the first 100 results, so a term returning exactly 100 may be truncated.',
      'Relevance is judged from metadata only; no dataset was downloaded or read.',
    ],
  };

  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
  process.stderr.write(`\nwrote ${path.relative(path.resolve(TRAINING, '../..'), OUT)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
