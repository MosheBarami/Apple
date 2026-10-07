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

test('docs widgets go, wrappers keep their text, a tab keeps its label, entities decode', () => {
  assert.equal(clean('1. <Chip label="IMPORTANT" size="small" /> In the Explorer&nbsp;window.\n<Alert severity="info">Save first.</Alert>\n<Tabs><TabItem label="Windows">Press F5.</TabItem></Tabs>'),
    '1.  In the Explorer window.\nSave first.\nWindows:Press F5.');
});

test('a credential-shaped value, even a docs example, is never copied in', async () => {
  const { CREDENTIAL } = await import('../src/ingest-skills.mjs');
  assert.equal(CREDENTIAL.test(['https://hooks.slack.com', 'services', 'T0', 'B0', 'x'].join('/')), true);
  assert.equal(CREDENTIAL.test('Paste your webhook URL into the field.'), false);
});

test('a section that teaches with prose and Luau code is a recipe; a section with a numbered list is left to procedures', async () => {
  const { recipes } = await import('../src/ingest-skills.mjs');
  const md = `## Award a badge\n\nCall AwardBadge when the player wins.\n\n\`\`\`lua\n-- ## not a heading\nlocal BadgeService = game:GetService("BadgeService")\n\`\`\`\n\n## Steps\n\n1. One.\n2. Two.\n3. Three.\n\n\`\`\`lua\nprint(1)\n\`\`\`\n\n## Prose only\n\nNo code here.\n`;
  const r = recipes(md);
  assert.deepEqual(r.map((x) => x.heading), ['Award a badge']);
  assert.match(r[0].body, /Call AwardBadge[\s\S]*-- ## not a heading[\s\S]*BadgeService/);
  assert.equal(r[0].codeBlocks, 1);
});
