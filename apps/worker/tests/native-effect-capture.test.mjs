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
function visionEnv(verdict) {
 const calls=[];
 return {calls,env:{KV:{get:async()=>null},ENVIRONMENT:'test',AI_GATEWAY_ID:'test',
  AI:{run:async(model,payload)=>{calls.push({model,payload});return {choices:[{message:{content:JSON.stringify(verdict)},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:20}};}},
  BUDGET_DO:{idFromName:()=>'',get:()=>({fetch:async(url,init)=>({json:async()=>({ok:true,reserved:JSON.parse(init.body).neurons})})})}}};
}
const verdict={score:5,summary:'White translucent planes are visible.',defects:[{view:'viewport',dimension:'fidelity',severity:'major',observed:'Broad white cards interrupt the water appearance.',fix:'Inspect original Beam texture availability before changing geometry.'}],targetVisibility:'visible',loadingStatus:'possible_artifact',loadingEvidence:'White cards are visible; texture fetch status cannot be established from these pixels.'};
test('native PNG reaches the real GLM vision wire unchanged and the agent receives bounded evidence',async()=>{
 const context=ctx({subject:'game.Workspace.Waterfall',views:[],softwareRenderError:'nothing software-renderable',studioViewport:frame});
 const mock=visionEnv(verdict);context.env=mock.env;
 const judged=await T.TOOLS.inspect_visually.run(context,{target:'game.Workspace.Waterfall',intent:'Waterfall'});
 assert.equal(mock.calls.length,1,'native pixels must reach vision instead of returning judged:false');
 assert.equal(mock.calls[0].model,'@cf/zai-org/glm-5.3-flash');
 const user=mock.calls[0].payload.messages.find(m=>m.role==='user');
 assert.equal(user.content.find(c=>c.type==='image_url').image_url.url,'data:image/png;base64,'+frame.rgbBase64);
 assert.match(JSON.stringify(mock.calls[0].payload.messages),/active.*viewport/i);
 assert.equal(judged.targetFramed,false);assert.equal(judged.targetVisibility,'visible');assert.equal(judged.loadingStatus,'possible_artifact');
 assert.match(judged.text,/white/i);assert.equal(context.lastCritique.hardFails.length,0);
 assert.equal(ctx.frames.at(-1).source,'studio_viewport');
});
test('uncertain target visibility cannot become a passing quality verdict',async()=>{
 const context=ctx({subject:'game.Workspace.Waterfall',views:[],studioViewport:frame});
 const mock=visionEnv({...verdict,score:10,targetVisibility:'uncertain',defects:[]});context.env=mock.env;
 const judged=await T.TOOLS.inspect_visually.run(context,{intent:'Waterfall'});
 assert.equal(mock.calls.length,1);assert.equal(judged.passed,false);assert.equal(judged.score,null);
 assert.equal(context.lastCritique.unavailable,true,'uncertain target must not drive an automatic rebuild');
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


test('native judgment does not mix software proxy metrics or reinterpret PNG as RGB',async()=>{
 const context=ctx({subject:'game.Workspace.Waterfall',views:[{name:'hero',rgbBase64:'NOT_RGB',meta:{}}],studioViewport:frame});
 const mock=visionEnv({...verdict,score:8,defects:[],loadingStatus:'unverified'});context.env=mock.env;
 const judged=await T.TOOLS.inspect_visually.run(context,{intent:'Waterfall'});
 assert.equal(mock.calls.length,1);assert.equal(judged.passed,true);
 assert.equal(context.lastCritique.hardFails.length,0);
 assert.equal(mock.calls[0].payload.messages.find(m=>m.role==='user').content.filter(c=>c.type==='image_url').length,1);
});
test('malformed native verdict never becomes a clean pass',async()=>{
 const context=ctx({subject:'Waterfall',views:[],studioViewport:frame});
 const mock=visionEnv({...verdict,score:10,defects:[{view:'hero',observed:'wrong contract'}]});context.env=mock.env;
 const judged=await T.TOOLS.inspect_visually.run(context,{intent:'Waterfall'});
 assert.equal(judged.score,null);assert.equal(judged.passed,false);assert.equal(context.lastCritique.unavailable,true);
});
test('invalid native PNG fails before model or budget invocation',async()=>{
 const context=ctx({subject:'Waterfall',views:[],studioViewport:{...frame,rgbBase64:'bm90IGEgcG5n'}});
 const mock=visionEnv(verdict);context.env=mock.env;
 const judged=await T.TOOLS.inspect_visually.run(context,{intent:'Waterfall'});
 assert.equal(mock.calls.length,0);assert.equal(judged.score,null);assert.equal(judged.passed,false);
});

// Native callback capture supplies engine RGB; the worker owns the PNG encoding.
test('native RGB is encoded as PNG before GLM and never treated as software geometry',async()=>{
 const rgbFrame={...frame,encoding:'rgb24',rgbBase64:PNG.bytesToBase64(new Uint8Array(160*90*3).fill(128)),captureMethod:'capture_service',nativeWidth:1213,nativeHeight:793,resampled:true};
 const context=ctx({subject:'game.StarterGui.OwnerItemShopNative.Frame',views:[],studioViewport:rgbFrame});
 const mock=visionEnv(verdict);context.env=mock.env;
 const result=await T.TOOLS.inspect_visually.run(context,{target:'game.StarterGui.OwnerItemShopNative.Frame',intent:'Authored ItemShop'});
 assert.equal(mock.calls.length,1,'actual native RGB must reach vision');
 const url=mock.calls[0].payload.messages.find(m=>m.role==='user').content.find(c=>c.type==='image_url').image_url.url;
 assert.equal(url,'data:image/png;base64,'+frame.rgbBase64,'worker PNG must encode the exact captured RGB bytes');
 assert.deepEqual([...Buffer.from(url.split(',')[1],'base64').subarray(0,8)],[137,80,78,71,13,10,26,10]);
 assert.match(JSON.stringify(mock.calls[0].payload.messages),/1213.*793|resampl/i);
 assert.equal(result.targetFramed,false);assert.equal(context.lastCritique.hardFails.length,0);
});

test('native PNG transport above 64 KiB refuses before paid vision or budget calls',async()=>{
 let n=42;const noisy=new Uint8Array(320*240*3);for(let i=0;i<noisy.length;i++){n=(Math.imul(n,1664525)+1013904223)>>>0;noisy[i]=n>>>24;}
 const context=ctx({subject:'Native UI',views:[],studioViewport:{...frame,width:320,height:240,encoding:'rgb24',rgbBase64:PNG.bytesToBase64(noisy)}});
 const mock=visionEnv(verdict);context.env=mock.env;
 const result=await T.TOOLS.inspect_visually.run(context,{intent:'UI'});
 assert.equal(mock.calls.length,0);assert.equal(result.judged,false);assert.equal(result.score,null);assert.match(result.text,/64 KiB/);
});

test('truncated native RGB is unavailable without a model call or an invented PNG',async()=>{
 const context=ctx({subject:'Native UI',views:[],studioViewport:{...frame,encoding:'rgb24',rgbBase64:'AQID'}});
 const mock=visionEnv(verdict);context.env=mock.env;
 const result=await T.TOOLS.inspect_visually.run(context,{intent:'UI'});
 assert.equal(mock.calls.length,0);assert.equal(result.judged,false);assert.equal(context.uiDetail.nativeViewport.pngDataUrl,undefined);
});
