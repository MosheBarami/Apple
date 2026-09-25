import test from 'node:test';
import assert from 'node:assert/strict';
import { decorateVisionTools } from './collect.mjs';

test('the vision text uses the measured tool registry count, never its old hardcoded count', () => {
  const vision = { items: [{ id: 'agentTools', detail: '85 כלים פעילים. יכולות הבנייה פעילות.' }] };
  decorateVisionTools(vision, [{ id: 'tools', count: 95 }]);
  assert.match(vision.items[0].detail, /^95 כלים פעילים\./);
  assert.doesNotMatch(vision.items[0].detail, /85/);
});

test('an unreadable tool registry cannot leave a stale numeric claim', () => {
  const vision = { items: [{ id: 'agentTools', detail: '85 כלים פעילים. יכולות הבנייה פעילות.' }] };
  decorateVisionTools(vision, [{ id: 'tools', count: null }]);
  assert.match(vision.items[0].detail, /^מספר הכלים עדיין לא נמדד\./);
  assert.doesNotMatch(vision.items[0].detail, /85/);
});
