// The current Flue Studio agent uses an OpenAI-shaped binding at its model boundary.
// This bridge keeps its executor intact while dispatching through the existing private gateway.
import type { GatewayMessage, GatewayRequest, GatewayResponse, InferenceTask, RoutingDecision } from '@studpilot/shared';
import { ENGINE_RELEASE } from '@studpilot/shared';
import type { Env } from './env';
import { chat } from './gateway';
import { pinRunInference, type PinnedInference } from './inference-runs';

const TTL = 3600;
const runKey = (owner: string, project: string, run: string) => `ai:studio-run:${owner}:${project}:${run}`;
const validRef = (value: string) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
export interface StudioInferenceStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  create(key: string, value: string): Promise<string>;
  update(key: string, transform: (value: string) => string): Promise<void>;
}
interface StudioInferenceState {
  owner: string; project: string; run: string; createdAt: number;
  pinned: PinnedInference; decisions: RoutingDecision[];
  admissionHash?: string;
  usage: { inputTokens: number; outputTokens: number; platformNeurons: number };
  replay: { messageKey: string; value: NonNullable<GatewayResponse['providerReplay']> }[];
}
const replayMessageKey = (text: GatewayMessage['content'], calls: NonNullable<GatewayMessage['toolCalls']>) => JSON.stringify({ text,
  calls: calls.map((call) => [call.id, call.name, JSON.parse(call.arguments)]) });

export async function prepareStudioInference(env: Env, store: StudioInferenceStore, owner: string, project: string, selection: unknown,
  identity?: { conversation: string; requestKey: string; inputHash: string }) {
  if (env.AI_STUDIO_ROUTES_ENABLED !== 'true') throw new Error('AI route integration for the current Studio agent is not enabled.');
  if (!validRef(project)) throw new Error('Invalid Studio project reference.');
  let run = crypto.randomUUID();
  if (identity) {
    if (!identity.conversation.startsWith(project) || !/^[0-9a-f-]{36}(?:~[a-z0-9][a-z0-9-]{0,47})?$/.test(identity.conversation)
      || typeof identity.requestKey !== 'string' || !identity.requestKey
      || identity.requestKey.length > 200 || !/^[0-9a-f]{64}$/.test(identity.inputHash)) throw new Error('Invalid admission identity.');
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([owner, project, identity.conversation, identity.requestKey])));
    const hex = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    run = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }
  const pinned = await pinRunInference(env, owner, selection, project);
  if (pinned.selection.route === 'studpilot') throw new Error('The managed Studio engine keeps its existing admission and billing path.');
  const state: StudioInferenceState = { owner, project, run, createdAt: Date.now(), pinned, decisions: [],
    ...(identity ? { admissionHash: identity.inputHash } : {}),
    usage: { inputTokens: 0, outputTokens: 0, platformNeurons: 0 }, replay: [] };
  const serialized = JSON.stringify(state);
  if (serialized.length > 450000) throw new Error('Narrow the allowed connections before starting this Studio run.');
  const stored = JSON.parse(await store.create(runKey(owner, project, run), serialized)) as StudioInferenceState;
  if (stored.owner !== owner || stored.project !== project || stored.admissionHash !== state.admissionHash) {
    throw new Error('A repeated request changed its input or AI route. Start a new request.');
  }
  if (Date.now() - stored.createdAt > TTL * 1000) throw new Error('This admission expired. Start a new request.');
  return { runRef: run, selection: stored.pinned.selection, engineVersion: stored.pinned.engineVersion,
    policyVersion: stored.pinned.policyVersion };
}

async function stateFor(store: StudioInferenceStore, owner: string, project: string, run: string): Promise<StudioInferenceState> {
  if (!owner || !validRef(project) || !validRef(run)) throw new Error('Invalid Studio inference identity.');
  const text = await store.get(runKey(owner, project, run));
  if (!text) throw new Error('This Studio inference run expired or is no longer available to your account.');
  const state = JSON.parse(text) as StudioInferenceState;
  if (state.owner !== owner || state.project !== project || state.run !== run || state.pinned.actorId !== owner
    || state.pinned.projectId !== project || Date.now() - state.createdAt > TTL * 1000) throw new Error('Studio inference ownership does not match.');
  return state;
}

export function flueGatewayRequest(raw: Record<string, any>): GatewayRequest {
  if (!Array.isArray(raw.messages) || !raw.messages.length || raw.messages.length > 1000) throw new Error('Invalid Studio model messages.');
  const messages: GatewayMessage[] = raw.messages.map((message: any) => {
    if (!message || !['system', 'user', 'assistant', 'tool'].includes(message.role)) throw new Error('Invalid Studio message role.');
    let content = message.content;
    if (Array.isArray(content)) {
      if (content.some((part) => part?.type !== 'text' || typeof part.text !== 'string')) throw new Error('Image and binary input is not enabled in StudPilot.');
      content = content.map((part) => part.text).join('\n');
    }
    if (content === null && message.role === 'assistant') content = '';
    if (typeof content !== 'string') throw new Error('Invalid Studio message text.');
    const toolCalls = message.tool_calls?.map((call: any) => {
      if (typeof call?.id !== 'string' || typeof call?.function?.name !== 'string' || typeof call?.function?.arguments !== 'string') {
        throw new Error('Invalid Studio tool call.');
      }
      return { id: call.id, name: call.function.name, arguments: call.function.arguments };
    });
    return { role: message.role, content, ...(toolCalls?.length ? { toolCalls } : {}),
      ...(message.role === 'tool' ? { toolCallId: message.tool_call_id } : {}) };
  });
  const tools = raw.tools?.map((tool: any) => {
    if (tool?.type !== 'function' || typeof tool.function?.name !== 'string' || !tool.function.parameters
      || typeof tool.function.parameters !== 'object') throw new Error('Invalid Studio tool schema.');
    return { name: tool.function.name, description: typeof tool.function.description === 'string' ? tool.function.description : '',
      parameters: tool.function.parameters };
  });
  const output = raw.max_completion_tokens ?? raw.max_tokens ?? ENGINE_RELEASE.configuration.maxTokens;
  if (!Number.isInteger(output) || output < 1) throw new Error('Invalid Studio output budget.');
  return { model: 'agent', messages, ...(tools?.length ? { tools } : {}), maxTokens: Math.min(output, 6500),
    temperature: ENGINE_RELEASE.configuration.temperature };
}

/** Complete verified output is framed for Flue; no internal provider thought or key enters this stream. */
export function flueCompletionStream(result: GatewayResponse): Response {
  if (!['stop', 'tool_calls'].includes(result.finishReason)) throw new Error('The selected model did not finish its Studio response.');
  const delta = { role: 'assistant', content: result.text, ...(result.toolCalls.length ? { tool_calls: result.toolCalls.map((call, index) => ({
    index, id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } })) } : {}) };
  const event = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
  return new Response(event({ choices: [{ index: 0, delta, finish_reason: null }] })
    + event({ choices: [{ index: 0, delta: {}, finish_reason: result.finishReason }],
      usage: { prompt_tokens: result.usage.inputTokens, completion_tokens: result.usage.outputTokens } }) + 'data: [DONE]\n\n',
    { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'private, no-store' } });
}

export async function executeStudioInference(env: Env, store: StudioInferenceStore, owner: string, project: string, run: string,
  raw: Record<string, any>, options: { signal?: AbortSignal; task?: InferenceTask } = {}) {
  if (env.AI_STUDIO_ROUTES_ENABLED !== 'true') throw new Error('AI route integration for the current Studio agent is not enabled.');
  const state = await stateFor(store, owner, project, run), request = flueGatewayRequest(raw);
  if (options.task && !['intake', 'planning', 'schema', 'luau', 'repair', 'tools', 'summary', 'evidence'].includes(options.task)) {
    throw new Error('Unknown Studio inference task.');
  }
  // Flue persists native tool ids. Restore only server-held replay belonging to this exact
  // authenticated run; no signature, thought or raw provider replay is accepted from a browser.
  const used = new Set<number>();
  for (const message of [...request.messages].reverse()) {
    if (message.role !== 'assistant' || !message.toolCalls?.length) continue;
    const key = replayMessageKey(message.content, message.toolCalls);
    // IDs may repeat across vendor responses. Match the complete assistant tool turn
    // from newest to oldest, consuming each receipt once, including identical repeats.
    for (let index = state.replay.length - 1; index >= 0; index--) {
      const replay = state.replay[index]!;
      if (!used.has(index) && replay.messageKey === key) { message.providerReplay = replay.value; used.add(index); break; }
    }
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(request)));
  const requestId = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const result = await chat(env, request, { inference: state.pinned, actorId: owner, projectId: project,
    runId: run, requestId, signal: options.signal,
    requirements: { task: options.task ?? 'tools', inputTokens: new TextEncoder().encode(JSON.stringify(request.messages)).length + 1024,
      outputTokens: request.maxTokens!, tools: Boolean(request.tools?.length), structuredOutput: false,
      features: { blocks: 0, dependencies: 0, unresolvedFields: 0, failedChecks: 0, customCode: options.task === 'luau' },
      allowTraining: state.pinned.selection.route === 'opencode-free' && state.pinned.selection.allowTraining === true } });
  if (result.providerReplay && JSON.stringify(result.providerReplay).length > 128000) throw new Error('Native model replay exceeded its private storage limit.');
  // The project Durable Object merges completions transactionally. Delegates may finish
  // concurrently; a stale snapshot must not overwrite another delegate's usage or replay.
  await store.update(runKey(owner, project, run), (text) => {
    const current = JSON.parse(text) as StudioInferenceState;
    if (result.routing) current.decisions = [...current.decisions, result.routing].slice(-64);
    current.usage.inputTokens += result.usage.inputTokens; current.usage.outputTokens += result.usage.outputTokens; current.usage.platformNeurons += result.neurons;
    if (result.providerReplay && result.toolCalls.length) current.replay = [...current.replay,
      { messageKey: replayMessageKey(result.text, result.toolCalls), value: result.providerReplay }];
    const out = JSON.stringify(current);
    if (out.length > 450000) throw new Error('The Studio inference state exceeded its storage limit.');
    return out;
  });
  return flueCompletionStream(result);
}

export async function studioInferenceEvidence(store: StudioInferenceStore, owner: string, project: string, run: string) {
  const state = await stateFor(store, owner, project, run);
  return { runRef: run, selection: state.pinned.selection, engineVersion: state.pinned.engineVersion,
    policyVersion: state.pinned.policyVersion, decisions: state.decisions.map((decision) => {
      const candidate = state.pinned.candidates.find((candidate) => candidate.connectionId === decision.connectionId
        && candidate.model.provider === decision.provider && candidate.model.id === decision.modelId);
      return { ...decision, producer: candidate?.model.producer ?? null, modelName: candidate?.model.name ?? decision.modelId,
        hostedBy: candidate?.model.hostedBy ?? decision.provider, connectionName: candidate?.connectionName ?? null };
    }), usage: state.usage };
}
