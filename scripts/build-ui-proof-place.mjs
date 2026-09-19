// Build a disposable LOCAL Roblox place from the actual AppleUI source. Never opens or publishes it.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== '--theme')) {
  throw new Error('Usage: node scripts/build-ui-proof-place.mjs [--theme <canonical-theme-id>]');
}
const requestedTheme = args[1] ?? 'studio';
const directory = mkdtempSync(join(tmpdir(), 'apple-ui-engine-proof-'));
const bundle = join(directory, 'ui.mjs');
execFileSync(join(root, 'apps/worker/node_modules/.bin/esbuild'), [join(root, 'apps/worker/src/ui-kit.ts'), '--bundle', '--format=esm', `--outfile=${bundle}`], { stdio: 'pipe' });
const { APPLE_UI_SOURCE } = await import(pathToFileURL(bundle).href);
const themeBundle = join(directory, 'themes.mjs');
execFileSync(join(root, 'apps/worker/node_modules/.bin/esbuild'), [join(root, 'apps/worker/src/ui-kit-themes.ts'), '--bundle', '--format=esm', `--outfile=${themeBundle}`], { stdio: 'pipe' });
const { APPLE_UI_THEME_IDS } = await import(pathToFileURL(themeBundle).href);
if (!APPLE_UI_THEME_IDS.includes(requestedTheme)) throw new Error(`Unknown UI proof theme: ${requestedTheme}`);
const files = {
  'AppleUI.luau': APPLE_UI_SOURCE,
  'Proof.server.luau': readFileSync(join(root, 'apps/worker/tests/fixtures/apple-ui-studio-server.luau'), 'utf8'),
  'Proof.client.luau': readFileSync(join(root, 'apps/worker/tests/fixtures/apple-ui-studio-client.luau'), 'utf8'),
};
for (const [name, source] of Object.entries(files)) {
  const path = join(directory, name);
  writeFileSync(path, source, { flag: 'wx' });
  execFileSync('luau-compile', [path], { stdio: 'pipe' });
}
const project = { name: 'Apple UI isolated proof', tree: {
  $className: 'DataModel',
  Workspace: { $className: 'Workspace',
    Baseplate: { $className: 'Part', $properties: { Anchored: true, Size: [128, 1, 128] } },
    Spawn: { $className: 'SpawnLocation', $properties: { Anchored: true, Size: [6, 1, 6], Position: [0, 3, 0], Neutral: true } },
  },
  ReplicatedStorage: { $className: 'ReplicatedStorage', AppleUI: { $path: 'AppleUI.luau' },
    AppleUIProofTheme: { $className: 'StringValue', $properties: { Value: requestedTheme } },
  },
  ServerScriptService: { $className: 'ServerScriptService', Proof: { $path: 'Proof.server.luau' } },
  StarterPlayer: { $className: 'StarterPlayer', StarterPlayerScripts: { $className: 'StarterPlayerScripts', Proof: { $path: 'Proof.client.luau' } } },
} };
const projectPath = join(directory, 'proof.project.json');
const artifact = join(directory, 'AppleUI-proof.rbxlx');
writeFileSync(projectPath, JSON.stringify(project, null, 2), { flag: 'wx' });
execFileSync('rojo', ['build', projectPath, '--output', artifact], { stdio: 'pipe' });
const xml = readFileSync(artifact, 'utf8');
for (const className of ['ModuleScript', 'Script', 'LocalScript', 'SpawnLocation']) {
  if (!xml.includes(`class="${className}"`)) throw new Error(`Missing ${className} in built artifact`);
}
const result = { artifact, theme: requestedTheme, sha256: createHash('sha256').update(xml).digest('hex'),
  sourceHashes: Object.fromEntries(Object.entries(files).map(([name, source]) => [name, createHash('sha256').update(source).digest('hex')])),
  compiledScripts: Object.keys(files).length, studioExecuted: false, published: false, installedPlugin: false };
writeFileSync(join(directory, 'manifest.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
console.log(JSON.stringify(result, null, 2));
