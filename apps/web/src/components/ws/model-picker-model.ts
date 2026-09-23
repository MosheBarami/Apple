// What the model picker offers, and why a row cannot be chosen — decided here, where node can test
// it, and drawn by model-picker.tsx.
//
// ONE LIST, THE REGISTRY (owner decision D-VISION-1). GET /api/models is the registry marked for the
// asking account's plan, and the worker is the authority: it re-checks the model at admission and at
// every step. When the listing could not be read, the picker marks the same registry here with the
// plan it has — `modelListing` is the one rule, in @golem/shared — rather than offering less, because
// a row the plan unlocks is not a promise nobody confirmed: it is the product's own list.
import { modelListing, registryModel, type ModelId, type ModelListing } from '@golem/shared';

export interface PickerRow {
  id: ModelId;
  label: string;
  vendor: string;
  /** Can be chosen right now. A row that cannot still shows, with `note` saying why. */
  available: boolean;
  /** The one plain line under the name. For a locked row it is the reason ("Included with Pro"). */
  note: string;
  /** The published cost ratio against Apple MAX; the row carries a "×N credits" badge above 1. */
  creditMultiplier: number;
  /** Key into ai-elements/logos/marks.ts, or null for Apple's own rows (drawn with ModelMark). */
  logo: string | null;
}

export interface PickerGroup {
  id: 'models';
  heading: string;
  rows: PickerRow[];
}

export const GROUP_HEADING = 'Models';

/** The vendored mark for a registry vendor. Apple's rows are drawn with Apple's own mark instead. */
export function logoFor(vendor: string): string | null {
  switch (vendor) {
    case 'OpenAI': return 'openai';
    case 'Google': return 'gemini';
    default: return null;
  }
}

/** The badge a row carries, or null when it costs what Apple MAX costs. */
export function creditBadge(multiplier: number): string | null {
  return multiplier > 1 ? `×${multiplier} credits` : null;
}

export function pickerGroups(input: { listing?: readonly ModelListing[] | null; modelPlan?: string }): PickerGroup[] {
  const listing = input.listing?.length ? input.listing : modelListing(input.modelPlan);
  const rows = listing.flatMap<PickerRow>((m) => {
    // A row the registry in this build does not know cannot be named, marked or sent; leave it out.
    const model = registryModel(m.id);
    if (!model) return [];
    return [{
      id: model.id,
      label: model.displayName,
      vendor: model.vendor,
      available: m.available,
      note: m.available ? model.blurb : m.lockedReason,
      creditMultiplier: m.creditMultiplier,
      logo: logoFor(model.vendor),
    }];
  });
  return [{ id: 'models', heading: GROUP_HEADING, rows }];
}

/** The row for the model a send would use, or null when it is not in what the picker offers. */
export function findRow(groups: readonly PickerGroup[], id: string): PickerRow | null {
  for (const group of groups) {
    const row = group.rows.find((r) => r.id === id);
    if (row) return row;
  }
  return null;
}
