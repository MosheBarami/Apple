// What the model picker offers, and why a row cannot be chosen — decided here, where node can test
// it, and drawn by model-picker.tsx.
//
// The worker is the authority (owner decisions D-BYOK-1, D-FREE-1): GET /api/models is the
// catalogue and GET /api/me/model-keys the saved keys. This file only groups what it is given. When
// the catalogue could not be read, the picker offers Apple's own models and nothing else: a row for
// a model nobody confirmed exists would be a promise the send cannot keep.
import {
  PRODUCT_MODELS,
  PRODUCT_MODEL_INFO,
  canUseProductModel,
  registryModel,
  type CatalogueModel,
  type ModelCatalogue,
  type ModelKeySummary,
  type ProductModel,
} from '@golem/shared';

export type PickerGroupId = 'apple' | 'keys' | 'free';

export interface PickerRow {
  id: string;
  label: string;
  vendor: string;
  group: PickerGroupId;
  /** Can be chosen right now. A row that cannot still shows, with `note` saying why. */
  available: boolean;
  /** The one plain line under the name. For a locked row it is the reason. */
  note: string;
  free: boolean;
  /** Key into ai-elements/logos/marks.ts, or null for a provider with no vendored mark. */
  logo: string | null;
}

export interface PickerGroup {
  id: PickerGroupId;
  heading: string;
  rows: PickerRow[];
}

export const GROUP_HEADING: Record<PickerGroupId, string> = {
  apple: 'Apple',
  keys: 'Your keys',
  free: 'Free',
};

export const KEY_MISSING_NOTE = 'Add your OpenRouter key in Settings to use this.';
export const FREE_KEY_MISSING_NOTE = 'Add your OpenRouter key in Settings to use free models.';

/**
 * The vendored mark for a catalogue id, read from the id's own vendor prefix (`openai/…`). A prefix
 * with no vendored mark — Poolside's is a gradient, Nex AGI and Thinking Machines have none in the
 * set — returns null, and the picker draws the vendor's initial instead of anybody's logo.
 */
export function logoFor(id: string): string | null {
  const prefix = id.split('/')[0] ?? '';
  switch (prefix) {
    case 'openai': return 'openai';
    case 'anthropic': return 'claude';
    case 'google': return /gemma/i.test(id) ? 'gemma' : 'gemini';
    case 'deepseek': return 'deepseek';
    case 'x-ai': return 'grok';
    case 'qwen': return 'qwen';
    case 'z-ai': return 'zai';
    case 'xiaomi': return 'xiaomimimo';
    case 'meta': return 'meta';
    case 'nvidia': return 'nvidia';
    case 'openrouter': return 'openrouter';
    case 'dots-studio': return 'dotsstudio';
    default: return null;
  }
}

function isProductModel(id: string): id is ProductModel {
  return (PRODUCT_MODELS as readonly string[]).includes(id);
}

/** The line under an Apple row. The same sentences the picker has always used. */
export function appleNote(id: ProductModel, modelPlan: string | undefined, maxUpgradeAvailable: boolean | null): string {
  if (id === 'apple') return 'Free · limited daily usage';
  if (canUseProductModel(id, modelPlan)) return 'Subscribers · extended capabilities';
  return maxUpgradeAvailable === false ? 'Subscribers · not available yet' : 'Subscribers · check availability';
}

function appleRow(id: ProductModel, modelPlan: string | undefined, maxUpgradeAvailable: boolean | null): PickerRow {
  return {
    id,
    label: PRODUCT_MODEL_INFO[id].name,
    vendor: 'Apple',
    group: 'apple',
    available: canUseProductModel(id, modelPlan),
    note: appleNote(id, modelPlan, maxUpgradeAvailable),
    free: false,
    logo: null,
  };
}

export function pickerGroups(input: {
  catalogue?: ModelCatalogue | null;
  keys?: readonly ModelKeySummary[] | null;
  modelPlan?: string;
  maxUpgradeAvailable?: boolean | null;
}): PickerGroup[] {
  const { catalogue, modelPlan, maxUpgradeAvailable = null } = input;
  const hasKey = (input.keys ?? []).some((key) => key.provider === 'openrouter');
  const keyless = catalogue?.free.keyless === true;

  const models: readonly CatalogueModel[] = catalogue?.models ?? [];
  const builtIn = models.filter((m) => m.builtIn && isProductModel(m.id)).map((m) => m.id as ProductModel);
  // Apple's own rows are ours to name even when the catalogue is absent: they are the models the
  // product has always offered, and the entitlement rule is in @golem/shared.
  const appleIds = builtIn.length > 0 ? builtIn : [...PRODUCT_MODELS].filter((id) => registryModel(id)?.vendor === 'Apple');
  const apple = appleIds.map((id) => appleRow(id, modelPlan, maxUpgradeAvailable));

  const offered = models.filter((m) => !m.builtIn && m.supportsTools);
  const keys = offered.filter((m) => !m.free).map<PickerRow>((m) => ({
    id: m.id,
    label: m.label,
    vendor: m.vendor,
    group: 'keys',
    available: hasKey,
    note: hasKey ? `${m.vendor} · runs on your key` : KEY_MISSING_NOTE,
    free: false,
    logo: logoFor(m.id),
  }));
  const free = offered.filter((m) => m.free).map<PickerRow>((m) => ({
    id: m.id,
    // OpenRouter names its free variants "… (free)"; the row's Free badge already says so.
    label: m.label.replace(/\s*\(free\)\s*$/i, '') || m.label,
    vendor: m.vendor,
    group: 'free',
    available: hasKey || keyless,
    note: hasKey || keyless ? `${m.vendor} · free for now` : FREE_KEY_MISSING_NOTE,
    free: true,
    logo: logoFor(m.id),
  }));

  const groups: PickerGroup[] = [{ id: 'apple', heading: GROUP_HEADING.apple, rows: apple }];
  if (keys.length) groups.push({ id: 'keys', heading: GROUP_HEADING.keys, rows: keys });
  if (free.length) groups.push({ id: 'free', heading: GROUP_HEADING.free, rows: free });
  return groups;
}

/** The row for the model a send would use, or null when it is not in what the picker offers. */
export function findRow(groups: readonly PickerGroup[], id: string): PickerRow | null {
  for (const group of groups) {
    const row = group.rows.find((r) => r.id === id);
    if (row) return row;
  }
  return null;
}
