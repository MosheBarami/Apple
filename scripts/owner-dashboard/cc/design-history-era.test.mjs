// The design-history page names its two eras truthfully: the first one is "the earlier version", not
// the product's current name (the rename codemod once turned its old name into "Apple", which made the
// eyebrow read "from Apple to Apple" and the era filter show two identical chips).
//   node --test scripts/owner-dashboard/cc/design-history-era.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

const page = (await import('../control/pages/design-history.js')).default;
const { ERA_LABEL } = await import('../control/pages/design-history.js');

const at = (d) => `${d}T10:00:00.000Z`;
const data = {
  ok: true, fetchedAt: at('2026-10-02'),
  era: {
    legacy: { from: at('2026-08-30'), to: at('2026-09-20'), firstCommit: { sha: 'a'.repeat(40), subject: 'first commit' } },
    apple: { from: at('2026-09-20'), commit: { sha: 'b'.repeat(40), subject: 'rename the product to apple' } },
  },
  progress: { scanned: 2, total: 2, complete: true },
  counts: { commits: 2, shots: 0, shotsDatedByGit: 0 },
  timeline: [
    { sha: 'c'.repeat(40), at: at('2026-09-01'), subject: 'early', author: 'x', agents: [], era: 'legacy', kinds: { style: 1 }, apps: ['web'], files: ['a.css'], more: 0, shots: [] },
    { sha: 'd'.repeat(40), at: at('2026-09-25'), subject: 'late', author: 'x', agents: [], era: 'apple', kinds: { style: 1 }, apps: ['web'], files: ['b.css'], more: 0, shots: [] },
  ],
  shots: [], decisions: [], docs: [],
};

test('the earlier era has its own label and it is not the product name', () => {
  assert.notEqual(ERA_LABEL.legacy, ERA_LABEL.apple);
  assert.equal(ERA_LABEL.legacy, 'הגרסה הקודמת');
  assert.equal(ERA_LABEL.apple, 'Apple');
});

test('the eyebrow does not read "from Apple to Apple"', () => {
  assert.equal(page.eyebrow, 'ריפו וידע · מהגרסה הקודמת ועד Apple');
  assert.doesNotMatch(page.eyebrow, /Apple.*Apple/);
});

test('rendered: the era bar and the era filter carry one Apple chip and one earlier-version chip', () => {
  const out = String(page.render(data));
  const bar = /<div class="dh-era-bar">([\s\S]*?)<\/div>\s*<dl/.exec(out)?.[1] ?? '';
  const bold = [...bar.matchAll(/<b>([^<]*)<\/b>/g)].map((m) => m[1]);
  assert.deepEqual(bold, ['הגרסה הקודמת', 'Apple']);
  const eraChips = /aria-label="תקופה">([\s\S]*?)<\/div>/.exec(out)?.[1] ?? '';
  const labels = [...eraChips.matchAll(/data-v="([^"]*)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2].trim()]);
  assert.deepEqual(labels, [['', 'הכול'], ['legacy', 'הגרסה הקודמת'], ['apple', 'Apple']]);
});

test('rendered: the old name appears nowhere on the page', () => {
  const out = String(page.render(data)) + page.eyebrow + page.sub;
  assert.doesNotMatch(out, /gol+em/i);
  assert.match(out, /כאן שם המוצר הוחלף ל-Apple/);
});
