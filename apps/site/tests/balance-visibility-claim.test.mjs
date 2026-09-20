// /docs/credits-and-limits told customers "Your balance is always visible in the workspace header,
// and it updates live." Both halves were false, and this guard is derived from the app rather than
// from an opinion about it, so it will also fail if the docs are left stale after the app is fixed.
//
// Measured, not remembered:
//   apps/web/src/components/layout.tsx  — <UsageMeter …/> is rendered inside `gx-rail__foot`,
//     the LEFT RAIL's footer. There is no balance in a header.
//   apps/web/src/lib/use-project-socket.ts — the hook handles the worker's `quota` message and
//     returns `quota`.
//   apps/web/src/routes/workspace.tsx — does NOT destructure `quota` from useProjectSocket, so the
//     live message is received and dropped. The meter's own figure comes from the ['me'] query,
//     which app.tsx configures with refetchOnWindowFocus: false.
//
// The rule below is conditional on that last fact. When apps/web starts consuming the live quota,
// this test flips and demands the docs say so again — which is the only way a copy guard can be
// right on both sides of a fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const DOC = read('../src/pages/docs/credits-and-limits.astro')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ');

const layout = read('../../web/src/components/layout.tsx');
const workspace = read('../../web/src/routes/workspace.tsx');

/** Does the signed-in workspace actually consume the live `quota` the socket delivers? */
function workspaceConsumesLiveQuota() {
  const destructure = /useProjectSocket\(/.test(workspace)
    ? workspace.slice(0, workspace.indexOf('useProjectSocket(')).lastIndexOf('const {')
    : -1;
  if (destructure === -1) return false;
  const block = workspace.slice(destructure, workspace.indexOf('useProjectSocket('));
  return /(^|[\s,{])quota\s*[,}]/.test(block);
}

test('the app renders the balance in the left rail footer, not a header', () => {
  // Sanity: if this ever stops being true the doc sentence below has to be re-derived, not trusted.
  assert.match(layout, /gx-rail__foot/, 'layout.tsx no longer has a rail footer');
  const foot = layout.slice(layout.indexOf('gx-rail__foot'));
  assert.match(foot.slice(0, 2000), /<UsageMeter/, 'the usage meter left the rail footer');
});

test('the docs do not place the balance in a header the app does not have', () => {
  assert.doesNotMatch(
    DOC,
    /balance[^.]{0,80}workspace header/i,
    'the balance meter is in the left rail footer, not the workspace header',
  );
});

test('the docs claim a live balance only if the workspace actually consumes one', () => {
  const live = workspaceConsumesLiveQuota();
  const claimsLive = /\bbalance\b[^.]{0,120}\bupdates?\s+live\b/i.test(DOC);
  if (live) {
    assert.ok(claimsLive, 'the workspace now consumes the live quota — say so on this page');
  } else {
    assert.equal(
      claimsLive,
      false,
      'workspace.tsx drops the live `quota` message, so the balance does not update live',
    );
  }
});

test('the docs say what a reader must actually do to see the current figure', () => {
  if (workspaceConsumesLiveQuota()) return; // the instruction is unnecessary once it is live
  assert.match(DOC, /left rail/i, 'name where the balance actually is');
  assert.match(DOC, /reload/i, 'name what refreshes it');
});

// ---------------------------------------------------------------------------
// The guard can fail.
// ---------------------------------------------------------------------------
test('the guard rejects the two sentences that shipped', () => {
  const shipped = 'Your balance is always visible in the workspace header, and it updates live.';
  assert.match(shipped, /balance[^.]{0,80}workspace header/i);
  assert.match(shipped, /\bbalance\b[^.]{0,120}\bupdates?\s+live\b/i);
  // and the corrected sentence trips neither rule
  const fixed =
    'Your balance sits in the footer of the left rail, beside your account. It is read when the workspace loads and does not refresh itself while you build — reload the page for the current figure.';
  assert.doesNotMatch(fixed, /balance[^.]{0,80}workspace header/i);
  assert.doesNotMatch(fixed, /\bbalance\b[^.]{0,120}\bupdates?\s+live\b/i);
});

test('the live-quota probe reads the destructure and not the whole file', () => {
  // A file that merely mentions `quota` somewhere must not read as consuming it.
  assert.equal(/(^|[\s,{])quota\s*[,}]/.test('const modelPlan = account.data?.quota.plan;'), false);
  assert.equal(/(^|[\s,{])quota\s*[,}]/.test('  quota,\n  sendChat,'), true);
});
