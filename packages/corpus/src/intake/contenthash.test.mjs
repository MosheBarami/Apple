// Tests for the hash that decides what "identical" means.
//
// Everything downstream — the collapse, the weight, the near-duplicate stage —
// inherits whatever this module decides, so the properties SOURCE-INTELLIGENCE.md
// §2 relies on are pinned here by name rather than left to inspection:
//
//   - a CRLF checkout and an LF checkout are the same source
//   - file ordering cannot change the merkle root
//   - a renamed top-level directory cannot change the merkle root
//   - a fork that adds one file still shares every other file's hash
//
// And the one that looks like a failure and is not: a comment-only diff hashes
// DIFFERENTLY on purpose. That test exists so nobody "fixes" it.
//
// Run: node --test packages/corpus/src/intake/contenthash.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  contentHash,
  fileHashes,
  hashFile,
  merkleRoot,
  normaliseFile,
  normalisePath,
  repoPrefix,
} from './contenthash.mjs';

// A small but realistic Luau tree, with files at the root the way a real repo has them.
const REPO = {
  'README.md': '# Shop\n',
  'default.project.json': '{ "name": "shop" }\n',
  'src/Shop.luau': 'local Shop = {}\n\nfunction Shop.open()\nend\n\nreturn Shop\n',
  'src/ui/Panel.luau': 'local Panel = {}\nreturn Panel\n',
};

const withPrefix = (files, prefix) =>
  Object.fromEntries(Object.entries(files).map(([p, c]) => [`${prefix}/${p}`, c]));

test('normaliseFile collapses line endings, trailing whitespace and the final newline', () => {
  assert.equal(normaliseFile('a\r\nb\r\n'), 'a\nb\n');
  assert.equal(normaliseFile('a\rb\r'), 'a\nb\n');
  assert.equal(normaliseFile('a   \nb\t\n'), 'a\nb\n');
  assert.equal(normaliseFile('a\nb'), 'a\nb\n');
  assert.equal(normaliseFile('a\nb\n'), 'a\nb\n');
  assert.equal(normaliseFile(''), '');
  assert.equal(normaliseFile('\n'), '');
});

test('normaliseFile keeps indentation and blank lines — those are content, not formatting', () => {
  assert.notEqual(normaliseFile('  a\n'), normaliseFile('a\n'));
  assert.notEqual(normaliseFile('a\n\n'), normaliseFile('a\n'));
});

test('normaliseFile accepts bytes and a string interchangeably', () => {
  assert.equal(normaliseFile(Buffer.from('a\r\n', 'utf8')), normaliseFile('a\n'));
  assert.equal(normaliseFile(new Uint8Array([0x61, 0x0d, 0x0a])), 'a\n');
});

test('a CRLF checkout and an LF checkout produce the same content hash', () => {
  const crlf = Object.fromEntries(
    Object.entries(REPO).map(([p, c]) => [p, c.replace(/\n/g, '\r\n')]),
  );
  assert.equal(contentHash(crlf, { repo: 'shop' }), contentHash(REPO, { repo: 'shop' }));
});

test('a comment-only diff hashes DIFFERENTLY — deliberately; the near-duplicate stage denies it weight', () => {
  const commented = { ...REPO, 'src/Shop.luau': `-- opens the shop\n${REPO['src/Shop.luau']}` };
  assert.notEqual(contentHash(commented, { repo: 'shop' }), contentHash(REPO, { repo: 'shop' }));
});

test('file ordering does not change the merkle root', () => {
  const shuffled = Object.fromEntries(Object.entries(REPO).reverse());
  assert.equal(contentHash(shuffled, { repo: 'shop' }), contentHash(REPO, { repo: 'shop' }));

  // And directly at the merkle layer, where the sort actually lives.
  const hashes = fileHashes(REPO, { repo: 'shop' });
  const reversed = Object.fromEntries(Object.entries(hashes).reverse());
  assert.equal(merkleRoot(reversed), merkleRoot(hashes));
});

test('a renamed top-level directory does not change the merkle root', () => {
  const upstream = withPrefix(REPO, 'shop');
  const fork = withPrefix(REPO, 'shop-fork');
  assert.equal(contentHash(upstream, { repo: 'shop' }), contentHash(REPO, { repo: 'shop' }));
  assert.equal(contentHash(fork, { repo: 'shop-fork' }), contentHash(REPO, { repo: 'shop' }));

  // The GitHub archive convention too: <owner>-<repo>-<sha>/.
  const tarball = withPrefix(REPO, 'someone-shop-fork-a1b2c3d');
  assert.equal(contentHash(tarball, { repo: 'shop-fork' }), contentHash(REPO, { repo: 'shop' }));
});

test('repoPrefix refuses to strip a segment that is genuinely part of the layout', () => {
  // Every path shares `src/`, but the repo is not called src — not a wrapper.
  assert.equal(repoPrefix(['src/a.luau', 'src/b.luau'], 'rodux'), null);
  // The name appears deeper in the path. Stripping there would rewrite the layout.
  assert.equal(repoPrefix(['src/rodux/init.luau', 'src/rodux/Store.luau'], 'rodux'), null);
  // A file at the archive root proves there is no wrapper directory.
  assert.equal(repoPrefix(['rodux/init.luau', 'README.md'], 'rodux'), null);
  // The real thing.
  assert.equal(repoPrefix(['rodux/src/init.luau', 'rodux/README.md'], 'rodux'), 'rodux');
});

test('a repo-named directory that is real layout survives into the hashed paths', () => {
  const nested = { 'README.md': '# rodux\n', 'src/rodux/init.luau': 'return {}\n' };
  assert.deepEqual(Object.keys(fileHashes(nested, { repo: 'rodux' })).sort(), [
    'README.md',
    'src/rodux/init.luau',
  ]);
});

test('a fork that adds one file shares every other file hash', () => {
  const fork = { ...REPO, 'src/ui/Badge.luau': 'return {}\n' };
  const before = fileHashes(REPO, { repo: 'shop' });
  const after = fileHashes(fork, { repo: 'shop-fork' });

  for (const [path, hash] of Object.entries(before)) assert.equal(after[path], hash, path);
  assert.equal(Object.keys(after).length, Object.keys(before).length + 1);
  // ...and the root still moves, because the file list changed.
  assert.notEqual(merkleRoot(after), merkleRoot(before));
});

test('a file hash is content alone, so a moved file keeps its hash while the root moves', () => {
  assert.equal(hashFile('src/ui/Panel.luau', 'return {}\n'), hashFile('other/Panel.luau', 'return {}\n'));

  const moved = { 'README.md': REPO['README.md'], 'lib/Panel.luau': REPO['src/ui/Panel.luau'] };
  const original = { 'README.md': REPO['README.md'], 'src/ui/Panel.luau': REPO['src/ui/Panel.luau'] };
  assert.notEqual(merkleRoot(fileHashes(moved)), merkleRoot(fileHashes(original)));
});

test('.git metadata is not content', () => {
  const withGit = { ...REPO, '.git/HEAD': 'ref: refs/heads/main\n', '.git/config': '[core]\n' };
  assert.equal(contentHash(withGit, { repo: 'shop' }), contentHash(REPO, { repo: 'shop' }));
});

test('path spelling is normalised without changing layout', () => {
  assert.equal(normalisePath('./src//ui/Panel.luau'), 'src/ui/Panel.luau');
  assert.equal(normalisePath('src\\ui\\Panel.luau'), 'src/ui/Panel.luau');
  assert.equal(normalisePath('/src/ui/Panel.luau'), 'src/ui/Panel.luau');
});

test('two inputs that normalise onto one path fail loudly rather than silently dropping a file', () => {
  assert.throws(() => fileHashes({ './a.luau': 'x\n', 'a.luau': 'y\n' }), /same path/);
});

test('an empty tree has a stable root, and odd file counts are deterministic', () => {
  assert.equal(merkleRoot({}), merkleRoot({}));
  const odd = { a: '1', b: '2', c: '3' }; // exercises the promoted (not duplicated) odd node
  assert.equal(merkleRoot(odd), merkleRoot({ c: '3', a: '1', b: '2' }));
  assert.notEqual(merkleRoot(odd), merkleRoot({ a: '1', b: '2' }));
});
