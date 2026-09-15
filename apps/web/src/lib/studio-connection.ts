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
 * @param everConnected   whether `studioConnected` has ever been true this session
 */
export function studioConnection(
  conn: ConnState,
  studioConnected: boolean,
  everConnected: boolean,
): StudioConnection {
  if (studioConnected) return 'connected';
  // Having seen Studio and lost it is a different fact from never having had
  // it, and the UI says different things about the two.
  if (everConnected) return 'disconnected';
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

import type { StudioPlace } from '@golem/shared';

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
 * Fold a `studio_status` into what is already known.
 *
 * A MERGE, NOT A REPLACEMENT, and that is the whole decision. Every one of these fields is
 * optional on the wire, so a status that mentions only `connected` must leave the rest as it was:
 * spreading an absent `queuedOps` over a known 4 turns "the server did not say this time" into
 * "nothing is waiting", which is the reassuring reading and the wrong one. The same trick in the
 * other direction is worse — an omitted `placeMismatch` would silently resolve the one state where
 * the pill is green and nothing will ever build.
 *
 * The timestamp deliberately survives a disconnection. It is the entire reason it is carried: "last
 * connected 4 minutes ago" and "Studio was never here" are the same boolean and different problems.
 */
export function factsFromStatus(
  prev: StudioLinkFacts,
  msg: {
    lastSeenAt?: number | null;
    queuedOps?: number;
    place?: StudioPlace | null;
    placeMismatch?: { expectedPlaceName: string; openPlaceName: string; openPlaceId: number } | null;
  },
): StudioLinkFacts {
  return {
    ...prev,
    lastSeenAt: msg.lastSeenAt === undefined ? prev.lastSeenAt : msg.lastSeenAt,
    queuedOps: msg.queuedOps === undefined ? prev.queuedOps : msg.queuedOps,
    place: msg.place === undefined ? prev.place : msg.place,
    placeMismatch: msg.placeMismatch === undefined ? prev.placeMismatch : msg.placeMismatch,
  };
}

/**
 * Time a round trip from the pong's echoed `t`, or change nothing.
 *
 * NOTHING IS THE ANSWER MORE OFTEN THAN IT LOOKS. A pong with no echo cannot be timed, and a pong
 * whose `t` is in the future means the two clocks disagree, not that the network is faster than
 * causality. Both leave the previous measurement exactly where it was — the alternative is a 0 ms
 * on screen, which is simultaneously a lie and the most reassuring value this field can hold.
 */
export function factsFromPong(prev: StudioLinkFacts, msg: { t?: unknown }, now: number): StudioLinkFacts {
  const sentAt = typeof msg.t === 'number' && Number.isFinite(msg.t) ? msg.t : null;
  if (sentAt === null) return prev;
  const rtt = now - sentAt;
  if (!Number.isFinite(rtt) || rtt < 0) return prev;
  return { ...prev, rttMs: rtt };
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
    const parts = [latencyLabel(facts.rttMs), queueLabel(facts.queuedOps)].filter((p): p is string => p !== null);
    return parts.length ? parts.join(' · ') : null;
  }
  // Disconnected or never-connected. The timestamp is the whole point of these two branches: it is
  // what separates "close the lid and come back" from "this was never set up".
  const waiting = queueLabel(facts.queuedOps);
  const tail = waiting ? ` ${waiting[0]?.toUpperCase()}${waiting.slice(1)}, to be applied when it reconnects.` : '';
  if (seen) return `Studio last connected ${seen}.${tail}`;
  if (state === 'disconnected') return `Studio disconnected.${tail}`;
  return null; // never seen, never connected: the setup card already says this
}
