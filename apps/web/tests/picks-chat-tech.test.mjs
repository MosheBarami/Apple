/**
 * THE CHAT-TECH PICKS ARE IN THE PRODUCT, NOT BESIDE IT.
 *
 * The owner ticked these components in the picker. Each one is claimed to live somewhere a person
 * can open: the Files drawer, Studio activity, the Playtest card, the members panel's share links,
 * and the roadmap (its Map view and the suggestions' comparison). Reading the source, this suite
 * checks three links per pick — the component module exists, the product file imports it, and the
 * product file renders it — plus that each product file is itself mounted by the app. Removing any
 * one mount makes it fail.
 *
 * Then the pure models the picks draw from are run on real inputs, so a mount that renders nothing
 * useful is caught as well.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
/** Comments stripped, so a mount mentioned in prose does not count as a mount. */
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

/**
 * pick id → where it is mounted: [product file, module it imports, JSX tag(s) it renders].
 * `module` is matched as the import specifier's tail.
 */
const MOUNTS = [
  ['ae-file-tree', 'components/ws/files-panel.tsx', 'ai-elements/file-tree', ['FileTree', 'FileTreeRow']],
  ['ui-layouts--tree-code-viewer', 'components/ws/files-panel.tsx', 'picks/tech/code-viewer', ['CodeViewer']],
  ['eldora--github-inline-comments', 'components/picks/tech/code-viewer.tsx', './line-thread', ['LineThread']],
  ['eldora--github-inline-comments', 'components/picks/tech/version-diff.tsx', './line-thread', ['LineThread']],
  ['eldora--github-inline-comments', 'components/ws/files-panel.tsx', 'picks/tech/version-diff', ['VersionDiff']],
  ['ae-artifact', 'components/ws/files-panel.tsx', 'ai-elements/artifact', ['Artifact', 'ArtifactHeader']],
  ['ae-snippet', 'components/ws/files-panel.tsx', 'ai-elements/snippet', ['Snippet', 'SnippetCopyButton']],
  ['ae-commit', 'components/ws/files-panel.tsx', 'ai-elements/commit', ['Commit', 'CommitHash']],
  ['ae-package-info', 'components/picks/tech/version-diff.tsx', 'ai-elements/package-info', ['PackageInfo', 'PackageInfoChangeType']],
  ['ae-schema-display', 'components/ws/files-panel.tsx', 'ai-elements/schema-display', ['SchemaDisplay']],
  ['ae-jsx-preview', 'components/ws/files-panel.tsx', 'ai-elements/jsx-preview', ['JSXPreview', 'JSXPreviewContent']],
  ['ae-terminal', 'components/ws/studio-activity.tsx', 'ai-elements/terminal', ['Terminal']],
  ['ae-stack-trace', 'components/ws/studio-activity.tsx', 'ai-elements/stack-trace', ['StackTrace']],
  ['ae-web-preview', 'components/ws/playtest-card.tsx', 'ai-elements/web-preview', ['WebPreview', 'WebPreviewNavigation', 'WebPreviewNavigationButton', 'WebPreviewUrl', 'WebPreviewBody']],
  ['ae-sandbox', 'components/ws/playtest-card.tsx', 'ai-elements/sandbox', ['Sandbox', 'SandboxHeader', 'SandboxTabsTrigger', 'SandboxTabContent']],
  ['ae-test-results', 'components/ws/playtest-card.tsx', 'ai-elements/test-results', ['TestResults', 'TestResultsProgress', 'Test']],
  ['ae-environment-variables', 'components/ws/members-panel.tsx', 'ai-elements/environment-variables', ['EnvironmentVariables', 'EnvironmentVariable', 'EnvironmentVariableValue', 'EnvironmentVariableCopyButton']],
  ['ae-canvas', 'components/roadmap/dependency-map.tsx', 'ai-elements/canvas', ['Canvas']],
  ['ae-node', 'components/roadmap/dependency-map.tsx', 'ai-elements/node', ['Node', 'NodeTitle']],
  ['ae-edge', 'components/roadmap/dependency-map.tsx', 'ai-elements/edge', ['Edge.Animated', 'Edge.Temporary', 'Edge.Solid']],
  ['ae-panel', 'components/roadmap/dependency-map.tsx', 'ai-elements/panel', ['Panel']],
  ['ae-controls', 'components/roadmap/dependency-map.tsx', 'ai-elements/controls', ['Controls']],
  ['ae-connection', 'components/roadmap/dependency-map.tsx', 'ai-elements/connection', ['Connection']],
  ['aicss-comparison-table', 'components/roadmap/suggestions.tsx', 'picks/tech/compare-table', ['CompareTable']],
];

/** Each product file above, and the file that mounts it in the app. */
const SURFACES = [
  ['components/ws/files-panel.tsx', 'routes/workspace.tsx', 'FilesPanel'],
  ['components/ws/studio-activity.tsx', 'routes/workspace.tsx', 'StudioActivity'],
  ['components/ws/members-panel.tsx', 'routes/workspace.tsx', 'MembersPanel'],
  //[[ RESTATED 2026-09-24 (D-THINK-1): PlaytestCard was drawn inside the Thinking disclosure, which the
  //   owner removed; a playtest is now the status line's words. tests/thinking-redesign.test.mjs holds
  //   that it stays out of the thinking surface. ]]
  ['components/roadmap/dependency-map.tsx', 'routes/roadmap.tsx', 'DependencyMap'],
  ['components/roadmap/suggestions.tsx', 'routes/roadmap.tsx', 'SuggestionPanel'],
  ['components/picks/tech/version-diff.tsx', 'components/ws/files-panel.tsx', 'VersionDiff'],
  ['components/picks/tech/code-viewer.tsx', 'components/ws/files-panel.tsx', 'CodeViewer'],
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

for (const [id, file, mod, tags] of MOUNTS) {
  test(`${id} is imported and rendered in ${file}`, () => {
    const base = mod.startsWith('./') ? join(dirname(join(SRC, file)), mod) : join(SRC, 'components', mod);
    assert.ok(existsSync(`${base}.tsx`), `${mod}.tsx does not exist`);
    const src = code(file);
    assert.match(src, new RegExp(`from '[^']*${esc(mod.replace(/^\.\//, ''))}'`), `${file} does not import ${mod}`);
    for (const tag of tags) {
      assert.match(src, new RegExp(`<${esc(tag)}[\\s>/]`), `${file} does not render <${tag}>`);
    }
  });
}

for (const [file, host, name] of SURFACES) {
  test(`${file} is mounted by ${host}`, () => {
    assert.match(code(host), new RegExp(`<${name}[\\s>/]`), `${host} does not render <${name}>`);
  });
}

test('the roadmap route really mounts itself in the app', () => {
  assert.match(code('app.tsx'), /import\('\.\/routes\/roadmap'\)/);
  assert.match(code('app.tsx'), /<RoadmapPage\s*\/>/);
});

test('the roadmap map is reachable: a List/Map switch that renders DependencyMap', () => {
  const src = code('routes/roadmap.tsx');
  assert.match(src, /aria-pressed=\{view === 'map'\}/);
  assert.match(src, /view === 'map' \? \(\s*<DependencyMap/);
});

test('the playtest results only appear for a playtest that ended', () => {
  const src = code('components/ws/playtest-card.tsx');
  assert.match(src, /\{terminal && run && checks\.length > 0 && \(/);
});

test('a share link row is handed only the preview, never the token itself', () => {
  const src = code('components/ws/members-panel.tsx');
  assert.match(src, /<EnvironmentVariableValue preview=\{tokenPreview\(l\.token\)\} \/>/);
  assert.doesNotMatch(src, /<EnvironmentVariableValue[^>]*\{l\.token\}/);
});

// ------------------------------------------------------------- the models ---

const { buildRoadmapMap, initialSelection, NODE_W } = await import('../src/components/roadmap/map-model.ts');
const { playtestChecks, playtestSummary } = await import('../src/components/picks/tech/playtest-checks.ts');
const { diffLines, changeWords } = await import('../src/components/picks/tech/diff-model.ts');
const { parseLuauTrace } = await import('../src/components/picks/tech/luau-trace.ts');
const { jsonShape } = await import('../src/components/picks/tech/json-shape.ts');

const placed = (id, readiness, deps = [], unlocks = []) => ({
  milestone: { id, title: id.toUpperCase(), why: '', status: readiness === 'landed' ? 'done' : 'future' },
  readiness,
  dependencies: deps.map((d) => ({ id: d, title: d, status: 'done' })),
  waitingOn: [],
  unlocks: unlocks.map((u) => ({ id: u, title: u, status: 'future' })),
});

test('the map draws one column per stage and one line per declared prerequisite', () => {
  const stages = [
    { depth: 0, milestones: [placed('a', 'landed', [], ['b', 'c'])] },
    { depth: 1, milestones: [placed('b', 'in-progress', ['a']), placed('c', 'waiting', ['a', 'ghost'])] },
  ];
  const map = buildRoadmapMap(stages);
  assert.equal(map.nodes.length, 3);
  assert.ok(map.nodes.find((n) => n.id === 'b').x > map.nodes.find((n) => n.id === 'a').x + NODE_W, 'stage 2 is right of stage 1');
  // `ghost` is not a milestone: no line is drawn to nowhere.
  assert.deepEqual(map.edges.map((e) => `${e.id}:${e.kind}`).sort(), ['a->b:active', 'a->c:landed']);
  assert.ok(map.width > 0 && map.height > 0);
  assert.equal(initialSelection(map, 'b'), 'b');
  assert.equal(initialSelection(map, null), 'b', 'with no current milestone, the first one not landed');
  assert.deepEqual(buildRoadmapMap([]), { nodes: [], edges: [], width: 0, height: 0 });
});

test('playtest checks exist only for an ended playtest and state measured counts', () => {
  const base = { id: 'r', startedAt: 1_000, requestedSeconds: 8, consoleErrors: 0, consoleWarnings: 0, framesDelivered: 4, framesDropped: 0 };
  assert.deepEqual(playtestChecks({ ...base, phase: 'running' }), []);
  const checks = playtestChecks({ ...base, phase: 'finished', endedAt: 9_000, consoleErrors: 2, framesDropped: 1 });
  const by = Object.fromEntries(checks.map((c) => [c.id, c]));
  assert.equal(by.errors.status, 'failed');
  assert.equal(by.errors.note, '2 errors');
  assert.equal(by.frames.status, 'skipped');
  const summary = playtestSummary({ ...base, phase: 'finished', endedAt: 9_000 }, checks);
  assert.equal(summary.durationMs, 8_000);
  assert.equal(summary.failed, 1);
});

test('the version diff counts real line changes', () => {
  const diff = diffLines('a\nb\nc', 'a\nB\nc\nd');
  assert.ok(diff, 'a small diff is drawn');
  assert.equal(changeWords(diff), '2 lines added, 1 removed');
});

test('a Luau error becomes a message with its script and line', () => {
  const t = parseLuauTrace("ServerScriptService.CoinService:14: attempt to index nil with 'Value'");
  assert.equal(t.frames[0].source, 'ServerScriptService.CoinService');
  assert.equal(t.frames[0].line, 14);
  assert.match(t.message, /attempt to index nil/);
});

test('a JSON file yields a data shape; text that is not JSON yields none', () => {
  assert.ok(jsonShape('{"coins": 5, "items": ["a"]}'));
  assert.equal(jsonShape('not json'), null);
});
