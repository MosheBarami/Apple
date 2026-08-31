// Did the agent build the thing that was ASKED FOR?
//
// THE FAILURE THIS EXISTS FOR, measured. Asked for "a cosy tavern interior ... walls with a doorway
// and windows, a wooden floor, a bar counter with stools, tables and chairs, a fireplace", the agent
// produced a competent small cottage EXTERIOR. 351 parts, 11 materials, 9 lights — none of it wrong
// as craft, all of it the wrong object. The visual critic caught it in prose ("not the requested
// cosy tavern interior. No view shows the bar, stools, tables or fireplace") but only AFTER a
// 377-second build, and the correction round then returned a byte-identical scene.
//
// No composition metric can catch this and none should try: a cottage with a roof has a perfectly
// good landmark and a real vertical hierarchy. It is not badly composed. It is the wrong building.
// That is a separate axis and it needs its own gate, before any detail is paid for.
//
// WHAT IS DETERMINISTIC HERE, AND WHAT IS NOT. Interior versus exterior is decidable from geometry:
// an interior is roofed over its own floor, an object on open ground is not. Measured on real Studio
// builds of both readings of the same brief:
//
//   tavern interior   coveredFloorRatio 1.000   ceiling 12 studs   footprint 41x31
//   cottage exterior  coveredFloorRatio 0.063   ceiling 11 studs   footprint 90x90
//
// Sixteen times apart — and note that ceiling HEIGHT does not separate them at all. The coverage
// carries the signal.
//
// What is NOT deterministic is guessing intent that was never stated. "Build a tavern" is genuinely
// ambiguous and a gate that guessed would reject correct work. So this only gates a request that
// SAYS which it wants; otherwise it measures, reports, and lets the build proceed.

/** A Roblox character is about 5 studs; anything whose underside clears that is overhead. */
const HEAD_STUDS = 5;
const GRID = 32;
const GROUND_PLANE_STUDS = 600;

export interface Enclosure {
  /** fraction of the build's own footprint with something solid above head height */
  coveredFloorRatio: number;
  /** height of the lowest overhead surface above the floor; 0 when there is none */
  ceilingHeight: number;
  footprintStuds: [number, number];
}

/**
 * How enclosed the geometry is. Grid the build's own footprint; a cell counts as covered when some
 * part's underside sits above head height over it. A room is covered over nearly all of its floor;
 * a cottage standing on open ground covers only the patch it occupies.
 */
export function enclosure(parts: number[][]): Enclosure {
  const live = parts.filter((p) => p[3]! <= GROUND_PLANE_STUDS && p[5]! <= GROUND_PLANE_STUDS);
  if (!live.length) return { coveredFloorRatio: 0, ceilingHeight: 0, footprintStuds: [0, 0] };

  const floorY = Math.min(...live.map((p) => p[1]! - p[4]! / 2));
  let lox = Infinity;
  let hix = -Infinity;
  let loz = Infinity;
  let hiz = -Infinity;
  for (const p of live) {
    lox = Math.min(lox, p[0]! - p[3]! / 2);
    hix = Math.max(hix, p[0]! + p[3]! / 2);
    loz = Math.min(loz, p[2]! - p[5]! / 2);
    hiz = Math.max(hiz, p[2]! + p[5]! / 2);
  }
  const spanX = Math.max(1e-6, hix - lox);
  const spanZ = Math.max(1e-6, hiz - loz);

  const overhead = live.filter((p) => p[1]! - p[4]! / 2 - floorY >= HEAD_STUDS);
  const grid = new Uint8Array(GRID * GRID);
  for (const p of overhead) {
    const x0 = Math.max(0, Math.min(GRID - 1, Math.floor(((p[0]! - p[3]! / 2 - lox) / spanX) * GRID)));
    const x1 = Math.max(0, Math.min(GRID - 1, Math.floor(((p[0]! + p[3]! / 2 - lox) / spanX) * GRID)));
    const z0 = Math.max(0, Math.min(GRID - 1, Math.floor(((p[2]! - p[5]! / 2 - loz) / spanZ) * GRID)));
    const z1 = Math.max(0, Math.min(GRID - 1, Math.floor(((p[2]! + p[5]! / 2 - loz) / spanZ) * GRID)));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) grid[z * GRID + x] = 1;
  }
  let covered = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i]) covered++;

  return {
    coveredFloorRatio: Math.round((covered / (GRID * GRID)) * 1000) / 1000,
    ceilingHeight: overhead.length
      ? Math.round(Math.min(...overhead.map((p) => p[1]! - p[4]! / 2 - floorY)) * 10) / 10
      : 0,
    footprintStuds: [Math.round(spanX), Math.round(spanZ)],
  };
}

export type Enclosed = 'interior' | 'exterior' | 'unstated';

/**
 * What the request explicitly asked for. Only an EXPLICIT statement counts — "tavern" alone is
 * genuinely ambiguous and guessing would reject correct work. Unstated is the common case and means
 * "measure but do not gate".
 */
export function requestedEnclosure(request: string): Enclosed {
  const t = ` ${request.toLowerCase()} `;
  const interior =
    /\b(interiors?|indoors?|inside|rooms?|halls?|corridors?|hallways?|lobby|basement|cellar|attic|kitchen|bedroom|bathroom|office|cave|tunnel|dungeon|vault|inn)\b/;
  const exterior =
    /\b(exteriors?|outdoors?|outside|facade|fa[cç]ade|plaza|courtyard|square|park|garden|street|rooftop|skyline|island|landscape|terrain|forest|beach)\b/;
  const wantsIn = interior.test(t);
  const wantsOut = exterior.test(t);
  // Both named ("a shop interior opening onto a garden") is not a mismatch anyone can adjudicate.
  if (wantsIn && wantsOut) return 'unstated';
  if (wantsIn) return 'interior';
  if (wantsOut) return 'exterior';
  return 'unstated';
}

/**
 * Calibrated on the two real Studio builds above (1.000 vs 0.063). The band between them is wide, so
 * these sit well clear of both: a request for an interior covering under a third of its own floor is
 * an exterior, and a request for an exterior covering over four fifths of it is a room. Anything in
 * between is not called either way.
 */
export const ENCLOSURE_GATES = { interiorMin: 0.35, exteriorMax: 0.8 };

export interface SemanticCheck {
  requested: Enclosed;
  enclosure: Enclosure;
  failures: string[];
}

/** Does the built geometry match what the request explicitly asked for? */
export function semanticCheck(request: string, parts: number[][] | undefined): SemanticCheck | null {
  if (!parts?.length) return null;
  const requested = requestedEnclosure(request);
  const e = enclosure(parts);
  const failures: string[] = [];

  if (requested === 'interior' && e.coveredFloorRatio < ENCLOSURE_GATES.interiorMin) {
    failures.push(
      `the request asked for an INTERIOR but this is built as an exterior: only ${Math.round(e.coveredFloorRatio * 100)}% of ` +
        `the floor has anything above head height (want at least ${Math.round(ENCLOSURE_GATES.interiorMin * 100)}%). ` +
        'An interior is a space the player stands INSIDE — walls enclosing a floor with a ceiling over it, and the room ' +
        'itself should be most of the scene rather than a building sitting on open ground.',
    );
  }
  if (requested === 'exterior' && e.coveredFloorRatio > ENCLOSURE_GATES.exteriorMax) {
    failures.push(
      `the request asked for an EXTERIOR but this is built as an enclosed room: ${Math.round(e.coveredFloorRatio * 100)}% of ` +
        'the floor is roofed over. Remove the ceiling and open the space out.',
    );
  }
  return { requested, enclosure: e, failures };
}

export function semanticLine(c: SemanticCheck): string {
  return (
    `requested ${c.requested}; ${Math.round(c.enclosure.coveredFloorRatio * 100)}% of the floor is covered at ` +
    `${c.enclosure.ceilingHeight} studs, footprint ${c.enclosure.footprintStuds.join('x')} studs`
  );
}

// ---------------------------------------------------------------------------------------------
// The rebuild trigger.
// ---------------------------------------------------------------------------------------------

export interface PassRecord {
  /** cheap structural signature of the scene after this pass */
  signature: string;
  score: number | null;
  parts: number;
}

/**
 * Signature of a build, used to tell "corrected" from "did nothing". Deliberately coarse: exact part
 * positions churn constantly, but part count, total mass and height do not move unless the scene
 * actually changed.
 */
export function sceneSignature(parts: number[][] | undefined): string {
  if (!parts?.length) return 'empty';
  const live = parts.filter((p) => p[3]! <= GROUND_PLANE_STUDS && p[5]! <= GROUND_PLANE_STUDS);
  if (!live.length) return 'empty';
  let vol = 0;
  let maxY = -Infinity;
  for (const p of live) {
    vol += p[3]! * p[4]! * p[5]!;
    maxY = Math.max(maxY, p[1]! + p[4]! / 2);
  }
  return `${live.length}:${Math.round(vol / 10)}:${Math.round(maxY)}`;
}

export interface RebuildVerdict {
  rebuild: boolean;
  reason: string;
}

/**
 * Should the agent stop patching and rebuild the layout instead?
 *
 * The case this was written for: b4-interior round 2 returned a scene with the same part count, the
 * same material count, the same light count, and a critique identical defect for defect. Two hundred
 * and nine seconds of work that changed nothing, and the loop had no way to notice.
 */
export function shouldRebuild(passes: PassRecord[], semanticFailures = 0): RebuildVerdict {
  if (semanticFailures > 0 && passes.length >= 1) {
    return { rebuild: true, reason: 'the scene is not the thing that was asked for, and no amount of detail fixes that' };
  }
  if (passes.length < 2) return { rebuild: false, reason: '' };
  const last = passes[passes.length - 1]!;
  const prev = passes[passes.length - 2]!;

  if (last.signature === prev.signature) {
    return { rebuild: true, reason: 'the last correction pass changed nothing at all — the scene is identical' };
  }
  // grew but did not improve: the "add more parts" reflex the composition work already falsified
  if (last.parts > prev.parts * 1.15 && last.score !== null && prev.score !== null && last.score <= prev.score) {
    return {
      rebuild: true,
      reason: `the last pass added ${last.parts - prev.parts} parts and the score did not improve (${prev.score} -> ${last.score})`,
    };
  }
  if (passes.length >= 3) {
    const scores = passes.slice(-3).map((p) => p.score);
    if (scores.every((s) => s !== null)) {
      const nums = scores as number[];
      if (Math.max(...nums) - Math.min(...nums) <= 1) {
        return { rebuild: true, reason: 'three passes have not moved the score — patching has stopped paying' };
      }
    }
  }
  return { rebuild: false, reason: '' };
}
