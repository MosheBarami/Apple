/**
 * THERE IS NO OWNER LIBRARY IN THE PRODUCT (plan section 3.2, handoff M4 step 4.2; owner decision).
 *
 * The product used to read a private library of the owner's uploaded games through a gateway on the owner's Mac
 * (127.0.0.1:63747), and could copy a whole saved game into a place (recreate_owner_game, build_game). A customer's
 * Studio has no such Mac, and a request must never be answered by copying the owner's games. This file fails if any
 * way back comes in:
 *
 *   - one of the thirteen tools registered, offered to a run, in the permissions table, in the MCP table or in a run label;
 *   - the plugin ops that served them (the owner and library ops) in the wire type, or the plugin families that held them;
 *   - the modules that did it existing again, or the gateway address / name written in production source;
 *   - the owner tiers of find_library_model (it searches the bundled Roblox-owned models and the live Creator Store only);
 *   - request-word routing to the owner library (a request that mentions "my library" being treated differently).
 *
 * Each assertion has a control beside it where a scan could be empty by accident.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(WORKER, '..', '..');
const TMP = mkdtempSync(join(tmpdir(), 'no-owner-library-'));
test.after(() => rmSync(TMP, { recursive: true, force: true }));

async function bundle(abs, name) {
  const out = join(TMP, `${name}.mjs`);
  await esbuild.build({ entryPoints: [abs], bundle: true, format: 'esm', platform: 'node', target: 'es2022', outfile: out, logLevel: 'silent', external: ['cloudflare:*'] });
  return import(pathToFileURL(out).href);
}
const T = await bundle(join(WORKER, 'src', 'tools.ts'), 'tools');
const R = await bundle(join(WORKER, 'src', 'router.ts'), 'router');
const M = await bundle(join(WORKER, 'src', 'mcp.ts'), 'mcp');
const S = await bundle(join(ROOT, 'packages', 'shared', 'src', 'index.ts'), 'shared');

const TOOLS = ['browse_owner_library', 'import_owner_library', 'install_owner_system', 'recreate_owner_game', 'plan_game', 'build_game',
  'query_owner_catalog', 'query_owner_assembly', 'read_owner_component', 'read_owner_media', 'list_owner_original_strings',
  'read_owner_original_string', 'insert_owner_component'];
const OPS = ['query_owner_local', 'query_owner_exact', 'query_owner_assembly', 'query_owner_media', 'import_owner_local',
  'query_owner_library', 'import_owner_library', 'import_owner_component'];

function walk(dir, keep, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, keep, out);
    else if (keep(p)) out.push(p);
  }
  return out;
}
const production = [
  ...walk(join(WORKER, 'src'), (p) => /\.(ts|mjs)$/.test(p)),
  ...walk(join(ROOT, 'packages', 'shared', 'src'), (p) => /\.ts$/.test(p)),
  ...walk(join(ROOT, 'apps', 'studpilot-plugin', 'src'), (p) => /\.luau$/.test(p)),
];

test('the scan reads production source (control: it is not empty)', () => {
  assert.ok(production.length > 100, `only ${production.length} files were scanned`);
  assert.ok(production.some((p) => p.endsWith('tools.ts')) && production.some((p) => p.endsWith('Commands.luau')));
});

test('none of the thirteen owner-library tools exists: not registered, not offered, not in a table, not an MCP entry', () => {
  assert.ok('find_library_model' in T.TOOLS && 'insert_library_model' in T.TOOLS, 'control: the Creator Store tools are still registered');
  for (const name of TOOLS) {
    assert.equal(name in T.TOOLS, false, `${name} is registered`);
    assert.equal(R.toolsForMode('agent', true, Object.keys(T.TOOLS)).has(name), false, `${name} is offered to an agent run`);
    assert.equal(S.GOVERNED_TOOL_NAMES.includes(name), false, `${name} is in the permissions table`);
    assert.equal(name in (M.MCP_EXCLUDED ?? {}), false, `${name} is in the MCP exclusion table`);
  }
});

test('the plugin ops that served them are not in the wire type, and the plugin families that held them are gone', () => {
  const wire = readFileSync(join(ROOT, 'packages', 'shared', 'src', 'index.ts'), 'utf8');
  const union = wire.slice(wire.indexOf('export type StudioOp'), wire.indexOf('\n\n', wire.indexOf('export type StudioOp')));
  assert.ok(/op: 'insert_asset'/.test(union), 'control: the union was read');
  for (const op of OPS) assert.equal(new RegExp(`op: '${op}'`).test(union), false, `${op} is in StudioOp`);
  for (const f of ['OwnerCorpus.luau', 'LocalOwnerCorpus.luau']) assert.equal(existsSync(join(ROOT, 'apps', 'studpilot-plugin', 'src', 'ops', f)), false, f);
  const commands = readFileSync(join(ROOT, 'apps', 'studpilot-plugin', 'src', 'Commands.luau'), 'utf8');
  for (const op of OPS) assert.equal(new RegExp(`\\b${op}\\b`).test(commands), false, `${op} is handled by the plugin`);
});

test('the modules that did it do not exist, and the gateway address and name are written nowhere in production source', () => {
  for (const f of ['owner-corpus.ts', 'owner-corpus-routes.ts', 'owner-evidence.ts', 'local-owner-corpus.ts', 'game-plan.ts', 'library-assemble.ts', 'private-audio.ts', 'menu-binder.ts']) {
    assert.equal(existsSync(join(WORKER, 'src', f)), false, `src/${f} is back`);
  }
  const hits = [];
  // user-export.ts is the one place that may name the old D1 table (a note that it is gone but its rows may remain).
  for (const p of production.filter((f) => !f.endsWith('user-export.ts'))) {
    const text = readFileSync(p, 'utf8');
    for (const re of [/63747/, /owner[_-]gateway/i, /ownerGateway/, /\bowner[_-]?corpus\b/i, /owner_library|owner-library/i, /recreate_owner_game|install_owner_system/, /\bplan_game\b|\bbuild_game\b/]) {
      if (re.test(text)) hits.push(`${relative(ROOT, p)}: ${re}`);
    }
  }
  assert.deepEqual(hits, []);
});

test('find_library_model searches the bundled models and the live Creator Store only', () => {
  const def = T.TOOLS.find_library_model.def;
  assert.doesNotMatch(def.description, /owner library|owner's|owner-local|owner components|owner corpus/i, 'its description still names an owner tier');
  for (const k of ['sourceSHA', 'after', 'className']) assert.equal(k in def.parameters.properties, false, `parameter ${k} is back`);
  assert.deepEqual(Object.keys(T.TOOLS.insert_library_model.def.parameters.properties).filter((k) => k === 'gameId' || k === 'path'), []);
  const src = readFileSync(join(WORKER, 'src', 'tools.ts'), 'utf8');
  assert.equal(/localOwnerGateway/.test(src), false, 'a run still carries a local-gateway flag');
});

test('no request word routes a run to an owner library (request-scope.ts and the run loop hold no such rule)', () => {
  const scope = readFileSync(join(WORKER, 'src', 'request-scope.ts'), 'utf8');
  assert.ok(/isLightingOnlyRequest/.test(scope), 'control: the file was read');
  assert.doesNotMatch(scope, /owner library|uploaded|my library|OwnerRecreate|OwnerLibraryOnly/i);
  const session = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
  assert.doesNotMatch(session, /ownerRecreate|ownerLibraryOnly|keepOwnerOriginal|OWNER_RECREATE_FIRST|OWNER_LIBRARY_ONLY/);
});
