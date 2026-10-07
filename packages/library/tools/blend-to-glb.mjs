// Recover the colours a pack's exports lost, and read packs that ship only .blend: when a pack has no other model
// file, or every MTL in it carries only Blender's default grey and no texture (the FBX beside it is the same), its
// .blend sources are converted to GLB with Blender's own exporter
// (blend-export.py) into <pack>/blend-glb/, with a manifest.json of where each file came from. ingest-files.mjs then
// prefers the GLB (same model name). Blender runs with --factory-startup --disable-autoexec: no script inside a
// .blend runs. Resumable.
//
//   node packages/library/tools/blend-to-glb.mjs <packs-dir> [pack ...]
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, basename, dirname, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_KD = new Set(['0.640000 0.640000 0.640000', '0.800000 0.800000 0.800000']);
const walk = (d, out = []) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p, out); else out.push(p); } return out; };

/** Whether a pack's exports carry no colour of their own: it has MTL files, and every one holds only default Kd lines and no map_Kd. Pure. */
export function greyExports(mtlTexts) {
  return mtlTexts.length > 0 && mtlTexts.every((t) => {
    const kd = [...t.matchAll(/^Kd (.*)$/gm)].map((m) => m[1].trim());
    return kd.length > 0 && kd.every((k) => DEFAULT_KD.has(k)) && !/^map_Kd/m.test(t);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dir, ...only] = process.argv.slice(2);
  if (!dir) { console.error('usage: blend-to-glb.mjs <packs-dir> [pack ...]'); process.exit(2); }
  const script = join(dirname(fileURLToPath(import.meta.url)), 'blend-export.py');
  const packs = (only.length ? only : readdirSync(dir)).filter((p) => existsSync(join(dir, p, 'fetch.json')));
  for (const pack of packs) {
    const files = walk(join(dir, pack)).filter((f) => !f.includes(`${join(dir, pack, 'blend-glb')}`));
    const blends = files.filter((f) => /\.blend$/i.test(f));
    const others = files.some((f) => /\.(glb|gltf|fbx|obj|dae)$/i.test(f));
    if (!blends.length || (others && !greyExports(files.filter((f) => /\.mtl$/i.test(f)).map((f) => readFileSync(f, 'utf8'))))) continue;
    const outDir = join(dir, pack, 'blend-glb');
    mkdirSync(outDir, { recursive: true });
    const manifestFile = join(outDir, 'manifest.json');
    const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : {};
    const todo = blends.map((src) => ({ src, out: join(outDir, basename(src).replace(/\.blend$/i, '.glb')) })).filter((t) => !manifest[basename(t.out)]);
    const run = (batch) => {
      const list = join(outDir, 'list.json');
      writeFileSync(list, JSON.stringify(batch));
      let log = '';
      try { log = execFileSync('blender', ['--background', '--factory-startup', '--disable-autoexec', '--python', script, '--', list], { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { log = String(e.stdout ?? ''); }
      for (const line of log.split('\n').filter((l) => l.startsWith('BLEND-EXPORT '))) {
        const r = JSON.parse(line.slice(13));
        manifest[basename(r.src).replace(/\.blend$/i, '.glb')] = { from: relative(join(dir, pack), r.src), ...r, src: undefined };
      }
    };
    for (let i = 0; i < todo.length; i += 40) run(todo.slice(i, i + 40));
    // A file that crashes Blender takes the rest of its batch with it: those run alone, and a crash is a failure.
    for (const t of todo.filter((x) => !manifest[basename(x.out)])) {
      run([t]);
      manifest[basename(t.out)] ??= { from: relative(join(dir, pack), t.src), ok: false, error: 'Blender exited without a result' };
    }
    writeFileSync(manifestFile, JSON.stringify(manifest, null, 1));
    const vals = Object.values(manifest);
    console.log(`${pack}: ${vals.filter((v) => v.ok).length} converted, ${vals.filter((v) => !v.ok).length} failed`);
  }
}
