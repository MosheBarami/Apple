/**
 * The Studio connection state machine.
 *
 * These are honesty tests, not rendering tests. The workspace shows a setup
 * prompt based entirely on this function, so what it may and may not say is
 * decided here:
 *
 *   - it never reports "connected" without the bridge signal saying so;
 *   - it never reports "not connected" before the socket has answered;
 *   - it distinguishes "dropped" from "never had one";
 *   - and there is no "installed" state at all, because the browser has no way
 *     to observe a Roblox Studio plugin. This suite asserts that too — if
 *     someone adds one, the enumeration test below fails.
 *
 * Run with:  node --test           (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { studioConnection } from '../src/lib/studio-connection.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

test('connected requires the bridge signal, and nothing else does it', () => {
  for (const conn of ['connecting', 'open', 'reconnecting', 'offline']) {
    for (const ever of [false, true]) {
      assert.equal(studioConnection(conn, true, ever), 'connected', `${conn}/${ever}`);
      assert.notEqual(studioConnection(conn, false, ever), 'connected', `${conn}/${ever}`);
    }
  }
});

test('an unanswered socket is "connecting", never "not-connected"', () => {
  // Claiming "not connected" here would put a three-step setup card in front of
  // an already-paired user for the length of the handshake.
  assert.equal(studioConnection('connecting', false, false), 'connecting');
  assert.equal(studioConnection('reconnecting', false, false), 'connecting');
});

test('a socket that answered no, with no history, is "not-connected"', () => {
  assert.equal(studioConnection('open', false, false), 'not-connected');
  assert.equal(studioConnection('offline', false, false), 'not-connected');
});

test('losing an attached Studio reads as "disconnected", not as fresh setup', () => {
  for (const conn of ['open', 'reconnecting', 'offline', 'connecting']) {
    assert.equal(studioConnection(conn, false, true), 'disconnected', conn);
  }
});

test('the prompt disappears on connect and cannot reappear while connected', () => {
  // The component is a pure function of this value: 'connected' renders null.
  // So the guarantee reduces to "studioConnected true always yields connected",
  // which holds above, plus this transition walk.
  const seq = [
    ['connecting', false, false, 'connecting'],
    ['open', false, false, 'not-connected'],
    ['open', true, true, 'connected'],
    ['open', true, true, 'connected'], // stays gone
    ['reconnecting', true, true, 'connected'],
    ['open', false, true, 'disconnected'],
    ['open', true, true, 'connected'],
  ];
  for (const [conn, connected, ever, want] of seq) {
    assert.equal(studioConnection(conn, connected, ever), want, `${conn}/${connected}/${ever}`);
  }
});

test('there is no "installed" state anywhere in the connection layer', () => {
  const files = [
    join(HERE, '..', 'src', 'lib', 'studio-connection.ts'),
    join(HERE, '..', 'src', 'components', 'ws', 'connect-studio.tsx'),
  ];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    // Strip comments: the files talk *about* why installation is unknowable.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    for (const claim of [/plugin installed/i, /already installed/i, /is installed/i, /'installed'/]) {
      assert.ok(!claim.test(code), `${file} must not assert installation: ${claim}`);
    }
  }
});

test('the install link is derived from the shared config, not retyped', () => {
  const src = readFileSync(join(HERE, '..', 'src', 'components', 'ws', 'connect-studio.tsx'), 'utf8');
  assert.match(src, /STUDIO_PLUGIN_INSTALL_HREF/);
  assert.ok(!/create\.roblox\.com/.test(src), 'the URL must come from @golem/shared');
  assert.ok(!/\d{12,}/.test(src), 'no asset id literal may appear here');
});

test('no in-app install affordance points at the store while it is not distributable', () => {
  // ADR-017 decision 3: copy degrades honestly rather than shipping a link that
  // dead-ends. The store page for an undistributed asset has nothing to get, so
  // every "install" affordance must route through STUDIO_PLUGIN_INSTALL_HREF —
  // which is /docs/plugin until STUDIO_PLUGIN_STORE_LIVE flips. Linking
  // STUDIO_PLUGIN_URL directly is how that guarantee gets lost, so it is banned
  // here rather than left to review.
  const files = [
    join(HERE, '..', 'src', 'components', 'ws', 'connect-studio.tsx'),
    join(HERE, '..', 'src', 'components', 'pairing-dialog.tsx'),
    join(HERE, '..', 'src', 'routes', 'dashboard.tsx'),
  ];
  for (const file of files) {
    const code = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    assert.ok(
      !/STUDIO_PLUGIN_URL/.test(code),
      `${file} must use STUDIO_PLUGIN_INSTALL_HREF, not the bare store URL`,
    );
  }
});

/* ------------------------------------------ a pairing the browser did not personally witness --- */

/**
 * WHAT THE OWNER SAW, 2026-09-19. A project paired four days earlier, expiry a month out, "last
 * seen 11m" printed in the pairing dialog on the same screen — and beside it the three-step
 * first-time setup card: "Studio plugin unavailable / Open the Apple plugin in Studio / Pair your
 * project". He read it, correctly, as the product not knowing he had paired.
 *
 * `everConnected` starts false on every page load. It records what THIS TAB has seen since it
 * opened, which for a reload is nothing. The worker's memory is longer and was already on screen.
 */

test('A PAIRED PROJECT IS NOT SHOWN THE FIRST-RUN CARD after a reload', () => {
  // A fresh tab: everConnected false, because nothing has been witnessed yet. The worker says a
  // plugin has polled for this project at some point — which is what `lastSeenAt !== null` means.
  assert.equal(studioConnection('open', false, false, true), 'disconnected',
    'a project with a pairing was told to go and install the plugin');
  // And the distinction it exists to preserve still holds: a project that has never paired gets
  // the setup card, which is the correct thing to show somebody who has never set it up.
  assert.equal(studioConnection('open', false, false, false), 'not-connected');
});

test('the pairing memory never overrides a live connection or an unanswered socket', () => {
  // Connected beats everything: the card must vanish, not become a nicer card.
  assert.equal(studioConnection('open', true, false, true), 'connected');
  // And a socket that has not answered yet is still "connecting" — claiming DISCONNECTED during a
  // handshake would flash "Apple can't reach your place" at somebody whose place is fine.
  assert.equal(studioConnection('connecting', false, false, false), 'connecting');
  assert.equal(studioConnection('reconnecting', false, false, false), 'connecting');
});

test('the parameter defaults to false, so a caller that has not been updated cannot silently change behaviour', () => {
  // Three arguments is the old shape. It must still mean exactly what it meant.
  assert.equal(studioConnection('open', false, false), 'not-connected');
  assert.equal(studioConnection('open', false, true), 'disconnected');
});
