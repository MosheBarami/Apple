/**
 * THE TEN WEB-FACING TOOLS: browser, search, fetch, screenshot, OCR, GitHub, git, files.
 *
 * Three claims, and each one is tested by feeding the thing it refuses rather than by watching it
 * succeed:
 *
 *   1. ARGUMENTS ARE VALIDATED BEFORE ANYTHING HAPPENS. A tool whose argument is a URL, a repo, a
 *      git ref or a file path cannot rely on anything downstream to say no — there is no Luau on
 *      the far side of a fetch. So the traversal, the lookalike host and the dash-prefixed ref are
 *      all driven in from the test, and the assertion is that the substrate was NEVER TOUCHED.
 *
 *   2. THE ALLOWLIST IS THE BOUNDARY, in three flavours: hosts, repositories and paths.
 *
 *   3. A FETCH THAT FAILS MUST NOT RENDER AS AN EMPTY RESULT. This is the repository's central
 *      rule and the reason the file exists. `web_search` that cannot reach its provider must not
 *      return `{results: []}`; `browse_page` that was refused must not return `{text: ''}`;
 *      `ocr_image` whose engine errored must not return `{text: ''}`. Each has a CONTROL beside
 *      it — the case where empty really is the answer — because without the control the rule
 *      could be satisfied by a tool that never returns anything empty at all.
 *
 * Run with:  node --test tests/webtools.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'webtools-')), 'w.mjs');
execFileSync(
  join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'webtools.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' },
);
const W = await import(`file://${out}`);

/* ----------------------------------------------------------------- fixtures --- */

const PAGE =
  '<html><head><title>Humanoid &amp; you</title><style>.x{color:red}</style>'
  + '<script>var secret = "do not read me";</script></head>'
  + '<body><h1>Humanoid</h1><p>A character&rsquo;s controller.</p>'
  + '<a href="/docs/next">next page</a><a href="https://evil.example/x">offsite</a></body></html>';

/** A fetch stub that records every URL it was asked for. */
function net(answer) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push(url);
    const step = typeof answer === 'function' ? answer(url, init) : answer;
    if (step instanceof Error) throw step;
    return {
      status: step.status ?? 200,
      headers: { get: (h) => (step.headers ?? {})[h.toLowerCase()] ?? null },
      text: async () => step.body ?? '',
      arrayBuffer: async () => step.buffer ?? new TextEncoder().encode(step.body ?? '').buffer,
    };
  };
  return { impl, calls };
}

const htmlPage = { status: 200, headers: { 'content-type': 'text/html' }, body: PAGE };
const json = (o) => ({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(o) });

/** A workspace that records every call, so "it never touched the store" is assertable. */
function spyWorkspace(seed = {}) {
  const inner = W.memoryWorkspace(seed);
  const calls = [];
  return {
    calls,
    store: {
      list: (p) => { calls.push(['list', p]); return inner.list(p); },
      read: (p) => { calls.push(['read', p]); return inner.read(p); },
      write: (p, c) => { calls.push(['write', p]); return inner.write(p, c); },
    },
  };
}

const ENV = {};
const ctxWith = (over = {}) => ({ env: { ...ENV, ...(over.env ?? {}) }, projectId: 'p1', ...over });
const run = (name, args, over) => W.runWebTool(name, ctxWith(over), args);

/** A result that must never be mistaken for content. */
function assertNotAnObservation(result, fields) {
  assert.equal(typeof result.error, 'string', `expected an error result, got ${JSON.stringify(result).slice(0, 160)}`);
  for (const f of fields) {
    assert.equal(f in result, false, `the failure carries "${f}", which a reader would treat as an answer`);
  }
}

test('the module loaded and the registry is the real one', () => {
  assert.deepEqual(
    W.WEB_TOOL_NAMES.sort(),
    ['browse_page', 'git_history', 'github_lookup', 'ocr_image', 'screenshot_page', 'web_fetch', 'web_search', 'workspace_list', 'workspace_read', 'workspace_write'].sort(),
  );
  for (const [name, tool] of Object.entries(W.WEB_TOOLS)) {
    assert.equal(tool.contract.name, name, `${name} disagrees with its own contract name`);
    assert.ok(tool.contract.description.length > 40, `${name} has no usable description`);
  }
});

/* ------------------------------------------------------------ the allowlist --- */

test('the default policy allows Roblox and GitHub and nothing else', () => {
  const { policy, errors } = W.webPolicy({});
  assert.deepEqual(errors, []);
  assert.deepEqual([...policy.hosts], [...W.DEFAULT_WEB_HOSTS]);
});

test('a deployment can ADD hosts, and never silently replace the built-ins', () => {
  const { policy, errors } = W.webPolicy({ WEB_TOOL_ALLOWLIST: 'docs.example.com, .example.org ' });
  assert.deepEqual(errors, []);
  assert.ok(policy.hosts.includes('docs.example.com'));
  assert.ok(policy.hosts.includes('.example.org'));
  assert.ok(policy.hosts.includes('api.github.com'), 'the built-in hosts were dropped');
});

test('a malformed allowlist applies NOTHING and says what was wrong', () => {
  const { policy, errors } = W.webPolicy({ WEB_TOOL_ALLOWLIST: '*,docs.example.com' });
  assert.ok(errors.length > 0, 'the wildcard was accepted in silence');
  assert.equal(policy.hosts.includes('docs.example.com'), false, 'a partially-applied allowlist is the dangerous outcome');
  assert.ok(policy.hosts.includes('api.github.com'), 'and the built-ins still stand');
});

/* ------------------------------------------------------ repositories and refs --- */

test('a repository off the allowlist is refused, however well-formed it is', () => {
  assert.equal(W.checkRepo('Roblox/creator-docs', W.DEFAULT_REPO_ALLOWLIST).ok, true);
  for (const repo of ['attacker/private-thing', 'roblox-evil/x', 'Roblox']) {
    assert.equal(W.checkRepo(repo, W.DEFAULT_REPO_ALLOWLIST).ok, false, `${repo} was allowed`);
  }
});

test('a repository name cannot be a path escape', () => {
  for (const repo of ['../../etc/passwd', 'Roblox/../secret', 'Roblox/a/b', 'Roblox/..']) {
    assert.equal(W.checkRepo(repo, ['Roblox/*']).ok, false, `${repo} was allowed`);
  }
});

test('"owner/*" scopes an owner; a bare "*" entry opens nothing', () => {
  assert.equal(W.checkRepo('roblox/anything', ['Roblox/*']).ok, true, 'owner matching is case-insensitive');
  for (const wildcard of ['*', '*/*', '']) {
    assert.equal(W.checkRepo('attacker/x', [wildcard]).ok, false, `an entry of "${wildcard}" admitted everything`);
  }
});

test('a git ref that is really a command-line option, or a range, is refused', () => {
  for (const ref of ['--upload-pack=evil', '-x', 'main..evil', 'refs/heads/../x', 'a b', 'main.lock', 'main.', '/main', 'a//b', 'HEAD@{1}', 'a~1', 'a^2', 'a:b', 'a?', 'a*', 'a[b', 'a\\b']) {
    assert.equal(W.checkGitRef(ref).ok, false, `${JSON.stringify(ref)} was accepted as a ref`);
  }
});

test('and the refs people actually use still work', () => {
  for (const ref of ['main', 'refs/heads/main', 'v1.2.3', 'release/2026-01', '9f2c40b7e6d1', 'feature_x-1']) {
    assert.equal(W.checkGitRef(ref).ok, true, `${ref} was refused`);
  }
});

/* -------------------------------------------------------------- paths -------- */

test('a workspace path cannot escape the workspace', () => {
  for (const path of ['../../etc/passwd', '/etc/passwd', 'C:\\Windows\\x.txt', 'notes\\plan.md', 'notes/../../x.md', './x.md', 'a//b.md', 'notes/', '']) {
    assert.equal(W.checkWorkspacePath(path).ok, false, `${JSON.stringify(path)} was accepted`);
  }
  assert.equal(W.checkWorkspacePath('notes/plan.md').ok, true);
  assert.equal(W.checkWorkspacePath('a/b/c/d/plan.md').ok, true);
});

test('a workspace path may only name a workspace file type', () => {
  for (const path of ['run.exe', 'x.sh', 'noextension', 'secrets.env']) {
    assert.equal(W.checkWorkspacePath(path).ok, false, `${path} was accepted`);
  }
  for (const path of ['plan.md', 'data.json', 'module.luau', 'notes.txt']) {
    assert.equal(W.checkWorkspacePath(path).ok, true, `${path} was refused`);
  }
});

test('depth and length are bounded, so one call cannot write a pathological key', () => {
  assert.equal(W.checkWorkspacePath('a/b/c/d/e/f/g/h/i.md').ok, false);
  assert.equal(W.checkWorkspacePath('x'.repeat(250) + '.md').ok, false);
});

/* --------------------------------------------------------------- HTML reading --- */

test('page text drops scripts and styles WITH their contents', () => {
  const text = W.pageText(PAGE);
  assert.equal(text.includes('do not read me'), false, 'inline script source was read as page text');
  assert.equal(text.includes('color:red'), false, 'a stylesheet was read as page text');
  assert.match(text, /A character’s controller\./, 'and the entity was decoded');
});

test('an entity that names an Object member is left alone rather than resolved', () => {
  // `ENTITIES[body]` without an own-property check turns `&constructor;` into a function source.
  const decoded = W.decodeEntities('a &constructor; b &toString; c &amp; d &#65; e');
  assert.equal(decoded.includes('native code'), false);
  assert.match(decoded, /&constructor;/);
  assert.match(decoded, /c & d A e/);
});

test('a page with no title reports that, rather than an empty title', () => {
  assert.equal(W.pageTitle('<html><body>hi</body></html>'), null);
  assert.equal(W.pageTitle(PAGE), 'Humanoid & you');
});

test('links are resolved against the page and filtered to the allowlist, with refusals counted', () => {
  const { links, offAllowlist } = W.pageLinks(PAGE, 'https://create.roblox.com/docs/humanoid', W.webPolicy({}).policy);
  assert.deepEqual(links.map((l) => l.href), ['https://create.roblox.com/docs/next']);
  assert.equal(offAllowlist, 1, 'the off-allowlist link was dropped without being counted');
  assert.equal(links[0].text, 'next page');
});

/* ------------------------------------------------------------------ web_fetch --- */

test('web_fetch reads an allowlisted page', async () => {
  const { impl, calls } = net(htmlPage);
  const r = await run('web_fetch', { url: 'https://create.roblox.com/docs' }, { fetchImpl: impl });
  assert.equal(r.error, undefined);
  assert.match(r.content, /Humanoid/);
  assert.equal(r.status, 200);
  assert.deepEqual(calls, ['https://create.roblox.com/docs']);
});

test('web_fetch REFUSES an off-allowlist host without making the request', async () => {
  const { impl, calls } = net(htmlPage);
  const r = await run('web_fetch', { url: 'https://evil.example/exfil' }, { fetchImpl: impl });
  assertNotAnObservation(r, ['content', 'body', 'text']);
  assert.deepEqual(calls, [], 'the request was made anyway');
});

test('web_fetch refuses an invalid argument before it reaches the network', async () => {
  const { impl, calls } = net(htmlPage);
  for (const args of [{}, { url: 'https://create.roblox.com/docs', maxChars: Number.NaN }, { uri: 'https://create.roblox.com' }]) {
    const r = await run('web_fetch', args, { fetchImpl: impl });
    assert.equal(typeof r.error, 'string', `${JSON.stringify(args)} was accepted`);
  }
  assert.deepEqual(calls, [], 'an unvalidated argument reached the network');
});

test('web_fetch surfaces a network failure as a failure', async () => {
  const { impl } = net(new Error('connection reset'));
  const r = await run('web_fetch', { url: 'https://create.roblox.com/docs' }, { fetchImpl: impl });
  assertNotAnObservation(r, ['content', 'body']);
  assert.equal(r.failure.kind, 'network');
});

/* ---------------------------------------------------------------- browse_page --- */

test('browse_page returns readable text, a title, or links — never markup', async () => {
  const { impl } = net(htmlPage);
  const text = await run('browse_page', { url: 'https://create.roblox.com/docs' }, { fetchImpl: impl });
  assert.equal(text.title, 'Humanoid & you');
  assert.equal(text.text.includes('<'), false, 'markup leaked into the extracted text');

  const links = await run('browse_page', { url: 'https://create.roblox.com/docs', extract: 'links' }, { fetchImpl: impl });
  assert.equal(links.offAllowlist, 1);
  assert.equal(links.links.length, 1);
});

test('A BLOCKED browse_page IS AN ERROR, NOT AN EMPTY PAGE', async () => {
  const { impl } = net(htmlPage);
  const r = await run('browse_page', { url: 'https://evil.example/x' }, { fetchImpl: impl });
  assertNotAnObservation(r, ['text', 'links', 'title']);
});

test('CONTROL: a page that really has no readable text says so, and still succeeds', async () => {
  // Without this control, the rule above could be satisfied by a tool that never returns anything
  // empty — which would be a different bug: a real empty page reported as a failure.
  const { impl } = net({ status: 200, headers: { 'content-type': 'text/html' }, body: '<html><body><img src="x.png"></body></html>' });
  const r = await run('browse_page', { url: 'https://create.roblox.com/empty' }, { fetchImpl: impl });
  assert.equal(r.error, undefined);
  assert.equal(r.text, '');
  assert.equal(r.extractedChars, 0);
  assert.match(r.note, /fetched successfully/);
});

/* ----------------------------------------------------------------- web_search --- */

test('WEB_SEARCH WITH NO PROVIDER IS AN ERROR, NEVER AN EMPTY RESULT LIST', async () => {
  // The headline case. `{results: []}` reads to a model as "the web contains nothing about this",
  // which is a claim about the world that this deployment is in no position to make.
  const { impl, calls } = net(json({ results: [] }));
  const r = await run('web_search', { query: 'humanoid state' }, { fetchImpl: impl });
  assertNotAnObservation(r, ['results', 'searched']);
  assert.equal(r.failure.kind, 'not_configured');
  assert.deepEqual(calls, []);
});

test('a search endpoint that is not itself allowlisted is a misconfiguration, and is reported', async () => {
  const { impl, calls } = net(json({ results: [] }));
  const env = { SEARCH_API_URL: 'https://search.example.com/q' };
  const r = await run('web_search', { query: 'humanoid' }, { fetchImpl: impl, env });
  assertNotAnObservation(r, ['results']);
  assert.match(r.error, /allowlist/i);
  assert.deepEqual(calls, []);
});

const SEARCH_ENV = { SEARCH_API_URL: 'https://search.example.com/q', WEB_TOOL_ALLOWLIST: 'search.example.com' };

test('a configured search returns rows, and drops the ones the allowlist would not let it read', async () => {
  const { impl, calls } = net(
    json({
      results: [
        { title: 'Humanoid', url: 'https://create.roblox.com/docs/humanoid', snippet: 'the controller' },
        { title: 'Malware', url: 'https://evil.example/drive-by', snippet: 'click here' },
      ],
    }),
  );
  const r = await run('web_search', { query: 'humanoid' }, { fetchImpl: impl, env: SEARCH_ENV });
  assert.equal(r.error, undefined);
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].url, 'https://create.roblox.com/docs/humanoid');
  assert.equal(r.offAllowlist, 1, 'the dropped row was not counted, so the model cannot tell it was dropped');
  assert.match(calls[0], /q=humanoid/);
});

test('CONTROL: a search that RAN and found nothing is allowed to say so', async () => {
  const { impl } = net(json({ results: [] }));
  const r = await run('web_search', { query: 'nothing at all' }, { fetchImpl: impl, env: SEARCH_ENV });
  assert.equal(r.error, undefined);
  assert.equal(r.searched, true, 'the difference between "no results" and "no search" is this flag');
  assert.deepEqual(r.results, []);
});

test('a search endpoint that answers rubbish is a failure, not an empty search', async () => {
  for (const answer of [
    { status: 200, headers: { 'content-type': 'application/json' }, body: 'not json at all' },
    json({ nope: true }),
    { status: 502, headers: { 'content-type': 'application/json' }, body: '{}' },
  ]) {
    const { impl } = net(answer);
    const r = await run('web_search', { query: 'humanoid' }, { fetchImpl: impl, env: SEARCH_ENV });
    assertNotAnObservation(r, ['results', 'searched']);
  }
});

test('the search key never appears in the result, only in the request', async () => {
  const seen = [];
  const impl = async (url, init) => {
    seen.push(init.headers?.authorization ?? null);
    return { status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify({ results: [] }), arrayBuffer: async () => new ArrayBuffer(0) };
  };
  const env = { ...SEARCH_ENV, SEARCH_API_KEY: 'SENTINEL-search-key' };
  const r = await run('web_search', { query: 'humanoid' }, { fetchImpl: impl, env });
  assert.match(seen[0], /SENTINEL-search-key/, 'the key was not sent, so this test proves nothing');
  assert.equal(JSON.stringify(r).includes('SENTINEL-search-key'), false, 'the credential came back out in the tool result');
});

/* ------------------------------------------------------------ screenshot_page --- */

const SHOT_ENV = { SCREENSHOT_API_URL: 'https://shots.example.com/png', WEB_TOOL_ALLOWLIST: 'shots.example.com' };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('screenshot_page captures a page and hands the pixels to the surface, not to the model', async () => {
  const { impl } = net({ status: 200, headers: { 'content-type': 'image/png' }, buffer: PNG.buffer });
  const shown = [];
  const r = await run(
    'screenshot_page',
    { url: 'https://create.roblox.com/docs', width: 800, height: 600 },
    { fetchImpl: impl, env: SHOT_ENV, showImage: async (b64, subject, meta) => { shown.push({ b64, subject, meta }); return true; } },
  );
  assert.equal(r.error, undefined);
  assert.equal(r.shown, true);
  assert.equal(r.bytes, 8);
  assert.equal(shown.length, 1);
  assert.equal(JSON.stringify(r).includes(shown[0].b64), false, 'the base64 image was put into the model-facing result');
});

test('A ZERO-BYTE CAPTURE IS AN ERROR — a blank image is a picture of a lie', async () => {
  const { impl } = net({ status: 200, headers: { 'content-type': 'image/png' }, buffer: new ArrayBuffer(0) });
  const r = await run('screenshot_page', { url: 'https://create.roblox.com/docs' }, { fetchImpl: impl, env: SHOT_ENV, showImage: async () => true });
  assertNotAnObservation(r, ['bytes', 'shown', 'base64']);
  assert.equal(r.failure.kind, 'empty_body');
});

test('the page to capture is checked BEFORE the renderer is asked, so the renderer cannot launder the allowlist', async () => {
  const { impl, calls } = net({ status: 200, headers: { 'content-type': 'image/png' }, buffer: PNG.buffer });
  const r = await run('screenshot_page', { url: 'https://evil.example/x' }, { fetchImpl: impl, env: SHOT_ENV });
  assertNotAnObservation(r, ['bytes', 'shown']);
  assert.deepEqual(calls, [], 'the rendering service was asked to fetch a host this worker may not reach');
});

test('a screenshot that was captured but cannot be displayed says exactly that', async () => {
  const { impl } = net({ status: 200, headers: { 'content-type': 'image/png' }, buffer: PNG.buffer });
  const r = await run('screenshot_page', { url: 'https://create.roblox.com/docs' }, { fetchImpl: impl, env: SHOT_ENV });
  assert.equal(r.error, undefined);
  assert.equal(r.shown, false);
  assert.match(r.note, /no surface/);
});

test('a screenshot size that is not a real number is refused', async () => {
  const { impl, calls } = net({ status: 200, headers: { 'content-type': 'image/png' }, buffer: PNG.buffer });
  for (const size of [Number.NaN, Infinity, '800', 0, 99999]) {
    const r = await run('screenshot_page', { url: 'https://create.roblox.com/docs', width: size }, { fetchImpl: impl, env: SHOT_ENV });
    assert.equal(typeof r.error, 'string', `width=${String(size)} was accepted`);
  }
  assert.deepEqual(calls, []);
});

/* ------------------------------------------------------------------ ocr_image --- */

const imageAnswer = { status: 200, headers: { 'content-type': 'image/png' }, buffer: PNG.buffer };

test('ocr_image returns the text an engine read', async () => {
  const { impl } = net(imageAnswer);
  const r = await run('ocr_image', { imageUrl: 'https://create.roblox.com/a.png' }, { fetchImpl: impl, readTextFromImage: async () => ({ text: 'PLAY NOW' }) });
  assert.equal(r.error, undefined);
  assert.equal(r.text, 'PLAY NOW');
  assert.equal(r.chars, 8);
});

test('AN ENGINE THAT FAILED IS NOT AN IMAGE WITH NO TEXT IN IT', async () => {
  const { impl } = net(imageAnswer);
  const r = await run('ocr_image', { imageUrl: 'https://create.roblox.com/a.png' }, { fetchImpl: impl, readTextFromImage: async () => ({ error: 'the engine timed out' }) });
  assertNotAnObservation(r, ['text', 'chars']);
  assert.match(r.error, /timed out/);
});

test('CONTROL: an image that genuinely has no text succeeds and says so', async () => {
  const { impl } = net(imageAnswer);
  const r = await run('ocr_image', { imageUrl: 'https://create.roblox.com/a.png' }, { fetchImpl: impl, readTextFromImage: async () => ({ text: '' }) });
  assert.equal(r.error, undefined);
  assert.equal(r.text, '');
  assert.match(r.note, /no legible text/);
});

test('with no engine wired in, ocr_image reports that rather than returning nothing', async () => {
  const { impl } = net(imageAnswer);
  const r = await run('ocr_image', { imageUrl: 'https://create.roblox.com/a.png' }, { fetchImpl: impl });
  assertNotAnObservation(r, ['text', 'chars']);
  assert.equal(r.failure.kind, 'not_configured');
});

test('a body that is not an image is refused rather than transcribed', async () => {
  const { impl } = net(htmlPage);
  let engineCalled = false;
  const r = await run('ocr_image', { imageUrl: 'https://create.roblox.com/a.png' }, { fetchImpl: impl, readTextFromImage: async () => { engineCalled = true; return { text: 'x' }; } });
  assertNotAnObservation(r, ['text']);
  assert.equal(engineCalled, false, 'an HTML page was sent to the vision engine as an image');
});

/* ------------------------------------------------------- github and git ------- */

test('github_lookup reads an allowlisted repository and keeps only readable fields', async () => {
  const { impl, calls } = net(json({ full_name: 'Roblox/creator-docs', description: 'the docs', default_branch: 'main', secret_token: 'nope' }));
  const r = await run('github_lookup', { repo: 'Roblox/creator-docs', resource: 'repo' }, { fetchImpl: impl });
  assert.equal(r.error, undefined);
  assert.equal(r.data.full_name, 'Roblox/creator-docs');
  assert.equal('secret_token' in r.data, false, 'the whole upstream row was spread into the result');
  assert.match(calls[0], /^https:\/\/api\.github\.com\/repos\/Roblox\/creator-docs$/);
});

test('github_lookup refuses a repository off the allowlist without contacting GitHub', async () => {
  const { impl, calls } = net(json({}));
  const r = await run('github_lookup', { repo: 'attacker/private', resource: 'repo' }, { fetchImpl: impl });
  assert.equal(typeof r.error, 'string');
  assert.deepEqual(calls, []);
});

test('github_lookup will not read an issue without a number', async () => {
  const { impl } = net(json({}));
  const r = await run('github_lookup', { repo: 'Roblox/creator-docs', resource: 'issue' }, { fetchImpl: impl });
  assert.match(r.error, /number/);
});

test('git_history log names the commits, and refuses a ref that is an option', async () => {
  const { impl, calls } = net(json([{ sha: '9f2c40b7e6d1aa', commit: { message: 'fix the thing\n\ndetail', author: { name: 'A', date: '2026-01-01' } } }]));
  const r = await run('git_history', { repo: 'Roblox/creator-docs', action: 'log', ref: 'main', limit: 5 }, { fetchImpl: impl });
  assert.equal(r.error, undefined);
  assert.equal(r.commits[0].sha, '9f2c40b7e6d1');
  assert.equal(r.commits[0].message, 'fix the thing', 'only the subject line belongs in a log');

  const refused = await run('git_history', { repo: 'Roblox/creator-docs', action: 'log', ref: '--upload-pack=evil' }, { fetchImpl: impl });
  assert.match(refused.error, /ref:/);
  assert.equal(calls.length, 1, 'the bad ref still produced a request');
});

test('git_history diff needs both ends, and ls_files passes GitHub truncation through', async () => {
  const { impl } = net(json({ truncated: true, tree: [{ type: 'blob', path: 'a.md' }, { type: 'tree', path: 'dir' }] }));
  const missing = await run('git_history', { repo: 'Roblox/creator-docs', action: 'diff', ref: 'main' }, { fetchImpl: impl });
  assert.match(missing.error, /base/);

  const ls = await run('git_history', { repo: 'Roblox/creator-docs', action: 'ls_files', ref: 'main' }, { fetchImpl: impl });
  assert.equal(ls.treeTruncated, true, 'a partial listing reported as a complete one is the worst kind of answer');
  assert.deepEqual(ls.files, ['a.md'], 'a tree entry is not a file');
});

test('git_history refuses an action outside its enum', async () => {
  const { impl, calls } = net(json([]));
  const r = await run('git_history', { repo: 'Roblox/creator-docs', action: 'push' }, { fetchImpl: impl });
  assert.match(r.error, /must be one of/);
  assert.deepEqual(calls, [], 'an unknown action reached the network');
});

/* -------------------------------------------------------------- the workspace --- */

test('a workspace write and read round-trips', async () => {
  const { store } = spyWorkspace();
  const w = await run('workspace_write', { path: 'notes/plan.md', content: '# plan\n\n- do the thing\n' }, { workspace: store });
  assert.equal(w.error, undefined);
  assert.equal(w.created, true);
  const r = await run('workspace_read', { path: 'notes/plan.md' }, { workspace: store });
  assert.match(r.content, /do the thing/);
  const l = await run('workspace_list', {}, { workspace: store });
  assert.deepEqual(l.files.map((f) => f.path), ['notes/plan.md']);
});

test('A MISSING FILE IS AN ERROR, NOT EMPTY CONTENT', async () => {
  // `{content: ''}` is exactly what a real, empty file looks like. A model cannot tell the two
  // apart from the result, and it will happily reason from a file that does not exist.
  const { store } = spyWorkspace();
  const r = await run('workspace_read', { path: 'notes/missing.md' }, { workspace: store });
  assertNotAnObservation(r, ['content', 'bytes']);
});

test('CONTROL: a file that is genuinely empty reads back as empty content, successfully', async () => {
  const { store } = spyWorkspace({ 'notes/blank.md': '' });
  const r = await run('workspace_read', { path: 'notes/blank.md' }, { workspace: store });
  assert.equal(r.error, undefined);
  assert.equal(r.content, '');
  assert.equal(r.bytes, 0);
});

test('a traversing path never reaches the store at all', async () => {
  const { store, calls } = spyWorkspace({ 'notes/plan.md': 'x' });
  for (const path of ['../../etc/passwd', '/etc/passwd', 'notes/../../escape.md']) {
    const read = await run('workspace_read', { path }, { workspace: store });
    const write = await run('workspace_write', { path, content: 'pwned' }, { workspace: store });
    assert.equal(typeof read.error, 'string', `${path} was read`);
    assert.equal(typeof write.error, 'string', `${path} was written`);
  }
  assert.deepEqual(calls, [], `the store was touched: ${JSON.stringify(calls)}`);
});

test('a file larger than the limit is refused rather than truncated into the store', async () => {
  const { store, calls } = spyWorkspace();
  const r = await run('workspace_write', { path: 'big.txt', content: 'x'.repeat(W.WORKSPACE_MAX_BYTES + 1) }, { workspace: store });
  assert.equal(typeof r.error, 'string');
  assert.deepEqual(calls, []);
});

test('without a project there is no workspace, and the tool says so instead of inventing one', async () => {
  const r = await W.runWebTool('workspace_read', { env: {}, projectId: undefined }, { path: 'notes/plan.md' });
  assert.match(r.error, /no project/);
});

test('the KV-backed store keys every file by project, which is the authorisation', async () => {
  const puts = [];
  const kv = {
    get: async () => null,
    put: async (k, v, opts) => puts.push({ k, v, opts }),
    list: async ({ prefix }) => ({ keys: [{ name: prefix + 'notes/plan.md', metadata: { bytes: 4, updatedAt: 7 } }] }),
  };
  const store = W.kvWorkspace(kv, 'project-A');
  await store.write('notes/plan.md', 'hi');
  assert.equal(puts[0].k, 'ws:project-A:notes/plan.md', 'a key without the project in it is readable by any project');
  const listed = await store.list('');
  assert.deepEqual(listed, [{ path: 'notes/plan.md', bytes: 4, updatedAt: 7 }]);
});

test('a KV row with no size metadata reports "not recorded" rather than a confident zero', async () => {
  const kv = { get: async () => null, put: async () => {}, list: async ({ prefix }) => ({ keys: [{ name: prefix + 'old.md' }] }) };
  const listed = await W.kvWorkspace(kv, 'p').list('');
  assert.equal(listed[0].bytes, -1, 'an unrecorded size rendered as an observation of zero bytes');
});

/* ------------------------------------------------------------- availability --- */

test('a tool that cannot work here says which binding is missing', () => {
  const none = W.webToolAvailability({});
  assert.equal(none.web_search.ok, false);
  assert.match(none.web_search.why, /SEARCH_API_URL/);
  assert.equal(none.screenshot_page.ok, false);
  assert.match(none.screenshot_page.why, /SCREENSHOT_API_URL/);
  assert.equal(none.web_fetch.ok, true, 'the tools that need nothing must still be available');

  const configured = W.webToolAvailability({ SEARCH_API_URL: 'https://s.example.com', SCREENSHOT_API_URL: 'https://p.example.com' });
  assert.equal(configured.web_search.ok, true);
  assert.equal(configured.screenshot_page.ok, true);
});

test('an absurd argument payload is refused before the validator walks it', async () => {
  const { impl, calls } = net(htmlPage);
  const r = await run('web_fetch', { url: 'https://create.roblox.com/docs', maxChars: 'x'.repeat(70_000) }, { fetchImpl: impl });
  assert.match(r.error, /past the .* limit/);
  assert.deepEqual(calls, []);
  // CONTROL: an ordinary payload is nowhere near the cap and still works.
  const okResult = await run('web_fetch', { url: 'https://create.roblox.com/docs' }, { fetchImpl: impl });
  assert.equal(okResult.error, undefined);
});

test('an unknown tool name is refused rather than dispatched', async () => {
  const r = await W.runWebTool('rm_rf', { env: {} }, {});
  assert.match(r.error, /unknown web tool/);
});

test('the read-only list really is read-only, and names only real tools', () => {
  for (const name of W.READ_ONLY_WEB_TOOLS) {
    assert.ok(name in W.WEB_TOOLS, `${name} is not a tool, so listing it guards nothing`);
    assert.equal(name.includes('write'), false, `${name} can write and is on the read-only list`);
  }
  assert.equal(W.READ_ONLY_WEB_TOOLS.includes('workspace_write'), false);
  assert.equal(W.READ_ONLY_WEB_TOOLS.length, W.WEB_TOOL_NAMES.length - 1, 'workspace_write is the only write; if that changed, this list did not');
});
