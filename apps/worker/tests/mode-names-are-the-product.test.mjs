/**
 * THE MODEL WAS TOLD ITS OWN NAME WAS "STONE".
 *
 * The owner has said, more than once, that the old specialist names are stale: the product is
 * Plan, Agent and Super Agent, and `clay`/`stone`/`rune` are the wire and storage values they map
 * onto (prompts.ts says so itself, in the comment above MODE_RULES). One of the three was migrated
 * and two were not. MEASURED 2026-09-21 over the real `systemPrompt`, matching /\b(Stone|Clay|Rune|
 * Golem)\b/ across the whole ~15,000-character prompt:
 *
 *   clay  -> 0 hits ("Mode: Plan.")
 *   stone -> 1 hit  ("Mode: Stone (builder).")
 *   rune  -> 1 hit  ("Mode: Rune (deep builder).")
 *
 * That is not a cosmetic inconsistency. The system prompt is the model's account of itself, and a
 * model told it is "Stone" will say "Stone" — in the reply, in the plan, in the summary the owner
 * reads. The rename cannot be done on the wire without a versioned protocol bump (every stored
 * `mode` column, the plugin, the browser, MCP, Discord and the automations read these strings), and
 * it does not need to be: nothing about the wire value reaches a person, and this does.
 *
 * WHY THE WHOLE PROMPT AND NOT JUST THE MODE LINE. "Stone" is also an ordinary English word and a
 * Roblox material, so a sweep this wide could one day fire on a legitimate art-direction sentence.
 * It is still the right aim, because the failure being guarded is the name reaching the reader and
 * the reader cannot tell the two uses apart. Measured today the brief uses the word in neither case:
 * zero occurrences of /\b(stone|clay|rune)\b/ across the full prompt with `sceneKind` and `uiBrief`
 * supplied. If a material reference ever genuinely needs it, write it lowercase and narrow THIS
 * assertion to the capitalised form — do not delete it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { systemPrompt } from '../src/prompts.ts';

const base = {
  studioConnected: true, placeName: 'Place1', projectName: 'proj',
  memorySummary: null, memoryFacts: [], fenceId: 'f1xtur3a',
};

/** The wire value on the left, the name the owner uses on the right. */
const PRODUCT_NAME = { clay: 'Plan', stone: 'Agent', rune: 'Super Agent' };

test('the prompt introduces the mode by the name the owner uses for it', () => {
  for (const [mode, product] of Object.entries(PRODUCT_NAME)) {
    const prompt = systemPrompt({ ...base, mode });
    const line = /^Mode: .*$/m.exec(prompt);
    assert.ok(line, `${mode}: the prompt has no "Mode:" line at all`);
    assert.ok(line[0].startsWith(`Mode: ${product}`),
      `${mode}: the model is introduced to itself as something the product does not call it: ${line[0].slice(0, 70)}`);
  }
});

test('no legacy specialist name reaches the model, in any mode, with or without the art brief', () => {
  const LEGACY = /\b(Stone|Clay|Rune|Golem)\b/g;
  for (const mode of Object.keys(PRODUCT_NAME)) {
    for (const extra of [{}, { sceneKind: 'medieval castle', uiBrief: 'RULE ONE' }]) {
      const prompt = systemPrompt({ ...base, mode, ...extra });
      const hits = [...prompt.matchAll(LEGACY)].map((m) => prompt.slice(Math.max(0, m.index - 40), m.index + 40));
      assert.deepEqual(hits, [], `${mode}${extra.sceneKind ? ' (with brief)' : ''}: ${hits.join(' || ')}`);
    }
  }
});
