#!/usr/bin/env node
/**
 * Audit the SFT artefacts that are actually on disk before anybody trains on them.
 *
 * This is deliberately a validator, not a data generator. The current artefacts were harvested
 * from permissively licensed Luau repositories, so they are useful evidence about syntax and
 * library style but they are NOT Apple's tool trajectories. A green structural check must never
 * be reported as evidence that an adapter is trained, promoted, or ready for the product task.
 *
 * The audit has four independent gates:
 *   1. every row has a usable instruction and fenced Luau response;
 *   2. every response is checked for hidden file/module context (free globals and require calls);
 *   3. no instruction OR response shares an 8-word shingle with the evaluation task corpus;
 *   4. every provenance row still matches the current, licence-admitted pinned manifest entry.
 *
 * It also checks split integrity and reports whether any rows are real Apple tool trajectories.
 * No network, provider, Hugging Face upload, or training job is involved.
 *
 * Usage:
 *   node src/audit-dataset.mjs [--data DIR] [--strict]
 *
 * `--strict` exits 1 whenever the dataset is not standalone-ready. The default command prints
 * the same verdict and exits 0 so an operator can inspect a known-not-ready audit without a shell
 * pipeline hiding the measurements behind an expected non-zero status.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { checkLuauSyntax } from '../../evals/src/luau.mjs';
import { checkNoAntipattern } from '../../evals/src/roblox-antipatterns.mjs';
import { parseLuau } from '../../evals/src/luau-ast.mjs';
import { buildSymbolTable } from '../../evals/src/luau-symbols.mjs';
import { requireTargets } from '../../evals/src/luau-dataflow.mjs';
import {
  admissibleSources,
  contaminated,
  looksLikeDescription,
  shingles,
  TRAINING_OK_SPDX,
} from './build-dataset.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..');
const DEFAULT_DATA_DIR = join(HERE, '..', 'data');
const DEFAULT_EVAL_DIR = join(REPO_ROOT, 'packages', 'evals', 'tasks');
const DEFAULT_MANIFEST = join(REPO_ROOT, 'packages', 'corpus', 'raw', 'manifest.json');
const DEFAULT_RAW_DIR = join(REPO_ROOT, 'packages', 'corpus', 'raw');

export const DATASET_SPLITS = Object.freeze(['train', 'val', 'test']);
export const INSTRUCTION_SUFFIX = '\n\nWrite the Luau implementation.';
export const SHINGLE_N = 8;

// A cleaned Luau comment should be prose. These are C/Flow/JS comment remnants or licence
// headers, not a request a model can act on. The old extractor accepted them because it only knew
// Luau's `--` comment syntax; the audit keeps the stricter boundary when it reads old artefacts.
const COMMENT_ARTIFACT = /^(?:\/\/|\/\*|\*)|@(?:param|return|internal|flow)\b|\b(?:copyright|source code is licensed|license file|source tree)\b/i;
const SHA1 = /^[0-9a-f]{40}$/i;

function issue(code, message, where = {}) {
  return { code, message, ...where };
}

function words(text) {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean);
}

/** Normalize text exactly as the build contamination guard does, without importing its private helper. */
function normalise(text) {
  return String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function evalStrings(value, key = '', out = []) {
  if (typeof value === 'string') {
    // IDs, categories, and weights are bookkeeping, not text a model could copy as an answer.
    if (!['id', 'category', 'weight'].includes(key)) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) evalStrings(item, key, out);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) evalStrings(v, k, out);
  }
  return out;
}

/**
 * Load the local evaluation corpus into the same 8-word shingle set used by the builder.
 *
 * A missing or wholly unreadable evaluation directory is an audit failure, never an empty set:
 * comparing training rows against nothing would produce the most dangerous possible clean result.
 */
export function loadEvalGuard(evalDir = DEFAULT_EVAL_DIR) {
  const files = [];
  const parseErrors = [];
  const set = new Set();
  let taskCount = 0;

  if (!existsSync(evalDir)) {
    return { evalDir, files, parseErrors: ['evaluation task directory is absent'], taskCount, shingles: set };
  }

  for (const name of readdirSync(evalDir).sort()) {
    if (!name.endsWith('.json')) continue;
    const path = join(evalDir, name);
    let data;
    try {
      data = JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
      parseErrors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const tasks = Array.isArray(data) ? data : (data?.tasks ?? data?.items ?? []);
    if (!Array.isArray(tasks)) {
      parseErrors.push(`${name}: expected an array or a tasks/items array`);
      continue;
    }
    files.push(name);
    taskCount += tasks.length;
    for (const task of tasks) {
      for (const text of evalStrings(task)) {
        for (const sh of shingles(normalise(text), SHINGLE_N)) set.add(sh);
      }
    }
  }
  return { evalDir, files, parseErrors, taskCount, shingles: set };
}

/** Read one JSONL split and retain line numbers for evidence. */
export function readSplit(file, split = '<split>') {
  if (!existsSync(file)) throw new Error(`${split}: missing ${file}; a missing split is not an empty split`);
  const rows = [];
  const lines = readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].trim()) continue;
    try {
      rows.push({ row: JSON.parse(lines[i]), line: i + 1 });
    } catch (e) {
      throw new Error(`${split}:${i + 1}: unparseable JSON — ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!rows.length) throw new Error(`${split}: ${file} has no rows; a zero-row split cannot validate a held-out set`);
  return rows;
}

/** Load every split. Missing one is a measurement failure rather than a clean zero. */
/**
 * The same split under two names. `mlx-lm` reads `valid.jsonl`; this repository has always
 * written `val.jsonl`. Accepting both is not laxity — the alternative was emitting the validation
 * rows twice under two filenames, and two copies of a split are two things that can drift apart.
 * A directory containing BOTH is refused rather than silently preferred, because which one the
 * trainer actually read would then be unanswerable.
 */
const SPLIT_FILENAMES = { train: ['train'], val: ['val', 'valid'], test: ['test'] };

export function loadDataset(dataDir = DEFAULT_DATA_DIR, { splits = DATASET_SPLITS } = {}) {
  const out = {};
  for (const split of splits) {
    const candidates = (SPLIT_FILENAMES[split] ?? [split]).map((name) => join(dataDir, `${name}.jsonl`));
    const present = candidates.filter((path) => existsSync(path));
    if (present.length > 1) {
      throw new Error(`${split}: ${present.join(' and ')} both exist; which one trained the model is unanswerable`);
    }
    out[split] = readSplit(present[0] ?? candidates[0], split);
  }
  return out;
}

/**
 * Extract and validate the chat-shaped pair without touching a checker.
 *
 * `code` and `instruction` are null when their fields cannot be safely extracted; callers can
 * still collect the row's other provenance issues rather than stopping at the first bad example.
 */
export function extractPair(row, where = '<row>', { requireSuffix = true } = {}) {
  const errors = [];
  const messages = row?.messages;
  let system = null;
  let instruction = null;
  let code = null;

  if (!Array.isArray(messages)) {
    errors.push(issue('message_shape', `${where}: messages must be an array`));
  } else {
    const roles = messages.map((m) => m?.role);
    if (roles.join(',') !== 'system,user,assistant') {
      errors.push(issue('message_shape', `${where}: expected exactly system,user,assistant; got ${roles.join(',') || '(none)'}`));
    }
    system = messages.find((m) => m?.role === 'system')?.content ?? null;
    const user = messages.find((m) => m?.role === 'user')?.content ?? null;
    const assistant = messages.find((m) => m?.role === 'assistant')?.content ?? null;
    if (typeof system !== 'string' || !system.trim()) errors.push(issue('system_empty', `${where}: system content is empty`));
    if (typeof user !== 'string' || !user.trim()) {
      errors.push(issue('instruction_empty', `${where}: user instruction is empty`));
    } else if (requireSuffix && !user.endsWith(INSTRUCTION_SUFFIX)) {
      errors.push(issue('instruction_suffix', `${where}: user instruction does not end with the builder suffix`));
    } else {
      instruction = user.slice(0, -INSTRUCTION_SUFFIX.length).trim();
      if (!instruction) errors.push(issue('instruction_empty', `${where}: instruction before the builder suffix is empty`));
      if (instruction.includes('\n') || instruction.includes('```')) {
        errors.push(issue('instruction_format', `${where}: instruction contains a newline or code fence`));
      }
      if (words(instruction).length < 6) {
        errors.push(issue('instruction_short', `${where}: instruction has fewer than six words`));
      }
      // Reuse the builder's prose gate and add the C/Flow artefact check that it historically missed.
      if (!looksLikeDescription(instruction) || COMMENT_ARTIFACT.test(instruction)) {
        errors.push(issue('instruction_quality', `${where}: instruction is not standalone descriptive prose`));
      }
    }
    if (typeof assistant !== 'string' || !assistant.trim()) {
      errors.push(issue('response_empty', `${where}: assistant response is empty`));
    } else {
      const match = /^```luau\r?\n([\s\S]*?)\r?\n```$/.exec(assistant);
      if (!match) {
        errors.push(issue('response_format', `${where}: assistant response must be exactly one fenced ` + '```luau' + ' block'));
      } else {
        code = match[1];
        if (!code.trim()) errors.push(issue('response_empty', `${where}: fenced Luau response is empty`));
      }
    }
  }

  return { system, instruction, code, errors };
}

/**
 * Detect names the extracted function cannot resolve from its own body.
 *
 * Roblox built-ins are excluded by the shared symbol table. Unknown globals therefore mean a
 * surrounding file/module/service contract is needed. Every require is also a context dependency
 * even when its path is statically known: the module is outside this single-function response.
 * Implicit global WRITES are reported separately as a quality hazard; defining a top-level function
 * is not itself a missing dependency and must not make an otherwise self-contained function fail.
 */
export function detectContextDependencies(code, { path = null } = {}) {
  const parsed = parseLuau(String(code ?? ''));
  if (!parsed.ast) {
    return {
      parseOk: false,
      unknownGlobals: [],
      implicitGlobals: [],
      requires: [],
      dependencies: [],
      standalone: false,
    };
  }

  let table;
  try {
    table = buildSymbolTable(parsed);
  } catch (e) {
    return {
      parseOk: parsed.ok,
      unknownGlobals: [],
      implicitGlobals: [],
      requires: [],
      dependencies: [{ kind: 'analysis-error', name: String(e?.message ?? e) }],
      standalone: false,
    };
  }

  let requires = [];
  try {
    requires = requireTargets(parsed, { selfPath: path });
  } catch (e) {
    requires = [{ line: null, path: null, literal: null, expression: String(e?.message ?? e), analysisError: true }];
  }

  const unknownGlobals = [...new Set(table.unknownGlobals.map((g) => g.name))].sort();
  const implicitGlobals = [...new Set(table.implicitGlobals.map((g) => g.name))].sort();
  const dependencies = [
    ...unknownGlobals.map((name) => ({ kind: 'global-read', name })),
    ...requires.map((r) => ({
      kind: r.analysisError ? 'module-analysis-error' : 'module-require',
      name: r.expression || r.literal || '(computed require)',
      line: r.line ?? null,
      resolvedPath: r.path ?? null,
    })),
  ];

  return {
    parseOk: parsed.ok,
    unknownGlobals,
    implicitGlobals,
    requires: requires.map((r) => ({
      line: r.line ?? null,
      expression: r.expression ?? '',
      literal: r.literal ?? null,
      resolvedPath: r.path ?? null,
      resolved: r.path !== null,
    })),
    dependencies,
    standalone: parsed.ok && dependencies.length === 0,
  };
}

/** Build a current licence/pin index from the same manifest the builder uses. */
export function buildLicenseIndex({ manifestPath = DEFAULT_MANIFEST, rawDir = DEFAULT_RAW_DIR } = {}) {
  try {
    const { admitted, rejected } = admissibleSources({ manifestPath, rawDir });
    const byUrl = new Map();
    for (const entry of admitted) {
      if (byUrl.has(entry.url)) continue;
      byUrl.set(entry.url, entry);
    }
    return {
      ok: true,
      admitted,
      rejected,
      byUrl,
      rejectedByUrl: new Map(rejected.map((entry) => [entry.url, entry])),
    };
  } catch (e) {
    return {
      ok: false,
      admitted: [],
      rejected: [],
      byUrl: new Map(),
      rejectedByUrl: new Map(),
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Origins that mean "this repository wrote it", as the game-logic builder already stamps. */
const FIRST_PARTY_ORIGINS = new Set(['first-party-authored', 'first-party-authored-synthetic']);

/**
 * A first-party row proves its provenance differently, because there is nothing upstream to pin.
 *
 * Demanding an SPDX identifier and a 40-hex commit from a row we authored ourselves is not a
 * strict check, it is an inapplicable one: there is no upstream repository, so the only way to
 * satisfy it would be to invent an origin. The requirements invert — such a row must name its
 * rights and must NOT claim a licence or a commit it does not have, because a fabricated
 * provenance is worse than a missing one.
 */
function firstPartyProvenanceIssues(meta, where) {
  const out = [];
  if (typeof meta.rights !== 'string' || !meta.rights.trim()) out.push(issue('rights_missing', `${where}: a first-party row must state its rights`));
  if (typeof meta.family !== 'string' || !meta.family.trim()) out.push(issue('family_missing', `${where}: meta.family is required`));
  for (const claimed of ['spdx', 'sha', 'source']) {
    if (meta[claimed] !== undefined) {
      out.push(issue('false_provenance', `${where}: origin is ${meta.origin} but the row also carries meta.${claimed}; it cannot be both authored here and pinned upstream`));
    }
  }
  if (meta.capturedFromStudio === true) {
    out.push(issue('false_provenance', `${where}: claims capture from Studio while declaring a first-party authored origin`));
  }
  return out;
}

function provenanceIssues(row, where, license) {
  const out = [];
  const meta = row?.meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return [issue('provenance_shape', `${where}: meta must be an object` )];
  }
  if (FIRST_PARTY_ORIGINS.has(meta.origin)) return firstPartyProvenanceIssues(meta, where);
  if (typeof meta.source !== 'string' || !meta.source.trim()) out.push(issue('source_missing', `${where}: meta.source is required`));
  if (typeof meta.spdx !== 'string' || !meta.spdx.trim()) out.push(issue('spdx_missing', `${where}: meta.spdx is required`));
  else if (!TRAINING_OK_SPDX.has(meta.spdx)) out.push(issue('spdx_not_allowed', `${where}: ${meta.spdx} is not admitted for training`));
  if (typeof meta.sha !== 'string' || !SHA1.test(meta.sha)) out.push(issue('pin_missing', `${where}: meta.sha must be a 40-hex pinned commit`));
  if (typeof meta.path !== 'string' || !meta.path.trim()) out.push(issue('path_missing', `${where}: meta.path is required`));
  else if (meta.path.startsWith('/') || meta.path.split('/').includes('..') || meta.path.includes('\0')) {
    out.push(issue('path_unsafe', `${where}: meta.path must be a relative repository path`));
  }

  if (!license?.ok) return out;
  const current = typeof meta.source === 'string' ? license.byUrl.get(meta.source) : null;
  if (!current) {
    const rejected = typeof meta.source === 'string' ? license.rejectedByUrl.get(meta.source) : null;
    out.push(issue(
      'license_regression',
      `${where}: source is not admitted by the current training licence registry${rejected ? ` (${rejected.reason})` : ''}`,
    ));
    return out;
  }
  if (meta.spdx !== current.spdx) {
    out.push(issue('license_regression', `${where}: row SPDX ${meta.spdx} differs from current manifest ${current.spdx}`));
  }
  if (typeof meta.sha === 'string' && current.sha && meta.sha !== current.sha) {
    out.push(issue('pin_regression', `${where}: row pin ${meta.sha} differs from current manifest ${current.sha}`));
  }
  return out;
}

/**
 * What a well-formed tool-trajectory row must be, as against what a code row must be.
 *
 * The rules are the ones that can actually be broken here: a transcript that never calls a tool,
 * a call whose arguments are not the JSON string every chat template expects, and a run that
 * ends on neither a call nor an answer.
 */
function trajectoryShapeIssues(row, where) {
  const out = [];
  const messages = row?.messages;
  if (!Array.isArray(messages) || messages.length < 2) {
    return [issue('message_shape', `${where}: a trajectory needs at least a request and a call`)];
  }
  if (messages[0]?.role !== 'system' || typeof messages[0]?.content !== 'string' || !messages[0].content.trim()) {
    out.push(issue('system_empty', `${where}: trajectory rows must open with a non-empty system turn`));
  }
  if (!messages.some((m) => m?.role === 'user' && typeof m?.content === 'string' && m.content.trim())) {
    out.push(issue('instruction_empty', `${where}: no user request in the transcript`));
  }
  const calls = messages.flatMap((m) => (Array.isArray(m?.tool_calls) ? m.tool_calls : []));
  if (!calls.length) out.push(issue('no_tool_call', `${where}: a trajectory row with no tool call teaches nothing about tools`));
  for (const call of calls) {
    const args = call?.function?.arguments;
    if (typeof call?.function?.name !== 'string' || !call.function.name.trim()) {
      out.push(issue('tool_call_shape', `${where}: a tool call has no name`));
    }
    if (typeof args !== 'string') {
      out.push(issue('tool_call_shape', `${where}: tool call arguments must be a JSON string, got ${typeof args}`));
    } else {
      try { JSON.parse(args); } catch { out.push(issue('tool_call_shape', `${where}: tool call arguments are not valid JSON`)); }
    }
  }
  const last = messages.at(-1);
  const ends = last?.role === 'assistant' && (Array.isArray(last?.tool_calls) ? last.tool_calls.length > 0 : Boolean(String(last?.content ?? '').trim()));
  if (!ends) out.push(issue('response_empty', `${where}: the transcript does not end on an assistant call or answer`));
  return out;
}

function isTrajectory(row) {
  if (row?.meta?.kind === 'apple-tool-trajectory' || row?.meta?.kind === 'tool-trajectory') return true;
  return Array.isArray(row?.messages) && row.messages.some((m) =>
    m?.role === 'tool' || Array.isArray(m?.tool_calls) || Array.isArray(m?.toolCalls));
}

function hashCode(code) {
  return createHash('sha256').update(String(code).replace(/\s+/g, ' ')).digest('hex');
}

function addCount(map, key, n = 1) {
  map.set(key, (map.get(key) ?? 0) + n);
}

/**
 * Audit in-memory split rows. `syntaxCheck` and `semanticCheck` are injectable for unit tests.
 *
 * Context findings are status, not per-row format errors: the result remains useful for measuring
 * a harvested corpus, while `ready` is false until every response is standalone. This distinction
 * keeps the report honest without deleting 346 potentially useful examples from disk.
 */
export function auditRows(splitRows, {
  evalGuard = loadEvalGuard(),
  licenseIndex = buildLicenseIndex(),
  syntaxCheck = checkLuauSyntax,
  semanticCheck = checkNoAntipattern,
  splits = DATASET_SPLITS,
} = {}) {
  const errors = [];
  const warnings = [];
  const issueCounts = new Map();
  const splitSizes = {};
  const all = [];
  const contextByName = new Map();
  const contextSamples = [];
  const seenResponse = new Map();
  const seenInstruction = new Map();
  let validRows = 0;
  let contextIndependentRows = 0;
  let trajectoryRows = 0;
  let instructionEvalHits = 0;
  let responseEvalHits = 0;
  let rowsWithEvalLeak = 0;
  let checkerUnavailable = 0;

  if (!evalGuard || !(evalGuard.shingles instanceof Set) || evalGuard.shingles.size === 0 || evalGuard.parseErrors?.length) {
    const detail = evalGuard?.parseErrors?.length
      ? evalGuard.parseErrors.join('; ')
      : 'evaluation shingle set is empty';
    const e = issue('eval_guard_unavailable', `evaluation contamination guard did not produce a complete corpus: ${detail}`);
    errors.push(e); addCount(issueCounts, e.code);
  }
  if (!licenseIndex?.ok) {
    const e = issue('license_registry_unavailable', `current training licence registry could not be read: ${licenseIndex?.error ?? 'unknown error'}`);
    errors.push(e); addCount(issueCounts, e.code);
  }

  for (const split of splits) {
    const entries = splitRows?.[split];
    if (!Array.isArray(entries) || !entries.length) {
      const e = issue('split_empty', `${split}: no rows supplied`);
      errors.push(e); addCount(issueCounts, e.code);
      splitSizes[split] = 0;
      continue;
    }
    splitSizes[split] = entries.length;
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      const row = entry?.row ?? entry;
      const line = entry?.line ?? i + 1;
      const where = `${split}:${line}`;
      const rowErrors = [];
      // A TRAJECTORY IS NOT A MALFORMED CODE ROW. `extractPair` enforces exactly
      // system,user,assistant with the builder's instruction suffix and a fenced Luau answer —
      // the shape of a harvested completion row. A tool trajectory is deliberately none of those:
      // its assistant turns carry `tool_calls` with empty content and the transcript is as long
      // as the run. Judged by the code-row rules it reports `message_shape` and `response_empty`
      // on every row, and the resulting NOT_READY verdict would be a fact about the RULER, not
      // about the data. Each kind is now measured by the rules that apply to it.
      // THE SUFFIX IS A HARVEST ARTEFACT, AND REQUIRING IT EVERYWHERE PROPAGATES IT.
      //
      // `INSTRUCTION_SUFFIX` exists because a harvested row's instruction was SYNTHESISED around
      // somebody else's code; the suffix is the marker of where the invented part begins. A
      // first-party prompt is not synthesised — "Write a standalone Luau module returning
      // purchase(balance, price, owned)..." IS the instruction, and appending "Write the Luau
      // implementation." to it adds nothing but a constant.
      //
      // Not a neutral constant, either. The apple-v3 probe against the served adapter answered a
      // Luau request with an empty function body followed by the words "Write the corre" — it had
      // learned to reproduce the scaffolding that ends every row of its training set rather than
      // to write Luau. Requiring the suffix on first-party rows would rebuild the thing that was
      // observed doing harm. So it is required of harvested rows, whose builder contracts to
      // emit it, and not of rows this repository authored.
      const firstParty = FIRST_PARTY_ORIGINS.has(row?.meta?.origin);
      const pair = isTrajectory(row)
        ? { instruction: null, code: null, errors: trajectoryShapeIssues(row, where) }
        : extractPair(row, where, { requireSuffix: !firstParty });
      rowErrors.push(...pair.errors);
      rowErrors.push(...provenanceIssues(row, where, licenseIndex));

      let context = { parseOk: false, unknownGlobals: [], implicitGlobals: [], requires: [], dependencies: [], standalone: false };
      if (pair.code) {
        const syntax = syntaxCheck(pair.code);
        if (!syntax?.passed) {
          const e = issue(syntax?.unavailable ? 'syntax_unverified' : 'syntax_invalid', `${where}: ${syntax?.detail ?? 'Luau syntax check failed'}`);
          rowErrors.push(e);
          if (syntax?.unavailable) checkerUnavailable += 1;
        }
        const semantic = semanticCheck(pair.code);
        if (!semantic?.passed) {
          const e = issue(semantic?.unavailable ? 'semantics_unverified' : 'semantics_invalid', `${where}: ${semantic?.detail ?? 'semantic safety check failed'}`);
          rowErrors.push(e);
          if (semantic?.unavailable) checkerUnavailable += 1;
        }
        context = detectContextDependencies(pair.code, { path: row?.meta?.path ?? null });
        for (const dep of context.dependencies) {
          addCount(contextByName, `${dep.kind}:${dep.name}`);
          if (contextSamples.length < 12) contextSamples.push({ split, line, path: row?.meta?.path ?? null, dependency: dep });
        }
        if (context.standalone) contextIndependentRows += 1;
      }

      if (pair.instruction && evalGuard?.shingles instanceof Set && evalGuard.shingles.size) {
        const instructionHit = contaminated({ doc: pair.instruction }, evalGuard.shingles);
        const responseHit = pair.code ? contaminated({ doc: pair.code }, evalGuard.shingles) : false;
        if (instructionHit) instructionEvalHits += 1;
        if (responseHit) responseEvalHits += 1;
        if (instructionHit || responseHit) {
          rowsWithEvalLeak += 1;
          rowErrors.push(issue('eval_leakage', `${where}: instruction or response shares an evaluation-corpus shingle`));
        }
      }

      if (pair.code) {
        const responseKey = hashCode(pair.code);
        const previous = seenResponse.get(responseKey);
        if (previous) {
          const e = issue('duplicate_response', `${where}: response duplicates ${previous}`, { split, line });
          warnings.push(e);
        } else seenResponse.set(responseKey, `${split}:${line}`);
      }
      if (pair.instruction) {
        const instructionKey = normalise(pair.instruction);
        const previous = seenInstruction.get(instructionKey);
        if (previous) {
          warnings.push(issue('duplicate_instruction', `${where}: instruction also appears at ${previous}`, { split, line }));
        } else seenInstruction.set(instructionKey, `${split}:${line}`);
      }

      for (const e of rowErrors) {
        const full = { ...e, split, line, path: row?.meta?.path ?? null };
        errors.push(full); addCount(issueCounts, e.code);
      }
      if (!rowErrors.length) validRows += 1;
      if (isTrajectory(row)) trajectoryRows += 1;
      all.push({ split, line, row, pair, context, errors: rowErrors });
    }
  }

  const totalRows = all.length;
  const contextDependentRows = all.filter((x) => !x.context.standalone && x.pair.code).length;
  const byDependency = Object.fromEntries([...contextByName].sort((a, b) => b[1] - a[1]).slice(0, 50));
  const instructionDuplicates = warnings.filter((e) => e.code === 'duplicate_instruction').length;
  const responseDuplicates = warnings.filter((e) => e.code === 'duplicate_response').length;
  const rowErrors = errors.filter((e) => e.split);
  const ready = errors.length === 0 && contextDependentRows === 0;
  const productShapeReady = ready && trajectoryRows > 0;

  return {
    verdict: productShapeReady
      ? 'READY_FOR_PRODUCT_SFT'
      : ready
        ? 'READY_FOR_CODE_SFT_NOT_PRODUCT_TRAJECTORIES'
        : 'NOT_READY_FOR_PRODUCT_SFT',
    ready,
    productShapeReady,
    splitSizes,
    totals: {
      rows: totalRows,
      validRows,
      invalidRows: new Set(rowErrors.map((e) => `${e.split}:${e.line}`)).size,
      contextIndependentRows,
      contextDependentRows,
      contextDependentRate: totalRows ? Number((contextDependentRows / totalRows).toFixed(4)) : null,
      trajectoryRows,
      harvestedCodeRows: totalRows - trajectoryRows,
      instructionDuplicates,
      responseDuplicates,
    },
    context: {
      dependencyRows: contextDependentRows,
      byDependency,
      samples: contextSamples,
    },
    evaluation: {
      taskCount: evalGuard?.taskCount ?? 0,
      files: evalGuard?.files?.length ?? 0,
      shingleCount: evalGuard?.shingles?.size ?? 0,
      rowsWithLeakage: rowsWithEvalLeak,
      instructionHits: instructionEvalHits,
      responseHits: responseEvalHits,
      shingleN: SHINGLE_N,
    },
    licensing: {
      registrySources: licenseIndex?.admitted?.length ?? 0,
      registryRejected: licenseIndex?.rejected?.length ?? 0,
      rowsChecked: totalRows,
      regressionRows: errors.filter((e) => e.code === 'license_regression' || e.code === 'pin_regression').length,
    },
    checkers: { unavailable: checkerUnavailable },
    issueCounts: Object.fromEntries(issueCounts),
    errors,
    warnings,
    // `rows` stays available to programmatic callers, but the CLI intentionally prints only
    // aggregate evidence and bounded samples. It is not serialised into a report by default.
    rows: all,
  };
}

export function auditDataset({
  dataDir = DEFAULT_DATA_DIR,
  evalDir = DEFAULT_EVAL_DIR,
  manifestPath = DEFAULT_MANIFEST,
  rawDir = DEFAULT_RAW_DIR,
  ...options
} = {}) {
  const splitRows = loadDataset(dataDir, { splits: options.splits ?? DATASET_SPLITS });
  return auditRows(splitRows, {
    ...options,
    evalGuard: options.evalGuard ?? loadEvalGuard(evalDir),
    licenseIndex: options.licenseIndex ?? buildLicenseIndex({ manifestPath, rawDir }),
  });
}

function main() {
  const args = process.argv.slice(2);
  const argOf = (flag, dflt) => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
  };
  try {
    const report = auditDataset({ dataDir: argOf('--data', DEFAULT_DATA_DIR) });
    console.log(`dataset: ${Object.entries(report.splitSizes).map(([s, n]) => `${s}=${n}`).join(' ')} (${report.totals.rows} rows)`);
    console.log(`usable instruction/response rows: ${report.totals.validRows}/${report.totals.rows}`);
    console.log(`context-dependent rows: ${report.totals.contextDependentRows}/${report.totals.rows} (${(report.totals.contextDependentRate * 100).toFixed(1)}%)`);
    console.log(`Apple tool trajectories: ${report.totals.trajectoryRows}; harvested code rows: ${report.totals.harvestedCodeRows}`);
    console.log(`evaluation guard: ${report.evaluation.taskCount} tasks, ${report.evaluation.shingleCount} shingles, ${report.evaluation.rowsWithLeakage} leaked rows`);
    console.log(`licence guard: ${report.licensing.rowsChecked} rows checked against ${report.licensing.registrySources} admitted sources, ${report.licensing.regressionRows} regressions`);
    console.log(`verdict: ${report.verdict}`);
    if (Object.keys(report.issueCounts).length) console.log(`issues: ${JSON.stringify(report.issueCounts)}`);
    if (report.context.samples.length) console.log(`context samples: ${JSON.stringify(report.context.samples.slice(0, 3))}`);
    if (args.includes('--strict') && !report.ready) process.exitCode = 1;
  } catch (e) {
    console.error(`audit unavailable: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
