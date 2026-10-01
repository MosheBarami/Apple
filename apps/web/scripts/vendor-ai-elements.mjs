#!/usr/bin/env node
/**
 * Copy the genuine Vercel AI Elements components (and the shadcn/ui primitives they import) from a
 * checkout of https://github.com/vercel/ai-elements into this app, exactly as the AI Elements CLI
 * would install them: the file bytes are upstream's, and the only change is the import alias —
 *
 *   @repo/shadcn-ui/components/ui/<x>  ->  @/components/ui/<x>
 *   @repo/shadcn-ui/lib/utils          ->  @/lib/utils
 *
 * It then rewrites the FILE rows of components/ai-elements/NOTICE, one per copied file, each with
 * the upstream path and the sha256 of the UPSTREAM bytes. tests/ai-elements-provenance.test.mjs
 * reverses the alias rewrite on every local copy and checks it hashes to that row, so a local edit
 * to a vendored file cannot go unnoticed.
 *
 *   node scripts/vendor-ai-elements.mjs /path/to/ai-elements-checkout
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(WEB, 'src');

/** The AI Elements this app renders. Each is upstream packages/elements/src/<name>.tsx. */
export const ELEMENTS = [
  'artifact', 'attachments', 'canvas', 'chain-of-thought', 'code-block', 'commit', 'confirmation',
  'connection', 'controls', 'conversation', 'edge', 'environment-variables', 'file-tree', 'image',
  'inline-citation', 'jsx-preview', 'message', 'node', 'package-info', 'panel', 'prompt-input',
  'reasoning', 'sandbox', 'schema-display', 'shimmer', 'snippet', 'sources', 'suggestion', 'task',
  'test-results', 'tool', 'web-preview',
];

/** The shadcn/ui primitives those import (closed over their own imports). */
export const UI = [
  'alert', 'avatar', 'badge', 'button', 'button-group', 'card', 'carousel', 'collapsible', 'command', 'dialog',
  'dropdown-menu', 'hover-card', 'input', 'input-group', 'scroll-area', 'select', 'separator',
  'spinner', 'switch', 'tabs', 'textarea', 'tooltip',
];

/**
 * The only edits beyond the alias, each one exact, reversible and recorded in NOTICE. This app's
 * tsconfig sets noUncheckedIndexedAccess, which upstream does not; a destructured regex group is
 * `string | undefined` under it. The groups named here always participate when the regex matches,
 * so the default never applies and behaviour is upstream's.
 */
export const PATCHES = {
  'components/ai-elements/jsx-preview.tsx': [
    ['const [fullMatch, tagName, attributes, selfClosing] = match;', 'const [fullMatch, tagName = "", attributes = "", selfClosing] = match;'],
  ],
};

const ALIASES = [
  ['@repo/shadcn-ui/components/ui/', '@/components/ui/'],
  ['@repo/shadcn-ui/lib/utils', '@/lib/utils'],
];

/** Upstream bytes -> the local file. Every patch must find its text exactly once. */
export function toLocal(src, local) {
  let out = ALIASES.reduce((s, [from, to]) => s.replaceAll(from, to), src);
  for (const [from, to] of PATCHES[local] ?? []) {
    if (out.split(from).length !== 2) throw new Error(`${local}: patch text found ${out.split(from).length - 1} times`);
    out = out.replace(from, to);
  }
  return out;
}

/** The local file -> upstream bytes, so a test can hash it against the NOTICE row. */
export function toUpstream(src, local) {
  let out = src;
  for (const [from, to] of PATCHES[local] ?? []) out = out.split(to).join(from);
  return ALIASES.reduce((s, [from, to]) => s.replaceAll(to, from), out);
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function main(checkout) {
  if (!checkout) throw new Error('usage: vendor-ai-elements.mjs <ai-elements checkout>');
  const commit = execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const files = [
    ...ELEMENTS.map((name) => ({ upstream: `packages/elements/src/${name}.tsx`, local: `components/ai-elements/${name}.tsx` })),
    ...UI.map((name) => ({ upstream: `packages/shadcn-ui/components/ui/${name}.tsx`, local: `components/ui/${name}.tsx` })),
    { upstream: 'packages/shadcn-ui/lib/utils.ts', local: 'lib/utils.ts' },
  ];
  const rows = [];
  for (const file of files) {
    const bytes = readFileSync(join(checkout, file.upstream));
    const out = join(SRC, file.local);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, toLocal(bytes.toString('utf8'), file.local));
    const patched = (PATCHES[file.local] ?? []).map(([from, to]) => `\n  patch: ${from}\n      -> ${to}`).join('');
    rows.push(`FILE ${file.local}\n  upstream: ${file.upstream}\n  sha256: ${sha256(bytes)}${patched}\nEND`);
  }
  const noticePath = join(SRC, 'components', 'ai-elements', 'NOTICE');
  const notice = readFileSync(noticePath, 'utf8');
  const start = notice.indexOf('BEGIN FILES');
  const end = notice.indexOf('END FILES');
  if (start < 0 || end < 0) throw new Error('NOTICE has no BEGIN FILES / END FILES block');
  const next = notice.slice(0, start) + `BEGIN FILES (upstream commit ${commit})\n\n${rows.join('\n\n')}\n\n` + notice.slice(end);
  writeFileSync(noticePath, next);
  console.log(`vendored ${files.length} files from ${commit}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv[2]);
