/**
 * THE ADMISSION AND THE PLUGIN, MEASURED AGAINST EACH OTHER RATHER THAN AGAINST A FIXTURE.
 *
 * `apps/worker/src/checkpoint-evidence.ts` decides whether a checkpoint was saved, and names which
 * of its causes refused it. Until this file it had NO test of any kind — `grep -rn checkpointEvidence`
 * over apps/ and packages/ returned its own definition and two call sites in `do/session.ts`, and
 * nothing else. Every other checkpoint test (`checkpoint-identity`, `checkpoint-author`,
 * `checkpoint-description`) hands the session a snapshot object written by hand in the test file,
 * so all three agree with the admission by construction and none of them has ever seen what the
 * plugin actually puts on the wire.
 *
 * `infra/e2e.mjs` does not close that gap either: its simulated Studio answers `snapshot` with
 * `{ v: 1, containers: [], scripts: [], scriptCount: 0, instanceCount: 3 }` — a payload with no
 * `format` field at all, which lands in the legacy branch of the admission and returns `{ ok: true }`
 * without reading a single one of the flags below. So a green E2E run says nothing about
 * checkpointing, and the cause-naming has never run end to end.
 *
 * What this file does instead: it runs the REAL `apps/apple-plugin/src/Commands.luau` under the REAL
 * `luau` binary against the shared Roblox-shaped mock, takes the snapshot payloads the plugin
 * actually returns, and feeds them to the REAL `checkpointEvidence` compiled from TypeScript. Both
 * halves are production source. Nothing here is a fixture except the shape of the mock place.
 *
 * NOT a substitute for a live Studio, and must not be quoted as one. Roblox Studio 0.739 is running
 * on this machine, but it loaded its plugin bytes once at startup (2026-09-19T23:14:58Z) and has been
 * executing that build ever since, so it cannot exercise today's source without a restart the owner
 * has not asked for. This binds the two halves of the source; it does not observe the engine.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PRELUDE } from '../../apple-plugin/tests/studio-mock.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const PLUGIN_SOURCE_PATH = join(WORKER, '..', 'apple-plugin', 'src', 'Commands.luau');

function luauAvailable() {
  try { execFileSync('luau', ['--help'], { stdio: 'pipe' }); return true; } catch { return false; }
}

/**
 * HttpService's array/object rule, modelled — and named as a model, because it is the one thing here
 * that is not production source. Roblox encodes a Luau table with no keys as `[]`, a table whose keys
 * are exactly 1..n as an array, and anything else as an object. The admission already accepts BOTH
 * representations of an empty `skipped` for that reason; this encoder is what lets that claim be
 * measured rather than asserted. Control characters are escaped so a script body with a newline in it
 * cannot break the transport.
 */
const JSON_ENCODER = String.raw`
local function encode(v)
    local t = type(v)
    if v == nil then return "null" end
    if t == "boolean" then return tostring(v) end
    if t == "number" then
        if v ~= v or v == math.huge or v == -math.huge then error("non-finite number") end
        if v == math.floor(v) and math.abs(v) < 2^53 then return string.format("%d", v) end
        return string.format("%.17g", v)
    end
    if t == "string" then
        local out = v:gsub('[%c"\\]', function(ch) return string.format("\\u%04x", string.byte(ch)) end)
        return '"' .. out .. '"'
    end
    if t == "table" then
        local n = 0
        for _ in pairs(v) do n += 1 end
        if n == 0 then return "[]" end
        local isArray = true
        for i = 1, n do if rawget(v, i) == nil then isArray = false; break end end
        if isArray then
            local parts = {}
            for i = 1, n do parts[i] = encode(v[i]) end
            return "[" .. table.concat(parts, ",") .. "]"
        end
        local keys = {}
        for k in pairs(v) do table.insert(keys, tostring(k)) end
        table.sort(keys)
        local parts = {}
        for _, k in ipairs(keys) do table.insert(parts, encode(k) .. ":" .. encode(v[k])) end
        return "{" .. table.concat(parts, ",") .. "}"
    end
    error("cannot encode " .. t)
end
`;

/**
 * Five whole-place snapshots, each shaped to stop the plugin's bounded walk for a DIFFERENT reason.
 * Whole-place on purpose: the admission refuses anything whose `scope` is not `place` long before it
 * reaches the causes under test, so a subtree snapshot could never exercise them.
 */
const SPEC = JSON_ENCODER + String.raw`
local function emit(label, r) print("<<<" .. label .. ">>>" .. encode({ ok = r.ok, failure = r.failure, error = r.error, data = r.data })) end
local function snapshot(label, id)
    local c = Commands.new({ game = game, services = services })
    emit(label, c:execute(label, { op = "snapshot", root = "game", includeScripts = true, checkpointId = id }, false))
    c:destroy()
end

snapshot("healthy", "cp-healthy")

do
    local unsupported = Instance.new("RemoteEvent"); unsupported.Name = "Unsupported"; unsupported.Parent = workspace
    snapshot("unsupported", "cp-unsupported")
    unsupported:Destroy()
end

do
    local chain = workspace
    for i = 1, 20 do local f = Instance.new("Folder"); f.Name = "Deep" .. i; f.Parent = chain; chain = f end
    snapshot("depth", "cp-depth")
    workspace:FindFirstChild("Deep1"):Destroy()
end

-- The object budget (800) and the per-parent child limit (400) are DIFFERENT ceilings and the first
-- draft of this file could not tell them apart: one folder of 900 parts reaches the child limit at
-- 402 nodes, never the object budget, and the guard said so. Four folders of 250 crosses 800 total
-- objects while no single parent is anywhere near its fan-out limit.
do
    local holder = Instance.new("Folder"); holder.Name = "Wide"; holder.Parent = workspace
    for group = 1, 4 do
        local bucket = Instance.new("Folder"); bucket.Name = "Bucket" .. group; bucket.Parent = holder
        for i = 1, 250 do local p = Instance.new("Part"); p.Name = "P" .. i; p.Parent = bucket end
    end
    snapshot("objects", "cp-objects")
    holder:Destroy()
end

do
    local holder = Instance.new("Folder"); holder.Name = "Fanout"; holder.Parent = workspace
    for i = 1, 500 do local p = Instance.new("Part"); p.Name = "P" .. i; p.Parent = holder end
    snapshot("children", "cp-children")
    holder:Destroy()
end

do
    local holder = Instance.new("Folder"); holder.Name = "Scripted"; holder.Parent = workspace
    -- Under the 240,000-character PER-SCRIPT limit, which fails the op outright, and over the
    -- 600,000-character cumulative budget, which is the ceiling being measured. The first draft used
    -- three scripts of 250,000 and the plugin refused the whole operation instead — a different
    -- defect entirely, and the guard said which one.
    for i = 1, 4 do
        local s = Instance.new("ModuleScript"); s.Name = "Big" .. i; s.Source = string.rep("x", 160000); s.Parent = holder
    end
    snapshot("script", "cp-script")
    holder:Destroy()
end

print("SNAPSHOTS-DONE")
`;

/** Runs the real plugin once and returns every labelled payload it produced. */
function pluginSnapshots(source = readFileSync(PLUGIN_SOURCE_PATH, 'utf8')) {
  const dir = mkdtempSync(join(tmpdir(), 'checkpoint-evidence-plugin-'));
  const file = join(dir, 'snapshots.gen.luau');
  writeFileSync(file, PRELUDE + '\nlocal Commands = (function()\n' + source + '\nend)()\n' + SPEC);
  let output;
  try { output = execFileSync('luau', [file], { encoding: 'utf8', stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 }); }
  catch (error) { output = String(error.stdout ?? '') + String(error.stderr ?? ''); }
  // THE INSTRUMENT, CHECKED BEFORE ITS OUTPUT IS READ. A luau chunk that dies halfway prints the
  // payloads it already emitted, and parsing those as a result would report a crash as a finding.
  assert.ok(output.includes('SNAPSHOTS-DONE'), 'the plugin run did not finish:\n' + output.slice(0, 4000));
  const byLabel = new Map();
  for (const match of output.matchAll(/<<<(\w+)>>>(.*)/g)) byLabel.set(match[1], JSON.parse(match[2]));
  return byLabel;
}

/** The production admission, compiled from the TypeScript the worker ships. */
function loadAdmission() {
  const dir = mkdtempSync(join(tmpdir(), 'checkpoint-evidence-bundle-'));
  const out = join(dir, 'checkpoint-evidence.mjs');
  execFileSync(
    join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [join(WORKER, 'src', 'checkpoint-evidence.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${out}`],
    { stdio: 'pipe', cwd: WORKER },
  );
  return import(`file://${out}`);
}

const skip = luauAvailable() ? false : 'luau is not on PATH';

test('the real plugin’s healthy whole-place snapshot is admitted, with the coverage it reported', { skip }, async () => {
  const { checkpointEvidence, checkpointCoverageNote } = await loadAdmission();
  const healthy = pluginSnapshots().get('healthy');
  assert.equal(healthy.ok, true, 'the plugin refused its own default place: ' + healthy.error);
  // Every field the admission reads, present and in the representation the plugin chose. This is the
  // assertion the hand-written fixtures could never make.
  assert.equal(healthy.data.format, 'apple-studio-snapshot-v1');
  assert.equal(healthy.data.scope, 'place');
  assert.equal(healthy.data.root, 'game');
  assert.equal(healthy.data.sourceHashAlgorithm, 'fnv1a32');
  // An empty Luau table reaches the worker as `[]`, not `{}` — the case the admission's comment
  // claims to handle, now measured instead of believed.
  assert.deepEqual(healthy.data.skipped, []);
  const admission = checkpointEvidence(healthy.data, 'cp-healthy');
  assert.deepEqual(admission, { ok: true, coverage: 'supported-subset', preservedObjects: 6 });
  assert.match(checkpointCoverageNote(admission.coverage, admission.preservedObjects), /6 protected engine objects are preserved/);
  // The whole-place tree really carries the services. The sweep that produced an empty `game` was
  // fixed on 2026-09-21 and this is the half of it the worker can see.
  assert.ok(healthy.data.node.children.some((child) => child.name === 'Workspace'), 'whole-place tree omitted Workspace');
});

test('a checkpoint the plugin refused names the cause the plugin actually hit', { skip }, async () => {
  const { checkpointEvidence } = await loadAdmission();
  const snapshots = pluginSnapshots();
  const refusal = (label, id) => {
    const payload = snapshots.get(label);
    assert.equal(payload.ok, true, `${label}: the plugin failed the op instead of reporting a bounded walk: ${payload.error}`);
    const admitted = checkpointEvidence(payload.data, id);
    assert.equal(admitted.ok, false, `${label} was admitted as a saveable checkpoint`);
    return { payload: payload.data, error: admitted.error };
  };

  // CAUSE 1 — objects this version cannot serialise. The class is named because "some object" is
  // not something a fifteen-year-old can act on.
  const unsupported = refusal('unsupported', 'cp-unsupported');
  assert.equal(unsupported.payload.truncated, false);
  assert.equal(unsupported.payload.restorable, false);
  assert.match(unsupported.error, /RemoteEvent x1/);

  // CAUSE 2 — the walk stopped because the place is NESTED too deeply, which is a different place and
  // a different remedy from a place that is too big. The plugin stops at MAX_SNAPSHOT_DEPTH after
  // thirteen objects; calling that "too large" is false on its face, and tells the owner to delete
  // things when what fixes it is flattening the deepest folders.
  const depth = refusal('depth', 'cp-depth');
  assert.equal(depth.payload.truncated, true);
  assert.ok(depth.payload.nodeCount < 100, `expected a depth stop, not a size stop: nodeCount=${depth.payload.nodeCount}`);
  assert.match(depth.error, /nests|deep/i, 'a depth-bounded walk must not be reported as a large project');
  assert.doesNotMatch(depth.error, /too large|more objects than/i);

  // CAUSE 3 — genuinely more objects than one checkpoint carries. Same field, opposite sentence.
  const objects = refusal('objects', 'cp-objects');
  assert.equal(objects.payload.truncated, true);
  assert.ok(objects.payload.nodeCount >= 800, `expected the object ceiling: nodeCount=${objects.payload.nodeCount}`);
  assert.match(objects.error, /more objects than/i);
  assert.doesNotMatch(objects.error, /nests|deep/i);

  // CAUSE 4 — one parent with too many children. Reached at 402 objects, so "too large" would be
  // as false here as it is for depth, and the remedy is to group them rather than delete them.
  const children = refusal('children', 'cp-children');
  assert.equal(children.payload.truncated, true);
  assert.ok(children.payload.nodeCount < 800, `expected the fan-out ceiling: nodeCount=${children.payload.nodeCount}`);
  assert.match(children.error, /children/i);

  // CAUSE 5 — script bytes, which is none of the above and has its own remedy.
  const script = refusal('script', 'cp-script');
  assert.equal(script.payload.truncated, true);
  assert.match(script.error, /script/i);

  // THE POINT OF THE WHOLE MECHANISM: five stops, five different sentences. One shared sentence is
  // what the owner was given on 2026-09-20 and it is what this test exists to keep from coming back.
  const sentences = new Set([unsupported.error, depth.error, objects.error, children.error, script.error]);
  assert.equal(sentences.size, 5, 'two refusals share one sentence:\n' + [...sentences].join('\n'));
});

test('an old plugin that does not say why it stopped is not given a cause it never reported', { skip }, async () => {
  const { checkpointEvidence } = await loadAdmission();
  const depth = pluginSnapshots().get('depth').data;
  // Every plugin already installed predates `truncatedBy`. Dropping the field is exactly what those
  // builds put on the wire, and the admission must fall back to a sentence that claims neither cause
  // rather than inventing one. `__proto__` is here because `truncatedBy` is an untrusted client
  // string: a plain object lookup would have resolved it off Object.prototype.
  for (const absent of [undefined, null, '', 'nonsense', '__proto__', 'constructor', 'toString']) {
    const payload = { ...depth, truncatedBy: absent };
    if (absent === undefined) delete payload.truncatedBy;
    const error = checkpointEvidence(payload, 'cp-depth').error;
    assert.equal(typeof error, 'string', `truncatedBy=${String(absent)} produced ${typeof error}`);
    assert.match(error, /larger or deeper/, `truncatedBy=${String(absent)} was given a cause the plugin never reported: ${error}`);
  }
});

test('the cause-naming is falsifiable: collapsing the plugin’s reasons turns the guard red', { skip }, async () => {
  const source = readFileSync(PLUGIN_SOURCE_PATH, 'utf8');
  // Aimed at the property, not at a spelling: make the depth ceiling report itself as the object
  // ceiling. If the two causes are genuinely distinguished end to end, the admission's sentence for
  // the depth place must change; if this stays green the plugin's reason is not reaching the worker.
  const anchor = 'if depth > MAX_SNAPSHOT_DEPTH then truncate(state, "depth"); return nil end';
  assert.ok(source.includes(anchor), 'falsification anchor is stale — re-aim it before trusting this test');
  const broken = source.replace(anchor, anchor.replace('"depth"', '"objects"'));
  assert.notEqual(broken, source, 'the mutation did not land');
  const { checkpointEvidence } = await loadAdmission();
  const mutated = pluginSnapshots(broken).get('depth');
  assert.match(checkpointEvidence(mutated.data, 'cp-depth').error, /more objects than/i,
    'the mutation did not change what the owner is told, so the plugin’s reason is not being read');
});
