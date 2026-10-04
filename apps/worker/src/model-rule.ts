// D-MODELLIB-2, as revised 2026-10-02: an ORDER, not a ban, and no tool is ever forced (phase 1).
//
// Owner order, 2026-09-24: "NEVER generate from scratch models and 3d". Owner order, 2026-10-02: the asset
// order is library, then Creator Store, then combine or adapt, then build from scratch, highly detailed.
// The first order made the last step of the second unreachable: a prop assembled from Parts was refused
// whatever the run had tried, and a failed library insert "never licensed a hand-built replacement". Live
// the library inserts failed, the hand build was refused, and the build ended as a white slab and paths.
//
// This module does not decide what an object IS, and nothing here reads a name: an earlier version carried
// a list of prop nouns and refused a part by its name, which recognises subjects (the owner forbids that)
// and never prevented a hand build anyway, since a renamed batch passed. What remains is decided from the
// class names the plugin deals in and from the run:
//   1. Hand-made meshes (MeshPart, SpecialMesh, UnionOperation, shape meshes) cannot be created by StudPilot's
//      plugin at all, so they are refused with that reason, whatever the run has tried.
//   2. A Model assembled from Parts, in one create_instances batch or in Luau, is held back until the run
//      has TRIED the library (a search that found nothing, an insert that failed, or an insert that
//      worked). Refused at most ORDER_GATE_LIMIT times per run, never after the library was tried, and
//      never when the library is not offered or the project's source settings rule it out. It cannot
//      become the deadlock it replaced. What to try is information in the refusal; the agent chooses the
//      call (create_instances says what the library holds for a Model named like a row: libraryAdvice).
// Cloning a verified template at runtime remains gameplay, not modelling.

import { libraryAttemptEnded, type LibraryOutcome } from './library-run';

export const MODEL_DECISION = 'D-MODELLIB-2';
/** The one statement of the asset order (prompts.ts quotes it; nothing else restates it in prose). */
export const ASSET_ORDER = 'library, then Creator Store, then adapt or combine what was found, then build from Parts, in full detail';
/** Order refusals per run. Past this the batch goes through: a gate that never opens is a deadlock. */
export const ORDER_GATE_LIMIT = 2;

const BASEPARTS = new Set(['Part', 'WedgePart', 'CornerWedgePart', 'TrussPart', 'MeshPart', 'UnionOperation', 'Seat', 'VehicleSeat', 'SpawnLocation']);
const HAND_MESH = new Set(['MeshPart', 'SpecialMesh', 'BlockMesh', 'CylinderMesh', 'UnionOperation']);

/** What the gate needs to know about this run (see tools.ts libraryOrder). */
export interface LibraryOrder {
  /** The gate still applies: the library is offered and usable, was not tried, and the limit is not spent. */
  applies: boolean;
  /** The latest library result, so the refusal can say what to do next. */
  outcome?: LibraryOutcome;
}

/** Decide whether the order gate applies, from facts about the run only. */
export function orderApplies(f: { offered: boolean; usable: boolean; outcome?: LibraryOutcome; gated?: number }): LibraryOrder {
  const ended = libraryAttemptEnded({ outcome: f.outcome });
  return { applies: f.offered && f.usable && !ended && (f.gated ?? 0) < ORDER_GATE_LIMIT, outcome: f.outcome };
}

export interface ModelRefusal {
  error: string;
  refused: string[];
  /** The refusal is the order gate (the caller counts it against ORDER_GATE_LIMIT). */
  ordered?: boolean;
}

function orderRefusal(order: LibraryOrder, what: string, tool: 'create_instances' | 'run_luau'): ModelRefusal {
  const next = order.outcome === 'hits'
    ? 'find_library_model already returned candidates: call insert_library_model with one of them. If none fits, or the insert fails, '
    : 'Call find_library_model with a plain description of this object, then insert_library_model with a hit. If it has nothing, or insert fails, ';
  return {
    error: `Order: library first (${MODEL_DECISION}). ${what} ${next}call ${tool} again with this same ${tool === 'run_luau' ? 'code' : 'batch'}. ` +
      `The asset order is ${ASSET_ORDER}. Nothing was sent to Studio.`,
    refused: [what],
    ordered: true,
  };
}

function meshRefusal(found: string[]): ModelRefusal {
  const unique = [...new Set(found)].slice(0, 8);
  return {
    error: `Refused (${MODEL_DECISION}): ${unique.join('; ')}. StudPilot's plugin cannot create meshes, so this class is not available in any batch: ` +
      'build the shape from Part, WedgePart, CornerWedgePart or TrussPart (Shape Ball or Cylinder on a Part), or take a mesh model with find_library_model + insert_library_model. Nothing was sent to Studio.',
    refused: unique,
  };
}

/** Does this create_instances item hold a BasePart anywhere below it? */
function holdsParts(item: Record<string, unknown>): boolean {
  const kids = Array.isArray(item.children) ? (item.children as unknown[]) : [];
  return kids.some((k) => !!k && typeof k === 'object' && (BASEPARTS.has(String((k as Record<string, unknown>).className)) || holdsParts(k as Record<string, unknown>)));
}

/** A create_instances payload StudPilot cannot or should not build yet, or null. */
export function refuseHandMadeModel(items: unknown, order?: LibraryOrder): ModelRefusal | null {
  const meshes: string[] = [];
  const assembled: string[] = [];
  const walk = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      const cls = String(item.className ?? '');
      const name = typeof item.name === 'string' ? item.name : cls;
      if (HAND_MESH.has(cls)) meshes.push(`a ${cls} "${name}" (a hand-made mesh)`);
      else if (cls === 'Model' && holdsParts(item)) assembled.push(`a Model "${name}" assembled from Parts.`);
      walk(item.children);
    }
  };
  walk(items);
  if (meshes.length) return meshRefusal(meshes);
  if (assembled.length && order?.applies) return orderRefusal(order, assembled[0]!, 'create_instances');
  return null;
}

const NEW_CLASS = /\bInstance\s*(?:\.\s*new|\[\s*(["'])new\1\s*\])\s*(?:\(\s*)?(?:(["'])([A-Za-z]\w*)\2|\[(=*)\[([A-Za-z]\w*)\]\4\])/g;

function luauMade(code: string): { parts: number; models: number; meshes: string[] } {
  const made = [...code.matchAll(NEW_CLASS)].map((m) => m[3] ?? m[5] ?? '');
  return { parts: made.filter((c) => BASEPARTS.has(c)).length, models: made.filter((c) => c === 'Model').length, meshes: made.filter((c) => HAND_MESH.has(c)) };
}

/** Luau (comments already stripped by the caller) that builds a mesh or assembles a Model, or null. */
export function refuseHandMadeModelLuau(variants: readonly string[], order?: LibraryOrder): ModelRefusal | null {
  let assembled = false;
  for (const code of variants) {
    const made = luauMade(code);
    if (made.meshes.length) return meshRefusal(made.meshes.map((c) => `Instance.new("${c}") (a hand-made mesh)`));
    if (made.parts && made.models) assembled = true;
  }
  return assembled && order?.applies ? orderRefusal(order, 'This Luau assembles a Model from Instance.new parts.', 'run_luau') : null;
}

/** Preserve legacy script edits: only a mesh or a Model assembled from Parts that the edit ADDS is held to the rule. */
export function refuseNewHandMadeModelLuau(after: readonly string[], before: readonly string[] = [], order?: LibraryOrder): ModelRefusal | null {
  const counts = (variants: readonly string[]) => {
    const high = { assembled: 0, mesh: 0 };
    for (const code of variants) {
      const made = luauMade(code);
      high.assembled = Math.max(high.assembled, Math.min(made.models, made.parts));
      high.mesh = Math.max(high.mesh, made.meshes.length);
    }
    return high;
  };
  const next = counts(after);
  const had = counts(before);
  if (next.assembled <= had.assembled && next.mesh <= had.mesh) return null;
  return refuseHandMadeModelLuau(after, order);
}

/** The AI 3D generators are closed to the agent: 3D comes from the library, then the Creator Store, then Parts. */
export function refuseGeneratedModel(tool: string): ModelRefusal {
  return {
    error: `Refused (${MODEL_DECISION}): StudPilot does not use an AI 3D generator (${tool}), which makes a model from scratch. ` +
      `The asset order is ${ASSET_ORDER}: find_library_model, preview_library_models and insert_library_model, then find_verified_asset, then Parts (create_instances, build_object). Nothing was sent to Studio.`,
    refused: [`${tool} generates a 3D model from scratch`],
  };
}
