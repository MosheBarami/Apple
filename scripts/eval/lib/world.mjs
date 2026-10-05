// The JavaScript side of scripts/eval/luau/world-state.luau: turn a mode and a baseline into the Luau source that
// Studio's execute_luau runs, and read what it returns.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const WORLD_STATE_PATH = join(HERE, '..', 'luau', 'world-state.luau');
export const MODES = ['capture', 'reset', 'verify', 'measure'];
const LONG_BRACKET = ']=====]';

/** The Luau to send for `mode`. `baseline` is the object `capture` returned (not needed to capture). */
export function worldScript(mode, baseline, source = readFileSync(WORLD_STATE_PATH, 'utf8')) {
  if (!MODES.includes(mode)) throw new Error(`unknown world-state mode "${mode}"`);
  let baselineJson = '';
  if (mode !== 'capture') {
    if (!baseline || typeof baseline !== 'object') throw new Error(`world-state ${mode} needs the baseline from \`--init-baseline\``);
    baselineJson = JSON.stringify(baseline);
    if (baselineJson.includes(LONG_BRACKET)) throw new Error('the baseline contains a Luau long-bracket terminator; cannot embed it');
  }
  return `local MODE = ${JSON.stringify(mode)}\nlocal BASELINE_JSON = [=====[${baselineJson}${LONG_BRACKET}\n${source}`;
}

/**
 * What execute_luau answered, as an object. The script returns one JSON string; the tool may hand it back bare,
 * quoted, or after a short prefix, so this takes the outermost {...} (or a JSON string holding one).
 */
export function parseLuauJson(text) {
  const t = String(text ?? '').trim();
  const attempts = [];
  attempts.push(t);
  const open = t.indexOf('{');
  const close = t.lastIndexOf('}');
  if (open >= 0 && close > open) attempts.push(t.slice(open, close + 1));
  for (const a of attempts) {
    try {
      let v = JSON.parse(a);
      if (typeof v === 'string') v = JSON.parse(v);
      if (v && typeof v === 'object') return v;
    } catch {
      /* try the next reading */
    }
  }
  throw new Error(`execute_luau did not return the JSON the script builds: ${t.slice(0, 200)}`);
}

const empty = (v) => v === undefined || v === null || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);

/** A `verify` answer is clean when nothing was added, nothing is missing, and no recorded property differs. */
export function isClean(verify) {
  return empty(verify?.extra) && empty(verify?.missing) && empty(verify?.propDiffs);
}

const list = (v) => (Array.isArray(v) ? v : []);
/** The counts the manifest records for a verify answer, whatever its shape. */
export function verifyCounts(verify) {
  return { extra: list(verify?.extra).length, missing: list(verify?.missing).length, propDiffs: list(verify?.propDiffs).length };
}

/** Is this capture result a usable baseline? (Every service listed, kept parts recorded.) */
export function baselineProblems(b) {
  const problems = [];
  if (!b || typeof b !== 'object') return ['not an object'];
  if (!b.inventory || typeof b.inventory !== 'object') problems.push('no inventory');
  else if (!Array.isArray(b.inventory.Workspace)) problems.push('no Workspace inventory');
  if (!b.parts || !Object.keys(b.parts).some((k) => k.startsWith('Workspace/'))) problems.push('no Baseplate or SpawnLocation was recorded: is this an empty place?');
  return problems;
}

/** Things in a pristine inventory that a pristine place should not have: scripts, UI, models. A warning, not a refusal. */
export function baselineWarnings(b) {
  const warnings = [];
  const inv = b?.inventory ?? {};
  const loose = (inv.Workspace ?? []).filter((k) => !/^Workspace\/(Baseplate|SpawnLocation)#/.test(k) && !/^Workspace\/(Baseplate|SpawnLocation)#[A-Za-z]+\//.test(k));
  if (loose.length) warnings.push(`Workspace holds more than a Baseplate and a SpawnLocation: ${loose.slice(0, 5).join(', ')}`);
  for (const svc of ['ServerScriptService', 'ReplicatedStorage', 'ServerStorage', 'StarterGui', 'StarterPack']) {
    if ((inv[svc] ?? []).length) warnings.push(`${svc} is not empty in the baseline (${inv[svc].length} instances): is this place pristine?`);
  }
  return warnings;
}
