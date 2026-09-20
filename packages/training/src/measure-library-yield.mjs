#!/usr/bin/env node
/**
 * WHAT THE VERIFIED LIBRARY IS WORTH, AND WHAT IT COSTS WHEN IT GUESSES.
 *
 * Two questions that nothing else in this package answers, both free — no gateway, no tokens, no
 * lane, no maxTokens. Re-running gives the same answer every time.
 *
 * ---------------------------------------------------------------------------------------------
 * 1. `--part yield`  IS THE LIBRARY THE ANSWER TO WHAT THE DEPLOYED MODEL ACTUALLY GETS WRONG?
 *
 * runs/eval-production-apple-agent.json is the first measurement of the deployed lane across the
 * WHOLE 80-prompt curriculum rather than its first twelve, and it is a much worse number than the
 * twelve suggested: 48/80 in one pass, of which 24 were answered-and-wrong.
 *
 * "The library would fix those" is the obvious claim and it was never checked. This checks it the
 * only way that counts: it takes each prompt the deployed model failed, pulls the library's own
 * module for it, and runs THAT source through the SAME scorer — executed against the same
 * exhaustive checks. A module that passes here is not a module somebody reviewed; it is one that
 * was watched passing the exact test the model just failed.
 *
 * This measures the CEILING, not the delivered value. It says what the library is worth IF the
 * model reaches the right module. Whether it reaches it is lexical-retrieval-bench.mjs
 * (49/80 top-1 on customer phrasing) and whether it calls the tool at all is
 * measure-knowledge-reach.mjs. Three gates, three numbers; multiply, never substitute.
 *
 * ---------------------------------------------------------------------------------------------
 * 2. `--part honesty`  WHEN THE LIBRARY HAS NOTHING, DOES IT SAY SO?
 *
 * verified-modules.ts states the doctrine plainly: "a near-match that returns the wrong module is
 * worse than no match, because the model will install it and the logic will be confidently wrong in
 * a way nothing downstream checks. A miss is recoverable; a plausible wrong module is the defect
 * this whole file exists to remove."
 *
 * The fifteen needs below are real Roblox work the eighty modules genuinely do not cover — no
 * module addresses datastores, pathfinding, raycasting, animation, welding, sound or gamepasses.
 * The correct answer to every one is the sentence the file already knows how to write: "Nothing in
 * the verified library covers this." Anything else hands the model a confident wrong answer for a
 * need it should have written by hand, knowingly.
 *
 * These fifteen were authored for this measurement. They are one session's judgement of plausible
 * uncovered needs, not sampled traffic — the same limitation customer-queries.mjs carries, and the
 * same remedy: replace them with logged prompts the day any exist.
 */
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ALL_GAME_LOGIC_CURRICULUM } from './build-game-logic.mjs';
import { scoreGameLogic } from './score-eval.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const ROOT = resolve(import.meta.dirname, '../../..');

//[[ THE WORKER'S OWN CODE, NOT A RETYPED COPY. verified-modules.ts is TypeScript importing JSON
//   without an import attribute, so Node cannot load it directly. Re-implementing the ranking here
//   would measure the re-implementation; bundling the real file with the repo's own esbuild
//   measures what production runs.
const bundled = await (async () => {
  const dir = mkdtempSync(join(tmpdir(), 'golem-yield-'));
  execFileSync(join(ROOT, 'node_modules/.pnpm/node_modules/.bin/esbuild'),
    [join(ROOT, 'apps/worker/src/verified-modules.ts'), '--bundle', '--format=esm',
      '--platform=node', `--outfile=${join(dir, 'vm.mjs')}`, '--log-level=error']);
  return import(join(dir, 'vm.mjs'));
})();

const MODULES = JSON.parse(readFileSync(join(ROOT, 'packages/corpus/data/verified-modules.json'), 'utf8')).modules;
const byId = new Map(MODULES.map((m) => [m.id, m]));

const UNCOVERED_NEEDS = [
  'save player data to a datastore', 'make an NPC path find to the player',
  'tween the camera behind the player', 'play an animation when the tool is equipped',
  'fire a remote event from the client', 'raycast to see what the gun hit',
  'teleport the player to another place', 'award a badge when they win',
  'check if they own a gamepass', 'make a part fall when touched',
  'weld two parts together', 'spawn a particle effect on hit',
  'play a sound when the door opens', 'make the character sprint on shift',
  'proximity prompt to open a door',
];

const part = arg('part', 'both');
const out = { measuredAt: new Date().toISOString(), moduleCount: bundled.VERIFIED_MODULE_COUNT };

if (part === 'yield' || part === 'both') {
  const runPath = arg('run', 'packages/training/runs/eval-production-apple-agent.json');
  const run = JSON.parse(readFileSync(join(ROOT, runPath), 'utf8'));
  //[[ ONLY THE PROMPTS THE MODEL ANSWERED AND GOT WRONG.
  //   A prompt that never came back (HTTP 500 at the gateway) is NOT a model failure and must not
  //   be counted as one — that is the difference between measuring the model and measuring the
  //   afternoon's rate limits.
  const wrong = run.rows.filter((r) => !r.ok && r.reason === 'fails_own_checks');
  const rows = wrong.map(({ id }) => {
    const entry = ALL_GAME_LOGIC_CURRICULUM.find((x) => x.id === id);
    const mod = byId.get(id);
    if (!entry || !mod) return { id, hasModule: false, modulePasses: false, reason: 'no verified module' };
    const verdict = scoreGameLogic(entry, `\`\`\`luau\n${mod.source}\n\`\`\``);
    return { id, hasModule: true, modulePasses: verdict.ok, reason: verdict.reason ?? null };
  });
  out.yield = {
    what: `prompts the deployed model ANSWERED and got wrong, in ${runPath}`,
    source: { measuredAt: run.measuredAt, settings: run.settings ?? null },
    wrongAnswers: rows.length,
    haveAModule: rows.filter((r) => r.hasModule).length,
    moduleAlsoPassesTheSameExecutedChecks: rows.filter((r) => r.modulePasses).length,
    rows,
  };
  console.log(`\nLIBRARY YIELD (ceiling, not delivered value)`);
  console.log(`  deployed model answered-and-wrong : ${out.yield.wrongAnswers}`);
  console.log(`  a verified module exists for      : ${out.yield.haveAModule}/${out.yield.wrongAnswers}`);
  console.log(`  that module passes the same checks: ${out.yield.moduleAlsoPassesTheSameExecutedChecks}/${out.yield.haveAModule}`);
}

if (part === 'honesty' || part === 'both') {
  const rows = UNCOVERED_NEEDS.map((need) => {
    const a = bundled.askVerifiedModule({ need });
    const returned = (a.candidates ?? []).map((c) => c.id);
    return { need, honestMiss: returned.length === 0, returned };
  });
  out.honesty = {
    what: 'needs the 80-module library genuinely does not cover; the only correct answer is a stated miss',
    n: rows.length,
    honestMisses: rows.filter((r) => r.honestMiss).length,
    handedAShortlistAnyway: rows.filter((r) => !r.honestMiss).length,
    rows,
  };
  console.log(`\nLOOKUP HONESTY`);
  console.log(`  needs nothing covers          : ${out.honesty.n}`);
  console.log(`  answered with an honest miss  : ${out.honesty.honestMisses}/${out.honesty.n}`);
  console.log(`  handed a shortlist anyway     : ${out.honesty.handedAShortlistAnyway}/${out.honesty.n}`);
  for (const r of rows.filter((x) => !x.honestMiss).slice(0, 5)) {
    console.log(`    "${r.need}" -> ${r.returned.slice(0, 3).join(', ')}`);
  }
}

const runsDir = join(ROOT, 'packages/training/runs');
mkdirSync(runsDir, { recursive: true });
const path = join(runsDir, 'library-yield.json');
writeFileSync(path, JSON.stringify(out, null, 1) + '\n');
console.log('\n->', path);
