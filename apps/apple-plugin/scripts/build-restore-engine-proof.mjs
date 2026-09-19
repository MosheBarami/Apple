import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const proofRoot = join(root, 'proof');
const project = join(proofRoot, 'studio-restore-engine-proof.project.json');
const runner = join(proofRoot, 'AppleRestoreEngineProof.luau');
const commands = join(root, 'src', 'Commands.luau');
const release = join(root, 'release');
const artifact = join(release, 'apple-restore-engine-proof-r4.rbxl');

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
  ['HTTP request', /\b(?:RequestAsync|GetAsync|PostAsync|HttpGet)\s*\(/],
  ['asset insertion', /\b(?:LoadAsset|LoadLocalAsset)\s*\(/],
  ['asset upload', /\bCreateAssetAsync\s*\(/],
  ['place publication', /\b(?:SavePlace|PublishAs|Publish)\s*\(/],
  ['model generation', /\bGenerateModelAsync\s*\(/],
  ['dynamic source execution', /\b(?:loadstring|require)\s*\(\s*(?:\d|["'])/],
]) {
  if (pattern.test(runnerSource)) throw new Error(`restore proof contains forbidden capability: ${label}`);
}

mkdirSync(release, { recursive: true });
execFileSync('rojo', ['build', project, '--output', artifact], { stdio: 'inherit' });
execFileSync('python3', [join(root, '..', '..', 'scripts', 'inspect-plugin-build.py'), artifact], { stdio: 'inherit' });

const bytes = statSync(artifact).size;
console.log(`Disposable restore proof built and inspected: ${artifact} (${bytes} bytes)`);
console.log('Building does not mutate Studio. Open the unpublished proof place in Studio Edit mode and run:');
console.log('require(game.ServerScriptService.AppleRestoreEngineProof).run()');
console.log('Run once. The proof prints APPLE_RESTORE_ENGINE_PROOF JSON and cleans its Workspace fixtures.');
