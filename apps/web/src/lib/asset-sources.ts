// Where Apple may take assets from, asked once and then remembered.
//
// The owner's rule: before Apple builds, ask whether it may use the curated Apple library, the
// Roblox Creator Store, or make things from scratch — and let that answer be settled once in
// settings instead of being asked forever.
//
// THE DECISIONS LIVE HERE, in a file with no JSX, because two of them are not obvious:
//
//   WHEN TO ASK. Not "on every build" and not "once ever". The dialog is owed when the stored
//   policy says `ask`, and a policy that says `remember` with an empty allow list is NOT a settled
//   answer — it is a person who dismissed something. `owesAnswer` is the one place that is decided.
//
//   WHAT EACH CHOICE COSTS. A source is not a preference like a theme: the Creator Store spends
//   nothing but inserts other people's work into your game, and "from scratch" spends credits and
//   time on every asset. A person choosing needs the consequence, not the label.
import type { AssetSourceChoice, AssetSourcePolicy } from '@golem/shared';
import { ASSET_SOURCE_CHOICES } from '@golem/shared';

export interface SourceExplanation {
  choice: AssetSourceChoice;
  title: string;
  /** What actually happens, in the words of the outcome. */
  does: string;
  /** The cost of choosing it, stated. Empty when there genuinely is none. */
  costs: string;
  /** How many library rows this choice can reach, so the scale is not a guess. */
  reach: string;
}

export const SOURCE_EXPLANATIONS: readonly SourceExplanation[] = [
  {
    choice: 'apple_library',
    title: 'The Apple library',
    does: 'Apple picks from assets it has already gathered and checked — props, textures, buildings, characters, icons.',
    costs: 'Nothing. These are found and licensed in advance.',
    // The real count, not a round impression. A figure somebody can check is worth more than
    // one that sounds impressive, and this one moves — it is the library's own total.
    reach: '510,979 assets, every one with its licence recorded.',
  },
  {
    choice: 'creator_store',
    title: 'The Roblox Creator Store',
    does: 'Apple searches the free Creator Store and references what it finds directly in your place.',
    costs: 'Nothing to buy, and nothing uploaded — but the work is other creators’ and stays credited to them.',
    reach: '81,311 free assets that need no upload to anybody’s account.',
  },
  {
    choice: 'from_scratch',
    title: 'Make it from scratch',
    does: 'Apple builds the geometry in your place out of parts, so nothing comes from anywhere else.',
    costs: 'Credits and time on every asset, and simple shapes rather than detailed models.',
    reach: 'Unlimited, and the only option that owes nobody a credit.',
  },
];

export function explainSource(choice: AssetSourceChoice): SourceExplanation | null {
  return SOURCE_EXPLANATIONS.find((e) => e.choice === choice) ?? null;
}

/**
 * Does Apple still owe this person the question?
 *
 * TWO WAYS TO BE UNANSWERED, and the second is the one worth writing down. `ask` is obvious. But
 * `remember` with an empty allow list is NOT a settled preference — it is what a dismissed dialog
 * leaves behind, and treating it as an answer means Apple builds with no sources at all and the
 * person never finds out why everything it makes is grey boxes.
 */
export function owesAnswer(policy: AssetSourcePolicy | null | undefined): boolean {
  if (!policy) return true;
  if (policy.mode === 'ask') return true;
  return policy.allow.length === 0;
}

/** What the dialog should start with. */
export function initialSelection(policy: AssetSourcePolicy | null | undefined): AssetSourceChoice[] {
  // A person who has chosen before sees their own answer again, not a blank form. A person who
  // has not gets the two that cost nothing — pre-ticking `from_scratch` would quietly opt them
  // into spending on every asset.
  if (policy && policy.allow.length) return [...policy.allow];
  return ['apple_library', 'creator_store'];
}

export interface SourceSummary {
  /** One line for the settings row and for the composer's status. */
  line: string;
  /** True when nothing is allowed, which is a state worth showing differently. */
  empty: boolean;
}

export function summarise(policy: AssetSourcePolicy | null | undefined): SourceSummary {
  if (!policy || policy.allow.length === 0) {
    return { line: 'Apple has no asset sources yet — it will ask before the next build.', empty: true };
  }
  const names = policy.allow
    .map((c) => explainSource(c)?.title ?? c)
    .map((t) => t.replace(/^The /, ''));
  const list = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const suffix = policy.mode === 'ask' ? ' Apple will ask again next time.' : '';
  return { line: `Apple may use ${list}.${suffix}`, empty: false };
}

/** Reject anything that is not a real choice before it reaches the worker. */
export function cleanSelection(input: readonly string[]): AssetSourceChoice[] {
  const seen = new Set<string>();
  return input.filter((c): c is AssetSourceChoice => {
    if (!(ASSET_SOURCE_CHOICES as readonly string[]).includes(c)) return false;
    if (seen.has(c)) return false;
    seen.add(c);
    return true;
  });
}
