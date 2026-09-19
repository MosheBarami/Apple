/**
 * The generated-image tool must admit storage before spending and must not turn a failed save
 * into a successful-looking result card.
 *
 * These tests bundle the real tools registry. The model and BudgetDO are local fakes: no provider
 * or network call is made, and the D1 stub is the repository's actual SQLite-backed test binding.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { d1 } from './stubs/d1.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const ESBUILD = join(WORKER, 'node_modules', '.bin', 'esbuild');
const DIRECTORY = mkdtempSync(join(tmpdir(), 'apple-generated-image-tool-'));

function bundle(entry, name) {
  const output = join(DIRECTORY, `${name}.mjs`);
  execFileSync(
    ESBUILD,
    [join(WORKER, 'src', entry), '--bundle', '--format=esm', '--target=es2022', '--platform=node', '--outfile=' + output],
    { cwd: WORKER, stdio: 'pipe' },
  );
  return output;
}

const TOOLS = await import(`file://${bundle('tools.ts', 'tools')}`);
const STORE = await import(`file://${bundle('generated-images.ts', 'generated-images')}`);
process.on('exit', () => rmSync(DIRECTORY, { recursive: true, force: true }));

// A valid raster response, small enough to keep this test deterministic and free.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function budgetStub(calls) {
  return {
    idFromName: () => 'singleton',
    get: () => ({
      async fetch(url, init) {
        const path = new URL(url).pathname;
        calls.push({ path, init });
        if (path === '/reserve') return response({ ok: true, reserved: 1 });
        if (path === '/settle' || path === '/release') return response({ ok: true });
        throw new Error(`unexpected BudgetDO path: ${path}`);
      },
    }),
  };
}

function context({ db, ai, budget, projectId = 'project-image-test' }) {
  return {
    env: {
      CORPUS: db.CORPUS,
      AI: { async run(...args) { return ai(...args); } },
      BUDGET_DO: budgetStub(budget),
    },
    projectId,
    studioConnected: () => false,
    execStudioOp: async () => ({ ok: false, error: 'not used' }),
    createCheckpoint: async () => ({ error: 'not used' }),
    addMemoryFact: async () => 'refused',
  };
}

async function runGenerate(ctx) {
  return TOOLS.runTool(ctx, 'generate_image', JSON.stringify({
    subject: 'a silver crescent moon',
    target: 'ui_icon',
  }));
}

test('storage-full preflight refuses before the paid model or BudgetDO', async () => {
  const db = d1();
  try {
    await STORE.ensureGeneratedImageTables(db);
    for (let i = 0; i < STORE.GENERATED_PROJECT_COUNT; i += 1) {
      db.raw.prepare('INSERT INTO generated_images VALUES (?, ?, ?, ?, ?)')
        .run('project-full', `seed-${i}`, PNG, 1, i);
    }

    let aiCalls = 0;
    const budgetCalls = [];
    const ctx = context({
      db,
      budget: budgetCalls,
      ai: async () => {
        aiCalls += 1;
        throw new Error('the paid model must not run when storage is full');
      },
      projectId: 'project-full',
    });

    const out = await runGenerate(ctx);
    assert.equal(out.ok, false);
    assert.match(out.resultForLlm, /storage is full|deleted/i);
    assert.equal(aiCalls, 0, 'capacity refusal must precede env.AI.run');
    assert.equal(budgetCalls.length, 0, 'capacity refusal must precede BudgetDO reservation');
    assert.equal(out.detail, undefined, 'a refusal cannot carry a success panel');
    assert.equal(ctx.uiDetail, undefined, 'a refusal cannot leave a panel on the context');
    assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM generated_images WHERE project_id = ?').get('project-full').n, STORE.GENERATED_PROJECT_COUNT);
  } finally {
    db.close();
  }
});

test('a save failure is an unsuccessful tool result with no delivery panel', async () => {
  const db = d1();
  try {
    await STORE.ensureGeneratedImageTables(db);
    db.raw.exec(`CREATE TRIGGER fail_generated_image_insert
      BEFORE INSERT ON generated_images
      WHEN NEW.project_id = 'project-save-fails'
      BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END;`);

    const aiCalls = [];
    const budgetCalls = [];
    const ctx = context({
      db,
      budget: budgetCalls,
      ai: async (...args) => {
        aiCalls.push(args);
        return { image: PNG };
      },
      projectId: 'project-save-fails',
    });

    const out = await runGenerate(ctx);
    assert.equal(out.ok, false, 'a failed D1 save must not be reported as a successful tool');
    assert.match(out.resultForLlm, /could not be saved|do not claim successful delivery/i);
    assert.equal(out.detail, undefined, 'a failed save must not emit an asset panel');
    assert.equal(ctx.uiDetail, undefined, 'a failed save must not leave a panel on the context');
    assert.equal(JSON.parse(out.resultForLlm).imageId, undefined, 'a failed save must not return an image id');
    assert.equal(aiCalls.length, 1, 'the local model stub proves the failure happened at storage, after generation');
    assert.equal(budgetCalls.filter((call) => call.path === '/reserve').length, 1);
    assert.equal(budgetCalls.filter((call) => call.path === '/settle').length, 1);
    assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM generated_images WHERE project_id = ?').get('project-save-fails').n, 0);
  } finally {
    db.close();
  }
});
