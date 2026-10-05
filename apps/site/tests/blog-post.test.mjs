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

/** The claims of a post: every paragraph that opens with a bold lead, as { section, lead, text }. */
function claimsOf(body) {
  let section = '';
  const out = [];
  for (const block of body.split(/\n\s*\n/)) {
    const h = block.match(/^## (.+)$/m);
    if (h) {
      section = h[1].trim();
      continue;
    }
    const m = block.trim().match(/^\*\*(.+?)\*\*\s*([\s\S]*)$/);
    if (m) out.push({ section, lead: m[1].trim(), text: m[2].replace(/\s+/g, ' ').trim() });
  }
  return out;
}

test('the claim parser can see: it reads the sections, the bold leads and the text after them', () => {
  const fixture = '## One\n\n**A lead.** The text, with [a link](/x).\n\n**Another.** More.\n\n## Two\n\n**Third.** Last.';
  assert.deepEqual(claimsOf(fixture), [
    { section: 'One', lead: 'A lead.', text: 'The text, with [a link](/x).' },
    { section: 'One', lead: 'Another.', text: 'More.' },
    { section: 'Two', lead: 'Third.', text: 'Last.' },
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
  'You can sign in with your email, or with Roblox.': {
    section: 'What works today',
    check: () => {
      assert.match(worker('index.ts'), /app\.route\('\/auth\/roblox'/, 'the worker no longer serves /auth/roblox');
      assert.ok(read('web', 'src', 'lib', 'roblox-signin.ts').includes("'/auth/roblox/start'"), 'the app no longer links Sign in with Roblox to /auth/roblox/start');
      assert.match(read('web', 'src', 'routes', 'auth-pages.tsx'), /signInWithPassword/, 'the app no longer signs in with an email and a password');
    },
  },
  'You can make a project and chat with StudPilot.': {
    section: 'What works today',
    check: () => {
      assert.match(read('web', 'src', 'routes', 'dashboard.tsx'), /from\('projects'\)[\s\S]{0,120}\.insert\(/, 'the dashboard no longer creates a project');
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
      assert.match(text, /No piece has passed it yet/);
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
  'Google and Discord sign-in are coming.': {
    section: 'What is not there yet',
    check: () => {
      // The app draws a provider button only when that provider is on, and nothing in the app calls an OAuth sign-in for Google or Discord yet.
      const src = walkFiles(join(APPS, 'web', 'src'), (p) => /\.tsx?$/.test(p)).map((f) => read('web', 'src', f)).join('\n');
      assert.doesNotMatch(src, /signInWithOAuth\s*\(/, 'the app signs in with an OAuth provider: re-read this line of the post');
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

test('nothing is listed under "What works today" about building, pairing or checking in Studio while the plugin cannot be had', () => {
  const { body } = post('what-works-today.md');
  assert.equal(shared.STUDIO_PLUGIN_STORE_LIVE, false, 'the plugin can be had now: re-read the whole post');
  const works = claimsOf(body).filter((c) => c.section === 'What works today');
  assert.ok(works.length >= 3, 'the "What works today" list was not found');
  for (const c of works) {
    assert.doesNotMatch(`${c.lead} ${c.text}`, /\bpair|\bplugin\b|\bin Studio\b|play test|\bchecks?\b|\bbuilds? (?:a|the|your) /i, `"${c.lead}" lists a Studio capability as working today, and new customers cannot get the plugin`);
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
