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
run.running=false
function run:IsRunning() return self.running end
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
  b.answers={}
  function b:answerAssetSources(allow) if not self.connected then return false end table.insert(self.answers, allow); return true end
  bridgeInstance=b
  return b
end}
local commandOptions
local Commands = {new=function(options)
  commandOptions=options
  return {execute=function(self,id,op,allow)
    table.insert(editsObserved,allow)
    if type(op)=='table' and op.op=='run_mode' and (op.action=='start' or op.action=='run' or op.action=='restart') then
      studioTest.EditModeActive=false; studioTest:FirePropertyChanged('EditModeActive')
      return {id=id,ok=true,data={runMode=true,running=true}}
    elseif type(op)=='table' and op.op=='play_check' then
      -- ExecutePlayModeAsync yields for the whole solo Test session: Studio leaves edit mode and
      -- returns to it before the call returns, and both transitions are signalled.
      if allow then
        studioTest.EditModeActive=false; studioTest:FirePropertyChanged('EditModeActive')
        studioTest.EditModeActive=true; studioTest:FirePropertyChanged('EditModeActive')
      end
      return {id=id,ok=allow==true,data={completed=true}}
    elseif type(op)=='table' and op.op=='run_mode' and op.action=='stop' then
      studioTest.EditModeActive=true; studioTest:FirePropertyChanged('EditModeActive')
      return {id=id,ok=true,data={runMode=false,running=false,stopped=true}}
    end
    return {id=id,ok=true}
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
-- F-026: the token is never saved, so a Studio restart ends the pairing. The dock says so up front,
-- instead of leaving the customer to discover it from a bare "Not connected".
local offlineNotice = nil
for _,o in objects do if type(o.Text)=='string' and string.find(o.Text,'Not connected',1,true) then offlineNotice = o.Text end end
assert(offlineNotice and string.find(offlineNotice,'Studio closes',1,true) and string.find(offlineNotice,'new code',1,true),'the offline dock must say a restart needs a new code: '..tostring(offlineNotice))

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
-- 2026-09-22, run 604bfd32: under a RunService:Run() simulation IsEdit() AND EditModeActive both stay
-- true, and Apple's writes were admitted while its own playtest ran. Running is what says otherwise.
run.running=true
assert(run:IsEdit()==true and studioTest.EditModeActive==true,'fixture models a Run() simulation as real Studio reports it')
assert(commandOptions.isEdit()==false,'a running simulation is not edit mode')
run.running=false

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
-- D-PLUGIN-2, 2026-09-23: leaving edit mode PAUSES the consent given for this connection instead of revoking
-- it (writes are refused outside edit mode regardless); the panel says so, and edit mode resumes it.
assert(byText('Access: edits paused while Studio is testing'),'outside edit mode the panel says edits are paused')

studioTest.EditModeActive=true
studioTest:FirePropertyChanged('EditModeActive')
bridgeConfig.execute('e2',{})
assert(editsObserved[#editsObserved]==true,'returning to edit mode resumes the consent given for this connection')
byText('Turn edits off').Activated:Fire()
bridgeConfig.execute('e3',{})
assert(editsObserved[#editsObserved]==false,'the person can still turn edits off')
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

-- Apple-owned Run mode is the exception to clearing consent. The start is explicitly authorised,
-- ordinary writes remain blocked while the test is live, stop stays authorised so the agent cannot
-- strand the Studio in Run mode, and the original connection consent is usable again afterward.
local playStart=bridgeConfig.execute('play-start',{op='run_mode',action='start'})
assert(playStart.ok==true and editsObserved[#editsObserved]==true,'Apple Run start uses explicit connection consent')
bridgeConfig.execute('during-play',{})
assert(editsObserved[#editsObserved]==false,'ordinary writes stay blocked while Apple Run mode is active')
local playStop=bridgeConfig.execute('play-stop',{op='run_mode',action='stop'})
assert(playStop.ok==true and editsObserved[#editsObserved]==true,'Apple can stop the Run mode it started without a stale permission gate')
bridgeConfig.execute('after-play',{})
assert(editsObserved[#editsObserved]==true,'connection edit consent survives an Apple-owned playtest so autonomous fixing can continue')

-- F-044, 2026-09-23 (Coin Rush): after Apple's own playtest the panel read "inspect only". Studio's test-state
-- flag can still flicker after RunService:Stop() returns; a change signal in that window must not be taken
-- for a test the person started, so Apple's ownership lasts until edit mode is seen again.
local flickerStart=bridgeConfig.execute('flicker-start',{op='run_mode',action='start'})
assert(flickerStart.ok==true,'second Apple playtest starts')
local flickerStop=bridgeConfig.execute('flicker-stop',{op='run_mode',action='stop'})
assert(flickerStop.ok==true,'second Apple playtest stops')
studioTest.EditModeActive=false
studioTest:FirePropertyChanged('EditModeActive')
studioTest.EditModeActive=true
studioTest:FirePropertyChanged('EditModeActive')
bridgeConfig.execute('after-flicker',{})
assert(editsObserved[#editsObserved]==true,'a test-state flicker after Apple stopped its own playtest must not revoke consent')

studioTest.EditModeActive=false
studioTest:FirePropertyChanged('EditModeActive')
studioTest.EditModeActive=true
studioTest:FirePropertyChanged('EditModeActive')
bridgeConfig.execute('h',{})
assert(editsObserved[#editsObserved]==true,'a test the person started pauses edits, and edit mode resumes them (D-PLUGIN-2)')

-- F-046: Apple's player-side check starts a real Test session. It takes the same consent as a write,
-- and that session is Apple's own: coming back from it must neither revoke nor pause the consent.
local playCheck=bridgeConfig.execute('play-check',{op='play_check',seconds=3})
assert(playCheck.ok==true and editsObserved[#editsObserved]==true,'the play check is authorised by the connection consent')
bridgeConfig.execute('after-play-check',{})
assert(editsObserved[#editsObserved]==true,"Apple's own Test session must not revoke or pause the consent afterwards")
assert(byText('Access: edits allowed for this connection'),'after the play check the panel still says edits are allowed')
studioTest.EditModeActive=false
bridgeConfig.execute('play-check-during-test',{op='play_check'})
assert(editsObserved[#editsObserved]==false,'a play check is not authorised while Studio is already testing')
studioTest.EditModeActive=true
studioTest:FirePropertyChanged('EditModeActive')

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

  // F-059, 2026-09-24: the dock asks the asset-source question the moment the worker says it is owed.
  const sourcesAssertions = `
local function textContaining(value)
  for _,o in objects do if type(o.Text)=='string' and string.find(o.Text,value,1,true) then return o end end
  return nil
end
local heading = textContaining('May Apple add free Roblox assets to this game?')
assert(heading,'the dock has no asset consent question')
assert(heading.Visible==false,'the question shows before anything owes it')
local box
for _,o in objects do if o.Name=='PairingCode' then box=o end end
box.Text='abc123'
textContaining('Connect to Apple').Activated:Fire()
local dock
for _,o in objects do if o.ClassName=='DockWidget' then dock=o end end
dock.Enabled=false
assert(type(bridgeConfig.onAssetSources)=='function','the bridge is given nowhere to report an owed answer')
bridgeConfig.onAssetSources({owed=true})
assert(heading.Visible==true,'an owed answer does not show the question')
assert(dock.Enabled==true,'the dock stays closed while a build waits on the person')
assert(not textContaining('Make it from scratch'),'the dock still offers a from-scratch source choice')
local save = textContaining('Allow assets and continue')
assert(save and save.Visible,'there is no way to give the answer')
save.Activated:Fire()
local sent = bridgeInstance.answers[#bridgeInstance.answers]
assert(sent and #sent==1 and sent[1]=='creator_store','the consent must authorize only free Roblox assets')
bridgeConfig.onAssetSources({owed=true,message='Pick at least one source.'})
assert(heading.Visible==true and textContaining('Pick at least one source.'),'a refused answer is not explained, or the question closes')
bridgeConfig.onAssetSources({owed=false})
assert(heading.Visible==false and save.Visible==false,'a settled question stays open')
bridgeConfig.onAssetSources({owed=true})
textContaining('Disconnect').Activated:Fire()
assert(heading.Visible==false,'a question nobody can answer stays up after disconnecting')
plugin.Unloading:Fire()
print('asset source assertions passed')
`;
  const sourcesFile = join(directory, 'entry-asset-sources.luau');
  writeFileSync(sourcesFile, `${prelude}\n${entry}\n${sourcesAssertions}`);
  const sourcesOutput = execFileSync('luau', [sourcesFile], { encoding: 'utf8' });
  assert.match(sourcesOutput, /asset source assertions passed/);

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
assert(editsObserved[#editsObserved]==true,'fallback RunState transition pauses permission and edit mode resumes it (D-PLUGIN-2)')
plugin.Unloading:Fire()
print('missing StudioTestService fallback assertions passed')
`;
  const fallbackFile = join(directory, 'entry-no-studio-test-service.luau');
  writeFileSync(fallbackFile, `${fallbackPrelude}\nlocal function runEntry()\n${entry}\nend\nrunEntry()\n${fallbackAssertions}`);
  const fallbackOutput = execFileSync('luau', [fallbackFile], { encoding: 'utf8' });
  assert.match(fallbackOutput, /missing StudioTestService fallback assertions passed/);
});

// The customer sees a single consent action, while the wire policy stays explicit and fail-closed.
test('the Studio dock never exposes a Creator Store versus scratch selector', () => {
  const strip = (t) => t.replace(/--\[\[[\s\S]*?\]\]/g, '').replace(/--.*$/gm, '');
  const entry = strip(readFileSync(new URL('../src/init.server.luau', import.meta.url), 'utf8'));
  assert.match(entry, /May Apple add free Roblox assets to this game\?/);
  assert.match(entry, /Allow assets and continue/);
  assert.doesNotMatch(entry, /Make it from scratch|Pick as many as you like|SOURCE_CHOICES/);
  assert.match(entry, /bridge:answerAssetSources\(\{ "creator_store" \}\)/);
});

 test('dock and presence version match Bridge and package version', () => {
  const entry = readFileSync(new URL('../src/init.server.luau', import.meta.url), 'utf8');
  const bridge = readFileSync(new URL('../src/Bridge.luau', import.meta.url), 'utf8');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const version = bridge.match(/local PLUGIN_VERSION = "([^"]+)"/)[1];
  assert.equal(pkg.version, version);
  assert.ok(entry.includes(`Apple Studio · ${version} · independent preview`));
  assert.ok(entry.includes(`pluginVersion = "${version}"`));
});
