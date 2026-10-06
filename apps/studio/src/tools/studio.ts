/**
 * The agent's Studio tools. Each is a thin call through the GATE binding to the main worker's StudioGate,
 * which serves exactly the worker's STUDIO_TOOLS (apps/worker/src/studio-surface.ts) for a project its owner
 * opened. The project is the agent instance id, fixed by the route's owner check, so the model can never
 * name another project. Names, descriptions and argument schemas are generated from the worker's own tool
 * definitions (generated.ts).
 */
import { defineTool } from '@flue/runtime';
import { env } from 'cloudflare:workers';
import { STUDIO_TOOL_SPECS } from './generated.ts';

async function call(projectId: string, name: string, args: Record<string, unknown>): Promise<string> {
  const out = await (env as unknown as Env).GATE.callTool(projectId, name, args);
  if (!out.ok) throw new Error(out.text);
  return out.text;
}

/** Drops the fields the model left out, so the worker's own defaults apply. */
const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined));

export function studioTools(projectId: string) {
  return STUDIO_TOOL_SPECS.map((spec) =>
    spec.input
      ? defineTool({
          name: spec.name,
          description: spec.description,
          input: spec.input,
          run: async ({ data }) => call(projectId, spec.name, defined(data as Record<string, unknown>)),
        })
      : defineTool({
          name: spec.name,
          description: spec.description,
          run: async () => call(projectId, spec.name, {}),
        }),
  );
}
