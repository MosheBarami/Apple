// Pre-launch release library (V3 G05/G06, Q37): the owner's cloud corpus serves approved accounts
// without the owner Mac, and nobody else. Real owner-corpus/tools/routes modules over stub D1/R2/KV.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as esbuild from 'esbuild';
import {Hono} from 'hono';
import {d1} from './stubs/d1.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)),'..');
const dir = mkdtempSync(join(tmpdir(),'owner-library-namespace-'));
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
const OWNER='owner-a', APPROVED='customer-ok', STRANGER='customer-no';
function env(vars={}) {
  const db = d1();
  db.CORPUS.batch = async statements => Promise.all(statements.map(s => s.run()));
  const objects = new Map(), grants = new Map();
  return {db,objects,grants,CORPUS:db.CORPUS,OWNER_USER_IDS:`${OWNER}, other-owner`,LIBRARY_APPROVED_USER_IDS:` ${APPROVED} ,x`,...vars,
    MEDIA:{async put(key,bytes) {objects.set(key,new Uint8Array(bytes).slice());},async get(key) {
      const bytes=objects.get(key); return bytes ? {size:bytes.length,arrayBuffer:async()=>bytes.slice().buffer} : null;
    }},
    KV:{async put(key,value,opts) {grants.set(key,{value,opts});},async get(key) {return grants.has(key)?JSON.parse(grants.get(key).value):null;}},
  };
}
const bytes = new TextEncoder().encode('<roblox!binary-fixture-not-executed');
async function component(over={}) {return {id:'owner-xml:'+'a'.repeat(64)+':chunk-00001',name:'OakTree',className:'Model',path:'Workspace.OakTree',
  sourceSha256:'a'.repeat(64),componentSha256:await C.sha256(bytes),byteLength:bytes.length,summary:'owner tree with exact geometry',
  usage:'garden forest',dependencyIds:[],unresolvedRefs:[],scriptsPreserved:false,
  readiness:{offlineNativeArtifact:true,realStudioInsertion:true,visualInspection:false,gameplayVerified:false},...over};}
function ctx(e,userId,over={}) {return {env:e,userId,studioConnected:()=>true,execStudioOp:async()=>{throw new Error('unexpected Studio call');},
  createCheckpoint:async()=>({id:'cp'}),addMemoryFact:async()=>'',...over};}
// Routes read the signed-in user from auth middleware; this stands in for it.
function routes(e,userId) {
  const app=new Hono();app.use('*',async(c,next)=>{c.set('user',{userId});await next();});app.route('/',R.ownerCorpusRoutes);
  return req=>app.fetch(req,e);
}
async function published(e) {
  const c=await component(),send=routes(e,OWNER);
  const m=await send(new Request('https://t/manifest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ownerAttested:true,components:[c]})}));
  assert.equal(m.status,200,await m.clone().text());
  const b=await send(new Request('https://t/blobs/'+c.componentSha256,{method:'PUT',headers:{'Content-Length':String(bytes.length)},body:bytes}));
  assert.equal(b.status,200,await b.clone().text());
  return {...c,id:C.ownerComponentId(c.id)};
}

test('libraryNamespace: release owner and approved accounts read the library; everyone else keeps their own',()=>{
  const e=env();
  assert.equal(C.libraryNamespace(e,OWNER),OWNER);
  assert.equal(C.libraryNamespace(e,APPROVED),OWNER,'approved (whitespace-trimmed) id resolves to the release library');
  assert.equal(C.libraryNamespace(e,STRANGER),STRANGER);
  assert.equal(C.libraryNamespace(e,'other-owner'),'other-owner','only the release owner, not every OWNER_USER_IDS entry');
  assert.equal(C.libraryNamespace(e,undefined),undefined);
  assert.equal(C.libraryNamespace(env({RELEASE_LIBRARY_OWNER_ID:' release-1 '}),APPROVED),'release-1','explicit release owner wins');
  assert.equal(C.libraryNamespace(env({RELEASE_LIBRARY_OWNER_ID:' release-1 '}),OWNER),OWNER,'a non-release owner keeps their own');
  assert.equal(C.libraryNamespace(env({OWNER_USER_IDS:'',LIBRARY_APPROVED_USER_IDS:APPROVED}),APPROVED),APPROVED,'no configured library: own namespace');
  assert.equal(C.libraryNamespace(env({LIBRARY_APPROVED_USER_IDS:''}),APPROVED),APPROVED,'blank approval list approves nobody');
  e.db.close();
});

test('approved account: find -> checkpointed grant -> content route serves the exact owner bytes, no owner Mac involved',async()=>{
  const e=env(),c=await published(e),ops=[];
  const context=ctx(e,APPROVED,{execStudioOp:async op=>{ops.push(op);return{ok:true,data:{inserted:['game.ServerStorage.OakTree']}};}});
  const found=JSON.parse((await T.runTool(context,'find_library_model',JSON.stringify({query:'OakTree'}))).resultForLlm);
  assert.equal(found.source,'owner_corpus');assert.equal(found.results[0].id,c.id);
  assert.equal(found.results[0].scriptsPreserved,false,'script-free units are labelled, not claimed as preserved');
  assert.equal(found.results[0].readiness.visualInspection,false);assert.equal(found.results[0].readiness.realStudioInsertion,true);
  const read=JSON.parse((await T.runTool(context,'read_owner_component',JSON.stringify({id:c.id}))).resultForLlm);
  assert.equal(read.component.id,c.id);assert.equal(read.codeAvailable,false);
  const inserted=await T.runTool(context,'insert_library_model',JSON.stringify({id:c.id}));
  assert.equal(inserted.ok,true,inserted.resultForLlm);assert.equal(ops.length,1);assert.equal(ops[0].op,'import_owner_component');
  const res=await R.ownerCorpusRoutes.fetch(new Request('https://t/content/'+ops[0].contentToken),e);
  assert.equal(res.status,200);
  const body=await res.json();
  assert.equal(body.componentSha256,c.componentSha256);
  assert.deepEqual(Buffer.from(body.rbxmBase64,'base64'),Buffer.from(bytes));
  e.db.close();
});

test('unapproved account sees no owner library and cannot mint a grant',async()=>{
  const e=env(),c=await published(e);let calls=0,checkpoints=0;
  const context=ctx(e,STRANGER,{execStudioOp:async()=>{calls++;return{ok:true};},createCheckpoint:async()=>{checkpoints++;return{id:'cp'};}});
  const found=JSON.parse((await T.runTool(context,'find_library_model',JSON.stringify({query:'OakTree'}))).resultForLlm);
  assert.notEqual(found.source,'owner_corpus');
  assert.ok(!JSON.stringify(found).includes(c.componentSha256),'owner component metadata must not leak');
  assert.equal((await T.runTool(context,'insert_library_model',JSON.stringify({id:c.id}))).ok,false);
  assert.match(JSON.parse((await T.runTool(context,'read_owner_component',JSON.stringify({id:c.id}))).resultForLlm).error,/not available/);
  assert.equal(calls,0);assert.equal(checkpoints,0);assert.equal(e.grants.size,0);
  e.db.close();
});

test('approved accounts only read the library: their uploads stay in their own namespace',async()=>{
  const e=env();await published(e);
  const mine=await component({id:'customer-upload',name:'PoisonTree'}),send=routes(e,APPROVED);
  const m=await send(new Request('https://t/manifest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ownerAttested:true,components:[mine]})}));
  assert.equal(m.status,200);
  const b=await send(new Request('https://t/blobs/'+mine.componentSha256,{method:'PUT',headers:{'Content-Length':String(bytes.length)},body:bytes}));
  assert.equal(b.status,200);
  assert.deepEqual(await C.findOwnerComponents(e,OWNER,'PoisonTree'),[],'library unchanged by an approved account');
  assert.equal((await C.findOwnerComponents(e,APPROVED,'PoisonTree'))[0].id,'owner:customer-upload');
  assert.ok([...e.objects.keys()].every(k=>k.startsWith(`owner-corpus/${OWNER}/`)||k.startsWith(`owner-corpus/${APPROVED}/`)));
  e.db.close();
});

test('manifest requires an explicit scriptsPreserved boolean and bounded boolean readiness flags',async()=>{
  const base=await component();
  for(const bad of [{scriptsPreserved:undefined},{scriptsPreserved:'yes'},{readiness:{a:'true'}},{readiness:[true]},
    {readiness:Object.fromEntries(Array.from({length:17},(_,i)=>['k'+i,true]))}]){
    assert.throws(()=>C.parseOwnerManifest({ownerAttested:true,components:[{...base,...bad}]}),undefined,JSON.stringify(bad).slice(0,60));
  }
  const [parsed]=C.parseOwnerManifest({ownerAttested:true,components:[{...base,readiness:{visualInspection:false},ownerId:'forged'}]});
  assert.deepEqual(parsed.readiness,{visualInspection:false});assert.equal(parsed.scriptsPreserved,false);assert.equal(parsed.ownerId,undefined);
});

test('G02/Q37: only the owner and approved accounts may start builds before launch', () => {
  const e = env();
  assert.equal(C.buildApproved(e, OWNER), true);
  assert.equal(C.buildApproved(e, 'other-owner'), true);
  assert.equal(C.buildApproved(e, APPROVED), true);
  assert.equal(C.buildApproved(e, STRANGER), false);
  assert.equal(C.buildApproved(env({OWNER_USER_IDS: ''}), STRANGER), true, 'no owner configured (dev) gates nothing');
});

test('G02: every run-start path in the session DO consults the account gate', async () => {
  const {readFileSync} = await import('node:fs');
  const src = readFileSync(join(root, 'src/do/session.ts'), 'utf8');
  assert.match(src, /if \(!runLive && this\.refuseUnapproved\(ws, bind\)\) return;/, 'chat message');
  assert.match(src, /if \(this\.refuseUnapproved\(ws, bind\)\) return;\n\s+const gate = await this\.studioGate\(\);/, 'message edit');
  assert.match(src, /if \(!buildApproved\(this\.env, bind\.ownerId\)\) return json\(\{ ok: false, code: 'account_not_approved'/, '/agent-run');
});
