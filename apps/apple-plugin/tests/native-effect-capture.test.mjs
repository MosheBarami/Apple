import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PRELUDE} from './studio-mock.mjs';
const commands=readFileSync(new URL('../src/Commands.luau',import.meta.url),'utf8');
const render=readFileSync(new URL('../src/Render.luau',import.meta.url),'utf8');
test('transparent anchors and Beams can return native viewport pixels without manufactured software views',()=>{
 const dir=mkdtempSync(join(tmpdir(),'native-effect-capture-'));
 try{
  const file=join(dir,'test.luau');
  writeFileSync(file,PRELUDE+'\nlocal Render=(function()\n'+render+'\nend)()\nlocal Commands=(function()\n'+commands+'\nend)()\n'+String.raw`
local waterfall=Instance.new("Model");waterfall.Name="Waterfall";waterfall.Parent=game:GetService("Workspace")
for _,name in {"Source","Plunge"} do local p=Instance.new("Part");p.Name=name;p.Transparency=1;p.Parent=waterfall end
for _=1,2 do local b=Instance.new("Beam");b.Name="Water";b.Enabled=true;b.Parent=waterfall end
local native={calls=0}
function native:capture(w,h) self.calls+=1;return {rgbBase64="iVBORw0KGgo=",encoding="png",source="studio_viewport",width=w,height=h,capturedAt=1} end
local c=Commands.new({game=game,render=Render,capture=native})
local r=c:execute("beam",{op="render_view",target="game.Workspace.Waterfall",view="all"},false)
assert(r.ok,tostring(r.error));assert(#r.data.views==0,"Beam pixels must never be claimed as software views")
assert(r.data.studioViewport.source=="studio_viewport" and r.data.studioViewport.subject=="game.Workspace")
assert(r.data.targetFramed==false and r.data.softwareRenderError,"native active camera is not target framing")
local denied=Commands.new({game=game,render=Render,capture={capture=function()return nil,"screenshot permission denied"end}})
local refusal=denied:execute("denied",{op="render_view",target="game.Workspace.Waterfall"},false)
assert(not refusal.ok and string.find(refusal.error,"permission denied",1,true),"actual permission boundary must survive")
local screenshot=Commands.new({game=game,render={capture=function()error("software renderer must not run")end},capture=native})
local shot=screenshot:execute("shot",{op="capture_studio_viewport"},false)
assert(shot.ok,tostring(shot.error));assert(shot.data.encoding=="png" and shot.data.targetFramed==false)
assert(shot.data.source=="studio_viewport" and shot.data.subject=="game.Workspace")
print("native effect capture passed")
`);
  assert.match(execFileSync('luau',[file],{encoding:'utf8',stdio:'pipe'}),/native effect capture passed/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
