# Asset Sources, Enforced Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the asset-source policy the owner asked for actually govern a build, instead of being collected by a dialog nobody reads.

**Architecture:** The policy is resolved once where the user is known — the session Durable Object — and travels on `AgentCtx` as a plain value, so the tool layer reads a field instead of doing a per-call lookup. Two tools consult it: `choose_asset_source` filters its ordered list, and `search_asset_library` refuses outright when the Apple library is not allowed. Every refusal names the setting and where to change it.

**Tech Stack:** TypeScript on Cloudflare Workers, Durable Objects, D1; `node --test` with esbuild-bundled modules; React 19 for the app.

**Spec:** The owner's 54-section backlog, §26 (asset source toggles) and §8 (custom MCP tools), plus his direct instruction: *"לפני הבנייה האתר ישאל את המשתמש בהודעת pop up אם הוא ירצה שapple תוכל להשתמש בספריית הApple נכסים ואותו הדבר לגבי נכסים מהcreator store או ליצור מאפס ויהיה ניתן לסדר זאת בהגדרות."*

## Global Constraints

- Never rename the wire literals `golem.v1`, `golem.jwt.`, `X-Golem-`, `golem_session`, `golem-ui`, `golem_original`, `golem-authored`, `@golem/`, or any D1/KV/Vectorize/DO binding or class name.
- Never `git add -A` — this checkout is shared with other agents. Add explicit paths only.
- The vocabulary (`ASSET_SOURCE_CHOICES`, `AssetSourcePolicy`, `ASSET_SOURCE_DEFAULT`) lives in `packages/shared/src/index.ts` and is re-exported by `apps/worker/src/preferences.ts`. Import from `@golem/shared`; never retype the list.
- Layering NARROWS: `narrowAssetSources` in `apps/worker/src/preferences.ts` is the only place precedence is decided. Do not re-derive it.
- A refusal is a sentence that names what to change. `'not allowed'` is a plan failure.
- Every task ends with `pnpm -C apps/worker exec tsc --noEmit -p tsconfig.json` clean and its own tests green, then a commit.
- After implementing, break the mechanism deliberately and confirm the test goes red. A test that cannot fail is not done.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `apps/worker/src/tools.ts` (modify) | `AgentCtx` gains `assetSources`; `choose_asset_source` and `search_asset_library` consult it |
| `apps/worker/src/asset-policy.ts` (create) | The pure decision: given a policy and a need, which sources are allowed and what the refusal says. No I/O, so it is testable without a DO. |
| `apps/worker/src/do/session.ts` (modify) | Resolve the policy once per run and put it on the ctx |
| `apps/worker/tests/asset-policy.test.mjs` (create) | The decision's own tests |
| `apps/worker/tests/asset-policy-wiring.test.mjs` (create) | That the tools actually consult it, and the DO actually supplies it |
| `apps/web/src/routes/settings.tsx` (modify) | The settings row, so "configurable in settings" is true |

---

### Task 1: The decision, as a pure function

**Files:**
- Create: `apps/worker/src/asset-policy.ts`
- Test: `apps/worker/tests/asset-policy.test.mjs`

**Interfaces:**
- Consumes: `AssetSourcePolicy`, `ASSET_SOURCE_DEFAULT` from `@golem/shared`; `AssetSource` from `./assets`.
- Produces: `allowedSources(policy): AssetSource[]`, `sourceRefusal(policy, source): string | null`, `POLICY_TO_SOURCE: Readonly<Record<AssetSourceChoice, AssetSource[]>>`.

- [ ] **Step 1: Write the failing test**

Create `apps/worker/tests/asset-policy.test.mjs`:

```javascript
// Which asset sources a build may actually use.
//
// The dialog collects an answer. Until something READS it, the answer is a row in a table and the
// build does whatever it would have done anyway — which is the exact shape of failure this
// repository keeps naming: a control that appears to work and governs nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'assetpolicy-')), 'p.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'asset-policy.ts'), '--bundle', '--format=esm', '--target=es2022',
   '--platform=neutral', '--main-fields=main,module', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const P = await import(`file://${out}`);

const policy = (allow) => ({ mode: 'remember', allow });

test('each choice maps to the engine sources it actually authorises', () => {
  assert.deepEqual(P.POLICY_TO_SOURCE.apple_library, ['library']);
  assert.deepEqual(P.POLICY_TO_SOURCE.creator_store, ['creator_store']);
  // `from_scratch` covers three engine sources, and the reason is worth stating: building out of
  // parts, generating geometry in the customer's own session, and using Studio's own built-ins are
  // all "nothing came from anywhere else" to the person who ticked the box.
  assert.deepEqual(P.POLICY_TO_SOURCE.from_scratch, ['procedural', 'generation_service', 'terrain', 'builtin']);
});

test('NO POLICY ALLOWS NOTHING — never everything', () => {
  // The dangerous default. An absent policy means nobody has answered, and answering for them by
  // allowing every source is how 510,979 third-party assets end up in a game whose owner was
  // never asked.
  assert.deepEqual(P.allowedSources(null), []);
  assert.deepEqual(P.allowedSources(undefined), []);
  assert.deepEqual(P.allowedSources(policy([])), []);
});

test('an allowed choice yields its sources, and nothing else', () => {
  assert.deepEqual(P.allowedSources(policy(['apple_library'])), ['library']);
  const both = P.allowedSources(policy(['apple_library', 'creator_store']));
  assert.deepEqual(both.sort(), ['creator_store', 'library']);
  assert.equal(both.includes('procedural'), false, 'from_scratch was not chosen');
});

test('A REFUSAL NAMES THE SETTING AND WHERE TO CHANGE IT', () => {
  // "not allowed" tells a model to give up and a person nothing. The sentence has to say which
  // switch is off and where the switch is, because the reader is an agent that will otherwise
  // report a capability gap that is really a preference.
  const r = P.sourceRefusal(policy(['from_scratch']), 'library');
  assert.ok(r, 'a disallowed source must be refused');
  assert.match(r, /Apple library/i, 'it must name the source in the words the dialog used');
  assert.match(r, /Settings/i, 'and where to change it');
  assert.match(r, /from scratch|parts/i, 'and what IS allowed, so the agent can carry on');
});

test('an allowed source is not refused', () => {
  assert.equal(P.sourceRefusal(policy(['apple_library']), 'library'), null);
  assert.equal(P.sourceRefusal(policy(['creator_store']), 'creator_store'), null);
});

test('with nothing answered, the refusal says so rather than blaming a setting', () => {
  // Never answered and deliberately turned off are different facts, and the fix differs: one
  // person needs to answer a dialog, the other to change their mind.
  const r = P.sourceRefusal(null, 'library');
  assert.match(r, /has not chosen|not been asked|no asset sources/i);
  assert.equal(/turned off|disabled/i.test(r), false, 'nobody turned anything off');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test apps/worker/tests/asset-policy.test.mjs`
Expected: FAIL — esbuild cannot resolve `src/asset-policy.ts`.

- [ ] **Step 3: Write the implementation**

Create `apps/worker/src/asset-policy.ts`:

```typescript
// Which asset sources a build may actually use.
//
// The dialog in the web app collects an answer and stores it. This is the half that makes the
// answer matter: until something READS it, the preference is a row in a table and the build does
// whatever it would have done anyway — a control that appears to work and governs nothing.
//
// PURE ON PURPOSE. No env, no D1, no DO. The policy is resolved once where the user is known and
// handed here as a value, which is what lets the decision be tested without standing up a Durable
// Object — and what stops a per-call lookup appearing in the hot path of every tool.
import { ASSET_SOURCE_CHOICES, type AssetSourceChoice, type AssetSourcePolicy } from '@golem/shared';
import type { AssetSource } from './assets';

/**
 * What each choice in the dialog authorises, in the engine's own vocabulary.
 *
 * `from_scratch` covers four engine sources rather than one, and the reason is worth stating:
 * building out of parts, generating geometry in the customer's own Studio session, sculpting
 * terrain and using Studio's built-ins are all "nothing came from anywhere else" to the person who
 * ticked that box. Splitting them in the dialog would ask somebody to have an opinion about an
 * implementation detail.
 */
export const POLICY_TO_SOURCE: Readonly<Record<AssetSourceChoice, readonly AssetSource[]>> = {
  apple_library: ['library'],
  creator_store: ['creator_store'],
  from_scratch: ['procedural', 'generation_service', 'terrain', 'builtin'],
};

/** Human wording, matched to the dialog so a refusal and the control read as the same thing. */
const CHOICE_NAME: Readonly<Record<AssetSourceChoice, string>> = {
  apple_library: 'the Apple library',
  creator_store: 'the Roblox Creator Store',
  from_scratch: 'building from scratch out of parts',
};

/** The choice an engine source belongs to, or null when nothing governs it. */
export function choiceFor(source: AssetSource): AssetSourceChoice | null {
  for (const choice of ASSET_SOURCE_CHOICES) {
    if ((POLICY_TO_SOURCE[choice] as readonly string[]).includes(source)) return choice;
  }
  return null;
}

/**
 * The engine sources this policy permits.
 *
 * AN ABSENT POLICY ALLOWS NOTHING. Answering for somebody by allowing everything is how half a
 * million third-party assets end up in a game whose owner was never asked — and the owner of this
 * product was, in fact, not asked before 299 assets went into his Roblox account.
 */
export function allowedSources(policy: AssetSourcePolicy | null | undefined): AssetSource[] {
  if (!policy || !Array.isArray(policy.allow)) return [];
  const out: AssetSource[] = [];
  for (const choice of policy.allow) {
    for (const source of POLICY_TO_SOURCE[choice] ?? []) if (!out.includes(source)) out.push(source);
  }
  return out;
}

/**
 * Why this source may not be used, or null when it may.
 *
 * The sentence names the switch AND what is still available, because the reader is an agent: told
 * only "not allowed", it reports a capability gap that is really a preference, and the person
 * reading the transcript concludes the product cannot do something it can.
 */
export function sourceRefusal(
  policy: AssetSourcePolicy | null | undefined,
  source: AssetSource,
): string | null {
  const allowed = allowedSources(policy);
  if (allowed.includes(source)) return null;

  const choice = choiceFor(source);
  const name = choice ? CHOICE_NAME[choice] : source;

  // NEVER ANSWERED and DELIBERATELY TURNED OFF are different facts with different fixes: one
  // person needs to answer a dialog, the other needs to change their mind.
  if (!policy || policy.allow.length === 0) {
    return `nobody has chosen which asset sources this project may use yet, so ${name} is not `
      + 'available. Apple asks before the first build, and the answer is kept in Settings under '
      + 'Connections. Build from parts for now, or ask the person to pick their sources.';
  }

  const rest = allowed.length
    ? `What IS allowed here: ${[...new Set(allowed.map((s) => CHOICE_NAME[choiceFor(s) ?? 'from_scratch']))].join(', ')}.`
    : 'Nothing else is allowed either.';
  return `${name} is switched off for this project, so it cannot be used. It can be turned back `
    + `on in Settings under Connections. ${rest}`;
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test apps/worker/tests/asset-policy.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Typecheck**

Run: `pnpm -C apps/worker exec tsc --noEmit -p tsconfig.json`
Expected: no output.

- [ ] **Step 6: Falsify**

Change `allowedSources` to `if (!policy) return ['library', 'creator_store'];` and re-run.
Expected: the "NO POLICY ALLOWS NOTHING" test goes red. Restore.

- [ ] **Step 7: Commit**

```bash
git add apps/worker/src/asset-policy.ts apps/worker/tests/asset-policy.test.mjs
git commit -m "the asset-source policy, as a decision something can read"
```

---

### Task 2: The tools consult it

**Files:**
- Modify: `apps/worker/src/tools.ts` — `AgentCtx` interface, `choose_asset_source`, `search_asset_library`
- Test: `apps/worker/tests/asset-policy-wiring.test.mjs`

**Interfaces:**
- Consumes: `allowedSources`, `sourceRefusal` from `./asset-policy` (Task 1).
- Produces: `AgentCtx.assetSources?: AssetSourcePolicy` — Task 3 sets it.

- [ ] **Step 1: Write the failing test**

Create `apps/worker/tests/asset-policy-wiring.test.mjs`:

```javascript
// The policy is READ, not merely stored.
//
// A preference nothing consults is the most convincing kind of broken feature: the dialog appears,
// the row is written, the settings page renders the answer back, and the build ignores all of it.
// These assertions are on the SOURCE, because what matters is that the call site exists at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const tools = readFileSync(join(WORKER, 'src', 'tools.ts'), 'utf8');
const session = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');

test('AgentCtx carries the policy, so a tool reads a value rather than querying per call', () => {
  const iface = tools.slice(tools.indexOf('export interface AgentCtx'), tools.indexOf('}', tools.indexOf('export interface AgentCtx')));
  assert.match(iface, /assetSources\?: AssetSourcePolicy/);
});

test('choose_asset_source NARROWS its list to what the policy allows', () => {
  const body = tools.slice(tools.indexOf('  choose_asset_source: {'), tools.indexOf('  search_asset_library: {'));
  assert.match(body, /allowedSources\(/, 'it must consult the policy');
  assert.equal(/run: async \(_ctx/.test(body), false, 'it must stop discarding its context');
});

test('SEARCHING A FORBIDDEN LIBRARY IS REFUSED BEFORE THE QUERY RUNS', () => {
  // Searching and then filtering would still spend a D1 query, and worse, would let an empty
  // result read as "the library has nothing like that" — a claim about a table the caller was
  // never allowed to look in.
  const body = tools.slice(tools.indexOf('  search_asset_library: {'), tools.indexOf('  find_verified_asset: {'));
  const refusal = body.indexOf('sourceRefusal(');
  const search = body.indexOf('searchAssetLibrary(');
  assert.ok(refusal !== -1, 'it must consult the policy');
  assert.ok(refusal < search, 'and refuse BEFORE querying');
});

test('the session hands the policy to every step, not to the first one', () => {
  // agentCtx() is rebuilt every step. A policy resolved once into a local would be present on step
  // one and undefined on step two, which is the same bug discoveredAssetIds already had here.
  assert.match(session, /assetSources/, 'the DO must supply it');
  const ctxFn = session.slice(session.indexOf('private agentCtx('), session.indexOf('private agentCtx(') + 1800);
  assert.match(ctxFn, /assetSources/, 'and it must be inside agentCtx(), which every step rebuilds');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test apps/worker/tests/asset-policy-wiring.test.mjs`
Expected: FAIL on all four — none of these call sites exists yet.

- [ ] **Step 3: Add the field to `AgentCtx`**

In `apps/worker/src/tools.ts`, inside `export interface AgentCtx`, after `projectId?: string;`:

```typescript
  /**
   * Which asset sources this build may use, already layered across org, user and project.
   *
   * Resolved ONCE in the session DO, where the user is known, and carried as a value so a tool
   * reads a field instead of querying per call. Optional because the eval harness and the admin
   * /run-tool route build an AgentCtx directly — and `allowedSources(undefined)` is `[]`, so those
   * callers get the safe answer rather than a permissive one.
   */
  assetSources?: AssetSourcePolicy;
```

Add to the imports at the top of `tools.ts`:

```typescript
import type { AssetSourcePolicy } from '@golem/shared';
import { allowedSources, sourceRefusal } from './asset-policy';
```

- [ ] **Step 4: Make `choose_asset_source` narrow its answer**

Replace its `run` with:

```typescript
    run: async (ctx, a) => {
      const need = String(a.need ?? 'prop') as AssetNeed;
      const chosen = chooseAssetSource(need);
      const allowed = allowedSources(ctx.assetSources);
      // The ordered list is the product's own recommendation; the policy is the customer's
      // permission. Returning the full list and letting the model pick a forbidden entry would
      // mean discovering the refusal one tool call later, with a plan already built around it.
      const usable = chosen.filter((c) => allowed.includes(c.source));
      if (usable.length) return usable;
      return {
        error: sourceRefusal(ctx.assetSources, chosen[0]?.source ?? 'library')
          ?? 'no asset source is available for this need',
        // The unusable list is returned too: a model told only "no" cannot explain to the person
        // what it would have done, and that explanation is what makes the setting make sense.
        wouldHaveUsed: chosen.map((c) => c.source),
      };
    },
```

- [ ] **Step 5: Make `search_asset_library` refuse first**

As the first statement inside its `run`:

```typescript
      const refused = sourceRefusal(ctx.assetSources, 'library');
      // BEFORE the query, not after. Filtering afterwards spends a D1 read, and an empty result
      // would read as "the curated library has nothing like that" — a claim about a table this
      // caller was never allowed to look in.
      if (refused) return { error: refused };
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `node --test apps/worker/tests/asset-policy-wiring.test.mjs && pnpm -C apps/worker exec tsc --noEmit -p tsconfig.json`
Expected: the first three pass; the fourth still fails until Task 3.

- [ ] **Step 7: Commit**

```bash
git add apps/worker/src/tools.ts apps/worker/tests/asset-policy-wiring.test.mjs
git commit -m "the tools read the asset-source policy instead of ignoring it"
```

---

### Task 3: The session supplies it

**Files:**
- Modify: `apps/worker/src/do/session.ts` — resolve the policy, put it on `agentCtx()`

**Interfaces:**
- Consumes: `AgentCtx.assetSources` (Task 2); `mergePreferences` from `../preferences`.
- Produces: nothing new — this closes the chain.

- [ ] **Step 1: Run Task 2's fourth test to see it fail**

Run: `node --test apps/worker/tests/asset-policy-wiring.test.mjs --test-name-pattern "hands the policy"`
Expected: FAIL — `session.ts` does not mention `assetSources`.

- [ ] **Step 2: Resolve the policy on the instance**

In `apps/worker/src/do/session.ts`, beside `private boundProjectId: string | null = null;`:

```typescript
  /**
   * The asset sources this project's owner has allowed, resolved across org, user and project.
   *
   * Cached on the instance rather than re-read per step: a run takes minutes and this changes when
   * somebody opens a settings page, so a per-step read would be a D1 query per tool call to
   * observe a value that almost never moves. It is refreshed wherever the project binding is, so a
   * DO revived after eviction does not carry on with a policy from before the restart.
   */
  private assetSources: AssetSourcePolicy | null = null;
```

- [ ] **Step 3: Load it where the binding is read**

Immediately after `if (bound) this.boundProjectId = bound.projectId;`:

```typescript
      if (bound) this.assetSources = await this.loadAssetSources(bound.projectId);
```

And add the loader:

```typescript
  /**
   * Layered org, user and project preferences, resolved by the SAME function the settings panel
   * uses. Re-deriving the precedence here would be a second implementation of it, and the two
   * would disagree the first time somebody set a policy at the org layer.
   */
  private async loadAssetSources(projectId: string): Promise<AssetSourcePolicy | null> {
    try {
      const layers = await readPreferenceLayers(this.env, projectId);
      return mergePreferences(layers).prefs.asset_sources ?? null;
    } catch {
      // A failure to READ the policy is not permission to ignore it. null means "nobody has
      // chosen", which allowedSources() turns into an empty list — the safe answer — and the
      // refusal sentence then tells the person to pick their sources.
      return null;
    }
  }
```

- [ ] **Step 4: Put it on the per-step context**

Inside `private agentCtx()`, in the returned object:

```typescript
      assetSources: this.assetSources ?? undefined,
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `node --test apps/worker/tests/asset-policy-wiring.test.mjs && pnpm -C apps/worker exec tsc --noEmit -p tsconfig.json`
Expected: all four pass, no TS output. If `readPreferenceLayers` does not exist under that name, find the function the `/api/memory/:scope/:scopeId/preferences` route uses and call that — do not write a second reader.

- [ ] **Step 6: Falsify**

Move the `assetSources` line out of `agentCtx()` into the constructor and re-run.
Expected: the "hands the policy to every step" test goes red. Restore.

- [ ] **Step 7: Full worker suite, then commit**

```bash
node --test apps/worker/tests/*.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)"
git add apps/worker/src/do/session.ts
git commit -m "the session resolves the policy once and carries it into every step"
```

---

### Task 4: "Configurable in settings" becomes true

**Files:**
- Modify: `apps/web/src/routes/settings.tsx` — a Connections row
- Modify: `apps/web/src/lib/settings-search.ts` — register it so search finds it
- Test: `apps/web/tests/asset-sources.test.mjs` (extend the existing file)

**Interfaces:**
- Consumes: `summarise`, `SOURCE_EXPLANATIONS` from `../lib/asset-sources`; `AssetSourceDialog` from `../components/asset-source-dialog`.
- Produces: nothing — this is the last link.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/tests/asset-sources.test.mjs`:

```javascript
test('THE SETTINGS ROW EXISTS, because "configurable in settings" was the promise', () => {
  const settings = readFileSync(join(WEB, 'src', 'routes', 'settings.tsx'), 'utf8');
  assert.match(settings, /data-setting="asset-sources"|id="asset-sources"/, 'the row must be addressable');
  assert.match(settings, /AssetSourceDialog/, 'and it must open the same dialog the build does');
  assert.match(settings, /summarise\(/, 'and state the current answer rather than a blank form');
});

test('and settings search can find it by the words a person would use', () => {
  const reg = readFileSync(join(WEB, 'src', 'lib', 'settings-search.ts'), 'utf8');
  const entry = reg.slice(reg.indexOf("id: 'asset-sources'"), reg.indexOf("id: 'asset-sources'") + 400);
  assert.ok(entry.length > 20, 'asset-sources must be in the registry');
  for (const word of ['assets', 'library', 'creator store']) {
    assert.ok(entry.toLowerCase().includes(word), `search must match "${word}"`);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test apps/web/tests/asset-sources.test.mjs`
Expected: FAIL — neither the row nor the registry entry exists.

- [ ] **Step 3: Add the registry entry**

In `apps/web/src/lib/settings-search.ts`, before the `training-opt-in` entry:

```typescript
  {
    id: 'asset-sources',
    title: 'Where Apple gets assets',
    section: 'Connections',
    keywords: ['assets', 'library', 'creator store', 'sources', 'from scratch', 'models', 'textures'],
  },
```

- [ ] **Step 4: Add the row**

In `apps/web/src/routes/settings.tsx`, inside the existing `Connections` Section, after the `roblox-key` Row:

```tsx
        <Row id="asset-sources" visible={shows('asset-sources')}>
          <h3 className="settings-sub">Where Apple gets assets</h3>
          <p className="settings-current">{summarise(sourcePolicy).line}</p>
          <button type="button" className="btn" onClick={() => setEditingSources(true)}>
            {summarise(sourcePolicy).empty ? 'Choose sources' : 'Change'}
          </button>
          {editingSources && (
            <AssetSourceDialog
              policy={sourcePolicy}
              onSave={saveSources}
              onDone={() => setEditingSources(false)}
              onCancel={() => setEditingSources(false)}
            />
          )}
        </Row>
```

With, alongside the page's other state:

```tsx
  const [editingSources, setEditingSources] = useState(false);
  const personal = useQuery({
    queryKey: ['personalisation', 'user'],
    queryFn: () => fetchPersonalisation(''),
    enabled: userId.length > 0,
  });
  const sourcePolicy = personal.data?.preferences.asset_sources ?? null;
  const saveSources = async (policy: AssetSourcePolicy) => {
    await savePreferences('user', userId, { asset_sources: policy });
    await qc.invalidateQueries({ queryKey: ['personalisation', 'user'] });
  };
```

Add the imports:

```tsx
import type { AssetSourcePolicy } from '@golem/shared';
import { summarise } from '../lib/asset-sources';
import { AssetSourceDialog } from '../components/asset-source-dialog';
import { fetchPersonalisation, savePreferences } from '../lib/api';
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `node --test apps/web/tests/asset-sources.test.mjs && pnpm -C apps/web exec tsc --noEmit -p tsconfig.json`
Expected: PASS, no TS output. If `fetchPersonalisation` requires a project id, pass the empty string and confirm the worker route tolerates it; if it does not, use the user-scope memory endpoint instead.

- [ ] **Step 6: Whole web suite**

Run: `pnpm -C apps/web test 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: 0 failing.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/routes/settings.tsx apps/web/src/lib/settings-search.ts apps/web/tests/asset-sources.test.mjs
git commit -m "the settings row, so the policy can be changed after the first answer"
```

---

## Self-Review

**Spec coverage.** §26's toggles: internal library, Creator Store and generated/procedural are covered by the three choices; per-project preference is covered by the narrowing already in `preferences.ts`; per-search override is NOT covered and is deliberately out of scope — a per-search override with no per-search UI would be a setting nothing can set.

**Placeholders.** None. Two steps carry an explicit fallback instruction (`readPreferenceLayers` may be named differently; `fetchPersonalisation` may need a project id) because those are facts the implementer must read off the repository rather than guesses the plan should make for them.

**Type consistency.** `AssetSourcePolicy` is imported from `@golem/shared` in all four tasks. `allowedSources` and `sourceRefusal` keep the same signatures in Task 1's definition and Tasks 2's use. `summarise` returns `{ line, empty }` in both the library and Task 4's use.

---

## The other seven subsystems, in order

This plan is one subsystem. The rest of the 54-section backlog decomposes as follows, each needing its own spec and plan:

1. **Genre UI kits** (§41–43) — 40 named kits over a native Roblox component library. The largest, and the one the asset library was built to feed.
2. **Game system library** (§39–40) — 36 reusable systems and the framework they install into.
3. **Website 3D creation** (§33–36) — the generation workspace, Cube, Meshy, and mesh processing.
4. **More asset connectors** (§27–32) — Sketchfab, Poly Haven, Fab, and the provider adapter interface they share.
5. **MCP platform** (§6–8) — the connection gateway and the twenty custom tools.
6. **Knowledge and retrieval** (§11–14) — sources, freshness, and the project-understanding index.
7. **Training** (§15–21) — data rights, curriculum, the owned model, and promotion gates.

Audio, VFX and the Discord bot fall inside (1) and (3) rather than standing alone.
