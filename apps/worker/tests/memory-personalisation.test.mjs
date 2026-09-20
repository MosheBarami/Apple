// The wiring: scoped memory reaching the agent, and reaching the person.
//
// `memory-store.test.mjs` and `preferences.test.mjs` prove the store and the rules. This file is
// about the three joins that make them a feature rather than a library:
//
//   1. Every route proves the scope BEFORE it touches a row. The scope id in a URL is a question;
//      `memoryScopeAccess` is the answer, and it is the only way in.
//   2. The agent reads the same rows through the same functions the panel does, so the panel cannot
//      show one thing while the run does another.
//   3. Tool permissions are applied ON TOP of the mode's toolset, never instead of it — the one
//      place a preference touches what the agent may DO rather than how it talks.
//
// Assertions are anchored to the slice of source that carries the claim, never to "somewhere in the
// file": a second occurrence elsewhere would satisfy a whole-file match and the test would never go
// red again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const WEB = join(WORKER, '..', 'web');

const INDEX = readFileSync(join(WORKER, 'src', 'index.ts'), 'utf8');
const SESSION = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
const PROMPTS = readFileSync(join(WORKER, 'src', 'prompts.ts'), 'utf8');
const PANEL = readFileSync(join(WEB, 'src', 'components', 'ws', 'instructions-panel.tsx'), 'utf8');
const WS = readFileSync(join(WEB, 'src', 'routes', 'workspace.tsx'), 'utf8');
const API = readFileSync(join(WEB, 'src', 'lib', 'api.ts'), 'utf8');

/** The body of one route handler, from its `app.<verb>(` line to the next top-level `app.` line. */
function route(src, signature) {
  const start = src.indexOf(signature);
  assert.notEqual(start, -1, `route not found: ${signature}`);
  const next = src.indexOf('\napp.', start + signature.length);
  return src.slice(start, next === -1 ? src.length : next);
}

function assertToolPermissionNarrowing(src) {
  const modeBases = new Set(
    [...src.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*toolsForMode\(\s*(?:mode|agent\.mode)\s*,\s*studioConnected\s*,\s*toolNames\(\)\s*\);/g)]
      .map((m) => m[1]),
  );
  assert.ok(modeBases.size > 0, 'no mode-derived toolset was found');

  const permissionBases = [...src.matchAll(/applyToolPermissions\(\s*([A-Za-z_$][\w$]*)\s*,/g)].map((m) => m[1]);
  assert.ok(permissionBases.length > 0, 'the run loop no longer applies tool permissions at all');
  for (const name of permissionBases) {
    assert.ok(modeBases.has(name), `applyToolPermissions base "${name}" is not derived from toolsForMode`);
  }

  // Prompt capability notes and executable tool definitions must both be downstream of the same
  // mode -> user-permission narrowing, with plugin capabilities narrowing again afterwards.
  assert.match(src, /const promptCapabilityFilter = this\.pluginToolFilter\(promptUserTools\);/);
  assert.match(src, /const offeredCapabilityFilter = this\.pluginToolFilter\(userAllowed\);/);
  // The trailing comma was a third argument — `{ assetLibrary: hasAssetLibrary }` — and it went
  // with the asset catalogue on 2026-09-20. What this assertion is for is that the tools OFFERED
  // to the model come from `offeredAllowed`, the fully narrowed set, so the boundary is matched
  // rather than the argument list.
  assert.match(src, /tools:\s*toolDefs\(studioConnected, offeredAllowed\)/);
  assert.match(src, /const allowed = new Set\(\[\.\.\.offeredAllowed\]\.filter\(\(name\) => capabilityFilter\.allowed\.has\(name\)\)\);/);
}

const SCOPED_ROUTES = [
  "app.get('/api/memory/:scope/:scopeId'",
  "app.put('/api/memory/:scope/:scopeId/entries/:key'",
  "app.delete('/api/memory/:scope/:scopeId/entries/:key'",
  "app.put('/api/memory/:scope/:scopeId/preferences'",
  "app.put('/api/memory/user/:scopeId/profile'",
  "app.get('/api/memory/:scope/:scopeId/export'",
  "app.post('/api/memory/:scope/:scopeId/import'",
  "app.get('/api/memory/:scope/:scopeId/audit'",
  "app.get('/api/projects/:id/personalisation'",
];

// ------------------------------------------------------------------ proving the scope ---

test('every scoped-memory route proves the scope before it touches a row', () => {
  for (const sig of SCOPED_ROUTES) {
    const body = route(INDEX, sig);
    assert.match(body, /const proven = await memoryScopeAccess\(/, sig);
    assert.match(body, /if \(!proven\) return c\.json\(\{ error: 'not found' \}, 404\)/, sig);
    // Proof first. A read placed above the check would be a check that happens after the answer.
    const check = body.indexOf('if (!proven)');
    for (const call of ['listMemoryEntries(', 'putMemoryEntry(', 'deleteMemoryEntry(', 'readMemoryAudit(', 'parseImport(', 'personalisationForProject(']) {
      const at = body.indexOf(call);
      if (at !== -1) assert.ok(at > check, `${sig}: ${call} runs before the scope is proven`);
    }
  }
});

test('project scope is proven by an ownership query, not by the id in the URL', () => {
  const fn = INDEX.slice(INDEX.indexOf('async function memoryScopeAccess('), INDEX.indexOf('const MEMORY_VOCAB'));
  assert.match(fn, /if \(!isMemoryScope\(scope\) \|\| !scopeId\) return null;/);
  assert.match(fn, /const project = await getOwnedProject\(c\.env, user\.jwt, scopeId\);/);
  assert.match(fn, /if \(!project\) return null;/);
  // The PROVEN id goes into the context, not the one from the URL — they differ in case and
  // encoding, and addressing rows by the unproven spelling is how two ids become one tenant.
  assert.match(fn, /projectIds\.push\(project\.id\);/);
  assert.ok(fn.indexOf('UUID_RE.test(scopeId)') < fn.indexOf('getOwnedProject'), 'shape-check before the query');
});

test('user scope is the caller and an org must be one they are in', () => {
  const fn = INDEX.slice(INDEX.indexOf('async function memoryScopeAccess('), INDEX.indexOf('const MEMORY_VOCAB'));
  assert.match(fn, /if \(scope === 'user' && scopeId !== user\.userId\) return null;/);
  assert.match(fn, /if \(scope === 'org' && !orgs\.some\(\(o\) => o\.orgId === scopeId\)\) return null;/);
  // Membership is READ, never taken from the request.
  assert.match(fn, /const orgs = await orgMembership\(c\.env, user\.userId\);/);
});

test('the routes that CHANGE things check write access, which is narrower than read for an org', () => {
  for (const sig of [
    "app.put('/api/memory/:scope/:scopeId/preferences'",
    "app.post('/api/memory/:scope/:scopeId/import'",
  ]) {
    const body = route(INDEX, sig);
    assert.match(body, /if \(!canWriteScope\(proven\.access, proven\.scope, scopeId\)\) return c\.json\(\{ error: 'forbidden' \}, 403\)/, sig);
  }
  // The single-entry routes delegate to the store, which checks the same thing — asserted here so
  // removing the delegation shows up as a failure rather than as a silent widening.
  const put = route(INDEX, "app.put('/api/memory/:scope/:scopeId/entries/:key'");
  assert.match(put, /out\.reason === 'forbidden' \? 403 : 400/);
});

test('the key comes from the path, so a body cannot address a different row than the URL', () => {
  const put = route(INDEX, "app.put('/api/memory/:scope/:scopeId/entries/:key'");
  assert.match(put, /key: c\.req\.param\('key'\)/);
  assert.equal(/key: body\./.test(put), false, 'the body must not choose the key');
  assert.match(put, /scope: proven\.scope/);
  assert.match(put, /scopeId: c\.req\.param\('scopeId'\)/);
});

test('import targets the URL, never the envelope', () => {
  //[[ The whole point of parseImport's target argument. If the route passed the bundle's own scope,
  //   the ownership check above would be bypassed by a file. ]]
  const body = route(INDEX, "app.post('/api/memory/:scope/:scopeId/import'");
  assert.match(body, /parseImport\(raw, \{ scope: proven\.scope, scopeId \}, \{ now: Date\.now\(\), actorId: c\.get\('user'\)\.userId \}\)/);
  // And what was refused is REPORTED. An import that silently dropped rows is indistinguishable
  // from one that worked.
  assert.match(body, /rejected\.push\(\{ key: entry\.key, reason: out\.reason \}\)/);
  assert.match(body, /return c\.json\(\{ imported, rejected \}\)/);
});

test('an export is a private download, not something a shared cache may keep', () => {
  const body = route(INDEX, "app.get('/api/memory/:scope/:scopeId/export'");
  assert.match(body, /'Cache-Control': 'private, no-store'/);
  assert.match(body, /attachment; filename=/);
  assert.match(body, /buildExport\(proven\.scope, scopeId, entries, Date\.now\(\)\)/);
});

test('clearing a preference deletes its row rather than leaving the old value behind', () => {
  // Otherwise "unset" is a state the settings page can display and never reach.
  const body = route(INDEX, "app.put('/api/memory/:scope/:scopeId/preferences'");
  assert.match(body, /const keep = new Set\(wanted\.map\(\(w\) => w\.key\)\);/);
  assert.match(body, /if \(e\.kind === 'preference' && !keep\.has\(e\.key\)\) await deleteMemoryEntry\(/);
  // And the response is what was STORED, re-read, not the object that was posted.
  assert.match(body, /const after = await listMemoryEntries\(/);
  assert.match(body, /preferences: preferencesFromEntries\(after, MEMORY_VOCAB\(\)\)\.prefs, rejected/);
});

test('a model or tool name is validated against what this deployment actually has', () => {
  // MEMORY_VOCAB is the fail-closed allowlist normalisePreferences refuses to work without.
  const vocab = INDEX.slice(INDEX.indexOf('const MEMORY_VOCAB'), INDEX.indexOf('/** The scopes this caller can address'));
  assert.match(vocab, /knownModelIds: allModels\(\)\.map\(\(m\) => m\.id\)/);
  assert.match(vocab, /knownToolNames: toolNames\(\)/);
  for (const sig of ["app.put('/api/memory/:scope/:scopeId/preferences'", "app.get('/api/memory/:scope/:scopeId'"]) {
    assert.match(route(INDEX, sig), /MEMORY_VOCAB\(\)/, sig);
  }
});

// -------------------------------------------------------------------- reaching the agent ---

test('the run builds its access context from what the DO has already proven', () => {
  const block = SESSION.slice(SESSION.indexOf('const personalisation = await'), SESSION.indexOf('const sys = systemPrompt('));
  assert.match(block, /memoryAccessFor\(this\.env, bind\.ownerId, \[bind\.projectId\]\)/);
  assert.match(block, /personalisationForProject\(this\.env, access, \{ projectId: bind\.projectId \}/);
  // Nothing user-supplied chooses the scope: both ids come from the DO's own binding.
  assert.equal(/text|body|req\./.test(block.replace(/\/\/.*$/gm, '')), false, 'no request value may choose the scope');
});

test('a store that cannot be read degrades to NO settings, never to invented ones', () => {
  const block = SESSION.slice(SESSION.indexOf('const personalisation = await'), SESSION.indexOf('const sys = systemPrompt('));
  assert.match(block, /return EMPTY_PERSONALISATION;/);
  assert.ok(block.indexOf('catch') < block.indexOf('EMPTY_PERSONALISATION'), 'the fallback is the catch, not a default');
});

test('what the person asked for reaches the prompt', () => {
  const call = SESSION.slice(SESSION.indexOf('const sys = systemPrompt('), SESSION.indexOf('const history ='));
  assert.match(call, /personalisation: personalisation\.promptBlock/);
  // And the prompt actually renders it, after project memory.
  const build = PROMPTS.slice(PROMPTS.indexOf('  return [\n    IDENTITY'), PROMPTS.indexOf('export const MEMORY_UPDATE_PROMPT'));
  assert.match(build, /opts\.personalisation \?\? ''/);
  assert.ok(build.indexOf('memory,') < build.indexOf('opts.personalisation'), 'the instruction the user wrote is read last');
});

test('tool permissions NARROW the mode toolset, they do not replace it', () => {
  //[[ toolsForMode is what enforces Plan mode's read-only promise. If a preference replaced it
  //   rather than narrowing it, a user setting could hand run_luau to the one mode whose entire
  //   purpose is that it cannot touch the project.
  //
  //   This used to assert one nested expression, literally. The nesting was then split so the
  //   mode's own set could be named and diffed against the narrowed one (`deniedTools`) — the
  //   claim was untouched and the assertion could no longer see it. Rewritten to check the
  //   PROPERTY instead of the spelling: every first argument applyToolPermissions is ever given in
  //   this file must be a binding that came from toolsForMode. That is strictly stronger, because
  //   the old regex only ever looked at the ONE call it found first. ]]
  assertToolPermissionNarrowing(SESSION);

  // Falsification: a prompt path that starts from every registered tool instead of toolsForMode
  // would let a preference bypass the mode boundary. The guard must reject that dataflow even if
  // applyToolPermissions itself is still present.
  const weakened = SESSION.replace(
    /const promptBaseTools = toolsForMode\([^;]+;/,
    'const promptBaseTools = new Set(toolNames());',
  );
  assert.notEqual(weakened, SESSION, 'CONTROL: the synthetic mode bypass must actually be planted');
  assert.throws(
    () => assertToolPermissionNarrowing(weakened),
    /not derived from toolsForMode/,
    'the guard must fail when user preferences replace the mode toolset instead of narrowing it',
  );
});

test('the permissions are pinned to the run, so a mid-build edit cannot change what a run may do', () => {
  assert.match(SESSION, /toolPermissions\?: Record<string, 'allow' \| 'ask' \| 'deny'>;/);
  const init = SESSION.slice(SESSION.indexOf('const agent: AgentState = {'), SESSION.indexOf('await this.persistAgent(agent);', SESSION.indexOf('const agent: AgentState = {')));
  assert.match(init, /toolPermissions: personalisation\.prefs\.tool_permissions,/);
});

// ------------------------------------------------------------------ reaching the person ---

test('the panel is mounted next to the memory panel and unmounted with the drawer', () => {
  assert.match(WS, /\{drawer === 'memory' && <InstructionsPanel projectId=\{projectId\} \/>\}/);
  // The original panel is still there — this one is the other half, not a replacement.
  assert.match(WS, /\{drawer === 'memory' && <MemoryPanel projectId=\{projectId\} \/>\}/);
});

test('the panel says which layer is answering, and what it is overriding', () => {
  // A person who sets "reply in Hebrew" on their account, watches a project answer in English and
  // is shown no reason concludes the control is broken.
  assert.match(PANEL, /from \{SCOPE_LABEL\[r\.scope\]\}/);
  assert.match(PANEL, /overriding \{r\.shadowedBy\.map\(\(s\) => SCOPE_LABEL\[s\.scope\]\)\.join\(', '\)\}/);
});

test('the layering is read from the server, not recomputed in the browser', () => {
  // The precedence rule has exactly ONE implementation — resolveMemoryLayers, which the agent also
  // uses. A browser that re-derived a winner would be a second one, and the two would diverge the
  // first time either changed: the panel would then show a setting the run is not using.
  assert.match(PANEL, /queryFn: \(\) => fetchPersonalisation\(projectId\)/);
  const render = PANEL.slice(PANEL.indexOf('{resolved.data && ('), PANEL.indexOf('take it with you'));
  assert.notEqual(render.length, 0, 'the resolved block must exist');
  // Rendered straight off the response: the winner is `r.scope`/`r.value`, and what it beat is
  // `r.shadowedBy`. No ordering, no comparison, no ranking happens here.
  assert.match(render, /resolved\.data\.resolved\.map\(\(r\) =>/);
  assert.equal(/\.sort\(|localeCompare|precedenceOf|SCOPE_RANK|SCOPE_ORDER/.test(render), false, 'no ranking in the browser');
});

test('an unsaved edit survives a refetch, and does not survive a scope switch', () => {
  assert.match(PANEL, /if \(dirty \|\| !stored\.data\) return;/);
  // Carrying a half-typed account setting into the project tab would silently copy one scope's
  // values onto another.
  assert.match(PANEL, /setDirty\(false\);\s*\n\s*setAdding\(''\);\s*\n\s*setAddTtl\(''\);\s*\n\s*\}, \[scope\]\);/);
});

test('a blank expiry box means "no expiry", never NaN', () => {
  // `Number('')` is 0 and `Number('x')` is NaN; both would be sent as a ttlDays the server refuses,
  // turning "keep this forever" into a rejected save.
  assert.match(PANEL, /addTtl\.trim\(\) && Number\.isFinite\(ttl\) && ttl > 0 \? \{ ttlDays: ttl \} : \{\}/);
  assert.match(API, /typeof entry\.ttlDays === 'number' && Number\.isFinite\(entry\.ttlDays\) && entry\.ttlDays > 0/);
});

test('a refused save is named rather than reported as success', () => {
  assert.match(PANEL, /Not saved: \$\{out\.rejected\.map\(\(r\) => r\.key\)\.join\(', '\)\}/);
  // And an import reports BOTH numbers — "imported 3" alone hides the forty rows that were refused.
  assert.match(PANEL, /Imported \$\{out\.imported\}\. Refused \$\{out\.rejected\.length\}\./);
});

test('a scope the caller cannot write renders read-only rather than failing on save', () => {
  assert.match(PANEL, /const canWrite = stored\.data\?\.canWrite \?\? false;/);
  assert.match(PANEL, /You can read these but not change them/);
  assert.match(PANEL, /disabled=\{!dirty \|\| !canWrite \|\| savePrefs\.isPending\}/);
});

test('the panel says what a delete does and does not do', () => {
  assert.match(PANEL, /Deleting removes the setting itself\./);
  assert.match(PANEL, /do not alter anything already built/);
});

test('the export download carries the token, because an anchor cannot', () => {
  const fn = API.slice(API.indexOf('export async function downloadMemoryExport'), API.indexOf('export const fetchCheckpoints'));
  assert.match(fn, /headers\.set\('Authorization', `Bearer \$\{token\}`\)/);
  assert.match(fn, /filename="\(\[\^"\]\+\)"/, 'the server names the file');
});
