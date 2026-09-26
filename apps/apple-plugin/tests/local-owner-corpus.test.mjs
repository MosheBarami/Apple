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
const id='a'.repeat(64)+':42',child='a'.repeat(64)+':43',job='b'.repeat(64),bytes='<roblox!fixture-native-data';
const code="error('DOWNLOADED_INERT')\nreturn 42";
const digest=v=>createHash('sha256').update(v).digest();
const hex=v=>digest(v).toString('hex');
const luaBytes=v=> '"'+[...v].map(byte=>'\\'+String(byte).padStart(3,'0')).join('')+'"';
const SPEC=`
local id,childId,jobId = "${id}","${child}","${job}"
local nativeBytes = "${bytes}"
local codeBytes = ${JSON.stringify(code)}
local expectedHash = "${hex(bytes)}"
local hashes = {[nativeBytes]=${luaBytes(digest(bytes))},[id]=${luaBytes(digest(id))},[childId]=${luaBytes(digest(child))},[codeBytes]=${luaBytes(digest(code))}}
local requests,loads = 0,0
local revoked,tamper,residue=false,false,false
local rootClass="Model"
local config={port=63747,key=string.rep("k",43)}
local http={UrlEncode=function(_,text) return text end,JSONEncode=function()return "{}" end}
function http:RequestAsync(request)
 requests += 1
 assert(string.sub(request.Url,1,#"http://127.0.0.1:63747/v1")=="http://127.0.0.1:63747/v1",request.Url)
 assert(request.Headers.Authorization=="Bearer "..string.rep("k",43))
 return {Success=true,Body=request.Url}
end
function http:JSONDecode(url)
 if string.find(url,"/v1/record?",1,true) then return {kind="inert-script",encoding="base64",data="code",offset=0,totalBytes=#codeBytes,nextOffset=nil,sha256="${hex(code)}",chunkSha256="${hex(code)}",execution="never"} end
 if string.find(url,"/v1/job?",1,true) then return {status="ready",jobId=jobId,nodeId=id,nativeSha256=expectedHash,nativeBytes=#nativeBytes,nativeInstances=2,policy="owner-loopback-scriptfree-v1",nativeScripts=0} end
 if string.find(url,"/v1/artifact?",1,true) then
  if revoked then config=nil end
  return {kind="script-free-native-rbxm",encoding="base64",data="encoded",offset=0,totalBytes=#nativeBytes,nextOffset=nil,sha256=expectedHash,chunkSha256=tamper and string.rep("f",64) or expectedHash,execution="never"}
 end
 if string.find(url,"/v1/native-map?",1,true) then return {items={{node_id=id,class=rootClass,nativeChildIndices={0},namespace="R${hex(id)}"},{node_id=childId,class="MeshPart",nativeChildIndices={0,0},namespace="R${hex(child)}"}},nextAfter=nil} end
 if string.find(url,"/v1/search?",1,true) then return {items={{id=id,name="Waterfall",source={path="/private/DO_NOT_EXPOSE"}}},nextAfter=id} end
 error("unexpected gateway request")
end
local encoding={Base64Decode=function(_,value)return buffer.fromstring(buffer.tostring(value)=="code" and codeBytes or nativeBytes) end,ComputeBufferHash=function(_,value) return buffer.fromstring(assert(hashes[buffer.tostring(value)])) end}
local lastRoot
local serializer={DeserializeInstancesAsync=function(_,value)
 loads += 1
 assert(buffer.tostring(value)==nativeBytes)
 local root=Instance.new(rootClass);root.Name="Native";if rootClass=="Frame" then root.Visible=false end
 local child=Instance.new(residue and "ModuleScript" or "MeshPart");child.Name="Original";child.MeshId="actual-original-mesh";child.Parent=root
 lastRoot=root;return {root}
end}
local function current()return true end
local c=Commands.new({game=game,services={HttpService=http,EncodingService=encoding,SerializationService=serializer},enum={HashAlgorithm={Sha256=4},FinishRecordingOperation={Commit="Commit",Cancel="Cancel"}},opFamilies=FAMILIES,ownerGateway=function()return config end})
local read={op="query_owner_local",action="search",query="Waterfall",limit=5}
local result=c:execute("read",read,false,current)
assert(result.ok==true,result.error)
assert(result.data.items[1].source==nil,"private filesystem metadata escaped")
local sourceRead=c:execute("source",{op="query_owner_local",action="record",id=id,kind="script",offset=0,limit=3000},false,current)
assert(sourceRead.ok==true and sourceRead.data.text==codeBytes,"exact source is not readable by the agent")
assert(sourceRead.data.untrustedData==true and sourceRead.data.execution=="never")
local before=requests
assert(c:execute("stale",read,false,function()return false end).ok==false and requests==before,"retired pairing fetched local data")
local op={op="import_owner_local",nodeId=id,jobId=jobId,nativeSha256=expectedHash,byteLength=#nativeBytes,nativeInstances=2,parent="game.ServerStorage"}
assert(c:execute("denied",op,false,current).ok==false and loads==0,"inspect-only native insertion bypass")
assert(c:execute("nofence",op,true).ok==false and loads==0,"missing paired fence bypass")
tamper=true
assert(c:execute("tamper",op,true,current).ok==false and loads==0,"tampered chunk reached native deserializer")
tamper=false;revoked=true
assert(c:execute("revoked",op,true,current).ok==false and loads==0,"rotated/disconnected gateway imported bytes")
revoked=false;config={port=63747,key=string.rep("k",43)};residue=true
assert(c:execute("residue",op,true,current).ok==false,"executable residue became live")
assert(lastRoot.Parent==nil,"rejected native roots not cleaned")
residue=false
local good=c:execute("good",op,true,current)
assert(good.ok==true,good.error)
local inserted=game:GetService("ServerStorage"):FindFirstChild("Native"):FindFirstChild("Native")
assert(inserted and inserted:GetAttribute("AppleOwnerNodeId")==id,"global native identity missing")
local mesh=inserted:FindFirstChild("Original")
assert(mesh.MeshId=="actual-original-mesh" and mesh:GetAttribute("AppleOwnerNodeId")==childId)
assert(good.data.instances==2 and good.data.scriptsExecuted==0 and good.data.visualVerified==false)
assert(good.data.roots[1].path=="game.ServerStorage.Native.Native" and good.data.roots[1].sourceNodeId==id,"native root selector unavailable")
rootClass="Frame";op.parent="game.StarterGui"
local frameOnly=c:execute("frameOnly",op,true,current)
assert(frameOnly.ok==true and frameOnly.data.roots[1].uiMount=="requires_gui_host","bare Frame insertion must not claim mounted UI")
local exactFrame=game:GetService("StarterGui"):FindFirstChild("Native"):FindFirstChild("Native")
assert(exactFrame.Visible==false,"authored visibility was changed for preview")
local host=Instance.new("ScreenGui");host.Name="ExistingGui";host.Parent=game:GetService("StarterGui")
op.parent="game.StarterGui.ExistingGui"
local hosted=c:execute("hosted",op,true,current)
assert(hosted.ok==true and hosted.data.roots[1].uiMount=="gui_host_present")
assert(hosted.data.visualVerified==false,"GUI host is not rendered-pixel verification")
print("executed local owner bridge boundary passed")
`;
function run(source=family) {
 const dir=mkdtempSync(join(tmpdir(),'owner-local-op-')),file=join(dir,'test.luau');
 const families=source?`{(function()\n${source}\nend)()}`:'{}';
 writeFileSync(file,`${PRELUDE}\nlocal FAMILIES=${families}\nlocal Commands=(function()\n${commands}\nend)()\n${SPEC}`);
 try{return {status:0,output:execFileSync('luau',[file],{encoding:'utf8',stdio:'pipe'})};}
 catch(error){return {status:error.status??1,output:String(error.stdout??'')+String(error.stderr??'')};}
 finally{rmSync(dir,{recursive:true,force:true});}
}
test('executed plugin loopback boundary verifies exact bytes, inert admission, native map and live consent',()=>{
 const result=run();assert.equal(result.status,0,result.output);
});
test('prior build without the local family cannot pass this real insertion proof',()=>{
 const result=run('');assert.notEqual(result.status,0);assert.match(result.output,/unknown Studio operation/);
});
test('chunk integrity proof fails if hash checking is removed',()=>{
 const anchor=' or hash(chunk) ~= part.chunkSha256';
 assert.ok(family.includes(anchor));const result=run(family.replace(anchor,''));assert.notEqual(result.status,0);assert.match(result.output,/tampered chunk reached native deserializer/);
});
