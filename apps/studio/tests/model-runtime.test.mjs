import { registerHooks } from "node:module";
import assert from "node:assert/strict";
import { test } from "node:test";
const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const calls = [];
const tools = [];
let exhausted = false;
globalThis.studpilotTestBindings = {
  GATE: {
    reserveModel: async () => ({ ok: true, reserved: 1 }),
    settleModel: async () => {},
    releaseModel: async () => {},
    chargeUsage: async () => {},
    callTool: async (id, name, args) => {
      tools.push({ id, name, args });
      return { ok: true, text: "Created fixture window" };
    },
  },
  AI: {
    run: async (model, inputs, options) => {
      calls.push({ model, inputs, options });
      const index = calls.length;
      let delta, finish;
      if (index === 1) {
        delta = {
          tool_calls: [
            {
              index: 0,
              id: "call_delegate",
              type: "function",
              function: {
                name: "task",
                arguments: JSON.stringify({
                  agent: "builder",
                  description: "Build a window",
                  prompt:
                    "Build a shop window with build_blocks and return a summary.",
                }),
              },
            },
          ],
        };
        finish = "tool_calls";
      } else if (index === 2 && exhausted) {
        delta = { reasoning_content: "Thinking without reaching a tool" };
        finish = "length";
      } else if (index === 2) {
        delta = {
          tool_calls: [
            {
              index: 0,
              id: "call_build",
              type: "function",
              function: {
                name: "build_blocks",
                arguments: JSON.stringify({
                  blocks: ["window"],
                  params: {
                    window: { screen: "TestShop", title: "Test shop" },
                  },
                }),
              },
            },
          ],
        };
        finish = "tool_calls";
      } else {
        delta = {
          content:
            index === 3
              ? "Created the test window."
              : "The builder created the test window.",
        };
        finish = "stop";
      }
      const chunks = [
        {
          id: `reply-${index}`,
          choices: [{ index: 0, delta, finish_reason: null }],
        },
        {
          choices: [{ index: 0, delta: {}, finish_reason: finish }],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 20,
            total_tokens: 120,
          },
        },
      ];
      return new Response(
        chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") +
          "data: [DONE]\n\n",
        { headers: { "Content-Type": "text/event-stream" } }
      );
    },
  },
  AI_GATEWAY_ID: "test",
};
registerHooks({
  resolve(specifier, ctx, next) {
    if (specifier === "cloudflare:workers")
      return { url: "test:cloudflare-workers", shortCircuit: true };
    return next(specifier, ctx);
  },
  load(url, ctx, next) {
    if (url === "test:cloudflare-workers")
      return {
        format: "module",
        source: "export const env=globalThis.studpilotTestBindings;",
        shortCircuit: true,
      };
    return next(url, ctx);
  },
});
const { StudPilot } = await import(root + "/src/agents/studpilot.ts");
await import(root + "/src/app.ts");
const { start } = await import(
  root + "/node_modules/@flue/runtime/dist/node/index.mjs"
);
const { init } = await import(
  root + "/node_modules/@flue/runtime/dist/index.mjs"
);
test("the real coordinator and builder provider requests use low reasoning with bounded output", async () => {
  const runtime = await start({ agents: [StudPilot], providers: [] });
  try {
    const agent = init(StudPilot, {
      id: "00000000-0000-4000-8000-000000000001",
    });
    const receipt = await agent.dispatch("Build a shop window");
    const reply = await agent.read(receipt, {
      signal: AbortSignal.timeout(20000),
    });
    assert.match(reply.text, /builder created/);
    assert.deepEqual(
      tools.map((t) => t.name),
      ["build_blocks"]
    );
    assert.equal(calls.length, 4);
    assert.ok(calls.every(c => c.options?.extraHeaders?.['cf-aig-request-timeout'] === '60000'));
    assert.ok(
      calls.every((c) => c.inputs.reasoning_effort === "low"),
      `Actual efforts: ${calls.map((c) => c.inputs.reasoning_effort)}`
    );
    assert.ok(
      calls.every(
        (c) => (c.inputs.max_tokens ?? c.inputs.max_completion_tokens) <= 6500
      )
    );
  } finally {
    await runtime.stop();
  }
});

test("a token-exhausted builder is a failed task, never an empty successful completion", async () => {
  calls.length = 0;
  tools.length = 0;
  exhausted = true;
  const runtime = await start({ agents: [StudPilot], providers: [] });
  try {
    const id = "00000000-0000-4000-8000-000000000002";
    const agent = init(StudPilot, { id });
    const receipt = await agent.dispatch("Build a shop window");
    await agent.read(receipt, { signal: AbortSignal.timeout(20000) });
    const { createAgentRouter } = await import(
      root + "/node_modules/@flue/runtime/dist/routing.mjs"
    );
    const snapshot = await (
      await createAgentRouter(StudPilot).request("/" + id)
    ).json();
    const task = snapshot.messages
      .flatMap((m) => m.parts)
      .find((p) => p.type === "dynamic-tool" && p.toolName === "task");
    assert.equal(task.state, "output-error");
    assert.match(task.errorText ?? JSON.stringify(task), /response limit/i);
    assert.equal(
      tools.length,
      0,
      "an incomplete tool call must not reach Studio"
    );
  } finally {
    await runtime.stop();
  }
});
