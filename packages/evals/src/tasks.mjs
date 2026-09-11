// Task loading + validation. Tasks live in tasks/<category>.json, each file an
// array of {id, category, prompt, system?, checks: [...], weight?, topics?}.
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULE_IDS } from './roblox-antipatterns.mjs';
import { DISPATCHABLE_CHECK_TYPES } from './grade.mjs';

export const TASKS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'tasks');

//[[ Imported from the module that DISPATCHES them, not restated here. This set used to
//   be written by hand and fell two behind: `no_design_violation` and `playbook_complete`
//   were implemented, imported by grade.mjs, unit-tested, and rejected by this validator
//   as `bad type` — so no task file could declare either, and both were unreachable from
//   the suite while being described as wired into it. ]]
const CHECK_TYPES = new Set(DISPATCHABLE_CHECK_TYPES);
const TARGETS = new Set(['text', 'code']);
const CONTEXTS = new Set(['server', 'client', 'module', 'unknown']);

/**
 * The scripting capabilities the Master Mission §U names as the highest-weight long-term skill,
 * as machine-checkable ids. A task declares what it exercises via `topics`, so "the curriculum
 * covers X" is a claim the suite can verify instead of a claim a README makes.
 *
 * The list is closed on purpose: an unrecognised topic is a validation error, because a typo would
 * otherwise silently drop a capability out of the coverage report while the docs still promise it.
 */
export const SCRIPTING_TOPICS = [
  'luau-correctness',
  'client-server-boundary',
  'remotes-validation',
  'persistence-datastore',
  'session-locking',
  'economy-currency',
  'shops',
  'upgrades',
  'tycoon',
  'rebirth',
  'zones',
  'quests',
  'codes',
  'leaderboards',
  'npc-pathfinding',
  'tools-and-equipment',
  'animation',
  'streaming-enabled',
  'mobile-controller',
  'exploit-resistance',
  'error-recovery',
  'idempotency',
  'race-conditions',
  'performance',
];
const TOPIC_SET = new Set(SCRIPTING_TOPICS);

/** Task-file categories that make up the scripting curriculum (docs/SCRIPTING-CURRICULUM.md). */
export const SCRIPTING_CATEGORIES = [
  'scripting-security',
  'scripting-persistence',
  'scripting-systems',
  'scripting-gameplay',
];

export function validateTask(task, file) {
  const where = `${file} task ${task?.id ?? '?'}`;
  const errs = [];
  if (!task || typeof task !== 'object') return [`${file}: task is not an object`];
  if (typeof task.id !== 'string' || !task.id) errs.push(`${where}: missing id`);
  if (typeof task.category !== 'string' || !task.category) errs.push(`${where}: missing category`);
  if (typeof task.prompt !== 'string' || !task.prompt.trim()) errs.push(`${where}: missing prompt`);
  if (task.system != null && typeof task.system !== 'string') errs.push(`${where}: system must be a string`);
  if (task.weight != null && !(typeof task.weight === 'number' && task.weight > 0)) errs.push(`${where}: weight must be a positive number`);
  if (task.topics != null) {
    if (!Array.isArray(task.topics) || task.topics.length === 0) errs.push(`${where}: topics must be a non-empty array`);
    else for (const t of task.topics) if (!TOPIC_SET.has(t)) errs.push(`${where}: unknown topic "${t}" (see SCRIPTING_TOPICS)`);
  }
  if (!Array.isArray(task.checks) || task.checks.length === 0) {
    errs.push(`${where}: checks must be a non-empty array`);
    return errs;
  }
  task.checks.forEach((c, i) => {
    const cw = `${where} check[${i}]`;
    if (!CHECK_TYPES.has(c.type)) errs.push(`${cw}: bad type ${c.type}`);
    if (!TARGETS.has(c.target)) errs.push(`${cw}: bad target ${c.target}`);
    if (c.type === 'contains' && typeof c.value !== 'string') errs.push(`${cw}: contains needs string value`);
    if (c.type === 'not_contains' && typeof c.value !== 'string' && typeof c.pattern !== 'string')
      errs.push(`${cw}: not_contains needs value or pattern`);
    if (c.type === 'regex' && typeof c.pattern !== 'string') errs.push(`${cw}: regex needs pattern`);
    if (c.type === 'no_antipattern') {
      // A misspelled rule id used to be the cheapest way to write a check that can never fail, so
      // it is rejected at load time rather than at grading time on a paid run.
      if (c.rules != null) {
        if (!Array.isArray(c.rules) || c.rules.length === 0) errs.push(`${cw}: rules must be a non-empty array`);
        else for (const r of c.rules) if (!RULE_IDS.includes(r)) errs.push(`${cw}: unknown anti-pattern rule "${r}"`);
      }
      if (c.context != null && !CONTEXTS.has(c.context)) errs.push(`${cw}: bad context ${c.context}`);
    }
    if (typeof c.pattern === 'string') {
      try {
        new RegExp(c.pattern, c.flags ?? '');
      } catch (e) {
        errs.push(`${cw}: invalid regex: ${e.message}`);
      }
    }
  });
  return errs;
}

/**
 * Load tasks from a directory of <category>.json files.
 * @param {{dir?: string, categories?: string[]|null, limit?: number|null}} [opts]
 *   limit applies per category so a limited run still covers every category.
 * @returns {{tasks: object[], errors: string[]}}
 */
export function loadTasks(opts = {}) {
  const dir = opts.dir ?? TASKS_DIR;
  const wanted = opts.categories?.length ? new Set(opts.categories) : null;
  const tasks = [];
  const errors = [];
  const seenIds = new Set();
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  for (const file of files) {
    const category = file.replace(/\.json$/, '');
    if (wanted && !wanted.has(category)) continue;
    let arr;
    try {
      arr = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    } catch (e) {
      errors.push(`${file}: invalid JSON: ${e.message}`);
      continue;
    }
    if (!Array.isArray(arr)) {
      errors.push(`${file}: expected a JSON array of tasks`);
      continue;
    }
    let taken = 0;
    for (const task of arr) {
      const errs = validateTask(task, file);
      if (errs.length) {
        errors.push(...errs);
        continue;
      }
      if (task.category !== category) errors.push(`${file}: task ${task.id} category "${task.category}" != file category "${category}"`);
      if (seenIds.has(task.id)) errors.push(`${file}: duplicate task id ${task.id}`);
      seenIds.add(task.id);
      if (opts.limit != null && taken >= opts.limit) continue;
      taken += 1;
      tasks.push(task);
    }
  }
  return { tasks, errors };
}
