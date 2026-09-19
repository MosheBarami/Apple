/**
 * A CHECKPOINT CAN SAY WHAT IT IS, AND THE DRAWER SHOWS IT.
 *
 * The row carried a name capped at 60 characters and three derived numbers — a timestamp, an
 * object count, a script count. None of them says what is IN the snapshot or why it was taken,
 * which is the only thing that makes a list of twenty of them choosable.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const WS = readFileSync(join(WEB, 'src', 'routes', 'workspace.tsx'), 'utf8');
const SOCKET = readFileSync(join(WEB, 'src', 'lib', 'use-project-socket.ts'), 'utf8');

test('there is a field to write one in', () => {
  assert.match(WS, /<textarea[\s\S]{0,400}aria-label="What this checkpoint contains"/);
});

test('it is optional, because a save taken mid-thought must stay cheap', () => {
  // `|| undefined` rather than `|| ''`: the frame omits the field entirely when nothing was
  // written, so the worker stores null and "nobody wrote one" stays distinguishable from "".
  assert.match(WS, /createCheckpoint\(label\.trim\(\) \|\| 'manual checkpoint', note\.trim\(\) \|\| undefined\)/);
  assert.match(SOCKET, /description \? \{ type: 'checkpoint_create', label, description \}/);
});

test('the field is cleared after a save', () => {
  // A description left behind reappears on the NEXT checkpoint and describes the wrong snapshot —
  // worse than no description, because it reads as authored fact.
  const at = WS.indexOf('createCheckpoint(label.trim()');
  assert.match(WS.slice(at, at + 200), /setNote\(''\)/);
});

test('the description is rendered on the row', () => {
  assert.match(WS, /\{c\.description && <span className="gx-cp__desc">\{c\.description\}<\/span>\}/);
});

test('the class it renders with actually has styles', () => {
  // The members panel shipped with no styles because it had no call site; an unstyled block reads
  // as a broken page rather than as a description.
  const css = readFileSync(join(WEB, 'src', 'design', 'system.css'), 'utf8');
  assert.match(css, /\.gx-cp__desc \{/);
  assert.match(css, /\.gx-cp__note \{/);
});

test('the wire type carries it', () => {
  const shared = readFileSync(join(WEB, '..', '..', 'packages', 'shared', 'src', 'index.ts'), 'utf8');
  assert.match(shared, /type: 'checkpoint_create'; label: string; description\?: string/);
  const meta = shared.slice(shared.indexOf('export interface CheckpointMeta'));
  assert.match(meta.slice(0, 2000), /description\?: string \| null/);
});
