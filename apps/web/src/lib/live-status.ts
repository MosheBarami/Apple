/**
 * THE ONE LINE A RUNNING TURN SHOWS (owner decision D-THINK-1, 2026-09-24).
 *
 * While Apple works, the customer sees one friendly sentence about what it is doing right now —
 * "Editing the shop", "Placing things around the map" — and when the next step starts that sentence
 * is replaced, never appended to. No tool name, argument, path, JSON, duration or error code can come
 * out of this module: a tool becomes its `live` phrase from tool-vocabulary.ts (the one table, held to
 * the worker's registry by tests/tool-vocabulary.test.mjs), and the only piece of an argument that
 * may survive is an object's name turned into plain words, and only when that is unambiguous.
 *
 * Pure, so `node --test` can load it without a DOM.
 */
import type { AgentPhase } from '@golem/shared';
import type { ActivityKind } from '../components/ws/tool-vocabulary.ts';
import { TOOL } from '../components/ws/tool-vocabulary.ts';
import type { ActivityRun } from '../components/ws/activity-model.ts';

/** What the line says when a tool this build does not know is running. */
export const GENERIC_PHRASE = 'Working on your game';

/** Between tools, the line says what the worker announced it is doing. */
const PHASE_PHRASE: Record<AgentPhase, string> = {
  understanding: 'Reading your idea',
  planning: 'Planning it out',
  composing: 'Thinking about the next step',
  inspecting: 'Looking around your game',
  building: 'Building your game',
  writing_luau: 'Writing the scripts',
  rendering: 'Taking a picture of it',
  critiquing: 'Checking how it looks',
  rebuilding: 'Trying a better layout',
  playtesting: 'Playing your game',
  debugging: 'Fixing a few things',
  verifying: 'Making sure it works',
  checkpointing: 'Saving your progress',
  remembering: 'Remembering what changed',
  done: 'Wrapping up',
};

/** Containers and services: naming one ("Editing the workspace") says nothing a creator can see. */
const CONTAINERS = new Set([
  'game', 'workspace', 'lighting', 'players', 'teams', 'soundservice', 'serverscriptservice', 'serverstorage',
  'replicatedstorage', 'replicatedfirst', 'startergui', 'starterpack', 'starterplayer', 'starterplayerscripts',
  'startercharacterscripts', 'terrain', 'camera', 'model', 'folder',
]);

/** Roblox class words a creator does not say. */
const PLAIN_WORD: Record<string, string> = { gui: 'screen', ui: 'screen', screengui: 'screen', frame: 'panel' };

/**
 * An object's name as plain words, or null when that would be a guess.
 *
 * "game.Workspace.Market.Stall1" -> "stall", "ServerScriptService.CoinScript" -> "coin script",
 * "ShopGui" -> "shop screen". Several names become one only when they are all the same thing
 * ("Tree1, Tree2, Tree3 +4 more" -> "trees"). Anything that is not plain letters and digits, a
 * container, or longer than three words is dropped: saying nothing beats saying a path.
 */
export function friendlyName(target: string | undefined): string | null {
  if (!target) return null;
  const parts = target.replace(/\s*\+\d+ more$/, '').split(/\s*,\s*/).filter(Boolean);
  if (parts.length === 0) return null;
  const names = parts.map(oneName);
  const first = names[0];
  if (!first || names.some((name) => name !== first)) return null;
  return parts.length > 1 || /\+\d+ more$/.test(target) ? plural(first) : first;
}

function oneName(path: string): string | null {
  const last = path.split(/[./\\]/).filter(Boolean).pop() ?? '';
  if (!/^[A-Za-z][A-Za-z0-9_ -]*$/.test(last) || CONTAINERS.has(last.toLowerCase())) return null;
  const words = last
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_\-\d]+/g, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => PLAIN_WORD[word] ?? word);
  if (words.length === 0 || words.length > 3 || words.some((word) => word.length < 2)) return null;
  const name = words.join(' ');
  return name.length > 24 ? null : name;
}

const plural = (name: string) => (/s$/.test(name) ? name : `${name}s`);

type Entry = { kind: ActivityKind; live: string; on?: string };
const entry = (tool: string | undefined): Entry | undefined =>
  tool ? (TOOL as Record<string, Entry>)[tool] : undefined;

/** The line for one tool, named after its object when that is safe to say. */
export function toolPhrase(tool: string | undefined, target?: string): string {
  const spec = entry(tool);
  if (!spec) return GENERIC_PHRASE;
  const name = spec.on ? friendlyName(target) : null;
  // "Writing the {} script" with "coin script" must not say "script script".
  return name && spec.on ? spec.on.replace('{}', name).replace(/\bscript script\b/, 'script') : spec.live;
}

export function phasePhrase(phase: string | undefined): string {
  return (phase && PHASE_PHRASE[phase as AgentPhase]) || GENERIC_PHRASE;
}

/** The line while a run is live: the step running now, else the announced phase, else a greeting. */
export function livePhrase(run: ActivityRun, phase?: string): string {
  const steps = run.phases.flatMap((p) => p.steps);
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const step = steps[i]!;
    if (step.state !== 'active') continue;
    if (step.toolId !== undefined) return toolPhrase(step.tool, step.target);
    if (step.phase) return phasePhrase(step.phase);
  }
  return phase ? phasePhrase(phase) : 'Reading your idea';
}

/** Past-tense words for work a creator would recognise in their game, in the order they are said. */
const DONE_WORD: Partial<Record<ActivityKind, string>> = {
  building: 'built',
  editing: 'edited',
  writing_luau: 'scripted',
  playtesting: 'playtested',
  critiquing: 'checked',
  verifying: 'checked',
};

/**
 * The one line a finished run may keep: "Built, scripted and checked your game". Null when the
 * run did not end well (the turn's outcome row speaks for that) or did nothing a creator would see.
 */
export function doneSummary(run: ActivityRun): string | null {
  if (run.terminal?.kind !== 'done' && run.terminal?.kind !== 'recovered') return null;
  const words: string[] = [];
  for (const step of run.phases.flatMap((p) => p.steps)) {
    if (step.state !== 'done' || step.toolId === undefined) continue;
    const word = DONE_WORD[entry(step.tool)?.kind ?? 'working'];
    if (word && !words.includes(word)) words.push(word);
  }
  if (words.length === 0) return null;
  const list = words.length === 1 ? words[0]! : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
  return `${list[0]!.toUpperCase()}${list.slice(1)} your game`;
}
