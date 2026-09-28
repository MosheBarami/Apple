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
local hashes = {["{}"]= ${luaBytes(digest("{}"))},[nativeBytes]=${luaBytes(digest(bytes))},[id]=${luaBytes(digest(id))},[childId]=${luaBytes(digest(child))},[codeBytes]=${luaBytes(digest(code))}}
local requests,loads = 0,0
local revoked,tamper,residue=false,false,false
local rootClass="Model"
local originalRevoke=false
local flatReadiness=false
local config={port=63747,key=string.rep("k",43)}
local http={UrlEncode=function(_,text) return text end,JSONEncode=function()return "{}" end}
function http:RequestAsync(request)
 requests += 1
 assert(string.sub(request.Url,1,#"http://127.0.0.1:63747/v1")=="http://127.0.0.1:63747/v1",request.Url)
 assert(request.Headers.Authorization=="Bearer "..string.rep("k",43))
 return {Success=true,Body=request.Url}
end
function http:JSONDecode(url)
 if string.find(url,"/v1/media?",1,true) or string.find(url,"/v1/assembly-code?",1,true) then
  if originalRevoke then config=nil end
  return {encoding="base64",data="code",offset=0,totalBytes=#codeBytes,sha256="${hex(code)}",chunkSha256=tamper and string.rep("f",64) or "${hex(code)}",execution="never"}
 end
 if string.find(url,"/v1/assembly?",1,true) then return {sources={{name="owner",sourceSHA=string.sub(id,1,64)}},keyFile="/PRIVATE",normalizedNodeMappingProved=false} end
 if string.find(url,"/v1/exact-sources?",1,true) then return {items={{sourceSHA=string.sub(id,1,64),status="complete",stringValues=9,endpoint="http://127.0.0.1/PRIVATE",reason="/PRIVATE",normalizedNodeMappingProved=false}},nextAfter=string.sub(id,1,64)} end
 if string.find(url,"/v1/exact-strings?",1,true) then return {status="complete",items={{seq=17,identity=string.sub(id,1,64)..":binary:42",sourceSHA=string.sub(id,1,64),rawReferent=42,property="Source",rawSHA="${hex(code)}",bytes=#codeBytes,casPath="/PRIVATE/objects/code"}},nextAfter=18} end
 if string.find(url,"/v1/exact-string?",1,true) then
  if originalRevoke then config=nil end
  return {rawSHA="${hex(code)}",totalBytes=#codeBytes,offset=0,bytes=#codeBytes,chunkSHA=tamper and string.rep("f",64) or "${hex(code)}",rawBase64="code",sourceExecuted=false}
 end
 if string.find(url,"/v1/sources?",1,true) then return {items={{id=string.sub(id,1,64),path="/PRIVATE/nonseed.rbxl",status="indexed",keyFile="/SECRET"}},nextAfter=string.sub(id,1,64)} end
 if string.find(url,"/v1/health?",1,true) then return {ok=true,sourceStatuses={indexed=438},bind="127.0.0.1",cache="/PRIVATE"} end
 if string.find(url,"/v1/describe?",1,true) then return {id=id,source={path="/PRIVATE",exactStrings={status="complete",stringValues=9,endpoint="/PRIVATE",normalizedNodeMappingProved=false}}} end
 if string.find(url,"/v1/record?",1,true) then return {kind="inert-script",encoding="base64",data="code",offset=0,totalBytes=#codeBytes,nextOffset=nil,sha256="${hex(code)}",chunkSha256="${hex(code)}",execution="never"} end
 if string.find(url,"/v1/job?",1,true) then return {status="ready",jobId=jobId,nodeId=id,nativeSha256=expectedHash,nativeBytes=#nativeBytes,nativeInstances=2,policy="owner-loopback-scriptfree-v1",nativeScripts=0} end
 if string.find(url,"/v1/artifact?",1,true) then
  if revoked then config=nil end
  return {kind="script-free-native-rbxm",encoding="base64",data="encoded",offset=0,totalBytes=#nativeBytes,nextOffset=nil,sha256=expectedHash,chunkSha256=tamper and string.rep("f",64) or expectedHash,execution="never"}
 end
 if string.find(url,"/v1/native-map?",1,true) then return {items={{node_id=id,class=rootClass,nativeChildIndices={0},namespace="R${hex(id)}"},{node_id=childId,class="MeshPart",nativeChildIndices={0,0},namespace="R${hex(child)}"}},nextAfter=nil} end
 if string.find(url,"/v1/native-readiness?",1,true) then
  -- Row values from the live gateway receipt docs/evidence/owner-corpus-20260926/native-readiness-live-gateway-proof.json.
  assert(string.find(url,"after=10",1,true) and string.find(url,"limit=2",1,true) and string.find(url,"query=Jailbreak",1,true),url)
  local source="b0faf9f831669d2d52e07cda08a2f8737d10c6f81f94bea57765be6769451267"
  local row={sourceSHA256=source,chunkId="chunk-00023",id="owner-xml:"..source..":chunk-00023",artifactSHA256="d4046d36a86fea67815bd8627cc4e2bbb12d0b0a02dd114a3d53c364257a0b87",
   artifactBytes=51205,nativeInstances=2875,sourceName="Jailbreak (Beta).rbxlx",readiness={offlineNativeArtifact=true,realStudioInsertion=true,
   visualEvidenceCaptured=true,visualInspection=false,gameplayVerified=false,commercialReadiness=false}}
  if flatReadiness then for key,flag in row.readiness do row[key]=flag end; row.readiness=nil end
  return {schema="apple.owner-corpus.native-readiness-page.v1",after=10,limit=2,nextAfter=11,totalArtifacts=203,matchingPreservedArtifacts=230,rows={row},sourceExecuted=false,assemblyPerformed=false,keyFile="/PRIVATE"}
 end
 if string.find(url,"/v1/search?",1,true) then return {items={{id=id,name="Waterfall",source={path="/private/DO_NOT_EXPOSE"}}},nextAfter=id} end
 error("unexpected gateway request")
end
local encoding={Base64Encode=function(_,value) assert(buffer.tostring(value)=="{}");return buffer.fromstring("context") end,Base64Decode=function(_,value)return buffer.fromstring(buffer.tostring(value)=="context" and "{}" or (buffer.tostring(value)=="code" and codeBytes or nativeBytes)) end,ComputeBufferHash=function(_,value) return buffer.fromstring(assert(hashes[buffer.tostring(value)])) end}
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
local catalog=c:execute("catalog",{op="query_owner_local",action="sources",after=string.sub(id,1,64),limit=2},false,current)
assert(catalog.ok==true,catalog.error)
assert(catalog.data.items[1].name=="nonseed.rbxl" and catalog.data.items[1].id==string.sub(id,1,64))
assert(catalog.data.items[1].path==nil and catalog.data.items[1].keyFile==nil,"source filesystem/secret leaked")
local health=c:execute("health",{op="query_owner_local",action="health"},false,current)
assert(health.ok and health.data.sourceStatuses.indexed==438 and health.data.bind==nil and health.data.cache==nil)
local scoped=c:execute("scoped",{op="query_owner_local",action="search",query="Waterfall",sourceSHA=string.sub(id,1,64)},false,current)
assert(scoped.ok==true)
local badCursor=c:execute("badcursor",{op="query_owner_local",action="sources",after=id},false,current)
assert(badCursor.ok==false)
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
local sourceSHA=string.sub(id,1,64)
local listed=c:execute("exactSources",{op="query_owner_exact",action="sources",limit=5},false,current)
assert(listed.ok==true,listed.error)
assert(listed.data.items[1].sourceSHA==sourceSHA and listed.data.items[1].endpoint==nil and listed.data.items[1].reason==nil,"private source metadata leaked")
local originals=c:execute("exactStrings",{op="query_owner_exact",action="strings",sourceSHA=sourceSHA,after=17,limit=5},false,current)
assert(originals.ok==true and originals.data.items[1].identity==sourceSHA..":binary:42" and originals.data.items[1].casPath==nil)
assert(originals.data.normalizedNodeMappingProved==false and originals.data.nextAfter==18)
local originalOp={op="query_owner_exact",action="string",sourceSHA=sourceSHA,identity=sourceSHA..":binary:42",seq=17,offset=0,limit=3000}
local original=c:execute("exactCode",originalOp,false,current)
assert(original.ok==true,original.error)
assert(original.data.text==codeBytes and original.data.sourceExecuted==false and original.data.normalizedNodeMappingProved==false,"original code is not readable inert data")
tamper=true
assert(c:execute("exactTamper",originalOp,false,current).ok==false,"tampered original bytes admitted")
tamper=false;originalRevoke=true
assert(c:execute("exactRetired",originalOp,false,current).ok==false,"retired exact session disclosed source")
originalRevoke=false;config={port=63747,key=string.rep("k",43)}
local beforeExact=requests
assert(c:execute("exactNoFence",originalOp,false).ok==false and requests==beforeExact)
originalOp.identity=id
assert(c:execute("exactWrongNamespace",originalOp,false,current).ok==false and requests==beforeExact)
local described=c:execute("description",{op="query_owner_local",action="describe",id=id},false,current)
assert(described.ok==true and described.data.source.exactStrings.status=="complete" and described.data.source.path==nil and described.data.source.exactStrings.endpoint==nil,"exact availability metadata lost or private data leaked")
local assemblyOp={op="query_owner_assembly",action="code",sourceSHA=sourceSHA,codeSHA="${hex(code)}",offset=0,limit=3000}
local assembled=c:execute("assemblyCode",assemblyOp,false,current)
assert(assembled.ok==true and assembled.data.text==codeBytes and assembled.data.execution=="never","assembly original bytes not readable")
local contextRecord=c:execute("assemblyRecord",{op="query_owner_assembly",action="record",sourceSHA=sourceSHA,offset=0,limit=3000},false,current)
assert(contextRecord.ok==true and contextRecord.data.text=="{}" and contextRecord.data.totalBytes==2 and contextRecord.data.nextOffset==nil and contextRecord.data.execution=="never","full assembly context record not readable or cursor invalid")
local mediaOp={op="query_owner_media",id=id,property="TextureContent",offset=0,limit=3000}
assert(c:execute("ownerMedia",mediaOp,false,current).ok==true,"actual media bytes unavailable")
tamper=true
assert(c:execute("mediaTamper",mediaOp,false,current).ok==false,"tampered owner media admitted")
assert(c:execute("assemblyTamper",assemblyOp,false,current).ok==false,"tampered assembly source admitted")
tamper=false;originalRevoke=true
assert(c:execute("assemblyRetired",assemblyOp,false,current).ok==false,"retired assembly session admitted")
originalRevoke=false;config={port=63747,key=string.rep("k",43)}
local beforeEvidence=requests
assert(c:execute("mediaNoFence",mediaOp,false).ok==false and requests==beforeEvidence,"missing owner fence reached media HTTP")
mediaOp.id=sourceSHA..":binary:42"
assert(c:execute("mediaBinary",mediaOp,false,current).ok==false and requests==beforeEvidence,"binary referent consumed as normalized media")
local assemblyList=c:execute("assemblyList",{op="query_owner_assembly",action="recipes",limit=1},false,current)
assert(assemblyList.ok==true and assemblyList.data.keyFile==nil,"local key/path metadata leaked")
local readinessOp={op="query_owner_local",action="native-readiness",after=10,limit=2,query="Jailbreak"}
local ready=c:execute("readiness",readinessOp,false,current)
assert(ready.ok==true,ready.error)
local readyRow=ready.data.rows[1]
assert(ready.data.totalArtifacts==203 and ready.data.nextAfter==11 and ready.data.keyFile==nil and readyRow.readiness.realStudioInsertion==true
 and readyRow.readiness.commercialReadiness==false and readyRow.artifactBytes==51205,"nested gateway rows[].readiness not consumed")
flatReadiness=true
assert(c:execute("flatReadiness",readinessOp,false,current).ok==false,"flat readiness flags admitted without rows[].readiness")
flatReadiness=false
local beforeReadiness=requests
assert(c:execute("readinessCursor",{op="query_owner_local",action="native-readiness",after=-1},false,current).ok==false and requests==beforeReadiness,"negative readiness cursor reached gateway")
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

test('original binary chunk integrity proof fails when its hash guard is disabled',()=>{
 const anchor='if hash ~= raw.chunkSHA or (offset==0 and raw.nextOffset==nil and hash ~= raw.rawSHA) then';
 assert.equal(family.split(anchor).length-1,1);
 const result=run(family.replace(anchor,'if false then'));assert.notEqual(result.status,0);assert.match(result.output,/tampered original bytes admitted/);
});

test('new media/assembly byte checks are behaviorally falsified when disabled',()=>{
 const anchor='if hash~=raw.chunkSha256 or offset==0 and raw.nextOffset==nil and hash~=raw.sha256 then';assert.ok(family.includes(anchor));const result=run(family.replace(anchor,'if false then'));assert.notEqual(result.status,0);assert.match(result.output,/tampered owner media admitted/);
});

test('whole catalogue proof fails when the source-page route is absent',()=>{
 const anchor='sources="/v1/sources",';assert.equal(family.split(anchor).length-1,1);
 const result=run(family.replace(anchor,''));assert.notEqual(result.status,0);assert.match(result.output,/unsupported local query/);
});

test('native-readiness consumer fails if it reads flat flags instead of rows[].readiness (2026-09-27 mismatch)',()=>{
 const anchor='if type(row.readiness[key]) ~= "boolean" then return nil end';assert.equal(family.split(anchor).length-1,1);
 const result=run(family.replace(anchor,'if type(row[key]) ~= "boolean" then return nil end'));assert.notEqual(result.status,0);assert.match(result.output,/native-readiness page failed its rows\[\]\.readiness contract/);
});

test('native-readiness proof fails when the route is absent',()=>{
 const anchor='["native-readiness"]="/v1/native-readiness"';assert.equal(family.split(anchor).length-1,1);
 const result=run(family.replace(anchor,''));assert.notEqual(result.status,0);assert.match(result.output,/unsupported local query/);
});
