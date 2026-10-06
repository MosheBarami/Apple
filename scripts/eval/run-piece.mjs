#!/usr/bin/env node
// Capture runner for the evaluation harness (plan 4.2, handoff M3 task 3.2).
//
//   node scripts/eval/run-piece.mjs <request-id> [--milestone M3] [--project <id>] [--user <id>] [--dry-run]
//   node scripts/eval/run-piece.mjs --init-baseline [--milestone M3]
//
// One request, through the real product path (admin API -> worker -> plugin -> the open Studio place), on a
// place reset to a clean Baseplate, then captured with Roblox's own Studio MCP and saved under
// planning/proof/<milestone>/<request-id>/. The runner judges nothing: the critics (critics.workflow.js) and the
// pass rule (lib/verdict.mjs) do. README.md in this folder is the runbook.
//
// --dry-run does everything except the agent run: it resets, captures the empty Baseplate and play-tests it, so the
// harness can be proved without spending a credit. It never grants credits and never starts a run.
//
// Never printed, never written: the admin key. Never touched: anything on Roblox's servers; the place is local.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeAdminApi } from './lib/api.mjs';
import { evalConversationId, mintUserSession, runStudioRequest } from './lib/studio-agent.mjs';
import { DEFAULT_SPAWN, WORLD_CAMERAS, cameraPlan, classifyBuild, classifyConsole, consoleDelta, extractImage, fileExtension, framingFor, imageSize, playTestCounts, plannedShotNames, sizeLabel, uiShotName, UI_TARGETS } from './lib/capture-plan.mjs';
import { REPO_ROOT, getRequest } from './lib/dev-set.mjs';
import { loadHarnessEnv, redact } from './lib/env.mjs';
import { StudioMcpClient, listStudios, studioTools } from './lib/studio-mcp.mjs';
import { BASELINE_FORMAT, baselineProblems, baselineWarnings, isClean, parseLuauJson, verifyCounts, worldScript } from './lib/world.mjs';

export const HARNESS_VERSION = 2;
/** The test account and its most recent project (handoff M3). Both are overridable and are echoed at the start of a run. */
export const DEFAULT_USER = '8722e4df-ab9c-47f6-8a57-02f5a5dd1d44';
export const DEFAULT_PROJECT = '1ea443f2-6232-43c1-a8bd-f425e2df4f4d';
/** The ledger units behind one credit as the app shows it. Mirrors INTERNAL_PER_CREDIT in packages/shared (a test pins it). */
export const INTERNAL_PER_CREDIT = 150;
export const DEFAULTS = {
  milestone: 'M3',
  grantLedger: 3000, // 20 credits: more than a big build (4 to 12 credits, planning/pricing-2026-10-04.md)
  timeoutMinutes: 15,
  maxMonthUsd: 20, // the owner's Workers AI test ceiling (CLAUDE.md consent section)
  pollMs: 5000,
  pollAttempts: 4, // tries per status poll before the run is given up on (and stopped)
  stopWaitMs: 90_000, // how long to wait for a stopped run to go idle
  playWarmupMs: 3000,
  playFrameGapMs: 2000,
  playFrames: 3,
};

export class Abort extends Error {
  constructor(step, message) {
    super(message);
    this.step = step;
  }
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const stamp = (ms) => new Date(ms).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const sleepReal = (ms) => new Promise((r) => setTimeout(r, ms));
const unique = (a) => [...new Set(a)];

/** The Luau that reads the typed play-session log: counts of errors and warnings, and the first few error lines. */
export const LOG_SERVICE_LUAU = `local HttpService = game:GetService("HttpService")
local LogService = game:GetService("LogService")
local errors, warnings, first = 0, 0, {}
for _, entry in ipairs(LogService:GetLogHistory()) do
	if entry.messageType == Enum.MessageType.MessageError then
		errors += 1
		if #first < 10 then
			table.insert(first, string.sub(entry.message, 1, 300))
		end
	elseif entry.messageType == Enum.MessageType.MessageWarning then
		warnings += 1
	end
end
return HttpService:JSONEncode({ errors = errors, warnings = warnings, first = first })`;

// ---------------------------------------------------------------------------------------------------------------
export function parseArgs(argv) {
  const o = { positional: [], flags: {} };
  const valued = new Set(['milestone', 'project', 'user', 'proof-root', 'env-file', 'api-base', 'baseline-file', 'studio-id', 'grant', 'timeout-minutes', 'max-month-usd', 'agent']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) o.positional.push(a);
    else {
      const name = a.slice(2);
      if (valued.has(name)) {
        const v = argv[++i];
        if (v === undefined || v.startsWith('--')) throw new Error(`--${name} needs a value`);
        o.flags[name] = v;
      } else o.flags[name] = true;
    }
  }
  return o;
}

export function resolveOptions(argv, { env = process.env } = {}) {
  const { positional, flags } = parseArgs(argv);
  const known = new Set(['milestone', 'project', 'user', 'proof-root', 'env-file', 'api-base', 'baseline-file', 'studio-id', 'grant', 'timeout-minutes', 'max-month-usd', 'agent', 'dry-run', 'init-baseline', 'overwrite', 'help']);
  const agent = flags.agent ?? 'product';
  if (agent !== 'product' && agent !== 'studio') throw new Error('--agent is product (the /app agent, default) or studio (the rebuilt Studio agent)');
  for (const f of Object.keys(flags)) if (!known.has(f)) throw new Error(`unknown flag --${f}`);
  const milestone = flags.milestone ?? DEFAULTS.milestone;
  if (!/^[A-Za-z0-9._-]+$/.test(milestone)) throw new Error(`--milestone "${milestone}" is not a folder name`);
  const proofRoot = flags['proof-root'] ?? join(REPO_ROOT, 'planning', 'proof');
  const initBaseline = flags['init-baseline'] === true;
  if (flags.help !== true && !initBaseline && positional.length !== 1) throw new Error('usage: run-piece.mjs <request-id> [--milestone M3] [--project <id>] [--user <id>] [--dry-run]   (or --init-baseline)');
  const num = (name, dflt) => {
    if (flags[name] === undefined) return dflt;
    const n = Number(flags[name]);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`--${name} must be a positive number`);
    return n;
  };
  return {
    requestId: positional[0] ?? null,
    milestone,
    projectId: flags.project ?? DEFAULT_PROJECT,
    userId: flags.user ?? DEFAULT_USER,
    dryRun: flags['dry-run'] === true,
    agent,
    initBaseline,
    overwrite: flags.overwrite === true,
    proofRoot,
    baselineFile: flags['baseline-file'] ?? join(proofRoot, milestone, 'place-baseline.json'),
    envFile: flags['env-file'],
    apiBase: flags['api-base'],
    studioId: flags['studio-id'],
    grantLedger: num('grant', DEFAULTS.grantLedger),
    timeoutMinutes: num('timeout-minutes', DEFAULTS.timeoutMinutes),
    maxMonthUsd: num('max-month-usd', DEFAULTS.maxMonthUsd),
    pollMs: DEFAULTS.pollMs,
    help: flags.help === true,
    env,
  };
}

// ---------------------------------------------------------------------------------------------------------------
/**
 * Records each step with its start, duration, outcome and a note. A failing step is recorded, then re-thrown. `interrupted()` names the
 * signal that has arrived (or null): a step that has not begun does not begin after one, and the one in flight is left to finish.
 */
function makeTimer(deps, interrupted = () => null) {
  const steps = [];
  const clean = (text) => redact(String(text), [deps.adminKey]);
  return {
    steps,
    async step(name, fn) {
      const signal = interrupted();
      if (signal) throw new Abort(name, `interrupted by ${signal} before this step began`);
      const startedAt = deps.now();
      const entry = { name, startedAt: new Date(startedAt).toISOString(), ms: 0, ok: true, note: null };
      steps.push(entry);
      deps.log(`[eval] ${name} ...`);
      try {
        const result = await fn(entry);
        entry.ms = deps.now() - startedAt;
        deps.log(`[eval] ${name}: ok in ${entry.ms} ms${entry.note ? ` (${entry.note})` : ''}`);
        return result;
      } catch (e) {
        entry.ms = deps.now() - startedAt;
        entry.ok = false;
        entry.note = clean(e.message ?? e).slice(0, 400);
        deps.log(`[eval] ${name}: FAILED in ${entry.ms} ms: ${entry.note}`);
        throw e;
      }
    },
  };
}

/** Pick the one Studio that has a place open (or the one --studio-id names). */
async function chooseStudio(client, wanted) {
  const listed = await listStudios(client);
  if (!listed.ok) throw new Abort('preflight', `list_roblox_studios failed: ${listed.text.slice(0, 200)}`);
  if (!listed.studios.length) throw new Abort('preflight', 'Roblox Studio is not running (no Studio instance is connected to the MCP server). Open Studio and the local Baseplate place (README, one-time setup).');
  const probes = [];
  for (const s of listed.studios) {
    if (wanted && s.id !== wanted) continue;
    const st = await studioTools(client, s.id).state();
    probes.push({ id: s.id, name: s.name ?? null, ok: st.ok, text: st.text.slice(0, 400) });
  }
  const open = probes.filter((p) => p.ok);
  if (wanted && !probes.length) throw new Abort('preflight', `--studio-id ${wanted} is not among the connected Studios (${listed.studios.map((s) => s.id).join(', ')})`);
  if (open.length === 0) {
    const why = probes.map((p) => `${p.id}: ${p.text}`).join(' | ');
    throw new Abort('preflight', `no Studio has a place open (${why}). Open the local Baseplate place in Studio first (README, one-time setup); the harness never opens or signs in to anything itself.`);
  }
  if (open.length > 1) throw new Abort('preflight', `${open.length} Studios have a place open (${open.map((p) => p.id).join(', ')}); pass --studio-id to choose one`);
  return { chosen: open[0], listed: listed.studios, probes };
}

async function waitFor(deps, predicate, { timeoutMs, everyMs = 1000 }) {
  const end = deps.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return true;
    if (deps.now() >= end) return false;
    await deps.sleep(everyMs);
  }
}

/** An error that another try may clear: no answer, a 5xx, a 429 or a 408. A 401, 403 or 404 will not get better. */
const isTransient = (e) => e?.status === undefined || e.status >= 500 || e.status === 429 || e.status === 408;

/** The project's session-info, retrying the failures a retry can fix. Throws the last error when it gives up or the error is not transient. */
async function sessionInfoWithRetry(deps, projectId, { attempts, everyMs }) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await deps.api.sessionInfo(projectId);
    } catch (e) {
      last = e;
      if (!isTransient(e) || attempt === attempts) break;
      deps.log(`[eval] session-info failed (try ${attempt} of ${attempts}): ${redact(e.message ?? String(e), [deps.adminKey])}; trying again`);
      await deps.sleep(everyMs * attempt);
    }
  }
  throw last;
}

/** The picture inside a screen_capture answer, with its real size; throws what is wrong. Used for every picture the harness saves. */
export function pictureFrom(r) {
  if (!r.ok) throw new Error(r.text.slice(0, 200) || 'screen_capture reported an error');
  const img = extractImage(r);
  if (!img) throw new Error(`screen_capture returned no picture (text: ${r.text.slice(0, 120)})`);
  const size = imageSize(img.bytes);
  // Bytes that are neither a PNG nor a JPEG are not saved under a picture's name: a viewer that trusts the name would reject them.
  if (!size) throw new Error(`screen_capture returned bytes that are neither a PNG nor a JPEG (first bytes ${img.bytes.subarray(0, 8).toString('hex')}); the harness records the failure and saves nothing`);
  return { img, size };
}

const luauJson = async (tools, mode, baseline, datamodel = 'Edit', timeoutMs = 90_000) => {
  const r = await tools.luau(worldScript(mode, baseline), datamodel, { timeoutMs });
  if (!r.ok) throw new Error(`execute_luau (${mode}) failed: ${r.text.slice(0, 300)}`);
  return parseLuauJson(r.text);
};

// ---------------------------------------------------------------------------------------------------------------
/** `--init-baseline`: record what the pristine open place holds. Run once, on a clean Baseplate. */
export async function initBaseline(opts, deps) {
  const timer = makeTimer(deps);
  const client = await deps.openStudio();
  try {
    return await timer.step('capture-baseline', async (entry) => {
      const { chosen } = await chooseStudio(client, opts.studioId);
      const tools = studioTools(client, chosen.id);
      const baseline = await luauJson(tools, 'capture', null);
      const problems = baselineProblems(baseline);
      if (problems.length) throw new Abort('capture-baseline', `this does not look like a Baseplate place: ${problems.join('; ')}`);
      const warnings = baselineWarnings(baseline);
      const body = { harnessVersion: HARNESS_VERSION, capturedAt: new Date(deps.now()).toISOString(), studio: { id: chosen.id, state: chosen.text }, ...baseline };
      mkdirSync(dirname(opts.baselineFile), { recursive: true });
      writeFileSync(opts.baselineFile, JSON.stringify(body, null, 1) + '\n');
      const total = Object.values(baseline.inventory).reduce((n, keys) => n + keys.length, 0);
      entry.note = `${total} instances recorded${warnings.length ? `, ${warnings.length} warning(s)` : ''}`;
      return { file: opts.baselineFile, instances: total, warnings, sha256: sha256(readFileSync(opts.baselineFile)) };
    });
  } finally {
    await client.close();
  }
}

// ---------------------------------------------------------------------------------------------------------------
/** The worker's AgentState.status is 'idle' | 'running' | 'stopping'. Only 'idle' is over: 'stopping' means a tool is still finishing. */
const isIdle = (info) => info?.agentStatus === 'idle';
// SIGHUP is what closing the terminal window sends: Node's default for it ends the process at once, like the other two.
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];
// What a person presses again to kill the runner at once. SIGHUP is not one of them: closing a terminal can deliver it twice
// (zsh forwards the kernel's SIGHUP to its jobs about a millisecond later), and a second SIGHUP met by Node's default would
// end the runner with the run live and nothing written. So SIGHUP stays held until the piece is over.
const KILL_AGAIN = new Set(['SIGINT', 'SIGTERM']);

/** With the terminal gone, a write to it fails with an 'error' event (EIO, ENXIO), which Node turns into a crash if nobody
 *  listens. The runner must still stop a live run and write the manifest, so the failure is ignored: nobody is there to read it. */
export function ignoreBrokenTerminal(streams = [process.stdout, process.stderr]) {
  for (const s of streams) s.on('error', () => undefined);
}

export async function runPiece(opts, deps) {
  // A log line never ends the piece: with the terminal gone a write can throw, and the stop and the manifest still have to happen.
  const rawLog = deps.log;
  deps = { ...deps, log: (m) => { try { rawLog(m); } catch { /* the terminal is gone */ } } };
  const t0 = deps.now();
  let interrupted = null; // the name of the first SIGINT, SIGTERM or SIGHUP that arrived
  const timer = makeTimer(deps, () => interrupted);
  const secrets = [deps.adminKey];
  const request = getRequest(opts.requestId, deps.devSetPath);
  const pieceDir = join(opts.proofRoot, opts.milestone, request.id);
  const manifest = {
    harness: { name: 'studpilot-eval', version: HARNESS_VERSION, node: process.version, startedAt: new Date(t0).toISOString(), finishedAt: null, dryRun: opts.dryRun },
    milestone: opts.milestone,
    request: { id: request.id, category: request.category, text: request.text, devSetSha256: request.devSetSha256 },
    project: { id: opts.projectId, name: null },
    userId: opts.userId,
    deploy: { apiBase: deps.api.base, buildSha: null, healthTime: null },
    studio: null,
    plugin: null,
    baseline: null,
    reset: null,
    conversation: null,
    spend: { before: null, after: null },
    run: null,
    build: null,
    captures: [],
    ui: null,
    playTest: null,
    functionalChecks: { defined: false },
    aborted: null,
    files: {},
  };
  const credits = { ledgerPerCredit: INTERNAL_PER_CREDIT, plan: 'free', grant: null, before: null, afterGrant: null, after: null, spentLedger: null, spentCredits: null, balanceDeltaLedger: null, dryRun: opts.dryRun };
  // What console.txt holds when the play test did not read one. Never an empty file: the claim auditor is told an empty console means
  // nothing was printed, and a console that was never read must not say that.
  const noConsole = (why) => `(the console was not read: ${why})\n`;
  const out = { reply: '(dry run: no agent run was made)\n', steps: { dryRun: opts.dryRun, steps: [], count: 0 }, console: noConsole('the play test did not run') };
  const shots = []; // { file, bytes }

  if (existsSync(join(pieceDir, 'manifest.json'))) {
    if (!opts.overwrite) throw new Abort('setup', `${relative(process.cwd(), pieceDir) || pieceDir} already holds a run. Pass --overwrite to move it aside (to ${request.id}.prev-<time>) and run again.`);
    let aside = `${pieceDir}.prev-${stamp(deps.now())}`;
    for (let n = 2; existsSync(aside); n++) aside = `${pieceDir}.prev-${stamp(deps.now())}-${n}`;
    renameSync(pieceDir, aside);
  }
  mkdirSync(join(pieceDir, 'shots'), { recursive: true });

  let client = null;
  let tools = null;
  let playStarted = false;
  let runLive = false; // an agent run was started and has not been seen to end: whatever happens, it must be stopped

  let stopAccepted = false; // the worker took a stop request: asking again changes nothing, so a run that still is not idle is not stopped twice

  /**
   * Stop the run and wait for it to go idle. Records what happened under manifest.run.stop; never throws. There is one record: a second
   * attempt (only ever made when no stop request was accepted by the first) keeps the first attempt's reason and time and counts itself
   * in `attempts`; `requested`, `idle` and `error` say how the latest one ended.
   */
  const stopRun = async (reason) => {
    deps.log(`[eval] stopping the run (${reason})`);
    const stop = manifest.run?.stop ?? { reason, requestedAt: new Date(deps.now()).toISOString(), attempts: 0, requested: false, idle: false, error: null };
    stop.attempts++;
    stop.error = null;
    if (manifest.run) manifest.run.stop = stop;
    try {
      await deps.api.agentStop(opts.projectId);
      stop.requested = true;
      stopAccepted = true;
    } catch (e) {
      stop.error = redact(e.message ?? String(e), secrets).slice(0, 300);
      deps.log(`[eval] stop request failed: ${stop.error}`);
    }
    try {
      stop.idle = await waitFor(
        deps,
        async () => {
          try {
            return isIdle(await deps.api.sessionInfo(opts.projectId)); // 'stopping' (a tool still finishing) is not idle
          } catch {
            return false; // the status cannot be read either: not known to be idle
          }
        },
        { timeoutMs: opts.stopWaitMs ?? DEFAULTS.stopWaitMs, everyMs: opts.pollMs },
      );
    } catch (e) {
      stop.error = stop.error ?? redact(e.message ?? String(e), secrets).slice(0, 300);
    }
    if (stop.idle) runLive = false;
    else deps.log('[eval] WARNING: the run did not go idle after the stop request; stop it by hand (POST /api/admin/agent-stop/<project>)');
    return stop;
  };

  // Node's default for SIGINT, SIGTERM and SIGHUP ends the process at once, without running the `finally` below, which would leave a paid run
  // going with nothing in the manifest. So the first signal is only noted: the step in flight finishes (the run's poll below does not
  // wait for its next tick), no further step begins, and the `finally` stops a live run and writes the files. The SIGINT and SIGTERM
  // handlers are taken off at the first signal, so a second Ctrl-C kills the process the ordinary way; SIGHUP stays held (KILL_AGAIN).
  const signals = deps.signals ?? process;
  let wake;
  const interruption = new Promise((resolve) => { wake = resolve; });
  const listeners = SIGNALS.map((name) => [name, () => {
    if (interrupted) return;
    interrupted = name;
    release();
    deps.log(`[eval] ${name}: stopping the run if one is live, then writing the manifest; press Ctrl-C again to kill the runner at once`);
    wake();
  }]);
  const unlisten = () => { for (const [name, fn] of listeners) signals.off(name, fn); };
  const release = () => { for (const [name, fn] of listeners) if (KILL_AGAIN.has(name)) signals.off(name, fn); };
  for (const [name, fn] of listeners) signals.on(name, fn);

  try {
    // ----------------------------------------------------------------------------------------------- preflight
    const baseline = await timer.step('preflight', async (entry) => {
      const health = await deps.api.health();
      manifest.deploy.buildSha = health?.buildSha ?? null;
      manifest.deploy.healthTime = health?.time ?? null;

      client = await deps.openStudio();
      manifest.studio = { serverInfo: client.serverInfo ?? null };
      const { chosen, listed, probes } = await chooseStudio(client, opts.studioId);
      tools = studioTools(client, chosen.id);
      Object.assign(manifest.studio, { studioId: chosen.id, state: chosen.text, studiosListed: listed.length, probes });

      const info = await deps.api.sessionInfo(opts.projectId);
      manifest.project.name = info?.project?.name ?? null;
      manifest.plugin = {
        connected: info?.pluginConnected === true,
        pluginVersion: info?.link?.pluginVersion ?? null,
        paired: info?.link?.paired ?? null,
        openPlace: info?.openPlace ?? null,
        queuedOps: info?.queuedOps ?? null,
        messagesBefore: info?.messages ?? null,
        agentStatus: info?.agentStatus ?? null,
      };
      if (!manifest.plugin.connected) {
        const msg = 'the StudPilot plugin is not connected for this project (session-info pluginConnected is false)';
        if (!opts.dryRun) throw new Abort('preflight', `${msg}. Pair it (README, one-time setup); nothing was spent.`);
        entry.note = `${msg}; the dry run continues with the Studio-only steps`;
        deps.log(`[eval] NOTE: ${msg}. Continuing: a dry run needs only Studio.`);
      }
      if (!opts.dryRun && info?.agentStatus === 'running') throw new Abort('preflight', 'a run is already in progress on this project; wait for it or stop it');

      manifest.spend.before = (await deps.api.spend())?.state ?? null;
      if (!opts.dryRun) {
        const spendState = manifest.spend.before;
        if (!spendState) throw new Abort('preflight', 'the spend report has no state; refusing to start a paid run blind');
        if (spendState.killed) throw new Abort('preflight', `the global kill switch is on (${spendState.killedReason ?? 'no reason given'})`);
        if (Number(spendState.estimatedMonthUsd) >= opts.maxMonthUsd) {
          throw new Abort('preflight', `this month's Workers AI spend is already $${spendState.estimatedMonthUsd}, at or above the $${opts.maxMonthUsd} test ceiling; more needs the owner's yes`);
        }
      }

      if (!existsSync(opts.baselineFile)) {
        throw new Abort('preflight', `no place baseline at ${opts.baselineFile}. Open a pristine Baseplate in Studio and run: node scripts/eval/run-piece.mjs --init-baseline --milestone ${opts.milestone}`);
      }
      const baselineBytes = readFileSync(opts.baselineFile);
      const baselineObj = JSON.parse(baselineBytes.toString('utf8'));
      if (baselineObj.format !== BASELINE_FORMAT) {
        throw new Abort('preflight', `the baseline file is format ${baselineObj.format ?? 1}, not ${BASELINE_FORMAT}: it predates the per-instance properties. With the pristine place open, run: node scripts/eval/run-piece.mjs --init-baseline --milestone ${opts.milestone}`);
      }
      manifest.baseline = { file: relative(REPO_ROOT, opts.baselineFile), sha256: sha256(baselineBytes), capturedAt: baselineObj.capturedAt ?? null };
      return baselineObj;
    });
    const baselineForLuau = (({ harnessVersion, capturedAt, studio, ...rest }) => rest)(baseline);
    // `measure` and `ui-enable` read only the inventory and the terrain count: they are sent without the per-instance state, which is most of the file.
    const baselineLite = { inventory: baselineForLuau.inventory, terrainCells: baselineForLuau.terrainCells };

    // ----------------------------------------------------------------------------------------------- reset
    await timer.step('reset', async (entry) => {
      // A place left in play mode answers no Edit call: stop it first, then insist on edit mode.
      const edit = await tools.luau('return "edit"', 'Edit', { timeoutMs: 15_000 }).catch(() => ({ ok: false }));
      if (!edit.ok) {
        await tools.play(false, { timeoutMs: 30_000 }).catch(() => undefined);
        const back = await waitFor(deps, async () => (await tools.luau('return "edit"', 'Edit', { timeoutMs: 10_000 }).catch(() => ({ ok: false }))).ok, { timeoutMs: 30_000 });
        if (!back) throw new Abort('reset', 'Studio would not return to edit mode');
      }
      const reset = await luauJson(tools, 'reset', baselineForLuau);
      const verify = await luauJson(tools, 'verify', baselineForLuau);
      const counts = verifyCounts(verify);
      manifest.reset = {
        removedInstances: reset.removedInstances ?? 0,
        removedByService: Array.isArray(reset.removedByService) ? {} : reset.removedByService ?? {},
        restored: reset.restored ?? [],
        rebuilt: reset.rebuilt ?? [],
        restoreFailed: reset.restoreFailed ?? [],
        terrainCleared: reset.terrainCleared === true,
        verifyAfter: counts,
        clean: isClean(verify),
      };
      entry.note = `removed ${manifest.reset.removedInstances}, restored ${manifest.reset.restored.length}, rebuilt ${manifest.reset.rebuilt.length}`;
      if (!manifest.reset.clean) {
        const sample = [...(verify.extra ?? []).map((k) => `extra ${k}`), ...(verify.missing ?? []).map((k) => `missing ${k}`), ...(verify.propDiffs ?? []).map((k) => `differs ${k}`)].slice(0, 8);
        throw new Abort('reset', `the place is not clean after the reset (${counts.extra} extra, ${counts.missing} missing, ${counts.propDiffs} changed): ${sample.join('; ')}. Reload the pristine place file and re-run --init-baseline if the baseline itself is stale.`);
      }
    });

    // ----------------------------------------------------------------------------------------------- a fresh conversation, credits and the run
    if (opts.dryRun) {
      manifest.conversation = { cleared: false, skipped: 'dry run: no agent run follows, so the project\'s chat is left as it is' };
    } else if (opts.agent === 'studio') {
      // THE REBUILT STUDIO AGENT. A new conversation per piece (`<project>~eval-<id>-<time>`), so nothing to clear. It charges no
      // Credits yet (its model calls are metered by the shared budget only), so the credit steps do not apply and say so.
      const conversationId = evalConversationId(opts.projectId, opts.requestId, new Date(deps.now()).toISOString().replace(/[^0-9]/g, '').slice(0, 14));
      manifest.agent = 'studio';
      manifest.conversation = { cleared: true, route: 'a new Studio conversation', conversationId, at: new Date(deps.now()).toISOString() };
      // The Studio agent charges the owner's Credits (#53): the same grant as a product run, and the same reading after.
      await timer.step('credits', async (entry) => {
        credits.before = quotaSnapshot(await deps.api.account(opts.userId));
        await deps.api.setPlan(opts.userId, 'free');
        const eventId = `eval-${opts.milestone}-${request.id}-studio-${stamp(deps.now())}`;
        const grant = await deps.api.grantCredits(opts.userId, opts.grantLedger, eventId);
        credits.grant = { amountLedger: opts.grantLedger, amountCredits: opts.grantLedger / INTERNAL_PER_CREDIT, eventId, status: grant.status, granted: grant.json?.granted ?? null, replayed: grant.json?.replayed === true };
        if (grant.status !== 200 || grant.json?.ok === false) throw new Abort('credits', `the credit grant was refused (HTTP ${grant.status})`);
        credits.afterGrant = quotaSnapshot(await deps.api.account(opts.userId));
        entry.note = `plan free, granted ${opts.grantLedger} ledger units, event ${eventId}`;
      });
      await timer.step('agent-run', async (entry) => {
        const startedAt = deps.now();
        const token = await deps.studio.session(opts.userId);
        secrets.push(token);
        const r = await deps.studio.run({ token, conversationId, text: request.text, timeoutMs: opts.timeoutMinutes * 60_000 });
        manifest.run = { startedAt: new Date(startedAt).toISOString(), startConfirmed: true, endedBy: r.endedBy, stopReason: r.endedBy, minutes: Math.round(((deps.now() - startedAt) / 60_000) * 100) / 100, timeoutMinutes: opts.timeoutMinutes, error: r.error ? redact(r.error, secrets) : null };
        out.reply = `${r.reply}\n`;
        out.steps = { dryRun: false, stopReason: r.endedBy, count: r.steps.length, failed: r.steps.filter((x) => x.ok === false).length, byTool: r.steps.reduce((acc, x) => ({ ...acc, [x.tool]: (acc[x.tool] ?? 0) + 1 }), {}), steps: r.steps };
        if (r.endedBy === 'failed') throw new Abort('agent-run', `the Studio agent's run failed: ${manifest.run.error}`);
        entry.note = `${manifest.run.minutes} min, ${r.endedBy}, ${r.steps.length} top-level tool calls`;
      });
      await timer.step('credits-after', async (entry) => {
        const after = quotaSnapshot(await deps.api.account(opts.userId));
        credits.after = after;
        const a = credits.afterGrant?.creditsRemaining;
        const b = after?.creditsRemaining;
        credits.balanceDeltaLedger = typeof a === 'number' && typeof b === 'number' ? a - b : null;
        entry.note = `${credits.balanceDeltaLedger ?? '?'} ledger units by the balance`;
      });
    } else {
      // The next request must not see an earlier one: the messages, the memory they produced and the build ledger of the project go
      // (POST /api/admin/conversation-reset/:id; scripts/eval/README.md says exactly what that is). A piece that cannot get one does
      // not run: it would be scored on a conversation it shared with the pieces before it.
      await timer.step('conversation', async (entry) => {
        const res = await deps.api.conversationReset(opts.projectId, opts.userId);
        const body = res.json ?? {};
        manifest.conversation = {
          cleared: res.status === 200 && body.ok === true,
          route: 'POST /api/admin/conversation-reset/:id',
          status: res.status,
          removedMessages: body.removedMessages ?? null,
          memoryCleared: body.memoryCleared ?? null,
          planCleared: body.planCleared ?? null,
          ledgerCleared: body.ledgerCleared ?? null,
          messagesAfter: body.messagesAfter ?? null,
          at: new Date(deps.now()).toISOString(),
        };
        if (!manifest.conversation.cleared) {
          const why = res.status === 404 ? 'the deployed worker has no conversation-reset route yet: deploy the worker first' : redact(String(body.error ?? body.code ?? 'no reason given'), secrets);
          throw new Abort('conversation', `the project's conversation could not be cleared (HTTP ${res.status}: ${why}); nothing was spent`);
        }
        // Believe the project, not the route: the message count is what the run's end is measured against.
        const info = await deps.api.sessionInfo(opts.projectId);
        manifest.plugin.messagesBefore = info?.messages ?? null;
        if (info?.messages !== 0) throw new Abort('conversation', `the conversation still holds ${info?.messages ?? 'an unknown number of'} messages after it was cleared; nothing was spent`);
        entry.note = `${manifest.conversation.removedMessages} messages removed, memory ${manifest.conversation.memoryCleared ? 'cleared' : 'was empty'}, ledger ${manifest.conversation.ledgerCleared ? 'cleared' : 'was empty'}`;
      });

      await timer.step('credits', async (entry) => {
        const before = await deps.api.account(opts.userId);
        credits.before = quotaSnapshot(before);
        await deps.api.setPlan(opts.userId, 'free');
        const eventId = `eval-${opts.milestone}-${request.id}-${stamp(deps.now())}`;
        const grant = await deps.api.grantCredits(opts.userId, opts.grantLedger, eventId);
        credits.grant = { amountLedger: opts.grantLedger, amountCredits: opts.grantLedger / INTERNAL_PER_CREDIT, eventId, status: grant.status, granted: grant.json?.granted ?? null, replayed: grant.json?.replayed === true };
        if (grant.status !== 200 || grant.json?.ok === false) throw new Abort('credits', `the credit grant was refused (HTTP ${grant.status})`);
        credits.afterGrant = quotaSnapshot(await deps.api.account(opts.userId));
        entry.note = `plan free, granted ${opts.grantLedger} ledger units (${opts.grantLedger / INTERNAL_PER_CREDIT} credits), event ${eventId}`;
      });

      await timer.step('agent-run', async (entry) => {
        const startedAt = deps.now();
        const minutesSince = () => Math.round(((deps.now() - startedAt) / 60_000) * 100) / 100;
        // From the moment the request is sent the worker may have a run going, whatever its answer says: a 5xx or a timeout does not tell
        // us the run did not start, and a run nobody watches goes on spending the credits granted above. So the run is recorded first and is
        // live from here; every way out of this step, and the `finally` below, stops it.
        manifest.run = { startedAt: new Date(startedAt).toISOString(), startConfirmed: false, startError: null, endedBy: null, stopReason: null, minutes: null, timeoutMinutes: opts.timeoutMinutes };
        runLive = true;
        /** End the step with the run stopped: record how it ended, stop it, wait for idle, and say so in the abort. Never returns. */
        const giveUp = async (endedBy, reason, what) => {
          manifest.run.endedBy = endedBy;
          manifest.run.minutes = minutesSince();
          const stop = await stopRun(reason);
          throw new Abort('agent-run', `${what}; the run was ${stop.idle ? 'stopped and is idle' : 'asked to stop but NOT confirmed idle: stop it by hand'}`);
        };
        /** The worker said no: no run of ours exists, so none is recorded and nothing is stopped (a 409 is somebody else's run). Never returns. */
        const refused = (message) => {
          manifest.run = null;
          runLive = false;
          throw new Abort('agent-run', message);
        };
        let started;
        try {
          started = await deps.api.agentRun(opts.projectId, { text: request.text });
        } catch (e) {
          const why = redact(e.message ?? String(e), secrets);
          // A status the worker answered with and no retry could change (a 400, 401, 404) is a refusal, the same as a 403 or a 409: it comes
          // from a request the worker did not act on. No answer, a 5xx, a 408 or a 429 leave open whether the worker had started the run (or
          // will), and a start that lands after the stop below is not ruled out either: so the start is recorded as not confirmed and stopped.
          if (!isTransient(e)) refused(`the worker refused the request to start the run: ${why}`);
          manifest.run.startError = why;
          await giveUp('start-failed', `the start request failed: ${why}`, `the request to start the run failed (${why}), so it is not known whether the worker started one`);
        }
        if (started.status === 409) refused('the project already has a run in progress');
        if (started.status === 403) refused(`the run was refused: ${started.json?.code ?? started.json?.error ?? 'HTTP 403'}`);
        manifest.run.startConfirmed = started.status === 200;
        const deadline = startedAt + opts.timeoutMinutes * 60_000;
        const messagesBefore = manifest.plugin.messagesBefore ?? 0;
        const retry = { attempts: opts.pollAttempts ?? DEFAULTS.pollAttempts, everyMs: opts.pollMs };
        let seenRunning = false;
        let ended = null;
        for (;;) {
          await Promise.race([deps.sleep(opts.pollMs), interruption]);
          if (interrupted) await giveUp('interrupted', `${interrupted} arrived while the run was live`, `interrupted by ${interrupted}`);
          let info;
          try {
            info = await sessionInfoWithRetry(deps, opts.projectId, retry);
          } catch (e) {
            // The status cannot be read: the run keeps going and keeps spending whatever the harness knows. Stop it, and say so.
            const why = redact(e.message ?? String(e), secrets);
            await giveUp('poll-failed', `the run's status could not be read: ${why}`, `the run's status could not be read (${why})`);
          }
          // The run is over only when the worker says 'idle': 'stopping' is a tool still finishing and the place is not at rest.
          if (info?.agentStatus === 'running') seenRunning = true;
          else if (isIdle(info) && (seenRunning || (info?.messages ?? 0) >= messagesBefore + 2)) {
            ended = 'finished';
            runLive = false;
            break;
          } else if (!seenRunning && deps.now() - startedAt > 60_000) {
            // Only a run that was never seen running. One that was seen and now reads 'stopping' (the owner pressed Stop, or access was
            // revoked) is over when it reads 'idle', however long that takes, up to the timeout below.
            ended = 'never-started';
            break;
          }
          if (deps.now() >= deadline) {
            ended = 'timeout';
            break;
          }
        }
        manifest.run.endedBy = ended === 'finished' ? 'done' : ended;
        // A run that never showed itself may still start late; a stop on an idle run is harmless and a late start is not.
        const why = ended === 'timeout' ? `the run passed ${opts.timeoutMinutes} minutes` : 'the run never showed as running';
        const stop = ended === 'finished' ? null : await stopRun(why);
        manifest.run.minutes = minutesSince();
        // Not idle means a tool may still be changing the place: it is not measured, photographed or play-tested, and the next reset is not safe.
        if (stop && !stop.idle) throw new Abort('agent-run', `${why} and the run was asked to stop but NOT confirmed idle: stop it by hand; the piece is not measured while the place may still be changing`);
        entry.note = `${manifest.run.minutes} min, ${manifest.run.endedBy}`;
      });

      await timer.step('messages', async (entry) => {
        const all = (await deps.api.messages(opts.projectId, 100))?.messages ?? [];
        const assistant = [...all].reverse().find((m) => m.role === 'assistant');
        const user = assistant ? [...all.slice(0, all.indexOf(assistant))].reverse().find((m) => m.role === 'user') : null;
        if (!assistant) {
          manifest.run.stopReason = null;
          if (manifest.run.endedBy === 'done') manifest.run.endedBy = 'no-reply';
          entry.note = 'no assistant message was found';
          return;
        }
        manifest.run.requestEchoed = user ? user.content === request.text : null;
        manifest.run.stopReason = assistant.stopReason ?? null;
        manifest.run.creditsSpentLedger = assistant.creditsSpent ?? null;
        manifest.run.error = assistant.error ?? null;
        if (manifest.run.endedBy === 'done') {
          const r = assistant.stopReason;
          manifest.run.endedBy = r === 'done' ? 'done' : r ?? 'unknown-stop-reason';
        }
        const trace = Array.isArray(assistant.toolTrace) ? assistant.toolTrace : [];
        out.reply = `${assistant.content}\n`;
        out.steps = {
          dryRun: false,
          messageId: assistant.id,
          stopReason: assistant.stopReason ?? null,
          creditsSpent: assistant.creditsSpent ?? null,
          count: trace.length,
          failed: trace.filter((s) => s.ok === false).length,
          byTool: trace.reduce((acc, s) => ({ ...acc, [s.tool]: (acc[s.tool] ?? 0) + 1 }), {}),
          steps: trace.map((s) => ({ tool: s.tool, summary: String(s.summary ?? '').slice(0, 400), ok: s.ok, durationMs: s.durationMs, ...(s.error ? { error: String(s.error).slice(0, 300) } : {}) })),
        };
        entry.note = `${trace.length} steps, stopReason ${assistant.stopReason ?? 'unknown'}, ${assistant.creditsSpent ?? '?'} ledger units`;
      });

      await timer.step('credits-after', async (entry) => {
        credits.after = quotaSnapshot(await deps.api.account(opts.userId));
        credits.spentLedger = manifest.run?.creditsSpentLedger ?? null;
        credits.spentCredits = credits.spentLedger === null ? null : Math.round((credits.spentLedger / INTERNAL_PER_CREDIT) * 100) / 100;
        if (credits.afterGrant?.creditsRemaining != null && credits.after?.creditsRemaining != null) {
          credits.balanceDeltaLedger = credits.afterGrant.creditsRemaining - credits.after.creditsRemaining;
        }
        entry.note = `${credits.spentCredits ?? '?'} credits by the message, ${credits.balanceDeltaLedger ?? '?'} ledger units by the balance`;
      });
    }

    // ----------------------------------------------------------------------------------------------- measure
    const measured = await timer.step('measure', async (entry) => {
      const m = await luauJson(tools, 'measure', baselineLite);
      const cls = classifyBuild(m);
      manifest.build = { kind: cls.kind, emptyScreenGuis: cls.emptyScreenGuis, ...m };
      const terrain = m.terrain?.edited ? `, terrain edited (${m.terrain.cells ?? '?'} cells)` : '';
      entry.note = `${cls.kind}: ${m.addedInstances} instances, ${m.addedParts} parts${terrain}, ${(m.screenGuis ?? []).length} screen UI(s)`;
      return { m, cls };
    });

    // ----------------------------------------------------------------------------------------------- captures
    await timer.step('captures', async (entry) => {
      let n = 0;
      const save = async (name, camera) => {
        const rec = { name, file: null, width: null, height: null, bytes: null, camera: camera ?? null, error: null };
        manifest.captures.push(rec);
        try {
          const { img, size } = pictureFrom(await tools.capture(`ScreenCapture_${++n}`, camera, { timeoutMs: 60_000 }));
          rec.width = size.width;
          rec.height = size.height;
          rec.format = size.format;
          rec.imageSource = img.source;
          let file = `${name}.${fileExtension(size)}`;
          if (name === 'ui') {
            const ui = uiShotName(size);
            file = ui.file;
            rec.target = ui.target;
          }
          rec.file = `shots/${file}`;
          rec.bytes = img.bytes.length;
          writeFileSync(join(pieceDir, 'shots', file), img.bytes);
          shots.push(rec.file);
        } catch (e) {
          rec.error = String(e.message ?? e).slice(0, 300);
          deps.log(`[eval] capture ${name}: ${rec.error}`);
        }
        return rec;
      };
      const { m, cls } = measured;
      const planned = plannedShotNames(cls.kind);
      if (planned.some((name) => WORLD_CAMERAS.includes(name))) {
        const framing = framingFor(m);
        const plan = cameraPlan(framing.bounds, m.spawn ?? DEFAULT_SPAWN);
        manifest.build.cameraPlan = { ...plan, basis: framing.basis, spawnSource: m.spawn?.source ?? null, framing: m.framing ?? null };
        for (const cam of plan.cameras) await save(cam.name, { position: cam.position, lookAt: cam.lookAt });
      }
      if (planned.includes('ui')) {
        // A screen UI the run left switched off (a modal opened by a button) is not drawn: it is switched on for the picture and put back.
        const switchedOff = (m.screenGuis ?? []).filter((g) => g.enabled === false && g.guiObjects > 0).map((g) => g.name);
        const shown = { switchedOff, enabledForCapture: [], enableError: null, restoreError: null };
        if (switchedOff.length) {
          try {
            shown.enabledForCapture = (await luauJson(tools, 'ui-enable', baselineLite)).enabled ?? [];
          } catch (e) {
            shown.enableError = String(e.message ?? e).slice(0, 200);
            deps.log(`[eval] could not switch the UI on for the capture: ${shown.enableError}`);
          }
        }
        let rec;
        try {
          rec = await save('ui', null);
        } finally {
          if (shown.enabledForCapture.length) {
            try {
              await luauJson(tools, 'ui-restore', null);
            } catch (e) {
              shown.restoreError = String(e.message ?? e).slice(0, 200);
              deps.log(`[eval] could not put the UI back after the capture: ${shown.restoreError}`);
            }
          }
        }
        const switchNote = !switchedOff.length
          ? ''
          : shown.enabledForCapture.length
            ? `; ${shown.enabledForCapture.join(', ')} ${shown.enabledForCapture.length === 1 ? 'was' : 'were'} switched off by the run, switched on for the picture${shown.restoreError ? ' and NOT put back' : ' and put back'}`
            : `; ${switchedOff.join(', ')} ${switchedOff.length === 1 ? 'is' : 'are'} switched off and could not be switched on, so ${switchedOff.length === 1 ? 'it is' : 'they are'} not in the picture`;
        manifest.ui = {
          requested: UI_TARGETS,
          viewportReported: m.viewport ?? null,
          captured: rec.file ? sizeLabel(rec) : null,
          met: rec.target ?? null,
          ...shown,
          note:
            (rec.file
              ? rec.target
                ? `captured at ${rec.target}, one of the two target sizes; the other was not captured (the harness cannot resize the Studio viewport)`
                : `captured at ${sizeLabel(rec)}, which is not a target size; it is named by the pixels actually captured`
              : 'no UI picture was captured') + switchNote,
        };
      }
      const ok = manifest.captures.filter((c) => c.file).length;
      entry.note = `${ok} of ${manifest.captures.length} captured`;
    });

    // ----------------------------------------------------------------------------------------------- the play test
    await timer.step('play-test', async (entry) => {
      const play = { started: false, serverAnswered: false, frames: [], consoleChars: 0, console: null, logServer: null, logClient: null, stateAfterStart: null, errors: null, unestablished: null, error: null };
      manifest.playTest = play;
      const settle = () => {
        const counts = playTestCounts({ console: play.console, logServer: play.logServer, logClient: play.logClient, started: play.started, serverAnswered: play.serverAnswered, error: play.error });
        play.errors = counts.errors;
        play.warnings = counts.warnings;
        play.sources = counts.sources;
        play.unestablished = counts.established ? null : counts.missing;
        return counts;
      };
      const before = await tools.console({ timeoutMs: 30_000 }).catch((e) => ({ ok: false, text: String(e.message ?? e) }));
      const s = await tools.play(true, { timeoutMs: 60_000 });
      if (!s.ok) {
        play.error = `start_stop_play failed: ${s.text.slice(0, 200)}`;
        out.console = noConsole(`play did not start (${s.text.slice(0, 120)})`);
        settle();
        entry.note = play.error;
        return;
      }
      playStarted = true;
      play.started = true;
      const running = await waitFor(deps, async () => (await tools.luau('return tostring(game:GetService("RunService"):IsRunning())', 'Server', { timeoutMs: 10_000 }).catch(() => ({ ok: false }))).ok, { timeoutMs: 40_000 });
      play.serverAnswered = running;
      await deps.sleep(DEFAULTS.playWarmupMs);
      play.stateAfterStart = (await tools.state().catch(() => ({ text: '' }))).text.slice(0, 300);
      for (let i = 1; i <= DEFAULTS.playFrames; i++) {
        if (i > 1) await deps.sleep(DEFAULTS.playFrameGapMs);
        const rec = { name: `play-${i}`, file: null, error: null };
        try {
          const { img, size } = pictureFrom(await tools.capture(`ScreenCapture_play_${i}`, null, { timeoutMs: 60_000 }));
          rec.file = `shots/play-${i}.${fileExtension(size)}`;
          rec.width = size.width;
          rec.height = size.height;
          rec.bytes = img.bytes.length;
          writeFileSync(join(pieceDir, rec.file), img.bytes);
          shots.push(rec.file);
        } catch (e) {
          rec.error = String(e.message ?? e).slice(0, 200);
        }
        play.frames.push(rec);
      }
      const after = await tools.console({ timeoutMs: 30_000 }).catch((e) => ({ ok: false, text: String(e.message ?? e) }));
      if (after.ok && before.ok) {
        out.console = consoleDelta(before.text, after.text);
      } else if (after.ok) {
        // No reading from before play: everything the console holds is shown, and it says so, so the earlier output is not taken for the play session's.
        out.console = `(the console before play could not be read, so this is everything it holds)\n${after.text}`;
      } else {
        out.console = noConsole(`get_console_output failed after the play test: ${String(after.text).slice(0, 120)}`);
      }
      play.consoleChars = after.ok ? out.console.length : 0;
      play.console = after.ok ? classifyConsole(before.ok ? out.console : after.text) : null;
      for (const [key, dm] of [['logServer', 'Server'], ['logClient', 'Client']]) {
        const r = await tools.luau(LOG_SERVICE_LUAU, dm, { timeoutMs: 20_000 }).catch(() => ({ ok: false, text: '' }));
        try {
          play[key] = r.ok ? parseLuauJson(r.text) : null;
        } catch {
          play[key] = null;
        }
      }
      await tools.play(false, { timeoutMs: 60_000 }).catch(() => undefined);
      playStarted = false;
      play.backInEdit = await waitFor(deps, async () => (await tools.luau('return "edit"', 'Edit', { timeoutMs: 10_000 }).catch(() => ({ ok: false }))).ok, { timeoutMs: 40_000 });
      settle();
      entry.note = `${play.errors ?? 'NOT ESTABLISHED'} errors, ${play.warnings ?? '?'} warnings, ${play.frames.filter((f) => f.file).length} of ${DEFAULTS.playFrames} frames${play.backInEdit ? '' : ', STUDIO DID NOT RETURN TO EDIT MODE'}${play.unestablished ? ` (${play.unestablished.join('; ')})` : ''}`;
    });
  } catch (e) {
    manifest.aborted = { step: e.step ?? timer.steps.at(-1)?.name ?? 'unknown', message: redact(e.message ?? String(e), secrets) };
  } finally {
    // A run that was started and not seen to end is stopped whatever went wrong, and the manifest says so.
    if (runLive) {
      // A stop the worker accepted and the run still not idle is not asked for again: the second wait would only hide the first record.
      if (stopAccepted) deps.log('[eval] the worker accepted a stop and the run is still not idle; not asking again. Stop it by hand.');
      else await stopRun(manifest.aborted ? `the harness stopped at ${manifest.aborted.step}: ${manifest.aborted.message}`.slice(0, 200) : 'the harness ended with the run still live');
      if (manifest.run && manifest.run.endedBy === null) manifest.run.endedBy = 'harness-stopped';
    }
    if (playStarted && tools) await tools.play(false, { timeoutMs: 60_000 }).catch(() => undefined);
    if (client) await client.close().catch(() => undefined);
    unlisten();
  }

  // ------------------------------------------------------------------------------------------------- spend after
  if (manifest.aborted?.step !== 'preflight' || manifest.spend.before) {
    manifest.spend.after = await deps.api.spend().then((s) => s?.state ?? null).catch(() => null);
  }

  // ------------------------------------------------------------------------------------------------- save
  const t1 = deps.now();
  manifest.harness.finishedAt = new Date(t1).toISOString();
  const timing = {
    startedAt: manifest.harness.startedAt,
    finishedAt: manifest.harness.finishedAt,
    totalMs: t1 - t0,
    agentRunMinutes: manifest.run?.minutes ?? null,
    steps: timer.steps,
  };
  const write = (name, content) => writeFileSync(join(pieceDir, name), content);
  write('request.txt', `${request.text}\n`);
  write('reply.md', out.reply);
  write('steps.json', JSON.stringify(out.steps, null, 1) + '\n');
  write('credits.json', JSON.stringify(credits, null, 1) + '\n');
  write('timing.json', JSON.stringify(timing, null, 1) + '\n');
  write('console.txt', out.console);
  for (const name of ['request.txt', 'reply.md', 'steps.json', 'credits.json', 'timing.json', 'console.txt', ...unique(shots)]) {
    const bytes = readFileSync(join(pieceDir, name));
    manifest.files[name] = { sha256: sha256(bytes), bytes: bytes.length };
  }
  write('manifest.json', JSON.stringify(manifest, null, 1) + '\n');
  return { pieceDir, manifest, timing, ok: manifest.aborted === null };
}

function quotaSnapshot(account) {
  const q = account?.quota ?? {};
  return {
    plan: q.plan ?? account?.billing?.plan ?? null,
    creditsRemaining: q.creditsRemaining ?? null,
    creditsUsedToday: q.creditsUsedToday ?? null,
    creditsUsedThisMonth: q.creditsUsedThisMonth ?? null,
    allowanceRemaining: q.allowanceRemaining ?? null,
    grantBalance: q.credits ?? null,
  };
}

// ---------------------------------------------------------------------------------------------------------------
export function defaultDeps(opts) {
  const env = loadHarnessEnv({ envFile: opts.envFile, apiBase: opts.apiBase, env: opts.env });
  return {
    now: () => Date.now(),
    sleep: sleepReal,
    log: (m) => console.error(m),
    adminKey: env.adminKey,
    api: makeAdminApi({ apiBase: env.apiBase, adminKey: env.adminKey }),
    openStudio: () => new StudioMcpClient().start(),
    // The rebuilt Studio agent (`--agent studio`): one fresh conversation per piece, reached with the test user's own session.
    studio: {
      session: (userId) => mintUserSession(userId, { managementToken: env.supabaseManagementToken }),
      run: (args) => runStudioRequest({ apiBase: env.apiBase, ...args }),
    },
    devSetPath: undefined,
    envFile: env.envFile,
  };
}

async function main() {
  let opts;
  try {
    opts = resolveOptions(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  if (opts.help) {
    console.error(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 14).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    return;
  }
  ignoreBrokenTerminal();
  const deps = defaultDeps(opts);
  deps.log(`[eval] project ${opts.projectId}, user ${opts.userId}, API ${deps.api.base}, admin key ${deps.adminKey ? 'present' : 'MISSING'}${deps.envFile ? ` (from ${deps.envFile})` : ''}`);
  try {
    if (opts.initBaseline) {
      const r = await initBaseline(opts, deps);
      console.log(JSON.stringify({ baseline: relative(process.cwd(), r.file), instances: r.instances, sha256: r.sha256, warnings: r.warnings }, null, 1));
      return;
    }
    const r = await runPiece(opts, deps);
    console.log(JSON.stringify({ piece: relative(process.cwd(), r.pieceDir), ok: r.ok, aborted: r.manifest.aborted, totalMs: r.timing.totalMs, steps: r.timing.steps.map((s) => ({ step: s.name, ms: s.ms, ok: s.ok, note: s.note })) }, null, 1));
    process.exitCode = r.ok ? 0 : 2;
  } catch (e) {
    console.error(`[eval] ${redact(e.message ?? String(e), [deps.adminKey])}`);
    process.exitCode = e instanceof Abort ? 2 : 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
