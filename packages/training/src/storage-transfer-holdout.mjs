#!/usr/bin/env node
/** Fresh storage-outcome transfer probes. Never part of the training or promotion set. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { scoreGameLogic } from './score-eval.mjs';

export const HOLDOUT_SHA256 = '898a4eb9b2dd18033846558575a50f33059a123af637c4e32517b0a9af41c5cd';

export const STORAGE_TRANSFER = [
  {
    id: 'season-medal-read-state',
    prompt: 'Return a standalone Luau function grant(readResult, season, medal). readResult is a plain table with ok (boolean) and value (nil or a table with season and medal). An unsuccessful read must return nil, "retry" so no save can occur. A successful missing value means a new player: return a fresh {season=season, medal=medal}, "save". If the saved season equals season, return nil, "already". Otherwise return the fresh next-season record and "save". Never modify readResult or its value. Inputs season and medal are nonempty strings; invalid shapes return nil, "invalid". This is a pure module; do not use Roblox services.',
    answer: `return function(readResult, season, medal)
    if type(readResult) ~= "table" or getmetatable(readResult) ~= nil or type(readResult.ok) ~= "boolean"
        or type(season) ~= "string" or season == "" or type(medal) ~= "string" or medal == "" then
        return nil, "invalid"
    end
    if not readResult.ok then return nil, "retry" end
    local value = readResult.value
    if value ~= nil then
        if type(value) ~= "table" or getmetatable(value) ~= nil
            or type(value.season) ~= "string" or type(value.medal) ~= "string" then return nil, "invalid" end
        if value.season == season then return nil, "already" end
    end
    return { season = season, medal = medal }, "save"
end`,
    checks: `local failed = {ok=false, value=nil}
local record, action = candidate(failed, "S2", "gold")
assert(record == nil and action == "retry" and failed.value == nil)
record, action = candidate({ok=false, value={season="S1", medal="bronze"}}, "S2", "gold")
assert(record == nil and action == "retry")
local empty = {ok=true, value=nil}
record, action = candidate(empty, "S2", "gold")
assert(action == "save" and record.season == "S2" and record.medal == "gold" and empty.value == nil)
local old = {season="S1", medal="bronze"}
record, action = candidate({ok=true, value=old}, "S2", "silver")
assert(action == "save" and record.season == "S2" and record.medal == "silver" and old.season == "S1" and old.medal == "bronze" and record ~= old)
record, action = candidate({ok=true, value=old}, "S1", "gold")
assert(record == nil and action == "already")
record, action = candidate({ok=true, value={season=1, medal="gold"}}, "S2", "gold")
assert(record == nil and action == "invalid")
record, action = candidate({ok=true, value=nil}, "", "gold")
assert(record == nil and action == "invalid")`,
  },
  {
    id: 'market-reservation-read-state',
    prompt: 'Write a standalone Luau function reserve(readResult, count). readResult is a plain {ok=boolean, value=nil or nonnegative integer stock}. A failed read returns nil, "retry" and must never propose a write. A successful nil is known empty stock and returns nil, "sold_out". A successful numeric stock below count also returns nil, "sold_out". Otherwise return the remaining stock and "save". count must be a positive integer. Reject malformed inputs with nil, "invalid". Keep the module pure and do not call a Roblox service.',
    answer: `local function integer(n)
    return type(n) == "number" and n == n and math.abs(n) < math.huge and n % 1 == 0
end
return function(readResult, count)
    if type(readResult) ~= "table" or getmetatable(readResult) ~= nil or type(readResult.ok) ~= "boolean"
        or not integer(count) or count < 1 then return nil, "invalid" end
    if not readResult.ok then return nil, "retry" end
    local stock = readResult.value
    if stock == nil then return nil, "sold_out" end
    if not integer(stock) or stock < 0 then return nil, "invalid" end
    if stock < count then return nil, "sold_out" end
    return stock - count, "save"
end`,
    checks: `local remaining, action = candidate({ok=false, value=8}, 2)
assert(remaining == nil and action == "retry")
remaining, action = candidate({ok=false, value=nil}, 1)
assert(remaining == nil and action == "retry")
remaining, action = candidate({ok=true, value=nil}, 1)
assert(remaining == nil and action == "sold_out")
remaining, action = candidate({ok=true, value=0}, 1)
assert(remaining == nil and action == "sold_out")
remaining, action = candidate({ok=true, value=2}, 3)
assert(remaining == nil and action == "sold_out")
local input = {ok=true, value=8}
remaining, action = candidate(input, 3)
assert(remaining == 5 and action == "save" and input.value == 8)
remaining, action = candidate({ok=true, value=1}, 1)
assert(remaining == 0 and action == "save")
remaining, action = candidate({ok=true, value=-1}, 1)
assert(remaining == nil and action == "invalid")
remaining, action = candidate({ok=true, value=2}, 0)
assert(remaining == nil and action == "invalid")`,
  },
  {
    id: 'quest-progress-read-state',
    prompt: 'Implement a standalone Luau function advance(readResult, questId). readResult is a plain table: ok is a boolean and value is nil or a plain table mapping quest IDs to integer progress. If ok is false, return nil, "retry"; no replacement table may be offered. If ok is true and value is nil, this is a new profile, so create a table with questId at progress 1 and return it with "save". If a stored table exists, copy it, increment questId (missing means zero), and return the copy with "save". Invalid input or a negative/noninteger current progress returns nil, "invalid". Do not mutate the input and do not use engine services.',
    answer: `local function integer(n)
    return type(n) == "number" and n == n and math.abs(n) < math.huge and n % 1 == 0
end
return function(readResult, questId)
    if type(readResult) ~= "table" or getmetatable(readResult) ~= nil or type(readResult.ok) ~= "boolean"
        or type(questId) ~= "string" or questId == "" then return nil, "invalid" end
    if not readResult.ok then return nil, "retry" end
    local old = readResult.value
    if old ~= nil and (type(old) ~= "table" or getmetatable(old) ~= nil) then return nil, "invalid" end
    local nextValue = {}
    if old then
        for key, value in pairs(old) do
            if type(key) ~= "string" or not integer(value) or value < 0 then return nil, "invalid" end
            nextValue[key] = value
        end
    end
    local current = nextValue[questId] or 0
    if current >= 9007199254740991 then return nil, "invalid" end
    nextValue[questId] = current + 1
    return nextValue, "save"
end`,
    checks: `local nextValue, action = candidate({ok=false, value=nil}, "q1")
assert(nextValue == nil and action == "retry")
local stale = {q1=4}
nextValue, action = candidate({ok=false, value=stale}, "q1")
assert(nextValue == nil and action == "retry" and stale.q1 == 4)
local first = {ok=true, value=nil}
nextValue, action = candidate(first, "q1")
assert(action == "save" and nextValue.q1 == 1 and first.value == nil)
local old = {q1=4, q2=3}
nextValue, action = candidate({ok=true, value=old}, "q1")
assert(action == "save" and nextValue.q1 == 5 and nextValue.q2 == 3 and old.q1 == 4 and nextValue ~= old)
nextValue, action = candidate({ok=true, value=old}, "q3")
assert(action == "save" and nextValue.q3 == 1 and nextValue.q1 == 4 and old.q3 == nil)
nextValue, action = candidate({ok=true, value={q1=-1}}, "q1")
assert(nextValue == nil and action == "invalid")
nextValue, action = candidate({ok=true, value=nil}, "")
assert(nextValue == nil and action == "invalid")`,
  },
];

export function holdoutRows() {
  return STORAGE_TRANSFER.map(({ id, prompt, answer, checks }) => ({
    messages: [
      { role: 'system', content: 'You are Apple, a Roblox engineering assistant. Return one fenced Luau module. Do not claim engine execution.' },
      { role: 'user', content: prompt },
      { role: 'assistant', content: `\`\`\`luau\n${answer}\n\`\`\`` },
    ],
    meta: { id, family: 'storage-transfer', kind: 'game-logic', origin: 'first-party-authored-holdout', rights: 'private-project-source-not-publicly-licensed', checks },
  }));
}

export function scoreTransfer(raw) {
  const got = Object.keys(raw?.rows ?? {});
  const want = STORAGE_TRANSFER.map((x) => x.id);
  if (got.length !== want.length || want.some((id) => !got.includes(id))) throw new Error('holdout row IDs changed');
  const withBest = typeof raw.best_adapter === 'string' && raw.best_adapter.length > 0;
  const references = new Map(holdoutRows().map((x) => [x.meta.id, x]));
  const rows = want.map((id) => {
    const row = raw.rows[id];
    const item = STORAGE_TRANSFER.find((x) => x.id === id);
    const expected = references.get(id);
    if (row.family !== expected.meta.family || row.kind !== expected.meta.kind
        || row.reference?.content !== expected.messages.at(-1).content) throw new Error(`holdout reference changed: ${id}`);
    if (typeof row.base !== 'string' || typeof row.adapter !== 'string'
        || (withBest && typeof row.best !== 'string')) throw new Error(`missing paired answer: ${id}`);
    return { id, base: scoreGameLogic(item, row.base), adapter: scoreGameLogic(item, row.adapter),
      ...(withBest ? { best: scoreGameLogic(item, row.best) } : {}) };
  });
  return { kind: 'diagnostic-storage-transfer-not-promotion', holdoutSha256: HOLDOUT_SHA256,
    adapter: raw.adapter, bestAdapter: withBest ? raw.best_adapter : null,
    base: rows.filter((x) => x.base.ok).length, candidate: rows.filter((x) => x.adapter.ok).length,
    best: withBest ? rows.filter((x) => x.best.ok).length : null,
    n: rows.length, rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2] === '--emit' && process.argv.length === 4) {
    writeFileSync(process.argv[3], holdoutRows().map((x) => JSON.stringify(x)).join('\n') + '\n', { flag: 'wx' });
  } else if (process.argv[2] === '--score' && process.argv.length === 5) {
    const result = scoreTransfer(JSON.parse(readFileSync(process.argv[3], 'utf8')));
    writeFileSync(process.argv[4], JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ base: result.base, best: result.best, candidate: result.candidate, n: result.n }));
  } else throw new Error('usage: storage-transfer-holdout.mjs --emit NEW.jsonl | --score RAW.json NEW-score.json');
}
