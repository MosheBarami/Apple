/**
 * THE EVIDENCE LEDGER: what this run changed, read back, looked at and played — as facts a claim can be checked against.
 *
 * Properties under test, not spellings:
 *   - only a change that SUCCEEDED moves the mutation counter, and a failed one leaves no fact behind
 *   - colours and texts are recorded with HOW they are known (written, read back, played) and WHEN (sequence), because
 *     "I set it" and "I read it back" are different evidence and a later read outranks an earlier write
 *   - a look after the last change is what "looked at the work" means, and any later change un-looks it
 *   - the ledger is bounded and survives a JSON round trip: it is stored in a Durable Object value (128 KiB cap)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newLedger, recordToolCall, recordLook, lookNeeded, ledgerDigest, LEDGER_LIMITS,
} from '../src/evidence-ledger.ts';

const red = { t: 'Color3', v: [1, 0, 0] };
const white = { t: 'Color3', v: [1, 1, 1] };

const create = (items, extra = {}) => ({ tool: 'create_instances', kind: 'mutation', args: { items }, result: { created: items.map((i) => `${i.parent}.${i.name}`) }, ok: true, ...extra });

test('a successful change moves the mutation counter and names what it touched', () => {
  const l = newLedger();
  recordToolCall(l, create([{ className: 'Part', name: 'Door', parent: 'game.Workspace.House', props: { Color: red } }]));
  assert.equal(l.mutationSeq, 1);
  assert.deepEqual(l.touched, ['game.Workspace.House.Door']);
  assert.equal(l.entries.at(-1).kind, 'mutation');
  assert.equal(l.entries.at(-1).ok, true);
});

test('a failed change is recorded as a failure, moves nothing and leaves no fact', () => {
  const l = newLedger();
  recordToolCall(l, { ...create([{ className: 'Part', name: 'Door', parent: 'game.Workspace', props: { Color: red } }]), ok: false, result: { error: 'refused' } });
  assert.equal(l.mutationSeq, 0);
  assert.equal(l.entries.at(-1).ok, false);
  assert.deepEqual(l.colours, []);
  assert.deepEqual(l.names, []);
});

test('a composite that failed after it already changed the place still counts as a change, but none of what it wrote is trusted', () => {
  const l = newLedger();
  recordToolCall(l, { ...create([{ className: 'Part', name: 'Door', parent: 'game.Workspace', props: { Color: red } }]), ok: false, partial: true, result: { error: 'half done' } });
  assert.equal(l.mutationSeq, 1, 'the place changed, so a look is owed');
  assert.deepEqual(l.touched, ['game.Workspace.Door']);
  assert.deepEqual(l.colours, []);
  assert.deepEqual(l.names, []);
  assert.equal(l.entries.at(-1).ok, false);
});

test('colours written by create_instances are facts known by write, nested children included', () => {
  const l = newLedger();
  recordToolCall(l, create([{
    className: 'Model', name: 'House', parent: 'game.Workspace',
    children: [{ className: 'Part', name: 'Roof', props: { Color: red } }, { className: 'Part', name: 'Wall', props: { BrickColor: { t: 'BrickColor', v: 'Bright blue' } } }],
  }]));
  const roof = l.colours.find((c) => c.path === 'game.Workspace.House.Roof');
  assert.ok(roof, JSON.stringify(l.colours));
  assert.equal(roof.via, 'write');
  assert.equal(roof.family, 'red');
  const wall = l.colours.find((c) => c.path === 'game.Workspace.House.Wall');
  assert.equal(wall.family, 'blue');
  assert.ok(l.names.some((n) => n.path === 'game.Workspace.House.Roof'));
});

test('set_properties writes a colour at its path', () => {
  const l = newLedger();
  recordToolCall(l, { tool: 'set_properties', kind: 'mutation', args: { path: 'game.Workspace.Door', props: { Color: red } }, result: { path: 'game.Workspace.Door', set: ['Color'] }, ok: true });
  assert.equal(l.colours.length, 1);
  assert.deepEqual([l.colours[0].path, l.colours[0].family, l.colours[0].via], ['game.Workspace.Door', 'red', 'write']);
});

test('a read-back is a fact known by read, with the sequence that lets it outrank an earlier write', () => {
  const l = newLedger();
  recordToolCall(l, { tool: 'set_properties', kind: 'mutation', args: { path: 'game.Workspace.Door', props: { Color: red } }, result: {}, ok: true });
  recordToolCall(l, { tool: 'get_instance', kind: 'read', args: { path: 'game.Workspace.Door' }, result: { path: 'game.Workspace.Door', name: 'Door', class: 'Part', props: { Color: white } }, ok: true });
  const door = l.colours.filter((c) => c.path === 'game.Workspace.Door');
  assert.equal(door.length, 2);
  const [write, read] = [door.find((c) => c.via === 'write'), door.find((c) => c.via === 'read')];
  assert.equal(read.family, 'white');
  assert.ok(read.seq > write.seq, 'the read-back must be later than the write');
});

test('text written into a label and text read back are both facts, and neither is yet "visible"', () => {
  const l = newLedger();
  recordToolCall(l, { tool: 'set_properties', kind: 'mutation', args: { path: 'game.StarterGui.Hud.Title', props: { Text: { t: 'string', v: 'Welcome Back' } } }, result: {}, ok: true });
  recordToolCall(l, { tool: 'get_instance', kind: 'read', args: { path: 'game.StarterGui.Hud.Title' }, result: { path: 'game.StarterGui.Hud.Title', name: 'Title', class: 'TextLabel', props: { Text: { t: 'string', v: 'Welcome Back' } } }, ok: true });
  assert.deepEqual(l.texts.map((t) => [t.text, t.via, t.visible]), [['Welcome Back', 'write', null], ['Welcome Back', 'read', null]]);
});

test('a real play check records what the player saw: visible and hidden text apart, and the errors', () => {
  const l = newLedger();
  recordToolCall(l, {
    tool: 'play_check', kind: 'play', args: {}, ok: true,
    result: { verdict: 'observed', playerSees: 'The player\'s screen: ...', clientErrors: [], serverErrors: [] },
    extra: {
      playerJoined: true, characterSpawned: true, clientReported: true,
      screenGuis: [{ name: 'Hud', enabled: true, labels: [{ name: 'Title', class: 'TextLabel', text: 'Score', visible: true }, { name: 'Secret', class: 'TextLabel', text: 'Welcome Back', visible: false }] }],
      clientErrors: [], serverErrors: [],
    },
  });
  const shown = l.texts.filter((t) => t.via === 'play');
  assert.deepEqual(shown.map((t) => [t.text, t.visible]).sort(), [['Score', true], ['Welcome Back', false]]);
  assert.equal(l.plays.length, 1);
  assert.equal(l.plays[0].errors, 0);
  assert.equal(l.plays[0].mutationSeq, 0);
});

test('a disabled ScreenGui shows the player none of its text', () => {
  const l = newLedger();
  recordToolCall(l, {
    tool: 'play_check', kind: 'play', args: {}, ok: true, result: { verdict: 'observed' },
    extra: { playerJoined: true, characterSpawned: true, clientReported: true, screenGuis: [{ name: 'Hud', enabled: false, labels: [{ name: 'Title', text: 'Score', visible: true }] }] },
  });
  assert.deepEqual(l.texts.map((t) => [t.text, t.visible]), [['Score', false]]);
});

test('without the raw report the visible text is read out of the summary the agent was given', () => {
  const l = newLedger();
  recordToolCall(l, {
    tool: 'play_check', kind: 'play', args: {}, ok: true,
    result: { verdict: 'observed', playerSees: 'The player\'s screen: ScreenGui "Hud" (enabled): visible text "Coins 0" [Counter], "Shop" [ShopButton]; hidden: Tip.', clientErrors: ['x is nil'], serverErrors: [] },
  });
  assert.deepEqual(l.texts.filter((t) => t.visible === true).map((t) => t.text).sort(), ['Coins 0', 'Shop']);
  assert.equal(l.plays[0].errors, 1);
});

test('a play that found nothing observed records that, so "it works" cannot lean on it', () => {
  const l = newLedger();
  recordToolCall(l, { tool: 'play_check', kind: 'play', args: {}, ok: true, result: { verdict: 'no_report', playerSees: 'NOT OBSERVED: the player\'s client never answered' } });
  assert.equal(l.plays[0].observed, false);
  assert.deepEqual(l.texts, []);
});

test('a press that activated and changed nothing is kept as exactly that', () => {
  const l = newLedger();
  recordToolCall(l, {
    tool: 'play_check_ui', kind: 'play', args: { press: ['game.StarterGui.Shop.Buy'] }, ok: true,
    result: { verdict: 'observed', playerSees: 'x', presses: ['game.StarterGui.Shop.Buy: pressed, and the button activated; NOTHING changed on the player\'s screen, leaderstats, Humanoid or attributes within 1 s'] },
  });
  assert.deepEqual(l.plays[0].pressedNoChange, ['game.StarterGui.Shop.Buy']);
});

test('deleting an instance removes what was known about it', () => {
  const l = newLedger();
  recordToolCall(l, create([{ className: 'Part', name: 'Door', parent: 'game.Workspace', props: { Color: red } }]));
  recordToolCall(l, { tool: 'delete_instances', kind: 'mutation', args: { paths: ['game.Workspace.Door'] }, result: { deleted: 1 }, ok: true });
  assert.deepEqual(l.colours, []);
  assert.deepEqual(l.names, []);
});

test('a look after the last change is "looked at"; any later change un-looks it', () => {
  const l = newLedger();
  assert.equal(lookNeeded(l), false, 'nothing changed, so nothing to look at');
  recordToolCall(l, create([{ className: 'Part', name: 'A', parent: 'game.Workspace' }]));
  assert.equal(lookNeeded(l), true);
  recordLook(l, { ok: true, source: 'studio_viewport', views: ['front', 'eye'], observations: [{ about: 'a part', verdict: 'seen', note: 'a grey block in front of the camera' }], answers: [], issues: [] });
  assert.equal(lookNeeded(l), false);
  assert.equal(l.lookCount, 1);
  assert.equal(l.lastLookMutationSeq, 1);
  recordToolCall(l, create([{ className: 'Part', name: 'B', parent: 'game.Workspace' }]));
  assert.equal(lookNeeded(l), true);
});

test('a look that could not run does not count as looking, and is remembered as a failure', () => {
  const l = newLedger();
  recordToolCall(l, create([{ className: 'Part', name: 'A', parent: 'game.Workspace' }]));
  recordLook(l, { ok: false, source: 'none', views: [], observations: [], answers: [], issues: [], error: 'no capture' });
  assert.equal(lookNeeded(l), true);
  assert.equal(l.lookFailures, 1);
  assert.equal(l.lookCount, 1, 'an attempt still counts against the per-run cap');
});

test('what a look observed is kept as facts with the change number it was true at', () => {
  const l = newLedger();
  recordToolCall(l, create([{ className: 'Part', name: 'A', parent: 'game.Workspace' }]));
  recordLook(l, { ok: true, source: 'box_approximation', views: ['front'], observations: [{ about: 'the red door', verdict: 'not_seen', note: 'no door in any view' }, { about: 'the sign', verdict: 'cannot_tell', note: 'too small' }], answers: [], issues: ['one wall floats'] });
  assert.deepEqual(l.looks.map((o) => [o.about, o.verdict, o.mutationSeq, o.source]), [
    ['the red door', 'not_seen', 1, 'box_approximation'], ['the sign', 'cannot_tell', 1, 'box_approximation'],
  ]);
  assert.deepEqual(l.lookIssues, ['one wall floats']);
});

test('the ledger is bounded however much a run does, and stays well under the storage value cap', () => {
  const l = newLedger();
  const huge = 'x'.repeat(5000);
  for (let i = 0; i < 600; i++) {
    recordToolCall(l, create([{ className: 'Part', name: `P${i}`, parent: 'game.Workspace.Big', props: { Color: red, Text: { t: 'string', v: huge } } }]));
    recordToolCall(l, { tool: 'get_instance', kind: 'read', args: { path: `game.Workspace.Big.P${i}` }, result: { path: `game.Workspace.Big.P${i}`, name: `P${i}`, props: { Color: white } }, ok: true });
  }
  assert.ok(l.entries.length <= LEDGER_LIMITS.entries, `entries ${l.entries.length}`);
  assert.ok(l.colours.length <= LEDGER_LIMITS.colours);
  assert.ok(l.texts.length <= LEDGER_LIMITS.texts);
  assert.ok(l.names.length <= LEDGER_LIMITS.names);
  assert.ok(l.touched.length <= LEDGER_LIMITS.touched);
  assert.equal(l.mutationSeq, 600, 'the counter is a count, not a list: it is never capped');
  const bytes = JSON.stringify(l).length;
  assert.ok(bytes < 90_000, `serialised ${bytes} bytes`);
  assert.ok(l.texts.every((t) => t.text.length <= LEDGER_LIMITS.textChars));
});

test('the ledger survives a JSON round trip unchanged', () => {
  const l = newLedger();
  recordToolCall(l, create([{ className: 'Part', name: 'Door', parent: 'game.Workspace', props: { Color: red } }]));
  recordLook(l, { ok: true, source: 'studio_viewport', views: ['front'], observations: [{ about: 'door', verdict: 'seen', note: 'red door' }], answers: [], issues: [] });
  assert.deepEqual(JSON.parse(JSON.stringify(l)), l);
});

test('the digest names evidence plainly, newest last, and respects its size bound', () => {
  const l = newLedger();
  recordToolCall(l, { tool: 'set_properties', kind: 'mutation', args: { path: 'game.Workspace.Door', props: { Color: red } }, result: {}, ok: true });
  recordToolCall(l, { tool: 'get_instance', kind: 'read', args: { path: 'game.Workspace.Door' }, result: { path: 'game.Workspace.Door', name: 'Door', props: { Color: white } }, ok: true });
  const d = ledgerDigest(l, 2000);
  assert.match(d, /Door/);
  assert.match(d, /white/);
  assert.ok(d.indexOf('red') < d.indexOf('white'), 'the write comes before the read-back that contradicts it');
  assert.ok(ledgerDigest(l, 60).length <= 60);
});

test('a malformed record never throws: a failure to record must not break the run that is being recorded', () => {
  const l = newLedger();
  assert.doesNotThrow(() => recordToolCall(l, { tool: 'x', kind: 'read', args: null, result: undefined, ok: true }));
  assert.doesNotThrow(() => recordToolCall(l, { tool: 'x', kind: 'mutation', args: 'not an object', result: 7, ok: true }));
  assert.doesNotThrow(() => recordToolCall(l, { tool: 'x', kind: 'play', args: {}, result: { circular: (() => { const o = {}; o.o = o; return o; })() }, ok: true, extra: (() => { const o = {}; o.o = o; return o; })() }));
});
