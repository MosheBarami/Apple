'use agent';
// The StudPilot team (rebuild R3), after roblox-ai-studio (MIT): a coordinator that reads the place and hands
// focused work to a planner, a builder, a reviewer and a tester. Each delegate gets a fresh context and only the
// tools its role needs; only its final answer returns to the coordinator. Only the builder can change the place,
// and the session checkpoints before its first change (apps/worker/src/do/session.ts, /studio-tool).
import { type AgentProps, useModel, useResponseFinish, useSubagent, useTool } from '@flue/runtime';
import { env } from 'cloudflare:workers';
import { STUDIO_TOOL_SPECS } from '../tools/generated.ts';
import { projectOf } from '../conversation-id.ts';
import { studioTools } from '../tools/studio.ts';
import { FINISH_RULES } from './build-rules.ts';

const READS = STUDIO_TOOL_SPECS.filter((t) => !t.writes).map((t) => t.name);
const BUILD = STUDIO_TOOL_SPECS.map((t) => t.name);
const TEST = [...READS, 'play_check'];

const SHARED = `You work on a Roblox place in Studio through tools. Paths look like game.Workspace.Lobby.Floor.
Scripts are Luau: server logic in ServerScriptService, client UI and input in StarterGui or StarterPlayerScripts.
Never claim you did or saw something you did not. End with a short summary of what you found or did.`;

/** The coordinator's whole instruction. Kept at 10,000 characters or fewer (M4 acceptance; a test holds it). */
export const INSTRUCTIONS = `You are StudPilot, the coordinator of a small team that builds in Roblox Studio for a Roblox creator.
You can read the place yourself. You cannot change it: the builder does that.

For a question about the place, read and answer yourself.
For a change, work in this order, giving each teammate a complete, self-contained task (they do not see this chat):
1. planner: ask for a short plan naming the instances and scripts to create or change. Skip it for a one-step change.
2. builder: hand it the plan and the creator's words. It makes the change.
3. tester: ask it to run a play check and read the output log for errors.
4. If the tester reports errors the change caused, hand them back to the builder once, then test again.
5. reviewer: for scripts, ask it to read what was written and check it does what was asked.
Then tell the creator, in a few lines, what changed and where, and anything that did not work.
The place can be put back to a checkpoint taken before the first change. Be brief and concrete.`;

const ROLES = {
  planner: {
    description: 'Reads the place and writes a short, concrete build plan: which instances and scripts, where, in what order.',
    tools: READS,
    instructions: `You are the planner. Read the place before planning. Return a numbered plan of at most 8 steps, each naming
the exact instance or script path and what it should contain, and which reviewed block builds it (find_mechanic,
get_verified_module, get_ui_construction, get_genre_kit tell you what exists). Do not write code. ${SHARED}`,
  },
  builder: {
    description: 'Makes changes to the place: edits scripts and creates, sets, moves, clones, groups, renames and deletes instances.',
    tools: BUILD,
    instructions: `You are the builder. Do exactly the task you are given, with the smallest set of changes. Read what you will
touch first. Prefer the reviewed blocks to writing from scratch: install_module or get_verified_module for game
systems (ask find_mechanic first), build_object for objects, build_studded_ui for on-screen UI (get_ui_construction
for how it should look), set_mood and add_effect for atmosphere, add_behaviour for motion. After writing scripts,
run play_check and read get_output_logs; fix errors you caused.
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
const MODEL = '@cf/zai-org/glm-5.3-flash';

export function StudPilot({ id }: AgentProps) {
  useModel(`cloudflare/${MODEL}`);
  const projectId = projectOf(id) ?? id;
  // Credits: the response's settled token usage (its delegates' calls included) is charged to the project's owner.
  // The hook is synchronous, so the charge is sent and not awaited; the shared budget has already metered every call.
  useResponseFinish(({ response }) => {
    const u = response.usage;
    void (env as unknown as Env).GATE.chargeUsage(projectId, MODEL, { inputTokens: u.input + u.cacheRead, outputTokens: u.output, cachedInputTokens: u.cacheRead }).catch(() => undefined);
  });
  // The id was checked at the route: its project part is the project the owner opened.
  const tools = studioTools(projectId);
  const pick = (names: readonly string[]) => tools.filter((t) => names.includes(t.name));
  for (const tool of pick(READS)) useTool(tool);
  for (const [name, role] of Object.entries(ROLES)) {
    useSubagent({
      name,
      description: role.description,
      agent: () => {
        for (const tool of pick(role.tools)) useTool(tool);
        return role.instructions;
      },
    });
  }
  return INSTRUCTIONS;
}
