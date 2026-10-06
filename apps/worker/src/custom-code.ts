/**
 * CUSTOM CODE (M5 5.0): Luau the model writes when part of a request is logic no block covers. It may only build on the
 * selected blocks, so it must call at least one API they provide (block.json `provides`), and it never reaches for what
 * the plugin refuses anyway (loadstring, environment tricks, required asset ids, HttpService).
 *
 * It counts only after it passed its own test in a play test: the model writes the code and a server test script that
 * uses it and errors when it misbehaves; both are written, the place is played, and the test script is removed. When
 * the play shows any error, the code is removed too and the run reports what was seen.
 */
import type { OpResult, StudioOp } from '@studpilot/shared';
import { BLOCKS } from './blocks.generated.ts';
import type { Block } from './block-types.ts';
import { type CallModel, type ModelMessage, replyObject } from './block-model.ts';
import { summarisePlayCheck } from './playtest.ts';

export interface CustomCode { name: string; source: string; test: string }

const NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const FORBIDDEN: Array<[RegExp, string]> = [
  [/\bloadstring\b/, 'loadstring'],
  [/\b[gs]etfenv\b/, 'getfenv/setfenv'],
  [/\brequire\s*\(\s*\d/, 'require by asset id'],
  [/\bHttpService\b/, 'HttpService'],
];

export function blockApis(selected: string[], blocks: Record<string, Block> = BLOCKS): string[] {
  return selected.flatMap((id) => blocks[id]?.block.provides ?? []);
}

/** What is wrong with the code before it goes near the place. Pure. */
export function checkCustomCode(code: CustomCode, apis: string[]): string[] {
  const errors: string[] = [];
  if (!NAME.test(code.name)) errors.push('name must be a plain identifier of at most 40 characters');
  if (!code.source.trim()) errors.push('source is empty');
  if (!apis.length) errors.push('custom code needs a selected block that provides an API to build on');
  else if (!apis.some((api) => code.source.includes(api))) errors.push(`source must call one of the selected blocks' APIs: ${apis.join(', ')}`);
  for (const [re, what] of FORBIDDEN) {
    if (re.test(code.source)) errors.push(`source uses ${what}, which StudPilot does not allow`);
    if (re.test(code.test)) errors.push(`test uses ${what}, which StudPilot does not allow`);
  }
  if (!/\b(assert|error)\s*\(/.test(code.test)) errors.push('test must assert what the code does (assert or error)');
  return errors;
}

const SYSTEM = `You write a server Script in Luau for a Roblox game, for the part of a request that no building block covers.
Build on the blocks' APIs; do not re-implement what they provide. Also write a test: a second server Script that uses
your code the way a player would cause and calls error() or assert() when the result is wrong.
Answer with one JSON object and nothing else: {"name": "...", "source": "...", "test": "..."}.`;

export async function writeCustomCode(input: { request: string; selected: string[]; callModel: CallModel; blocks?: Record<string, Block> }):
  Promise<{ ok: true; code: CustomCode } | { ok: false; errors: string[] }> {
  const blocks = input.blocks ?? BLOCKS;
  const apis = blockApis(input.selected, blocks);
  const hints = input.selected.map((id) => `${id}: ${blocks[id]?.hint ?? ''}`).join('\n');
  const messages: ModelMessage[] = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Blocks in this game:\n${hints}\nAPIs you may call: ${apis.join(', ') || 'none'}\n\nRequest:\n${input.request}` },
  ];
  let last: string[] = ['no answer'];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const text = await input.callModel(messages);
    const o = replyObject(text);
    const code = o && typeof o.name === 'string' && typeof o.source === 'string' && typeof o.test === 'string'
      ? { name: o.name, source: o.source, test: o.test } : null;
    last = code ? checkCustomCode(code, apis) : ['the answer must be {"name", "source", "test"}'];
    if (code && !last.length) return { ok: true, code };
    messages.push({ role: 'assistant', content: text }, { role: 'user', content: `Fix these and answer again:\n${last.join('\n')}` });
  }
  return { ok: false, errors: last };
}

/** Writes the code and its test, plays the place, removes the test. The code stays only when the play was clean. */
export async function proveCustomCode(code: CustomCode, exec: (op: StudioOp, timeoutMs?: number) => Promise<OpResult>): Promise<{ ok: boolean; found?: string }> {
  const parent = 'game.ServerScriptService';
  const codePath = `${parent}.${code.name}`;
  const testPath = `${parent}.StudPilotProof_${code.name}`;
  const wrote = await exec({ op: 'edit_script', path: codePath, source: code.source, create: { className: 'Script', parent } }, 60_000);
  if (!wrote.ok) return { ok: false, found: `the code could not be written (${wrote.error ?? 'failed'})` };
  let result: { ok: boolean; found?: string };
  const test = await exec({ op: 'edit_script', path: testPath, source: code.test, create: { className: 'Script', parent } }, 60_000);
  if (!test.ok) result = { ok: false, found: `the test could not be written (${test.error ?? 'failed'})` };
  else {
    const played = await exec({ op: 'play_check', seconds: 8 }, 120_000);
    if (!played.ok) result = { ok: false, found: `the play test did not run (${played.error ?? 'failed'})` };
    else {
      const s = summarisePlayCheck(played.data);
      const errors = [...s.serverErrors, ...s.clientErrors];
      result = errors.length ? { ok: false, found: errors.slice(0, 3).join(' | ') } : { ok: true };
    }
  }
  await exec({ op: 'delete_instances', paths: result.ok ? [testPath] : [testPath, codePath] }, 20_000).catch(() => undefined);
  return result;
}
