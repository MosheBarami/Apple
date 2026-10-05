// THE ONE BLOG POST SAYS ONLY WHAT IS TRUE OF THE CODE ("What works today in the StudPilot beta", handoff M2: honest copy).
//
// Markdown cannot read the shared config or the plugin, so every line of the post is a claim that needs its own check. The first version
// of this file checked the typed figures and the "not there yet" lines only, and a mutation that turned "a 6-character code ... 10 minutes"
// into "an 8-character code ... 30 minutes", and the sentence about the checks into a promise to load test a place and publish it, left
// the whole suite green. So the rule here is the strong one: EVERY bold lead in the post is a factual claim, each one has a verifier below
// that reads the repository, and the test fails when the post carries a lead with no verifier (a new claim nobody checks) or a verifier
// with no line in the post (a check of nothing). Figures are compared with the shared config, the pairing facts with the plugin and the
// worker, the tool names with the registry, the sign-in claims with the app and the worker, the "not there yet" lines with the facts they deny.
//
// Run with:  pnpm --filter @studpilot/site build && node --test tests/blog-post.test.mjs   (from apps/site)
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE, distPage, stripComments, textOf, walkFiles } from './lib/dist.mjs';
import { CONSENT_SENTENCE, assertCodeFactsHold, assertConsentPromiseHolds } from './lib/plugin-promises.mjs';

const BLOG = join(SITE, 'src', 'content', 'blog');
const APPS = join(SITE, '..');
const shared = await import('../../../packages/shared/src/index.ts');
const { openIssues } = await import('../src/data/known-issues.ts');
const read = (...p) => readFileSync(join(APPS, ...p), 'utf8');

function post(name) {
  const raw = readFileSync(join(BLOG, name), 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  assert.ok(m, `${name} has no frontmatter`);
  const front = Object.fromEntries(m[1].split('\n').map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()]));
  return { front, body: m[2] };
}

/**
 * EVERY BLOCK OF THE POST, as { section, lead, text }: a heading line sets the section (a heading and the paragraph under it with no blank line between
 * them are two blocks, not one swallowed one), and every other block is read, bold-led or not. `lead` is the bold opening of the block, or null.
 * (The first version collected only blocks that opened with a bold lead, so an unbolded paragraph written under "What works today" was never examined.)
 */
function blocksOfPost(body) {
  let section = '';
  const out = [];
  const spaced = body.replace(/^(#{1,6} .*)$/gm, '\n$1\n');
  for (const block of spaced.split(/\n\s*\n/)) {
    const t = block.trim();
    if (!t) continue;
    const h = t.match(/^#{1,6} (.+)$/);
    if (h) {
      section = h[1].trim();
      continue;
    }
    const m = t.match(/^\*\*(.+?)\*\*\s*([\s\S]*)$/);
    out.push(m ? { section, lead: m[1].trim(), text: m[2].replace(/\s+/g, ' ').trim() } : { section, lead: null, text: t.replace(/\s+/g, ' ') });
  }
  return out;
}

/** The claims of a post: every block that opens with a bold lead. */
const claimsOf = (body) => blocksOfPost(body).filter((b) => b.lead !== null);

test('the claim parser can see: it reads the sections, the bold leads and the text after them, the blocks that have no bold lead, and a paragraph that follows a heading with no blank line', () => {
  const fixture = '## One\n\n**A lead.** The text, with [a link](/x).\n\n**Another.** More.\n\n## Two\n\n**Third.** Last.';
  assert.deepEqual(claimsOf(fixture), [
    { section: 'One', lead: 'A lead.', text: 'The text, with [a link](/x).' },
    { section: 'One', lead: 'Another.', text: 'More.' },
    { section: 'Two', lead: 'Third.', text: 'Last.' },
  ]);
  const loose = '## One\n**Glued.** Straight under its heading.\n\nAn unbolded paragraph builds the piece in Studio.\n\n- a list item';
  assert.deepEqual(blocksOfPost(loose), [
    { section: 'One', lead: 'Glued.', text: 'Straight under its heading.' },
    { section: 'One', lead: null, text: 'An unbolded paragraph builds the piece in Studio.' },
    { section: 'One', lead: null, text: '- a list item' },
  ]);
});

test('the blog is a content collection of Markdown (no MDX), and its posts carry a title, a description and a date', () => {
  const files = walkFiles(BLOG);
  assert.ok(files.length > 0, 'the blog holds no post');
  for (const f of files) assert.match(f, /\.md$/, `${f} is not Markdown`);
  assert.ok(existsSync(join(SITE, 'src', 'content.config.ts')), 'src/content.config.ts is missing');
  for (const f of files) {
    const { front } = post(f);
    for (const k of ['title', 'description', 'date']) assert.ok(front[k], `${f} has no ${k}`);
    assert.match(front.date, /^\d{4}-\d{2}-\d{2}$/);
  }
  assert.equal(post('what-works-today.md').front.title, 'What works today in the StudPilot beta');
});

// --------------------------------------------------------------------------------------------------------- the verifiers
const worker = (f) => read('worker', 'src', f);
const toolsSrc = stripComments(worker('tools.ts'));

/** The tool names the worker registers: the `name: '…'` it is advertised under (what site-names-real-tools reads) and the key it sits under in TOOLS. */
const registered = new Set([
  ...toolsSrc.matchAll(/\bname: '([a-z][a-z0-9_]*)'/g),
  ...toolsSrc.matchAll(/^  ([a-z][a-z0-9_]*): \{$/gm),
].map((m) => m[1]));

/**
 * lead -> { section, check(text) }. `section` is where the lead must stand ("What works today" or "What is not there yet"): a claim that moves
 * from one list to the other is a change of what is true, and fails here until a person re-reads it.
 */
const VERIFIERS = {
  'You can sign in with your email.': {
    section: 'What works today',
    check: (text) => {
      assert.match(read('web', 'src', 'routes', 'auth-pages.tsx'), /signInWithPassword/, 'the app no longer signs in with an email and a password');
      assert.match(text, /Email sign-in works for everyone\./);
    },
  },
  'You can make a project and chat with StudPilot.': {
    section: 'What works today',
    check: () => {
      // One-click create (M2 2.3 C3): the dashboard's button calls useCreateProject, which inserts the project row.
      assert.match(read('web', 'src', 'routes', 'dashboard.tsx'), /onClick=\{createProject\}/, 'the dashboard no longer offers to create a project');
      assert.match(read('web', 'src', 'lib', 'use-create-project.ts'), /from\('projects'\)[\s\S]{0,200}\.insert\(/, 'the dashboard no longer creates a project');
      assert.match(read('web', 'src', 'lib', 'use-project-socket.ts'), /type: 'chat'/, 'the project chat no longer sends a chat message');
    },
  },
  'You can watch what it does in the chat.': {
    section: 'What works today',
    check: (text) => {
      assert.match(text, /live list of the steps/);
      assert.ok(existsSync(join(APPS, 'web', 'src', 'components', 'ws', 'run-steps.tsx')), 'the chat has no step list component');
      assert.match(read('web', 'src', 'components', 'ws', 'run-steps.tsx'), /data-run-steps/);
      assert.match(read('web', 'src', 'lib', 'api.ts'), /export const stopRun\b/, 'the app has no way to stop a run');
    },
  },
  'Free costs nothing.': {
    section: 'What works today',
    check: (text) => {
      const free = shared.PLAN_TABLE.free;
      assert.ok(text.includes(`${free.creditsPerDay} Credits a day, up to ${free.creditsPerMonth} a month`), 'the Free allowance in the post differs from PLAN_TABLE.free');
      assert.ok(text.includes(`about ${shared.formatMoney(shared.CREDIT_USD)} of AI compute`), 'the Credit price in the post differs from CREDIT_USD');
      assert.ok(text.includes(`about ${shared.formatCredits(shared.TYPICAL_BUILD_CREDITS)} Credits`), 'the typical build in the post differs from TYPICAL_BUILD_CREDITS');
    },
  },
  'New customers cannot build in Studio.': {
    section: 'What is not there yet',
    check: (text) => {
      // The plugin is not on the Creator Store, the repository's own status page says new customers cannot build, and the pairing facts in the
      // sentence are the plugin's and the worker's.
      assert.equal(shared.STUDIO_PLUGIN_STORE_LIVE, false, 'the store listing is live: the post says new customers cannot get the plugin');
      assert.match(text, /not on the Creator Store/);
      const open = openIssues().find((i) => i.id === 'plugin-not-in-creator-store');
      assert.ok(open, 'the status page no longer lists the plugin as unavailable');
      assert.match(open.impact, /new customers can chat and plan but cannot build inside Studio yet/, 'the status page no longer says new customers cannot build in Studio');
      assert.match(text, /6-character code/);
      assert.match(text, /A code works for 10 minutes/);
      assertCodeFactsHold();
      assert.match(text, CONSENT_SENTENCE, 'the post no longer carries the consent promise in the words the pages use');
      assertConsentPromiseHolds();
      assert.ok(text.includes('(/docs/plugin)'), 'the post does not link to the plugin page');
    },
  },
  'The checks need the plugin.': {
    section: 'What is not there yet',
    check: (text) => {
      // Every capability the sentence names is a tool the worker registers, and every one of them runs inside Studio.
      for (const tool of ['play_check', 'play_check_ui', 'check_ui_layout', 'audit_build']) assert.ok(registered.has(tool), `${tool} is not a registered tool`);
      assert.match(text, /play test a place/);
      assert.match(text, /press buttons in a running game/);
      assert.match(text, /check a screen's layout/);
      assert.match(text, /audit what it built/);
      assert.match(toolsSrc, /Playtest AS A PLAYER[\s\S]{0,1200}Studio Test session/, 'play_check no longer plays in a Studio test session');
      assert.match(worker('do/session.ts'), /import \{ auditReply[^}]*\} from '\.\.\/claim-audit'/, 'the reply is no longer read by the claim audit');
      assert.match(text, /checks its own reply/);
      // The sentence says nothing the post's own list does not: no load test, no translation, no publishing.
      assert.doesNotMatch(text, /load test|translate|publish/i, 'the sentence about the checks promises something the tools do not do');
    },
  },
  'The quality bar has not been met.': {
    section: 'What is not there yet',
    check: (text) => {
      const landing = textOf(distPage('/').html);
      assert.match(landing, /8\/10[^.]*every area/, 'the front page no longer states an 8/10 bar');
      assert.match(text, /8 or better in every area/);
      assert.match(text, /no play-test errors/);
      assert.match(text, /no false claims/);
      // THE CRITIC IS NOT A RUNNING THING YET, so the post says it is being built and that nothing has been rated. The day a critic harness is in the
      // repository (handoff 3.1 to 3.3: scripts/eval, planning/critic-rubric.md) this fails until a person re-reads the line and the pages that state the bar.
      assert.match(text, /That critic is being built, so no piece has been rated against the bar yet/);
      assert.ok(!existsSync(join(APPS, '..', 'scripts', 'eval')), 'a critic harness (scripts/eval) is in the repository: re-read what the post says about the critic');
      assert.ok(!existsSync(join(APPS, '..', 'planning', 'critic-rubric.md')), 'the critic rubric (planning/critic-rubric.md) is in the repository: re-read what the post says about the critic');
      assert.match(textOf(distPage('/catalog/').html), /No examples yet/, 'the catalog shows examples while the post says no piece has passed');
    },
  },
  'Reviewed building blocks are not built.': {
    section: 'What is not there yet',
    check: () => {
      assert.equal(walkFiles(join(APPS, 'worker', 'src'), (p) => /\/(?:block-engine|blocks|recipe-interpreter)[^/]*\.ts$/.test(p)).length, 0, 'a block engine exists: the post says reviewed blocks are not built');
    },
  },
  'Not every build runs every check.': {
    section: 'What is not there yet',
    check: () => {
      // No pipeline runs the checks on every build: the checks are tools the agent may call. The how-it-works page says the same, on its step.
      const steps = textOf(distPage('/how-it-works/').html);
      assert.match(steps, /That is not true of every build yet/);
      assert.ok(!/\bfor (?:each|every) build[^.]{0,60}\b(?:run|runs)\b[^.]{0,40}\b(?:play_check|audit_build|check_ui_layout)\b/i.test(toolsSrc), 'a pipeline now runs the checks on every build');
    },
  },
  'The one multiple-choice question is not in the chat.': {
    section: 'What is not there yet',
    check: () => {
      assert.doesNotMatch(toolsSrc, /\bname: '(?:ask_choice|ask_user|ask_question|clarify)'/, 'the worker now has a clarifying-question tool');
    },
  },
  'There is no settings panel for a piece yet.': {
    section: 'What is not there yet',
    check: () => {
      assert.equal(walkFiles(join(APPS, 'web', 'src'), (p) => /piece-settings|settings-panel-piece|PieceSettings/.test(p)).length, 0, 'a per-piece settings panel exists: the post says there is none');
    },
  },
  'Sign in with Roblox is in a limited test.': {
    section: 'What is not there yet',
    check: (text) => {
      // The Markdown cannot read ROBLOX_OAUTH_REVIEWED, so this is where the flag is held against the post: the day Roblox approves the app and the
      // flag flips, this fails until a person moves the line to "What works today" (tests/roblox-signin-limit.test.mjs reads every built page).
      assert.equal(shared.ROBLOX_OAUTH_REVIEWED, false, 'the Roblox app is reviewed: the post says Sign in with Roblox is in a limited test, so move the line to "What works today"');
      assert.match(text, /until Roblox approves the app/);
      assert.match(text, /Email sign-in works for everyone\./);
      // The sign-in is real, so the limit is the only thing the line takes back: the worker serves it and the app offers it.
      assert.match(worker('index.ts'), /app\.route\('\/auth\/roblox'/, 'the worker no longer serves /auth/roblox');
      assert.ok(read('web', 'src', 'lib', 'roblox-signin.ts').includes("'/auth/roblox/start'"), 'the app no longer links Sign in with Roblox to /auth/roblox/start');
    },
  },
  'Google and Discord sign-in are coming.': {
    section: 'What is not there yet',
    check: () => {
      // "Not on the sign-in page" holds while the providers are off at Supabase: the app draws a provider button only when the project's own
      // settings say that provider is on (auth-providers.ts). Switching a provider on (owner item N2) must come with a rewrite of this line.
      assert.match(read('web', 'src', 'lib', 'auth-providers.ts'), /\(external as Record<string, unknown>\)\[provider\] === true/, 'the provider buttons are no longer gated on the provider being on: re-read this line of the post');
      assert.match(read('web', 'src', 'routes', 'auth-pages.tsx'), /useEnabledProviders\(/, 'the sign-in page draws provider buttons without asking which are on: re-read this line of the post');
    },
  },
  'Paid plans are not for sale.': {
    section: 'What is not there yet',
    check: (text) => {
      assert.equal(shared.CREDIT_PURCHASE_LIVE, false, 'credits can be bought now: the post says paid plans are not for sale');
      assert.ok(text.includes('(/pricing)'));
      const html = distPage('/pricing/').html;
      assert.ok([...html.matchAll(/<button\b[^>]*\bdisabled\b/gi)].length >= 2, 'the paid plan cards are not disabled');
    },
  },
};

test('every bold lead in the post is a factual claim with a verifier, and every verifier has its line in the post', () => {
  const { body } = post('what-works-today.md');
  const claims = claimsOf(body);
  assert.ok(claims.length >= 10, `only ${claims.length} claims were found in the post: the parser has drifted`);
  const leads = claims.map((c) => c.lead);
  assert.equal(new Set(leads).size, leads.length, 'two claims share a lead');
  for (const c of claims) assert.ok(VERIFIERS[c.lead], `the post says "${c.lead}" and nothing in this file checks it against the repository`);
  for (const lead of Object.keys(VERIFIERS)) assert.ok(leads.includes(lead), `"${lead}" is checked here but is no longer in the post: delete the check or restore the line`);
});

test('each claim holds against the repository, and stands in the list it belongs to', () => {
  const { body } = post('what-works-today.md');
  for (const c of claimsOf(body)) {
    const v = VERIFIERS[c.lead];
    assert.ok(v, `no verifier for "${c.lead}"`);
    assert.equal(c.section, v.section, `"${c.lead}" is under "${c.section}" and belongs under "${v.section}"`);
    v.check(c.text);
  }
});

/** What a Studio capability sounds like: pairing, the plugin, a place built in Studio, a play test, a check, a build of a piece. */
const STUDIO_CAPABILITY = /\bpair|\bplugin\b|\bin Studio\b|\binto (?:your|the) (?:Studio )?place\b|play test|\bchecks?\b|\bbuilds? (?:a|the|your|into|it|every|each) /i;
/** The headings the post may have. A claim under any other heading has no rule. */
const SECTIONS = ['What works today', 'What is not there yet', 'Why we are saying this'];

test('EVERY BLOCK of the post is accounted for: no heading outside the three, and under the two claim lists no block without a bold lead (so no line without a verifier)', () => {
  const { body } = post('what-works-today.md');
  const blocks = blocksOfPost(body);
  assert.ok(blocks.length >= 15, `only ${blocks.length} blocks were found in the post: the parser has drifted`);
  for (const b of blocks) {
    assert.ok(SECTIONS.includes(b.section) || b.section === '', `"${b.text.slice(0, 60)}" stands under the heading "${b.section}", which this test does not know`);
    if (b.section === 'What works today' || b.section === 'What is not there yet') {
      assert.notEqual(b.lead, null, `the block "${b.text.slice(0, 80)}" under "${b.section}" has no bold lead, so nothing checks it against the repository: give it a lead and a verifier, or delete it`);
    }
  }
  const headings = [...body.matchAll(/^#{1,6} (.+)$/gm)].map((m) => m[1].trim());
  for (const h of headings) assert.ok(SECTIONS.includes(h), `the post has a heading "${h}" this test does not know`);
});

test('nothing in the post outside "What is not there yet" claims a Studio capability while the plugin cannot be had: not the bold-led lines, not an unbolded paragraph, not the introduction or the closing', () => {
  const { body } = post('what-works-today.md');
  assert.equal(shared.STUDIO_PLUGIN_STORE_LIVE, false, 'the plugin can be had now: re-read the whole post');
  const works = blocksOfPost(body).filter((b) => b.section === 'What works today');
  assert.ok(works.length >= 3, 'the "What works today" list was not found');
  for (const b of blocksOfPost(body).filter((x) => x.section !== 'What is not there yet')) {
    assert.doesNotMatch(`${b.lead ?? ''} ${b.text}`, STUDIO_CAPABILITY, `"${(b.lead ?? b.text).slice(0, 80)}" under "${b.section || 'the introduction'}" claims a Studio capability, and new customers cannot get the plugin`);
  }
});

test('the built post and the blog index carry the Beta label, link to real pages and show no result', () => {
  const page = distPage('/blog/what-works-today/');
  const text = textOf(page.html);
  assert.match(text, /\bBeta\b/);
  assert.match(text, /What works today/);
  assert.doesNotMatch(text, /\b\d+(?:\.\d+)?\s*\/\s*10\b/, 'the post shows a score');
  const index = textOf(distPage('/blog/').html);
  assert.match(index, /What works today in the StudPilot beta/);
});
