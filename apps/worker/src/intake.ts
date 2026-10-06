/**
 * INTAKE (M5 5.0, model call 1). The model reads the creator's request and a compact menu (each block's id and one-line
 * summary) and answers which blocks the request needs, whether it also needs custom code, and a question when the
 * request cannot be built without one. The model picks; this module only checks the answer: an id that is not a block,
 * or a selected block whose dependency was not selected, goes back to the model once with the reason. It never adds or
 * drops a block itself (plan section 3).
 */
import { BLOCKS } from './blocks.generated.ts';
import type { Block } from './block-types.ts';
import { type CallModel, type ModelMessage, replyObject } from './block-model.ts';

export interface Intake { blocks: string[]; custom: boolean; question?: string }

export function blockMenu(blocks: Record<string, Block> = BLOCKS): string {
  return Object.values(blocks)
    .map((b) => `${b.block.id} (${b.block.kind}): ${b.block.summary}${b.block.depends.length ? ` Needs: ${b.block.depends.join(', ')}.` : ''}`)
    .join('\n');
}

const SYSTEM = `You choose the building blocks for a request to change a Roblox game.
Answer with one JSON object and nothing else: {"blocks": [ids], "custom": true|false, "question": "..."}.
- blocks: the ids from the menu that the request needs, each once. Include every block a chosen block needs.
- custom: true only when part of the request is game logic no block covers.
- question: only when the request cannot be built without an answer from the creator; otherwise leave it out.
Choose by what the request asks for, not by words it happens to share with a summary.`;

/** The model's answer as an Intake, or why it is not one. Pure. */
export function parseIntake(text: string, blocks: Record<string, Block> = BLOCKS): { ok: true; intake: Intake } | { ok: false; error: string } {
  const o = replyObject(text);
  if (!o) return { ok: false, error: 'the answer was not one JSON object' };
  if (!Array.isArray(o.blocks) || o.blocks.some((b) => typeof b !== 'string')) return { ok: false, error: '"blocks" must be a list of ids' };
  const ids = [...new Set(o.blocks as string[])];
  const unknown = ids.filter((id) => !blocks[id]);
  if (unknown.length) return { ok: false, error: `not on the menu: ${unknown.join(', ')}` };
  const missing = ids.flatMap((id) => blocks[id]!.block.depends.filter((d) => !ids.includes(d)).map((d) => `${id} needs ${d}`));
  if (missing.length) return { ok: false, error: `${missing.join('; ')}: select it too, or drop the block that needs it` };
  if (typeof o.custom !== 'boolean') return { ok: false, error: '"custom" must be true or false' };
  const question = typeof o.question === 'string' && o.question.trim() ? o.question.trim().slice(0, 300) : undefined;
  return { ok: true, intake: { blocks: ids, custom: o.custom, ...(question ? { question } : {}) } };
}

export async function intake(request: string, callModel: CallModel, blocks: Record<string, Block> = BLOCKS): Promise<{ ok: true; intake: Intake } | { ok: false; error: string }> {
  const messages: ModelMessage[] = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Menu:\n${blockMenu(blocks)}\n\nRequest:\n${request}` },
  ];
  let last: { ok: false; error: string } = { ok: false, error: 'no answer' };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const text = await callModel(messages);
    const parsed = parseIntake(text, blocks);
    if (parsed.ok) return parsed;
    last = parsed;
    messages.push({ role: 'assistant', content: text }, { role: 'user', content: `That answer cannot be used: ${parsed.error}. Answer again with the JSON object only.` });
  }
  return last;
}
