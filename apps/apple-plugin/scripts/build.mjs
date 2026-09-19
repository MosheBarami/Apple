import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const name of readdirSync(join(root, 'src')).filter((name) => name.endsWith('.luau'))) {
  const source = readFileSync(join(root, 'src', name), 'utf8')
    .replace(/--\[\[[\s\S]*?\]\]/g, '').replace(/--[^\n]*/g, '');
  for (const dependency of source.matchAll(/require\(script(?:\.Parent)?\.([A-Za-z_]\w*)\)/g)) {
    if (!existsSync(join(root, 'src', `${dependency[1]}.luau`))) {
      throw new Error(`${name}: missing bundled module ${dependency[1]}`);
    }
  }
  let output;
  try {
    output = execFileSync('luau-analyze', [join(root, 'src', name)], { encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    if (error.code === 'ENOENT') throw error;
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    if (!output || error.signal) throw error;
  }
  const syntaxErrors = output.split('\n').filter((line) => line.includes('SyntaxError'));
  if (syntaxErrors.length) throw new Error(`${name}: ${syntaxErrors.join('\n')}`);
}
// Roblox type definitions are not loaded by this CLI: this is explicitly a parse
// gate, not a claim of successful engine type checking or actual Studio execution.
mkdirSync(join(root, 'release'), { recursive: true });
const artifact = join(root, 'release', 'apple-studio.rbxm');
execFileSync('rojo', ['build', join(root, 'default.project.json'), '--output', artifact], { stdio: 'inherit' });
execFileSync('python3', [join(root, '..', '..', 'scripts', 'inspect-plugin-build.py'), artifact], { stdio: 'inherit' });
// The source having a capability and the SHIPPED BYTES having it are two claims, and this
// repository has already paid for the difference: the legacy artifact reported VERSION 0.1.0 with
// zero occurrences of GenerateModelAsync while its source was 0.2.0 and had generation, and every
// test was green because every test read the .luau. This one reads the binary.
execFileSync('python3', [join(root, 'scripts', 'verify-artifact.py'), artifact], { stdio: 'inherit' });
console.log('Local preview built, inspected and verified against its own source; not installed or published.');
