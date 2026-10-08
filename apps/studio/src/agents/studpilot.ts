'use agent';
// The StudPilot team (rebuild R3), after roblox-ai-studio (MIT): a coordinator that reads the place and hands
// focused work to a planner, a builder, a reviewer and a tester. Each delegate gets a fresh context and only the
// tools its role needs; only its final answer returns to the coordinator. Only the builder can change the place,
// and the session checkpoints before its first change (apps/worker/src/do/session.ts, /studio-tool).
import { type AgentProps, useModel, useResponseFinish, useResponseStart, useAgentStart, useAgentFinish, useDataWriter, useDelivery, usePersistentState, useSubagent, useTool } from '@flue/runtime';
import { env } from 'cloudflare:workers';
import { STUDIO_TOOL_SPECS } from '../tools/generated.ts';
import { projectOf } from '../conversation-id.ts';
import { studioTools } from '../tools/studio.ts';
import { FINISH_RULES } from './build-rules.ts';
import { ENGINE_RELEASE } from '../../../../packages/shared/src/inference.ts';

const READS = STUDIO_TOOL_SPECS.filter((t) => !t.writes).map((t) => t.name);
/**
 * The builder's tools (style bible §5: every visible instance comes from the kit). It builds with build_blocks and may
 * write LOGIC with edit_script and the verified modules; it has no raw instance, property, object, mood, effect or
 * behaviour tool, so it cannot draw a screen or a world by hand. The old UI recipe reader is left out for the same
 * reason. (U01, 2026-10-06: with every tool offered, GLM hand-wrote scripts and never called build_blocks.)
 */
export const BUILDER_TOOLS = ['build_blocks', 'edit_script', 'delete_instances', 'install_module', 'play_check', ...READS.filter((n) => n !== 'get_ui_construction' && n !== 'get_genre_kit')];
const BUILD = STUDIO_TOOL_SPECS.map((t) => t.name).filter((n) => BUILDER_TOOLS.includes(n));
const TEST = [...READS, 'play_check'];
/** The coordinator reads the place but not the old UI recipes and genre kits: they steer towards hand-built screens. */
const COORDINATOR_READS = READS.filter((n) => n !== 'get_ui_construction' && n !== 'get_genre_kit');
/** The block menu, as build_blocks describes it: the planner plans in these ids. */
const BLOCK_MENU = STUDIO_TOOL_SPECS.find((t) => t.name === 'build_blocks')?.description.split('Blocks:\n')[1] ?? '';

const SHARED = `You work on a Roblox place in Studio through tools. Paths look like game.Workspace.Lobby.Floor.
Scripts are Luau: server logic in ServerScriptService, client UI and input in StarterGui or StarterPlayerScripts.
Never claim you did or saw something you did not. End with a short summary of what you found or did.`;

/** The coordinator's whole instruction. Kept at 10,000 characters or fewer (M4 acceptance; a test holds it). */
export const INSTRUCTIONS = `Engine ${ENGINE_RELEASE.id}, prompts ${ENGINE_RELEASE.promptVersion}, routing ${ENGINE_RELEASE.policyVersion}.
You are StudPilot, the coordinator of a small team that builds in Roblox Studio for a Roblox creator.
You can read the place yourself. You cannot change it: the builder does that.

For a question about the place, read and answer yourself.
For a change, work in this order, giving each teammate a complete, self-contained task (they do not see this chat):
1. builder: hand it the creator's words exactly, and what you read about the place. It builds with StudPilot's reviewed
   blocks. Only for a request with more than three separate parts, ask the planner for a block plan first and pass it on.
2. (the builder's own step) Do not tell the builder which scripts or instances to make: it picks the blocks.
3. tester: ask it to run a play check and read the output log for errors.
4. If the tester reports errors the change caused, hand them back to the builder once, then test again.
5. reviewer: for scripts, ask it to read what was written and check it does what was asked.
Then tell the creator, in a few lines, what changed and where, and anything that did not work.
An errored teammate or an empty completion report is not a finished build. Retry once at most; if it fails again,
stop and report the concrete blocker. Never repeat an unchanged failed task indefinitely.
The place can be put back to a checkpoint taken before the first change. Be brief and concrete.`;

const ROLES = {
  planner: {
    description: 'Reads the place and writes a short build plan in StudPilot block ids: which blocks, in what order, with their key values.',
    tools: READS,
    instructions: `You are the planner. Read the place before planning. Return a numbered plan of at most 8 steps; each step
names a block from this menu and its key values (titles, item names, prices, colour names, icon names). A custom script
only for game logic no block covers. Do not write code. Blocks:
${BLOCK_MENU}
${SHARED}`,
  },
  builder: {
    description: 'Builds in the place with StudPilot\'s reviewed blocks (screens, systems, the world\'s look) and writes logic scripts.',
    tools: BUILD,
    instructions: `You are the builder. Do exactly the task you are given, with the smallest set of changes. Read what you will
touch first. Build with build_blocks first: every screen (a window first, then its content blocks; hud, hotbar,
menu, toast), every game system it has (currency first, then shop, codes, daily-reward, rebirth, upgrades,
leaderboard, click-earn, round-loop, checkpoints, gamepass-perk) and the world's look (candy-day, studded-ground).
Call it with the block ids to get their parameters, then with the parameters. Use the same screen name for a window
and its content, and the same item names in a shop and its grid. You cannot create instances or set properties
yourself: everything visible comes from blocks. edit_script, install_module and get_verified_module are only for game
logic no block covers, and that logic uses the blocks' APIs. After writing scripts, run play_check and read
get_output_logs; fix errors you caused.
${FINISH_RULES}
${SHARED}`,
  },
  reviewer: {
    description: 'Reads scripts and instances that were just changed and reports whether they do what was asked, with concrete problems.',
    tools: READS,
    instructions: `You are the reviewer. Read the scripts and instances named in your task. Report concrete problems (wrong
service, missing remote, nil access, logic that does not match the request) with the path and line, and any breach of
these rules. Change nothing.
${FINISH_RULES}
${SHARED}`,
  },
  tester: {
    description: 'Runs a short play check of the place and reads the output log; reports errors and warnings with their source.',
    tools: TEST,
    instructions: `You are the tester. Run play_check, then read get_output_logs. Report each error with the script path and
line it names, and say plainly when the run was clean. Change nothing. ${SHARED}`,
  },
} as const;

/** One instance per conversation: `id` is `<project>` or `<project>~<chat>` (checked against its owner in app.ts). */
const MODEL = ENGINE_RELEASE.modelId;

export function StudPilot({ id }: AgentProps) {
  const projectId = projectOf(id) ?? id;
  const delivery = useDelivery();
  const requestedRef = delivery.kind === 'signal' && delivery.type === 'studpilot-creator-request'
    && /^[0-9a-f-]{36}$/.test(delivery.attributes?.runRef ?? '') ? delivery.attributes!.runRef : null;
  const [activeRef, setActiveRef] = usePersistentState<string | null>('inferenceRunRef', null);
  const runRef = requestedRef ?? (delivery.kind === 'user' ? null : activeRef);
  const routedModel = runRef ? `@cf/studpilot/${projectId}/${runRef}` : MODEL;
  useModel(`cloudflare/${routedModel}`, { thinkingLevel: 'low' });
  const writeInference = useDataWriter('inference');
  useResponseStart(() => ({ inference: { engineVersion: ENGINE_RELEASE.version,
    ...(runRef ? { runRef } : { route: 'studpilot', label: ENGINE_RELEASE.label }) } }));
  useAgentStart(async () => {
    if (requestedRef) {
      const evidence = await (env as unknown as Env).GATE.inferenceEvidence(projectId, requestedRef);
      setActiveRef(requestedRef); writeInference(evidence);
    } else if (delivery.kind === 'user') setActiveRef(null);
  });
  useAgentFinish(async () => {
    if (runRef) writeInference(await (env as unknown as Env).GATE.inferenceEvidence(projectId, runRef));
  });
  // Credits: the response's settled token usage (its delegates' calls included) is charged to the project's owner.
  // The hook is synchronous, so the charge is sent and not awaited; the shared budget has already metered every call.
  useResponseFinish(({ response, metadata }) => {
    // Private gateway calls have no platform provider neurons. The managed legacy
    // path retains its existing usage charge; a personal API bill is never priced as GLM.
    if ((metadata.inference as { runRef?: string } | undefined)?.runRef) { setActiveRef(null); return; }
    const u = response.usage;
    void (env as unknown as Env).GATE.chargeUsage(projectId, MODEL, { inputTokens: u.input + u.cacheRead, outputTokens: u.output, cachedInputTokens: u.cacheRead }).catch(() => undefined);
  });
  // The id was checked at the route: its project part is the project the owner opened.
  const tools = studioTools(projectId);
  const pick = (names: readonly string[]) => tools.filter((t) => names.includes(t.name));
  for (const tool of pick(COORDINATOR_READS)) useTool(tool);
  for (const [name, role] of Object.entries(ROLES)) {
    useSubagent({
      name,
      description: role.description,
      agent: () => {
        for (const tool of pick(role.tools)) useTool(tool);
        // Omit a per-render model override: Flue delegates inherit the submission's
        // pinned parent model, even if another delivery joins the active response.
        return `<studpilot-role name="${name}">\n${role.instructions}`;
      },
    });
  }
  return INSTRUCTIONS;
}
