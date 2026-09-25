#!/usr/bin/env node
// Produce one disposable, isolated Studio baseline. The output is local only;
// this command never opens Studio or publishes to a Roblox account.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = mkdtempSync(join(tmpdir(), 'apple-frontier-baseplate-'));
const project = {
  name: 'Apple Frontier Studio fresh Baseplate',
  tree: {
    $className: 'DataModel',
    Workspace: {
      $className: 'Workspace',
      Baseplate: { $className: 'Part', $properties: {
        Anchored: true, Size: [512, 1, 512], Position: [0, -0.5, 0],
      } },
      SpawnLocation: { $className: 'SpawnLocation', $properties: {
        Anchored: true, Neutral: true, Size: [6, 1, 6], Position: [0, 3, 0],
      } },
    },
  },
};
const projectPath = join(directory, 'baseplate.project.json');
const placePath = join(directory, 'AppleFrontierFreshBaseplate.rbxlx');
writeFileSync(projectPath, JSON.stringify(project, null, 2), { flag: 'wx' });
execFileSync('rojo', ['build', projectPath, '--output', placePath], { stdio: 'pipe' });
const bytes = readFileSync(placePath);
const xml = bytes.toString('utf8');
for (const marker of ['class="Workspace"', 'class="Part"', 'class="SpawnLocation"', '<string name="Name">Baseplate</string>']) {
  if (!xml.includes(marker)) throw new Error(`Baseplate output missing ${marker}`);
}
const manifest = {
  placePath, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
  source: 'Rojo local blank DataModel', opened: false, published: false,
};
writeFileSync(join(directory, 'baseline.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
console.log(JSON.stringify(manifest));
