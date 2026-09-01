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
  //[[ The shop. Two of these guard the ORDERING inversion in `Shop.use`, which is the part a
  //   later refactor is most likely to "tidy" back into the house validate-debit-apply shape
  //   and thereby burn a charge every time an effect refuses. ]]
  {
    name: 'the flare charge is spent BEFORE the effect runs',
    claim: 'a refused effect must not consume a charge that has no refund path',
    module: 'Shop',
    find: '\tlocal ok, reason = effect(player)\n\tif not ok then\n\t\treturn false, reason\n\tend\n\n\tprofile.stock[item.Id] = held - 1',
    replace: '\tprofile.stock[item.Id] = held - 1\n\tlocal ok, reason = effect(player)\n\tif not ok then\n\t\treturn false, reason\n\tend\n',
  },
  {
    name: 'an empty stock still runs the effect',
    claim: 'holding none is refused before anything happens',
    module: 'Shop',
    find: '\tif held <= 0 then\n\t\treturn false, "NONE LEFT"\n\tend',
    replace: '\tif false then\n\t\treturn false, "NONE LEFT"\n\tend',
  },
  {
    name: 'the stock cap is removed',
    claim: 'a consumable cannot be stocked past its cap',
    module: 'Shop',
    find: '\t\tif stockOf(profile, item) >= item.MaxStock then',
    replace: '\t\tif false and stockOf(profile, item) >= item.MaxStock then',
  },
  {
    name: 'a trail can be bought twice',
    claim: 'a permanent unlock is charged exactly once',
    module: 'Shop',
    find: '\t\tif profile.trails[item.Id] == true then\n\t\t\treturn false, "ALREADY OWNED"\n\t\tend',
    replace: '\t\tif false then\n\t\t\treturn false, "ALREADY OWNED"\n\t\tend',
  },
  {
    name: 'equipping no longer checks ownership',
    claim: 'a client cannot equip a cosmetic it never bought',
    module: 'Shop',
    find: '\t\tif profile.trails[trailId] ~= true then',
    replace: '\t\tif false then',
  },
  {
    name: 'a trail is accepted as a consumable',
    claim: 'a cosmetic is not a charge and cannot be used',
    module: 'Shop',
    find: '\tif not item or kind ~= "consumable" then',
    replace: '\tif not item then',
  },
  {
    name: 'a configured item with no effect is consumed anyway',
    claim: 'an unimplemented effect refuses rather than eating the charge',
    module: 'Shop',
    find: '\tlocal effect = EFFECTS[item.Id]\n\tif not effect then',
    replace: '\tlocal effect = EFFECTS[item.Id] or function() return true, nil end\n\tif false then',
  },
  {
    name: 'a corrupt stock value is trusted rather than clamped',
    claim: 'a NaN or huge stock cannot mint charges',
    module: 'Shop',
    find: '\treturn math.clamp(math.floor(raw), 0, item.MaxStock)',
    replace: '\treturn raw',
  },
  //[[ The objective resolver. These matter more than most: the bug this module replaced (V10)
  //   was a slot that went permanently blank and never errored, so every mutation here is a
  //   silently-wrong answer rather than a crash. If a mutation SURVIVES, the spec is asserting
  //   that the ladder returns something rather than that it returns the right thing. ]]
  {
    name: 'the chain terminator is treated as completion again (V10 restored)',
    claim: 'finishing onboarding must not empty the slot',
    module: 'Objectives',
    find: '\tif price == nil then\n\t\treturn { index = sentinel, id = "", text = "", progress = 0, target = 0, complete = true }',
    replace: '\tif true then\n\t\treturn { index = sentinel, id = "", text = "", progress = 0, target = 0, complete = true }',
  },
  {
    name: 'a full pack no longer outranks an affordable purchase',
    claim: 'the only hard block in the game is the first thing the chip says',
    module: 'Objectives',
    find: '\tif packCapacity > 0 and shards >= packCapacity then',
    replace: '\tif false and packCapacity > 0 and shards >= packCapacity then',
  },
  {
    name: 'zero capacity reports a full pack',
    claim: 'an empty pack is never full, whatever the capacity says',
    module: 'Objectives',
    find: '\tif packCapacity > 0 and shards >= packCapacity then',
    replace: '\tif shards >= packCapacity then',
  },
  {
    name: 'buying a zone counts as visiting it',
    claim: 'owning a place you have never stood in is the dead end this closes',
    module: 'Objectives',
    find: '\t\tif zone.UnlockCost > 0 and profile.zones[zone.Id] == true and visited[zone.Id] ~= true then',
    replace: '\t\tif false and zone.UnlockCost > 0 and profile.zones[zone.Id] == true and visited[zone.Id] ~= true then',
  },
  {
    name: 'the cheapest purchase is no longer the cheapest',
    claim: 'the chip points at the nearest goal, not an arbitrary one',
    module: 'Objectives',
    find: '\t\tif cost ~= nil and (bestPrice == nil or cost < bestPrice) then',
    replace: '\t\tif cost ~= nil and (bestPrice == nil or cost > bestPrice) then',
  },
  {
    name: 'a maxed upgrade is still offered for sale',
    claim: 'upgradeCost returns nil at MaxLevel and nil is not a price',
    module: 'Objectives',
    find: '\t\tif cost ~= nil and (bestPrice == nil or cost < bestPrice) then',
    replace: '\t\tif (bestPrice == nil or (cost or 0) < bestPrice) then',
  },
  //[[ DELIBERATELY NOT MUTATED: `math.min(coins, price)` in tier 6.
  //
  //   It was mutated, it survived, and the survival is correct rather than a gap. Tier 4 fires
  //   on `coins >= price`, so tier 6 is only ever reached with `coins < price` and the clamp
  //   can never bind. It is an EQUIVALENT MUTANT — no test can distinguish the two programs,
  //   because no input reaches the difference.
  //
  //   The clamp stays in the source anyway: it is defence against a future reordering of the
  //   ladder, and the cost of a capsule that reads 3,000/2,500 is a HUD that is visibly lying
  //   about the player's money. Recording it here rather than deleting either the clamp or the
  //   mutation is the honest option — a survived mutant that is quietly removed looks exactly
  //   like a test that was quietly weakened. ]]
  {
    name: 'prices lose their thousands separators',
    claim: 'a price is formatted as a price, and the width budget depends on it',
    module: 'Objectives',
    find: '\tuntil count == 0',
    replace: '\tuntil true',
  },
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
  {
    name: "the allowance stops scaling with the interval",
    claim: "a server hitch is judged over the interval it actually covers",
    module: "Movement",
    find: "\tlocal allowance = math.max((entitled * SPEED_TOLERANCE + EXTRA_SPEED) * dt, MIN_ALLOWANCE)",
    replace: "\tlocal allowance = math.max(entitled * SPEED_TOLERANCE + EXTRA_SPEED, MIN_ALLOWANCE)",
  },
  {
    name: "the headroom over a flat walk is removed",
    claim: "a slope or a shove must not look like a teleport",
    module: "Movement",
    find: "\tlocal allowance = math.max((entitled * SPEED_TOLERANCE + EXTRA_SPEED) * dt, MIN_ALLOWANCE)",
    replace: "\tlocal allowance = math.max(entitled * dt, MIN_ALLOWANCE)",
  },
  {
    name: "a hostile speed is trusted",
    claim: "a corrupt speed cannot widen the allowance",
    module: "Movement",
    find: "\tlocal entitled = if type(speed) == \"number\" and speed == speed and speed > 0 and speed ~= math.huge\n\t\tthen speed\n\t\telse 0",
    replace: "\tlocal entitled = speed",
  },
  {
    name: "a NaN position is waved through",
    claim: "a NaN coordinate is not a legal position",
    module: "Movement",
    find: "\tif movedSq ~= movedSq then",
    replace: "\tif false then",
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
