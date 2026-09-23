/**
 * D-FXLIB-1, EXECUTED: the Fx op family (src/ops/Fx.luau) run as the REAL module inside the REAL
 * command engine against the shared Studio mock.
 *
 * What is asserted is what the family promises: preview_sound plays a library audio id through
 * SoundService:PlayLocalSound, behind the consent gate, and writes nothing into the place; any other
 * sound content is refused; the flipbook and Squash properties an effect preset needs are writable
 * on a ParticleEmitter together with an engine particle texture.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PRELUDE, opFamilySources } from './studio-mock.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const COMMANDS = readFileSync(join(HERE, '..', 'src', 'Commands.luau'), 'utf8');

// Engine surface the Fx family uses and the shared prelude omits: SoundService:PlayLocalSound (it
// records what it was handed) and the two flipbook enums.
const ENGINE = String.raw`
local played = {}
local soundService = game:GetService("SoundService")
rawset(soundService, "PlayLocalSound", function(_, sound) table.insert(played, { id = sound.SoundId, volume = sound.Volume, parent = sound.Parent }) end)
Enum.ParticleFlipbookLayout = { Grid4x4 = "Enum.ParticleFlipbookLayout.Grid4x4", Grid2x2 = "Enum.ParticleFlipbookLayout.Grid2x2" }
Enum.ParticleFlipbookMode = { OneShot = "Enum.ParticleFlipbookMode.OneShot", Loop = "Enum.ParticleFlipbookMode.Loop" }
`;

const SPEC = String.raw`
local c = Commands.new({ game = game, opFamilies = OP_FAMILIES_UNDER_TEST })
local function byOp(report, wanted) for _, item in report.operations do if item.op == wanted then return item end end end
local function count(root) return #root:GetDescendants() end

spec("the fx family installs and preview_sound is reported supported", function()
    eq(#c.opFamilyErrors, 0, "family errors: " .. table.concat(c.opFamilyErrors, " | "))
    local entry = byOp(Commands.capabilities(c), "preview_sound")
    eq(entry ~= nil and entry.status, "supported", "preview_sound")
end)

spec("preview_sound plays a library id locally, behind consent, and writes nothing into the place", function()
    local before, beforeSounds = count(workspace), count(soundService)
    local denied = c:execute("p0", { op = "preview_sound", soundId = "rbxassetid://12222216" }, false)
    eq(denied.ok, false); eq(denied.remedy, "edit_consent"); eq(#played, 0, "a refused preview must not play")
    local r = c:execute("p1", { op = "preview_sound", soundId = "rbxassetid://12222216", volume = 0.4 }, true)
    eq(r.ok, true, tostring(r.error)); eq(r.data.played, true)
    eq(#played, 1); eq(played[1].id, "rbxassetid://12222216"); eq(played[1].volume, 0.4); eq(played[1].parent, nil, "the preview sound is never parented")
    eq(count(workspace), before); eq(count(soundService), beforeSounds)
end)

spec("preview_sound refuses anything that is not an audio id, and a volume out of range", function()
    local already = #played
    for _, bad in { "http://example.com/a.mp3", "rbxasset://sounds/electronicpingshort.wav", "rbxassetid://abc", "rbxassetid://1 ", "12222216", "rbxassetid://123456789012345678901" } do
        local r = c:execute("pb", { op = "preview_sound", soundId = bad }, true)
        eq(r.ok, false, "refused " .. bad); has(r.error, "soundId")
    end
    local loud = c:execute("pv", { op = "preview_sound", soundId = "rbxassetid://5", volume = 2 }, true)
    eq(loud.ok, false); has(loud.error, "volume")
    eq(#played, already, "a refused preview must not play")
end)

spec("an effect preset's flipbook, squash and engine texture are writable on a ParticleEmitter", function()
    local host = Instance.new("Part"); host.Name = "FxHost"; host.Parent = workspace
    local made = c:execute("fx1", { op = "create_instances", items = {
        { className = "ParticleEmitter", name = "Smoke", parent = "game.Workspace.FxHost", props = {
            Texture = { t = "string", v = "rbxasset://textures/particles/smoke_main.dds" },
            FlipbookLayout = { t = "EnumItem", v = "Enum.ParticleFlipbookLayout.Grid4x4" },
            FlipbookMode = { t = "EnumItem", v = "Enum.ParticleFlipbookMode.Loop" },
            FlipbookFramerate = { t = "NumberRange", v = { 12, 16 } },
            FlipbookStartRandom = { t = "bool", v = true },
            Squash = { t = "NumberSequence", v = { { 0, 1, 0 }, { 1, 2, 0 } } },
        } },
    } }, true)
    eq(made.ok, true, tostring(made.error))
    local smoke = host:FindFirstChild("Smoke")
    eq(smoke.Texture, "rbxasset://textures/particles/smoke_main.dds")
    eq(smoke.FlipbookLayout, "Enum.ParticleFlipbookLayout.Grid4x4"); eq(smoke.FlipbookFramerate.Max, 16); eq(smoke.Squash.Keypoints[2].Value, 2)
    local offList = c:execute("fx2", { op = "set_props", path = "game.Workspace.FxHost.Smoke", props = { Texture = { t = "string", v = "rbxasset://textures/face.png" } } }, true)
    eq(offList.ok, false, "a texture off the engine list is refused"); eq(smoke.Texture, "rbxasset://textures/particles/smoke_main.dds")
    host:Destroy()
end)

report()
`;

const available = (() => { try { execFileSync('luau', ['--help'], { stdio: 'pipe' }); return true; } catch { return false; } })();

function runSuite({ commands = COMMANDS, families = {} } = {}) {
  const sources = { ...opFamilySources(), ...families };
  const bodies = Object.values(sources).map((src) => `(function()\n${src}\nend)()`);
  const chunk = `local OP_FAMILIES_UNDER_TEST = {\n${bodies.join(',\n')}\n}\n`;
  const dir = mkdtempSync(join(tmpdir(), 'apple-fx-'));
  const file = join(dir, 'fx.gen.luau');
  writeFileSync(file, `${PRELUDE}\n${ENGINE}\n${chunk}local Commands = (function()\n${commands}\nend)()\n${SPEC}`);
  try { return { status: 0, output: execFileSync('luau', [file], { encoding: 'utf8', stdio: 'pipe' }) }; }
  catch (error) { return { status: error.status ?? 1, output: String(error.stdout ?? '') + String(error.stderr ?? '') }; }
}

const skip = available ? false : 'luau is not on PATH';

test('the Fx op family passes the executable Studio-mock suite', { skip }, () => {
  const result = runSuite();
  assert.match(result.output, /^commands: 4 passed$/m, 'suite did not report a clean run:\n' + result.output);
  assert.equal(result.status, 0, result.output);
});

const BREAKS = [
  { why: 'preview_sound takes the consent gate', family: 'Fx.luau', anchor: 'consentOnly = { preview_sound = true },', with: '' },
  { why: 'preview_sound refuses anything but an audio id', family: 'Fx.luau',
    anchor: 'if scheme ~= "rbxassetid" or digits == nil or #digits > 20 then', with: 'if false then' },
  { why: 'an engine texture must be on the list', commands: true,
    anchor: 'if engineScheme == "rbxasset" and allowed[file] == true then contentText = typed.v end', with: 'contentText = typed.v' },
];

test('each Fx safety mechanism is load-bearing (red-first falsification)', { skip }, () => {
  const families = opFamilySources();
  for (const b of BREAKS) {
    const source = b.family ? families[b.family] : COMMANDS;
    assert.equal(source.split(b.anchor).length - 1, 1, `falsification anchor for "${b.why}" must occur exactly once`);
    const broken = source.replace(b.anchor, b.with);
    const result = runSuite(b.family ? { families: { [b.family]: broken } } : { commands: broken });
    assert.notEqual(result.status, 0, `breaking "${b.why}" left the suite green:\n${result.output}`);
  }
});
