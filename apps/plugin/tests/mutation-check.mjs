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
    name: "the loop gate stops stripping strings and comments",
    claim: "a loop keyword inside a literal is not a loop",
    module: "Ops",
    find: "\tlocal stripped = code:gsub(\"%-%-%[%[.-%]%]\", \" \"):gsub(\"%-%-[^\\n]*\", \" \"):gsub('\"[^\"\\n]*\"', '\"\"'):gsub(\"'[^'\\n]*'\", \"''\")",
    replace: "\tlocal stripped = code",
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

/** True when at least one spec goes red under `mutate`. */
function suiteFails(mutate, tag) {
  for (const spec of specs) {
    const specSrc = readFileSync(join(HERE, spec), 'utf8');
    const mods = declaredModules(specSrc);
    if (!mods) continue;
    const out = join(dir, `${basename(spec, '.luau')}.${tag}.luau`);
    writeFileSync(out, buildChunk(specSrc, mods, mutate));
    try {
      execFileSync('luau', [out], { encoding: 'utf8', stdio: 'pipe' });
    } catch {
      return true;
    }
  }
  return false;
}

let survived = 0;

// Baseline first. If the unmutated suite is red, every "caught" below is meaningless.
if (suiteFails((src) => src, 'baseline')) {
  console.error('plugin mutation-check: the UNMUTATED suite fails — fix that before trusting this.');
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
  const caught = suiteFails(mutate, `m${i}`);
  if (!applied) {
    // The source moved out from under the mutation. Silently "passing" here would be
    // the worst outcome: a check that stops checking without saying so.
    console.error(`  STALE   ${m.name} — its target text no longer exists in ${m.module}.luau`);
    survived += 1;
  } else if (caught) {
    console.log(`  caught  ${m.name}  (${m.claim})`);
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
