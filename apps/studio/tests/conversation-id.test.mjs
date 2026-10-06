import test from 'node:test';
import assert from 'node:assert/strict';
import { projectOf } from '../src/conversation-id.ts';

const P = '1ea443f2-6232-43c1-a8bd-f425e2df4f4d';

test('a project id, or a project id and a chat name, names that project', () => {
  assert.equal(projectOf(P), P);
  assert.equal(projectOf(`${P}~eval-u01-20261006`), P);
});

test('anything else names no project, so the route refuses it', () => {
  for (const bad of ['', P.toUpperCase(), `${P}~`, `${P}~Chat`, `${P}~a/b`, `${P}~${'a'.repeat(49)}`, `x${P}`, `${P}x`, `${P}~ok~more`, '../etc']) {
    assert.equal(projectOf(bad), null, bad);
  }
});
