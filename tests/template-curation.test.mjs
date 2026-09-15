// THE CURATOR'S ONE NON-NEGOTIABLE: a cheat, a macro or an exploit repository must be EXCLUDED,
// by a named rule, and must never be reachable by the agent.
//
// template-seeds.json is a GitHub search result, not a library. Searching `topic:roblox` returns
// the people who write Roblox games and, in the same page, the people who write software to cheat
// at them. Ranking the second group low is not enough: a ranking is a preference, and a preference
// with enough matching keywords becomes a result. The exclusion has to be a gate, and the gate has
// to say which rule fired — "excluded" as a bare verdict is unauditable, and a rule nobody can read
// is a rule nobody can falsify.
//
// THE FIXTURES ARE REAL ROWS. Every repository named here is in the committed harvest, with the
// description it actually has. An invented fixture would let the curator pass against language that
// no real repository uses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { curate, EXCLUSION_RULES } from '../scripts/lib/template-curation.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HARVEST = JSON.parse(readFileSync(join(ROOT, 'packages', 'corpus', 'data', 'template-seeds.json'), 'utf8'));
const byName = new Map(HARVEST.templates.map((t) => [t.fullName, t]));

/** A real harvested row, or a loud failure — a fixture that silently became `undefined` proves nothing. */
const row = (fullName) => {
  const r = byName.get(fullName);
  assert.ok(r, `${fullName} is not in template-seeds.json — the fixture, not the curator, is stale`);
  return r;
};

/* ------------------------------------------------------- the gate the agent must never cross --- */

// Named individually rather than looped over a regex, because the point is that THESE repositories,
// which a keyword search for "roblox" really does return, do not reach a customer's game.
const ABUSE = [
  ['NatroTeam/NatroMacro', 'a Bee Swarm Simulator macro, 2,404 stars — the most-starred "roblox" hit after the tooling'],
  ['VirageRoblox/Virage-Grow-A-Garden-Macro', 'a macro for one live game'],
  ['DarksenDev/tds-macro', 'an AutoHotkey macro for Tower Defense Simulator'],
  ['mstudio45/digmacro', 'plays a minigame for the user'],
  ['Cweamy/Anime-Expeditions-Creams-Macro', 'an auto-farm bot'],
  ['Exunys/AirHub-V2', 'ESP and aim assistance, and it carries CC0 — a permissive licence on an exploit is still an exploit'],
  ['Exunys/Exunys-ESP', 'a universal ESP module'],
  ['markitos4/GLExternal', 'an executor'],
  ['dragon11vortex/Roblox-wallhack', 'a wallhack'],
  ['Seconb/Roblox-Colorbot', 'an aimbot'],
  ['taylorethanoby9232/brookhaven-script-hub', 'a script hub'],
  ['Footagesus/WindUI', 'a UI library whose stated purpose is Roblox script hubs'],
  ['H20CalibreYT/RobloxAccountCreator', 'an account generator'],
  ['BoarIncorporated/FuncapSolver', 'a captcha solver'],
  ['nitaybl/ByGoneSpoofer', 'ban-evasion tooling'],
  ['8damon/ARES-Spoofer-Byfron', 'defeats the anti-cheat'],
  ['efenatuyo/roblox-trade-bot', 'a trade bot'],
  ['sh4den/Hawkish-Eyes-NoDualHook', 'a credential stealer'],
  ['Aspectise/Roblox-Mass-Tools', 'mass group leaver, account nuker, pin cracker'],
];

test('a cheat, macro or exploit repository is EXCLUDED, and the exclusion names the rule and the word that fired it', () => {
  for (const [fullName, why] of ABUSE) {
    const verdict = curate(row(fullName));
    assert.equal(verdict.kept, false, `${fullName} (${why}) was KEPT`);
    assert.equal(verdict.exclusion.class, 'abuse',
      `${fullName} was excluded as "${verdict.exclusion.class}" — being off-topic is a different fact from being an exploit`);
    assert.ok(verdict.exclusion.rule, `${fullName} was excluded by no named rule`);
    assert.ok(verdict.exclusion.why.length > 20, `${fullName}'s exclusion gives no readable reason`);
    // The literal token that fired, so a human can disagree with the specific word.
    assert.ok(verdict.exclusion.matched, `${fullName} was excluded without naming what matched`);
  }
});

test('every abuse rule carries a reason a person can argue with', () => {
  const abuse = EXCLUSION_RULES.filter((r) => r.class === 'abuse');
  assert.ok(abuse.length >= 4, 'the abuse rules collapsed into one bucket');
  for (const r of abuse) {
    assert.ok(r.id && r.why && r.why.length > 30, `rule ${r.id} has no reason`);
    assert.ok(r.terms.length, `rule ${r.id} matches nothing`);
  }
});

/* --------------------------------------------- the false positives a substring match would make --- */

// Each of these is a real row that a naive /hack|esp|macro|bot/ sweep really does hit. They were
// found by running exactly that sweep over the harvest, and they are why matching is done on whole
// tokens rather than substrings.
test('a substring is not a word: hacktoberfest, codespaces and Flamework macros are not exploits', () => {
  for (const [fullName, trap] of [
    ['JohnnyMorganz/StyLua', 'topic "hacktoberfest" contains "hack"'],
    ['JohnnyMorganz/luau-lsp', 'topic "hacktoberfest" contains "hack"'],
    ['ryanlua/satchel', 'topic "works-with-codespaces" contains "esp"'],
    ['rbxts-flamework/jecs', 'the description says "Flamework macros" — a language feature, not a bot'],
    ['noblox/noblox.js', 'topic "hacktoberfest" contains "hack"'],
  ]) {
    const verdict = curate(row(fullName));
    assert.notEqual(verdict.exclusion?.class, 'abuse', `${fullName} was called an exploit because ${trap}`);
  }
});

test('an anti-cheat is a mechanic, not a cheat — "cheat" inside "anticheat" is not the word "cheat"', () => {
  const verdict = curate(row('rayanux/roblox-movement-anticheat'));
  assert.notEqual(verdict.exclusion?.class, 'abuse',
    'server-side movement validation is one of the mechanics the agent is asked to write');
});

/* ------------------------------------------------------ off-topic is excluded, but said so --- */

test('a Rust CSV tool and a Lua formatter are excluded as NOT A MECHANIC, which is a different sentence', () => {
  for (const fullName of ['dathere/qsv', 'JohnnyMorganz/StyLua', 'rojo-rbx/rojo', 'roblox-ts/roblox-ts']) {
    const verdict = curate(row(fullName));
    assert.equal(verdict.kept, false, `${fullName} was kept as a game mechanic`);
    assert.equal(verdict.exclusion.class, 'not-a-mechanic',
      `${fullName} is legitimate software — calling it abuse would be a lie about its authors`);
  }
});

/* ------------------------------------------------- a mechanic claim needs evidence in the tree --- */

test('a repository whose file tree was never read is NOT kept — unread is not clean', () => {
  const candidate = row('ryanlua/satchel');
  const unread = curate(candidate, { tree: null, treeError: 'rate limited' });
  assert.equal(unread.kept, false);
  assert.equal(unread.exclusion.class, 'unverified');
  assert.match(unread.exclusion.why, /not read|unread|could not/i);
});

test('the mechanic comes from a path in the repository, and the path is quoted back', () => {
  const kept = curate(row('ryanlua/satchel'), {
    tree: ['src/Satchel/InventoryController.lua', 'src/Satchel/HotbarButton.lua', 'default.project.json'],
  });
  assert.equal(kept.kept, true, JSON.stringify(kept.exclusion ?? {}));
  const inv = kept.mechanics.find((m) => m.id === 'inventory');
  assert.ok(inv, `no inventory mechanic found in ${JSON.stringify(kept.mechanics)}`);
  assert.equal(inv.via, 'tree');
  assert.match(inv.where, /InventoryController\.lua/);
});

test('a description alone cannot mint a mechanic — the claim must be in the code tree', () => {
  const describedOnly = curate(
    { ...row('ryanlua/satchel'), description: 'a pet system, a shop, a leaderboard and a round system' },
    { tree: ['README.md', 'LICENSE'] },
  );
  assert.equal(describedOnly.kept, false,
    'a README is marketing; keeping a repository on its description alone is how the first 3,017 rows happened');
});
