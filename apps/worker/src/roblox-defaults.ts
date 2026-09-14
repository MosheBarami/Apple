// Roblox's own out-of-the-box values, in ONE place.
//
// WHY THIS FILE EXISTS. The worker carried two disagreeing tables: `vision.ts` said brightness 3
// and ClockTime 14.5; a second, written later in `critic-input.ts`, said 2 and 14. Both were used
// to decide the same thing — "has anyone made a lighting decision here?" — so the two halves of the
// product could give opposite answers about the same scene, and a test asserted the newer one,
// which made the wrong values look established.
//
// The newer pair was invented. It was written from confidence rather than from a source, and the
// test written alongside it pinned the invention. That is the failure mode worth naming: a claim
// you are confident about is not a claim you have checked, and from the inside the two feel
// identical.
//
// NOT INDEPENDENTLY VERIFIED. The Roblox creator documentation describes the Lighting properties at
// length and does not state their numeric defaults, so these come from the earlier constant in
// `vision.ts` rather than from a citation. They are here, together, so that when someone does
// verify them there is one place to correct — which was the actual defect, more than either value.
export const ROBLOX_DEFAULT_LIGHTING = {
  brightness: 3,
  clockTime: 14.5,
  /** Already 0-255: the plugin converts from Color3 before it sends (apps/plugin/src/Render.luau). */
  ambient: [0, 0, 0] as [number, number, number],
} as const;

/**
 * Has anyone touched Lighting at all?
 *
 * Compared against the real defaults rather than "is anything non-zero", because Ambient rgb(0,0,0)
 * IS the default and a scene that set it deliberately is indistinguishable from one nobody touched.
 * Light instances and post-effects are the tiebreak: adding either is a decision.
 *
 * Floating-point comparison with a tolerance, because ClockTime is a float and 14.5 read back from
 * a round trip is not always exactly 14.5.
 */
export function lightingIsDefault(l: {
  brightness: number;
  clockTime: number;
  ambient: [number, number, number];
  lightInstances: number;
  effects: string[];
}): boolean {
  return (
    Math.abs(l.brightness - ROBLOX_DEFAULT_LIGHTING.brightness) < 0.01 &&
    Math.abs(l.clockTime - ROBLOX_DEFAULT_LIGHTING.clockTime) < 0.01 &&
    l.ambient.every((c, i) => c === ROBLOX_DEFAULT_LIGHTING.ambient[i]) &&
    l.lightInstances === 0 &&
    l.effects.length === 0
  );
}

/** How many Lighting properties differ from the default. Cited by the critic's lighting lens. */
export function lightingTouchedProperties(l: {
  brightness: number;
  clockTime: number;
  ambient: [number, number, number];
  lightInstances: number;
  effects: string[];
}): number {
  let touched = 0;
  if (Math.abs(l.brightness - ROBLOX_DEFAULT_LIGHTING.brightness) >= 0.01) touched += 1;
  if (Math.abs(l.clockTime - ROBLOX_DEFAULT_LIGHTING.clockTime) >= 0.01) touched += 1;
  if (l.ambient.some((c, i) => c !== ROBLOX_DEFAULT_LIGHTING.ambient[i])) touched += 1;
  if (l.lightInstances > 0) touched += 1;
  if (l.effects.length > 0) touched += 1;
  return touched;
}
