import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, observationGet, collectMessages } from './observe-run.mjs';
const m = { projectId: 'project', prompt: 'Frozen brief', createdAt: '2026-09-26T12:00:00Z', bounds: { credits: 300, durationMs: 600000 } };
test('unpaired preparation cannot become a pass or a started trial', () => {
  const s = summarize(m, { pluginConnected: false, pairingCode: 'SECRET' }, [], []);
  assert.equal(s.status, 'not-started'); assert.equal(s.acceptance, 'unmeasured');
  assert.ok(!JSON.stringify(s).includes('SECRET'));
});
test('provider usage belongs only to this project and trial assistant IDs', () => {
  const messages = [{ role: 'user', content: 'Frozen brief', createdAt: '2026-09-26T12:01:00Z' }, { id: 'run', role: 'assistant', createdAt: '2026-09-26T12:02:00Z', creditsSpent: 12, stopReason: 'done' }];
  const s = summarize(m, {}, messages, [{ projectId: 'project', runId: 'run', neurons: 30 }, { projectId: 'other', runId: 'run', neurons: 100 }, { projectId: 'project', runId: 'old', neurons: 100 }]);
  assert.equal(s.recordedNeurons, 30); assert.equal(s.recordedCredits, 12);
  assert.equal(s.acceptance, 'unmeasured');
});
test('active run crosses time bound without fabricating active spend or termination', () => {
  const s = summarize(m, { agentStatus: 'running' }, [{ role: 'user', content: 'Frozen brief', createdAt: m.createdAt }], [], Date.parse(m.createdAt) + 600001);
  assert.equal(s.needsStop, true); assert.equal(s.status, 'running');
  assert.equal(s.activeTurnSpendAvailable, false);
});

test('a preparation message cannot start an unpaired trial', () => {
  const s = summarize(m, { pluginConnected: false, agentStatus: 'idle' }, [{role:'user', content:'Prepare this place', createdAt:m.createdAt}], []);
  assert.equal(s.status, 'not-started'); assert.equal(s.startedAt, null);
});
test('persisted start survives a later transcript window and exposes missing coverage', () => {
  const s = summarize({...m, startedAt:m.createdAt}, {agentStatus:'running'}, Array.from({length:101}, (_,i)=>({role:'assistant',id:String(i),createdAt:'2026-09-26T12:09:00Z'})), [], Date.parse(m.createdAt)+600001, {messagesTruncated:true,providerLogsTruncated:true});
  assert.equal(s.elapsedMs,600001); assert.equal(s.needsStop,true);
  assert.equal(s.coverage.providerLogsTruncated,true);
});
test('admin observation refuses redirects before credentials can be forwarded', async () => {
  let calls=0;
  await assert.rejects(observationGet('private-key','/api/admin/logs', async (url,options)=>{
    calls++; assert.equal(options.redirect,'error');
    throw new TypeError('redirect refused');
  }), /redirect refused/);
  assert.equal(calls,1);
});

test('101 messages at a cursor boundary cannot silently become complete coverage', async () => {
  const all=Array.from({length:101},(_,i)=>({id:String(i),createdAt:'2026-09-26T12:01:00Z'}));
  const window=all.slice(0,100);
  const c=await collectMessages(async route=>{
    assert.ok(route.endsWith('before=1790424060001'));
    return {messages:window};
  },'project',m.createdAt,window);
  assert.equal(c.truncated,true);
});
