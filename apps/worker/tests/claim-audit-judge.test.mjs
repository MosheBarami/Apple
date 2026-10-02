/**
 * THE OPTIONAL TEXT JUDGE (SELF_CHECK=full): a cheap model reads the reply against the evidence for claims the deterministic
 * extractor does not read.
 *
 * It may ADD findings and never remove one, it may only point at words the agent actually wrote, and it can never make a claim
 * "supported": the verdicts that matter stay deterministic. A model that fails or answers nothing readable adds nothing — and an
 * absence of findings from a failed judge is not a finding that the reply is fine.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { newLedger, recordToolCall } from '../src/evidence-ledger.ts';
import { judgeReply, buildJudgeMessages, parseJudge, JUDGE_MAX_FINDINGS } from '../src/claim-audit-judge.ts';

const ledger = () => {
  const l = newLedger();
  recordToolCall(l, { tool: 'set_properties', kind: 'mutation', args: { path: 'game.Workspace.Door', props: { Color: { t: 'Color3', v: [1, 0, 0] } } }, result: {}, ok: true });
  return l;
};
const chatReturning = (text, neurons = 31) => async (req, opts) => { chatReturning.calls.push({ req, opts }); return { text, neurons }; };
chatReturning.calls = [];

test('the prompt asks only for concrete unsupported claims, never for quality, and treats both texts as data', () => {
  const { system, user } = buildJudgeMessages('The lamp turns on at night.', ledger());
  assert.match(system, /concrete/i);
  assert.match(system, /no line of the evidence/i);
  assert.match(system, /never (?:judge|grade|score)/i);
  assert.match(system, /untrusted/i);
  assert.match(user, /The lamp turns on at night\./);
  assert.match(user, /Door/, 'the evidence digest is in it');
  assert.ok(user.length < 4500, `${user.length}`);
});

test('parseJudge reads the answer, bounds it and drops anything that is not a claim with a reason', () => {
  const out = parseJudge('Sure. {"unsupported":[{"claim":"The lamp turns on at night.","why":"nothing played the game"},{"claim":"x","why":""},7,{"why":"no claim"}]}');
  assert.deepEqual(out, [{ claim: 'The lamp turns on at night.', why: 'nothing played the game' }]);
  assert.equal(parseJudge('{"unsupported":[]}').length, 0);
  assert.equal(parseJudge('no json here'), null);
  const many = parseJudge(JSON.stringify({ unsupported: Array.from({ length: 12 }, (_, i) => ({ claim: `claim ${i} ${'x'.repeat(400)}`, why: 'why '.repeat(100) })) }));
  assert.equal(many.length, JUDGE_MAX_FINDINGS);
  assert.ok(many.every((m) => m.claim.length <= 160 && m.why.length <= 160));
});

test('findings are unsupported, of kind "other", and only for words the agent actually wrote', async () => {
  const chat = chatReturning(JSON.stringify({ unsupported: [
    { claim: 'The lamp turns on at night.', why: 'nothing observed the lamp' },
    { claim: 'The fountain sprays water.', why: 'invented by the judge: the reply never said it' },
  ] }));
  const r = await judgeReply({ reply: 'Done. The lamp turns on at night. Enjoy!', ledger: ledger(), existing: [] }, chat);
  assert.equal(r.ok, true);
  assert.equal(r.findings.length, 1, 'a claim the reply never made is dropped');
  const f = r.findings[0];
  assert.equal(f.verdict, 'unsupported');
  assert.equal(f.claim.kind, 'other');
  assert.match(f.claim.sentence, /lamp turns on at night/);
  assert.equal(f.needs, 'read');
  assert.equal(r.neurons, 31);
});

test('a claim the deterministic audit already has is not reported twice', async () => {
  const existing = [{ claim: { kind: 'behaviour', sentence: 'The lamp turns on at night.' }, verdict: 'unsupported', because: 'x', needs: 'play' }];
  const chat = chatReturning(JSON.stringify({ unsupported: [{ claim: 'The lamp turns on at night.', why: 'nothing observed it' }] }));
  const r = await judgeReply({ reply: 'The lamp turns on at night.', ledger: ledger(), existing }, chat);
  assert.deepEqual(r.findings, []);
});

test('one cheap call: the memory-sized model, a JSON answer, a kind that names the self-check', async () => {
  chatReturning.calls.length = 0;
  await judgeReply({ reply: 'Done. The lamp turns on at night. Enjoy!', ledger: ledger(), existing: [] }, chatReturning('{"unsupported":[]}'));
  assert.equal(chatReturning.calls.length, 1);
  assert.equal(chatReturning.calls[0].req.model, 'memory');
  assert.equal(chatReturning.calls[0].opts.kind, 'selfcheck:judge');
  assert.ok(chatReturning.calls[0].req.maxTokens <= 600);
});

test('a judge that throws, or answers nothing readable, adds nothing and says it failed', async () => {
  const thrown = await judgeReply({ reply: 'Done. The lamp turns on at night. Enjoy!', ledger: ledger(), existing: [] }, async () => { throw new Error('workers-ai 503'); });
  assert.deepEqual([thrown.ok, thrown.findings, thrown.neurons], [false, [], 0]);
  const junk = await judgeReply({ reply: 'Done. The lamp turns on at night. Enjoy!', ledger: ledger(), existing: [] }, chatReturning('I think it is fine!', 12));
  assert.deepEqual([junk.ok, junk.findings, junk.neurons], [false, [], 12]);
});

test('a reply too short to carry a claim is not sent to the model at all', async () => {
  chatReturning.calls.length = 0;
  const r = await judgeReply({ reply: 'Done.', ledger: ledger(), existing: [] }, chatReturning('{"unsupported":[]}'));
  assert.equal(chatReturning.calls.length, 0);
  assert.deepEqual([r.ok, r.findings, r.neurons], [true, [], 0]);
});
