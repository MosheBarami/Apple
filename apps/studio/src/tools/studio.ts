/**
 * The agent's Studio tools (stage R1: read-only). Each one is a thin call through the GATE binding to the
 * main worker's StudioGate, which serves only its read-only MCP surface. The project is the agent
 * instance id, fixed by the route's owner check, so the model can never name another project.
 */
import { defineTool } from '@flue/runtime';
import { env } from 'cloudflare:workers';
import * as v from 'valibot';

async function call(projectId: string, name: string, args: Record<string, unknown>): Promise<string> {
  const out = await (env as unknown as Env).GATE.callTool(projectId, name, args);
  if (!out.ok) throw new Error(out.text);
  return out.text;
}

/** Drops the fields the model left out, so the worker's own defaults apply. */
const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined));

export function studioTools(projectId: string) {
  return [
    defineTool({
      name: 'get_project_tree',
      description:
        'Snapshot of the place: instance names, classes, part positions and sizes. Start here to understand a project.',
      input: v.object({
        root: v.optional(v.string()),
        maxDepth: v.optional(v.number()),
      }),
      run: async ({ data }) => call(projectId, 'get_project_tree', defined(data)),
    }),
    defineTool({
      name: 'list_scripts',
      description: 'List every script in the place with its path, class and line count.',
      input: v.object({ root: v.optional(v.string()) }),
      run: async ({ data }) => call(projectId, 'list_scripts', defined(data)),
    }),
    defineTool({
      name: 'read_script',
      description: 'Read one script by its full path. Long sources are paged: follow nextStartLine.',
      input: v.object({
        path: v.string(),
        start_line: v.optional(v.number()),
        max_lines: v.optional(v.number()),
      }),
      run: async ({ data }) => call(projectId, 'read_script', defined(data)),
    }),
    defineTool({
      name: 'search_scripts',
      description: 'Search every script source for a string; returns matching paths and line numbers.',
      input: v.object({ query: v.string() }),
      run: async ({ data }) => call(projectId, 'search_scripts', data),
    }),
    defineTool({
      name: 'get_instance',
      description: 'Read one instance and its properties by full path, e.g. game.Workspace.Lobby.Floor.',
      input: v.object({ path: v.string() }),
      run: async ({ data }) => call(projectId, 'get_instance', data),
    }),
    defineTool({
      name: 'get_output_logs',
      description: 'Read recent Studio output: errors, warnings and prints.',
      run: async () => call(projectId, 'get_output_logs', {}),
    }),
  ];
}
