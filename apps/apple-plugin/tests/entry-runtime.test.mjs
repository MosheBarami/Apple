import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('entry starts offline, requires two permission clicks, and clears access on disconnect', () => {
  const entry = readFileSync(new URL('../src/init.server.luau', import.meta.url), 'utf8');
  const prelude = `
local objects = {}
local function signal()
  local s = { listeners = {} }
  function s:Connect(fn)
    local link = { fn=fn, active=true }
    function link:Disconnect() self.active=false end
    table.insert(self.listeners, link)
    return link
  end
  function s:Fire(...)
    for _, link in self.listeners do if link.active then link.fn(...) end end
  end
  return s
end
local function object(class)
  local o = {ClassName=class, Activated=signal(), Click=signal(), Changed=signal(), propertySignals={}}
  function o:GetPropertyChangedSignal(name)
    if not self.propertySignals[name] then self.propertySignals[name]=signal() end
    return self.propertySignals[name]
  end
  function o:FirePropertyChanged(name)
    local propertySignal=self.propertySignals[name]
    if propertySignal then propertySignal:Fire() end
  end
  function o:SetActive(value) self.active=value end
  table.insert(objects,o)
  return o
end
local Instance = {new=object}
local Enum = {InitialDockState={Right=1}, AutomaticSize={Y=1}, SortOrder={LayoutOrder=1}, Font={SourceSans=1,SourceSansSemibold=2}, TextXAlignment={Left=1},TextYAlignment={Top=1},ApplyStrokeMode={Border=1}}
local UDim = {new=function(...) return {...} end}
local UDim2 = {new=function(...) return {...} end,fromScale=function(...) return {...} end}
local Color3 = {fromRGB=function(...) return {...} end}
local DockWidgetPluginGuiInfo = {new=function(...) return {...} end}
local run = object('RunService')
run.edit=true
function run:IsEdit() return self.edit end
function run:IsRunMode() return not self.edit end
local studioTest = object('StudioTestService')
studioTest.EditModeActive=true
local game = {Name='Isolated fixture',PlaceId=0,GameId=0}
function game:GetService(name)
  if name=='RunService' then return run end
  if name=='Selection' then return {Get=function() return {} end} end
  if name=='StudioTestService' then return studioTest end
  error(name)
end
local plugin = {Unloading=signal()}
function plugin:CreateToolbar(_)
  return {CreateButton=function(...) return object('ToolbarButton') end}
end
function plugin:CreateDockWidgetPluginGuiAsync(...) return object('DockWidget') end
local task = {spawn=function(fn) fn() end}
local bridgeConfig
local bridgeInstance
local editsObserved={}
local commandDestroyed=false
local Bridge = {new=function(config)
  bridgeConfig=config
  local b={connected=false,destroyed=false,claims=0}
  function b:isConnected() return self.connected end
  function b:connect(code)
    assert(code=='ABC123')
    self.claims+=1; self.connected=true; config.onStatus('Connected')
    return true,'Connected'
  end
  function b:disconnect() self.connected=false; config.onStatus('Disconnected') end
  function b:destroy() self.connected=false; self.destroyed=true end
  bridgeInstance=b
  return b
end}
local commandOptions
local Commands = {new=function(options)
  commandOptions=options
  return {execute=function(self,id,op,allow)
    table.insert(editsObserved,allow); return {id=id,ok=true}
  end,destroy=function() commandDestroyed=true end}
end}
local script = {Bridge=Bridge,Commands=Commands}
local function require(value) return value end
`;
  const assertions = `
local function byText(value)
  for _,o in objects do if o.Text==value then return o end end
  error('Missing control '..value)
end
assert(bridgeInstance.claims==0,'must not auto-pair')

-- ONE DEFINITION OF EDIT MODE, HANDED TO THE ENGINE. Given nothing, the command engine falls back
-- to RunService:IsEdit() alone, and this fixture deliberately keeps IsEdit() true while the Studio
-- test service leaves edit mode -- so an engine using the fallback would believe it is in edit mode
-- at the very moment this file is clearing consent because it is not, and would refuse the write by
-- naming a button that refuses too. These assertions fail if the handoff is ever dropped.
assert(type(commandOptions)=='table','the engine must be constructed with options, not with nothing')
assert(type(commandOptions.isEdit)=='function','the engine must be given this entry point definition of edit mode')
assert(commandOptions.isEdit()==true,'edit mode with a live test service reads true')
studioTest.EditModeActive=false
assert(run:IsEdit()==true,'fixture keeps RunService IsEdit true while the test service leaves edit mode')
assert(commandOptions.isEdit()==false,'the engine gate must see a Studio test the same way the consent fence does')
studioTest.EditModeActive=true

bridgeConfig.execute('a',{})
assert(editsObserved[#editsObserved]==false,'starts readonly')
local box
for _,o in objects do if o.Name=='PairingCode' then box=o end end
box.Text='abc123'
byText('Connect to Apple').Activated:Fire()
assert(bridgeInstance.claims==1)
bridgeConfig.execute('b',{})
assert(editsObserved[#editsObserved]==false,'pairing must not grant writes')
byText('Enable edits…').Activated:Fire()
bridgeConfig.execute('c',{})
assert(editsObserved[#editsObserved]==false,'first click only discloses')
byText('Allow edits for this connection').Activated:Fire()
bridgeConfig.execute('d',{})
assert(editsObserved[#editsObserved]==true,'explicit second click grants')

studioTest.EditModeActive=false
assert(run:IsEdit()==true,'fixture keeps RunService IsEdit true while StudioTestService leaves edit mode')
bridgeConfig.execute('e',{})
assert(editsObserved[#editsObserved]==false,'execute fence must reject after StudioTestService leaves edit mode even before a signal')
assert(byText('Enable edits…'),'direct execute fence clears stale access UI')

studioTest.EditModeActive=true
studioTest:FirePropertyChanged('EditModeActive')
byText('Enable edits…').Activated:Fire()
local staleConfirm = byText('Allow edits for this connection')
studioTest.EditModeActive=false
studioTest:FirePropertyChanged('EditModeActive')
studioTest.EditModeActive=true
studioTest:FirePropertyChanged('EditModeActive')
staleConfirm.Activated:Fire()
bridgeConfig.execute('f',{})
assert(editsObserved[#editsObserved]==false,'leaving edit mode during confirmation must retire the first click')
byText('Allow edits for this connection').Activated:Fire()
bridgeConfig.execute('g',{})
assert(editsObserved[#editsObserved]==true,'fresh two-step confirmation can grant after returning to edit mode')

studioTest.EditModeActive=false
studioTest:FirePropertyChanged('EditModeActive')
studioTest.EditModeActive=true
studioTest:FirePropertyChanged('EditModeActive')
bridgeConfig.execute('h',{})
assert(editsObserved[#editsObserved]==false,'permission cleared by test-state signal must stay off after returning to edit mode')

byText('Enable edits…').Activated:Fire()
byText('Allow edits for this connection').Activated:Fire()
byText('Disconnect').Activated:Fire()
bridgeConfig.execute('i',{})
assert(editsObserved[#editsObserved]==false,'disconnect clears permission')
plugin.Unloading:Fire()
assert(bridgeInstance.destroyed and commandDestroyed)
for _,o in objects do
  for _,key in {'Activated','Click','Changed'} do
    for _,link in o[key].listeners do assert(not link.active,'event leak') end
  end
  for _,propertySignal in o.propertySignals do
    for _,link in propertySignal.listeners do assert(not link.active,'property event leak') end
  end
end
print('entry runtime assertions passed')
`;
  const directory = mkdtempSync(join(tmpdir(), 'apple-entry-'));
  const file = join(directory, 'entry.luau');
  writeFileSync(file, prelude + '\n' + entry + '\n' + assertions);
  const output = execFileSync('luau', [file], { encoding: 'utf8' });
  assert.match(output, /entry runtime assertions passed/);

  const unknownServicePrelude = prelude.replace(
    'studioTest.EditModeActive=true',
    "studioTest.EditModeActive='unknown'",
  );
  const unknownServiceFile = join(directory, 'entry-unknown-studio-test-service.luau');
  writeFileSync(unknownServiceFile, `${unknownServicePrelude}\nlocal function runEntry()\n${entry}\nend\nrunEntry()\nassert(bridgeInstance==nil,'present StudioTestService with unknown edit state must fail closed before creating the bridge')\nprint('unknown StudioTestService state failed closed')\n`);
  const unknownServiceOutput = execFileSync('luau', [unknownServiceFile], { encoding: 'utf8' });
  assert.match(unknownServiceOutput, /unknown StudioTestService state failed closed/);

  const fallbackPrelude = prelude.replace("  if name=='StudioTestService' then return studioTest end\n", '');
  const fallbackAssertions = `
local function byText(value)
  for _,o in objects do if o.Text==value then return o end end
  error('Missing control '..value)
end
assert(bridgeInstance~=nil,'missing StudioTestService uses the explicit RunService compatibility fallback')
local box
for _,o in objects do if o.Name=='PairingCode' then box=o end end
box.Text='abc123'
byText('Connect to Apple').Activated:Fire()
byText('Enable edits…').Activated:Fire()
byText('Allow edits for this connection').Activated:Fire()
bridgeConfig.execute('fallback-granted',{})
assert(editsObserved[#editsObserved]==true,'fallback still requires live two-step consent')
run.edit=false
run:FirePropertyChanged('RunState')
run.edit=true
bridgeConfig.execute('fallback-after-runstate',{})
assert(editsObserved[#editsObserved]==false,'fallback RunState transition clears permission and never restores it')
plugin.Unloading:Fire()
print('missing StudioTestService fallback assertions passed')
`;
  const fallbackFile = join(directory, 'entry-no-studio-test-service.luau');
  writeFileSync(fallbackFile, `${fallbackPrelude}\nlocal function runEntry()\n${entry}\nend\nrunEntry()\n${fallbackAssertions}`);
  const fallbackOutput = execFileSync('luau', [fallbackFile], { encoding: 'utf8' });
  assert.match(fallbackOutput, /missing StudioTestService fallback assertions passed/);
});
