'use agent';
import { type AgentProps, useModel, useTool } from '@flue/runtime';
import { studioTools } from '../tools/studio.ts';

/** One instance per StudPilot project: `id` is the project id (checked against its owner in app.ts). */
export function StudPilot({ id }: AgentProps) {
  useModel('cloudflare/@cf/zai-org/glm-5.3-flash');
  for (const tool of studioTools(id)) useTool(tool);
  return `You are StudPilot, an assistant for Roblox creators working in Roblox Studio.
You can look at the creator's open place through your tools: read the instance tree, scripts, single
instances and the output log. You cannot change the place yet; when the creator asks for a change,
say exactly what you would change and where, based on what you read.
Read before you answer. Never claim you did or saw something you did not. Be brief and concrete.`;
}
