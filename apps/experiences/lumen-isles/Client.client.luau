--!nonstrict
-- Original Lumen Isles presentation. Cosmetic feedback only; all rewards come from the server.
local Players = game:GetService("Players")
local Storage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Input = game:GetService("UserInputService")
local GuiService = game:GetService("GuiService")
local Context = game:GetService("ContextActionService")
local TweenService = game:GetService("TweenService")
local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")
local previous = playerGui:FindFirstChild("LumenIslesUI")
if previous then previous:Destroy() end
local colours = { ink = Color3.fromRGB(246,238,211), muted = Color3.fromRGB(176,205,200), panel = Color3.fromRGB(22,55,66),
    deep = Color3.fromRGB(14,37,49), line = Color3.fromRGB(88,132,137), gold = Color3.fromRGB(255,208,111), green = Color3.fromRGB(154,211,162), error = Color3.fromRGB(255,170,151) }
local gui = Instance.new("ScreenGui");gui.Name="LumenIslesUI";gui.ResetOnSpawn=false;gui.ScreenInsets=Enum.ScreenInsets.CoreUISafeInsets;gui.ZIndexBehavior=Enum.ZIndexBehavior.Sibling;gui.Parent=playerGui
local connections, alive = {}, true
local function listen(signal, fn) local c=signal:Connect(fn);table.insert(connections,c);return c end
local function make(className, parent, props)
    local value=Instance.new(className)
    for key,property in pairs(props or {}) do value[key]=property end
    value.Parent=parent
    return value
end
local function corner(parent, radius) make("UICorner",parent,{CornerRadius=UDim.new(0,radius)}) end
local function stroke(parent, colour, thickness) make("UIStroke",parent,{Color=colour or colours.line,Thickness=thickness or 1,ApplyStrokeMode=Enum.ApplyStrokeMode.Border,Transparency=0.2}) end
local function label(parent,name,text,size,pos,dim,colour,bold)
    return make("TextLabel",parent,{Name=name,Text=text,TextSize=size,TextColor3=colour or colours.ink,Font=bold and Enum.Font.GothamBold or Enum.Font.Gotham,
        BackgroundTransparency=1,RichText=false,TextWrapped=true,TextXAlignment=Enum.TextXAlignment.Left,TextYAlignment=Enum.TextYAlignment.Center,Position=pos,Size=dim})
end
local function button(parent,name,text,pos,size,primary)
    local b=make("TextButton",parent,{Name=name,Text=text,TextSize=15,Font=Enum.Font.GothamBold,TextColor3=primary and colours.deep or colours.ink,
        BackgroundColor3=primary and colours.gold or colours.panel,BorderSizePixel=0,AutoButtonColor=true,Selectable=true,TextWrapped=true,Position=pos,Size=size})
    corner(b,10);stroke(b,primary and colours.gold or colours.line)
    return b
end
local function panel(parent,name,pos,size)
    local f=make("Frame",parent,{Name=name,Position=pos,Size=size,BackgroundColor3=colours.panel,BackgroundTransparency=0.08,BorderSizePixel=0})
    corner(f,14);stroke(f);return f
end
local function diamond(parent,name,at,size,colour)
    local d=make("Frame",parent,{Name=name,Position=at,Size=UDim2.fromOffset(size,size),Rotation=45,BackgroundColor3=colour,BorderSizePixel=0})
    corner(d,3);return d
end
local dimmer=make("Frame",gui,{Name="MenuShade",Size=UDim2.fromScale(1,1),BackgroundColor3=colours.deep,BackgroundTransparency=0.42,BorderSizePixel=0,ZIndex=3})
make("UIGradient",dimmer,{Transparency=NumberSequence.new({NumberSequenceKeypoint.new(0,0),NumberSequenceKeypoint.new(0.6,0.35),NumberSequenceKeypoint.new(1,1)})})
local menu=make("Frame",gui,{Name="Welcome",Position=UDim2.fromScale(0.065,0.17),Size=UDim2.fromScale(0.5,0.73),BackgroundTransparency=1,ZIndex=4})
local menuScale=make("UIScale",menu,{Scale=1})
label(menu,"Edition","A SMALL WORLD. A LONG WAY HOME.",12,UDim2.fromOffset(2,0),UDim2.fromOffset(420,24),colours.gold,true)
local title=label(menu,"Title","LUMEN\nISLES",68,UDim2.fromOffset(0,34),UDim2.fromOffset(420,164),nil,true)
title.Font=Enum.Font.GothamBlack;title.TextYAlignment=Enum.TextYAlignment.Top
label(menu,"Tagline","Follow the wind.\nBring the light home.",23,UDim2.fromOffset(2,205),UDim2.fromOffset(350,64),nil,false)
label(menu,"Synopsis","Eighteen lost shards. Three quiet beacons.\nAn island journey waiting for its keeper.",14,UDim2.fromOffset(2,285),UDim2.fromOffset(360,52),colours.muted,false)
local begin=button(menu,"Begin","Opening your journey…",UDim2.fromOffset(0,362),UDim2.fromOffset(296,54),true)
begin.Active=false;begin.Selectable=false
local menuNote=label(menu,"SaveDisclosure","Connecting to the island…",12,UDim2.fromOffset(2,428),UDim2.fromOffset(355,43),colours.muted,false)
local retry=button(menu,"Retry","Retry connection",UDim2.fromOffset(0,478),UDim2.fromOffset(296,44),false);retry.Visible=false
local credit=label(gui,"CornerSignature","LUMEN ISLES  /  AN ORIGINAL APPLE EXPERIENCE",11,UDim2.new(1,-415,1,-31),UDim2.fromOffset(395,22),colours.muted,true);credit.TextXAlignment=Enum.TextXAlignment.Right;credit.ZIndex=4

local hud=make("Frame",gui,{Name="JourneyHUD",Size=UDim2.fromScale(1,1),BackgroundTransparency=1,Visible=false})
local journey=panel(hud,"Journey",UDim2.fromOffset(22,18),UDim2.fromOffset(296,104))
label(journey,"Eyebrow","THE KEEPER'S JOURNEY",10,UDim2.fromOffset(17,11),UDim2.fromOffset(260,20),colours.gold,true)
local objective=label(journey,"Objective","Restore the wind beacons",16,UDim2.fromOffset(17,32),UDim2.fromOffset(264,25),nil,true)
local progressText=label(journey,"Progress","0 / 3 restored",12,UDim2.fromOffset(17,70),UDim2.fromOffset(120,19),colours.muted,false)
local beaconDots={}
for i=1,3 do beaconDots[i]=diamond(journey,"Beacon"..i,UDim2.fromOffset(205+(i-1)*23,72),10,colours.line) end
local purse=panel(hud,"ShardPurse",UDim2.new(1,-210,0,18),UDim2.fromOffset(188,72))
diamond(purse,"Shard",UDim2.fromOffset(18,24),22,colours.gold)
label(purse,"Currency","LIGHT SHARDS",10,UDim2.fromOffset(57,12),UDim2.fromOffset(125,18),colours.gold,true)
local available=label(purse,"Available","0",27,UDim2.fromOffset(57,30),UDim2.fromOffset(70,33),nil,true)
local collected=label(purse,"Collected","0 / 18",11,UDim2.fromOffset(110,40),UDim2.fromOffset(64,20),colours.muted,false);collected.TextXAlignment=Enum.TextXAlignment.Right
local bottom=panel(hud,"JourneyActions",UDim2.new(1,-292,1,-78),UDim2.fromOffset(270,58))
local journalButton=button(bottom,"JournalButton","Journal  [J]",UDim2.fromOffset(8,8),UDim2.fromOffset(150,42),false)
local settingsButton=button(bottom,"SettingsButton","Settings",UDim2.fromOffset(166,8),UDim2.fromOffset(96,42),false)
local saveBacking=panel(hud,"SaveStatusPanel",UDim2.new(0,22,1,-57),UDim2.fromOffset(355,38))
local saveLabel=label(saveBacking,"SaveStatus","",12,UDim2.fromOffset(12,4),UDim2.new(1,-24,1,-8),colours.muted,false)
local zone=label(hud,"Zone","HARBOUR MEADOW",12,UDim2.new(0.5,-155,0,25),UDim2.fromOffset(310,25),colours.ink,true);zone.TextXAlignment=Enum.TextXAlignment.Center

local toast=panel(gui,"Feedback",UDim2.new(0.5,-210,1,-151),UDim2.fromOffset(420,64));toast.Visible=false;toast.ZIndex=9
local toastText=label(toast,"Message","",15,UDim2.fromOffset(19,9),UDim2.new(1,-38,1,-18),nil,true);toastText.ZIndex=10
local toastGeneration=0
local function notify(text,kind)
    toastGeneration+=1;local generation=toastGeneration
    toastText.Text=text;toastText.TextColor3=kind=="error" and colours.error or kind=="success" and colours.gold or colours.ink
    toast.Visible=true
    task.delay(4,function() if alive and generation==toastGeneration then toast.Visible=false end end)
end

local overlay=make("Frame",gui,{Name="JournalOverlay",Size=UDim2.fromScale(1,1),BackgroundColor3=colours.deep,BackgroundTransparency=0.22,Visible=false,ZIndex=6})
local modal=panel(overlay,"Journal",UDim2.fromScale(0.5,0.5),UDim2.fromOffset(660,530));modal.AnchorPoint=Vector2.new(0.5,0.5);modal.ZIndex=7
local modalTitle=label(modal,"Heading","THE WIND ATLAS",25,UDim2.fromOffset(24,19),UDim2.new(1,-124,0,40),nil,true)
local close=button(modal,"Close","Close",UDim2.new(1,-90,0,19),UDim2.fromOffset(66,42),false)
local journalScroll=make("ScrollingFrame",modal,{Name="JournalContent",Position=UDim2.fromOffset(20,78),Size=UDim2.new(1,-40,1,-170),BackgroundTransparency=1,BorderSizePixel=0,ScrollBarThickness=4,ScrollBarImageColor3=colours.gold,CanvasSize=UDim2.fromOffset(0,394),ScrollingDirection=Enum.ScrollingDirection.Y})
local atlas=panel(journalScroll,"Atlas",UDim2.fromOffset(2,0),UDim2.new(1,-8,0,226));atlas.BackgroundColor3=colours.deep
local routes={}
for _,segment in ipairs({{0.42,0.77,0.79,0.63},{0.79,0.63,0.65,0.17},{0.65,0.17,0.18,0.2},{0.18,0.2,0.3,0.5},{0.3,0.5,0.42,0.77}}) do
    local line=make("Frame",atlas,{Name="TimberRoute",AnchorPoint=Vector2.new(0.5,0.5),BackgroundColor3=colours.gold,BackgroundTransparency=0.5,BorderSizePixel=0})
    table.insert(routes,{line=line,from=Vector2.new(segment[1],segment[2]),to=Vector2.new(segment[3],segment[4])})
end
local function fitAtlas()
    for _,route in ipairs(routes) do
        local a=route.from*atlas.AbsoluteSize
        local b=route.to*atlas.AbsoluteSize
        local d=b-a
        route.line.Position=UDim2.fromOffset((a.X+b.X)/2,(a.Y+b.Y)/2)
        route.line.Size=UDim2.fromOffset(d.Magnitude,2)
        route.line.Rotation=math.deg(math.atan2(d.Y,d.X))
    end
end
listen(atlas:GetPropertyChangedSignal("AbsoluteSize"),fitAtlas)
fitAtlas()
local mapLand=Color3.fromRGB(99,143,124)
for i,data in ipairs({{0.42,0.77,94,50},{0.79,0.63,100,64},{0.65,0.17,94,60},{0.18,0.2,110,68},{0.3,0.5,52,43}}) do
    local f=make("Frame",atlas,{Name="Island"..i,Position=UDim2.fromScale(data[1],data[2]),AnchorPoint=Vector2.new(0.5,0.5),Size=UDim2.new(data[3]/612,0,data[4]/226,0),BackgroundColor3=mapLand,Rotation=i*17-40,BorderSizePixel=0})
    corner(f,25);stroke(f,Color3.fromRGB(146,179,147),1)
end
local nodes={}
for i,spec in ipairs({{"orchard","ORCHARD",0.79,0.55},{"tide","TIDEGLASS",0.65,0.17},{"summit","CLOUDREST",0.18,0.18}}) do
    diamond(atlas,spec[1],UDim2.new(spec[3],-6,spec[4],-6),12,colours.gold)
    local t=label(atlas,spec[1].."Label",spec[2],10,UDim2.new(spec[3],-60,spec[4],17),UDim2.fromOffset(120,20),colours.ink,true);t.TextXAlignment=Enum.TextXAlignment.Center
    nodes[spec[1]]=t
end
label(atlas,"Harbour","HARBOUR",10,UDim2.new(0.42,-50,0.77,17),UDim2.fromOffset(110,20),colours.ink,true).TextXAlignment=Enum.TextXAlignment.Center
label(atlas,"Lighthouse","LIGHTHOUSE",10,UDim2.new(0.3,-53,0.5,17),UDim2.fromOffset(106,20),colours.gold,true).TextXAlignment=Enum.TextXAlignment.Center
label(atlas,"MapNote","THE ISLAND CIRCUIT",10,UDim2.fromOffset(15,5),UDim2.new(1,-65,0,18),colours.muted,true)
label(atlas,"Compass","N ↑",11,UDim2.new(1,-45,0,5),UDim2.fromOffset(35,20),colours.gold,true)
local journalStatus=label(journalScroll,"JournalStatus","Three beacons are waiting for their light.",17,UDim2.fromOffset(4,239),UDim2.new(1,-12,0,48),nil,true)
local journalDetail=label(journalScroll,"JournalDetail","Gather four shards near each island, then hold E or the prompt button at its beacon. Follow the marked circuit back to the lighthouse once all three are alight.",14,UDim2.fromOffset(4,293),UDim2.new(1,-12,0,92),colours.muted,false)
local returnButton=button(modal,"Return","Return to last beacon",UDim2.new(0,26,1,-67),UDim2.fromOffset(250,43),false)
local totalNote=label(modal,"Relics","0 / 18 shards discovered",12,UDim2.new(0.5,0,1,-62),UDim2.new(0.5,-26,0,34),colours.gold,true);totalNote.TextXAlignment=Enum.TextXAlignment.Right

local settings=panel(overlay,"Settings",UDim2.fromScale(0.5,0.5),UDim2.fromOffset(500,370));settings.AnchorPoint=Vector2.new(0.5,0.5);settings.Visible=false;settings.ZIndex=7
local settingsTitle=label(settings,"Title","MAKE YOURSELF AT HOME",22,UDim2.fromOffset(24,20),UDim2.new(1,-48,0,60),nil,true)
local reduced=false
local motion=button(settings,"Motion","Reduced motion: off",UDim2.fromOffset(24,100),UDim2.new(1,-48,0,48),false)
label(settings,"Instructions","Move: WASD / left stick\nJump: Space / A / touch jump\nInteract: E / X / on-screen prompt\nJournal: J / Y   •   Close: Escape / B",14,UDim2.fromOffset(26,162),UDim2.new(1,-52,0,107),colours.muted,false)
local settingsClose=button(settings,"Back","Back to the islands",UDim2.new(0,24,1,-73),UDim2.new(1,-48,0,48),true)

local completion=panel(gui,"Completion",UDim2.fromScale(0.5,0.5),UDim2.fromOffset(530,350));completion.AnchorPoint=Vector2.new(0.5,0.5);completion.Visible=false;completion.ZIndex=12
label(completion,"Eyebrow","JOURNEY COMPLETE",12,UDim2.fromOffset(32,26),UDim2.new(1,-64,0,25),colours.gold,true).TextXAlignment=Enum.TextXAlignment.Center
label(completion,"Heading","You brought\nthe light home.",38,UDim2.fromOffset(28,64),UDim2.new(1,-56,0,104),nil,true).TextXAlignment=Enum.TextXAlignment.Center
label(completion,"Body","The islands are awake again.\nThere are still quiet corners worth finding.",15,UDim2.fromOffset(32,183),UDim2.new(1,-64,0,60),colours.muted,false).TextXAlignment=Enum.TextXAlignment.Center
local explore=button(completion,"KeepExploring","Keep exploring",UDim2.new(0.5,-150,1,-76),UDim2.fromOffset(300,48),true)

local state, request, world, started, openPanel = nil, nil, nil, false, nil
local subscribed = false
local previousSelection
local function blockMovement(_,inputState) return Enum.ContextActionResult.Sink end
Context:BindActionAtPriority("LumenMenu",blockMovement,false,3000,Enum.KeyCode.W,Enum.KeyCode.A,Enum.KeyCode.S,Enum.KeyCode.D,Enum.KeyCode.Space,Enum.KeyCode.Thumbstick1)
local function open(which)
    if not started then return end
    if not openPanel then previousSelection=GuiService.SelectedObject end
    openPanel=which;overlay.Visible=true;modal.Visible=which=="journal";settings.Visible=which=="settings"
    Context:BindActionAtPriority("LumenPanel",blockMovement,false,3000,Enum.KeyCode.W,Enum.KeyCode.A,Enum.KeyCode.S,Enum.KeyCode.D,Enum.KeyCode.Space,Enum.KeyCode.Thumbstick1)
    if Input.GamepadEnabled then GuiService.SelectedObject=which=="journal" and close or settingsClose end
end
local function closePanel()
    openPanel=nil;overlay.Visible=false;Context:UnbindAction("LumenPanel")
    if GuiService.SelectedObject and GuiService.SelectedObject:IsDescendantOf(overlay) then
        GuiService.SelectedObject=previousSelection and previousSelection.Parent and previousSelection or nil
    end
    previousSelection=nil
end
listen(journalButton.Activated,function() if openPanel then closePanel() else open("journal") end end)
listen(settingsButton.Activated,function() open("settings") end)
listen(close.Activated,closePanel);listen(settingsClose.Activated,closePanel)
listen(motion.Activated,function() reduced=not reduced;motion.Text="Reduced motion: "..(reduced and "on" or "off") end)
listen(explore.Activated,function() completion.Visible=false;Context:UnbindAction("LumenPanel");GuiService.SelectedObject=nil end)

local function apply(next_,message,kind)
    if type(next_)~="table" or not alive then return end
    local previouslyFinished=state and state.finished
    state=next_
    begin.Active=state.ready==true;begin.Selectable=begin.Active
    begin.Text=state.ready and ((state.collected or 0)>0 and "Continue your journey  →" or "Begin the journey  →") or "Journey unavailable"
    retry.Visible=state.ready~=true
    menuNote.Text=state.message or "Journey state unavailable"
    saveLabel.Text=state.message or "Save state unavailable"
    saveLabel.TextColor3=(state.save=="retry" or state.save=="unavailable") and colours.error or colours.muted
    if not state.ready then return end
    available.Text=tostring(state.available);collected.Text=tostring(state.collected).." / 18"
    progressText.Text=tostring(state.lit).." / 3 restored"
    objective.Text=state.finished and "The islands are awake" or state.lit==3 and "Return to the lighthouse" or "Restore the wind beacons"
    for i,id in ipairs({"orchard","tide","summit"}) do
        beaconDots[i].BackgroundColor3=state.beacons[id] and colours.gold or colours.line
        nodes[id].TextColor3=state.beacons[id] and colours.gold or colours.ink
    end
    totalNote.Text=tostring(state.collected).." / 18 shards discovered"
    journalStatus.Text=state.finished and "A keeper's work is never quite finished." or state.lit==3 and "The lighthouse is ready for you." or tostring(3-state.lit).." beacons are waiting for their light."
    if world then
        for _,target in ipairs(world.Targets:GetChildren()) do
            local id=target:GetAttribute("CollectibleId")
            if id and state.shards[id] then
                target.LocalTransparencyModifier=1;target.Collect.Enabled=false
                local light=target:FindFirstChildOfClass("PointLight");if light then light.Enabled=false end
            end
        end
        for id in pairs(state.beacons) do
            local b=world.Beacons:FindFirstChild(id)
            if b then b.Core.Color=colours.gold;b.Core.Material=Enum.Material.Neon;b.Core.Restore.Enabled=false end
        end
        if state.finished then world.LighthouseLens.Color=colours.gold;world.LighthouseLens.Material=Enum.Material.Neon end
    end
    if message then notify(message,kind) end
    if started and state.finished and not previouslyFinished then completion.Visible=true;closePanel();if Input.GamepadEnabled then GuiService.SelectedObject=explore end end
end

local camera=workspace.CurrentCamera
local menuCamera=CFrame.lookAt(Vector3.new(128,101,136),Vector3.new(5,23,-47))
camera.CameraType=Enum.CameraType.Scriptable;camera.CFrame=menuCamera;camera.FieldOfView=56
listen(begin.Activated,function()
    if not state or not state.ready then return end
    started=true;menu.Visible=false;dimmer.Visible=false;credit.Visible=false;hud.Visible=true
    camera.CameraType=Enum.CameraType.Custom;camera.FieldOfView=70
    local humanoid=player.Character and player.Character:FindFirstChildOfClass("Humanoid")
    if humanoid then camera.CameraSubject=humanoid end
    Context:UnbindAction("LumenMenu");GuiService.SelectedObject=nil
    notify("Gather light shards. Restore a beacon with four.","info")
end)
listen(Input.InputBegan,function(input,processed)
    if processed or Input:GetFocusedTextBox() then return end
    if input.KeyCode==Enum.KeyCode.J or input.KeyCode==Enum.KeyCode.ButtonY then
        if openPanel then closePanel() else open("journal") end
    elseif (input.KeyCode==Enum.KeyCode.Escape or input.KeyCode==Enum.KeyCode.ButtonB) and openPanel then closePanel() end
end)
local returning=false
listen(returnButton.Activated,function()
    if returning or not request then return end
    returning=true;returnButton.Text="Returning…"
    local ok,result=pcall(function() return request:InvokeServer("return") end)
    returning=false
    if not alive then return end
    returnButton.Text="Return to last beacon"
    if not ok then notify("Connection interrupted. Try again.","error")
    elseif result.accepted then closePanel();if result.state then apply(result.state) end
    else notify(result.message or "Could not return yet","error") end
end)

local loading=false
local function connect()
    if loading then return end
    loading=true;retry.Visible=false;begin.Text="Opening your journey…";begin.Active=false
    local folder=Storage:WaitForChild("LumenJourney",12)
    if not folder then loading=false;menuNote.Text="The island server has not started. Your work has not been changed.";retry.Visible=true;return end
    request=folder:WaitForChild("Request",5)
    local event=folder:WaitForChild("Changed",5)
    world=workspace:WaitForChild("LumenIsles",5)
    if not request or not event or not world then loading=false;menuNote.Text="The island is still loading. Retry when it is ready.";retry.Visible=true;return end
    if not subscribed then
        subscribed=true
        listen(event.OnClientEvent,function(payload) if type(payload)=="table" then apply(payload.state,payload.message,payload.kind) end end)
    end
    local ok,result=pcall(function() return request:InvokeServer("state") end)
    loading=false
    if not alive then return end
    if ok then apply(result) else menuNote.Text="The connection was interrupted. Retry safely.";retry.Visible=true end
end
listen(retry.Activated,connect)

local function resize()
    -- Use this ScreenGui's inset-aware canvas, not the camera's differently inset viewport.
    local viewport=gui.AbsoluteSize
    local width,height=viewport.X,viewport.Y
    if width <= 0 or height <= 0 then return end
    menuScale.Scale=math.min(1,math.max(0.48,(width-46)/430),math.max(0.45,(height-60)/550))
    menu.Position=width<650 and UDim2.fromOffset(23,22) or UDim2.fromScale(0.065,0.17)
    modal.Size=UDim2.fromOffset(math.min(660,width-28),math.min(550,height-24))
    modalTitle.TextSize=width<500 and 19 or 25
    journalScroll.Size=UDim2.new(1,-40,1,width<500 and -195 or -170)
    returnButton.Size=UDim2.new(width<500 and 1 or 0,width<500 and -48 or 250,0,44)
    returnButton.Position=UDim2.new(0,24,1,-62)
    totalNote.Position=width<500 and UDim2.new(0,24,1,-99) or UDim2.new(0.5,0,1,-62)
    totalNote.Size=width<500 and UDim2.new(1,-48,0,30) or UDim2.new(0.5,-26,0,34)
    totalNote.TextXAlignment=width<500 and Enum.TextXAlignment.Left or Enum.TextXAlignment.Right
    settings.Size=UDim2.fromOffset(math.min(500,width-28),math.min(370,height-24))
    settingsTitle.TextSize=width<500 and 19 or 22
    if height<400 then
        settingsTitle.Position=UDim2.fromOffset(20,8);settingsTitle.Size=UDim2.new(1,-40,0,34)
        motion.Position=UDim2.fromOffset(20,48);motion.Size=UDim2.new(1,-40,0,44)
        settings.Instructions.Position=UDim2.fromOffset(22,97);settings.Instructions.Size=UDim2.new(1,-44,0,84);settings.Instructions.TextSize=12
        settingsClose.Position=UDim2.new(0,20,1,-59);settingsClose.Size=UDim2.new(1,-40,0,44)
    else
        settingsTitle.Position=UDim2.fromOffset(24,20);settingsTitle.Size=UDim2.new(1,-48,0,60)
        motion.Position=UDim2.fromOffset(24,100);motion.Size=UDim2.new(1,-48,0,48)
        settings.Instructions.Position=UDim2.fromOffset(26,162);settings.Instructions.Size=UDim2.new(1,-52,0,107);settings.Instructions.TextSize=14
        settingsClose.Position=UDim2.new(0,24,1,-73);settingsClose.Size=UDim2.new(1,-48,0,48)
    end
    completion.Size=UDim2.fromOffset(math.min(530,width-28),math.min(350,height-24))
    completion.Heading.TextSize=width<500 and 29 or 38
    explore.Size=UDim2.new(1,-48,0,48);explore.Position=UDim2.new(0,24,1,-72)
    local narrow=width<650
    journey.Position=UDim2.fromOffset(narrow and 12 or 22,12)
    journey.Size=UDim2.fromOffset(narrow and math.min(238,width-134) or 296,104)
    objective.Size=UDim2.new(1,-34,0,31);objective.TextSize=narrow and 14 or 16
    for i=1,3 do beaconDots[i].Position=UDim2.new(1,-81+(i-1)*23,0,72) end
    purse.Position=UDim2.new(1,narrow and -110 or -210,0,12)
    purse.Size=UDim2.fromOffset(narrow and 98 or 188,72)
    purse.Shard.Visible=not narrow;purse.Currency.Position=UDim2.fromOffset(narrow and 10 or 57,12);purse.Currency.Size=UDim2.new(1,narrow and -16 or -61,0,18);purse.Currency.TextSize=narrow and 8 or 10
    available.Position=UDim2.fromOffset(narrow and 10 or 57,30);collected.Visible=not narrow
    zone.Visible=not narrow
    bottom.Position=UDim2.new(1,-282,1,Input.TouchEnabled and -145 or -78)
    saveBacking.Size=UDim2.fromOffset(math.min(355,width-28),38);saveBacking.Position=UDim2.new(0,14,1,-52)
    toast.Size=UDim2.new(0,math.min(420,width-30),0,64);toast.Position=UDim2.new(0.5,-math.min(420,width-30)/2,1,Input.TouchEnabled and -224 or -153)
end
listen(gui:GetPropertyChangedSignal("AbsoluteSize"),resize);resize()
local time=0
listen(RunService.RenderStepped,function(dt)
    if not alive then return end
    time+=dt
    if not started then
        camera.CameraType=Enum.CameraType.Scriptable
        camera.CFrame=reduced and menuCamera or CFrame.lookAt(Vector3.new(128+math.sin(time*0.07)*4,101,136),Vector3.new(5,23,-47))
    end
    if world and not reduced then
        for _,target in ipairs(world.Targets:GetChildren()) do
            if target:GetAttribute("CollectibleId") and target.LocalTransparencyModifier<1 then
                local origin=target:GetAttribute("LumenOrigin")
                if not origin then origin=target.Position;target:SetAttribute("LumenOrigin",origin) end
                target.CFrame=CFrame.new(origin+Vector3.new(0,math.sin(time*1.6+origin.X)*0.25,0))*CFrame.Angles(0,time*0.6,math.pi/4)
            end
        end
    end
    local root=player.Character and player.Character:FindFirstChild("HumanoidRootPart")
    if root and started then
        local p=root.Position
        zone.Text=p.X>55 and "ORCHARD SANCTUARY" or p.Z< -72 and (p.X< -22 and "CLOUDREST SUMMIT" or "TIDEGLASS CROSSING") or p.Z< -30 and "THE OLD LIGHTHOUSE" or "HARBOUR MEADOW"
    end
end)
listen(gui.Destroying,function()
    alive=false;Context:UnbindAction("LumenMenu");Context:UnbindAction("LumenPanel")
    for _,c in ipairs(connections) do c:Disconnect() end
    if camera.CameraType==Enum.CameraType.Scriptable then camera.CameraType=Enum.CameraType.Custom end
end)
task.spawn(connect)
