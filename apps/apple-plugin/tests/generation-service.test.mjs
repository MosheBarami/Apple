import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SOURCE = readFileSync(new URL('../src/GenerationService.luau', import.meta.url), 'utf8');

const PRELUDE = String.raw`--!nocheck
local function typeofMock(value)
    if type(value) == "table" and value.__class == true then return "Instance" end
    if type(value) == "table" and value.__type then return value.__type end
    return type(value)
end
typeof = typeofMock

local function vector(x, y, z)
    return { __type = "Vector3", X = x, Y = y, Z = z }
end

local methods = {}
local instanceMt = {
    __index = function(self, key)
        if key == "Parent" then return rawget(self, "__parent") end
        return methods[key] or rawget(self, key)
    end,
    __newindex = function(self, key, value)
        if key == "Parent" then
            local old = rawget(self, "__parent")
            if old and old.__children then
                for index, child in ipairs(old.__children) do
                    if child == self then table.remove(old.__children, index); break end
                end
            end
            rawset(self, "__parent", value)
            if value and value.__children then table.insert(value.__children, self) end
        else
            rawset(self, key, value)
        end
    end,
}

Instance = {}
function Instance.new(className)
    local value = setmetatable({
        __class = true,
        __children = {},
        ClassName = className,
        Name = className,
        Anchored = false,
        Size = vector(1, 1, 1),
        Position = vector(0, 0, 0),
        destroyed = false,
    }, instanceMt)
    return value
end
function methods:IsA(wanted)
    if wanted == "Instance" or wanted == self.ClassName then return true end
    if wanted == "Model" then return self.ClassName == "Model" end
    if wanted == "BasePart" then return self.ClassName == "Part" or self.ClassName == "MeshPart" end
    if wanted == "LuaSourceContainer" then
        return self.ClassName == "Script" or self.ClassName == "LocalScript" or self.ClassName == "ModuleScript"
    end
    return false
end
function methods:GetChildren()
    local result = {}
    for index, child in ipairs(self.__children) do result[index] = child end
    return result
end
function methods:Destroy()
    self.Parent = nil
    self.destroyed = true
    for _, child in ipairs(self:GetChildren()) do child:Destroy() end
end
function methods:GetBoundingBox()
    local parts = {}
    local function visit(node)
        for _, child in ipairs(node:GetChildren()) do
            if child:IsA("BasePart") then table.insert(parts, child) end
            visit(child)
        end
    end
    visit(self)
    if #parts == 0 then error("no parts") end
    local minX, minY, minZ = math.huge, math.huge, math.huge
    local maxX, maxY, maxZ = -math.huge, -math.huge, -math.huge
    for _, part in ipairs(parts) do
        minX = math.min(minX, part.Position.X - part.Size.X / 2)
        minY = math.min(minY, part.Position.Y - part.Size.Y / 2)
        minZ = math.min(minZ, part.Position.Z - part.Size.Z / 2)
        maxX = math.max(maxX, part.Position.X + part.Size.X / 2)
        maxY = math.max(maxY, part.Position.Y + part.Size.Y / 2)
        maxZ = math.max(maxZ, part.Position.Z + part.Size.Z / 2)
    end
    return {}, vector(maxX - minX, maxY - minY, maxZ - minZ)
end

local function modelWithParts(count)
    local model = Instance.new("Model")
    for index = 1, count do
        local part = Instance.new("MeshPart")
        part.Name = "Part" .. tostring(index)
        part.Size = vector(2, 3, 4)
        part.Position = vector((index - 1) * 2, 0, 0)
        part.Parent = model
    end
    return model
end

local function scheduler()
    local state = { now = 0, jobs = {}, waits = 0, onWait = nil }
    function state:spawn(callback)
        local co = coroutine.create(callback)
        table.insert(self.jobs, co)
        local ok, err = coroutine.resume(co)
        if not ok then error(err) end
        return co
    end
    function state:wait(seconds)
        self.waits += 1
        self.now += seconds
        if self.onWait then self.onWait(self.waits) end
    end
    function state:resumeAll()
        for _, co in ipairs(self.jobs) do
            if coroutine.status(co) ~= "dead" then
                local ok, err = coroutine.resume(co)
                if not ok then error(err) end
            end
        end
    end
    return state
end

local passed, failed, failures = 0, 0, {}
local function spec(name, callback)
    local ok, err = pcall(callback)
    if ok then passed += 1 else failed += 1; table.insert(failures, name .. ": " .. tostring(err)) end
end
local function eq(actual, expected, label)
    if actual ~= expected then error((label or "value") .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual), 2) end
end
local function has(text, needle)
    if not string.find(tostring(text), needle, 1, true) then error("expected " .. tostring(text) .. " to contain " .. needle, 2) end
end
local function report()
    print(("generation-service: %d passed%s"):format(passed, if failed > 0 then ", " .. failed .. " FAILED" else ""))
    for _, failure in ipairs(failures) do print(failure) end
    if failed > 0 then error("generation-service specs failed") end
end
`;

const SPECS = String.raw`
local function adapter(service, state, overrides)
    local options = {
        service = service,
        now = function() return state.now end,
        spawn = function(callback) return state:spawn(callback) end,
        wait = function(seconds) return state:wait(seconds) end,
        timeoutSeconds = 1,
        pollSeconds = 0.25,
    }
    for key, value in pairs(overrides or {}) do options[key] = value end
    return Generation.new(options)
end

spec("unavailable capability refuses without an engine call", function()
    local state = scheduler()
    local missing = Generation.new({
        game = { GetService = function() error("missing") end },
        now = function() return state.now end,
        spawn = function(callback) return state:spawn(callback) end,
        wait = function(seconds) return state:wait(seconds) end,
    })
    local probe = missing:probe()
    eq(probe.available, false)
    local result = missing:generate({ op = "generate_model", prompt = "crate", parent = "game.Workspace" }, function() return true end)
    eq(result.ok, false); eq(result.failure, "refused"); has(result.error, "unavailable"); has(result.error, "no substitute")

    local noMethod = adapter({}, state)
    eq(noMethod:probe().available, false)
end)

spec("malformed and unsupported requests fail before provider work", function()
    local state = scheduler()
    local calls = 0
    local service = {}
    function service:GenerateModelAsync() calls += 1; return modelWithParts(1), {} end
    local generation = adapter(service, state)
    for _, request in {
        { op = "wrong_operation", prompt = "crate", parent = "game.Workspace" },
        { op = "generate_model", prompt = "crate" },
        { op = "generate_model", prompt = "crate", parent = 4 },
        { op = "generate_model", prompt = "", parent = "game.Workspace" },
        { op = "generate_model", prompt = "crate", maxTriangles = 0, parent = "game.Workspace" },
        { op = "generate_model", prompt = "crate", maxTriangles = math.huge, parent = "game.Workspace" },
        { op = "generate_model", prompt = "crate", maxTriangles = 20001, parent = "game.Workspace" },
        { op = "generate_model", prompt = "crate", predefinedSchema = "Custom", parent = "game.Workspace" },
        { op = "generate_model", prompt = "crate", Image = "unsupported", parent = "game.Workspace" },
    } do
        local result = generation:generate(request, function() return true end)
        eq(result.ok, false); eq(result.failure, "invalid")
    end
    eq(calls, 0, "invalid requests must not call GenerationService")
end)

spec("provider errors and malformed returns remain failures", function()
    local state = scheduler()
    local throwing = {}
    function throwing:GenerateModelAsync() error("provider boom") end
    local failed = adapter(throwing, state):generate({ op = "generate_model", prompt = "crate", parent = "game.Workspace" }, function() return true end)
    eq(failed.ok, false); eq(failed.failure, "internal"); has(failed.error, "provider boom")

    local wrong = Instance.new("Folder")
    local malformed = {}
    function malformed:GenerateModelAsync() return wrong, {} end
    local malformedResult = adapter(malformed, state):generate({ op = "generate_model", prompt = "crate", parent = "game.Workspace" }, function() return true end)
    eq(malformedResult.ok, false); eq(malformedResult.failure, "internal"); eq(wrong.destroyed, true)
end)

spec("detached structural QC rejects scripts, empty geometry, bad dimensions and caps", function()
    local function runWith(model, overrides, request)
        local state = scheduler()
        local service = {}
        function service:GenerateModelAsync() return model, {} end
        return adapter(service, state, overrides):generate(request or { op = "generate_model", prompt = "crate", maxTriangles = 100, parent = "game.Workspace" }, function() return true end)
    end

    local scripted = modelWithParts(1)
    local scriptObject = Instance.new("Script"); scriptObject.Parent = scripted
    local scripts = runWith(scripted)
    eq(scripts.ok, false); eq(scripts.failure, "invalid"); has(scripts.error, "script"); eq(scripted.destroyed, true)

    local empty = Instance.new("Model")
    local emptyResult = runWith(empty)
    eq(emptyResult.ok, false); has(emptyResult.error, "no BaseParts"); eq(empty.destroyed, true)

    local flat = modelWithParts(1); flat:GetChildren()[1].Size = vector(1, 0, 1)
    local flatResult = runWith(flat)
    eq(flatResult.ok, false); has(flatResult.error, "greater than 0"); eq(flat.destroyed, true)

    local infinite = modelWithParts(1); infinite:GetChildren()[1].Size = vector(1, math.huge, 1)
    local infiniteResult = runWith(infinite)
    eq(infiniteResult.ok, false); has(infiniteResult.error, "finite"); eq(infinite.destroyed, true)

    local many = modelWithParts(3)
    local manyResult = runWith(many, { maxParts = 2 })
    eq(manyResult.ok, false); has(manyResult.error, "2-part"); eq(many.destroyed, true)

    local heavy = modelWithParts(1)
    local heavyResult = runWith(heavy, { readTriangleCount = function() return 101 end })
    eq(heavyResult.ok, false); has(heavyResult.error, "above the requested cap"); eq(heavy.destroyed, true)
end)

spec("successful generation stays detached through QC and preserves documented inputs", function()
    local state = scheduler()
    local staging = Instance.new("Folder")
    local generated = modelWithParts(2)
    generated.Parent = staging
    local observedInputs, observedSchema
    local service = {}
    function service:GenerateModelAsync(inputs, schema)
        observedInputs, observedSchema = inputs, schema
        return generated, { UUID = "generation-123" }
    end
    local result = adapter(service, state, { readTriangleCount = function() return 88 end }):generate({
        op = "generate_model", prompt = "low-poly wooden crate", intent = "crate",
        maxTriangles = 120, predefinedSchema = "Body1", parent = "game.Workspace",
    }, function() return true end)
    eq(result.ok, true, tostring(result.error)); eq(result.model, generated); eq(generated.Parent, nil)
    eq(result.generationId, "generation-123"); eq(result.sessionScoped, true)
    eq(observedInputs.TextPrompt, "low-poly wooden crate"); eq(observedInputs.MaxTriangles, 120); eq(observedInputs.GenerateTextures, true)
    eq(observedSchema.PredefinedSchema, "Body1")
    eq(result.qc.parts, 2); eq(result.qc.triangles, 88); eq(result.qc.trianglesMeasured, true)
    eq(result.qc.verdictScope, "structural_only"); eq(result.qc.visualVerdict, "unreviewed")
    eq(result.qc.visualJudgementRequired, true); eq(result.qc.detached, true)
    for _, part in ipairs(generated:GetChildren()) do eq(part.Anchored, true) end
end)

spec("timeout returns once and destroys the late detached result", function()
    local state = scheduler()
    local staging = Instance.new("Folder")
    local late = modelWithParts(1); late.Parent = staging
    local service = {}
    function service:GenerateModelAsync()
        coroutine.yield("provider")
        return late, { UUID = "late-timeout" }
    end
    local generation = adapter(service, state)
    local result = generation:generate({ op = "generate_model", prompt = "crate", parent = "game.Workspace" }, function() return true end)
    eq(result.ok, false); eq(result.failure, "timeout"); has(result.error, "late result will be destroyed")
    eq(late.destroyed, false, "the engine has not returned the result yet")
    local repeated = generation:generate({ op = "generate_model", prompt = "crate again", parent = "game.Workspace" }, function() return true end)
    eq(repeated.ok, false); eq(repeated.failure, "conflict")
    state:resumeAll()
    eq(late.Parent, nil); eq(late.destroyed, true, "late timeout result must be destroyed")
end)

spec("disconnect retires an in-flight epoch and destroys its late result", function()
    local state = scheduler()
    local live = true
    local late = modelWithParts(1)
    local service = {}
    function service:GenerateModelAsync()
        coroutine.yield("provider")
        return late, { UUID = "late-disconnect" }
    end
    state.onWait = function(count) if count == 1 then live = false end end
    local generation = adapter(service, state)
    local result = generation:generate({ op = "generate_model", prompt = "crate", parent = "game.Workspace" }, function() return live end)
    eq(result.ok, false); eq(result.failure, "refused"); has(result.error, "connection or edit consent ended")
    state:resumeAll()
    eq(late.destroyed, true)
end)

spec("destroy cancels the epoch and cleans a late result", function()
    local state = scheduler()
    local late = modelWithParts(1)
    local service = {}
    function service:GenerateModelAsync()
        coroutine.yield("provider")
        return late, { UUID = "late-destroy" }
    end
    local generation
    state.onWait = function(count) if count == 1 then generation:destroy() end end
    generation = adapter(service, state)
    local result = generation:generate({ op = "generate_model", prompt = "crate", parent = "game.Workspace" }, function() return true end)
    eq(result.ok, false); eq(result.failure, "refused")
    state:resumeAll()
    eq(late.destroyed, true)
    eq(generation:probe().available, false)
end)

report()
`;

function runLuau() {
  const directory = mkdtempSync(join(tmpdir(), 'apple-generation-service-'));
  const file = join(directory, 'generation-service.luau');
  writeFileSync(file, PRELUDE + '\nlocal Generation = (function()\n' + SOURCE + '\nend)()\n' + SPECS);
  try {
    return { status: 0, output: execFileSync('luau', [file], { encoding: 'utf8', stdio: 'pipe' }) };
  } catch (error) {
    return { status: error.status ?? 1, output: String(error.stdout ?? '') + String(error.stderr ?? '') };
  }
}

test('GenerationService adapter enforces detached bounded lifecycle under Luau', () => {
  const result = runLuau();
  assert.match(result.output, /^generation-service: 8 passed$/m, result.output);
  assert.equal(result.status, 0, result.output);
});

test('GenerationService adapter has no asset upload, publication, or HTTP capability', () => {
  assert.doesNotMatch(SOURCE, /\b(?:CreateAssetAsync|SavePlace|PublishAs|RequestAsync|GetAsync|PostAsync|HttpGet|LoadAsset)\s*\(/);
  assert.doesNotMatch(SOURCE, /GetService\s*\(\s*["']AssetService["']\s*\)/);
  assert.equal((SOURCE.match(/GenerateModelAsync\s*\(/g) ?? []).length, 1, 'exactly one provider call site is allowed');
  assert.match(SOURCE, /visualJudgementRequired\s*=\s*true/);
  assert.match(SOURCE, /job\.retired[\s\S]*destroyInstance\(model\)/);
});
