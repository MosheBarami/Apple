import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// The entry script runs here under Luau against a modelled Studio: a cooperative task scheduler (the
// connection loop really loops), a fake Bridge whose server answers are scripted, and a Studio theme.
const PRELUDE = `
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
  local o = {ClassName=class, Activated=signal(), Click=signal(), Changed=signal(), propertySignals={}, Visible=true}
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
local Enum = setmetatable({}, {__index=function(_, group) return setmetatable({}, {__index=function(_, item) return group .. '.' .. item end}) end})
local UDim = {new=function(...) return {...} end}
local UDim2 = {new=function(...) return {...} end,fromScale=function(...) return {...} end,fromOffset=function(...) return {...} end}
local Color3 = {fromRGB=function(...) return {...} end}
local DockWidgetPluginGuiInfo = {new=function(...) return {...} end}
local THEME = { name='Dark' }
local themeChanged = signal()
local function settings()
  return { Studio = { ThemeChanged = themeChanged, Theme = { GetColor = function(_, which) return THEME.name .. ':' .. tostring(which) end } } }
end
local function typeof(value) if type(value)=='string' then return 'Color3' end return type(value) end
local run = object('RunService')
run.edit=true
function run:IsEdit() return self.edit end
run.running=false
function run:IsRunning() return self.running end
function run:IsRunMode() return not self.edit end
local studioTest = object('StudioTestService')
studioTest.EditModeActive=true
local guids = 0
local Http = {}
function Http:GenerateGUID() guids += 1; return string.format('{%08X-0000-4000-8000-%012X}', guids, guids) end
local Studio = {}
function Studio:GetUserId() return 4242 end
local game = {Name='Isolated fixture',PlaceId=0,GameId=0}
function game:GetService(name)
  if name=='RunService' then return run end
  if name=='Selection' then return {Get=function() return {} end} end
  if name=='StudioTestService' then return studioTest end
  if name=='HttpService' then return Http end
  if name=='StudioService' then return Studio end
  error(name)
end
local savedSettings = SAVED_SETTINGS or {}
local plugin = {Unloading=signal()}
function plugin:GetSetting(key) return savedSettings[key] end
function plugin:SetSetting(key, value) savedSettings[key] = value end
function plugin:CreateToolbar(_)
  return {CreateButton=function(...) return object('ToolbarButton') end}
end
function plugin:CreateDockWidgetPluginGuiAsync(...) return object('DockWidget') end
-- A cooperative scheduler: spawn runs a thread until it waits, and step() resumes the waiting ones.
local threads = {}
local task = {}
function task.spawn(fn)
  local co = coroutine.create(fn)
  local ok, err = coroutine.resume(co)
  if not ok then error(err) end
  if coroutine.status(co) ~= 'dead' then table.insert(threads, co) end
end
function task.wait() coroutine.yield() end
local function step(times)
  for _ = 1, times or 1 do
    local list = threads
    threads = {}
    for _, co in list do
      if coroutine.status(co) ~= 'dead' then
        local ok, err = coroutine.resume(co)
        if not ok then error(err) end
        if coroutine.status(co) ~= 'dead' then table.insert(threads, co) end
      end
    end
  end
end
local bridgeConfig
local bridgeInstance
local editsObserved={}
local commandDestroyed=false
-- What the server says to the next announce: 'waiting', 'connect' or 'fail'.
local SERVER = { answer='waiting', project='Tower' }
local Bridge = {new=function(config)
  bridgeConfig=config
  local b={connected=false,destroyed=false,announces=0,heartbeats=0,releases=0,identities={}}
  function b:isConnected() return self.connected end
  function b:projectName() if self.connected then return SERVER.project end return nil end
  function b:connect(identity)
    self.announces+=1
    table.insert(self.identities, identity)
    if SERVER.answer=='connect' then
      self.connected=true; config.onStatus('Connected · ' .. SERVER.project)
      return true,'Connected','connected'
    elseif SERVER.answer=='fail' then
      return false,'Could not reach StudPilot — check Studio’s network permission.','failed'
    end
    return false,'Waiting for StudPilot','waiting'
  end
  function b:heartbeat(identity) self.heartbeats+=1 end
  function b:release(identity) self.releases+=1; SERVER.answer='waiting'; self.connected=false; config.onStatus('Disconnected') end
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
  return {execute=function(self,id,op,allow,fence)
    table.insert(editsObserved,allow)
    if type(op)=='table' and op.op=='capture_studio_viewport' then
      return {id=id,ok=commandOptions.isEdit() and type(fence)=='function' and fence()==true}
    elseif type(op)=='table' and op.op=='create_instances' then
      return {id=id,ok=allow==true and type(fence)=='function' and fence()==true}
    end
    return {id=id,ok=allow==true}
  end,destroy=function() commandDestroyed=true end}
end}
local script = {Bridge=Bridge,Commands=Commands}
local function require(value) return value end
local function textOf(value)
  for _,o in objects do if o.Text==value and o.Visible ~= false then return o end end
  return nil
end
local function textContaining(value)
  for _,o in objects do if type(o.Text)=='string' and string.find(o.Text,value,1,true) and o.Visible ~= false then return o end end
  return nil
end
`;

test('the dock connects with no code and no consent step: waiting, connected, problem, disconnect', () => {
  const entry = readFileSync(new URL('../src/init.server.luau', import.meta.url), 'utf8');
  const assertions = `
-- IT ANNOUNCES ITSELF AT ONCE, with the install identity it generated and persisted.
assert(bridgeInstance.announces==1,'the plugin must announce itself as soon as it loads')
local id = bridgeInstance.identities[1]
assert(#id.installId==32 and string.match(id.installId,'^[0-9a-f]+$'),'install id is 32 lowercase hex')
assert(#id.secret==64 and string.match(id.secret,'^[0-9a-f]+$'),'secret is 64 lowercase hex')
assert(#id.studioSessionId==32 and id.studioSessionId~=id.installId,'each Studio session has its own id')
assert(id.robloxUserId==4242,'the Roblox user signed into Studio is reported')
local saved = savedSettings.StudPilotInstallV1
assert(saved and saved.installId==id.installId and saved.secret==id.secret,'the identity is persisted for the next Studio launch')
assert(saved.token==nil and saved.session==nil,'nothing but the identity is saved')

-- WAITING: one line and the one hint.
assert(textOf('Waiting for StudPilot'),'waiting state title')
assert(textOf('Open your project on studpilot.app and press Connect.'),'waiting hint')
for _,o in objects do
  assert(o.Name~='PairingCode','there is no pairing code box')
  assert(o.Text~='Enable edits…' and o.Text~='Allow edits for this connection','there is no edit-consent step')
end
bridgeConfig.execute('a',{})
assert(editsObserved[#editsObserved]==false,'nothing is authorised before a connection')

-- THE THEME IS STUDIO'S: colours come from Studio's style guide and follow a theme change.
local dock
for _,o in objects do if o.Name=='StudPilotDock' then dock=o end end
assert(dock.BackgroundColor3=='Dark:StudioStyleGuideColor.MainBackground','the dock background is Studio\\'s MainBackground')
THEME.name='Light'; themeChanged:Fire()
assert(dock.BackgroundColor3=='Light:StudioStyleGuideColor.MainBackground','a theme change repaints the dock')

-- CONNECT IS PRESSED ON THE WEB: the next announce returns a token, and StudPilot edits at once.
SERVER.answer='connect'
step(10)
assert(bridgeInstance.connected,'the loop must announce again and connect')
assert(textOf('Connected to Tower'),'connected state names the project')
assert(textOf('Disconnect'),'connected state offers Disconnect')
bridgeConfig.execute('b',{})
assert(editsObserved[#editsObserved]==true,'connecting authorises edits with no second step')
assert(bridgeConfig.execute('write',{op='create_instances'},function()return true end).ok==true,'a write goes through on a live connection')
assert(bridgeConfig.execute('capture',{op='capture_studio_viewport'},function()return true end).ok==true,'viewport capture works while connected')
assert(bridgeConfig.execute('retired',{op='create_instances'},function()return false end).ok==false,'a retired connection generation must refuse writes')

-- A STUDIO TEST: writes wait for edit mode; Run-mode controls stay reachable on the connection alone.
studioTest.EditModeActive=false
assert(run:IsEdit()==true,'fixture keeps RunService IsEdit true while StudioTestService leaves edit mode')
bridgeConfig.execute('during-test',{})
assert(editsObserved[#editsObserved]==false,'ordinary writes are refused outside edit mode')
bridgeConfig.execute('stop',{op='run_mode',action='stop'})
assert(editsObserved[#editsObserved]==true,'StudPilot can stop a Run-mode test while Studio is outside edit mode')
studioTest.EditModeActive=true
bridgeConfig.execute('after-test',{})
assert(editsObserved[#editsObserved]==true,'edit mode again, edits again, with nothing for the person to click')

-- WHILE CONNECTED, A HEARTBEAT keeps this Studio visible to Connect.
local beats = bridgeInstance.heartbeats
step(45)
assert(bridgeInstance.heartbeats>beats,'a connected plugin sends heartbeats')

-- DISCONNECT IN STUDIO releases the binding and goes back to waiting.
textOf('Disconnect').Activated:Fire()
assert(bridgeInstance.releases==1,'Disconnect releases the binding on the server')
bridgeConfig.execute('c',{})
assert(editsObserved[#editsObserved]==false,'disconnect ends the authority')
assert(textOf('Waiting for StudPilot'),'after Disconnect the dock waits again')
step(10)
assert(not bridgeInstance.connected,'a released Studio does not reconnect by itself')

-- A CONNECTION PROBLEM: one line and Retry, and Retry asks again at once.
SERVER.answer='fail'
step(10)
assert(textOf('Can’t reach StudPilot'),'problem state title')
assert(textContaining('network permission'),'problem state says what is wrong in one line')
local before = bridgeInstance.announces
SERVER.answer='waiting'
textOf('Retry').Activated:Fire()
step(2)
assert(bridgeInstance.announces>before,'Retry asks again')
assert(textOf('Waiting for StudPilot'),'a retry that reaches StudPilot clears the problem')

plugin.Unloading:Fire()
step(5)
assert(bridgeInstance.destroyed and commandDestroyed)
for _,o in objects do
  for _,key in {'Activated','Click','Changed'} do
    for _,link in o[key].listeners do assert(not link.active,'event leak') end
  end
  for _,propertySignal in o.propertySignals do
    for _,link in propertySignal.listeners do assert(not link.active,'property event leak') end
  end
end
for _,link in themeChanged.listeners do assert(not link.active,'theme listener leak') end
print('entry runtime assertions passed')
`;
  const directory = mkdtempSync(join(tmpdir(), 'studpilot-entry-'));
  const file = join(directory, 'entry.luau');
  writeFileSync(file, PRELUDE + '\n' + entry + '\n' + assertions);
  assert.match(execFileSync('luau', [file], { encoding: 'utf8' }), /entry runtime assertions passed/);

  // A second launch reuses the saved identity instead of minting a new one (a new one would lose the binding).
  const reuse = `local SAVED_SETTINGS = { StudPilotInstallV1 = { installId = string.rep('1', 32), secret = string.rep('2', 64) } }\n`;
  const reuseFile = join(directory, 'entry-reuse.luau');
  writeFileSync(reuseFile, reuse + PRELUDE + '\n' + entry + `\nassert(bridgeInstance.identities[1].installId==string.rep('1',32) and bridgeInstance.identities[1].secret==string.rep('2',64),'the saved identity was not reused')\nplugin.Unloading:Fire()\nprint('identity reused')\n`);
  assert.match(execFileSync('luau', [reuseFile], { encoding: 'utf8' }), /identity reused/);

  // ONE DEFINITION OF EDIT MODE, HANDED TO THE ENGINE (IsEdit() alone stays true during a test).
  const editFile = join(directory, 'entry-edit-mode.luau');
  writeFileSync(editFile, PRELUDE + '\n' + entry + `
assert(type(commandOptions)=='table' and type(commandOptions.isEdit)=='function','the engine must be given this entry point definition of edit mode')
studioTest.EditModeActive=false
assert(commandOptions.isEdit()==false,'the engine gate must see a Studio test')
studioTest.EditModeActive=true
run.running=true
assert(commandOptions.isEdit()==false,'a running simulation is not edit mode')
run.running=false
plugin.Unloading:Fire()
print('edit mode handed down')
`);
  assert.match(execFileSync('luau', [editFile], { encoding: 'utf8' }), /edit mode handed down/);

  const unknownServicePrelude = PRELUDE.replace('studioTest.EditModeActive=true', "studioTest.EditModeActive='unknown'");
  const unknownServiceFile = join(directory, 'entry-unknown-studio-test-service.luau');
  writeFileSync(unknownServiceFile, `${unknownServicePrelude}\nlocal function runEntry()\n${entry}\nend\nrunEntry()\nassert(bridgeInstance==nil,'present StudioTestService with unknown edit state must fail closed before creating the bridge')\nprint('unknown StudioTestService state failed closed')\n`);
  assert.match(execFileSync('luau', [unknownServiceFile], { encoding: 'utf8' }), /unknown StudioTestService state failed closed/);

  // F-059, 2026-09-24: the dock asks the asset-source question the moment the worker says it is owed.
  const sourcesFile = join(directory, 'entry-asset-sources.luau');
  writeFileSync(sourcesFile, `${PRELUDE}\n${entry}\n
local heading = textContaining('May StudPilot add free Roblox assets to this game?')
assert(heading==nil,'the question shows before anything owes it')
SERVER.answer='connect'
step(10)
local widget
for _,o in objects do if o.ClassName=='DockWidget' then widget=o end end
widget.Enabled=false
bridgeConfig.onAssetSources({owed=true})
heading = textContaining('May StudPilot add free Roblox assets to this game?')
assert(heading,'an owed answer does not show the question')
assert(widget.Enabled==true,'the dock stays closed while a build waits on the person')
assert(not textContaining('Make it from scratch'),'the dock still offers a from-scratch source choice')
local save = textOf('Allow assets and continue')
assert(save,'there is no way to give the answer')
save.Activated:Fire()
local sent = bridgeInstance.answers[#bridgeInstance.answers]
assert(sent and #sent==1 and sent[1]=='creator_store','the consent must authorize only free Roblox assets')
bridgeConfig.onAssetSources({owed=true,message='Pick at least one source.'})
assert(heading.Visible==true and textContaining('Pick at least one source.'),'a refused answer is not explained, or the question closes')
bridgeConfig.onAssetSources({owed=false})
assert(heading.Visible==false and save.Visible==false,'a settled question stays open')
bridgeConfig.onAssetSources({owed=true})
textOf('Disconnect').Activated:Fire()
assert(heading.Visible==false,'a question nobody can answer stays up after disconnecting')
plugin.Unloading:Fire()
print('asset source assertions passed')
`);
  assert.match(execFileSync('luau', [sourcesFile], { encoding: 'utf8' }), /asset source assertions passed/);

  const fallbackFile = join(directory, 'entry-no-studio-test-service.luau');
  writeFileSync(fallbackFile, `${PRELUDE.replace("  if name=='StudioTestService' then return studioTest end\n", '')}\nlocal function runEntry()\n${entry}\nend\nrunEntry()
assert(bridgeInstance~=nil,'missing StudioTestService uses the explicit RunService compatibility fallback')
SERVER.answer='connect'
step(10)
bridgeConfig.execute('fallback-granted',{})
assert(editsObserved[#editsObserved]==true,'the fallback connects and edits without a consent step')
run.edit=false
bridgeConfig.execute('fallback-testing',{})
assert(editsObserved[#editsObserved]==false,'the fallback still refuses writes outside edit mode')
run.edit=true
plugin.Unloading:Fire()
print('missing StudioTestService fallback assertions passed')
`);
  assert.match(execFileSync('luau', [fallbackFile], { encoding: 'utf8' }), /missing StudioTestService fallback assertions passed/);
});

// The customer sees a single consent action for assets, while the wire policy stays explicit and fail-closed.
test('the Studio dock never exposes a Creator Store versus scratch selector', () => {
  const strip = (t) => t.replace(/--\[\[[\s\S]*?\]\]/g, '').replace(/--.*$/gm, '');
  const entry = strip(readFileSync(new URL('../src/init.server.luau', import.meta.url), 'utf8'));
  assert.match(entry, /May StudPilot add free Roblox assets to this game\?/);
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
  assert.ok(entry.includes(`StudPilot Studio · ${version}`));
  assert.ok(entry.includes(`pluginVersion = "${version}"`));
});
