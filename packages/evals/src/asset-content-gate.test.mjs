// THE LICENCE GATE ON TYPED PROPERTIES.
//
// WHAT THIS FILE IS. `asset-qc.test.mjs` pins the gate that runs before an asset is fetched and
// `asset-safety.test.mjs` pins what happens after one lands. Both of them are about `insert_asset`.
// This file is about the path that went *around* insert_asset: `create_instances` and
// `set_properties` assign typed properties, and a property like `MeshPart.MeshId`,
// `Decal.Texture`, `Sound.SoundId`, `Animation.AnimationId` or a `Sky` face IS an asset import.
// Before this gate existed, `Paths.setProp` was a bare `(inst)[name] = decode(pv)`, so any id the
// model could type reached a customer's place with no licence classification and no provenance row.
//
// WHY IT EXECUTES THE LUAU. A grep for the right words would pass against a gate that is never
// reached — the exact failure `asset-safety.test.mjs` §6 was written to catch. So §1 and §2 splice
// the real `Paths.luau`, `Serializer.luau` and `Ops.luau` into a stubbed Studio and RUN them: §1
// drives `Paths.setProp` directly, §2 drives the real `Ops.execute` dispatcher, which is the only
// thing that opens a policy at all.
//
// §3 is the backstop that always runs. The interpreter is a local binary and may be absent; the
// structural invariants that make the gate reachable are asserted against the source text so the
// coverage cannot silently vanish with it.
//
// NO NETWORK. The only subprocess is a local Luau interpreter running generated source.
//
// Run: node --test packages/evals/src/asset-content-gate.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const src = (name) => readFileSync(new URL(`../../../apps/plugin/src/${name}`, import.meta.url).pathname, 'utf8');
const pathsSrc = src('Paths.luau');
const opsSrc = src('Ops.luau');
const serializerSrc = src('Serializer.luau');

// ==============================================================================================
// A stubbed Studio: enough DataModel for Paths, Serializer and Ops to run outside Roblox.
// ==============================================================================================

const STUBS = String.raw`
local DATA = {}
local INSTANCE_METHODS

local function newInstance(className)
	local data = { ClassName = className, Name = className, Parent = nil, children = {}, props = {}, attrs = {} }
	local proxy = setmetatable({}, {
		__index = function(t, k)
			local d = DATA[t]
			if k == "ClassName" or k == "Name" or k == "Parent" then return d[k] end
			if INSTANCE_METHODS[k] then return INSTANCE_METHODS[k] end
			return d.props[k]
		end,
		__newindex = function(t, k, v)
			local d = DATA[t]
			if k == "Name" or k == "ClassName" then d[k] = v return end
			if k == "Parent" then
				local old = d.Parent
				if old and DATA[old] then
					for i, c in DATA[old].children do
						if c == t then table.remove(DATA[old].children, i) break end
					end
				end
				d.Parent = v
				if v and DATA[v] then table.insert(DATA[v].children, t) end
				return
			end
			d.props[k] = v
		end,
	})
	DATA[proxy] = data
	return proxy
end

INSTANCE_METHODS = {
	GetChildren = function(self)
		local out = {}
		for _, c in DATA[self].children do table.insert(out, c) end
		return out
	end,
	GetDescendants = function(self)
		local out = {}
		local function walk(node)
			for _, c in DATA[node].children do
				table.insert(out, c)
				walk(c)
			end
		end
		walk(self)
		return out
	end,
	FindFirstChild = function(self, name)
		for _, c in DATA[self].children do
			if DATA[c].Name == name then return c end
		end
		return nil
	end,
	FindFirstChildOfClass = function(self, class)
		for _, c in DATA[self].children do
			if DATA[c].ClassName == class then return c end
		end
		return nil
	end,
	Destroy = function(self) self.Parent = nil end,
	IsA = function(self, class) return DATA[self].ClassName == class end,
	GetAttributes = function(self) return DATA[self].attrs end,
	SetAttribute = function(self, k, v) DATA[self].attrs[k] = v end,
}

-- Services are ordinary stub instances plus whatever methods the plugin actually calls on them.
local SERVICE_METHODS = {
	ChangeHistoryService = {
		TryBeginRecording = function(_, name) return "recording:" .. name end,
		FinishRecording = function() end,
		SetWaypoint = function() end,
	},
	Selection = { Get = function() return {} end, Set = function() end },
	RunService = { IsRunning = function() return false end, Run = function() end, Stop = function() end },
	LogService = { GetLogHistory = function() return {} end },
	ScriptEditorService = { GetEditorSource = function() return "" end, UpdateSourceAsync = function() end },
}

local SERVICES = {}
local game
game = {
	GetService = function(_, name)
		if not SERVICES[name] then
			local svc = newInstance(name)
			svc.Name = name
			DATA[svc].Parent = game
			for k, fn in SERVICE_METHODS[name] or {} do
				DATA[svc].props[k] = fn
			end
			SERVICES[name] = svc
		end
		return SERVICES[name]
	end,
}

local Instance = { new = newInstance }
local Enum = {
	FinishRecordingOperation = { Commit = "Commit", Cancel = "Cancel" },
	MessageType = { MessageOutput = "out", MessageInfo = "info", MessageWarning = "warn", MessageError = "err" },
}
local Vector3 = { new = function(x, y, z) return { X = x, Y = y, Z = z } end }
local Vector2 = { new = function(x, y) return { X = x, Y = y } end }
local CFrame = { new = function(...) return { ... } end, lookAt = function() return {} end }
local Color3 = { new = function(r, g, b) return { R = r, G = g, B = b } end }
local UDim2 = { new = function(...) return { ... } end }
local UDim = { new = function(...) return { ... } end }
local NumberRange = { new = function(a, b) return { Min = a, Max = b } end }
local Rect = { new = function(...) return { ... } end }
local BrickColor = { new = function(s) return { Name = s } end }
local workspace = game:GetService("Workspace")

-- The plugin's modules see this instead of Studio's require.
local script = { Parent = {} }
local function require(m) return m end

--- name<TAB>ok|err<TAB>detail, one line per scenario. Nothing else prints.
local function report(name, fn)
	local ok, res = pcall(fn)
	print(name .. "\t" .. (if ok then "ok" else "err") .. "\t" .. string.gsub(tostring(res), "[\r\n\t]", " "))
end
`;

const MODULES = `
local Paths = (function()
${pathsSrc}
end)()
script.Parent.Paths = Paths

local Serializer = (function()
${serializerSrc}
end)()
script.Parent.Serializer = Serializer

-- Generation is stubbed: this file is about the property path, and Generation.luau's own gate is
-- covered by asset-qc.test.mjs. insertAsset reports success so the session ledger is exercised.
local insertedIds = {}
script.Parent.Generation = {
	insertAsset = function(assetId, parent)
		table.insert(insertedIds, assetId)
		local inst = Instance.new("MeshPart")
		inst.Name = "Inserted" .. tostring(assetId)
		inst.Parent = parent
		return { ok = true, instances = { inst } }
	end,
	generateAndInspect = function() return { generation = { ok = false, error = "not used here" } } end,
	inspect = function() return { ok = true, verdict = "pass", checks = {} } end,
	verdictToText = function() return "" end,
}
script.Parent.Render = { capture = function() return { views = {} } end }

local Ops = (function()
${opsSrc}
end)()
`;

/** A Luau interpreter, probed functionally. Returns null when there is none on this machine. */
function resolveLuau() {
  const candidates = [];
  if (process.env.LUAU_BIN) candidates.push(process.env.LUAU_BIN);
  candidates.push('luau');
  try {
    const base = join(homedir(), '.rokit', 'tool-storage', 'luau-lang', 'luau');
    for (const v of readdirSync(base)) candidates.push(join(base, v, 'luau'));
  } catch {
    /* rokit not installed */
  }
  const dir = mkdtempSync(join(tmpdir(), 'golem-luau-probe-'));
  const probe = join(dir, 'probe.luau');
  writeFileSync(probe, 'print("alive")\n');
  try {
    for (const bin of candidates) {
      const r = spawnSync(bin, [probe], { encoding: 'utf8', timeout: 20_000 });
      if (!r.error && r.status === 0 && /alive/.test(r.stdout ?? '')) return bin;
    }
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const LUAU = resolveLuau();
const noLuau = LUAU
  ? false
  : 'no Luau interpreter found (tried $LUAU_BIN, luau on PATH, rokit tool-storage) — the executable half of this suite did not run';

/**
 * Run scenario Luau against the real plugin modules.
 * @returns {Record<string, {status: 'ok'|'err', detail: string}>}
 */
function runScenarios(scenarioLuau) {
  const dir = mkdtempSync(join(tmpdir(), 'golem-asset-gate-'));
  const file = join(dir, 'scenarios.luau');
  try {
    writeFileSync(file, `${STUBS}\n${MODULES}\n${scenarioLuau}\n`);
    const r = spawnSync(LUAU, [file], { encoding: 'utf8', timeout: 60_000 });
    assert.equal(r.error, undefined, `luau failed to launch: ${r.error?.message}`);
    assert.equal(r.status, 0, `luau exited ${r.status}:\n${r.stdout}\n${r.stderr}`);
    const out = {};
    for (const line of (r.stdout ?? '').split('\n')) {
      if (!line.includes('\t')) continue;
      const [name, status, ...rest] = line.split('\t');
      out[name] = { status, detail: rest.join('\t') };
    }
    return out;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const refused = (r, name) => {
  assert.ok(r[name], `scenario '${name}' did not report`);
  assert.equal(r[name].status, 'err', `'${name}' was ALLOWED; it must be refused. detail: ${r[name].detail}`);
  return r[name].detail;
};
const allowed = (r, name) => {
  assert.ok(r[name], `scenario '${name}' did not report`);
  assert.equal(r[name].status, 'ok', `'${name}' was refused: ${r[name].detail}`);
  return r[name].detail;
};

// ==============================================================================================
// 1. Paths.setProp — the assignment itself
// ==============================================================================================

const SET_PROP_SCENARIOS = String.raw`
local function part(class)
	local i = Instance.new(class or "MeshPart")
	i.Parent = workspace
	return i
end

-- Every scenario states its own policy, because the default is the interesting case.
local function withPolicy(policy, fn)
	Paths.setAssetPolicy(policy)
	local ok, err = pcall(fn)
	Paths.setAssetPolicy(nil)
	if not ok then error(err, 0) end
end

local function set(policy, name, pv, class)
	local inst = part(class)
	withPolicy(policy, function() Paths.setProp(inst, name, pv) end)
	return inst
end

local OPEN = { allow = { [4242] = true }, preexisting = false }
local CLOSED = { allow = {}, preexisting = false }
local RESTORE = { allow = {}, preexisting = true }

report("no_policy_is_closed", function()
	local inst = part()
	Paths.setProp(inst, "MeshId", { t = "Content", v = "rbxassetid://4242" })
end)

report("closed_policy_refuses_content_meshid", function()
	return set(CLOSED, "MeshId", { t = "Content", v = "rbxassetid://4242" })
end)

report("verified_id_is_allowed", function()
	local inst = set(OPEN, "MeshId", { t = "Content", v = "rbxassetid://4242" })
	assert(inst.MeshId == "rbxassetid://4242", "the property was not actually assigned")
end)

report("verified_policy_still_refuses_a_different_id", function()
	return set(OPEN, "MeshId", { t = "Content", v = "rbxassetid://999" })
end)

-- The end-run the Content tag alone would have missed: the engine resolves a plain string too.
report("string_tag_meshid_is_refused", function()
	return set(CLOSED, "MeshId", { t = "string", v = "rbxassetid://4242" })
end)

report("bare_numeric_string_on_texture_is_refused", function()
	return set(CLOSED, "Texture", { t = "string", v = "4242" }, "Decal")
end)

report("bare_number_on_humanoiddescription_is_refused", function()
	return set(CLOSED, "Face", { t = "number", v = 4242 }, "HumanoidDescription")
end)

report("rbxthumb_is_refused", function()
	return set(CLOSED, "Image", { t = "Content", v = "rbxthumb://type=Asset&id=999&w=150&h=150" }, "ImageLabel")
end)

report("rbxthumb_of_a_verified_id_is_allowed", function()
	return set(OPEN, "Image", { t = "Content", v = "rbxthumb://type=Asset&id=4242&w=150&h=150" }, "ImageLabel")
end)

report("rbxgameasset_alias_is_refused_even_when_verified_ids_exist", function()
	return set(OPEN, "MeshId", { t = "Content", v = "rbxgameasset://Models/Tree" })
end)

report("legacy_asset_url_is_refused", function()
	return set(CLOSED, "SoundId", { t = "string", v = "https://www.roblox.com/asset/?id=999" }, "Sound")
end)

report("sky_face_is_refused", function()
	return set(CLOSED, "SkyboxUp", { t = "Content", v = "rbxassetid://999" }, "Sky")
end)

report("animation_id_is_refused", function()
	return set(CLOSED, "AnimationId", { t = "Content", v = "rbxassetid://999" }, "Animation")
end)

-- A Content value on a property the allowlist does not name must still be gated: the tag alone is
-- enough to say "this is an import".
report("content_tag_on_an_unlisted_property_is_refused", function()
	return set(CLOSED, "SomeFuturePropertyId", { t = "Content", v = "rbxassetid://999" })
end)

-- ...and so must a plain string that IS an asset URI, whatever it was assigned to.
report("asset_uri_on_an_ordinary_property_is_refused", function()
	return set(CLOSED, "Text", { t = "string", v = "rbxassetid://999" }, "TextLabel")
end)

report("unreadable_content_shape_is_refused", function()
	return set(CLOSED, "MeshId", { t = "Content", v = "rbxassetid://not-a-number" })
end)

-- Everything below must be untouched by the gate: no policy is set for any of them.
report("clearing_a_content_property_is_allowed", function()
	return Paths.setProp(part(), "MeshId", { t = "Content", v = "" })
end)

report("engine_bundled_rbxasset_is_allowed", function()
	return Paths.setProp(part(), "TextureID", { t = "Content", v = "rbxasset://textures/face.png" })
end)

report("ordinary_string_property_is_allowed", function()
	local inst = part("TextLabel")
	Paths.setProp(inst, "Text", { t = "string", v = "Press E to open the door" })
	assert(inst.Text == "Press E to open the door", "the property was not assigned")
end)

report("a_url_in_prose_is_allowed", function()
	return Paths.setProp(part("TextLabel"), "Text", { t = "string", v = "see https://example.com/id=7 for details" })
end)

report("ordinary_number_property_is_allowed", function()
	local inst = part()
	Paths.setProp(inst, "Transparency", { t = "number", v = 0.5 })
	assert(inst.Transparency == 0.5, "the property was not assigned")
end)

report("vector_property_is_allowed", function()
	local inst = part()
	Paths.setProp(inst, "Size", { t = "Vector3", v = { 4, 1, 2 } })
	assert(inst.Size.X == 4, "the property was not assigned")
end)

-- A rollback re-materialises ids that were ALREADY in this place. Refusing them would strip the
-- user's own meshes, which is destruction dressed up as caution.
report("restore_policy_allows_a_preexisting_id", function()
	local inst = set(RESTORE, "MeshId", { t = "Content", v = "rbxassetid://777777" })
	assert(inst.MeshId == "rbxassetid://777777", "restore must reinstate the id it was given")
end)
`;

test('§1 an unverified asset id cannot be assigned to a Content property', { skip: noLuau }, () => {
  const r = runScenarios(SET_PROP_SCENARIOS);
  refused(r, 'no_policy_is_closed');
  refused(r, 'closed_policy_refuses_content_meshid');
  refused(r, 'verified_policy_still_refuses_a_different_id');
  allowed(r, 'verified_id_is_allowed');
});

test('§1 the gate keys on the property, not on the codec tag — a plain string is the same import', { skip: noLuau }, () => {
  const r = runScenarios(SET_PROP_SCENARIOS);
  refused(r, 'string_tag_meshid_is_refused');
  refused(r, 'bare_numeric_string_on_texture_is_refused');
  refused(r, 'bare_number_on_humanoiddescription_is_refused');
  refused(r, 'legacy_asset_url_is_refused');
});

test('§1 every asset-bearing property family is covered, and unknown shapes fail closed', { skip: noLuau }, () => {
  const r = runScenarios(SET_PROP_SCENARIOS);
  refused(r, 'rbxthumb_is_refused');
  refused(r, 'sky_face_is_refused');
  refused(r, 'animation_id_is_refused');
  refused(r, 'content_tag_on_an_unlisted_property_is_refused');
  refused(r, 'asset_uri_on_an_ordinary_property_is_refused');
  refused(r, 'unreadable_content_shape_is_refused');
  refused(r, 'rbxgameasset_alias_is_refused_even_when_verified_ids_exist');
  allowed(r, 'rbxthumb_of_a_verified_id_is_allowed');
});

test('§1 the op contract for non-asset properties is unchanged', { skip: noLuau }, () => {
  const r = runScenarios(SET_PROP_SCENARIOS);
  allowed(r, 'clearing_a_content_property_is_allowed');
  allowed(r, 'engine_bundled_rbxasset_is_allowed');
  allowed(r, 'ordinary_string_property_is_allowed');
  allowed(r, 'a_url_in_prose_is_allowed');
  allowed(r, 'ordinary_number_property_is_allowed');
  allowed(r, 'vector_property_is_allowed');
  allowed(r, 'restore_policy_allows_a_preexisting_id');
});

test('§1 the refusal tells the agent which tool to use instead', { skip: noLuau }, () => {
  const r = runScenarios(SET_PROP_SCENARIOS);
  const detail = refused(r, 'closed_policy_refuses_content_meshid');
  assert.match(detail, /MeshId/, 'the refusal must name the property that was refused');
  assert.match(detail, /4242/, 'the refusal must name the id that was refused');
  assert.match(detail, /insert_asset/, 'the refusal must name the gated tool');
  // Named singly rather than as an alternation: `search_asset_library` went with the asset
  // catalogue on 2026-09-20, and an alternation that still accepted it would pass on a refusal
  // that sends the model to a tool the registry does not have.
  assert.match(detail, /find_verified_asset/, 'the refusal must say how to obtain a verified id');
  assert.doesNotMatch(detail, /search_asset_library/, 'the refusal names a removed tool');
});

// ==============================================================================================
// 2. Ops.execute — the gate has to be REACHED, not merely to exist
// ==============================================================================================

const OPS_SCENARIOS = String.raw`
local function meshSpec(assetId)
	return {
		className = "MeshPart",
		name = "Rock",
		parent = "game.Workspace",
		props = { MeshId = { t = "Content", v = "rbxassetid://" .. tostring(assetId) } },
	}
end

local function findChild(name)
	return workspace:FindFirstChild(name)
end

report("create_instances_refuses_an_unverified_meshid", function()
	local res = Ops.execute("1", { op = "create_instances", items = { meshSpec(4242) } })
	assert(res.ok, "the op itself should succeed: the instance is created, the property is not")
	assert(res.data.propIssues ~= nil, "propIssues must report the refusal")
	assert(string.find(res.data.propIssues[1], "MeshId", 1, true) ~= nil, "propIssues must name MeshId")
	local rock = findChild("Rock")
	assert(rock ~= nil, "the instance must still be created")
	assert(rock.MeshId == nil, "the MeshId must NOT have been assigned")
	rock.Parent = nil
	return "refused"
end)

report("create_instances_accepts_an_envelope_verified_id", function()
	local res = Ops.execute("2", { op = "create_instances", items = { meshSpec(4242) }, verifiedAssetIds = { 4242 } })
	assert(res.ok, "op failed: " .. tostring(res.error))
	assert(res.data.propIssues == nil, "there should be no propIssues: " .. tostring(res.data.propIssues and res.data.propIssues[1]))
	local rock = findChild("Rock")
	assert(rock.MeshId == "rbxassetid://4242", "the verified id must be assigned")
	rock.Parent = nil
	return "assigned"
end)

-- The envelope is worker-built; the items array is model-authored. A verified list smuggled
-- into the payload must buy nothing.
report("a_verified_list_inside_the_payload_buys_nothing", function()
	local spec = meshSpec(4242)
	spec.verifiedAssetIds = { 4242 }
	spec.props.verifiedAssetIds = { t = "string", v = "4242" }
	local res = Ops.execute("3", { op = "create_instances", items = { spec } })
	assert(res.data.propIssues ~= nil, "a payload-level allowlist must not be honoured")
	local rock = findChild("Rock")
	assert(rock.MeshId == nil, "the MeshId must NOT have been assigned")
	rock.Parent = nil
	return "refused"
end)

report("set_properties_refuses_an_unverified_meshid", function()
	local target = Instance.new("MeshPart")
	target.Name = "Target"
	target.Parent = workspace
	local res = Ops.execute("4", { op = "set_props", path = "game.Workspace.Target", props = { MeshId = { t = "Content", v = "rbxassetid://55" } } })
	assert(res.ok, "the op reports per-property issues rather than failing outright")
	assert(res.data.propIssues ~= nil, "propIssues must report the refusal")
	assert(target.MeshId == nil, "the MeshId must NOT have been assigned")
	target.Parent = nil
	return "refused"
end)

-- An id the session already inserted through the gated path may be named again: the place already
-- contains it, so a MeshId pointing at it grants nothing new.
report("an_id_inserted_through_the_gate_may_then_be_referenced", function()
	local ins = Ops.execute("5", { op = "insert_asset", assetId = 8080, parent = "game.Workspace" })
	assert(ins.ok, "insert_asset failed: " .. tostring(ins.error))
	local target = Instance.new("MeshPart")
	target.Name = "Target2"
	target.Parent = workspace
	local res = Ops.execute("6", { op = "set_props", path = "game.Workspace.Target2", props = { MeshId = { t = "Content", v = "rbxassetid://8080" } } })
	assert(res.data.propIssues == nil, "an inserted id must be referenceable: " .. tostring(res.data.propIssues and res.data.propIssues[1]))
	assert(target.MeshId == "rbxassetid://8080", "the id was not assigned")
	target.Parent = nil
	return "assigned"
end)

report("a_restore_reinstates_the_places_own_mesh_ids", function()
	local snapshot = {
		v = 1,
		scriptCount = 0,
		scripts = {},
		containers = {
			{
				service = "Workspace",
				children = {
					{ class = "MeshPart", name = "OldRock", props = { MeshId = { t = "Content", v = "rbxassetid://31337" } } },
				},
			},
		},
	}
	local res = Ops.execute("7", { op = "restore", root = "game", snapshot = snapshot })
	assert(res.ok, "restore failed: " .. tostring(res.error))
	local rock = findChild("OldRock")
	assert(rock ~= nil, "the snapshot instance was not restored")
	assert(rock.MeshId == "rbxassetid://31337", "a rollback must not strip the user's own MeshId")
	rock.Parent = nil
	return "restored"
end)

-- The policy must not outlive the op that opened it.
report("the_policy_is_closed_again_after_the_op_returns", function()
	Ops.execute("8", { op = "create_instances", items = { meshSpec(4242) }, verifiedAssetIds = { 4242 } })
	local leftover = findChild("Rock")
	if leftover then leftover.Parent = nil end
	local inst = Instance.new("MeshPart")
	inst.Parent = workspace
	Paths.setProp(inst, "MeshId", { t = "Content", v = "rbxassetid://4242" })
end)

-- An op that has no business assigning properties never opens a policy at all.
report("a_non_property_op_opens_no_policy", function()
	Ops.execute("9", { op = "ping" })
	local inst = Instance.new("MeshPart")
	inst.Parent = workspace
	Paths.setProp(inst, "MeshId", { t = "Content", v = "rbxassetid://4242" })
end)
`;

test('§2 the gate is REACHED: create_instances and set_properties refuse unverified ids', { skip: noLuau }, () => {
  const r = runScenarios(OPS_SCENARIOS);
  allowed(r, 'create_instances_refuses_an_unverified_meshid');
  allowed(r, 'set_properties_refuses_an_unverified_meshid');
  allowed(r, 'a_verified_list_inside_the_payload_buys_nothing');
});

test('§2 a verified id still goes through, from the envelope or from the session ledger', { skip: noLuau }, () => {
  const r = runScenarios(OPS_SCENARIOS);
  allowed(r, 'create_instances_accepts_an_envelope_verified_id');
  allowed(r, 'an_id_inserted_through_the_gate_may_then_be_referenced');
});

test('§2 a rollback restores the place as it was, asset ids included', { skip: noLuau }, () => {
  const r = runScenarios(OPS_SCENARIOS);
  allowed(r, 'a_restore_reinstates_the_places_own_mesh_ids');
});

test('§2 the policy does not leak past the op that opened it', { skip: noLuau }, () => {
  const r = runScenarios(OPS_SCENARIOS);
  refused(r, 'the_policy_is_closed_again_after_the_op_returns');
  refused(r, 'a_non_property_op_opens_no_policy');
});

// ==============================================================================================
// 3. Structural invariants — asserted against the source, so they hold with no interpreter
// ==============================================================================================

test('§3 setProp is the only place a property is assigned, and it consults the policy first', () => {
  // One assignment site. If a second appears, the gate is only as good as whoever wrote it.
  const code = pathsSrc.replace(/^\s*--.*$/gm, '');
  assert.equal(code.split(/\[name\]\s*=[^=]/).length - 1, 1, 'a property is assigned in more than one place in Paths.luau');
  assert.match(pathsSrc, /local ids = assetIdsIn\(name, pv, value\)/, 'setProp must classify the value before assigning it');
  assert.match(pathsSrc, /if refusal then error\(refusal\) end/, 'a refusal must abort the assignment');
});

test('§3 the default policy is closed, not open', () => {
  assert.match(pathsSrc, /local assetPolicy: AssetPolicy\? = nil/, 'the module-level policy must start unset');
  // Every allow-decision reads `policy and ...`, so a nil policy can never satisfy one.
  assert.match(pathsSrc, /if not \(policy and policy\.allow\[id\]\) then/, 'a nil policy must not admit an id');
});

test('§3 Ops opens the policy around the handler and closes it unconditionally', () => {
  const exec = opsSrc.slice(opsSrc.indexOf('function Ops.execute'));
  const open = exec.indexOf('Paths.setAssetPolicy(assetPolicyFor(kind, opBody))');
  const call = exec.indexOf('pcall(handler, opBody)');
  const close = exec.indexOf('Paths.setAssetPolicy(nil)');
  assert.ok(open !== -1 && call !== -1 && close !== -1, 'the policy is not opened and closed around the handler');
  assert.ok(open < call, 'the policy must be opened BEFORE the handler runs');
  assert.ok(call < close, 'the policy must be closed AFTER the handler runs');
  // pcall, not a bare call, is what guarantees the close is reached when a handler errors.
  assert.match(exec, /local ok, result = pcall\(handler, opBody\)/, 'the handler must stay wrapped in pcall');
});

test('§3 the verified-id channel is the op envelope, never the model-authored payload', () => {
  assert.match(opsSrc, /if type\(opBody\.verifiedAssetIds\) == "table" then/, 'the allowlist must be read off the envelope');
  const code = opsSrc.replace(/^\s*--.*$/gm, '');
  assert.equal(code.split('verifiedAssetIds').length - 1, 2, 'verifiedAssetIds must be read in exactly one place');
  assert.ok(!/spec\.verifiedAssetIds|props\.verifiedAssetIds|op\.props.*verifiedAssetIds/.test(code), 'the payload must never be a source of verified ids');
  // Only positive integers get in, so a float or a string cannot alias an id.
  assert.match(opsSrc, /if type\(id\) == "number" and id > 0 and id % 1 == 0 then/, 'envelope ids must be validated');
});

test('§3 the session ledger is written only where a gate verdict exists', () => {
  const code = opsSrc.replace(/^\s*--.*$/gm, '');
  const writes = code.split('sessionVerifiedAssets[').length - 1;
  assert.equal(writes, 1, 'the ledger must be written in exactly one place');
  const insert = opsSrc.slice(opsSrc.indexOf('handlers.insert_asset'), opsSrc.indexOf('handlers.generate_model'));
  assert.match(insert, /sessionVerifiedAssets\[op\.assetId\] = true/, 'the ledger must be written by insert_asset');
  assert.ok(
    insert.indexOf('if not res.ok then return') < insert.indexOf('sessionVerifiedAssets[op.assetId] = true'),
    'the ledger must be written only after the insertion succeeded',
  );
});

test('§3 restore is the only op granted the preexisting waiver', () => {
  const code = opsSrc.replace(/^\s*--.*$/gm, '');
  assert.equal(code.split('preexisting = true').length - 1, 1, 'exactly one op may waive the gate');
  assert.match(opsSrc, /if kind == "restore" then\n\t\t--[\s\S]*?return \{ allow = \{\}, preexisting = true \}/, 'only restore may waive the gate');
  assert.match(opsSrc, /local PROPERTY_OPS = \{ create_instances = true, set_props = true \}/, 'the property ops must be named explicitly');
});

test('§3 every content-bearing property family named in the brief is in the allowlist', () => {
  const table = pathsSrc.slice(pathsSrc.indexOf('local ASSET_PROPS'), pathsSrc.indexOf('--- Ids named by a string'));
  for (const prop of [
    'MeshId', 'TextureID', 'TextureId', 'Texture', 'Image', 'SoundId', 'AnimationId',
    'SkyboxBk', 'SkyboxDn', 'SkyboxFt', 'SkyboxLf', 'SkyboxRt', 'SkyboxUp',
    'ShirtTemplate', 'PantsTemplate', 'ColorMap', 'NormalMap',
  ]) {
    assert.match(table, new RegExp(`\\b${prop} = true\\b`), `${prop} is not gated`);
  }
});

// Reported as a skip rather than a failure, because CI unpacks the Luau release but only marks
// `luau-analyze` executable. A skipped line here is the honest signal that §1 and §2 did not run.
test('§3 the executable half of this suite ran against a real interpreter', { skip: noLuau }, () => {
  assert.equal(noLuau, false);
});
