import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const root=join(dirname(fileURLToPath(import.meta.url)),'..'),dir=mkdtempSync(join(tmpdir(),'native-effect-worker-'));
test.after(()=>rmSync(dir,{recursive:true,force:true}));
async function bundle(name){const file=join(dir,name+'.mjs');await build({entryPoints:[join(root,'src',name+'.ts')],bundle:true,format:'esm',platform:'node',outfile:file,alias:{'@studpilot/shared':join(root,'../../packages/shared/src/index.ts')}});return import(pathToFileURL(file).href);}
const T=await bundle('tools'),C=await bundle('plugin-capabilities'),PNG=await bundle('png');
const nativePng=await PNG.encodePng(new Uint8Array(160*90*3).fill(128),160,90);
const frame={source:'studio_viewport',encoding:'png',rgbBase64:PNG.bytesToBase64(nativePng),width:160,height:90,view:'viewport',subject:'game.Workspace',capturedAt:1};
function ctx(data){return {env:{AI:{run(){throw Error('no paid vision calls permitted');}}},execStudioOp:async()=>({ok:true,data}),emitFrame:f=>ctx.frames.push(f)};}
ctx.frames=[];
test('dedicated native capture rejects software substitutes and actual permission denial',async()=>{
 const good=await T.TOOLS.capture_studio_viewport.run(ctx(frame),{});assert.equal(good.captured,true);assert.equal(good.judged,false);
 // M4: the picture goes to the USER's screen strip (emitFrame) and to no model: the env's AI binding throws if it is ever reached.
 assert.equal(ctx.frames.at(-1).source,'studio_viewport','the frame reached the user\'s strip');
 const fake=await T.TOOLS.capture_studio_viewport.run(ctx({...frame,source:'software_render',encoding:'rgb24'}),{});assert.ok(fake.error);
 const denied=ctx(null);denied.execStudioOp=async()=>({ok:false,error:'screenshot permission denied'});
 assert.match((await T.TOOLS.capture_studio_viewport.run(denied,{})).error,/permission denied/);
});
test('native capture needs explicit plugin capability',()=>{
 const requirements={capture_studio_viewport:T.TOOLS.capture_studio_viewport.studioOps};
 assert.equal(C.filterToolsForPlugin(['capture_studio_viewport'],requirements,null).allowed.size,0);
 const report={schema:C.PLUGIN_CAPABILITY_SCHEMA,operations:[{op:'capture_studio_viewport',status:'supported'}]};
 assert.equal(C.filterToolsForPlugin(['capture_studio_viewport'],requirements,report).allowed.has('capture_studio_viewport'),true);
});

