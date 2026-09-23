/**
 * THE OP-FAMILY MERGE (src/ops/*.luau -> Commands' one set of allowlists), EXECUTED.
 *
 * Families exist because Commands.luau is at Luau's 200-local limit (-O0, as Studio compiles). The
 * risk a second file brings is a second allowlist authority, so what is asserted here is that a
 * family can only ADD through OP_FAMILIES.install, and that install refuses a family that would
 * override an existing operation, allow a script class, or open a Content property — and that a
 * refused family reports none of its operations, so the worker never offers them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PRELUDE } from './studio-mock.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const COMMANDS = readFileSync(join(HERE, '..', 'src', 'Commands.luau'), 'utf8');

const SPEC = String.raw`
local function family(name, spec) return { name = name, build = function(api) return spec(api) end } end
local good = family("demo", function(api)
    assert(type(api.resolvePath) == "function" and api.createClasses.Part == true, "api is incomplete")
    return {
        handlers = {
            demo_read = function(self, op) return { echoed = op.value } end,
            demo_write = function(self, op) return { wrote = true } end,
        },
        mutating = { demo_write = true, not_mine = true },
        createClasses = { Humanoid = true },
        propertyAllow = { WalkSpeed = true },
        readProperties = { WalkSpeed = true },
    }
end)
local overrides = family("override", function() return { handlers = { get_tree = function() return { hijacked = true } end, override_extra = function() return {} end } } end)
local scriptClass = family("scripts", function() return { handlers = { sneaky_create = function() return {} end }, createClasses = { Script = true } } end)
local content = family("content", function() return { handlers = { sneaky_image = function() return {} end }, propertyAllow = { Image = true } } end)
local broken = family("broken", function() error("boom") end)

local c = Commands.new({ game = game, opFamilies = { good, overrides, scriptClass, content, broken } })
local byOp = {}
for _, item in Commands.capabilities(c).operations do byOp[item.op] = item.status end

spec("an installed family's operations are dispatched and reported supported", function()
    eq(byOp.demo_read, "supported"); eq(byOp.demo_write, "supported")
    local r = c:execute("r", { op = "demo_read", value = 7 }, false)
    eq(r.ok, true); eq(r.data.echoed, 7)
end)

spec("a family write takes both write gates and one undo recording", function()
    local refused = c:execute("w0", { op = "demo_write" }, false)
    eq(refused.ok, false); eq(refused.remedy, "edit_consent")
    local before = #history.log
    local r = c:execute("w1", { op = "demo_write" }, true)
    eq(r.ok, true); has(history.log[before + 1], "begin:Apple demo_write"); eq(history.log[before + 2], "Commit")
end)

spec("a family cannot mark somebody else's operation as a write", function()
    eq(byOp.not_mine, nil)
end)

spec("a family's classes and properties join the one create allowlist", function()
    local r = c:execute("h", { op = "create_instances", items = {{ className = "Humanoid", name = "H", parent = "game.Workspace", props = { WalkSpeed = { t = "number", v = 20 } } }} }, true)
    eq(r.ok, true); eq(workspace:FindFirstChild("H").WalkSpeed, 20)
end)

spec("a family that would override an operation installs nothing at all", function()
    eq(byOp.override_extra, nil)
    local r = c:execute("t", { op = "get_tree", root = "game.Workspace", maxDepth = 1 }, false)
    eq(r.ok, true); eq(r.data.hijacked, nil)
end)

spec("a family cannot open a script class or a Content property", function()
    eq(byOp.sneaky_create, nil); eq(byOp.sneaky_image, nil)
    local r = c:execute("s", { op = "create_instances", items = {{ className = "Script", name = "S", parent = "game.Workspace" }} }, true)
    eq(r.ok, false)
    local img = c:execute("i", { op = "set_props", path = "game.Workspace.H", props = { Image = { t = "string", v = "rbxassetid://1" } } }, true)
    eq(img.ok, false)
end)

spec("every refused family is named with its reason", function()
    local text = table.concat(c.opFamilyErrors, " | ")
    has(text, "override would override operation get_tree")
    has(text, "scripts would allow creating Script")
    has(text, "content would allow property Image")
    has(text, "broken did not build")
    eq(#c.opFamilyErrors, 4)
end)

spec("with no bundled families the engine still starts and reports only its own operations", function()
    eq(byOp.get_tree, "supported")
end)

report()
`;

const available = (() => { try { execFileSync('luau', ['--help'], { stdio: 'pipe' }); return true; } catch { return false; } })();

function runLuau(commands) {
  const dir = mkdtempSync(join(tmpdir(), 'apple-ops-families-'));
  const file = join(dir, 'families.gen.luau');
  writeFileSync(file, `${PRELUDE}\nlocal Commands = (function()\n${commands}\nend)()\n${SPEC}`);
  try { return { status: 0, output: execFileSync('luau', [file], { encoding: 'utf8', stdio: 'pipe' }) }; }
  catch (error) { return { status: error.status ?? 1, output: String(error.stdout ?? '') + String(error.stderr ?? '') }; }
}

test('op families merge through one installer that can only add', { skip: available ? false : 'luau is not on PATH' }, () => {
  const result = runLuau(COMMANDS);
  assert.match(result.output, /^commands: 8 passed$/m, result.output);
  assert.equal(result.status, 0, result.output);
});

test('the override refusal is live (red-first): without it a family hijacks get_tree', { skip: available ? false : 'luau is not on PATH' }, () => {
  const anchor = 'elseif HANDLERS[name] or DEFERRED_MUTATING[name]';
  assert.equal(COMMANDS.split(anchor).length - 1, 1, 'falsification anchor must occur once');
  const broken = COMMANDS.replace(anchor, 'elseif false and HANDLERS[name] or DEFERRED_MUTATING[name]');
  const result = runLuau(broken);
  assert.notEqual(result.status, 0, 'the suite stayed green with the override refusal removed:\n' + result.output);
});

test('the Content-property refusal is live (red-first)', { skip: available ? false : 'luau is not on PATH' }, () => {
  const anchor = 'if CONTENT_PROPERTY[property] or forbiddenProperty[property] then';
  assert.equal(COMMANDS.split(anchor).length - 1, 1, 'falsification anchor must occur once');
  const result = runLuau(COMMANDS.replace(anchor, 'if forbiddenProperty[property] then'));
  assert.notEqual(result.status, 0, 'the suite stayed green with the Content refusal removed:\n' + result.output);
});
