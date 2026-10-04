/**
 * THE WORLD PASS AS STEPS: what to build next, as tool calls the model can make without working anything out.
 *
 * WHY. Measured 2026-10-04 (t1 round 3): after the composer the world pass sent the run back with a generic paragraph ("build the
 * world the request describes"). The small build model could not turn it into calls: it read scripts, trees and spatial queries for
 * thirty steps, built nothing, and the read-stall guard ended the run. A paragraph of advice is not a next action. This turns the
 * facts the run already holds into a short numbered list in which every step names the tool and the paths or numbers to give it.
 *
 * WHAT IT READS. Only facts: the composer's own map (bounds, hub, plots, free ground, measured from the layout it built), the models
 * this run inserted (their paths and where they stand), which tools the run has already used since the composer, and (when a fresh
 * reviewer ran) the closed vocabulary of areas it found serious. It never reads the request and never names a subject: a game, a
 * genre or a word decides nothing here. A step whose work the run has already done is left out.
 *
 * SAFETY. The list holds paths a place or a model supplied (the name of a Creator Store model is its author's). It is therefore
 * handed to the agent only inside the run's untrusted-data fence (do/session.ts fencedToolOutput), like a judge's findings, and the
 * names are cut to a safe alphabet and length here as well. Pure: facts in, text out.
 */

export type P2 = [number, number];

/** What the composer built, in numbers the steps can use. Measured from its own layout, not read from the model. */
export interface MapFacts {
  root: string;
  ground: { center: P2; half: P2 };
  hub?: { path: string; center: P2; half: number };
  plots: { path: string; at: P2 }[];
  /** Spots of free ground, off the roads, the plots and the hub. */
  free: P2[];
  /** Half the side of a plot's frame, so a spot can be put just outside it. */
  frame?: number;
}

/** The part of the run's state the steps need that is not the counts in world-pass.ts: the map, and the tools used since. */
export interface WorldFacts {
  map?: MapFacts;
  /** Tools that changed the place since the composer, once each. */
  used: string[];
}

export interface StepFacts {
  map?: MapFacts;
  /** Models this run inserted: the path as Studio names it, and where it stands when the run knows. */
  models: { path: string; at?: [number, number, number] }[];
  used: readonly string[];
  /** Real models placed since the composer. */
  assets: number;
  /** What a fresh reviewer found serious, in plain words from a closed vocabulary (blind-critique.ts AREA_WORDS). */
  flawWords?: readonly string[];
}

const MAX_USED = 40;

export function noteFactsComposer(map: MapFacts | undefined): WorldFacts {
  return { ...(map ? { map } : {}), used: [] };
}

/** A successful change by `tool` after the composer. */
export function noteFactsTool(facts: WorldFacts | undefined, tool: string): void {
  if (facts && !facts.used.includes(tool) && facts.used.length < MAX_USED) facts.used.push(tool);
}

const round = (n: number) => Math.round(n);
const triple = (p: readonly number[]) => `[${round(p[0]!)}, ${round(p[1]!)}, ${round(p[2]!)}]`;

/** A path or name cut to the characters Studio names are made of and to a short length: one line, no quote of the fence or a backtick. */
export function safeName(raw: string, max = 90): string {
  return String(raw).replace(/[^A-Za-z0-9_ .\-[\]"()]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** A spot just outside a plot's frame, on the side away from the hub (a plot with no hub: to its east). */
export function rimSpot(plot: P2, hub: P2 | undefined, frame: number): P2 {
  const dx = plot[0] - (hub?.[0] ?? plot[0] - 1), dz = plot[1] - (hub?.[1] ?? plot[1]);
  const len = Math.hypot(dx, dz) || 1;
  return [round(plot[0] + (dx / len) * (frame + 6)), round(plot[1] + (dz / len) * (frame + 6))];
}

/**
 * `n` ground spots on the map, as [x, y, z] (y 0: the island's grass top): beside each plot first, then free ground, so a model
 * copied to them stands where a player walks past it. Fewer when the map has fewer.
 */
export function placementSpots(map: MapFacts, n: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  const hub = map.hub?.center;
  for (const p of map.plots) {
    if (out.length >= n) break;
    const [x, z] = rimSpot(p.at, hub, map.frame ?? 19);
    out.push([x, 0, z]);
  }
  for (const [x, z] of map.free) {
    if (out.length >= n) break;
    out.push([round(x), 0, round(z)]);
  }
  return out;
}

const DONE_PLACING = ['clone_instances', 'scatter_instances', 'transform_instances'];
const DONE_TERRAIN = ['shape_terrain', 'edit_terrain'];
const DONE_BUILDING = ['build_object', 'create_instances', 'dress_object', 'generate_model', 'build_scene'];

/** The numbered steps still owed, in the order to do them. At least one: the closing step is always there. */
export function worldSteps(f: StepFacts): string[] {
  const used = new Set(f.used);
  const steps: string[] = [];
  const map = f.map;

  // 1. Models the run already holds but has not placed.
  if (f.models.length && !DONE_PLACING.some((t) => used.has(t))) {
    const paths = f.models.slice(0, 4).map((m) => `"${safeName(m.path)}"`).join(', ');
    const together = f.models.filter((m) => m.at).map((m) => m.at!);
    const stacked = together.length > 1 && together.every((a) => Math.hypot(a[0] - together[0]![0], a[2] - together[0]![2]) < 6);
    const spots = map ? placementSpots(map, Math.min(10, map.plots.length + 4)) : [];
    const where = spots.length >= 2
      ? `at [${spots.map(triple).join(', ')}]`
      : 'within {"rect": {"min": [-60, -60], "max": [60, 60]}, "count": 8, "minSpacing": 14}';
    steps.push(
      `Place the ${f.models.length} model${f.models.length === 1 ? '' : 's'} you inserted on the map${stacked ? ' (they all stand in one spot now)' : ''}: ` +
      `clone_instances with paths [${paths}] ${where}, one copy per spot. Then move or delete each original with transform_instances or delete_instances.`,
    );
  }

  // 2. The ground ends in a straight edge against nothing.
  if (map && !DONE_TERRAIN.some((t) => used.has(t))) {
    const ex = round(map.ground.half[0] + 16), ez = round(map.ground.half[1] + 16);
    const cx = round(map.ground.center[0]), cz = round(map.ground.center[1]);
    steps.push(
      `Shape terrain around the island edge so it does not float: shape_terrain with action "fill_cylinder" four times, center [${cx + ex}, 12, ${cz + ez}], [${cx - ex}, 12, ${cz + ez}], ` +
      `[${cx + ex}, 12, ${cz - ez}] and [${cx - ex}, 12, ${cz - ez}], radius 30, height 40, and a material that fits the setting (for example "Enum.Material.Rock").`,
    );
  }

  // 3. No real model stands anywhere: a landmark at the hub.
  if (f.assets === 0 && !f.models.length && !used.has('insert_library_model') && !used.has('insert_asset')) {
    const hub = map?.hub?.center ?? [0, 0];
    steps.push(
      `Add a landmark at the hub: find_library_model with one plain noun for the tallest thing the setting needs, then insert_library_model with its id, position ${triple([hub[0], 0.8, hub[1]])} and height 16.`,
    );
  }

  // 4. The default daylight.
  if (!used.has('set_mood')) steps.push('Light it: set_mood with the preset closest to the setting (overrides can set ClockTime for dusk or night).');

  // 5. What a fresh reviewer found serious.
  if (f.flawWords?.length) steps.push(`Fix what a fresh reviewer found serious (${f.flawWords.slice(0, 6).map((w) => safeName(w, 60)).join(', ')}) with the tool that changes it.`);

  // 6. The object or place the request names that the map does not have.
  if (!DONE_BUILDING.some((t) => used.has(t))) {
    const at = map ? ` at a free spot such as ${triple(placementSpots(map, 1)[0] ?? [0, 0, 0])}` : '';
    steps.push(`Re-read the request, name the one object or place it asks for that is still missing, and build it: build_object (or create_instances)${at}.`);
  }

  steps.push('Then call judge_game, fix what it lists, and answer.');
  return steps.map((s, i) => `${i + 1}. ${s}`);
}

/** The steps as one block of text. */
export const stepsBody = (steps: readonly string[]): string => steps.join('\n');
