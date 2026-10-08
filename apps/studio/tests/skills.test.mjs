import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKILLS } from '../src/skills.generated.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('skills.generated.ts is current with packages/skills', () => {
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'gen-skills.mjs'), '--check'], { stdio: 'pipe' });
});

test('every skill meets the agentskills.io name and description rules', () => {
  assert.ok(SKILLS.length > 0);
  const names = new Set();
  for (const s of SKILLS) {
    assert.match(s.name, /^[a-z0-9]+(-[a-z0-9]+)*$/, s.name);
    assert.ok(s.name.length <= 64, s.name);
    assert.ok(!names.has(s.name), `duplicate ${s.name}`);
    names.add(s.name);
    assert.ok(s.description.length > 0 && s.description.length <= 1024, `${s.name}: description ${s.description.length} chars`);
    assert.ok(s.body.trim().length > 0, `${s.name}: empty body`);
    for (const f of Object.keys(s.files)) assert.match(f, /^references\/[^/]+\.md$/, `${s.name}: ${f}`);
  }
});

test('a SKILL.md that breaks the rules is refused', async () => {
  const { parseSkill } = await import(join(ROOT, 'scripts', 'gen-skills.mjs'));
  assert.throws(() => parseSkill('---\nname: Bad_Name\ndescription: x\n---\nbody', 'Bad_Name'), /lowercase/);
  assert.throws(() => parseSkill('---\nname: a\ndescription: x\n---\nbody', 'b'), /folder/);
  assert.throws(() => parseSkill(`---\nname: a\ndescription: ${'x'.repeat(1025)}\n---\nbody`, 'a'), /max 1024/);
  assert.throws(() => parseSkill('no frontmatter', 'a'), /frontmatter/);
});
