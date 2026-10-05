/**
 * THE PLUGIN'S OWN WORDS AND DEFAULTS, for the pages that make a promise about them.
 *
 * The site says three things about the Studio plugin that are the plugin's to keep: it takes a six-character code, a code lasts ten
 * minutes, and EDITS STAY OFF UNTIL YOU ALLOW THEM FOR THAT CONNECTION. The third is the consent promise, the safety claim a reader relies
 * on before they let a tool change their place. The deleted ConsentProof band used to be held to the plugin by a test of its own; when the band
 * went the claim stayed on the pages as prose and lost its check (a mutation that replaced the sentence with "Edits are on from the moment
 * you pair, with nothing to allow." left every test green). This module restores it, once, for every page that says it.
 *
 * What it reads is apps/studpilot-plugin/src/init.server.luau (the shipped plugin) and apps/worker/src/do/pairing.ts (the code's lifetime):
 *   - edits start OFF: the flag is declared false, and a new connection, a disconnect and a failed pairing each set it false again;
 *   - turning them on takes two steps, the button "Enable edits…" and then the confirmation "Allow edits for this connection";
 *   - a write is authorised only while the flag is set (`pairingStillCurrent() and allowEdits`);
 *   - the panel says which state it is in ("Access: inspect only", "Access: edits allowed for this connection").
 *
 * Not a test file.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE } from './dist.mjs';

const APPS = join(SITE, '..');
export const plugin = readFileSync(join(APPS, 'studpilot-plugin', 'src', 'init.server.luau'), 'utf8');
export const pairing = readFileSync(join(APPS, 'worker', 'src', 'do', 'pairing.ts'), 'utf8');

/** The sentence the pages carry, in the words they carry it. */
export const CONSENT_SENTENCE = /Edits stay off until you allow them for that connection\./i;

/** Throws unless the plugin keeps the consent promise. */
export function assertConsentPromiseHolds() {
  assert.match(plugin, /^local allowEdits = false$/m, 'the plugin no longer starts with edits off');
  const resets = [...plugin.matchAll(/^\s*allowEdits = false$/gm)].length;
  assert.ok(resets >= 3, `only ${resets} place(s) in the plugin turn edits off again (a disconnect, a new connection, a failed pairing): a connection may now keep an earlier connection's consent`);
  assert.ok(plugin.includes('"Enable edits…"') && plugin.includes('"Allow edits for this connection"'), 'the plugin no longer asks twice (Enable edits… then Allow edits for this connection) before edits are on');
  assert.match(plugin, /pairingStillCurrent\(\) and allowEdits/, 'a write is no longer authorised only while edits are allowed');
  assert.ok(plugin.includes('"Access: inspect only"') && plugin.includes('"Access: edits allowed for this connection"'), 'the panel no longer says which of the two states a connection is in');
}

/** Throws unless a pairing code is six characters (as the plugin asks for it) and lasts ten minutes (as the worker keeps it). */
export function assertCodeFactsHold() {
  assert.match(plugin, /six-character code/i, 'the plugin no longer asks for a six-character code');
  assert.match(pairing, /const TTL_MS = 10 \* 60 \* 1000;/, 'a pairing code no longer lasts 10 minutes');
}
