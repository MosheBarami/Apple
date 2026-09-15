/**
 * THE WEB TOOLS ARE WIRED IN, AND WIRED IN A WAY THE REPOSITORY'S OTHER GUARDS CAN SEE.
 *
 * webtools.ts can be perfect and still ship nothing: a tool the agent loop cannot reach is a
 * library. So this file asserts the seams rather than the behaviour —
 *
 *   the registry: all ten are in `TOOLS`, none of them claims to need Studio;
 *   the LITERAL registry: each one is a visible `  name: {` entry, because three existing guards
 *     (tool-vocabulary, tools-for-mode, phase-coverage) find the tool table by PARSING that
 *     literal. A `...spread` would be invisible to all three, and ten tools would silently acquire
 *     no label, no mode assertion and no phase — coverage that looks like coverage from inside;
 *   the dispatch: `runTool` validates, runs, and marks a refusal as a failed step;
 *   the modes: Plan gets the read-only ones and never the write;
 *   the pixels: a screenshot reaches the BROWSER and never the model's transcript.
 *
 * Run with:  node --test tests/webtools-wiring.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(WORKER, '../..');
const DIR = mkdtempSync(join(tmpdir(), 'webwiring-'));

function bundle(rel, name) {
  const out = join(DIR, `${name}.mjs`);
  execFileSync(
    join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [join(WORKER, 'src', rel), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
    { cwd: WORKER, stdio: 'pipe' },
  );
  return out;
}

const T = await import(`file://${bundle('tools.ts', 'tools')}`);
const R = await import(`file://${bundle('router.ts', 'router')}`);
const W = await import(`file://${bundle('webtools.ts', 'webtools')}`);
const S = await import(`file://${join(ROOT, 'packages/shared/src/index.ts')}`);

const WEB = W.WEB_TOOL_NAMES;

/* ------------------------------------------------------------- the registry --- */

test('the fixture is the real thing: ten web tools, and a registry that has other tools in it too', () => {
  assert.equal(WEB.length, 10);
  assert.ok(T.toolNames().length > 30, 'the worker registry did not load');
});

test('every web tool is registered, and none of them claims to need Studio', () => {
  for (const name of WEB) {
    assert.ok(name in T.TOOLS, `${name} is defined in webtools.ts and reachable by nobody`);
    assert.equal(T.TOOLS[name].studio, false, `${name} is marked as a Studio tool; it would vanish when Studio is absent`);
  }
});

test('each registration is a LITERAL entry, so the repository\'s parsing guards can see it', () => {
  // The three guards that read this literal: tool-vocabulary.test.mjs, tools-for-mode.test.mjs,
  // phase-coverage.test.mjs. A spread would pass every assertion above and be invisible to all of
  // them — the tools would exist, and nothing would hold them to a label, a mode or a phase.
  const src = readFileSync(join(WORKER, 'src', 'tools.ts'), 'utf8');
  const start = src.indexOf('{', src.indexOf('export const TOOLS'));
  let depth = 0;
  let end = start;
  for (let i = start; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  const literal = src.slice(start, end);
  const parsed = [...literal.matchAll(/^ {2}([a-z_][a-z0-9_]*): \{$/gm)].map((m) => m[1]);
  for (const name of WEB) {
    assert.ok(parsed.includes(name), `${name} is registered in a way the source-parsing guards cannot see`);
  }
  // Anchored to the shape that actually hides entries: a spread at the literal's OWN indentation.
  // `literal.includes('...')` was the first version and it was wrong — the table is full of
  // ellipses in prose and of `...spread` inside tool bodies, where it means nothing to a parser
  // looking for top-level keys. A guard that fires on the wrong thing gets deleted.
  const entrySpread = /^ {2}\.\.\./m.exec(literal);
  assert.equal(entrySpread, null, `a spread supplies registry entries (${entrySpread?.[0]}) — see the note above`);
});

test('the definition the model receives is derived from the contract, not retyped', () => {
  for (const name of WEB) {
    const def = T.TOOLS[name].def;
    assert.equal(def.name, name);
    assert.deepEqual(
      Object.keys(def.parameters.properties).sort(),
      Object.keys(W.WEB_TOOLS[name].contract.args).sort(),
      `${name}'s advertised schema and its validator disagree about the argument names`,
    );
  }
});

test('the web tools are offered when Studio is absent, since none of them needs it', () => {
  const offered = T.toolDefs(false).map((d) => d.name);
  for (const name of WEB) assert.ok(offered.includes(name), `${name} was withheld for want of a Studio connection`);
});

/* --------------------------------------------------------------- dispatch --- */

function ctx(over = {}) {
  return {
    env: { KV: { put: async () => {}, get: async () => null }, ...(over.env ?? {}) },
    projectId: over.projectId,
    studioConnected: () => false,
    execStudioOp: async () => ({ id: 'x', ok: false, error: 'no studio' }),
    createCheckpoint: async () => ({ error: 'no' }),
    addMemoryFact: async () => {},
    ...over,
  };
}

const okHtml = async () => ({
  status: 200,
  headers: { get: (h) => (h.toLowerCase() === 'content-type' ? 'text/html' : null) },
  text: async () => '<html><head><title>Docs</title></head><body><p>Readable.</p></body></html>',
  arrayBuffer: async () => new ArrayBuffer(8),
});

test('runTool dispatches a web tool through the validator and back', async () => {
  let called = 0;
  const out = await T.runTool(
    ctx({ webFetch: async (...a) => { called += 1; return okHtml(...a); } }),
    'web_fetch',
    JSON.stringify({ url: 'https://create.roblox.com/docs' }),
  );
  assert.equal(out.ok, true, out.resultForLlm);
  assert.equal(called, 1, 'ctx.webFetch was ignored, so the tool went to the real network');
  assert.match(out.resultForLlm, /Readable/);
  assert.notEqual(out.detail, undefined, 'a structured result should reach the browser too');
});

test('a refusal comes back as a FAILED step, not a successful one with an apology in it', async () => {
  const out = await T.runTool(ctx({ webFetch: okHtml }), 'web_fetch', JSON.stringify({ url: 'https://evil.example/x' }));
  assert.equal(out.ok, false, 'a blocked fetch was reported as a successful step');
  assert.match(out.summary, /^✗/);
  assert.equal(out.detail, undefined, 'an error result must not be forwarded to the UI as content');
});

test('an invalid argument is a failed step with a message a model can act on', async () => {
  const out = await T.runTool(ctx({ webFetch: okHtml }), 'web_fetch', JSON.stringify({ uri: 'https://create.roblox.com' }));
  assert.equal(out.ok, false);
  assert.match(out.resultForLlm, /unknown argument uri/);
  assert.match(out.resultForLlm, /url is required/);
});

test('arguments that are not JSON at all are refused by runTool before the tool runs', async () => {
  const out = await T.runTool(ctx({ webFetch: okHtml }), 'web_fetch', '{not json');
  assert.equal(out.ok, false);
  assert.match(out.resultForLlm, /not valid JSON/);
});

test('a captured screenshot reaches the BROWSER and never the transcript', async () => {
  // The rule render_view already follows: a base64 image is ~200KB of nothing the model can read,
  // and tool results are re-sent on every later step.
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const stored = [];
  const out = await T.runTool(
    ctx({
      projectId: 'p1',
      env: { KV: { put: async (k, v) => stored.push({ k, v }), get: async () => null }, SCREENSHOT_API_URL: 'https://shots.example.com/png', WEB_TOOL_ALLOWLIST: 'shots.example.com' },
      webFetch: async () => ({
        status: 200,
        headers: { get: (h) => (h.toLowerCase() === 'content-type' ? 'image/png' : null) },
        text: async () => '',
        arrayBuffer: async () => png.buffer,
      }),
    }),
    'screenshot_page',
    JSON.stringify({ url: 'https://create.roblox.com/docs' }),
  );
  assert.equal(out.ok, true, out.resultForLlm);
  assert.equal(stored.length, 1, 'the pixels were not stored, so nothing could ever display them');
  assert.match(stored[0].k, /^image:p1:/);
  assert.equal(out.resultForLlm.includes(Buffer.from(png).toString('base64')), false, 'the image went into the model transcript');
  assert.notEqual(out.detail, undefined, 'and nothing was sent to the browser either');
});

/* ------------------------------------------------------------------- modes --- */

test('Plan mode gets the read-only web tools and never the one that writes', () => {
  const plan = R.toolsForMode('clay', true, T.toolNames());
  for (const name of W.READ_ONLY_WEB_TOOLS) {
    assert.ok(plan.has(name), `Plan cannot ${name}, which reads and changes nothing`);
  }
  assert.equal(plan.has('workspace_write'), false, 'Plan was handed a tool that writes');
});

test('an unrecognised mode still gets no more than Plan does, web tools included', () => {
  for (const mode of ['nonsense', '__proto__', undefined]) {
    const got = R.toolsForMode(mode, true, T.toolNames());
    assert.equal(got.has('workspace_write'), false, `mode ${String(mode)} was handed workspace_write`);
  }
});

test('the builder modes get all ten', () => {
  for (const mode of ['stone', 'rune']) {
    const all = R.toolsForMode(mode, true, T.toolNames());
    for (const name of WEB) assert.ok(all.has(name), `${mode} is missing ${name}`);
  }
});

/* ------------------------------------------------------------------ phases --- */

test('no web tool announces that the agent is building the user\'s world', () => {
  // `phaseForTool`'s default is 'building'. A tool that falls through to it claims, on screen,
  // that work is happening in the place — which none of these tools can even reach.
  for (const name of WEB) {
    const phase = S.phaseForTool(name);
    assert.notEqual(phase, 'building', `${name} announces "Building world" while reading the web`);
    assert.ok(['inspecting', 'remembering'].includes(phase), `${name} has an odd phase: ${phase}`);
  }
});

test('the phase table is being read, not guessed', () => {
  // Non-vacuity for the loop above: a real building tool must still say 'building'.
  assert.equal(S.phaseForTool('create_instances'), 'building');
  assert.equal(S.phaseForTool('web_fetch'), 'inspecting');
});
