/**
 * THE REPLY IS SHORT (owner decision D-UX-2, 2026-09-23; detail removed entirely by D-THINK-1, 2026-09-24).
 *
 * Apple is for young creators who are not technical. Plan checklists, property and instance cards
 * ("game.Lighting · FogStart 5000 → 100000"), diff tables and raw tool names were drawn inline in the
 * reply. They are not any more: the reply keeps the words and any image or sound Apple made, and
 * everything else was under Details inside the Thinking disclosure, which D-THINK-1 removed: it is not drawn.
 *
 * Held three ways: the split itself (lib/reply-docs.ts) on real documents; a whole assistant Turn
 * rendered with react-dom/server, checked for what a browser receives; and the one path the renderer
 * could take back into the reply, read from the source.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WEB, bundle, decomment, renderWith, text } from './ui-bundle.mjs';

const ui = await bundle(`
  export { createElement as h } from 'react';
  export { renderToStaticMarkup } from 'react-dom/server';
  export { splitReplyDocs, isGeneratedMedia } from './src/lib/reply-docs';
  export { Turn } from './src/components/ws/turn';
`, { name: 'reply-short', resolveDir: WEB });

const IMAGE_SRC = '/api/projects/p-1/images/0f8fad5b-d9cb-469f-a165-70867728950e';
const SOUND_HREF = '/api/projects/p-1/audio/7c9e6679-7425-40de-944b-e07fc1f90ae7';
const PROPERTIES = { type: 'property_inspector', path: 'game.Lighting', className: 'Lighting', groups: [{ name: 'Attributes', rows: [{ name: 'FogStart', value: '100000', previous: '5000', changed: true }] }] };
const PLAN = { type: 'build_plan', title: 'Plan', steps: [{ title: 'Add a lamp', status: 'pending', tool: 'create_instances' }] };
const TABLE = { type: 'table', columns: ['Part', 'Size'], rows: [['Lamp', '2']] };
const GENERATED_IMAGE = { type: 'asset_picker', assets: [{ id: 'img-1', name: 'Sunset sky', kind: 'image', thumbnail: { src: IMAGE_SRC, alt: 'Sunset sky' } }] };
const GENERATED_SOUND = { type: 'asset_picker', assets: [{ id: 'snd-1', name: 'Coin', kind: 'sound', link: { href: SOUND_HREF, label: 'Listen' } }] };
const CATALOGUE_ASSETS = { type: 'asset_picker', assets: [{ id: '123456', name: 'Street lamp', kind: 'model', link: { href: 'https://create.roblox.com/store/asset/123456', label: 'Open' } }] };
const RENDER = { type: 'render_review', subject: 'Lamp', views: [] };
const doc = (...blocks) => ({ v: 1, blocks });

test('the split: what the person asked to see stays, every other document goes to Details', () => {
  const { media, details } = ui.splitReplyDocs([
    doc(PROPERTIES), doc(PLAN), doc(TABLE), doc(GENERATED_IMAGE), doc(GENERATED_SOUND), doc(CATALOGUE_ASSETS), doc(RENDER),
  ]);
  assert.deepEqual(media.flatMap((d) => d.blocks.map((b) => b.type)), ['asset_picker', 'asset_picker']);
  assert.deepEqual(media.flatMap((d) => d.blocks.map((b) => b.assets[0].id)), ['img-1', 'snd-1']);
  assert.deepEqual(details.flatMap((d) => d.blocks.map((b) => b.type)), ['property_inspector', 'build_plan', 'table', 'asset_picker']);
  assert.equal(details.at(-1).blocks[0].assets[0].id, '123456', 'a catalogue search is detail, not something Apple made');
  // A render review was never drawn in the conversation and is not moved into it now.
  assert.equal([...media, ...details].some((d) => d.blocks.some((b) => b.type === 'render_review')), false);
});

test('"generated" is decided by the file it points at, never by what the block calls itself', () => {
  assert.equal(ui.isGeneratedMedia(GENERATED_IMAGE), true);
  assert.equal(ui.isGeneratedMedia({ ...GENERATED_IMAGE, assets: [{ ...GENERATED_IMAGE.assets[0], thumbnail: { src: 'https://evil.example/x.png', alt: 'x' } }] }), false);
  assert.equal(ui.isGeneratedMedia({ type: 'asset_picker', assets: [] }), false, 'an empty picker shows nothing, so it is not media');
  assert.equal(ui.isGeneratedMedia({ type: 'asset_picker', assets: [GENERATED_IMAGE.assets[0], CATALOGUE_ASSETS.assets[0]] }), false,
    'one catalogue asset makes the whole block detail');
  // And one document holding both is split, not thrown to one side whole.
  const { media, details } = ui.splitReplyDocs([doc(PROPERTIES, GENERATED_IMAGE)]);
  assert.equal(media.length, 1);
  assert.equal(details.length, 1);
});

test('a whole settled reply, rendered: the words and the picture, no property card, no plan, no tool name', async () => {
  const item = {
    id: 'm-1',
    role: 'assistant',
    content: 'Made the fog start much farther away.',
    tools: [
      { toolId: 't-1', tool: 'set_properties', summary: 'Changed Lighting', ok: true, done: true, startedAt: 1_700_000_000_000, durationMs: 400, startObserved: true, detail: doc(PROPERTIES) },
      { toolId: 't-2', tool: 'propose_plan', summary: 'Planned', ok: true, done: true, startedAt: 1_700_000_000_500, durationMs: 100, startObserved: true, detail: doc(PLAN) },
      { toolId: 't-3', tool: 'generate_image', summary: 'Made an image', ok: true, done: true, startedAt: 1_700_000_000_700, durationMs: 100, startObserved: true, detail: doc(GENERATED_IMAGE) },
    ],
    streaming: false,
    createdAt: 1_700_000_000_000,
    endedAt: 1_700_000_001_000,
    stopReason: 'done',
  };
  // TWICE. The renderer is lazily loaded, and a first server render shows its fallback; rendering
  // again once the chunk has resolved shows what a browser shows a moment later. Asserting on the
  // first render alone would pass whatever the reply drew through the renderer.
  const turn = () => renderWith(ui.renderToStaticMarkup, ui.h(ui.Turn, { item, status: null, isLast: true }));
  turn();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const html = turn();
  assert.match(html, /aria-label="Generated image"/, 'the picture Apple made is in the reply — the renderer really ran');
  const shown = text(html);
  assert.match(shown, /Made the fog start much farther away\./, 'the reply itself is there');
  assert.doesNotMatch(html, /gu-panel|gu-plan|gu-steps|gx-inline-results/, 'a generative-UI card reached the reply');
  assert.doesNotMatch(shown, /FogStart|game\.Lighting|ATTRIBUTES|Add a lamp/i, 'detail was drawn in the conversation');
  assert.doesNotMatch(shown, /set_properties|propose_plan|create_instances/, 'a raw tool name reached the page');
});

//[[ RESTATED 2026-09-24 (owner decision D-THINK-1, which overrides D-UX-2's "detail one click away").
//   This held two render sites: media in the reply, and the rest under Details in the Thinking
//   disclosure. The owner asked that there be no way at all to see technical detail, so the
//   disclosure is gone and the renderer has ONE way into the conversation: the media in the reply. ]]
test('the renderer has exactly one way into the conversation: generated media in the reply', () => {
  const turn = decomment(readFileSync(join(WEB, 'src', 'components', 'ws', 'turn.tsx'), 'utf8'));
  assert.doesNotMatch(turn, /InlineResults/);
  assert.equal((turn.match(/<GenerativeUI\b/g) ?? []).length, 1, 'one render site in the turn');
  const media = turn.slice(turn.indexOf('function ReplyMedia'), turn.indexOf('function Stamp'));
  assert.match(media, /<GenerativeUI\b/, 'and it is ReplyMedia');
  assert.match(turn, /<ReplyMedia docs=\{replyDocs\.media\} \/>/);
  assert.doesNotMatch(turn, /replyDocs\.details/, 'the detail documents are handed to something that could draw them');
  const thinking = decomment(readFileSync(join(WEB, 'src', 'components', 'ws', 'thinking.tsx'), 'utf8'));
  assert.doesNotMatch(thinking, /GenerativeUI|Collapsible/, 'the thinking surface draws documents, or can be opened');
});

test('a plan step shows what it does in words, never its wire name', () => {
  const render = decomment(readFileSync(join(WEB, 'src', 'lib', 'generative-ui', 'render.tsx'), 'utf8'));
  const plan = render.slice(render.indexOf('function BuildPlanView'), render.indexOf('function BuildPlanView') + 2000);
  assert.doesNotMatch(plan, /\{step\.tool\}/);
  assert.match(plan, /labelForTool\(step\.tool\)/);
});

test('a wire-only assistant reply renders no payload or text sharing controls', () => {
  const wire = '{"t":"Vector3","v":[4,1,4]}';
  const item = {
    id: 'wire-only', role: 'assistant', content: wire, tools: [], streaming: false,
    createdAt: 1_700_000_000_000, stopReason: 'done',
  };
  const html = renderWith(ui.renderToStaticMarkup, ui.h(ui.Turn, { item, status: null, isLast: true }));
  assert.doesNotMatch(text(html), /Vector3|\[4,1,4\]/, 'wire text reached the customer');
  assert.doesNotMatch(html, /Copy this reply|Share this reply|More options for this reply/, 'an empty visible reply still offers raw text actions');
  assert.match(text(html), /ended this turn without a reply/, 'the filtered reply should leave a useful explanation');
});

test('all assistant text sharing paths use the filtered reply', () => {
  const turn = decomment(readFileSync(join(WEB, 'src', 'components', 'ws', 'turn.tsx'), 'utf8'));
  const replyActions = turn.slice(turn.indexOf('<MessageToolbar'), turn.indexOf('className="gx-turn__foot"'));
  assert.ok(replyActions.length > 100, 'reply action section was not found');
  assert.doesNotMatch(replyActions, /\b(?:item\.content|parsed\.rest)\b/, 'a reply text action can read raw content');
  assert.match(replyActions, /<CopyButton\b/);
  assert.match(replyActions, /<ShareButton\b/);
  assert.match(replyActions, /label: 'Copy text'/, 'the context menu copy path is in this check');
});
