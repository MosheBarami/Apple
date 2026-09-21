import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = JSON.parse(readFileSync(join(ROOT, 'packages/corpus/data/style-visual-evidence.json'), 'utf8'));
const genres = JSON.parse(readFileSync(join(ROOT, 'packages/corpus/data/genre-references.json'), 'utf8'));
const world = readFileSync(join(ROOT, 'apps/worker/src/worldbuilding.ts'), 'utf8');
const designBrief = readFileSync(join(ROOT, 'apps/worker/src/design-brief.ts'), 'utf8');

const existing = new Map(genres.externalReferences.map((r) => [r.id, r]));
const supplemental = new Map(evidence.supplementalSources.map((r) => [r.id, r]));
const MINIMUM = evidence.policy.minimumExamplesPerStyle;

function worldKeys(name) {
  const start = world.indexOf('export const ' + name);
  assert.notEqual(start, -1, name + ' declaration disappeared');
  const tail = world.slice(start);
  const end = tail.indexOf('\n};');
  assert.notEqual(end, -1, name + ' declaration has no closing object');
  return [...tail.slice(0, end).matchAll(/^  ([A-Za-z][A-Za-z0-9]*): \\{/gm)].map((m) => m[1]);
}

test('every mapped style has at least five unique real reference examples', () => {
  assert.equal(evidence.policy.externalReferenceUse, 'reference_only');
  assert.equal(evidence.policy.copyPermissionDefault, false);
  const bad = [];
  for (const [style, ids] of Object.entries(evidence.styles)) {
    if (new Set(ids).size !== ids.length) bad.push(style + ': duplicate source id');
    if (ids.length < MINIMUM) bad.push(style + ': only ' + ids.length + ' examples');
    for (const id of ids) {
      const old = existing.get(id);
      const fresh = supplemental.get(id);
      if (!old && !fresh) {
        bad.push(style + ': unknown source ' + id);
        continue;
      }
      if (old) {
        if (old.inspection?.status !== 'visual_inspected') bad.push(style + '/' + id + ': not visually inspected');
        if (old.referenceUse !== 'reference_only' || old.licence?.copyPermission !== false) {
          bad.push(style + '/' + id + ': copying boundary missing');
        }
      } else {
        if (!(fresh.mediaCount >= 1)) bad.push(style + '/' + id + ': no concrete media');
        if (!(fresh.observation?.length >= 60)) bad.push(style + '/' + id + ': observation too vague');
        if (fresh.referenceOnly !== true || fresh.copyPermission !== false) {
          bad.push(style + '/' + id + ': copying boundary missing');
        }
        if (!fresh.url.startsWith('https://devforum.roblox.com/t/')) {
          bad.push(style + '/' + id + ': source is not a canonical DevForum topic');
        }
      }
    }
  }
  assert.deepEqual(bad, [], bad.join('\\n'));
});

test('every shipped genre plus pet simulator has a five-source evidence row', () => {
  for (const genre of genres.genres) {
    assert.ok(evidence.styles['genre:' + genre.id], 'missing visual evidence for genre:' + genre.id);
  }
  assert.ok(evidence.styles['genre:pet_simulator'], 'pet simulator construction knowledge lacks visual evidence');
});

test('every fixed world mood and palette has a five-source evidence row', () => {
  for (const id of worldKeys('MOODS')) {
    assert.ok(evidence.styles['mood:' + id], 'missing visual evidence for mood:' + id);
  }
  for (const id of worldKeys('PALETTES')) {
    assert.ok(evidence.styles['palette:' + id], 'missing visual evidence for palette:' + id);
  }
});

test('every style family selectable by designBrief has five-source evidence', () => {
  const families = [
    'tycoon', 'cartoon-simulator', 'incremental', 'pets-collection', 'studs-classic',
    'rpg', 'minimalist', 'mobile-first', 'controller-first', 'farming', 'obby',
  ];
  for (const family of families) {
    assert.ok(designBrief.includes("'" + family + "'"), family + ' is no longer selectable');
    assert.ok(evidence.styles['family:' + family], 'missing visual evidence for family:' + family);
  }
});

test('supplemental records are unique, dated, provenance-bound references', () => {
  assert.equal(new Set(evidence.supplementalSources.map((r) => r.id)).size, evidence.supplementalSources.length);
  assert.equal(new Set(evidence.supplementalSources.map((r) => r.url)).size, evidence.supplementalSources.length);
  for (const r of evidence.supplementalSources) {
    assert.match(r.publishedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(r.author.length > 0);
    assert.ok(r.mediaCount >= 1);
    assert.equal(r.referenceOnly, true);
    assert.equal(r.copyPermission, false);
  }
});
