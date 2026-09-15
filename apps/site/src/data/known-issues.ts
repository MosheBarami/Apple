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
  /** First observed, ISO date. */
  openedAt: string;
  /** Null while it is still true. */
  resolvedAt: string | null;
}

export const KNOWN_ISSUES: KnownIssue[] = [
  {
    id: 'plugin-not-in-creator-store',
    title: 'The Studio plugin is not listed in the Roblox creator store yet',
    impact:
      'Every "Install the plugin" link in the app and on this site goes to the documentation rather '
      + 'than straight to a store page, so installing takes a few more steps than it eventually will.',
    workaround:
      'Follow /docs/plugin, which has the current install route end to end. Nothing about the '
      + 'plugin itself is different — only how you get it — and the links become store links on '
      + 'their own the day the listing is live.',
    openedAt: '2026-09-01',
    resolvedAt: null,
  },
  {
    id: 'plugin-presence-not-detectable',
    title: 'Apple cannot tell whether the plugin is installed',
    impact:
      'The browser has no way to observe Roblox Studio, so the app never says "the plugin is '
      + 'missing". If you have not installed it, the workspace waits for a Studio that is never '
      + 'going to connect, and the reason is not stated on screen.',
    workaround:
      'If the Apple panel is not in Studio’s Plugins tab, it is not installed — /docs/plugin '
      + 'covers that case, and /docs/troubleshooting covers the panel that was installed and did '
      + 'not appear. We report installation as an action to take, never as a status we detected, '
      + 'because inventing that status would be worse than leaving it unsaid.',
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
