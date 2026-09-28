/**
 * THE CUSTOMER CHOOSES NO MODE (V3 gate G01; ACCEPTANCE.json removes "Plan/Agent/Autonomous
 * selectors" from the product contract). A request is described, Apple shows a short plan and
 * builds it; planning and execution are internal stages. This catches a mode surface coming back
 * to the public site — a Plan/Agent/Autonomous picker, copy that asks the reader to choose one, a
 * /docs/modes page or a link to it — and the older architecture that used to sit behind one.
 *
 * /changelog is exempt from the copy scan and only from that: its release entries record what
 * shipped at the time, and a history that could not name the past would be rewritten history.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(SITE, 'src');
const DIST = join(SITE, 'dist');

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

/** Copy that presents a work mode for the customer to pick. English prose only, never a symbol. */
const MODE_COPY = [
  /\b(?:Plan|Agent|Autonomous) mode\b/i,
  /\bPlan and Agent\b/i,
  /\bAutonomous\b/i,
  /\b(?:two|three|product|build|work) modes\b/i,
  /\b(?:choose|choosing|pick|picking|select|selecting) (?:a |the |your )?mode\b/i,
  /\bModes\b/,
  /\b(?:Plan|Agent) (?:runs?|requests?|builds?)\b/,
];
const modeCopyIn = (text) => MODE_COPY.filter((re) => re.test(text)).map(String);

/** What a reader or a search snippet receives from built HTML: text, plus the attributes read aloud or shown. */
const textOf = (html) => [
  html.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '),
  ...[...html.matchAll(/\b(?:content|aria-label|title|alt|placeholder)="([^"]*)"/g)].map((m) => m[1]),
].join(' ').replace(/\s+/g, ' ');

function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...htmlFiles(full));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

test('no page offers a Plan, Agent or Autonomous mode, and nothing links to /docs/modes', () => {
  assert.equal(existsSync(join(SRC, 'pages', 'docs', 'modes.astro')), false, 'the /docs/modes page is back');
  const pages = htmlFiles(DIST);
  assert.ok(pages.length >= 15, `only ${pages.length} built pages found — build the site before running this`);
  assert.equal(existsSync(join(DIST, 'docs', 'modes')), false, 'the build still ships /docs/modes');
  const findings = [];
  for (const file of pages) {
    const html = readFileSync(file, 'utf8');
    const rel = relative(DIST, file);
    if (/href="\/docs\/modes\/?(?:#[^"]*)?"/.test(html)) findings.push(`${rel}: links to /docs/modes`);
    if (/data-mode="autonomous"/.test(html)) findings.push(`${rel}: renders an Autonomous toggle`);
    if (rel.startsWith('changelog')) continue;
    for (const hit of modeCopyIn(textOf(html))) findings.push(`${rel}: ${hit}`);
  }
  for (const file of walk(SRC)) {
    if (/href=["']\/docs\/modes\b/.test(readFileSync(file, 'utf8'))) findings.push(`${relative(SITE, file)}: links to /docs/modes`);
  }
  assert.deepEqual(findings, [], `a mode surface is published:\n  ${findings.join('\n  ')}`);
});

test('the mode-copy guard has teeth', () => {
  for (const shipped of [
    'Apple has two product modes: <strong>Plan</strong> and <strong>Agent</strong>.',
    '<h2>5. Choose a mode and ask for your first build</h2>',
    '<button data-mode="autonomous"><span>Autonomous</span></button>',
    '<a href="/docs/modes">Modes</a>',
    'saved copies of your place from before each Agent run.',
  ]) {
    assert.notDeepEqual(modeCopyIn(textOf(shipped)), [], `the guard passes copy that shipped: ${shipped}`);
  }
  for (const fine of ['Studio Run mode playtests', 'Describe the game; Apple shows a short plan and builds it.', 'an AI agent']) {
    assert.deepEqual(modeCopyIn(textOf(fine)), [], `the guard flags ordinary copy: ${fine}`);
  }
});
