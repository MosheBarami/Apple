/**
 * EVERY KEY A PROJECT'S SESSION KEEPS IN DURABLE STORAGE, said once, with what a fresh start does to it.
 *
 * "Every project is new: nothing from one project may leak into another" (owner directive, 2026-10-02). The leaks the audit
 * found were all the same defect: state kept under a key, and a reset that listed some of the keys by hand (bench-reset
 * deleted nine and missed the rest). The list is derived from this table: one `resetProjectState` is used by /bench-reset (and
 * is what a "start over" calls), and tests/project-state.test.mjs fails when session.ts stores a key this table does not name,
 * so a new key cannot be added without deciding whether a fresh start erases it.
 *
 * 'reset' = belongs to the project's WORK (conversation memory, what was built, a plan, a pending choice, a queue): a fresh
 * start erases it. 'keep' = belongs to the project's IDENTITY or the Studio pairing: erasing it would unbind the project or
 * disconnect Studio, which is not what starting over means.
 */
export const STORAGE_KEYS = {
  agent: 'reset',
  memory: 'reset',
  memoryEditedAt: 'reset',
  pendingAssetChoice: 'reset',
  buildLedger: 'reset',
  playtestRun: 'reset',
  assetSourcesAwaitingRun: 'reset',
  assetSourcesAsked: 'reset',
  selfCheckLedger: 'reset',
  steerQueue: 'reset',
  placeMirrored: 'reset',
  pluginSelection: 'reset',
  opQueue: 'reset',
  bind: 'keep',
  pluginClient: 'keep',
  pluginLastSeen: 'keep',
  pluginPlace: 'keep',
  pluginState: 'keep',
  pluginSuperseded: 'keep',
  pluginTokenHash: 'keep',
  pluginTokenIssuedAt: 'keep',
  seq: 'keep',
} as const satisfies Record<string, 'reset' | 'keep'>;

export type StorageKey = keyof typeof STORAGE_KEYS;

/** The keys a fresh project start erases. */
export const RESET_KEYS: readonly StorageKey[] = (Object.keys(STORAGE_KEYS) as StorageKey[]).filter((k) => STORAGE_KEYS[k] === 'reset');
