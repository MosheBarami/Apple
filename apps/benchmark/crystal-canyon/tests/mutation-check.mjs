#!/usr/bin/env node
// Prove the Luau suite can actually fail.
//
// A green test run only means something if a red one is reachable. This injects known bugs
// into the module source ON ITS WAY INTO THE CHUNK — the file on disk is never written to —
// and asserts the suite goes red for each one. A mutation that survives is reported as a
// hole in the tests, not a pass.
//
// The mutations are not arbitrary: each is a bug someone could plausibly introduce while
// "simplifying" Profile.sanitize, and each maps to an invariant the comments claim it holds.
import { readFileSync, writeFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildChunk, declaredModules } from './run.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const MUTATIONS = [
  {
    name: 'NaN guard removed',
    claim: 'NaN never survives sanitisation',
    module: 'Profile',
    find: '\tif value ~= value then\n\t\treturn 0\n\tend\n',
    replace: '',
  },
  {
    name: 'negatives no longer floored at zero',
    claim: 'a negative balance is coerced to 0, not carried',
    module: 'Profile',
    find: '\tlocal n = math.floor(value)\n\tif n < 0 then\n\t\tn = 0\n\tend\n',
    replace: '\tlocal n = math.floor(value)\n',
  },
  {
    name: 'non-finite returns the CEILING instead of 0',
    claim: 'corruption must never be a route to minting currency',
    module: 'Profile',
    find: '\tif value == math.huge or value == -math.huge then\n\t\treturn 0\n\tend',
    replace: '\tif value == math.huge or value == -math.huge then\n\t\treturn max or MAX_COUNT\n\tend',
  },
  {
    name: 'strings coerced with tonumber',
    claim: 'a string is not credited as a number',
    module: 'Profile',
    find: '\tif type(value) ~= "number" then\n\t\treturn 0\n\tend',
    replace: '\tif type(value) ~= "number" then\n\t\tvalue = tonumber(value) or 0\n\tend',
  },
  {
    name: 'upgradeCost loses its lower clamp',
    claim: 'a negative level is never a discount',
    module: 'Config',
    find: '\tlocal lvl = levelIn(level, up.MaxLevel)\n\tif lvl >= up.MaxLevel then',
    replace: '\tlocal lvl = math.floor(level or 0)\n\tif lvl >= up.MaxLevel then',
  },
  {
    name: 'levelIn passes NaN through, as math.clamp alone would',
    claim: 'a corrupt level degrades to a legal value',
    module: 'Config',
    find: '\tif type(level) ~= "number" or level ~= level then\n\t\treturn 0\n\tend',
    replace: '\tif type(level) ~= "number" then\n\t\treturn 0\n\tend',
  },
  {
    name: 'comma signs a zero magnitude',
    claim: 'the HUD never renders "-0"',
    module: 'Util',
    find: '\tlocal negative = n < 0 and whole ~= "0"',
    replace: '\tlocal negative = n < 0',
  },
  {
    name: 'a missing profile is treated as ownership',
    claim: 'a failed load is never ownership',
    module: 'Zones',
    find: '\tlocal profile = ctx.Data.get(player)\n\tif not profile or not profile.zones then\n\t\treturn false\n\tend',
    replace: '\tlocal profile = ctx.Data.get(player)\n\tif not profile or not profile.zones then\n\t\treturn true\n\tend',
  },
  {
    name: 'ownership accepts any truthy value',
    claim: 'a corrupt zones table cannot unlock a zone',
    module: 'Zones',
    find: '\treturn profile.zones[zoneId] == true',
    replace: '\treturn profile.zones[zoneId] ~= nil and profile.zones[zoneId] ~= false',
  },
  {
    name: 'unlock charges nothing',
    claim: 'an unlock charges exactly the listed price',
    module: 'Zones',
    find: '\tlocal cost = math.max(0, math.floor(zone.UnlockCost))',
    replace: '\tlocal cost = 0',
  },
  {
    name: 'unlock grants regardless of what spendCoins answered',
    claim: 'an unaffordable unlock grants nothing',
    module: 'Zones',
    find: '\tif not ctx.Economy.spendCoins(player, cost) then\n\t\treturn false,',
    replace: '\tif false and not ctx.Economy.spendCoins(player, cost) then\n\t\treturn false,',
  },
  {
    name: 'refresh publishes only the unlocked zones',
    claim: 'locked is a published state, not an absence',
    module: 'Zones',
    find: '\t\tplayer:SetAttribute(attributeName(zone.Id), Zones.isUnlocked(player, zone.Id))',
    replace: '\t\tif Zones.isUnlocked(player, zone.Id) then player:SetAttribute(attributeName(zone.Id), true) end',
  },
  {
    name: "degradeToMemory loses its production guard",
    claim: "a live server never silently stops saving",
    module: "DataService",
    find: "\tif not IS_STUDIO then\n\t\tif not reportedOutage then",
    replace: "\tif false then\n\t\tif not reportedOutage then",
  },
  {
    name: "a lost lock leaves the session readable",
    claim: "the economy cannot credit a profile we no longer own",
    module: "DataService",
    find: "\t\tsession.persist = false\n\t\tsession.state = \"failed\"\n\t\twarn(",
    replace: "\t\tsession.persist = false\n\t\twarn(",
  },
  {
    name: "a lost lock does not remove the player",
    claim: "the player is removed rather than left earning into a discarded copy",
    module: "DataService",
    find: "\t\tplayer:Kick(\n\t\t\t\"Your Crystal Canyon save was opened on another server.",
    replace: "\t\tlocal _skipped = (\n\t\t\t\"Your Crystal Canyon save was opened on another server.",
  },
  {
    // The return at the END of degradeToMemory: the value the load-error branch acts on.
    // This mutation survived until the studio spec gained a test for a store that fails at
    // LOAD time. Every earlier test degraded at BOOT instead, where init discards the
    // return value and onPlayerAdded short-circuits on the flag — so Studio's softening
    // was never actually exercised by the tests that appeared to cover it. See F-30.
    name: "Studio no longer degrades to in-memory",
    claim: "an unreachable DataStore is still playable in Studio",
    module: "DataService",
    find: "\t)\n\treturn true\nend",
    replace: "\t)\n\treturn false\nend",
  },
];

try {
  execFileSync('luau', ['--help'], { stdio: 'pipe' });
} catch {
  console.log('mutation-check: SKIPPED — `luau` is not on PATH.');
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), 'cc-mut-'));
const specs = readdirSync(HERE).filter((f) => f.endsWith('.spec.luau')).sort();

/** Run every spec with `mutate` applied; true if any spec went red. */
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
  console.error('mutation-check: the UNMUTATED suite fails — fix that before trusting this.');
  process.exit(1);
}
console.log(`mutation-check: baseline green, applying ${MUTATIONS.length} mutations`);

for (const [i, m] of MUTATIONS.entries()) {
  let applied = false;
  const mutate = (src, name) => {
    if (name !== m.module || !src.includes(m.find)) return src;
    applied = true;
    return src.replace(m.find, m.replace);
  };
  const caught = suiteFails(mutate, `m${i}`);
  if (!applied) {
    // The source moved out from under the mutation. Silently "passing" here would be the
    // worst outcome: a check that stops checking without saying so.
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
  console.error(`mutation-check: ${survived}/${MUTATIONS.length} mutation(s) not caught`);
  process.exit(1);
}
console.log(`mutation-check: all ${MUTATIONS.length} mutations caught`);
