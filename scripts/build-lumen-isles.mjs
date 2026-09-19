// Builds the exact first-party experience for local visual review; never publishes or installs it.
// Customer delivery is separate: saved workspace versions -> existing edit_script -> independent plugin.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const base = join(root, 'apps/experiences/lumen-isles');
const destination = mkdtempSync(join(tmpdir(), 'lumen-isles-'));
const files = ['World.luau', 'GameState.luau', 'Game.server.luau', 'Client.client.luau'];
const source = {};
for (const name of files) {
  const bytes = readFileSync(join(base, name));
  if (bytes.length > 48 * 1024) throw new Error(`${name} exceeds project workspace file cap`);
  execFileSync('luau-compile', [join(base, name)], { stdio: 'pipe', timeout: 10000 });
  source[name] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
const project = {
  name: 'Lumen Isles — local review',
  tree: { $className: 'DataModel',
    Workspace: { $className: 'Workspace', $properties: { Gravity: 196.2 },
      LumenAuthoringMarker: { $className: 'Folder', $attributes: { LocalReviewOnly: true } } },
    ServerScriptService: { $className: 'ServerScriptService',
      LumenWorld: { $path: join(base, 'World.luau') },
      LumenState: { $path: join(base, 'GameState.luau') },
      LumenGame: { $path: join(base, 'Game.server.luau') } },
    StarterPlayer: { $className: 'StarterPlayer', $properties: { CameraMaxZoomDistance: 35, CameraMinZoomDistance: 6 },
      StarterPlayerScripts: { $className: 'StarterPlayerScripts', LumenClient: { $path: join(base, 'Client.client.luau') } } },
  },
};
const projectPath = join(destination, 'lumen.project.json');
writeFileSync(projectPath, JSON.stringify(project, null, 2), { flag: 'wx' });
const artifact = join(destination, 'LumenIsles.rbxl');
execFileSync('rojo', ['build', projectPath, '--output', artifact], { stdio: 'pipe', timeout: 15000 });
const manifest = {
  artifact, sha256: createHash('sha256').update(readFileSync(artifact)).digest('hex'), source,
  delivery: 'local-source-build-not-customer-agent-delivery', published: false,
  studioObserved: false, visuallyAccepted: false,
};
writeFileSync(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
console.log(JSON.stringify(manifest, null, 2));
