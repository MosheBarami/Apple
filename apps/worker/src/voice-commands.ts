// Turning a transcript into an ACTION, or honestly declining to.
//
// The problem this solves is narrow and the narrowness is the point. A voice channel produces a
// string; the product has exactly four things a string can be turned into without going through
// the model — stop, resume, save a checkpoint, restore one — and everything else is something the
// user wants to SAY. So this file is a classifier with three outcomes, not a command interpreter
// with a fallback:
//
//   command   — the utterance is one of the known commands, exactly.
//   dictation — it is not, so it goes to the agent as a message. This is the NORMAL outcome.
//   nothing   — there was no utterance at all.
//
// WHY THE TARGETS ARE `ClientMsg` TYPES AND NOT TOOL NAMES. The obvious design maps "play test" to
// the `run_and_check` tool, and it would be a promise nothing keeps: there is no path in this
// product that runs a tool from the client. Tools are called by the model, inside a step, and the
// only way a user causes one is by asking. So "play test" is dictation — it becomes a message, the
// agent reads it and runs the tool — and the four commands below are the four that correspond to
// real entries in the `ClientMsg` union in packages/shared. The test asserts that correspondence
// against the union's own source, because a command whose target the socket does not handle is a
// button wired to nothing.
//
// THE TWO WAYS A VOICE COMMAND GOES WRONG, both guarded here:
//   1. IT FIRES ON A SENTENCE THAT MENTIONED IT. "I want the music to stop at the end of the
//      level" contains "stop", and a matcher that searches for its phrases inside the utterance
//      interrupts the build. So matching is against the WHOLE normalised utterance; leftover words
//      mean it was not a command.
//   2. IT FIRES ON A NEGATION. "Don't stop" is the exact opposite of "stop" and differs by one
//      word that a substring matcher does not see at all.
//
// And a third that is not guarded, deliberately: near-miss spelling. "Shop" is one edit from
// "stop", "sit" from "it", "back" from "black". Edit-distance matching would turn a transcription
// error in an ordinary sentence into an interrupt, so there is none — the defence against
// mishearing is the phrase LIST being wide, plus `confirm` on the one command that destroys work.

/** Where a matched command is delivered. Every value is a `ClientMsg` type in packages/shared. */
export type VoiceTarget = 'stop' | 'resume' | 'checkpoint_create' | 'checkpoint_restore';

export interface VoiceCommand {
  id: VoiceTarget;
  /** The `ClientMsg.type` the client sends. Identical to `id` today; separate because it is a wire
   *  literal and the id is a local name, and conflating the two is how a rename breaks a socket. */
  clientMsgType: VoiceTarget;
  summary: string;
  /**
   * A field the message needs that a voice utterance cannot supply. The caller must collect it
   * before sending — "undo" names no checkpoint, and picking one for the user is how you restore
   * the wrong thing.
   */
  needsArgument: string | null;
  /**
   * Whether a mishearing would destroy work. `checkpoint_restore` discards everything built since
   * the checkpoint, so a 1-in-500 transcription error must not be enough to trigger it on its own.
   */
  confirm: boolean;
  /** Exact normalised phrasings. Wide on purpose: breadth here replaces fuzzy matching. */
  phrases: string[];
}

export const VOICE_COMMANDS: readonly VoiceCommand[] = [
  {
    id: 'stop',
    clientMsgType: 'stop',
    summary: 'Interrupt the agent mid-build.',
    needsArgument: null,
    // No confirmation: stopping is the safe direction, and a command you must confirm is a command
    // that does not work when you need it.
    confirm: false,
    phrases: ['stop', 'stop it', 'stop that', 'stop please', 'stop building', 'stop now', 'halt', 'abort', 'cancel', 'cancel that', 'cancel it', 'never mind', 'nevermind', 'wait stop'],
  },
  {
    id: 'resume',
    clientMsgType: 'resume',
    summary: 'Continue after a stop.',
    needsArgument: null,
    confirm: false,
    phrases: ['resume', 'continue', 'carry on', 'keep going', 'go on', 'go ahead', 'carry on please', 'continue please'],
  },
  {
    id: 'checkpoint_create',
    clientMsgType: 'checkpoint_create',
    summary: 'Save a restorable checkpoint of the place.',
    // The label is optional on the wire, so the client can default it — but it is worth asking for,
    // which is why it is named rather than null.
    needsArgument: 'label',
    confirm: false,
    phrases: ['checkpoint', 'save a checkpoint', 'make a checkpoint', 'take a checkpoint', 'create a checkpoint', 'save my progress', 'save progress', 'save this', 'save it'],
  },
  {
    id: 'checkpoint_restore',
    clientMsgType: 'checkpoint_restore',
    summary: 'Roll the place back to a checkpoint.',
    needsArgument: 'checkpointId',
    // TRUE, and this is the one that matters. Restoring discards everything built since the
    // checkpoint. A transcript is a guess about what someone said; acting on a guess by deleting
    // an afternoon of work is not a trade this product makes.
    confirm: true,
    phrases: ['undo', 'undo that', 'undo it', 'revert', 'revert that', 'roll it back', 'roll back', 'go back', 'restore', 'restore the checkpoint', 'restore the last checkpoint', 'take it back'],
  },
];

export const VOICE_COMMAND_IDS = VOICE_COMMANDS.map((c) => c.id);

// ---------------------------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------------------------

/**
 * Words that can be stripped from the front without changing the instruction.
 *
 * Only at the FRONT, and only these. "Please stop" is "stop"; "stop please" is handled by the
 * trailing list. A general filler-removal pass over the whole utterance would turn "don't just
 * stop, undo it" into something unrecognisable — the filler carries the structure.
 *
 * "no" IS IN THIS LIST AND "never" IS NOT. "No, stop" is how people actually interrupt, so a
 * leading "no" is an interjection rather than a negation and must not block the command someone is
 * urgently reaching for. The negation guard is unaffected: it works on the NEGATORS tokens below,
 * so "no, don't stop" still comes back negated — the "no" is stripped and the "dont" is not.
 */
const LEADING_FILLER = ['um', 'uh', 'er', 'erm', 'ok', 'okay', 'so', 'now', 'hey', 'hi', 'golem', 'apple', 'please', 'just', 'no', 'can you', 'could you', 'would you', 'i want you to', 'i need you to', 'you can'];

const TRAILING_FILLER = ['please', 'now', 'thanks', 'thank you', 'ok', 'okay'];

/**
 * Negators, and nothing else.
 *
 * "no" is deliberately absent — see LEADING_FILLER. "do not" is collapsed into "dont" during
 * normalisation so one token covers both spellings.
 *
 * "never" IS here, which collides with the stop phrase "never mind". That collision is resolved by
 * WHERE the negator is looked for rather than by dropping either entry: a negator only negates when
 * it sits OUTSIDE the phrase that matched. Inside "never mind", the "never" is part of the command.
 */
const NEGATORS = new Set(['dont', 'not', 'never', 'cant', 'cannot']);

/**
 * Lower-case, unaccented, punctuation-free, single-spaced.
 *
 * Apostrophes are REMOVED rather than replaced with a space: "don't" must become one token
 * ("dont") and not two ("don", "t"), because the negation check works on tokens and "don" is not
 * a negator.
 */
export function normaliseUtterance(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\bdo not\b/g, 'dont')
    .replace(/\bcan not\b/g, 'cannot');
}

/**
 * Strip leading and trailing filler, reporting whether anything was removed.
 *
 * An utterance that is filler ALL THE WAY DOWN reduces to the empty string, and the caller turns
 * that into `nothing` rather than into a message. That distinction is worth the extra branch: "um"
 * sent to the agent as a prompt costs a step and a model call to answer a cough, and the user gets
 * a reply to something they did not say.
 */
function stripFiller(text: string): { text: string; stripped: boolean } {
  let out = text;
  let stripped = false;
  let changed = true;
  while (changed && out !== '') {
    changed = false;
    for (const filler of [...LEADING_FILLER, ...TRAILING_FILLER]) {
      if (out === filler) {
        out = '';
        stripped = true;
        changed = true;
        break;
      }
    }
    if (out === '') break;
    for (const filler of LEADING_FILLER) {
      if (out.startsWith(filler + ' ')) {
        out = out.slice(filler.length + 1);
        stripped = true;
        changed = true;
      }
    }
    for (const filler of TRAILING_FILLER) {
      if (out.endsWith(' ' + filler)) {
        out = out.slice(0, -(filler.length + 1));
        stripped = true;
        changed = true;
      }
    }
  }
  return { text: out.trim(), stripped };
}

// ---------------------------------------------------------------------------------------------
// The classifier
// ---------------------------------------------------------------------------------------------

export type VoiceOutcome =
  | {
      disposition: 'command';
      command: VoiceCommand;
      clientMsgType: VoiceTarget;
      /** 1 when the utterance WAS the phrase; 0.9 when filler had to be removed first. */
      confidence: number;
      matchedPhrase: string;
      normalised: string;
      needsArgument: string | null;
      confirm: boolean;
    }
  | {
      disposition: 'dictation';
      /** The original text, to be sent to the agent as a message. Not the normalised form. */
      text: string;
      normalised: string;
      reason: 'no_command_matched' | 'negated' | 'ambiguous';
      note: string;
    }
  | { disposition: 'nothing'; reason: 'empty'; note: string };

/**
 * Classify one utterance.
 *
 * DICTATION IS THE DEFAULT AND IS NOT A FAILURE. A voice channel whose unmatched input vanishes is
 * worse than one with no commands at all: the user speaks a sentence, nothing happens, and there is
 * no way to tell a mis-parse from a dropped recording. Every non-empty utterance therefore leaves
 * here with somewhere to go, and `reason` says why it went there.
 *
 * MATCHING IS WHOLE-STRING. `includes()` is the natural implementation and it is the bug: "I want
 * the music to stop at the end of the level" contains "stop", and interrupting a build on it is
 * both wrong and unattributable — from the user's side the agent simply gave up mid-sentence.
 *
 * AMBIGUITY IS NOT RESOLVED, IT IS REPORTED. If two commands claim the same phrase, the honest
 * answer is that this utterance does not identify one action; picking the first in array order
 * would make the behaviour depend on the order of a literal in this file.
 */
export function classifyUtterance(raw: unknown): VoiceOutcome {
  const text = typeof raw === 'string' ? raw : '';
  const normalised = normaliseUtterance(text);
  if (normalised === '') {
    return { disposition: 'nothing', reason: 'empty', note: 'the transcript was empty — nothing was said, or nothing was heard' };
  }

  const { text: core, stripped } = stripFiller(normalised);
  if (core === '') {
    return { disposition: 'nothing', reason: 'empty', note: 'the transcript was filler only ("um", "okay") with no instruction in it' };
  }

  const matches = VOICE_COMMANDS.filter((c) => c.phrases.includes(core));

  if (matches.length === 0) {
    // Before giving up: is this the NEGATED form of a command? "dont stop" matches no phrase, so
    // without this it would fall out as an ordinary message — safe, but described wrongly, and the
    // caller cannot tell "they said something else" from "they said the opposite". Removing the
    // negator tokens and re-matching is what distinguishes the two.
    const withoutNegators = core.split(' ').filter((t) => !NEGATORS.has(t)).join(' ').trim();
    if (withoutNegators !== core && VOICE_COMMANDS.some((c) => c.phrases.includes(withoutNegators))) {
      const negator = core.split(' ').find((t) => NEGATORS.has(t))!;
      return {
        disposition: 'dictation',
        text,
        normalised,
        reason: 'negated',
        note: `"${negator}" reverses the instruction — "dont stop" and "stop" differ by one word a substring matcher does not see at all`,
      };
    }
    return {
      disposition: 'dictation',
      text,
      normalised,
      reason: 'no_command_matched',
      note: 'not one of the four voice commands, so it is a message for the agent. This is the ordinary outcome.',
    };
  }

  if (matches.length > 1) {
    return {
      disposition: 'dictation',
      text,
      normalised,
      reason: 'ambiguous',
      note: `"${core}" is claimed by ${matches.map((m) => m.id).join(' and ')}, so it does not identify one action. Resolving it by array order would make the behaviour depend on the order of a literal in the source.`,
    };
  }

  // A negator only negates from OUTSIDE the phrase. "never mind" is a stop phrase whose first
  // token is in the negator list, and rejecting it because of that would delete a command over a
  // word that is part of the command. So the matched phrase is removed from the utterance first
  // and the negator is looked for in what is left.
  const remainder = normalised.replace(core, ' ').split(' ').filter(Boolean);
  const negator = remainder.find((t) => NEGATORS.has(t));
  if (negator) {
    return {
      disposition: 'dictation',
      text,
      normalised,
      reason: 'negated',
      note: `"${negator}" reverses the instruction — "dont stop" and "stop" differ by one word a substring matcher does not see at all`,
    };
  }

  const command = matches[0]!;
  return {
    disposition: 'command',
    command,
    clientMsgType: command.clientMsgType,
    confidence: stripped ? 0.9 : 1,
    matchedPhrase: core,
    normalised,
    needsArgument: command.needsArgument,
    confirm: command.confirm,
  };
}

/** Everything a help panel needs, without exposing the phrase table's mutability. */
export function voiceCommandCatalogue(): { id: VoiceTarget; summary: string; say: string; confirm: boolean; needsArgument: string | null }[] {
  return VOICE_COMMANDS.map((c) => ({
    id: c.id,
    summary: c.summary,
    say: c.phrases[0]!,
    confirm: c.confirm,
    needsArgument: c.needsArgument,
  }));
}
