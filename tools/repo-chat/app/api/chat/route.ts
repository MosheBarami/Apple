import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { modelId } from "@/lib/config";
import { guard } from "@/lib/guard";
import { systemPrompt } from "@/lib/prompt";
import { redact } from "@/lib/safety";
import { makeTools, type SourceRef } from "@/lib/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_STEPS = 25;
const MAX_MESSAGES = 60;

/**
 * Earlier turns are replayed as their final answers only (text parts). Their tool calls, tool
 * output and reasoning were evidence for that turn; replaying them would resend up to megabytes
 * per question. The current turn keeps everything, so the multi-step loop sees its own results.
 */
function compactHistory(messages: UIMessage[]): UIMessage[] {
  let lastUser = -1;
  messages.forEach((m, i) => {
    if (m.role === "user") lastUser = i;
  });
  return messages
    .map((m, i) => {
      if (i >= lastUser || m.role !== "assistant") return m;
      return { ...m, parts: m.parts.filter((p) => p.type === "text") };
    })
    .filter((m) => m.parts.length > 0);
}

function label(s: SourceRef): string {
  if (s.kind === "git") return s.path;
  if (s.startLine && s.endLine && s.endLine !== s.startLine) return `${s.path}:${s.startLine}-${s.endLine}`;
  if (s.startLine) return `${s.path}:${s.startLine}`;
  return s.path;
}

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return Response.json({ error: "OPENROUTER_API_KEY is not set (see .env.example)" }, { status: 500 });

  let messages: UIMessage[];
  try {
    const body = (await req.json()) as { messages?: UIMessage[] };
    if (!Array.isArray(body.messages) || body.messages.length === 0) throw new Error("messages must be a non-empty array");
    if (body.messages.length > MAX_MESSAGES * 2) throw new Error("conversation too long; start a new chat");
    messages = body.messages;
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }

  const openrouter = createOpenRouter({ apiKey });
  const model = openrouter(modelId());

  const stream = createUIMessageStream({
    onError: (e) => redact(e instanceof Error ? e.message : "error"),
    execute: async ({ writer }) => {
      const seen = new Set<string>();
      const onSource = (s: SourceRef) => {
        const title = label(s);
        if (seen.has(title)) return;
        seen.add(title);
        writer.write({ type: "source-document", sourceId: `src-${seen.size}`, mediaType: "text/plain", title, filename: s.path });
      };

      const base = systemPrompt();
      const result = streamText({
        model,
        instructions: base,
        messages: await convertToModelMessages(compactHistory(messages), { ignoreIncompleteToolCalls: true }),
        tools: makeTools(onSource),
        stopWhen: stepCountIs(MAX_STEPS),
        // The loop hard-stops at MAX_STEPS. Warn the model near the end, and on the last step
        // turn tools off so it always writes an answer from what it has gathered.
        prepareStep: ({ stepNumber }) => {
          if (stepNumber >= MAX_STEPS - 1) {
            return {
              toolChoice: "none" as const,
              instructions: `${base}\n\nTOOL BUDGET EXHAUSTED: you cannot call any more tools. Write the final answer now from the tool results above. Cite path:line only for lines you saw. Say plainly what you could not verify.`,
            };
          }
          if (stepNumber === MAX_STEPS - 5) {
            return { instructions: `${base}\n\nBUDGET WARNING: only 4 tool steps remain. Stop exploring; make at most one more round of tool calls, then write the final answer.` };
          }
          return undefined;
        },
        abortSignal: req.signal,
        providerOptions: { openrouter: { reasoning: { effort: "medium" } } },
      });

      writer.merge(
        toUIMessageStream({
          stream: result.stream,
          sendReasoning: true,
          sendSources: true,
          onError: (e) => redact(e instanceof Error ? e.message : "error"),
        }),
      );
    },
  });

  return createUIMessageStreamResponse({ stream });
}
