// Offline tests: a fake Langflow on a random port, the checked-in flows, and (when the Langflow venv
// exists) the Python component logic. Run: node --test packages/langflow/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLOWS, SECRETS, assemble, client, componentCode, outputText, readFlow, redact, run, status, sync } from './sync.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SECRET = 'cf-token-THIS-MUST-NEVER-BE-PRINTED';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.fakesignature';

/** A Langflow that remembers what it was sent. `autoLogin: false` answers the way AUTO_LOGIN=false does. */
async function fakeLangflow({ autoLogin = true } = {}) {
  const state = { flows: new Map(), variables: [], projects: [], keys: new Map(), calls: [] };
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    const json = body ? JSON.parse(body) : undefined;
    const url = new URL(req.url, 'http://x');
    state.calls.push({ method: req.method, path: url.pathname, headers: req.headers, body: json });
    const send = (code, v) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(v)); };
    const p = url.pathname;
    if (p === '/health') return send(200, { status: 'ok' });
    if (p === '/api/v1/version') return send(200, { version: '9.9.9' });
    if (p === '/api/v1/auto_login') return autoLogin ? send(200, { access_token: JWT }) : send(400, { detail: 'off' });
    const bearer = req.headers.authorization === `Bearer ${JWT}`;
    const key = req.headers['x-api-key'];
    if (p.startsWith('/api/v1/run/')) {
      if (!key || ![...state.keys.values()].includes(key) && key !== 'sk-configured-key') return send(403, { detail: 'needs an API key' });
      const flow = state.flows.get(p.split('/').pop());
      if (!flow) return send(404, { detail: 'Flow not found' });
      return send(200, { outputs: [{ outputs: [{ results: { message: { text: `echo:${json.input_value}` } } }] }] });
    }
    if (!bearer && key !== 'sk-configured-key') return send(403, { detail: 'unauthorised' });
    if (p === '/api/v1/projects/' && req.method === 'GET') return send(200, state.projects);
    if (p === '/api/v1/projects/' && req.method === 'POST') { const pr = { id: 'proj-1', name: json.name }; state.projects.push(pr); return send(201, pr); }
    if (p === '/api/v1/variables/' && req.method === 'GET') return send(200, state.variables.map(({ value, ...v }) => ({ ...v, has_value: !!value })));
    if (p === '/api/v1/variables/' && req.method === 'POST') { const v = { id: `var-${json.name}`, ...json }; state.variables.push(v); return send(201, v); }
    if (p.startsWith('/api/v1/variables/') && req.method === 'PATCH') { Object.assign(state.variables.find((v) => v.id === json.id), json); return send(200, {}); }
    if (p === '/api/v1/api_key/' && req.method === 'POST') { const id = `k${state.keys.size + 1}`; state.keys.set(id, `sk-ephemeral-${id}`); return send(200, { id, api_key: state.keys.get(id) }); }
    if (p.startsWith('/api/v1/api_key/') && req.method === 'DELETE') { state.keys.delete(p.split('/').pop()); return send(200, {}); }
    if (p.startsWith('/api/v1/flows/')) {
      const id = p.split('/').pop();
      if (req.method === 'PUT') { const had = state.flows.has(id); state.flows.set(id, { id, ...json }); return send(had ? 200 : 201, { id }); }
      if (req.method === 'GET') return state.flows.has(id) ? send(200, state.flows.get(id)) : send(404, { detail: 'Flow not found' });
    }
    send(404, { detail: `fake has no ${req.method} ${p}` });
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, state, close: () => new Promise((ok) => server.close(ok)) };
}

const env = { CLOUDFLARE_ACCOUNT_ID: 'acct-fake', CLOUDFLARE_API_TOKEN: SECRET };

test('every checked-in flow is ChatInput -> its components -> ChatOutput, wired in order, code identical to components/*.py', () => {
  for (const f of FLOWS) {
    const flow = readFlow(f.slug);
    assert.equal(flow.id, f.id);
    assert.equal(flow.endpoint_name, f.slug);
    const { nodes, edges } = flow.data;
    assert.deepEqual(nodes.map((n) => n.data.type).slice(1, -1).length, f.steps.length);
    assert.equal(nodes[0].data.type, 'ChatInput');
    assert.equal(nodes.at(-1).data.type, 'ChatOutput');
    f.steps.forEach((step, i) => assert.equal(nodes[i + 1].data.node.template.code.value, componentCode(step), `${f.slug}: ${step} drifted; run sync.mjs build`));
    assert.equal(edges.length, nodes.length - 1);
    edges.forEach((e, i) => {
      assert.equal(e.source, nodes[i].id);
      assert.equal(e.target, nodes[i + 1].id);
      assert.ok(nodes[i + 1].data.node.template[e.data.targetHandle.fieldName], `${f.slug}: edge ${i} targets a missing field`);
      assert.ok(nodes[i].data.node.outputs.some((o) => o.name === e.data.sourceHandle.name));
      assert.equal(e.sourceHandle, JSON.stringify(e.data.sourceHandle).replace(/"/g, 'œ'));
    });
    const xs = nodes.map((n) => n.position.x);
    assert.deepEqual([...xs].sort((a, b) => a - b), xs, 'nodes are laid out left to right');
  }
});

test('flows name their credentials by variable and carry no secret', () => {
  for (const f of FLOWS) {
    const raw = readFileSync(path.join(HERE, 'flows', `${f.slug}.json`), 'utf8');
    assert.doesNotMatch(raw, /eyJ[\w-]{10,}\.[\w-]{10,}/, 'no JWT');
    assert.doesNotMatch(raw, /\bsk-[\w-]{20,}/, 'no Langflow API key');
    for (const n of readFlow(f.slug).data.nodes.filter((n) => n.data.type === 'AppleWorkersAI')) {
      assert.equal(n.data.node.template.api_token.value, 'CLOUDFLARE_API_TOKEN');
      assert.equal(n.data.node.template.api_token.load_from_db, true);
      assert.equal(n.data.node.template.account_id.value, 'CLOUDFLARE_ACCOUNT_ID');
    }
  }
});

test('assemble wires the first Message input of each step', () => {
  const node = (inputs, out) => ({
    outputs: [{ name: out, types: ['Message'] }],
    field_order: ['code', ...inputs],
    template: { code: { type: 'code' }, ...Object.fromEntries(inputs.map((i) => [i, { input_types: ['Message'], type: 'str' }])) },
  });
  const flow = assemble({ slug: 's', id: 'i', name: 'n', description: 'd' }, [
    { type: 'ChatInput', node: node([], 'message') },
    { type: 'Step', node: node(['spec'], 'request') },
    { type: 'ChatOutput', node: node(['input_value'], 'message') },
  ]);
  assert.deepEqual(flow.data.edges.map((e) => e.data.targetHandle.fieldName), ['spec', 'input_value']);
  assert.deepEqual(flow.data.edges.map((e) => e.data.sourceHandle.name), ['message', 'request']);
});

test('sync creates the project, both credentials and every flow, then updates in place', async () => {
  const lf = await fakeLangflow();
  try {
    const c = client({ base: lf.base, env });
    const first = await sync(c, env);
    assert.deepEqual(first.secrets, { CLOUDFLARE_ACCOUNT_ID: 'created', CLOUDFLARE_API_TOKEN: 'created' });
    assert.equal(lf.state.flows.size, FLOWS.length);
    for (const f of FLOWS) assert.equal(lf.state.flows.get(f.id).folder_id, 'proj-1');
    assert.equal(lf.state.variables.find((v) => v.name === 'CLOUDFLARE_API_TOKEN').type, 'Credential');

    const second = await sync(c, env);
    assert.deepEqual(second.secrets, { CLOUDFLARE_ACCOUNT_ID: 'updated', CLOUDFLARE_API_TOKEN: 'updated' });
    assert.equal(lf.state.projects.length, 1, 'no duplicate project');
    assert.equal(lf.state.variables.length, SECRETS.length, 'no duplicate variables');
    assert.equal(lf.state.flows.size, FLOWS.length, 'PUT upserts by fixed id, no duplicates');

    const flowBodies = lf.state.calls.filter((k) => k.path.startsWith('/api/v1/flows/')).map((k) => JSON.stringify(k.body));
    assert.ok(flowBodies.every((b) => !b.includes(SECRET)), 'the token only travels to /variables');
    assert.ok(!JSON.stringify(first).includes(SECRET) && !JSON.stringify(second).includes(SECRET));
  } finally { await lf.close(); }
});

test('sync reports a missing credential instead of inventing one', async () => {
  const lf = await fakeLangflow();
  try {
    const out = await sync(client({ base: lf.base }), {});
    assert.deepEqual(out.secrets, { CLOUDFLARE_ACCOUNT_ID: 'MISSING', CLOUDFLARE_API_TOKEN: 'MISSING' });
  } finally { await lf.close(); }
});

test('run mints an API key, sends it instead of the session token, and deletes it', async () => {
  const lf = await fakeLangflow();
  try {
    const c = client({ base: lf.base, env });
    await sync(c, env);
    assert.equal(await run(c, 'apple-rag-ingest', 'hello'), 'echo:hello');
    const runCall = lf.state.calls.find((k) => k.path.startsWith('/api/v1/run/'));
    assert.equal(runCall.headers.authorization, undefined);
    assert.match(runCall.headers['x-api-key'], /^sk-ephemeral-/);
    assert.equal(lf.state.keys.size, 0, 'the ephemeral key is gone after the run');
    await assert.rejects(run(c, 'no-such-flow', 'x'), /unknown flow/);
  } finally { await lf.close(); }
});

test('with auto-login off, LANGFLOW_API_KEY is used; with neither, the error says so', async () => {
  const lf = await fakeLangflow({ autoLogin: false });
  try {
    const keyed = client({ base: lf.base, env: { ...env, LANGFLOW_API_KEY: 'sk-configured-key' } });
    await sync(keyed, env);
    assert.equal(await run(keyed, 'apple-asset-curation', 'x'), 'echo:x');
    assert.equal(lf.state.keys.size, 0, 'no key minted when one is configured');
    await assert.rejects(sync(client({ base: lf.base }), env), /auto-login and LANGFLOW_API_KEY is not set/);
  } finally { await lf.close(); }
});

test('status tells current flows from stale and missing ones', async () => {
  const lf = await fakeLangflow();
  try {
    const c = client({ base: lf.base, env });
    let s = await status(c);
    assert.equal(s.running, true);
    assert.equal(s.version, '9.9.9');
    assert.ok(s.flows.every((f) => !f.inLangflow && !f.current));
    await sync(c, env);
    const stale = lf.state.flows.get(FLOWS[0].id);
    stale.data.nodes[1].data.node.template.code.value = '# edited in the GUI';
    s = await status(c);
    assert.deepEqual(s.flows.map((f) => f.current), FLOWS.map((_, i) => i !== 0));
    assert.equal((await status(client({ base: 'http://127.0.0.1:9' }))).running, false);
  } finally { await lf.close(); }
});

test('the CLI never prints the token or the session JWT', async () => {
  const lf = await fakeLangflow();
  try {
    // Async spawn: a synchronous one would block the event loop the fake server answers on.
    const child = spawn(process.execPath, [path.join(HERE, 'sync.mjs'), 'sync'], { env: { ...process.env, ...env, LANGFLOW_URL: lf.base } });
    const out = { stdout: '', stderr: '' };
    child.stdout.on('data', (d) => (out.stdout += d));
    child.stderr.on('data', (d) => (out.stderr += d));
    out.status = await new Promise((ok) => child.on('close', ok));
    assert.equal(out.status, 0, out.stderr);
    for (const s of [out.stdout, out.stderr]) {
      assert.ok(!s.includes(SECRET) && !s.includes(JWT));
    }
    assert.match(out.stdout, /"CLOUDFLARE_API_TOKEN": "created"/);
  } finally { await lf.close(); }
});

test('redact and outputText', () => {
  assert.equal(redact(`x ${JWT} y sk-abcdefghijk Bearer abc.def`), 'x <jwt> y <api-key> Bearer <redacted>');
  assert.equal(outputText({ outputs: [{ outputs: [{ results: { message: { text: 'a' } } }] }] }), 'a');
  assert.equal(outputText({ outputs: [{ outputs: [{ messages: [{ message: 'b' }] }] }] }), 'b');
  assert.equal(outputText({}), null);
});

// The component logic itself, in the Python Langflow runs it with. Skipped where that venv is absent.
const PY = process.env.LANGFLOW_PYTHON || path.join(os.homedir(), '.langflow/.langflow-venv/bin/python3');
test('component logic (Langflow venv python)', { skip: !existsSync(PY) && 'no Langflow venv' }, () => {
  const script = String.raw`
import json, sys
sys.path.insert(0, sys.argv[1])
import asset_curator as a, rag_chunker as r, critique_request as cq, critique_verdict as cv, training_records as tr, training_request as tq, workers_ai as w

# asset curation: dedupe by canonical url, licence verdicts, conflicts
items = [
  {"url": "https://devforum.roblox.com/t/pack/123?x=1", "license": "MIT", "use": "import-ok"},
  {"url": "https://devforum.roblox.com/t/123", "license": "MIT", "use": "import-ok"},
  {"url": "https://a.itch.io/b", "license": "CC0 - free for personal and commercial use", "use": "import-ok"},
  {"url": "https://c.io/d", "license": "unknown", "use": "import-ok"},
  {"url": "https://c.io/e", "license": "CC BY-NC 4.0", "use": "reference-only"},
  {"url": "https://create.roblox.com/store/asset/99", "license": "Roblox Creator Store free asset (price 0)", "use": "import-ok"},
  {"url": "https://c.io/f", "license": "free download; license not confirmed (likely CC-BY) - verify", "use": "import-ok"},
]
out = a.curate(items)
assert out["summary"]["unique"] == 6 and out["summary"]["duplicates"] == 1, out["summary"]
v = {i["url"]: (i["verdict"], i["attribution"]) for i in out["items"]}
assert v["https://devforum.roblox.com/t/pack/123?x=1"] == ("import-ok", True)
assert v["https://a.itch.io/b"] == ("import-ok", False)
assert v["https://c.io/d"][0] == "review"
assert v["https://c.io/e"][0] == "reference-only"
assert v["https://create.roblox.com/store/asset/99"][0] == "import-ok"
assert v["https://c.io/f"][0] == "review"
assert out["summary"]["conflicts"] == 2

# RAG chunks: the corpus shape, stable ids, a breadcrumb first line
doc = "# Title\n\nintro " + "word " * 200 + "\n\n## Part\n\n" + ("para " * 150 + "\n\n") * 4
ch = r.chunk_all({"prefix": "t", "docs": [{"text": doc, "url": "https://x/y"}]})
assert len(ch) >= 2 and all(set(c) == {"vecId", "docSlug", "title", "url", "kind", "text", "embed"} for c in ch)
assert ch[0]["vecId"].endswith("-1") and ch[0]["docSlug"] == "t-title" and ch[0]["text"].startswith("Title")
assert ch == r.chunk_all({"prefix": "t", "docs": [{"text": doc, "url": "https://x/y"}]})
assert all(len(c["text"]) <= 2 * r.GUIDE_HARD_MAX for c in ch)

# critique: the order is hidden from the model and undone afterwards, both ways
for seed in range(6):
    req = cq.build_request({"ours": "O", "reference": "/r/docs/gauntlet/visual/refs/R.png", "test": "ui", "seed": seed}, load=lambda p: "data:" + p)
    ours = req["meta"]["ours_is"]
    urls = [p["image_url"]["url"] for p in req["messages"][0]["content"] if p["type"] == "image_url"]
    assert urls[0 if ours == "A" else 1] == "data:O"
    assert "ours" not in req["messages"][0]["content"][0]["text"].lower().split("image a")[0][-20:]
    answer = {"better": ours, "confidence": 0.7, "gaps_a": [{"area": "ui", "gap": "gap of A here", "fix": "f"}],
              "gaps_b": [{"area": "map", "gap": "gap of B here", "fix": "f"}],
              "biggest_gap_a": "A lacks thick outlines", "biggest_gap_b": "B lacks thick outlines"}
    res = cv.verdict({"meta": req["meta"], "text": "\x60\x60\x60json\n" + json.dumps(answer) + "\n\x60\x60\x60", "model": "m"})
    assert res["winner"] == "ours" and res["biggest_gap"] == f"{ours} lacks thick outlines"
    assert "--bar docs/gauntlet/visual/refs/R.png" in res["record"] and res["record"].endswith("--blind")
try:
    cv.verdict({"meta": {"ours_is": "A"}, "text": json.dumps({"better": "A", "biggest_gap_a": "none"})})
    raise SystemExit("a win with no real gap must fail")
except ValueError:
    pass
assert cq.parse_spec("/a.png\n/b.png\nmap") == {"ours": "/a.png", "reference": "/b.png", "test": "map"}

# training: game names and invented materials are rejected, bare Luau is fenced
assert tq.parse_spec(json.dumps({"biggest_gap": "plots have no trim at all", "gaps": [{"area": "map", "fix": "trim"}]}))["area"] == "map"
card = "A rule about borders. " * 12
reply = {"meta": {"gap": "g"}, "model": "m", "text": json.dumps({"skill_id": "Raised Trim", "title": "Raised trim", "card": card, "examples": [
    {"task": "a shop in any genre with trim", "answer": "local p = Instance.new('Part')\np.Material = Enum.Material.Wood"},
    {"task": "a hub like Pet Simulator 99", "answer": "\x60\x60\x60luau\nlocal x = 1\n\x60\x60\x60"},
    {"task": "a plot with a stone lip", "answer": "local p = Instance.new('Part')\np.Material = Enum.Material.Earthen"},
    {"task": "a plot with no code at all", "answer": "just prose"}]})}
o = tr.records(reply)
assert [e["messages"][2]["content"].startswith("\x60\x60\x60luau") for e in o["examples"]] == [True]
assert [x["reason"] for x in o["rejected"]] == ["names a specific game", "Enum.Material.Earthen does not exist", "no Luau code fence"]
assert o["chunk"]["docSlug"] == "skill-raised-trim" and o["examples"][0]["messages"][0]["content"] == tr.SYSTEM
try:
    tr.records({"text": json.dumps({"title": "Grow a Garden plots", "card": card})})
    raise SystemExit("a card naming a game must fail")
except ValueError:
    pass

# Workers AI caps
body = w.check_request({"messages": [{"role": "user", "content": "hi"}], "max_tokens": 99999}, w.MODELS[0], 5000)
assert body["max_tokens"] == w.HARD_MAX_TOKENS
for bad in [({"messages": []}, w.MODELS[0]), ({"messages": [{"role": "user", "content": "x"}]}, "@cf/openai/gpt-5"),
            ({"messages": [{"role": "user", "content": [{"type": "image_url"}] * 5}]}, w.MODELS[0]),
            ({"messages": [{"role": "user", "content": [{"type": "image_url"}]}]}, w.MODELS[1])]:
    try:
        w.check_request(bad[0], bad[1], 100)
        raise SystemExit(f"cap not enforced: {bad}")
    except ValueError:
        pass
assert w.reply_text({"result": {"choices": [{"message": {"content": "c"}}]}}) == "c"
print("ok")
`;
  const out = execFileSync(PY, ['-c', script, path.join(HERE, 'components')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.match(out, /ok\s*$/);
});
