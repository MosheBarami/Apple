/**
 * Run something at most once at a time.
 *
 * Durable Objects are single-threaded, which is easy to mistake for "cannot race". It means
 * only that no two lines run simultaneously — an `async` handler still yields at every await,
 * and another frame delivered on the socket runs in that gap.
 *
 * That gap is what A3 was: two `chat` frames arriving together both read an idle agent from
 * storage, so both spent a Spark, both inserted a user row, and one of the two `msg_start`
 * broadcasts never got its `msg_end` — a message left spinning in the transcript forever.
 *
 * A guard fixes it only if it is established SYNCHRONOUSLY, before the first await. A check
 * that itself awaits anything is just a smaller race. This exists as a module so that
 * property can be asserted by a test instead of trusted from a reading.
 */

export type Attempted<T> = { ran: true; value: T } | { ran: false };

/**
 * Returns a guard that runs `fn` unless a previous call is still in flight.
 *
 * The flag is released in a `finally`, so a throwing `fn` does not wedge the gate shut — that
 * failure mode would turn a single bad request into a permanently unusable session.
 */
export function singleFlight() {
  let inFlight = false;

  return async function guard<T>(fn: () => Promise<T>): Promise<Attempted<T>> {
    // Synchronous. Everything about this working depends on nothing being awaited between
    // reading `inFlight` and setting it.
    if (inFlight) return { ran: false };
    inFlight = true;
    try {
      return { ran: true, value: await fn() };
    } finally {
      inFlight = false;
    }
  };
}
