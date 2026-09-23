// The Apple Test Lab (מעבדת בדיקות): every real gauntlet test of Apple, one card per round and test.
//
// Two sources, joined by round number:
//   - the repo: docs/gauntlet/visual/rounds/round-N[-test]-compare.jpg (the side-by-side the owner
//     saw), the tester's own shots beside them, the references and the "what same means" criteria in
//     GAUNTLET.md, and the CUSTOMER_FINDINGS lines that name the round;
//   - the worker's admin API (read-only GETs, X-Admin-Key): the build log, the model-call log, and the
//     stored session messages of every project named "Gauntlet Round N" — the prompt, the model, the
//     tool trace, credits, tokens, the self-critique and the playtest verdict.
// Only projects named "Gauntlet…" are read, so no customer's conversation reaches this page.
//
// A field nothing records stays null and the page says "לא נרשם בריצה הזאת". The tool labels are the
// site's own (apps/web/.../tool-vocabulary.ts, execution-model.ts), read from the source, so a replay
// says exactly what the workspace said. testsAction only answers { op:'rerun' } and only ever with a
// dry-run plan: this module never starts a run and never calls a paid provider.
import fs from 'node:fs';
import path from 'node:path';
import { fetchJson, cached, section, run as exec, REPO } from '../http.mjs';
import { WORKER_URL } from './cloudflare.mjs';

const LABEL = 'Apple';
const VISUAL = 'docs/gauntlet/visual';
const ROUNDS_DIR = `${VISUAL}/rounds`;
const WS = 'apps/web/src/components/ws';
// Cloudflare bills Workers AI at $0.011 per 1,000 neurons (apps/worker/src/pricing.ts USD_PER_NEURON).
export const USD_PER_NEURON = 0.011 / 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const arr = (x) => (Array.isArray(x) ? x : []);
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const str = (x, n = 400) => (typeof x === 'string' && x ? (x.length > n ? `${x.slice(0, n - 1)}…` : x) : null);
const read = (rel) => { try { return fs.readFileSync(path.join(REPO, rel), 'utf8'); } catch { return ''; } };

export const TEST_LABEL = { map: 'מבחן המפה', models: 'מבחן המודלים', ui: 'מבחן ה-UI', other: 'Grow a Garden (ארכיון)' };
const MODEL_LABEL = { 'apple-max': 'Apple MAX', apple: 'Apple' };

// ---------------------------------------------------------------- the site's vocabulary ---
/** tool-vocabulary.ts → { tools: {name:{kind,label}}, kinds: {kind:label} }. */
export function parseVocab(text) {
  const tools = {}; const kinds = {};
  for (const m of String(text).matchAll(/^\s+(\w+): \{ kind: '(\w+)', label: (['"])(.*?)\3 \}/gm)) tools[m[1]] = { kind: m[2], label: m[4] };
  for (const m of String(text).matchAll(/^\s+(\w+): \{ canonical: [^,]+, label: (['"])(.*?)\2 \}/gm)) kinds[m[1]] = m[3];
  return { tools, kinds };
}
/** execution-model.ts PRESENT_VERBS → [[pastVerb, presentVerb]]. */
export function parseVerbs(text) {
  return [...String(text).matchAll(/\[\/\^(.+?)\\b\/, '([^']+)'\]/g)].map((m) => [m[1], m[2]]);
}
/** The site's presentTense(): every coordinated verb moves, not only the first. */
export function presentTense(label, verbs) {
  const lead = (s) => { for (const [p, r] of verbs) if (s === p || s.startsWith(`${p} `)) return r + s.slice(p.length); return s; };
  return String(label).split(/(, | and | or )/).map((part, i) => {
    if (i === 0) return lead(part);
    if (i % 2 === 1 || !part) return part;
    const moved = lead(part[0].toUpperCase() + part.slice(1));
    return moved === part[0].toUpperCase() + part.slice(1) ? part : moved[0].toLowerCase() + moved.slice(1);
  }).join('');
}

// ------------------------------------------------------------------------- GAUNTLET.md ---
/** The three simulator tests (refs + "what same means") and the archived Grow-a-Garden bar. */
export function parseGauntlet(text) {
  const tests = {};
  for (const line of String(text).split('\n')) {
    const m = line.match(/^\|\s*\*\*\d+\.\s*[^*]+\*\*\s*\(`--test (\w+)`\)\s*\|(.*)\|(.*)\|\s*$/);
    if (!m) continue;
    const refs = [...m[2].matchAll(/`([^`]+\.(?:png|jpe?g|webp))`/g)].map((x) => `${VISUAL}/refs/simulator/${x[1]}`);
    const same = m[3].trim().replace(/^[^:,]{0,40}:\s*/, '');
    tests[m[1]] = { refs, criteria: same.split(/,\s*/).map((s) => s.trim()).filter(Boolean), same: m[3].trim() };
  }
  // The archive: its reference table (minus our own round-1 shot) and the round-1 skill table.
  const archRefs = []; let ours1 = null; const skills = [];
  for (const line of String(text).split('\n')) {
    const r = line.match(/^\|\s*`([^`/]+\.(?:png|jpe?g|webp))`\s*\|(.*)\|\s*$/);
    if (r) { if (/\*\*ours, round 1\*\*/.test(r[2])) ours1 = `${VISUAL}/refs/${r[1]}`; else archRefs.push(`${VISUAL}/refs/${r[1]}`); }
    const s = line.match(/^\|[^|`]+\|\s*\*\*([^*]+)\*\*/);
    if (s) skills.push(s[1].trim());
  }
  tests.other = { refs: archRefs, criteria: skills, same: null };
  const prompt = (re) => { const m = String(text).match(re); return m ? m[1].trim() : null; };
  return {
    tests,
    ours1,
    prompts: {
      simulator: prompt(/## CURRENT TARGET[\s\S]*?### The customer prompt[^\n]*\n+>\s*([^\n]+)/),
      garden: prompt(/# Archive[\s\S]*?## The customer prompt[^\n]*\n+>\s*([^\n]+)/),
    },
  };
}

/** rounds/ file names → { N: { compares: {test: path}, shots: [path] } }. */
export function scanRounds(files) {
  const out = {};
  for (const f of files) {
    const m = f.match(/^round-(\d+)(?:-([a-z0-9-]+))?\.(png|jpe?g|webp)$/i);
    if (!m) continue;
    const r = (out[m[1]] ||= { compares: {}, shots: [] });
    const c = (m[2] || '').match(/^(?:(map|models|ui)-)?compare$/);
    if (c) r.compares[c[1] || 'other'] = `${ROUNDS_DIR}/${f}`;
    else r.shots.push(`${ROUNDS_DIR}/${f}`);
  }
  return out;
}

/** CUSTOMER_FINDINGS lines that name "round N". */
export function findingsFor(text, round) {
  const re = new RegExp(`\\bround[\\s-]?${round}\\b`, 'i');
  return String(text).split('\n').map((l) => l.match(/^- \[(\w+)\]\[(\w+)\] (F-\d+): (.*)$/)).filter((m) => m && re.test(m[4]))
    .map((m) => ({ id: m[3], status: m[1], severity: m[2], text: str(m[4].split(/ — (?:evidence|closed)\b/)[0], 320) }));
}

// ----------------------------------------------------------------------- the tool trace ---
/** What the lab can say came back from a step, from the detail the worker kept. */
function infoOf(tool, d) {
  if (!d || typeof d !== 'object') return null;
  if (tool === 'install_module') return str(d.installed && `${d.installed}${d.at ? ` → ${d.at}` : ''}`);
  if (tool === 'get_genre_kit') return str(d.genre && `${d.genre}${d.pitch ? ` — ${d.pitch}` : ''}`, 200);
  if (tool === 'get_ui_construction') return str(d.id && `${d.id}${d.kind ? ` (${d.kind})` : ''}`);
  if (tool === 'find_mechanic') return str(arr(d.mechanics).map((m) => m.mechanic).filter(Boolean).join('; '), 240);
  if (tool === 'create_checkpoint') return str(d.label);
  if (tool === 'propose_plan') return str(planOf(d)?.title);
  if (tool === 'audit_build') return str(arr(d.blocks).find((b) => b.type === 'callout')?.title);
  if (tool === 'inspect_visually' && d.critique) return `Visual score ${d.critique.score}/10 — ${d.critique.passed ? 'passes' : 'fails'} the quality gate`;
  if (tool === 'play_check') return str(d.verdict);
  if (tool === 'search_docs') { const n = docsOf(d).length; return n ? `${n} results` : null; }
  return null;
}
const planOf = (d) => {
  const b = arr(d?.blocks).find((x) => x.type === 'build_plan');
  return b ? { title: str(b.title, 200), steps: arr(b.steps).slice(0, 30).map((s) => ({ title: str(s.title, 200), detail: str(s.detail, 300), tool: str(s.tool, 60) })) } : null;
};
const docsOf = (d) => arr(Array.isArray(d) ? d : d?.results).map((x) => ({ title: str(x.title, 200), url: str(x.url, 300), citation: str(x.citation, 80) })).filter((x) => x.title || x.url);

/** One toolTrace entry → a row the replay draws: the site's label, what it was on, what came back. */
export function traceRow(e, vocab, verbs) {
  const v = vocab.tools[e.tool];
  const title = v?.label || String(e.tool || 'A step with no reported name').replace(/_/g, ' ');
  const rest = String(e.summary || '').replace(/^[✓✗]\s*\S+\s*/, '');
  const target = rest.startsWith('·') ? str(rest.slice(1).trim(), 200) : null;
  const reason = rest.startsWith('—') ? str(rest.slice(1).trim(), 400) : null;
  return {
    tool: str(e.tool, 60), title, running: presentTense(title, verbs), kind: v?.kind || 'working',
    ok: e.ok !== false, ms: num(e.durationMs), target, result: reason || infoOf(e.tool, e.detail),
  };
}

/** Everything the lab shows about one run, from its user + assistant messages, build event and calls. */
export function runOf({ user, reply, build, calls, project }, vocab, verbs) {
  const trace = arr(reply.toolTrace);
  const find = (t) => trace.filter((e) => e.tool === t && e.detail);
  const iv = find('inspect_visually').at(-1)?.detail;
  const audit = find('audit_build').at(-1)?.detail;
  const play = find('play_check').at(-1)?.detail;
  const knowledge = trace.filter((e) => ['searching_knowledge'].includes(vocab.tools[e.tool]?.kind) || ['get_genre_kit', 'install_module'].includes(e.tool))
    .map((e) => ({ tool: e.tool, title: vocab.tools[e.tool]?.label || e.tool, what: infoOf(e.tool, e.detail), ok: e.ok !== false }));
  const shots = [];
  for (const e of find('inspect_visually')) for (const vw of arr(e.detail.render?.views)) {
    const u = vw.pngDataUrl;
    if (typeof u === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(u) && u.length < 400_000) shots.push({ src: u, label: `Apple · inspect_visually · ${str(vw.name, 40) || 'view'}` });
  }
  const usage = calls.length ? {
    calls: calls.length,
    failed: calls.filter((c) => c.outcome && c.outcome !== 'ok').length,
    inputTokens: calls.reduce((s, c) => s + (num(c.inputTokens) || 0), 0),
    outputTokens: calls.reduce((s, c) => s + (num(c.outputTokens) || 0), 0),
    cachedInputTokens: calls.reduce((s, c) => s + (num(c.cachedInputTokens) || 0), 0),
    neurons: calls.reduce((s, c) => s + (num(c.neurons) || 0), 0),
    latencyMs: calls.reduce((s, c) => s + (num(c.latencyMs) || 0), 0),
    models: [...new Set(calls.map((c) => c.model).filter(Boolean))],
    errorKinds: [...new Set(calls.map((c) => c.errorKind).filter(Boolean))],
  } : null;
  const neurons = num(build?.neurons) ?? usage?.neurons ?? null;
  return {
    runId: reply.id, projectId: project.id, projectName: str(project.name, 120),
    prompt: typeof user?.content === 'string' ? user.content : null,
    productModel: str(reply.productModel, 40), model: MODEL_LABEL[reply.productModel] || str(reply.productModel, 40), modelSource: reply.productModel ? 'worker' : null,
    mode: str(reply.mode, 20),
    startedAt: user?.createdAt || null, endedAt: num(build?.at) ? new Date(build.at).toISOString() : reply.createdAt || null,
    durationMs: num(build?.durationMs), steps: num(build?.steps), opsApplied: num(build?.opsApplied), opsFailed: num(build?.opsFailed),
    outcome: str(build?.outcome, 40), finishReason: str(build?.finishReason, 60), stopReason: str(reply.stopReason, 60), error: str(reply.error, 400),
    credits: num(reply.creditsSpent), neurons, usd: neurons != null ? neurons * USD_PER_NEURON : null, usage,
    context: reply.context && typeof reply.context === 'object' ? { usedChars: num(reply.context.usedChars), maxChars: num(reply.context.maxChars),
      droppedGroups: num(reply.context.dropped?.groups), droppedChars: num(reply.context.dropped?.chars) } : null,
    deniedTools: arr(reply.deniedTools).map((x) => str(typeof x === 'string' ? x : x?.tool, 60)).filter(Boolean),
    reply: str(reply.content, 4000),
    trace: trace.map((e) => traceRow(e, vocab, verbs)),
    plan: planOf(find('propose_plan')[0]?.detail),
    knowledge,
    docs: find('search_docs').flatMap((e) => docsOf(e.detail)).slice(0, 40),
    skills: null, // the worker keeps the skill cards it chose only until the next run (agent.skillCardsShown)
    thinking: null, // reasoning_content is dropped by the provider adapter; nothing crosses the wire
    critique: iv?.critique ? { score: num(iv.critique.score), of: 10, passed: iv.critique.passed === true, summary: str(iv.critique.summary, 800),
      defects: arr(iv.critique.defects).slice(0, 12).map((x) => ({ dimension: str(x.dimension, 40), severity: str(x.severity, 20), observed: str(x.observed, 500), fix: str(x.fix, 500) })) } : null,
    audit: audit ? {
      callout: (() => { const c = arr(audit.blocks).find((b) => b.type === 'callout'); return c ? { tone: str(c.tone, 10), title: str(c.title, 200), text: str(c.text, 600) } : null; })(),
      defects: arr(arr(audit.blocks).find((b) => b.type === 'table')?.rows).slice(0, 12).map((r) => ({ severity: str(r[0], 20), subject: str(r[1], 60), measured: str(r[2], 400), fix: str(r[3], 400) })),
    } : null,
    play: play ? { verdict: str(play.verdict, 60), playerSees: str(play.playerSees, 1200), clientErrors: arr(play.clientErrors).map((x) => str(x, 300)).slice(0, 12),
      serverErrors: arr(play.serverErrors).map((x) => str(x, 300)).slice(0, 12), warnings: num(play.warnings), leaderstats: str(play.leaderstats, 200), note: str(play.note, 400) } : null,
    appleShots: shots.slice(0, 6),
  };
}

// ----------------------------------------------------------------------- cards and deltas ---
// Recorded measures a later round can be compared on. better: which direction is an improvement.
export const MEASURES = [
  { key: 'selfScore', label: 'ציון הבדיקה החזותית של Apple', better: 'up' },
  { key: 'opsApplied', label: 'שינויים שהוחלו', better: 'up' },
  { key: 'opsFailed', label: 'שינויים שנכשלו', better: 'down' },
  { key: 'toolErrors', label: 'כלים שנכשלו', better: 'down' },
  { key: 'playErrors', label: 'שגיאות בבדיקת המשחק', better: 'down' },
];
export function measuresOf(run) {
  if (!run) return {};
  return {
    selfScore: run.critique?.score ?? null,
    opsApplied: run.opsApplied, opsFailed: run.opsFailed,
    toolErrors: run.trace ? run.trace.filter((t) => !t.ok).length : null,
    playErrors: run.play ? run.play.clientErrors.length + run.play.serverErrors.length : null,
  };
}
/** a (later) against b (earlier) on every measure both recorded. */
export function deltaOf(a, b) {
  const items = [];
  for (const m of MEASURES) {
    const x = a[m.key]; const y = b[m.key];
    if (x == null || y == null) continue;
    const dir = x === y ? 'same' : (x > y) === (m.better === 'up') ? 'better' : 'worse';
    items.push({ key: m.key, label: m.label, now: x, before: y, dir });
  }
  const n = (d) => items.filter((i) => i.dir === d).length;
  return { items, better: n('better'), worse: n('worse'), same: n('same') };
}

/** One card per round and test, newest first, each against the previous round of the same test. */
export function cardsOf(rounds) {
  const cards = [];
  for (const r of [...rounds].sort((a, b) => a.round - b.round)) {
    const tests = Object.keys(r.compares).length ? Object.keys(r.compares) : [r.test || 'other'];
    for (const test of tests) {
      const prev = [...cards].reverse().find((c) => c.test === test);
      const m = measuresOf(r.run);
      const d = prev ? { vs: prev.id, vsRound: prev.round, ...deltaOf(m, prev.measures) } : null;
      cards.push({ id: `r${r.round}-${test}`, round: r.round, test, compare: r.compares[test] || null, measures: m, delta: d, score: null });
    }
  }
  return cards.map(({ measures, ...c }) => ({ ...c, measures })).reverse();
}

// ------------------------------------------------------------------------------- sources ---
async function readDocs() {
  const g = parseGauntlet(read(`${VISUAL}/GAUNTLET.md`));
  let files = []; try { files = fs.readdirSync(path.join(REPO, ROUNDS_DIR)); } catch { /* no rounds yet */ }
  const scanned = scanRounds(files);
  const findingsText = read('docs/autonomy/CUSTOMER_FINDINGS.md');
  const rounds = await Promise.all(Object.entries(scanned).map(async ([n, r]) => {
    const round = Number(n);
    const first = Object.values(r.compares)[0] || r.shots[0];
    let date = null;
    try { date = String(await exec('git', ['log', '--diff-filter=A', '--format=%cI', '-1', '--', first])).trim() || null; } catch { /* not committed */ }
    if (!date) try { date = fs.statSync(path.join(REPO, first)).mtime.toISOString(); } catch { /* gone */ }
    const shots = [...r.shots];
    if (round === 1 && g.ours1) shots.unshift(g.ours1);
    return { round, compares: r.compares, shots, evidenceAt: date, findings: findingsFor(findingsText, round) };
  }));
  return { gauntlet: g, rounds, findingsText };
}

const base = () => (process.env.API_BASE || WORKER_URL).replace(/\/+$/, '');
const get = (p, what) => fetchJson(`${base()}${p}`, { label: LABEL, what, headers: { 'x-admin-key': process.env.GOLEM_ADMIN_KEY } });

async function readWorker(vocab, verbs) {
  if (!process.env.GOLEM_ADMIN_KEY) throw Object.assign(new Error('no key'), { reason: 'חסר GOLEM_ADMIN_KEY בקובץ ‎.env, אז אין נתוני ריצה מה-worker' });
  const [builds, calls] = await Promise.all([
    get('/api/admin/logs?kind=build&days=30&limit=2000', 'יומן הבנייה'),
    get('/api/admin/logs?kind=model_call&days=30&limit=2000', 'יומן הקריאות למודל'),
  ]);
  const bEv = arr(builds?.events); const cEv = arr(calls?.events);
  const ids = [...new Set(bEv.map((e) => e.projectId).filter((x) => UUID.test(String(x))))];
  const runs = [];
  await Promise.all(ids.map(async (id) => {
    const info = await get(`/api/admin/session-info/${id}`, 'פרטי הפרויקט').catch(() => null);
    const name = String(info?.project?.name || '');
    const round = name.match(/gauntlet\s*round\s*(\d+)/i);
    if (!round) return;
    const msgs = arr((await get(`/api/admin/session-messages/${id}?limit=100`, 'הודעות הפרויקט'))?.messages);
    // The LAST assistant turn with a trace is the round's run; the user turn before it is its prompt.
    const i = msgs.findLastIndex((m) => m.role === 'assistant' && arr(m.toolTrace).length);
    if (i < 0) return;
    const reply = msgs[i]; const user = msgs.slice(0, i).findLast((m) => m.role === 'user');
    const run = runOf({ user, reply, build: bEv.find((e) => e.runId === reply.id), calls: cEv.filter((c) => c.runId === reply.id), project: { id, name } }, vocab, verbs);
    runs.push({ round: Number(round[1]), run });
  }));
  return { runs, retainedBuilds: bEv.length };
}

async function build() {
  const vocab = parseVocab(read(`${WS}/tool-vocabulary.ts`));
  const verbs = parseVerbs(read(`${WS}/execution-model.ts`));
  const [docs, worker] = await Promise.all([readDocs(), section(() => readWorker(vocab, verbs))]);
  const byRound = new Map(docs.rounds.map((r) => [r.round, { ...r, run: null }]));
  for (const { round, run } of worker.value?.runs || []) {
    const r = byRound.get(round) || { round, compares: {}, shots: [], evidenceAt: null, findings: findingsFor(docs.findingsText, round) };
    byRound.set(round, { ...r, run });
  }
  const rounds = [...byRound.values()].sort((a, b) => b.round - a.round).map((r) => {
    const sim = Object.keys(r.compares).some((t) => t !== 'other');
    const promptFromDocs = sim ? docs.gauntlet.prompts.simulator : docs.gauntlet.prompts.garden;
    return {
      ...r,
      // Before a worker record exists, the prompt and model are the protocol's, and say so.
      prompt: r.run?.prompt ?? null, protocolPrompt: promptFromDocs, protocolModel: 'Apple MAX',
      date: r.run?.startedAt || r.evidenceAt, dateSource: r.run?.startedAt ? 'worker' : r.evidenceAt ? 'repo' : null,
    };
  });
  return {
    rounds,
    cards: cardsOf(rounds),
    tests: Object.fromEntries(Object.entries(docs.gauntlet.tests).map(([k, v]) => [k, { ...v, label: TEST_LABEL[k] || k }])),
    kinds: vocab.kinds,
    worker: worker.error ? { ok: false, reason: worker.error } : { ok: true, runs: worker.value.runs.length, retainedBuilds: worker.value.retainedBuilds },
    scoreSource: null, // no hardness score is recorded anywhere yet; the page says so instead of inventing one
  };
}

export function tests() { return cached('tests', build, 5 * 60_000); }

/** { op:'rerun', id } → always the dry-run plan of the exact call; the run itself is never started here. */
export async function testsAction(body = {}) {
  if (body.op !== 'rerun') return { ok: false, reason: 'פעולה לא מוכרת במעבדת הבדיקות' };
  const data = await tests();
  const r = arr(data.rounds).find((x) => `r${x.round}` === String(body.id || '').split('-')[0]);
  if (!r) return { ok: false, reason: 'הריצה הזו לא נמצאה' };
  const prompt = r.prompt || r.protocolPrompt;
  if (!prompt) return { ok: false, reason: 'לא נרשם פרומפט לריצה הזו, אז אין מה להריץ מחדש' };
  return {
    dryRun: true,
    plan: {
      method: 'POST',
      url: `${base()}/api/admin/agent-run/<project-id של Baseplate חדש>`,
      body: { text: prompt, mode: 'agent', autonomous: true, productModel: r.run?.productModel || 'apple-max' },
      note: 'מעבדת הבדיקות לא מריצה את Apple: ריצה אמיתית עולה קרדיטים ומחייבת Studio מחובר עם Baseplate ריק. זו הקריאה המדויקת להפעלה ידנית, לפי הפרוטוקול ב-docs/gauntlet/visual/GAUNTLET.md.',
    },
  };
}
