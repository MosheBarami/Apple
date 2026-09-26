import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, observationGet, collectMessages } from './observe-run.mjs';
const m = { projectId: 'project', prompt: 'Frozen brief', createdAt: '2026-09-26T12:00:00Z', bounds: { credits: 300, durationMs: 600000 } };
test('unpaired preparation cannot become a pass or a started trial', () => {
  const s = summarize(m, { pluginConnected: false, pairingCode: 'SECRET' }, [], []);
  assert.equal(s.status, 'not-started'); assert.equal(s.acceptance, 'unmeasured');
  assert.ok(!JSON.stringify(s).includes('SECRET'));
});
test('provider usage belongs only to this project after the trial start', () => {
  const messages = [{ role: 'user', content: 'Frozen brief', createdAt: '2026-09-26T12:01:00Z' }, { id: 'run', role: 'assistant', createdAt: '2026-09-26T12:02:00Z', creditsSpent: 12, stopReason: 'done' }];
  const at = Date.parse(messages[0].createdAt);
  const s = summarize(m, {}, messages, [{ projectId: 'project', runId: 'run', at, neurons: 30 }, { projectId: 'other', runId: 'run', at, neurons: 100 }, { projectId: 'project', runId: 'old', at: at - 1, neurons: 100 }]);
  assert.equal(s.recordedNeurons, 30); assert.equal(s.recordedCredits, 12);
  assert.equal(s.acceptance, 'unmeasured');
});
test('active provider usage is counted without a completed assistant and remains a lower bound', () => {
  const startedAt = '2026-09-26T12:14:40Z';
  const at = Date.parse(startedAt);
  const events = Array.from({ length: 33 }, (_, i) => ({
    projectId: m.projectId, runId: 'active', at: at + i,
    neurons: i === 32 ? 136 : 130, secret: 'DO-NOT-PERSIST',
  }));
  events.push(
    { projectId: m.projectId, runId: 'prior', at: at - 1, neurons: 999 },
    { projectId: 'other', runId: 'active', at, neurons: 999 },
    { projectId: m.projectId, runId: 'invalid', at: startedAt, neurons: 999 },
  );
  const s = summarize({ ...m, startedAt }, { agentStatus: 'running' }, [], events, at + 1000, { providerLogsTruncated: true });
  assert.equal(s.providerCalls, 33);
  assert.equal(s.recordedNeurons, 4296);
  assert.equal(s.recordedCredits, 0);
  assert.equal(s.activeTurnSpendAvailable, false);
  assert.equal(s.providerUsageLowerBound, true);
  assert.equal(s.coverage.providerLogsTruncated, true);
  assert.equal(s.acceptance, 'unmeasured');
  assert.ok(!JSON.stringify(s).includes('DO-NOT-PERSIST'));
  const preparation = summarize(m, { agentStatus: 'idle' }, [], events, at + 1000);
  assert.equal(preparation.providerCalls, 0);
  assert.equal(preparation.status, 'not-started');
});
test('sealed trial excludes later same-project provider calls and assistant turns', () => {
  const startedAt = '2026-09-26T12:14:40Z';
  const endedAt = '2026-09-26T12:24:40.104Z';
  const endMs = Date.parse(endedAt);
  const messages = [
    { role: 'assistant', id: 'trial', createdAt: endedAt, creditsSpent: 267 },
    { role: 'assistant', id: 'later', createdAt: new Date(endMs + 1).toISOString(), creditsSpent: 99 },
  ];
  const events = [
    { projectId: m.projectId, runId: 'trial', at: endMs, neurons: 8007 },
    { projectId: m.projectId, runId: 'later', at: endMs + 1, neurons: 999 },
  ];
  const s = summarize({ ...m, startedAt, endedAt }, { agentStatus: 'idle' }, messages, events, endMs + 1000);
  assert.equal(s.recordedCredits, 267);
  assert.equal(s.recordedNeurons, 8007);
  assert.equal(s.providerCalls, 1);
  assert.deepEqual(s.turns.map(t => t.runId), ['trial']);
  assert.deepEqual(s.provider.map(e => e.runId), ['trial']);
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
