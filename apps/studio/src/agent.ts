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
import { systemPrompt } from './prompt.ts';
import { knowledgeTools, studioTools } from './tools.ts';
import { compactHistory, TurnReadCache } from './token-saver.ts';

/** Measured 2026-10-08 (scripts/model-probe.mjs): first token in 1.0s and first tool call in 2.1s, against 3.6s/6.1s for
 * DeepSeek V4 Pro (which then reasoned for 113s) and 9.9s for GLM 5.3 Flash. */
export const DEFAULT_MODEL = '@cf/moonshotai/kimi-k2.7-code';
/** A long request (a whole game screen with its scripts and checks) fits; a loop that never ends does not. */
const MAX_STEPS = 60;

interface ProjectInfo {
  name: string;
  canBuild: boolean;
}

export class StudPilotAgent extends AIChatAgent<Env> {
  maxPersistedMessages = 400;
  /** A second message while one is running waits its turn; a person's words are never dropped. */
  messageConcurrency = 'queue' as const;

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
        onError: (e) => (e instanceof Error ? e.message : 'StudPilot hit an error and stopped.'),
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

          const holds: Holds = { model, pending: [] };
          const workersai = createWorkersAI({
            binding: meteredAi(this.env, holds),
            gateway: { id: this.env.AI_GATEWAY_ID },
          });
          // Token saver: reasoning and tool traffic only for the latest exchange, older words shortened (token-saver.ts).
          const messages = compactHistory(
            pruneMessages({
              messages: await convertToModelMessages(this.messages),
              reasoning: 'before-last-message',
              toolCalls: 'before-last-2-messages',
              emptyMessages: 'remove',
            }),
          );

          const charge = async (usage: LanguageModelUsage) => {
            const cached = usage.inputTokenDetails?.cacheReadTokens ?? 0;
            // The shared budget gets the step's real usage, not its reservation (metering.ts).
            await settleNext(this.env, holds, { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 });
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
            tools: { ...studioTools(this.env, projectId, new TurnReadCache()), ...knowledgeTools(this.env, writer) },
            stopWhen: isStepCount(MAX_STEPS),
            maxOutputTokens: 16_000,
            abortSignal: options?.abortSignal,
            experimental_transform: smoothStream({ chunking: 'word' }),
            onStepFinish: async ({ usage }) => {
              await charge(usage);
            },
            onFinish: async () => {
              await releaseAll(this.env, holds);
            },
            onAbort: async () => {
              await releaseAll(this.env, holds);
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
              onError: (e) => (e instanceof Error ? e.message : 'StudPilot hit an error and stopped.'),
            }),
          );
        },
      }),
    });
  }
}
