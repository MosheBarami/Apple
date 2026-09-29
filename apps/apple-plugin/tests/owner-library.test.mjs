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
local http={UrlEncode=function(_,text) return text end,JSONEncode=function()return "{}" end}
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
 if string.find(url,"/v1/library/game",1,true) then
  local children={}; for i=1,80 do children[i]={name="C"..i,class="Model",instances=1,scripts=0} end
  return {id="abcdef012345",name="Farm Game",place=true,services={Workspace={instances=80,scripts=0,children=children}}}
 end
 return {total=1,items={{id="abcdef012345",name="Farm Game"}},nextAfter=nil}
end
local encoding={Base64Decode=function()return buffer.fromstring(bytesValue) end,ComputeBufferHash=function(_,value) return buffer.fromstring(${luaBytes(bytes)}) end}
local serializer={DeserializeInstancesAsync=function(_,value)
 loads += 1
 local model=Instance.new("Model");model.Name="Barn"
 local script=Instance.new("Script");script.Name="Milk";script.Parent=model
 local other=Instance.new("Folder");other.Name="Fences"
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
local again=c:execute("again",op,true,current)
assert(again.ok==true and again.data.inserted[1]=="game.Workspace[\\"Barn (2)\\"]" and #again.data.renamed==2,"a second import of the same part must stay addressable")
assert(game:GetService("Workspace"):FindFirstChild("Barn (2)"):FindFirstChild("Milk") and game:GetService("Workspace"):FindFirstChild("Fences (2)"))
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
local terrainKids=c:execute("terrain",{op="import_owner_library",gameId="abcdef012345",path="/Workspace/Terrain",mode="children",parent="Workspace.Terrain"},true,current)
assert(terrainKids.ok==true and ws.Terrain:FindFirstChild("Barn"),"Terrain must take the original's children")
assert(c:execute("outside",{op="import_owner_library",gameId="abcdef012345",path="/Workspace",mode="children",parent="Players"},true,current).ok==false)
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
