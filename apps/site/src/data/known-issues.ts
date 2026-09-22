/**
 * What is known to be wrong or limited right now, published on /status.
 *
 * WHY A MODULE AND NOT A TABLE. /status could tell a visitor that the API answered — which is not
 * the question being asked by someone whose plugin will not appear, or whose build stops the same
 * way twice. The product had no incident list at all, and the cheapest honest way to have one is a
 * file: publishing an issue is a commit and a deploy, reviewed like any other change, with no
 * schema, no route and no admin screen that would never get built. The cost is that an entry goes
 * live on the next deploy rather than instantly. For a product whose entire incident history fits
 * on one screen, that is the right side of the trade.
 *
 * WHAT BELONGS HERE. Things a user can hit, that we know about, that have a workaround. Not
 * roadmap items ("we would like to support X"), and not defects nobody outside the team can
 * observe. If there is nothing to say, the correct content of this file is an empty array and the
 * page says so plainly — an invented entry to make the page look maintained is worse than a short
 * page, because it teaches people the list is decorative.
 *
 * DATES ARE `YYYY-MM-DD` and `openedAt` means FIRST OBSERVED, not first introduced: when a defect
 * started is usually unknowable, and a guessed date is a claim.
 */

export interface KnownIssue {
  /** Stable slug. It is the anchor on /status, so renaming one breaks a link someone may have. */
  id: string;
  title: string;
  /** Who this reaches and what they see. Written for the person it happened to. */
  impact: string;
  /** What to do instead, today. An entry with no workaround is an apology, not an answer. */
  workaround: string;
  /** Explicit recovery destinations, rendered as keyboard-accessible links. */
  links?: { label: string; href: string }[];
  /** First observed, ISO date. */
  openedAt: string;
  /** Null while it is still true. */
  resolvedAt: string | null;
}

export const KNOWN_ISSUES: KnownIssue[] = [
  {
    // CLOSED 2026-09-22, NOT DELETED. The listing (asset 107230158271368, "Apple Studio") resolves
    // publicly again — toolbox details, Creator Store search and the rendered store page all show it
    // free to get — and packages/shared flipped STUDIO_PLUGIN_STORE_LIVE to true. The entry stays so
    // the page shows the list is maintained; tests/known-issues.test.mjs holds it to the flag in
    // both directions.
    id: 'plugin-not-in-creator-store',
    title: 'Studio plugin installation was unavailable',
    impact:
      'Between 1 and 22 September 2026 the Studio plugin could not be installed from the Roblox '
      + 'Creator Store, so new customers could chat but could not build inside Studio.',
    workaround:
      'Resolved: Apple Studio is on the Creator Store again. Get it from the store page, install it '
      + 'from the Studio Toolbox, then pair it with your project.',
    links: [{ label: 'Install the plugin', href: '/docs/plugin' }],
    openedAt: '2026-09-01',
    resolvedAt: '2026-09-22',
  },
  {
    id: 'plugin-presence-not-detectable',
    title: 'An offline connection does not prove the plugin is missing',
    impact:
      'Apple reports a live connection when a paired plugin communicates with it. Without that '
      + 'connection, the browser cannot distinguish an uninstalled plugin from a closed or disconnected Studio.',
    workaround:
      'Open Studio and its Apple panel, then connect it to your project. If there is no Apple button '
      + 'in the Plugins tab, the plugin is not installed yet — get Apple Studio from the Creator Store first.',
    links: [
      { label: 'Troubleshoot a missing panel', href: '/docs/troubleshooting' },
      { label: 'Install the plugin', href: '/docs/plugin' },
    ],
    openedAt: '2026-09-01',
    resolvedAt: null,
  },
  {
    id: 'pricing-page-downloaded',
    title: 'The pricing page downloaded itself instead of opening',
    impact:
      'Static uploads were served without a content type, so browsers downloaded /pricing as a file '
      + 'rather than rendering it. The commercial page of the product did not open.',
    workaround:
      'None was needed after the fix — reloading the page is enough. It is listed here because it '
      + 'reached real visitors, and a status page that only ever shows green is not a status page.',
    openedAt: '2026-09-15',
    resolvedAt: '2026-09-15',
  },
];

/** Newest first, because the thing breaking today is the one being looked for. */
export function openIssues(issues: KnownIssue[] = KNOWN_ISSUES): KnownIssue[] {
  return issues.filter((i) => i.resolvedAt === null).sort((a, b) => b.openedAt.localeCompare(a.openedAt));
}

/**
 * The most recently RESOLVED entries, so the page proves it is maintained.
 *
 * Sorted by resolution date rather than by when the issue started: an old defect fixed yesterday is
 * the interesting one, and ordering by `openedAt` would bury it under three that were closed months
 * ago.
 */
export function resolvedIssues(issues: KnownIssue[] = KNOWN_ISSUES, limit = 3): KnownIssue[] {
  return issues
    .filter((i) => i.resolvedAt !== null)
    .sort((a, b) => (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? ''))
    .slice(0, limit);
}
