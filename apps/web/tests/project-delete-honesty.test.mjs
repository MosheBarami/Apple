/**
 * "DELETED" WAS SAID OVER A PURGE THAT FAILED, and the row that could have found the survivors was
 * then removed.
 *
 * The worker has always answered honestly: `ok: res.ok && failed.length === 0`, with `failed`
 * naming every store that refused. The dashboard awaited that response and read none of it — it
 * deleted the Supabase registry row and toasted `"<name>" deleted` whatever came back.
 *
 * WHY THAT IS THE WORST ORDER AVAILABLE. The registry row is the only thing that can find a
 * project's data again. Removing it after a partial purge does not leave data behind; it leaves
 * data behind UNREACHABLE — by the customer, by support, and by a retry — while the product says
 * it is gone. A deletion that reports success it did not achieve is the one failure this product
 * cannot ask forgiveness for, because the person has already stopped looking.
 *
 * These read the shipped source. A behavioural test would need Supabase and the worker; what has to
 * be true is an ORDER and a BRANCH, and both are visible.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, '..', 'src', 'routes', 'dashboard.tsx'), 'utf8');
const API = readFileSync(join(HERE, '..', 'src', 'lib', 'api.ts'), 'utf8');

/** The delete mutation's body, so an assertion cannot pass on a different part of the file. */
const handler = (() => {
  const start = SRC.indexOf('function DeleteProjectModal');
  assert.ok(start > 0, 'DeleteProjectModal is gone — re-aim this file before trusting it');
  const end = SRC.indexOf('\n}', SRC.indexOf('useMutation', start));
  return SRC.slice(start, end);
})();

test('THE PURGE RESULT IS READ, not awaited and discarded', () => {
  assert.match(handler, /const\s+purge\s*=\s*await\s+purgeProject\(/,
    'the purge response is thrown away again — `await purgeProject(...)` with no binding is exactly ' +
    'the shape that let "deleted" be said over a failure');
  assert.match(handler, /if\s*\(!purge\.ok\)/, 'nothing branches on whether the purge succeeded');
});

test('A FAILED PURGE DOES NOT REACH THE ROW DELETE — the order is the whole property', () => {
  const guard = handler.indexOf('if (!purge.ok)');
  const rowDelete = handler.indexOf("supabase.from('projects').delete()");
  assert.ok(guard > 0 && rowDelete > 0, 'one of the two halves is gone');
  assert.ok(guard < rowDelete,
    'the registry row is deleted before the purge result is checked, which is how surviving data ' +
    'becomes unreachable while the product says it is gone');
  // And the guard must actually stop: a branch that only logs is not a guard.
  const between = handler.slice(guard, rowDelete);
  assert.match(between, /throw new Error\(/, 'the failure branch does not stop the delete');
});

test('the customer is told WHICH stores survived, not that something went wrong', () => {
  assert.match(handler, /purge\.failed/, 'the names the worker sends back are not used');
  assert.match(handler, /still listed/, 'the message does not say the project is still there');
  assert.match(handler, /try again/i, 'the message does not say what to do next');
});

test('the client type carries `failed`, or the message above has nothing to name', () => {
  assert.match(API, /export interface PurgeResult/);
  assert.match(API, /failed\?:\s*string\[\]/);
  assert.match(API, /request<PurgeResult>/, 'purgeProject still declares a narrower response than it gets');
});

test('the success toast is unreachable from a failed purge', () => {
  // Falsification of the design rather than the code: `onSuccess` is react-query's, so the only way
  // to reach it is for mutationFn to RETURN. The throw above is what makes that impossible, and
  // this asserts the two are in the same function rather than in two that drifted apart.
  assert.match(handler, /onSuccess:/);
  const success = handler.indexOf('onSuccess:');
  assert.ok(handler.indexOf('if (!purge.ok)') < success, 'the guard is not inside the mutation');
});
