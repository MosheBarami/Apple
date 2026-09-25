#!/usr/bin/env node
/** First-party Luau lessons about the difference between an absent value and a failed read. */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyExample } from './build-game-logic.mjs';
import { loadEvalGuard } from './audit-dataset.mjs';
import { FRONTIER_ITEMS } from './roblox-frontier-tasks.mjs';

const SYSTEM = 'You are Apple, a Roblox engineering assistant. Implement the requested standalone Luau module. Do not claim engine execution, persistence or deployment.';
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const shingles = (text) => {
  const words = String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/);
  return words.length < 8 ? [] : words.slice(0, -7).map((_, i) => words.slice(i, i + 8).join(' '));
};

export const STORAGE_OUTCOME_EXAMPLES = [
  {
    id: 'document-read-outcome', family: 'storage-document-outcome',
    prompt: 'A document cache receives a read callback. Write a standalone Luau function loadDocument(read, starter). The callback may return nil to mean that no document has been created yet, return an existing document, or throw because the service is unavailable. Return document, mayWrite, status. A successful empty result creates starter and may be written; a failed read must never authorize a write.',
    source: `return function(read, starter)
    local ok, stored = pcall(read)
    if not ok then return nil, false, "unavailable" end
    if stored == nil then return starter, true, "new" end
    return stored, true, "existing"
end`,
    checks: `local missing = function() return nil end
local value, writable, status = candidate(missing, {coins = 0})
assert(value.coins == 0 and writable == true and status == "new")
local saved = {coins = 42}
value, writable, status = candidate(function() return saved end, {coins = 0})
assert(value == saved and writable == true and status == "existing")
value, writable, status = candidate(function() error("offline") end, {coins = 0})
assert(value == nil and writable == false and status == "unavailable")`,
    mutation: ['return starter, true, "new"', 'return starter, false, "new"'],
  },
  {
    id: 'cache-refresh-outcome', family: 'storage-cache-refresh',
    prompt: 'Write a standalone Luau function refresh(cache, key, fetch). The cache is a table and fetch returns a value or nil; it may throw. On a successful fetch, return a new cache with the fetched value (or with the key removed when nil), plus true. On a fetch failure, return the original cache unchanged, plus false. Do not mutate the input cache.',
    source: `return function(cache, key, fetch)
    local ok, value = pcall(fetch)
    if not ok then return cache, false end
    local nextCache = {}
    for k, v in pairs(cache) do nextCache[k] = v end
    nextCache[key] = value
    return nextCache, true
end`,
    checks: `local old = {a = 10, b = 20}
local nextCache, ready = candidate(old, "a", function() return nil end)
assert(ready == true and nextCache ~= old and nextCache.a == nil and nextCache.b == 20 and old.a == 10)
nextCache, ready = candidate(old, "a", function() return 77 end)
assert(ready == true and nextCache.a == 77 and old.a == 10)
nextCache, ready = candidate(old, "a", function() error("timeout") end)
assert(ready == false and nextCache == old and old.a == 10)`,
    mutation: ['if not ok then return cache, false end', 'if ok then return cache, false end'],
  },
  {
    id: 'settings-bootstrap-outcome', family: 'storage-settings-bootstrap',
    prompt: 'A settings screen needs a standalone Luau function bootstrap(fetch, defaults). fetch returns an optional settings table and may throw. If it succeeds with nil, copy defaults and return the copy, true, "first-run". If it succeeds with a table, fill only missing keys from defaults and return the merged copy, true, "loaded". On failure, return nil, false, "retry". The supplied tables must not be changed.',
    source: `return function(fetch, defaults)
    local ok, saved = pcall(fetch)
    if not ok then return nil, false, "retry" end
    local result = {}
    for key, value in pairs(defaults) do result[key] = value end
    if saved ~= nil then
        for key, value in pairs(saved) do result[key] = value end
    end
    return result, true, saved == nil and "first-run" or "loaded"
end`,
    checks: `local defaults = {sound = true, music = true}
local first, ok, state = candidate(function() return nil end, defaults)
assert(first ~= defaults and first.sound == true and ok == true and state == "first-run")
local saved = {sound = false}
local loaded; loaded, ok, state = candidate(function() return saved end, defaults)
assert(loaded.sound == false and loaded.music == true and ok == true and state == "loaded")
assert(saved.music == nil and defaults.sound == true)
local failed; failed, ok, state = candidate(function() error("throttled") end, defaults)
assert(failed == nil and ok == false and state == "retry")`,
    mutation: ['return result, true, saved == nil', 'return result, false, saved == nil'],
  },
  {
    id: 'session-write-gate', family: 'storage-session-gate',
    prompt: 'Write a standalone Luau module returning a function open(read). A read callback may return nil, an existing number, or throw. open returns a session with a value and a save(write, nextValue) method. A successful nil read starts at zero and can save. An existing value can save. A failed read creates an unavailable session whose save method returns false without calling write. On a successful save return true.',
    source: `return function(read)
    local ok, previous = pcall(read)
    local session = {value = ok and (previous or 0) or nil}
    function session.save(write, nextValue)
        if not ok then return false end
        local wrote = pcall(write, nextValue)
        if wrote then session.value = nextValue end
        return wrote
    end
    return session
end`,
    checks: `local calls = 0
local write = function(v) calls += 1; assert(v == 15) end
local fresh = candidate(function() return nil end)
assert(fresh.value == 0 and fresh.save(write, 15) == true and fresh.value == 15 and calls == 1)
local existing = candidate(function() return 9 end)
assert(existing.value == 9 and existing.save(write, 15) == true and calls == 2)
local unavailable = candidate(function() error("read failed") end)
assert(unavailable.value == nil and unavailable.save(write, 15) == false and calls == 2)
local brokenWrite = candidate(function() return 4 end)
assert(brokenWrite.save(function() error("write failed") end, 7) == false and brokenWrite.value == 4)`,
    mutation: ['if not ok then return false end', 'if not ok then return true end'],
  },
];

export function buildStorageOutcomeShard(verify = verifyExample) {
  const guard = loadEvalGuard();
  if (guard.parseErrors.length || !guard.shingles.size || guard.taskCount === 0) throw new Error('evaluation guard unavailable');
  const frontierPhrases = new Set(FRONTIER_ITEMS.flatMap((item) => shingles(item.prompt)));
  const seen = new Set();
  return STORAGE_OUTCOME_EXAMPLES.map((example) => {
    if (seen.has(example.id)) throw new Error(`duplicate id: ${example.id}`);
    seen.add(example.id);
    for (const phrase of shingles(example.prompt)) {
      if (guard.shingles.has(phrase) || frontierPhrases.has(phrase)) throw new Error(`${example.id}: prompt overlaps held-out evaluation`);
    }
    for (const phrase of shingles(example.source)) {
      if (guard.shingles.has(phrase)) throw new Error(`${example.id}: answer overlaps held-out evaluation`);
    }
    const evidence = verify(example);
    if (evidence.sourceSha256 !== sha256(example.source) || evidence.checksSha256 !== sha256(example.checks)
      || !evidence.behaviorPassed || !evidence.mutationRejected || evidence.studioVerified !== false) {
      throw new Error(`${example.id}: execution evidence invalid`);
    }
    return {
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: example.prompt },
        { role: 'assistant', content: `\`\`\`luau\n${example.source}\n\`\`\`` },
      ],
      meta: {
        id: example.id, family: example.family,
        origin: 'first-party-authored-synthetic', rights: 'private-project-source-not-publicly-licensed',
        evidence, checks: example.checks,
      },
    };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = process.argv[2];
  if (!output || process.argv.length !== 3) throw new Error('usage: build-storage-outcome-shard.mjs OUTPUT.jsonl');
  const rows = buildStorageOutcomeShard();
  writeFileSync(output, rows.map((row) => JSON.stringify(row)).join('\n') + '\n', { flag: 'wx' });
  console.log(`${rows.length} independently executed rows written to ${output}`);
}
