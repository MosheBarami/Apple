import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PRELUDE} from './studio-mock.mjs';
const commands=readFileSync(new URL('../src/Commands.luau',import.meta.url),'utf8');
const owner=readFileSync(new URL('../src/ops/OwnerCorpus.luau',import.meta.url),'utf8');
const SPEC=String.raw`
local fetches, loads = 0, 0
local ended = false
local source = "error('DOWNLOADED SOURCE MUST NOT EXECUTE')\nreturn 123\n"
local lastRoot = nil
local http = {
 RequestAsync = function(_, request)
  fetches += 1
  assert(request.Url == "https://studpilot.app/api/owner-corpus/content/" .. string.rep("b",64))
  return { Success = true, Body = "verified mock envelope" }
 end,
 JSONDecode = function() return { componentSha256 = string.rep("a",64), byteLength = 8, rbxmBase64 = "PHJvYmxveCE=" } end,
}
local serializer = { DeserializeInstancesAsync = function(_, value)
 loads += 1
 assert(buffer.tostring(value) == "<roblox!")
 local root=Instance.new("Model"); root.Name="NativeRoot"
 local mesh=Instance.new("MeshPart"); mesh.Name="Mesh"; mesh.MeshId="original-readonly-mesh-id"; mesh.Parent=root
 local ref=Instance.new("ObjectValue"); ref.Name="Ref"; ref.Value=mesh; ref.Parent=root
 local code=Instance.new("ModuleScript"); code.Name="Code"; code.Source=source; code:SetAttribute("OriginalAttribute",42); code.Parent=root
 local script=Instance.new("Script"); script.Name="Executable"; script.Source=source; script.Parent=root
 lastRoot=root
 if ended then ended=false; return {root} end
 return {root}
 end }
local c=Commands.new({game=game,services={HttpService=http,SerializationService=serializer},opFamilies=OP_FAMILIES_UNDER_TEST})
local op={op="import_owner_component",componentId="owner:fixture",componentSha256=string.rep("a",64),contentToken=string.rep("b",64),byteLength=8,parent="game.ServerStorage",name="ImportedOwnerComponent"}
local function current() return true end
local capability=nil
for _, item in Commands.capabilities(c).operations do if item.op == "import_owner_component" then capability=item end end
assert(capability and capability.status == "supported","the bundled native import handler is not offered")
local denied=c:execute("deny",op,false,current)
assert(denied.ok == false and fetches == 0 and loads == 0,"edit consent was bypassed")
local noFence=c:execute("nofence",op,true)
assert(noFence.ok == false and fetches == 0,"live pairing fence is required before fetching private bytes")
local stale=c:execute("stale",op,true,function() return false end)
assert(stale.ok == false and fetches == 0,"stale consent was bypassed")
local ok=c:execute("native",op,true,current)
assert(ok.ok == true,tostring(ok.error))
assert(fetches == 1 and loads == 1,"native bytes did not reach the native deserializer")
local imported=game:GetService("ServerStorage"):FindFirstChild("ImportedOwnerComponent")
assert(imported and imported:FindFirstChild("NativeRoot"),"actual hierarchy was not inserted")
local native=imported:FindFirstChild("NativeRoot")
local mesh,ref,code,executable=native:FindFirstChild("Mesh"),native:FindFirstChild("Ref"),native:FindFirstChild("Code"),native:FindFirstChild("Executable")
assert(mesh.MeshId == "original-readonly-mesh-id","native mesh identity was replaced with handmade geometry")
assert(ref.Value == mesh,"native instance reference was lost")
assert(code.ClassName == "StringValue" and code.Value == source,"exact module source must remain inert data")
assert(code:GetAttribute("OwnerSourceClass") == "ModuleScript" and code:GetAttribute("OriginalAttribute") == 42)
assert(executable.ClassName == "StringValue" and executable.Value == source,"downloaded executable source became live")
for _, node in imported:GetDescendants() do assert(not node:IsA("LuaSourceContainer"),"downloaded script was left executable") end
assert(ok.data.scriptsPreservedAsData == 2 and ok.data.scriptsExecuted == 0)
-- The existing sibling is never overwritten or silently merged.
local conflict=c:execute("conflict",op,true,current)
assert(conflict.ok == false and loads == 1,"existing owner component was overwritten")
op.name="AfterRevocation"
local consentCalls=0
local revoked=c:execute("revoked",op,true,function() consentCalls += 1; return consentCalls < 3 end)
assert(revoked.ok == false,"revocation during yielding deserialization must refuse")
assert(game:GetService("ServerStorage"):FindFirstChild("AfterRevocation") == nil,"revoked import was parented into the place")
assert(lastRoot.Parent == nil,"detached rejected native roots were not cleaned up")
print("owner-corpus native handler boundary passed")
`;
function run(source=owner) {
 const dir=mkdtempSync(join(tmpdir(),'owner-native-op-'));
 const file=join(dir,'test.luau');
 // Real command engine and real family, with only native/HTTP services simulated.
 const families=`local OP_FAMILIES_UNDER_TEST = {(function()\n${source}\nend)()}\n`;
 writeFileSync(file,`${PRELUDE}\n${families}\nlocal Commands=(function()\n${commands}\nend)()\n${SPEC}`);
 try{return{status:0,output:execFileSync('luau',[file],{encoding:'utf8',stdio:'pipe'})};}
 catch(error){return{status:error.status??1,output:String(error.stdout??'')+String(error.stderr??'')};}
 finally{rmSync(dir,{recursive:true,force:true});}
}
test('native owner component handler preserves mesh/reference identity and exact inert source behind consent',()=>{
 const result=run();assert.equal(result.status,0,result.output);
});
test('the executed guard fails if downloaded scripts stop being neutralized',()=>{
 const anchor='if node:IsA("LuaSourceContainer") then';
 assert.equal(owner.split(anchor).length-1,1);
 const result=run(owner.replace(anchor,'if false then'));
 assert.notEqual(result.status,0,'leaving unknown script instances executable stayed green');
 assert.match(result.output,/exact module source must remain inert data|downloaded executable source became live/);
});
