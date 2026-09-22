// PLUGIN VERSION + COMPATIBILITY GATE
//
// WHAT THIS PROTECTS. Roblox has no automatic plugin updating: Studio has per-plugin
// "Update" buttons a human clicks, confirmed by Roblox staff on 2026-04-27. So a
// server that refuses an old plugin does not inconvenience the user, it strands them
// — there is no push channel that can rescue anyone. Two properties therefore have to
// hold forever, and both are asserted below:
//
//   1. A plugin that reports NO version is served. It predates version reporting, and
//      silence is not evidence of breakage. This must hold at every possible value of
//      the minimum-supported floor, so raising the floor later cannot retroactively
//      lock out clients that never had a chance to identify themselves.
//
//   2. A version difference alone never blocks anyone. Admission is decided by the
//      wire PROTOCOL, which changes almost never; VERSION is advisory only.
//
// AND THE INVERSE. A gate that has never been seen to fire is indistinguishable from
// a gate that is wired up wrong — this repo has already shipped one of those. So the
// refusal path is driven here with a hypothetical floor, proving the mechanism works
// on the day someone raises it for real.
//
// The module under test is bundled out of apps/worker/src/plugin-version.ts, so these
// are assertions about the shipping code, not about a replica of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const WORKER = join(REPO, 'apps', 'worker');
const ESBUILD = join(WORKER, 'node_modules', '.bin', 'esbuild');

const out = join(mkdtempSync(join(tmpdir(), 'apple-plugin-version-')), 'plugin-version.mjs');
execFileSync(ESBUILD, [join(WORKER, 'src', 'plugin-version.ts'), '--format=esm', '--platform=neutral', '--main-fields=main,module', `--outfile=${out}`], {
  stdio: 'pipe',
});
const V = await import(`file://${out}`);

// ---------------------------------------------------------------- property 1
test('an unknown protocol is compatible', () => {
  assert.equal(V.pluginCompatibility(null).compatible, true);
});

test('an unknown protocol stays compatible at every floor, however high', () => {
  // The whole point. If this ever fails, a future protocol bump silently bricks
  // every plugin installed before version reporting existed, and those users have
  // no automatic update to rescue them.
  for (const floor of [1, 2, 3, 10, 99, Number.MAX_SAFE_INTEGER]) {
    assert.equal(V.pluginCompatibility(null, floor).compatible, true, `floor ${floor} rejected an unknown client`);
  }
});

test('a malformed protocol header reads as unknown, not as zero', () => {
  // "0" would be below any floor and would look like an ancient client. Garbage must
  // degrade to unknown-and-served, never to known-and-refused.
  for (const raw of ['', '   ', 'abc', '1.0', '-1', 'NaN', '1e3', null, undefined, '0x1', '1234567']) {
    assert.equal(V.parseProtocol(raw), null, `parseProtocol(${JSON.stringify(raw)}) should be unknown`);
    assert.equal(V.pluginCompatibility(V.parseProtocol(raw), 99).compatible, true);
  }
  assert.equal(V.parseProtocol('1'), 1);
  assert.equal(V.parseProtocol(' 2 '), 2);
});

// ---------------------------------------------------------------- property 2
test('a version difference alone never blocks a client', () => {
  const ancient = { version: '0.0.1', protocol: V.CURRENT_PLUGIN_PROTOCOL };
  const notice = V.clientNotice(ancient, '9.9.9');
  assert.equal(notice.compatible, true, 'an old version must not be refused');
  assert.match(notice.message, /Manage Plugins/, 'advice must name the real update mechanism');
});

test('the shipping configuration refuses nobody', () => {
  // MIN equals CURRENT today, deliberately: nothing is actually incompatible yet.
  assert.equal(V.MIN_PLUGIN_PROTOCOL <= V.CURRENT_PLUGIN_PROTOCOL, true);
  assert.equal(V.pluginCompatibility(V.CURRENT_PLUGIN_PROTOCOL).compatible, true);
  assert.equal(V.pluginCompatibility(null).compatible, true);
});

// ------------------------------------------------------- the gate can fire
test('a genuinely obsolete protocol IS refused once the floor is raised', () => {
  const verdict = V.pluginCompatibility(1, 2);
  assert.equal(verdict.compatible, false, 'the refusal path must actually work');
  assert.match(verdict.message, /too old/i);
  assert.match(verdict.message, /Manage Plugins/, 'a refusal must tell the user how to fix it');
});

test('clientNotice surfaces incompatibility ahead of any update advice', () => {
  const notice = V.clientNotice({ version: '0.0.1', protocol: 1 }, '9.9.9', 2);
  assert.equal(notice.compatible, false);
  assert.doesNotMatch(notice.message, /is available/, 'an unusable client is not told about a nice-to-have');
});

// ---------------------------------------------------------------- advisories
test('no notice at all when there is nothing to say', () => {
  assert.equal(V.clientNotice({ version: V.LATEST_PLUGIN_VERSION, protocol: V.CURRENT_PLUGIN_PROTOCOL }), null);
  // A client somehow ahead of the server is not nagged to downgrade.
  assert.equal(V.clientNotice({ version: '99.0.0', protocol: V.CURRENT_PLUGIN_PROTOCOL }), null);
  // Unknown version cannot be compared, so it must produce silence rather than a guess.
  assert.equal(V.clientNotice({ version: null, protocol: V.CURRENT_PLUGIN_PROTOCOL }), null);
});

test('compareVersions refuses to guess', () => {
  assert.equal(V.compareVersions('1.2.3', '1.2.4'), -1);
  assert.equal(V.compareVersions('1.2.3', '1.2.3'), 0);
  assert.equal(V.compareVersions('1.10.0', '1.9.0'), 1, 'numeric, not lexicographic');
  assert.equal(V.compareVersions('1.2', '1.2.0'), 0);
  assert.equal(V.compareVersions('0.2.0-beta', '0.2.0'), 0, 'prerelease tags are not ordered here');
  for (const bad of [null, '', 'v1.2.3', 'latest', '1.2.x', '1.2.3.4.5']) {
    assert.equal(V.compareVersions(bad, '1.0.0'), null, `${JSON.stringify(bad)} should be unorderable`);
  }
});

// ---------------------------------------------------------------- untrusted input
test('reported version strings are treated as untrusted', () => {
  // This value is persisted and rendered in the web UI, so it must not be able to
  // carry markup, control characters, or unbounded length.
  const hostile = ['<img src=x onerror=1>', 'a'.repeat(64), 'has space', '0.1.0\u0000', '0.1\n.0', '', '../../etc', null, 42];
  for (const bad of hostile) {
    assert.equal(V.sanitizeVersion(bad), null, `${JSON.stringify(bad)} should be rejected`);
  }
  assert.equal(V.sanitizeVersion('0.2.0'), '0.2.0');
  // Surrounding whitespace is stripped rather than rejected: a stray newline on a
  // header is a transport artefact, not a hostile value, and what survives the trim
  // is still validated against the charset before it is accepted.
  assert.equal(V.sanitizeVersion(' 1.0.0-rc.1 '), '1.0.0-rc.1');
  assert.equal(V.sanitizeVersion('0.1.0\n'), '0.1.0');
});

test('readPluginHeaders degrades to unknown rather than throwing', () => {
  const empty = V.readPluginHeaders(new Headers());
  assert.deepEqual(empty, { version: null, protocol: null });
  const good = V.readPluginHeaders(new Headers({ 'X-Golem-Plugin-Version': '0.2.0', 'X-Golem-Plugin-Protocol': '1' }));
  assert.deepEqual(good, { version: '0.2.0', protocol: 1 });
});

// ------------------------------------------------- the two files must not drift
//
// THE PLUGIN THESE READ IS apps/apple-plugin, the one the Creator Store serves (asset
// 107230158271368). Until 2026-09-22 they read apps/plugin/src/Version.luau — the legacy build,
// whose asset was removed — so the worker's idea of "latest" was pinned to a plugin nobody can
// install and this suite stayed green about it.
const PLUGIN_SRC = join(REPO, 'apps', 'apple-plugin', 'src');
// Luau comments stripped first: Bridge.luau explains its version in prose, and a scanner that read
// the explanation would find the constant in a sentence about it.
const luauCode = (file) => readFileSync(join(PLUGIN_SRC, file), 'utf8')
  .replace(/--\[(=*)\[[\s\S]*?\]\1\]/g, '')
  .replace(/--[^\n]*/g, '');
const BRIDGE = luauCode('Bridge.luau');
const DECLARED_VERSION = BRIDGE.match(/local PLUGIN_VERSION\s*=\s*"([^"]+)"/)?.[1];
const DECLARED_PROTOCOL = BRIDGE.match(/local PLUGIN_PROTOCOL\s*=\s*"(\d+)"/)?.[1];

test('the plugin and the worker agree on the protocol number', () => {
  // Nothing else enforces this. If the plugin says protocol 2 and the worker still thinks 1 is
  // current, the mismatch is invisible until users are refused.
  assert.ok(DECLARED_PROTOCOL, 'Bridge.luau must declare PLUGIN_PROTOCOL as a quoted integer');
  assert.equal(Number(DECLARED_PROTOCOL), V.CURRENT_PLUGIN_PROTOCOL, 'plugin PLUGIN_PROTOCOL vs worker CURRENT_PLUGIN_PROTOCOL');
});

test('the worker never announces a plugin version the shipped source does not have', () => {
  // LATEST_PLUGIN_VERSION is what the Creator Store serves; the source may be AHEAD of it while a
  // build is unpublished (clientNotice then reads the newer client as newer, and says nothing),
  // but never behind it — an update notice for a version the source does not contain would send a
  // user to Manage Plugins for nothing. Equality is not required: publishing is a human step in
  // Studio, and a test that forced the two equal would force someone to announce an unpublished
  // build or to under-report the one they are running.
  assert.ok(DECLARED_VERSION, 'Bridge.luau must declare PLUGIN_VERSION on one line, quoted');
  const order = V.compareVersions(V.LATEST_PLUGIN_VERSION, DECLARED_VERSION);
  assert.notEqual(order, null, `cannot order LATEST_PLUGIN_VERSION ${V.LATEST_PLUGIN_VERSION} against PLUGIN_VERSION ${DECLARED_VERSION}`);
  assert.ok(order <= 0, `the worker announces ${V.LATEST_PLUGIN_VERSION} but the shipped plugin's source is ${DECLARED_VERSION}`);
  // And a client exactly at the source version is never told to update.
  assert.equal(V.clientNotice({ version: DECLARED_VERSION, protocol: V.CURRENT_PLUGIN_PROTOCOL }), null);
});

test('the plugin reports its version on every request, and every copy of it agrees', () => {
  // The periodic `state` event carries pluginVersion too, but pairing and the first polls would
  // otherwise be anonymous, so the headers must carry it on every request.
  assert.match(BRIDGE, /\["X-Golem-Plugin-Version"\]\s*=\s*PLUGIN_VERSION\b/);
  assert.match(BRIDGE, /\["X-Golem-Plugin-Protocol"\]\s*=\s*PLUGIN_PROTOCOL\b/);
  // There is no Version module in this plugin: the entry script repeats the literal in its state
  // event and in the label a user reads in the dock. The property is that every copy agrees with
  // the one the headers send, so a bump that misses one is a failure rather than a plugin that
  // tells the worker one version and the user another.
  const init = luauCode('init.server.luau');
  const stated = init.match(/pluginVersion\s*=\s*"([^"]+)"/)?.[1];
  const shown = init.match(/"Apple Studio · (\d+\.\d+\.\d+)\b/)?.[1];
  assert.ok(stated, 'init.server.luau no longer puts pluginVersion in its state event');
  assert.ok(shown, 'the version must be visible in the plugin UI');
  assert.equal(stated, DECLARED_VERSION, 'the state event reports a different version from the headers');
  assert.equal(shown, DECLARED_VERSION, 'the dock shows a different version from the one the worker is told');
  const pkg = JSON.parse(readFileSync(join(REPO, 'apps', 'apple-plugin', 'package.json'), 'utf8'));
  assert.equal(pkg.version, DECLARED_VERSION, 'apps/apple-plugin/package.json names a different version');
});

test('an incompatible client is handed no ops', () => {
  // Static assertion over the DO: Durable Object internals need the Cloudflare
  // runtime, so this checks the source rather than the behaviour. Handing queued ops
  // to a plugin that cannot run them would burn the user's work on guaranteed
  // failures instead of showing one fixable message.
  const session = readFileSync(join(REPO, 'apps', 'worker', 'src', 'do', 'session.ts'), 'utf8');
  const blocked = session.match(/if \(notice && !notice\.compatible\) \{[\s\S]*?\n {4}\}/);
  assert.ok(blocked, 'session.ts must short-circuit on an incompatible client');
  assert.match(blocked[0], /ops: \[\]/, 'the blocked response must carry no ops');
  assert.doesNotMatch(blocked[0], /opQueue/, 'the queue must be left intact for after the user updates');
});
