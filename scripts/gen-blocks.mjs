#!/usr/bin/env node
// Validates packages/blocks/<kind>/<id>/ (the format in packages/blocks/README.md) and compiles every block into
// apps/worker/src/blocks.generated.ts, so the worker ships the exact reviewed recipes and sources.
// `node scripts/gen-blocks.mjs --check` exits 1 when the generated file is stale or a block is invalid.
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'packages', 'blocks');
const OUT = join(ROOT, 'apps', 'worker', 'src', 'blocks.generated.ts');

export const KINDS = ['ui', 'system', 'prop', 'zone', 'fx', 'lighting'];
const OPS = ['create_instances', 'set_props', 'edit_script', 'clone_instances'];
const CHECKS = { exists: ['path'], prop: ['path', 'prop', 'equals'], script_has: ['path', 'contains'], play_clean: [] };
const SCHEMA_KEYS = new Set(['type', 'enum', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'items', 'minItems', 'maxItems', 'default', 'description']);
const TYPES = new Set(['string', 'number', 'integer', 'boolean', 'array']);
const SLOT = /\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g;

const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const dirs = (p) => readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();

function checkSchema(where, schema, problems) {
  for (const key of Object.keys(schema)) if (!SCHEMA_KEYS.has(key)) problems.push(`${where}: "${key}" is outside the supported schema keywords`);
  if (!TYPES.has(schema.type)) problems.push(`${where}: type must be one of ${[...TYPES].join(', ')}`);
  if (schema.type === 'array') {
    if (!schema.items || typeof schema.items !== 'object') problems.push(`${where}: an array needs items`);
    else checkSchema(`${where}.items`, schema.items, problems);
  }
}

/** Every `{{slot}}` in a JSON value. */
function slots(value, out = new Set()) {
  if (typeof value === 'string') for (const m of value.matchAll(SLOT)) out.add(m[1]);
  else if (Array.isArray(value)) value.forEach((v) => slots(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => slots(v, out));
  return out;
}

export function loadBlocks(dir = DIR) {
  const blocks = {};
  const problems = [];
  for (const kind of dirs(dir)) {
    if (kind === 'assets') continue;
    if (!KINDS.includes(kind)) { problems.push(`${kind}/: not a block kind (${KINDS.join(', ')})`); continue; }
    for (const id of dirs(join(dir, kind))) {
      const at = join(dir, kind, id);
      const where = `${kind}/${id}`;
      const need = ['block.json', 'recipe.json', 'checks.json', 'hint.md', 'proof'];
      const missing = need.filter((f) => !existsSync(join(at, f)));
      if (missing.length) { problems.push(`${where}: missing ${missing.join(', ')}`); continue; }
      const block = json(join(at, 'block.json'));
      const recipe = json(join(at, 'recipe.json'));
      const checks = json(join(at, 'checks.json'));
      const hint = readFileSync(join(at, 'hint.md'), 'utf8').trim();

      if (block.id !== id) problems.push(`${where}: block.json id is ${block.id}`);
      if (block.kind !== kind) problems.push(`${where}: block.json kind is ${block.kind}`);
      if (typeof block.summary !== 'string' || !block.summary || block.summary.length > 120) problems.push(`${where}: summary must be one line of 1-120 characters`);
      if (hint.length > 600) problems.push(`${where}: hint.md is ${hint.length} characters (at most 600)`);
      if (!readdirSync(join(at, 'proof')).some((f) => f.endsWith('.luau'))) problems.push(`${where}: proof/ has no .luau test`);
      for (const list of ['provides', 'depends']) if (!Array.isArray(block[list]) || block[list].some((v) => typeof v !== 'string')) problems.push(`${where}: ${list} must be a list of strings`);

      const params = block.params ?? {};
      if (params.type !== 'object' || params.additionalProperties !== false || typeof params.properties !== 'object') {
        problems.push(`${where}: params must be { type: "object", additionalProperties: false, properties }`);
      }
      const names = new Set(Object.keys(params.properties ?? {}));
      for (const [name, schema] of Object.entries(params.properties ?? {})) {
        checkSchema(`${where} params.${name}`, schema, problems);
        if (!('default' in schema)) problems.push(`${where} params.${name}: needs a default`);
      }

      const sources = {};
      if (existsSync(join(at, 'src'))) {
        for (const f of readdirSync(join(at, 'src')).sort()) if (f.endsWith('.luau')) sources[`src/${f}`] = readFileSync(join(at, 'src', f), 'utf8');
      }
      const stepIds = new Set();
      for (const [i, step] of (recipe.steps ?? []).entries()) {
        const s = `${where} step ${step.id ?? i}`;
        if (typeof step.id !== 'string' || stepIds.has(step.id)) problems.push(`${s}: needs a unique id`);
        stepIds.add(step.id);
        if (!OPS.includes(step.op)) problems.push(`${s}: op ${step.op} is not one of ${OPS.join(', ')}`);
        if (step.op === 'edit_script') {
          if (!sources[step.file]) problems.push(`${s}: file ${step.file} is not in src/`);
          else for (const slot of slots(sources[step.file])) if (!names.has(slot)) problems.push(`${s}: ${step.file} names {{${slot}}}, not a parameter`);
          if (!['Script', 'LocalScript', 'ModuleScript'].includes(step.create?.className)) problems.push(`${s}: create.className must be a script class`);
        }
        for (const slot of slots(step)) if (!names.has(slot)) problems.push(`${s}: {{${slot}}} is not a parameter`);
      }
      if (!stepIds.size) problems.push(`${where}: recipe has no steps`);

      const checkIds = new Set();
      for (const c of Array.isArray(checks) ? checks : []) {
        const s = `${where} check ${c.id}`;
        if (typeof c.id !== 'string' || checkIds.has(c.id)) problems.push(`${s}: needs a unique id`);
        checkIds.add(c.id);
        if (!CHECKS[c.kind]) { problems.push(`${s}: kind ${c.kind} is not one of ${Object.keys(CHECKS).join(', ')}`); continue; }
        for (const f of CHECKS[c.kind]) if (!(f in c)) problems.push(`${s}: a ${c.kind} check needs ${f}`);
        if (typeof c.describes !== 'string' || !c.describes) problems.push(`${s}: needs describes`);
        if (c.after !== undefined && !stepIds.has(c.after)) problems.push(`${s}: after names no step`);
        if (c.kind === 'play_clean' && c.after !== undefined) problems.push(`${s}: play_clean always runs last`);
        if (c.param !== undefined && !names.has(c.param)) problems.push(`${s}: param ${c.param} is not a parameter`);
        for (const slot of slots(c)) if (!names.has(slot)) problems.push(`${s}: {{${slot}}} is not a parameter`);
      }
      if (!checkIds.size) problems.push(`${where}: checks.json has no checks`);
      if (blocks[id]) problems.push(`${where}: id ${id} is used twice`);
      blocks[id] = { block, recipe, checks, hint, sources };
    }
  }
  for (const [id, b] of Object.entries(blocks)) {
    for (const dep of b.block.depends ?? []) if (!blocks[dep]) problems.push(`${b.block.kind}/${id}: depends on ${dep}, which is not a block`);
  }
  // A dependency cycle would leave the interpreter no order to run in.
  const state = {};
  const visit = (id, trail) => {
    if (state[id] === 'done' || !blocks[id]) return;
    if (state[id] === 'open') { problems.push(`dependency cycle: ${[...trail, id].join(' -> ')}`); return; }
    state[id] = 'open';
    for (const dep of blocks[id].block.depends ?? []) visit(dep, [...trail, id]);
    state[id] = 'done';
  };
  Object.keys(blocks).forEach((id) => visit(id, []));
  return { blocks, problems };
}

export function render(dir = DIR) {
  const { blocks, problems } = loadBlocks(dir);
  if (problems.length) throw new Error(`invalid blocks:\n  ${problems.join('\n  ')}`);
  return '// GENERATED by scripts/gen-blocks.mjs from packages/blocks. Do not edit.\n' +
    '/* eslint-disable */\n' +
    "import type { Block } from './block-types';\n" +
    `export const BLOCKS: Record<string, Block> = ${JSON.stringify(blocks, null, 1)};\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let text;
  try { text = render(); } catch (e) { console.error(e.message); process.exit(1); }
  if (process.argv.includes('--check')) {
    const current = existsSync(OUT) && statSync(OUT).isFile() ? readFileSync(OUT, 'utf8') : '';
    if (current !== text) { console.error('blocks.generated.ts is stale: run node scripts/gen-blocks.mjs'); process.exit(1); }
    console.log('blocks.generated.ts is current');
  } else {
    writeFileSync(OUT, text);
    console.log(`wrote ${OUT} (${text.length} bytes)`);
  }
}
