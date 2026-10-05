// THE CAPTURE GUARD CAN FAIL: a screenshot of the app is refused when its frame holds a conversation turn, a build result or a failure.
//
// scripts/m2-capture-ui.mjs takes the pictures the site shows (handoff M2, "No fake output": only real product UI in an idle or empty
// state, never output). Its inspection lives in scripts/lib/capture-guard.mjs. A guard that is never shown a violation is a guard that
// reports a clean frame over anything, so this runs the inspection in a real browser against small pages that each break ONE rule, and
// against one that breaks none:
//   - every selector the guard looks for conversation elements by has a fixture that carries exactly it, and is caught;
//   - every kind of picture element is caught, and the composer's own microphone waveform (an empty canvas) is not;
//   - failure text is caught;
//   - the empty workspace of the app (the conversation log holding its "What do you want to build?" empty state) passes.
// And the capture script itself is held to the order that matters: the frame is inspected, with the canary, before it is photographed,
// and the record it writes says the picture holds no result.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { ERROR_TEXT, RESULT_SELECTORS, TURN_SELECTORS, assertIdleFrame, inspectFrame } from '../scripts/lib/capture-guard.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch();
const open = async (body) => {
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><meta charset="utf-8"><body>${body}</body>`);
  return page;
};

// One fixture per selector: a page that carries exactly that element and nothing else the guard looks for.
const TURN_FIXTURES = {
  '[data-turn]': '<div data-turn="user">Build a lobby</div>',
  '[data-turn-text]': '<div data-turn-text="user">Build a lobby</div>',
  '[data-message-id]': '<div data-message-id="m1">Build a lobby</div>',
  '[data-run-state]': '<div data-run-state="done">7 steps</div>',
  '[data-run-steps]': '<ol data-run-steps><li>Inspecting project</li></ol>',
  '[role="log"] [role="article"]': '<div role="log"><div role="article">Build a lobby</div></div>',
};
const RESULT_FIXTURES = {
  img: '<img alt="a built screen" width="4" height="4" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==">',
  picture: '<picture></picture>',
  video: '<video></video>',
  object: '<object data="data:text/html,x"></object>',
  embed: '<embed src="data:text/html,x">',
  iframe: '<iframe srcdoc="x"></iframe>',
  'canvas:not(.pk-voice__wave)': '<canvas width="8" height="8"></canvas>',
};

test('the fixtures cover every selector the guard looks for, so none can be added without a proof that it sees', () => {
  assert.deepEqual(Object.keys(TURN_FIXTURES).sort(), [...TURN_SELECTORS].sort());
  assert.deepEqual(Object.keys(RESULT_FIXTURES).sort(), [...RESULT_SELECTORS].sort());
  assert.ok(TURN_SELECTORS.length >= 5 && RESULT_SELECTORS.length >= 5, 'the guard looks for almost nothing');
});

for (const [selector, html] of Object.entries(TURN_FIXTURES)) {
  test(`a conversation element is caught: ${selector}`, async () => {
    const page = await open(html);
    const found = await inspectFrame(page);
    assert.ok(found.turns.length >= 1, `the guard did not see ${selector}`);
    assert.equal(found.results.length, 0);
    await assert.rejects(() => assertIdleFrame(page, 'fixture'), /not an idle or empty state/);
    await page.close();
  });
}

for (const [selector, html] of Object.entries(RESULT_FIXTURES)) {
  test(`a picture element is caught: ${selector}`, async () => {
    const page = await open(html);
    const found = await inspectFrame(page);
    assert.ok(found.results.length >= 1, `the guard did not see ${selector}`);
    assert.equal(found.turns.length, 0);
    await assert.rejects(() => assertIdleFrame(page, 'fixture'), /picture element/);
    await page.close();
  });
}

test("the composer's own empty microphone waveform is not a result", async () => {
  const page = await open('<canvas class="pk-voice__wave" width="8" height="8"></canvas>');
  assert.deepEqual((await inspectFrame(page)).results, []);
  await page.close();
});

test('failure text is caught: a broken page is not an idle one', async () => {
  for (const text of ['We could not check your access — reload to try again.', 'Something went wrong.', 'Try again', 'Server error 500']) {
    const page = await open(`<p>${text}</p>`);
    const found = await inspectFrame(page);
    assert.ok(found.errors.length >= 1, `the guard did not see "${text}"`);
    await page.close();
  }
  assert.ok(ERROR_TEXT.length >= 5);
});

test('the empty workspace passes: the conversation log holds its empty state, a composer and three ideas', async () => {
  const page = await open(
    '<div role="log" class="gx-thread"><div class="flex size-full"><section role="region" class="start-sheet"><h1>What do you want to build?</h1><p>Describe the change.</p><button>A portal hub</button></section></div></div>' +
      '<textarea placeholder="Describe what to build, change or fix in your place"></textarea><canvas class="pk-voice__wave" width="4" height="4"></canvas><svg aria-hidden="true"></svg>',
  );
  const found = await assertIdleFrame(page, 'fixture');
  assert.deepEqual(found, { turns: [], results: [], errors: [] });
  await page.close();
});

test('a frame that is empty because the page did not load is not mistaken for an idle composer: the script waits for the composer', () => {
  const script = readFileSync(join(ROOT, 'scripts', 'm2-capture-ui.mjs'), 'utf8');
  assert.match(script, /waitForSelector\('textarea'/, 'the capture no longer waits for the composer');
});

test('the capture script inspects the frame before it photographs it, runs the canary, and records that the picture holds no result', () => {
  const script = readFileSync(join(ROOT, 'scripts', 'm2-capture-ui.mjs'), 'utf8');
  const code = script.replace(/\/\/.*$/gm, '');
  const inspect = code.indexOf('assertIdleFrame(page');
  const shoot = code.indexOf('page.screenshot(');
  assert.ok(inspect > 0 && shoot > 0, 'the script no longer inspects or no longer photographs');
  assert.ok(inspect < shoot, 'the script photographs the frame before it has inspected it');
  assert.match(code, /seen\.turns\.length === 0\)\s*fail\(/, 'the canary is gone: the guard is not shown to see turns in the app before it is trusted on the idle page');
  assert.match(code, /linesShownIn\(page, lines\)/, 'the comparison with the lines of the mock conversation is gone');
  assert.match(code, /containsResult: false/, 'the record no longer states that the picture holds no result');
  assert.match(code, /git['"], \['status', '--porcelain'/, 'the script no longer refuses a tree with uncommitted changes in the app');
  assert.match(code, /url\.hostname[\s\S]{0,160}route\.abort\(\)/, 'the script no longer aborts requests that leave the machine');
});

after(async () => {
  await browser.close();
});
