/**
 * Roadmap fixtures for `VITE_APPLE_MOCK=1` / `?mock=1`.
 *
 * Same contract as `lib/mock.ts`: illustrative data for design review only,
 * never shown to a real user, and tree-shaken out of a production build because
 * `MOCK_MODE` folds to a constant `false`.
 *
 * They live beside the feature rather than in `lib/mock.ts` so that adding a
 * surface does not mean editing the file every other surface also edits.
 *
 * The fixture mirrors `apps/worker/src/roadmap.ts` — the same milestone ids and
 * the same vocabulary — and is deliberately awkward in the ways a real scan is
 * awkward: two landed stages, one milestone genuinely in progress, blocked work
 * behind it, a stage with two milestones in parallel, and one milestone the
 * scan could not make up its mind about. All four readiness states and the
 * `unknown` detection case are reachable without a worker or a Studio
 * connection attached.
 */
import type { Milestone, MilestoneBrief, NextResponse, RoadmapResponse } from './model';

/** Scanning a place is a real round trip; the mock takes long enough to see that. */
function delay<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

const MILESTONES: Milestone[] = [
  {
    id: 'playable_spawn',
    title: 'A deliberate spawn and first view',
    why: 'A player who lands facing a grey void decides in three seconds that there is nothing here.',
    impact: 'Every session starts pointed at the thing the game is about.',
    status: 'done',
    dependsOn: [],
    blockedBy: [],
    complexity: 'small',
    effort: 'about one run',
    detected: 'present',
    evidence: ['SpawnLocation under Workspace.Lobby', 'Camera subject set on join'],
    verify: null,
  },
  {
    id: 'obby_stages',
    title: 'A first stage that can be finished',
    why: 'One run a player can actually complete is worth more than three they abandon halfway.',
    impact: 'A player has something to fail at, retry, and beat.',
    status: 'done',
    dependsOn: ['playable_spawn'],
    blockedBy: [],
    complexity: 'medium',
    effort: 'about two runs',
    detected: 'present',
    evidence: ['18 parts tagged Stage1', 'Kill volumes along the lava trench'],
    verify: null,
  },
  {
    id: 'checkpoints',
    title: 'Checkpoints that survive a rejoin',
    why: 'Losing every stage to one disconnect is the most common reason a player never comes back.',
    impact: 'A player who leaves mid-run returns to the pad they reached.',
    status: 'current',
    dependsOn: ['obby_stages'],
    blockedBy: [],
    complexity: 'medium',
    effort: 'about two runs',
    detected: 'absent',
    evidence: ['No DataStore calls found in ServerScriptService'],
    verify: null,
  },
  {
    id: 'economy',
    title: 'Something to collect and somewhere to spend it',
    why: 'A stage a player has already beaten needs a second reason to be run again.',
    impact: 'A player has something to collect on a run and something to spend it on afterwards.',
    status: 'future',
    dependsOn: ['checkpoints'],
    blockedBy: ['checkpoints'],
    complexity: 'large',
    effort: 'about three runs',
    detected: 'absent',
    evidence: [],
    verify: null,
  },
  {
    id: 'obby_hazards',
    title: 'Hazards that vary between stages',
    why: 'The same jump repeated twenty times reads as one long stage rather than as a course.',
    impact: 'A player meets something new instead of the same gap again.',
    status: 'future',
    dependsOn: ['checkpoints'],
    blockedBy: ['checkpoints'],
    complexity: 'medium',
    effort: 'about two runs',
    detected: 'unknown',
    evidence: ['Several moving parts found, but nothing that identifies them as hazards'],
    verify: 'Run the place and confirm whether the moving platforms actually kill on touch.',
  },
  {
    id: 'mood_pass',
    title: 'One lighting and atmosphere treatment',
    why: 'Stages built at different times look like different games until something ties them together.',
    impact: 'The place reads as one built world rather than three rooms.',
    status: 'future',
    dependsOn: ['obby_hazards'],
    blockedBy: ['obby_hazards'],
    complexity: 'small',
    effort: 'about one run',
    detected: 'absent',
    evidence: [],
    verify: null,
  },
];

/** What the worker's §32 set would hold for this fixture: three, at most. */
const NEXT_IDS = ['checkpoints', 'economy', 'obby_hazards'];

export function mockRoadmap(polish = false): Promise<RoadmapResponse> {
  const milestones = MILESTONES.map((m) => ({ ...m }));
  return delay(
    {
      genre: 'obby',
      genreLabel: 'Obby',
      genreConfidence: 0.82,
      genreEvidence: ['Stage-tagged parts', 'Kill volumes', 'A checkpoint pad model'],
      milestones,
      next: milestones.filter((m) => NEXT_IDS.includes(m.id)),
      notes: ['Scripts inside packages were not read, so anything they build is invisible to this scan.'],
      polished: polish,
      generatedAt: new Date().toISOString(),
      // Coherent with the note above: it says the scan did not read everything, so `limits` carries
      // that same sentence and the counts below are floors. A fixture whose counts claimed to be
      // totals under a note admitting otherwise would rehearse the exact defect this section
      // exists to avoid.
      shape: {
        systems: {
          currencies: ['Coins'],
          zones: [
            { path: 'game.Workspace.Stage1', className: 'Model', name: 'Stage1' },
            { path: 'game.Workspace.Stage2', className: 'Model', name: 'Stage2' },
          ],
          serverScripts: ['game.ServerScriptService.Checkpoints', 'game.ServerScriptService.Leaderstats'],
          clientScripts: ['game.StarterPlayer.StarterPlayerScripts.Hud'],
          moduleScripts: ['game.ReplicatedStorage.StageConfig'],
          guis: ['game.StarterGui.ShopUI', 'game.StarterGui.StageBanner'],
          topLevel: ['Workspace', 'Lighting', 'ReplicatedStorage'],
          spawns: 3,
          parts: 1204,
        },
        scale: { instances: 3810, parts: 1204, scripts: 40, scriptsRead: 12 },
        limits: ['Scripts inside packages were not read, so anything they build is invisible to this scan.'],
      },
    },
    polish ? 1_400 : 340,
  );
}

export function mockNext(): Promise<NextResponse> {
  return delay(
    {
      genre: 'obby',
      genreLabel: 'Obby',
      genreConfidence: 0.82,
      next: MILESTONES.filter((m) => NEXT_IDS.includes(m.id)).map((m) => ({ ...m })),
      notes: [],
    },
    1_200,
  );
}

export function mockBrief(milestoneId: string): Promise<MilestoneBrief> {
  const m = MILESTONES.find((x) => x.id === milestoneId) ?? MILESTONES[0]!;
  const context = ['An obby with one finishable stage', 'A lobby with a deliberate spawn'];
  const steps = [
    'Add a CheckpointService in ServerScriptService.',
    'Write the reached stage to a DataStore on each pad touch.',
    'Respawn a returning player at their last pad.',
  ];
  const acceptance = [
    'Rejoining puts the player back at the last pad they touched.',
    'A brand new player still starts at stage one.',
  ];
  return delay(
    {
      milestoneId: m.id,
      title: m.title,
      request: [
        `${m.title}.`,
        m.why,
        '',
        'What this project already is:',
        ...context.map((l) => `- ${l}`),
        '',
        'Build this:',
        ...steps.map((l) => `- ${l}`),
        '',
        'It is finished when:',
        ...acceptance.map((l) => `- ${l}`),
      ].join('\n'),
      mode: 'agent',
      context,
      steps,
      acceptance,
      touches: ['ServerScriptService', 'Workspace.Stage1'],
      ready: m.blockedBy.length === 0,
      blockedBy: m.blockedBy,
    },
    520,
  );
}
