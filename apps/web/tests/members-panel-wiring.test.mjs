/**
 * THE MEMBER PANEL IS REACHABLE, AND IT IS DRESSED.
 *
 * `components/ws/members-panel.tsx` was written against a complete, tested worker surface — the
 * roster, invite, role change, suspend, reactivate and revoke routes all exist and all have tests
 * in apps/worker/tests — and then nothing imported it. A repo-wide grep for `MembersPanel` returned
 * exactly the line that exports it. So in the shipped product the only way to add a collaborator to
 * a project was curl, which the panel's own header comment says out loud.
 *
 * That is this codebase's named defect — a route nothing calls, a component nothing renders — and
 * it hides from every test that reads the panel in isolation, because the panel was never wrong.
 * What was wrong was that no path through the app arrives at it.
 *
 * SO THESE ASK THREE THINGS, and each of them failed before this change:
 *
 *   1. The route mounts it, on a drawer name the route's own validation accepts. A name missing
 *      from DRAWERS is restored as 'none' by readViewChoice, so the drawer would open on the first
 *      click and never survive a reload — mounted, and still unreachable the second time.
 *   2. It is handed a REAL access answer. The panel turns every control off unless `access` says
 *      'ready', so passing a hand-made `{status:'ready'}` would light up an admin's interface for a
 *      viewer. It must come from fetchProjectAccess through normaliseAccess, which is the pair
 *      apps/web/tests/capabilities.test.mjs holds against the worker's allowlists.
 *   3. Every class it draws with exists in a stylesheet. The panel's mb__* block was in none of
 *      them: mounting it without that is an unstyled stack of text that ships as "done".
 *
 * Structural, because apps/web has no DOM renderer — the same bargain usage-page-wiring.test.mjs
 * makes, and for the same reason.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(WEB, ...p), 'utf8');

/** Source with comments stripped: a class named in prose is not a class in use. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const PANEL = read('src', 'components', 'ws', 'members-panel.tsx');
const PANEL_CODE = code(PANEL);
const WS = code(read('src', 'routes', 'workspace.tsx'));
const API = read('src', 'lib', 'api.ts');
const CSS = [read('src', 'styles.css'), read('src', 'styles', 'global.css'), read('src', 'styles', 'workspace.css')].join('\n');

// ------------------------------------------------------------------ it is mounted ---

test('THE WORKSPACE RENDERS THE PANEL — it had zero callers anywhere in the app', () => {
  assert.match(WS, /import \{ MembersPanel \} from '\.\.\/components\/ws\/members-panel'/, 'the route must import it');
  assert.match(WS, /<MembersPanel\b/, 'and render it');
});

test('the drawer name it opens on is one the route will accept back from storage', () => {
  // readViewChoice checks the stored name against DRAWERS and falls back to 'none'. A drawer
  // rendered on a name that is not in that list opens once and is forgotten on reload — which
  // looks, to the person using it, exactly like the feature being broken at random.
  assert.match(WS, /const DRAWERS = \[[^\]]*'members'/, "'members' must be in DRAWERS");
  assert.match(WS, /type Drawer =[^;]*'members'/, 'and in the Drawer union');
  assert.match(WS, /type DrawerName =[^;]*'members'/, 'and in DrawerName');
  assert.match(WS, /drawer === 'members'/, 'the drawer must actually be keyed on it');
});

test('there is a control that opens it, named, and a command for people who never see the topbar', () => {
  // A drawer with no opener is the same dead branch one step further along.
  assert.match(WS, /setDrawer\('members'\)/, 'nothing opens the members drawer');
  // The button, not the command-palette entry: a <button …> element whose onClick opens it. Its
  // icon is the whole of its content, so without an aria-label it announces as "button".
  const buttons = [...WS.matchAll(/<button[\s\S]{0,400}?setDrawer\('members'\)[\s\S]{0,400}?<\/button>/g)];
  assert.equal(buttons.length >= 1, true, 'no <button> in the topbar opens the members drawer');
  assert.match(buttons[0][0], /aria-label="[^"]+"/, 'the opener must carry an accessible name');
  assert.match(WS, /id: 'ws-members'/, 'and it must be in the command palette like every other drawer');
});

test('the panel is mounted only while the drawer is open, like the others', () => {
  // Otherwise every workspace load fetches a roster for the majority of users who never open it.
  assert.match(WS, /\{drawer === 'members' && <MembersPanel/, 'mounted unconditionally');
});

// ----------------------------------------------------- it is handed a real answer ---

test('ACCESS COMES FROM THE SERVER, not from a literal the route made up', () => {
  // `allows()` returns false for anything but a 'ready' state, so the panel is safe against a
  // missing answer — but not against a fabricated one. A hand-written {status:'ready', role:'admin'}
  // would enable every destructive control for a viewer and let them discover the truth by
  // pressing Remove.
  assert.match(WS, /fetchProjectAccess\(/, 'the route must ask /api/shared/:id');
  assert.match(WS, /normaliseAccess\(/, 'and read the answer through the shared normaliser');
  assert.equal(/status:\s*'ready'/.test(WS), false, 'the route must not synthesise an access state');
  assert.match(API, /fetchProjectAccess/, 'the client function must exist');
});

test('while the answer is not in hand the panel is told so, rather than told nothing', () => {
  // ACCESS_LOADING is the state whyNot() explains as "checking", as distinct from "your role
  // cannot". Defaulting to an empty ready state would blame the user's role for a request that
  // has not come back.
  assert.match(WS, /ACCESS_LOADING/, 'the loading state must be the fallback');
});

// ------------------------------------------------------------------ it has styles ---

/** Every static class token the panel draws with. */
function classesUsed(src) {
  const out = new Set();
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    // Template holes are dynamic; their static neighbours still name real classes. Both
    // alternatives are read — taking only the quoted one would silently skip every conditional
    // class, which is exactly the set most likely to have no rule behind it.
    for (const token of (m[1] ?? m[2] ?? '').replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) {
      if (token) out.add(token);
    }
  }
  return [...out];
}

test('EVERY CLASS THE PANEL DRAWS WITH HAS A RULE — the whole mb__ block was missing', () => {
  const missing = classesUsed(PANEL_CODE).filter((c) => !new RegExp(`\\.${c.replace(/[-]/g, '\\-')}\\b`).test(CSS));
  assert.deepEqual(missing, [], 'these classes are used by members-panel.tsx and defined in no stylesheet');
});

test('the screen-reader-only label uses the class this app actually ships', () => {
  // The panel asked for `sr-only`. This app's utility is `visually-hidden`, so that span rendered
  // as visible body text reading "Role for <handle>" beside every row — a label meant for a
  // screen reader printed on screen, which is the failure in both directions at once.
  assert.equal(/"sr-only"/.test(PANEL_CODE), false, 'sr-only is not a class this app defines');
  assert.match(PANEL_CODE, /visually-hidden/, 'the hidden label must use the shipped utility');
});

// ------------------------------------------------------- the bulk list is reachable ---

test('THE BULK ROUTE HAS A CLIENT AND THE CLIENT HAS A CONTROL', () => {
  // `grep bulk apps/web/src/lib/api.ts` used to return nothing. The worker route was complete and
  // heavily tested and no code path in the product could reach it — not even a dead component, as
  // the single invite at least had.
  assert.match(API, /export const bulkInviteMembers/, 'no client function for /members/bulk');
  assert.match(PANEL_CODE, /bulkInviteMembers\(/, 'nothing calls it');
  assert.match(PANEL_CODE, /<BulkInviteForm\b/, 'the form exists but the panel does not render it');
});

test('the per-row answer is RENDERED, not collapsed into a count', () => {
  // `rejected[]` names each refused row with its reason. A UI that shows only "3 of 5 added" has
  // discarded the half the person needs in order to fix their list.
  assert.match(PANEL_CODE, /explainRejections\(/, 'the rejected rows are not read');
  assert.match(PANEL_CODE, /problems\.map\(/, 'the rejected rows are read and never drawn');
});

test('A 400 THAT CARRIES THE ANSWER IS READ AS AN ANSWER', () => {
  // When every row is refused the route replies 400 with the same `rejected` list a 201 would
  // carry. That body reaches the client only because `request` attaches it to ApiError — without
  // that line the catch branch has nothing but "Request failed (400)" and the whole per-row
  // apparatus above is unreachable in exactly the case it was built for.
  assert.match(API, /throw new ApiError\(msg, res\.status, body\)/, 'request drops the error body');
  assert.match(PANEL_CODE, /e instanceof ApiError \? \(e\.body/, 'the form does not read it back');
});

test('the cap is said BEFORE the press, and the batch is refused whole', () => {
  // Fifty-one lines is not fifty invitations and one refusal: `planBulkInvite` refuses the batch.
  // A person who is not told that beforehand loses all fifty and is not told why afterwards
  // either, because the 400 has no per-row list on it.
  assert.match(PANEL_CODE, /BULK_INVITE_MAX/, 'the cap is not mentioned in the panel');
  assert.match(PANEL_CODE, /overCap/, 'nothing checks the list length before sending');
});

test('AN UNRECORDED CHANGE IS SHOWN — every membership route answers `audited`', () => {
  // `ok: true, audited: false` means the change happened and the history does not know. Reading
  // the first word and dropping the second is the claim surviving while the fact does not.
  assert.match(PANEL_CODE, /unauditedNote\(/, 'the audited flag is never read');
  assert.match(PANEL_CODE, /\{auditNote &&/, 'it is read and never drawn');
});

// --------------------------------------------- the destructive controls say what they do ---

test('THE IMPACT ROUTE IS REACHED BEFORE THE REMOVAL, not after it and not never', () => {
  // GET /members/:userId/impact counts what the departing member holds, in SQL, and states what
  // the removal does. `grep impact apps/web/src/lib/api.ts` returned nothing: the Remove button
  // called removeMember directly, so the route was dead even once the panel was mounted.
  assert.match(API, /export const fetchMemberImpact/, 'no client function for the impact route');
  assert.match(PANEL_CODE, /fetchMemberImpact\(/, 'nothing calls it');
  assert.match(PANEL_CODE, /<RemovePreview\b/, 'the preview exists and the panel does not open it');
});

test('the preview is read through the module that refuses to print an unread count as zero', () => {
  // `impact.footprint?.comments ?? 0` in JSX is the whole defect: it tells an administrator the
  // departing member holds nothing at the moment we could not find out.
  assert.match(PANEL_CODE, /readImpact\(/, 'the answer is rendered without going through readImpact');
  assert.equal(/footprint\?\./.test(PANEL_CODE), false, 'the panel reads the raw footprint around the module');
});

test('a preview that did not load does not block the removal, and does not pretend either', () => {
  assert.match(PANEL_CODE, /impact\.isError &&/, 'the failed preview is not handled');
});

test('PAUSING ASKS WHY, because the server stores and audits the answer', () => {
  // suspendMember was called with '' from the only control that reached it, so the audit row the
  // route is careful to write always said null.
  assert.equal(/suspendMember\(projectId, member\.userId, ''\)/.test(PANEL_CODE), false, 'the reason is still hardcoded empty');
  assert.match(PANEL_CODE, /<PauseForm\b/, 'no control collects a reason');
  assert.match(PANEL_CODE, /MEMBER_REASON_MAX/, 'the box does not cap at the length the column holds');
});

test('a REMOVED member can be put back from the list, not only a paused one', () => {
  // The route reinstates both, at the role the grant carried. The panel offered Reactivate for
  // 'suspended' alone, so undoing a removal meant re-inviting — which records an invitation rather
  // than a reinstatement and invites the admin to pick a role by hand.
  assert.match(PANEL_CODE, /m\.status === 'suspended' \|\| m\.status === 'revoked'/, 'reactivation is still suspended-only');
  // …and NOT for 'expired': reactivate does not clear expires_at, so it would appear to work and
  // change nothing. A control that runs and does nothing is worse than one that is not there.
  assert.equal(/status === 'expired'[^\n]*reactivate/.test(PANEL_CODE), false, 'reactivation is offered for an expiry it cannot lift');
});

// ------------------------------------------------------------- the history has a reader ---

test('THE APPEND-ONLY HISTORY IS READABLE FROM THE PRODUCT', () => {
  // membership_events has no update policy and no delete policy, the CHECK constraint matches the
  // worker vocabulary exactly, and `inviteEventKind` names each event from what CHANGED so a
  // demotion is not logged as an invitation. api.ts had no function for the route and nothing
  // rendered one: all of that care was written where nobody could read it.
  assert.match(API, /export const fetchMemberEvents/, 'no client function for /members/events');
  assert.match(PANEL_CODE, /fetchMemberEvents\(/, 'nothing calls it');
  assert.match(PANEL_CODE, /<MemberHistory\b/, 'the view exists and the panel does not open it');
});

test('the acceptance of a share link is in that list, and the token is not', () => {
  // The route merges `link_accepted` in from the KV grant — the only moment in this product where
  // anybody actually says yes — and never echoes the token back, because a history view is a place
  // people paste from.
  // The import alone proves nothing — it is satisfied by a file that imports the reader and then
  // renders `event.kind` raw, which is how an unrecognised kind becomes a blank row.
  assert.match(PANEL_CODE, /events[^\n]*\)\.map\(describeEvent\)/, 'the entries are rendered without the reader');
  // Scoped to the history view rather than the file: elsewhere in this panel a share link is
  // MINTED, and that control is the one place a token legitimately appears on screen.
  const view = /function MemberHistory\([\s\S]*?\n\}/.exec(PANEL_CODE);
  assert.ok(view, 'MemberHistory is no longer a function this test can read');
  assert.equal(/token/i.test(view[0]), false, 'the history view names a token the route never sends');
});

test('A HISTORY WITH A HOLE IN IT SAYS SO', () => {
  // `partial: true` means the KV side could not be read in full. Dropping the flag serves a short
  // list as a whole one, which is how somebody concludes an event never happened.
  assert.match(PANEL_CODE, /historyGap\(/, 'the partial flag is never read');
  assert.match(PANEL_CODE, /\{gap &&/, 'it is read and never drawn');
});
