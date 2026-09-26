import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as esbuild from 'esbuild';
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
