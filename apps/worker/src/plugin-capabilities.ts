import type { PluginCapabilityReportV1, PluginOperationCapability, StudioOp } from '@golem/shared';

/**
 * Explicit Studio-operation capability report sent by a plugin poll.
 *
 * This is deliberately independent of plugin version. Version skew is normal for Studio plugins,
 * and a version string cannot prove that one operation exists. A missing, malformed, or newer
 * report therefore means "unknown" and preserves the existing tool set. Only an explicit
 * `unsupported` entry may remove a tool.
 */
export const PLUGIN_CAPABILITY_SCHEMA = 'golem.studio-ops.v1' as const;

export type StudioOpName = StudioOp['op'];
export type PluginOperationStatus = 'supported' | 'unsupported';

export interface ParsedPluginCapabilities {
  schema: typeof PLUGIN_CAPABILITY_SCHEMA;
  operations: ReadonlyMap<string, Readonly<PluginOperationCapability>>;
}

export type ToolStudioRequirements = Readonly<Record<string, readonly StudioOpName[]>>;

export interface PluginToolLimitation {
  operation: StudioOpName;
  reason: string;
  tools: string[];
}

export interface PluginToolFilter {
  /** False means legacy/unknown: only OPT_IN_OPERATIONS tools were withheld; nothing else was filtered. */
  capabilitiesKnown: boolean;
  allowed: Set<string>;
  withheld: string[];
  limitations: PluginToolLimitation[];
}

/**
 * OPERATIONS NO INSTALLED PLUGIN EVER HAD, which therefore cannot be left to "unknown".
 *
 * The rule above — missing means unknown, and unknown keeps the tool — protects the tools every
 * plugin already executes. It is the wrong rule for an operation that is NEWER than the plugins in
 * customers' hands: the 1.1.0 store build reports every op it has and simply does not name
 * `play_check`, so "unknown" would offer a player-side check that is refused on first call, and the
 * model would be left to explain a check that never ran. A tool standing on one of these is offered
 * only when the plugin says, explicitly, `supported` — including in compatibility mode.
 */
export const OPT_IN_OPERATIONS: ReadonlySet<StudioOpName> = new Set<StudioOpName>([
  'play_check',
  // D-VISION-1 Phase A: the op families in apps/apple-plugin/src/ops. No plugin before them had any.
  'query_instances', 'set_props_bulk', 'spatial_query', 'scatter', 'collision_groups', 'collision_groups_list',
  'terrain_shape', 'terrain_read', 'create_rig', 'ui_layout_check', 'play_check_ui',
]);
const NOT_REPORTED = 'the connected Studio plugin does not report this operation';

const MAX_OPERATIONS = 128;
const MAX_REASON_CHARS = 240;
const MAX_NOTE_OPERATIONS = 12;
const MAX_NOTE_TOOLS_PER_OPERATION = 12;
const OP_NAME = /^[a-z][a-z0-9_]{0,63}$/;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function reasonText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean || clean.length > MAX_REASON_CHARS) return null;
  return clean;
}

/**
 * Parse an untrusted capability report without guessing around damaged input.
 *
 * Unknown schema, duplicate operation names, unsupported entries without an explanation, and
 * malformed shapes all return null. `null` is compatibility mode: callers must keep the tools they
 * would have offered before capability negotiation existed.
 */
export function parsePluginCapabilities(raw: unknown): ParsedPluginCapabilities | null {
  const top = record(raw);
  if (!top || top.schema !== PLUGIN_CAPABILITY_SCHEMA || !Array.isArray(top.operations)) return null;
  if (top.operations.length < 1 || top.operations.length > MAX_OPERATIONS) return null;

  const operations = new Map<string, Readonly<PluginOperationCapability>>();
  for (const rawEntry of top.operations) {
    const entry = record(rawEntry);
    if (!entry || typeof entry.op !== 'string' || !OP_NAME.test(entry.op)) return null;
    if (entry.status !== 'supported' && entry.status !== 'unsupported') return null;
    if (operations.has(entry.op)) return null;

    if (entry.status === 'unsupported') {
      const reason = reasonText(entry.reason);
      if (!reason) return null;
      operations.set(entry.op, Object.freeze({ op: entry.op, status: 'unsupported', reason }));
    } else {
      operations.set(entry.op, Object.freeze({ op: entry.op, status: 'supported' }));
    }
  }

  return { schema: PLUGIN_CAPABILITY_SCHEMA, operations };
}

/** Canonical bounded DTO safe to persist after parsing untrusted poll input. */
export function normalisePluginCapabilities(raw: unknown): PluginCapabilityReportV1 | null {
  const parsed = parsePluginCapabilities(raw);
  if (!parsed) return null;
  return {
    schema: PLUGIN_CAPABILITY_SCHEMA,
    operations: [...parsed.operations.values()].map((entry) => (
      entry.status === 'unsupported'
        ? { op: entry.op, status: 'unsupported', reason: entry.reason! }
        : { op: entry.op, status: 'supported' }
    )),
  };
}

export type PluginOperationVerdict =
  | { status: 'unknown' }
  | { status: 'supported' }
  | { status: 'unsupported'; reason: string };

/** Ask only what the plugin explicitly said about one operation. Missing means unknown. */
export function pluginOperationVerdict(
  capabilities: ParsedPluginCapabilities | null,
  operation: StudioOpName,
): PluginOperationVerdict {
  const entry = capabilities?.operations.get(operation);
  if (!entry) return { status: 'unknown' };
  if (entry.status === 'supported') return { status: 'supported' };
  return { status: 'unsupported', reason: entry.reason! };
}

/**
 * Narrow an already-authorised tool set to what this plugin explicitly says it can execute.
 *
 * `requirements` belongs beside the real tool registry: it describes which Studio operations a
 * tool actually invokes. This helper intentionally does not carry a second hand-maintained list of
 * tool names. A tool with no declared Studio-op requirement, an operation omitted by the report,
 * or a legacy client with no valid report is left alone — except a tool that needs one of
 * OPT_IN_OPERATIONS, which is withheld unless that operation is explicitly reported supported.
 */
export function filterToolsForPlugin(
  candidates: Iterable<string>,
  requirements: ToolStudioRequirements,
  rawCapabilities: unknown,
): PluginToolFilter {
  const names = [...new Set(candidates)];
  const parsed = parsePluginCapabilities(rawCapabilities);

  const allowed = new Set<string>();
  const withheld: string[] = [];
  const byOperation = new Map<StudioOpName, PluginToolLimitation>();

  for (const tool of names) {
    const blockers: { operation: StudioOpName; reason: string }[] = [];
    for (const operation of requirements[tool] ?? []) {
      const verdict = pluginOperationVerdict(parsed, operation);
      if (verdict.status === 'unsupported') blockers.push({ operation, reason: verdict.reason });
      else if (verdict.status === 'unknown' && OPT_IN_OPERATIONS.has(operation)) blockers.push({ operation, reason: NOT_REPORTED });
    }

    if (blockers.length === 0) {
      allowed.add(tool);
      continue;
    }

    withheld.push(tool);
    for (const blocker of blockers) {
      const existing = byOperation.get(blocker.operation);
      if (existing) {
        existing.tools.push(tool);
      } else {
        byOperation.set(blocker.operation, {
          operation: blocker.operation,
          reason: blocker.reason,
          tools: [tool],
        });
      }
    }
  }

  return {
    capabilitiesKnown: parsed !== null,
    allowed,
    withheld,
    limitations: [...byOperation.values()],
  };
}

/**
 * Bounded MODEL-facing explanation for the tools removed above.
 *
 * Deliberately excludes the plugin-authored `reason`. A paired Studio client is still an external
 * input and its text must not be promoted into a system instruction. The complete, precise reason
 * remains on structured `limitations` for an ordinary user-facing/audit surface. Tool and operation
 * names here come from the Worker's own registry/requirements map.
 */
export function pluginCapabilityPromptNote(filter: Pick<PluginToolFilter, 'limitations'>): string | null {
  if (filter.limitations.length === 0) return null;
  const visible = filter.limitations.slice(0, MAX_NOTE_OPERATIONS);
  const lines = visible.map((item) => {
    const shown = item.tools.slice(0, MAX_NOTE_TOOLS_PER_OPERATION);
    const omitted = item.tools.length - shown.length;
    const tools = shown.join(', ') + (omitted > 0 ? `, +${omitted} more` : '');
    return `- ${item.operation} is unavailable. Withheld tools: ${tools}.`;
  });
  const omittedOperations = filter.limitations.length - visible.length;
  if (omittedOperations > 0) lines.push(`- +${omittedOperations} more reported Studio limitations.`);
  return `Connected Studio limitations:\n${lines.join('\n')}\nUse the Studio tools still offered and do not claim a withheld operation ran.`;
}
