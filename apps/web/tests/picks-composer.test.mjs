// THE OWNER'S COMPOSER PICKS ARE IN THE PRODUCT, NOT BESIDE IT.
//
// Each pick the composer lane used is listed with the file that carries it, the name it is cited by
// there, and the line in the product surface (the composer) that mounts it. The model picker and its
// two picks (motion--variants, ae-model-selector) went with V3 gate G01: Apple is the only engine.
// The Plan | Agent switch and the Autonomous toggle went with G01 too (no mode selector), and with
// them their four picks: motion--radix-toggle-group, animate-ui--highlight, animate-ui--toggle and
// ui-layouts--button-rotating-gradient.
// Removing a mount, an import, or the hook that drives a behaviour turns this red. Comments are
// stripped before a mount is looked for, so a comment that names a removed control does not count.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const raw = (f) => readFileSync(new URL(`../src/components/${f}`, import.meta.url), 'utf8');
const code = (f) => raw(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\s*\/\/[^\n]*\n/g, '{\n');

const COMPOSER = code('ws/composer.tsx');

/** [pick id, file under components/, the name the file cites it by, [surface source, mount]...] */
const PICKS = [
  ['animate-ui--button', 'picks/composer/press-fx.ts', /Animate UI "Button"/, [[COMPOSER, /usePressFx\(panel\)/], [COMPOSER, /data-fx="press squish ripple spotlight lift"/]]],
  ['animate-ui--ripple-button', 'picks/composer/press-fx.ts', /Animate UI "Ripple/, [[COMPOSER, /data-fx="press ripple"/]]],
  ['motion--hover', 'picks/composer/press-fx.ts', /Motion "Hover"/, [[COMPOSER, /data-fx="[^"]*\blift\b[^"]*"/]]],
  ['motion--press', 'picks/composer/press-fx.ts', /Motion "Press"/, [[COMPOSER, /data-fx="[^"]*\bsquish\b[^"]*"/]]],
  ['ui-layouts--button-background-spotlight', 'picks/composer/press-fx.ts', /UI Layouts "Button Background Spotlight"/, [[COMPOSER, /data-fx="[^"]*\bspotlight\b[^"]*"/]]],
  ['ui-layouts--button-hover-2', 'picks/composer/composer-fx.css', /UI Layouts "Button Hover Right \(Expand\)"/, [[COMPOSER, /className="gx-send pk-send"/], [COMPOSER, /className="pk-send__label"/]]],
  ['componentry--magnetic-dock', 'picks/composer/magnetic-dock.ts', /Magnetic Dock/i, [[COMPOSER, /useMagneticDock\(tools\)/], [COMPOSER, /data-dock=""/]]],
  ['gsap--cssplugin', 'picks/composer/composer-fx.css', /GSAP "CSSPlugin"/, [[COMPOSER, /import '\.\.\/picks\/composer\/composer-fx\.css'/]]],
  ['motion--create-button', 'picks/composer/composer-fx.css', /Motion "Create Button"/, [[COMPOSER, /className="gx-menu gx-menu--create"/]]],
  ['motion--radix-tooltip', 'picks/composer/tip-group.tsx', /Motion's "Radix/, [[COMPOSER, /<TipGroup rootRef=\{panel\} \/>/], [COMPOSER, /data-tip=/]]],
  ['reactbits--border-glow', 'picks/composer/border-glow.tsx', /React Bits/, [[COMPOSER, /<BorderGlow hostRef=\{panel\} \/>/]]],
  ['animate-ui--typing-text', 'picks/composer/typing-placeholder.tsx', /Animate UI "Typing Text"/, [[COMPOSER, /<TypingPlaceholder\b/]]],
  ['reactbits--text-type', 'picks/composer/typing-placeholder.tsx', /React Bits "Text Type"/, [[COMPOSER, /<TypingPlaceholder\b/]]],
  ['gsap--utils-random', 'picks/composer/motion.ts', /gsap\.utils\.shuffle/, [[COMPOSER, /<TypingPlaceholder\b/], [COMPOSER, /<IdeaFolder\b/]]],
  ['reactbits--folder-float', 'picks/composer/idea-folder.tsx', /React Bits "Folder Float"/, [[COMPOSER, /<IdeaFolder onPick=\{insertPhrase\}/]]],
  ['gsap--inertia', 'picks/composer/idea-folder.tsx', /GSAP InertiaPlugin/, [[COMPOSER, /<IdeaFolder [^>]*dropTarget=\{box\}/]]],
  ['ui-layouts--multi-selector-default', 'picks/composer/file-picker.tsx', /"Multi Selector"/, [[COMPOSER, /<FilePicker projectId=\{projectId\} onAdd=\{insertFiles\}/]]],
  ['ui-layouts--file-upload-default', 'picks/composer/drop-hint.tsx', /"File Upload"/, [[COMPOSER, /<DropHint active=\{dropping\} \/>/]]],
  ['ui-layouts--chat-form-dropzone', 'picks/composer/drop-hint.tsx', /"File Upload Chat Form Dropzone"/, [[COMPOSER, /<DropHint active=\{dropping\} \/>/]]],
  ['animate-ui--sliding-number', 'picks/composer/credits-ring.tsx', /"Sliding Number"/, [[COMPOSER, /<SlidingNumber value=\{MESSAGE_MAX_CHARS - text\.length\} \/>/], [code('picks/composer/credits-ring.tsx'), /<SlidingNumber value=\{view\.allowanceRemaining\}/]]],
  ['ae-context', 'picks/composer/credits-ring.tsx', /meterView/, [[COMPOSER, /<CreditsRing \/>/], [code('picks/composer/credits-ring.tsx'), /<PromptInputHoverCard\b/]]],
  ['ae-speech-input', 'picks/composer/voice-input.tsx', /AI Elements "speech-input"/, [[COMPOSER, /<VoiceInput onText=\{insertPhrase\}/]]],
  ['reactbits--voice-pill', 'picks/composer/voice-input.tsx', /React Bits "Voice Pill"/, [[COMPOSER, /<VoiceInput\b/]]],
  ['ae-transcription', 'picks/composer/voice-input.tsx', /AI Elements "transcription"/, [[COMPOSER, /<VoiceInput\b/], [code('picks/composer/voice-input.tsx'), /className="pk-transcript" aria-live="polite"/]]],
  ['ae-mic-selector', 'picks/composer/voice-input.tsx', /AI Elements "mic-selector"/, [[COMPOSER, /<VoiceInput\b/], [code('picks/composer/voice-input.tsx'), /aria-label="Choose a microphone"/]]],
  ['ae-prompt-input-select-hovercard-tabs-command-actionaddscreenshot', 'ai-elements/prompt-input.tsx', /PromptInput/, [[COMPOSER, /<PromptInput\b/], [COMPOSER, /from '\.\.\/ai-elements\/prompt-input'/]]],
];

test('the lane list is not empty and names each pick once', () => {
  assert.ok(PICKS.length >= 25);
  assert.equal(new Set(PICKS.map(([id]) => id)).size, PICKS.length);
});

for (const [id, file, cite, mounts] of PICKS) {
  test(`${id} is carried by ${file} and mounted in the product`, () => {
    assert.ok(existsSync(new URL(`../src/components/${file}`, import.meta.url)), `${file} is missing`);
    assert.match(raw(file), cite, `${file} no longer says which pick it carries`);
    for (const [src, mount] of mounts) assert.match(src, mount, `${id}: the mount ${mount} is gone`);
  });
}

test('every pick component the composer draws is imported from its own file', () => {
  for (const [name, file] of [
    ['usePressFx', 'press-fx'], ['useMagneticDock', 'magnetic-dock'], ['TipGroup', 'tip-group'],
    ['BorderGlow', 'border-glow'], ['TypingPlaceholder', 'typing-placeholder'],
    ['DropHint', 'drop-hint'], ['SlidingNumber', 'sliding-number'], ['IdeaFolder', 'idea-folder'],
    ['FilePicker', 'file-picker'], ['CreditsRing', 'credits-ring'], ['VoiceInput', 'voice-input'],
  ]) {
    assert.match(COMPOSER, new RegExp(`import \\{ ${name} \\} from '\\.\\./picks/composer/${file}'`), `${name} is not imported`);
  }
});

test('the sheet the composer imports holds the behaviours it claims', () => {
  const fx = raw('picks/composer/composer-fx.css');
  assert.match(fx, /\.gx-menu--create[^{]*\{[^}]*animation:pk-create-in/);
  assert.match(fx, /\[data-dock\]\s*\{[^}]*--pk-dock/);
  assert.match(fx, /@media \(prefers-reduced-motion: ?reduce\)/);
});

test('no mode switch or Autonomous toggle is drawn, and no violet is spent (V3 G01)', () => {
  assert.doesNotMatch(COMPOSER, /ModeSwitch|gx-autonomous|autonomous/i);
  assert.equal(existsSync(new URL('../src/components/picks/composer/mode-switch.tsx', import.meta.url)), false);
  assert.doesNotMatch(raw('picks/composer/composer-fx.css'), /--autonomous/);
});
