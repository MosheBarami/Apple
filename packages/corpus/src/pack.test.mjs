/**
 * How sections are PACKED into chunks — the half of chunking that chunk.test.mjs does not reach.
 *
 * WHY A SECOND FILE. chunk.test.mjs covers how a page is CUT: blocks, fences, H2 boundaries,
 * frontmatter. It states its own reason for existing in its header — "a chunk that splits a code
 * fence in half retrieves as two fragments that each look like valid documentation and neither of
 * which runs" — but `packGuideChunks` is the one export it never calls, and packing is where that
 * split actually happens. Six exports were untouched; this file takes the one that decides what a
 * retrieved chunk finally contains.
 *
 * (Named for the angle rather than the module on purpose. Two of us independently created a file at
 * one path earlier today and one copy was overwritten.)
 *
 * WHAT WAS WRONG. `toBlocks` keeps a fenced code block whole, which is correct and is tested. The
 * packer then did `if (b.length > GUIDE_HARD_MAX * 2) b = b.slice(0, GUIDE_HARD_MAX * 2) + '\n…'`
 * — an arbitrary byte cut. Measured on a 400-line Luau sample: the opening ``` survived, the
 * closing ``` was truncated away, the cut landed mid-identifier (`local part14`, from `part147`),
 * and everything after it — the next section's breadcrumb and its prose — was swallowed INTO the
 * unterminated fence. One chunk, one fence marker, and it reads as a complete code sample.
 *
 * That is this repository's pattern in the corpus the model quotes from: a truncated, broken sample
 * renders as an intact one. The `…` sat inside the fence, where it is part of the program rather
 * than a notice that something was dropped.
 *
 * NOTE FOR WHOEVER DEPLOYS. Chunk boundaries are an input to the built corpus. Nothing changes in
 * D1 or Vectorize until the corpus is rebuilt and uploaded, which is not this lane.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { packGuideChunks, toBlocks } from './chunk.mjs';

/** Fence markers at the start of a line. An odd count means a fence was left open. */
const fenceMarks = (s) => s.match(/^(?:```|~~~)/gm) ?? [];
const balanced = (s) => fenceMarks(s).length % 2 === 0;

const luauSample = (n) => Array.from({ length: n }, (_, i) => `local part${i} = Instance.new("Part")`).join('\n');
const pageWithCode = (n) =>
  `Here is the sample:\n\n\`\`\`lua\n${luauSample(n)}\n\`\`\`\n\nThat is all.\n`;

test('a short page packs into one chunk that keeps its fence intact', () => {
  // The control. If packing ever stops emitting fences at all, every assertion below is vacuous.
  const chunks = packGuideChunks([{ heading: 'Parts', body: pageWithCode(3) }], 'Guide');
  assert.ok(chunks.length >= 1, 'a page with content must produce a chunk');
  const all = chunks.map((c) => c.text).join('\n');
  assert.ok(fenceMarks(all).length >= 2, 'the code fence must survive packing at all');
  assert.ok(all.includes('Instance.new("Part")'), 'and so must the code inside it');
});

test('AN OVERSIZED CODE FENCE IS NEVER LEFT OPEN', () => {
  // 400 lines is ~14,000 chars against a 2,600 hard max, so truncation is forced.
  const chunks = packGuideChunks([{ heading: 'Building a part', body: pageWithCode(400) }], 'Parts Guide');
  for (const [i, c] of chunks.entries()) {
    assert.ok(balanced(c.text),
      `chunk ${i} ends inside a code fence; a model quoting it gets prose as code and code that does not run`);
  }
});

test('truncation says it truncated, and says so OUTSIDE the fence', () => {
  const chunks = packGuideChunks([{ heading: 'Building a part', body: pageWithCode(400) }], 'Parts Guide');
  const truncated = chunks.filter((c) => /truncated/.test(c.text));
  assert.equal(truncated.length >= 1, true, 'a chunk that dropped content must say it dropped content');
  for (const c of truncated) {
    const marker = c.text.indexOf('[… truncated]');
    const before = c.text.slice(0, marker);
    assert.ok(balanced(before),
      'the notice must sit outside the code fence — inside, it reads as part of the program');
  }
});

test('a cut never lands mid-line, so the last line is never a half-token', () => {
  const chunks = packGuideChunks([{ heading: 'Building a part', body: pageWithCode(400) }], 'Parts Guide');
  const codeLines = chunks
    .flatMap((c) => c.text.split('\n'))
    .filter((l) => l.startsWith('local part'));
  // Without this the loop below is empty when the packer drops the block entirely, and an empty
  // loop asserts nothing — the test would go green for a packer that threw the code away.
  assert.ok(codeLines.length > 20, `only ${codeLines.length} code lines survived packing; the sample had 400`);
  for (const l of codeLines) {
    assert.match(l, /^local part\d+ = Instance\.new\("Part"\)$/,
      `"${l}" is a fragment of a line, which looks like valid Luau and is not`);
  }
});

test('the prose after an oversized fence is not swallowed by it', () => {
  const chunks = packGuideChunks([{ heading: 'Building a part', body: pageWithCode(400) }], 'Parts Guide');
  const withProse = chunks.find((c) => c.text.includes('That is all.'));
  if (!withProse) return; // the packer may drop it entirely; the fence tests cover that case
  const idx = withProse.text.indexOf('That is all.');
  assert.ok(balanced(withProse.text.slice(0, idx)),
    'trailing prose must not sit inside an unterminated code fence');
});

test('CONTROL: a page with no code is packed unchanged in substance', () => {
  // A packer that simply dropped every oversized block would pass all of the above.
  const body = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} explains something useful.`).join('\n\n');
  const chunks = packGuideChunks([{ heading: 'Prose', body }], 'Guide');
  const all = chunks.map((c) => c.text).join('\n');
  assert.ok(all.includes('Paragraph 0 explains'), 'the first paragraph must survive');
  assert.ok(all.includes('Paragraph 39 explains'), 'and so must the last — packing is not dropping');
  assert.ok(chunks.length >= 2, '40 paragraphs must span more than one chunk, or the sizes are wrong');
});

test('CONTROL: toBlocks still keeps a fence whole, which is what packing relies on', () => {
  const blocks = toBlocks(pageWithCode(5));
  const fenced = blocks.filter((b) => b.startsWith('```'));
  assert.equal(fenced.length, 1, 'the fence is one block');
  assert.ok(balanced(fenced[0]), 'and it arrives at the packer balanced');
});
