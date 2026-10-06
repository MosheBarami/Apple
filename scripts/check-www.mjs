#!/usr/bin/env node
// planning/WEB-REBUILD.md §1 rules 2 and 3: apps/www imports nothing from the old front-ends and uses none of their words.
// Exit 1 on any hit; prints file:line for each.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'apps/www'], { encoding: 'utf8' })
  .split('\n').filter((f) => /\.(tsx?|jsx?|mjs|css|mdx?|json)$/.test(f) && !f.endsWith('TEMPLATE.md') && !/(^|\/)(pnpm-lock|package-lock)\.json$|node_modules\//.test(f));
const IMPORTS = [/@studpilot\/design/, /apps\/(web|site|studio)\//, /\.\.\/(web|site|studio)\//];
const WORDS = [/Untitled piece/i, /\bpieces?\b/i, /Public Studio installation/i, /\bEngine\b/, /\bShowcase\b/i, /verify the result/i];
const hits = [];
for (const f of files) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (/\b(import|from|require)\b/.test(line) && IMPORTS.some((r) => r.test(line))) hits.push(`${f}:${i + 1}: old import: ${line.trim()}`);
    for (const r of WORDS) if (r.test(line)) hits.push(`${f}:${i + 1}: old word ${r}: ${line.trim().slice(0, 120)}`);
  });
}
for (const h of hits) console.log(h);
console.log(hits.length ? `check-www: FAIL, ${hits.length} hit(s) in ${files.length} files` : `check-www: CLEAN, ${files.length} files`);
process.exit(hits.length ? 1 : 0);
