// HOW IT WORKS SAYS WHAT IS TRUE TODAY, STEP BY STEP (handoff M2: "must not claim anything the product does not yet do").
//
// The page carries the plan's eight steps and one label on each: "Works today", "Partly works today" or "Being built". The label is the
// claim, so this holds the labels to the facts the worker and the app can be checked for, read from the repository:
//   - there are exactly eight steps, each with one label from the three;
//   - the block engine (reviewed building blocks, the AI picks and the system runs) is "Being built", and the page says the blocks are not in;
//   - sign-in says Google and Discord are coming (they are not enabled: the app shows a button only when its provider is on);
//   - nothing describes the AI looking at a picture (the plan's product has no vision), and no step describes a result;
//   - the one multiple-choice question is described as being built, because the worker has no such mechanism (checked below in source).
// The parser is run on a fixture first. Reads the BUILT page.
//
// Run with:  pnpm --filter @studpilot/site build && node --test tests/how-it-works.test.mjs   (from apps/site)
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE, distPage, regionsWith, textOf } from './lib/dist.mjs';

const LABELS = ['Works today', 'Partly works today', 'Being built'];

/** The steps of the page: [{ n, title, text, label }]. */
function stepsOf(html) {
  return [...html.matchAll(/<li class="step"[^>]*>([\s\S]*?)<\/li>/g)].map((m, i) => {
    const block = m[1];
    const label = textOf(block.match(/<p class="status[^"]*step__status[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '');
    const title = textOf(block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? '').replace(/^Step \d+:\s*/, '');
    return { n: i + 1, title, text: textOf(block.replace(/<p class="status[\s\S]*?<\/p>/, '')), label };
  });
}

test('the step parser can see: it reads a step, its title and its label', () => {
  const fixture = '<ol><li class="step"><span>01</span><div><h2><span class="visually-hidden">Step 1: </span>Sign in</h2><p>Make an account.</p></div><p class="status status--live step__status">Works today</p></li></ol>';
  assert.deepEqual(stepsOf(fixture), [{ n: 1, title: 'Sign in', text: '01 Step 1: Sign in Make an account.', label: 'Works today' }]);
});

test('there are exactly eight steps and each carries one of the three labels', () => {
  const steps = stepsOf(distPage('/how-it-works/').html);
  assert.equal(steps.length, 8);
  for (const s of steps) assert.ok(LABELS.includes(s.label), `step ${s.n} (${s.title}) has the label "${s.label}"`);
  assert.deepEqual(steps.map((s) => s.title), ['Sign in', 'Pair the plugin', 'Ask for a piece', 'Follow the live steps', 'Built from reviewed blocks', 'Every build is checked', 'A short, honest reply', 'Change a piece any time']);
});

test('the block engine is "Being built", and the page says the blocks are not in yet', () => {
  const steps = stepsOf(distPage('/how-it-works/').html);
  const blocks = steps.find((s) => /reviewed (?:building )?blocks/i.test(s.text));
  assert.ok(blocks, 'no step describes the reviewed building blocks');
  assert.equal(blocks.label, 'Being built', 'the block engine is described as working today');
  assert.match(blocks.text, /blocks are not in yet/i);
  assert.match(blocks.text, /is being built to/i);
});

test('sign-in names Google and Discord only as coming, never as available, on every marketing page', () => {
  for (const route of ['/', '/how-it-works/', '/catalog/', '/pricing/', '/blog/', '/blog/what-works-today/']) {
    const text = textOf(distPage(route).html);
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      if (!/\b(?:Google|Discord)\b[^.]{0,40}sign-in|sign[- ]in with (?:Google|Discord)/i.test(sentence)) continue;
      assert.match(sentence, /\b(?:coming|not on the sign-in page|not enabled)\b/i, `${route} describes Google or Discord sign-in without saying it is not there yet: "${sentence}"`);
    }
  }
  const steps = stepsOf(distPage('/how-it-works/').html);
  assert.match(steps[0].text, /Google and Discord sign-in are coming/);
});

test('nothing describes the AI looking at a picture, and no step describes a result', () => {
  const steps = stepsOf(distPage('/how-it-works/').html);
  for (const s of steps) {
    assert.doesNotMatch(s.text, /\b(?:screenshot|screenshots|picture|image|looks at|sees)\b/i, `step ${s.n} (${s.title}) brings pictures into the AI's work`);
    assert.doesNotMatch(s.text, /\b(?:passed|scored|rated)\b|\d\s*\/\s*10/i, `step ${s.n} (${s.title}) states a result`);
  }
});

test('the question and the claims it relies on: the worker has no multiple-choice question, and the page says it is not in the chat yet', () => {
  const worker = join(SITE, '..', 'worker', 'src');
  assert.ok(existsSync(worker), 'apps/worker/src is missing, so the claim cannot be checked against the code');
  const tools = readFileSync(join(worker, 'tools.ts'), 'utf8');
  assert.doesNotMatch(tools, /\bname: '(?:ask_choice|ask_user|ask_question|clarify)'/, 'the worker now has a clarifying-question tool: re-aim step 3 of the page and this test');
  const step3 = stepsOf(distPage('/how-it-works/').html)[2];
  assert.equal(step3.label, 'Partly works today');
  assert.match(step3.text, /That question is not in the chat yet/);
});

test('the pairing step matches the plugin: a six-character code, and the page names how long it lasts only as the docs do', () => {
  const plugin = readFileSync(join(SITE, '..', 'studpilot-plugin', 'src', 'init.server.luau'), 'utf8');
  assert.match(plugin, /six-character/i, 'the plugin no longer asks for a six-character code');
  const step2 = stepsOf(distPage('/how-it-works/').html)[1];
  assert.match(step2.text, /6-character code/);
  const docs = textOf(distPage('/docs/getting-started/').html);
  assert.match(docs, /Codes expire after 10 minutes/, 'the docs no longer say how long a code lasts');
  assert.match(step2.text, /works for 10 minutes/);
});
