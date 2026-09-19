/**
 * A completed image tool must leave the same structured result behind that the live socket sent.
 *
 * The live `tool_end` event already carried `detail`, and reconnect snapshots did too. The missing
 * leg was the finished-run path: the Durable Object wrote only the four scalar trace fields, then
 * the web history mapper rebuilt tool rows without the panel payload. A refresh therefore turned a
 * real generated image into an assistant message with no View results panel.
 *
 * These are source-contract tests because SessionDO and the React hook both depend on platform
 * runtimes that are not available to a plain Node test. They pin the two serialization boundaries
 * independently, so either side dropping the field fails loudly.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const readSource = (path) => readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const SESSION = readSource(join(ROOT, 'apps', 'worker', 'src', 'do', 'session.ts'));
const SOCKET = readSource(join(ROOT, 'apps', 'web', 'src', 'lib', 'use-project-socket.ts'));
const PROJECT_STATE = readSource(join(ROOT, 'apps', 'web', 'src', 'lib', 'project-socket-state.ts'));
const SHARED = readSource(join(ROOT, 'packages', 'shared', 'src', 'index.ts'));

const mapperBundle = join(mkdtempSync(join(tmpdir(), 'tool-detail-history-')), 'project-socket-state.mjs');
execFileSync(join(ROOT, 'apps', 'worker', 'node_modules', '.bin', 'esbuild'), [
  join(ROOT, 'apps', 'web', 'src', 'lib', 'project-socket-state.ts'),
  '--bundle', '--format=esm', '--target=es2022', '--outfile=' + mapperBundle,
], { cwd: ROOT, stdio: 'pipe' });
const { chatItemFromMessageDto } = await import(pathToFileURL(mapperBundle).href);

test('the finished-run trace preserves the tool detail that the live event emitted', () => {
  const entryStart = SESSION.indexOf('const entry: ToolTraceEntry');
  const push = SESSION.indexOf('agent.trace.push(entry)', entryStart);
  assert.ok(entryStart >= 0, 'runStep must build a history trace entry');
  assert.ok(push > entryStart, 'the trace entry must be pushed after it is assembled');

  const entry = SESSION.slice(entryStart, push);
  assert.match(entry, /detail:\s*out\.detail/, 'history must retain the capped panel payload');
  assert.match(
    SESSION.slice(push),
    /JSON\.stringify\(agent\.trace\)/,
    'finishRun must persist the same trace that carries detail',
  );
});

test('history rehydration puts the persisted detail back on each web tool row', () => {
  const historyStart = SOCKET.indexOf('const items: ChatItem[] = res.messages.map');
  const historyEnd = SOCKET.indexOf('setMessages((live)', historyStart);
  assert.ok(historyStart >= 0, 'history mapper must exist');
  assert.ok(historyEnd > historyStart, 'history mapper must finish before state reconciliation');

  const mapper = SOCKET.slice(historyStart, historyEnd);
  assert.match(mapper, /res\.messages\.map\(chatItemFromMessageDto\)/, 'history must use the durable DTO mapper');

  const detail = { v: 1, blocks: [{ type: 'image', src: '/generated/p1/i1', alt: 'result' }] };
  const mapped = chatItemFromMessageDto({
    id: 'm1', role: 'assistant', mode: 'stone', content: 'done', createdAt: new Date(0).toISOString(),
    toolTrace: [{ tool: 'generate_image', summary: 'generated', ok: true, durationMs: 25, detail }],
  });
  assert.deepEqual(mapped.tools[0].detail, detail, 'a refreshed image panel needs its persisted structured detail');

  const assertMapperCarriesDetail = (source) => {
    const start = source.indexOf('export function chatItemFromMessageDto(');
    const end = source.indexOf('\n}\n', start);
    assert.ok(start >= 0 && end > start, 'chatItemFromMessageDto must still exist');
    assert.match(source.slice(start, end), /detail:\s*trace\.detail/, 'the DTO mapper must carry trace detail into the tool row');
  };
  assertMapperCarriesDetail(PROJECT_STATE);
  assert.throws(
    () => assertMapperCarriesDetail(PROJECT_STATE.replace('detail: trace.detail', 'detail: undefined')),
    /must carry trace detail/,
  );

  const mockStart = SOCKET.indexOf('const base: ChatItem[] = mockMessages.map');
  const mockEnd = SOCKET.indexOf('base.push({', mockStart);
  assert.ok(mockStart >= 0 && mockEnd > mockStart, 'mock history mapper must exist');
  assert.match(SOCKET.slice(mockStart, mockEnd), /detail:\s*t\.detail/, 'mock history must preserve the same wire field');
  assert.match(SHARED, /export interface ToolTraceEntry \{[\s\S]*?detail\?: unknown;/, 'the wire contract must admit detail');
});
