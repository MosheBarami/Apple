import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const root=join(dirname(fileURLToPath(import.meta.url)),'..'),dir=mkdtempSync(join(tmpdir(),'native-effect-worker-'));
test.after(()=>rmSync(dir,{recursive:true,force:true}));
async function bundle(name){const file=join(dir,name+'.mjs');await build({entryPoints:[join(root,'src',name+'.ts')],bundle:true,format:'esm',platform:'node',outfile:file,alias:{'@golem/shared':join(root,'../../packages/shared/src/index.ts')}});return import(pathToFileURL(file).href);}
const T=await bundle('tools'),C=await bundle('plugin-capabilities');
const frame={source:'studio_viewport',encoding:'png',rgbBase64:'iVBORw0KGgo=',width:160,height:90,view:'viewport',subject:'game.Workspace',capturedAt:1};
function ctx(data){return {env:{AI:{run(){throw Error('no paid vision calls permitted');}}},execStudioOp:async()=>({ok:true,data}),emitFrame:f=>ctx.frames.push(f)};}
ctx.frames=[];
test('native-only rendering reaches the frame bus and remains unscored with no vision call',async()=>{
 const context=ctx({subject:'game.Workspace.Waterfall',views:[],softwareRenderError:'nothing software-renderable',studioViewport:frame});
 const rendered=await T.TOOLS.render_view.run(context,{target:'game.Workspace.Waterfall'});
 assert.equal(rendered.nativeViewportCaptured,true);assert.equal(rendered.targetFramed,false);assert.deepEqual(rendered.views,[]);
 const judged=await T.TOOLS.inspect_visually.run(context,{intent:'Waterfall'});
 assert.equal(judged.judged,false);assert.equal(judged.targetFramed,false);assert.equal(ctx.frames.at(-1).source,'studio_viewport');
 assert.equal(context.lastCritique,undefined);
});
test('dedicated native capture rejects software substitutes and actual permission denial',async()=>{
 const good=await T.TOOLS.capture_studio_viewport.run(ctx(frame),{});assert.equal(good.captured,true);assert.equal(good.judged,false);
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
