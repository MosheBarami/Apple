// The answer is remembered FOR THIS PROJECT, and the ceiling is the layers above it.
//
// asset-source-policy.test.mjs proves the layering RULE — that `asset_sources` narrows downwards.
// This file is about the two joins that turn the rule into the owner's feature:
//
//   1. AN ANSWER GIVEN IN ONE PROJECT IS THAT PROJECT'S. The dialog used to write the `user`
//      scope, so answering once anywhere settled the question everywhere — including projects
//      where the right answer is different. "Remembered" and "remembered for this project" are
//      different features, and only the second is what was asked for.
//
//   2. THE CEILING EXCLUDES THE PROJECT'S OWN ROW. Because the layers narrow, a project row can be
//      swallowed by an org or account layer that forbids what was ticked — leaving nothing
//      allowed, which is also the state that means "still owes an answer", which reopens the
//      dialog on the next send, forever. The dialog avoids offering that tick at all, and it can
//      only do so if the server tells it what the layers ABOVE this project permit. A ceiling that
//      quietly included the project's own answer would be the project authorising itself, and
//      every assertion about narrowing would still pass.
//
// Against a real SQLite database rather than a recording fake, for the reason stubs/d1.mjs gives:
// the claim "project B does not inherit project A's answer" lives in a WHERE clause, and a fake
// that never runs one would answer "no rows" whether the clause bound both scope columns or none.
// Every per-project assertion below therefore also proves the OTHER project's row is really in the
// table — an empty result from an empty database is a failure to observe wearing the costume of an
// observation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { d1, countRows } from './stubs/d1.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');

/** preferences.ts and memory-store.ts are bundled separately and share ONE database. */
function bundle(rel, tag) {
  const out = join(tmpdir(), `apple-assetsrc-${tag}-${process.pid}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [join(WORKER, 'src', rel), '--bundle', '--format=esm', '--target=es2022', `--outfile=${out}`],
    { cwd: WORKER, stdio: 'pipe' });
  process.on('exit', () => rmSync(out, { force: true }));
  return out;
}
const P = await import(`file://${bundle('preferences.ts', 'prefs')}`);
const M = await import(`file://${bundle('memory-store.ts', 'store')}`);

const INDEX = readFileSync(join(WORKER, 'src', 'index.ts'), 'utf8');

const USER = 'user-aaaa';
const A = 'project-aaaa';
const B = 'project-bbbb';
const ORG = 'org-zzzz';
const pol = (mode, allow) => ({ mode, allow });

/**
 * A database with the memory tables, plus an access context proving both projects.
 *
 * `d1()` returns `{ CORPUS, raw, close }`, which IS the `Pick<Env, 'CORPUS'>` every store function
 * takes — passing `base.CORPUS` instead hands them the binding where they expect the env, and
 * `ensureMemoryTables` memoises per CORPUS object, so each test really does get fresh tables.
 */
async function db() {
  const base = d1();
  await M.ensureMemoryTables(base);
  const access = await M.memoryAccessFor(base, USER, [A, B]);
  return { ...base, env: base, access };
}

/** Store a preference layer the way the PUT /preferences route does — through the real writer. */
async function writePrefs(env, access, scope, scopeId, prefs) {
  for (const row of P.preferencesToEntries(prefs, scope, scopeId)) {
    await M.putMemoryEntry(env, access, { ...row, source: 'user' });
  }
}

const read = (env, access, projectId, orgIds) =>
  P.personalisationForProject(env, access, { projectId, orgIds: orgIds ?? [] }, 'fence');

/* ------------------------------------------------- 1. remembered, and remembered per project --- */

test('AN ANSWER IS REMEMBERED FOR THE PROJECT IT WAS GIVEN IN — it survives the next read', async () => {
  // "Survives a reload" means the next run reads it back out of the store, not out of a component's
  // state. This is that read, through the same function the agent and the panel both use.
  const { env, access, close } = await db();
  try {
    await writePrefs(env, access, 'project', A, { asset_sources: pol('remember', ['from_scratch']) });

    const p = await read(env, access, A);
    assert.deepEqual(p.prefs.asset_sources, pol('remember', ['from_scratch']), 'the answer did not come back');
    assert.equal(p.sources.asset_sources, 'project', 'and the project layer is what decided it');
  } finally {
    close();
  }
});

test('AND IT IS NOT REMEMBERED FOR EVERY OTHER PROJECT — B still owes the question', async () => {
  // The bug this replaces: the dialog wrote the `user` scope, so answering in A silently settled B
  // too. A game built from scratch and a game assembled from the Creator Store are the same person
  // making two different decisions.
  const { env, raw, access, close } = await db();
  try {
    await writePrefs(env, access, 'project', A, { asset_sources: pol('remember', ['creator_store']) });

    // The row really is in the table — so B's empty answer below is isolation, not an empty store.
    assert.equal(
      countRows(raw, `select count(*) from memory_entries where scope='project' and scope_id=?`, A),
      1,
      "A's answer was never stored, so B proves nothing",
    );

    const b = await read(env, access, B);
    assert.equal(b.prefs.asset_sources, undefined, "B inherited A's answer");
  } finally {
    close();
  }
});

/* ---------------------------------------------------------------------------- 2. the ceiling --- */

test('THE CEILING IS THE LAYERS ABOVE THE PROJECT, AND EXCLUDES THE PROJECT ITSELF', async () => {
  // The assertion that matters. A ceiling computed from all three layers would equal the resolved
  // policy, which is the project authorising its own limit — and every narrowing assertion in
  // asset-source-policy.test.mjs would still be green.
  const { env, access, close } = await db();
  try {
    await writePrefs(env, access, 'user', USER, { asset_sources: pol('remember', ['apple_library', 'creator_store']) });
    await writePrefs(env, access, 'project', A, { asset_sources: pol('remember', ['apple_library']) });

    const p = await read(env, access, A);
    assert.deepEqual(
      p.assetSourceCeiling?.allow,
      ['apple_library', 'creator_store'],
      'the ceiling must be what the ACCOUNT allows, not what the project narrowed it to',
    );
    assert.deepEqual(p.prefs.asset_sources?.allow, ['apple_library'], 'and the resolved policy is still the narrowed one');
    assert.notDeepEqual(
      p.assetSourceCeiling?.allow,
      p.prefs.asset_sources?.allow,
      'ceiling and resolved policy are the same value, so the project layer leaked into the ceiling',
    );
  } finally {
    close();
  }
});

test('an organisation narrows the ceiling, so a project is never offered what its org forbids', async () => {
  const { env, access, close } = await db();
  try {
    const orgAccess = { ...access, orgs: [{ orgId: ORG, role: 'owner' }] };
    await writePrefs(env, orgAccess, 'org', ORG, { asset_sources: pol('remember', ['apple_library']) });
    await writePrefs(env, orgAccess, 'user', USER, { asset_sources: pol('remember', ['apple_library', 'creator_store']) });

    const p = await read(env, orgAccess, A, [ORG]);
    assert.deepEqual(
      p.assetSourceCeiling?.allow,
      ['apple_library'],
      'the org allows one source; the ceiling must not offer the two the account wanted',
    );
  } finally {
    close();
  }
});

test('NO CEILING WHEN NOBODY ABOVE HAS AN OPINION — absent is not "nothing is allowed"', async () => {
  // The ordinary case, and the one where getting the default backwards would be worst: a ceiling
  // of `{allow: []}` here would grey out all three boxes for every project that ever existed.
  const { env, access, close } = await db();
  try {
    await writePrefs(env, access, 'project', A, { asset_sources: pol('remember', ['from_scratch']) });

    const p = await read(env, access, A);
    assert.equal(p.assetSourceCeiling, undefined, 'a project-only answer must leave the ceiling unset');
  } finally {
    close();
  }
});

/* -------------------------------------------------------------------- 3. it reaches the wire --- */

test('the personalisation route actually sends the ceiling, or the dialog can never see it', () => {
  const start = INDEX.indexOf("app.get('/api/projects/:id/personalisation'");
  assert.notEqual(start, -1, 'the personalisation route moved or was renamed');
  const next = INDEX.indexOf('\napp.', start + 40);
  const body = INDEX.slice(start, next === -1 ? INDEX.length : next);
  assert.match(body, /assetSourceCeiling/, 'the route resolves the ceiling and then drops it');
  // `?? null` rather than omitted: "nobody above has an opinion" is an answer the browser acts on,
  // and an absent key is indistinguishable from an older worker that never sent one.
  assert.match(body, /assetSourceCeiling:\s*p\.assetSourceCeiling\s*\?\?\s*null/);
});
