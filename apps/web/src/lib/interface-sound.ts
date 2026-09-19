/**
 * Small, opt-in interface cues for the workspace.
 *
 * This is intentionally not a tool-event soundboard. The public cue union is
 * limited to user-facing actions, so a new tool cannot quietly turn into a
 * per-tool noise source. The audio context is created and resumed only by
 * `unlock`, which the card calls from its sound button's click handler. A
 * render, a socket event, a history replay, or a visibility change never
 * unlocks audio by itself.
 *
 * The cues are generated with Web Audio instead of shipping a second asset
 * bundle. That keeps this helper tiny and lets the browser's one master gain
 * stop all voices cleanly when the page is hidden or muted.
 */

import { readSoundEnabled } from './prefs.ts';

export type InterfaceSoundCue = 'send' | 'connect';

export interface InterfaceSoundPlayOptions {
  /** History/replay surfaces must never produce a cue, even if called defensively. */
  replay?: boolean;
}

interface AudioContextConstructor {
  new (): AudioContext;
}

interface Voice {
  oscillator: OscillatorNode;
  gain: GainNode;
}

interface CueSpec {
  frequency: number;
  duration: number;
  type: OscillatorType;
  endFrequency?: number;
}

const CUES: Readonly<Record<InterfaceSoundCue, CueSpec>> = {
  // A short, soft confirmation for a prompt leaving the composer.
  send: { frequency: 440, endFrequency: 554.37, duration: 0.11, type: 'sine' },
  // A slightly lower two-note acknowledgement for Studio becoming available.
  connect: { frequency: 329.63, endFrequency: 493.88, duration: 0.16, type: 'triangle' },
};

const MASTER_GAIN = 0.5; // approximately -6 dB
const VOICE_GAIN = 0.08;

let enabled = readSoundEnabled();
let unlocked = false;
let context: AudioContext | null = null;
let master: GainNode | null = null;
let visibilityBound = false;
const voices = new Set<Voice>();

function audioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null;
  const candidate = window.AudioContext ?? (window as Window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
  return typeof candidate === 'function' ? candidate : null;
}

function pageIsHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden === true;
}

function stopVoice(voice: Voice, at: number): void {
  try {
    voice.gain.gain.cancelScheduledValues(at);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, at);
    voice.gain.gain.linearRampToValueAtTime(0, at + 0.02);
    voice.oscillator.stop(at + 0.025);
  } catch {
    /* The context may already be closed; stopping is best effort. */
  }
}

/** Stop active voices without suspending the context (resuming still requires a gesture). */
export function stopInterfaceSounds(): void {
  const at = context?.currentTime ?? 0;
  for (const voice of voices) stopVoice(voice, at);
  voices.clear();
}

function bindVisibilityGuard(): void {
  if (visibilityBound || typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', () => {
    // A hidden tab must not finish a sound in the background, and showing it
    // again must not resume one without a fresh user gesture.
    if (document.hidden) {
      stopInterfaceSounds();
      unlocked = false;
    }
  });
  visibilityBound = true;
}

/**
 * Unlock audio from a real user gesture.
 *
 * Call this from a click/tap handler only. In particular, do not call it from
 * an effect when a run starts: that would make history and reconnects compete
 * with browser autoplay policy and would turn a passive page load into sound.
 */
export async function unlockInterfaceSound(): Promise<boolean> {
  if (!enabled || pageIsHidden()) return false;
  const Constructor = audioContextConstructor();
  if (!Constructor) return false;

  try {
    if (!context) {
      context = new Constructor();
      master = context.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(context.destination);
      bindVisibilityGuard();
    }
    // `resume()` is deliberately reachable only through this gesture API.
    await context.resume();
    unlocked = context.state === 'running' && !pageIsHidden();
    return unlocked;
  } catch {
    unlocked = false;
    return false;
  }
}

/** Change the preference without constructing or resuming an audio context. */
export function setInterfaceSoundEnabled(value: boolean): void {
  enabled = value === true;
  if (!enabled) stopInterfaceSounds();
}

export function isInterfaceSoundEnabled(): boolean {
  return enabled;
}

/**
 * Play one of the two deliberate interface cues.
 *
 * No resume is attempted here. If a caller did not first unlock from a user
 * gesture, this function returns `false` and remains silent. The visibility
 * and replay guards are repeated at this boundary so a stale event cannot
 * make a hidden or historical turn audible.
 */
export function playInterfaceSound(cue: InterfaceSoundCue, options: InterfaceSoundPlayOptions = {}): boolean {
  if (options.replay || !enabled || !unlocked || pageIsHidden() || !context || context.state !== 'running' || !master) {
    return false;
  }

  const spec = CUES[cue];
  if (!spec) return false;

  try {
    const at = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = spec.type;
    oscillator.frequency.setValueAtTime(spec.frequency, at);
    if (spec.endFrequency !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, spec.endFrequency), at + spec.duration);
    }
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(VOICE_GAIN, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + spec.duration);
    oscillator.connect(gain);
    gain.connect(master);

    const voice = { oscillator, gain };
    voices.add(voice);
    oscillator.addEventListener('ended', () => voices.delete(voice), { once: true });
    oscillator.start(at);
    oscillator.stop(at + spec.duration + 0.02);
    return true;
  } catch {
    return false;
  }
}

/** Concise facade for callers such as the composer and Studio connection UI. */
export const interfaceSound = Object.freeze({
  unlock: unlockInterfaceSound,
  play: playInterfaceSound,
  setEnabled: setInterfaceSoundEnabled,
  isEnabled: isInterfaceSoundEnabled,
  stop: stopInterfaceSounds,
});
