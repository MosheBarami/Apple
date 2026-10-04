import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PRELUDE} from './studio-mock.mjs';
const commands=readFileSync(new URL('../src/Commands.luau',import.meta.url),'utf8');
const family=readFileSync(new URL('../src/ops/LocalOwnerCorpus.luau',import.meta.url),'utf8');
const bytes='<roblox!fixture-library-data',hex=createHash('sha256').update(bytes).digest('hex'),job='d'.repeat(64);
const luaBytes=v=>'"'+[...createHash('sha256').update(v).digest()].map(byte=>'\\'+String(byte).padStart(3,'0')).join('')+'"';
const SPEC=`
local bytesValue,expected,jobId = "${bytes}","${hex}","${job}"
local tamper,keyless,serverGone,loads=false,true,false,0
local urls={}
local encodeReal,withData=false,false
local http={UrlEncode=function(_,text) if not encodeReal then return text end return (string.gsub(text,"[^%w%-_.~]",function(ch) return string.format("%%%02X",string.byte(ch)) end)) end,JSONEncode=function()return "{}" end}
function http:RequestAsync(request)
 table.insert(urls,request.Url)
 assert(string.sub(request.Url,1,#"http://127.0.0.1:63747/v1/library")=="http://127.0.0.1:63747/v1/library",request.Url)
 if keyless then assert(request.Headers.Authorization==nil,"library must not need the pasted key") end
 if serverGone then error("connection refused") end
 return {Success=not string.find(request.Url,"missing",1,true),StatusCode=404,Body=request.Url}
end
function http:JSONDecode(url)
 if string.find(url,"missing",1,true) then return {error="path not found: /Nope"} end
 if string.find(url,"/v1/library/extract",1,true) and string.find(url,"emptylight",1,true) then
  return {jobId=jobId,bytes=9,sha256=expected,instances=0,scripts=0,roots=0,suspicious={},serviceProperties={Brightness=5}}
 end
 if string.find(url,"/v1/library/extract",1,true) then
  return {jobId=jobId,bytes=#bytesValue,sha256=expected,instances=4,scripts=1,roots=2,game="Farm Game",
   suspicious={{path="Workspace.Evil",pattern="loadstring"}},serviceProperties=string.find(url,"Lighting",1,true) and {Brightness=3,GlobalShadows=false,Ambient={r=10,g=20,b=30}} or nil}
 end
 if string.find(url,"/v1/library/artifact",1,true) then
  return {kind="owner-library-rbxm",encoding="base64",data="encoded",offset=0,totalBytes=#bytesValue,nextOffset=nil,sha256=expected,chunkSha256=tamper and string.rep("f",64) or expected,execution="never"}
 end
 if string.find(url,"/v1/library/deps",1,true) then
  return {path="/StarterGui/ShopGui",needs={{path="/ReplicatedStorage/BuyItem",parent="game.ReplicatedStorage",mode="self",instances=1,why="the shop buttons fire the BuyItem remote"}},usedBy={}}
 end
 if string.find(url,"/v1/library/install",1,true) then
  return {game="abcdef012345",name="Daily Reward",kind="system-pack",steps={{path="/ServerScriptService/DailyReward",mode="self",parent="game.ServerScriptService",what="the daily reward script"}},skipped={},works="yes"}
 end
 if string.find(url,"/v1/library/game",1,true) then
  local children={}; for i=1,80 do children[i]={name="C"..i,class="Model",instances=1,scripts=0} end
  return {id="abcdef012345",name="Farm Game",place=true,services={Workspace={instances=80,scripts=0,children=children}}}
 end
 return {total=1,items={{id="abcdef012345",name="Farm Game"}},nextAfter=nil}
end
local encoding={Base64Decode=function()return buffer.fromstring(bytesValue) end,ComputeBufferHash=function(_,value) return buffer.fromstring(${luaBytes(bytes)}) end}
local locked=false
local serializer={DeserializeInstancesAsync=function(_,value)
 loads += 1
 local model=Instance.new("Model");model.Name="Barn"
 local script=Instance.new("Script");script.Name="Milk";script.Parent=model
 local other=Instance.new("Folder");other.Name="Fences"
 if locked then
  -- a root that refuses attributes, as some engine-owned instances do
  local base=getmetatable(model)
  setmetatable(model,{__index=function(self,key) if key=="SetAttribute" then return function() error("attributes refused") end end return base.__index(self,key) end,__newindex=base.__newindex})
 end
 if withData then
  local studio=Instance.new("ModuleScript");studio.Name="AppleStudioData"
  return {model,other,studio}
 end
 return {model,other}
end}
local function current()return true end
local c=Commands.new({game=game,services={HttpService=http,EncodingService=encoding,SerializationService=serializer},enum={HashAlgorithm={Sha256=4},FinishRecordingOperation={Commit="Commit",Cancel="Cancel"}},opFamilies=FAMILIES})
Color3.fromRGB=function(r,g,b) return {__type="Color3",R=r/255,G=g/255,B=b/255} end
local listed=c:execute("list",{op="query_owner_library",action="list",q="farm",limit=5},false,current)
assert(listed.ok==true,listed.error)
assert(string.find(urls[#urls],"q=farm",1,true) and string.find(urls[#urls],"limit=5",1,true),urls[#urls])
local assetsList=c:execute("assets",{op="query_owner_library",action="list",kind="ui",q="shop",game="abcdef012345",limit=5},false,current)
assert(assetsList.ok==true,assetsList.error)
assert(string.find(urls[#urls],"/v1/library/assets?",1,true) and string.find(urls[#urls],"kind=ui",1,true) and string.find(urls[#urls],"game=abcdef012345",1,true),urls[#urls])
assert(c:execute("badkind",{op="query_owner_library",action="list",kind="ui\\n"},false,current).ok==false,"control characters reached the gateway")
local game1=c:execute("game",{op="query_owner_library",action="game",id="abcdef012345"},false,current)
assert(game1.ok==true and #game1.data.services.Workspace.children==60 and game1.data.services.Workspace.childrenTotal==80)
assert(c:execute("badid",{op="query_owner_library",action="game",id="../etc"},false,current).ok==false)
local deps=c:execute("deps",{op="query_owner_library",action="deps",gameId="abcdef012345",path="/StarterGui/Shop Gui"},false,current)
assert(deps.ok==true,deps.error)
assert(urls[#urls]=="http://127.0.0.1:63747/v1/library/deps?id=abcdef012345&path=/StarterGui/Shop Gui",urls[#urls])
assert(deps.data.needs[1].path=="/ReplicatedStorage/BuyItem" and deps.data.needs[1].why=="the shop buttons fire the BuyItem remote" and #deps.data.usedBy==0 and deps.data.sourceExecuted==false,"deps must pass the gateway answer through")
local asked=#urls
for _,bad in {{gameId="../etc",path="/StarterGui"},{gameId="abcdef012345",path="StarterGui"},{gameId="abcdef012345",path="/Start\\nGui"},{gameId="abcdef012345",path="/"..string.rep("a",1024)},{gameId="abcdef012345"},{path="/StarterGui"},{gameId="abc",path="/StarterGui"}} do
 bad.op,bad.action="query_owner_library","deps"
 assert(c:execute("baddeps",bad,false,current).ok==false,"invalid deps request reached the gateway")
end
assert(#urls==asked,"an invalid deps request was sent to the gateway")
assert(c:execute("staledeps",{op="query_owner_library",action="deps",gameId="abcdef012345",path="/StarterGui"},false,function()return false end).ok==false and #urls==asked,"retired pairing read deps")
local depsMissing=c:execute("depsmissing",{op="query_owner_library",action="deps",gameId="abcdef012345",path="/missing"},false,current)
assert(depsMissing.ok==false and string.find(depsMissing.error,"path not found",1,true),depsMissing.error)
local function routeOp(route,params) return {op="query_owner_library",action="route",route=route,params=params} end
local install=c:execute("install",routeOp("install",{id="abcdef012345"}),false,current)
assert(install.ok==true,install.error)
assert(urls[#urls]=="http://127.0.0.1:63747/v1/library/install?id=abcdef012345",urls[#urls])
assert(install.data.kind=="system-pack" and install.data.steps[1].parent=="game.ServerScriptService" and install.data.works=="yes" and install.data.sourceExecuted==false,"route must pass the gateway answer through")
assert(c:execute("systems",routeOp("systems"),false,current).ok==true and urls[#urls]=="http://127.0.0.1:63747/v1/library/systems","no params means no query string")
assert(c:execute("systems2",routeOp("systems",{}),false,current).ok==true and urls[#urls]=="http://127.0.0.1:63747/v1/library/systems","empty params means no query string")
assert(c:execute("blueprint",routeOp("blueprint",{theme="candy land",seed=7,niche="brainrot",limit=2.5}),false,current).ok==true)
assert(urls[#urls]=="http://127.0.0.1:63747/v1/library/blueprint?limit=2.5&niche=brainrot&seed=7&theme=candy land","params must be sorted so one request is one URL: "..urls[#urls])
assert(c:execute("design",routeOp("design",{request="a garden game with a candy theme",theme="candy",features="pets, shop",seed=3}),false,current).ok==true)
assert(urls[#urls]=="http://127.0.0.1:63747/v1/library/design?features=pets, shop&request=a garden game with a candy theme&seed=3&theme=candy","the design route takes the request, theme, features and seed as sorted params: "..urls[#urls])
assert(c:execute("find",routeOp("find",{q="a pink treadmill",type="model",limit=12}),false,current).ok==true)
assert(urls[#urls]=="http://127.0.0.1:63747/v1/library/find?limit=12&q=a pink treadmill&type=model","the find route takes the user's whole request as q, with sorted params: "..urls[#urls])
for _,name in {"deps","install","systems","blueprint","family","report","media","design","find"} do
 assert(c:execute("allowed",routeOp(name,{id="abcdef012345"}),false,current).ok==true and string.find(urls[#urls],"/v1/library/"..name.."?id=abcdef012345",1,true),"route "..name.." must be forwarded")
end
encodeReal=true
assert(c:execute("encoded",routeOp("systems",{q="a&b=c d/\\195\\169#"}),false,current).ok==true)
encodeReal=false
assert(urls[#urls]=="http://127.0.0.1:63747/v1/library/systems?q=a%26b%3Dc%20d%2F%C3%A9%23","param values must be URL-encoded: "..urls[#urls])
local twelve,thirteen={},{}
for i=1,13 do thirteen["k"..i]="v"; if i<=12 then twelve["k"..i]=i end end
twelve.k1=string.rep("a",200)
assert(c:execute("twelve",routeOp("systems",twelve),false,current).ok==true,"12 params of up to 200 characters must be allowed")
local routeAsked=#urls
local badRoutes={routeOp(nil,{}),routeOp("nope",{}),routeOp("Install",{}),routeOp("../game",{}),routeOp("install?id=1",{}),routeOp("extract",{id="abcdef012345"}),routeOp("artifact",{}),routeOp("assets",{}),routeOp("game",{id="abcdef012345"}),routeOp(5,{})}
for index,bad in badRoutes do assert(c:execute("badroute"..index,bad,false,current).ok==false,"a route outside the allowlist reached the gateway") end
local badParams={"id=1",{"x"},{["a-b"]="x"},{["1a"]="x"},{[""]="x"},{["id&x"]="y"},{id=true},{id={}},{id=string.rep("a",201)},{id="a\\nb"},{id=0/0},{id=math.huge},{id=-math.huge},thirteen}
for index,bad in badParams do assert(c:execute("badparams"..index,routeOp("install",bad),false,current).ok==false,"invalid route params reached the gateway (case "..index..")") end
assert(#urls==routeAsked,"an invalid route request was sent to the gateway")
assert(c:execute("stalefence",routeOp("install",{id="abcdef012345"}),false,function()return false end).ok==false and #urls==routeAsked,"retired pairing read a route")
local routeMissing=c:execute("routemissing",routeOp("family",{id="missing"}),false,current)
assert(routeMissing.ok==false and string.find(routeMissing.error,"path not found",1,true),routeMissing.error)
assert(c:execute("badaction",{op="query_owner_library",action="nope"},false,current).ok==false)
assert(c:execute("stale",{op="query_owner_library",action="list"},false,function()return false end).ok==false,"retired pairing read the library")
local op={op="import_owner_library",gameId="abcdef012345",path="/Workspace",mode="children",parent="Workspace"}
assert(c:execute("denied",op,false,current).ok==false and loads==0,"inspect-only library insertion bypass")
assert(c:execute("nofence",op,true).ok==false and loads==0,"missing paired fence bypass")
tamper=true
assert(c:execute("tamper",op,true,current).ok==false and loads==0,"tampered chunk reached the deserializer")
tamper=false
local missing=c:execute("missing",{op="import_owner_library",gameId="abcdef012345",path="/missing",mode="self",parent="Workspace"},true,current)
assert(missing.ok==false and string.find(missing.error,"path not found",1,true),missing.error)
local good=c:execute("good",op,true,current)
assert(good.ok==true,good.error)
assert(good.data.roots==2 and good.data.scripts==1 and good.data.instances==3 and #good.data.suspicious==1 and good.data.suspicious[1].pattern=="loadstring")
local barn=game:GetService("Workspace"):FindFirstChild("Barn")
assert(barn and barn:FindFirstChild("Milk"),"roots must land directly in the target with scripts intact")
assert(game:GetService("Workspace"):FindFirstChild("Fences")~=nil and good.data.inserted[1]=="game.Workspace.Barn")
local fences=game:GetService("Workspace"):FindFirstChild("Fences")
assert(barn:GetAttribute("AppleLibraryGame")=="abcdef012345" and barn:GetAttribute("AppleLibraryPath")=="/Workspace","every inserted root is tagged with its game and path")
assert(fences:GetAttribute("AppleLibraryGame")=="abcdef012345" and fences:GetAttribute("AppleLibraryPath")=="/Workspace")
assert(barn:FindFirstChild("Milk"):GetAttribute("AppleLibraryGame")==nil,"only roots are tagged, not their descendants")
local again=c:execute("again",op,true,current)
assert(again.ok==true and again.data.inserted[1]=="game.Workspace[\\"Barn (2)\\"]" and #again.data.renamed==2,"a second import of the same part must stay addressable")
assert(game:GetService("Workspace"):FindFirstChild("Barn (2)"):FindFirstChild("Milk") and game:GetService("Workspace"):FindFirstChild("Fences (2)"))
local missingOnly=c:execute("onlyMissing",{op="import_owner_library",gameId="abcdef012345",path="/Workspace",mode="children",parent="Workspace",onlyMissing=true},true,current)
assert(missingOnly.ok==true and missingOnly.data.skipped==2 and game:GetService("Workspace"):FindFirstChild("Barn (3)")==nil,"onlyMissing must keep what the place has")
local light=c:execute("light",{op="import_owner_library",gameId="abcdef012345",path="/Lighting",mode="children",parent="game.Lighting",applyServiceProperties=true},true,current)
assert(light.ok==true,light.error)
local lighting=game:GetService("Lighting")
assert(lighting.Brightness==3 and lighting.GlobalShadows==false and lighting.Ambient.R==10/255,"service properties not applied")
assert(#light.data.serviceApplied==3)
local before=loads
local empty=c:execute("empty",{op="import_owner_library",gameId="abcdef012345",path="/emptylight",mode="children",parent="Lighting",applyServiceProperties=true},true,current)
assert(empty.ok==true and empty.data.roots==0 and loads==before and lighting.Brightness==5,"properties-only path must apply without fetching")
local scripts=c:execute("scripts",{op="import_owner_library",gameId="abcdef012345",path="/StarterPlayer/StarterPlayerScripts",mode="children",parent="StarterPlayer.StarterPlayerScripts"},true,current)
assert(scripts.ok==true,scripts.error)
local ws=game:GetService("Workspace")
local template=Instance.new("Part");template.Name="Baseplate";template.Parent=ws
local replaced=c:execute("replace",{op="import_owner_library",gameId="abcdef012345",path="/Workspace",mode="children",parent="Workspace",replace=true},true,current)
assert(replaced.ok==true,replaced.error)
assert(ws:FindFirstChild("Baseplate")==nil and replaced.data.removed==5,"replace must clear the slot's earlier content")
assert(ws:FindFirstChild("Barn") and ws:FindFirstChild("Fences") and ws:FindFirstChild("Terrain") and ws:FindFirstChild("Camera"),"replace keeps Terrain and Camera")
locked=true
local tagged=c:execute("tagged",{op="import_owner_library",gameId=string.rep("ab",32),path="/Workspace/Farm",mode="self",parent="ReplicatedStorage"},true,current)
locked=false
assert(tagged.ok==true,tagged.error)
local rs=game:GetService("ReplicatedStorage")
assert(rs:FindFirstChild("Barn"):GetAttribute("AppleLibraryGame")==nil,"a root that refuses attributes stays untagged and the import still lands")
assert(rs:FindFirstChild("Fences"):GetAttribute("AppleLibraryGame")==string.rep("ab",6) and rs:FindFirstChild("Fences"):GetAttribute("AppleLibraryPath")=="/Workspace/Farm","a long game id is cut to 12 hex")
local terrainKids=c:execute("terrain",{op="import_owner_library",gameId="abcdef012345",path="/Workspace/Terrain",mode="children",parent="Workspace.Terrain"},true,current)
assert(terrainKids.ok==true and ws.Terrain:FindFirstChild("Barn"),"Terrain must take the original's children")
assert(c:execute("outside",{op="import_owner_library",gameId="abcdef012345",path="/Workspace",mode="children",parent="Players"},true,current).ok==false)
local function lastExtract() for i=#urls,1,-1 do if string.find(urls[i],"/v1/library/extract",1,true) then return urls[i] end end end
local function countNamed(name) local n=0; for _,d in game:GetDescendants() do if d.Name==name then n+=1 end end; return n end
assert(c:execute("plainflag",{op="import_owner_library",gameId="abcdef012345",path="/Workspace/Farm",mode="self",parent="ReplicatedStorage"},true,current).ok==true)
assert(lastExtract()=="http://127.0.0.1:63747/v1/library/extract?id=abcdef012345&path=/Workspace/Farm&mode=self","studioData is opt-in: "..lastExtract())
withData=true
local studioOp={op="import_owner_library",gameId="abcdef012345",path="/Workspace/Farm",mode="self",parent="ReplicatedStorage",studioData=true}
local studioFirst=c:execute("studio1",studioOp,true,current)
assert(studioFirst.ok==true,studioFirst.error)
assert(lastExtract()=="http://127.0.0.1:63747/v1/library/extract?id=abcdef012345&path=/Workspace/Farm&mode=self&studio=1","studioData must reach the extract URL: "..lastExtract())
local studioModule=rs:FindFirstChild("AppleStudioData")
assert(studioModule and studioModule.ClassName=="ModuleScript" and studioFirst.data.roots==3 and studioFirst.data.skipped==nil and #studioFirst.data.inserted==3,"the first AppleStudioData goes in like any root")
studioOp.parent="Workspace"
local studioSecond=c:execute("studio2",studioOp,true,current)
assert(studioSecond.ok==true and studioSecond.data.roots==3 and studioSecond.data.skipped==1 and #studioSecond.data.inserted==2,"a second AppleStudioData is dropped and reported as skipped")
assert(ws:FindFirstChild("AppleStudioData")==nil and countNamed("AppleStudioData")==1,"a second AppleStudioData must not be inserted")
studioModule:Destroy()
local deepFolder=Instance.new("Folder");deepFolder.Name="Systems";deepFolder.Parent=game:GetService("ServerScriptService")
local deepModule=Instance.new("ModuleScript");deepModule.Name="AppleStudioData";deepModule.Parent=deepFolder
studioOp.parent="ReplicatedStorage"
local studioDeep=c:execute("studio3",studioOp,true,current)
assert(studioDeep.ok==true and studioDeep.data.skipped==1 and rs:FindFirstChild("AppleStudioData")==nil and countNamed("AppleStudioData")==1,"an AppleStudioData anywhere in the place counts, not only one in the target")
deepModule:Destroy()
local oldModule=Instance.new("ModuleScript");oldModule.Name="AppleStudioData";oldModule.Parent=rs
studioOp.replace=true
local studioReplace=c:execute("studio4",studioOp,true,current)
studioOp.replace=nil
local newModule=rs:FindFirstChild("AppleStudioData")
assert(studioReplace.ok==true and studioReplace.data.skipped==nil and newModule and newModule~=oldModule and countNamed("AppleStudioData")==1,"a replaced slot loses its AppleStudioData first, so the new one goes in and the place is never left without one")
withData=false
serverGone=true
local down=c:execute("down",op,true,current)
assert(down.ok==false and string.find(down.error,"not reachable",1,true),down.error)
print("owner library boundary passed")
`;
function run(source=family) {
 const dir=mkdtempSync(join(tmpdir(),'owner-library-op-')),file=join(dir,'test.luau');
 writeFileSync(file,`${PRELUDE}\nlocal FAMILIES={(function()\n${source}\nend)()}\nlocal Commands=(function()\n${commands}\nend)()\n${SPEC}`);
 try{return {status:0,output:execFileSync('luau',[file],{encoding:'utf8',stdio:'pipe'})};}
 catch(error){return {status:error.status??1,output:String(error.stdout??'')+String(error.stderr??'')};}
 finally{rmSync(dir,{recursive:true,force:true});}
}
test('owner library ops read and import with scripts, no pasted key, consent fence and verified bytes',()=>{
 const result=run();assert.equal(result.status,0,result.output);assert.match(result.output,/owner library boundary passed/);
});
test('library chunk integrity proof fails if hash checking is removed',()=>{
 const anchor=' or hash(chunk) ~= part.chunkSha256';
 assert.equal(family.split(anchor).length-1,2);
 const result=run(family.replace(anchor,'').replace(anchor,''));assert.notEqual(result.status,0);assert.match(result.output,/tampered chunk reached the deserializer/);
});
test('library tagging and deps proofs fail if the tags or the deps action are removed',()=>{
 const tag='\t\t\t\troot:SetAttribute("AppleLibraryGame", string.sub(op.gameId, 1, 12))\n';
 assert.equal(family.split(tag).length-1,1);
 const untagged=run(family.replace(tag,''));assert.notEqual(untagged.status,0);assert.match(untagged.output,/every inserted root is tagged/);
 const deps='elseif op.action == "deps" then';
 assert.equal(family.split(deps).length-1,1);
 const noDeps=run(family.replace(deps,'elseif false then'));assert.notEqual(noDeps.status,0);assert.match(noDeps.output,/action must be list, game, deps or route/);
});
test('library route and studio data proofs fail if the allowlist, param bounds, studio flag or the duplicate skip are removed',()=>{
 const cases=[
  ['LIBRARY_ROUTES[op.route] ~= true','false',/a route outside the allowlist reached the gateway/],
  ['if #names >= 12 then','if false then',/invalid route params reached the gateway \(case 14\)/],
  ['string.match(key, "^[a-zA-Z][a-zA-Z0-9]*$") == nil','false',/invalid route params reached the gateway/],
  ['elseif libraryText(value, 200) then','elseif type(value) == "string" then',/invalid route params reached the gateway/],
  ['op.studioData == true then "&studio=1"','false then "&studio=1"',/studioData must reach the extract URL/],
  ['if duplicateStudioData or (','if (',/a second AppleStudioData is dropped/],
  ['self.game:FindFirstChild("AppleStudioData", true)','self.game:FindFirstChild("AppleStudioData")',/a second AppleStudioData is dropped/]
 ];
 for(const [anchor,replacement,expected] of cases){
  assert.equal(family.split(anchor).length-1,1,anchor);
  const broken=run(family.replace(anchor,replacement));
  assert.notEqual(broken.status,0,anchor);assert.match(broken.output,expected,anchor);
 }
});
