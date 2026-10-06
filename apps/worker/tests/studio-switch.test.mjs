// R6, the switch to the rebuilt Studio app: in place, off, and only for a project's own page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const index = readFileSync(join(WORKER, 'src', 'index.ts'), 'utf8');
const route = index.slice(index.indexOf("app.get('/app/projects/:id'"), index.indexOf("app.get('/app/projects/:id'") + 400);

test('a project page in /app goes to the Studio app only when STUDIO_IS_DEFAULT is exactly true, and only for a project id', () => {
  assert.ok(route.length > 100, 'the switch route is gone');
  assert.match(route, /if \(c\.env\.STUDIO_IS_DEFAULT !== 'true'\) return next\(\);/);
  assert.match(route, /if \(!UUID_RE\.test\(id\)\) return next\(\);/);
  assert.match(route, /c\.redirect\(`\/studio\/projects\/\$\{id\.toLowerCase\(\)\}`, 302\)/);
});

test('the switch is OFF in the deployed config until the smoke test says otherwise', () => {
  const config = readFileSync(join(WORKER, 'wrangler.studpilot.jsonc'), 'utf8');
  assert.doesNotMatch(config, /"STUDIO_IS_DEFAULT"\s*:\s*"true"/);
});
