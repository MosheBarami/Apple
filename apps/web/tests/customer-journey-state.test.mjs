/**
 * Customer-journey state boundaries that package-level green tests do not exercise together.
 *
 * This file is deliberately narrow: project A/B navigation races, durable-history/live-wire merge,
 * access-gated chat actions, and composer-owned project resources. The pure fence/merge assertions
 * execute the same functions the hook uses; source assertions pin the React wiring to those guards.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chatItemFromMessageDto, createProjectRequestFence, mergeHistoryWithLive } from '../src/lib/project-socket-state.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const read = (...parts) => readFileSync(join(WEB, 'src', ...parts), 'utf8');
const SOCKET = read('lib', 'use-project-socket.ts');
const WORKSPACE = read('routes', 'workspace.tsx');
const COMPOSER = read('components', 'ws', 'composer.tsx');
const API = read('lib', 'api.ts');

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('project B wins even when project A history/error callbacks settle later', async () => {
  const fence = createProjectRequestFence('project-a');
  const aTicket = fence.begin('history');
  const a = deferred();
  const observed = [];
  a.promise.then(
    (value) => { if (fence.accepts(aTicket)) observed.push(['ready', value]); },
    (error) => { if (fence.accepts(aTicket)) observed.push(['error', error.message]); },
  );

  fence.select('project-b');
  const bTicket = fence.begin('history');
  const b = deferred();
  b.promise.then(
    (value) => { if (fence.accepts(bTicket)) observed.push(['ready', value]); },
    (error) => { if (fence.accepts(bTicket)) observed.push(['error', error.message]); },
  );

  b.resolve('B transcript');
  await b.promise;
  a.reject(new Error('A failed late'));
  await a.promise.catch(() => undefined);
  await Promise.resolve();
  assert.deepEqual(observed, [['ready', 'B transcript']], 'late A error overwrote B state');
});

test('a newer history request in the same project invalidates the older success', () => {
  const fence = createProjectRequestFence('project-a');
  const older = fence.begin('history');
  const newer = fence.begin('history');
  assert.equal(fence.accepts(older), false);
  assert.equal(fence.accepts(newer), true);
});

test('switching projects invalidates every channel, not only history', () => {
  const fence = createProjectRequestFence('project-a');
  const history = fence.begin('history');
  const checkpoints = fence.begin('checkpoints');
  fence.select('project-b');
  assert.equal(fence.accepts(history), false);
  assert.equal(fence.accepts(checkpoints), false);
  assert.equal(fence.isSelected('project-b'), true);
  assert.equal(fence.isSelected('project-a'), false);
});

test('late durable history cannot erase terminal facts the live wire observed', () => {
  const persisted = [{
    id: 'assistant-1', role: 'assistant', mode: 'stone', content: 'persisted final answer', tools: [],
    streaming: false, createdAt: 100,
  }];
  const live = [{
    ...persisted[0], content: 'live answer', stopReason: 'error', error: 'model_failed', creditsSpent: 7,
    intent: { summary: 'Build it', checklist: ['one'], assumptions: [], questions: [] },
    deniedTools: ['run_luau'], context: { usedChars: 1200, maxChars: 4000, dropped: { groups: 1, chars: 90 } },
  }];
  const [merged] = mergeHistoryWithLive(persisted, live);
  assert.equal(merged.content, 'persisted final answer', 'durable content should remain authoritative');
  assert.equal(merged.stopReason, 'error');
  assert.equal(merged.error, 'model_failed');
  assert.equal(merged.creditsSpent, 7);
  assert.deepEqual(merged.deniedTools, ['run_luau']);
  assert.deepEqual(merged.context?.dropped, { groups: 1, chars: 90 });
  assert.equal(merged.intent?.summary, 'Build it');
});

test('history that lands mid-stream cannot roll visible assistant text back to the durable snapshot', () => {
  const history = [{
    id: 'assistant-live', role: 'assistant', mode: 'stone', content: '', tools: [], streaming: false, createdAt: 100,
  }];
  const live = [{
    id: 'assistant-live', role: 'assistant', mode: 'stone', content: 'Already visible streamed text',
    tools: [{ id: 't1', name: 'get_project_tree', state: 'running' }], streaming: true, createdAt: 100,
  }];
  const [merged] = mergeHistoryWithLive(history, live);
  assert.equal(merged.content, 'Already visible streamed text');
  assert.equal(merged.streaming, true);
  assert.equal(merged.tools[0]?.state, 'running');
});

test('history merge never invents terminal facts that neither source observed', () => {
  const history = [{ id: 'm', role: 'assistant', mode: null, content: 'done', tools: [], streaming: false, createdAt: 1 }];
  const [merged] = mergeHistoryWithLive(history, []);
  for (const key of ['stopReason', 'error', 'creditsSpent', 'intent', 'deniedTools', 'context']) {
    assert.equal(Object.hasOwn(merged, key), false, `history merge invented ${key}`);
  }
});

test('a reloaded terminal row carries the same persisted outcome/cost/context fields as live msg_end state', () => {
  const persisted = chatItemFromMessageDto({
    id: 'assistant-terminal',
    role: 'assistant',
    mode: 'stone',
    productModel: 'apple-max',
    content: 'Finished with a bounded result.',
    toolTrace: null,
    createdAt: '2026-09-18T20:00:00.000Z',
    stopReason: 'error',
    error: 'model_failed',
    creditsSpent: 9,
    context: { usedChars: 2000, maxChars: 4000, dropped: { groups: 2, chars: 120 } },
    deniedTools: ['run_luau'],
  });
  const live = {
    ...persisted,
    intent: { summary: 'Build the lobby', checklist: [], assumptions: [], questions: [] },
  };
  for (const field of ['stopReason', 'error', 'creditsSpent', 'context', 'deniedTools']) {
    assert.deepEqual(persisted[field], live[field], `reload changed persisted terminal field ${field}`);
  }
  assert.equal(persisted.stopReason, 'error');
  assert.equal(persisted.error, 'model_failed');
  assert.equal(persisted.creditsSpent, 9);
});

test('a legacy transcript row with no terminal metadata stays unknown after reload', () => {
  const legacy = chatItemFromMessageDto({
    id: 'assistant-old', role: 'assistant', mode: 'stone', content: 'Old answer', toolTrace: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  for (const field of ['stopReason', 'error', 'creditsSpent', 'context', 'deniedTools']) {
    assert.equal(Object.hasOwn(legacy, field), false, `legacy row invented ${field}`);
  }
});

test('Workspace is keyed by project id before project-owned state is constructed', () => {
  assert.match(WORKSPACE, /return <WorkspaceProjectPage key=\{projectId\} projectId=\{projectId\} \/>/);
  assert.match(WORKSPACE, /function WorkspaceProjectPage\(\{ projectId \}: \{ projectId: string \}\)/);
});

test('chat authority is loaded for the workspace and gates send, edit, retry and stop', () => {
  const access = WORKSPACE.slice(WORKSPACE.indexOf('const accessQuery'), WORKSPACE.indexOf('const onServerError'));
  assert.match(access, /enabled: projectId\.length > 0/);
  assert.doesNotMatch(access, /drawer === 'files'|drawer === 'members'/, 'chat access still waits for a drawer');
  assert.match(WORKSPACE, /const chatAllowed = allows\(access, 'chat'\)/);
  assert.match(WORKSPACE, /if \(!chatAllowed\)[\s\S]{0,220}Your draft is kept/);
  assert.match(WORKSPACE, /editable=\{item\.role === 'user' && !running && chatAllowed\}/);
  assert.match(WORKSPACE, /onRetry=\{item\.id === lastAssistantId && !running && chatAllowed/);
  assert.match(WORKSPACE, /disabled=\{conn !== 'open' \|\| !chatAllowed\}/);
});

test('falsification: removing the chat gate from edit/retry would be detected', () => {
  const weakened = WORKSPACE
    .replace(" && chatAllowed}", '}')
    .replace(' && chatAllowed ?', ' ?');
  assert.doesNotMatch(weakened, /editable=\{item\.role === 'user' && !running && chatAllowed\}/);
  assert.doesNotMatch(weakened, /onRetry=\{item\.id === lastAssistantId && !running && chatAllowed/);
});

test('history/checkpoint REST reads are abortable and aborted reads are not network failures', () => {
  assert.match(SOCKET, /historyAbortRef\.current\?\.abort\(\)/);
  assert.match(SOCKET, /checkpointsAbortRef\.current\?\.abort\(\)/);
  assert.match(SOCKET, /fetchMessages\(projectId, 100, controller\.signal\)/);
  assert.match(SOCKET, /fetchCheckpoints\(projectId, controller\.signal\)/);
  const catchBlock = API.slice(API.indexOf('} catch (error) {'), API.indexOf('throw new ApiError', API.indexOf('} catch (error) {')));
  assert.match(catchBlock, /\.name === 'AbortError'/);
  assert.ok(catchBlock.indexOf(".name === 'AbortError'") < catchBlock.indexOf('noteReachability(false)'), 'abort is classified as offline before it is recognised');
});

test('Composer owns uploads by their originating project and fences late completions', () => {
  assert.match(COMPOSER, /owners\.current\.set\(rowId, projectId\)/);
  assert.match(COMPOSER, /beginUpload\(rowId, file, projectId\)/);
  assert.match(COMPOSER, /activeProject\.current !== ownerProjectId/);
  assert.match(COMPOSER, /owners\.current\.get\(rowId\) !== ownerProjectId/);
  assert.match(COMPOSER, /dropAttachment\(ownerProjectId, attachment\.attachmentId\)/);
  assert.match(COMPOSER, /cleanupProjectUploads\(previousProject\)/);
  assert.match(COMPOSER, /setPaths\(null\)/);
  assert.match(COMPOSER, /asked\.current = ''/);
});

test('falsification: cleanup may never delete an old attachment through the newly open project', () => {
  const safe = /if \(landed && ownerProjectId\) void dropAttachment\(ownerProjectId, landed\.attachmentId\)/.test(COMPOSER);
  assert.equal(safe, true);
  const unsafe = COMPOSER.replace('dropAttachment(ownerProjectId, landed.attachmentId)', 'dropAttachment(projectId, landed.attachmentId)');
  assert.equal(/if \(landed && ownerProjectId\) void dropAttachment\(ownerProjectId, landed\.attachmentId\)/.test(unsafe), false);
});

test('the primary composer lets typed text choose its own bidi direction', () => {
  const start = COMPOSER.indexOf('id="gx-composer-input"');
  const tag = COMPOSER.slice(COMPOSER.lastIndexOf('<textarea', start), COMPOSER.indexOf('>', start) + 1);
  assert.match(tag, /dir="auto"/);
});
