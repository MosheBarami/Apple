// What Apple is allowed to DO, as a thing a person can set.
//
// The worker has enforced tool permissions for a while — preferences.ts validates each name
// against the real tool registry, merges org → user → project towards the STRICTEST answer, and
// narrows the run's toolset before the model is ever offered a tool. Until now nothing in the
// product could set one, which made the whole mechanism a library.
//
// THE DECISIONS LIVE HERE, in a file with no JSX, because three of them are not obvious:
//
//   ALLOW IS NOT STORED. It is the absence of a restriction, not a restriction. A stored `allow`
//   is a memory row, an audit line and a merge input that all say nothing — and it outlives the
//   decision, so lifting a denial later leaves behind a row reading "allowed" that the history
//   renders as something somebody chose.
//
//   THE LAYER IN FORCE IS NOT THIS LAYER. The merged value the server returns already contains
//   this layer's own contribution, so "the merged answer is stricter than mine" is the only honest
//   evidence that another layer imposed it. Locking on the merged value alone would lock a person
//   out of the denial they themselves had just set.
//
//   PRECEDENCE IS NOT RECOMPUTED HERE. The server merges, with the same function the agent's
//   prompt is built from. This file only COMPARES two values it was handed, using the strictness
//   order that lives in @golem/shared — a second implementation of the layering rule in the
//   browser would disagree with the server the first time either one changed.
import { GOVERNED_TOOLS, GOVERNED_TOOL_NAMES, TOOL_PERMISSIONS, isToolPermission, toolPermissionRank, type ToolPermission } from '@golem/shared';
import type { MemoryScope } from './api';

export { GOVERNED_TOOLS, GOVERNED_TOOL_NAMES, TOOL_PERMISSIONS };
export type { ToolPermission };

export type PermissionMap = Record<string, ToolPermission>;

/**
 * What this layer says about one tool.
 *
 * Anything that is not one of the three words is not a permission. Guessing `deny` for junk would
 * silently disable a tool nobody disabled; guessing `allow` is the value a missing entry already
 * has, so a corrupted blob degrades to "no opinion" rather than to a mystery.
 */
export function permissionOf(map: Readonly<Record<string, unknown>> | undefined, tool: string): ToolPermission {
  const v = map?.[tool];
  return isToolPermission(v) ? v : 'allow';
}

/** Set one tool's permission, dropping the key entirely when the answer is `allow`. */
export function withPermission(map: Readonly<Record<string, unknown>> | undefined, tool: string, perm: ToolPermission): PermissionMap {
  const next: PermissionMap = {};
  for (const [k, v] of Object.entries(map ?? {})) {
    if (k !== tool && isToolPermission(v)) next[k] = v;
  }
  if (perm !== 'allow') next[tool] = perm;
  return next;
}

/**
 * The strictness some OTHER layer has already imposed, or undefined when this layer is on its own.
 *
 * `effective` is the merged answer for this project. Merging takes the most restrictive value
 * across layers, so an effective value stricter than this layer's own can only have come from a
 * different layer — which is exactly the case where this layer may tighten and may not loosen.
 */
export function floorFrom(mine: ToolPermission, effective: ToolPermission): ToolPermission | undefined {
  return toolPermissionRank(effective) > toolPermissionRank(mine) ? effective : undefined;
}

/** A choice looser than the floor is a control wired to nothing — the server would discard it. */
export function choiceDisabled(choice: ToolPermission, floor: ToolPermission | undefined): boolean {
  return floor !== undefined && toolPermissionRank(choice) < toolPermissionRank(floor);
}

const SCOPE_WORD: Record<MemoryScope, string> = {
  org: 'your organisation',
  user: 'your account',
  project: 'this project',
};

/**
 * Why the looser options are gone.
 *
 * A disabled control with no reason beside it reads as a broken one, and the person who reads it
 * that way concludes the whole panel is broken. The scope is named when the server told us which
 * layer decided; when it did not, the sentence still says the rule rather than nothing.
 */
export function floorNote(floor: ToolPermission, scope: MemoryScope | undefined): string {
  const what = floor === 'deny' ? 'denied' : 'set to ask first';
  const who = scope ? ` by ${SCOPE_WORD[scope]}` : ' at a higher level';
  return `Already ${what}${who}. A narrower rule can be made here; it cannot be widened.`;
}

/**
 * What to say about the tools this run was NOT given.
 *
 * Until the worker started sending this list, a permission was invisible from the user's side: the
 * agent simply never used the tool, and a capability that is silently missing reads exactly like a
 * broken product. The person most likely to hit it is the one who set the permission — and they
 * still have to be told, because they set it on another project three weeks ago.
 *
 * NAMED IN THE SAME WORDS THE PANEL USES. "run_luau was not available" is the tool table leaking
 * into the product, and it describes a control nobody has seen. A tool with no label — one an
 * organisation set, or one that arrived through an import — falls back to its raw name rather than
 * being dropped: under-reporting what was withheld is the one direction a sentence about
 * permissions must never fail in.
 *
 * Null, not an empty string, when nothing was withheld. There is no line to draw.
 */
export function deniedNote(tools: readonly string[] | undefined): string | null {
  const names = (tools ?? [])
    .map((t) => (typeof t === 'string' ? t.trim() : ''))
    .filter(Boolean)
    .map((t) => GOVERNED_TOOLS.find((g) => g.name === t)?.label ?? t);
  if (!names.length) return null;
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const verb = names.length === 1 ? 'was' : 'were';
  return `${list} ${verb} not available on this run — turned off in your settings.`;
}

export const PERMISSION_LABEL: Readonly<Record<ToolPermission, string>> = {
  allow: 'Allowed',
  // `ask` narrows to a refusal today — nothing in this product can interrupt a run to ask — and
  // the label says so rather than promising a prompt that never arrives. See applyToolPermissions.
  ask: 'Ask first (blocks it for now)',
  deny: 'Never',
};
