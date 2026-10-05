/**
 * GROWTH: AN INVITE LINK AND A "MADE WITH STUDPILOT" LINE (M2 step 2.3, item C8, priority P2).
 *
 *   1. THE LINK is `https://studpilot.app/app/signup?ref=<code>`, the code is a one-way hash of the account id (it names no one, and is the
 *      same each time), and a link with no valid code is not offered at all.
 *   2. THE BADGE is plain text and a link: nothing a Roblox description would show as stray markup.
 *   3. WHERE THEY ARE: "Invite a friend to StudPilot" on a project's menu on the shelf (named for the product, so it does not read as an
 *      invitation to the project it sits on), and Settings > Share with the full text and a Copy button that says what happened. The
 *      workspace has no icon for it: beside "Who can build here" an icon cannot say whose link it is (M2 fix cycle 1).
 *   4. WHAT IS NOT PROMISED. Nothing reads `ref` yet (the sign-up page, the worker, the user metadata), the pages say so, and NO REFERRAL
 *      CREDIT IS PROMISED ANYWHERE: those wait for M6. The first guard here fails the day something does read it, so this copy is revisited.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { WEB, bundle, element, renderWith, text } from './ui-bundle.mjs';
import { loadWithReact } from './hook-harness.mjs';
import { findAll, loadPage, textOf } from './page-harness.mjs';
import {
  BADGE_NOTE, BADGE_TEXT, COPIED, COPY_FAILED, INVITE_ACTION, INVITE_BASE, INVITE_COPIED, INVITE_NOTE, REF_CODE_LENGTH, SITE_URL, inviteLink, isRefCode, referralCode,
} from '../src/lib/growth.ts';

const sha = (id) => createHash('sha256').update(`studpilot-invite:${id}`).digest('hex').slice(0, REF_CODE_LENGTH);

/* ------------------------------------------------------------------ the code and the link --- */

test('the code is the first ten hex digits of SHA-256 over a fixed label and the account id, and is the same every time', async () => {
  const id = '3f2b8c1e-aaaa-4bbb-8ccc-0123456789ab';
  const code = await referralCode(id);
  assert.equal(code, sha(id), 'the documented derivation');
  assert.match(code, /^[0-9a-f]{10}$/);
  assert.equal(await referralCode(id), code, 'stable');
  assert.notEqual(await referralCode('another-account'), code, 'two accounts, two codes');
});

test('the code names no one: it holds no part of the account id', async () => {
  for (const id of ['00000000-0000-4000-8000-000000000000', 'abcdef12-3456-7890-abcd-ef1234567890', 'user-12345']) {
    const code = await referralCode(id);
    const compact = id.replace(/-/g, '');
    assert.equal(id.includes(code), false, 'the code is not a slice of the id');
    assert.notEqual(code, compact.slice(0, REF_CODE_LENGTH), 'nor its first characters');
    assert.notEqual(code, compact.slice(-REF_CODE_LENGTH), 'nor its last');
  }
});

test('no id, no Web Crypto, or a failing digest: no code, never an invented one', async () => {
  for (const none of [null, undefined, '', 42, {}]) assert.equal(await referralCode(none), null, JSON.stringify(none));
  assert.equal(await referralCode('u1', null), null, 'a browser with no Web Crypto');
  assert.equal(await referralCode('u1', async () => { throw new Error('no'); }), null);
});

test('the link is the sign-up page with ?ref=<code>, and a bad code makes no link at all', () => {
  assert.equal(INVITE_BASE, 'https://studpilot.app/app/signup');
  assert.equal(inviteLink('0123456789'), 'https://studpilot.app/app/signup?ref=0123456789');
  for (const bad of [null, undefined, '', 'abc', '0123456789a', '012345678', '0123456789\n', 'ABCDEFABCD', '012345678g', '../../etc', 'x=1&y=2', 5]) {
    assert.equal(inviteLink(bad), null, JSON.stringify(bad));
    assert.equal(isRefCode(bad), false);
  }
  const link = inviteLink(sha('u1'));
  const url = new URL(link);
  assert.equal(url.origin, SITE_URL);
  assert.equal(url.pathname, '/app/signup');
  assert.deepEqual([...url.searchParams.keys()], ['ref'], 'one query parameter, nothing else rides along');
});

/* ------------------------------------------------------------------ the badge --- */

test('the badge is plain text and a link to the site, with no markup a description would show as stray characters', () => {
  assert.equal(BADGE_TEXT, 'Made with StudPilot - https://studpilot.app');
  assert.ok(BADGE_TEXT.includes(SITE_URL));
  assert.doesNotMatch(BADGE_TEXT, /[<>[\]()*_`#|]|&[a-z]+;|\n/, 'markup or a line break');
  assert.ok(BADGE_TEXT.length < 100);
  assert.ok(/^[\x20-\x7e]+$/.test(BADGE_TEXT), 'plain ASCII, so it survives any description field');
});

/* ------------------------------------------------------------------ what is promised --- */

function sources(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.astro' || name === 'ai-elements' || name === 'aicss') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sources(full, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}
const strip = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/^\s*\/\/.*$/gm, '');
const ROOT = join(WEB, '..', '..');

//[[ RESTATED 2026-10-05 (M2 fix cycle 1). The scan was two regular expressions that needed "receive credits" with nothing between the verb and the
//   noun, and the invite word BEFORE the credit word in the second: "Invite a friend and you receive 5 Credits", "Every friend who joins adds 5
//   Credits to your balance", "Give 5 Credits to every friend you invite" and "Refer someone and unlock 10 Credits" all passed it, and planting
//   the first in lib/growth.ts left the test green. The property is the same (no copy offers credit for inviting or sharing) and is asked of
//   the pair instead of a phrasing: an invite word and a credit word within one sentence, in either order, whatever sits between them. ]]
const SOCIAL = String.raw`(?:refer(?:ral|rals|rer|red|s)?|invit\w*|friends?|teammates?|share|shares|sharing)`;
const CREDIT = String.raw`(?:credits?|bonus(?:es)?|rewards?|free (?:builds?|months?|days?))`;
const GAP = String.raw`[^.!?]{0,80}`;
const REFERRAL_CREDIT_PROMISE = new RegExp(String.raw`\b${SOCIAL}\b${GAP}\b${CREDIT}\b|\b${CREDIT}\b${GAP}\b${SOCIAL}\b`, 'i');
const squash = (s) => s.replace(/\s+/g, ' ');

test('NO REFERRAL CREDIT IS PROMISED ANYWHERE in the app or the site (it waits for M6)', () => {
  const files = [...sources(join(WEB, 'src'), ['.ts', '.tsx']), ...sources(join(ROOT, 'apps', 'site', 'src'), ['.astro', '.ts', '.tsx', '.md'])];
  assert.ok(files.length > 150, `the scan read ${files.length} files`);
  const hits = files.map((f) => [relative(ROOT, f), REFERRAL_CREDIT_PROMISE.exec(squash(strip(readFileSync(f, 'utf8'))))?.[0]]).filter(([, hit]) => hit);
  assert.deepEqual(hits, [], 'a page promises a credit for sharing StudPilot');
  // The guard has teeth: it fires on the sentences it exists for, including the four the first version missed.
  for (const bad of [
    'Invite a friend and earn 5 free credits', 'Refer a friend: get 10 credits each', 'Share your link, receive credits when they join', 'Every invite earns a bonus',
    'Invite a friend and you receive 5 Credits', 'Every friend who joins adds 5 Credits to your balance', 'Give 5 Credits to every friend you invite', 'Refer someone and unlock 10 Credits',
    'Your friends get 5 bonus credits', 'Share StudPilot and your next month is free of credits',
  ]) assert.match(bad, REFERRAL_CREDIT_PROMISE, bad);
  // And it does not fire on the rows' own words, or on a sentence that merely has credits in it.
  for (const fine of [INVITE_NOTE, BADGE_NOTE, INVITE_ACTION, INVITE_COPIED, 'Invite a friend', 'Made with StudPilot', 'Free while in beta. Paid plans start later.', 'Credits reset every day. Share nothing to keep them.']) {
    assert.doesNotMatch(fine, REFERRAL_CREDIT_PROMISE, fine);
  }
});

test('THE ROWS SAY WHAT IS TRUE TODAY: the link opens the sign-up page, nothing records it, and nothing is earned', () => {
  assert.match(INVITE_NOTE, /lands on StudPilot’s sign-up page/);
  assert.match(INVITE_NOTE, /does not name you/);
  assert.match(INVITE_NOTE, /Nothing records it yet, and nothing is earned by sharing it/);
  assert.match(BADGE_NOTE, /^Optional\./);
  assert.match(BADGE_NOTE, /plain text with a link/);
});

test('NOTHING READS `ref` YET: not the sign-up page, not the worker, not the sign-up metadata. The day something does, this fails and the copy is revisited', () => {
  const signup = strip(readFileSync(join(WEB, 'src', 'routes', 'auth-pages.tsx'), 'utf8'));
  assert.doesNotMatch(signup, /['"]ref['"]|[?&]ref=|referral|ref_code/i, 'the sign-up page reads a referral code');
  assert.match(signup, /data: gate\.data,/, 'the sign-up metadata is the age gate’s answer and nothing else');
  const worker = sources(join(ROOT, 'apps', 'worker', 'src'), ['.ts']).filter((f) => !f.endsWith('creator-skills.ts') && !f.endsWith('components.generated.ts'));
  assert.ok(worker.length > 50, 'the scan read the worker');
  const reads = worker.filter((f) => /query\(\s*['"]ref['"]\s*\)|searchParams\.get\(\s*['"]ref['"]\s*\)|\bref_code\b|referred_by|referralCode/.test(strip(readFileSync(f, 'utf8')))).map((f) => relative(ROOT, f));
  assert.deepEqual(reads, [], 'the worker now reads a referral code: say so in lib/growth.ts and the rows, and record it in DECISIONS.md');
  const migrations = sources(join(ROOT, 'infra', 'supabase', 'migrations'), ['.sql']).filter((f) => /ref(erral|_code)|referred_by/i.test(readFileSync(f, 'utf8')));
  assert.deepEqual(migrations.map((f) => relative(ROOT, f)), [], 'a migration stores a referral');
});

/* ------------------------------------------------------------------ the rows, rendered --- */

const ui = await bundle(`
  export { createElement as h } from 'react';
  export { renderToStaticMarkup } from 'react-dom/server';
  export { BadgeCard, CopyLine, InviteLinkCard } from './src/components/growth-cards';
`, { name: 'growth', resolveDir: WEB });
const render = (el) => renderWith(ui.renderToStaticMarkup, el);
const noop = async () => true;

test('a copyable line is a labelled read-only field and a Copy button', () => {
  const html = render(ui.h(ui.CopyLine, { id: 'f', label: 'Badge text', value: BADGE_TEXT, onCopy: noop }));
  assert.match(html, /<label[^>]*for="f"[^>]*>Badge text<\/label>/);
  assert.match(html, /<input id="f" type="text" readOnly=""[^>]*value="Made with StudPilot - https:\/\/studpilot\.app"/);
  assert.match(html, /<button type="button" class="btn">Copy<\/button>/);
  assert.match(html, /role="status"/, 'what happened is announced');
});

test('with no link yet the field is empty and Copy is held, rather than copying nothing', () => {
  const html = render(ui.h(ui.CopyLine, { id: 'f', label: 'Invite link', value: null, onCopy: noop }));
  assert.match(html, /<button[^>]*disabled=""[^>]*>Copy<\/button>/);
  assert.match(html, /placeholder="Not available in this browser"/);
});

test('the invite card says what the link is, and until it is computed offers no link', () => {
  const html = render(ui.h(ui.InviteLinkCard, { userId: 'u1' }));
  assert.match(text(html), /Invite a friend/);
  assert.ok(text(html).includes(INVITE_NOTE));
  assert.match(html, /<button[^>]*disabled=""[^>]*>Copy<\/button>/, 'the first render has no link');
  const badge = render(ui.h(ui.BadgeCard));
  assert.match(text(badge), /Made with StudPilot/);
  assert.ok(text(badge).includes(BADGE_NOTE));
  assert.doesNotMatch(badge, /<button[^>]*disabled/, 'the badge text is always there to copy');
});

/* ------------------------------------------------------------------ the rows, run --- */

const Cards = await loadPage({
  entry: 'src/components/growth-cards.tsx',
  name: 'growth-cards',
  real: ['lib/growth.ts'],
  fakes: { 'lib/use-invite-link.ts': { useInviteLink: '() => globalThis.__pageFakes.invite' }, 'components/picks/chat/copy-button.tsx': { writeClipboard: '(t) => { globalThis.__pageFakes.written.push(t); return Promise.resolve(globalThis.__pageFakes.ok); }' } },
});

test('Copy says Copied when the copy worked and says what to do when it did not', async () => {
  for (const [ok, said] of [[true, COPIED], [false, COPY_FAILED]]) {
    const page = Cards.mountStub(() => Cards.CopyLine({ id: 'f', label: 'L', value: 'v', onCopy: async () => ok }));
    await page.settle();
    findAll(page.result, (n) => n.type === 'button')[0].props.onClick();
    await page.settle();
    assert.equal(textOf(findAll(page.result, (n) => n.props?.role === 'status')[0]), said);
  }
});

test('the badge card copies exactly the badge text; the invite card copies exactly the link the hook computed', async () => {
  globalThis.__pageFakes = { written: [], ok: true, invite: { link: 'https://studpilot.app/app/signup?ref=0123456789', copy: async () => { globalThis.__pageFakes.written.push('invite'); return true; } } };
  const badge = Cards.mountStub(() => Cards.BadgeCard());
  await badge.settle();
  const line = findAll(badge.result, (n) => n.type === Cards.CopyLine)[0];
  assert.equal(line.props.value, BADGE_TEXT);
  await line.props.onCopy();
  assert.deepEqual(globalThis.__pageFakes.written, [BADGE_TEXT]);
  const invite = Cards.mountStub(() => Cards.InviteLinkCard({ userId: 'u1' }));
  await invite.settle();
  const inviteLine = findAll(invite.result, (n) => n.type === Cards.CopyLine)[0];
  assert.equal(inviteLine.props.value, 'https://studpilot.app/app/signup?ref=0123456789');
  assert.equal(inviteLine.props.onCopy, globalThis.__pageFakes.invite.copy);
});

/* ------------------------------------------------------------------ the hooks, run --- */

const Hook = await loadPage({
  entry: 'src/lib/use-invite-link.ts',
  name: 'use-invite-link',
  real: ['lib/growth.ts'],
  fakes: {
    'components/toast.tsx': { useToast: '() => ({ toast: (...a) => globalThis.__pageFakes.toasts.push(a) })' },
    'components/picks/chat/copy-button.tsx': { writeClipboard: '(t) => { globalThis.__pageFakes.written.push(t); return Promise.resolve(globalThis.__pageFakes.ok); }' },
  },
});

/** The hash is computed by Web Crypto on a worker thread, which one turn of the stand-in's event loop does not wait for. */
async function until(hook, done) {
  for (let i = 0; i < 100 && !done(); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    await hook.settle();
  }
}

async function inviteHook(userId, ok = true) {
  globalThis.__pageFakes = { toasts: [], written: [], ok };
  const hook = Hook.mountStub(() => Hook.useInviteLink(userId));
  await hook.settle();
  if (userId) await until(hook, () => hook.result.link !== null);
  return hook;
}

test('the hook computes the account’s link once the account is known, and offers none before, or without one', async () => {
  const hook = await inviteHook('u-1');
  assert.equal(hook.result.link, `https://studpilot.app/app/signup?ref=${sha('u-1')}`);
  assert.equal((await inviteHook(null)).result.link, null);
  assert.equal((await inviteHook(undefined)).result.link, null);
});

test('copy writes exactly the link, and says false when there is none', async () => {
  const hook = await inviteHook('u-1');
  assert.equal(await hook.result.copy(), true);
  assert.deepEqual(globalThis.__pageFakes.written, [`https://studpilot.app/app/signup?ref=${sha('u-1')}`]);
  const none = await inviteHook(null);
  assert.equal(await none.result.copy(), false);
  assert.deepEqual(globalThis.__pageFakes.written, [], 'nothing is written when there is nothing to write');
  const refused = await inviteHook('u-1', false);
  assert.equal(await refused.result.copy(), false, 'a clipboard that refuses is not reported as a copy');
});

test('a late answer for a previous account is not applied to the new one', async () => {
  globalThis.__pageFakes = { toasts: [], written: [], ok: true };
  let id = 'first';
  const hook = Hook.mountStub(() => Hook.useInviteLink(id));
  await hook.settle();
  await until(hook, () => hook.result.link !== null);
  assert.equal(hook.result.link, `https://studpilot.app/app/signup?ref=${sha('first')}`);
  id = 'second';
  hook.rerender();
  await hook.settle();
  await until(hook, () => hook.result.link === `https://studpilot.app/app/signup?ref=${sha('second')}`);
  assert.equal(hook.result.link, `https://studpilot.app/app/signup?ref=${sha('second')}`);
});

test('the share press copies and says whose link it is; a failure says so; no link yet says to try again', async () => {
  globalThis.__pageFakes = { toasts: [], written: [], ok: true };
  const ok = Hook.mountStub(() => Hook.useShareInvite('u-1'));
  await ok.settle();
  await until(ok, () => ok.renders > 1);
  ok.result.share();
  await until(ok, () => globalThis.__pageFakes.toasts.length > 0);
  assert.deepEqual(globalThis.__pageFakes.toasts, [[INVITE_COPIED, 'success']]);
  assert.equal(INVITE_COPIED, 'Link to StudPilot copied. Send it to a friend.');
  globalThis.__pageFakes = { toasts: [], written: [], ok: false };
  const bad = Hook.mountStub(() => Hook.useShareInvite('u-1'));
  await bad.settle();
  await until(bad, () => bad.renders > 1);
  bad.result.share();
  await until(bad, () => globalThis.__pageFakes.toasts.length > 0);
  assert.deepEqual(globalThis.__pageFakes.toasts, [[COPY_FAILED, 'error']]);
  globalThis.__pageFakes = { toasts: [], written: [], ok: true };
  const early = Hook.mountStub(() => Hook.useShareInvite(null));
  await early.settle();
  early.result.share();
  assert.deepEqual(globalThis.__pageFakes.toasts.map((t) => t[1]), ['info']);
  assert.match(globalThis.__pageFakes.toasts[0][0], /not ready yet/);
  assert.deepEqual(globalThis.__pageFakes.written, []);
});

/* ------------------------------------------------------------------ where they are (syntax tree) --- */

const parse = (...p) => ts.createSourceFile(p.at(-1), readFileSync(join(WEB, 'src', ...p), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = (root) => { const all = []; const visit = (n) => { all.push(n); ts.forEachChild(n, visit); }; visit(root); return all; };
const isTag = (n) => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n);
const tagOf = (n) => (ts.isJsxElement(n) ? n.openingElement : n).tagName.getText();
const attr = (n, name) => (ts.isJsxElement(n) ? n.openingElement : n).attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText() === name)?.initializer?.getText();

//[[ RESTATED 2026-10-05 (M2 fix cycle 1). The item was "Copy invite link", sitting among Rename, Tags, Archive and Delete, which all act on THAT project, and
//   it copies the sign-up page's link, which grants no access to it. It is named for what it is now. The property is unchanged (a project's menu has
//   the share press and the shelf hands it the press) and the name is held: it names StudPilot, says nothing of the project, and is not the old
//   label that read as an invitation to the project. ]]
test('a project’s menu on the shelf has "Invite a friend to StudPilot", and the shelf hands it the share press', () => {
  assert.equal(INVITE_ACTION, 'Invite a friend to StudPilot');
  assert.match(INVITE_ACTION, /StudPilot/, 'the label does not name the product, so it reads as an invitation to the project');
  assert.doesNotMatch(INVITE_ACTION, /project|copy invite link|collaborat|member/i, 'the label reads as an invitation to the project');
  const dash = parse('routes', 'dashboard.tsx');
  const menu = nodes(dash).find((n) => ts.isFunctionDeclaration(n) && n.name?.text === 'ProjectMenu');
  assert.ok(menu);
  const items = nodes(menu).filter((n) => ts.isJsxElement(n) && attr(n, 'role') === '"menuitem"' && /\{INVITE_ACTION\}/.test(n.getText()));
  assert.equal(items.length, 1, 'one "Invite a friend to StudPilot" item');
  assert.doesNotMatch(menu.getText(), /Copy invite link/, 'the old label is back on a project\'s menu');
  assert.match(items[0].getText(), /onShare\(\)/);
  const page = nodes(dash).find((n) => ts.isFunctionDeclaration(n) && n.name?.text === 'DashboardPage');
  assert.match(page.getText(), /const \{ share: shareInvite \} = useShareInvite\(session\?\.user\.id\);/);
  assert.match(page.getText(), /onShare=\{shareInvite\}/);
});

//[[ RESTATED 2026-10-05 (M2 fix cycle 1). It required an icon button for the link among the workspace's project actions, right beside "Who can build here",
//   the REAL invitation to the project. An icon cannot say that it copies the sign-up page's link and grants no access, so a person could send it
//   to a teammate expecting access. The share is named in words where it stays (the shelf's menu, Settings > Share), and the workspace carries
//   no icon for it. The property asked now: the one real invitation in the workspace is not shadowed by a second, unlabelled one. ]]
test('the workspace has NO icon for the invite link beside "Who can build here"; the project’s real invitation is the only one there', () => {
  const ws = parse('routes', 'workspace.tsx');
  assert.equal(nodes(ws).some((n) => ts.isIdentifier(n) && n.text === 'useShareInvite'), false, 'the workspace still wires the share press');
  assert.equal(nodes(ws).some((n) => ts.isIdentifier(n) && n.text === 'shareInvite'), false);
  assert.equal(nodes(ws).some((n) => isTag(n) && tagOf(n) === 'button' && /invite/i.test(attr(n, 'aria-label') ?? '')), false, 'a workspace button with "invite" in its name that is not the members panel');
  assert.ok(nodes(ws).some((n) => isTag(n) && tagOf(n) === 'button' && attr(n, 'aria-label') === '"Who can build here"'), 'the real invitation (Who can build here) is gone');
});

test('Settings has a Share section with both rows, and the search and the rail know them', async () => {
  const settings = parse('routes', 'settings.tsx');
  const section = nodes(settings).find((n) => isTag(n) && tagOf(n) === 'Section' && attr(n, 'id') === '"sharing"');
  assert.ok(section, 'the Share section');
  assert.deepEqual(nodes(section).filter((n) => isTag(n) && tagOf(n) === 'Row').map((r) => attr(r, 'id')), ['"invite-link"', '"made-with-badge"']);
  assert.ok(nodes(section).some((n) => isTag(n) && tagOf(n) === 'InviteLinkCard'));
  assert.ok(nodes(section).some((n) => isTag(n) && tagOf(n) === 'BadgeCard'));
  const { SETTING_FIELDS, matchSettings } = await import('../src/lib/settings-search.ts');
  for (const id of ['invite-link', 'made-with-badge']) assert.equal(SETTING_FIELDS.find((f) => f.id === id)?.section, 'Share');
  assert.ok(matchSettings('invite').includes('invite-link'));
  assert.ok(matchSettings('friend').includes('invite-link'));
  assert.ok(matchSettings('badge').includes('made-with-badge'));
  assert.ok(matchSettings('made with').includes('made-with-badge'));
  assert.match(readFileSync(join(WEB, 'src', 'routes', 'settings.tsx'), 'utf8'), /\{ group: 'Account', id: 'sharing', label: 'Share', fields: \['invite-link', 'made-with-badge'\] \}/);
});

test('the registry words do not suggest a reward', async () => {
  const { SETTING_FIELDS } = await import('../src/lib/settings-search.ts');
  for (const id of ['invite-link', 'made-with-badge']) {
    const field = SETTING_FIELDS.find((f) => f.id === id);
    assert.doesNotMatch(JSON.stringify(field), /referral|reward|bonus|earn|credit/i, id);
  }
});

test('the hook module and the cards reach for nothing but the clipboard: no request, no storage', () => {
  for (const file of [['lib', 'growth.ts'], ['lib', 'use-invite-link.ts'], ['components', 'growth-cards.tsx']]) {
    const src = strip(readFileSync(join(WEB, 'src', ...file), 'utf8'));
    assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|indexedDB|supabase|lib\/api'/, `${file.join('/')} sends or stores something`);
  }
});
