// Scroll behaviour of the project chat during a fake stream (the /dev/app harness, next dev only): scrolling the
// conversation up stops it following new output, and an open Thinking panel stays where the reader put it.
// Run: next dev, then STUDPILOT_WWW_URL=http://localhost:3000 node tests/app-chat.browser.cjs
const { chromium } = require("@playwright/test");
const assert = require("node:assert");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 480, height: 640 } });
  await page.goto((process.env.STUDPILOT_WWW_URL ?? "http://localhost:3000") + "/dev/app?view=chat&phase=play", { waitUntil: "networkidle" });

  // 2. Thinking panel: wait until it overflows, scroll it up, check it stays while more text streams in.
  const panel = page.locator('[data-testid="reasoning-scroll"]');
  await panel.waitFor();
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="reasoning-scroll"]');
    return el && el.scrollHeight > el.clientHeight + 40;
  }, null, { timeout: 30000 });
  await panel.hover();
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(150);
  const inner0 = await panel.evaluate((el) => ({ top: el.scrollTop, h: el.scrollHeight }));
  await page.waitForTimeout(1500);
  const inner1 = await panel.evaluate((el) => ({ top: el.scrollTop, h: el.scrollHeight }));
  console.log("thinking panel", inner0, inner1);
  assert.ok(inner1.h > inner0.h, "reasoning kept streaming");
  assert.strictEqual(inner1.top, inner0.top, "Thinking panel did not move while the reader was scrolled up");

  // 1. Conversation: wait until it overflows, scroll up, check it does not follow new output.
  const scroller = page.locator('[data-testid="conversation"] > div:first-child');
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="conversation"] > div:first-child');
    return el && el.scrollHeight > el.clientHeight + 150;
  }, null, { timeout: 60000 });
  const box = await scroller.boundingBox();
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(300);
  const outer0 = await scroller.evaluate((el) => ({ top: el.scrollTop, h: el.scrollHeight }));
  await page.locator('[data-testid="jump-to-latest"]').waitFor({ timeout: 3000 });
  await page.waitForTimeout(2500);
  const outer1 = await scroller.evaluate((el) => ({ top: el.scrollTop, h: el.scrollHeight }));
  console.log("conversation", outer0, outer1);
  assert.ok(outer1.h > outer0.h, "the stream kept growing the conversation");
  assert.strictEqual(outer1.top, outer0.top, "conversation did not yank the reader down");

  // Jump to latest brings them back and following resumes.
  await page.click('[data-testid="jump-to-latest"]');
  await page.waitForTimeout(1200);
  const atBottom = await scroller.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight < 4);
  assert.ok(atBottom, "jump to latest returned to the bottom");

  // When the turn ends, the process folds into one line.
  await page.waitForSelector('[data-testid="sources"]', { timeout: 60000 });
  const summary = await page.locator('[data-testid="work-summary"]').getAttribute("aria-expanded");
  assert.strictEqual(summary, "false", "process auto-collapsed after the turn");
  console.log("summary:", await page.locator('[data-testid="work-summary"]').innerText());
  console.log("PASS");
  await browser.close();
})().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});
