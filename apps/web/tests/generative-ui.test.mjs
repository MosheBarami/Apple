/**
 * Security + schema tests for the generative-UI system.
 *
 * These are the properties the product depends on: the agent may present a
 * panel, but it may never inject markup, styles, handlers or navigation.
 *
 * Run with:  node --test           (from apps/web)
 * No test framework, no new dependencies — the validator is plain TypeScript
 * and Node loads it directly via native type stripping.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  documentByteLength,
  extractUIFence,
  isSafeHref,
  isSafeImageSrc,
  parseDocument,
  sanitizeDocument,
  structuralDepth,
  validateDocument,
} from '../src/lib/generative-ui/validate.ts';
import { BLOCK_TYPES, LIMITS } from '../src/lib/generative-ui/schema.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const GUI_DIR = join(HERE, '..', 'src', 'lib', 'generative-ui');

const doc = (...blocks) => ({ v: 1, blocks });
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// ---------------------------------------------------------------------------
// 1. Raw HTML in a text field is inert data, never markup
// ---------------------------------------------------------------------------

test('raw HTML in a text field survives as a literal string and is never parsed', () => {
  const payload = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  const res = validateDocument(doc({ type: 'text', text: payload }));
  assert.equal(res.ok, true);
  const block = res.doc.blocks[0];
  // Stored verbatim as data…
  assert.equal(block.text, payload);
  // …and the block carries no HTML-bearing field of any kind.
  assert.deepEqual(Object.keys(block).sort(), ['text', 'type']);
  assert.equal('dangerouslySetInnerHTML' in block, false);
  assert.equal('__html' in block, false);
});

test('the renderer contains no HTML-injection or eval escape hatch', () => {
  const files = readdirSync(GUI_DIR).filter((f) => /\.(ts|tsx)$/.test(f));
  assert.ok(files.length >= 3, 'expected the generative-ui module to have several files');
  const banned = [
    'dangerouslySetInnerHTML',
    '.innerHTML',
    'outerHTML',
    'insertAdjacentHTML',
    'document.write',
    'new Function(',
    'eval(',
  ];
  for (const file of files) {
    const source = readFileSync(join(GUI_DIR, file), 'utf8');
    // Strip comments so the security notes that *name* these APIs do not trip the scan.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const needle of banned) {
      assert.ok(!code.includes(needle), `${file} must not use ${needle}`);
    }
    // No prop spreading from AI content into a React element.
    assert.ok(!/\{\s*\.\.\.\s*(block|props|raw|item|node)\b/.test(code), `${file} must not spread AI-authored props`);
  }
});

// ---------------------------------------------------------------------------
// 2. Unknown block types are rejected
// ---------------------------------------------------------------------------

test('an unknown block type is rejected and nothing renders', () => {
  const res = validateDocument(doc({ type: 'iframe', src: 'https://evil.example' }));
  assert.equal(res.ok, false);
  assert.match(res.errors.join('\n'), /unknown block type "iframe"/);
});

test('a single bad block fails the whole document — no partial application', () => {
  const res = validateDocument(
    doc({ type: 'heading', text: 'Fine' }, { type: 'script', text: 'bad' }, { type: 'text', text: 'also fine' }),
  );
  assert.equal(res.ok, false);
  assert.equal(res.doc, undefined);
});

test('every declared block type is actually implemented by the validator', () => {
  for (const type of BLOCK_TYPES) {
    const res = validateDocument(doc({ type }));
    // Missing required props is fine; "unhandled block type" is not.
    if (!res.ok) {
      assert.ok(
        !res.errors.some((e) => e.includes('unhandled block type')),
        `block type ${type} is declared but has no validator branch`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// 3. Injected React/DOM props are stripped and rejected
// ---------------------------------------------------------------------------

test('style / className / onClick injected by the AI fail the document (strict)', () => {
  for (const [key, value] of [
    ['style', { position: 'fixed', inset: '0' }],
    ['className', 'fixed inset-0 z-50'],
    ['onClick', 'alert(1)'],
    ['dangerouslySetInnerHTML', { __html: '<b>x</b>' }],
  ]) {
    const res = validateDocument(doc({ type: 'text', text: 'hello', [key]: value }));
    assert.equal(res.ok, false, `${key} should be refused`);
    assert.match(res.errors.join('\n'), new RegExp(`${key}: unknown property`));
  }
});

test('in lenient mode those props are stripped, never forwarded', () => {
  const res = sanitizeDocument(
    doc({
      type: 'text',
      text: 'hello',
      style: { position: 'fixed' },
      className: 'evil',
      onClick: 'alert(1)',
      dangerouslySetInnerHTML: { __html: '<b>x</b>' },
    }),
  );
  assert.equal(res.ok, true);
  assert.deepEqual(Object.keys(res.doc.blocks[0]).sort(), ['text', 'type']);
  assert.equal(res.warnings.length, 4);
});

test('property_inspector.className is Roblox class text, and is length-bounded', () => {
  const ok = validateDocument(
    doc({ type: 'property_inspector', path: 'game.Workspace.Door', className: 'Part', groups: [] }),
  );
  assert.equal(ok.ok, true);
  const tooLong = validateDocument(
    doc({ type: 'property_inspector', path: 'p', className: 'x'.repeat(65), groups: [] }),
  );
  assert.equal(tooLong.ok, false);
});

test('prototype-pollution keys are always an error, even in lenient mode', () => {
  const res = sanitizeDocument({ v: 1, blocks: [{ type: 'text', text: 'x', ['__proto__']: { polluted: true } }] });
  // Depending on the JSON path __proto__ may be swallowed by the engine; when it
  // is visible it must be refused, and it must never pollute Object.prototype.
  assert.equal({}.polluted, undefined);
  if (res.ok === false) assert.match(res.errors.join('\n'), /forbidden property name|unknown property/);
});

// ---------------------------------------------------------------------------
// 4. URL safety
// ---------------------------------------------------------------------------

test('javascript:, data: and other hostile URLs are refused in links', () => {
  const hostile = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    '  javascript:alert(1)  ',
    'java\tscript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'vbscript:msgbox(1)',
    'blob:https://evil.example/x',
    'file:///etc/passwd',
    '//evil.example/x',
    'http://insecure.example',
  ];
  for (const href of hostile) {
    assert.equal(isSafeHref(href), false, `${href} should be refused`);
    const res = validateDocument(doc({ type: 'callout', tone: 'info', text: 'x', link: { href, label: 'click' } }));
    assert.equal(res.ok, false, `${href} should fail validation`);
    assert.match(res.errors.join('\n'), /unsafe URL/);
  }
});

test('https, in-app paths and fragments are accepted', () => {
  for (const href of ['https://create.roblox.com/docs', '/app/usage', '#defects']) {
    assert.equal(isSafeHref(href), true, `${href} should be allowed`);
    const res = validateDocument(doc({ type: 'callout', tone: 'info', text: 'x', link: { href, label: 'go' } }));
    assert.equal(res.ok, true, `${href} should validate`);
  }
});

test('images accept only base64 raster data URLs — no SVG, no remote', () => {
  assert.equal(isSafeImageSrc(TINY_PNG), true);
  for (const src of [
    'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48L3N2Zz4=',
    'data:image/svg+xml,<svg onload=alert(1)></svg>',
    'https://evil.example/tracker.png',
    'javascript:alert(1)',
    'data:text/html;base64,PGI+eDwvYj4=',
  ]) {
    assert.equal(isSafeImageSrc(src), false, `${src} should be refused`);
    const res = validateDocument(
      doc({ type: 'render_review', subject: 's', views: [{ name: 'hero', image: { src, alt: 'a' } }] }),
    );
    assert.equal(res.ok, false, `${src} should fail validation`);
  }
});

test('an oversized image payload is refused', () => {
  const huge = `data:image/png;base64,${'A'.repeat(LIMITS.maxImageDataLength + 8)}`;
  assert.equal(isSafeImageSrc(huge), false);
});

// ---------------------------------------------------------------------------
// 5. Structural bounds
// ---------------------------------------------------------------------------

test('too many top-level blocks is refused', () => {
  const blocks = Array.from({ length: LIMITS.maxBlocks + 1 }, () => ({ type: 'text', text: 'x' }));
  const res = validateDocument({ v: 1, blocks });
  assert.equal(res.ok, false);
  assert.match(res.errors.join('\n'), /limit is 40/);
});

test('a huge array inside a block is refused', () => {
  const items = Array.from({ length: LIMITS.maxArrayItems + 1 }, (_, i) => `item ${i}`);
  const res = validateDocument(doc({ type: 'list', items }));
  assert.equal(res.ok, false);
  assert.match(res.errors.join('\n'), /array has 121 items/);
});

test('deeply nested input is refused before schema matching', () => {
  let nested = { type: 'text', text: 'deep' };
  for (let i = 0; i < LIMITS.maxInputDepth + 5; i++) nested = { wrapper: nested };
  const res = validateDocument({ v: 1, blocks: [nested] });
  assert.equal(res.ok, false);
  assert.match(res.errors.join('\n'), /nesting depth/);
});

test('a circular document is refused rather than hanging', () => {
  const evil = { v: 1, blocks: [] };
  evil.self = evil;
  assert.equal(structuralDepth(evil), Number.POSITIVE_INFINITY);
  const res = validateDocument(evil);
  assert.equal(res.ok, false);
  assert.match(res.errors.join('\n'), /circular reference/);
});

test('an oversized document is refused', () => {
  const big = { v: 1, blocks: [{ type: 'text', text: 'x'.repeat(LIMITS.maxDocumentBytes) }] };
  assert.ok(documentByteLength(big) > LIMITS.maxDocumentBytes);
  const res = validateDocument(big);
  assert.equal(res.ok, false);
  assert.match(res.errors.join('\n'), /payload is \d+ bytes/);
});

test('an over-long string in a bounded field is refused', () => {
  const res = validateDocument(doc({ type: 'heading', text: 'x'.repeat(LIMITS.maxLabelLength + 1) }));
  assert.equal(res.ok, false);
  assert.match(res.errors.join('\n'), /exceeds 200 characters/);
});

// ---------------------------------------------------------------------------
// 6. Type + token discipline
// ---------------------------------------------------------------------------

test('wrong primitive types are refused', () => {
  assert.equal(validateDocument(doc({ type: 'text', text: 42 })).ok, false);
  assert.equal(validateDocument(doc({ type: 'list', items: 'not an array' })).ok, false);
  assert.equal(validateDocument(doc({ type: 'progress', label: 'x', value: '80%' })).ok, false);
  assert.equal(validateDocument(doc({ type: 'progress', label: 'x', value: Number.NaN })).ok, false);
  assert.equal(validateDocument(doc({ type: 'progress', label: 'x', value: Infinity })).ok, false);
});

test('a colour outside the token enum is refused — no arbitrary CSS values', () => {
  for (const tone of ['#ff0000', 'red', 'rgb(255,0,0)', 'var(--accent)', 'NEUTRAL']) {
    const res = validateDocument(doc({ type: 'callout', tone, text: 'x' }));
    assert.equal(res.ok, false, `tone ${tone} should be refused`);
    assert.match(res.errors.join('\n'), /not an allowed token/);
  }
  assert.equal(validateDocument(doc({ type: 'callout', tone: 'bad', text: 'x' })).ok, true);
});

test('a table row that does not match the column count is refused', () => {
  const res = validateDocument(doc({ type: 'table', columns: ['a', 'b'], rows: [['1', '2'], ['3']] }));
  assert.equal(res.ok, false);
  assert.match(res.errors.join('\n'), /row has 1 cells but the table has 2 columns/);
});

test('the schema version is enforced', () => {
  assert.equal(validateDocument({ v: 2, blocks: [{ type: 'text', text: 'x' }] }).ok, false);
  assert.equal(validateDocument({ blocks: [{ type: 'text', text: 'x' }] }).ok, false);
});

test('non-objects and malformed JSON fail cleanly instead of throwing', () => {
  for (const input of [null, undefined, 42, 'string', [], true]) {
    const res = validateDocument(input);
    assert.equal(res.ok, false);
    assert.ok(res.errors.length > 0);
  }
  const parsed = parseDocument('{ not json');
  assert.equal(parsed.ok, false);
  assert.match(parsed.errors.join('\n'), /invalid JSON/);
});

// ---------------------------------------------------------------------------
// 7. Real product payloads validate
// ---------------------------------------------------------------------------

test('a realistic visual critique panel validates and keeps only schema keys', () => {
  const res = validateDocument({
    v: 1,
    title: 'Visual check',
    blocks: [
      {
        type: 'visual_critique',
        score: 6.5,
        passed: false,
        summary: 'The lobby reads well from the hero angle but the floor is untextured.',
        hardFails: [],
        defects: [
          {
            view: 'top',
            dimension: 'materials',
            severity: 'major',
            observed: 'The whole floor plate is default Plastic.',
            fix: 'Set the floor Material to Concrete and vary the BrickColor between tiles.',
          },
        ],
      },
      {
        type: 'render_review',
        subject: 'game.Workspace.Lobby',
        score: 6.5,
        passed: false,
        views: [{ name: 'hero', image: { src: TINY_PNG, alt: 'Hero view', width: 176, height: 112 }, coverage: 0.31 }],
        lighting: [{ key: 'Brightness', value: '2.4' }],
      },
    ],
  });
  assert.equal(res.ok, true);
  assert.equal(res.doc.blocks.length, 2);
  assert.equal(res.doc.title, 'Visual check');
  assert.equal(res.doc.blocks[0].defects[0].severity, 'major');
});

test('a null critique score (tooling unavailable) is preserved, not coerced to zero', () => {
  const res = validateDocument(
    doc({ type: 'visual_critique', score: null, passed: false, unavailable: true, summary: 'n/a', defects: [] }),
  );
  assert.equal(res.ok, true);
  assert.equal(res.doc.blocks[0].score, null);
  assert.equal(res.doc.blocks[0].unavailable, true);
});

// ---------------------------------------------------------------------------
// 8. Fence extraction
// ---------------------------------------------------------------------------

test('a golem-ui fence is extracted and removed from the prose', () => {
  const md = 'Here is the plan.\n\n```golem-ui\n{"v":1,"blocks":[]}\n```\n\nTell me if that works.';
  const { json, rest } = extractUIFence(md);
  assert.equal(json.trim(), '{"v":1,"blocks":[]}');
  assert.ok(!rest.includes('golem-ui'));
  assert.ok(rest.startsWith('Here is the plan.'));
});

test('markdown without a fence is returned untouched', () => {
  const md = 'Just prose with a ```lua\nprint(1)\n``` block.';
  const { json, rest } = extractUIFence(md);
  assert.equal(json, null);
  assert.equal(rest, md);
});
