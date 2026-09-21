// End-to-end smoke test against the DEPLOYED worker.
//
// Exercises the real production stack with a real account over a real
// WebSocket: auth, project open, quota, the agent loop, the live event stream,
// the new run_intent contract, and reconnect/replay.
//
// What it deliberately does NOT do: mutate anybody's Roblox place. The
// Studio-dependent paths (pairing, build, checkpoint, restore, playtest) need a
// paired plugin; this script reports their reachability honestly rather than
// pretending to have exercised them. See the STUDIO section of the output.
//
//   node infra/smoke.mjs [--mode clay|stone] [--text "..."] [--no-model] [--studio]
//
// --no-model  do not send a chat turn. The model-dependent checks are reported SKIP and counted,
//             never silently dropped. §10 invokes this script with this flag; until now the flag
//             DID NOT EXIST — it appeared in docs/MISSION-PROMPT.md, docs/CHECKPOINT.md and
//             docs/backlog/OWNER-HANDOFF.md, and nowhere in this file, while line ~168 ran a real
//             agent turn unconditionally. So the one flag whose job was to stop this script
//             spending money was ignored by the only program that could honour it.
//
// --studio    exercise the plugin round-trip, which POSTs to /api/admin/studio-op. OFF by default:
//             §12.5 says a smoke run may never go against /api/admin/*, and the previous guard was
//             `if (ADMIN)` — which is always true, because this file reads .env into process.env
//             at startup and GOLEM_ADMIN_KEY lives there. A guard on a value the script itself
//             guarantees is not a guard.
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
for (const line of readFileSync(root + '/.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const E2E_EMAIL = process.env.GOLEM_E2E_EMAIL;
const E2E_PASSWORD = process.env.GOLEM_E2E_PASSWORD;
if (!E2E_EMAIL || !E2E_PASSWORD) {
  throw new Error('GOLEM_E2E_EMAIL / GOLEM_E2E_PASSWORD missing from .env');
}

const BASE = process.env.API_BASE;
const ADMIN = process.env.GOLEM_ADMIN_KEY;
const SUPA = 'https://npqvyijsvzkuwddyhtpm.supabase.co';
const ANON = readFileSync(root + '/apps/worker/wrangler.jsonc', 'utf8').match(
  /"SUPABASE_ANON_KEY":\s*"([^"]+)"/,
)[1];

const arg = (flag, dflt) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? dflt : process.argv[i + 1];
};
const MODE = arg('--mode', 'clay');
const TEXT = arg('--text', 'In one sentence, what is in this project right now?');
const NO_MODEL = process.argv.includes('--no-model');
const STUDIO = process.argv.includes('--studio');

// An unrecognised flag is an error. This whole repair exists because `--no-model` was passed for
// several passes and silently ignored, so a typo here must never again be indistinguishable from
// a flag that works.
const KNOWN = new Set(['--mode', '--text', '--no-model', '--studio']);
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  if (!KNOWN.has(a)) {
    console.error(`smoke: unrecognised flag ${a} — known: ${[...KNOWN].join(', ')}`);
    process.exit(2);
  }
  if (a === '--mode' || a === '--text') i += 1;
}

// ---------------------------------------------------- the §12.5 spend ceiling ---
//
// REFUSE BEFORE SPENDING, NOT REPORT AFTER. §12.5 caps a pass at 500 neurons. A `stone` turn is
// 4-18 Credits and a `rune` one 10-30, which at 30 neurons per Credit is up to 540 and 900 — so a
// single documented invocation of this script can blow the whole pass ceiling, and nothing in it
// knew the ceiling existed. Clay, at 2 Credits / 60 neurons, is the only mode that fits.
//
// Both numbers are DERIVED from the files the product actually bills with — `typicalCredits` in
// @golem/shared and NEURONS_PER_CREDIT in the worker's pricing — rather than restated here, because
// a ceiling check that keeps its own copy of the prices stops agreeing with them and then permits
// exactly what it was written to refuse. An unreadable source is a hard error, never a default:
// failing open on a spend guard is the one direction that costs money.
const SPEND_CEILING_NEURONS = 500; // §12.5, the owner's number; there is no machine source for it.
if (!NO_MODEL) {
  const shared = readFileSync(root + '/packages/shared/src/index.ts', 'utf8');
  const pricing = readFileSync(root + '/apps/worker/src/pricing.ts', 'utf8');
  //[[ THE CONSTANT MOVED AND THIS HARNESS DIED WITHOUT SAYING SO.
  //
  //   This read NEURONS_PER_CREDIT out of apps/worker/src/pricing.ts. pricing.ts no longer declares
  //   it — it re-exports it from @golem/shared (`export { NEURONS_PER_CREDIT } from '@golem/shared'`)
  //   — so the regex matched nothing, perCredit was NaN, and the guard below refused every run.
  //
  //   The refusal is correct and stays: failing open on a spend guard is the one direction that
  //   costs money. What was wrong is that "the price moved" and "the price is unreadable" printed
  //   the same sentence, so a dead harness looked exactly like a careful one. Measured 2026-09-20:
  //   this had been refusing to run for as long as the re-export has existed, and nobody noticed
  //   because the message it prints is the message a working guard would print.
  //
  //   So both files are searched, the declaration is preferred over the re-export, and the error
  //   below now names which files were read. ]]
  const DECL = /export const NEURONS_PER_CREDIT\s*=\s*(\d+)/;
  const perCredit = Number((shared.match(DECL) ?? pricing.match(DECL) ?? [])[1]);
  const typical = shared.match(new RegExp(`\\b${MODE}:\\s*\\{[^}]*typicalCredits:\\s*'([^']+)'`))?.[1];
  if (!Number.isFinite(perCredit) || !typical) {
    console.error(`smoke: cannot derive the cost of --mode ${MODE} (perCredit=${perCredit}, typicalCredits=${typical}).`);
    console.error('  searched packages/shared/src/index.ts and apps/worker/src/pricing.ts for '
      + '`export const NEURONS_PER_CREDIT = <n>`, and the mode\'s typicalCredits in shared. If a '
      + 'constant has moved again, re-aim this read rather than typing the number in here.');
    console.error('Refusing to run a model turn against an unknown price. This is deliberate: a spend guard that cannot read the prices must not fall back to permitting the spend.');
    process.exit(2);
  }
  // The UPPER end of the range. A ceiling checked against the optimistic figure is not a ceiling.
  const worstCredits = Math.max(...typical.split('-').map(Number));
  const worstNeurons = worstCredits * perCredit;
  if (worstNeurons > SPEND_CEILING_NEURONS) {
    console.error(`smoke: --mode ${MODE} costs up to ${worstCredits} Credits = ${worstNeurons} neurons, over the §12.5 ceiling of ${SPEND_CEILING_NEURONS} per pass.`);
    console.error('Use --no-model, or --mode clay. Refused before spending rather than reported after.');
    process.exit(2);
  }
  console.log(`spend — --mode ${MODE} is at most ${worstCredits} Credits = ${worstNeurons} neurons, within the ${SPEND_CEILING_NEURONS} ceiling`);
}

const checks = [];
const check = (name, pass, detail = '') => {
  checks.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

// A skipped check is RECORDED, not dropped. Shrinking the denominator instead would let a run that
// exercised none of the agent report "12/12 checks passed" — the same shape as `node --test`
// reporting `fail 0` over a file with no tests left in it.
const skipped = [];
const skip = (name, why) => {
  skipped.push({ name, why });
  console.log(`SKIP  ${name}  — ${why}`);
};

const t0 = Date.now();
const stamp = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

// ---------------------------------------------------------------- auth ----
const tok = await (
  await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD }),
  })
).json();
const jwt = tok.access_token;
check('auth — real Supabase sign-in returns a JWT', typeof jwt === 'string' && jwt.length > 40);

const noAuth = await fetch(`${BASE}/api/me`);
check('auth — /api/me refuses an unauthenticated caller', noAuth.status === 401, `HTTP ${noAuth.status}`);

const me = await (await fetch(`${BASE}/api/me`, { headers: { Authorization: `Bearer ${jwt}` } })).json();
check('auth — /api/me returns the account', Boolean(me?.profile || me?.user), JSON.stringify(me).slice(0, 90));

// ------------------------------------------------------------ providers ---
const provRes = await fetch(`${BASE}/api/providers`, { headers: { Authorization: `Bearer ${jwt}` } });
if (provRes.ok) {
  const providers = await provRes.json();
  check('providers — route is behind user auth and returns inference readiness',
    providers.ready === true && Array.isArray(providers.models) && providers.models.length === 0,
    `ready=${String(providers.ready)}, public catalog ${providers.models?.length ?? 'missing'} models`);
  const blob = JSON.stringify(providers);
  check('providers — no credential material in the response',
    !/sk-|AIza|Bearer\s|api[_-]?key["']?\s*[:=]/i.test(blob));
  check('providers — health carries no raw upstream error text',
    (providers.health ?? []).every((h) => !h.lastError || !('message' in h.lastError)));
} else {
  check('providers — /api/providers reachable', false,
    `HTTP ${provRes.status} (deployed worker may predate this route)`);
}

// -------------------------------------------------------------- project ---
const projects = await (
  await fetch(`${SUPA}/rest/v1/projects?select=id,name&order=created_at.desc&limit=1`, {
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}` },
  })
).json();
const project = projects[0];
check('project — the account can open a project', Boolean(project?.id), project?.name);

const foreign = await fetch(`${BASE}/api/projects/00000000-0000-4000-8000-000000000000/checkpoints`, {
  headers: { Authorization: `Bearer ${jwt}` },
});
check('tenant isolation — a project this account does not own is not readable',
  foreign.status === 404 || foreign.status === 403, `HTTP ${foreign.status}`);

// --------------------------------------------------------------- studio ---
let studioReachable = false;
if (ADMIN && !STUDIO) {
  skip('studio — plugin round-trip', 'needs --studio: this POSTs /api/admin/studio-op, which §12.5 bars a smoke run from touching');
}
if (ADMIN && STUDIO) {
  const t = Date.now();
  const op = await fetch(`${BASE}/api/admin/studio-op/${project.id}`, {
    method: 'POST',
    headers: { 'X-Admin-Key': ADMIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: { op: 'ping' }, timeoutMs: 6000 }),
  });
  studioReachable = op.ok;
  const body = await op.text();
  console.log(
    `${studioReachable ? 'PASS' : 'SKIP'}  studio — plugin round-trip on "${project.name}"` +
      `  — HTTP ${op.status} in ${Date.now() - t}ms ${body.slice(0, 60)}`,
  );
  if (!studioReachable) {
    console.log('      NOTE: build / checkpoint / restore / playtest need a paired plugin on THIS');
    console.log('      project and are therefore NOT exercised below. Not claiming otherwise.');
  }
}

// ------------------------------------------------------------ websocket ---
const seen = { types: new Set(), phases: [], tools: [], intent: null, errors: [] };
let finalText = '';

const runOnce = () =>
  new Promise((resolve) => {
    const ws = new WebSocket(`${BASE.replace('https', 'wss')}/api/projects/${project.id}/ws`, [
      'golem.v1',
      'golem.jwt.' + jwt,
    ]);
    const timer = setTimeout(() => {
      try { ws.close(); } catch {}
      resolve('timeout');
    }, 180_000);

    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      seen.types.add(m.type);
      if (m.type === 'hello') {
        check('websocket — connects and authenticates over the subprotocol', true,
          `studioConnected=${m.studioConnected}, credits=${m.quota?.creditsRemaining}`);
        ws.send(JSON.stringify({ type: 'chat', text: TEXT, mode: MODE }));
      } else if (m.type === 'run_intent') {
        seen.intent = m.intent;
        console.log(`${stamp()}  run_intent  summary="${(m.intent.summary || '').slice(0, 70)}"` +
          `  checklist=${m.intent.checklist.length}  questions=${m.intent.questions.length}`);
      } else if (m.type === 'agent_status') {
        seen.phases.push(m.phase);
        console.log(`${stamp()}  [${m.phase}${m.step ? ` ${m.step}/${m.totalSteps}` : ''}]` +
          `${m.effort ? ` effort=${m.effort}` : ''}${m.tool ? ` tool=${m.tool}` : ''}`);
      } else if (m.type === 'tool_start') {
        console.log(`${stamp()}  → ${m.tool}`);
      } else if (m.type === 'tool_end') {
        seen.tools.push({ tool: m.tool, ok: m.ok, hasDetail: m.detail !== undefined });
        console.log(`${stamp()}    ${m.ok ? '✓' : '✗'} ${m.summary}  detail=${m.detail !== undefined}`);
      } else if (m.type === 'delta') {
        finalText += m.text;
      } else if (m.type === 'error') {
        seen.errors.push(`${m.code}: ${m.message}`);
        if (m.terminal === true) {
          clearTimeout(timer);
          try { ws.close(); } catch {}
          resolve('error');
        }
      } else if (m.type === 'msg_end') {
        clearTimeout(timer);
        try { ws.close(); } catch {}
        resolve(m.stopReason);
      }
    };
    ws.onerror = () => { clearTimeout(timer); resolve('ws-error'); };
  });

// THE ONLY PART OF THIS SCRIPT THAT SPENDS MONEY.
//
// Whether this block runs is a budget decision, so it has to be one the caller can actually make.
//
// Two different figures describe the cost and they must not be confused. COST-MODEL records
// MEASURED turns — clay ~29 neurons, a stone full build-and-verify in Studio ~1,266. The guard
// above uses neither: it derives the upper end of the mode's `typicalCredits` range, which puts
// stone at 18 Credits = 540 neurons. That is the conservative choice for clay, where 2 Credits = 60
// neurons is more than the ~29 actually measured, and it refuses stone and rune on the §12.5
// ceiling either way. The derived figure is used because it comes from the file the product bills
// with, and a guard that keeps its own copy of the prices stops agreeing with them.
if (NO_MODEL) {
  for (const name of [
    'chat — a real agent turn completes',
    'chat — the assistant produced text',
    'activity — the worker announced real phases',
    'activity — a typed phase union is used (no ad-hoc strings)',
    'intent — run_intent was emitted with real derived content',
    'tools — tool_end carries structured detail for the typed UI registry',
    'no protocol errors were broadcast',
    'persistence — the turn was written to history',
  ]) skip(name, 'not run: --no-model');
} else {
  console.log(`\n--- running a real ${MODE} turn against ${BASE} ---`);
  const stopReason = await runOnce();

  check('chat — a real agent turn completes', ['done', 'incomplete'].includes(stopReason), `stopReason=${stopReason}`);
  check('chat — the assistant produced text', finalText.trim().length > 0, `${finalText.trim().length} chars`);
  check('activity — the worker announced real phases', seen.phases.length > 0, seen.phases.join(' → '));
  check('activity — a typed phase union is used (no ad-hoc strings)',
    seen.phases.every((p) => [
      'understanding','planning','inspecting','building','writing_luau','rendering','critiquing',
      'rebuilding','playtesting','debugging','verifying','checkpointing','remembering','done',
    ].includes(p)), [...new Set(seen.phases)].join(','));
  check('intent — run_intent was emitted with real derived content', seen.intent !== null,
    seen.intent ? `checklist=${JSON.stringify(seen.intent.checklist).slice(0, 80)}` : 'not emitted');
  if (seen.tools.length) {
    check('tools — tool_end carries structured detail for the typed UI registry',
      seen.tools.some((t) => t.hasDetail),
      `${seen.tools.filter((t) => t.hasDetail).length}/${seen.tools.length} with detail`);
  }
  check('no protocol errors were broadcast', seen.errors.length === 0, seen.errors.join('; '));
}

// ------------------------------------------------- reconnect / replay -----
// A finished run must replay as "no live run". The point is that the resume
// handler answers at all, which it did not before this phase.
const replay = await new Promise((resolve) => {
  const ws = new WebSocket(`${BASE.replace('https', 'wss')}/api/projects/${project.id}/ws`, [
    'golem.v1', 'golem.jwt.' + jwt,
  ]);
  const timer = setTimeout(() => { try { ws.close(); } catch {} resolve(undefined); }, 20_000);
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.type === 'hello') ws.send(JSON.stringify({ type: 'resume' }));
    if (m.type === 'run_state') {
      clearTimeout(timer);
      try { ws.close(); } catch {}
      resolve(m);
    }
  };
  ws.onerror = () => { clearTimeout(timer); resolve(undefined); };
});
check('reconnect — the resume handler answers with a run_state', replay !== undefined,
  replay ? `run=${replay.run === null ? 'null (idle, correct)' : 'live snapshot'}` : 'no reply within 20s');

// History is only evidence of THIS run if this run sent something. With --no-model the account's
// existing messages would satisfy `length > 0` while proving nothing, so the check is skipped
// above rather than passed on somebody else's turn.
if (!NO_MODEL) {
  // ------------------------------------------------------ history persist ---
  const msgs = await (
    await fetch(`${BASE}/api/projects/${project.id}/messages`, { headers: { Authorization: `Bearer ${jwt}` } })
  ).json();
  check('persistence — the turn was written to history',
    Array.isArray(msgs.messages) && msgs.messages.length > 0, `${msgs.messages?.length} messages`);
}

// ------------------------------------------------------------- summary ---
const failed = checks.filter((c) => !c.pass);
// The denominator names the WHOLE surface, not just what ran. "9/9 checks passed" is true and
// reads as complete; "9/9 executed, 9 of 18 skipped" cannot be mistaken for a full smoke.
const total = checks.length + skipped.length;
console.log(
  `\n${checks.length - failed.length}/${checks.length} executed checks passed` +
  (skipped.length ? `, ${skipped.length} of ${total} SKIPPED` : ''),
);
if (skipped.length) {
  console.log('\nSKIPPED — these were not exercised, and this run is not a full smoke:');
  for (const sk of skipped) console.log(`  - ${sk.name} (${sk.why})`);
}
if (!studioReachable) {
  console.log('\nSTUDIO: not paired to this project — build, checkpoint, restore and playtest');
  console.log('were NOT exercised. This is reported, not worked around.');
}
if (failed.length) {
  console.log('\nFAILED:');
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
  process.exit(1);
}
