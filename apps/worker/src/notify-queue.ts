// NOTIFICATIONS THROUGH A CLOUDFLARE QUEUE (D-VISION-1).
//
// `notify` is seven or eight D1 round trips (preferences at three scopes, org membership, the
// table check, the write). The worker used to run them inside `waitUntil` beside the response — a
// billing-problem notice, a security notice, a batch of @mentions — which means two things: the
// work competes with the request that triggered it, and a D1 hiccup loses the notice for good,
// because `notify` reports `store_error` and nobody tries again.
//
// With the `NOTIFY_QUEUE` binding the request only hands the inputs to the queue (one fast call)
// and the consumer below does the writes, retrying a `store_error` with backoff. Without the
// binding — tests, a local dev server, an older config — it is exactly the old `waitUntil` path.
import type { Env } from './env';
import { notify, notifyMany } from './notify';
import type { NotificationInput } from './notifications';

export const NOTIFY_QUEUE_NAME = 'apple-notifications';
/** Retries the consumer asks for before giving up on one notice (the queue's own max_retries is higher). */
export const NOTIFY_MAX_ATTEMPTS = 5;

/**
 * `c.executionCtx` THROWS when the worker was invoked without one (every route test calls
 * `app.fetch(request, env)`), so the background hook is resolved defensively, once, here.
 */
export function backgroundOf(c: { executionCtx: { waitUntil(p: Promise<unknown>): void } }): (p: Promise<unknown>) => void {
  try {
    const ctx = c.executionCtx;
    return (p) => ctx.waitUntil(p);
  } catch {
    return (p) => void p;
  }
}

/** Send notices in the background. Never throws and never makes the caller wait. */
export function dispatchNotifications(
  env: Env,
  inputs: readonly NotificationInput[],
  background: (p: Promise<unknown>) => void,
): void {
  if (inputs.length === 0) return;
  const direct = () => notifyMany(env, inputs).then(() => undefined);
  const queue = env.NOTIFY_QUEUE;
  const work = queue
    // A queue that refuses the send falls back to delivering now — the notice is never dropped
    // because the faster path was unavailable.
    ? queue.sendBatch(inputs.map((body) => ({ body }))).catch(direct)
    : direct();
  background(work.catch(() => undefined));
}

/** Seconds before the next try: 10, 20, 40, 80… capped at ten minutes. */
export function retryDelaySeconds(attempts: number): number {
  const n = Math.max(1, Math.floor(Number.isFinite(attempts) ? attempts : 1));
  return Math.min(600, 10 * 2 ** (n - 1));
}

/** The queue consumer. A refusal by policy (muted, no target) is final; a storage error is retried. */
export async function consumeNotifications(batch: MessageBatch<unknown>, env: Env): Promise<void> {
  for (const msg of batch.messages) {
    const outcome = await notify(env, msg.body as NotificationInput);
    if (!outcome.delivered && outcome.reason === 'store_error' && msg.attempts < NOTIFY_MAX_ATTEMPTS) {
      msg.retry({ delaySeconds: retryDelaySeconds(msg.attempts) });
    } else {
      msg.ack();
    }
  }
}
