// "Someone else is typing", decided here so it can be tested without a keyboard.
//
// THE THREE-STATE VOCABULARY EXISTED EVERYWHERE EXCEPT THE BROWSER. packages/shared declares the
// client frame `{type:'presence', activity:'viewing'|'typing'|'building'}`; the session DO handles
// it; components/presence-model.ts renders the verbs and sorts the strongest activity first; the
// stylesheet has rules for `.is-typing` and `.is-building`. And a repo-wide grep for a SEND site in
// apps/web/src found none — so `typing` could not occur, and a third of a shipped vocabulary was
// unreachable.
//
// WHY THIS IS A MODULE AND NOT A `setTimeout` IN THE COMPOSER. A frame per keystroke is a socket
// write per keystroke in the most-used control in the product, and the rule that prevents it — at
// most one every few seconds, then a single "I stopped" — is the whole of the behaviour. Written
// as a pure transition it can be driven with a clock; written inline it can only be reviewed.

/** At most one `typing` frame this often. A keystroke is not an event worth a packet. */
export const TYPING_REPEAT_MS = 5_000;

/**
 * How long after the last keystroke the person is called idle again.
 *
 * Shorter than TYPING_REPEAT_MS on purpose: a pause of three seconds means the sentence stopped,
 * and leaving `typing` on screen until the next repeat window would state something that is no
 * longer true — which is the same defect as a `building` beat nobody clears.
 */
export const TYPING_IDLE_MS = 3_000;

export type SentActivity = 'typing' | 'viewing';

export interface PresenceSignal {
  /** What the other people currently believe, i.e. the last frame we actually sent. */
  shown: SentActivity;
  /** When that `typing` frame went out. 0 when none has. */
  sentAt: number;
}

export const initialPresence = (): PresenceSignal => ({ shown: 'viewing', sentAt: 0 });

export interface Step {
  state: PresenceSignal;
  /** The frame to put on the wire, or null for "nothing to say". */
  send: SentActivity | null;
}

/**
 * A keystroke.
 *
 * Sends `typing` when the room does not already think we are, or when the last frame is old enough
 * that the server's own presence TTL would have started ageing it out.
 */
export function onComposerInput(state: PresenceSignal, nowMs: number): Step {
  if (!Number.isFinite(nowMs)) return { state, send: null };
  if (state.shown === 'typing' && nowMs - state.sentAt < TYPING_REPEAT_MS) {
    return { state, send: null };
  }
  return { state: { shown: 'typing', sentAt: nowMs }, send: 'typing' };
}

/**
 * The pause after the last keystroke.
 *
 * Idempotent: called twice, it sends once. A `viewing` frame when the room already thinks we are
 * viewing is a packet that changes nothing and a broadcast to everyone on the project.
 */
export function onComposerIdle(state: PresenceSignal, nowMs: number): Step {
  if (state.shown !== 'typing') return { state, send: null };
  return { state: { shown: 'viewing', sentAt: Number.isFinite(nowMs) ? nowMs : state.sentAt }, send: 'viewing' };
}

/**
 * The message went.
 *
 * ALWAYS sends `viewing`, even when we never announced typing — because the server sets `building`
 * on the socket that starts a run, and this is the frame that says the typing is over. It is the
 * cheapest possible correction and it happens once per message rather than once per keystroke.
 */
export function onComposerSubmit(state: PresenceSignal, nowMs: number): Step {
  return { state: { shown: 'viewing', sentAt: Number.isFinite(nowMs) ? nowMs : state.sentAt }, send: 'viewing' };
}

/** Leaving the page or the project: withdraw the claim rather than leaving it standing. */
export function onComposerLeave(state: PresenceSignal): Step {
  return state.shown === 'typing' ? { state: initialPresence(), send: 'viewing' } : { state, send: null };
}
