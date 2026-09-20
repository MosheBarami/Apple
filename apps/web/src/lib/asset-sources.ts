// Where Apple may take assets from, asked once and then remembered.
//
// The owner's rule: before Apple builds, ask where it may take assets from — and let that answer
// be settled once in settings instead of being asked forever.
//
// IT WAS THREE CHOICES AND IS NOW TWO. `apple_library` — the curated Apple catalogue — was removed
// from the shared vocabulary on 2026-09-20 along with the catalogue itself (see
// ASSET_SOURCE_CHOICES in packages/shared). This file kept offering it: a card in the dialog, a
// pre-ticked box in the default selection, and a title in the settings summary, all naming a source
// no build can use. That is the failure the shared comment names in reverse — a control that
// changes nothing, discovered later by the person who ticked it — and it is also why this file did
// not typecheck once the vocabulary shrank.
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
  /** Availability and limits; local catalog counts do not prove live insertability. */
  reach: string;
}

export const SOURCE_EXPLANATIONS: readonly SourceExplanation[] = [
  {
    choice: 'creator_store',
    title: 'The Roblox Creator Store',
    does: 'Apple searches the free Creator Store and references what it finds directly in your place.',
    costs: 'Free assets need no purchase or re-upload. Builds still use Credits; creator licences apply.',
    reach: 'Availability depends on Roblox permissions and the selected asset.',
  },
  {
    choice: 'from_scratch',
    title: 'Make it from scratch',
    does: 'Apple builds the geometry in your place out of parts, so nothing comes from anywhere else.',
    costs: 'Credits and time on every asset, and simple shapes rather than detailed models.',
    reach: 'No external assets; limited by your Credits and what Studio can build.',
  },
];

/**
 * What a person who has never answered starts with.
 *
 * The one source that adds nothing to what a build already costs. `from_scratch` is deliberately
 * absent: it spends Credits and time on every asset, and a pre-ticked box is not a decision.
 */
const DEFAULT_TICKED: readonly string[] = ['creator_store'];

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

/**
 * Which choices this project may actually pick.
 *
 * `asset_sources` NARROWS downwards through org, account and project (apps/worker/src/
 * preferences.ts), so a project row can only ever REMOVE a source the layers above already allow.
 * A dialog that ignored that would offer three boxes, accept a tick on one an organisation
 * forbids, resolve the intersection to nothing, and then — because nothing is allowed —
 * `owesAnswer` would be true again and the same question would be asked forever. The box has to
 * be unavailable at the moment it is offered, not refused afterwards.
 *
 * NO CEILING MEANS NO LIMIT, and that is the ordinary case: nobody above this project has an
 * opinion, so all three are open. This is the opposite default from `allowedSources` in the worker
 * — deliberately. That one answers "what may a build touch", where absent must mean nothing. This
 * one answers "what may a person tick", where absent means nobody has restricted them.
 */
export function availableChoices(
  ceiling: AssetSourcePolicy | null | undefined,
): AssetSourceChoice[] {
  if (!ceiling || !Array.isArray(ceiling.allow)) return [...ASSET_SOURCE_CHOICES];
  return cleanSelection(ceiling.allow);
}

/** Why this choice cannot be picked here, or null when it can. */
export function unavailableReason(
  ceiling: AssetSourcePolicy | null | undefined,
  choice: AssetSourceChoice,
): string | null {
  if (availableChoices(ceiling).includes(choice)) return null;
  // It names the layer that decided AND the fact it is not this project's to change, because a
  // greyed box with no sentence beside it reads as a bug in the product rather than a rule.
  return 'Switched off for your account or organisation, so it cannot be turned on for one project.';
}

/**
 * What the dialog should start with.
 *
 * The ceiling is applied here too rather than only at the checkbox: a pre-ticked box that the
 * person never touched must not be a selection they cannot save.
 */
export function initialSelection(
  policy: AssetSourcePolicy | null | undefined,
  ceiling?: AssetSourcePolicy | null,
): AssetSourceChoice[] {
  const open = availableChoices(ceiling);
  // A person who has chosen before sees their own answer again, not a blank form. A person who has
  // not gets the ones that cost nothing — which, since the Apple library went, is `creator_store`
  // alone. `from_scratch` stays unticked deliberately: pre-ticking it would quietly opt somebody
  // into spending Credits and time on every asset before they had read what the box means.
  //
  // NARROWED TO THE LIVE VOCABULARY before it is used. This list is written out rather than
  // derived, because "costs nothing extra" is a judgement about each source and not something a
  // sentence can be parsed for — but a hand-written list is exactly what named `apple_library`
  // months after the catalogue went, so it is filtered through `cleanSelection` and a dead member
  // can only ever shrink the default, never survive in it.
  const want: AssetSourceChoice[] = policy && policy.allow.length
    ? [...policy.allow]
    : cleanSelection(DEFAULT_TICKED);
  return want.filter((c) => open.includes(c));
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
