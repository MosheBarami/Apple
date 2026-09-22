// F-009, measured 2026-09-22: a new project — and every reload of an existing one — started with
// Autonomous switched ON, although every run in the session had been sent with it off. Autonomous lifts
// the per-tool permissions and lets a run take up to 1000 steps; single ordinary requests measured
// 105-450 Credits that day against a 100-Credit free allowance. It starts off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'routes', 'workspace.tsx'), 'utf8');

test('the workspace starts every visit with Autonomous off', () => {
  const decl = /const \[autonomous, setAutonomous\] = useState(?:<[^>]*>)?\(([^)]*)\);/.exec(WS);
  assert.ok(decl, 'the Autonomous state was not found — this test would check nothing');
  assert.equal(decl[1].trim(), 'false', `Autonomous starts as ${decl[1]}`);
});

// Measured 2026-09-22 in production at a 500px window: with the Studio pill in the topbar, the
// workspace grid's implicit `auto` column grew to the topbar's min-content (507.6px) and every row —
// the conversation included — overflowed and was clipped. The column may be narrower than its content.
test('the workspace grid column can be narrower than its widest child', () => {
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'design', 'apple-minimal.css'), 'utf8');
  const rule = /\.apple-workspace \{([^}]*)\}/.exec(css);
  assert.ok(rule, 'the .apple-workspace rule was not found — this test would check nothing');
  assert.match(rule[1], /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  const pill = /\.apple-workspace__controls \.gx-pill \{([^}]*)\}/.exec(css);
  assert.ok(pill && /min-width:\s*0/.test(pill[1]) && /flex:\s*0 1 auto/.test(pill[1]), 'the topbar pill must be allowed to shrink');
});

// F-006, measured 2026-09-22: the Project actions menu stayed open after an item was chosen, sat over
// the conversation, and ignored Escape.
test('the Project menu closes on Escape, on a choice, and on a click outside', () => {
  assert.match(WS, /<details className="studio-project-menu" ref=\{setProjectMenu\}>/);
  // A callback ref with the element as the effect's dependency: a ref read once at mount was null in
  // production (the header mounts after the workspace) and the listeners never attached.
  const effect = /const \[projectMenu, setProjectMenu\] = useState<HTMLDetailsElement \| null>\(null\);([\s\S]*?)\n {2}\}, \[projectMenu\]\);/.exec(WS);
  assert.ok(effect, 'the menu behaviour was not found — this test would check nothing');
  assert.match(effect[1], /e\.key !== 'Escape'/);
  assert.match(effect[1], /querySelector\('summary'\)\?\.focus\(\)/, 'Escape returns focus to the menu button');
  assert.match(effect[1], /addEventListener\('pointerdown'/);
  assert.match(effect[1], /closest\('button, a'\)/, 'choosing an item closes the menu');
});
