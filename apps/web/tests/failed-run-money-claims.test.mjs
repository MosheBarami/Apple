/**
 * WHAT THE APP TELLS YOU A FAILED RUN COST YOU.
 *
 * The site has a guard for this — apps/site/tests/credit-refund-claims.test.mjs — and it reads
 * `apps/site/src/pages/**\/*.astro` and nothing else. Two false money claims were shipping in
 * apps/web, on the other side of that glob, on 2026-09-21:
 *
 *   * `ws/outcome-model.ts` rendered "That used the last of today's Credits. They reset tomorrow."
 *     for EVERY `quota` stop. The worker sends `quota` from four places, and two of them are the
 *     SERVICE's shared budget — one being an administrator pausing generation — where nothing of
 *     the reader's ran out at all.
 *   * `routes/admin.tsx` told the owner, in the confirm dialog for his own kill switch, that a
 *     paused build's Credits are lost and "nothing is refunded automatically". A paused run that
 *     had not yet built anything has every Credit put back.
 *
 * Both sentences were true when they were written and became false when QuotaDO gained /refund on
 * 2026-09-20. That is the same way the four site pages went wrong, so this is the same guard aimed
 * at the surface the site's one cannot see.
 *
 * THE PREMISE IS ASSERTED FIRST, in its own test. Every claim below rests on 'quota' being a
 * refundable ending and on BudgetError reaching it; if either stops being true this file fails
 * naming ITSELF as stale, rather than going on policing copy for a rule the product dropped.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(WEB, '..', '..');
const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');

const REFUND = read('apps', 'worker', 'src', 'run-refund.ts');
const SESSION = read('apps', 'worker', 'src', 'do', 'session.ts');
const GATEWAY = read('apps', 'worker', 'src', 'gateway.ts');
const ADMIN = read('apps', 'web', 'src', 'routes', 'admin.tsx');
const ANNOUNCE = read('apps', 'web', 'src', 'lib', 'announce.ts');

/**
 * The outcome model, bundled the way run-outcome.test.mjs bundles it — the sentence under test is
 * a value this module returns, not a string in a file, and reading the file would pass over a
 * renderer that stopped using it.
 */
const outcomeLine = await (async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'money-')), 'o.mjs');
  execFileSync(
    join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
    [
      join(WEB, 'src', 'components', 'ws', 'outcome-model.ts'),
      '--bundle', '--format=esm', '--platform=neutral', '--main-fields=main,module', '--outfile=' + out,
    ],
    { stdio: 'pipe' },
  );
  return (await import(out)).outcomeLine;
})();

// --------------------------------------------------------------- the premise ---

test('THE PREMISE: a paused or capacity-stopped run is a refundable ending', () => {
  const set = /REFUNDABLE_REASONS: ReadonlySet<RunStopReason> = new Set\(\[([^\]]*)\]\)/.exec(REFUND);
  assert.ok(set, 'THIS GUARD IS STALE, NOT THE COPY: REFUNDABLE_REASONS could not be read out of apps/worker/src/run-refund.ts');
  assert.match(
    set[1],
    /'quota'/,
    "THIS GUARD IS STALE, NOT THE COPY: 'quota' is no longer a refundable ending, so the sentences "
      + 'below are free to say the Credits stay spent. Go and re-read them before deleting this.',
  );
  assert.match(
    GATEWAY,
    /readonly reason: 'killed' \| 'daily_cap' \| 'monthly_cap' \| 'request_too_large'/,
    'THIS GUARD IS STALE, NOT THE COPY: BudgetError no longer carries a kill-switch reason',
  );
  assert.match(
    SESSION,
    /e instanceof BudgetError\b/,
    'THIS GUARD IS STALE, NOT THE COPY: do/session.ts no longer routes a BudgetError to a run ending',
  );
});

// ------------------------------------------------- one sentence, four endings ---

/**
 * The four `quota` endings, IN THE WORKER'S OWN WORDS.
 *
 * Two name the reader's allowance and two name the service's. The app renders ONE sentence for all
 * four, so a sentence that picks either owner is false half the time. Asserting all four are still
 * reachable is what keeps the next test from passing because the ambiguity quietly went away.
 */
const QUOTA_ENDINGS = [
  { owner: 'service', phrase: "shared building capacity" },
  { owner: 'service', phrase: 'An administrator paused generation' },
  { owner: 'reader', phrase: 'your daily Credits ran out' },
  { owner: 'reader', phrase: 'the last of your Credits for today' },
];

test("'quota' really is four endings that disagree about whose allowance ran out", () => {
  const missing = QUOTA_ENDINGS.filter((e) => !SESSION.includes(e.phrase));
  assert.deepEqual(
    missing.map((e) => e.phrase),
    [],
    'THIS GUARD IS STALE, NOT THE COPY: do/session.ts no longer writes these quota endings. If '
      + 'there is now only one, the app may name its owner again — go and look.',
  );
  assert.ok(QUOTA_ENDINGS.some((e) => e.owner === 'service'), 'no service-side quota ending left');
  assert.ok(QUOTA_ENDINGS.some((e) => e.owner === 'reader'), 'no reader-side quota ending left');
});

test('the quota outcome line names no owner and no amount', () => {
  const line = outcomeLine('quota', undefined);
  assert.ok(line && typeof line.text === 'string', 'there is no quota outcome line to check');
  assert.equal(line.tone, 'note', 'running out is not a failure');

  // It must not pick a side. `your Credits` is false on the two service endings; `capacity` and
  // `administrator` are false on the two reader endings.
  assert.doesNotMatch(line.text, /\byour\b/i, `the quota line addresses the reader's own allowance: "${line.text}"`);
  assert.doesNotMatch(line.text, /\bcapacit\w*|\badministrator\b/i, `the quota line names a service ending: "${line.text}"`);

  // And it must not price the run. The ending is refundable, so "these Credits are spent" may be
  // false; the run may also have delivered, so "they come back" may be false too. The app cannot
  // know which — only `finishRun` knows what the ledger returned, and it writes `refundSentence`
  // into the reply this line renders directly beneath.
  assert.doesNotMatch(
    line.text,
    /\bcredits?\b/i,
    `the quota outcome line makes a claim about Credits it cannot support: "${line.text}". `
      + 'The reply above it owns the money, because it is the only side that knows the number.',
  );
});

/**
 * THE SENTENCE EXISTS TWICE, and the first fix only reached one of them.
 *
 * `lib/announce.ts` keeps its own OUTCOME_SPEECH table for the live region — deliberately, because
 * a bare "Stopped." read aloud has no subject. That is a second literal, and it still said "That
 * used the last of today’s Credits." after the visible one had been corrected. It was caught by
 * grepping the BUILT BUNDLE, not the source, which is why this assertion exists: a rule enforced
 * against one file passes over the copy in the next one.
 *
 * Read out of the source rather than by importing: the table is module-private on purpose, and
 * exporting it to make it testable would widen the module for the test's convenience.
 */
test('the SPOKEN quota line is held to the same rule as the visible one', () => {
  const table = /const OUTCOME_SPEECH: Record<string, string> = \{([\s\S]*?)\n\};/.exec(ANNOUNCE);
  assert.ok(table, 'THIS GUARD IS STALE: OUTCOME_SPEECH could not be read out of apps/web/src/lib/announce.ts');
  const spoken = /\n\s*quota: '([^']*)'/.exec(table[1]);
  assert.ok(spoken, `THIS GUARD IS STALE: OUTCOME_SPEECH has no quota entry to check:\n${table[1]}`);
  const text = spoken[1];

  assert.doesNotMatch(text, /\byour\b/i, `the spoken quota line addresses the listener's own allowance: "${text}"`);
  assert.doesNotMatch(text, /\bcapacit\w*|\badministrator\b/i, `the spoken quota line names a service ending: "${text}"`);
  assert.doesNotMatch(
    text,
    /\bcredits?\b/i,
    `the spoken quota line makes a claim about Credits it cannot support: "${text}". A listener has `
      + 'less chance than a reader of catching it — the reply that states the refund has already been '
      + 'spoken and gone.',
  );

  // The two tables must not drift APART on this either: whatever the turn shows, the live region
  // must not be the only one carrying a money claim.
  const visible = outcomeLine('quota', undefined).text;
  assert.equal(
    /\bcredits?\b/i.test(text),
    /\bcredits?\b/i.test(visible),
    `the spoken and visible quota lines disagree about whether Credits are mentioned at all:\n  spoken:  "${text}"\n  visible: "${visible}"`,
  );
});

// ------------------------------------------- the owner's own kill-switch copy ---

test('the kill switch states BOTH halves of what pausing costs a customer', () => {
  const start = ADMIN.indexOf("pending === 'kill'");
  assert.ok(start > 0, 'THIS GUARD IS STALE: the kill confirm dialog moved out of admin.tsx');
  const dialog = ADMIN.slice(start, ADMIN.indexOf('{pending ===', start + 10) > start
    ? ADMIN.indexOf('{pending ===', start + 10)
    : start + 4000)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

  assert.match(
    dialog,
    /put back|refunded|comes? back|given back/i,
    'the kill-switch dialog never says that a paused run which built nothing gets its Credits back. '
      + "It used to say the opposite — \"nothing is refunded automatically\" — and that told the owner "
      + 'his own pause button was more expensive to his customers than it is.',
  );
  assert.match(
    dialog,
    /already built|had built|changed anything|kept/i,
    'the dialog promises Credits back without the condition run-refund.ts actually puts on it: a run '
      + 'that already built something delivered, and is charged.',
  );
  assert.doesNotMatch(
    dialog,
    /nothing is refunded|not refunded automatically|no refund/i,
    'the kill-switch dialog denies the refund again',
  );
});

// ----------------------------------------------- the surface the site misses ---

/**
 * A refund DENIAL must name the case in which it holds.
 *
 * run-refund.ts denies exactly two: work the user KEPT (`delivered`) and a stop the user CHOSE
 * (`not_a_failure`). An unscoped "nothing is refunded" claims a general no-refund the product does
 * not have. This is deliberately not a ban on the word — the site's guard learned that lesson on
 * 2026-09-20 and its note is worth repeating: once a refund exists, the word appears legitimately
 * and a guard on the bare word fails on the truth.
 */
const DENIAL = /(\bnothing\b[^.!?]{0,70}\brefund\w*\b)|(\b(is|are|was|were)\s+not\s+refund\w*\b)|(\bno\s+refunds?\b)|(\bnever\s+refund\w*\b)/i;
/*
 * THE SCOPE MUST BE A PHRASE, NOT A STEM. The first version of this listed `build\w*`, and
 * "anyone mid-build loses the steps they were on and the Credits those steps cost, and nothing is
 * refunded automatically" — the exact sentence that shipped — scored as SCOPED because "mid-build"
 * contains "build". The teeth test below is what caught it. What makes a denial legitimate is that
 * it names the RUN'S OWN DELIVERY or the user's OWN stop, which is what run-refund.ts denies on;
 * the word "build" appearing anywhere in the sentence is not that.
 */
const SCOPED = /\b(already built|had built|it built|changed (anything|your place|the place|nothing)|kept|keeps (its|their|your)|you (chose|pressed)|stopp?(ed|ing|s)|cancel(led|ling|s)?|subscription|purchase)\b/i;

const stripComments = (src) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

const sentences = (hay) => hay.split(/(?<=[.!?])\s+/);

function sources() {
  const dir = join(WEB, 'src');
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
    .map((e) => join(e.parentPath ?? e.path, e.name));
}

function unscopedDenials(named) {
  const found = [];
  for (const [name, text] of named) {
    for (const sentence of sentences(stripComments(text))) {
      if (!DENIAL.test(sentence)) continue;
      if (SCOPED.test(sentence)) continue;
      found.push(`${name}: "${sentence.trim().replace(/\s+/g, ' ').slice(0, 180)}"`);
    }
  }
  return found;
}

test('no screen in the app denies a refund without naming when the denial holds', () => {
  const files = sources();
  // NON-VACUITY, TWICE OVER. The count proves the walk found the tree; the two named files prove it
  // found the two surfaces this guard exists for. apps/site's version of this test shipped green
  // for a while iterating the CHARACTERS OF A PATH, and a scan that matches nothing is otherwise
  // indistinguishable from a scan reading the wrong text.
  assert.ok(files.length > 50, `found ${files.length} sources under apps/web/src — this guard is looking in the wrong place`);
  const rel = files.map((f) => relative(join(WEB, 'src'), f));
  for (const must of ['routes/admin.tsx', 'components/ws/outcome-model.ts']) {
    assert.ok(rel.includes(must), `the walk did not reach ${must}, which is one of the two files this guard was written for`);
  }

  const found = unscopedDenials(files.map((f) => [relative(WEB, f), readFileSync(f, 'utf8')]));
  assert.deepEqual(
    found,
    [],
    'a screen tells somebody their Credits are not refunded, without the condition run-refund.ts '
      + `actually puts on that — kept work, or a stop they chose:\n  ${found.join('\n  ')}`,
  );
});

test('the guard has teeth: it still catches the sentence that shipped, and lets the true one through', () => {
  const shipped = 'Resuming later does not resume them — anyone mid-build loses the steps they were '
    + 'on and the Credits those steps cost, and nothing is refunded automatically.';
  assert.equal(unscopedDenials([['admin.tsx', shipped]]).length, 1, 'the shipped sentence slipped past — re-aim the pattern');

  // The true denials must keep passing, or this would push the product into silence about the two
  // cases where it really does keep the money. Both are shipped copy, from apps/site.
  const trueDenials = [
    ['credits-and-limits.astro', 'Stopping a run yourself is not a failure, so it is not refunded.'],
    ['credits-and-limits.astro', 'A run that changed your place keeps its Credits, so nothing is refunded for it.'],
  ];
  assert.deepEqual(unscopedDenials(trueDenials), []);

  // And the replacement that now ships must not trip it either.
  const replacement = 'A run that had already built something is charged for it; a run that had not '
    + 'yet changed anything has its Credits put back automatically.';
  assert.deepEqual(unscopedDenials([['admin.tsx', replacement]]), []);
});
