/**
 * The Studio connection, as the browser is actually entitled to describe it.
 *
 * There are exactly four states, and every one of them is backed by a real
 * signal on the wire:
 *
 *   connecting     — the WebSocket to the project's SessionDO is still opening,
 *                    so nothing has told us anything about Studio yet. This is
 *                    "we do not know", not "not connected".
 *   connected      — the worker said so: `hello.studioConnected`, or a
 *                    `studio_status` with `connected: true`.
 *   disconnected   — Studio was attached during this session and no longer is:
 *                    a `studio_status` with `connected: false`, or the socket
 *                    dropped after we had seen it attached.
 *   not-connected  — the socket has an answer and the answer is no, and Studio
 *                    has never been attached in this session.
 *
 * WHAT IS DELIBERATELY ABSENT: any notion of "the plugin is installed". The
 * browser has no signal for that and cannot acquire one — a Roblox plugin
 * cannot be probed from a web page, the Creator Store exposes no per-user
 * install state to third parties, and the plugin only reaches us once it has
 * been paired, at which point the honest word is "connected". Adding an
 * `installed` state here would mean inventing it, so there isn't one.
 */
import type { ConnState } from './use-project-socket';

export type StudioConnection = 'connecting' | 'connected' | 'disconnected' | 'not-connected';

/**
 * @param conn            the WebSocket's own state
 * @param studioConnected the worker's most recent word on Studio
 * @param everConnected   whether `studioConnected` has ever been true THIS BROWSER SESSION
 * @param everPaired      whether the worker says this project has a plugin that has ever polled
 */
export function studioConnection(
  conn: ConnState,
  studioConnected: boolean,
  everConnected: boolean,
  everPaired = false,
): StudioConnection {
  if (studioConnected) return 'connected';
  // Having seen Studio and lost it is a different fact from never having had
  // it, and the UI says different things about the two.
  //
  // `everConnected` STARTS FALSE ON EVERY PAGE LOAD, and that is what put the three-step
  // first-time setup card — "Studio plugin unavailable / Open the plugin / Pair your project" —
  // in front of the owner of a project paired four days earlier, with an expiry a month out, whose
  // Studio simply had a different place open. He read it as the product not knowing he had paired,
  // which is exactly what it says.
  //
  // The worker knew the whole time: the pairing dialog on the same screen prints PAIRED, EXPIRES
  // and "last seen 11m" from `lastSeenAt`. The browser had the fact and dropped it for this one
  // decision. `everPaired` is that fact, and it is the same question asked of a longer memory —
  // "has a plugin ever polled for this project", not "have I personally seen it since this tab
  // opened".
  if (everConnected || everPaired) return 'disconnected';
  // No socket yet means no answer yet. Claiming "not connected" here would put
  // a three-step setup card in front of a user who is already set up, for as
  // long as the handshake takes.
  if (conn === 'connecting' || conn === 'reconnecting') return 'connecting';
  return 'not-connected';
}

// ---------------------------------------------------------------------------------------------
// HOW HEALTHY IS THE LINK, IN WORDS.
//
// `studioConnection` above answers "is Studio there", which is a boolean question and was for a
// long time the only question the browser could ask. Everything below answers the ones a user
// actually has when the answer is no, and every one of them was already known to the worker and
// simply never crossed the wire:
//
//   WHEN did it last poll?   `pluginLastSeen` — kept, checkpointed every 4s, used by the worker to
//                            decide `connected`, and never sent. "Not connected" reads identically
//                            for a Studio that closed ten seconds ago and one that closed in March,
//                            and only one of those is worth waiting for.
//   HOW MANY changes are waiting?  The op queue is durable and its depth was exposed only on the
//                            admin-key `/info`.
//   HOW SLOW is the round trip?  The browser pings every 25s and the worker pongs; the pong was
//                            discarded with `case 'pong': break;`.
//   IS IT THE RIGHT PLACE?   The plugin session is plugin-wide, so Studio can be attached, healthy
//                            and holding a completely different place open.
//
// THE RULE EVERY FUNCTION HERE OBEYS: a thing that has not been measured returns `null`, never a
// number and never a sentence. An unmeasured round trip rendered as "0 ms" is a failure to observe
// wearing the clothes of an observation, and 0 ms is also the single most reassuring value it
// could possibly show.

import type { ServerMsg, StudioPlace } from '@golem/shared';

export interface StudioLinkFacts {
  /** When the plugin last polled, in server time. Null means it never has. */
  lastSeenAt: number | null;
  /** Ops waiting for the plugin to collect them. */
  queuedOps: number;
  /** The place this project is bound to, or null while nothing identifiable has been seen. */
  place: StudioPlace | null;
  /** Set while Studio is attached but has a different place open. */
  placeMismatch: { expectedPlaceName: string; openPlaceName: string; openPlaceId: number } | null;
  /** Measured round trip to the worker, or null when no pong has been timed yet. */
  rttMs: number | null;
}

export const NO_LINK_FACTS: StudioLinkFacts = {
  lastSeenAt: null,
  queuedOps: 0,
  place: null,
  placeMismatch: null,
  rttMs: null,
};

/**
 * WHAT THE WIRE JUST TOLD US ABOUT THE LINK, folded into what we already knew.
 *
 * The facts above were formatted by nothing and produced by nothing: `handleServerMsg` read
 * `studioConnected` and `state` and dropped every other field of `hello` and `studio_status` on the
 * floor. This is the missing half, pulled out of the hook so it can be driven with real message
 * shapes rather than asserted about by reading source.
 *
 * TWO RULES, AND THEY ARE THE WHOLE POINT.
 *
 *   AN ABSENT FIELD IS NOT A VALUE. A worker build that does not send `queuedOps` is saying
 *   nothing, and turning that into 0 would print "no changes waiting" — the reassuring answer —
 *   about a queue nobody measured. Absent therefore keeps what was already known.
 *
 *   AN EXPLICIT NULL IS A VALUE, and clears. `/studio/place/rebind` and `/studio/revoke` both
 *   broadcast `place: null`, and the worker sends `placeMismatch: null` the instant the user
 *   switches back to the right place. Remembering those would leave "nothing will build" printed
 *   over a link that is building. JSON.stringify drops undefined and keeps null, so the two
 *   genuinely arrive distinguishable.
 *
 * Anything that is not a number, not a place-shaped object, not a mismatch-shaped object, is
 * refused and leaves the field null. The formatters below then say nothing at all, which is the
 * correct thing to say about a measurement that did not arrive.
 */
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function asPlace(v: unknown): StudioPlace | null {
  if (typeof v !== 'object' || v === null) return null;
  const p = v as Partial<StudioPlace>;
  return typeof p.placeId === 'number' && typeof p.placeName === 'string' ? (v as StudioPlace) : null;
}

function asMismatch(v: unknown): StudioLinkFacts['placeMismatch'] {
  if (typeof v !== 'object' || v === null) return null;
  const m = v as Record<string, unknown>;
  if (typeof m.expectedPlaceName !== 'string' || typeof m.openPlaceName !== 'string') return null;
  return {
    expectedPlaceName: m.expectedPlaceName,
    openPlaceName: m.openPlaceName,
    openPlaceId: typeof m.openPlaceId === 'number' ? m.openPlaceId : 0,
  };
}

export function linkFactsFrom(prev: StudioLinkFacts, msg: ServerMsg): StudioLinkFacts {
  if (msg.type === 'hello') {
    return {
      ...prev,
      lastSeenAt: 'studioLastSeenAt' in msg ? num(msg.studioLastSeenAt) : prev.lastSeenAt,
      queuedOps: num(msg.queuedOps) ?? prev.queuedOps,
      place: 'studioPlace' in msg ? asPlace(msg.studioPlace) : prev.place,
    };
  }
  if (msg.type === 'studio_status') {
    return {
      ...prev,
      lastSeenAt: 'lastSeenAt' in msg ? num(msg.lastSeenAt) : prev.lastSeenAt,
      queuedOps: num(msg.queuedOps) ?? prev.queuedOps,
      place: 'place' in msg ? asPlace(msg.place) : prev.place,
      placeMismatch: 'placeMismatch' in msg ? asMismatch(msg.placeMismatch) : prev.placeMismatch,
    };
  }
  return prev;
}

/**
 * "just now", "4 minutes ago", "3 days ago" — or null when there is nothing to date.
 *
 * A FUTURE TIMESTAMP IS CLAMPED, NOT RENDERED. The server's clock and the browser's are unrelated,
 * and a few seconds of skew is normal; "last seen in 3 seconds" is nonsense that makes the whole
 * panel look broken. Anything not in the past reads as "just now", which is what it means.
 */
export function lastSeenLabel(lastSeenAt: number | null, now: number): string | null {
  if (typeof lastSeenAt !== 'number' || !Number.isFinite(lastSeenAt) || lastSeenAt <= 0) return null;
  const ago = now - lastSeenAt;
  if (ago < 10_000) return 'just now';
  const mins = Math.floor(ago / 60_000);
  if (mins < 1) return `${Math.floor(ago / 1000)} seconds ago`;
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * The round trip, or null when it has not been measured.
 *
 * Null is the answer for the first 25 seconds of every session, because that is when the first
 * ping goes out. Showing a placeholder number there would be inventing a measurement.
 */
export function latencyLabel(rttMs: number | null): string | null {
  if (typeof rttMs !== 'number' || !Number.isFinite(rttMs) || rttMs < 0) return null;
  if (rttMs < 1000) return `${Math.round(rttMs)} ms`;
  return `${(rttMs / 1000).toFixed(1)} s`;
}

/** "3 changes waiting", or null when the queue is empty — an empty queue is not news. */
export function queueLabel(queuedOps: number): string | null {
  if (!Number.isFinite(queuedOps) || queuedOps <= 0) return null;
  const n = Math.floor(queuedOps);
  return `${n} change${n === 1 ? '' : 's'} waiting`;
}

/**
 * The one sentence under the connection pill, or null when there is nothing worth saying.
 *
 * ORDER IS MEANING. A place mismatch outranks everything: the link is healthy, the pill is green,
 * and nothing will run — that is the only state where a user stares at a working connection and a
 * build that never starts, so it is said first and said in full.
 */
export function linkDetail(state: StudioConnection, facts: StudioLinkFacts, now: number): string | null {
  if (facts.placeMismatch) {
    const { openPlaceName, expectedPlaceName } = facts.placeMismatch;
    const open = openPlaceName || 'another place';
    const wanted = expectedPlaceName || 'a different place';
    return `Studio has "${open}" open, but this project is paired to "${wanted}". Nothing will build until you switch back or re-pair.`;
  }
  const seen = lastSeenLabel(facts.lastSeenAt, now);
  if (state === 'connecting') return null; // no answer yet is not a finding
  if (state === 'connected') {
    //[[ LATENCY IS NOT A FINDING, and putting it here contradicted this component's own rule.
    //
    //   studio-link-note.tsx says, in as many words: "A healthy, quiet link draws no strip at all
    //   rather than a row reading 'everything is fine', which is the kind of chrome that trains
    //   people to stop looking." A connected link with nothing wrong was drawing exactly that row.
    //
    //   SEEN ON THE OWNER'S SCREEN. Above his conversation, left-aligned under a hairline, sat the
    //   word-free string "71 ms" — and thirty seconds later "4.9 s", and later "141 ms". A number
    //   with no noun, changing on its own, at the top of the transcript. It is unreadable as a
    //   fact (71 ms of what?) and it moves, so it takes the eye every time it changes, and it is
    //   present precisely when there is nothing to report.
    //
    //   A QUEUE IS DIFFERENT and stays. "3 changes waiting" names something the user can act on:
    //   work has been accepted and has not landed yet. That is a finding; a round trip is a
    //   measurement, and measurements belong where someone goes to look for them, not in the one
    //   place everybody has to look anyway.
    //
    //   `latencyLabel` is kept and still tested — it is the right function for a diagnostics
    //   surface — it simply no longer fires the strip on its own. ]]
    return queueLabel(facts.queuedOps);
  }
  // Disconnected or never-connected. The timestamp is the whole point of these two branches: it is
  // what separates "close the lid and come back" from "this was never set up".
  const waiting = queueLabel(facts.queuedOps);
  const tail = waiting ? ` ${waiting[0]?.toUpperCase()}${waiting.slice(1)}, to be applied when it reconnects.` : '';
  if (seen) return `Studio last connected ${seen}.${tail}`;
  if (state === 'disconnected') return `Studio disconnected.${tail}`;
  return null; // never seen, never connected: the setup card already says this
}
