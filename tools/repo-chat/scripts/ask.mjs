#!/usr/bin/env node
// Ask one question of a running repo-chat server and summarise the streamed result:
//   node scripts/ask.mjs "Where is the agent's tool registry?" [--raw out.sse]
// Prints tool calls (name + input), whether reasoning streamed, the sources, and the final answer.
// It never prints request headers or environment values.
import fs from "node:fs";

const args = process.argv.slice(2);
const rawIdx = args.indexOf("--raw");
const rawOut = rawIdx >= 0 ? args.splice(rawIdx, 2)[1] : null;
const question = args.join(" ").trim();
if (!question) {
  console.error('usage: node scripts/ask.mjs "question" [--raw out.sse]');
  process.exit(2);
}
const base = process.env.REPO_CHAT_URL || "http://127.0.0.1:4790";
const res = await fetch(`${base}/api/chat`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: question }] }] }),
});
if (!res.ok || !res.body) {
  console.error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
const raw = await res.text();
if (rawOut) fs.writeFileSync(rawOut, raw);

const tools = new Map();
const sources = [];
let text = "";
let reasoning = 0;
let steps = 0;
let error = null;
for (const line of raw.split("\n")) {
  if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
  let c;
  try {
    c = JSON.parse(line.slice(6));
  } catch {
    continue;
  }
  if (c.type === "text-delta") text += c.delta;
  else if (c.type === "reasoning-delta") reasoning += c.delta.length;
  else if (c.type === "start-step") steps++;
  else if (c.type === "tool-input-available") tools.set(c.toolCallId, { name: c.toolName, input: c.input, state: "called" });
  else if (c.type === "tool-output-available") tools.get(c.toolCallId) && (tools.get(c.toolCallId).state = "output");
  else if (c.type === "tool-output-error") tools.get(c.toolCallId) && (tools.get(c.toolCallId).state = "error: " + c.errorText);
  else if (c.type === "source-document") sources.push(c.title);
  else if (c.type === "error") error = c.errorText;
}
console.log(`QUESTION: ${question}`);
console.log(`steps=${steps} tool_calls=${tools.size} reasoning_chars=${reasoning} sources=${sources.length}${error ? " ERROR=" + error : ""}`);
for (const t of tools.values()) console.log(`  tool ${t.name} ${JSON.stringify(t.input).slice(0, 160)} -> ${t.state}`);
if (sources.length) console.log(`SOURCES: ${sources.slice(0, 20).join(" | ")}`);
console.log(`ANSWER:\n${text.trim()}`);
