// What Settings › Models & keys says, decided here where node can test it (owner decisions
// D-BYOK-1, D-BYOK-2, D-FREE-1). The panel (components/model-keys-panel.tsx) is markup and three
// requests.
//
// Three rules the sentences below keep:
//   * A key is never shown back. The server returns its last four characters and nothing else, and
//     that is all any sentence here can name.
//   * "Could not check" is not "works". OpenRouter being unreachable when the key was saved is its
//     own answer (`unchecked`), and it is said as one.
//   * The free list says when it was read, and says so plainly when it is the fallback list.
import { BYOK_PROVIDERS, type ByokProvider, type CatalogueModel, type ModelCatalogue, type ModelKeyCheck } from '@golem/shared';

/** A name for every provider a key can be saved for. A Record, so a new provider cannot go unnamed. */
export const PROVIDER_LABEL: Record<ByokProvider, string> = {
  openrouter: 'OpenRouter',
};

/**
 * Where a person gets a key, per provider. The provider's own page, not a guide of ours. Measured
 * 2026-09-23: it redirects (307) to openrouter.ai's workspace keys page; signing in is theirs.
 */
export const PROVIDER_KEYS_URL: Record<ByokProvider, string> = {
  openrouter: 'https://openrouter.ai/settings/keys',
};

export const PROVIDERS: readonly ByokProvider[] = BYOK_PROVIDERS;

/** The page's promise, in two sentences, and nothing it cannot keep. */
export const KEY_PROMISE = ["Your key is stored encrypted.", "Runs on your key don't use Apple Credits."] as const;

/** What saving found. `invalid` never gets here: the server refuses it and nothing is stored. */
export function describeCheck(check: ModelKeyCheck): string {
  if (check === 'valid') return 'Saved. OpenRouter accepted this key.';
  if (check === 'unchecked') return 'Saved, but OpenRouter could not be reached to check it yet.';
  return 'OpenRouter did not accept this key. Nothing was saved.';
}

/** The body of a refused save, read for the one fact the person can act on. */
export function describeSaveFailure(status: number, body: unknown, fallback: string): string {
  const check = body && typeof body === 'object' ? (body as { check?: unknown }).check : undefined;
  if (check === 'invalid') return describeCheck('invalid');
  // 503: the worker has no encryption key, so it stored nothing and sent nothing anywhere (D-BYOK-2).
  if (status === 503) return 'Keys cannot be saved right now. Nothing was stored. Try again later.';
  return fallback;
}

/** "ending abcd" — the four characters the server gave back, and never more. */
export function keyEnding(last4: string): string {
  return `ending ${last4.replace(/[^\w-]/g, '').slice(-4)}`;
}

/** The models OpenRouter prices at zero today, as the catalogue lists them. */
export function freeModels(catalogue: ModelCatalogue | null | undefined): CatalogueModel[] {
  return (catalogue?.models ?? []).filter((m) => m.free && !m.builtIn && m.supportsTools);
}

/** When the free list was read, and whether it is the live list or the fallback. */
export function freeListNote(catalogue: ModelCatalogue, formatTime: (iso: string) => string): string {
  const when = formatTime(catalogue.free.readAt);
  if (catalogue.free.source === 'snapshot') {
    return `OpenRouter could not be reached just now, so this is the list Apple read ${when}. Free models come and go.`;
  }
  return `Read from OpenRouter ${when}. Free models come and go.`;
}

/** Whether the free models need the person's own key. */
export function freeKeyNote(catalogue: ModelCatalogue, hasKey: boolean): string {
  if (catalogue.free.keyless) return 'These work without a key of your own right now.';
  return hasKey ? 'These run on your OpenRouter key and cost nothing.' : 'Add your OpenRouter key above to use these.';
}
