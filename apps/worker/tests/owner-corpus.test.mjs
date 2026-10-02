import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as esbuild from 'esbuild';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {d1} from './stubs/d1.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)),'..');
const dir = mkdtempSync(join(tmpdir(),'owner-corpus-boundary-'));
test.after(() => rmSync(dir,{recursive:true,force:true}));
async function bundle(name) {
  const out = join(dir,name+'.mjs');
  await esbuild.build({entryPoints:[join(root,'src',name+'.ts')],bundle:true,format:'esm',platform:'node',outfile:out,
    alias:{'@apple/shared':join(root,'../../packages/shared/src/index.ts')}});
  return import(pathToFileURL(out).href);
}
const C = await bundle('owner-corpus');
const T = await bundle('tools');
const R = await bundle('owner-corpus-routes');
const ROUTER = await bundle('router');
function env() {
  const db = d1();
  db.CORPUS.batch = async statements => Promise.all(statements.map(s => s.run()));
  const objects = new Map(), grants = new Map();
  return {db,objects,grants,CORPUS:db.CORPUS,
    MEDIA:{async put(key,bytes) {objects.set(key,new Uint8Array(bytes).slice());},async get(key) {
      const bytes=objects.get(key); return bytes ? {size:bytes.length,arrayBuffer:async()=>bytes.slice().buffer} : null;
    }},
    KV:{async put(key,value,opts) {grants.set(key,{value,opts});},async get(key) {return grants.has(key)?JSON.parse(grants.get(key).value):null;}},
  };
}
const bytes = new TextEncoder().encode('<roblox!binary-fixture-not-executed');
async function component(over={}) {return {id:'a'.repeat(64)+':RBX1',name:'OakTree',className:'Model',path:'Workspace.OakTree',sourceSha256:'a'.repeat(64),
  componentSha256:await C.sha256(bytes),byteLength:bytes.length,summary:'owner tree with exact geometry',usage:'garden forest',dependencyIds:[],unresolvedRefs:[],scriptsPreserved:true,...over};}
async function ingested(e,over={}) {
  const c=await component(over);
  await C.ingestOwnerManifest(e,'owner-a',{ownerAttested:true,components:[c]});
  await C.ingestOwnerBlob(e,'owner-a',c.componentSha256,bytes.buffer);
  return {...c,id:C.ownerComponentId(c.id)};
}
test('table initialization sends complete statements on each D1 exec line',async()=>{
  const e=env(),exec=e.CORPUS.exec.bind(e.CORPUS);
  e.CORPUS.exec=async sql=>{
    for(const line of sql.split('\n').filter(s=>s.trim())) await exec(line);
    return {count:3,duration:0};
  };
  await C.ownerCorpusTables(e);
  const c=await ingested(e);
  assert.equal((await C.ownerComponent(e,'owner-a',c.id)).id,c.id);
  e.db.close();
});
function ctx(e,over={}) {return {env:e,userId:'owner-a',studioConnected:()=>true,execStudioOp:async()=>{throw new Error('unexpected Studio call');},
  createCheckpoint:async()=>({id:'cp'}),addMemoryFact:async()=>'',...over};}

test('metadata alone is not insertable; verified native bytes are searchable only by their owner',async()=>{
  const e=env(); const c=await component();
  await C.ingestOwnerManifest(e,'owner-a',{ownerAttested:true,components:[c]});
  assert.deepEqual(await C.findOwnerComponents(e,'owner-a','OakTree'),[]);
  await assert.rejects(C.ingestOwnerBlob(e,'owner-a',c.componentSha256,new TextEncoder().encode('tampered').buffer),/SHA/);
  await C.ingestOwnerBlob(e,'owner-a',c.componentSha256,bytes.buffer);
  assert.equal((await C.findOwnerComponents(e,'owner-a','OakTree'))[0].id,C.ownerComponentId(c.id));
  assert.deepEqual(await C.findOwnerComponents(e,'owner-b','OakTree'),[]);
  assert.equal(await C.ownerComponent(e,'owner-b',C.ownerComponentId(c.id)),null);
  e.db.close();
});

test('real library tool prioritizes the owner corpus, then emits the exact native import behind a checkpoint',async()=>{
  const e=env(),c=await ingested(e),ops=[],events=[];
  const context=ctx(e,{createCheckpoint:async()=>{events.push('checkpoint');return{id:'cp'};},execStudioOp:async op=>{
    events.push('import');ops.push(op);return{ok:true,data:{inserted:['game.ServerStorage.OakTree'],scriptsExecuted:0}};
  }});
  const found=await T.runTool(context,'find_library_model',JSON.stringify({query:'OakTree'}));
  const result=JSON.parse(found.resultForLlm);
  assert.equal(result.source,'owner_corpus');assert.equal(result.results[0].id,c.id);
  const imported=await T.runTool(context,'insert_library_model',JSON.stringify({id:c.id}));
  assert.equal(imported.ok,true);assert.equal(imported.mutatedProject,true);
  assert.deepEqual(events,['checkpoint','import']);assert.equal(ops[0].op,'import_owner_component');
  assert.equal(ops[0].componentSha256,c.componentSha256);assert.equal(ops[0].parent,'game.ServerStorage');
  assert.ok(JSON.stringify(ops[0]).length<2000,'durable queue must hold a token, not model bytes');
  const served=await C.readOwnerGrant(e,ops[0].contentToken);
  assert.deepEqual(Buffer.from(served.rbxmBase64,'base64'),Buffer.from(bytes));
  assert.equal([...e.grants.values()][0].opts.expirationTtl,120);
  e.db.close();
});

test('checkpoint denial, dependency gaps and foreign ids refuse before native import',async()=>{
  const e=env(),c=await ingested(e,{unresolvedRefs:['missing root']});let calls=0;
  const context=ctx(e,{execStudioOp:async()=>{calls++;return{ok:true};}});
  assert.equal((await T.runTool(context,'insert_library_model',JSON.stringify({id:c.id}))).ok,false);
  assert.equal(calls,0);
  const clean=await ingested(e);context.createCheckpoint=async()=>({error:'snapshot denied'});
  assert.equal((await T.runTool(context,'insert_library_model',JSON.stringify({id:clean.id}))).ok,false);
  context.userId='owner-b';assert.equal((await T.runTool(context,'insert_library_model',JSON.stringify({id:clean.id}))).ok,false);
  assert.equal(calls,0);assert.deepEqual(await C.readOwnerGrant(e,'f'.repeat(64)),null);
  e.db.close();
});

test('exact script source is retrievable as hashed data, with honest bounded continuation',async()=>{
  const e=env(),source='-- preserved\nlocal x = "אבג"\nrequire(123456)\n',sourceHash=await C.sha256(new TextEncoder().encode(source));
  const desc=new TextEncoder().encode(JSON.stringify({propertiesXML:'<Properties/>',refs:[],scripts:[{id:'script-1',path:'Game.Code',className:'Script',source,sha256:sourceHash}]}));
  const c=await ingested(e,{descriptionSha256:await C.sha256(desc)});
  await C.ingestOwnerDescription(e,'owner-a',c.descriptionSha256,desc.buffer);
  assert.equal((await C.findOwnerComponents(e,'owner-a','require'))[0]?.id,c.id,'actual source tokens must be searchable, not only catalog names');
  const r=await T.runTool(ctx(e),'read_owner_component',JSON.stringify({id:c.id,scriptId:'script-1',maxChars:12}));
  const data=JSON.parse(r.resultForLlm);assert.equal(data.source,source.slice(0,12));assert.equal(data.nextOffset,12);assert.equal(data.executed,false);
  const rest=await C.readOwnerDescription(e,'owner-a',c,{scriptId:'script-1',offset:12,maxChars:12000});
  assert.equal(data.source+rest.source,source);assert.equal(rest.nextOffset,null);
  assert.equal(ROUTER.toolsForMode('plan',true,T.toolNames()).has('read_owner_component'),true);
  assert.equal(ROUTER.toolsForMode('plan',true,T.toolNames()).has('insert_library_model'),false);
  e.db.close();
});

test('HTTP manifest and blob endpoints reject unauthenticated writes; content requires an opaque issued grant',async()=>{
  const e=env();
  assert.equal((await R.ownerCorpusRoutes.fetch(new Request('https://test/manifest',{method:'POST',body:'{}'}),e)).status,401);
  assert.equal((await R.ownerCorpusRoutes.fetch(new Request('https://test/blobs/'+ 'a'.repeat(64),{method:'PUT',body:bytes}),e)).status,401);
  assert.equal((await R.ownerCorpusRoutes.fetch(new Request('https://test/content/'+ 'a'.repeat(64)),e)).status,404);
  e.db.close();
});


test('large descriptions are explicitly paged rather than silently clipped by the real tool',async()=>{
  const e=env(),propertiesXml='<Properties>'+('x'.repeat(40000))+'</Properties>';
  const desc=new TextEncoder().encode(JSON.stringify({propertiesXml,scripts:[]}));
  const c=await ingested(e,{descriptionSha256:await C.sha256(desc)});
  await C.ingestOwnerDescription(e,'owner-a',c.descriptionSha256,desc.buffer);
  const r=await T.runTool(ctx(e),'read_owner_component',JSON.stringify({id:c.id,section:'metadata',maxChars:3000}));
  const data=JSON.parse(r.resultForLlm);assert.equal(data.nextOffset,3000);assert.equal(data.format,'json');
  let all=data.text,offset=data.nextOffset;
  while(offset!==null){const next=await C.readOwnerDescription(e,'owner-a',c,{section:'metadata',offset,maxChars:3000});all+=next.text;offset=next.nextOffset;}
  assert.equal(JSON.parse(all).propertiesXml,propertiesXml);e.db.close();
});

test('supplied private production bundle traverses real ingestion, priority search and exact native byte delivery', {skip:!process.env.APPLE_OWNER_BUNDLE},async()=>{
  const filename=process.env.APPLE_OWNER_BUNDLE,manifest=JSON.parse(readFileSync(filename,'utf8')),e=env();
  await C.ingestOwnerManifest(e,'owner-a',manifest);
  for(const c of manifest.components){
    const native=readFileSync(join(dirname(filename),c.blobFile));
    await C.ingestOwnerBlob(e,'owner-a',c.componentSha256,native.buffer.slice(native.byteOffset,native.byteOffset+native.byteLength));
    const description=readFileSync(join(dirname(filename),c.descriptionFile));
    await C.ingestOwnerDescription(e,'owner-a',c.descriptionSha256,description.buffer.slice(description.byteOffset,description.byteOffset+description.byteLength));
    const ops=[];const context=ctx(e,{offeredTools:new Set(['insert_owner_component']),execStudioOp:async op=>{ops.push(op);return{ok:true,data:{inserted:['game.ServerStorage.'+c.name]}};}});
    const found=JSON.parse((await T.runTool(context,'find_library_model',JSON.stringify({query:c.name}))).resultForLlm);
    assert.equal(found.source,'owner_corpus');assert.ok(found.results.some(r=>r.id===c.id));
    assert.equal((await T.runTool(context,'insert_owner_component',JSON.stringify({id:c.id}))).ok,true);
    assert.equal(ops.length,1);assert.equal(ops[0].op,'import_owner_component');
    const delivered=await C.readOwnerGrant(e,ops[0].contentToken);
    assert.deepEqual(Buffer.from(delivered.rbxmBase64,'base64'),native);
    const read=JSON.parse((await T.runTool(context,'read_owner_component',JSON.stringify({id:c.id}))).resultForLlm);
    assert.equal(read.codeAvailable,true);
    assert.equal((await T.runTool({...context,offeredTools:new Set(['insert_library_model'])},'insert_library_model',JSON.stringify({id:c.id}))).ok,false);
    assert.equal(ops.length,1,'old plugin capability must refuse before delivery');
  }
  e.db.close();
});


test('both insertion entry points declare checkpoint and native import operations',()=>{
  for(const name of ['insert_library_model','insert_owner_component']){
    assert.ok(T.TOOLS[name].studioOps.includes('snapshot'));
    assert.ok(T.TOOLS[name].studioOps.includes('import_owner_component'));
  }
  assert.equal(ROUTER.toolsForMode('plan',true,T.toolNames()).has('insert_owner_component'),false);
});

test('streaming uploader verifies and sequentially sends native files, with exact resume offsets',async()=>{
  const c=await component(),filename=join(dir,'stream.jsonl');
  writeFileSync(join(dir,'model.rbxm'),bytes);
  writeFileSync(filename,JSON.stringify({ownerAttested:true})+'\n'+[1,2,3].map(n=>JSON.stringify({...c,id:c.id+n,blobFile:'model.rbxm'})).join('\n'));
  const requests=[];
  const server=createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    assert.equal(req.headers.authorization,'Bearer local-test-token');
    requests.push({url:req.url,method:req.method,body:Buffer.concat(chunks)});
    res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const result=await promisify(execFile)(process.execPath,[join(root,'../../scripts/ingest-owner-corpus.mjs'),filename],{
      env:{...process.env,APPLE_OWNER_JWT:'local-test-token',APPLE_OWNER_ORIGIN:'http://127.0.0.1:'+server.address().port,
        APPLE_OWNER_BATCH_SIZE:'1',APPLE_OWNER_SKIP_COMPONENTS:'1'}});
    assert.equal(requests.length,4);assert.deepEqual(requests.map(r=>r.method),['POST','PUT','POST','PUT']);
    assert.equal(JSON.parse(requests[0].body).components[0].id,c.id+'2');
    assert.deepEqual(requests[1].body,Buffer.from(bytes));assert.match(result.stdout,/SKIP_COMPONENTS=3/);
    assert.ok(!result.stdout.includes('local-test-token'));
  }finally{await new Promise(resolve=>server.close(resolve));}
});
