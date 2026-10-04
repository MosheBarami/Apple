/**
 * THE RESEARCHED SKILLS ARE BROUGHT TO THE PLAN STEP THAT NEEDS THEM (F1).
 *
 * Measured 2026-10-04 (t1 round 1): 0 calls to search_docs / search_creation_skills / read_creation_skill in 90 tool calls,
 * with ~360 researched skills available. skill-push.ts ranks them for each plan step (the catalogue's own token scoring) and
 * pushes the top one or two with the card steer. What is pinned: a game-building step gets a relevant skill, a world-building
 * step gets worldbuilding ones, a step no skill is about gets nothing, nothing repeats, every bound holds, and the push stays
 * one harness note at the one reviewed site.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const tmp = mkdtempSync(join(tmpdir(), 'studpilot-skill-push-'));
const load = async (entry, name) => {
  const outfile = join(tmp, `${name}.mjs`);
  buildSync({ entryPoints: [join(ROOT, 'apps/worker/src', entry)], outfile, bundle: true, platform: 'node', format: 'esm', target: 'es2022', logLevel: 'error' });
  return import(pathToFileURL(outfile));
};
const push = await load('skill-push.ts', 'push');
const cards = await load('skill-cards.ts', 'cards');
const creator = await load('creator-skills.ts', 'creator');
test.after(() => rmSync(tmp, { recursive: true, force: true }));

const REQUEST = 'Make a mining game: mine glowing crystals, buy upgrades, rebirth for a multiplier and unlock deeper caves';
const planOf = (...steps) => ({ toolId: 'plan1', steps: steps.map(([title, tool, detail]) => ({ title, tool, ...(detail ? { detail } : {}), status: 'pending' })) });
const input = (plan, over = {}) => ({ plan, trace: [], request: REQUEST, state: undefined, context: {}, ...over });
const domainOf = (id) => creator.CREATOR_SKILLS.find((s) => s.id === id)?.domain;

test('a game-building plan step receives a relevant researched skill, rendered within the read ceiling', () => {
  const plan = planOf(['Write the collect, sell and rebirth scripts', 'edit_script']);
  const p = push.creatorSkillsForStep(input(plan));
  assert.ok(p, 'a step this much about a known mechanic got nothing');
  assert.ok(p.ids.length >= 1 && p.ids.length <= push.MAX_SKILLS_PER_STEP);
  assert.ok(p.ids.includes('pattern-simulator-collect-sell-rebirth'), p.ids.join(','));
  assert.match(p.message, /\[skill:pattern-simulator-collect-sell-rebirth\]/);
  assert.match(p.message, /^Before "Write the collect, sell and rebirth scripts"/);
  for (const id of p.ids) assert.ok(push.renderSkillBody(id).length <= push.SKILL_BODY_CHARS);
});

test('a world-building step takes its skills from the worldbuilding domain: building craft and world visuals', () => {
  const plan = planOf(['Shape the terrain and build enclosed walls around the play area', 'shape_terrain']);
  const p = push.creatorSkillsForStep(input(plan));
  assert.ok(p, 'a terrain step got no skill');
  for (const id of p.ids) assert.equal(domainOf(id), 'worldbuilding', `${id} is not a worldbuilding skill`);
  assert.ok(p.ids.some((id) => /^(world|build)-/.test(id)), p.ids.join(','));
  // Every tool the rule names is a registered tool.
  const tools = readFileSync(join(ROOT, 'apps/worker/src/tools.ts'), 'utf8');
  for (const t of push.WORLD_BUILDING_TOOLS) assert.match(tools, new RegExp(`^  ${t}: \\{`, 'm'), `${t} is not a registered tool`);
});

test('a lighting step gets the lighting skill, not a script skill', () => {
  const plan = planOf(['Light the world and set a readable mood with fog and ambient light', 'set_mood']);
  const p = push.creatorSkillsForStep(input(plan));
  assert.ok(p);
  assert.ok(p.ids.some((id) => /light|look|atmospheric/.test(id)), p.ids.join(','));
});

test('a step no skill is about gets nothing, and the request alone never pulls a skill in', () => {
  assert.equal(push.creatorSkillsForStep(input(planOf(['Name the project and tell me about yesterday', 'remember']))), null);
  assert.equal(push.creatorSkillsForStep(input(planOf(['Hello', 'remember']))), null);
  assert.equal(push.creatorSkillsForStep({ ...input(undefined) }), null, 'no plan, no push');
});

test('the same plan step is served once, and no skill ever repeats across a whole run', () => {
  const plan = planOf(
    ['Shape the terrain and build enclosed walls', 'shape_terrain'],
    ['Light the world and set a readable mood', 'set_mood'],
    ['Write the collect, sell and rebirth scripts', 'edit_script'],
    ['Build the upgrades shop screen', 'insert_ui_component'],
    ['Scatter props and rocks around the paths', 'scatter_instances'],
  );
  let state;
  const seen = [];
  for (let n = 0; n < 4; n++) {
    // The agent has not finished the first step: the loop reaches the site again and again.
    const p = push.creatorSkillsForStep(input(plan, { state }));
    if (n === 0) assert.ok(p, 'the first step got nothing');
    if (p) { seen.push(...p.ids); state = push.afterSkillPush(state, p); }
    else break;
  }
  assert.equal(push.creatorSkillsForStep(input(plan, { state })), null, 'the same pending step was served twice');
  // Walk the whole plan: each step done in turn.
  state = undefined;
  const trace = [];
  const all = [];
  for (const step of plan.steps) {
    const p = push.creatorSkillsForStep(input(plan, { state, trace }));
    if (p) { all.push(...p.ids); state = push.afterSkillPush(state, p); }
    trace.push({ tool: step.tool, ok: true });
  }
  assert.ok(all.length >= 3, `the run was given ${all.length} skills`);
  assert.equal(new Set(all).size, all.length, `a skill repeated: ${all.join(',')}`);
});

test('the per-run bounds stop pushes: the count, the text budget and a full transcript', () => {
  const plan = planOf(['Shape the terrain and build enclosed walls', 'shape_terrain']);
  const ids = Array.from({ length: push.MAX_SKILL_PUSHES_PER_RUN }, (_, n) => `x${n}`);
  assert.equal(push.creatorSkillsForStep(input(plan, { state: { ids, steps: [], chars: 100 } })), null, 'the count bound did not stop it');
  assert.equal(push.creatorSkillsForStep(input(plan, { state: { ids: ['x'], steps: [], chars: push.SKILL_PUSH_CHARS_PER_RUN } })), null, 'the text bound did not stop it');
  assert.equal(push.creatorSkillsForStep(input(plan, { context: { usedChars: 61_000, maxChars: 100_000 } })), null, 'a transcript past its share still got a push');
  assert.ok(push.creatorSkillsForStep(input(plan, { context: { usedChars: 30_000, maxChars: 100_000 } })), 'a transcript with room was refused');
  // The last skill that fits the text budget goes; one that does not fit is not cut to fit.
  const nearlyFull = { ids: ['x'], steps: [], chars: push.SKILL_PUSH_CHARS_PER_RUN - 200 };
  assert.equal(push.creatorSkillsForStep(input(plan, { state: nearlyFull })), null);
});

test('a long run with many steps never exceeds its skill count or characters', () => {
  const titles = [
    ['Shape the terrain and build enclosed walls', 'shape_terrain'], ['Light the world with fog and ambient light', 'set_mood'],
    ['Write the collect, sell and rebirth scripts', 'edit_script'], ['Build the upgrades shop screen', 'insert_ui_component'],
    ['Scatter rocks and trees along the paths', 'scatter_instances'], ['Build stairs and ramps between the levels', 'create_instances'],
    ['Make low-poly props from primitives', 'create_instances'], ['Add sound and ambience zones', 'insert_sound'],
    ['Add sparkle particles and effects to rare items', 'add_effect'], ['Save player data safely', 'edit_script'],
    ['Layout a grid placement system for building', 'edit_script'], ['Shape the terrain from blockout to dressed', 'edit_terrain'],
  ];
  const plan = planOf(...titles);
  let state; const trace = []; const all = [];
  for (const step of plan.steps) {
    const p = push.creatorSkillsForStep(input(plan, { state, trace }));
    if (p) { all.push(...p.ids); state = push.afterSkillPush(state, p); }
    trace.push({ tool: step.tool, ok: true });
  }
  assert.ok(all.length <= push.MAX_SKILL_PUSHES_PER_RUN, `${all.length} skills`);
  assert.ok(state.chars <= push.SKILL_PUSH_CHARS_PER_RUN, `${state.chars} chars`);
  assert.equal(new Set(all).size, all.length);
});

test('MEASURED COST: every rendered skill fits the read ceiling, and a full run costs a bounded number of tokens', () => {
  let total = 0; let max = 0;
  for (const s of creator.CREATOR_SKILLS) {
    const text = push.renderSkillBody(s.id);
    assert.ok(text && text.length <= push.SKILL_BODY_CHARS, `${s.id}: ${text?.length}`);
    total += text.length; max = Math.max(max, text.length);
  }
  const avg = total / creator.CREATOR_SKILLS.length;
  // The worst run: the cap in characters, at the budget prompt-budget.ts uses for tokens (3.5 chars a token, pessimistic).
  const worstTokens = Math.ceil(push.SKILL_PUSH_CHARS_PER_RUN / 3.5);
  console.log(`[F1 cost] skills=${creator.CREATOR_SKILLS.length} avg=${Math.round(avg)} max=${max} chars; per-run cap=${push.SKILL_PUSH_CHARS_PER_RUN} chars ~ ${worstTokens} tokens`);
  assert.ok(max <= push.SKILL_BODY_CHARS);
  assert.ok(worstTokens <= 4_100, 'a run may not spend more than ~4k tokens on pushed skills');
  assert.ok(push.SKILL_PUSH_CHARS_PER_RUN <= 0.25 * 60_000, 'the per-run skill text is more than a quarter of the context floor');
});

test('the genre card comes with the game-from-idea card for a whole-game request, on one matching word', () => {
  const r = cards.skillCardsForRun(REQUEST, true);
  assert.ok(r.ids.includes('game-from-idea'), r.ids.join(','));
  assert.ok(r.ids.includes('simulator-incremental-loop'), r.ids.join(','));
  assert.ok(r.ids.length <= cards.MAX_PROMPT_CARDS);
  // No game request, no genre card from one word.
  assert.deepEqual(cards.skillCardsForRun('Rename the project, then tell me what a rebirth is', true).ids.filter((id) => id === 'simulator-incremental-loop'), []);
  assert.deepEqual(cards.skillCardsForRun(REQUEST, false), { block: null, ids: [] });
});

test('the card steer and the skill push are one harness note at the one reviewed site', () => {
  const plan = planOf(['Write the collect, sell and rebirth scripts', 'edit_script']);
  const steer = cards.skillSteerForStep(plan, [], [], { request: REQUEST, state: undefined, context: {} });
  assert.ok(steer?.skills, 'the steer carries the new skill-push record');
  assert.match(steer.message, /\[skill:/);
  // Without the creator argument it is exactly the old card steer.
  const old = cards.skillSteerForStep(plan, [], []);
  assert.equal(old?.skills, undefined);
  const session = readFileSync(join(ROOT, 'apps/worker/src/do/session.ts'), 'utf8');
  assert.match(session, /const skillSteer = canBuild\s*\?\s*skillSteerForStep\(agent\.plan, agent\.trace, agent\.skillCardsShown \?\? \[\], \{[^}]*state: agent\.skillPush[^}]*usedChars: agent\.contextUsedChars/);
  assert.match(session, /pushHarness\(agent\.llm, skillSteer\.message\);\s*agent\.skillCardsShown = [^;]*;\s*if \(skillSteer\.skills\) agent\.skillPush = skillSteer\.skills;/);
  assert.equal((session.match(/skillSteerForStep\(/g) ?? []).length, 1, 'a second skill push site needs its own review');
});

test('no request or subject is recognised: the module holds no subject word and no per-request table', () => {
  const src = readFileSync(join(ROOT, 'apps/worker/src/skill-push.ts'), 'utf8');
  const code = src.replace(/\/\/\[\[[\s\S]*?\]\]/, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const w of ['crystal', 'cave', 'mine', 'mining', 'tycoon', 'simulator', 'obby', 'horror']) assert.doesNotMatch(code, new RegExp(`\\b${w}\\b`, 'i'), w);
});
