// The JavaScript side of scripts/eval/luau/world-state.luau: turn a mode and a baseline into the Luau source that
// Studio's execute_luau runs, and read what it returns.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pluginPermissions } from '../../../apps/studpilot-plugin/scripts/api-dump.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const WORLD_STATE_PATH = join(HERE, '..', 'luau', 'world-state.luau');
/** The plugin's command engine. Since plugin 2.0 it has no write allowlist: what it may write is the API dump's rule. */
export const COMMANDS_PATH = join(HERE, '..', '..', '..', 'apps', 'studpilot-plugin', 'src', 'Commands.luau');
export const MODES = ['capture', 'reset', 'verify', 'measure', 'ui-enable', 'ui-restore'];
/** The shape of a baseline file: 2 records every property and attribute of every kept instance (1 recorded only the services and the parts in Workspace). */
export const BASELINE_FORMAT = 2;
const LONG_BRACKET = ']=====]';

/**
 * The property names the Studio plugin may write. Plugin 2.0 (owner, 2026-10-08) has no hand-written allowlist: it writes
 * every property Roblox's API dump marks plugin-writable, minus a short deny list, read here the same way
 * (apps/studpilot-plugin/scripts/api-dump.mjs). Throws when the list reads implausibly short: an unreadable list must
 * never become an empty one, because then the harness would track nothing and call every place clean.
 */
export function propertyAllowNames(perms = pluginPermissions()) {
  const names = [...perms.writableNames].filter((n) => /^[A-Za-z][A-Za-z0-9_]*$/.test(n)).sort();
  if (names.length < 100) throw new Error(`only ${names.length} property names were read from the plugin's API dump; refusing to track a fraction of what the plugin can write`);
  return names;
}

/** The names as a Luau table constructor: `{ "Anchored", "CanCollide", ... }`. */
export const propertyNamesLuau = (names = propertyAllowNames()) => `{ ${names.map((n) => JSON.stringify(n)).join(', ')} }`;

/** The Luau to send for `mode`. `baseline` is the object `capture` returned (not needed to capture or to restore a UI). */
export function worldScript(mode, baseline, source = readFileSync(WORLD_STATE_PATH, 'utf8'), names = propertyAllowNames()) {
  if (!MODES.includes(mode)) throw new Error(`unknown world-state mode "${mode}"`);
  let baselineJson = '';
  if (mode !== 'capture' && mode !== 'ui-restore') {
    if (!baseline || typeof baseline !== 'object') throw new Error(`world-state ${mode} needs the baseline from \`--init-baseline\``);
    baselineJson = JSON.stringify(baseline);
    if (baselineJson.includes(LONG_BRACKET)) throw new Error('the baseline contains a Luau long-bracket terminator; cannot embed it');
  }
  return `local MODE = ${JSON.stringify(mode)}\nlocal BASELINE_JSON = [=====[${baselineJson}${LONG_BRACKET}\nlocal PROPERTY_NAMES = ${propertyNamesLuau(names)}\n${source}`;
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

/** Is this capture result a usable baseline? (The current format, every service listed, kept parts recorded with their properties.) */
export function baselineProblems(b) {
  const problems = [];
  if (!b || typeof b !== 'object') return ['not an object'];
  if (b.format !== BASELINE_FORMAT) problems.push(`the baseline is format ${b.format ?? 1}, not ${BASELINE_FORMAT}: it predates the per-instance properties; run --init-baseline again on the pristine place`);
  if (!b.inventory || typeof b.inventory !== 'object') problems.push('no inventory');
  else if (!Array.isArray(b.inventory.Workspace)) problems.push('no Workspace inventory');
  if (!b.state || typeof b.state !== 'object') problems.push('no recorded state');
  else {
    if (!Object.keys(b.state).some((k) => /^Workspace\/[^/]+$/.test(k))) problems.push('no Baseplate or SpawnLocation was recorded: is this an empty place?');
    const withProps = Object.values(b.state).filter((v) => v && typeof v === 'object' && Object.keys(v.props ?? {}).length > 0).length;
    if (withProps === 0) problems.push('no instance has a recorded property: the script tracked nothing');
  }
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
