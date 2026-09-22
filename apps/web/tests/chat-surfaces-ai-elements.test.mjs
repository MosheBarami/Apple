/**
 * THE CHAT, THINKING AND WORKSPACE SURFACES ARE BUILT FROM AI ELEMENTS, NOT AICSS.
 *
 * Owner requirement (2026-09-22): the authenticated app's chat and thinking UI is built from the
 * official Vercel AI Elements components. AICSS may remain only where nothing in AI Elements does
 * the job — the admin data table and the usage comparison table.
 *
 *   1. No file under components/ws/, routes/workspace.tsx or lib/generative-ui/ imports AICSS. The
 *      files are found by walking the directories, and the import reader proves it can see an AICSS
 *      import by finding the two that are allowed.
 *   2. A generative-UI `code_diff` renders as an AI Elements CodeBlock in shiki's `diff` language,
 *      with added and removed lines told apart by sigil, class and a tint in both themes.
 *   3. The credits drawer's source credits are AI Elements Sources: open by default, because each
 *      one is an obligation that ships with the game.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { WEB, bundle, count, decomment, element, renderWith, text } from './ui-bundle.mjs';

const SRC = join(WEB, 'src');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(?:ts|tsx)$/.test(entry)) out.push(path);
  }
  return out;
}

/** Every module specifier a file imports — named, bare (`import 'x'`) and dynamic — comments stripped. */
function specifiers(path) {
  const code = decomment(readFileSync(path, 'utf8'));
  return [
    ...[...code.matchAll(/\b(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
    ...[...code.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
    ...[...code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]),
  ];
}
const isAicss = (spec) => /(?:^|\/)aicss(?:\/|$)/.test(spec);

// ------------------------------------------------------------------ 1. AICSS ---

test('no chat, thinking or workspace file imports an AICSS component', () => {
  const files = [
    ...walk(join(SRC, 'components', 'ws')),
    join(SRC, 'routes', 'workspace.tsx'),
    ...walk(join(SRC, 'lib', 'generative-ui')),
  ];
  // 37 files on 2026-09-22; the floor is well under that, so it only fires when the walk goes blind.
  assert.ok(files.length >= 25, `only ${files.length} file(s) under the chat surfaces — the walk is not reading`);
  const offenders = files.flatMap((file) => specifiers(file).filter(isAicss).map((spec) => `${relative(SRC, file)} imports ${spec}`));
  assert.deepEqual(offenders, []);

  // The reader is not blind: it sees the two AICSS imports that remain, where they are allowed.
  const allowed = ['routes/admin.tsx', 'routes/usage.tsx'].flatMap((rel) => specifiers(join(SRC, rel)).filter(isAicss));
  assert.equal(allowed.length, 2, `expected the admin and usage AICSS imports, found ${allowed}`);
});

test('AICSS remains only for the admin data table and the usage comparison table', () => {
  const users = walk(SRC)
    .filter((file) => !relative(SRC, file).startsWith(join('components', 'aicss')))
    .filter((file) => specifiers(file).some(isAicss))
    .map((file) => relative(SRC, file))
    .sort();
  assert.deepEqual(users, ['routes/admin.tsx', 'routes/usage.tsx']);
});

// ---------------------------------------------------------------- 2. diffs ---

const ui = await bundle(`
  export { createElement as h } from 'react';
  export { renderToStaticMarkup } from 'react-dom/server';
  export { GenerativeUIPanel, unifiedDiff } from './src/lib/generative-ui/render';
  export { CreditsPanel } from './src/components/ws/credits-panel';
  export { QueryClient, QueryClientProvider } from '@tanstack/react-query';
`, { name: 'chat-surfaces', resolveDir: WEB });
const render = (element) => renderWith(ui.renderToStaticMarkup, element);

const DIFF = {
  type: 'code_diff',
  path: 'ServerScriptService/LobbyLighting',
  language: 'luau',
  summary: 'Warmed the key light.',
  hunks: [
    {
      header: '@@ -12,3 +12,4 @@',
      lines: [
        { kind: 'ctx', text: 'local Lighting = game:GetService("Lighting")' },
        { kind: 'del', text: 'Lighting.Ambient = Color3.fromRGB(90, 90, 90)' },
        { kind: 'add', text: 'Lighting.Ambient = Color3.fromRGB(58, 52, 44)' },
        { kind: 'add', text: 'Lighting.OutdoorAmbient = Color3.fromRGB(70, 62, 52)' },
      ],
    },
    { lines: [{ kind: 'ctx', text: 'Lighting.Brightness = 2' }, { kind: 'del', text: '-- old note' }] },
  ],
};

test('the unified diff keeps every line, marks each by its sigil, and separates hunks honestly', () => {
  const diff = ui.unifiedDiff(DIFF);
  assert.deepEqual(diff.split('\n'), [
    '@@ -12,3 +12,4 @@',
    ' local Lighting = game:GetService("Lighting")',
    '-Lighting.Ambient = Color3.fromRGB(90, 90, 90)',
    '+Lighting.Ambient = Color3.fromRGB(58, 52, 44)',
    '+Lighting.OutdoorAmbient = Color3.fromRGB(70, 62, 52)',
    '@@',
    ' Lighting.Brightness = 2',
    '--- old note',
  ]);
  assert.deepEqual(ui.unifiedDiff({ ...DIFF, hunks: [{ lines: [{ kind: 'add', text: 'a\nb' }] }] }).split('\n'), ['+a', '+b'],
    'a line with a newline in it must not lose its sigil on the second half');
});

test('a code_diff renders as an AI Elements CodeBlock in the diff language', () => {
  const html = render(ui.h(ui.GenerativeUIPanel, { input: { v: 1, blocks: [DIFF] } }));
  const block = element(html, /<div[^>]*class="[^"]*\bai-code-block\b/);
  assert.ok(block, 'the diff is not an AI Elements CodeBlock');
  assert.match(block, /data-language="diff"/);
  assert.doesNotMatch(html, /aicss|FileDiff/i);
  assert.match(text(element(block, /<div[^>]*ai-code-block__header/)), /ServerScriptService\/LobbyLighting\+2-2/);
  assert.equal(count(block, '<button'), 1, 'one copy control');
  assert.match(block, /aria-label="Copy diff"/);

  const lines = [...block.matchAll(/<span class="block ai-code-block__line">([\s\S]*?)<\/span><\/span>|<span class="block ai-code-block__line">\n<\/span>/g)];
  const byKind = (kind) => [...block.matchAll(new RegExp(`tok tok--${kind}"[^>]*>([^<]*)<`, 'g'))].map((m) => text(m[1]));
  assert.deepEqual(byKind('del'), ['-Lighting.Ambient = Color3.fromRGB(90, 90, 90)', '--- old note']);
  assert.deepEqual(byKind('ins'), ['+Lighting.Ambient = Color3.fromRGB(58, 52, 44)', '+Lighting.OutdoorAmbient = Color3.fromRGB(70, 62, 52)']);
  assert.deepEqual(byKind('hunk'), ['@@ -12,3 +12,4 @@', '@@']);
  assert.ok(lines.length >= 8, 'every diff line is its own line');
  const code = element(block, /<code\b/);
  assert.equal(text(code), ui.unifiedDiff(DIFF).replace(/\n/g, ''), 'the rendered diff is the diff, byte for byte (lines are blocks)');
});

test('added and removed lines differ by colour and tint in both themes, from tokens', () => {
  const css = readFileSync(join(SRC, 'components', 'ai-elements', 'code-block.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /\.tok--ins\s*\{[^}]*color:var\(--good\)/);
  assert.match(css, /\.tok--del\s*\{[^}]*color:var\(--bad\)/);
  assert.match(css, /\.ai-code-block__line:has\(> \.tok--ins\)\s*\{[^}]*var\(--good\)/);
  assert.match(css, /\.ai-code-block__line:has\(> \.tok--del\)\s*\{[^}]*var\(--bad\)/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, 'a raw colour in the code block sheet');
  // Both tokens exist in both themes, so the tint needs no per-theme correction.
  const system = readFileSync(join(SRC, 'design', 'system.css'), 'utf8');
  const light = system.slice(system.indexOf(":root[data-theme='light']"));
  const dark = system.slice(system.indexOf(':root {'), system.indexOf(":root[data-theme='light']"));
  for (const token of ['--good', '--bad']) {
    assert.match(dark, new RegExp(`${token}:#`), `${token} is not defined for the dark theme`);
    assert.match(light, new RegExp(`${token}:#`), `${token} is not defined for the light theme`);
  }
});

// -------------------------------------------------------------- 3. credits ---

test('the credits drawer lists each source credit as an AI Elements Source, open, with where it goes', () => {
  const qc = new ui.QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  qc.setQueryData(['attribution', 'p1'], {
    attribution: {
      projectId: 'p1', generatedAt: '2026-09-22T00:00:00Z', original: [], userGenerated: [], required: [], courtesy: [], unaccounted: [],
      sourceCredits: [
        { text: 'Powered by Poly Haven', url: 'https://polyhaven.com', when: 'live_api', why: 'asked by the source' },
        { text: 'Unsafe link credit', url: 'http://example.com', when: 'always', why: 'x' },
      ],
    },
    credits: 'Credits\n=======\n  - Powered by Poly Haven — https://polyhaven.com',
    commercialUse: { projectId: 'p1', checked: 0, findings: [] },
  });
  const html = render(ui.h(ui.QueryClientProvider, { client: qc }, ui.h(ui.CreditsPanel, { projectId: 'p1' })));
  const sources = element(html, /<div[^>]*class="[^"]*\bai-sources\b/);
  assert.ok(sources, 'the source credits are not an AI Elements Sources');
  assert.match(sources, /data-state="open"/, 'an obligation must be on the page, not behind a click');
  assert.match(text(element(sources, /<button/)), /^Used 1 source$/, 'the count, with the plural right');
  const link = element(sources, /<a\b/);
  assert.match(link, /href="https:\/\/polyhaven\.com\/"/);
  assert.match(text(link), /Powered by Poly Haven\s*polyhaven\.com/, 'the credit text and its host');
  assert.doesNotMatch(sources, /http:\/\/example\.com/, 'a link that is not https must not be clickable');
  assert.match(text(html), /Unsafe link credit/, 'but its obligation must still be on the page');
  assert.doesNotMatch(html, /aicss|InlineCitations/i);
});
