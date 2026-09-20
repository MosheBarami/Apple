/**
 * AN `aria-modal="true"` DIALOG THAT A POINTER COULD REACH STRAIGHT THROUGH.
 *
 * Every workspace drawer — Checkpoints, Files, Credits and clearance, Who can build here, and six
 * more — is rendered from routes/workspace.tsx, which puts it inside `.gx-ws`. That element is
 * `position:relative; z-index:1` (design/system.css), which is a stacking context, so the scrim's
 * z-index of 70 and the panel's 80 were never compared with anything outside the workspace. They
 * competed as `.gx-ws`'s 1 against the navigation rail's 55, and lost.
 *
 * MEASURED in Chromium with "Credits and clearance" open, via `document.elementFromPoint`:
 *
 *   BEFORE 1440px  the point at the centre of a nav rail row → `span.studio-dock__label`.
 *                  The rail is undimmed and fully clickable while a modal dialog is open.
 *   BEFORE  375px  the rail has collapsed to a 44px button at x=12..56 and the drawer is
 *                  full-bleed, so the button lands ON the drawer's own title: the point 4px into
 *                  "Credits and clearance" → `button.studio-navigation`, and the heading reads
 *                  "edits and clearance" with its first 27px behind the button.
 *
 *   AFTER  1440px  the same point → `button.gx-scrim`.
 *   AFTER   375px  both that point and the nav button's own centre → `span.gx-drawer__title`.
 *
 * The fix is one line of placement: the drawer is portalled to `document.body`, where its z-index
 * means what it says. Nothing else about it moves — same element, same ref, same focus trap,
 * same Escape handler, same focus return. Modal never had this bug because the shell renders it
 * outside `.gx-ws`, which is exactly why nobody found it here.
 *
 * THE SECOND HALF IS THE TOAST. At 375px a drawer, a modal and the asset-source dialog are all
 * full-bleed, so the composer is behind them — and components/toast.css lifts the stack clear of
 * the composer. Measured: with "Credits and clearance" open the toast sat at y=489..536, across
 * the panel's body text; in the shortcuts dialog it covered the "Search this conversation" row
 * outright. A stack lifted clear of a composer nobody can see is a stack in the middle of whatever
 * replaced it.
 *
 * Source-read, which is this package's standing bound — apps/web mounts nothing under
 * `node --test`. The geometry above is the evidence; what is pinned below is the placement that
 * produces it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(WEB, 'src', ...p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const PRIM = strip(read('components', 'ws', 'primitives.tsx'));
const WS = strip(read('routes', 'workspace.tsx'));
const SYS = strip(read('design', 'system.css'));
const TOAST = strip(read('components', 'toast.css'));

test('THE REASON THIS IS NEEDED IS STILL TRUE', () => {
  // If either of these ever stops holding, the portal below is solving nothing and this file
  // should be re-read rather than kept green. `.gx-ws` making a stacking context is the trap, and
  // workspace.tsx rendering the drawers is what falls into it.
  assert.match(SYS, /\.gx-ws\s*\{[^{}]*z-index:\s*1/, '.gx-ws is the stacking context the drawer was trapped in');
  assert.match(SYS, /\.studio-dock\s*\{[^{}]*z-index:\s*55/, 'the navigation rail is what it lost to');
  assert.match(WS, /<Drawer\s/, 'the drawers are rendered from inside the workspace');
});

test('SO THE DRAWER IS PORTALLED OUT OF IT, scrim and all', () => {
  assert.match(PRIM, /import \{ createPortal \} from 'react-dom'/);
  // The portal must wrap the scrim AND the panel. A portalled panel over a trapped scrim would
  // put the dialog above the rail and leave the rail clickable underneath — the worse half of the
  // bug, kept.
  const call = /return createPortal\(\s*<>([\s\S]*?)<\/>,\s*document\.body,?\s*\)/.exec(PRIM);
  assert.ok(call, 'the Drawer must render through createPortal into document.body');
  assert.match(call[1], /className="gx-scrim"/, 'the scrim goes with it or the page stays reachable');
  assert.match(call[1], /className="gx-drawer"/);
});

test('and it is still the same dialog — the portal moves where it paints, nothing else', () => {
  assert.match(PRIM, /role="dialog"/);
  assert.match(PRIM, /aria-modal="true"/);
  assert.match(PRIM, /ref=\{panel\}/, 'the focus trap holds this ref; a new element would break it');
  assert.match(PRIM, /if \(opener\.current instanceof HTMLElement\) opener\.current\.focus\(\)/,
    'focus still returns to whatever opened it');
});

test('AND THE TOAST STOPS LIFTING FOR A COMPOSER AN OVERLAY HAS COVERED', () => {
  // Two places, because the stack rests at two different insets: 24px on a wide screen, 16px below
  // 680px. Each overlay rule has to return it to ITS OWN resting inset, not to a third number.
  const phone = /@media \(max-width:680px\) \{([\s\S]*?)\n\}/.exec(TOAST);
  assert.ok(phone, 'the phone block is where the narrow resting inset lives');
  const wide = TOAST.slice(0, TOAST.indexOf('@media (max-width:680px)'));

  for (const [where, block] of [['wide', wide], ['phone', phone[1]]]) {
    // All three: a drawer, a modal and the asset-source dialog each cover the composer.
    for (const overlay of ['.gx-drawer', '.modal-overlay', '.asrc__scrim']) {
      assert.match(block, new RegExp(`body:has\\(\\${overlay}\\) \\.toast-stack`),
        `${where}: ${overlay} must take the lift back`);
    }
    // ORDER IS THE MECHANISM, not a style preference. These selectors weigh exactly the same as
    // the composer lifts, so the one written last is the one that applies. Written first it would
    // do nothing at all — MEASURED: with the two rules swapped, the toast went back to y=489 on a
    // 375px screen, across the open drawer's body text, and to y=749 with them in this order.
    const lift = block.search(/body:has\(\.gx-composer\) \.toast-stack/);
    const overlay = block.search(/body:has\(\.gx-drawer\) \.toast-stack/);
    assert.ok(lift !== -1 && overlay !== -1, `${where}: both groups must be present`);
    assert.ok(overlay > lift, `${where}: the overlay rule must come AFTER the composer lift or it is dead code`);
    // And what it returns to is this block's own resting inset.
    const rest = /body \.toast-stack \{[^{}]*inset-block-end:(\d+px)/.exec(block);
    const back = /body:has\(\.asrc__scrim\) \.toast-stack \{ inset-block-end:(\d+px)/.exec(block);
    assert.ok(rest && back, `${where}: both the resting inset and the restored inset must be readable`);
    assert.equal(back[1], rest[1], `${where}: an overlay puts the stack back where it sits with nothing to clear`);
  }
  // The two insets really are different, so the loop above is checking two things and not one
  // thing twice.
  assert.notEqual(
    /body \.toast-stack \{[^{}]*inset-block-end:(\d+px)/.exec(wide)[1],
    /body \.toast-stack \{[^{}]*inset-block-end:(\d+px)/.exec(phone[1])[1],
  );
});
