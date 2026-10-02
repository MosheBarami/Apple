/**
 * model_anatomy: what a placed model is made of, read from get_tree, so behaviour can be attached to the right part.
 * Every model is invented for these tests (tests/behaviour-fixtures.mjs); none names a subject the product is asked to build.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { part, inst, joint, finalize, fakeStudio, coverModel, leafModel, anonymousModel } from './behaviour-fixtures.mjs';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'anatomy-')), 'a.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'model-anatomy.ts'), '--bundle', '--format=esm', '--target=es2022', '--platform=node', '--outfile=' + out, '--external:cloudflare:*'], { cwd: WORKER, stdio: 'pipe' });
const A = await import(`file://${out}`);
const parseSegments = (p) => { const m = p.split('.'); return m[0] === 'game' ? m.slice(1) : null; };

const dataOf = (root) => JSON.parse(JSON.stringify({ root, nodeCount: 1, truncated: false }));
const treeOf = (root) => { const t = A.parseTree(dataOf(root)); assert.ok(!('error' in t), 'error' in t ? t.error : ''); return t; };

test('parseTree: addresses, relative segments, and #k only where siblings share a name', () => {
  const { root } = anonymousModel();
  const t = treeOf(root);
  const names = t.nodes.map((n) => n.address);
  assert.deepEqual(names, ['game.Workspace.Piece', 'game.Workspace.Piece["Part#1"]', 'game.Workspace.Piece["Part#2"]', 'game.Workspace.Piece.MeshPart']);
  assert.deepEqual(t.root.children[1].segs, [{ name: 'Part', nth: 2 }]);
  assert.deepEqual(t.root.children[2].segs, ['MeshPart'], 'a unique name stays a plain name');
  assert.equal(t.root.children[0].ambiguous, true);
});

test('findNode: exact, #k, out-of-range, ambiguous without #k, missing with the names that exist', () => {
  const { root } = anonymousModel();
  const t = treeOf(root);
  const at = (p) => A.findNode(t, p, parseSegments);
  assert.equal(at('game.Workspace.Piece.MeshPart').name, 'MeshPart');
  assert.equal(at('game.Workspace.Piece.Part#2').children.length, 0);
  assert.equal(at('game.Workspace.Piece.Part#2'), t.root.children[1], 'the second of the two, not the first');
  assert.equal(at('game.Workspace.Piece'), t.root, 'the model itself');
  assert.match(at('game.Workspace.Piece.Part#3').error, /out of range \(use #1 to #2\)/);
  assert.match(at('game.Workspace.Piece.Part').error, /2 children named Part; say which one with Part#1 to Part#2/);
  assert.match(at('game.Workspace.Piece.Mesh').error, /no child named Mesh \(it has: .*MeshPart/);
  assert.match(at('game.Workspace.Other.Part').error, /not inside game\.Workspace\.Piece/);
  assert.match(at('Piece.Part').error, /not a path/);
});

test('analyse: parts, joints (with sibling ordinals for duplicates), the root part, and what hangs from what', () => {
  const m = coverModel();
  const t = treeOf(m.root);
  const a = A.analyse(t);
  assert.equal(a.parts.length, 3);
  assert.deepEqual(a.joints.map((j) => [j.class, j.name]), [['WeldConstraint', 'Hold'], ['Weld', 'Seam']].sort((x, y) => a.joints.findIndex((j) => j.name === x[1]) - a.joints.findIndex((j) => j.name === y[1])));
  assert.equal(a.parts[a.rootPart - 1].node.name, 'Body', 'the PrimaryPart is the root part');
  const cover = a.parts.find((p) => p.node.name === 'Cover');
  const knob = a.parts.find((p) => p.node.name === 'Knob');
  assert.deepEqual(a.rides.get(cover.i), [knob.i], 'the knob hangs from the cover through the weld; the cover hangs from the body');
  assert.ok(a.contacts.get(cover.i).includes(a.parts.find((p) => p.node.name === 'Body').i), 'the cover rests against the body');
});

test('analyse: a joint to one of two same-named parts goes to the right one', () => {
  const x = part('Part', { at: [0, 0.5, 0], size: [2, 1, 2] });
  const y = part('Part', { at: [5, 0.5, 0], size: [2, 1, 2] });
  const z = part('Anchor', { at: [5, 2, 0], size: [1, 1, 1] });
  z.children.push(joint('Link', 'WeldConstraint', y, z));
  const root = finalize(inst('Pair', 'Model', {}, [x, y, z]), 'game.Workspace.Pair');
  const a = A.analyse(treeOf(root));
  const yRec = a.parts.find((p) => p.node === a.parts[1].node);
  assert.equal(a.joints.length, 1);
  assert.deepEqual([a.joints[0].a, a.joints[0].b].sort(), [2, 3], 'the weld is between the SECOND Part and Anchor');
  assert.ok(yRec);
});

test('hingeCandidates: a cover resting on a body offers its bottom edges, long edge first, and says which way a positive angle goes', () => {
  const m = coverModel();
  const t = treeOf(m.root);
  const a = A.analyse(t);
  const cover = a.parts.find((p) => p.node.name === 'Cover');
  const h = A.hingeCandidates(a, cover);
  assert.ok(h.length >= 4, 'the four bottom edges all rest on the body');
  assert.ok(h.slice(0, 2).every((c) => c.axis === 'x'), 'the two long edges (4 studs, along x) rank before the short ones');
  assert.ok(h.every((c) => c.restsOn > 0 && c.supports.includes('Body')));
  const back = h.find((c) => c.axis === 'x' && c.pivot[1] === -1 && c.pivot[2] === -1);
  assert.ok(back, 'the bottom edge on the -z side is a candidate');
  assert.deepEqual(back.world.pivot, [0, 1, -1.5]);
  assert.equal(back.positiveCarries, '-y', 'a positive angle about that edge swings the cover DOWN into the body');
  assert.equal(back.negativeCarries, '+y', 'so a negative angle lifts it');
  const front = h.find((c) => c.axis === 'x' && c.pivot[1] === -1 && c.pivot[2] === 1);
  assert.equal(front.positiveCarries, '+y', 'hinged on the +z edge the signs swap');
  assert.equal(back.edgeSide, '-z');
});

test('hingeCandidates: a leaf standing between two posts hinges on its vertical edges; a loose part gets its two ends', () => {
  const t = treeOf(leafModel().root);
  const a = A.analyse(t);
  const leaf = a.parts.find((p) => p.node.name === 'Leaf');
  const h = A.hingeCandidates(a, leaf);
  assert.ok(h.length > 0 && h.every((c) => c.supports.includes('Post')));
  assert.ok(h.filter((c) => c.axis === 'y').length >= 2, 'the vertical edges at its two sides rest against the posts');
  assert.ok(h[0].axis === 'y' && h[0].restsOn === 1, 'a full-height edge against a post ranks first');
  assert.ok(h[0].edgeSide === '+x' || h[0].edgeSide === '-x');

  const solo = A.analyse(treeOf(finalize(inst('Solo', 'Model', {}, [part('Bar', { at: [0, 5, 0], size: [8, 0.5, 1] })]), 'game.Workspace.Solo')));
  const loose = A.hingeCandidates(solo, solo.parts[0]);
  assert.equal(loose.length, 2, 'two ends');
  assert.ok(loose.every((c) => c.restsOn === 0 && c.axis === 'y' && Math.abs(c.pivot[0]) === 1), 'at the ends of the long side, turning about the thin axis');
});

test('report: an overview lists parts, interaction facts and movable hints; and states only what it measured', () => {
  const m = coverModel();
  m.cover.children.push(inst('Detector', 'ClickDetector'));
  m.knob.children.push(inst('Hum', 'Sound', { SoundId: { t: 'string', v: 'rbxassetid://5' } }));
  finalize(m.root, 'game.Workspace.Unit');
  const t = treeOf(m.root);
  const r = A.report(t, { parseSegments });
  assert.equal(r.partCount, 3);
  assert.equal(r.parts.length, 3);
  const cover = r.parts.find((p) => p.name === 'Cover');
  assert.equal(cover.clickable, true);
  assert.deepEqual(cover.size, [4, 0.4, 3]);
  assert.deepEqual(cover.at.length, 3);
  assert.equal(r.parts.find((p) => p.name === 'Knob').sounds[0], 'Hum');
  assert.deepEqual(r.interaction.clickable, ['game.Workspace.Unit.Cover']);
  assert.equal(r.contents.sounds.length, 1);
  assert.equal(r.contents.scripts.length, 0);
  assert.ok(r.movable.length >= 1 && r.movable[0].bestHinge.restsOn > 0);
  assert.ok(r.joints.some((j) => j.class === 'WeldConstraint'));
  assert.ok(!r.notes.some((n) => /nothing in this model runs/.test(n)), 'there is a Sound, so that note is not made');
});

test('report: a model with no scripts and no sounds says so, as a fact', () => {
  const t = treeOf(anonymousModel().root);
  const r = A.report(t, { parseSegments });
  assert.ok(r.notes.some((n) => /nothing in this model runs or makes a sound/.test(n)));
  assert.ok(r.notes.some((n) => /share a name with a sibling.*Part x2.*Name#2/.test(n)));
});

test('report: a focused part gives its detail and hinge candidates, and refuses a non-part', () => {
  const m = coverModel();
  const t = treeOf(m.root);
  const r = A.report(t, { parseSegments, focus: 'game.Workspace.Unit.Cover' });
  assert.equal(r.part.name, 'Cover');
  assert.ok(r.hinges.length >= 4);
  assert.match(r.hingeHelp, /positive angle carries/);
  assert.match(A.report(t, { parseSegments, focus: 'game.Workspace.Unit.Cover.Hold' }).error, /is a WeldConstraint, not a part/);
  assert.match(A.report(t, { parseSegments, focus: 'game.Workspace.Unit.Nope' }).error, /no child named Nope/);
});

test('report: a large model shows its biggest parts and says how many it left out', () => {
  const parts = Array.from({ length: 60 }, (_, i) => part(`P${i}`, { at: [i * 3, 0.5, 0], size: [1 + (i % 7), 1, 1] }));
  const t = treeOf(finalize(inst('Many', 'Model', {}, parts), 'game.Workspace.Many'));
  const r = A.report(t, { parseSegments, maxParts: 10 });
  assert.equal(r.parts.length, 10);
  assert.equal(r.partCount, 60);
  assert.match(r.omitted, /50 smaller parts/);
  assert.ok(r.parts.every((p, i, all) => i === 0 || p.i > all[i - 1].i), 'shown in model order');
});

test('report: a model with Motor6D joints warns that behaviours and rigs fight', () => {
  const a = part('Base', { at: [0, 0.5, 0], size: [4, 1, 4] });
  const b = part('Arm', { at: [3, 0.5, 0], size: [2, 1, 1] });
  a.children.push(joint('Arm', 'Motor6D', a, b));
  const t = treeOf(finalize(inst('Rigged', 'Model', {}, [a, b]), 'game.Workspace.Rigged'));
  assert.ok(A.report(t, { parseSegments }).notes.some((n) => /Motor6D.*animate_model/.test(n)));
});

test('an empty or unreadable answer is an error, never an empty report', () => {
  assert.match(A.parseTree({}).error, /no tree/);
  const t = treeOf(finalize(inst('Hollow', 'Model', {}, []), 'game.Workspace.Hollow'));
  assert.match(A.report(t, { parseSegments }).error, /contains no parts/);
});

test('modelAnatomy (the tool): reads the tree and the existing behaviours, and reports an unreadable place as such', async () => {
  const m = coverModel();
  const studio = fakeStudio(m.root);
  const r = await A.modelAnatomy(studio, { model: 'game.Workspace.Unit' });
  assert.equal(r.partCount, 3);
  assert.deepEqual(studio.ops.map((o) => o.op), ['get_tree']);
  assert.match((await A.modelAnatomy(studio, { model: 'game.ServerStorage.Unit' })).error, /game\.Workspace/);
  assert.match((await A.modelAnatomy(studio, { model: 'game.Workspace.Missing' })).error, /could not read/);
});
