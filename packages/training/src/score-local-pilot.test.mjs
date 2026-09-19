import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { scorePilot } from './score-local-pilot.mjs';
import { ALL_GAME_LOGIC_CURRICULUM } from './build-game-logic.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
function fixture() {
  const root = mkdtempSync(join(tmpdir(),'apple-pilot-score-'));
  mkdirSync(join(root,'adapter'));
  const example = ALL_GAME_LOGIC_CURRICULUM.at(-1);
  const data = JSON.stringify({meta:{id:example.id,evidence:{checksSha256:hash(example.checks)}}})+'\n';
  const write = (name,body) => writeFileSync(join(root,name),JSON.stringify(body));
  writeFileSync(join(root,'test.jsonl'),data);
  writeFileSync(join(root,'adapter','adapters.safetensors'),'test fixture, not model weights');
  const adapterSha256=hash('test fixture, not model weights');
  write('manifest.json',{inputHashes:{'test.jsonl':hash(data)}});
  write('completed.json',{trainingCompleted:true,productionPromotion:false,adapterSha256});
  for(const phase of ['before','after']) write(`${phase}-${example.id}.json`,{id:example.id,phase,response:'failed answer'});
  return {root,write,example,adapterSha256,close:()=>rmSync(root,{recursive:true,force:true})};
}
test('failed behavior remains failure despite successful training/artifact metadata',async()=>{
  const f=fixture(); try {
    let calls=0;
    const result=await scorePilot(f.root,f.root,async()=>{calls++;return {passed:false,reason:'assertion_failed'};});
    assert.equal(calls,2);
    assert.equal(result.beforePassed,0); assert.equal(result.afterPassed,0);
    assert.equal(result.productionPromotion,false); assert.equal(result.freshProcessReloadVerified,false);
  } finally { f.close(); }
});
test('tampered artifact or holdout is refused before scoring',async()=>{
  for(const name of ['test.jsonl','adapter/adapters.safetensors']){
    const f=fixture(); try {
      writeFileSync(join(f.root,name),'changed');
      await assert.rejects(scorePilot(f.root,f.root,async()=>{throw Error('must not score');}),/changed/);
    } finally {f.close();}
  }
});
test('saved-adapter replay needs actual matching answers, not a matchesInMemory claim',async()=>{
  const f=fixture(); try {
    const replay={freshProcessReload:true,adapterSha256:f.adapterSha256,results:[{id:f.example.id,response:'different',matchesInMemory:true}]};
    f.write('replay.json',replay);
    await assert.rejects(scorePilot(f.root,f.root,async()=>({passed:true})),/does not reproduce/);
    replay.results[0].response='failed answer'; f.write('replay.json',replay);
    const result=await scorePilot(f.root,f.root,async()=>({passed:false}));
    assert.equal(result.freshProcessReloadVerified,true);
    assert.equal(result.afterPassed,0);
    assert.equal(result.productionPromotion,false);
  } finally {f.close();}
});
