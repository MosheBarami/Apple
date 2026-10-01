/**
 * THE THINKING SURFACE — what it shows, rendered, and what it must never show.
 *
 * RESTATED 2026-10-01 (owner): "replace the vercel ones with these, not both". The app's own status
 * pill (ws/thinking.tsx: "Planning it out | N Credits", the morphing words and the orb) is removed
 * entirely; a turn shows only AI Elements — Reasoning per step, Task per group of tools, Sources,
 * and Shimmer on whatever is live (tests/run-trace.test.mjs). The honesty rules it held now hold for
 * the whole turn in tests/live-status.test.mjs (no tool name, path, payload, timing or error code).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { WEB, decomment } from './ui-bundle.mjs';

const SRC = join(WEB, 'src');

test('nothing outside ai-elements renders ToolInput or ToolOutput, which print JSON payloads', () => {
  const offenders = [];
  let read = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        if (entry !== 'ai-elements') walk(path);
      } else if (/\.(?:ts|tsx)$/.test(entry)) {
        read++;
        if (/\bTool(?:Input|Output)\b/.test(decomment(readFileSync(path, 'utf8')))) offenders.push(relative(SRC, path));
      }
    }
  };
  walk(SRC);
  assert.ok(read > 100, `only ${read} source files read`);
  assert.deepEqual(offenders, []);
  assert.match(readFileSync(join(SRC, 'components/ai-elements/tool.tsx'), 'utf8'), /export const ToolInput\b/, 'the scan would be vacuous without the export it looks for');
});

test('the old status pill is gone, and nothing still points at it', () => {
  for (const file of ['components/ws/thinking.tsx', 'components/ws/thinking.css']) {
    assert.throws(() => statSync(join(SRC, file)), `${file} is back`);
  }
  const pointing = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(?:ts|tsx|css)$/.test(entry) && /ws\/thinking['"]|\.\/thinking['".]|apple-status/.test(decomment(readFileSync(path, 'utf8')))) pointing.push(relative(SRC, path));
    }
  };
  walk(SRC);
  assert.deepEqual(pointing, []);
});
