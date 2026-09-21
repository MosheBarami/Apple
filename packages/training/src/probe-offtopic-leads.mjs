#!/usr/bin/env node
/**
 * WHAT IS THE RELEVANCE FILTER HIDING?
 *
 * `docs/github-corpus-licences.md` reports 1,986 licence-clean admit candidates narrowed to 1,063
 * by `isRobloxRelevant` — primary language Lua or Luau, or the owner/name naming roblox/rbx/luau.
 * The other 923 are described there as "irrelevant, licence-clean but off-topic".
 *
 * That word was a judgement about repositories nobody had opened. The filter reads a NAME and a
 * LANGUAGE TAG; a repository written mostly in TypeScript or Rust, named for its product rather
 * than its platform, could hold thousands of Luau files and be filed under "irrelevant" without a
 * single byte being counted. An unopened 923 is not a finding about volume, and the document was
 * carrying it as one.
 *
 *   GH_TOKEN=... node packages/training/src/probe-offtopic-leads.mjs
 *
 * The narrowing here is deliberately generous and is stated rather than hidden: of the 923, take
 * every repository whose TOPICS or DESCRIPTION name roblox/rbx/luau/rojo/wally — the two fields
 * the relevance filter never reads — and read its whole tree. A repository that mentions Roblox
 * nowhere in its name, language, topics or description is not a Roblox repository by any evidence
 * this sweep holds, and is left counted but unopened.
 *
 * Writes runs/offtopic-leads-probed.json. One tree request per candidate. Nothing is acquired and
 * nothing is admitted: the output is a volume measurement that either justifies widening the
 * filter or retires the question.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { summariseTree, isRobloxRelevant } from './read-github-trees.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const IN = resolve(HERE, '..', 'discovery', 'v2', 'github-probed.jsonl');
const OUT = resolve(HERE, '..', 'runs', 'offtopic-leads-probed.json');

/** The two fields `isRobloxRelevant` does not read. Exported so the guard can pin the widening. */
export function namesRobloxOutsideTheFilter(row) {
  const topics = (row.topics || []).join(' ');
  const description = String(row.description ?? '');
  return /roblox|rbx|luau|rojo|wally/i.test(topics) || /roblox|luau|rojo/i.test(description);
}

/* c8 ignore start -- network driver; the pure predicate above is what the guard exercises */
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const TOKEN = process.env.GH_TOKEN;
  if (!TOKEN) { console.error('GH_TOKEN is not set; refusing to start a job that cannot end.'); process.exit(2); }

  const rows = readFileSync(IN, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const admit = rows.filter((r) => r.disposition === 'admit_candidate');
  const offTopic = admit.filter((r) => !isRobloxRelevant(r));
  const candidates = offTopic.filter(namesRobloxOutsideTheFilter);
  if (candidates.length === 0) { console.error('no candidates — this run would measure nothing. Refusing.'); process.exit(3); }
  console.error(`${admit.length} admit candidates, ${offTopic.length} off-topic, ${candidates.length} name Roblox in topics or description`);

  const H = { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'apple-offtopic-probe' };
  const probed = [];
  for (const r of candidates) {
    const path = String(r.source_url).replace(/^https:\/\/github\.com\//, '');
    const res = await fetch(`https://api.github.com/repos/${path}/git/trees/HEAD?recursive=1`, { headers: H });
    if (res.status !== 200) { probed.push({ source_id: r.source_id, tree_status: `http_${res.status}`, luau_lua_file_count: null }); continue; }
    const s = summariseTree(await res.json(), r.api_license_guess);
    probed.push({
      source_id: r.source_id,
      tree_status: 'ok',
      primary_language: r.primary_language ?? null,
      api_license_guess: r.api_license_guess ?? null,
      license_file_name: s.license_file_name,
      luau_lua_file_count: s.luau_lua_file_count,
      luau_lua_bytes: s.luau_lua_bytes,
      tree_truncated: s.tree_truncated,
      matched_on: [(r.topics || []).join(' ').match(/roblox|rbx|luau|rojo|wally/i) ? 'topics' : null,
        String(r.description ?? '').match(/roblox|luau|rojo/i) ? 'description' : null].filter(Boolean),
    });
  }
  probed.sort((a, b) => (b.luau_lua_file_count ?? -1) - (a.luau_lua_file_count ?? -1));
  const ok = probed.filter((p) => p.tree_status === 'ok');
  const files = ok.reduce((n, p) => n + (p.luau_lua_file_count || 0), 0);

  writeFileSync(OUT, `${JSON.stringify({
    generated_at: new Date().toISOString(),
    generator: 'packages/training/src/probe-offtopic-leads.mjs',
    question: 'is the relevance filter excluding a corpus, or a rounding error?',
    admit_candidates: admit.length,
    off_topic_by_the_relevance_filter: offTopic.length,
    of_those_naming_roblox_in_topics_or_description: candidates.length,
    trees_read: ok.length,
    tree_read_failures: probed.length - ok.length,
    luau_lua_files_found: files,
    luau_lua_bytes_found: ok.reduce((n, p) => n + (p.luau_lua_bytes || 0), 0),
    repositories_holding_any_luau: ok.filter((p) => p.luau_lua_file_count > 0).length,
    repositories_holding_luau_with_a_licence_file: ok.filter((p) => p.luau_lua_file_count > 0 && p.license_file_name).length,
    what_this_does_not_establish: [
      'that the 884 repositories naming Roblox nowhere hold no Luau. They were not opened; they are counted and unopened, and this file says so rather than calling them empty.',
      'that these files should be admitted. Volume is the only question asked here; whether tooling written around Roblox belongs in a corpus of Roblox Luau is a scope judgement, not a measurement.',
    ],
    probed,
  }, null, 2)}\n`);
  console.error(`wrote ${OUT}`);
  console.error(`${files} Luau/Lua files across ${ok.filter((p) => p.luau_lua_file_count > 0).length} of ${ok.length} repositories read`);
}
/* c8 ignore stop */
