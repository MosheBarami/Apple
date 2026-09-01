#!/usr/bin/env node
// Prove the plugin's Luau suite can actually fail.
//
// A green test run only means something if a red one is reachable. This injects known
// bugs into the module source ON ITS WAY INTO THE CHUNK — the file on disk is never
// written to — and asserts the suite goes red for each one. A mutation that survives is
// reported as a hole in the tests, not a pass.
//
// The mutations are not arbitrary. Each one is a plausible "simplification" of code
// whose comments claim a specific invariant, and each targets a security or integrity
// property rather than a cosmetic one: the undo recording that makes every AI action
// reversible, the asset-policy window that keeps unverified content out of a user's
// place, the loop gate that stops a generated script freezing Studio, and the framing
// maths that decides whether a capture shows the subject or a baseplate.
import { readFileSync, writeFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildChunk, declaredModules, luauMissing } from './run.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const MUTATIONS = [
  {
    name: "create_instances leaves the property-op list",
    claim: "create_instances is gated by the same asset policy as set_props",
    module: "Ops",
    find: "local PROPERTY_OPS = { create_instances = true, set_props = true }",
    replace: "local PROPERTY_OPS = { set_props = true }",
  },
  {
    name: "a restore no longer counts as preexisting",
    claim: "a rollback may re-materialise the user's own asset ids",
    module: "Ops",
    find: "\t\treturn { allow = {}, preexisting = true }",
    replace: "\t\treturn { allow = {}, preexisting = false }",
  },
  {
    name: "Terrain, Camera and game become deletable",
    claim: "the destructive-safety guard refuses what a restore cannot bring back",
    module: "Ops",
    find: "\t\tif inst.ClassName == \"Terrain\" or inst.ClassName == \"Camera\" or inst == game then",
    replace: "\t\tif false then",
  },
  {
    name: "SoundId leaves the content-property list",
    claim: "each content-property family gates the non-URI forms too",
    module: "Paths",
    find: "\tSoundId = true, AnimationId = true, Video = true,",
    replace: "\tAnimationId = true, Video = true,",
  },
  {
    name: "the framing distance retreats to a postage stamp",
    claim: "the framing distance stays in the band that was measured",
    module: "Render",
    find: "\tlocal d = radius * 1.35",
    replace: "\tlocal d = radius * 5.0",
  },
  {
    name: "the framing distance collapses onto the subject",
    claim: "the framing distance stays in the band that was measured",
    module: "Render",
    find: "\tlocal d = radius * 1.35",
    replace: "\tlocal d = radius * 0.6",
  },
  {
    name: "a mutating op proceeds when no recording could be opened",
    claim: "a mutation without an undo point is refused, not performed",
    module: "Ops",
    find: "\t\tif not recording then",
    replace: "\t\tif false then",
  },
  {
    name: "a raising handler commits its recording instead of cancelling it",
    claim: "a failed mutation leaves no committed waypoint behind",
    module: "Ops",
    find: "\t\tChangeHistoryService:FinishRecording(recording, if ok then Enum.FinishRecordingOperation.Commit else Enum.FinishRecordingOperation.Cancel)",
    replace: "\t\tChangeHistoryService:FinishRecording(recording, Enum.FinishRecordingOperation.Commit)",
  },
  {
    name: "set_props is no longer declared mutating",
    claim: "every op that writes to the place takes an undo recording",
    module: "Ops",
    find: "\tedit_script = true, create_instances = true, set_props = true, delete_instances = true,",
    replace: "\tedit_script = true, create_instances = true, delete_instances = true,",
  },
  {
    name: "the asset policy is left open after the handler returns",
    claim: "the policy window shuts on every path out of the handler",
    module: "Ops",
    find: "\tPaths.setAssetPolicy(nil)",
    replace: "\t",
  },
  {
    name: "verifiedAssetIds is also read out of model-authored props",
    claim: "only the worker-built envelope can grant an asset permission",
    module: "Ops",
    find: "\tif type(opBody.verifiedAssetIds) == \"table\" then",
    replace: "\tlocal __p = opBody.props and opBody.props.verifiedAssetIds\n\tif __p and tonumber(__p.v) then allow[tonumber(__p.v)] = true end\n\tif type(opBody.verifiedAssetIds) == \"table\" then",
  },
  {
    name: "long-bracket strings are no longer stripped",
    claim: "a loop keyword inside a literal is not a loop",
    module: "Ops",
    find: "\t\t:gsub(\"%[%[.-%]%]\", \" \")",
    replace: "\t\t:gsub(\"NEVERMATCHESANYTHING\", \" \")",
  },
  {
    name: "the loop body becomes the rest of the file again",
    claim: "a yield after the loop does not rescue the loop",
    module: "Ops",
    find: "local function blockEnd(src: string, from: number): number",
    replace: "local function blockEnd(src: string, from: number): number\n\tif true then return #src end",
  },
  {
    name: "task.spawn is treated as a yield again",
    claim: "task.spawn, task.defer and task.delay do not count as yields",
    module: "Ops",
    find: "\t\"task%.wait\",",
    replace: "\t\"task%.wait\",\n\t\"task%.spawn\",",
  },
  {
    name: "the yield scan is disabled, so every loop is refused",
    claim: "a loop that yields is allowed through",
    module: "Ops",
    find: "\t\t\t\tif body:find(y) then",
    replace: "\t\t\t\tif false then",
  },
  {
    name: "a bare wait() is no longer recognised as a yield",
    claim: "each entry in the YIELDS list is load-bearing on its own",
    module: "Ops",
    find: "\t\"%f[%w]wait%s*%(\",",
    replace: "\t\"%f[%w]NOTWAIT%s*%(\",",
  },
  {
    name: "a reference whose id cannot be read is waved through",
    claim: "an unreadable alias is refused exactly like an unverified id",
    module: "Paths",
    find: "\tif #ids == 0 then",
    replace: "\tif false then",
  },
  {
    name: "the gate keys on the codec tag alone, not the property name",
    claim: "an asset id assigned as a plain string is gated like a tagged one",
    module: "Paths",
    find: "\tlocal contentProp = ASSET_PROPS[name] == true or pv.t == \"Content\"",
    replace: "\tlocal contentProp = pv.t == \"Content\"",
  },
  {
    name: "the view-depth sign is flipped",
    claim: "a lookAt camera puts its subject in FRONT of it, not behind",
    module: "Render",
    find: "\t\t\t\tlocal z = -p.Z",
    replace: "\t\t\t\tlocal z = p.Z",
  },
  {
    name: "the near-plane cull is disabled",
    claim: "a part BEHIND the camera is counted off-camera, not drawn",
    module: "Render",
    find: "\t\t\t\tif z <= 0.05 then",
    replace: "\t\t\t\tif false then",
  },
  {
    name: "the perspective divide is dropped from the projection",
    claim: "a nearer part covers more of the frame than a further one",
    module: "Render",
    find: "\t\t\t\t\t((p.X / (z * tanHalf * aspect)) * 0.5 + 0.5) * width,",
    replace: "\t\t\t\t\t((p.X / (tanHalf * aspect)) * 0.5 + 0.5) * width,",
  },
  {
    name: "the ground plane is no longer excluded from bounds",
    claim: "a baseplate does not dominate the frame and shrink the subject",
    module: "Render",
    find: "\t\tif p.Size.X > GROUND_PLANE_STUDS or p.Size.Z > GROUND_PLANE_STUDS then return end",
    replace: "\t\tif false then return end",
  },
  {
    name: "near-invisible parts are framed",
    claim: "an invisible part does not stretch the frame around empty space",
    module: "Render",
    find: "\treturn p:IsA(\"BasePart\") and p.Transparency < 0.95",
    replace: "\treturn p:IsA(\"BasePart\")",
  },
  {
    name: "an unknown viewpoint name yields no camera at all",
    claim: "an unrecognised view falls back to the establishing shot",
    module: "Render",
    find: "\tif #picked == 0 then table.insert(picked, all[1]) end",
    replace: "\t",
  }
];

if (luauMissing()) {
  console.log('plugin mutation-check: SKIPPED — `luau` is not on PATH.');
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), 'plugin-mut-'));
const specs = readdirSync(HERE).filter((f) => f.endsWith('.spec.luau')).sort();

/**
 * How the suite responded to a mutation: 'pass', 'assertion' or 'broken'.
 *
 * WHY THIS IS NOT A BOOLEAN. It was, and a boolean cannot tell the two ways a Luau
 * run can be non-zero apart: an assertion that failed, and a chunk that never
 * compiled. A mutation which happens to produce a syntax error would have been
 * reported "caught" while demonstrating nothing at all about the tests — a check
 * that lies in exactly the direction that makes it look good.
 *
 * The harness always prints `<suite>: N passed` or `<suite>: N passed, M FAILED`
 * before it raises (see harness.report — the raise is how a non-zero exit is
 * produced, since the standalone CLI has no os.exit). So the report line is the
 * evidence that the chunk RAN. No report line means the mutation broke the build
 * rather than tripping a test.
 */
function runSuite(mutate, tag) {
  for (const spec of specs) {
    const specSrc = readFileSync(join(HERE, spec), 'utf8');
    const mods = declaredModules(specSrc);
    if (!mods) continue;
    const out = join(dir, `${basename(spec, '.luau')}.${tag}.luau`);
    writeFileSync(out, buildChunk(specSrc, mods, mutate));
    try {
      execFileSync('luau', [out], { encoding: 'utf8', stdio: 'pipe' });
    } catch (err) {
      const output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
      if (/\bFAILED\b/.test(output)) return { kind: 'assertion', spec, output };
      return { kind: 'broken', spec, output };
    }
  }
  return { kind: 'pass' };
}

let survived = 0;

// Baseline first. If the unmutated suite is red, every "caught" below is meaningless.
const baseline = runSuite((src) => src, 'baseline');
if (baseline.kind !== 'pass') {
  console.error(`plugin mutation-check: the UNMUTATED suite ${baseline.kind === 'broken' ? 'does not compile' : 'fails'} — fix that before trusting this.`);
  console.error(baseline.output?.slice(0, 800) ?? '');
  process.exit(1);
}
console.log(`plugin mutation-check: baseline green, applying ${MUTATIONS.length} mutations`);

for (const [i, m] of MUTATIONS.entries()) {
  let applied = false;
  const mutate = (src, name) => {
    if (name !== m.module || !src.includes(m.find)) return src;
    applied = true;
    return src.replace(m.find, m.replace);
  };
  const result = runSuite(mutate, `m${i}`);
  if (!applied) {
    // The source moved out from under the mutation. Silently "passing" here would be
    // the worst outcome: a check that stops checking without saying so.
    console.error(`  STALE   ${m.name} — its target text no longer exists in ${m.module}.luau`);
    survived += 1;
  } else if (result.kind === 'assertion') {
    console.log(`  caught  ${m.name}  (${m.claim})`);
  } else if (result.kind === 'broken') {
    // Non-zero, but not because a test noticed. This mutation proves nothing and
    // must be rewritten to be a behaviour change rather than a compile error.
    console.error(`  INVALID ${m.name} — the chunk did not compile, so no test was exercised`);
    console.error(`          ${(result.output ?? '').split('\n').find((l) => /error|Error/.test(l)) ?? ''}`);
    survived += 1;
  } else {
    console.error(`  SURVIVED ${m.name} — nothing asserts: ${m.claim}`);
    survived += 1;
  }
}

if (survived > 0) {
  console.error(`plugin mutation-check: ${survived}/${MUTATIONS.length} mutation(s) not caught`);
  process.exit(1);
}
console.log(`plugin mutation-check: all ${MUTATIONS.length} mutations caught`);
