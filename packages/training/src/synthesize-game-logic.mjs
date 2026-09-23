#!/usr/bin/env node
/**
 * Grow the game-logic curriculum by EXECUTOR-VERIFIED synthesis (training v5, D-VISION-1).
 *
 * A teacher model (Apple's production model, through /api/admin/model-test, so every call is
 * metered by the worker's neuron caps) drafts a whole example: prompt, standalone Luau answer,
 * assertion checks and a one-site behavioural mutation. The draft is kept ONLY if the same gate the
 * hand-written curricula pass accepts it: `verifyExample` runs the answer with the real `luau`
 * binary, the checks must pass, and the mutated answer must be rejected by an assertion. Drafts that
 * overlap the evaluation tasks are dropped before execution. Nothing a teacher claims is trusted;
 * only what the executor observed.
 *
 * Usage: GOLEM_ADMIN_KEY=... node src/synthesize-game-logic.mjs [--variants 3] [--concurrency 4] [--limit N]
 *    or: TEACHER_URL=http://127.0.0.1:8080 node src/synthesize-game-logic.mjs ...  (local mlx_lm.server, no product spend)
 * Writes data/game-logic-synth-v1/examples.json (accepted) and rejects.json (reason per draft).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyExample } from './build-game-logic.mjs';
import { loadEvalGuard, detectContextDependencies } from './audit-dataset.mjs';
import { shingles } from './build-dataset.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '../data/game-logic-synth-v1');
const BASE = process.env.API_BASE || 'https://apple.moshe-barami111.workers.dev';
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};

/** Engine-independent Roblox game systems a kid's game needs. One family per topic. */
export const TOPICS = [
  ['coin-wallet', 'a currency wallet with add, spend (refuse overspend) and balance'],
  ['ability-cooldown', 'per-ability cooldowns driven by an injected clock value'],
  ['xp-leveling', 'experience points to level conversion with a growing XP curve'],
  ['inventory-stacks', 'an inventory with stack limits per item and slot count'],
  ['shop-purchase', 'validating a shop purchase: price, stock, currency, max owned'],
  ['damage-calc', 'damage after armor and resistance with clamping and a minimum damage'],
  ['health-regen', 'health regeneration ticks capped at max health with a delay after damage'],
  ['wave-spawner', 'enemy wave composition that scales with the wave number'],
  ['round-timer', 'a round state machine: waiting, intermission, playing, ended'],
  ['team-balance', 'assigning a joining player to the smaller team, ties by lowest team index'],
  ['leaderboard-rank', 'ranking players by score with ties sharing a rank (1,1,3)'],
  ['loot-table', 'weighted loot selection driven by an injected number in [0,1)'],
  ['quest-progress', 'quest objectives with counters and completion detection'],
  ['daily-reward', 'a daily reward streak using injected day numbers, reset on a missed day'],
  ['checkpoint-obby', 'obby checkpoints: only advance to the next stage, never skip or go back'],
  ['remote-rate-limit', 'a per-player token-bucket rate limiter for remote calls'],
  ['trade-validate', 'validating a two-player trade offer against both inventories'],
  ['pet-hatch', 'egg hatching odds with pity counter guaranteeing a rare after N failures'],
  ['tycoon-dropper', 'tycoon dropper income per tick with upgrade multipliers'],
  ['rebirth', 'rebirth: reset cash, increase multiplier, require a cash threshold'],
  ['combo-counter', 'a hit combo counter that resets after a time gap, using an injected clock'],
  ['stamina', 'sprint stamina drain and recovery with an exhaustion lockout'],
  ['upgrade-cost', 'exponential upgrade pricing with a max level'],
  ['badge-unlock', 'deciding which badges a stat snapshot newly unlocks, without duplicates'],
  ['vote-map', 'map voting: tally votes, one vote per player, tie broken by earliest option'],
  ['kill-feed', 'a bounded kill feed that keeps the latest N entries in order'],
  ['zone-detect', 'which rectangular zone contains a 2D point, smallest zone wins on overlap'],
  ['grid-build', 'placing blocks on a build grid: snapping, bounds and occupied-cell refusal'],
  ['save-migrate', 'migrating an old save table version to the current schema with defaults'],
  ['save-validate', 'validating a player save table shape before trusting it'],
  ['chat-filter-len', 'trimming and length-limiting a chat message, refusing empty or non-string'],
  ['matchmaking', 'grouping queued players into matches of a fixed size by skill bands'],
  ['projectile-step', 'stepping a projectile position with gravity per fixed timestep'],
  ['status-effects', 'status effects with durations that tick down and expire'],
  ['crafting', 'crafting a recipe: check ingredients, consume them, produce output atomically'],
  ['friend-bonus', 'a cash bonus multiplier based on the number of friends in the server, capped'],
  ['boss-phases', 'boss phase selection from remaining health thresholds'],
  ['gamepass-perks', 'computing a player perk set from owned gamepass ids'],
  ['timer-format', 'formatting seconds as M:SS or H:MM:SS for a countdown label'],
  ['spawn-select', 'choosing the spawn point farthest from all enemies (2D)'],
  ['auction-bid', 'accepting auction bids: higher than current by a minimum increment, before end time'],
  ['energy-refill', 'an energy meter refilling one unit per interval up to a cap, from injected timestamps'],
  ['codes-redeem', 'redeeming promo codes: case-insensitive, once per player, expiry by injected day'],
  ['race-lap', 'race lap counting that requires passing checkpoints in order'],
  ['plot-claim', 'claiming one free tycoon plot per player and releasing it on leave'],
  ['dmg-numbers', 'aggregating damage numbers per target within a short window'],
  ['bank-interest', 'compound interest ticks on a bank balance with a cap and integer rounding down'],
  ['fishing-rarity', 'fishing catch rarity from an injected roll and a luck bonus'],
  ['elevator-queue', 'an elevator request queue serving floors in the current direction first'],
  ['tower-targeting', 'tower defense target choice: first, last, strongest, within range'],
];

const SYSTEM = `You write training examples for a Roblox Luau assistant. Reply with ONE JSON object and nothing else:
{"prompt": string, "source": string, "checks": string, "mutation": [string, string]}
Rules:
- "prompt": a precise spec a kid's game developer would ask for, naming the function(s) the module returns and every edge case (invalid input returns nil or false, as you specify).
- "source": a STANDALONE Luau module that ends with \`return\` of a function or a table of functions. No Roblox services, no game/workspace/script, no require, no wait/task, no os.time — time and randomness are passed in as arguments. Plain local helpers only; no globals.
- "checks": 8-20 lines of \`assert(...)\` that exercise the returned value through a local named \`candidate\` (already bound to what the module returns), covering normal cases and edge cases.
- "mutation": [before, after] where before is an exact substring that occurs EXACTLY ONCE in source, and replacing it with after is a small realistic bug that at least one assert catches.
- Everything must actually run under the luau CLI.`;

// TEACHER_URL points the teacher at a local OpenAI-compatible server (`mlx_lm.server`) instead of
// the live worker. The worker path draws on the product's SHARED daily capacity — the same budget
// customers build with — so bulk synthesis belongs on this machine, where it costs nothing.
const TEACHER_URL = process.env.TEACHER_URL;

async function askLocal(prompt) {
  const r = await fetch(`${TEACHER_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }], max_tokens: 4000, temperature: 0.7 }),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
  if (!r.ok) return { ok: false, error: `local teacher HTTP ${r.status}` };
  const body = await r.json();
  return { ok: true, text: body.choices?.[0]?.message?.content ?? '' };
}

async function ask(prompt, key) {
  if (TEACHER_URL) return askLocal(prompt);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetch(`${BASE}/api/admin/model-test`, {
      method: 'POST',
      headers: { 'X-Admin-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'agent', system: SYSTEM, prompt, maxTokens: 4000 }),
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
    if (r.ok) return r.json();
    const transient = r.status === 0 || r.status === 429 || r.status >= 500;
    const detail = (await r.text().catch(() => '')).slice(0, 200);
    if (!transient) return { ok: false, error: `HTTP ${r.status} ${detail}` };
    await new Promise((res) => setTimeout(res, 1500 * attempt * attempt));
  }
  return { ok: false, error: 'exhausted retries' };
}

/** Pull the first balanced JSON object out of a reply that may carry prose or a code fence. */
export function extractJson(text) {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

const normalize = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

/** The same gates build-game-logic applies, in the same order; returns a reason or null. */
export function judge(example, guard, verify = verifyExample) {
  const { prompt, source, checks, mutation } = example;
  if (typeof prompt !== 'string' || typeof source !== 'string' || typeof checks !== 'string') return 'missing_fields';
  if (!Array.isArray(mutation) || mutation.length !== 2 || mutation.some((m) => typeof m !== 'string')) return 'bad_mutation_shape';
  if (!/\bassert\s*\(/.test(checks)) return 'no_asserts';
  for (const text of [prompt, source]) {
    if ([...shingles(normalize(text), 8)].some((s) => guard.shingles.has(s))) return 'evaluation_overlap';
  }
  const ctx = detectContextDependencies(source);
  if (!ctx.parseOk || !ctx.standalone || ctx.implicitGlobals?.length) return 'context_dependent';
  try {
    verify(example);
  } catch (e) {
    // Temp paths are noise to both a reader and the teacher; the luau message after them is the signal.
    return `verify:${String(e.message).replace(/^[^:]*: /, '').replace(/\/\S*\/(good|mutant)\.luau:?/g, 'line ').slice(0, 400)}`;
  }
  return null;
}

async function main() {
  const key = process.env.GOLEM_ADMIN_KEY;
  if (!key && !TEACHER_URL) { console.error('GOLEM_ADMIN_KEY or TEACHER_URL is required'); process.exit(2); }
  const variants = Number(arg('variants', '3'));
  const concurrency = Number(arg('concurrency', '4'));
  const limit = Number(arg('limit', String(TOPICS.length * variants)));
  const guard = loadEvalGuard();
  if (!guard.taskCount) throw new Error('evaluation guard is empty');

  mkdirSync(OUT, { recursive: true });
  const acceptedPath = join(OUT, 'examples.json');
  const accepted = existsSync(acceptedPath) ? JSON.parse(readFileSync(acceptedPath, 'utf8')) : [];
  const have = new Set(accepted.map((e) => e.id));
  const rejects = [];

  const jobs = [];
  for (const [slug, topic] of TOPICS) {
    for (let v = 1; v <= variants; v++) {
      const id = `synth-${slug}-${v}`;
      if (!have.has(id)) jobs.push({ id, family: `synth-${slug}`, topic, v });
    }
  }
  const todo = jobs.slice(0, limit);
  console.log(`${todo.length} drafts to request (${accepted.length} already accepted)`);

  let next = 0;
  const angles = ['the core rules', 'a harder variant with more edge cases', 'a variant that returns a table of several related functions'];
  async function worker() {
    while (next < todo.length) {
      const job = todo[next++];
      const res = await ask(`Topic: ${job.topic}.\nFocus on ${angles[(job.v - 1) % angles.length]}.`, key);
      if (!res.ok) { rejects.push({ id: job.id, reason: `request:${res.error}` }); continue; }
      let draft = extractJson(String(res.text ?? ''));
      if (!draft) { rejects.push({ id: job.id, reason: 'no_json' }); continue; }
      let example = { id: job.id, family: job.family, prompt: draft.prompt, source: draft.source, checks: draft.checks, mutation: draft.mutation };
      let reason = judge(example, guard);
      // ONE repair round: the executor's own words go back to the teacher. The repaired draft faces
      // the identical gate, so a repair can only turn a rejection into an accept by actually passing.
      if (reason?.startsWith('verify:')) {
        const fix = await ask(`Your previous example failed verification.\nFailure: ${reason.slice(7)}\n` +
          `Previous example:\n${JSON.stringify({ prompt: draft.prompt, source: draft.source, checks: draft.checks, mutation: draft.mutation })}\n` +
          `Return the corrected JSON object (fix the source, the checks, or pick a mutation an assert catches).`, key);
        const repaired = fix.ok ? extractJson(String(fix.text ?? '')) : null;
        if (repaired) {
          example = { ...example, prompt: repaired.prompt, source: repaired.source, checks: repaired.checks, mutation: repaired.mutation };
          reason = judge(example, guard);
          if (reason) reason = `repair-${reason}`;
        }
      }
      if (reason) { rejects.push({ id: job.id, reason }); continue; }
      accepted.push({ ...example, teacher: TEACHER_URL ? `local:${process.env.TEACHER_MODEL ?? 'mlx'}` : 'worker:agent' });
      writeFileSync(acceptedPath, JSON.stringify(accepted, null, 2) + '\n');
      process.stdout.write(`+ ${job.id}\n`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  writeFileSync(join(OUT, 'rejects.json'), JSON.stringify(rejects, null, 2) + '\n');
  const why = {};
  for (const r of rejects) why[r.reason.split(':')[0]] = (why[r.reason.split(':')[0]] ?? 0) + 1;
  console.log(`accepted ${accepted.length}  rejected ${rejects.length}`, why);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
