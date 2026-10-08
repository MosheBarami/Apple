import assert from "node:assert/strict";
import { test } from "node:test";
import { guardModelStream } from "../src/model-stream.ts";

const sse = (frames, split = 7) => {
  const bytes = new TextEncoder().encode(
    frames.map((f) => `data: ${JSON.stringify(f)}\r\n\r\n`).join("") +
      "data: [DONE]\r\n\r\n"
  );
  return new Response(
    new ReadableStream({
      start(c) {
        for (let i = 0; i < bytes.length; i += split)
          c.enqueue(bytes.slice(i, i + split));
        c.close();
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "cf-aig-log-id": "fixture-log",
      },
    }
  );
};
const chunk = (delta, finish_reason = null) => ({
  choices: [{ delta, finish_reason }],
});

test("a complete UTF-8 answer is unchanged across arbitrary byte boundaries", async () => {
  const r = sse([chunk({ content: "An island 🌴" }), chunk({}, "stop")], 1);
  const source = await r.clone().text();
  const guarded = guardModelStream(r);
  assert.equal(guarded.headers.get("cf-aig-log-id"), "fixture-log");
  assert.equal(await guarded.text(), source);
});
test("a completed tool response may have no answer text", async () => {
  const r = sse([
    chunk({
      tool_calls: [
        {
          index: 0,
          id: "fixture",
          function: { name: "build_blocks", arguments: "{}" },
        },
      ],
    }),
    chunk({}, "tool_calls"),
  ]);
  await assert.doesNotReject(() => guardModelStream(r).text());
});
test("output exhaustion rejects even when partial answer text was emitted", async () => {
  await assert.rejects(
    () =>
      guardModelStream(
        sse([
          chunk({ content: "Let me inspect the parameters for" }),
          chunk({}, "length"),
        ])
      ).text(),
    /response limit/
  );
});
test("a reasoning-only completion cannot become an empty successful delegate", async () => {
  await assert.rejects(
    () =>
      guardModelStream(
        sse([chunk({ reasoning_content: "Planning only" }), chunk({}, "stop")])
      ).text(),
    /no answer or tool call/
  );
});
test("ordinary JSON responses pass through", async () => {
  const r = Response.json({ response: "complete" });
  assert.equal(guardModelStream(r), r);
});
