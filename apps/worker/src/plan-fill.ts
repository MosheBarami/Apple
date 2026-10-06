/**
 * PLAN-FILL (M5 5.0, model call 2). For the blocks intake selected, the model fills each block's parameters. Every
 * answer is validated against the block's schema (block-schema.ts, defaults filled in); field-level errors go back to
 * the model, at most twice. Parameters for a block that was not selected are an error, never run.
 *
 * repairParam is the interpreter's retry (recipe.ts): a check that names a parameter failed, so the model is told which
 * parameter, what was wanted and what the place showed, and returns a new value for it.
 */
import { BLOCKS } from './blocks.generated.ts';
import type { Block } from './block-types.ts';
import { validateParams } from './block-schema.ts';
import { type CallModel, type ModelMessage, replyObject } from './block-model.ts';

export const MAX_FILL_RETRIES = 2;

function paramSheet(block: Block): string {
  const lines = Object.entries(block.block.params.properties).map(([name, s]) => `  ${name}: ${JSON.stringify({ ...s, description: undefined })}${s.description ? ` (${s.description})` : ''}`);
  return `${block.block.id}: ${block.hint}\n${lines.join('\n')}`;
}

const SYSTEM = `You fill in the parameters of building blocks for a request to change a Roblox game.
Answer with one JSON object and nothing else, keyed by block id: {"<block id>": {"<parameter>": value}}.
Use the creator's words where they give a value. Leave a parameter out to keep its default.`;

/** The answer checked against every selected block's schema: the filled parameters, or each field's error. Pure. */
export function checkFill(answer: Record<string, unknown> | null, selected: string[], blocks: Record<string, Block> = BLOCKS):
  { ok: true; params: Record<string, Record<string, unknown>> } | { ok: false; errors: string[] } {
  if (!answer) return { ok: false, errors: ['the answer was not one JSON object'] };
  const errors: string[] = [];
  for (const id of Object.keys(answer)) if (!selected.includes(id)) errors.push(`${id}: not a selected block`);
  const params: Record<string, Record<string, unknown>> = {};
  for (const id of selected) {
    const r = validateParams(blocks[id]!.block, answer[id]);
    if (r.ok) params[id] = r.params;
    else errors.push(...r.errors.map((e) => `${id}.${e}`));
  }
  return errors.length ? { ok: false, errors } : { ok: true, params };
}

export async function fillParams(input: { request: string; selected: string[]; callModel: CallModel; blocks?: Record<string, Block> }):
  Promise<{ ok: true; params: Record<string, Record<string, unknown>> } | { ok: false; errors: string[] }> {
  const blocks = input.blocks ?? BLOCKS;
  const messages: ModelMessage[] = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Blocks:\n${input.selected.map((id) => paramSheet(blocks[id]!)).join('\n\n')}\n\nRequest:\n${input.request}` },
  ];
  let last: { ok: false; errors: string[] } = { ok: false, errors: ['no answer'] };
  for (let attempt = 0; attempt <= MAX_FILL_RETRIES; attempt += 1) {
    const text = await input.callModel(messages);
    const r = checkFill(replyObject(text), input.selected, blocks);
    if (r.ok) return r;
    last = r;
    messages.push({ role: 'assistant', content: text }, { role: 'user', content: `Fix these and answer again with the whole JSON object:\n${r.errors.join('\n')}` });
  }
  return last;
}

/** A corrected parameter set after a check on `param` failed, or null when the model gives no usable value. */
export async function repairParam(input: {
  request: string; blockId: string; param: string; problem: string; params: Record<string, unknown>; callModel: CallModel; blocks?: Record<string, Block>;
}): Promise<Record<string, unknown> | null> {
  const block = (input.blocks ?? BLOCKS)[input.blockId];
  if (!block || !(input.param in block.block.params.properties)) return null;
  const text = await input.callModel([
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Block:\n${paramSheet(block)}\n\nRequest:\n${input.request}\n\nThese parameters were used: ${JSON.stringify(input.params)}\nThe check on "${input.param}" failed: ${input.problem}\nAnswer with {"${input.blockId}": {"${input.param}": <a better value>}}.` },
  ]);
  const value = (replyObject(text)?.[input.blockId] as Record<string, unknown> | undefined)?.[input.param];
  if (value === undefined) return null;
  const r = validateParams(block.block, { ...input.params, [input.param]: value });
  return r.ok ? r.params : null;
}
