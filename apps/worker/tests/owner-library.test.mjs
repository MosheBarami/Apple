import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const esbuild=await import(process.env.STUDPILOT_TEST_ESBUILD || 'esbuild');
const dir=mkdtempSync(join(tmpdir(),'owner-library-worker-'));
test.after(()=>rmSync(dir,{recursive:true,force:true}));
await esbuild.build({entryPoints:['src/tools.ts'],bundle:true,format:'esm',platform:'node',outfile:join(dir,'tools.mjs'),alias:{'@studpilot/shared':'../../packages/shared/src/index.ts'}});
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
  assert.deepEqual(imports.map(o=>[o.path,o.parent,o.mode,o.applyServiceProperties,o.replace]),[
    ['/Lighting','game.Lighting','children',true,true],
    ['/ReplicatedStorage','game.ReplicatedStorage','children',false,true],
    ['/ServerScriptService','game.ServerScriptService','children',false,true],
    ['/StarterPlayer/StarterPlayerScripts','game.StarterPlayer.StarterPlayerScripts','children',false,true],
    ['/Workspace','game.Workspace','children',true,true],
    ['/MaterialService','game.MaterialService','children',false,undefined],
    ['/Workspace/Terrain','game.Workspace.Terrain','children',false,undefined]]);
  assert.equal(c.calls[0].op,'query_owner_library');assert.equal(c.calls[0].action,'game');
  assert.deepEqual(data.totals,{roots:10,instances:50,scripts:5});
  assert.equal(data.terrainChildren,2);assert.equal(data.terrain,'voxels not copied');
  // Studded games draw their studs from MaterialVariants the parts name; the place's own same-named ones are kept.
  assert.equal(imports.find(o=>o.path==='/MaterialService').onlyMissing,true);assert.equal(data.materialVariants,2);
  assert.deepEqual(data.suspicious,[{slot:'/ServerScriptService',path:'ServerScriptService.Loader',pattern:'loadstring'}]);
});

test('a model-style file imports its loose top level into Workspace',async()=>{
  const c=ctx({id,name:'Tree Model',place:false,services:{Model:{instances:9,scripts:1,children:[]}}});
  const {out}=await run(c,'recreate_owner_game',{gameId:id});
  assert.equal(out.ok,true);
  const imports=c.calls.filter(o=>o.op==='import_owner_library');
  assert.deepEqual(imports.map(o=>[o.path,o.parent,o.mode]),[['/','game.Workspace','children'],['/MaterialService','game.MaterialService','children']]);
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

test('browse_owner_library with kind searches single assets across the library and says how to import them',async()=>{
  const c=ctx({total:1,items:[{gameId:id,kind:'ui',name:'Shop',path:'/StarterGui/Shop'}]});
  const {out,data}=await run(c,'browse_owner_library',{kind:'ui',q:'shop',game:id});
  assert.equal(out.ok,true);
  assert.deepEqual([c.calls[0].action,c.calls[0].kind,c.calls[0].q,c.calls[0].game],['list','ui','shop',id]);
  assert.match(data.note,/import_owner_library \{gameId, path, mode:"self"\}/);
  assert.match(data.note,/a map: path "\/Workspace", mode "children"/);
  for(const kind of ['model','fx','sound','animation','tool','script','map'])assert.equal((await run(ctx({items:[]}),'browse_owner_library',{kind})).out.ok,true);
  const bad=await run(ctx({}),'browse_owner_library',{kind:'texture'});
  assert.match(bad.data.error ?? '',/kind must be one of|must be equal to one of/);
  const badGame=await run(ctx({}),'browse_owner_library',{kind:'ui',game:'nothex!'});
  assert.match(badGame.data.error,/game must be a library game id/);
});

test('browse_owner_library mode find hands the whole request to the classified library and the answer back as it is',async()=>{
  const answer={q:'a pink treadmill',total_matches:4,top_score:1.4,no_strong_match:false,items:[{id:'df437f576e48',gameId:id,path:'/Treadmills/x15 Treadmill',kind:'model',className:'Model',name:'x15 Treadmill',description:'pink medium machine'}]};
  const c=ctx(answer);
  const {out,data}=await run(c,'browse_owner_library',{mode:'find',q:'  a pink   treadmill ',colour:'pink',type:'model',size:'medium',min_quality:50,limit:30});
  assert.equal(out.ok,true);
  assert.deepEqual(c.calls[0],{op:'query_owner_library',action:'route',route:'find',params:{q:'a pink treadmill',type:'model',colour:'pink',size:'medium',min_quality:50,limit:12}});
  assert.equal(data.items[0].gameId,id);assert.equal(data.no_strong_match,false);assert.equal(data.untrustedData,true);
  assert.match(data.note,/import_owner_library \{gameId, path, mode:"self"\}/);
  assert.match(data.note,/no_strong_match true means nothing covers the request well/);
  for(const bad of [{mode:'find'},{mode:'find',q:'   '},{mode:'find',q:'x',type:'spaceship'},{mode:'find',q:'x',size:'gigantic'},{mode:'find',q:'x',min_quality:101},{mode:'find',q:'x',min_quality:2.5}]){
    const r=await run(ctx({}),'browse_owner_library',bad);
    assert.equal(r.out.ok,false,JSON.stringify(bad));
  }
  assert.equal((await run(ctx({}),'browse_owner_library',{mode:'list',q:'x'})).out.ok,false,'only find is a mode');
  // without the mode the tool is exactly what it was
  const plain=ctx({total:0,items:[]});await run(plain,'browse_owner_library',{q:'farm'});assert.equal(plain.calls[0].action,'list');
  // a plugin that does not know the route says so, and nothing is made up
  const old=ctx({});old.execStudioOp=async()=>({ok:false,error:'route must be deps, install, systems, blueprint, family, report, media or design'});
  assert.equal((await run(old,'browse_owner_library',{mode:'find',q:'chair'})).out.ok,false);
});

test('import_owner_library still imports into a place Studio cannot checkpoint, but refuses when the snapshot itself fails',async()=>{
  const c=ctx(GAME);
  c.createCheckpoint=async()=>({error:'Checkpoint was not saved: this project holds more objects than one checkpoint can carry — Studio stopped early (120000 objects).'});
  const {out,data}=await run(c,'import_owner_library',{gameId:id,path:'/StarterGui/Inventory',mode:'self'});
  assert.equal(out.ok,true);assert.match(data.checkpoint,/Studio undo/);
  assert.deepEqual(c.calls.filter(o=>o.op==='import_owner_library').map(o=>o.path),['/StarterGui/Inventory','/MaterialService']);
  const none=ctx(GAME,'/MaterialService');
  assert.equal((await run(none,'import_owner_library',{gameId:id,path:'/StarterGui/Inventory',mode:'self'})).data.materialVariants,0,'a game without MaterialService still imports');
  // Live 2026-09-29: an imported shop GUI held morph clothing a snapshot cannot capture; the agent began deleting it.
  const u=ctx(GAME);
  u.createCheckpoint=async()=>({error:'Checkpoint was not saved: Studio read the project but could not capture 1 Pants, 2 HopperBin, so a restore would not put it back as it is.'});
  assert.equal((await run(u,'import_owner_library',{gameId:id,path:'/StarterGui/Inventory',mode:'self'})).out.ok,true);
  const d=ctx(GAME);
  d.createCheckpoint=async()=>({error:'snapshot failed'});
  const refused=await run(d,'import_owner_library',{gameId:id,path:'/StarterGui/Inventory',mode:'self'});
  assert.equal(refused.out.ok,false);assert.match(refused.data.error,/could not save a copy of the place/);
  assert.equal(d.calls.filter(o=>o.op==='import_owner_library').length,0);
});

// A library asset copied alone lacks what it talks to. Live 2026-09-29: an imported shop screen had buttons that did nothing
// because its remotes, modules and server scripts stayed behind. A single asset now brings them, once, bounded.
function withDeps(deps,extra={}){
  const c=ctx(GAME);
  const inner=c.execStudioOp;
  const seen=new Set();
  c.onceInRun=key=>!seen.has(key)&&!!seen.add(key);
  c.execStudioOp=async op=>{
    if(op.op==='query_owner_library'&&op.action==='deps'){c.calls.push(op);return typeof deps==='function'?deps(op):{ok:true,data:deps};}
    if(extra.importOf&&op.op==='import_owner_library'){const r=extra.importOf(op);if(r){c.calls.push(op);return r;}}
    return inner(op);
  };
  return c;
}
const SHOP={path:'/StarterGui/ShopGui',parent:'game.StarterGui'};
const dep=(path,parent,why='it needs this')=>({path,parent,mode:'self',instances:2,why});

test('importing one asset also imports what it needs, beside where it belongs, skipping what the place already has',async()=>{
  const c=withDeps({path:SHOP.path,
    needs:[dep('/ReplicatedStorage/Remotes/BuyItem','game.ReplicatedStorage','the shop buttons fire the BuyItem remote'),dep('/ReplicatedStorage/Modules/ShopData','game.ReplicatedStorage')],
    usedBy:[dep('/ServerScriptService/ShopServer','game.ServerScriptService','it answers the shop'),dep('/StarterPlayer/StarterPlayerScripts/ShopController','game.StarterPlayer.StarterPlayerScripts')]},
  {importOf:op=>op.path==='/ReplicatedStorage/Modules/ShopData'?{ok:true,data:{roots:1,skipped:1}}:op.path==='/ServerScriptService/ShopServer'?{ok:false,error:'path not found'}:null});
  const {out,data}=await run(c,'import_owner_library',{gameId:id,path:SHOP.path,mode:'self'});
  assert.equal(out.ok,true);assert.equal(out.mutatedProject,true);
  const imports=c.calls.filter(o=>o.op==='import_owner_library');
  assert.deepEqual(imports.map(o=>[o.path,o.mode,o.parent,o.onlyMissing===true]),[
    [SHOP.path,'self','game.StarterGui',false],['/MaterialService','children','game.MaterialService',true],
    ['/ServerScriptService/ShopServer','self','game.ServerScriptService',true],['/StarterPlayer/StarterPlayerScripts/ShopController','self','game.StarterPlayer.StarterPlayerScripts',true],
    ['/ReplicatedStorage/Remotes/BuyItem','self','game.ReplicatedStorage',true],['/ReplicatedStorage/Modules/ShopData','self','game.ReplicatedStorage',true]]);
  const asked=c.calls.find(o=>o.action==='deps');
  assert.deepEqual([asked.op,asked.gameId,asked.path],['query_owner_library',id,SHOP.path]);
  assert.deepEqual(data.dependencies,[
    {name:'shop server',why:'it answers the shop',added:false}, // could not be added
    {name:'shop controller',why:'it needs this',added:true},
    {name:'buy item',why:'the shop buttons fire the BuyItem remote',added:true},
    {name:'shop data',why:'it needs this',added:false}]);   // the place already had one: skipped
  assert.equal(data.dependenciesLeftOut,undefined);
  assert.doesNotMatch(data.note,/suspicious scripts|backdoor|getfenv/,'the note no longer coaches jargon');
  assert.match(data.note,/plain sentence/);
});

test('dependencies are imported once per run per asset, and never more than 25',async()=>{
  const many=Array.from({length:30},(_,i)=>dep(`/ReplicatedStorage/Piece${i}`,'game.ReplicatedStorage'));
  const c=withDeps({needs:many,usedBy:[dep('/ReplicatedStorage/Piece0','game.ReplicatedStorage'),dep(SHOP.path,'game.StarterGui'),dep('/StarterPlayer/StarterPlayerScripts/ShopController','game.StarterPlayer.StarterPlayerScripts')]});
  const first=await run(c,'import_owner_library',{gameId:id,path:SHOP.path,mode:'self'});
  assert.equal(first.data.dependencies.length,25);assert.equal(first.data.dependenciesLeftOut,6);
  assert.equal(first.data.dependencies[1].name,'shop controller','what drives the asset comes first, so the cap never cuts it');
  assert.equal(c.calls.filter(o=>o.op==='import_owner_library'&&o.onlyMissing===true&&o.mode==='self').length,25);
  c.calls.length=0;
  const again=await run(c,'import_owner_library',{gameId:id,path:SHOP.path,mode:'self'});
  assert.equal(again.out.ok,true);assert.equal(again.data.dependencies,undefined);
  assert.equal(c.calls.filter(o=>o.action==='deps').length,0,'the same asset asked again in one run does not ask again');
  const other=await run(c,'import_owner_library',{gameId:id,path:'/StarterGui/Inventory',mode:'self'});
  assert.equal(c.calls.filter(o=>o.action==='deps').length,1,'another asset does');
  assert.equal(other.out.ok,true);
});

test('without the deps action, or with junk in it, the import is exactly what it was',async()=>{
  for(const deps of [()=>({ok:false,error:'unknown action deps'}),{needs:'x',usedBy:null},{needs:[{path:'ReplicatedStorage/X',parent:'game.ReplicatedStorage'},{path:'/A',parent:'Workspace'},{path:'/B'},null,7]},{}]){
    const c=withDeps(deps);
    const {out,data}=await run(c,'import_owner_library',{gameId:id,path:SHOP.path,mode:'self'});
    assert.equal(out.ok,true);assert.equal(data.dependencies,undefined);
    assert.deepEqual(c.calls.filter(o=>o.op==='import_owner_library').map(o=>o.path),[SHOP.path,'/MaterialService']);
  }
  const plain=ctx(GAME);
  const {out,data}=await run(plain,'import_owner_library',{gameId:id,path:SHOP.path,mode:'self'});
  assert.equal(out.ok,true);assert.equal(data.dependencies,undefined,'a run with no once-per-run memory (the admin route) still imports');
});

test('a map or a whole slot (mode children) never asks for dependencies',async()=>{
  const c=withDeps({needs:[dep('/ReplicatedStorage/X','game.ReplicatedStorage')]});
  await run(c,'import_owner_library',{gameId:id,path:'/Workspace',mode:'children'});
  assert.equal(c.calls.filter(o=>o.action==='deps').length,0);
  const r=withDeps({needs:[dep('/ReplicatedStorage/X','game.ReplicatedStorage')]});
  await run(r,'recreate_owner_game',{gameId:id});
  assert.equal(r.calls.filter(o=>o.action==='deps').length,0);
});

// About a third of real dependencies belong inside a folder the original game had ("game.ReplicatedStorage.Modules.Utility")
// that a fresh place lacks, and an import cannot make its parent: the folders are made, top down, and the import retried once.
function withFolders(deps,have,{createFails=false,readFails=false}={}){
  const c=withDeps(deps);
  const inner=c.execStudioOp;
  const world=new Set(have);
  c.world=world;
  c.execStudioOp=async op=>{
    if(op.op==='import_owner_library'&&op.onlyMissing===true&&op.mode==='self'){
      c.calls.push(op);
      return world.has(op.parent)?{ok:true,data:{roots:1}}:{ok:false,failure:'not_found',error:'instance not found at '+op.parent};
    }
    if(op.op==='get_tree'){c.calls.push(op);return world.has(op.root)?{ok:true,data:{}}:readFails?{ok:false,failure:'internal',error:'boom'}:{ok:false,failure:'not_found',error:'instance not found at '+op.root};}
    if(op.op==='create_instances'){c.calls.push(op);if(createFails)return {ok:false,error:'refused'};for(const i of op.items)world.add(i.parent+'.'+i.name);return {ok:true,data:{}};}
    return inner(op);
  };
  return c;
}

test('a dependency whose folder the place lacks gets the folder made, once, then imports',async()=>{
  const c=withFolders({needs:[dep('/ReplicatedStorage/Modules/Utility/Math','game.ReplicatedStorage.Modules.Utility'),dep('/ReplicatedStorage/Modules/Utility/Signal','game.ReplicatedStorage.Modules.Utility'),dep('/ReplicatedStorage/Remotes/Buy','game.ReplicatedStorage')]},
    ['game.ReplicatedStorage','game.StarterPlayer.StarterPlayerScripts']);
  const {out,data}=await run(c,'import_owner_library',{gameId:id,path:SHOP.path,mode:'self'});
  assert.equal(out.ok,true);
  assert.deepEqual(c.calls.filter(o=>o.op==='create_instances').map(o=>o.items.map(i=>[i.className,i.name,i.parent])),[
    [['Folder','Modules','game.ReplicatedStorage']],[['Folder','Utility','game.ReplicatedStorage.Modules']]]);
  assert.deepEqual(data.dependencies.map(d=>d.added),[true,true,true]);
  assert.equal(c.calls.filter(o=>o.op==='import_owner_library'&&o.path==='/ReplicatedStorage/Modules/Utility/Math').length,2,'refused once, then retried');
  assert.equal(c.calls.filter(o=>o.op==='import_owner_library'&&o.path==='/ReplicatedStorage/Modules/Utility/Signal').length,1,'the second finds the folder made');
});

test('a dependency folder is left alone when Studio cannot say it is missing, and the built-in player script folders are never made',async()=>{
  const dependency=dep('/ReplicatedStorage/Modules/Math','game.ReplicatedStorage.Modules');
  const unreadable=withFolders({needs:[dependency]},['game.ReplicatedStorage'],{readFails:true});
  const a=await run(unreadable,'import_owner_library',{gameId:id,path:SHOP.path,mode:'self'});
  assert.equal(unreadable.calls.filter(o=>o.op==='create_instances').length,0);assert.equal(a.data.dependencies[0].added,false);
  const refused=withFolders({needs:[dependency]},['game.ReplicatedStorage'],{createFails:true});
  const b=await run(refused,'import_owner_library',{gameId:id,path:SHOP.path,mode:'self'});
  assert.equal(b.out.ok,true);assert.equal(b.data.dependencies[0].added,false);
  assert.equal(refused.calls.filter(o=>o.op==='import_owner_library'&&o.path===dependency.path).length,1,'nothing was made, so no retry');
  const scripts=withFolders({needs:[dep('/StarterPlayer/StarterPlayerScripts/Sub/Ctl','game.StarterPlayer.StarterPlayerScripts.Sub')]},['game.StarterPlayer']);
  await run(scripts,'import_owner_library',{gameId:id,path:SHOP.path,mode:'self'});
  assert.deepEqual(scripts.calls.filter(o=>o.op==='create_instances').map(o=>o.items[0].name),['Sub'],'StarterPlayerScripts itself is Studio\'s, never a Folder we make');
});

// An automatic import must hide nothing a manual one would show: a piece brought along with a script that loads code from
// the internet is reported through the same suspicious list as the asset itself.
test('scripts flagged inside an automatically added piece are reported with the asset\'s own', async () => {
  const c=withDeps({needs:[dep('/ServerScriptService/Loader','game.ServerScriptService'),dep('/ReplicatedStorage/Clean','game.ReplicatedStorage')]},{importOf:op=>{
    if(op.path==='/ServerScriptService/Loader')return {ok:true,data:{roots:1,suspicious:[{path:'ServerScriptService.Loader',pattern:'loadstring'}]}};
    if(op.path===SHOP.path)return {ok:true,data:{roots:1,suspicious:[{path:'StarterGui.ShopGui.Buy',pattern:'require(id)'}]}};
    return null;}});
  const {out,data}=await run(c,'import_owner_library',{gameId:id,path:SHOP.path,mode:'self'});
  assert.equal(out.ok,true);
  assert.deepEqual(data.suspicious.map(s=>s.pattern),['require(id)','loadstring']);
  const alone=await run(ctx(GAME),'import_owner_library',{gameId:id,path:SHOP.path,mode:'self'});
  assert.deepEqual(alone.data.suspicious,[],'an import with nothing extra reports exactly what it did before');
});
