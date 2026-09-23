#!/usr/bin/env node
/**
 * VERIFY A TOOL TRAJECTORY AGAINST THE PRODUCT'S OWN REGISTRY.
 *
 * The dataset audit reports `Apple tool trajectories: 0`. Every row in `mlxdata` is a lump of
 * harvested third-party Luau with an instruction invented around it, so nothing in the training
 * set teaches the one thing the product's model actually does for a living: call these tools,
 * with these arguments, in an order that ends in a check.
 *
 * A seed that merely *looks* like a tool call is worth nothing, so this module refuses to
 * validate against a transcription of the schemas. It bundles `apps/worker/src/tools.ts` and
 * imports the LIVE registry — the same object the gateway offers the model. Two consequences,
 * both wanted:
 *
 *   - A seed naming a tool that does not exist cannot be built. My own regex over the source
 *     found 46 tool names; the registry has 59. The regex would have been wrong about the
 *     product and the dataset would have inherited the error.
 *   - When a tool's schema changes, the build of this dataset goes red. The seeds are pinned to
 *     the product, not to what the product looked like the day they were written.
 *
 * `propose_plan` is not schema-checked here at all — it is handed to `readProposedPlan` by way of
 * `TOOLS.propose_plan.run`, which is the function that will judge it in production. Its rules
 * (no self-reference, every step names a registered tool, at least one VERIFIER_TOOL, a step
 * cap) live in one place and this file is not a second copy of them.
 *
 * WHAT IS NOT VERIFIED, SAID PLAINLY. Typed property values — `{"t":"Vector3","v":[0,5,0]}` —
 * are checked for structural well-formedness and a known `t`, and no further. The authority on
 * whether a value decodes is `Paths`/`Ops` in the PLUGIN, which needs Roblox datatypes this
 * process does not have. A trajectory could therefore teach a property the plugin rejects; that
 * surfaces at runtime as `propIssues`, which `create_instances` already reports and the model is
 * already told to repair with `set_properties`. Recorded on the dataset card as a limitation
 * rather than left to be inferred from a green build.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { detectContextDependencies } from './audit-dataset.mjs';
import { checkNoAntipattern } from '../../evals/src/roblox-antipatterns.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = resolve(HERE, '../../../apps/worker');

/** Property value envelopes the product documents. Structure only — see the header. */
export const TYPED_PROP_KINDS = new Set([
  'string', 'number', 'bool', 'Vector3', 'Vector2', 'CFrame', 'Color3', 'UDim2', 'UDim',
  'EnumItem', 'BrickColor', 'Content', 'NumberRange', 'Rect', 'Instance', 'nil',
  // The plugin decodes both (Commands.luau); a UIGradient's Color is a ColorSequence.
  'ColorSequence', 'NumberSequence',
]);

let cachedRegistry = null;

/**
 * Bundle and import the live tool registry.
 *
 * esbuild rather than a TypeScript loader because `packages/evals/src/asset-safety.test.mjs`
 * already reaches `tools.ts` this exact way; one mechanism for crossing that boundary, not two.
 */
export async function loadRegistry({ force = false } = {}) {
  if (cachedRegistry && !force) return cachedRegistry;
  const dir = mkdtempSync(join(tmpdir(), 'apple-trajectory-'));
  const out = join(dir, 'tools.mjs');
  try {
    execFileSync(
      join(WORKER, 'node_modules', '.bin', 'esbuild'),
      [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
      { stdio: 'pipe', cwd: WORKER },
    );
    const mod = await import(pathToFileURL(out).href + '?t=' + Date.now());
    if (!mod.TOOLS || typeof mod.TOOLS !== 'object') throw new Error('tools.ts exported no TOOLS registry');
    cachedRegistry = mod;
    return mod;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The one place a blank required string means something, listed rather than inferred.
 *
 * `edit_script`'s `replace` is required by the schema because an edit needs both halves, and an
 * empty `replace` is how you DELETE a line. Everywhere else a blank required string is an
 * argument that was not supplied. Keeping this as a visible list of one, instead of a clever rule
 * about which strings are "descriptions", means the next exception has to be argued for in the
 * open.
 */
function blankIsMeaningful(where, key) {
  return key === 'replace' && /\.edits\[\d+\]$/.test(where);
}

/** JSON-Schema subset conformance, reported as a list of reasons rather than a boolean. */
export function schemaProblems(schema, args, where) {
  const problems = [];
  if (!isPlainObject(schema)) return [`${where}: tool declares no object schema`];
  const props = isPlainObject(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required : [];

  for (const key of required) {
    if (!Object.hasOwn(args, key)) {
      problems.push(`${where}: missing required argument "${key}"`);
      continue;
    }
    // A REQUIRED STRING THAT IS BLANK WAS NOT SUPPLIED. `run_spec`'s case name is documented as
    // "What this case proves, as a sentence" and `remember`'s fact is the whole payload; a blank
    // one passes a presence check and arrives as a result nobody can read — a check whose
    // evidence is invisible, which is the same defect the tool comments in the worker are about.
    // Both were caught by mutations that this validator, before this clause, called green.
    if (typeof args[key] === 'string' && args[key].trim() === '' && !blankIsMeaningful(where, key)) {
      problems.push(`${where}: required argument "${key}" is blank`);
    }
  }
  for (const [key, value] of Object.entries(args)) {
    if (!Object.hasOwn(props, key)) {
      // An argument the schema does not declare is the classic model failure and the classic
      // dataset failure: it trains the habit of inventing parameters the gateway will drop.
      problems.push(`${where}: argument "${key}" is not in the tool's schema`);
      continue;
    }
    problems.push(...valueProblems(props[key], value, `${where}.${key}`));
  }
  return problems;
}

function valueProblems(spec, value, where) {
  if (!isPlainObject(spec)) return [];
  const problems = [];
  const t = spec.type;
  const actual = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
  const expected = t === 'integer' ? 'number' : t;
  if (typeof expected === 'string' && expected !== actual) {
    problems.push(`${where}: expected ${expected}, got ${actual}`);
    return problems;
  }
  if (Array.isArray(spec.enum) && !spec.enum.includes(value)) {
    problems.push(`${where}: "${value}" is not one of ${spec.enum.join(', ')}`);
  }
  if (t === 'array' && Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (isPlainObject(spec.items) && spec.items.type === 'object' && isPlainObject(spec.items.properties)) {
        problems.push(...schemaProblems(spec.items, value[i], `${where}[${i}]`));
      } else {
        problems.push(...valueProblems(spec.items, value[i], `${where}[${i}]`));
      }
    }
  }
  return problems;
}

/** Every embedded Luau string a trajectory can carry, with the argument path that produced it. */
export function embeddedLuau(tool, args) {
  const out = [];
  if (tool === 'run_luau' && typeof args.code === 'string') out.push({ path: 'code', code: args.code });
  if (tool === 'edit_script' && typeof args.source === 'string') out.push({ path: 'source', code: args.source });
  if (tool === 'run_spec' && Array.isArray(args.cases)) {
    args.cases.forEach((c, i) => {
      // A case body is a function body, not a chunk: it is wrapped before it is parsed, exactly
      // as the plugin wraps it. Parsing it bare would reject a perfectly good `return` and would
      // be this repo's own failure-to-observe defect — a parser complaining about the harness.
      if (isPlainObject(c) && typeof c.code === 'string') {
        out.push({ path: `cases[${i}].code`, code: `local function case()\n${c.code}\nend\nreturn case`, raw: c.code });
      }
    });
  }
  return out;
}

/** Structural check on the typed-property envelopes inside create_instances / set_properties. */
export function typedPropProblems(tool, args, where) {
  const problems = [];
  const checkTable = (table, at) => {
    if (!isPlainObject(table)) return;
    for (const [name, envelope] of Object.entries(table)) {
      if (!isPlainObject(envelope)) {
        problems.push(`${at}.${name}: property value must be a typed envelope {t, v}`);
        continue;
      }
      if (!TYPED_PROP_KINDS.has(envelope.t)) problems.push(`${at}.${name}: unknown property type "${envelope.t}"`);
      else if (envelope.t !== 'nil' && !Object.hasOwn(envelope, 'v')) problems.push(`${at}.${name}: envelope has no "v"`);
    }
  };
  if (tool === 'create_instances' && Array.isArray(args.items)) {
    args.items.forEach((item, i) => {
      if (!isPlainObject(item)) {
        problems.push(`${where}.items[${i}]: not an object`);
        return;
      }
      if (typeof item.className !== 'string' || !item.className) {
        problems.push(`${where}.items[${i}]: needs a className`);
      }
      // Children nest to any depth in the plugin, so they are checked to any depth here.
      const checkTree = (node, at) => {
        checkTable(node.props, `${at}.props`);
        if (Array.isArray(node.children)) {
          node.children.forEach((child, j) => {
            if (isPlainObject(child)) checkTree(child, `${at}.children[${j}]`);
          });
        }
      };
      checkTree(item, `${where}.items[${i}]`);
    });
  }
  if (tool === 'set_properties') {
    checkTable(args.props, `${where}.props`);
  }
  return problems;
}

const SPEC_PASS_MARKER = 'APPLE-TRAJECTORY-CASE-PASS';

/**
 * Execute one `run_spec` case body the way the plugin does: as a function body, called.
 *
 * `ran: false` is kept distinct from `passed: false` on purpose. A missing `luau` binary and a
 * failing assertion are different facts, and collapsing them would report "this seed's check does
 * not hold" on the strength of never having run it.
 */
export function runSpecCase(code, binary = 'luau', compiler = 'luau-compile') {
  const dir = mkdtempSync(join(tmpdir(), 'apple-spec-'));
  try {
    const file = join(dir, 'case.luau');
    writeFileSync(file, `local function case()\n${code}\nend\ncase()\nprint("${SPEC_PASS_MARKER}")\n`);

    // COMPILE FIRST, BECAUSE `luau` EXITS 1 FOR BOTH.
    //
    // A syntax error and a failed `assert` are the same exit status, so deciding `passed` from
    // the status alone announces a case that could not be PARSED as a case that was executed and
    // found wrong. That is this repo's observation-failure pattern sitting inside the function
    // whose own comment says `ran` and `passed` are different facts — found by a peer's
    // broken-Luau mutation, which went red for the right reason and reported the wrong one.
    //
    // `luau-compile --null` is the boundary that actually answers it: exit 1 on a syntax error,
    // exit 0 on code that compiles, whatever its assertions then do.
    const compile = spawnSync(compiler, ['--null', file], { encoding: 'utf8', timeout: 5000, maxBuffer: 256 * 1024 });
    if (compile.error) {
      // No compiler present is not a verdict about the code. Say so rather than falling through
      // to an execution whose failure we would then have to guess the cause of.
      return { ran: false, reason: compile.error.code === 'ENOENT' ? `no ${compiler} binary` : compile.error.message };
    }
    if (compile.status !== 0) {
      return { ran: true, compiled: false, passed: false, detail: (String(compile.stderr).trim() || String(compile.stdout).trim() || 'no output').split('\n')[0].slice(0, 200) };
    }

    const run = spawnSync(binary, [file], { encoding: 'utf8', timeout: 5000, maxBuffer: 256 * 1024 });
    if (run.error) return { ran: false, reason: run.error.code === 'ENOENT' ? `no ${binary} binary` : run.error.message };
    if (run.status === null) return { ran: false, reason: 'timed out' };
    const passed = run.status === 0 && String(run.stdout).includes(SPEC_PASS_MARKER);
    return { ran: true, compiled: true, passed, detail: (String(run.stderr).trim() || String(run.stdout).trim() || 'no output').split('\n')[0].slice(0, 200) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Judge one trajectory. Returns `{ ok, problems }` — never throws for a bad seed, because the
 * caller reports every reason at once rather than the first.
 */
export async function verifyTrajectory(seed, { registry = null, luauBinary = 'luau' } = {}) {
  const mod = registry ?? (await loadRegistry());
  const { TOOLS } = mod;
  const problems = [];

  if (!Array.isArray(seed.trajectory) || seed.trajectory.length === 0) {
    return { ok: false, problems: [`${seed.id}: trajectory is empty`] };
  }

  for (let i = 0; i < seed.trajectory.length; i++) {
    const step = seed.trajectory[i];
    const where = `${seed.id}.step[${i}]`;
    if (!isPlainObject(step) || typeof step.tool !== 'string') {
      problems.push(`${where}: step must be { tool, args }`);
      continue;
    }
    const impl = TOOLS[step.tool];
    if (!impl) {
      problems.push(`${where}: tool "${step.tool}" is not in the live registry`);
      continue;
    }
    const args = isPlainObject(step.args) ? step.args : {};

    if (step.tool === 'propose_plan') {
      // Judged by the function that will judge it in production, not by a copy of its rules.
      const ctx = {};
      const result = await impl.run(ctx, args);
      if (result && typeof result === 'object' && 'error' in result) {
        problems.push(`${where}: the product's own plan validator refused it — ${result.error}`);
      }
    } else {
      problems.push(...schemaProblems(impl.def?.parameters, args, where));
    }

    problems.push(...typedPropProblems(step.tool, args, where));

    // A SPEC CASE IS RUN, NOT READ.
    //
    // Parsing it only proves it is Luau. The mutation that replaced a sanitiser with `return
    // amount` — leaving `assert(sanitise(-5) == 0)` underneath it, which fails — parsed perfectly
    // and this validator called the seed green. That is a trajectory teaching the model to write
    // a check that does not hold and then report it as proof, which is the precise failure the
    // whole product is built to avoid. The game-logic track has always executed its answers;
    // there is no argument for this track doing less.
    if (step.tool === 'run_spec' && Array.isArray(args.cases)) {
      args.cases.forEach((c, i) => {
        if (!isPlainObject(c) || typeof c.code !== 'string') return;
        const outcome = runSpecCase(c.code, luauBinary);
        if (!outcome.ran) problems.push(`${where}.cases[${i}]: could not be executed (${outcome.reason}) — nothing was checked`);
        else if (!outcome.compiled) problems.push(`${where}.cases[${i}] ("${c.name}"): does not compile, so its assertions never ran — ${outcome.detail}`);
        else if (!outcome.passed) problems.push(`${where}.cases[${i}] ("${c.name}"): its own assertions fail — ${outcome.detail}`);
      });
    }

    for (const { path, code } of embeddedLuau(step.tool, args)) {
      const parsed = detectContextDependencies(code);
      if (!parsed.parseOk) problems.push(`${where}.${path}: embedded Luau does not parse`);
      const anti = checkNoAntipattern(code);
      // `unavailable` means the analyzer threw and examined nothing. Reporting that as an
      // anti-pattern would be a failure to observe wearing an observation's clothes: the seed
      // would be blamed for a verdict nobody reached by reading it. Named separately, and still
      // fatal, because an unchecked seed must not enter the dataset either.
      if (anti.unavailable) problems.push(`${where}.${path}: anti-pattern gate could not run (${anti.reason}: ${anti.detail}) — nothing was checked`);
      else if (!anti.passed) problems.push(`${where}.${path}: anti-pattern gate failed — ${anti.detail}`);
    }
  }

  // A plan is a commitment the run has to keep. A seed whose plan names a tool it never calls
  // teaches the model to promise work it will not do — the exact defect `readProposedPlan` was
  // written to refuse, one level up.
  const plan = seed.trajectory.find((s) => s?.tool === 'propose_plan');
  if (plan) {
    const called = new Set(seed.trajectory.map((s) => s?.tool));
    for (const step of plan.args?.steps ?? []) {
      if (step?.tool && !called.has(step.tool)) {
        problems.push(`${seed.id}: the plan promises "${step.tool}" and the trajectory never calls it`);
      }
    }
  }

  //[[ MOVED HERE 2026-09-21, because it stopped being enforced anywhere.
  //
  //   This rule used to arrive for free: `readProposedPlan` REFUSED a plan with no verification
  //   step, and running it through `TOOLS.propose_plan.run` made the seed fail. On 2026-09-21 that
  //   refusal was re-aimed into an append — the deployed model was measured proposing the same
  //   unverified plan three times at durationMs 0 and losing the whole run to the step limit — and
  //   the moment it appended instead of refusing, a training seed whose trajectory never checks
  //   anything started passing. The curriculum silently lost a rule it was written to enforce, and
  //   only tool-trajectory-curriculum.test.mjs noticed.
  //
  //   So it is asserted HERE, over the property that actually matters for training data: what the
  //   trajectory CALLS, not what the plan says. A seed that builds and never looks teaches the
  //   model to do the same. The list is imported from the product rather than restated, for the
  //   reason the header of this file gives about not being a second copy.
  //
  //   (Product behaviour and training data differ here ON PURPOSE. Production repairs a plan so a
  //   paying user's run still completes; the curriculum refuses the seed outright, because nothing
  //   is lost by not training on it.) ]]
  const VERIFIERS = new Set(mod.VERIFIER_TOOLS ?? []);
  if (VERIFIERS.size === 0) {
    problems.push(`${seed.id}: the product exports no VERIFIER_TOOLS, so this rule could not be applied`);
  } else if (!seed.trajectory.some((s) => VERIFIERS.has(s?.tool))) {
    problems.push(
      `${seed.id}: the trajectory never checks its own work — no call to ${[...VERIFIERS].join(', ')}`,
    );
  }

  if (typeof seed.prompt !== 'string' || seed.prompt.trim().length < 12) {
    problems.push(`${seed.id}: prompt is missing or too short to be a real request`);
  }
  if (typeof seed.reply !== 'string' || seed.reply.trim().length < 12) {
    problems.push(`${seed.id}: reply is missing or too short`);
  }
  void luauBinary;
  return { ok: problems.length === 0, problems };
}

/** Apply a seed's declared mutation, refusing one that does not land on an existing site. */
export function applyMutation(seed) {
  const m = seed.mutation;
  if (!isPlainObject(m) || typeof m.step !== 'number' || typeof m.path !== 'string') {
    throw new Error(`${seed.id}: mutation must be { step, path, value }`);
  }
  const clone = structuredClone(seed);
  const step = clone.trajectory[m.step];
  if (!step) throw new Error(`${seed.id}: mutation names step ${m.step}, which does not exist`);
  const keys = m.path.split('.').map((k) => (/^\d+$/.test(k) ? Number(k) : k));
  let cursor = step.args;
  for (let i = 0; i < keys.length - 1; i++) {
    cursor = cursor?.[keys[i]];
    if (cursor === undefined) throw new Error(`${seed.id}: mutation path "${m.path}" does not resolve`);
  }
  const last = keys[keys.length - 1];
  // THE MIS-AIMED BREAK, GUARDED. A mutation that lands on a key which is not there changes
  // nothing that was being asserted, and the red it produces would be about the mutation rather
  // than about the seed. This repo has shipped that mistake before.
  if (cursor === undefined || !Object.hasOwn(cursor, last)) {
    throw new Error(`${seed.id}: mutation path "${m.path}" does not resolve to an existing value`);
  }
  cursor[last] = m.value;
  delete clone.mutation;
  return clone;
}
