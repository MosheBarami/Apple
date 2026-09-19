import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const proofRoot = join(root, 'proof');
const project = join(proofRoot, 'studio-engine-proof.project.json');
const runner = join(proofRoot, 'AppleStudioEngineProof.luau');
const commands = join(root, 'src', 'Commands.luau');
const release = join(root, 'release');
const artifact = join(release, 'apple-studio-engine-proof.rbxl');

for (const source of [runner, commands]) {
  let output = '';
  try {
    output = execFileSync('luau-analyze', [source], { encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    if (error.code === 'ENOENT') throw error;
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    if (!output || error.signal) throw error;
  }
  const syntaxErrors = output.split('\n').filter((line) => line.includes('SyntaxError'));
  if (syntaxErrors.length) throw new Error(`${source}: ${syntaxErrors.join('\n')}`);
}

const runnerSource = readFileSync(runner, 'utf8');
for (const [label, pattern] of [
  ['HTTP request', /\b(?:RequestAsync|GetAsync|PostAsync)\s*\(/],
  ['asset insertion', /\b(?:LoadAsset|LoadLocalAsset)\s*\(/],
  ['place publication', /\b(?:SavePlace|PublishAs|Publish)\s*\(/],
  ['model generation call', /\bGenerateModelAsync\s*\(/],
  ['model generation service', /GetService\s*\(\s*["']GenerationService["']\s*\)/],
]) {
  if (pattern.test(runnerSource)) throw new Error(`proof runner contains forbidden capability: ${label}`);
}

mkdirSync(release, { recursive: true });
execFileSync('rojo', ['build', project, '--output', artifact], { stdio: 'inherit' });
execFileSync('python3', [join(root, '..', '..', 'scripts', 'inspect-plugin-build.py'), artifact], { stdio: 'inherit' });

const bytes = statSync(artifact).size;
console.log(`Disposable Studio proof built and inspected: ${artifact} (${bytes} bytes)`);
console.log('Open it in Studio Edit mode and run this exact one-line Command Bar expression:');
console.log('require(game.ServerScriptService.AppleStudioEngineProof).run()');
console.log('A build is not an observed Studio pass; checkpoint restore has its own restore proof and generate_model has its own generation proof.');
