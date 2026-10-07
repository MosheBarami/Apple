import { test } from 'node:test';
import assert from 'node:assert/strict';
import { procedures, clean } from '../src/ingest-skills.mjs';

const PAGE = `---
title: Deadly lava
---

## Set up

You need a place for the lava.

1. Insert a \`Part\`. Name it **LavaFloor**.
2. Resize it.

   ![](../a.jpg)

3. Insert a **Script** into it.

   \`\`\`lua
   local lava = script.Parent
   -- 1. not a step
   \`\`\`

Text after the list.

## Two steps only

1. One.
2. Two.
`;

test('a numbered list of three or more steps under a heading is one procedure, word for word', () => {
  const [p, ...rest] = procedures(PAGE);
  assert.equal(rest.length, 0);
  assert.equal(p.heading, 'Set up');
  assert.equal(p.anchor, 'set-up');
  assert.equal(p.intro, 'You need a place for the lava.');
  assert.equal(p.steps, 3);
  assert.match(p.body, /1\. Insert a `Part`\. Name it \*\*LavaFloor\*\*\./);
  assert.match(p.body, /local lava = script\.Parent\n {3}-- 1\. not a step/);
  assert.doesNotMatch(p.body, /a\.jpg|Text after/);
});

test('media embeds go, a relative link keeps its text, a web link stays', () => {
  assert.equal(clean('See [the guide](./x.md) and [docs](https://a.b).\n\n<img src="y.png" />\n\n<video controls>\n<source/>\n</video>\nEnd'), 'See the guide and [docs](https://a.b).\n\nEnd');
});
