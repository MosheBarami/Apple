/**
 * EVERY SURFACE A PERSON READS SHOWS CREDITS, NEVER THE LEDGER UNITS THE WORKER COUNTS IN.
 *
 * The ledger (QuotaDO, the run charge, `QuotaState`, `msg_end.creditsSpent`) counts in units of
 * NEURONS_PER_CREDIT neurons and a credit is INTERNAL_PER_CREDIT (150) of them. The pricing commit
 * converted the usage meter and the plan ladder and left a long tail of surfaces printing a raw
 * ledger figure beside the word "Credits" (a turn that cost 0.07 credits read "10 Credits").
 *
 * WHAT THIS HOLDS. Each surface is RENDERED (react-dom/server over the real bundled component) with
 * a realistic ledger-unit input, and the markup is read: the converted figure must be there and the
 * raw one must not. Reverting any single conversion at its call site fails the test named for it.
 * The surfaces whose component is not exported or needs a browser are held by reading the call site,
 * and say so in their name. The worker's sentences (notifications, the Discord line, the refund
 * sentence) are held in apps/worker/tests/run-refund.test.mjs and discord-commands.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WEB, bundle, decomment, renderWith, text } from './ui-bundle.mjs';

const ui = await bundle(`
  export { createElement as h } from 'react';
  export { renderToStaticMarkup } from 'react-dom/server';
  export { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  export { Turn } from './src/components/ws/turn';
  export { UsagePage, CreditsRing } from './src/routes/usage';
  export { AccountMenuHeader } from './src/components/picks/settings/user-button';
  export { SlidingNumber } from './src/components/picks/composer/sliding-number';
  export { PlanLadder } from './src/components/plans';
  export { BrandingDetails } from './src/components/branding/branding-details';
  export * as shared from '@studpilot/shared';
`, { name: 'credits-in-credits', resolveDir: WEB });
const { h, shared } = ui;
const read = (...p) => readFileSync(join(WEB, 'src', ...p), 'utf8');

// The browser globals the usage page reads while rendering (its tab state starts from the URL).
globalThis.window = { location: { hash: '', search: '', href: 'https://studpilot.test/app/usage' }, history: { replaceState() {} }, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };

const render = (el) => renderWith(ui.renderToStaticMarkup, el);

test('THE USAGE PAGE: every figure it draws is credits, from the balance to the history', () => {
  const day = (offset, credits, events, kinds) => ({
    day: new Date(Date.now() - offset * 864e5).toISOString().slice(0, 10), credits, events, ...(kinds ? { kinds } : {}),
  });
  const qc = new ui.QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  // LEDGER units: 525 of Free's 750 a day left (3.50 of 5.00 credits), 300 purchased (2.00 credits).
  qc.setQueryData(['me'], {
    quota: {
      plan: 'free', creditsRemaining: 825, creditsDaily: 750, creditsMonthly: 4500, creditsUsedToday: 225, creditsUsedThisMonth: 600,
      resetsAtIso: new Date(Date.now() + 5 * 3600_000).toISOString(), allowanceRemaining: 525, credits: 300,
    },
  });
  // 450 ledger units today (3.00 credits) of which 300 were usage (2.00) and 150 admission (1.00).
  qc.setQueryData(['usage'], {
    days: [day(0, 450, 3, [{ kind: 'usage_agent', credits: 300 }, { kind: 'chat_agent', credits: 150 }]), day(1, 1500, 5, [{ kind: 'usage_agent', credits: 1500 }])],
    thisMonth: 1950,
    previousMonth: { month: '2026-09', credits: 3000 },
  });
  qc.setQueryData(['billing-config'], { configured: false, purchasable: [] });
  const markup = render(h(ui.QueryClientProvider, { client: qc }, h(ui.UsagePage)));
  const page = text(markup);
  const labels = [...markup.matchAll(/(?:aria-label|aria-valuetext|title)="([^"]*)"/g)].map((m) => m[1]).join('\n');
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const inPage = (re, what) => assert.match(page, re, `${what} is not on the page in credits`);
  const inLabels = (re, what) => assert.match(labels, re, `${what} is not in an accessible label in credits`);

  // The balance: the ring (its drawn number animates up from zero when rendered on the server, so
  // the figure is read from its accessible label), the extra credits, the live panel.
  inLabels(/3\.50 of 5\.00 Credits of allowance remaining today/, 'the ring');
  inPage(/of 5\.00/, 'the ring caption');
  inPage(/2\.00 extra credits/, 'the purchased balance');
  inPage(/Credits left5\.50/, 'the live panel balance (allowance plus purchased: 825 units)');
  inPage(/Spent today3\.00/, 'the live panel spend today (450 units)');
  // The count beside it is ledger ROWS (charges), and is not called builds: three rows were written today.
  inPage(/Charges today3/, 'the live panel count of ledger rows, called what it is');
  assert.doesNotMatch(page, /Builds today|Days you built/, 'a ledger-row count is labelled as builds');
  inPage(/Days you spent Credits/, 'the calendar heading');
  // The history: the month comparison, the 30-day line, the day bars and the calendar.
  inPage(/13\.00 Credits this month, down from 20\.00 last month/, 'the month comparison (1950 and 3000 units)');
  inPage(/Spent in 30 days13\.00/, 'the 30-day total');
  inLabels(/Spent in 30 days: 13\.00 Credits/, 'the line graph');
  inLabels(new RegExp(`${today}: 3\\.00 Credits`), "today's bar");
  inLabels(new RegExp(`${yesterday}: 10\\.00 Credits`), "yesterday's bar");
  inLabels(/: 3 charges, 3\.00 Credits/, "the calendar's tooltip for today (a ledger row is a charge)");
  inPage(/What those Credits went on[\s\S]*Requests13\.00/, 'the spend breakdown');
  // What the next request costs, and what a request is.
  inPage(/A request typically costs 0\.03\u20130\.12 Credits/, 'the per-request cost (4-18 units)');
  inPage(/A request here is one targeted edit, read back and verified, not a whole build/, 'the explanation of a request');
  inPage(new RegExp(`uses about ${shared.formatCredits(shared.TYPICAL_BUILD_CREDITS)} Credits`), 'what a typical build costs');
  // And none of the worker's own numbers survives anywhere a person could read it.
  for (const raw of ['525', '825', '450', '1500', '1950', '3000', '4500', '750']) {
    assert.doesNotMatch(`${page}\n${labels}`, new RegExp(`(^|[^\\d.])${raw}([^\\d]|$)`), `the ledger figure ${raw} reached the page`);
  }
});

// ----------------------------------- the three conversions the usage-page test above cannot see

/**
 * Review cycle 2, finding 6. Each of these three printed a figure through a conversion nothing pinned:
 * reverting it left every suite green. They are rendered here with a ledger-unit input and read.
 */
const meQuery = (quota) => {
  const qc = new ui.QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(['me'], { quota });
  return qc;
};
// LEDGER units: 525 of Free's 750 a day left (3.50 credits) and 300 purchased (2.00): 825 spendable, 5.50 credits.
const QUOTA = {
  plan: 'free', creditsRemaining: 825, creditsDaily: 750, creditsMonthly: 4500, creditsUsedToday: 225, creditsUsedThisMonth: 600,
  resetsAtIso: new Date(Date.now() + 5 * 3600_000).toISOString(), allowanceRemaining: 525, credits: 300,
};

test('THE ACCOUNT MENU: the balance in the header is credits (5.50), not the 825 ledger units the worker holds', () => {
  const markup = render(h(ui.QueryClientProvider, { client: meQuery(QUOTA) }, h(ui.AccountMenuHeader, { name: 'Ada', email: 'ada@example.com' })));
  assert.match(markup, /aria-label="5\.50 Credits left"/, 'the accessible label does not carry the converted balance');
  assert.match(markup, /<span class="pk-roll__sr">5\.50<\/span>/, 'the rolling counter does not announce the converted balance');
  assert.doesNotMatch(markup, /\b825\b|\b525\b/, 'a ledger-unit figure reached the account menu');
});

test('THE ACCOUNT MENU says it does not know, rather than print a balance, when the quota is unreadable', () => {
  const markup = render(h(ui.QueryClientProvider, { client: meQuery({ nonsense: true }) }, h(ui.AccountMenuHeader, { name: null, email: 'ada@example.com' })));
  assert.match(markup, /Not known right now/);
  assert.doesNotMatch(markup, /Credits left/);
});

test('THE COMPOSER\'S SLIDING NUMBER: with `decimals` it prints a credit balance to exactly that many places; without, a whole number', () => {
  const read = (props) => /<span class="gx-sr">([^<]*)<\/span>/.exec(render(h(ui.SlidingNumber, props)))?.[1];
  assert.equal(read({ value: 3.54, decimals: 2 }), '3.54', 'the decimals branch dropped the fraction');
  assert.equal(read({ value: 3.5, decimals: 2 }), '3.50', 'a credit balance always shows two places');
  assert.equal(read({ value: 0, decimals: 2 }), '0.00');
  assert.equal(read({ value: 1204.1, decimals: 2 }), '1,204.10', 'English separators, like every credit figure');
  assert.equal(read({ value: -3, decimals: 2 }), '0.00', 'a balance is never shown below zero');
  assert.equal(read({ value: NaN, decimals: 2 }), '0.00', 'an unreadable value is not a number to print');
  // Without `decimals` it is the characters-left counter: a whole number, rounded, through the shared formatter.
  assert.equal(read({ value: 1204.4 }), '1,204');
  assert.equal(read({ value: 7 }), '7');
  // The rolling columns are decoration: one digit column per digit of the SAME figure.
  const cols = (props) => (render(h(ui.SlidingNumber, props)).match(/class="pk-num__col"/g) ?? []).length;
  assert.equal(cols({ value: 3.54, decimals: 2 }), 3, '3.54 rolls three digit columns');
});

test('THE USAGE PAGE RING: the figure DRAWN in its centre is the balance in credits, not only the label', () => {
  // The drawn number animates up from zero; under reduced motion it is the balance from the first paint, which is
  // also what makes it readable here. (The usage-page test above reads the label, because it renders with motion.)
  globalThis.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  globalThis.document = { documentElement: { classList: { contains: () => false } } };
  try {
    const ring = render(h(ui.CreditsRing, { remaining: 525, daily: 750, period: 'day' }));
    assert.match(ring, /<text[^>]*class="ring-number"[^>]*>3\.50<\/text>/, 'the centre figure is not 3.50 credits');
    assert.match(ring, /<text[^>]*class="ring-caption"[^>]*>of 5\.00<\/text>/, 'the caption is not the daily allowance in credits');
    assert.match(ring, /aria-label="3\.50 of 5\.00 Credits of allowance remaining today"/);
    assert.doesNotMatch(ring, />525<|>750</, 'a ledger-unit figure is drawn in the ring');
    const month = render(h(ui.CreditsRing, { remaining: 4500, daily: 4500, period: 'month' }));
    assert.match(month, /class="ring-number"[^>]*>30\.00<\/text>/, 'the month ring draws 30.00 credits');
    assert.match(month, /remaining this month"/);
  } finally {
    globalThis.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    delete globalThis.document;
  }
});

// ------------------------------------------------------------------------------ the chat footer

const turnItem = (over) => ({
  id: 'm-1', role: 'assistant', content: 'Made the fog start farther away.', tools: [], streaming: false,
  createdAt: 1_700_000_000_000, endedAt: 1_700_000_001_000, stopReason: 'done', ...over,
});
/** The footer as a reader gets it: the figure the rolling counter announces (its own screen-reader text) and the word after it. */
const footer = (item) => {
  const html = render(h(ui.Turn, { item, status: null, isLast: true }));
  const m = /<span class="gx-sr">([^<]*)<\/span>[\s\S]*?<\/strong> (Credits?)</.exec(html);
  return m ? `${m[1]} ${m[2]}` : null;
};

test('THE TURN FOOTER: what a reply cost is credits with two decimals, never the ledger count', () => {
  assert.equal(footer(turnItem({ creditsSpent: 150 })), '1.00 Credits', '150 ledger units are 1.00 credit');
  assert.equal(footer(turnItem({ creditsSpent: 10 })), '0.07 Credits', 'a ten-unit reply is 0.07 credits, not "10 Credits"');
  assert.equal(footer(turnItem({ creditsSpent: 1 })), '0.01 Credits', 'one unit is not "1 Credit"');
  assert.equal(footer(turnItem({ creditsSpent: 1000 })), '6.67 Credits');
});

test('THE TURN FOOTER draws nothing for an absent or zero cost', () => {
  for (const creditsSpent of [undefined, 0]) assert.equal(footer(turnItem({ creditsSpent })), null);
});

// ------------------------------------------------------------------------------- branding copy

const brandingView = (branding) => ({
  branding, art: [], publish: { published: false, uploadSupported: false, note: 'Nothing was uploaded or published to Roblox.' },
});
const SAVED = {
  v: 1, names: ['Lava Rush'], selectedName: 'Lava Rush', shortDescription: 'Jump.', longDescription: 'Jump across lava.', tagline: 'Outrun',
  accent: '#FFB020', captures: [], generatedAt: '2026-09-29T10:00:00.000Z', updatedAt: '2026-09-29T10:00:00.000Z',
};
const brandingHtml = (view, draft) => text(render(h(ui.BrandingDetails, { view, draft, onDraft() {}, onSave() {}, onRegenerate() {}, onDownload() {} })));

test('BRANDING COPY: one generation is the ledger unit it charges, printed as credits (not "1 Credit")', () => {
  const cost = shared.creditsText(shared.BRANDING_COST_UNITS);
  assert.equal(cost, '0.01');
  const empty = brandingHtml(brandingView(null), null);
  assert.match(empty, new RegExp(`Uses about ${cost} Credits\\.`), 'the first-generation hint');
  assert.doesNotMatch(empty, /Uses 1 Credit/);
  const saved = brandingHtml(brandingView(SAVED), { selectedName: 'Lava Rush', shortDescription: 'Jump.', longDescription: 'Jump across lava.', tagline: 'Outrun' });
  assert.match(saved, new RegExp(`Regenerate uses about ${cost} Credits and replaces`), 'the regenerate hint');
  assert.doesNotMatch(saved, /uses 1 Credit/i);
});

// ------------------------------------------------------------------------------ the plan ladder

test('THE PLAN LADDER: allowances are credits from the table, and a purchase highlight is withheld while Credits cannot be bought', () => {
  assert.equal(shared.CREDIT_PURCHASE_LIVE, false, 'this test describes the state where Credits cannot be bought');
  const ladder = text(render(h(ui.PlanLadder, { current: 'free' })));
  for (const id of shared.LISTED_PLAN_IDS) {
    const t = shared.PLAN_TABLE[id];
    assert.ok(ladder.includes(`${shared.formatCredits(t.creditsPerMonth)} Credits a month`), `${t.name}: its monthly credits`);
    assert.ok(ladder.includes(`${shared.formatCredits(t.creditsPerDay)} a day`), `${t.name}: its daily credits`);
  }
  assert.doesNotMatch(ladder, /Buy credits/i, 'the Pro card sells buying Credits that nothing can sell');
  assert.doesNotMatch(ladder, /build mode/i, 'a plan card names build modes, and there are none: one engine, one kind of request');
  assert.match(ladder, /The same StudPilot engine as every plan/, 'the Free card says what it does include');
  assert.match(ladder, /Everything in Free/, 'the rest of the Pro highlights are still there');
});

// ----------------------------------------------- call sites that are not exported or need a browser

const calls = (file) => decomment(read(...file));

test('call site (source): the roadmap card and the suggestions print a cost only through creditRangeLabel', () => {
  for (const file of [['components', 'roadmap', 'milestone-card.tsx'], ['components', 'roadmap', 'suggestions.tsx']]) {
    const src = calls(file);
    assert.match(src, /creditRangeLabel\(/, `${file.at(-1)} never prints the credit range`);
    const stripped = src.replace(/creditRangeLabel\([^)]*\)/g, '');
    assert.doesNotMatch(stripped, /creditsLow|creditsHigh/, `${file.at(-1)} prints a raw creditsLow/creditsHigh, a ledger count`);
  }
  assert.match(decomment(read('components', 'roadmap', 'model.ts')), /creditsText\(low\)/, 'creditRangeLabel stopped converting');
});

test('call site (source): the automations panel converts the recorded spend and each run\'s cost', () => {
  const src = calls(['components', 'ws', 'automations-panel.tsx']);
  assert.match(src, /creditsText\(spend\.data\.credits\)/, 'the 30-day spend line prints a raw ledger count');
  assert.doesNotMatch(src, /\{spend\.data\.credits\}/);
  assert.match(src, /creditLabel\(r\.credits\)/, 'each run row prints its cost through creditLabel');
  assert.match(decomment(read('lib', 'automations.ts')), /creditsText\(ledgerUnits\)/, 'creditLabel stopped converting');
});

test('call site (source): the admin screen labels its ledger figures as units and does not call them Credits', () => {
  const admin = read('routes', 'admin.tsx');
  assert.match(admin, /allowanceRemaining\) : '—'\} ledger units/);
  assert.match(admin, /a\.quota\.credits\) : '—'\} ledger units/);
  assert.match(admin, /<th className="num">Ledger units<\/th>/);
  assert.doesNotMatch(admin, /formatNumber\(a\.quota\.(allowanceRemaining|credits)\) : '—'\} Credits/);
});
