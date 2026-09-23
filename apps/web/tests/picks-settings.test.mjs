/**
 * THE OWNER'S PICKED ACCOUNT-SCREEN COMPONENTS ARE IN THE PRODUCT, NOT BESIDE IT.
 *
 * The settings lane (Settings, Usage, Projects, sign-in, the tour, pairing and the key panels) took
 * 33 of the owner's picks. Each one lives in src/components/picks/settings/ — and a component there
 * that no screen imports is a demo, which is the failure this file exists to catch. For every pick it
 * checks the SURFACE file, not the component: the import is there, and the component (or its class)
 * is actually rendered. Removing any one mount fails the row that names it.
 *
 * The sources are read with comments stripped, so a pick mentioned only in a comment does not count
 * as mounted.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const strip = (s) =>
  s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const read = (rel) => strip(readFileSync(join(SRC, rel), 'utf8'));

const P = 'components/picks/settings';

/**
 * [pick id, surface file, what must be imported there, what must be rendered there].
 * `imp` is matched against the import statements; `use` against the whole stripped source.
 */
const MOUNTS = [
  // Settings
  ['animate-ui--switch', 'routes/settings.tsx', /import \{ Switch \} from '\.\.\/components\/picks\/settings\/switch'/, /<Switch\b/],
  ['motion--radix-switch', 'components/api-keys-panel.tsx', /import \{ Switch \} from '\.\/picks\/settings\/switch'/, /<Switch\b/],
  ['motion--radix-select', 'routes/settings.tsx', /import \{ Select \} from '\.\.\/components\/picks\/settings\/select'/, /<Select\b[\s\S]*?name="notifyDigest"/],
  ['ui-layouts--motion-number-slider', 'routes/settings.tsx', /import \{ NumberSlider \}/, /<NumberSlider\b/],
  ['motion--clerk-conditional-field', 'routes/settings.tsx', /import \{ ConditionalField \}/, /<ConditionalField open=\{delivery\.digest === 'daily'\}/],
  ['motion--radix-radio-group', 'routes/settings.tsx', /import \{ RadioMark \}/, /<RadioMark on=/],
  ['ui-layouts--liquid-glass-sidebar-menu', 'routes/settings.tsx', /import \{ GlideIndicator \}/, /<GlideIndicator[^>]*variant="glass"/],
  ['ui-layouts--multi-layout-accordion', 'routes/settings.tsx', /import \{ Accordion \}/, /<Accordion\b/],
  ['animate-ui--theme-toggler', 'routes/settings.tsx', /import \{ withThemeWipe \}/, /withThemeWipe\(\(\) => setPref\('appearance'/],
  ['ui-layouts--button-hover-12', 'routes/settings.tsx', /import '\.\.\/components\/picks\/settings\/account-buttons\.css'/, /./],
  ['reactbits--code-slots', 'routes/settings.tsx', /import \{ CodeSlots \}/, /<CodeSlots\b[\s\S]*?name="totpCode"/],
  ['ui-layouts--pass-strength-hover-indicator', 'routes/settings.tsx', /import \{ PasswordInput \}/, /<PasswordInput\b[^>]*\bstrength\b/],
  ['motion--hold-to-confirm', 'routes/settings.tsx', /import \{ ConfirmDialog \}/, /hold=\{pending === 'delete-account'\}/],
  ['reactbits--hold-button', 'components/confirm-dialog.tsx', /import \{ HoldButton \} from '\.\/picks\/settings\/hold-button'/, /<HoldButton\b/],
  ['animate-ui--alert-dialog', 'components/confirm-dialog.tsx', /import \{ Modal \} from '\.\/modal'/, /alert=\{tone === 'danger'\}/],
  ['motion--modal-dialog', 'components/modal.tsx', /import \{ reducedMotion, spring \} from '\.\/picks\/settings\/motion'/, /panel\.animate\(/],
  ['aicss-data-table', 'components/model-keys-panel.tsx', /import \{ FreeModelsTable \} from '\.\/picks\/settings\/free-models-table'/, /<FreeModelsTable\b/],
  ['motion--radix-checkbox', 'components/api-keys-panel.tsx', /import \{ Checkbox \}/, /<Checkbox\b/],
  ['ui-layouts--motion-number-input', 'components/api-keys-panel.tsx', /import \{ NumberInput \}/, /<NumberInput\b/],
  ['reactbits--decrypted-text', 'components/api-keys-panel.tsx', /import \{ DecryptedText \}/, /<DecryptedText text=\{revealed\.key\}/],
  ['reactbits--bell-toggle', 'components/notification-inbox.tsx', /import '\.\/picks\/settings\/bell-ring\.css'/, /className=\{`pk-bell\$\{ring > 0 \? ' is-ringing' : ''\}`\}/],
  ['motion--clerk-user-button', 'components/notification-inbox.tsx', /import '\.\/picks\/settings\/user-button\.css'/, /./],
  // Usage
  ['gsap--attrplugin', 'routes/usage.tsx', /import \{ useTweenedNumber \}/, /useTweenedNumber\(remaining/],
  ['motion--line-graph', 'routes/usage.tsx', /import \{ LineGraph \}/, /<LineGraph\b/],
  ['componentry--github-calendar', 'routes/usage.tsx', /import \{ ActivityCalendar \}/, /<ActivityCalendar\b/],
  ['motion--section-stats-live-panel', 'routes/usage.tsx', /import \{ LiveStats \}/, /<LiveStats\b/],
  ['reactbits--gooey-nav', 'routes/usage.tsx', /import \{ GlideIndicator \}/, /<GlideIndicator[^>]*variant="goo"/],
  // Projects
  ['ui-layouts--tags-input', 'routes/dashboard.tsx', /import \{ TagsInput \}/, /<TagsInput\b/],
  // Sign-in, onboarding and pairing
  ['ui-layouts--showhide-pass', 'routes/auth-pages.tsx', /import \{ PasswordInput \}/, /<PasswordInput\b/],
  ['motion--clerk-sign-in-or-up', 'routes/auth-pages.tsx', /import \{ MorphCard \}/, /<MorphCard stage=/],
  ['reactbits--orb', 'routes/auth-pages.tsx', /import \{ Orb \}/, /<Orb \/>/],
  ['reactbits--stepper', 'components/onboarding-tour.tsx', /import \{ StepDots, StepSlide \}/, /<StepDots\b[\s\S]*<StepSlide\b/],
  ['motion--pokopia-modal', 'components/onboarding-tour.tsx', /import '\.\/picks\/settings\/pop-in\.css'/, /tour-card pk-pop/],
];

test('every pick of the lane is listed exactly once', () => {
  const ids = MOUNTS.map((m) => m[0]);
  assert.equal(new Set(ids).size, ids.length, 'a pick is listed twice');
  assert.equal(ids.length, 33, `the settings lane has 33 picks; this table lists ${ids.length}`);
});

for (const [id, file, imp, use] of MOUNTS) {
  test(`${id} is imported and rendered in ${file}`, () => {
    const src = read(file);
    const imports = src.match(/^import[\s\S]*?;$/gm)?.join('\n') ?? '';
    assert.match(imports, imp, `${file} no longer imports the ${id} pick`);
    assert.match(src, use, `${file} imports ${id} but does not render it`);
  });
}

test('the second surfaces of the shared picks are mounted too', () => {
  const also = [
    ['routes/dashboard.tsx', /<GlideIndicator[^>]*variant="goo"/, 'Projects scope tabs (gooey nav)'],
    ['routes/dashboard.tsx', /\bhold\b\s*\n?\s*onConfirm=\{\(\) => del\.mutate\(\)\}/, 'project delete is a hold'],
    ['routes/auth-pages.tsx', /<CodeSlots\b[\s\S]*?name="totpCode"/, 'the sign-in six-digit step'],
    ['routes/auth-pages.tsx', /<ThemeToggler \/>/, 'the sign-in theme corner'],
    ['components/reauth-dialog.tsx', /<PasswordInput\b/, 'the re-auth password'],
    ['components/roblox-key-panel.tsx', /<RadioCards\b[\s\S]*?name="rk-creator-type"/, 'Roblox key: acting as'],
    ['components/roblox-key-panel.tsx', /<Checkbox\b/, 'Roblox key scopes'],
    ['components/api-keys-panel.tsx', /<RadioCards\b[\s\S]*?name="ak-mode"/, 'API key kind'],
    ['components/api-keys-panel.tsx', /<ConditionalField open=\{expires\}/, 'API key expiry'],
    ['components/api-keys-panel.tsx', /<HoldButton\b[\s\S]*?label="Hold to revoke"/, 'API key revoke is a hold'],
    ['components/pairing-dialog.tsx', /<DecryptedText text=\{pairing\.code\}/, 'the pairing code decodes'],
    ['components/pairing-dialog.tsx', /pairing-success pk-pop/, 'Studio connected pops'],
    ['routes/usage.tsx', /import '\.\.\/components\/picks\/settings\/account-buttons\.css'/, 'Usage buttons'],
    ['routes/dashboard.tsx', /import '\.\.\/components\/picks\/settings\/account-buttons\.css'/, 'Projects buttons'],
    ['components/modal.tsx', /role=\{alert \? 'alertdialog' : 'dialog'\}/, 'alert dialogs are announced as alerts'],
  ];
  for (const [file, re, what] of also) assert.match(read(file), re, `${what}: missing from ${file}`);
});

test('the header built for the account menu exists, for the one-line mount in layout.tsx', () => {
  // components/layout.tsx belongs to another lane; the header is built and waiting there.
  const header = read(`${P}/user-button.tsx`);
  assert.match(header, /export function AccountMenuHeader/);
  assert.match(header, /meterView\(/, 'its Credits line reads the shared meter model, not its own sum');
});

test('every pick sheet respects reduced motion', () => {
  const sheets = ['switch', 'checkbox', 'radio-group', 'glide-indicator', 'bell-ring', 'user-button', 'pop-in', 'account-buttons'];
  for (const name of sheets) {
    const path = join(SRC, P, `${name}.css`);
    assert.ok(existsSync(path), `${name}.css is missing`);
    const css = readFileSync(path, 'utf8');
    assert.match(css, /prefers-reduced-motion: reduce/, `${name}.css ignores reduced motion`);
  }
});
