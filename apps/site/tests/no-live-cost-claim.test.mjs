/**
 * NO PAGE MAY SAY THE WORKSPACE COUNTS A RUN'S COST WHILE IT RUNS, OR THAT ONE CREDIT IS TAKEN AT THE START.
 *
 * Three sentences said the first, and one said the second:
 *
 *   /pricing FAQ      "You see the running total live in the workspace while it climbs"
 *   /pricing tfoot    "the workspace counts what the run has spent while it runs"
 *   /docs/credits...  "the thinking panel counts the Credits this run has spent, step by step"
 *   /docs/credits...  "One Credit is taken when a request starts"
 *
 * The app shows what a request cost once the reply has finished (the footer under it, from
 * `msg_end.creditsSpent`) and nothing while it works: the worker broadcasts a running `creditsSpent`
 * on `agent_status` and no component draws it. thinking.tsx, which did, was removed on 2026-10-01.
 * And a request is admitted for ONE LEDGER UNIT, 1/150 of a credit, not one Credit.
 *
 * Both are claims a reader acts on, and the first is the shape of the pre-run warning that
 * pre-run-cost-warning.test.mjs already refuses: a promise about cost visibility with nothing behind it.
 *
 * THE PREMISE IS ASSERTED, so the guard cannot outlive the gap it describes: when a component starts
 * drawing the running figure, the first test fails and says to re-read the pages, rather than the
 * pages being forbidden a sentence that has become true.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { visibleCopy, visibleText } from './lib/visible-copy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..');
const ROOT = join(SITE, '..', '..');
const WEB_SRC = join(ROOT, 'apps', 'web', 'src');

const walk = (dir, ext, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, ext, out);
    else if (e.name.endsWith(ext)) out.push(full);
  }
  return out;
};

test('THE PREMISE: no component draws a run\'s cost while it runs; the app draws the settled figure under a finished reply', () => {
  const live = [];
  for (const file of walk(WEB_SRC, '.tsx')) {
    const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
    // The running figure lives on the socket's `agentStatus`; a component that draws it names it by
    // the status object. The settled figure is `item.creditsSpent` on the message.
    if (/\b(?:status|agentStatus|agent_status)\??\.creditsSpent\b/.test(code)) live.push(file.slice(ROOT.length + 1));
  }
  assert.deepEqual(
    live,
    [],
    `THIS GUARD IS STALE, NOT THE PAGES: ${live.join(', ')} now draw a running credit figure. Re-read the pages and decide what they may say; do not delete this to get quiet.`,
  );
  const turn = readFileSync(join(WEB_SRC, 'components', 'ws', 'turn.tsx'), 'utf8');
  assert.match(turn, /creditsText\(item\.creditsSpent\)/, 'the settled footer is no longer where this guard says the cost is shown');
});

/** The shapes the false claims take; each names what it looks for so a failure reads as an instruction. */
const CLAIMS = [
  { id: 'running-total-live', re: /\brunning total\b[^.]{0,50}\blive\b|\blive\b[^.]{0,50}\brunning total\b|\bwhile it climbs\b/i },
  { id: 'counts-spend-as-it-runs', re: /\bcounts?\b[^.]{0,70}\b(credits?|spent|spend)\b[^.]{0,70}\b(while|as|step by step)\b/i },
  { id: 'thinking-panel-credits', re: /\bthinking panel\b[^.]{0,90}\bcredits?\b/i },
  { id: 'live-metering', re: /\blive metering\b/i },
  { id: 'one-credit-taken', re: /\bone credit is taken\b/i },
];
const scan = (named) =>
  named.flatMap(([name, src]) => {
    // The text a visitor reads, AND the same source with its tags kept: a page's <title> and meta
    // description are attributes of a layout tag (`description={...}`), which visibleText drops with
    // the tag. "live metering" sat in one for a release, so the second haystack is what sees it.
    const hay = `${visibleText(src)}\n${visibleCopy(src)}`;
    return CLAIMS.flatMap(({ id, re }) => (re.test(hay) ? [`${name}: [${id}] "${re.exec(hay)[0].trim()}"`] : []));
  });

test('no page says a run\'s cost is counted live, or that one Credit is taken when a request starts', () => {
  const pages = readdirSync(join(SITE, 'src', 'pages'), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.astro'))
    .map((e) => join(e.parentPath ?? e.path, e.name));
  assert.ok(pages.length > 10, 'found too few pages — this guard is looking in the wrong place');
  const found = scan(pages.map((p) => [p.slice(SITE.length + 1), readFileSync(p, 'utf8')]));
  assert.deepEqual(
    found,
    [],
    `a page claims live cost metering the app does not have:\n  ${found.join('\n  ')}\n` +
      'Say what the app does: the cost of a request appears under its reply once the reply has finished.',
  );
});

test('the guard has teeth: it refuses the four sentences that shipped and passes the replacements', () => {
  const shipped = [
    ['pricing FAQ', '<p>You see the running total live in the workspace while it climbs, and if a run reaches the end of your Credits it stops there.</p>'],
    ['pricing tfoot', 'A build is charged for the work it actually did, so a long one costs more, and the workspace counts what the run has spent while it runs.'],
    ['docs thinking panel', 'What does move as it happens is the run you are watching: the thinking panel counts the Credits this run has spent, step by step.'],
    ['docs admission', 'One Credit is taken when a request starts, and the rest settles against the compute the run actually consumed.'],
    ['docs description', '<DocsLayout title="Credits" description={`What builds cost, live metering, daily reset.`}>'],
  ];
  for (const [name, src] of shipped) assert.ok(scan([[name, src]]).length > 0, `${name} slipped past every pattern; re-aim them`);
  const replacements = [
    'The workspace shows what a request cost once it has finished, and if a run reaches the end of your Credits it stops there and says so.',
    'The app shows a request\'s cost under its reply once the reply has finished, not while it works. A request is let in for 1/150 of a Credit.',
    'A long one costs more, and the workspace shows what each request cost once it has finished.',
  ];
  for (const src of replacements) assert.deepEqual(scan([['replacement', src]]), [], `the true sentence was refused: ${src}`);
});
