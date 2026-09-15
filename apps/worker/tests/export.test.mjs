// Conversation export: the file the user keeps.
//
// The thing that must not happen here is a file that LOOKS complete. `/messages` pages backwards
// and caps at 100, so the cheap version of this feature returns the most recent hundred, calls
// itself the transcript, and is only discovered to be wrong by the person who needed the part that
// was cut. Every test below is either "nothing is silently dropped" or "nothing user-written
// escapes the structure it is printed into".
//
// The renderer is imported and CALLED, not grepped. A source-fact test would pass on a renderer
// that never runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const out = join(tmpdir(), `apple-export-${process.pid}.mjs`);
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
  join(WORKER, 'src', 'export.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${out}`,
], { cwd: WORKER, stdio: 'pipe' });
const { renderTranscriptMarkdown, exportFilename } = await import(`file://${out}`);
process.on('exit', () => rmSync(out, { force: true }));

const msg = (i, over = {}) => ({
  id: `m${i}`,
  role: i % 2 ? 'assistant' : 'user',
  mode: null,
  content: `message number ${i}`,
  toolTrace: null,
  createdAt: `2026-09-${String((i % 28) + 1).padStart(2, '0')}T10:00:00.000Z`,
  ...over,
});

const doc = (messages, over = {}) => ({
  project: { id: 'p1', name: 'Tower Defence' },
  exportedAt: '2026-09-14T12:00:00.000Z',
  messageCount: messages.length,
  totalMessages: messages.length,
  truncated: false,
  messages,
  ...over,
});

// ------------------------------------------------------------- completeness ---

test('every message reaches the file', () => {
  const messages = Array.from({ length: 250 }, (_, i) => msg(i));
  const md = renderTranscriptMarkdown(doc(messages));
  for (const m of messages) {
    assert.ok(md.includes(m.content), `${m.id} is missing from the export`);
  }
  // And the count of role headings matches, so a message cannot be present as text while its
  // attribution was dropped.
  assert.equal(md.split('\n').filter((l) => /^## (You|Apple)$/.test(l)).length, 250);
});

test('a clipped transcript says so at the top, before anyone reads it as complete', () => {
  const messages = Array.from({ length: 3 }, (_, i) => msg(i));
  const md = renderTranscriptMarkdown(doc(messages, { truncated: true, messageCount: 3, totalMessages: 9001 }));
  const banner = md.indexOf('This export is incomplete');
  assert.ok(banner > 0, 'a truncated export must announce it');
  assert.ok(banner < md.indexOf('message number 0'), 'the warning must precede the transcript, not follow it');
  assert.match(md, /3 of 9001/);
});

test('a complete transcript carries no incompleteness warning', () => {
  // The positive control for the test above: if the banner were unconditional, that test would
  // pass on a renderer that always cries wolf.
  const md = renderTranscriptMarkdown(doc([msg(0)]));
  assert.equal(md.includes('This export is incomplete'), false);
});

test('an empty conversation renders a valid file rather than throwing', () => {
  const md = renderTranscriptMarkdown(doc([], { totalMessages: 0 }));
  assert.match(md, /# Tower Defence/);
  assert.match(md, /0 of 0 messages/);
});

test('an unnamed project still produces a titled document', () => {
  const md = renderTranscriptMarkdown(doc([msg(0)], { project: { id: 'p1', name: null } }));
  assert.match(md, /^# Untitled project/);
});

// ---------------------------------------------------------------- tool trace ---

test('the tool trace is kept, and a failure reads as a failure', () => {
  const md = renderTranscriptMarkdown(doc([
    msg(1, { toolTrace: [{ tool: 'write_script', summary: 'DoorService.luau', ok: true },
                          { tool: 'run_playtest', summary: 'timed out', ok: false }] }),
  ]));
  assert.match(md, /- ok · `write_script` — DoorService\.luau/);
  assert.match(md, /- FAILED · `run_playtest` — timed out/);
  assert.match(md, /<details><summary>What ran<\/summary>/);
  assert.match(md, /<\/details>/);
});

test('a trace row with no ok field counts as having run, not as having failed', () => {
  // Older rows predate the flag. Defaulting the other way prints a history in which everything
  // failed, which is a false record rather than a cautious one.
  const md = renderTranscriptMarkdown(doc([msg(1, { toolTrace: [{ tool: 'read_place', summary: 'ok' }] })]));
  assert.match(md, /- ok · `read_place`/);
  assert.equal(md.includes('FAILED'), false);
});

test('a trace that is not an array is ignored instead of crashing the export', () => {
  for (const trace of [null, undefined, 'nonsense', 42, { tool: 'x' }]) {
    const md = renderTranscriptMarkdown(doc([msg(0, { toolTrace: trace })]));
    assert.equal(md.includes('<details>'), false, `trace ${JSON.stringify(trace)} produced a block`);
    assert.ok(md.includes('message number 0'));
  }
});

test('a tool summary cannot close the details block it lives inside', () => {
  // The block is HTML. A summary containing a closing details tag would end it early and spill the
  // rest of the run into the page as raw markup.
  const md = renderTranscriptMarkdown(doc([
    msg(1, { toolTrace: [{ tool: 'write_script', summary: '</details><script>alert(1)</script>', ok: true }] }),
  ]));
  assert.equal(md.split('</details>').length - 1, 1, 'exactly one close tag — the real one');
  assert.equal(md.includes('<script>'), false);
  assert.match(md, /&lt;\/details&gt;/);
});

test('a tool NAME is escaped too, not just its summary', () => {
  const md = renderTranscriptMarkdown(doc([msg(1, { toolTrace: [{ tool: '</details>x', summary: '', ok: true }] })]));
  assert.equal(md.split('</details>').length - 1, 1);
});

// ------------------------------------------------------------------ filename ---

test('the filename is derived from the project name', () => {
  assert.equal(exportFilename('Tower Defence', '2026-09-14T12:00:00.000Z', 'md'), 'tower-defence-2026-09-14.md');
  assert.equal(exportFilename('Tower Defence', '2026-09-14T12:00:00.000Z', 'json'), 'tower-defence-2026-09-14.json');
});

test('a project name cannot break out of the Content-Disposition header', () => {
  // The name is user-controlled and lands inside a quoted header value. A quote ends the string; a
  // carriage return or newline ends the HEADER and starts another one.
  const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
  for (const name of [
    'a"; filename="evil.sh',
    `a${CR}${LF}Set-Cookie: session=stolen`,
    `a${LF}X-Injected: 1`,
    '../../etc/passwd',
    `name${String.fromCharCode(0)}null`,
  ]) {
    const f = exportFilename(name, '2026-09-14T00:00:00.000Z', 'json');
    assert.match(f, /^[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.json$/, `${JSON.stringify(name)} produced ${JSON.stringify(f)}`);
  }
});

test('a name with nothing usable in it still yields a filename', () => {
  for (const name of ['', null, '???', '   ', '😀😀']) {
    assert.equal(exportFilename(name, '2026-09-14T00:00:00.000Z', 'md'), 'project-2026-09-14.md');
  }
});

test('a very long name is cut without leaving a trailing dash', () => {
  const f = exportFilename('x'.repeat(200) + ' tail', '2026-09-14T00:00:00.000Z', 'md');
  assert.equal(f, `${'x'.repeat(48)}-2026-09-14.md`);
  assert.equal(f.includes('--'), false);
});

test('a non-ISO timestamp does not leak junk into the filename', () => {
  assert.equal(exportFilename('p', 'not a date', 'json'), 'p-export.json');
});

// --------------------------------------------------------------- the route ---

const INDEX = readFileSync(join(WORKER, 'src', 'index.ts'), 'utf8');
const route = INDEX.slice(INDEX.indexOf("app.get('/api/projects/:id/export'"), INDEX.indexOf("app.get('/api/projects/:id/checkpoints'"));

test('the export route refuses a project the caller does not own', () => {
  // An export is a complete copy of one project's history. This is the single route where a
  // missing ownership check hands over everything at once.
  assert.match(route, /const ctx = await withOwnedProject\(c, c\.req\.param\('id'\)\)/);
  assert.match(route, /if \(!ctx\) return c\.json\(\{ error: 'not found' \}, 404\)/);
  assert.ok(route.indexOf('withOwnedProject') < route.indexOf('stub.fetch'), 'ownership is checked before the DO is read');
});

test('both formats come from one payload, so they cannot disagree', () => {
  assert.equal((route.match(/stub\.fetch\('https:\/\/do\/export'\)/g) ?? []).length, 1);
  assert.match(route, /renderTranscriptMarkdown\(data\)/);
  // WAS `JSON.stringify(data, null, 2)`. The JSON body now carries one added field — a sha256 of
  // its own messages, so the file can be verified after it leaves this origin — and the literal
  // moved with it. The PROPERTY is unchanged and is what is asserted: the JSON is that one payload
  // spread, not a second document assembled from the same DO read.
  assert.match(route, /JSON\.stringify\(\{ \.\.\.data,/);
  assert.match(route, /\}, null, 2\)/);
});

test('the export route is not in the auth exemption list', () => {
  const exempt = /const AUTH_EXEMPT = \[([^\]]*)\]/.exec(INDEX);
  assert.ok(exempt, 'AUTH_EXEMPT must exist');
  assert.equal(exempt[1].includes('export'), false, 'an unauthenticated transcript export is a data leak');
});
