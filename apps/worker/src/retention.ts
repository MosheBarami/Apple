// HOW LONG THIS PRODUCT KEEPS THINGS. One table, and every sweep reads it from here.
//
// WHAT WAS HERE BEFORE: nothing, and eight files each carrying their own number. 30 days in
// do/admin.ts, 90 in automation-store.ts, 30 and 90 in notification-store.ts, a bare `35 * 864e5`
// twice inside do/quota.ts, `62 * 864e5` in do/budget.ts, `offset 25` twice in do/session.ts, an
// hour each in imagegen.ts and audio-store.ts, thirty days in webtools.ts. Every one correct, and
// no way to ANSWER the question a person actually asks — what do you keep, and for how long —
// except by reading eight files and hoping none had been missed.
//
// That is not a filing problem. The privacy page's answer to that question was written from memory
// and drifted from the code, which is the same failure mode as a comment asserting an invariant
// nothing enforces. And the drift hid something worse: three of these windows had NO SWEEP RUNNING
// AT ALL — purgeExpired, pruneNotifications and pruneExecutions were written, tested, exported and
// called by nothing, so the numbers beside them described a policy that was not happening. Putting
// the windows in one place is what made that visible, and retention-sweep.ts is what fixed it.
//
// A NUMBER HERE IS NOT A POLICY. `RETENTION_POLICY` below carries the sentence that goes with each
// window, so the served page and the sweep cannot disagree; tests/retention.test.mjs requires every
// key to have a description AND to be referenced by a file other than this one, because a window
// nothing applies is a promise with no mechanism.

export const RETENTION = {
  /** The analytics and audit event log in AdminDO, by age. */
  analyticsEventDays: 30,
  /** …and by row count, whichever bites first. Eviction is recorded, never silent. */
  analyticsEventRows: 5000,
  /** An automation's execution history — long enough to answer "what did this cost me last month". */
  automationRunDays: 90,
  /** An inbox row the person has read. */
  notificationReadDays: 30,
  /** An inbox row nobody read. Longer, because an unread warning is the one worth keeping. */
  notificationUnreadDays: 90,
  /** The per-day credit ledger in QuotaDO, and the applied-Stripe-event guard beside it. */
  quotaLedgerDays: 35,
  /** Service-wide inference spend in BudgetDO. Not one person's data. */
  serviceSpendDays: 62,
  /** Checkpoints kept per project: the newest this many, enforced at write time. */
  checkpointsKept: 25,
  /** A temporary preview or legacy generated image in KV. */
  generatedImageSeconds: 3600,
  /** Durable generated images per project; retained until that project is deleted. */
  generatedImagesKept: 64,
  /**
   * Generated audio ON THE KV PATH ONLY, which is now the path a deployment takes when it has no
   * object store. With a bucket the sound goes to R2, which does not expire, and the account's
   * lifecycle rule keeps the audio prefix for `generatedAudioR2Days`. Publishing one hour for
   * both would have been the same defect this page has had before: a window taken from the
   * constant that was easiest to read rather than from the store that enforces it.
   */
  generatedAudioSeconds: 3600,
  /** The R2 lifecycle rule on `audio/`. Changing the rule in Cloudflare means changing this. */
  generatedAudioR2Days: 365,
  /** A deleted workspace file stays recoverable this long. */
  workspaceTrashDays: 30,
  /** The longest a person may ask a remembered fact to live. Two years. */
  memoryMaxTtlDays: 730,
} as const;

export type RetentionKey = keyof typeof RETENTION;

/** Days as milliseconds. Written once so `90 * 86_400_000` stops being copied around. */
export const days = (n: number): number => n * 86_400_000;
/** Days as seconds, for the two stores whose TTL is expressed that way. */
export const seconds = (n: number): number => n * 86_400;

export interface RetentionRule {
  key: RetentionKey;
  /** What is kept, in the words a person would use. */
  what: string;
  /** How long, as prose: "30 days", "the newest 25". */
  window: string;
  /** Where it lives, so a reader can tie the sentence to the store. */
  where: string;
  /** Whether the rows are about one identifiable person. */
  personal: boolean;
}

/**
 * The same table, as sentences.
 *
 * This is the source the served pages should render from rather than restating the numbers, for
 * the reason the header gives: a number typed twice is a number that will disagree with itself.
 */
export const RETENTION_POLICY: readonly RetentionRule[] = [
  { key: 'analyticsEventDays', what: 'request and audit events, including who made a request', window: `${RETENTION.analyticsEventDays} days`, where: 'AdminDO', personal: true },
  { key: 'analyticsEventRows', what: 'the same log, capped by size so a busy day cannot push out a month', window: `the newest ${RETENTION.analyticsEventRows} rows`, where: 'AdminDO', personal: true },
  { key: 'automationRunDays', what: 'what each of your automations did, and what it cost', window: `${RETENTION.automationRunDays} days`, where: 'D1 automation_runs', personal: true },
  { key: 'notificationReadDays', what: 'inbox notifications you have read', window: `${RETENTION.notificationReadDays} days`, where: 'D1 notifications', personal: true },
  { key: 'notificationUnreadDays', what: 'inbox notifications you have not read', window: `${RETENTION.notificationUnreadDays} days`, where: 'D1 notifications', personal: true },
  { key: 'quotaLedgerDays', what: 'your per-day credit spend', window: `${RETENTION.quotaLedgerDays} days`, where: 'QuotaDO', personal: true },
  { key: 'serviceSpendDays', what: 'service-wide inference spend, with no account attached', window: `${RETENTION.serviceSpendDays} days`, where: 'BudgetDO', personal: false },
  { key: 'checkpointsKept', what: 'snapshots of your place', window: `the newest ${RETENTION.checkpointsKept} per project`, where: 'SessionDO', personal: true },
  { key: 'generatedImageSeconds', what: 'temporary previews and older generated images', window: `${RETENTION.generatedImageSeconds / 3600} hour`, where: 'KV', personal: true },
  { key: 'generatedImagesKept', what: 'new generated images saved with your project', window: `until project deletion; at most ${RETENTION.generatedImagesKept} per project`, where: 'R2 (the row that indexes it is in D1)', personal: true },
  { key: 'generatedAudioR2Days', what: 'sound the agent generated for you', window: `${RETENTION.generatedAudioR2Days} days`, where: 'R2', personal: true },
  { key: 'generatedAudioSeconds', what: 'sound generated before this moved to the object store, and sound made by a deployment that has none', window: `${RETENTION.generatedAudioSeconds / 3600} hour`, where: 'KV', personal: true },
  { key: 'workspaceTrashDays', what: 'workspace files you deleted, while they are still recoverable', window: `${RETENTION.workspaceTrashDays} days`, where: 'KV', personal: true },
  { key: 'memoryMaxTtlDays', what: 'the longest expiry you may set on anything Apple remembers', window: `${RETENTION.memoryMaxTtlDays} days`, where: 'D1 memory_entries', personal: true },
];
