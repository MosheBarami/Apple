/**
 * The agent's tools. Studio tools are thin calls through the GATE binding to the main worker's StudioGate, which serves
 * exactly STUDIO_TOOLS (apps/worker/src/studio-surface.ts) for this project and checkpoints the place before the first
 * write of a turn. Knowledge tools (docs, Creator Store, skills) and the plan run here.
 */
import { jsonSchema, tool, type ToolSet, type UIMessageStreamWriter } from 'ai';
import { z } from 'zod';
import { searchCreatorStore } from './knowledge/creator-store.ts';
import { readDoc, searchDocs } from './knowledge/docs.ts';
import { SKILLS } from './skills.generated.ts';
import { STUDIO_TOOL_SPECS } from './tools/generated.ts';

/**
 * Descriptions that differ from the worker's: the worker's text still names tools this agent does not have (the old
 * library, reviewed kits, consent), and a description pointing at a missing tool sends the model looking for it.
 */
const DESCRIPTIONS: Record<string, string> = {
  search_scripts: 'Search every script source for a string. Returns matching lines with paths and line numbers.',
  model_anatomy:
    "Read a placed model: its parts, joints, hinge candidates and which way a positive angle turns a part, what is already clickable, lit or playing. Use it to understand something you inserted or found before adapting or animating it. Pass part for one part's detail.",
  edit_script:
    'Create or edit a script. Provide exactly one of `source` (full new content) or `edits` (exact find/replace list: edits:[{find:"exact old text",replace:"new text"}]). A new script: set `create_class` (Script, LocalScript, ModuleScript) + `create_parent`. The source is parsed before it is written: a body that does not compile is refused and nothing changes. `base_hash` from read_script refuses a write over a concurrent Studio edit.',
  run_luau:
    'Run Luau in Studio (edit time, plugin context) and get print() output and the returned value back. Use it for inspection, bulk edits, procedural generation and maths that the typed tools do not cover. Game scripts do not run. Bring assets in with insert_from_store, not from here.',
  animate_model:
    'Rig a model with joints (root part, Motor6D joints with pivots: the RigEdit Lite method) and author keyframed clips from code, previewed in Studio without uploading. Load the animation skill first; read the model with model_anatomy before rigging it.',
  play_check:
    "Play-test as a player: starts a real Studio test session with one player, waits `seconds`, optionally walks the character onto `touch` parts, then reports what the player's screen shows (every ScreenGui and its visible text), leaderstats before and after, and errors from the client and the server. Use it before you say a script, counter, HUD or button works.",
};

/** Tool names whose results the chat shows as steps; the UI labels them. */
export type StudioToolName = (typeof STUDIO_TOOL_SPECS)[number]['name'];

export function studioTools(env: Env, projectId: string): ToolSet {
  const tools: ToolSet = {};
  for (const spec of STUDIO_TOOL_SPECS) {
    const description = DESCRIPTIONS[spec.name] ?? spec.description;
    // The worker's edit_terrain text mentions a consent step that no longer exists.
    const text = description.replace(/Needs Studio edit consent; /g, '');
    tools[spec.name] = tool({
      description: text,
      inputSchema: jsonSchema(spec.parameters as Parameters<typeof jsonSchema>[0]),
      execute: async (args) => {
        const out = await env.GATE.callTool(projectId, spec.name, (args ?? {}) as Record<string, unknown>);
        if (!out.ok) throw new Error(out.text);
        return out.text;
      },
    });
  }
  return tools;
}

/**
 * Knowledge and planning. `writer` lets a docs search stream its hits to the chat as citable sources while the model
 * reads them, so the sources the person sees are the ones the agent actually retrieved.
 */
export function knowledgeTools(env: Env, writer: UIMessageStreamWriter): ToolSet {
  const cited = new Set<string>();
  const cite = (url: string, title: string) => {
    if (cited.has(url)) return;
    cited.add(url);
    writer.write({ type: 'source-url', sourceId: `src-${cited.size}`, url, title });
  };
  return {
    search_docs: tool({
      description:
        'Search the official Roblox Creator Docs (guides and the full Engine API reference) and the Luau docs. Returns the best matching sections with their live URLs. Use it whenever you are not certain of a class, property, method, event, enum or best practice, and cite the URLs you relied on in your reply as markdown links.',
      inputSchema: z.object({
        query: z.string().describe('What to look up, e.g. "UIListLayout padding" or "DataStore UpdateAsync retries".'),
        source: z.enum(['roblox', 'luau', 'all']).optional().describe('Default all.'),
      }),
      execute: async ({ query, source }) => {
        const hits = await searchDocs(env.DOCS, query, { limit: 6, source: source ?? 'all' });
        for (const h of hits.slice(0, 3)) cite(h.url, h.heading && h.heading !== h.title ? `${h.title}: ${h.heading}` : h.title);
        return hits.map((h) => ({ title: h.heading && h.heading !== h.title ? `${h.title} › ${h.heading}` : h.title, url: h.url, source: h.source, snippet: h.snippet }));
      },
    }),
    read_doc: tool({
      description: 'Read a documentation page or API member in full, by the URL search_docs gave you (create.roblox.com/docs or luau.org).',
      inputSchema: z.object({ url: z.string() }),
      execute: async ({ url }) => {
        const page = await readDoc(env.DOCS, url);
        if (!page) throw new Error(`${url} is not a Roblox or Luau documentation page.`);
        cite(page.url, page.title || page.url);
        return page;
      },
    }),
    search_creator_store: tool({
      description:
        'Search the Roblox Creator Store for models, meshes, images (decals), audio or animations. Returns ids with name, creator, whether it contains scripts, size/triangle counts and a link. Choose by fit, then bring one in with insert_from_store and inspect it.',
      inputSchema: z.object({
        query: z.string(),
        category: z.enum(['model', 'mesh', 'decal', 'audio', 'animation', 'video']).optional().describe('Default model.'),
        limit: z.number().int().min(1).max(20).optional(),
      }),
      execute: async ({ query, category, limit }) => searchCreatorStore({ query, category: category ?? 'model', limit: limit ?? 8 }),
    }),
    load_skill: tool({
      description:
        'Load one of your skills (listed in your instructions) before specialised work; pass `file` to read one of its reference files.',
      inputSchema: z.object({ name: z.string(), file: z.string().optional() }),
      execute: async ({ name, file }) => {
        const skill = SKILLS.find((s) => s.name === name);
        if (!skill) throw new Error(`No skill named ${name}. Skills: ${SKILLS.map((s) => s.name).join(', ')}`);
        if (!file) return { name, body: skill.body, files: Object.keys(skill.files) };
        const text = skill.files[file];
        if (text === undefined) throw new Error(`${name} has no file ${file}. Files: ${Object.keys(skill.files).join(', ')}`);
        return { name, file, body: text };
      },
    }),
    update_plan: tool({
      description:
        'Show the person a short checklist of what you are doing for this request and keep it current (mark steps done as you finish them). Use it for requests with several parts; skip it for a single quick change.',
      inputSchema: z.object({
        steps: z.array(z.object({ text: z.string(), status: z.enum(['pending', 'active', 'done']) })).min(1).max(12),
      }),
      execute: async ({ steps }) => ({ ok: true, steps }),
    }),
  };
}

export function skillIndex(): string {
  return SKILLS.map((s) => `- ${s.name}: ${s.description}`).join('\n');
}
