// @golem/shared — wire protocol + domain types shared by worker, web app, evals.
// The Studio plugin (Luau) mirrors these shapes; apps/plugin/src/Protocol.luau documents the mapping.

// ---------------------------------------------------------------------------
// Studio op protocol: commands the agent sends to the Studio plugin.
// Instance paths are game-tree paths like "game.Workspace.Lobby.Door" (names
// escaped with ["..."] when they contain dots/spaces).
// ---------------------------------------------------------------------------

export type PropValue =
  | { t: 'string'; v: string }
  | { t: 'number'; v: number }
  | { t: 'bool'; v: boolean }
  | { t: 'Vector3'; v: [number, number, number] }
  | { t: 'Vector2'; v: [number, number] }
  | { t: 'NumberRange'; v: [number, number] }
  | { t: 'Rect'; v: [number, number, number, number] }
  | { t: 'CFrame'; v: number[] } // 12 components
  | { t: 'Color3'; v: [number, number, number] } // 0..1
  | { t: 'UDim2'; v: [number, number, number, number] }
  | { t: 'UDim'; v: [number, number] }
  | { t: 'EnumItem'; v: string } // "Enum.Material.Neon"
  | { t: 'BrickColor'; v: string }
  | { t: 'Content'; v: string } // rbxassetid://...
  | { t: 'Instance'; v: string } // path reference
  | { t: 'nil' };

export interface InstanceSpec {
  className: string;
  name: string;
  parent: string; // path
  props?: Record<string, PropValue>;
  attributes?: Record<string, PropValue>;
  children?: Omit<InstanceSpec, 'parent'>[];
}

export type StudioOp =
  | { op: 'ping' }
  | { op: 'get_tree'; root?: string; maxDepth?: number; maxNodes?: number }
  | { op: 'get_instance'; path: string } // full props + attributes
  | { op: 'list_scripts'; root?: string }
  | { op: 'read_script'; path: string }
  | {
      op: 'edit_script';
      path: string;
      // exactly one of:
      source?: string; // full replace
      edits?: { find: string; replace: string; all?: boolean }[];
      create?: { className: 'Script' | 'LocalScript' | 'ModuleScript'; parent: string };
    }
  | { op: 'search_scripts'; query: string; root?: string; maxResults?: number }
  | { op: 'create_instances'; items: InstanceSpec[] }
  | { op: 'set_props'; path: string; props?: Record<string, PropValue>; attributes?: Record<string, PropValue> }
  | { op: 'delete_instances'; paths: string[] }
  | { op: 'move_instances'; moves: { path: string; newParent: string }[] }
  | { op: 'run_code'; code: string; timeoutMs?: number } // plugin-context Luau via ModuleScript require
  | { op: 'get_logs'; sinceClock?: number; maxEntries?: number }
  | { op: 'run_mode'; action: 'start' | 'stop' } // RunService:Run()/Stop() server simulation
  | { op: 'get_selection' }
  | { op: 'select'; paths: string[] }
  | { op: 'camera_focus'; path: string }
  | { op: 'viewport_info' } // camera cframe, viewport size, spatial summary
  | { op: 'screenshot'; target?: string } // best-effort; plugin reports capability
  | { op: 'snapshot'; root: string; includeScripts?: boolean } // serialize subtree
  | { op: 'restore'; root: string; snapshot: unknown } // apply a snapshot payload
  | { op: 'insert_asset'; assetId: number; parent: string }
  | { op: 'undo_waypoint'; name: string }; // explicit ChangeHistoryService waypoint

export interface PendingOp {
  id: string; // opaque, unique per op
  seq: number;
  studioOp: StudioOp;
}

export interface OpResult {
  id: string;
  ok: boolean;
  // JSON payload; large payloads (snapshots, trees) may be chunked via resultChunk
  data?: unknown;
  error?: string;
  durationMs?: number;
}

export interface StudioEventLog {
  kind: 'log';
  message: string;
  level: 'info' | 'warn' | 'error' | 'output';
  clock: number;
}
export interface StudioEventState {
  kind: 'state';
  placeName: string;
  placeId: number;
  gameId: number;
  isRunMode: boolean;
  selectionCount: number;
  pluginVersion: string;
}
export type StudioEvent = StudioEventLog | StudioEventState;

// Plugin <-> worker HTTP (plugin long-polls; no WebSocket in Studio)
export interface PluginPollRequest {
  results?: OpResult[];
  events?: StudioEvent[];
  state?: StudioEventState;
}
export interface PluginPollResponse {
  ops: PendingOp[];
  waitMs: number; // suggested next poll delay
  detach?: boolean; // session ended
}

// ---------------------------------------------------------------------------
// Agent + chat protocol (web <-> DO over WebSocket)
// ---------------------------------------------------------------------------

export type GolemMode = 'clay' | 'stone' | 'rune';

export interface ChatAttachment {
  kind: 'image' | 'file';
  name: string;
  r2Key: string;
  mime: string;
  size: number;
}

export type ClientMsg =
  | { type: 'chat'; text: string; mode: GolemMode; attachments?: ChatAttachment[] }
  | { type: 'stop' } // interrupt agent
  | { type: 'resume' }
  | { type: 'checkpoint_create'; label: string }
  | { type: 'checkpoint_restore'; checkpointId: string }
  | { type: 'ping' };

export type ServerMsg =
  | { type: 'hello'; sessionId: string; studioConnected: boolean; quota: QuotaState }
  | { type: 'studio_status'; connected: boolean; state?: StudioEventState }
  | { type: 'msg_start'; msgId: string; role: 'assistant'; mode: GolemMode }
  | { type: 'delta'; msgId: string; text: string }
  | { type: 'tool_start'; msgId: string; toolId: string; tool: string; summary: string }
  | { type: 'tool_end'; msgId: string; toolId: string; ok: boolean; summary: string; detail?: unknown }
  | { type: 'msg_end'; msgId: string; stopReason: 'done' | 'stopped' | 'error' | 'quota'; error?: string }
  | { type: 'agent_status'; phase: string; step?: number; totalSteps?: number }
  | { type: 'quota'; quota: QuotaState }
  | { type: 'checkpoint'; checkpoint: CheckpointMeta }
  | { type: 'studio_log'; entries: StudioEventLog[] }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong' };

export interface QuotaState {
  sparksRemaining: number;
  sparksDaily: number;
  sparksMonthly: number;
  sparksUsedToday: number;
  sparksUsedThisMonth: number;
  resetsAtIso: string;
  plan: 'free' | 'pro';
}

export interface CheckpointMeta {
  id: string;
  label: string;
  createdAt: number;
  kind: 'auto' | 'manual' | 'pre_agent';
  scriptCount: number;
  instanceCount: number;
  sizeBytes: number;
}

// ---------------------------------------------------------------------------
// REST DTOs
// ---------------------------------------------------------------------------

export interface ProjectDto {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  placeName: string | null;
  placeId: number | null;
  lastActivityAt: string | null;
  memorySummary: string | null;
}

export interface MessageDto {
  id: string;
  role: 'user' | 'assistant' | 'system';
  mode: GolemMode | null;
  content: string;
  toolTrace: ToolTraceEntry[] | null;
  createdAt: string;
}

export interface ToolTraceEntry {
  tool: string;
  summary: string;
  ok: boolean;
  durationMs: number;
}

export interface PairingCodeDto {
  code: string; // e.g. "GLM-7F3K2Q"
  expiresAtIso: string;
}

// Model gateway internals (worker-side only, exported for evals)
export interface GatewayRequest {
  model: string; // internal model key, not provider id
  messages: { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string; name?: string }[];
  tools?: GatewayToolDef[];
  maxTokens?: number;
  temperature?: number;
  jsonSchema?: unknown;
  stream?: boolean;
}
export interface GatewayToolDef {
  name: string;
  description: string;
  parameters: unknown; // JSON schema
}
export interface GatewayToolCall {
  id: string;
  name: string;
  arguments: string; // raw JSON string
}
export interface GatewayResponse {
  text: string;
  toolCalls: GatewayToolCall[];
  usage: { inputTokens: number; outputTokens: number };
  /** what this call actually cost, in Cloudflare neurons */
  neurons: number;
  provider: string;
  model: string;
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
}

/**
 * Sparks are billed from the neurons a run actually consumes (1 Spark = 90 neurons), so these
 * are *typical measured* costs shown in the UI, not fixed prices. Measured 2026-08-30:
 * Clay ~29 neurons, Stone answer-only ~139, Stone full build+verify in Studio ~1,266.
 */
export const MODE_INFO: Record<GolemMode, { name: string; blurb: string; sparksPerRequest: number; typicalSparks: string }> = {
  clay: { name: 'Clay', blurb: 'Fast answers and small edits', sparksPerRequest: 1, typicalSparks: '~1' },
  stone: { name: 'Stone', blurb: 'Builds features across your project', sparksPerRequest: 2, typicalSparks: '2-15' },
  rune: { name: 'Rune', blurb: 'Plans, builds, tests and fixes autonomously', sparksPerRequest: 3, typicalSparks: '10-30' },
};

export const PROTOCOL_VERSION = 1;
