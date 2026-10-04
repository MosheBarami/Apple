/**
 * The offer's rules, as functions of their inputs.
 *
 * WHY THESE MOVED OUT OF check-offer.mjs. The checker's own test suite passed 12/12 with the
 * daily-ceiling rule replaced by `if (false)`, and again with the contractual-terms list emptied
 * to `[]`. Both were measured, not suspected. G-ORACLE-3 — the gate asserting that this checker
 * measures the four numbers a plan has to reconcile — could not be falsified, which is the tell.
 *
 * The cause is worth stating precisely, because it is not sloppiness and it looks like rigour.
 * Four of those twelve tests are written as "if the repository violates this rule, assert the
 * checker reports it; otherwise assert the checker is silent":
 *
 *     const over = PLAN_IDS.filter((id) => limits[id].creditsPerDay > ceiling);
 *     for (const id of over) assert.match(r.out, ...);
 *     if (over.length) assert.equal(r.exit, 1);
 *
 * That is a correct sentence about a healthy repository and it exercises nothing. `over` is empty
 * — it is SUPPOSED to be empty — so the loop never runs and the assertion never fires. The tests
 * only ever walk the silent path, and a deleted rule is silent too. The healthier the repository
 * gets, the less these tests check, which is the worst possible gradient for a guard to have.
 *
 * A rule can only be shown to fire by being handed something that violates it. The checker is
 * pointed at the real repository and must stay green, so the violating input has to come from
 * somewhere else — which means the rules cannot live inside the script that supplies the real
 * data. They are pure functions of their inputs here, check-offer.mjs is the wiring that passes
 * the real tables in, and tests/check-offer.test.mjs passes in deliberately broken ones.
 *
 * Nothing here reads a file, runs git, or prints. That is the property that makes it testable.
 */

/** Credit claims a page can make to a reader: "30 Credits a day", "1,200 Credits per month". */
export const CREDIT_CLAIM = /(\d[\d,]{1,8})\s*(?:Credits?|credits?)\s*(?:a|per|\/)\s*(day|month)/g;

/**
 * Terms, not descriptions. §12.5 puts contractual promises in the owner's hands, and this product
 * now has subscriptions, so none of these may appear in copy without a dated owner statement.
 */
export const FOREVER = [/\$0\s*forever/i, /no card required,?\s*ever/i, /never be charged/i, /free\s+forever/i];

/**
 * COMMENTARY IS NOT COPY. A guard that reads source text must read the source, not the prose
 * explaining it.
 *
 * check-offer reported `pricing.astro states 60 Credits a day, which no plan grants` against a file
 * whose every rendered figure is interpolated from PLAN_LIMITS. The "claim" was a comment recording
 * why three literals had been replaced. It is the third guard in this repository caught doing this;
 * check-credit-figures.mjs carries the same note.
 *
 * The failure is not symmetric, which is what makes it worth fixing rather than rewording around:
 * a comment can only ever produce a FALSE ALARM here, and the cost of that false alarm is that
 * nobody can explain a number they corrected.
 *
 * `//` is treated as a comment only when the character before it is not `:`, so `https://` in an
 * href survives. A `//` inside some other string literal would be over-stripped; that narrows what
 * this can see rather than widening it.
 */
export const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * Rules 1-3: the four numbers a plan has to reconcile.
 *
 * @param {object} o
 * @param {string[]} o.planIds
 * @param {Record<string, {creditsPerDay: number, creditsPerMonth: number}>} o.limits  ledger units (PLAN_LIMITS)
 * @param {Record<string, {priceUsdMonthly: number|null}>} o.copy
 * @param {number} o.ceilingCredits  what the WHOLE SERVICE can serve in a day, in ledger units
 * @param {number} o.creditsPerBuild  ledger units in one quality-gated build
 * @param {number} o.usdPerCredit  dollars of compute per ledger unit
 * @param {number} o.margin
 * @param {string} [o.ceilingDetail] a human sentence naming where the ceiling comes from
 * @returns {{problems: string[], notes: string[]}}
 */
export function planProblems({
  planIds,
  limits,
  copy,
  ceilingCredits,
  creditsPerBuild,
  usdPerCredit,
  margin,
  ceilingDetail = '',
}) {
  const problems = [];
  const notes = [];

  /* --- 1. a priced plan must charge more than it costs to serve --- */
  for (const id of planIds) {
    const price = copy[id].priceUsdMonthly;
    if (price === null) {
      notes.push(`${id}: no price — negotiated, so no margin rule applies`);
      continue;
    }
    // The free tier is exempt from THIS rule and only this one: a margin rule that included a $0
    // plan would make any free tier arithmetically impossible, which is a rule about nothing. It
    // is still held to rule 3.
    if (price === 0) continue;
    const serveCost = limits[id].creditsPerMonth * usdPerCredit;
    const floor = serveCost * margin;
    if (price <= floor) {
      problems.push(
        `${id} charges $${price}/month for ${limits[id].creditsPerMonth.toLocaleString()} ledger units, ` +
        `which cost $${serveCost.toFixed(2)} to serve — below the $${floor.toFixed(2)} floor at ${margin}x`,
      );
    } else {
      notes.push(`${id}: $${price} vs $${floor.toFixed(2)} floor (serves for $${serveCost.toFixed(2)})`);
    }
  }

  /* --- 2. a promise the service can deliver in one day --- */
  // The one that matters most: not a pricing mistake but a promise that fails the moment one
  // subscriber uses what they bought.
  for (const id of planIds) {
    const day = limits[id].creditsPerDay;
    if (day > ceilingCredits) {
      problems.push(
        `${id} grants ${day} ledger units/day but the WHOLE SERVICE can serve ${ceilingCredits}` +
        `${ceilingDetail} One user on this plan exhausts the day for everyone.`,
      );
    }
  }

  /* --- 3. a free tier that can finish one complete job --- */
  const freeDay = limits.free?.creditsPerDay;
  if (freeDay !== undefined) {
    if (freeDay < creditsPerBuild) {
      problems.push(
        `the free plan grants ${freeDay} ledger units/day and one quality-gated build costs ${creditsPerBuild} — ` +
        `a free user cannot complete a single build in a day, so the trial demonstrates the product not working`,
      );
    } else {
      notes.push(`free: ${freeDay} ledger units/day affords ${Math.floor(freeDay / creditsPerBuild)} build(s) of ${creditsPerBuild}`);
    }
  }

  return { problems, notes };
}

/**
 * Rule 4: every quota a user reads equals the enforced one.
 *
 * A page promising a number the ledger does not grant is a page that lies, and the user finds out
 * at the moment they hit the wall. Numbers are matched only in a Credits context, so an unrelated
 * 400 in a CSS rule is not a false positive.
 *
 * @param {{rel: string, src: string}[]} files
 * @param {Set<number>} enforced every figure some plan actually grants
 */
export function copyProblems(files, enforced) {
  const problems = [];
  for (const { rel, src } of files) {
    for (const m of stripComments(src).matchAll(CREDIT_CLAIM)) {
      const claimed = Number(m[1].replace(/,/g, ''));
      if (!enforced.has(claimed)) {
        problems.push(`${rel} states ${claimed} Credits a ${m[2]}, which no plan grants`);
      }
    }
  }
  return problems;
}

/**
 * Rule 5: the promises a free tier must not make about money.
 *
 * @param {{rel: string, src: string}[]} files
 */
export function termProblems(files) {
  const problems = [];
  for (const { rel, src } of files) {
    // Comments stripped here too — a note saying "we must never write $0 forever" is not a page
    // writing it, and the rule is worth being able to record next to the code it governs.
    const text = stripComments(src);
    for (const re of FOREVER) {
      const hit = re.exec(text);
      if (hit) problems.push(`${rel} promises "${hit[0]}" — a contractual term, and this product now has subscriptions`);
    }
  }
  return problems;
}

/**
 * Rule 6: what is enforced is what the table says, in the ledger's unit.
 *
 * The plan table is in credits (what a person is shown) and PLAN_LIMITS is in ledger units (what
 * QuotaDO counts), INTERNAL_PER_CREDIT of them to a credit. They are one set of numbers only while
 * the second is derived from the first; this is the check that says so, handed both tables, so a
 * limit edited in one place and not the other is reported with both figures.
 *
 * @param {object} o
 * @param {string[]} o.planIds
 * @param {Record<string, {creditsPerDay: number, creditsPerMonth: number}>} o.table credits
 * @param {Record<string, {creditsPerDay: number, creditsPerMonth: number}>} o.limits ledger units
 * @param {number} o.internalPerCredit
 * @returns {string[]}
 */
export function limitProblems({ planIds, table, limits, internalPerCredit }) {
  const problems = [];
  for (const id of planIds) {
    for (const [field, per] of [['creditsPerDay', 'day'], ['creditsPerMonth', 'month']]) {
      const want = table[id][field] * internalPerCredit;
      if (limits[id][field] !== want) {
        problems.push(
          `${id} is enforced at ${limits[id][field]} ledger units a ${per}, but its plan table says ` +
          `${table[id][field]} credits a ${per}, which is ${want}`,
        );
      }
    }
  }
  return problems;
}

/** A monthly price in copy: "$9.99 a month", "$12/month", "$24.99 per month". */
export const PRICE_CLAIM = /\$(\d[\d,]*(?:\.\d{2})?)\s*(?:\/|a\s+|per\s+)(month|mo\b)/gi;

/**
 * Rule 7: a monthly price a page states is a price some plan charges.
 *
 * A price typed into copy is a price free to outlive the plan table: the site said $12 and $40 a
 * month after the owner had decided $9.99 and $24.99. Prices are matched only in a "per month"
 * context, so a dollar figure for AI compute ("$0.05") is not a plan price.
 *
 * @param {{rel: string, src: string}[]} files
 * @param {Set<number>} prices every monthly price some plan charges
 */
export function priceProblems(files, prices) {
  const problems = [];
  for (const { rel, src } of files) {
    for (const m of stripComments(src).matchAll(PRICE_CLAIM)) {
      const claimed = Number(m[1].replace(/,/g, ''));
      if (!prices.has(claimed)) {
        problems.push(`${rel} states $${m[1]} a month, which no plan charges`);
      }
    }
  }
  return problems;
}
