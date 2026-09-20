// The `apple` CLI: the parser as a pure function, and the binary as a real process.
//
// BOTH LEVELS ON PURPOSE. The parser is where the refusals live and it is cheap to feed bad
// input directly. The process is where exit codes live, and a script that calls this CLI
// branches on them — a CLI that printed an error and exited 0 would break every caller
// while looking correct in a terminal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMANDS, UsageError, parseArgs } from '../src/cli-args.mjs';
import { startServer } from './fake-server.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '../bin/apple.mjs');
const PROJECT = '3f2a1c9e-77b4-4c2a-9a1e-0b8d6e4f1234';

function apple(args, env = {}) {
  return new Promise((resolve) => {
    execFile(process.execPath, [BIN, ...args], { env: { ...process.env, ...env } }, (err, stdout, stderr) => {
      resolve({ code: err?.code ?? 0, stdout, stderr });
    });
  });
}

// ------------------------------------------------------------------ parser

test('an unknown command is an error that names the known ones', () => {
  assert.throws(() => parseArgs(['deploy']), (e) => e instanceof UsageError && /unknown command/.test(e.message));
});

test('an unknown flag is an error, never silently dropped', () => {
  // `--fromat md` must not run the command with the default format and report success.
  assert.throws(() => parseArgs(['export', PROJECT, '--fromat', 'md']), UsageError);
});

test('a flag that takes a value refuses to swallow the next flag as its value', () => {
  // `--limit` IS NOT ENOUGH TO PROVE THIS, and on its own it proved nothing. It is number-typed, so
  // with the swallow guard deleted `Number('--json')` is NaN and the number check throws the same
  // UsageError class — the assertion passes either way, for the wrong reason. Measured: removing
  // `next.startsWith('--')` from src/cli-args.mjs left this test green.
  //
  // The regression only appears on a STRING-typed flag, where nothing downstream objects:
  // `parseArgs(['export', PROJECT, '--format', '--json'])` would yield
  // `{ format: '--json', json: true }` — the user asked to export as JSON and instead named their
  // format "--json" and silently lost the flag they meant.
  assert.throws(() => parseArgs(['messages', PROJECT, '--limit', '--json']), UsageError);
  assert.throws(
    () => parseArgs(['export', PROJECT, '--format', '--json']),
    UsageError,
    'a STRING flag must refuse the next flag as its value — this is the case that isolates the guard',
  );
  // And the message must name the flag that is short of a value, not the one it nearly ate.
  assert.throws(() => parseArgs(['export', PROJECT, '--format', '--json']), /--format/);
});

test('--limit must be a number, so `limit=NaN` never reaches the API', () => {
  assert.throws(() => parseArgs(['messages', PROJECT, '--limit', 'abc']), UsageError);
  assert.equal(parseArgs(['messages', PROJECT, '--limit', '25']).flags.limit, 25);
  assert.equal(parseArgs(['messages', PROJECT, '--limit=25']).flags.limit, 25);
});

test('a missing positional argument is named', () => {
  assert.throws(() => parseArgs(['search', PROJECT]), (e) => /missing query/.test(e.message));
  assert.throws(() => parseArgs(['restore', PROJECT, '--yes']), (e) => /missing checkpointId/.test(e.message));
});

test('a project id that is not a UUID is refused by the CLI, not by a 404', () => {
  assert.throws(() => parseArgs(['messages', 'my-project']), (e) => /is not a project id/.test(e.message));
});

test('a destructive command without --yes is refused, and the refusal is in the PARSER', () => {
  // In the parser rather than in each command body, so the next destructive command cannot
  // be added without it.
  for (const [name, spec] of Object.entries(COMMANDS)) {
    if (!spec.destructive) continue;
    const args = [name, ...spec.args.map((a) => (a === 'projectId' ? PROJECT : 'x'))];
    assert.throws(() => parseArgs(args), (e) => /--yes/.test(e.message), `${name} ran without confirmation`);
    assert.doesNotThrow(() => parseArgs([...args, '--yes']));
  }
});

test('flags may precede the command', () => {
  const parsed = parseArgs(['--json', 'health']);
  assert.equal(parsed.command, 'health');
  assert.equal(parsed.flags.json, true);
});

// ----------------------------------------------------------------- process

test('health prints the worker payload and exits 0', async () => {
  const s = await startServer({ 'GET /api/health': () => ({ body: { ok: true, version: '0.1.0', buildSha: 'abc123' } }) });
  try {
    const r = await apple(['health', '--base-url', s.baseUrl]);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).buildSha, 'abc123');
  } finally {
    await s.close();
  }
});

test('the token comes from APPLE_TOKEN when no --token is given', async () => {
  const s = await startServer({ 'GET /api/me': () => ({ body: { userId: 'u1' } }) });
  try {
    const r = await apple(['me', '--base-url', s.baseUrl], { APPLE_TOKEN: 'from-env' });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(s.requests.at(-1).headers.authorization, 'Bearer from-env');
  } finally {
    await s.close();
  }
});

test('the pre-rename token variable still works, and is not advertised', async () => {
  // TWO ASSERTIONS THAT PULL IN OPPOSITE DIRECTIONS, which is why they share a test: deleting
  // the fallback to satisfy the second would break a shell that still exports the old name, and
  // re-advertising it would put the dead product name back in the sentence the CLI prints most.
  // Either change alone reddens this.
  const s = await startServer({ 'GET /api/me': () => ({ body: { userId: 'u1' } }) });
  try {
    // APPLE_TOKEN is REMOVED from the child's environment rather than set empty: the resolution
    // is `?? `, so an empty string is a value and would legitimately win over the fallback.
    const r = await apple(['me', '--base-url', s.baseUrl], { APPLE_TOKEN: undefined, GOLEM_TOKEN: 'from-old-env' });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(s.requests.at(-1).headers.authorization, 'Bearer from-old-env',
      'the pre-rename environment variable no longer resolves — that breaks a shell that works today');
  } finally {
    await s.close();
  }
  const help = await apple([]);
  assert.equal(help.code, 2, 'bare `apple` still prints usage and exits 2');
  const printed = help.stdout + help.stderr;
  assert.match(printed, /APPLE_TOKEN/, 'the help no longer names the variable it does document');
  assert.doesNotMatch(printed, /golem/i, 'the CLI help still prints the old product name');
});

test('an API error exits 1 and prints the server sentence on stderr', async () => {
  const s = await startServer({ 'GET /api/me': () => ({ status: 401, body: { error: 'unauthorized' } }) });
  try {
    const r = await apple(['me', '--base-url', s.baseUrl, '--token', 'stale']);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /unauthorized/);
    assert.equal(r.stdout, '', 'nothing is printed to stdout on failure');
  } finally {
    await s.close();
  }
});

test('a usage error exits 2 and sends NO request', async () => {
  const s = await startServer({ [`POST /api/projects/${PROJECT}/purge`]: () => ({ body: { ok: true } }) });
  try {
    const r = await apple(['purge', PROJECT, '--base-url', s.baseUrl, '--token', 't']);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /--yes/);
    // The claim is that the purge did not happen, not merely that a message was printed.
    assert.equal(s.requests.length, 0, 'an unconfirmed purge reached the server');

    const confirmed = await apple(['purge', PROJECT, '--yes', '--base-url', s.baseUrl, '--token', 't']);
    assert.equal(confirmed.code, 0, confirmed.stderr);
    assert.equal(s.requests.length, 1);
  } finally {
    await s.close();
  }
});

test('export writes the file the server named', async () => {
  const out = join(tmpdir(), `apple-cli-export-${process.pid}.md`);
  const s = await startServer({
    [`GET /api/projects/${PROJECT}/export`]: () => ({
      headers: { 'Content-Type': 'text/markdown', 'Content-Disposition': 'attachment; filename="tower.md"' },
      body: '# tower\n\nbuilt.\n',
    }),
  });
  try {
    const r = await apple(['export', PROJECT, '--format', 'md', '--out', out, '--base-url', s.baseUrl, '--token', 't']);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(readFileSync(out, 'utf8'), '# tower\n\nbuilt.\n');
    assert.equal(JSON.parse(r.stdout).written, out);
  } finally {
    rmSync(out, { force: true });
    await s.close();
  }
});

test('every command in COMMANDS is implemented — a declared-but-missing one exits 2', async () => {
  // The CLI's switch has a default branch that reports exactly that. This walks the table so
  // adding a command to COMMANDS and forgetting the branch fails here rather than in a user's
  // terminal. Commands are driven against a server that answers everything.
  const routes = {};
  for (const path of [
    '/api/health', '/api/me', '/api/me/usage', '/api/providers', '/api/docs/search',
    `/api/projects/${PROJECT}/messages`, `/api/projects/${PROJECT}/search`,
    `/api/projects/${PROJECT}/memory`, `/api/projects/${PROJECT}/checkpoints`,
    `/api/projects/${PROJECT}/attribution`, `/api/projects/${PROJECT}/roadmap`,
    `/api/projects/${PROJECT}/export`,
  ]) routes[`GET ${path}`] = () => ({ body: { ok: true } });
  for (const path of [
    `/api/projects/${PROJECT}/checkpoints`, `/api/projects/${PROJECT}/restore`,
    `/api/projects/${PROJECT}/pairing`, `/api/projects/${PROJECT}/purge`,
  ]) routes[`POST ${path}`] = () => ({ body: { ok: true } });
  const s = await startServer(routes);
  const written = [];
  try {
    for (const [name, spec] of Object.entries(COMMANDS)) {
      if (name === 'chat') continue; // needs a live socket; covered in stream.test.mjs
      const args = [name, ...spec.args.map((a) => (a === 'projectId' ? PROJECT : 'q'))];
      if (spec.destructive) args.push('--yes');
      if (name === 'export') {
        const out = join(tmpdir(), `apple-cli-all-${process.pid}.json`);
        written.push(out);
        args.push('--out', out);
      }
      const r = await apple([...args, '--base-url', s.baseUrl, '--token', 't']);
      assert.notEqual(r.code, 2, `${name} was declared but not implemented: ${r.stderr}`);
      assert.equal(r.code, 0, `${name} failed: ${r.stderr}`);
    }
  } finally {
    for (const f of written) rmSync(f, { force: true });
    await s.close();
  }
});
