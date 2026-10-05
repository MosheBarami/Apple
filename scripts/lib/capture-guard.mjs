// WHAT MAY BE IN A SCREENSHOT OF THE APP, AND THE CHECK THAT REFUSES THE REST.
//
// Handoff M2, "No fake output": the site shows no build result that did not really happen. The only pictures it may hold are
// real product UI (the web app, the plugin in Studio) in an IDLE or EMPTY state: a composer waiting for a request, a dialog
// before anything is paired. A conversation turn, a step list of a run, a render, a playtest card or a checkpoint is the
// product's OUTPUT, and the app's mock mode (the only way to run the app signed in without an account) is full of it: the
// scripted session carries a finished build, a live run and a set of renders.
//
// So a capture is allowed only when its frame is inspected first. This module is the inspection, in one place, so the
// capture script (scripts/m2-capture-ui.mjs) and the test that proves the inspection can fail
// (tests/m2-capture-guard.test.mjs) read the same selectors.
//
// THE THREE THINGS THAT FAIL A FRAME
//   turns    any element the app marks as part of a conversation: a message, a turn, a run's steps, an article inside the
//            conversation log. Looked for whether or not it is on screen: a turn that is merely scrolled away is still a turn.
//            (The log's own children are NOT all turns: the empty state, "What do you want to build?", lives inside it.)
//   results  any picture, video or canvas (the app draws a render, a playtest frame or a built screen as one of these). The
//            composer's own microphone waveform is a canvas and is named below as the one exception.
//   errors   text that says the page is in a failed state ("We could not check your access"). A broken capture is not an
//            idle state, and the failure is more convincing than the check that should have caught it.
//
// Not a test file: loaded by the capture script and by the guard's own test.

/** Elements the app uses for a conversation. Read from the DOM of the app's mock conversation (see the canary in the script). */
export const TURN_SELECTORS = [
  '[data-turn]',
  '[data-turn-text]',
  '[data-message-id]',
  '[data-run-state]',
  '[data-run-steps]',
  '[role="log"] [role="article"]',
];

/** Elements that carry a picture of something. `canvas.pk-voice__wave` is the composer's microphone waveform, drawn empty. */
export const RESULT_SELECTORS = ['img', 'picture', 'video', 'object', 'embed', 'iframe', 'canvas:not(.pk-voice__wave)'];

/** Text that means the page is failing, not waiting. */
export const ERROR_TEXT = [/\bcould not\b/i, /\bcouldn.t\b/i, /\bunavailable\b/i, /\btry again\b/i, /\bsomething went wrong\b/i, /\berror\b/i, /\breload to\b/i];

/**
 * What is in the frame that must not be. Runs in the page, so it sees what the browser built, not what the source says.
 * Returns { turns, results, errors }, each a list of short descriptions; all three empty is an idle frame.
 */
export async function inspectFrame(page, { turnSelectors = TURN_SELECTORS, resultSelectors = RESULT_SELECTORS, errorText = ERROR_TEXT } = {}) {
  return page.evaluate(
    ({ turnSelectors, resultSelectors, errorSources }) => {
      const describe = (el) => {
        const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
        return `<${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}>`;
      };
      const found = (selectors) => {
        const out = [];
        for (const s of selectors) for (const el of document.querySelectorAll(s)) out.push(`${describe(el)} (${s})`);
        return out;
      };
      const text = document.body ? document.body.innerText : '';
      const errors = [];
      for (const src of errorSources) {
        const m = new RegExp(src.source, src.flags).exec(text);
        if (m) errors.push(`"${text.slice(Math.max(0, m.index - 20), m.index + m[0].length + 30).replace(/\s+/g, ' ').trim()}"`);
      }
      return { turns: found(turnSelectors), results: found(resultSelectors), errors };
    },
    { turnSelectors, resultSelectors, errorSources: errorText.map((r) => ({ source: r.source, flags: r.flags })) },
  );
}

/** The frame holds nothing that is output. Throws a message naming what it found. */
export async function assertIdleFrame(page, label, options) {
  const found = await inspectFrame(page, options);
  const problems = [];
  if (found.turns.length) problems.push(`${found.turns.length} conversation element(s): ${found.turns.slice(0, 4).join(', ')}`);
  if (found.results.length) problems.push(`${found.results.length} picture element(s): ${found.results.slice(0, 4).join(', ')}`);
  if (found.errors.length) problems.push(`failure text: ${found.errors.slice(0, 3).join('; ')}`);
  if (problems.length) throw new Error(`${label}: the frame is not an idle or empty state, so it is not captured. ${problems.join('. ')}.`);
  return found;
}

/**
 * The lines of text a conversation page shows inside its log, for the second check: no line the app prints as part of a
 * conversation may appear anywhere in the idle frame. Derived from the app, never typed here.
 */
export async function conversationLines(page) {
  return page.evaluate(() => {
    const log = document.querySelector('[role="log"]');
    if (!log) return [];
    return log.innerText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length >= 12);
  });
}

/** Lines of `lines` that also appear in the page's text. */
export async function linesShownIn(page, lines) {
  return page.evaluate((lines) => {
    const text = document.body ? document.body.innerText : '';
    return lines.filter((l) => text.includes(l));
  }, lines);
}
