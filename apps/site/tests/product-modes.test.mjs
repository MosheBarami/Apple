/**
 * The site consumes ProductMode directly. This catches two regressions: inventing a third mode in
 * public copy, and reintroducing the compatibility translation layer that used to sit between
 * product modes and the worker's mode table.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(SITE, '..', '..');
const SRC = join(SITE, 'src');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
const shared = stripComments(readFileSync(join(ROOT, 'packages', 'shared', 'src', 'index.ts'), 'utf8'));

function typeModes() {
  const match = /export type ProductMode\s*=\s*([^;]+);/.exec(shared);
  assert.ok(match, 'ProductMode is no longer readable from packages/shared');
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function listedModes() {
  const match = /export const PRODUCT_MODES:\s*readonly ProductMode\[\]\s*=\s*\[([^\]]+)\]/.exec(shared);
  assert.ok(match, 'PRODUCT_MODES is no longer declared as the ProductMode list');
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(?:astro|css|ts|js|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const fromCodes = (...codes) => String.fromCharCode(...codes);
const retiredLabel = fromCodes(83, 117, 112, 101, 114, 32, 65, 103, 101, 110, 116);
const formerA = fromCodes(99, 108, 97, 121);
const formerB = fromCodes(114, 117, 110, 101);
const formerC = fromCodes(115, 116, 111, 110, 101);
const mappingName = ['PRODUCT_MODE_TO_', 'SPECIAL', 'IST'].join('');
const reverseMappingName = ['SPECIAL', 'IST_TO_PRODUCT_MODE'].join('');

test('ProductMode and PRODUCT_MODES are the same two-value contract', () => {
  assert.deepEqual(typeModes(), ['plan', 'agent']);
  assert.deepEqual(listedModes(), typeModes());
});

test('apps/site source contains no retired mode label or former mode architecture', () => {
  const findings = [];
  for (const file of walk(SRC)) {
    const source = readFileSync(file, 'utf8');
    const rel = relative(SITE, file);
    for (const value of [retiredLabel, formerA, formerB]) {
      if (new RegExp(`\\b${value}\\b`, 'i').test(source)) findings.push(`${rel}: ${value}`);
    }
    for (const value of [mappingName, reverseMappingName, `is-${formerC}`, `sm-${formerC}`, `acc-${formerC}`, `--${formerC}`]) {
      if (source.includes(value)) findings.push(`${rel}: ${value}`);
    }
  }
  assert.deepEqual(findings, [], `legacy mode architecture returned:\n  ${findings.join('\n  ')}`);
});

test('site mode consumers index MODE_INFO by ProductMode directly', () => {
  const pricing = readFileSync(join(SRC, 'pages', 'pricing.astro'), 'utf8');
  const credits = readFileSync(join(SRC, 'pages', 'docs', 'credits-and-limits.astro'), 'utf8');

  for (const [name, source] of [['pricing', pricing], ['credits docs', credits]]) {
    assert.match(source, /PRODUCT_MODES\.map\(/, `${name} does not derive rows from PRODUCT_MODES`);
    assert.match(source, /MODE_INFO\[(?:mode|m)\]/, `${name} does not index MODE_INFO by ProductMode`);
    assert.doesNotMatch(source, new RegExp(mappingName), `${name} reintroduced a compatibility mode mapping`);
  }
});
