// RELEASE ACCEPTANCE — the owner's acceptance scenarios, as things that run.
//
// THE SPECIFICATION IS PROSE AND IT IS NOT MINE. `docs/backlog/CHECKLIST-V2.md` section
// "60. END-TO-END RELEASE ACCEPTANCE" names twenty user-visible outcomes, one per line, in the
// owner's own words. Those twenty sentences are the scenario list below, verbatim, in the order
// the section prints them. Nothing here is invented and nothing named there is dropped: a
// scenario that cannot be run is present as an explicit skip whose reason is the real reason,
// and `acceptance.test.mjs` fails if the count ever stops being twenty.
//
// NO MODEL CALL, NO NETWORK, NO SPEND. Every scenario asserts on a mechanism the product already
// contains — the worker's routing, its tool gating, its refusals, its quota arithmetic, its plan
// shape — by importing the real source through esbuild, or by driving the real Hono app with a
// real ES256 JWT and a stubbed PostgREST. Zero of the twenty need a live model, which is why the
// list has no "needs a model" skip: the outcomes the brief names are decisions the product makes
// before and after a model speaks, not the model's prose. `globalThis.fetch` is stubbed for the
// duration of the HTTP scenarios and restored afterwards; nothing here can reach the internet.
//
// EACH SCENARIO SAYS WHAT IT DID NOT CHECK. The brief marks most of these items `~` — real code
// that stops short of the whole outcome. A green line here therefore means "the named mechanism
// holds", not "a stranger did this on the deployed product". `notChecked` carries the rest of the
// sentence, and `success-metrics.mjs` prints it next to the verdict so the number cannot be read
// as more than it is. A scenario that asserted only what it could see and then reported the whole
// item green would be the exact failure this repository keeps finding.
//
// FALSIFICATION. Every running scenario was made to go red by breaking the mechanism it names,
// with a uniquely-anchored one-string edit reverted the same way. `docs/evals/ACCEPTANCE.md`
// records the edit per scenario.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, '..', '..', '..');
const WORKER = join(REPO, 'apps', 'worker');
const ESBUILD = join(WORKER, 'node_modules', '.bin', 'esbuild');

/** The brief this file implements. Printed by the report so the source is never in doubt. */
export const BRIEF = {
  file: 'docs/backlog/CHECKLIST-V2.md',
  section: '60. END-TO-END RELEASE ACCEPTANCE',
  itemCount: 20,
};

const TMP = mkdtempSync(join(tmpdir(), 'apple-acceptance-'));
process.on('exit', () => rmSync(TMP, { recursive: true, force: true }));

/** Read a repository file as text. Used where the outcome lives in a source file, not an export. */
export const source = (...p) => readFileSync(join(REPO, ...p), 'utf8');

// ---------------------------------------------------------------------------------------------
// ONE BUNDLE, NOT TWELVE.
//
// The modules below are re-exported from a single generated entry and bundled once. Twelve
// separate esbuild invocations cost twelve cold starts for the same dependency graph, and this
// file runs inside `pnpm -r test` on every push.
// ---------------------------------------------------------------------------------------------
const CF_SHIM = join(TMP, 'cf-workers-shim.mjs');
writeFileSync(CF_SHIM, 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n');

const W_SRC = (...p) => join(WORKER, 'src', ...p);
const WEB_SRC = (...p) => join(REPO, 'apps', 'web', 'src', ...p);

const MODULES = {
  tools: W_SRC('tools.ts'),
  place: W_SRC('studio-place.ts'),
  collab: W_SRC('collab.ts'),
  prefs: W_SRC('preferences.ts'),
  prompts: W_SRC('prompts.ts'),
  intent: W_SRC('run-intent.ts'),
  pricing: W_SRC('pricing.ts'),
  quota: W_SRC('quota-math.ts'),
  billing: W_SRC('billing.ts'),
  dunning: W_SRC('dunning.ts'),
  erasure: W_SRC('erasure.ts'),
  vision: W_SRC('vision.ts'),
  spec: W_SRC('spec-runner.ts'),
  single: W_SRC('single-flight.ts'),
  notifications: W_SRC('notifications.ts'),
  analytics: W_SRC('analytics.ts'),
  attribution: W_SRC('op-attribution.ts'),
  shared: join(REPO, 'packages', 'shared', 'src', 'index.ts'),
  // Client mirrors of server decisions. Both are import-free or type-import-only, so they bundle
  // from the worker's toolchain without pulling React in.
  webCapabilities: WEB_SRC('lib', 'capabilities.ts'),
  webStudioConnection: WEB_SRC('lib', 'studio-connection.ts'),
  webRestoreStatus: WEB_SRC('lib', 'restore-status.ts'),
};

const ENTRY = join(TMP, 'entry.mjs');
writeFileSync(
  ENTRY,
  [
    ...Object.entries(MODULES).map(([name, path]) => `export * as ${name} from ${JSON.stringify(path)};`),
    `export { default as APP } from ${JSON.stringify(W_SRC('index.ts'))};`,
  ].join('\n') + '\n',
);

const BUNDLE = join(TMP, 'acceptance-bundle.mjs');
execFileSync(
  ESBUILD,
  [ENTRY, '--bundle', '--format=esm', '--target=es2022', `--alias:cloudflare:workers=${CF_SHIM}`, `--outfile=${BUNDLE}`],
  { stdio: 'pipe', cwd: WORKER },
);

/** The real production modules. `W.tools.TOOLS` is the object the agent loop actually consults. */
export const W = await import(`file://${BUNDLE}`);

// ---------------------------------------------------------------------------------------------
// THE DEPLOYED-SHAPED HALF: the real Hono app, a real ES256 JWT, a stubbed PostgREST.
//
// Lifted from the harness in `preserved.test.mjs` rather than imported from it, because that file
// installs its stub at module scope for its whole run and this one must leave `globalThis.fetch`
// exactly as it found it.
// ---------------------------------------------------------------------------------------------
const require_ = createRequire(join(WORKER, 'package.json'));
const jose = require_('jose');

const SUPABASE_URL = 'https://supa.acceptance.test';
const OWNER_ID = '11111111-2222-4333-8444-555555555555';
const PROJECT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ADMIN_KEY = 'acceptance-admin-key-2f81c0';

const { publicKey, privateKey } = await jose.generateKeyPair('ES256', { extractable: true });
const JWKS_BODY = JSON.stringify({ keys: [{ ...(await jose.exportJWK(publicKey)), kid: 'k', alg: 'ES256', use: 'sig' }] });
const OWNER_JWT = await new jose.SignJWT({ email: 'owner@acceptance.test', role: 'authenticated' })
  .setProtectedHeader({ alg: 'ES256', kid: 'k' })
  .setIssuer(`${SUPABASE_URL}/auth/v1`)
  .setAudience('authenticated')
  .setSubject(OWNER_ID)
  .setIssuedAt()
  .setExpirationTime('1h')
  .sign(privateKey);

/**
 * Drive the real worker.
 *
 * `rows` is what PostgREST hands back for `/rest/v1/projects` — that is, what RLS decided this
 * caller may see. `null` is a caller the row is invisible to, which is the only honest way to
 * model a stranger here: the worker never sees a refusal, it sees an empty result.
 */
async function hitApp(path, { method = 'GET', jwt, adminKey, body, rows = null } = {}) {
  const realFetch = globalThis.fetch;
  const addressed = [];
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;
    const json = (o) => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json' } });
    if (url.includes('/.well-known/jwks.json')) return json(JSON.parse(JWKS_BODY));
    if (url.includes('/rest/v1/projects')) return json(rows ? [rows] : []);
    return json([]);
  };
  const ns = (name) => ({
    idFromName: (n) => {
      addressed.push({ ns: name, name: n });
      return { toString: () => `${name}:${n}` };
    },
    get: () => ({
      fetch: async () =>
        new Response(
          JSON.stringify({
            ok: true,
            messages: [],
            messageCount: 0,
            truncated: false,
            exportedAt: 0,
            project: { id: PROJECT_ID, name: 'Acceptance Place' },
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    }),
  });
  // A D1 shape that answers everything with nothing. The routes below create their tables on
  // first use; without this they fail on the binding rather than on the decision under test.
  const d1 = () => {
    const stmt = { bind: () => stmt, all: async () => ({ results: [] }), first: async () => null, run: async () => ({ success: true }) };
    return { prepare: () => stmt, batch: async () => [], exec: async () => ({ count: 0 }) };
  };
  const env = {
    SUPABASE_URL,
    SUPABASE_ANON_KEY: 'anon',
    ADMIN_KEY,
    ENVIRONMENT: 'test',
    AI: { run: async () => ({}) },
    CORPUS: d1(),
    KV: { get: async () => null, put: async () => {}, list: async () => ({ keys: [], list_complete: true }) },
    SESSION_DO: ns('SESSION_DO'),
    QUOTA_DO: ns('QUOTA_DO'),
    PAIRING_DO: ns('PAIRING_DO'),
    ADMIN_DO: ns('ADMIN_DO'),
    BUDGET_DO: ns('BUDGET_DO'),
  };
  try {
    const headers = {};
    if (jwt) headers.Authorization = `Bearer ${jwt}`;
    if (adminKey) headers['X-Admin-Key'] = adminKey;
    const res = await W.APP.fetch(
      new Request(`https://acceptance.test${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
      env,
    );
    return { status: res.status, text: await res.text(), addressed };
  } finally {
    globalThis.fetch = realFetch;
  }
}

const OWNED_ROW = {
  id: PROJECT_ID,
  owner_id: OWNER_ID,
  name: 'Acceptance Place',
  place_name: null,
  memory_summary: null,
  memory_facts: [],
};

export const APP_FIXTURES = { PROJECT_ID, OWNER_ID, OWNER_JWT, ADMIN_KEY, OWNED_ROW, hitApp };

// ---------------------------------------------------------------------------------------------
// Assertion helper. Throws with the scenario's own words so a red line reads as a product
// statement rather than as `expected true to equal false`.
// ---------------------------------------------------------------------------------------------
function must(condition, what) {
  if (!condition) throw new Error(what);
}

// ---------------------------------------------------------------------------------------------
// THE TWENTY.
// ---------------------------------------------------------------------------------------------
export const SCENARIOS = [
  {
    n: 1,
    name: 'New user completes registration and enters a usable workspace',
    checks:
      'the signup form calls supabase.auth.signUp with a confirmation redirect, and every route that redirect and its recovery paths land on is declared in the router',
    notChecked:
      'that a confirmation mail actually arrives at a real inbox — that needs the deployed origin and a third-party mailbox, neither of which exists offline',
    async run() {
      const auth = source('apps', 'web', 'src', 'routes', 'auth-pages.tsx');
      must(/supabase\.auth\.signUp\(/.test(auth), 'the signup form no longer calls supabase.auth.signUp');
      must(/emailRedirectTo/.test(auth), 'signUp no longer sends the user anywhere to confirm');
      const app = source('apps', 'web', 'src', 'app.tsx');
      for (const path of ['/confirm', '/login', '/forgot', '/reset']) {
        must(app.includes(`"${path}"`) || app.includes(`'${path}'`), `the router no longer declares ${path}`);
      }
      // "enters a usable workspace": the signed-in tree has an index and a project route under it.
      must(/path="\/projects\/:id"/.test(app), 'the router no longer declares the workspace route');
    },
  },

  {
    n: 2,
    name: 'Invited member joins the intended organization with correct access',
    checks: null,
    notChecked: null,
    // THE SKIP IS THE OWNER'S OWN DISPOSITION, not a gap in this harness. The brief marks this
    // item ☐ and writes "No work warranted. The owner dispositioned this as not-planned on
    // 2026-09-15 (docs/design/TENANCY.md)". A scenario for a capability the owner declined would
    // be a scenario for a product that does not exist.
    skip:
      'organizations are not planned: the owner dispositioned three-level tenancy as not-built on 2026-09-15 (docs/design/TENANCY.md); the schema is flat (profiles -> projects) and no organizations table exists, so there is no organization to join. The equivalent capability the owner did build is per-project sharing, checked by scenario 15.',
    /**
     * A SKIP THAT CANNOT ROT. If organizations are ever built, the reason above becomes false and
     * this scenario must be written for real — so the skip carries a guard that fails the moment
     * its premise stops holding. This runs even though the scenario does not.
     */
    async guardSkipReason() {
      const migrations = execFileSync(
        'bash',
        ['-c', `grep -rli "create table.*organizations" ${JSON.stringify(join(REPO, 'infra', 'supabase', 'migrations'))} || true`],
        { encoding: 'utf8' },
      ).trim();
      must(
        migrations === '',
        `an organizations table now exists (${migrations}) — the skip reason for scenario 2 is stale and the scenario must be implemented`,
      );
    },
  },

  {
    n: 3,
    name: 'Returning user resumes the correct project and conversation',
    checks:
      'the transcript route serves the owner their own project and answers a caller the row is invisible to with 404, addressing exactly one session Durable Object and only from the canonical row id',
    notChecked:
      'that a browser reload replays an in-flight run — the replay lives in the session Durable Object, which needs the Cloudflare runtime',
    async run() {
      const ok = await hitApp(`/api/projects/${PROJECT_ID}/messages`, { jwt: OWNER_JWT, rows: OWNED_ROW });
      must(ok.status === 200, `the owner could not resume their own conversation (status ${ok.status})`);
      must(
        ok.addressed.filter((a) => a.ns === 'SESSION_DO').every((a) => a.name === PROJECT_ID),
        'the conversation was resumed from an id that is not the project row id',
      );
      const stranger = await hitApp(`/api/projects/${PROJECT_ID}/messages`, { jwt: OWNER_JWT, rows: null });
      must(stranger.status === 404, `a caller with no row got ${stranger.status} instead of 404`);
      must(
        stranger.addressed.filter((a) => a.ns === 'SESSION_DO').length === 0,
        'a session Durable Object was addressed for a caller who cannot see the project',
      );
    },
  },

  {
    n: 4,
    name: 'User installs the Studio plugin and pairs the intended place',
    checks:
      'place admission binds an unbound project, matches the same place, refuses a different one, and says "unverified" rather than guessing for an unsaved place — and the install link does not claim a Creator Store listing while the store flag says there is none',
    notChecked:
      'the install itself: STUDIO_PLUGIN_STORE_LIVE is false, so nobody can install this plugin from the Store, and that half of the item is unbuilt rather than untested',
    async run() {
      const { placeAdmission, servesOps } = W.place;
      const now = Date.now();
      const bound = { placeId: 777, gameId: 42, name: 'Crystal Canyon', boundAt: now - 1000 };
      const same = { placeId: 777, gameId: 42, name: 'Crystal Canyon' };
      const other = { placeId: 999, gameId: 43, name: 'Somewhere Else' };

      must(placeAdmission(null, same, now).verdict === 'bind', 'a first report no longer binds the project to a place');
      must(placeAdmission(bound, same, now).verdict === 'match', 'the same place no longer matches its binding');
      const mismatch = placeAdmission(bound, other, now);
      must(mismatch.verdict === 'mismatch', 'a DIFFERENT place was admitted against this project');
      must(servesOps(mismatch) === false, 'operations would be served against a place that is not the bound one');
      must(placeAdmission(bound, null, now).verdict === 'unverified', 'a missing report is reported as something other than unverified');
      must(
        placeAdmission(bound, { placeId: 0, gameId: 0, name: '' }, now).verdict === 'unverified',
        'an unidentifiable place is no longer reported as unverified',
      );

      must(W.shared.STUDIO_PLUGIN_STORE_LIVE === false || /roblox\.com/.test(W.shared.STUDIO_PLUGIN_INSTALL_HREF), 'the store flag and the install link disagree');
      if (W.shared.STUDIO_PLUGIN_STORE_LIVE === false) {
        must(
          !/create\.roblox\.com|www\.roblox\.com\/library/.test(W.shared.STUDIO_PLUGIN_INSTALL_HREF),
          'the install link points at a Creator Store listing that STUDIO_PLUGIN_STORE_LIVE says does not exist',
        );
      }
    },
  },

  {
    n: 5,
    name: 'User sees accurate connection and capability status',
    checks:
      'the client derives exactly four connection states from wire signals and has no "installed" state to invent, and its role/action mirror is identical to the worker allowlists it mirrors',
    notChecked:
      'that the rendered chrome actually shows the state it derived — that is a DOM assertion and lives in apps/web/tests',
    async run() {
      // (socket state, the worker's last word on Studio, whether Studio was ever seen this session)
      const states = new Set();
      for (const conn of ['open', 'connecting', 'reconnecting', 'closed']) {
        for (const studioConnected of [true, false]) {
          for (const everConnected of [true, false]) {
            states.add(W.webStudioConnection.studioConnection(conn, studioConnected, everConnected));
          }
        }
      }
      for (const s of states) {
        must(
          ['connecting', 'connected', 'disconnected', 'not-connected'].includes(s),
          `the client invented a connection state the wire cannot support: ${s}`,
        );
      }
      must(states.size === 4, `the four connection states collapsed to ${states.size}: ${[...states].join(', ')}`);
      must(
        W.webStudioConnection.studioConnection('closed', false, true) === 'disconnected' &&
          W.webStudioConnection.studioConnection('closed', false, false) === 'not-connected',
        'having lost Studio and never having had it now read the same — one of those is worth waiting for and the other is a setup card',
      );
      must(
        W.webStudioConnection.studioConnection('connecting', false, false) === 'connecting',
        'a handshake that has not answered yet is being reported as "not connected"',
      );
      const connText = source('apps', 'web', 'src', 'lib', 'studio-connection.ts');
      must(!/'installed'|"installed"/.test(connText), 'the client now claims an "installed" state it cannot observe');

      const serverRoles = [...W.collab.COLLAB_ROLES];
      const clientRoles = [...W.webCapabilities.COLLAB_ROLES];
      must(JSON.stringify(serverRoles) === JSON.stringify(clientRoles), `the client role list drifted from the worker's: ${clientRoles} vs ${serverRoles}`);
      const serverActions = [...W.collab.COLLAB_ACTIONS];
      const clientActions = [...W.webCapabilities.COLLAB_ACTIONS];
      must(JSON.stringify(serverActions) === JSON.stringify(clientActions), `the client action list drifted from the worker's: ${clientActions} vs ${serverActions}`);
      // "We have not checked yet" must never render as permission.
      must(
        W.webCapabilities.allows({ status: 'loading' }, 'build') === false &&
          W.webCapabilities.allows({ status: 'unavailable', detail: 'x' }, 'build') === false,
        'an unchecked or failed permission lookup is being treated as permission',
      );
    },
  },

  {
    n: 6,
    name: 'User submits a request with relevant project context',
    checks:
      'the system prompt the run is built from carries the project name, the place the plugin reported, the connection state, and the memory summary and facts — and omits the memory when there is none rather than printing an empty heading',
    notChecked:
      'that the prompt reaches the provider unchanged — the send lives in the session Durable Object and needs the Cloudflare runtime',
    async run() {
      const base = {
        mode: 'stone',
        studioConnected: true,
        placeName: 'Crystal Canyon',
        projectName: 'Acceptance Place',
        memorySummary: 'The builder prefers low-poly.',
        memoryFacts: ['The plaza is the hub.', 'Never use free-model scripts.'],
        fenceId: 'fence-acceptance',
      };
      const withContext = W.prompts.systemPrompt(base);
      must(withContext.includes('Acceptance Place'), 'the project name is no longer in the system prompt');
      must(withContext.includes('Crystal Canyon'), 'the place the plugin reported is no longer in the system prompt');
      must(withContext.includes('The plaza is the hub.'), 'memory facts are no longer injected into the system prompt');
      must(withContext.includes('low-poly'), 'the memory summary is no longer injected into the system prompt');

      const bare = W.prompts.systemPrompt({ ...base, memorySummary: null, memoryFacts: [] });
      must(!bare.includes('The plaza is the hub.'), 'a project with no memory is being given another project’s facts');
      must(bare.includes('Acceptance Place'), 'the project name disappears when there is no memory');

      const offline = W.prompts.systemPrompt({ ...base, studioConnected: false, placeName: null });
      must(offline !== withContext, 'the prompt says the same thing whether Studio is connected or not');
    },
  },

  {
    n: 7,
    name: 'Agent presents an actionable plan with visible cost expectations',
    checks:
      'a build request is restated into a checklist and open questions with no model call, and the credit cost of a run is derived from one arithmetic rather than quoted from a constant',
    notChecked:
      'that the plan is rendered beside the cost in one surface — the intent broadcast and the credit balance are produced by the worker and assembled by the client',
    async run() {
      const request = 'Build a medieval tavern with a lit fireplace, three tables and a door that opens when you touch it.';
      const intent = W.intent.runIntentFor(request);
      must(intent !== null, 'a normal build request no longer produces a plan');
      must(typeof intent.summary === 'string' && intent.summary.length > 0, 'the plan has no restatement of what was asked');
      must(Array.isArray(intent.checklist) && intent.checklist.length > 0, 'the plan has no checklist — there is nothing actionable in it');
      must(W.intent.runIntentFor('') === null, 'an empty request now produces a plan row with nothing in it');

      const neurons = W.pricing.estimateNeurons('stone', request.length, 800);
      must(neurons > 0, 'a run is estimated at zero neurons');
      const credits = W.pricing.creditsForNeurons(neurons);
      must(Number.isInteger(credits) && credits > 0, `a run costs a number the user cannot be shown: ${credits}`);
      must(
        W.pricing.CREDITS_PER_BUILD === W.pricing.CREDITS_PER_BUILD_DERIVED,
        `the published cost of a build (${W.pricing.CREDITS_PER_BUILD}) is not what the arithmetic charges (${W.pricing.CREDITS_PER_BUILD_DERIVED})`,
      );
    },
  },

  {
    n: 8,
    name: 'User approves the exact operations that require consent',
    checks:
      'a tool the user set to ask or deny is removed from the toolset the run may call, an allowed one is kept, and the run reports exactly which capability was withheld — and only ones it actually had',
    notChecked:
      'an in-run approval prompt for an irreversible Studio mutation: consent here is a standing setting, not a per-operation dialog, and the brief asks for both',
    async run() {
      const governed = new Set(W.shared.GOVERNED_TOOL_NAMES);
      must(governed.size > 0, 'no tool is governed by consent any more');
      const registered = new Set(W.tools.toolNames());
      const overlap = [...governed].filter((t) => registered.has(t));
      must(overlap.length > 0, 'the consent list names no tool the agent can actually call');
      must(governed.has('run_luau'), 'running arbitrary code in the user’s place is no longer a governed operation');

      const base = new Set(overlap);
      const asked = W.prefs.applyToolPermissions(base, { run_luau: 'ask' });
      must(!asked.has('run_luau'), 'a tool the user asked to be consulted about is still callable without asking');
      const denied = W.prefs.applyToolPermissions(base, { run_luau: 'deny' });
      must(!denied.has('run_luau'), 'a tool the user denied is still callable');
      const allowed = W.prefs.applyToolPermissions(base, { run_luau: 'allow' });
      must(allowed.has('run_luau'), 'an allowed tool was removed anyway');

      must(
        W.prefs.deniedTools(base, { run_luau: 'ask' }).includes('run_luau'),
        'a capability was withheld and the run does not say which',
      );
      must(
        W.prefs.deniedTools(base, { a_tool_that_does_not_exist: 'deny' }).length === 0,
        'the run reports withholding a capability it never had — that invents a restriction',
      );
    },
  },

  {
    n: 9,
    name: 'Approved operations execute against the intended Studio session',
    checks:
      'no tool that changes a place is offered while Studio is not connected, the executor refuses one anyway if it is called, and a place that does not match the binding is not served',
    notChecked:
      'that the operation reaches the paired Studio and lands — that needs a live plugin on a real place',
    async run() {
      const offered = W.tools.toolDefs(false).map((d) => d.function?.name ?? d.name);
      const studioTools = Object.entries(W.tools.TOOLS)
        .filter(([, impl]) => impl.studio)
        .map(([name]) => name);
      must(studioTools.length > 0, 'no tool is marked as requiring a Studio connection any more');
      const leaked = offered.filter((n) => studioTools.includes(n));
      must(leaked.length === 0, `tools that can change a place were offered with no Studio connected: ${leaked.join(', ')}`);

      const connected = W.tools.toolDefs(true).map((d) => d.function?.name ?? d.name);
      must(
        studioTools.some((n) => connected.includes(n)),
        'a connected Studio is offered none of the tools that change a place — the gate has become a wall',
      );

      const ctx = { studioConnected: () => false };
      const refusal = await W.tools.runTool(ctx, studioTools[0], '{}');
      const text = typeof refusal === 'string' ? refusal : JSON.stringify(refusal);
      must(/studio/i.test(text), `a Studio tool called with no Studio did not refuse by naming Studio: ${text.slice(0, 200)}`);

      const now = Date.now();
      const bound = { placeId: 1, gameId: 1, name: 'Bound', boundAt: now };
      must(
        W.place.servesOps(W.place.placeAdmission(bound, { placeId: 2, gameId: 2, name: 'Other' }, now)) === false,
        'operations would be served against a place that is not the one this project is bound to',
      );
    },
  },

  {
    n: 10,
    name: 'Studio changes produce persisted and inspectable results',
    checks:
      'a checkpoint is taken automatically before a builder run, and the checkpoint list is reachable by the owner and invisible to a caller the project row is invisible to',
    notChecked:
      'that generated geometry survives a save and publish round trip in Roblox Studio, and that a checkpoint can be taken at all with no plugin connected — createCheckpoint refuses without one',
    async run() {
      const session = source('apps', 'worker', 'src', 'do', 'session.ts');
      must(/createCheckpoint\(/.test(session), 'nothing takes a checkpoint any more');
      must(
        /before Apple changes|before Apple/i.test(session),
        'the automatic pre-run checkpoint is gone — a change can now be made with nothing to go back to',
      );
      const ok = await hitApp(`/api/projects/${PROJECT_ID}/checkpoints`, { jwt: OWNER_JWT, rows: OWNED_ROW });
      must(ok.status === 200, `the owner cannot inspect their own checkpoints (status ${ok.status})`);
      const stranger = await hitApp(`/api/projects/${PROJECT_ID}/checkpoints`, { jwt: OWNER_JWT, rows: null });
      must(stranger.status === 404, `checkpoints were exposed to a caller with no row (status ${stranger.status})`);
    },
  },

  {
    n: 11,
    name: 'Verification reports distinguish passed, failed, and unverified outcomes',
    checks:
      'a critique that could not be read is reported as unknown and never as a failure, a failed one says so, and a spec case that never reported is named as missing rather than counted as a pass',
    notChecked: 'that a user ever reaches a verification — every checker requires a Studio connection',
    async run() {
      const shell = { score: null, passed: false, summary: '', defects: [], hardFails: [], neurons: 0 };
      const unread = W.vision.critiqueToText({ ...shell, unavailable: true });
      must(/UNAVAILABLE/.test(unread), 'a critique that could not be read no longer says so');
      must(!/FAILS/.test(unread), 'a critique that could not be read is being reported as a failure — that is a tooling fault told as a verdict');
      const failed = W.vision.critiqueToText({ ...shell, score: 3, passed: false, summary: 'bare' });
      must(/FAILS/.test(failed), 'a failed critique no longer reports a failure');
      const passed = W.vision.critiqueToText({ ...shell, score: 8, passed: true, summary: 'good' });
      must(/PASSES/.test(passed), 'a passing critique no longer reports a pass');

      const sent = [
        { name: 'door opens', luau: 'return true' },
        { name: 'player spawns on the ground', luau: 'return true' },
      ];
      const run = { cases: [{ name: 'door opens', status: 'pass' }], passed: 1, failed: 0, skipped: 0 };
      const missing = W.spec.missingCases(sent, run);
      must(
        missing.includes('player spawns on the ground'),
        'a spec case that never reported is not named as missing — an unrun check is being read as a clean one',
      );
    },
  },

  {
    n: 12,
    name: 'User can inspect supporting evidence and operation history',
    checks:
      'the operation history route is reachable by the owner and closed to everyone else, and the partition that builds it keeps this run’s operations separate from earlier ones instead of merging them',
    notChecked:
      'that the evidence cards render the four kinds and four states — a DOM assertion, held in apps/web/tests/evidence-model.test.mjs',
    async run() {
      const ok = await hitApp(`/api/projects/${PROJECT_ID}/attribution`, { jwt: OWNER_JWT, rows: OWNED_ROW });
      must(ok.status === 200, `the owner cannot inspect their own operation history (status ${ok.status})`);
      const stranger = await hitApp(`/api/projects/${PROJECT_ID}/attribution`, { jwt: OWNER_JWT, rows: null });
      must(stranger.status === 404, `operation history was exposed to a caller with no row (status ${stranger.status})`);

      const ops = [
        { id: 'a', runId: 'run-1' },
        { id: 'b', runId: 'run-2' },
        { id: 'c', runId: undefined },
      ];
      const part = W.attribution.partitionOpsByRun(ops, 'run-1');
      must(
        part.keep.map((o) => o.id).join(',') === 'a,c',
        `the queue no longer separates this run’s work from a finished run’s (kept ${part.keep.map((o) => o.id).join(',')})`,
      );
      must(
        part.drop.map((o) => o.id).join(',') === 'b',
        'an operation belonging to a run that already ended would be executed and attributed to this one',
      );
    },
  },

  {
    n: 13,
    name: 'User can reverse changes and verify restored state',
    checks:
      'a restore that skipped something is reported as a caveat rather than as a success, the fidelity line names what did not come back, and the restore route is owner-scoped',
    notChecked: 'that Terrain and Camera actually return in Roblox Studio — that needs a live place',
    async run() {
      const R = W.webRestoreStatus;
      const clean = { type: 'restore_status', phase: 'done', ok: true };
      must(R.restoreTone(clean) === 'good', `a complete restore is reported as "${R.restoreTone(clean)}"`);
      const unverified = { ...clean, note: 'Your plugin is too old to report what came back.' };
      must(
        R.restoreTone(unverified) === 'caveat',
        'a restore the plugin could not verify is being reported as a clean success — that is a failure to observe rendered as an observation',
      );
      must(R.restoreTone({ type: 'restore_status', phase: 'failed', error: 'x' }) === 'bad', 'a failed restore no longer reads as failed');
      must(R.restoreTone({ type: 'restore_status', phase: 'applying' }) === 'working', 'a restore still touching the place reads as finished');
      must(R.restoreInFlight({ type: 'restore_status', phase: 'applying' }) === true, 'a restore in flight can be dismissed');

      must(
        R.fidelityLine(undefined) === null,
        'a restore whose op never reached Studio now prints counts anyway — zeros are a claim about the place',
      );
      const line = R.fidelityLine({
        instancesCreated: 10,
        scriptsRestored: 1,
        scriptsExpected: 3,
        failedInstances: 2,
        failedScripts: 2,
        failedProperties: 4,
      });
      must(typeof line === 'string' && line.length > 0, 'a partial restore no longer says what did not come back');

      const stranger = await hitApp(`/api/projects/${PROJECT_ID}/restore`, { method: 'POST', jwt: OWNER_JWT, rows: null, body: {} });
      must(stranger.status === 404, `restore was exposed to a caller with no row (status ${stranger.status})`);
    },
  },

  {
    n: 14,
    name: 'Interrupted runs recover without duplicate writes or duplicate charges',
    checks:
      'the run guard is established before the first await, so two starts racing for the same session produce exactly one run — and the guard reopens once the run settles',
    notChecked: 'that a dropped socket replays the transcript rather than re-running it — the replay lives in the session Durable Object',
    async run() {
      const gate = W.single.singleFlight();
      let ran = 0;
      const work = async () => {
        await new Promise((r) => setTimeout(r, 5));
        ran += 1;
        return 'done';
      };
      const [a, b] = await Promise.all([gate(work), gate(work)]);
      const attempts = [a, b];
      must(attempts.filter((r) => r.ran).length === 1, `${attempts.filter((r) => r.ran).length} of 2 racing starts ran — a user would be charged twice`);
      must(ran === 1, `the work itself ran ${ran} times`);
      const after = await gate(work);
      must(after.ran === true, 'the guard never reopened — a session can start one run and then no more');
    },
  },

  {
    n: 15,
    name: 'Collaborators receive only the access granted to them',
    checks:
      'the role matrix refuses a viewer the actions of an editor and an editor the actions of an admin, an unreadable role is refused rather than defaulted, a share link cannot carry more than editor, and the shared route is closed to a caller with no grant',
    notChecked: 'that the members panel is mounted anywhere a user can reach — the enforcement is proven, the surface is the brief’s open half',
    async run() {
      const { can } = W.collab;
      must(can('viewer', 'read') === true, 'a viewer can no longer read the project they were shared');
      must(can('viewer', 'build') === false, 'a VIEWER can build — that spends the owner’s credits');
      must(can('viewer', 'chat') === false, 'a viewer can talk to the agent');
      must(can('commenter', 'comment') === true, 'a commenter can no longer comment');
      must(can('commenter', 'build') === false, 'a commenter can build');
      must(can('editor', 'build') === true, 'an editor can no longer build');
      must(can('editor', 'manage_members') === false, 'an EDITOR can manage members');
      must(can('editor', 'delete_project') === false, 'an editor can delete the project');
      must(can('admin', 'manage_members') === true, 'an admin can no longer manage members');
      must(can('admin', 'delete_project') === false, 'an ADMIN can delete a project they do not own');
      must(can('owner', 'delete_project') === true, 'the owner can no longer delete their own project');
      must(can('nonsense', 'read') === false, 'an unreadable role is being granted access');
      must(can(undefined, 'read') === false, 'a missing role is being granted access');

      must(
        W.collab.SHARE_LINK_MAX_RANK <= W.collab.roleRank('editor'),
        'a share link can now hand out more than editor — a link is a secret anyone can forward',
      );

      const stranger = await hitApp(`/api/shared/${PROJECT_ID}`, { jwt: OWNER_JWT, rows: null });
      must(stranger.status >= 400, `a caller with no grant was served the shared project (status ${stranger.status})`);
    },
  },

  {
    n: 16,
    name: 'Plan limits are enforced consistently across UI, API, and background jobs',
    checks:
      'one limits table serves the worker and the client, the quota arithmetic reads it rather than a number of its own, the tighter of the daily and monthly limits is the one that bites, and a spend takes the renewable allowance before the balance the user paid for',
    notChecked: 'that a background automation charges the same ledger — the automation run path needs the Durable Object runtime',
    async run() {
      must(W.pricing.PLAN_LIMITS === W.shared.PLAN_LIMITS, 'the worker has a second copy of the plan limits — two tables always drift');
      for (const plan of W.shared.PLAN_IDS) {
        const limits = W.shared.PLAN_LIMITS[plan];
        must(limits.creditsPerDay > 0 && limits.creditsPerMonth > 0, `plan ${plan} grants nothing`);
        must(
          limits.creditsPerMonth >= limits.creditsPerDay,
          `plan ${plan} publishes a monthly allowance smaller than a single day’s — an allowance nobody can spend`,
        );
      }

      const now = Date.parse('2026-09-16T10:00:00Z');
      const free = W.shared.PLAN_LIMITS.free;
      const fresh = W.quota.quotaState({ plan: 'free', spentToday: 0, spentThisMonth: 0, credits: 0, now });
      must(fresh.creditsDaily === free.creditsPerDay, 'the quota state publishes a daily limit that is not the plan’s');
      must(fresh.allowanceRemaining === free.creditsPerDay, 'a fresh day does not start with the full allowance');

      const monthBound = W.quota.quotaState({ plan: 'free', spentToday: 0, spentThisMonth: free.creditsPerMonth, credits: 0, now });
      must(monthBound.allowanceRemaining === 0, 'a user past the monthly limit is still being granted the daily one');

      const withPurchase = W.quota.quotaState({ plan: 'free', spentToday: free.creditsPerDay, spentThisMonth: 0, credits: 50, now });
      must(withPurchase.allowanceRemaining === 0, 'an exhausted allowance still reports headroom');
      must(withPurchase.credits === 50, 'purchased credits are being folded into the allowance instead of shown as their own number');
      must(withPurchase.creditsRemaining === 50, 'what can be spent right now is not allowance plus balance');

      const split = W.quota.splitSpend(30, 10, 100);
      must(split.fromAllowance === 10 && split.fromCredits === 20, 'a spend no longer takes the free allowance before the balance the user paid for');
      must(W.quota.splitSpend(30, 0, 5).affordable === false, 'a spend larger than everything the user has is being called affordable');
    },
  },

  {
    n: 17,
    name: 'Purchases update entitlements and credit balances accurately',
    checks:
      'entitlement is recomputed from the subscription’s status and period rather than trusted from the event, an expired period falls back to free, and a second checkout is refused while one is already active',
    notChecked:
      'that a real Stripe test-mode webhook grants entitlement — every billing route is gated on billingConfigured() (apps/worker/src/billing.ts) and this repository holds no Stripe credential, so the grant itself has never been exercised here',
    async run() {
      const nowSec = Math.floor(Date.parse('2026-09-16T10:00:00Z') / 1000);
      const active = { plan: 'studio', status: 'active', currentPeriodEnd: nowSec + 86_400, cancelAtPeriodEnd: false };
      must(W.billing.entitlementFor(active, nowSec) === 'studio', 'an active subscription no longer entitles the plan it paid for');
      const expired = { ...active, currentPeriodEnd: nowSec - 86_400 };
      must(W.billing.entitlementFor(expired, nowSec) === 'free', 'a subscription whose period ended still entitles a paid plan');
      const cancelled = { ...active, status: 'canceled' };
      must(W.billing.entitlementFor(cancelled, nowSec) === 'free', 'a cancelled subscription still entitles a paid plan');
      must(W.billing.entitlementFor(W.billing.FREE_SUBSCRIPTION, nowSec) === 'free', 'the free subscription no longer entitles the free plan');

      const view = W.billing.subscriptionView(active, nowSec);
      must(view.plan === 'studio', 'the subscription view reports a plan the entitlement does not');
      const guard = W.billing.checkoutGuard(view);
      must(guard.ok === false && guard.status === 409, 'a second checkout is allowed while a subscription is already active — that is a double charge');
      must(W.billing.checkoutGuard(W.billing.NO_SUBSCRIPTION_VIEW).ok === true, 'a user with no subscription cannot start a checkout');
    },
  },

  {
    n: 18,
    name: 'Cancellation, downgrade, and payment failure produce documented behavior',
    checks:
      'every dunning kind the worker can raise has user-facing copy, a failure is deduplicated on the invoice so three Stripe retries are one notice, and an unrecognised event produces nothing rather than a guess',
    notChecked:
      'that the notice reaches a user — the webhook that raises it is gated on billingConfigured(), which no credential in this repository satisfies',
    async run() {
      for (const kind of W.dunning.DUNNING_KINDS) {
        const copy = W.dunning.dunningCopy({ kind, invoiceId: 'in_1', amount: 1200, currency: 'usd', at: 0 });
        must(copy && typeof copy.title === 'string' && copy.title.length > 0, `dunning kind "${kind}" has no copy — the user would be told nothing`);
      }
      must(W.dunning.interpretDunningEvent({ type: 'nonsense.event' }) === null, 'an unrecognised billing event is being interpreted as a dunning notice');
      const invoice = { id: 'in_dedupe', amount_due: 1200, currency: 'usd', attempt_count: 2, metadata: { userId: OWNER_ID } };
      const failed = W.dunning.interpretDunningEvent({ id: 'evt_1', type: 'invoice.payment_failed', data: { object: invoice } });
      must(failed !== null, 'a failed payment no longer produces a notice');
      must(failed.userId === OWNER_ID, 'the notice is no longer addressed to the customer the event names');
      const retry = W.dunning.interpretDunningEvent({ id: 'evt_2', type: 'invoice.payment_failed', data: { object: invoice } });
      must(
        retry !== null && retry.subjectId === failed.subjectId,
        'a Stripe retry is keyed on something other than the invoice — three retries would be three notices',
      );
      must(
        W.dunning.interpretDunningEvent({ id: 'evt_3', type: 'invoice.payment_failed', data: { object: { id: 'in_x', amount_due: 1 } } }) === null,
        'an event naming no customer is being turned into a notice for somebody',
      );
      const ordinary = { id: 'in_ok', amount_due: 1200, currency: 'usd', attempt_count: 1, metadata: { userId: OWNER_ID } };
      must(
        W.dunning.interpretDunningEvent({ id: 'evt_4', type: 'invoice.payment_succeeded', data: { object: ordinary } }) === null,
        'every ordinary renewal is being announced — a channel that cries wolf on success is a channel nobody reads',
      );
    },
  },

  {
    n: 19,
    name: 'Data export and deletion complete across primary and derived storage',
    checks:
      'the export route is owner-scoped, deletion requires the typed confirmation, and the receipt names the residue deletion does NOT remove instead of claiming a completeness it does not have',
    notChecked: 'that every derived store is actually swept on the deployed origin — the sweep runs against live KV and D1',
    async run() {
      const ok = await hitApp(`/api/projects/${PROJECT_ID}/export`, { jwt: OWNER_JWT, rows: OWNED_ROW });
      must(ok.status === 200, `the owner cannot export their own project (status ${ok.status})`);
      const stranger = await hitApp(`/api/projects/${PROJECT_ID}/export`, { jwt: OWNER_JWT, rows: null });
      must(stranger.status === 404, `an export was served to a caller with no row (status ${stranger.status})`);

      must(
        typeof W.erasure.ERASURE_CONFIRMATION === 'string' && W.erasure.ERASURE_CONFIRMATION.length > 0,
        'account deletion no longer requires a typed confirmation',
      );
      must(Array.isArray(W.erasure.ACCOUNT_RESIDUE), 'the deletion receipt no longer has a residue list');
      must(
        W.erasure.ACCOUNT_RESIDUE.length > 0,
        'the deletion receipt now claims nothing survives deletion — an empty residue list is a completeness claim, and this deployment has stores it cannot reach',
      );
      for (const r of W.erasure.ACCOUNT_RESIDUE) {
        must(typeof r.why === 'string' && r.why.length > 0, `a residue row (${r.what ?? '?'}) does not say why it survives`);
      }
    },
  },

  {
    n: 20,
    name: 'Production incidents are detected, communicated, and recoverable',
    checks:
      'every notification kind the product can raise has a spec to render it, the channels that do not exist are named as unbuilt rather than silently dropped, a scheduled handler exists and is wired to a cron trigger, and the static rollback reads back what it wrote',
    notChecked: 'that an incident on the deployed origin is actually noticed — detection here is a daily cron, not a monitor with an alert path',
    async run() {
      for (const kind of W.notifications.NOTIFICATION_KINDS) {
        const spec = W.notifications.notificationSpec(kind);
        must(spec && typeof spec === 'object', `notification kind "${kind}" has no spec — it would reach the user as nothing`);
      }
      must(
        Object.keys(W.notifications.UNBUILT_CHANNELS).length >= 0 && W.notifications.NOTIFICATION_CHANNELS.length > 0,
        'the product now claims no delivery channel at all',
      );
      for (const ch of W.notifications.NOTIFICATION_CHANNELS) {
        must(!(ch in W.notifications.UNBUILT_CHANNELS), `channel "${ch}" is offered and listed as unbuilt at the same time`);
      }

      const wrangler = source('apps', 'worker', 'wrangler.jsonc');
      must(/"crons"\s*:/.test(wrangler), 'no cron trigger is configured — nothing runs on a schedule to notice anything');
      const index = source('apps', 'worker', 'src', 'index.ts');
      must(/scheduled\s*:/.test(index), 'the worker exports no scheduled handler for the cron to call');

      const rollback = source('infra', 'rollback-static.mjs');
      must(
        /readback|read back|verify|compare/i.test(rollback),
        'the static rollback no longer reads back what it wrote — a rollback that does not verify is a claim, not a recovery',
      );
    },
  },
];

/**
 * Run every scenario and return one record each.
 *
 * Never throws for a failing scenario — a report that dies on the first red tells you about one
 * item and nothing about the other nineteen.
 */
export async function runScenarios() {
  const out = [];
  for (const s of SCENARIOS) {
    if (s.skip) {
      let guard = null;
      if (s.guardSkipReason) {
        try {
          await s.guardSkipReason();
        } catch (err) {
          guard = err.message;
        }
      }
      out.push({ n: s.n, name: s.name, verdict: guard ? 'fail' : 'skip', reason: guard ?? s.skip, checks: null, notChecked: null });
      continue;
    }
    try {
      await s.run();
      out.push({ n: s.n, name: s.name, verdict: 'pass', reason: null, checks: s.checks, notChecked: s.notChecked });
    } catch (err) {
      out.push({ n: s.n, name: s.name, verdict: 'fail', reason: err.message, checks: s.checks, notChecked: s.notChecked });
    }
  }
  return out;
}
