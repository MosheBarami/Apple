/**
 * THE STUDPILOT AGENT (rebuild 2026-10-08, planning/REBUILD-2026-10-08.md).
 *
 * One agent per project, one loop: the model reads the place, plans when the request has parts, loads the skill it
 * needs, searches the docs when unsure, builds through tools, checks its own work, and reports. No planner, builder,
 * reviewer or tester roles and no sub-agents (Anthropic, "Building effective agents": start with the simple loop).
 * `AIChatAgent` keeps the conversation in this Durable Object's SQLite and streams every token, reasoning delta and tool
 * step to the browser over a WebSocket that resumes after a reload (Cloudflare chat-agents docs).
 */
import { AIChatAgent } from '@cloudflare/ai-chat';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  pruneMessages,
  smoothStream,
  streamText,
  type LanguageModelUsage,
} from 'ai';
import { createWorkersAI } from 'workers-ai-provider';
import { type Holds, meteredAi, releaseAll, settleNext } from './metering.ts';
import { dumpStorage } from './legacy.ts';
import { systemPrompt } from './prompt.ts';
import { knowledgeTools, studioTools } from './tools.ts';
import { compactHistory, TurnReadCache, repairToolInput } from './token-saver.ts';
import { openUiDefects, stopNote, terminalReason } from './terminal.ts';
import { withEvidence } from './evidence.ts';

/** Measured 2026-10-08 (scripts/model-probe.mjs): first token in 1.0s and first tool call in 2.1s, against 3.6s/6.1s for
 * DeepSeek V4 Pro (which then reasoned for 113s) and 9.9s for GLM 5.3 Flash. */
export const DEFAULT_MODEL = '@cf/moonshotai/kimi-k2.7-code';
/** A long request (a whole game screen with its scripts and checks) fits; a loop that never ends does not. */
const MAX_STEPS = 60;

/**
 * What the person sees when a step fails. Errors from the model binding and over RPC are not always Error instances in
 * this isolate, and showing a generic line for them hid every real cause (owner, 2026-10-09), so any shape is read.
 */
export function describeError(e: unknown): string {
  const o = e as { message?: unknown; error?: unknown; cause?: unknown; name?: unknown } | null;
  const text =
    typeof e === 'string' ? e
      : o && typeof o.message === 'string' && o.message ? o.message
        : o && typeof o.error === 'string' ? o.error
          : o && o.cause ? describeError(o.cause)
            : (() => { try { return JSON.stringify(e); } catch { return String(e); } })();
  console.error('StudPilot agent error:', text, o && typeof o.name === 'string' ? o.name : typeof e);
  return text && text !== '{}' ? text.slice(0, 600) : 'StudPilot hit an error it could not describe and stopped.';
}

interface ProjectInfo {
  name: string;
  canBuild: boolean;
}

export class StudPilotAgent extends AIChatAgent<Env> {
  maxPersistedMessages = 400;
  /** A second message while one is running waits its turn; a person's words are never dropped. */
  messageConcurrency = 'queue' as const;

  /** The whole stored conversation, for the operator's admin export (server.ts /studio/api/admin/history). */
  async exportHistory(): Promise<{ project: ProjectInfo | null; messages: unknown[]; lastBadToolInput: unknown; lastTerminal: unknown; lastImageInput: unknown }> {
    return {
      project: (await this.ctx.storage.get<ProjectInfo>('project')) ?? null,
      messages: this.messages,
      lastTerminal: (await this.ctx.storage.get('lastTerminal')) ?? null,
      lastImageInput: (await this.ctx.storage.get('lastImageInput')) ?? null,
      lastBadToolInput: (await this.ctx.storage.get('lastBadToolInput')) ?? null,
    };
  }

  /** The raw storage (every table), for the operator's export by object id (server.ts). */
  async dumpStorage() {
    return dumpStorage(this.ctx.storage);
  }

  /** Called by the router after the owner check: the project's name and whether its owner may build. */
  async setProject(info: ProjectInfo): Promise<void> {
    await this.ctx.storage.put('project', info);
  }

  async onChatMessage(_onFinish: unknown, options?: { abortSignal?: AbortSignal }) {
    const projectId = this.name;
    const model = this.env.AGENT_MODEL || DEFAULT_MODEL;
    const project = (await this.ctx.storage.get<ProjectInfo>('project')) ?? { name: 'this project', canBuild: false };

    return createUIMessageStreamResponse({
      stream: createUIMessageStream({
        onError: describeError,
        execute: async ({ writer }) => {
          if (!project.canBuild) {
            writer.write({ type: 'error', errorText: 'StudPilot is in private pre-launch: building is open to approved accounts only.' });
            return;
          }
          const spend = await this.env.GATE.canSpend(projectId);
          if (!spend.ok) {
            writer.write({ type: 'error', errorText: spend.message });
            return;
          }
          const status = await this.env.GATE.projectStatus(projectId).catch(() => null);
          if (status?.credits) writer.write({ type: 'data-credits', data: status.credits, transient: true });

          const holds: Holds = { pending: [] };
          // Tags this turn's Studio ops, so a stop discards the ones Studio has not collected yet.
          const turnId = crypto.randomUUID();
          let stepsDone = 0;
          // Pictures from render_view, waiting for the next step (evidence.ts).
          const seen: EvidenceImage[] = [];
          const workersai = createWorkersAI({
            binding: meteredAi(this.env, holds),
            gateway: { id: this.env.AI_GATEWAY_ID },
          });
          // Token saver: reasoning only for the latest exchange; earlier turns keep their tool calls and results, shortened
          // (token-saver.ts), so the agent remembers what it built.
          const messages = compactHistory(
            pruneMessages({
              messages: await convertToModelMessages(this.messages),
              reasoning: 'before-last-message',
              emptyMessages: 'remove',
            }),
          );

          const charge = async (usage: LanguageModelUsage) => {
            const cached = usage.inputTokenDetails?.cacheReadTokens ?? 0;
            // The shared budget gets the step's real usage, not its reservation (metering.ts).
            await settleNext(this.env, holds, { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0, cachedInputTokens: cached });
            await this.env.GATE.chargeUsage(projectId, model, {
              inputTokens: usage.inputTokens ?? 0,
              outputTokens: usage.outputTokens ?? 0,
              cachedInputTokens: cached,
            }).catch(() => undefined);
            const now = await this.env.GATE.projectStatus(projectId).catch(() => null);
            if (now?.credits) writer.write({ type: 'data-credits', data: now.credits, transient: true });
          };

          const result = streamText({
            // Same project, same prefix: the session key lets the prompt cache serve the repeated context at the cached rate.
            model: workersai(model, { reasoning_effort: 'low', sessionAffinity: projectId }),
            system: systemPrompt({ projectName: project.name, studio: status?.studio ?? null }),
            messages,
            tools: { ...studioTools(this.env, projectId, new TurnReadCache(), turnId, (images) => seen.push(...images)), ...knowledgeTools(this.env, writer) },
            prepareStep: async ({ messages }) => {
              const fresh = seen.splice(0);
              const next = withEvidence(messages, fresh);
              // Proof for the operator's export that pixels went to the model, and how many bytes.
              if (fresh.length) {
                await this.ctx.storage.put('lastImageInput', { at: new Date().toISOString(), model, images: fresh.map((i) => ({ label: i.label, width: i.width, height: i.height, pngBytes: Math.floor((i.base64.length * 3) / 4) })) }).catch(() => undefined);
              }
              return next ? { messages: next } : undefined;
            },
            stopWhen: isStepCount(MAX_STEPS),
            experimental_repairToolCall: async (args) => {
              const repaired = await repairToolInput(args);
              // Kept whole for the operator's export: the error the model sees is cut to 600 characters, which hid what broke.
              if (!repaired) {
                await this.ctx.storage.put('lastBadToolInput', { at: new Date().toISOString(), tool: args.toolCall.toolName, text: args.toolCall.input.slice(0, 120_000) }).catch(() => undefined);
              }
              return repaired;
            },
            maxOutputTokens: 16_000,
            abortSignal: options?.abortSignal,
            experimental_transform: smoothStream({ chunking: 'word' }),
            onStepFinish: async ({ usage }) => {
              await charge(usage);
              stepsDone += 1;
            },
            onFinish: async () => {
              await releaseAll(this.env, holds);
            },
            onAbort: async () => {
              await releaseAll(this.env, holds);
              const { dropped } = await this.env.GATE.cancelTurn(projectId, turnId).catch(() => ({ dropped: 0 }));
              await this.ctx.storage.put('lastTerminal', { at: new Date().toISOString(), reason: 'cancelled', steps: stepsDone, droppedOps: dropped }).catch(() => undefined);
            },
            onError: async () => {
              await releaseAll(this.env, holds);
            },
          });
          writer.merge(
            result.toUIMessageStream({
              sendReasoning: true,
              sendSources: true,
              // The person sees why a turn stopped (a spending limit, a model failure), not a silent end.
              onError: describeError,
            }),
          );
          // The turn's end, recorded and, unless it simply finished, said. An error already reached the person through
          // onError, so a rejected result is not described twice.
          const ended = await Promise.all([result.finishReason, result.steps]).catch(() => null);
          if (ended) {
            const [finishReason, steps] = ended;
            const openDefects = openUiDefects(steps);
            const reason = terminalReason(finishReason, steps.length, MAX_STEPS, openDefects);
            await this.ctx.storage.put('lastTerminal', { at: new Date().toISOString(), reason, finishReason, steps: steps.length, openDefects }).catch(() => undefined);
            const note = stopNote(reason, steps.length, openDefects);
            if (note) writer.write({ type: 'data-stop', data: { reason, steps: steps.length, note } });
          }
        },
      }),
    });
  }
}
