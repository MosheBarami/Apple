/**
 * The composer's UI theme (V3 UI contract, Q6/Q19): `studded` (default), `cartoony`, `none`.
 *
 * It is UI-only and per request: the worker validates the untrusted frame value (anything else is
 * studded, never a refusal) and adds ONE line to that run's context — the system message of the
 * run's transcript, not the prompt builder in prompts.ts. `none` means Apple picks the UI style; it
 * never means "build no UI".
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'ui-theme-'));
const esbuild = (entry, outfile, extra = []) =>
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [entry, '--bundle', '--format=esm', '--target=es2022', ...extra, '--outfile=' + outfile], { cwd: WORKER, stdio: 'pipe' });

const themeOut = join(tmp, 'theme.mjs');
esbuild(join(WORKER, '..', '..', 'packages', 'shared', 'src', 'ui-theme.ts'), themeOut);
const { asUiTheme, uiThemeContextLine, UI_THEMES, DEFAULT_UI_THEME } = await import(`file://${themeOut}`);

const sessionOut = join(tmp, 'session.mjs');
esbuild(join(WORKER, 'src', 'do', 'session.ts'), sessionOut,
  ['--alias:cloudflare:workers=' + join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs')]);
const { SessionDO } = await import(`file://${sessionOut}`);

function session() {
  const store = new Map([['bind', { projectId: 'p1', projectName: 'Proj', ownerId: 'u1' }]]);
  let attachment = { userId: 'u1', role: 'owner', connectionId: 'c1', activity: 'viewing', lastSeenMs: Date.now() };
  const ws = {
    send: () => {}, readyState: 1,
    deserializeAttachment: () => attachment,
    serializeAttachment: (v) => { attachment = v; },
  };
  const ctx = {
    storage: {
      async get(k) { return store.get(k); },
      async put(a, b) { if (typeof a === 'object' && a !== null) for (const [k, v] of Object.entries(a)) store.set(k, v); else store.set(a, b); },
      async delete(k) { store.delete(k); }, async list() { return new Map(); },
      setAlarm() {}, getAlarm() { return null; },
      sql: { exec: () => ({ toArray: () => [], one: () => null }) },
    },
    blockConcurrencyWhile: (fn) => fn(),
    getWebSockets: () => [ws],
    acceptWebSocket() {},
  };
  const doStub = (body) => ({ idFromName: () => 'id', get: () => ({ fetch: async () => Response.json(body) }) });
  const env = {
    AI: { run: async () => ({ response: 'ok' }) },
    QUOTA_DO: doStub({ ok: true, allowed: true, remaining: 100, credits: 100, plan: 'builder' }),
    BUDGET_DO: doStub({ ok: true, reserved: 10, state: { killed: false } }),
    ADMIN_DO: doStub({ ok: true }),
  };
  const s = new SessionDO(ctx, env);
  s.studioGate = async () => null;
  return {
    async chat(extra) {
      try { await s.webSocketMessage(ws, JSON.stringify({ type: 'chat', text: 'build a shop menu', mode: 'agent', ...extra })); } catch { /* downstream stubs */ }
      return store.get('agent');
    },
  };
}

const LINES = {
  // Studded names its tools: the agent skipped the studded look while other UI tools were offered (owner, 2026-10-01).
  studded: 'UI theme for this request: studded — build every interface in the studded UI style: build_studded_ui (or build_object\'s screen), never insert_ui_component or build_ui.',
  cartoony: 'UI theme for this request: cartoony — build every interface in the cartoony UI style.',
  none: 'UI theme: none — choose the UI style yourself; still build a full UI.',
};

test('exactly three themes, studded is the default, and invalid values fall back to studded', () => {
  assert.deepEqual([...UI_THEMES], ['studded', 'cartoony', 'none']);
  assert.equal(DEFAULT_UI_THEME, 'studded');
  for (const v of ['studded', 'cartoony', 'none']) assert.equal(asUiTheme(v), v);
  for (const v of [undefined, null, '', 'Studded', 'neon', 7, {}, '__proto__', 'constructor']) assert.equal(asUiTheme(v), 'studded');
});

test('each theme has one context line; none still builds a full UI', () => {
  for (const [theme, line] of Object.entries(LINES)) assert.equal(uiThemeContextLine(theme), line);
  assert.match(uiThemeContextLine('none'), /still build a full UI/);
});

test('a chat frame puts its theme line, and only that theme line, in the run context', async () => {
  const control = await session().chat({});
  assert.ok(control, 'the harness must start a run, or every assertion below is vacuous');
  const system = (agent) => agent.llm[0].content;
  assert.ok(system(control).includes(LINES.studded), 'no uiTheme sent -> studded');
  for (const theme of ['studded', 'cartoony', 'none']) {
    const content = system(await session().chat({ uiTheme: theme }));
    assert.ok(content.includes(LINES[theme]), theme);
    for (const other of Object.keys(LINES).filter((t) => t !== theme)) assert.ok(!content.includes(LINES[other]), `${theme} carries ${other}`);
  }
  for (const bad of ['neon', 7, null, { toString: () => 'none' }]) {
    assert.ok(system(await session().chat({ uiTheme: bad })).includes(LINES.studded), String(bad));
  }
});

test('edit_resend carries the theme into the run as chat does', () => {
  const src = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
  assert.equal(src.match(/asUiTheme\(msg\.uiTheme\)/g)?.length, 2, 'chat and edit_resend both read msg.uiTheme');
});
