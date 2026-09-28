import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const esbuild=await import(process.env.APPLE_TEST_ESBUILD || 'esbuild');
import {createHash} from 'node:crypto';
const dir=mkdtempSync(join(tmpdir(),'owner-local-worker-'));
test.after(()=>rmSync(dir,{recursive:true,force:true}));
await esbuild.build({entryPoints:['src/tools.ts'],bundle:true,format:'esm',platform:'node',outfile:join(dir,'tools.mjs'),alias:{'@golem/shared':'../../packages/shared/src/index.ts'}});
const T=await import(pathToFileURL(join(dir,'tools.mjs')).href);
const raw='a'.repeat(64)+':42',id='owner-local:'+raw,sha='b'.repeat(64),jobId='c'.repeat(64);
function context(exec,extra={}) {return {env:{},userId:'owner',localOwnerGateway:true,studioConnected:()=>true,execStudioOp:exec,createCheckpoint:async()=>({id:'cp'}),addMemoryFact:async()=>'',...extra};}
async function run(ctx,name,args){const out=await T.runTool(ctx,name,JSON.stringify(args));return {out,data:JSON.parse(out.resultForLlm)};}
test('complete local library is searched first through paired plugin without a cloud catalogue read',async()=>{
 const calls=[];
 const ctx=context(async op=>{calls.push(op);return {ok:true,data:{items:[{id:raw,name:'Waterfall',class:'Model',path:'Workspace.Waterfall'}],nextAfter:raw}};});
 const {out,data}=await run(ctx,'find_library_model',{query:'Waterfall',after:raw});
 assert.equal(out.ok,true);assert.equal(data.source,'owner_local');assert.equal(data.results[0].id,id);assert.equal(data.nextAfter,raw);
 assert.equal(calls[0].op,'query_owner_local');assert.equal(calls[0].action,'search');assert.equal(calls[0].after,raw);
});
test('ready receipt precedes checkpoint then exact native import; bytes remain local',async()=>{
 const calls=[];const ctx=context(async op=>{calls.push(op);if(op.op==='query_owner_local')return {ok:true,data:{status:'ready',jobId,nodeId:raw,name:'Waterfall',nativeSha256:sha,nativeBytes:88,nativeInstances:9,policy:'owner-loopback-scriptfree-v1',nativeScripts:0}};return {ok:true,data:{inserted:['game.Workspace.Waterfall'],scriptsExecuted:0}};},{createCheckpoint:async()=>{calls.push('checkpoint');return {id:'cp'};}});
 const {out}=await run(ctx,'insert_library_model',{id,parent:'game.Workspace'});
 assert.equal(out.ok,true);assert.equal(out.mutatedProject,true);assert.deepEqual(calls.map(c=>typeof c==='string'?c:c.op),['query_owner_local','checkpoint','import_owner_local']);
 assert.equal(calls[2].nodeId,raw);assert.equal(calls[2].jobId,jobId);assert.equal(calls[2].nativeSha256,sha);assert.equal(calls[2].parent,'game.Workspace');
 assert.ok(!JSON.stringify(calls).match(/127\.0\.0\.1|Bearer|base64|keyFile|rbxmBase64/));
});
test('pending materialization, wrong identity and checkpoint denial never insert',async()=>{
 for(const state of ['pending','wrong','denied']) {
  const calls=[];const ctx=context(async op=>{calls.push(op);return {ok:true,data:state==='pending'?{status:'pending',jobId,nodeId:raw}:{status:'ready',jobId,nodeId:state==='wrong'?'foreign':raw,nativeSha256:sha,nativeBytes:88,nativeInstances:9,policy:'owner-loopback-scriptfree-v1',nativeScripts:0}};},{createCheckpoint:async()=>({error:'denied'})});
  const {out,data}=await run(ctx,'insert_owner_component',{id});
  assert.equal(out.mutatedProject,undefined);assert.equal(calls.length,1);if(state==='pending')assert.equal(data.pending,true);else assert.equal(out.ok,false);
 }
});
test('exact source pages stay inert and out of UI detail',async()=>{
 let op;const ctx=context(async value=>{op=value;return {ok:true,data:{kind:'inert-script',encoding:'base64',data:'ZXJyb3IoKQ==',offset:3,totalBytes:90,nextOffset:10,sha256:sha,chunkSha256:createHash('sha256').update(Buffer.from('ZXJyb3IoKQ==','base64')).digest('hex'),execution:'never'}};});
 const {out,data}=await run(ctx,'read_owner_component',{id,section:'script',offset:3,maxChars:100});
 assert.equal(out.ok,true);assert.equal(op.action,'record');assert.equal(op.kind,'script');assert.equal(op.offset,3);assert.equal(data.execution,'never');assert.equal(data.nextOffset,10);assert.equal(data.text,'error()');assert.equal(data.provenance.untrustedData,true);
 assert.ok(!String(JSON.stringify(out.detail)).includes('ZXJyb3IoKQ=='));
});

test('tampered inert source page is refused before the model sees code',async()=>{
 const ctx=context(async()=>({ok:true,data:{encoding:'base64',data:'ZXJyb3IoKQ==',offset:0,nextOffset:null,sha256:sha,chunkSha256:sha,execution:'never'}}));
 const {out,data}=await run(ctx,'read_owner_component',{id,section:'script'});assert.equal(out.ok,false);assert.match(data.error,/hash mismatch/);
});

test('returned child IDs route directly back to local owner reads without a cloud lookup',async()=>{
 const childRaw='a'.repeat(64)+':44',calls=[];
 const ctx=context(async op=>{calls.push(op);return {ok:true,data:op.action==='children'?{items:[{id:childRaw,class:'LocalScript',parent_id:raw}],next:{afterOrdinal:3,afterId:childRaw}}:{id:childRaw,class:'LocalScript',code:{sha256:sha,execution:'inert-review-data'}}};});
 const children=await run(ctx,'read_owner_component',{id,section:'children'});
 assert.equal(children.data.items[0].id,'owner-local:'+childRaw);
 const described=await run(ctx,'read_owner_component',{id:children.data.items[0].id});
 assert.equal(described.out.ok,true);assert.equal(calls[1].id,childRaw);assert.equal(described.data.id,'owner-local:'+childRaw);
 assert.equal(described.data.provenance.nodeId,childRaw);
});

test('real agent context carries run owner into reads; admin context cannot impersonate that owner',async()=>{
 const sessionOut=join(dir,'session.mjs');
 await esbuild.build({entryPoints:['src/do/session.ts'],bundle:true,format:'esm',platform:'node',outfile:sessionOut,
  alias:{'@golem/shared':'../../packages/shared/src/index.ts','cloudflare:workers':'./tests/stubs/cloudflare-workers.mjs'}});
 const {SessionDO}=await import(pathToFileURL(sessionOut).href);
 let calls=0;
 const host={env:{},boundProjectId:'project',pinnedPrefs:null,opQueue:[],pluginConnectedNow:()=>true,playtestBus:()=>undefined,
  pluginCapabilityReport:{operations:[{op:'query_owner_local',status:'supported'}]},execStudioOp:async()=>{calls++;return {ok:true,data:{id:raw,class:'Frame'}};}};
 const agentCtx=SessionDO.prototype.agentCtx.call(host,{userId:'actual-run-owner'});
 const allowed=await run(agentCtx,'read_owner_component',{id});assert.equal(allowed.out.ok,true);assert.equal(agentCtx.userId,'actual-run-owner');
 const adminCtx=SessionDO.prototype.agentCtx.call(host);
 const denied=await run(adminCtx,'read_owner_component',{id});assert.equal(denied.out.ok,false);assert.match(denied.data.error,/authenticated owner/);assert.equal(calls,1);
});

test('empty ScreenGui host admits authored UI mounting without admitting hand-built content or styling',async()=>{
 const calls=[],ctx=context(async op=>{calls.push(op);return {ok:true,data:{created:['game.StarterGui.OwnerUIHost']}};});
 const good=await run(ctx,'create_instances',{items:[{className:'ScreenGui',name:'OwnerUIHost',parent:'game.StarterGui',props:{ResetOnSpawn:{t:'bool',v:false}}}]});
 assert.equal(good.out.ok,true);assert.equal(calls.length,1);assert.equal(calls[0].items[0].className,'ScreenGui');
 for(const item of [
  {className:'ScreenGui',name:'HandBuilt',parent:'game.StarterGui',children:[{className:'Frame',name:'Generic'}]},
  {className:'ScreenGui',name:'Styled',parent:'game.StarterGui',props:{BackgroundColor3:{t:'Color3',v:[1,0,0]}}},
  {className:'Frame',name:'Generic',parent:'game.StarterGui.OwnerUIHost'},
 ]) {const denied=await run(ctx,'create_instances',{items:[item]});assert.equal(denied.out.ok,false);}
 assert.equal(calls.length,1,'generic UI construction escaped the empty-container exception');
});

test('paged full source catalogue is paired, authenticated and keeps SHA cursors distinct from nodes',async()=>{
 const calls=[],ctx=context(async op=>{calls.push(op);return {ok:true,data:{items:[{id:sha,name:'nonseed.rbxl',status:'indexed'}],nextAfter:sha}};});
 const page=await run(ctx,'query_owner_catalog',{section:'sources',after:sha,limit:2});
 assert.equal(page.out.ok,true);assert.equal(calls[0].action,'sources');assert.equal(calls[0].after,sha);assert.equal(page.data.items[0].id,sha);assert.equal(page.data.visualEvidence,'unverified');assert.equal(page.out.detail,undefined);
 const denied=await run({...ctx,userId:undefined},'query_owner_catalog',{});assert.equal(denied.out.ok,false);assert.equal(calls.length,1);
 const bad=await run(ctx,'query_owner_catalog',{after:id});assert.equal(bad.out.ok,false);assert.equal(calls.length,1);
});
test('native-readiness catalogue section reaches the paired plugin with a numeric row cursor and keeps nested readiness',async()=>{
 const readiness={offlineNativeArtifact:true,realStudioInsertion:true,visualEvidenceCaptured:true,visualInspection:false,gameplayVerified:false,commercialReadiness:false};
 const calls=[],ctx=context(async op=>{calls.push(op);return {ok:true,data:{schema:'apple.owner-corpus.native-readiness-page.v1',rows:[{id:'owner-xml:'+sha+':chunk-00023',sourceSHA256:sha,chunkId:'chunk-00023',artifactSHA256:jobId,artifactBytes:51205,readiness}],nextAfter:11,totalArtifacts:203,sourceExecuted:false}};});
 const page=await run(ctx,'query_owner_catalog',{section:'native-readiness',after:10,limit:1,query:'Jailbreak'});
 assert.equal(page.out.ok,true);assert.deepEqual({op:calls[0].op,action:calls[0].action,after:calls[0].after,limit:calls[0].limit,query:calls[0].query},{op:'query_owner_local',action:'native-readiness',after:10,limit:1,query:'Jailbreak'});
 assert.deepEqual(page.data.rows[0].readiness,readiness);assert.equal(page.data.totalArtifacts,203);assert.equal(page.data.sourceExecuted,false);
 for(const args of [{after:sha},{after:-1},{limit:11},{query:'x'.repeat(121)}]){const bad=await run(ctx,'query_owner_catalog',{section:'native-readiness',...args});assert.equal(bad.out.ok,false,JSON.stringify(args));}
 assert.equal(calls.length,1,'invalid readiness page request reached the plugin');
});
test('owner-first component search scopes full SQLite index by selected original source SHA',async()=>{
 let op;const ctx=context(async v=>{op=v;return {ok:true,data:{items:[{id:raw,name:'NonSeed',class:'Model'}],nextAfter:null}};});
 const got=await run(ctx,'find_library_model',{query:'NonSeed',sourceSHA:sha});assert.equal(got.out.ok,true);assert.equal(op.sourceSHA,sha);assert.equal(got.data.source,'owner_local');assert.equal(got.data.results[0].preview.visualApproved,false);
 const refused=await run(ctx,'find_library_model',{sourceSHA:sha});assert.equal(refused.out.ok,false);
});
