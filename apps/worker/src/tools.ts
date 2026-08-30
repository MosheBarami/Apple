// Agent tool definitions + dispatcher. Tools either talk to Studio (via the session DO's
// op queue) or run worker-side (docs search, memory, checkpoints).
import type { Env } from './env';
import type { GatewayToolDef, StudioOp, OpResult, CheckpointMeta } from '@golem/shared';
import { searchDocs } from './rag';

export interface AgentCtx {
  env: Env;
  studioConnected(): boolean;
  execStudioOp(op: StudioOp, timeoutMs?: number): Promise<OpResult>;
  createCheckpoint(label: string, kind: 'auto' | 'manual' | 'pre_agent'): Promise<CheckpointMeta | { error: string }>;
  addMemoryFact(fact: string): Promise<void>;
}

const S = (props: Record<string, unknown>, required: string[] = []): unknown => ({
  type: 'object',
  properties: props,
  required,
});

interface ToolImpl {
  def: GatewayToolDef;
  studio: boolean; // requires studio connection
  run(ctx: AgentCtx, args: Record<string, unknown>): Promise<unknown>;
}

const MAX_RESULT_CHARS = 3000; // tool output is re-sent every later step, so keep it tight

async function op(ctx: AgentCtx, studioOp: StudioOp, timeoutMs = 30_000): Promise<unknown> {
  const res = await ctx.execStudioOp(studioOp, timeoutMs);
  if (!res.ok) return { error: res.error ?? 'operation failed' };
  return res.data ?? { ok: true };
}

export const TOOLS: Record<string, ToolImpl> = {
  get_project_tree: {
    def: {
      name: 'get_project_tree',
      description: 'Snapshot of the game instance tree (names, classes, child counts). Start here to understand a project.',
      parameters: S({
        root: { type: 'string', description: 'Path to start from, e.g. "game.Workspace". Default: whole game (key services).' },
        maxDepth: { type: 'number', description: 'Depth limit, default 4' },
      }),
    },
    studio: true,
    run: (ctx, a) => op(ctx, { op: 'get_tree', root: a.root as string | undefined, maxDepth: (a.maxDepth as number) ?? 4, maxNodes: 800 }),
  },
  list_scripts: {
    def: { name: 'list_scripts', description: 'List all scripts in the project with paths, class and line counts.', parameters: S({ root: { type: 'string' } }) },
    studio: true,
    run: (ctx, a) => op(ctx, { op: 'list_scripts', root: a.root as string | undefined }),
  },
  read_script: {
    def: { name: 'read_script', description: 'Read full source of a script by path.', parameters: S({ path: { type: 'string' } }, ['path']) },
    studio: true,
    run: (ctx, a) => op(ctx, { op: 'read_script', path: String(a.path ?? '') }),
  },
  edit_script: {
    def: {
      name: 'edit_script',
      description:
        'Create or edit a script. Provide either `source` (full new content) or `edits` (find/replace list, exact match). To create a new script set `create_class` + `create_parent`.',
      parameters: S(
        {
          path: { type: 'string', description: 'Full path, e.g. game.ServerScriptService.RoundManager' },
          source: { type: 'string' },
          edits: {
            type: 'array',
            items: S({ find: { type: 'string' }, replace: { type: 'string' }, all: { type: 'boolean' } }, ['find', 'replace']),
          },
          create_class: { type: 'string', enum: ['Script', 'LocalScript', 'ModuleScript'] },
          create_parent: { type: 'string', description: 'Parent path when creating' },
        },
        ['path'],
      ),
    },
    studio: true,
    run: (ctx, a) =>
      op(ctx, {
        op: 'edit_script',
        path: String(a.path ?? ''),
        source: a.source as string | undefined,
        edits: a.edits as { find: string; replace: string; all?: boolean }[] | undefined,
        create:
          a.create_class && a.create_parent
            ? { className: a.create_class as 'Script' | 'LocalScript' | 'ModuleScript', parent: String(a.create_parent) }
            : undefined,
      }),
  },
  search_scripts: {
    def: { name: 'search_scripts', description: 'Search all script sources for a string. Returns matches with paths and line numbers.', parameters: S({ query: { type: 'string' } }, ['query']) },
    studio: true,
    run: (ctx, a) => op(ctx, { op: 'search_scripts', query: String(a.query ?? ''), maxResults: 40 }),
  },
  create_instances: {
    def: {
      name: 'create_instances',
      description:
        'Create instances (parts, models, UI, folders...). Each item: {className, name, parent, props?, children?}. Props are typed: {"Position":{"t":"Vector3","v":[0,5,0]}, "Anchored":{"t":"bool","v":true}, "Material":{"t":"EnumItem","v":"Enum.Material.Neon"}, "Color":{"t":"Color3","v":[1,0.5,0]}, "Size":{"t":"UDim2","v":[0.5,0,0.1,0]}, "AnchorPoint":{"t":"Vector2","v":[0.5,0.5]}}. Supported prop types: string,number,bool,Vector3,Vector2,CFrame,Color3,UDim2,UDim,EnumItem,BrickColor,Content,NumberRange,Rect,Instance,nil. If the result reports propIssues, the instances WERE created — fix the listed properties with set_properties.',
      parameters: S({ items: { type: 'array', items: { type: 'object' } } }, ['items']),
    },
    studio: true,
    run: (ctx, a) => op(ctx, { op: 'create_instances', items: (a.items as never[]) ?? [] }),
  },
  set_properties: {
    def: {
      name: 'set_properties',
      description: 'Set properties/attributes on an existing instance. Same typed prop format as create_instances.',
      parameters: S({ path: { type: 'string' }, props: { type: 'object' }, attributes: { type: 'object' } }, ['path']),
    },
    studio: true,
    run: (ctx, a) => op(ctx, { op: 'set_props', path: String(a.path ?? ''), props: a.props as never, attributes: a.attributes as never }),
  },
  delete_instances: {
    def: { name: 'delete_instances', description: 'Delete instances by path.', parameters: S({ paths: { type: 'array', items: { type: 'string' } } }, ['paths']) },
    studio: true,
    run: (ctx, a) => op(ctx, { op: 'delete_instances', paths: (a.paths as string[]) ?? [] }),
  },
  run_luau: {
    def: {
      name: 'run_luau',
      description:
        'Run a Luau snippet in Studio (edit-time, plugin context) for inspection, terrain, bulk edits, math. print() output and the returned value come back. No game scripts run. Use for anything the other tools cannot do.',
      parameters: S({ code: { type: 'string' } }, ['code']),
    },
    studio: true,
    run: (ctx, a) => op(ctx, { op: 'run_code', code: String(a.code ?? ''), timeoutMs: 10_000 }, 25_000),
  },
  run_and_check: {
    def: {
      name: 'run_and_check',
      description:
        'Playtest verification: starts Run mode (server simulation), waits, collects console output/errors, stops. Returns the logs. Use after building to verify nothing errors.',
      parameters: S({ seconds: { type: 'number', description: '2-15, default 5' } }),
    },
    studio: true,
    run: async (ctx, a) => {
      const secs = Math.min(15, Math.max(2, Number(a.seconds) || 5));
      const start = await ctx.execStudioOp({ op: 'run_mode', action: 'start' }, 20_000);
      if (!start.ok) return { error: `could not start run mode: ${start.error}` };
      await new Promise((r) => setTimeout(r, secs * 1000));
      const logs = await ctx.execStudioOp({ op: 'get_logs', maxEntries: 120 }, 15_000);
      const stop = await ctx.execStudioOp({ op: 'run_mode', action: 'stop' }, 20_000);
      return { ranSeconds: secs, logs: logs.ok ? logs.data : { error: logs.error }, stopped: stop.ok };
    },
  },
  get_output_logs: {
    def: { name: 'get_output_logs', description: 'Read recent Studio output/console logs (errors, warnings, prints).', parameters: S({}) },
    studio: true,
    run: (ctx) => op(ctx, { op: 'get_logs', maxEntries: 120 }),
  },
  take_screenshot: {
    def: { name: 'take_screenshot', description: 'Capture the Studio viewport for visual review (if supported by the Studio version).', parameters: S({}) },
    studio: true,
    run: (ctx) => op(ctx, { op: 'screenshot' }, 30_000),
  },
  insert_asset: {
    def: {
      name: 'insert_asset',
      description:
        'Insert a Creator Store asset by numeric assetId. ONLY use an assetId the user explicitly gave you — there is no asset search and guessed ids fail or insert something random. To create objects, build them from Parts with create_instances instead.',
      parameters: S({ assetId: { type: 'number' }, parent: { type: 'string' } }, ['assetId']),
    },
    studio: true,
    run: (ctx, a) => op(ctx, { op: 'insert_asset', assetId: Number(a.assetId), parent: String(a.parent ?? 'game.Workspace') }, 45_000),
  },
  search_docs: {
    def: {
      name: 'search_docs',
      description: 'Search official Roblox documentation (APIs, services, properties, guides). Use when unsure about an API.',
      parameters: S({ query: { type: 'string' } }, ['query']),
    },
    studio: false,
    run: async (ctx, a) => {
      const hits = await searchDocs(ctx.env, String(a.query ?? ''), 5);
      return hits.map((h) => ({ title: h.title, url: h.url, excerpt: h.text.slice(0, 900) }));
    },
  },
  remember: {
    def: {
      name: 'remember',
      description: 'Save a durable fact to project memory (decisions, conventions, user preferences).',
      parameters: S({ fact: { type: 'string' } }, ['fact']),
    },
    studio: false,
    run: async (ctx, a) => {
      await ctx.addMemoryFact(String(a.fact ?? ''));
      return { saved: true };
    },
  },
  create_checkpoint: {
    def: {
      name: 'create_checkpoint',
      description: 'Save a restorable checkpoint of the project (scripts + instance tree). Do this before large changes.',
      parameters: S({ label: { type: 'string' } }, ['label']),
    },
    studio: true,
    run: async (ctx, a) => ctx.createCheckpoint(String(a.label ?? 'checkpoint'), 'auto'),
  },
};

export function toolNames(): string[] {
  return Object.keys(TOOLS);
}

export function toolDefs(studioConnected: boolean, allowed?: Set<string>): GatewayToolDef[] {
  return Object.entries(TOOLS)
    .filter(([name, t]) => (studioConnected || !t.studio) && (!allowed || allowed.has(name)))
    .map(([, t]) => t.def);
}

export async function runTool(ctx: AgentCtx, name: string, argsJson: string): Promise<{ summary: string; resultForLlm: string; ok: boolean }> {
  const impl = TOOLS[name];
  if (!impl) return { summary: `unknown tool ${name}`, resultForLlm: JSON.stringify({ error: `unknown tool: ${name}` }), ok: false };
  if (impl.studio && !ctx.studioConnected()) {
    return { summary: `${name}: Studio not connected`, resultForLlm: JSON.stringify({ error: 'Studio is not connected. Ask the user to connect Studio, or continue without Studio tools.' }), ok: false };
  }
  let args: Record<string, unknown> = {};
  try {
    args = argsJson ? (JSON.parse(argsJson) as Record<string, unknown>) : {};
  } catch {
    return { summary: `${name}: bad arguments`, resultForLlm: JSON.stringify({ error: 'arguments were not valid JSON' }), ok: false };
  }
  try {
    const result = await impl.run(ctx, args);
    let str = typeof result === 'string' ? result : JSON.stringify(result);
    if (str.length > MAX_RESULT_CHARS) str = str.slice(0, MAX_RESULT_CHARS) + `\n...[truncated ${str.length - MAX_RESULT_CHARS} chars]`;
    const failed = typeof result === 'object' && result !== null && 'error' in (result as Record<string, unknown>);
    return { summary: summarize(name, args, failed), resultForLlm: str, ok: !failed };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { summary: `${name} failed: ${msg.slice(0, 80)}`, resultForLlm: JSON.stringify({ error: msg }), ok: false };
  }
}

function summarize(name: string, args: Record<string, unknown>, failed: boolean): string {
  const target = (args.path ?? args.query ?? args.root ?? args.label ?? args.fact ?? '') as string;
  const t = typeof target === 'string' && target ? ` · ${target.slice(0, 60)}` : '';
  return `${failed ? '✗' : '✓'} ${name}${t}`;
}
