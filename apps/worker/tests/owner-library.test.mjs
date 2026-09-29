import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const esbuild=await import(process.env.APPLE_TEST_ESBUILD || 'esbuild');
const dir=mkdtempSync(join(tmpdir(),'owner-library-worker-'));
test.after(()=>rmSync(dir,{recursive:true,force:true}));
await esbuild.build({entryPoints:['src/tools.ts'],bundle:true,format:'esm',platform:'node',outfile:join(dir,'tools.mjs'),alias:{'@golem/shared':'../../packages/shared/src/index.ts'}});
const T=await import(pathToFileURL(join(dir,'tools.mjs')).href);
const id='abcdef012345';
const GAME={id,name:'Farm Game',place:true,terrain:true,lighting:{Brightness:2},services:{
  Workspace:{instances:50,scripts:0,children:[]},ReplicatedStorage:{instances:4,scripts:2,children:[]},ServerScriptService:{instances:3,scripts:3,children:[]},
  Lighting:{instances:0,scripts:0,children:[]},SoundService:{instances:0,scripts:0,children:[]},
  StarterPlayer:{instances:2,scripts:2,children:[{name:'StarterPlayerScripts',class:'StarterPlayerScripts',instances:2,scripts:2},{name:'StarterCharacterScripts',class:'StarterCharacterScripts',instances:0,scripts:0}]}}};
function ctx(game,failAt){
  const calls=[];
  return {calls,env:{},userId:'owner',studioConnected:()=>true,createCheckpoint:async()=>({id:'cp'}),
    execStudioOp:async op=>{
      calls.push(op);
      if(op.op==='query_owner_library')return {ok:true,data:game};
      if(op.path===failAt)return {ok:false,error:'path not found: '+op.path};
      return {ok:true,data:{inserted:['x'],roots:2,instances:10,scripts:1,suspicious:op.path==='/ServerScriptService'?[{path:'ServerScriptService.Loader',pattern:'loadstring'}]:[],serviceApplied:op.applyServiceProperties?['Brightness']:[]}};
    }};
}
async function run(c,name,args){const out=await T.runTool(c,name,JSON.stringify(args));return {out,data:JSON.parse(out.resultForLlm)};}

test('recreate_owner_game imports every slot the game has, in order, into the same service',async()=>{
  const c=ctx(GAME);
  const {out,data}=await run(c,'recreate_owner_game',{gameId:id});
  assert.equal(out.ok,true);assert.equal(out.mutatedProject,true);
  const imports=c.calls.filter(o=>o.op==='import_owner_library');
  assert.deepEqual(imports.map(o=>[o.path,o.parent,o.mode,o.applyServiceProperties]),[
    ['/Lighting','game.Lighting','children',true],
    ['/ReplicatedStorage','game.ReplicatedStorage','children',false],
    ['/ServerScriptService','game.ServerScriptService','children',false],
    ['/StarterPlayer/StarterPlayerScripts','game.StarterPlayer.StarterPlayerScripts','children',false],
    ['/Workspace','game.Workspace','children',true]]);
  assert.equal(c.calls[0].op,'query_owner_library');assert.equal(c.calls[0].action,'game');
  assert.deepEqual(data.totals,{roots:10,instances:50,scripts:5});
  assert.equal(data.terrain,'not copied');
  assert.deepEqual(data.suspicious,[{slot:'/ServerScriptService',path:'ServerScriptService.Loader',pattern:'loadstring'}]);
});

test('a model-style file imports its loose top level into Workspace',async()=>{
  const c=ctx({id,name:'Tree Model',place:false,services:{Model:{instances:9,scripts:1,children:[]}}});
  const {out}=await run(c,'recreate_owner_game',{gameId:id});
  assert.equal(out.ok,true);
  const imports=c.calls.filter(o=>o.op==='import_owner_library');
  assert.deepEqual(imports.map(o=>[o.path,o.parent,o.mode]),[['/','game.Workspace','children']]);
});

test('recreate stops at the first hard failure and reports what was already imported',async()=>{
  const c=ctx(GAME,'/ServerScriptService');
  const {out,data}=await run(c,'recreate_owner_game',{gameId:id});
  assert.equal(out.ok,false);assert.equal(out.mutatedProject,true);
  assert.match(data.error,/stopped at \/ServerScriptService/);assert.equal(data.slots.length,2);
  assert.deepEqual(c.calls.filter(o=>o.op==='import_owner_library').map(o=>o.path),['/Lighting','/ReplicatedStorage','/ServerScriptService']);
});

test('import_owner_library defaults the parent from the path and refuses malformed input before Studio',async()=>{
  const c=ctx(GAME);
  for(const [args,parent,apply] of [
    [{path:'/StarterPlayer/StarterPlayerScripts',mode:'children'},'game.StarterPlayer.StarterPlayerScripts',false],
    [{path:'/Lighting',mode:'children'},'game.Lighting',true],
    [{path:'/Workspace/Farm',mode:'self'},'game.Workspace',false],
    [{path:'/ServerStorage/Tools',mode:'self'},'game.ServerStorage',false],
    [{path:'/Workspace/Farm',mode:'children',parent:'game.ServerStorage'},'game.ServerStorage',false]]) {
    c.calls.length=0;
    const {out}=await run(c,'import_owner_library',{gameId:id,...args});
    assert.equal(out.ok,true);assert.equal(c.calls[0].parent,parent);assert.equal(c.calls[0].applyServiceProperties,apply);
  }
  c.calls.length=0;
  for(const args of [{gameId:'../x',path:'/Workspace',mode:'children'},{gameId:id,path:'Workspace',mode:'children'},{gameId:id,path:'/Workspace',mode:'all'}]) {
    assert.equal((await run(c,'import_owner_library',args)).out.ok,false);
  }
  assert.equal(c.calls.length,0);
});

test('browse_owner_library lists without an id and reads one game with an id',async()=>{
  const c=ctx({total:1,items:[{id,name:'Farm Game'}],nextAfter:null});
  const list=await run(c,'browse_owner_library',{q:'farm',niche:'tycoon'});
  assert.equal(list.out.ok,true);assert.deepEqual([c.calls[0].action,c.calls[0].q,c.calls[0].niche],['list','farm','tycoon']);
  const one=await run(c,'browse_owner_library',{id});
  assert.equal(c.calls[1].action,'game');assert.equal(c.calls[1].id,id);assert.equal(one.out.ok,true);
  assert.equal((await run(c,'browse_owner_library',{id:'nothex!'})).out.ok,false);
});
