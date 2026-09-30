#!/usr/bin/env node
// Studio proof of the composer: writes <out>/steps.json for a recipe, extracts every library piece it imports with
// lune (packages/owner-corpus/library_extract.luau) into <out>/<key>.b64, and copies run-steps.luau beside them.
// Serve <out> on 127.0.0.1:8765 and run in a THROWAWAY Studio place's command bar:
//   game:GetService('HttpService').HttpEnabled=true loadstring(game:GetService('HttpService'):GetAsync('http://127.0.0.1:8765/run-steps.luau'))()
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const out = process.argv[2] ?? '/private/tmp/claude-501/compose';
const recipeName = process.argv[3] ?? 'orchardRecipe';
mkdirSync(out, { recursive: true });
const bundle = join(out, 'recipes.mjs');
execFileSync(join(ROOT, 'apps/worker/node_modules/.bin/esbuild'), [join(ROOT, 'apps/worker/src/proof-entry.ts'), '--bundle', '--format=esm', '--outfile=' + bundle], { stdio: 'pipe' });
const M = await import(bundle);
const steps = M.composeSteps(M[recipeName]());
writeFileSync(join(out, 'steps.json'), JSON.stringify(steps));
const LIB = join(homedir(), 'Library/Application Support/Apple/owner-library/sources');
const sources = readdirSync(LIB);
const lune = join(homedir(), '.rokit/tool-storage/lune-org/lune/0.10.5/lune');
let n = 0;
for (const s of steps.filter((x) => x.kind === 'import')) {
  // Cached by WHAT the piece is (game + path), never by its step key: keys move when a recipe changes.
  const file = join(out, `piece-${createHash('sha1').update(`${s.ref.game}:${s.ref.path}`).digest('hex').slice(0, 16)}.rbxm`);
  if (!existsSync(file)) {
    const src = sources.find((f) => f.startsWith(s.ref.game) && /\.(rbxl|rbxlx|rbxm|rbxmx)$/.test(f));
    if (!src) { console.error(`no source for ${s.ref.game}`); continue; }
    try {
      const r = execFileSync(lune, ['run', join(ROOT, 'packages/owner-corpus/library_extract.luau'), 'extract', join(LIB, src), s.ref.path, 'self', file], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
      console.log(s.key, s.ref.path, r.trim().split('\n').pop());
    } catch (e) { console.error(`FAILED ${s.key} ${s.ref.game} ${s.ref.path}: ${String(e.stderr || e.message).slice(0, 300)}`); continue; }
  }
  writeFileSync(join(out, `${s.key}.b64`), readFileSync(file).toString('base64'));
  n++;
}
copyFileSync(join(HERE, 'run-steps.luau'), join(out, 'run-steps.luau'));
console.log(`${steps.length} steps, ${n} pieces in ${out}`);
