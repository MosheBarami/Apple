/**
 * DUPLICATE-NAMED SIBLINGS: THE AGENT CAN ADDRESS, FIX AND REMOVE THEM.
 *
 * Until this change a path that named two siblings was refused for every write and every delete
 * ("path is ambiguous ... because N siblings are named ..."), and the only reference that told two
 * copies apart (`read-ref:...`, issued by get_tree) was read-only. So an agent that had made copies,
 * or had inserted a library model that repeats a name inside itself, could neither correct nor remove
 * them, and a place full of duplicates could not be emptied at all.
 *
 * The rule under test: a read reference names an INSTANCE, so it is accepted wherever a path is, with
 * the SAME scope checks a path gets (the service it sits under must be the real, writable service;
 * the instance must still be in the place; the reference must be this engine's, and fresh). It never
 * widens what Apple may write to. Same harness as commands.test.mjs: the real Commands.luau plus the
 * Roblox-shaped mock, no source loader.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PRELUDE, opFamiliesChunk } from './studio-mock.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, '..', 'src', 'Commands.luau'), 'utf8');

const SPEC = String.raw`
local function newCommands(options)
    local opts = options or {}
    opts.game = game
    if opts.opFamilies == nil then opts.opFamilies = OP_FAMILIES_UNDER_TEST end
    return Commands.new(opts)
end
local function run(c, id, op, allow) return c:execute(id, op, allow == true) end
-- A folder of N same-named parts, and the references get_tree hands out for them.
local function pack(name, count, className)
    local folder = Instance.new("Folder"); folder.Name = name; folder.Parent = services.Workspace
    local made = {}
    for i = 1, count do
        local part = Instance.new(className or "Part"); part.Name = "Copy"; part.Position = v3(i, 0, 0); part.Parent = folder
        table.insert(made, part)
    end
    return folder, made
end
local function refsOf(c, folder)
    local tree = run(c, "tree-" .. folder.Name, { op = "get_tree", root = "game.Workspace." .. folder.Name }, false)
    eq(tree.ok, true, "tree read")
    local refs = {}
    for _, child in tree.data.root.children do table.insert(refs, child.readRef) end
    return refs, tree
end

spec("get_tree says its references can be written through, so a worker can tell this plugin from an older one", function()
    local folder = pack("RefAdvert", 2)
    local c = newCommands()
    local _, tree = refsOf(c, folder)
    eq(tree.data.refsWritable, true, "get_tree must advertise write-through references")
    local one = run(c, "advert-instance", { op = "get_instance", path = refsOf(c, folder)[1] }, false)
    eq(one.data.refsWritable, true, "get_instance must advertise it too")
    c:destroy(); folder:Destroy()
end)

spec("set_props through a reference changes that instance and no other, and survives reordering", function()
    local folder, parts = pack("RefSet", 3)
    local c = newCommands()
    local refs = refsOf(c, folder)
    parts[2].Parent = nil; parts[2].Parent = folder -- the sibling order changes; identity does not
    local r = run(c, "set-ref", { op = "set_props", path = refs[2], props = { Transparency = { t = "number", v = 0.5 } } }, true)
    eq(r.ok, true, tostring(r.error))
    eq(parts[2].Transparency, 0.5); eq(parts[1].Transparency, 0); eq(parts[3].Transparency, 0)
    c:destroy(); folder:Destroy()
end)

spec("delete_instances through references removes exactly those copies", function()
    local folder, parts = pack("RefDelete", 4)
    local c = newCommands()
    local refs = refsOf(c, folder)
    local r = run(c, "delete-ref", { op = "delete_instances", paths = { refs[2], refs[4] } }, true)
    eq(r.ok, true, tostring(r.error)); eq(r.data.count, 2)
    eq(parts[2].Parent, nil); eq(parts[4].Parent, nil)
    eq(parts[1].Parent, folder); eq(parts[3].Parent, folder)
    -- Two survivors still share a name, and the tree still tells them apart.
    eq(#refsOf(c, folder), 2)
    c:destroy(); folder:Destroy()
end)

spec("a reference to an instance that is gone, expired, foreign or moved out of the place is refused for writes", function()
    local folder, parts = pack("RefScope", 3)
    local c = newCommands()
    local refs = refsOf(c, folder)

    parts[1]:Destroy()
    local gone = run(c, "ref-gone", { op = "delete_instances", paths = { refs[1] } }, true)
    eq(gone.ok, false); eq(gone.failure, "refused"); has(gone.error, "no longer")

    c.readRefs[refs[2]].issued -= 601
    local old = run(c, "ref-old", { op = "set_props", path = refs[2], props = { Transparency = { t = "number", v = 1 } } }, true)
    eq(old.ok, false); eq(old.failure, "not_found"); eq(parts[2].Transparency, 0)

    local other = newCommands()
    local foreign = run(other, "ref-foreign", { op = "delete_instances", paths = { refs[3] } }, true)
    eq(foreign.ok, false); eq(parts[3].Parent, folder, "another engine's reference must not delete anything")
    other:destroy()

    local hidden = Instance.new("Folder"); hidden.Name = "OutsideTheServices"; hidden.Parent = game
    local fresh = refsOf(c, folder)
    parts[3].Parent = hidden
    local moved = run(c, "ref-moved-out", { op = "delete_instances", paths = { fresh[#fresh] } }, true)
    eq(moved.ok, false, "an instance that left the place must not be deletable by a stale reference")
    eq(parts[3].Parent, hidden)
    c:destroy(); folder:Destroy(); hidden:Destroy()
end)

spec("a service-named impostor folder does not pass the write scope check", function()
    local folder, parts = pack("RefImpostor", 2)
    local c = newCommands()
    local refs = refsOf(c, folder)
    local fake = Instance.new("Folder"); fake.Name = "Workspace"; fake.Parent = game
    parts[2].Parent = fake
    local r = run(c, "ref-impostor", { op = "set_props", path = refs[2], props = { Transparency = { t = "number", v = 1 } } }, true)
    eq(r.ok, false); eq(r.failure, "refused"); eq(parts[2].Transparency, 0)
    c:destroy(); folder:Destroy(); fake:Destroy()
end)

spec("writes through a reference still need the consent gate", function()
    local folder, parts = pack("RefConsent", 2)
    local c = newCommands()
    local refs = refsOf(c, folder)
    local r = run(c, "ref-no-consent", { op = "delete_instances", paths = { refs[1] } }, false)
    eq(r.ok, false); has(r.error, "explicit edit consent"); eq(parts[1].Parent, folder)
    c:destroy(); folder:Destroy()
end)

spec("a service can never be removed through a reference-shaped path", function()
    local c = newCommands()
    local r = run(c, "ref-forged", { op = "delete_instances", paths = { "read-ref:00000000-0000-4000-8000-000000000000:1" } }, true)
    eq(r.ok, false)
    local s = run(c, "ref-service", { op = "delete_instances", paths = { "game.Workspace" } }, true)
    eq(s.ok, false); has(s.error, "service")
    c:destroy()
end)

spec("rename through a reference makes a duplicate unique, then the plain path works", function()
    local folder, parts = pack("RefRename", 2)
    local c = newCommands()
    local refs = refsOf(c, folder)
    local r = run(c, "rename-ref", { op = "rename_instance", path = refs[2], name = "Second" }, true)
    eq(r.ok, true, tostring(r.error)); eq(parts[2].Name, "Second"); eq(parts[1].Name, "Copy")
    eq(r.data.path, "game.Workspace.RefRename.Second")
    -- Now unambiguous: the old name resolves to the one left, and both plain paths work.
    eq(run(c, "after-rename", { op = "set_props", path = "game.Workspace.RefRename.Copy", props = { Transparency = { t = "number", v = 0.25 } } }, true).ok, true)
    eq(parts[1].Transparency, 0.25)
    c:destroy(); folder:Destroy()
end)

spec("rename of a copy inside a duplicate-named parent keeps the rename and does not revert it", function()
    local folder = Instance.new("Folder"); folder.Name = "RefRenameDeep"; folder.Parent = services.Workspace
    local models = {}
    for i = 1, 2 do
        local m = Instance.new("Model"); m.Name = "House"; m.Parent = folder
        local p = Instance.new("Part"); p.Name = "Door"; p.Parent = m
        table.insert(models, m)
    end
    local c = newCommands()
    local tree = run(c, "deep", { op = "get_tree", root = "game.Workspace.RefRenameDeep", maxDepth = 3 }, false)
    local doorRef = tree.data.root.children[2].children[1].readRef
    eq(type(doorRef), "string", "a child of a duplicate parent carries a reference")
    local r = run(c, "rename-deep", { op = "rename_instance", path = doorRef, name = "FrontDoor" }, true)
    eq(r.ok, true, tostring(r.error))
    eq(models[2]:FindFirstChild("FrontDoor") ~= nil, true, "the rename must stand")
    eq(type(r.data.path), "string")
    c:destroy(); folder:Destroy()
end)

spec("clone through a reference gives the copy its own name and a usable address", function()
    local folder, parts = pack("RefClone", 2)
    local c = newCommands()
    local refs = refsOf(c, folder)
    local r = run(c, "clone-ref", { op = "clone_instances", paths = { refs[1] } }, true)
    eq(r.ok, true, tostring(r.error)); eq(r.data.count, 1)
    local names = {}
    for _, child in folder:GetChildren() do table.insert(names, child.Name) end
    eq(#names, 3)
    eq(folder:FindFirstChild("Copy (2)") ~= nil, true, "the clone is collision-free")
    eq(r.data.created[1], "game.Workspace.RefClone[\"Copy (2)\"]")
    c:destroy(); folder:Destroy()
end)

spec("a reference works as the parent of a new instance, and the result is addressable when the path is not", function()
    local folder = Instance.new("Folder"); folder.Name = "RefParent"; folder.Parent = services.Workspace
    local a = Instance.new("Model"); a.Name = "Bay"; a.Parent = folder
    local b = Instance.new("Model"); b.Name = "Bay"; b.Parent = folder
    local c = newCommands()
    local tree = run(c, "parent-tree", { op = "get_tree", root = "game.Workspace.RefParent" }, false)
    local ref = tree.data.root.children[2].readRef
    local made = run(c, "create-under-ref", { op = "create_instances", items = {{ className = "Part", name = "Crate", parent = ref }} }, true)
    eq(made.ok, true, tostring(made.error))
    eq(b:FindFirstChild("Crate") ~= nil, true); eq(a:FindFirstChild("Crate"), nil)
    eq(type(made.data.refs), "table", "an ambiguous created path comes with a reference")
    eq(made.data.refs[1].path, "game.Workspace.RefParent.Bay.Crate")
    local back = run(c, "use-created-ref", { op = "set_props", path = made.data.refs[1].ref, props = { Transparency = { t = "number", v = 0.5 } } }, true)
    eq(back.ok, true, tostring(back.error)); eq(b.Crate.Transparency, 0.5)
    c:destroy(); folder:Destroy()
end)

spec("move_instances accepts references for the source and the new parent", function()
    local folder, parts = pack("RefMove", 2)
    local dest = Instance.new("Folder"); dest.Name = "RefMoveDest"; dest.Parent = services.Workspace
    local c = newCommands()
    local refs = refsOf(c, folder)
    local r = run(c, "move-ref", { op = "move_instances", moves = {{ path = refs[2], newParent = "game.Workspace.RefMoveDest" }} }, true)
    eq(r.ok, true, tostring(r.error)); eq(parts[2].Parent, dest); eq(parts[1].Parent, folder)
    c:destroy(); folder:Destroy(); dest:Destroy()
end)

spec("an ambiguous plain path is still refused, and the refusal says how to address one of them", function()
    local folder = pack("RefHint", 2)
    local c = newCommands()
    local r = run(c, "hint", { op = "delete_instances", paths = { "game.Workspace.RefHint.Copy" } }, true)
    eq(r.ok, false); eq(r.failure, "conflict"); has(r.error, "2 siblings"); has(r.error, "readRef")
    c:destroy(); folder:Destroy()
end)

spec("insert_asset never leaves two same-named siblings behind", function()
    services.InsertService = {
        LoadAsset = function(_, _)
            local model = Instance.new("Model")
            local part = Instance.new("Model"); part.Name = "Lamp"; part.Parent = model
            return model
        end,
    }
    local c = newCommands()
    local one = run(c, "insert-1", { op = "insert_asset", assetId = 4242, parent = "game.Workspace" }, true)
    local two = run(c, "insert-2", { op = "insert_asset", assetId = 4242, parent = "game.Workspace" }, true)
    local three = run(c, "insert-3", { op = "insert_asset", assetId = 4242, parent = "game.Workspace" }, true)
    services.InsertService = nil
    eq(one.ok, true); eq(two.ok, true); eq(three.ok, true)
    eq(one.data.inserted[1], "game.Workspace.Lamp")
    eq(two.data.inserted[1], "game.Workspace[\"Lamp (2)\"]")
    eq(three.data.inserted[1], "game.Workspace[\"Lamp (3)\"]")
    -- And every returned path resolves to exactly one instance.
    for _, result in { one, two, three } do
        eq(run(c, "check-" .. result.data.inserted[1], { op = "get_instance", path = result.data.inserted[1] }, false).ok, true)
    end
    eq(type(two.data.renamed), "table", "the result names what was renamed so a claim can quote it")
    for _, name in { "Lamp", "Lamp (2)", "Lamp (3)" } do local m = workspace:FindFirstChild(name); if m then m:Destroy() end end
    c:destroy()
end)

spec("references stay bounded and per-engine after the change", function()
    local folder = pack("RefBound", 2)
    local c = newCommands()
    refsOf(c, folder)
    local n = 0; for _ in c.readRefs do n += 1 end
    eq(n, 2)
    c:destroy(); eq(next(c.readRefs), nil)
    folder:Destroy()
end)

report()
`;

function available() {
  try { execFileSync('luau', ['--help'], { stdio: 'pipe' }); return true; } catch { return false; }
}

function runLuau(source = SOURCE) {
  const dir = mkdtempSync(join(tmpdir(), 'apple-dupnames-'));
  const file = join(dir, 'dup.gen.luau');
  writeFileSync(file, PRELUDE + '\n' + opFamiliesChunk() + 'local Commands = (function()\n' + source + '\nend)()\n' + SPEC);
  try { return { status: 0, output: execFileSync('luau', [file], { encoding: 'utf8', stdio: 'pipe' }) }; }
  catch (error) { return { status: error.status ?? 1, output: String(error.stdout ?? '') + String(error.stderr ?? '') }; }
}

test('duplicate-named siblings can be addressed, fixed and removed through read references', { skip: available() ? false : 'luau is not on PATH' }, () => {
  const result = runLuau();
  assert.match(result.output, /^commands: (\d+) passed$/m, 'suite did not report a clean run:\n' + result.output);
  assert.equal(result.status, 0, result.output);
});

test('the scope check on write-through references is live (red-first falsification)', { skip: available() ? false : 'luau is not on PATH' }, () => {
  // The anchor is the comment that marks the check plus the one condition under it. Switch the condition
  // off and the impostor-folder spec must go red; if it stays green, that spec is not testing the check.
  const anchor = '-- DUP-NAMES: a reference is only as good as the real service it still sits under.\n\t\tif not refRoot or ancestor ~= refRoot then';
  assert.equal(SOURCE.split(anchor).length - 1, 1, 'falsification anchor must occur once');
  const broken = SOURCE.replace(anchor, anchor.replace('if not refRoot or ancestor ~= refRoot then', 'if false then'));
  assert.notEqual(broken, SOURCE, 'the mutation did not land - re-aim it before trusting this test');
  const result = runLuau(broken);
  assert.notEqual(result.status, 0, 'a broken scope check stayed green:\n' + result.output);
});
