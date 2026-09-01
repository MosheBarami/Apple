// Tests for near-duplicate detection — SOURCE-INTELLIGENCE.md §2.
//
// WHAT IS ACTUALLY PINNED HERE. Not "the function returns a number". The DIVERGENCE_THRESHOLD in
// dedupe.mjs is justified by a measured band — comment-only churn at ~0.79, a re-badged fork at
// ~0.38, somebody else's implementation at ~0.04 — and a justification that nothing re-measures is
// a justification that rots. So the fixtures below ARE that measurement: the same shop panel and
// the same five edits, asserted at the values the threshold was chosen against. Change the
// tokeniser or the shingle width and these fail, which is correct — the threshold would need
// re-deriving, not re-asserting.
//
// The one assertion that matters more than the rest: `DIVERGENCE_THRESHOLD` must sit strictly
// inside the empty band between the heaviest re-badged fork and the lightest genuine
// reimplementation. If a change to this module closes that gap, the threshold has stopped
// separating the two things it exists to separate, and the test says so in those terms.
//
// Pure functions, no I/O, no network.
// Run: node --test packages/corpus/src/intake/dedupe.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DIVERGENCE_THRESHOLD,
  SHINGLE_WIDTH,
  cluster,
  fileSimilarity,
  isDivergent,
  normalise,
  recordSimilarity,
  shingles,
  signature,
  similarity,
  tokenise,
  recordDivergent,
} from './dedupe.mjs';

// ---------------------------------------------------------------- fixtures
// A representative small Luau module: services, a config table, comments, two functions. This is
// the shape of thing the Roblox corpus is mostly made of, which is why the threshold was calibrated
// on it rather than on prose or on a 5,000-line framework.

const ORIGINAL = `-- ShopPanel.luau
-- Builds the in-game shop panel and wires the purchase buttons.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Remotes = ReplicatedStorage:WaitForChild("Remotes")
local PurchaseRemote = Remotes:WaitForChild("Purchase")

local ITEMS = {
	{ id = "sword", name = "Sword", price = 100 },
	{ id = "shield", name = "Shield", price = 250 },
	{ id = "boots", name = "Boots", price = 400 },
}

-- Create one row per item. Rows are laid out by a UIListLayout on the parent.
local function makeRow(item, parent)
	local row = Instance.new("Frame")
	row.Name = item.id
	row.Size = UDim2.new(1, 0, 0, 48)
	row.BackgroundTransparency = 0.2
	row.Parent = parent

	local label = Instance.new("TextLabel")
	label.Text = string.format("%s - %d", item.name, item.price)
	label.Size = UDim2.new(0.6, 0, 1, 0)
	label.BackgroundTransparency = 1
	label.Parent = row

	local button = Instance.new("TextButton")
	button.Text = "Buy"
	button.Size = UDim2.new(0.3, 0, 0.8, 0)
	button.Position = UDim2.new(0.65, 0, 0.1, 0)
	button.Parent = row

	button.Activated:Connect(function()
		PurchaseRemote:FireServer(item.id)
	end)

	return row
end

-- Entry point. Called once when the player's GUI is created.
local function build(screenGui)
	local panel = Instance.new("Frame")
	panel.Name = "ShopPanel"
	panel.Size = UDim2.new(0, 320, 0, 400)
	panel.Position = UDim2.new(0.5, -160, 0.5, -200)
	panel.Parent = screenGui

	local layout = Instance.new("UIListLayout")
	layout.Padding = UDim.new(0, 6)
	layout.Parent = panel

	for _, item in ipairs(ITEMS) do
		makeRow(item, panel)
	end

	return panel
end

return { build = build }
`;

/** The fork that changed nothing but the prose. §2's named case. */
const COMMENTS_ONLY = ORIGINAL.replace('-- Builds the in-game shop panel and wires the purchase buttons.', '-- Shop UI. Forked from the original, tidied the docs a little.')
  .replace('-- Create one row per item. Rows are laid out by a UIListLayout on the parent.', '-- Makes a single shop row; the parent frame handles positioning for us.')
  .replace("-- Entry point. Called once when the player's GUI is created.", '-- Main constructor, invoked from the client bootstrap script.');

/** The fork that renamed the locals to look like its own work. Still not a new idea. */
const RENAMED = COMMENTS_ONLY.replace(/\bmakeRow\b/g, 'createItemRow')
  .replace(/\brow\b/g, 'container')
  .replace(/\blabel\b/g, 'nameText')
  .replace(/\bbutton\b/g, 'buyButton')
  .replace(/\bpanel\b/g, 'frame');

/** The fork that added a function. */
const APPENDED = ORIGINAL.replace(
  'return { build = build }',
  `local function destroy(panel)
	if panel then
		panel:Destroy()
	end
end

return { build = build, destroy = destroy }`,
);

/** The simulator fork: same code, retuned numbers. */
const RETUNED = ORIGINAL.replace('price = 100', 'price = 75').replace('price = 250', 'price = 300').replace('price = 400', 'price = 1200');

/** The heaviest thing that is still the same code: renamed, retuned, extended. */
const HEAVY = RENAMED.replace(
  'return { build = build }',
  `local function refresh(frame)
	for _, child in ipairs(frame:GetChildren()) do
		if child:IsA("Frame") then child:Destroy() end
	end
end

return { build = build, refresh = refresh }`,
);

/** Somebody else's shop panel. Same feature, different implementation — a real second example. */
const REIMPLEMENTED = `--!strict
local RS = game:GetService("ReplicatedStorage")
local purchase = RS.Remotes.Purchase

export type Item = { key: string, title: string, cost: number }

local catalogue: { Item } = {
	{ key = "sword", title = "Sword", cost = 100 },
	{ key = "shield", title = "Shield", cost = 250 },
	{ key = "boots", title = "Boots", cost = 400 },
}

local Shop = {}
Shop.__index = Shop

function Shop.new(gui: ScreenGui)
	local self = setmetatable({}, Shop)
	self.root = Instance.new("ScrollingFrame")
	self.root.AnchorPoint = Vector2.new(0.5, 0.5)
	self.root.Parent = gui
	self:render()
	return self
end

function Shop:render()
	for index, entry in catalogue do
		local card = Instance.new("TextButton")
		card.LayoutOrder = index
		card.Text = entry.title .. " (" .. tostring(entry.cost) .. ")"
		card.Parent = self.root
		card.Activated:Connect(function()
			purchase:FireServer(entry.key)
		end)
	end
end

return Shop
`;

/** A different module entirely, from the same repo. The floor. */
const UNRELATED = `-- Leaderstats.luau
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local store = DataStoreService:GetDataStore("Coins")

local function onPlayerAdded(player)
	local stats = Instance.new("Folder")
	stats.Name = "leaderstats"
	stats.Parent = player

	local coins = Instance.new("IntValue")
	coins.Name = "Coins"
	coins.Value = store:GetAsync(player.UserId) or 0
	coins.Parent = stats
end

Players.PlayerAdded:Connect(onPlayerAdded)
`;

// ---------------------------------------------------------------- the three named cases

test('identical input scores exactly 1.0, on both the exact and the sketched path', () => {
  assert.equal(similarity(ORIGINAL, ORIGINAL), 1);
  assert.equal(similarity(signature(ORIGINAL), signature(ORIGINAL)), 1);
  assert.equal(isDivergent(ORIGINAL, ORIGINAL), false);
});

test('a comment-only fork scores high and is NOT divergent — it earns no extra weight', () => {
  const s = similarity(ORIGINAL, COMMENTS_ONLY);
  assert.ok(s > 0.7 && s < 1, `comment-only fork scored ${s}; expected high but below 1 (the churn must stay visible)`);
  assert.equal(isDivergent(ORIGINAL, COMMENTS_ONLY), false);
});

test('a reimplementation scores low and IS divergent — it is a genuine second example', () => {
  const s = similarity(ORIGINAL, REIMPLEMENTED);
  assert.ok(s < 0.1, `reimplementation scored ${s}; expected well under the threshold`);
  assert.equal(isDivergent(ORIGINAL, REIMPLEMENTED), true);
});

// ---------------------------------------------------------------- the measured band

test('the measured band the threshold was derived from still holds', () => {
  const band = {
    identical: similarity(ORIGINAL, ORIGINAL),
    appended: similarity(ORIGINAL, APPENDED),
    retuned: similarity(ORIGINAL, RETUNED),
    commentsOnly: similarity(ORIGINAL, COMMENTS_ONLY),
    renamed: similarity(ORIGINAL, RENAMED),
    heavy: similarity(ORIGINAL, HEAVY),
    reimplemented: similarity(ORIGINAL, REIMPLEMENTED),
    unrelated: similarity(ORIGINAL, UNRELATED),
  };

  // Ordering: every "same code re-badged" edit must outrank every "different implementation" one.
  const rebadged = [band.identical, band.appended, band.retuned, band.commentsOnly, band.renamed, band.heavy];
  const independent = [band.reimplemented, band.unrelated];
  assert.ok(Math.min(...rebadged) > Math.max(...independent), `the band collapsed: re-badged floor ${Math.min(...rebadged)} vs independent ceiling ${Math.max(...independent)} — ${JSON.stringify(band)}`);

  // The values themselves, at the tolerance the threshold's margin can absorb.
  assert.ok(Math.abs(band.appended - 0.938) < 0.05, `appended ${band.appended}`);
  assert.ok(Math.abs(band.retuned - 0.932) < 0.05, `retuned ${band.retuned}`);
  assert.ok(Math.abs(band.commentsOnly - 0.79) < 0.05, `commentsOnly ${band.commentsOnly}`);
  assert.ok(Math.abs(band.renamed - 0.404) < 0.05, `renamed ${band.renamed}`);
  assert.ok(Math.abs(band.heavy - 0.376) < 0.05, `heavy ${band.heavy}`);
  assert.ok(Math.abs(band.reimplemented - 0.038) < 0.03, `reimplemented ${band.reimplemented}`);
  assert.ok(Math.abs(band.unrelated - 0.019) < 0.03, `unrelated ${band.unrelated}`);
});

test('DIVERGENCE_THRESHOLD sits strictly inside the empty band, with real margin on both sides', () => {
  const rebadgedFloor = Math.min(similarity(ORIGINAL, COMMENTS_ONLY), similarity(ORIGINAL, RENAMED), similarity(ORIGINAL, HEAVY), similarity(ORIGINAL, RETUNED));
  const independentCeiling = Math.max(similarity(ORIGINAL, REIMPLEMENTED), similarity(ORIGINAL, UNRELATED), similarity(REIMPLEMENTED, UNRELATED));

  assert.ok(DIVERGENCE_THRESHOLD < rebadgedFloor, `threshold ${DIVERGENCE_THRESHOLD} is at or above the re-badged floor ${rebadgedFloor} — a re-badged fork would be counted as a second example, which §2 forbids`);
  assert.ok(DIVERGENCE_THRESHOLD > independentCeiling, `threshold ${DIVERGENCE_THRESHOLD} is at or below the independent-implementation ceiling ${independentCeiling} — a genuine second example would be collapsed into the first`);
  assert.ok(rebadgedFloor - DIVERGENCE_THRESHOLD > 0.05, `only ${(rebadgedFloor - DIVERGENCE_THRESHOLD).toFixed(3)} of margin below the re-badged floor`);
  assert.ok(DIVERGENCE_THRESHOLD / Math.max(independentCeiling, 1e-6) > 3, 'threshold should sit several times above the independent-implementation ceiling');
});

// ---------------------------------------------------------------- estimator and normalisation

test('the MinHash sketch tracks the exact answer closely enough to threshold against', () => {
  for (const [name, other] of Object.entries({ COMMENTS_ONLY, RENAMED, HEAVY, REIMPLEMENTED, UNRELATED })) {
    const exact = similarity(ORIGINAL, other);
    const sketched = similarity(signature(ORIGINAL), signature(other));
    assert.ok(Math.abs(exact - sketched) < 0.08, `${name}: exact ${exact} vs sketched ${sketched} — beyond the estimator's expected error`);
  }
});

test('signatures are deterministic — a record hashed next year must compare to one hashed today', () => {
  const a = signature(ORIGINAL);
  const b = signature(ORIGINAL);
  assert.deepEqual([...a.mins], [...b.mins]);
  assert.equal(a.size, b.size);
});

test('a mixed string/signature pair still compares', () => {
  const exact = similarity(ORIGINAL, COMMENTS_ONLY);
  const mixed = similarity(ORIGINAL, signature(COMMENTS_ONLY));
  assert.ok(Math.abs(exact - mixed) < 0.08, `mixed pair scored ${mixed} against exact ${exact}`);
});

test('normalisation absorbs line endings and trailing whitespace, exactly as the content hash does', () => {
  const crlf = ORIGINAL.replace(/\n/g, '\r\n');
  const trailing = ORIGINAL.split('\n').map((l) => `${l}   `).join('\n');
  assert.equal(similarity(ORIGINAL, crlf), 1);
  assert.equal(similarity(ORIGINAL, trailing), 1);
  assert.equal(normalise('a\r\nb  \n\n\n'), 'a\nb');
});

test('comments are NOT stripped — a comment-only fork must not score a flat 1.0', () => {
  assert.ok(tokenise('-- hello world\nlocal x = 1').includes('hello'), 'comment words must reach the shingle stream');
  assert.ok(similarity(ORIGINAL, COMMENTS_ONLY) < 1, 'stripping comments would make the churn invisible, which §2 does not want');
});

test('empty and near-empty inputs degrade sensibly rather than dividing by zero', () => {
  assert.equal(similarity('', ''), 1);
  assert.equal(similarity('', ORIGINAL), 0);
  assert.equal(similarity(signature(''), signature('')), 1);
  assert.equal(similarity(signature(''), signature(ORIGINAL)), 0);
  // Shorter than one shingle: still comparable to itself and distinguishable from another.
  assert.equal(similarity('local x', 'local x'), 1);
  assert.equal(similarity('local x', 'local y'), 0);
  assert.equal(shingles('local x').size, 1, `a ${SHINGLE_WIDTH}-token shingle over 2 tokens must collapse to one`);
});

// ---------------------------------------------------------------- clustering

const rec = (contentHash, text, extra = {}) => ({ contentHash, text, weight: 1, observedIn: [], ...extra });

test('a fork family resolves to one representative plus its variants; independents stay separate', () => {
  const groups = cluster([
    rec('h-original', ORIGINAL),
    rec('h-comments', COMMENTS_ONLY),
    rec('h-renamed', RENAMED),
    rec('h-reimpl', REIMPLEMENTED),
    rec('h-unrelated', UNRELATED),
  ]);

  assert.equal(groups.length, 3, `expected the family plus two independents, got ${JSON.stringify(groups.map((g) => g.members))}`);

  const family = groups.find((g) => g.members.length > 1);
  assert.deepEqual(family.members, ['h-comments', 'h-original', 'h-renamed']);
  assert.ok(family.members.includes(family.representative));
  assert.equal(family.variants.length, 2);
  assert.equal(family.basis, 'shingles');
  for (const v of family.variants) assert.ok(typeof v.similarityToRepresentative === 'number');

  // The two genuine second examples are NOT swallowed by the family.
  assert.ok(groups.some((g) => g.members.length === 1 && g.members[0] === 'h-reimpl'));
  assert.ok(groups.some((g) => g.members.length === 1 && g.members[0] === 'h-unrelated'));
});

test('clustering is deterministic — input order must not change the representative', () => {
  const records = [rec('h-original', ORIGINAL), rec('h-comments', COMMENTS_ONLY), rec('h-renamed', RENAMED), rec('h-reimpl', REIMPLEMENTED)];
  const first = cluster(records);
  const reversed = cluster([...records].reverse());
  const rotated = cluster([records[2], records[0], records[3], records[1]]);
  assert.deepEqual(reversed.map((g) => [g.representative, g.members]), first.map((g) => [g.representative, g.members]));
  assert.deepEqual(rotated.map((g) => [g.representative, g.members]), first.map((g) => [g.representative, g.members]));
});

test('one hundred identical forks collapse to one group — the whole point of §2', () => {
  // In production these hundred forks are hundreds of ProvenanceRecords sharing ONE ContentRecord,
  // so this is the belt-and-braces case: even if a normalisation slip gave them distinct hashes,
  // clustering must still resolve them to a single family rather than a hundred examples.
  const records = Array.from({ length: 100 }, (_, i) => rec(`h-fork-${String(i).padStart(3, '0')}`, ORIGINAL));
  records.push(rec('h-reimpl', REIMPLEMENTED));

  const groups = cluster(records);
  assert.equal(groups.length, 2);
  const family = groups.find((g) => g.members.length > 1);
  assert.equal(family.members.length, 100);
  assert.equal(family.variants.length, 99);
  assert.equal(family.representative, 'h-fork-000', 'ties must break on the lowest contentHash, deterministically');
  // Every record still carries weight 1 in its own right; the group is what must not be counted 100×.
  for (const r of records) assert.equal(r.weight, 1);
});

test('nearest-neighbour annotations are ready to copy onto the pinned ContentRecord fields', () => {
  const groups = cluster([rec('h-original', ORIGINAL), rec('h-comments', COMMENTS_ONLY), rec('h-unrelated', UNRELATED)]);
  const family = groups.find((g) => g.members.length > 1);

  const a = family.annotations['h-original'];
  assert.deepEqual(Object.keys(a).sort(), ['divergentFrom', 'similarity']);
  assert.equal(a.divergentFrom, 'h-comments');
  assert.ok(a.similarity > 0.7);

  // A lone record still gets a nearest neighbour — the closest thing in the corpus is a fact even
  // when it is not close.
  const lone = groups.find((g) => g.members[0] === 'h-unrelated');
  assert.equal(lone.annotations['h-unrelated'].divergentFrom, 'h-original');
  assert.ok(lone.annotations['h-unrelated'].similarity < DIVERGENCE_THRESHOLD);
});

test('a single record has no neighbour and says so with null rather than a fabricated 0', () => {
  const [group] = cluster([rec('h-only', ORIGINAL)]);
  assert.deepEqual(group.annotations['h-only'], { divergentFrom: null, similarity: null });
  assert.deepEqual(group.variants, []);
  assert.equal(cluster([]).length, 0);
});

// ---------------------------------------------------------------- the file-hash fallback

test('records without text fall back to file-hash Jaccard, and the basis is reported not assumed', () => {
  const base = { a: 'h1', b: 'h2', c: 'h3', d: 'h4' };
  const plusOne = { ...base, e: 'h5' }; // the fork that adds one file
  const rewritten = { a: 'x1', b: 'x2', c: 'x3', d: 'x4' }; // shares nothing

  assert.ok(Math.abs(fileSimilarity({ fileHashes: base }, { fileHashes: plusOne }) - 4 / 5) < 1e-9);
  assert.equal(fileSimilarity({ fileHashes: base }, { fileHashes: rewritten }), 0);
  assert.equal(fileSimilarity({ fileHashes: base }, { fileHashes: base }), 1);

  const { value, basis } = recordSimilarity({ contentHash: 'a', fileHashes: base }, { contentHash: 'b', fileHashes: plusOne });
  assert.equal(basis, 'files');
  assert.ok(value > DIVERGENCE_THRESHOLD);

  const groups = cluster([
    { contentHash: 'h-base', fileHashes: base },
    { contentHash: 'h-plus', fileHashes: plusOne },
    { contentHash: 'h-other', fileHashes: rewritten },
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups.find((g) => g.members.length > 1).basis, 'files');
});

test('records with neither text nor file hashes are reported as incomparable, not silently merged', () => {
  const { value, basis } = recordSimilarity({ contentHash: 'a' }, { contentHash: 'b' });
  assert.equal(value, null);
  assert.equal(basis, 'none');

  const groups = cluster([{ contentHash: 'a' }, { contentHash: 'b' }]);
  assert.equal(groups.length, 2, 'incomparable records must stay separate rather than being assumed identical');
  assert.equal(groups[0].basis, 'none');
});


//[[ THE SILENT-WRONG-ANSWER BUG, kept as tests.
//
//   `similarity` used to accept anything. A ContentRecord is an object, so `String(record)` gave
//   "[object Object]", which shingles to ONE token, identical for every record. Two records
//   sharing not a single file scored a perfect 1.0, and `isDivergent` therefore answered `false`
//   for every pair of records ever passed to it — reporting every distinct idea as the same idea
//   re-badged, which is the precise inversion of what §2 exists to prevent.
//
//   It never fired in production because nothing called it. The first caller that did was the
//   runner written to close that gap, and it nearly published the wrong answer about two real
//   forks (Sleitnick/RbxCameraShaker vs ddust1n/CameraShaker). ]]

test('similarity REFUSES a ContentRecord rather than stringifying it', () => {
  const a = { contentHash: 'aaa', fileHashes: { 'x.luau': 'h1' } };
  const b = { contentHash: 'bbb', fileHashes: { 'q.luau': 'zzz' } };
  assert.throws(() => similarity(a, b), /must be text or a signature/);
  assert.throws(() => similarity(a, b), /use recordSimilarity/);
});

test('...and so does isDivergent, which used to answer false for everything', () => {
  const a = { contentHash: 'aaa', fileHashes: { 'x.luau': 'h1' } };
  const b = { contentHash: 'bbb', fileHashes: { 'q.luau': 'zzz' } };
  assert.throws(() => isDivergent(a, b), /must be text or a signature/);
});

test('recordDivergent is the record-shaped answer, and reports its basis', () => {
  const shared = { 'a.luau': 'h1', 'b.luau': 'h2', 'c.luau': 'h3', 'd.luau': 'h4' };
  const same = { contentHash: 'x', fileHashes: shared };
  const near = { contentHash: 'y', fileHashes: { ...shared, 'e.luau': 'h5' } };
  const far = { contentHash: 'z', fileHashes: { 'q.luau': 'zz', 'r.luau': 'rr' } };

  const n = recordDivergent(same, near);
  assert.equal(n.basis, 'files');
  assert.equal(n.divergent, false, 'a fork that adds one file of five is the same idea');

  const f = recordDivergent(same, far);
  assert.equal(f.divergent, true, 'records sharing no file are separate examples');
  assert.equal(f.similarity, 0);
});

test('recordDivergent says UNKNOWN rather than guessing when there is no evidence', () => {
  const bare = (h) => ({ contentHash: h, fileHashes: {} });
  const r = recordDivergent(bare('a'), bare('b'));
  assert.equal(r.divergent, null, 'no evidence is not the same as "not divergent"');
  assert.equal(r.basis, 'none');
});
