// The MCP surface: which of the agent's tools an outside program may call, and the protocol it
// calls them with. Pure — nothing here touches a binding, so every decision below can be tested
// against its own inputs rather than against a database someone had to arrange first.
//
// WHY THIS IS A SUBSET AND NOT THE REGISTRY. The agent's tool registry is the set of things GOLEM
// may do while a person is watching it work: it edits scripts, creates parts, runs Luau, inserts
// assets, starts playtests. An MCP client is not that person and is not watching. It is some other
// program — Claude, Cursor, a framework nobody here reviewed — holding a long-lived credential.
// Handing it `run_luau` against a customer's open Studio session would put arbitrary code into a
// place through a door with none of the gates the agent passes: no checkpoint before the change,
// no asset policy, no critic, no user sitting there able to say stop.
//
// So the surface is read-only project work: READ THIS PLACE, plus bounded offline reference guidance
// that is already available without Studio, inference or an outbound fetch. Structure, scripts,
// symbols, selection, camera state and console output read the live place; creation-skill and genre
// references read checked-in static data. Everything that writes, spends, or reaches outside is
// excluded, and every exclusion is written down in MCP_EXCLUDED with its reason.
//
// THE FILTER IS AN ALLOWLIST WHOSE COMPLEMENT IS WRITTEN DOWN. A denylist would expose a tool
// added next month by default — nobody would have to decide anything, and the first sign would be
// a stranger's program calling it. MCP_TOOLS and MCP_EXCLUDED must between them name every tool in
// the registry exactly once; mcp.test.mjs fails if a name is in neither, so a new tool cannot
// reach this surface without somebody classifying it.
//
// TO BUILD RATHER THAN READ, an API client uses POST /v1/projects/:id/runs. That starts the agent,
// which means the change passes the gates the agent passes. There is deliberately no way to reach
// a writing tool directly.
import type { ApiScope } from './api-keys';
import type { GatewayToolDef } from '@golem/shared';

// ---------------------------------------------------------------------------
// protocol versions
// ---------------------------------------------------------------------------

/**
 * The revisions this server speaks, newest first.
 *
 * 2026-07-28 is the current one and it is a real break from what came before: protocol-level
 * sessions are gone, the standalone GET stream is gone, and the handshake moved from `initialize`
 * to `server/discover` with the version carried per-request. The older two are here because that
 * is what shipping clients still send, and a server that only spoke the newest revision would be
 * an MCP server nothing could connect to — see `MCP_EXCLUDED`'s sibling principle: a door nobody
 * can open is the same defect as a door that opens onto nothing.
 */
export const MCP_SUPPORTED_VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18'] as const;
export type McpVersion = (typeof MCP_SUPPORTED_VERSIONS)[number];
export const MCP_LATEST_VERSION: McpVersion = MCP_SUPPORTED_VERSIONS[0];

/** Revisions that use `server/discover` and per-request `_meta`, rather than an `initialize` turn. */
export const MCP_MODERN_VERSIONS: readonly McpVersion[] = ['2026-07-28'];

export const MCP_PROTOCOL_HEADER = 'MCP-Protocol-Version';
export const MCP_METHOD_HEADER = 'Mcp-Method';
export const MCP_NAME_HEADER = 'Mcp-Name';
export const MCP_META_VERSION = 'io.modelcontextprotocol/protocolVersion';
export const MCP_META_SERVER_INFO = 'io.modelcontextprotocol/serverInfo';

export const MCP_SERVER_INFO = { name: 'apple', version: '1.0.0' } as const;

export const MCP_INSTRUCTIONS =
  'Read-only access to a Roblox project Apple builds inside the user\'s own Studio session, including bounded offline creation guidance. ' +
  'Every tool takes `project_id`, which must be a project this API key was granted. ' +
  'These tools only read: to change a place, start an agent run with POST /v1/projects/{id}/runs, ' +
  'which puts the change through Apple\'s own checkpoints, asset policy and review.';

// ---------------------------------------------------------------------------
// JSON-RPC codes
// ---------------------------------------------------------------------------

export const RPC = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  /** MCP's own: the client asked for a protocol revision this server does not speak. */
  unsupportedProtocolVersion: -32022,
  /**
   * MCP's own: a standard request header restates something the body also says, and the two do not
   * match. The CODE is the part that matters — 2026-07-28 tells a client seeing this to refresh the
   * tool's inputSchema and retry, and a client cannot do that for an error it cannot identify.
   */
  headerMismatch: -32020,
  /** Implementation-defined. The credential is valid but may not do this. */
  forbidden: -32003,
} as const;

// ---------------------------------------------------------------------------
// standard request headers
// ---------------------------------------------------------------------------

/**
 * WHY A SERVER MUST COMPARE THESE AT ALL.
 *
 * 2026-07-28 has the client restate the called method and tool name in `Mcp-Method` and `Mcp-Name`
 * headers, so that things between the client and this worker can route and filter without parsing
 * a JSON body. That convenience is also the hazard, and the spec names it: if the two are allowed
 * to disagree, the component doing the ENFORCING reads one of them and the worker doing the WORK
 * reads the other. A gateway rule that passes `Mcp-Method: tools/list` would, against a server that
 * never compares, be waving through a `tools/call` it never looked at.
 *
 * So a disagreement is refused before anything is served. The headers are checked WHEN PRESENT
 * rather than demanded: absence cannot produce the disagreement — nothing upstream can have keyed
 * off a header nobody sent — and this endpoint still answers the handshake-based revisions, whose
 * clients send neither header.
 */

/**
 * Decode a standard header value.
 *
 * Header values are ASCII, so a name that is not gets a base64 sentinel. Returns null when the
 * value LOOKS encoded but cannot be decoded — the caller refuses in that case rather than falling
 * back to a literal comparison, because a literal comparison of an encoded value would report a
 * mismatch that is an artefact of the encoding, and passing it would be claiming an agreement
 * nobody verified. A value that is not sentinel-shaped is already plain and is returned as-is.
 */
export function decodeHeaderValue(raw: string): string | null {
  const m = /^=\?(?:[A-Za-z0-9-]+\?)?[Bb]\?([A-Za-z0-9+/=]*)\?=$/.exec(raw);
  if (!m) return raw;
  try {
    const bin = atob(m[1]!);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    // `fatal` is the point: invalid UTF-8 must throw and become a refusal, rather than decoding to
    // replacement characters and being compared as though it had been understood.
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return null;
  }
}

/** The tool or resource a request names in its BODY — what `Mcp-Name` has to agree with. */
function bodyName(params: Record<string, unknown>): string | null {
  if (typeof params.name === 'string') return params.name;
  if (typeof params.uri === 'string') return params.uri;
  return null;
}

/**
 * Compare the standard headers against the body. Returns the refusal message, or null to proceed.
 *
 * Pure, and separate from the route, so the comparison can be tested without an HTTP server and
 * so there is exactly one place that decides what "these disagree" means.
 */
export function headerDisagreement(
  headers: { method: string | null; name: string | null },
  request: { method: string; params: Record<string, unknown> },
): string | null {
  if (headers.method !== null) {
    const decoded = decodeHeaderValue(headers.method);
    if (decoded === null) {
      return `${MCP_METHOD_HEADER} is encoded in a form this server cannot decode, so it cannot be checked against the body.`;
    }
    if (decoded !== request.method) {
      return `Header mismatch: ${MCP_METHOD_HEADER} header value '${decoded}' does not match body value '${request.method}'.`;
    }
  }
  if (headers.name !== null) {
    const decoded = decodeHeaderValue(headers.name);
    if (decoded === null) {
      return `${MCP_NAME_HEADER} is encoded in a form this server cannot decode, so it cannot be checked against the body.`;
    }
    const inBody = bodyName(request.params);
    // Only a disagreement between two values present is a mismatch. A header naming something the
    // body does not name at all is not a contradiction of anything, and refusing it would reject
    // requests on a method where the header simply does not apply.
    if (inBody !== null && decoded !== inBody) {
      return `Header mismatch: ${MCP_NAME_HEADER} header value '${decoded}' does not match body value '${inBody}'.`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// the subset
// ---------------------------------------------------------------------------

export interface McpToolEntry {
  /** The name in the agent's registry. The MCP name is the same string — one vocabulary. */
  tool: string;
  /** The API-key scope a caller must hold, from the same list the rest of `/v1` uses. */
  scope: ApiScope;
  /**
   * Whether the call names a project. Every tool here does, and the field exists so that adding a
   * tool which does NOT is a visible decision rather than a silent one — a door on this surface
   * that a key's project grant does not describe would be the only ungated thing on it.
   */
  needsProject: true;
}

/**
 * Registry tools that are safe on this read-only surface even though they issue no Studio op.
 *
 * Their data is checked into the Worker bundle and the implementations are `studio: false`: no
 * provider inference, no network request, no mutation. MCP still requires a granted `project_id`
 * so every call remains anchored to the same tenant/project authorization boundary as place reads.
 */
export const MCP_OFFLINE_STATIC_TOOLS = [
  'search_creation_skills',
  'read_creation_skill',
  'get_genre_references',
] as const;

export const MCP_TOOLS: readonly McpToolEntry[] = [
  { tool: 'get_project_tree', scope: 'projects:read', needsProject: true },
  { tool: 'list_scripts', scope: 'projects:read', needsProject: true },
  { tool: 'read_script', scope: 'projects:read', needsProject: true },
  { tool: 'search_scripts', scope: 'projects:read', needsProject: true },
  { tool: 'find_symbol', scope: 'projects:read', needsProject: true },
  { tool: 'review_scripts', scope: 'projects:read', needsProject: true },
  { tool: 'get_instance', scope: 'projects:read', needsProject: true },
  { tool: 'get_selection', scope: 'projects:read', needsProject: true },
  { tool: 'viewport_info', scope: 'projects:read', needsProject: true },
  { tool: 'get_output_logs', scope: 'projects:read', needsProject: true },
  { tool: 'search_creation_skills', scope: 'projects:read', needsProject: true },
  { tool: 'read_creation_skill', scope: 'projects:read', needsProject: true },
  { tool: 'get_genre_references', scope: 'projects:read', needsProject: true },
];

export const MCP_TOOL_NAMES: readonly string[] = MCP_TOOLS.map((t) => t.tool);

const BY_NAME = new Map(MCP_TOOLS.map((t) => [t.tool, t]));

export function mcpTool(name: unknown): McpToolEntry | undefined {
  return typeof name === 'string' ? BY_NAME.get(name) : undefined;
}

/**
 * The Studio ops an exposed tool is allowed to send to the plugin.
 *
 * Membership of MCP_TOOLS is a CLAIM that a tool only reads. For Studio-backed tools this list makes
 * the claim checkable: the test re-derives the ops each exposed tool issues — following the helpers it calls,
 * because `dumpScripts` sends `dump_scripts` from outside the tool's own body and a scrape that
 * stopped at the block boundary would have reported a tool as read-only without having looked at
 * the path that does most of its work. `MCP_OFFLINE_STATIC_TOOLS` is the explicit second class:
 * read-only tools that issue no Studio op at all.
 */
export const MCP_READ_ONLY_STUDIO_OPS: readonly string[] = [
  'get_tree',
  'list_scripts',
  'read_script',
  'dump_scripts',
  'search_scripts',
  'get_instance',
  'get_selection',
  'viewport_info',
  'get_logs',
];

/**
 * Every registry tool that is NOT on this surface, and why.
 *
 * These are reasons rather than labels because the next person to read them will be deciding
 * whether to add something, and "writes" does not tell them what the line is. The line is: this
 * surface reads a place. A change to a customer's place goes through an agent run, where the
 * checkpoint, the asset policy and the review all happen; a credential that could skip those
 * would make every one of them optional.
 */
export const MCP_EXCLUDED: Readonly<Record<string, string>> = {
  // ---- writes into the customer's place -------------------------------------------------
  edit_script: 'Writes script source into the place. Script changes go through an agent run, which checkpoints first and reviews after.',
  format_script: 'Rewrites a script in place. Harmless-looking and still a write: a formatter run by a program nobody watched is a diff the owner did not ask for.',
  create_instances: 'Creates instances in the place. A build belongs to an agent run, where a checkpoint exists to undo it.',
  set_properties: 'Mutates existing instances. Same reason as create_instances, and easier to do damage with because it overwrites rather than adds.',
  edit_terrain: 'Changes Terrain voxels and materials in the open place. Terrain authoring belongs to a consented agent run with its normal safety and review fences.',
  build_scene: 'Builds a whole environment (terrain, instances, lighting, Baseplate visibility) in the open place. Belongs to a consented agent run with its checkpoint and review fences.',
  delete_instances: 'Deletes instances. The single most destructive tool in the registry; the checkpoint an agent run takes first is exactly what makes it survivable.',
  move_instances: 'Reparents existing objects in the place. Direct hierarchy writes stay behind the watched agent-run consent and checkpoint path.',
  transform_instances: 'Moves, rotates, or scales existing objects. Direct spatial edits stay behind the watched agent-run consent and verification path.',
  clone_instances: 'Duplicates project objects. Creation belongs to an agent run where the user has edit consent and the resulting hierarchy can be verified.',
  group_instances: 'Creates a Model and reparents existing objects into it. That is a project write and is intentionally unavailable to direct MCP calls.',
  ungroup_instances: 'Reparents children and removes their former container. That write must pass through the normal agent-run edit and checkpoint fences.',
  rename_instance: 'Renames an existing project object and changes its path. Direct MCP credentials are read-only and cannot make that edit.',
  set_locked: 'Changes Studio Locked state on project parts. It is a write to the open place and belongs to a consented agent run.',
  set_visible: 'Changes visibility on project instances. It is a write to the open place and belongs to a consented agent run.',
  set_mood: 'Rewrites the place\'s Lighting setup wholesale. A visible, whole-scene change that no external client should be able to make unannounced.',
  add_effect: 'Attaches particle and light emitters to instances in the place, which is a visible change to the scene the owner is looking at.',
  remove_effect: 'Strips emitters off instances in the place, destroying work an agent run or a person put there.',
  install_module: 'Writes a ModuleScript into the place and wires it up: a code change made by a program nobody was watching.',
  insert_asset: 'Brings third-party content into the place. It passes an asset policy and a post-insertion script scan inside an agent run; a direct caller would be the one path around them.',
  generate_model: 'Creates geometry and parents it into the place, and spends on generation to do it.',
  remember: 'Writes a durable fact into project memory, which steers every later agent run. A program that can edit the agent\'s standing instructions is writing the place slowly.',
  create_checkpoint: 'Snapshots the whole place into Durable Object storage. Cheap to call, not cheap to serve; a loop over it is a storage bill.',
  set_properties_bulk: 'Changes up to 500 instances in one call. The widest single write in the registry; it belongs to an agent run with its checkpoint.',
  scatter_instances: 'Places up to 200 copies of an object into the place. A build belongs to an agent run, where a checkpoint exists to undo it.',
  collision_groups: 'Registers collision groups and changes which collide, which changes how the whole game plays. A write to the place.',
  shape_terrain: 'Changes Terrain voxels, water and material colours in the open place. Terrain authoring belongs to a consented agent run.',
  create_rig: 'Adds a character model to the place. A build belongs to an agent run.',
  build_ui: 'Adds a whole ScreenGui to StarterGui. A build belongs to an agent run.',

  // ---- runs code, or runs the game -------------------------------------------------------
  run_luau: 'Executes arbitrary Luau in the user\'s Studio. There is no subset of this that is read-only, and it is the one tool that makes every other exclusion here pointless.',
  run_and_check: 'Starts and stops Run mode in the user\'s Studio. It takes over the window of whoever is sitting at it.',
  play_check: 'Starts a Test session with a player in the user\'s Studio and inserts a temporary harness for it. It takes over the window of whoever is sitting at it.',
  play_check_ui: 'play_check plus clicking on-screen buttons in the running game: the same takeover of the window of whoever is sitting at it.',
  run_spec: 'Executes assertion code against the place\'s modules, which means executing code.',
  audit_build: 'Runs Luau probes AND a panel of critic models. Both halves disqualify it: it executes, and it spends.',

  // ---- spends on inference ---------------------------------------------------------------
  render_view: 'Rasterises the viewport and returns images. It bills against the render budget, and the budget exists because this is the expensive thing the product does.',
  compose_thumbnail: 'Rasterises every camera angle of the place and stores a PNG against the project. It reads nothing a client could not get from render_view, and it costs the same five rasterises — each of which briefly freezes the window of whoever is sitting at that Studio.',
  inspect_visually: 'Renders the scene and has a vision model critique it. Paid inference on every call.',
  check_composition: 'Runs a model over the blockout. Paid inference on every call.',
  generate_image: 'Paid image generation on every call, billed to the project owner rather than to whoever is driving the client.',
  generate_ui_image_hf: 'Paid image generation on a provider capped at a few calls a day for the whole deployment; an MCP client could spend the day\'s allowance for every user.',
  generate_model_external: 'Uploads a generated Model into the project owner\'s own Roblox account with their connected key, then inserts it into the place.',
  ocr_image: 'Paid vision inference over an image the caller supplies, billed to the project owner.',
  design_sound: 'Paid inference: it reasons over a scene to decide what that scene should sound like.',
  generate_sound: 'Paid audio generation, and the result is uploaded to Roblox under the product\'s own creator account.',
  speak_line: 'Paid speech synthesis, and the result is uploaded to Roblox under the product\'s own creator account.',
  assign_sounds: 'Writes Sound instances into the place, and generates audio to fill them.',
  search_docs: 'Embeds the query before searching, so every call is an inference call. An MCP client already has documentation search of its own; this one costs the owner money.',

  // ---- reaches outside the place on the caller's behalf ----------------------------------
  find_verified_asset: 'Calls the Roblox Creator Store from the worker. An unauthenticated program driving the product\'s outbound requests is a way to borrow its reputation and its rate limit.',
  choose_asset_source: 'Advises which source a piece of a scene should come from. It names no project, so nothing about a key\'s grant could scope it, and it is advice for a build this surface cannot make.',
  web_fetch: 'Makes the worker fetch a URL the caller chooses. An MCP client has its own fetch; this one would run from inside the product\'s network.',
  browse_page: 'Same as web_fetch, with page rendering on top, so it costs as well as reaching outward from inside the product\'s network.',
  web_search: 'Outbound search on the caller\'s behalf, billed to the product\'s own search credential.',
  docs_lookup: 'Outbound documentation lookup spending the product\'s own Context7 key and rate limit; an MCP client already has documentation access of its own.',
  screenshot_page: 'Outbound page rendering on the caller\'s behalf, billed to the product\'s own rendering credential.',
  github_lookup: 'Outbound GitHub reads spending the product\'s token and rate limit; an MCP client already has repository access of its own.',
  git_history: 'Outbound GitHub reads spending the product\'s token and rate limit; an MCP client already has repository access of its own.',

  // ---- read-only, and still not here -----------------------------------------------------
  propose_plan: 'Announces the plan for an agent run, and an MCP call is not an agent run. It writes nothing to the place and costs nothing, and is still excluded: the build_plan panel it posts into the project is emitted with every step pending, and only the run loop settles those steps against what actually ran. Called from here there is no run to settle them, so the owner would be shown a checklist of work that is not happening.',
  focus_camera: 'Moves the camera of whoever is sitting in Studio. It writes nothing to the place and still takes the screen away from a person who did not ask.',
  select_instances: 'Changes what that person has selected, which is the state their next click acts on.',
  find_mechanic: 'Reads a static pattern table and cites public repositories, so it writes nothing, spends nothing and reaches nowhere. Excluded on the same rule as choose_asset_source and get_genre_kit: it names no project, so a key\'s grant has nothing to scope the call by.',
  get_ui_construction: 'Reads a statically bundled corpus of how shipped Roblox interfaces are constructed — stroke weights, radii, tiles per row — so it writes nothing, spends nothing and reaches nowhere. Excluded on the same rule as get_genre_kit: it names no project, so a key\'s grant has nothing to scope the call by, and it is the opening move of a build this surface cannot make.',
  get_verified_module: 'Hands over Luau this repository authored and executed against its own checks. It writes nothing and reaches nowhere, but it is excluded rather than exposed for the reason above AND one of its own: a key holder who could pull the module bodies out one id at a time would be using this surface as a source distribution channel, which is not what a project-scoped grant is for.',
  get_genre_kit: 'Reads a static kit — palette, Lighting values, library queries and pinned sound ids — so it writes nothing, spends nothing and reaches nowhere. It is excluded on the other rule this surface has: it names no project, so a key\'s grant has nothing to scope it by, exactly as with choose_asset_source. It is also the opening move of a build this surface cannot make.',
  inspect_model: 'Asset QC for a model this surface can neither generate nor insert. It belongs to the build pipeline, and the build pipeline is reached through an agent run.',
  workspace_list: 'Reads Apple\'s own per-project scratch storage rather than the Roblox place. No scope in API_SCOPES describes it, and reusing projects:read would silently widen every key already minted.',
  workspace_read: 'Same as workspace_list: a different resource from the place, needing a scope the credential model does not yet have.',
  workspace_write: 'Writes into that scratch storage, so it fails the read-only rule as well.',
  search_instances: 'Read-only, and excluded until MCP negotiates plugin capabilities: it stands on an OPT-IN plugin operation, and this surface does not filter tools by what the connected plugin reports, so it would be offered to plugins that refuse it.',
  spatial_query: 'Read-only, excluded for the same reason as search_instances: its plugin operation is opt-in and MCP does not check the connected plugin supports it.',
  read_terrain: 'Read-only, excluded for the same reason as search_instances: its plugin operation is opt-in and MCP does not check the connected plugin supports it.',
  check_ui_layout: 'Changes nothing in the place, but it builds a temporary copy of a screen in Studio\'s own UI layer, and its plugin operation is opt-in, which MCP does not negotiate. Excluded for both reasons.',
};

// ---------------------------------------------------------------------------
// tools/list
// ---------------------------------------------------------------------------

/** Every call names its project; the caller's key decides whether that name is allowed. */
export const PROJECT_ID_SCHEMA = {
  type: 'string',
  description: 'The Apple project to read. Must be one this API key was granted; GET /v1/projects lists them.',
} as const;

export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Build the published tool list from the AGENT'S OWN definitions.
 *
 * Re-typing names, descriptions and schemas here would create a second list that drifts: the
 * registry's `read_script` would grow a `base_hash` argument and the MCP copy would keep telling
 * clients about the old shape. So the descriptions and schemas are whatever the registry says
 * today, and the only thing this function adds is `project_id` — which the agent never needs
 * because the agent is already inside one session, and an MCP client always does because it is not.
 */
export function mcpToolList(defs: readonly GatewayToolDef[]): McpToolDescriptor[] {
  const byName = new Map(defs.map((d) => [d.name, d]));
  const out: McpToolDescriptor[] = [];
  for (const entry of MCP_TOOLS) {
    const def = byName.get(entry.tool);
    // A tool this surface claims to expose but the registry does not define is a broken build, not
    // a tool to publish with an invented description.
    if (!def) continue;
    const params = (def.parameters ?? {}) as { properties?: Record<string, unknown>; required?: unknown };
    const required = Array.isArray(params.required) ? params.required.filter((r): r is string => typeof r === 'string') : [];
    out.push({
      name: def.name,
      description: def.description,
      inputSchema: {
        type: 'object',
        properties: { project_id: PROJECT_ID_SCHEMA, ...(params.properties ?? {}) },
        required: ['project_id', ...required.filter((r) => r !== 'project_id')],
      },
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// version negotiation
// ---------------------------------------------------------------------------

export type VersionVerdict =
  | { ok: true; version: McpVersion }
  | { ok: false; code: typeof RPC.unsupportedProtocolVersion; supported: McpVersion[]; requested: string };

function isSupported(v: unknown): v is McpVersion {
  return typeof v === 'string' && (MCP_SUPPORTED_VERSIONS as readonly string[]).includes(v);
}

/**
 * Resolve a requested revision.
 *
 * An absent request is the LEGACY case, not the modern one: a client that sends no version header
 * and no `_meta` is an `initialize`-era client, and answering it as if it had asked for 2026-07-28
 * would hand it `resultType` fields and a handshake it does not understand. So absence resolves to
 * the newest revision that still uses the old handshake.
 */
export function negotiateVersion(requested: unknown): VersionVerdict {
  if (requested === undefined || requested === null || requested === '') {
    return { ok: true, version: '2025-11-25' };
  }
  if (isSupported(requested)) return { ok: true, version: requested };
  return {
    ok: false,
    code: RPC.unsupportedProtocolVersion,
    supported: [...MCP_SUPPORTED_VERSIONS],
    requested: String(requested),
  };
}

export function isModern(version: McpVersion): boolean {
  return MCP_MODERN_VERSIONS.includes(version);
}

// ---------------------------------------------------------------------------
// envelopes
// ---------------------------------------------------------------------------

export type RpcId = string | number | null;

export interface RpcRequest {
  id: RpcId;
  method: string;
  params: Record<string, unknown>;
  /** A JSON-RPC notification carries no id and gets no response body. */
  isNotification: boolean;
}

export type RpcParse = { ok: true; request: RpcRequest } | { ok: false; code: number; message: string };

/**
 * Validate the envelope before anything reads the payload.
 *
 * Arrays are refused rather than iterated: JSON-RPC batching was removed from MCP in 2025-06-18,
 * and honouring it here would be implementing a transport feature the spec dropped — with the
 * amplification that comes free, since one authenticated request would become fifty tool calls
 * against a customer's Studio.
 */
export function parseRpc(raw: unknown): RpcParse {
  if (Array.isArray(raw)) {
    return { ok: false, code: RPC.invalidRequest, message: 'JSON-RPC batching is not part of MCP. Send one request per POST.' };
  }
  if (!raw || typeof raw !== 'object') {
    return { ok: false, code: RPC.invalidRequest, message: 'The request body must be a JSON-RPC object.' };
  }
  const o = raw as Record<string, unknown>;
  if (o.jsonrpc !== '2.0') {
    return { ok: false, code: RPC.invalidRequest, message: "Missing or wrong 'jsonrpc': this endpoint speaks JSON-RPC 2.0." };
  }
  if (typeof o.method !== 'string' || o.method === '') {
    return { ok: false, code: RPC.invalidRequest, message: "'method' is required." };
  }
  const hasId = 'id' in o && o.id !== null && o.id !== undefined;
  const id = typeof o.id === 'string' || typeof o.id === 'number' ? o.id : null;
  const params = o.params && typeof o.params === 'object' && !Array.isArray(o.params) ? (o.params as Record<string, unknown>) : {};
  return { ok: true, request: { id, method: o.method, params, isNotification: !hasId } };
}

/** The version a request declares in `_meta`, if it declares one. */
export function metaVersion(params: Record<string, unknown>): string | null {
  const meta = params._meta;
  if (!meta || typeof meta !== 'object') return null;
  const v = (meta as Record<string, unknown>)[MCP_META_VERSION];
  return typeof v === 'string' ? v : null;
}

export function rpcError(id: RpcId, code: number, message: string, data?: unknown): Record<string, unknown> {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

export function rpcResult(id: RpcId, result: Record<string, unknown>, version: McpVersion): Record<string, unknown> {
  // `resultType` arrived with 2026-07-28. Sending it to an older client is an unknown field on a
  // result it thought it knew the shape of, so it is added only when the negotiated revision has it.
  return { jsonrpc: '2.0', id, result: isModern(version) ? { resultType: 'complete', ...result } : result };
}

// ---------------------------------------------------------------------------
// method results
// ---------------------------------------------------------------------------

export const MCP_CAPABILITIES = { tools: {} } as const;

/** 2026-07-28's handshake: one request, cacheable, no session established. */
export function discoverResult(): Record<string, unknown> {
  return {
    supportedVersions: [...MCP_SUPPORTED_VERSIONS],
    capabilities: MCP_CAPABILITIES,
    instructions: MCP_INSTRUCTIONS,
    _meta: { [MCP_META_SERVER_INFO]: MCP_SERVER_INFO },
    // A minute. The tool list is a property of the deployment, not of any project's live state, so
    // it is worth caching — but a deploy that adds a tool should reach clients the same day.
    ttlMs: 60_000,
    cacheScope: 'public',
  };
}

/** The pre-2026-07-28 handshake, for the clients that still send it. */
export function initializeResult(version: McpVersion): Record<string, unknown> {
  return {
    protocolVersion: version,
    capabilities: MCP_CAPABILITIES,
    serverInfo: MCP_SERVER_INFO,
    instructions: MCP_INSTRUCTIONS,
  };
}

/**
 * A tool result.
 *
 * `isError` rather than a JSON-RPC error, because a tool that ran and failed is something the
 * CALLING MODEL should see and react to — "Studio is not connected" is an instruction to the user,
 * not a transport fault. Refusals about the CREDENTIAL go the other way, as JSON-RPC errors: a
 * model should not be handed "you lack this scope" as something to try working around.
 */
export function toolResult(text: string, isError: boolean): Record<string, unknown> {
  return { content: [{ type: 'text', text }], isError };
}
