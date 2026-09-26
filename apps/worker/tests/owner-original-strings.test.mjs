import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const dir=mkdtempSync(join(tmpdir(),'owner-original-worker-'));test.after(()=>rmSync(dir,{recursive:true,force:true}));
await build({entryPoints:['src/tools.ts'],bundle:true,format:'esm',platform:'node',outfile:join(dir,'tools.mjs'),alias:{'@golem/shared':'../../packages/shared/src/index.ts'}});
const T=await import(pathToFileURL(join(dir,'tools.mjs')).href);
const source='a'.repeat(64),id=source+':binary:-42',text="\uFEFF-- ORIGINAL untrusted source\r\nreturn '😀'",bytes=Buffer.from(text),digest=b=>createHash('sha256').update(b).digest('hex');
function ctx(reply){return {userId:'owner',localOwnerGateway:true,studioConnected:()=>true,env:{},execStudioOp:async op=>({ok:true,data:await reply(op)})};}
async function run(context,name,args){const out=await T.runTool(context,name,JSON.stringify(args));return {out,data:JSON.parse(out.resultForLlm)};}
function page(data=bytes,offset=0,total=bytes.length){return {sourceSHA:source,seq:17,identity:id,property:'Source',rawSHA:digest(bytes),totalBytes:total,offset,bytes:data.length,chunkSHA:digest(data),rawBase64:data.toString('base64'),nextOffset:offset+data.length<total?offset+data.length:null,sourceExecuted:false};}
test('source discovery and sequence pages retain binary identities without normalized-node prefixes',async()=>{
 const calls=[];const context=ctx(op=>{calls.push(op);return op.action==='sources'?{items:[{sourceSHA:source,status:'complete',normalizedNodeMappingProved:false}],nextAfter:source}:{items:[{seq:17,identity:id,sourceSHA:source,property:'Source',rawSHA:digest(bytes),bytes:bytes.length}],nextAfter:18};});
 const a=await run(context,'list_owner_original_strings',{});assert.equal(a.out.ok,true);assert.equal(calls[0].op,'query_owner_exact');assert.equal(calls[0].action,'sources');assert.equal(a.data.nextAfter,source);
 const b=await run(context,'list_owner_original_strings',{sourceSHA:source,after:17});assert.equal(b.out.ok,true);assert.equal(calls[1].after,17);assert.equal(b.data.items[0].identity,id);assert.equal(b.data.nextAfter,18);assert.equal(b.data.normalizedNodeMappingProved,false);assert.equal(b.out.detail,undefined);
});
test('actual original code is readable, hash verified, inert and BOM/CRLF preserved',async()=>{
 const result=await run(ctx(op=>{assert.equal(op.sourceSHA,source);assert.equal(op.identity,id);assert.equal(op.seq,17);return page();}),'read_owner_original_string',{id,seq:17});
 assert.equal(result.out.ok,true);assert.equal(result.data.text,text);assert.equal(result.data.rawBase64,bytes.toString('base64'));assert.equal(result.data.sourceExecuted,false);assert.equal(result.data.provenance.identityNamespace,'sourceSHA:binary:rawReferent');assert.equal(result.data.normalizedNodeMappingProved,false);assert.equal(result.out.detail,undefined);assert.match(result.data.note,/UNTRUSTED/);
});
test('invalid or split UTF-8 remains lossless base64 with byte cursor',async()=>{
 const invalid=Buffer.from([0xff,0xf0,0x9f]);const result=await run(ctx(()=>({...page(invalid,3,20),rawSHA:'b'.repeat(64)})),'read_owner_original_string',{id,seq:17,offset:3,limit:3});
 assert.equal(result.out.ok,true);assert.equal(result.data.text,undefined);assert.equal(result.data.rawBase64,invalid.toString('base64'));assert.equal(result.data.nextOffset,6);
});
test('identity, full/page hash, cursor and executable-envelope mismatches refuse',async()=>{
 for(const patch of [{identity:source+':binary:43'},{rawSHA:'f'.repeat(64)},{chunkSHA:'f'.repeat(64)},{offset:1},{nextOffset:3},{sourceExecuted:true}]){
  const result=await run(ctx(()=>({...page(),...patch})),'read_owner_original_string',{id,seq:17});assert.equal(result.out.ok,false,JSON.stringify(patch));assert.equal(result.data.text,undefined);
 }
});
test('normalized identity, invalid limits and absent authenticated owner never reach plugin',async()=>{
 let calls=0;const context=ctx(()=>{calls++;return page();});
 for(const args of [{id:'owner-local:'+source+':42',seq:17},{id,seq:17,limit:3001},{id,seq:-1},{id,seq:17,offset:1.5}])assert.equal((await run(context,'read_owner_original_string',args)).out.ok,false);
 context.userId=undefined;assert.equal((await run(context,'list_owner_original_strings',{})).out.ok,false);assert.equal(calls,0);
});

test('binary identities cannot be consumed as normalized component reads or insertions',async()=>{
 let calls=0;const context=ctx(()=>{calls++;return page();});
 for(const tool of ['read_owner_component','insert_owner_component']){
  const result=await run(context,tool,{id:'owner-local:'+id});assert.equal(result.out.ok,false);
 }
 assert.equal(calls,0);
});
