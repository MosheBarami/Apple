// Agent tool definitions + dispatcher. Tools either talk to Studio (via the session DO's
// op queue) or run worker-side (docs search, memory, checkpoints).
import type { Env } from './env';
import type { GatewayToolDef, StudioOp, OpResult, CheckpointMeta, RenderViewResult } from '@golem/shared';
import { RENDER_VIEWS } from '@golem/shared';
import { searchDocs } from './rag';
import { critiqueViews, critiqueToText, type VisualCritique } from './vision';
import { chooseAssetSource, verifyCreatorStoreAsset, findVerifiedAssets, type AssetNeed, type AssetKind } from './assets';
import { searchAssetLibrary } from './asset-library';
import { compositionHardFails, structureFromLayout, structureLine } from './composition';

export interface AgentCtx {
  env: Env;
  studioConnected(): boolean;
  execStudioOp(op: StudioOp, timeoutMs?: number): Promise<OpResult>;
  createCheckpoint(label: string, kind: 'auto' | 'manual' | 'pre_agent'): Promise<CheckpointMeta | { error: string }>;
  addMemoryFact(fact: string): Promise<void>;
  /** last render/critique produced this run, so the loop can escalate reasoning on a failure */
  lastRender?: RenderViewResult;
  lastCritique?: VisualCritique;
  /**
   * Asset ids that came out of a verified search in THIS session. The only ids insert_asset will
   * accept: an id that only ever appeared in model output is never inserted.
   */
  discoveredAssetIds?: Set<number>;
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

/**
 * Ask the plugin to rasterise the scene. Rendering five views of a busy place is real CPU work
 * inside Studio, so this gets a longer timeout than an ordinary op.
 */
async function renderViews(ctx: AgentCtx, target: string | undefined, view: string): Promise<RenderViewResult | { error: string }> {
  const res = await ctx.execStudioOp(
    { op: 'render_view', target, view: view as RenderViewResult['views'][number]['name'] | 'all' },
    view === 'all' ? 90_000 : 45_000,
  );
  if (!res.ok) return { error: res.error ?? 'render failed' };
  const data = res.data as RenderViewResult & { error?: string };
  if (data?.error) return { error: data.error };
  if (!data?.views?.length) return { error: 'the renderer returned no views' };
  return data;
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
  render_view: {
    def: {
      name: 'render_view',
      description:
        'Render the scene to real images from one or more camera angles and report what is actually visible. Use this to SEE your work — object properties cannot tell you whether a scene looks good.',
      parameters: S({
        target: { type: 'string', description: 'instance path to frame, e.g. game.Workspace.Plaza. Omit for the whole workspace.' },
        view: { type: 'string', enum: [...RENDER_VIEWS, 'all'], description: 'camera preset; "all" renders every angle' },
      }),
    },
    studio: true,
    run: async (ctx, a) => {
      const res = await renderViews(ctx, a.target ? String(a.target) : undefined, String(a.view ?? 'hero'));
      if ('error' in res) return res;
      // The images themselves never enter the transcript — they are ~60KB each and tool results
      // are re-sent on every later step. inspect_visually is what actually shows them to a model.
      ctx.lastRender = res;
      return { subject: res.subject, boundsSizeStuds: res.boundsSize, views: res.views.map((v) => ({ view: v.name, ...v.meta })) };
    },
  },
  check_composition: {
    def: {
      name: 'check_composition',
      description:
        'Check the MACRO COMPOSITION of what you have built — landmark dominance, vertical hierarchy and massing — without rendering images or spending a critique. Call this on your BLOCKOUT, before adding any detail. If it fails, adding parts cannot fix it: change the layout and check again.',
      parameters: S({
        target: { type: 'string', description: 'instance path to check, e.g. game.Workspace.Plaza. Omit for the whole workspace.' },
        subject: { type: 'string', enum: ['scene', 'prop'], description: 'a prop has no landmark tier; defaults to scene' },
      }),
    },
    studio: true,
    run: async (ctx, a) => {
      // Deliberately the cheapest check in the product: one Studio round-trip for geometry, then
      // arithmetic. No vision model call and no image tokens, where inspect_visually costs a full
      // critique. That difference is what makes "reject the blockout and rebuild it" affordable
      // enough to do early, which is the only point at which rejecting it is cheap.
      const res = await renderViews(ctx, a.target ? String(a.target) : undefined, 'top');
      if ('error' in res) return res;
      const structure = structureFromLayout(res.layout?.parts);
      if (!structure) return { error: 'no geometry to judge — build the blockout first' };
      const subject = a.subject === 'prop' ? 'prop' : 'scene';
      const failures = compositionHardFails(structure, [], subject);
      return {
        structure: structureLine(structure),
        passed: failures.length === 0,
        failures,
        guidance: failures.length
          ? 'These are structural. More parts, more materials and more props will not move any of them — that was measured. Change the LAYOUT: give one element clear dominance in height and mass and let everything else step down beneath it.'
          : 'Macro composition is sound. Build detail on top of it.',
      };
    },
  },
  inspect_visually: {
    def: {
      name: 'inspect_visually',
      description:
        'Render the scene and have it critiqued as an image against a visual quality gate. Returns a score, named defects and specific fixes. Call this after building anything visual, and again after fixing, until it passes.',
      parameters: S(
        {
          target: { type: 'string', description: 'instance path to inspect. Omit for the whole workspace.' },
          intent: { type: 'string', description: 'what the user asked for, in one line — the critique is judged against this' },
        },
        ['intent'],
      ),
    },
    studio: true,
    run: async (ctx, a) => {
      const res = await renderViews(ctx, a.target ? String(a.target) : undefined, 'all');
      if ('error' in res) return res;
      ctx.lastRender = res;
      const critique = await critiqueViews(ctx.env, res, String(a.intent ?? 'a well-built Roblox scene'));
      ctx.lastCritique = critique;
      return { text: critiqueToText(critique), score: critique.score, passed: critique.passed };
    },
  },
  choose_asset_source: {
    def: {
      name: 'choose_asset_source',
      description:
        'Where should this piece of the scene come from? Returns an ordered list of sources with rationale and the verification gate each requires. Call this BEFORE building anything you might be tempted to search for. Procedural wins almost everywhere; foliage and characters are the exceptions.',
      parameters: S(
        { need: { type: 'string', enum: ['ground', 'building', 'prop', 'foliage', 'character', 'vehicle', 'ui_icon', 'texture', 'particle', 'lighting'] } },
        ['need'],
      ),
    },
    studio: false,
    run: async (_ctx, a) => chooseAssetSource(String(a.need ?? 'prop') as AssetNeed),
  },
  search_asset_library: {
    def: {
      name: 'search_asset_library',
      description:
        "Search Golem's curated CC0 asset library. Every hit is licence-cleared and safe to insert. Prefer this over the Creator Store for anything procedural geometry cannot do — foliage and characters especially.",
      parameters: S(
        {
          query: { type: 'string' },
          kind: { type: 'string', enum: ['ground', 'building', 'prop', 'foliage', 'character', 'vehicle', 'ui_icon', 'texture', 'particle'] },
          maxTriangles: { type: 'number' },
        },
        ['query'],
      ),
    },
    studio: false,
    run: async (ctx, a) => {
      const hits = await searchAssetLibrary(ctx.env, String(a.query ?? ''), {
        kind: a.kind ? (String(a.kind) as AssetKind) : undefined,
        maxTriangles: a.maxTriangles ? Number(a.maxTriangles) : undefined,
        insertableOnly: true,
        k: 8,
      });
      for (const h of hits) if (h.robloxAssetId !== null) (ctx.discoveredAssetIds ??= new Set()).add(h.robloxAssetId);
      return hits.map((h) => ({ assetId: h.robloxAssetId, name: h.name, kind: h.kind, triangles: h.triangles, boundsStuds: h.boundsStuds, tags: h.tags }));
    },
  },
  find_verified_asset: {
    def: {
      name: 'find_verified_asset',
      description:
        'Last resort when the library has nothing: search the Creator Store and return only ids that passed full verification (free, publicly visible, ZERO scripts, Mesh/Image only — never a Model, trusted creator, inside the triangle budget). Never invent an assetId; only ids returned here or by search_asset_library can be inserted.',
      parameters: S({ query: { type: 'string' }, maxTriangles: { type: 'number' }, robloxOnly: { type: 'boolean' } }, ['query']),
    },
    studio: false,
    run: async (ctx, a) => {
      const res = await findVerifiedAssets(ctx.env, String(a.query ?? ''), {
        category: 'mesh',
        robloxOnly: a.robloxOnly === true,
        maxTriangles: a.maxTriangles ? Number(a.maxTriangles) : undefined,
        want: 3,
      });
      for (const v of res.passed) (ctx.discoveredAssetIds ??= new Set()).add(v.assetId);
      return {
        note: res.search.note,
        passed: res.passed.map((v) => ({ assetId: v.assetId, name: v.name, type: v.assetType, triangles: v.triangles })),
        rejected: res.rejected.map((v) => ({ assetId: v.assetId, verdict: v.verdict, reasons: v.reasons })),
      };
    },
  },
  insert_asset: {
    def: {
      name: 'insert_asset',
      description:
        'Insert an asset by numeric assetId. The id MUST have come from search_asset_library or find_verified_asset in this conversation — an id from anywhere else is refused, because guessed ids fail or insert something random, and unverified models can carry backdoor scripts. To create objects, build them from Parts with create_instances instead.',
      parameters: S({ assetId: { type: 'number' }, parent: { type: 'string' } }, ['assetId']),
    },
    studio: true,
    run: async (ctx, a) => {
      const assetId = Number(a.assetId);
      if (!ctx.discoveredAssetIds?.has(assetId)) {
        const verdict = await verifyCreatorStoreAsset(ctx.env, assetId, { provenance: 'user_supplied' });
        if (!verdict.ok) {
          return { error: `asset ${assetId} was not verified: ${verdict.verdict}. ${verdict.reasons.join(' ')}` };
        }
        ctx.discoveredAssetIds = (ctx.discoveredAssetIds ?? new Set()).add(assetId);
      }
      return op(ctx, { op: 'insert_asset', assetId, parent: String(a.parent ?? 'game.Workspace') }, 45_000);
    },
  },
  generate_model: {
    def: {
      name: 'generate_model',
      description:
        "Generate a 3D model from text with Roblox's own GenerationService, then QC it automatically. Free, ~20s, 10/min. Use ONLY for what procedural geometry cannot do: organic silhouettes, curved vehicle bodywork, one bespoke hero prop. The result is session-scoped and does not survive save/publish. The returned QC verdict is authoritative — if it fails, fix or discard; success does not mean good.",
      parameters: S(
        {
          prompt: { type: 'string' },
          intent: { type: 'string', description: 'what it is meant to be, e.g. "tree" or "lamp post" — drives the scale check' },
          maxTriangles: { type: 'number', description: 'default 6000' },
          predefinedSchema: { type: 'string', enum: ['Body1', 'Car5'] },
          parent: { type: 'string' },
        },
        ['prompt'],
      ),
    },
    studio: true,
    run: (ctx, a) =>
      op(
        ctx,
        {
          op: 'generate_model',
          prompt: String(a.prompt ?? ''),
          intent: a.intent ? String(a.intent) : undefined,
          maxTriangles: a.maxTriangles ? Number(a.maxTriangles) : undefined,
          predefinedSchema: a.predefinedSchema ? String(a.predefinedSchema) : undefined,
          parent: String(a.parent ?? 'game.Workspace'),
        },
        120_000,
      ),
  },
  inspect_model: {
    def: {
      name: 'inspect_model',
      description:
        'Measure an inserted or generated model against the QC gate: triangle count, bounding box, scale plausibility for its intent, pivot offset from its base, orientation, texturing, collision, anchoring, and whether it contains scripts. Returns per-check pass/fail plus concrete fixes.',
      parameters: S({ path: { type: 'string' }, intent: { type: 'string' } }, ['path']),
    },
    studio: true,
    run: (ctx, a) => op(ctx, { op: 'inspect_model', path: String(a.path ?? ''), intent: a.intent ? String(a.intent) : undefined }, 45_000),
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
