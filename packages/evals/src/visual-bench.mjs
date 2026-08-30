// Visual benchmark driver: runs REAL Golem agent builds against live Roblox Studio, renders the
// result through the plugin, critiques it, feeds the critique back, and records the score
// trajectory across correction rounds.
//
// This harness answers the only question that matters: can Golem take a scene from blockout to
// something that passes a quality gate on its own, without a human pointing at the defects? A gate
// that merely rejects bad scenes is worth nothing if nothing ever improves.
//
// It drives the production agent through the admin endpoints — same tools, same prompts, same
// quota, same budget — so what it measures is the product, not a mock.
//
// Usage:
//   node packages/evals/src/visual-bench.mjs --project <uuid> --task <id> [--rounds 4] [--out dir]
//   node packages/evals/src/visual-bench.mjs --project <uuid> --all
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');

function loadEnv() {
  const out = {};
  try {
    for (const line of readFileSync(join(REPO, '.env'), 'utf8').split('\n')) {
      if (!line.includes('=') || line.startsWith('#')) continue;
      const i = line.indexOf('=');
      out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  } catch {
    /* fall back to process.env */
  }
  return {
    apiBase: process.env.API_BASE ?? out.API_BASE,
    adminKey: process.env.ADMIN_KEY ?? process.env.GOLEM_ADMIN_KEY ?? out.GOLEM_ADMIN_KEY,
  };
}

/**
 * The benchmark ladder, deliberately increasing in difficulty: a single prop tests proportion and
 * detail; a stall tests material language; a plaza tests composition and landmark hierarchy; an
 * interior tests enclosed scale and lighting, which are the hardest to get right.
 */
export const BENCH_TASKS = [
  {
    id: 'b1-lamp-post',
    difficulty: 1,
    kind: 'prop',
    prompt:
      'Build a single ornate street lamp post in game.Workspace, standing on the baseplate. It should look like a real Victorian cast-iron lamp — base, fluted column, decorative collar, lantern housing with glass, and a finial. Make it look good.',
    expects: ['reads as cast iron, not a grey stick', 'a lantern head wider than the post', 'more than one material'],
  },
  {
    id: 'b2-market-stall',
    difficulty: 2,
    kind: 'shop',
    prompt:
      'Build a small medieval market stall in game.Workspace — a wooden stall with a striped canopy, a counter, crates and goods on display. Make it look good.',
    expects: ['a canopy that reads as fabric', 'goods that are distinguishable objects', 'wood that is not default grey plastic'],
  },
  {
    id: 'b3-plaza',
    difficulty: 3,
    kind: 'plaza',
    prompt:
      'Build a welcoming town plaza hub in game.Workspace: paved ground, a central monument as a landmark, lamp posts, benches, planters, and a sign. It should feel like somewhere a player wants to stand. Make it look good.',
    expects: ['paving that is not one flat slab', 'a landmark clearly taller than everything else', 'props at human scale', 'a lighting pass'],
  },
  {
    id: 'b4-interior',
    difficulty: 4,
    kind: 'interior',
    prompt:
      'Build a cosy tavern interior in game.Workspace: walls with a doorway and windows, a wooden floor, a bar counter with stools, tables and chairs, a fireplace, and warm interior lighting. Make it look good.',
    expects: ['walls enclosing a space at correct ceiling height', 'furniture at human scale', 'warm lighting, not default daylight', 'trim or skirting'],
  },
];

class BenchError extends Error {}

function makeClient({ apiBase, adminKey, projectId, fetchImpl = fetch }) {
  if (!apiBase || !adminKey) throw new BenchError('API_BASE and ADMIN_KEY are required');
  const base = apiBase.replace(/\/+$/, '');
  const H = { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey };
  const call = async (path, init = {}) => {
    const res = await fetchImpl(base + path, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
    const text = await res.text();
    try {
      return { status: res.status, body: JSON.parse(text) };
    } catch {
      throw new BenchError(`non-JSON from ${path} (HTTP ${res.status}): ${text.slice(0, 200)}`);
    }
  };
  return {
    studioOp: (op, timeoutMs = 60_000) =>
      call(`/api/admin/studio-op/${projectId}`, { method: 'POST', body: JSON.stringify({ op, timeoutMs }) }).then((r) => r.body),
    startRun: (text, mode = 'stone', effort) =>
      call(`/api/admin/agent-run/${projectId}`, { method: 'POST', body: JSON.stringify({ text, mode, effort }) }).then((r) => r.body),
    info: () => call(`/api/admin/session-info/${projectId}`).then((r) => r.body),
    critique: (payload) => call('/api/admin/critique', { method: 'POST', body: JSON.stringify(payload) }).then((r) => r.body),
    // Benchmark-only. One quality-gated build costs more Sparks than a day's free allowance, so a
    // four-task ladder cannot complete without this. It clears usage accounting for the benchmark
    // account only; the global neuron ledger and every hard spend cap are untouched, and the real
    // cost of the run is still read back from the ledger afterwards.
    resetQuota: (userId) => call('/api/admin/quota-reset', { method: 'POST', body: JSON.stringify({ userId }) }).then((r) => r.body),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wait for the agent to go idle, with a hard ceiling so a wedged run cannot hang the suite. */
async function waitIdle(client, { pollMs = 3000, maxMs = 600_000 } = {}) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    await sleep(pollMs);
    const info = await client.info();
    if (info.agentStatus !== 'running') return info;
  }
  throw new BenchError(`agent still running after ${Math.round(maxMs / 1000)}s`);
}

// ---------------------------------------------------------------------------
// scene measurement — structural truth, independent of any model's opinion
// ---------------------------------------------------------------------------

const MEASURE_LUAU = `
local n, small, unanchored, scripts = 0, 0, 0, 0
local mats, cols = {}, {}
local minY, maxY = math.huge, -math.huge
for _, d in workspace:GetDescendants() do
  if d:IsA("BasePart") and d.Size.X < 600 and d.Size.Z < 600 and d.Transparency < 0.95 then
    n += 1
    if d.Size.X * d.Size.Y * d.Size.Z < 8 then small += 1 end
    if not d.Anchored then unanchored += 1 end
    local m = tostring(d.Material):gsub("Enum%.Material%.", "")
    mats[m] = (mats[m] or 0) + 1
    cols[math.floor(d.Color.R*15)*256 + math.floor(d.Color.G*15)*16 + math.floor(d.Color.B*15)] = true
    minY = math.min(minY, d.Position.Y - d.Size.Y/2)
    maxY = math.max(maxY, d.Position.Y + d.Size.Y/2)
  elseif d:IsA("LuaSourceContainer") then
    scripts += 1
  end
end
local lights = 0
for _, d in workspace:GetDescendants() do if d:IsA("Light") then lights += 1 end end
local L = game:GetService("Lighting")
local effects = {}
for _, c in L:GetChildren() do
  if c:IsA("Atmosphere") or c:IsA("PostEffect") or c:IsA("Sky") then table.insert(effects, c.ClassName) end
end
local ml = {}
for k, v in mats do table.insert(ml, k .. ":" .. v) end
local nc = 0
for _ in cols do nc += 1 end
return table.concat({
  "parts=" .. n, "small=" .. small, "unanchored=" .. unanchored, "scripts=" .. scripts,
  "materials=" .. table.concat(ml, "|"), "colours=" .. nc, "lights=" .. lights,
  "heightSpan=" .. string.format("%.1f", (n > 0 and (maxY - minY) or 0)),
  "brightness=" .. string.format("%.2f", L.Brightness),
  "clockTime=" .. string.format("%.2f", L.ClockTime),
  "effects=" .. table.concat(effects, "|"),
}, " ")
`;

/** Parse the flat key=value line the measurement returns into a structured record. */
export function parseMeasurement(line) {
  const out = {};
  for (const tok of String(line ?? '').split(' ')) {
    const i = tok.indexOf('=');
    if (i < 0) continue;
    const k = tok.slice(0, i);
    const v = tok.slice(i + 1);
    if (k === 'materials') {
      out.materials = v
        ? v.split('|').map((p) => {
            const [material, parts] = p.split(':');
            return { material, parts: Number(parts) };
          })
        : [];
    } else if (k === 'effects') {
      out.effects = v ? v.split('|') : [];
    } else {
      out[k] = Number.isNaN(Number(v)) ? v : Number(v);
    }
  }
  return out;
}

async function measure(client) {
  const r = await client.studioOp({ op: 'run_code', code: MEASURE_LUAU }, 45_000);
  return parseMeasurement(r?.data?.result?.v ?? r?.data?.result ?? '');
}

/** Reset to a known baseline so every round-1 score is comparable across runs. */
async function clearWorkspace(client) {
  await client.studioOp(
    {
      op: 'run_code',
      code: `
local keep = {Terrain=true, Camera=true, Baseplate=true, SpawnLocation=true}
local n = 0
for _, c in workspace:GetChildren() do
  if not keep[c.Name] then c:Destroy(); n += 1 end
end
local L = game:GetService("Lighting")
L.Brightness = 3; L.ClockTime = 14.5
L.Ambient = Color3.fromRGB(70,70,70); L.OutdoorAmbient = Color3.fromRGB(70,70,70)
L.ExposureCompensation = 0
return "cleared " .. n`,
    },
    45_000,
  );
}

/**
 * Run one build task through up to `rounds` correction rounds.
 *
 * Round 1 is the raw build request. Every later round hands the agent its OWN critique — the same
 * text `inspect_visually` produces — which is otherwise what a human would have to do by hand. The
 * benchmark exists to show that trajectory, so each round's score is recorded.
 */
export async function runTask({ client, task, rounds = 4, outDir, passScore = 7, resetQuotaFor = null, onEvent = () => {} }) {
  const history = [];
  // A previous task's agent may still be finishing. Starting on top of it is refused with
  // "a run is already in progress", which silently wrecked a whole ladder run before this wait
  // existed — every task reported an error that had nothing to do with the scene.
  await waitIdle(client, { pollMs: 2000, maxMs: 300_000 }).catch(() => {});
  if (resetQuotaFor) await client.resetQuota(resetQuotaFor).catch(() => {});
  await clearWorkspace(client);

  let message = task.prompt;
  for (let round = 1; round <= rounds; round++) {
    onEvent({ type: 'round_start', round, task: task.id });
    const started = Date.now();
    let start = await client.startRun(message, 'stone');
    if (!start.ok && /already in progress/i.test(String(start.error ?? ''))) {
      await waitIdle(client, { pollMs: 2000, maxMs: 300_000 }).catch(() => {});
      start = await client.startRun(message, 'stone');
    }
    if (!start.ok) {
      history.push({ round, error: start.error ?? 'run refused' });
      break;
    }
    await waitIdle(client);
    const runMs = Date.now() - started;

    const metrics = await measure(client);
    const render = await client.studioOp({ op: 'render_view', view: 'all' }, 120_000);
    const data = render?.data;
    if (!data || data.error || !data.views?.length) {
      history.push({ round, runMs, metrics, error: data?.error ?? render?.error ?? 'render failed' });
      break;
    }

    const critique = await client.critique({
      subject: data.subject,
      boundsSize: data.boundsSize,
      views: data.views,
      lighting: data.lighting,
      intent: task.prompt,
      passThreshold: passScore,
    });

    const entry = {
      round,
      runMs,
      metrics,
      boundsSize: data.boundsSize,
      score: critique.score,
      passed: critique.passed,
      unavailable: !!critique.unavailable,
      summary: critique.summary,
      hardFails: critique.hardFails ?? [],
      defects: critique.defects ?? [],
      neurons: critique.neurons,
    };
    history.push(entry);
    onEvent({ type: 'round_end', ...entry });

    if (outDir) {
      const dir = join(outDir, task.id, `round-${round}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'result.json'), JSON.stringify({ task: task.id, ...entry }, null, 1));
      // Views are stored WITHOUT pixel payloads: five 288x180 frames is ~1 MB of base64, and the
      // metrics plus the critique are what a regression actually compares.
      writeFileSync(
        join(dir, 'views.json'),
        JSON.stringify(
          { subject: data.subject, boundsSize: data.boundsSize, lighting: data.lighting, views: data.views.map((v) => ({ name: v.name, meta: v.meta })) },
          null,
          1,
        ),
      );
    }

    if (critique.passed) break;
    if (critique.unavailable) break; // a tooling fault is not a reason to keep spending
    // The critique endpoint returns {error, reason} when the budget refuses. That shape has no
    // score and no arrays, and reading them threw here — losing a completed 725-part build.
    if (typeof entry.score !== 'number') {
      history[history.length - 1].error = critique.error ?? 'critique returned no score';
      break;
    }

    // Hand the agent its own critique. This is the correction round.
    const defectText = (critique.defects ?? [])
      .filter((d) => d.severity !== 'minor')
      .map((d) => `- [${d.dimension}] ${d.observed} -> ${d.fix}`)
      .join('\n');
    message =
      `You already built this, and a visual review of the actual render scored it ${critique.score}/10, which fails.\n\n` +
      `${critique.summary}\n\n` +
      (entry.hardFails.length ? `Measured failures: ${entry.hardFails.join('; ')}\n\n` : '') +
      (defectText ? `Defects found in the render:\n${defectText}\n\n` : '') +
      `Fix these in the existing build — do not start over and do not delete what is already good. ` +
      `When you are done, call inspect_visually to check your own work before replying.`;
  }

  return {
    task: task.id,
    difficulty: task.difficulty,
    rounds: history,
    best: bestScore(history),
    passed: history.some((h) => h.passed),
  };
}

export function bestScore(history) {
  const scores = history.map((h) => h.score).filter((s) => typeof s === 'number');
  return scores.length ? Math.max(...scores) : null;
}

/** Compact trajectory line for a report: "2 -> 4 -> 6 -> 7 (PASS)". */
export function trajectory(result) {
  const s = result.rounds.map((r) => (typeof r.score === 'number' ? r.score : r.error ? 'ERR' : '?')).join(' -> ');
  return `${s}${result.passed ? '  (PASS)' : '  (fail)'}`;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const a = {
    project: null,
    task: null,
    all: false,
    rounds: 4,
    out: join(REPO, 'packages/evals/tasks-visual/regression/bench'),
    pass: 7,
    resetQuota: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--project') a.project = argv[++i];
    else if (k === '--task') a.task = argv[++i];
    else if (k === '--all') a.all = true;
    else if (k === '--rounds') a.rounds = Number(argv[++i]);
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--pass') a.pass = Number(argv[++i]);
    else if (k === '--reset-quota') a.resetQuota = argv[++i];
    else if (k === '--help') a.help = true;
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.project) {
    console.log('usage: visual-bench.mjs --project <uuid> (--task <id> | --all) [--rounds 4] [--pass 7] [--out dir]');
    console.log('tasks: ' + BENCH_TASKS.map((t) => t.id).join(', '));
    process.exit(args.help ? 0 : 1);
  }
  const { apiBase, adminKey } = loadEnv();
  const client = makeClient({ apiBase, adminKey, projectId: args.project });

  const info = await client.info();
  if (!info.pluginConnected) {
    console.error('Roblox Studio is not connected to this project — open the Golem plugin and connect first.');
    process.exit(2);
  }

  const tasks = args.all ? BENCH_TASKS : BENCH_TASKS.filter((t) => t.id === args.task);
  if (!tasks.length) {
    console.error(`unknown task "${args.task}"; known: ${BENCH_TASKS.map((t) => t.id).join(', ')}`);
    process.exit(2);
  }

  const results = [];
  for (const task of tasks) {
    console.log(`\n===== ${task.id} (difficulty ${task.difficulty}) =====`);
    const r = await runTask({
      client,
      task,
      rounds: args.rounds,
      outDir: args.out,
      passScore: args.pass,
      resetQuotaFor: args.resetQuota,
      onEvent: (e) => {
        if (e.type === 'round_start') process.stdout.write(`  round ${e.round}: building… `);
        if (e.type === 'round_end') {
          console.log(
            `${Math.round(e.runMs / 1000)}s  score=${e.unavailable ? 'n/a' : e.score}  parts=${e.metrics.parts} mats=${(e.metrics.materials ?? []).length} lights=${e.metrics.lights}` +
              (e.hardFails.length ? `  hardFails=${e.hardFails.length}` : ''),
          );
          if (e.summary) console.log(`    ${e.summary.slice(0, 160)}`);
        }
      },
    });
    results.push(r);
    console.log(`  trajectory: ${trajectory(r)}`);
  }

  if (args.out) {
    mkdirSync(args.out, { recursive: true });
    const path = join(args.out, 'summary.json');
    const prior = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
    writeFileSync(path, JSON.stringify([...prior, { results }], null, 1));
    console.log(`\nwritten to ${path}`);
  }

  console.log('\n=== SUMMARY ===');
  for (const r of results) console.log(`${r.task.padEnd(18)} best=${r.best ?? 'n/a'}  ${trajectory(r)}`);
  console.log(`${results.filter((r) => r.passed).length}/${results.length} tasks reached the quality gate`);
}

if (process.argv[1]?.endsWith('visual-bench.mjs')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
