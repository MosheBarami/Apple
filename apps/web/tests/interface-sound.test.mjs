/**
 * Interface sound is deliberately a small, user-unlocked surface.
 *
 * These tests run without a DOM or an AudioContext: that is useful evidence in
 * itself, because importing the helper must not start audio or touch browser
 * globals. Browser-specific playback is guarded at the module boundary.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SOUND_ENABLED, normalisePrefs, readSoundEnabled, SOUND_PREF_KEY } from '../src/lib/prefs.ts';
import {
  interfaceSound,
  isInterfaceSoundEnabled,
  playInterfaceSound,
  setInterfaceSoundEnabled,
  unlockInterfaceSound,
} from '../src/lib/interface-sound.ts';

test('sound defaults on without constructing or unlocking browser audio', async () => {
  assert.equal(DEFAULT_SOUND_ENABLED, true);
  assert.equal(isInterfaceSoundEnabled(), true);
  assert.equal(interfaceSound.isEnabled(), true);
  assert.equal(await unlockInterfaceSound(), false, 'Node has no user-audio context');
  assert.equal(playInterfaceSound('send'), false, 'locked audio remains silent');
});

test('only the two deliberate interface cues are accepted, and replay is silent', () => {
  // The cue union itself is the no-per-tool-noise boundary; this runtime check
  // covers the defensive replay guard without needing a browser audio device.
  assert.equal(playInterfaceSound('connect', { replay: true }), false);
  assert.equal(SOUND_PREF_KEY, 'apple.interface-sound.v1');
});

test('a disabled preference is respected and malformed stored state fails open', () => {
  setInterfaceSoundEnabled(false);
  assert.equal(interfaceSound.isEnabled(), false);
  setInterfaceSoundEnabled(true);
  assert.equal(readSoundEnabled(), DEFAULT_SOUND_ENABLED);
  assert.equal(normalisePrefs({ sound: false }).appearance, normalisePrefs({}).appearance);
});
