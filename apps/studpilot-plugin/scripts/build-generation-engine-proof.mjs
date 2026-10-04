import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const proofRoot = join(root, 'proof');
const project = join(proofRoot, 'studio-generation-engine-proof.project.json');
const runner = join(proofRoot, 'AppleGenerationEngineProof.luau');
const commands = join(root, 'src', 'Commands.luau');
const generation = join(root, 'src', 'GenerationService.luau');
const release = join(root, 'release');
const artifact = join(release, 'apple-generation-engine-proof.rbxl');

for (const source of [runner, commands, generation]) {
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
const generationSource = readFileSync(generation, 'utf8');
const combined = `${runnerSource}\n${generationSource}`;
for (const [label, pattern] of [
  ['HTTP request', /\b(?:RequestAsync|GetAsync|PostAsync|HttpGet)\s*\(/],
  ['asset insertion', /\b(?:LoadAsset|LoadLocalAsset)\s*\(/],
  ['asset upload', /\bCreateAssetAsync\s*\(/],
  ['place publication', /\b(?:SavePlace|PublishAs|Publish)\s*\(/],
  ['AssetService', /GetService\s*\(\s*["']AssetService["']\s*\)/],
]) {
  if (pattern.test(combined)) throw new Error(`generation proof contains forbidden capability: ${label}`);
}

if (/\bGenerateModelAsync\s*\(/.test(runnerSource)) {
  throw new Error('proof runner must reach GenerationService only through the audited adapter');
}
const providerCalls = generationSource.match(/GenerateModelAsync\s*\(/g) ?? [];
if (providerCalls.length !== 1) {
  throw new Error(`expected exactly one GenerationService call site, found ${providerCalls.length}`);
}
const proofOperations = runnerSource.match(/op\s*=\s*["']generate_model["']/g) ?? [];
if (proofOperations.length !== 1) {
  throw new Error(`expected exactly one proof generation operation, found ${proofOperations.length}`);
}

mkdirSync(release, { recursive: true });
execFileSync('rojo', ['build', project, '--output', artifact], { stdio: 'inherit' });
execFileSync('python3', [join(root, '..', '..', 'scripts', 'inspect-plugin-build.py'), artifact], { stdio: 'inherit' });

const bytes = statSync(artifact).size;
console.log(`Disposable GenerationService proof built and inspected: ${artifact} (${bytes} bytes)`);
console.log('Building did not call GenerationService. Open the unpublished place in Studio Edit mode and run:');
console.log('require(game.ServerScriptService.AppleGenerationEngineProof).run()');
console.log('Run once only. Inspect the redone model under Workspace/AppleGenerationProofDestination.');
